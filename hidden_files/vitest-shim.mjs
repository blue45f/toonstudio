// Minimal vitest-compatible shim for local verification only (not shipped).
// Implements the describe/it/expect subset used by the overlay test file and
// fails the process (exit 1) if any assertion fails.
let passed = 0;
let failed = 0;
const failures = [];

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object") {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

function show(v) {
  try { return JSON.stringify(v); } catch { return String(v); }
}

function makeExpect(actual, negated) {
  const check = (ok, msg) => {
    if (negated) ok = !ok;
    if (!ok) throw new Error(msg);
  };
  const api = {
    toBe: (e) => check(Object.is(actual, e), `expected ${show(actual)} toBe ${show(e)}`),
    toEqual: (e) => check(deepEqual(actual, e), `expected ${show(actual)} toEqual ${show(e)}`),
    toBeNull: () => check(actual === null, `expected ${show(actual)} toBeNull`),
    toContain: (e) => check(
      typeof actual === "string" ? actual.includes(e) : Array.isArray(actual) && actual.includes(e),
      `expected ${show(actual)} toContain ${show(e)}`),
    toHaveLength: (n) => check(actual?.length === n, `expected length ${actual?.length} toBe ${n}`),
  };
  Object.defineProperty(api, "not", { get: () => makeExpect(actual, !negated) });
  return api;
}

export function expect(actual) { return makeExpect(actual, false); }
export function describe(name, fn) { console.log(`describe: ${name}`); fn(); }
export function it(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok - ${name}`);
  } catch (error) {
    failed += 1;
    failures.push(`${name}: ${error.message}`);
    console.log(`  FAIL - ${name}: ${error.message}`);
  }
}
export function summarizeAndExit() {
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
