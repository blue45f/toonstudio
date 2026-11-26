import { describe, expect, it } from "vitest";
import {
  applyCalibratedStrokeFilter,
  calibrateArtistTremorFilter,
  closeLineArtGapsAndAutoFlat,
  createNeutralWebcamFaceLandmarks,
  createWetPaperLbmState,
  depositWetPigmentBrush,
  layoutCurvedVariableSfx,
  relight3dgsSceneSh,
  SH_C0,
  solveCameraFromVanishingGuides,
  split3dGbufferIntoDepthLayers,
  stepWetPaperLbmCpu,
  synthesizeMotionSmearAndSpeedlines,
  WebcamVrmExpressionPoseSolver,
  type GaussianSplatSceneInput,
  type PerspectiveGuideLine,
  type RawStrokeSample,
} from "./index";

describe("Super-Gap Pillars A & B: Edge Cases, Clamping & Sub-Millisecond Budgets", () => {
  it("#1 Hanji preset preserves directional capillary wicking and stays mass-stable", () => {
    const hanji = createWetPaperLbmState(24, 24, "hanji", 303);
    depositWetPigmentBrush(hanji, {
      centerX: 12,
      centerY: 12,
      radiusPx: 3.5,
      waterAmount: 0.7,
      pigmentRgba: [0.12, 0.12, 0.14, 1],
      pigmentLoad: 0.85,
    });
    const m0 = stepWetPaperLbmCpu(hanji, { dtSec: 0.25 });
    let mLast = m0;
    for (let s = 0; s < 8; s += 1) {
      mLast = stepWetPaperLbmCpu(hanji, { dtSec: 0.25 });
    }
    expect(mLast.totalPigmentMass).toBeCloseTo(m0.totalPigmentMass, 2);
    expect(mLast.totalSettledPigment).toBeGreaterThan(m0.totalSettledPigment);
  });

  it("#2 Empty SFX text & tight Bezier compression remain finite and safe", () => {
    const empty = layoutCurvedVariableSfx({
      text: "",
      curve: {
        kind: "cubic-bezier",
        p0: { x: 0, y: 0 },
        p1: { x: 50, y: 0 },
        p2: { x: 100, y: 0 },
        p3: { x: 150, y: 0 },
      },
      baseFontSizePx: 40,
      axes: { weightStart: 400, weightEnd: 700, slantStartDeg: 0, slantEndDeg: 0 },
    });
    expect(empty.glyphs).toHaveLength(0);
    expect(empty.bounds.width).toBe(0);

    const crowded = layoutCurvedVariableSfx({
      text: "두근두근두근두근",
      curve: {
        kind: "cubic-bezier",
        p0: { x: 10, y: 50 },
        p1: { x: 40, y: 20 },
        p2: { x: 80, y: 80 },
        p3: { x: 110, y: 50 },
      },
      baseFontSizePx: 48,
      axes: { weightStart: 500, weightEnd: 900, slantStartDeg: -5, slantEndDeg: 10, easing: "taper-tail" },
    });
    expect(crowded.glyphs).toHaveLength(8);
    expect(crowded.glyphs[7].arcLengthPx).toBeLessThanOrEqual(crowded.totalArcLengthPx + 1e-3);
  });

  it("#3 Gaps wider than maxGapPx are NOT bridged and leak safely without crash", () => {
    const res = closeLineArtGapsAndAutoFlat({
      strokes: [
        {
          id: "open-u",
          points: [
            { x: 12, y: 12 },
            { x: 52, y: 12 },
            { x: 52, y: 52 },
            { x: 12, y: 52 },
          ],
        },
      ],
      canvasWidth: 64,
      canvasHeight: 64,
      maxGapPx: 8, // 실제 틈새는 40px
    });
    expect(res.bridges).toHaveLength(0);
    expect(res.enclosedRegionCount).toBe(0);
    expect(res.aiTokensUsed).toBe(0);
  });

  it("#4 Partial calibration (<20 strokes) marks isFullCalibration=false and runs filter cleanly", () => {
    const shortStrokes: RawStrokeSample[][] = [
      Array.from({ length: 32 }, (_, i) => ({
        x: 10 + i * 3,
        y: 50 + Math.sin(i * 0.5) * 1.2,
        timestampMs: i * 16.67,
      })),
    ];
    const profile = calibrateArtistTremorFilter(shortStrokes);
    expect(profile.isFullCalibration).toBe(false);
    expect(profile.analyzedStrokeCount).toBe(1);
    const out = applyCalibratedStrokeFilter(shortStrokes[0], profile);
    expect(out).toHaveLength(32);
    expect(Number.isFinite(out[31].x)).toBe(true);
  });

  it("#5 Non-mirrored Webcam VRM mode maps left-eye blink directly to eyeBlinkLeft", () => {
    const solver = new WebcamVrmExpressionPoseSolver({ mirrorHorizontal: false });
    const neutral = createNeutralWebcamFaceLandmarks();
    const leftBlink = {
      ...neutral,
      leftEye: {
        ...neutral.leftEye,
        top: { x: 0.39, y: 0.419 },
        bottom: { x: 0.39, y: 0.422 },
      },
    };
    const out = solver.update({ timestampMs: 0, face: leftBlink });
    expect(out.mirrored).toBe(false);
    expect(out.blendshapes.eyeBlinkLeft).toBeGreaterThan(0.85);
    expect(out.blendshapes.eyeBlinkRight).toBeLessThan(0.1);
  });

  it("#6 3DGS SH Relight with relightStrength=0 preserves input L0/L1 when weather=clear & fog=0", () => {
    const scene: GaussianSplatSceneInput = {
      count: 4,
      positions: new Float32Array([0, 1, 2, 1, 1, 2, -1, 1, 2, 0, 2, 2]),
      shL0: new Float32Array(12).fill((0.6 - 0.5) / SH_C0),
      shL1: new Float32Array(36).fill(0.15),
      opacities: new Float32Array([1, 1, 1, 1]),
    };
    const res = relight3dgsSceneSh(scene, {
      timeOfDay: "night",
      weather: "clear",
      relightStrength: 0,
      fogDensityMultiplier: 0,
    });
    expect(res.shL0Relit[0]).toBeCloseTo(scene.shL0[0], 4);
    expect(res.shL1Relit[0]).toBeCloseTo(scene.shL1[0], 4);
  });

  it("#7 PnP solver clamps extreme wide/telephoto into [24, 135]mm and averages <1ms over 50 runs", () => {
    // 매우 가까운 소실점 쌍 -> 초광각 (<24mm) -> 24mm로 클램프
    const ultraWideX: PerspectiveGuideLine[] = [
      { start: { x: 200, y: 200 }, end: { x: 350, y: 300 } },
      { start: { x: 200, y: 600 }, end: { x: 350, y: 500 } },
    ]; // VP = (500, 400)
    const ultraWideZ: PerspectiveGuideLine[] = [
      { start: { x: 1000, y: 200 }, end: { x: 850, y: 300 } },
      { start: { x: 1000, y: 600 }, end: { x: 850, y: 500 } },
    ]; // VP = (700, 400) -> f_px = 100 -> raw 3mm -> clamped 24mm

    const t0 = performance.now();
    let solved = solveCameraFromVanishingGuides({
      imageWidth: 1200,
      imageHeight: 800,
      xAxisGuides: ultraWideX,
      zAxisGuides: ultraWideZ,
    });
    for (let i = 0; i < 49; i += 1) {
      solved = solveCameraFromVanishingGuides({
        imageWidth: 1200,
        imageHeight: 800,
        xAxisGuides: ultraWideX,
        zAxisGuides: ultraWideZ,
      });
    }
    const avgMs = (performance.now() - t0) / 50;
    expect(solved.rawFocalLength35mm).toBeLessThan(24);
    expect(solved.focalLength35mm).toBe(24);
    expect(avgMs).toBeLessThan(1.0);
  });

  it("#8 & #9 Focus override in motion smear & unregistered G-buffer depth-band + AO shadow fallback", () => {
    const smear = synthesizeMotionSmearAndSpeedlines({
      previousPose: [{ boneId: "fist", worldPos: [0, 1, 0], screenPos: { x: 100, y: 100 }, radiusPx: 12 }],
      currentPose: [{ boneId: "fist", worldPos: [1, 1, 0], screenPos: { x: 260, y: 100 }, radiusPx: 12 }],
      deltaTimeSec: 1 / 60,
      canvasWidth: 640,
      canvasHeight: 480,
      focusOverride: { x: 320, y: 240 },
    });
    expect(smear.impactCenter).toEqual({ x: 320, y: 240 });
    expect(smear.smearQuads.length).toBeGreaterThan(0);

    // objectRegistry 비어있음 & shadowMask 미제공 -> 깊이 임계치 자동 분류 + 접촉 AO 그림자 자동 추정
    const w = 16;
    const h = 16;
    const rgba = new Uint8ClampedArray(w * h * 4).fill(200);
    const depth = new Float32Array(w * h).fill(12);
    const ids = new Uint32Array(w * h).fill(99);
    for (let y = 4; y < 12; y += 1) {
      for (let x = 4; x < 12; x += 1) {
        depth[y * w + x] = 1.5; // near -> foreground-prop
        ids[y * w + x] = 77;
      }
    }
    const split = split3dGbufferIntoDepthLayers({
      width: w,
      height: h,
      colorRgba: rgba,
      depth,
      objectIds: ids,
      objectRegistry: {},
    });
    expect(split.layers["foreground-prop"].nonTransparentPixels).toBe(64);
    expect(split.layers["mid-furniture"].nonTransparentPixels).toBe(w * h - 64);
    expect(split.totalShadowPixels).toBeGreaterThan(0);
    expect(split.totalLineArtPixels).toBeGreaterThan(0);
  });
});
