import { describe, expect, it, vi } from "vitest";

import { validateAssistModeStructuredOutput } from "../studio-openai-creative-assist.dto";
import { StudioOpenAiCreativeAssistService } from "../studio-openai-creative-assist.service";
import { buildDeterministicAssistResult } from "./studio-assist-deterministic-fallback";

const returnSlot = [
  "야간 도서관. 반납구 덮개가 닫히며 그 앞에 걸린 책갈피 끝을 누른다.",
  "덮개: #334455", "책갈피 끝: #FFCC44",
  "왼쪽 벽등 아래 덮개와 책갈피가 닿는 선이 보여야 한다. 노랑은 책갈피에서 끊는다.",
].join("\n");
const intercom = [
  "무대 감독이 호출을 받는다. 패널의 점등 창 옆에 인쇄한 빈 원은 계속 꺼진 표시다.",
  "점등 창: #D55032", "빈 원 테두리: #809098", "패널: #192229",
  "빈 원을 점등으로 오해하지 않게 하고, 빛 번짐은 점등 창 안에만 남긴다.",
].join("\n");
const bookCover = "감청색 표지 띠의 눌린 홈에만 옆빛 결을 살린다. 홈에 걸친 흰 제본실과 오른쪽 금박 발행 연도는 밝기와 획을 그대로 두고 원본 표지 레이어를 보존한다.";
const thermometer = "온도계 옆면 물방울에만 약한 광택을 더한다. 눈금과 붉은 액주에는 반사가 생기면 안 된다. 양 끝 눈금을 화면에 남기고 노출은 원래 값으로 유지한다.";

describe("로컬 배색의 원고 색 표기 보존", () => {
  it.each([
    { scene: "반납함", inputText: returnSlot, pairs: [["#334455", "덮개"], ["#FFCC44", "책갈피 끝"]] },
    { scene: "인터폰", inputText: intercom, pairs: [["#D55032", "점등 창"], ["#809098", "빈 원 테두리"], ["#192229", "패널"]] },
  ])("$scene 장면의 각 견본이 지정된 부분을 가리킨다", ({ inputText, pairs }) => {
    const { mode, data } = buildDeterministicAssistResult("color-mood-director", { inputText });
    if (mode !== "color-mood-director") throw new Error("배색 응답이 필요합니다.");
    expect(validateAssistModeStructuredOutput(mode, data)).not.toBeNull();
    for (const [hex, label] of pairs) {
      const swatch = data.palette.find(({ nameKo }) => nameKo === hex);
      expect(swatch?.usageTip).toContain(label);
      for (const [, other] of pairs.filter(([otherHex]) => otherHex !== hex)) {
        expect(swatch?.usageTip).not.toContain(other);
      }
    }
  });

  it("같은 실색을 가리키는 여러 표기는 묶고 문장에서 모호한 적용처를 추정하지 않는다", () => {
    const inputText = "천장: #ABC, 출입구 = #aabbccff | 출입구: #AbC\n유리: #ABC8\n수정 전: #aaa 사용 금지\n후보는 #ABC 앞뒤를 비교한다.";
    const { mode, data } = buildDeterministicAssistResult("color-mood-director", { inputText });
    if (mode !== "color-mood-director") throw new Error("배색 응답이 필요합니다.");
    expect(data.palette.filter(({ role }) => role === "원고 지정색").map(({ nameKo }) => nameKo)).toEqual(["#ABC", "#ABC8"]);
    expect(data.palette[0].usageTip).toContain("천장 · 출입구");
    expect(data.palette[0].usageTip.match(/출입구/gu)).toHaveLength(1);
    expect(data.palette[1].usageTip).toContain("유리");
    expect(data.moodSummary).toContain("수정 전: #aaa 사용 금지");
  });

  it.each([
    { source: "금지색: #F00", accepted: [], forbidden: ["#F00"] },
    { source: "옷: #123, 사용 금지: #456", accepted: ["#123"], forbidden: ["#456"] },
    { source: "배경은 #abc 그대로, #def는 쓰지 마세요. 나무: #345", accepted: ["#abc", "#345"], forbidden: ["#def"] },
    { source: "금지색은 #F00, #abc, 옷: #246, 테두리: #059", accepted: ["#246", "#059"], forbidden: ["#F00", "#abc"] },
    { source: "제외색: #123 및 #456 / #789 | 채택: #704", accepted: ["#704"], forbidden: ["#123", "#456", "#789"] },
    { source: "경고 표지: #F00 | 금지 표지판: #0F0 | #00F 제외하지 마세요", accepted: ["#F00", "#0F0", "#00F"], forbidden: [] },
    { source: "바탕 #123 #456 사용 금지. 글자 #789", accepted: ["#123", "#789"], forbidden: ["#456"] },
  ])("색에 직접 붙은 금지 지시만 판별한다 — $source", ({ source, accepted, forbidden }) => {
    const { mode, data } = buildDeterministicAssistResult("color-mood-director", { inputText: source });
    if (mode !== "color-mood-director") throw new Error("배색 응답이 필요합니다.");
    expect(validateAssistModeStructuredOutput(mode, data)).not.toBeNull();
    expect(data.palette.filter(({ role }) => role === "원고 지정색").map(({ nameKo }) => nameKo)).toEqual(accepted);
    for (const hex of forbidden) expect(data.moodSummary).toContain(hex);
  });

  it("서로 다른 영역의 사용·금지 지시는 같은 실색을 보류하고 두 지시를 표시하며 다른 알파는 유지한다", () => {
    const inputText = "반사판: #F00\n소매에는 #f00을 사용하고, 조끼 사용 금지: #ff0000FF\n유리: #F008";
    const { mode, data } = buildDeterministicAssistResult("color-mood-director", { inputText });
    if (mode !== "color-mood-director") throw new Error("배색 응답이 필요합니다.");
    expect(data.palette.filter(({ role }) => role === "원고 지정색").map(({ nameKo }) => nameKo)).toEqual(["#F008"]);
    expect(data.moodSummary).toContain("사용 표기 「반사판 · 소매에는」");
    expect(data.moodSummary).toContain("조끼 사용 금지: #ff0000FF");
  });

  it("금지색이 많아도 검토할 나머지 색 수와 계약에 맞는 비교 견본을 반환한다", () => {
    const forbidden = Array.from({ length: 60 }, (_, i) => `#${i.toString(16).padStart(6, "0")}`);
    const { mode, data } = buildDeterministicAssistResult("color-mood-director", { inputText: `금지색: ${forbidden.join(", ")}` });
    if (mode !== "color-mood-director") throw new Error("배색 응답이 필요합니다.");
    expect(validateAssistModeStructuredOutput(mode, data)).not.toBeNull();
    expect(data.palette.every(({ role }) => role === "예시 후보")).toBe(true);
    expect(data.moodSummary).toMatch(/외 \d+색의 원문 지시/u);
  });
});

describe("로컬 Photoshop의 보정 범위", () => {
  it.each([
    { inputText: bookCover, local: "눌린 홈", protectedAreas: ["흰 제본실", "금박 발행 연도", "원본 표지 레이어"] },
    { inputText: thermometer, local: "옆면 물방울", protectedAreas: ["눈금", "붉은 액주", "양 끝 눈금"] },
  ])("스타일의 적용 부위와 원본 대조 조건을 보존한다", ({ inputText, local, protectedAreas }) => {
    const { mode, data } = buildDeterministicAssistResult("photoshop-fx-recipe", { inputText });
    if (mode !== "photoshop-fx-recipe") throw new Error("보정 응답이 필요합니다.");
    expect(validateAssistModeStructuredOutput(mode, data)).not.toBeNull();
    expect(data.layerStyles.every((style) => style.paramsSummary.includes(local))).toBe(true);
    expect(Object.values(data.cameraRaw).every((value) => value === 0)).toBe(true);
    for (const area of protectedAreas) expect(data.nonDestructiveTip).toContain(area);
    expect(data.nonDestructiveTip).toContain("보호 영역은 검게");
  });

  it("아주 긴 보호 조건을 잘라 인용하지 않고 원문 대조를 안내한다", () => {
    const inputText = `작업 부위에는 파란빛을 더한다. 보호 영역: ${"아주 얇은 경계와 ".repeat(50)}붉은 선은 그대로 둔다.`;
    const { mode, data } = buildDeterministicAssistResult("photoshop-fx-recipe", { inputText });
    if (mode !== "photoshop-fx-recipe") throw new Error("보정 응답이 필요합니다.");
    expect(validateAssistModeStructuredOutput(mode, data)).not.toBeNull();
    expect(data.nonDestructiveTip).not.toContain("아주 얇은");
    expect(data.nonDestructiveTip).toContain("조건 전체");
  });

  it("작가의 보정 지시 뒤에 붙인 원고 속 금지 대사를 마스크 조건으로 쓰지 않는다", () => {
    const inputText = "보정 대상: 나뭇결\n[원고]\n아빠가 말한다. 여기에만 두고 가면 안 된다.";
    const { mode, data } = buildDeterministicAssistResult("photoshop-fx-recipe", { inputText });
    if (mode !== "photoshop-fx-recipe") throw new Error("보정 응답이 필요합니다.");
    expect(data.layerStyles[0].paramsSummary).toContain("나뭇결");
    expect(JSON.stringify(data)).not.toContain("두고 가면");
  });
});

const localColorSchema = {
  palette: { items: { properties: { usageTip: { description: expect.stringMatching(/부위.*면적/u) } } } },
  lightingGuide: { description: expect.stringMatching(/광원.*경계/u) },
  contrastWarning: { description: expect.stringMatching(/두 대상.*명도·면적/u) },
};
const localFxSchema = {
  summary: { description: expect.stringMatching(/Camera Raw.*범위/u) },
  layerStyles: { items: { properties: { paramsSummary: { description: expect.stringMatching(/수치.*마스크.*보호/u) } } } },
  nonDestructiveTip: { description: expect.stringMatching(/원본.*제외 영역.*프레임/u) },
};

describe("별도 원고의 실제 생성 요청 계약", () => {
  it.each([
    { mode: "color-mood-director", scene: "반납함", inputText: returnSlot, properties: localColorSchema },
    { mode: "color-mood-director", scene: "인터폰", inputText: intercom, properties: localColorSchema },
    { mode: "photoshop-fx-recipe", scene: "제본실", inputText: bookCover, properties: localFxSchema },
    { mode: "photoshop-fx-recipe", scene: "기상대", inputText: thermometer, properties: localFxSchema },
  ] as const)("$scene 원문과 영역별 필드 가이드를 함께 전송한다", async ({ mode, inputText, properties }) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }));
    const service = new StudioOpenAiCreativeAssistService();
    await expect(service.assist("art-direction-test", { mode, inputText }, {
      env: { OPENAI_API_KEY: "offline-placeholder" }, fetchImpl,
    })).rejects.toMatchObject({ status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = fetchImpl.mock.calls[0][1]?.body;
    if (typeof body !== "string") throw new Error("JSON 요청 본문이 필요합니다.");
    expect(JSON.parse(body)).toMatchObject({
      messages: [
        { role: "system", content: expect.stringContaining(mode === "color-mood-director" ? "접촉" : "마스크") },
        { role: "user", content: expect.stringContaining(inputText) },
      ],
      response_format: { json_schema: { strict: true, schema: { properties } } },
    });
  });
});
