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
    } else if (hash.startsWith('/invite/')) {
      const token = decodeURIComponent(hash.slice('/invite/'.length));
      localStorage.setItem('pendingProjectInvite', token);
      if (!api.isAuthenticated) {
        Auth.render(app);
      } else {
        this.acceptProjectInvite(token);
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
    return LightTeXFeatures.editorWorkspace.show(this, container, projectId);
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
  },

  showCommentsModal() {
    return LightTeXFeatures.collaborationCenter.showComments(this);
  },

  acceptProjectInvite(token) {
    return LightTeXFeatures.collaborationCenter.acceptInvite(this, token);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init(), { once: true });
} else {
  App.init();
}
