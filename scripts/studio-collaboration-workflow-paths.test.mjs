import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const root = fileURLToPath(new URL("../", import.meta.url));
const workflow = parse(readFileSync(resolve(root, ".github/workflows/studio-collaboration-sync.yml"), "utf8"));
const steps = workflow.jobs["document-convergence"].steps;
const assistant = "apps/web/src/domains/creator/live/StudioDraftOperationSyncAssistant.test.tsx";
const contract = "scripts/studio-collaboration-workflow-paths.test.mjs";

test("협업 계약 검사와 lint의 모든 명시 입력이 실제 파일을 가리킨다", () => {
  for (const name of ["Verify presence/document readiness policy and transport contracts", "Lint focused collaboration changes"]) {
    const command = steps.find((step) => step.name === name)?.run;
    assert.equal(typeof command, "string");
    const files = command.split(/\s+/u).filter((value) => /^(?:apps|scripts)\/.+\.[cm]?[jt]sx?$/u.test(value));
    assert(files.length >= 10);
    for (const file of files) {
      assert.doesNotMatch(file, /(?:^|\/)\.\.(?:\/|$)/u);
      assert(statSync(resolve(root, file)).isFile(), `협업 검사 입력 파일이 없습니다: ${file}`);
    }
    assert(files.includes(assistant));
  }
});

test("이동한 저장 보조와 경로 계약 변경도 검사를 실행하고 단위 검사보다 먼저 확인한다", () => {
  for (const trigger of ["pull_request", "push"]) {
    assert(workflow.on[trigger].paths.includes("apps/web/src/domains/creator/live/StudioDraftOperationSyncAssistant*"));
    assert(workflow.on[trigger].paths.includes(contract));
  }
  const install = steps.findIndex((step) => step.run === "pnpm install --frozen-lockfile --prefer-offline");
  const policy = steps.findIndex((step) => step.run === `node --test ${contract}`);
  const unit = steps.findIndex((step) => step.name === "Verify presence/document readiness policy and transport contracts");
  assert(install < policy && policy < unit);
  assert.equal(workflow.jobs["document-convergence"]["timeout-minutes"], 35);
});
