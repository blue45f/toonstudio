import { describe, expect, it } from "vitest";

import {
  CSP_COMPANION_NAVIGATOR_COMMANDS,
  CSP_COMPANION_REMOTE_TAB_KINDS,
  CSP_TGCXS_DEFAULT_CONSTANTS,
  applyCspAiDisturbanceFilter,
  applyCspCompanionNavigatorCommand,
  computeCspVec4SmoothParams,
  convertCspVectorStrokeToRuler,
  createDefaultCspCompanionRemoteState,
  createDefaultCspCxsTextStyle,
  cutCspVectorStrokesAtIntersection,
  evaluateCspIccPcsPipeline,
  judgeCspThinningEdgeAndCross,
  parseCspCxsTextStyle,
  serializeCspCxsTextStyle,
  smoothCspVectorV4Stroke,
  thinCspRasterToCenterlineGraph,
} from "../csp-tgcxs-certmdul-mobile-companion";

describe("csp-tgcxs-certmdul-mobile-companion (Pass 12)", () => {
  it("serializes and parses CSTextStyle (.cxs) with exact 0x24ff3c defaults", () => {
    const defJa = createDefaultCspCxsTextStyle("ja");
    expect(defJa.fontSizePt).toBe(20.0);
    expect(defJa.primaryFontName).toBe("ヒラギノ角ゴ Pro W3");
    expect(defJa.compositePreset).toBe("ComicStudio-PGA");

    const bytes = serializeCspCxsTextStyle(defJa);
    const parsed = parseCspCxsTextStyle(bytes);
    expect(parsed).toEqual(defJa);
    expect(CSP_TGCXS_DEFAULT_CONSTANTS.comicStudioPresets).toEqual([
      "ComicStudio-PGA",
      "ComicStudio-GA",
      "ComicStudio-EXP",
    ]);
  });

  it("computes CSVec4Smooth::SetupParamFromSmoothLevel (0x2b1d24) and SmoothPressure (0x2b2346)", () => {
    const params = computeCspVec4SmoothParams(4, 2);
    expect(params.smoothFactor).toBe(0.2); // 4 * 0.05 (0x3422e0)
    expect(params.maxCornerDist).toBe(4096); // 4 << 10
    expect(params.curveSqDist).toBe((4 << 6) * (4 << 6));
    expect(params.cornerSqDist).toBe((4 << 4) * (4 << 4));
    expect(params.pressureSqDist).toBe((2 * (4 << 6)) ** 2);

    const stroke = {
      id: "s1",
      points: [
        { x: 0, y: 0, pressure: 0.4, width: 2 },
        { x: 0.1, y: 0.1, pressure: 0.45, width: 2 }, // culled by pressureSqDist
        { x: 20, y: 10, pressure: 0.9, width: 2 },
        { x: 40, y: 0, pressure: 0.5, width: 2 },
      ],
    };
    const smoothed = smoothCspVectorV4Stroke(stroke, 4, 1);
    expect(smoothed.culledPressureNodes).toBeGreaterThanOrEqual(1);
    expect(smoothed.stroke.points.length).toBe(3);

    const ruler = convertCspVectorStrokeToRuler(smoothed.stroke, 600, 600);
    expect(ruler.subpixelScale).toBe(16);
    expect(ruler.fixedPointControlPoints[0]).toEqual({ x16: 0, y16: 0 });
  });

  it("splits and erases vector strokes at intersections via CSVec4Cut::CutStrokeAtIntersect (0x284b6e)", () => {
    const strokes = [
      {
        id: "horiz",
        points: [
          { x: 0, y: 50, pressure: 0.8, width: 2 },
          { x: 30, y: 50, pressure: 0.8, width: 2 },
          { x: 50, y: 50, pressure: 0.8, width: 2 },
          { x: 70, y: 50, pressure: 0.8, width: 2 },
          { x: 100, y: 50, pressure: 0.8, width: 2 },
        ],
      },
      {
        id: "left_cross",
        points: [
          { x: 30, y: 10, pressure: 0.8, width: 2 },
          { x: 30, y: 90, pressure: 0.8, width: 2 },
        ],
      },
      {
        id: "right_cross",
        points: [
          { x: 70, y: 10, pressure: 0.8, width: 2 },
          { x: 70, y: 90, pressure: 0.8, width: 2 },
        ],
      },
    ];
    const res = cutCspVectorStrokesAtIntersection(
      strokes,
      { x: 50, y: 50, radius: 8 },
      "up_to_intersection",
    );
    expect(res.intersectionCount).toBeGreaterThanOrEqual(2);
    expect(res.erasedSegmentCount).toBe(1);
    // Original 3 strokes -> middle segment of horiz erased -> 2 outer segments + 2 vertical strokes = 4 strokes
    expect(res.outputStrokes.length).toBe(4);
  });

  it("classifies 8-neighborhood thinning status codes via CSFilterThining::JudgeEdgeAndCross (0x1114ec)", () => {
    expect(judgeCspThinningEdgeAndCross([1, 0, 0, 0, 0, 0, 0, 0])).toBe(5); // isolated tip
    expect(judgeCspThinningEdgeAndCross([1, 1, 0, 0, 0, 0, 0, 0])).toBe(2); // contiguous 2-neighbor edge
    expect(judgeCspThinningEdgeAndCross([1, 0, 1, 0, 1, 0, 1, 0])).toBe(6); // 4-way crossing

    const mask = new Uint8Array(25);
    for (let i = 1; i < 4; i += 1) {
      mask[2 * 5 + i] = 1;
      mask[i * 5 + 2] = 1;
    }
    const graph = thinCspRasterToCenterlineGraph(mask, 5, 5);
    expect(graph.crossCount).toBeGreaterThanOrEqual(1);
  });

  it("evaluates CertMdul.app ICC PCS pipeline (CIccPcsStepLabToXYZ..XYZToLab) and CIccMruCache<float>", () => {
    const cache = new Set<string>();
    const spot = {
      name: "DIC-182s",
      prefix: "DIC",
      suffix: "s",
      pcsLab: [56.4, 68.2, -12.5] as const,
      deviceCmyk: [0.04, 0.88, 0.18, 0.0] as const,
    };
    const first = evaluateCspIccPcsPipeline(spot, 0.8, cache);
    expect(first.mruCacheHit).toBe(false);
    expect(first.appliedSteps).toHaveLength(5);
    expect(first.roundtripLab[0]).toBeCloseTo(first.inputLab[0], 1);

    const second = evaluateCspIccPcsPipeline(spot, 0.8, cache);
    expect(second.mruCacheHit).toBe(true);
  });

  it("executes PWTcpRemoteCommander Companion Mode commands and PWAiDisturbanceImageGenerator", () => {
    expect(CSP_COMPANION_REMOTE_TAB_KINDS).toHaveLength(8);
    expect(CSP_COMPANION_NAVIGATOR_COMMANDS).toHaveLength(11);

    let state = createDefaultCspCompanionRemoteState();
    state = applyCspCompanionNavigatorCommand(state, "ZoomIn");
    expect(state.zoomPercent).toBe(125);
    state = applyCspCompanionNavigatorCommand(state, "RotateRight");
    expect(state.rotationDeg).toBe(15);
    state = applyCspCompanionNavigatorCommand(state, "ReverseHorz");
    expect(state.flipHorizontal).toBe(true);

    const rgba = new Uint8ClampedArray(16 * 4).fill(180);
    const disturbed = applyCspAiDisturbanceFilter(rgba, 4, 4, 50);
    expect(disturbed.meanAbsoluteDelta).toBeGreaterThan(0);
    expect(disturbed.psnrDb).toBeGreaterThan(25);
  });
});
