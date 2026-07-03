let pdfDoc = null;
let totalPages = 0;
let previewContainer = null;
let currentPage = 1;
let rendering = false;
let pageElements = [];
let zoomMode = 'fit-width';
let zoomScale = 1;
let currentCssScale = 1;
let scrollHandler = null;
let wheelHandler = null;
let gestureStartHandler = null;
let gestureChangeHandler = null;
let gestureEndHandler = null;
let lastGestureScale = 1;
let renderGeneration = 0;

const Preview = {
  init(containerEl) {
    if (previewContainer && scrollHandler) {
      previewContainer.removeEventListener('scroll', scrollHandler);
      previewContainer.removeEventListener('wheel', wheelHandler);
      previewContainer.removeEventListener('gesturestart', gestureStartHandler);
      previewContainer.removeEventListener('gesturechange', gestureChangeHandler);
      previewContainer.removeEventListener('gestureend', gestureEndHandler);
    }
    previewContainer = containerEl;
    scrollHandler = () => {
      if (!pdfDoc) return;
      currentPage = this.getCurrentVisiblePage();
      const num = document.getElementById('pdf-page-num');
      if (num) num.textContent = totalPages > 0 ? `${currentPage} / ${totalPages}` : '';
    };
    wheelHandler = (event) => {
      if (!pdfDoc || !this.isEventInsidePreview(event)) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      const factor = direction > 0 ? 1.12 : 0.88;
      this.zoomAt(event.clientX, event.clientY, factor);
    };
    gestureStartHandler = (event) => {
      if (!pdfDoc || !this.isEventInsidePreview(event)) return;
      event.preventDefault();
      lastGestureScale = event.scale || 1;
    };
    gestureChangeHandler = (event) => {
      if (!pdfDoc || !this.isEventInsidePreview(event)) return;
      event.preventDefault();
      const nextScale = event.scale || 1;
      const factor = nextScale / Math.max(0.01, lastGestureScale);
      lastGestureScale = nextScale;
      if (Number.isFinite(factor) && Math.abs(factor - 1) > 0.015) {
        this.zoomAt(event.clientX, event.clientY, factor);
      }
    };
    gestureEndHandler = () => {
      lastGestureScale = 1;
    };
    previewContainer.addEventListener('scroll', scrollHandler, { passive: true });
    previewContainer.addEventListener('wheel', wheelHandler, { passive: false });
    previewContainer.addEventListener('gesturestart', gestureStartHandler, { passive: false });
    previewContainer.addEventListener('gesturechange', gestureChangeHandler, { passive: false });
    previewContainer.addEventListener('gestureend', gestureEndHandler, { passive: true });
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
    const generation = ++renderGeneration;
    rendering = true;

    previewContainer.innerHTML = '';
    pageElements = [];

    for (let i = 1; i <= totalPages; i++) {
      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'pdf-page-wrapper';
      pageWrapper.dataset.page = i;

      const pageSurface = document.createElement('div');
      pageSurface.className = 'pdf-page-surface';

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';

      const textLayer = document.createElement('div');
      textLayer.className = 'pdf-text-layer';
      textLayer.setAttribute('aria-label', `PDF text layer page ${i}`);

      const pageLabel = document.createElement('div');
      pageLabel.className = 'pdf-page-label';
      pageLabel.textContent = `${i} / ${totalPages}`;

      pageSurface.appendChild(canvas);
      pageSurface.appendChild(textLayer);
      pageWrapper.appendChild(pageSurface);
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
        const surface = pageElements[i - 1].querySelector('.pdf-page-surface');
        const textLayer = pageElements[i - 1].querySelector('.pdf-text-layer');
        const outputScale = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
        const pixelWidth = Math.floor(viewport.width * outputScale);
        const pixelHeight = Math.floor(viewport.height * outputScale);
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${Math.round(viewport.width)}px`;
        canvas.style.height = `${Math.round(viewport.height)}px`;
        pageElements[i - 1].style.width = `${Math.round(viewport.width)}px`;
        surface.style.width = `${Math.round(viewport.width)}px`;
        surface.style.height = `${Math.round(viewport.height)}px`;
        textLayer.style.width = `${Math.round(viewport.width)}px`;
        textLayer.style.height = `${Math.round(viewport.height)}px`;
        textLayer.innerHTML = '';
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
        if (generation !== renderGeneration) return;
        await this.renderTextLayer(page, viewport, textLayer);
      } catch (err) {
        // skip failed pages
      }
    }

    rendering = false;
  },

  async renderTextLayer(page, viewport, container) {
    if (!container || !pdfjsLib?.renderTextLayer) return;
    try {
      const textContent = await page.getTextContent();
      const task = pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container,
        viewport,
        textDivs: [],
        enhanceTextSelection: true,
      });
      await (task?.promise || task);
    } catch {
      container.innerHTML = '';
    }
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
      zoomScale = Math.min(4, Math.max(0.35, modeOrScale));
    } else {
      zoomMode = modeOrScale;
    }
    await this.renderAllPages();
  },

  isEventInsidePreview(event) {
    if (!previewContainer) return false;
    return previewContainer.contains(event.target);
  },

  pageAnchorAt(clientX, clientY) {
    if (!previewContainer || pageElements.length === 0) return null;
    const element = document.elementFromPoint(clientX, clientY);
    const wrapper = element?.closest?.('.pdf-page-wrapper') || this.getCurrentPageElement();
    if (!wrapper) return null;
    const rect = wrapper.querySelector('.pdf-page-surface')?.getBoundingClientRect();
    if (!rect) return null;
    return {
      page: parseInt(wrapper.dataset.page || '1', 10),
      xRatio: rect.width ? (clientX - rect.left) / rect.width : 0.5,
      yRatio: rect.height ? (clientY - rect.top) / rect.height : 0.5,
    };
  },

  getCurrentPageElement() {
    const page = this.getCurrentVisiblePage();
    return pageElements[page - 1] || pageElements[0] || null;
  },

  async zoomAt(clientX, clientY, factor) {
    if (!pdfDoc || rendering) return;
    const anchor = this.pageAnchorAt(clientX, clientY);
    const beforeScale = this.getCurrentScale();
    const nextScale = Math.min(4, Math.max(0.35, beforeScale * factor));
    if (Math.abs(nextScale - beforeScale) < 0.01) return;
    await this.setZoom(nextScale);
    if (!anchor || !previewContainer) return;
    const wrapper = pageElements[anchor.page - 1];
    const surface = wrapper?.querySelector('.pdf-page-surface');
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    previewContainer.scrollLeft += rect.left + (rect.width * anchor.xRatio) - clientX;
    previewContainer.scrollTop += rect.top + (rect.height * anchor.yRatio) - clientY;
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
