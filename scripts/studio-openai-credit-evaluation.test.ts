// @vitest-environment node

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buildCreditEvaluationPlan, CALL_INTERVAL_MS, CreditExecutionEvidenceSchema, readCreditUsage, runCreditEvaluation, sha256, type CreditEvaluationOptions, type CreditEvaluationReport } from "./studio-openai-credit-evaluation-core";
import { CREDIT_EVALUATION_FIXTURES } from "./studio-openai-credit-evaluation-fixtures";

const NOW = new Date("2026-11-18T05:00:00.000Z");
const ENV = { OPENAI_API_KEY: "test-only-placeholder", OPENAI_ORG_ID: "org-evaluation", OPENAI_PROJECT_ID: "proj_evaluation" };
let planHash: string;

function evidence(changes: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1, planHash, verifiedAt: NOW.toISOString(), creditExpiresAt: "2026-11-28T00:00:00.000Z",
    organizationId: ENV.OPENAI_ORG_ID, projectId: ENV.OPENAI_PROJECT_ID, apiKeySha256: sha256(ENV.OPENAI_API_KEY),
    availablePromotionalCreditUsd: 1, eligibleModels: ["gpt-4o-mini", "gpt-4.1-mini"], keyOrganizationConfirmed: true,
    automaticRechargeDisabled: true, additionalPaidSpendBlocked: true,
    billingBlockMechanism: "실제 계정 증거가 아닌 단위 테스트 전용 가상 비용 차단 근거입니다.",
    sourceReferences: { balance: "test:balance", expiration: "test:expiration", eligibility: "test:eligibility", billingBlock: "test:billing", keyOrganization: "test:key" },
    approvedMaxAttempts: 20, approvedPromoSpendUsd: 1, approvedPaidSpendUsd: 0, ...changes,
  };
}

function structuredOutput(schemaName: string): object {
  if (schemaName === "toonstudio_dialogue_polish") return {
    readabilityNote: "가상 응답의 형식만 검사합니다.",
    balloons: ["구어체", "핵심형", "여운형"].map((toneLabel) => ({ toneLabel, line: "내일 오전까지 보내도 괜찮을까요?", subBubble: "", reason: "허락을 구하는 문장입니다." })),
  };
  if (schemaName === "toonstudio_script_to_cuts") return {
    episodeGoal: "가상 컷의 구조를 확인합니다.", pacingTip: "행동 뒤에 여백을 둡니다.",
    cuts: Array.from({ length: 4 }, (_, index) => ({ cutNumber: index + 1, beatKind: "action", shotType: "중간 샷", visualAction: "인물이 손을 내민다.", dialogue: "", scrollGapHint: "한 칸 여백" })),
  };
  if (schemaName === "toonstudio_idea_remix") return {
    summary: "가상 발상의 형식을 확인합니다.",
    angles: ["contrarian", "personal-hook", "detail-evidence", "four-cut-playbook", "missed-angle"].map((lens) => ({ lens, lensLabelKo: "발상", headline: "반납함의 책", pitch: "사서가 책을 살펴본다.", firstCutHint: "반납함에 손을 넣는 사서의 손을 그린다." })),
  };
  return {
    readinessSummary: "제공된 문구만 점검했습니다.", episodeBlurbSuggestion: "우산을 건넨 뒤 남겨진 마음.",
    checks: [{ category: "말풍선", severity: "tip", detail: "긴 문장을 두 말풍선으로 나누세요." }, { category: "파일", severity: "tip", detail: "제공되지 않은 파일은 확인하지 않았습니다." }],
  };
}

function response(init?: RequestInit, change: Record<string, unknown> = {}): Response {
  const request = JSON.parse(String(init?.body)) as { model: string; response_format: { json_schema: { name: string } } };
  return new Response(JSON.stringify({
    model: request.model === "gpt-4o-mini" ? "gpt-4o-mini-2024-07-18" : "gpt-4.1-mini-2025-04-14",
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, prompt_tokens_details: { cached_tokens: 20 } },
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(structuredOutput(request.response_format.json_schema.name)) } }],
    ...change,
  }), { headers: { "x-request-id": "req_test" } });
}

function options(changes: Partial<CreditEvaluationOptions> = {}): CreditEvaluationOptions {
  return {
    execute: true, env: ENV, evidence: evidence(), checkpoint: async () => undefined,
    pause: async (milliseconds) => { vi.setSystemTime(Date.now() + milliseconds); },
    ...changes,
  };
}

beforeAll(async () => { planHash = (await runCreditEvaluation()).planHash; });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("실제 네트워크는 테스트에서 금지됩니다."); }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("OpenAI 크레딧 검증 오프라인 계획", () => {
  it("기본 실행은 키 없이 20개 계획만 만들며 외부 transport와 전역 fetch를 호출하지 않는다", async () => {
    const transport = vi.fn<typeof fetch>();
    const report = await runCreditEvaluation({ transport });
    expect(transport).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(report).toMatchObject({ mode: "dry-run", attempts: 0, estimatedUsd: 0, unconfirmedReservedUsd: 0, completedAllContracts: false, accountQueriedByRunner: false });
    expect(report.results).toHaveLength(20);
    expect(report.plannedMaximumUsd).toBeGreaterThan(0);
    expect(report.plannedMaximumUsd).toBeLessThan(1);
    expect(report.humanEvaluation.status).toBe("not-performed");
    expect(CREDIT_EVALUATION_FIXTURES.map((fixture) => fixture.input.mode)).toEqual([
      ...Array<string>(6).fill("dialogue-polish"), "script-to-cuts", "script-to-cuts", "idea-remix", "export-preflight-coach",
    ]);
  });

  it("실제 서비스의 전체 시스템·사용자·스키마 요청을 예약하고 모델별 같은 입력을 유지한다", async () => {
    const plan = await buildCreditEvaluationPlan();
    for (const entry of plan) {
      const body = JSON.parse(entry.body) as { store: boolean; max_completion_tokens: number; messages: object[]; response_format: { json_schema: { strict: boolean } } };
      expect(body.store).toBe(false);
      expect(body.max_completion_tokens).toBe(1400);
      expect(body.messages).toHaveLength(2);
      expect(body.response_format.json_schema.strict).toBe(true);
      expect(entry.reservedInputTokens).toBeGreaterThan(Buffer.byteLength(entry.body, "utf8"));
    }
    for (let index = 0; index < plan.length; index += 2) expect(plan[index]?.comparisonHash).toBe(plan[index + 1]?.comparisonHash);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("OpenAI 실행 승인·시도·예약 경계", () => {
  it.each([
    { label: "증거 없음", value: undefined },
    { label: "잔액 부족", value: () => evidence({ availablePromotionalCreditUsd: 0.99 }) },
    { label: "만료", value: () => evidence({ creditExpiresAt: "2026-11-17T00:00:00.000Z" }) },
    { label: "오래된 확인", value: () => evidence({ verifiedAt: "2026-11-18T03:00:00.000Z" }) },
    { label: "다른 키", value: () => evidence({ apiKeySha256: "0".repeat(64) }) },
    { label: "다른 조직", value: () => evidence({ organizationId: "org-other" }) },
    { label: "유료 지출 미차단", value: () => evidence({ additionalPaidSpendBlocked: false }) },
    { label: "모델 적격 미확인", value: () => evidence({ eligibleModels: ["gpt-4o-mini"] }) },
    { label: "다른 계획", value: () => evidence({ planHash: "0".repeat(64) }) },
  ])("$label 상태에서는 API 요청 0회", async ({ value }) => {
    const transport = vi.fn<typeof fetch>();
    await expect(runCreditEvaluation(options({ evidence: value?.(), transport }))).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("날짜만 관측한 만료는 실제 UTC 시각을 만들지 않고 전날 00:00Z 실행 제한으로 기록한다", async () => {
    const transport = vi.fn<typeof fetch>(async (_url, init) => response(init));
    const report = await runCreditEvaluation(options({
      evidence: evidence({ creditExpiresAt: undefined, creditExpiresOn: "2026-11-28" }), transport,
    }));
    expect(report.completedAllContracts).toBe(true);
    expect(report.creditExpiration).toMatchObject({ precision: "date-only", observedValue: "2026-11-28", actualExpiresAt: null, executionCutoffAt: "2026-11-27T00:00:00.000Z" });
    expect(report.creditExpiration?.note).toContain("실제 만료 시각이 아니다");
    expect(CreditExecutionEvidenceSchema.safeParse(evidence({ creditExpiresOn: "2026-11-28" })).success).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("날짜 전용 만료의 전날 00:00Z에는 계정 확인이 방금 이루어졌어도 호출을 막는다", async () => {
    const cutoff = "2026-11-27T00:00:00.000Z";
    vi.setSystemTime(new Date(cutoff));
    const transport = vi.fn<typeof fetch>();
    await expect(runCreditEvaluation(options({
      evidence: evidence({ verifiedAt: cutoff, creditExpiresAt: undefined, creditExpiresOn: "2026-11-28" }), transport,
    }))).rejects.toThrow("실행 차단 시각");
    expect(transport).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("10개 사례·두 모델·4개 모드가 실제 서비스 파서를 통과하고 20회에서 끝난다", async () => {
    const snapshots: CreditEvaluationReport[] = [];
    const pause = vi.fn(async (milliseconds: number) => { vi.setSystemTime(Date.now() + milliseconds); });
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const pending = snapshots.at(-1);
      expect(pending?.results.at(-1)?.outcome).toBe("pending");
      expect(pending?.unconfirmedReservedUsd).toBeGreaterThan(0);
      expect((pending?.estimatedUsd ?? 0) + (pending?.unconfirmedReservedUsd ?? 0)).toBeLessThanOrEqual(1);
      expect(init?.redirect).toBe("error");
      return response(init);
    });
    const report = await runCreditEvaluation(options({ transport, pause, checkpoint: async (snapshot) => { snapshots.push(structuredClone(snapshot)); } }));
    expect(transport).toHaveBeenCalledTimes(20);
    expect(fetch).not.toHaveBeenCalled();
    expect(pause).toHaveBeenCalledTimes(19);
    expect(pause.mock.calls.every(([milliseconds]) => milliseconds >= CALL_INTERVAL_MS)).toBe(true);
    expect(report).toMatchObject({ attempts: 20, completedAllContracts: true, unconfirmedReservedUsd: 0 });
    expect(report.creditExpiration).toMatchObject({ precision: "utc-instant", actualExpiresAt: "2026-11-28T00:00:00.000Z", executionCutoffAt: "2026-11-28T00:00:00.000Z" });
    expect(report.estimatedUsd).toBeCloseTo(0.00165, 8);
    expect(report.results.every((result) => result.outcome === "passed-contracts" && result.output && result.usage && result.requestId && result.durationMs >= 0)).toBe(true);
    expect(new Set(report.results.map((result) => result.output?.mode)).size).toBe(4);
    expect(report.humanEvaluation.status).toBe("not-performed");
    expect(JSON.stringify(report)).not.toContain(ENV.OPENAI_API_KEY);
  });

  it("전송 전 영속 예약 기록이 실패하면 네트워크를 호출하지 않는다", async () => {
    const transport = vi.fn<typeof fetch>();
    await expect(runCreditEvaluation(options({ transport, checkpoint: async () => { throw new Error("기록 실패"); } }))).rejects.toThrow("기록 실패");
    expect(transport).not.toHaveBeenCalled();
  });

  it("네트워크 실패도 1회로 세고 예약을 유지하며 재시도하지 않는다", async () => {
    const transport = vi.fn<typeof fetch>(async () => { throw new Error("private-upstream-detail"); });
    const report = await runCreditEvaluation(options({ transport }));
    expect(transport).toHaveBeenCalledTimes(1);
    expect(report.attempts).toBe(1);
    expect(report.results[0]?.outcome).toBe("stopped");
    expect(report.unconfirmedReservedUsd).toBe(report.results[0]?.reservedUsd);
    expect(report.estimatedUsd).toBe(0);
    expect(JSON.stringify(report)).not.toContain("private-upstream-detail");
  });

  it.each([401, 429, 500])("HTTP %s 오류는 예약을 유지하고 즉시 종료한다", async (status) => {
    const transport = vi.fn<typeof fetch>(async () => new Response("private-error", { status }));
    const report = await runCreditEvaluation(options({ transport }));
    expect(transport).toHaveBeenCalledTimes(1);
    expect(report.results[0]?.errorCode).toBe(`upstream-http-${status}`);
    expect(report.unconfirmedReservedUsd).toBeGreaterThan(0);
    expect(JSON.stringify(report)).not.toContain("private-error");
  });

  it.each([
    { usage: undefined },
    { usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } },
    { usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 149 } },
    { model: "unrecognized-model" },
  ])("미확인 사용량·모델 비용은 무료 성공으로 처리하지 않는다", async (change) => {
    const transport = vi.fn<typeof fetch>(async (_url, init) => response(init, change));
    const report = await runCreditEvaluation(options({ transport }));
    expect(transport).toHaveBeenCalledTimes(1);
    expect(report.unconfirmedReservedUsd).toBeGreaterThan(0);
    expect(report.estimatedUsd).toBe(0);
    expect(report.completedAllContracts).toBe(false);
  });

  it.each([
    { change: { model: "gpt-4.1-mini" }, code: "model-mismatch" },
    { change: { usage: { prompt_tokens: 100, completion_tokens: 1401, total_tokens: 1501 } }, code: "reservation-exceeded" },
    { change: { choices: [{ finish_reason: "length", message: { content: "{}" } }] }, code: "incomplete-response" },
    { change: { choices: [{ finish_reason: "tool_calls", message: { content: "{}" } }] }, code: "incomplete-response" },
    { change: { choices: [{ finish_reason: "stop", message: { content: "{}" } }] }, code: "provider-or-service-error" },
  ])("$code 오류도 확인된 사용 비용을 기록한 뒤 중단한다", async ({ change, code }) => {
    const transport = vi.fn<typeof fetch>(async (_url, init) => response(init, change));
    const report = await runCreditEvaluation(options({ transport }));
    expect(transport).toHaveBeenCalledTimes(1);
    expect(report.results[0]?.errorCode).toBe(code);
    expect(report.estimatedUsd).toBeGreaterThan(0);
    expect(report.unconfirmedReservedUsd).toBe(0);
    expect(report.completedAllContracts).toBe(false);
  });

  it("큰 응답은 본문 제한에서 멈추고 미확정 예약을 보존한다", async () => {
    const transport = vi.fn<typeof fetch>(async () => new Response("x".repeat(65_537)));
    const report = await runCreditEvaluation(options({ transport }));
    expect(transport).toHaveBeenCalledTimes(1);
    expect(report.unconfirmedReservedUsd).toBeGreaterThan(0);
    expect(report.completedAllContracts).toBe(false);
  });

  it("서비스 스키마에 맞아도 요청한 3개 톤을 주지 않으면 계약 실패로 중단한다", async () => {
    const transport = vi.fn<typeof fetch>(async (_url, init) => response(init, {
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ readabilityNote: "형식 검사", balloons: ["첫째", "둘째"].map((toneLabel) => ({ toneLabel, line: "내일 보자.", subBubble: "", reason: "짧은 문장" })) }) } }],
    }));
    const report = await runCreditEvaluation(options({ transport }));
    expect(transport).toHaveBeenCalledTimes(1);
    expect(report.results[0]?.errorCode).toBe("output-contract-failed");
    expect(report.estimatedUsd).toBeGreaterThan(0);
    expect(report.humanEvaluation.status).toBe("not-performed");
  });

  it("요청 전 취소는 비용 예약·외부 호출 없이 끝난다", async () => {
    const controller = new AbortController();
    controller.abort();
    const transport = vi.fn<typeof fetch>();
    const report = await runCreditEvaluation(options({ transport, signal: controller.signal }));
    expect(transport).not.toHaveBeenCalled();
    expect(report).toMatchObject({ attempts: 0, unconfirmedReservedUsd: 0, estimatedUsd: 0 });
    expect(report.results[0]?.errorCode).toBe("cancelled");
  });

  it("비정상 token 타입과 캐시 합계를 거절한다", () => {
    expect(readCreditUsage({ prompt_tokens: "100", completion_tokens: 50, total_tokens: 150 })).toBeNull();
    expect(readCreditUsage({ prompt_tokens: 100, completion_tokens: -1, total_tokens: 99 })).toBeNull();
    expect(readCreditUsage({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, prompt_tokens_details: { cached_tokens: 101 } })).toBeNull();
  });
});
