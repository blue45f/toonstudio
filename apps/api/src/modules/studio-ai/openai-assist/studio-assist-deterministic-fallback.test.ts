import { describe, expect, it } from "vitest";
import { validateAssistModeStructuredOutput } from "../studio-openai-creative-assist.dto";
import { buildDeterministicAssistResult } from "./studio-assist-deterministic-fallback";

describe("로컬 창작 보조의 원문 보존", () => {
  it("긴 프로젝트 제목으로 캐릭터 이름을 지어내지 않고 명시된 이름만 반영한다", () => {
    const projectTitle = "가".repeat(120);
    for (const [inputText, expectedName] of [["무대 위에 혼자 선 배우", "미정"], ["이름: 가온\n무대 위에 혼자 선 배우", "가온"]]) {
      const result = buildDeterministicAssistResult("character-bible-forge", { inputText, projectTitle });
      if (result.mode !== "character-bible-forge") throw new Error("캐릭터 모드 필요");
      expect(result.data.characterName).toBe(expectedName);
      expect(validateAssistModeStructuredOutput(result.mode, result.data)).not.toBeNull();
    }
  });

  it("한국어 원고의 지정색을 첫 표기와 순서대로 보존하고 같은 색의 대소문자·축약 표기를 합친다", () => {
    const inputText = "첫 장면은 #F00으로, 다음은 #00FF00, 끝은 #0000ff80. 다시 #ff0000FF, #0f0.";
    const result = buildDeterministicAssistResult("color-mood-director", { inputText });
    if (result.mode !== "color-mood-director") throw new Error("배색 모드 필요");
    expect(result.data.palette.map((color) => color.nameKo)).toEqual(["#F00", "#00FF00", "#0000ff80"]);
    expect(result.data.palette.every((color) => color.role === "원고 지정색")).toBe(true);
    // CSS sRGB 원색의 OKLCH 좌표와 알파 128/255를 확인한다.
    expect(result.data.palette.map((color) => color.oklch)).toEqual([
      "oklch(0.627955 0.257683 29.233885)", "oklch(0.86644 0.294827 142.495339)",
      "oklch(0.452014 0.313214 264.052021 / 0.501961)",
    ]);
    expect(validateAssistModeStructuredOutput(result.mode, result.data)).not.toBeNull();
  });

  it("투명도만 다른 색을 구별하고 부족한 견본은 예시로 표시한다", () => {
    const result = buildDeterministicAssistResult("color-mood-director", { inputText: "견본은 #FFF와 #FFF8, #ffffff88." });
    if (result.mode !== "color-mood-director") throw new Error("배색 모드 필요");
    expect(result.data.palette).toMatchObject([
      { role: "원고 지정색", nameKo: "#FFF", oklch: "oklch(1 0 0)" },
      { role: "원고 지정색", nameKo: "#FFF8", oklch: "oklch(1 0 0 / 0.533333)" },
      { role: "예시 후보" },
    ]);
    expect(result.data.moodSummary).toContain("나머지는 비교용 예시");
  });

  it("HEX가 없는 원고와 잘못된 색 표기의 일부를 짐작하지 않고 예시만 제공한다", () => {
    const result = buildDeterministicAssistResult("color-mood-director", { inputText: "비 오는 정류장. 색은 미정. #ABCDE #F00G #123456789" });
    if (result.mode !== "color-mood-director") throw new Error("배색 모드 필요");
    expect(result.data.palette).toHaveLength(3);
    expect(result.data.palette.every((color) => color.role === "예시 후보")).toBe(true);
    expect(result.data.emotionLabel).toBe("예시 배색");
    expect(validateAssistModeStructuredOutput(result.mode, result.data)).not.toBeNull();
  });

  it("서로 다른 지정색이 아홉 개면 계약 한도인 앞 여덟 색과 표시 범위를 안내한다", () => {
    const colors = Array.from({ length: 9 }, (_, i) => "#00" + i);
    const result = buildDeterministicAssistResult("color-mood-director", { inputText: colors.join(" ") });
    if (result.mode !== "color-mood-director") throw new Error("배색 모드 필요");
    expect(result.data.palette.map((color) => color.nameKo)).toEqual(colors.slice(0, 8));
    expect(result.data.moodSummary).toContain("처음 여덟 색");
  });

  it("발화만 골라 내일 오전이라는 기한과 존댓말을 말풍선 끝까지 보존한다", () => {
    const spoken = "저는 이것을 한 번 더 확인하고 싶습니다. 내일 오전까지 보내도 괜찮을까요?";
    const result = buildDeterministicAssistResult("dialogue-polish", { inputText: `수아의 대사: ‘${spoken}’ 존댓말과 기한을 유지해 주세요.` });
    if (result.mode !== "dialogue-polish") throw new Error("대사 모드 필요");
    for (const balloon of result.data.balloons) {
      expect([balloon.line, balloon.subBubble].filter(Boolean).join(" ")).toMatch(/^저는 (이것을|이걸) 한 번 더 확인하고 싶습니다\. 내일 오전까지 보내도 괜찮을까요\?$/u);
    }
    expect(result.data.balloons.some((balloon) => balloon.subBubble !== "")).toBe(true);
    expect(result.data.balloons.some((balloon) => balloon.line.startsWith("저는 이걸 "))).toBe(true);
  });

  it.each([
    ["비가 그치면 저녁 7시에 도서관 앞에서 만나자.", "젖은 스케치북은 내가 가져갈 테니까 너는 색연필만 챙겨 와."],
    ["젖은 스케치북은 내가 가져갈 테니까", "너는 색연필만 챙겨 와."],
    ["젖은 스케치북을 챙겨 와.", ""],
  ])("핵심형 대사의 문장·절 경계를 살리고 짧은 대사는 그대로 둔다 (%s)", (first, second) => {
    const inputText = [first, second].filter(Boolean).join(" ");
    const result = buildDeterministicAssistResult("dialogue-polish", { inputText });
    if (result.mode !== "dialogue-polish") throw new Error("대사 모드 필요");
    expect(result.data.balloons[1]).toMatchObject({ line: first, subBubble: second });
  });

  it("낱말을 강조하는 따옴표는 대사 전체로 오인하지 않는다", () => {
    const inputText = "그날 네가 ‘내일’이라고 했잖아.";
    const result = buildDeterministicAssistResult("dialogue-polish", { inputText });
    if (result.mode !== "dialogue-polish") throw new Error("대사 모드 필요");
    expect(result.data.balloons[0].line).toBe(inputText);
  });

  it("장문의 단일 발화는 결과 계약과 이모지 경계를 지키고 생략을 알린다", () => {
    const result = buildDeterministicAssistResult("dialogue-polish", { inputText: "가" + "🎨".repeat(300) });
    if (result.mode !== "dialogue-polish") throw new Error("대사 모드 필요");
    expect(validateAssistModeStructuredOutput(result.mode, result.data)).not.toBeNull();
    expect(result.data.readabilityNote).toContain("한도");
    for (const { line, subBubble } of result.data.balloons) {
      expect(line + subBubble).toMatch(/^가🎨+…$/u);
      expect(line).not.toMatch(/[\uD800-\uDBFF]$/u);
      expect(subBubble).not.toMatch(/^[\uDC00-\uDFFF]/u);
    }
  });

  it("컷 번호, 무언 연기, 말풍선과 소품에 적힌 글을 구분한다", () => {
    const inputText = "1컷: 하린은 우산을 건넨다.\n2컷\n도윤: “넌?”\n3컷: 하린이 ‘정류장’이라고 적힌 간판을 가리킨다.\n4컷: 도윤만 빗속으로 나간다.";
    const result = buildDeterministicAssistResult("script-to-cuts", { inputText });
    if (result.mode !== "script-to-cuts") throw new Error("컷 분할 모드 필요");
    expect(result.data.cuts.map((cut) => cut.cutNumber)).toEqual([1, 2, 3, 4]);
    expect(result.data.cuts.map((cut) => cut.dialogue)).toEqual(["", "넌?", "", ""]);
    expect(result.data.cuts[2].visualAction).toContain("‘정류장’");
    expect(result.data.cuts[3].visualAction).toContain("도윤만 빗속으로");
  });

  it("줄바꿈이나 마침표가 없는 긴 지문도 마지막 행동까지 여러 컷에 담는다", () => {
    const inputText = "연필로 별을 그리는 손 ".repeat(140) + "마침내 연필을 내려놓는다";
    const result = buildDeterministicAssistResult("script-to-cuts", { inputText });
    if (result.mode !== "script-to-cuts") throw new Error("컷 분할 모드 필요");
    expect(result.data.cuts.length).toBeGreaterThan(1);
    expect(result.data.cuts.map((cut) => cut.visualAction).join(" ")).toBe(inputText);
    expect(result.data.cuts.every((cut) => cut.dialogue === "")).toBe(true);
    expect(validateAssistModeStructuredOutput(result.mode, result.data)).not.toBeNull();
  });

  it("요청한 컷 수에 맞춰 연속한 행동을 묶고 원고의 결말을 보존한다", () => {
    const inputText = "정확히 2컷으로 나눠 주세요. 우산이 접힌다. 비가 그친다. 하린은 ‘갈까?’라고 묻는다. 두 사람은 같이 나간다. 새 대사와 인물은 추가하지 마세요.";
    const result = buildDeterministicAssistResult("script-to-cuts", { inputText });
    if (result.mode !== "script-to-cuts") throw new Error("컷 분할 모드 필요");
    expect(result.data.cuts.map((cut) => cut.dialogue)).toEqual(["", "갈까?"]);
    expect(result.data.cuts[1].visualAction).toMatch(/같이 나간다\.$/u);
    expect(result.data.cuts[0].visualAction).not.toMatch(/주세요/u);
  });

  it("권리와 대상 레이어가 확인되지 않은 로컬 매크로는 출고와 효과 적용을 보류한다", () => {
    const result = buildDeterministicAssistResult("mcp-workflow-macro", { inputText: "인물 림라이트를 적용하고 내보내기" });
    if (result.mode !== "mcp-workflow-macro") throw new Error("매크로 모드 필요");
    const preflight = result.data.steps.find((step) => step.toolName === "studio.export.preflight_check");
    expect(JSON.parse(preflight?.argumentsJson ?? "null")).toEqual({
      platform: "naver-webtoon",
      requireCleanRightsBom: true,
      rightsBomClean: false,
    });
    expect(result.data.steps.some((step) => step.toolName === "studio.photoshop.apply_layer_fx")).toBe(false);
    expect(result.data.summary).toContain("대상 레이어 ID");
    expect(validateAssistModeStructuredOutput(result.mode, result.data)).not.toBeNull();
  });
});
