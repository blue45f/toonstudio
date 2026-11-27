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
});
