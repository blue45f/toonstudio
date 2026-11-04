import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const root = new URL("../", import.meta.url);
const workflow = parse(readFileSync(new URL(".github/workflows/studio-mesh-sync-repair.yml", root), "utf8"));
const core = parse(readFileSync(new URL(".github/workflows/ci.yml", root), "utf8"));
const commands = (job) => job.steps.map((step) => step.run ?? "").join("\n");

test("macOS 동기화·재접속 시험과 lint는 같은 플랫폼·제한으로 유지한다", () => {
  const job = workflow.jobs["macos-sync-contracts"];
  assert.equal(job["runs-on"], "macos-14");
  assert.equal(job["timeout-minutes"], 25);
  for (const file of ["studio-crdt-room-binding", "studio-live-p2p-overlay-transport", "studio-live-p2p-reconnect", "studio-live-collaboration-transport", "studio-live-signaling-server-transport", "studio-live-collaboration-room.ink", "studio-live-socket-transport", "studio-mesh-sync-regression"]) {
    assert.ok(commands(job).includes(`apps/web/src/domains/creator/live/${file}.test.ts`), file);
  }
  assert.match(commands(job), /pnpm exec eslint/u);
  assert.match(commands(job), /node --experimental-strip-types --test scripts\/verify-studio-p2p-channel-lifecycle\.mjs/u);
});

test("전체 타입 검사에는 Core와 동일한 입력·표준 명령·25분 제한을 사용한다", () => {
  const job = workflow.jobs["application-typecheck"];
  assert.equal(job["runs-on"], core.jobs.typecheck["runs-on"]);
  assert.equal(job["timeout-minutes"], 25);
  const checkout = (value) => value.steps.find((step) => step.uses === "actions/checkout@v7").with;
  assert.deepEqual(checkout(job), checkout(core.jobs.typecheck));
  assert.ok(job.steps.some((step) => step.run === "pnpm run typecheck"));
  assert.ok(job.steps.some((step) => step.run === "node --test scripts/studio-mesh-sync-typecheck-policy.test.mjs"));
});

test("기존 collaboration-sync 상태는 두 실제 작업이 성공한 경우에만 통과한다", () => {
  const gate = workflow.jobs["collaboration-sync"];
  assert.deepEqual(gate.needs, ["macos-sync-contracts", "application-typecheck"]);
  assert.equal(gate.if, "${{ always() }}");
  const step = gate.steps[0];
  assert.equal(step.env.MACOS_RESULT, "${{ needs['macos-sync-contracts'].result }}");
  assert.equal(step.env.TYPECHECK_RESULT, "${{ needs['application-typecheck'].result }}");
  for (const macos of ["success", "failure", "cancelled", "skipped", ""]) {
    for (const types of ["success", "failure", "cancelled", "skipped", ""]) {
      const result = spawnSync("bash", ["-c", step.run], { env: { ...process.env, MACOS_RESULT: macos, TYPECHECK_RESULT: types } });
      assert.equal(result.status === 0, macos === "success" && types === "success", `${macos}/${types}`);
    }
  }
});
