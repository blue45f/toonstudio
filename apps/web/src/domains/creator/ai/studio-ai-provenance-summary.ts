/**
 * studio-ai-provenance-summary.ts — AI 사용 이력 요약 (순수 모듈, fetch 없음).
 *
 * 기존 출처 기록(StudioAiProvenanceDocument)이 이미 작업 이력을
 * 쌓으므로, 이 모듈은 그 목록을 작품·회차 단위 투명성 패널에 보여줄
 * 요약 형태로만 가공한다. 입력은 호출부가 이미 정규화한
 * 작업 단위이며, 이 모듈이 키·원문 프롬프트 전문을 다루지 않는다.
 * 프롬프트는 호출부가 요약문으로 넘긴 것만 표시한다.
 */

export type StudioAiProvenanceSummaryStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "cancelled";

export type StudioAiProvenanceSummaryTransport =
  | "server"
  | "byok"
  | "local"
  | "other";

export interface StudioAiProvenanceOperationInput {
  readonly task: string;
  readonly status: StudioAiProvenanceSummaryStatus;
  readonly transport: StudioAiProvenanceSummaryTransport;
  readonly promptSummary?: string;
}

export interface StudioAiProvenanceSummary {
  readonly total: number;
  readonly byTask: Readonly<Record<string, number>>;
  readonly byStatus: Readonly<Record<string, number>>;
  readonly byTransport: Readonly<Record<string, number>>;
  readonly latestPromptSummaries: readonly string[];
}

function countBy<T extends string>(
  values: readonly T[],
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

/** 작업 목록을 요약한다. 최신 프롬프트 요약은 성공 건만, 최근순, 중복 제거, 상한 적용. */
export function summarizeAiProvenance(
  operations: readonly StudioAiProvenanceOperationInput[],
  latestLimit: number = 5,
): StudioAiProvenanceSummary {
  const byTask = countBy(operations.map((operation) => operation.task));
  const byStatus = countBy(operations.map((operation) => operation.status));
  const byTransport = countBy(
    operations.map((operation) => operation.transport),
  );
  const seen = new Set<string>();
  const latestPromptSummaries: string[] = [];
  for (let index = operations.length - 1; index >= 0; index -= 1) {
    const operation = operations[index];
    if (!operation || operation.status !== "succeeded") continue;
    const summary = operation.promptSummary?.trim();
    if (!summary || seen.has(summary)) continue;
    seen.add(summary);
    latestPromptSummaries.push(summary);
    if (latestPromptSummaries.length >= Math.max(1, latestLimit)) break;
  }
  return {
    total: operations.length,
    byTask,
    byStatus,
    byTransport,
    latestPromptSummaries: Object.freeze(latestPromptSummaries),
  };
}
