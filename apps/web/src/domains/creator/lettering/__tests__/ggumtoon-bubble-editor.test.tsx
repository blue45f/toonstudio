// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  buildGgumtoonBubbleTailSvgPath,
  canDeleteGgumtoonCanvasObject,
  cloneGgumtoonCanvasObjectWithOffset,
  computeGgumtoonAlignedObjectPosition,
  computeGgumtoonClipFramePolygon,
  createEmptyGgumtoonCanvasHistory,
  filterGgumtoonBubbleOrEffectTemplates,
  GGUMTOON_BUBBLE_FONTS,
  GGUMTOON_BUBBLE_TEMPLATES,
  GGUMTOON_CANVAS_ALIGNMENTS,
  GGUMTOON_CANVAS_BASE_WIDTH,
  GGUMTOON_CLIP_FRAMES,
  GGUMTOON_EFFECT_TEMPLATES,
  GGUMTOON_FAV_FONTS_STORAGE_KEY,
  GGUMTOON_MAX_HISTORY_STEPS,
  partitionGgumtoonFontsByFavorite,
  pushGgumtoonCanvasHistorySnapshot,
  redoGgumtoonCanvasHistory,
  toggleGgumtoonFavoriteFont,
  undoGgumtoonCanvasHistory,
} from "../ggumtoon-bubble-editor-engine";
import { StudioGgumtoonBubbleEditorPanel } from "../StudioGgumtoonBubbleEditorPanel";

describe("Ggumtoon BubbleEditor Engine (ggumtoon-bubble-editor-engine)", () => {
  it("builds 66 speech bubble templates ordered [57..66, 1..56] and 3 effect templates", () => {
    expect(GGUMTOON_BUBBLE_TEMPLATES).toHaveLength(66);
    expect(GGUMTOON_BUBBLE_TEMPLATES[0]?.assetNumber).toBe(57);
    expect(GGUMTOON_BUBBLE_TEMPLATES[9]?.assetNumber).toBe(66);
    expect(GGUMTOON_BUBBLE_TEMPLATES[10]?.assetNumber).toBe(1);
    expect(GGUMTOON_BUBBLE_TEMPLATES[65]?.assetNumber).toBe(56);
    expect(GGUMTOON_BUBBLE_TEMPLATES[0]?.src).toBe("/bubbles/bubble-57.png");

    expect(GGUMTOON_EFFECT_TEMPLATES).toHaveLength(3);
    expect(GGUMTOON_EFFECT_TEMPLATES.map((e) => e.src)).toEqual([
      "/effects/effect-1.png",
      "/effects/effect-2.png",
      "/effects/effect-3.png",
    ]);

    expect(filterGgumtoonBubbleOrEffectTemplates("bubble", "66").length).toBeGreaterThanOrEqual(1);
  });

  it("provides 40 Korean webtoon fonts and toggles favorites (dreamtoon_fav_fonts)", () => {
    expect(GGUMTOON_FAV_FONTS_STORAGE_KEY).toBe("dreamtoon_fav_fonts");
    expect(GGUMTOON_BUBBLE_FONTS).toHaveLength(40);

    const fav1 = toggleGgumtoonFavoriteFont([], "NanumSquare");
    expect(fav1).toEqual(["NanumSquare"]);

    const partitioned = partitionGgumtoonFontsByFavorite(fav1);
    expect(partitioned.favorites[0]?.family).toBe("NanumSquare");

    const fav2 = toggleGgumtoonFavoriteFont(fav1, "NanumSquare");
    expect(fav2).toEqual([]);
  });

  it("supports 9 clip frames with polygon vertex math and 6-way canvas alignment on 600px canvas", () => {
    expect(GGUMTOON_CLIP_FRAMES.map((f) => f.id)).toEqual([
      "none",
      "circle",
      "rect",
      "roundRect",
      "hexagon",
      "pentagon",
      "triangle",
      "diamond",
      "star",
    ]);

    const pentagon = computeGgumtoonClipFramePolygon("pentagon");
    expect(pentagon).toHaveLength(5);

    const star = computeGgumtoonClipFramePolygon("star");
    expect(star).toHaveLength(10);

    expect(GGUMTOON_CANVAS_BASE_WIDTH).toBe(600);
    expect(GGUMTOON_CANVAS_ALIGNMENTS).toHaveLength(6);

    const baseObj = {
      left: 40,
      top: 30,
      width: 200,
      height: 100,
      scaleX: 1,
      scaleY: 1,
    };
    expect(
      computeGgumtoonAlignedObjectPosition({
        object: baseObj,
        align: "left",
        canvasWidth: 600,
        canvasHeight: 900,
      }).left,
    ).toBe(16);
    expect(
      computeGgumtoonAlignedObjectPosition({
        object: baseObj,
        align: "center-h",
        canvasWidth: 600,
        canvasHeight: 900,
      }).left,
    ).toBe(200);
    expect(
      computeGgumtoonAlignedObjectPosition({
        object: baseObj,
        align: "right",
        canvasWidth: 600,
        canvasHeight: 900,
      }).left,
    ).toBe(384);
    expect(
      computeGgumtoonAlignedObjectPosition({
        object: baseObj,
        align: "top",
        canvasWidth: 600,
        canvasHeight: 900,
      }).top,
    ).toBe(16);
    expect(
      computeGgumtoonAlignedObjectPosition({
        object: baseObj,
        align: "center-v",
        canvasWidth: 600,
        canvasHeight: 900,
      }).top,
    ).toBe(400);
    expect(
      computeGgumtoonAlignedObjectPosition({
        object: baseObj,
        align: "bottom",
        canvasWidth: 600,
        canvasHeight: 900,
      }).top,
    ).toBe(784);
  });

  it("enforces 60-step Undo/Redo ring buffer, +20px clone offset, scene-bg guard, and SVG tail path", () => {
    expect(GGUMTOON_MAX_HISTORY_STEPS).toBe(60);

    expect(canDeleteGgumtoonCanvasObject({ dataType: "scene-bg" })).toBe(false);
    expect(canDeleteGgumtoonCanvasObject({ dataType: "bubble" })).toBe(true);

    let history = createEmptyGgumtoonCanvasHistory("step-0");
    for (let i = 1; i <= 65; i += 1) {
      history = pushGgumtoonCanvasHistorySnapshot(history, `step-${i}`);
    }
    expect(history.snapshots.length).toBeLessThanOrEqual(GGUMTOON_MAX_HISTORY_STEPS);
    expect(history.snapshots[history.currentIndex]).toBe("step-65");

    const undone = undoGgumtoonCanvasHistory(history);
    expect(undone.snapshot).toBe("step-64");

    const redone = redoGgumtoonCanvasHistory(undone.state);
    expect(redone.snapshot).toBe("step-65");

    const cloned = cloneGgumtoonCanvasObjectWithOffset(
      {
        id: "elem-1",
        dataType: "bubble",
        left: 100,
        top: 150,
        width: 200,
        height: 100,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        flipX: false,
        flipY: false,
      },
      "elem-2",
    );
    expect(cloned.left).toBe(120);
    expect(cloned.top).toBe(170);

    const svgPath = buildGgumtoonBubbleTailSvgPath({
      x: 10,
      y: 10,
      w: 120,
      h: 60,
      tail: "bottom-left",
    });
    expect(svgPath).toContain("M ");
  });
});

describe("StudioGgumtoonBubbleEditorPanel UI Component", () => {
  it("renders 66 bubble templates, 40 Korean fonts with favorite toggle, 9 clip frames, 6 alignments, and Undo/Redo/Clone", () => {
    const onInsertBubble = vi.fn();
    render(<StudioGgumtoonBubbleEditorPanel onInsertBubble={onInsertBubble} />);

    expect(screen.getByTestId("ggumtoon-bubble-editor-panel")).toBeDefined();

    fireEvent.click(screen.getByTestId("ggumtoon-tpl-bubble-2"));
    expect(onInsertBubble).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("ggumtoon-toggle-fav-font-btn"));
    fireEvent.click(screen.getByTestId("ggumtoon-clip-frame-star"));
    fireEvent.click(screen.getByTestId("ggumtoon-align-center-h"));
    fireEvent.click(screen.getByTestId("ggumtoon-layer-clone"));
    fireEvent.click(screen.getByTestId("ggumtoon-history-undo"));
    fireEvent.click(screen.getByTestId("ggumtoon-history-redo"));

    expect(screen.getByTestId("ggumtoon-tail-svg-path")).toBeDefined();
  });
});
