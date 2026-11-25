// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchStudioOpenAiAssistStatus,
  runStudioOpenAiCreativeAssist,
} from "./studio-openai-creative-assist-client";

afterEach(() => {
  vi.useRealTimers();
});

function delayedBodyResponse(signal: AbortSignal | null | undefined, status: number): Response {
  return new Response(new ReadableStream({
    start(controller) {
      const abort = () => controller.error(new DOMException("Aborted", "AbortError"));
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    },
  }), { status });
}

describe("studio-openai-creative-assist-client", () => {
  it("요청 모드가 일치하는 정본 결과만 수락한다", async () => {
    const response = {
      provider: "openai",
      model: "mock-model",
      result: {
        mode: "continuity-plot-audit",
        data: {
          overallConsistencyScore: 90,
          summary: "흐름 점검",
          issues: [{
            severity: "tip",
            category: "소품",
            locationHint: "첫 장면",
            conflictDetail: "반복되는 소품의 모양을 확인하세요.",
            fixSuggestion: "등장 장면의 소품을 같은 모양으로 그리세요.",
          }],
        },
      },
      privacy: { storeData: false, piiRedactedCount: 0 },
      quota: { remainingDaily: 1, dailyLimit: 2 },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
    const request = async (body: unknown, mode: Parameters<typeof runStudioOpenAiCreativeAssist>[0]["mode"]) => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
      const result = await runStudioOpenAiCreativeAssist(
        { mode, inputText: "합성 원고" },
        { fetchImpl, sessionToken: "test-session" },
      );
      expect(fetchImpl).toHaveBeenCalledOnce();
      return result;
    };

    expect(await request(response, "continuity-plot-audit")).toEqual({ ok: true, data: response });
    const invalid = { ok: false, status: 502, code: "INVALID_SERVER_PAYLOAD" };
    expect(await request(response, "idea-remix")).toMatchObject(invalid);
    expect(await request({ ...response, usage: null }, "continuity-plot-audit")).toMatchObject(invalid);
    const brokenResult = { ...response.result, data: { ...response.result.data, issues: [null] } };
    expect(await request({ ...response, result: brokenResult }, "continuity-plot-audit")).toMatchObject(invalid);
  });

  it("서버가 연결되지 않았을 때도 오류 없이 안전한 미설정 안내 상태를 반환한다", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const status = await fetchStudioOpenAiAssistStatus({ fetchImpl: fetchMock });

    expect(status.configured).toBe(false);
    expect(status.keyLocation).toBe("server-env-only");
    expect(status.storeData).toBe(false);
    expect(status.autoBillingDisabled).toBeNull();
    expect(status.modelConfigurationError).toBeNull();
    expect(status.offlineFallback).toBe(true);
    expect(status.modes).toHaveLength(4);
  });

  it("구형 서버의 과금 차단 단정을 신뢰하지 않고 모델 설정 오류를 보존한다", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      configured: true,
      model: "gpt-4.1-nano",
      autoBillingDisabled: true,
      modelConfigurationError: "retired",
    }), { status: 200 }));

    const status = await fetchStudioOpenAiAssistStatus({ fetchImpl: fetchMock });
    expect(status.configured).toBe(true);
    expect(status.autoBillingDisabled).toBeNull();
    expect(status.modelConfigurationError).toBe("retired");
    expect(status.model).toBe("gpt-4.1-nano");
  });

  it.each([200, 429])("HTTP %s 헤더 이후 본문이 멈춰도 전체 요청 시간 제한이 유지된다", async (status) => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_url, init) =>
      delayedBodyResponse(init?.signal, status));
    const pending = runStudioOpenAiCreativeAssist(
      { mode: "dialogue-polish", inputText: "합성 대사 다듬기" },
      { fetchImpl: fetchMock, timeoutMs: 100, sessionToken: "test-session" },
    );

    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toMatchObject({ ok: false, status: 504, code: "CLIENT_TIMEOUT" });
    expect(vi.getTimerCount()).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("본문 수신 중 취소를 파싱 오류로 바꾸지 않고 요청을 중단한다", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_url, init) =>
      delayedBodyResponse(init?.signal, 200));
    const pending = runStudioOpenAiCreativeAssist(
      { mode: "dialogue-polish", inputText: "합성 대사 다듬기" },
      { fetchImpl: fetchMock, signal: controller.signal, sessionToken: "test-session" },
    );
    await Promise.resolve();
    controller.abort();

    expect(await pending).toMatchObject({ ok: false, status: 499, code: "CLIENT_ABORTED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("이미 취소한 요청은 서버에 보내지 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn<typeof fetch>();
    const result = await runStudioOpenAiCreativeAssist(
      { mode: "dialogue-polish", inputText: "합성 대사 다듬기" },
      { fetchImpl: fetchMock, signal: controller.signal, sessionToken: "test-session" },
    );
    expect(result).toMatchObject({ ok: false, code: "CLIENT_ABORTED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["OPENAI_QUOTA_EXHAUSTED", "OPENAI_SPEND_LIMIT_REACHED"])("%s 오류를 보존하고 자동 재시도하지 않는다", async (code) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ code, message: "관리자가 크레딧과 과금 한도를 확인해야 합니다." }),
      { status: 429 },
    ));
    const result = await runStudioOpenAiCreativeAssist(
      { mode: "idea-remix", inputText: "합성 아이디어" },
      { fetchImpl: fetchMock, sessionToken: "test-session" },
    );
    expect(result).toMatchObject({ ok: false, status: 429, code });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("잘못된 JSON 본문은 기존 파싱 오류로 반환하고 타이머를 정리한다", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("not-json", { status: 200 }));
    const result = await runStudioOpenAiCreativeAssist(
      { mode: "idea-remix", inputText: "합성 아이디어" },
      { fetchImpl: fetchMock, sessionToken: "test-session" },
    );
    expect(result).toMatchObject({ ok: false, code: "PARSE_ERROR" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("짧거나 너무 긴 입력은 네트워크 요청 전에 자연스러운 한국어로 안내한다", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    const tooShort = await runStudioOpenAiCreativeAssist(
      { mode: "idea-remix", inputText: "아" },
      { fetchImpl: fetchMock },
    );
    expect(tooShort.ok).toBe(false);
    if (!tooShort.ok) {
      expect(tooShort.code).toBe("INPUT_TOO_SHORT");
      expect(tooShort.message).toContain("두 글자 이상");
    }

    const tooLong = await runStudioOpenAiCreativeAssist(
      { mode: "idea-remix", inputText: "가".repeat(6_001) },
      { fetchImpl: fetchMock },
    );
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) {
      expect(tooLong.code).toBe("INPUT_TOO_LONG");
      expect(tooLong.message).toContain("6,000자");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("서버의 미설정(503) 및 한도 초과(429) 응답 코드를 그대로 보존해 안내한다", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "OPENAI_API_KEY_NOT_CONFIGURED",
          message: "서버에 OpenAI API 키(OPENAI_API_KEY)가 아직 설정되지 않았어요.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await runStudioOpenAiCreativeAssist(
      { mode: "script-to-cuts", inputText: "비 오는 정류장에서 우산을 건네는 장면" },
      { fetchImpl: fetchMock, sessionToken: "tok-1" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.code).toBe("OPENAI_API_KEY_NOT_CONFIGURED");
      expect(result.message).toContain("OPENAI_API_KEY");
    }
  });

  it("정상 응답에서 구조화된 컷 분할 데이터와 개인정보 마스킹 건수를 반환한다", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          provider: "openai",
          model: "gpt-4o-mini",
          result: {
            mode: "script-to-cuts",
            data: {
              episodeGoal: "첫 만남의 어색함과 호기심을 동시에 전달",
              pacingTip: "2컷과 3컷 사이에 넓은 스크롤 여백을 두세요.",
              cuts: [
                {
                  cutNumber: 1,
                  beatKind: "setup",
                  shotType: "와이드 샷",
                  visualAction: "장대비가 내리는 버스 정류장 전경",
                  dialogue: "",
                  scrollGapHint: "보통 간격",
                },
                {
                  cutNumber: 2,
                  beatKind: "reveal",
                  shotType: "클로즈업",
                  visualAction: "노란 우산 끝이 화면 아래에서 올라온다",
                  dialogue: "혹시 이 우산 쓰실래요?",
                  scrollGapHint: "넓은 여백 후 대사 배치",
                },
              ],
            },
          },
          privacy: { storeData: false, piiRedactedCount: 1 },
          quota: { remainingDaily: 59, dailyLimit: 60 },
          usage: { promptTokens: 120, completionTokens: 180, totalTokens: 300 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await runStudioOpenAiCreativeAssist(
      {
        mode: "script-to-cuts",
        inputText: "버스 정류장 첫 만남 (연락처 010-1234-5678)",
        projectTitle: "비 오는 날",
        targetPlatform: "vertical-webtoon",
      },
      { fetchImpl: fetchMock, sessionToken: "tok-2" },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.result.mode).toBe("script-to-cuts");
      expect(result.data.privacy.piiRedactedCount).toBe(1);
      expect(result.data.quota.remainingDaily).toBe(59);
    }
  });
});
