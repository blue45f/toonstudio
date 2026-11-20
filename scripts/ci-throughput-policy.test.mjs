import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { isProtectedActionsRun, selectSupersededActionsRuns } from "./cleanup-superseded-actions-runs.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const directory = fileURLToPath(new URL("../.github/workflows/", import.meta.url));
const workflows = Object.fromEntries(readdirSync(directory)
  .filter((name) => /\.ya?ml$/u.test(name))
  .map((name) => [name, readFileSync(`${directory}/${name}`, "utf8")]));
const nightly = ["main-full-qa-fast-diagnostics.yml", "main-full-qa-studio.yml"];
const nightlyRegressions = [
  "apps/web/src/domains/creator/ai/StudioStrokeProposalReviewPanel.test.tsx",
  "apps/web/src/domains/creator/ai/studio-3d-generation-client.test.ts",
  "apps/web/src/domains/creator/filter/studio-adjustment-effect-graph.test.ts",
  "apps/web/src/domains/creator/layer/studio-layer-effects-graph-adapter.test.ts",
  "tests/integration/web-api/domains/creator/studio-large-epics-product-wiring.test.ts",
  "apps/web/src/domains/creator/studio-cuttoon-editor/studio-soft-proofing.test.ts",
];

// 의존성 설치 전에도 현재 워크플로의 들여쓰기 블록을 검사한다.
function block(text, name, indent) {
  const lines = text.split("\n");
  const start = lines.indexOf(`${" ".repeat(indent)}${name}:`);
  assert.ok(start >= 0, `필수 블록 누락: ${name}`);
  const next = lines.slice(start + 1).findIndex((line) =>
    line.trim() && !line.trimStart().startsWith("#") && line.search(/\S/u) <= indent);
  return lines.slice(start, next < 0 ? undefined : start + 1 + next).join("\n");
}

function validateNightlyRegressions(text) {
  const job = block(text, "regression-tests", 2);
  assert.match(job, /^ {4}runs-on: ubuntu-24.04-arm$/mu);
  assert.match(job, /^ {4}timeout-minutes: 30$/mu);
  assert.doesNotMatch(job, /^ {4}(?:strategy|if):|continue-on-error|\|\| true/mu);
  assert.equal(job.match(/run: pnpm install --frozen-lockfile/gu)?.length, 1);
  const steps = job.split(/(?=^ {6}- )/mu).filter((step) => step.includes("run: pnpm exec vitest run"));
  const targets = steps.map((step) => step.match(/^ {8}run: pnpm exec vitest run (\S+)$/mu)?.[1]);
  assert.deepEqual(targets, nightlyRegressions, "6개 회귀를 누락·중복·필터 없이 별도 실행해야 한다");
  for (const step of steps) {
    assert.match(step, /^ {6}- name: \S.+$/mu);
    assert.ok(step.includes("        if: ${{ !cancelled() }}"), "앞선 실패 이후에도 나머지 회귀를 실행해야 한다");
  }
  for (const target of targets) {
    assert.ok(existsSync(new URL(`../${target}`, import.meta.url)), `없는 회귀 대상: ${target}`);
  }
}

function artifactRetentions(text) {
  return text.split(/(?=^ {6}- )/mu)
    .filter((step) => step.includes("uses: actions/upload-artifact@"))
    .map((step) => [step.match(/^ {10}name: (.+)$/mu)?.[1],
      Number(step.match(/^ {10}retention-days: (\d+)$/mu)?.[1])]);
}

function validatePolicy(files) {
  assert.equal(files["full-test-suite.yml"], undefined, "do not restore the duplicate full suite");
  const full = files["full-test-diagnostic.yml"];
  assert.match(full, /^ {2}pull_request:\n {4}branches: \[main\]/mu);
  assert.match(full, /^ {2}workflow_dispatch:/mu);
  assert.match(full, /cancel-in-progress: true/u);
  assert.equal(full.match(/run: node scripts\/run-full-test-ci\.mjs/gu)?.length, 1);
  for (const [name, text] of Object.entries(files)) {
    if (name === "full-test-diagnostic.yml") continue;
    const automatic = /^ {2}(?:pull_request|push):/mu.test(text);
    assert.ok(!automatic || !/(?:run-full-test-ci\.mjs|run: pnpm (?:run )?test\s*$)/mu.test(text),
      `${name}: duplicate automatic root/performance suite`);
  }
  for (const name of nightly) {
    const text = files[name];
    assert.match(text, /^ {2}schedule:\n {4}- cron: /mu, `${name}: keep nightly coverage`);
    assert.match(text, /^ {2}workflow_dispatch:/mu, `${name}: keep on-demand coverage`);
    assert.doesNotMatch(text, /^ {2}(?:push|pull_request|workflow_run):/mu, `${name}: no merge fanout`);
    assert.match(text, /cancel-in-progress: false/u, `${name}: preserve evidence`);
    assert.doesNotMatch(text, /continue-on-error/u, `${name}: real failures stay failures`);
    const matrices = text.match(/ {6}fail-fast: false\n/gu) ?? [];
    assert.ok(matrices.length > 0);
    assert.equal(text.match(/ {6}fail-fast: false\n {6}max-parallel: 2\n/gu)?.length,
      matrices.length, `${name}: bound every diagnostic matrix`);
  }
}

test("CI throughput policy preserves one full PR suite and bounded nightly diagnostics", () => {
  validatePolicy(workflows);
  assert.match(workflows["ci.yml"], /scripts\/ci-throughput-policy\.test\.mjs/u);
});

test("야간 회귀는 설치를 한 번만 하고 6개 원래 검사를 실패 이후에도 독립 실행한다", () => {
  validateNightlyRegressions(workflows["main-full-qa-fast-diagnostics.yml"]);
});

test("야간 회귀 누락·실패 후 생략·오류 무시를 거부한다", () => {
  const text = workflows["main-full-qa-fast-diagnostics.yml"];
  const command = `run: pnpm exec vitest run ${nightlyRegressions[0]}`;
  for (const changed of [
    text.replace(command, "run: echo 회귀 누락"),
    text.replace("  regression-tests:\n", "  regression-tests:\n    if: false\n"),
    text.replace("        if: ${{ !cancelled() }}", "        if: success()"),
    text.replace(command, `${command}\n        continue-on-error: true`),
    text.replace(command, `${command} || true`),
  ]) assert.throws(() => validateNightlyRegressions(changed));
});

test("정기 정리는 시간마다 수행하고 main 병합·수동 정리 경로를 유지한다", () => {
  const events = block(workflows["cleanup-merged-branches.yml"], "on", 0);
  assert.equal(block(events, "schedule", 2).trim(), 'schedule:\n    - cron: "7 * * * *"');
  assert.match(block(events, "push", 2), /branches:\n {6}- main$/mu);
  assert.ok(block(events, "workflow_dispatch", 2));
  const closed = workflows["cleanup-merged-pr-branches.yml"];
  assert.match(closed, /types: \[closed\]/u);
  assert.match(closed, /github\.event\.pull_request\.merged == true/u);
});

test("Scene3D·Health는 같은 PR만 취소하고 main·수동 요청은 별도 실행으로 보존한다", () => {
  for (const name of ["studio-scene3d-next.yml", "health-recovery-diagnostics.yml"]) {
    const concurrency = block(workflows[name], "concurrency", 0);
    assert.ok(concurrency.includes("  group: ${{ github.workflow }}-${{ github.event_name }}-${{ github.event_name == 'pull_request' && github.event.pull_request.number || github.run_id }}"));
    assert.ok(concurrency.includes("  cancel-in-progress: ${{ github.event_name == 'pull_request' }}"));
    assert.ok(block(block(workflows[name], "on", 0), "workflow_dispatch", 2));
  }
  const health = workflows["health-recovery-diagnostics.yml"];
  assert.match(block(block(health, "on", 0), "push", 2), /branches: \[main\]/u);
  assert.match(block(health, "production-inspect", 2), /^ {4}if: false$/mu);
});

test("환경 팩은 PR과 main에서 같은 경로와 실제 Blender 검증을 유지한다", () => {
  const text = workflows["studio-environment-pack-validation.yml"];
  const events = block(text, "on", 0);
  const push = block(events, "push", 2);
  const pull = block(events, "pull_request", 2);
  assert.match(push, /^ {4}branches: \[main\]$/mu);
  const paths = (event) => [...event.matchAll(/^ {6}- "(.+)"$/gmu)].map((match) => match[1]);
  assert.deepEqual(paths(push), paths(pull));
  assert.deepEqual(paths(push), [
    ".github/workflows/studio-environment-pack-validation.yml",
    "scripts/blender/refine_studio_environments_v6.py",
    "scripts/verify-studio-environment-pack.mjs",
    "scripts/verify-studio-environment-pack.test.mjs",
    "tests/blender/test_studio_environment_release.py",
    "apps/web/public/assets/3d/environments/refined-v6/**",
  ]);
  assert.ok(block(events, "workflow_dispatch", 2));
  const blender = block(text, "real-blender", 2);
  assert.match(blender, /^ {4}needs: pack-contracts$/mu);
  assert.ok(blender.includes('"$BLENDER_PATH" --background --python-exit-code 1'));
  assert.ok(blender.includes("--python scripts/blender/refine_studio_environments_v6.py --"));
  assert.ok(blender.includes("run: node scripts/verify-studio-environment-pack.mjs"));
});

test("대형 전달용 dist만 하루 보관하고 회귀·브라우저·Worker 증빙 보존기간은 유지한다", () => {
  assert.deepEqual(artifactRetentions(workflows["studio-discovery-ux.yml"]), [
    ["studio-discovery-dist", 1],
    ["studio-drawing-ux-${{ github.run_id }}-${{ github.run_attempt }}", 7],
    ["studio-discovery-browser-${{ github.run_id }}-${{ github.run_attempt }}", 7],
  ]);
  assert.deepEqual(artifactRetentions(workflows["studio-brush-filter-stability.yml"]), [
    ["studio-stability-unit-results", 7],
    ["studio-stability-dist", 1],
    ["studio-stability-filter-worker", 3],
    ["studio-stability-${{ matrix.suite }}", 7],
  ]);
});

test("야간 독립 검증은 미리보기를 직접 열고 AI 예시를 평가기 계약으로만 표시한다", () => {
  const text = workflows["main-full-qa-studio.yml"];
  assert.match(text, /long-stroke\|TOONSPECTRUM_LONG_STROKE_SPAWN_PREVIEW=1 pnpm run verify:studio-long-stroke/u);
  assert.match(text, /ai-quality-evaluator-contract\|pnpm exec vitest run apps\/web\/src\/domains\/creator\/ai\/studio-ai-quality-benchmark\.test\.ts && pnpm run verify:studio-ai-quality --input tests\/benchmarks\/fixtures\/studio-ai-quality\.example\.json/u);
  assert.doesNotMatch(text, /ai-quality\|pnpm run verify:studio-ai-quality\s*$/mu);
});

test("throughput policy rejects another automatic full-suite copy under any filename", () => {
  for (const name of ["full-test-suite.yml", "accidental-full-copy.yml"]) {
    assert.throws(() => validatePolicy({ ...workflows, [name]: workflows["full-test-diagnostic.yml"] }),
      /duplicate/u);
  }
});

test("throughput policy rejects removing full PR coverage or nightly/manual diagnostics", () => {
  assert.throws(() => validatePolicy({ ...workflows,
    "full-test-diagnostic.yml": workflows["full-test-diagnostic.yml"].replace("  pull_request:", "  unused:") }));
  for (const name of nightly) {
    for (const change of [
      (text) => text.replace("  schedule:", "  push:"),
      (text) => text.replace("  workflow_dispatch:", "  unused:"),
      (text) => text.replace("max-parallel: 2", "max-parallel: 20"),
      (text) => text.replace("cancel-in-progress: false", "cancel-in-progress: true"),
    ]) assert.throws(() => validatePolicy({ ...workflows, [name]: change(workflows[name]) }));
  }
});

const mainRun = (id, status = "in_progress") => ({
  id, workflow_id: 1, event: "push", name: "CI", path: ".github/workflows/ci.yml",
  head_branch: "main", head_sha: `sha-${id}`, status,
  created_at: `2026-09-20T00:0${id}:00Z`, pull_requests: [],
});

test("external cleanup cannot cancel running, superseded or old queued main core", () => {
  for (const status of ["in_progress", "queued", "pending"]) {
    assert.deepEqual(selectSupersededActionsRuns([mainRun(1, status), mainRun(2, status)],
      { now: Date.parse("2026-09-21T00:00:00Z") }), []);
  }
});

test("cleanup still removes superseded PR checks and ordinary diagnostics", () => {
  const pr = (id) => ({ ...mainRun(id), event: "pull_request", head_branch: "feature/a",
    pull_requests: [{ number: 99 }] });
  const result = selectSupersededActionsRuns([pr(1), pr(2)],
    { pullRequestStates: new Map([[99, "open"]]) });
  assert.deepEqual(result.map(({ run }) => run.id), [1]);
  assert.equal(isProtectedActionsRun({ ...mainRun(1), name: "Other", path: ".github/workflows/other.yml" }), false);
});

test("closed-PR cleanup is not misclassified as stale and security/manual runs remain protected", () => {
  const closedCleanup = { ...mainRun(1), event: "pull_request", head_branch: "feature/closed",
    path: ".github/workflows/cleanup-merged-pr-branches.yml", name: "Cleanup merged PR branches",
    pull_requests: [{ number: 99 }] };
  assert.deepEqual(selectSupersededActionsRuns([closedCleanup],
    { pullRequestStates: new Map([[99, "closed"]]) }), []);
  assert.equal(isProtectedActionsRun({ event: "dynamic", path: "dynamic/github-code-scanning/codeql" }), true);
  assert.deepEqual(selectSupersededActionsRuns([mainRun(1),
    { ...mainRun(2), event: "workflow_dispatch" }, { ...mainRun(3), event: "merge_group" }]), []);
});


test("related-source validation retains documentation evidence without restoring heavy assets", () => {
  const text = workflows["toonstudio-session-goals.yml"];
  assert.ok(!text.includes("!/docs/"), "related content tests need their tracked evidence");
  assert.ok(text.includes("!/apps/web/public/assets/"));
  assert.ok(text.includes("!/artifacts/"));
  assert.ok(text.includes("pnpm exec vitest related"), "retain the real related tests");
});
