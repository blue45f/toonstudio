import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

import {
  QUICKSTART_COMMANDS,
  SCRIPT_GROUPS,
  buildScriptsCatalog,
  classifyScript,
  describeScript,
  filterCatalog,
  parseCliArgs,
} from "./repo-scripts-catalog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI_PATH = path.join(ROOT, "scripts/repo-scripts-catalog.mjs");
const PKG_PATH = path.join(ROOT, "package.json");
const HANGUL_PATTERN = /[가-힣]/u;

function runCli(args = []) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

test("실제 package.json 전체 스크립트(335+)가 10대 한글 그룹에 100% 누락·중복 없이 배정된다", () => {
  const pkg = JSON.parse(readFileSync(PKG_PATH, "utf8"));
  const expectedNames = Object.keys(pkg.scripts);
  assert.ok(expectedNames.length >= 335, `최소 335개 스크립트가 있어야 합니다 (현재 ${expectedNames.length})`);
  assert.equal(pkg.scripts["scripts:help"], "node scripts/repo-scripts-catalog.mjs");

  const catalog = buildScriptsCatalog({ packageJsonPath: PKG_PATH });
  assert.equal(catalog.totalScripts, expectedNames.length);
  assert.equal(catalog.groupCount, 10);

  const expectedTitles = [
    "1. 개발·실행",
    "2. 빌드·번들·프리캐시",
    "3. 배포·클라우드(1줄 명령)",
    "4. 타입·린트·아키텍처",
    "5. 핵심 단위/통합 테스트",
    "6. 스튜디오·브러시·3D 검증",
    "7. 문서·i18n·카탈로그",
    "8. 보안·라이선스·감사",
    "9. DB·API·로컬스택",
    "10. 하네스·기타 도구",
  ];
  assert.deepEqual(
    catalog.groups.map((g) => g.title),
    expectedTitles,
  );

  const seen = new Set();
  for (const group of catalog.groups) {
    assert.ok(group.count > 0, `그룹 ${group.title} 에 스크립트가 최소 1개 이상 배정되어야 합니다`);
    assert.equal(group.count, group.scripts.length);
    for (const item of group.scripts) {
      assert.ok(!seen.has(item.name), `중복 배정된 스크립트: ${item.name}`);
      seen.add(item.name);
      assert.ok(item.command.length > 0, `실행 명령이 비어 있습니다: ${item.name}`);
      assert.match(item.description, HANGUL_PATTERN, `한글 설명이 누락되었습니다: ${item.name} -> ${item.description}`);
    }
  }

  assert.equal(seen.size, expectedNames.length, "누락된 package.json 스크립트가 있습니다");
  for (const name of expectedNames) {
    assert.ok(seen.has(name), `누락된 스크립트: ${name}`);
  }
});

test("자주 쓰는 핵심 10줄 퀵스타트에 배포·빌드·검증 핵심 명령이 포함된다", () => {
  assert.equal(QUICKSTART_COMMANDS.length, 10);
  const commands = QUICKSTART_COMMANDS.map((q) => q.command).join("\n");
  assert.match(commands, /pnpm run deploy:doctor -- --json/u);
  assert.match(commands, /gh workflow run cloud-production-deploy\.yml -f mode=smart-release/u);
  assert.match(commands, /pnpm run deploy:web/u);
  assert.match(commands, /pnpm run build/u);
  assert.match(commands, /pnpm run validate:architecture/u);
});

test("CLI --json 옵션이 전체 335+ 스크립트와 10대 그룹을 구조화해 출력한다", () => {
  const pkg = JSON.parse(readFileSync(PKG_PATH, "utf8"));
  const result = runCli(["--json"]);
  assert.equal(result.status, 0, result.stderr);

  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.totalScripts, Object.keys(pkg.scripts).length);
  assert.equal(parsed.matchedCount, parsed.totalScripts);
  assert.equal(parsed.groupCount, 10);
  assert.equal(parsed.groups.length, 10);
  const summed = parsed.groups.reduce((sum, g) => sum + g.count, 0);
  assert.equal(summed, parsed.totalScripts);
});

test("CLI --search deploy 옵션이 배포 관련 스크립트를 정확히 검색한다", () => {
  const textResult = runCli(["--search", "deploy"]);
  assert.equal(textResult.status, 0, textResult.stderr);
  assert.match(textResult.stdout, /pnpm run deploy:doctor/u);
  assert.match(textResult.stdout, /pnpm run deploy:web/u);
  assert.match(textResult.stdout, /pnpm run deploy:cloud/u);

  const jsonResult = runCli(["--search", "deploy", "--json"]);
  assert.equal(jsonResult.status, 0, jsonResult.stderr);
  const parsed = JSON.parse(jsonResult.stdout);
  assert.equal(parsed.filters.search, "deploy");
  assert.ok(parsed.matchedCount >= 10, `deploy 검색 결과가 너무 적습니다: ${parsed.matchedCount}`);
  const names = new Set(parsed.groups.flatMap((g) => g.scripts.map((s) => s.name)));
  assert.ok(names.has("deploy:doctor"));
  assert.ok(names.has("deploy:web"));
  assert.ok(names.has("deploy:cloud"));
  assert.ok(!names.has("lint:quick"));
});

test("CLI --group 옵션은 영문 키·번호·한글명 모두 동일 그룹으로 필터링한다", () => {
  const byKey = JSON.parse(runCli(["--group", "deploy", "--json"]).stdout);
  const byNumber = JSON.parse(runCli(["--group", "3", "--json"]).stdout);
  const byKorean = JSON.parse(runCli(["--group", "배포", "--json"]).stdout);

  assert.equal(byKey.groups.length, 1);
  assert.equal(byKey.groups[0].key, "deploy");
  assert.equal(byKey.matchedCount, byNumber.matchedCount);
  assert.equal(byKey.matchedCount, byKorean.matchedCount);
  assert.deepEqual(
    byKey.groups[0].scripts.map((s) => s.name),
    byNumber.groups[0].scripts.map((s) => s.name),
  );
});

test("알 수 없는 그룹·옵션은 비정상 종료 코드(1)와 한글 오류를 반환한다", () => {
  const badGroup = runCli(["--group", "nonexistent-group"]);
  assert.equal(badGroup.status, 1);
  assert.match(badGroup.stderr, /알 수 없는 그룹/u);

  const badFlag = runCli(["--unknown-flag"]);
  assert.equal(badFlag.status, 1);
  assert.match(badFlag.stderr, /알 수 없는 옵션/u);
});

test("미지의 신규 스크립트도 하네스·기타 도구 그룹과 한글 설명으로 안전 폴백한다", () => {
  assert.equal(classifyScript("custom:future-utility"), "harness-tools");
  assert.match(describeScript("custom:future-utility"), HANGUL_PATTERN);
  assert.equal(SCRIPT_GROUPS.length, 10);

  const parsed = parseCliArgs(["--", "--group=dev", "--search=admin", "--json"]);
  assert.deepEqual(parsed, { group: "dev", search: "admin", json: true, all: false, help: false });

  const filtered = filterCatalog(buildScriptsCatalog({ packageJsonPath: PKG_PATH }), {
    group: "dev",
    search: "admin",
  });
  assert.equal(filtered.matchedCount, 1);
  assert.equal(filtered.groups[0].scripts[0].name, "dev:admin");
});
