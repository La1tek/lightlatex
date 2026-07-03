const CDN_SCRIPTS = [
  'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
];

const APP_SCRIPTS = [
  '/js/icons.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/tree.js',
  '/js/editor.js',
  '/js/preview.js',
  '/js/core/dom.js',
  '/js/core/modal.js',
  '/js/core/notify.js',
  '/js/core/permissions.js',
  '/js/core/format.js',
  '/js/core/path.js',
  '/js/features/dashboard.js',
  '/js/features/new-project.js',
  '/js/features/search-modal.js',
  '/js/features/workspace-layout.js',
  '/js/features/editor-workspace.js',
  '/js/features/sync-center.js',
  '/js/features/history-modal.js',
  '/js/features/command-palette.js',
  '/js/features/compile-panel.js',
  '/js/features/file-actions.js',
  '/js/features/asset-manager.js',
  '/js/features/citation-manager.js',
  '/js/features/diagnostics.js',
  '/js/features/project-settings.js',
  '/js/app.js',
  '/js/admin.js',
];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function loadScripts(scripts) {
  for (const script of scripts) {
    await loadScript(script);
  }
}

async function bootstrap() {
  await loadScripts(CDN_SCRIPTS);

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }

  await loadScripts(APP_SCRIPTS);
}

bootstrap().catch((err) => {
  console.error(err);
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `
      <main class="boot-error" role="alert">
        <h1>LightTeX failed to start</h1>
        <p>${err.message}</p>
      </main>
    `;
  }
});
