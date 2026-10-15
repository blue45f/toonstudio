// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DialoguePageLike } from "./studio-dialogue-batch";
import { applyStoryEditorDrafts, type StoryEditorDraft } from "./studio-story-editor";
import { StudioStoryEditorSurface } from "./StudioStoryEditorSurface";

afterEach(() => cleanup());

function threePages(): DialoguePageLike[] {
  return [
    {
      id: "p1",
      elements: [{ id: "a", type: "bubble", text: "첫 페이지 대사", x: 40, y: 40 }],
    },
    {
      id: "p2",
      elements: [{ id: "c", type: "text", text: "둘째 페이지 대사", x: 30, y: 80 }],
    },
    {
      id: "p3",
      elements: [{ id: "d", type: "bubble", text: "셋째 페이지  이중공백", x: 30, y: 60 }],
    },
  ];
}

describe("StudioStoryEditorSurface", () => {
  it("3페이지 대사를 한 표면에 페이지 배지와 함께 펼치고 맞춤법 의심을 공유한다", () => {
    render(
      <StudioStoryEditorSurface
        pages={threePages()}
        currentPageId="p1"
        selectedId={null}
        onClose={() => {}}
        onSelectElement={() => {}}
        onSaveDrafts={() => applyStoryEditorDrafts(threePages(), [])}
      />
    );
    expect(screen.getByText("3페이지 · 대사 3개")).toBeTruthy();
    expect(screen.getByLabelText("1페이지 1번째 대사 편집")).toBeTruthy();
    expect(screen.getByLabelText("2페이지 1번째 대사 편집")).toBeTruthy();
    expect(screen.getByLabelText("3페이지 1번째 대사 편집")).toBeTruthy();
    // 맞춤법 검사 공유 — 이중 공백 지적과 고치기 후보가 행에 붙는다.
    expect(screen.getAllByText("맞춤법 의심").length).toBeGreaterThan(0);
    expect(screen.getByText(/후보 적용/)).toBeTruthy();
    // 아직 바뀐 게 없으면 저장은 비활성.
    expect(
      (screen.getByRole("button", { name: /모두 저장/ }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("판정: 표면에서 고친 3페이지 대사를 모두 저장하면 초안이 페이지별로 정확히 넘어간다", () => {
    const pages = threePages();
    const seen: StoryEditorDraft[] = [];
    const onSaveDrafts = vi.fn((drafts: readonly StoryEditorDraft[]) => {
      seen.push(...drafts);
      return applyStoryEditorDrafts(pages, drafts);
    });
    render(
      <StudioStoryEditorSurface
        pages={pages}
        currentPageId="p1"
        selectedId={null}
        onClose={() => {}}
        onSelectElement={() => {}}
        onSaveDrafts={onSaveDrafts}
      />
    );
    fireEvent.change(screen.getByLabelText("1페이지 1번째 대사 편집"), {
      target: { value: "고친 첫 대사" },
    });
    fireEvent.change(screen.getByLabelText("2페이지 1번째 대사 편집"), {
      target: { value: "고친 둘째 대사" },
    });
    fireEvent.change(screen.getByLabelText("3페이지 1번째 대사 편집"), {
      target: { value: "고친 셋째 대사" },
    });
    fireEvent.click(screen.getByRole("button", { name: /모두 저장/ }));
    expect(onSaveDrafts).toHaveBeenCalledTimes(1);
    expect(seen.map((draft) => [draft.pageId, draft.text])).toEqual([
      ["p1", "고친 첫 대사"],
      ["p2", "고친 둘째 대사"],
      ["p3", "고친 셋째 대사"],
    ]);
    expect(screen.getByText(/저장 결과 · 3개 반영/)).toBeTruthy();
    expect(screen.getByText("충돌 없이 모두 반영됐어요.")).toBeTruthy();
  });
  it("커서를 여러 번 옮겨도 입력이 끊기지 않고 마지막 커서 위치에서 나눈다", () => {
    // 선택 범위 갱신 함수가 이벤트 핸들러가 끝난 뒤 실행되면 event.currentTarget 은 이미 null 이다.
    // 값을 핸들러 안에서 먼저 읽지 않으면 커서를 두 번째로 옮길 때부터 예외가 난다.
    const onSplitText = vi.fn();
    render(
      <StudioStoryEditorSurface
        pages={threePages()}
        currentPageId="p1"
        selectedId={null}
        onClose={() => {}}
        onSelectElement={() => {}}
        onSaveDrafts={() => applyStoryEditorDrafts(threePages(), [])}
        onSplitText={onSplitText}
      />
    );
    fireEvent.click(screen.getAllByRole("button", { name: /구조 편집/ })[0]!);
    const editor = screen.getByLabelText("1페이지 1번째 대사 편집");
    for (const caret of [1, 2, 3]) {
      fireEvent.select(editor, { target: { selectionStart: caret, selectionEnd: caret } });
    }
    fireEvent.click(screen.getByRole("button", { name: /커서에서 나누기/ }));
    expect(onSplitText).toHaveBeenCalledTimes(1);
    expect(onSplitText).toHaveBeenCalledWith("p1", expect.any(String), "첫 페이지 대사", 3);
  });
});
