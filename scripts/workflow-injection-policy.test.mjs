import assert from "node:assert/strict";

import {
  findRepositoryWorkflowInjectionRisks,
  findWorkflowInjectionRisks,
} from "./workflow-injection-policy.mjs";

const { describe, test } = process.env.VITEST
  ? await import("vitest")
  : await import("node:test");

function workflow(runBody, inputs = "") {
  return [
    "name: sample",
    "on:",
    "  workflow_dispatch:",
    inputs ? `    inputs:\n${inputs}` : "",
    "jobs:",
    "  job:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: step",
    "        run: |",
    ...runBody.split("\n").map((line) => `          ${line}`),
  ].filter((line) => line !== "").join("\n");
}

describe("워크플로 스크립트 주입 정책", () => {
  test("저장소의 모든 워크플로가 신뢰할 수 없는 값을 run 스크립트에 직접 보간하지 않는다", () => {
    const risks = findRepositoryWorkflowInjectionRisks();
    assert.deepEqual(
      risks.map((risk) => `${risk.file} [${risk.step}] ${risk.expression}`),
      [],
      "신뢰할 수 없는 값은 env 로 넘기고 스크립트에서는 \"$NAME\" 으로 읽어야 합니다.",
    );
  });

  test("workflow_dispatch 문자열 입력을 run 에 직접 쓰면 위험으로 잡는다", () => {
    const risks = findWorkflowInjectionRisks(
      workflow(
        'echo "${{ github.event.inputs.work_id }} ${{ inputs.asset_type }}"',
        "      work_id:\n        type: string\n      asset_type:\n        description: 입력",
      ),
    );
    assert.deepEqual(
      risks.map((risk) => risk.expression),
      ["github.event.inputs.work_id", "inputs.asset_type"],
    );
  });

  test("PR·브랜치·이슈 유래 값을 run 에 직접 쓰면 위험으로 잡는다", () => {
    const risks = findWorkflowInjectionRisks(
      workflow(
        [
          'echo "${{ github.head_ref }}"',
          'echo "${{ github.ref_name }}"',
          'echo "${{ github.event.pull_request.title }}"',
          'echo "${{ github.event.pull_request.head.ref }}"',
          'echo "${{ github.event.issue.body }}"',
          'echo "${{ github.event.workflow_run.head_branch }}"',
          'echo "${{ github.event.head_commit.message }}"',
        ].join("\n"),
      ),
    );
    assert.equal(risks.length, 7);
  });

  test("actions/github-script 의 script 안 보간도 같은 기준으로 검사한다", () => {
    const risks = findWorkflowInjectionRisks([
      "on: pull_request",
      "jobs:",
      "  job:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/github-script@v7",
      "        with:",
      "          script: |",
      "            core.info(`${{ github.event.pull_request.title }}`)",
    ].join("\n"));
    assert.equal(risks.length, 1);
    assert.equal(risks[0].kind, "github-script");
  });

  test("env 로 값을 넘기는 안전한 방식과 닫힌 값 공간의 컨텍스트는 통과시킨다", () => {
    const risks = findWorkflowInjectionRisks([
      "on:",
      "  workflow_dispatch:",
      "    inputs:",
      "      apply:",
      "        type: boolean",
      "      mode:",
      "        type: choice",
      "        options: [a, b]",
      "jobs:",
      "  job:",
      "    runs-on: ubuntu-latest",
      "    strategy:",
      "      matrix:",
      "        shard: [1, 2]",
      "    steps:",
      "      - name: safe",
      "        env:",
      "          WORK_ID: ${{ github.event.inputs.work_id }}",
      "        run: |",
      '          echo "$WORK_ID"',
      '          echo "${{ inputs.apply }} ${{ inputs.mode }} ${{ matrix.shard }}"',
      '          echo "${{ github.sha }} ${{ github.run_id }} ${{ github.event_name }}"',
      '          echo "${{ github.event.pull_request.number }} ${{ runner.temp }}"',
    ].join("\n"));
    assert.deepEqual(risks, []);
  });
});
