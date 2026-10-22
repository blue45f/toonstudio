// Brush pack import 공용 타입·경고 헬퍼·결과 계약 — studio-brush-pack-import.ts에서
// 추출했다(동작 무변경, 소스 크기 래칫 대응). 공개 API는 원 모듈이 그대로 재수출한다.
import type { StudioBrushOriginalSource } from "./studio-brush-original-source";
import type { StudioBrushSnapshot, StudioSavedBrush } from "./studio-brush-library";
import type { BrushLibraryBatchWriteSummary } from "./studio-brush-library-repository";
import type { StudioBrushPackFormat } from "./studio-brush-pack-format";
import type { FormatIssue } from "../../../../../../packages/studio-format-gateway/src/format-common";

/**
 * A4 D4 (R14): 브러시 팩 가져오기 실패 코드. 생산자는 표시 문구 대신
 * 구조화 코드(+params)만 방출하고(message = 코드 문자열), 표시는 표시
 * 지점(StudioBrushLibraryPanel·StudioCuttoonEditorHost의 catch)에서
 * 리졸버로 해석한다(status-i18n/studio-producer-error-i18n-brush.ts의
 * brushPack 구간). format 필드는 기존 계약 그대로 유지한다.
 * 잔존 4코드(bundleReadFailed·cspReadFailed·mybReadFailed·kppReadFailed)는
 * 하위 파서가 만든 동적 문자열(cause.message)을 분해할 수 없어, 정적 접두만
 * 코드화하고 동적부는 params.detail 패스스루로 싣는 부분 전환이다 — 하위
 * 파서가 코드를 방출하게 되면 params 코드화로 해소된다.
 * preserveOnly는 StudioBrushPackPreserveOnlyError가 같은 코드로 방출한다.
 */
export type StudioBrushPackErrorCode =
  | "cancelled"
  | "sourceTooLarge"
  | "fileTooLarge"
  | "jsonTooLarge"
  | "bundleReadFailed"
  | "cspReadFailed"
  | "mybReadFailed"
  | "kppReadFailed"
  | "preserveOnly";

export type StudioBrushProgramImportFormat =
  | "myb"
  | "kpp"
  | "sut"
  | "sutg"
  | "bundle"
  | "json";

export class StudioBrushProgramImportError extends Error {
  readonly code: StudioBrushPackErrorCode;
  readonly params?: Readonly<Record<string, string>>;

  constructor(
    code: StudioBrushPackErrorCode,
    readonly format: StudioBrushProgramImportFormat,
    params?: Readonly<Record<string, string>>,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "StudioBrushProgramImportError";
    this.code = code;
    if (params !== undefined) this.params = params;
  }
}

/**
 * A4 D4 (R14): 가져오기 경고 항목. 생산자는 코드(+params)만 방출하고,
 * 해석은 집계 경계인 studioBrushPackImportNotes에서만 한다(집계자 예외 —
 * notes는 표시 문구를 조립하는 요약 함수라 Panel·Host 양쪽 표시 지점이
 * 이 함수를 경유한다).
 * warn.passthrough는 게이트웨이 파서(csp·kpp 등 이 파일 밖 생산자)가 만든
 * 동적 문자열을 params.text로 그대로 싣는 패스스루다 — 그 문자열은 상태
 * 문구가 아니라 하위 파서의 데이터 표기라 로케일 대상이 아니다.
 * prefix는 프로그램 이름·경로 같은 데이터 표기 접두로, 해석 뒤에 붙는다.
 */
export type StudioBrushPackWarningCode =
  | "warn.strokeWidthClamped"
  | "warn.opacityClamped"
  | "warn.sizeCurveApproximated"
  | "warn.flowCurveApproximated"
  | "warn.imageTipFallback"
  | "warn.stampTipApproximated"
  | "warn.wetMixNotReflected"
  | "warn.pressureDefaulted"
  | "warn.kppEngineFallback"
  | "warn.valuesAdjusted"
  | "warn.passthrough";

export interface StudioBrushPackWarning {
  readonly code: StudioBrushPackWarningCode;
  readonly params?: Readonly<Record<string, string>>;
  readonly prefix?: string;
}

export function packWarning(
  code: StudioBrushPackWarningCode,
  params?: Readonly<Record<string, string>>,
): StudioBrushPackWarning {
  return params !== undefined ? { code, params } : { code };
}

export function passthroughWarning(text: string): StudioBrushPackWarning {
  return { code: "warn.passthrough", params: { text } };
}

export function withWarningPrefix(
  warning: StudioBrushPackWarning,
  prefix: string,
): StudioBrushPackWarning {
  return { ...warning, prefix };
}

export interface StudioBrushPackCandidate {
  /** Exact original file, kept separately from the drawable approximation. */
  readonly originalSource?: StudioBrushOriginalSource;
  readonly name: string;
  readonly snapshot: StudioBrushSnapshot;
  /** Stable source path for multi-resource bundles. */
  readonly sourcePath?: string;
  readonly tags?: readonly string[];
}

export interface StudioBrushPackRights {
  readonly authors: readonly string[];
  readonly licenses: readonly string[];
  readonly websites: readonly string[];
  readonly emails: readonly string[];
  readonly tags: readonly string[];
}

export interface StudioBrushPackPreservation {
  readonly status: "drawable" | "structured-partial" | "preserve-only";
  readonly sourceFormat: string;
  readonly originalBytesUnmodified: true;
  /** FormatGateway holds the original bytes in its sourcePayload for this result. */
  readonly sourcePayloadAvailable: boolean;
}

export interface StudioBrushPackImportResult {
  readonly format: StudioBrushPackFormat;
  readonly brushes: readonly StudioBrushPackCandidate[];
  /**
   * Source fields with no drawable counterpart. Shown to the artist verbatim —
   * this is the honest half of "the brush imported".
   */
  readonly unmapped: readonly string[];
  /** Approximations and parser notes worth reading before drawing. */
  readonly warnings: readonly StudioBrushPackWarning[];
  /** Structured unsupported ledger; never collapsed into a false success. */
  readonly unsupported?: readonly FormatIssue[];
  readonly rights?: StudioBrushPackRights;
  readonly preservation?: StudioBrushPackPreservation;
}

export interface StudioBrushPackCommitResult {
  readonly result: StudioBrushPackImportResult;
  readonly materialized: readonly StudioSavedBrush[];
  readonly saved: BrushLibraryBatchWriteSummary;
}

export class StudioBrushPackPreserveOnlyError extends Error {
  /**
   * A4 D4 (R14): 삽입되던 unsupported[0].message는 그 issue가 code를
   * 보유하므로 params.issueCode(` ${code}` 또는 빈 문자열)로 대체해
   * 전량 코드화했다 — 접두 문구는 리졸버의 preserveOnly 키가 제공한다.
   */
  readonly code = "preserveOnly" as const;
  readonly params: Readonly<Record<string, string>>;

  constructor(readonly result: StudioBrushPackImportResult) {
    super("preserveOnly");
    this.name = "StudioBrushPackPreserveOnlyError";
    const firstReason = result.unsupported?.[0];
    this.params = { issueCode: firstReason ? ` ${firstReason.code}` : "" };
  }
}

