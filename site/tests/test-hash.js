// Lexora.hash — non-cryptographic deterministic hash used for stored passwords.
(() => {
  const { describe, it, expect } = window.Tests;
  const hash = window.Lexora.hash;

  describe('Lexora.hash', () => {
    it('returns the same hash for the same input (deterministic)', () => {
      expect(hash('hunter2')).toBe(hash('hunter2'));
      expect(hash('a long pass phrase that varies')).toBe(hash('a long pass phrase that varies'));
    });

    it('returns different hashes for different inputs', () => {
      expect(hash('a') === hash('b')).toBeFalsy();
      expect(hash('hunter2') === hash('Hunter2')).toBeFalsy();
    });

    it('returns a non-empty string', () => {
      expect(typeof hash('x')).toBe('string');
      expect(hash('x').length > 0).toBeTruthy();
    });

    it('handles empty / null / undefined safely', () => {
      expect(typeof hash('')).toBe('string');
      expect(typeof hash(null)).toBe('string');
      expect(typeof hash(undefined)).toBe('string');
    });

    it('handles unicode (accents, emoji)', () => {
      expect(hash('café')).toBeTruthy();
      expect(hash('café') === hash('cafe')).toBeFalsy();
    });
  });

  describe('email & password validators', () => {
    it('isValidEmail accepts well-formed addresses', () => {
      expect(Lexora.isValidEmail('a@b.co')).toBeTruthy();
      expect(Lexora.isValidEmail('antoniousenko@gmail.com')).toBeTruthy();
      expect(Lexora.isValidEmail('  trim+tag@example.com  ')).toBeTruthy();
    });
    it('isValidEmail rejects malformed addresses', () => {
      expect(Lexora.isValidEmail('plain')).toBeFalsy();
      expect(Lexora.isValidEmail('a@b')).toBeFalsy();
      expect(Lexora.isValidEmail('@b.co')).toBeFalsy();
      expect(Lexora.isValidEmail('a b@c.co')).toBeFalsy();
      expect(Lexora.isValidEmail('')).toBeFalsy();
    });
    it('isValidPassword requires ≥ 8 characters', () => {
      expect(Lexora.isValidPassword('1234567')).toBeFalsy();
      expect(Lexora.isValidPassword('12345678')).toBeTruthy();
      expect(Lexora.isValidPassword('')).toBeFalsy();
    });
  });
})();
