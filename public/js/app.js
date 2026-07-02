const App = {
  currentProjectId: null,
  fileTree: null,
  projectFiles: [],
  isCompiling: false,
  previewVisible: true,
  imageFiles: [],
  lastCompileErrors: [],
  compileLog: '',
  currentProject: null,
  logsPanelVisible: false,

  async init() {
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.dataset.theme = theme;

    window.addEventListener('hashchange', () => this.route());
    this.route();
  },

  route() {
    const hash = window.location.hash.slice(1) || '/';
    const app = document.getElementById('app');

    if (window.location.pathname === '/admin' || hash.startsWith('/admin')) {
      if (!api.isAuthenticated) {
        Auth.render(app);
      } else {
        Admin.init();
      }
    } else if (hash.startsWith('/project/')) {
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
    const currentTheme = document.documentElement.dataset.theme;

    container.innerHTML = `
      <div class="dashboard" id="dashboard-drop-zone">
        <div class="dashboard-header">
          <h1 class="brand">${Icons.logo} LightTeX</h1>
          <div class="dashboard-header-actions">
            <button class="btn-icon" id="toggle-theme-btn" title="Toggle theme" aria-label="Toggle theme">${currentTheme === 'dark' ? Icons.moon16 : Icons.sun16}</button>
            <button class="btn btn-secondary" id="new-project-btn">${Icons.plus16} New project</button>
            <button class="btn-icon" id="logout-btn" title="Logout" aria-label="Logout">${Icons.logout16}</button>
          </div>
        </div>
        <main class="dashboard-content">
          <section class="dashboard-hero">
            <div class="dashboard-title-row">
              <div>
                <h2>Projects</h2>
                <p>Recent LaTeX workspaces, templates, compilers, and zip imports.</p>
              </div>
              <div class="import-hint">${Icons.upload16} Drop a .zip anywhere to import a project</div>
            </div>
            <div class="dashboard-tools">
              <label class="dashboard-search" aria-label="Search projects">
                ${Icons.search16}
                <input id="project-search" type="search" placeholder="Search projects, descriptions, compilers...">
              </label>
              <div class="segmented-control" aria-label="Project view">
                <button class="active" id="grid-view-btn" type="button">Grid</button>
                <button id="list-view-btn" type="button">List</button>
              </div>
            </div>
          </section>
          <div id="projects-list">
            <div class="empty-state">
              <div class="icon">${Icons.clock}</div>
              <p>Loading projects...</p>
            </div>
          </div>
        </main>
      </div>
    `;

    document.getElementById('toggle-theme-btn').addEventListener('click', () => this.toggleTheme());
    document.getElementById('logout-btn').addEventListener('click', () => {
      api.clearTokens();
      window.location.hash = '#/login';
    });
    document.getElementById('new-project-btn').addEventListener('click', () => this.showNewProjectModal());


    // Drag & drop ZIP on dashboard for import
    const dz = document.getElementById('dashboard-drop-zone');
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.style.outline = '3px dashed var(--accent)'; });
    dz.addEventListener('dragleave', () => { dz.style.outline = ''; });
    dz.addEventListener('drop', async (e) => {
      e.preventDefault();
      dz.style.outline = '';
      const file = e.dataTransfer.files[0];
      if (!file || !file.name.endsWith('.zip')) {
        this.notify('Only .zip files supported for drag-drop import', 'error');
        return;
      }
      try {
        const name = file.name.replace('.zip', '');
        const project = await api.post('/projects', { name });
        await api.upload('/projects/' + project.id + '/upload', file);
        this.notify('Imported ' + file.name + ' as project: ' + name, 'success');
        this.showDashboard(container);
      } catch (err) {
        this.notify('Import failed: ' + err.message, 'error');
      }
    });

    try {
      const projects = await api.get('/projects');
      const list = document.getElementById('projects-list');
      const searchInput = document.getElementById('project-search');
      const gridBtn = document.getElementById('grid-view-btn');
      const listBtn = document.getElementById('list-view-btn');
      let viewMode = 'grid';

      if (projects.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="icon">${Icons.folderEmpty}</div>
            <p>No projects yet. Create a project or drop a .zip archive to import one.</p>
          </div>
        `;
        return;
      }

      const renderProjects = () => {
        const query = (searchInput.value || '').trim().toLowerCase();
        const filtered = projects.filter((p) => {
          const haystack = `${p.name || ''} ${p.description || ''} ${p.compiler || ''}`.toLowerCase();
          return haystack.includes(query);
        });

        if (filtered.length === 0) {
          list.innerHTML = `
            <div class="empty-state">
              <div class="icon">${Icons.search}</div>
              <p>No projects match this search.</p>
            </div>
          `;
          return;
        }

        list.innerHTML = `<div class="project-grid ${viewMode === 'list' ? 'list-mode' : ''}" id="project-grid"></div>`;
        const grid = document.getElementById('project-grid');

        for (const p of filtered) {
          const card = document.createElement('article');
          card.className = 'project-card';
          card.tabIndex = 0;
          card.innerHTML = `
            <div class="project-card-header">
              <span class="project-card-icon">${Icons.fileTex}</span>
              <h3>${this.escapeHtml(p.name)}</h3>
            </div>
            <div class="desc">${this.escapeHtml(p.description || 'No description')}</div>
            <div class="meta">
              <span>${Icons.wrench} ${this.escapeHtml(p.compiler || 'pdflatex')}</span>
              <span>${new Date(p.updatedAt).toLocaleDateString()}</span>
            </div>
            <div class="actions">
              <button class="btn btn-secondary btn-small" data-open="${p.id}">Open</button>
              <button class="btn btn-danger btn-small" data-delete="${p.id}" title="Delete project" aria-label="Delete ${this.escapeHtml(p.name)}">${Icons.trash}</button>
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
          card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') window.location.hash = `#/project/${p.id}`;
          });
          grid.appendChild(card);
        }
      };

      searchInput.addEventListener('input', renderProjects);
      gridBtn.addEventListener('click', () => {
        viewMode = 'grid';
        gridBtn.classList.add('active');
        listBtn.classList.remove('active');
        renderProjects();
      });
      listBtn.addEventListener('click', () => {
        viewMode = 'list';
        listBtn.classList.add('active');
        gridBtn.classList.remove('active');
        renderProjects();
      });
      renderProjects();
    } catch (err) {
      document.getElementById('projects-list').innerHTML = `
        <div class="empty-state">
          <div class="icon">${Icons.xCircle}</div>
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
          <label for="new-project-name">Project name</label>
          <input type="text" id="new-project-name" placeholder="My Paper" autofocus>
        </div>
        <div class="form-group">
          <label for="new-project-desc">Description</label>
          <input type="text" id="new-project-desc" placeholder="Research topic, class, journal, or team">
        </div>
        <div class="form-group">
          <label for="new-project-compiler">Compiler</label>
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
              <span class="icon">${Icons.file}</span>Empty
            </div>
            <div class="template-option" data-template="article">
              <span class="icon">${Icons.templateArticle}</span>Article
            </div>
            <div class="template-option" data-template="book">
              <span class="icon">${Icons.templateBook}</span>Book
            </div>
            <div class="template-option" data-template="beamer">
              <span class="icon">${Icons.templateBeamer}</span>Beamer
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

    const currentTheme = document.documentElement.dataset.theme;

    container.innerHTML = `
      <div class="editor-layout">
        <div class="editor-toolbar">
          <div class="editor-toolbar-left">
            <a href="#/" class="btn-icon" title="Back to dashboard" aria-label="Back to dashboard">${Icons.backArrow16}</a>
            <span class="project-name" id="editor-project-name">Loading...</span>
          </div>
          <div class="editor-toolbar-center">
            <button class="compile-status" id="compile-status" type="button" title="Compile status">${Icons.play16} Idle</button>
          </div>
          <div class="editor-toolbar-right">
            <button class="btn btn-secondary btn-small" id="search-btn" title="Ctrl+Shift+F">${Icons.search16} Search</button>
            <button class="btn btn-secondary btn-small" id="spellcheck-btn" title="Toggle spellchecker">${Icons.spellcheck16} Spell</button>
            <button class="btn btn-secondary btn-small" id="history-btn" title="File history">${Icons.clock14} History</button>
            <button class="btn btn-secondary btn-small" id="settings-btn" title="Project settings">${Icons.settings} Settings</button>
            <button class="btn btn-secondary btn-small" id="autocompile-btn" title="Auto-compile">${Icons.autoCompile16} Auto</button>
            <button class="btn btn-primary btn-small" id="compile-btn" title="Ctrl+S">${Icons.play16} Compile</button>
            <button class="btn btn-secondary btn-small" id="upload-image-btn" title="Upload image">${Icons.upload16} Image</button>
            <button class="btn btn-secondary btn-small" id="download-pdf-btn" title="Download PDF">${Icons.download16} PDF</button>
            <button class="btn btn-secondary btn-small" id="download-btn" title="Download ZIP">${Icons.download16} ZIP</button>
            <button class="btn btn-secondary btn-small" id="toggle-preview-btn" title="Toggle preview">${Icons.eye16} Preview</button>
            <button class="btn-icon" id="toggle-theme-btn" title="Toggle theme" aria-label="Toggle theme">${currentTheme === 'dark' ? Icons.moon16 : Icons.sun16}</button>
            <button class="btn-icon" id="editor-logout-btn" title="Logout" aria-label="Logout">${Icons.logout16}</button>
          </div>
        </div>
        <div class="editor-main">
          <div class="sidebar">
            <div class="sidebar-header">
              <span>FILES</span>
              <button id="new-file-btn" title="New file">${Icons.plus16}</button>
            </div>
            <div class="sidebar-tabs">
              <button class="sidebar-tab active" data-tab="files">Files</button>
              <button class="sidebar-tab" data-tab="outline">${Icons.outline16} Outline</button>
              <button class="sidebar-tab" data-tab="todo">${Icons.todo16} TODO</button>
            </div>
            <div class="tree-container" id="file-tree"></div>
            <div class="sidebar-panel" id="outline-panel" style="display:none">
              <div class="sidebar-header"><span>OUTLINE</span></div>
              <div class="panel-content" id="outline-content"></div>
            </div>
            <div class="sidebar-panel" id="todo-panel" style="display:none">
              <div class="sidebar-header"><span>TODO</span></div>
              <div class="panel-content" id="todo-content"></div>
            </div>
          </div>
          <div class="editor-pane">
            <div class="editor-tabbar">
              <div class="editor-tab active" id="current-file-tab">${Icons.fileTex} No file</div>
            </div>
            <div class="editor-container" id="monaco-editor"></div>
          </div>
          <div class="preview-pane" id="preview-pane">
            <div class="preview-header">
              <span id="pdf-page-info">PDF Preview</span>
              <div class="preview-nav">
                <button class="btn-icon" id="pdf-prev">${Icons.chevronLeft16}</button>
                <span id="pdf-page-num"></span>
                <button class="btn-icon" id="pdf-next">${Icons.chevronRight16}</button>
                <button class="btn btn-secondary btn-tiny" id="pdf-fit-width" type="button">Fit</button>
                <button class="btn-icon" id="pdf-zoom-out" title="Zoom out" aria-label="Zoom out">−</button>
                <span class="pdf-zoom-label" id="pdf-zoom-label">Fit</span>
                <button class="btn-icon" id="pdf-zoom-in" title="Zoom in" aria-label="Zoom in">+</button>
              </div>
            </div>
            <div class="preview-container" id="preview-container">
              <div class="preview-placeholder">No PDF yet. Compile your project (Ctrl+S).</div>
            </div>
          </div>
        </div>
        <div class="compile-panel hidden" id="compile-panel">
          <div class="compile-panel-header">
            <div class="compile-panel-title">${Icons.clock14} Compile logs</div>
            <div class="compile-panel-tabs" role="tablist" aria-label="Compile log views">
              <button class="active" type="button" data-log-tab="issues">Issues</button>
              <button type="button" data-log-tab="raw">Raw log</button>
            </div>
            <button class="btn-icon" id="compile-panel-close" title="Close logs" aria-label="Close logs">${Icons.x}</button>
          </div>
          <div class="compile-panel-body" id="compile-panel-body">
            <div class="empty-state"><p>No compile run yet.</p></div>
          </div>
        </div>
        <div class="editor-statusbar" id="editor-statusbar"><span id="word-count"></span><span id="save-state">Saved</span></div>
      </div>
    `;

    // Load project data
    let project;
    try {
      project = await api.get(`/projects/${projectId}`);
      this.currentProject = project;
      document.getElementById('editor-project-name').textContent = project.name;
    } catch {
      container.innerHTML = `<div class="empty-state"><div class="icon">${Icons.xCircle}</div><p>Project not found</p></div>`;
      return;
    }

    // Load files
    try {
      this.projectFiles = await api.get(`/projects/${projectId}/files`);
    } catch {
      this.projectFiles = [];
    }

    // Load image files list for autocompletion
    try {
      this.imageFiles = await api.get(`/projects/${projectId}/images`);
    } catch {
      this.imageFiles = [];
    }

    // Sidebar tabs
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        document.getElementById('file-tree').style.display = tabName === 'files' ? '' : 'none';
        document.getElementById('new-file-btn').style.display = tabName === 'files' ? '' : 'none';
        document.querySelector('.sidebar-header').style.display = tabName === 'files' ? '' : 'none';
        document.getElementById('outline-panel').style.display = tabName === 'outline' ? '' : 'none';
        document.getElementById('todo-panel').style.display = tabName === 'todo' ? '' : 'none';
        if (tabName === 'outline') this.parseOutline();
        if (tabName === 'todo') this.parseTodos();
      });
    });

    // Init file tree
    this.fileTree = new FileTree(document.getElementById('file-tree'), {
      projectId: projectId,
      onSelect: (path) => this.openFile(path),
      onCreate: () => this.promptNewFile(),
      onDelete: (path) => this.deleteFile(path),
      onRename: (oldPath, newPath) => this.renameFile(oldPath, newPath),
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
      imageFiles: this.imageFiles,
      onReady: () => {
        if (this.fileTree.selectedPath) {
          this.openFile(this.fileTree.selectedPath);
        }
      },
      onDirty: () => {
        const saveState = document.getElementById('save-state');
        if (saveState) saveState.textContent = 'Unsaved changes';
      },
      onCompile: () => this.compile(),
    });

    // Init preview
    const previewContainer = document.getElementById('preview-container');
    previewContainer.innerHTML = '';
    Preview.init(previewContainer);
    this.previewVisible = !window.matchMedia('(max-width: 1180px)').matches;
    const previewPane = document.getElementById('preview-pane');
    const editorMain = document.querySelector('.editor-main');
    const previewToggle = document.getElementById('toggle-preview-btn');
    if (!this.previewVisible && previewPane) previewPane.classList.add('hidden');
    if (editorMain) editorMain.classList.toggle('preview-open', this.previewVisible);
    if (previewToggle) previewToggle.classList.toggle('active', this.previewVisible);

    // Load existing PDF
    this.loadPdf();

    // Event handlers
    document.getElementById('compile-btn').addEventListener('click', () => this.compile());
    document.getElementById('compile-status').addEventListener('click', () => {
      this.openCompilePanel();
    });
    document.getElementById('download-btn').addEventListener('click', () => this.downloadProject());
    document.getElementById('download-pdf-btn').addEventListener('click', () => this.downloadPdf());
    document.getElementById('toggle-preview-btn').addEventListener('click', () => this.togglePreview());
    document.getElementById('settings-btn').addEventListener('click', () => this.showProjectSettingsModal());
    document.getElementById('toggle-theme-btn').addEventListener('click', () => this.toggleTheme());
    document.getElementById('editor-logout-btn').addEventListener('click', () => {
      api.clearTokens();
      window.location.hash = '#/login';
    });
    document.getElementById('new-file-btn').addEventListener('click', () => this.promptNewFile());
    document.getElementById('pdf-prev').addEventListener('click', () => { Preview.prevPage(); this.updatePdfPageInfo(); });
    document.getElementById('pdf-next').addEventListener('click', () => { Preview.nextPage(); this.updatePdfPageInfo(); });
    document.getElementById('pdf-fit-width').addEventListener('click', async () => { await Preview.setZoom('fit-width'); this.updatePdfPageInfo(); });
    document.getElementById('pdf-zoom-out').addEventListener('click', async () => { await Preview.zoomOut(); this.updatePdfPageInfo(); });
    document.getElementById('pdf-zoom-in').addEventListener('click', async () => { await Preview.zoomIn(); this.updatePdfPageInfo(); });
    document.getElementById('compile-panel-close').addEventListener('click', () => this.closeCompilePanel());
    document.querySelectorAll('[data-log-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-log-tab]').forEach((tab) => tab.classList.remove('active'));
        btn.classList.add('active');
        this.renderCompilePanel(btn.dataset.logTab);
      });
    });

    // Image upload button
    const uploadImgBtn = document.getElementById('upload-image-btn');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png,image/jpeg,image/gif,image/svg+xml,application/pdf';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    uploadImgBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => this.uploadImages(fileInput.files));

    // Cross-file search
    document.getElementById('search-btn').addEventListener('click', () => this.showSearchModal());

    // History/diff viewer
    document.getElementById('history-btn').addEventListener('click', () => this.showHistoryModal());

    // Autocompile toggle
    let autoCompileEnabled = false;
    let autoCompileTimer = null;
    document.getElementById('autocompile-btn').addEventListener('click', () => {
      autoCompileEnabled = !autoCompileEnabled;
      document.getElementById('autocompile-btn').classList.toggle('active', autoCompileEnabled);
      this.notify(autoCompileEnabled ? 'Auto-compile ON (compiles 3s after save)' : 'Auto-compile OFF', 'info');
    });

    // Override autosave to trigger autocompile
    const origAutosave = Editor.autosave.bind(Editor);
    Editor.autosave = async () => {
      const saveState = document.getElementById('save-state');
      if (saveState) saveState.textContent = 'Saving...';
      await origAutosave();
      if (saveState) saveState.textContent = 'Saved just now';
      this.updateWordCount();
      if (autoCompileEnabled) {
        clearTimeout(autoCompileTimer);
        autoCompileTimer = setTimeout(() => this.compile(), 3000);
      }
    };

    // Spellchecker toggle
    let spellEnabled = false;
    document.getElementById('spellcheck-btn').addEventListener('click', () => {
      spellEnabled = !spellEnabled;
      document.getElementById('spellcheck-btn').classList.toggle('active', spellEnabled);
      Editor.toggleSpellcheck(spellEnabled);
    });

    // Drag & drop on editor pane
    const editorPane = document.querySelector('.editor-pane');
    editorPane.addEventListener('dragover', (e) => { e.preventDefault(); editorPane.classList.add('drag-over'); });
    editorPane.addEventListener('dragleave', () => { editorPane.classList.remove('drag-over'); });
    editorPane.addEventListener('drop', async (e) => {
      e.preventDefault();
      editorPane.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) {
        await this.uploadImages(e.dataTransfer.files);
      }
    });

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

    this.bindEditorShortcuts();
  },

  async uploadImages(fileList) {
    if (!fileList || fileList.length === 0) return;
    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'application/pdf'];
    for (const file of fileList) {
      if (!allowed.includes(file.type)) {
        this.notify(`Unsupported file type: ${file.name}`, 'error');
        continue;
      }
      try {
        const formData = new FormData();
        formData.append('image', file);
        const headers = { 'Authorization': `Bearer ${api.token}` };
        const res = await fetch(`/api/projects/${this.currentProjectId}/upload-image`, {
          method: 'POST',
          headers,
          body: formData,
        });
        const result = await res.json();
        if (res.ok) {
          this.notify(`Uploaded ${file.name}`, 'success');
          // Reload files
          this.projectFiles = await api.get(`/projects/${this.currentProjectId}/files`);
          this.fileTree.setFiles(this.projectFiles);
          // Reload image list
          this.imageFiles = await api.get(`/projects/${this.currentProjectId}/images`);
          Editor.setImageFiles(this.imageFiles);
        } else {
          this.notify(`Upload failed: ${result.error || file.name}`, 'error');
        }
      } catch (err) {
        this.notify(`Upload error: ${err.message}`, 'error');
      }
    }
  },

  async openFile(path) {
    try {
      const content = await fetch(`/api/projects/${this.currentProjectId}/files/${path}`, {
        headers: { 'Authorization': `Bearer ${api.token}` },
      }).then(r => r.text());

      Editor.setContext(this.currentProjectId, path);
      Editor.setValue(content);
      const currentFileTab = document.getElementById('current-file-tab');
      if (currentFileTab) {
        currentFileTab.innerHTML = `${Icons.fileTex} ${this.escapeHtml(path)}`;
      }
      this.fileTree.selectFile(path);
      Editor.setCompileErrors([], path);
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  },

  async promptNewFile() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2>New File</h2>
        <form id="new-file-form">
          <div class="form-group">
            <label for="new-file-path">File path</label>
            <input id="new-file-path" type="text" placeholder="chapters/intro.tex" autocomplete="off" required>
            <div class="field-error" id="new-file-error" role="alert"></div>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" type="button" id="new-file-cancel">Cancel</button>
            <button class="btn btn-primary" type="submit" id="new-file-submit">Create</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    const pathInput = overlay.querySelector('#new-file-path');
    const errorEl = overlay.querySelector('#new-file-error');
    const submitBtn = overlay.querySelector('#new-file-submit');

    overlay.querySelector('#new-file-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    overlay.querySelector('#new-file-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const filePath = pathInput.value.trim();
      errorEl.textContent = '';

      if (!filePath) {
        errorEl.textContent = 'File path is required.';
        return;
      }
      if (filePath.startsWith('/') || filePath.split(/[\\/]+/).includes('..')) {
        errorEl.textContent = 'Use a project-relative path.';
        return;
      }
      if (this.projectFiles.some(f => f.path === filePath)) {
        errorEl.textContent = 'File already exists.';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = `${Icons.clock14} Creating...`;
      try {
        const file = await api.post(`/projects/${this.currentProjectId}/files`, {
          path: filePath,
          content: filePath.endsWith('.tex')
            ? `% ${filePath}\n`
            : '',
        });
        this.projectFiles.push(file);
        this.fileTree.setFiles(this.projectFiles);
        this.openFile(filePath);
        close();
      } catch (err) {
        errorEl.textContent = 'Failed to create file: ' + err.message;
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Create';
      }
    });

    pathInput.focus();
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
    const compileBtn = document.getElementById('compile-btn');
    statusEl.innerHTML = `${Icons.clock14} Compiling...`;
    statusEl.className = 'compile-status compiling';
    this.lastCompileErrors = [];
    if (compileBtn) {
      compileBtn.disabled = true;
      compileBtn.innerHTML = `${Icons.clock14} Compiling...`;
    }

    try {
      if (Editor.currentFilePath) {
        await Editor.autosave();
      }

      const result = await api.post(`/projects/${this.currentProjectId}/compile`);
      const issues = Array.isArray(result.errors) ? result.errors : [];
      const errors = issues.filter((e) => e.severity !== 'warning');
      const warnings = issues.filter((e) => e.severity === 'warning');
      this.lastCompileErrors = issues;
      this.compileLog = result.log || '';
      this.renderCompilePanel('issues');

      if (result.success && result.pdfGenerated) {
        if (warnings.length > 0) {
          statusEl.innerHTML = `${Icons.xCircle14} Compiled with ${warnings.length} warning(s)`;
          statusEl.className = 'compile-status warning';
          Editor.setCompileErrors(issues, Editor.currentFilePath);
          this.notify(`Compiled with ${warnings.length} warning(s)`, 'info');
          this.openCompilePanel();
        } else {
          statusEl.innerHTML = `${Icons.check14} Compiled just now`;
          statusEl.className = 'compile-status success';
          Editor.setCompileErrors([], Editor.currentFilePath);
          this.notify('Compilation successful!', 'success');
        }
        this.loadPdf();
      } else {
        statusEl.innerHTML = `${Icons.xCircle14} Failed: ${errors.length || issues.length} error(s)`;
        statusEl.className = 'compile-status error';
        if (issues.length > 0) {
          Editor.setCompileErrors(issues, Editor.currentFilePath);
          const msgs = issues.slice(0, 5).map(e => `Line ${e.line}: ${e.message}`).join('\n');
          this.notify('Compilation failed:\n' + msgs, 'error');
          this.openCompilePanel();
        } else {
          this.notify('Compilation failed', 'error');
          this.openCompilePanel();
        }
      }

      this.projectFiles = await api.get(`/projects/${this.currentProjectId}/files`);
      this.fileTree.setFiles(this.projectFiles);
    } catch (err) {
      statusEl.innerHTML = `${Icons.xCircle14} Error`;
      statusEl.className = 'compile-status error';
      this.lastCompileErrors = [{ line: 0, message: err.message, severity: 'error' }];
      this.compileLog = err.message;
      this.renderCompilePanel('issues');
      this.openCompilePanel();
      this.notify('Compilation error: ' + err.message, 'error');
    } finally {
      this.isCompiling = false;
      if (compileBtn) {
        compileBtn.disabled = false;
        compileBtn.innerHTML = `${Icons.play16} Compile`;
      }
    }
  },

  showCompileErrorsModal() {
    this.openCompilePanel();
  },

  openCompilePanel() {
    this.logsPanelVisible = true;
    const panel = document.getElementById('compile-panel');
    if (panel) panel.classList.remove('hidden');
    this.renderCompilePanel(document.querySelector('[data-log-tab].active')?.dataset.logTab || 'issues');
  },

  closeCompilePanel() {
    this.logsPanelVisible = false;
    const panel = document.getElementById('compile-panel');
    if (panel) panel.classList.add('hidden');
  },

  renderCompilePanel(tab = 'issues') {
    const body = document.getElementById('compile-panel-body');
    if (!body) return;
    const issues = this.lastCompileErrors || [];
    if (tab === 'raw') {
      body.innerHTML = this.compileLog
        ? `<pre class="raw-log">${this.escapeHtml(this.compileLog)}</pre>`
        : `<div class="empty-state"><p>No raw log for the current run.</p></div>`;
      return;
    }

    body.innerHTML = issues.length === 0 ? `
      <div class="empty-state">
        <div class="icon">${Icons.check}</div>
        <p>No compile issues for the current run.</p>
      </div>
    ` : `
      <div class="log-list">
        ${issues.map((issue, index) => `
          <button class="log-row ${issue.severity === 'warning' ? 'warning' : 'error'}" data-index="${index}" type="button">
            <span class="log-severity">${issue.severity === 'warning' ? 'Warning' : 'Error'}</span>
            <span class="log-line">Line ${issue.line || 0}</span>
            <span class="log-message">${this.escapeHtml(issue.message || 'Unknown compile issue')}</span>
          </button>
        `).join('')}
      </div>
    `;
    body.querySelectorAll('.log-row').forEach((row) => {
      row.addEventListener('click', () => {
        const issue = issues[parseInt(row.dataset.index, 10)];
        if (issue && issue.line) {
          Editor.revealLine(issue.line);
        }
      });
    });
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
    const zoom = document.getElementById('pdf-zoom-label');
    if (info && num) {
      const total = pdfDoc ? pdfDoc.numPages : 0;
      const current = total > 0 ? currentPage : 0;
      info.textContent = 'PDF Preview';
      num.textContent = total > 0 ? `${current} / ${total}` : '';
    }
    if (zoom) zoom.textContent = Preview.getZoomLabel();
  },

  togglePreview() {
    this.previewVisible = !this.previewVisible;
    const pane = document.getElementById('preview-pane');
    const main = document.querySelector('.editor-main');
    const button = document.getElementById('toggle-preview-btn');
    if (pane) {
      pane.classList.toggle('hidden', !this.previewVisible);
    }
    if (main) {
      main.classList.toggle('preview-open', this.previewVisible);
    }
    if (button) {
      button.classList.toggle('active', this.previewVisible);
    }
    if (this.previewVisible) {
      this.updatePdfPageInfo();
      this.loadPdf();
    }
  },

  async downloadPdf() {
    try {
      const blob = await api.download(`/projects/${this.currentProjectId}/output.pdf`);
      if (blob.size < 100) {
        this.notify('No PDF yet. Compile first.', 'error');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'document.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      this.notify('Download failed: ' + err.message, 'error');
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
    if (btn) btn.innerHTML = next === 'dark' ? Icons.moon16 : Icons.sun16;
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

  async parseOutline() {
    const outlineEl = document.getElementById('outline-content');
    if (!outlineEl) return;
    try {
      const texFiles = this.projectFiles.filter(f => f.path.endsWith('.tex'));
      let allContent = '';
      for (const f of texFiles) {
        try {
          const headers = { 'Authorization': 'Bearer ' + api.token };
          const content = await fetch('/api/projects/' + this.currentProjectId + '/files/' + f.path, { headers }).then(r => r.text());
          allContent += content + '\n';
        } catch { /* skip */ }
      }
      const items = [];
      const regex = /\\((?:section|subsection|subsubsection|chapter))\{([^}]*)\}/g;
      let match;
      while ((match = regex.exec(allContent)) !== null) {
        items.push({ level: match[1], title: match[2], line: allContent.substring(0, match.index).split('\n').length });
      }
      if (items.length === 0) {
        outlineEl.innerHTML = '<div style="padding:8px;color:var(--text-secondary)">No sections found</div>';
      } else {
        outlineEl.innerHTML = items.map(i =>
          '<div class="outline-item ' + i.level + '" data-line="' + i.line + '">' + this.escapeHtml(i.title) + '</div>'
        ).join('');
        outlineEl.querySelectorAll('.outline-item').forEach(el => {
          el.addEventListener('click', () => {
            Editor.revealLine(parseInt(el.dataset.line));
          });
        });
      }
    } catch (err) {
      outlineEl.innerHTML = '<div style="padding:8px;color:var(--error)">Error parsing outline</div>';
    }
  },

  async parseTodos() {
    const todoEl = document.getElementById('todo-content');
    if (!todoEl) return;
    try {
      const texFiles = this.projectFiles.filter(f => f.path.endsWith('.tex'));
      const items = [];
      for (const f of texFiles) {
        try {
          const headers = { 'Authorization': 'Bearer ' + api.token };
          const content = await fetch('/api/projects/' + this.currentProjectId + '/files/' + f.path, { headers }).then(r => r.text());
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(/%(TODO|FIXME|HACK)\s*(.*)/i);
            if (match) {
              const type = match[1].toUpperCase();
              items.push({ type, text: match[2], file: f.path, line: i + 1 });
            }
          }
        } catch { /* skip */ }
      }
      if (items.length === 0) {
        todoEl.innerHTML = '<div style="padding:8px;color:var(--text-secondary)">No TODOs found</div>';
      } else {
        todoEl.innerHTML = items.map(i =>
          '<div class="todo-item ' + (i.type === 'FIXME' ? 'error' : i.type === 'HACK' ? 'warning' : '') + '" data-file="' + this.escapeHtml(i.file) + '" data-line="' + i.line + '">' +
          '<strong>[' + i.type + ']</strong> ' + this.escapeHtml(i.text || '(empty)') +
          ' <span style="color:var(--text-secondary)">— ' + i.file + ':' + i.line + '</span></div>'
        ).join('');
        todoEl.querySelectorAll('.todo-item').forEach(el => {
          el.addEventListener('click', () => {
            this.openFile(el.dataset.file);
            setTimeout(() => Editor.revealLine(parseInt(el.dataset.line)), 200);
          });
        });
      }
    } catch (err) {
      todoEl.innerHTML = '<div style="padding:8px;color:var(--error)">Error parsing TODOs</div>';
    }
  },

  updateWordCount() {
    const content = Editor.getValue();
    const text = content
      .replace(/\\\\[a-zA-Z]+/g, ' ')
      .replace(/[%].*/g, '')
      .replace(/[{}\\]/g, ' ')
      .replace(/\\\\begin\\{[^}]*\\}/g, '')
      .replace(/\\\\end\\{[^}]*\\}/g, '')
      .replace(/\s+/g, ' ');
    const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
    const chars = content.length;
    const pages = Math.max(1, Math.round(words / 300));
    const el = document.getElementById('word-count');
    if (el) el.textContent = 'Words: ' + words + ' | Chars: ' + chars + ' | ~Pages: ' + pages;
  },

  async renameFile(oldPath, newPath) {
    if (!newPath) {
      this.showRenameFileModal(oldPath);
      return;
    }
    try {
      await api.put(`/projects/${this.currentProjectId}/files/rename`, { oldPath, newPath });
      this.notify(`Renamed ${oldPath} → ${newPath}`, 'success');
      this.projectFiles = await api.get(`/projects/${this.currentProjectId}/files`);
      this.fileTree.setFiles(this.projectFiles);
      if (Editor.currentFilePath === oldPath) {
        this.openFile(newPath);
      }
    } catch (err) {
      this.notify('Rename failed: ' + err.message, 'error');
    }
  },

  showRenameFileModal(oldPath) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2>Rename File</h2>
        <form id="rename-file-form">
          <div class="form-group">
            <label for="rename-file-path">File path</label>
            <input id="rename-file-path" type="text" value="${this.escapeHtml(oldPath)}" autocomplete="off" required>
            <div class="field-error" id="rename-file-error" role="alert"></div>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" type="button" id="rename-file-cancel">Cancel</button>
            <button class="btn btn-primary" type="submit">Rename</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    const input = overlay.querySelector('#rename-file-path');
    const error = overlay.querySelector('#rename-file-error');
    overlay.querySelector('#rename-file-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    overlay.querySelector('#rename-file-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPath = input.value.trim();
      error.textContent = '';
      if (!newPath) return error.textContent = 'File path is required.';
      if (newPath === oldPath) return close();
      if (newPath.startsWith('/') || newPath.split(/[\\/]+/).includes('..')) {
        error.textContent = 'Use a project-relative path.';
        return;
      }
      if (this.projectFiles.some(f => f.path === newPath)) {
        error.textContent = 'File already exists.';
        return;
      }
      await this.renameFile(oldPath, newPath);
      close();
    });
    input.focus();
    input.setSelectionRange(0, input.value.length);
  },

  showProjectSettingsModal() {
    const project = this.currentProject || {};
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal settings-modal">
        <h2>Project Settings</h2>
        <form id="project-settings-form">
          <div class="form-grid two-col">
            <div class="form-group">
              <label for="settings-name">Name</label>
              <input id="settings-name" type="text" value="${this.escapeHtml(project.name || '')}" required>
            </div>
            <div class="form-group">
              <label for="settings-compiler">Compiler</label>
              <select id="settings-compiler">
                ${['pdflatex', 'xelatex', 'lualatex'].map(c => `<option value="${c}" ${project.compiler === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label for="settings-description">Description</label>
            <textarea id="settings-description" rows="3">${this.escapeHtml(project.description || '')}</textarea>
          </div>
          <div class="form-group">
            <label for="settings-main-file">Main file</label>
            <select id="settings-main-file">
              ${this.projectFiles.filter(f => f.path.endsWith('.tex')).map(f => `<option value="${this.escapeHtml(f.path)}" ${project.mainFile === f.path ? 'selected' : ''}>${this.escapeHtml(f.path)}</option>`).join('')}
            </select>
          </div>
          <div class="settings-section">
            <h3>CLI access</h3>
            <div class="copy-row">
              <code>lighttex pull ${this.currentProjectId}</code>
              <button class="btn btn-secondary btn-small" type="button" id="copy-cli-command">Copy</button>
            </div>
          </div>
          <div class="field-error" id="settings-error" role="alert"></div>
          <div class="modal-actions">
            <button class="btn btn-secondary" type="button" id="settings-cancel">Cancel</button>
            <button class="btn btn-primary" type="submit" id="settings-save">Save settings</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#settings-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    overlay.querySelector('#copy-cli-command').addEventListener('click', async () => {
      try {
        await navigator.clipboard?.writeText(`lighttex pull ${this.currentProjectId}`);
        this.notify('CLI command copied', 'success');
      } catch {
        this.notify('Could not copy command automatically', 'error');
      }
    });
    overlay.querySelector('#project-settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const error = overlay.querySelector('#settings-error');
      const save = overlay.querySelector('#settings-save');
      error.textContent = '';
      save.disabled = true;
      save.innerHTML = `${Icons.clock14} Saving...`;
      try {
        const updated = await api.put(`/projects/${this.currentProjectId}`, {
          name: overlay.querySelector('#settings-name').value.trim(),
          description: overlay.querySelector('#settings-description').value.trim(),
          compiler: overlay.querySelector('#settings-compiler').value,
          mainFile: overlay.querySelector('#settings-main-file').value,
        });
        this.currentProject = updated;
        document.getElementById('editor-project-name').textContent = updated.name;
        this.notify('Project settings saved', 'success');
        close();
      } catch (err) {
        error.textContent = err.message;
      } finally {
        save.disabled = false;
        save.innerHTML = 'Save settings';
      }
    });
    overlay.querySelector('#settings-name').focus();
  },

  bindEditorShortcuts() {
    if (this.editorShortcutHandler) {
      document.removeEventListener('keydown', this.editorShortcutHandler);
    }
    this.editorShortcutHandler = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.showCommandPalette('commands');
      } else if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        this.showCommandPalette('files');
      } else if (e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        this.showSearchModal();
      }
    };
    document.addEventListener('keydown', this.editorShortcutHandler);
  },

  showCommandPalette(mode = 'commands') {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay command-palette-overlay';
    overlay.innerHTML = `
      <div class="command-palette" role="dialog" aria-label="Command palette">
        <input id="command-input" type="text" placeholder="${mode === 'files' ? 'Open file...' : 'Run command...'}" autocomplete="off">
        <div class="command-list" id="command-list"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#command-input');
    const list = overlay.querySelector('#command-list');
    const close = () => overlay.remove();
    const commands = [
      { label: 'Compile project', hint: 'Ctrl+S', run: () => this.compile() },
      { label: 'Search project', hint: 'Ctrl+Shift+F', run: () => this.showSearchModal() },
      { label: 'Project settings', hint: 'Compiler, main file', run: () => this.showProjectSettingsModal() },
      { label: 'Toggle PDF preview', hint: 'Editor / PDF', run: () => this.togglePreview() },
      { label: 'Open history', hint: 'Snapshots', run: () => this.showHistoryModal() },
      { label: 'Download PDF', hint: 'output.pdf', run: () => this.downloadPdf() },
      { label: 'Download project ZIP', hint: '.zip', run: () => this.downloadProject() },
      { label: 'Toggle theme', hint: document.documentElement.dataset.theme === 'dark' ? 'Light' : 'Dark', run: () => this.toggleTheme() },
    ];
    const fileItems = this.projectFiles.map(file => ({
      label: file.path,
      hint: 'Open file',
      run: () => this.openFile(file.path),
    }));
    let items = mode === 'files' ? fileItems : commands.concat(fileItems);

    const render = () => {
      const q = input.value.trim().toLowerCase();
      const filtered = items.filter(item => item.label.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q)).slice(0, 12);
      list.innerHTML = filtered.length === 0
        ? '<div class="command-empty">No matches</div>'
        : filtered.map((item, index) => `
          <button class="command-item ${index === 0 ? 'active' : ''}" type="button" data-index="${index}">
            <span>${this.escapeHtml(item.label)}</span>
            <small>${this.escapeHtml(item.hint)}</small>
          </button>
        `).join('');
      list.querySelectorAll('.command-item').forEach((button) => {
        button.addEventListener('click', () => {
          const item = filtered[parseInt(button.dataset.index, 10)];
          close();
          item.run();
        });
      });
      overlay._filteredCommands = filtered;
    };
    render();
    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        close();
      } else if (e.key === 'Enter') {
        const item = overlay._filteredCommands?.[0];
        if (item) {
          close();
          item.run();
        }
      }
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    input.focus();
  },

  async showHistoryModal() {
    if (!Editor.currentFilePath) { this.notify('No file open', 'error'); return; }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:900px">
        <h2>File History: ${this.escapeHtml(Editor.currentFilePath)}</h2>
        <div id="history-snapshots" style="margin-bottom:10px">
          <p style="color:var(--text-secondary)">Loading snapshots...</p>
        </div>
        <div id="diff-container" style="height:400px;border:1px solid var(--border-color)"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="history-close">Close</button>
          <button class="btn btn-primary" id="history-restore">Restore Selected Version</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#history-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    let selectedSnapshot = null;
    const filePath = Editor.currentFilePath;

    // Load snapshots
    try {
      const snapshots = await api.get(`/projects/${this.currentProjectId}/history`);
      const snapshotsEl = document.getElementById('history-snapshots');
      if (snapshots.length === 0) {
        snapshotsEl.innerHTML = '<p style="color:var(--text-secondary)">No snapshots. Compile the project to create snapshots.</p>';
      } else {
        snapshotsEl.innerHTML = '<label style="color:var(--text-secondary)">Select snapshot: </label>' +
          '<select id="history-select" style="background:var(--input-bg);color:var(--text-primary);border:1px solid var(--border-color);padding:4px;border-radius:4px">' +
          snapshots.map(s => `<option value="${s}">${s.replace(/T/, ' ').replace(/-/g, ':').substring(0, 19)}</option>`).join('') +
          '</select>';
        document.getElementById('history-select').addEventListener('change', async (e) => {
          selectedSnapshot = e.target.value;
          await this.loadDiff(overlay, filePath, selectedSnapshot);
        });
        selectedSnapshot = snapshots[0];
        await this.loadDiff(overlay, filePath, selectedSnapshot);
      }
    } catch (err) {
      document.getElementById('history-snapshots').innerHTML = `<p style="color:var(--error)">Error: ${this.escapeHtml(err.message)}</p>`;
    }

    overlay.querySelector('#history-restore').addEventListener('click', async () => {
      if (!selectedSnapshot) return;
      try {
        const headers = { 'Authorization': `Bearer ${api.token}` };
        const res = await fetch(`/api/projects/${this.currentProjectId}/history/${selectedSnapshot}/files/${filePath}`, { headers });
        if (!res.ok) throw new Error('File is not available in this snapshot');
        const content = await res.text();
        await api.put(`/projects/${this.currentProjectId}/files/${filePath}`, { content });
        Editor.setValue(content);
        this.notify('File restored from snapshot', 'success');
        overlay.remove();
      } catch (err) {
        this.notify('Restore failed: ' + err.message, 'error');
      }
    });
  },

  async loadDiff(overlay, filePath, timestamp) {
    const diffContainer = document.getElementById('diff-container');
    if (!diffContainer) return;
    try {
      const headers = { 'Authorization': `Bearer ${api.token}` };
      const [oldRes, newContent] = await Promise.all([
        fetch(`/api/projects/${this.currentProjectId}/history/${timestamp}/files/${filePath}`, { headers }).then(async r => {
          if (!r.ok) throw new Error('This file is not present in the selected snapshot.');
          return r.text();
        }),
        Editor.getValue(),
      ]);

      // Create Monaco diff editor
      require(['vs/editor/editor.main'], () => {
        diffContainer.innerHTML = '';
        monaco.editor.createDiffEditor(diffContainer, {
          theme: document.documentElement.dataset.theme === 'dark' ? 'vs-dark' : 'vs',
          automaticLayout: true,
          readOnly: true,
        }).setModel({
          original: monaco.editor.createModel(oldRes, 'latex'),
          modified: monaco.editor.createModel(newContent, 'latex'),
        });
      });
    } catch (err) {
      diffContainer.innerHTML = `<div class="empty-state"><div class="icon">${Icons.clock}</div><p>${this.escapeHtml(err.message || 'Could not load file for this snapshot')}</p></div>`;
    }
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  async showSearchModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:700px">
        <h2>Search in Project</h2>
        <div class="form-group">
          <input type="text" id="search-input" placeholder="Search across all files..." autofocus style="width:100%">
        </div>
        <div id="search-results" style="max-height:400px;overflow-y:auto;font-size:13px;font-family:monospace"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="search-close">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#search-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') overlay.remove(); });

    let searchTimer;
    document.getElementById('search-input').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        const q = e.target.value.trim();
        const resultsEl = document.getElementById('search-results');
        if (!q) { resultsEl.innerHTML = ''; return; }
        try {
          const results = await api.get(`/projects/${this.currentProjectId}/search?q=${encodeURIComponent(q)}`);
          if (results.length === 0) {
            resultsEl.innerHTML = '<div style="padding:10px;color:var(--text-secondary)">No results</div>';
          } else {
            resultsEl.innerHTML = results.map(r =>
              `<div class="search-result-item" data-file="${this.escapeHtml(r.file)}" data-line="${r.line}">
                <span style="color:var(--accent)">${this.escapeHtml(r.file)}</span>:<span style="color:var(--warning)">${r.line}</span>: ${this.escapeHtml(r.content)}
              </div>`
            ).join('');
            resultsEl.querySelectorAll('.search-result-item').forEach(el => {
              el.addEventListener('click', () => {
                const file = el.dataset.file;
                const line = parseInt(el.dataset.line);
                this.openFile(file);
                setTimeout(() => Editor.revealLine(line), 200);
                overlay.remove();
              });
              el.style.cursor = 'pointer';
              el.style.padding = '4px 8px';
              el.style.borderBottom = '1px solid var(--border-color)';
            });
          }
        } catch (err) {
          resultsEl.innerHTML = `<div style="padding:10px;color:var(--error)">Error: ${this.escapeHtml(err.message)}</div>`;
        }
      }, 300);
    });
    document.getElementById('search-input').focus();
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
