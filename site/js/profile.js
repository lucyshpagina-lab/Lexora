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
  if (avatarImg) {
    if (profile.avatar_path) {
      // Backend returns a server-side path — surface as best-effort image.
      avatarImg.src = profile.avatar_path;
    }
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
      profile.avatar_path = out.avatar_path;
      Lexora.profile.set(profile);
      if (avatarImg) avatarImg.src = out.avatar_path;
      showToast('ok', 'Avatar updated.');
    } catch (err) {
      showToast('err', err.message || 'Could not upload avatar.');
    }
  });

  document.querySelector('[data-action="continue"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('vocab-section')?.scrollIntoView({ behavior: 'smooth' });
  });

  document.querySelector('[data-action="change-password"]')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const oldp = prompt('Current password:');
    if (oldp == null) return;
    const newp = prompt('New password (min 8 chars):');
    if (newp == null) return;
    if (newp.length < 8) { showToast('err', 'Password must be at least 8 characters.'); return; }
    try {
      await Lexora.api('/api/auth/change-password', {
        method: 'POST', body: { old_password: oldp, new_password: newp },
      });
      showToast('ok', 'Password updated.');
    } catch (err) {
      showToast('err', err.message || 'Could not change password.');
    }
  });

  document.querySelector('[data-action="delete-account"]')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!confirm('Delete your account permanently? This cannot be undone.')) return;
    try {
      await Lexora.api('/api/auth/me', { method: 'DELETE' });
      Lexora.signOut();
    } catch (err) {
      showToast('err', err.message || 'Could not delete account.');
    }
  });

  document.querySelector('[data-action="signout"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    Lexora.signOut();
  });

  // ---- language picker -----------------------------------------------------

  const DEFAULT_LANGUAGES = ['English', 'French', 'Spanish', 'German', 'Italian'];

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
    const all = DEFAULT_LANGUAGES.concat(customLanguages.filter((l) => !DEFAULT_LANGUAGES.includes(l)));
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
      const name = prompt('Add a language (e.g. Sindarin):');
      if (!name) return;
      const trimmed = name.trim();
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

  const handleFile = async (file) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      showStatus('err', 'Only PDF files are accepted (e.g. myvocabulary.pdf).');
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
      showStatus('ok', `Loaded <strong>${out.total}</strong> word${out.total === 1 ? '' : 's'} from your vocabulary.`);
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

  driveBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    // Mock Drive picker — real OAuth + Picker requires Google Cloud creds.
    // Restricted by design to a single file: myvocabulary.pdf.
    showStatus('ok',
      'Google Drive integration is in preview. Access is scoped to a single ' +
      'file (<code>myvocabulary.pdf</code>) — other files and folders remain disabled. ' +
      'Real Drive Picker will appear here once Google Cloud credentials are configured.'
    );
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
