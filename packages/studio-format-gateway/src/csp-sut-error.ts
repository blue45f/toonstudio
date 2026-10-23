/**
 * A4 D4 조건부 묶음 7호 (R21): 깊은 파싱 오류(압력 그래프·스냅샷 검증)의 plain
 * Error 14곳을 코드화했다. 이 코드들은 두 흡수 경계와 충돌하지 않는다 —
 * 압력 그래프 오류는 programForRow의 parseGraphCell이 unsupported issue로,
 * 스냅샷 검증 오류는 importCspToolFile의 sqliteReader 경계가 issue로 흡수하며,
 * 두 경계 모두 message를 그대로 실으므로 흡수 동작은 무변경이다. 코드는 직접
 * 호출자(parseCspPressureGraph 공개 API 등)와 brush-pack의 causeCode 전파가
 * 소비한다. aborted는 표시 제외 코드다(이름 기반 처리 유지).
 */
export type CspToolFileErrorCode =
  | "aborted"
  | "invalid-options"
  | "source-too-large"
  | "pressure-graph-truncated"
  | "pressure-graph-unsupported-version"
  | "pressure-graph-invalid-header"
  | "pressure-graph-value-out-of-range"
  | "snapshot-invalid-structure"
  | "snapshot-limit-exceeded";

export class CspToolFileError extends Error {
  constructor(
    message: string,
    readonly code: CspToolFileErrorCode,
  ) {
    super(message);
    this.name = "CspToolFileError";
  }
}
