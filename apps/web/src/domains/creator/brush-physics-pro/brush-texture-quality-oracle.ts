/**
 * 브러시 물리 질감 정량 자동 오라클 & 라이브 Canvas2D 스와치 렌더러.
 * 종이 이빨 대비 · 격자 비주기성 · 저/중/고 필압 분리 · 웨트 엣지 농축 · 왁스 발수율 ·
 * 12종 혼합 브러시 256×256 더티 타일 합성 지연(p95TileMs)을 실제 픽셀 버퍼에서 자동 실측 판정한다.
 */

import {
  DirtyTileCompositor256,
  applyCrossMediaInteraction,
  applyImpastoReliefLighting,
  depositImpastoBristleRidge,
  simulateCapillarySoakAndWetEdge,
  type CrossMediaInteractionMode,
} from "./wet-soak-impasto-wax-resist";
import {
  PAPER_PRESETS,
  PAPER_PRESET_LIST,
  evaluateTiltGrazingShading,
  stampDualBrushDabRgba,
  type DualBrushTextureMode,
  type PaperPresetId,
  type PressureCurvePresetId,
} from "./world-paper-heightfield";

export interface BrushTextureOracleOptions {
  readonly paperPreset?: PaperPresetId;
  readonly dualMode?: DualBrushTextureMode;
  readonly pressureCurve?: PressureCurvePresetId;
  readonly soakStrength?: number;
  readonly wetEdgeStrength?: number;
  readonly impastoLightAzimuthDeg?: number;
  readonly tiltDeg?: number;
  readonly seed?: number;
}

export interface OracleMetricCheck {
  readonly id:
    | "paper-tooth-contrast"
    | "grid-periodicity"
    | "pressure-tone-separation"
    | "wet-edge-ring"
    | "wax-resist-rejection"
    | "dirty-tile-p95";
  readonly labelKo: string;
  readonly labelEn: string;
  readonly value: number;
  readonly targetText: string;
  readonly unit: string;
  readonly passed: boolean;
}

export interface BrushTextureQualityAuditReport {
  readonly passed: boolean;
  readonly score: number;
  readonly paperPreset: PaperPresetId;
  readonly dualMode: DualBrushTextureMode;
  readonly pressureCurve: PressureCurvePresetId;
  readonly paperToothContrastIndex: number;
  readonly paperPresetContrasts: Readonly<Record<PaperPresetId, number>>;
  readonly gridPeriodicityScore: number;
  readonly baselineLatticePeriodicityScore: number;
  readonly pressureToneSeparation: number;
  readonly pressureToneBands: { readonly low: number; readonly mid: number; readonly high: number };
  readonly wetEdgeRingRatio: number;
  readonly waxResistRejectionRatio: number;
  readonly p95TileMs: number;
  readonly avgTileMs: number;
  readonly dirtyTileBrushCount: number;
  readonly tiltGrazingAspectRatio: number;
  readonly impastoLumaRange: number;
  readonly checks: readonly OracleMetricCheck[];
}

export interface BrushPhysicsLiveSwatchConfig {
  readonly paperPreset: PaperPresetId;
  readonly dualMode: DualBrushTextureMode;
  readonly pressureCurve: PressureCurvePresetId;
  readonly soakStrength: number;
  readonly wetEdgeStrength: number;
  readonly impastoLightAzimuthDeg: number;
  readonly tiltDeg: number;
  readonly interactionMode: CrossMediaInteractionMode;
  readonly seed?: number;
}

export interface BrushPhysicsLiveSwatchResult {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly paperContrastIndex: number;
  readonly tiltEllipseAspect: number;
  readonly wetEdgeRingRatio: number;
  readonly impastoLumaRange: number;
  readonly interactionMetricValue: number;
}

function createPaperCanvasBuffer(width: number, height: number, paperRgb: readonly [number, number, number]): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  const [r, g, b] = paperRgb;
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = 255;
  }
  return buf;
}

function lumaAt(rgba: Uint8ClampedArray, idx: number): number {
  const off = idx * 4;
  return 0.2126 * (rgba[off] ?? 255) + 0.7152 * (rgba[off + 1] ?? 255) + 0.0722 * (rgba[off + 2] ?? 255);
}

function blitPatch(
  dst: Uint8ClampedArray, dstW: number, dstH: number,
  src: Uint8ClampedArray, srcW: number, srcH: number,
  offsetX: number, offsetY: number, fallbackRgb: readonly [number, number, number],
): void {
  for (let y = 0; y < srcH; y += 1) {
    const dy = offsetY + y;
    if (dy < 0 || dy >= dstH) continue;
    for (let x = 0; x < srcW; x += 1) {
      const dx = offsetX + x;
      if (dx < 0 || dx >= dstW) continue;
      const sOff = (y * srcW + x) * 4;
      const dOff = (dy * dstW + dx) * 4;
      dst[dOff] = src[sOff] ?? fallbackRgb[0];
      dst[dOff + 1] = src[sOff + 1] ?? fallbackRgb[1];
      dst[dOff + 2] = src[sOff + 2] ?? fallbackRgb[2];
      dst[dOff + 3] = 255;
    }
  }
}

/** 특정 종이 프리셋 위 연필/목탄 스트로크의 미세 이빨 대비 지수(0..1)를 실측한다. */
function measurePaperToothContrast(
  paperPreset: PaperPresetId,
  dualMode: DualBrushTextureMode,
  pressureCurve: PressureCurvePresetId,
  tiltDeg: number,
  seed: number,
): number {
  const w = 84;
  const h = 40;
  const buf = createPaperCanvasBuffer(w, h, PAPER_PRESETS[paperPreset].basePaperRgb);

  for (let step = 0; step < 11; step += 1) {
    stampDualBrushDabRgba(buf, w, h, {
      dabX: 14 + step * 5.2, dabY: 20, dabRadiusPx: 9, dabIndex: step, strokeDistancePx: step * 5.2,
      strokeAngleRad: 0, pressure: 0.56, pressureCurve, tiltDeg: Math.min(48, Math.max(24, tiltDeg)),
      paperPreset, paperScale: 1, paperToothStrength: 0.96, dualMode, secondaryContrast: 0.22,
      tipHardness: 0.55, flow: 0.52, pigmentRgb: [32, 34, 40], jitterAmplitudePx: 1.2, seed,
    });
  }

  let mean = 0;
  let count = 0;
  let localDiffSum = 0;
  let localDiffCount = 0;
  const lumas: number[] = [];

  for (let y = 13; y <= 27; y += 1) {
    for (let x = 16; x <= 66; x += 1) {
      const l = lumaAt(buf, y * w + x) / 255;
      lumas.push(l);
      mean += l;
      count += 1;
      if (x <= 64 && y <= 25) {
        localDiffSum += Math.abs(l - lumaAt(buf, y * w + (x + 2)) / 255) + Math.abs(l - lumaAt(buf, (y + 2) * w + x) / 255);
        localDiffCount += 2;
      }
    }
  }
  if (count === 0) return 0;
  mean /= count;
  let variance = 0;
  for (const v of lumas) {
    const d = v - mean;
    variance += d * d;
  }
  const stdDev = Math.sqrt(variance / count);
  const localMicro = localDiffCount > 0 ? localDiffSum / localDiffCount : 0;
  return Number((stdDev * 1.15 + localMicro * 0.55).toFixed(4));
}

function computePeriodicLagAutocorrelation(profile: readonly number[], stepLag: number): number {
  const n = profile.length;
  if (n < stepLag * 3) return 0;

  // 저주파 매크로 종이 언덕(파장 30~60px)을 제거하고 도장 간격 대역의 주기성만 정확히 검출한다.
  const halfWin = Math.max(2, Math.floor(stepLag * 0.5));
  const residual: number[] = [];
  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    let cnt = 0;
    const lo = Math.max(0, i - halfWin);
    const hi = Math.min(n - 1, i + halfWin);
    for (let j = lo; j <= hi; j += 1) {
      sum += profile[j] ?? 0;
      cnt += 1;
    }
    residual.push((profile[i] ?? 0) - sum / Math.max(1, cnt));
  }

  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += residual[i] ?? 0;
  mean /= n;

  let denom = 0;
  for (let i = 0; i < n; i += 1) {
    const d = (residual[i] ?? mean) - mean;
    denom += d * d;
  }
  if (denom < 1e-6) return 0;

  const lags = [stepLag - 1, stepLag, stepLag + 1, stepLag * 2 - 1, stepLag * 2, stepLag * 2 + 1, stepLag * 3];
  let maxCorr = 0;
  for (const lag of lags) {
    if (lag <= 1 || lag >= n - 4) continue;
    let num = 0;
    const limit = n - lag;
    for (let i = 0; i < limit; i += 1) {
      num += ((residual[i] ?? mean) - mean) * ((residual[i + lag] ?? mean) - mean);
    }
    const corr = (num / denom) * (n / limit);
    if (corr > maxCorr) maxCorr = corr;
  }
  return Math.max(0, Math.min(1, maxCorr));
}

/** 블루노이즈 + 듀얼 3중 합성 스트로크의 도장 반복성(격자감) 점수를 실측한다. */
function measureGridPeriodicity(
  paperPreset: PaperPresetId,
  dualMode: DualBrushTextureMode,
  seed: number,
): { readonly score: number; readonly baselineScore: number } {
  const w = 224;
  const h = 44;
  const stepPx = 8;
  const paperRgb = PAPER_PRESETS[paperPreset].basePaperRgb;

  // 본 엔진: 블루노이즈 R2 서브픽셀/간격 지터 + 도메인 워핑 심리스 종이 + 듀얼 브러시 3중 합성
  const naturalBuf = createPaperCanvasBuffer(w, h, paperRgb);
  for (let i = 0; i < 24; i += 1) {
    stampDualBrushDabRgba(naturalBuf, w, h, {
      dabX: 16 + i * stepPx, dabY: 22, dabRadiusPx: 12.2, dabIndex: i, strokeDistancePx: i * stepPx,
      strokeAngleRad: 0, pressure: 0.65, tiltDeg: 22, paperPreset, paperScale: 1.37,
      paperToothStrength: 0.88, dualMode, secondaryScale: 0.92, secondaryContrast: 0.78,
      tipHardness: 0.42, flow: 0.62, pigmentRgb: [40, 42, 48], jitterAmplitudePx: 4.4, seed,
    });
  }

  // 대조군: 블루노이즈 0 · 종이 결 0 · 균일 간격 스탬프 (명백한 도장 반복 격자)
  const latticeBuf = createPaperCanvasBuffer(w, h, paperRgb);
  for (let i = 0; i < 24; i += 1) {
    stampDualBrushDabRgba(latticeBuf, w, h, {
      dabX: 16 + i * stepPx, dabY: 22, dabRadiusPx: 6.2, dabIndex: i, strokeDistancePx: i * stepPx,
      strokeAngleRad: 0, pressure: 0.8, tiltDeg: 0, paperPreset, paperToothStrength: 0,
      dualMode: "fixed-world", secondaryContrast: 0, tipHardness: 0.85, flow: 0.9,
      pigmentRgb: [40, 42, 48], jitterAmplitudePx: 0, seed,
    });
  }

  const extractSpine = (buf: Uint8ClampedArray): number[] => {
    const profile: number[] = [];
    for (let x = 22; x < 198; x += 1) {
      let colSum = 0;
      for (let y = 17; y <= 27; y += 1) colSum += lumaAt(buf, y * w + x) / 255;
      profile.push(colSum / 11);
    }
    return profile;
  };
  return {
    score: Number(computePeriodicLagAutocorrelation(extractSpine(naturalBuf), stepPx).toFixed(4)),
    baselineScore: Number(computePeriodicLagAutocorrelation(extractSpine(latticeBuf), stepPx).toFixed(4)),
  };
}

/** 저(0.22) · 중(0.55) · 고(0.90) 필압 대역의 실제 광학 농도 분리도를 실측한다. */
function measurePressureToneSeparation(
  paperPreset: PaperPresetId,
  dualMode: DualBrushTextureMode,
  pressureCurve: PressureCurvePresetId,
  seed: number,
): { readonly separation: number; readonly low: number; readonly mid: number; readonly high: number } {
  const w = 96;
  const h = 72;
  const paperRgb = PAPER_PRESETS[paperPreset].basePaperRgb;
  const paperLuma = (0.2126 * paperRgb[0] + 0.7152 * paperRgb[1] + 0.0722 * paperRgb[2]) / 255;
  const buf = createPaperCanvasBuffer(w, h, paperRgb);
  const bands = [{ pressure: 0.22, y: 14 }, { pressure: 0.55, y: 36 }, { pressure: 0.9, y: 58 }] as const;
  const means: number[] = [];

  for (let bIdx = 0; bIdx < bands.length; bIdx += 1) {
    const band = bands[bIdx];
    if (!band) continue;
    for (let i = 0; i < 14; i += 1) {
      stampDualBrushDabRgba(buf, w, h, {
        dabX: 16 + i * 4.5, dabY: band.y, dabRadiusPx: 7.5, dabIndex: bIdx * 32 + i,
        strokeDistancePx: i * 4.5, strokeAngleRad: 0, pressure: band.pressure, pressureCurve,
        tiltDeg: 18, paperPreset, paperToothStrength: 0.85, dualMode, secondaryContrast: 0.65,
        tipHardness: 0.55, flow: 0.72, pigmentRgb: [28, 30, 36], seed,
      });
    }
    let darkSum = 0;
    let count = 0;
    for (let y = band.y - 4; y <= band.y + 4; y += 1) {
      for (let x = 20; x <= 74; x += 1) {
        darkSum += Math.max(0, paperLuma - lumaAt(buf, y * w + x) / 255);
        count += 1;
      }
    }
    means.push(count > 0 ? darkSum / count : 0);
  }

  const low = Number((means[0] ?? 0).toFixed(4));
  const mid = Number((means[1] ?? 0).toFixed(4));
  const high = Number((means[2] ?? 0).toFixed(4));
  return { separation: Number(Math.min(mid - low, high - mid).toFixed(4)), low, mid, high };
}

/** 12종 혼합 브러시 스트로크에 대한 256×256 더티 타일 증분 합성 성능을 실측한다. */
function benchmark12MixedBrushDirtyTiles(
  paperPreset: PaperPresetId,
  dualMode: DualBrushTextureMode,
  seed: number,
): { readonly p95TileMs: number; readonly avgTileMs: number; readonly brushCount: number } {
  const compositor = new DirtyTileCompositor256(1024, 1024, PAPER_PRESETS[paperPreset].basePaperRgb);
  compositor.ensureLayer("dry-sketch", "normal", 1);
  compositor.ensureLayer("wax-under", "normal", 0.95);
  compositor.ensureLayer("wet-wash", "multiply", 0.85);
  compositor.ensureLayer("impasto-top", "normal", 1);

  const brushes: readonly {
    readonly layerId: string; readonly blend: "normal" | "multiply";
    readonly x: number; readonly y: number; readonly radius: number;
    readonly pigment: readonly [number, number, number]; readonly pressure: number; readonly paper: PaperPresetId;
  }[] = [
    { layerId: "dry-sketch", blend: "normal", x: 110, y: 120, radius: 14, pigment: [42, 44, 50], pressure: 0.55, paper: paperPreset },
    { layerId: "dry-sketch", blend: "normal", x: 370, y: 130, radius: 18, pigment: [34, 34, 38], pressure: 0.72, paper: "sketchbook-tooth" },
    { layerId: "wax-under", blend: "normal", x: 620, y: 140, radius: 16, pigment: [212, 168, 52], pressure: 0.85, paper: "rough-cotton" },
    { layerId: "wet-wash", blend: "multiply", x: 860, y: 150, radius: 22, pigment: [44, 118, 186], pressure: 0.65, paper: "cold-press" },
    { layerId: "wet-wash", blend: "multiply", x: 130, y: 380, radius: 19, pigment: [30, 32, 42], pressure: 0.82, paper: "kent" },
    { layerId: "impasto-top", blend: "normal", x: 380, y: 390, radius: 20, pigment: [196, 68, 52], pressure: 0.92, paper: "linen-canvas" },
    { layerId: "impasto-top", blend: "normal", x: 640, y: 400, radius: 17, pigment: [48, 134, 96], pressure: 0.88, paper: "linen-canvas" },
    { layerId: "dry-sketch", blend: "normal", x: 870, y: 410, radius: 16, pigment: [162, 86, 64], pressure: 0.68, paper: "rough-cotton" },
    { layerId: "wet-wash", blend: "multiply", x: 120, y: 650, radius: 20, pigment: [122, 74, 162], pressure: 0.6, paper: "cold-press" },
    { layerId: "wax-under", blend: "normal", x: 390, y: 660, radius: 15, pigment: [228, 196, 84], pressure: 0.78, paper: "sketchbook-tooth" },
    { layerId: "impasto-top", blend: "normal", x: 650, y: 670, radius: 18, pigment: [66, 98, 152], pressure: 0.84, paper: paperPreset },
    { layerId: "dry-sketch", blend: "normal", x: 880, y: 890, radius: 16, pigment: [58, 60, 68], pressure: 0.74, paper: paperPreset },
  ];

  for (let i = 0; i < brushes.length; i += 1) {
    const brush = brushes[i];
    if (!brush) continue;
    for (let d = 0; d < 3; d += 1) {
      compositor.paintBrushDab(brush.layerId, {
        dabX: brush.x + d * 10, dabY: brush.y + d * 4, dabRadiusPx: brush.radius,
        dabIndex: i * 8 + d, strokeDistancePx: d * 11, pressure: brush.pressure,
        paperPreset: brush.paper, dualMode, pigmentRgb: brush.pigment, flow: 0.82, seed,
      }, brush.blend);
    }
    compositor.flushDirtyTiles();
  }
  const metrics = compositor.getMetrics();
  return { p95TileMs: Number(metrics.p95TileMs.toFixed(3)), avgTileMs: Number(metrics.avgTileMs.toFixed(3)), brushCount: brushes.length };
}

/** 6대 브러시 물리 질감 핵심 지표를 실제 픽셀 버퍼 연산으로 전수 계측하고 합격 여부를 판정한다. */
export function auditBrushTextureQuality(options: BrushTextureOracleOptions = {}): BrushTextureQualityAuditReport {
  const paperPreset = options.paperPreset ?? "cold-press";
  const dualMode = options.dualMode ?? "rolling-tip";
  const pressureCurve = options.pressureCurve ?? "standard";
  const soakStrength = options.soakStrength ?? 0.68;
  const wetEdgeStrength = options.wetEdgeStrength ?? 0.82;
  const impastoLightAzimuthDeg = options.impastoLightAzimuthDeg ?? 315;
  const tiltDeg = options.tiltDeg ?? 54;
  const seed = options.seed ?? 1337;

  const contrasts: Record<PaperPresetId, number> = { kent: 0, "cold-press": 0, "rough-cotton": 0, "sketchbook-tooth": 0, "linen-canvas": 0 };
  for (const preset of PAPER_PRESET_LIST) {
    contrasts[preset.id] = measurePaperToothContrast(preset.id, dualMode, pressureCurve, tiltDeg, seed);
  }
  const paperToothContrastIndex = contrasts[paperPreset];
  const periodicity = measureGridPeriodicity(paperPreset, dualMode, seed);
  const pressure = measurePressureToneSeparation(paperPreset, dualMode, pressureCurve, seed);

  // 수채 웨트 엣지 실측
  const wetW = 56;
  const wetH = 56;
  const wetPaperRgb = PAPER_PRESETS[paperPreset].basePaperRgb;
  const wetBuf = createPaperCanvasBuffer(wetW, wetH, wetPaperRgb);
  const wetMap = new Float32Array(wetW * wetH);
  for (let y = 0; y < wetH; y += 1) {
    for (let x = 0; x < wetW; x += 1) {
      if (Math.hypot(x - 28, y - 28) <= 15.5) {
        const idx = y * wetW + x;
        wetMap[idx] = 0.92;
        const off = idx * 4;
        wetBuf[off] = 112;
        wetBuf[off + 1] = 160;
        wetBuf[off + 2] = 206;
      }
    }
  }
  const wetSim = simulateCapillarySoakAndWetEdge(wetBuf, wetW, wetH, {
    paperPreset, wetnessMap: wetMap, soakStrength, wetEdgeStrength, granulationStrength: 0.48, iterations: 3, paperSeed: seed,
  });
  const wetEdgeRingRatio = Number(wetSim.wetEdgeRingRatio.toFixed(4));

  // 왁스 레지스트 발수율 실측
  const waxW = 64;
  const waxH = 44;
  const waxBuf = createPaperCanvasBuffer(waxW, waxH, wetPaperRgb);
  const waxMask = new Float32Array(waxW * waxH);
  for (let i = 0; i < 6; i += 1) {
    stampDualBrushDabRgba(waxBuf, waxW, waxH, {
      dabX: 20 + i * 4.5, dabY: 22, dabRadiusPx: 9, dabIndex: i, strokeDistancePx: i * 4.5,
      pressure: 0.92, paperPreset, paperToothStrength: 0.45, dualMode: "fixed-world",
      secondaryContrast: 0.25, tipHardness: 0.72, flow: 0.95, pigmentRgb: [224, 182, 68], seed,
    }, { waxMask, waxDepositRate: 1.0 });
  }
  const waxInteraction = applyCrossMediaInteraction({
    mode: "wax-resist", baseRgba: waxBuf, width: waxW, height: waxH, paperPreset, paperSeed: seed,
    waxMask, watercolorColor: [32, 98, 174], watercolorCoverage: 0.76, resistStrength: 0.95,
  });
  const waxResistRejectionRatio = Number(waxInteraction.waxResistRejectionRatio.toFixed(4));
  const perf = benchmark12MixedBrushDirtyTiles(paperPreset, dualMode, seed);

  // 보조 물리 검증: 기울기 타원비 + 2.5D 임파스토 조명 명암폭
  const tiltSample = evaluateTiltGrazingShading({ tiltDeg: Math.max(45, tiltDeg), pressure: 0.65, paperHeight: 0.82 });
  const impW = 48;
  const impH = 36;
  const impBuf = createPaperCanvasBuffer(impW, impH, PAPER_PRESETS["linen-canvas"].basePaperRgb);
  const impField = new Float32Array(impW * impH);
  depositImpastoBristleRidge(impBuf, impField, impW, impH, { x0: 8, y0: 18, x1: 40, y1: 18, radiusPx: 9, pigmentRgb: [192, 76, 58], thickness: 1.0, bristleCount: 7 });
  const impLit = applyImpastoReliefLighting(impBuf, impField, impW, impH, { lightAzimuthDeg: impastoLightAzimuthDeg, lightElevationDeg: 36, reliefDepth: 1.05, specularStrength: 0.75, shadowStrength: 0.8 });
  const impastoLumaRange = Number((impLit.maxLuminanceBoost + impLit.maxShadowDrop).toFixed(2));

  const checks: readonly OracleMetricCheck[] = [
    { id: "paper-tooth-contrast", labelKo: "종이 이빨 미세 대비", labelEn: "Paper Tooth Contrast", value: paperToothContrastIndex, targetText: "≥ 0.080", unit: "", passed: paperToothContrastIndex >= 0.08 && contrasts["rough-cotton"] > contrasts.kent },
    { id: "grid-periodicity", labelKo: "격자·도장 반복성", labelEn: "Grid Periodicity", value: periodicity.score, targetText: "< 0.350", unit: "", passed: periodicity.score < 0.35 },
    { id: "pressure-tone-separation", labelKo: "저·중·고 필압 분리도", labelEn: "Pressure Tone Separation", value: pressure.separation, targetText: "≥ 0.080", unit: "", passed: pressure.low < pressure.mid && pressure.mid < pressure.high && pressure.separation >= 0.08 },
    { id: "wet-edge-ring", labelKo: "웨트 엣지 농축 비율", labelEn: "Wet-Edge Ring Ratio", value: wetEdgeRingRatio, targetText: "> 1.050×", unit: "×", passed: wetEdgeRingRatio > 1.05 },
    { id: "wax-resist-rejection", labelKo: "왁스 레지스트 발수율", labelEn: "Wax-Resist Rejection", value: waxResistRejectionRatio, targetText: "> 0.650", unit: "", passed: waxResistRejectionRatio > 0.65 },
    { id: "dirty-tile-p95", labelKo: "12종 혼합 더티 타일 p95", labelEn: "12-Brush Dirty Tile p95", value: perf.p95TileMs, targetText: "≤ 4.00 ms", unit: "ms", passed: perf.p95TileMs <= 4.0 },
  ];

  const passedCount = checks.filter((c) => c.passed).length;
  return {
    passed: passedCount === checks.length,
    score: Math.round((passedCount / checks.length) * 100),
    paperPreset, dualMode, pressureCurve, paperToothContrastIndex, paperPresetContrasts: contrasts,
    gridPeriodicityScore: periodicity.score, baselineLatticePeriodicityScore: periodicity.baselineScore,
    pressureToneSeparation: pressure.separation, pressureToneBands: { low: pressure.low, mid: pressure.mid, high: pressure.high },
    wetEdgeRingRatio, waxResistRejectionRatio, p95TileMs: perf.p95TileMs, avgTileMs: perf.avgTileMs,
    dirtyTileBrushCount: perf.brushCount, tiltGrazingAspectRatio: Number(tiltSample.ellipseAspect.toFixed(2)),
    impastoLumaRange, checks,
  };
}

/** UI 패널의 실시간 Canvas2D 질감 스와치 프리뷰용 실제 픽셀 버퍼를 합성한다. */
export function renderBrushPhysicsLiveSwatch(
  config: BrushPhysicsLiveSwatchConfig,
  width = 240,
  height = 132,
): BrushPhysicsLiveSwatchResult {
  const seed = config.seed ?? 1337;
  const paperRgb = PAPER_PRESETS[config.paperPreset].basePaperRgb;
  const rgba = createPaperCanvasBuffer(width, height, paperRgb);

  for (let i = 0; i < 16; i += 1) {
    const t = i / 15;
    stampDualBrushDabRgba(rgba, width, height, {
      dabX: 16 + t * 88, dabY: 34 + Math.sin(t * Math.PI) * 10, dabRadiusPx: 10, dabIndex: i,
      strokeDistancePx: i * 6, strokeAngleRad: 0.15, pressure: 0.25 + t * 0.68,
      pressureCurve: config.pressureCurve, tiltDeg: config.tiltDeg, paperPreset: config.paperPreset,
      paperToothStrength: 0.9, dualMode: config.dualMode, secondaryContrast: 0.74, flow: 0.84,
      pigmentRgb: [38, 40, 48], seed,
    });
  }

  const wetW = 64;
  const wetH = 56;
  const wetPatch = createPaperCanvasBuffer(wetW, wetH, paperRgb);
  const wetMap = new Float32Array(wetW * wetH);
  for (let y = 0; y < wetH; y += 1) {
    for (let x = 0; x < wetW; x += 1) {
      if (Math.hypot(x - 32, y - 28) <= 18) {
        const idx = y * wetW + x;
        wetMap[idx] = 0.9;
        const off = idx * 4;
        wetPatch[off] = 98;
        wetPatch[off + 1] = 152;
        wetPatch[off + 2] = 204;
      }
    }
  }
  const wetResult = simulateCapillarySoakAndWetEdge(wetPatch, wetW, wetH, {
    paperPreset: config.paperPreset, wetnessMap: wetMap, soakStrength: config.soakStrength,
    wetEdgeStrength: config.wetEdgeStrength, granulationStrength: 0.5, iterations: 2, paperSeed: seed,
  });
  blitPatch(rgba, width, height, wetResult.rgba, wetW, wetH, 110, 6, paperRgb);

  const impW = 58;
  const impH = 56;
  const impPatch = createPaperCanvasBuffer(impW, impH, paperRgb);
  const impHeight = new Float32Array(impW * impH);
  depositImpastoBristleRidge(impPatch, impHeight, impW, impH, { x0: 10, y0: 42, x1: 48, y1: 14, radiusPx: 11, pigmentRgb: [198, 78, 56], thickness: 1.05, bristleCount: 7 });
  const impLit = applyImpastoReliefLighting(impPatch, impHeight, impW, impH, { lightAzimuthDeg: config.impastoLightAzimuthDeg, lightElevationDeg: 38, reliefDepth: 1.1, specularStrength: 0.78, shadowStrength: 0.82 });
  blitPatch(rgba, width, height, impLit.rgba, impW, impH, 178, 6, paperRgb);

  const botW = width - 20;
  const botH = 52;
  const botPatch = createPaperCanvasBuffer(botW, botH, paperRgb);
  let interactionMetricValue: number;
  let interactionOut: Uint8ClampedArray;

  if (config.interactionMode === "wax-resist") {
    const waxMask = new Float32Array(botW * botH);
    for (let i = 0; i < 14; i += 1) {
      stampDualBrushDabRgba(botPatch, botW, botH, {
        dabX: 38 + i * 10, dabY: 26 + Math.sin(i * 0.6) * 8, dabRadiusPx: 9, dabIndex: i, strokeDistancePx: i * 10,
        pressure: 0.9, paperPreset: config.paperPreset, paperToothStrength: 0.45, dualMode: "fixed-world",
        flow: 0.95, pigmentRgb: [226, 184, 62], seed,
      }, { waxMask, waxDepositRate: 1.0 });
    }
    const res = applyCrossMediaInteraction({
      mode: "wax-resist", baseRgba: botPatch, width: botW, height: botH, paperPreset: config.paperPreset,
      paperSeed: seed, waxMask, watercolorColor: [36, 108, 182], watercolorCoverage: 0.74, resistStrength: 0.94,
    });
    interactionOut = res.rgba;
    interactionMetricValue = Number(res.waxResistRejectionRatio.toFixed(3));
  } else {
    for (let i = 0; i < 16; i += 1) {
      stampDualBrushDabRgba(botPatch, botW, botH, {
        dabX: 16 + i * 12, dabY: 26, dabRadiusPx: 14, dabIndex: i, strokeDistancePx: i * 12,
        pressure: 0.56, tiltDeg: 58, paperPreset: config.paperPreset, paperToothStrength: 0.96,
        dualMode: "fixed-world", flow: 0.55, pigmentRgb: [46, 48, 56], seed,
      });
    }
    const toolMask = new Float32Array(botW * botH);
    for (let y = 10; y < 42; y += 1) {
      for (let x = 76; x < 164; x += 1) toolMask[y * botW + x] = 0.92;
    }
    const res = applyCrossMediaInteraction({
      mode: config.interactionMode, baseRgba: botPatch, width: botW, height: botH,
      paperPreset: config.paperPreset, paperSeed: seed, toolMask, strength: 0.82, smudgeRadiusPx: 2,
    });
    interactionOut = res.rgba;
    interactionMetricValue = config.interactionMode === "kneaded-eraser"
      ? Number((res.peakLiftDelta - res.valleyLiftDelta).toFixed(2))
      : Number(res.valleyFillDelta.toFixed(2));
  }
  blitPatch(rgba, width, height, interactionOut, botW, botH, 10, 72, paperRgb);

  const tiltPreview = evaluateTiltGrazingShading({ tiltDeg: config.tiltDeg, pressure: 0.65, paperHeight: 0.78 });
  return {
    width, height, rgba,
    paperContrastIndex: measurePaperToothContrast(config.paperPreset, config.dualMode, config.pressureCurve, config.tiltDeg, seed),
    tiltEllipseAspect: Number(tiltPreview.ellipseAspect.toFixed(2)),
    wetEdgeRingRatio: Number(wetResult.wetEdgeRingRatio.toFixed(3)),
    impastoLumaRange: Number((impLit.maxLuminanceBoost + impLit.maxShadowDrop).toFixed(1)),
    interactionMetricValue,
  };
}
