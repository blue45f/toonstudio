import { describe, expect, it } from "vitest";

import {
  STUDIO_AI_SUPPORT_REFUSAL,
  buildSupportAnswerPrompt,
  isSupportRefusal,
} from "./studio-ai-support-answer";

describe("studio-ai-support-answer", () => {
  it("FAQ 근거와 거부 지시를 담은 프롬프트를 만든다", () => {
    const prompt = buildSupportAnswerPrompt({
      question: "크레딧은 어떻게 쓰나요?",
      faqEntries: [{ question: "크레딧 사용", answer: "AI 기능에 씁니다." }],
    });
    expect(prompt).toContain("크레딧 사용");
    expect(prompt).toContain(STUDIO_AI_SUPPORT_REFUSAL);
  });

  it("거부 문장을 판정한다", () => {
    expect(isSupportRefusal(STUDIO_AI_SUPPORT_REFUSAL)).toBe(true);
    expect(isSupportRefusal("크레딧은 AI 기능에 씁니다.")).toBe(false);
  });
});
