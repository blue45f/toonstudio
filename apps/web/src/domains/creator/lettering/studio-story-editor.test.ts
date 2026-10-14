import { describe, expect, it } from "vitest";

import type { DialoguePageLike } from "./studio-dialogue-batch";
import {
  applySpellFixToText,
  applyStoryEditorDrafts,
  buildStoryEditorView,
  collectStoryEditorDrafts,
} from "./studio-story-editor";

/** 판정 픽스처 — 3페이지, 페이지마다 말풍선·텍스트가 섞여 있다. */
function threePages(): DialoguePageLike[] {
  return [
    {
      id: "p1",
      elements: [
        { id: "a", type: "bubble", text: "첫 페이지 첫 대사", x: 40, y: 40 },
        { id: "b", type: "bubble", text: "첫 페이지 둘째 대사", x: 40, y: 200 },
        { id: "art", type: "image", x: 0, y: 0 },
      ],
    },
    {
      id: "p2",
      elements: [{ id: "c", type: "text", text: "둘째 페이지 나레이션", x: 30, y: 80 }],
    },
    {
      id: "p3",
      elements: [
        { id: "d", type: "bubble", text: "셋째 페이지 대사", x: 30, y: 60 },
        { id: "e", type: "bubble", text: "잠긴 대사", x: 30, y: 220, locked: true },
      ],
    },
  ];
}

describe("studio story editor view model", () => {
  it("펼친 목록이 읽기 순서·페이지 배지·페이지 내 순번을 갖춘다", () => {
    const view = buildStoryEditorView(threePages());
    expect(view.totalCount).toBe(5);
    expect(view.rows.map((row) => row.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(view.rows[0]).toMatchObject({ pageLabel: "1페이지", orderInPage: 1 });
    expect(view.rows[1]).toMatchObject({ pageLabel: "1페이지", orderInPage: 2 });
    expect(view.rows[2]).toMatchObject({ pageLabel: "2페이지", orderInPage: 1, elType: "text" });
    expect(view.groups.map((group) => group.rows.length)).toEqual([2, 1, 2]);
    expect(view.lockedCount).toBe(1);
  });

  it("맞춤법 검사 결과를 행에 공유한다 — 같은 규칙이 QC와 동일하게 붙는다", () => {
    const base = threePages();
    const pages: DialoguePageLike[] = [
      {
        ...base[0]!,
        elements: base[0]!.elements.map((el) =>
          el.id === "a" ? { ...el, text: "이건  이중 공백 대사예요" } : el
        ),
      },
      ...base.slice(1),
    ];
    const view = buildStoryEditorView(pages);
    const rowA = view.rows.find((row) => row.id === "a")!;
    expect(rowA.findings.some((finding) => finding.ruleId === "double-space")).toBe(true);
    expect(view.spellSummary.findingCount).toBeGreaterThan(0);
    expect(view.flaggedRowCount).toBeGreaterThan(0);
    const fix = rowA.findings.find((finding) => finding.fix)?.fix;
    expect(fix).toBeDefined();
    expect(applySpellFixToText(rowA.text, fix!)).toBe("이건 이중 공백 대사예요");
  });
});

describe("studio story editor drafts + redistribution", () => {
  it("판정: 3페이지 대사를 표면 하나로 수정·저장하면 각 페이지 말풍선에 정확히 반영된다", () => {
    const pages = threePages();
    const view = buildStoryEditorView(pages);
    const edits = new Map<string, string>([
      ["a", "고친 첫 대사"],
      ["c", "고친 나레이션"],
      ["d", "고친 셋째 대사"],
    ]);
    const { drafts, lockedEditIds } = collectStoryEditorDrafts(view, edits);
    expect(drafts).toHaveLength(3);
    expect(lockedEditIds).toEqual([]);

    const result = applyStoryEditorDrafts(pages, drafts);
    expect(result.conflicts).toEqual([]);
    expect(result.applied).toHaveLength(3);
    expect(result.changedPageIds).toEqual(["p1", "p2", "p3"]);
    expect(result.pages).not.toBe(pages);
    const textOf = (pageId: string, elId: string) =>
      result.pages.find((page) => page.id === pageId)?.elements.find((el) => el.id === elId)?.text;
    expect(textOf("p1", "a")).toBe("고친 첫 대사");
    expect(textOf("p1", "b")).toBe("첫 페이지 둘째 대사");
    expect(textOf("p2", "c")).toBe("고친 나레이션");
    expect(textOf("p3", "d")).toBe("고친 셋째 대사");
    // 입력 불변
    expect(pages[0]!.elements[0]).toMatchObject({ text: "첫 페이지 첫 대사" });
  });

  it("안 바뀐 행·잠긴 행 수정 시도는 초안에서 빠지고 잠긴 쪽은 보고된다", () => {
    const view = buildStoryEditorView(threePages());
    const { drafts, lockedEditIds } = collectStoryEditorDrafts(view, {
      a: "첫 페이지 첫 대사",
      e: "잠금 풀고 싶은 대사",
    });
    expect(drafts).toEqual([]);
    expect(lockedEditIds).toEqual(["e"]);
  });

  it("표면을 연 뒤 캔버스에서 먼저 바뀐 대사는 stale 충돌로 덮어쓰지 않는다", () => {
    const pages = threePages();
    const view = buildStoryEditorView(pages);
    const { drafts } = collectStoryEditorDrafts(view, new Map([["a", "표면 수정본"], ["d", "셋째 수정본"]]));
    const moved = pages.map((page) =>
      page.id === "p1"
        ? {
            ...page,
            elements: page.elements.map((el) =>
              el.id === "a" ? { ...el, text: "캔버스에서 먼저 고침" } : el
            ),
          }
        : page
    );
    const result = applyStoryEditorDrafts(moved, drafts);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      elementId: "a",
      reason: "stale",
      currentText: "캔버스에서 먼저 고침",
      attemptedText: "표면 수정본",
    });
    // 나머지는 정상 적용된다
    expect(result.applied).toHaveLength(1);
    expect(
      result.pages.find((page) => page.id === "p3")?.elements.find((el) => el.id === "d")?.text
    ).toBe("셋째 수정본");
    expect(
      result.pages.find((page) => page.id === "p1")?.elements.find((el) => el.id === "a")?.text
    ).toBe("캔버스에서 먼저 고침");
  });

  it("잠긴·사라진 대사는 충돌로 보고하고, 적용이 없으면 입력 참조를 그대로 돌려준다", () => {
    const pages = threePages();
    const result = applyStoryEditorDrafts(pages, [
      { pageId: "p3", elementId: "e", originalText: "잠긴 대사", text: "바꾸기" },
      { pageId: "p2", elementId: "ghost", originalText: "없음", text: "바꾸기" },
      { pageId: "nope", elementId: "x", originalText: "없음", text: "바꾸기" },
    ]);
    expect(result.pages).toBe(pages);
    expect(result.applied).toEqual([]);
    // 충돌은 초안 순서가 아니라 페이지 문서 순서로 보고된다.
    expect(result.conflicts.map((conflict) => conflict.reason)).toEqual([
      "missing",
      "locked",
      "missing",
    ]);
  });

  it("빈 초안은 입력 참조 그대로, 이미 같은 텍스트면 충돌 없이 무변경이다", () => {
    const pages = threePages();
    expect(applyStoryEditorDrafts(pages, []).pages).toBe(pages);
    const same = applyStoryEditorDrafts(pages, [
      { pageId: "p1", elementId: "a", originalText: "옛 원문", text: "첫 페이지 첫 대사" },
    ]);
    expect(same.pages).toBe(pages);
    expect(same.conflicts).toEqual([]);
  });
});

describe("applySpellFixToText", () => {
  it("범위 밖 fix는 무변경이다", () => {
    expect(applySpellFixToText("abc", { start: 5, end: 9, replacement: "x" })).toBe("abc");
    expect(applySpellFixToText("abc", { start: 2, end: 1, replacement: "x" })).toBe("abc");
  });
});
