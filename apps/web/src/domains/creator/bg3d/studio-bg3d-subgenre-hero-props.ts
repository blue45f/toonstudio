/**
 * V31 세부 장르 서사 히어로 소품(학원물 사물함·고백 편지 / 느와르 레드스트링 수사 핀보드 / 헌터 S급 각성 측정 비석)
 * 원클릭 퀵스왑 및 클로즈업 인서트 컷 리터칭 절감 평가기.
 */

import type { EpisodeMacroScenarioId } from "./studio-bg3d-episode-macro-scenarios";

export type SubgenreHeroPropId =
  | "academy-locker-letter"
  | "noir-redstring-pinboard"
  | "hunter-srank-obelisk";

export interface SubgenreHeroPropSpec {
  readonly id: SubgenreHeroPropId;
  readonly linkedScenarioId: EpisodeMacroScenarioId;
  readonly badgeKo: string;
  readonly labelKo: string;
  readonly shortcutChoseong: string;
  readonly datumAnchorMeters: 1.32 | 1.54 | 0.74;
  readonly closeupInsertCutsPerEp: 4;
  readonly minutesSavedPerInsertCut: 24;
  readonly previewUrl: string;
  readonly glbUrl: string;
}

export const SUBGENRE_HERO_PROPS: readonly SubgenreHeroPropSpec[] =
  Object.freeze([
    {
      id: "academy-locker-letter",
      linkedScenarioId: "academy-sunset-confession",
      badgeKo: "사물함·편지 (1.32m)",
      labelKo: "복도 사물함 12칸 · 34° 반개방 고백 편지 인서트",
      shortcutChoseong: "ㅅㅁㅎ",
      datumAnchorMeters: 1.32,
      closeupInsertCutsPerEp: 4,
      minutesSavedPerInsertCut: 24,
      previewUrl:
        "/studio-assets/blender-genre-hero-props-v31/thumbnails/webtoon-prop-academy-locker-shoebox-bank-v31.png",
      glbUrl:
        "/studio-assets/blender-genre-hero-props-v31/webtoon-prop-academy-locker-shoebox-bank-v31.glb",
    },
    {
      id: "noir-redstring-pinboard",
      linkedScenarioId: "noir-blind-interrogation",
      badgeKo: "수사 핀보드 (1.54m)",
      labelKo: "용의자 레드스트링 6링크 수사 보드 · 0.74m 증거함",
      shortcutChoseong: "ㅅㅅㅂㄷ",
      datumAnchorMeters: 1.54,
      closeupInsertCutsPerEp: 4,
      minutesSavedPerInsertCut: 24,
      previewUrl:
        "/studio-assets/blender-genre-hero-props-v31/thumbnails/webtoon-prop-noir-evidence-pinboard-cabinet-v31.png",
      glbUrl:
        "/studio-assets/blender-genre-hero-props-v31/webtoon-prop-noir-evidence-pinboard-cabinet-v31.glb",
    },
    {
      id: "hunter-srank-obelisk",
      linkedScenarioId: "hunter-srank-gate-rupture",
      badgeKo: "각성 측정석 (0.74m)",
      labelKo: "2.40m 육각 마나 오벨리스크 · 0.74m 손바닥 각성 단말기",
      shortcutChoseong: "ㄱㅅㅂㅅ",
      datumAnchorMeters: 0.74,
      closeupInsertCutsPerEp: 4,
      minutesSavedPerInsertCut: 24,
      previewUrl:
        "/studio-assets/blender-genre-hero-props-v31/thumbnails/webtoon-prop-hunter-awakening-rank-kiosk-v31.png",
      glbUrl:
        "/studio-assets/blender-genre-hero-props-v31/webtoon-prop-hunter-awakening-rank-kiosk-v31.glb",
    },
  ]);

export interface SubgenreHeroPropInput {
  readonly propId: SubgenreHeroPropId;
  readonly baseV30WeeklyHoursSaved: number;
}

export interface SubgenreHeroPropEvaluation {
  readonly prop: SubgenreHeroPropSpec;
  readonly totalKitDrawersCount: 19;
  readonly propWeeklyHoursSaved: number;
  readonly totalWeeklyHoursV31: number;
  readonly totalWeeklyPersonDaysV31: number;
  readonly quarterlyHoursSavedV31: number;
  readonly quarterlyBankedEpisodesV31: number;
  readonly propSummaryKo: string;
  readonly propRoiSummaryKo: string;
}

export function evaluateSubgenreHeroProp(
  input: SubgenreHeroPropInput,
): SubgenreHeroPropEvaluation {
  const prop =
    SUBGENRE_HERO_PROPS.find((item) => item.id === input.propId) ??
    SUBGENRE_HERO_PROPS[0]!;

  // 회차당 핵심 서사 클로즈업 인서트 소품 4컷 × 24분 수작업 작화 제거 = 96분 = +1.6h/주
  const propWeeklyHoursSaved = Number(
    ((prop.closeupInsertCutsPerEp * prop.minutesSavedPerInsertCut) / 60).toFixed(
      1,
    ),
  );
  const totalWeeklyHoursV31 = Number(
    (input.baseV30WeeklyHoursSaved + propWeeklyHoursSaved).toFixed(1),
  );
  const totalWeeklyPersonDaysV31 =
    Math.round((totalWeeklyHoursV31 / 8) * 100) / 100;
  const quarterlyHoursSavedV31 = Number((totalWeeklyHoursV31 * 13).toFixed(1));
  const quarterlyBankedEpisodesV31 =
    Math.round((quarterlyHoursSavedV31 / 80) * 100) / 100;

  return Object.freeze({
    prop,
    totalKitDrawersCount: 19,
    propWeeklyHoursSaved,
    totalWeeklyHoursV31,
    totalWeeklyPersonDaysV31,
    quarterlyHoursSavedV31,
    quarterlyBankedEpisodesV31,
    propSummaryKo: `[초성 ${prop.shortcutChoseong}] 기준선 Z ${prop.datumAnchorMeters.toFixed(2)}m 무오차 스냅 · 인서트 ${prop.closeupInsertCutsPerEp}컷(-${prop.minutesSavedPerInsertCut}분/컷)`,
    propRoiSummaryKo: `세부 히어로 소품 V31(+${propWeeklyHoursSaved.toFixed(1)}h/주 · 19개 서랍) -> 주간 ${totalWeeklyHoursV31.toFixed(1)}h(${totalWeeklyPersonDaysV31.toFixed(2)}인일) · 13주 분기 ${quarterlyHoursSavedV31.toFixed(1)}h (${quarterlyBankedEpisodesV31.toFixed(2)}회차 비축)`,
  });
}
