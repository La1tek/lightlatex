(function () {
  window.LightTeXFeatures = window.LightTeXFeatures || {};

  function showCreateSnapshotModal(app) {
    if (!app.ensureCanEdit('create snapshots')) return;
    const overlay = LightTeXCore.modal.createOverlay();
    overlay.innerHTML = `
      <div class="modal snapshot-modal" role="dialog" aria-label="Create snapshot">
        <h2>Create Snapshot</h2>
        <form id="snapshot-form">
          <div class="form-group">
            <label for="snapshot-name">Name</label>
            <input id="snapshot-name" type="text" value="Manual snapshot" autocomplete="off" required>
          </div>
          <div class="form-group">
            <label for="snapshot-message">Note</label>
            <textarea id="snapshot-message" rows="3" placeholder="Before reviewer changes, submission v1, etc."></textarea>
            <div class="field-error" id="snapshot-error" role="alert"></div>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" type="button" id="snapshot-cancel">Cancel</button>
            <button class="btn btn-primary" type="submit" id="snapshot-create">${Icons.save16} Create snapshot</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    LightTeXCore.modal.bindOverlayClose(overlay, close, '#snapshot-cancel');
    overlay.querySelector('#snapshot-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const error = overlay.querySelector('#snapshot-error');
      const create = overlay.querySelector('#snapshot-create');
      error.textContent = '';
      create.disabled = true;
      create.innerHTML = `${Icons.clock14} Creating...`;
      try {
        if (Editor.currentFilePath) await Editor.autosave();
        await api.post(`/projects/${app.currentProjectId}/history`, {
          name: overlay.querySelector('#snapshot-name').value.trim() || 'Manual snapshot',
          message: overlay.querySelector('#snapshot-message').value.trim(),
        });
        app.notify('Snapshot created', 'success');
        close();
      } catch (err) {
        error.textContent = err.message;
      } finally {
        create.disabled = false;
        create.innerHTML = `${Icons.save16} Create snapshot`;
      }
    });
    overlay.querySelector('#snapshot-name').focus();
  }

  async function showHistoryModal(app) {
    const overlay = LightTeXCore.modal.createOverlay();
    overlay.innerHTML = `
      <div class="modal history-modal" role="dialog" aria-label="Project history">
        <div class="modal-heading-row">
          <div>
            <h2>History</h2>
            <p class="modal-subtitle">Snapshots are created after successful compiles.</p>
          </div>
          <button class="btn-icon" type="button" id="history-close" title="Close history" aria-label="Close history">${Icons.x}</button>
        </div>
        <div class="history-layout">
          <aside class="history-timeline" id="history-timeline">
            <div class="panel-loading">Loading snapshots...</div>
          </aside>
          <section class="history-detail">
            <div class="history-detail-toolbar">
              <label>
                <span>File</span>
                <select id="history-file-select"></select>
              </label>
              <div class="history-selected" id="history-selected">No snapshot selected</div>
              <button class="btn btn-secondary btn-small" type="button" id="history-download">Download ZIP</button>
              <button class="btn btn-primary btn-small" type="button" id="history-restore">Restore file</button>
            </div>
            <div class="history-diff" id="diff-container">
              <div class="panel-empty">
                <strong>Select a snapshot</strong>
                <span>Choose a snapshot from the timeline to compare this file with current content.</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    LightTeXCore.modal.bindOverlayClose(overlay, close, '#history-close');

    let selectedSnapshot = null;
    const textFiles = app.projectFiles
      .filter((file) => /\.(tex|bib|sty|cls)$/i.test(file.path))
      .sort((a, b) => a.path.localeCompare(b.path));
    const fileSelect = overlay.querySelector('#history-file-select');
    const timeline = overlay.querySelector('#history-timeline');
    const selectedLabel = overlay.querySelector('#history-selected');
    const restoreButton = overlay.querySelector('#history-restore');
    const downloadButton = overlay.querySelector('#history-download');
    const preferredFile = Editor.currentFilePath || app.currentProject?.mainFile || textFiles[0]?.path || '';

    if (textFiles.length === 0) {
      fileSelect.innerHTML = '<option value="">No text files</option>';
      restoreButton.disabled = true;
      downloadButton.disabled = true;
    } else {
      fileSelect.innerHTML = textFiles.map((file) => `<option value="${app.escapeHtml(file.path)}" ${file.path === preferredFile ? 'selected' : ''}>${app.escapeHtml(file.path)}</option>`).join('');
    }

    const loadSelectedDiff = async () => {
      if (!selectedSnapshot || !fileSelect.value) return;
      selectedLabel.textContent = app.formatSnapshotLabel(selectedSnapshot);
      await loadDiff(app, fileSelect.value, selectedSnapshot, overlay.querySelector('#diff-container'));
    };

    try {
      const snapshots = await loadSnapshotDetails(app);
      if (snapshots.length === 0) {
        timeline.innerHTML = `
          <div class="panel-empty">
            <strong>No snapshots yet</strong>
            <span>Compile successfully to create the first snapshot.</span>
          </div>
        `;
        restoreButton.disabled = true;
        downloadButton.disabled = true;
      } else {
        timeline.innerHTML = snapshots.map((snapshot, index) => `
          <button class="history-snapshot ${index === 0 ? 'active' : ''}" type="button" data-snapshot="${app.escapeHtml(snapshot.timestamp)}">
            <span>${app.escapeHtml(app.formatSnapshotLabel(snapshot))}</span>
            <small>${app.escapeHtml(app.snapshotMessage(snapshot, index))}</small>
          </button>
        `).join('');
        timeline.querySelectorAll('[data-snapshot]').forEach((button) => {
          button.addEventListener('click', async () => {
            selectedSnapshot = button.dataset.snapshot;
            timeline.querySelectorAll('[data-snapshot]').forEach((item) => item.classList.remove('active'));
            button.classList.add('active');
            await loadSelectedDiff();
          });
        });
        selectedSnapshot = snapshots[0].timestamp;
        await loadSelectedDiff();
      }
    } catch (err) {
      timeline.innerHTML = `
        <div class="panel-empty error">
          <strong>Could not load snapshots</strong>
          <span>${app.escapeHtml(err.message || 'Unknown history error')}</span>
        </div>
      `;
      restoreButton.disabled = true;
      downloadButton.disabled = true;
    }

    fileSelect.addEventListener('change', loadSelectedDiff);
    downloadButton.addEventListener('click', async () => {
      if (!selectedSnapshot) return;
      try {
        const blob = await api.download(`/projects/${app.currentProjectId}/history/${selectedSnapshot}/download`);
        LightTeXCore.dom.downloadBlob(blob, `snapshot-${selectedSnapshot}.zip`);
      } catch (err) {
        app.notify('Snapshot download failed: ' + err.message, 'error');
      }
    });
    restoreButton.addEventListener('click', async () => {
      if (!selectedSnapshot || !fileSelect.value) return;
      const filePath = fileSelect.value;
      if (!confirm(`Restore "${filePath}" from this snapshot?`)) return;
      try {
        const headers = { 'Authorization': `Bearer ${api.token}` };
        const res = await fetch(`/api/projects/${app.currentProjectId}/history/${selectedSnapshot}/files/${app.encodeProjectPath(filePath)}`, { headers });
        if (!res.ok) throw new Error('File is not available in this snapshot');
        const content = await res.text();
        await api.put(`/projects/${app.currentProjectId}/files/${app.encodeProjectPath(filePath)}`, { content });
        if (Editor.currentFilePath === filePath) {
          Editor.setValue(content, { silent: true });
        } else {
          app.openFile(filePath);
        }
        if (filePath.endsWith('.bib')) app.refreshCitationCache();
        app.notify('File restored from snapshot', 'success');
        close();
      } catch (err) {
        app.notify('Restore failed: ' + err.message, 'error');
      }
    });
  }

  async function loadSnapshotDetails(app) {
    try {
      const details = await api.get(`/projects/${app.currentProjectId}/history/details`);
      return details.map((item) => ({
        timestamp: item.timestamp,
        name: item.name || '',
        message: item.message || '',
        type: item.type || 'compile',
        createdAt: item.createdAt || item.timestamp,
      }));
    } catch {
      const snapshots = await api.get(`/projects/${app.currentProjectId}/history`);
      return snapshots.map((timestamp) => ({ timestamp, type: 'compile', name: '', message: '', createdAt: timestamp }));
    }
  }

  async function loadDiff(app, filePath, timestamp, diffContainer) {
    if (!diffContainer) return;
    try {
      const headers = { 'Authorization': `Bearer ${api.token}` };
      const [oldRes, newContent] = await Promise.all([
        fetch(`/api/projects/${app.currentProjectId}/history/${timestamp}/files/${app.encodeProjectPath(filePath)}`, { headers }).then(async (response) => {
          if (!response.ok) throw new Error('This file is not present in the selected snapshot.');
          return response.text();
        }),
        filePath === Editor.currentFilePath ? Editor.getValue() : app.readProjectTextFile(filePath),
      ]);

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
      diffContainer.innerHTML = `<div class="empty-state"><div class="icon">${Icons.clock}</div><p>${app.escapeHtml(err.message || 'Could not load file for this snapshot')}</p></div>`;
    }
  }

  window.LightTeXFeatures.historyModal = {
    loadDiff,
    loadSnapshotDetails,
    showCreateSnapshotModal,
    showHistoryModal,
  };
})();
