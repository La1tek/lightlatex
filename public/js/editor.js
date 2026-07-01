let editor = null;
let monacoInstance = null;
let currentProjectId = null;
let currentFilePath = null;
let autosaveTimer = null;
let compileMarkers = [];
let currentImageFiles = [];

const Editor = {
  init(container, options = {}) {
    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
    require(['vs/editor/editor.main'], () => {
      monacoInstance = monaco;
      this.registerLatexLanguage();

      editor = monaco.editor.create(container, {
        value: options.value || '',
        language: 'latex',
        theme: document.documentElement.dataset.theme === 'dark' ? 'vs-dark' : 'vs',
        minimap: { enabled: true },
        fontSize: 14,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        automaticLayout: true,
        tabSize: 2,
        insertSpaces: true,
        quickSuggestions: true,
        suggestOnTriggerCharacters: true,
        folding: true,
        foldingStrategy: 'auto',
        renderWhitespace: 'none',
        bracketPairColorization: { enabled: true },
      });

      // Autosave
      editor.onDidChangeModelContent(() => {
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

      if (options.imageFiles) currentImageFiles = options.imageFiles;
      if (options.onReady) options.onReady();
    });
  },

  registerLatexLanguage() {
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

        return { suggestions };
      }
    });
  },

  setImageFiles(files) {
    currentImageFiles = files || [];
  },

  setValue(content) {
    if (editor) {
      const model = editor.getModel();
      if (model) {
        model.setValue(content);
      }
    }
  },

  getValue() {
    return editor ? editor.getModel().getValue() : '';
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
      editor.updateOptions({
        theme: theme === 'dark' ? 'vs-dark' : 'vs',
      });
    }
  },

  async autosave() {
    if (!currentProjectId || !currentFilePath || !editor) return;
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

  dispose() {
    if (editor) {
      editor.dispose();
      editor = null;
    }
  }
};
