/**
 * A4 D4 (R13) 래칫 정합 추출: scene-publisher 생산자의 구조화 오류 정의(코드·클래스)를
 * 분리한 파일. 생산자 본체(studio-crdt-scene-publisher.ts, 기준선 932줄)는 이 파일에서
 * import하고, 외부 소비자 호환을 위해 생산자 파일이 그대로 재수출한다
 * (studio-openraster-interchange-error.ts 선례).
 *
 * 계약: 생산자는 표시 문구 대신 구조화 코드+params만 방출한다(message = 코드).
 * 문구 해석은 표시 지점에서만 한다
 * (status-i18n/studio-producer-error-i18n-live-crdt.ts, 도메인 liveScene).
 * page-bridge 변환기(studio-crdt-page-bridge-error.ts)의 오류는 이 게시자를
 * 경유할 때 코드 그대로 통과한다.
 */
export type StudioCrdtScenePublishErrorCode =
  | "duplicate-scene-element-id" | "duplicate-layer-group-id" | "duplicate-draw-id" | "element-type-change-not-allowed" | "shared-stage-corrupted";

export class StudioCrdtScenePublishError extends Error {
  constructor(
    readonly code: StudioCrdtScenePublishErrorCode,
    readonly params?: Readonly<Record<string, string>>,
    cause?: unknown
  ) { super(code, cause === undefined ? undefined : { cause }); this.name = "StudioCrdtScenePublishError"; }
}
