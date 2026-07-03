(function () {
  window.LightTeXCore = window.LightTeXCore || {};

  function notify(message, type = 'info', timeout = 4000) {
    const el = document.createElement('div');
    el.className = `notification ${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s';
      setTimeout(() => el.remove(), 300);
    }, timeout);
    return el;
  }

  window.LightTeXCore.notify = {
    show: notify,
  };
})();
