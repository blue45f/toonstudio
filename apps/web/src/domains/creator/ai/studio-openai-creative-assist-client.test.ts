// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  fetchStudioOpenAiAssistStatus,
  runStudioOpenAiCreativeAssist,
} from "./studio-openai-creative-assist-client";

describe("studio-openai-creative-assist-client", () => {
  it("서버가 연결되지 않았을 때도 오류 없이 안전한 미설정 안내 상태를 반환한다", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const status = await fetchStudioOpenAiAssistStatus({ fetchImpl: fetchMock });

    expect(status.configured).toBe(false);
    expect(status.keyLocation).toBe("server-env-only");
    expect(status.storeData).toBe(false);
    expect(status.offlineFallback).toBe(true);
    expect(status.modes).toHaveLength(4);
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
