/**
 * studio-ai-cost-ledger.test.ts — AI 원가 추적 장치 단위 테스트.
 * 정식 실행은 vitest(CI 확인 항목). 실제 청구·결제와 연결되지
 * 않음을 추정치 표기 케이스로 고정한다.
 *
 * 케이스: 기록 정규화(토큰 미보고 null·일자 키), 필수값 누락 거부,
 * 음수 추정치 거부, 제공자·일자 필터 조회, 통화 미혼합 합계,
 * 추정치 고지·isEstimate 고정.
 */
import { describe, expect, it } from "vitest";

import {
  InMemoryStudioAiCostLedger,
  STUDIO_AI_COST_ESTIMATE_DISCLAIMER,
  StudioAiCostLedgerError,
  buildStudioAiCostRecord,
  summarizeStudioAiCosts,
} from "./studio-ai-cost-ledger";

function recordInput(overrides: Record<string, unknown> = {}) {
  return {
    callId: "call-1",
    provider: "groq",
    model: "llama-test",
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    estimatedCostAmount: 0.02,
    estimatedCostCurrency: "USD",
    estimateBasis: "제공자 공개 단가표 기준 추정치",
    occurredAt: new Date("2026-10-25T10:00:00.000Z"),
    ...overrides,
  };
}

describe("studio ai cost ledger", () => {
  it("기록을 정규화하고 일자 키와 추정치 표기를 고정한다", () => {
    const record = buildStudioAiCostRecord(recordInput());
    expect(record.dayKey).toBe("2026-10-25");
    expect(record.isEstimate).toBe(true);
    expect(record.totalTokens).toBe(150);
  });

  it("토큰 미보고는 null로 두고 필수값·음수 추정치는 거부한다", () => {
    const unreported = buildStudioAiCostRecord(
      recordInput({ promptTokens: undefined, totalTokens: undefined }),
    );
    expect(unreported.totalTokens).toBeNull();
    expect(() =>
      buildStudioAiCostRecord(recordInput({ callId: "  " })),
    ).toThrow(StudioAiCostLedgerError);
    expect(() =>
      buildStudioAiCostRecord(recordInput({ estimatedCostAmount: -1 })),
    ).toThrow(StudioAiCostLedgerError);
    expect(() =>
      buildStudioAiCostRecord(recordInput({ estimateBasis: "" })),
    ).toThrow(StudioAiCostLedgerError);
  });

  it("제공자·일자 필터 조회와 통화 미혼합 합계를 낸다", () => {
    const ledger = new InMemoryStudioAiCostLedger();
    ledger.record(recordInput());
    ledger.record(
      recordInput({
        callId: "call-2",
        provider: "groq",
        totalTokens: undefined,
        estimatedCostAmount: 0.01,
      }),
    );
    ledger.record(
      recordInput({
        callId: "call-3",
        provider: "gemini",
        estimatedCostCurrency: "KRW",
        estimatedCostAmount: 30,
      }),
    );
    expect(ledger.list({ provider: "groq" })).toHaveLength(2);
    expect(ledger.list({ dayKey: "2026-10-26" })).toHaveLength(0);
    const view = summarizeStudioAiCosts(ledger.list());
    expect(view.calls).toBe(3);
    expect(view.disclaimer).toBe(STUDIO_AI_COST_ESTIMATE_DISCLAIMER);
    // 통화별 별도 행: groq/USD 행과 gemini/KRW 행.
    expect(view.rows).toHaveLength(2);
    const groqRow = view.rows.find((row) => row.provider === "groq");
    expect(groqRow?.calls).toBe(2);
    expect(groqRow?.callsWithTokens).toBe(1);
    expect(groqRow?.estimatedCostAmount).toBeCloseTo(0.03);
    expect(groqRow?.isEstimate).toBe(true);
  });
});
