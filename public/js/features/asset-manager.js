(function () {
  window.LightTeXFeatures = window.LightTeXFeatures || {};

  const ASSET_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp', 'application/pdf']);
  const ASSET_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'pdf']);
  const TEXT_EXTENSIONS = new Set([
    'tex', 'bib', 'sty', 'cls', 'bst', 'txt', 'md', 'json', 'csv', 'tsv',
    'yaml', 'yml', 'xml', 'html', 'css', 'js', 'mjs', 'cjs', 'log',
  ]);

  function fileExtension(name) {
    return String(name || '').split('.').pop().toLowerCase();
  }

  function isAssetFile(file) {
    const ext = fileExtension(file.name);
    return ASSET_MIME_TYPES.has(file.type) || ASSET_EXTENSIONS.has(ext);
  }

  function isTextFile(file, path = file.name) {
    const ext = fileExtension(path);
    return TEXT_EXTENSIONS.has(ext) || String(file.type || '').startsWith('text/');
  }

  function folderRelativePath(file) {
    const rawPath = file.webkitRelativePath || file.relativePath || file.name;
    const normalized = LightTeXCore.path.normalizeProjectPath(rawPath);
    const parts = normalized.split('/').filter(Boolean);
    if (file.webkitRelativePath && parts.length > 1) parts.shift();
    return parts.join('/');
  }

  function isSafeUploadPath(path) {
    if (!path || path.startsWith('/') || path.includes('\0')) return false;
    return !path.split('/').some((part) => !part || part === '.' || part === '..');
  }

  async function uploadImages(app, fileList) {
    if (!app.ensureCanEdit('upload assets')) return;
    if (!fileList || fileList.length === 0) return;
    let uploaded = 0;
    for (const file of fileList) {
      if (!isAssetFile(file)) {
        app.notify(`Unsupported file type: ${file.name}`, 'error');
        continue;
      }
      try {
        const formData = new FormData();
        formData.append('image', file);
        const headers = { 'Authorization': `Bearer ${api.token}` };
        const res = await fetch(`/api/projects/${app.currentProjectId}/upload-image`, {
          method: 'POST',
          headers,
          body: formData,
        });
        const result = await res.json();
        if (res.ok) {
          uploaded += 1;
          app.notify(`Uploaded ${file.name}`, 'success');
          app.projectFiles = await api.get(`/projects/${app.currentProjectId}/files`);
          app.fileTree.setFiles(app.projectFiles);
          app.refreshFileHashes();
          app.imageFiles = await api.get(`/projects/${app.currentProjectId}/images`);
          Editor.setImageFiles(app.imageFiles);
        } else {
          app.notify(`Upload failed: ${result.error || file.name}`, 'error');
        }
      } catch (err) {
        app.notify(`Upload error: ${err.message}`, 'error');
      }
    }
    return uploaded;
  }

  async function uploadFolder(app, fileList) {
    if (!app.ensureCanEdit('upload folders')) return;
    if (!fileList || fileList.length === 0) return;

    let textCount = 0;
    let assetCount = 0;
    let skippedCount = 0;
    let lastTextPath = null;

    for (const file of fileList) {
      const relativePath = folderRelativePath(file);
      if (!isSafeUploadPath(relativePath)) {
        skippedCount += 1;
        continue;
      }

      const assetFile = isAssetFile(file);
      const textFile = isTextFile(file, relativePath);
      if (!assetFile && !textFile) {
        skippedCount += 1;
        continue;
      }

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', relativePath);
        const res = await fetch(`/api/projects/${app.currentProjectId}/files/upload`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${api.token}` },
          body: formData,
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error || `Could not upload ${relativePath}`);
        if (assetFile) assetCount += 1;
        if (textFile) {
          textCount += 1;
          lastTextPath = relativePath;
        }
      } catch (err) {
        skippedCount += 1;
        app.notify(`Could not upload ${relativePath}: ${err.message}`, 'error');
      }
    }

    app.projectFiles = await api.get(`/projects/${app.currentProjectId}/files`);
    app.fileTree.setFiles(app.projectFiles);
    app.refreshFileHashes();
    app.imageFiles = await api.get(`/projects/${app.currentProjectId}/images`).catch(() => app.imageFiles || []);
    Editor.setImageFiles(app.imageFiles);
    if (app.projectFiles.some((file) => file.path.endsWith('.bib'))) app.refreshCitationCache();
    if (lastTextPath) app.openFile(lastTextPath);
    const summary = [
      textCount ? `${textCount} text file${textCount === 1 ? '' : 's'}` : '',
      assetCount ? `${assetCount} asset${assetCount === 1 ? '' : 's'}` : '',
      skippedCount ? `${skippedCount} skipped` : '',
    ].filter(Boolean).join(', ');
    app.notify(summary ? `Folder upload complete: ${summary}` : 'No supported files found in folder', summary ? 'success' : 'info');
  }

  async function show(app) {
    const canEdit = app.canEditProject();
    const overlay = LightTeXCore.modal.createOverlay('asset-overlay');
    overlay.innerHTML = `
      <div class="modal asset-modal" role="dialog" aria-label="Asset manager">
        <div class="modal-heading-row">
          <div>
            <h2>Assets</h2>
            <p class="modal-subtitle">Images and PDF assets stored in <code>images/</code>.</p>
          </div>
          <button class="btn-icon" type="button" id="asset-close" title="Close assets" aria-label="Close assets">${Icons.x}</button>
        </div>
        <div class="asset-toolbar">
          <button class="btn btn-secondary btn-small" type="button" id="asset-upload" ${canEdit ? '' : 'disabled title="Read-only viewer access"'}>${Icons.upload16} Upload</button>
          <button class="btn btn-secondary btn-small" type="button" id="asset-refresh">${Icons.clock14} Refresh</button>
        </div>
        <div class="asset-grid" id="asset-grid">
          <div class="panel-loading">Loading assets...</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
      overlay.querySelectorAll('[data-object-url]').forEach((el) => URL.revokeObjectURL(el.dataset.objectUrl));
      overlay.remove();
    };
    const grid = overlay.querySelector('#asset-grid');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/svg+xml,image/webp,application/pdf';
    input.multiple = true;
    input.style.display = 'none';
    overlay.appendChild(input);

    const render = async () => {
      grid.querySelectorAll('[data-object-url]').forEach((el) => URL.revokeObjectURL(el.dataset.objectUrl));
      grid.innerHTML = '<div class="panel-loading">Loading assets...</div>';
      try {
        const assets = await api.get(`/projects/${app.currentProjectId}/images`);
        app.imageFiles = assets;
        Editor.setImageFiles(assets);
        if (assets.length === 0) {
          grid.innerHTML = `
            <div class="panel-empty asset-empty">
              <strong>No assets yet</strong>
              <span>Upload PNG, JPG, SVG, GIF, WebP, or PDF files. They will be stored under images/.</span>
            </div>
          `;
          return;
        }
        grid.innerHTML = assets.map((asset, index) => `
          <article class="asset-card" data-index="${index}">
            <div class="asset-preview" data-asset-preview="${index}">
              <span>${asset.path.endsWith('.pdf') ? Icons.filePdf : Icons.fileImage}</span>
            </div>
            <div class="asset-info">
              <strong title="${app.escapeHtml(asset.name)}">${app.escapeHtml(asset.name)}</strong>
              <code title="${app.escapeHtml(asset.path)}">${app.escapeHtml(asset.path)}</code>
            </div>
            <div class="asset-actions">
              ${canEdit ? `<button class="btn btn-secondary btn-small" type="button" data-asset-insert="${index}">Insert</button>` : ''}
              <button class="btn btn-secondary btn-small" type="button" data-asset-copy="${index}">Copy</button>
              ${canEdit ? `<button class="btn btn-danger btn-small" type="button" data-asset-delete="${index}" title="Delete asset" aria-label="Delete ${app.escapeHtml(asset.name)}">${Icons.trash14}</button>` : ''}
            </div>
          </article>
        `).join('');

        assets.forEach((asset, index) => {
          loadPreview(app, overlay.querySelector(`[data-asset-preview="${index}"]`), asset);
        });
        overlay.querySelectorAll('[data-asset-insert]').forEach((button) => {
          button.addEventListener('click', () => {
            const asset = assets[parseInt(button.dataset.assetInsert, 10)];
            Editor.insertText(`\\includegraphics[width=0.8\\textwidth]{${asset.path}}`);
            close();
          });
        });
        overlay.querySelectorAll('[data-asset-copy]').forEach((button) => {
          button.addEventListener('click', async () => {
            const asset = assets[parseInt(button.dataset.assetCopy, 10)];
            try {
              const copied = await LightTeXCore.clipboard.copyText(asset.path);
              if (!copied) throw new Error('Clipboard unavailable');
              app.notify('Asset path copied', 'success');
            } catch {
              app.notify('Could not copy path automatically', 'error');
            }
          });
        });
        overlay.querySelectorAll('[data-asset-delete]').forEach((button) => {
          button.addEventListener('click', async () => {
            const asset = assets[parseInt(button.dataset.assetDelete, 10)];
            if (!confirm(`Delete "${asset.name}"?`)) return;
            try {
              await api.del(`/projects/${app.currentProjectId}/files/${app.encodeProjectPath(asset.path)}`);
              app.projectFiles = await api.get(`/projects/${app.currentProjectId}/files`);
              app.fileTree.setFiles(app.projectFiles);
              app.refreshFileHashes();
              app.notify('Asset deleted', 'success');
              render();
            } catch (err) {
              app.notify('Delete failed: ' + err.message, 'error');
            }
          });
        });
      } catch (err) {
        grid.innerHTML = `
          <div class="panel-empty error">
            <strong>Could not load assets</strong>
            <span>${app.escapeHtml(err.message || 'Unknown asset error')}</span>
          </div>
        `;
      }
    };

    LightTeXCore.modal.bindOverlayClose(overlay, close, '#asset-close');
    overlay.querySelector('#asset-upload').addEventListener('click', () => {
      if (!app.ensureCanEdit('upload assets')) return;
      input.click();
    });
    overlay.querySelector('#asset-refresh').addEventListener('click', render);
    input.addEventListener('change', async () => {
      await uploadImages(app, input.files);
      input.value = '';
      render();
    });
    render();
  }

  async function loadPreview(app, container, asset) {
    if (!container || asset.path.endsWith('.pdf')) return;
    try {
      const res = await fetch(`/api/projects/${app.currentProjectId}/files/${app.encodeProjectPath(asset.path)}`, {
        headers: { 'Authorization': `Bearer ${api.token}` },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      container.innerHTML = `<img src="${url}" alt="${app.escapeHtml(asset.name)}">`;
      container.dataset.objectUrl = url;
    } catch {
      // Keep the generic asset icon.
    }
  }

  window.LightTeXFeatures.assetManager = {
    loadPreview,
    show,
    uploadFolder,
    uploadImages,
  };
})();
