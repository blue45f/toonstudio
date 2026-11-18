/**
 * ToonStudio Wave 8 (V22) — 개폐율(0~100%) 연동 대기 입자·보케(Atmospheric Motes / Bokeh) ·
 * 카메라 조리개(DoF f/1.8 ~ f/5.6) 착란원(CoC) 매핑 엔진 & 분기별(13주) 비축 원고 회차 ROI 시뮬레이터.
 */

export type AtmosphericMoteStyleId =
  | "amber-dust-motes"
  | "rofan-gilded-petals"
  | "abyss-mana-embers";

export interface AtmosphericMoteProfile {
  readonly id: AtmosphericMoteStyleId;
  readonly labelKo: string;
  readonly assetSlug: string;
  readonly previewUrl: string;
  readonly psdLayerTag: string;
  readonly postBrushMinutesSavedPerSequence: number;
}

export const ATMOSPHERIC_MOTE_PROFILES: readonly AtmosphericMoteProfile[] = Object.freeze([
  {
    id: "amber-dust-motes",
    labelKo: "슬릿 집광 금빛 먼지 (f/1.8)",
    assetSlug: "webtoon-bokeh-slit-dust-motes-f18-v22",
    previewUrl:
      "/studio-assets/blender-atmospheric-bokeh-v22/thumbnails/webtoon-bokeh-slit-dust-motes-f18-v22.png",
    psdLayerTag: "FX_FG_Bokeh_Dust_Screen",
    postBrushMinutesSavedPerSequence: 18,
  },
  {
    id: "rofan-gilded-petals",
    labelKo: "로판 금박 꽃잎 기류 (f/2.8)",
    assetSlug: "webtoon-bokeh-rofan-petal-cascade-f28-v22",
    previewUrl:
      "/studio-assets/blender-atmospheric-bokeh-v22/thumbnails/webtoon-bokeh-rofan-petal-cascade-f28-v22.png",
    psdLayerTag: "FX_FG_Bokeh_RosePetals_Add",
    postBrushMinutesSavedPerSequence: 24,
  },
  {
    id: "abyss-mana-embers",
    labelKo: "각성 시안 마나 결정 (f/5.6)",
    assetSlug: "webtoon-bokeh-mana-ember-halo-f56-v22",
    previewUrl:
      "/studio-assets/blender-atmospheric-bokeh-v22/thumbnails/webtoon-bokeh-mana-ember-halo-f56-v22.png",
    psdLayerTag: "FX_FG_Bokeh_ManaEmbers_Glow",
    postBrushMinutesSavedPerSequence: 22,
  },
]);

export interface AtmosphericBokehQuarterlyRoiInput {
  readonly openRatioPct: number;
  readonly moteStyleId: AtmosphericMoteStyleId;
  readonly climaxSequencesPerEpisode: number;
  readonly baseCombinedWeeklyHoursSaved: number;
  readonly episodeProductionBudgetHours?: number;
}

export interface AtmosphericBokehQuarterlyRoiEvaluation {
  readonly profile: AtmosphericMoteProfile;
  readonly openRatioPct: number;
  readonly recommendedApertureFStop: number;
  readonly foregroundCocDiameterPx: number;
  readonly spotlightConcentrationPct: number;
  readonly foregroundBokehCount: number;
  readonly midgroundMoteCount: number;
  readonly climaxSequencesPerEpisode: number;
  readonly weeklyBokehBrushHoursSaved: number;
  readonly totalWeeklyHoursWithBokeh: number;
  readonly quarterlyTotalHoursSaved: number;
  readonly bankedEpisodesPerQuarter: number;
  readonly dofSummaryKo: string;
  readonly quarterlyBankedSummaryKo: string;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 개폐율(15% -> 65% -> 100%)에 맞춰 조리개(f/1.8 -> f/2.8 -> f/5.6)와 전경 착란원(CoC px)을 연속 보간한다.
 */
function computeCoupledApertureFStop(openRatioPct: number): number {
  if (openRatioPct <= 15) {
    return round1(1.6 + (openRatioPct / 15) * 0.2);
  }
  if (openRatioPct <= 65) {
    return round1(1.8 + ((openRatioPct - 15) / 50) * 1.0);
  }
  return round1(2.8 + ((openRatioPct - 65) / 35) * 2.8);
}

export function evaluateAtmosphericBokehAndQuarterlyRoi(
  input: AtmosphericBokehQuarterlyRoiInput,
): AtmosphericBokehQuarterlyRoiEvaluation {
  const profile =
    ATMOSPHERIC_MOTE_PROFILES.find((item) => item.id === input.moteStyleId) ??
    ATMOSPHERIC_MOTE_PROFILES[0]!;
  const openRatioPct = Math.max(0, Math.min(100, Math.round(input.openRatioPct)));
  const ratio = openRatioPct / 100;

  const recommendedApertureFStop = computeCoupledApertureFStop(openRatioPct);
  const foregroundCocDiameterPx = round1(47.5 / recommendedApertureFStop);
  const spotlightConcentrationPct = Math.round(94 - 60 * ratio);
  const foregroundBokehCount = 6;
  const midgroundMoteCount = 16;

  const climaxSequencesPerEpisode = Math.max(
    1,
    Math.min(8, Math.round(input.climaxSequencesPerEpisode)),
  );
  const weeklyBokehBrushHoursSaved = round1(
    (climaxSequencesPerEpisode * profile.postBrushMinutesSavedPerSequence) / 60,
  );
  const totalWeeklyHoursWithBokeh = round1(
    Math.max(0, input.baseCombinedWeeklyHoursSaved) + weeklyBokehBrushHoursSaved,
  );
  const quarterlyTotalHoursSaved = round1(totalWeeklyHoursWithBokeh * 13);
  const budgetHours = Math.max(40, input.episodeProductionBudgetHours ?? 80);
  const bankedEpisodesPerQuarter = round2(quarterlyTotalHoursSaved / budgetHours);

  return {
    profile,
    openRatioPct,
    recommendedApertureFStop,
    foregroundCocDiameterPx,
    spotlightConcentrationPct,
    foregroundBokehCount,
    midgroundMoteCount,
    climaxSequencesPerEpisode,
    weeklyBokehBrushHoursSaved,
    totalWeeklyHoursWithBokeh,
    quarterlyTotalHoursSaved,
    bankedEpisodesPerQuarter,
    dofSummaryKo: `조리개 f/${recommendedApertureFStop.toFixed(1)} · 전경 보케 CoC ${foregroundCocDiameterPx.toFixed(1)}px · 슬릿 집광 밀도 ${spotlightConcentrationPct}% (${profile.psdLayerTag})`,
    quarterlyBankedSummaryKo: `회차당 3연속 시퀀스 ${climaxSequencesPerEpisode}회 → 주간 ${totalWeeklyHoursWithBokeh.toFixed(1)}h · 분기(13주) ${quarterlyTotalHoursSaved.toFixed(1)}h 절감 (세이브 원고 ${bankedEpisodesPerQuarter.toFixed(2)}회차 비축)`,
  };
}
