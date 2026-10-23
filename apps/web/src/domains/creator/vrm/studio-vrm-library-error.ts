/**
 * D4 구조화 방출 (R14, 2026-10-23): 생산자는 표시 문구 대신 구조화 코드+params를
 * 방출하고, 표시는 표시 지점(status-i18n/studio-producer-error-i18n-vrm-library의
 * vrmLibrary 구간 리졸버)에서만 해석한다. message는 코드 문자열 자체다.
 */
export type VrmLibraryErrorCode =
  | "blob-size-invalid" | "delete-conflict" | "expected-hash-format-invalid" | "glb-asset-version-invalid"
  | "glb-chunk-alignment-invalid" | "glb-chunk-header-truncated" | "glb-chunk-out-of-bounds" | "glb-first-chunk-not-json"
  | "glb-json-chunk-size-invalid" | "glb-json-parse-failed" | "glb-json-utf8-invalid" | "glb-length-mismatch"
  | "glb-magic-invalid" | "glb-structure-invalid" | "glb-too-large" | "glb-too-short" | "glb-version-unsupported"
  | "glb-vrm-extension-ambiguous" | "glb-vrm-extension-invalid" | "glb-vrm-extension-missing" | "hash-mismatch"
  | "hash-result-length-invalid" | "hash-unavailable" | "name-control-chars" | "name-too-long" | "read-incomplete"
  | "storage-unavailable" | "thumbnail-base64-corrupt" | "thumbnail-base64-unavailable" | "thumbnail-data-url-invalid"
  | "thumbnail-too-large";

export class VrmLibraryError extends Error {
  constructor(
    readonly code: VrmLibraryErrorCode,
    readonly params?: Readonly<Record<string, string>>,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "VrmLibraryError";
  }
}
