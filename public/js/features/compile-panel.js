(function () {
  window.LightTeXFeatures = window.LightTeXFeatures || {};

  async function compile(app) {
    if (!app.ensureCanEdit('compile this project')) return;
    if (app.isCompiling) return;
    app.isCompiling = true;

    const statusEl = document.getElementById('compile-status');
    const compileBtn = document.getElementById('compile-btn');
    statusEl.innerHTML = `${Icons.clock14} Compiling...`;
    statusEl.className = 'compile-status compiling';
    app.lastCompileErrors = [];
    if (compileBtn) {
      compileBtn.disabled = true;
      compileBtn.innerHTML = `${Icons.clock14} Compiling...`;
    }

    try {
      if (Editor.currentFilePath) {
        await Editor.autosave();
      }

      const result = await api.post(`/projects/${app.currentProjectId}/compile`);
      const issues = Array.isArray(result.errors) ? result.errors : [];
      const errors = issues.filter((e) => e.severity !== 'warning');
      const warnings = issues.filter((e) => e.severity === 'warning');
      app.lastCompileErrors = issues;
      app.compileLog = result.log || '';
      renderCompilePanel(app, 'issues');

      if (result.success && result.pdfGenerated) {
        if (warnings.length > 0) {
          statusEl.innerHTML = `${Icons.xCircle14} Compiled with ${warnings.length} warning(s)`;
          statusEl.className = 'compile-status warning';
          Editor.setCompileErrors(issues, Editor.currentFilePath);
          app.notify(`Compiled with ${warnings.length} warning(s)`, 'info');
          openCompilePanel(app);
        } else {
          statusEl.innerHTML = `${Icons.check14} Compiled just now`;
          statusEl.className = 'compile-status success';
          Editor.setCompileErrors([], Editor.currentFilePath);
          app.notify('Compilation successful!', 'success');
        }
        loadPdf(app);
      } else {
        statusEl.innerHTML = `${Icons.xCircle14} Failed: ${errors.length || issues.length} error(s)`;
        statusEl.className = 'compile-status error';
        if (issues.length > 0) {
          Editor.setCompileErrors(issues, Editor.currentFilePath);
          const msgs = issues.slice(0, 5).map(e => `Line ${e.line}: ${e.message}`).join('\n');
          app.notify('Compilation failed:\n' + msgs, 'error');
          openCompilePanel(app);
        } else {
          app.notify('Compilation failed', 'error');
          openCompilePanel(app);
        }
      }

      app.projectFiles = await api.get(`/projects/${app.currentProjectId}/files`);
      app.fileTree.setFiles(app.projectFiles);
      app.refreshFileHashes();
    } catch (err) {
      statusEl.innerHTML = `${Icons.xCircle14} Error`;
      statusEl.className = 'compile-status error';
      app.lastCompileErrors = [{ line: 0, message: err.message, severity: 'error' }];
      app.compileLog = err.message;
      renderCompilePanel(app, 'issues');
      openCompilePanel(app);
      app.notify('Compilation error: ' + err.message, 'error');
    } finally {
      app.isCompiling = false;
      if (compileBtn) {
        compileBtn.disabled = false;
        compileBtn.innerHTML = `${Icons.play16} Compile`;
      }
    }
  }

  function openCompilePanel(app) {
    app.logsPanelVisible = true;
    const panel = document.getElementById('compile-panel');
    if (panel) panel.classList.remove('hidden');
    renderCompilePanel(app, document.querySelector('[data-log-tab].active')?.dataset.logTab || 'issues');
  }

  function closeCompilePanel(app) {
    app.logsPanelVisible = false;
    const panel = document.getElementById('compile-panel');
    if (panel) panel.classList.add('hidden');
  }

  function renderCompilePanel(app, tab = 'issues') {
    const body = document.getElementById('compile-panel-body');
    if (!body) return;
    const issues = app.lastCompileErrors || [];
    if (tab === 'raw') {
      body.innerHTML = app.compileLog
        ? `<pre class="raw-log">${app.escapeHtml(app.compileLog)}</pre>`
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
            <span class="log-message">${app.escapeHtml(issue.message || 'Unknown compile issue')}</span>
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
  }

  async function loadPdf(app) {
    try {
      await Preview.loadPdf(app.currentProjectId);
      updatePdfPageInfo();
    } catch {
      // No PDF yet
    }
  }

  function updatePdfPageInfo() {
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
  }

  function updateWordCount() {
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
  }

  window.LightTeXFeatures.compilePanel = {
    closeCompilePanel,
    compile,
    loadPdf,
    openCompilePanel,
    renderCompilePanel,
    updatePdfPageInfo,
    updateWordCount,
  };
})();
