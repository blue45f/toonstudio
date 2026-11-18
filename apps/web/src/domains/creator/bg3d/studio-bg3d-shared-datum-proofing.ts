/**
 * ToonStudio Wave 5 — 공통 건축 기준선(Shared Architectural Datum: 2.40m/1.10m/0.74m/0.18m)
 * 5대 장르 호환성 평가기, 광학 암실 컬러 검수 모드(ΔE 0.0) 및 원고 반려율·컷밀도 ROI 시뮬레이터.
 */

export type CrossGenreDatumGenreId = "rofan" | "action" | "modern" | "murim" | "scifi";

export interface SharedArchitecturalDatumSpec {
  readonly bayFootprintWidthM: number;
  readonly portalClearanceM: number;
  readonly safetyRailingHeightM: number;
  readonly deskConsoleHeightM: number;
  readonly stairRiserHeightM: number;
}

export const SHARED_ARCHITECTURAL_DATUM_SPEC: SharedArchitecturalDatumSpec = Object.freeze({
  bayFootprintWidthM: 2.76,
  portalClearanceM: 2.4,
  safetyRailingHeightM: 1.1,
  deskConsoleHeightM: 0.74,
  stairRiserHeightM: 0.18,
});

export interface CrossGenreDatumProfile {
  readonly id: CrossGenreDatumGenreId;
  readonly labelKo: string;
  readonly assetSlug: string;
  readonly assetVersionTag: "V18" | "V19";
  readonly previewUrl: string;
  readonly targetKelvin: number;
  readonly recommendedLinePx: number;
  readonly defaultEpisodeCutCount: number;
  readonly baselineRejectionRatePct: number;
  readonly guardedRejectionRatePct: number;
}

export const CROSS_GENRE_DATUM_PROFILES: readonly CrossGenreDatumProfile[] = Object.freeze([
  {
    id: "rofan",
    labelKo: "로판 연회",
    assetSlug: "webtoon-imperial-banquet-alcove-arch-v18",
    assetVersionTag: "V18",
    previewUrl: "/studio-assets/blender-episode-handoff-v18/thumbnails/webtoon-imperial-banquet-alcove-arch-v18.png",
    targetKelvin: 3200,
    recommendedLinePx: 1.35,
    defaultEpisodeCutCount: 65,
    baselineRejectionRatePct: 18.5,
    guardedRejectionRatePct: 2.4,
  },
  {
    id: "action",
    labelKo: "액션 레이드",
    assetSlug: "webtoon-raid-return-relic-portal-gate-v18",
    assetVersionTag: "V18",
    previewUrl: "/studio-assets/blender-episode-handoff-v18/thumbnails/webtoon-raid-return-relic-portal-gate-v18.png",
    targetKelvin: 8500,
    recommendedLinePx: 2.8,
    defaultEpisodeCutCount: 85,
    baselineRejectionRatePct: 19.2,
    guardedRejectionRatePct: 2.6,
  },
  {
    id: "modern",
    labelKo: "현대 오피스·펜트하우스",
    assetSlug: "webtoon-modern-penthouse-terrace-datum-bay-v19",
    assetVersionTag: "V19",
    previewUrl: "/studio-assets/blender-shared-datum-v19/thumbnails/webtoon-modern-penthouse-terrace-datum-bay-v19.png",
    targetKelvin: 5200,
    recommendedLinePx: 1.65,
    defaultEpisodeCutCount: 68,
    baselineRejectionRatePct: 16.8,
    guardedRejectionRatePct: 2.1,
  },
  {
    id: "murim",
    labelKo: "무협 월문 누각",
    assetSlug: "webtoon-murim-moon-gate-pavilion-datum-v19",
    assetVersionTag: "V19",
    previewUrl: "/studio-assets/blender-shared-datum-v19/thumbnails/webtoon-murim-moon-gate-pavilion-datum-v19.png",
    targetKelvin: 3400,
    recommendedLinePx: 2.35,
    defaultEpisodeCutCount: 78,
    baselineRejectionRatePct: 18.9,
    guardedRejectionRatePct: 2.5,
  },
  {
    id: "scifi",
    labelKo: "SF 함교 에어락",
    assetSlug: "webtoon-scifi-airlock-bridge-datum-bay-v19",
    assetVersionTag: "V19",
    previewUrl: "/studio-assets/blender-shared-datum-v19/thumbnails/webtoon-scifi-airlock-bridge-datum-bay-v19.png",
    targetKelvin: 8800,
    recommendedLinePx: 1.9,
    defaultEpisodeCutCount: 74,
    baselineRejectionRatePct: 18.5,
    guardedRejectionRatePct: 2.3,
  },
]);

export interface GenreCutDensityRejectionRoiInput {
  readonly genreId: CrossGenreDatumGenreId;
  readonly bg3dAdoptionRatioPct: number;
  readonly reworkMinutesPerRejectedCut?: number;
}

export interface GenreCutDensityRejectionRoiResult {
  readonly profile: CrossGenreDatumProfile;
  readonly datumSpec: SharedArchitecturalDatumSpec;
  readonly episodeCutCount: number;
  readonly adopted3dCutCount: number;
  readonly baselineRejectionRatePct: number;
  readonly guardedRejectionRatePct: number;
  readonly rejectionRateDropPctPoints: number;
  readonly baselineRejectedCuts: number;
  readonly guardedRejectedCuts: number;
  readonly preventedRejectedCuts: number;
  readonly reworkHoursSavedPerEpisode: number;
  readonly cameraTransferDriftMeters: 0;
  readonly summaryKo: string;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function evaluateGenreCutDensityAndRejectionRoi(
  input: GenreCutDensityRejectionRoiInput,
): GenreCutDensityRejectionRoiResult {
  const profile =
    CROSS_GENRE_DATUM_PROFILES.find((item) => item.id === input.genreId) ??
    CROSS_GENRE_DATUM_PROFILES[0]!;
  const clampedAdoption = Math.max(10, Math.min(95, input.bg3dAdoptionRatioPct));
  const reworkMinutes = Math.max(15, input.reworkMinutesPerRejectedCut ?? 38);

  const episodeCutCount = profile.defaultEpisodeCutCount;
  const adopted3dCutCount = Math.round((episodeCutCount * clampedAdoption) / 100);
  const baselineRejectedCuts = round1(
    (adopted3dCutCount * profile.baselineRejectionRatePct) / 100,
  );
  const guardedRejectedCuts = round1(
    (adopted3dCutCount * profile.guardedRejectionRatePct) / 100,
  );
  const preventedRejectedCuts = round1(
    Math.max(0, baselineRejectedCuts - guardedRejectedCuts),
  );
  const rejectionRateDropPctPoints = round1(
    profile.baselineRejectionRatePct - profile.guardedRejectionRatePct,
  );
  const reworkHoursSavedPerEpisode = round1((preventedRejectedCuts * reworkMinutes) / 60);

  return {
    profile,
    datumSpec: SHARED_ARCHITECTURAL_DATUM_SPEC,
    episodeCutCount,
    adopted3dCutCount,
    baselineRejectionRatePct: profile.baselineRejectionRatePct,
    guardedRejectionRatePct: profile.guardedRejectionRatePct,
    rejectionRateDropPctPoints,
    baselineRejectedCuts,
    guardedRejectedCuts,
    preventedRejectedCuts,
    reworkHoursSavedPerEpisode,
    cameraTransferDriftMeters: 0,
    summaryKo: `${profile.labelKo}(${episodeCutCount}컷) 마감 반려율 ${profile.baselineRejectionRatePct}%→${profile.guardedRejectionRatePct}% (-${rejectionRateDropPctPoints}%p · 반려 재작업 -${reworkHoursSavedPerEpisode}h)`,
  };
}

export interface DarkroomProofingState {
  readonly enabled: boolean;
  readonly surfaceHex: string;
  readonly elevatedHex: string;
  readonly hairlineHex: string;
  readonly uiChromaticBiasDeltaE: number;
  readonly contrastProofPassed: boolean;
  readonly summaryKo: string;
}

export function evaluateDarkroomProofingState(
  enabled: boolean,
  activeKelvin: number,
  contrastRatio: number,
): DarkroomProofingState {
  const contrastProofPassed = contrastRatio >= 2.1;
  if (enabled) {
    return {
      enabled: true,
      surfaceHex: "#141415",
      elevatedHex: "#19191b",
      hairlineHex: "#262629",
      uiChromaticBiasDeltaE: 0,
      contrastProofPassed,
      summaryKo: `무채색 암실 검수 활성 (UI 색편향 ΔE 0.0 · ${activeKelvin}K · 대비 ${contrastRatio}:1)`,
    };
  }
  return {
    enabled: false,
    surfaceHex: "var(--color-panel)",
    elevatedHex: "var(--color-card)",
    hairlineHex: "var(--color-line)",
    uiChromaticBiasDeltaE: 1.8,
    contrastProofPassed,
    summaryKo: `표준 작업대 화면 (${activeKelvin}K · 대비 ${contrastRatio}:1)`,
  };
}
