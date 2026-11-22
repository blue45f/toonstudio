import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const WORKFLOW_DIR = fileURLToPath(new URL("../.github/workflows/", import.meta.url));
const workflows = Object.fromEntries(
  readdirSync(WORKFLOW_DIR)
    .filter((name) => /\.ya?ml$/u.test(name))
    .sort()
    .map((name) => [name, readFileSync(`${WORKFLOW_DIR}/${name}`, "utf8")]),
);

const DECOUPLED_PUSH_WORKFLOWS = Object.freeze([
  ["acon-asset-intake.yml", true],
  ["brand-icon-quality.yml", true],
  ["bundle-visualizer.yml", true],
  ["creator-home-quality.yml", true],
  ["dontdraw-intake.yml", true],
  ["legal-policy-recovery.yml", true],
  ["lighthouse-ci.yml", true],
  ["market-cc0-delivery.yml", true],
  ["multi-cloud-local-dynamic-deploy.yml", false],
  ["reference-rebuild.yml", true],
  ["studio-asset-browser.yml", true],
  ["studio-asset-library-regression.yml", true],
  ["studio-asset-upload-integrity.yml", true],
  ["studio-brush-quality-portfolio.yml", true],
  ["studio-brush-semantic-quality.yml", true],
  ["studio-editor-client-runtime.yml", true],
  ["studio-interaction-integrity.yml", true],
  ["studio-local-document-regressions.yml", true],
  ["studio-menu-viewport.yml", true],
  ["studio-premium-assets-quality.yml", true],
  ["studio-raster-snapshot-stability.yml", true],
  ["studio-retouch-gesture-stability.yml", true],
  ["webgpu-dab-tile-binning-compute.yml", true],
  ["webtoon-assistant-regression.yml", true],
  ["webtoon-ci-failure-summary.yml", true],
]);

const TYPECHECK_CACHE_CONSUMER_WORKFLOWS = Object.freeze([
  "studio-asset-browser.yml",
  "studio-brush-quality-portfolio.yml",
  "studio-brush-semantic-quality.yml",
  "studio-editor-client-runtime.yml",
]);

function topLevelBlock(text, name) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line === `${name}:`);
  assert.ok(start >= 0, `최상위 블록 누락: ${name}`);
  const rest = lines.slice(start + 1);
  const next = rest.findIndex(
    (line) => line.trim() && !line.trimStart().startsWith("#") && !/^\s/u.test(line),
  );
  return lines.slice(start, next < 0 ? undefined : start + 1 + next).join("\n");
}

function jobBlock(ciSource, name) {
  const jobsSection = ciSource.slice(ciSource.indexOf("\njobs:\n") + 7);
  const blocks = jobsSection.split(/(?=^ {2}[a-z][a-z0-9-]*:\n)/mu);
  const match = blocks.find((entry) => entry.startsWith(`  ${name}:\n`));
  assert.ok(match, `CI 작업 누락: ${name}`);
  return match;
}

function assertDecoupledPushTriggers(workflowMap) {
  const seenCrons = new Map();
  for (const [filename, expectPullRequest] of DECOUPLED_PUSH_WORKFLOWS) {
    const text = workflowMap[filename];
    assert.ok(text, `워크플로 누락: ${filename}`);
    const events = topLevelBlock(text, "on");
    assert.doesNotMatch(events, /^ {2}push:/mu, `${filename}: 비필수 보조 워크플로에 push 트리거가 남아 있으면 안 됩니다`);
    assert.match(events, /^ {2}workflow_dispatch:/mu, `${filename}: 수동 실행(workflow_dispatch)은 유지해야 합니다`);
    assert.match(events, /^ {2}schedule:\n {4}- cron:\s*['"][^'"]+['"]/mu, `${filename}: 야간·주간 분산 schedule이 필요합니다`);
    if (expectPullRequest) {
      assert.match(events, /^ {2}pull_request:/mu, `${filename}: 기존 PR 게이트(pull_request)는 유지해야 합니다`);
    }
    const cron = events.match(/^ {4}- cron:\s*['"]([^'"]+)['"]/mu)?.[1];
    assert.ok(cron, `${filename}: cron 식을 읽지 못했습니다`);
    const parts = cron.trim().split(/\s+/u);
    assert.equal(parts.length, 5, `${filename}: 5필드 cron 식이어야 합니다 (${cron})`);
    const [minute, hour] = parts;
    assert.notEqual(minute, "0", `${filename}: 정시(:00) 집중 실행을 피해야 합니다 (${cron})`);
    if (filename !== "webtoon-ci-failure-summary.yml") {
      const hourNum = Number(hour);
      assert.ok(
        hourNum < 17 || hourNum >= 20,
        `${filename}: 일간 야간 QA/소크 구간(17~19 UTC)과 겹치지 않게 분산해야 합니다 (${cron})`,
      );
    }
    assert.ok(!seenCrons.has(cron), `중복 cron 슬롯(${cron}): ${seenCrons.get(cron)}, ${filename}`);
    seenCrons.set(cron, filename);
  }
}

test("분리된 25개 비필수 워크플로는 push:main 없이 분산 schedule·workflow_dispatch·기존 PR 게이트를 유지한다", () => {
  assertDecoupledPushTriggers(workflows);
});

test("분리 정책은 push 재유입·정시 크론·중복 슬롯·수동 실행 누락을 거부한다", () => {
  const sample = "lighthouse-ci.yml";
  assert.throws(() => assertDecoupledPushTriggers({
    ...workflows,
    [sample]: workflows[sample].replace("  workflow_dispatch:", "  push:\n    branches: [main]\n  workflow_dispatch:"),
  }));
  assert.throws(() => assertDecoupledPushTriggers({
    ...workflows,
    [sample]: workflows[sample].replace(/cron:\s*"[^"]+"/u, 'cron: "0 15 * * 1"'),
  }));
  assert.throws(() => assertDecoupledPushTriggers({
    ...workflows,
    [sample]: workflows[sample].replace(/cron:\s*"[^"]+"/u, 'cron: "17 18 * * 1"'),
  }));
  assert.throws(() => assertDecoupledPushTriggers({
    ...workflows,
    [sample]: workflows[sample].replace("  workflow_dispatch:\n", ""),
  }));
});

test("CI typecheck 잡은 fail-closed typecheck-shards 체크포인트 캐시를 복원하고 main push에서만 저장한다", () => {
  const ci = workflows["ci.yml"];
  const typecheck = jobBlock(ci, "typecheck");
  assert.match(typecheck, /scripts\/ci-queue-and-typecheck-cache\.test\.mjs/u);
  const preflightIndex = typecheck.indexOf("scripts/ci-queue-and-typecheck-cache.test.mjs");
  const installIndex = typecheck.indexOf("pnpm install --frozen-lockfile --prefer-offline");
  assert.ok(preflightIndex >= 0 && preflightIndex < installIndex, "캐시·대기열 정책 테스트는 의존성 설치 전에 실행해야 합니다");

  const keyIndex = typecheck.indexOf("node scripts/typecheck-shards.mjs --print-cache-key");
  const restoreIndex = typecheck.indexOf("id: typecheck-shards-cache\n        uses: actions/cache/restore@v6");
  const runIndex = typecheck.indexOf("pnpm run typecheck\n");
  const saveIndex = typecheck.indexOf("name: Save typecheck-shards checkpoint cache on main");
  assert.ok(keyIndex > installIndex, "캐시 키 계산은 의존성 설치 뒤에 위치해야 합니다");
  assert.ok(restoreIndex > keyIndex && restoreIndex < runIndex, "체크포인트 복원은 타입 검사 실행 전에 수행해야 합니다");
  assert.ok(saveIndex > runIndex, "체크포인트 저장은 타입 검사 성공 뒤에 수행해야 합니다");
  assert.match(typecheck, /path: node_modules\/\.cache\/typecheck-shards\/report\.json/u);
  assert.match(
    typecheck,
    /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main' && steps\.typecheck-shards-cache\.outputs\.cache-hit != 'true'\n {8}uses: actions\/cache\/save@v6/u,
  );
  assert.doesNotMatch(typecheck, /uses: actions\/cache@v\d+/u);
  assert.match(typecheck, /^ {10}TOONSTUDIO_TYPECHECK_MAX_SOURCE_BYTES: '3145728'$/mu);
});

test("CI build·수동 하네스·보조 빌드 워크플로는 동일 키로 typecheck-shards 체크포인트를 읽기 전용 복원한다", () => {
  const ci = workflows["ci.yml"];
  const build = jobBlock(ci, "build");
  const buildKeyIndex = build.indexOf("node scripts/typecheck-shards.mjs --print-cache-key");
  const buildRestoreIndex = build.indexOf("id: typecheck-shards-cache\n        uses: actions/cache/restore@v6");
  const buildRunIndex = build.indexOf("Build API and web without repeating the required web typecheck");
  assert.ok(buildKeyIndex >= 0 && buildRestoreIndex > buildKeyIndex && buildRestoreIndex < buildRunIndex);
  assert.doesNotMatch(build, /uses: actions\/cache\/save@v\d+|uses: actions\/cache@v\d+/u);

  const staticJob = jobBlock(ci, "static");
  const harnessKeyIndex = staticJob.indexOf("node scripts/typecheck-shards.mjs --print-cache-key");
  const harnessRestoreIndex = staticJob.indexOf("id: typecheck-shards-cache\n        uses: actions/cache/restore@v6");
  const harnessRunIndex = staticJob.indexOf("name: 수동 후보의 전체 하네스 검증");
  assert.ok(harnessKeyIndex >= 0 && harnessRestoreIndex > harnessKeyIndex && harnessRestoreIndex < harnessRunIndex);
  assert.doesNotMatch(staticJob, /uses: actions\/cache\/save@v\d+|uses: actions\/cache@v\d+/u);

  for (const filename of TYPECHECK_CACHE_CONSUMER_WORKFLOWS) {
    const text = workflows[filename];
    assert.ok(text.includes("node scripts/typecheck-shards.mjs --print-cache-key"), `${filename}: 캐시 키 계산 누락`);
    assert.ok(text.includes("uses: actions/cache/restore@v6"), `${filename}: 체크포인트 복원 누락`);
    assert.ok(text.includes("path: node_modules/.cache/typecheck-shards/report.json"), `${filename}: 체크포인트 경로 누락`);
  }
});

test("CI a11y 잡은 공유 Playwright Chromium 캐시를 복원하고 main push에서만 저장하며 기존 설치 명령을 유지한다", () => {
  const ci = workflows["ci.yml"];
  const a11y = jobBlock(ci, "a11y");
  const restoreIndex = a11y.indexOf("id: playwright-cache\n        uses: actions/cache/restore@v6");
  const installIndex = a11y.indexOf("run: pnpm exec playwright install --with-deps chromium");
  const saveIndex = a11y.indexOf("name: Save Playwright Chromium cache on main");
  assert.ok(restoreIndex >= 0 && restoreIndex < installIndex, "Playwright 캐시 복원은 Chromium 설치 전에 실행해야 합니다");
  assert.ok(saveIndex > installIndex, "Playwright 캐시 저장은 Chromium 설치 뒤에 실행해야 합니다");
  assert.match(a11y, /path: ~\/\.cache\/ms-playwright/u);
  assert.match(a11y, /key: \$\{\{ runner\.os \}\}-\$\{\{ runner\.arch \}\}-playwright-\$\{\{ hashFiles\('pnpm-lock\.yaml'\) \}\}/u);
  assert.match(
    a11y,
    /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main' && steps\.playwright-cache\.outputs\.cache-hit != 'true'\n {8}uses: actions\/cache\/save@v6/u,
  );
  assert.doesNotMatch(a11y, /uses: actions\/cache@v\d+/u);
});
