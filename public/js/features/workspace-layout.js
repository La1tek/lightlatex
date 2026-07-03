(function () {
  window.LightTeXFeatures = window.LightTeXFeatures || {};

  function modeLabel(mode = 'split') {
    return mode === 'editor' ? 'Editor only' : mode === 'pdf' ? 'PDF only' : 'Split';
  }

  function setMode(app, mode, options = {}) {
    const nextMode = ['split', 'editor', 'pdf'].includes(mode) ? mode : 'split';
    app.workspaceMode = nextMode;
    if (options.persist !== false) localStorage.setItem('lighttex-workspace-mode', nextMode);

    const main = document.querySelector('.editor-main');
    const previewPane = document.getElementById('preview-pane');
    const editorPane = document.querySelector('.editor-pane');
    const layoutBtn = document.getElementById('layout-btn');
    const previewToggle = document.getElementById('toggle-preview-btn');
    if (main) {
      main.classList.remove('split-mode', 'editor-only', 'pdf-only', 'preview-open');
      main.classList.add(nextMode === 'editor' ? 'editor-only' : nextMode === 'pdf' ? 'pdf-only' : 'split-mode');
      main.classList.toggle('preview-open', nextMode === 'pdf');
    }
    if (previewPane) previewPane.classList.toggle('hidden', nextMode === 'editor');
    if (editorPane) editorPane.classList.toggle('hidden', nextMode === 'pdf');
    if (layoutBtn) {
      layoutBtn.innerHTML = `${Icons.layout16} ${modeLabel(nextMode)}`;
      layoutBtn.classList.toggle('active', nextMode !== 'split');
    }
    if (previewToggle) previewToggle.classList.toggle('active', nextMode !== 'editor');
    requestAnimationFrame(() => {
      Editor.layout();
      if (nextMode !== 'editor') {
        if (typeof pdfDoc !== 'undefined' && pdfDoc) {
          Preview.renderAllPages().then(() => app.updatePdfPageInfo()).catch(() => {});
        } else {
          app.loadPdf();
        }
      }
    });
  }

  function togglePreview(app) {
    setMode(app, app.workspaceMode === 'editor' ? 'split' : 'editor');
  }

  function applyFocusMode(app) {
    const layout = document.querySelector('.editor-layout');
    const button = document.getElementById('focus-btn');
    if (layout) layout.classList.toggle('focus-mode', app.focusMode);
    if (button) {
      button.classList.toggle('active', app.focusMode);
      button.innerHTML = `${Icons.focus16} ${app.focusMode ? 'Exit focus' : 'Focus'}`;
    }
  }

  function toggleFocusMode(app) {
    app.focusMode = !app.focusMode;
    localStorage.setItem('lighttex-focus-mode', String(app.focusMode));
    applyFocusMode(app);
    app.notify(app.focusMode ? 'Focus mode enabled' : 'Focus mode disabled', 'info');
  }

  function showLayoutModal(app) {
    const overlay = LightTeXCore.modal.createOverlay();
    overlay.innerHTML = `
      <div class="modal layout-modal" role="dialog" aria-label="Workspace layout">
        <div class="modal-heading-row">
          <div>
            <h2>Workspace Layout</h2>
            <p class="modal-subtitle">Choose how editor and PDF preview share the workspace.</p>
          </div>
          <button class="btn-icon" type="button" id="layout-close" title="Close layout" aria-label="Close layout">${Icons.x}</button>
        </div>
        <div class="layout-options">
          ${[
            ['split', 'Split', 'Editor and PDF side by side.'],
            ['editor', 'Editor only', 'Hide PDF preview and keep file tree visible.'],
            ['pdf', 'PDF only', 'Inspect the compiled document.'],
          ].map(([mode, label, hint]) => `
            <button class="layout-option ${app.workspaceMode === mode ? 'selected' : ''}" type="button" data-layout-mode="${mode}">
              <span>${Icons.layout16}</span>
              <strong>${label}</strong>
              <small>${hint}</small>
            </button>
          `).join('')}
        </div>
        <label class="switch-row">
          <span>Focus mode</span>
          <input type="checkbox" id="layout-focus-toggle" ${app.focusMode ? 'checked' : ''}>
        </label>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    LightTeXCore.modal.bindOverlayClose(overlay, close, '#layout-close');
    overlay.querySelectorAll('[data-layout-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        setMode(app, button.dataset.layoutMode);
        overlay.querySelectorAll('[data-layout-mode]').forEach((item) => item.classList.remove('selected'));
        button.classList.add('selected');
      });
    });
    overlay.querySelector('#layout-focus-toggle').addEventListener('change', (event) => {
      app.focusMode = event.target.checked;
      localStorage.setItem('lighttex-focus-mode', String(app.focusMode));
      applyFocusMode(app);
    });
  }

  function showShortcutsModal(app) {
    const mod = navigator.platform.toLowerCase().includes('mac') ? 'Cmd' : 'Ctrl';
    const shortcuts = [
      [`${mod}+S`, 'Compile current project'],
      [`${mod}+Shift+S`, 'Autosave then compile'],
      [`${mod}+K`, 'Command palette'],
      [`${mod}+P`, 'Open file palette'],
      [`${mod}+Shift+F`, 'Search across project'],
      [`${mod}+B`, 'Wrap selection in \\textbf{}'],
      [`${mod}+I`, 'Wrap selection in \\textit{}'],
      [`${mod}+Shift+M`, 'Wrap selection as inline math'],
      [`${mod}+Shift+I`, 'Wrap selection in \\emph{}'],
      [`${mod}+\\`, 'Toggle focus mode'],
      [`${mod}+Alt+1`, 'Split layout'],
      [`${mod}+Alt+2`, 'Editor-only layout'],
      [`${mod}+Alt+3`, 'PDF-only layout'],
      [`${mod}+?`, 'Show this shortcut list'],
    ];
    const overlay = LightTeXCore.modal.createOverlay();
    overlay.innerHTML = `
      <div class="modal shortcuts-modal" role="dialog" aria-label="Keyboard shortcuts">
        <div class="modal-heading-row">
          <div>
            <h2>Keyboard Shortcuts</h2>
            <p class="modal-subtitle">Fast navigation and workspace controls.</p>
          </div>
          <button class="btn-icon" type="button" id="shortcuts-close" title="Close shortcuts" aria-label="Close shortcuts">${Icons.x}</button>
        </div>
        <div class="shortcut-list">
          ${shortcuts.map(([keys, label]) => `
            <div class="shortcut-row">
              <kbd>${app.escapeHtml(keys)}</kbd>
              <span>${app.escapeHtml(label)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    LightTeXCore.modal.bindOverlayClose(overlay, close, '#shortcuts-close');
  }

  window.LightTeXFeatures.workspaceLayout = {
    applyFocusMode,
    modeLabel,
    setMode,
    showLayoutModal,
    showShortcutsModal,
    toggleFocusMode,
    togglePreview,
  };
})();
