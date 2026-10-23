/**
 * A4 D4 (R15): studio-path-boolean 생산자 구조화 사유 정의 — 기준선 포화로
 * 전용 파일에 뒀다(studio-comments-error.ts 선례). 생산자는 표시 문구 대신
 * {reasonCode, params}를 방출하고(reason 필드는 코드 문자열을 그대로 싣는
 * 호환 필드), 표시는 표시 지점에서 리졸버
 * (status-i18n/studio-producer-error-i18n-path-boolean.ts)로만 해석한다.
 * prefixBelow·prefixAbove는 안쪽 사유 코드를 params.innerCode로 싣는 합성
 * 코드다 — 접두 문구는 표시 지점 해석에서만 합성한다(설계 r10-d4-trace-3 §2.12).
 */
export type StudioPathBooleanReasonCode =
  | "corruptCoordinates"
  | "tooFewPoints"
  | "flatShape"
  | "emptyUnion"
  | "emptySubtract"
  | "emptyIntersect"
  | "emptyExclude"
  | "engineFailed"
  | "prefixBelow"
  | "prefixAbove"
  | "gateTwoShapes"
  | "gateDrawShapesOnly"
  | "gateEraser"
  | "gateSymmetry"
  | "gateLineArrow";

export type StudioPathBooleanReasonParams = Readonly<Record<string, string>>;
