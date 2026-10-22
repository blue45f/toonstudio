/**
 * 생산자 구조화 에러 해석 모듈 — brush 구간: brushLibrary 오류 11키 +
 * brushPack 오류 9키 + brushPack 경고 10키 (A4 D4, R14).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와
 * 동일하다: 생산자는 {code, params}만 방출하고, 표시는 이 모듈의 리졸버로만
 * 해석한다. ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규
 * 번역이다.
 *
 * 구간 메모:
 * - brushLibrary: archiveTooLarge는 내보내기(write)·가져오기(import) 양쪽이
 *   같은 코드로 방출되지만 원문이 달라, 생산자가 variant를 함께 싣고 이
 *   모듈이 variant별로 해석한다(palette 경고의 방출 지점 suffix 전례).
 * - brushPack 잔존 4키(bundleReadFailed·cspReadFailed·mybReadFailed·
 *   kppReadFailed)는 부분 전환이다: 정적 접두만 코드화했고, 하위 파서의
 *   동적 문자열은 params.detail 패스스루로 실어 현행 표시와 동등하게
 *   유지한다. cspReadFailed의 params.kind(SUT/SUTG)도 식별자 패스스루다.
 * - preserveOnly는 삽입되던 issue.message를 issue.code로 대체해 전량
 *   코드화했다(params.issueCode — 선행 공백 포함, 없으면 빈 문자열).
 * - 경고의 warn.passthrough는 게이트웨이 파서의 동적 문자열(params.text)을
 *   그대로 돌려주는 패스스루라 i18n 키가 없다. prefix(프로그램 이름·경로)는
 *   데이터 표기라 해석 결과 뒤에 ": "와 함께 붙는다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  StudioBrushLibraryError,
  StudioBrushLibraryErrorCode,
} from "../brush/studio-brush-library";
import type {
  StudioBrushPackErrorCode,
  StudioBrushPackWarning,
  StudioBrushProgramImportError,
} from "../brush/studio-brush-pack-import";

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

// ---------------------------------------------------------------------------
// brushLibrary 구간
// ---------------------------------------------------------------------------

registerI18nLocaleEntries("ko", {
  "studio.producerError.brushLibrary.settingsTooLarge": "브러시 설정이 보존 파일의 크기 한도를 넘었습니다. 원본을 제거하지 않았습니다.",
  "studio.producerError.brushLibrary.archiveTooLargeWrite": "원본 포함 파일이 가져오기 크기 한도를 넘었습니다. 원본을 제거하지 않았습니다.",
  "studio.producerError.brushLibrary.emptyFile": "빈 파일이에요. 브러시 설정(.json) 파일을 선택해주세요.",
  "studio.producerError.brushLibrary.archiveTooLarge": "브러시 보존 파일이 허용 크기를 초과했습니다.",
  "studio.producerError.brushLibrary.archiveBytesTooLarge": "브러시 보존 파일이 허용 크기를 초과했습니다.",
  "studio.producerError.brushLibrary.readFailed": "브러시 설정 파일을 읽지 못했어요.",
  "studio.producerError.brushLibrary.unsupportedOrCorrupt": "지원하지 않거나 손상된 브러시 보존 파일입니다.",
  "studio.producerError.brushLibrary.settingsNotRestorable": "브러시 보존 파일의 설정 형식을 그대로 복원할 수 없습니다.",
  "studio.producerError.brushLibrary.plainSettingsTooLarge": "일반 브러시 설정은 2MB 이하 파일만 가져올 수 있어요.",
  "studio.producerError.brushLibrary.notJsonFile": "브러시 설정(.json) 파일이 아니에요.",
  "studio.producerError.brushLibrary.engineNotRestorable": "브러시 엔진 설정을 그대로 복원할 수 없어 가져오지 않았어요. 최신 스튜디오에서 다시 시도하거나 원본 브러시를 다시 내보내주세요.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.brushLibrary.settingsTooLarge": "The brush settings exceed the size limit for a preserved file. The original was not removed.",
  "studio.producerError.brushLibrary.archiveTooLargeWrite": "The file including the original exceeds the import size limit. The original was not removed.",
  "studio.producerError.brushLibrary.emptyFile": "The file is empty. Please choose a brush settings (.json) file.",
  "studio.producerError.brushLibrary.archiveTooLarge": "The brush preserved file exceeds the allowed size.",
  "studio.producerError.brushLibrary.archiveBytesTooLarge": "The brush preserved file exceeds the allowed size.",
  "studio.producerError.brushLibrary.readFailed": "Could not read the brush settings file.",
  "studio.producerError.brushLibrary.unsupportedOrCorrupt": "This brush preserved file is unsupported or corrupted.",
  "studio.producerError.brushLibrary.settingsNotRestorable": "The settings format in this brush preserved file cannot be restored as-is.",
  "studio.producerError.brushLibrary.plainSettingsTooLarge": "Plain brush settings can only be imported from files of 2MB or smaller.",
  "studio.producerError.brushLibrary.notJsonFile": "This is not a brush settings (.json) file.",
  "studio.producerError.brushLibrary.engineNotRestorable": "The brush engine settings could not be restored as-is, so nothing was imported. Try again in the latest Studio or export the original brush again.",
});

/** 해석 키: `${code}` 또는 archiveTooLarge의 `${code}:${variant}` (방출 지점 suffix). */
const BRUSH_LIBRARY_ERROR_KEYS: Readonly<Record<string, string>> = {
  settingsTooLarge: "studio.producerError.brushLibrary.settingsTooLarge",
  "archiveTooLarge:write": "studio.producerError.brushLibrary.archiveTooLargeWrite",
  "archiveTooLarge:import": "studio.producerError.brushLibrary.archiveTooLarge",
  emptyFile: "studio.producerError.brushLibrary.emptyFile",
  archiveBytesTooLarge: "studio.producerError.brushLibrary.archiveBytesTooLarge",
  readFailed: "studio.producerError.brushLibrary.readFailed",
  unsupportedOrCorrupt: "studio.producerError.brushLibrary.unsupportedOrCorrupt",
  settingsNotRestorable: "studio.producerError.brushLibrary.settingsNotRestorable",
  plainSettingsTooLarge: "studio.producerError.brushLibrary.plainSettingsTooLarge",
  notJsonFile: "studio.producerError.brushLibrary.notJsonFile",
  engineNotRestorable: "studio.producerError.brushLibrary.engineNotRestorable",
};

/** 키별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const BRUSH_LIBRARY_ERROR_KO: Readonly<Record<string, string>> = {
  "studio.producerError.brushLibrary.settingsTooLarge": "브러시 설정이 보존 파일의 크기 한도를 넘었습니다. 원본을 제거하지 않았습니다.",
  "studio.producerError.brushLibrary.archiveTooLargeWrite": "원본 포함 파일이 가져오기 크기 한도를 넘었습니다. 원본을 제거하지 않았습니다.",
  "studio.producerError.brushLibrary.emptyFile": "빈 파일이에요. 브러시 설정(.json) 파일을 선택해주세요.",
  "studio.producerError.brushLibrary.archiveTooLarge": "브러시 보존 파일이 허용 크기를 초과했습니다.",
  "studio.producerError.brushLibrary.archiveBytesTooLarge": "브러시 보존 파일이 허용 크기를 초과했습니다.",
  "studio.producerError.brushLibrary.readFailed": "브러시 설정 파일을 읽지 못했어요.",
  "studio.producerError.brushLibrary.unsupportedOrCorrupt": "지원하지 않거나 손상된 브러시 보존 파일입니다.",
  "studio.producerError.brushLibrary.settingsNotRestorable": "브러시 보존 파일의 설정 형식을 그대로 복원할 수 없습니다.",
  "studio.producerError.brushLibrary.plainSettingsTooLarge": "일반 브러시 설정은 2MB 이하 파일만 가져올 수 있어요.",
  "studio.producerError.brushLibrary.notJsonFile": "브러시 설정(.json) 파일이 아니에요.",
  "studio.producerError.brushLibrary.engineNotRestorable": "브러시 엔진 설정을 그대로 복원할 수 없어 가져오지 않았어요. 최신 스튜디오에서 다시 시도하거나 원본 브러시를 다시 내보내주세요.",
};

function brushLibraryErrorKey(
  error: Pick<StudioBrushLibraryError, "code" | "variant">,
): string | null {
  const key = BRUSH_LIBRARY_ERROR_KEYS[`${error.code}:${error.variant ?? ""}`]
    ?? BRUSH_LIBRARY_ERROR_KEYS[error.code];
  return key ?? null;
}

const BRUSH_LIBRARY_ERROR_CODES: ReadonlySet<string> = new Set([
  "settingsTooLarge",
  "archiveTooLarge",
  "emptyFile",
  "archiveBytesTooLarge",
  "readFailed",
  "unsupportedOrCorrupt",
  "settingsNotRestorable",
  "plainSettingsTooLarge",
  "notJsonFile",
  "engineNotRestorable",
]);

/** 표시 지점 전용 해석 (brushLibrary 오류): 구조화 오류를 직접 받는 표시 지점이 부른다. */
export function resolveStudioBrushLibraryError(
  error: Pick<StudioBrushLibraryError, "code" | "variant">,
): string {
  const key = brushLibraryErrorKey(error);
  if (!key) return error.code;
  return resolveProducerError(key, BRUSH_LIBRARY_ERROR_KO[key]);
}

/**
 * 표시 지점 전용 해석 (brushLibrary 오류, 원인 객체 덕 타이핑): 패널 catch가
 * 원인 객체만으로 부른다. 생산자 클래스를 직접 import하지 않는 표시 지점
 * 사정에 맞춰 이름+코드로 판정한다. 해당하지 않으면 null — 호출자는 기존
 * 메시지 경로를 유지한다(원본 소스 검증 오류 등 다른 생산자는 그대로 표시).
 */
export function resolveStudioBrushLibraryErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, variant } = cause as {
    name?: unknown;
    code?: unknown;
    variant?: unknown;
  };
  if (name !== "StudioBrushLibraryError" || typeof code !== "string") return null;
  if (!BRUSH_LIBRARY_ERROR_CODES.has(code)) return null;
  return resolveStudioBrushLibraryError({
    code: code as StudioBrushLibraryErrorCode,
    variant: variant === "write" || variant === "import" ? variant : undefined,
  });
}

// ---------------------------------------------------------------------------
// brushPack 구간 — 오류
// ---------------------------------------------------------------------------

registerI18nLocaleEntries("ko", {
  "studio.producerError.brushPack.cancelled": "브러시 가져오기가 취소되었습니다.",
  "studio.producerError.brushPack.sourceTooLarge": "브러시 원본이 비어 있거나 8MiB 크기 한도를 넘었습니다.",
  "studio.producerError.brushPack.fileTooLarge": "브러시 파일이 너무 커요. {maxMb}MB 이하 파일만 가져올 수 있어요.",
  "studio.producerError.brushPack.jsonTooLarge": "브러시 보존 파일이 허용 크기를 초과했습니다.",
  "studio.producerError.brushPack.bundleReadFailed": "Krita 브러시 번들(.bundle)을 읽지 못했어요.{detail}",
  "studio.producerError.brushPack.cspReadFailed": "Clip Studio {kind} 파일을 읽지 못했어요.{detail}",
  "studio.producerError.brushPack.mybReadFailed": "libmypaint 브러시(.myb)를 읽지 못했어요.{detail}",
  "studio.producerError.brushPack.kppReadFailed": "Krita 브러시(.kpp)를 읽지 못했어요.{detail}",
  "studio.producerError.brushPack.preserveOnly": "원본 바이트는 변경하지 않고 보존 판정했지만 실제로 그릴 수 있는 브러시가 0개라 SQLite 카탈로그에는 저장하지 않았어요.{issueCode}",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.brushPack.cancelled": "The brush import was cancelled.",
  "studio.producerError.brushPack.sourceTooLarge": "The brush source is empty or exceeds the 8MiB size limit.",
  "studio.producerError.brushPack.fileTooLarge": "The brush file is too large. Only files of {maxMb}MB or smaller can be imported.",
  "studio.producerError.brushPack.jsonTooLarge": "The brush preserved file exceeds the allowed size.",
  "studio.producerError.brushPack.bundleReadFailed": "Could not read the Krita brush bundle (.bundle).{detail}",
  "studio.producerError.brushPack.cspReadFailed": "Could not read the Clip Studio {kind} file.{detail}",
  "studio.producerError.brushPack.mybReadFailed": "Could not read the libmypaint brush (.myb).{detail}",
  "studio.producerError.brushPack.kppReadFailed": "Could not read the Krita brush (.kpp).{detail}",
  "studio.producerError.brushPack.preserveOnly": "The original bytes were preserved unmodified, but there are no brushes that can actually be drawn, so nothing was saved to the SQLite catalog.{issueCode}",
});

const BRUSH_PACK_ERROR_KEYS: Readonly<Record<StudioBrushPackErrorCode, string>> = {
  cancelled: "studio.producerError.brushPack.cancelled",
  sourceTooLarge: "studio.producerError.brushPack.sourceTooLarge",
  fileTooLarge: "studio.producerError.brushPack.fileTooLarge",
  jsonTooLarge: "studio.producerError.brushPack.jsonTooLarge",
  bundleReadFailed: "studio.producerError.brushPack.bundleReadFailed",
  cspReadFailed: "studio.producerError.brushPack.cspReadFailed",
  mybReadFailed: "studio.producerError.brushPack.mybReadFailed",
  kppReadFailed: "studio.producerError.brushPack.kppReadFailed",
  preserveOnly: "studio.producerError.brushPack.preserveOnly",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const BRUSH_PACK_ERROR_KO: Readonly<Record<StudioBrushPackErrorCode, string>> = {
  cancelled: "브러시 가져오기가 취소되었습니다.",
  sourceTooLarge: "브러시 원본이 비어 있거나 8MiB 크기 한도를 넘었습니다.",
  fileTooLarge: "브러시 파일이 너무 커요. {maxMb}MB 이하 파일만 가져올 수 있어요.",
  jsonTooLarge: "브러시 보존 파일이 허용 크기를 초과했습니다.",
  bundleReadFailed: "Krita 브러시 번들(.bundle)을 읽지 못했어요.{detail}",
  cspReadFailed: "Clip Studio {kind} 파일을 읽지 못했어요.{detail}",
  mybReadFailed: "libmypaint 브러시(.myb)를 읽지 못했어요.{detail}",
  kppReadFailed: "Krita 브러시(.kpp)를 읽지 못했어요.{detail}",
  preserveOnly: "원본 바이트는 변경하지 않고 보존 판정했지만 실제로 그릴 수 있는 브러시가 0개라 SQLite 카탈로그에는 저장하지 않았어요.{issueCode}",
};

/** 표시 지점 전용 해석 (brushPack 오류): 구조화 오류를 직접 받는 표시 지점이 부른다. */
export function resolveStudioBrushPackError(
  error: Pick<StudioBrushProgramImportError, "code" | "params">,
): string {
  return resolveProducerError(
    BRUSH_PACK_ERROR_KEYS[error.code],
    BRUSH_PACK_ERROR_KO[error.code],
    error.params,
  );
}

/**
 * 표시 지점 전용 해석 (brushPack 오류, 원인 객체 덕 타이핑): 패널·호스트의
 * 가져오기 catch가 원인 객체만으로 부른다. ProgramImportError와
 * PreserveOnlyError 두 클래스를 이름+코드로 판정한다. 해당하지 않으면
 * null — 호출자는 기존 메시지 경로를 유지한다(저장소 오류 등).
 */
export function resolveStudioBrushPackErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, params } = cause as {
    name?: unknown;
    code?: unknown;
    params?: unknown;
  };
  if (
    name !== "StudioBrushProgramImportError"
    && name !== "StudioBrushPackPreserveOnlyError"
  ) {
    return null;
  }
  if (typeof code !== "string" || !Object.hasOwn(BRUSH_PACK_ERROR_KEYS, code)) {
    return null;
  }
  return resolveStudioBrushPackError({
    code: code as StudioBrushPackErrorCode,
    params: (params ?? undefined) as Readonly<Record<string, string>> | undefined,
  });
}

// ---------------------------------------------------------------------------
// brushPack 구간 — 경고
// ---------------------------------------------------------------------------

registerI18nLocaleEntries("ko", {
  "studio.producerError.brushPack.warnStrokeWidthClamped": "원본 브러시 굵기(약 {requested}px)가 스튜디오 굵기 범위({min}~{max}px)를 벗어나 {applied}px로 등록했어요.",
  "studio.producerError.brushPack.warnOpacityClamped": "원본 브러시 농도가 스튜디오 범위를 벗어나 가장 가까운 값으로 등록했어요.",
  "studio.producerError.brushPack.warnSizeCurveApproximated": "굵기 필압 곡선이 곡선형이라 최소~최대 구간의 직선 근사로 옮겼어요({input}).",
  "studio.producerError.brushPack.warnFlowCurveApproximated": "농도 필압 곡선이 곡선형이라 최소~최대 구간의 직선 근사로 옮겼어요({input}).",
  "studio.producerError.brushPack.warnImageTipFallback": "이미지 펜촉은 아직 옮기지 못해 원형 촉으로 그려요.",
  "studio.producerError.brushPack.warnStampTipApproximated": "스탬프 촉은 절차적 원형 촉의 경도로 근사했어요.",
  "studio.producerError.brushPack.warnWetMixNotReflected": "번짐·습식 혼합은 아직 그리기에 반영되지 않아요.",
  "studio.producerError.brushPack.warnPressureDefaulted": "원본에 굵기 필압 정보가 없어 기본 굵기로 등록했어요.",
  "studio.producerError.brushPack.warnKppEngineFallback": "이 Krita 엔진은 아직 대응 브러시가 없어 기본 잉크 입자 브러시 설정으로 등록했어요.",
  "studio.producerError.brushPack.warnValuesAdjusted": "일부 값({fields})은 안전 범위로 보정했어요.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.brushPack.warnStrokeWidthClamped": "The original brush width (about {requested}px) is outside the Studio width range ({min}–{max}px), so it was registered as {applied}px.",
  "studio.producerError.brushPack.warnOpacityClamped": "The original brush opacity is outside the Studio range, so the closest value was registered.",
  "studio.producerError.brushPack.warnSizeCurveApproximated": "The width pressure curve is curved, so it was transferred as a straight-line approximation over the min–max range ({input}).",
  "studio.producerError.brushPack.warnFlowCurveApproximated": "The flow pressure curve is curved, so it was transferred as a straight-line approximation over the min–max range ({input}).",
  "studio.producerError.brushPack.warnImageTipFallback": "Image tips cannot be transferred yet, so this draws with a round tip.",
  "studio.producerError.brushPack.warnStampTipApproximated": "The stamp tip was approximated with the hardness of a procedural round tip.",
  "studio.producerError.brushPack.warnWetMixNotReflected": "Smudging and wet mixing are not reflected in drawing yet.",
  "studio.producerError.brushPack.warnPressureDefaulted": "The original has no width pressure information, so the default width was registered.",
  "studio.producerError.brushPack.warnKppEngineFallback": "This Krita engine has no corresponding brush yet, so it was registered with the default ink particle brush settings.",
  "studio.producerError.brushPack.warnValuesAdjusted": "Some values ({fields}) were adjusted to the safe range.",
});

const BRUSH_PACK_WARNING_KEYS: Readonly<Record<string, string>> = {
  "warn.strokeWidthClamped": "studio.producerError.brushPack.warnStrokeWidthClamped",
  "warn.opacityClamped": "studio.producerError.brushPack.warnOpacityClamped",
  "warn.sizeCurveApproximated": "studio.producerError.brushPack.warnSizeCurveApproximated",
  "warn.flowCurveApproximated": "studio.producerError.brushPack.warnFlowCurveApproximated",
  "warn.imageTipFallback": "studio.producerError.brushPack.warnImageTipFallback",
  "warn.stampTipApproximated": "studio.producerError.brushPack.warnStampTipApproximated",
  "warn.wetMixNotReflected": "studio.producerError.brushPack.warnWetMixNotReflected",
  "warn.pressureDefaulted": "studio.producerError.brushPack.warnPressureDefaulted",
  "warn.kppEngineFallback": "studio.producerError.brushPack.warnKppEngineFallback",
  "warn.valuesAdjusted": "studio.producerError.brushPack.warnValuesAdjusted",
};

/** 경고 키별 ko 원문 템플릿 — 키 단위 폴백이며 이관 전 원문과 동일하다. */
const BRUSH_PACK_WARNING_KO: Readonly<Record<string, string>> = {
  "studio.producerError.brushPack.warnStrokeWidthClamped": "원본 브러시 굵기(약 {requested}px)가 스튜디오 굵기 범위({min}~{max}px)를 벗어나 {applied}px로 등록했어요.",
  "studio.producerError.brushPack.warnOpacityClamped": "원본 브러시 농도가 스튜디오 범위를 벗어나 가장 가까운 값으로 등록했어요.",
  "studio.producerError.brushPack.warnSizeCurveApproximated": "굵기 필압 곡선이 곡선형이라 최소~최대 구간의 직선 근사로 옮겼어요({input}).",
  "studio.producerError.brushPack.warnFlowCurveApproximated": "농도 필압 곡선이 곡선형이라 최소~최대 구간의 직선 근사로 옮겼어요({input}).",
  "studio.producerError.brushPack.warnImageTipFallback": "이미지 펜촉은 아직 옮기지 못해 원형 촉으로 그려요.",
  "studio.producerError.brushPack.warnStampTipApproximated": "스탬프 촉은 절차적 원형 촉의 경도로 근사했어요.",
  "studio.producerError.brushPack.warnWetMixNotReflected": "번짐·습식 혼합은 아직 그리기에 반영되지 않아요.",
  "studio.producerError.brushPack.warnPressureDefaulted": "원본에 굵기 필압 정보가 없어 기본 굵기로 등록했어요.",
  "studio.producerError.brushPack.warnKppEngineFallback": "이 Krita 엔진은 아직 대응 브러시가 없어 기본 잉크 입자 브러시 설정으로 등록했어요.",
  "studio.producerError.brushPack.warnValuesAdjusted": "일부 값({fields})은 안전 범위로 보정했어요.",
};

/**
 * 표시 지점 전용 해석 (brushPack 경고). 집계자 예외: 경고 채널은 결과
 * 타입이 구조화 항목 배열로 고정돼 있어, 집계 경계인
 * studioBrushPackImportNotes가 이 함수로 해석해 기존 문자열 notes 형태를
 * 유지한다. warn.passthrough는 params.text를 그대로 돌려주고, prefix는
 * 해석 문구 앞에 데이터 표기로 붙는다(이관 전 `${prefix}: ${문구}`와 동일).
 */
export function resolveStudioBrushPackWarning(warning: StudioBrushPackWarning): string {
  const resolved = warning.code === "warn.passthrough"
    ? (warning.params?.text ?? "")
    : (() => {
        const key = BRUSH_PACK_WARNING_KEYS[warning.code];
        if (!key) return warning.code;
        return resolveProducerError(key, BRUSH_PACK_WARNING_KO[key], warning.params);
      })();
  return warning.prefix ? `${warning.prefix}: ${resolved}` : resolved;
}
