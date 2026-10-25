import { describe, expect, it } from "vitest";

import { summarizeAiProvenance } from "./studio-ai-provenance-summary";

describe("studio-ai-provenance-summary", () => {
  it("작업·상태·경로별 개수를 세고 최근 성공 프롬프트 요약만 모은다", () => {
    const summary = summarizeAiProvenance([
      { task: "colorize", status: "succeeded", transport: "byok", promptSummary: "파스텔 채색" },
      { task: "colorize", status: "failed", transport: "byok", promptSummary: "실패한 채색" },
      { task: "translation", status: "succeeded", transport: "server", promptSummary: "대사 번역" },
      { task: "colorize", status: "succeeded", transport: "local", promptSummary: "파스텔 채색" },
    ]);
    expect(summary.total).toBe(4);
    expect(summary.byTask).toEqual({ colorize: 3, translation: 1 });
    expect(summary.byStatus).toEqual({ succeeded: 3, failed: 1 });
    expect(summary.byTransport).toEqual({ byok: 2, server: 1, local: 1 });
    expect(summary.latestPromptSummaries).toEqual(["파스텔 채색", "대사 번역"]);
  });

  it("상한을 적용한다", () => {
    const summary = summarizeAiProvenance(
      [
        { task: "colorize", status: "succeeded", transport: "byok", promptSummary: "첫째" },
        { task: "colorize", status: "succeeded", transport: "byok", promptSummary: "둘째" },
        { task: "colorize", status: "succeeded", transport: "byok", promptSummary: "셋째" },
      ],
      2,
    );
    expect(summary.latestPromptSummaries).toEqual(["셋째", "둘째"]);
  });
});
