const API_BASE = '/api';

class Api {
  constructor() {
    this.token = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
  }

  setTokens(access, refresh) {
    this.token = access;
    this.refreshToken = refresh;
    localStorage.setItem('accessToken', access);
    if (refresh) localStorage.setItem('refreshToken', refresh);
  }

  clearTokens() {
    this.token = null;
    this.refreshToken = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  get isAuthenticated() {
    return !!this.token;
  }

  async request(method, path, body = null, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
      ...options,
    });

    if (res.status === 401 && this.refreshToken && !path.includes('/auth/refresh')) {
      try {
        const refreshed = await this.request('POST', '/auth/refresh', { refreshToken: this.refreshToken }, { skipRetry: true });
        this.setTokens(refreshed.accessToken, refreshed.refreshToken);
        headers['Authorization'] = `Bearer ${this.token}`;
        const retryRes = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : null });
        if (!retryRes.ok) await this.throwResponseError(retryRes);
        return retryRes;
      } catch {
        this.clearTokens();
        window.location.hash = '#/login';
        throw new Error('Session expired');
      }
    }

    if (!res.ok) await this.throwResponseError(res);
    return res;
  }

  async throwResponseError(res) {
    const text = await res.text();
    try {
      const payload = JSON.parse(text);
      throw new Error(payload.error || payload.message || `Request failed (${res.status})`);
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(text || `Request failed (${res.status})`);
      }
      throw err;
    }
  }

  async get(path) {
    const res = await this.request('GET', path);
    return res.json();
  }

  async post(path, body) {
    const res = await this.request('POST', path, body);
    const text = await res.text();
    try { return JSON.parse(text); } catch { return text; }
  }

  async put(path, body) {
    const res = await this.request('PUT', path, body);
    return res.json();
  }

  async del(path) {
    const res = await this.request('DELETE', path);
    return res.json();
  }

  async upload(path, file) {
    const formData = new FormData();
    formData.append('zip', file);
    const headers = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: formData });
    return res.json();
  }

  async download(path) {
    const headers = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`${API_BASE}${path}`, { headers });
    if (!res.ok) throw new Error('Download failed');
    return res.blob();
  }
}

const api = new Api();
