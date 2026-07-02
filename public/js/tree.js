class FileTree {
  constructor(container, options = {}) {
    this.container = container;
    this.onSelect = options.onSelect || (() => {});
    this.onCreate = options.onCreate || (() => {});
    this.onDelete = options.onDelete || (() => {});
    this.onRename = options.onRename || (() => {});
    this.projectId = options.projectId || null;
    this.files = [];
    this.hashes = new Map();
    this.devMode = options.devMode || false;
    this.selectedPath = null;
  }

  setFiles(files) {
    this.files = files;
    this.render();
  }

  setHashes(hashes) {
    this.hashes = new Map((hashes || []).map((item) => [item.path, item.hash]));
    this.render();
  }

  setDevMode(enabled) {
    this.devMode = Boolean(enabled);
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

  buildPath(folderNode, allFiles) {
    const folderName = folderNode.name;
    for (const f of allFiles) {
      if (f.path.includes(folderName + '/')) {
        const parts = f.path.split('/');
        const idx = parts.indexOf(folderName);
        if (idx >= 0) {
          return parts.slice(0, idx + 1).join('/');
        }
      }
    }
    return folderName;
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

  escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

        const safePath = this.escapeHtml(child.file.path);
        const safeName = this.escapeHtml(name);
        const hash = this.hashes.get(child.file.path);
        const hashTitle = hash ? ` title="${safePath} · sha256 ${this.escapeHtml(hash)}"` : ` title="${safePath}"`;
        el.innerHTML = `${indent}<span class="icon">${icon}</span><span class="name"${hashTitle}>${safeName}</span>
          ${this.devMode && hash ? `<span class="file-hash" title="sha256 ${this.escapeHtml(hash)}">${this.escapeHtml(hash.slice(0, 7))}</span>` : ''}
          <span class="file-actions">
            <button title="Rename" aria-label="Rename ${safePath}" data-rename="${safePath}">${Icons.settings}</button>
            <button title="Delete" aria-label="Delete ${safePath}" data-delete="${safePath}">${Icons.trash14}</button>
          </span>`;

        // Drag & drop support
        el.draggable = true;
        el.dataset.path = child.file.path;
        el.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', child.file.path);
          e.dataTransfer.effectAllowed = 'move';
          el.style.opacity = '0.5';
        });
        el.addEventListener('dragend', () => { el.style.opacity = '1'; });
        el.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.style.background = 'var(--accent)'; });
        el.addEventListener('dragleave', () => { el.style.background = ''; });
        el.addEventListener('drop', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          el.style.background = '';
          const oldPath = e.dataTransfer.getData('text/plain');
          const targetPath = child.file.path;
          if (oldPath === targetPath) return;
          // Drop into folder: construct new path
          const lastSlash = targetPath.lastIndexOf('/');
          const dir = lastSlash >= 0 ? targetPath.substring(0, lastSlash + 1) : '';
          const fileName = oldPath.split('/').pop();
          const newPath = dir + fileName;
          if (this.onRename) this.onRename(oldPath, newPath);
        });

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
          if (e.target.closest('[data-rename]')) {
            this.onRename(e.target.closest('[data-rename]').dataset.rename);
            return;
          }
          this.selectedPath = child.file.path;
          this.render();
          this.onSelect(child.file.path);
        });
      } else {
        el.classList.add('folder');
        el.innerHTML = `${indent}<span class="icon">${Icons.folderOpen}</span><span class="name">${this.escapeHtml(name)}/</span>`;
        // Drop on folders
        el.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.style.background = 'var(--accent)'; });
        el.addEventListener('dragleave', () => { el.style.background = ''; });
        el.addEventListener('drop', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          el.style.background = '';
          const oldPath = e.dataTransfer.getData('text/plain');
          const fileName = oldPath.split('/').pop();
          // Build folder path from tree
          const folderPath = this.buildPath(child, this.files);
          const newPath = folderPath ? folderPath + '/' + fileName : fileName;
          if (this.onRename) this.onRename(oldPath, newPath);
        });
      }

      parent.appendChild(el);

      if (!child.file) {
        this.renderTree(child, parent, depth + 1);
      }
    }
  }
}
