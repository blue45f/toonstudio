/**
 * ToonStudio Wave 7 (V21) — 개폐율(0~100%) 연동 가변 슬릿 고드레이(Volumetric God-Ray Slit) ·
 * 바닥 그림자 드리프트 물리 엔진, 3연속 시퀀스 원클릭 어셈블러(15% -> 65% -> 100%) &
 * 상호작용 컷 누적 팀 ROI(기본 19.9h + 접점·슬릿 조명 자동화 추가 절감) 계산기.
 */

export type SlitSequenceBeatId =
  | "beat1-tension-15"
  | "beat2-breakthrough-65"
  | "beat3-climax-100";

export interface SlitSequenceBeatPreset {
  readonly id: SlitSequenceBeatId;
  readonly stepNumber: 1 | 2 | 3;
  readonly labelKo: string;
  readonly openRatioPct: 15 | 65 | 100;
  readonly assetSlug: string;
  readonly previewUrl: string;
  readonly recommendedKelvin: number;
  readonly narrativeRoleKo: string;
}

export const SLIT_SEQUENCE_3BEAT_PRESETS: readonly SlitSequenceBeatPreset[] = Object.freeze([
  {
    id: "beat1-tension-15",
    stepNumber: 1,
    labelKo: "1컷 · 도입 15% 칼날 슬릿",
    openRatioPct: 15,
    assetSlug: "webtoon-slit-godray-threshold-15pct-v21",
    previewUrl:
      "/studio-assets/blender-slit-godray-v21/thumbnails/webtoon-slit-godray-threshold-15pct-v21.png",
    recommendedKelvin: 3200,
    narrativeRoleKo: "눈가(1.54m) 칼날 하이라이트 · 1.32m 핸들 그립 긴장감",
  },
  {
    id: "beat2-breakthrough-65",
    stepNumber: 2,
    labelKo: "2컷 · 개방 65% 프리즘 돌파",
    openRatioPct: 65,
    assetSlug: "webtoon-slit-godray-breakthrough-65pct-v21",
    previewUrl:
      "/studio-assets/blender-slit-godray-v21/thumbnails/webtoon-slit-godray-breakthrough-65pct-v21.png",
    recommendedKelvin: 4800,
    narrativeRoleKo: "확산 볼류메트릭 광선 · follow-3d 무오차 속도선",
  },
  {
    id: "beat3-climax-100",
    stepNumber: 3,
    labelKo: "3컷 · 클라이맥스 100% 전면 역광",
    openRatioPct: 100,
    assetSlug: "webtoon-slit-godray-climax-100pct-v21",
    previewUrl:
      "/studio-assets/blender-slit-godray-v21/thumbnails/webtoon-slit-godray-climax-100pct-v21.png",
    recommendedKelvin: 8600,
    narrativeRoleKo: "1.68m 전면 할로 역광 · 2.40m 전신 실루엣 대비",
  },
]);

export interface SlitGodRayShadowDriftInput {
  readonly openRatioPct: number;
  readonly solarElevationDeg?: number;
  readonly weeklyTotalCuts?: number;
  readonly baseWeeklyHoursSaved?: number;
  readonly interactionCutRatioPct: number;
}

export interface SlitGodRayShadowDriftEvaluation {
  readonly activeBeatPreset: SlitSequenceBeatPreset;
  readonly openRatioPct: number;
  readonly slitApertureWidthM: number;
  readonly godRaySpreadAngleDeg: number;
  readonly eyeLineHighlightHeightM: 1.54;
  readonly floorShadowLengthM: number;
  readonly volumetricIntensityRatio: number;
  readonly silhouetteContrastRatio: number;
  readonly interactionCutRatioPct: number;
  readonly weeklyInteractionCuts: number;
  readonly additionalInteractionHoursSaved: number;
  readonly combinedWeeklyHoursSaved: number;
  readonly combinedWorkdaysSaved: number;
  readonly godRaySummaryKo: string;
  readonly stackedRoiSummaryKo: string;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function resolveNearestBeatPreset(openRatioPct: number): SlitSequenceBeatPreset {
  if (openRatioPct <= 38) return SLIT_SEQUENCE_3BEAT_PRESETS[0]!;
  if (openRatioPct <= 84) return SLIT_SEQUENCE_3BEAT_PRESETS[1]!;
  return SLIT_SEQUENCE_3BEAT_PRESETS[2]!;
}

export function evaluateSlitGodRayAndShadowDrift(
  input: SlitGodRayShadowDriftInput,
): SlitGodRayShadowDriftEvaluation {
  const openRatioPct = Math.max(0, Math.min(100, Math.round(input.openRatioPct)));
  const ratio = openRatioPct / 100;
  const elevationDeg = Math.max(18, Math.min(72, input.solarElevationDeg ?? 38));
  const elevationRad = (elevationDeg * Math.PI) / 180;

  const slitApertureWidthM = round2(0.16 + 1.52 * ratio);
  const godRaySpreadAngleDeg = round1(6.5 + 39.5 * ratio);
  // Shadow reach compresses smoothly as portal floods open and ambient bounce fills the threshold
  const rawCotReach = 2.4 / Math.tan(elevationRad);
  const floorShadowLengthM = round2(rawCotReach * (1.02 - 0.56 * ratio));
  const volumetricIntensityRatio = round2(1.55 + 0.65 * ratio);
  const silhouetteContrastRatio = round2(2.68 - 0.23 * ratio);

  const weeklyTotalCuts = Math.max(20, input.weeklyTotalCuts ?? 70);
  const baseWeeklyHoursSaved = Math.max(0, input.baseWeeklyHoursSaved ?? 19.9);
  const interactionCutRatioPct = Math.max(5, Math.min(80, Math.round(input.interactionCutRatioPct)));
  const weeklyInteractionCuts = Math.round((weeklyTotalCuts * interactionCutRatioPct) / 100);
  const additionalInteractionHoursSaved = round1((weeklyInteractionCuts * 14.5) / 60);
  const combinedWeeklyHoursSaved = round1(baseWeeklyHoursSaved + additionalInteractionHoursSaved);
  const combinedWorkdaysSaved = round2(combinedWeeklyHoursSaved / 8);

  const activeBeatPreset = resolveNearestBeatPreset(openRatioPct);

  return {
    activeBeatPreset,
    openRatioPct,
    slitApertureWidthM,
    godRaySpreadAngleDeg,
    eyeLineHighlightHeightM: 1.54,
    floorShadowLengthM,
    volumetricIntensityRatio,
    silhouetteContrastRatio,
    interactionCutRatioPct,
    weeklyInteractionCuts,
    additionalInteractionHoursSaved,
    combinedWeeklyHoursSaved,
    combinedWorkdaysSaved,
    godRaySummaryKo: `슬릿 폭 ${slitApertureWidthM.toFixed(2)}m · 확산각 ${godRaySpreadAngleDeg.toFixed(1)}° · 바닥 그림자 ${floorShadowLengthM.toFixed(2)}m · 실루엣 대비 ${silhouetteContrastRatio.toFixed(2)}:1`,
    stackedRoiSummaryKo: `상호작용 ${interactionCutRatioPct}%(${weeklyInteractionCuts}컷) 적용 시 +${additionalInteractionHoursSaved}h 추가 단축 → 주간 총 ${combinedWeeklyHoursSaved}h (${combinedWorkdaysSaved}인일) 확보`,
  };
}
