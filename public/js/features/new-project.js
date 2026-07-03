(function () {
  window.LightTeXFeatures = window.LightTeXFeatures || {};

  const presets = [
    {
      id: 'blank',
      name: 'Blank TeX',
      description: 'Empty workspace for custom classes or imported sources.',
      template: '',
      compiler: 'pdflatex',
      namePlaceholder: 'My Paper',
      projectDescription: 'Custom LaTeX project',
      icon: Icons.file,
    },
    {
      id: 'article',
      name: 'Research article',
      description: 'Sections, equations, figures, bibliography, and labels.',
      template: 'article',
      compiler: 'pdflatex',
      namePlaceholder: 'Conference Paper',
      projectDescription: 'Academic article draft',
      icon: Icons.templateArticle,
    },
    {
      id: 'thesis',
      name: 'Thesis / book',
      description: 'Chapters, front matter, table of contents, and long-form structure.',
      template: 'book',
      compiler: 'xelatex',
      namePlaceholder: 'Thesis Draft',
      projectDescription: 'Long-form academic manuscript',
      icon: Icons.templateBook,
    },
    {
      id: 'slides',
      name: 'Lecture slides',
      description: 'Beamer deck for talks, seminars, and defenses.',
      template: 'beamer',
      compiler: 'lualatex',
      namePlaceholder: 'Seminar Slides',
      projectDescription: 'Academic presentation deck',
      icon: Icons.templateBeamer,
    },
  ];

  const templateCards = [
    { id: '', name: 'Empty', icon: Icons.file, description: 'Start with a single minimal main.tex file.' },
    { id: 'article', name: 'Article', icon: Icons.templateArticle, description: 'Paper-style document with equations and bibliography.' },
    { id: 'book', name: 'Book', icon: Icons.templateBook, description: 'Long document structure with chapters.' },
    { id: 'beamer', name: 'Beamer', icon: Icons.templateBeamer, description: 'Presentation slides using Beamer.' },
  ];

  function show(app) {
    const overlay = LightTeXCore.modal.createOverlay();
    overlay.innerHTML = `
      <div class="modal new-project-modal">
        <div class="modal-heading-row">
          <div>
            <h2>New Project</h2>
            <p class="modal-subtitle">Choose an academic preset, then adjust compiler and template.</p>
          </div>
        </div>
        <form id="new-project-form">
          <div class="form-grid two-col">
            <div class="form-group">
              <label for="new-project-name">Project name</label>
              <input type="text" id="new-project-name" placeholder="My Paper" autofocus required>
            </div>
            <div class="form-group">
              <label for="new-project-compiler">Compiler</label>
              <select id="new-project-compiler">
                <option value="pdflatex">pdflatex</option>
                <option value="xelatex">xelatex</option>
                <option value="lualatex">lualatex</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label for="new-project-desc">Description</label>
            <input type="text" id="new-project-desc" placeholder="Research topic, class, journal, or team">
          </div>
          <div class="form-group">
            <label>Academic preset</label>
            <div class="preset-gallery">
              ${presets.map((preset) => `
                <button class="preset-card ${preset.id === 'blank' ? 'selected' : ''}" type="button" data-preset="${preset.id}">
                  <span class="icon">${preset.icon}</span>
                  <strong>${app.escapeHtml(preset.name)}</strong>
                  <small>${app.escapeHtml(preset.description)}</small>
                </button>
              `).join('')}
            </div>
          </div>
          <div class="form-group">
            <label>Template</label>
            <div class="template-selector gallery">
              ${templateCards.map((template) => `
                <button class="template-option ${template.id === '' ? 'selected' : ''}" type="button" data-template="${template.id}">
                  <span class="icon">${template.icon}</span>
                  <strong>${app.escapeHtml(template.name)}</strong>
                  <small data-template-meta="${template.id || 'empty'}">${app.escapeHtml(template.description)}</small>
                </button>
              `).join('')}
            </div>
          </div>
          <div class="field-error" id="new-project-error" role="alert"></div>
          <div class="modal-actions">
            <button class="btn btn-secondary" type="button" id="modal-cancel">Cancel</button>
            <button class="btn btn-primary" type="submit" id="modal-create">Create project</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    LightTeXCore.modal.bindOverlayClose(overlay, close, '#modal-cancel');

    let selectedTemplate = '';
    const nameInput = overlay.querySelector('#new-project-name');
    const descInput = overlay.querySelector('#new-project-desc');
    const compilerSelect = overlay.querySelector('#new-project-compiler');

    const selectTemplate = (template) => {
      selectedTemplate = template;
      overlay.querySelectorAll('.template-option').forEach((el) => {
        el.classList.toggle('selected', el.dataset.template === template);
      });
    };

    const applyPreset = (preset) => {
      compilerSelect.value = preset.compiler;
      descInput.value = preset.projectDescription;
      nameInput.placeholder = preset.namePlaceholder;
      if (!nameInput.value.trim()) nameInput.value = preset.namePlaceholder;
      selectTemplate(preset.template);
      overlay.querySelectorAll('.preset-card').forEach((card) => {
        card.classList.toggle('selected', card.dataset.preset === preset.id);
      });
    };

    overlay.querySelectorAll('.preset-card').forEach((el) => {
      el.addEventListener('click', () => {
        const preset = presets.find((item) => item.id === el.dataset.preset) || presets[0];
        applyPreset(preset);
      });
    });

    overlay.querySelectorAll('.template-option').forEach((el) => {
      el.addEventListener('click', () => selectTemplate(el.dataset.template));
    });

    api.get('/templates').then((templates) => {
      for (const template of templates) {
        const meta = overlay.querySelector(`[data-template-meta="${template.name}"]`);
        if (meta) {
          meta.textContent = `${template.fileCount} file${template.fileCount === 1 ? '' : 's'} - ${template.description}`;
        }
      }
    }).catch(() => {});

    overlay.querySelector('#new-project-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      const error = overlay.querySelector('#new-project-error');
      const create = overlay.querySelector('#modal-create');
      error.textContent = '';
      if (!name) {
        error.textContent = 'Project name required.';
        return;
      }

      try {
        create.disabled = true;
        create.innerHTML = `${Icons.clock14} Creating...`;
        const project = await api.post('/projects', {
          name,
          description: descInput.value.trim(),
          compiler: compilerSelect.value,
          template: selectedTemplate || undefined,
        });
        close();
        window.location.hash = `#/project/${project.id}`;
      } catch (err) {
        error.textContent = 'Failed to create project: ' + err.message;
      } finally {
        create.disabled = false;
        create.innerHTML = 'Create project';
      }
    });

    applyPreset(presets[0]);
    nameInput.focus();
    nameInput.select();
  }

  window.LightTeXFeatures.newProject = {
    show,
  };
})();
