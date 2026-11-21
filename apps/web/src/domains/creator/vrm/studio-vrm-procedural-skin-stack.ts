/**
 * 비파괴 절차적 캐릭터 스킨/표정 데칼 스택 + ARKit-52 리매퍼 + 한/영 조음 립싱크 엔진
 * (Character Creator 4 SkinGen & AccuLIPS · VBridger 클린룸 구현).
 *
 * - SkinGen 비파괴 레이어 스택: base-skin, cel-shadow-ramp, decal(blush/makeup/freckles/scar/tattoo/sweat/tears),
 *   outfit-seam, micro-grain + 표정 가중치 연동 데칼 불투명도 자동 제어(Expression-Driven Decal Link)
 * - 공식 ARKit 52 블렌드셰이프 전체 채널 캘리브레이션 -> VRM 1.0 & 2D ArtMesh 동시 리매핑
 * - 한글 음절 자모(초·중·종성) + 영문 음소 분해 -> 5모음(aa/ih/ou/ee/oh) + 양순음(mbp) + 치순음(fv)
 *   선행/잔류 조음(Co-articulation) 스무딩 립싱크 트랙 생성기
 */

export const VRM_PROCEDURAL_SKIN_SCHEMA_VERSION = 1 as const;

/** 공식 ARKit 52개 표정 블렌드셰이프 이름 목록. */
export const ARKIT_52_BLENDSHAPE_NAMES = [
  "browDownLeft",
  "browDownRight",
  "browInnerUp",
  "browOuterUpLeft",
  "browOuterUpRight",
  "cheekPuff",
  "cheekSquintLeft",
  "cheekSquintRight",
  "eyeBlinkLeft",
  "eyeBlinkRight",
  "eyeLookDownLeft",
  "eyeLookDownRight",
  "eyeLookInLeft",
  "eyeLookInRight",
  "eyeLookOutLeft",
  "eyeLookOutRight",
  "eyeLookUpLeft",
  "eyeLookUpRight",
  "eyeSquintLeft",
  "eyeSquintRight",
  "eyeWideLeft",
  "eyeWideRight",
  "jawForward",
  "jawLeft",
  "jawOpen",
  "jawRight",
  "mouthClose",
  "mouthDimpleLeft",
  "mouthDimpleRight",
  "mouthFrownLeft",
  "mouthFrownRight",
  "mouthFunnel",
  "mouthLeft",
  "mouthLowerDownLeft",
  "mouthLowerDownRight",
  "mouthPressLeft",
  "mouthPressRight",
  "mouthPucker",
  "mouthRight",
  "mouthRollLower",
  "mouthRollUpper",
  "mouthShrugLower",
  "mouthShrugUpper",
  "mouthSmileLeft",
  "mouthSmileRight",
  "mouthStretchLeft",
  "mouthStretchRight",
  "mouthUpperUpLeft",
  "mouthUpperUpRight",
  "noseSneerLeft",
  "noseSneerRight",
  "tongueOut",
] as const;

export type Arkit52ChannelName = (typeof ARKIT_52_BLENDSHAPE_NAMES)[number];
export type Arkit52WeightMap = Partial<Record<Arkit52ChannelName, number>>;

export type SkinLayerKind =
  | "base-skin"
  | "cel-shadow-ramp"
  | "decal"
  | "outfit-seam"
  | "micro-grain";

export type SkinDecalSubkind =
  | "blush"
  | "makeup"
  | "freckles"
  | "scar"
  | "tattoo"
  | "sweat"
  | "tears";

export type SkinLayerBlendMode = "normal" | "multiply" | "screen" | "overlay" | "soft-light";

export interface ExpressionDecalLink {
  /** 표정 키(예: "shy", "angry", "shock", "sad", "happy"). */
  readonly expressionKey: string;
  readonly minWeight: number;
  readonly maxWeight: number;
  readonly gain: number;
}

export interface SkinSurfaceLayer {
  readonly id: string;
  readonly name: string;
  readonly kind: SkinLayerKind;
  readonly decalSubkind?: SkinDecalSubkind;
  readonly visible: boolean;
  /** 기본 불투명도(0..1). */
  readonly opacity: number;
  readonly blendMode: SkinLayerBlendMode;
  /** 주 색상(sRGB 0..1 수치 튜플). */
  readonly colorRgb: readonly [number, number, number];
  /** 보조 색상(그림자 램프/그라데이션용). */
  readonly secondaryRgb?: readonly [number, number, number];
  /** UV 적용 영역 [uMin, vMin, uMax, vMax] (기본 [0, 0, 1, 1]). */
  readonly uvRect?: readonly [number, number, number, number];
  /** 절차적 패턴 주파수/밀도/시드. */
  readonly density?: number;
  readonly seed?: number;
  /** 표정 가중치에 연동해 불투명도를 동적 증폭하는 링크 목록. */
  readonly expressionLinks?: readonly ExpressionDecalLink[];
}

export interface ProceduralSkinSurfaceStack {
  readonly version: typeof VRM_PROCEDURAL_SKIN_SCHEMA_VERSION;
  readonly characterId: string;
  readonly layers: readonly SkinSurfaceLayer[];
}

export interface ArkitChannelCalibration {
  readonly deadzone: number;
  readonly sensitivity: number;
  readonly gamma: number;
  readonly minOut: number;
  readonly maxOut: number;
}

export interface VrmAndArtMeshExpressionFrame {
  readonly arkit52: Record<Arkit52ChannelName, number>;
  readonly vrm10: {
    readonly happy: number;
    readonly angry: number;
    readonly sad: number;
    readonly relaxed: number;
    readonly surprised: number;
    readonly aa: number;
    readonly ih: number;
    readonly ou: number;
    readonly ee: number;
    readonly oh: number;
    readonly blinkLeft: number;
    readonly blinkRight: number;
    readonly lookUp: number;
    readonly lookDown: number;
    readonly lookLeft: number;
    readonly lookRight: number;
  };
  readonly artMesh2d: {
    readonly mouthOpenY: number;
    readonly mouthForm: number;
    readonly eyeOpenL: number;
    readonly eyeOpenR: number;
    readonly browY: number;
  };
}

export type VisemeKind = "sil" | "aa" | "ih" | "ou" | "ee" | "oh" | "mbp" | "fv";

export interface TimedVisemeKeyframe {
  readonly timeSec: number;
  readonly durationSec: number;
  readonly viseme: VisemeKind;
  readonly intensity: number;
  readonly token: string;
}

export interface LipSyncVisemeWeights {
  readonly aa: number;
  readonly ih: number;
  readonly ou: number;
  readonly ee: number;
  readonly oh: number;
  readonly mouthClose: number;
  readonly mouthOpenY: number;
  readonly mouthForm: number;
}

export interface CoArticulatedLipSyncTrack {
  readonly durationSec: number;
  readonly keyframes: readonly TimedVisemeKeyframe[];
  readonly coArticulationLeadSec: number;
  readonly coArticulationTrailSec: number;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function hash2dUnit(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** 표정 가중치(shy/angry/shock 등)에 따라 각 스킨/데칼 레이어의 유효 불투명도를 계산한다. */
export function evaluateEffectiveLayerOpacities(
  stack: ProceduralSkinSurfaceStack,
  expressionWeights: Readonly<Record<string, number>>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const layer of stack.layers) {
    if (!layer.visible) {
      result[layer.id] = 0;
      continue;
    }
    let effective = clamp01(layer.opacity);
    if (layer.expressionLinks && layer.expressionLinks.length > 0) {
      let linkedBoost = 0;
      for (const link of layer.expressionLinks) {
        const raw = clamp01(expressionWeights[link.expressionKey] ?? 0);
        const span = Math.max(1e-5, link.maxWeight - link.minWeight);
        const norm = clamp01((raw - link.minWeight) / span);
        const smooth = norm * norm * (3 - 2 * norm);
        linkedBoost += smooth * link.gain;
      }
      effective = clamp01(effective + linkedBoost);
    }
    result[layer.id] = effective;
  }
  return result;
}

function blendChannel(base: number, src: number, mode: SkinLayerBlendMode): number {
  if (mode === "multiply") return base * src;
  if (mode === "screen") return 1 - (1 - base) * (1 - src);
  if (mode === "overlay") return base < 0.5 ? 2 * base * src : 1 - 2 * (1 - base) * (1 - src);
  if (mode === "soft-light") return (1 - 2 * src) * base * base + 2 * src * base;
  return src;
}

function evaluateLayerMaskAtUv(
  layer: SkinSurfaceLayer,
  u: number,
  v: number,
  px: number,
  py: number,
): number {
  const rect = layer.uvRect ?? [0, 0, 1, 1];
  if (u < rect[0] || u > rect[2] || v < rect[1] || v > rect[3]) return 0;

  const lu = (u - rect[0]) / Math.max(1e-5, rect[2] - rect[0]);
  const lv = (v - rect[1]) / Math.max(1e-5, rect[3] - rect[1]);
  const seed = layer.seed ?? 17;

  if (layer.kind === "base-skin") return 1;
  if (layer.kind === "cel-shadow-ramp") {
    // 하단/가장자리 2단 셀 그림자 마스크
    return lv > 0.62 ? 0.85 : lv > 0.48 ? 0.35 : 0;
  }
  if (layer.kind === "micro-grain") {
    const n = hash2dUnit(px, py, seed);
    return n * clamp01(layer.density ?? 0.5);
  }
  if (layer.kind === "outfit-seam") {
    const freq = Math.max(2, layer.density ?? 12);
    const seamDist = Math.abs(lu - 0.5);
    if (seamDist > 0.04) return 0;
    const stitch = Math.sin(lv * Math.PI * 2 * freq) > 0 ? 1 : 0.25;
    return (1 - seamDist / 0.04) * stitch;
  }

  // decal subkinds
  const dx = (lu - 0.5) * 2;
  const dy = (lv - 0.5) * 2;
  const r = Math.hypot(dx, dy);
  if (layer.decalSubkind === "freckles") {
    if (r > 1) return 0;
    const cellX = Math.floor(lu * 18);
    const cellY = Math.floor(lv * 18);
    const h = hash2dUnit(cellX, cellY, seed);
    return h > 1 - clamp01(layer.density ?? 0.22) ? (1 - r) * 0.9 : 0;
  }
  if (layer.decalSubkind === "scar") {
    const lineDist = Math.abs(dx * 0.8 - dy * 0.6);
    const along = Math.abs(dx * 0.6 + dy * 0.8);
    return along <= 0.85 && lineDist <= 0.14 ? 1 - lineDist / 0.14 : 0;
  }
  if (layer.decalSubkind === "tears") {
    const drop = Math.hypot(dx * 1.4, (dy - 0.15) * 0.85);
    return drop <= 0.9 ? (1 - drop / 0.9) * (1 - drop / 0.9) : 0;
  }
  // blush, makeup, tattoo, sweat -> 부드러운 방사형 마스크
  if (r >= 1) return 0;
  const falloff = 1 - r;
  return falloff * falloff * (3 - 2 * falloff);
}

/** 비파괴 SkinGen 레이어 스택을 표정 연동 불투명도와 함께 오프스크린 RGBA 버퍼로 합성한다. */
export function compositeSkinSurfaceStack(
  stack: ProceduralSkinSurfaceStack,
  expressionWeights: Readonly<Record<string, number>>,
  width: number,
  height: number,
): Uint8ClampedArray {
  const safeW = Math.max(4, Math.floor(width));
  const safeH = Math.max(4, Math.floor(height));
  const out = new Uint8ClampedArray(safeW * safeH * 4);
  const opacities = evaluateEffectiveLayerOpacities(stack, expressionWeights);

  // 기본 피부 투명 바탕 초기화 (알파 255)
  for (let i = 0; i < safeW * safeH; i += 1) {
    out[i * 4] = 240;
    out[i * 4 + 1] = 216;
    out[i * 4 + 2] = 198;
    out[i * 4 + 3] = 255;
  }

  for (const layer of stack.layers) {
    const layerAlpha = opacities[layer.id] ?? 0;
    if (layerAlpha <= 1e-4) continue;
    const [sr, sg, sb] = layer.colorRgb;

    for (let y = 0; y < safeH; y += 1) {
      const v = (y + 0.5) / safeH;
      for (let x = 0; x < safeW; x += 1) {
        const u = (x + 0.5) / safeW;
        const mask = evaluateLayerMaskAtUv(layer, u, v, x, y);
        const alpha = clamp01(mask * layerAlpha);
        if (alpha <= 1e-4) continue;

        const off = (y * safeW + x) * 4;
        const br = out[off]! / 255;
        const bg = out[off + 1]! / 255;
        const bb = out[off + 2]! / 255;

        const nr = br + (blendChannel(br, sr, layer.blendMode) - br) * alpha;
        const ng = bg + (blendChannel(bg, sg, layer.blendMode) - bg) * alpha;
        const nb = bb + (blendChannel(bb, sb, layer.blendMode) - bb) * alpha;

        out[off] = Math.round(clamp01(nr) * 255);
        out[off + 1] = Math.round(clamp01(ng) * 255);
        out[off + 2] = Math.round(clamp01(nb) * 255);
      }
    }
  }

  return out;
}

/** ARKit 52개 채널 전체를 보정하고 VRM 1.0 표정 및 2D ArtMesh 파라미터로 동시 리매핑한다. */
export function remapArkit52ToVrmAndArtMesh(
  rawWeights: Arkit52WeightMap,
  calibrations: Partial<Record<Arkit52ChannelName, Partial<ArkitChannelCalibration>>> = {},
  previous?: Readonly<Record<Arkit52ChannelName, number>>,
  smoothAlpha = 0.65,
): VrmAndArtMeshExpressionFrame {
  const calibrated = {} as Record<Arkit52ChannelName, number>;
  const blend = previous ? clamp01(smoothAlpha) : 1;

  for (const name of ARKIT_52_BLENDSHAPE_NAMES) {
    const cal = calibrations[name];
    const deadzone = clamp01(cal?.deadzone ?? 0.02);
    const sensitivity = clamp(cal?.sensitivity ?? 1, 0.1, 4);
    const gamma = clamp(cal?.gamma ?? 1, 0.2, 4);
    const minOut = clamp01(cal?.minOut ?? 0);
    const maxOut = clamp(cal?.maxOut ?? 1, minOut, 1);

    const raw = clamp01(rawWeights[name] ?? 0);
    let mapped = 0;
    if (raw > deadzone) {
      const scaled = clamp01(((raw - deadzone) / Math.max(1e-5, 1 - deadzone)) * sensitivity);
      mapped = minOut + (maxOut - minOut) * Math.pow(scaled, gamma);
    }
    const prevVal = previous ? previous[name] : mapped;
    calibrated[name] = clamp01(prevVal + (mapped - prevVal) * blend);
  }

  const smile = 0.5 * (calibrated.mouthSmileLeft + calibrated.mouthSmileRight);
  const frown = 0.5 * (calibrated.mouthFrownLeft + calibrated.mouthFrownRight);
  const browDown = 0.5 * (calibrated.browDownLeft + calibrated.browDownRight);
  const browUp =
    0.5 * calibrated.browInnerUp +
    0.25 * (calibrated.browOuterUpLeft + calibrated.browOuterUpRight);
  const eyeWide = 0.5 * (calibrated.eyeWideLeft + calibrated.eyeWideRight);
  const sneer = 0.5 * (calibrated.noseSneerLeft + calibrated.noseSneerRight);
  const stretch = 0.5 * (calibrated.mouthStretchLeft + calibrated.mouthStretchRight);

  const effectiveOpen = clamp01(calibrated.jawOpen * (1 - calibrated.mouthClose * 0.85));
  const aa = clamp01(effectiveOpen * (1 - calibrated.mouthPucker * 0.6) * (1 - calibrated.mouthFunnel * 0.3));
  const oh = clamp01(calibrated.mouthFunnel * 0.75 + effectiveOpen * calibrated.mouthFunnel * 0.5);
  const ou = clamp01(calibrated.mouthPucker * 0.9 + calibrated.mouthFunnel * 0.25);
  const ih = clamp01(stretch * 0.7 + smile * 0.35 - calibrated.mouthPucker * 0.4);
  const ee = clamp01(smile * 0.65 + calibrated.mouthUpperUpLeft * 0.35 + calibrated.mouthUpperUpRight * 0.35);

  return {
    arkit52: calibrated,
    vrm10: {
      happy: clamp01(smile * 0.85 + 0.15 * (calibrated.cheekSquintLeft + calibrated.cheekSquintRight)),
      angry: clamp01(browDown * 0.7 + sneer * 0.45 + frown * 0.2),
      sad: clamp01(frown * 0.6 + calibrated.browInnerUp * 0.5),
      relaxed: clamp01(0.5 * (calibrated.eyeSquintLeft + calibrated.eyeSquintRight) * 0.6 + smile * 0.3),
      surprised: clamp01(eyeWide * 0.6 + browUp * 0.45 + effectiveOpen * 0.35),
      aa,
      ih,
      ou,
      ee,
      oh,
      blinkLeft: calibrated.eyeBlinkLeft,
      blinkRight: calibrated.eyeBlinkRight,
      lookUp: 0.5 * (calibrated.eyeLookUpLeft + calibrated.eyeLookUpRight),
      lookDown: 0.5 * (calibrated.eyeLookDownLeft + calibrated.eyeLookDownRight),
      lookLeft: 0.5 * (calibrated.eyeLookOutLeft + calibrated.eyeLookInRight),
      lookRight: 0.5 * (calibrated.eyeLookInLeft + calibrated.eyeLookOutRight),
    },
    artMesh2d: {
      mouthOpenY: effectiveOpen,
      mouthForm: clamp(smile - frown - calibrated.mouthPucker * 0.5, -1, 1),
      eyeOpenL: clamp01(1 - calibrated.eyeBlinkLeft + calibrated.eyeWideLeft * 0.25),
      eyeOpenR: clamp01(1 - calibrated.eyeBlinkRight + calibrated.eyeWideRight * 0.25),
      browY: clamp(browUp - browDown, -1, 1),
    },
  };
}

// 한글 초성 19자 / 중성 21자 / 종성 28자 테이블
const HANGUL_JUNG_VISEME: readonly VisemeKind[] = [
  "aa", "ee", "aa", "ee", "oh", "ee", "oh", "ee", // ㅏ ㅐ ㅑ ㅒ ㅓ ㅔ ㅕ ㅖ
  "oh", "aa", "ee", "ee", "oh", "ou", "oh", "ee", // ㅗ ㅘ ㅙ ㅚ ㅛ ㅜ ㅝ ㅞ
  "ou", "ou", "ih", "ih", "ih", // ㅟ ㅠ ㅡ ㅢ ㅣ
];
const BILABIAL_CHO_INDICES = new Set([6, 7, 8, 17]); // ㅁ, ㅂ, ㅃ, ㅍ
const BILABIAL_JONG_INDICES = new Set([16, 17, 26]); // ㅁ, ㅂ, ㅍ

/** 한국어·영어 대사 텍스트와 선택적 오디오 RMS 포락선으로 조음 결합(Co-articulation) 립싱크 트랙을 생성한다. */
export function generateKoreanEnglishLipSyncTrack(
  transcript: string,
  durationSec: number,
  options: {
    readonly audioRmsEnvelope?: readonly number[];
    readonly coArticulationLeadSec?: number;
    readonly coArticulationTrailSec?: number;
  } = {},
): CoArticulatedLipSyncTrack {
  const safeDur = Math.max(0.1, durationSec);
  const rawTokens: { readonly viseme: VisemeKind; readonly token: string; readonly weight: number }[] = [];

  for (let i = 0; i < transcript.length; i += 1) {
    const ch = transcript[i]!;
    const code = ch.charCodeAt(0);

    // 한글 완성형 음절(가..힣): 초성 양순음 -> 중성 모음 -> 종성 양순음 분해
    if (code >= 0xac00 && code <= 0xd7a3) {
      const sIndex = code - 0xac00;
      const cho = Math.floor(sIndex / 588);
      const jung = Math.floor((sIndex % 588) / 28);
      const jong = sIndex % 28;
      if (BILABIAL_CHO_INDICES.has(cho)) {
        rawTokens.push({ viseme: "mbp", token: ch, weight: 0.45 });
      }
      rawTokens.push({ viseme: HANGUL_JUNG_VISEME[jung] ?? "aa", token: ch, weight: 1.0 });
      if (BILABIAL_JONG_INDICES.has(jong)) {
        rawTokens.push({ viseme: "mbp", token: ch, weight: 0.45 });
      }
      continue;
    }

    const lower = ch.toLowerCase();
    if (lower === "a") rawTokens.push({ viseme: "aa", token: ch, weight: 1.0 });
    else if (lower === "e") rawTokens.push({ viseme: "ee", token: ch, weight: 1.0 });
    else if (lower === "i" || lower === "y") rawTokens.push({ viseme: "ih", token: ch, weight: 0.9 });
    else if (lower === "o") rawTokens.push({ viseme: "oh", token: ch, weight: 1.0 });
    else if (lower === "u" || lower === "w") rawTokens.push({ viseme: "ou", token: ch, weight: 1.0 });
    else if (lower === "m" || lower === "b" || lower === "p") {
      rawTokens.push({ viseme: "mbp", token: ch, weight: 0.5 });
    } else if (lower === "f" || lower === "v") {
      rawTokens.push({ viseme: "fv", token: ch, weight: 0.55 });
    } else if (lower === " " || lower === "," || lower === "." || lower === "!" || lower === "?") {
      rawTokens.push({ viseme: "sil", token: ch, weight: 0.5 });
    }
  }

  if (rawTokens.length === 0) {
    return {
      durationSec: safeDur,
      keyframes: [{ timeSec: 0, durationSec: safeDur, viseme: "sil", intensity: 0, token: "" }],
      coArticulationLeadSec: options.coArticulationLeadSec ?? 0.045,
      coArticulationTrailSec: options.coArticulationTrailSec ?? 0.055,
    };
  }

  let totalWeight = 0;
  for (const tk of rawTokens) totalWeight += tk.weight;

  const env = options.audioRmsEnvelope;
  const keyframes: TimedVisemeKeyframe[] = [];
  let cursor = 0;
  for (const tk of rawTokens) {
    const segDur = (tk.weight / totalWeight) * safeDur;
    let intensity = tk.viseme === "sil" ? 0 : 0.92;
    if (env && env.length > 0 && tk.viseme !== "sil") {
      const midRatio = clamp01((cursor + segDur * 0.5) / safeDur);
      const envIdx = Math.min(env.length - 1, Math.floor(midRatio * env.length));
      intensity = clamp01(0.25 + 0.75 * clamp01(env[envIdx]!));
    }
    keyframes.push({
      timeSec: cursor,
      durationSec: segDur,
      viseme: tk.viseme,
      intensity,
      token: tk.token,
    });
    cursor += segDur;
  }

  return {
    durationSec: safeDur,
    keyframes,
    coArticulationLeadSec: Math.max(0.01, options.coArticulationLeadSec ?? 0.045),
    coArticulationTrailSec: Math.max(0.01, options.coArticulationTrailSec ?? 0.055),
  };
}

/** 특정 시점 tSec에서 선행·잔류 조음(Co-articulation)이 적용된 비젬 가중치를 샘플링한다. */
export function sampleLipSyncTrackAtTime(
  track: CoArticulatedLipSyncTrack,
  timeSec: number,
): LipSyncVisemeWeights {
  let aa = 0;
  let ih = 0;
  let ou = 0;
  let ee = 0;
  let oh = 0;
  let closure = 0;

  const lead = track.coArticulationLeadSec;
  const trail = track.coArticulationTrailSec;

  for (let i = 0; i < track.keyframes.length; i += 1) {
    const kf = track.keyframes[i]!;
    if (kf.viseme === "sil") continue;
    const start = kf.timeSec;
    const end = kf.timeSec + kf.durationSec;

    let env = 0;
    if (timeSec >= start && timeSec <= end) {
      env = 1;
    } else if (timeSec >= start - lead && timeSec < start) {
      const t = (timeSec - (start - lead)) / lead;
      env = t * t * (3 - 2 * t);
    } else if (timeSec > end && timeSec <= end + trail) {
      const t = 1 - (timeSec - end) / trail;
      env = t * t * (3 - 2 * t);
    }
    if (env <= 0) continue;

    const w = env * kf.intensity;
    if (kf.viseme === "aa") aa = Math.max(aa, w);
    else if (kf.viseme === "ih") ih = Math.max(ih, w);
    else if (kf.viseme === "ou") ou = Math.max(ou, w);
    else if (kf.viseme === "ee") ee = Math.max(ee, w);
    else if (kf.viseme === "oh") oh = Math.max(oh, w);
    else if (kf.viseme === "mbp") closure = Math.max(closure, w);
    else if (kf.viseme === "fv") {
      closure = Math.max(closure, w * 0.65);
      ih = Math.max(ih, w * 0.3);
    }
  }

  // 양순음(M/B/P) 구간에서는 모음 입 벌림을 물리적으로 억제해 입술 닫힘을 선명히 유지
  const openDamp = 1 - closure * 0.92;
  aa *= openDamp;
  ih *= openDamp;
  ou *= openDamp;
  ee *= openDamp;
  oh *= openDamp;

  const mouthOpenY = clamp01(Math.max(aa, oh * 0.8, ee * 0.55, ih * 0.4, ou * 0.45));
  const mouthForm = clamp(ee * 0.7 + ih * 0.4 - ou * 0.8 - oh * 0.3, -1, 1);

  return {
    aa,
    ih,
    ou,
    ee,
    oh,
    mouthClose: closure,
    mouthOpenY,
    mouthForm,
  };
}
