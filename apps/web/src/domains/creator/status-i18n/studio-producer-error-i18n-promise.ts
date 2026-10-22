/**
 * 생산자 구조화 에러 해석 모듈 — promise 구간: studio-promise-payoff-ledger
 * throw 8코드 + 진단 경고 11코드 + 리캡 후보 1코드 (A4 D4, R15,
 * 설계 r10-d4-trace-3.md §2.16).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와
 * 동일하다: 생산자는 {code, params}만 방출하고(throw는 message = 코드
 * 문자열, 경고·후보 결과는 params 필드), 표시는 이 모듈의 리졸버로만
 * 해석한다. ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규
 * 번역이다. 경고 코드는 생산자의 기존 대문자 코드를 그대로 키로 쓴다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type { StudioPromisePayoffError } from "../studio-promise-payoff-ledger-error";
import type {
  StudioPromisePayoffRecapCandidate,
  StudioPromisePayoffWarning,
  StudioPromisePayoffWarningCode,
} from "../studio-promise-payoff-ledger";

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
  "studio.producerError.promise.idCreationFailed": "약속 원장에 사용할 안정 ID를 만들 수 없어요.",
  "studio.producerError.promise.linkIdCreationFailed": "약속 연결에 사용할 안정 ID를 만들 수 없어요.",
  "studio.producerError.promise.invalidEpisode": "현재 작업 회차를 1 이상의 정수로 입력하세요.",
  "studio.producerError.promise.tooManyEntries": "약속 원장은 최대 {max}개까지 저장할 수 있어요.",
  "studio.producerError.promise.duplicateId": "이미 사용 중인 약속 원장 ID예요.",
  "studio.producerError.promise.normalizeFailed": "약속 원장 항목을 정규화하지 못했어요.",
  "studio.producerError.promise.invalidPatch": "올바르지 않은 약속 원장 수정 내용이에요.",
  "studio.producerError.promise.forbiddenField": "수정할 수 없는 약속 원장 필드예요: {field}",
  "studio.producerError.promise.warning.MISSING_SEED": "“{label}”의 첫 약속 회차·컷이 연결되지 않았습니다.",
  "studio.producerError.promise.warning.MISSING_FORESHADOW": "“{label}”의 중간 단서가 아직 연결되지 않았습니다.",
  "studio.producerError.promise.warning.MISSING_PAYOFF": "“{label}”의 회수 회차·컷이 연결되지 않았습니다.",
  "studio.producerError.promise.warning.MISSING_INTENTIONAL_REASON": "“{label}”을 의도적으로 미회수한 이유를 기록하세요.",
  "studio.producerError.promise.warning.UNSCHEDULED_PAYOFF": "“{label}”의 회수 예정 회차가 없습니다.",
  "studio.producerError.promise.warning.DUE_SOON": "“{label}”의 회수 마감이 {dueEpisode}화로 가까워졌습니다.",
  "studio.producerError.promise.warning.DUE_NOW": "“{label}”의 회수 마감이 현재 {currentEpisode}화입니다.",
  "studio.producerError.promise.warning.OVERDUE": "“{label}”의 회수 마감 {dueEpisode}화가 지났습니다.",
  "studio.producerError.promise.warning.PAYOFF_BEFORE_SEED": "“{label}”의 회수 회차가 첫 약속보다 앞섭니다.",
  "studio.producerError.promise.warning.FORESHADOW_BEFORE_SEED": "“{label}”의 {episode}화 단서가 첫 약속보다 앞섭니다.",
  "studio.producerError.promise.warning.FORESHADOW_AFTER_PAYOFF": "“{label}”의 {episode}화 단서가 회수 뒤에 놓였습니다.",
  "studio.producerError.promise.recapGap": "“{label}”: 마지막 설명은 {lastExplainedEpisode}화, 다음 등장은 {appearanceEpisode}화로 {gapEpisodes}화 간격입니다. 처음 보는 독자를 위해 짧은 리캡을 검토하세요.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.promise.idCreationFailed": "Could not create a stable ID for the promise ledger.",
  "studio.producerError.promise.linkIdCreationFailed": "Could not create a stable ID for the promise link.",
  "studio.producerError.promise.invalidEpisode": "Enter the current working episode as an integer of 1 or more.",
  "studio.producerError.promise.tooManyEntries": "The promise ledger can store at most {max} entries.",
  "studio.producerError.promise.duplicateId": "This promise ledger ID is already in use.",
  "studio.producerError.promise.normalizeFailed": "Could not normalize the promise ledger entry.",
  "studio.producerError.promise.invalidPatch": "The promise ledger edit is invalid.",
  "studio.producerError.promise.forbiddenField": "This promise ledger field cannot be edited: {field}",
  "studio.producerError.promise.warning.MISSING_SEED": "The first promise episode/cut for “{label}” is not linked yet.",
  "studio.producerError.promise.warning.MISSING_FORESHADOW": "The intermediate clue for “{label}” is not linked yet.",
  "studio.producerError.promise.warning.MISSING_PAYOFF": "The payoff episode/cut for “{label}” is not linked yet.",
  "studio.producerError.promise.warning.MISSING_INTENTIONAL_REASON": "Record why “{label}” is intentionally left unpaid.",
  "studio.producerError.promise.warning.UNSCHEDULED_PAYOFF": "There is no scheduled payoff episode for “{label}”.",
  "studio.producerError.promise.warning.DUE_SOON": "The payoff deadline for “{label}” is approaching at episode {dueEpisode}.",
  "studio.producerError.promise.warning.DUE_NOW": "The payoff deadline for “{label}” is the current episode {currentEpisode}.",
  "studio.producerError.promise.warning.OVERDUE": "The payoff deadline for “{label}” (episode {dueEpisode}) has passed.",
  "studio.producerError.promise.warning.PAYOFF_BEFORE_SEED": "The payoff episode for “{label}” comes before its first promise.",
  "studio.producerError.promise.warning.FORESHADOW_BEFORE_SEED": "The episode {episode} clue for “{label}” comes before its first promise.",
  "studio.producerError.promise.warning.FORESHADOW_AFTER_PAYOFF": "The episode {episode} clue for “{label}” is placed after the payoff.",
  "studio.producerError.promise.recapGap": "“{label}”: the last explanation was episode {lastExplainedEpisode}, and the next appearance is episode {appearanceEpisode}, a gap of {gapEpisodes} episodes. Consider a short recap for first-time readers.",
});

const PROMISE_ERROR_KEYS: Readonly<Record<StudioPromisePayoffError["code"], string>> = {
  idCreationFailed: "studio.producerError.promise.idCreationFailed",
  linkIdCreationFailed: "studio.producerError.promise.linkIdCreationFailed",
  invalidEpisode: "studio.producerError.promise.invalidEpisode",
  tooManyEntries: "studio.producerError.promise.tooManyEntries",
  duplicateId: "studio.producerError.promise.duplicateId",
  normalizeFailed: "studio.producerError.promise.normalizeFailed",
  invalidPatch: "studio.producerError.promise.invalidPatch",
  forbiddenField: "studio.producerError.promise.forbiddenField",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const PROMISE_ERROR_KO: Readonly<Record<StudioPromisePayoffError["code"], string>> = {
  idCreationFailed: "약속 원장에 사용할 안정 ID를 만들 수 없어요.",
  linkIdCreationFailed: "약속 연결에 사용할 안정 ID를 만들 수 없어요.",
  invalidEpisode: "현재 작업 회차를 1 이상의 정수로 입력하세요.",
  tooManyEntries: "약속 원장은 최대 {max}개까지 저장할 수 있어요.",
  duplicateId: "이미 사용 중인 약속 원장 ID예요.",
  normalizeFailed: "약속 원장 항목을 정규화하지 못했어요.",
  invalidPatch: "올바르지 않은 약속 원장 수정 내용이에요.",
  forbiddenField: "수정할 수 없는 약속 원장 필드예요: {field}",
};

const PROMISE_WARNING_KEYS: Readonly<Record<StudioPromisePayoffWarningCode, string>> = {
  MISSING_SEED: "studio.producerError.promise.warning.MISSING_SEED",
  MISSING_FORESHADOW: "studio.producerError.promise.warning.MISSING_FORESHADOW",
  MISSING_PAYOFF: "studio.producerError.promise.warning.MISSING_PAYOFF",
  MISSING_INTENTIONAL_REASON: "studio.producerError.promise.warning.MISSING_INTENTIONAL_REASON",
  UNSCHEDULED_PAYOFF: "studio.producerError.promise.warning.UNSCHEDULED_PAYOFF",
  DUE_SOON: "studio.producerError.promise.warning.DUE_SOON",
  DUE_NOW: "studio.producerError.promise.warning.DUE_NOW",
  OVERDUE: "studio.producerError.promise.warning.OVERDUE",
  PAYOFF_BEFORE_SEED: "studio.producerError.promise.warning.PAYOFF_BEFORE_SEED",
  FORESHADOW_BEFORE_SEED: "studio.producerError.promise.warning.FORESHADOW_BEFORE_SEED",
  FORESHADOW_AFTER_PAYOFF: "studio.producerError.promise.warning.FORESHADOW_AFTER_PAYOFF",
};

const PROMISE_WARNING_KO: Readonly<Record<StudioPromisePayoffWarningCode, string>> = {
  MISSING_SEED: "“{label}”의 첫 약속 회차·컷이 연결되지 않았습니다.",
  MISSING_FORESHADOW: "“{label}”의 중간 단서가 아직 연결되지 않았습니다.",
  MISSING_PAYOFF: "“{label}”의 회수 회차·컷이 연결되지 않았습니다.",
  MISSING_INTENTIONAL_REASON: "“{label}”을 의도적으로 미회수한 이유를 기록하세요.",
  UNSCHEDULED_PAYOFF: "“{label}”의 회수 예정 회차가 없습니다.",
  DUE_SOON: "“{label}”의 회수 마감이 {dueEpisode}화로 가까워졌습니다.",
  DUE_NOW: "“{label}”의 회수 마감이 현재 {currentEpisode}화입니다.",
  OVERDUE: "“{label}”의 회수 마감 {dueEpisode}화가 지났습니다.",
  PAYOFF_BEFORE_SEED: "“{label}”의 회수 회차가 첫 약속보다 앞섭니다.",
  FORESHADOW_BEFORE_SEED: "“{label}”의 {episode}화 단서가 첫 약속보다 앞섭니다.",
  FORESHADOW_AFTER_PAYOFF: "“{label}”의 {episode}화 단서가 회수 뒤에 놓였습니다.",
};

const PROMISE_RECAP_KEY = "studio.producerError.promise.recapGap";
const PROMISE_RECAP_KO =
  "“{label}”: 마지막 설명은 {lastExplainedEpisode}화, 다음 등장은 {appearanceEpisode}화로 {gapEpisodes}화 간격입니다. 처음 보는 독자를 위해 짧은 리캡을 검토하세요.";

/** 표시 지점 전용 해석 (promise throw). */
export function resolveStudioPromisePayoffError(error: StudioPromisePayoffError): string {
  return resolveProducerError(PROMISE_ERROR_KEYS[error.code], PROMISE_ERROR_KO[error.code], error.params);
}

/** 표시 지점 전용 해석 (원인 객체 덕 타이핑): 이 생산자가 아닌 원인은 null. */
export function resolveStudioPromisePayoffErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code } = cause as { name?: unknown; code?: unknown };
  if (name !== "StudioPromisePayoffError" || typeof code !== "string") return null;
  if (!Object.hasOwn(PROMISE_ERROR_KEYS, code)) return null;
  return resolveStudioPromisePayoffError(cause as StudioPromisePayoffError);
}

/** 표시 지점 전용 해석 (promise 진단 경고): 패널 경고 목록·타당성 어댑터가 부른다. */
export function resolveStudioPromisePayoffWarning(warning: StudioPromisePayoffWarning): string {
  return resolveProducerError(
    PROMISE_WARNING_KEYS[warning.code],
    PROMISE_WARNING_KO[warning.code],
    warning.params,
  );
}

/** 표시 지점 전용 해석 (promise 리캡 후보): 패널 후보 목록이 부른다. */
export function resolveStudioPromisePayoffRecapCandidate(
  candidate: StudioPromisePayoffRecapCandidate,
): string {
  return resolveProducerError(PROMISE_RECAP_KEY, PROMISE_RECAP_KO, candidate.params);
}
