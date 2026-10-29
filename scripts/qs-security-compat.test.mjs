import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import nodeTest from "node:test";
import { fileURLToPath } from "node:url";
import { test as vitestTest } from "vitest";
import { parse } from "yaml";

const test = process.env.VITEST ? vitestTest : nodeTest;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiRequire = createRequire(join(ROOT, "apps/api/package.json"));
const platformRequire = createRequire(apiRequire.resolve("@nestjs/platform-express"));
const expressRequire = createRequire(platformRequire.resolve("express"));
const qs = expressRequire("qs");

test("qs 취약 범위만 공식 6.16.1 패치로 고정하고 실제 API Express 소비자가 사용한다", () => {
  const workspace = parse(readFileSync(join(ROOT, "pnpm-workspace.yaml"), "utf8"));
  const lock = parse(readFileSync(join(ROOT, "pnpm-lock.yaml"), "utf8"));
  assert.equal(workspace.overrides["qs@>=6.0.0 <6.16.1"], "6.16.1");
  assert.equal(lock.overrides["qs@>=6.0.0 <6.16.1"], "6.16.1");
  assert.equal(workspace.overrides["qs@>=6.0.0 <6.16.0"], undefined);
  assert.deepEqual(Object.keys(lock.packages).filter((key) => /^qs@\d/u.test(key)), ["qs@6.16.1"]);
  assert.equal(expressRequire("qs/package.json").version, "6.16.1");
});

test("GHSA-6pq8-jhm2-2vcw 공개 PoC의 JSON·allowPrototypes·plainObjects comma 직렬화가 실패하지 않는다", () => {
  const inputs = [
    JSON.parse('{"a":[{"toString":"x"}]}'),
    qs.parse("a[0][toString]=x", { allowPrototypes: true }),
    qs.parse("a[0][b]=c", { plainObjects: true }),
    JSON.parse('{"a":[[{"toString":"x"}]]}'),
  ];
  for (const input of inputs) {
    for (const encodeValuesOnly of [false, true]) {
      assert.equal(decodeURIComponent(qs.stringify(input, { arrayFormat: "comma", encodeValuesOnly })), "a=[object Object]");
    }
  }
});

test("qs 기본 중첩·배열·한글 parse/stringify와 comma 옵션의 기존 출력 계약을 유지한다", () => {
  const input = { filters: { genre: "판타지", page: "2" }, tags: ["garden", "study"] };
  assert.deepEqual(qs.parse(qs.stringify(input)), input);
  assert.equal(qs.stringify({ tags: ["garden", "study"] }, { arrayFormat: "comma" }), "tags=garden%2Cstudy");
  const comma = qs.stringify({ tags: ["garden", "study"] }, { arrayFormat: "comma", encodeValuesOnly: true });
  assert.equal(comma, "tags=garden,study");
  assert.deepEqual(qs.parse(comma, { comma: true }), { tags: ["garden", "study"] });
  const parsed = qs.parse("__proto__[isAdmin]=true&constructor[prototype][isAdmin]=true", { allowPrototypes: true });
  assert.equal(({}).isAdmin, undefined);
  assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
  assert.equal(Object.hasOwn(parsed, "__proto__"), false);
});
