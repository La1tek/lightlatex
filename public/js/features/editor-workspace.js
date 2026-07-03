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
            <button class="btn btn-primary btn-small" id="compile-btn" title="Ctrl+S">${Icons.play16} Compile</button>
          </div>
          <div class="editor-toolbar-right">
            <button class="sync-status synced" id="sync-status-btn" type="button" title="CLI sync status">${Icons.sync16} Synced</button>
            <button class="btn btn-secondary btn-small" id="settings-btn" title="Project settings">${Icons.settings} Settings</button>
            <button class="btn-icon" id="toggle-theme-btn" title="Toggle theme" aria-label="Toggle theme">${currentTheme === 'dark' ? Icons.moon16 : Icons.sun16}</button>
            <button class="btn-icon" id="editor-logout-btn" title="Logout" aria-label="Logout">${Icons.logout16}</button>
          </div>
        </div>
        <div class="editor-main">
          <div class="sidebar">
            <div class="sidebar-header">
              <span>FILES</span>
            </div>
            <div class="sidebar-tabs">
              <button class="sidebar-tab active" data-tab="files">Files</button>
              <button class="sidebar-tab" data-tab="outline">${Icons.outline16} Outline</button>
              <button class="sidebar-tab" data-tab="refs">${Icons.link16} Refs</button>
              <button class="sidebar-tab" data-tab="todo">${Icons.todo16} TODO</button>
            </div>
            <div class="sidebar-file-actions" id="sidebar-file-actions">
              <button class="btn btn-secondary btn-small" id="new-file-btn" type="button" title="New file">${Icons.plus16} New file</button>
              <button class="btn btn-secondary btn-small" id="upload-image-btn" type="button" title="Upload image or PDF asset">${Icons.upload16} Upload</button>
            </div>
            <div class="tree-container" id="file-tree"></div>
            <div class="recent-files-panel" id="recent-files-panel"></div>
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
          <div class="sidebar-resizer" id="sidebar-resizer" role="separator" aria-orientation="vertical" aria-label="Resize file sidebar" tabindex="0"></div>
          <div class="editor-pane">
            <div class="editor-actionbar" aria-label="Editor tools">
              <div class="editor-action-primary" aria-label="Editor quick tools">
                <button class="btn btn-secondary btn-small" id="search-btn" title="Ctrl+Shift+F">${Icons.search16} Search</button>
                <button class="btn btn-secondary btn-small" id="comments-btn" title="Comments">${Icons.comment16} Comments</button>
                <button class="btn btn-secondary btn-small" id="symbols-btn" title="LaTeX symbols">${Icons.symbols16} Symbols</button>
                <button class="btn btn-secondary btn-small" id="citation-manager-btn" title="Citation manager">${Icons.cite16} Cite</button>
                <button class="btn btn-secondary btn-small" id="asset-manager-btn" title="Asset manager">${Icons.image16} Assets</button>
              </div>
              <div class="editor-action-spacer"></div>
              <div class="editor-more-menu" id="editor-more-menu">
                <button class="btn btn-secondary btn-small" id="editor-more-btn" type="button" aria-expanded="false" aria-controls="editor-more-popover">${Icons.chevronDown} More</button>
                <div class="editor-more-popover" id="editor-more-popover" hidden>
                  <button class="editor-more-item" id="spellcheck-btn" type="button">${Icons.spellcheck16}<span>Spellcheck</span></button>
                  <button class="editor-more-item" id="preflight-btn" type="button">${Icons.check14}<span>Preflight check</span></button>
                  <button class="editor-more-item" id="autocompile-btn" type="button">${Icons.autoCompile16}<span>Auto compile</span></button>
                  <button class="editor-more-item" id="history-btn" type="button">${Icons.clock14}<span>History</span></button>
                  <button class="editor-more-item" id="snapshot-btn" type="button">${Icons.save16}<span>Snapshot</span></button>
                  <button class="editor-more-item" id="download-btn" type="button">${Icons.download16}<span>Download ZIP</span></button>
                  <button class="editor-more-item" id="toggle-preview-btn" type="button">${Icons.eye16}<span>Preview</span></button>
                  <button class="editor-more-item" id="layout-btn" type="button">${Icons.layout16}<span>Split</span></button>
                  <button class="editor-more-item" id="focus-btn" type="button">${Icons.focus16}<span>Focus</span></button>
                  <button class="editor-more-item" id="shortcuts-btn" type="button">${Icons.keyboard16}<span>Keyboard shortcuts</span></button>
                </div>
              </div>
            </div>
            <div class="editor-tabbar">
              <div class="editor-tab active" id="current-file-tab">${Icons.fileTex} No file</div>
            </div>
            <div class="editor-container" id="monaco-editor"></div>
          </div>
          <div class="preview-pane" id="preview-pane">
            <div class="preview-header">
              <span id="pdf-page-info">PDF Preview</span>
              <div class="preview-nav">
                <button class="btn-icon" id="pdf-prev" title="Previous page" aria-label="Previous PDF page">${Icons.chevronLeft16}</button>
                <span id="pdf-page-num"></span>
                <button class="btn-icon" id="pdf-next" title="Next page" aria-label="Next PDF page">${Icons.chevronRight16}</button>
                <button class="btn btn-secondary btn-tiny" id="pdf-fit-width" type="button">Fit</button>
                <button class="btn btn-secondary btn-tiny" id="download-pdf-btn" title="Download PDF" type="button">${Icons.download16} PDF</button>
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
    LightTeXFeatures.fileActions.renderRecentFiles(app);
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
    bindEditorMoreMenu();
    bindSidebarResize(app);
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
        document.getElementById('sidebar-file-actions').style.display = tabName === 'files' ? '' : 'none';
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
      app.logout();
    });
    document.getElementById('new-file-btn').addEventListener('click', () => app.promptNewFile());
    document.getElementById('pdf-prev').addEventListener('click', () => { Preview.prevPage(); app.updatePdfPageInfo(); });
    document.getElementById('pdf-next').addEventListener('click', () => { Preview.nextPage(); app.updatePdfPageInfo(); });
    document.getElementById('pdf-fit-width').addEventListener('click', async () => { await Preview.setZoom('fit-width'); app.updatePdfPageInfo(); });
    document.getElementById('pdf-refresh').addEventListener('click', () => app.loadPdf());
    document.getElementById('pdf-copy-link').addEventListener('click', async () => {
      const endpoint = `${window.location.origin}/api/projects/${app.currentProjectId}/output.pdf`;
      try {
        const copied = await LightTeXCore.clipboard.copyText(endpoint);
        if (!copied) throw new Error('Clipboard unavailable');
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

  function bindEditorMoreMenu() {
    const menu = document.getElementById('editor-more-menu');
    const button = document.getElementById('editor-more-btn');
    const popover = document.getElementById('editor-more-popover');
    if (!menu || !button || !popover) return;

    const close = () => {
      popover.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    };

    const toggle = () => {
      const nextOpen = popover.hidden;
      popover.hidden = !nextOpen;
      button.setAttribute('aria-expanded', String(nextOpen));
    };

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      toggle();
    });

    popover.querySelectorAll('button').forEach((item) => {
      item.addEventListener('click', () => setTimeout(close, 0));
    });

    document.addEventListener('click', (event) => {
      if (!menu.contains(event.target)) close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
  }

  function clampSidebarWidth(value) {
    return Math.max(200, Math.min(400, value));
  }

  function setSidebarWidth(width, persist = true) {
    const nextWidth = clampSidebarWidth(width);
    document.documentElement.style.setProperty('--sidebar-width', `${nextWidth}px`);
    if (persist) localStorage.setItem('lighttex-sidebar-width', String(nextWidth));
    Editor.layout();
  }

  function refreshWorkspaceLayout(app, rerenderPreview = false) {
    Editor.layout();
    if (rerenderPreview && app.workspaceMode !== 'editor' && typeof Preview !== 'undefined' && pdfDoc) {
      Preview.renderAllPages().then(() => app.updatePdfPageInfo()).catch(() => {});
    }
  }

  function bindSidebarResize(app) {
    const resizer = document.getElementById('sidebar-resizer');
    const savedWidth = parseInt(localStorage.getItem('lighttex-sidebar-width') || '', 10);
    if (Number.isFinite(savedWidth)) setSidebarWidth(savedWidth, false);
    if (!resizer) return;

    let dragStartX = 0;
    let dragStartWidth = savedWidth || 240;
    let dragging = false;

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('resizing-sidebar');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', endDrag);
      refreshWorkspaceLayout(app, true);
    };

    const onMove = (event) => {
      if (!dragging) return;
      setSidebarWidth(dragStartWidth + event.clientX - dragStartX);
      refreshWorkspaceLayout(app);
    };

    resizer.addEventListener('pointerdown', (event) => {
      if (window.matchMedia('(max-width: 820px)').matches) return;
      dragging = true;
      dragStartX = event.clientX;
      dragStartWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'), 10) || 240;
      document.body.classList.add('resizing-sidebar');
      resizer.setPointerCapture?.(event.pointerId);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', endDrag);
      event.preventDefault();
    });

    resizer.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const current = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'), 10) || 240;
      if (event.key === 'Home') setSidebarWidth(200);
      else if (event.key === 'End') setSidebarWidth(400);
      else setSidebarWidth(current + (event.key === 'ArrowRight' ? 16 : -16));
      refreshWorkspaceLayout(app, true);
    });
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
