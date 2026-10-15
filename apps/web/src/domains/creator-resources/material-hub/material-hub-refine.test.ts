import { describe, expect, it } from "vitest";

import { materialRefinePrompt, parseRefinedMaterialSentence } from "./material-hub-refine";

/** 전각 공백(U+3000). 소스에 보이지 않는 문자를 두지 않으려고 코드로 만든다. */
const IDEOGRAPHIC_SPACE = String.fromCharCode(0x3000);

describe("materialRefinePrompt", () => {
  it("문장을 정규화해 그대로 사용자 메시지로 보내고, 시스템 지시에는 지어내지 말라는 규칙이 있다", () => {
    const prompt = materialRefinePrompt("  비   와서 으스스한   동네 뒷길 ");
    expect(prompt.user).toBe("비 와서 으스스한 동네 뒷길");
    expect(prompt.system).toContain("지어내지 않습니다");
    expect(prompt.system).toContain("80자 이내");
  });

  it("80자를 넘는 문장은 80자까지만 보낸다", () => {
    expect(materialRefinePrompt("가".repeat(300)).user.length).toBeLessThanOrEqual(80);
  });
});

describe("parseRefinedMaterialSentence", () => {
  const original = "비 와서 으스스한 동네 뒷길";

  it("깨끗한 한 줄 응답은 그대로 쓴다", () => {
    expect(parseRefinedMaterialSentence("비 오는 골목 밤 풍경", original)).toBe("비 오는 골목 밤 풍경");
  });

  it("따옴표·번호·머리표·라벨을 벗기고 첫 줄만 쓴다", () => {
    expect(parseRefinedMaterialSentence("“비 오는 골목 밤 풍경”", original)).toBe("비 오는 골목 밤 풍경");
    expect(parseRefinedMaterialSentence("1. 비 오는 골목 밤 풍경\n설명: 소재 위주로 정리했어요.", original)).toBe("비 오는 골목 밤 풍경");
    expect(parseRefinedMaterialSentence("- 문장: 비 오는 골목 밤 풍경", original)).toBe("비 오는 골목 밤 풍경");
    expect(parseRefinedMaterialSentence("\n\n  비 오는 골목 밤 풍경  \r\n", original)).toBe("비 오는 골목 밤 풍경");
  });

  it("전각 문자는 NFKC 로 정규화한다", () => {
    expect(parseRefinedMaterialSentence(`비${IDEOGRAPHIC_SPACE}오는${IDEOGRAPHIC_SPACE}골목`, original)).toBe("비 오는 골목");
  });

  it("쓸 수 없는 응답은 null 이다: 빈 응답, 너무 긴 응답, 원문과 같은 응답, 읽을 단서가 없는 응답", () => {
    expect(parseRefinedMaterialSentence("", original)).toBeNull();
    expect(parseRefinedMaterialSentence(" \n \n", original)).toBeNull();
    expect(parseRefinedMaterialSentence("비 오는 골목 ".repeat(20), original)).toBeNull();
    expect(parseRefinedMaterialSentence(original, original)).toBeNull();
    expect(parseRefinedMaterialSentence(`  “${original}”  `, original)).toBeNull();
    expect(parseRefinedMaterialSentence("!!!", original)).toBeNull();
  });
});
