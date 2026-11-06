import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { findReceipt } from "./ci-typecheck-lookup.mjs";
import {
  assertPublisherContext, collectFingerprint, createReceipt, validateReceipt,
} from "./ci-typecheck-receipt.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

/** 공유 결과가 없을 때 원래 전체 타입 검사를 정확히 한 번 실행한다. */
export function runOriginalTypecheck({ root = repositoryRoot, env = process.env, spawn = spawnSync, log = console.log } = {}) {
  log("기존 전체 웹·API 타입 검사를 실행합니다.");
  try {
    const childEnv = { ...env };
    delete childEnv.GITHUB_TOKEN;
    const result = spawn("pnpm", ["run", "typecheck"], { cwd: root, env: childEnv, stdio: "inherit", shell: false });
    if (result.error || result.signal || !Number.isInteger(result.status)) return 1;
    return result.status;
  } catch {
    log("타입 검사 프로세스를 시작하지 못했습니다.");
    return 1;
  }
}

/** 조회·호환성 오류는 검사를 생략하는 근거가 될 수 없다. */
export async function reuseOrRun({
  root = repositoryRoot, env = process.env, collect = collectFingerprint,
  lookup = findReceipt, validate = validateReceipt, run = runOriginalTypecheck, log = console.log,
} = {}) {
  let fingerprint, candidate;
  try {
    fingerprint = collect({ root, env });
    if (fingerprint.runtime.platform !== "linux" || fingerprint.runtime.arch !== "x64"
      || fingerprint.runtime.imageOS !== "ubuntu24") {
      log("Core와 실행 환경이 달라 기존 타입 검사를 선택합니다.");
      return run({ root, env, log });
    }
    candidate = await lookup({ env, onMiss: (reason) => log("공유 타입 검사 결과 없음: " + reason) });
    if (candidate) {
      const producer = {
        workflowPath: candidate.producer.path, runId: candidate.producer.runId,
        runAttempt: candidate.producer.runAttempt, jobKey: "typecheck",
        status: "completed", conclusion: candidate.producer.conclusion,
      };
      fingerprint = collect({ root, env });
      if (validate(candidate.receipt, { fingerprint, producer }).ok) {
        log("완료한 Core 타입 검사 재사용: run=" + producer.runId
          + " attempt=" + producer.runAttempt + " job=" + candidate.producer.jobId
          + " sha=" + fingerprint.source.sha);
        return 0;
      }
      log("공유 영수증의 입력·환경·실행 신원이 일치하지 않습니다.");
    }
  } catch {
    // 인증값이나 API 응답 원문 대신 고정된 이유만 기록한다.
    log("공유 결과 확인에 실패해 기존 타입 검사를 선택합니다.");
  }
  return run({ root, env, log });
}

export function publishReceipt({ output, root = repositoryRoot, env = process.env, collect = collectFingerprint } = {}) {
  const fingerprint = collect({ root, env });
  assertPublisherContext(env, fingerprint);
  if (!output || !env.RUNNER_TEMP || resolve(output) !== resolve(env.RUNNER_TEMP, "core-typecheck/receipt.json")) {
    throw new Error("영수증은 runner 임시 디렉터리에 기록해야 합니다.");
  }
  const directory = dirname(resolve(output));
  if (existsSync(directory) && lstatSync(directory).isSymbolicLink()) {
    throw new Error("영수증 디렉터리는 심볼릭 링크일 수 없습니다.");
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (realpathSync(directory) !== resolve(realpathSync(env.RUNNER_TEMP), "core-typecheck")) {
    throw new Error("영수증 디렉터리가 runner 임시 경로와 다릅니다.");
  }
  const receipt = createReceipt({
    fingerprint,
    producer: {
      workflowPath: ".github/workflows/ci.yml",
      runId: Number(env.GITHUB_RUN_ID), runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
      jobKey: "typecheck", status: "completed", conclusion: "success",
    },
  });
  writeFileSync(output, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600, flag: "wx" });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === "publish" && process.argv.length === 4) {
      publishReceipt({ output: process.argv[3] });
    } else if (process.argv[2] === "reuse-or-run" && process.argv.length === 3) {
      process.exitCode = await reuseOrRun();
    } else {
      throw new Error("사용법: ci-shared-typecheck.mjs publish PATH | reuse-or-run");
    }
  } catch {
    console.error("공유 타입 검사 영수증 작업에 실패했습니다.");
    process.exitCode = 1;
  }
}

