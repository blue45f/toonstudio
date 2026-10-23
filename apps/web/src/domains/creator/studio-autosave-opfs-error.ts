/**
 * A4 D4 (R15): studio-autosave-opfs-session 생산자의 구조화 오류 정의 — 기준선
 * 포화(1027줄)라 전용 파일로 추출했다(studio-comments-error.ts 선례).
 * 검증 오류는 표시 문구 대신 {code}만 방출하고(message = 코드 문자열), 표시는
 * 집계자 경계(studio-storage-recovery-runtime의 reportStudioSaveAuthorityDegraded)에서
 * 리졸버(status-i18n/studio-producer-error-i18n-autosave.ts)로만 해석한다.
 * DurabilityError는 사유 코드 보유 구조로 전환한다: code="durabilityFailed"이고
 * params.reason에 원인 체인에서 뽑은 구조화 사유 코드를 싣는다(표시 문구는 정적이라
 * reason은 진단·구조용 params다). DocumentBusyError는 표시 경로에서 제외돼 있어
 * 설계(r10-d4-trace-3.md §2.3)대로 현행 문구를 유지한다.
 */

export type StudioAutosaveOpfsErrorCode =
  | "invalidTimestamp"
  | "checkpointTooLarge"
  | "checkpointNotJson"
  | "checkpointSchema"
  | "checkpointIdentity"
  | "deletedCheckpointPayload"
  | "payloadIntegrity"
  | "payloadNotDocument"
  | "entryTooLarge"
  | "entryChunkBoundary"
  | "entryPartial"
  | "sessionIdentityEmpty"
  | "sessionDisposed"
  | "checkpointEmpty"
  | "revisionLimit"
  | "emptyWrite";

export class StudioAutosaveOpfsError extends Error {
  readonly code: StudioAutosaveOpfsErrorCode;
  readonly params?: Readonly<Record<string, string>>;

  constructor(code: StudioAutosaveOpfsErrorCode, params?: Readonly<Record<string, string>>) {
    super(code);
    this.name = "StudioAutosaveOpfsError";
    this.code = code;
    if (params !== undefined) this.params = params;
  }
}

/** 원인 체인에서 구조화 사유 코드를 뽑는다 — subcode 우선, 다음 code, 다음 cause 순. */
function durabilityReasonCode(cause: unknown, depth = 0): string {
  if (depth > 8 || typeof cause !== "object" || cause === null) return "unspecified";
  if (cause instanceof AggregateError) {
    for (const item of cause.errors) {
      const reason = durabilityReasonCode(item, depth + 1);
      if (reason !== "unspecified") return reason;
    }
  }
  const record = cause as { subcode?: unknown; code?: unknown; cause?: unknown };
  if (typeof record.subcode === "string" && record.subcode.length > 0) return record.subcode;
  if (typeof record.code === "string" && record.code.length > 0) return record.code;
  if (record.cause !== undefined && record.cause !== cause) {
    return durabilityReasonCode(record.cause, depth + 1);
  }
  return "unspecified";
}

export class StudioAutosaveDurabilityError extends Error {
  readonly code = "durabilityFailed" as const;
  readonly params: Readonly<{ reason: string }>;

  constructor(cause: unknown) {
    super("durabilityFailed", { cause });
    this.name = "StudioAutosaveDurabilityError";
    this.params = { reason: durabilityReasonCode(cause) };
  }
}

/**
 * Another tab on this origin owns the document. This is deliberately NOT a
 * `StudioAutosaveDurabilityError`: the difference between "storage broke" and "someone else is the
 * author of record" decides whether falling back to the second authority is a repair or a fork.
 */
export class StudioAutosaveDocumentBusyError extends Error {
  constructor(cause?: unknown) {
    super(
      "이 원고는 다른 탭에서 편집 중입니다. 이 탭의 변경은 저장되지 않습니다.",
      { cause },
    );
    this.name = "StudioAutosaveDocumentBusyError";
  }
}
