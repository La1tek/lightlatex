(function () {
  window.LightTeXCore = window.LightTeXCore || {};

  function createOverlay(className = '') {
    const overlay = document.createElement('div');
    overlay.className = ['modal-overlay', className].filter(Boolean).join(' ');
    return overlay;
  }

  function bindOverlayClose(overlay, close, closeSelector) {
    if (closeSelector) {
      overlay.querySelector(closeSelector)?.addEventListener('click', close);
    }
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
  }

  window.LightTeXCore.modal = {
    createOverlay,
    bindOverlayClose,
  };
})();
