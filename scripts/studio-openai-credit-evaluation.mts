#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCreditEvaluation, type CreditEvaluationReport } from "./studio-openai-credit-evaluation-core";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const HELP = `사용법: pnpm exec tsx --tsconfig apps/api/tsconfig.json scripts/studio-openai-credit-evaluation.mts [--dry-run | --execute --evidence /비공개/계정확인.json]
기본값은 dry-run이며 외부 호출은 0회입니다. 고정 합성 사례 10개 × mini 모델 2개, 실패 포함 최대 20회·크레딧 $1·추가 유료 지출 $0입니다.
실행에는 현재 프로세스의 OPENAI_API_KEY·OPENAI_ORG_ID·OPENAI_PROJECT_ID와 실제 계정 확인 증거가 필요합니다. 키를 인자에 넣지 마세요.
증거 형식은 studio-openai-credit-evaluation-core.ts의 CreditExecutionEvidenceSchema를 참조하세요. 임의 확인값을 작성해서는 안 됩니다.
보고서는 Git 내부에만 저장하며, 실행 잠금이 있으면 재실행하지 않습니다. 자동 재시도·잠금 해제·운영 설정 변경 기능은 없습니다.`;

async function writeReport(path: string, report: CreditEvaluationReport): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx", flush: true });
  await rename(temporary, path);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") { process.stdout.write(`${HELP}\n`); return; }
  let execute = false;
  let dryRun = false;
  let evidencePath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--execute" && !execute) { execute = true; continue; }
    if (argument === "--dry-run" && !dryRun) { dryRun = true; continue; }
    if (argument === "--evidence" && !evidencePath) {
      evidencePath = args[++index];
      if (evidencePath && !evidencePath.startsWith("--")) continue;
    }
    throw new Error(HELP);
  }
  if ((execute && dryRun) || (execute && !evidencePath) || (!execute && evidencePath)) throw new Error(HELP);
  let evidence: unknown;
  if (evidencePath) {
    const path = resolve(REPO_ROOT, evidencePath);
    const info = await stat(path).catch(() => { throw new Error("계정 확인 증거 파일을 읽을 수 없습니다. --evidence 경로를 확인하세요."); });
    if (!info.isFile() || info.size > 32_768 || (info.mode & 0o077) !== 0) throw new Error("증거는 32 KiB 이하의 비공개 일반 JSON 파일이어야 합니다. 소유자만 읽도록 chmod 600으로 설정하세요.");
    try { evidence = JSON.parse(await readFile(path, "utf8")); }
    catch { throw new Error("증거 JSON을 읽지 못했습니다. 비밀값을 출력하지 말고 파일 형식을 확인하세요."); }
  }
  const gitDirectory = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  const directory = join(gitDirectory, "studio-openai-credit-evaluation-20261118");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const reportPath = join(directory, execute ? "live.json" : "dry-run.json");
  let claimed = false;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    const report = await runCreditEvaluation({
      execute, evidence, signal: controller.signal,
      checkpoint: execute ? async (snapshot) => {
        if (!claimed) {
          try {
            await writeFile(join(directory, "started.json"), JSON.stringify({ startedAt: snapshot.startedAt, planHash: snapshot.planHash, maxAttempts: 20, maxCreditUsd: 1, maxAdditionalPaidUsd: 0 }), { flag: "wx", mode: 0o600, flush: true });
          } catch { throw new Error("이미 실행 잠금이 있거나 비용 예약 기록을 저장하지 못했습니다. 기존 live.json과 계정 사용량을 확인하고 재실행하지 마세요."); }
          claimed = true;
        }
        await writeReport(reportPath, snapshot);
      } : undefined,
    });
    if (!execute) await writeReport(reportPath, report);
    // 합성 출력도 stdout에는 싣지 않는다. 사람이 평가할 출력은 비공개 Git 내부 보고서에만 있다.
    process.stdout.write(`${JSON.stringify({
      mode: report.mode, planHash: report.planHash, plannedRequests: report.results.length, attempts: report.attempts,
      plannedMaximumUsd: report.plannedMaximumUsd, estimatedUsd: report.estimatedUsd, unconfirmedReservedUsd: report.unconfirmedReservedUsd,
      completedAllContracts: report.completedAllContracts, humanEvaluation: report.humanEvaluation.status,
      evidenceStatus: report.evidenceStatus, accountQueriedByRunner: report.accountQueriedByRunner,
      stoppedReason: report.results.find((result) => result.errorCode)?.errorCode ?? null, reportPath,
    }, null, 2)}\n`);
    process.exitCode = execute && !report.completedAllContracts ? 1 : 0;
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}

main().catch((error: unknown) => {
  // 계정 증거의 원문·API 오류 본문·키는 출력하지 않는다. core는 외부 오류를 고정 코드로 바꾼다.
  process.stderr.write(`${error instanceof Error ? error.message : "검증 실행기를 완료하지 못했습니다. --help와 오프라인 테스트를 확인하세요."}\n`);
  process.exitCode = 2;
});
