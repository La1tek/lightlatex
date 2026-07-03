(function () {
  window.LightTeXFeatures = window.LightTeXFeatures || {};

  function getActiveSidebarTab() {
    return document.querySelector('.sidebar-tab.active')?.dataset.tab || 'files';
  }

  function queueStructureRefresh(app) {
    clearTimeout(app.structureRefreshTimer);
    app.structureRefreshTimer = setTimeout(() => refreshActiveSidebarPanel(app), 700);
  }

  function refreshActiveSidebarPanel(app) {
    const tab = getActiveSidebarTab();
    if (tab === 'outline') parseOutline(app);
    if (tab === 'refs') parseReferences(app);
    if (tab === 'todo') parseTodos(app);
  }

  function stripLatexComment(line) {
    for (let i = 0; i < line.length; i++) {
      if (line[i] !== '%') continue;
      let slashCount = 0;
      for (let j = i - 1; j >= 0 && line[j] === '\\'; j--) slashCount++;
      if (slashCount % 2 === 0) return line.slice(0, i);
    }
    return line;
  }

  function readLatexBraceArgument(line, startIndex) {
    let i = startIndex;
    while (i < line.length && /\s/.test(line[i])) i++;
    if (line[i] === '[') {
      let depth = 0;
      while (i < line.length) {
        if (line[i] === '[') depth++;
        if (line[i] === ']') depth--;
        i++;
        if (depth === 0) break;
      }
      while (i < line.length && /\s/.test(line[i])) i++;
    }
    if (line[i] !== '{') return '';
    let depth = 0;
    let value = '';
    for (; i < line.length; i++) {
      const char = line[i];
      const escaped = i > 0 && line[i - 1] === '\\';
      if (char === '{' && !escaped) {
        if (depth > 0) value += char;
        depth++;
        continue;
      }
      if (char === '}' && !escaped) {
        depth--;
        if (depth === 0) break;
      }
      if (depth > 0) value += char;
    }
    return value;
  }

  function cleanLatexText(value) {
    return (value || '')
      .replace(/\\(?:textbf|textit|emph|texttt|underline)\s*\{([^}]*)\}/g, '$1')
      .replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g, '')
      .replace(/[{}]/g, '')
      .replace(/~/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isStructureFile(filePath) {
    return /\.(tex|bib|sty|cls)$/i.test(filePath);
  }

  async function collectProjectStructure(app) {
    const textFiles = app.projectFiles
      .filter((file) => isStructureFile(file.path))
      .sort((a, b) => a.path.localeCompare(b.path));
    const sectionLevels = {
      part: 0,
      chapter: 1,
      section: 2,
      subsection: 3,
      subsubsection: 4,
      paragraph: 5,
      subparagraph: 6,
    };
    const structure = {
      sections: [],
      labels: [],
      environments: [],
      citations: [],
      refs: [],
      bibEntries: [],
      graphics: [],
      bibliographies: [],
      todos: [],
      filesRead: 0,
    };

    for (const file of textFiles) {
      let content = '';
      try {
        content = await app.readProjectTextFile(file.path);
        structure.filesRead++;
      } catch {
        continue;
      }

      const lines = content.split('\n');
      for (let index = 0; index < lines.length; index++) {
        const rawLine = lines[index];
        const line = stripLatexComment(rawLine);
        const lineNumber = index + 1;

        if (file.path.endsWith('.bib')) {
          const bibRegex = /@\w+\s*\{\s*([^,\s]+)\s*,/g;
          let bibMatch;
          while ((bibMatch = bibRegex.exec(line)) !== null) {
            structure.bibEntries.push({
              type: 'bib',
              title: bibMatch[1],
              file: file.path,
              line: lineNumber,
            });
          }
        }

        const todoMatch = rawLine.match(/%(TODO|FIXME|HACK|NOTE)\s*:?\s*(.*)/i);
        if (todoMatch) {
          structure.todos.push({
            type: todoMatch[1].toUpperCase(),
            text: todoMatch[2] || '(empty)',
            file: file.path,
            line: lineNumber,
          });
        }

        const sectionCommandRegex = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?/g;
        let sectionMatch;
        while ((sectionMatch = sectionCommandRegex.exec(line)) !== null) {
          const command = sectionMatch[1];
          const title = cleanLatexText(readLatexBraceArgument(line, sectionCommandRegex.lastIndex));
          if (!title) continue;
          structure.sections.push({
            type: 'section',
            command,
            level: sectionLevels[command],
            title,
            file: file.path,
            line: lineNumber,
          });
        }

        const envRegex = /\\begin\{(figure\*?|table\*?|equation\*?|align\*?)\}/g;
        let envMatch;
        while ((envMatch = envRegex.exec(line)) !== null) {
          structure.environments.push({
            type: 'environment',
            environment: envMatch[1],
            title: envMatch[1],
            file: file.path,
            line: lineNumber,
          });
        }

        const labelRegex = /\\label\s*\{([^}]+)\}/g;
        let labelMatch;
        while ((labelMatch = labelRegex.exec(line)) !== null) {
          structure.labels.push({
            type: 'label',
            title: labelMatch[1],
            file: file.path,
            line: lineNumber,
          });
        }

        const refRegex = /\\(?:ref|eqref|autoref|cref|Cref)\s*\{([^}]+)\}/g;
        let refMatch;
        while ((refMatch = refRegex.exec(line)) !== null) {
          structure.refs.push({
            type: 'ref',
            title: refMatch[1],
            file: file.path,
            line: lineNumber,
          });
        }

        const citeRegex = /\\(?:cite|citep|citet|parencite|textcite|autocite)\w*\s*\{([^}]+)\}/g;
        let citeMatch;
        while ((citeMatch = citeRegex.exec(line)) !== null) {
          citeMatch[1].split(',').map((item) => item.trim()).filter(Boolean).forEach((key) => {
            structure.citations.push({
              type: 'citation',
              title: key,
              file: file.path,
              line: lineNumber,
            });
          });
        }

        const graphicsRegex = /\\includegraphics(?:\[[^\]]*\])?\s*\{([^}]+)\}/g;
        let graphicsMatch;
        while ((graphicsMatch = graphicsRegex.exec(line)) !== null) {
          structure.graphics.push({
            type: 'graphic',
            title: graphicsMatch[1],
            file: file.path,
            line: lineNumber,
          });
        }

        const addBibRegex = /\\addbibresource(?:\[[^\]]*\])?\s*\{([^}]+)\}/g;
        let addBibMatch;
        while ((addBibMatch = addBibRegex.exec(line)) !== null) {
          structure.bibliographies.push({
            type: 'bibliography',
            title: addBibMatch[1],
            file: file.path,
            line: lineNumber,
          });
        }

        const bibliographyRegex = /\\bibliography\s*\{([^}]+)\}/g;
        let bibliographyMatch;
        while ((bibliographyMatch = bibliographyRegex.exec(line)) !== null) {
          bibliographyMatch[1].split(',').map((item) => item.trim()).filter(Boolean).forEach((bibFile) => {
            structure.bibliographies.push({
              type: 'bibliography',
              title: bibFile.endsWith('.bib') ? bibFile : `${bibFile}.bib`,
              file: file.path,
              line: lineNumber,
            });
          });
        }
      }
    }

    return structure;
  }

  function renderOutlineGroup(app, title, items, kindLabel) {
    if (!items.length) return '';
    return `
      <section class="outline-group">
        <div class="outline-group-title">${app.escapeHtml(title)}</div>
        ${items.map((item) => renderOutlineItem(app, item, kindLabel)).join('')}
      </section>
    `;
  }

  function renderOutlineItem(app, item, kindLabel) {
    const levelClass = item.level !== undefined ? ` level-${item.level}` : '';
    const activeClass = item.file === Editor.currentFilePath ? ' current-file' : '';
    const label = kindLabel || item.command || item.environment || item.type;
    return `
      <button class="outline-item${levelClass}${activeClass}" type="button" data-file="${app.escapeHtml(item.file)}" data-line="${item.line}">
        <span class="outline-item-kind">${app.escapeHtml(label)}</span>
        <span class="outline-item-main">
          <span class="outline-item-title">${app.escapeHtml(item.title || '(untitled)')}</span>
          <span class="outline-item-location">${app.escapeHtml(item.file)}:${item.line}</span>
        </span>
      </button>
    `;
  }

  function bindStructureNavigation(app, container) {
    container.querySelectorAll('[data-file][data-line]').forEach((item) => {
      item.addEventListener('click', () => {
        const file = item.dataset.file;
        const line = parseInt(item.dataset.line, 10);
        if (!file) return;
        app.openFile(file);
        setTimeout(() => Editor.revealLine(line), 200);
      });
    });
  }

  async function parseOutline(app) {
    const outlineEl = document.getElementById('outline-content');
    if (!outlineEl) return;
    outlineEl.innerHTML = '<div class="panel-loading">Parsing project structure...</div>';
    try {
      const structure = await collectProjectStructure(app);
      const sectionCount = structure.sections.length;
      const labelCount = structure.labels.length;
      const envCount = structure.environments.length;
      const citeCount = new Set(structure.citations.map((item) => item.title)).size;

      if (sectionCount + labelCount + envCount + citeCount === 0) {
        outlineEl.innerHTML = `
          <div class="panel-empty">
            <strong>No outline yet</strong>
            <span>Add \\section{}, \\label{}, figures, tables, or citations to build project navigation.</span>
          </div>
        `;
        return;
      }

      const uniqueCitations = Array.from(new Map(structure.citations.map((item) => [item.title, item])).values());
      outlineEl.innerHTML = `
        <div class="outline-summary">
          <span>${sectionCount} sections</span>
          <span>${labelCount} labels</span>
          <span>${envCount} floats/math</span>
          <span>${citeCount} cites</span>
        </div>
        ${renderOutlineGroup(app, 'Document Structure', structure.sections)}
        ${renderOutlineGroup(app, 'Figures, Tables & Equations', structure.environments, 'env')}
        ${renderOutlineGroup(app, 'Labels', structure.labels, 'label')}
        ${renderOutlineGroup(app, 'Citations', uniqueCitations, 'cite')}
      `;
      bindStructureNavigation(app, outlineEl);
    } catch (err) {
      outlineEl.innerHTML = `
        <div class="panel-empty error">
          <strong>Could not parse outline</strong>
          <span>${app.escapeHtml(err.message || 'Unknown parser error')}</span>
        </div>
      `;
    }
  }

  async function parseReferences(app) {
    const refsEl = document.getElementById('refs-content');
    if (!refsEl) return;
    refsEl.innerHTML = '<div class="panel-loading">Checking labels, refs, and citations...</div>';
    try {
      const structure = await collectProjectStructure(app);
      const labelsByKey = new Map();
      const refsByKey = new Map();
      const bibKeys = new Set(structure.bibEntries.map((item) => item.title));

      structure.labels.forEach((item) => {
        if (!labelsByKey.has(item.title)) labelsByKey.set(item.title, []);
        labelsByKey.get(item.title).push(item);
      });
      structure.refs.forEach((item) => {
        if (!refsByKey.has(item.title)) refsByKey.set(item.title, []);
        refsByKey.get(item.title).push(item);
      });

      const brokenRefs = structure.refs
        .filter((item) => !labelsByKey.has(item.title))
        .map((item) => ({ ...item, kind: 'ref', severity: 'error', message: 'Referenced label was not found' }));
      const duplicateLabels = Array.from(labelsByKey.entries())
        .filter(([, items]) => items.length > 1)
        .flatMap(([key, items]) => items.map((item) => ({ ...item, title: key, kind: 'label', severity: 'warning', message: 'Duplicate label key' })));
      const unusedLabels = structure.labels
        .filter((item) => !refsByKey.has(item.title))
        .map((item) => ({ ...item, kind: 'label', severity: 'info', message: 'Label is not referenced in project' }));
      const missingCitations = structure.bibEntries.length === 0
        ? []
        : structure.citations
          .filter((item) => !bibKeys.has(item.title))
          .map((item) => ({ ...item, kind: 'cite', severity: 'warning', message: 'Citation key was not found in .bib files' }));

      const issueCount = brokenRefs.length + duplicateLabels.length + unusedLabels.length + missingCitations.length;
      refsEl.innerHTML = `
        <div class="outline-summary diagnostic-summary">
          <span class="${brokenRefs.length ? 'error' : ''}">${brokenRefs.length} broken refs</span>
          <span class="${duplicateLabels.length ? 'warning' : ''}">${duplicateLabels.length} duplicate labels</span>
          <span>${unusedLabels.length} unused labels</span>
          <span class="${missingCitations.length ? 'warning' : ''}">${missingCitations.length} missing cites</span>
        </div>
        ${issueCount === 0 ? `
          <div class="panel-empty">
            <strong>References look clean</strong>
            <span>No broken refs, duplicate labels, unused labels, or missing citation keys detected.</span>
          </div>
        ` : `
          ${renderDiagnosticGroup(app, 'Broken References', brokenRefs)}
          ${renderDiagnosticGroup(app, 'Duplicate Labels', duplicateLabels)}
          ${renderDiagnosticGroup(app, 'Unused Labels', unusedLabels)}
          ${renderDiagnosticGroup(app, 'Missing Citations', missingCitations)}
        `}
      `;
      bindStructureNavigation(app, refsEl);
    } catch (err) {
      refsEl.innerHTML = `
        <div class="panel-empty error">
          <strong>Could not check references</strong>
          <span>${app.escapeHtml(err.message || 'Unknown reference parser error')}</span>
        </div>
      `;
    }
  }

  function renderDiagnosticGroup(app, title, items) {
    if (!items.length) return '';
    return `
      <section class="outline-group">
        <div class="outline-group-title">${app.escapeHtml(title)}</div>
        ${items.map((item) => `
          <button class="diagnostic-item ${app.escapeHtml(item.severity)}" type="button" data-file="${app.escapeHtml(item.file)}" data-line="${item.line}">
            <span class="diagnostic-kind">${app.escapeHtml(item.kind)}</span>
            <span class="outline-item-main">
              <span class="outline-item-title">${app.escapeHtml(item.title || '(empty key)')}</span>
              <span class="outline-item-location">${app.escapeHtml(item.message)} · ${app.escapeHtml(item.file)}:${item.line}</span>
            </span>
          </button>
        `).join('')}
      </section>
    `;
  }

  async function showPreflightCheck(app) {
    const overlay = LightTeXCore.modal.createOverlay();
    overlay.innerHTML = `
      <div class="modal preflight-modal" role="dialog" aria-label="Preflight check">
        <div class="modal-heading-row">
          <div>
            <h2>Preflight Check</h2>
            <p class="modal-subtitle">Project checks before compile/export.</p>
          </div>
          <button class="btn-icon" type="button" id="preflight-close" title="Close preflight" aria-label="Close preflight">${Icons.x}</button>
        </div>
        <div id="preflight-body">
          <div class="panel-loading">Checking project...</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    const body = overlay.querySelector('#preflight-body');
    LightTeXCore.modal.bindOverlayClose(overlay, close, '#preflight-close');

    try {
      const structure = await collectProjectStructure(app);
      const filePaths = new Set(app.projectFiles.map((file) => app.normalizeProjectPath(file.path)));
      const labelKeys = new Set(structure.labels.map((item) => item.title));
      const refKeys = new Set(structure.refs.map((item) => item.title));
      const bibKeys = new Set(structure.bibEntries.map((item) => item.title));
      const labelsByKey = structure.labels.reduce((acc, item) => {
        if (!acc.has(item.title)) acc.set(item.title, []);
        acc.get(item.title).push(item);
        return acc;
      }, new Map());

      const checks = [];
      const addCheck = (severity, kind, title, message, file, line) => {
        checks.push({ severity, kind, title, message, file: file || Editor.currentFilePath || app.currentProject?.mainFile || '', line: line || 1 });
      };

      const mainFile = app.currentProject?.mainFile;
      if (!mainFile) {
        addCheck('warning', 'main', 'No main file configured', 'Set a main .tex file in Project Settings.');
      } else if (!filePaths.has(app.normalizeProjectPath(mainFile))) {
        addCheck('error', 'main', mainFile, 'Configured main file is missing from the project.');
      }

      structure.graphics.forEach((item) => {
        if (!app.projectPathExists(item.title, filePaths)) {
          addCheck('error', 'asset', item.title, 'Image/PDF asset referenced by includegraphics was not found.', item.file, item.line);
        }
      });

      structure.bibliographies.forEach((item) => {
        if (!app.projectPathExists(item.title, filePaths)) {
          addCheck('warning', 'bib', item.title, 'Bibliography file was not found.', item.file, item.line);
        }
      });

      structure.refs.forEach((item) => {
        if (!labelKeys.has(item.title)) {
          addCheck('error', 'ref', item.title, 'Referenced label was not found.', item.file, item.line);
        }
      });

      labelsByKey.forEach((items, key) => {
        if (items.length > 1) {
          items.forEach((item) => addCheck('warning', 'label', key, 'Duplicate label key.', item.file, item.line));
        }
      });

      structure.labels.forEach((item) => {
        if (!refKeys.has(item.title)) {
          addCheck('info', 'label', item.title, 'Label is currently unused.', item.file, item.line);
        }
      });

      if (structure.bibEntries.length > 0) {
        structure.citations.forEach((item) => {
          if (!bibKeys.has(item.title)) {
            addCheck('warning', 'cite', item.title, 'Citation key was not found in .bib files.', item.file, item.line);
          }
        });
      }

      const errorCount = checks.filter((item) => item.severity === 'error').length;
      const warningCount = checks.filter((item) => item.severity === 'warning').length;
      const infoCount = checks.filter((item) => item.severity === 'info').length;
      body.innerHTML = `
        <div class="outline-summary diagnostic-summary">
          <span class="${errorCount ? 'error' : ''}">${errorCount} errors</span>
          <span class="${warningCount ? 'warning' : ''}">${warningCount} warnings</span>
          <span>${infoCount} notes</span>
        </div>
        ${checks.length === 0 ? `
          <div class="panel-empty">
            <strong>Project is ready</strong>
            <span>No missing main file, assets, bibliography files, labels, refs, or citations detected.</span>
          </div>
        ` : `
          <div class="preflight-list">
            ${checks.map((item) => `
              <button class="diagnostic-item ${app.escapeHtml(item.severity)}" type="button" data-file="${app.escapeHtml(item.file)}" data-line="${item.line}">
                <span class="diagnostic-kind">${app.escapeHtml(item.kind)}</span>
                <span class="outline-item-main">
                  <span class="outline-item-title">${app.escapeHtml(item.title)}</span>
                  <span class="outline-item-location">${app.escapeHtml(item.message)} · ${app.escapeHtml(item.file)}:${item.line}</span>
                </span>
              </button>
            `).join('')}
          </div>
        `}
      `;
      bindStructureNavigation(app, body);
    } catch (err) {
      body.innerHTML = `
        <div class="panel-empty error">
          <strong>Could not run preflight</strong>
          <span>${app.escapeHtml(err.message || 'Unknown preflight error')}</span>
        </div>
      `;
    }
  }

  async function parseTodos(app) {
    const todoEl = document.getElementById('todo-content');
    if (!todoEl) return;
    todoEl.innerHTML = '<div class="panel-loading">Scanning comments...</div>';
    try {
      const structure = await collectProjectStructure(app);
      const items = structure.todos;
      if (items.length === 0) {
        todoEl.innerHTML = `
          <div class="panel-empty">
            <strong>No TODOs found</strong>
            <span>Use comments like % TODO: revise introduction or % FIXME: check equation.</span>
          </div>
        `;
        return;
      }
      const counts = items.reduce((acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
      }, {});
      todoEl.innerHTML = `
        <div class="outline-summary">
          ${Object.keys(counts).sort().map((key) => `<span>${app.escapeHtml(key)} ${counts[key]}</span>`).join('')}
        </div>
        <section class="outline-group">
          <div class="outline-group-title">Comment Tasks</div>
          ${items.map((item) => `
            <button class="todo-item ${item.type === 'FIXME' ? 'error' : item.type === 'HACK' ? 'warning' : ''}" type="button" data-file="${app.escapeHtml(item.file)}" data-line="${item.line}">
              <span class="todo-kind">${app.escapeHtml(item.type)}</span>
              <span class="outline-item-main">
                <span class="outline-item-title">${app.escapeHtml(item.text || '(empty)')}</span>
                <span class="outline-item-location">${app.escapeHtml(item.file)}:${item.line}</span>
              </span>
            </button>
          `).join('')}
        </section>
      `;
      bindStructureNavigation(app, todoEl);
    } catch (err) {
      todoEl.innerHTML = `
        <div class="panel-empty error">
          <strong>Could not parse TODOs</strong>
          <span>${app.escapeHtml(err.message || 'Unknown parser error')}</span>
        </div>
      `;
    }
  }

  window.LightTeXFeatures.diagnostics = {
    bindStructureNavigation,
    cleanLatexText,
    collectProjectStructure,
    getActiveSidebarTab,
    isStructureFile,
    parseOutline,
    parseReferences,
    parseTodos,
    queueStructureRefresh,
    readLatexBraceArgument,
    refreshActiveSidebarPanel,
    renderDiagnosticGroup,
    renderOutlineGroup,
    renderOutlineItem,
    showPreflightCheck,
    stripLatexComment,
  };
})();
