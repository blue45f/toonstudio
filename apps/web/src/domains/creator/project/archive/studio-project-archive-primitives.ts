/**
 * Studio project archive 공용 상수·오류·코덱 리프 모듈 —
 * studio-project-archive.ts ↔ studio-project-archive-limits.ts / studio-project-archive-zip.ts
 * 순환 의존성 제거용.
 */

export const STUDIO_PROJECT_ARCHIVE_LIMITS = Object.freeze({
  maxArchiveBytes: 280_000_000,
  maxAttachmentBytes: 96_000_000,
  maxTotalAttachmentBytes: 256_000_000,
  maxProjectBytes: 16_000_000,
  maxManifestBytes: 4_000_000,
  maxAttachments: 512,
  maxReferences: 8_000,
  maxPathBytes: 256,
  maxDepth: 120,
  maxJsonNodes: 500_000,
});

export interface StudioProjectArchiveLimits {
  maxArchiveBytes: number;
  maxAttachmentBytes: number;
  maxTotalAttachmentBytes: number;
  maxProjectBytes: number;
  maxManifestBytes: number;
  maxAttachments: number;
  maxReferences: number;
  maxPathBytes: number;
  maxDepth: number;
  maxJsonNodes: number;
}

export type StudioProjectArchiveDiagnosticSeverity = "warning" | "error";

export type StudioProjectArchiveDiagnosticCode =
  | "ARCHIVE_INVALID"
  | "ARCHIVE_SIZE_LIMIT"
  | "ATTACHMENT_COUNT_LIMIT"
  | "ATTACHMENT_MISSING"
  | "ATTACHMENT_ORPHANED"
  | "ATTACHMENT_SIZE_LIMIT"
  | "CANONICAL_JSON_REQUIRED"
  | "CRC_MISMATCH"
  | "DOCUMENT_REFERENCE_CONFLICT"
  | "DOCUMENT_REFERENCE_MISSING"
  | "DOCUMENT_REFERENCE_MISMATCH"
  | "DUPLICATE_PATH"
  | "EXTERNAL_ATTACHMENT_DEPENDENCY"
  | "EXTERNAL_PROJECT_DEPENDENCY"
  | "HASH_MISMATCH"
  | "MANIFEST_INVALID"
  | "MIME_MISMATCH"
  | "MIME_SIGNATURE_MISMATCH"
  | "PATH_INVALID"
  | "PRIVACY_FIELD_REMOVED"
  | "PROJECT_INVALID"
  | "PROJECT_MISSING"
  | "PROJECT_SIZE_LIMIT"
  | "REFERENCE_LIMIT"
  | "UNEXPECTED_ENTRY"
  | "UNSUPPORTED_EMBEDDED_DATA"
  | "ZIP_BOMB"
  | "ZIP_COMPRESSION_UNSUPPORTED"
  | "ZIP_ENTRY_COUNT_LIMIT";

export interface StudioProjectArchiveDiagnostic {
  severity: StudioProjectArchiveDiagnosticSeverity;
  code: StudioProjectArchiveDiagnosticCode;
  /** 구조화 메시지 서브코드 (A4 D4) — 표시 문구는 status-i18n 리졸버가 해석한다. */
  variant: string;
  params?: Readonly<Record<string, string>>;
  path?: string;
  pointer?: string;
}

export class StudioProjectArchiveError extends Error {
  readonly code: StudioProjectArchiveDiagnosticCode;
  /** 구조화 메시지 서브코드 (A4 D4) — 표시 문구는 status-i18n 리졸버가 해석한다. */
  readonly variant: string;
  readonly params?: Readonly<Record<string, string>>;
  readonly diagnostics: StudioProjectArchiveDiagnostic[];

  constructor(
    code: StudioProjectArchiveDiagnosticCode,
    variant: string,
    details: Pick<StudioProjectArchiveDiagnostic, "path" | "pointer"> = {},
    params?: Readonly<Record<string, string>>,
    cause?: unknown,
  ) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "StudioProjectArchiveError";
    this.code = code;
    this.variant = variant;
    if (params !== undefined) this.params = params;
    this.diagnostics = [{
      severity: "error",
      code,
      variant,
      ...(params !== undefined ? { params } : {}),
      ...details,
    }];
  }
}

export const SAFE_ARCHIVE_PATH_PATTERN = /^[A-Za-z0-9._/-]+$/u;
export const textEncoder = new TextEncoder();
export const fatalTextDecoder = new TextDecoder("utf-8", { fatal: true });

export function fail(
  code: StudioProjectArchiveDiagnosticCode,
  variant: string,
  details: Pick<StudioProjectArchiveDiagnostic, "path" | "pointer"> = {},
  params?: Readonly<Record<string, string>>
): never {
  throw new StudioProjectArchiveError(code, variant, details, params);
}
