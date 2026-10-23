/**
 * 생산자 구조화 에러 해석 모듈 — scrollRhythm 구간: studio-scroll-rhythm
 * insight 11코드 × 3필드(title·detail·suggestion) 33키 + ending 라벨 5키
 * (A4 D4, R15, 설계 r10-d4-trace-3.md §2.20).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와
 * 동일하다: 생산자는 {code, params}만 방출하고(insight의 title/detail/
 * suggestion과 ending의 label은 제거), 표시는 이 모듈의 리졸버로만
 * 해석한다. ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규
 * 번역이다. insight 코드는 생산자의 기존 대문자 코드를 그대로 쓴다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  StudioScrollEndingMode,
  StudioScrollRhythmInsight,
  StudioScrollRhythmInsightCode,
} from "../studio-scroll-rhythm";

function resolveProducerError(
  key: string,
  fallback: string,
  params?: Readonly<Record<string, string>>,
): string {
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  const values = params ?? {};
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(values, token) ? String(values[token]) : placeholder,
  );
}

registerI18nLocaleEntries("ko", {
  "studio.producerError.scrollRhythm.insight.NO_VISIBLE_CONTENT.title": "빈 페이지",
  "studio.producerError.scrollRhythm.insight.NO_VISIBLE_CONTENT.detail": "독자가 머무를 시각 비트가 없습니다.",
  "studio.producerError.scrollRhythm.insight.NO_VISIBLE_CONTENT.suggestion": "의도된 여백이 아니라면 컷, 대사 또는 전환 비트를 추가하세요.",
  "studio.producerError.scrollRhythm.insight.DENSE_PAGE.title": "정보 밀도가 높음",
  "studio.producerError.scrollRhythm.insight.DENSE_PAGE.detail": "한 화면당 가중 요소가 약 {density}개입니다.",
  "studio.producerError.scrollRhythm.insight.DENSE_PAGE.suggestion": "컷을 분리하거나 컷 사이 여백을 늘려 시선 이동을 단순화하세요.",
  "studio.producerError.scrollRhythm.insight.DIALOGUE_LOAD.title": "대사 호흡이 김",
  "studio.producerError.scrollRhythm.insight.DIALOGUE_LOAD.detail": "한 화면당 약 {dialogueChars}자의 대사가 배치됐습니다.",
  "studio.producerError.scrollRhythm.insight.DIALOGUE_LOAD.suggestion": "말풍선을 나누거나 행동 컷 사이에 대사를 분산하세요.",
  "studio.producerError.scrollRhythm.insight.SFX_DENSE.title": "효과음이 몰린 페이지",
  "studio.producerError.scrollRhythm.insight.SFX_DENSE.detail": "한 화면당 효과음이 약 {sfx}개 배치됐습니다.",
  "studio.producerError.scrollRhythm.insight.SFX_DENSE.suggestion": "효과음을 줄이거나 인접 컷으로 나눠 배치하면 체감 속도가 완만해집니다.",
  "studio.producerError.scrollRhythm.insight.NO_BREATHING_ROOM.title": "호흡 여백 부족",
  "studio.producerError.scrollRhythm.insight.NO_BREATHING_ROOM.detail": "비어 있는 세로 구간이 전체의 {ratio}%입니다.",
  "studio.producerError.scrollRhythm.insight.NO_BREATHING_ROOM.suggestion": "감정 전환이나 장면 전환 앞뒤에 짧은 무음 여백을 확보하세요.",
  "studio.producerError.scrollRhythm.insight.LONG_EMPTY_RUN.title": "긴 무음 구간",
  "studio.producerError.scrollRhythm.insight.LONG_EMPTY_RUN.detail": "가장 긴 여백이 약 {gapScreens}화면입니다.",
  "studio.producerError.scrollRhythm.insight.LONG_EMPTY_RUN.suggestion": "의도된 서스펜스인지 확인하고, 아니라면 다음 비트를 조금 당기세요.",
  "studio.producerError.scrollRhythm.insight.FLAT_BEAT_INTERVALS.title": "컷 간격이 단조로움",
  "studio.producerError.scrollRhythm.insight.FLAT_BEAT_INTERVALS.detail": "주요 비트의 세로 간격이 거의 동일해 리듬 변화가 작습니다.",
  "studio.producerError.scrollRhythm.insight.FLAT_BEAT_INTERVALS.suggestion": "강조 컷 전후 간격을 대비시켜 속도감과 긴장도를 조절하세요.",
  "studio.producerError.scrollRhythm.insight.TIGHT_ENDING.title": "엔딩 비트가 화면 끝에 붙음",
  "studio.producerError.scrollRhythm.insight.TIGHT_ENDING.detail": "마지막 요소 뒤의 여백이 0.12화면보다 짧습니다.",
  "studio.producerError.scrollRhythm.insight.TIGHT_ENDING.suggestion": "다음 화 유도나 감정 잔상을 원한다면 짧은 여백을 추가하세요.",
  "studio.producerError.scrollRhythm.insight.EMPTY_ENDING.title": "엔딩 이후 여백이 김",
  "studio.producerError.scrollRhythm.insight.EMPTY_ENDING.detail": "마지막 비트 뒤에 약 {screens}화면이 비어 있습니다.",
  "studio.producerError.scrollRhythm.insight.EMPTY_ENDING.suggestion": "의도된 클리프행어가 아니라면 캔버스 높이를 줄이거나 마지막 비트를 내리세요.",
  "studio.producerError.scrollRhythm.insight.SFX_LONG_GAP.title": "효과음 없는 구간이 김",
  "studio.producerError.scrollRhythm.insight.SFX_LONG_GAP.detail": "효과음이 없는 구간이 약 {gapScreens}화면 이어집니다.",
  "studio.producerError.scrollRhythm.insight.SFX_LONG_GAP.suggestion": "의도된 정적이면 그대로 두고, 아니라면 중간 컷에 환경음·동작 효과음을 한두 개 배치해 보세요.",
  "studio.producerError.scrollRhythm.insight.ANALYSIS_TRUNCATED.title": "분석 예산 적용",
  "studio.producerError.scrollRhythm.insight.ANALYSIS_TRUNCATED.detail": "대형 원고의 일부만 안전 예산 안에서 분석했습니다.",
  "studio.producerError.scrollRhythm.insight.ANALYSIS_TRUNCATED.suggestion": "페이지 구간을 나눠 다시 분석하면 더 세밀한 결과를 얻을 수 있습니다.",
  "studio.producerError.scrollRhythm.ending.none": "엔딩 비트 없음",
  "studio.producerError.scrollRhythm.ending.tight": "엔딩이 촘촘함",
  "studio.producerError.scrollRhythm.ending.balanced": "균형 잡힌 엔딩",
  "studio.producerError.scrollRhythm.ending.reveal": "클리프행어 호흡",
  "studio.producerError.scrollRhythm.ending.empty": "엔딩 여백이 김",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.scrollRhythm.insight.NO_VISIBLE_CONTENT.title": "Empty page",
  "studio.producerError.scrollRhythm.insight.NO_VISIBLE_CONTENT.detail": "There is no visual beat for the reader to linger on.",
  "studio.producerError.scrollRhythm.insight.NO_VISIBLE_CONTENT.suggestion": "If this is not intentional whitespace, add a cut, dialogue, or a transition beat.",
  "studio.producerError.scrollRhythm.insight.DENSE_PAGE.title": "High information density",
  "studio.producerError.scrollRhythm.insight.DENSE_PAGE.detail": "There are about {density} weighted elements per screen.",
  "studio.producerError.scrollRhythm.insight.DENSE_PAGE.suggestion": "Split cuts or widen the gaps between cuts to simplify eye movement.",
  "studio.producerError.scrollRhythm.insight.DIALOGUE_LOAD.title": "Long dialogue breathing",
  "studio.producerError.scrollRhythm.insight.DIALOGUE_LOAD.detail": "About {dialogueChars} characters of dialogue are placed per screen.",
  "studio.producerError.scrollRhythm.insight.DIALOGUE_LOAD.suggestion": "Split speech balloons or spread the dialogue between action cuts.",
  "studio.producerError.scrollRhythm.insight.SFX_DENSE.title": "SFX-clustered page",
  "studio.producerError.scrollRhythm.insight.SFX_DENSE.detail": "About {sfx} sound effects are placed per screen.",
  "studio.producerError.scrollRhythm.insight.SFX_DENSE.suggestion": "Reduce the sound effects or spread them to adjacent cuts to soften the perceived pace.",
  "studio.producerError.scrollRhythm.insight.NO_BREATHING_ROOM.title": "Not enough breathing room",
  "studio.producerError.scrollRhythm.insight.NO_BREATHING_ROOM.detail": "Empty vertical stretches make up {ratio}% of the whole.",
  "studio.producerError.scrollRhythm.insight.NO_BREATHING_ROOM.suggestion": "Secure short silent whitespace before and after emotional or scene transitions.",
  "studio.producerError.scrollRhythm.insight.LONG_EMPTY_RUN.title": "Long silent stretch",
  "studio.producerError.scrollRhythm.insight.LONG_EMPTY_RUN.detail": "The longest gap is about {gapScreens} screens.",
  "studio.producerError.scrollRhythm.insight.LONG_EMPTY_RUN.suggestion": "Check whether this suspense is intentional; if not, pull the next beat a little earlier.",
  "studio.producerError.scrollRhythm.insight.FLAT_BEAT_INTERVALS.title": "Monotone cut intervals",
  "studio.producerError.scrollRhythm.insight.FLAT_BEAT_INTERVALS.detail": "The vertical intervals between major beats are nearly identical, so rhythm variation is small.",
  "studio.producerError.scrollRhythm.insight.FLAT_BEAT_INTERVALS.suggestion": "Contrast the gaps around emphasis cuts to adjust the sense of speed and tension.",
  "studio.producerError.scrollRhythm.insight.TIGHT_ENDING.title": "Ending beat touches the screen end",
  "studio.producerError.scrollRhythm.insight.TIGHT_ENDING.detail": "The whitespace after the last element is shorter than 0.12 screens.",
  "studio.producerError.scrollRhythm.insight.TIGHT_ENDING.suggestion": "If you want to lead into the next episode or leave an emotional afterglow, add a short whitespace.",
  "studio.producerError.scrollRhythm.insight.EMPTY_ENDING.title": "Long whitespace after the ending",
  "studio.producerError.scrollRhythm.insight.EMPTY_ENDING.detail": "About {screens} screens are empty after the last beat.",
  "studio.producerError.scrollRhythm.insight.EMPTY_ENDING.suggestion": "If this is not an intentional cliffhanger, reduce the canvas height or move the last beat down.",
  "studio.producerError.scrollRhythm.insight.SFX_LONG_GAP.title": "Long stretch without SFX",
  "studio.producerError.scrollRhythm.insight.SFX_LONG_GAP.detail": "The stretch without sound effects continues for about {gapScreens} screens.",
  "studio.producerError.scrollRhythm.insight.SFX_LONG_GAP.suggestion": "Leave it if the stillness is intentional; otherwise place one or two ambient or action sound effects in the middle cuts.",
  "studio.producerError.scrollRhythm.insight.ANALYSIS_TRUNCATED.title": "Analysis budget applied",
  "studio.producerError.scrollRhythm.insight.ANALYSIS_TRUNCATED.detail": "Only part of the large manuscript was analyzed within the safety budget.",
  "studio.producerError.scrollRhythm.insight.ANALYSIS_TRUNCATED.suggestion": "Analyze page ranges separately for more detailed results.",
  "studio.producerError.scrollRhythm.ending.none": "No ending beat",
  "studio.producerError.scrollRhythm.ending.tight": "Tight ending",
  "studio.producerError.scrollRhythm.ending.balanced": "Balanced ending",
  "studio.producerError.scrollRhythm.ending.reveal": "Cliffhanger breathing",
  "studio.producerError.scrollRhythm.ending.empty": "Long ending whitespace",
});

/** insight 코드별 ko 원문 템플릿 — 필드 단위 폴백이며 이관 전 원문과 동일하다. */
const INSIGHT_KO: Readonly<Record<StudioScrollRhythmInsightCode, { title: string; detail: string; suggestion: string }>> = {
  NO_VISIBLE_CONTENT: { title: "빈 페이지", detail: "독자가 머무를 시각 비트가 없습니다.", suggestion: "의도된 여백이 아니라면 컷, 대사 또는 전환 비트를 추가하세요." },
  DENSE_PAGE: { title: "정보 밀도가 높음", detail: "한 화면당 가중 요소가 약 {density}개입니다.", suggestion: "컷을 분리하거나 컷 사이 여백을 늘려 시선 이동을 단순화하세요." },
  DIALOGUE_LOAD: { title: "대사 호흡이 김", detail: "한 화면당 약 {dialogueChars}자의 대사가 배치됐습니다.", suggestion: "말풍선을 나누거나 행동 컷 사이에 대사를 분산하세요." },
  SFX_DENSE: { title: "효과음이 몰린 페이지", detail: "한 화면당 효과음이 약 {sfx}개 배치됐습니다.", suggestion: "효과음을 줄이거나 인접 컷으로 나눠 배치하면 체감 속도가 완만해집니다." },
  NO_BREATHING_ROOM: { title: "호흡 여백 부족", detail: "비어 있는 세로 구간이 전체의 {ratio}%입니다.", suggestion: "감정 전환이나 장면 전환 앞뒤에 짧은 무음 여백을 확보하세요." },
  LONG_EMPTY_RUN: { title: "긴 무음 구간", detail: "가장 긴 여백이 약 {gapScreens}화면입니다.", suggestion: "의도된 서스펜스인지 확인하고, 아니라면 다음 비트를 조금 당기세요." },
  FLAT_BEAT_INTERVALS: { title: "컷 간격이 단조로움", detail: "주요 비트의 세로 간격이 거의 동일해 리듬 변화가 작습니다.", suggestion: "강조 컷 전후 간격을 대비시켜 속도감과 긴장도를 조절하세요." },
  TIGHT_ENDING: { title: "엔딩 비트가 화면 끝에 붙음", detail: "마지막 요소 뒤의 여백이 0.12화면보다 짧습니다.", suggestion: "다음 화 유도나 감정 잔상을 원한다면 짧은 여백을 추가하세요." },
  EMPTY_ENDING: { title: "엔딩 이후 여백이 김", detail: "마지막 비트 뒤에 약 {screens}화면이 비어 있습니다.", suggestion: "의도된 클리프행어가 아니라면 캔버스 높이를 줄이거나 마지막 비트를 내리세요." },
  SFX_LONG_GAP: { title: "효과음 없는 구간이 김", detail: "효과음이 없는 구간이 약 {gapScreens}화면 이어집니다.", suggestion: "의도된 정적이면 그대로 두고, 아니라면 중간 컷에 환경음·동작 효과음을 한두 개 배치해 보세요." },
  ANALYSIS_TRUNCATED: { title: "분석 예산 적용", detail: "대형 원고의 일부만 안전 예산 안에서 분석했습니다.", suggestion: "페이지 구간을 나눠 다시 분석하면 더 세밀한 결과를 얻을 수 있습니다." },
};

const ENDING_KEYS: Readonly<Record<StudioScrollEndingMode, string>> = {
  none: "studio.producerError.scrollRhythm.ending.none",
  tight: "studio.producerError.scrollRhythm.ending.tight",
  balanced: "studio.producerError.scrollRhythm.ending.balanced",
  reveal: "studio.producerError.scrollRhythm.ending.reveal",
  empty: "studio.producerError.scrollRhythm.ending.empty",
};

const ENDING_KO: Readonly<Record<StudioScrollEndingMode, string>> = {
  none: "엔딩 비트 없음",
  tight: "엔딩이 촘촘함",
  balanced: "균형 잡힌 엔딩",
  reveal: "클리프행어 호흡",
  empty: "엔딩 여백이 김",
};

/** 표시 지점 전용 해석 (scroll insight): 3필드를 한 번에 해석한다. */
export function resolveStudioScrollRhythmInsight(insight: StudioScrollRhythmInsight): {
  title: string;
  detail: string;
  suggestion: string;
} {
  const base = `studio.producerError.scrollRhythm.insight.${insight.code}`;
  const ko = INSIGHT_KO[insight.code];
  return {
    title: resolveProducerError(`${base}.title`, ko.title, insight.params),
    detail: resolveProducerError(`${base}.detail`, ko.detail, insight.params),
    suggestion: resolveProducerError(`${base}.suggestion`, ko.suggestion, insight.params),
  };
}

/** 표시 지점 전용 해석 (scroll ending 라벨): mode로 해석한다. */
export function resolveStudioScrollRhythmEndingLabel(mode: StudioScrollEndingMode): string {
  return resolveProducerError(ENDING_KEYS[mode], ENDING_KO[mode]);
}
