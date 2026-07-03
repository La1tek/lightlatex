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
  structureRefreshTimer: null,
  citationEntries: [],
  fileHashes: [],
  syncState: 'synced',
  syncConflicts: [],
  devMode: false,
  accessRole: 'owner',
  workspaceMode: 'split',
  focusMode: false,

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

  projectRole() {
    return this.currentProject?.accessRole || this.accessRole || 'owner';
  },

  canEditProject() {
    return LightTeXCore.permissions.canEdit(this.projectRole());
  },

  canManageProject() {
    return LightTeXCore.permissions.canManage(this.projectRole());
  },

  roleLabel(role = this.projectRole()) {
    return LightTeXCore.permissions.roleLabel(role);
  },

  ensureCanEdit(action = 'edit this project') {
    if (this.canEditProject()) return true;
    this.notify(`Viewer access is read-only. Ask the owner for editor access to ${action}.`, 'error');
    return false;
  },

  ensureCanManage(action = 'manage this project') {
    if (this.canManageProject()) return true;
    this.notify(`Only the project owner can ${action}.`, 'error');
    return false;
  },

  applyProjectPermissions() {
    const role = this.projectRole();
    const canEdit = this.canEditProject();
    const badge = document.getElementById('editor-access-badge');
    if (badge) {
      badge.textContent = this.roleLabel(role);
      badge.className = `access-badge ${role}`;
    }

    document.querySelector('.editor-layout')?.classList.toggle('read-only', !canEdit);
    this.fileTree?.setReadOnly(!canEdit);
    Editor.setReadOnly?.(!canEdit);

    const editButtons = [
      'new-file-btn',
      'compile-btn',
      'upload-image-btn',
      'autocompile-btn',
      'snapshot-btn',
      'symbols-btn',
      'citation-manager-btn',
    ];
    for (const id of editButtons) {
      const button = document.getElementById(id);
      if (!button) continue;
      button.disabled = !canEdit;
      if (!canEdit) button.title = 'Read-only viewer access';
    }

    const saveState = document.getElementById('save-state');
    if (saveState && !canEdit) saveState.textContent = 'Read-only';
  },

  // ===== Dashboard =====
  async showDashboard(container) {
    return LightTeXFeatures.dashboard.show(this, container);
  },

  showNewProjectModal() {
    return LightTeXFeatures.newProject.show(this);
  },

  // ===== Editor =====
  async showEditor(container, projectId) {
    this.currentProjectId = projectId;
    Editor.dispose();
    Preview.clear();
    this.fileTree = null;
    this.devMode = localStorage.getItem('lighttex-dev-mode') === 'true';

    const currentTheme = document.documentElement.dataset.theme;

    container.innerHTML = `
      <div class="editor-layout">
        <div class="editor-toolbar">
          <div class="editor-toolbar-left">
            <a href="#/" class="btn-icon" title="Back to dashboard" aria-label="Back to dashboard">${Icons.backArrow16}</a>
            <span class="project-name" id="editor-project-name">Loading...</span>
            <span class="access-badge owner" id="editor-access-badge">Owner</span>
          </div>
          <div class="editor-toolbar-center">
            <button class="compile-status" id="compile-status" type="button" title="Compile status">${Icons.play16} Idle</button>
          </div>
          <div class="editor-toolbar-right">
            <button class="sync-status synced" id="sync-status-btn" type="button" title="CLI sync status">${Icons.sync16} Synced</button>
            <button class="btn btn-secondary btn-small" id="search-btn" title="Ctrl+Shift+F">${Icons.search16} Search</button>
            <button class="btn btn-secondary btn-small" id="symbols-btn" title="LaTeX symbols">${Icons.symbols16} Symbols</button>
            <button class="btn btn-secondary btn-small" id="citation-manager-btn" title="Citation manager">${Icons.cite16} Cite</button>
            <button class="btn btn-secondary btn-small" id="spellcheck-btn" title="Toggle spellchecker">${Icons.spellcheck16} Spell</button>
            <button class="btn btn-secondary btn-small" id="history-btn" title="File history">${Icons.clock14} History</button>
            <button class="btn btn-secondary btn-small" id="snapshot-btn" title="Create named snapshot">${Icons.save16} Snapshot</button>
            <button class="btn btn-secondary btn-small" id="settings-btn" title="Project settings">${Icons.settings} Settings</button>
            <button class="btn btn-secondary btn-small" id="autocompile-btn" title="Auto-compile">${Icons.autoCompile16} Auto</button>
            <button class="btn btn-secondary btn-small" id="preflight-btn" title="Run preflight check">${Icons.check14} Check</button>
            <button class="btn btn-primary btn-small" id="compile-btn" title="Ctrl+S">${Icons.play16} Compile</button>
            <button class="btn btn-secondary btn-small" id="upload-image-btn" title="Upload image">${Icons.upload16} Image</button>
            <button class="btn btn-secondary btn-small" id="asset-manager-btn" title="Asset manager">${Icons.image16} Assets</button>
            <button class="btn btn-secondary btn-small" id="download-pdf-btn" title="Download PDF">${Icons.download16} PDF</button>
            <button class="btn btn-secondary btn-small" id="download-btn" title="Download ZIP">${Icons.download16} ZIP</button>
            <button class="btn btn-secondary btn-small" id="toggle-preview-btn" title="Toggle preview">${Icons.eye16} Preview</button>
            <button class="btn btn-secondary btn-small" id="layout-btn" title="Workspace layout">${Icons.layout16} Layout</button>
            <button class="btn btn-secondary btn-small" id="focus-btn" title="Focus mode">${Icons.focus16} Focus</button>
            <button class="btn btn-secondary btn-small" id="shortcuts-btn" title="Keyboard shortcuts">${Icons.keyboard16} Keys</button>
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
              <button class="sidebar-tab" data-tab="refs">${Icons.link16} Refs</button>
              <button class="sidebar-tab" data-tab="todo">${Icons.todo16} TODO</button>
            </div>
            <div class="tree-container" id="file-tree"></div>
            <div class="sidebar-panel" id="outline-panel" style="display:none">
              <div class="sidebar-header"><span>OUTLINE</span></div>
              <div class="panel-content" id="outline-content"></div>
            </div>
            <div class="sidebar-panel" id="refs-panel" style="display:none">
              <div class="sidebar-header"><span>REFERENCES</span></div>
              <div class="panel-content" id="refs-content"></div>
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
      this.accessRole = project.accessRole || 'owner';
      document.getElementById('editor-project-name').textContent = project.name;
      this.applyProjectPermissions();
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
        document.getElementById('refs-panel').style.display = tabName === 'refs' ? '' : 'none';
        document.getElementById('todo-panel').style.display = tabName === 'todo' ? '' : 'none';
        if (tabName === 'outline') this.parseOutline();
        if (tabName === 'refs') this.parseReferences();
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
      devMode: this.devMode,
      readOnly: !this.canEditProject(),
    });
    this.fileTree.setFiles(this.projectFiles);
    this.refreshFileHashes();

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
        this.updateSyncStatus('local', 'Unsaved local editor changes');
        this.queueStructureRefresh();
      },
      onCompile: () => this.compile(),
      readOnly: !this.canEditProject(),
    });

    // Init preview
    const previewContainer = document.getElementById('preview-container');
    previewContainer.innerHTML = '';
    Preview.init(previewContainer);
    this.workspaceMode = localStorage.getItem('lighttex-workspace-mode') || 'split';
    this.focusMode = localStorage.getItem('lighttex-focus-mode') === 'true';
    if (window.matchMedia('(max-width: 1180px)').matches && this.workspaceMode === 'split') {
      this.workspaceMode = 'editor';
    }
    this.setWorkspaceMode(this.workspaceMode, { persist: false });
    this.applyFocusMode();

    // Load existing PDF
    this.loadPdf();

    // Event handlers
    document.getElementById('compile-btn').addEventListener('click', () => this.compile());
    document.getElementById('sync-status-btn').addEventListener('click', () => this.showSyncCenter());
    document.getElementById('compile-status').addEventListener('click', () => {
      this.openCompilePanel();
    });
    document.getElementById('download-btn').addEventListener('click', () => this.downloadProject());
    document.getElementById('download-pdf-btn').addEventListener('click', () => this.downloadPdf());
    document.getElementById('toggle-preview-btn').addEventListener('click', () => this.togglePreview());
    document.getElementById('layout-btn').addEventListener('click', () => this.showLayoutModal());
    document.getElementById('focus-btn').addEventListener('click', () => this.toggleFocusMode());
    document.getElementById('shortcuts-btn').addEventListener('click', () => this.showShortcutsModal());
    document.getElementById('settings-btn').addEventListener('click', () => this.showProjectSettingsModal());
    document.getElementById('preflight-btn').addEventListener('click', () => this.showPreflightCheck());
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
    this.applyProjectPermissions();
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
    document.getElementById('asset-manager-btn').addEventListener('click', () => this.showAssetManager());

    // Cross-file search
    document.getElementById('search-btn').addEventListener('click', () => this.showSearchModal());
    document.getElementById('symbols-btn').addEventListener('click', () => this.showSymbolsPalette());
    document.getElementById('citation-manager-btn').addEventListener('click', () => this.showCitationManager());

    // History/diff viewer
    document.getElementById('history-btn').addEventListener('click', () => this.showHistoryModal());
    document.getElementById('snapshot-btn').addEventListener('click', () => this.showCreateSnapshotModal());

    // Autocompile toggle
    let autoCompileEnabled = false;
    let autoCompileTimer = null;
    document.getElementById('autocompile-btn').addEventListener('click', () => {
      if (!this.ensureCanEdit('use auto-compile')) return;
      autoCompileEnabled = !autoCompileEnabled;
      document.getElementById('autocompile-btn').classList.toggle('active', autoCompileEnabled);
      this.notify(autoCompileEnabled ? 'Auto-compile ON (compiles 3s after save)' : 'Auto-compile OFF', 'info');
    });

    // Override autosave to trigger autocompile
    const origAutosave = Editor.autosave.bind(Editor);
    Editor.autosave = async () => {
      const saveState = document.getElementById('save-state');
      if (!this.canEditProject()) {
        if (saveState) saveState.textContent = 'Read-only';
        return;
      }
      if (saveState) saveState.textContent = 'Saving...';
      await origAutosave();
      if (saveState) saveState.textContent = 'Saved just now';
      this.updateWordCount();
      this.queueStructureRefresh();
      this.refreshFileHashes();
      if (Editor.currentFilePath && Editor.currentFilePath.endsWith('.bib')) this.refreshCitationCache();
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
      if (!this.ensureCanEdit('upload assets')) return;
      if (e.dataTransfer.files.length > 0) {
        await this.uploadImages(e.dataTransfer.files);
      }
    });

    // Update project title on rename
    const nameEl = document.getElementById('editor-project-name');
    nameEl.contentEditable = this.canManageProject() ? 'true' : 'false';
    if (this.canManageProject()) {
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
    } else {
      nameEl.title = `Shared project · ${this.roleLabel()}`;
    }

    this.bindEditorShortcuts();
    this.refreshCitationCache();
  },

  async uploadImages(fileList) {
    return LightTeXFeatures.assetManager.uploadImages(this, fileList);
  },

  async showAssetManager() {
    return LightTeXFeatures.assetManager.show(this);
  },

  async loadAssetPreview(container, asset) {
    return LightTeXFeatures.assetManager.loadPreview(this, container, asset);
  },

  async refreshCitationCache(options = {}) {
    return LightTeXFeatures.citationManager.refreshCache(this, options);
  },

  async loadCitationEntries() {
    return LightTeXFeatures.citationManager.loadEntries(this);
  },

  extractBibEntries(content, filePath) {
    return LightTeXFeatures.citationManager.extractBibEntries(this, content, filePath);
  },

  parseBibFields(raw) {
    return LightTeXFeatures.citationManager.parseBibFields(this, raw);
  },

  cleanBibValue(value) {
    return LightTeXFeatures.citationManager.cleanBibValue(value);
  },

  formatAuthors(author) {
    return LightTeXCore.format.formatAuthors(author);
  },

  async showCitationManager() {
    return LightTeXFeatures.citationManager.showManager(this);
  },

  showBibEntryModal(onSaved) {
    return LightTeXFeatures.citationManager.showBibEntryModal(this, onSaved);
  },

  async openFile(path) {
    return LightTeXFeatures.fileActions.openFile(this, path);
  },

  async promptNewFile() {
    return LightTeXFeatures.fileActions.promptNewFile(this);
  },

  async deleteFile(path) {
    return LightTeXFeatures.fileActions.deleteFile(this, path);
  },

  async compile() {
    if (!this.ensureCanEdit('compile this project')) return;
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
      this.refreshFileHashes();
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

  workspaceModeLabel(mode = this.workspaceMode) {
    return LightTeXFeatures.workspaceLayout.modeLabel(mode);
  },

  setWorkspaceMode(mode, options = {}) {
    return LightTeXFeatures.workspaceLayout.setMode(this, mode, options);
  },

  togglePreview() {
    return LightTeXFeatures.workspaceLayout.togglePreview(this);
  },

  applyFocusMode() {
    return LightTeXFeatures.workspaceLayout.applyFocusMode(this);
  },

  toggleFocusMode() {
    return LightTeXFeatures.workspaceLayout.toggleFocusMode(this);
  },

  showLayoutModal() {
    return LightTeXFeatures.workspaceLayout.showLayoutModal(this);
  },

  showShortcutsModal() {
    return LightTeXFeatures.workspaceLayout.showShortcutsModal(this);
  },

  async downloadPdf() {
    return LightTeXFeatures.fileActions.downloadPdf(this);
  },

  async downloadProject() {
    return LightTeXFeatures.fileActions.downloadProject(this);
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
    LightTeXCore.notify.show(message, type);
  },

  async refreshFileHashes() {
    return LightTeXFeatures.fileActions.refreshFileHashes(this);
  },

  updateSyncStatus(state, detail) {
    return LightTeXFeatures.fileActions.updateSyncStatus(this, state, detail);
  },

  formatHash(hash) {
    return LightTeXCore.format.formatHash(hash);
  },

  async showSyncCenter() {
    return LightTeXFeatures.syncCenter.show(this);
  },

  showConflictsModal(conflicts = this.syncConflicts) {
    return LightTeXFeatures.syncCenter.showConflicts(this, conflicts);
  },

  getActiveSidebarTab() {
    return document.querySelector('.sidebar-tab.active')?.dataset.tab || 'files';
  },

  queueStructureRefresh() {
    clearTimeout(this.structureRefreshTimer);
    this.structureRefreshTimer = setTimeout(() => this.refreshActiveSidebarPanel(), 700);
  },

  refreshActiveSidebarPanel() {
    const tab = this.getActiveSidebarTab();
    if (tab === 'outline') this.parseOutline();
    if (tab === 'refs') this.parseReferences();
    if (tab === 'todo') this.parseTodos();
  },

  async readProjectTextFile(filePath) {
    return LightTeXFeatures.fileActions.readProjectTextFile(this, filePath);
  },

  encodeProjectPath(filePath) {
    return LightTeXCore.path.encodeProjectPath(filePath);
  },

  normalizeProjectPath(filePath) {
    return LightTeXCore.path.normalizeProjectPath(filePath);
  },

  projectPathExists(filePath, filePaths) {
    return LightTeXCore.path.projectPathExists(filePath, filePaths);
  },

  stripLatexComment(line) {
    for (let i = 0; i < line.length; i++) {
      if (line[i] !== '%') continue;
      let slashCount = 0;
      for (let j = i - 1; j >= 0 && line[j] === '\\'; j--) slashCount++;
      if (slashCount % 2 === 0) return line.slice(0, i);
    }
    return line;
  },

  readLatexBraceArgument(line, startIndex) {
    let i = startIndex;
    while (i < line.length && /\s/.test(line[i])) i++;
    if (line[i] === '[') {
      let depth = 0;
      while (i < line.length) {
        if (line[i] === '[') depth++;
        if (line[i] === ']') depth--;
        i++;
        if (depth === 0) break;
      }
      while (i < line.length && /\s/.test(line[i])) i++;
    }
    if (line[i] !== '{') return '';
    let depth = 0;
    let value = '';
    for (; i < line.length; i++) {
      const char = line[i];
      const escaped = i > 0 && line[i - 1] === '\\';
      if (char === '{' && !escaped) {
        if (depth > 0) value += char;
        depth++;
        continue;
      }
      if (char === '}' && !escaped) {
        depth--;
        if (depth === 0) break;
      }
      if (depth > 0) value += char;
    }
    return value;
  },

  cleanLatexText(value) {
    return (value || '')
      .replace(/\\(?:textbf|textit|emph|texttt|underline)\s*\{([^}]*)\}/g, '$1')
      .replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g, '')
      .replace(/[{}]/g, '')
      .replace(/~/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  isStructureFile(filePath) {
    return /\.(tex|bib|sty|cls)$/i.test(filePath);
  },

  async collectProjectStructure() {
    const textFiles = this.projectFiles
      .filter((file) => this.isStructureFile(file.path))
      .sort((a, b) => a.path.localeCompare(b.path));
    const sectionLevels = {
      part: 0,
      chapter: 1,
      section: 2,
      subsection: 3,
      subsubsection: 4,
      paragraph: 5,
      subparagraph: 6,
    };
    const structure = {
      sections: [],
      labels: [],
      environments: [],
      citations: [],
      refs: [],
      bibEntries: [],
      graphics: [],
      bibliographies: [],
      todos: [],
      filesRead: 0,
    };

    for (const file of textFiles) {
      let content = '';
      try {
        content = await this.readProjectTextFile(file.path);
        structure.filesRead++;
      } catch {
        continue;
      }

      const lines = content.split('\n');
      for (let index = 0; index < lines.length; index++) {
        const rawLine = lines[index];
        const line = this.stripLatexComment(rawLine);
        const lineNumber = index + 1;

        if (file.path.endsWith('.bib')) {
          const bibRegex = /@\w+\s*\{\s*([^,\s]+)\s*,/g;
          let bibMatch;
          while ((bibMatch = bibRegex.exec(line)) !== null) {
            structure.bibEntries.push({
              type: 'bib',
              title: bibMatch[1],
              file: file.path,
              line: lineNumber,
            });
          }
        }

        const todoMatch = rawLine.match(/%(TODO|FIXME|HACK|NOTE)\s*:?\s*(.*)/i);
        if (todoMatch) {
          structure.todos.push({
            type: todoMatch[1].toUpperCase(),
            text: todoMatch[2] || '(empty)',
            file: file.path,
            line: lineNumber,
          });
        }

        const sectionCommandRegex = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?/g;
        let sectionMatch;
        while ((sectionMatch = sectionCommandRegex.exec(line)) !== null) {
          const command = sectionMatch[1];
          const title = this.cleanLatexText(this.readLatexBraceArgument(line, sectionCommandRegex.lastIndex));
          if (!title) continue;
          structure.sections.push({
            type: 'section',
            command,
            level: sectionLevels[command],
            title,
            file: file.path,
            line: lineNumber,
          });
        }

        const envRegex = /\\begin\{(figure\*?|table\*?|equation\*?|align\*?)\}/g;
        let envMatch;
        while ((envMatch = envRegex.exec(line)) !== null) {
          structure.environments.push({
            type: 'environment',
            environment: envMatch[1],
            title: envMatch[1],
            file: file.path,
            line: lineNumber,
          });
        }

        const labelRegex = /\\label\s*\{([^}]+)\}/g;
        let labelMatch;
        while ((labelMatch = labelRegex.exec(line)) !== null) {
          structure.labels.push({
            type: 'label',
            title: labelMatch[1],
            file: file.path,
            line: lineNumber,
          });
        }

        const refRegex = /\\(?:ref|eqref|autoref|cref|Cref)\s*\{([^}]+)\}/g;
        let refMatch;
        while ((refMatch = refRegex.exec(line)) !== null) {
          structure.refs.push({
            type: 'ref',
            title: refMatch[1],
            file: file.path,
            line: lineNumber,
          });
        }

        const citeRegex = /\\(?:cite|citep|citet|parencite|textcite|autocite)\w*\s*\{([^}]+)\}/g;
        let citeMatch;
        while ((citeMatch = citeRegex.exec(line)) !== null) {
          citeMatch[1].split(',').map((item) => item.trim()).filter(Boolean).forEach((key) => {
            structure.citations.push({
              type: 'citation',
              title: key,
              file: file.path,
              line: lineNumber,
            });
          });
        }

        const graphicsRegex = /\\includegraphics(?:\[[^\]]*\])?\s*\{([^}]+)\}/g;
        let graphicsMatch;
        while ((graphicsMatch = graphicsRegex.exec(line)) !== null) {
          structure.graphics.push({
            type: 'graphic',
            title: graphicsMatch[1],
            file: file.path,
            line: lineNumber,
          });
        }

        const addBibRegex = /\\addbibresource(?:\[[^\]]*\])?\s*\{([^}]+)\}/g;
        let addBibMatch;
        while ((addBibMatch = addBibRegex.exec(line)) !== null) {
          structure.bibliographies.push({
            type: 'bibliography',
            title: addBibMatch[1],
            file: file.path,
            line: lineNumber,
          });
        }

        const bibliographyRegex = /\\bibliography\s*\{([^}]+)\}/g;
        let bibliographyMatch;
        while ((bibliographyMatch = bibliographyRegex.exec(line)) !== null) {
          bibliographyMatch[1].split(',').map((item) => item.trim()).filter(Boolean).forEach((bibFile) => {
            structure.bibliographies.push({
              type: 'bibliography',
              title: bibFile.endsWith('.bib') ? bibFile : `${bibFile}.bib`,
              file: file.path,
              line: lineNumber,
            });
          });
        }
      }
    }

    return structure;
  },

  renderOutlineGroup(title, items, kindLabel) {
    if (!items.length) return '';
    return `
      <section class="outline-group">
        <div class="outline-group-title">${this.escapeHtml(title)}</div>
        ${items.map((item) => this.renderOutlineItem(item, kindLabel)).join('')}
      </section>
    `;
  },

  renderOutlineItem(item, kindLabel) {
    const levelClass = item.level !== undefined ? ` level-${item.level}` : '';
    const activeClass = item.file === Editor.currentFilePath ? ' current-file' : '';
    const label = kindLabel || item.command || item.environment || item.type;
    return `
      <button class="outline-item${levelClass}${activeClass}" type="button" data-file="${this.escapeHtml(item.file)}" data-line="${item.line}">
        <span class="outline-item-kind">${this.escapeHtml(label)}</span>
        <span class="outline-item-main">
          <span class="outline-item-title">${this.escapeHtml(item.title || '(untitled)')}</span>
          <span class="outline-item-location">${this.escapeHtml(item.file)}:${item.line}</span>
        </span>
      </button>
    `;
  },

  bindStructureNavigation(container) {
    container.querySelectorAll('[data-file][data-line]').forEach((item) => {
      item.addEventListener('click', () => {
        const file = item.dataset.file;
        const line = parseInt(item.dataset.line, 10);
        if (!file) return;
        this.openFile(file);
        setTimeout(() => Editor.revealLine(line), 200);
      });
    });
  },

  async parseOutline() {
    const outlineEl = document.getElementById('outline-content');
    if (!outlineEl) return;
    outlineEl.innerHTML = '<div class="panel-loading">Parsing project structure...</div>';
    try {
      const structure = await this.collectProjectStructure();
      const sectionCount = structure.sections.length;
      const labelCount = structure.labels.length;
      const envCount = structure.environments.length;
      const citeCount = new Set(structure.citations.map((item) => item.title)).size;

      if (sectionCount + labelCount + envCount + citeCount === 0) {
        outlineEl.innerHTML = `
          <div class="panel-empty">
            <strong>No outline yet</strong>
            <span>Add \\section{}, \\label{}, figures, tables, or citations to build project navigation.</span>
          </div>
        `;
        return;
      }

      const uniqueCitations = Array.from(new Map(structure.citations.map((item) => [item.title, item])).values());
      outlineEl.innerHTML = `
        <div class="outline-summary">
          <span>${sectionCount} sections</span>
          <span>${labelCount} labels</span>
          <span>${envCount} floats/math</span>
          <span>${citeCount} cites</span>
        </div>
        ${this.renderOutlineGroup('Document Structure', structure.sections)}
        ${this.renderOutlineGroup('Figures, Tables & Equations', structure.environments, 'env')}
        ${this.renderOutlineGroup('Labels', structure.labels, 'label')}
        ${this.renderOutlineGroup('Citations', uniqueCitations, 'cite')}
      `;
      this.bindStructureNavigation(outlineEl);
    } catch (err) {
      outlineEl.innerHTML = `
        <div class="panel-empty error">
          <strong>Could not parse outline</strong>
          <span>${this.escapeHtml(err.message || 'Unknown parser error')}</span>
        </div>
      `;
    }
  },

  async parseReferences() {
    const refsEl = document.getElementById('refs-content');
    if (!refsEl) return;
    refsEl.innerHTML = '<div class="panel-loading">Checking labels, refs, and citations...</div>';
    try {
      const structure = await this.collectProjectStructure();
      const labelsByKey = new Map();
      const refsByKey = new Map();
      const bibKeys = new Set(structure.bibEntries.map((item) => item.title));

      structure.labels.forEach((item) => {
        if (!labelsByKey.has(item.title)) labelsByKey.set(item.title, []);
        labelsByKey.get(item.title).push(item);
      });
      structure.refs.forEach((item) => {
        if (!refsByKey.has(item.title)) refsByKey.set(item.title, []);
        refsByKey.get(item.title).push(item);
      });

      const brokenRefs = structure.refs
        .filter((item) => !labelsByKey.has(item.title))
        .map((item) => ({ ...item, kind: 'ref', severity: 'error', message: 'Referenced label was not found' }));
      const duplicateLabels = Array.from(labelsByKey.entries())
        .filter(([, items]) => items.length > 1)
        .flatMap(([key, items]) => items.map((item) => ({ ...item, title: key, kind: 'label', severity: 'warning', message: 'Duplicate label key' })));
      const unusedLabels = structure.labels
        .filter((item) => !refsByKey.has(item.title))
        .map((item) => ({ ...item, kind: 'label', severity: 'info', message: 'Label is not referenced in project' }));
      const missingCitations = structure.bibEntries.length === 0
        ? []
        : structure.citations
          .filter((item) => !bibKeys.has(item.title))
          .map((item) => ({ ...item, kind: 'cite', severity: 'warning', message: 'Citation key was not found in .bib files' }));

      const issueCount = brokenRefs.length + duplicateLabels.length + unusedLabels.length + missingCitations.length;
      refsEl.innerHTML = `
        <div class="outline-summary diagnostic-summary">
          <span class="${brokenRefs.length ? 'error' : ''}">${brokenRefs.length} broken refs</span>
          <span class="${duplicateLabels.length ? 'warning' : ''}">${duplicateLabels.length} duplicate labels</span>
          <span>${unusedLabels.length} unused labels</span>
          <span class="${missingCitations.length ? 'warning' : ''}">${missingCitations.length} missing cites</span>
        </div>
        ${issueCount === 0 ? `
          <div class="panel-empty">
            <strong>References look clean</strong>
            <span>No broken refs, duplicate labels, unused labels, or missing citation keys detected.</span>
          </div>
        ` : `
          ${this.renderDiagnosticGroup('Broken References', brokenRefs)}
          ${this.renderDiagnosticGroup('Duplicate Labels', duplicateLabels)}
          ${this.renderDiagnosticGroup('Unused Labels', unusedLabels)}
          ${this.renderDiagnosticGroup('Missing Citations', missingCitations)}
        `}
      `;
      this.bindStructureNavigation(refsEl);
    } catch (err) {
      refsEl.innerHTML = `
        <div class="panel-empty error">
          <strong>Could not check references</strong>
          <span>${this.escapeHtml(err.message || 'Unknown reference parser error')}</span>
        </div>
      `;
    }
  },

  renderDiagnosticGroup(title, items) {
    if (!items.length) return '';
    return `
      <section class="outline-group">
        <div class="outline-group-title">${this.escapeHtml(title)}</div>
        ${items.map((item) => `
          <button class="diagnostic-item ${this.escapeHtml(item.severity)}" type="button" data-file="${this.escapeHtml(item.file)}" data-line="${item.line}">
            <span class="diagnostic-kind">${this.escapeHtml(item.kind)}</span>
            <span class="outline-item-main">
              <span class="outline-item-title">${this.escapeHtml(item.title || '(empty key)')}</span>
              <span class="outline-item-location">${this.escapeHtml(item.message)} · ${this.escapeHtml(item.file)}:${item.line}</span>
            </span>
          </button>
        `).join('')}
      </section>
    `;
  },

  async showPreflightCheck() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal preflight-modal" role="dialog" aria-label="Preflight check">
        <div class="modal-heading-row">
          <div>
            <h2>Preflight Check</h2>
            <p class="modal-subtitle">Project checks before compile/export.</p>
          </div>
          <button class="btn-icon" type="button" id="preflight-close" title="Close preflight" aria-label="Close preflight">${Icons.x}</button>
        </div>
        <div id="preflight-body">
          <div class="panel-loading">Checking project...</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    const body = overlay.querySelector('#preflight-body');
    overlay.querySelector('#preflight-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    try {
      const structure = await this.collectProjectStructure();
      const filePaths = new Set(this.projectFiles.map((file) => this.normalizeProjectPath(file.path)));
      const labelKeys = new Set(structure.labels.map((item) => item.title));
      const refKeys = new Set(structure.refs.map((item) => item.title));
      const bibKeys = new Set(structure.bibEntries.map((item) => item.title));
      const labelsByKey = structure.labels.reduce((acc, item) => {
        if (!acc.has(item.title)) acc.set(item.title, []);
        acc.get(item.title).push(item);
        return acc;
      }, new Map());

      const checks = [];
      const addCheck = (severity, kind, title, message, file, line) => {
        checks.push({ severity, kind, title, message, file: file || Editor.currentFilePath || this.currentProject?.mainFile || '', line: line || 1 });
      };

      const mainFile = this.currentProject?.mainFile;
      if (!mainFile) {
        addCheck('warning', 'main', 'No main file configured', 'Set a main .tex file in Project Settings.');
      } else if (!filePaths.has(this.normalizeProjectPath(mainFile))) {
        addCheck('error', 'main', mainFile, 'Configured main file is missing from the project.');
      }

      structure.graphics.forEach((item) => {
        if (!this.projectPathExists(item.title, filePaths)) {
          addCheck('error', 'asset', item.title, 'Image/PDF asset referenced by includegraphics was not found.', item.file, item.line);
        }
      });

      structure.bibliographies.forEach((item) => {
        if (!this.projectPathExists(item.title, filePaths)) {
          addCheck('warning', 'bib', item.title, 'Bibliography file was not found.', item.file, item.line);
        }
      });

      structure.refs.forEach((item) => {
        if (!labelKeys.has(item.title)) {
          addCheck('error', 'ref', item.title, 'Referenced label was not found.', item.file, item.line);
        }
      });

      labelsByKey.forEach((items, key) => {
        if (items.length > 1) {
          items.forEach((item) => addCheck('warning', 'label', key, 'Duplicate label key.', item.file, item.line));
        }
      });

      structure.labels.forEach((item) => {
        if (!refKeys.has(item.title)) {
          addCheck('info', 'label', item.title, 'Label is currently unused.', item.file, item.line);
        }
      });

      if (structure.bibEntries.length > 0) {
        structure.citations.forEach((item) => {
          if (!bibKeys.has(item.title)) {
            addCheck('warning', 'cite', item.title, 'Citation key was not found in .bib files.', item.file, item.line);
          }
        });
      }

      const errorCount = checks.filter((item) => item.severity === 'error').length;
      const warningCount = checks.filter((item) => item.severity === 'warning').length;
      const infoCount = checks.filter((item) => item.severity === 'info').length;
      body.innerHTML = `
        <div class="outline-summary diagnostic-summary">
          <span class="${errorCount ? 'error' : ''}">${errorCount} errors</span>
          <span class="${warningCount ? 'warning' : ''}">${warningCount} warnings</span>
          <span>${infoCount} notes</span>
        </div>
        ${checks.length === 0 ? `
          <div class="panel-empty">
            <strong>Project is ready</strong>
            <span>No missing main file, assets, bibliography files, labels, refs, or citations detected.</span>
          </div>
        ` : `
          <div class="preflight-list">
            ${checks.map((item) => `
              <button class="diagnostic-item ${this.escapeHtml(item.severity)}" type="button" data-file="${this.escapeHtml(item.file)}" data-line="${item.line}">
                <span class="diagnostic-kind">${this.escapeHtml(item.kind)}</span>
                <span class="outline-item-main">
                  <span class="outline-item-title">${this.escapeHtml(item.title)}</span>
                  <span class="outline-item-location">${this.escapeHtml(item.message)} · ${this.escapeHtml(item.file)}:${item.line}</span>
                </span>
              </button>
            `).join('')}
          </div>
        `}
      `;
      this.bindStructureNavigation(body);
    } catch (err) {
      body.innerHTML = `
        <div class="panel-empty error">
          <strong>Could not run preflight</strong>
          <span>${this.escapeHtml(err.message || 'Unknown preflight error')}</span>
        </div>
      `;
    }
  },

  async parseTodos() {
    const todoEl = document.getElementById('todo-content');
    if (!todoEl) return;
    todoEl.innerHTML = '<div class="panel-loading">Scanning comments...</div>';
    try {
      const structure = await this.collectProjectStructure();
      const items = structure.todos;
      if (items.length === 0) {
        todoEl.innerHTML = `
          <div class="panel-empty">
            <strong>No TODOs found</strong>
            <span>Use comments like % TODO: revise introduction or % FIXME: check equation.</span>
          </div>
        `;
        return;
      }
      const counts = items.reduce((acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
      }, {});
      todoEl.innerHTML = `
        <div class="outline-summary">
          ${Object.keys(counts).sort().map((key) => `<span>${this.escapeHtml(key)} ${counts[key]}</span>`).join('')}
        </div>
        <section class="outline-group">
          <div class="outline-group-title">Comment Tasks</div>
          ${items.map((item) => `
            <button class="todo-item ${item.type === 'FIXME' ? 'error' : item.type === 'HACK' ? 'warning' : ''}" type="button" data-file="${this.escapeHtml(item.file)}" data-line="${item.line}">
              <span class="todo-kind">${this.escapeHtml(item.type)}</span>
              <span class="outline-item-main">
                <span class="outline-item-title">${this.escapeHtml(item.text || '(empty)')}</span>
                <span class="outline-item-location">${this.escapeHtml(item.file)}:${item.line}</span>
              </span>
            </button>
          `).join('')}
        </section>
      `;
      this.bindStructureNavigation(todoEl);
    } catch (err) {
      todoEl.innerHTML = `
        <div class="panel-empty error">
          <strong>Could not parse TODOs</strong>
          <span>${this.escapeHtml(err.message || 'Unknown parser error')}</span>
        </div>
      `;
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
    return LightTeXFeatures.fileActions.renameFile(this, oldPath, newPath);
  },

  showRenameFileModal(oldPath) {
    return LightTeXFeatures.fileActions.showRenameFileModal(this, oldPath);
  },

  showProjectSettingsModal() {
    const project = this.currentProject || {};
    const canManage = this.canManageProject();
    const disabled = canManage ? '' : 'disabled';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal settings-modal">
        <h2>Project Settings</h2>
        <form id="project-settings-form">
          <div class="form-grid two-col">
            <div class="form-group">
              <label for="settings-name">Name</label>
              <input id="settings-name" type="text" value="${this.escapeHtml(project.name || '')}" required ${disabled}>
            </div>
            <div class="form-group">
              <label for="settings-compiler">Compiler</label>
              <select id="settings-compiler" ${disabled}>
                ${['pdflatex', 'xelatex', 'lualatex'].map(c => `<option value="${c}" ${project.compiler === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label for="settings-description">Description</label>
            <textarea id="settings-description" rows="3" ${disabled}>${this.escapeHtml(project.description || '')}</textarea>
          </div>
          <div class="form-group">
            <label for="settings-main-file">Main file</label>
            <select id="settings-main-file" ${disabled}>
              ${this.projectFiles.filter(f => f.path.endsWith('.tex')).map(f => `<option value="${this.escapeHtml(f.path)}" ${project.mainFile === f.path ? 'selected' : ''}>${this.escapeHtml(f.path)}</option>`).join('')}
            </select>
          </div>
          <div class="settings-section">
            <h3>Access</h3>
            <div class="settings-access-row">
              <span class="access-badge ${this.projectRole()}">${this.roleLabel()}</span>
              <span>${project.ownerEmail ? `Owner: ${this.escapeHtml(project.ownerName || project.ownerEmail)}` : 'You own this project'}</span>
            </div>
          </div>
          ${canManage ? `
            <div class="settings-section" id="sharing-section">
              <h3>Sharing</h3>
              <div class="share-add-row">
                <input id="share-email" type="email" placeholder="collaborator@example.com" autocomplete="off">
                <select id="share-role">
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
                <button class="btn btn-secondary btn-small" type="button" id="share-add">${Icons.plus16} Add</button>
              </div>
              <div class="field-error" id="share-error" role="alert"></div>
              <div class="share-list" id="share-list">
                <div class="panel-loading">Loading collaborators...</div>
              </div>
            </div>
          ` : ''}
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
            ${canManage ? '<button class="btn btn-primary" type="submit" id="settings-save">Save settings</button>' : ''}
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
    if (canManage) {
      const renderSharing = async () => {
        const list = overlay.querySelector('#share-list');
        list.innerHTML = '<div class="panel-loading">Loading collaborators...</div>';
        try {
          const payload = await api.get(`/projects/${this.currentProjectId}/collaborators`);
          const owner = payload.owner;
          const collaborators = payload.collaborators || [];
          list.innerHTML = `
            ${owner ? `
              <div class="share-row owner">
                <span>
                  <strong>${this.escapeHtml(owner.email)}</strong>
                  <small>${this.escapeHtml(owner.name || 'Project owner')}</small>
                </span>
                <span class="access-badge owner">Owner</span>
              </div>
            ` : ''}
            ${collaborators.length === 0 ? `
              <div class="panel-empty compact">
                <strong>No collaborators</strong>
                <span>Add registered users by email.</span>
              </div>
            ` : collaborators.map((item) => `
              <div class="share-row" data-collaborator="${this.escapeHtml(item.id)}">
                <span>
                  <strong>${this.escapeHtml(item.email)}</strong>
                  <small>${this.escapeHtml(item.name || 'Registered user')}</small>
                </span>
                <select data-share-role="${this.escapeHtml(item.id)}">
                  <option value="viewer" ${item.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                  <option value="editor" ${item.role === 'editor' ? 'selected' : ''}>Editor</option>
                </select>
                <button class="btn btn-danger btn-small" type="button" data-share-remove="${this.escapeHtml(item.id)}">${Icons.trash14}</button>
              </div>
            `).join('')}
          `;

          list.querySelectorAll('[data-share-role]').forEach((select) => {
            select.addEventListener('change', async () => {
              try {
                await api.put(`/projects/${this.currentProjectId}/collaborators/${select.dataset.shareRole}`, { role: select.value });
                this.notify('Collaborator role updated', 'success');
              } catch (err) {
                this.notify('Role update failed: ' + err.message, 'error');
                renderSharing();
              }
            });
          });
          list.querySelectorAll('[data-share-remove]').forEach((button) => {
            button.addEventListener('click', async () => {
              if (!confirm('Remove this collaborator?')) return;
              try {
                await api.del(`/projects/${this.currentProjectId}/collaborators/${button.dataset.shareRemove}`);
                this.notify('Collaborator removed', 'success');
                renderSharing();
              } catch (err) {
                this.notify('Remove failed: ' + err.message, 'error');
              }
            });
          });
        } catch (err) {
          list.innerHTML = `
            <div class="panel-empty error">
              <strong>Could not load collaborators</strong>
              <span>${this.escapeHtml(err.message || 'Unknown sharing error')}</span>
            </div>
          `;
        }
      };

      overlay.querySelector('#share-add').addEventListener('click', async () => {
        const email = overlay.querySelector('#share-email').value.trim();
        const role = overlay.querySelector('#share-role').value;
        const error = overlay.querySelector('#share-error');
        error.textContent = '';
        if (!email) {
          error.textContent = 'Email required.';
          return;
        }
        try {
          await api.post(`/projects/${this.currentProjectId}/collaborators`, { email, role });
          overlay.querySelector('#share-email').value = '';
          this.notify('Collaborator added', 'success');
          renderSharing();
        } catch (err) {
          error.textContent = err.message;
        }
      });
      renderSharing();
    }
    overlay.querySelector('#project-settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!this.ensureCanManage('save project settings')) return;
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
    overlay.querySelector(canManage ? '#settings-name' : '#copy-cli-command').focus();
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
      } else if (e.key === '\\') {
        e.preventDefault();
        this.toggleFocusMode();
      } else if (e.altKey && e.key === '1') {
        e.preventDefault();
        this.setWorkspaceMode('split');
      } else if (e.altKey && e.key === '2') {
        e.preventDefault();
        this.setWorkspaceMode('editor');
      } else if (e.altKey && e.key === '3') {
        e.preventDefault();
        this.setWorkspaceMode('pdf');
      } else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        this.showShortcutsModal();
      }
    };
    document.addEventListener('keydown', this.editorShortcutHandler);
  },

  showSymbolsPalette() {
    return LightTeXFeatures.commandPalette.showSymbolsPalette(this);
  },

  showCommandPalette(mode = 'commands') {
    return LightTeXFeatures.commandPalette.showCommandPalette(this, mode);
  },

  showCreateSnapshotModal() {
    return LightTeXFeatures.historyModal.showCreateSnapshotModal(this);
  },

  async showHistoryModal() {
    return LightTeXFeatures.historyModal.showHistoryModal(this);
  },

  async loadSnapshotDetails() {
    return LightTeXFeatures.historyModal.loadSnapshotDetails(this);
  },

  formatSnapshotLabel(snapshot) {
    return LightTeXCore.format.formatSnapshotLabel(snapshot);
  },

  snapshotMessage(snapshot, index) {
    return LightTeXCore.format.snapshotMessage(snapshot, index);
  },

  formatSnapshotDate(timestamp) {
    return LightTeXCore.format.formatSnapshotDate(timestamp);
  },

  parseSnapshotDate(timestamp) {
    return LightTeXCore.format.parseSnapshotDate(timestamp);
  },

  async loadDiff(filePath, timestamp, diffContainer) {
    return LightTeXFeatures.historyModal.loadDiff(this, filePath, timestamp, diffContainer);
  },

  escapeHtml(str) {
    return LightTeXCore.dom.escapeHtml(str);
  },

  async showSearchModal() {
    return LightTeXFeatures.searchModal.show(this);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
