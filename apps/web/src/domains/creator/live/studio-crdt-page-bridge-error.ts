/**
 * A4 D4 (R13) 래칫 정합 추출: page-bridge 생산자의 구조화 오류 정의(코드·클래스)를
 * 분리한 파일. 생산자 본체(studio-crdt-page-bridge.ts, 기준선 1,076줄)는 이 파일에서
 * import하고, 외부 소비자 호환을 위해 생산자 파일이 그대로 재수출한다
 * (studio-openraster-interchange-error.ts 선례).
 *
 * 계약: 생산자는 표시 문구 대신 구조화 코드+params만 방출한다(message = 코드).
 * 문구 해석은 표시 지점에서만 한다
 * (status-i18n/studio-producer-error-i18n-live-crdt.ts, 도메인 livePageBridge).
 */
export type StudioCrdtPageBridgeErrorCode =
  | "r8-grain-reference-invalid" | "stroke-payload-version-unsupported" | "brush-program-version-incompatible" | "outline-stroke-version-incompatible"
  | "outline-stroke-invalid" | "stroke-input-contract-invalid" | "taper-spacing-version-required" | "dynamic-min-diameter-invalid"
  | "continuation-pipeline-version-incompatible" | "r8-grain-version-incompatible" | "material-pressure-version-incompatible" | "material-pressure-invalid"
  | "material-min-diameter-invalid" | "element-type-unsupported" | "draw-element-stroke-sync-required" | "filter-mask-non-image-reference"
  | "filter-mask-surface-id-invalid" | "filter-mask-surface-state-invalid" | "reference-source-missing";

export class StudioCrdtPageBridgeError extends Error {
  constructor(
    readonly code: StudioCrdtPageBridgeErrorCode,
    readonly params?: Readonly<Record<string, string>>,
    cause?: unknown
  ) { super(code, cause === undefined ? undefined : { cause }); this.name = "StudioCrdtPageBridgeError"; }
}
