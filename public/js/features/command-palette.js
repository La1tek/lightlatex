(function () {
  window.LightTeXFeatures = window.LightTeXFeatures || {};

  const symbolGroups = [
    {
      id: 'greek-lower',
      label: 'Greek lower',
      items: [
        { name: 'alpha', value: '\\alpha', preview: 'α' },
        { name: 'beta', value: '\\beta', preview: 'β' },
        { name: 'gamma', value: '\\gamma', preview: 'γ' },
        { name: 'delta', value: '\\delta', preview: 'δ' },
        { name: 'epsilon', value: '\\epsilon', preview: 'ε' },
        { name: 'theta', value: '\\theta', preview: 'θ' },
        { name: 'lambda', value: '\\lambda', preview: 'λ' },
        { name: 'mu', value: '\\mu', preview: 'μ' },
        { name: 'pi', value: '\\pi', preview: 'π' },
        { name: 'rho', value: '\\rho', preview: 'ρ' },
        { name: 'sigma', value: '\\sigma', preview: 'σ' },
        { name: 'phi', value: '\\phi', preview: 'φ' },
        { name: 'omega', value: '\\omega', preview: 'ω' },
      ],
    },
    {
      id: 'greek-upper',
      label: 'Greek upper',
      items: [
        { name: 'Gamma', value: '\\Gamma', preview: 'Γ' },
        { name: 'Delta', value: '\\Delta', preview: 'Δ' },
        { name: 'Theta', value: '\\Theta', preview: 'Θ' },
        { name: 'Lambda', value: '\\Lambda', preview: 'Λ' },
        { name: 'Xi', value: '\\Xi', preview: 'Ξ' },
        { name: 'Pi', value: '\\Pi', preview: 'Π' },
        { name: 'Sigma', value: '\\Sigma', preview: 'Σ' },
        { name: 'Phi', value: '\\Phi', preview: 'Φ' },
        { name: 'Psi', value: '\\Psi', preview: 'Ψ' },
        { name: 'Omega', value: '\\Omega', preview: 'Ω' },
      ],
    },
    {
      id: 'operators',
      label: 'Operators',
      items: [
        { name: 'frac', value: '\\frac{}{}', preview: 'a/b' },
        { name: 'sqrt', value: '\\sqrt{}', preview: '√x' },
        { name: 'sum', value: '\\sum', preview: '∑' },
        { name: 'prod', value: '\\prod', preview: '∏' },
        { name: 'int', value: '\\int', preview: '∫' },
        { name: 'lim', value: '\\lim', preview: 'lim' },
        { name: 'infty', value: '\\infty', preview: '∞' },
        { name: 'partial', value: '\\partial', preview: '∂' },
        { name: 'nabla', value: '\\nabla', preview: '∇' },
        { name: 'cdot', value: '\\cdot', preview: '·' },
        { name: 'times', value: '\\times', preview: '×' },
        { name: 'pm', value: '\\pm', preview: '±' },
        { name: 'leq', value: '\\leq', preview: '≤' },
        { name: 'geq', value: '\\geq', preview: '≥' },
        { name: 'neq', value: '\\neq', preview: '≠' },
        { name: 'approx', value: '\\approx', preview: '≈' },
        { name: 'equiv', value: '\\equiv', preview: '≡' },
        { name: 'propto', value: '\\propto', preview: '∝' },
        { name: 'subseteq', value: '\\subseteq', preview: '⊆' },
        { name: 'in', value: '\\in', preview: '∈' },
      ],
    },
    {
      id: 'arrows',
      label: 'Arrows',
      items: [
        { name: 'to', value: '\\to', preview: '→' },
        { name: 'leftarrow', value: '\\leftarrow', preview: '←' },
        { name: 'rightarrow', value: '\\rightarrow', preview: '→' },
        { name: 'leftrightarrow', value: '\\leftrightarrow', preview: '↔' },
        { name: 'Leftarrow', value: '\\Leftarrow', preview: '⇐' },
        { name: 'Rightarrow', value: '\\Rightarrow', preview: '⇒' },
        { name: 'Leftrightarrow', value: '\\Leftrightarrow', preview: '⇔' },
        { name: 'mapsto', value: '\\mapsto', preview: '↦' },
        { name: 'uparrow', value: '\\uparrow', preview: '↑' },
        { name: 'downarrow', value: '\\downarrow', preview: '↓' },
      ],
    },
    {
      id: 'text',
      label: 'Text',
      items: [
        { name: 'textbf', value: '\\textbf{}', preview: 'bold' },
        { name: 'textit', value: '\\textit{}', preview: 'italic' },
        { name: 'emph', value: '\\emph{}', preview: 'emphasis' },
        { name: 'underline', value: '\\underline{}', preview: 'underline' },
        { name: 'texttt', value: '\\texttt{}', preview: 'monospace' },
        { name: 'footnote', value: '\\footnote{}', preview: 'footnote' },
        { name: 'cite', value: '\\cite{}', preview: 'citation' },
        { name: 'ref', value: '\\ref{}', preview: 'reference' },
        { name: 'label', value: '\\label{}', preview: 'label' },
        { name: 'url', value: '\\url{}', preview: 'url' },
      ],
    },
    {
      id: 'environments',
      label: 'Environments',
      items: [
        { name: 'equation', value: '\\begin{equation}\n  \n\\end{equation}', preview: 'numbered equation' },
        { name: 'align', value: '\\begin{align}\n  \n\\end{align}', preview: 'aligned equations' },
        { name: 'itemize', value: '\\begin{itemize}\n  \\item \n\\end{itemize}', preview: 'bullet list' },
        { name: 'enumerate', value: '\\begin{enumerate}\n  \\item \n\\end{enumerate}', preview: 'numbered list' },
        { name: 'figure', value: '\\begin{figure}[ht]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{images/}\n  \\caption{}\n  \\label{fig:}\n\\end{figure}', preview: 'figure block' },
        { name: 'table', value: '\\begin{table}[ht]\n  \\centering\n  \\begin{tabular}{}\n  \n  \\end{tabular}\n  \\caption{}\n  \\label{tab:}\n\\end{table}', preview: 'table block' },
      ],
    },
  ];

  function showSymbolsPalette(app) {
    if (!app.ensureCanEdit('insert symbols')) return;
    const overlay = LightTeXCore.modal.createOverlay('symbols-overlay');
    overlay.innerHTML = `
      <div class="modal symbols-modal" role="dialog" aria-label="LaTeX symbols">
        <div class="modal-heading-row">
          <div>
            <h2>Symbols</h2>
            <p class="modal-subtitle">Pick a command and preview what will be inserted.</p>
          </div>
          <button class="btn-icon" type="button" id="symbols-close" title="Close symbols" aria-label="Close symbols">${Icons.x}</button>
        </div>
        <div class="symbols-toolbar">
          <label class="dashboard-search symbols-search" aria-label="Search symbols">
            ${Icons.search16}
            <input id="symbols-search-input" type="search" placeholder="Search commands, glyphs, environments..." autocomplete="off">
          </label>
          <div class="symbols-tabs" role="tablist" aria-label="Symbol groups">
            ${symbolGroups.map((group, index) => `<button class="${index === 0 ? 'active' : ''}" type="button" data-symbol-tab="${group.id}">${app.escapeHtml(group.label)}</button>`).join('')}
          </div>
        </div>
        <div class="symbols-body">
          <div class="symbols-grid" id="symbols-grid"></div>
          <aside class="symbols-preview" id="symbols-preview" aria-live="polite"></aside>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    const input = overlay.querySelector('#symbols-search-input');
    const grid = overlay.querySelector('#symbols-grid');
    const preview = overlay.querySelector('#symbols-preview');
    let activeGroup = symbolGroups[0].id;
    let activeIndex = 0;
    let visibleItems = [];

    const getItems = () => {
      const query = input.value.trim().toLowerCase();
      const group = symbolGroups.find((item) => item.id === activeGroup);
      const source = query
        ? symbolGroups.flatMap((item) => item.items.map((symbol) => ({ group: item.label, ...symbol })))
        : group.items.map((symbol) => ({ group: group.label, ...symbol }));
      return source
        .filter((item) => !query
          || item.name.toLowerCase().includes(query)
          || item.value.toLowerCase().includes(query)
          || item.group.toLowerCase().includes(query)
          || (item.preview || '').toLowerCase().includes(query))
        .slice(0, 60);
    };

    const insertItem = (item) => {
      Editor.insertText(item.value);
      close();
    };

    const selectItem = (index) => {
      activeIndex = Math.max(0, Math.min(index, visibleItems.length - 1));
      grid.querySelectorAll('.symbol-item').forEach((button, buttonIndex) => {
        button.classList.toggle('active', buttonIndex === activeIndex);
      });
      const item = visibleItems[activeIndex];
      if (!item) {
        preview.innerHTML = '<div class="command-empty">No symbol selected</div>';
        return;
      }
      preview.innerHTML = `
        <div class="symbol-preview-glyph">${app.escapeHtml(item.preview || item.name)}</div>
        <div class="symbol-preview-meta">
          <span>${app.escapeHtml(item.group)}</span>
          <strong>${app.escapeHtml(item.name)}</strong>
        </div>
        <pre>${app.escapeHtml(item.value)}</pre>
        <button class="btn btn-primary" type="button" id="insert-symbol-preview">${Icons.plus16} Insert</button>
      `;
      preview.querySelector('#insert-symbol-preview')?.addEventListener('click', () => insertItem(item));
    };

    const render = () => {
      visibleItems = getItems();
      activeIndex = Math.min(activeIndex, Math.max(0, visibleItems.length - 1));
      grid.innerHTML = visibleItems.length === 0
        ? '<div class="command-empty">No symbols match this search</div>'
        : visibleItems.map((item, index) => `
          <button class="symbol-item ${index === 0 ? 'active' : ''}" type="button" data-index="${index}">
            <span class="symbol-glyph">${app.escapeHtml(item.preview || item.name)}</span>
            <code>${app.escapeHtml(item.value)}</code>
            <span>${app.escapeHtml(item.name)}</span>
            <small>${app.escapeHtml(item.group)}</small>
          </button>
        `).join('');
      grid.querySelectorAll('.symbol-item').forEach((button) => {
        button.addEventListener('mouseenter', () => selectItem(parseInt(button.dataset.index, 10)));
        button.addEventListener('focus', () => selectItem(parseInt(button.dataset.index, 10)));
        button.addEventListener('click', () => {
          const item = visibleItems[parseInt(button.dataset.index, 10)];
          if (item) insertItem(item);
        });
      });
      selectItem(activeIndex);
      overlay._symbolItems = visibleItems;
    };

    LightTeXCore.modal.bindOverlayClose(overlay, close, '#symbols-close');
    overlay.querySelectorAll('[data-symbol-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        activeGroup = button.dataset.symbolTab;
        overlay.querySelectorAll('[data-symbol-tab]').forEach((tab) => tab.classList.remove('active'));
        button.classList.add('active');
        input.value = '';
        activeIndex = 0;
        render();
      });
    });
    input.addEventListener('input', () => {
      activeIndex = 0;
      render();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        close();
      } else if (event.key === 'Enter') {
        const item = overlay._symbolItems?.[activeIndex];
        if (item) insertItem(item);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        selectItem(activeIndex + 1);
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        selectItem(activeIndex - 1);
      }
    });
    render();
    input.focus();
  }

  function showCommandPalette(app, mode = 'commands') {
    const overlay = LightTeXCore.modal.createOverlay('command-palette-overlay');
    overlay.innerHTML = `
      <div class="command-palette" role="dialog" aria-label="Command palette">
        <input id="command-input" type="text" placeholder="${mode === 'files' ? 'Open file...' : 'Run command...'}" autocomplete="off">
        <div class="command-list" id="command-list"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#command-input');
    const list = overlay.querySelector('#command-list');
    const close = () => overlay.remove();
    const commands = [
      { label: 'Compile project', hint: 'Ctrl+S', run: () => app.compile() },
      { label: 'Run preflight check', hint: 'Main file, assets, refs', run: () => app.showPreflightCheck() },
      { label: 'Search project', hint: 'Ctrl+Shift+F', run: () => app.showSearchModal() },
      { label: 'Open symbols palette', hint: 'Greek, math, environments', run: () => app.showSymbolsPalette() },
      { label: 'Open citation manager', hint: '.bib search and cite insert', run: () => app.showCitationManager() },
      { label: 'Open asset manager', hint: 'Images, PDFs, includegraphics', run: () => app.showAssetManager() },
      { label: 'Open CLI sync center', hint: 'Hashes, commands, conflicts', run: () => app.showSyncCenter() },
      { label: app.devMode ? 'Hide file hashes' : 'Show file hashes', hint: 'Dev mode file tree tooltips', run: () => {
        app.devMode = !app.devMode;
        localStorage.setItem('lighttex-dev-mode', String(app.devMode));
        if (app.fileTree) app.fileTree.setDevMode(app.devMode);
      } },
      { label: 'Show document outline', hint: 'Sections, labels, citations', run: () => document.querySelector('[data-tab="outline"]')?.click() },
      { label: 'Check references', hint: 'Broken refs, labels, citations', run: () => document.querySelector('[data-tab="refs"]')?.click() },
      { label: 'Show TODO list', hint: 'TODO, FIXME, HACK, NOTE', run: () => document.querySelector('[data-tab="todo"]')?.click() },
      { label: 'Project settings', hint: 'Compiler, main file', run: () => app.showProjectSettingsModal() },
      { label: 'Global settings', hint: 'Theme, editor, defaults', run: () => app.showGlobalSettingsModal() },
      { label: 'Toggle PDF preview', hint: 'Editor / PDF', run: () => app.togglePreview() },
      { label: 'Open history', hint: 'Snapshots', run: () => app.showHistoryModal() },
      { label: 'Create named snapshot', hint: 'Manual version checkpoint', run: () => app.showCreateSnapshotModal() },
      { label: 'Download PDF', hint: 'output.pdf', run: () => app.downloadPdf() },
      { label: 'Download project ZIP', hint: '.zip', run: () => app.downloadProject() },
      { label: 'Toggle theme', hint: document.documentElement.dataset.theme === 'dark' ? 'Light' : 'Dark', run: () => app.toggleTheme() },
    ];
    const fileItems = app.projectFiles.map((file) => ({
      label: file.path,
      hint: 'Open file',
      run: () => app.openFile(file.path),
    }));
    const items = mode === 'files' ? fileItems : commands.concat(fileItems);

    const render = () => {
      const query = input.value.trim().toLowerCase();
      const filtered = items.filter((item) => item.label.toLowerCase().includes(query) || item.hint.toLowerCase().includes(query)).slice(0, 12);
      list.innerHTML = filtered.length === 0
        ? '<div class="command-empty">No matches</div>'
        : filtered.map((item, index) => `
          <button class="command-item ${index === 0 ? 'active' : ''}" type="button" data-index="${index}">
            <span>${app.escapeHtml(item.label)}</span>
            <small>${app.escapeHtml(item.hint)}</small>
          </button>
        `).join('');
      list.querySelectorAll('.command-item').forEach((button) => {
        button.addEventListener('click', () => {
          const item = filtered[parseInt(button.dataset.index, 10)];
          close();
          item.run();
        });
      });
      overlay._filteredCommands = filtered;
    };
    render();
    input.addEventListener('input', render);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        close();
      } else if (event.key === 'Enter') {
        const item = overlay._filteredCommands?.[0];
        if (item) {
          close();
          item.run();
        }
      }
    });
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    input.focus();
  }

  window.LightTeXFeatures.commandPalette = {
    showCommandPalette,
    showSymbolsPalette,
  };
})();
