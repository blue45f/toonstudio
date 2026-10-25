import { describe, expect, it } from "vitest";

import { buildHandoverSummaryPrompt } from "./studio-ai-handover-summary";

describe("studio-ai-handover-summary", () => {
  it("인계 정보를 요약 프롬프트로 만든다", () => {
    const prompt = buildHandoverSummaryPrompt({
      workTitle: "우체통",
      outgoingAuthor: "김작가",
      incomingAuthor: "이작가",
      bibleSummary: "민지, 빨간 머리",
      styleSummary: "수채화, 파스텔",
      pendingCount: 2,
      inProgressCutCount: 5,
    });
    expect(prompt).toContain("김작가 → 이작가");
    expect(prompt).toContain("미결 검수 항목: 2건");
    expect(prompt).toContain("진행 중 컷: 5장");
  });
});
