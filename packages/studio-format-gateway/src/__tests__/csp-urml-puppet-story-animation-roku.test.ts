import { describe, expect, it } from "vitest";

import {
  CSP_CLIP_STUDIO_LAUNCHER_NATIVE_ARCHITECTURE,
  CSP_KOREAN_EDIT_IMAGE_TOOL_TODB_SPEC,
  CSP_URML_SUBSYSTEM_MANIFEST,
  applyCspLayerCompToScene,
  applyCspUrmlAutoPaintColorize,
  computeCspAlignAndDistributeRects,
  computeCspBookbinding3DFlatplanAndSpine,
  computeCspCircularTextGlyphTransforms,
  computeCspOnionSkinFrameStack,
  evaluateCspCamera2DAndTrackLabels,
  evaluateCspDualBrushWetEdgeAndLmsMix,
  evaluateCspUrmlHandCapturePose,
  evaluateCspUrmlPalmDetection,
  generateCspVectorBalloonAndStreamLineGeometry,
  solveCspPuppetTransformMesh,
} from "../csp-urml-puppet-story-animation-roku";

describe("CLIP STUDIO 1.5 Pass 13 Complete Deep Internalization (URML*, Puppet, LayerComp, Anim, .cmc, DualBrush, PWRokuLib)", () => {
  it("evaluates URMLHandCapture 21-joint 3D pose with URFingerAngleLimiter anatomical constraints & URMLPalmDetection", () => {
    expect(CSP_URML_SUBSYSTEM_MANIFEST.rttiClasses).toContain(
      "Planeswalker::Urza::URMLHandCaptureDialogController",
    );
    const pose = evaluateCspUrmlHandCapturePose({
      handSide: "right",
      curl01ByFinger: [0.5, 0.8, 0.4, 0.2, 0.1],
      spread01: 0.75,
      emaAlpha01: 0.8,
    });
    expect(pose.filteredKeypoints21).toHaveLength(21);
    expect(pose.clampedJointAnglesDeg[1]?.dipFlexDeg).toBeCloseTo(
      (pose.clampedJointAnglesDeg[1]?.pipFlexDeg ?? 0) * 0.68,
      1,
    );

    const palm = evaluateCspUrmlPalmDetection({
      contactMajorAxisMm: 34,
      contactMinorAxisMm: 26,
      stylusActive: true,
    });
    expect(palm.isPalmRejected).toBe(true);
    expect(palm.confidence01).toBeGreaterThan(0.7);
  });

  it("colorizes line art via URMLAutoPaintModel in both common-hint and decomposed-tonal modes", () => {
    const lineArt = new Uint8ClampedArray([20, 20, 20, 255, 250, 250, 250, 255]);
    const hints = new Uint8ClampedArray([255, 120, 80, 255, 255, 120, 80, 255]);
    const res = applyCspUrmlAutoPaintColorize(lineArt, hints, 2, 1, {
      mode: "decomposed-tonal",
      lineThreshold01: 0.35,
    });
    expect(res.decomposedLayerNames).toEqual([
      "BaseFlat",
      "ShadowMultiply",
      "HighlightScreen",
      "AmbientTint",
    ]);
    expect(res.compositeRgba[4]).toBeGreaterThan(res.compositeRgba[0] ?? 0);
  });

  it("solves PWPuppetTransformPrecomputeTerms ARAP mesh deformation with ODCDrawElemArray* angle limits", () => {
    const sol = solveCspPuppetTransformMesh({
      vertices: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
      pins: [
        {
          pinId: "root",
          restX: 0,
          restY: 0,
          targetX: 0,
          targetY: 0,
          rotationDeg: 0,
          angleLimitDeg: 30,
        },
        {
          pinId: "tip",
          restX: 50,
          restY: 0,
          targetX: 55,
          targetY: 12,
          rotationDeg: 45,
          angleLimitDeg: 30,
        },
      ],
      meshDensityLevel: 3,
    });
    expect(sol.drawElemArrays).toHaveLength(6);
    expect(sol.maxDisplacementPx).toBeGreaterThan(10);
  });

  it("applies PWLayerCompManager snapshots and computes URAlignDistributeController with VectorCoreLine", () => {
    const comp = applyCspLayerCompToScene({
      compId: "c1",
      compName: "Sunset",
      recordVisibility: true,
      recordPosition: true,
      recordOpacity: true,
      layerStates: [
        { layerId: "L1", visible: true, offsetX: 4, offsetY: -2, opacity01: 0.9 },
        { layerId: "L2", visible: false, offsetX: 0, offsetY: 0, opacity01: 1 },
      ],
    });
    expect(comp.exportFileName).toBe("Comp_Sunset");
    expect(comp.visibleLayerIds).toEqual(["L1"]);

    const aligned = computeCspAlignAndDistributeRects({
      objects: [
        { objectId: "A", x: 10, y: 10, width: 40, height: 20, strokeHalfWidthPx: 3 },
        { objectId: "B", x: 90, y: 30, width: 60, height: 20, strokeHalfWidthPx: 5 },
      ],
      mode: "align-left",
      baseArea: "Canvas",
      baseBounds: { x: 0, y: 0, width: 200, height: 100 },
      useVectorCoreLine: true,
    });
    expect(aligned[0]?.x).toBe(-3);
    expect(aligned[1]?.x).toBe(-5);
  });

  it("computes 2D Cel Animation onion skin stack, Camera2D transform, and .cmc 3D bookbinding flatplan", () => {
    const onion = computeCspOnionSkinFrameStack(3, 10, {
      prevDisplayCount: 2,
      nextDisplayCount: 2,
      startOpacityPercent: 50,
      stepOpacityPercent: 15,
      prevColorHex: "#ef4444",
      nextColorHex: "#22c55e",
      halfColorMode: true,
    });
    expect(onion).toHaveLength(4);

    const cam = evaluateCspCamera2DAndTrackLabels({
      frameIndex: 6,
      startPanX: 0,
      endPanX: 100,
      startZoom: 1,
      endZoom: 2,
      durationFrames: 12,
      trackLabelCommand: "animationaddinvertinbetweentracklabel",
    });
    expect(cam.trackSymbol).toBe("|");
    expect(cam.interpolatedPanX).toBe(50);

    const flatplan = computeCspBookbinding3DFlatplanAndSpine({
      trimWidthMm: 148,
      trimHeightMm: 210,
      bleedMm: 3,
      pageCount: 32,
      paperThicknessPerPageMm: 0.1,
      coverThicknessMm: 0.3,
      bindingDirection: "right-to-left",
      nombrePrefix: "P.",
    });
    expect(flatplan.spineWidthMm).toBeCloseTo(2.2, 2);
    expect(flatplan.spreads[0]?.leftPageNumber).toBe(2);
    expect(flatplan.spreads[0]?.rightPageNumber).toBe(1);

    const geom = generateCspVectorBalloonAndStreamLineGeometry({
      balloonRx: 40,
      balloonRy: 25,
      tailTipX: 12,
      tailTipY: 45,
      tailWidthPx: 10,
      tailCurveKind: "spline",
      streamLineCount: 5,
      streamLengthPx: 80,
      streamLengthDisturb01: 0.25,
    });
    expect(geom.svgBalloonPathD).toContain("Q ");
    expect(geom.streamLineSegments).toHaveLength(5);
  });

  it("evaluates Dual-Brush + Watercolor Wet-Edge + LMS Perceptual Color Mixing + Circular Text + Korean 255 Tools & PWRokuLib", () => {
    const mix = evaluateCspDualBrushWetEdgeAndLmsMix({
      colorAHex: "#facc15",
      colorBHex: "#2563eb",
      mixRatio01: 0.5,
      lmsLinearity01: 0.9,
      primaryAlpha01: 0.85,
      dualAlpha01: 0.8,
      dualCompositeMode: "multiply",
      radialDistance01: 0.88,
      waterEdgeStrength01: 0.8,
      waterEdgeVividness01: 0.6,
    });
    expect(mix.mixedHex).toMatch(/^#[0-9a-f]{6}$/);
    expect(mix.wetEdgeRingMultiplier).toBeGreaterThan(1.5);

    const glyphs = computeCspCircularTextGlyphTransforms({
      text: "CSP",
      radiusPx: 50,
      direction: "clockwise",
    });
    expect(glyphs).toHaveLength(3);

    expect(CSP_KOREAN_EDIT_IMAGE_TOOL_TODB_SPEC.totalToolNodes).toBe(255);
    expect(CSP_KOREAN_EDIT_IMAGE_TOOL_TODB_SPEC.totalVariantColumns).toBe(417);
    expect(CSP_CLIP_STUDIO_LAUNCHER_NATIVE_ARCHITECTURE.pwRokuLibModuleCount).toBe(61);
    expect(CSP_CLIP_STUDIO_LAUNCHER_NATIVE_ARCHITECTURE.triglavPlugInHostInterfaces).toHaveLength(
      13,
    );
  });
});
