/**
 * 생산자 구조화 에러 해석 모듈 — pathBoolean 구간: studio-path-boolean 사유
 * 15코드 (A4 D4, R15, 설계 r10-d4-trace-3.md §2.12).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와
 * 동일하다: 생산자는 {reasonCode, params}만 방출하고(reason은 코드 문자열을
 * 싣는 호환 필드), 표시는 이 모듈의 리졸버로만 해석한다. ko 값은 이관 전
 * 생산자 원문과 글자 단위 동일하고, en은 신규 번역이다. prefixBelow·
 * prefixAbove는 params.innerCode의 안쪽 사유를 먼저 해석해 접두를 합성한다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  StudioPathBooleanReasonCode,
  StudioPathBooleanReasonParams,
} from "../studio-path-boolean-reason";

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
  "studio.producerError.pathBoolean.corruptCoordinates": "도형 좌표가 손상되어 결합할 수 없어요.",
  "studio.producerError.pathBoolean.tooFewPoints": "점이 3개 이상인 닫힌 획만 결합할 수 있어요.",
  "studio.producerError.pathBoolean.flatShape": "면적이 없는(납작한) 도형은 결합할 수 없어요.",
  "studio.producerError.pathBoolean.emptyUnion": "결합 결과가 비어 있어요.",
  "studio.producerError.pathBoolean.emptySubtract": "위 도형이 아래 도형을 완전히 덮어 남는 면이 없어요.",
  "studio.producerError.pathBoolean.emptyIntersect": "두 도형이 겹치지 않아 교차 영역이 없어요.",
  "studio.producerError.pathBoolean.emptyExclude": "두 도형이 완전히 겹쳐 남는 면이 없어요.",
  "studio.producerError.pathBoolean.engineFailed": "경로 연산이 이 도형을 처리하지 못했어요(좌표를 조금 바꿔 다시 시도해 주세요).",
  "studio.producerError.pathBoolean.prefixBelow": "아래 도형: {inner}",
  "studio.producerError.pathBoolean.prefixAbove": "위 도형: {inner}",
  "studio.producerError.pathBoolean.gateTwoShapes": "캔버스에서 도형 2개를 함께 선택하세요(드래그 선택).",
  "studio.producerError.pathBoolean.gateDrawShapesOnly": "그리기 도형끼리만 결합할 수 있어요(이미지·글자·말풍선 제외).",
  "studio.producerError.pathBoolean.gateEraser": "지우개 획은 결합할 수 없어요.",
  "studio.producerError.pathBoolean.gateSymmetry": "대칭이 적용된 도형은 대칭을 해제한 뒤 결합해 주세요.",
  "studio.producerError.pathBoolean.gateLineArrow": "선·화살표는 면이 없어 결합할 수 없어요.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.pathBoolean.corruptCoordinates": "The shape coordinates are corrupted, so it cannot be combined.",
  "studio.producerError.pathBoolean.tooFewPoints": "Only closed strokes with at least 3 points can be combined.",
  "studio.producerError.pathBoolean.flatShape": "A shape with no area (flat) cannot be combined.",
  "studio.producerError.pathBoolean.emptyUnion": "The combined result is empty.",
  "studio.producerError.pathBoolean.emptySubtract": "The top shape completely covers the bottom shape, leaving no area.",
  "studio.producerError.pathBoolean.emptyIntersect": "The two shapes do not overlap, so there is no intersection area.",
  "studio.producerError.pathBoolean.emptyExclude": "The two shapes overlap completely, leaving no area.",
  "studio.producerError.pathBoolean.engineFailed": "The path operation could not process this shape (try moving the coordinates slightly and retry).",
  "studio.producerError.pathBoolean.prefixBelow": "Bottom shape: {inner}",
  "studio.producerError.pathBoolean.prefixAbove": "Top shape: {inner}",
  "studio.producerError.pathBoolean.gateTwoShapes": "Select two shapes together on the canvas (drag selection).",
  "studio.producerError.pathBoolean.gateDrawShapesOnly": "Only drawing shapes can be combined (images, text, and speech bubbles are excluded).",
  "studio.producerError.pathBoolean.gateEraser": "Eraser strokes cannot be combined.",
  "studio.producerError.pathBoolean.gateSymmetry": "Release the symmetry on the shape before combining it.",
  "studio.producerError.pathBoolean.gateLineArrow": "Lines and arrows have no area, so they cannot be combined.",
});

const PATH_BOOLEAN_KEYS: Readonly<Record<StudioPathBooleanReasonCode, string>> = {
  corruptCoordinates: "studio.producerError.pathBoolean.corruptCoordinates",
  tooFewPoints: "studio.producerError.pathBoolean.tooFewPoints",
  flatShape: "studio.producerError.pathBoolean.flatShape",
  emptyUnion: "studio.producerError.pathBoolean.emptyUnion",
  emptySubtract: "studio.producerError.pathBoolean.emptySubtract",
  emptyIntersect: "studio.producerError.pathBoolean.emptyIntersect",
  emptyExclude: "studio.producerError.pathBoolean.emptyExclude",
  engineFailed: "studio.producerError.pathBoolean.engineFailed",
  prefixBelow: "studio.producerError.pathBoolean.prefixBelow",
  prefixAbove: "studio.producerError.pathBoolean.prefixAbove",
  gateTwoShapes: "studio.producerError.pathBoolean.gateTwoShapes",
  gateDrawShapesOnly: "studio.producerError.pathBoolean.gateDrawShapesOnly",
  gateEraser: "studio.producerError.pathBoolean.gateEraser",
  gateSymmetry: "studio.producerError.pathBoolean.gateSymmetry",
  gateLineArrow: "studio.producerError.pathBoolean.gateLineArrow",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const PATH_BOOLEAN_KO: Readonly<Record<StudioPathBooleanReasonCode, string>> = {
  corruptCoordinates: "도형 좌표가 손상되어 결합할 수 없어요.",
  tooFewPoints: "점이 3개 이상인 닫힌 획만 결합할 수 있어요.",
  flatShape: "면적이 없는(납작한) 도형은 결합할 수 없어요.",
  emptyUnion: "결합 결과가 비어 있어요.",
  emptySubtract: "위 도형이 아래 도형을 완전히 덮어 남는 면이 없어요.",
  emptyIntersect: "두 도형이 겹치지 않아 교차 영역이 없어요.",
  emptyExclude: "두 도형이 완전히 겹쳐 남는 면이 없어요.",
  engineFailed: "경로 연산이 이 도형을 처리하지 못했어요(좌표를 조금 바꿔 다시 시도해 주세요).",
  prefixBelow: "아래 도형: {inner}",
  prefixAbove: "위 도형: {inner}",
  gateTwoShapes: "캔버스에서 도형 2개를 함께 선택하세요(드래그 선택).",
  gateDrawShapesOnly: "그리기 도형끼리만 결합할 수 있어요(이미지·글자·말풍선 제외).",
  gateEraser: "지우개 획은 결합할 수 없어요.",
  gateSymmetry: "대칭이 적용된 도형은 대칭을 해제한 뒤 결합해 주세요.",
  gateLineArrow: "선·화살표는 면이 없어 결합할 수 없어요.",
};

/** 표시 지점 전용 해석 (사유 코드 단독): 게이트 코드처럼 코드만 있을 때 쓴다. */
export function resolveStudioPathBooleanReasonCode(
  code: StudioPathBooleanReasonCode | null | undefined,
  params?: StudioPathBooleanReasonParams,
): string | null {
  if (!code) return null;
  if (code === "prefixBelow" || code === "prefixAbove") {
    const innerCode = params?.innerCode as StudioPathBooleanReasonCode | undefined;
    const inner = innerCode && Object.hasOwn(PATH_BOOLEAN_KEYS, innerCode)
      ? resolveStudioPathBooleanReasonCode(innerCode)
      : (params?.innerCode ?? "");
    return resolveProducerError(PATH_BOOLEAN_KEYS[code], PATH_BOOLEAN_KO[code], { inner: inner ?? "" });
  }
  return resolveProducerError(PATH_BOOLEAN_KEYS[code], PATH_BOOLEAN_KO[code], params);
}

/**
 * 표시 지점 전용 해석 (결과 객체): reasonCode가 있는 결과는 코드로 해석하고,
 * 코드가 없는 결과(다른 어댑터가 만든 자체 사유 문자열)는 reason 원문을
 * 그대로 돌려준다.
 */
export function resolveStudioPathBooleanResult(result: {
  reason: string;
  reasonCode?: StudioPathBooleanReasonCode;
  params?: StudioPathBooleanReasonParams;
}): string {
  if (result.reasonCode) {
    return resolveStudioPathBooleanReasonCode(result.reasonCode, result.params) ?? result.reason;
  }
  return result.reason;
}
