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

  // Render the dev OTP code returned by the mock email provider so the user
  // can finish the flow without a real inbox. The banner is only shown when
  // the backend explicitly returns dev_code (i.e. mock provider).
  const showDevCode = (code) => {
    if (!otp || !code) return;
    let banner = document.getElementById('otp-dev-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'otp-dev-banner';
      banner.className = 'dev-otp-banner';
      const slot = otp.querySelector('.alert-slot') || otp.firstElementChild;
      slot.parentNode.insertBefore(banner, slot.nextSibling);
    }
    banner.innerHTML = `
      <strong>Dev mode</strong>
      <p>No email provider configured — your code is <code class="dev-otp-code">${code}</code></p>
      <button type="button" class="dev-otp-fill">Use this code</button>
    `;
    banner.querySelector('.dev-otp-fill').addEventListener('click', () => {
      const input = document.getElementById('otp-code');
      if (input) { input.value = code; input.focus(); }
    });
  };

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
        const out = await Lexora.api('/api/auth/signup', { method: 'POST', body: { email, name, password: pwd } });
        pendingEmail = email;
        pendingPassword = pwd;
        // swap forms
        reg.classList.add('hide');
        otp.classList.remove('hide');
        const slot = document.getElementById('otp-email-slot');
        if (slot) slot.textContent = email;
        showDevCode(out && out.dev_code);
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
        const out = await Lexora.api('/api/auth/signup', {
          method: 'POST',
          body: { email: pendingEmail, name: pendingEmail.split('@')[0], password: pendingPassword },
        });
        showAlert(otp, 'ok', 'A new code has been sent.');
        showDevCode(out && out.dev_code);
      } catch (err) {
        showAlert(otp, 'err', err.message || 'Could not resend code.');
      }
    });
  }

  // ============== SIGNIN ==============
  const log = document.getElementById('login-form');
  if (log) {
    // Pre-fill email + remember-me from the last successful sign-in.
    const remembered = Lexora.rememberedEmail.get();
    if (remembered) {
      const emailInput = log.querySelector('input[name="email"]');
      const remCheckbox = log.querySelector('input[name="remember"]');
      if (emailInput && !emailInput.value) emailInput.value = remembered;
      if (remCheckbox) remCheckbox.checked = true;
    }

    log.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert(log);
      const fd = new FormData(log);
      const email = (fd.get('email') || '').toString().trim().toLowerCase();
      const pwd = (fd.get('password') || '').toString();
      const remember = !!fd.get('remember');
      if (!email || !pwd) return showAlert(log, 'err', 'Email and password are required.');
      const btn = log.querySelector('button[type=submit]');
      if (btn) btn.disabled = true;
      try {
        const out = await Lexora.api('/api/auth/signin', {
          method: 'POST', body: { email, password: pwd },
        });
        Lexora.token.set(out.token, remember);
        Lexora.profile.set(out.user, remember);
        if (remember) Lexora.rememberedEmail.set(email);
        else Lexora.rememberedEmail.clear();
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
