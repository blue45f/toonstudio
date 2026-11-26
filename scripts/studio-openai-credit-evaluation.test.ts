// @vitest-environment node

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buildModeSystemInstruction, MODE_JSON_SCHEMAS } from "../apps/api/src/modules/studio-ai/openai-assist/studio-openai-prompt-catalog";
import { OpenAiDialoguePolishOutputSchema } from "../apps/api/src/modules/studio-ai/studio-openai-creative-assist.dto";

import { buildCreditEvaluationPlan, CALL_INTERVAL_MS, CreditExecutionEvidenceSchema, fingerprintApiKey, readCreditUsage, runCreditEvaluation, type CreditEvaluationOptions, type CreditEvaluationReport } from "./studio-openai-credit-evaluation-core";
import { CREDIT_EVALUATION_FIXTURES, evaluateCreditOutput } from "./studio-openai-credit-evaluation-fixtures";

const NOW = new Date("2026-11-18T05:00:00.000Z");
const ENV = { OPENAI_API_KEY: "test-only-placeholder", OPENAI_ORG_ID: "org-evaluation", OPENAI_PROJECT_ID: "proj_evaluation" };
const TEST_API_KEY_FINGERPRINT = fingerprintApiKey(ENV.OPENAI_API_KEY, ENV.OPENAI_ORG_ID, ENV.OPENAI_PROJECT_ID);
let planHash: string;

function evidence(changes: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1, planHash, verifiedAt: NOW.toISOString(), creditExpiresAt: "2026-11-28T00:00:00.000Z",
    organizationId: ENV.OPENAI_ORG_ID, projectId: ENV.OPENAI_PROJECT_ID, apiKeyFingerprint: TEST_API_KEY_FINGERPRINT,
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
    balloons: [
      { toneLabel: "자연스러운 구어체", line: "내일 오전까지 보내도 괜찮을까요?" },
      { toneLabel: "짧고 강한 핵심형", line: "내일 오전까지 보내도 될까요?" },
      { toneLabel: "감정 여운 강조형", line: "혹시… 내일 오전까지 보내도 괜찮을까요?" },
    ].map((item) => ({ ...item, subBubble: "", reason: "허락을 구하는 문장입니다." })),
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("실제 네트워크는 테스트에서 금지됩니다."); }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("대사 대안 계약", () => {
  const alternatives = [
    { toneLabel: "자연스러운 구어체", line: "주소만 확인했어요.", subBubble: "아직 만난 적은 없어요.", reason: "사실을 차례로 전한다." },
    { toneLabel: "짧고 강한 핵심형", line: "주소만 확인했어요.", subBubble: "대면은 아직이에요.", reason: "뒷말을 짧게 맺는다." },
    { toneLabel: "감정 여운 강조형", line: "아직 만나진 못했어요.", subBubble: "확인한 건 주소뿐이에요.", reason: "확인한 사실을 마지막에 둔다." },
  ];
  const evaluate = (balloons: typeof alternatives) =>
    evaluateCreditOutput({ mode: "dialogue-polish", data: { readabilityNote: "대면 여부를 보존한다.", balloons } })[0]?.passed;

  it("생성 요청에서 세 톤과 항목의 단위를 일치시킨다", () => {
    const labels = alternatives.map(({ toneLabel }) => toneLabel);
    const prompt = buildModeSystemInstruction("dialogue-polish");
    for (const label of labels) expect(prompt).toContain(label);
    expect(MODE_JSON_SCHEMAS["dialogue-polish"].schema).toMatchObject({
      properties: { balloons: {
        description: expect.stringContaining("총 3개"),
        items: { properties: { toneLabel: { enum: labels } } },
      } },
    });
  });

  it("보조 말풍선까지 읽어 대안을 구분하고 원문을 그대로 둔다", () => {
    const reordered = [...alternatives].reverse();
    const snapshot = structuredClone(reordered);
    expect(evaluate(reordered)).toBe(true);
    expect(reordered).toEqual(snapshot);
  });

  it("허용 길이 끝에 있는 보조 대사까지 비교한다", () => {
    const [first, second, third] = alternatives;
    const line = "가".repeat(200);
    const prefix = "나".repeat(156);
    const balloons = [
      { ...first, line, subBubble: prefix + "없어요." },
      { ...second, line, subBubble: prefix + "없지요." },
      third,
    ];
    const parsed = OpenAiDialoguePolishOutputSchema.parse({ readabilityNote: "경계값", balloons });
    expect(evaluate(parsed.balloons)).toBe(true);
    expect(parsed.balloons).toEqual(balloons);
  });

  it("같은 톤을 나눈 7개 항목, 세 항목 안의 중복 톤, 경계만 옮긴 같은 대사를 거부한다", () => {
    const [first, second, third] = alternatives;
    expect(evaluate([...alternatives, ...alternatives, first])).toBe(false);
    expect(evaluate([first, { ...second, toneLabel: first.toneLabel }, third])).toBe(false);
    expect(evaluate([first, { ...second, line: first.line + "\n" + first.subBubble, subBubble: "" }, third])).toBe(false);
  });

  it("기존 두 항목 응답은 공용 파서로 읽을 수 있고 새 생성 평가에서는 탈락한다", () => {
    const balloons = alternatives.slice(0, 2);
    expect(OpenAiDialoguePolishOutputSchema.safeParse({ readabilityNote: "기존 결과", balloons }).success).toBe(true);
    expect(evaluate(balloons)).toBe(false);
  });
});

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
      if (entry.fixture.input.mode === "dialogue-polish") {
        expect(body.messages[0]).toMatchObject({
          role: "system",
          content: expect.stringContaining("사건이 실제로 일어났는지와 화자가 무엇을 부정하는지"),
        });
        expect(body.messages[0]).toHaveProperty("content", buildModeSystemInstruction("dialogue-polish"));
      }
      expect(body.response_format.json_schema.strict).toBe(true);
      expect(entry.reservedInputTokens).toBeGreaterThan(Buffer.byteLength(entry.body, "utf8"));
    }
    for (let index = 0; index < plan.length; index += 2) expect(plan[index]?.comparisonHash).toBe(plan[index + 1]?.comparisonHash);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("OpenAI 실행 승인·시도·예약 경계", () => {
  beforeAll(async () => { planHash = (await runCreditEvaluation()).planHash; });
  it.each([
    { label: "증거 없음", value: undefined },
    { label: "잔액 부족", value: () => evidence({ availablePromotionalCreditUsd: 0.99 }) },
    { label: "만료", value: () => evidence({ creditExpiresAt: "2026-11-17T00:00:00.000Z" }) },
    { label: "오래된 확인", value: () => evidence({ verifiedAt: "2026-11-18T03:00:00.000Z" }) },
    { label: "다른 키", value: () => evidence({ apiKeyFingerprint: "0".repeat(64) }) },
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

  it("API 키 지문은 조직·프로젝트 컨텍스트에 바인딩된 scrypt 64자리 hex를 생성한다", () => {
    expect(TEST_API_KEY_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/u);
    expect(fingerprintApiKey(ENV.OPENAI_API_KEY, "org-other", ENV.OPENAI_PROJECT_ID)).not.toBe(TEST_API_KEY_FINGERPRINT);
    expect(fingerprintApiKey(ENV.OPENAI_API_KEY, ENV.OPENAI_ORG_ID, "proj_other")).not.toBe(TEST_API_KEY_FINGERPRINT);
  });
});
