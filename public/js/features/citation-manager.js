(function () {
  window.LightTeXFeatures = window.LightTeXFeatures || {};

  async function refreshCache(app, options = {}) {
    try {
      app.citationEntries = await loadEntries(app);
      Editor.setCitationEntries(app.citationEntries);
      if (options.notify) app.notify(`Loaded ${app.citationEntries.length} citation entries`, 'success');
      return app.citationEntries;
    } catch (err) {
      if (options.notify) app.notify('Citation refresh failed: ' + err.message, 'error');
      return app.citationEntries || [];
    }
  }

  async function loadEntries(app) {
    const bibFiles = app.projectFiles.filter((file) => file.path.endsWith('.bib')).sort((a, b) => a.path.localeCompare(b.path));
    const entries = [];
    for (const file of bibFiles) {
      try {
        const content = await app.readProjectTextFile(file.path);
        entries.push(...extractBibEntries(app, content, file.path));
      } catch {
        // Skip unreadable bibliography files.
      }
    }
    return entries.sort((a, b) => a.key.localeCompare(b.key));
  }

  function extractBibEntries(app, content, filePath) {
    const entries = [];
    const entryRegex = /@([a-zA-Z]+)\s*\{\s*([^,\s]+)\s*,/g;
    let match;
    while ((match = entryRegex.exec(content)) !== null) {
      const start = match.index;
      let depth = 0;
      let end = content.length;
      for (let i = start; i < content.length; i++) {
        const char = content[i];
        if (char === '{') depth++;
        if (char === '}') {
          depth--;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
      }
      const raw = content.slice(start, end);
      const fields = parseBibFields(app, raw);
      const line = content.slice(0, start).split('\n').length;
      entries.push({
        type: match[1].toLowerCase(),
        key: match[2],
        file: filePath,
        line,
        raw,
        fields,
        author: fields.author || fields.editor || '',
        title: fields.title || '',
        year: fields.year || fields.date || '',
        venue: fields.journal || fields.booktitle || fields.publisher || fields.school || '',
        doi: fields.doi || '',
        url: fields.url || '',
      });
      entryRegex.lastIndex = end;
    }
    return entries;
  }

  function parseBibFields(app, raw) {
    const fields = {};
    const fieldRegex = /([a-zA-Z][\w-]*)\s*=\s*(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*"|[^,\n]+)\s*,?/g;
    let match;
    while ((match = fieldRegex.exec(raw)) !== null) {
      fields[match[1].toLowerCase()] = cleanBibValue(match[2]);
    }
    return fields;
  }

  function cleanBibValue(value) {
    return (value || '')
      .trim()
      .replace(/^[{"]|[}"]$/g, '')
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function showManager(app) {
    const canEdit = app.canEditProject();
    const overlay = LightTeXCore.modal.createOverlay('citation-overlay');
    overlay.innerHTML = `
      <div class="modal citation-modal" role="dialog" aria-label="Citation manager">
        <div class="modal-heading-row">
          <div>
            <h2>Citations</h2>
            <p class="modal-subtitle">Search \`.bib\` entries and insert citation commands.</p>
          </div>
          <button class="btn-icon" type="button" id="citation-close" title="Close citations" aria-label="Close citations">${Icons.x}</button>
        </div>
        <div class="citation-toolbar">
          <label class="dashboard-search citation-search" aria-label="Search citations">
            ${Icons.search16}
            <input id="citation-search-input" type="search" placeholder="Search key, author, title, year..." autocomplete="off">
          </label>
          <select id="citation-command" aria-label="Citation command">
            ${['cite', 'citep', 'citet', 'parencite', 'textcite', 'autocite'].map((command) => `<option value="${command}">\\${command}{}</option>`).join('')}
          </select>
          <button class="btn btn-secondary btn-small" type="button" id="citation-add" ${canEdit ? '' : 'disabled title="Read-only viewer access"'}>${Icons.plus16} Add</button>
          <button class="btn btn-secondary btn-small" type="button" id="citation-refresh">${Icons.clock14} Refresh</button>
        </div>
        <div class="citation-summary" id="citation-summary"></div>
        <div class="citation-list" id="citation-list">
          <div class="panel-loading">Loading bibliography...</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    const input = overlay.querySelector('#citation-search-input');
    const list = overlay.querySelector('#citation-list');
    const summary = overlay.querySelector('#citation-summary');
    const commandSelect = overlay.querySelector('#citation-command');
    let entries = [];

    const insertEntry = (entry) => {
      if (!app.ensureCanEdit('insert citations')) return;
      Editor.insertText(`\\${commandSelect.value}{${entry.key}}`);
      close();
    };

    const render = () => {
      const query = input.value.trim().toLowerCase();
      const filtered = entries.filter((entry) => {
        const haystack = `${entry.key} ${entry.type} ${entry.author} ${entry.title} ${entry.year} ${entry.venue} ${entry.doi}`.toLowerCase();
        return haystack.includes(query);
      });
      const bibFileCount = new Set(entries.map((entry) => entry.file)).size;
      summary.innerHTML = `
        <span>${entries.length} entries</span>
        <span>${bibFileCount} .bib files</span>
        <span>${filtered.length} shown</span>
      `;
      if (entries.length === 0) {
        list.innerHTML = `
          <div class="panel-empty">
            <strong>No bibliography entries</strong>
            <span>Add a raw BibTeX entry or create a references.bib file to start citing sources.</span>
          </div>
        `;
        return;
      }
      if (filtered.length === 0) {
        list.innerHTML = '<div class="command-empty">No citations match this search</div>';
        return;
      }
      list.innerHTML = filtered.map((entry, index) => `
        <article class="citation-row" data-index="${index}">
          <div class="citation-row-main">
            <div class="citation-row-title">
              <code>${app.escapeHtml(entry.key)}</code>
              <span>${app.escapeHtml(entry.title || '(untitled)')}</span>
            </div>
            <div class="citation-row-meta">
              <span>${app.escapeHtml(app.formatAuthors(entry.author))}</span>
              <span>${app.escapeHtml(entry.year || 'n.d.')}</span>
              <span>${app.escapeHtml(entry.venue || entry.type)}</span>
              <span>${app.escapeHtml(entry.file)}:${entry.line}</span>
            </div>
          </div>
          <div class="citation-row-actions">
            <button class="btn btn-primary btn-small" type="button" data-citation-insert="${index}" ${canEdit ? '' : 'disabled title="Read-only viewer access"'}>Insert</button>
            <button class="btn btn-secondary btn-small" type="button" data-citation-copy="${index}">Copy key</button>
            <button class="btn btn-secondary btn-small" type="button" data-citation-open="${index}">Open</button>
          </div>
        </article>
      `).join('');
      list.querySelectorAll('[data-citation-insert]').forEach((button) => {
        button.addEventListener('click', () => insertEntry(filtered[parseInt(button.dataset.citationInsert, 10)]));
      });
      list.querySelectorAll('[data-citation-copy]').forEach((button) => {
        button.addEventListener('click', async () => {
          const entry = filtered[parseInt(button.dataset.citationCopy, 10)];
          try {
            const copied = await LightTeXCore.clipboard.copyText(entry.key);
            if (!copied) throw new Error('Clipboard unavailable');
            app.notify('Citation key copied', 'success');
          } catch {
            app.notify('Could not copy key automatically', 'error');
          }
        });
      });
      list.querySelectorAll('[data-citation-open]').forEach((button) => {
        button.addEventListener('click', () => {
          const entry = filtered[parseInt(button.dataset.citationOpen, 10)];
          app.openFile(entry.file);
          setTimeout(() => Editor.revealLine(entry.line), 200);
          close();
        });
      });
    };

    const refresh = async () => {
      list.innerHTML = '<div class="panel-loading">Loading bibliography...</div>';
      entries = await refreshCache(app);
      render();
    };

    LightTeXCore.modal.bindOverlayClose(overlay, close, '#citation-close');
    overlay.querySelector('#citation-refresh').addEventListener('click', () => refresh());
    overlay.querySelector('#citation-add').addEventListener('click', () => {
      if (!app.ensureCanEdit('add bibliography entries')) return;
      showBibEntryModal(app, async () => {
        entries = await refreshCache(app, { notify: true });
        render();
      });
    });
    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter') {
        const first = list.querySelector('[data-citation-insert]');
        if (first) first.click();
      }
    });
    refresh();
    input.focus();
  }

  function showBibEntryModal(app, onSaved) {
    if (!app.ensureCanEdit('add bibliography entries')) return;
    const bibFiles = app.projectFiles.filter((file) => file.path.endsWith('.bib')).map((file) => file.path);
    const overlay = LightTeXCore.modal.createOverlay();
    overlay.innerHTML = `
      <div class="modal bib-entry-modal" role="dialog" aria-label="Add BibTeX entry">
        <h2>Add BibTeX Entry</h2>
        <form id="bib-entry-form">
          <div class="form-group">
            <label for="bib-entry-file">Target .bib file</label>
            <input id="bib-entry-file" type="text" value="${app.escapeHtml(bibFiles[0] || 'references.bib')}" list="bib-entry-files" autocomplete="off" required>
            <datalist id="bib-entry-files">
              ${bibFiles.map((file) => `<option value="${app.escapeHtml(file)}"></option>`).join('')}
            </datalist>
          </div>
          <div class="form-group">
            <label for="bib-entry-raw">Raw BibTeX</label>
            <textarea id="bib-entry-raw" rows="12" spellcheck="false">@article{key2026,
  title = {Article title},
  author = {Author, Alice and Author, Bob},
  journal = {Journal Name},
  year = {2026}
}</textarea>
            <div class="field-error" id="bib-entry-error" role="alert"></div>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" type="button" id="bib-entry-cancel">Cancel</button>
            <button class="btn btn-primary" type="submit" id="bib-entry-save">Save entry</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    LightTeXCore.modal.bindOverlayClose(overlay, close, '#bib-entry-cancel');
    overlay.querySelector('#bib-entry-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pathInput = overlay.querySelector('#bib-entry-file');
      const rawInput = overlay.querySelector('#bib-entry-raw');
      const error = overlay.querySelector('#bib-entry-error');
      const save = overlay.querySelector('#bib-entry-save');
      const filePath = pathInput.value.trim();
      const raw = rawInput.value.trim();
      error.textContent = '';
      if (!filePath.endsWith('.bib')) return error.textContent = 'Target file must end with .bib.';
      if (!raw.startsWith('@') || !raw.includes('{')) return error.textContent = 'Paste a valid BibTeX entry starting with @.';
      save.disabled = true;
      save.innerHTML = `${Icons.clock14} Saving...`;
      try {
        const exists = app.projectFiles.some((file) => file.path === filePath);
        if (!exists) {
          const file = await api.post(`/projects/${app.currentProjectId}/files`, { path: filePath, content: raw + '\n' });
          app.projectFiles.push(file);
          app.fileTree.setFiles(app.projectFiles);
          app.refreshFileHashes();
        } else {
          const existing = await app.readProjectTextFile(filePath);
          await api.put(`/projects/${app.currentProjectId}/files/${app.encodeProjectPath(filePath)}`, {
            content: `${existing.trimEnd()}\n\n${raw}\n`,
          });
        }
        app.notify('BibTeX entry saved', 'success');
        if (onSaved) await onSaved();
        close();
      } catch (err) {
        error.textContent = err.message;
      } finally {
        save.disabled = false;
        save.innerHTML = 'Save entry';
      }
    });
    overlay.querySelector('#bib-entry-raw').focus();
  }

  window.LightTeXFeatures.citationManager = {
    cleanBibValue,
    extractBibEntries,
    loadEntries,
    parseBibFields,
    refreshCache,
    showBibEntryModal,
    showManager,
  };
})();
