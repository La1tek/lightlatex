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
      app.lastCompileJob = result.job || null;
      let issues = Array.isArray(result.errors) ? result.errors : [];
      const jobMessage = result.job?.message || '';
      const jobStatus = result.job?.status || '';
      const failedRun = !result.success || ['error', 'failed', 'cancelled'].includes(jobStatus);
      if (issues.length === 0 && failedRun && jobMessage) {
        issues = [{ line: 0, message: result.job.message, severity: 'error' }];
      }
      const errors = issues.filter((e) => e.severity !== 'warning');
      const warnings = issues.filter((e) => e.severity === 'warning');
      app.lastCompileErrors = issues;
      const synthesizedLog = issues.map((issue) => {
        const severity = issue.severity === 'warning' ? 'WARNING' : 'ERROR';
        return `${severity} line ${issue.line || 0}: ${issue.message || 'Unknown compile issue'}`;
      }).join('\n');
      app.compileLog = result.log || synthesizedLog || (failedRun ? jobMessage : '');
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
      refreshCompileJobs(app);
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
    if (tab === 'jobs') {
      renderCompileJobs(app, body);
      return;
    }
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
        ${issues.map((issue, index) => {
          const isWarning = issue.severity === 'warning';
          const lineLabel = issue.line ? `Line ${issue.line}` : 'Project';
          return `
            <button class="log-row ${isWarning ? 'warning' : 'error'}" data-index="${index}" type="button">
              <span class="log-severity">${isWarning ? 'Warning' : 'Error'}</span>
              <span class="log-line">${lineLabel}</span>
              <span class="log-message">${app.escapeHtml(issue.message || 'Unknown compile issue')}</span>
            </button>
          `;
        }).join('')}
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

  async function refreshCompileJobs(app) {
    if (document.querySelector('[data-log-tab].active')?.dataset.logTab === 'jobs') {
      const body = document.getElementById('compile-panel-body');
      if (body) await renderCompileJobs(app, body);
    }
  }

  function formatDuration(job) {
    if (!job.durationMs) return job.status === 'running' && job.startedAt
      ? `${Math.max(1, Math.round((Date.now() - new Date(job.startedAt).getTime()) / 1000))}s`
      : '—';
    return job.durationMs < 1000 ? `${job.durationMs}ms` : `${Math.round(job.durationMs / 1000)}s`;
  }

  function jobStatusLabel(job) {
    const issueText = `${job.errorCount || 0} errors · ${job.warningCount || 0} warnings`;
    return `${job.status}${job.message ? ` · ${job.message}` : ''} · ${issueText}`;
  }

  async function renderCompileJobs(app, body) {
    body.innerHTML = '<div class="panel-loading">Loading compile jobs...</div>';
    try {
      const jobs = await api.get(`/projects/${app.currentProjectId}/compile/jobs`);
      if (jobs.length === 0) {
        body.innerHTML = `
          <div class="empty-state">
            <div class="icon">${Icons.clock}</div>
            <p>No compile jobs yet. Run Compile to create the first job.</p>
          </div>
        `;
        return;
      }

      body.innerHTML = `
        <div class="compile-jobs-toolbar">
          <span>${jobs.length} recent job${jobs.length === 1 ? '' : 's'}</span>
          <button class="btn btn-secondary btn-small" type="button" id="compile-jobs-refresh">${Icons.sync16} Refresh</button>
        </div>
        <div class="compile-job-list">
          ${jobs.map((job) => `
            <article class="compile-job-row ${job.status}" data-job="${app.escapeHtml(job.id)}">
              <div>
                <div class="compile-job-title">
                  <strong>${app.escapeHtml(job.compiler || 'pdflatex')}</strong>
                  <span>${app.escapeHtml(job.mainFile || 'main.tex')}</span>
                  <span class="status-badge ${job.status}">${app.escapeHtml(job.status)}</span>
                </div>
                <div class="compile-job-meta">
                  <span>${new Date(job.createdAt).toLocaleString()}</span>
                  <span>${formatDuration(job)}</span>
                  <span>${app.escapeHtml(jobStatusLabel(job))}</span>
                </div>
              </div>
              <div class="compile-job-actions">
                ${job.status === 'running' || job.status === 'queued' ? `<button class="btn btn-danger btn-small" type="button" data-job-cancel="${app.escapeHtml(job.id)}">Stop</button>` : ''}
                ${['error', 'warning', 'cancelled'].includes(job.status) ? `<button class="btn btn-secondary btn-small" type="button" data-job-retry="${app.escapeHtml(job.id)}">Retry</button>` : ''}
              </div>
            </article>
          `).join('')}
        </div>
      `;
      body.querySelector('#compile-jobs-refresh')?.addEventListener('click', () => renderCompileJobs(app, body));
      body.querySelectorAll('[data-job-cancel]').forEach((button) => {
        button.addEventListener('click', async () => {
          try {
            await api.post(`/projects/${app.currentProjectId}/compile/jobs/${button.dataset.jobCancel}/cancel`, {});
            app.notify('Compile job cancellation requested', 'info');
            renderCompileJobs(app, body);
          } catch (err) {
            app.notify('Could not stop compile job: ' + err.message, 'error');
          }
        });
      });
      body.querySelectorAll('[data-job-retry]').forEach((button) => {
        button.addEventListener('click', async () => {
          try {
            app.notify('Retrying compile job...', 'info');
            await api.post(`/projects/${app.currentProjectId}/compile/jobs/${button.dataset.jobRetry}/retry`, {});
            renderCompileJobs(app, body);
            app.loadPdf();
          } catch (err) {
            app.notify('Retry failed: ' + err.message, 'error');
          }
        });
      });
    } catch (err) {
      body.innerHTML = `
        <div class="empty-state">
          <div class="icon">${Icons.xCircle}</div>
          <p>Could not load compile jobs: ${app.escapeHtml(err.message)}</p>
        </div>
      `;
    }
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
