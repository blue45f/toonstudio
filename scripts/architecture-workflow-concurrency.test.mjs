import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const workflow = readFileSync(
  new URL("../.github/workflows/architecture-boundaries.yml", import.meta.url),
  "utf8",
);
const core = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

function concurrencyFor(source, eventName, runId, pullRequestNumber, ref = "refs/heads/main") {
  const block = source.match(/^concurrency:\n((?:[ \t].*\n|\n|#.*\n)*)/mu)?.[1];
  assert.ok(block, "아키텍처 검증은 PR의 이전 head를 취소할 concurrency가 필요하다");
  const group = block.match(/^ {2}group: (.+)$/mu)?.[1];
  const cancel = block.match(/^ {2}cancel-in-progress: (.+)$/mu)?.[1];
  assert.ok(group && cancel, "concurrency의 그룹과 취소 조건을 모두 명시한다");
  const values = {
    "github.event_name": eventName,
    "github.workflow": "Architecture boundaries",
    "github.event.pull_request.number || github.run_id": pullRequestNumber || runId,
    "github.event.pull_request.number || github.ref": pullRequestNumber || ref,
    "github.sha": `sha-${runId}`,
  };
  const resolved = group.replace(/\$\{\{\s*(.*?)\s*\}\}/gu, (_, expression) => {
    assert.ok(Object.hasOwn(values, expression), `검토되지 않은 그룹 식: ${expression}`);
    return String(values[expression]);
  });
  if (cancel === "true" || cancel === "false") return { group: resolved, cancel: cancel === "true" };
  assert.equal(cancel, "${{ github.event_name == 'pull_request' }}");
  return { group: resolved, cancel: eventName === "pull_request" };
}

function validateCancellationPolicy(source) {
  const previous = concurrencyFor(source, "pull_request", 100, 7);
  const current = concurrencyFor(source, "pull_request", 101, 7);
  assert.equal(previous.group, current.group, "같은 PR의 새 head는 기존 그룹을 대체한다");
  assert.equal(current.cancel, true, "이전 PR head의 실제 실행을 취소한다");
  assert.notEqual(current.group, concurrencyFor(source, "pull_request", 102, 8).group,
    "서로 다른 PR의 실행을 취소하지 않는다");
  for (const eventName of ["push", "workflow_dispatch", "merge_group"]) {
    const first = concurrencyFor(source, eventName, 7);
    const second = concurrencyFor(source, eventName, 8);
    assert.equal(first.cancel, false, `${eventName} 실행 중 취소 금지`);
    assert.equal(second.cancel, false, `${eventName} 실행 중 취소 금지`);
    assert.notEqual(first.group, second.group,
      `${eventName} 대기열도 run_id별로 분리해 이전 pending 실행을 보존한다`);
    assert.notEqual(first.group, current.group, "PR 번호와 run_id가 같아도 이벤트를 격리한다");
  }
}

test("아키텍처 검증은 같은 PR의 이전 head만 취소하고 main 실행·대기열을 보존한다", () => {
  validateCancellationPolicy(workflow);
});

test("아키텍처 검증 정책은 PR 취소 누락·main 취소·공유 대기열·SHA별 그룹을 거부한다", () => {
  const changes = [
    (source) => source.replace("cancel-in-progress: ${{ github.event_name == 'pull_request' }}", "cancel-in-progress: false"),
    (source) => source.replace("cancel-in-progress: ${{ github.event_name == 'pull_request' }}", "cancel-in-progress: true"),
    (source) => source.replace("github.event.pull_request.number || github.run_id", "github.event.pull_request.number || github.ref"),
    (source) => source.replace("github.event.pull_request.number || github.run_id", "github.sha"),
    (source) => source.replace("architecture-boundaries-${{ github.event_name }}-", "architecture-boundaries-"),
  ];
  for (const change of changes) {
    const modified = change(workflow);
    assert.notEqual(modified, workflow, "회귀 입력이 실제 워크플로를 변경해야 한다");
    assert.throws(() => validateCancellationPolicy(modified));
  }
});

test("아키텍처 검증의 기존 트리거·읽기 권한·검증 명령은 유지한다", () => {
  assert.match(workflow, /^name: Architecture boundaries$/mu);
  assert.match(workflow, /^ {2}pull_request:\n {4}paths:/mu);
  assert.match(workflow, /^ {2}push:\n {4}branches: \[main\]/mu);
  assert.match(workflow, /^permissions:\n {2}contents: read\n/mu);
  assert.doesNotMatch(workflow, /continue-on-error|--no-verify|CI_CORE_BYPASS/u);
  for (const command of [
    "pnpm install --frozen-lockfile",
    "node scripts/validate-app-boundaries.mjs",
    "pnpm --filter @toonstudio/contracts run typecheck",
    "pnpm --filter @toonstudio/admin-web typecheck",
    "pnpm --filter @toonstudio/admin-web build",
    "pnpm --filter @toonstudio/character-lab typecheck",
    "pnpm --filter @toonstudio/character-lab build",
    "pnpm --filter @toonstudio/character-lab test",
    "pnpm --filter @toonstudio/brush-lab typecheck",
    "pnpm --filter @toonstudio/brush-lab build",
    "rustup toolchain install 1.97.0 --profile minimal --target wasm32-unknown-unknown",
    "bash apps/brush-lab/wasm/sumi-kernel/build.sh --check",
    "pnpm --filter @toonstudio/brush-lab test",
  ]) assert.ok(workflow.includes(command), `기존 필수 검증 명령 보존: ${command}`);
});

test("새 concurrency 회귀는 설치 전 core 계약 검사에 연결된다", () => {
  const preflight = core.indexOf("node --test");
  const contract = core.indexOf("scripts/architecture-workflow-concurrency.test.mjs");
  const install = core.indexOf("pnpm install --frozen-lockfile", preflight);
  assert.ok(preflight >= 0 && contract > preflight && install > contract);
});
