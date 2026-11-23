/**
 * 5종 종이 질감 물리 프로필(`PAPER_TOOTH_PROFILES`) 및 도자기 웨트 믹싱 웰(Kubelka-Munk 근사 안료 혼색).
 *
 * - 순수 물리 모델 모듈로 외부 자산 및 브라우저 영속 저장소에 의존하지 않는다.
 */

export type StudioPaperTextureId =
  | "smooth-bristol"
  | "cold-press-watercolor"
  | "rough-cotton"
  | "manga-kent"
  | "linen-canvas";

export interface StudioPaperToothProfile {
  readonly id: StudioPaperTextureId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  /** 표면 미세 요철의 공간/음향 공명 주파수 (Hz). */
  readonly grainFrequencyHz: number;
  /** 종이 산-골 깊이 비율 (0..1). */
  readonly toothDepth01: number;
  /** 펜촉/붓모 동마찰 계수 (0.1..1.2). */
  readonly frictionCoeff: number;
  /** 안료·수분 모세관 흡수율 (0..1). */
  readonly absorbency01: number;
  /** 수채/잉크 웨트 엣지 확산 계수 (0..1). */
  readonly capillarySpread01: number;
  /** Foley 물리 오디오 고역 밝기 연동 계수 (0..1). */
  readonly acousticBrightness01: number;
  /** 권장 미세 햅틱 임펄스 지속 시간 (ms). */
  readonly hapticMicroPulseMs: number;
}

export const PAPER_TOOTH_PROFILES: Readonly<Record<StudioPaperTextureId, StudioPaperToothProfile>> =
  Object.freeze({
    "smooth-bristol": Object.freeze({
      id: "smooth-bristol",
      labelKo: "스무스 브리스톨",
      descriptionKo: "잉크 펜선과 마커 발색에 최적화된 매끄러운 핫프레스 표면",
      grainFrequencyHz: 1180,
      toothDepth01: 0.14,
      frictionCoeff: 0.24,
      absorbency01: 0.34,
      capillarySpread01: 0.18,
      acousticBrightness01: 0.72,
      hapticMicroPulseMs: 6,
    }),
    "cold-press-watercolor": Object.freeze({
      id: "cold-press-watercolor",
      labelKo: "중목 수채화지",
      descriptionKo: "수채 번짐과 안료 그래뉼레이션이 살아나는 중목 수채 결",
      grainFrequencyHz: 780,
      toothDepth01: 0.54,
      frictionCoeff: 0.58,
      absorbency01: 0.76,
      capillarySpread01: 0.74,
      acousticBrightness01: 0.48,
      hapticMicroPulseMs: 11,
    }),
    "rough-cotton": Object.freeze({
      id: "rough-cotton",
      labelKo: "황목 코튼 300g",
      descriptionKo: "깊은 종이 골이 연필·목탄·갈필 질감을 극대화하는 황목 코튼지",
      grainFrequencyHz: 520,
      toothDepth01: 0.88,
      frictionCoeff: 0.86,
      absorbency01: 0.84,
      capillarySpread01: 0.82,
      acousticBrightness01: 0.36,
      hapticMicroPulseMs: 16,
    }),
    "manga-kent": Object.freeze({
      id: "manga-kent",
      labelKo: "만화 원고 켄트지",
      descriptionKo: "G펜 잉크 번짐을 억제하고 빠른 펜터치에 경쾌하게 반응하는 135kg 원고지",
      grainFrequencyHz: 1420,
      toothDepth01: 0.22,
      frictionCoeff: 0.32,
      absorbency01: 0.42,
      capillarySpread01: 0.14,
      acousticBrightness01: 0.84,
      hapticMicroPulseMs: 8,
    }),
    "linen-canvas": Object.freeze({
      id: "linen-canvas",
      labelKo: "리넨 유화 캔버스",
      descriptionKo: "날실·씨실 교차 결이 유화 임파스토와 나이프 붓질을 단단히 붙잡는 천 캔버스",
      grainFrequencyHz: 640,
      toothDepth01: 0.74,
      frictionCoeff: 0.76,
      absorbency01: 0.46,
      capillarySpread01: 0.28,
      acousticBrightness01: 0.44,
      hapticMicroPulseMs: 14,
    }),
  });

export const STUDIO_PAPER_TEXTURE_IDS: readonly StudioPaperTextureId[] = Object.freeze([
  "smooth-bristol",
  "cold-press-watercolor",
  "rough-cotton",
  "manga-kent",
  "linen-canvas",
]);

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function isStudioPaperTextureId(value: unknown): value is StudioPaperTextureId {
  return typeof value === "string" && Object.hasOwn(PAPER_TOOTH_PROFILES, value);
}

export function getPaperToothProfile(
  id: StudioPaperTextureId | null | undefined,
): StudioPaperToothProfile {
  return id && Object.hasOwn(PAPER_TOOTH_PROFILES, id)
    ? PAPER_TOOTH_PROFILES[id]
    : PAPER_TOOTH_PROFILES["manga-kent"];
}

export interface StudioPaperToothResistanceSample {
  readonly textureId: StudioPaperTextureId;
  readonly dragForce01: number;
  readonly valleySkipProbability01: number;
  readonly capillaryBloomRadiusPx: number;
}

export function samplePaperToothResistance(
  textureId: StudioPaperTextureId,
  pressure01: number,
  speed01: number,
): StudioPaperToothResistanceSample {
  const profile = getPaperToothProfile(textureId);
  const p = clamp01(pressure01);
  const v = clamp01(speed01);
  return {
    textureId: profile.id,
    dragForce01: clamp01(profile.frictionCoeff * (0.45 + 0.55 * p) * (1 - 0.18 * v)),
    valleySkipProbability01: clamp01(profile.toothDepth01 * (1 - 0.65 * p) * (0.6 + 0.4 * v)),
    capillaryBloomRadiusPx: Number(
      (profile.capillarySpread01 * profile.absorbency01 * (2.5 + 9.5 * (1 - v) * (0.4 + 0.6 * p))).toFixed(2),
    ),
  };
}

// ---------------------------------------------------------------------------
// 도자기 웨트 믹싱 웰 — Kubelka-Munk 근사 안료 혼색
// ---------------------------------------------------------------------------

/** 정규화 sRGB 채널(0..1)로 표현한 물리 안료 샘플. */
export interface StudioPigmentSample {
  readonly id: string;
  readonly labelKo: string;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly tintStrength01: number;
}

export interface StudioPigmentMixResult {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly oklchL: number;
  readonly oklchC: number;
  readonly oklchH: number;
  readonly cssOklch: string;
  readonly dilution01: number;
}

export const STUDIO_PORCELAIN_BASE_PIGMENTS: Readonly<Record<string, StudioPigmentSample>> =
  Object.freeze({
    ultramarine: Object.freeze({
      id: "ultramarine",
      labelKo: "울트라마린 블루",
      r: 0.08,
      g: 0.24,
      b: 0.78,
      tintStrength01: 0.92,
    }),
    cadmiumYellow: Object.freeze({
      id: "cadmiumYellow",
      labelKo: "카드뮴 옐로우",
      r: 0.98,
      g: 0.84,
      b: 0.09,
      tintStrength01: 0.84,
    }),
    alizarinCrimson: Object.freeze({
      id: "alizarinCrimson",
      labelKo: "알리자린 크림슨",
      r: 0.82,
      g: 0.12,
      b: 0.24,
      tintStrength01: 0.9,
    }),
    titaniumWhite: Object.freeze({
      id: "titaniumWhite",
      labelKo: "티타늄 화이트",
      r: 0.97,
      g: 0.965,
      b: 0.95,
      tintStrength01: 0.78,
    }),
    burntUmber: Object.freeze({
      id: "burntUmber",
      labelKo: "번트 엄버",
      r: 0.36,
      g: 0.22,
      b: 0.14,
      tintStrength01: 0.88,
    }),
    lampBlack: Object.freeze({
      id: "lampBlack",
      labelKo: "램프 블랙 먹",
      r: 0.08,
      g: 0.085,
      b: 0.1,
      tintStrength01: 0.96,
    }),
  });

function srgbToLinear(c: number): number {
  const v = clampRange(c, 0.004, 0.996);
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  const v = clamp01(c);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

function reflectanceToKs(reflectance: number): number {
  const r = clampRange(reflectance, 0.003, 0.997);
  return ((1 - r) * (1 - r)) / (2 * r);
}

function ksToReflectance(ks: number): number {
  const k = Math.max(0, ks);
  return clamp01(1 + k - Math.sqrt(k * k + 2 * k));
}

function linearRgbToOklch(r: number, g: number, b: number): { l: number; c: number; h: number } {
  const l = Math.cbrt(Math.max(0, 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b));
  const m = Math.cbrt(Math.max(0, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b));
  const s = Math.cbrt(Math.max(0, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b));
  const okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const rawHue = (Math.atan2(okB, okA) * 180) / Math.PI;
  return {
    l: Number(clamp01(okL).toFixed(4)),
    c: Number(Math.sqrt(okA * okA + okB * okB).toFixed(4)),
    h: Number((rawHue < 0 ? rawHue + 360 : rawHue).toFixed(1)),
  };
}

/**
 * Kubelka-Munk 감산 혼색 근사(K/S 가중 결합 + 청황 녹색 통과 대역 보정 + 수채 물 희석).
 */
export function mixPigmentsKubelkaMunk(
  pigmentA: Pick<StudioPigmentSample, "r" | "g" | "b" | "tintStrength01">,
  pigmentB: Pick<StudioPigmentSample, "r" | "g" | "b" | "tintStrength01">,
  ratioB01: number,
  dilution01 = 0,
): StudioPigmentMixResult {
  const t = clamp01(ratioB01);
  const wA = (1 - t) * clampRange(pigmentA.tintStrength01, 0.1, 1);
  const wB = t * clampRange(pigmentB.tintStrength01, 0.1, 1);
  const totalW = Math.max(0.0001, wA + wB);
  const normA = wA / totalW;
  const normB = wB / totalW;

  const linA = [srgbToLinear(pigmentA.r), srgbToLinear(pigmentA.g), srgbToLinear(pigmentA.b)] as const;
  const linB = [srgbToLinear(pigmentB.r), srgbToLinear(pigmentB.g), srgbToLinear(pigmentB.b)] as const;

  const ksR = normA * reflectanceToKs(linA[0]) + normB * reflectanceToKs(linB[0]);
  const ksG = normA * reflectanceToKs(linA[1]) + normB * reflectanceToKs(linB[1]);
  const ksB = normA * reflectanceToKs(linA[2]) + normB * reflectanceToKs(linB[2]);

  const blueYellowSynergy =
    Math.min(linA[2], linB[0] * linB[1]) + Math.min(linB[2], linA[0] * linA[1]);
  const greenBandBoost = Math.max(0, 1 - 0.55 * clamp01(blueYellowSynergy * 2.2) * (4 * normA * normB));

  let mixR = ksToReflectance(ksR);
  let mixG = ksToReflectance(ksG * greenBandBoost);
  let mixB = ksToReflectance(ksB);

  const water = clamp01(dilution01);
  if (water > 0) {
    mixR += (0.95 - mixR) * water * 0.78;
    mixG += (0.945 - mixG) * water * 0.78;
    mixB += (0.925 - mixB) * water * 0.78;
  }

  const oklch = linearRgbToOklch(mixR, mixG, mixB);
  return {
    r: Number(linearToSrgb(mixR).toFixed(4)),
    g: Number(linearToSrgb(mixG).toFixed(4)),
    b: Number(linearToSrgb(mixB).toFixed(4)),
    oklchL: oklch.l,
    oklchC: oklch.c,
    oklchH: oklch.h,
    cssOklch: `oklch(${oklch.l.toFixed(3)} ${oklch.c.toFixed(3)} ${oklch.h.toFixed(1)})`,
    dilution01: water,
  };
}

export interface StudioPorcelainWellSlot {
  readonly index: number;
  readonly pigment: StudioPigmentMixResult | null;
  readonly volume01: number;
  readonly water01: number;
  readonly labelKo: string;
}

export interface PorcelainWetMixingWell {
  readonly slotCount: number;
  depositPigment(
    slotIndex: number,
    pigment: StudioPigmentSample,
    amount01?: number,
    water01?: number,
  ): StudioPorcelainWellSlot;
  swirlSlots(sourceIndex: number, targetIndex: number, transferRatio01?: number): StudioPorcelainWellSlot;
  addWater(slotIndex: number, amount01: number): StudioPorcelainWellSlot;
  rinseSlot(slotIndex: number): StudioPorcelainWellSlot;
  rinseAll(): readonly StudioPorcelainWellSlot[];
  getSnapshot(): readonly StudioPorcelainWellSlot[];
}

function emptyWellSlot(index: number): StudioPorcelainWellSlot {
  return { index, pigment: null, volume01: 0, water01: 0, labelKo: `빈 우물 ${index + 1}` };
}

export function createPorcelainWetMixingWell(slotCount = 6): PorcelainWetMixingWell {
  const safeCount = Math.max(2, Math.min(12, Math.round(slotCount)));
  const slots: StudioPorcelainWellSlot[] = Array.from({ length: safeCount }, (_, i) => emptyWellSlot(i));
  const idxOf = (index: number): number => Math.max(0, Math.min(safeCount - 1, Math.trunc(index)));

  return {
    slotCount: safeCount,
    depositPigment(slotIndex, pigment, amount01 = 0.65, water01 = 0.15) {
      const idx = idxOf(slotIndex);
      const cur = slots[idx]!;
      const amt = clampRange(amount01, 0.05, 1);
      const nextWater = clamp01(cur.water01 * 0.5 + clamp01(water01) * 0.5);
      const nextPigment = cur.pigment
        ? mixPigmentsKubelkaMunk(
            { r: cur.pigment.r, g: cur.pigment.g, b: cur.pigment.b, tintStrength01: 0.88 },
            pigment,
            amt / Math.max(0.05, cur.volume01 + amt),
            nextWater,
          )
        : mixPigmentsKubelkaMunk(pigment, pigment, 0.5, nextWater);
      slots[idx] = {
        index: idx,
        pigment: nextPigment,
        volume01: Number(clamp01(cur.volume01 + amt * 0.6).toFixed(3)),
        water01: Number(nextWater.toFixed(3)),
        labelKo: cur.pigment ? `${cur.labelKo} + ${pigment.labelKo}` : pigment.labelKo,
      };
      return slots[idx]!;
    },
    swirlSlots(sourceIndex, targetIndex, transferRatio01 = 0.45) {
      const src = slots[idxOf(sourceIndex)]!;
      const dstIdx = idxOf(targetIndex);
      const dst = slots[dstIdx]!;
      if (!src.pigment) return dst;
      const ratio = clampRange(transferRatio01, 0.05, 0.95);
      const nextWater = clamp01(dst.water01 * (1 - ratio) + src.water01 * ratio);
      const nextPigment = dst.pigment
        ? mixPigmentsKubelkaMunk(
            { r: dst.pigment.r, g: dst.pigment.g, b: dst.pigment.b, tintStrength01: 0.88 },
            { r: src.pigment.r, g: src.pigment.g, b: src.pigment.b, tintStrength01: 0.88 },
            ratio,
            nextWater,
          )
        : src.pigment;
      slots[dstIdx] = {
        index: dstIdx,
        pigment: nextPigment,
        volume01: Number(clamp01(Math.max(dst.volume01, src.volume01 * ratio)).toFixed(3)),
        water01: Number(nextWater.toFixed(3)),
        labelKo: dst.pigment ? `${dst.labelKo} × ${src.labelKo}` : src.labelKo,
      };
      return slots[dstIdx]!;
    },
    addWater(slotIndex, amount01) {
      const idx = idxOf(slotIndex);
      const cur = slots[idx]!;
      const nextWater = clamp01(cur.water01 + clamp01(amount01));
      const nextPigment = cur.pigment
        ? mixPigmentsKubelkaMunk(
            { r: cur.pigment.r, g: cur.pigment.g, b: cur.pigment.b, tintStrength01: 0.85 },
            { r: cur.pigment.r, g: cur.pigment.g, b: cur.pigment.b, tintStrength01: 0.85 },
            0.5,
            nextWater,
          )
        : null;
      slots[idx] = { ...cur, pigment: nextPigment, water01: Number(nextWater.toFixed(3)) };
      return slots[idx]!;
    },
    rinseSlot(slotIndex) {
      const idx = idxOf(slotIndex);
      slots[idx] = emptyWellSlot(idx);
      return slots[idx]!;
    },
    rinseAll() {
      for (let i = 0; i < safeCount; i += 1) slots[i] = emptyWellSlot(i);
      return [...slots];
    },
    getSnapshot() {
      return [...slots];
    },
  };
}
