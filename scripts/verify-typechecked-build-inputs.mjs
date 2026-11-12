import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadFullProgram } from "./typecheck-shards-worker.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const SHA = /^[a-f0-9]{40}$/u;
const FINGERPRINT = /^[a-f0-9]{64}$/u;
const readCheckoutHead = (root) => execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
}).trim();

/** 의미 검사는 수행하지 않는다. 실제 성공한 타입 단계와 같은 입력만 번들에 사용한다. */
export function verifyTypecheckedBuildInputs(mode, snapshotPath, {
  root = repositoryRoot, expectedSha = process.env.GITHUB_SHA,
  typecheckOutcome = process.env.TYPECHECK_OUTCOME, readHead = readCheckoutHead,
} = {}) {
  if (!["record", "verify"].includes(mode) || !snapshotPath) {
    throw new Error("사용법: verify-typechecked-build-inputs.mjs record|verify SNAPSHOT");
  }
  if (mode === "verify" && typecheckOutcome !== "success") {
    throw new Error("전체 타입 검사가 실제 성공하지 않아 번들 입력을 승인할 수 없습니다.");
  }
  const cwd = resolve(root);
  if (!SHA.test(expectedSha ?? "") || readHead(cwd) !== expectedSha) {
    throw new Error("체크아웃 SHA와 CI SHA가 다릅니다. 현재 소스로 전체 타입 검사를 다시 실행하세요.");
  }
  const { fingerprint } = loadFullProgram(resolve(cwd, "tsconfig.json"), cwd);
  if (mode === "record") {
    writeFileSync(snapshotPath, JSON.stringify({ schemaVersion: 1, sha: expectedSha, fingerprint }) + "\n", {
      flag: "wx", mode: 0o600,
    });
    return;
  }
  const recorded = JSON.parse(readFileSync(snapshotPath, "utf8"));
  if (recorded?.schemaVersion !== 1 || recorded.sha !== expectedSha
    || !FINGERPRINT.test(recorded.fingerprint ?? "") || recorded.fingerprint !== fingerprint) {
    throw new Error("타입 검사 뒤 생성물·소스·컴파일러 입력이 바뀌었습니다. 생성 후 전체 타입 검사를 다시 실행하세요.");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw new Error("record|verify와 snapshot 경로가 필요합니다.");
    verifyTypecheckedBuildInputs(process.argv[2], process.argv[3]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "타입 검사 입력 확인에 실패했습니다.");
    process.exitCode = 1;
  }
}
