(function () {
  window.LightTeXFeatures = window.LightTeXFeatures || {};

  async function show(app) {
    const overlay = LightTeXCore.modal.createOverlay();
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
    const close = () => overlay.remove();
    LightTeXCore.modal.bindOverlayClose(overlay, close, '#search-close');

    let searchTimer;
    document.getElementById('search-input').addEventListener('input', (event) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        const query = event.target.value.trim();
        const resultsEl = document.getElementById('search-results');
        if (!query) {
          resultsEl.innerHTML = '';
          return;
        }
        try {
          const results = await api.get(`/projects/${app.currentProjectId}/search?q=${encodeURIComponent(query)}`);
          if (results.length === 0) {
            resultsEl.innerHTML = '<div style="padding:10px;color:var(--text-secondary)">No results</div>';
          } else {
            resultsEl.innerHTML = results.map((result) =>
              `<div class="search-result-item" data-file="${app.escapeHtml(result.file)}" data-line="${result.line}">
                <span style="color:var(--accent)">${app.escapeHtml(result.file)}</span>:<span style="color:var(--warning)">${result.line}</span>: ${app.escapeHtml(result.content)}
              </div>`
            ).join('');
            resultsEl.querySelectorAll('.search-result-item').forEach((el) => {
              el.addEventListener('click', () => {
                const file = el.dataset.file;
                const line = parseInt(el.dataset.line);
                app.openFile(file);
                setTimeout(() => Editor.revealLine(line), 200);
                close();
              });
              el.style.cursor = 'pointer';
              el.style.padding = '4px 8px';
              el.style.borderBottom = '1px solid var(--border-color)';
            });
          }
        } catch (err) {
          resultsEl.innerHTML = `<div style="padding:10px;color:var(--error)">Error: ${app.escapeHtml(err.message)}</div>`;
        }
      }, 300);
    });
    document.getElementById('search-input').focus();
  }

  window.LightTeXFeatures.searchModal = {
    show,
  };
})();
