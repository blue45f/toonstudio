import { describe, expect, it } from "vitest";

import {
  parseStudioTranslationMemoryGlossaryText,
  serializeStudioGlossaryText,
  splitStudioGlossaryText,
  type StudioTranslationMemoryGlossaryRule,
} from "../studio-translation-glossary";

/** 규칙 모양(caseSensitive 등 파서 부가 필드)을 걷어내고 용어 쌍만 비교한다. */
function termPairs(rules: readonly StudioTranslationMemoryGlossaryRule[]) {
  return rules.map((rule) => ({ sourceTerm: rule.sourceTerm, targetTerm: rule.targetTerm }));
}

describe("splitStudioGlossaryText / serializeStudioGlossaryText", () => {
  it("규칙 줄과 메모 줄을 분리하고, 다시 합치면 같은 규칙 집합이 된다", () => {
    const text = [
      "# 주인공 이름은 고정",
      "민수: Minsu",
      "천문대 => observatory",
      "",
      "말투 메모(구분자 없음)",
    ].join("\n");
    const parts = splitStudioGlossaryText(text);
    expect(termPairs(parts.rules)).toEqual([
      { sourceTerm: "민수", targetTerm: "Minsu" },
      { sourceTerm: "천문대", targetTerm: "observatory" },
    ]);
    // 구분자 없는 줄은 파서가 규칙으로 읽지 않는다 — 메모 줄로 보존된다.
    expect(parts.memoLines).toEqual(["# 주인공 이름은 고정", "말투 메모(구분자 없음)"]);

    const roundTripped = serializeStudioGlossaryText(parts.rules, parts.memoLines);
    expect(termPairs(parseStudioTranslationMemoryGlossaryText(roundTripped))).toEqual(
      termPairs(parseStudioTranslationMemoryGlossaryText(text))
    );
  });

  it("중복 규칙은 한 번만 남고(전체 파서와 동일), 정본 미정 규칙은 행으로 남는다", () => {
    const parts = splitStudioGlossaryText("민수: Minsu\n민수: Minsu\n지연:");
    expect(termPairs(parts.rules)).toEqual([
      { sourceTerm: "민수", targetTerm: "Minsu" },
      { sourceTerm: "지연", targetTerm: "" },
    ]);
    expect(serializeStudioGlossaryText(parts.rules, parts.memoLines)).toBe(
      "민수: Minsu\n지연:"
    );
    // 미정 규칙은 파서 소비자에게 보이지 않는다(기존 동작 그대로).
    expect(termPairs(parseStudioTranslationMemoryGlossaryText("지연:"))).toEqual([]);
  });

  it("빈 텍스트는 빈 규칙·빈 메모이고, 빈 규칙 목록은 빈 텍스트로 합쳐진다", () => {
    expect(splitStudioGlossaryText("")).toEqual({ rules: [], memoLines: [] });
    expect(splitStudioGlossaryText(null)).toEqual({ rules: [], memoLines: [] });
    expect(serializeStudioGlossaryText([], [])).toBe("");
  });

  it("행 편집(추가·수정·삭제)을 텍스트로 되돌리면 파서가 같은 규칙을 읽는다", () => {
    const parts = splitStudioGlossaryText("민수: Minsu\n천문대: observatory");
    const edited = [
      { sourceTerm: "민수", targetTerm: "Min-su" }, // 정본 수정
      { sourceTerm: "지연", targetTerm: "Jiyeon" }, // 행 추가 (천문대는 삭제)
    ];
    const text = serializeStudioGlossaryText(edited, parts.memoLines);
    expect(termPairs(parseStudioTranslationMemoryGlossaryText(text))).toEqual(edited);
  });

  it("원문이 빈 규칙은 직렬화에서 건너뛴다", () => {
    expect(
      serializeStudioGlossaryText(
        [
          { sourceTerm: "  ", targetTerm: "Ghost" },
          { sourceTerm: "민수", targetTerm: "Minsu" },
        ],
        []
      )
    ).toBe("민수: Minsu");
  });
});
