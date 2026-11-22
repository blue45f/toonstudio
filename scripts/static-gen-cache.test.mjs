import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  LAZY_APP_BUILTIN_GROUPS,
  collectI18nBuiltinTargets,
  runI18nBuiltinsSync,
} from "./generate-i18n-builtins.mjs";
import {
  computeFileSha256,
  computeInputsDigest,
  getKstDateString,
  readCacheStamp,
  verifyCachedOutputs,
  writeCacheStamp,
} from "./lib/static-gen-cache.mjs";

const { describe, test } = process.env.VITEST
  ? await import("vitest")
  : await import("node:test");

function withTempDir(prefix, fn) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function createMemoryStream() {
  const chunks = [];
  return {
    write(chunk) {
      chunks.push(String(chunk));
      return true;
    },
    text() {
      return chunks.join("");
    },
  };
}

function createI18nFixture(rootDir) {
  const writeLocale = (scope, namespace, locale, data) => {
    const file = path.join(rootDir, "apps/web/public/i18n", scope, namespace, `${locale}.json`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  };

  writeLocale("app", "common", "en", { "common.hello": "Hello" });
  writeLocale("app", "common", "ko", { "common.hello": "안녕" });
  for (const group of LAZY_APP_BUILTIN_GROUPS) {
    const ns = group.namespaces[0];
    writeLocale("app", ns, "en", { [`${ns}.title`]: `${ns} EN` });
    writeLocale("app", ns, "ko", { [`${ns}.title`]: `${ns} KO` });
  }
  writeLocale("admin", "dashboard", "en", { "admin.ok": "OK" });
  writeLocale("admin", "dashboard", "ko", { "admin.ok": "정상" });
}

describe("static-gen-cache 공통 해시 캐시 가드", () => {
  test("입력 파일 변경·누락·추가 스칼라 변경에 따라 결정적 SHA-256이 바뀐다", () => {
    withTempDir("toonstudio-gen-cache-", (dir) => {
      const a = path.join(dir, "a.json");
      const b = path.join(dir, "b.json");
      writeFileSync(a, '{"v":1}\n');
      writeFileSync(b, '{"v":2}\n');

      const d1 = computeInputsDigest({
        rootDir: dir,
        files: [b, a],
        extraValues: { day: "2026-11-22", count: 2 },
      });
      const d2 = computeInputsDigest({
        rootDir: dir,
        files: [a, b],
        extraValues: { count: 2, day: "2026-11-22" },
      });
      assert.equal(d1.digest, d2.digest, "정렬 순서가 달라도 동일 입력이면 같은 해시여야 한다");

      writeFileSync(a, '{"v":3}\n');
      const d3 = computeInputsDigest({
        rootDir: dir,
        files: [a, b],
        extraValues: { day: "2026-11-22", count: 2 },
      });
      assert.notEqual(d3.digest, d1.digest);

      const d4 = computeInputsDigest({
        rootDir: dir,
        files: [a, b, { path: "missing-optional.json", optional: true }],
        extraValues: { day: "2026-11-23", count: 2 },
      });
      assert.notEqual(d4.digest, d3.digest);

      assert.throws(() =>
        computeInputsDigest({ rootDir: dir, files: ["required-missing.json"] }),
      );
    });
  });

  test("스탬프 기록·검증은 산출물 누락·변조·스탬프 손상을 모두 캐시 미스로 판정한다", () => {
    withTempDir("toonstudio-gen-stamp-", (dir) => {
      const outA = path.join(dir, "out/a.json");
      const outB = path.join(dir, "out/b.json");
      const stampPath = path.join(dir, "cache/stamp.json");
      mkdirSync(path.dirname(outA), { recursive: true });
      writeFileSync(outA, '{"ok":true}\n');
      writeFileSync(outB, '{"items":[1]}\n');

      const inputsHash = "a".repeat(64);
      writeCacheStamp(stampPath, {
        generator: "demo",
        inputsHash,
        rootDir: dir,
        hashedFiles: ["out/a.json"],
      });

      const stamp = readCacheStamp(stampPath);
      assert.equal(stamp?.outputs["out/a.json"], computeFileSha256(outA));

      assert.deepEqual(
        verifyCachedOutputs({
          rootDir: dir,
          generator: "demo",
          stamp,
          expectedInputsHash: inputsHash,
          requiredFiles: ["out/a.json", "out/b.json"],
          hashedFiles: ["out/a.json"],
        }),
        { hit: true, reason: "cache-hit" },
      );

      // 산출물 변조 시 캐시 미스
      writeFileSync(outA, '{"ok":false}\n');
      assert.equal(
        verifyCachedOutputs({
          rootDir: dir,
          generator: "demo",
          stamp,
          expectedInputsHash: inputsHash,
          requiredFiles: ["out/a.json", "out/b.json"],
          hashedFiles: ["out/a.json"],
        }).hit,
        false,
      );

      // 원복 후 required 파일 삭제 시 캐시 미스
      writeFileSync(outA, '{"ok":true}\n');
      rmSync(outB);
      assert.equal(
        verifyCachedOutputs({
          rootDir: dir,
          generator: "demo",
          stamp,
          expectedInputsHash: inputsHash,
          requiredFiles: ["out/a.json", "out/b.json"],
          hashedFiles: ["out/a.json"],
        }).hit,
        false,
      );

      // 손상된 스탬프 JSON은 null 반환
      writeFileSync(stampPath, "{broken");
      assert.equal(readCacheStamp(stampPath), null);
    });
  });

  test("KST 날짜 계산은 UTC+9 경계를 정확히 반영한다", () => {
    assert.equal(getKstDateString(new Date("2026-11-22T14:59:59Z")), "2026-11-22");
    assert.equal(getKstDateString(new Date("2026-11-22T15:00:00Z")), "2026-11-23");
  });
});

describe("i18n:builtins:gen 입력 해시 스킵 캐시", () => {
  test("입력과 산출물이 동일하면 재생성을 건너뛰고, 입력·산출물 변조와 --force·--check를 정확히 처리한다", () => {
    withTempDir("toonstudio-i18n-cache-", (dir) => {
      createI18nFixture(dir);
      const cacheFile = path.join(dir, "node_modules/.cache/toonstudio-gen/i18n-builtins.json");
      const allTargets = collectI18nBuiltinTargets();

      // 1) 최초 실행: 전체 생성 + 캐시 스탬프 저장
      const firstOut = createMemoryStream();
      const first = runI18nBuiltinsSync({
        repoRoot: dir,
        cacheFile,
        stdout: firstOut,
        stderr: createMemoryStream(),
      });
      assert.equal(first.skipped, false);
      assert.equal(first.wrote.length, allTargets.length);

      // 2) 동일 입력 재실행: 캐시 적중으로 즉시 건너뜀
      const secondOut = createMemoryStream();
      const second = runI18nBuiltinsSync({
        repoRoot: dir,
        cacheFile,
        stdout: secondOut,
        stderr: createMemoryStream(),
      });
      assert.equal(second.skipped, true);
      assert.equal(second.wrote.length, 0);
      assert.match(secondOut.text(), /cache hit/u);

      // 3) --force 옵션: 입력이 동일해도 강제 재생성
      const forced = runI18nBuiltinsSync({
        repoRoot: dir,
        cacheFile,
        force: true,
        stdout: createMemoryStream(),
        stderr: createMemoryStream(),
      });
      assert.equal(forced.skipped, false);
      assert.equal(forced.reason, "forced");
      assert.equal(forced.wrote.length, allTargets.length);

      // 4) 산출물 수동 변조 시: --check는 실패하고 기본 실행은 캐시 미스로 복구
      const appBuiltinsPath = path.join(dir, allTargets[0]);
      writeFileSync(appBuiltinsPath, '{"en":{},"ko":{}}\n');

      const checkErr = createMemoryStream();
      const checkStale = runI18nBuiltinsSync({
        repoRoot: dir,
        cacheFile,
        checkOnly: true,
        stdout: createMemoryStream(),
        stderr: checkErr,
      });
      assert.equal(checkStale.stale.length, 1);
      assert.match(checkErr.text(), /stale:/u);

      const repaired = runI18nBuiltinsSync({
        repoRoot: dir,
        cacheFile,
        stdout: createMemoryStream(),
        stderr: createMemoryStream(),
      });
      assert.equal(repaired.skipped, false);
      assert.deepEqual(repaired.wrote, [allTargets[0]]);
      assert.equal(JSON.parse(readFileSync(appBuiltinsPath, "utf8")).ko["common.hello"], "안녕");

      // 5) 원본 로케일 입력 변경 시 캐시 무효화 및 해당 타깃만 갱신
      writeFileSync(
        path.join(dir, "apps/web/public/i18n/app/common/ko.json"),
        `${JSON.stringify({ "common.hello": "안녕하세요" }, null, 2)}\n`,
      );
      const updated = runI18nBuiltinsSync({
        repoRoot: dir,
        cacheFile,
        stdout: createMemoryStream(),
        stderr: createMemoryStream(),
      });
      assert.equal(updated.skipped, false);
      assert.deepEqual(updated.wrote, [allTargets[0]]);
      assert.equal(JSON.parse(readFileSync(appBuiltinsPath, "utf8")).ko["common.hello"], "안녕하세요");

      // 6) 복구 후 --check는 통과
      const checkClean = runI18nBuiltinsSync({
        repoRoot: dir,
        cacheFile,
        checkOnly: true,
        stdout: createMemoryStream(),
        stderr: createMemoryStream(),
      });
      assert.deepEqual(checkClean.stale, []);
    });
  });
});
