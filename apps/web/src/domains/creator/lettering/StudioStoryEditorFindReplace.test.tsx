// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DialoguePageLike } from "./studio-dialogue-batch";
import type { SeededScriptCanvasResult } from "./studio-script-to-panels-seed";
import { StudioStoryEditorFindReplace } from "./StudioStoryEditorFindReplace";

afterEach(() => cleanup());

const INITIAL_PAGES: readonly DialoguePageLike[] = [
  {
    id: "p1",
    elements: [
      { id: "b1", type: "bubble", text: "서연아, 오늘 학교 가?", x: 40, y: 40 },
      { id: "b2", type: "bubble", text: "서연 잠긴 대사", x: 40, y: 200, locked: true },
    ],
  },
  {
    id: "p2",
    elements: [{ id: "b3", type: "text", text: "서연이 웃으며 대답했다.", x: 40, y: 60 }],
  },
];

function StatefulFindReplace({
  onNavigateMatch,
  onSeedFromScript,
}: {
  readonly onNavigateMatch?: (pageId: string, elementId: string) => void;
  readonly onSeedFromScript?: (result: SeededScriptCanvasResult) => void;
}): ReactElement {
  const [pages, setPages] = useState<readonly DialoguePageLike[]>(INITIAL_PAGES);
  return (
    <div>
      <StudioStoryEditorFindReplace
        pages={pages}
        currentPageId="p1"
        onApplyPages={(next) => setPages(next)}
        onNavigateMatch={onNavigateMatch}
        onSeedFromScript={onSeedFromScript}
      />
      <output data-testid="snapshot">
        {pages.map((p) => p.elements.map((e) => e.text).join("|")).join(" // ")}
      </output>
    </div>
  );
}

describe("StudioStoryEditorFindReplace", () => {
  it("전 페이지 대사 검색·탐색·일괄 치환·잠김 보호·되돌리기를 수행한다", () => {
    const onNavigateMatch = vi.fn();
    render(<StatefulFindReplace onNavigateMatch={onNavigateMatch} />);

    fireEvent.change(screen.getByLabelText("찾을 대사"), { target: { value: "서연" } });
    expect(screen.getByText("1 / 3건")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "다음 일치 항목" }));
    expect(onNavigateMatch).toHaveBeenCalledWith("p1", "b2");

    fireEvent.change(screen.getByLabelText("바꿀 대사"), { target: { value: "하윤" } });
    expect(screen.getByText(/잠긴 대사 1건은 보호되어/)).toBeTruthy();

    // 일괄 치환: 잠김 1건 제외, 2건 치환
    fireEvent.click(screen.getByRole("button", { name: "모두 바꾸기 (2건)" }));
    expect(screen.getByTestId("snapshot").textContent).toBe(
      "하윤아, 오늘 학교 가?|서연 잠긴 대사 // 하윤이 웃으며 대답했다.",
    );

    // 1클릭 되돌리기
    fireEvent.click(screen.getByRole("button", { name: "치환 되돌리기" }));
    expect(screen.getByTestId("snapshot").textContent).toBe(
      "서연아, 오늘 학교 가?|서연 잠긴 대사 // 서연이 웃으며 대답했다.",
    );
  });

  it("접이식 대본 입력에서 [컷 N] 마커를 파싱해 시드 콜백을 호출한다", () => {
    const onSeedFromScript = vi.fn();
    render(<StatefulFindReplace onSeedFromScript={onSeedFromScript} />);

    fireEvent.change(screen.getByLabelText("대본 입력"), {
      target: { value: "[컷 1]\n민수: 안녕!\n[컷 2]\n서연: 반가워!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "대본으로 컷·말풍선 시드" }));

    expect(onSeedFromScript).toHaveBeenCalledTimes(1);
    const seeded = onSeedFromScript.mock.calls[0]![0] as SeededScriptCanvasResult;
    expect(seeded.totalCutCount).toBe(2);
    expect(seeded.totalDialogueCount).toBe(2);
  });
});
