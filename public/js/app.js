const App = {
  currentProjectId: null,
  fileTree: null,
  projectFiles: [],
  isCompiling: false,
  previewVisible: true,

  async init() {
    // Theme from localStorage
    const theme = localStorage.getItem('theme') || 'dark';
    document.documentElement.dataset.theme = theme;

    // Hash routing
    window.addEventListener('hashchange', () => this.route());
    this.route();
  },

  route() {
    const hash = window.location.hash.slice(1) || '/';
    const app = document.getElementById('app');

    if (hash.startsWith('/project/')) {
      const projectId = hash.split('/')[2];
      this.showEditor(app, projectId);
    } else if (!api.isAuthenticated) {
      Auth.render(app);
    } else {
      this.showDashboard(app);
    }
  },

  // ===== Dashboard =====
  async showDashboard(container) {
    container.innerHTML = `
      <div class="dashboard">
        <div class="dashboard-header">
          <h1>📝 LightTeX</h1>
          <div class="dashboard-header-actions">
            <button class="btn btn-secondary" id="toggle-theme-btn" title="Toggle theme">🌙</button>
            <button class="btn btn-secondary" id="new-project-btn">+ New Project</button>
            <button class="btn btn-secondary" id="logout-btn">Logout</button>
          </div>
        </div>
        <div class="dashboard-content" id="projects-list">
          <div class="empty-state">
            <div class="icon">📝</div>
            <p>Loading projects...</p>
          </div>
        </div>
      </div>
    `;

    document.getElementById('toggle-theme-btn').addEventListener('click', () => this.toggleTheme());
    document.getElementById('logout-btn').addEventListener('click', () => {
      api.clearTokens();
      window.location.hash = '#/login';
    });
    document.getElementById('new-project-btn').addEventListener('click', () => this.showNewProjectModal());

    try {
      const projects = await api.get('/projects');
      const list = document.getElementById('projects-list');

      if (projects.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="icon">📂</div>
            <p>No projects yet. Create your first one!</p>
          </div>
        `;
        return;
      }

      list.innerHTML = `<div class="project-grid" id="project-grid"></div>`;
      const grid = document.getElementById('project-grid');

      for (const p of projects) {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.innerHTML = `
          <h3>${this.escapeHtml(p.name)}</h3>
          <div class="desc">${this.escapeHtml(p.description || 'No description')}</div>
          <div class="meta">
            <span>🔧 ${p.compiler}</span>
            <span>${new Date(p.updatedAt).toLocaleDateString()}</span>
          </div>
          <div class="actions">
            <button class="btn btn-secondary btn-small" data-open="${p.id}">Open</button>
            <button class="btn btn-danger btn-small" data-delete="${p.id}">Delete</button>
          </div>
        `;
        card.querySelector('[data-open]').addEventListener('click', (e) => {
          e.stopPropagation();
          window.location.hash = `#/project/${p.id}`;
        });
        card.querySelector('[data-delete]').addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm('Delete this project and all its files?')) {
            await api.del(`/projects/${p.id}`);
            this.showDashboard(container);
          }
        });
        card.addEventListener('click', () => {
          window.location.hash = `#/project/${p.id}`;
        });
        grid.appendChild(card);
      }
    } catch (err) {
      document.getElementById('projects-list').innerHTML = `
        <div class="empty-state">
          <div class="icon">❌</div>
          <p>Failed to load projects: ${this.escapeHtml(err.message)}</p>
        </div>
      `;
    }
  },

  showNewProjectModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2>New Project</h2>
        <div class="form-group">
          <label>Project Name</label>
          <input type="text" id="new-project-name" placeholder="My Paper" autofocus>
        </div>
        <div class="form-group">
          <label>Description (optional)</label>
          <input type="text" id="new-project-desc" placeholder="A brief description">
        </div>
        <div class="form-group">
          <label>Compiler</label>
          <select id="new-project-compiler">
            <option value="pdflatex">pdflatex</option>
            <option value="xelatex">xelatex</option>
            <option value="lualatex">lualatex</option>
          </select>
        </div>
        <div class="form-group">
          <label>Template</label>
          <div class="template-selector">
            <div class="template-option selected" data-template="">
              <span class="icon">📄</span>Empty
            </div>
            <div class="template-option" data-template="article">
              <span class="icon">📰</span>Article
            </div>
            <div class="template-option" data-template="book">
              <span class="icon">📕</span>Book
            </div>
            <div class="template-option" data-template="beamer">
              <span class="icon">📊</span>Beamer
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="modal-create" style="width:auto">Create</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    let selectedTemplate = '';
    overlay.querySelectorAll('.template-option').forEach(el => {
      el.addEventListener('click', () => {
        overlay.querySelectorAll('.template-option').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
        selectedTemplate = el.dataset.template;
      });
    });

    overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#modal-create').addEventListener('click', async () => {
      const name = document.getElementById('new-project-name').value.trim();
      if (!name) return;

      try {
        const project = await api.post('/projects', {
          name,
          description: document.getElementById('new-project-desc').value.trim(),
          compiler: document.getElementById('new-project-compiler').value,
          template: selectedTemplate || undefined,
        });
        overlay.remove();
        window.location.hash = `#/project/${project.id}`;
      } catch (err) {
        alert('Failed to create project: ' + err.message);
      }
    });

    document.getElementById('new-project-name').focus();
  },

  // ===== Editor =====
  async showEditor(container, projectId) {
    this.currentProjectId = projectId;
    Editor.dispose();
    Preview.clear();

    container.innerHTML = `
      <div class="editor-layout">
        <div class="editor-toolbar">
          <div class="editor-toolbar-left">
            <a href="#/" class="btn-icon" title="Back to dashboard">⬅</a>
            <span class="project-name" id="editor-project-name">Loading...</span>
          </div>
          <div class="editor-toolbar-center">
            <span class="compile-status" id="compile-status"></span>
          </div>
          <div class="editor-toolbar-right">
            <button class="btn btn-secondary btn-small" id="compile-btn" title="Ctrl+S">▶ Compile</button>
            <button class="btn btn-secondary btn-small" id="download-btn" title="Download ZIP">⬇ Download</button>
            <button class="btn btn-secondary btn-small" id="toggle-preview-btn">👁 Preview</button>
            <button class="btn btn-secondary btn-small" id="toggle-theme-btn" title="Toggle theme">🌙</button>
            <button class="btn btn-secondary btn-small" id="editor-logout-btn">Logout</button>
          </div>
        </div>
        <div class="editor-main">
          <div class="sidebar">
            <div class="sidebar-header">
              <span>FILES</span>
              <button id="new-file-btn" title="New file">+</button>
            </div>
            <div class="tree-container" id="file-tree"></div>
          </div>
          <div class="editor-pane">
            <div class="editor-container" id="monaco-editor"></div>
          </div>
          <div class="preview-pane" id="preview-pane">
            <div class="preview-header">
              <span id="pdf-page-info">PDF Preview</span>
              <div>
                <button class="btn-icon" id="pdf-prev">◀</button>
                <span id="pdf-page-num"></span>
                <button class="btn-icon" id="pdf-next">▶</button>
              </div>
            </div>
            <div class="preview-container" id="preview-container">
              <div class="preview-placeholder">No PDF yet. Compile your project (Ctrl+S).</div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Load project data
    let project;
    try {
      project = await api.get(`/projects/${projectId}`);
      document.getElementById('editor-project-name').textContent = project.name;
    } catch {
      container.innerHTML = '<div class="empty-state"><div class="icon">❌</div><p>Project not found</p></div>';
      return;
    }

    // Load files
    try {
      this.projectFiles = await api.get(`/projects/${projectId}/files`);
    } catch {
      this.projectFiles = [];
    }

    // Init file tree
    this.fileTree = new FileTree(document.getElementById('file-tree'), {
      onSelect: (path) => this.openFile(path),
      onCreate: () => this.promptNewFile(),
      onDelete: (path) => this.deleteFile(path),
    });
    this.fileTree.setFiles(this.projectFiles);

    // Select main file
    if (project.mainFile && this.projectFiles.some(f => f.path === project.mainFile)) {
      this.openFile(project.mainFile);
    } else if (this.projectFiles.length > 0) {
      this.openFile(this.projectFiles[0].path);
    }

    // Init Monaco
    const editorEl = document.getElementById('monaco-editor');
    Editor.init(editorEl, {
      value: '% Loading...',
      onReady: () => {
        // Re-open file after editor is ready
        if (this.fileTree.selectedPath) {
          this.openFile(this.fileTree.selectedPath);
        }
      },
      onCompile: () => this.compile(),
    });

    // Init preview
    const previewContainer = document.getElementById('preview-container');
    const canvas = document.createElement('canvas');
    canvas.id = 'pdf-canvas';
    previewContainer.innerHTML = '';
    previewContainer.appendChild(canvas);
    Preview.init(canvas);

    // Load existing PDF
    this.loadPdf();

    // Event handlers
    document.getElementById('compile-btn').addEventListener('click', () => this.compile());
    document.getElementById('download-btn').addEventListener('click', () => this.downloadProject());
    document.getElementById('toggle-preview-btn').addEventListener('click', () => this.togglePreview());
    document.getElementById('toggle-theme-btn').addEventListener('click', () => this.toggleTheme());
    document.getElementById('editor-logout-btn').addEventListener('click', () => {
      api.clearTokens();
      window.location.hash = '#/login';
    });
    document.getElementById('new-file-btn').addEventListener('click', () => this.promptNewFile());
    document.getElementById('pdf-prev').addEventListener('click', () => { Preview.prevPage(); this.updatePdfPageInfo(); });
    document.getElementById('pdf-next').addEventListener('click', () => { Preview.nextPage(); this.updatePdfPageInfo(); });

    // Update project title on rename
    const nameEl = document.getElementById('editor-project-name');
    nameEl.contentEditable = true;
    nameEl.addEventListener('blur', async () => {
      const newName = nameEl.textContent.trim();
      if (newName && newName !== project.name) {
        try {
          await api.put(`/projects/${projectId}`, { name: newName });
          project.name = newName;
        } catch {
          nameEl.textContent = project.name;
        }
      }
    });
    nameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
    });
  },

  async openFile(path) {
    try {
      const content = await fetch(`/api/projects/${this.currentProjectId}/files/${path}`, {
        headers: { 'Authorization': `Bearer ${api.token}` },
      }).then(r => r.text());

      Editor.setContext(this.currentProjectId, path);
      Editor.setValue(content);
      this.fileTree.selectFile(path);
      Editor.setCompileErrors([], path);
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  },

  async promptNewFile() {
    const path = prompt('Enter file path (e.g., chapters/intro.tex):');
    if (!path || !path.trim()) return;
    const filePath = path.trim();

    if (this.projectFiles.some(f => f.path === filePath)) {
      alert('File already exists');
      return;
    }

    try {
      const file = await api.post(`/projects/${this.currentProjectId}/files`, {
        path: filePath,
        content: `\\input{${filePath.replace(/^.*\//, '').replace('.tex', '')}}`,
      });
      this.projectFiles.push(file);
      this.fileTree.setFiles(this.projectFiles);
      this.openFile(filePath);
    } catch (err) {
      alert('Failed to create file: ' + err.message);
    }
  },

  async deleteFile(path) {
    if (!confirm(`Delete "${path}"?`)) return;

    try {
      await api.del(`/projects/${this.currentProjectId}/files/${path}`);
      this.projectFiles = this.projectFiles.filter(f => f.path !== path);
      this.fileTree.setFiles(this.projectFiles);

      if (this.fileTree.selectedPath === path) {
        if (this.projectFiles.length > 0) {
          this.openFile(this.projectFiles[0].path);
        } else {
          Editor.setValue('');
          Editor.setContext(null, null);
        }
      }
    } catch (err) {
      alert('Failed to delete file: ' + err.message);
    }
  },

  async compile() {
    if (this.isCompiling) return;
    this.isCompiling = true;

    const statusEl = document.getElementById('compile-status');
    statusEl.textContent = '⏳ Compiling...';
    statusEl.className = 'compile-status compiling';

    try {
      // Save current file first
      if (Editor.currentFilePath) {
        await Editor.autosave();
      }

      const result = await api.post(`/projects/${this.currentProjectId}/compile`);

      if (result.success && result.pdfGenerated) {
        statusEl.textContent = '✅ Compiled';
        statusEl.className = 'compile-status success';
        this.loadPdf();
        this.notify('Compilation successful!', 'success');
      } else {
        statusEl.textContent = `❌ ${result.errors.length} error(s)`;
        statusEl.className = 'compile-status error';
        if (result.errors.length > 0) {
          Editor.setCompileErrors(result.errors, Editor.currentFilePath);
          const msgs = result.errors.slice(0, 5).map(e => `Line ${e.line}: ${e.message}`).join('\n');
          this.notify('Compilation failed:\n' + msgs, 'error');
        } else {
          this.notify('Compilation failed', 'error');
        }
      }

      // Reload file list
      this.projectFiles = await api.get(`/projects/${this.currentProjectId}/files`);
      this.fileTree.setFiles(this.projectFiles);
    } catch (err) {
      statusEl.textContent = '❌ Error';
      statusEl.className = 'compile-status error';
      this.notify('Compilation error: ' + err.message, 'error');
    } finally {
      this.isCompiling = false;
    }
  },

  async loadPdf() {
    try {
      await Preview.loadPdf(this.currentProjectId);
      this.updatePdfPageInfo();
    } catch {
      // No PDF yet
    }
  },

  updatePdfPageInfo() {
    const info = document.getElementById('pdf-page-info');
    const num = document.getElementById('pdf-page-num');
    if (info && num) {
      const total = pdfDoc ? pdfDoc.numPages : 0;
      const current = total > 0 ? currentPage : 0;
      info.textContent = total > 0 ? `PDF Preview` : 'PDF Preview';
      num.textContent = total > 0 ? `${current} / ${total}` : '';
    }
  },

  togglePreview() {
    this.previewVisible = !this.previewVisible;
    const pane = document.getElementById('preview-pane');
    if (pane) {
      pane.classList.toggle('hidden', !this.previewVisible);
    }
  },

  async downloadProject() {
    try {
      const blob = await api.download(`/projects/${this.currentProjectId}/download`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'project.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      this.notify('Download failed: ' + err.message, 'error');
    }
  },

  toggleTheme() {
    const current = document.documentElement.dataset.theme;
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
    Editor.setTheme(next);
    const btn = document.querySelector('#toggle-theme-btn');
    if (btn) btn.textContent = next === 'dark' ? '🌙' : '☀️';
  },

  notify(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `notification ${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s';
      setTimeout(() => el.remove(), 300);
    }, 4000);
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
