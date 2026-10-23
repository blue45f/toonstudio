/**
 * 앵커 연구실 문구 도우미 — 코드(각도·오류·점검 항목·차이 항목)를 번역 키로 풀고, 문구에 끼울 값을 만든다.
 *
 * 상태: current. 키는 모두 이 파일에 문자열 리터럴로 적는다(동적으로 이어 붙이지 않는다). 그래야 시험이 모든 키가
 * 사전(public/i18n/app/anchorLab)에 있고 쓰이지 않는 키가 없음을 정적으로 확인할 수 있다.
 * 사용자 값(파일 이름·앵커 id)은 번역 원문에 섞지 않고 자리표시 값으로만 넘긴다.
 */
import "./anchor-lab-i18n";

import type { AnchorAngleId } from "./anchor-capture-spec";
import { ANCHOR_LIMITS } from "./anchor-capture-spec";
import type { AnchorCompletenessCode, AnchorCompletenessIssue } from "./anchor-capture-set";
import type { AnchorCandidateErrorCode, AnchorCandidateStatus } from "./anchor-candidate-session";
import type { AnchorComparisonLimit, AnchorFeatureId, AnchorScoreBand } from "./anchor-consistency-compare";
import type { AnchorDifference, AnchorDifferenceSeverity } from "./anchor-consistency-differences";
import type { AnchorSortMode } from "./anchor-consistency-score";
import type { AnchorReferenceSkipReason, AnchorReferenceWarning } from "./anchor-reference-pack";
import type { AnchorSlotStatus } from "./anchor-capture-session";
import { ANCHOR_ANALYSIS_LIMITS } from "./anchor-raster";

export type AnchorLabTranslate = (key: string, values?: Readonly<Record<string, string | number>>) => string;
export type AnchorCopyValues = Readonly<Record<string, string | number>>;

export interface AnchorCopy {
  readonly key: string;
  readonly values?: AnchorCopyValues;
}

export const ANGLE_NAME_KEYS: Readonly<Record<AnchorAngleId, string>> = Object.freeze({
  front: "anchorLab.angle.front",
  "left-34": "anchorLab.angle.left34",
  left: "anchorLab.angle.left",
  back: "anchorLab.angle.back",
  right: "anchorLab.angle.right",
  "right-34": "anchorLab.angle.right34",
});

export const SLOT_STATUS_KEYS: Readonly<Record<AnchorSlotStatus, string>> = Object.freeze({
  idle: "anchorLab.slot.status.idle",
  queued: "anchorLab.slot.status.queued",
  capturing: "anchorLab.slot.status.capturing",
  done: "anchorLab.slot.status.done",
  failed: "anchorLab.slot.status.failed",
  cancelled: "anchorLab.slot.status.cancelled",
});

export const CANDIDATE_STATUS_KEYS: Readonly<Record<AnchorCandidateStatus, string>> = Object.freeze({
  queued: "anchorLab.candidates.status.queued",
  analyzing: "anchorLab.candidates.status.analyzing",
  done: "anchorLab.candidates.status.done",
  failed: "anchorLab.candidates.status.failed",
  cancelled: "anchorLab.candidates.status.cancelled",
});

export const SORT_MODE_KEYS: Readonly<Record<AnchorSortMode, string>> = Object.freeze({
  "score-desc": "anchorLab.candidates.sort.scoreDesc",
  "score-asc": "anchorLab.candidates.sort.scoreAsc",
  name: "anchorLab.candidates.sort.name",
  "input-order": "anchorLab.candidates.sort.inputOrder",
  color: "anchorLab.candidates.sort.color",
  palette: "anchorLab.candidates.sort.palette",
  silhouette: "anchorLab.candidates.sort.silhouette",
  structure: "anchorLab.candidates.sort.structure",
});

export const SORT_MODES: readonly AnchorSortMode[] = Object.freeze([
  "score-desc", "score-asc", "name", "input-order", "color", "palette", "silhouette", "structure",
]);

export function isAnchorSortMode(value: string): value is AnchorSortMode {
  return SORT_MODES.some((mode) => mode === value);
}

export const BAND_KEYS: Readonly<Record<AnchorScoreBand, string>> = Object.freeze({
  high: "anchorLab.score.band.high",
  medium: "anchorLab.score.band.medium",
  low: "anchorLab.score.band.low",
});

export const FEATURE_KEYS: Readonly<Record<AnchorFeatureId, string>> = Object.freeze({
  color: "anchorLab.feature.color",
  palette: "anchorLab.feature.palette",
  silhouette: "anchorLab.feature.silhouette",
  structure: "anchorLab.feature.structure",
});

export const COMPARISON_LIMIT_KEYS: Readonly<Record<AnchorComparisonLimit, string>> = Object.freeze({
  "anchor-not-separated": "anchorLab.score.limit.anchorNotSeparated",
  "candidate-not-separated": "anchorLab.score.limit.candidateNotSeparated",
  "anchor-low-contrast": "anchorLab.score.limit.anchorLowContrast",
  "candidate-low-contrast": "anchorLab.score.limit.candidateLowContrast",
  "tiny-subject": "anchorLab.score.limit.tinySubject",
});

export const DIFFERENCE_SEVERITY_KEYS: Readonly<Record<AnchorDifferenceSeverity, string>> = Object.freeze({
  major: "anchorLab.diff.severity.major",
  notice: "anchorLab.diff.severity.notice",
  info: "anchorLab.diff.severity.info",
});

const COMPLETENESS_ISSUE_KEYS: Readonly<Record<AnchorCompletenessCode, string>> = Object.freeze({
  "missing-angle": "anchorLab.completeness.issue.missingAngle",
  "missing-mirror-pair": "anchorLab.completeness.issue.missingMirrorPair",
  "size-mismatch": "anchorLab.completeness.issue.sizeMismatch",
  "aspect-off-convention": "anchorLab.completeness.issue.aspectOffConvention",
  "below-recommended-size": "anchorLab.completeness.issue.belowRecommendedSize",
  "duplicate-image": "anchorLab.completeness.issue.duplicateImage",
});

const SKIP_REASON_KEYS: Readonly<Record<AnchorReferenceSkipReason, string>> = Object.freeze({
  "role-limit": "anchorLab.pack.reason.roleLimit",
  "provider-limit": "anchorLab.pack.reason.providerLimit",
  "pair-rule": "anchorLab.pack.reason.pairRule",
  "byte-budget": "anchorLab.pack.reason.byteBudget",
  "invalid-shot": "anchorLab.pack.reason.invalidShot",
  "duplicate-content": "anchorLab.pack.reason.duplicateContent",
});

/** 참조 팩 경고 중 이 화면이 보여 주는 것. 나머지(기존 참조 크기 모름·이전 항목 교체)는 연구실에서 생기지 않는다. */
const PACK_WARNING_KEYS: Partial<Readonly<Record<AnchorReferenceWarning["code"], string>>> = Object.freeze({
  "missing-front": "anchorLab.pack.warning.missingFront",
  "missing-mirror-pair": "anchorLab.pack.warning.missingMirrorPair",
});

const CAPTURE_ERROR_KEYS: Readonly<Record<AnchorCandidateErrorCode, string>> = Object.freeze({
  cancelled: "anchorLab.captureError.cancelled",
  timeout: "anchorLab.captureError.timeout",
  "file-empty": "anchorLab.captureError.fileEmpty",
  "file-too-large": "anchorLab.captureError.fileTooLarge",
  "unsupported-format": "anchorLab.captureError.unsupportedFormat",
  "invalid-dimensions": "anchorLab.captureError.invalidDimensions",
  "image-too-small": "anchorLab.captureError.imageTooSmall",
  "image-too-large": "anchorLab.captureError.imageTooLarge",
  "decode-failed": "anchorLab.captureError.decodeFailed",
  "source-unavailable": "anchorLab.captureError.sourceUnavailable",
  "source-failed": "anchorLab.captureError.sourceFailed",
  "invalid-raster": "anchorLab.captureError.invalidRaster",
  "raster-too-small": "anchorLab.captureError.rasterTooSmall",
  "raster-too-large": "anchorLab.captureError.rasterTooLarge",
  "empty-image": "anchorLab.captureError.emptyImage",
  "worker-unavailable": "anchorLab.captureError.analysisHelper",
  "worker-failed": "anchorLab.captureError.analysisHelper",
  "worker-protocol": "anchorLab.captureError.analysisHelper",
});

/** 차이 항목의 번역 키. 항목 id 와 갈래(variant)마다 키가 하나씩 있다. */
const DIFFERENCE_KEYS: Readonly<Record<string, string>> = Object.freeze({
  "lightness:brighter": "anchorLab.diff.lightness.brighter",
  "lightness:darker": "anchorLab.diff.lightness.darker",
  "chroma:more": "anchorLab.diff.chroma.more",
  "chroma:less": "anchorLab.diff.chroma.less",
  hue: "anchorLab.diff.hue",
  "palette-missing": "anchorLab.diff.paletteMissing",
  "palette-extra": "anchorLab.diff.paletteExtra",
  "subject-scale:larger": "anchorLab.diff.subjectScale.larger",
  "subject-scale:smaller": "anchorLab.diff.subjectScale.smaller",
  "proportion:wider": "anchorLab.diff.proportion.wider",
  "proportion:narrower": "anchorLab.diff.proportion.narrower",
  position: "anchorLab.diff.position",
  silhouette: "anchorLab.diff.silhouette",
  structure: "anchorLab.diff.structure",
  "near-duplicate": "anchorLab.diff.nearDuplicate",
  "subject-not-separated:both": "anchorLab.diff.subjectNotSeparated.both",
  "subject-not-separated:anchor": "anchorLab.diff.subjectNotSeparated.anchor",
  "subject-not-separated:candidate": "anchorLab.diff.subjectNotSeparated.candidate",
});

const MB = 1024 * 1024;

/** 바이트를 MB 문자열로(소수 첫째 자리). */
export function formatMegabytes(bytes: number): string {
  return (Math.round((bytes / MB) * 10) / 10).toString();
}

/** 사람이 읽는 파일 크기("812KB" 또는 "3.2MB"). 단위는 숫자 표기라 번역하지 않는다. */
export function formatFileSize(bytes: number): string {
  return bytes >= MB ? `${formatMegabytes(bytes)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export function angleNameCopy(angleId: AnchorAngleId): AnchorCopy {
  return { key: ANGLE_NAME_KEYS[angleId] };
}

/** 읽기·분석 오류 코드를 문구로 푼다. 수치 파라미터는 사용자 문자열이 아니라 숫자만 받는다. */
export function captureErrorCopy(code: AnchorCandidateErrorCode, params: Readonly<Record<string, number>> = {}): AnchorCopy {
  const values: Record<string, string | number> = {};
  if (code === "file-too-large") {
    values.size = formatMegabytes(params.bytes ?? 0);
    values.max = formatMegabytes(params.max ?? ANCHOR_LIMITS.maxImageBytes);
  } else if (code === "image-too-small") {
    values.width = params.width ?? 0;
    values.height = params.height ?? 0;
    values.min = params.min ?? ANCHOR_LIMITS.minEdgePx;
  } else if (code === "image-too-large") {
    values.width = params.width ?? 0;
    values.height = params.height ?? 0;
    values.max = params.max ?? ANCHOR_LIMITS.maxEdgePx;
  } else if (code === "raster-too-small") {
    values.min = ANCHOR_ANALYSIS_LIMITS.minEdge;
  }
  return { key: CAPTURE_ERROR_KEYS[code], values };
}

/** 세트 점검 항목을 문구로 푼다. 각도 이름은 호출자가 번역해 넘긴다. */
export function completenessIssueCopy(issue: AnchorCompletenessIssue, t: AnchorLabTranslate): AnchorCopy {
  const values: Record<string, string | number> = { angle: t(ANGLE_NAME_KEYS[issue.angleId]) };
  if (issue.relatedAngleId) values.related = t(ANGLE_NAME_KEYS[issue.relatedAngleId]);
  for (const [name, value] of Object.entries(issue.params ?? {})) values[name] = value;
  return { key: COMPLETENESS_ISSUE_KEYS[issue.code], values };
}

export function skipReasonCopy(reason: AnchorReferenceSkipReason, maxPerRole: number, maxTotal: number): AnchorCopy {
  const values: Record<string, string | number> = {};
  if (reason === "role-limit") values.max = maxPerRole;
  if (reason === "provider-limit") values.max = maxTotal;
  return { key: SKIP_REASON_KEYS[reason], values };
}

/** 이 화면이 보여 주는 참조 팩 경고만 문구로 푼다. 보여 주지 않는 경고는 null. */
export function packWarningCopy(warning: AnchorReferenceWarning, t: AnchorLabTranslate): AnchorCopy | null {
  const key = PACK_WARNING_KEYS[warning.code];
  if (!key) return null;
  const values: Record<string, string | number> = {};
  if (warning.angleId) values.angle = t(ANGLE_NAME_KEYS[warning.angleId]);
  if (warning.relatedAngleId) values.related = t(ANGLE_NAME_KEYS[warning.relatedAngleId]);
  return { key, values };
}

/** "무엇이 달랐나" 항목을 문구로 푼다. 값은 숫자와 #rrggbb 색 문자열뿐이다. */
export function differenceCopy(difference: AnchorDifference): AnchorCopy {
  const lookup = difference.variant ? `${difference.id}:${difference.variant}` : difference.id;
  const key = DIFFERENCE_KEYS[lookup] ?? DIFFERENCE_KEYS[difference.id];
  return { key: key ?? "anchorLab.diff.none", values: difference.params };
}

export function resolveCopy(t: AnchorLabTranslate, copy: AnchorCopy): string {
  return copy.values ? t(copy.key, copy.values) : t(copy.key);
}
