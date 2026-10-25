/**
 * studio-ai-cost-ledger.ts — AI 원가 추적 장치 (6단계 지속 운영,
 * 2026-10-25). Nest에 의존하지 않는 순수 모듈이다.
 *
 * 이 장치가 하는 일과 하지 않는 일:
 *  - 한다: 서버 측 AI 호출별로 제공자·모델·토큰 수·원가 추정치를
 *    프로세스 메모리 원장에 기록하고, 어드민 조회용으로 제공자·모델·
 *    일자별 합계를 낸다. 기존 `studio-ai-usage.ts`의 토큰 사용량
 *    개념(제공자 보고 토큰 수)을 재사용하되, 원가 추정치는 별도
 *    필드로 둔다.
 *  - 하지 않는다: 실제 청구·결제·PG와 연결하지 않는다. 모든 금액은
 *    추정치이며, 조회 결과마다 추정치임을 명시한다. DB 테이블·
 *    마이그레이션을 신설하지 않는다 — 게이트 모듈의 메모리 스토어
 *    패턴과 같이 프로세스 메모리에만 존재하고, 재시작하면 사라진다.
 *    영속 원장 연결은 후속 과제이다.
 *  - 사용자 식별자를 기록하지 않는다. 조회는 제공자·모델·일자
 *    집계만 제공해 개인별 원가 추적을 만들지 않는다.
 *
 * 추정치의 근거(`estimateBasis`)는 호출부가 문자열로 공급한다
 * (예: 제공자 공개 단가표 기준). 이 모듈은 단가를 정하지 않으며,
 * 공급된 추정치를 검증(음수·비수 거부)만 한다.
 */

/** 모든 원가 조회 결과에 붙는 추정치 고지 문구. */
export const STUDIO_AI_COST_ESTIMATE_DISCLAIMER =
  "표시 금액은 추정치이며 실제 청구·결제 금액이 아닙니다." as const;

/** 프로세스 메모리 원장 최대 보관 건수 (초과 시 신규 기록 거부). */
export const STUDIO_AI_COST_LEDGER_CAPACITY = 10_000;

export type StudioAiCostLedgerRefusalReason =
  | "cost_ledger_invalid_input"
  | "cost_ledger_capacity";

export class StudioAiCostLedgerError extends Error {
  readonly code: StudioAiCostLedgerRefusalReason;
  readonly status: number;

  constructor(code: StudioAiCostLedgerRefusalReason, message: string) {
    super(message);
    this.name = "StudioAiCostLedgerError";
    this.code = code;
    this.status = code === "cost_ledger_capacity" ? 507 : 400;
  }
}

export interface StudioAiCostRecordInput {
  /** 호출 식별자 (멱등·대조용, 호출부 공급). */
  callId?: unknown;
  /** 제공자 식별자 (studio-ai-provider의 StudioAiProviderId와 동일 집합). */
  provider?: unknown;
  model?: unknown;
  promptTokens?: unknown;
  completionTokens?: unknown;
  totalTokens?: unknown;
  /** 추정치 금액 (통화별 소수 허용, 음수 불가). */
  estimatedCostAmount?: unknown;
  estimatedCostCurrency?: unknown;
  /** 추정치 근거 설명 (예: 공개 단가표 기준). */
  estimateBasis?: unknown;
  /** 호출 시각 (기본값: 기록 시점). */
  occurredAt?: Date;
}

export interface StudioAiCostRecord {
  readonly callId: string;
  readonly provider: string;
  readonly model: string;
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly totalTokens: number | null;
  readonly estimatedCostAmount: number;
  readonly estimatedCostCurrency: string;
  readonly estimateBasis: string;
  /** 이 모듈의 금액은 항상 추정치다. */
  readonly isEstimate: true;
  /** UTC 일자 키 (YYYY-MM-DD). */
  readonly dayKey: string;
  readonly occurredAt: string;
}

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function tokenCount(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function dayKeyOf(date: Date): string {
  if (!Number.isFinite(date.getTime())) {
    throw new StudioAiCostLedgerError(
      "cost_ledger_invalid_input",
      "유효한 호출 시각이 필요합니다.",
    );
  }
  return date.toISOString().slice(0, 10);
}

/**
 * 원가 기록 1건을 검증·정규화한다. 토큰 수가 비정상 값이면
 * null(미보고)로 두되 기록 자체는 거부하지 않는다 — 제공자
 * 미보고와 검증 실패를 구분하기 위해서다. 금액·통화·근거가
 * 없거나 음수면 기록을 거부한다.
 */
export function buildStudioAiCostRecord(
  input: StudioAiCostRecordInput,
): StudioAiCostRecord {
  const callId = boundedText(input.callId, 160);
  if (!callId) {
    throw new StudioAiCostLedgerError(
      "cost_ledger_invalid_input",
      "원가 기록 호출 식별자가 필요합니다.",
    );
  }
  const provider = boundedText(input.provider, 80);
  if (!provider) {
    throw new StudioAiCostLedgerError(
      "cost_ledger_invalid_input",
      "원가 기록 제공자가 필요합니다.",
    );
  }
  const model = boundedText(input.model, 160);
  if (!model) {
    throw new StudioAiCostLedgerError(
      "cost_ledger_invalid_input",
      "원가 기록 모델이 필요합니다.",
    );
  }
  const amount = Number(input.estimatedCostAmount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new StudioAiCostLedgerError(
      "cost_ledger_invalid_input",
      "원가 추정치는 0 이상의 숫자여야 합니다.",
    );
  }
  const currency = boundedText(input.estimatedCostCurrency, 8);
  if (!currency) {
    throw new StudioAiCostLedgerError(
      "cost_ledger_invalid_input",
      "원가 추정치 통화가 필요합니다.",
    );
  }
  const estimateBasis = boundedText(input.estimateBasis, 240);
  if (!estimateBasis) {
    throw new StudioAiCostLedgerError(
      "cost_ledger_invalid_input",
      "원가 추정치 근거 설명이 필요합니다.",
    );
  }
  const occurredAt = input.occurredAt ?? new Date();
  return {
    callId,
    provider,
    model,
    promptTokens: tokenCount(input.promptTokens),
    completionTokens: tokenCount(input.completionTokens),
    totalTokens: tokenCount(input.totalTokens),
    estimatedCostAmount: amount,
    estimatedCostCurrency: currency,
    estimateBasis,
    isEstimate: true,
    dayKey: dayKeyOf(occurredAt),
    occurredAt: occurredAt.toISOString(),
  };
}

export interface StudioAiCostLedgerQuery {
  provider?: string;
  model?: string;
  dayKey?: string;
}

export interface StudioAiCostSummaryRow {
  readonly provider: string;
  readonly model: string;
  readonly dayKey: string;
  readonly calls: number;
  readonly totalTokens: number;
  /** 토큰 미보고 호출은 합계에서 제외 (null은 0으로 합산하지 않음). */
  readonly callsWithTokens: number;
  readonly estimatedCostAmount: number;
  readonly estimatedCostCurrency: string;
  readonly isEstimate: true;
}

export interface StudioAiCostLedgerView {
  readonly rows: StudioAiCostSummaryRow[];
  readonly calls: number;
  readonly disclaimer: typeof STUDIO_AI_COST_ESTIMATE_DISCLAIMER;
}

/**
 * 프로세스 메모리 원장. 게이트 메모리 스토어와 같은 fail-closed
 * 성격이다: 재시작하면 기록이 사라지고, 용량 초과 시 신규 기록을
 * 거부한다 (낡은 기록을 조용히 버리지 않는다).
 */
export class InMemoryStudioAiCostLedger {
  private readonly records: StudioAiCostRecord[] = [];

  record(input: StudioAiCostRecordInput): StudioAiCostRecord {
    if (this.records.length >= STUDIO_AI_COST_LEDGER_CAPACITY) {
      throw new StudioAiCostLedgerError(
        "cost_ledger_capacity",
        "원가 원장이 보관 상한에 도달했습니다.",
      );
    }
    const record = buildStudioAiCostRecord(input);
    this.records.push(record);
    return record;
  }

  list(query: StudioAiCostLedgerQuery = {}): StudioAiCostRecord[] {
    return this.records.filter((record) => {
      if (query.provider !== undefined && record.provider !== query.provider) {
        return false;
      }
      if (query.model !== undefined && record.model !== query.model) {
        return false;
      }
      if (query.dayKey !== undefined && record.dayKey !== query.dayKey) {
        return false;
      }
      return true;
    });
  }

  get size(): number {
    return this.records.length;
  }
}

/**
 * 어드민 조회용 합계. 통화는 섞지 않는다: 통화별 합계를 별도 행
 * 그룹으로 유지하며, 통화 혼합 시도를 합산하지 않는다.
 */
export function summarizeStudioAiCosts(
  records: readonly StudioAiCostRecord[],
): StudioAiCostLedgerView {
  const grouped = new Map<string, StudioAiCostSummaryRow>();
  for (const record of records) {
    const key = [
      record.provider,
      record.model,
      record.dayKey,
      record.estimatedCostCurrency,
    ].join("\u0000");
    const existing = grouped.get(key);
    if (existing) {
      grouped.set(key, {
        ...existing,
        calls: existing.calls + 1,
        totalTokens:
          existing.totalTokens + (record.totalTokens ?? 0),
        callsWithTokens:
          existing.callsWithTokens + (record.totalTokens === null ? 0 : 1),
        estimatedCostAmount:
          existing.estimatedCostAmount + record.estimatedCostAmount,
      });
    } else {
      grouped.set(key, {
        provider: record.provider,
        model: record.model,
        dayKey: record.dayKey,
        calls: 1,
        totalTokens: record.totalTokens ?? 0,
        callsWithTokens: record.totalTokens === null ? 0 : 1,
        estimatedCostAmount: record.estimatedCostAmount,
        estimatedCostCurrency: record.estimatedCostCurrency,
        isEstimate: true,
      });
    }
  }
  const rows = [...grouped.values()].sort((a, b) =>
    a.dayKey === b.dayKey
      ? a.provider === b.provider
        ? a.model.localeCompare(b.model)
        : a.provider.localeCompare(b.provider)
      : a.dayKey.localeCompare(b.dayKey),
  );
  return {
    rows,
    calls: records.length,
    disclaimer: STUDIO_AI_COST_ESTIMATE_DISCLAIMER,
  };
}
