// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  buildSerialStudioBubbleTailSvgPath,
  canDeleteSerialStudioCanvasObject,
  cloneSerialStudioCanvasObjectWithOffset,
  computeSerialStudioAlignedObjectPosition,
  computeSerialStudioClipFramePolygon,
  createEmptySerialStudioCanvasHistory,
  filterSerialStudioBubbleOrEffectTemplates,
  SERIAL_STUDIO_BUBBLE_FONTS,
  SERIAL_STUDIO_BUBBLE_TEMPLATES,
  SERIAL_STUDIO_CANVAS_ALIGNMENTS,
  SERIAL_STUDIO_CANVAS_BASE_WIDTH,
  SERIAL_STUDIO_CLIP_FRAMES,
  SERIAL_STUDIO_EFFECT_TEMPLATES,
  SERIAL_STUDIO_FAV_FONTS_STORAGE_KEY,
  SERIAL_STUDIO_MAX_HISTORY_STEPS,
  partitionSerialStudioFontsByFavorite,
  pushSerialStudioCanvasHistorySnapshot,
  redoSerialStudioCanvasHistory,
  toggleSerialStudioFavoriteFont,
  undoSerialStudioCanvasHistory,
} from "../bubble-preset-editor-engine";
import { StudioBubblePresetEditorPanel } from "../StudioBubblePresetEditorPanel";

describe("Ggumtoon BubbleEditor Engine (ggumtoon-bubble-editor-engine)", () => {
  it("builds 66 speech bubble templates ordered [57..66, 1..56] and 3 effect templates", () => {
    expect(SERIAL_STUDIO_BUBBLE_TEMPLATES).toHaveLength(66);
    expect(SERIAL_STUDIO_BUBBLE_TEMPLATES[0]?.assetNumber).toBe(57);
    expect(SERIAL_STUDIO_BUBBLE_TEMPLATES[9]?.assetNumber).toBe(66);
    expect(SERIAL_STUDIO_BUBBLE_TEMPLATES[10]?.assetNumber).toBe(1);
    expect(SERIAL_STUDIO_BUBBLE_TEMPLATES[65]?.assetNumber).toBe(56);
    expect(SERIAL_STUDIO_BUBBLE_TEMPLATES[0]?.src).toBe("/bubbles/bubble-57.png");

    expect(SERIAL_STUDIO_EFFECT_TEMPLATES).toHaveLength(3);
    expect(SERIAL_STUDIO_EFFECT_TEMPLATES.map((e) => e.src)).toEqual([
      "/effects/effect-1.png",
      "/effects/effect-2.png",
      "/effects/effect-3.png",
    ]);

    expect(filterSerialStudioBubbleOrEffectTemplates("bubble", "66").length).toBeGreaterThanOrEqual(1);
  });

  it("provides 40 Korean webtoon fonts and toggles favorites (dreamtoon_fav_fonts)", () => {
    expect(SERIAL_STUDIO_FAV_FONTS_STORAGE_KEY).toBe("dreamtoon_fav_fonts");
    expect(SERIAL_STUDIO_BUBBLE_FONTS).toHaveLength(40);

    const fav1 = toggleSerialStudioFavoriteFont([], "NanumSquare");
    expect(fav1).toEqual(["NanumSquare"]);

    const partitioned = partitionSerialStudioFontsByFavorite(fav1);
    expect(partitioned.favorites[0]?.family).toBe("NanumSquare");

    const fav2 = toggleSerialStudioFavoriteFont(fav1, "NanumSquare");
    expect(fav2).toEqual([]);
  });

  it("supports 9 clip frames with polygon vertex math and 6-way canvas alignment on 600px canvas", () => {
    expect(SERIAL_STUDIO_CLIP_FRAMES.map((f) => f.id)).toEqual([
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

    const pentagon = computeSerialStudioClipFramePolygon("pentagon");
    expect(pentagon).toHaveLength(5);

    const star = computeSerialStudioClipFramePolygon("star");
    expect(star).toHaveLength(10);

    expect(SERIAL_STUDIO_CANVAS_BASE_WIDTH).toBe(600);
    expect(SERIAL_STUDIO_CANVAS_ALIGNMENTS).toHaveLength(6);

    const baseObj = {
      left: 40,
      top: 30,
      width: 200,
      height: 100,
      scaleX: 1,
      scaleY: 1,
    };
    expect(
      computeSerialStudioAlignedObjectPosition({
        object: baseObj,
        align: "left",
        canvasWidth: 600,
        canvasHeight: 900,
      }).left,
    ).toBe(16);
    expect(
      computeSerialStudioAlignedObjectPosition({
        object: baseObj,
        align: "center-h",
        canvasWidth: 600,
        canvasHeight: 900,
      }).left,
    ).toBe(200);
    expect(
      computeSerialStudioAlignedObjectPosition({
        object: baseObj,
        align: "right",
        canvasWidth: 600,
        canvasHeight: 900,
      }).left,
    ).toBe(384);
    expect(
      computeSerialStudioAlignedObjectPosition({
        object: baseObj,
        align: "top",
        canvasWidth: 600,
        canvasHeight: 900,
      }).top,
    ).toBe(16);
    expect(
      computeSerialStudioAlignedObjectPosition({
        object: baseObj,
        align: "center-v",
        canvasWidth: 600,
        canvasHeight: 900,
      }).top,
    ).toBe(400);
    expect(
      computeSerialStudioAlignedObjectPosition({
        object: baseObj,
        align: "bottom",
        canvasWidth: 600,
        canvasHeight: 900,
      }).top,
    ).toBe(784);
  });

  it("enforces 60-step Undo/Redo ring buffer, +20px clone offset, scene-bg guard, and SVG tail path", () => {
    expect(SERIAL_STUDIO_MAX_HISTORY_STEPS).toBe(60);

    expect(canDeleteSerialStudioCanvasObject({ dataType: "scene-bg" })).toBe(false);
    expect(canDeleteSerialStudioCanvasObject({ dataType: "bubble" })).toBe(true);

    let history = createEmptySerialStudioCanvasHistory("step-0");
    for (let i = 1; i <= 65; i += 1) {
      history = pushSerialStudioCanvasHistorySnapshot(history, `step-${i}`);
    }
    expect(history.snapshots.length).toBeLessThanOrEqual(SERIAL_STUDIO_MAX_HISTORY_STEPS);
    expect(history.snapshots[history.currentIndex]).toBe("step-65");

    const undone = undoSerialStudioCanvasHistory(history);
    expect(undone.snapshot).toBe("step-64");

    const redone = redoSerialStudioCanvasHistory(undone.state);
    expect(redone.snapshot).toBe("step-65");

    const cloned = cloneSerialStudioCanvasObjectWithOffset(
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

    const svgPath = buildSerialStudioBubbleTailSvgPath({
      x: 10,
      y: 10,
      w: 120,
      h: 60,
      tail: "bottom-left",
    });
    expect(svgPath).toContain("M ");
  });
});

describe("StudioBubblePresetEditorPanel UI Component", () => {
  it("renders 66 bubble templates, 40 Korean fonts with favorite toggle, 9 clip frames, 6 alignments, and Undo/Redo/Clone", () => {
    const onInsertBubble = vi.fn();
    render(<StudioBubblePresetEditorPanel onInsertBubble={onInsertBubble} />);

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
