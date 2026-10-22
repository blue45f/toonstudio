/**
 * 생산자 구조화 에러 해석 모듈 — palette 구간: studio-palette-interchange 오류 5코드 + 경고 18키 (A4 D4, R11).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 코어 모듈이
 * 소스 파일 크기 래칫(800줄 상한)에 닿아, R11 구간은 frozen 사전군과 같은
 * 분할 관례로 파일 단위 형제 모듈로 나눴다. 계약은 코어와 동일하다:
 * 생산자는 {code, params}만 방출하고, 표시는 이 모듈의 리졸버로만 해석한다.
 * ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규 번역이다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  StudioPaletteInterchangeError,
  StudioPaletteInterchangeWarning,
} from "../studio-palette-interchange";


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
  "studio.producerError.palette.errorEmpty": "팔레트 파일이 비어 있습니다.",
  "studio.producerError.palette.errorInvalid": "팔레트 파일 구조가 올바르지 않거나 손상되었습니다.",
  "studio.producerError.palette.errorNoColors": "팔레트에서 읽을 수 있는 색을 찾지 못했습니다.",
  "studio.producerError.palette.errorSize": "팔레트 파일이 4MB 안전 처리 한도를 초과했습니다.",
  "studio.producerError.palette.errorUnsupportedVersion": "아직 지원하지 않는 팔레트 파일 버전입니다.",
  "studio.producerError.palette.warningTruncatedImport": "색 {max}개까지만 가져왔습니다.",
  "studio.producerError.palette.warningTruncatedExport": "색 {max}개까지만 내보냈습니다.",
  "studio.producerError.palette.warningAlphaDiscarded": "Studio 팔레트는 불투명 sRGB 스와치만 보존하므로 알파를 제거했습니다.",
  "studio.producerError.palette.warningAlphaDiscardedAct": "ACT 투명 색 인덱스 {index}는 현재 불투명 Studio 스와치로 가져와 투명도를 제거했습니다.",
  "studio.producerError.palette.warningAlphaDiscardedCss": "CSS 색상의 알파를 제거하고 불투명 sRGB 스와치로 가져왔습니다.",
  "studio.producerError.palette.warningAlphaDiscardedJson": "JSON 팔레트의 알파를 제거하고 불투명 sRGB 스와치로 가져왔습니다.",
  "studio.producerError.palette.warningWideGamutClipped": "광색역 색은 현재 sRGB 헥스 값으로 클리핑해 저장했습니다.",
  "studio.producerError.palette.warningWideGamutClippedJson": "JSON 광색역 표시는 sRGB 헥스 값으로 클리핑해 가져왔습니다.",
  "studio.producerError.palette.warningColorSkipped": "해석할 수 없는 색 {count}개를 건너뛰었습니다.",
  "studio.producerError.palette.warningColorSkippedAse": "지원하지 않는 ASE 색공간 “{model}” 색을 건너뛰었습니다.",
  "studio.producerError.palette.warningColorSkippedAco": "지원하지 않는 ACO 색공간 색 {count}개를 건너뛰었습니다.",
  "studio.producerError.palette.warningColorSkippedGpl": "해석할 수 없는 GPL 줄 {count}개를 건너뛰었습니다.",
  "studio.producerError.palette.warningColorSkippedCss": "색으로 해석할 수 없는 CSS 변수 {count}개를 건너뛰었습니다.",
  "studio.producerError.palette.warningColorSkippedJson": "해석할 수 없는 JSON 색 {count}개를 건너뛰었습니다.",
  "studio.producerError.palette.warningNonRgbConvertedAse": "ASE의 Lab/CMYK/Gray 색을 표시용 sRGB로 변환했습니다.",
  "studio.producerError.palette.warningNonRgbConvertedAco": "ACO의 HSB/Lab/CMYK/Gray 색을 표시용 sRGB로 변환했습니다.",
  "studio.producerError.palette.warningUnknownBlockSkipped": "알 수 없는 ASE 확장 블록을 안전하게 건너뛰었습니다.",
  "studio.producerError.palette.warningNamesDiscarded": "{format} 형식은 색 이름을 저장하지 않아 이름 {count}개를 제외했습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.palette.errorEmpty": "The palette file is empty.",
  "studio.producerError.palette.errorInvalid": "The palette file structure is invalid or corrupted.",
  "studio.producerError.palette.errorNoColors": "No readable colors were found in the palette.",
  "studio.producerError.palette.errorSize": "The palette file exceeds the 4MB safe processing limit.",
  "studio.producerError.palette.errorUnsupportedVersion": "This palette file version is not supported yet.",
  "studio.producerError.palette.warningTruncatedImport": "Only the first {max} colors were imported.",
  "studio.producerError.palette.warningTruncatedExport": "Only the first {max} colors were exported.",
  "studio.producerError.palette.warningAlphaDiscarded": "Studio palettes preserve only opaque sRGB swatches, so the alpha was removed.",
  "studio.producerError.palette.warningAlphaDiscardedAct": "ACT transparent color index {index} was imported as an opaque Studio swatch, removing its transparency.",
  "studio.producerError.palette.warningAlphaDiscardedCss": "The CSS color alpha was removed and the color was imported as an opaque sRGB swatch.",
  "studio.producerError.palette.warningAlphaDiscardedJson": "The JSON palette alpha was removed and the color was imported as an opaque sRGB swatch.",
  "studio.producerError.palette.warningWideGamutClipped": "Wide-gamut colors were clipped to the current sRGB hex values when saved.",
  "studio.producerError.palette.warningWideGamutClippedJson": "The JSON wide-gamut representation was clipped to sRGB hex values when imported.",
  "studio.producerError.palette.warningColorSkipped": "Skipped {count} colors that could not be interpreted.",
  "studio.producerError.palette.warningColorSkippedAse": "Skipped a color in the unsupported ASE color space “{model}”.",
  "studio.producerError.palette.warningColorSkippedAco": "Skipped {count} colors in unsupported ACO color spaces.",
  "studio.producerError.palette.warningColorSkippedGpl": "Skipped {count} GPL lines that could not be interpreted.",
  "studio.producerError.palette.warningColorSkippedCss": "Skipped {count} CSS variables that could not be interpreted as colors.",
  "studio.producerError.palette.warningColorSkippedJson": "Skipped {count} JSON colors that could not be interpreted.",
  "studio.producerError.palette.warningNonRgbConvertedAse": "The ASE Lab/CMYK/Gray colors were converted to display sRGB.",
  "studio.producerError.palette.warningNonRgbConvertedAco": "The ACO HSB/Lab/CMYK/Gray colors were converted to display sRGB.",
  "studio.producerError.palette.warningUnknownBlockSkipped": "An unknown ASE extension block was safely skipped.",
  "studio.producerError.palette.warningNamesDiscarded": "The {format} format does not store color names, so {count} names were excluded.",
});

const PALETTE_ERROR_KEYS: Readonly<Record<StudioPaletteInterchangeError["code"], string>> = {
  empty: "studio.producerError.palette.errorEmpty",
  invalid: "studio.producerError.palette.errorInvalid",
  "no-colors": "studio.producerError.palette.errorNoColors",
  size: "studio.producerError.palette.errorSize",
  "unsupported-version": "studio.producerError.palette.errorUnsupportedVersion",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const PALETTE_ERROR_KO: Readonly<Record<StudioPaletteInterchangeError["code"], string>> = {
  empty: "팔레트 파일이 비어 있습니다.",
  invalid: "팔레트 파일 구조가 올바르지 않거나 손상되었습니다.",
  "no-colors": "팔레트에서 읽을 수 있는 색을 찾지 못했습니다.",
  size: "팔레트 파일이 4MB 안전 처리 한도를 초과했습니다.",
  "unsupported-version": "아직 지원하지 않는 팔레트 파일 버전입니다.",
};

/** 표시 지점 전용 해석 (palette 오류): 패널의 가져오기·내보내기 catch가 FromCause로 부른다. */
export function resolveStudioPaletteInterchangeError(
  error: StudioPaletteInterchangeError,
): string {
  return resolveProducerError(PALETTE_ERROR_KEYS[error.code], PALETTE_ERROR_KO[error.code]);
}

/**
 * 표시 지점 전용 해석 (palette 오류, 원인 객체 덕 타이핑): 패널은 interchange
 * 모듈을 지연 로드하므로 클래스 import 없이 name+code만으로 판정한다.
 * palette 생산자가 아닌 원인(저장소 오류 등)은 null — 호출자는 기존 메시지
 * 경로를 유지한다.
 */
export function resolveStudioPaletteInterchangeErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code } = cause as { name?: unknown; code?: unknown };
  if (name !== "StudioPaletteInterchangeError" || typeof code !== "string") return null;
  if (!Object.hasOwn(PALETTE_ERROR_KEYS, code)) return null;
  return resolveStudioPaletteInterchangeError(cause as StudioPaletteInterchangeError);
}

/** 경고 해석 키: `${code}` 또는 `${code}:${variant}` (방출 지점 suffix). */
const PALETTE_WARNING_KEYS: Readonly<Record<string, string>> = {
  "truncated:import": "studio.producerError.palette.warningTruncatedImport",
  "truncated:export": "studio.producerError.palette.warningTruncatedExport",
  "alpha-discarded": "studio.producerError.palette.warningAlphaDiscarded",
  "alpha-discarded:act": "studio.producerError.palette.warningAlphaDiscardedAct",
  "alpha-discarded:css": "studio.producerError.palette.warningAlphaDiscardedCss",
  "alpha-discarded:json": "studio.producerError.palette.warningAlphaDiscardedJson",
  "wide-gamut-clipped": "studio.producerError.palette.warningWideGamutClipped",
  "wide-gamut-clipped:json": "studio.producerError.palette.warningWideGamutClippedJson",
  "color-skipped": "studio.producerError.palette.warningColorSkipped",
  "color-skipped:ase": "studio.producerError.palette.warningColorSkippedAse",
  "color-skipped:aco": "studio.producerError.palette.warningColorSkippedAco",
  "color-skipped:gpl": "studio.producerError.palette.warningColorSkippedGpl",
  "color-skipped:css": "studio.producerError.palette.warningColorSkippedCss",
  "color-skipped:json": "studio.producerError.palette.warningColorSkippedJson",
  "non-rgb-converted:ase": "studio.producerError.palette.warningNonRgbConvertedAse",
  "non-rgb-converted:aco": "studio.producerError.palette.warningNonRgbConvertedAco",
  "unknown-block-skipped": "studio.producerError.palette.warningUnknownBlockSkipped",
  "names-discarded": "studio.producerError.palette.warningNamesDiscarded",
};

/** 경고 코드별 ko 원문 템플릿 — 키 단위 폴백이며 이관 전 원문과 동일하다. */
const PALETTE_WARNING_KO: Readonly<Record<string, string>> = {
  "studio.producerError.palette.warningTruncatedImport": "색 {max}개까지만 가져왔습니다.",
  "studio.producerError.palette.warningTruncatedExport": "색 {max}개까지만 내보냈습니다.",
  "studio.producerError.palette.warningAlphaDiscarded": "Studio 팔레트는 불투명 sRGB 스와치만 보존하므로 알파를 제거했습니다.",
  "studio.producerError.palette.warningAlphaDiscardedAct": "ACT 투명 색 인덱스 {index}는 현재 불투명 Studio 스와치로 가져와 투명도를 제거했습니다.",
  "studio.producerError.palette.warningAlphaDiscardedCss": "CSS 색상의 알파를 제거하고 불투명 sRGB 스와치로 가져왔습니다.",
  "studio.producerError.palette.warningAlphaDiscardedJson": "JSON 팔레트의 알파를 제거하고 불투명 sRGB 스와치로 가져왔습니다.",
  "studio.producerError.palette.warningWideGamutClipped": "광색역 색은 현재 sRGB 헥스 값으로 클리핑해 저장했습니다.",
  "studio.producerError.palette.warningWideGamutClippedJson": "JSON 광색역 표시는 sRGB 헥스 값으로 클리핑해 가져왔습니다.",
  "studio.producerError.palette.warningColorSkipped": "해석할 수 없는 색 {count}개를 건너뛰었습니다.",
  "studio.producerError.palette.warningColorSkippedAse": "지원하지 않는 ASE 색공간 “{model}” 색을 건너뛰었습니다.",
  "studio.producerError.palette.warningColorSkippedAco": "지원하지 않는 ACO 색공간 색 {count}개를 건너뛰었습니다.",
  "studio.producerError.palette.warningColorSkippedGpl": "해석할 수 없는 GPL 줄 {count}개를 건너뛰었습니다.",
  "studio.producerError.palette.warningColorSkippedCss": "색으로 해석할 수 없는 CSS 변수 {count}개를 건너뛰었습니다.",
  "studio.producerError.palette.warningColorSkippedJson": "해석할 수 없는 JSON 색 {count}개를 건너뛰었습니다.",
  "studio.producerError.palette.warningNonRgbConvertedAse": "ASE의 Lab/CMYK/Gray 색을 표시용 sRGB로 변환했습니다.",
  "studio.producerError.palette.warningNonRgbConvertedAco": "ACO의 HSB/Lab/CMYK/Gray 색을 표시용 sRGB로 변환했습니다.",
  "studio.producerError.palette.warningUnknownBlockSkipped": "알 수 없는 ASE 확장 블록을 안전하게 건너뛰었습니다.",
  "studio.producerError.palette.warningNamesDiscarded": "{format} 형식은 색 이름을 저장하지 않아 이름 {count}개를 제외했습니다.",
};

/** 표시 지점 전용 해석 (palette 경고): 패널의 details 합성 지점이 부른다. */
export function resolveStudioPaletteInterchangeWarning(
  warning: StudioPaletteInterchangeWarning,
): string {
  const key = PALETTE_WARNING_KEYS[`${warning.code}:${warning.variant ?? ""}`]
    ?? PALETTE_WARNING_KEYS[warning.code];
  if (!key) return warning.code;
  return resolveProducerError(key, PALETTE_WARNING_KO[key], warning.params);
}
