import { readFileSync } from "node:fs";
import path from "node:path";

import { sceneIRSchema } from "@toonstudio/studio-project-model";
import { describe, expect, it, vi } from "vitest";

import {
  buildVelloPhase1OverlayScene,
  computeTransformBoxHandles,
  documentToOverlayScreen,
  hairlineStrokeWidthPx,
  hitTestTransformBox,
  overlayScreenToDocument,
  renderPhase1OverlayFrame,
  resolveResizeHandleCursor,
  snapToDevicePixelCenter,
  type StudioVelloOverlayViewport,
  type StudioVelloPhase1OverlayState,
  type StudioVelloTransformBox,
} from "./studio-vello-phase1-overlay-adapter";

const BASE_VIEWPORT: StudioVelloOverlayViewport = {
  width: 960,
  height: 640,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  dpr: 2,
  documentWidth: 1200,
  documentHeight: 2400,
};

function createCanvas2DSpy() {
  const calls: string[] = [];
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    font: "",
    save: vi.fn(() => calls.push("save")),
    restore: vi.fn(() => calls.push("restore")),
    setTransform: vi.fn(() => calls.push("setTransform")),
    clearRect: vi.fn(() => calls.push("clearRect")),
    beginPath: vi.fn(() => calls.push("beginPath")),
    moveTo: vi.fn(() => calls.push("moveTo")),
    lineTo: vi.fn(() => calls.push("lineTo")),
    quadraticCurveTo: vi.fn(() => calls.push("quadraticCurveTo")),
    bezierCurveTo: vi.fn(() => calls.push("bezierCurveTo")),
    closePath: vi.fn(() => calls.push("closePath")),
    fill: vi.fn(() => calls.push("fill")),
    stroke: vi.fn(() => calls.push("stroke")),
    fillText: vi.fn(() => calls.push("fillText")),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe("studio-vello-phase1-overlay-adapter", () => {
  it("keeps zero Konva imports and stays within the 360-line adapter budget", () => {
    const src = readFileSync(
      path.resolve(__dirname, "studio-vello-phase1-overlay-adapter.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["'](?:konva|react-konva)/u);
    expect(src.split("\n").length).toBeLessThanOrEqual(360);
  });

  it("emits DPR-crisp 1px non-scaling hairline strokes invariant to zoom scale", () => {
    expect(hairlineStrokeWidthPx(1)).toBe(1);
    expect(hairlineStrokeWidthPx(2)).toBe(0.5);
    expect(hairlineStrokeWidthPx(4)).toBe(0.25);
    expect(snapToDevicePixelCenter(100, 2)).toBeCloseTo(100.25, 6);

    const state: StudioVelloPhase1OverlayState = {
      guides: [{ id: "g-v", axis: "x", position: 200 }],
      snapLines: [{ id: "s-h", axis: "y", position: 150 }],
    };

    for (const scale of [0.25, 1, 3.5]) {
      const out = buildVelloPhase1OverlayScene(state, { ...BASE_VIEWPORT, scale, dpr: 2 });
      expect(out.stats.hairlineStrokeCss).toBe(0.5);
      const strokeNodes = out.scene.nodes.filter((n) => n.kind === "stroke-path");
      expect(strokeNodes.length).toBe(2);
      for (const node of strokeNodes) {
        if (node.kind === "stroke-path") expect(node.strokeWidth).toBe(0.5);
      }
    }
  });

  it("round-trips document and overlay screen coordinates accurately under pan and zoom", () => {
    const vp: StudioVelloOverlayViewport = { ...BASE_VIEWPORT, scale: 1.5, offsetX: 45, offsetY: 90 };
    const screen = documentToOverlayScreen(vp, { x: 120, y: 80 });
    expect(screen).toEqual({ x: 135, y: 30 });
    expect(overlayScreenToDocument(vp, screen)).toEqual({ x: 120, y: 80 });
  });

  it("builds valid SceneIR covering guides, snap lines, rulers, perspective grid, marquee, and 8-handle transform box", () => {
    const state: StudioVelloPhase1OverlayState = {
      guides: [
        { id: "guide-user", axis: "x", position: 120 },
        { id: "guide-locked", axis: "y", position: 240, kind: "safe-area", locked: true },
      ],
      snapLines: [{ id: "snap-center", axis: "x", position: 400, start: 60, end: 520 }],
      rulers: { visible: true, showLabels: true },
      perspectiveGrid: {
        vanishingPoints: [{ x: 180, y: 220 }, { x: 780, y: 220 }],
        horizonY: 220,
        rayCount: 8,
      },
      marqueeRect: { x: 320, y: 260, width: -120, height: -80, dashed: true },
      transformBox: { bounds: { x: 300, y: 180, width: 200, height: 120 }, rotationDeg: 0 },
    };

    const out = buildVelloPhase1OverlayScene(state, BASE_VIEWPORT);
    const parsed = sceneIRSchema.parse(out.scene);
    expect(parsed.version).toBe(11);
    expect(out.stats.guideCount).toBe(2);
    expect(out.stats.snapLineCount).toBe(1);
    expect(out.stats.perspectiveRayCount).toBe(16);
    expect(out.stats.rulerTickCount).toBeGreaterThan(0);
    expect(out.handles).toHaveLength(9); // 8 resize + 1 rotate

    const ids = new Set(parsed.nodes.map((n) => n.id));
    expect(ids.has("overlay-perspective-rays")).toBe(true);
    expect(ids.has("overlay-perspective-horizon")).toBe(true);
    expect(ids.has("guide-user")).toBe(true);
    expect(ids.has("guide-locked")).toBe(true);
    expect(ids.has("snap-center")).toBe(true);
    expect(ids.has("overlay-marquee-fill")).toBe(true);
    expect(ids.has("overlay-marquee-stroke")).toBe(true);
    expect(ids.has("overlay-transform-frame")).toBe(true);
    expect(ids.has("overlay-transform-rotate-stem")).toBe(true);
    expect(ids.has("overlay-ruler-ticks")).toBe(true);

    // Locked guide should emit multiple dashed M/L segments
    const lockedGuide = parsed.nodes.find((n) => n.id === "guide-locked");
    expect(lockedGuide?.kind).toBe("stroke-path");
    if (lockedGuide?.kind === "stroke-path") {
      expect(lockedGuide.path.verbs.length).toBeGreaterThan(10);
    }
  });

  it("computes rotation-aware resize cursors and performs deterministic hit-testing for 8 handles, rotate, and OBB move", () => {
    expect(resolveResizeHandleCursor("nw", 0)).toBe("nwse-resize");
    expect(resolveResizeHandleCursor("n", 0)).toBe("ns-resize");
    expect(resolveResizeHandleCursor("ne", 0)).toBe("nesw-resize");
    expect(resolveResizeHandleCursor("e", 0)).toBe("ew-resize");
    expect(resolveResizeHandleCursor("n", 90)).toBe("ew-resize");
    expect(resolveResizeHandleCursor("e", 90)).toBe("ns-resize");
    expect(resolveResizeHandleCursor("n", 45)).toBe("nesw-resize");
    expect(resolveResizeHandleCursor("rotate", 35)).toBe("grab");

    const box: StudioVelloTransformBox = {
      bounds: { x: 200, y: 150, width: 160, height: 100 },
      rotationDeg: 90,
    };
    const handles = computeTransformBoxHandles(box, BASE_VIEWPORT);
    expect(handles.map((h) => h.id)).toEqual(["nw", "ne", "se", "sw", "n", "e", "s", "w", "rotate"]);

    const nw = handles.find((h) => h.id === "nw")!;
    const hitNw = hitTestTransformBox(box, BASE_VIEWPORT, { x: nw.screenPoint.x + 2, y: nw.screenPoint.y - 1 });
    expect(hitNw?.handle).toBe("nw");
    expect(hitNw?.cursor).toBe("nesw-resize");

    const rot = handles.find((h) => h.id === "rotate")!;
    const hitRot = hitTestTransformBox(box, BASE_VIEWPORT, rot.screenPoint);
    expect(hitRot?.handle).toBe("rotate");
    expect(hitRot?.cursor).toBe("grab");

    // Center of box hits move
    const hitMove = hitTestTransformBox(box, BASE_VIEWPORT, { x: 280, y: 200 });
    expect(hitMove?.handle).toBe("move");
    expect(hitMove?.cursor).toBe("move");

    // Outside rotated OBB misses
    expect(hitTestTransformBox(box, BASE_VIEWPORT, { x: 20, y: 20 })).toBeNull();

    // Locked box hides rotate handle and returns not-allowed cursor
    const lockedBox: StudioVelloTransformBox = { ...box, locked: true };
    const lockedHandles = computeTransformBoxHandles(lockedBox, BASE_VIEWPORT);
    expect(lockedHandles).toHaveLength(8);
    expect(hitTestTransformBox(lockedBox, BASE_VIEWPORT, { x: 280, y: 200 })?.cursor).toBe("not-allowed");
  });

  it("dispatches cleanly across Vello submit, Canvas 2D fallback, and headless SceneIR modes", () => {
    const state: StudioVelloPhase1OverlayState = {
      guides: [{ axis: "x", position: 100 }],
      rulers: { visible: true },
      transformBox: { bounds: { x: 100, y: 100, width: 120, height: 80 } },
    };

    const submitSpy = vi.fn();
    const velloRes = renderPhase1OverlayFrame(state, BASE_VIEWPORT, { velloSubmit: submitSpy });
    expect(velloRes.backend).toBe("vello");
    expect(submitSpy).toHaveBeenCalledOnce();
    expect(submitSpy).toHaveBeenCalledWith(velloRes.output.scene);

    const { ctx, calls } = createCanvas2DSpy();
    const fallbackRes = renderPhase1OverlayFrame(state, BASE_VIEWPORT, { canvas2d: ctx });
    expect(fallbackRes.backend).toBe("canvas2d-fallback");
    expect(calls).toContain("setTransform");
    expect(calls).toContain("clearRect");
    expect(calls).toContain("fill");
    expect(calls).toContain("stroke");
    expect(calls).toContain("fillText");

    const headlessRes = renderPhase1OverlayFrame(state, BASE_VIEWPORT);
    expect(headlessRes.backend).toBe("scene-ir-only");
  });
});
