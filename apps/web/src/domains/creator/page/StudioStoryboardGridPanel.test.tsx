// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_CREATION_MODE_EVENT } from "../studio-creation-mode";
import { withCutPose } from "../studio-cut-pose";
import type { StudioPageDnd } from "../studio-page-dnd";
import { StudioStoryboardGridPanel, type StoryboardGridPage } from "../StudioStoryboardGridPanel";
import { storyboardTeamReviewInUse } from "./studio-storyboard-team-review";

import type { PoseCatalogEntry } from "../scene-3d/studio-pose-suggestion";

const idleDnd: StudioPageDnd = {
  dragIndex: null,
  dropSlot: null,
  itemProps: () => ({
    draggable: true,
    onDragStart: () => undefined,
    onDragOver: () => undefined,
    onDrop: () => undefined,
    onDragEnd: () => undefined,
  }),
  indicatorFor: () => null,
};

function page(id: string, name: string): StoryboardGridPage {
  return { id, name, elements: [], bg: "#ffffff", bgGrad: null, canvasH: 1080 };
}

function renderPanel(onAddPage = vi.fn(), pages: StoryboardGridPage[] = [page("page-1", "도입"), page("page-2", "전개")], onClose = vi.fn()) {
  render(
    <StudioStoryboardGridPanel
      open
      onClose={onClose}
      pages={pages}
      currentPageId="page-1"
      dnd={idleDnd}
      onSelectPage={vi.fn()}
      onAddPage={onAddPage}
      onDuplicatePage={vi.fn()}
      onDeletePage={vi.fn()}
      canDelete
    />,
  );
  return onAddPage;
}

afterEach(() => {
  cleanup();
});

/** 필터 드롭다운의 같은 문구(option)는 빼고, 페이지 카드에 보이는 글자만 센다. */
function cardTexts(text: string): HTMLElement[] {
  return screen.queryAllByText(text).filter((element) => element.tagName !== "OPTION");
}

describe("StudioStoryboardGridPanel sequence grid", () => {
  it("offers the next page right after the last card", () => {
    const onAddPage = renderPanel();
    const addTile = screen.getByRole("button", { name: "새 페이지 추가" });

    expect(addTile.getAttribute("data-studio-storyboard-add-page")).toBe("true");
    fireEvent.click(addTile);
    expect(onAddPage).toHaveBeenCalledTimes(1);
  });

  it("hides the in-grid add tile while a search filter hides pages", () => {
    renderPanel();
    fireEvent.change(screen.getByRole("textbox", { name: "스토리보드 검색" }), { target: { value: "전개" } });

    expect(screen.queryByRole("button", { name: "새 페이지 추가" })).toBeNull();
    // 상단의 추가 버튼은 필터와 관계없이 남아 있다.
    expect(screen.getByRole("button", { name: "추가" })).toBeTruthy();
  });
});

describe("StudioStoryboardGridPanel solo summary", () => {
  it("detects team review only from real review activity", () => {
    expect(storyboardTeamReviewInUse([{ review: { status: "draft", locked: false } }, {}])).toBe(false);
    expect(storyboardTeamReviewInUse([{ review: { status: "draft", locked: false, assignee: "  " } }])).toBe(false);
    expect(storyboardTeamReviewInUse([{ review: { status: "needs-review", locked: false } }])).toBe(true);
    expect(storyboardTeamReviewInUse([{ review: { status: "draft", locked: true } }])).toBe(true);
    expect(storyboardTeamReviewInUse([{ review: { status: "draft", locked: false, assignee: "민지" } }])).toBe(true);
  });

  it("folds team metrics and blocker badges for a solo work until asked", () => {
    renderPanel();

    const summary = document.querySelector("[data-studio-storyboard-solo-summary]");
    expect(summary?.textContent).toMatch(/진행 요약 · 2페이지/u);
    // 1인 작업의 빈 페이지에 팀 검토 배지를 달아 오류처럼 보이게 하지 않는다.
    expect(cardTexts("담당자 미지정")).toHaveLength(0);
    expect(cardTexts("샷 정보 필요")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /제작 지표 모두 보기/u }));
    expect(document.querySelector("[data-studio-storyboard-solo-summary]")).toBeNull();
    expect(screen.getByRole("button", { name: /간단히 보기/u })).toBeTruthy();
  });

  it("keeps the full review board once the team uses review", () => {
    renderPanel(vi.fn(), [
      { ...page("page-1", "도입"), review: { status: "needs-review", locked: false, assignee: "민지" } },
      page("page-2", "전개"),
    ]);

    expect(document.querySelector("[data-studio-storyboard-solo-summary]")).toBeNull();
    expect(cardTexts("담당 민지")).toHaveLength(1);
    expect(cardTexts("담당자 미지정")).toHaveLength(1);
  });

  it("opens panel layouts and balloons on the current page from the top of the grid", () => {
    const onClose = vi.fn();
    const listener = vi.fn();
    window.addEventListener(STUDIO_CREATION_MODE_EVENT, listener);
    try {
      renderPanel(vi.fn(), undefined, onClose);
      fireEvent.click(screen.getByRole("button", { name: /컷 나누기/u }));
      fireEvent.click(screen.getByRole("button", { name: /말풍선 추가/u }));
    } finally {
      window.removeEventListener(STUDIO_CREATION_MODE_EVENT, listener);
    }

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls.map(([event]) => (event as CustomEvent<{ mode: string }>).detail.mode))
      .toEqual(["assets", "story"]);
  });
});

const POSE_CATALOG: readonly PoseCatalogEntry[] = [
  { id: "daily-coffee-sip", name: "머그잔 마시기", category: "daily", gender: "any", figures: 1, tags: ["카페", "커피"], description: "" },
  { id: "dramatic-shock-stepback", name: "경악하며 뒷걸음질", category: "dramatic", gender: "any", figures: 1, tags: ["놀람", "충격"], description: "" },
];

/** 호스트 배선(withCutPose 로 페이지 상태 불변 갱신)을 흉내 내는 상태ful 하네스. */
function PoseHarness({ onCutPoseChange }: { onCutPoseChange: (pageId: string, presetId: string | null) => void }) {
  const [pages, setPages] = useState<StoryboardGridPage[]>([
    { ...page("page-1", "카페 장면"), note: "카페에서 커피를 마시는 장면" },
    page("page-2", "전개"),
  ]);
  return (
    <StudioStoryboardGridPanel
      open
      onClose={vi.fn()}
      pages={pages}
      currentPageId="page-1"
      dnd={idleDnd}
      onSelectPage={vi.fn()}
      onAddPage={vi.fn()}
      onDuplicatePage={vi.fn()}
      onDeletePage={vi.fn()}
      canDelete
      poseCatalog={POSE_CATALOG}
      onCutPoseChange={(pageId, presetId) => {
        onCutPoseChange(pageId, presetId);
        setPages((current) => withCutPose(current, pageId, presetId));
      }}
    />
  );
}

describe("StudioStoryboardGridPanel cut pose recommendation entry", () => {
  it("hides every pose entry point without catalog + callback props", () => {
    renderPanel();
    expect(screen.queryByTestId("cut-pose-recommendation-panel")).toBeNull();
    expect(screen.queryByRole("button", { name: /포즈 추천/u })).toBeNull();
  });

  it("opens the recommendation for a cut from its card, applies to that cut, and undoes it", () => {
    const onCutPoseChange = vi.fn();
    render(<PoseHarness onCutPoseChange={onCutPoseChange} />);

    // 컷 카드의 진입점 → 그 컷 대상 추천 섹션이 열리고, 메모가 장면 설명으로 미리 채워진다.
    fireEvent.click(screen.getByRole("button", { name: "카페 장면 포즈 추천" }));
    expect(screen.getByTestId("cut-pose-recommendation-panel")).toBeTruthy();
    expect((screen.getByTestId("pose-suggestion-scene-input") as HTMLInputElement).value)
      .toBe("카페에서 커피를 마시는 장면");

    // 키워드가 맞은 추천이 근거와 함께 뜨고, 적용하면 그 컷(page-1)에만 콜백이 간다.
    const suggestion = screen.getByTestId("pose-suggestion-daily-coffee-sip");
    expect(suggestion.textContent).toContain("머그잔 마시기");
    fireEvent.click(screen.getByRole("button", { name: "이 포즈 적용" }));
    expect(onCutPoseChange).toHaveBeenCalledWith("page-1", "daily-coffee-sip");

    // 적용이 컷에 반영돼 현재 포즈와 되돌리기가 보이고, 되돌리면 적용 전(null)으로 원복된다.
    expect(screen.getByTestId("cut-pose-recommendation-panel").textContent).toContain("머그잔 마시기");
    fireEvent.click(screen.getByTestId("cut-pose-undo"));
    expect(onCutPoseChange).toHaveBeenCalledWith("page-1", null);
    expect(screen.queryByTestId("cut-pose-undo")).toBeNull();
    expect(screen.getByTestId("cut-pose-recommendation-panel").textContent).toContain("아직 정한 포즈가 없어요");
  });
});
