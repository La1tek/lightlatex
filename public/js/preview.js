let pdfDoc = null;
let totalPages = 0;
let previewContainer = null;
let currentPage = 1;
let rendering = false;
let pageElements = [];

const Preview = {
  init(containerEl) {
    previewContainer = containerEl;
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
        const visibleWidth = previewContainer.clientWidth
          || previewContainer.closest('.preview-pane')?.clientWidth
          || 760;
        const containerWidth = Math.max(320, visibleWidth - 40);
        const scale = Math.min(containerWidth / page.getViewport({ scale: 1 }).width, 2.0);
        const viewport = page.getViewport({ scale });

        const canvas = pageElements[i - 1].querySelector('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
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

  clear() {
    pdfDoc = null;
    pageElements = [];
    if (previewContainer) {
      previewContainer.innerHTML = '<div class="preview-placeholder">No PDF yet. Compile your project (Ctrl+S).</div>';
    }
  }
};

// Scroll sync: detect visible page on scroll
if (typeof window !== 'undefined') {
  window.addEventListener('scroll', () => {
    if (pdfDoc && previewContainer) {
      currentPage = Preview.getCurrentVisiblePage();
      const label = document.getElementById('pdf-page-indicator');
      if (label) label.textContent = `${currentPage} / ${totalPages}`;
    }
  }, { passive: true });
}
