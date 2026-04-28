// parseDeckText — recognises term/translation pairs in many separator styles.
(() => {
  const { describe, it, expect } = window.Tests;
  const parse = window.Lexora.parseDeckText;

  describe('parseDeckText', () => {
    it('returns [] for empty / null / undefined input', () => {
      expect(parse('')).toEqual([]);
      expect(parse(null)).toEqual([]);
      expect(parse(undefined)).toEqual([]);
    });

    it('skips blank lines and # comments', () => {
      const out = parse('# header\n\n   \nmaison - house\n# trailing');
      expect(out).toEqual([{ term: 'maison', translation: 'house' }]);
    });

    it('parses ` - ` (hyphen with spaces) as separator', () => {
      expect(parse('hello - bonjour')).toEqual([{ term: 'hello', translation: 'bonjour' }]);
    });

    it('parses ` – ` and ` — ` (en/em dashes)', () => {
      expect(parse('hello – bonjour')).toEqual([{ term: 'hello', translation: 'bonjour' }]);
      expect(parse('hello — bonjour')).toEqual([{ term: 'hello', translation: 'bonjour' }]);
    });

    it('parses `:` without leading space (dictionary form)', () => {
      expect(parse('flâner: to wander')).toEqual([{ term: 'flâner', translation: 'to wander' }]);
    });

    it('parses ` = ` (equals)', () => {
      expect(parse('amie = friend')).toEqual([{ term: 'amie', translation: 'friend' }]);
    });

    it('parses ` / ` (slash)', () => {
      expect(parse('chuchoter / to whisper')).toEqual([{ term: 'chuchoter', translation: 'to whisper' }]);
    });

    it('parses tab-separated', () => {
      expect(parse('maison\thouse')).toEqual([{ term: 'maison', translation: 'house' }]);
    });

    it('preserves inner hyphens (no surrounding spaces)', () => {
      expect(parse('self-aware - aware of oneself')).toEqual([{ term: 'self-aware', translation: 'aware of oneself' }]);
    });

    it('skips lines without a recognised separator', () => {
      const out = parse('valid - card\nno-separator-here\nanother: pair');
      expect(out).toHaveLength(2);
    });

    it('joins multiple separators with em-dash', () => {
      // a line that splits into >2 chunks (e.g. word: gloss, extra)
      const out = parse('word: gloss - extra');
      expect(out).toEqual([{ term: 'word', translation: 'gloss — extra' }]);
    });

    it('trims surrounding whitespace from term & translation', () => {
      expect(parse('  spaced  -   word  ')).toEqual([{ term: 'spaced', translation: 'word' }]);
    });

    it('handles \\r\\n line endings', () => {
      expect(parse('a - b\r\nc - d')).toHaveLength(2);
    });
  });
})();
