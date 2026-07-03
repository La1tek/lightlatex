let editor = null;
let monacoInstance = null;
let currentProjectId = null;
let currentFilePath = null;
let autosaveTimer = null;
let compileMarkers = [];
let currentImageFiles = [];
let currentCitationEntries = [];
let suppressNextChange = false;
let readOnlyMode = false;

const Editor = {
  get currentProjectId() {
    return currentProjectId;
  },

  get currentFilePath() {
    return currentFilePath;
  },

  init(container, options = {}) {
    readOnlyMode = Boolean(options.readOnly);
    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
    require(['vs/editor/editor.main'], () => {
      monacoInstance = monaco;
      this.registerLatexLanguage();
      this.registerThemes();

      editor = monaco.editor.create(container, {
        value: options.value || '',
        language: 'latex',
        theme: document.documentElement.dataset.theme === 'dark' ? 'lighttex-dark' : 'lighttex-light',
        minimap: { enabled: true },
        fontSize: this.getFontSize(),
        fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        lineHeight: 21,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        wordWrap: this.getWordWrap(),
        automaticLayout: true,
        tabSize: 2,
        insertSpaces: true,
        quickSuggestions: true,
        suggestOnTriggerCharacters: true,
        folding: true,
        foldingStrategy: 'auto',
        renderWhitespace: 'none',
        bracketPairColorization: { enabled: true },
        readOnly: readOnlyMode,
        domReadOnly: readOnlyMode,
      });

      // Autosave
      editor.onDidChangeModelContent(() => {
        if (suppressNextChange) {
          suppressNextChange = false;
          return;
        }
        if (readOnlyMode) return;
        if (options.onDirty) options.onDirty();
        clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(() => this.autosave(), 2000);
      });

      // Sync scroll: click in editor → scroll PDF to estimated page
      editor.onDidChangeCursorPosition((e) => {
        if (pdfDoc && pdfDoc.numPages > 0 && e.reason === 3) { // 3 = explicit (click)
          const totalLines = editor.getModel()?.getLineCount() || 1;
          const lineNumber = e.position.lineNumber;
          const estimatedPage = Math.max(1, Math.min(
            pdfDoc.numPages,
            Math.ceil((lineNumber / totalLines) * pdfDoc.numPages)
          ));
          if (typeof Preview !== 'undefined' && Preview.goToPage && currentPage !== estimatedPage) {
            Preview.goToPage(estimatedPage);
          }
        }
      });

      // Keyboard shortcuts
      editor.addAction({
        id: 'compile',
        label: 'Compile LaTeX',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => {
          if (options.onCompile) options.onCompile();
        }
      });

      editor.addAction({
        id: 'force-compile',
        label: 'Force Compile',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS],
        run: () => {
          clearTimeout(autosaveTimer);
          this.autosave().then(() => {
            if (options.onCompile) options.onCompile();
          });
        }
      });

      editor.addAction({
        id: 'latex-bold',
        label: 'Bold',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB],
        run: () => this.wrapSelection('\\textbf{', '}', 'bold text')
      });

      editor.addAction({
        id: 'latex-italic',
        label: 'Italic',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI],
        run: () => this.wrapSelection('\\textit{', '}', 'italic text')
      });

      editor.addAction({
        id: 'latex-inline-math',
        label: 'Inline Math',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyM],
        run: () => this.wrapSelection('$', '$', 'x')
      });

      editor.addAction({
        id: 'latex-emphasis',
        label: 'Emphasis',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyI],
        run: () => this.wrapSelection('\\emph{', '}', 'emphasis')
      });

      if (options.imageFiles) currentImageFiles = options.imageFiles;
      if (options.onReady) options.onReady();
    });
  },

  registerThemes() {
    monaco.editor.defineTheme('lighttex-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '0f7667', fontStyle: 'bold' },
        { token: 'delimiter.curly', foreground: '334155' },
        { token: 'string', foreground: 'b45309' },
        { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
        { token: 'number', foreground: '2563eb' },
      ],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#1e293b',
        'editorLineNumber.foreground': '#94a3b8',
        'editorLineNumber.activeForeground': '#0f7667',
        'editorCursor.foreground': '#0f7667',
        'editor.lineHighlightBackground': '#f8fafc',
        'editor.selectionBackground': '#99f6e44d',
        'editorGutter.background': '#ffffff',
      },
    });

    monaco.editor.defineTheme('lighttex-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '5eead4', fontStyle: 'bold' },
        { token: 'delimiter.curly', foreground: 'cbd5e1' },
        { token: 'string', foreground: 'fbbf24' },
        { token: 'comment', foreground: '94a3b8', fontStyle: 'italic' },
        { token: 'number', foreground: '93c5fd' },
      ],
      colors: {
        'editor.background': '#0f172a',
        'editor.foreground': '#d7dee9',
        'editorLineNumber.foreground': '#64748b',
        'editorLineNumber.activeForeground': '#5eead4',
        'editorCursor.foreground': '#5eead4',
        'editor.lineHighlightBackground': '#172033',
        'editor.selectionBackground': '#14b88f40',
        'editorGutter.background': '#0f172a',
      },
    });
  },

  registerLatexLanguage() {
    if (!monaco.languages.getLanguages().some((language) => language.id === 'latex')) {
      monaco.languages.register({ id: 'latex' });
    }
    monaco.languages.setMonarchTokensProvider('latex', {
      tokenizer: {
        root: [
          [/%.*$/, 'comment'],
          [/\\[a-zA-Z@]+/, 'keyword'],
          [/\\./, 'keyword'],
          [/\$[^$]*\$/, 'number'],
          [/\\\[[\s\S]*?\\\]/, 'number'],
          [/[{}()[\]]/, '@brackets'],
          [/"[^"]*"/, 'string'],
          [/'[^']*'/, 'string'],
        ],
      },
    });

    monaco.languages.registerCompletionItemProvider('latex', {
      triggerCharacters: ['\\', '{'],
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions = [
          // Quick snippets
          { label: 'fig', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '\\begin{figure}[ht]\n\t\\centering\n\t\\includegraphics[width=0.8\\textwidth]{$1}\n\t\\caption{$2}\n\t\\label{fig:$3}\n\\end{figure}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Figure environment', documentation: 'Create a figure with graphic, caption and label' },
          { label: 'tab', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '\\begin{table}[ht]\n\t\\centering\n\t\\begin{tabular}{$1}\n\t\n\t\\end{tabular}\n\t\\caption{$2}\n\t\\label{tab:$3}\n\\end{table}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Table environment', documentation: 'Create a table with tabular, caption and label' },
          { label: 'eq', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '\\begin{equation}\n\t$0\n\\end{equation}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Equation environment', documentation: 'Create an equation environment' },
          { label: 'item', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '\\begin{itemize}\n\t\\item $0\n\\end{itemize}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Itemize list', documentation: 'Create a bullet list' },
          { label: 'enum', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '\\begin{enumerate}\n\t\\item $0\n\\end{enumerate}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Enumerated list', documentation: 'Create a numbered list' },
          { label: 'sec', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '\\section{$1}\n\\label{sec:$2}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Section with label', documentation: 'Create a section with a label' },
          { label: 'subsec', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '\\subsection{$1}\n\\label{subsec:$2}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Subsection with label', documentation: 'Create a subsection with a label' },
          // Standard completions
          { label: '\\begin{document}', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '\\begin{document}\n\t$0\n\\end{document}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
          { label: '\\section{...}', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '\\section{$1}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
          { label: '\\subsection{...}', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '\\subsection{$1}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
          { label: '\\begin{figure}', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '\\begin{figure}[h]\n\t\\centering\n\t\\includegraphics[width=0.8\\textwidth]{$1}\n\t\\caption{$2}\n\\end{figure}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
          { label: '\\begin{equation}', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '\\begin{equation}\n\t$0\n\\end{equation}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
          { label: '\\begin{itemize}', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '\\begin{itemize}\n\t\\item $0\n\\end{itemize}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
          { label: '\\begin{enumerate}', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '\\begin{enumerate}\n\t\\item $0\n\\end{enumerate}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
          { label: '\\textbf{...}', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '\\textbf{$1}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
          { label: '\\textit{...}', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '\\textit{$1}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
          { label: '\\cite{...}', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '\\cite{$1}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
        ];

        // Add \includegraphics completions with image files
        if (currentImageFiles.length > 0) {
          for (const img of currentImageFiles) {
            const name = img.name || img.path || img;
            const path = img.path || name;
            suggestions.push({
              label: `\\includegraphics{${name}}`,
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: `\\includegraphics{images/${name}}`,
              detail: `Image: images/${name}`,
              documentation: `Insert \\includegraphics{images/${name}}`,
            });
          }
        }

        if (currentCitationEntries.length > 0) {
          for (const entry of currentCitationEntries) {
            suggestions.push({
              label: entry.key,
              kind: monaco.languages.CompletionItemKind.Reference,
              insertText: entry.key,
              detail: `${entry.author || 'Citation'}${entry.year ? ' · ' + entry.year : ''}`,
              documentation: entry.title || `Insert citation key ${entry.key}`,
            });
          }
        }

        return { suggestions };
      }
    });
  },

  setImageFiles(files) {
    currentImageFiles = files || [];
  },

  setCitationEntries(entries) {
    currentCitationEntries = entries || [];
  },

  setValue(content, options = {}) {
    if (editor) {
      const model = editor.getModel();
      if (model) {
        suppressNextChange = Boolean(options.silent);
        model.setValue(content);
      }
    }
  },

  getValue() {
    return editor ? editor.getModel().getValue() : '';
  },

  insertText(text) {
    if (!editor || readOnlyMode) return;
    const model = editor.getModel();
    if (!model) return;
    const selection = editor.getSelection();
    const range = selection || model.getFullModelRange();
    editor.executeEdits('lighttex-symbol-palette', [{
      range,
      text,
      forceMoveMarkers: true,
    }]);
    editor.focus();
  },

  setCompileErrors(errors, filePath) {
    if (!editor || !monacoInstance || currentFilePath !== filePath) return;

    const model = editor.getModel();
    if (!model) return;

    monacoInstance.editor.setModelMarkers(model, 'latex-compile', []);

    const newMarkers = errors.map(e => ({
      severity: e.severity === 'error' ? monacoInstance.MarkerSeverity.Error : monacoInstance.MarkerSeverity.Warning,
      message: e.message,
      startLineNumber: e.line || 1,
      startColumn: e.column || 1,
      endLineNumber: e.line || 1,
      endColumn: (e.column || 1) + 10,
    }));

    monacoInstance.editor.setModelMarkers(model, 'latex-compile', newMarkers);
  },

  setTheme(theme) {
    if (editor) {
      monacoInstance.editor.setTheme(theme === 'dark' ? 'lighttex-dark' : 'lighttex-light');
    }
  },

  async autosave() {
    if (readOnlyMode || !currentProjectId || !currentFilePath || !editor) return;
    try {
      await api.put(`/projects/${currentProjectId}/files/${currentFilePath}`, {
        content: this.getValue(),
      });
    } catch (err) {
      console.error('Autosave failed:', err);
    }
  },

  setContext(projectId, filePath) {
    currentProjectId = projectId;
    currentFilePath = filePath;
  },

  setReadOnly(enabled) {
    readOnlyMode = Boolean(enabled);
    if (editor) {
      editor.updateOptions({ readOnly: readOnlyMode, domReadOnly: readOnlyMode });
    }
  },

  getFontSize() {
    const saved = parseInt(localStorage.getItem('lighttex-editor-font-size') || '14', 10);
    return Number.isFinite(saved) ? Math.max(11, Math.min(22, saved)) : 14;
  },

  setFontSize(size) {
    const nextSize = Math.max(11, Math.min(22, parseInt(size, 10) || 14));
    localStorage.setItem('lighttex-editor-font-size', String(nextSize));
    if (editor) editor.updateOptions({ fontSize: nextSize });
  },

  getWordWrap() {
    return localStorage.getItem('lighttex-editor-word-wrap') || 'on';
  },

  setWordWrap(mode) {
    const nextMode = ['on', 'off', 'wordWrapColumn', 'bounded'].includes(mode) ? mode : 'on';
    localStorage.setItem('lighttex-editor-word-wrap', nextMode);
    if (editor) editor.updateOptions({ wordWrap: nextMode });
  },

  layout() {
    if (editor) {
      editor.layout();
    }
  },

  wrapSelection(before, after = '', placeholder = '') {
    if (!editor || readOnlyMode) return;
    const model = editor.getModel();
    const selection = editor.getSelection();
    if (!model || !selection) return;

    const selectedText = model.getValueInRange(selection);
    const insertText = `${before}${selectedText || placeholder}${after}`;
    editor.executeEdits('lighttex-wrap-selection', [{
      range: selection,
      text: insertText,
      forceMoveMarkers: true,
    }]);

    if (!selectedText && placeholder) {
      const position = editor.getPosition();
      const column = Math.max(1, position.column - after.length - placeholder.length);
      editor.setSelection({
        startLineNumber: position.lineNumber,
        startColumn: column,
        endLineNumber: position.lineNumber,
        endColumn: column + placeholder.length,
      });
    }
    editor.focus();
  },

  revealLine(line) {
    if (editor) {
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
    }
  },

  toggleSpellcheck(enable) {
    if (!editor || !monacoInstance) return;
    const model = editor.getModel();
    if (!model) return;
    monacoInstance.editor.setModelMarkers(model, 'spellcheck', []);
    if (!enable) return;

    // Common English words + LaTeX commands dictionary
    const knownWords = new Set([
      // Common LaTeX commands
      'documentclass','usepackage','begin','end','section','subsection','subsubsection',
      'chapter','paragraph','textbf','textit','texttt','emph','underline','cite','ref',
      'label','includegraphics','caption','centering','item','input','include','bibliography',
      'bibliographystyle','title','author','date','maketitle','tableofcontents','pagebreak',
      'newpage','footnote','marginnote','marginpar','abstract','appendix','toc',
      'equation','align','figure','table','tabular','minipage','float','hline',
      'toprule','midrule','bottomrule','multicolumn','cline','ldots','dots',
      'frac','sqrt','int','sum','prod','lim','inf','sup','alpha','beta','gamma',
      'delta','epsilon','theta','lambda','mu','sigma','omega','pi','phi','psi',
      'nu','rho','tau','zeta','eta','chi','xi','kappa','iota','upsilon',
      'left','right','bigl','bigr','leftarrow','rightarrow','leftrightarrow',
      'Rightarrow','Leftrightarrow','leq','geq','neq','approx','equiv',
      'infty','partial','nabla','prime','vec','hat','bar','dot','tilde',
      'widehat','widetilde','overline','underline','mathbb','mathcal','mathrm',
      'text','mathrm','mathbf','mathit','mathsf','mathtt','mathfrak',
      'quad','qquad','space','hspace','vspace','newline','linebreak',
      'noindent','par','indent','setlength','pagestyle','thispagestyle',
      'addbibresource','printbibliography','autocite','parencite','textcite',
      'def','newcommand','renewcommand','newenvironment','ifthenelse',
      'foreach','forloop','while','do','fi','od','then','else','or',
      'and','not','true','false','the','a','an','is','are','was','were',
      'be','been','being','have','has','had','do','does','did','will',
      'would','could','should','may','might','shall','can','need','dare',
      'ought','used','it','its','he','she','they','them','their','his','her',
      'we','you','your','my','our','this','that','these','those','which',
      'what','when','where','how','who','whom','whose','all','each','every',
      'both','few','more','most','other','some','such','no','not','only',
      'same','so','than','too','very','just','because','but','however',
      'therefore','thus','hence','moreover','furthermore','nevertheless',
      'meanwhile','addition','example','instance','case','result','method',
      'model','approach','problem','solution','analysis','data','study',
      'experiment','figure','table','section','paper','work','show',
      'shows','shown','given','using','used','based','according','proposed',
      'well','also','new','first','two','one','three','second','third',
      'time','number','part','point','fact','general','different','between',
      'from','into','through','during','before','after','above','below',
      'up','down','out','over','under','again','further','once','here',
      'information','system','systems','algorithm','algorithms','function',
      'functions','theory','results','performance','evaluation','application',
      'applications','language','languages','process','processes','value',
      'values','set','sets','order','sequence','distribution','probability',
      'estimate','error','errors','test','tests','training','learning',
      'network','networks','input','output','layer','layers','feature',
      'features','vector','matrix','parameters','parameter','optimization',
      'gradient','loss','accuracy','precision','recall','baseline',
      'comparison','compared','significant','significantly','respectively',
      'specifically','particular','previous','prior','following','consider',
      'defined','definition','denote','denoted','assume','assumption',
      'let','denotes','denote','where','obtain','obtained','observe',
      'observed','compute','computed','provide','provides','provided',
      'corresponding','related','regarding','related','proposed','recent',
      'state','art','framework','based','design','implemented','implementation',
      'which','with','for','in','on','at','by','to','of','as','if','then',
      'else','and','or','the','a','an','this','that','is','are','was',
      'were','be','been','have','has','had','it','its','we','our','can',
      'may','will','shall','not','no','nor','but','yet','however',
      'although','though','even','still','while','because','since',
      'therefore','thus','hence','so','such','than','more','most',
      'very','too','also','only','just','well','then','now','here',
      'when','where','how','what','which','who','whom','whose',
    ].map(w => w.toLowerCase()));

    const content = model.getValue();
    const lines = content.split('\n');
    const decorations = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip lines starting with \ (LaTeX commands)
      const trimmed = line.trim();
      if (trimmed.startsWith('\\') || trimmed.startsWith('%')) continue;

      // Extract words (alpha only, min 3 chars)
      const words = line.match(/[a-zA-Z]{3,}/g) || [];
      for (const word of words) {
        if (!knownWords.has(word.toLowerCase())) {
          const idx = line.indexOf(word);
          decorations.push({
            range: new monacoInstance.Range(i + 1, idx + 1, i + 1, idx + word.length + 1),
            options: {
              inlineClassName: 'spellcheck-error',
            }
          });
        }
      }
    }

    // Inject CSS if not exists
    if (!document.getElementById('spellcheck-style')) {
      const style = document.createElement('style');
      style.id = 'spellcheck-style';
      style.textContent = '.spellcheck-error { text-decoration: wavy underline red; }';
      document.head.appendChild(style);
    }

    editor.createDecorationsCollection(decorations);
  },

  dispose() {
    if (editor) {
      editor.dispose();
      editor = null;
    }
  }
};
