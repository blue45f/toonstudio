const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectCommitRequiredGates } from "./dispatch-cloud-deploy.mjs";

const sha = "a".repeat(40);
const repo = "blue45f/toonstudio";
const canonical = { id: 220, path: ".github/workflows/ci.yml", event: "push", head_branch: "main", head_sha: sha, run_number: 40, run_attempt: 2, status: "completed", conclusion: "success" };
const job = (name, change = {}) => ({ name, run_id: 220, run_attempt: 2, head_sha: sha, status: "completed", conclusion: "success", ...change });
const required = [job("core"), job("verify")];

function inspect({ runs = [canonical], jobs = required, refreshed = runs } = {}) {
  let queriedRuns = 0;
  const calls = [];
  const execFileImpl = (command, args) => {
    assert.equal(command, "gh");
    const endpoint = args[1];
    calls.push(endpoint);
    // 이전 구현은 다른 workflow가 같은 이름으로 남긴 체크를 읽으면 승인한다.
    if (endpoint.includes("/check-runs")) return JSON.stringify({ check_runs: required.map((j, i) => ({ ...j, id: i + 1, app: { slug: "github-actions" } })) });
    assert(args.includes("--paginate") && args.includes("--slurp"));
    if (endpoint.includes("/actions/workflows/ci.yml/runs?")) {
      const url = new URL(endpoint, "https://api.github.com/");
      assert.equal(url.searchParams.get("branch"), "main");
      assert.equal(url.searchParams.get("event"), "push");
      assert.equal(url.searchParams.get("head_sha"), sha);
      return JSON.stringify([{ workflow_runs: queriedRuns++ === 0 ? runs : refreshed }]);
    }
    assert.equal(endpoint, `repos/${repo}/actions/runs/220/attempts/2/jobs?per_page=100`);
    return JSON.stringify([{ jobs: jobs.slice(0, 1) }, { jobs: jobs.slice(1) }]);
  };
  return { result: inspectCommitRequiredGates(sha, { repoSlug: repo, execFileImpl }), calls };
}

test("승인 SHA의 main push 현재 시도에서 두 필수 job 모두 성공해야 한다", () => {
  const { result, calls } = inspect();
  assert.deepEqual(result.gates, { core: "success", verify: "success" });
  assert.equal(result.allGreen, true);
  assert.equal(result.runId, 220);
  assert.equal(result.runAttempt, 2);
  assert(!calls.some((url) => url.includes("/check-runs")));
});

for (const [reason, patch] of Object.entries({
  "동명 타 workflow": { path: ".github/workflows/quality.yml" },
  "수동 실행": { event: "workflow_dispatch" },
  "PR 실행": { event: "pull_request" },
  "다른 브랜치": { head_branch: "feature" },
  "다른 커밋": { head_sha: "b".repeat(40) },
})) {
  test(reason+"의 초록 체크는 배포를 승인하지 않는다", () => {
    assert.equal(inspect({ runs: [{ ...canonical, ...patch }] }).result.allGreen, false);
  });
}

test("새 main push가 이전 녹색 run이나 이전 attempt를 대체한다", () => {
  const old = { ...canonical, id: 199, run_number: 39, run_attempt: 5 };
  const previousAttempt = { ...canonical, run_attempt: 1 };
  for (const changed of [{ status: "in_progress", conclusion: null }, { status: "completed", conclusion: "failure" }]) {
    assert.equal(inspect({ runs: [old, previousAttempt, { ...canonical,...changed }], jobs: [job("core",{run_attempt:1}), job("verify",{run_attempt:1})] }).result.allGreen, false);
  }
});

test("현재 시도의 타 run·SHA·이전 시도·중복·누락·진행 중·실패한 이름은 거절한다", () => {
  for (const extra of [[], [job("verify", { run_id: 199 })], [job("verify", { run_attempt: 1 })], [job("verify", { head_sha: "b".repeat(40) })],
    [job("verify"),job("verify")], [job("verify",{status:"queued",conclusion:null})], [job("verify",{conclusion:"failure"})]]) {
    assert.equal(inspect({ jobs:[job("core"),...extra] }).result.allGreen, false);
  }
});

test("job을 읽는 도중 재시도가 시작되면 이미 읽은 녹색 결과를 승인하지 않는다", () => {
  assert.equal(inspect({ refreshed: [{...canonical,run_attempt:3,status:"queued",conclusion:null}] }).result.allGreen, false);
});

test("수동 배포 워크플로도 같은 읽기 전용 판별기를 실행한다", () => {
  const workflow = readFileSync(new URL("../.github/workflows/cloud-production-deploy.yml", import.meta.url),"utf8");
  assert.match(workflow,/actions: read/u);
  assert.match(workflow,/node scripts\/release-required-ci\.mjs "\$GITHUB_REPOSITORY" "\$RELEASE_SHA" "\$ANY_LIVE"/u);
  assert.doesNotMatch(workflow,/commits\/\$RELEASE_SHA\/check-runs/u);
});
