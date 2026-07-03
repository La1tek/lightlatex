(function () {
  window.LightTeXFeatures = window.LightTeXFeatures || {};

  const DEFAULTS = {
    theme: 'light',
    compiler: 'pdflatex',
    fontSize: 14,
    wordWrap: 'on',
    devMode: false,
  };

  function getPreference(key, fallback) {
    return localStorage.getItem(key) || fallback;
  }

  function show(app) {
    const theme = document.documentElement.dataset.theme || DEFAULTS.theme;
    const defaultCompiler = getPreference('lighttex-default-compiler', DEFAULTS.compiler);
    const fontSize = Editor.getFontSize();
    const wordWrap = Editor.getWordWrap();
    const devMode = localStorage.getItem('lighttex-dev-mode') === 'true';

    const overlay = LightTeXCore.modal.createOverlay();
    overlay.innerHTML = `
      <div class="modal settings-modal global-settings-modal" role="dialog" aria-label="Global settings">
        <div class="modal-heading-row">
          <div>
            <h2>Global Settings</h2>
            <p class="modal-subtitle">Local preferences for this browser and LightTeX server.</p>
          </div>
          <button class="btn-icon" type="button" id="global-settings-close" title="Close settings" aria-label="Close settings">${Icons.x}</button>
        </div>
        <form id="global-settings-form">
          <div class="settings-section">
            <h3>Appearance</h3>
            <div class="form-grid two-col">
              <div class="form-group">
                <label for="global-theme">Theme</label>
                <select id="global-theme">
                  <option value="light" ${theme === 'light' ? 'selected' : ''}>Light</option>
                  <option value="dark" ${theme === 'dark' ? 'selected' : ''}>Dark</option>
                </select>
              </div>
              <div class="form-group">
                <label for="global-editor-font-size">Editor font size</label>
                <input id="global-editor-font-size" type="number" min="11" max="22" step="1" value="${fontSize}">
              </div>
            </div>
          </div>
          <div class="settings-section">
            <h3>Editor</h3>
            <div class="form-grid two-col">
              <div class="form-group">
                <label for="global-word-wrap">Word wrap</label>
                <select id="global-word-wrap">
                  <option value="on" ${wordWrap === 'on' ? 'selected' : ''}>On</option>
                  <option value="off" ${wordWrap === 'off' ? 'selected' : ''}>Off</option>
                  <option value="bounded" ${wordWrap === 'bounded' ? 'selected' : ''}>Bounded</option>
                </select>
              </div>
              <div class="form-group">
                <label for="global-default-compiler">Default compiler</label>
                <select id="global-default-compiler">
                  <option value="pdflatex" ${defaultCompiler === 'pdflatex' ? 'selected' : ''}>pdflatex</option>
                  <option value="xelatex" ${defaultCompiler === 'xelatex' ? 'selected' : ''}>xelatex</option>
                  <option value="lualatex" ${defaultCompiler === 'lualatex' ? 'selected' : ''}>lualatex</option>
                </select>
              </div>
            </div>
            <label class="switch-row">
              <span>Show file hashes in dev mode</span>
              <input type="checkbox" id="global-dev-mode" ${devMode ? 'checked' : ''}>
            </label>
          </div>
          <div class="settings-section">
            <h3>Server</h3>
            <div class="settings-access-row">
              <span>Base URL</span>
              <code>${app.escapeHtml(window.location.origin)}</code>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" type="button" id="global-settings-reset">Reset local preferences</button>
            <button class="btn btn-primary" type="submit">Save settings</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    LightTeXCore.modal.bindOverlayClose(overlay, close, '#global-settings-close');

    overlay.querySelector('#global-settings-form').addEventListener('submit', (event) => {
      event.preventDefault();
      applySettings(app, overlay);
      close();
      app.notify('Global settings saved', 'success');
    });

    overlay.querySelector('#global-settings-reset').addEventListener('click', () => {
      localStorage.removeItem('theme');
      localStorage.removeItem('lighttex-default-compiler');
      localStorage.removeItem('lighttex-editor-font-size');
      localStorage.removeItem('lighttex-editor-word-wrap');
      localStorage.removeItem('lighttex-dev-mode');
      applySettings(app, overlay, DEFAULTS);
      close();
      app.notify('Global settings reset', 'info');
    });

    overlay.querySelector('#global-theme').focus();
  }

  function applySettings(app, overlay, forcedValues = null) {
    const values = forcedValues || {
      theme: overlay.querySelector('#global-theme').value,
      compiler: overlay.querySelector('#global-default-compiler').value,
      fontSize: overlay.querySelector('#global-editor-font-size').value,
      wordWrap: overlay.querySelector('#global-word-wrap').value,
      devMode: overlay.querySelector('#global-dev-mode').checked,
    };

    document.documentElement.dataset.theme = values.theme;
    localStorage.setItem('theme', values.theme);
    localStorage.setItem('lighttex-default-compiler', values.compiler);
    localStorage.setItem('lighttex-dev-mode', String(values.devMode));
    Editor.setTheme(values.theme);
    Editor.setFontSize(values.fontSize);
    Editor.setWordWrap(values.wordWrap);

    app.devMode = Boolean(values.devMode);
    if (app.fileTree) app.fileTree.setDevMode(app.devMode);
    document.querySelectorAll('#toggle-theme-btn').forEach((button) => {
      button.innerHTML = values.theme === 'dark' ? Icons.moon16 : Icons.sun16;
    });
  }

  window.LightTeXFeatures.globalSettings = { show };
})();
