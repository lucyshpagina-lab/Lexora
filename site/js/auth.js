// Lexora — auth: signup with OTP confirmation, signin (real backend),
// forgot-password (still local mock — no backend endpoint yet).
(() => {
  'use strict';

  const showAlert = (form, kind, msg) => {
    const slot = form.querySelector('.alert-slot');
    if (!slot) return;
    slot.innerHTML = `<div class="alert alert--${kind}">${msg}</div>`;
  };
  const clearAlert = (form) => {
    const slot = form.querySelector('.alert-slot');
    if (slot) slot.innerHTML = '';
  };

  // ============== SIGNUP — step 1: send OTP ==============
  const reg = document.getElementById('register-form');
  const otp = document.getElementById('otp-form');
  let pendingEmail = '';
  let pendingPassword = '';

  if (reg) {
    reg.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert(reg);
      const fd = new FormData(reg);
      const name = (fd.get('name') || '').toString().trim();
      const email = (fd.get('email') || '').toString().trim().toLowerCase();
      const pwd = (fd.get('password') || '').toString();
      const pwd2 = (fd.get('confirm') || '').toString();
      if (!name || !email || !pwd) return showAlert(reg, 'err', 'All fields are required.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showAlert(reg, 'err', 'Please enter a valid email.');
      if (pwd.length < 8) return showAlert(reg, 'err', 'Password must be at least 8 characters.');
      if (pwd !== pwd2) return showAlert(reg, 'err', 'Passwords do not match.');

      const btn = reg.querySelector('button[type=submit]');
      if (btn) btn.disabled = true;
      try {
        await Lexora.api('/api/auth/signup', { method: 'POST', body: { email, name, password: pwd } });
        pendingEmail = email;
        pendingPassword = pwd;
        // swap forms
        reg.classList.add('hide');
        otp.classList.remove('hide');
        const slot = document.getElementById('otp-email-slot');
        if (slot) slot.textContent = email;
        document.getElementById('otp-code')?.focus();
      } catch (err) {
        if (err.status === 409) {
          showAlert(reg, 'err', 'An account with that email already exists. <a href="signin.html">Sign in</a>.');
        } else {
          showAlert(reg, 'err', err.message || 'Could not create account.');
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  // ============== SIGNUP — step 2: verify OTP, auto-login ==============
  if (otp) {
    otp.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert(otp);
      const code = (new FormData(otp).get('code') || '').toString().trim();
      if (!/^\d{4,8}$/.test(code)) return showAlert(otp, 'err', 'Enter the numeric code from your email.');
      const btn = otp.querySelector('button[type=submit]');
      if (btn) btn.disabled = true;
      try {
        const out = await Lexora.api('/api/auth/verify-otp', {
          method: 'POST', body: { email: pendingEmail, code },
        });
        Lexora.token.set(out.token);
        Lexora.profile.set(out.user);
        showAlert(otp, 'ok', 'Welcome to Lexora. Redirecting…');
        setTimeout(() => location.href = 'profile.html', 500);
      } catch (err) {
        showAlert(otp, 'err', err.message || 'Could not confirm code.');
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    document.getElementById('otp-resend')?.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!pendingEmail || !pendingPassword) {
        showAlert(otp, 'err', 'Please restart sign-up.');
        return;
      }
      clearAlert(otp);
      try {
        // signup with the same details re-issues an OTP for unverified accounts.
        await Lexora.api('/api/auth/signup', {
          method: 'POST',
          body: { email: pendingEmail, name: pendingEmail.split('@')[0], password: pendingPassword },
        });
        showAlert(otp, 'ok', 'A new code has been sent.');
      } catch (err) {
        showAlert(otp, 'err', err.message || 'Could not resend code.');
      }
    });
  }

  // ============== SIGNIN ==============
  const log = document.getElementById('login-form');
  if (log) {
    log.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert(log);
      const fd = new FormData(log);
      const email = (fd.get('email') || '').toString().trim().toLowerCase();
      const pwd = (fd.get('password') || '').toString();
      if (!email || !pwd) return showAlert(log, 'err', 'Email and password are required.');
      const btn = log.querySelector('button[type=submit]');
      if (btn) btn.disabled = true;
      try {
        const out = await Lexora.api('/api/auth/signin', {
          method: 'POST', body: { email, password: pwd },
        });
        Lexora.token.set(out.token);
        Lexora.profile.set(out.user);
        showAlert(log, 'ok', 'Signed in. Taking you to your profile…');
        setTimeout(() => location.href = 'profile.html', 400);
      } catch (err) {
        if (err.status === 403) {
          showAlert(log, 'err', 'Email not yet confirmed. <a href="register.html">Finish signing up</a>.');
        } else {
          showAlert(log, 'err', err.message || 'Could not sign in.');
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  // ============== FORGOT PASSWORD (mock — no backend yet) ==============
  // Note: kept as a localStorage-only mock until a /api/auth/forgot-password
  // endpoint exists. The page is reachable from signin.html.
  const fp = document.getElementById('forgot-form');
  if (fp) {
    fp.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = (new FormData(fp).get('email') || '').toString().trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showAlert(fp, 'err', 'Please enter a valid email.');
      showAlert(fp, 'ok', `If an account exists for ${email}, a reset link has been sent. Check your inbox.`);
    });
  }
})();
