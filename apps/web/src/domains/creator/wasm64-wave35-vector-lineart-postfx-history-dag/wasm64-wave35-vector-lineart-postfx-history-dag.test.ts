import { describe, expect, it } from "vitest";

import {
  AdaptivePanelTemplateIndex,
  SemanticHistoryDag,
  applyWebtoonFinishingPostFx,
  blendLinearComicLayers,
  evaluateCentripetalCatmullRomRibbon,
  linearChannelToSrgb,
  linearRgbToOklch,
  oklchToLinearRgbGamutSafe,
  reconcileCrossEngineStrokeDigest,
  scaleStrokeCenterlineTaperPreserving,
  srgbChannelToLinear,
  type ComicRasterLayer,
  type LayerPayloadRef,
  type StrokeControlSample,
} from "./index";

function createSolidRgbaBuffer(w: number, h: number, r: number, g: number, b: number, a: number): Float32Array {
  const buf = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  }
  return buf;
}

function makeLayerRef(layerId: string, contentDigest: string, fill = 1): LayerPayloadRef {
  return { layerId, contentDigest, byteLength: 64, payload: new Uint8Array([fill]) };
}

function countPolylineSelfIntersections(pts: ReadonlyArray<{ readonly x: number; readonly y: number }>): number {
  const cross = (ux: number, uy: number, vx: number, vy: number): number => ux * vy - uy * vx;
  let count = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    for (let j = i + 2; j < pts.length - 1; j += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const c = pts[j];
      const d = pts[j + 1];
      const d1 = cross(d.x - c.x, d.y - c.y, a.x - c.x, a.y - c.y);
      const d2 = cross(d.x - c.x, d.y - c.y, b.x - c.x, b.y - c.y);
      const d3 = cross(b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y);
      const d4 = cross(b.x - a.x, b.y - a.y, d.x - a.x, d.y - a.y);
      if (((d1 > 1e-6 && d2 < -1e-6) || (d1 < -1e-6 && d2 > 1e-6)) &&
          ((d3 > 1e-6 && d4 < -1e-6) || (d3 < -1e-6 && d4 > 1e-6))) {
        count += 1;
      }
    }
  }
  return count;
}

describe("wasm64-wave35-vector-lineart-postfx-history-dag", () => {
  it("1. 구심성 Catmull-Rom(alpha=0.5)은 불균일 현 길이 급회전 구간에서도 루프 자기교차와 첨점을 막는다", () => {
    const unevenControls: readonly StrokeControlSample[] = [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 120, y: 4, pressure: 0.85 },
      { x: 121, y: 6, pressure: 0.9 },
      { x: 10, y: 12, pressure: 0.4 },
    ];
    const centripetal = scaleStrokeCenterlineTaperPreserving(unevenControls, {
      scaleFactor: 4,
      baseHalfWidthPx: 2,
      alpha: 0.5,
      samplesPerSegment: 16,
    });
    expect(countPolylineSelfIntersections(centripetal.samples)).toBe(0);
    expect(centripetal.samples.length).toBeGreaterThan(30);
  });

  it("2. 1x·4x·8x 초해상도 확대 시 시작·중간·끝 필압 테이퍼 비율을 일관되게 보존한다", () => {
    const gPenStroke: readonly StrokeControlSample[] = [
      { x: 10, y: 15, pressure: 0.18 },
      { x: 40, y: 28, pressure: 0.62 },
      { x: 85, y: 34, pressure: 0.96 },
      { x: 130, y: 22, pressure: 0.74 },
      { x: 165, y: 8, pressure: 0.12 },
    ];
    const base1x = scaleStrokeCenterlineTaperPreserving(gPenStroke, { scaleFactor: 1, baseHalfWidthPx: 2.4, samplesPerSegment: 16 });
    const scaled4x = scaleStrokeCenterlineTaperPreserving(gPenStroke, { scaleFactor: 4, baseHalfWidthPx: 2.4, samplesPerSegment: 16 });
    const scaled8x = scaleStrokeCenterlineTaperPreserving(gPenStroke, { scaleFactor: 8, baseHalfWidthPx: 2.4, samplesPerSegment: 16 });

    expect(scaled4x.totalArcLength / base1x.totalArcLength).toBeCloseTo(4, 2);
    expect(scaled8x.totalArcLength / base1x.totalArcLength).toBeCloseTo(8, 2);
    expect(scaled4x.taperRatioStartToMid).toBeCloseTo(base1x.taperRatioStartToMid, 2);
    expect(scaled4x.taperRatioEndToMid).toBeCloseTo(base1x.taperRatioEndToMid, 2);
    expect(scaled8x.taperRatioEndToMid).toBeCloseTo(base1x.taperRatioEndToMid, 2);
  });

  it("3. sourceDpi 대비 targetDpi 비율(150 -> 600 DPI = 4x)로 인쇄용 선화 중심선과 바운딩 박스를 정밀 확대한다", () => {
    const stroke: readonly StrokeControlSample[] = [
      { x: 5, y: 10, pressure: 0.5 },
      { x: 25, y: 30, pressure: 0.8 },
      { x: 55, y: 40, pressure: 0.5 },
    ];
    const ribbon150 = evaluateCentripetalCatmullRomRibbon(stroke, { sourceDpi: 150, targetDpi: 150, baseHalfWidthPx: 1.5 });
    const ribbon600 = evaluateCentripetalCatmullRomRibbon(stroke, { sourceDpi: 150, targetDpi: 600, baseHalfWidthPx: 1.5 });

    expect(ribbon600.effectiveScale).toBe(4);
    const width150 = ribbon150.boundingBox.maxX - ribbon150.boundingBox.minX;
    const width600 = ribbon600.boundingBox.maxX - ribbon600.boundingBox.minX;
    expect(width600 / width150).toBeCloseTo(4, 1);
  });

  it("4. 예각 헤어핀 코너에서 miterLimit 초과 돌출을 차단하고 베벨 조인으로 안전하게 전환한다", () => {
    const sharpHairpin: readonly StrokeControlSample[] = [
      { x: 0, y: 0, pressure: 0.9 },
      { x: 60, y: 0, pressure: 0.95 },
      { x: 4, y: 3, pressure: 0.9 },
    ];
    const ribbon = evaluateCentripetalCatmullRomRibbon(sharpHairpin, {
      scaleFactor: 2,
      baseHalfWidthPx: 3,
      samplesPerSegment: 2,
      miterLimit: 2.5,
    });
    expect(ribbon.bevelFallbackCount).toBeGreaterThan(0);
    expect(ribbon.maxMiterRatioObserved).toBeLessThanOrEqual(2.5);
    expect(ribbon.leftRail.length * 4).toBe(ribbon.triangleStripPositions.length);
  });

  it("5. 0점 및 1점 단일 점 찍기(Dab) 입력에서도 NaN 없이 유효한 리본 기하를 반환한다", () => {
    const emptyRibbon = evaluateCentripetalCatmullRomRibbon([], { scaleFactor: 4, baseHalfWidthPx: 2 });
    expect(emptyRibbon.triangleStripPositions.length).toBe(0);

    const singleDab = evaluateCentripetalCatmullRomRibbon([{ x: 12, y: 18, pressure: 0.75 }], {
      scaleFactor: 4,
      baseHalfWidthPx: 2,
    });
    expect(singleDab.triangleStripPositions.length).toBe(8);
    expect(singleDab.boundingBox.maxX).toBeGreaterThan(singleDab.boundingBox.minX);
  });

  it("6. Canvas2D·WebGPU·익스포트 엔진 간 미세 부동소수점 오차 내에서 동일한 FNV-1a 다이제스트로 동기화된다", () => {
    const stroke: readonly StrokeControlSample[] = [
      { x: 8, y: 12, pressure: 0.3 },
      { x: 36, y: 44, pressure: 0.9 },
      { x: 78, y: 26, pressure: 0.4 },
    ];
    const baseRibbon = evaluateCentripetalCatmullRomRibbon(stroke, { scaleFactor: 4, baseHalfWidthPx: 1.8 });
    const webgpuPositions = new Float32Array(baseRibbon.triangleStripPositions.length);
    for (let i = 0; i < baseRibbon.triangleStripPositions.length; i += 1) {
      webgpuPositions[i] = baseRibbon.triangleStripPositions[i] + 1e-4;
    }

    const report = reconcileCrossEngineStrokeDigest(
      [
        { engine: "canvas2d", ribbon: baseRibbon },
        { engine: "webgpu", ribbon: { ...baseRibbon, triangleStripPositions: webgpuPositions } },
        { engine: "export", ribbon: baseRibbon },
      ],
      1e-2,
    );
    expect(report.isSynchronized).toBe(true);
    expect(report.driftedEngines).toEqual([]);
    expect(report.entries[1].fnv1aHex).toBe(report.referenceDigestHex);
  });

  it("7. 특정 엔진의 스트로크 정점이 이탈하거나 정점 수가 달라지면 드리프트 엔진과 편차를 즉시 검출한다", () => {
    const refRibbon = evaluateCentripetalCatmullRomRibbon(
      [{ x: 0, y: 0, pressure: 0.5 }, { x: 50, y: 20, pressure: 0.8 }],
      { scaleFactor: 2, baseHalfWidthPx: 2 },
    );
    const driftedPositions = new Float32Array(refRibbon.triangleStripPositions);
    driftedPositions[0] += 0.75;

    const report = reconcileCrossEngineStrokeDigest([
      { engine: "canvas2d", ribbon: refRibbon },
      { engine: "webgpu", ribbon: { ...refRibbon, triangleStripPositions: driftedPositions } },
      { engine: "export", ribbon: { ...refRibbon, triangleStripPositions: driftedPositions.subarray(0, 4) } },
    ]);
    expect(report.isSynchronized).toBe(false);
    expect(report.driftedEngines).toEqual(["webgpu", "export"]);
    expect(report.entries[1].maxPositionDeviationPx).toBeCloseTo(0.75, 4);
    expect(report.entries[2].maxPositionDeviationPx).toBe(Number.POSITIVE_INFINITY);
  });

  it("8. sRGB·선형광·OKLCH 정방향 및 색역 안전 역변환이 무손실 왕복 일관성을 만족한다", () => {
    for (const v of [0, 0.02, 0.18, 0.5, 0.88, 1]) {
      expect(linearChannelToSrgb(srgbChannelToLinear(v))).toBeCloseTo(v, 5);
    }
    const skinLinear: readonly [number, number, number] = [0.82, 0.52, 0.4];
    const oklch = linearRgbToOklch(skinLinear[0], skinLinear[1], skinLinear[2]);
    const restored = oklchToLinearRgbGamutSafe(oklch.l, oklch.c, oklch.hDeg);
    expect(restored[0]).toBeCloseTo(skinLinear[0], 4);
    expect(restored[1]).toBeCloseTo(skinLinear[1], 4);
    expect(restored[2]).toBeCloseTo(skinLinear[2], 4);

    const clampedExtreme = oklchToLinearRgbGamutSafe(0.65, 0.48, 38);
    expect(clampedExtreme[0]).toBeGreaterThanOrEqual(0);
    expect(clampedExtreme[0]).toBeLessThanOrEqual(1);
    expect(linearRgbToOklch(clampedExtreme[0], clampedExtreme[1], clampedExtreme[2]).l).toBeCloseTo(0.65, 2);
  });

  it("9. 피부 셀 음영 합성 시 spectral-oklch-shadow-multiply가 단순 sRGB 곱하기의 탁한 회색 채도 저하를 방지한다", () => {
    const peachSkin = createSolidRgbaBuffer(8, 8, 0.96, 0.78, 0.67, 1);
    const coolGrayShadow = createSolidRgbaBuffer(8, 8, 0.58, 0.56, 0.6, 0.85);

    const naiveResult = blendLinearComicLayers(
      [
        { id: "skin", role: "flat-color", blendMode: "normal", opacity: 1, srgbRgba: peachSkin },
        { id: "shadow", role: "shadow", blendMode: "naive-srgb-multiply", opacity: 1, srgbRgba: coolGrayShadow },
      ],
      8,
      8,
    );
    const spectralResult = blendLinearComicLayers(
      [
        { id: "skin", role: "flat-color", blendMode: "normal", opacity: 1, srgbRgba: peachSkin },
        { id: "shadow", role: "shadow", blendMode: "spectral-oklch-shadow-multiply", opacity: 1, srgbRgba: coolGrayShadow },
      ],
      8,
      8,
    );

    expect(spectralResult.meanShadowChromaOklch).toBeGreaterThan(naiveResult.meanShadowChromaOklch * 1.35);
    expect(spectralResult.srgbRgba[0]).toBeLessThan(0.96);
  });

  it("10. 배경·캐릭터·전경 선화 레이어 합성 시 픽셀별 Z-깊이 맵과 먹선 보호 마스크를 정확히 생성한다", () => {
    const w = 6;
    const h = 6;
    const bgBuf = createSolidRgbaBuffer(w, h, 0.25, 0.35, 0.55, 1);
    const lineBuf = new Float32Array(w * h * 4);
    const centerIdx = (3 * w + 3) * 4;
    lineBuf.set([0.02, 0.02, 0.02, 1], centerIdx);

    const blended = blendLinearComicLayers(
      [
        { id: "bg", role: "background", blendMode: "normal", opacity: 1, zDepthMeters: 28, srgbRgba: bgBuf },
        { id: "ink", role: "lineart", blendMode: "normal", opacity: 1, zDepthMeters: 0, srgbRgba: lineBuf },
      ],
      w,
      h,
    );
    expect(blended.zDepthMapMeters[0]).toBeCloseTo(28, 4);
    expect(blended.zDepthMapMeters[3 * w + 3]).toBeCloseTo(0, 4);
    expect(blended.inkProtectionMask[3 * w + 3]).toBeGreaterThan(0.95);
    expect(blended.inkProtectionMask[0]).toBe(0);
  });

  it("11. 소프트 니 HDR 림라이트 블룸이 임계치 이상의 하이라이트만 부드럽게 주변 픽셀로 확산시킨다", () => {
    const w = 9;
    const h = 9;
    const darkBg = createSolidRgbaBuffer(w, h, 0.15, 0.16, 0.2, 1);
    const rimSpot = new Float32Array(w * h * 4);
    rimSpot.set([1, 0.96, 0.85, 1], (4 * w + 4) * 4);

    const composited = blendLinearComicLayers(
      [
        { id: "bg", role: "background", blendMode: "normal", opacity: 1, srgbRgba: darkBg },
        { id: "rim", role: "rim-light", blendMode: "linear-screen-glow", opacity: 1, hdrGain: 1.9, srgbRgba: rimSpot },
      ],
      w,
      h,
    );
    const fx = applyWebtoonFinishingPostFx(composited, {
      bloomThreshold: 0.8,
      bloomSoftKnee: 0.2,
      bloomIntensity: 0.6,
      bloomRadiusPx: 2,
      hazeDensity: 0,
    });

    expect(fx.bloomActivePixelCount).toBe(1);
    expect(fx.bloomExtractedLuminanceMax).toBeGreaterThan(0.8);
    expect(fx.linearRgba[(4 * w + 5) * 4]).toBeGreaterThan(composited.linearRgba[(4 * w + 5) * 4] + 0.02);
    expect(fx.linearRgba[0]).toBeCloseTo(composited.linearRgba[0], 5);
  });

  it("12. Z-깊이 대기 원근 헤이즈가 근경 캐릭터보다 원경 배경 레이어에 더 강한 공기 원근감을 부여한다", () => {
    const darkSlate = createSolidRgbaBuffer(4, 4, 0.12, 0.14, 0.18, 1);
    const nearScene = blendLinearComicLayers(
      [{ id: "fg", role: "flat-color", blendMode: "normal", opacity: 1, zDepthMeters: 1, srgbRgba: darkSlate }],
      4,
      4,
    );
    const farScene = blendLinearComicLayers(
      [{ id: "bg", role: "background", blendMode: "normal", opacity: 1, zDepthMeters: 32, srgbRgba: darkSlate }],
      4,
      4,
    );

    const nearFx = applyWebtoonFinishingPostFx(nearScene, { bloomIntensity: 0, hazeDensity: 0.05, hazeNearStartMeters: 2 });
    const farFx = applyWebtoonFinishingPostFx(farScene, { bloomIntensity: 0, hazeDensity: 0.05, hazeNearStartMeters: 2 });

    expect(nearFx.meanBackgroundHazeFactor).toBe(0);
    expect(farFx.meanBackgroundHazeFactor).toBeGreaterThan(0.7);
    expect(farFx.srgbRgba[2]).toBeGreaterThan(nearFx.srgbRgba[2] + 0.35);
  });

  it("13. 먹선 보호 마스크가 강한 HDR 블룸과 원경 헤이즈 속에서도 흑색 선화 휘도 번짐을 0으로 차단한다", () => {
    const w = 7;
    const h = 7;
    const brightSky = createSolidRgbaBuffer(w, h, 0.95, 0.95, 1, 1);
    const inkLine = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y += 1) inkLine.set([0, 0, 0, 1], (y * w + 3) * 4);

    const layers: readonly ComicRasterLayer[] = [
      { id: "sky", role: "background", blendMode: "normal", opacity: 1, zDepthMeters: 40, hdrGain: 2.2, srgbRgba: brightSky },
      { id: "ink", role: "lineart", blendMode: "normal", opacity: 1, zDepthMeters: 0, srgbRgba: inkLine },
    ];
    const blended = blendLinearComicLayers(layers, w, h);

    const protectedFx = applyWebtoonFinishingPostFx(blended, {
      bloomThreshold: 0.7,
      bloomIntensity: 0.85,
      bloomRadiusPx: 2,
      hazeDensity: 0.08,
      inkProtectionStrength: 1,
    });
    const unprotectedFx = applyWebtoonFinishingPostFx(blended, {
      bloomThreshold: 0.7,
      bloomIntensity: 0.85,
      bloomRadiusPx: 2,
      hazeDensity: 0.08,
      inkProtectionStrength: 0,
    });

    expect(protectedFx.protectedInkPixelCount).toBe(h);
    expect(protectedFx.maxInkLuminanceDrift).toBe(0);
    expect(unprotectedFx.maxInkLuminanceDrift).toBeGreaterThan(0.25);
  });

  it("14. SemanticHistoryDag는 연속 미세 편집을 창작 단계별 마일스톤으로 자동 병합한다", () => {
    const dag = new SemanticHistoryDag({ coalesceWindowMs: 5000 });
    dag.recordMicroEdit({ kind: "stroke-batch", layerId: "ink-1", nextLayerRef: makeLayerRef("ink-1", "s1"), label: "펜선 1", timestampMs: 100 });
    dag.recordMicroEdit({ kind: "stroke-batch", layerId: "ink-1", nextLayerRef: makeLayerRef("ink-1", "s2"), label: "펜선 2", timestampMs: 450 });
    dag.recordMicroEdit({ kind: "color-pass", layerId: "skin-1", nextLayerRef: makeLayerRef("skin-1", "c1"), label: "밑색", timestampMs: 900 });
    dag.recordMicroEdit({ kind: "balloon-layout", layerId: "dlg-1", nextLayerRef: makeLayerRef("dlg-1", "b1"), label: "말풍선", timestampMs: 1200 });
    dag.recordMicroEdit({ kind: "post-fx", layerId: "fx-1", nextLayerRef: makeLayerRef("fx-1", "p1"), label: "역광", timestampMs: 1500 });

    const lineage = dag.listMilestonesOnActiveLineage();
    expect(lineage.map((n) => n.kind)).toEqual(["initial", "stroke-batch", "color-pass", "balloon-layout", "post-fx"]);
    expect(lineage[1].microEditCount).toBe(2);
  });

  it("15. 시간 창(coalesceWindowMs) 초과 시 동일 단계라도 별도 마일스톤으로 분리하고 무변화 레이어는 정제한다", () => {
    const refA = makeLayerRef("ink-1", "hash-a", 9);
    const refB = makeLayerRef("ink-1", "hash-b", 10);

    const dag = new SemanticHistoryDag({ initialLayers: [refA], coalesceWindowMs: 1000 });
    dag.recordMicroEdit({ kind: "stroke-batch", layerId: "ink-1", nextLayerRef: refB, label: "1차 펜터치", timestampMs: 100 });
    dag.recordMicroEdit({ kind: "stroke-batch", layerId: "ink-1", nextLayerRef: refA, label: "원복 펜터치", timestampMs: 300 });
    expect(dag.flushMilestone("제자리 복구 배치")?.layerDeltas.size).toBe(0);

    dag.recordMicroEdit({ kind: "stroke-batch", layerId: "ink-1", nextLayerRef: refB, label: "휴식 후 펜터치", timestampMs: 3000 });
    dag.recordMicroEdit({ kind: "stroke-batch", layerId: "ink-1", nextLayerRef: refA, label: "한참 뒤 수정", timestampMs: 5500 });
    expect(dag.listMilestonesOnActiveLineage()).toHaveLength(4);
  });

  it("16. O(LCA) 브랜치 체크아웃은 루트까지 거슬러 올라가지 않으며 미변경 레이어의 메모리 참조(===)를 그대로 유지한다", () => {
    const heavyBgPayload = new Uint8Array(4096).fill(42);
    const heavyBgRef: LayerPayloadRef = {
      layerId: "bg-castle",
      contentDigest: "castle-v1",
      byteLength: heavyBgPayload.byteLength,
      payload: heavyBgPayload,
    };
    const baseInkRef = makeLayerRef("char-ink", "ink-v0", 1);
    const dag = new SemanticHistoryDag({ initialLayers: [heavyBgRef, baseInkRef] });

    for (let step = 1; step <= 6; step += 1) {
      dag.recordMicroEdit({
        kind: "stroke-batch",
        layerId: "char-ink",
        nextLayerRef: makeLayerRef("char-ink", `ink-trunk-${step}`, step),
        label: `공통 펜선 ${step}`,
        timestampMs: step * 10000,
      });
    }
    const forkNode = dag.flushMilestone();
    expect(forkNode?.nodeId).toBe("ms-6");
    const lcaNodeId = dag.getActiveNodeId();

    dag.createBranch("sunset-mood");
    dag.recordMicroEdit({
      kind: "color-pass",
      layerId: "lighting",
      nextLayerRef: makeLayerRef("lighting", "daylight-v1", 7),
      label: "낮 조명 채색",
      timestampMs: 80000,
    });
    dag.flushMilestone();

    const toSunset = dag.checkout("sunset-mood");
    expect(toSunset.lcaNodeId).toBe(lcaNodeId);
    expect(toSunset.stepsTraversed).toBe(1);

    dag.recordMicroEdit({
      kind: "color-pass",
      layerId: "lighting",
      nextLayerRef: makeLayerRef("lighting", "sunset-v1", 99),
      label: "노을 조명 채색",
      timestampMs: 90000,
    });
    dag.flushMilestone();

    const backToMain = dag.checkout("main");
    expect(backToMain.lcaNodeId).toBe(lcaNodeId);
    expect(backToMain.stepsTraversed).toBe(2);
    expect(backToMain.mutatedLayerIds).toEqual(["lighting"]);
    expect(backToMain.reusedUnchangedLayerCount).toBe(2);
    expect(dag.getLayerRef("bg-castle")).toBe(heavyBgRef);
    expect(dag.getLayerRef("bg-castle")?.payload).toBe(heavyBgPayload);
    expect(dag.getLayerRef("lighting")?.contentDigest).toBe("daylight-v1");
  });

  it("17. diffVariations는 작업 중인 활성 브랜치를 건드리지 않고 두 창작 변주 간 추가·삭제·수정 레이어를 요약한다", () => {
    const baseLayer = makeLayerRef("line-base", "l0", 1);
    const tempGuide = makeLayerRef("draft-guide", "g0", 2);
    const dag = new SemanticHistoryDag({ initialLayers: [baseLayer, tempGuide] });
    dag.createBranch("director-cut");

    dag.recordMicroEdit({ kind: "color-pass", layerId: "line-base", nextLayerRef: makeLayerRef("line-base", "l-main", 3), label: "색트레이스", timestampMs: 1000 });
    dag.flushMilestone();

    dag.checkout("director-cut");
    dag.recordMicroEdit({ kind: "stroke-batch", layerId: "draft-guide", deleted: true, label: "가이드 제거", timestampMs: 2000 });
    dag.recordMicroEdit({ kind: "post-fx", layerId: "rain-fx", nextLayerRef: makeLayerRef("rain-fx", "rain-1", 8), label: "빗줄기 추가", timestampMs: 9000 });
    dag.flushMilestone();

    const diff = dag.diffVariations("main", "director-cut");
    expect(diff.lcaNodeId).toBe("ms-0");
    expect(diff.addedLayerIds).toEqual(["rain-fx"]);
    expect(diff.removedLayerIds).toEqual(["draft-guide"]);
    expect(diff.modifiedLayerIds).toEqual(["line-base"]);
    expect(diff.milestoneCountsByKind["color-pass"]).toBe(1);
    expect(diff.milestoneCountsByKind["stroke-batch"]).toBe(1);
    expect(diff.milestoneCountsByKind["post-fx"]).toBe(1);
    expect(dag.getActiveBranchName()).toBe("director-cut");
  });

  it("18. AdaptivePanelTemplateIndex는 한글 액션 연출 쿼리에서 세로 스크롤 대각선 격돌 3컷 템플릿을 1순위로 랭킹한다", () => {
    const index = new AdaptivePanelTemplateIndex();
    const ranked = index.search({
      genre: "action",
      cutCount: 3,
      aspectRatio: 0.45,
      dramaticBeat: "impact-climax",
      queryText: "대각선 타격 속도선",
      limit: 3,
    });
    expect(ranked[0].template.id).toBe("tpl-action-diagonal-clash-3cut");
    expect(ranked[0].score).toBeGreaterThan(0.95);
    expect(ranked[0].matchedKeywords).toEqual(["대각선", "타격", "속도선"]);
  });

  it("19. 한영 혼합 감정선·클리프행어 검색어에서도 로맨스 클로즈업과 스릴러 반전 풀블리드 템플릿을 정확히 매칭한다", () => {
    const index = new AdaptivePanelTemplateIndex();
    const romanceTop = index.search({
      genre: "romance",
      dramaticBeat: "emotional-close-up",
      queryText: "monologue 눈빛 고백",
      limit: 2,
    });
    expect(romanceTop[0].template.id).toBe("tpl-romance-emotional-closeup-2cut");
    expect(romanceTop[0].matchedKeywords).toContain("monologue");
    expect(romanceTop[0].matchedKeywords).toContain("눈빛");

    const thrillerTop = index.search({ genre: "thriller", cutCount: 1, queryText: "cliffhanger 절단신공", limit: 2 });
    expect(thrillerTop[0].template.id).toBe("tpl-thriller-cliffhanger-reveal-1cut");
  });

  it("20. 사용자 정의 스튜디오 패널 템플릿 등록과 와이드·정방형 판형 화면비 검색을 대칭적으로 지원한다", () => {
    const index = new AdaptivePanelTemplateIndex();
    const initialCount = index.getTemplateCount();
    index.registerTemplate({
      id: "tpl-custom-boss-splash-2cut",
      titleKo: "보스 등장 초광각 스플래시 2컷",
      titleEn: "Boss Entrance Ultrawide Splash 2-Cut",
      genres: ["fantasy", "action"],
      cutCount: 2,
      aspectRatio: 2.35,
      dramaticBeat: "establish",
      scrollGutterRatio: 0.03,
      keywordsKo: ["보스", "초광각", "시네마틱"],
      keywordsEn: ["boss", "ultrawide", "cinematic"],
      slots: [
        { slotId: "s1", x: 0, y: 0, width: 0.72, height: 1 },
        { slotId: "s2", x: 0.74, y: 0, width: 0.26, height: 1 },
      ],
    });
    expect(index.getTemplateCount()).toBe(initialCount + 1);

    const wideHit = index.search({ genre: "fantasy", aspectRatio: 2.35, queryText: "초광각 cinematic", limit: 2 });
    expect(wideHit[0].template.id).toBe("tpl-custom-boss-splash-2cut");

    const squareHit = index.search({ genre: "comedy", aspectRatio: 1, dramaticBeat: "comedic-pause", limit: 2 });
    expect(squareHit[0].template.id).toBe("tpl-comedy-deadpan-pause-3cut");
  });
});
