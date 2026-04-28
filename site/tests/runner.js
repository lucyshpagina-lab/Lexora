// Minimal browser test runner — describe / it / expect.
window.Tests = (() => {
  const results = { pass: 0, fail: 0, total: 0, items: [] };
  let currentSuite = '';

  const describe = (name, fn) => {
    const prev = currentSuite;
    currentSuite = name;
    try { fn(); }
    catch (e) { record('FAIL', '(suite error)', e && (e.message || String(e))); }
    currentSuite = prev;
  };

  const it = (name, fn) => {
    results.total++;
    try { fn(); record('PASS', name); }
    catch (e) { record('FAIL', name, (e && (e.message || String(e))) + (e && e.stack ? '\n' + e.stack : '')); }
  };

  const record = (kind, name, error) => {
    if (kind === 'PASS') results.pass++; else results.fail++;
    results.items.push({ kind, suite: currentSuite, name, error });
  };

  const fmt = (v) => {
    try { return JSON.stringify(v); } catch { return String(v); }
  };

  const expect = (actual) => ({
    toBe(expected) {
      if (actual !== expected) throw new Error(`expected ${fmt(actual)} to BE ${fmt(expected)}`);
    },
    toEqual(expected) {
      if (fmt(actual) !== fmt(expected)) throw new Error(`expected ${fmt(actual)} to EQUAL ${fmt(expected)}`);
    },
    toBeTruthy() { if (!actual) throw new Error(`expected truthy, got ${fmt(actual)}`); },
    toBeFalsy()  { if (actual)  throw new Error(`expected falsy, got ${fmt(actual)}`); },
    toContain(sub) {
      const ok = Array.isArray(actual) ? actual.includes(sub) : String(actual).includes(sub);
      if (!ok) throw new Error(`expected ${fmt(actual)} to contain ${fmt(sub)}`);
    },
    toNotContain(sub) {
      const ok = Array.isArray(actual) ? actual.includes(sub) : String(actual).includes(sub);
      if (ok) throw new Error(`expected ${fmt(actual)} NOT to contain ${fmt(sub)}`);
    },
    toHaveLength(n) {
      if (!actual || actual.length !== n) throw new Error(`expected length ${n}, got ${actual ? actual.length : '<no length>'}`);
    },
    toThrow() {
      try { actual(); } catch { return; }
      throw new Error('expected function to throw');
    },
    toMatch(re) {
      if (!re.test(String(actual))) throw new Error(`expected ${fmt(actual)} to match ${re}`);
    },
  });

  const render = (target) => {
    const ratio = results.total ? Math.round((results.pass / results.total) * 100) : 0;
    const grouped = {};
    results.items.forEach((r) => { (grouped[r.suite] = grouped[r.suite] || []).push(r); });
    const suiteHtml = Object.entries(grouped).map(([suite, items]) => `
      <section class="suite">
        <h3>${suite || '(top level)'}</h3>
        <ul>${items.map((r) => `
          <li class="${r.kind.toLowerCase()}">
            <span class="badge">${r.kind}</span>
            <span class="name">${escape(r.name)}</span>
            ${r.error ? `<pre>${escape(r.error)}</pre>` : ''}
          </li>`).join('')}
        </ul>
      </section>`).join('');
    target.innerHTML = `
      <div class="summary ${results.fail === 0 ? 'ok' : 'err'}">
        <strong>${results.pass}/${results.total}</strong> passing · <strong>${results.fail}</strong> failing · ${ratio}%
      </div>
      ${suiteHtml}`;
  };

  const escape = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  return { describe, it, expect, render, results };
})();
