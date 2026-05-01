// Lexora — profile page logic.
// Handles: auth gate, avatar dropdown, language picker (+ custom add),
// vocabulary upload (PDF only — local + Drive mock).
(() => {
  'use strict';

  const profile = Lexora.requireAuthOrRedirect('signin.html');
  if (!profile) return;

  // ---- header: name + avatar + dropdown ------------------------------------

  const nameSlot = document.querySelector('[data-profile-name]');
  if (nameSlot) nameSlot.textContent = profile.name || profile.email;

  const avatarImg = document.querySelector('[data-profile-avatar]');
  if (avatarImg && profile.avatar_url) {
    avatarImg.src = Lexora.absoluteApiUrl(profile.avatar_url);
  }

  // dropdown toggle
  const menu = document.querySelector('.profile-menu');
  if (menu) {
    const trigger = menu.querySelector('.profile-menu__trigger');
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle('is-open');
      trigger.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target)) {
        menu.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) {
        menu.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.focus();
      }
    });
  }

  // ---- dropdown actions ----------------------------------------------------

  const avatarInput = document.getElementById('avatar-input');
  document.querySelector('[data-action="upload-avatar"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    avatarInput?.click();
  });
  avatarInput?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('err', 'Avatar too large (max 2 MB).'); return; }
    const fd = new FormData();
    fd.append('file', file);
    try {
      const out = await Lexora.api('/api/auth/avatar', { method: 'POST', body: fd });
      profile.avatar_url = out.avatar_url;
      Lexora.profile.set(profile);
      if (avatarImg) {
        // Cache-bust so the new image is fetched even though the URL didn't change.
        avatarImg.src = Lexora.absoluteApiUrl(out.avatar_url) + '?v=' + Date.now();
      }
      showToast('ok', 'Avatar updated.');
    } catch (err) {
      showToast('err', err.message || 'Could not upload avatar.');
    }
  });

  const APP_BASE = 'http://127.0.0.1:8000/app/';
  const buildAppHref = (sid) => {
    // Pass the JWT through the URL fragment so the React app on a different
    // origin can hydrate its own auth state. Fragments are not sent to the
    // server, so this stays local to the browser.
    const token = Lexora.token.get();
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
    return `${APP_BASE}#user_id=${encodeURIComponent(sid)}${tokenParam}`;
  };

  const continueLink = document.querySelector('[data-action="continue"]');
  const continueItem = continueLink?.closest('li');
  const setContinueVisible = (visible) => { if (continueItem) continueItem.hidden = !visible; };
  setContinueVisible(Boolean(profile.session_id));

  continueLink?.addEventListener('click', (e) => {
    e.preventDefault();
    if (profile.session_id) {
      location.href = buildAppHref(profile.session_id);
    } else {
      document.getElementById('vocab-section')?.scrollIntoView({ behavior: 'smooth' });
    }
  });

  // History → open the React app with the History view active.
  document.querySelector('[data-action="history"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    const sid = profile.session_id || '';
    const token = Lexora.token.get();
    const params = [];
    if (sid) params.push(`user_id=${encodeURIComponent(sid)}`);
    if (token) params.push(`token=${encodeURIComponent(token)}`);
    params.push('view=history');
    location.href = `${APP_BASE}#${params.join('&')}`;
  });

  // Auto-trigger change-password / delete-account when arrived from the
  // React app's Lucy menu via ?action=… query param.
  const _action = new URL(location.href).searchParams.get('action');
  if (_action === 'change-password' || _action === 'delete-account') {
    // Strip the param so refreshing doesn't re-trigger the modal.
    history.replaceState(null, '', location.pathname);
    setTimeout(() => {
      document.querySelector(`[data-action="${_action}"]`)?.click();
    }, 60);
  }

  document.querySelector('[data-action="change-password"]')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const result = await Lexora.promptModal({
      title: 'Reset password',
      message: 'Enter a new password — exactly 8 characters, letters and digits only.',
      fields: [
        { name: 'new_password', label: 'New password', type: 'password', minLength: 8, maxLength: 8, pattern: '^[A-Za-z0-9]{8}$', placeholder: '8 letters or digits', autocomplete: 'new-password' },
      ],
      confirmLabel: 'Update password',
    });
    if (!result) return;
    if (!/^[A-Za-z0-9]{8}$/.test(result.new_password || '')) {
      await Lexora.alertModal({
        title: 'Invalid password',
        message: 'Password must be exactly 8 characters — letters and digits only.',
        kind: 'danger',
      });
      return;
    }
    try {
      await Lexora.api('/api/auth/reset-password', {
        method: 'POST', body: { new_password: result.new_password },
      });
      await Lexora.alertModal({ title: 'Password updated', message: 'Your new password is now in effect.' });
    } catch (err) {
      await Lexora.alertModal({ title: 'Could not update password', message: err.message || 'Please try again.', kind: 'danger' });
    }
  });

  document.querySelector('[data-action="delete-account"]')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const ok = await Lexora.confirmModal({
      title: 'Delete account',
      message: 'Delete your account permanently? This cannot be undone.',
      confirmLabel: 'Delete account',
      danger: true,
    });
    if (!ok) return;
    try {
      await Lexora.api('/api/auth/me', { method: 'DELETE' });
      Lexora.token.clear();
      Lexora.profile.clear();
      await Lexora.alertModal({ title: 'Account deleted', message: 'Your account and data have been removed. Goodbye for now.' });
      location.href = 'index.html';
    } catch (err) {
      await Lexora.alertModal({ title: 'Could not delete account', message: err.message || 'Please try again.', kind: 'danger' });
    }
  });

  document.querySelector('[data-action="signout"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    Lexora.signOut();
  });

  // ---- language picker -----------------------------------------------------

  const DEFAULT_LANGUAGES = ['English', 'French'];

  const langDropdown = document.getElementById('language-dropdown');
  const langButton = document.getElementById('language-button');
  const langList = document.getElementById('language-list');
  const langLabel = document.getElementById('language-current');

  let currentLang = profile.preferred_language || '';
  let customLanguages = Array.isArray(profile.custom_languages) ? profile.custom_languages.slice() : [];

  const updateLangButton = () => {
    if (langLabel) langLabel.textContent = currentLang || 'Pick your language';
  };
  updateLangButton();

  // Languages explicitly hidden from the picker even if the user once added
  // them as a custom language. Cheap blocklist; users can manage server-side
  // entries via the language API.
  const HIDDEN_LANGUAGES = new Set(['German']);

  const renderLangList = () => {
    if (!langList) return;
    const all = DEFAULT_LANGUAGES.concat(
        customLanguages.filter((l) => !DEFAULT_LANGUAGES.includes(l) && !HIDDEN_LANGUAGES.has(l))
      )
      .sort((a, b) => a.localeCompare(b));
    langList.innerHTML = all.map((lang) => `
      <li role="menuitem" data-lang="${escapeAttr(lang)}" class="${lang === currentLang ? 'is-active' : ''}">
        <span class="lang-leaf" aria-hidden="true">🌿</span>
        <span>${escapeHtml(lang)}</span>
      </li>
    `).join('') + `
      <li role="menuitem" data-action="add-language" class="add-language">
        <span aria-hidden="true">+</span>
        <span>Add another language</span>
      </li>
    `;

    langList.querySelectorAll('li[data-lang]').forEach((li) => li.addEventListener('click', async (e) => {
      e.stopPropagation();
      const lang = li.getAttribute('data-lang');
      currentLang = lang;
      updateLangButton();
      langDropdown.classList.remove('is-open');
      try {
        await Lexora.api('/api/auth/language', { method: 'POST', body: { language: lang } });
        profile.preferred_language = lang;
        Lexora.profile.set(profile);
        showVocabSection();
      } catch (err) {
        showToast('err', err.message || 'Could not save language.');
      }
    }));

    langList.querySelector('[data-action="add-language"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const result = await Lexora.promptModal({
        title: 'Add another language',
        message: 'What language would you like to learn?',
        fields: [{ name: 'lang', label: 'Language', placeholder: 'e.g. Sindarin' }],
        confirmLabel: 'Add language',
      });
      if (!result) return;
      const trimmed = (result.lang || '').trim();
      if (!trimmed) return;
      try {
        const out = await Lexora.api('/api/auth/language/custom', {
          method: 'POST', body: { language: trimmed },
        });
        customLanguages = out.custom_languages || customLanguages.concat([trimmed]);
        profile.custom_languages = customLanguages;
        Lexora.profile.set(profile);
        renderLangList();
        showToast('ok', `Added ${trimmed}.`);
      } catch (err) {
        showToast('err', err.message || 'Could not add language.');
      }
    });
  };
  renderLangList();

  langButton?.addEventListener('click', (e) => {
    e.stopPropagation();
    langDropdown.classList.toggle('is-open');
  });
  document.addEventListener('click', (e) => {
    if (!langDropdown?.contains(e.target)) langDropdown?.classList.remove('is-open');
  });

  if (currentLang) showVocabSection();

  function showVocabSection() {
    document.getElementById('vocab-section')?.classList.remove('hide');
  }

  // ---- vocabulary upload (PDF only) ----------------------------------------

  const fileInput = document.getElementById('vocab-file');
  const dropZone = document.getElementById('vocab-drop');
  const driveBtn = document.getElementById('vocab-drive');
  const status = document.getElementById('vocab-status');
  const startBtn = document.getElementById('vocab-start');
  // Start your journey appears strictly after a successful upload in the
  // current page lifetime — persistence handled by "Continue learning".
  const setStartVisible = (visible, sessionId) => {
    if (!startBtn) return;
    startBtn.hidden = !visible;
    if (visible && sessionId) {
      startBtn.setAttribute('href', buildAppHref(sessionId));
    }
  };
  // Persist the "Start your journey" button across reloads: if the user
  // already has a saved session_id from a previous upload, the button is
  // visible immediately on page load, not just after a fresh upload.
  setStartVisible(Boolean(profile.session_id), profile.session_id);

  const REQUIRED_FILENAME = 'vocabulary.pdf';

  const handleFile = async (file) => {
    // Reset the input value so re-selecting the same file (after a fix)
    // still triggers a fresh `change` event, and stale "err" status from a
    // prior rejected pick doesn't carry over to a valid one.
    if (fileInput) fileInput.value = '';
    if (!file) return;
    // Strict gate: only accept a file literally named vocabulary.pdf.
    // Case-insensitive match, but no other names allowed (security).
    if (file.name.toLowerCase() !== REQUIRED_FILENAME) {
      showStatus('err', `File must be named <code>${REQUIRED_FILENAME}</code>. Rename your file and try again.`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showStatus('err', 'File too large (max 10 MB).');
      return;
    }
    showStatus('ok', `Uploading <strong>${escapeHtml(file.name)}</strong>…`);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('native_language', 'English');
    fd.append('target_language', currentLang || 'Spanish');
    try {
      const out = await Lexora.api('/api/upload', { method: 'POST', body: fd });
      // Persist the deck session id so future "continue learning" calls work.
      profile.session_id = out.user_id;
      Lexora.profile.set(profile);
      setContinueVisible(true);
      setStartVisible(true, out.user_id);
      const total = out.total;
      const parsed = out.parse_stats?.parsed ?? total;
      const lines = out.parse_stats?.total_lines;
      const ratio = lines ? ` (${parsed} of ${lines} lines)` : '';
      showStatus('ok',
        `Loaded <strong>${total}</strong> entr${total === 1 ? 'y' : 'ies'}` +
        ` from your vocabulary${ratio}. Ready to study.`
      );
    } catch (err) {
      showStatus('err', err.message || 'Could not upload file.');
    }
  };

  fileInput?.addEventListener('change', (e) => handleFile(e.target.files && e.target.files[0]));
  if (dropZone) {
    dropZone.addEventListener('click', () => fileInput?.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('is-drag'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-drag'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('is-drag');
      handleFile(e.dataTransfer.files && e.dataTransfer.files[0]);
    });
  }

  driveBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    // Open the user's actual Drive in a new tab so they can locate their
    // vocabulary.pdf and copy its share link / file ID.
    const driveWindow = window.open('https://drive.google.com/drive/my-drive', '_blank', 'noopener,noreferrer');
    if (!driveWindow) {
      showStatus('err', 'Google Drive not found. Please allow pop-ups or open <a href="https://drive.google.com" target="_blank" rel="noopener">drive.google.com</a> manually.');
      return;
    }
    const result = await Lexora.promptModal({
      title: 'Read from Google Drive',
      messageHtml: `
        <p>Your Drive opened in a new tab. Follow these steps:</p>
        <ol class="lex-modal__steps">
          <li>Find your <code>vocabulary.pdf</code> file in Drive.</li>
          <li>Right-click the file → <strong>Share</strong>.</li>
          <li>Under <strong>General access</strong>, choose
              <strong>Anyone with the link</strong> (role: Viewer).</li>
          <li>Click <strong>Copy link</strong>, then paste the link below.</li>
          <li>Press <strong>Fetch from Drive</strong>.</li>
        </ol>
        <p class="muted">You can paste the full share URL or just the file ID.</p>
      `,
      fields: [{
        name: 'file_id', label: 'Drive file URL or ID',
        placeholder: 'https://drive.google.com/file/d/1A2b… or 1A2b…',
        minLength: 8,
      }],
      confirmLabel: 'Fetch from Drive',
    });
    if (!result) return;
    const raw = (result.file_id || '').trim();
    if (!raw) return;
    // Accept either a full Drive URL (.../d/<id>/...) or a bare id.
    const m = raw.match(/[-\w]{20,}/);
    const fileId = m ? m[0] : raw;
    if (!/^[-\w]+$/.test(fileId)) {
      showStatus('err', 'That does not look like a Drive file ID.');
      return;
    }
    showStatus('ok', `Fetching <code>${escapeHtml(fileId)}</code> from Google Drive…`);
    try {
      const out = await Lexora.api('/api/upload/drive', {
        method: 'POST',
        body: {
          file_id: fileId,
          native_language: 'English',
          target_language: currentLang || 'English',
        },
      });
      profile.session_id = out.user_id;
      Lexora.profile.set(profile);
      setContinueVisible(true);
      setStartVisible(true, out.user_id);
      const total = out.total;
      const parsed = out.parse_stats?.parsed ?? total;
      const lines = out.parse_stats?.total_lines;
      const ratio = lines ? ` (${parsed} of ${lines} lines)` : '';
      showStatus('ok',
        `Loaded <strong>${total}</strong> entr${total === 1 ? 'y' : 'ies'}` +
        ` from Drive${ratio}. Ready to study.`
      );
    } catch (err) {
      showStatus('err', err.message || 'Could not fetch from Drive.');
    }
  });

  // ---- helpers -------------------------------------------------------------

  function showStatus(kind, html) {
    if (!status) return;
    status.innerHTML = `<div class="alert alert--${kind}">${html}</div>`;
  }

  function showToast(kind, msg) {
    let toast = document.getElementById('lexora-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'lexora-toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = `toast toast--${kind} is-shown`;
    setTimeout(() => toast.classList.remove('is-shown'), 3000);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }
})();
