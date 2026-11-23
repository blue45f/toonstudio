/**
 * 차세대 드로잉 프런티어 코어 엔진 (Wave 26A):
 * 1) 비파괴 벡터-래스터 하이브리드 스트로크 (`rebindHybridStrokeMedium`)
 * 2) 실시간 물감 건조 타이머 & 즉시 건조 습도맵 (`WetnessMapEngine`)
 * 3) 2D 거리장 법선 추정 광원 핀 1-클릭 자동 셀 음영 (`generateAutoCelShadingLayers`)
 * 4) Linear-Float16(16-bit HDR) 합성 & 삼각 PDF 블루노이즈 디더링 (`compositeLinearFloat16Layers`)
 */

export type HybridStrokeMedium = "pencil" | "crayon" | "charcoal" | "watercolor" | "oil";
export type WetnessZoneState = "wet" | "damp" | "dry";
export type WetnessMediumMode = "watercolor" | "oil";
export type HdrBlendMode = "normal" | "multiply" | "screen" | "add" | "soft-light";

export interface HybridStrokeControlPoint {
  readonly x: number; readonly y: number; readonly pressure: number;
  readonly tiltX: number; readonly tiltY: number; readonly twistDeg?: number; readonly timestampMs: number;
}
export interface HybridStrokeColor { readonly r: number; readonly g: number; readonly b: number; readonly alpha?: number; }
export interface HybridStrokeMediumRevision { readonly revision: number; readonly medium: HybridStrokeMedium; readonly widthScale: number; }
export interface HybridStrokeRecord {
  readonly id: string; readonly medium: HybridStrokeMedium; readonly baseWidthPx: number; readonly widthScale: number;
  readonly color: HybridStrokeColor; readonly revision: number;
  readonly controlPoints: readonly HybridStrokeControlPoint[]; readonly mediumHistory: readonly HybridStrokeMediumRevision[];
}
export interface HybridMediumPhysicsProfile {
  readonly medium: HybridStrokeMedium; readonly labelKo: string; readonly labelEn: string;
  readonly grainIntensity01: number; readonly wetnessDeposit01: number; readonly tiltBroadeningGain: number;
  readonly edgeGranulation01: number; readonly impastoRidge01: number; readonly opacityCurveGamma: number; readonly spacingRatio: number;
}
export interface HybridRasterDab {
  readonly x: number; readonly y: number; readonly radiusPx: number; readonly opacity01: number;
  readonly grainFactor01: number; readonly wetness01: number; readonly edgePigmentPool01: number;
  readonly impastoHeight01: number; readonly tiltAngleRad: number;
}
export interface RebindHybridStrokeOptions {
  readonly targetMedium: HybridStrokeMedium; readonly widthScale?: number; readonly color?: HybridStrokeColor;
  readonly canvasWidth?: number; readonly canvasHeight?: number; readonly paperToothSeed?: number;
}
export interface HybridStrokeRebindResult {
  readonly stroke: HybridStrokeRecord; readonly profile: HybridMediumPhysicsProfile;
  readonly preservedControlPointCount: number; readonly controlPointChecksum: string;
  readonly dabs: readonly HybridRasterDab[]; readonly rasterWidth: number; readonly rasterHeight: number;
  readonly rasterRgba: Uint8ClampedArray; readonly activePixelCount: number; readonly meanStrokeWidthPx: number;
  readonly wetnessInjectedMean: number; readonly meanEdgePigmentPool01: number; readonly meanImpastoHeight01: number;
}
export interface WetnessEngineOptions {
  readonly width: number; readonly height: number; readonly medium?: WetnessMediumMode;
  readonly ambientHumidity01?: number; readonly evaporationMultiplier?: number;
}
export interface WetnessBleedEvaluation {
  readonly state: WetnessZoneState; readonly wetness01: number; readonly canBleed: boolean;
  readonly bleedCoefficient01: number; readonly neighborWetRatio01: number;
}
export interface WetnessTickReport {
  readonly deltaSeconds: number; readonly elapsedSeconds: number; readonly diffusedCellCount: number;
  readonly wetCellCount: number; readonly dampCellCount: number; readonly dryCellCount: number;
  readonly meanWetness01: number; readonly maxWetness01: number;
}
export interface DryerSpotRegion { readonly cx: number; readonly cy: number; readonly radius: number; }
export interface DryerResult {
  readonly scope: "canvas" | "spot"; readonly driedCellCount: number;
  readonly residualMaxWetness: number; readonly residualMeanWetness: number; readonly totalDryerUses: number;
}
export interface WetnessMapSnapshot {
  readonly width: number; readonly height: number; readonly medium: WetnessMediumMode; readonly elapsedSeconds: number;
  readonly wetCellCount: number; readonly dampCellCount: number; readonly dryCellCount: number;
  readonly meanWetness01: number; readonly maxWetness01: number; readonly estimatedFullDrySec: number;
  readonly wetnessGrid: Float32Array; readonly rgbaPreview: Uint8ClampedArray;
}
export interface LightPinVector { readonly lx: number; readonly ly: number; readonly lz: number; }
export interface AutoCelShadingInput {
  readonly width: number; readonly height: number; readonly silhouetteAlpha: Uint8ClampedArray;
  readonly lightPin: LightPinVector; readonly shadowThreshold?: number; readonly rimWidth01?: number;
  readonly bounceStrength01?: number; readonly celSoftness?: number; readonly baseColor?: HybridStrokeColor;
}
export interface AutoCelShadingResult {
  readonly width: number; readonly height: number; readonly normalizedLight: LightPinVector;
  readonly primaryShadowMask: Uint8ClampedArray; readonly rimLightMask: Uint8ClampedArray;
  readonly bounceLightMask: Uint8ClampedArray; readonly normalMapRgba: Uint8ClampedArray;
  readonly compositePreviewRgba: Uint8ClampedArray; readonly silhouettePixelCount: number;
  readonly shadowCoverageRatio01: number; readonly rimCoverageRatio01: number; readonly bounceCoverageRatio01: number;
  readonly shadowCentroidX01: number; readonly shadowCentroidY01: number;
  readonly rimCentroidX01: number; readonly rimCentroidY01: number; readonly bounceCentroidX01: number;
}
export interface LinearHdrLayerInput {
  readonly id: string; readonly name: string; readonly blendMode: HdrBlendMode;
  readonly opacity01: number; readonly visible?: boolean; readonly linearRgba: Float32Array;
}
export interface CompositeHdrOptions {
  readonly width: number; readonly height: number; readonly layers: readonly LinearHdrLayerInput[];
  readonly exposureEv?: number; readonly enableTpdfBlueNoiseDither?: boolean; readonly toneMap?: "aces" | "clamp";
}
export interface HdrCompositeMetrics {
  readonly peakLinearLuminance: number; readonly hdrSpecularPixelCount: number;
  readonly ditheredRmsErrorVsLinear: number; readonly unditheredRmsErrorVsLinear: number;
  readonly naiveBandingRunMax: number; readonly ditheredBandingRunMax: number;
  readonly bandingEliminationRatio01: number; readonly ditherMode: "tpdf-blue-noise" | "none";
}
export interface LinearFloat16CompositeResult {
  readonly width: number; readonly height: number; readonly linearFloat16Buffer: Uint16Array;
  readonly linearFloat32Buffer: Float32Array; readonly outputRgba8: Uint8ClampedArray;
  readonly unditheredRgba8: Uint8ClampedArray; readonly metrics: HdrCompositeMetrics;
}

export const HYBRID_MEDIUM_PROFILES: Record<HybridStrokeMedium, HybridMediumPhysicsProfile> = {
  pencil: { medium: "pencil", labelKo: "흑연 연필", labelEn: "Graphite Pencil", grainIntensity01: 0.72, wetnessDeposit01: 0, tiltBroadeningGain: 1.45, edgeGranulation01: 0.12, impastoRidge01: 0, opacityCurveGamma: 1.25, spacingRatio: 0.24 },
  crayon: { medium: "crayon", labelKo: "오일 크레용", labelEn: "Wax Crayon", grainIntensity01: 0.88, wetnessDeposit01: 0, tiltBroadeningGain: 1.65, edgeGranulation01: 0.28, impastoRidge01: 0.22, opacityCurveGamma: 0.92, spacingRatio: 0.3 },
  charcoal: { medium: "charcoal", labelKo: "목탄 차콜", labelEn: "Vine Charcoal", grainIntensity01: 0.8, wetnessDeposit01: 0, tiltBroadeningGain: 2.15, edgeGranulation01: 0.34, impastoRidge01: 0.05, opacityCurveGamma: 1.08, spacingRatio: 0.26 },
  watercolor: { medium: "watercolor", labelKo: "투명 수채화", labelEn: "Watercolor Wash", grainIntensity01: 0.22, wetnessDeposit01: 0.92, tiltBroadeningGain: 0.75, edgeGranulation01: 0.86, impastoRidge01: 0, opacityCurveGamma: 0.78, spacingRatio: 0.2 },
  oil: { medium: "oil", labelKo: "두꺼운 유화", labelEn: "Impasto Oil", grainIntensity01: 0.36, wetnessDeposit01: 0.58, tiltBroadeningGain: 1.05, edgeGranulation01: 0.18, impastoRidge01: 0.9, opacityCurveGamma: 0.65, spacingRatio: 0.18 },
};
export const HYBRID_MEDIUM_LIST: readonly HybridStrokeMedium[] = ["pencil", "crayon", "charcoal", "watercolor", "oil"];

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
function smoothstep(edge0: number, edge1: number, x: number): number {
  const span = edge1 - edge0;
  if (Math.abs(span) < 1e-6) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / span, 0, 1);
  return t * t * (3 - 2 * t);
}
function deterministicPaperGrain(x: number, y: number, seed: number): number {
  let h = (Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 1274126177, 2246822519) ^ Math.imul(seed + 17, 3266489917)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** 제어점 이력 불변성을 증명하는 FNV-1a 체크섬을 산출한다. */
export function computeControlPointChecksum(points: readonly HybridStrokeControlPoint[]): string {
  let hash = 2166136261;
  for (const pt of points) {
    for (const v of [pt.x, pt.y, pt.pressure, pt.tiltX, pt.tiltY, pt.twistDeg ?? 0, pt.timestampMs]) {
      const s = Math.round(v * 10000);
      hash = Math.imul((hash ^ (s & 255)) >>> 0, 16777619) >>> 0;
      hash = Math.imul((hash ^ ((s >>> 8) & 255)) >>> 0, 16777619) >>> 0;
    }
  }
  return `cp-${hash.toString(16).padStart(8, "0")}`;
}

/** 제어점·필압·기울기를 무손실 보존한 채 매체(연필↔크레용↔차콜↔수채↔유화)와 굵기 스케일을 재합성한다. */
export function rebindHybridStrokeMedium(stroke: HybridStrokeRecord, options: RebindHybridStrokeOptions): HybridStrokeRebindResult {
  const profile = HYBRID_MEDIUM_PROFILES[options.targetMedium];
  const widthScale = clamp(options.widthScale ?? stroke.widthScale, 0.25, 4.0);
  const color = options.color ?? stroke.color;
  const rasterWidth = Math.max(16, Math.round(options.canvasWidth ?? 96));
  const rasterHeight = Math.max(16, Math.round(options.canvasHeight ?? 64));
  const seed = options.paperToothSeed ?? 42;

  const preservedPoints: readonly HybridStrokeControlPoint[] = stroke.controlPoints.map((pt) => ({
    x: pt.x, y: pt.y, pressure: pt.pressure, tiltX: pt.tiltX, tiltY: pt.tiltY,
    ...(pt.twistDeg !== undefined ? { twistDeg: pt.twistDeg } : {}), timestampMs: pt.timestampMs,
  }));
  const nextRevision = stroke.revision + 1;
  const reboundStroke: HybridStrokeRecord = {
    id: stroke.id, medium: options.targetMedium, baseWidthPx: stroke.baseWidthPx, widthScale, revision: nextRevision,
    color: { r: clamp(color.r, 0, 255), g: clamp(color.g, 0, 255), b: clamp(color.b, 0, 255), alpha: clamp(color.alpha ?? 1, 0.05, 1) },
    controlPoints: preservedPoints,
    mediumHistory: [...stroke.mediumHistory, { revision: nextRevision, medium: options.targetMedium, widthScale }],
  };
  const dabs: HybridRasterDab[] = [];
  for (let i = 0; i < preservedPoints.length; i += 1) {
    const p1 = preservedPoints[i]; const p2 = preservedPoints[Math.min(i + 1, preservedPoints.length - 1)];
    if (!p1 || !p2) continue;
    const dx = p2.x - p1.x; const dy = p2.y - p1.y;
    const stepDist = Math.max(0.75, stroke.baseWidthPx * widthScale * (0.35 + 0.65 * clamp((p1.pressure + p2.pressure) * 0.5, 0.05, 1)) * profile.spacingRatio);
    const steps = i === preservedPoints.length - 1 ? 1 : Math.max(1, Math.ceil(Math.hypot(dx, dy) / stepDist));
    for (let s = 0; s < steps; s += 1) {
      const t = steps === 1 ? 0 : s / steps;
      const pressure = clamp(p1.pressure + (p2.pressure - p1.pressure) * t, 0.05, 1);
      const tiltX = clamp(p1.tiltX + (p2.tiltX - p1.tiltX) * t, -1, 1); const tiltY = clamp(p1.tiltY + (p2.tiltY - p1.tiltY) * t, -1, 1);
      const tiltMag = Math.min(1, Math.hypot(tiltX, tiltY));
      dabs.push({
        x: p1.x + dx * t, y: p1.y + dy * t,
        radiusPx: Math.max(0.75, stroke.baseWidthPx * widthScale * 0.5 * (0.28 + 0.72 * pressure) * (1 + tiltMag * 0.55 * profile.tiltBroadeningGain)),
        opacity01: clamp(Math.pow(pressure, profile.opacityCurveGamma) * (reboundStroke.color.alpha ?? 1), 0.08, 1),
        grainFactor01: clamp(profile.grainIntensity01 * (0.55 + 0.45 * tiltMag), 0, 1),
        wetness01: clamp(profile.wetnessDeposit01 * (0.65 + 0.35 * pressure), 0, 1),
        edgePigmentPool01: clamp(profile.edgeGranulation01 * (0.6 + 0.4 * (1 - pressure * 0.3)), 0, 1),
        impastoHeight01: clamp(profile.impastoRidge01 * pressure, 0, 1), tiltAngleRad: Math.atan2(dy || tiltY, dx || tiltX || 1),
      });
    }
  }

  const totalPx = rasterWidth * rasterHeight;
  const rasterRgba = new Uint8ClampedArray(totalPx * 4);
  const accumA = new Float32Array(totalPx); const accumRgb = new Float32Array(totalPx * 3);
  const { r: cr, g: cg, b: cb } = reboundStroke.color;

  for (const dab of dabs) {
    const rCeil = Math.ceil(dab.radiusPx + 1);
    const minX = Math.max(0, Math.floor(dab.x - rCeil)); const maxX = Math.min(rasterWidth - 1, Math.ceil(dab.x + rCeil));
    const minY = Math.max(0, Math.floor(dab.y - rCeil)); const maxY = Math.min(rasterHeight - 1, Math.ceil(dab.y + rCeil));
    const cosA = Math.cos(dab.tiltAngleRad); const sinA = Math.sin(dab.tiltAngleRad);
    for (let py = minY; py <= maxY; py += 1) {
      for (let px = minX; px <= maxX; px += 1) {
        const rx = px - dab.x; const ry = py - dab.y;
        const distNorm = Math.hypot(rx, ry) / Math.max(0.5, dab.radiusPx);
        if (distNorm > 1) continue;
        const grain = deterministicPaperGrain(px, py, seed);
        let density = (1 - smoothstep(0.55, 1.0, distNorm)) * dab.opacity01;
        if (profile.medium === "crayon") density *= grain > 0.28 * dab.grainFactor01 ? 1.0 : 0.14;
        else if (profile.medium === "pencil" || profile.medium === "charcoal") density *= 1 - dab.grainFactor01 * 0.55 * (1 - grain);
        else if (profile.medium === "watercolor") density *= 0.42 + dab.edgePigmentPool01 * 0.95 * smoothstep(0.55, 0.94, distNorm) * (1 - smoothstep(0.94, 1.0, distNorm));
        else density = clamp(density * 1.15 * (0.76 + 0.24 * Math.sin(Math.abs(-rx * sinA + ry * cosA) * 2.4)), 0, 1);
        const idx = py * rasterWidth + px; const prevA = accumA[idx] ?? 0; const nextA = prevA + density * (1 - prevA);
        if (nextA > 0) {
          const shade = profile.medium === "oil" ? 1 + dab.impastoHeight01 * 0.12 * (grain - 0.5) : profile.medium === "watercolor" && distNorm > 0.65 ? 0.88 : 1;
          const w = (density * (1 - prevA)) / nextA; const p = idx * 3;
          accumRgb[p] = (accumRgb[p] ?? cr) * (1 - w) + clamp(cr * shade, 0, 255) * w;
          accumRgb[p + 1] = (accumRgb[p + 1] ?? cg) * (1 - w) + clamp(cg * shade, 0, 255) * w;
          accumRgb[p + 2] = (accumRgb[p + 2] ?? cb) * (1 - w) + clamp(cb * shade, 0, 255) * w;
          accumA[idx] = nextA;
        }
      }
    }
  }

  let activePixelCount = 0;
  for (let i = 0; i < totalPx; i += 1) {
    const a = clamp(accumA[i] ?? 0, 0, 1);
    if (a > 0.02) activePixelCount += 1;
    const o = i * 4; const p = i * 3;
    rasterRgba[o] = Math.round(clamp(accumRgb[p] ?? 0, 0, 255)); rasterRgba[o + 1] = Math.round(clamp(accumRgb[p + 1] ?? 0, 0, 255));
    rasterRgba[o + 2] = Math.round(clamp(accumRgb[p + 2] ?? 0, 0, 255)); rasterRgba[o + 3] = Math.round(a * 255);
  }
  const n = Math.max(1, dabs.length);
  return {
    stroke: reboundStroke, profile, preservedControlPointCount: preservedPoints.length,
    controlPointChecksum: computeControlPointChecksum(preservedPoints),
    dabs, rasterWidth, rasterHeight, rasterRgba, activePixelCount,
    meanStrokeWidthPx: dabs.reduce((s, d) => s + d.radiusPx * 2, 0) / n,
    wetnessInjectedMean: dabs.reduce((s, d) => s + d.wetness01, 0) / n,
    meanEdgePigmentPool01: dabs.reduce((s, d) => s + d.edgePigmentPool01, 0) / n,
    meanImpastoHeight01: dabs.reduce((s, d) => s + d.impastoHeight01, 0) / n,
  };
}

/** UI·테스트용 데모 하이브리드 스트로크를 생성한다. */
export function createDemoHybridStroke(medium: HybridStrokeMedium = "watercolor"): HybridStrokeRecord {
  const controlPoints: readonly HybridStrokeControlPoint[] = [
    { x: 10, y: 44, pressure: 0.25, tiltX: -0.3, tiltY: 0.2, twistDeg: 12, timestampMs: 0 },
    { x: 24, y: 28, pressure: 0.62, tiltX: -0.15, tiltY: 0.35, twistDeg: 18, timestampMs: 36 },
    { x: 42, y: 22, pressure: 0.88, tiltX: 0.1, tiltY: 0.4, twistDeg: 24, timestampMs: 74 },
    { x: 60, y: 34, pressure: 0.78, tiltX: 0.32, tiltY: 0.22, twistDeg: 30, timestampMs: 112 },
    { x: 76, y: 40, pressure: 0.52, tiltX: 0.45, tiltY: -0.1, twistDeg: 22, timestampMs: 148 },
    { x: 86, y: 26, pressure: 0.3, tiltX: 0.55, tiltY: -0.25, twistDeg: 15, timestampMs: 184 },
  ];
  return {
    id: "hybrid-stroke-demo-01", medium, baseWidthPx: 7.5, widthScale: 1.0,
    color: { r: 44, g: 108, b: 176, alpha: 0.94 }, revision: 1,
    controlPoints, mediumHistory: [{ revision: 1, medium, widthScale: 1.0 }],
  };
}

const WET_THRESHOLD = 0.45;
const DAMP_THRESHOLD = 0.08;

/** 실시간 수채/유화 물감 건조 타이머 · 젖은 경계 한정 번짐 · 헤어드라이어 즉시 건조 엔진. */
export class WetnessMapEngine {
  readonly width: number;
  readonly height: number;
  private medium: WetnessMediumMode;
  private readonly ambientHumidity01: number;
  private readonly evaporationMultiplier: number;
  private wetness: Float32Array;
  private pigmentRgb: Float32Array;
  private elapsedSeconds = 0;
  private dryerUses = 0;

  constructor(options: WetnessEngineOptions) {
    this.width = Math.max(4, Math.round(options.width));
    this.height = Math.max(4, Math.round(options.height));
    this.medium = options.medium ?? "watercolor";
    this.ambientHumidity01 = clamp(options.ambientHumidity01 ?? 0.35, 0, 0.95);
    this.evaporationMultiplier = clamp(options.evaporationMultiplier ?? 1, 0.1, 10);
    const total = this.width * this.height;
    this.wetness = new Float32Array(total);
    this.pigmentRgb = new Float32Array(total * 3);
  }

  getMedium(): WetnessMediumMode { return this.medium; }
  setMedium(next: WetnessMediumMode): void { this.medium = next; }
  private evaporationRatePerSec(): number {
    return (this.medium === "watercolor" ? 0.055 : 0.011) * (1 - 0.62 * this.ambientHumidity01) * this.evaporationMultiplier;
  }

  depositWetStroke(cx: number, cy: number, radius: number, wetnessAmount: number, pigment?: HybridStrokeColor): number {
    const r = Math.max(0.8, radius); const amount = clamp(wetnessAmount, 0, 1);
    const minX = Math.max(0, Math.floor(cx - r)); const maxX = Math.min(this.width - 1, Math.ceil(cx + r));
    const minY = Math.max(0, Math.floor(cy - r)); const maxY = Math.min(this.height - 1, Math.ceil(cy + r));
    let touched = 0;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d > 1) continue;
        const falloff = 1 - smoothstep(0.4, 1, d);
        const idx = y * this.width + x; const prev = this.wetness[idx] ?? 0;
        this.wetness[idx] = clamp(prev + amount * falloff * (1 - prev * 0.55), 0, 1);
        if (pigment) {
          const blend = clamp(falloff * (prev >= DAMP_THRESHOLD ? 0.55 : 0.9), 0, 1);
          const p = idx * 3;
          this.pigmentRgb[p] = (this.pigmentRgb[p] ?? 0) * (1 - blend) + pigment.r * blend;
          this.pigmentRgb[p + 1] = (this.pigmentRgb[p + 1] ?? 0) * (1 - blend) + pigment.g * blend;
          this.pigmentRgb[p + 2] = (this.pigmentRgb[p + 2] ?? 0) * (1 - blend) + pigment.b * blend;
        }
        touched += 1;
      }
    }
    return touched;
  }

  depositHybridStrokeDabs(dabs: readonly HybridRasterDab[], pigment?: HybridStrokeColor): number {
    let total = 0;
    for (const dab of dabs) if (dab.wetness01 > 0) total += this.depositWetStroke(dab.x, dab.y, dab.radiusPx, dab.wetness01, pigment);
    return total;
  }

  getWetnessAt(x: number, y: number): number {
    return this.wetness[clamp(Math.round(y), 0, this.height - 1) * this.width + clamp(Math.round(x), 0, this.width - 1)] ?? 0;
  }

  /** 픽셀의 Wet/Damp/Dry 상태와 젖은 경계 번짐 물리 판정을 반환한다. */
  evaluateBoundaryBleed(x: number, y: number): WetnessBleedEvaluation {
    const ix = clamp(Math.round(x), 0, this.width - 1); const iy = clamp(Math.round(y), 0, this.height - 1);
    const w = this.wetness[iy * this.width + ix] ?? 0;
    const state: WetnessZoneState = w >= WET_THRESHOLD ? "wet" : w >= DAMP_THRESHOLD ? "damp" : "dry";
    let wetNb = 0; let totalNb = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = ix + dx; const ny = iy + dy;
        if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) continue;
        totalNb += 1;
        if ((this.wetness[ny * this.width + nx] ?? 0) >= DAMP_THRESHOLD) wetNb += 1;
      }
    }
    const neighborWetRatio01 = totalNb > 0 ? wetNb / totalNb : 0;
    const canBleed = state !== "dry";
    return {
      state, wetness01: w, canBleed, neighborWetRatio01,
      bleedCoefficient01: canBleed ? clamp(((w - DAMP_THRESHOLD) / (1 - DAMP_THRESHOLD)) * (0.45 + 0.55 * neighborWetRatio01), 0, 1) : 0,
    };
  }

  /** 경과 시간만큼 Wet→Damp→Dry 감쇠 및 젖은 경계 한정 확산을 진행한다. */
  stepTime(deltaSeconds: number): WetnessTickReport {
    const dt = Math.max(0, deltaSeconds);
    this.elapsedSeconds += dt;
    const decay = Math.exp(-this.evaporationRatePerSec() * dt);
    const diffCoeff = (this.medium === "watercolor" ? 0.24 : 0.07) * clamp(dt / 2, 0.05, 0.8);
    const nextWet = new Float32Array(this.wetness.length);
    const nextPigment = new Float32Array(this.pigmentRgb);
    let diffusedCellCount = 0;
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const idx = y * this.width + x; const w = this.wetness[idx] ?? 0;
        if (w < DAMP_THRESHOLD) { const d = w * decay; nextWet[idx] = d < 1e-4 ? 0 : d; continue; }
        const p = idx * 3;
        let sumW = w; let sR = (this.pigmentRgb[p] ?? 0) * w; let sG = (this.pigmentRgb[p + 1] ?? 0) * w; let sB = (this.pigmentRgb[p + 2] ?? 0) * w; let count = 1;
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
          if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) continue;
          const nIdx = ny * this.width + nx; const nw = this.wetness[nIdx] ?? 0;
          if (nw >= DAMP_THRESHOLD) {
            const np = nIdx * 3;
            sumW += nw; sR += (this.pigmentRgb[np] ?? 0) * nw; sG += (this.pigmentRgb[np + 1] ?? 0) * nw; sB += (this.pigmentRgb[np + 2] ?? 0) * nw; count += 1;
          }
        }
        if (count > 1) {
          diffusedCellCount += 1;
          const decayed = (w * (1 - diffCoeff) + (sumW / count) * diffCoeff) * decay;
          nextWet[idx] = decayed < 1e-4 ? 0 : decayed;
          const safeW = Math.max(1e-5, sumW);
          nextPigment[p] = (this.pigmentRgb[p] ?? 0) * (1 - diffCoeff) + (sR / safeW) * diffCoeff;
          nextPigment[p + 1] = (this.pigmentRgb[p + 1] ?? 0) * (1 - diffCoeff) + (sG / safeW) * diffCoeff;
          nextPigment[p + 2] = (this.pigmentRgb[p + 2] ?? 0) * (1 - diffCoeff) + (sB / safeW) * diffCoeff;
        } else {
          const d = w * decay; nextWet[idx] = d < 1e-4 ? 0 : d;
        }
      }
    }
    this.wetness = nextWet; this.pigmentRgb = nextPigment;
    return { deltaSeconds: dt, elapsedSeconds: this.elapsedSeconds, diffusedCellCount, ...this.computeStats() };
  }

  /** 헤어드라이어 즉시 건조: 잔여 습도를 정확히 0.000으로 제거한다. */
  applyHairDryerInstantDry(region?: DryerSpotRegion): DryerResult {
    this.dryerUses += 1;
    let driedCellCount = 0;
    if (!region) {
      for (let i = 0; i < this.wetness.length; i += 1) { if ((this.wetness[i] ?? 0) > 0) driedCellCount += 1; this.wetness[i] = 0; }
      return { scope: "canvas", driedCellCount, residualMaxWetness: 0, residualMeanWetness: 0, totalDryerUses: this.dryerUses };
    }
    const r = Math.max(1, region.radius);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        if (Math.hypot(x - region.cx, y - region.cy) <= r) {
          const idx = y * this.width + x;
          if ((this.wetness[idx] ?? 0) > 0) driedCellCount += 1;
          this.wetness[idx] = 0;
        }
      }
    }
    return { scope: "spot", driedCellCount, residualMaxWetness: 0, residualMeanWetness: 0, totalDryerUses: this.dryerUses };
  }

  private computeStats() {
    let wetCellCount = 0; let dampCellCount = 0; let dryCellCount = 0; let sum = 0; let max = 0;
    for (let i = 0; i < this.wetness.length; i += 1) {
      const w = this.wetness[i] ?? 0;
      sum += w; if (w > max) max = w;
      if (w >= WET_THRESHOLD) wetCellCount += 1; else if (w >= DAMP_THRESHOLD) dampCellCount += 1; else dryCellCount += 1;
    }
    return { wetCellCount, dampCellCount, dryCellCount, meanWetness01: sum / Math.max(1, this.wetness.length), maxWetness01: max };
  }

  getSnapshot(): WetnessMapSnapshot {
    const stats = this.computeStats();
    const rate = Math.max(1e-4, this.evaporationRatePerSec());
    const estimatedFullDrySec = stats.maxWetness01 <= DAMP_THRESHOLD ? 0 : Math.log(stats.maxWetness01 / DAMP_THRESHOLD) / rate;
    const rgbaPreview = new Uint8ClampedArray(this.wetness.length * 4);
    for (let i = 0; i < this.wetness.length; i += 1) {
      const w = this.wetness[i] ?? 0; const o = i * 4;
      if (w >= WET_THRESHOLD) { rgbaPreview[o] = 36; rgbaPreview[o + 1] = 132; rgbaPreview[o + 2] = 218; rgbaPreview[o + 3] = Math.round(110 + w * 145); }
      else if (w >= DAMP_THRESHOLD) { rgbaPreview[o] = 112; rgbaPreview[o + 1] = 178; rgbaPreview[o + 2] = 204; rgbaPreview[o + 3] = Math.round(70 + w * 120); }
      else { rgbaPreview[o] = 224; rgbaPreview[o + 1] = 218; rgbaPreview[o + 2] = 208; rgbaPreview[o + 3] = 255; }
    }
    return { width: this.width, height: this.height, medium: this.medium, elapsedSeconds: this.elapsedSeconds, ...stats, estimatedFullDrySec, wetnessGrid: new Float32Array(this.wetness), rgbaPreview };
  }
}

/** 2D 실루엣 거리장 법선 추정으로 광원 핀 기준 1차 그림자·림라이트·반사광 3개 분리 마스크를 생성한다. */
export function generateAutoCelShadingLayers(input: AutoCelShadingInput): AutoCelShadingResult {
  const { width, height, silhouetteAlpha } = input;
  const total = width * height;
  const shadowThreshold = input.shadowThreshold ?? 0.16;
  const rimWidth01 = clamp(input.rimWidth01 ?? 0.34, 0.08, 0.8);
  const bounceStrength01 = clamp(input.bounceStrength01 ?? 0.62, 0, 1);
  const celSoftness = clamp(input.celSoftness ?? 0.06, 0.01, 0.3);
  const baseColor = input.baseColor ?? { r: 228, g: 196, b: 174 };
  const lLen = Math.hypot(input.lightPin.lx, input.lightPin.ly, input.lightPin.lz) || 1;
  const lx = input.lightPin.lx / lLen; const ly = input.lightPin.ly / lLen; const lz = input.lightPin.lz / lLen;

  const dist = new Float32Array(total);
  const inf = width + height;
  let silhouettePixelCount = 0;
  for (let i = 0; i < total; i += 1) if ((silhouetteAlpha[i] ?? 0) >= 128) { dist[i] = inf; silhouettePixelCount += 1; }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x; let d = dist[idx] ?? 0; if (d === 0) continue;
      if (x > 0) d = Math.min(d, (dist[idx - 1] ?? inf) + 1);
      if (y > 0) d = Math.min(d, (dist[idx - width] ?? inf) + 1);
      if (x > 0 && y > 0) d = Math.min(d, (dist[idx - width - 1] ?? inf) + 1.414);
      if (x < width - 1 && y > 0) d = Math.min(d, (dist[idx - width + 1] ?? inf) + 1.414);
      dist[idx] = d;
    }
  }
  let maxDist = 1;
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const idx = y * width + x; let d = dist[idx] ?? 0; if (d === 0) continue;
      if (x < width - 1) d = Math.min(d, (dist[idx + 1] ?? inf) + 1);
      if (y < height - 1) d = Math.min(d, (dist[idx + width] ?? inf) + 1);
      if (x < width - 1 && y < height - 1) d = Math.min(d, (dist[idx + width + 1] ?? inf) + 1.414);
      if (x > 0 && y < height - 1) d = Math.min(d, (dist[idx + width - 1] ?? inf) + 1.414);
      dist[idx] = d; if (d > maxDist) maxDist = d;
    }
  }
  const heightField = Float32Array.from(dist, (dv) => {
    const dn = clamp(dv / maxDist, 0, 1);
    return dn > 0 ? Math.sqrt(Math.max(0, 1 - (1 - dn) * (1 - dn))) : 0;
  });

  const primaryShadowMask = new Uint8ClampedArray(total); const rimLightMask = new Uint8ClampedArray(total);
  const bounceLightMask = new Uint8ClampedArray(total); const normalMapRgba = new Uint8ClampedArray(total * 4);
  const compositePreviewRgba = new Uint8ClampedArray(total * 4);
  const slopeGain = Math.max(2.2, maxDist * 0.45); const lxyLen = Math.hypot(lx, ly);
  let sSum = 0; let sX = 0; let sY = 0; let rSum = 0; let rX = 0; let rY = 0; let bSum = 0; let bX = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x; const alpha = silhouetteAlpha[idx] ?? 0; const o = idx * 4;
      if (alpha < 128) { normalMapRgba[o] = 128; normalMapRgba[o + 1] = 128; normalMapRgba[o + 2] = 255; continue; }
      const gx = ((x < width - 1 ? (heightField[idx + 1] ?? 0) : 0) - (x > 0 ? (heightField[idx - 1] ?? 0) : 0)) * 0.5 * slopeGain;
      const gy = ((y < height - 1 ? (heightField[idx + width] ?? 0) : 0) - (y > 0 ? (heightField[idx - width] ?? 0) : 0)) * 0.5 * slopeGain;
      const nLen = Math.hypot(-gx, -gy, 1) || 1;
      const nx = -gx / nLen; const ny = -gy / nLen; const nz = 1 / nLen;
      normalMapRgba[o] = Math.round((nx * 0.5 + 0.5) * 255); normalMapRgba[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normalMapRgba[o + 2] = Math.round((nz * 0.5 + 0.5) * 255); normalMapRgba[o + 3] = alpha;

      const ndotl = nx * lx + ny * ly + nz * lz; const dNorm = clamp((dist[idx] ?? 0) / maxDist, 0, 1);
      const shadow01 = 1 - smoothstep(shadowThreshold - celSoftness, shadowThreshold + celSoftness, ndotl);
      const litEdge = lxyLen > 1e-4 ? (nx * lx + ny * ly) / lxyLen : 1 - nz;
      const rim01 = (1 - smoothstep(rimWidth01 * 0.45, rimWidth01, dNorm)) * smoothstep(-0.08, 0.42, litEdge) * smoothstep(-0.25, 0.35, ndotl);
      const oppEdge = lxyLen > 1e-4 ? (nx * -lx + ny * -ly) / lxyLen : 1 - nz;
      const bounce01 = shadow01 * (1 - smoothstep(rimWidth01 * 0.5, rimWidth01 * 1.25, dNorm)) * smoothstep(0.05, 0.55, oppEdge) * bounceStrength01;
      primaryShadowMask[idx] = Math.round(clamp(shadow01, 0, 1) * 255);
      rimLightMask[idx] = Math.round(clamp(rim01, 0, 1) * 255);
      bounceLightMask[idx] = Math.round(clamp(bounce01, 0, 1) * 255);

      const x01 = width > 1 ? x / (width - 1) : 0.5; const y01 = height > 1 ? y / (height - 1) : 0.5;
      if (shadow01 > 0.25) { sSum += shadow01; sX += x01 * shadow01; sY += y01 * shadow01; }
      if (rim01 > 0.2) { rSum += rim01; rX += x01 * rim01; rY += y01 * rim01; }
      if (bounce01 > 0.12) { bSum += bounce01; bX += x01 * bounce01; }
      compositePreviewRgba[o] = Math.round(clamp(baseColor.r * (1 - 0.38 * shadow01) + 46 * rim01 + 26 * bounce01, 0, 255));
      compositePreviewRgba[o + 1] = Math.round(clamp(baseColor.g * (1 - 0.44 * shadow01) + 42 * rim01 + 36 * bounce01, 0, 255));
      compositePreviewRgba[o + 2] = Math.round(clamp(baseColor.b * (1 - 0.32 * shadow01) + 52 * rim01 + 58 * bounce01, 0, 255));
      compositePreviewRgba[o + 3] = alpha;
    }
  }
  const safeSil = Math.max(1, silhouettePixelCount);
  return {
    width, height, normalizedLight: { lx, ly, lz },
    primaryShadowMask, rimLightMask, bounceLightMask, normalMapRgba, compositePreviewRgba, silhouettePixelCount,
    shadowCoverageRatio01: sSum / safeSil, rimCoverageRatio01: rSum / safeSil, bounceCoverageRatio01: bSum / safeSil,
    shadowCentroidX01: sSum > 0 ? sX / sSum : 0.5, shadowCentroidY01: sSum > 0 ? sY / sSum : 0.5,
    rimCentroidX01: rSum > 0 ? rX / rSum : 0.5, rimCentroidY01: rSum > 0 ? rY / rSum : 0.5,
    bounceCentroidX01: bSum > 0 ? bX / bSum : 0.5,
  };
}

/** 캐릭터 상반신 데모 실루엣 알파 마스크를 생성한다. */
export function createDemoCharacterSilhouette(width = 64, height = 64): Uint8ClampedArray {
  const alpha = new Uint8ClampedArray(width * height);
  const cx = width * 0.5; const headCy = height * 0.38; const headR = Math.min(width, height) * 0.25; const bodyCy = height * 0.82;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (Math.hypot((x - cx) / headR, (y - headCy) / (headR * 1.08)) <= 1
        || (Math.abs(x - cx) <= headR * 0.36 && y >= headCy + headR * 0.7 && y <= bodyCy)
        || Math.hypot((x - cx) / (width * 0.34), (y - bodyCy) / (height * 0.28)) <= 1) {
        alpha[y * width + x] = 255;
      }
    }
  }
  return alpha;
}

/** IEC 61966-2-1 sRGB(0..1) ↔ 선형 변환 및 IEEE 754 binary16(Float16) 인코더/디코더. */
export const srgbToLinear = (srgb01: number): number => {
  const c = clamp(srgb01, 0, 1);
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
export const linearToSrgb = (linear: number): number => {
  const c = clamp(linear, 0, 1);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
};

const F32_VIEW = new Float32Array(1);
const U32_VIEW = new Uint32Array(F32_VIEW.buffer);
export function float32ToFloat16Bits(val: number): number {
  F32_VIEW[0] = val;
  const bits = U32_VIEW[0] ?? 0;
  const sign = (bits >>> 16) & 0x8000;
  let exp = ((bits >>> 23) & 0xff) - 127 + 15;
  let mant = bits & 0x7fffff;
  if (exp <= 0) {
    if (exp < -10) return sign;
    mant = (mant | 0x800000) >>> (1 - exp);
    return sign | ((mant + 0x1000) >>> 13);
  }
  if (exp >= 31) return sign | 0x7c00 | (mant ? 0x0200 : 0);
  mant += 0x1000;
  if (mant & 0x800000) { mant = 0; exp += 1; if (exp >= 31) return sign | 0x7c00; }
  return sign | (exp << 10) | (mant >>> 13);
}
export function float16BitsToFloat32(half: number): number {
  const sign = (half & 0x8000) ? -1 : 1;
  const exp = (half >>> 10) & 0x1f;
  const frac = half & 0x03ff;
  if (exp === 0) return sign * Math.pow(2, -14) * (frac / 1024);
  if (exp === 31) return frac === 0 ? sign * Infinity : Number.NaN;
  return sign * Math.pow(2, exp - 15) * (1 + frac / 1024);
}

const acesFilmToneMap = (x: number): number => { const v = Math.max(0, x); return clamp((v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14), 0, 1); };
function triangularBlueNoise(x: number, y: number, ch: number): number {
  const raw = 52.9829189 * ((((x + ch * 17) * 0.06711056 + (y + ch * 31) * 0.00583715) % 1) + 1);
  const u01 = raw - Math.floor(raw);
  const centered = u01 * 2 - 1;
  return (centered < 0 ? -1 : 1) * (1 - Math.sqrt(Math.max(0, 1 - Math.abs(centered))));
}
function blendLinearChannel(base: number, src: number, mode: HdrBlendMode): number {
  if (mode === "multiply") return base * src;
  if (mode === "add") return base + src;
  if (mode === "screen") return base + src - base * Math.min(1, src);
  if (mode === "soft-light") { const b = clamp(base, 0, 1); const s = clamp(src, 0, 1); return (1 - 2 * s) * b * b + 2 * s * b; }
  return src;
}
function measureMaxHorizontalFlatRun(rgba8: Uint8ClampedArray, width: number, height: number): number {
  let maxRun = 1;
  for (let y = 0; y < height; y += 1) {
    let run = 1; let prev = rgba8[y * width * 4] ?? 0;
    for (let x = 1; x < width; x += 1) {
      const cur = rgba8[(y * width + x) * 4] ?? 0;
      if (cur === prev) { run += 1; if (run > maxRun) maxRun = run; } else { run = 1; prev = cur; }
    }
  }
  return maxRun;
}

/** Linear-Float16 HDR 다중 레이어 합성 + 삼각 PDF 블루노이즈 디더링(8-bit 밴딩 제거). */
export function compositeLinearFloat16Layers(options: CompositeHdrOptions): LinearFloat16CompositeResult {
  const { width, height, layers } = options;
  const exposureGain = Math.pow(2, clamp(options.exposureEv ?? 0, -4, 4));
  const useDither = options.enableTpdfBlueNoiseDither ?? true;
  const mapFn = (options.toneMap ?? "aces") === "aces" ? acesFilmToneMap : (v: number) => clamp(v, 0, 1);
  const totalPixels = width * height;
  const linearF32 = new Float32Array(totalPixels * 4);
  for (let i = 0; i < totalPixels; i += 1) linearF32[i * 4 + 3] = 1;
  for (const layer of layers) {
    if (layer.visible === false || layer.opacity01 <= 0) continue;
    const op = clamp(layer.opacity01, 0, 1);
    for (let i = 0; i < totalPixels; i += 1) {
      const o = i * 4; const sa = clamp((layer.linearRgba[o + 3] ?? 0) * op, 0, 1);
      if (sa <= 0) continue;
      const br = linearF32[o] ?? 0; const bg = linearF32[o + 1] ?? 0; const bb = linearF32[o + 2] ?? 0;
      linearF32[o] = br * (1 - sa) + blendLinearChannel(br, Math.max(0, layer.linearRgba[o] ?? 0), layer.blendMode) * sa;
      linearF32[o + 1] = bg * (1 - sa) + blendLinearChannel(bg, Math.max(0, layer.linearRgba[o + 1] ?? 0), layer.blendMode) * sa;
      linearF32[o + 2] = bb * (1 - sa) + blendLinearChannel(bb, Math.max(0, layer.linearRgba[o + 2] ?? 0), layer.blendMode) * sa;
      linearF32[o + 3] = clamp((linearF32[o + 3] ?? 1) + sa * (1 - (linearF32[o + 3] ?? 1)), 0, 1);
    }
  }
  const linearFloat16Buffer = new Uint16Array(totalPixels * 4);
  const outputRgba8 = new Uint8ClampedArray(totalPixels * 4);
  const unditheredRgba8 = new Uint8ClampedArray(totalPixels * 4);
  const idealSrgb255 = new Float32Array(totalPixels * 3);
  let peakLinearLuminance = 0; let hdrSpecularPixelCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pIdx = y * width + x; const o = pIdx * 4;
      const hR = float32ToFloat16Bits((linearF32[o] ?? 0) * exposureGain);
      const hG = float32ToFloat16Bits((linearF32[o + 1] ?? 0) * exposureGain);
      const hB = float32ToFloat16Bits((linearF32[o + 2] ?? 0) * exposureGain);
      const la = clamp(linearF32[o + 3] ?? 1, 0, 1);
      linearFloat16Buffer[o] = hR; linearFloat16Buffer[o + 1] = hG; linearFloat16Buffer[o + 2] = hB; linearFloat16Buffer[o + 3] = float32ToFloat16Bits(la);
      const fR = float16BitsToFloat32(hR); const fG = float16BitsToFloat32(hG); const fB = float16BitsToFloat32(hB);
      const lum = 0.2126 * fR + 0.7152 * fG + 0.0722 * fB;
      if (lum > peakLinearLuminance) peakLinearLuminance = lum;
      if (lum > 1.0) hdrSpecularPixelCount += 1;
      const sR = linearToSrgb(mapFn(fR)) * 255; const sG = linearToSrgb(mapFn(fG)) * 255; const sB = linearToSrgb(mapFn(fB)) * 255;
      idealSrgb255[pIdx * 3] = sR; idealSrgb255[pIdx * 3 + 1] = sG; idealSrgb255[pIdx * 3 + 2] = sB;
      const aByte = Math.round(la * 255);
      unditheredRgba8[o] = Math.round(clamp(sR, 0, 255)); unditheredRgba8[o + 1] = Math.round(clamp(sG, 0, 255)); unditheredRgba8[o + 2] = Math.round(clamp(sB, 0, 255)); unditheredRgba8[o + 3] = aByte;
      outputRgba8[o] = Math.round(clamp(sR + (useDither ? triangularBlueNoise(x, y, 0) : 0), 0, 255));
      outputRgba8[o + 1] = Math.round(clamp(sG + (useDither ? triangularBlueNoise(x, y, 1) : 0), 0, 255));
      outputRgba8[o + 2] = Math.round(clamp(sB + (useDither ? triangularBlueNoise(x, y, 2) : 0), 0, 255));
      outputRgba8[o + 3] = aByte;
    }
  }
  let dSq = 0; let uSq = 0; let win = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let iM = 0; let dM = 0; let uM = 0;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const idx = (y + dy) * width + (x + dx);
        iM += idealSrgb255[idx * 3] ?? 0; dM += outputRgba8[idx * 4] ?? 0; uM += unditheredRgba8[idx * 4] ?? 0;
      }
      dSq += Math.pow((dM - iM) / 9, 2); uSq += Math.pow((uM - iM) / 9, 2); win += 1;
    }
  }
  const naiveBandingRunMax = measureMaxHorizontalFlatRun(unditheredRgba8, width, height);
  const ditheredBandingRunMax = measureMaxHorizontalFlatRun(outputRgba8, width, height);
  return {
    width, height, linearFloat16Buffer, linearFloat32Buffer: linearF32, outputRgba8, unditheredRgba8,
    metrics: {
      peakLinearLuminance, hdrSpecularPixelCount,
      ditheredRmsErrorVsLinear: win > 0 ? Math.sqrt(dSq / win) : 0, unditheredRmsErrorVsLinear: win > 0 ? Math.sqrt(uSq / win) : 0,
      naiveBandingRunMax, ditheredBandingRunMax,
      bandingEliminationRatio01: naiveBandingRunMax > 1 ? clamp(1 - (ditheredBandingRunMax - 1) / (naiveBandingRunMax - 1), 0, 1) : 1,
      ditherMode: useDither ? "tpdf-blue-noise" : "none",
    },
  };
}

/** 미세 황혼 그라데이션 + 1.0 초과 HDR 발광 오브 레이어 데모를 생성한다. */
export function createDemoHdrGradientLayers(width = 96, height = 40): readonly LinearHdrLayerInput[] {
  const sky = new Float32Array(width * height * 4);
  const bloom = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      const tx = width > 1 ? x / (width - 1) : 0; const ty = height > 1 ? y / (height - 1) : 0;
      sky[o] = 0.022 + tx * 0.011 + ty * 0.004; sky[o + 1] = 0.03 + tx * 0.014 + ty * 0.005;
      sky[o + 2] = 0.056 + tx * 0.018 + ty * 0.006; sky[o + 3] = 1;
      const d = Math.hypot((x - width * 0.78) / (width * 0.16), (y - height * 0.34) / (height * 0.32));
      const glow = d < 1 ? Math.pow(1 - d, 2.2) * 2.4 : 0;
      bloom[o] = glow * 1.15; bloom[o + 1] = glow * 0.88; bloom[o + 2] = glow * 0.56; bloom[o + 3] = glow > 0 ? 1 : 0;
    }
  }
  return [
    { id: "hdr-sky", name: "Twilight Sky Base", blendMode: "normal", opacity01: 1, linearRgba: sky },
    { id: "hdr-sun", name: "HDR Specular Flare", blendMode: "add", opacity01: 0.9, linearRgba: bloom },
  ];
}
