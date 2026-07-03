const baseUrl = (process.env.LIGHTTEX_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = process.env.LIGHTTEX_SMOKE_EMAIL || `smoke-${runId}@lighttex.local`;
const collaboratorEmail = process.env.LIGHTTEX_SMOKE_COLLABORATOR_EMAIL || `smoke-collab-${runId}@lighttex.local`;
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

async function expectRequestError(method, path, body, expectedStatus, token = accessToken) {
  try {
    await request(method, path, body, token);
  } catch (err) {
    assert(err.message.includes(`-> ${expectedStatus}:`), `Expected ${expectedStatus} for ${method} ${path}, got ${err.message}`);
    return;
  }
  throw new Error(`Expected ${method} ${path} to fail with ${expectedStatus}`);
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

  const cliTokenPayload = await request('POST', `/projects/${project.id}/cli-token/regenerate`, {});
  assert(cliTokenPayload.token?.startsWith('ltx_'), 'CLI token missing or malformed');
  const cliTokenMeta = await request('GET', `/projects/${project.id}/cli-token`);
  assert(cliTokenMeta.tokenPrefix === cliTokenPayload.tokenPrefix, 'CLI token metadata prefix mismatch');

  const files = await request('GET', `/projects/${project.id}/files`);
  assert(files.some((file) => file.path === 'main.tex'), 'Template did not create main.tex');

  const cliFiles = await request('GET', `/projects/${project.id}/files`, undefined, cliTokenPayload.token);
  assert(cliFiles.some((file) => file.path === 'main.tex'), 'CLI token could not access scoped project files');

  const otherProject = await request('POST', '/projects', {
    name: `Smoke Other ${runId}`,
    compiler: 'pdflatex',
    template: 'article',
  });
  await expectRequestError('GET', `/projects/${otherProject.id}/files`, undefined, 403, cliTokenPayload.token);

  const source = await request('GET', `/projects/${project.id}/files/main.tex`);
  assert(source.includes('\\documentclass'), 'main.tex does not look like LaTeX source');

  const collaborators = await request('GET', `/projects/${project.id}/collaborators`);
  assert(collaborators.owner?.email === email, 'Collaborator owner email mismatch');
  assert(Array.isArray(collaborators.collaborators), 'Collaborators list missing');

  const collaboratorAuth = await request('POST', '/auth/register', {
    email: collaboratorEmail,
    password,
    name: 'Smoke Collaborator',
  }, '');
  assert(collaboratorAuth.user?.email === collaboratorEmail, 'Collaborator registration email mismatch');

  const addedCollaborator = await request('POST', `/projects/${project.id}/collaborators`, {
    email: collaboratorEmail,
    role: 'viewer',
  });
  assert(addedCollaborator.role === 'viewer', 'Collaborator viewer role mismatch');

  const sharedProjects = await request('GET', '/projects', undefined, collaboratorAuth.accessToken);
  assert(sharedProjects.some((item) => item.id === project.id && item.accessRole === 'viewer'), 'Shared project missing for viewer');

  const sharedDetail = await request('GET', `/projects/${project.id}`, undefined, collaboratorAuth.accessToken);
  assert(sharedDetail.accessRole === 'viewer', 'Shared project detail role mismatch');

  const updatedCollaborator = await request('PUT', `/projects/${project.id}/collaborators/${addedCollaborator.id}`, {
    role: 'editor',
  });
  assert(updatedCollaborator.role === 'editor', 'Collaborator editor role mismatch');

  const collaboratorFile = await request('POST', `/projects/${project.id}/files`, {
    path: 'collaborator-note.tex',
    content: '\\section{Collaborator note}\n',
  }, collaboratorAuth.accessToken);
  assert(collaboratorFile.path === 'collaborator-note.tex', 'Collaborator could not create file as editor');

  await request('DELETE', `/projects/${project.id}/collaborators/${addedCollaborator.id}`);
  const collaboratorsAfterRemove = await request('GET', `/projects/${project.id}/collaborators`);
  assert(!collaboratorsAfterRemove.collaborators.some((item) => item.id === addedCollaborator.id), 'Collaborator was not removed');

  await request('DELETE', `/projects/${project.id}/cli-token`);
  await expectRequestError('GET', `/projects/${project.id}/files`, undefined, 401, cliTokenPayload.token);

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
