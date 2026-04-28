// Lexora — core: cursor, magnetic, reveal, marquee, nav, mock auth utils
(() => {
  'use strict';

  // ============== custom cursor — ladybug ==============
  const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (supportsHover) {
    const bug = document.createElement('div');
    bug.className = 'cursor';
    bug.innerHTML = `
      <svg viewBox="0 0 32 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <ellipse cx="16" cy="25" rx="10" ry="1.6" fill="#1F3A2C" opacity="0.18"/>
        <path d="M3 14 Q3 4 16 4 Q29 4 29 14 Q29 23 16 23 Q3 23 3 14 Z" fill="#B33A3A" stroke="#1F3A2C" stroke-width="1"/>
        <path d="M16 4 L16 23" stroke="#1F3A2C" stroke-width="0.9"/>
        <circle cx="10" cy="11" r="1.6" fill="#1F3A2C"/>
        <circle cx="22" cy="11" r="1.6" fill="#1F3A2C"/>
        <circle cx="9" cy="17" r="1.4" fill="#1F3A2C"/>
        <circle cx="23" cy="17" r="1.4" fill="#1F3A2C"/>
        <circle cx="16" cy="20.5" r="1.2" fill="#1F3A2C"/>
        <ellipse cx="16" cy="4" rx="6" ry="3.5" fill="#1F3A2C"/>
        <path d="M13 1.5 Q12 0.4 10.5 0.4" fill="none" stroke="#1F3A2C" stroke-width="0.9" stroke-linecap="round"/>
        <path d="M19 1.5 Q20 0.4 21.5 0.4" fill="none" stroke="#1F3A2C" stroke-width="0.9" stroke-linecap="round"/>
        <circle cx="10.5" cy="0.4" r="0.85" fill="#1F3A2C"/>
        <circle cx="21.5" cy="0.4" r="0.85" fill="#1F3A2C"/>
        <circle cx="14" cy="3.5" r="0.55" fill="#EEEFE2"/>
        <circle cx="18" cy="3.5" r="0.55" fill="#EEEFE2"/>
      </svg>`;
    document.body.append(bug);

    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let lx = mx, ly = my, prevX = mx;
    document.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; });

    const tick = () => {
      lx += (mx - lx) * 0.34;
      ly += (my - ly) * 0.34;
      // ladybug rotates to face direction of travel
      const dx = mx - prevX;
      const drift = Math.max(-22, Math.min(22, dx * 0.9));
      prevX = mx;
      bug.style.transform = `translate(${lx}px, ${ly}px) translate(-50%, -50%) rotate(${drift}deg)`;
      requestAnimationFrame(tick);
    };
    tick();

    const hoverSel = 'a, button, .btn, .chip, .feature, .topic-card, .level, .uploader, .flashcard, input, textarea, select, [data-magnetic]';
    document.addEventListener('mouseover', (e) => {
      const target = e.target.closest(hoverSel);
      const isText = e.target.closest('input, textarea, [contenteditable]');
      bug.classList.toggle('is-over', !!target && !isText);
      bug.classList.toggle('is-text', !!isText);
    });
  }

  // ============== magnetic buttons ==============
  document.querySelectorAll('[data-magnetic], .btn--magnetic').forEach((el) => {
    const strength = parseFloat(el.dataset.magnetic) || 0.35;
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2);
      const y = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
    });
    el.addEventListener('mouseleave', () => { el.style.transform = ''; });
  });

  // ============== reveal on scroll ==============
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  // ============== marquee duplicator ==============
  document.querySelectorAll('.marquee__track').forEach((track) => {
    track.innerHTML = track.innerHTML + track.innerHTML;
  });

  // ============== nav active ==============
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav a[href]').forEach((a) => {
    if (a.getAttribute('href') === path) a.style.color = 'var(--clay)';
  });

  // ============== global helpers (auth state) ==============
  window.Lexora = window.Lexora || {};

  const KEY_USER = 'lexora.user';
  const KEY_USERS = 'lexora.users';

  Lexora.getUser = () => {
    try { return JSON.parse(localStorage.getItem(KEY_USER) || 'null'); } catch { return null; }
  };
  Lexora.setUser = (u) => { localStorage.setItem(KEY_USER, JSON.stringify(u)); };
  Lexora.logout = () => { localStorage.removeItem(KEY_USER); location.href = 'signin.html'; };

  Lexora.getUsers = () => {
    try { return JSON.parse(localStorage.getItem(KEY_USERS) || '{}'); } catch { return {}; }
  };
  Lexora.saveUsers = (users) => localStorage.setItem(KEY_USERS, JSON.stringify(users));

  // tiny non-cryptographic hash so we don't store raw passwords
  Lexora.hash = (s) => {
    let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
    return (h >>> 0).toString(36);
  };

  Lexora.requireAuth = () => {
    const u = Lexora.getUser();
    if (!u) { location.href = 'signin.html'; return null; }
    return u;
  };

  // protect/decorate authenticated nav
  document.querySelectorAll('[data-auth-only]').forEach((el) => {
    if (!Lexora.getUser()) el.classList.add('hide');
  });
  document.querySelectorAll('[data-anon-only]').forEach((el) => {
    if (Lexora.getUser()) el.classList.add('hide');
  });
  const slot = document.querySelector('[data-username]');
  if (slot) {
    const u = Lexora.getUser();
    if (u) slot.textContent = u.name || u.email;
  }

  // logout buttons
  document.querySelectorAll('[data-logout]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); Lexora.logout(); }));

  // ============== mobile burger (auto-injected) ==============
  (function () {
    const navInner = document.querySelector('.nav__inner');
    const links = navInner && navInner.querySelector('.nav__links');
    const cta = navInner && navInner.querySelector('.nav__cta');
    if (!navInner || !links || !cta) return;
    // skip burger when there's nothing to show (e.g. anonymous on auth pages)
    if (links.classList.contains('hide') || links.hasAttribute('hidden')) return;
    if (!links.querySelector('a')) return;

    const burger = document.createElement('button');
    burger.type = 'button';
    burger.className = 'nav__burger';
    burger.setAttribute('aria-label', 'Toggle menu');
    burger.setAttribute('aria-controls', 'primary-nav');
    burger.setAttribute('aria-expanded', 'false');
    burger.innerHTML = '<span></span><span></span><span></span>';
    navInner.insertBefore(burger, cta);
    if (!links.id) links.id = 'primary-nav';

    const close = () => {
      links.classList.remove('is-open');
      burger.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('nav-open');
    };
    burger.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !links.classList.contains('is-open');
      links.classList.toggle('is-open', open);
      burger.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('nav-open', open);
    });
    links.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
    document.addEventListener('click', (e) => {
      if (links.classList.contains('is-open') && !links.contains(e.target) && !burger.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    const mq = window.matchMedia('(min-width: 761px)');
    const onChange = (ev) => { if (ev.matches) close(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else mq.addListener(onChange);
  })();

  // ============== auth-menu dropdown ==============
  document.querySelectorAll('.auth-menu').forEach((menu) => {
    const trigger = menu.querySelector('.auth-trigger');
    if (!trigger) return;
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
  });
})();
