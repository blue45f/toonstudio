import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SHA = /^[a-f0-9]{40}$/u;
const POSITIVE = /^[1-9][0-9]*$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
export const WORKFLOW_PATH = ".github/workflows/ci.yml";
export const CANONICAL_COMMANDS = Object.freeze([
  "pnpm run typecheck", "pnpm run typecheck:cloudflare-realtime", "pnpm run check:type-coverage",
]);
export const CANONICAL_SETTINGS = Object.freeze({ ci: "1", nodeOptions: "--max-old-space-size=12288" });

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function positive(value) {
  return (typeof value === "string" || Number.isSafeInteger(value)) && POSITIVE.test(String(value));
}

function validateFingerprint(value) {
  requireValue(value && typeof value === "object", "검사 입력 지문이 없습니다.");
  const { source, runtime, canonical } = value;
  requireValue(source && REPOSITORY.test(source.repository) && SHA.test(source.sha) && SHA.test(source.tree), "저장소·SHA·tree 입력이 올바르지 않습니다.");
  requireValue(source.extraInputsClean === true, "추적되지 않은 타입 검사 입력 확인이 없습니다.");
  requireValue(["pull_request", "push", "merge_group", "workflow_dispatch"].includes(source.eventName)
    && typeof source.ref === "string" && source.ref.startsWith("refs/"), "이벤트·ref 입력이 올바르지 않습니다.");
  if (source.eventName === "pull_request") {
    requireValue(source.pr && positive(source.pr.number) && SHA.test(source.pr.baseSha) && SHA.test(source.pr.headSha)
      && REPOSITORY.test(source.pr.baseRepository) && REPOSITORY.test(source.pr.headRepository)
      && source.pr.baseRepository === source.repository, "PR 기준·후보·저장소 입력이 올바르지 않습니다.");
  } else requireValue(source.pr === null, "PR 이외 이벤트에 PR 입력이 있습니다.");
  requireValue(runtime && ["platform", "arch", "imageOS", "nodeVersion", "pnpmVersion"].every((key) =>
    typeof runtime[key] === "string" && runtime[key].length > 0)
    && /^[a-f0-9]{64}$/u.test(runtime.lockSha256), "실행 환경 지문이 불완전합니다.");
  requireValue(isDeepStrictEqual(canonical, { ...CANONICAL_SETTINGS, commands: [...CANONICAL_COMMANDS] }), "정본 검사 명령·설정이 다릅니다.");
}

function readEvent(env) {
  if (env.GITHUB_EVENT_NAME !== "pull_request") return {};
  requireValue(typeof env.GITHUB_EVENT_PATH === "string" && env.GITHUB_EVENT_PATH.length > 0, "PR 이벤트 파일이 없습니다.");
  try { return JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8")); }
  catch { throw new Error("PR 이벤트 파일을 읽지 못했습니다. 기존 타입 검사를 실행하세요."); }
}

/** 호출 위치와 무관하게 checkout 및 실제 도구 버전을 읽는다. 변경 파일 내용은 출력하지 않는다. */
export function collectFingerprint({ root = ROOT, env = process.env, event = readEvent(env), run = execFileSync } = {}) {
  const output = (command, args) => {
    try { return String(run(command, args, { cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })).trim(); }
    catch { throw new Error(`${command} 입력 확인에 실패했습니다. 기존 타입 검사를 실행하세요.`); }
  };
  const sha = output("git", ["rev-parse", "HEAD"]);
  requireValue(SHA.test(sha) && sha === env.GITHUB_SHA, "checkout HEAD와 이벤트 SHA가 다릅니다.");
  requireValue(output("git", ["status", "--porcelain", "--untracked-files=no"]) === "", "추적된 파일에 변경이 있어 결과를 재사용할 수 없습니다.");
  const pathspecs = ["apps", "packages", "scripts", "deploy", "e2e", "tests",
    // 루트 tsconfig의 **/*.mts는 tools·docs 등 위 도메인 디렉터리 밖도 프로그램에 포함한다.
    ":(top,glob)**/*.mts",
    ...["ts", "tsx", "mts", "cts", "json", "jsonc", "js", "jsx", "mjs", "cjs"].map((extension) => `:(top,glob)*.${extension}`),
    ":(exclude,glob)**/node_modules/**"];
  for (const ignored of [false, true]) {
    const extra = output("git", ["ls-files", "--others", ...(ignored ? ["--ignored"] : []), "--exclude-standard", "-z", "--", ...pathspecs]);
    requireValue(!extra.split("\0").some((path) => /\.(?:[cm]?[jt]sx?|jsonc?)$/u.test(path)),
      "추적되지 않은 타입 검사 입력이 있어 결과를 재사용할 수 없습니다.");
  }
  let lock;
  try { lock = readFileSync(join(root, "pnpm-lock.yaml")); }
  catch { throw new Error("lockfile을 읽지 못했습니다. 기존 타입 검사를 실행하세요."); }
  const pr = event.pull_request;
  const fingerprint = {
    source: {
      repository: env.GITHUB_REPOSITORY, sha, tree: output("git", ["rev-parse", "HEAD^{tree}"]), extraInputsClean: true,
      eventName: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF,
      pr: env.GITHUB_EVENT_NAME === "pull_request" ? {
        number: event.number ?? pr?.number, baseSha: pr?.base?.sha, headSha: pr?.head?.sha,
        baseRepository: pr?.base?.repo?.full_name, headRepository: pr?.head?.repo?.full_name,
      } : null,
    },
    runtime: {
      platform: process.platform, arch: process.arch, imageOS: env.ImageOS ?? "unknown",
      nodeVersion: process.version, pnpmVersion: output("pnpm", ["--version"]),
      lockSha256: createHash("sha256").update(lock).digest("hex"),
    },
    canonical: { ...CANONICAL_SETTINGS, commands: [...CANONICAL_COMMANDS] },
  };
  validateFingerprint(fingerprint);
  return fingerprint;
}

/** 발행은 Core의 실제 Linux x64 정본 검사 단계에만 허용한다. 소비자의 heap 값은 비교하지 않는다. */
export function assertPublisherContext(env, fingerprint) {
  validateFingerprint(fingerprint);
  const { source, runtime } = fingerprint;
  requireValue(env.GITHUB_ACTIONS === "true" && env.GITHUB_JOB === "typecheck"
    && env.CI === CANONICAL_SETTINGS.ci && env.NODE_OPTIONS === CANONICAL_SETTINGS.nodeOptions,
  "Core 정본 검사 컨텍스트가 아니어서 영수증을 발행할 수 없습니다.");
  requireValue(env.GITHUB_REPOSITORY === source.repository && env.GITHUB_SHA === source.sha
    && env.GITHUB_EVENT_NAME === source.eventName && env.GITHUB_REF === source.ref
    && positive(env.GITHUB_RUN_ID) && positive(env.GITHUB_RUN_ATTEMPT)
    && env.GITHUB_WORKFLOW_REF === `${source.repository}/${WORKFLOW_PATH}@${source.ref}`,
  "Core 실행 식별자·이벤트가 일치하지 않습니다.");
  assertCanonicalRuntime(runtime);
}

function assertCanonicalRuntime(runtime) {
  requireValue(runtime.platform === "linux" && runtime.arch === "x64" && runtime.imageOS === "ubuntu24"
    && /^v24\.[0-9]+\.[0-9]+$/u.test(runtime.nodeVersion) && runtime.pnpmVersion === "11.4.0",
  "정본 Linux x64·Ubuntu 24·Node 24·pnpm 11.4.0 환경이 아닙니다.");
}

function validateProducer(producer) {
  requireValue(producer && producer.workflowPath === WORKFLOW_PATH && producer.jobKey === "typecheck"
    && positive(producer.runId) && positive(producer.runAttempt)
    && producer.status === "completed" && producer.conclusion === "success",
  "완료·성공한 Core 타입 검사 실행만 인정합니다.");
}

/** 실제 job의 완료·성공 여부는 소비자가 GitHub API 결과와 별도로 대조해야 한다. */
export function createReceipt({ fingerprint, producer }) {
  validateFingerprint(fingerprint);
  validateProducer(producer);
  return structuredClone({ schemaVersion: 1, fingerprint, producer });
}

/** 잘못되거나 다른 실행의 영수증은 거절한다. 거절 시 호출자는 기존 검사를 실행한다. */
export function validateReceipt(receipt, { fingerprint, producer } = {}) {
  try {
    requireValue(receipt && receipt.schemaVersion === 1, "영수증 버전이 다릅니다.");
    validateFingerprint(fingerprint);
    validateFingerprint(receipt.fingerprint);
    assertCanonicalRuntime(receipt.fingerprint.runtime);
    validateProducer(receipt.producer);
    requireValue(isDeepStrictEqual(receipt.fingerprint, fingerprint), "소스·이벤트·실행 환경·명령 지문이 다릅니다.");
    if (producer) {
      validateProducer(producer);
      for (const key of ["workflowPath", "runId", "runAttempt", "jobKey", "status", "conclusion"]) {
        requireValue(String(receipt.producer[key]) === String(producer[key]), `발행 실행의 ${key}가 다릅니다.`);
      }
    }
    return { ok: true, reasons: [] };
  } catch (error) {
    return { ok: false, reasons: [error instanceof Error ? error.message : "영수증 검증 실패"] };
  }
}
