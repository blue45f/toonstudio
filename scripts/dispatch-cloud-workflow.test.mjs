import assert from "node:assert/strict";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
import { dispatchCloudWorkflow, parseCloudDispatchArgs } from "./dispatch-cloud-deploy.mjs";

const fields = { ref: "a".repeat(40), deploy_web: "true" };

function dispatcher({ response, watchError } = {}) {
  const calls = [];
  const messages = [];
  return {
    calls, messages,
    run(watch) {
      return dispatchCloudWorkflow(fields, {
        watch,
        log: (message) => messages.push(message),
        exec(program, args, options) {
          assert.equal(program, "gh");
          calls.push(args);
          if (args[0] === "api") {
            assert.deepEqual(JSON.parse(options.input), { ref: "main", inputs: fields });
            assert.ok(args.includes("repos/blue45f/toonstudio/actions/workflows/cloud-production-deploy.yml/dispatches"));
            return response ?? '{"workflow_run_id":123}';
          }
          if (watchError) throw watchError;
          return "";
        },
      });
    },
  };
}

test("대기 옵션은 방금 발급된 실행 ID를 끝까지 추적한다", () => {
  const probe = dispatcher();
  const runUrl = probe.run(true);
  assert.match(runUrl, /\/actions\/runs\/123$/u);
  assert.equal(probe.calls.length, 2);
  assert.deepEqual(probe.calls[1].slice(0, 3), ["run", "watch", "123"]);
  assert.ok(probe.calls[1].includes("--exit-status"));
});

test("대기하지 않아도 정확한 실행 링크를 돌려준다", () => {
  const probe = dispatcher();
  assert.match(probe.run(false), /\/123$/u);
  assert.equal(probe.calls.length, 1);
});

test("중복 실행을 막고 응답 유실과 잘못된 실행 ID를 보고한다", () => {
  for (const response of ["", "{}", '{"workflow_run_id":-1}', '{"workflow_run_id":"123"}']) {
    const probe = dispatcher({ response });
    assert.throws(() => probe.run(true), /실행 기록을 확인/u);
    assert.equal(probe.calls.length, 1);
  }
});

test("실패한 배포 감시는 접수된 실행 링크와 오류를 돌려준다", () => {
  const probe = dispatcher({ watchError: new Error("watch failed") });
  assert.throws(() => probe.run(true), /성공을 확인하지 못했습니다.*\/runs\/123/u);
  assert.equal(probe.calls.length, 2);
});

test("로컬 OAuth 진단은 쓰기·원격 드라이런 명령과 함께 실행할 수 없다", () => {
  assert.equal(parseCloudDispatchArgs(["--check-local-oauth"]).status, true);
  for (const flag of ["--web", "--api-image", "--dry-run", "--watch"]) {
    assert.throws(() => parseCloudDispatchArgs(["--check-local-oauth", flag]), /읽기 전용/u);
  }
});

test("--watch-interval 옵션을 5~60초 범위로 검증하고 감시 명령에 전달한다", () => {
  assert.equal(parseCloudDispatchArgs(["--web", "--watch"]).watchIntervalSec, 15);
  assert.equal(parseCloudDispatchArgs(["--web", "--watch", "--watch-interval=8"]).watchIntervalSec, 8);
  for (const bad of ["--watch-interval=4", "--watch-interval=61", "--watch-interval=abc"]) {
    assert.throws(() => parseCloudDispatchArgs(["--web", "--watch", bad]), /5~60초/u);
  }
  const calls = [];
  dispatchCloudWorkflow(fields, {
    watch: true,
    watchIntervalSec: 8,
    log: () => {},
    exec(_program, args) {
      calls.push(args);
      return args[0] === "api" ? '{"workflow_run_id":456}' : "";
    },
  });
  assert.deepEqual(calls[1].slice(-2), ["--interval", "8"]);
});

test("--smart와 --base-sha 옵션 조합 검증 및 하위 호환성을 유지한다", () => {
  const baseSha = "b".repeat(40);
  const smartOnly = parseCloudDispatchArgs(["--smart", `--base-sha=${baseSha}`]);
  assert.equal(smartOnly.smart, true);
  assert.equal(smartOnly.status, false);
  assert.equal(smartOnly.baseSha, baseSha);

  const statusWithBase = parseCloudDispatchArgs(["--check-local-oauth", "--base-sha", baseSha]);
  assert.equal(statusWithBase.status, true);
  assert.equal(statusWithBase.localOAuth, true);
  assert.equal(statusWithBase.baseSha, baseSha);

  assert.throws(() => parseCloudDispatchArgs(["--base-sha=invalid"]), /40자리/u);
  assert.throws(() => parseCloudDispatchArgs(["--dry-run", "--smart"]), /--dry-run/u);
  assert.throws(() => parseCloudDispatchArgs(["--check-local-oauth", "--smart"]), /읽기 전용/u);
});
