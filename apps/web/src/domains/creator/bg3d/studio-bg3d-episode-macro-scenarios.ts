/**
 * V30 8대 웹툰 장르 통합(기존 5종 + 학원물 · 느와르 스릴러 · 헌터 게이트) 및
 * 원클릭 회차 마스터 자동화 시나리오 러너(Episode Macro Scenario Runner).
 */

import type { DuoEyelinePresetId } from "./studio-bg3d-duo-ots-remotion-offline";

export type EpisodeMacroScenarioId =
  | "academy-sunset-confession"
  | "noir-blind-interrogation"
  | "hunter-srank-gate-rupture";

export interface EpisodeMacroScenarioSpec {
  readonly id: EpisodeMacroScenarioId;
  readonly genreBadgeKo: string;
  readonly labelKo: string;
  readonly shortcutChoseong: string;
  readonly v30AssetSlug: string;
  readonly previewUrl: string;
  readonly glbUrl: string;
  readonly targetDuoId: DuoEyelinePresetId;
  readonly kelvin: 5400 | 4100 | 8200;
  readonly recommendedInkPx: 1.5 | 2.6 | 2.4;
  readonly dialogueLineThinningPct: number;
  readonly cliffhangerGutterPx: number;
  readonly setupMinutesBefore: 42;
  readonly setupMinutesAfter: 2;
}

export const EPISODE_MACRO_SCENARIOS: readonly EpisodeMacroScenarioSpec[] =
  Object.freeze([
    {
      id: "academy-sunset-confession",
      genreBadgeKo: "학원물 · 1.50px",
      labelKo: "옥상 안전난간 고백 · 교실 노을 시퀀스",
      shortcutChoseong: "ㅎㅇㅁ",
      v30AssetSlug: "webtoon-genre-academy-rooftop-corridor-v30",
      previewUrl:
        "/studio-assets/blender-genre-expansion-v30/thumbnails/webtoon-genre-academy-rooftop-corridor-v30.png",
      glbUrl:
        "/studio-assets/blender-genre-expansion-v30/webtoon-genre-academy-rooftop-corridor-v30.glb",
      targetDuoId: "rofan-gaze-24cm",
      kelvin: 5400,
      recommendedInkPx: 1.5,
      dialogueLineThinningPct: 38.0,
      cliffhangerGutterPx: 760,
      setupMinutesBefore: 42,
      setupMinutesAfter: 2,
    },
    {
      id: "noir-blind-interrogation",
      genreBadgeKo: "느와르 · 2.60px",
      labelKo: "베네치안 블라인드 탐정실 · 심문 OTS 시퀀스",
      shortcutChoseong: "ㄴㅇㄹ",
      v30AssetSlug: "webtoon-genre-noir-venetian-detective-v30",
      previewUrl:
        "/studio-assets/blender-genre-expansion-v30/thumbnails/webtoon-genre-noir-venetian-detective-v30.png",
      glbUrl:
        "/studio-assets/blender-genre-expansion-v30/webtoon-genre-noir-venetian-detective-v30.glb",
      targetDuoId: "ots-table-dialogue",
      kelvin: 4100,
      recommendedInkPx: 2.6,
      dialogueLineThinningPct: 46.4,
      cliffhangerGutterPx: 800,
      setupMinutesBefore: 42,
      setupMinutesAfter: 2,
    },
    {
      id: "hunter-srank-gate-rupture",
      genreBadgeKo: "헌터물 · 2.40px",
      labelKo: "길드 육각 각성 게이트 · S급 공명 돌파 시퀀스",
      shortcutChoseong: "ㅎㅌㅁ",
      v30AssetSlug: "webtoon-genre-hunter-guild-gate-lobby-v30",
      previewUrl:
        "/studio-assets/blender-genre-expansion-v30/thumbnails/webtoon-genre-hunter-guild-gate-lobby-v30.png",
      glbUrl:
        "/studio-assets/blender-genre-expansion-v30/webtoon-genre-hunter-guild-gate-lobby-v30.glb",
      targetDuoId: "action-standoff-clash",
      kelvin: 8200,
      recommendedInkPx: 2.4,
      dialogueLineThinningPct: 29.0,
      cliffhangerGutterPx: 820,
      setupMinutesBefore: 42,
      setupMinutesAfter: 2,
    },
  ]);

export interface EpisodeMacroScenarioInput {
  readonly scenarioId: EpisodeMacroScenarioId;
  readonly executedRunCount: number;
  readonly baseV29WeeklyHoursSaved: number;
}

export interface EpisodeMacroScenarioEvaluation {
  readonly scenario: EpisodeMacroScenarioSpec;
  readonly totalSupportedGenres: 8;
  readonly executedRunCount: number;
  readonly macroWeeklyHoursSaved: number;
  readonly totalWeeklyHoursV30: number;
  readonly totalWeeklyPersonDaysV30: number;
  readonly quarterlyHoursSavedV30: number;
  readonly quarterlyBankedEpisodesV30: number;
  readonly scenarioSummaryKo: string;
  readonly macroRoiSummaryKo: string;
}

export function evaluateEpisodeMacroScenario(
  input: EpisodeMacroScenarioInput,
): EpisodeMacroScenarioEvaluation {
  const scenario =
    EPISODE_MACRO_SCENARIOS.find((s) => s.id === input.scenarioId) ??
    EPISODE_MACRO_SCENARIOS[0]!;

  // 회차 내 다중 장소(학교 옥상/탐정실/헌터 게이트 등 3개 세트) 초기 조립·핸드오프 자동화: 세트당 40분 × 3회 = +2.0h/주
  const macroWeeklyHoursSaved = 2.0;
  const totalWeeklyHoursV30 = Number(
    (input.baseV29WeeklyHoursSaved + macroWeeklyHoursSaved).toFixed(1),
  );
  const totalWeeklyPersonDaysV30 =
    Math.round((totalWeeklyHoursV30 / 8) * 100) / 100;
  const quarterlyHoursSavedV30 = Number((totalWeeklyHoursV30 * 13).toFixed(1));
  const quarterlyBankedEpisodesV30 =
    Math.round((quarterlyHoursSavedV30 / 80) * 100) / 100;

  return Object.freeze({
    scenario,
    totalSupportedGenres: 8,
    executedRunCount: input.executedRunCount,
    macroWeeklyHoursSaved,
    totalWeeklyHoursV30,
    totalWeeklyPersonDaysV30,
    quarterlyHoursSavedV30,
    quarterlyBankedEpisodesV30,
    scenarioSummaryKo: `[${scenario.genreBadgeKo}] ${scenario.kelvin}K · 대사 선화 -${scenario.dialogueLineThinningPct}% · 절단신공 ${scenario.cliffhangerGutterPx}px · 초기 조립 ${scenario.setupMinutesBefore}분->${scenario.setupMinutesAfter}분`,
    macroRoiSummaryKo: `8대 장르 원클릭 매크로(+${macroWeeklyHoursSaved.toFixed(1)}h/주 · 실행 ${input.executedRunCount}회) -> 주간 ${totalWeeklyHoursV30.toFixed(1)}h(${totalWeeklyPersonDaysV30.toFixed(2)}인일) · 13주 분기 ${quarterlyHoursSavedV30.toFixed(1)}h (${quarterlyBankedEpisodesV30.toFixed(2)}회차 비축)`,
  });
}
