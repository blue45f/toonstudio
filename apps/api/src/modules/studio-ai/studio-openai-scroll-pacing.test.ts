import { describe, expect, it, vi } from "vitest";

import { StudioOpenAiCreativeAssistService } from "./studio-openai-creative-assist.service";

const mode = "scroll-pacing-auditor";
const beat = {
  section: "도입",
  pacing: "tight" as const,
  recommendedGapPx: 16,
  readerRetentionNote: "첫 컷에서 시선을 잡으세요.",
};
const output = {
  rhythmVerdict: "마지막 컷 앞에서 호흡을 늦추세요.",
  averageGapPx: 16,
  cliffhangerScore: 0,
  cliffhangerTip: "문을 연 사람의 얼굴은 다음 화에서 보여 주세요.",
  beatPacing: [beat, { ...beat, section: "엔딩", pacing: "drop" as const, recommendedGapPx: 16 }],
};

function requestWithOutput(data: unknown) {
  const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(data) } }],
  }));
  const result = new StudioOpenAiCreativeAssistService().assist(
    "user:scroll-pacing-test",
    { mode, inputText: "문을 열기 직전에 끝나는 회차의 컷 호흡을 점검해 주세요." },
    { env: { OPENAI_API_KEY: "test-placeholder", OPENAI_MODEL: "gpt-4.1-mini" }, fetchImpl },
  );
  return { fetchImpl, result };
}

describe("스크롤 호흡 감사 응답 계약", () => {
  it("전송 스키마에 간격·점수·구간 수 범위를 싣고 경계값을 그대로 반환한다", async () => {
    const { fetchImpl, result } = requestWithOutput(output);
    await expect(result).resolves.toMatchObject({ provider: "openai", result: { mode, data: output } });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    const gap = { type: "integer", minimum: 16, maximum: 1600 };
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        strict: true,
        schema: {
          properties: {
            averageGapPx: gap,
            cliffhangerScore: { type: "integer", minimum: 0, maximum: 100 },
            beatPacing: { minItems: 2, maxItems: 8, items: { properties: { recommendedGapPx: gap } } },
          },
        },
      },
    });
    const systemPrompt = body.messages[0].content;
    expect(systemPrompt).toMatch(/rhythmVerdict[^.]*1~320자/);
    expect(systemPrompt).toMatch(/section[^.]*1~100자/);
    expect(systemPrompt).toMatch(/readerRetentionNote[^.]*1~280자/);
    expect(systemPrompt).toMatch(/cliffhangerTip[^.]*1~320자/);
  });

  it("평균 1600px, 엔딩 100점, 8개 구간까지 허용하고 구간 평균으로 averageGapPx를 동기화한다", async () => {
    const upper = {
      ...output,
      averageGapPx: 1600,
      cliffhangerScore: 100,
      beatPacing: Array.from({ length: 8 }, () => ({ ...beat, recommendedGapPx: 1600 })),
    };
    await expect(requestWithOutput(upper).result).resolves.toMatchObject({ result: { mode, data: upper } });

    const mixed = {
      ...output,
      averageGapPx: 16,
      beatPacing: [beat, { ...beat, section: "엔딩", pacing: "drop" as const, recommendedGapPx: 1600 }],
    };
    await expect(requestWithOutput(mixed).result).resolves.toMatchObject({
      result: { mode, data: { ...mixed, averageGapPx: 808 } },
    });
  });

  it.each([
    ["평균 간격 미달", { averageGapPx: 15 }],
    ["구간 간격 미달", { beatPacing: [beat, { ...beat, recommendedGapPx: 15 }] }],
    ["구간 간격 초과", { beatPacing: [beat, { ...beat, recommendedGapPx: 1601 }] }],
    ["음수 점수", { cliffhangerScore: -1 }],
    ["100점 초과", { cliffhangerScore: 101 }],
    ["소수 점수", { cliffhangerScore: 0.5 }],
    ["구간 부족", { beatPacing: [beat] }],
    ["구간 초과", { beatPacing: Array.from({ length: 9 }, () => beat) }],
    ["빈 총평", { rhythmVerdict: "" }],
    ["긴 총평", { rhythmVerdict: "가".repeat(321) }],
    ["긴 구간 이름", { beatPacing: [beat, { ...beat, section: "가".repeat(101) }] }],
    ["긴 구간 설명", { beatPacing: [beat, { ...beat, readerRetentionNote: "가".repeat(281) }] }],
    ["긴 클리프행어 팁", { cliffhangerTip: "가".repeat(321) }],
  ] as const)("%s 응답을 거절한다", async (_label, patch) => {
    const { result } = requestWithOutput({ ...output, ...patch });
    await expect(result).rejects.toMatchObject({ status: 502, response: { code: "OPENAI_SCHEMA_MISMATCH" } });
  });
});
