/**
 * Wave-35: 회차 캐릭터 설정표(Model Sheet) 일관성 및 출고 전 원고 품질 가드
 * (`episode-model-sheet-consistency-guard`).
 *
 * - Björn Ottosson 지각 균일 Oklab 색차(`deltaEOklab`)로 캐릭터 머리·피부·눈동자·의상 색상의
 *   설정표 이탈을 검출하되, 컷 단위로 선언된 정당한 조명 틴트는 역보정 후 비교한다.
 * - `isMirroredCut: true` 좌우 반전 컷 또는 수동 작화 실수로 뒤집힌 비대칭 특징
 *   (`scar` 흉터, `mole` 점, `eyepatch` 안대, `parted-hair` 가르마, `dominant-hand-prop` 주손 소품)을 잡아낸다.
 * - 하늘·발광 배경의 양자화 계단 현상(`detectGradientBanding`)과 말풍선 명도 대비(`wcagContrastRatio`)를 일괄 감사한다.
 */

export const DEFAULT_MAX_PALETTE_DELTA_E_OKLAB = 0.055 as const;
export const DEFAULT_MIN_BODY_TEXT_CONTRAST = 4.5 as const;
export const DEFAULT_MIN_LARGE_TEXT_CONTRAST = 3.0 as const;
export const DEFAULT_BANDING_SEVERITY_THRESHOLD = 0.35 as const;

export type AsymmetricTraitKind =
  | "scar"
  | "mole"
  | "eyepatch"
  | "parted-hair"
  | "dominant-hand-prop";

export type TraitAnatomicalSide = "left" | "right";
export type TraitScreenSide = "screen-left" | "screen-right";
export type CutCameraFacing = "front" | "back";

/** 8비트 sRGB 색상 (`0..255` 채널) */
export interface SrgbColor8 {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface OklabColor {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

export interface CanonicalAsymmetricTrait {
  readonly kind: AsymmetricTraitKind;
  /** 캐릭터 신체 기준 해부학적 방향 (`left`: 캐릭터의 왼쪽, `right`: 캐릭터의 오른쪽) */
  readonly canonicalSide: TraitAnatomicalSide;
  readonly labelKo: string;
}

export interface CharacterModelSheet {
  readonly characterId: string;
  readonly nameKo: string;
  readonly canonicalPalette: Readonly<Record<string, SrgbColor8>>;
  readonly maxPaletteDeltaEOklab?: number;
  readonly asymmetricTraits: readonly CanonicalAsymmetricTrait[];
}

export interface CutCharacterAppearance {
  readonly characterId: string;
  readonly cameraFacing?: CutCameraFacing;
  readonly sampledPalette?: Readonly<Record<string, SrgbColor8>>;
  /** 반전 컷(`isMirroredCut: true`)에서 비대칭 부위를 원래 방향으로 재수정 완료했는지 여부 */
  readonly mirroredTraitsCompensated?: boolean;
  readonly observedScreenTraits?: Readonly<Partial<Record<AsymmetricTraitKind, TraitScreenSide>>>;
}

export interface GradientRegionAuditInput {
  readonly regionId: string;
  readonly labelKo: string;
  readonly width: number;
  readonly height: number;
  readonly luma8Bit: Uint8Array | readonly number[];
}

export interface TextBalloonContrastInput {
  readonly balloonId: string;
  readonly textPreviewKo: string;
  readonly foreground: SrgbColor8;
  readonly background: SrgbColor8;
  readonly fontSizePx: number;
  readonly isBold?: boolean;
}

export interface CutLightingTintSpec {
  readonly whiteReference: SrgbColor8;
}

export interface EpisodeCutAuditInput {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly isMirroredCut?: boolean;
  readonly sceneLighting?: CutLightingTintSpec;
  readonly characters?: readonly CutCharacterAppearance[];
  readonly gradientRegions?: readonly GradientRegionAuditInput[];
  readonly textBalloons?: readonly TextBalloonContrastInput[];
}

export interface EpisodeAuditRequest {
  readonly episodeId: string;
  readonly modelSheets: readonly CharacterModelSheet[];
  readonly cuts: readonly EpisodeCutAuditInput[];
  readonly maxPaletteDeltaEOklab?: number;
  readonly minBodyTextContrast?: number;
  readonly minLargeTextContrast?: number;
  readonly bandingSeverityThreshold?: number;
}

export interface PaletteDriftDefect {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly slotKey: string;
  readonly deltaEOklab: number;
  readonly maxAllowedDeltaE: number;
  readonly fixNoteKo: string;
}

export type AsymmetryDefectCause = "uncompensated-mirrored-cut" | "inverted-screen-side";

export interface AsymmetryFlipDefect {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly traitKind: AsymmetricTraitKind;
  readonly traitLabelKo: string;
  readonly canonicalSide: TraitAnatomicalSide;
  readonly expectedScreenSide: TraitScreenSide;
  readonly observedScreenSide: TraitScreenSide;
  readonly cause: AsymmetryDefectCause;
  readonly fixNoteKo: string;
}

export interface GradientBandingAnalysis {
  readonly bandingSeverityScore: number;
  readonly staircaseStepCount: number;
  readonly meanPlateauLengthPx: number;
  readonly hasBandingDefect: boolean;
}

export interface GradientBandingDefect {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly regionId: string;
  readonly labelKo: string;
  readonly bandingSeverityScore: number;
  readonly staircaseStepCount: number;
  readonly meanPlateauLengthPx: number;
  readonly fixNoteKo: string;
}

export interface TextContrastDefect {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly balloonId: string;
  readonly textPreviewKo: string;
  readonly contrastRatio: number;
  readonly requiredMinContrast: number;
  readonly fixNoteKo: string;
}

export interface EpisodeQualityAuditReport {
  readonly episodeId: string;
  readonly readyForPublish: boolean;
  readonly qualityScore: number;
  readonly paletteDriftDefects: readonly PaletteDriftDefect[];
  readonly asymmetryFlipDefects: readonly AsymmetryFlipDefect[];
  readonly gradientBandingDefects: readonly GradientBandingDefect[];
  readonly textContrastDefects: readonly TextContrastDefect[];
  readonly summaryKo: string;
}

const TRAIT_KIND_DEFAULT_KO: Readonly<Record<AsymmetricTraitKind, string>> = {
  scar: "흉터",
  mole: "점",
  eyepatch: "안대",
  "parted-hair": "가르마",
  "dominant-hand-prop": "주손 소품",
};

function clampByte(channel: number): number {
  if (!Number.isFinite(channel)) return 0;
  return Math.min(255, Math.max(0, channel));
}

function srgbChannelToLinear(byteValue: number): number {
  const n = clampByte(byteValue) / 255;
  return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

/** 8비트 sRGB 색상을 Björn Ottosson 지각 균일 Oklab(`L, a, b`) 좌표로 변환한다. */
export function srgbToOklab(color: SrgbColor8): OklabColor {
  const rLin = srgbChannelToLinear(color.r);
  const gLin = srgbChannelToLinear(color.g);
  const bLin = srgbChannelToLinear(color.b);

  const lRoot = Math.cbrt(Math.max(0, 0.4122214708 * rLin + 0.5363325363 * gLin + 0.0514459929 * bLin));
  const mRoot = Math.cbrt(Math.max(0, 0.2119034982 * rLin + 0.6806995451 * gLin + 0.1073969566 * bLin));
  const sRoot = Math.cbrt(Math.max(0, 0.0883024619 * rLin + 0.2817188376 * gLin + 0.6299787005 * bLin));

  return {
    L: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
}

/** 두 8비트 sRGB 색상 사이의 유클리드 Oklab 지각 색차를 계산한다. */
export function deltaEOklab(first: SrgbColor8, second: SrgbColor8): number {
  const lab1 = srgbToOklab(first);
  const lab2 = srgbToOklab(second);
  return Math.hypot(lab1.L - lab2.L, lab1.a - lab2.a, lab1.b - lab2.b);
}

/** WCAG 2.1 상대 휘도 공식으로 전경·배경 색상의 명도 대비비(`1..21`)를 계산한다. */
export function wcagContrastRatio(foreground: SrgbColor8, background: SrgbColor8): number {
  const lumFg = 0.2126 * srgbChannelToLinear(foreground.r) + 0.7152 * srgbChannelToLinear(foreground.g) + 0.0722 * srgbChannelToLinear(foreground.b);
  const lumBg = 0.2126 * srgbChannelToLinear(background.r) + 0.7152 * srgbChannelToLinear(background.g) + 0.0722 * srgbChannelToLinear(background.b);
  return (Math.max(lumFg, lumBg) + 0.05) / (Math.min(lumFg, lumBg) + 0.05);
}

function undoSceneLightingTint(sampled: SrgbColor8, lighting?: CutLightingTintSpec): SrgbColor8 {
  if (!lighting) return sampled;
  return {
    r: clampByte((clampByte(sampled.r) * 255) / Math.max(24, clampByte(lighting.whiteReference.r))),
    g: clampByte((clampByte(sampled.g) * 255) / Math.max(24, clampByte(lighting.whiteReference.g))),
    b: clampByte((clampByte(sampled.b) * 255) / Math.max(24, clampByte(lighting.whiteReference.b))),
  };
}

function resolveExpectedScreenSide(canonicalSide: TraitAnatomicalSide, cameraFacing: CutCameraFacing): TraitScreenSide {
  if (cameraFacing === "front") return canonicalSide === "left" ? "screen-right" : "screen-left";
  return canonicalSide === "left" ? "screen-left" : "screen-right";
}

function analyzeScanlineStaircase(line: readonly number[]): { steps: number; plateauSum: number } {
  if (line.length < 12) return { steps: 0, plateauSum: 0 };
  const runs: { value: number; length: number }[] = [];
  let currentVal = Math.round(clampByte(line[0] ?? 0));
  let currentLen = 1;

  for (let i = 1; i < line.length; i += 1) {
    const val = Math.round(clampByte(line[i] ?? 0));
    if (val === currentVal) currentLen += 1;
    else {
      runs.push({ value: currentVal, length: currentLen });
      currentVal = val;
      currentLen = 1;
    }
  }
  runs.push({ value: currentVal, length: currentLen });

  let steps = 0;
  let plateauSum = 0;
  for (let r = 0; r < runs.length - 1; r += 1) {
    const currRun = runs[r];
    const nextRun = runs[r + 1];
    if (!currRun || !nextRun) continue;
    const jump = Math.abs(nextRun.value - currRun.value);
    if (currRun.length >= 5 && nextRun.length >= 5 && jump >= 1 && jump <= 8) {
      steps += 1;
      plateauSum += currRun.length;
    }
  }
  return { steps, plateauSum };
}

/** 배경·하늘 그라데이션 영역의 8비트 양자화 계단 현상(밴딩) 심각도를 분석한다. */
export function detectGradientBanding(
  region: GradientRegionAuditInput,
  severityThreshold: number = DEFAULT_BANDING_SEVERITY_THRESHOLD,
): GradientBandingAnalysis {
  const w = Math.max(1, Math.floor(region.width));
  const h = Math.max(1, Math.floor(region.height));
  const data = region.luma8Bit;

  let bestSteps = 0;
  let bestMeanPlateau = 0;
  let bestScore = 0;

  const evaluateAxis = (outerCount: number, innerLength: number, readAt: (o: number, i: number) => number): void => {
    if (innerLength < 12 || outerCount < 1) return;
    let axisStepSum = 0;
    let axisPlateauSum = 0;
    let linesWithBanding = 0;
    let sampledLines = 0;
    const stride = Math.max(1, Math.floor(outerCount / 16));

    for (let o = 0; o < outerCount; o += stride) {
      sampledLines += 1;
      const line: number[] = [];
      for (let i = 0; i < innerLength; i += 1) line.push(readAt(o, i));
      const res = analyzeScanlineStaircase(line);
      if (res.steps >= 3) {
        linesWithBanding += 1;
        axisStepSum += res.steps;
        axisPlateauSum += res.plateauSum / res.steps;
      }
    }

    if (sampledLines > 0 && linesWithBanding > 0) {
      const meanSteps = axisStepSum / linesWithBanding;
      const meanPlateau = axisPlateauSum / linesWithBanding;
      const score = Math.min(1, (linesWithBanding / sampledLines) * Math.min(1, meanSteps / 4) * Math.min(1, meanPlateau / 8));
      if (score > bestScore) {
        bestScore = score;
        bestSteps = Math.round(meanSteps);
        bestMeanPlateau = meanPlateau;
      }
    }
  };

  evaluateAxis(w, h, (x, y) => data[y * w + x] ?? 0);
  evaluateAxis(h, w, (y, x) => data[y * w + x] ?? 0);

  return {
    bandingSeverityScore: bestScore,
    staircaseStepCount: bestSteps,
    meanPlateauLengthPx: bestMeanPlateau,
    hasBandingDefect: bestScore >= severityThreshold,
  };
}

/** 에피소드 전체 컷의 설정표 색상 일관성, 좌우 반전 비대칭 오류, 밴딩, 대사 명도 대비를 일괄 감사한다. */
export function auditEpisodeQualityAndConsistency(request: EpisodeAuditRequest): EpisodeQualityAuditReport {
  const defaultMaxDeltaE = request.maxPaletteDeltaEOklab ?? DEFAULT_MAX_PALETTE_DELTA_E_OKLAB;
  const minBodyContrast = request.minBodyTextContrast ?? DEFAULT_MIN_BODY_TEXT_CONTRAST;
  const minLargeContrast = request.minLargeTextContrast ?? DEFAULT_MIN_LARGE_TEXT_CONTRAST;
  const bandingThreshold = request.bandingSeverityThreshold ?? DEFAULT_BANDING_SEVERITY_THRESHOLD;

  const sheetById = new Map<string, CharacterModelSheet>();
  for (const sheet of request.modelSheets) sheetById.set(sheet.characterId, sheet);

  const paletteDriftDefects: PaletteDriftDefect[] = [];
  const asymmetryFlipDefects: AsymmetryFlipDefect[] = [];
  const gradientBandingDefects: GradientBandingDefect[] = [];
  const textContrastDefects: TextContrastDefect[] = [];

  for (const cut of request.cuts) {
    const isMirrored = cut.isMirroredCut ?? false;

    for (const appearance of cut.characters ?? []) {
      const sheet = sheetById.get(appearance.characterId);
      if (!sheet) continue;

      const maxDeltaE = sheet.maxPaletteDeltaEOklab ?? defaultMaxDeltaE;
      if (appearance.sampledPalette) {
        for (const [slotKey, sampledRaw] of Object.entries(appearance.sampledPalette)) {
          const canonicalColor = sheet.canonicalPalette[slotKey];
          if (!canonicalColor) continue;
          const dist = deltaEOklab(undoSceneLightingTint(sampledRaw, cut.sceneLighting), canonicalColor);
          if (dist > maxDeltaE) {
            paletteDriftDefects.push({
              cutId: cut.cutId,
              cutNumber: cut.cutNumber,
              characterId: sheet.characterId,
              characterNameKo: sheet.nameKo,
              slotKey,
              deltaEOklab: dist,
              maxAllowedDeltaE: maxDeltaE,
              fixNoteKo: `${cut.cutNumber}컷 '${sheet.nameKo}'의 '${slotKey}' 색상이 설정표 대비 ΔE_Oklab ${dist.toFixed(3)} 이탈했습니다(허용 ${maxDeltaE.toFixed(3)}).`,
            });
          }
        }
      }

      const facing: CutCameraFacing = appearance.cameraFacing ?? "front";
      const observedMap = appearance.observedScreenTraits ?? {};

      for (const trait of sheet.asymmetricTraits) {
        const expectedSide = resolveExpectedScreenSide(trait.canonicalSide, facing);
        const explicitObserved = observedMap[trait.kind];
        const label = trait.labelKo || TRAIT_KIND_DEFAULT_KO[trait.kind];

        if (explicitObserved !== undefined && explicitObserved !== expectedSide) {
          asymmetryFlipDefects.push({
            cutId: cut.cutId,
            cutNumber: cut.cutNumber,
            characterId: sheet.characterId,
            characterNameKo: sheet.nameKo,
            traitKind: trait.kind,
            traitLabelKo: label,
            canonicalSide: trait.canonicalSide,
            expectedScreenSide: expectedSide,
            observedScreenSide: explicitObserved,
            cause: isMirrored ? "uncompensated-mirrored-cut" : "inverted-screen-side",
            fixNoteKo: `${cut.cutNumber}컷 '${sheet.nameKo}'의 '${label}' 방향이 반전되었습니다. ${expectedSide === "screen-left" ? "화면 왼쪽" : "화면 오른쪽"}으로 수정해 주세요.`,
          });
        } else if (explicitObserved === undefined && isMirrored && appearance.mirroredTraitsCompensated !== true) {
          asymmetryFlipDefects.push({
            cutId: cut.cutId,
            cutNumber: cut.cutNumber,
            characterId: sheet.characterId,
            characterNameKo: sheet.nameKo,
            traitKind: trait.kind,
            traitLabelKo: label,
            canonicalSide: trait.canonicalSide,
            expectedScreenSide: expectedSide,
            observedScreenSide: expectedSide === "screen-left" ? "screen-right" : "screen-left",
            cause: "uncompensated-mirrored-cut",
            fixNoteKo: `${cut.cutNumber}컷 좌우 반전 후 '${sheet.nameKo}'의 '${label}' 부분 복구가 누락되었습니다.`,
          });
        }
      }
    }

    for (const region of cut.gradientRegions ?? []) {
      const analysis = detectGradientBanding(region, bandingThreshold);
      if (analysis.hasBandingDefect) {
        gradientBandingDefects.push({
          cutId: cut.cutId,
          cutNumber: cut.cutNumber,
          regionId: region.regionId,
          labelKo: region.labelKo,
          bandingSeverityScore: analysis.bandingSeverityScore,
          staircaseStepCount: analysis.staircaseStepCount,
          meanPlateauLengthPx: analysis.meanPlateauLengthPx,
          fixNoteKo: `${cut.cutNumber}컷 '${region.labelKo}'에서 ${analysis.staircaseStepCount}단 계단 현상이 감지되었습니다. 디더링 분산을 적용해 주세요.`,
        });
      }
    }

    for (const balloon of cut.textBalloons ?? []) {
      const isLarge = balloon.fontSizePx >= 24 || ((balloon.isBold ?? false) && balloon.fontSizePx >= 19);
      const requiredMin = isLarge ? minLargeContrast : minBodyContrast;
      const ratio = wcagContrastRatio(balloon.foreground, balloon.background);
      if (ratio + 1e-9 < requiredMin) {
        textContrastDefects.push({
          cutId: cut.cutId,
          cutNumber: cut.cutNumber,
          balloonId: balloon.balloonId,
          textPreviewKo: balloon.textPreviewKo,
          contrastRatio: ratio,
          requiredMinContrast: requiredMin,
          fixNoteKo: `${cut.cutNumber}컷 말풍선('${balloon.textPreviewKo}') 명도 대비가 ${ratio.toFixed(2)}:1로 최소 기준(${requiredMin.toFixed(1)}:1) 미달입니다.`,
        });
      }
    }
  }

  const totalDefects = paletteDriftDefects.length + asymmetryFlipDefects.length + gradientBandingDefects.length + textContrastDefects.length;
  const penalty = paletteDriftDefects.length * 14 + asymmetryFlipDefects.length * 18 + gradientBandingDefects.length * 12 + textContrastDefects.length * 16;
  const readyForPublish = totalDefects === 0;
  const summaryKo = readyForPublish
    ? `출고 준비 완료: 총 ${request.cuts.length}컷에서 캐릭터 색상·비대칭 설정·배경 그라데이션·대사 가독성 결함이 발견되지 않았습니다.`
    : `출고 전 수정 필요(${totalDefects}건): 색상 이탈 ${paletteDriftDefects.length}건, 좌우 반전 비대칭 ${asymmetryFlipDefects.length}건, 그라데이션 밴딩 ${gradientBandingDefects.length}건, 대사 대비 미달 ${textContrastDefects.length}건.`;

  return {
    episodeId: request.episodeId,
    readyForPublish,
    qualityScore: Math.max(0, Math.min(100, 100 - penalty)),
    paletteDriftDefects,
    asymmetryFlipDefects,
    gradientBandingDefects,
    textContrastDefects,
    summaryKo,
  };
}
