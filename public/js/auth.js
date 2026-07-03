const Auth = {
  render(container) {
    container.innerHTML = `
      <div class="auth-page" id="auth-page"></div>
    `;
    this.renderLogin();
  },

  sidePanel() {
    const host = window.location.host || 'self-hosted instance';
    return `
      <aside class="auth-side" aria-label="LightTeX instance information">
        <div class="auth-side-panel">
          <div class="auth-side-logo">${Icons.logo}</div>
          <h3>LightTeX</h3>
          <p>A compact LaTeX workspace for self-hosted writing, compilation, project files, PDF preview, snapshots, and CLI sync.</p>
          <div class="auth-footer">${this.escapeHtml(host)} · v0.4.0</div>
        </div>
      </aside>
    `;
  },

  renderLogin() {
    const page = document.getElementById('auth-page');
    page.innerHTML = `
      <main class="auth-card" aria-labelledby="auth-title">
        <h1 class="brand">${Icons.logo} LightTeX</h1>
        <p class="subtitle">Self-hosted LaTeX workspace</p>
        <h2 id="auth-title">Sign in</h2>
        <div class="error-msg" id="auth-error" role="alert" aria-live="polite"></div>
        <form id="login-form" novalidate>
          <div class="form-group">
            <label for="login-email">${Icons.email} Email</label>
            <input type="email" id="login-email" required placeholder="you@example.com" autocomplete="email">
          </div>
          <div class="form-group">
            <label for="login-password">${Icons.lock} Password</label>
            <div class="password-field">
              <input type="password" id="login-password" required placeholder="Min 6 characters" autocomplete="current-password">
              <button type="button" class="btn-icon password-toggle" id="login-toggle-pw" title="Show password" aria-label="Show password">${Icons.eye}</button>
            </div>
          </div>
          <div class="auth-row">
            <label class="check-row"><input type="checkbox" id="login-remember"> Remember me</label>
            <a id="forgot-password">Forgot password?</a>
          </div>
          <button type="submit" class="btn btn-primary" id="login-submit">Sign in</button>
        </form>
        <div class="auth-link">
          Don't have an account? <a id="show-register">Register</a>
        </div>
      </main>
      ${this.sidePanel()}
    `;

    this.setupPasswordToggle('login-password', 'login-toggle-pw');

    document.getElementById('forgot-password').addEventListener('click', () => {
      document.getElementById('auth-error').textContent = 'Password reset is not configured on this server.';
    });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const errEl = document.getElementById('auth-error');
      const submit = document.getElementById('login-submit');
      errEl.textContent = '';

      if (!email || !password) {
        errEl.textContent = 'Email and password are required.';
        return;
      }

      try {
        submit.disabled = true;
        submit.textContent = 'Signing in...';
        const result = await api.post('/auth/login', { email, password });
        api.setTokens(result.accessToken, result.refreshToken);
        window.location.hash = this.nextHashAfterAuth();
      } catch (err) {
        errEl.textContent = err.message || 'Login failed';
      } finally {
        submit.disabled = false;
        submit.textContent = 'Sign in';
      }
    });

    document.getElementById('show-register').addEventListener('click', () => this.renderRegister());
  },

  renderRegister() {
    const page = document.getElementById('auth-page');
    page.innerHTML = `
      <main class="auth-card" aria-labelledby="auth-title">
        <h1 class="brand">${Icons.logo} LightTeX</h1>
        <p class="subtitle">Self-hosted LaTeX workspace</p>
        <h2 id="auth-title">Create account</h2>
        <div class="error-msg" id="auth-error" role="alert" aria-live="polite"></div>
        <form id="register-form" novalidate>
          <div class="form-group">
            <label for="reg-name">${Icons.user} Name</label>
            <input type="text" id="reg-name" placeholder="Your name" autocomplete="name">
          </div>
          <div class="form-group">
            <label for="reg-email">${Icons.email} Email</label>
            <input type="email" id="reg-email" required placeholder="you@example.com" autocomplete="email">
          </div>
          <div class="form-group">
            <label for="reg-password">${Icons.lock} Password</label>
            <div class="password-field">
              <input type="password" id="reg-password" required placeholder="Min 6 characters" autocomplete="new-password">
              <button type="button" class="btn-icon password-toggle" id="reg-toggle-pw" title="Show password" aria-label="Show password">${Icons.eye}</button>
            </div>
            <div class="strength-meter" id="password-strength" data-strength="0" aria-hidden="true">
              <span></span><span></span><span></span><span></span>
            </div>
          </div>
          <div class="form-group">
            <label for="reg-confirm">${Icons.lock} Confirm password</label>
            <input type="password" id="reg-confirm" required placeholder="Repeat password" autocomplete="new-password">
          </div>
          <div class="auth-row">
            <label class="check-row"><input type="checkbox" id="reg-terms"> I accept this server's usage terms</label>
          </div>
          <button type="submit" class="btn btn-primary" id="register-submit">Create account</button>
        </form>
        <div class="auth-link">
          Already have an account? <a id="show-login">Sign in</a>
        </div>
      </main>
      ${this.sidePanel()}
    `;

    this.setupPasswordToggle('reg-password', 'reg-toggle-pw');

    document.getElementById('reg-password').addEventListener('input', (e) => {
      document.getElementById('password-strength').dataset.strength = String(this.passwordStrength(e.target.value));
    });

    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('reg-name').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;
      const confirm = document.getElementById('reg-confirm').value;
      const terms = document.getElementById('reg-terms').checked;
      const errEl = document.getElementById('auth-error');
      const submit = document.getElementById('register-submit');
      errEl.textContent = '';

      if (!email || !password) {
        errEl.textContent = 'Email and password are required.';
        return;
      }
      if (password.length < 6) {
        errEl.textContent = 'Password must be at least 6 characters.';
        return;
      }
      if (password !== confirm) {
        errEl.textContent = 'Passwords do not match.';
        return;
      }
      if (!terms) {
        errEl.textContent = 'Please accept this server usage terms.';
        return;
      }

      try {
        submit.disabled = true;
        submit.textContent = 'Creating account...';
        const result = await api.post('/auth/register', { email, password, name });
        api.setTokens(result.accessToken, result.refreshToken);
        window.location.hash = this.nextHashAfterAuth();
      } catch (err) {
        errEl.textContent = err.message || 'Registration failed';
      } finally {
        submit.disabled = false;
        submit.textContent = 'Create account';
      }
    });

    document.getElementById('show-login').addEventListener('click', () => this.renderLogin());
  },

  setupPasswordToggle(inputId, toggleId) {
    const input = document.getElementById(inputId);
    const toggle = document.getElementById(toggleId);
    let visible = false;
    toggle.addEventListener('click', () => {
      visible = !visible;
      input.type = visible ? 'text' : 'password';
      toggle.innerHTML = visible ? Icons.eyeOff : Icons.eye;
      toggle.title = visible ? 'Hide password' : 'Show password';
      toggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    });
  },

  passwordStrength(value) {
    let score = 0;
    if (value.length >= 6) score++;
    if (value.length >= 10) score++;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
    if (/\d|[^A-Za-z]/.test(value)) score++;
    return Math.min(score, 4);
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  nextHashAfterAuth() {
    const pendingInvite = localStorage.getItem('pendingProjectInvite');
    if (pendingInvite) return `#/invite/${encodeURIComponent(pendingInvite)}`;
    return '#/';
  },
};
