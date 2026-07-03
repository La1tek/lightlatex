(function () {
  window.LightTeXCore = window.LightTeXCore || {};

  function encodeProjectPath(filePath) {
    return String(filePath || '').split('/').map(encodeURIComponent).join('/');
  }

  function normalizeProjectPath(filePath) {
    return (filePath || '').replace(/\\/g, '/').replace(/^\.?\//, '');
  }

  function projectPathExists(filePath, filePaths) {
    const normalized = normalizeProjectPath(filePath);
    if (filePaths.has(normalized)) return true;
    if (!normalized.includes('/')) {
      const imagePath = `images/${normalized}`;
      if (filePaths.has(imagePath)) return true;
    }
    const hasExtension = /\.[a-z0-9]+$/i.test(normalized);
    if (!hasExtension) {
      return Array.from(filePaths).some((candidate) => (
        candidate === normalized
        || candidate.startsWith(`${normalized}.`)
        || candidate.startsWith(`images/${normalized}.`)
      ));
    }
    return false;
  }

  window.LightTeXCore.path = {
    encodeProjectPath,
    normalizeProjectPath,
    projectPathExists,
  };
})();
