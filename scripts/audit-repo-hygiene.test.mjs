import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  auditRepoHygiene,
  DEFAULT_ROOT,
  formatHygieneReport,
  parseCliArgs,
  stripCommentsAndStringBodies,
} from "./audit-repo-hygiene.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const SCRIPT_PATH = fileURLToPath(new URL("./audit-repo-hygiene.mjs", import.meta.url));

function createTempRepo(tree) {
  const dir = mkdtempSync(path.join(tmpdir(), "toonstudio-hygiene-test-"));
  for (const [relPath, content] of Object.entries(tree)) {
    const abs = path.join(dir, relPath);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  return dir;
}

async function withTempRepo(tree, fn) {
  const dir = createTempRepo(tree);
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("parseCliArgs가 기본값과 옵션을 안정적으로 파싱하고 잘못된 입력을 거부한다", () => {
  const parsed = parseCliArgs(["--check", "--json", "--strict-orphans", "--max-root-files", "40", "--root", "."]);
  assert.equal(parsed.check, true);
  assert.equal(parsed.json, true);
  assert.equal(parsed.strictOrphans, true);
  assert.equal(parsed.maxRootFiles, 40);
  assert.equal(parsed.root, path.resolve("."));

  assert.throws(() => parseCliArgs(["--unknown-flag"]), /알 수 없는 옵션/u);
  assert.throws(() => parseCliArgs(["--max-root-files", "0"]), /양의 정수/u);
  assert.throws(() => parseCliArgs(["--root"]), /디렉터리 경로/u);
});

test("stripCommentsAndStringBodies가 정규식·문자열·주석 내부의 위장 코드를 제거한다", () => {
  const sample = [
    "// it.only('ignored', () => {})",
    "const rx = /cacheDir:\\s*`\\$\\{root\\}([^`]+)`/u;",
    "const fixture = `expect(true).toBe(true); test(\"empty\", () => {});`;",
    "test(\"real\", () => { expect(rx.test(fixture)).toBe(true); });",
  ].join("\n");
  const stripped = stripCommentsAndStringBodies(sample);
  assert.equal(stripped.includes("it.only"), false);
  assert.equal(stripped.includes("expect(true)"), false);
  assert.match(stripped, /expect\(rx\.test\(fixture\)\)\.toBe\(true\)/u);
});

test("깨끗한 저장소 픽스처는 위생 게이트를 0건 위반으로 통과한다", async () => {
  await withTempRepo(
    {
      "package.json": JSON.stringify(
        {
          name: "clean-repo",
          scripts: {
            build: "node scripts/build-app.mjs",
            preview: "vite preview",
            start: "vite preview",
            "test:ws": "pnpm --filter @demo/app run test",
          },
        },
        null,
        2,
      ),
      "apps/app/package.json": JSON.stringify({ name: "@demo/app", scripts: { test: "vitest run" } }),
      "scripts/build-app.mjs": "import { helper } from './lib/helper.mjs';\nconsole.log(helper());\n",
      "scripts/build-app.d.mts": "export function run(): void;\n",
      "scripts/lib/helper.mts": "export function helper(): string { return 'ok'; }\n",
      "apps/app/src/calc.test.ts": "import { expect, it } from 'vitest';\nit('adds', () => { expect(1 + 2).toBe(3); });\n",
      "apps/app/src/table.test.ts": "import { it } from 'vitest';\nconst cases = [];\nfor (const c of cases) it(c.name, c.run);\n",
      "docs/evidence/run-1/output.log": "archived evidence log\n",
      "tools/blender/character_kit/debug_render.py": "# allowed dev preview helper\n",
    },
    async (root) => {
      const report = await auditRepoHygiene({ root, maxRootFiles: 5 });
      assert.equal(report.ok, true);
      assert.deepEqual(report.hardViolations, []);
      assert.equal(report.orphanScripts.unreferencedTopLevelScripts.length, 0);
      assert.match(formatHygieneReport(report), /위생 게이트 통과/u);
    },
  );
});

test("임시·백업·로그·개인경로 파일과 루트 설정 난립을 탐지한다", async () => {
  await withTempRepo(
    {
      "package.json": JSON.stringify({ name: "messy-repo", scripts: {} }),
      "knip.json": "{}\n",
      "knip.jsonc": "{}\n",
      "opencode.json": "{}\n",
      ".opencode.jsonc": "{}\n",
      "playwright.extra.config.ts": "export default {};\n",
      "scratch.tmp": "temp\n",
      "apps/web/debug.log": "stray log\n",
      "scripts/debug-probe.mjs": "console.log('x');\n",
      "scripts/personal-slicer.py": "DIR = '/Users/alice/.gemini/antigravity/brain/123'\n",
    },
    async (root) => {
      const report = await auditRepoHygiene({ root, maxRootFiles: 3 });
      assert.equal(report.ok, false);
      assert.equal(report.tempAndDebugFiles.length, 4);
      assert.equal(report.rootSprawl.playwrightConfigs, 1);
      assert.equal(report.rootSprawl.duplicateConfigPairs.length, 2);
      assert.ok(report.hardViolations.some((line) => line.includes("루트 파일 수 초과")));
    },
  );
});

test("죽은 package.json 경로·하위스크립트·워크스페이스·중복명령·미사용별칭을 탐지한다", async () => {
  await withTempRepo(
    {
      "package.json": JSON.stringify(
        {
          name: "broken-pkg",
          scripts: {
            "run:missing-file": "node scripts/no-such-file.mjs",
            "run:missing-sub": "pnpm run does:not:exist",
            "run:missing-ws": "pnpm --filter @demo/missing run test",
            "dup:one": "node scripts/real.mjs --flag",
            "dup:two": "node scripts/real.mjs --flag",
            "unused:alias": "pnpm run dup:one",
          },
        },
        null,
        2,
      ),
      "scripts/real.mjs": "console.log('ok');\n",
    },
    async (root) => {
      const report = await auditRepoHygiene({ root });
      assert.equal(report.ok, false);
      assert.equal(report.packageScripts.missingPaths.length, 1);
      assert.equal(report.packageScripts.missingSubscripts.length, 1);
      assert.equal(report.packageScripts.missingWorkspaceScripts.length, 1);
      assert.equal(report.packageScripts.duplicateCommands.length, 1);
      assert.equal(report.packageScripts.unusedAliasWrappers.length, 1);
      assert.equal(report.packageScripts.unusedAliasWrappers[0].alias, "unused:alias");
    },
  );
});

test("죽은 고아 스크립트(깨진 임포트·원샷 패처·구 src 경로)와 미참조 수동 CLI를 구분한다", async () => {
  await withTempRepo(
    {
      "package.json": JSON.stringify({ name: "orphan-repo", scripts: {} }),
      "scripts/broken-import.mjs": "import { x } from './deleted-module.mjs';\nconsole.log(x);\n",
      "scripts/one-off-patcher.mjs": "import { writeFile } from 'node:fs/promises';\nasync function patch(f, a, b) { await writeFile(f, a.replace(a, b)); }\npatch('apps/web/src/a.ts', 'x', 'y');\n",
      "scripts/old-src-path.cjs": "const path = require('node:path');\nconst p = path.join(root, 'src/domains/creator/foo.ts');\nconsole.log(p);\n",
      "scripts/manual-cli.mjs": "console.log('manual cli');\n",
    },
    async (root) => {
      const relaxed = await auditRepoHygiene({ root });
      assert.equal(relaxed.ok, false);
      assert.equal(relaxed.orphanScripts.deadOrphanScripts.length, 3);
      assert.deepEqual(relaxed.orphanScripts.unreferencedTopLevelScripts, ["scripts/manual-cli.mjs"]);

      const strict = await auditRepoHygiene({ root, strictOrphans: true });
      assert.ok(strict.hardViolations.some((line) => line.includes("scripts/manual-cli.mjs")));
    },
  );
});

test("항상 참·assertion 0개·빈 블록·.only·디버그 프로브 테스트를 정확히 탐지한다", async () => {
  await withTempRepo(
    {
      "package.json": JSON.stringify({ name: "hollow-tests", scripts: {} }),
      "apps/web/src/tautology.test.ts": "import { expect, test } from 'vitest';\ntest('always true', () => { expect(true).toBe(true); });\n",
      "apps/web/src/zero.test.ts": "import { it } from 'vitest';\nit('does nothing', () => { const a = 1 + 1; void a; });\n",
      "apps/web/src/empty.test.ts": "import { test } from 'vitest';\ntest('empty', () => {});\n",
      "apps/web/src/only.test.ts": "import { expect, it } from 'vitest';\nit.only('locked', () => { expect(2).toBe(2); });\n",
      "apps/web/src/debug-probe.test.ts": "import { expect, it } from 'vitest';\nit('probe', () => { console.log('x'); expect(1 + 1).toBe(2); });\n",
      "apps/web/src/fixture-string.test.ts": "import { expect, it } from 'vitest';\nit('parses fixture', () => { const src = `it.only('x', () => {}); expect(true).toBe(true);`; expect(src.length).toBeGreaterThan(0); });\n",
    },
    async (root) => {
      const report = await auditRepoHygiene({ root });
      assert.equal(report.ok, false);
      assert.deepEqual(report.hollowTests.tautologyOnly.map((x) => x.file), ["apps/web/src/tautology.test.ts"]);
      assert.deepEqual(report.hollowTests.zeroAssertions.map((x) => x.file), ["apps/web/src/zero.test.ts"]);
      assert.deepEqual(report.hollowTests.emptyBodies.map((x) => x.file), ["apps/web/src/empty.test.ts"]);
      assert.deepEqual(report.hollowTests.exclusiveOnly.map((x) => x.file), ["apps/web/src/only.test.ts"]);
      assert.deepEqual(report.hollowTests.debugProbeTests.map((x) => x.file), ["apps/web/src/debug-probe.test.ts"]);
    },
  );
});

test("CLI --check --json 모드가 위반 시 종료 코드 1, 정상 시 종료 코드 0으로 동작한다", async () => {
  await withTempRepo(
    {
      "package.json": JSON.stringify({ name: "cli-pass", scripts: { ok: "node scripts/ok.mjs" } }),
      "scripts/ok.mjs": "console.log('ok');\n",
    },
    (root) => {
      const stdout = execFileSync(process.execPath, [SCRIPT_PATH, "--root", root, "--check", "--json"], {
        encoding: "utf8",
      });
      const parsed = JSON.parse(stdout);
      assert.equal(parsed.ok, true);
    },
  );

  await withTempRepo(
    {
      "package.json": JSON.stringify({ name: "cli-fail", scripts: { dead: "node scripts/missing.mjs" } }),
    },
    (root) => {
      let exitCode = 0;
      try {
        execFileSync(process.execPath, [SCRIPT_PATH, "--root", root, "--check"], {
          encoding: "utf8",
          stdio: "pipe",
        });
      } catch (error) {
        exitCode = error.status ?? 1;
      }
      assert.equal(exitCode, 1);
    },
  );
});

test("현재 ToonStudio 저장소가 위생 게이트 차단 위반 0건으로 통과한다", async () => {
  const report = await auditRepoHygiene({ root: DEFAULT_ROOT });
  assert.deepEqual(report.hardViolations, []);
  assert.equal(report.ok, true);
});
