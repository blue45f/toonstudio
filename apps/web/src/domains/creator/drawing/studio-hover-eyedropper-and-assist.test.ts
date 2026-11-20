import { describe, expect, it } from "vitest";

import {
  TouchHoldEyedropperController,
  computeStylusHoverCursorProjection,
  evaluateEdgeQuickSlider,
  snapStrokePointToDrawingAssist,
} from "./studio-hover-eyedropper-and-assist";

describe("studio-hover-eyedropper-and-assist (T4 · T8 · T12)", () => {
  it("projects stylus tilt and barrel twist into hover nib ellipse dimensions (T4)", () => {
    const flat = computeStylusHoverCursorProjection({ x: 100, y: 200, brushDiameterPx: 20 });
    expect(flat.majorAxisPx).toBe(20);
    expect(flat.minorAxisPx).toBe(20);
    expect(flat.tiltMagnitudeRatio).toBe(0);

    const tilted = computeStylusHoverCursorProjection({
      x: 100,
      y: 200,
      brushDiameterPx: 20,
      tiltXDeg: 42.5,
      tiltYDeg: 0,
    });
    expect(tilted.majorAxisPx).toBeGreaterThan(20);
    expect(tilted.minorAxisPx).toBeLessThan(20);
    expect(tilted.rotationDeg).toBe(0);
  });

  it("snaps stroke coordinates to orthogonal grid or closest 1~3 point vanishing ray (T8)", () => {
    const gridSnap = snapStrokePointToDrawingAssist(
      { x: 50, y: 50 },
      { x: 140, y: 58 },
      { mode: "grid", gridSpacingPx: 32 },
    );
    expect(gridSnap).toEqual({ x: 140, y: 50, snappedToId: "grid-h" });

    const perspSnap = snapStrokePointToDrawingAssist(
      { x: 100, y: 100 },
      { x: 200, y: 106 },
      {
        mode: "perspective",
        vanishingPoints: [
          { id: "vp-horizon-right", x: 500, y: 100 },
          { id: "vp-vertical-top", x: 100, y: -400 },
        ],
      },
    );
    expect(perspSnap.snappedToId).toBe("vp-horizon-right");
    expect(perspSnap.y).toBe(100);
  });

  it("activates 400ms stationary touch-hold eyedropper and computes non-linear edge slider values (T12)", () => {
    const ctrl = new TouchHoldEyedropperController({ holdDelayMs: 400, maxJitterPx: 10 });
    expect(ctrl.beginTouch(80, 120, 1000).phase).toBe("arming");
    expect(ctrl.updateTouch(83, 122, 1250).phase).toBe("arming");
    const active = ctrl.updateTouch(84, 122, 1410);
    expect(active.phase).toBe("sampling");
    expect(ctrl.endTouch().phase).toBe("sampling");

    // 400ms 전 큰 이동은 일반 획으로 취소
    ctrl.beginTouch(80, 120, 2000);
    expect(ctrl.updateTouch(110, 120, 2100).phase).toBe("idle");

    expect(
      evaluateEdgeQuickSlider({
        kind: "brush-opacity",
        baseValue: 0.5,
        dragDeltaY: -110,
        trackHeightPx: 220,
      }),
    ).toBe(1);
    expect(
      evaluateEdgeQuickSlider({
        kind: "brush-size",
        baseValue: 10,
        dragDeltaY: -110,
        trackHeightPx: 220,
      }),
    ).toBeGreaterThan(10);
  });
});
