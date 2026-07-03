(function () {
  window.LightTeXFeatures = window.LightTeXFeatures || {};

  const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']);
  const PDF_EXTENSIONS = new Set(['pdf']);

  function fileExtension(path) {
    return String(path || '').split('.').pop().toLowerCase();
  }

  function isPreviewFile(path) {
    const ext = fileExtension(path);
    return IMAGE_EXTENSIONS.has(ext) || PDF_EXTENSIONS.has(ext);
  }

  function fileIcon(path) {
    const ext = fileExtension(path);
    if (IMAGE_EXTENSIONS.has(ext)) return Icons.fileImage;
    if (PDF_EXTENSIONS.has(ext)) return Icons.filePdf;
    if (ext === 'bib') return Icons.fileBib;
    if (ext === 'sty') return Icons.fileSty;
    if (ext === 'tex') return Icons.fileTex;
    return Icons.file;
  }

  function resetFilePreview(app) {
    const editorEl = document.getElementById('monaco-editor');
    const previewEl = document.getElementById('file-preview-panel');
    if (app.filePreviewObjectUrl) {
      URL.revokeObjectURL(app.filePreviewObjectUrl);
      app.filePreviewObjectUrl = null;
    }
    if (editorEl) editorEl.classList.remove('hidden');
    if (previewEl) {
      previewEl.classList.add('hidden');
      previewEl.innerHTML = '';
    }
    Editor.layout();
  }

  function showFilePreview(app, path, blob) {
    const editorEl = document.getElementById('monaco-editor');
    const previewEl = document.getElementById('file-preview-panel');
    if (!previewEl) return;
    if (app.filePreviewObjectUrl) URL.revokeObjectURL(app.filePreviewObjectUrl);
    const url = URL.createObjectURL(blob);
    app.filePreviewObjectUrl = url;
    const ext = fileExtension(path);
    const isImage = IMAGE_EXTENSIONS.has(ext);
    const safePath = app.escapeHtml(path);

    if (editorEl) editorEl.classList.add('hidden');
    previewEl.classList.remove('hidden');
    previewEl.innerHTML = `
      <div class="file-preview-toolbar">
        <div class="file-preview-title">
          <span class="file-preview-icon">${isImage ? Icons.fileImage : Icons.filePdf}</span>
          <span title="${safePath}">${safePath}</span>
        </div>
        <div class="file-preview-actions">
          <button class="btn btn-secondary btn-small" type="button" data-preview-copy>${Icons.copy14} Copy path</button>
          ${isImage && app.canEditProject() ? `<button class="btn btn-secondary btn-small" type="button" data-preview-insert>${Icons.plus16} Insert figure</button>` : ''}
        </div>
      </div>
      <div class="file-preview-stage">
        ${isImage
          ? `<img src="${url}" alt="${safePath}">`
          : `<iframe class="file-preview-pdf" src="${url}" title="${safePath}"></iframe>`}
      </div>
    `;

    previewEl.querySelector('[data-preview-copy]')?.addEventListener('click', async () => {
      try {
        const copied = await LightTeXCore.clipboard.copyText(path);
        if (!copied) throw new Error('Clipboard unavailable');
        app.notify('File path copied', 'success');
      } catch {
        app.notify('Could not copy path automatically', 'error');
      }
    });
    previewEl.querySelector('[data-preview-insert]')?.addEventListener('click', async () => {
      if (app.lastTextFilePath && app.lastTextFilePath !== path) {
        await app.openFile(app.lastTextFilePath);
        Editor.insertText(`\\includegraphics[width=0.8\\textwidth]{${path}}`);
        app.notify('Figure command inserted', 'success');
        return;
      }
      try {
        const copied = await LightTeXCore.clipboard.copyText(`\\includegraphics[width=0.8\\textwidth]{${path}}`);
        if (!copied) throw new Error('Clipboard unavailable');
        app.notify('Figure command copied', 'success');
      } catch {
        app.notify('Open a .tex file first, then insert the figure', 'info');
      }
    });
  }

  async function openFile(app, path) {
    try {
      const safePath = app.encodeProjectPath(path);
      const res = await fetch(`/api/projects/${app.currentProjectId}/files/${safePath}`, {
        headers: { 'Authorization': `Bearer ${api.token}` },
      });
      if (!res.ok) throw new Error(`Could not open ${path}`);

      Editor.setContext(app.currentProjectId, path);
      if (isPreviewFile(path)) {
        const blob = await res.blob();
        showFilePreview(app, path, blob);
      } else {
        resetFilePreview(app);
        const content = await res.text();
        Editor.setValue(content, { silent: true });
        Editor.setCompileErrors([], path);
        app.lastTextFilePath = path;
        app.updateWordCount();
        app.queueStructureRefresh();
      }
      const currentFileTab = document.getElementById('current-file-tab');
      if (currentFileTab) {
        currentFileTab.innerHTML = `${fileIcon(path)} ${app.escapeHtml(path)}`;
      }
      const saveState = document.getElementById('save-state');
      if (saveState) saveState.textContent = isPreviewFile(path) ? 'Preview' : 'Saved';
      app.fileTree.selectFile(path);
      recordRecentFile(app, path);
      renderRecentFiles(app);
      if (isPreviewFile(path)) {
        const wordCount = document.getElementById('word-count');
        if (wordCount) wordCount.textContent = `${fileExtension(path).toUpperCase()} asset`;
      }
    } catch (err) {
      console.error('Failed to open file:', err);
      app.notify('Could not open file: ' + err.message, 'error');
    }
  }

  async function promptNewFile(app) {
    if (!app.ensureCanEdit('create files')) return;
    const overlay = LightTeXCore.modal.createOverlay();
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

    LightTeXCore.modal.bindOverlayClose(overlay, close, '#new-file-cancel');
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
      if (app.projectFiles.some(f => f.path === filePath)) {
        errorEl.textContent = 'File already exists.';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = `${Icons.clock14} Creating...`;
      try {
        const file = await api.post(`/projects/${app.currentProjectId}/files`, {
          path: filePath,
          content: filePath.endsWith('.tex')
            ? `% ${filePath}\n`
            : '',
        });
        app.projectFiles.push(file);
        app.fileTree.setFiles(app.projectFiles);
        app.refreshFileHashes();
        app.openFile(filePath);
        if (filePath.endsWith('.bib')) app.refreshCitationCache();
        close();
      } catch (err) {
        errorEl.textContent = 'Failed to create file: ' + err.message;
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Create';
      }
    });

    pathInput.focus();
  }

  function recentKey(app) {
    return `lighttex-recent-files:${app.currentProjectId}`;
  }

  function getRecentFiles(app) {
    try {
      const existing = JSON.parse(localStorage.getItem(recentKey(app)) || '[]');
      const available = new Set((app.projectFiles || []).map((file) => file.path));
      return existing.filter((path) => available.has(path)).slice(0, 6);
    } catch {
      return [];
    }
  }

  function recordRecentFile(app, path) {
    const recent = [path, ...getRecentFiles(app).filter((item) => item !== path)].slice(0, 6);
    localStorage.setItem(recentKey(app), JSON.stringify(recent));
  }

  function renderRecentFiles(app) {
    const panel = document.getElementById('recent-files-panel');
    if (!panel || !app.currentProjectId) return;
    const recent = getRecentFiles(app);
    if (recent.length === 0) {
      panel.innerHTML = '';
      return;
    }
    panel.innerHTML = `
      <div class="recent-files-title">RECENT</div>
      <div class="recent-files-list">
        ${recent.map((path) => `
          <button class="recent-file-btn ${path === Editor.currentFilePath ? 'active' : ''}" type="button" data-recent-file="${app.escapeHtml(path)}" title="${app.escapeHtml(path)}">
            ${fileIcon(path)} <span>${app.escapeHtml(path)}</span>
          </button>
        `).join('')}
      </div>
    `;
    panel.querySelectorAll('[data-recent-file]').forEach((button) => {
      button.addEventListener('click', () => app.openFile(button.dataset.recentFile));
    });
  }

  async function deleteFile(app, path) {
    if (!app.ensureCanEdit('delete files')) return;
    if (!confirm(`Delete "${path}"?`)) return;

    try {
      await api.del(`/projects/${app.currentProjectId}/files/${app.encodeProjectPath(path)}`);
      app.projectFiles = app.projectFiles.filter(f => f.path !== path);
      app.fileTree.setFiles(app.projectFiles);
      app.refreshFileHashes();

      if (app.fileTree.selectedPath === path) {
        if (app.projectFiles.length > 0) {
          app.openFile(app.projectFiles[0].path);
        } else {
          resetFilePreview(app);
          Editor.setValue('', { silent: true });
          Editor.setContext(null, null);
        }
      }
      if (path.endsWith('.bib')) app.refreshCitationCache();
    } catch (err) {
      alert('Failed to delete file: ' + err.message);
    }
  }

  async function downloadPdf(app) {
    try {
      const blob = await api.download(`/projects/${app.currentProjectId}/output.pdf`);
      if (blob.size < 100) {
        app.notify('No PDF yet. Compile first.', 'error');
        return;
      }
      LightTeXCore.dom.downloadBlob(blob, 'document.pdf');
    } catch (err) {
      app.notify('Download failed: ' + err.message, 'error');
    }
  }

  async function downloadProject(app) {
    try {
      const blob = await api.download(`/projects/${app.currentProjectId}/download`);
      LightTeXCore.dom.downloadBlob(blob, 'project.zip');
    } catch (err) {
      app.notify('Download failed: ' + err.message, 'error');
    }
  }

  async function refreshFileHashes(app) {
    if (!app.currentProjectId) return [];
    try {
      app.fileHashes = await api.get(`/projects/${app.currentProjectId}/files-with-hashes`);
      if (app.fileTree) {
        app.fileTree.setHashes(app.fileHashes);
        app.fileTree.setDevMode(app.devMode);
      }
      app.updateSyncStatus('synced');
      return app.fileHashes;
    } catch (err) {
      app.updateSyncStatus('error');
      return app.fileHashes || [];
    }
  }

  function updateSyncStatus(app, state, detail) {
    app.syncState = state;
    const button = document.getElementById('sync-status-btn');
    if (!button) return;
    const labels = {
      synced: 'Synced',
      local: 'Local changes',
      conflicts: `Conflicts${app.syncConflicts.length ? ` (${app.syncConflicts.length})` : ''}`,
      error: 'Sync error',
    };
    button.className = `sync-status ${state}`;
    button.innerHTML = `${Icons.sync16} ${labels[state] || 'Sync'}`;
    button.title = detail || 'CLI sync status';
  }

  async function readProjectTextFile(app, filePath) {
    if (filePath === Editor.currentFilePath) {
      return Editor.getValue();
    }
    const headers = { 'Authorization': 'Bearer ' + api.token };
    const safePath = app.encodeProjectPath(filePath);
    const res = await fetch('/api/projects/' + app.currentProjectId + '/files/' + safePath, { headers });
    if (!res.ok) throw new Error('Could not read ' + filePath);
    return res.text();
  }

  async function renameFile(app, oldPath, newPath) {
    if (!app.ensureCanEdit('rename files')) return;
    if (!newPath) {
      showRenameFileModal(app, oldPath);
      return;
    }
    try {
      await api.put(`/projects/${app.currentProjectId}/files/rename`, { oldPath, newPath });
      app.notify(`Renamed ${oldPath} → ${newPath}`, 'success');
      app.projectFiles = await api.get(`/projects/${app.currentProjectId}/files`);
      app.fileTree.setFiles(app.projectFiles);
      app.refreshFileHashes();
      if (Editor.currentFilePath === oldPath) {
        app.openFile(newPath);
      }
      if (oldPath.endsWith('.bib') || newPath.endsWith('.bib')) app.refreshCitationCache();
    } catch (err) {
      app.notify('Rename failed: ' + err.message, 'error');
    }
  }

  function showRenameFileModal(app, oldPath) {
    const overlay = LightTeXCore.modal.createOverlay();
    overlay.innerHTML = `
      <div class="modal">
        <h2>Rename File</h2>
        <form id="rename-file-form">
          <div class="form-group">
            <label for="rename-file-path">File path</label>
            <input id="rename-file-path" type="text" value="${app.escapeHtml(oldPath)}" autocomplete="off" required>
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
    LightTeXCore.modal.bindOverlayClose(overlay, close, '#rename-file-cancel');
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
      if (app.projectFiles.some(f => f.path === newPath)) {
        error.textContent = 'File already exists.';
        return;
      }
      await renameFile(app, oldPath, newPath);
      close();
    });
    input.focus();
    input.setSelectionRange(0, input.value.length);
  }

  window.LightTeXFeatures.fileActions = {
    deleteFile,
    downloadPdf,
    downloadProject,
    openFile,
    promptNewFile,
    readProjectTextFile,
    renderRecentFiles,
    refreshFileHashes,
    renameFile,
    showRenameFileModal,
    updateSyncStatus,
  };
})();
