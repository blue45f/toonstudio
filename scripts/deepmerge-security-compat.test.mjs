import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import nodeTest from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import { test as vitestTest } from "vitest";
import { parse } from "yaml";

const test = process.env.VITEST ? vitestTest : nodeTest;
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FORK = join(ROOT, "patches/deepmerge");
const require = createRequire(import.meta.url);
const merge = require(join(FORK, "dist/cjs.js"));
const sha256 = (body) => createHash("sha256").update(body).digest("hex");
const provenance = JSON.parse(readFileSync(join(FORK, "UPSTREAM.json"), "utf8"));

/** 되돌린 바이트가 실제 npm 원본 SHA와 같아야 차등 비교의 기준으로 쓴다. */
function upstreamSource() {
  const patched = readFileSync(join(FORK, "dist/cjs.js"), "utf8");
  const restored = patched.replace(/function defineOwnProperty\(object, key, value\) \{\n\tObject\.defineProperty\(object, key, \{ value: value, writable: true, enumerable: true, configurable: true \}\);\n\}\n\n/u, "")
    .replace(/defineOwnProperty\(destination, key, ([^\n]+)\);/gu, "destination[key] = $1;");
  assert.equal(sha256(restored), provenance.files.find((file) => file.path === "dist/cjs.js").upstreamSha256);
  return restored;
}

function evaluateCjs(source) {
  const scope = { module: { exports: {} } };
  runInNewContext(source, scope);
  return scope.module.exports;
}

test("실제 Nest 소비 경로의 보안 백포트와 원본 타입·라이선스 바이트가 기록과 같다", () => {
  const workspace = parse(readFileSync(join(ROOT, "pnpm-workspace.yaml"), "utf8"));
  const lock = parse(readFileSync(join(ROOT, "pnpm-lock.yaml"), "utf8"));
  assert.equal(workspace.overrides["deepmerge@>=4.2.0 <=4.3.1"], "file:patches/deepmerge");
  assert.equal(lock.overrides["deepmerge@>=4.2.0 <=4.3.1"], "file:patches/deepmerge");
  const apiRequire = createRequire(join(ROOT, "apps/api/package.json"));
  const consumer = createRequire(apiRequire.resolve("nestjs-zod"));
  const installed = dirname(consumer.resolve("deepmerge/package.json"));
  assert.equal(consumer("deepmerge/package.json").version, "4.3.1+toonstudio.1");
  for (const file of provenance.files) {
    const local = readFileSync(join(FORK, file.path));
    assert.equal(sha256(local), file.patchedSha256);
    assert.deepEqual(readFileSync(join(installed, file.path)), local);
    if (!file.path.endsWith(".js")) assert.equal(file.upstreamSha256, file.patchedSha256);
  }
  assert(!Object.keys(lock.packages).some((key) => /^deepmerge@\d/u.test(key)), "레지스트리 취약본이 남으면 안 된다.");
});

test("공개 PoC 세 경로는 원본에서 재현되고 CJS·UMD 모두 결과 프로토타입을 바꾸지 않는다", () => {
  const original = evaluateCjs(upstreamSource());
  const umdScope = { module: { exports: {} }, exports: {} };
  runInNewContext(readFileSync(join(FORK, "dist/umd.js"), "utf8"), umdScope);
  const constructors = [merge, umdScope.module.exports];
  const payload = () => JSON.parse('{"__proto__":{"isAdmin":true}}');
  const nullTarget = () => Object.assign(Object.create(null), { name: "공원" });
  for (const [target, source, nested] of [[nullTarget(), payload(), false], [{ session: null }, { session: payload() }, true], [payload(), {}, false]]) {
    const baseline = original(target, source);
    assert.equal((nested ? baseline.session : baseline).isAdmin, true);
    for (const patched of constructors) {
      const result = patched(target, source);
      const checked = nested ? result.session : result;
      assert.equal(checked.isAdmin, undefined);
      assert.equal(Object.getPrototypeOf(checked).isAdmin, undefined);
      assert.equal(Object.hasOwn(checked, "__proto__"), true);
      assert.equal(checked.__proto__.isAdmin, true, "원본 자체 데이터 키는 상속 상태로 바꾸지 않고 보존한다.");
    }
  }
  assert.equal(({}).isAdmin, undefined);
});

test("정상 JSON 입력 10000쌍의 원본 결과·입력 보존·재귀 배열 병합을 유지한다", () => {
  const original = evaluateCjs(upstreamSource());
  let state = 20261028;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  function value(depth) {
    const kind = Math.floor(random() * (depth > 0 ? 6 : 4));
    if (kind === 0) return null;
    if (kind === 1) return Math.floor(random() * 10000);
    if (kind === 2) return random() > 0.5;
    if (kind === 3) return `소재-${Math.floor(random() * 100)}`;
    if (kind === 4) return [value(depth - 1), value(depth - 1)];
    return { first: value(depth - 1), second: value(depth - 1) };
  }
  for (let index = 0; index < 10000; index += 1) {
    const target = value(3), source = value(3);
    const before = JSON.stringify([target, source]);
    const outcome = (fn) => {
      try { return { value: JSON.stringify(fn(target, source)) }; }
      catch (error) { return { error: error.name + ":" + error.message }; }
    };
    assert.deepEqual(outcome(merge), outcome(original));
    assert.equal(JSON.stringify([target, source]), before);
  }
});

test("customMerge·arrayMerge·clone false·심볼·날짜·정규식·all 계약을 보존한다", () => {
  const symbol = Symbol("출처");
  const source = { nested: { source: true }, [symbol]: { retained: true } };
  const cloned = merge({}, source);
  assert.notEqual(cloned.nested, source.nested);
  assert.notEqual(cloned[symbol], source[symbol]);
  assert.deepEqual(cloned, source);
  assert.equal(merge({}, source, { clone: false }).nested, source.nested);
  const date = new Date("2026-10-28T00:00:00Z"), regex = /bundle/giu;
  assert.equal(merge({}, { date, regex }).date, date);
  assert.equal(merge({}, { date, regex }).regex, regex);
  assert.deepEqual(merge({ items: [1] }, { items: [2] }), { items: [1, 2] });
  assert.deepEqual(merge({ items: [1] }, { items: [2] }, { arrayMerge: (_target, next) => next }), { items: [2] });
  assert.deepEqual(merge({ title: { first: "정원" } }, { title: { second: "서재" } }, {
    customMerge: (key) => key === "title" ? (a, b) => `${a.first}/${b.second}` : undefined,
  }), { title: "정원/서재" });
  assert.deepEqual(merge.all([{ tags: [1] }, { tags: [2] }, { third: 3 }]), { tags: [1, 2], third: 3 });
  assert.throws(() => merge.all({}), /array/u);
});
