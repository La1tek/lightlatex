(function () {
  window.LightTeXFeatures = window.LightTeXFeatures || {};

  function currentFile(app) {
    return app.fileTree?.selectedPath || app.currentProject?.mainFile || '';
  }

  function inviteUrl(token) {
    return `${window.location.origin}/#/invite/${encodeURIComponent(token)}`;
  }

  async function showComments(app) {
    const overlay = LightTeXCore.modal.createOverlay();
    const fileOptions = app.projectFiles
      .filter((file) => !file.path.endsWith('/'))
      .map((file) => `<option value="${app.escapeHtml(file.path)}" ${file.path === currentFile(app) ? 'selected' : ''}>${app.escapeHtml(file.path)}</option>`)
      .join('');
    overlay.innerHTML = `
      <div class="modal collaboration-modal">
        <div class="modal-heading-row">
          <div>
            <h2>Comments</h2>
            <p class="modal-subtitle">File and line notes for review, editing, and handoff.</p>
          </div>
          <label class="check-row compact"><input type="checkbox" id="comments-include-resolved"> Resolved</label>
        </div>
        <form class="comment-form" id="comment-form">
          <div class="form-grid comment-target-grid">
            <div class="form-group">
              <label for="comment-file">File</label>
              <select id="comment-file">${fileOptions}</select>
            </div>
            <div class="form-group">
              <label for="comment-line">Line</label>
              <input id="comment-line" type="number" min="1" placeholder="Optional">
            </div>
          </div>
          <div class="form-group">
            <label for="comment-body">Comment</label>
            <textarea id="comment-body" rows="3" placeholder="Leave a review note, question, or handoff detail."></textarea>
          </div>
          <div class="field-error" id="comment-error" role="alert"></div>
          <div class="modal-actions compact-actions">
            <button class="btn btn-primary" type="submit" id="comment-submit">${Icons.comment16} Add comment</button>
          </div>
        </form>
        <div class="comment-list" id="comment-list">
          <div class="panel-loading">Loading comments...</div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" type="button" id="comments-close">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    LightTeXCore.modal.bindOverlayClose(overlay, close, '#comments-close');

    const renderComments = async () => {
      const list = overlay.querySelector('#comment-list');
      const includeResolved = overlay.querySelector('#comments-include-resolved').checked;
      list.innerHTML = '<div class="panel-loading">Loading comments...</div>';
      try {
        const comments = await api.get(`/projects/${app.currentProjectId}/comments?includeResolved=${includeResolved}`);
        if (comments.length === 0) {
          list.innerHTML = `
            <div class="panel-empty compact">
              <strong>No comments</strong>
              <span>Add a note for the current file or line.</span>
            </div>
          `;
          return;
        }
        list.innerHTML = comments.map((comment) => `
          <article class="comment-row ${comment.resolved ? 'resolved' : ''}" data-comment="${app.escapeHtml(comment.id)}">
            <div class="comment-row-main">
              <div class="comment-meta">
                <strong>${app.escapeHtml(comment.authorName || comment.authorEmail)}</strong>
                <span>${app.escapeHtml(comment.filePath || 'Project')}${comment.lineNumber ? `:${comment.lineNumber}` : ''}</span>
                <span>${new Date(comment.updatedAt || comment.createdAt).toLocaleString()}</span>
              </div>
              <p>${app.escapeHtml(comment.body)}</p>
            </div>
            <div class="comment-actions">
              <button class="btn btn-secondary btn-small" type="button" data-comment-goto="${app.escapeHtml(comment.id)}">Go</button>
              <button class="btn btn-secondary btn-small" type="button" data-comment-resolve="${app.escapeHtml(comment.id)}">${comment.resolved ? 'Reopen' : 'Resolve'}</button>
              <button class="btn btn-danger btn-small" type="button" data-comment-delete="${app.escapeHtml(comment.id)}">${Icons.trash14}</button>
            </div>
          </article>
        `).join('');
        list.querySelectorAll('[data-comment-goto]').forEach((button) => {
          button.addEventListener('click', async () => {
            const comment = comments.find((item) => item.id === button.dataset.commentGoto);
            if (!comment?.filePath) return;
            await app.openFile(comment.filePath);
            close();
          });
        });
        list.querySelectorAll('[data-comment-resolve]').forEach((button) => {
          button.addEventListener('click', async () => {
            const comment = comments.find((item) => item.id === button.dataset.commentResolve);
            await api.post(`/projects/${app.currentProjectId}/comments/${comment.id}/resolve`, { resolved: !comment.resolved });
            app.notify(comment.resolved ? 'Comment reopened' : 'Comment resolved', 'success');
            renderComments();
          });
        });
        list.querySelectorAll('[data-comment-delete]').forEach((button) => {
          button.addEventListener('click', async () => {
            if (!confirm('Delete this comment?')) return;
            await api.del(`/projects/${app.currentProjectId}/comments/${button.dataset.commentDelete}`);
            app.notify('Comment deleted', 'success');
            renderComments();
          });
        });
      } catch (err) {
        list.innerHTML = `
          <div class="panel-empty error">
            <strong>Could not load comments</strong>
            <span>${app.escapeHtml(err.message || 'Unknown comments error')}</span>
          </div>
        `;
      }
    };

    overlay.querySelector('#comments-include-resolved').addEventListener('change', renderComments);
    overlay.querySelector('#comment-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = overlay.querySelector('#comment-body').value.trim();
      const error = overlay.querySelector('#comment-error');
      const submit = overlay.querySelector('#comment-submit');
      error.textContent = '';
      if (!body) {
        error.textContent = 'Comment text required.';
        overlay.querySelector('#comment-body').focus();
        return;
      }
      try {
        submit.disabled = true;
        submit.innerHTML = `${Icons.clock14} Adding...`;
        await api.post(`/projects/${app.currentProjectId}/comments`, {
          filePath: overlay.querySelector('#comment-file').value,
          lineNumber: overlay.querySelector('#comment-line').value || undefined,
          body,
        });
        overlay.querySelector('#comment-body').value = '';
        app.notify('Comment added', 'success');
        renderComments();
      } catch (err) {
        error.textContent = err.message;
      } finally {
        submit.disabled = false;
        submit.innerHTML = `${Icons.comment16} Add comment`;
      }
    });

    renderComments();
    overlay.querySelector('#comment-body').focus();
  }

  async function acceptInvite(app, token) {
    const appRoot = document.getElementById('app');
    appRoot.innerHTML = `
      <div class="auth-page single">
        <main class="auth-card" aria-labelledby="invite-title">
          <h1 class="brand">${Icons.logo} LightTeX</h1>
          <h2 id="invite-title">Accepting invite</h2>
          <p class="subtitle">Adding this project to your workspace...</p>
          <div class="panel-loading" id="invite-status">Checking invite token...</div>
        </main>
      </div>
    `;
    try {
      const result = await api.post('/projects/invites/accept', { token });
      localStorage.removeItem('pendingProjectInvite');
      app.notify('Project invite accepted', 'success');
      window.location.hash = `#/project/${result.projectId}`;
    } catch (err) {
      document.getElementById('invite-status').innerHTML = `
        <div class="panel-empty error">
          <strong>Invite could not be accepted</strong>
          <span>${app.escapeHtml(err.message || 'Unknown invite error')}</span>
        </div>
      `;
    }
  }

  window.LightTeXFeatures.collaborationCenter = {
    showComments,
    acceptInvite,
    inviteUrl,
  };
})();
