class FileTree {
  constructor(container, options = {}) {
    this.container = container;
    this.onSelect = options.onSelect || (() => {});
    this.onCreate = options.onCreate || (() => {});
    this.onDelete = options.onDelete || (() => {});
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

  renderTree(node, parent, depth) {
    // Sort: folders first, then files, alphabetically
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
        let icon = '📄';
        if (ext === 'tex') icon = '📝';
        else if (ext === 'bib') icon = '📚';
        else if (ext === 'sty') icon = '⚙️';
        else if (ext === 'pdf') icon = '📄';

        el.innerHTML = `${indent}<span class="icon">${icon}</span><span class="name">${name}</span>
          <span class="file-actions">
            <button title="Delete" data-delete="${child.file.path}">🗑️</button>
          </span>`;

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
        el.innerHTML = `${indent}<span class="icon">📁</span><span class="name">${name}/</span>`;
      }

      parent.appendChild(el);

      if (!child.file) {
        this.renderTree(child, parent, depth + 1);
      }
    }
  }
}
