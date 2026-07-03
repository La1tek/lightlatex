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
              <div class="invite-panel">
                <div class="invite-create-row">
                  <select id="invite-role">
                    <option value="viewer">Viewer link</option>
                    <option value="editor">Editor link</option>
                  </select>
                  <input id="invite-expires" type="number" min="1" max="365" value="14" aria-label="Invite expiry in days">
                  <input id="invite-max-uses" type="number" min="1" max="500" value="25" aria-label="Invite max uses">
                  <button class="btn btn-secondary btn-small" type="button" id="invite-create">${Icons.link16} Create link</button>
                </div>
                <div class="field-error" id="invite-error" role="alert"></div>
                <div class="invite-reveal" id="invite-reveal"></div>
                <div class="invite-list" id="invite-list">
                  <div class="panel-loading">Loading invites...</div>
                </div>
              </div>
            </div>
          ` : ''}
          <div class="settings-section">
            <h3>CLI access</h3>
            <div class="copy-row">
              <code>lighttex pull ${app.currentProjectId}</code>
              <button class="btn btn-secondary btn-small" type="button" id="copy-cli-command">Copy</button>
            </div>
            <div class="cli-command-list" aria-label="CLI sync commands">
              ${['status', 'pull', 'sync', 'watch'].map((command) => `
                <div class="cli-command-row">
                  <span>${command}</span>
                  <code>lighttex ${command} ${app.currentProjectId}</code>
                </div>
              `).join('')}
            </div>
            ${canManage ? `
              <div class="cli-token-box" id="cli-token-box">
                <div class="panel-loading">Loading CLI token...</div>
              </div>
            ` : ''}
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
        const copied = await LightTeXCore.clipboard.copyText(`lighttex pull ${app.currentProjectId}`);
        if (!copied) throw new Error('Clipboard unavailable');
        app.notify('CLI command copied', 'success');
      } catch {
        app.notify('Could not copy command automatically', 'error');
      }
    });
    if (canManage) {
      const renderCliToken = async (revealedToken) => {
        const box = overlay.querySelector('#cli-token-box');
        if (!box) return;
        try {
          const tokenMeta = await api.get(`/projects/${app.currentProjectId}/cli-token`);
          box.innerHTML = `
            <div class="settings-access-row">
              <span>${tokenMeta ? `Token ${app.escapeHtml(tokenMeta.tokenPrefix)}...` : 'No CLI token generated'}</span>
              <span>${tokenMeta?.lastUsedAt ? `Last used ${new Date(tokenMeta.lastUsedAt).toLocaleString()}` : 'Not used yet'}</span>
            </div>
            ${revealedToken ? `
              <div class="copy-row">
                <code>${app.escapeHtml(revealedToken)}</code>
                <button class="btn btn-secondary btn-small" type="button" id="copy-cli-token">Copy token</button>
              </div>
            ` : ''}
            <div class="settings-token-actions">
              <button class="btn btn-secondary btn-small" type="button" id="regenerate-cli-token">${tokenMeta ? 'Regenerate token' : 'Generate token'}</button>
              <button class="btn btn-danger btn-small" type="button" id="revoke-cli-token" ${tokenMeta ? '' : 'disabled'}>Revoke</button>
            </div>
          `;
          box.querySelector('#regenerate-cli-token').addEventListener('click', async () => {
            const payload = await api.post(`/projects/${app.currentProjectId}/cli-token/regenerate`, {});
            app.notify('CLI token generated. Copy it now; it will not be shown again.', 'success');
            renderCliToken(payload.token);
          });
          box.querySelector('#revoke-cli-token').addEventListener('click', async () => {
            if (!confirm('Revoke CLI token for this project?')) return;
            await api.del(`/projects/${app.currentProjectId}/cli-token`);
            app.notify('CLI token revoked', 'success');
            renderCliToken();
          });
          const copyToken = box.querySelector('#copy-cli-token');
          if (copyToken) {
            copyToken.addEventListener('click', async () => {
              try {
                const copied = await LightTeXCore.clipboard.copyText(revealedToken);
                if (!copied) throw new Error('Clipboard unavailable');
                app.notify('CLI token copied', 'success');
              } catch {
                app.notify('Could not copy token automatically', 'error');
              }
            });
          }
        } catch (err) {
          box.innerHTML = `
            <div class="panel-empty error">
              <strong>Could not load CLI token</strong>
              <span>${app.escapeHtml(err.message || 'Unknown token error')}</span>
            </div>
          `;
        }
      };

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

      const renderInvites = async (revealedToken) => {
        const list = overlay.querySelector('#invite-list');
        const reveal = overlay.querySelector('#invite-reveal');
        if (!list || !reveal) return;
        if (revealedToken) {
          const url = LightTeXFeatures.collaborationCenter.inviteUrl(revealedToken);
          reveal.innerHTML = `
            <div class="copy-row">
              <code>${app.escapeHtml(url)}</code>
              <button class="btn btn-secondary btn-small" type="button" id="copy-invite-link">Copy link</button>
            </div>
          `;
          reveal.querySelector('#copy-invite-link').addEventListener('click', async () => {
            try {
              const copied = await LightTeXCore.clipboard.copyText(url);
              if (!copied) throw new Error('Clipboard unavailable');
              app.notify('Invite link copied', 'success');
            } catch {
              app.notify('Could not copy invite link automatically', 'error');
            }
          });
        }
        list.innerHTML = '<div class="panel-loading">Loading invites...</div>';
        try {
          const invites = await api.get(`/projects/${app.currentProjectId}/invites`);
          const active = invites.filter((invite) => !invite.revokedAt);
          list.innerHTML = active.length === 0 ? `
            <div class="panel-empty compact">
              <strong>No active invite links</strong>
              <span>Create a time-limited link for registered users.</span>
            </div>
          ` : active.map((invite) => `
            <div class="invite-row" data-invite="${app.escapeHtml(invite.id)}">
              <span>
                <strong>${app.escapeHtml(invite.role)} · ${app.escapeHtml(invite.tokenPrefix)}...</strong>
                <small>${invite.useCount}/${invite.maxUses} uses · expires ${new Date(invite.expiresAt).toLocaleDateString()}</small>
              </span>
              <button class="btn btn-danger btn-small" type="button" data-invite-revoke="${app.escapeHtml(invite.id)}">Revoke</button>
            </div>
          `).join('');
          list.querySelectorAll('[data-invite-revoke]').forEach((button) => {
            button.addEventListener('click', async () => {
              if (!confirm('Revoke this invite link?')) return;
              await api.del(`/projects/${app.currentProjectId}/invites/${button.dataset.inviteRevoke}`);
              app.notify('Invite revoked', 'success');
              renderInvites();
            });
          });
        } catch (err) {
          list.innerHTML = `
            <div class="panel-empty error">
              <strong>Could not load invites</strong>
              <span>${app.escapeHtml(err.message || 'Unknown invite error')}</span>
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
      overlay.querySelector('#invite-create').addEventListener('click', async () => {
        const error = overlay.querySelector('#invite-error');
        error.textContent = '';
        try {
          const invite = await api.post(`/projects/${app.currentProjectId}/invites`, {
            role: overlay.querySelector('#invite-role').value,
            expiresInDays: Number(overlay.querySelector('#invite-expires').value || 14),
            maxUses: Number(overlay.querySelector('#invite-max-uses').value || 25),
          });
          app.notify('Invite link created. Copy it now; the full token is shown once.', 'success');
          renderInvites(invite.token);
        } catch (err) {
          error.textContent = err.message;
        }
      });
      renderSharing();
      renderInvites();
      renderCliToken();
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
