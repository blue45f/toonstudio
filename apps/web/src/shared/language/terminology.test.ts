import { describe, expect, it } from "vitest";

import { findForbiddenAliases, TERMINOLOGY, terminologyEntry } from "./terminology";

describe("용어 레지스트리", () => {
  it("항목 id가 중복되지 않고 정본 표기가 금지 별칭에 들어 있지 않다", () => {
    const ids = TERMINOLOGY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of TERMINOLOGY) {
      expect(entry.forbiddenAliases).not.toContain(entry.canonical);
      expect(entry.forbiddenAliases.length).toBeGreaterThan(0);
    }
  });

  it("감사 P1-3에서 갈렸던 개념들이 정본으로 고정돼 있다", () => {
    expect(terminologyEntry("production-material")?.canonical).toBe("소재");
    expect(terminologyEntry("market-name")?.canonical).toBe("마켓");
    expect(terminologyEntry("save-for-later-action")?.canonical).toBe("찜하기");
    expect(terminologyEntry("library-place")?.canonical).toBe("서재");
    expect(terminologyEntry("early-access")?.canonical).toBe("얼리 액세스");
  });

  it("금지 별칭을 찾아내고 긴 별칭을 한 건으로만 보고한다", () => {
    const violations = findForbiddenAliases("에셋 마켓에서 에셋을 골라 보관함에 넣었어요.");
    const aliases = violations.map((violation) => violation.alias);
    expect(aliases).toContain("에셋 마켓");
    expect(aliases).toContain("보관함");
    // "에셋 마켓" 안의 "에셋"은 겹침으로 제외되고, 뒤의 단독 "에셋"만 별도 건으로 잡힌다.
    expect(aliases.filter((alias) => alias === "에셋")).toHaveLength(1);
    expect(violations.find((violation) => violation.alias === "보관함")?.canonical).toBe("서재");
  });

  it("정본만 쓴 문구에서는 위반이 없다", () => {
    expect(findForbiddenAliases("마켓에서 소재를 골라 찜하기를 눌렀어요.")).toEqual([]);
  });
});
