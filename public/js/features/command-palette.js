(function () {
  window.LightTeXFeatures = window.LightTeXFeatures || {};

  const symbolGroups = [
    {
      id: 'greek',
      label: 'Greek',
      items: [
        ['alpha', '\\alpha'], ['beta', '\\beta'], ['gamma', '\\gamma'], ['delta', '\\delta'],
        ['epsilon', '\\epsilon'], ['theta', '\\theta'], ['lambda', '\\lambda'], ['mu', '\\mu'],
        ['pi', '\\pi'], ['rho', '\\rho'], ['sigma', '\\sigma'], ['phi', '\\phi'],
        ['omega', '\\omega'], ['Gamma', '\\Gamma'], ['Delta', '\\Delta'], ['Theta', '\\Theta'],
        ['Lambda', '\\Lambda'], ['Sigma', '\\Sigma'], ['Phi', '\\Phi'], ['Omega', '\\Omega'],
      ],
    },
    {
      id: 'operators',
      label: 'Operators',
      items: [
        ['frac', '\\frac{}{}'], ['sqrt', '\\sqrt{}'], ['sum', '\\sum'], ['prod', '\\prod'],
        ['int', '\\int'], ['lim', '\\lim'], ['infty', '\\infty'], ['partial', '\\partial'],
        ['nabla', '\\nabla'], ['cdot', '\\cdot'], ['times', '\\times'], ['pm', '\\pm'],
        ['leq', '\\leq'], ['geq', '\\geq'], ['neq', '\\neq'], ['approx', '\\approx'],
        ['equiv', '\\equiv'], ['propto', '\\propto'], ['subseteq', '\\subseteq'], ['in', '\\in'],
      ],
    },
    {
      id: 'arrows',
      label: 'Arrows',
      items: [
        ['to', '\\to'], ['leftarrow', '\\leftarrow'], ['rightarrow', '\\rightarrow'],
        ['leftrightarrow', '\\leftrightarrow'], ['Leftarrow', '\\Leftarrow'], ['Rightarrow', '\\Rightarrow'],
        ['Leftrightarrow', '\\Leftrightarrow'], ['mapsto', '\\mapsto'], ['uparrow', '\\uparrow'],
        ['downarrow', '\\downarrow'],
      ],
    },
    {
      id: 'text',
      label: 'Text',
      items: [
        ['textbf', '\\textbf{}'], ['textit', '\\textit{}'], ['emph', '\\emph{}'],
        ['underline', '\\underline{}'], ['texttt', '\\texttt{}'], ['footnote', '\\footnote{}'],
        ['cite', '\\cite{}'], ['ref', '\\ref{}'], ['label', '\\label{}'], ['url', '\\url{}'],
      ],
    },
    {
      id: 'environments',
      label: 'Environments',
      items: [
        ['equation', '\\begin{equation}\n  \n\\end{equation}'],
        ['align', '\\begin{align}\n  \n\\end{align}'],
        ['itemize', '\\begin{itemize}\n  \\item \n\\end{itemize}'],
        ['enumerate', '\\begin{enumerate}\n  \\item \n\\end{enumerate}'],
        ['figure', '\\begin{figure}[ht]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{images/}\n  \\caption{}\n  \\label{fig:}\n\\end{figure}'],
        ['table', '\\begin{table}[ht]\n  \\centering\n  \\begin{tabular}{}\n  \n  \\end{tabular}\n  \\caption{}\n  \\label{tab:}\n\\end{table}'],
      ],
    },
  ];

  function showSymbolsPalette(app) {
    if (!app.ensureCanEdit('insert symbols')) return;
    const overlay = LightTeXCore.modal.createOverlay('symbols-overlay');
    overlay.innerHTML = `
      <div class="modal symbols-modal" role="dialog" aria-label="LaTeX symbols">
        <div class="modal-heading-row">
          <h2>Symbols</h2>
          <button class="btn-icon" type="button" id="symbols-close" title="Close symbols" aria-label="Close symbols">${Icons.x}</button>
        </div>
        <label class="dashboard-search symbols-search" aria-label="Search symbols">
          ${Icons.search16}
          <input id="symbols-search-input" type="search" placeholder="Search commands, symbols, environments..." autocomplete="off">
        </label>
        <div class="symbols-tabs" role="tablist" aria-label="Symbol groups">
          ${symbolGroups.map((group, index) => `<button class="${index === 0 ? 'active' : ''}" type="button" data-symbol-tab="${group.id}">${app.escapeHtml(group.label)}</button>`).join('')}
        </div>
        <div class="symbols-grid" id="symbols-grid"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    const input = overlay.querySelector('#symbols-search-input');
    const grid = overlay.querySelector('#symbols-grid');
    let activeGroup = symbolGroups[0].id;

    const getItems = () => {
      const query = input.value.trim().toLowerCase();
      const group = symbolGroups.find((item) => item.id === activeGroup);
      const source = query
        ? symbolGroups.flatMap((item) => item.items.map(([name, value]) => ({ group: item.label, name, value })))
        : group.items.map(([name, value]) => ({ group: group.label, name, value }));
      return source
        .filter((item) => !query || item.name.toLowerCase().includes(query) || item.value.toLowerCase().includes(query) || item.group.toLowerCase().includes(query))
        .slice(0, 60);
    };

    const insertItem = (item) => {
      Editor.insertText(item.value);
      close();
    };

    const render = () => {
      const items = getItems();
      grid.innerHTML = items.length === 0
        ? '<div class="command-empty">No symbols match this search</div>'
        : items.map((item, index) => `
          <button class="symbol-item ${index === 0 ? 'active' : ''}" type="button" data-index="${index}">
            <code>${app.escapeHtml(item.value)}</code>
            <span>${app.escapeHtml(item.name)}</span>
            <small>${app.escapeHtml(item.group)}</small>
          </button>
        `).join('');
      grid.querySelectorAll('.symbol-item').forEach((button) => {
        button.addEventListener('click', () => {
          const item = items[parseInt(button.dataset.index, 10)];
          if (item) insertItem(item);
        });
      });
      overlay._symbolItems = items;
    };

    LightTeXCore.modal.bindOverlayClose(overlay, close, '#symbols-close');
    overlay.querySelectorAll('[data-symbol-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        activeGroup = button.dataset.symbolTab;
        overlay.querySelectorAll('[data-symbol-tab]').forEach((tab) => tab.classList.remove('active'));
        button.classList.add('active');
        input.value = '';
        render();
      });
    });
    input.addEventListener('input', render);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        close();
      } else if (event.key === 'Enter') {
        const item = overlay._symbolItems?.[0];
        if (item) insertItem(item);
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
