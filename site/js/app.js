// Lexora app — deck storage, upload parsing, topics filter, flashcard study, dashboard stats.
// Pure helpers + storage factories live in js/lib.js (loaded ahead of this file).
(() => {
  'use strict';
  const user = (typeof Lexora !== 'undefined' && Lexora.requireAuth) ? Lexora.requireAuth() : null;
  if (!user) return;

  const Deck       = Lexora.makeDeck(user.email);
  const Stats      = Lexora.makeStats(user.email);
  const Prefs      = Lexora.makePrefs(user.email);
  const parseDeckText = Lexora.parseDeckText;

  // ============== UPLOAD page ==============
  const uploader = document.getElementById('uploader');
  if (uploader) {
    const fileInput = document.getElementById('file-input');
    const langSel = document.getElementById('upload-lang');
    const status = document.getElementById('upload-status');
    const preview = document.getElementById('deck-preview');

    const renderPreview = () => {
      const lang = langSel.value;
      const cards = Deck.get(lang);
      if (!cards.length) { preview.innerHTML = `<p class="muted center">Your <strong>${lang.toUpperCase()}</strong> deck is empty. Drop a file above to get started.</p>`; return; }
      const rows = cards.slice(0, 30).map((c) => `<tr><td>${escapeHtml(c.term)}</td><td>${escapeHtml(c.translation)}</td><td class="mono">${c.reviews || 0}</td></tr>`).join('');
      preview.innerHTML = `
        <div class="spread" style="margin-bottom: 14px;">
          <h3>${cards.length} card${cards.length === 1 ? '' : 's'} in your <span class="flag flag--${lang}">${lang.toUpperCase()}</span> deck</h3>
          <div class="row">
            <a href="flashcards.html?lang=${lang}" class="btn btn--accent">Study now →</a>
            <button class="btn btn--ghost" id="clear-deck">Clear deck</button>
          </div>
        </div>
        <table>
          <thead><tr><th>Term</th><th>Translation</th><th>Reviews</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${cards.length > 30 ? `<p class="muted" style="margin-top: 8px; font-size: 13px;">Showing first 30 of ${cards.length}.</p>` : ''}
      `;
      const clr = document.getElementById('clear-deck');
      if (clr) clr.addEventListener('click', () => { if (confirm(`Clear your ${lang.toUpperCase()} deck?`)) { Deck.clear(lang); renderPreview(); } });
    };

    const extractPdfText = async (file) => {
      if (!window.pdfjsLib) throw new Error('PDF reader still loading — try again in a moment.');
      const buf = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      const pages = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        // Group items by visual line using their y-coordinate (PDFs stream tokens).
        const lines = new Map();
        content.items.forEach((it) => {
          const y = Math.round(it.transform[5]);
          if (!lines.has(y)) lines.set(y, []);
          lines.get(y).push({ x: it.transform[4], str: it.str });
        });
        const ordered = [...lines.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([, parts]) => parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(' '));
        pages.push(ordered.join('\n'));
      }
      return pages.join('\n');
    };

    const handleFiles = async (files) => {
      if (!files || !files.length) return;
      const file = files[0];
      const lang = langSel.value;
      let text = '';
      try {
        if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
          status.innerHTML = `<div class="alert alert--ok">Reading <strong>${escapeHtml(file.name)}</strong>…</div>`;
          text = await extractPdfText(file);
        } else {
          text = await file.text();
        }
      } catch (e) {
        status.innerHTML = `<div class="alert alert--err">Could not read the file: ${escapeHtml(e.message || String(e))}</div>`;
        return;
      }
      const parsed = parseDeckText(text);
      if (!parsed.length) {
        status.innerHTML = `<div class="alert alert--err">No valid <code>term — translation</code> pairs found. Use one entry per line, e.g. <code>maison - house</code>.</div>`;
        return;
      }
      const added = Deck.add(lang, parsed);
      status.innerHTML = `<div class="alert alert--ok">Added <strong>${added}</strong> new card${added === 1 ? '' : 's'} to your <strong>${lang.toUpperCase()}</strong> deck (${parsed.length - added} duplicate${parsed.length - added === 1 ? '' : 's'} skipped).</div>`;
      renderPreview();
    };

    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    langSel.addEventListener('change', renderPreview);

    uploader.addEventListener('dragover', (e) => { e.preventDefault(); uploader.classList.add('is-drag'); });
    uploader.addEventListener('dragleave', () => uploader.classList.remove('is-drag'));
    uploader.addEventListener('drop', (e) => {
      e.preventDefault(); uploader.classList.remove('is-drag');
      handleFiles(e.dataTransfer.files);
    });
    uploader.addEventListener('click', () => fileInput.click());

    // sample loader
    const sampleBtn = document.getElementById('load-sample');
    if (sampleBtn) sampleBtn.addEventListener('click', () => {
      const lang = langSel.value;
      const sample = lang === 'fr'
        ? 'maison - house\nbonjour - hello\nlivre - book\namie - friend (f.)\néphémère - ephemeral\nflâner - to wander, to stroll\ncrépuscule - twilight\ndépaysement - the feeling of being abroad\nchuchoter - to whisper\nrue - street'
        : 'serendipity - a happy accident\npetrichor - the smell of rain on dry earth\nephemeral - lasting briefly\nuncanny - strange in an unsettling way\ncherish - to care for tenderly\nresilient - able to withstand difficulty\nepiphany - a sudden insight\nrumination - deep, often anxious, thought\nlimerence - the state of intense infatuation\nelegy - a mournful poem';
      const parsed = parseDeckText(sample);
      const added = Deck.add(lang, parsed);
      status.innerHTML = `<div class="alert alert--ok">Loaded sample — added <strong>${added}</strong> card${added === 1 ? '' : 's'}.</div>`;
      renderPreview();
    });

    renderPreview();
  }

  // ============== TOPICS page ==============
  const topicGrid = document.getElementById('topic-grid');
  if (topicGrid) {
    const flat = window.LEXORA_TOPICS_FLAT;
    const params = new URLSearchParams(location.search);
    const prefs = Prefs.get();
    let lang = params.get('lang') || prefs.lang;
    let level = params.get('level') || prefs.level;
    let cat = params.get('category') || prefs.category;
    let q = '';

    const setBtn = (selector, value) => {
      document.querySelectorAll(selector).forEach((b) => b.classList.toggle('is-active', b.dataset.value === value));
    };

    const counter = document.getElementById('topic-count');

    const render = () => {
      Prefs.save({ lang, level, category: cat });
      setBtn('[data-filter="lang"]', lang);
      setBtn('[data-filter="level"]', level);
      setBtn('[data-filter="cat"]', cat);

      const filtered = flat.filter((t) =>
        t.lang === lang &&
        (level === 'all' || t.level === level) &&
        (cat === 'all' || t.category === cat) &&
        (!q || (t.title + ' ' + (t.items || []).join(' ')).toLowerCase().includes(q))
      );

      counter.textContent = `${filtered.length} topic${filtered.length === 1 ? '' : 's'}`;

      if (!filtered.length) {
        topicGrid.innerHTML = `<p class="muted center" style="grid-column: 1 / -1; padding: 60px 0;">No topics match your filters. Try widening them.</p>`;
        return;
      }

      topicGrid.innerHTML = filtered.map((t) => {
        const lvlCls = `level--${t.level}`;
        const catLabel = t.category === 'lex' || t.category === 'lexical' ? 'lexical' : t.category === 'gram' || t.category === 'grammar' ? 'grammar' : 'philology';
        const itemsHtml = (t.items || []).slice(0, 4).map((i) => `<span>${escapeHtml(i)}</span>`).join('');
        return `
          <article class="topic-card">
            <span class="topic-card__cat">${catLabel}</span>
            <div class="topic-card__head">
              <span class="tag tag--ink">${t.level.toUpperCase()}</span>
              <span class="flag flag--${t.lang}">${t.lang.toUpperCase()}</span>
            </div>
            <h3 style="font-size: 1.15rem;">${escapeHtml(t.title)}</h3>
            <div class="topic-card__items">${itemsHtml}</div>
            <div class="row" style="margin-top: 10px;">
              <button class="btn btn--ghost" data-add-topic="${t.id}">Add to deck</button>
            </div>
          </article>
        `;
      }).join('');

      topicGrid.querySelectorAll('[data-add-topic]').forEach((b) => b.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.addTopic;
        const topic = flat.find((x) => x.id === id);
        if (!topic) return;
        const cards = (topic.items || []).map((it) => ({ term: it, translation: `(${topic.title})` }));
        const added = Deck.add(topic.lang, cards);
        e.currentTarget.textContent = added ? `Added ${added} ✓` : 'Already added ✓';
        e.currentTarget.classList.add('btn--accent');
      }));
    };

    document.querySelectorAll('[data-filter="lang"]').forEach((b) => b.addEventListener('click', () => { lang = b.dataset.value; render(); }));
    document.querySelectorAll('[data-filter="level"]').forEach((b) => b.addEventListener('click', () => { level = b.dataset.value; render(); }));
    document.querySelectorAll('[data-filter="cat"]').forEach((b) => b.addEventListener('click', () => { cat = b.dataset.value; render(); }));
    const search = document.getElementById('topic-search');
    if (search) search.addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); render(); });

    render();
  }

  // ============== FLASHCARDS page ==============
  const card = document.getElementById('flashcard');
  if (card) {
    const params = new URLSearchParams(location.search);
    const langSel = document.getElementById('study-lang');
    const wordEl = document.getElementById('card-word');
    const transEl = document.getElementById('card-translation');
    const meta = document.getElementById('deck-meta');
    const bar = document.getElementById('progress-bar');
    const empty = document.getElementById('deck-empty');

    let lang = params.get('lang') || Prefs.get().lang || 'en';
    if (langSel) langSel.value = lang;

    let cards = [];
    let order = [];
    let i = 0;

    Stats.session();

    const start = () => {
      cards = Deck.get(lang);
      i = 0;
      // weighted by score: harder cards earlier (lower score => front)
      order = cards.map((_, idx) => idx).sort((a, b) => (cards[a].score || 0) - (cards[b].score || 0));
      // tiny shuffle to avoid identical sequences
      for (let j = order.length - 1; j > 0; j--) {
        if (Math.random() < 0.3) { const k = Math.floor(Math.random() * (j + 1)); [order[j], order[k]] = [order[k], order[j]]; }
      }
      if (!cards.length) {
        card.classList.add('hide');
        document.getElementById('deck-controls')?.classList.add('hide');
        empty.classList.remove('hide');
        meta.textContent = `${lang.toUpperCase()} · empty`;
        bar.style.width = '0%';
        return;
      }
      card.classList.remove('hide');
      empty.classList.add('hide');
      document.getElementById('deck-controls')?.classList.remove('hide');
      show();
    };

    const show = () => {
      const c = cards[order[i]];
      wordEl.textContent = c.term;
      transEl.textContent = c.translation;
      card.classList.remove('is-flipped');
      meta.textContent = `${i + 1} / ${cards.length} · ${lang.toUpperCase()}`;
      bar.style.width = `${(i / cards.length) * 100}%`;
    };

    const flip = () => card.classList.toggle('is-flipped');

    const grade = (correct) => {
      const c = cards[order[i]];
      c.reviews = (c.reviews || 0) + 1;
      c.score = (c.score || 0) + (correct ? 1 : -1);
      Deck.save(lang, cards);
      Stats.review(correct);
      i = (i + 1) % cards.length;
      if (i === 0) {
        bar.style.width = '100%';
        meta.textContent = `${cards.length}/${cards.length} · pass complete · ${lang.toUpperCase()}`;
        setTimeout(start, 700);
      } else {
        show();
      }
    };

    card.addEventListener('click', flip);
    document.getElementById('btn-flip')?.addEventListener('click', flip);
    document.getElementById('btn-again')?.addEventListener('click', () => grade(false));
    document.getElementById('btn-good')?.addEventListener('click', () => grade(true));
    langSel?.addEventListener('change', (e) => { lang = e.target.value; const p = Prefs.get(); p.lang = lang; Prefs.save(p); start(); });

    document.addEventListener('keydown', (e) => {
      if (e.key === ' ') { e.preventDefault(); flip(); }
      else if (e.key === '1' || e.key === 'ArrowLeft') grade(false);
      else if (e.key === '2' || e.key === 'ArrowRight') grade(true);
    });

    start();
  }

  // ============== DASHBOARD page ==============
  const dash = document.getElementById('dashboard-stats');
  if (dash) {
    const s = Stats.get();
    const enCount = Deck.count('en');
    const frCount = Deck.count('fr');
    const accuracy = s.reviews ? Math.round((s.correct / s.reviews) * 100) : 0;
    dash.innerHTML = `
      <div class="stat stat--accent"><div class="stat__num">${enCount + frCount}</div><div class="stat__label">cards in your decks</div></div>
      <div class="stat"><div class="stat__num">${s.reviews}</div><div class="stat__label">total reviews</div></div>
      <div class="stat stat--clay"><div class="stat__num">${accuracy}%</div><div class="stat__label">accuracy</div></div>
      <div class="stat stat--teal"><div class="stat__num">${s.streak || 0}</div><div class="stat__label">day streak</div></div>
    `;
    document.getElementById('en-count').textContent = `${enCount} card${enCount === 1 ? '' : 's'}`;
    document.getElementById('fr-count').textContent = `${frCount} card${frCount === 1 ? '' : 's'}`;
  }

  // ============== utils ==============
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
