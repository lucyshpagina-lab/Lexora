// Lexora — auth (mock, localStorage-only). Replace with a real backend later.
(() => {
  'use strict';

  const showAlert = (form, kind, msg) => {
    const slot = form.querySelector('.alert-slot');
    if (!slot) return;
    slot.innerHTML = `<div class="alert alert--${kind}">${msg}</div>`;
  };

  // ============== register ==============
  const reg = document.getElementById('register-form');
  if (reg) {
    reg.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(reg);
      const name = (fd.get('name') || '').toString().trim();
      const email = (fd.get('email') || '').toString().trim().toLowerCase();
      const pwd = (fd.get('password') || '').toString();
      const pwd2 = (fd.get('confirm') || '').toString();
      if (!name || !email || !pwd) return showAlert(reg, 'err', 'All fields are required.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showAlert(reg, 'err', 'Please enter a valid email.');
      if (pwd.length < 8) return showAlert(reg, 'err', 'Password must be at least 8 characters.');
      if (pwd !== pwd2) return showAlert(reg, 'err', 'Passwords do not match.');

      const users = Lexora.getUsers();
      if (users[email]) return showAlert(reg, 'err', 'An account with that email already exists.');
      users[email] = { email, name, pwd: Lexora.hash(pwd), created: Date.now() };
      Lexora.saveUsers(users);
      Lexora.setUser({ email, name });
      showAlert(reg, 'ok', 'Welcome aboard. Redirecting to your dashboard…');
      setTimeout(() => location.href = 'dashboard.html', 600);
    });
  }

  // ============== login ==============
  const log = document.getElementById('login-form');
  if (log) {
    log.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(log);
      const email = (fd.get('email') || '').toString().trim().toLowerCase();
      const pwd = (fd.get('password') || '').toString();
      if (!email || !pwd) return showAlert(log, 'err', 'Email and password are required.');
      const users = Lexora.getUsers();
      const u = users[email];
      if (!u || u.pwd !== Lexora.hash(pwd)) return showAlert(log, 'err', 'Email or password is incorrect.');
      Lexora.setUser({ email: u.email, name: u.name });
      showAlert(log, 'ok', 'Logged in. Taking you to your dashboard…');
      setTimeout(() => location.href = 'dashboard.html', 400);
    });
  }

  // ============== forgot password (mock) ==============
  const fp = document.getElementById('forgot-form');
  if (fp) {
    fp.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(fp);
      const email = (fd.get('email') || '').toString().trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showAlert(fp, 'err', 'Please enter a valid email.');
      const users = Lexora.getUsers();
      // Don't leak whether the account exists — show the same message either way.
      showAlert(fp, 'ok', `If an account exists for ${email}, a reset link has been sent. Check your inbox.`);
      // Demo-only: if the account exists, show the local reset form
      if (users[email]) {
        const reset = document.getElementById('reset-block');
        const slotEmail = document.getElementById('reset-email');
        if (reset && slotEmail) { slotEmail.textContent = email; reset.classList.remove('hide'); }
      }
    });
  }

  const reset = document.getElementById('reset-form');
  if (reset) {
    reset.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(reset);
      const email = (document.getElementById('reset-email')?.textContent || '').trim();
      const pwd = (fd.get('password') || '').toString();
      const pwd2 = (fd.get('confirm') || '').toString();
      if (pwd.length < 8) return showAlert(reset, 'err', 'Password must be at least 8 characters.');
      if (pwd !== pwd2) return showAlert(reset, 'err', 'Passwords do not match.');
      const users = Lexora.getUsers();
      if (!users[email]) return showAlert(reset, 'err', 'Reset link expired. Please request a new one.');
      users[email].pwd = Lexora.hash(pwd);
      Lexora.saveUsers(users);
      showAlert(reset, 'ok', 'Password updated. Redirecting to sign in…');
      setTimeout(() => location.href = 'login.html', 600);
    });
  }
})();
