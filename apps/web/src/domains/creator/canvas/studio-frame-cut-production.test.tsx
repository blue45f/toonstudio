// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioInspectorFocusSpeedFrameControls } from "../StudioInspectorFocusSpeedFrameControls";
import type { DrawEl, El, FrameEl } from "../studio-element-model";
import { planPanelSplit } from "../studio-panel-split";

import {
  STUDIO_CUT_GUTTER_PRESETS_PX,
  clipStrokePolylineToFrameBox,
  planCutOutsideDrawRestrictionPatches,
  planWebtoonCutQuickAlign,
  summarizeCutContainedClipState,
} from "./studio-frame-cut-production";

vi.mock("../studio-page-lazy-ui", () => ({
  StudioContinuityMetadataEditor: () => null,
  StudioPanelSplitPanel: () => <div data-testid="mock-panel-split" />,
}));

afterEach(cleanup);

const SAMPLE_FRAME: FrameEl = {
  id: "frame-cut-1",
  type: "frame",
  x: 60,
  y: 100,
  width: 600,
  height: 400,
};

function makeDrawEl(id: string, x: number, y: number, noClip?: boolean): DrawEl {
  return {
    id,
    type: "draw",
    points: [x, y, x + 120, y + 80],
    stroke: "#111111",
    strokeWidth: 4,
    noClip,
  };
}

describe("P1-14 컷 제작 (프레임 분할·여백·정렬·컷 밖 그리기 제한·실행 취소)", () => {
  it("프레임 직선 분할 시 지정한 여백(gutter)만큼 두 컷 사이 간격이 정확히 벌어진다", () => {
    const split24 = planPanelSplit({
      frame: SAMPLE_FRAME,
      line: { a: { x: 0, y: 300 }, b: { x: 800, y: 300 } },
      gutterPx: 24,
    });
    expect(split24).not.toBeNull();
    const topCut = split24!.shapeA.y < split24!.shapeB.y ? split24!.shapeA : split24!.shapeB;
    const bottomCut = split24!.shapeA.y < split24!.shapeB.y ? split24!.shapeB : split24!.shapeA;
    const actualGap = bottomCut.y - (topCut.y + topCut.height);
    expect(actualGap).toBeCloseTo(24, 1);

    const split0 = planPanelSplit({
      frame: SAMPLE_FRAME,
      line: { a: { x: 0, y: 300 }, b: { x: 800, y: 300 } },
      gutterPx: 0,
    });
    expect(split0).not.toBeNull();
    const top0 = split0!.shapeA.y < split0!.shapeB.y ? split0!.shapeA : split0!.shapeB;
    const bottom0 = split0!.shapeA.y < split0!.shapeB.y ? split0!.shapeB : split0!.shapeA;
    expect(bottom0.y - (top0.y + top0.height)).toBeCloseTo(0, 1);
  });

  it("웹툰 컷 정렬(좌측·중앙·우측·전폭)이 캔버스 폭과 여백에 맞춰 계산된다", () => {
    expect(planWebtoonCutQuickAlign(SAMPLE_FRAME, "left", 800, 40)).toEqual({ x: 40 });
    expect(planWebtoonCutQuickAlign(SAMPLE_FRAME, "center", 800, 40)).toEqual({ x: 100 });
    expect(planWebtoonCutQuickAlign(SAMPLE_FRAME, "right", 800, 40)).toEqual({ x: 160 });
    expect(planWebtoonCutQuickAlign(SAMPLE_FRAME, "full-width", 800, 40)).toEqual({
      x: 40,
      width: 720,
    });
    // 0px 풀블리드(전면 컷) 지원
    expect(planWebtoonCutQuickAlign(SAMPLE_FRAME, "full-width", 800, 0)).toEqual({
      x: 0,
      width: 800,
    });
  });

  it("컷 내부 요소의 noClip 상태를 요약하고 컷 밖 그리기 제한 패치를 생성한다", () => {
    const insideClipped = makeDrawEl("draw-in-1", 120, 160, false);
    const insideOverflow = makeDrawEl("draw-in-2", 200, 220, true);
    const outsideStroke = makeDrawEl("draw-out-1", 10, 700, true);
    const elements: readonly El[] = [SAMPLE_FRAME, insideClipped, insideOverflow, outsideStroke];

    const summary = summarizeCutContainedClipState(SAMPLE_FRAME, elements);
    expect(summary).toEqual({
      totalInside: 2,
      clippedCount: 1,
      overflowCount: 1,
      allRestrictedInsideCut: false,
    });

    const restrictPatches = planCutOutsideDrawRestrictionPatches(SAMPLE_FRAME, elements, true);
    expect(restrictPatches).toEqual([
      { id: "draw-in-2", patch: { noClip: false } },
    ]);

    const releasePatches = planCutOutsideDrawRestrictionPatches(SAMPLE_FRAME, elements, false);
    expect(releasePatches).toEqual([
      { id: "draw-in-1", patch: { noClip: true } },
    ]);
  });

  it("Liang-Barsky 폴리라인 클리핑이 컷 경계 밖의 획 구간을 정확히 잘라낸다", () => {
    const frameBox = { x: 100, y: 100, width: 200, height: 200 }; // [100..300, 100..300]
    // 바깥(50, 200) -> 안쪽(200, 200) -> 바깥(350, 200) -> 다시 안쪽 진입(250, 150)
    const clippedPieces = clipStrokePolylineToFrameBox(
      [50, 200, 200, 200, 350, 200, 350, 150, 250, 150],
      frameBox,
    );
    expect(clippedPieces).toEqual([
      [100, 200, 200, 200, 300, 200],
      [300, 150, 250, 150],
    ]);
  });

  it("인스펙터 프레임 컨트롤에서 여백 프리셋·컷 정렬·컷 밖 그리기 제한·컷 실행 취소가 동작한다", () => {
    const onPanelGutterChange = vi.fn();
    const onQuickAlignCut = vi.fn();
    const onChangeCutOutsideDrawRestriction = vi.fn();
    const onUndoCutAction = vi.fn();

    render(
      <StudioInspectorFocusSpeedFrameControls
        selected={SAMPLE_FRAME}
        panelGutter={24}
        panelSplitActive={false}
        panelSplitHint={null}
        panelSplitRatio={50}
        onPanelGutterChange={onPanelGutterChange}
        onPanelSplitRatioChange={vi.fn()}
        onPatch={vi.fn()}
        onSplitFrame={vi.fn()}
        onTogglePanelSplit={vi.fn()}
        containedChildCount={3}
        cutOutsideDrawRestricted={true}
        onChangeCutOutsideDrawRestriction={onChangeCutOutsideDrawRestriction}
        onQuickAlignCut={onQuickAlignCut}
        canUndoCutAction={true}
        onUndoCutAction={onUndoCutAction}
      />,
    );

    expect(STUDIO_CUT_GUTTER_PRESETS_PX).toEqual([0, 12, 24, 40, 60]);
    fireEvent.click(screen.getByRole("button", { name: "40px" }));
    expect(onPanelGutterChange).toHaveBeenCalledWith(40);

    fireEvent.click(screen.getByRole("button", { name: "전폭" }));
    expect(onQuickAlignCut).toHaveBeenCalledWith("full-width");

    const clipCheckbox = screen.getByRole("checkbox", { name: "컷 밖 그리기 제한" });
    expect((clipCheckbox as HTMLInputElement).checked).toBe(true);
    fireEvent.click(clipCheckbox);
    expect(onChangeCutOutsideDrawRestriction).toHaveBeenCalledWith(false);

    const undoButton = screen.getByRole("button", { name: "컷 실행 취소" });
    expect(undoButton.hasAttribute("disabled")).toBe(false);
    fireEvent.click(undoButton);
    expect(onUndoCutAction).toHaveBeenCalledTimes(1);
  });
});
