/**
 * ToonStudio 경쟁 역량 원장(`STUDIO_COMPETITOR_CAPABILITY_CATALOG` 57건 중
 * `externalValidationPending` 12건)에 대한 로컬 사전 검증(6/12) 실행 진입점.
 *
 * 정직성 경계:
 * - 로컬 실측 가능 6건(#31, #32, #33, #54, #55, #56)만 실행하고 결과를 기록한다.
 * - 외부 전용 6건(#49~#53, #57)은 `external-only-boundary-preserved`로 보존하며
 *   `studio-competitor-capability-evidence.ts`의 `replacementClaimAllowed: false`를 변조하지 않는다.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  STUDIO_COMPETITOR_CAPABILITY_EVALUATION,
  STUDIO_COMPETITOR_CAPABILITY_RECORDS,
} from "../apps/web/src/domains/creator/studio-platform/studio-competitor-capability-evidence";

import {
  runProbe31PsdAdvanced,
  runProbe32PsbLargeDocument,
  runProbe33ClipMigration,
  runProbe54FileRoundtripLab,
  runProbe55CollaborationFaultLab,
  runProbe56AccessibilitySecurityAudit,
  type LocalPrevalidationProbeOutput,
} from "./local-capability-prevalidation-checks.mts";

import type { StudioCompetitorCapabilityId } from "@toonstudio/studio-project-model";

type LocalPrevalidationSequence = 31 | 32 | 33 | 54 | 55 | 56;
const EXTERNAL_ONLY_SEQUENCES = Object.freeze([49, 50, 51, 52, 53, 57] as const);

export interface LocalPrevalidationProbeResult {
  readonly sequence: number;
  readonly id: StudioCompetitorCapabilityId;
  readonly title: string;
  readonly status: "local-prevalidated";
  readonly elapsedMs: number;
  readonly summaryKo: string;
  readonly metrics: Readonly<Record<string, unknown>>;
  readonly externalBoundaryNote: string;
}

export interface ExternalBoundaryCapabilityRecord {
  readonly sequence: number;
  readonly id: StudioCompetitorCapabilityId;
  readonly title: string;
  readonly status: "external-only-boundary-preserved";
  readonly expectedExternalReference: string;
  readonly externalBoundaryNote: string;
}

export interface LocalCapabilityPrevalidationReport {
  readonly schemaVersion: 1;
  readonly executedAt: string;
  readonly ledgerBaseline: {
    readonly targetCapabilityCount: number;
    readonly verifiedCount: number;
    readonly externalValidationPendingCount: number;
    readonly incompleteCount: number;
    readonly replacementClaimAllowed: boolean;
  };
  readonly prevalidationSummary: {
    readonly totalPendingCount: number;
    readonly localPrevalidatedCount: number;
    readonly localFailedCount: number;
    readonly externalOnlyBoundaryCount: number;
    readonly replacementClaimAllowed: false;
    readonly honestyPolicy: string;
  };
  readonly localPrevalidations: readonly LocalPrevalidationProbeResult[];
  readonly externalOnlyBoundaries: readonly ExternalBoundaryCapabilityRecord[];
}

export async function runLocalCapabilityPrevalidation(options: {
  readonly repositoryRoot?: string;
  readonly executedAt?: string;
} = {}): Promise<LocalCapabilityPrevalidationReport> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = options.repositoryRoot ?? path.resolve(scriptDir, "..");
  const executedAt = options.executedAt ?? new Date().toISOString();

  assert.equal(STUDIO_COMPETITOR_CAPABILITY_RECORDS.length, 57);
  assert.equal(STUDIO_COMPETITOR_CAPABILITY_EVALUATION.incompleteCount, 0);
  assert.equal(STUDIO_COMPETITOR_CAPABILITY_EVALUATION.externalValidationPendingCount, 12);
  assert.equal(STUDIO_COMPETITOR_CAPABILITY_EVALUATION.replacementClaimAllowed, false);

  const pendingRecords = STUDIO_COMPETITOR_CAPABILITY_RECORDS.filter(
    (record) => record.externalValidationRequired,
  );
  assert.equal(pendingRecords.length, 12);
  const pendingBySequence = new Map(pendingRecords.map((record) => [record.sequence, record]));

  const runTimed = async (
    sequence: LocalPrevalidationSequence,
    probe: () => LocalPrevalidationProbeOutput | Promise<LocalPrevalidationProbeOutput>,
  ): Promise<LocalPrevalidationProbeResult> => {
    const record = pendingBySequence.get(sequence);
    assert.ok(record, `Missing pending capability sequence #${sequence}`);
    const externalEvidence = record.evidence.find((item) => item.dimension === "external-validation");
    const started = performance.now();
    const output = await probe();
    return {
      sequence: record.sequence,
      id: record.id,
      title: record.title,
      status: "local-prevalidated",
      elapsedMs: Number((performance.now() - started).toFixed(2)),
      summaryKo: output.summaryKo,
      metrics: output.metrics,
      externalBoundaryNote:
        externalEvidence?.note ?? "External verification remains required before replacement claims.",
    };
  };

  const localPrevalidations: LocalPrevalidationProbeResult[] = [
    await runTimed(31, () => runProbe31PsdAdvanced()),
    await runTimed(32, () => runProbe32PsbLargeDocument()),
    await runTimed(33, () => runProbe33ClipMigration()),
    await runTimed(54, () => runProbe54FileRoundtripLab()),
    await runTimed(55, () => runProbe55CollaborationFaultLab()),
    await runTimed(56, () => runProbe56AccessibilitySecurityAudit(repositoryRoot)),
  ];

  const externalOnlyBoundaries: ExternalBoundaryCapabilityRecord[] = EXTERNAL_ONLY_SEQUENCES.map(
    (sequence) => {
      const record = pendingBySequence.get(sequence);
      assert.ok(record, `Missing external-only capability sequence #${sequence}`);
      const externalEvidence = record.evidence.find((item) => item.dimension === "external-validation");
      return {
        sequence: record.sequence,
        id: record.id,
        title: record.title,
        status: "external-only-boundary-preserved" as const,
        expectedExternalReference:
          externalEvidence?.reference ?? `docs/evidence/external/${record.id}.json`,
        externalBoundaryNote:
          externalEvidence?.note ?? "Independent real-device or external sign-off required.",
      };
    },
  );

  return {
    schemaVersion: 1,
    executedAt,
    ledgerBaseline: {
      targetCapabilityCount: STUDIO_COMPETITOR_CAPABILITY_RECORDS.length,
      verifiedCount: STUDIO_COMPETITOR_CAPABILITY_EVALUATION.verifiedCount,
      externalValidationPendingCount:
        STUDIO_COMPETITOR_CAPABILITY_EVALUATION.externalValidationPendingCount,
      incompleteCount: STUDIO_COMPETITOR_CAPABILITY_EVALUATION.incompleteCount,
      replacementClaimAllowed: STUDIO_COMPETITOR_CAPABILITY_EVALUATION.replacementClaimAllowed,
    },
    prevalidationSummary: {
      totalPendingCount: pendingRecords.length,
      localPrevalidatedCount: localPrevalidations.length,
      localFailedCount: 0,
      externalOnlyBoundaryCount: externalOnlyBoundaries.length,
      replacementClaimAllowed: false,
      honestyPolicy:
        "로컬 사전 검증 6건은 합성 코퍼스·로컬 엔진·장애 주입·정적/정책 감사의 실측 증거이며, 라이선스 실파일·실제 OAuth 테넌트·실기기 하드웨어·외부 독립 감사·프로 작가 최종 서명을 대체하지 않는다. replacementClaimAllowed=false 경계를 그대로 유지한다.",
    },
    localPrevalidations,
    externalOnlyBoundaries,
  };
}

export function renderLocalPrevalidationMarkdown(report: LocalCapabilityPrevalidationReport): string {
  const lines: string[] = [
    "# 경쟁 역량 원장 로컬 사전 검증 실측 리포트 (6/12)",
    "",
    `- 실행 시각: \`${report.executedAt}\``,
    `- 원장 기준선: 전체 \`${report.ledgerBaseline.targetCapabilityCount}\`건 중 구현 검증 \`${report.ledgerBaseline.verifiedCount}\`건, 외부 검증 대기 \`${report.ledgerBaseline.externalValidationPendingCount}\`건, 미완료 \`${report.ledgerBaseline.incompleteCount}\`건`,
    `- 로컬 사전 검증 완료: **\`${report.prevalidationSummary.localPrevalidatedCount}/${report.prevalidationSummary.totalPendingCount}\`** (실패 \`${report.prevalidationSummary.localFailedCount}\`건)`,
    `- 외부 전용 경계 보존: **\`${report.prevalidationSummary.externalOnlyBoundaryCount}/${report.prevalidationSummary.totalPendingCount}\`** (\`external-only-boundary-preserved\`)`,
    `- 대체 주장 허용 여부(\`replacementClaimAllowed\`): **\`${String(report.prevalidationSummary.replacementClaimAllowed)}\`** (변경 금지 경계 유지)`,
    "",
    "> [!IMPORTANT]",
    `> ${report.prevalidationSummary.honestyPolicy}`,
    "",
    "## 1. 로컬 사전 검증 실측 결과 (6건)",
    "",
    "| 번호 | 역량 ID | 상태 | 소요(ms) | 실측 요약 |",
    "| ---: | --- | --- | ---: | --- |",
    ...report.localPrevalidations.map(
      (item) => `| #${item.sequence} | \`${item.id}\` | \`${item.status}\` | ${item.elapsedMs} | ${item.summaryKo} |`,
    ),
    "",
    "## 2. 외부 전용 경계 보존 목록 (6건 — 로컬 허위 통과 금지)",
    "",
    "| 번호 | 역량 ID | 상태 | 외부 근거 경로 | 외부 필수 사유 |",
    "| ---: | --- | --- | --- | --- |",
    ...report.externalOnlyBoundaries.map(
      (item) => `| #${item.sequence} | \`${item.id}\` | \`${item.status}\` | \`${item.expectedExternalReference}\` | ${item.externalBoundaryNote} |`,
    ),
    "",
    "## 3. 재현 명령",
    "",
    "```bash",
    "pnpm exec tsx scripts/run-local-capability-prevalidation.mts",
    "```",
    "",
  ];
  return lines.join("\n");
}

async function main(): Promise<void> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = path.resolve(scriptDir, "..");
  const report = await runLocalCapabilityPrevalidation({ repositoryRoot });

  const outputDir = path.join(repositoryRoot, "docs/evidence/local-prevalidation");
  const jsonPath = path.join(outputDir, "local-prevalidation-report.json");
  const readmePath = path.join(outputDir, "README.md");

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(readmePath, renderLocalPrevalidationMarkdown(report), "utf8");

  console.log(JSON.stringify({
    localPrevalidated: report.prevalidationSummary.localPrevalidatedCount,
    externalOnlyPreserved: report.prevalidationSummary.externalOnlyBoundaryCount,
    totalPending: report.prevalidationSummary.totalPendingCount,
    replacementClaimAllowed: report.prevalidationSummary.replacementClaimAllowed,
    reportPath: path.relative(repositoryRoot, jsonPath),
    readmePath: path.relative(repositoryRoot, readmePath),
  }));
}

const isDirectExecution =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
