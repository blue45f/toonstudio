/**
 * 컷 가져오기 화면의 공통 문구 도우미 — 오류 코드·경고 코드·손실 보고 항목을 번역 키로 풀어 쓴다.
 *
 * 문구의 정본은 public/i18n/app/panelImport/{ko,en}.json 이다(apps/web/I18N_GUIDE.md). 이 파일은 코드 → 키 대응과 값 자리표시
 * ({name} 등) 채우기만 한다. 값(파일 이름·행 번호·컷 번호…)은 번역된 문장에 끼우는 쪽이라 번역 서비스로 나가는 원문에는 섞이지
 * 않는다. 알고리즘·계획 모듈은 코드와 수치만 돌려주고, 사용자에게 보이는 문장은 모두 이 사전을 거친다.
 *
 * 모든 코드 표는 `Record<Code, 키>` 라서 코드가 늘어나면 컴파일러가 빠진 문구를 알려 주고, ui/panel-import-copy.test.ts 와
 * ui/panel-import-i18n-contract.test.ts 가 표의 키가 사전에 있는지 확인한다.
 */

import { getLang } from "@/shared/lib/i18n";

import { CardBundleError } from "../panel-card-export";
import { CardSliceError, type CardCutKind, type CardSliceErrorCode, type CardSliceWarning } from "../panel-card-slice-types";
import {
  PanelDetectError,
  type PanelConfidenceLevel,
  type PanelDetectErrorCode,
  type PanelDetectSensitivity,
  type PanelDetectWarningCode,
  type PanelReadingOrder,
  type PanelWarningCode,
} from "../panel-detect-types";
import "../panel-import-i18n";
import { PanelImportRightsError } from "../panel-import-rights";
import { PanelRenderError, type PanelRenderErrorCode } from "../panel-render-core";
import { PanelReflowError, type PanelReflowErrorCode, type ReflowLossItem } from "../panel-reflow-plan";
import { PanelSourceError, type PanelSourceErrorCode } from "../panel-source-image";
import { PanelStudioDocumentError } from "../panel-studio-document";
import { PanelStudioHandoffError } from "../panel-studio-handoff";

import type { PanelT } from "./use-panel-t";

export type { PanelT };

/** 숫자를 천 단위 쉼표로 쓴다. 한글 화면은 ko-KR, 그 밖은 en-US(정수에서는 둘의 모양이 같다). */
export function formatPanelNumber(value: number): string {
  return value.toLocaleString(getLang().split("-")[0]?.toLowerCase() === "ko" ? "ko-KR" : "en-US");
}

// ── 원고 읽기 ────────────────────────────────────────────────────────────

const SOURCE_ERROR_KEYS: Readonly<Record<Exclude<PanelSourceErrorCode, "too-many-pixels">, string>> = {
  empty: "panelImport.sourceError.empty",
  "file-too-large": "panelImport.sourceError.fileTooLarge",
  "unsupported-format": "panelImport.sourceError.unsupportedFormat",
  "decode-failed": "panelImport.sourceError.decodeFailed",
  cancelled: "panelImport.sourceError.cancelled",
};

export function sourceErrorText(t: PanelT, error: unknown): string {
  // 권리 확인 없이 다시 시도한 경우(파일을 읽기 전에 거절): 일반 오류가 아니라 무엇을 해야 하는지 알려 준다.
  if (error instanceof PanelImportRightsError && error.code === "not-confirmed") return t("panelImport.sourceError.rightsNotConfirmed");
  if (!(error instanceof PanelSourceError)) return t("panelImport.error.generic");
  if (error.code === "too-many-pixels") {
    const limit = error.detail.megapixels ?? 0;
    const actual = Math.round((error.detail.pixels ?? 0) / 100_000) / 10;
    return t("panelImport.sourceError.tooManyPixels", { actual, limit });
  }
  return t(SOURCE_ERROR_KEYS[error.code]);
}

// ── 컷 감지 ──────────────────────────────────────────────────────────────

const DETECT_ERROR_KEYS: Readonly<Record<PanelDetectErrorCode, string>> = {
  "invalid-input": "panelImport.detectError.invalidInput",
  "invalid-options": "panelImport.detectError.invalidOptions",
  "too-large": "panelImport.detectError.tooLarge",
  "too-many-panels": "panelImport.detectError.tooManyPanels",
  cancelled: "panelImport.detectError.cancelled",
  timeout: "panelImport.detectError.timeout",
  "worker-unavailable": "panelImport.detectError.workerUnavailable",
  "worker-failed": "panelImport.detectError.workerFailed",
  "worker-protocol": "panelImport.detectError.workerProtocol",
};

export function detectErrorText(t: PanelT, error: unknown): string {
  if (error instanceof PanelDetectError) return t(DETECT_ERROR_KEYS[error.code]);
  if (error instanceof PanelSourceError) return sourceErrorText(t, error);
  return t("panelImport.error.generic");
}

const READING_ORDER_KEYS: Readonly<Record<PanelReadingOrder, string>> = {
  manga: "panelImport.readingOrder.manga",
  comic: "panelImport.readingOrder.comic",
  webtoon: "panelImport.readingOrder.webtoon",
};
export const readingOrderLabel = (t: PanelT, value: PanelReadingOrder): string => t(READING_ORDER_KEYS[value]);

const SENSITIVITY_KEYS: Readonly<Record<PanelDetectSensitivity, string>> = {
  fine: "panelImport.sensitivity.fine",
  normal: "panelImport.sensitivity.normal",
  coarse: "panelImport.sensitivity.coarse",
};
export const sensitivityLabel = (t: PanelT, value: PanelDetectSensitivity): string => t(SENSITIVITY_KEYS[value]);

const CONFIDENCE_KEYS: Readonly<Record<PanelConfidenceLevel, string>> = {
  high: "panelImport.confidence.high",
  medium: "panelImport.confidence.medium",
  low: "panelImport.confidence.low",
};
export const confidenceLabel = (t: PanelT, level: PanelConfidenceLevel): string => t(CONFIDENCE_KEYS[level]);

const PANEL_WARNING_KEYS: Readonly<Record<PanelWarningCode, string>> = {
  "overlap-suspected": "panelImport.panelWarning.overlapSuspected",
  "merged-panels-suspected": "panelImport.panelWarning.mergedPanelsSuspected",
  "bridged-gutter-suspected": "panelImport.panelWarning.bridgedGutterSuspected",
  "max-depth-reached": "panelImport.panelWarning.maxDepthReached",
  "touches-image-edge": "panelImport.panelWarning.touchesImageEdge",
  "no-gutter-found": "panelImport.panelWarning.noGutterFound",
};
export const panelWarningText = (t: PanelT, code: PanelWarningCode): string => t(PANEL_WARNING_KEYS[code]);

const DETECT_WARNING_KEYS: Readonly<Record<PanelDetectWarningCode, string>> = {
  "blank-image": "panelImport.detectWarning.blankImage",
  "no-gutter-found": "panelImport.detectWarning.noGutterFound",
  "no-panel-found": "panelImport.detectWarning.noPanelFound",
  downsampled: "panelImport.detectWarning.downsampled",
  "undetectable-regions": "panelImport.detectWarning.undetectableRegions",
  "ignored-fragments": "panelImport.detectWarning.ignoredFragments",
  "max-depth-reached": "panelImport.detectWarning.maxDepthReached",
  "low-overall-confidence": "panelImport.detectWarning.lowOverallConfidence",
};
export const detectWarningText = (t: PanelT, code: PanelDetectWarningCode): string => t(DETECT_WARNING_KEYS[code]);

// ── 재배열·삽입 ──────────────────────────────────────────────────────────

const REFLOW_ERROR_KEYS: Readonly<Record<PanelReflowErrorCode, string>> = {
  "no-panels": "panelImport.reflowError.noPanels",
  "invalid-options": "panelImport.reflowError.invalidOptions",
  "invalid-panel": "panelImport.reflowError.invalidPanel",
  "panel-too-tall": "panelImport.reflowError.panelTooTall",
  "too-many-pages": "panelImport.reflowError.tooManyPages",
  "output-too-large": "panelImport.reflowError.outputTooLarge",
};

/** 몇 번째 이미지인지 아는 오류(subject > 0)와 모르는 오류의 문구를 가른다. */
function renderFailureText(t: PanelT, code: PanelRenderErrorCode, subject: number): string {
  switch (code) {
    case "cancelled":
      return t("panelImport.renderError.cancelled");
    case "surface-unavailable":
      return subject > 0 ? t("panelImport.renderError.surfaceUnavailable", { subject }) : t("panelImport.renderError.surfaceUnavailableAny");
    case "encode-failed":
      return subject > 0 ? t("panelImport.renderError.encodeFailed", { subject }) : t("panelImport.renderError.encodeFailedAny");
    case "too-large-for-studio":
      return t("panelImport.renderError.tooLargeForStudio", { subject });
  }
}

export function renderErrorText(t: PanelT, error: unknown): string {
  if (error instanceof PanelRenderError) return renderFailureText(t, error.code, error.subject);
  if (error instanceof PanelReflowError) return t(REFLOW_ERROR_KEYS[error.code]);
  if (error instanceof PanelStudioHandoffError) {
    return error.code === "too-large" ? t("panelImport.handoffError.tooLarge") : t("panelImport.handoffError.failed");
  }
  if (error instanceof PanelStudioDocumentError) return t("panelImport.documentError.failed");
  if (error instanceof PanelImportRightsError) return t("panelImport.rightsError.required");
  return t("panelImport.error.generic");
}

/** 손실 보고 항목의 수치를 문장에 끼운다. 항목 코드마다 문장 하나, 수치는 자리표시로 들어간다. */
export function lossItemText(t: PanelT, item: ReflowLossItem): string {
  const values = item.values;
  switch (item.code) {
    case "source-untouched":
      return t("panelImport.loss.sourceUntouched");
    case "outside-cuts-dropped":
      return t("panelImport.loss.outsideCutsDropped", { percent: values.percent ?? 0 });
    case "upscaled":
      return t("panelImport.loss.upscaled", { count: values.count ?? 0, maxScale: values.maxScale ?? 0 });
    case "downscaled":
      return t("panelImport.loss.downscaled", { count: values.count ?? 0, minScale: values.minScale ?? 0 });
    case "recompressed-lossless":
      return t("panelImport.loss.recompressedLossless");
    case "recompressed-lossy":
      return t("panelImport.loss.recompressedLossy");
    case "transparency-flattened":
      return t("panelImport.loss.transparencyFlattened");
    case "cuts-overlap":
      return t("panelImport.loss.cutsOverlap", { pairs: values.pairs ?? 0 });
    case "centered-in-document":
      return t("panelImport.loss.centeredInDocument", { offset: values.offset ?? 0 });
    case "split-into-pages":
      return t("panelImport.loss.splitIntoPages", { pages: values.pages ?? 0 });
    case "undetectable-excluded":
      return t("panelImport.loss.undetectableExcluded", { count: values.count ?? 0 });
    case "ignored-excluded":
      return t("panelImport.loss.ignoredExcluded", { count: values.count ?? 0 });
    case "low-confidence-cuts":
      return t("panelImport.loss.lowConfidenceCuts", { count: values.count ?? 0 });
  }
}

// ── 카드뉴스 ─────────────────────────────────────────────────────────────

const CARD_ERROR_KEYS: Readonly<Record<CardSliceErrorCode, string>> = {
  "invalid-input": "panelImport.cardError.invalidInput",
  "invalid-options": "panelImport.cardError.invalidOptions",
  "too-many-cards": "panelImport.cardError.tooManyCards",
  cancelled: "panelImport.cardError.cancelled",
  timeout: "panelImport.cardError.timeout",
};

export function cardErrorText(t: PanelT, error: unknown): string {
  if (error instanceof CardSliceError) return t(CARD_ERROR_KEYS[error.code]);
  if (error instanceof CardBundleError) {
    if (error.code === "cancelled") return t("panelImport.bundleError.cancelled");
    if (error.code === "archive-failed") return t("panelImport.bundleError.archiveFailed");
    return t("panelImport.bundleError.mismatch");
  }
  if (error instanceof PanelRenderError) return renderErrorText(t, error);
  if (error instanceof PanelSourceError) return sourceErrorText(t, error);
  return t("panelImport.error.generic");
}

const CUT_KIND_KEYS: Readonly<Record<CardCutKind, string>> = {
  clean: "panelImport.cutKind.clean",
  soft: "panelImport.cutKind.soft",
  content: "panelImport.cutKind.content",
};
export const cutKindText = (t: PanelT, kind: CardCutKind): string => t(CUT_KIND_KEYS[kind]);

export function cardWarningText(t: PanelT, code: CardSliceWarning, scale: number): string {
  const rounded = Math.round(scale * 100) / 100;
  switch (code) {
    case "content-cuts":
      return t("panelImport.cardWarning.contentCuts");
    case "upscaled":
      return t("panelImport.cardWarning.upscaled", { scale: rounded });
    case "downscaled":
      return t("panelImport.cardWarning.downscaled", { scale: rounded });
    case "over-carousel-limit":
      return t("panelImport.cardWarning.overCarouselLimit");
  }
}
