/**
 * 래스터 편집 준비 구조화 사유·오류 (A4 D4, R15 — §3.13).
 *
 * studio-raster-edit-preparation.ts의 Result reason 채널(17곳)과 throw
 * 채널(8곳)을 구조화 코드로 방출하기 위한 정의. 생산자는 표시 문구 대신
 * {code, params}만 방출하고, 표시는 표시 지점에서 리졸버로 해석한다
 * (status-i18n/studio-producer-error-i18n-exports-raster.ts의 rasterEdit 구간).
 *
 * 잔존 성분:
 * - documentLocked: 사유 원문이 입력(documentMutationBlockedReason)에서
 *   오는 패스스루라 params.message로 그대로 실어 현행 표시·문장 단위
 *   현지화 파이프라인(studio-filter-unavailable-reason-localization)과
 *   동등하게 유지한다.
 * - unsupportedFidelity.*: 조치 문장은 조치 코드(params.actions, 쉼표 구분)로
 *   코드화했고, 영향 레이어 라벨은 사용자 데이터라 params.layers(‘이름’
 *   인용·" · " 결합済)와 params.moreCount(초과 개수 또는 빈 문자열)로
 *   싣는다. 조립은 리졸버가 한다.
 */

export type StudioRasterEditReasonCode =
  | "invalidPageId"
  | "documentLocked"
  | "invalidDimensions.source"
  | "invalidDimensions.page"
  | "sourceSelectionMismatch.empty"
  | "sourceSelectionMismatch.changed"
  | "noVisibleSource.default"
  | "noVisibleSource.pixelSelection"
  | "sourceLocked"
  | "sourceBudgetExceeded.pixels"
  | "sourceBudgetExceeded.bytes"
  | "unsupportedFidelity.filter"
  | "unsupportedFidelity.effect"
  | "svgBudgetExceeded"
  | "stalePlan"
  | "invalidComposite.notPng"
  | "invalidComposite.pngTooLarge"
  | "invalidComposite.layerMismatch";

/** Result 실패 사유 — 표시 문구 대신 코드와 데이터 파라미터만 싣는다. */
export interface StudioRasterEditReason {
  readonly code: StudioRasterEditReasonCode;
  readonly params?: Readonly<Record<string, string>>;
}

export type StudioRasterEditErrorCode =
  | "aborted"
  | "filterStale"
  | "filterResolutionMismatch"
  | "filterLayerCountMismatch"
  | "filterNotPng"
  | "filterPngTooLarge"
  | "copyIdRequired"
  | "copyResultMismatch";

export class StudioRasterEditError extends Error {
  readonly code: StudioRasterEditErrorCode;
  readonly params?: Readonly<Record<string, string>>;

  constructor(
    code: StudioRasterEditErrorCode,
    params?: Readonly<Record<string, string>>,
    options?: { readonly name?: string },
  ) {
    super(code);
    this.name = options?.name ?? "StudioRasterEditError";
    this.code = code;
    if (params !== undefined) this.params = params;
  }
}
