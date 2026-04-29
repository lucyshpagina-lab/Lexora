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
  const buildAppHref = (sid) => `${APP_BASE}#user_id=${encodeURIComponent(sid)}`;

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

  document.querySelector('[data-action="change-password"]')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const result = await Lexora.promptModal({
      title: 'Reset password',
      message: 'Enter a new password — no need to remember the old one.',
      fields: [
        { name: 'new_password', label: 'New password', type: 'password', minLength: 8, placeholder: 'min 8 characters', autocomplete: 'new-password' },
      ],
      confirmLabel: 'Update password',
    });
    if (!result) return;
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

  const renderLangList = () => {
    if (!langList) return;
    const all = DEFAULT_LANGUAGES.concat(customLanguages.filter((l) => !DEFAULT_LANGUAGES.includes(l)))
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
  setStartVisible(false);

  const handleFile = async (file) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      showStatus('err', 'Only PDF files are accepted (e.g. my_vocabulary.pdf).');
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
    const result = await Lexora.promptModal({
      title: 'Read from Google Drive',
      message: 'Paste the Drive file ID of your my_vocabulary.pdf. ' +
               'You can find it in the share URL after /d/.',
      fields: [{
        name: 'file_id', label: 'Drive file ID',
        placeholder: 'e.g. 1A2b3C4d5E6f7G8h9I0jK', minLength: 8,
      }],
      confirmLabel: 'Fetch from Drive',
    });
    if (!result) return;
    const fileId = (result.file_id || '').trim();
    if (!fileId) return;
    showStatus('ok', `Asking the Drive MCP server for <code>${escapeHtml(fileId)}</code>…`);
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
