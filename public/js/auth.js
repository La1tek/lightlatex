const Auth = {
  render(container) {
    container.innerHTML = `
      <div class="auth-page" id="auth-page"></div>
    `;
    this.renderLogin();
  },

  renderLogin() {
    const page = document.getElementById('auth-page');
    page.innerHTML = `
      <div class="auth-card">
        <h1>📝 LightTeX</h1>
        <p class="subtitle">Lightweight LaTeX Editor</p>
        <h2>Sign In</h2>
        <div class="error-msg" id="auth-error"></div>
        <form id="login-form">
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="login-email" required placeholder="you@example.com" autocomplete="email">
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="login-password" required placeholder="••••••••" autocomplete="current-password">
          </div>
          <button type="submit" class="btn btn-primary">Sign In</button>
        </form>
        <div class="auth-link">
          Don't have an account? <a id="show-register">Create one</a>
        </div>
      </div>
    `;

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const errEl = document.getElementById('auth-error');
      try {
        const result = await api.post('/auth/login', { email, password });
        api.setTokens(result.accessToken, result.refreshToken);
        window.location.hash = '#/';
      } catch (err) {
        errEl.textContent = err.message || 'Login failed';
      }
    });

    document.getElementById('show-register').addEventListener('click', () => this.renderRegister());
  },

  renderRegister() {
    const page = document.getElementById('auth-page');
    page.innerHTML = `
      <div class="auth-card">
        <h1>📝 LightTeX</h1>
        <p class="subtitle">Lightweight LaTeX Editor</p>
        <h2>Create Account</h2>
        <div class="error-msg" id="auth-error"></div>
        <form id="register-form">
          <div class="form-group">
            <label>Name (optional)</label>
            <input type="text" id="reg-name" placeholder="Your name" autocomplete="name">
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="reg-email" required placeholder="you@example.com" autocomplete="email">
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="reg-password" required placeholder="Min 6 characters" autocomplete="new-password">
          </div>
          <button type="submit" class="btn btn-primary">Create Account</button>
        </form>
        <div class="auth-link">
          Already have an account? <a id="show-login">Sign in</a>
        </div>
      </div>
    `;

    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('reg-name').value;
      const email = document.getElementById('reg-email').value;
      const password = document.getElementById('reg-password').value;
      const errEl = document.getElementById('auth-error');
      try {
        const result = await api.post('/auth/register', { email, password, name });
        api.setTokens(result.accessToken, result.refreshToken);
        window.location.hash = '#/';
      } catch (err) {
        errEl.textContent = err.message || 'Registration failed';
      }
    });

    document.getElementById('show-login').addEventListener('click', () => this.renderLogin());
  }
};
