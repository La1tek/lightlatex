(function () {
  window.LightTeXFeatures = window.LightTeXFeatures || {};

  async function show(app, container) {
    const currentTheme = document.documentElement.dataset.theme;

    container.innerHTML = `
      <div class="dashboard" id="dashboard-drop-zone">
        <div class="dashboard-header">
          <h1 class="brand">${Icons.logo} LightTeX</h1>
          <div class="dashboard-header-actions">
            <button class="btn-icon" id="toggle-theme-btn" title="Toggle theme" aria-label="Toggle theme">${currentTheme === 'dark' ? Icons.moon16 : Icons.sun16}</button>
            <button class="btn btn-secondary" id="new-project-btn">${Icons.plus16} New project</button>
            <button class="btn-icon" id="logout-btn" title="Logout" aria-label="Logout">${Icons.logout16}</button>
          </div>
        </div>
        <main class="dashboard-content">
          <section class="dashboard-hero">
            <div class="dashboard-title-row">
              <div>
                <h2>Projects</h2>
                <p>Recent LaTeX workspaces, templates, compilers, and zip imports.</p>
              </div>
              <div class="import-hint">${Icons.upload16} Drop a .zip anywhere to import a project</div>
            </div>
            <div class="dashboard-tools">
              <label class="dashboard-search" aria-label="Search projects">
                ${Icons.search16}
                <input id="project-search" type="search" placeholder="Search projects, descriptions, compilers...">
              </label>
              <div class="segmented-control" aria-label="Project view">
                <button class="active" id="grid-view-btn" type="button">Grid</button>
                <button id="list-view-btn" type="button">List</button>
              </div>
            </div>
          </section>
          <div id="projects-list">
            <div class="empty-state">
              <div class="icon">${Icons.clock}</div>
              <p>Loading projects...</p>
            </div>
          </div>
        </main>
      </div>
    `;

    document.getElementById('toggle-theme-btn').addEventListener('click', () => app.toggleTheme());
    document.getElementById('logout-btn').addEventListener('click', () => {
      api.clearTokens();
      window.location.hash = '#/login';
    });
    document.getElementById('new-project-btn').addEventListener('click', () => app.showNewProjectModal());

    const dropZone = document.getElementById('dashboard-drop-zone');
    dropZone.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropZone.style.outline = '3px dashed var(--accent)';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.outline = '';
    });
    dropZone.addEventListener('drop', async (event) => {
      event.preventDefault();
      dropZone.style.outline = '';
      const file = event.dataTransfer.files[0];
      if (!file || !file.name.endsWith('.zip')) {
        app.notify('Only .zip files supported for drag-drop import', 'error');
        return;
      }
      try {
        const name = file.name.replace('.zip', '');
        const project = await api.post('/projects', { name });
        await api.upload('/projects/' + project.id + '/upload', file);
        app.notify('Imported ' + file.name + ' as project: ' + name, 'success');
        show(app, container);
      } catch (err) {
        app.notify('Import failed: ' + err.message, 'error');
      }
    });

    try {
      const projects = await api.get('/projects');
      const list = document.getElementById('projects-list');
      if (!list) return;
      const searchInput = document.getElementById('project-search');
      const gridBtn = document.getElementById('grid-view-btn');
      const listBtn = document.getElementById('list-view-btn');
      let viewMode = 'grid';

      if (projects.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="icon">${Icons.folderEmpty}</div>
            <p>No projects yet. Create a project or drop a .zip archive to import one.</p>
          </div>
        `;
        return;
      }

      const renderProjects = () => {
        const query = (searchInput.value || '').trim().toLowerCase();
        const filtered = projects.filter((project) => {
          const haystack = `${project.name || ''} ${project.description || ''} ${project.compiler || ''}`.toLowerCase();
          return haystack.includes(query);
        });

        if (filtered.length === 0) {
          list.innerHTML = `
            <div class="empty-state">
              <div class="icon">${Icons.search}</div>
              <p>No projects match this search.</p>
            </div>
          `;
          return;
        }

        list.innerHTML = `<div class="project-grid ${viewMode === 'list' ? 'list-mode' : ''}" id="project-grid"></div>`;
        const grid = document.getElementById('project-grid');

        for (const project of filtered) {
          const role = project.accessRole || 'owner';
          const deleteButton = role === 'owner'
            ? `<button class="btn btn-danger btn-small" data-delete="${project.id}" title="Delete project" aria-label="Delete ${app.escapeHtml(project.name)}">${Icons.trash}</button>`
            : '';
          const ownerMeta = project.ownerEmail
            ? `<span>${Icons.user} ${app.escapeHtml(project.ownerName || project.ownerEmail)}</span>`
            : '';
          const card = document.createElement('article');
          card.className = 'project-card';
          card.tabIndex = 0;
          card.innerHTML = `
            <div class="project-card-header">
              <span class="project-card-icon">${Icons.fileTex}</span>
              <h3>${app.escapeHtml(project.name)}</h3>
              <span class="badge role-badge ${role}">${app.roleLabel(role)}</span>
            </div>
            <div class="desc">${app.escapeHtml(project.description || 'No description')}</div>
            <div class="meta">
              <span>${Icons.wrench} ${app.escapeHtml(project.compiler || 'pdflatex')}</span>
              ${ownerMeta}
              <span>${new Date(project.updatedAt).toLocaleDateString()}</span>
            </div>
            <div class="actions">
              <button class="btn btn-secondary btn-small" data-open="${project.id}">Open</button>
              ${deleteButton}
            </div>
          `;
          card.querySelector('[data-open]').addEventListener('click', (event) => {
            event.stopPropagation();
            window.location.hash = `#/project/${project.id}`;
          });
          card.querySelector('[data-delete]')?.addEventListener('click', async (event) => {
            event.stopPropagation();
            if (confirm('Delete this project and all its files?')) {
              await api.del(`/projects/${project.id}`);
              show(app, container);
            }
          });
          card.addEventListener('click', () => {
            window.location.hash = `#/project/${project.id}`;
          });
          card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') window.location.hash = `#/project/${project.id}`;
          });
          grid.appendChild(card);
        }
      };

      searchInput.addEventListener('input', renderProjects);
      gridBtn.addEventListener('click', () => {
        viewMode = 'grid';
        gridBtn.classList.add('active');
        listBtn.classList.remove('active');
        renderProjects();
      });
      listBtn.addEventListener('click', () => {
        viewMode = 'list';
        listBtn.classList.add('active');
        gridBtn.classList.remove('active');
        renderProjects();
      });
      renderProjects();
    } catch (err) {
      const list = document.getElementById('projects-list');
      if (!list) return;
      list.innerHTML = `
        <div class="empty-state">
          <div class="icon">${Icons.xCircle}</div>
          <p>Failed to load projects: ${app.escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }

  window.LightTeXFeatures.dashboard = {
    show,
  };
})();
