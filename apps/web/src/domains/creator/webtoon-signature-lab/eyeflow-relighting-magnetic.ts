/**
 * 웹툰 시그니처 연출 3종 코어 엔진:
 * 1) 실시간 시선 흐름 히트맵 & 컷 리듬 오실로스코프 (analyzeEyeFlowAndCutRhythm)
 * 2) 비파괴 OKLCH 팔레트 락 & 5종 컷 분위기 일괄 리라이팅 (relightCutOklchNonDestructive)
 * 3) 얼굴·눈 100% 회피 자석 효과선·집중선·말풍선 꼬리 솔버 (solveMagneticSpeedlinesAndBalloonTails)
 */

const clamp = (value: number, min: number, max: number): number => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min);
const roundTo = (value: number, digits = 2): number => Math.round(value * 10 ** digits) / 10 ** digits;
const normalizeVector = (dx: number, dy: number): readonly [number, number] => {
  const len = Math.hypot(dx, dy);
  return len <= 1e-6 ? [0, 0] : [dx / len, dy / len];
};

// === 1. 실시간 시선 흐름 히트맵 & 컷 리듬 오실로스코프 ===

export type WebtoonReadingOrder = "ltr-scroll" | "rtl-scroll";
export type EyeFlowBalloonKind = "dialogue" | "narration" | "thought" | "sfx";
export type BacktrackCause = "vertical-reversal" | "horizontal-crossing" | "gaze-conflict";

export interface EyeFlowBalloonNode {
  readonly id: string; readonly order: number; readonly x: number; readonly y: number;
  readonly width: number; readonly height: number; readonly charCount: number; readonly kind: EyeFlowBalloonKind;
}
export interface CharacterGazeVector {
  readonly originX: number; readonly originY: number; readonly targetX: number; readonly targetY: number; readonly weight?: number;
}
export interface CutFocalPoint { readonly x: number; readonly y: number; readonly contrastStrength: number; }
export interface EyeFlowCutNode {
  readonly cutId: string; readonly order: number; readonly yStartPx: number; readonly widthPx: number; readonly heightPx: number;
  readonly gapBeforePx: number; readonly isCliffhanger?: boolean; readonly contrastRatio: number;
  readonly characterGaze?: CharacterGazeVector; readonly focalPoint: CutFocalPoint; readonly balloons: readonly EyeFlowBalloonNode[];
}
export interface EyeFlowEpisodeInput {
  readonly episodeTitle: string; readonly canvasWidthPx: number; readonly readingOrder?: WebtoonReadingOrder;
  readonly heatmapCols?: number; readonly heatmapRows?: number; readonly cuts: readonly EyeFlowCutNode[];
}
export interface EyeFlowBacktrackEvent {
  readonly cutId: string; readonly fromBalloonId: string; readonly toBalloonId: string;
  readonly cause: BacktrackCause; readonly severity: number; readonly messageKo: string; readonly messageEn: string;
}
export interface CutRhythmOscilloscopeSample {
  readonly cutId: string; readonly cutOrder: number; readonly tension: number; readonly pacingEnergy: number;
  readonly breathGapPx: number; readonly recommendedGapBeforePx: number; readonly breathAdequacy: number;
  readonly backtrackRisk: number; readonly isCliffhanger: boolean;
}
export interface EyeFlowHeatmapCell {
  readonly col: number; readonly row: number; readonly u: number; readonly v: number;
  readonly heat: number; readonly backtrackHeat: number;
}
export interface EyeFlowDiagnostic {
  readonly severity: "good" | "warn" | "bad"; readonly cutId: string; readonly messageKo: string; readonly messageEn: string;
}
export interface EyeFlowAndCutRhythmReport {
  readonly episodeTitle: string; readonly readingOrder: WebtoonReadingOrder; readonly totalHeightPx: number;
  readonly backtrackRiskScore: number; readonly flowSmoothnessScore: number; readonly breathPauseScore: number;
  readonly cliffhangerBreathScore: number; readonly overallScore: number;
  readonly backtrackEvents: readonly EyeFlowBacktrackEvent[];
  readonly oscilloscopeSamples: readonly CutRhythmOscilloscopeSample[];
  readonly heatmapCols: number; readonly heatmapRows: number;
  readonly heatmapGrid: readonly EyeFlowHeatmapCell[]; readonly peakCell: EyeFlowHeatmapCell;
  readonly diagnostics: readonly EyeFlowDiagnostic[];
}

interface HeatmapStamp { readonly u: number; readonly v: number; readonly weight: number; readonly sigma: number; readonly isBacktrack: boolean; }

export function analyzeEyeFlowAndCutRhythm(input: EyeFlowEpisodeInput): EyeFlowAndCutRhythmReport {
  const readingOrder: WebtoonReadingOrder = input.readingOrder ?? "ltr-scroll";
  const heatmapCols = Math.max(4, Math.min(24, Math.round(input.heatmapCols ?? 8)));
  const heatmapRows = Math.max(6, Math.min(36, Math.round(input.heatmapRows ?? 12)));
  const sortedCuts = [...input.cuts].sort((a, b) => a.order - b.order);
  const totalHeightPx = Math.max(1, sortedCuts.reduce((acc, c) => Math.max(acc, c.yStartPx + c.heightPx), 0));

  const backtrackEvents: EyeFlowBacktrackEvent[] = [];
  const oscilloscopeSamples: CutRhythmOscilloscopeSample[] = [];
  const diagnostics: EyeFlowDiagnostic[] = [];
  const stamps: HeatmapStamp[] = [];
  let [cliffhangerBreathAccum, cliffhangerCount, breathAccum, totalCutBacktrackRisk, gazeSynergyBonus] = [0, 0, 0, 0, 0];

  for (const cut of sortedCuts) {
    const balloons = [...cut.balloons].sort((a, b) => a.order - b.order);
    const cutTopV = cut.yStartPx / totalHeightPx;
    const cutSpanV = Math.max(1, cut.heightPx) / totalHeightPx;
    const toV = (ny: number): number => clamp(cutTopV + clamp(ny, 0, 1) * cutSpanV, 0, 1);

    stamps.push({ u: clamp(cut.focalPoint.x, 0, 1), v: toV(cut.focalPoint.y), weight: 0.65 + clamp(cut.focalPoint.contrastStrength, 0, 1) * 0.85, sigma: 0.14, isBacktrack: false });
    if (cut.characterGaze) stamps.push({ u: clamp(cut.characterGaze.targetX, 0, 1), v: toV(cut.characterGaze.targetY), weight: 0.55 * clamp(cut.characterGaze.weight ?? 0.85, 0.2, 1.5), sigma: 0.12, isBacktrack: false });

    let cutBacktrackSeverity = 0;
    if (cut.characterGaze && balloons.length > 0) {
      const gaze = cut.characterGaze;
      const gazeTargetBalloon = balloons.find((b) => b.y >= gaze.originY - 0.05) ?? balloons[balloons.length - 1];
      if (gazeTargetBalloon) {
        const [gx, gy] = normalizeVector(gaze.targetX - gaze.originX, gaze.targetY - gaze.originY);
        const [bx, by] = normalizeVector(gazeTargetBalloon.x - gaze.originX, gazeTargetBalloon.y - gaze.originY);
        const dot = gx * bx + gy * by;
        if (dot < -0.35) {
          const severity = Math.round(clamp((-dot - 0.35) / 0.65, 0.25, 1) * 48);
          cutBacktrackSeverity += severity;
          backtrackEvents.push({ cutId: cut.cutId, fromBalloonId: "character-gaze", toBalloonId: gazeTargetBalloon.id, cause: "gaze-conflict", severity, messageKo: `컷 ${cut.order}: 인물 시선이 후속 말풍선(${gazeTargetBalloon.id})과 반대 방향을 향해 시선이 분산됩니다.`, messageEn: `Cut ${cut.order}: Character gaze opposes downstream balloon (${gazeTargetBalloon.id}), splitting focus.` });
          stamps.push({ u: clamp(gazeTargetBalloon.x, 0, 1), v: toV(gazeTargetBalloon.y), weight: 0.9, sigma: 0.12, isBacktrack: true });
        } else if (dot > 0.35) gazeSynergyBonus += 3.5;
      }
    }

    for (let i = 0; i < balloons.length; i += 1) {
      const current = balloons[i];
      if (!current) continue;
      const currV = toV(current.y);
      stamps.push({ u: clamp(current.x, 0, 1), v: currV, weight: 0.55 + Math.min(1.2, current.charCount / 28), sigma: 0.11, isBacktrack: false });

      if (i > 0) {
        const prev = balloons[i - 1];
        if (!prev) continue;
        const dx = current.x - prev.x;
        const dy = current.y - prev.y;
        if (dy < -0.04) {
          const severity = Math.round(clamp(Math.abs(dy) * 210, 26, 72));
          cutBacktrackSeverity += severity;
          backtrackEvents.push({ cutId: cut.cutId, fromBalloonId: prev.id, toBalloonId: current.id, cause: "vertical-reversal", severity, messageKo: `컷 ${cut.order}: 말풍선 ${prev.id} → ${current.id} 구간에서 시선이 위로 역행합니다.`, messageEn: `Cut ${cut.order}: Vertical eye backtrack from ${prev.id} to ${current.id}.` });
          stamps.push({ u: clamp((prev.x + current.x) / 2, 0, 1), v: toV((prev.y + current.y) / 2), weight: 1.1, sigma: 0.13, isBacktrack: true });
        }
        if (Math.abs(dy) < 0.14 && ((readingOrder === "ltr-scroll" && dx < -0.18) || (readingOrder === "rtl-scroll" && dx > 0.18))) {
          const severity = Math.round(clamp(Math.abs(dx) * 115, 22, 58));
          cutBacktrackSeverity += severity;
          backtrackEvents.push({ cutId: cut.cutId, fromBalloonId: prev.id, toBalloonId: current.id, cause: "horizontal-crossing", severity, messageKo: `컷 ${cut.order}: 같은 수평 대역에서 ${prev.id} → ${current.id} 가로 읽기 방향이 교차합니다.`, messageEn: `Cut ${cut.order}: Horizontal reading crossing between ${prev.id} and ${current.id}.` });
          stamps.push({ u: clamp((prev.x + current.x) / 2, 0, 1), v: currV, weight: 0.95, sigma: 0.12, isBacktrack: true });
        }
      }
    }

    const clampedCutRisk = clamp(cutBacktrackSeverity, 0, 100);
    totalCutBacktrackRisk += clampedCutRisk;
    const totalChars = balloons.reduce((acc, b) => acc + b.charCount, 0);
    const tension = Math.round(clamp(clamp((cut.contrastRatio - 1) / 14, 0, 1) * 42 + clamp(cut.focalPoint.contrastStrength, 0, 1) * 24 + Math.min(18, balloons.length * 4.5 + totalChars * 0.12) + (balloons.some((b) => b.kind === "sfx") ? 10 : 0) + (cut.isCliffhanger ? 12 : 0), 8, 100));
    const pacingEnergy = Math.round(clamp(tension * 0.72 + (1 / clamp(cut.heightPx / Math.max(1, cut.widthPx), 0.4, 2.6)) * 28, 10, 100));

    const isCliff = Boolean(cut.isCliffhanger);
    const recommendedGapBeforePx = isCliff ? 460 : cut.order === 1 ? 80 : 210;
    let breathAdequacy = 100;
    if (isCliff) {
      cliffhangerCount += 1;
      if (cut.gapBeforePx >= 420 && cut.gapBeforePx <= 820) breathAdequacy = 96;
      else if (cut.gapBeforePx >= 300 && cut.gapBeforePx < 420) breathAdequacy = Math.round(68 + ((cut.gapBeforePx - 300) / 120) * 26);
      else if (cut.gapBeforePx < 300) {
        breathAdequacy = Math.round(clamp((cut.gapBeforePx / 300) * 62, 12, 62));
        diagnostics.push({ severity: "bad", cutId: cut.cutId, messageKo: `클리프행어 컷(${cut.cutId}) 직전 여백이 ${cut.gapBeforePx}px로 좁습니다. 420px 이상 호흡 여백을 권장합니다.`, messageEn: `Cliffhanger cut (${cut.cutId}) has only ${cut.gapBeforePx}px pause; widen to >= 420px.` });
      } else breathAdequacy = Math.round(clamp(96 - (cut.gapBeforePx - 820) * 0.05, 65, 96));
      cliffhangerBreathAccum += breathAdequacy;
    } else if (cut.order > 1) {
      breathAdequacy = cut.gapBeforePx >= 130 && cut.gapBeforePx <= 380 ? 92 : cut.gapBeforePx < 130 ? Math.round(clamp(45 + (cut.gapBeforePx / 130) * 45, 30, 90)) : Math.round(clamp(92 - (cut.gapBeforePx - 380) * 0.06, 58, 92));
    }
    breathAccum += breathAdequacy;
    oscilloscopeSamples.push({ cutId: cut.cutId, cutOrder: cut.order, tension, pacingEnergy, breathGapPx: cut.gapBeforePx, recommendedGapBeforePx, breathAdequacy, backtrackRisk: clampedCutRisk, isCliffhanger: isCliff });
  }

  const rawHeat: number[] = [];
  const rawBacktrack: number[] = [];
  let maxHeat = 1e-6;
  let maxBacktrack = 1e-6;
  for (let row = 0; row < heatmapRows; row += 1) {
    const v = (row + 0.5) / heatmapRows;
    for (let col = 0; col < heatmapCols; col += 1) {
      const u = (col + 0.5) / heatmapCols;
      let [hVal, bVal] = [0, 0];
      for (const s of stamps) {
        const g = s.weight * Math.exp(-((u - s.u) ** 2 + (v - s.v) ** 2) / (2 * s.sigma * s.sigma));
        if (s.isBacktrack) bVal += g;
        else hVal += g;
      }
      rawHeat.push(hVal);
      rawBacktrack.push(bVal);
      if (hVal > maxHeat) maxHeat = hVal;
      if (bVal > maxBacktrack) maxBacktrack = bVal;
    }
  }

  const heatmapGrid: EyeFlowHeatmapCell[] = [];
  let peakCell: EyeFlowHeatmapCell = { col: 0, row: 0, u: 0.5, v: 0.5, heat: 0, backtrackHeat: 0 };
  for (let row = 0; row < heatmapRows; row += 1) {
    for (let col = 0; col < heatmapCols; col += 1) {
      const idx = row * heatmapCols + col;
      const cell: EyeFlowHeatmapCell = { col, row, u: roundTo((col + 0.5) / heatmapCols, 3), v: roundTo((row + 0.5) / heatmapRows, 3), heat: roundTo(clamp((rawHeat[idx] ?? 0) / maxHeat, 0, 1), 3), backtrackHeat: roundTo(maxBacktrack > 1e-5 ? clamp((rawBacktrack[idx] ?? 0) / maxBacktrack, 0, 1) : 0, 3) };
      heatmapGrid.push(cell);
      if (cell.heat > peakCell.heat) peakCell = cell;
    }
  }

  const cutDivisor = Math.max(1, sortedCuts.length);
  const backtrackRiskScore = Math.round(clamp(totalCutBacktrackRisk / cutDivisor + Math.min(28, backtrackEvents.length * 7), 0, 100));
  const flowSmoothnessScore = Math.round(clamp(100 - backtrackRiskScore + Math.min(10, gazeSynergyBonus), 0, 100));
  const breathPauseScore = Math.round(clamp(breathAccum / cutDivisor, 0, 100));
  const cliffhangerBreathScore = cliffhangerCount > 0 ? Math.round(clamp(cliffhangerBreathAccum / cliffhangerCount, 0, 100)) : breathPauseScore;
  const overallScore = Math.round(clamp(flowSmoothnessScore * 0.55 + breathPauseScore * 0.25 + cliffhangerBreathScore * 0.2, 0, 100));

  if (backtrackEvents.length === 0) {
    diagnostics.push({ severity: "good", cutId: sortedCuts[0]?.cutId ?? "episode", messageKo: "말풍선·인물 시선 흐름에서 역행 구간이 감지되지 않았습니다.", messageEn: "Zero eye-flow backtrack conflicts detected across balloons and character gaze." });
  } else {
    for (const evt of backtrackEvents.slice(0, 3)) diagnostics.push({ severity: evt.severity >= 45 ? "bad" : "warn", cutId: evt.cutId, messageKo: evt.messageKo, messageEn: evt.messageEn });
  }

  return {
    episodeTitle: input.episodeTitle, readingOrder, totalHeightPx, backtrackRiskScore, flowSmoothnessScore,
    breathPauseScore, cliffhangerBreathScore, overallScore, backtrackEvents, oscilloscopeSamples,
    heatmapCols, heatmapRows, heatmapGrid, peakCell, diagnostics,
  };
}

// === 2. 비파괴 OKLCH ‘팔레트 락’ & 컷 분위기 1클릭 일괄 리라이팅 ===

export type RelightMoodPresetId = "daylight" | "sunset-gold" | "flashback-sepia" | "rainy-night" | "moonlight-blue";
export interface SrgbUnitColor { readonly r: number; readonly g: number; readonly b: number; }
export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface RelightMoodPreset {
  readonly id: RelightMoodPresetId; readonly labelKo: string; readonly labelEn: string; readonly summaryKo: string; readonly summaryEn: string;
  readonly lightnessShift: number; readonly contrastGain: number; readonly blackFloorLift: number; readonly chromaScale: number;
  readonly shadowTintHue: number; readonly shadowTintChroma: number; readonly highlightTintHue: number; readonly highlightTintChroma: number;
  readonly huePullTargetDeg?: number; readonly huePullStrength?: number;
}

export const RELIGHT_MOOD_PRESETS: Readonly<Record<RelightMoodPresetId, RelightMoodPreset>> = {
  daylight: { id: "daylight", labelKo: "주광 데이라이트", labelEn: "Crisp Daylight", summaryKo: "맑은 자연광 대비와 중립 하이라이트 유지", summaryEn: "Clean neutral daylight contrast with cool shadow bounce.", lightnessShift: 0.03, contrastGain: 1.05, blackFloorLift: 0.0, chromaScale: 1.04, shadowTintHue: 248, shadowTintChroma: 0.014, highlightTintHue: 92, highlightTintChroma: 0.01 },
  "sunset-gold": { id: "sunset-gold", labelKo: "노을 골든아워", labelEn: "Sunset Gold", summaryKo: "따뜻한 호박빛 하이라이트와 자줏빛 노을 그림자", summaryEn: "Warm amber-gold highlights paired with violet-dusk shadows.", lightnessShift: -0.015, contrastGain: 1.1, blackFloorLift: 0.015, chromaScale: 1.16, shadowTintHue: 308, shadowTintChroma: 0.042, highlightTintHue: 64, highlightTintChroma: 0.058, huePullTargetDeg: 58, huePullStrength: 0.24 },
  "flashback-sepia": { id: "flashback-sepia", labelKo: "회상 세피아", labelEn: "Flashback Sepia", summaryKo: "채도를 낮춘 따뜻한 인화지 톤과 부드러운 암부 들뜸", summaryEn: "Desaturated warm archival sepia with softly lifted shadows.", lightnessShift: 0.025, contrastGain: 0.88, blackFloorLift: 0.075, chromaScale: 0.36, shadowTintHue: 68, shadowTintChroma: 0.024, highlightTintHue: 82, highlightTintChroma: 0.032, huePullTargetDeg: 74, huePullStrength: 0.72 },
  "rainy-night": { id: "rainy-night", labelKo: "비 오는 밤", labelEn: "Rainy Night", summaryKo: "깊은 청록·남색 암부와 젖은 광택 대비 강조", summaryEn: "Deep indigo-slate nocturnal shadows with crisp damp highlights.", lightnessShift: -0.155, contrastGain: 1.18, blackFloorLift: 0.0, chromaScale: 0.86, shadowTintHue: 248, shadowTintChroma: 0.052, highlightTintHue: 214, highlightTintChroma: 0.036, huePullTargetDeg: 238, huePullStrength: 0.34 },
  "moonlight-blue": { id: "moonlight-blue", labelKo: "달빛 블루", labelEn: "Moonlight Blue", summaryKo: "은청색 림라이트와 차분한 야간 청색 스펙트럼", summaryEn: "Cool silver-cyan lunar rim light and calm blue shadows.", lightnessShift: -0.11, contrastGain: 1.12, blackFloorLift: 0.018, chromaScale: 0.78, shadowTintHue: 256, shadowTintChroma: 0.048, highlightTintHue: 226, highlightTintChroma: 0.044, huePullTargetDeg: 236, huePullStrength: 0.45 },
};

export const RELIGHT_MOOD_LIST: readonly RelightMoodPreset[] = [
  RELIGHT_MOOD_PRESETS.daylight, RELIGHT_MOOD_PRESETS["sunset-gold"],
  RELIGHT_MOOD_PRESETS["flashback-sepia"], RELIGHT_MOOD_PRESETS["rainy-night"], RELIGHT_MOOD_PRESETS["moonlight-blue"],
];

export interface PaletteLockSwatch {
  readonly id: string; readonly labelKo: string; readonly labelEn: string; readonly targetOklch: OklchColor;
  readonly hueToleranceDeg: number; readonly chromaTolerance: number; readonly lightnessTolerance?: number; readonly lockStrength: number;
}
export interface RelightCutInput {
  readonly cutId: string; readonly width: number; readonly height: number; readonly sourcePixels: Uint8ClampedArray;
  readonly mood: RelightMoodPresetId; readonly intensity?: number; readonly lockedSwatches?: readonly PaletteLockSwatch[];
}
export interface NonDestructiveRelightRecipe {
  readonly version: "oklch-relight-v1"; readonly cutId: string; readonly mood: RelightMoodPresetId; readonly intensity: number;
  readonly lightnessShift: number; readonly contrastGain: number; readonly chromaScale: number;
  readonly shadowTintHue: number; readonly highlightTintHue: number; readonly lockedSwatchIds: readonly string[];
}
export interface RelightCutMetrics {
  readonly pixelCount: number; readonly meanDeltaL: number; readonly meanDeltaC: number; readonly meanHueShiftDeg: number;
  readonly lockedPixelCount: number; readonly lockedPixelRatio: number; readonly gamutMappedCount: number; readonly originalIntact: boolean;
}
export interface RelightCutResult {
  readonly cutId: string; readonly mood: RelightMoodPresetId; readonly intensity: number;
  readonly originalSnapshot: Uint8ClampedArray; readonly relitPixels: Uint8ClampedArray;
  readonly originalDigest: string; readonly relitDigest: string; readonly nonDestructiveRecipe: NonDestructiveRelightRecipe;
  readonly metrics: RelightCutMetrics; readonly restoreOriginal: () => Uint8ClampedArray;
}

export const srgbChannelToLinear = (c: number): number => {
  const v = clamp(c, 0, 1);
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export const linearToSrgbChannel = (c: number): number => {
  const v = clamp(c, 0, 1);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
};

export function srgbToOklch(r01: number, g01: number, b01: number): OklchColor {
  const lr = srgbChannelToLinear(r01);
  const lg = srgbChannelToLinear(g01);
  const lb = srgbChannelToLinear(b01);
  const lCbrt = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const mCbrt = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const sCbrt = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const okL = 0.2104542553 * lCbrt + 0.793617785 * mCbrt - 0.0040720468 * sCbrt;
  const okA = 1.9779984951 * lCbrt - 2.428592205 * mCbrt + 0.4505937099 * sCbrt;
  const okB = 0.0259040371 * lCbrt + 0.7827717662 * mCbrt - 0.808675766 * sCbrt;
  const chroma = Math.hypot(okA, okB);
  return { l: clamp(okL, 0, 1), c: Math.max(0, chroma), h: chroma < 1e-6 ? 0 : (((Math.atan2(okB, okA) * 180) / Math.PI) + 360) % 360 };
}

function oklchToLinearSrgbRaw(l: number, c: number, hDeg: number): readonly [number, number, number] {
  const rad = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const lv = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mv = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sv = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * lv - 3.3077115913 * mv + 0.2309699292 * sv,
    -1.2684380046 * lv + 2.6097574011 * mv - 0.3413193965 * sv,
    -0.0041960863 * lv - 0.7034186147 * mv + 1.707614701 * sv,
  ];
}

const isLinearInGamut = (rgb: readonly [number, number, number]): boolean =>
  rgb[0] >= -1e-4 && rgb[0] <= 1.0001 && rgb[1] >= -1e-4 && rgb[1] <= 1.0001 && rgb[2] >= -1e-4 && rgb[2] <= 1.0001;

export function oklchToSrgb(color: OklchColor): { readonly srgb: SrgbUnitColor; readonly gamutMapped: boolean } {
  const targetL = clamp(color.l, 0, 1);
  const targetH = ((color.h % 360) + 360) % 360;
  let targetC = Math.max(0, color.c);
  let lin = oklchToLinearSrgbRaw(targetL, targetC, targetH);
  let gamutMapped = false;
  if (!isLinearInGamut(lin)) {
    gamutMapped = true;
    let lo = 0;
    let hi = targetC;
    for (let iter = 0; iter < 12; iter += 1) {
      const mid = (lo + hi) * 0.5;
      if (isLinearInGamut(oklchToLinearSrgbRaw(targetL, mid, targetH))) lo = mid;
      else hi = mid;
    }
    targetC = lo;
    lin = oklchToLinearSrgbRaw(targetL, targetC, targetH);
  }
  return { srgb: { r: linearToSrgbChannel(lin[0]), g: linearToSrgbChannel(lin[1]), b: linearToSrgbChannel(lin[2]) }, gamutMapped };
}

function shortestHueDeltaDeg(fromDeg: number, toDeg: number): number {
  const diff = ((toDeg - fromDeg + 540) % 360) - 180;
  return diff < -180 ? diff + 360 : diff;
}

function fnv1aDigestHex(bytes: Uint8ClampedArray): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i] ?? 0;
    hashA = Math.imul(hashA ^ byte, 0x01000193) >>> 0;
    hashB = Math.imul(hashB ^ ((byte + i) & 0xff), 0x85ebca6b) >>> 0;
  }
  return `${hashA.toString(16).padStart(8, "0")}${hashB.toString(16).padStart(8, "0")}`;
}

function computePaletteLockFactor(ok: OklchColor, swatches: readonly PaletteLockSwatch[]): number {
  let maxFactor = 0;
  for (const sw of swatches) {
    const hueDist = Math.abs(shortestHueDeltaDeg(ok.h, sw.targetOklch.h));
    const chromaDist = Math.abs(ok.c - sw.targetOklch.c);
    const lTol = sw.lightnessTolerance ?? 0.28;
    const lDist = Math.abs(ok.l - sw.targetOklch.l);
    if (hueDist <= sw.hueToleranceDeg && chromaDist <= sw.chromaTolerance && lDist <= lTol) {
      const w = sw.lockStrength * Math.min(1, (1 - hueDist / Math.max(1, sw.hueToleranceDeg)) * 1.35) * Math.min(1, (1 - chromaDist / Math.max(0.005, sw.chromaTolerance)) * 1.25) * Math.min(1, (1 - lDist / Math.max(0.01, lTol)) * 1.25);
      maxFactor = Math.max(maxFactor, clamp(w, 0, 1));
    }
  }
  return maxFactor;
}

export function relightCutOklchNonDestructive(input: RelightCutInput): RelightCutResult {
  const preset = RELIGHT_MOOD_PRESETS[input.mood];
  const intensity = clamp(input.intensity ?? 1, 0, 1);
  const lockedSwatches = input.lockedSwatches ?? [];
  const originalSnapshot = new Uint8ClampedArray(input.sourcePixels);
  const originalDigest = fnv1aDigestHex(originalSnapshot);
  const relitPixels = new Uint8ClampedArray(originalSnapshot.length);
  const pixelCount = Math.floor(originalSnapshot.length / 4);
  let [sumDeltaL, sumDeltaC, sumHueShift, lockedPixelCount, gamutMappedCount] = [0, 0, 0, 0, 0];

  for (let p = 0; p < pixelCount; p += 1) {
    const idx = p * 4;
    const srcOk = srgbToOklch((originalSnapshot[idx] ?? 0) / 255, (originalSnapshot[idx + 1] ?? 0) / 255, (originalSnapshot[idx + 2] ?? 0) / 255);
    const lockFactor = lockedSwatches.length > 0 ? computePaletteLockFactor(srcOk, lockedSwatches) : 0;
    if (lockFactor >= 0.35) lockedPixelCount += 1;

    const moodL = clamp(preset.blackFloorLift + ((srcOk.l - 0.5) * preset.contrastGain + 0.5 + preset.lightnessShift) * (1 - preset.blackFloorLift), 0.02, 0.99);
    const baseC = srcOk.c * preset.chromaScale;
    const baseHue = preset.huePullTargetDeg !== undefined && preset.huePullStrength !== undefined && baseC > 0.004 ? srcOk.h + shortestHueDeltaDeg(srcOk.h, preset.huePullTargetDeg) * preset.huePullStrength : srcOk.h;
    const [baseRad, shRad, hiRad] = [(baseHue * Math.PI) / 180, (preset.shadowTintHue * Math.PI) / 180, (preset.highlightTintHue * Math.PI) / 180];
    const [shW, hiW] = [clamp(1 - srcOk.l * 1.45, 0, 1), clamp((srcOk.l - 0.35) * 1.45, 0, 1)];
    const targetA = baseC * Math.cos(baseRad) + shW * preset.shadowTintChroma * Math.cos(shRad) + hiW * preset.highlightTintChroma * Math.cos(hiRad);
    const targetB = baseC * Math.sin(baseRad) + shW * preset.shadowTintChroma * Math.sin(shRad) + hiW * preset.highlightTintChroma * Math.sin(hiRad);
    const [moodC, moodH] = [Math.hypot(targetA, targetB), ((Math.atan2(targetB, targetA) * 180) / Math.PI + 360) % 360];

    const [chromaHueBlend, lightnessBlend] = [intensity * (1 - lockFactor * 0.92), intensity * (1 - lockFactor * 0.55)];
    const finalL = clamp(srcOk.l + (moodL - srcOk.l) * lightnessBlend, 0, 1);
    const finalC = Math.max(0, srcOk.c + (moodC - srcOk.c) * chromaHueBlend);
    const finalH = finalC < 1e-5 ? srcOk.h : (srcOk.h + shortestHueDeltaDeg(srcOk.h, moodH) * chromaHueBlend + 360) % 360;

    const converted = oklchToSrgb({ l: finalL, c: finalC, h: finalH });
    if (converted.gamutMapped) gamutMappedCount += 1;
    relitPixels[idx] = Math.round(clamp(converted.srgb.r, 0, 1) * 255);
    relitPixels[idx + 1] = Math.round(clamp(converted.srgb.g, 0, 1) * 255);
    relitPixels[idx + 2] = Math.round(clamp(converted.srgb.b, 0, 1) * 255);
    relitPixels[idx + 3] = originalSnapshot[idx + 3] ?? 255;
    sumDeltaL += finalL - srcOk.l;
    sumDeltaC += finalC - srcOk.c;
    sumHueShift += Math.abs(shortestHueDeltaDeg(srcOk.h, finalH));
  }

  const denom = Math.max(1, pixelCount);
  return {
    cutId: input.cutId, mood: input.mood, intensity, originalSnapshot, relitPixels, originalDigest, relitDigest: fnv1aDigestHex(relitPixels),
    nonDestructiveRecipe: {
      version: "oklch-relight-v1", cutId: input.cutId, mood: input.mood, intensity,
      lightnessShift: preset.lightnessShift, contrastGain: preset.contrastGain, chromaScale: preset.chromaScale,
      shadowTintHue: preset.shadowTintHue, highlightTintHue: preset.highlightTintHue, lockedSwatchIds: lockedSwatches.map((s) => s.id),
    },
    metrics: {
      pixelCount, meanDeltaL: roundTo(sumDeltaL / denom, 4), meanDeltaC: roundTo(sumDeltaC / denom, 4),
      meanHueShiftDeg: roundTo(sumHueShift / denom, 2), lockedPixelCount, lockedPixelRatio: roundTo(lockedPixelCount / denom, 4),
      gamutMappedCount, originalIntact: fnv1aDigestHex(input.sourcePixels) === originalDigest,
    },
    restoreOriginal: () => new Uint8ClampedArray(originalSnapshot),
  };
}

// === 3. 자석 효과선·집중선·말풍선 꼬리 솔버 (얼굴·눈 0% 침범 보장) ===

export type SpeedlineStyleId = "focus-radial" | "action-parallel" | "shock-burst";
export type ProtectedZoneKind = "face" | "eye" | "mouth" | "logo";

export interface MagneticProtectedZone {
  readonly id: string; readonly kind: ProtectedZoneKind; readonly label: string;
  readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly safetyMarginPx?: number;
}
export interface MagneticBalloonInput {
  readonly id: string; readonly speakerId: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  readonly speakerMouth: { readonly x: number; readonly y: number }; readonly speakerFaceZoneId: string;
}
export interface MagneticFramingInput {
  readonly cutWidth: number; readonly cutHeight: number; readonly preferredFocus: { readonly x: number; readonly y: number };
  readonly speedlineStyle: SpeedlineStyleId; readonly rayCount?: number;
  readonly protectedZones: readonly MagneticProtectedZone[]; readonly balloons: readonly MagneticBalloonInput[];
}
export interface ExpandedProtectedRect {
  readonly id: string; readonly kind: ProtectedZoneKind; readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number;
}
export interface MagneticSpeedlineRay {
  readonly index: number; readonly angleDeg: number; readonly startX: number; readonly startY: number;
  readonly endX: number; readonly endY: number; readonly strokeWidthPx: number; readonly clippedForFaceClearance: boolean;
}
export interface MagneticBalloonTailSolution {
  readonly balloonId: string; readonly speakerId: string; readonly anchorX: number; readonly anchorY: number;
  readonly controlX: number; readonly controlY: number; readonly tipX: number; readonly tipY: number;
  readonly baseWidthPx: number; readonly deflectedAroundZoneIds: readonly string[]; readonly clearanceMarginPx: number;
}
export interface MagneticFramingResult {
  readonly speedlineStyle: SpeedlineStyleId; readonly focusCenter: { readonly x: number; readonly y: number }; readonly clearRadiusPx: number;
  readonly protectedZonesExpanded: readonly ExpandedProtectedRect[];
  readonly rays: readonly MagneticSpeedlineRay[]; readonly balloonTails: readonly MagneticBalloonTailSolution[];
  readonly verification: {
    readonly faceEyeIntrusionCount: number; readonly faceEyeIntrusionPercent: number;
    readonly totalRays: number; readonly clippedRays: number; readonly guaranteedFaceEyeClear: boolean;
  };
}

const expandZone = (zone: MagneticProtectedZone): ExpandedProtectedRect => {
  const m = Math.max(0, zone.safetyMarginPx ?? (zone.kind === "eye" ? 14 : zone.kind === "face" ? 12 : 8));
  return { id: zone.id, kind: zone.kind, minX: zone.x - m, minY: zone.y - m, maxX: zone.x + zone.width + m, maxY: zone.y + zone.height + m };
};
const pointInsideRect = (x: number, y: number, r: ExpandedProtectedRect): boolean => x > r.minX && x < r.maxX && y > r.minY && y < r.maxY;

function intersectRayWithRect(ox: number, oy: number, dx: number, dy: number, rect: ExpandedProtectedRect): readonly [number, number] | null {
  let tMin = -Infinity;
  let tMax = Infinity;
  if (Math.abs(dx) < 1e-8) { if (ox < rect.minX || ox > rect.maxX) return null; }
  else {
    const tx1 = (rect.minX - ox) / dx;
    const tx2 = (rect.maxX - ox) / dx;
    tMin = Math.max(tMin, Math.min(tx1, tx2));
    tMax = Math.min(tMax, Math.max(tx1, tx2));
  }
  if (Math.abs(dy) < 1e-8) { if (oy < rect.minY || oy > rect.maxY) return null; }
  else {
    const ty1 = (rect.minY - oy) / dy;
    const ty2 = (rect.maxY - oy) / dy;
    tMin = Math.max(tMin, Math.min(ty1, ty2));
    tMax = Math.min(tMax, Math.max(ty1, ty2));
  }
  return tMax < Math.max(0, tMin) ? null : [Math.max(0, tMin), tMax];
}

const evalQuadBezier = (ax: number, ay: number, cx: number, cy: number, tx: number, ty: number, t: number): readonly [number, number] => {
  const mt = 1 - t;
  return [mt * mt * ax + 2 * mt * t * cx + t * t * tx, mt * mt * ay + 2 * mt * t * cy + t * t * ty];
};
const segmentIntersectsRect = (x1: number, y1: number, x2: number, y2: number, rect: ExpandedProtectedRect): boolean => {
  const hit = intersectRayWithRect(x1, y1, x2 - x1, y2 - y1, rect);
  return hit !== null && hit[0] <= 1 && hit[1] >= 0;
};

export function solveMagneticSpeedlinesAndBalloonTails(input: MagneticFramingInput): MagneticFramingResult {
  const cutWidth = Math.max(64, input.cutWidth);
  const cutHeight = Math.max(64, input.cutHeight);
  const rayCount = Math.max(12, Math.min(180, Math.round(input.rayCount ?? 48)));
  const expanded = input.protectedZones.map(expandZone);
  const faceAndEyeRects = expanded.filter((z) => z.kind === "face" || z.kind === "eye");
  const canvasRect: ExpandedProtectedRect = { id: "__canvas__", kind: "logo", minX: 0, minY: 0, maxX: cutWidth, maxY: cutHeight };
  const focusCenter = { x: clamp(input.preferredFocus.x, 0, cutWidth), y: clamp(input.preferredFocus.y, 0, cutHeight) };

  let clearRadiusPx = Math.min(cutWidth, cutHeight) * 0.22;
  for (const rect of faceAndEyeRects) {
    if (Math.hypot((rect.minX + rect.maxX) * 0.5 - focusCenter.x, (rect.minY + rect.maxY) * 0.5 - focusCenter.y) < Math.min(cutWidth, cutHeight) * 0.4) {
      for (const [cx, cy] of [[rect.minX, rect.minY], [rect.maxX, rect.minY], [rect.minX, rect.maxY], [rect.maxX, rect.maxY]] as const) {
        clearRadiusPx = Math.max(clearRadiusPx, Math.min(Math.hypot(cutWidth, cutHeight) * 0.48, Math.hypot(cx - focusCenter.x, cy - focusCenter.y) + 8));
      }
    }
  }

  const rays: MagneticSpeedlineRay[] = [];
  let clippedRays = 0;
  if (input.speedlineStyle === "action-parallel") {
    const [dx, dy] = normalizeVector(0.14, 1);
    for (let i = 0; i < rayCount; i += 1) {
      const ox = ((i + 0.5) / rayCount) * cutWidth;
      const canvasHit = intersectRayWithRect(ox, 0, dx, dy, canvasRect);
      if (!canvasHit) continue;
      let [tStart, tEnd] = canvasHit;
      let clipped = false;
      for (const zone of faceAndEyeRects) {
        const hit = intersectRayWithRect(ox, 0, dx, dy, zone);
        if (!hit || hit[0] >= tEnd || hit[1] <= tStart) continue;
        clipped = true;
        if (Math.max(0, hit[0] - tStart) >= Math.max(0, tEnd - hit[1])) tEnd = Math.max(tStart, hit[0] - 2);
        else tStart = Math.min(tEnd, hit[1] + 2);
      }
      if (tEnd - tStart < 14) continue;
      if (clipped) clippedRays += 1;
      rays.push({ index: i, angleDeg: roundTo((Math.atan2(dy, dx) * 180) / Math.PI, 2), startX: roundTo(ox + dx * tStart, 2), startY: roundTo(dy * tStart, 2), endX: roundTo(ox + dx * tEnd, 2), endY: roundTo(dy * tEnd, 2), strokeWidthPx: roundTo(1.2 + (i % 3) * 0.65, 2), clippedForFaceClearance: clipped });
    }
  } else {
    const baseRatio = input.speedlineStyle === "shock-burst" ? 0.78 : 1.0;
    for (let i = 0; i < rayCount; i += 1) {
      const rad = (Math.PI * 2 * i) / rayCount;
      const dx = Math.cos(rad);
      const dy = Math.sin(rad);
      const canvasHit = intersectRayWithRect(focusCenter.x, focusCenter.y, dx, dy, canvasRect);
      if (!canvasHit) continue;
      let tStart = clearRadiusPx * baseRatio * (0.94 + (i % 4) * 0.035);
      let clipped = false;
      for (const zone of faceAndEyeRects) {
        const hit = intersectRayWithRect(focusCenter.x, focusCenter.y, dx, dy, zone);
        if (hit && hit[1] + 2 > tStart) { tStart = hit[1] + 2; clipped = true; }
      }
      if (tStart >= canvasHit[1] - 10) continue;
      if (clipped) clippedRays += 1;
      rays.push({
        index: i, angleDeg: roundTo((rad * 180) / Math.PI, 2),
        startX: roundTo(focusCenter.x + dx * tStart, 2), startY: roundTo(focusCenter.y + dy * tStart, 2),
        endX: roundTo(focusCenter.x + dx * canvasHit[1], 2), endY: roundTo(focusCenter.y + dy * canvasHit[1], 2),
        strokeWidthPx: roundTo(input.speedlineStyle === "shock-burst" ? 2.2 + (i % 3) * 0.9 : 1.1 + (i % 4) * 0.5, 2), clippedForFaceClearance: clipped,
      });
    }
  }

  const balloonTails: MagneticBalloonTailSolution[] = [];
  for (const balloon of input.balloons) {
    const faceZone = expanded.find((z) => z.id === balloon.speakerFaceZoneId);
    const bCx = balloon.x + balloon.width * 0.5;
    const bCy = balloon.y + balloon.height * 0.5;
    let anchorX = bCx;
    let anchorY = balloon.y + balloon.height;
    let bestDist = Infinity;
    for (let k = 0; k < 24; k += 1) {
      const ang = (Math.PI * 2 * k) / 24;
      const candX = bCx + Math.cos(ang) * (balloon.width * 0.46);
      const candY = bCy + Math.sin(ang) * (balloon.height * 0.46);
      if (faceAndEyeRects.some((r) => pointInsideRect(candX, candY, r))) continue;
      const dist = Math.hypot(balloon.speakerMouth.x - candX, balloon.speakerMouth.y - candY);
      if (dist < bestDist) { bestDist = dist; anchorX = candX; anchorY = candY; }
    }

    const [dirX, dirY] = normalizeVector(balloon.speakerMouth.x - anchorX, balloon.speakerMouth.y - anchorY);
    let tipDist = Math.max(12, Math.hypot(balloon.speakerMouth.x - anchorX, balloon.speakerMouth.y - anchorY) * 0.72);
    const deflectedIds: string[] = [];
    for (const zone of faceAndEyeRects) {
      const hit = intersectRayWithRect(anchorX, anchorY, dirX, dirY, zone);
      if (hit && hit[0] <= tipDist) { tipDist = Math.max(8, Math.min(tipDist, hit[0] - 4)); deflectedIds.push(zone.id); }
    }

    const tipX = anchorX + dirX * tipDist;
    const tipY = anchorY + dirY * tipDist;
    const midX = (anchorX + tipX) * 0.5;
    const midY = (anchorY + tipY) * 0.5;
    const bend = Math.min(18, tipDist * 0.16);
    let ctrlX = midX;
    let ctrlY = midY;
    for (const [cx, cy] of [[midX - dirY * bend, midY + dirX * bend], [midX + dirY * bend, midY - dirX * bend], [midX, midY]] as const) {
      let safe = true;
      for (let s = 0; s <= 16; s += 1) {
        const [px, py] = evalQuadBezier(anchorX, anchorY, cx, cy, tipX, tipY, s / 16);
        if (faceAndEyeRects.some((r) => pointInsideRect(px, py, r))) { safe = false; break; }
      }
      if (safe) { ctrlX = cx; ctrlY = cy; break; }
    }

    const clearanceMarginPx = faceZone
      ? Math.max(0, Math.min(Math.abs(tipX - faceZone.minX), Math.abs(tipX - faceZone.maxX), Math.abs(tipY - faceZone.minY), Math.abs(tipY - faceZone.maxY)))
      : 12;
    balloonTails.push({
      balloonId: balloon.id, speakerId: balloon.speakerId,
      anchorX: roundTo(anchorX, 2), anchorY: roundTo(anchorY, 2), controlX: roundTo(ctrlX, 2), controlY: roundTo(ctrlY, 2),
      tipX: roundTo(tipX, 2), tipY: roundTo(tipY, 2), baseWidthPx: roundTo(clamp(balloon.width * 0.14, 10, 26), 1),
      deflectedAroundZoneIds: deflectedIds, clearanceMarginPx: roundTo(clearanceMarginPx, 2),
    });
  }

  let intrusionCount = 0;
  for (const ray of rays) {
    for (const zone of faceAndEyeRects) if (segmentIntersectsRect(ray.startX, ray.startY, ray.endX, ray.endY, zone)) intrusionCount += 1;
  }
  for (const tail of balloonTails) {
    for (let s = 0; s <= 20; s += 1) {
      const [px, py] = evalQuadBezier(tail.anchorX, tail.anchorY, tail.controlX, tail.controlY, tail.tipX, tail.tipY, s / 20);
      for (const zone of faceAndEyeRects) if (pointInsideRect(px, py, zone)) intrusionCount += 1;
    }
  }

  const checked = Math.max(1, rays.length + balloonTails.length);
  return {
    speedlineStyle: input.speedlineStyle, focusCenter, clearRadiusPx: roundTo(clearRadiusPx, 2),
    protectedZonesExpanded: expanded, rays, balloonTails,
    verification: {
      faceEyeIntrusionCount: intrusionCount, faceEyeIntrusionPercent: roundTo((intrusionCount / checked) * 100, 2),
      totalRays: rays.length, clippedRays, guaranteedFaceEyeClear: intrusionCount === 0,
    },
  };
}

// === 데모 픽스처 ===

export function createDemoEyeFlowInput(simulateBacktrackIssue = false): EyeFlowEpisodeInput {
  return {
    episodeTitle: "EP.24 새벽 옥상 대치", canvasWidthPx: 800, readingOrder: "ltr-scroll", heatmapCols: 8, heatmapRows: 12,
    cuts: [
      {
        cutId: "cut-01", order: 1, yStartPx: 0, widthPx: 800, heightPx: 920, gapBeforePx: 80, contrastRatio: 8.4,
        characterGaze: { originX: 0.34, originY: 0.42, targetX: 0.68, targetY: 0.58 }, focalPoint: { x: 0.36, y: 0.44, contrastStrength: 0.78 },
        balloons: [
          { id: "b-01", order: 1, x: 0.28, y: 0.18, width: 0.34, height: 0.12, charCount: 16, kind: "dialogue" },
          { id: "b-02", order: 2, x: 0.66, y: 0.64, width: 0.32, height: 0.14, charCount: 22, kind: "dialogue" },
        ],
      },
      {
        cutId: "cut-02", order: 2, yStartPx: 1140, widthPx: 800, heightPx: 880, gapBeforePx: 220, contrastRatio: 10.2,
        characterGaze: simulateBacktrackIssue ? { originX: 0.62, originY: 0.45, targetX: 0.14, targetY: 0.22 } : { originX: 0.32, originY: 0.45, targetX: 0.74, targetY: 0.68 },
        focalPoint: { x: 0.58, y: 0.48, contrastStrength: 0.85 },
        balloons: simulateBacktrackIssue
          ? [{ id: "b-03", order: 1, x: 0.72, y: 0.68, width: 0.3, height: 0.12, charCount: 24, kind: "dialogue" }, { id: "b-04", order: 2, x: 0.24, y: 0.22, width: 0.34, height: 0.12, charCount: 19, kind: "dialogue" }]
          : [{ id: "b-03", order: 1, x: 0.3, y: 0.22, width: 0.32, height: 0.12, charCount: 24, kind: "dialogue" }, { id: "b-04", order: 2, x: 0.7, y: 0.66, width: 0.3, height: 0.12, charCount: 19, kind: "dialogue" }],
      },
      {
        cutId: "cut-03-cliff", order: 3, yStartPx: simulateBacktrackIssue ? 2100 : 2500, widthPx: 800, heightPx: 1240,
        gapBeforePx: simulateBacktrackIssue ? 80 : 480, isCliffhanger: true, contrastRatio: 14.8,
        characterGaze: { originX: 0.5, originY: 0.4, targetX: 0.5, targetY: 0.82 }, focalPoint: { x: 0.5, y: 0.42, contrastStrength: 0.96 },
        balloons: [{ id: "b-05", order: 1, x: 0.52, y: 0.78, width: 0.42, height: 0.1, charCount: 14, kind: "sfx" }],
      },
    ],
  };
}

export function createDemoRelightInput(mood: RelightMoodPresetId = "sunset-gold", enablePaletteLock = true): RelightCutInput {
  const width = 8;
  const height = 4;
  const sourcePixels = new Uint8ClampedArray(width * height * 4);
  const bands: readonly (readonly [number, number, number])[] = [[238, 200, 178], [48, 62, 118], [132, 184, 228], [76, 86, 98]];
  for (let i = 0; i < width * height; i += 1) {
    const band = bands[Math.floor(i / 8) % bands.length] ?? [180, 180, 180];
    const jitter = ((i % 8) - 4) * 3;
    const base = i * 4;
    sourcePixels[base] = clamp(band[0] + jitter, 0, 255);
    sourcePixels[base + 1] = clamp(band[1] + jitter, 0, 255);
    sourcePixels[base + 2] = clamp(band[2] + jitter, 0, 255);
    sourcePixels[base + 3] = 255;
  }
  return {
    cutId: "cut-03-cliff", width, height, sourcePixels, mood, intensity: 0.9,
    lockedSwatches: enablePaletteLock
      ? [
          { id: "protagonist-skin", labelKo: "주인공 피부톤 락", labelEn: "Protagonist Skin Lock", targetOklch: srgbToOklch(238 / 255, 200 / 255, 178 / 255), hueToleranceDeg: 26, chromaTolerance: 0.08, lockStrength: 0.92 },
          { id: "protagonist-hair", labelKo: "주인공 시그니처 헤어 락", labelEn: "Signature Hair Lock", targetOklch: srgbToOklch(48 / 255, 62 / 255, 118 / 255), hueToleranceDeg: 24, chromaTolerance: 0.09, lockStrength: 0.88 },
        ]
      : [],
  };
}

export function createDemoMagneticFramingInput(style: SpeedlineStyleId = "focus-radial"): MagneticFramingInput {
  return {
    cutWidth: 800, cutHeight: 960, preferredFocus: { x: 400, y: 420 }, speedlineStyle: style, rayCount: 48,
    protectedZones: [
      { id: "face-lead", kind: "face", label: "주인공 얼굴", x: 300, y: 290, width: 200, height: 240, safetyMarginPx: 14 },
      { id: "eye-left", kind: "eye", label: "왼쪽 눈", x: 336, y: 368, width: 42, height: 26, safetyMarginPx: 16 },
      { id: "eye-right", kind: "eye", label: "오른쪽 눈", x: 422, y: 368, width: 42, height: 26, safetyMarginPx: 16 },
    ],
    balloons: [
      { id: "balloon-top-left", speakerId: "lead", x: 44, y: 64, width: 220, height: 112, speakerMouth: { x: 400, y: 472 }, speakerFaceZoneId: "face-lead" },
      { id: "balloon-bottom-right", speakerId: "lead", x: 520, y: 710, width: 236, height: 116, speakerMouth: { x: 400, y: 472 }, speakerFaceZoneId: "face-lead" },
    ],
  };
}
