/**
 * 제로 토큰(0 AI Tokens · ₩0) 캐릭터/소품 연속성 Diff 디버거 및 클립보드 에셋 출처·저작권 가드.
 *
 * - `analyzeCharacterContinuityDrift`: 레퍼런스 시트와 신규 컷 영역에서 머리/눈/의상/소품의
 *   OKLCH 대표 색상 시그니처와 바운딩 종횡비를 로컬에서 추출·비교해 캔버스 오버레이 경고 핀과
 *   원클릭 OKLCH 색상 보정 델타를 생성한다(외부 AI 추론 0회).
 * - `inspectClipboardAssetProvenance`: `./clipboard-provenance-parser`에서 파싱 및 사전 차단 기능을 재공개한다.
 */

import {
  inspectClipboardAssetProvenance,
  type AssetBinaryFormat,
  type ClipboardAssetProvenanceReport,
  type ClipboardGuardPolicy,
  type ParsedAssetProvenanceMetadata,
  type ProvenanceGuardDecision,
  type ProvenanceRiskCode,
  type ProvenanceRiskFinding,
} from "./clipboard-provenance-parser";

export {
  inspectClipboardAssetProvenance,
  type AssetBinaryFormat,
  type ClipboardAssetProvenanceReport,
  type ClipboardGuardPolicy,
  type ParsedAssetProvenanceMetadata,
  type ProvenanceGuardDecision,
  type ProvenanceRiskCode,
  type ProvenanceRiskFinding,
};

export type ContinuityRegionRole = "hair" | "eyes" | "skin" | "outfit" | "prop" | "accessory";

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly hDeg: number;
}

export interface SrgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface RegionBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RgbaImageSurface {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array | Uint8ClampedArray;
}

export interface CharacterReferenceRegion {
  readonly regionId: string;
  readonly labelKo: string;
  readonly role: ContinuityRegionRole;
  readonly referenceBox?: RegionBoundingBox;
  readonly dominantOklch?: OklchColor;
  readonly expectedAspectRatio?: number;
  readonly maxDeltaEWarning?: number;
  readonly maxDeltaECritical?: number;
  readonly maxAspectDriftWarningPercent?: number;
  readonly maxAspectDriftCriticalPercent?: number;
}

export interface CharacterReferenceSheet {
  readonly characterId: string;
  readonly characterName: string;
  readonly surface?: RgbaImageSurface;
  readonly regions: readonly CharacterReferenceRegion[];
}

export interface CutInspectionRegionTarget {
  readonly regionId: string;
  readonly box: RegionBoundingBox;
}

export interface CutContinuityInspectionInput {
  readonly episodeId: string;
  readonly cutId: string;
  readonly cutSurface: RgbaImageSurface;
  readonly referenceSheet: CharacterReferenceSheet;
  readonly targets: readonly CutInspectionRegionTarget[];
  readonly ignoreInkLineart?: boolean;
}

export interface ExtractedRegionSignature {
  readonly dominantOklch: OklchColor;
  readonly meanOklch: OklchColor;
  readonly dominantSrgb: SrgbColor;
  readonly sampledPixelCount: number;
  readonly aspectRatio: number;
}

export interface OklchColorCorrectionDelta {
  readonly deltaL: number;
  readonly deltaC: number;
  readonly deltaHDeg: number;
  readonly referenceOklch: OklchColor;
  readonly observedOklch: OklchColor;
  readonly suggestedTargetSrgb: SrgbColor;
}

export type ContinuitySeverity = "ok" | "warning" | "critical";

export interface CanvasOverlayWarningPin {
  readonly pinId: string;
  readonly regionId: string;
  readonly regionLabelKo: string;
  readonly role: ContinuityRegionRole;
  readonly severity: Exclude<ContinuitySeverity, "ok">;
  readonly canvasX: number;
  readonly canvasY: number;
  readonly normalizedX: number;
  readonly normalizedY: number;
  readonly colorDeltaE: number;
  readonly aspectRatioDriftPercent: number;
  readonly messageKo: string;
  readonly correctionDelta: OklchColorCorrectionDelta;
}

export interface RegionContinuityDiff {
  readonly regionId: string;
  readonly regionLabelKo: string;
  readonly role: ContinuityRegionRole;
  readonly severity: ContinuitySeverity;
  readonly referenceOklch: OklchColor;
  readonly observedOklch: OklchColor;
  readonly colorDeltaE: number;
  readonly expectedAspectRatio: number;
  readonly observedAspectRatio: number;
  readonly aspectRatioDriftPercent: number;
  readonly correctionDelta: OklchColorCorrectionDelta;
}

export interface CharacterContinuityDiffReport {
  readonly characterId: string;
  readonly characterName: string;
  readonly episodeId: string;
  readonly cutId: string;
  readonly passed: boolean;
  readonly highestSeverity: ContinuitySeverity;
  readonly regionDiffs: readonly RegionContinuityDiff[];
  readonly warningPins: readonly CanvasOverlayWarningPin[];
  readonly aiTokensUsed: 0;
  readonly serverCostKrw: 0;
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function clampByte(value: number): number {
  return value <= 0 ? 0 : value >= 255 ? 255 : Math.round(value);
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function normalizeHueDeg(deg: number): number {
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod;
}

function shortestHueDeltaDeg(fromDeg: number, toDeg: number): number {
  let diff = ((toDeg - fromDeg + 540) % 360) - 180;
  if (diff < -180) diff += 360;
  return diff;
}

function srgbChannelToLinear(channel8: number): number {
  const c = clamp01(channel8 / 255);
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearChannelToSrgb(linear: number): number {
  const c = clamp01(linear);
  const srgb = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return clampByte(srgb * 255);
}

/** sRGB(0..255)를 Björn Ottosson OKLCH로 변환한다. */
export function srgbToOklch(r: number, g: number, b: number): OklchColor {
  const lr = srgbChannelToLinear(r);
  const lg = srgbChannelToLinear(g);
  const lb = srgbChannelToLinear(b);

  const lCube = Math.cbrt(Math.max(0, 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb));
  const mCube = Math.cbrt(Math.max(0, 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb));
  const sCube = Math.cbrt(Math.max(0, 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb));

  const L = 0.2104542553 * lCube + 0.793617785 * mCube - 0.0040720468 * sCube;
  const a = 1.9779984951 * lCube - 2.428592205 * mCube + 0.4505937099 * sCube;
  const bLab = 0.0259040371 * lCube + 0.7827717662 * mCube - 0.808675766 * sCube;
  const C = Math.sqrt(a * a + bLab * bLab);
  const hDeg = C < 1e-6 ? 0 : normalizeHueDeg((Math.atan2(bLab, a) * 180) / Math.PI);

  return { l: round4(L), c: round4(C), hDeg: round4(hDeg) };
}

/** OKLCH를 sRGB(0..255)로 역변환한다. */
export function oklchToSrgb(color: OklchColor): SrgbColor {
  const hRad = (normalizeHueDeg(color.hDeg) * Math.PI) / 180;
  const a = Math.max(0, color.c) * Math.cos(hRad);
  const bLab = Math.max(0, color.c) * Math.sin(hRad);
  const L = clamp01(color.l);

  const lCube = L + 0.3963377774 * a + 0.2158037573 * bLab;
  const mCube = L - 0.1055613458 * a - 0.0638541728 * bLab;
  const sCube = L - 0.0894841775 * a - 1.291485548 * bLab;
  const l = lCube * lCube * lCube;
  const m = mCube * mCube * mCube;
  const s = sCube * sCube * sCube;

  return {
    r: linearChannelToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearChannelToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearChannelToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

/** 두 OKLCH 색상 간의 지각적 OKLab 유클리드 거리(Delta E)를 계산한다. */
export function computeOklchDeltaE(a: OklchColor, b: OklchColor): number {
  const ha = (a.hDeg * Math.PI) / 180;
  const hb = (b.hDeg * Math.PI) / 180;
  const dL = a.l - b.l;
  const dA = a.c * Math.cos(ha) - b.c * Math.cos(hb);
  const dB = a.c * Math.sin(ha) - b.c * Math.sin(hb);
  return round4(Math.sqrt(dL * dL + dA * dA + dB * dB));
}

function isIgnoredInkOrHighlight(oklch: OklchColor): boolean {
  return (oklch.l < 0.14 && oklch.c < 0.03) || (oklch.l > 0.97 && oklch.c < 0.02);
}

/** RGBA 버퍼의 지정 영역에서 먹선·광택을 배제한 OKLCH 대표 색상과 종횡비를 추출한다. */
export function extractRegionColorSignature(
  surface: RgbaImageSurface,
  box: RegionBoundingBox,
  options?: { readonly ignoreInkLineart?: boolean },
): ExtractedRegionSignature {
  const ignoreInk = options?.ignoreInkLineart ?? true;
  const startX = Math.max(0, Math.floor(box.x));
  const startY = Math.max(0, Math.floor(box.y));
  const endX = Math.min(surface.width, Math.ceil(box.x + box.width));
  const endY = Math.min(surface.height, Math.ceil(box.y + box.height));

  const bucketMap = new Map<
    string,
    { count: number; sumL: number; sumA: number; sumB: number; weightSum: number }
  >();
  let totalL = 0;
  let totalA = 0;
  let totalB = 0;
  let sampledPixelCount = 0;

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const idx = (y * surface.width + x) * 4;
      if ((surface.rgba[idx + 3] ?? 0) < 128) continue;

      const oklch = srgbToOklch(surface.rgba[idx] ?? 0, surface.rgba[idx + 1] ?? 0, surface.rgba[idx + 2] ?? 0);
      if (ignoreInk && isIgnoredInkOrHighlight(oklch)) continue;

      const hRad = (oklch.hDeg * Math.PI) / 180;
      const labA = oklch.c * Math.cos(hRad);
      const labB = oklch.c * Math.sin(hRad);
      totalL += oklch.l;
      totalA += labA;
      totalB += labB;
      sampledPixelCount += 1;

      const key = `${Math.round(oklch.l * 16)}:${Math.round((labA + 0.4) * 20)}:${Math.round((labB + 0.4) * 20)}`;
      const weight = 1 + oklch.c * 2;
      const existing = bucketMap.get(key);
      if (existing) {
        existing.count += 1;
        existing.sumL += oklch.l;
        existing.sumA += labA;
        existing.sumB += labB;
        existing.weightSum += weight;
      } else {
        bucketMap.set(key, { count: 1, sumL: oklch.l, sumA: labA, sumB: labB, weightSum: weight });
      }
    }
  }

  const aspectRatio = round4(Math.max(1, box.width) / Math.max(1, box.height));
  if (sampledPixelCount === 0) {
    const fallback: OklchColor = { l: 0.5, c: 0, hDeg: 0 };
    return { dominantOklch: fallback, meanOklch: fallback, dominantSrgb: oklchToSrgb(fallback), sampledPixelCount: 0, aspectRatio };
  }

  let best = { count: 0, sumL: 0, sumA: 0, sumB: 0, weightSum: -1 };
  bucketMap.forEach((b) => {
    if (b.weightSum > best.weightSum) best = b;
  });

  const toOklch = (sumL: number, sumA: number, sumB: number, n: number): OklchColor => {
    const a = sumA / n;
    const b = sumB / n;
    const c = Math.sqrt(a * a + b * b);
    return { l: round4(sumL / n), c: round4(c), hDeg: c < 1e-6 ? 0 : round4(normalizeHueDeg((Math.atan2(b, a) * 180) / Math.PI)) };
  };

  const dominantOklch = toOklch(best.sumL, best.sumA, best.sumB, best.count);
  return {
    dominantOklch,
    meanOklch: toOklch(totalL, totalA, totalB, sampledPixelCount),
    dominantSrgb: oklchToSrgb(dominantOklch),
    sampledPixelCount,
    aspectRatio,
  };
}

/** 원클릭 OKLCH 보정 델타를 지정된 컷 영역 픽셀에 적용한 새 RGBA 버퍼를 반환한다. */
export function applyOklchCorrectionToRegion(
  surface: RgbaImageSurface,
  box: RegionBoundingBox,
  correction: OklchColorCorrectionDelta,
  options?: { readonly ignoreInkLineart?: boolean },
): Uint8ClampedArray {
  const ignoreInk = options?.ignoreInkLineart ?? true;
  const output = new Uint8ClampedArray(surface.rgba.length);
  output.set(surface.rgba);

  const startX = Math.max(0, Math.floor(box.x));
  const startY = Math.max(0, Math.floor(box.y));
  const endX = Math.min(surface.width, Math.ceil(box.x + box.width));
  const endY = Math.min(surface.height, Math.ceil(box.y + box.height));

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const idx = (y * surface.width + x) * 4;
      if ((output[idx + 3] ?? 0) < 128) continue;

      const cur = srgbToOklch(output[idx], output[idx + 1], output[idx + 2]);
      if (ignoreInk && isIgnoredInkOrHighlight(cur)) continue;

      const rgb = oklchToSrgb({
        l: clamp01(cur.l + correction.deltaL),
        c: Math.max(0, cur.c + correction.deltaC),
        hDeg: normalizeHueDeg(cur.hDeg + correction.deltaHDeg),
      });
      output[idx] = rgb.r;
      output[idx + 1] = rgb.g;
      output[idx + 2] = rgb.b;
    }
  }
  return output;
}

/** 레퍼런스 시트와 신규 컷 영역을 로컬 비교해 색상·비율 이탈과 캔버스 경고 핀을 검출한다. */
export function analyzeCharacterContinuityDrift(
  input: CutContinuityInspectionInput,
): CharacterContinuityDiffReport {
  const regionMap = new Map<string, CharacterReferenceRegion>();
  for (let i = 0; i < input.referenceSheet.regions.length; i += 1) {
    regionMap.set(input.referenceSheet.regions[i].regionId, input.referenceSheet.regions[i]);
  }

  const regionDiffs: RegionContinuityDiff[] = [];
  const warningPins: CanvasOverlayWarningPin[] = [];
  let highestSeverity: ContinuitySeverity = "ok";

  for (let i = 0; i < input.targets.length; i += 1) {
    const target = input.targets[i];
    const refRegion = regionMap.get(target.regionId);
    if (!refRegion) continue;

    let refOklch = refRegion.dominantOklch;
    let expectedAspect = refRegion.expectedAspectRatio;
    if ((!refOklch || expectedAspect === undefined) && refRegion.referenceBox && input.referenceSheet.surface) {
      const refSig = extractRegionColorSignature(input.referenceSheet.surface, refRegion.referenceBox, {
        ignoreInkLineart: input.ignoreInkLineart,
      });
      if (!refOklch) refOklch = refSig.dominantOklch;
      if (expectedAspect === undefined) expectedAspect = refSig.aspectRatio;
    }

    const resolvedRefOklch: OklchColor = refOklch ?? { l: 0.5, c: 0, hDeg: 0 };
    const obsSig = extractRegionColorSignature(input.cutSurface, target.box, {
      ignoreInkLineart: input.ignoreInkLineart,
    });
    const resolvedExpectedAspect = expectedAspect ?? obsSig.aspectRatio;
    const colorDeltaE = computeOklchDeltaE(resolvedRefOklch, obsSig.dominantOklch);
    const aspectRatioDriftPercent = round4(
      (Math.abs(obsSig.aspectRatio - resolvedExpectedAspect) / Math.max(0.01, resolvedExpectedAspect)) * 100,
    );

    const warnDeltaE = refRegion.maxDeltaEWarning ?? 0.055;
    const critDeltaE = refRegion.maxDeltaECritical ?? 0.11;
    const warnAspect = refRegion.maxAspectDriftWarningPercent ?? 12;
    const critAspect = refRegion.maxAspectDriftCriticalPercent ?? 25;

    let severity: ContinuitySeverity = "ok";
    if (colorDeltaE >= critDeltaE || aspectRatioDriftPercent >= critAspect) {
      severity = "critical";
      highestSeverity = "critical";
    } else if (colorDeltaE >= warnDeltaE || aspectRatioDriftPercent >= warnAspect) {
      severity = "warning";
      if (highestSeverity === "ok") highestSeverity = "warning";
    }

    const correctionDelta: OklchColorCorrectionDelta = {
      deltaL: round4(resolvedRefOklch.l - obsSig.dominantOklch.l),
      deltaC: round4(resolvedRefOklch.c - obsSig.dominantOklch.c),
      deltaHDeg: round4(shortestHueDeltaDeg(obsSig.dominantOklch.hDeg, resolvedRefOklch.hDeg)),
      referenceOklch: resolvedRefOklch,
      observedOklch: obsSig.dominantOklch,
      suggestedTargetSrgb: oklchToSrgb(resolvedRefOklch),
    };

    regionDiffs.push({
      regionId: refRegion.regionId,
      regionLabelKo: refRegion.labelKo,
      role: refRegion.role,
      severity,
      referenceOklch: resolvedRefOklch,
      observedOklch: obsSig.dominantOklch,
      colorDeltaE,
      expectedAspectRatio: round4(resolvedExpectedAspect),
      observedAspectRatio: obsSig.aspectRatio,
      aspectRatioDriftPercent,
      correctionDelta,
    });

    if (severity !== "ok") {
      const reasons: string[] = [];
      if (colorDeltaE >= warnDeltaE) reasons.push(`OKLCH 색상 이탈 ΔE=${colorDeltaE}`);
      if (aspectRatioDriftPercent >= warnAspect) reasons.push(`종횡비 이탈 ${aspectRatioDriftPercent}%`);
      const canvasX = round4(target.box.x + target.box.width / 2);
      const canvasY = round4(target.box.y + target.box.height / 2);
      warningPins.push({
        pinId: `pin:${input.cutId}:${refRegion.regionId}`,
        regionId: refRegion.regionId,
        regionLabelKo: refRegion.labelKo,
        role: refRegion.role,
        severity,
        canvasX,
        canvasY,
        normalizedX: round4(canvasX / Math.max(1, input.cutSurface.width)),
        normalizedY: round4(canvasY / Math.max(1, input.cutSurface.height)),
        colorDeltaE,
        aspectRatioDriftPercent,
        messageKo: `${input.referenceSheet.characterName} '${refRegion.labelKo}' 영역에서 ${reasons.join(", ")}이 감지되었습니다.`,
        correctionDelta,
      });
    }
  }

  return {
    characterId: input.referenceSheet.characterId,
    characterName: input.referenceSheet.characterName,
    episodeId: input.episodeId,
    cutId: input.cutId,
    passed: highestSeverity === "ok",
    highestSeverity,
    regionDiffs,
    warningPins,
    aiTokensUsed: 0,
    serverCostKrw: 0,
  };
}
