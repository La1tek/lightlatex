(function () {
  window.LightTeXFeatures = window.LightTeXFeatures || {};

  function show(app) {
    const project = app.currentProject || {};
    const canManage = app.canManageProject();
    const disabled = canManage ? '' : 'disabled';
    const overlay = LightTeXCore.modal.createOverlay();
    overlay.innerHTML = `
      <div class="modal settings-modal">
        <h2>Project Settings</h2>
        <form id="project-settings-form">
          <div class="form-grid two-col">
            <div class="form-group">
              <label for="settings-name">Name</label>
              <input id="settings-name" type="text" value="${app.escapeHtml(project.name || '')}" required ${disabled}>
            </div>
            <div class="form-group">
              <label for="settings-compiler">Compiler</label>
              <select id="settings-compiler" ${disabled}>
                ${['pdflatex', 'xelatex', 'lualatex'].map(c => `<option value="${c}" ${project.compiler === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label for="settings-description">Description</label>
            <textarea id="settings-description" rows="3" ${disabled}>${app.escapeHtml(project.description || '')}</textarea>
          </div>
          <div class="form-group">
            <label for="settings-main-file">Main file</label>
            <select id="settings-main-file" ${disabled}>
              ${app.projectFiles.filter(f => f.path.endsWith('.tex')).map(f => `<option value="${app.escapeHtml(f.path)}" ${project.mainFile === f.path ? 'selected' : ''}>${app.escapeHtml(f.path)}</option>`).join('')}
            </select>
          </div>
          <div class="settings-section">
            <h3>Access</h3>
            <div class="settings-access-row">
              <span class="access-badge ${app.projectRole()}">${app.roleLabel()}</span>
              <span>${project.ownerEmail ? `Owner: ${app.escapeHtml(project.ownerName || project.ownerEmail)}` : 'You own this project'}</span>
            </div>
          </div>
          ${canManage ? `
            <div class="settings-section" id="sharing-section">
              <h3>Sharing</h3>
              <div class="share-add-row">
                <input id="share-email" type="email" placeholder="collaborator@example.com" autocomplete="off">
                <select id="share-role">
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
                <button class="btn btn-secondary btn-small" type="button" id="share-add">${Icons.plus16} Add</button>
              </div>
              <div class="field-error" id="share-error" role="alert"></div>
              <div class="share-list" id="share-list">
                <div class="panel-loading">Loading collaborators...</div>
              </div>
            </div>
          ` : ''}
          <div class="settings-section">
            <h3>CLI access</h3>
            <div class="copy-row">
              <code>lighttex pull ${app.currentProjectId}</code>
              <button class="btn btn-secondary btn-small" type="button" id="copy-cli-command">Copy</button>
            </div>
          </div>
          <div class="field-error" id="settings-error" role="alert"></div>
          <div class="modal-actions">
            <button class="btn btn-secondary" type="button" id="settings-cancel">Cancel</button>
            ${canManage ? '<button class="btn btn-primary" type="submit" id="settings-save">Save settings</button>' : ''}
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    LightTeXCore.modal.bindOverlayClose(overlay, close, '#settings-cancel');
    overlay.querySelector('#copy-cli-command').addEventListener('click', async () => {
      try {
        await navigator.clipboard?.writeText(`lighttex pull ${app.currentProjectId}`);
        app.notify('CLI command copied', 'success');
      } catch {
        app.notify('Could not copy command automatically', 'error');
      }
    });
    if (canManage) {
      const renderSharing = async () => {
        const list = overlay.querySelector('#share-list');
        list.innerHTML = '<div class="panel-loading">Loading collaborators...</div>';
        try {
          const payload = await api.get(`/projects/${app.currentProjectId}/collaborators`);
          const owner = payload.owner;
          const collaborators = payload.collaborators || [];
          list.innerHTML = `
            ${owner ? `
              <div class="share-row owner">
                <span>
                  <strong>${app.escapeHtml(owner.email)}</strong>
                  <small>${app.escapeHtml(owner.name || 'Project owner')}</small>
                </span>
                <span class="access-badge owner">Owner</span>
              </div>
            ` : ''}
            ${collaborators.length === 0 ? `
              <div class="panel-empty compact">
                <strong>No collaborators</strong>
                <span>Add registered users by email.</span>
              </div>
            ` : collaborators.map((item) => `
              <div class="share-row" data-collaborator="${app.escapeHtml(item.id)}">
                <span>
                  <strong>${app.escapeHtml(item.email)}</strong>
                  <small>${app.escapeHtml(item.name || 'Registered user')}</small>
                </span>
                <select data-share-role="${app.escapeHtml(item.id)}">
                  <option value="viewer" ${item.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                  <option value="editor" ${item.role === 'editor' ? 'selected' : ''}>Editor</option>
                </select>
                <button class="btn btn-danger btn-small" type="button" data-share-remove="${app.escapeHtml(item.id)}">${Icons.trash14}</button>
              </div>
            `).join('')}
          `;

          list.querySelectorAll('[data-share-role]').forEach((select) => {
            select.addEventListener('change', async () => {
              try {
                await api.put(`/projects/${app.currentProjectId}/collaborators/${select.dataset.shareRole}`, { role: select.value });
                app.notify('Collaborator role updated', 'success');
              } catch (err) {
                app.notify('Role update failed: ' + err.message, 'error');
                renderSharing();
              }
            });
          });
          list.querySelectorAll('[data-share-remove]').forEach((button) => {
            button.addEventListener('click', async () => {
              if (!confirm('Remove this collaborator?')) return;
              try {
                await api.del(`/projects/${app.currentProjectId}/collaborators/${button.dataset.shareRemove}`);
                app.notify('Collaborator removed', 'success');
                renderSharing();
              } catch (err) {
                app.notify('Remove failed: ' + err.message, 'error');
              }
            });
          });
        } catch (err) {
          list.innerHTML = `
            <div class="panel-empty error">
              <strong>Could not load collaborators</strong>
              <span>${app.escapeHtml(err.message || 'Unknown sharing error')}</span>
            </div>
          `;
        }
      };

      overlay.querySelector('#share-add').addEventListener('click', async () => {
        const email = overlay.querySelector('#share-email').value.trim();
        const role = overlay.querySelector('#share-role').value;
        const error = overlay.querySelector('#share-error');
        error.textContent = '';
        if (!email) {
          error.textContent = 'Email required.';
          return;
        }
        try {
          await api.post(`/projects/${app.currentProjectId}/collaborators`, { email, role });
          overlay.querySelector('#share-email').value = '';
          app.notify('Collaborator added', 'success');
          renderSharing();
        } catch (err) {
          error.textContent = err.message;
        }
      });
      renderSharing();
    }
    overlay.querySelector('#project-settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!app.ensureCanManage('save project settings')) return;
      const error = overlay.querySelector('#settings-error');
      const save = overlay.querySelector('#settings-save');
      error.textContent = '';
      save.disabled = true;
      save.innerHTML = `${Icons.clock14} Saving...`;
      try {
        const updated = await api.put(`/projects/${app.currentProjectId}`, {
          name: overlay.querySelector('#settings-name').value.trim(),
          description: overlay.querySelector('#settings-description').value.trim(),
          compiler: overlay.querySelector('#settings-compiler').value,
          mainFile: overlay.querySelector('#settings-main-file').value,
        });
        app.currentProject = updated;
        document.getElementById('editor-project-name').textContent = updated.name;
        app.notify('Project settings saved', 'success');
        close();
      } catch (err) {
        error.textContent = err.message;
      } finally {
        save.disabled = false;
        save.innerHTML = 'Save settings';
      }
    });
    overlay.querySelector(canManage ? '#settings-name' : '#copy-cli-command').focus();
  }

  window.LightTeXFeatures.projectSettings = { show };
})();
