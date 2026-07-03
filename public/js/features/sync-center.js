(function () {
  window.LightTeXFeatures = window.LightTeXFeatures || {};

  async function show(app) {
    const overlay = LightTeXCore.modal.createOverlay('sync-overlay');
    overlay.innerHTML = `
      <div class="modal sync-modal" role="dialog" aria-label="CLI sync center">
        <div class="modal-heading-row">
          <div>
            <h2>CLI Sync</h2>
            <p class="modal-subtitle">Pull, push, sync, hashes, and conflict visibility for local workflows.</p>
          </div>
          <button class="btn-icon" type="button" id="sync-close" title="Close sync" aria-label="Close sync">${Icons.x}</button>
        </div>
        <div class="sync-status-strip">
          <span class="${app.syncState}">${app.syncState === 'conflicts' ? 'Conflicts require attention' : app.syncState === 'error' ? 'Sync metadata unavailable' : 'Server inventory ready'}</span>
          <button class="btn btn-secondary btn-small" type="button" id="sync-refresh">${Icons.clock14} Refresh</button>
          <button class="btn btn-secondary btn-small" type="button" id="sync-toggle-dev">${app.devMode ? 'Hide hashes' : 'Show hashes'}</button>
          <button class="btn btn-secondary btn-small" type="button" id="sync-conflicts">${Icons.link16} Conflicts</button>
        </div>
        <div class="sync-command-grid">
          ${['pull', 'push', 'sync'].map((command) => `
            <div class="sync-command">
              <span>${command}</span>
              <code>lighttex ${command} ${app.currentProjectId}</code>
              <button class="btn btn-secondary btn-small" type="button" data-copy-sync="lighttex ${command} ${app.currentProjectId}">Copy</button>
            </div>
          `).join('')}
        </div>
        <div class="sync-inventory">
          <div class="sync-inventory-header">
            <strong>Server file hashes</strong>
            <span id="sync-file-count">${app.fileHashes.length} files</span>
          </div>
          <div class="sync-file-list" id="sync-file-list">
            <div class="panel-loading">Loading hashes...</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    const list = overlay.querySelector('#sync-file-list');
    const count = overlay.querySelector('#sync-file-count');

    const renderHashes = async () => {
      list.innerHTML = '<div class="panel-loading">Loading hashes...</div>';
      const hashes = await app.refreshFileHashes();
      count.textContent = `${hashes.length} files`;
      if (hashes.length === 0) {
        list.innerHTML = `
          <div class="panel-empty">
            <strong>No file hashes</strong>
            <span>Create or upload files to populate the sync inventory.</span>
          </div>
        `;
        return;
      }
      list.innerHTML = hashes.map((item) => `
        <div class="sync-file-row">
          <span title="${app.escapeHtml(item.path)}">${app.escapeHtml(item.path)}</span>
          <code title="${app.escapeHtml(item.hash || '')}">${app.escapeHtml(app.formatHash(item.hash))}</code>
        </div>
      `).join('');
    };

    LightTeXCore.modal.bindOverlayClose(overlay, close, '#sync-close');
    overlay.querySelector('#sync-refresh').addEventListener('click', renderHashes);
    overlay.querySelector('#sync-conflicts').addEventListener('click', () => showConflicts(app));
    overlay.querySelector('#sync-toggle-dev').addEventListener('click', () => {
      app.devMode = !app.devMode;
      localStorage.setItem('lighttex-dev-mode', String(app.devMode));
      if (app.fileTree) app.fileTree.setDevMode(app.devMode);
      overlay.querySelector('#sync-toggle-dev').textContent = app.devMode ? 'Hide hashes' : 'Show hashes';
      app.notify(app.devMode ? 'File hash tooltips enabled' : 'File hashes hidden', 'info');
    });
    overlay.querySelectorAll('[data-copy-sync]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          if (!navigator.clipboard) throw new Error('Clipboard unavailable');
          await navigator.clipboard.writeText(button.dataset.copySync);
          app.notify('CLI command copied', 'success');
        } catch {
          app.notify('Could not copy command automatically', 'error');
        }
      });
    });
    renderHashes();
  }

  function showConflicts(app, conflicts = app.syncConflicts) {
    const overlay = LightTeXCore.modal.createOverlay('conflicts-overlay');
    overlay.innerHTML = `
      <div class="modal conflicts-modal" role="dialog" aria-label="Sync conflicts">
        <div class="modal-heading-row">
          <div>
            <h2>Conflicts</h2>
            <p class="modal-subtitle">Three-way review for files reported by CLI sync.</p>
          </div>
          <button class="btn-icon" type="button" id="conflicts-close" title="Close conflicts" aria-label="Close conflicts">${Icons.x}</button>
        </div>
        ${conflicts.length === 0 ? `
          <div class="panel-empty">
            <strong>No conflicts reported</strong>
            <span>Run <code>lighttex sync ${app.currentProjectId}</code> locally. Any reported conflicts will appear here when submitted by the sync API.</span>
          </div>
        ` : `
          <div class="conflict-list">
            ${conflicts.map((file) => `
              <article class="conflict-row">
                <header>
                  <strong>${app.escapeHtml(file)}</strong>
                  <span>local / remote / merged</span>
                </header>
                <div class="conflict-columns">
                  <pre>Local changes pending from CLI client.</pre>
                  <pre>Remote server version changed.</pre>
                  <pre>Resolve locally, then run lighttex push ${app.currentProjectId}.</pre>
                </div>
                <div class="conflict-actions">
                  <button class="btn btn-secondary btn-small" type="button">Keep mine</button>
                  <button class="btn btn-secondary btn-small" type="button">Keep theirs</button>
                  <button class="btn btn-primary btn-small" type="button">Mark merged</button>
                </div>
              </article>
            `).join('')}
          </div>
        `}
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    LightTeXCore.modal.bindOverlayClose(overlay, close, '#conflicts-close');
  }

  window.LightTeXFeatures.syncCenter = {
    show,
    showConflicts,
  };
})();
