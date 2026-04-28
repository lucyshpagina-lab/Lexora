// Auth (mock localStorage) — register / login / forgot-password flows.
// Uses lexora.users + lexora.user keys directly via Lexora.* helpers.
(() => {
  const { describe, it, expect } = window.Tests;

  const wipeAuth = () => {
    localStorage.removeItem('lexora.user');
    localStorage.removeItem('lexora.users');
  };

  describe('auth — getUser / setUser / logout-ish helpers', () => {
    it('getUser() returns null when no one is signed in', () => {
      wipeAuth();
      expect(Lexora.getUser()).toBe(null);
    });

    it('setUser stores the user; getUser reads it back', () => {
      wipeAuth();
      Lexora.setUser({ email: 'a@b.co', name: 'Aurelia' });
      const u = Lexora.getUser();
      expect(u.email).toBe('a@b.co');
      expect(u.name).toBe('Aurelia');
    });

    it('survives malformed JSON in lexora.user (returns null)', () => {
      wipeAuth();
      localStorage.setItem('lexora.user', '{not valid');
      expect(Lexora.getUser()).toBe(null);
    });

    it('getUsers() returns {} when none registered', () => {
      wipeAuth();
      expect(Lexora.getUsers()).toEqual({});
    });

    it('saveUsers() / getUsers() round-trip', () => {
      wipeAuth();
      const users = { 'a@b.co': { email: 'a@b.co', name: 'A', pwd: Lexora.hash('hunter22'), created: 1 } };
      Lexora.saveUsers(users);
      expect(Lexora.getUsers()).toEqual(users);
    });
  });

  describe('register flow (validation rules)', () => {
    it('rejects an invalid email format', () => {
      expect(Lexora.isValidEmail('not-an-email')).toBeFalsy();
    });
    it('rejects a short password', () => {
      expect(Lexora.isValidPassword('short')).toBeFalsy();
    });
    it('accepts a well-formed email and 8+ char password', () => {
      expect(Lexora.isValidEmail('a@b.co')).toBeTruthy();
      expect(Lexora.isValidPassword('hunter22')).toBeTruthy();
    });
  });

  describe('register flow (storage simulation)', () => {
    // simulate the auth.js handler
    const tryRegister = ({ name, email, password, confirm }) => {
      if (!name || !email || !password) return { ok: false, err: 'fields' };
      if (!Lexora.isValidEmail(email)) return { ok: false, err: 'email' };
      if (!Lexora.isValidPassword(password)) return { ok: false, err: 'password' };
      if (password !== confirm) return { ok: false, err: 'mismatch' };
      const users = Lexora.getUsers();
      const key = email.toLowerCase();
      if (users[key]) return { ok: false, err: 'exists' };
      users[key] = { email: key, name, pwd: Lexora.hash(password), created: Date.now() };
      Lexora.saveUsers(users);
      Lexora.setUser({ email: key, name });
      return { ok: true };
    };

    it('a fresh registration succeeds and signs the user in', () => {
      wipeAuth();
      const r = tryRegister({ name: 'A', email: 'a@b.co', password: 'hunter22', confirm: 'hunter22' });
      expect(r.ok).toBeTruthy();
      expect(Lexora.getUser().email).toBe('a@b.co');
      expect(Lexora.getUsers()['a@b.co'].name).toBe('A');
    });

    it('a duplicate email is rejected', () => {
      wipeAuth();
      tryRegister({ name: 'A', email: 'a@b.co', password: 'hunter22', confirm: 'hunter22' });
      const r = tryRegister({ name: 'B', email: 'a@b.co', password: 'hunter22', confirm: 'hunter22' });
      expect(r.ok).toBeFalsy();
      expect(r.err).toBe('exists');
    });

    it('mismatched passwords are rejected', () => {
      wipeAuth();
      const r = tryRegister({ name: 'A', email: 'a@b.co', password: 'hunter22', confirm: 'hunter23' });
      expect(r.ok).toBeFalsy();
      expect(r.err).toBe('mismatch');
    });

    it('does NOT store the raw password (stores hashed)', () => {
      wipeAuth();
      tryRegister({ name: 'A', email: 'a@b.co', password: 'hunter22', confirm: 'hunter22' });
      const stored = Lexora.getUsers()['a@b.co'];
      expect(stored.pwd === 'hunter22').toBeFalsy();
      expect(stored.pwd).toBe(Lexora.hash('hunter22'));
    });
  });

  describe('login flow (storage simulation)', () => {
    const seed = (email, name, password) => {
      const users = Lexora.getUsers();
      users[email.toLowerCase()] = { email: email.toLowerCase(), name, pwd: Lexora.hash(password), created: 1 };
      Lexora.saveUsers(users);
    };
    const tryLogin = ({ email, password }) => {
      const u = Lexora.getUsers()[email.toLowerCase()];
      if (!u || u.pwd !== Lexora.hash(password)) return { ok: false };
      Lexora.setUser({ email: u.email, name: u.name });
      return { ok: true, user: u };
    };

    it('succeeds with the right password', () => {
      wipeAuth();
      seed('a@b.co', 'A', 'hunter22');
      const r = tryLogin({ email: 'a@b.co', password: 'hunter22' });
      expect(r.ok).toBeTruthy();
      expect(Lexora.getUser().email).toBe('a@b.co');
    });

    it('fails with the wrong password', () => {
      wipeAuth();
      seed('a@b.co', 'A', 'hunter22');
      const r = tryLogin({ email: 'a@b.co', password: 'wrong-password' });
      expect(r.ok).toBeFalsy();
      expect(Lexora.getUser()).toBe(null);
    });

    it('fails for an unknown email', () => {
      wipeAuth();
      const r = tryLogin({ email: 'ghost@nowhere.co', password: 'whatever1' });
      expect(r.ok).toBeFalsy();
    });

    it('email lookup is case-insensitive on registration', () => {
      wipeAuth();
      seed('Mixed@Case.co', 'M', 'hunter22');
      const r = tryLogin({ email: 'MIXED@CASE.CO', password: 'hunter22' });
      expect(r.ok).toBeTruthy();
    });
  });

  describe('password reset (forgot-password) — simulation', () => {
    const reset = (email, newPassword) => {
      const users = Lexora.getUsers();
      const u = users[email.toLowerCase()];
      if (!u) return { ok: false, err: 'no-user' };
      u.pwd = Lexora.hash(newPassword);
      Lexora.saveUsers(users);
      return { ok: true };
    };

    it('updates the stored hash for an existing user', () => {
      wipeAuth();
      Lexora.saveUsers({ 'a@b.co': { email: 'a@b.co', name: 'A', pwd: Lexora.hash('hunter22'), created: 1 } });
      const r = reset('a@b.co', 'newpassw0rd');
      expect(r.ok).toBeTruthy();
      expect(Lexora.getUsers()['a@b.co'].pwd).toBe(Lexora.hash('newpassw0rd'));
    });

    it('refuses to reset a non-existent email', () => {
      wipeAuth();
      const r = reset('ghost@nowhere.co', 'newpassw0rd');
      expect(r.ok).toBeFalsy();
    });
  });
})();
