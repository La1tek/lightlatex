const baseUrl = (process.env.LIGHTTEX_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = process.env.LIGHTTEX_SMOKE_EMAIL || `smoke-${runId}@lighttex.local`;
const password = process.env.LIGHTTEX_SMOKE_PASSWORD || `Smoke-${runId.slice(0, 8)}!`;
let accessToken = '';

function apiUrl(path) {
  return `${baseUrl}/api${path.startsWith('/') ? path : `/${path}`}`;
}

async function request(method, path, body, token = accessToken) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(apiUrl(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') && text ? JSON.parse(text) : text;

  if (!response.ok) {
    const message = payload?.error || response.statusText || 'Request failed';
    throw new Error(`${method} ${path} -> ${response.status}: ${message}`);
  }

  return payload;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function maybeCheckAdminHealth() {
  const adminEmail = process.env.LIGHTTEX_ADMIN_EMAIL;
  const adminPassword = process.env.LIGHTTEX_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) return null;

  const session = await request('POST', '/auth/login', { email: adminEmail, password: adminPassword }, '');
  const health = await request('GET', '/admin/health', undefined, session.accessToken);
  assert(['ok', 'warning', 'error'].includes(health.status), 'Admin health returned an unknown status');
  return health.status;
}

async function main() {
  const auth = await request('POST', '/auth/register', {
    email,
    password,
    name: 'Smoke User',
  }, '');
  accessToken = auth.accessToken;
  assert(auth.user?.email === email, 'Registered user email mismatch');

  const me = await request('GET', '/auth/me');
  assert(me.id === auth.user.id, 'Current user id mismatch');

  const project = await request('POST', '/projects', {
    name: `Smoke ${runId}`,
    description: 'API smoke project',
    compiler: 'pdflatex',
    template: 'article',
  });
  assert(project.id, 'Project id missing');

  const projects = await request('GET', '/projects');
  assert(projects.some((item) => item.id === project.id && item.accessRole === 'owner'), 'Created project missing from project list');

  const detail = await request('GET', `/projects/${project.id}`);
  assert(detail.accessRole === 'owner', 'Project detail access role mismatch');

  const files = await request('GET', `/projects/${project.id}/files`);
  assert(files.some((file) => file.path === 'main.tex'), 'Template did not create main.tex');

  const source = await request('GET', `/projects/${project.id}/files/main.tex`);
  assert(source.includes('\\documentclass'), 'main.tex does not look like LaTeX source');

  const collaborators = await request('GET', `/projects/${project.id}/collaborators`);
  assert(collaborators.owner?.email === email, 'Collaborator owner email mismatch');
  assert(Array.isArray(collaborators.collaborators), 'Collaborators list missing');

  const hashes = await request('GET', `/projects/${project.id}/files-with-hashes`);
  assert(hashes.some((file) => file.path === 'main.tex' && file.hash), 'File hash for main.tex missing');

  const healthStatus = await maybeCheckAdminHealth();

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    user: email,
    projectId: project.id,
    fileCount: files.length,
    healthStatus,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
