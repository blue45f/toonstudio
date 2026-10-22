import { describe, expect, it } from "vitest";

import {
  ALT_TEXT_LIMITS,
  ALT_TEXT_MAX_OUTPUT_TOKENS,
  altTextLength,
  altTextPanelsToPlain,
  altTextToHtmlAttribute,
  buildAltTextRequest,
  estimateAltTextCostCapUsd,
  normalizeAltText,
  type AltTextRaw,
} from "./claude-alt-text";

const IMAGE = { mediaType: "image/png", data: "QUJD", width: 800, height: 1_000 } as const;

function raw(overrides: Partial<AltTextRaw> = {}): AltTextRaw {
  return {
    short: "비 오는 골목에서 두 사람이 우산 하나를 함께 쓴다.",
    long: "어두운 골목에 비가 내린다. 파란 머리 인물이 우산을 펴 들고 옆 사람에게 다가간다.",
    panels: [
      { step: 2, description: "우산을 내미는 손", text: ["같이 쓸래?"] },
      { step: 1, description: "비 오는 골목 전경", text: [] },
    ],
    warnings: [],
    ...overrides,
  };
}

describe("buildAltTextRequest", () => {
  it("이미지와 설정을 사용자 메시지에 담고 시스템 블록은 캐시 대상으로 고정한다", () => {
    const params = buildAltTextRequest("claude-opus-5-5", IMAGE, { scope: "detailed", language: "ko", genre: " 로맨스 ", notes: "파란 머리가 하늘" });

    expect(params.model).toBe("claude-opus-5-5");
    expect(params.max_tokens).toBe(ALT_TEXT_MAX_OUTPUT_TOKENS.detailed);
    expect(params.output_config).toEqual({ effort: "medium" });
    const system = params.system;
    expect(Array.isArray(system) && system[0]).toMatchObject({ type: "text", cache_control: { type: "ephemeral" } });
    const content = params.messages[0]?.content;
    expect(Array.isArray(content)).toBe(true);
    const [image, text] = content as Array<{ type: string; source?: unknown; text?: string }>;
    expect(image).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/png", data: "QUJD" } });
    expect(text?.text).toContain("이미지 크기: 800×1000px");
    expect(text?.text).toContain("출력 언어: Korean");
    expect(text?.text).toContain("설명 범위: detailed");
    expect(text?.text).toContain("장르: 로맨스");
    expect(text?.text).toContain("인물·상황 메모: 파란 머리가 하늘");
  });

  it("출력 언어와 범위가 바뀌어도 시스템 프롬프트는 같아 캐시가 유지된다", () => {
    const a = buildAltTextRequest("claude-opus-5-5", IMAGE, { scope: "brief", language: "en" });
    const b = buildAltTextRequest("claude-opus-5-5", IMAGE, { scope: "detailed", language: "ja" });
    expect(JSON.stringify(a.system)).toBe(JSON.stringify(b.system));
    expect(a.max_tokens).toBe(ALT_TEXT_MAX_OUTPUT_TOKENS.brief);
    expect(b.max_tokens).toBe(ALT_TEXT_MAX_OUTPUT_TOKENS.detailed);
  });

  it("범위가 넓을수록 출력 상한이 커진다", () => {
    expect(ALT_TEXT_MAX_OUTPUT_TOKENS.brief).toBeLessThan(ALT_TEXT_MAX_OUTPUT_TOKENS.standard);
    expect(ALT_TEXT_MAX_OUTPUT_TOKENS.standard).toBeLessThan(ALT_TEXT_MAX_OUTPUT_TOKENS.detailed);
  });

  it("effort를 모르는 모델에는 싣지 않고, 깊이는 지원 모델에만 반영한다", () => {
    expect(buildAltTextRequest("claude-3-5-haiku-20241022", IMAGE, { scope: "brief", language: "ko", depth: "high" }).output_config).toBeUndefined();
    expect(buildAltTextRequest("claude-haiku-5-5", IMAGE, { scope: "brief", language: "ko", depth: "low" }).output_config).toEqual({ effort: "low" });
  });

  it("장르·메모의 줄바꿈과 지나친 길이는 한 줄로 정리해 보낸다", () => {
    const params = buildAltTextRequest("claude-opus-5-5", IMAGE, { scope: "brief", language: "ko", notes: `첫 줄\n둘째 줄 ${"가".repeat(400)}` });
    const text = ((params.messages[0]?.content as Array<{ text?: string }>)[1]?.text) ?? "";
    const notesLine = text.split("\n").find((line) => line.startsWith("인물·상황 메모:")) ?? "";
    expect(notesLine).toContain("첫 줄 둘째 줄");
    expect([...notesLine.replace("인물·상황 메모: ", "")].length).toBe(ALT_TEXT_LIMITS.maxNotesChars);
  });
});

describe("estimateAltTextCostCapUsd", () => {
  it("범위가 넓을수록, 모델이 비쌀수록 상한이 커진다", () => {
    const brief = estimateAltTextCostCapUsd("claude-opus-5-5", IMAGE, "brief");
    const detailed = estimateAltTextCostCapUsd("claude-opus-5-5", IMAGE, "detailed");
    const haiku = estimateAltTextCostCapUsd("claude-haiku-5-5", IMAGE, "detailed");
    expect(brief).not.toBeNull();
    expect(detailed ?? 0).toBeGreaterThan(brief ?? 0);
    expect(haiku ?? 0).toBeLessThan(detailed ?? 0);
  });

  it("출력 상한과 이미지 토큰을 합친 값이다(Opus 5.5 $4/$20)", () => {
    const inputTokens = Math.ceil((800 * 1_000) / 750) + 900;
    expect(estimateAltTextCostCapUsd("claude-opus-5-5", IMAGE, "standard")).toBeCloseTo((inputTokens * 4 + ALT_TEXT_MAX_OUTPUT_TOKENS.standard * 20) / 1_000_000, 8);
  });

  it("단가를 모르는 모델이나 크기를 모르는 이미지는 null", () => {
    expect(estimateAltTextCostCapUsd("claude-future-9", IMAGE, "brief")).toBeNull();
    expect(estimateAltTextCostCapUsd("claude-opus-5-5", { width: 0, height: 100 }, "brief")).toBeNull();
  });
});

describe("normalizeAltText", () => {
  it("컷을 순서대로 정렬해 1부터 다시 번호를 매긴다", () => {
    const view = normalizeAltText(raw(), "detailed");

    expect(view.panels).toEqual([
      { step: 1, description: "비 오는 골목 전경", text: [] },
      { step: 2, description: "우산을 내미는 손", text: ["같이 쓸래?"] },
    ]);
  });

  it("요청한 범위를 넘는 항목은 버린다", () => {
    const brief = normalizeAltText(raw(), "brief");
    expect(brief.long).toBe("");
    expect(brief.panels).toEqual([]);
    expect(brief.short).not.toBe("");

    const standard = normalizeAltText(raw(), "standard");
    expect(standard.long).not.toBe("");
    expect(standard.panels).toEqual([]);

    expect(normalizeAltText(raw(), "detailed").panels).toHaveLength(2);
  });

  it("제어 문자를 지우고 한 줄 항목은 한 줄로, 상세 설명은 문단을 유지한다", () => {
    const view = normalizeAltText(raw({
      short: "첫 줄\n둘째\u0007줄",
      long: "첫 문단\u0000\n\n\n\n둘째 문단",
      panels: [{ step: 1, description: "장면\n설명", text: ["대사\u0001 하나", "   "] }],
    }), "detailed");

    expect(view.short).toBe("첫 줄 둘째 줄");
    expect(view.long).toBe("첫 문단\n\n둘째 문단");
    expect(view.panels[0]).toEqual({ step: 1, description: "장면 설명", text: ["대사 하나"] });
  });

  it("빈 컷과 숫자가 아닌 순서는 버리고, 개수·길이 상한을 지킨다", () => {
    const panels = Array.from({ length: 20 }, (_, index) => ({
      step: index + 1,
      description: index === 3 ? "   " : `컷 ${index + 1}`,
      text: Array.from({ length: 12 }, (_, line) => `줄 ${line}`),
    }));
    panels.push({ step: Number.NaN, description: "순서 없음", text: [] });

    const view = normalizeAltText(raw({ panels, short: "가".repeat(900), long: "나".repeat(3_000), warnings: ["a", "b", "c", "d", ""] }), "detailed");

    expect(view.panels).toHaveLength(ALT_TEXT_LIMITS.maxPanels);
    expect(view.panels.some((panel) => panel.description === "순서 없음")).toBe(false);
    expect(view.panels.map((panel) => panel.step)).toEqual(Array.from({ length: ALT_TEXT_LIMITS.maxPanels }, (_, index) => index + 1));
    expect(view.panels[0]?.text).toHaveLength(ALT_TEXT_LIMITS.maxTextLines);
    expect(altTextLength(view.short)).toBe(ALT_TEXT_LIMITS.maxShortChars);
    expect(altTextLength(view.long)).toBe(ALT_TEXT_LIMITS.maxLongChars);
    expect(view.warnings).toEqual(["a", "b", "c"]);
  });

  it("125자가 넘는 짧은 대체 텍스트도 자르지 않고 그대로 돌려준다(화면이 글자 수로 알린다)", () => {
    const longShort = "가".repeat(130);
    const view = normalizeAltText(raw({ short: longShort }), "brief");

    expect(view.short).toBe(longShort);
    expect(altTextLength(view.short)).toBeGreaterThan(ALT_TEXT_LIMITS.shortRecommended);
  });

  it("글자 수는 코드 포인트 기준이라 이모지가 둘로 세어지지 않는다", () => {
    expect(altTextLength("a😀b")).toBe(3);
    expect(normalizeAltText(raw({ short: "😀".repeat(500) }), "brief").short).toBe("😀".repeat(ALT_TEXT_LIMITS.maxShortChars));
  });
});

describe("내보내기", () => {
  it("alt 속성은 따옴표·꺾쇠·앰퍼샌드를 이스케이프하고 줄바꿈은 공백으로 바꾼다", () => {
    expect(altTextToHtmlAttribute('그는 "안녕" & <b>인사</b>했다\n그리고 \'웃었다\'')).toBe(
      'alt="그는 &quot;안녕&quot; &amp; &lt;b&gt;인사&lt;/b&gt;했다 그리고 &#39;웃었다&#39;"',
    );
  });

  it("컷별 설명은 번호 목록과 들여 쓴 따옴표 글자로 만든다", () => {
    expect(altTextPanelsToPlain([
      { step: 1, description: "비 오는 골목", text: [] },
      { step: 2, description: "우산을 내미는 손", text: ["같이 쓸래?", "…응"] },
    ])).toBe('1. 비 오는 골목\n2. 우산을 내미는 손\n   "같이 쓸래?"\n   "…응"');
  });
});
