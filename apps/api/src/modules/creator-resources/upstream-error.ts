/**
 * 업스트림 HTTP 오류. 상태 코드만 싣고 URL·본문·업스트림 원문은 노출하지 않는다.
 * 제공처가 "문서 없음"(404) 같은 영구 상태를 일시 장애와 구분해 분류할 때 쓴다.
 * 그 외의 모든 오류 경로는 종전처럼 상태 없는 일반 오류로 취급한다.
 */
export class UpstreamHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("upstream_response");
    this.name = "UpstreamHttpError";
    this.status = status;
  }
}
