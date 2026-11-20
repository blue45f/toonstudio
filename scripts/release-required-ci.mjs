import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workflowPath = ".github/workflows/ci.yml";
const requiredJobs = ["core", "verify"];

/** 로컬 상태 조회와 수동 배포가 같은 main push의 최신 시도만 승인한다. */
export function inspectReleaseCi(sha, { repoSlug, rootDir, execEnv, execFileImpl = execFileSync }) {
  if (!/^[a-f0-9]{40}$/u.test(sha) || !/^[\w.-]+\/[\w.-]+$/u.test(repoSlug)) {
    throw new Error("CI 조회에 필요한 저장소 또는 배포 SHA가 올바르지 않습니다.");
  }
  const api = (path, field) => {
    let pages;
    try {
      const raw = execFileImpl("gh", ["api", `repos/${repoSlug}/${path}`, "--paginate", "--slurp"], {
        cwd: rootDir, env: execEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024,
      });
      pages = JSON.parse(raw);
    } catch {
      throw new Error("GitHub Actions에서 필수 CI 실행 정보를 읽지 못했습니다.");
    }
    if (!Array.isArray(pages) || !pages.every((page) => Array.isArray(page?.[field]))) {
      throw new Error("GitHub Actions의 실행 목록을 확인하지 못했습니다.");
    }
    return pages.flatMap((page) => page[field]);
  };

  const latestRun = () => api(`actions/workflows/ci.yml/runs?branch=main&event=push&head_sha=${sha}&per_page=100`, "workflow_runs")
    .filter((run) => run.path === workflowPath && run.event === "push" && run.head_branch === "main" && run.head_sha === sha)
    .sort((a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt)[0];

  const run = latestRun();
  const gates = { core: "missing", verify: "missing" };
  const result = { sha, gates, allGreen: false, runId: run?.id, runAttempt: run?.run_attempt, runStatus: run?.conclusion ?? run?.status ?? "missing" };
  if (!run) return result;
  if (![run.id, run.run_number, run.run_attempt].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new Error("필수 CI 실행 번호 또는 시도를 확인하지 못했습니다.");
  }

  const jobs = api(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`, "jobs")
    .filter((job) => job.run_id === run.id && job.run_attempt === run.run_attempt && job.head_sha === sha);
  for (const name of requiredJobs) {
    const matches = jobs.filter((job) => job.name === name);
    if (matches.length === 1) {
      const [job] = matches;
      gates[name] = job.status === "completed" ? (job.conclusion ?? "missing") : (job.status ?? "missing");
    } else if (matches.length > 1) {
      gates[name] = "ambiguous";
    }
  }
  if (run.status === "completed" && run.conclusion === "success" && requiredJobs.every((name) => gates[name] === "success")) {
    // job 페이지를 읽는 동안 새 push 실행 또는 재시도가 시작됐는지 한 번 더 확인한다.
    const current = latestRun();
    result.allGreen = current?.id === run.id && current.run_attempt === run.run_attempt
      && current.status === "completed" && current.conclusion === "success";
    if (!result.allGreen) result.runStatus = "changed";
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [repoSlug, sha, live] = process.argv.slice(2);
    if (live !== "true" && live !== "false") throw new Error("운영 반영 여부를 지정하세요.");
    const result = inspectReleaseCi(sha, { repoSlug });
    console.log(`CI main push · 실행 ${result.runId ?? "없음"} · 시도 ${result.runAttempt ?? "없음"} · ${result.runStatus} · core=${result.gates.core}, verify=${result.gates.verify}`);
    if (live === "true" && !result.allGreen) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
