// Deck / Stats / Prefs — localStorage-backed factories. Each suite uses its own
// prefix so tests are isolated and never touch real user data.
(() => {
  const { describe, it, expect } = window.Tests;

  // helper: clean isolated storage prefixes between specs
  const wipePrefix = (prefix) => {
    Object.keys(localStorage)
      .filter((k) => k.includes('.' + prefix + '.') || k.endsWith('.' + prefix))
      .forEach((k) => localStorage.removeItem(k));
  };

  // ============ Deck ============
  describe('Lexora.makeDeck', () => {
    const PREFIX = '_test_deck_user';
    const deck = Lexora.makeDeck(PREFIX);

    it('returns [] when nothing has been saved', () => {
      wipePrefix(PREFIX);
      expect(deck.get('en')).toEqual([]);
      expect(deck.count('en')).toBe(0);
    });

    it('add() adds new cards and returns the count of newly added', () => {
      wipePrefix(PREFIX);
      const n = deck.add('en', [{ term: 'hello', translation: 'hi' }, { term: 'sun', translation: 'soleil' }]);
      expect(n).toBe(2);
      expect(deck.count('en')).toBe(2);
    });

    it('add() dedupes case-insensitively against existing cards', () => {
      wipePrefix(PREFIX);
      deck.add('en', [{ term: 'hello', translation: 'hi' }]);
      const n = deck.add('en', [
        { term: 'HELLO', translation: 'Hi' },          // duplicate (case-insensitive)
        { term: 'world', translation: 'monde' },       // new
      ]);
      expect(n).toBe(1);
      expect(deck.count('en')).toBe(2);
    });

    it('add() drops invalid entries (missing term or translation)', () => {
      wipePrefix(PREFIX);
      const n = deck.add('en', [
        { term: 'ok', translation: 'fine' },
        { term: '', translation: 'empty term' },
        { term: 'no-translation', translation: '' },
        null,
        undefined,
      ]);
      expect(n).toBe(1);
    });

    it('each new card is given an id, reviews=0, score=0', () => {
      wipePrefix(PREFIX);
      deck.add('en', [{ term: 'a', translation: 'b' }]);
      const c = deck.get('en')[0];
      expect(typeof c.id).toBe('string');
      expect(c.id.length > 0).toBeTruthy();
      expect(c.reviews).toBe(0);
      expect(c.score).toBe(0);
    });

    it('keeps EN and FR decks separate', () => {
      wipePrefix(PREFIX);
      deck.add('en', [{ term: 'cat', translation: 'cat' }]);
      deck.add('fr', [{ term: 'chat', translation: 'cat' }]);
      expect(deck.count('en')).toBe(1);
      expect(deck.count('fr')).toBe(1);
      expect(deck.get('en')[0].term).toBe('cat');
      expect(deck.get('fr')[0].term).toBe('chat');
    });

    it('clear() empties the deck for that language only', () => {
      wipePrefix(PREFIX);
      deck.add('en', [{ term: 'a', translation: 'b' }]);
      deck.add('fr', [{ term: 'c', translation: 'd' }]);
      deck.clear('en');
      expect(deck.count('en')).toBe(0);
      expect(deck.count('fr')).toBe(1);
    });

    it('decks for different prefixes (users) do not collide', () => {
      const a = Lexora.makeDeck('_test_user_a');
      const b = Lexora.makeDeck('_test_user_b');
      wipePrefix('_test_user_a');
      wipePrefix('_test_user_b');
      a.add('en', [{ term: 'apple', translation: 'pomme' }]);
      expect(a.count('en')).toBe(1);
      expect(b.count('en')).toBe(0);
    });
  });

  // ============ Stats ============
  describe('Lexora.makeStats', () => {
    const PREFIX = '_test_stats_user';
    const stats = Lexora.makeStats(PREFIX);

    it('returns the empty default when nothing has been saved', () => {
      stats.reset();
      const s = stats.get();
      expect(s.reviews).toBe(0);
      expect(s.correct).toBe(0);
      expect(s.sessions).toBe(0);
      expect(s.streak).toBe(0);
      expect(s.lastDay).toBe('');
    });

    it('review(true) increments reviews AND correct', () => {
      stats.reset();
      stats.review(true);
      stats.review(true);
      const s = stats.get();
      expect(s.reviews).toBe(2);
      expect(s.correct).toBe(2);
    });

    it('review(false) increments reviews but not correct', () => {
      stats.reset();
      stats.review(false);
      stats.review(true);
      const s = stats.get();
      expect(s.reviews).toBe(2);
      expect(s.correct).toBe(1);
    });

    it('starts a streak of 1 on the first review', () => {
      stats.reset();
      const s = stats.review(true);
      expect(s.streak).toBe(1);
      expect(s.lastDay).toBe(Lexora.today());
    });

    it('continues streak when last review was yesterday', () => {
      stats.reset();
      stats.save({ reviews: 5, correct: 3, sessions: 1, streak: 3, lastDay: Lexora.yesterday() });
      const s = stats.review(true);
      expect(s.streak).toBe(4);
    });

    it('resets streak to 1 when a day is skipped', () => {
      stats.reset();
      const twoDaysAgo = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
      stats.save({ reviews: 5, correct: 3, sessions: 1, streak: 7, lastDay: twoDaysAgo });
      const s = stats.review(true);
      expect(s.streak).toBe(1);
    });

    it('does NOT increment streak again on the same day', () => {
      stats.reset();
      const a = stats.review(true);
      const b = stats.review(true);
      expect(a.streak).toBe(1);
      expect(b.streak).toBe(1);
      expect(b.reviews).toBe(2);
    });

    it('session() increments sessions', () => {
      stats.reset();
      stats.session();
      stats.session();
      stats.session();
      expect(stats.get().sessions).toBe(3);
    });
  });

  // ============ Prefs ============
  describe('Lexora.makePrefs', () => {
    const PREFIX = '_test_prefs_user';
    const prefs = Lexora.makePrefs(PREFIX);

    it('returns the default prefs when none saved', () => {
      prefs.reset();
      expect(prefs.get()).toEqual({ lang: 'en', level: 'all', category: 'all' });
    });

    it('saves & retrieves arbitrary prefs', () => {
      prefs.reset();
      prefs.save({ lang: 'fr', level: 'b2', category: 'philology' });
      expect(prefs.get()).toEqual({ lang: 'fr', level: 'b2', category: 'philology' });
    });

    it('survives a corrupted JSON value (returns defaults)', () => {
      prefs.reset();
      localStorage.setItem('lexora.prefs.' + PREFIX, '{not valid json');
      expect(prefs.get()).toEqual({ lang: 'en', level: 'all', category: 'all' });
    });
  });
})();
