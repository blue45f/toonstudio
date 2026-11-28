// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { FREE_AI_14_MODE_IDS, runFreeAiZeroBillAssist } from "./free-ai-zero-bill-cascade";

function respondWith(result: unknown) {
  return vi.fn(async () => Response.json({ provider: "github-models-free", providerTier: "cloud-free", result }));
}

describe("무료 작업대의 요청·응답 모드 확인", () => {
  it.each(FREE_AI_14_MODE_IDS)("다른 모드의 응답을 %s 결과로 표시하거나 복사하지 않는다", async (mode) => {
    const otherMode = FREE_AI_14_MODE_IDS[(FREE_AI_14_MODE_IDS.indexOf(mode) + 1) % FREE_AI_14_MODE_IDS.length];
    const foreignText = "다른 탭의 비공개 편집 메모";
    const fetchImpl = respondWith({ mode: otherMode, data: { summary: foreignText } });
    const result = await runFreeAiZeroBillAssist({ mode, inputText: "서점 문을 여는 장면" }, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result.mode).toBe(mode);
    expect(result.providerTier).toBe("local-fallback");
    expect(result.fallbackNoticeKo).toContain("응답 형식");
    expect(JSON.stringify(result)).not.toContain(foreignText);
  });

  const input = { mode: "script-to-cuts" as const, inputText: "서점 문을 여는 장면" };
  it("모드 표기가 생략된 이전 응답도 요청한 콘티의 계약과 맞으면 보존한다", async () => {
    const data = { episodeGoal: "서점의 첫 손님을 만난다.", pacingTip: "문이 열릴 때 한 박자 쉰다.", cuts: [] };
    const result = await runFreeAiZeroBillAssist(input, { fetchImpl: respondWith({ data }) });
    expect(result.providerTier).toBe("cloud-free");
    expect(result.headlineKo).toBe(data.episodeGoal);
    expect(result.rawData).toEqual(data);
  });

  it.each([
    { data: { summary: "용도가 불명확한 결과" } },
    { mode: input.mode, data: {} },
    { mode: input.mode, data: ["다른 형식"] },
    { mode: input.mode, data: { readinessSummary: "마감 검토", checks: [] } },
    { mode: input.mode, data: { episodeGoal: "콘티 일부", readinessSummary: "혼입된 마감 응답" } },
    { mode: "script-to-cuts-v0", data: { episodeGoal: "구분할 수 없는 모드" } },
  ])("비었거나 모드를 판별할 수 없는 응답은 기기 내 콘티로 복구한다", async (response) => {
    const result = await runFreeAiZeroBillAssist(input, { fetchImpl: respondWith(response) });
    expect(result.providerTier).toBe("local-fallback");
    expect(result.rawData.cuts).toBeInstanceOf(Array);
    expect(result.fallbackNoticeKo).toContain("응답 형식");
  });
});
