// Topics catalogue & filterTopics — both data integrity and pure filter logic.
(() => {
  const { describe, it, expect } = window.Tests;
  const T = window.LEXORA_TOPICS;
  const FLAT = window.LEXORA_TOPICS_FLAT;

  describe('topics — data integrity', () => {
    it('exposes both languages', () => {
      expect(T.en).toBeTruthy();
      expect(T.fr).toBeTruthy();
    });

    it('every language has all six CEFR levels', () => {
      ['en', 'fr'].forEach((lang) => {
        ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'].forEach((lvl) => {
          if (!T[lang][lvl]) throw new Error(`${lang}.${lvl} missing`);
        });
      });
    });

    it('every level has at least one lexical theme', () => {
      ['en', 'fr'].forEach((lang) => {
        ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'].forEach((lvl) => {
          const arr = T[lang][lvl].lexical;
          if (!arr || !arr.length) throw new Error(`${lang}.${lvl}.lexical is empty`);
        });
      });
    });

    it('A1 → C1 levels include grammar', () => {
      ['en', 'fr'].forEach((lang) => {
        ['a1', 'a2', 'b1', 'b2', 'c1'].forEach((lvl) => {
          const arr = T[lang][lvl].grammar;
          if (!arr || !arr.length) throw new Error(`${lang}.${lvl}.grammar is empty`);
        });
      });
    });

    it('C2 includes the philology track for both languages', () => {
      expect(T.en.c2.philology).toBeTruthy();
      expect(T.fr.c2.philology).toBeTruthy();
      expect(T.en.c2.philology.length > 0).toBeTruthy();
      expect(T.fr.c2.philology.length > 0).toBeTruthy();
    });

    it('each topic has id / title / kind / items', () => {
      FLAT.forEach((t) => {
        if (!t.id || !t.title || !t.kind) throw new Error(`bad topic shape: ${JSON.stringify(t)}`);
        if (!Array.isArray(t.items)) throw new Error(`${t.id} items is not an array`);
      });
    });

    it('every topic id is unique', () => {
      const ids = new Set();
      FLAT.forEach((t) => {
        if (ids.has(t.id)) throw new Error(`duplicate id: ${t.id}`);
        ids.add(t.id);
      });
    });

    it('every flat topic has lang in {en,fr} and level in CEFR set', () => {
      FLAT.forEach((t) => {
        if (!['en', 'fr'].includes(t.lang)) throw new Error(`bad lang: ${t.lang}`);
        if (!['a1','a2','b1','b2','c1','c2'].includes(t.level)) throw new Error(`bad level: ${t.level}`);
      });
    });

    it('flat list has the same total count as the nested structure', () => {
      let nested = 0;
      ['en', 'fr'].forEach((lang) => {
        ['a1','a2','b1','b2','c1','c2'].forEach((lvl) => {
          ['lexical', 'grammar', 'philology'].forEach((cat) => {
            const arr = T[lang][lvl][cat];
            if (arr) nested += arr.length;
          });
        });
      });
      expect(FLAT.length).toBe(nested);
    });
  });

  describe('Lexora.filterTopics — pure filter', () => {
    const sample = [
      { id: '1', title: 'Greetings',         kind: 'lex',  items: ['hello', 'hi'],            lang: 'en', level: 'a1', category: 'lexical' },
      { id: '2', title: 'Past simple',       kind: 'gram', items: ['walked', 'went'],          lang: 'en', level: 'a2', category: 'grammar' },
      { id: '3', title: 'Salutations',       kind: 'lex',  items: ['bonjour'],                 lang: 'fr', level: 'a1', category: 'lexical' },
      { id: '4', title: 'Etymology',         kind: 'phil', items: ['from PIE *bher-'],         lang: 'en', level: 'c2', category: 'philology' },
    ];

    it('filters by language', () => {
      expect(Lexora.filterTopics(sample, { lang: 'fr' }).map((t) => t.id)).toEqual(['3']);
    });

    it('filters by level', () => {
      expect(Lexora.filterTopics(sample, { lang: 'en', level: 'a2' }).map((t) => t.id)).toEqual(['2']);
    });

    it('filters by category', () => {
      expect(Lexora.filterTopics(sample, { lang: 'en', category: 'philology' }).map((t) => t.id)).toEqual(['4']);
    });

    it('"all" level / category act as no-op', () => {
      expect(Lexora.filterTopics(sample, { lang: 'en', level: 'all', category: 'all' }).length).toBe(3);
    });

    it('search matches the title (case-insensitive)', () => {
      expect(Lexora.filterTopics(sample, { q: 'GREETINGS' }).map((t) => t.id)).toEqual(['1']);
    });

    it('search matches sample items', () => {
      expect(Lexora.filterTopics(sample, { q: 'bonjour' }).map((t) => t.id)).toEqual(['3']);
    });

    it('returns an empty array when nothing matches', () => {
      expect(Lexora.filterTopics(sample, { q: 'no-match-anywhere' })).toEqual([]);
    });

    it('returns a copy (does not mutate the input)', () => {
      const copy = sample.slice();
      Lexora.filterTopics(sample, { lang: 'en' });
      expect(sample).toEqual(copy);
    });
  });
})();
