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
        <div class="admin-header">
          <h1>${Icons.settings} Admin Panel</h1>
          <div style="display:flex;gap:8px;align-items:center">
            <a href="#/" class="btn btn-secondary btn-small">${Icons.backArrow16} Dashboard</a>
            <button class="btn-icon" id="toggle-theme-btn" title="Toggle theme">${theme === 'dark' ? Icons.moon16 : Icons.sun16}</button>
          </div>
        </div>
        <div class="admin-content">
          <div class="admin-section">
            <h2>System Stats</h2>
            <div id="admin-stats" class="stats-grid"><div class="empty-state"><p>Loading...</p></div></div>
          </div>
          <div class="admin-section">
            <h2>Users</h2>
            <div id="admin-users"><div class="empty-state"><p>Loading...</p></div></div>
          </div>
          <div class="admin-section">
            <h2>Backup & Restore</h2>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <button class="btn btn-primary" id="backup-btn">${Icons.download16} Create Backup</button>
              <button class="btn btn-secondary" id="restore-btn">${Icons.upload16} Restore Backup</button>
            </div>
            <input type="file" id="restore-file" accept=".tar.gz" style="display:none">
          </div>
        </div>
      </div>
    `;

    document.getElementById('toggle-theme-btn').addEventListener('click', () => {
      const current = document.documentElement.dataset.theme;
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('theme', next);
    });

    document.getElementById('backup-btn').addEventListener('click', () => this.backup());
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
    await this.loadUsers();
  },

  async loadStats() {
    const el = document.getElementById('admin-stats');
    try {
      const stats = await api.get('/admin/stats');
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

// Check if we're on /admin route
if (window.location.pathname === '/admin') {
  document.addEventListener('DOMContentLoaded', () => Admin.init());
}
