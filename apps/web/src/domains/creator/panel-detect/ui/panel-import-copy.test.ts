// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

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
import { PanelImportRightsError } from "../panel-import-rights";
import { PanelRenderError, type PanelRenderErrorCode } from "../panel-render-core";
import { PanelReflowError, type PanelReflowErrorCode, type ReflowLossCode } from "../panel-reflow-plan";
import { PanelSourceError, type PanelSourceErrorCode } from "../panel-source-image";
import { PanelStudioDocumentError } from "../panel-studio-document";
import { PanelStudioHandoffError } from "../panel-studio-handoff";

import {
  cardErrorText,
  cardWarningText,
  confidenceLabel,
  cutKindText,
  detectErrorText,
  detectWarningText,
  lossItemText,
  panelWarningText,
  readingOrderLabel,
  renderErrorText,
  sensitivityLabel,
  sourceErrorText,
} from "./panel-import-copy";

const HANGUL = /[ㄱ-ㆎ가-힣]/u;

/** 코드 표를 `Record<Code, true>` 로 적게 해서, 코드가 늘면 이 시험도 컴파일 단계에서 갱신하게 한다. */
function codesOf<T extends string>(table: Readonly<Record<T, true>>): readonly T[] {
  return Object.keys(table).filter((key): key is T => key in table);
}

const SOURCE_CODES = codesOf<PanelSourceErrorCode>({ empty: true, "file-too-large": true, "unsupported-format": true, "too-many-pixels": true, "decode-failed": true, cancelled: true });
const DETECT_CODES = codesOf<PanelDetectErrorCode>({
  "invalid-input": true,
  "invalid-options": true,
  "too-large": true,
  "too-many-panels": true,
  cancelled: true,
  timeout: true,
  "worker-unavailable": true,
  "worker-failed": true,
  "worker-protocol": true,
});
const PANEL_WARNINGS = codesOf<PanelWarningCode>({
  "overlap-suspected": true,
  "bridged-gutter-suspected": true,
  "merged-panels-suspected": true,
  "max-depth-reached": true,
  "touches-image-edge": true,
  "no-gutter-found": true,
});
const DETECT_WARNINGS = codesOf<PanelDetectWarningCode>({
  "blank-image": true,
  "no-gutter-found": true,
  "no-panel-found": true,
  downsampled: true,
  "undetectable-regions": true,
  "ignored-fragments": true,
  "max-depth-reached": true,
  "low-overall-confidence": true,
});
const REFLOW_CODES = codesOf<PanelReflowErrorCode>({ "no-panels": true, "invalid-options": true, "invalid-panel": true, "panel-too-tall": true, "too-many-pages": true, "output-too-large": true });
const RENDER_CODES = codesOf<PanelRenderErrorCode>({ cancelled: true, "surface-unavailable": true, "encode-failed": true, "too-large-for-studio": true });
const LOSS_CODES = codesOf<ReflowLossCode>({
  "source-untouched": true,
  "outside-cuts-dropped": true,
  upscaled: true,
  downscaled: true,
  "recompressed-lossless": true,
  "recompressed-lossy": true,
  "cuts-overlap": true,
  "centered-in-document": true,
  "split-into-pages": true,
  "undetectable-excluded": true,
  "ignored-excluded": true,
  "low-confidence-cuts": true,
});
const CARD_CODES = codesOf<CardSliceErrorCode>({ "invalid-input": true, "invalid-options": true, "too-many-cards": true, cancelled: true, timeout: true });
const CARD_WARNINGS = codesOf<CardSliceWarning>({ "content-cuts": true, upscaled: true, downscaled: true, "over-carousel-limit": true });
const CUT_KINDS = codesOf<CardCutKind>({ clean: true, soft: true, content: true });
const READING_ORDERS = codesOf<PanelReadingOrder>({ manga: true, comic: true, webtoon: true });
const SENSITIVITIES = codesOf<PanelDetectSensitivity>({ fine: true, normal: true, coarse: true });
const CONFIDENCES = codesOf<PanelConfidenceLevel>({ high: true, medium: true, low: true });

/** 비어 있지 않고, 채워지지 않은 값 흔적(undefined·NaN·[object])이 없는 문장인가. */
function expectReadable(text: string, minimum: number): void {
  expect(text.trim().length).toBeGreaterThanOrEqual(minimum);
  expect(text).not.toMatch(/undefined|NaN|\[object|\{\}|null/u);
}

function inBothLanguages(check: (language: "ko" | "en") => void): void {
  for (const language of ["ko", "en"] as const) {
    useI18n.getState().setLang(language);
    check(language);
  }
}

/** 문장은 6자 이상, 짧은 이름표(보통·Normal 등)는 2자 이상이면 읽을 수 있는 문구로 본다. */
function expectLanguage(text: string, language: "ko" | "en", minimum = 6): void {
  expectReadable(text, minimum);
  if (language === "ko") expect(text).toMatch(HANGUL);
  else {
    expect(text).not.toMatch(HANGUL);
    expect(text).toMatch(/[A-Za-z]{3}/u);
  }
}

beforeEach(() => { useI18n.getState().setLang("ko"); });
afterEach(() => { useI18n.getState().setLang("ko"); });

describe("컷 가져오기 문구 — 모든 코드가 한글·영문으로 풀린다", () => {
  it("원고 읽기 오류", () => {
    inBothLanguages((language) => {
      for (const code of SOURCE_CODES) {
        const detail: Readonly<Record<string, number>> = code === "too-many-pixels" ? { megapixels: 16, pixels: 40_000_000 } : {};
        expectLanguage(sourceErrorText(new PanelSourceError(code, detail)), language);
      }
    });
  });

  it("해상도 한도 문구에는 실제 값과 한도가 들어간다", () => {
    const error = new PanelSourceError("too-many-pixels", { megapixels: 16, pixels: 40_000_000 });
    expect(sourceErrorText(error)).toContain("40");
    expect(sourceErrorText(error)).toContain("16");
    useI18n.getState().setLang("en");
    expect(sourceErrorText(error)).toMatch(/40 MP.*16 MP/u);
  });

  it("컷 감지 오류와 경고", () => {
    inBothLanguages((language) => {
      for (const code of DETECT_CODES) expectLanguage(detectErrorText(new PanelDetectError(code)), language);
      for (const code of PANEL_WARNINGS) expectLanguage(panelWarningText(code), language);
      for (const code of DETECT_WARNINGS) expectLanguage(detectWarningText(code), language);
      for (const value of READING_ORDERS) expectLanguage(readingOrderLabel(value), language, 2);
      for (const value of SENSITIVITIES) expectLanguage(sensitivityLabel(value), language, 2);
      for (const value of CONFIDENCES) expectLanguage(confidenceLabel(value), language, 2);
    });
  });

  it("감지 단계에서 원고 읽기 오류가 와도 같은 문구로 풀린다", () => {
    expect(detectErrorText(new PanelSourceError("decode-failed"))).toBe(sourceErrorText(new PanelSourceError("decode-failed")));
  });

  it("재배열·삽입 오류", () => {
    inBothLanguages((language) => {
      for (const code of REFLOW_CODES) expectLanguage(renderErrorText(new PanelReflowError(code, "내부 메시지")), language);
      for (const code of RENDER_CODES) {
        expectLanguage(renderErrorText(new PanelRenderError(code, 0)), language);
        expectLanguage(renderErrorText(new PanelRenderError(code, 3)), language);
      }
      expectLanguage(renderErrorText(new PanelStudioHandoffError("too-large", "x")), language);
      expectLanguage(renderErrorText(new PanelStudioHandoffError("register-failed", "x")), language);
      expectLanguage(renderErrorText(new PanelStudioDocumentError("invalid-title", "x")), language);
      expectLanguage(renderErrorText(new PanelImportRightsError("not-confirmed", "x")), language);
    });
  });

  it("몇 번째 이미지인지 알면 문구에 번호가 들어간다", () => {
    expect(renderErrorText(new PanelRenderError("encode-failed", 3))).toContain("3");
    expect(renderErrorText(new PanelRenderError("too-large-for-studio", 7))).toContain("7");
    useI18n.getState().setLang("en");
    expect(renderErrorText(new PanelRenderError("surface-unavailable", 2))).toContain("Image 2");
  });

  it("원본과 달라지는 점(손실 보고) 항목", () => {
    const values = { percent: 12, count: 3, maxScale: 2, minScale: 0.5, pairs: 2, offset: 15, pages: 4 };
    inBothLanguages((language) => {
      for (const code of LOSS_CODES) {
        const text = lossItemText({ code, severity: "info", values });
        expectLanguage(text, language);
      }
    });
  });

  it("손실 보고의 수치가 문구에 들어간다", () => {
    expect(lossItemText({ code: "outside-cuts-dropped", severity: "warning", values: { percent: 37 } })).toContain("37%");
    expect(lossItemText({ code: "split-into-pages", severity: "info", values: { pages: 5 } })).toContain("5개");
    useI18n.getState().setLang("en");
    expect(lossItemText({ code: "centered-in-document", severity: "info", values: { offset: 15 } })).toContain("15px");
  });

  it("카드뉴스 오류·경고·절단 종류", () => {
    inBothLanguages((language) => {
      for (const code of CARD_CODES) expectLanguage(cardErrorText(new CardSliceError(code)), language);
      for (const code of ["no-cards", "mismatch", "archive-failed", "cancelled"] as const) {
        expectLanguage(cardErrorText(new CardBundleError(code, "x")), language);
      }
      expectLanguage(cardErrorText(new PanelRenderError("encode-failed", 2)), language);
      expectLanguage(cardErrorText(new PanelSourceError("decode-failed")), language);
      for (const code of CARD_WARNINGS) expectLanguage(cardWarningText(code, 1.5), language);
      for (const kind of CUT_KINDS) expectLanguage(cutKindText(kind), language, 2);
    });
  });

  it("배율은 소수 둘째 자리까지만 보인다", () => {
    expect(cardWarningText("upscaled", 1.333333)).toContain("1.33");
    expect(cardWarningText("downscaled", 0.5)).toContain("0.5");
  });

  it("알 수 없는 오류는 어느 화면에서나 같은 일반 안내가 된다", () => {
    inBothLanguages((language) => {
      for (const unknown of [new Error("boom"), "문자열", null, undefined, 42, {}]) {
        expectLanguage(sourceErrorText(unknown), language);
        expectLanguage(detectErrorText(unknown), language);
        expectLanguage(renderErrorText(unknown), language);
        expectLanguage(cardErrorText(unknown), language);
      }
    });
    // 내부 오류 메시지(영문·스택)가 화면 문구로 새지 않는다.
    expect(renderErrorText(new Error("TypeError: secret internal detail"))).not.toContain("secret");
  });

  it("한글 문구에는 내부 오류 코드 이름이 새지 않는다", () => {
    useI18n.getState().setLang("ko");
    for (const code of DETECT_CODES) expect(detectErrorText(new PanelDetectError(code))).not.toContain(code);
    for (const code of CARD_CODES) expect(cardErrorText(new CardSliceError(code))).not.toContain(code);
  });
});
