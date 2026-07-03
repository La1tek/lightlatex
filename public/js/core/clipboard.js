(function () {
  window.LightTeXCore = window.LightTeXCore || {};

  async function copyText(text) {
    const value = text == null ? '' : String(text);
    if (!value) return false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      // Fall through to the selection based clipboard path.
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    try {
      return document.execCommand('copy');
    } finally {
      textarea.remove();
    }
  }

  window.LightTeXCore.clipboard = {
    copyText,
  };
})();
