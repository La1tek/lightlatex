const baseUrl = (process.env.LIGHTTEX_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = process.env.LIGHTTEX_BROWSER_EMAIL || `browser-${runId}@lighttex.local`;
const password = process.env.LIGHTTEX_BROWSER_PASSWORD || `Browser-${runId.slice(0, 8)}!`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (err) {
    if (err.code !== 'ERR_MODULE_NOT_FOUND') throw err;
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'Playwright is not installed',
    }, null, 2));
    return null;
  }
}

function isWatchedRequest(url) {
  return url.startsWith(baseUrl)
    || url.includes('cdn.jsdelivr.net/npm/monaco-editor')
    || url.includes('cdn.jsdelivr.net/npm/pdfjs-dist');
}

async function main() {
  const playwright = await loadPlaywright();
  if (!playwright) return;

  const browser = await playwright.chromium.launch({
    headless: process.env.LIGHTTEX_BROWSER_HEADLESS !== '0',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  const failures = [];

  page.on('pageerror', (err) => {
    failures.push(`pageerror: ${err.message}`);
  });
  page.on('requestfailed', (request) => {
    if (!isWatchedRequest(request.url())) return;
    failures.push(`request failed: ${request.url()} ${request.failure()?.errorText || ''}`.trim());
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('favicon')) return;
    failures.push(`console error: ${text}`);
  });

  try {
    await page.goto(`${baseUrl}/#/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#auth-page', { timeout: 20000 });
    await page.click('#show-register');
    await page.fill('#reg-name', 'Browser Smoke');
    await page.fill('#reg-email', email);
    await page.fill('#reg-password', password);
    await page.fill('#reg-confirm', password);
    await page.check('#reg-terms');

    await Promise.all([
      page.waitForSelector('.dashboard', { timeout: 20000 }),
      page.click('#register-submit'),
    ]);

    await page.waitForSelector('#new-project-btn', { timeout: 10000 });
    await page.click('#new-project-btn');
    await page.waitForSelector('.new-project-modal', { timeout: 10000 });

    const title = await page.locator('.new-project-modal h2').textContent();
    assert(title?.includes('New Project'), 'New project modal did not open');
    assert(failures.length === 0, failures.join('\n'));

    console.log(JSON.stringify({
      ok: true,
      baseUrl,
      email,
      checked: ['bootstrap', 'auth-register', 'dashboard', 'new-project-modal'],
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
