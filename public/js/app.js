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
    return LightTeXFeatures.compilePanel.compile(this);
  },

  showCompileErrorsModal() {
    this.openCompilePanel();
  },

  openCompilePanel() {
    return LightTeXFeatures.compilePanel.openCompilePanel(this);
  },

  closeCompilePanel() {
    return LightTeXFeatures.compilePanel.closeCompilePanel(this);
  },

  renderCompilePanel(tab = 'issues') {
    return LightTeXFeatures.compilePanel.renderCompilePanel(this, tab);
  },

  async loadPdf() {
    return LightTeXFeatures.compilePanel.loadPdf(this);
  },

  updatePdfPageInfo() {
    return LightTeXFeatures.compilePanel.updatePdfPageInfo(this);
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
    return LightTeXFeatures.diagnostics.getActiveSidebarTab(this);
  },

  queueStructureRefresh() {
    return LightTeXFeatures.diagnostics.queueStructureRefresh(this);
  },

  refreshActiveSidebarPanel() {
    return LightTeXFeatures.diagnostics.refreshActiveSidebarPanel(this);
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
    return LightTeXFeatures.diagnostics.stripLatexComment(line);
  },

  readLatexBraceArgument(line, startIndex) {
    return LightTeXFeatures.diagnostics.readLatexBraceArgument(line, startIndex);
  },

  cleanLatexText(value) {
    return LightTeXFeatures.diagnostics.cleanLatexText(value);
  },

  isStructureFile(filePath) {
    return LightTeXFeatures.diagnostics.isStructureFile(filePath);
  },

  async collectProjectStructure() {
    return LightTeXFeatures.diagnostics.collectProjectStructure(this);
  },

  renderOutlineGroup(title, items, kindLabel) {
    return LightTeXFeatures.diagnostics.renderOutlineGroup(this, title, items, kindLabel);
  },

  renderOutlineItem(item, kindLabel) {
    return LightTeXFeatures.diagnostics.renderOutlineItem(this, item, kindLabel);
  },

  bindStructureNavigation(container) {
    return LightTeXFeatures.diagnostics.bindStructureNavigation(this, container);
  },

  async parseOutline() {
    return LightTeXFeatures.diagnostics.parseOutline(this);
  },

  async parseReferences() {
    return LightTeXFeatures.diagnostics.parseReferences(this);
  },

  renderDiagnosticGroup(title, items) {
    return LightTeXFeatures.diagnostics.renderDiagnosticGroup(this, title, items);
  },

  async showPreflightCheck() {
    return LightTeXFeatures.diagnostics.showPreflightCheck(this);
  },

  async parseTodos() {
    return LightTeXFeatures.diagnostics.parseTodos(this);
  },

  updateWordCount() {
    return LightTeXFeatures.compilePanel.updateWordCount(this);
  },

  async renameFile(oldPath, newPath) {
    return LightTeXFeatures.fileActions.renameFile(this, oldPath, newPath);
  },

  showRenameFileModal(oldPath) {
    return LightTeXFeatures.fileActions.showRenameFileModal(this, oldPath);
  },

  showProjectSettingsModal() {
    return LightTeXFeatures.projectSettings.show(this);
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
