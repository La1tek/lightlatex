(function () {
  window.LightTeXFeatures = window.LightTeXFeatures || {};

  async function show(app, container, projectId) {
    app.currentProjectId = projectId;
    Editor.dispose();
    Preview.clear();
    app.fileTree = null;
    app.devMode = localStorage.getItem('lighttex-dev-mode') === 'true';

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
            <button class="btn btn-secondary btn-small" id="comments-btn" title="Comments">${Icons.comment16} Comments</button>
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
                <button class="btn-icon" id="pdf-refresh" title="Refresh PDF" aria-label="Refresh PDF">${Icons.sync16}</button>
                <button class="btn-icon" id="pdf-copy-link" title="Copy PDF endpoint" aria-label="Copy PDF endpoint">${Icons.link16}</button>
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
              <button type="button" data-log-tab="jobs">Jobs</button>
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

    let project;
    try {
      project = await api.get(`/projects/${projectId}`);
      app.currentProject = project;
      app.accessRole = project.accessRole || 'owner';
      document.getElementById('editor-project-name').textContent = project.name;
      app.applyProjectPermissions();
    } catch {
      container.innerHTML = `<div class="empty-state"><div class="icon">${Icons.xCircle}</div><p>Project not found</p></div>`;
      return;
    }

    try {
      app.projectFiles = await api.get(`/projects/${projectId}/files`);
    } catch {
      app.projectFiles = [];
    }

    try {
      app.imageFiles = await api.get(`/projects/${projectId}/images`);
    } catch {
      app.imageFiles = [];
    }

    bindSidebarTabs(app);

    app.fileTree = new FileTree(document.getElementById('file-tree'), {
      projectId: projectId,
      onSelect: (path) => app.openFile(path),
      onCreate: () => app.promptNewFile(),
      onDelete: (path) => app.deleteFile(path),
      onRename: (oldPath, newPath) => app.renameFile(oldPath, newPath),
      devMode: app.devMode,
      readOnly: !app.canEditProject(),
    });
    app.fileTree.setFiles(app.projectFiles);
    app.refreshFileHashes();

    if (project.mainFile && app.projectFiles.some(f => f.path === project.mainFile)) {
      app.openFile(project.mainFile);
    } else if (app.projectFiles.length > 0) {
      app.openFile(app.projectFiles[0].path);
    }

    const editorEl = document.getElementById('monaco-editor');
    Editor.init(editorEl, {
      value: '% Loading...',
      imageFiles: app.imageFiles,
      onReady: () => {
        if (app.fileTree.selectedPath) {
          app.openFile(app.fileTree.selectedPath);
        }
      },
      onDirty: () => {
        const saveState = document.getElementById('save-state');
        if (saveState) saveState.textContent = 'Unsaved changes';
        app.updateSyncStatus('local', 'Unsaved local editor changes');
        app.queueStructureRefresh();
      },
      onCompile: () => app.compile(),
      readOnly: !app.canEditProject(),
    });

    const previewContainer = document.getElementById('preview-container');
    previewContainer.innerHTML = '';
    Preview.init(previewContainer);
    app.workspaceMode = localStorage.getItem('lighttex-workspace-mode') || 'split';
    app.focusMode = localStorage.getItem('lighttex-focus-mode') === 'true';
    if (window.matchMedia('(max-width: 1180px)').matches && app.workspaceMode === 'split') {
      app.workspaceMode = 'editor';
    }
    app.setWorkspaceMode(app.workspaceMode, { persist: false });
    app.applyFocusMode();

    app.loadPdf();
    bindToolbar(app);
    bindAssetUpload(app);
    bindAutosave(app);
    bindSpellcheck();
    bindDragAndDrop(app);
    bindProjectNameEditing(app, project, projectId);

    app.bindEditorShortcuts();
    app.refreshCitationCache();
  }

  function bindSidebarTabs(app) {
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
        if (tabName === 'outline') app.parseOutline();
        if (tabName === 'refs') app.parseReferences();
        if (tabName === 'todo') app.parseTodos();
      });
    });
  }

  function bindToolbar(app) {
    document.getElementById('compile-btn').addEventListener('click', () => app.compile());
    document.getElementById('sync-status-btn').addEventListener('click', () => app.showSyncCenter());
    document.getElementById('compile-status').addEventListener('click', () => {
      app.openCompilePanel();
    });
    document.getElementById('download-btn').addEventListener('click', () => app.downloadProject());
    document.getElementById('download-pdf-btn').addEventListener('click', () => app.downloadPdf());
    document.getElementById('toggle-preview-btn').addEventListener('click', () => app.togglePreview());
    document.getElementById('layout-btn').addEventListener('click', () => app.showLayoutModal());
    document.getElementById('focus-btn').addEventListener('click', () => app.toggleFocusMode());
    document.getElementById('shortcuts-btn').addEventListener('click', () => app.showShortcutsModal());
    document.getElementById('settings-btn').addEventListener('click', () => app.showProjectSettingsModal());
    document.getElementById('preflight-btn').addEventListener('click', () => app.showPreflightCheck());
    document.getElementById('toggle-theme-btn').addEventListener('click', () => app.toggleTheme());
    document.getElementById('editor-logout-btn').addEventListener('click', () => {
      api.clearTokens();
      window.location.hash = '#/login';
    });
    document.getElementById('new-file-btn').addEventListener('click', () => app.promptNewFile());
    document.getElementById('pdf-prev').addEventListener('click', () => { Preview.prevPage(); app.updatePdfPageInfo(); });
    document.getElementById('pdf-next').addEventListener('click', () => { Preview.nextPage(); app.updatePdfPageInfo(); });
    document.getElementById('pdf-fit-width').addEventListener('click', async () => { await Preview.setZoom('fit-width'); app.updatePdfPageInfo(); });
    document.getElementById('pdf-refresh').addEventListener('click', () => app.loadPdf());
    document.getElementById('pdf-copy-link').addEventListener('click', async () => {
      try {
        await navigator.clipboard?.writeText(`${window.location.origin}/api/projects/${app.currentProjectId}/output.pdf`);
        app.notify('PDF endpoint copied', 'success');
      } catch {
        app.notify('Could not copy PDF endpoint automatically', 'error');
      }
    });
    document.getElementById('pdf-zoom-out').addEventListener('click', async () => { await Preview.zoomOut(); app.updatePdfPageInfo(); });
    document.getElementById('pdf-zoom-in').addEventListener('click', async () => { await Preview.zoomIn(); app.updatePdfPageInfo(); });
    document.getElementById('compile-panel-close').addEventListener('click', () => app.closeCompilePanel());
    app.applyProjectPermissions();
    document.querySelectorAll('[data-log-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-log-tab]').forEach((tab) => tab.classList.remove('active'));
        btn.classList.add('active');
        app.renderCompilePanel(btn.dataset.logTab);
      });
    });
    document.getElementById('search-btn').addEventListener('click', () => app.showSearchModal());
    document.getElementById('comments-btn').addEventListener('click', () => app.showCommentsModal());
    document.getElementById('symbols-btn').addEventListener('click', () => app.showSymbolsPalette());
    document.getElementById('citation-manager-btn').addEventListener('click', () => app.showCitationManager());
    document.getElementById('history-btn').addEventListener('click', () => app.showHistoryModal());
    document.getElementById('snapshot-btn').addEventListener('click', () => app.showCreateSnapshotModal());
  }

  function bindAssetUpload(app) {
    const uploadImgBtn = document.getElementById('upload-image-btn');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png,image/jpeg,image/gif,image/svg+xml,application/pdf';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    uploadImgBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => app.uploadImages(fileInput.files));
    document.getElementById('asset-manager-btn').addEventListener('click', () => app.showAssetManager());
  }

  function bindAutosave(app) {
    let autoCompileEnabled = false;
    let autoCompileTimer = null;
    document.getElementById('autocompile-btn').addEventListener('click', () => {
      if (!app.ensureCanEdit('use auto-compile')) return;
      autoCompileEnabled = !autoCompileEnabled;
      document.getElementById('autocompile-btn').classList.toggle('active', autoCompileEnabled);
      app.notify(autoCompileEnabled ? 'Auto-compile ON (compiles 3s after save)' : 'Auto-compile OFF', 'info');
    });

    const origAutosave = Editor.autosave.bind(Editor);
    Editor.autosave = async () => {
      const saveState = document.getElementById('save-state');
      if (!app.canEditProject()) {
        if (saveState) saveState.textContent = 'Read-only';
        return;
      }
      if (saveState) saveState.textContent = 'Saving...';
      await origAutosave();
      if (saveState) saveState.textContent = 'Saved just now';
      app.updateWordCount();
      app.queueStructureRefresh();
      app.refreshFileHashes();
      if (Editor.currentFilePath && Editor.currentFilePath.endsWith('.bib')) app.refreshCitationCache();
      if (autoCompileEnabled) {
        clearTimeout(autoCompileTimer);
        autoCompileTimer = setTimeout(() => app.compile(), 3000);
      }
    };
  }

  function bindSpellcheck() {
    let spellEnabled = false;
    document.getElementById('spellcheck-btn').addEventListener('click', () => {
      spellEnabled = !spellEnabled;
      document.getElementById('spellcheck-btn').classList.toggle('active', spellEnabled);
      Editor.toggleSpellcheck(spellEnabled);
    });
  }

  function bindDragAndDrop(app) {
    const editorPane = document.querySelector('.editor-pane');
    editorPane.addEventListener('dragover', (e) => { e.preventDefault(); editorPane.classList.add('drag-over'); });
    editorPane.addEventListener('dragleave', () => { editorPane.classList.remove('drag-over'); });
    editorPane.addEventListener('drop', async (e) => {
      e.preventDefault();
      editorPane.classList.remove('drag-over');
      if (!app.ensureCanEdit('upload assets')) return;
      if (e.dataTransfer.files.length > 0) {
        await app.uploadImages(e.dataTransfer.files);
      }
    });
  }

  function bindProjectNameEditing(app, project, projectId) {
    const nameEl = document.getElementById('editor-project-name');
    nameEl.contentEditable = app.canManageProject() ? 'true' : 'false';
    if (app.canManageProject()) {
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
      nameEl.title = `Shared project · ${app.roleLabel()}`;
    }
  }

  window.LightTeXFeatures.editorWorkspace = { show };
})();
