// Admin Panel — /admin
const Admin = {
  async init() {
    if (!api.isAuthenticated) {
      window.location.hash = '#/login';
      return;
    }
    await this.load();
  },

  async load() {
    const app = document.getElementById('app');
    const theme = document.documentElement.dataset.theme;

    app.innerHTML = `
      <div class="admin-layout">
        <aside class="admin-sidebar">
          <h1 class="brand">${Icons.logo} LightTeX</h1>
          <nav>
            <a class="active" href="#overview">Overview</a>
            <a href="#health">Health</a>
            <a href="#users">Users</a>
            <a href="#audit">Audit</a>
            <a href="#backups">Backups</a>
            <a href="#settings">Settings</a>
          </nav>
        </aside>
        <main class="admin-main">
          <div class="admin-header">
            <h1>${Icons.settings} Admin panel</h1>
            <div style="display:flex;gap:8px;align-items:center">
              <a href="#/" class="btn btn-secondary btn-small">${Icons.backArrow16} Dashboard</a>
              <button class="btn-icon" id="toggle-theme-btn" title="Toggle theme" aria-label="Toggle theme">${theme === 'dark' ? Icons.moon16 : Icons.sun16}</button>
            </div>
          </div>
          <div class="admin-content">
            <section class="admin-section" id="overview">
              <h2>Overview</h2>
              <div id="admin-stats" class="stats-grid"><div class="empty-state"><p>Loading...</p></div></div>
            </section>
            <section class="admin-section" id="health">
              <div class="section-heading-row">
                <h2>Health</h2>
                <button class="btn btn-secondary btn-small" id="health-refresh">${Icons.clock14} Refresh</button>
              </div>
              <div id="admin-health"><div class="empty-state"><p>Loading...</p></div></div>
            </section>
            <section class="admin-section" id="users">
              <h2>Users</h2>
              <div id="admin-users"><div class="empty-state"><p>Loading...</p></div></div>
            </section>
            <section class="admin-section" id="audit">
              <div class="section-heading-row">
                <h2>Audit</h2>
                <button class="btn btn-secondary btn-small" id="audit-refresh">${Icons.clock14} Refresh</button>
              </div>
              <div id="admin-audit"><div class="empty-state"><p>Loading...</p></div></div>
            </section>
            <section class="admin-section" id="backups">
              <h2>Backups</h2>
              <div style="display:flex;gap:12px;flex-wrap:wrap">
                <button class="btn btn-primary" id="backup-btn">${Icons.download16} Create backup now</button>
                <button class="btn btn-secondary" id="restore-btn">${Icons.upload16} Restore backup</button>
              </div>
              <input type="file" id="restore-file" accept=".tar.gz" style="display:none">
            </section>
            <section class="admin-section" id="settings">
              <h2>Settings</h2>
              <p style="color:var(--text-secondary);font-size:13px">Server settings are configured through environment variables.</p>
            </section>
          </div>
        </main>
      </div>
    `;

    document.getElementById('toggle-theme-btn').addEventListener('click', () => {
      const current = document.documentElement.dataset.theme;
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('theme', next);
    });

    document.getElementById('backup-btn').addEventListener('click', () => this.backup());
    document.getElementById('health-refresh').addEventListener('click', () => this.loadHealth());
    document.getElementById('audit-refresh').addEventListener('click', () => this.loadAudit());
    document.getElementById('restore-btn').addEventListener('click', () => {
      document.getElementById('restore-file').click();
    });
    document.getElementById('restore-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm('Restore backup? This may overwrite existing data.')) return;
      try {
        const formData = new FormData();
        formData.append('backup', file);
        const res = await fetch('/api/admin/restore', {
          method: 'POST',
          headers: { Authorization: `Bearer ${api.token}` },
          body: formData,
        });
        const result = await res.json();
        if (res.ok) {
          alert('Backup restored! Restart recommended.');
          this.load();
        } else {
          alert('Restore failed: ' + (result.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Restore error: ' + err.message);
      }
    });

    await this.loadStats();
    await this.loadHealth();
    await this.loadUsers();
    await this.loadAudit();
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  },

  async loadStats() {
    const el = document.getElementById('admin-stats');
    try {
      const stats = await api.get('/admin/stats');
      if (stats.error) {
        el.innerHTML = `<div class="empty-state"><p>${stats.error}</p></div>`;
        return;
      }
      const mem = stats.systemStats?.memory || 'N/A';
      const cpu = stats.systemStats?.loadAvg || 'N/A';
      el.innerHTML = `
        <div class="stat-card">
          <div class="stat-value">${stats.users}</div>
          <div class="stat-label">Users</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.projects}</div>
          <div class="stat-label">Projects</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.diskUsageMB} MB</div>
          <div class="stat-label">Disk Usage</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="font-size:14px">${cpu}</div>
          <div class="stat-label">Load Average</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="font-size:12px">${mem}</div>
          <div class="stat-label">System Memory</div>
        </div>
      `;
    } catch (err) {
      el.innerHTML = `<div style="color:var(--error)">Failed to load stats: ${err.message}</div>`;
    }
  },

  async loadUsers() {
    const el = document.getElementById('admin-users');
    try {
      const users = await api.get('/admin/users');
      if (!Array.isArray(users)) {
        el.innerHTML = `<div class="empty-state"><p>${users.error || 'Could not load users'}</p></div>`;
        return;
      }
      if (users.length === 0) {
        el.innerHTML = '<div class="empty-state"><p>No users</p></div>';
        return;
      }
      el.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr style="border-bottom:1px solid var(--border-color);text-align:left">
            <th style="padding:8px">Email</th>
            <th style="padding:8px">Name</th>
            <th style="padding:8px">Projects</th>
            <th style="padding:8px">Last Login</th>
            <th style="padding:8px">Actions</th>
          </tr>
          ${users.map(u => `
            <tr style="border-bottom:1px solid var(--border-color)">
              <td style="padding:8px">${u.email}</td>
              <td style="padding:8px">${u.name || '—'}</td>
              <td style="padding:8px">${u.projectCount}</td>
              <td style="padding:8px">${u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never'}</td>
              <td style="padding:8px"><button class="btn btn-danger btn-small" data-del="${u.id}">${Icons.trash}</button></td>
            </tr>
          `).join('')}
        </table>
      `;
      el.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.del;
          if (!confirm('Delete this user and all their projects?')) return;
          await api.del('/admin/users/' + id);
          this.loadUsers();
          this.loadStats();
        });
      });
    } catch (err) {
      el.innerHTML = `<div style="color:var(--error)">Failed: ${err.message}</div>`;
    }
  },

  async loadHealth() {
    const el = document.getElementById('admin-health');
    try {
      const health = await api.get('/admin/health');
      if (health.error) {
        el.innerHTML = `<div class="empty-state"><p>${this.escapeHtml(health.error)}</p></div>`;
        return;
      }
      const statusClass = health.status === 'ok' ? 'success' : health.status === 'warning' ? 'warning' : 'error';
      el.innerHTML = `
        <div class="health-header-card ${statusClass}">
          <div>
            <strong>${this.escapeHtml(health.status.toUpperCase())}</strong>
            <span>Latency ${health.latencyMs}ms · Uptime ${Math.round(health.uptimeSec / 60)}m · v${this.escapeHtml(health.version)}</span>
          </div>
          <span>${this.escapeHtml(new Date().toLocaleString())}</span>
        </div>
        <div class="admin-health-grid">
          <section>
            <h3>Service Checks</h3>
            ${health.checks.map((check) => `
              <div class="health-row ${check.status}">
                <span>${this.escapeHtml(check.name)}</span>
                <strong>${this.escapeHtml(check.status)}</strong>
                <small>${this.escapeHtml(check.detail)}</small>
              </div>
            `).join('')}
          </section>
          <section>
            <h3>Compilers</h3>
            ${health.compilers.map((item) => `
              <div class="health-row ${item.status}">
                <span>${this.escapeHtml(item.compiler)}</span>
                <strong>${this.escapeHtml(item.status)}</strong>
                <small>${this.escapeHtml(item.path)}</small>
              </div>
            `).join('')}
          </section>
          <section>
            <h3>Quotas</h3>
            ${Object.entries(health.quotas).map(([key, value]) => `
              <div class="health-row">
                <span>${this.escapeHtml(key)}</span>
                <strong>${this.escapeHtml(value)}</strong>
                <small>environment</small>
              </div>
            `).join('')}
          </section>
          <section>
            <h3>Inventory</h3>
            ${Object.entries(health.metrics).map(([key, value]) => `
              <div class="health-row">
                <span>${this.escapeHtml(key)}</span>
                <strong>${this.escapeHtml(value)}</strong>
                <small>current</small>
              </div>
            `).join('')}
          </section>
        </div>
      `;
    } catch (err) {
      el.innerHTML = `<div style="color:var(--error)">Failed to load health: ${this.escapeHtml(err.message)}</div>`;
    }
  },

  async loadAudit() {
    const el = document.getElementById('admin-audit');
    try {
      const events = await api.get('/admin/audit?limit=100');
      if (!Array.isArray(events) || events.length === 0) {
        el.innerHTML = '<div class="empty-state"><p>No audit events yet.</p></div>';
        return;
      }
      el.innerHTML = `
        <table class="admin-table">
          <tr>
            <th>Time</th>
            <th>User</th>
            <th>Action</th>
            <th>Resource</th>
            <th>Metadata</th>
          </tr>
          ${events.map((event) => {
            let metadata = event.metadata || '';
            try {
              metadata = JSON.stringify(JSON.parse(metadata), null, 0);
            } catch {}
            return `
              <tr>
                <td>${this.escapeHtml(new Date(event.createdAt).toLocaleString())}</td>
                <td>${this.escapeHtml(event.userEmail || event.userId || 'system')}</td>
                <td><code>${this.escapeHtml(event.action)}</code></td>
                <td>${this.escapeHtml([event.resourceType, event.resourceId].filter(Boolean).join(':') || '—')}</td>
                <td class="audit-metadata">${this.escapeHtml(metadata || '—')}</td>
              </tr>
            `;
          }).join('')}
        </table>
      `;
    } catch (err) {
      el.innerHTML = `<div style="color:var(--error)">Failed to load audit log: ${this.escapeHtml(err.message)}</div>`;
    }
  },

  async backup() {
    try {
      const res = await fetch('/api/admin/backup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${api.token}` },
      });
      if (!res.ok) throw new Error('Backup failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lightlatex-backup.tar.gz';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Backup error: ' + err.message);
    }
  }
};
