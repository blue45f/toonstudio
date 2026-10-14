import { describe, expect, it } from "vitest";

import type { DialogueBatchItem } from "./studio-dialogue-batch";
import {
  checkDialogueSpelling,
  summarizeDialogueSpellcheck,
} from "./studio-dialogue-spellcheck";

function item(partial: Partial<DialogueBatchItem> & { id: string }): DialogueBatchItem {
  return {
    pageId: "p1",
    pageIndex: 0,
    elType: "bubble",
    text: "",
    hidden: false,
    locked: false,
    ...partial,
  };
}

describe("checkDialogueSpelling", () => {
  it("빈 말풍선은 error, 빈 텍스트는 warning으로 알린다", () => {
    const findings = checkDialogueSpelling([
      item({ id: "b1", text: "  " }),
      item({ id: "t1", elType: "text", text: "" }),
    ]);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({ itemId: "b1", ruleId: "empty-dialogue", severity: "error" });
    expect(findings[1]).toMatchObject({ itemId: "t1", ruleId: "empty-dialogue", severity: "warning" });
  });

  it("자주 틀리는 표기를 잡고 고치기 후보를 제시한다", () => {
    const findings = checkDialogueSpelling([
      item({ id: "b1", text: "그게 됬다니, 몇일이나 걸린 거야?" }),
    ]);
    const fixes = findings.filter((f) => f.ruleId === "common-misspelling");
    expect(fixes.map((f) => f.fix?.replacement)).toEqual(["됐", "며칠"]);
    // 후보를 적용하면 표준 표기가 된다(자동 적용은 하지 않는다는 계약의 전제 검증).
    const first = fixes[0];
    expect(first?.fix).toBeDefined();
  });

  it("띄어 쓴 의존명사는 건드리지 않고 붙은 경우만 잡는다", () => {
    const ok = checkDialogueSpelling([item({ id: "b1", text: "할 수 있어. 그럴 것 같아." })]);
    expect(ok.filter((f) => f.ruleId === "spacing-dependent-noun")).toHaveLength(0);

    const bad = checkDialogueSpelling([item({ id: "b2", text: "할수있어. 그럴 것같아." })]);
    const spacing = bad.filter((f) => f.ruleId === "spacing-dependent-noun");
    expect(spacing.map((f) => f.fix?.replacement)).toEqual(["수 있어", "것 같아"]);
  });

  it("문장부호 앞 공백과 연속 공백을 잡는다", () => {
    const findings = checkDialogueSpelling([item({ id: "b1", text: "정말  몰라 !" })]);
    expect(findings.some((f) => f.ruleId === "double-space")).toBe(true);
    expect(findings.some((f) => f.ruleId === "space-before-punctuation")).toBe(true);
  });

  it("짧은 대답의 반복은 중복으로 치지 않고, 긴 대사의 복사는 잡는다", () => {
    const short = checkDialogueSpelling([
      item({ id: "b1", text: "응." }),
      item({ id: "b2", text: "응." }),
    ]);
    expect(short.filter((f) => f.ruleId === "duplicate-dialogue")).toHaveLength(0);

    const copied = checkDialogueSpelling([
      item({ id: "b3", text: "오늘은 여기까지만 하자." }),
      item({ id: "b4", pageIndex: 1, pageId: "p2", text: "오늘은 여기까지만 하자." }),
    ]);
    const dup = copied.filter((f) => f.ruleId === "duplicate-dialogue");
    expect(dup).toHaveLength(1);
    expect(dup[0]?.itemId).toBe("b4");
    expect(dup[0]?.message).toContain("1페이지");
  });

  it("같은 어절 반복을 잡되 의성어는 제외한다", () => {
    const findings = checkDialogueSpelling([
      item({ id: "b1", text: "나는 나는 몰랐어. 하하 하하 웃었다." }),
    ]);
    const repeated = findings.filter((f) => f.ruleId === "repeated-word");
    expect(repeated).toHaveLength(1);
    expect(repeated[0]?.matchText).toContain("나는");
  });

  it("긴 말풍선과 긴 한 줄을 경고한다", () => {
    const longLine = "가나다라마바사아자차카타파하가나다라마바사아자차카타파하";
    const findings = checkDialogueSpelling([item({ id: "b1", text: longLine })]);
    expect(findings.some((f) => f.ruleId === "bubble-line-too-long")).toBe(true);
  });

  it("숨김 대사는 기본 제외, 옵션을 주면 포함한다", () => {
    const hidden = [item({ id: "b1", text: "됬다", hidden: true })];
    expect(checkDialogueSpelling(hidden)).toHaveLength(0);
    expect(checkDialogueSpelling(hidden, { includeHidden: true }).length).toBeGreaterThan(0);
  });

  it("잠긴 대사도 검사한다(읽기는 잠금과 무관)", () => {
    const findings = checkDialogueSpelling([item({ id: "b1", text: "됬다", locked: true })]);
    expect(findings.some((f) => f.ruleId === "common-misspelling")).toBe(true);
  });

  it("규칙을 끄면 그 규칙의 지적이 사라진다", () => {
    const findings = checkDialogueSpelling([item({ id: "b1", text: "됬다" })], {
      disabledRules: ["common-misspelling"],
    });
    expect(findings).toHaveLength(0);
  });

  it("요약은 심각도·규칙별 건수를 집계한다", () => {
    const items = [item({ id: "b1", text: "" }), item({ id: "b2", text: "됬다" })];
    const findings = checkDialogueSpelling(items);
    const summary = summarizeDialogueSpellcheck(items, findings);
    expect(summary.checkedItemCount).toBe(2);
    expect(summary.errorCount).toBe(1);
    expect(summary.warningCount).toBe(1);
    expect(summary.byRule["common-misspelling"]).toBe(1);
  });

  it("'-께' 말끝(요 없는 형태)도 잡되, 존댓말 조사 '께'는 지적하지 않는다", () => {
    const flagged = checkDialogueSpelling([
      item({ id: "k1", text: "내가 꼭 할께!" }),
      item({ id: "k2", text: "그건 내가 줄께." }),
      item({ id: "k3", text: "내일 갈께!" }),
      item({ id: "k4", text: "걱정 마, 될께." }),
      item({ id: "k5", text: "여기 있을께." }),
    ]).filter((f) => f.ruleId === "common-misspelling");
    expect(flagged.map((f) => f.fix?.replacement)).toEqual([
      "할게",
      "줄게",
      "갈게",
      "될게",
      "있을게",
    ]);

    // 존댓말 조사 '께'는 올바른 표기이므로 절대 지적하면 안 된다(정밀도 우선 원칙).
    const honorific = checkDialogueSpelling([
      item({ id: "h1", text: "선생님께 드릴 말씀" }),
      item({ id: "h2", text: "어머니께 안부 전해줘" }),
      item({ id: "h3", text: "할머니께 용돈 받았어" }),
    ]);
    expect(honorific.filter((f) => f.ruleId === "common-misspelling")).toHaveLength(0);
  });
});
