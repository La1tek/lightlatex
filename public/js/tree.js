class FileTree {
  constructor(container, options = {}) {
    this.container = container;
    this.onSelect = options.onSelect || (() => {});
    this.onCreate = options.onCreate || (() => {});
    this.onDelete = options.onDelete || (() => {});
    this.projectId = options.projectId || null;
    this.files = [];
    this.selectedPath = null;
  }

  setFiles(files) {
    this.files = files;
    this.render();
  }

  selectFile(path) {
    this.selectedPath = path;
    this.render();
  }

  render() {
    const tree = this.buildTree(this.files);
    this.container.innerHTML = '';
    this.renderTree(tree, this.container, 0);
  }

  buildTree(files) {
    const root = { name: '/', children: {}, file: null };
    for (const f of files) {
      const parts = f.path.split('/');
      let node = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i === parts.length - 1) {
          node.children[part] = { name: part, children: {}, file: f };
        } else {
          if (!node.children[part]) {
            node.children[part] = { name: part, children: {}, file: null };
          }
          node = node.children[part];
        }
      }
    }
    return root;
  }

  getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    switch (ext) {
      case 'tex': return Icons.fileTex;
      case 'bib': return Icons.fileBib;
      case 'sty': return Icons.fileSty;
      case 'pdf': return Icons.filePdf;
      case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': return Icons.fileImage;
      default: return Icons.file;
    }
  }

  renderTree(node, parent, depth) {
    const entries = Object.entries(node.children).sort(([aName, aNode], [bName, bNode]) => {
      if (aNode.file && !bNode.file) return 1;
      if (!aNode.file && bNode.file) return -1;
      return aName.localeCompare(bName);
    });

    for (const [name, child] of entries) {
      const el = document.createElement('div');
      el.className = 'tree-item' + (child.file && child.file.path === this.selectedPath ? ' active' : '');

      let indent = '';
      for (let i = 0; i < depth; i++) indent += '<span class="tree-indent"></span>';

      if (child.file) {
        const ext = name.split('.').pop().toLowerCase();
        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext);
        const icon = this.getFileIcon(name);

        el.innerHTML = `${indent}<span class="icon">${icon}</span><span class="name">${name}</span>
          <span class="file-actions">
            <button title="Delete" data-delete="${child.file.path}">${Icons.trash14}</button>
          </span>`;

        // Thumbnail for images
        if (isImage && this.projectId) {
          const thumb = document.createElement('img');
          thumb.className = 'file-thumbnail';
          thumb.src = `/api/projects/${this.projectId}/files/${child.file.path}`;
          thumb.loading = 'lazy';
          thumb.onerror = () => thumb.remove();
          el.appendChild(thumb);
        }

        el.addEventListener('click', (e) => {
          if (e.target.closest('[data-delete]')) {
            this.onDelete(e.target.closest('[data-delete]').dataset.delete);
            return;
          }
          this.selectedPath = child.file.path;
          this.render();
          this.onSelect(child.file.path);
        });
      } else {
        el.classList.add('folder');
        el.innerHTML = `${indent}<span class="icon">${Icons.folderOpen}</span><span class="name">${name}/</span>`;
      }

      parent.appendChild(el);

      if (!child.file) {
        this.renderTree(child, parent, depth + 1);
      }
    }
  }
}
