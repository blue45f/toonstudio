/**
 * 생산자 구조화 에러 해석 모듈 — vectorErase/vectorFill 구간:
 * studio-vector-erase-to-intersection 사유 5코드 + studio-vector-fill-reference
 * 세부 28코드·제외 공지 1키 (A4 D4, R15, 설계 r10-d4-trace-3.md §2.24·2.25).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와
 * 동일하다: 생산자는 {code, detail, params}만 방출하고(Error message =
 * 세부 코드 문자열, 결과 실패형은 reason = 코드 문자열), 표시는 이 모듈의
 * 리졸버로만 해석한다. ko 값은 이관 전 생산자 원문과 글자 단위 동일하고,
 * en은 신규 번역이다. invalidDimensionsDetail·offscreenWorkerIncomplete의
 * {detail}은 기존 동적 원문을 패스스루한다(설계 §2.25 명시).
 * vectorFill.exclusionNotice는 계획 사유 해석을 {reason}에 중첩하는 합성 키다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  StudioVectorEraseReasonCode,
  StudioVectorEraseReasonParams,
} from "../studio-vector-erase-to-intersection";
import type {
  StudioAdvancedFillVectorTargetPlan,
  StudioVectorFillExclusionNotice,
} from "../studio-vector-fill-reference";
import type {
  StudioVectorFillDetailCode,
  StudioVectorReferenceError,
} from "../studio-vector-fill-reference-error";

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
  "studio.producerError.vectorErase.tooFewPoints": "점이 2개 이상인 자유선에서만 교점까지 지울 수 있어요.",
  "studio.producerError.vectorErase.zeroLength": "길이가 없는 선이라 지울 구간을 찾을 수 없어요.",
  "studio.producerError.vectorErase.hitNotFound": "선 위의 지점을 찾을 수 없어요.",
  "studio.producerError.vectorErase.hitTooFar": "선에서 너무 떨어진 곳이에요. 선 위를 눌러 주세요.",
  "studio.producerError.vectorErase.tooComplex": "선이 너무 복잡해서 교점을 계산하지 못했어요.",
  "studio.producerError.vectorFill.aborted": "벡터 선화 참조 생성을 취소했습니다.",
  "studio.producerError.vectorFill.sourceUnreadable": "벡터 선화 데이터를 안전하게 읽지 못했습니다. 문제가 있는 획을 삭제하거나 페이지를 복제해 다시 시도해 주세요.",
  "studio.producerError.vectorFill.invalidDimensionsDetail": "{detail}",
  "studio.producerError.vectorFill.sourceTooLarge": "벡터 선화 데이터가 안전 처리 한도를 넘었습니다. 페이지를 나누거나 표시 획 수를 줄인 뒤 다시 시도해 주세요.",
  "studio.producerError.vectorFill.unsupportedFidelity": "일부 레이어의 현재 모습을 정확한 참조 이미지로 만들 수 없습니다. 영향을 받는 레이어의 지원되지 않는 합성 설정을 해제하거나 잠시 숨긴 뒤 다시 시도해 주세요.",
  "studio.producerError.vectorFill.svgTooLarge": "벡터 선화의 렌더 데이터가 안전 처리 한도를 넘었습니다. 페이지를 나누거나 표시 획 수를 줄인 뒤 다시 시도해 주세요.",
  "studio.producerError.vectorFill.pngReadFailed": "벡터 선화 PNG를 읽지 못했습니다.",
  "studio.producerError.vectorFill.pngDataUrlFailed": "벡터 선화 PNG를 data URL로 만들지 못했습니다.",
  "studio.producerError.vectorFill.imageUnavailable": "이 브라우저에서는 벡터 선화를 이미지로 만들 수 없습니다.",
  "studio.producerError.vectorFill.svgImageReadFailed": "벡터 선화 SVG를 이미지로 읽지 못했습니다.",
  "studio.producerError.vectorFill.pngEncodeFailed": "벡터 선화 PNG를 인코딩하지 못했습니다.",
  "studio.producerError.vectorFill.pngTooLarge": "벡터 선화 PNG가 안전 처리 한도를 넘었습니다. 페이지를 나누거나 해상도를 낮춰 주세요.",
  "studio.producerError.vectorFill.canvasUnavailable": "이 브라우저에서는 벡터 선화 캔버스를 만들 수 없습니다.",
  "studio.producerError.vectorFill.canvasCreateFailed": "벡터 선화 캔버스를 만들 수 없습니다.",
  "studio.producerError.vectorFill.pngFormatUnverified": "벡터 선화 PNG 형식을 확인하지 못했습니다.",
  "studio.producerError.vectorFill.offscreenDecoderUnavailable": "선택한 Offscreen 벡터 래스터 엔진에서 SVG 비트맵 디코더를 사용할 수 없습니다.",
  "studio.producerError.vectorFill.offscreenWorkerUnavailable": "선택한 Offscreen 벡터 래스터 Worker를 사용할 수 없습니다.",
  "studio.producerError.vectorFill.offscreenInvalidBitmap": "선택한 Offscreen 벡터 래스터 엔진이 유효한 SVG 비트맵을 만들지 못했습니다.",
  "studio.producerError.vectorFill.offscreenWorkerStartFailed": "선택한 Offscreen 벡터 래스터 Worker를 시작하지 못했습니다.",
  "studio.producerError.vectorFill.offscreenWorkerIncomplete": "선택한 Offscreen 벡터 래스터 Worker가 작업을 완료하지 못했습니다. {detail}",
  "studio.producerError.vectorFill.offscreenInvalidPngResult": "선택한 Offscreen 벡터 래스터 Worker가 유효한 PNG 결과를 반환하지 않았습니다.",
  "studio.producerError.vectorFill.offscreenWrongContainer": "선택한 Offscreen 벡터 래스터 Worker가 PNG 대신 다른 컨테이너를 반환했습니다.",
  "studio.producerError.vectorFill.offscreenRunFailed": "선택한 Offscreen 벡터 래스터 엔진을 실행하지 못했습니다.",
  "studio.producerError.vectorFill.pngSizeMismatch": "벡터 선화 PNG의 페이지 크기가 일치하지 않습니다.",
  "studio.producerError.vectorFill.fillResultInvalidPng": "벡터 채색 결과가 올바른 PNG 형식이 아닙니다.",
  "studio.producerError.vectorFill.invalidPageId": "벡터 채색 레이어를 연결할 페이지를 찾지 못했습니다.",
  "studio.producerError.vectorFill.noVisibleDraw": "페이지에 표시 중인 벡터 선화가 없습니다. 펜이나 도형으로 선화를 추가한 뒤 다시 시도해 주세요.",
  "studio.producerError.vectorFill.minSerializedTooLarge": "벡터 선화의 최소 직렬화 크기가 안전 처리 한도를 넘었습니다. 페이지를 나누거나 표시 획 수를 줄여 주세요.",
  "studio.producerError.vectorFill.exclusionNotice": "벡터 선화는 채우기 경계에서 빼고 래스터 경계만으로 계산했어요. {reason}",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.vectorErase.tooFewPoints": "You can only erase to an intersection on a free line with at least 2 points.",
  "studio.producerError.vectorErase.zeroLength": "The line has no length, so no segment to erase can be found.",
  "studio.producerError.vectorErase.hitNotFound": "Could not find a point on the line.",
  "studio.producerError.vectorErase.hitTooFar": "That spot is too far from the line. Tap on the line.",
  "studio.producerError.vectorErase.tooComplex": "The line is too complex to compute intersections.",
  "studio.producerError.vectorFill.aborted": "Vector line-art reference generation was cancelled.",
  "studio.producerError.vectorFill.sourceUnreadable": "Could not safely read the vector line-art data. Delete the problematic stroke or duplicate the page and try again.",
  "studio.producerError.vectorFill.invalidDimensionsDetail": "{detail}",
  "studio.producerError.vectorFill.sourceTooLarge": "The vector line-art data exceeds the safe processing limit. Split the page or reduce the number of visible strokes and try again.",
  "studio.producerError.vectorFill.unsupportedFidelity": "Some layers' current appearance cannot be made into an exact reference image. Turn off the unsupported blend settings on the affected layers or hide them briefly and try again.",
  "studio.producerError.vectorFill.svgTooLarge": "The vector line-art render data exceeds the safe processing limit. Split the page or reduce the number of visible strokes and try again.",
  "studio.producerError.vectorFill.pngReadFailed": "Could not read the vector line-art PNG.",
  "studio.producerError.vectorFill.pngDataUrlFailed": "Could not create a data URL from the vector line-art PNG.",
  "studio.producerError.vectorFill.imageUnavailable": "This browser cannot create an image from the vector line art.",
  "studio.producerError.vectorFill.svgImageReadFailed": "Could not read the vector line-art SVG as an image.",
  "studio.producerError.vectorFill.pngEncodeFailed": "Could not encode the vector line-art PNG.",
  "studio.producerError.vectorFill.pngTooLarge": "The vector line-art PNG exceeds the safe processing limit. Split the page or lower the resolution.",
  "studio.producerError.vectorFill.canvasUnavailable": "This browser cannot create a vector line-art canvas.",
  "studio.producerError.vectorFill.canvasCreateFailed": "Could not create the vector line-art canvas.",
  "studio.producerError.vectorFill.pngFormatUnverified": "Could not verify the vector line-art PNG format.",
  "studio.producerError.vectorFill.offscreenDecoderUnavailable": "The selected Offscreen vector raster engine cannot use an SVG bitmap decoder.",
  "studio.producerError.vectorFill.offscreenWorkerUnavailable": "The selected Offscreen vector raster Worker is unavailable.",
  "studio.producerError.vectorFill.offscreenInvalidBitmap": "The selected Offscreen vector raster engine did not create a valid SVG bitmap.",
  "studio.producerError.vectorFill.offscreenWorkerStartFailed": "Could not start the selected Offscreen vector raster Worker.",
  "studio.producerError.vectorFill.offscreenWorkerIncomplete": "The selected Offscreen vector raster Worker did not finish the job. {detail}",
  "studio.producerError.vectorFill.offscreenInvalidPngResult": "The selected Offscreen vector raster Worker did not return a valid PNG result.",
  "studio.producerError.vectorFill.offscreenWrongContainer": "The selected Offscreen vector raster Worker returned a container other than PNG.",
  "studio.producerError.vectorFill.offscreenRunFailed": "Could not run the selected Offscreen vector raster engine.",
  "studio.producerError.vectorFill.pngSizeMismatch": "The vector line-art PNG page size does not match.",
  "studio.producerError.vectorFill.fillResultInvalidPng": "The vector fill result is not a valid PNG format.",
  "studio.producerError.vectorFill.invalidPageId": "Could not find the page to attach the vector fill layer to.",
  "studio.producerError.vectorFill.noVisibleDraw": "There is no visible vector line art on the page. Add line art with the pen or shapes and try again.",
  "studio.producerError.vectorFill.minSerializedTooLarge": "The vector line art's minimum serialized size exceeds the safe processing limit. Split the page or reduce the number of visible strokes.",
  "studio.producerError.vectorFill.exclusionNotice": "Vector line art was excluded from the fill boundary and only the raster boundary was used. {reason}",
});

const ERASE_KEYS: Readonly<Record<StudioVectorEraseReasonCode, string>> = {
  tooFewPoints: "studio.producerError.vectorErase.tooFewPoints",
  zeroLength: "studio.producerError.vectorErase.zeroLength",
  hitNotFound: "studio.producerError.vectorErase.hitNotFound",
  hitTooFar: "studio.producerError.vectorErase.hitTooFar",
  tooComplex: "studio.producerError.vectorErase.tooComplex",
};

const ERASE_KO: Readonly<Record<StudioVectorEraseReasonCode, string>> = {
  tooFewPoints: "점이 2개 이상인 자유선에서만 교점까지 지울 수 있어요.",
  zeroLength: "길이가 없는 선이라 지울 구간을 찾을 수 없어요.",
  hitNotFound: "선 위의 지점을 찾을 수 없어요.",
  hitTooFar: "선에서 너무 떨어진 곳이에요. 선 위를 눌러 주세요.",
  tooComplex: "선이 너무 복잡해서 교점을 계산하지 못했어요.",
};

const FILL_KEYS: Readonly<Record<StudioVectorFillDetailCode, string>> = {
  aborted: "studio.producerError.vectorFill.aborted",
  sourceUnreadable: "studio.producerError.vectorFill.sourceUnreadable",
  invalidDimensionsDetail: "studio.producerError.vectorFill.invalidDimensionsDetail",
  sourceTooLarge: "studio.producerError.vectorFill.sourceTooLarge",
  unsupportedFidelity: "studio.producerError.vectorFill.unsupportedFidelity",
  svgTooLarge: "studio.producerError.vectorFill.svgTooLarge",
  pngReadFailed: "studio.producerError.vectorFill.pngReadFailed",
  pngDataUrlFailed: "studio.producerError.vectorFill.pngDataUrlFailed",
  imageUnavailable: "studio.producerError.vectorFill.imageUnavailable",
  svgImageReadFailed: "studio.producerError.vectorFill.svgImageReadFailed",
  pngEncodeFailed: "studio.producerError.vectorFill.pngEncodeFailed",
  pngTooLarge: "studio.producerError.vectorFill.pngTooLarge",
  canvasUnavailable: "studio.producerError.vectorFill.canvasUnavailable",
  canvasCreateFailed: "studio.producerError.vectorFill.canvasCreateFailed",
  pngFormatUnverified: "studio.producerError.vectorFill.pngFormatUnverified",
  offscreenDecoderUnavailable: "studio.producerError.vectorFill.offscreenDecoderUnavailable",
  offscreenWorkerUnavailable: "studio.producerError.vectorFill.offscreenWorkerUnavailable",
  offscreenInvalidBitmap: "studio.producerError.vectorFill.offscreenInvalidBitmap",
  offscreenWorkerStartFailed: "studio.producerError.vectorFill.offscreenWorkerStartFailed",
  offscreenWorkerIncomplete: "studio.producerError.vectorFill.offscreenWorkerIncomplete",
  offscreenInvalidPngResult: "studio.producerError.vectorFill.offscreenInvalidPngResult",
  offscreenWrongContainer: "studio.producerError.vectorFill.offscreenWrongContainer",
  offscreenRunFailed: "studio.producerError.vectorFill.offscreenRunFailed",
  pngSizeMismatch: "studio.producerError.vectorFill.pngSizeMismatch",
  fillResultInvalidPng: "studio.producerError.vectorFill.fillResultInvalidPng",
  invalidPageId: "studio.producerError.vectorFill.invalidPageId",
  noVisibleDraw: "studio.producerError.vectorFill.noVisibleDraw",
  minSerializedTooLarge: "studio.producerError.vectorFill.minSerializedTooLarge",
};

/** 세부 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const FILL_KO: Readonly<Record<StudioVectorFillDetailCode, string>> = {
  aborted: "벡터 선화 참조 생성을 취소했습니다.",
  sourceUnreadable: "벡터 선화 데이터를 안전하게 읽지 못했습니다. 문제가 있는 획을 삭제하거나 페이지를 복제해 다시 시도해 주세요.",
  invalidDimensionsDetail: "{detail}",
  sourceTooLarge: "벡터 선화 데이터가 안전 처리 한도를 넘었습니다. 페이지를 나누거나 표시 획 수를 줄인 뒤 다시 시도해 주세요.",
  unsupportedFidelity: "일부 레이어의 현재 모습을 정확한 참조 이미지로 만들 수 없습니다. 영향을 받는 레이어의 지원되지 않는 합성 설정을 해제하거나 잠시 숨긴 뒤 다시 시도해 주세요.",
  svgTooLarge: "벡터 선화의 렌더 데이터가 안전 처리 한도를 넘었습니다. 페이지를 나누거나 표시 획 수를 줄인 뒤 다시 시도해 주세요.",
  pngReadFailed: "벡터 선화 PNG를 읽지 못했습니다.",
  pngDataUrlFailed: "벡터 선화 PNG를 data URL로 만들지 못했습니다.",
  imageUnavailable: "이 브라우저에서는 벡터 선화를 이미지로 만들 수 없습니다.",
  svgImageReadFailed: "벡터 선화 SVG를 이미지로 읽지 못했습니다.",
  pngEncodeFailed: "벡터 선화 PNG를 인코딩하지 못했습니다.",
  pngTooLarge: "벡터 선화 PNG가 안전 처리 한도를 넘었습니다. 페이지를 나누거나 해상도를 낮춰 주세요.",
  canvasUnavailable: "이 브라우저에서는 벡터 선화 캔버스를 만들 수 없습니다.",
  canvasCreateFailed: "벡터 선화 캔버스를 만들 수 없습니다.",
  pngFormatUnverified: "벡터 선화 PNG 형식을 확인하지 못했습니다.",
  offscreenDecoderUnavailable: "선택한 Offscreen 벡터 래스터 엔진에서 SVG 비트맵 디코더를 사용할 수 없습니다.",
  offscreenWorkerUnavailable: "선택한 Offscreen 벡터 래스터 Worker를 사용할 수 없습니다.",
  offscreenInvalidBitmap: "선택한 Offscreen 벡터 래스터 엔진이 유효한 SVG 비트맵을 만들지 못했습니다.",
  offscreenWorkerStartFailed: "선택한 Offscreen 벡터 래스터 Worker를 시작하지 못했습니다.",
  offscreenWorkerIncomplete: "선택한 Offscreen 벡터 래스터 Worker가 작업을 완료하지 못했습니다. {detail}",
  offscreenInvalidPngResult: "선택한 Offscreen 벡터 래스터 Worker가 유효한 PNG 결과를 반환하지 않았습니다.",
  offscreenWrongContainer: "선택한 Offscreen 벡터 래스터 Worker가 PNG 대신 다른 컨테이너를 반환했습니다.",
  offscreenRunFailed: "선택한 Offscreen 벡터 래스터 엔진을 실행하지 못했습니다.",
  pngSizeMismatch: "벡터 선화 PNG의 페이지 크기가 일치하지 않습니다.",
  fillResultInvalidPng: "벡터 채색 결과가 올바른 PNG 형식이 아닙니다.",
  invalidPageId: "벡터 채색 레이어를 연결할 페이지를 찾지 못했습니다.",
  noVisibleDraw: "페이지에 표시 중인 벡터 선화가 없습니다. 펜이나 도형으로 선화를 추가한 뒤 다시 시도해 주세요.",
  minSerializedTooLarge: "벡터 선화의 최소 직렬화 크기가 안전 처리 한도를 넘었습니다. 페이지를 나누거나 표시 획 수를 줄여 주세요.",
};

const EXCLUSION_KEY = "studio.producerError.vectorFill.exclusionNotice";
const EXCLUSION_KO = "벡터 선화는 채우기 경계에서 빼고 래스터 경계만으로 계산했어요. {reason}";

/**
 * 표시 지점 전용 해석 (vector-erase 결과): reasonCode가 있는 결과만
 * 해석하고, 다른 생산자(apply 보조)의 자체 사유는 null — 호출자는
 * reason 원문을 그대로 쓴다.
 */
export function resolveStudioVectorEraseResult(result: {
  reason: string;
  reasonCode?: StudioVectorEraseReasonCode;
  params?: StudioVectorEraseReasonParams;
}): string | null {
  if (!result.reasonCode) return null;
  return resolveProducerError(ERASE_KEYS[result.reasonCode], ERASE_KO[result.reasonCode], result.params);
}

/** 표시 지점 전용 해석 (vector-fill throw). */
export function resolveStudioVectorReferenceError(error: StudioVectorReferenceError): string {
  return resolveProducerError(FILL_KEYS[error.detail], FILL_KO[error.detail], error.params);
}

/** 표시 지점 전용 해석 (원인 객체 덕 타이핑): 이 생산자가 아닌 원인은 null. */
export function resolveStudioVectorReferenceErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, detail } = cause as { name?: unknown; detail?: unknown };
  if (name !== "StudioVectorReferenceError" || typeof detail !== "string") return null;
  if (!Object.hasOwn(FILL_KEYS, detail)) return null;
  return resolveStudioVectorReferenceError(cause as StudioVectorReferenceError);
}

/** 표시 지점 전용 해석 (vector-fill 계획 실패): 엔트리 비활성 사유 표시가 부른다. */
export function resolveStudioVectorFillPlanFailure(
  failure: Extract<StudioAdvancedFillVectorTargetPlan, { readonly ok: false }>,
): string {
  return resolveProducerError(FILL_KEYS[failure.detail], FILL_KO[failure.detail], failure.params);
}

/** 표시 지점 전용 해석 (vector-fill 제외 공지): 계획 사유 해석을 접두에 합성한다. */
export function resolveStudioVectorFillExclusionNotice(
  notice: StudioVectorFillExclusionNotice,
): string {
  const reason = resolveProducerError(FILL_KEYS[notice.detail], FILL_KO[notice.detail], notice.params);
  return resolveProducerError(EXCLUSION_KEY, EXCLUSION_KO, { reason });
}
