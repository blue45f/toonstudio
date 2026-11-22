import { describe, expect, it } from "vitest";

import { createRightsBomRegistry } from "../studio-rights-bom-provenance";

import {
  DEFAULT_SPLAT_LOD_BUDGETS,
  ONDEVICE_LIGHTWEIGHT_MODEL_CATALOG,
  ZERO_SERVER_GPU_COST_KRW,
  applyCanvasCrdtOp,
  applyLocalLayerRemove,
  applyLocalLayerUpsert,
  applyLocalStrokeAdd,
  applyLocalStrokeRemove,
  auditRentalGrantsWithRightsBom,
  buildRightsBomItemFromRentalGrant,
  canonicalSerializeCrdtDocument,
  compareVectorClocks,
  computeComicStageMeterScaleProjection,
  computeEdgeGuidedForegroundMaskLocal,
  computeGaussianCovarianceUpper6,
  computeParallaxFallbackStage,
  createCanvasCrdtDocument,
  createDefaultOnDeviceConsentState,
  createOpfsModelCacheManifest,
  createUnreleasedAssetRentalGrant,
  decodeFloat16,
  detectSpeechBubbleRegionsLocal,
  detectWebXrComicStageCapabilities,
  encodeFloat16,
  evaluateMobileGaussianSplatLodFrame,
  evaluateRentalAssetAction,
  extendRentalGrant,
  materializeCanvasSnapshot,
  mergeCanvasCrdtDocuments,
  packCovariance3DToHalf,
  quantizeDepthToRadixKey,
  renderRentalWatermarkLabel,
  resolveRentalGrantStatus,
  revokeRentalGrantImmediately,
  runOnDeviceAssistTask,
  selectOnDeviceExecutionProvider,
  sweepExpiredRentalGrants,
  unpackCovariance3DFromHalf,
  upsertOpfsCachedModel,
  verifyOpfsModelChecksum,
  type CanvasCrdtOp,
  type GaussianSplatPrimitive,
  type RgbaImageSurface,
  type SplatCameraState,
} from "./index";

function createSolidRgbaSurface(
  width: number,
  height: number,
  rgbaColor: readonly [number, number, number, number],
): RgbaImageSurface {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = rgbaColor[0];
    rgba[i * 4 + 1] = rgbaColor[1];
    rgba[i * 4 + 2] = rgbaColor[2];
    rgba[i * 4 + 3] = rgbaColor[3];
  }
  return { width, height, rgba };
}

function drawFilledRect(
  surface: RgbaImageSurface,
  x0: number,
  y0: number,
  w: number,
  h: number,
  color: readonly [number, number, number, number],
): void {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      if (x < 0 || x >= surface.width || y < 0 || y >= surface.height) continue;
      const off = (y * surface.width + x) * 4;
      surface.rgba[off] = color[0];
      surface.rgba[off + 1] = color[1];
      surface.rgba[off + 2] = color[2];
      surface.rgba[off + 3] = color[3];
    }
  }
}

describe("webxr-comic-stage-preview", () => {
  it("detects WebXR immersive-ar, inline, and insecure/missing fallbacks safely", async () => {
    const insecure = await detectWebXrComicStageCapabilities({
      isSecureContext: false,
      navigatorLike: { xr: { isSessionSupported: async () => true } },
    });
    expect(insecure.recommendedMode).toBe("fallback-2.5d");
    expect(insecure.immersiveArSupported).toBe(false);
    expect(insecure.fallbackReason).toContain("HTTPS");

    const missingApi = await detectWebXrComicStageCapabilities({
      isSecureContext: true,
      navigatorLike: {},
    });
    expect(missingApi.recommendedMode).toBe("fallback-2.5d");
    expect(missingApi.hasXrApi).toBe(false);

    const arReady = await detectWebXrComicStageCapabilities({
      isSecureContext: true,
      navigatorLike: {
        xr: { isSessionSupported: async (mode) => mode === "immersive-ar" || mode === "inline" },
      },
    });
    expect(arReady.recommendedMode).toBe("immersive-ar");
    expect(arReady.fallbackReason).toBeNull();

    const inlineOnly = await detectWebXrComicStageCapabilities({
      isSecureContext: true,
      navigatorLike: {
        xr: { isSessionSupported: async (mode) => mode === "inline" },
      },
    });
    expect(inlineOnly.recommendedMode).toBe("inline");
    expect(inlineOnly.immersiveArSupported).toBe(false);
    expect(inlineOnly.inlineSupported).toBe(true);

    const failingProbe = await detectWebXrComicStageCapabilities({
      isSecureContext: true,
      navigatorLike: {
        xr: {
          isSessionSupported: async () => {
            throw new Error("XR permission denied");
          },
        },
      },
    });
    expect(failingProbe.recommendedMode).toBe("fallback-2.5d");
  });

  it("projects physical meter dimensions accurately and shrinks coverage monotonically with distance", () => {
    const b6Near = computeComicStageMeterScaleProjection({
      presetId: "tankobon-b6",
      canvasWidthPx: 1280,
      canvasHeightPx: 1820,
      viewportWidthPx: 1080,
      viewportHeightPx: 1920,
      viewingDistanceM: 0.45,
    });
    expect(b6Near.fittedWidthM).toBeCloseTo(0.128, 4);
    expect(b6Near.fittedHeightM).toBeCloseTo(0.182, 4);
    expect(b6Near.pixelsPerMeter).toBeCloseTo(10_000, 0);
    expect(b6Near.cornersNdc.every((c) => c.insideFrustum)).toBe(true);

    const b6Far = computeComicStageMeterScaleProjection({
      presetId: "tankobon-b6",
      canvasWidthPx: 1280,
      canvasHeightPx: 1820,
      viewportWidthPx: 1080,
      viewportHeightPx: 1920,
      viewingDistanceM: 1.2,
    });
    expect(b6Far.screenCoverageRatio).toBeLessThan(b6Near.screenCoverageRatio);

    const gallery = computeComicStageMeterScaleProjection({
      presetId: "gallery-wall-panel",
      canvasWidthPx: 1800,
      canvasHeightPx: 900, // 2:1 landscape inside 0.9x1.35 wall panel -> width-constrained
      viewportWidthPx: 1920,
      viewportHeightPx: 1080,
    });
    expect(gallery.fittedWidthM).toBeCloseTo(0.9, 4);
    expect(gallery.fittedHeightM).toBeCloseTo(0.45, 4);
    expect(gallery.target.mountMode).toBe("wall");
  });

  it("computes 2.5D parallax transforms and zeroes motion when reducedMotion is enabled", () => {
    const dynamicStage = computeParallaxFallbackStage({
      tiltX: 0.8,
      tiltY: -0.5,
      viewportWidthPx: 400,
      viewportHeightPx: 800,
      layers: [
        { id: "bg", depthMeters: -0.15 },
        { id: "mid", depthMeters: 0 },
        { id: "fg", depthMeters: 0.2 },
      ],
      maxTiltDeg: 10,
    });
    expect(dynamicStage.mode).toBe("fallback-2.5d");
    expect(dynamicStage.rotateYDeg).toBeCloseTo(8, 3);
    expect(dynamicStage.rotateXDeg).toBeCloseTo(5, 3);
    expect(dynamicStage.layers[0].translateXPx).toBeLessThan(0);
    expect(dynamicStage.layers[1].translateXPx).toBe(0);
    expect(dynamicStage.layers[2].translateXPx).toBeGreaterThan(0);
    expect(dynamicStage.layers[2].scale).toBeGreaterThan(dynamicStage.layers[0].scale);

    const reduced = computeParallaxFallbackStage({
      tiltX: 1,
      tiltY: 1,
      viewportWidthPx: 400,
      viewportHeightPx: 800,
      layers: [{ id: "fg", depthMeters: 0.25 }],
      reducedMotion: true,
    });
    expect(reduced.reducedMotionApplied).toBe(true);
    expect(reduced.rotateXDeg).toBe(0);
    expect(reduced.rotateYDeg).toBe(0);
    expect(reduced.layers[0].translateXPx).toBe(0);
    expect(reduced.layers[0].translateYPx).toBe(0);
    expect(reduced.layers[0].zOffsetPx).toBe(0);
    expect(reduced.layers[0].scale).toBe(1);
  });
});

describe("mobile-gaussian-splat-lod", () => {
  const defaultCamera: SplatCameraState = {
    position: [0, 0, 0],
    forward: [0, 0, -1],
    up: [0, 1, 0],
    fovYRad: (60 * Math.PI) / 180,
    viewportWidthPx: 1080,
    viewportHeightPx: 1920,
  };

  it("packs and unpacks IEEE-754 float16 and preserves 3D covariance trace under rotation", () => {
    for (const sample of [0, -0, 1, -1, 0.25, 0.0005, 12.75, -1024]) {
      const restored = decodeFloat16(encodeFloat16(sample));
      expect(restored).toBeCloseTo(sample, 2);
    }
    expect(decodeFloat16(encodeFloat16(Infinity))).toBe(Infinity);
    expect(Number.isNaN(decodeFloat16(encodeFloat16(Number.NaN)))).toBe(true);

    const scale = [0.2, 0.5, 0.8] as const;
    const covIdentity = computeGaussianCovarianceUpper6(scale, [0, 0, 0, 1]);
    // 45deg rotation around Y axis
    const covRotated = computeGaussianCovarianceUpper6(scale, [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)]);
    const traceIdentity = covIdentity[0] + covIdentity[3] + covIdentity[5];
    const traceRotated = covRotated[0] + covRotated[3] + covRotated[5];
    expect(traceRotated).toBeCloseTo(traceIdentity, 5);

    const packed = packCovariance3DToHalf(covRotated);
    expect(packed.byteLength).toBe(12);
    const unpacked = unpackCovariance3DFromHalf(packed);
    for (let i = 0; i < 6; i += 1) {
      expect(unpacked[i]).toBeCloseTo(covRotated[i], 3);
    }
  });

  it("quantizes depth monotonically with higher near-field precision", () => {
    const kNearA = quantizeDepthToRadixKey(0.2, 0.1, 100);
    const kNearB = quantizeDepthToRadixKey(0.4, 0.1, 100);
    const kFarA = quantizeDepthToRadixKey(50.0, 0.1, 100);
    const kFarB = quantizeDepthToRadixKey(50.2, 0.1, 100);
    expect(kNearB).toBeGreaterThan(kNearA);
    expect(kFarB).toBeGreaterThanOrEqual(kFarA);
    expect(kNearB - kNearA).toBeGreaterThan(kFarB - kFarA);
  });

  it("culls frustum/opacity/micro-splats, enforces LOD budget, and radix-sorts depth accurately", () => {
    const splats: GaussianSplatPrimitive[] = [
      // Behind camera -> frustum culled
      { id: "behind", position: [0, 0, 5], scale: [0.2, 0.2, 0.2], rotationQuat: [0, 0, 0, 1], opacity: 0.9, colorRgb: [1, 0, 0] },
      // Far outside right FOV -> frustum culled
      { id: "offscreen", position: [40, 0, -5], scale: [0.2, 0.2, 0.2], rotationQuat: [0, 0, 0, 1], opacity: 0.9, colorRgb: [1, 0, 0] },
      // Transparent -> opacity culled
      { id: "transparent", position: [0, 0, -3], scale: [0.2, 0.2, 0.2], rotationQuat: [0, 0, 0, 1], opacity: 0.005, colorRgb: [1, 1, 1] },
      // Microscopic distant splat -> screen radius culled
      { id: "tiny", position: [0, 0, -35], scale: [0.001, 0.001, 0.001], rotationQuat: [0, 0, 0, 1], opacity: 0.9, colorRgb: [0, 1, 0] },
    ];

    for (let i = 0; i < 60; i += 1) {
      const z = -(1.2 + i * 0.5);
      splats.push({
        id: `vis-${String(i).padStart(2, "0")}`,
        position: [(i % 5 - 2) * 0.15, (Math.floor(i / 5) % 3 - 1) * 0.15, z],
        scale: [0.08, 0.08, 0.08],
        rotationQuat: [0, 0, 0, 1],
        opacity: 0.85,
        colorRgb: [0.2, 0.5, 0.9],
      });
    }

    const result = evaluateMobileGaussianSplatLodFrame({
      splats,
      camera: defaultCamera,
      budget: { tier: "low-end-mobile", maxActiveSplats: 25 },
      sortOrder: "back-to-front",
    });

    expect(result.budget.tier).toBe("low-end-mobile");
    expect(DEFAULT_SPLAT_LOD_BUDGETS["low-end-mobile"].maxActiveSplats).toBe(35_000);
    expect(result.culledByOpacityCount).toBe(1);
    expect(result.culledByFrustumCount).toBe(2);
    expect(result.culledByScreenRadiusCount).toBe(1);
    expect(result.activeSplats.length).toBe(25);
    expect(result.trimmedByBudgetCount).toBe(35);
    expect(result.packedBuffer.count).toBe(25);
    expect(result.packedBuffer.compressionRatio).toBeLessThan(0.6);

    // Back-to-front: depthKey must be monotonically non-increasing
    for (let i = 1; i < result.activeSplats.length; i += 1) {
      expect(result.activeSplats[i - 1].depthKey).toBeGreaterThanOrEqual(
        result.activeSplats[i].depthKey,
      );
    }

    const frontToBack = evaluateMobileGaussianSplatLodFrame({
      splats,
      camera: defaultCamera,
      budget: { tier: "low-end-mobile", maxActiveSplats: 25 },
      sortOrder: "front-to-back",
    });
    for (let i = 1; i < frontToBack.activeSplats.length; i += 1) {
      expect(frontToBack.activeSplats[i - 1].depthKey).toBeLessThanOrEqual(
        frontToBack.activeSplats[i].depthKey,
      );
    }
  });
});

describe("ondevice-webnn-assist-runtime", () => {
  it("enforces opt-in consent, selects optimal zero-cost provider, and manages OPFS LRU cache", () => {
    const surface = createSolidRgbaSurface(32, 32, [240, 240, 240, 255]);
    const defaultConsent = createDefaultOnDeviceConsentState();
    const blocked = runOnDeviceAssistTask({
      task: "speech-bubble-detect",
      consent: defaultConsent,
      hardware: { hasWebNn: true, webNnDeviceType: "npu", hasWebGpu: true, hasWasmSimd: true },
      cacheManifest: createOpfsModelCacheManifest(),
      surface,
    });
    expect(blocked.status).toBe("opt-in-required");
    expect(blocked.serverGpuCostKrw).toBe(ZERO_SERVER_GPU_COST_KRW);

    expect(
      selectOnDeviceExecutionProvider(
        { hasWebNn: true, webNnDeviceType: "npu", hasWebGpu: true, hasWasmSimd: true },
        "speech-bubble-detect",
      ).provider,
    ).toBe("webnn-npu");

    expect(
      selectOnDeviceExecutionProvider(
        { hasWebNn: false, hasWebGpu: true, hasWasmSimd: true, estimatedVramMb: 128 },
        "foreground-cutout", // requires 512MB VRAM -> falls down to wasm-simd
      ).provider,
    ).toBe("wasm-simd");

    const specBubble = ONDEVICE_LIGHTWEIGHT_MODEL_CATALOG["speech-bubble-detect"];
    const specFg = ONDEVICE_LIGHTWEIGHT_MODEL_CATALOG["foreground-cutout"];
    let manifest = createOpfsModelCacheManifest(10_000_000); // fits one model, forces LRU eviction on second

    const firstEntry = {
      modelId: specBubble.modelId,
      task: specBubble.task,
      version: specBubble.version,
      sizeBytes: specBubble.sizeBytes,
      sha256: specBubble.expectedSha256,
      opfsRelativePath: specBubble.opfsRelativePath,
      cachedAtMs: 1_000,
      lastUsedAtMs: 1_000,
    };
    expect(verifyOpfsModelChecksum(firstEntry)).toBe(true);
    expect(verifyOpfsModelChecksum({ ...firstEntry, sha256: "0000" })).toBe(false);

    const step1 = upsertOpfsCachedModel(manifest, firstEntry);
    manifest = step1.manifest;
    expect(step1.evictedModelIds).toEqual([]);

    const step2 = upsertOpfsCachedModel(manifest, {
      modelId: specFg.modelId,
      task: specFg.task,
      version: specFg.version,
      sizeBytes: specFg.sizeBytes,
      sha256: specFg.expectedSha256,
      opfsRelativePath: specFg.opfsRelativePath,
      cachedAtMs: 2_000,
      lastUsedAtMs: 2_000,
    });
    expect(step2.evictedModelIds).toEqual([specBubble.modelId]);
    expect(step2.manifest.totalBytes).toBe(specFg.sizeBytes);
  });

  it("detects ink-outlined speech bubbles and extracts edge-guided foreground masks deterministically", () => {
    // 1. Speech bubble detection: mid-gray comic panel + 2 black-outlined white speech bubbles + open white corner
    const panel = createSolidRgbaSurface(80, 60, [150, 150, 150, 255]);
    // Open white margin touching top-left border (must NOT be detected as bubble)
    drawFilledRect(panel, 0, 0, 12, 12, [255, 255, 255, 255]);
    // Bubble 1: black border + white interior
    drawFilledRect(panel, 10, 14, 24, 16, [15, 15, 15, 255]);
    drawFilledRect(panel, 12, 16, 20, 12, [252, 252, 252, 255]);
    // Bubble 2: black border + white interior
    drawFilledRect(panel, 44, 26, 26, 18, [10, 10, 10, 255]);
    drawFilledRect(panel, 46, 28, 22, 14, [250, 250, 250, 255]);

    const bubbles = detectSpeechBubbleRegionsLocal(panel, { minAreaPx: 40 });
    expect(bubbles.length).toBe(2);
    expect(bubbles[0].bounds).toEqual({ x: 12, y: 16, width: 20, height: 12 });
    expect(bubbles[1].bounds).toEqual({ x: 46, y: 28, width: 22, height: 14 });
    expect(bubbles[0].inkEnclosureRatio).toBeGreaterThan(0.9);

    // 2. Foreground cutout mask: light studio backdrop + centered dark-outlined character with white shirt interior
    const portrait = createSolidRgbaSurface(64, 64, [238, 240, 242, 255]);
    drawFilledRect(portrait, 20, 14, 24, 36, [25, 25, 30, 255]);
    drawFilledRect(portrait, 22, 16, 20, 32, [238, 240, 242, 255]); // same color as background, protected by ink outline!

    const cutout = computeEdgeGuidedForegroundMaskLocal(portrait, { featherBoundary: true });
    expect(cutout.boundingBox).toEqual({ x: 20, y: 14, width: 24, height: 36 });
    expect(cutout.alphaMask[0]).toBe(0); // corner is background
    expect(cutout.alphaMask[32 * 64 + 32]).toBe(255); // interior white shirt stays solid foreground
    expect(cutout.alphaMask[14 * 64 + 20]).toBe(192); // outer boundary feathered
    expect(cutout.foregroundPixelCount).toBe(24 * 36);

    const optInRun = runOnDeviceAssistTask({
      task: "foreground-cutout",
      consent: {
        optedIn: true,
        consentedAtMs: 1000,
        allowOpfsModelCache: true,
        allowNetworkModelDownload: false,
      },
      hardware: { hasWebNn: false, hasWebGpu: false, hasWasmSimd: false },
      cacheManifest: createOpfsModelCacheManifest(),
      surface: portrait,
    });
    expect(optInRun.status).toBe("completed");
    if (optInRun.status === "completed" && optInRun.task === "foreground-cutout") {
      expect(optInRun.usedDeterministicFallback).toBe(true);
      expect(optInRun.mask.boundingBox).toEqual({ x: 20, y: 14, width: 24, height: 36 });
    }
  });
});

describe("realtime-canvas-crdt-resolver", () => {
  it("guarantees commutativity, associativity, idempotence, and per-field lossless merge", () => {
    const base = createCanvasCrdtDocument("ep-01-canvas");
    const initLayer = applyLocalLayerUpsert(
      base,
      "alice",
      { layerId: "layer-ink", name: "선화", opacity: 1, visible: true, blendMode: "normal", zOrderKey: 10 },
      1_000,
    ).document;

    // Concurrent edits on 3 replicas without syncing
    const aliceA = applyLocalLayerUpsert(
      initLayer,
      "alice",
      { layerId: "layer-ink", name: "주선화(최종)" },
      2_000,
    ).document;
    const aliceDoc = applyLocalStrokeAdd(
      aliceA,
      "alice",
      {
        strokeId: "stroke-a1",
        layerId: "layer-ink",
        brushId: "g-pen",
        colorHex: "#111111",
        widthPx: 3,
        opacity: 1,
        points: [{ x: 10, y: 10, pressure: 0.8 }, { x: 40, y: 25, pressure: 0.7 }],
      },
      2_050,
    ).document;

    const bobA = applyLocalLayerUpsert(
      initLayer,
      "bob",
      { layerId: "layer-ink", opacity: 0.72, blendMode: "multiply" },
      2_000, // exact same lamport & wallClockMs as alice's rename!
    ).document;
    const bobDoc = applyLocalStrokeAdd(
      bobA,
      "bob",
      {
        strokeId: "stroke-b1",
        layerId: "layer-ink",
        brushId: "pencil",
        colorHex: "#222244",
        widthPx: 2,
        opacity: 0.9,
        points: [{ x: 50, y: 60, pressure: 0.5 }],
      },
      2_040,
    ).document;

    const charlieA = applyLocalLayerUpsert(
      initLayer,
      "charlie",
      { layerId: "layer-tone", name: "스크린톤", opacity: 0.5, zOrderKey: 5 },
      2_010,
    ).document;
    const charlieDoc = applyLocalStrokeAdd(
      charlieA,
      "charlie",
      {
        strokeId: "stroke-c1",
        layerId: "layer-tone",
        brushId: "tone-dot",
        colorHex: "#888888",
        widthPx: 12,
        opacity: 0.5,
        points: [{ x: 100, y: 100, pressure: 1 }],
      },
      2_060,
    ).document;

    expect(compareVectorClocks(aliceDoc.vectorClock, bobDoc.vectorClock)).toBe("concurrent");

    // 1. Commutativity: merge(A, B) === merge(B, A)
    const ab = mergeCanvasCrdtDocuments(aliceDoc, bobDoc).document;
    const ba = mergeCanvasCrdtDocuments(bobDoc, aliceDoc).document;
    expect(canonicalSerializeCrdtDocument(ab)).toBe(canonicalSerializeCrdtDocument(ba));

    // Per-field LWW preserved BOTH alice's rename and bob's opacity+blendMode!
    const snapAb = materializeCanvasSnapshot(ab);
    expect(snapAb.layers[0].name).toBe("주선화(최종)");
    expect(snapAb.layers[0].opacity).toBeCloseTo(0.72, 4);
    expect(snapAb.layers[0].blendMode).toBe("multiply");
    expect(snapAb.strokes.map((s) => s.strokeId).sort()).toEqual(["stroke-a1", "stroke-b1"]);

    // 2. Associativity: merge(merge(A, B), C) === merge(A, merge(B, C))
    const abThenC = mergeCanvasCrdtDocuments(ab, charlieDoc).document;
    const bc = mergeCanvasCrdtDocuments(bobDoc, charlieDoc).document;
    const aThenBc = mergeCanvasCrdtDocuments(aliceDoc, bc).document;
    expect(canonicalSerializeCrdtDocument(abThenC)).toBe(canonicalSerializeCrdtDocument(aThenBc));

    // 3. Idempotence: merge(X, X) === X
    const idem = mergeCanvasCrdtDocuments(abThenC, abThenC).document;
    expect(canonicalSerializeCrdtDocument(idem)).toBe(canonicalSerializeCrdtDocument(abThenC));

    // 4. Out-of-order & duplicate operation delivery converges identically
    const ops: CanvasCrdtOp[] = [];
    let d1 = createCanvasCrdtDocument("ep-ops");
    const op1 = applyLocalLayerUpsert(d1, "alice", { layerId: "l1", name: "배경", zOrderKey: 1 }, 100);
    d1 = op1.document;
    ops.push(op1.op);
    const op2 = applyLocalStrokeAdd(
      d1,
      "alice",
      { strokeId: "s1", layerId: "l1", brushId: "pen", colorHex: "#000", widthPx: 2, opacity: 1, points: [{ x: 1, y: 2, pressure: 0.5 }] },
      110,
    );
    d1 = op2.document;
    ops.push(op2.op);
    const op3 = applyLocalStrokeRemove(d1, "bob", "s1", 120);
    ops.push(op3.op);
    const op4 = applyLocalLayerRemove(d1, "charlie", "l1", 130);
    ops.push(op4.op);

    const forwardApplied = ops.reduce(applyCanvasCrdtOp, createCanvasCrdtDocument("ep-ops"));
    const reverseWithDupes = [...ops].reverse().concat(ops).reduce(
      applyCanvasCrdtOp,
      createCanvasCrdtDocument("ep-ops"),
    );
    expect(canonicalSerializeCrdtDocument(reverseWithDupes)).toBe(
      canonicalSerializeCrdtDocument(forwardApplied),
    );
    expect(materializeCanvasSnapshot(forwardApplied).layers).toHaveLength(0);
    expect(materializeCanvasSnapshot(forwardApplied).strokes).toHaveLength(0);
  });
});

describe("unreleased-asset-rental-policy", () => {
  const DAY = 86_400_000;
  const issuedAt = Date.UTC(2026, 10, 1, 0, 0, 0);

  it("enforces time windows, download restrictions, watermarks, revocation, and Rights BOM auditing", () => {
    // Reject invalid duration > 90 days
    expect(() =>
      createUnreleasedAssetRentalGrant({
        grantId: "rent-bad",
        assetId: "bg-castle-v0",
        assetName: "미공개 성채 3D 배경",
        category: "background-3d",
        ownerCreatorId: "creator-1",
        ownerCreatorName: "김작가",
        assistantId: "asst-1",
        assistantName: "이어시",
        episodeId: "ep-14",
        issuedAtMs: issuedAt,
        expiresAtMs: issuedAt + 120 * DAY,
      }),
    ).toThrow();

    const grant = createUnreleasedAssetRentalGrant({
      grantId: "rent-001",
      assetId: "bg-castle-v0",
      assetName: "미공개 성채 3D 배경",
      category: "background-3d",
      ownerCreatorId: "creator-1",
      ownerCreatorName: "김작가",
      assistantId: "asst-1",
      assistantName: "이어시",
      episodeId: "ep-14",
      issuedAtMs: issuedAt,
      startsAtMs: issuedAt + 1 * DAY,
      expiresAtMs: issuedAt + 15 * DAY,
    });

    expect(resolveRentalGrantStatus(grant, issuedAt)).toBe("pending");
    expect(resolveRentalGrantStatus(grant, issuedAt + 2 * DAY)).toBe("active");
    expect(resolveRentalGrantStatus(grant, issuedAt + 15 * DAY)).toBe("expired");
    expect(renderRentalWatermarkLabel(grant)).toContain("이어시");
    expect(renderRentalWatermarkLabel(grant)).toContain("rent-001");

    const nowActive = issuedAt + 5 * DAY;
    const renderDecision = evaluateRentalAssetAction(grant, {
      action: "render-episode-panel",
      assistantId: "asst-1",
      episodeId: "ep-14",
      nowMs: nowActive,
      activeDeviceCount: 2,
    });
    expect(renderDecision.allowed).toBe(true);
    expect(renderDecision.code).toBe("ALLOWED");
    expect(renderDecision.requiresImmediateCachePurge).toBe(false);

    // Raw source download & third-party transfer blocked by default
    const downloadDecision = evaluateRentalAssetAction(grant, {
      action: "download-raw-source",
      assistantId: "asst-1",
      episodeId: "ep-14",
      nowMs: nowActive,
    });
    expect(downloadDecision.allowed).toBe(false);
    expect(downloadDecision.code).toBe("RAW_DOWNLOAD_FORBIDDEN");

    const wrongEpisode = evaluateRentalAssetAction(grant, {
      action: "preview-in-canvas",
      assistantId: "asst-1",
      episodeId: "ep-99",
      nowMs: nowActive,
    });
    expect(wrongEpisode.allowed).toBe(false);
    expect(wrongEpisode.code).toBe("EPISODE_SCOPE_MISMATCH");

    // Extend active grant succeeds
    const extended = extendRentalGrant(grant, {
      newExpiresAtMs: issuedAt + 30 * DAY,
      extendedBy: "creator-1",
      nowMs: nowActive,
    });
    expect(extended.expiresAtMs).toBe(issuedAt + 30 * DAY);

    // Instant revocation blocks immediately and forces local cache purge
    const revoked = revokeRentalGrantImmediately(extended, {
      revokedBy: "creator-1",
      reason: "회차 외주 계약 종료",
      nowMs: nowActive + 1_000,
    });
    expect(resolveRentalGrantStatus(revoked, nowActive + 1_000)).toBe("revoked");
    const afterRevoke = evaluateRentalAssetAction(revoked, {
      action: "preview-in-canvas",
      assistantId: "asst-1",
      episodeId: "ep-14",
      nowMs: nowActive + 2_000,
    });
    expect(afterRevoke.allowed).toBe(false);
    expect(afterRevoke.code).toBe("GRANT_REVOKED");
    expect(afterRevoke.requiresImmediateCachePurge).toBe(true);

    // Revoked grant cannot be silently resurrected via extension
    expect(() =>
      extendRentalGrant(revoked, {
        newExpiresAtMs: issuedAt + 40 * DAY,
        extendedBy: "creator-1",
        nowMs: nowActive + 3_000,
      }),
    ).toThrow();

    // Sweep & Rights BOM integration
    const sweep = sweepExpiredRentalGrants([grant, revoked], issuedAt + 20 * DAY);
    expect(sweep.expired).toHaveLength(1);
    expect(sweep.revoked).toHaveLength(1);
    expect(sweep.cachePurgeAssetIds).toEqual(["bg-castle-v0"]);

    const bomItem = buildRightsBomItemFromRentalGrant(revoked);
    expect(bomItem.permissions.allowCommercialUse).toBe(false);
    expect(bomItem.expiresAtMs).toBe(nowActive + 1_000);

    const baseBom = createRightsBomRegistry({ id: "bom-ep14", episodeId: "ep-14" });
    const audit = auditRentalGrantsWithRightsBom({
      baseRegistry: baseBom,
      grants: [revoked],
      nowMs: nowActive + 2_000,
      isCommercialPublish: true,
    });
    expect(audit.hasBlockingViolations).toBe(true);
    expect(audit.revokedGrantIds).toEqual(["rent-001"]);
    expect(audit.bomDiagnostics.some((d) => d.code === "LICENSE_EXPIRED")).toBe(true);
    expect(audit.bomDiagnostics.some((d) => d.code === "COMMERCIAL_USE_FORBIDDEN")).toBe(true);
  });
});
