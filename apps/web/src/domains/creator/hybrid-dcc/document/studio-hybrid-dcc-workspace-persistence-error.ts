export type StudioHybridDccWorkspacePersistenceErrorCode =
  | "ABORTED"
  | "CORRUPT_PAYLOAD"
  | "INTEGRITY_FAILED"
  | "INVALID_SCOPE"
  | "INVALID_WORKSPACE"
  | "LOCK_UNAVAILABLE"
  | "OPFS_UNAVAILABLE"
  | "PAYLOAD_TOO_LARGE"
  | "QUOTA_EXCEEDED"
  | "SCOPE_MISMATCH"
  | "STORAGE_FAILED"
  | "UNSUPPORTED_VERSION";

export class StudioHybridDccWorkspacePersistenceError extends Error {
  readonly code: StudioHybridDccWorkspacePersistenceErrorCode;
  override readonly cause?: unknown;

  constructor(
    code: StudioHybridDccWorkspacePersistenceErrorCode,
    message: string,
    options: { readonly cause?: unknown } = {},
  ) {
    super(message);
    this.name = "StudioHybridDccWorkspacePersistenceError";
    this.code = code;
    this.cause = options.cause;
  }
}
