let pdfDoc = null;
let totalPages = 0;
let previewContainer = null;
let currentPage = 1;
let rendering = false;
let pageElements = [];
let zoomMode = 'fit-width';
let zoomScale = 1;
let currentCssScale = 1;

const Preview = {
  init(containerEl) {
    previewContainer = containerEl;
    previewContainer.addEventListener('scroll', () => {
      if (!pdfDoc) return;
      currentPage = this.getCurrentVisiblePage();
      const num = document.getElementById('pdf-page-num');
      if (num) num.textContent = totalPages > 0 ? `${currentPage} / ${totalPages}` : '';
    }, { passive: true });
  },

  async loadPdf(projectId) {
    if (!previewContainer) return;

    try {
      const blob = await api.download(`/projects/${projectId}/output.pdf`);
      const arrayBuffer = await blob.arrayBuffer();
      pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      totalPages = pdfDoc.numPages;
      pageElements = [];
      await this.renderAllPages();
      // Scroll to page 1
      if (pageElements[0]) {
        pageElements[0].scrollIntoView({ block: 'start' });
      }
    } catch (err) {
      pdfDoc = null;
      previewContainer.innerHTML = '<div class="preview-placeholder">No PDF yet. Compile your project (Ctrl+S).</div>';
    }
  },

  async renderAllPages() {
    if (!pdfDoc || !previewContainer) return;
    rendering = true;

    previewContainer.innerHTML = '';
    pageElements = [];

    for (let i = 1; i <= totalPages; i++) {
      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'pdf-page-wrapper';
      pageWrapper.dataset.page = i;

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';

      const pageLabel = document.createElement('div');
      pageLabel.className = 'pdf-page-label';
      pageLabel.textContent = `${i} / ${totalPages}`;

      pageWrapper.appendChild(canvas);
      pageWrapper.appendChild(pageLabel);
      previewContainer.appendChild(pageWrapper);
      pageElements.push(pageWrapper);
    }

    // Render each page
    for (let i = 1; i <= totalPages; i++) {
      try {
        const page = await pdfDoc.getPage(i);
        const baseViewport = page.getViewport({ scale: 1 });
        const visibleWidth = previewContainer.clientWidth
          || previewContainer.closest('.preview-pane')?.clientWidth
          || 760;
        const visibleHeight = previewContainer.clientHeight || 640;
        const containerStyles = getComputedStyle(previewContainer);
        const horizontalPadding =
          parseFloat(containerStyles.paddingLeft || '0') +
          parseFloat(containerStyles.paddingRight || '0');
        const containerWidth = Math.max(320, visibleWidth - horizontalPadding - 16);
        const scale = zoomMode === 'fit-width'
          ? Math.min(containerWidth / baseViewport.width, 2.0)
          : zoomMode === 'fit-page'
            ? Math.min(containerWidth / baseViewport.width, Math.max(0.25, (visibleHeight - 64) / baseViewport.height), 2.0)
            : zoomScale;
        const viewport = page.getViewport({ scale });
        currentCssScale = scale;

        const canvas = pageElements[i - 1].querySelector('canvas');
        const outputScale = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
        const pixelWidth = Math.floor(viewport.width * outputScale);
        const pixelHeight = Math.floor(viewport.height * outputScale);
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${Math.round(viewport.width)}px`;
        canvas.style.height = `${Math.round(viewport.height)}px`;
        pageElements[i - 1].style.width = `${Math.round(viewport.width)}px`;
        canvas.dataset.scale = String(scale);
        canvas.dataset.outputScale = String(outputScale);

        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, pixelWidth, pixelHeight);
        await page.render({
          canvasContext: ctx,
          viewport,
          transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
        }).promise;
      } catch (err) {
        // skip failed pages
      }
    }

    rendering = false;
  },

  // Detect which page is currently visible based on scroll position
  getCurrentVisiblePage() {
    if (!previewContainer || pageElements.length === 0) return 1;

    const containerRect = previewContainer.getBoundingClientRect();
    const containerMiddle = containerRect.top + containerRect.height / 3;

    for (let i = 0; i < pageElements.length; i++) {
      const el = pageElements[i];
      const rect = el.getBoundingClientRect();
      if (rect.top <= containerMiddle && rect.bottom > containerMiddle) {
        return i + 1;
      }
    }
    return 1;
  },

  goToPage(page) {
    if (pdfDoc && page >= 1 && page <= totalPages && pageElements[page - 1]) {
      pageElements[page - 1].scrollIntoView({ block: 'start' });
    }
  },

  nextPage() {
    const current = this.getCurrentVisiblePage();
    if (current < totalPages) {
      this.goToPage(current + 1);
    }
  },

  prevPage() {
    const current = this.getCurrentVisiblePage();
    if (current > 1) {
      this.goToPage(current - 1);
    }
  },

  async setZoom(modeOrScale) {
    if (typeof modeOrScale === 'number') {
      zoomMode = 'manual';
      zoomScale = Math.min(2.5, Math.max(0.35, modeOrScale));
    } else {
      zoomMode = modeOrScale;
    }
    await this.renderAllPages();
  },

  async zoomIn() {
    const current = zoomMode === 'manual' ? zoomScale : this.getCurrentScale();
    await this.setZoom(current + 0.15);
  },

  async zoomOut() {
    const current = zoomMode === 'manual' ? zoomScale : this.getCurrentScale();
    await this.setZoom(current - 0.15);
  },

  getCurrentScale() {
    const canvas = pageElements[0]?.querySelector('canvas');
    return canvas?.dataset.scale ? parseFloat(canvas.dataset.scale) : currentCssScale || zoomScale;
  },

  getZoomLabel() {
    if (zoomMode === 'fit-width') return 'Fit';
    if (zoomMode === 'fit-page') return 'Page';
    return `${Math.round(this.getCurrentScale() * 100)}%`;
  },

  clear() {
    pdfDoc = null;
    pageElements = [];
    if (previewContainer) {
      previewContainer.innerHTML = '<div class="preview-placeholder">No PDF yet. Compile your project (Ctrl+S).</div>';
    }
  }
};
