import { describe, expect, it } from "vitest";
import {
  MAX_FINITE_CURVATURE_RADIUS_PX,
  PATTERN_RIBBON_PRESET_IDS,
  auditRibbonMeshTopology,
  buildArcLengthRibbonWgsl,
  cleanRawStrokePointerSamples,
  compareNaiveVsGuardedRibbon,
  escapeSvgXml,
  getPatternRibbonPreset,
  listPatternRibbonPresets,
  renderPatternRibbonBrushSvg,
  reparameterizeStrokeByArcLength,
  summarizePatternRibbonBrushKo,
  synthesizePatternRibbonBrush,
  validateArcLengthRibbonWgsl,
  vec2Cross,
  vec2Dot,
  vec2Length,
  type PatternRibbonPresetId,
  type RawStrokePointerSample,
  type RibbonCapStyle,
} from "./index";

function makeUnevenSpeedStroke(): RawStrokePointerSample[] {
  // 초반 2px 간격(느린 필기) -> 중반 12px -> 후반 40px 간격(빠른 스와이프) + 완만한 곡선
  const pts: RawStrokePointerSample[] = [];
  let x = 0;
  for (let i = 0; i <= 30; i += 1) {
    pts.push({ x, y: Math.sin(x * 0.015) * 18, pressure: 0.45 + 0.01 * i, timestampMs: i * 8 });
    x += 2;
  }
  for (let i = 0; i < 10; i += 1) {
    x += 12;
    pts.push({ x, y: Math.sin(x * 0.015) * 18, pressure: 0.7, timestampMs: 300 + i * 8 });
  }
  for (let i = 0; i < 6; i += 1) {
    x += 40;
    pts.push({ x, y: Math.sin(x * 0.015) * 18, pressure: 0.85, timestampMs: 420 + i * 8 });
  }
  return pts;
}

function makeCircularArcStroke(radiusPx: number, sweepRad: number, segments: number): RawStrokePointerSample[] {
  const pts: RawStrokePointerSample[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const theta = (sweepRad * i) / segments;
    pts.push({
      x: Math.cos(theta) * radiusPx,
      y: Math.sin(theta) * radiusPx,
      pressure: 0.6,
    });
  }
  return pts;
}

function makeSCurveStroke(): RawStrokePointerSample[] {
  const pts: RawStrokePointerSample[] = [];
  for (let i = 0; i <= 48; i += 1) {
    const x = i * 8;
    const y = Math.sin((i / 48) * Math.PI * 2) * 54;
    pts.push({ x, y, pressure: 0.55 });
  }
  return pts;
}

function makeSharpCornerStroke(turnAngleDeg: number, legLengthPx = 120): RawStrokePointerSample[] {
  const rad = (turnAngleDeg * Math.PI) / 180;
  return [
    { x: 0, y: 0, pressure: 0.65 },
    { x: legLengthPx, y: 0, pressure: 0.7 },
    {
      x: legLengthPx + Math.cos(rad) * legLengthPx,
      y: Math.sin(rad) * legLengthPx,
      pressure: 0.65,
    },
  ];
}

function makeTightUTurnStroke(gapPx = 18): RawStrokePointerSample[] {
  const radius = gapPx * 0.5;
  const pts: RawStrokePointerSample[] = [
    { x: 0, y: 0, pressure: 0.65 },
    { x: 55, y: 0, pressure: 0.65 },
    { x: 110, y: 0, pressure: 0.7 },
  ];
  for (let k = 1; k <= 7; k += 1) {
    const ang = -Math.PI * 0.5 + (Math.PI * k) / 8;
    pts.push({
      x: 110 + Math.cos(ang) * radius,
      y: radius + Math.sin(ang) * radius,
      pressure: 0.7,
    });
  }
  pts.push({ x: 110, y: gapPx, pressure: 0.7 });
  pts.push({ x: 55, y: gapPx, pressure: 0.65 });
  pts.push({ x: 0, y: gapPx, pressure: 0.65 });
  return pts;
}

function makeSpiralStroke(): RawStrokePointerSample[] {
  const pts: RawStrokePointerSample[] = [];
  for (let i = 0; i <= 72; i += 1) {
    const theta = i * 0.22;
    const radius = 14 + i * 1.65;
    pts.push({
      x: Math.cos(theta) * radius,
      y: Math.sin(theta) * radius,
      pressure: 0.4 + 0.5 * (i / 72),
    });
  }
  return pts;
}

function makeZigZagStroke(): RawStrokePointerSample[] {
  return [
    { x: 0, y: 0, pressure: 0.6 },
    { x: 70, y: 0, pressure: 0.7 },
    { x: 25, y: 42, pressure: 0.75 },
    { x: 95, y: 48, pressure: 0.7 },
    { x: 40, y: 95, pressure: 0.65 },
    { x: 120, y: 100, pressure: 0.6 },
  ];
}

describe("Wave 116 — Arc-Length Reparameterization & Frenet/Bishop Frame Solver", () => {
  it("유지한다: 2px->40px 속도 급변 입력에서도 타일 반복 길이 오차를 ±1% 이내로 보장한다", () => {
    const raw = makeUnevenSpeedStroke();
    const result = reparameterizeStrokeByArcLength(raw, {
      tileRepeatLengthPx: 28,
      subdivisionsPerTile: 4,
    });

    expect(result.totalLengthPx).toBeGreaterThan(360);
    expect(result.tileUniformity.fullTileCount).toBeGreaterThanOrEqual(12);
    expect(result.tileUniformity.maxRelativeErrorRatio).toBeLessThan(0.01);
    expect(result.tileUniformity.withinOnePercent).toBe(true);
    for (const tileLen of result.tileUniformity.measuredTileLengthsPx) {
      expect(Math.abs(tileLen - 28) / 28).toBeLessThan(0.01);
    }
  });

  it("정제한다: 중복 포인터, 초근접 점, NaN/Infinity 좌표를 안전하게 제거한다", () => {
    const dirty: RawStrokePointerSample[] = [
      { x: Number.NaN, y: 10, pressure: 0.5 },
      { x: 0, y: 0, pressure: 0.5 },
      { x: 0, y: 0, pressure: 0.5 },
      { x: 0.01, y: 0.01, pressure: 0.6 },
      { x: 40, y: 0, pressure: Number.POSITIVE_INFINITY },
      { x: Number.POSITIVE_INFINITY, y: 5 },
      { x: 100, y: 0, pressure: -3 },
    ];
    const cleaned = cleanRawStrokePointerSamples(dirty, 0.05);
    expect(cleaned).toHaveLength(3);
    expect(cleaned[cleaned.length - 1].cumulativeArcLengthPx).toBeCloseTo(100, 4);

    const reparam = reparameterizeStrokeByArcLength(dirty, { tileRepeatLengthPx: 20 });
    expect(reparam.droppedSampleCount).toBe(4);
    for (const s of reparam.samples) {
      expect(Number.isFinite(s.position.x)).toBe(true);
      expect(Number.isFinite(s.position.y)).toBe(true);
      expect(Number.isFinite(s.signedCurvature)).toBe(true);
      expect(s.pressure).toBeGreaterThanOrEqual(0.05);
      expect(s.pressure).toBeLessThanOrEqual(1);
    }
  });

  it("처리한다: 빈 입력, 1점 입력, 동일 좌표 점군을 NaN 없이 안전 처리한다", () => {
    const empty = reparameterizeStrokeByArcLength([]);
    expect(empty.samples).toHaveLength(0);
    expect(empty.totalLengthPx).toBe(0);

    const single = reparameterizeStrokeByArcLength([{ x: 15, y: 25, pressure: 0.8 }]);
    expect(single.samples).toHaveLength(1);
    expect(single.samples[0].curvatureRadiusPx).toBe(MAX_FINITE_CURVATURE_RADIUS_PX);

    const coincident = reparameterizeStrokeByArcLength([
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 10 },
    ]);
    expect(coincident.samples).toHaveLength(1);
    expect(coincident.totalLengthPx).toBe(0);
  });

  it("직교성: 모든 아크-길이 샘플의 T(s), N(s)는 단위 직교 오른손 프레임을 유지한다", () => {
    const reparam = reparameterizeStrokeByArcLength(makeSCurveStroke(), { tileRepeatLengthPx: 30 });
    expect(reparam.samples.length).toBeGreaterThan(20);
    for (const s of reparam.samples) {
      expect(vec2Length(s.tangent)).toBeCloseTo(1, 5);
      expect(vec2Length(s.normal)).toBeCloseTo(1, 5);
      expect(vec2Dot(s.tangent, s.normal)).toBeCloseTo(0, 5);
      expect(vec2Cross(s.tangent, s.normal)).toBeCloseTo(1, 5);
    }
  });

  it("정확도: 반지름 80px 원호에서 부호 있는 곡률 κ(s)가 +1/80에 정밀 수렴한다", () => {
    const arc = makeCircularArcStroke(80, Math.PI * 0.75, 48);
    const reparam = reparameterizeStrokeByArcLength(arc, { tileRepeatLengthPx: 24, subdivisionsPerTile: 4 });
    const interior = reparam.samples.slice(3, -3);
    expect(interior.length).toBeGreaterThan(5);
    for (const s of interior) {
      expect(s.signedCurvature).toBeGreaterThan(0);
      expect(Math.abs(s.signedCurvature - 1 / 80) / (1 / 80)).toBeLessThan(0.02);
      expect(Math.abs(s.curvatureRadiusPx - 80)).toBeLessThan(2);
    }
  });

  it("연속성: S자 곡선 변곡점에서 κ 부호가 반전되어도 2D 비숍 법선 N(s)은 뒤집히지 않는다", () => {
    const reparam = reparameterizeStrokeByArcLength(makeSCurveStroke(), { tileRepeatLengthPx: 28 });
    let sawPositive = false;
    let sawNegative = false;
    for (let i = 1; i < reparam.samples.length; i += 1) {
      const prev = reparam.samples[i - 1];
      const cur = reparam.samples[i];
      if (cur.signedCurvature > 0.002) sawPositive = true;
      if (cur.signedCurvature < -0.002) sawNegative = true;
      expect(vec2Dot(prev.normal, cur.normal)).toBeGreaterThan(0.85);
    }
    expect(sawPositive).toBe(true);
    expect(sawNegative).toBe(true);
  });

  it("보존한다: 90도 급회전 꼭짓점을 코너 앵커로 등록해 호 길이 손실을 막는다", () => {
    const corner = makeSharpCornerStroke(90, 120);
    const reparam = reparameterizeStrokeByArcLength(corner, { tileRepeatLengthPx: 24 });
    expect(reparam.cornerAnchorIndices.length).toBeGreaterThanOrEqual(1);
    expect(reparam.totalLengthPx).toBeCloseTo(240, 1);
    expect(reparam.tileUniformity.withinOnePercent).toBe(true);
  });
});

describe("Wave 116 — Zero Inner-Edge Foldover Miter/Bevel Guard & 5 Presets", () => {
  it("90도 급커브: Naive는 접힘/교차가 발생하지만 Guarded는 자기교차 0건·음수면적 0건을 보장한다", () => {
    const cmp = compareNaiveVsGuardedRibbon(makeSharpCornerStroke(90, 110), {
      presetId: "korean-dancheong-border",
      ribbonWidthPx: 34,
      tileRepeatLengthPx: 26,
    });

    expect(cmp.naiveTotalDefects).toBeGreaterThan(0);
    expect(cmp.guarded.topologyAudit.selfIntersectionCount).toBe(0);
    expect(cmp.guarded.topologyAudit.invertedQuadCount).toBe(0);
    expect(cmp.guardedTotalDefects).toBe(0);
    expect(cmp.foldoverEliminated).toBe(true);
    expect(cmp.bevelInsertedStations).toBeGreaterThan(0);
    expect(cmp.innerClampedStations).toBeGreaterThan(0);
  });

  it("135도 예각 급커브: Naive는 심각한 보우타이/교차가 발생하지만 Guarded는 결함 0건이다", () => {
    const cmp = compareNaiveVsGuardedRibbon(makeSharpCornerStroke(135, 110), {
      presetId: "chain-link",
      ribbonWidthPx: 32,
      tileRepeatLengthPx: 24,
    });

    expect(cmp.naiveTotalDefects).toBeGreaterThan(0);
    expect(cmp.guarded.topologyAudit.selfIntersectionCount).toBe(0);
    expect(cmp.guarded.topologyAudit.invertedQuadCount).toBe(0);
    expect(cmp.guardedDefectFree).toBe(true);
    expect(cmp.foldoverEliminated).toBe(true);
  });

  it("U-턴 180도 급반전(좁은 간격): Naive는 대향 내측이 충돌하지만 Guarded는 결함 0건이다", () => {
    const cmp = compareNaiveVsGuardedRibbon(makeTightUTurnStroke(18), {
      presetId: "gothic-lace",
      ribbonWidthPx: 30,
      tileRepeatLengthPx: 24,
    });

    expect(cmp.naiveTotalDefects).toBeGreaterThan(0);
    expect(cmp.guarded.topologyAudit.selfIntersectionCount).toBe(0);
    expect(cmp.guarded.topologyAudit.invertedQuadCount).toBe(0);
    expect(cmp.guardedDefectFree).toBe(true);
  });

  it("초급격 172도 헤어핀 꺾임에서도 Guarded 리본은 자기교차·음수면적 0건을 유지한다", () => {
    const cmp = compareNaiveVsGuardedRibbon(makeSharpCornerStroke(172, 100), {
      presetId: "architectural-balustrade",
      ribbonWidthPx: 32,
      tileRepeatLengthPx: 24,
    });

    expect(cmp.naiveTotalDefects).toBeGreaterThan(0);
    expect(cmp.guarded.topologyAudit.selfIntersectionCount).toBe(0);
    expect(cmp.guarded.topologyAudit.invertedQuadCount).toBe(0);
    expect(cmp.guarded.topologyAudit.nonFiniteCoordinateCount).toBe(0);
  });

  it("우회전(-135도) 대칭 급커브에서도 우측 내측 클램핑이 동작해 결함 0건을 보장한다", () => {
    const cmp = compareNaiveVsGuardedRibbon(makeSharpCornerStroke(-135, 110), {
      presetId: "botanical-vine",
      ribbonWidthPx: 30,
      tileRepeatLengthPx: 26,
    });

    expect(cmp.naiveTotalDefects).toBeGreaterThan(0);
    expect(cmp.guarded.topologyAudit.selfIntersectionCount).toBe(0);
    expect(cmp.guarded.topologyAudit.invertedQuadCount).toBe(0);
    expect(cmp.guardedDefectFree).toBe(true);
  });

  it("밀집 나선(Spiral) 스트로크에서 비인접 스파인 거리장 가드가 충돌 0건을 유지한다", () => {
    const res = synthesizePatternRibbonBrush(makeSpiralStroke(), {
      presetId: "botanical-vine",
      ribbonWidthPx: 24,
      tileRepeatLengthPx: 24,
    });

    expect(res.quads.length).toBeGreaterThan(30);
    expect(res.topologyAudit.selfIntersectionCount).toBe(0);
    expect(res.topologyAudit.invertedQuadCount).toBe(0);
    expect(res.topologyAudit.foldoverFree).toBe(true);
  });

  it("연속 급지그재그(Zig-Zag) 스트로크에서도 자기교차 0건·음수면적 0건을 유지한다", () => {
    const cmp = compareNaiveVsGuardedRibbon(makeZigZagStroke(), {
      presetId: "korean-dancheong-border",
      ribbonWidthPx: 28,
      tileRepeatLengthPx: 22,
    });

    expect(cmp.naiveTotalDefects).toBeGreaterThan(0);
    expect(cmp.guarded.topologyAudit.selfIntersectionCount).toBe(0);
    expect(cmp.guarded.topologyAudit.invertedQuadCount).toBe(0);
    expect(cmp.guardedDefectFree).toBe(true);
  });

  it("5종 만화 패턴 프리셋 모두 고유 메타데이터·무접힘 메쉬·문양 스트로크를 생성한다", () => {
    const presets = listPatternRibbonPresets();
    expect(presets).toHaveLength(5);
    expect(PATTERN_RIBBON_PRESET_IDS).toEqual([
      "chain-link",
      "gothic-lace",
      "botanical-vine",
      "korean-dancheong-border",
      "architectural-balustrade",
    ]);

    const sCurve = makeSCurveStroke();
    const motifCodes = new Set<number>();

    for (const presetId of PATTERN_RIBBON_PRESET_IDS) {
      const preset = getPatternRibbonPreset(presetId);
      motifCodes.add(preset.patternMotifCode);
      expect(preset.fillOklch.startsWith("oklch(")).toBe(true);
      expect(preset.strokeOklch.startsWith("oklch(")).toBe(true);
      expect(preset.accentOklch.startsWith("oklch(")).toBe(true);

      const res = synthesizePatternRibbonBrush(sCurve, { presetId });
      expect(res.preset.id).toBe(presetId);
      expect(res.topologyAudit.foldoverFree).toBe(true);
      expect(res.motifStrokes.length).toBeGreaterThan(0);
      expect(res.startCap.vertices.length).toBeGreaterThanOrEqual(2);
      expect(res.endCap.vertices.length).toBeGreaterThanOrEqual(2);
    }
    expect(motifCodes.size).toBe(5);
  });

  it("필압 연동 폭 모듈레이션: 낮은 필압 구간보다 높은 필압 구간에서 리본 폭이 넓다", () => {
    const rampStroke: RawStrokePointerSample[] = [];
    for (let i = 0; i <= 20; i += 1) {
      rampStroke.push({ x: i * 15, y: 0, pressure: 0.1 + (0.9 * i) / 20 });
    }
    const vine = synthesizePatternRibbonBrush(rampStroke, {
      presetId: "botanical-vine",
      handJitterAmplitudePx: 0,
    });
    const firstW = vine.stations[0].leftHalfWidthPx + vine.stations[0].rightHalfWidthPx;
    const lastSt = vine.stations[vine.stations.length - 1];
    const lastW = lastSt.leftHalfWidthPx + lastSt.rightHalfWidthPx;
    expect(lastW).toBeGreaterThan(firstW * 1.5);

    // 건축 난간은 보태니컬 덩굴보다 필압 민감도가 낮아 구조적 일관성을 유지한다.
    const balustrade = synthesizePatternRibbonBrush(rampStroke, {
      presetId: "architectural-balustrade",
      handJitterAmplitudePx: 0,
    });
    const bSpread = balustrade.maxWidthPx / balustrade.minWidthPx;
    const vSpread = vine.maxWidthPx / vine.minWidthPx;
    expect(vSpread).toBeGreaterThan(bSpread);
  });

  it("시드 결정론: 동일 시드는 비트 단위로 동일한 리본을 생성하고 다른 시드는 미세 흔들림이 달라진다", () => {
    const stroke = makeSCurveStroke();
    const runA = synthesizePatternRibbonBrush(stroke, {
      presetId: "botanical-vine",
      seed: 4242,
      handJitterAmplitudePx: 1.2,
    });
    const runB = synthesizePatternRibbonBrush(stroke, {
      presetId: "botanical-vine",
      seed: 4242,
      handJitterAmplitudePx: 1.2,
    });
    const runC = synthesizePatternRibbonBrush(stroke, {
      presetId: "botanical-vine",
      seed: 9898,
      handJitterAmplitudePx: 1.2,
    });

    expect(runA.stations).toEqual(runB.stations);
    expect(runA.quads).toEqual(runB.quads);
    const diffCount = runA.stations.filter(
      (st, idx) => Math.abs(st.leftHalfWidthPx - runC.stations[idx].leftHalfWidthPx) > 1e-4,
    ).length;
    expect(diffCount).toBeGreaterThan(5);
    expect(runC.topologyAudit.foldoverFree).toBe(true);
  });

  it("UV 매핑 연속성: u ∈ [0, tileCount]가 단조 증가하고 좌측 v=0, 우측 v=1을 유지한다", () => {
    const res = synthesizePatternRibbonBrush(makeUnevenSpeedStroke(), {
      presetId: "chain-link",
      tileRepeatLengthPx: 28,
    });

    expect(res.topologyAudit.uvMonotonic).toBe(true);
    expect(res.stations[0].u).toBe(0);
    const last = res.stations[res.stations.length - 1];
    expect(last.u).toBeCloseTo(res.tileCount, 5);
    for (const st of res.stations) {
      expect(st.leftUv.y).toBe(0);
      expect(st.rightUv.y).toBe(1);
      expect(st.leftUv.x).toBe(st.u);
      expect(st.rightUv.x).toBe(st.u);
      expect(st.tileLocalU).toBeGreaterThanOrEqual(0);
      expect(st.tileLocalU).toBeLessThan(1.000001);
    }
  });

  it("끝단 캡 4종(round, flat, tapered, ornamental-finial) 모두 유한 좌표와 올바른 꼭짓점 수를 생성한다", () => {
    const stroke: RawStrokePointerSample[] = [
      { x: 0, y: 0, pressure: 0.6 },
      { x: 140, y: 0, pressure: 0.6 },
    ];
    const styles: readonly RibbonCapStyle[] = ["round", "flat", "tapered", "ornamental-finial"];
    const expectedMinVerts: Record<RibbonCapStyle, number> = {
      flat: 2,
      tapered: 3,
      "ornamental-finial": 5,
      round: 7,
    };

    for (const style of styles) {
      const res = synthesizePatternRibbonBrush(stroke, {
        startCapStyle: style,
        endCapStyle: style,
      });
      expect(res.startCap.capStyle).toBe(style);
      expect(res.endCap.capStyle).toBe(style);
      expect(res.startCap.vertices.length).toBeGreaterThanOrEqual(expectedMinVerts[style]);
      expect(res.endCap.vertices.length).toBeGreaterThanOrEqual(expectedMinVerts[style]);
      for (const pt of [...res.startCap.vertices, ...res.endCap.vertices]) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }
    }
  });

  it("빈 스트로크나 1점 스트로크를 합성해도 예외 없이 안전한 빈 메쉬를 반환한다", () => {
    const emptyRes = synthesizePatternRibbonBrush([]);
    expect(emptyRes.quads).toHaveLength(0);
    expect(emptyRes.topologyAudit.foldoverFree).toBe(true);

    const singleRes = synthesizePatternRibbonBrush([{ x: 10, y: 20 }]);
    expect(singleRes.stations).toHaveLength(1);
    expect(singleRes.quads).toHaveLength(0);
    expect(singleRes.topologyAudit.foldoverFree).toBe(true);
  });

  it("위상 감사기 단독 호출: 정상 메쉬는 0결함, 뒤집힌 쿼드는 정확히 검출한다", () => {
    const good = synthesizePatternRibbonBrush(makeSharpCornerStroke(90, 90), { mode: "guarded" });
    const goodAudit = auditRibbonMeshTopology(good.stations, good.quads);
    expect(goodAudit.foldoverFree).toBe(true);
    expect(goodAudit.minQuadAreaPx2).toBeGreaterThan(0);

    const bad = synthesizePatternRibbonBrush(makeSharpCornerStroke(135, 90), {
      mode: "naive",
      ribbonWidthPx: 36,
    });
    const badAudit = auditRibbonMeshTopology(bad.stations, bad.quads);
    expect(badAudit.foldoverFree).toBe(false);
    expect(badAudit.invertedQuadCount + badAudit.selfIntersectionCount).toBeGreaterThan(0);
  });
});

describe("Wave 116 — WebGPU WGSL Arc-Length Ribbon Shader & Validator", () => {
  it("5종 프리셋 모두 16바이트 정렬 유니폼·스토리지 바인딩을 갖춘 유효 WGSL을 생성한다", () => {
    for (const presetId of PATTERN_RIBBON_PRESET_IDS) {
      const artifact = buildArcLengthRibbonWgsl(presetId);
      expect(artifact.presetId).toBe(presetId);
      expect(artifact.uniformBufferByteLength % 16).toBe(0);
      expect(artifact.spineSampleStrideBytes % 16).toBe(0);
      expect(artifact.ribbonVertexStrideBytes % 16).toBe(0);
      expect(artifact.bindings).toHaveLength(3);
      expect(artifact.entryPoints).toEqual([
        "cs_arclength_miter_guard",
        "vs_pattern_ribbon",
        "fs_pattern_ribbon",
      ]);

      const check = validateArcLengthRibbonWgsl(artifact);
      expect(check.valid).toBe(true);
      expect(check.errors).toEqual([]);
      expect(check.bindingCount).toBe(3);
    }
  });

  it("프리셋별로 서로 다른 패턴 SDF 프래그먼트 로직이 생성된다", () => {
    const shaders = new Set<string>(
      PATTERN_RIBBON_PRESET_IDS.map((id: PatternRibbonPresetId) => buildArcLengthRibbonWgsl(id).wgsl),
    );
    expect(shaders.size).toBe(5);
  });

  it("거부한다: 중괄호 불균형으로 손상된 WGSL을 검증 실패로 반환한다", () => {
    const broken = buildArcLengthRibbonWgsl("chain-link").wgsl.replace("}", "");
    const res = validateArcLengthRibbonWgsl(broken);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("curly braces"))).toBe(true);
  });

  it("거부한다: 필수 스토리지 바인딩이 누락된 WGSL을 거부한다", () => {
    const missingBinding = buildArcLengthRibbonWgsl("gothic-lace").wgsl.replace(
      "@group(0) @binding(2)",
      "// removed",
    );
    const res = validateArcLengthRibbonWgsl(missingBinding);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("@binding(2)"))).toBe(true);
  });

  it("거부한다: 16바이트 정렬 위반 아티팩트를 거부한다", () => {
    const validArt = buildArcLengthRibbonWgsl("korean-dancheong-border");
    const misaligned = { ...validArt, uniformBufferByteLength: 40 };
    const res = validateArcLengthRibbonWgsl(misaligned);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("multiple of 16"))).toBe(true);
  });

  it("거부한다: NaN/Infinity 오염 및 금지 GLSL 토큰(gl_FragColor, dFdx)을 차단한다", () => {
    const base = buildArcLengthRibbonWgsl("botanical-vine").wgsl;
    const withNan = `${base}\n// NaN`;
    expect(validateArcLengthRibbonWgsl(withNan).valid).toBe(false);

    const withGlsl = base.replace("fwidth(sdf)", "dFdx(sdf)");
    const glslRes = validateArcLengthRibbonWgsl(withGlsl);
    expect(glslRes.valid).toBe(false);
    expect(glslRes.errors.some((e) => e.includes("GLSL"))).toBe(true);
  });

  it("거부한다: 빈 문자열 WGSL 입력을 검증 실패로 반환한다", () => {
    const res = validateArcLengthRibbonWgsl("   ");
    expect(res.valid).toBe(false);
    expect(res.lineCount).toBe(0);
  });
});

describe("Wave 116 — Pure-OKLCH Print-Safe SVG & Natural Korean QA Brief", () => {
  it("순수 OKLCH 규칙: 라이트·다크 SVG 모두 원시 hex/rgb/rgba/hsl이 0건이고 NaN/Infinity가 0건이다", () => {
    const cmp = compareNaiveVsGuardedRibbon(makeSharpCornerStroke(135, 110), {
      presetId: "korean-dancheong-border",
      ribbonWidthPx: 32,
      tileRepeatLengthPx: 26,
    });

    const hexPattern = new RegExp("#[0-9a-fA-F]{3,8}");
    const legacyColorPattern = new RegExp("(?:rgba?|hsla?)\\s*\\(", "i");

    for (const theme of ["light", "dark"] as const) {
      const svg = renderPatternRibbonBrushSvg(cmp.guarded, {
        theme,
        comparison: cmp,
      });

      expect(svg.startsWith("<svg ")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).toContain("oklch(");
      expect(hexPattern.test(svg)).toBe(false);
      expect(legacyColorPattern.test(svg)).toBe(false);
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("Infinity");
      expect(svg).toContain('data-layer="center-spine"');
      expect(svg).toContain('data-layer="tile-ticks"');
      expect(svg).toContain('data-layer="curvature-heatmap"');
      expect(svg).toContain('data-layer="pattern-motifs"');
    }
  });

  it("XML 이스케이프: 제목에 포함된 특수문자(<, >, &, \", ')를 완전히 이스케이프한다", () => {
    const res = synthesizePatternRibbonBrush(makeSCurveStroke(), { presetId: "chain-link" });
    const payload = `<script>"alert" & 'xss'</script>`;
    const svg = renderPatternRibbonBrushSvg(res, { title: payload });

    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;&quot;alert&quot; &amp; &apos;xss&apos;&lt;/script&gt;");
    expect(escapeSvgXml(`a<b&c>"d"'e'`)).toBe("a&lt;b&amp;c&gt;&quot;d&quot;&apos;e&apos;");
  });

  it("빈 리본 결과도 NaN/Infinity 없이 유효한 OKLCH SVG를 렌더링한다", () => {
    const empty = synthesizePatternRibbonBrush([]);
    const svg = renderPatternRibbonBrushSvg(empty);
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });

  it("한국어 QA 브리프: 통과 판정, 핵심 계측치, Naive 비교 문구를 생성하고 번역투가 0건이다", () => {
    const cmp = compareNaiveVsGuardedRibbon(makeSharpCornerStroke(90, 120), {
      presetId: "korean-dancheong-border",
      ribbonWidthPx: 32,
      tileRepeatLengthPx: 24,
    });
    const report = summarizePatternRibbonBrushKo(cmp.guarded, cmp);

    expect(report.verdictKo).toBe("통과");
    expect(report.defectFree).toBe(true);
    expect(report.tileUniformityPassed).toBe(true);
    expect(report.presetLabelKo).toBe("한국 단청 테두리");
    expect(report.headlineKo).toContain("코너 접힘 0건");
    expect(report.comparisonLineKo).not.toBeNull();
    expect(report.comparisonLineKo).toContain("단순 오프셋");
    expect(report.bulletLinesKo).toHaveLength(5);

    const bannedTranslationese = [
      "가능하게 합니다",
      "직관적인 경험을 제공",
      "원활한 워크플로우를 보장",
      "효과적으로 지원합니다",
    ];
    for (const phrase of bannedTranslationese) {
      expect(report.fullTextKo).not.toContain(phrase);
    }
  });

  it("한국어 QA 브리프: 결함이 있는 Naive 리본에 대해서는 실패 판정을 명확히 보고한다", () => {
    const naiveBad = synthesizePatternRibbonBrush(makeSharpCornerStroke(135, 110), {
      presetId: "chain-link",
      mode: "naive",
      ribbonWidthPx: 34,
    });
    const report = summarizePatternRibbonBrushKo(naiveBad);
    expect(report.verdictKo).toBe("실패");
    expect(report.defectFree).toBe(false);
    expect(report.cornerGuardLineKo).toContain("재조정이 필요합니다");
  });
});
