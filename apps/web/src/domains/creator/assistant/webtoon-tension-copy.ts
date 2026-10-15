/**
 * webtoon-tension-copy.ts
 *
 * 텐션 맵 화면이 여러 컴포넌트에서 함께 쓰는 한/영 문구 표. 계산 모듈(`webtoon-tension-map.ts`)은
 * 언어 중립 코드와 숫자만 돌려주므로, 코드 → 사람이 읽는 문장은 여기서 잇는다. 숫자가 들어가는 문장은
 * `{이름}` 자리표시자 템플릿으로 두고 호출한 쪽이 `formatI18nTemplate` 로 채운다 — 숫자마다
 * 새 번역 키가 생기지 않는다.
 */

import type {
  TensionParameterSource,
  TensionSegmentKind,
  TensionSegmentReason,
} from "./webtoon-tension-map";

export interface TensionCopyPair {
  readonly ko: string;
  readonly en: string;
}

export const TENSION_KIND_LABELS: Readonly<Record<TensionSegmentKind, TensionCopyPair>> =
  Object.freeze({
    climax: { ko: "절정 후보", en: "Climax candidate" },
    rush: { ko: "급함 후보", en: "Rush candidate" },
    drag: { ko: "늘어짐 후보", en: "Drag candidate" },
  });

/** 색에만 기대지 않도록 후보 종류마다 모양 글리프를 둔다. */
export const TENSION_KIND_GLYPHS: Readonly<Record<TensionSegmentKind, string>> = Object.freeze({
  climax: "▲",
  rush: "!",
  drag: "…",
});

/** 후보 사유 설명 템플릿. 자리표시자: {value} {min} {rise} {count} {seconds} {threshold}. */
export const TENSION_REASON_TEMPLATES: Readonly<Record<TensionSegmentReason, TensionCopyPair>> =
  Object.freeze({
    peak: {
      ko: "긴장도 {value}로 이웃한 컷보다 높은 지점이에요 (기준 {min} 이상)",
      en: "A local high point at tension {value} (threshold {min} or more)",
    },
    "abrupt-rise": {
      ko: "직전 컷보다 긴장도가 {rise} 이상 갑자기 올라요",
      en: "Tension jumps by {rise} or more from the previous cut",
    },
    "fast-dwell-run": {
      ko: "{seconds}초 이하로 지나가는 컷이 {count}컷 이상 이어져요",
      en: "{count} or more cuts in a row are read in {seconds}s or less",
    },
    "low-tension-run": {
      ko: "긴장도 {threshold} 미만인 컷이 {count}컷 이상 이어져요",
      en: "{count} or more cuts in a row stay below tension {threshold}",
    },
  });

export const TENSION_SOURCE_LABELS: Readonly<Record<TensionParameterSource, TensionCopyPair>> =
  Object.freeze({
    heuristic: { ko: "휴리스틱 (출처 없음)", en: "Heuristic (no source)" },
    estimate: { ko: "추정치 (출처 없음)", en: "Estimate (no source)" },
    "canvas-guide": { ko: "WEBTOON CANVAS 가이드", en: "WEBTOON CANVAS guide" },
  });

/** `TENSION_MAP_PARAMETERS` 의 id 별 라벨. 계수 표의 첫 열이다. */
export const TENSION_PARAMETER_LABELS: Readonly<Record<string, TensionCopyPair>> = Object.freeze({
  "weight.emotion": { ko: "감정 비중", en: "Emotion weight" },
  "weight.shot": { ko: "샷 크기 비중", en: "Shot-size weight" },
  "weight.tempo": { ko: "체류 시간(템포) 비중", en: "Dwell-time (tempo) weight" },
  "dwell.fast": { ko: "빠름 기준 — 템포 1", en: "Fast edge — tempo 1" },
  "dwell.slow": { ko: "느림 기준 — 템포 0", en: "Slow edge — tempo 0" },
  "dwell.speed": { ko: "표준 독자 스크롤 속도", en: "Standard-reader scroll speed" },
  "dwell.dialogue": { ko: "말풍선 하나 읽는 시간", en: "Time to read one bubble" },
  "drag.maxTension": { ko: "늘어짐 — 긴장도 상한(미만)", en: "Drag — tension ceiling (below)" },
  "drag.minRun": { ko: "늘어짐 — 최소 연속 컷", en: "Drag — minimum run of cuts" },
  "rush.minRun": { ko: "급함 — 빠른 체류 최소 연속 컷", en: "Rush — minimum run of fast cuts" },
  "rush.abruptRise": { ko: "급함 — 급상승 폭", en: "Rush — size of an abrupt rise" },
  "rush.exemptGutter": {
    ko: "급상승 예외 — 직전 여백(이상)",
    en: "Abrupt-rise exemption — preceding gutter (or more)",
  },
  "climax.minTension": { ko: "절정 — 최소 긴장도", en: "Climax — minimum tension" },
  "climax.maxCount": { ko: "절정 — 최대 표시 수", en: "Climax — most shown" },
  "plan.panelHeight": { ko: "대본 가정 — 컷 기준 높이", en: "Script assumption — reference panel height" },
  "plan.gutter": { ko: "대본 가정 — 컷 사이 여백", en: "Script assumption — gap between cuts" },
});
