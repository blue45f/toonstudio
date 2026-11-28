import { describe, expect, it } from "vitest";

import {
  DEFAULT_DNA_SAMPLE_SIZE,
  computeInkStyleDistance,
  extractInkDnaProfile,
  harmonizeLineartToInkDna,
  measureToroidalSeamMetrics,
  sampleToroidalValueNoise,
  synthesizeSeamlessBrushTexture,
  synthesizeSeamlessScreentone,
  type InkSampleRgbaBuffer,
  type ReferenceVectorStroke,
  type VectorStrokePoint,
} from "./index";

function createCanvas(size = DEFAULT_DNA_SAMPLE_SIZE, fillLum = 255): InkSampleRgbaBuffer {
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    rgba[i * 4] = fillLum;
    rgba[i * 4 + 1] = fillLum;
    rgba[i * 4 + 2] = fillLum;
    rgba[i * 4 + 3] = 255;
  }
  return { width: size, height: size, rgba };
}

function buildMechanical3dSample(size = DEFAULT_DNA_SAMPLE_SIZE): {
  readonly buffer: InkSampleRgbaBuffer;
  readonly strokes: readonly ReferenceVectorStroke[];
} {
  const buffer = createCanvas(size, 255);
  const { rgba } = buffer;
  for (const yCenter of [32, 64, 96]) {
    for (let x = 14; x < size - 14; x += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const idx = ((yCenter + dy) * size + x) * 4;
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
      }
    }
  }
  const strokes: ReferenceVectorStroke[] = [32, 64, 96].map((y, idx) => ({
    id: `mech-3d-${idx}`,
    sourceKind: "3d-extracted",
    microBleedRadiusPx: 0,
    points: [
      { x: 14, y, pressure: 0.5, widthPx: 2.0, opacity: 1.0 },
      { x: size - 14, y, pressure: 0.5, widthPx: 2.0, opacity: 1.0 },
    ],
  }));
  return { buffer, strokes };
}

function buildRoughHandDrawnSample(size = DEFAULT_DNA_SAMPLE_SIZE): {
  readonly buffer: InkSampleRgbaBuffer;
  readonly strokes: readonly ReferenceVectorStroke[];
} {
  const buffer = createCanvas(size, 246);
  const { rgba } = buffer;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const grain = Math.sin((2 * Math.PI * (x * 10 + y * 6)) / size) * 9 + Math.cos((2 * Math.PI * y * 14) / size) * 5;
      const lum = Math.max(212, Math.min(254, Math.round(244 + grain)));
      const idx = (y * size + x) * 4;
      rgba[idx] = lum;
      rgba[idx + 1] = lum - 1;
      rgba[idx + 2] = lum - 3;
    }
  }
  const strokes: ReferenceVectorStroke[] = [];
  for (let sIdx = 0; sIdx < 3; sIdx += 1) {
    const baseY = 26 + sIdx * 36;
    const pts: VectorStrokePoint[] = [];
    for (let step = 0; step <= 32; step += 1) {
      const u = step / 32;
      const x = 12 + u * (size - 24);
      const y = baseY + Math.sin(u * Math.PI) * 5 + Math.sin(step * 2.7 + sIdx * 1.9) * 1.7 + (step % 2 === 0 ? 0.85 : -0.85);
      const dEnd = Math.min(u, 1 - u);
      const taper = dEnd < 0.25 ? Math.pow(Math.max(0.08, dEnd / 0.25), 1.65) : 1;
      const widthPx = Math.max(0.55, (4.6 + Math.sin(u * Math.PI * 2.5 + sIdx) * 1.8) * taper);
      pts.push({ x, y, pressure: Math.min(1, widthPx / 6.5), widthPx, opacity: 0.72 + 0.24 * Math.abs(Math.sin(step * 1.3 + sIdx)) });

      const radius = widthPx / 2;
      const bleedR = radius + 2.2;
      for (let py = Math.max(1, Math.floor(y - bleedR)); py <= Math.min(size - 2, Math.ceil(y + bleedR)); py += 1) {
        for (let px = Math.max(1, Math.floor(x - bleedR)); px <= Math.min(size - 2, Math.ceil(x + bleedR)); px += 1) {
          const dist = Math.hypot(px - x, py - y);
          const idx = (py * size + px) * 4;
          const tooth = ((px * 19 + py * 37) % 11) / 11;
          if (dist <= radius + (tooth - 0.5) * 0.9) {
            const v = Math.round(32 + tooth * 54);
            rgba[idx] = Math.min(rgba[idx] ?? 255, v);
            rgba[idx + 1] = Math.min(rgba[idx + 1] ?? 255, v);
            rgba[idx + 2] = Math.min(rgba[idx + 2] ?? 255, v + 4);
          } else if (dist <= bleedR) {
            const h = Math.round(240 - (1 - (dist - radius) / Math.max(0.5, bleedR - radius)) * 70);
            rgba[idx] = Math.min(rgba[idx] ?? 255, h);
            rgba[idx + 1] = Math.min(rgba[idx + 1] ?? 255, h);
            rgba[idx + 2] = Math.min(rgba[idx + 2] ?? 255, h);
          }
        }
      }
    }
    strokes.push({ id: `hand-${sIdx}`, sourceKind: "hand-drawn", microBleedRadiusPx: 1.5, points: pts });
  }
  return { buffer, strokes };
}

function buildDirectionalHatchPaper(size = DEFAULT_DNA_SAMPLE_SIZE, periodPx = 8): InkSampleRgbaBuffer {
  const buffer = createCanvas(size, 240);
  const { rgba } = buffer;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const lum = Math.round(234 + Math.sin((2 * Math.PI * (x - y)) / (periodPx * Math.SQRT2)) * 18);
      const idx = (y * size + x) * 4;
      rgba[idx] = lum;
      rgba[idx + 1] = lum;
      rgba[idx + 2] = lum;
    }
  }
  return buffer;
}

describe("wasm64-wave53-ink-dna-harmonizer", () => {
  it("128×128 기계적 3D 직선과 거친 손그림의 고주파 가장자리 거칠기 지수를 정량 분리한다", () => {
    const mech = buildMechanical3dSample();
    const hand = buildRoughHandDrawnSample();
    const mechDna = extractInkDnaProfile(mech.buffer, mech.strokes);
    const handDna = extractInkDnaProfile(hand.buffer, hand.strokes);
    expect(mechDna.edgeRoughnessIndex).toBeLessThan(0.18);
    expect(handDna.edgeRoughnessIndex).toBeGreaterThan(mechDna.edgeRoughnessIndex + 0.25);
  });

  it("균일 폭 3D 선화와 필압 강약 손그림의 선폭 분산·테이퍼 감마를 정량 분리한다", () => {
    const mech = buildMechanical3dSample();
    const hand = buildRoughHandDrawnSample();
    const mechDna = extractInkDnaProfile(mech.buffer, mech.strokes);
    const handDna = extractInkDnaProfile(hand.buffer, hand.strokes);
    expect(handDna.strokeWidthVariancePx2).toBeGreaterThan(mechDna.strokeWidthVariancePx2 + 0.8);
    expect(mechDna.pressureTaperGamma).toBeLessThan(0.35);
    expect(handDna.pressureTaperGamma).toBeGreaterThan(1.0);
  });

  it("손그림의 잉크 농도 바닥값과 미세 번짐 반경을 순흑 3D 선화와 정확히 구분한다", () => {
    const mech = buildMechanical3dSample();
    const hand = buildRoughHandDrawnSample();
    const mechDna = extractInkDnaProfile(mech.buffer, mech.strokes);
    const handDna = extractInkDnaProfile(hand.buffer, hand.strokes);
    expect(mechDna.inkDensityFloor).toBeGreaterThan(0.95);
    expect(handDna.inkDensityFloor).toBeLessThan(mechDna.inkDensityFloor - 0.1);
    expect(handDna.microBleedRadiusPx).toBeGreaterThan(mechDna.microBleedRadiusPx + 0.4);
  });

  it("방향성 해칭 종이 샘플에서 2D FFT 스펙트럼이 지배 주기와 높은 이방성을 복원한다", () => {
    const hatchDna = extractInkDnaProfile(buildDirectionalHatchPaper(128, 8));
    const blankDna = extractInkDnaProfile(createCanvas(128, 255));
    expect(hatchDna.paperGrainSpectrum.grainAmplitude).toBeGreaterThan(0.2);
    expect(hatchDna.paperGrainSpectrum.anisotropy).toBeGreaterThan(0.75);
    expect(hatchDna.paperGrainSpectrum.dominantPeriodPx).toBeGreaterThan(6.0);
    expect(hatchDna.paperGrainSpectrum.dominantPeriodPx).toBeLessThan(10.5);
    expect(blankDna.paperGrainSpectrum.grainAmplitude).toBe(0);
    expect(blankDna.paperGrainSpectrum.dominantPeriodPx).toBe(0);
  });

  it("동일 샘플 입력에 대해 DNA 프로파일과 지문 해시를 결정론적으로 재현한다", () => {
    const hand = buildRoughHandDrawnSample();
    const first = extractInkDnaProfile(hand.buffer, hand.strokes);
    const second = extractInkDnaProfile(hand.buffer, hand.strokes);
    expect(first).toEqual(second);
    expect(first.dnaSignature).toMatch(/^[0-9a-f]{8}$/u);
  });

  it("잘못된 버퍼 크기에는 한국어 오류를 던지고 빈 캔버스는 NaN 없이 처리한다", () => {
    expect(() => extractInkDnaProfile({ width: 128, height: 128, rgba: new Uint8ClampedArray(64) })).toThrow(/RGBA 버퍼 길이/u);
    expect(() => extractInkDnaProfile({ width: 8, height: 8, rgba: new Uint8ClampedArray(8 * 8 * 4) })).toThrow(/16×16 이상/u);
    const blankDna = extractInkDnaProfile(createCanvas(128, 255));
    expect(Number.isFinite(blankDna.strokeWidthMeanPx)).toBe(true);
    expect(blankDna.inkPixelCount).toBe(0);
  });

  it("스타일 거리 함수가 영거리·대칭성·이질 스타일 양수 거리를 만족한다", () => {
    const mech = buildMechanical3dSample();
    const hand = buildRoughHandDrawnSample();
    const mechDna = extractInkDnaProfile(mech.buffer, mech.strokes);
    const handDna = extractInkDnaProfile(hand.buffer, hand.strokes);
    expect(computeInkStyleDistance(handDna, handDna)).toBe(0);
    expect(computeInkStyleDistance(mechDna, handDna)).toBeCloseTo(computeInkStyleDistance(handDna, mechDna), 10);
    expect(computeInkStyleDistance(mechDna, handDna)).toBeGreaterThan(1.0);
  });

  it("2점짜리 3D 직선을 작가 DNA로 동화하면 호길이 세분화·유기적 선폭 변조·끝단 테이퍼가 적용된다", () => {
    const hand = buildRoughHandDrawnSample();
    const authorDna = extractInkDnaProfile(hand.buffer, hand.strokes);
    const rigid3d: ReferenceVectorStroke[] = [
      {
        id: "bg-wall-edge",
        sourceKind: "3d-extracted",
        points: [
          { x: 10, y: 40, pressure: 0.5, widthPx: 1.8, opacity: 1 },
          { x: 160, y: 40, pressure: 0.5, widthPx: 1.8, opacity: 1 },
        ],
      },
    ];
    const report = harmonizeLineartToInkDna(rigid3d, authorDna, { strength: 0.9, seed: 1001 });
    const pts = report.strokes[0]?.points ?? [];
    expect(report.resampledStrokeCount).toBe(1);
    expect(pts.length).toBeGreaterThan(15);
    expect(pts[Math.floor(pts.length / 2)]?.widthPx ?? 0).toBeGreaterThan((pts[0]?.widthPx ?? 99) * 1.8);
  });

  it("기계적 3D 추출선을 작가 DNA에 동화하면 스타일 거리가 수치적으로 크게 감소한다", () => {
    const mech = buildMechanical3dSample();
    const hand = buildRoughHandDrawnSample();
    const authorDna = extractInkDnaProfile(hand.buffer, hand.strokes);
    const report = harmonizeLineartToInkDna(mech.strokes, authorDna, { strength: 0.9, seed: 2026 });
    expect(report.styleDistanceBefore).toBeGreaterThan(1.0);
    expect(report.styleDistanceAfter).toBeLessThan(report.styleDistanceBefore);
    expect(report.distanceReductionRatio).toBeGreaterThan(0.5);
  });

  it("동화 강도(strength)를 높일수록 작가 DNA까지의 스타일 거리가 단조 감소한다", () => {
    const mech = buildMechanical3dSample();
    const hand = buildRoughHandDrawnSample();
    const authorDna = extractInkDnaProfile(hand.buffer, hand.strokes);
    const d0 = harmonizeLineartToInkDna(mech.strokes, authorDna, { strength: 0, seed: 42 }).styleDistanceAfter;
    const d35 = harmonizeLineartToInkDna(mech.strokes, authorDna, { strength: 0.35, seed: 42 }).styleDistanceAfter;
    const d70 = harmonizeLineartToInkDna(mech.strokes, authorDna, { strength: 0.7, seed: 42 }).styleDistanceAfter;
    const d100 = harmonizeLineartToInkDna(mech.strokes, authorDna, { strength: 1.0, seed: 42 }).styleDistanceAfter;
    expect(d35).toBeLessThan(d0);
    expect(d70).toBeLessThan(d35);
    expect(d100).toBeLessThan(d70);
  });

  it("strength가 0이면 원본 스트로크 좌표와 선폭을 변형하지 않고 보존한다", () => {
    const mech = buildMechanical3dSample();
    const hand = buildRoughHandDrawnSample();
    const authorDna = extractInkDnaProfile(hand.buffer, hand.strokes);
    const report = harmonizeLineartToInkDna(mech.strokes, authorDna, { strength: 0 });
    expect(report.strokes[0]?.points).toEqual(mech.strokes[0]?.points);
    expect(report.droppedMicroFragmentCount).toBe(0);
    expect(report.culledCrowdedStrokeCount).toBe(0);
    expect(report.styleDistanceAfter).toBeCloseTo(report.styleDistanceBefore, 10);
  });

  it("3D 추출선 과밀 정리기가 미세 파편선과 근접 중복 평행선을 제거하고 주 구조선을 보존한다", () => {
    const hand = buildRoughHandDrawnSample();
    const authorDna = extractInkDnaProfile(hand.buffer, hand.strokes);
    const crowded3d: ReferenceVectorStroke[] = [
      { id: "main-pillar", sourceKind: "3d-extracted", points: [{ x: 20, y: 50, pressure: 0.5, widthPx: 2 }, { x: 140, y: 50, pressure: 0.5, widthPx: 2 }] },
      { id: "duplicate-parallel", sourceKind: "3d-extracted", points: [{ x: 24, y: 52, pressure: 0.5, widthPx: 2 }, { x: 136, y: 52, pressure: 0.5, widthPx: 2 }] },
      { id: "micro-shard", sourceKind: "3d-extracted", points: [{ x: 90, y: 90, pressure: 0.5, widthPx: 2 }, { x: 93, y: 91, pressure: 0.5, widthPx: 2 }] },
      { id: "distinct-roof", sourceKind: "3d-extracted", points: [{ x: 20, y: 10, pressure: 0.5, widthPx: 2 }, { x: 120, y: 18, pressure: 0.5, widthPx: 2 }] },
    ];
    const report = harmonizeLineartToInkDna(crowded3d, authorDna, {
      strength: 0.85,
      enable3dDeclutter: true,
      min3dSegmentLengthPx: 6,
      crowdingRadiusPx: 4.5,
    });
    expect(report.droppedMicroFragmentCount).toBe(1);
    expect(report.culledCrowdedStrokeCount).toBe(1);
    expect(report.strokes.map((s) => s.id)).toEqual(["main-pillar", "distinct-roof"]);
  });

  it("선화 동화기는 동일 시드에서 100% 결정론적이며 다른 시드에서는 미세 필치 변형을 달리한다", () => {
    const mech = buildMechanical3dSample();
    const hand = buildRoughHandDrawnSample();
    const authorDna = extractInkDnaProfile(hand.buffer, hand.strokes);
    const runA = harmonizeLineartToInkDna(mech.strokes, authorDna, { strength: 0.85, seed: 777 });
    const runB = harmonizeLineartToInkDna(mech.strokes, authorDna, { strength: 0.85, seed: 777 });
    const runC = harmonizeLineartToInkDna(mech.strokes, authorDna, { strength: 0.85, seed: 888 });
    expect(runA.strokes).toEqual(runB.strokes);
    expect(runA.strokes[0]?.points[6]?.y).not.toBe(runC.strokes[0]?.points[6]?.y);
  });

  it("어시스턴트 선화를 동화하면 끝단 테이퍼 감마와 잉크 농도 바닥값이 작가 DNA에 수렴한다", () => {
    const hand = buildRoughHandDrawnSample();
    const authorDna = extractInkDnaProfile(hand.buffer, hand.strokes);
    const assistantStroke: ReferenceVectorStroke[] = [
      {
        id: "assist-hair",
        sourceKind: "assistant",
        points: Array.from({ length: 16 }, (_, i) => ({
          x: 10 + i * 8,
          y: 40 + Math.sin(i * 0.25) * 12,
          pressure: 0.6,
          widthPx: 2.2,
          opacity: 1,
        })),
      },
    ];
    const report = harmonizeLineartToInkDna(assistantStroke, authorDna, { strength: 0.95, seed: 5301 });
    expect(report.afterFeatures.pressureTaperGamma).toBeGreaterThan(report.beforeFeatures.pressureTaperGamma + 0.5);
    expect(report.afterFeatures.inkDensityFloor).toBeLessThan(report.beforeFeatures.inkDensityFloor - 0.08);
    expect(report.styleDistanceAfter).toBeLessThan(report.styleDistanceBefore);
  });

  it("토러스 주기 Value 노이즈와 무한 타일 브러시 텍스처가 상하·좌우 경계 불연속 0을 만족한다", () => {
    for (const exact of [0, 0.25, 0.5, 0.75]) {
      expect(sampleToroidalValueNoise(exact, 0.25, 8, 8, 99)).toBe(sampleToroidalValueNoise(exact + 1, 0.25, 8, 8, 99));
      expect(sampleToroidalValueNoise(0.5, exact, 8, 8, 99)).toBe(sampleToroidalValueNoise(0.5, exact + 1, 8, 8, 99));
    }
    for (const coord of [0.17, 0.53, 0.89]) {
      expect(sampleToroidalValueNoise(coord, 0.25, 8, 8, 99)).toBeCloseTo(sampleToroidalValueNoise(coord + 1, 0.25, 8, 8, 99), 12);
      expect(sampleToroidalValueNoise(0.41, coord, 8, 8, 99)).toBeCloseTo(sampleToroidalValueNoise(0.41, coord + 1, 8, 8, 99), 12);
    }

    const hand = buildRoughHandDrawnSample();
    const authorDna = extractInkDnaProfile(hand.buffer, hand.strokes);
    const brush = synthesizeSeamlessBrushTexture(authorDna, { tileSize: 128, seed: 1234 });
    expect(brush.rgba).toBeInstanceOf(Uint8ClampedArray);
    expect(brush.rgba.length).toBe(128 * 128 * 4);
    expect(brush.seamMetrics.toroidalWrapError).toBe(0);
    expect(brush.seamMetrics.isSeamless).toBe(true);
    expect(brush.seamMetrics.horizontalSeamExcess).toBeLessThan(0.02);
    expect(brush.seamMetrics.verticalSeamExcess).toBeLessThan(0.02);
  });

  it("브러시 텍스처 합성이 작가 DNA의 종이 결 진폭 차이를 알파 질감 분산에 반영한다", () => {
    const smoothBrush = synthesizeSeamlessBrushTexture(extractInkDnaProfile(createCanvas(128, 255)), { tileSize: 64, seed: 55 });
    const roughBrush = synthesizeSeamlessBrushTexture(extractInkDnaProfile(buildDirectionalHatchPaper(128, 8)), { tileSize: 64, seed: 55 });
    const alphaVariance = (rgba: Uint8ClampedArray): number => {
      const n = rgba.length / 4;
      let sum = 0;
      for (let i = 0; i < n; i += 1) sum += rgba[i * 4 + 3] ?? 0;
      const mean = sum / n;
      let v = 0;
      for (let i = 0; i < n; i += 1) v += ((rgba[i * 4 + 3] ?? 0) - mean) ** 2;
      return v / n;
    };
    expect(alphaVariance(roughBrush.rgba)).toBeGreaterThan(alphaVariance(smoothBrush.rgba) * 1.4);
  });

  it("망점(halftone-dots) 스크린톤이 목표 농도에 수렴하며 상하·좌우 경계가 매끄럽게 연결된다", () => {
    const hand = buildRoughHandDrawnSample();
    const authorDna = extractInkDnaProfile(hand.buffer, hand.strokes);
    const tone = synthesizeSeamlessScreentone(authorDna, {
      tileSize: 128,
      patternKind: "halftone-dots",
      toneDensity: 0.35,
      linesPerTile: 12,
      seed: 314,
    });
    expect(tone.rgba).toBeInstanceOf(Uint8ClampedArray);
    expect(tone.rgba.length).toBe(128 * 128 * 4);
    expect(tone.seamMetrics.toroidalWrapError).toBeLessThan(1e-12);
    expect(tone.seamMetrics.isSeamless).toBe(true);
    expect(Math.abs(tone.realizedToneDensity - 0.35)).toBeLessThan(0.12);
    expect(measureToroidalSeamMetrics(tone.rgba, tone.width, tone.height, 0).isSeamless).toBe(true);
  });

  it("사선 해칭과 크로스 해칭 스크린톤이 임의 각도에서도 역격자 정수 파동으로 무한 타일 연속성을 유지한다", () => {
    const hatchDna = extractInkDnaProfile(buildDirectionalHatchPaper(128, 8));
    const lineTone = synthesizeSeamlessScreentone(hatchDna, { tileSize: 128, patternKind: "line-hatch", angleRad: 0.63, linesPerTile: 10, toneDensity: 0.4, seed: 901 });
    const crossTone = synthesizeSeamlessScreentone(hatchDna, { tileSize: 128, patternKind: "cross-hatch", angleRad: 1.12, linesPerTile: 9, toneDensity: 0.45, seed: 902 });
    expect(Number.isInteger(lineTone.reciprocalWaveVector[0])).toBe(true);
    expect(Number.isInteger(lineTone.reciprocalWaveVector[1])).toBe(true);
    expect(lineTone.seamMetrics.toroidalWrapError).toBeLessThan(1e-12);
    expect(lineTone.seamMetrics.isSeamless).toBe(true);
    expect(crossTone.seamMetrics.toroidalWrapError).toBeLessThan(1e-12);
    expect(crossTone.seamMetrics.isSeamless).toBe(true);
  });

  it("모래톤 합성과 DNA 기반 패턴 자동 선택이 결정론적으로 동작한다", () => {
    const hatchDna = extractInkDnaProfile(buildDirectionalHatchPaper(128, 8));
    const autoToneA = synthesizeSeamlessScreentone(hatchDna, { tileSize: 64, seed: 404 });
    const autoToneB = synthesizeSeamlessScreentone(hatchDna, { tileSize: 64, seed: 404 });
    const sandTone = synthesizeSeamlessScreentone(hatchDna, { tileSize: 64, patternKind: "organic-sand", toneDensity: 0.3, seed: 405 });
    expect(autoToneA.patternKind).toBe("line-hatch");
    expect(autoToneA.rgba).toEqual(autoToneB.rgba);
    expect(sandTone.seamMetrics.toroidalWrapError).toBe(0);
    expect(sandTone.seamMetrics.isSeamless).toBe(true);
  });

  it("종단간 파이프라인(DNA 추출 → 3D 선화 동화 → 무한 타일 브러시·스크린톤 합성)이 일관되게 연동된다", () => {
    const authorSample = buildRoughHandDrawnSample(128);
    const scene3d = buildMechanical3dSample(128);
    const authorDna = extractInkDnaProfile(authorSample.buffer, authorSample.strokes);
    const harmonized = harmonizeLineartToInkDna(scene3d.strokes, authorDna, { strength: 0.9, seed: 5353 });
    const brushTile = synthesizeSeamlessBrushTexture(authorDna, { tileSize: 128, seed: 5353 });
    const screentoneTile = synthesizeSeamlessScreentone(authorDna, { tileSize: 128, toneDensity: 0.32, seed: 5353 });

    expect(harmonized.styleDistanceAfter).toBeLessThan(harmonized.styleDistanceBefore);
    expect(brushTile.sourceDnaSignature).toBe(authorDna.dnaSignature);
    expect(screentoneTile.sourceDnaSignature).toBe(authorDna.dnaSignature);
    expect(brushTile.seamMetrics.isSeamless).toBe(true);
    expect(screentoneTile.seamMetrics.isSeamless).toBe(true);
  });
});
