let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let pdfCanvas = null;
let rendering = false;

const Preview = {
  init(canvasEl) {
    pdfCanvas = canvasEl;
  },

  async loadPdf(projectId) {
    if (!pdfCanvas) return;

    try {
      const blob = await api.download(`/projects/${projectId}/output.pdf`);
      const arrayBuffer = await blob.arrayBuffer();
      pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      totalPages = pdfDoc.numPages;
      currentPage = 1;
      await this.renderCurrentPage();
    } catch (err) {
      pdfDoc = null;
      const container = pdfCanvas.parentElement;
      if (container) {
        container.innerHTML = '<div class="preview-placeholder">No PDF yet. Compile your project (Ctrl+S).</div>';
      }
    }
  },

  async renderCurrentPage() {
    if (!pdfDoc || !pdfCanvas || rendering) return;
    rendering = true;

    try {
      const page = await pdfDoc.getPage(currentPage);
      const container = pdfCanvas.parentElement;
      const scale = Math.min(
        (container.clientWidth - 20) / page.getViewport({ scale: 1 }).width,
        2.0
      );
      const viewport = page.getViewport({ scale });

      pdfCanvas.width = viewport.width;
      pdfCanvas.height = viewport.height;

      const ctx = pdfCanvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
    } finally {
      rendering = false;
    }
  },

  nextPage() {
    if (currentPage < totalPages) {
      currentPage++;
      this.renderCurrentPage();
    }
  },

  prevPage() {
    if (currentPage > 1) {
      currentPage--;
      this.renderCurrentPage();
    }
  },

  clear() {
    pdfDoc = null;
    if (pdfCanvas) {
      pdfCanvas.getContext('2d').clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
    }
  }
};
