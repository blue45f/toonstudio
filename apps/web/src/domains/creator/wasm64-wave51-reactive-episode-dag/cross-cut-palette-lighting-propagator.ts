/**
 * Wave 51: 동일 씬 2~N컷 비파괴 팔레트·조명·배경 3D·말풍선 톤 연쇄 전파 엔진.
 *
 * - 1컷에서 변경된 OKLCH 팔레트, 씬 조명(색온도·그림자 방향·강도), 배경 3D 무드 델타를
 *   동일 씬 후속 컷의 밑색·명암·배경 3D 조명·말풍선 톤으로 일괄 계산한다.
 * - 원본 DAG 상태를 직접 수정하지 않고 컷별 선택/제외 가능한 `PropagationPatchPlan`을 산출한다.
 * - 피부 색상각 `<= 4°` 보호, 밑색-명암 최소 명도차 보장, 말풍선 본문 WCAG 가독성 대비(`>= 7.0:1`)
 *   자동 보정을 함께 수행한다.
 */

import type {
  Bg3dCameraMoodParams,
  Bg3dLayerLightingState,
  CutLayerKind,
  CutLayerNode,
  EpisodeSceneDependencyDag,
  OklchColor,
  PinnedLayerConflict,
  SceneLightingParams,
  SpeechBubbleToneState,
} from "./episode-scene-dependency-dag";

export const MAX_SKIN_HUE_SHIFT_DEG = 4 as const;
export const MIN_SPEECH_BUBBLE_CONTRAST_RATIO = 7.0 as const;
export const MIN_CEL_SHADOW_LIGHTNESS_GAP = 0.08 as const;

export interface PaletteTokenDelta {
  readonly tokenNodeId: string;
  readonly previousOklch: OklchColor;
  readonly nextOklch: OklchColor;
}

export interface SceneLightingDelta {
  readonly presetNodeId: string;
  readonly previousLighting: SceneLightingParams;
  readonly nextLighting: SceneLightingParams;
}

export interface Bg3dMoodDelta {
  readonly moodNodeId: string;
  readonly previousMood: Bg3dCameraMoodParams;
  readonly nextMood: Bg3dCameraMoodParams;
}

export interface CrossCutPropagationRequest {
  readonly planId: string;
  readonly sceneId: string;
  readonly sourceCutId: string;
  readonly paletteDeltas?: readonly PaletteTokenDelta[];
  readonly lightingDelta?: SceneLightingDelta;
  readonly bg3dMoodDelta?: Bg3dMoodDelta;
  readonly excludeCutIds?: readonly string[];
  readonly includeSourceCut?: boolean;
  readonly createdAtIso?: string;
}

export interface ContrastSafetyAdjustment {
  readonly adjusted: boolean;
  readonly reasonKo?: string;
  readonly originalContrastRatio: number;
  readonly correctedContrastRatio: number;
}

export interface LayerStylePatch {
  readonly nodeId: string;
  readonly cutId: string;
  readonly cutIndex: number;
  readonly layerId: string;
  readonly layerKind: CutLayerKind;
  readonly labelKo: string;
  readonly beforeColorOklch: OklchColor;
  readonly afterColorOklch: OklchColor;
  readonly deltaEOklch: number;
  readonly beforeShadowAngleDeg?: number;
  readonly afterShadowAngleDeg?: number;
  readonly beforeBg3dLighting?: Bg3dLayerLightingState;
  readonly afterBg3dLighting?: Bg3dLayerLightingState;
  readonly beforeSpeechBubbleTone?: SpeechBubbleToneState;
  readonly afterSpeechBubbleTone?: SpeechBubbleToneState;
  readonly skinHueProtected: boolean;
  readonly contrastSafety: ContrastSafetyAdjustment;
  readonly estimatedRenderMs: number;
}

export interface CutPropagationPatch {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly selected: boolean;
  readonly excludedByUser: boolean;
  readonly layerPatches: readonly LayerStylePatch[];
  readonly skippedPinnedLayers: readonly PinnedLayerConflict[];
  readonly maxDeltaEOklch: number;
  readonly meanDeltaEOklch: number;
  readonly contrastCorrectionCount: number;
  readonly estimatedRenderMs: number;
}

export interface PropagationPatchPlan {
  readonly planId: string;
  readonly sceneId: string;
  readonly sourceCutId: string;
  readonly createdAtIso: string;
  readonly triggerNodeIds: readonly string[];
  readonly cutPatches: readonly CutPropagationPatch[];
  readonly isolatedOtherSceneCutIds: readonly string[];
  readonly totalPinnedConflictCount: number;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;
const round4 = (v: number): number => Math.round(v * 10_000) / 10_000;

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

export function normalizeHueDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped === 0 ? 0 : wrapped;
}

export function shortestHueDeltaDeg(fromDeg: number, toDeg: number): number {
  const diff = normalizeHueDeg(toDeg) - normalizeHueDeg(fromDeg);
  return diff > 180 ? diff - 360 : diff < -180 ? diff + 360 : diff;
}

function oklchToOklab(color: OklchColor): { l: number; a: number; b: number } {
  const rad = (normalizeHueDeg(color.hDeg) * Math.PI) / 180;
  const c = clamp(color.c, 0, 0.4);
  return { l: clamp(color.l, 0, 1), a: c * Math.cos(rad), b: c * Math.sin(rad) };
}

/** OKLab 유클리드 색차(ΔE × 100 스케일)를 산출한다. */
export function computeOklchDeltaE(from: OklchColor, to: OklchColor): number {
  const a = oklchToOklab(from);
  const b = oklchToOklab(to);
  return round2(Math.hypot(b.l - a.l, b.a - a.a, b.b - a.b) * 100);
}

/** OKLCH 색상을 선형 sRGB 상대 휘도(`0..1`)로 변환한다(Björn Ottosson OKLab 행렬). */
export function computeOklchRelativeLuminance(color: OklchColor): number {
  const { l, a, b } = oklchToOklab(color);
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linR = clamp(+4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3, 0, 1);
  const linG = clamp(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3, 0, 1);
  const linB = clamp(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3, 0, 1);
  return 0.2126 * linR + 0.7152 * linG + 0.0722 * linB;
}

/** 두 OKLCH 색상 간 WCAG 2.1 명암비(`1.0..21.0`)를 계산한다. */
export function computeOklchContrastRatio(a: OklchColor, b: OklchColor): number {
  const lumA = computeOklchRelativeLuminance(a);
  const lumB = computeOklchRelativeLuminance(b);
  return round2((Math.max(lumA, lumB) + 0.05) / (Math.min(lumA, lumB) + 0.05));
}

function blendOklch(base: OklchColor, target: OklchColor, weight: number): OklchColor {
  const t = clamp(weight, 0, 1);
  const a = oklchToOklab(base);
  const b = oklchToOklab(target);
  const labA = a.a + (b.a - a.a) * t;
  const labB = a.b + (b.b - a.b) * t;
  const c = clamp(Math.hypot(labA, labB), 0, 0.37);
  const hDeg = c < 1e-4 ? normalizeHueDeg(base.hDeg) : normalizeHueDeg((Math.atan2(labB, labA) * 180) / Math.PI);
  return { l: round4(clamp(a.l + (b.l - a.l) * t, 0, 1)), c: round4(c), hDeg: round2(hDeg) };
}

function applyPaletteDelta(current: OklchColor, delta: PaletteTokenDelta, scale: number): OklchColor {
  return {
    l: round4(clamp(current.l + (delta.nextOklch.l - delta.previousOklch.l) * scale, 0.04, 0.98)),
    c: round4(clamp(current.c + (delta.nextOklch.c - delta.previousOklch.c) * scale, 0, 0.37)),
    hDeg: round2(normalizeHueDeg(current.hDeg + shortestHueDeltaDeg(delta.previousOklch.hDeg, delta.nextOklch.hDeg) * scale)),
  };
}

function guardSkinHue(original: OklchColor, candidate: OklchColor): { color: OklchColor; protected: boolean } {
  const drift = shortestHueDeltaDeg(original.hDeg, candidate.hDeg);
  if (Math.abs(drift) <= MAX_SKIN_HUE_SHIFT_DEG) return { color: candidate, protected: false };
  return {
    color: { ...candidate, hDeg: round2(normalizeHueDeg(original.hDeg + Math.sign(drift) * MAX_SKIN_HUE_SHIFT_DEG)) },
    protected: true,
  };
}

function estimateLayerRenderMs(layer: CutLayerNode): number {
  if (layer.baseRenderMs !== undefined && Number.isFinite(layer.baseRenderMs)) {
    return Math.max(0.4, round2(layer.baseRenderMs));
  }
  const defaults: Readonly<Record<CutLayerKind, number>> = {
    "bg3d-lighting": 6.8,
    "cel-shadow": 2.4,
    "base-flat": 1.6,
    "speech-bubble-tone": 0.9,
  };
  return defaults[layer.layerKind];
}

function ensureSpeechBubbleReadability(
  fill: OklchColor,
  ink: OklchColor,
): { fill: OklchColor; safety: ContrastSafetyAdjustment } {
  const originalContrast = computeOklchContrastRatio(fill, ink);
  if (originalContrast >= MIN_SPEECH_BUBBLE_CONTRAST_RATIO) {
    return {
      fill,
      safety: { adjusted: false, originalContrastRatio: originalContrast, correctedContrastRatio: originalContrast },
    };
  }
  const moveLighter = computeOklchRelativeLuminance(ink) < 0.35;
  let adjustedFill = fill;
  for (let step = 1; step <= 14; step += 1) {
    adjustedFill = {
      l: round4(moveLighter ? clamp(fill.l + step * 0.045, 0, 0.985) : clamp(fill.l - step * 0.045, 0.04, 1)),
      c: round4(clamp(fill.c * Math.max(0.25, 1 - step * 0.07), 0, 0.12)),
      hDeg: fill.hDeg,
    };
    const ratio = computeOklchContrastRatio(adjustedFill, ink);
    if (ratio >= MIN_SPEECH_BUBBLE_CONTRAST_RATIO) {
      return {
        fill: adjustedFill,
        safety: {
          adjusted: true,
          reasonKo: `말풍선 본문 가독성 대비를 ${originalContrast}:1에서 ${ratio}:1로 자동 보정했습니다.`,
          originalContrastRatio: originalContrast,
          correctedContrastRatio: ratio,
        },
      };
    }
  }
  const finalRatio = computeOklchContrastRatio(adjustedFill, ink);
  return {
    fill: adjustedFill,
    safety: {
      adjusted: true,
      reasonKo: `말풍선 대비 안전 한계까지 명도를 보정했습니다 (${originalContrast}:1 -> ${finalRatio}:1).`,
      originalContrastRatio: originalContrast,
      correctedContrastRatio: finalRatio,
    },
  };
}

function computeLayerPatch(
  layer: CutLayerNode,
  triggerNodeIds: readonly string[],
  paletteMap: ReadonlyMap<string, PaletteTokenDelta>,
  lightingDelta: SceneLightingDelta | undefined,
  bg3dMoodDelta: Bg3dMoodDelta | undefined,
  referenceBaseOklch: OklchColor | undefined,
): LayerStylePatch {
  let nextColor = layer.colorOklch;
  let skinHueProtected = false;
  let nextShadowAngle = layer.shadowAngleDeg;
  let nextBg3d = layer.bg3dLighting;
  let nextBubble = layer.speechBubbleTone;
  let contrastSafety: ContrastSafetyAdjustment = {
    adjusted: false,
    originalContrastRatio: 1,
    correctedContrastRatio: 1,
  };

  for (const triggerId of triggerNodeIds) {
    const paletteDelta = paletteMap.get(triggerId);
    if (paletteDelta) {
      nextColor = applyPaletteDelta(nextColor, paletteDelta, layer.layerKind === "cel-shadow" ? 0.85 : 1.0);
    }
  }

  if (lightingDelta && triggerNodeIds.includes(lightingDelta.presetNodeId)) {
    const { previousLighting: prev, nextLighting: next } = lightingDelta;
    const dShadow = next.shadowIntensity - prev.shadowIntensity;
    const dAzimuth = shortestHueDeltaDeg(prev.shadowAzimuthDeg, next.shadowAzimuthDeg);
    const dElev = next.shadowElevationDeg - prev.shadowElevationDeg;

    if (layer.layerKind === "base-flat") {
      const tinted = blendOklch(nextColor, next.moodTintOklch, layer.slot === "skin" ? 0.22 : 0.34);
      if (layer.slot === "skin") {
        const guarded = guardSkinHue(layer.colorOklch, tinted);
        nextColor = guarded.color;
        skinHueProtected = guarded.protected;
      } else {
        nextColor = tinted;
      }
    } else if (layer.layerKind === "cel-shadow") {
      const tinted = blendOklch(nextColor, next.moodTintOklch, 0.42);
      nextColor = {
        l: round4(clamp(tinted.l - dShadow * 0.22, 0.06, 0.88)),
        c: round4(clamp(tinted.c + Math.abs(dShadow) * 0.03, 0, 0.35)),
        hDeg: tinted.hDeg,
      };
      nextShadowAngle = normalizeHueDeg((layer.shadowAngleDeg ?? prev.shadowAzimuthDeg) + dAzimuth);
      if (referenceBaseOklch) {
        const beforeRatio = computeOklchContrastRatio(referenceBaseOklch, nextColor);
        if (referenceBaseOklch.l - nextColor.l < MIN_CEL_SHADOW_LIGHTNESS_GAP) {
          nextColor = { ...nextColor, l: round4(clamp(referenceBaseOklch.l - MIN_CEL_SHADOW_LIGHTNESS_GAP, 0.05, 0.85)) };
          contrastSafety = {
            adjusted: true,
            reasonKo: "밑색과 셀 그림자의 최소 명도차(0.08)를 확보하도록 그림자 명도를 보정했습니다.",
            originalContrastRatio: beforeRatio,
            correctedContrastRatio: computeOklchContrastRatio(referenceBaseOklch, nextColor),
          };
        } else {
          contrastSafety = { adjusted: false, originalContrastRatio: beforeRatio, correctedContrastRatio: beforeRatio };
        }
      }
    } else if (layer.layerKind === "bg3d-lighting") {
      nextColor = blendOklch(nextColor, next.moodTintOklch, 0.55);
      const base3d: Bg3dLayerLightingState = layer.bg3dLighting ?? {
        keyKelvin: prev.keyKelvin, ambientKelvin: prev.ambientKelvin,
        sunAzimuthDeg: prev.shadowAzimuthDeg, sunElevationDeg: prev.shadowElevationDeg,
        shadowHardness: prev.shadowIntensity, fogDensity: 0.12, rimGlowStrength: 0.25, fogTintOklch: prev.moodTintOklch,
      };
      nextBg3d = {
        ...base3d,
        keyKelvin: Math.round(clamp(base3d.keyKelvin + (next.keyKelvin - prev.keyKelvin), 1_800, 15_000)),
        ambientKelvin: Math.round(clamp(base3d.ambientKelvin + (next.ambientKelvin - prev.ambientKelvin), 2_000, 18_000)),
        sunAzimuthDeg: round2(normalizeHueDeg(base3d.sunAzimuthDeg + dAzimuth)),
        sunElevationDeg: round2(clamp(base3d.sunElevationDeg + dElev, 5, 88)),
        shadowHardness: Math.round(clamp(base3d.shadowHardness + dShadow, 0.05, 0.95) * 1_000) / 1_000,
        fogTintOklch: blendOklch(base3d.fogTintOklch, next.moodTintOklch, 0.65),
      };
    } else {
      const baseBubble: SpeechBubbleToneState = layer.speechBubbleTone ?? {
        fillOklch: layer.colorOklch, borderOklch: { l: 0.22, c: 0.01, hDeg: 260 }, inkOklch: { l: 0.14, c: 0.01, hDeg: 260 },
      };
      const rawFill = blendOklch(baseBubble.fillOklch, next.moodTintOklch, clamp(next.speechBubbleTintStrength, 0.05, 0.45));
      const checked = ensureSpeechBubbleReadability(rawFill, baseBubble.inkOklch);
      nextColor = checked.fill;
      nextBubble = { fillOklch: checked.fill, borderOklch: blendOklch(baseBubble.borderOklch, next.moodTintOklch, 0.22), inkOklch: baseBubble.inkOklch };
      contrastSafety = checked.safety;
    }
  }

  if (bg3dMoodDelta && triggerNodeIds.includes(bg3dMoodDelta.moodNodeId) && layer.layerKind === "bg3d-lighting") {
    const { previousMood: prevMood, nextMood } = bg3dMoodDelta;
    const base3d: Bg3dLayerLightingState = nextBg3d ?? layer.bg3dLighting ?? {
      keyKelvin: 6_500, ambientKelvin: 7_500, sunAzimuthDeg: prevMood.azimuthDeg, sunElevationDeg: prevMood.elevationDeg,
      shadowHardness: 0.35, fogDensity: prevMood.fogDensity, rimGlowStrength: prevMood.rimGlowStrength, fogTintOklch: prevMood.fogTintOklch,
    };
    const updatedFogTint = blendOklch(base3d.fogTintOklch, nextMood.fogTintOklch, 0.7);
    nextBg3d = {
      ...base3d,
      fogDensity: Math.round(clamp(base3d.fogDensity + (nextMood.fogDensity - prevMood.fogDensity), 0, 1) * 1_000) / 1_000,
      rimGlowStrength: Math.round(clamp(base3d.rimGlowStrength + (nextMood.rimGlowStrength - prevMood.rimGlowStrength), 0, 1) * 1_000) / 1_000,
      fogTintOklch: updatedFogTint,
    };
    nextColor = blendOklch(nextColor, updatedFogTint, 0.45);
  }

  return {
    nodeId: layer.nodeId, cutId: layer.cutId, cutIndex: layer.cutIndex,
    layerId: layer.layerId, layerKind: layer.layerKind, labelKo: layer.labelKo,
    beforeColorOklch: layer.colorOklch, afterColorOklch: nextColor,
    deltaEOklch: computeOklchDeltaE(layer.colorOklch, nextColor),
    beforeShadowAngleDeg: layer.shadowAngleDeg, afterShadowAngleDeg: nextShadowAngle,
    beforeBg3dLighting: layer.bg3dLighting, afterBg3dLighting: nextBg3d,
    beforeSpeechBubbleTone: layer.speechBubbleTone, afterSpeechBubbleTone: nextBubble,
    skinHueProtected, contrastSafety, estimatedRenderMs: estimateLayerRenderMs(layer),
  };
}

/** 1컷 변경 델타를 기반으로 동일 씬 전체 컷에 대한 비파괴 전파 패치 플랜을 계산한다. */
export function buildCrossCutPropagationPlan(
  dag: EpisodeSceneDependencyDag,
  request: CrossCutPropagationRequest,
): PropagationPatchPlan {
  const paletteMap = new Map<string, PaletteTokenDelta>();
  const triggerNodeIds: string[] = [];
  for (const delta of request.paletteDeltas ?? []) {
    paletteMap.set(delta.tokenNodeId, delta);
    triggerNodeIds.push(delta.tokenNodeId);
  }
  if (request.lightingDelta) triggerNodeIds.push(request.lightingDelta.presetNodeId);
  if (request.bg3dMoodDelta) triggerNodeIds.push(request.bg3dMoodDelta.moodNodeId);

  const closure = dag.computeDirtyClosure(triggerNodeIds, { scopeSceneId: request.sceneId, respectArtistPins: true });
  const excludeSet = new Set(request.excludeCutIds ?? []);
  const includeSource = request.includeSourceCut ?? false;
  const cutBuckets = new Map<string, { cutIndex: number; patches: LayerStylePatch[]; pinned: PinnedLayerConflict[] }>();
  const ensureBucket = (cutId: string, cutIndex: number) => {
    const existing = cutBuckets.get(cutId);
    if (existing) return existing;
    const created = { cutIndex, patches: [] as LayerStylePatch[], pinned: [] as PinnedLayerConflict[] };
    cutBuckets.set(cutId, created);
    return created;
  };

  const baseColorByCutCharacter = new Map<string, OklchColor>();
  for (const entry of closure.dirtyLayers) {
    if (!includeSource && entry.node.cutId === request.sourceCutId) continue;
    const key = `${entry.node.cutId}::${entry.node.characterId ?? "global"}::${entry.node.slot ?? "any"}`;
    const refBase = entry.node.layerKind === "cel-shadow" ? baseColorByCutCharacter.get(key) : undefined;
    const patch = computeLayerPatch(entry.node, entry.triggerNodeIds, paletteMap, request.lightingDelta, request.bg3dMoodDelta, refBase);
    if (entry.node.layerKind === "base-flat") baseColorByCutCharacter.set(key, patch.afterColorOklch);
    ensureBucket(entry.node.cutId, entry.node.cutIndex).patches.push(patch);
  }
  for (const conflict of closure.protectedPinnedLayers) {
    if (!includeSource && conflict.cutId === request.sourceCutId) continue;
    ensureBucket(conflict.cutId, conflict.cutIndex).pinned.push(conflict);
  }

  const cutPatches: CutPropagationPatch[] = [...cutBuckets.entries()]
    .sort(([, a], [, b]) => a.cutIndex - b.cutIndex)
    .map(([cutId, bucket]) => {
      const excludedByUser = excludeSet.has(cutId);
      const deltas = bucket.patches.map((p) => p.deltaEOklch);
      return {
        cutId, cutIndex: bucket.cutIndex,
        selected: !excludedByUser && bucket.patches.length > 0, excludedByUser,
        layerPatches: bucket.patches, skippedPinnedLayers: bucket.pinned,
        maxDeltaEOklch: deltas.length > 0 ? Math.max(...deltas) : 0,
        meanDeltaEOklch: deltas.length > 0 ? round2(deltas.reduce((s, v) => s + v, 0) / deltas.length) : 0,
        contrastCorrectionCount: bucket.patches.filter((p) => p.contrastSafety.adjusted).length,
        estimatedRenderMs: round2(bucket.patches.reduce((s, p) => s + p.estimatedRenderMs, 0)),
      };
    });

  return {
    planId: request.planId, sceneId: request.sceneId, sourceCutId: request.sourceCutId,
    createdAtIso: request.createdAtIso ?? "2026-11-27T00:00:00.000Z",
    triggerNodeIds, cutPatches,
    isolatedOtherSceneCutIds: closure.isolatedOtherSceneCutIds,
    totalPinnedConflictCount: cutPatches.reduce((sum, c) => sum + c.skippedPinnedLayers.length, 0),
  };
}

/** 전파 패치 플랜에서 특정 컷의 적용/제외 상태를 비파괴로 토글한 새 플랜을 반환한다. */
export function toggleCutSelectionInPlan(plan: PropagationPatchPlan, cutId: string, selected: boolean): PropagationPatchPlan {
  return {
    ...plan,
    cutPatches: plan.cutPatches.map((cut) =>
      cut.cutId !== cutId ? cut : { ...cut, selected: selected && cut.layerPatches.length > 0, excludedByUser: !selected },
    ),
  };
}
