/** static 배포의 승인 의미를 재사용한다. 기존 wrapper는 import 때 빌드하므로 직접 import하지 않는다. */
import { execFileSync } from "node:child_process";
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, rmdirSync, writeSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { REPO_ROOT } from "./repo-paths.mjs";
import { transferFail } from "./creator-bundle-r2-rest.mjs";

const SHA = /^[a-f0-9]{40}$/u;
const REPOSITORY = "blue45f/toonstudio";
const ORIGINS = ["https://github.com/blue45f/toonstudio.git", "git@github.com:blue45f/toonstudio.git"];
const readCommand = (executable, args, cwd) => {
  try { return execFileSync(executable, args, { cwd, encoding: "utf8", timeout: 45_000, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch { transferFail("DEPLOYMENT_READ_FAILED", "main·필수 CI 상태를 읽을 수 없습니다. 도구 오류 원문을 출력하지 않고 중단합니다."); }
};

export function validateBundleReleaseCi(sha, runPages, checkPages) {
  const runs = runPages.flatMap((page) => Array.isArray(page?.workflow_runs) ? page.workflow_runs : []);
  const eligible = runs.filter((run) => run.head_sha === sha && run.head_branch === "main" && ["push", "workflow_dispatch"].includes(run.event));
  const latest = eligible.sort((a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt)[0];
  if (!latest || latest.status !== "completed" || latest.conclusion !== "success" || !Number.isSafeInteger(latest.check_suite_id)) transferFail("CI_NOT_GREEN", "승인 SHA의 최신 main CI가 녹색이 아닙니다. 병합 예외를 배포 예외로 사용하지 않습니다.");
  const checks = checkPages.flatMap((page) => Array.isArray(page?.check_runs) ? page.check_runs : []);
  for (const name of ["core", "verify"]) {
    const check = checks.filter((item) => item.name === name && item.head_sha === sha && item.check_suite?.id === latest.check_suite_id
      && item.app?.slug === "github-actions").sort((a, b) => b.id - a.id)[0];
    if (!check || check.status !== "completed" || check.conclusion !== "success") transferFail("CI_NOT_GREEN", "승인 SHA의 동일 CI 실행에서 core·verify 성공을 확인할 수 없습니다.");
  }
  return Object.freeze({ runId: latest.id, checkSuiteId: latest.check_suite_id, core: "success", verify: "success" });
}

const isRemoteMainAtSha = (lsRemoteOutput, sha) => {
  const parts = String(lsRemoteOutput ?? "").trim().split(/\s+/u);
  return parts.length === 2 && parts[0] === sha && parts[1] === "refs/heads/main";
};

export function authorizeBundleR2Production({ approvedSha, repoRoot = REPO_ROOT, environment = process.env,
  command = readCommand, read = readFileSync } = {}) {
  if (!SHA.test(approvedSha)) transferFail("APPROVED_SHA", "소문자 40자리 main SHA를 명시하세요.");
  if (environment.TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL) {
    if (environment.TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL !== "cloudflare-static-production"
      || environment.TOONSPECTRUM_APPROVED_MAIN_SHA !== approvedSha) transferFail("APPROVAL_SCOPE", "기존 static 배포 승인 범위·SHA와 다릅니다.");
  } else {
    let standing; try { standing = JSON.parse(read(join(repoRoot, "deploy/cloudflare-static/STANDING_APPROVAL.json"), "utf8")); }
    catch { transferFail("STANDING_APPROVAL", "상시 승인 파일이 없거나 손상됐습니다. 기존 승인 절차를 확인하세요."); }
    if (standing?.scope !== "cloudflare-static-production") transferFail("STANDING_APPROVAL", "상시 승인 범위가 static production이 아닙니다.");
  }
  const git = (...args) => command("git", args, repoRoot);
  const local = () => {
    if (git("branch", "--show-current") !== "main" || git("status", "--porcelain") !== "" || git("rev-parse", "HEAD") !== approvedSha) transferFail("MAIN_NOT_CLEAN", "정확한 승인 SHA의 깨끗한 main에서만 운영 객체를 준비할 수 있습니다.");
  };
  local();
  if (!ORIGINS.includes(git("remote", "get-url", "origin"))) transferFail("REPOSITORY_SCOPE", "검토한 ToonStudio 원격 저장소가 아닙니다.");
  const remoteHead = git("ls-remote", "--heads", "origin", "refs/heads/main");
  if (!isRemoteMainAtSha(remoteHead, approvedSha)) transferFail("MAIN_ADVANCED", "방금 조회한 원격 main과 승인 SHA가 다릅니다. 새 SHA의 검증 상태를 확인하세요.");
  const api = (path) => {
    try { return JSON.parse(command("gh", ["api", "--paginate", "--slurp", path], repoRoot)); }
    catch { transferFail("CI_READ_FAILED", "필수 CI 상태를 해석할 수 없습니다. 원문을 출력하지 않고 중단합니다."); }
  };
  const ci = validateBundleReleaseCi(approvedSha,
    api(`repos/${REPOSITORY}/actions/workflows/ci.yml/runs?head_sha=${approvedSha}&branch=main&per_page=100`),
    api(`repos/${REPOSITORY}/commits/${approvedSha}/check-runs?per_page=100`));
  const rawCommon = git("rev-parse", "--git-common-dir"), gitCommonDir = isAbsolute(rawCommon) ? rawCommon : resolve(repoRoot, rawCommon);
  return Object.freeze({ approvedSha, ci, gitCommonDir, assertLocal: local,
    assertRemoteMain: () => { local(); if (!isRemoteMainAtSha(git("ls-remote", "--heads", "origin", "refs/heads/main"), approvedSha)) transferFail("MAIN_ADVANCED", "업로드 중 원격 main이 바뀌었습니다. 정적 웹을 이 SHA로 게시하지 말고 재검토하세요."); } });
}

/** 같은 clone의 모든 worktree를 묶는다. 다른 기기의 실행자는 배포 조정자가 따로 배제해야 한다. */
export function acquireBundleR2Attempt(gate, identity) {
  if (!SHA.test(gate?.approvedSha) || !/^[a-f0-9]{64}$/u.test(identity?.catalogSha256)
    || typeof gate.gitCommonDir !== "string" || !isAbsolute(gate.gitCommonDir)
    || !lstatSync(gate.gitCommonDir).isDirectory() || lstatSync(gate.gitCommonDir).isSymbolicLink()) transferFail("JOURNAL_IDENTITY", "검증된 main SHA·release hash·git 공용 디렉터리가 필요합니다.");
  const parent = join(gate.gitCommonDir, "toonstudio-bundle-r2-release");
  try { mkdirSync(parent, { mode: 0o700 }); } catch (error) { if (error.code !== "EEXIST") throw error; }
  if (!lstatSync(parent).isDirectory() || lstatSync(parent).isSymbolicLink()) transferFail("JOURNAL_DIRECTORY", "로컬 릴리스 기록 디렉터리가 올바르지 않습니다.");
  const lock = join(parent, "active.lock");
  try { mkdirSync(lock, { mode: 0o700 }); } catch { transferFail("SINGLE_EXECUTOR", "다른 로컬 실행 또는 미정리 lock이 있습니다. 자동 제거하지 말고 실제 실행 상태를 확인하세요."); }
  const owner = lstatSync(lock), path = join(parent, `${gate.approvedSha}-${identity.catalogSha256}.jsonl`);
  let fd;
  try { fd = openSync(path, "wx", 0o600); }
  catch (error) {
    const current = lstatSync(lock);
    if (!current.isSymbolicLink() && current.dev === owner.dev && current.ino === owner.ino) rmdirSync(lock);
    if (error.code === "EEXIST") transferFail("ATTEMPT_ALREADY_RECORDED", "동일 SHA·카탈로그 실행 기록이 있습니다. 자동 재시도하지 말고 기존 기록·원격 상태를 검토하세요.");
    transferFail("JOURNAL_WRITE_FAILED", "로컬 실행 기록을 만들 수 없습니다. PUT을 시작하지 말고 디렉터리 권한을 확인하세요.");
  }
  let closed = false;
  const append = (value) => { writeSync(fd, JSON.stringify({ at: new Date().toISOString(), ...value }) + "\n"); fsyncSync(fd); };
  try { append({ schema: "toonstudio.bundle-r2-release-attempt.v1", phase: "started", pid: process.pid, approvedSha: gate.approvedSha, ...identity, ci: gate.ci,
    singleExecutorRequired: true, conditionalPutGuaranteed: false }); }
  catch (error) { closeSync(fd); throw error; }
  return Object.freeze({ path, append,
    close() {
      if (closed) return; closed = true; closeSync(fd);
      const current = lstatSync(lock);
      if (!current.isSymbolicLink() && current.dev === owner.dev && current.ino === owner.ino) rmdirSync(lock);
    },
  });
}
