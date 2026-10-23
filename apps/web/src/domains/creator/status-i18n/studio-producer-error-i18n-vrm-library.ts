/**
 * 생산자 구조화 에러 해석 모듈 — vrmLibrary·vrmRepo 구간: vrm-library 무코드 throw
 * 세부 코드 31종 + studio-vrm-asset-sqlite-opfs-repository 한글 3종 (A4 D4, R14).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와 동일하다:
 * 생산자는 {code/detailCode, params}만 방출하고, 표시는 이 모듈의 리졸버로만 해석한다.
 * ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규 번역이다.
 * vrm-library가 repository 오류 클래스로 방출하는 한글 2종(thumbnail base64·삭제 충돌)은
 * vrmLibrary 구간 키로, repository 자체의 한글 3종은 vrmRepo 구간 키로 해석한다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type { StudioVrmAssetRepositoryDetailCode } from "../vrm/studio-vrm-asset-sqlite-opfs-repository";
import type { VrmLibraryErrorCode } from "../vrm/vrm-library";

function resolveProducerError(
  key: string,
  fallback: string,
  params?: Readonly<Record<string, string>>,
): string {
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  const values = params ?? {};
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(values, token) ? String(values[token]) : placeholder,
  );
}

// === vrmLibrary 구간 ===
registerI18nLocaleEntries("ko", {
  "studio.producerError.vrmLibrary.glbTooShort": "VRM 파일이 너무 짧거나 GLB 헤더가 없습니다.",
  "studio.producerError.vrmLibrary.glbTooLarge": "VRM 파일은 {sizeMb}MB 이하여야 합니다.",
  "studio.producerError.vrmLibrary.glbMagicInvalid": "VRM 파일이 아닙니다. GLB 'glTF' 헤더를 확인해 주세요.",
  "studio.producerError.vrmLibrary.glbVersionUnsupported": "지원하지 않는 GLB 버전입니다. GLB 2.0 기반 VRM만 업로드할 수 있습니다.",
  "studio.producerError.vrmLibrary.glbLengthMismatch": "VRM 파일 길이 정보가 실제 바이트 길이와 일치하지 않습니다.",
  "studio.producerError.vrmLibrary.glbChunkHeaderTruncated": "VRM GLB 청크 헤더가 잘렸습니다.",
  "studio.producerError.vrmLibrary.glbChunkAlignmentInvalid": "VRM GLB 청크 길이는 4바이트 경계에 맞아야 합니다.",
  "studio.producerError.vrmLibrary.glbChunkOutOfBounds": "VRM GLB 청크 길이가 파일 범위를 벗어납니다.",
  "studio.producerError.vrmLibrary.glbFirstChunkNotJson": "VRM GLB의 첫 청크는 JSON이어야 합니다.",
  "studio.producerError.vrmLibrary.glbJsonChunkSizeInvalid": "VRM 메타데이터(JSON) 크기가 허용 범위를 벗어납니다.",
  "studio.producerError.vrmLibrary.glbJsonUtf8Invalid": "VRM 메타데이터가 올바른 UTF-8 JSON이 아닙니다.",
  "studio.producerError.vrmLibrary.glbJsonParseFailed": "VRM 메타데이터 JSON을 읽을 수 없습니다.",
  "studio.producerError.vrmLibrary.glbStructureInvalid": "VRM GLB 구조가 올바르지 않습니다.",
  "studio.producerError.vrmLibrary.glbAssetVersionInvalid": "VRM 메타데이터의 glTF asset.version은 2.0이어야 합니다.",
  "studio.producerError.vrmLibrary.glbVrmExtensionMissing": "GLB에 VRM 확장(VRM 또는 VRMC_vrm)이 없습니다.",
  "studio.producerError.vrmLibrary.glbVrmExtensionAmbiguous": "VRM 0.x와 1.x 확장을 동시에 포함한 모호한 파일은 사용할 수 없습니다.",
  "studio.producerError.vrmLibrary.glbVrmExtensionInvalid": "VRM 확장 메타데이터가 올바른 객체가 아닙니다.",
  "studio.producerError.vrmLibrary.blobSizeInvalid": "비어 있거나 길이가 올바르지 않은 VRM 파일입니다.",
  "studio.producerError.vrmLibrary.readIncomplete": "VRM 파일을 완전히 읽지 못했습니다. 파일을 다시 선택해 주세요.",
  "studio.producerError.vrmLibrary.hashResultLengthInvalid": "SHA-256 결과 길이가 올바르지 않습니다.",
  "studio.producerError.vrmLibrary.hashUnavailable": "이 브라우저에서는 VRM 콘텐츠 해시를 계산할 수 없습니다.",
  "studio.producerError.vrmLibrary.nameTooLong": "VRM 캐릭터 이름은 {limit}자 이하여야 합니다.",
  "studio.producerError.vrmLibrary.nameControlChars": "VRM 캐릭터 이름에 제어 문자를 사용할 수 없습니다.",
  "studio.producerError.vrmLibrary.storageUnavailable": "이 브라우저에서는 VRM 라이브러리 저장소를 사용할 수 없습니다.",
  "studio.producerError.vrmLibrary.thumbnailDataUrlInvalid": "VRM thumbnail은 canonical PNG/JPEG/WebP data URL이어야 합니다.",
  "studio.producerError.vrmLibrary.thumbnailBase64Corrupt": "VRM thumbnail base64가 손상되었습니다.",
  "studio.producerError.vrmLibrary.thumbnailTooLarge": "VRM thumbnail은 2 MiB 이하여야 합니다.",
  "studio.producerError.vrmLibrary.thumbnailBase64Unavailable": "이 환경에서는 VRM thumbnail base64를 만들 수 없습니다.",
  "studio.producerError.vrmLibrary.expectedHashFormatInvalid": "예상 VRM 해시는 sha256: 뒤에 64자리 16진수여야 합니다.",
  "studio.producerError.vrmLibrary.hashMismatch": "VRM 파일의 SHA-256 해시가 프로젝트에 기록된 값과 일치하지 않습니다.",
  "studio.producerError.vrmLibrary.deleteConflict": "저장된 VRM은 프로젝트에서 콘텐츠 해시로 참조될 수 있어 현재 삭제할 수 없습니다. 프로젝트 참조 소유권 검사가 제공될 때까지 원본을 보존합니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.vrmLibrary.glbTooShort": "The VRM file is too short or has no GLB header.",
  "studio.producerError.vrmLibrary.glbTooLarge": "The VRM file must be {sizeMb}MB or smaller.",
  "studio.producerError.vrmLibrary.glbMagicInvalid": "This is not a VRM file. Please check the GLB 'glTF' header.",
  "studio.producerError.vrmLibrary.glbVersionUnsupported": "Unsupported GLB version. Only GLB 2.0 based VRMs can be uploaded.",
  "studio.producerError.vrmLibrary.glbLengthMismatch": "The VRM file length information does not match the actual byte length.",
  "studio.producerError.vrmLibrary.glbChunkHeaderTruncated": "The VRM GLB chunk header is truncated.",
  "studio.producerError.vrmLibrary.glbChunkAlignmentInvalid": "The VRM GLB chunk length must align to a 4-byte boundary.",
  "studio.producerError.vrmLibrary.glbChunkOutOfBounds": "The VRM GLB chunk length exceeds the file bounds.",
  "studio.producerError.vrmLibrary.glbFirstChunkNotJson": "The first chunk of the VRM GLB must be JSON.",
  "studio.producerError.vrmLibrary.glbJsonChunkSizeInvalid": "The VRM metadata (JSON) size is outside the allowed range.",
  "studio.producerError.vrmLibrary.glbJsonUtf8Invalid": "The VRM metadata is not valid UTF-8 JSON.",
  "studio.producerError.vrmLibrary.glbJsonParseFailed": "Could not read the VRM metadata JSON.",
  "studio.producerError.vrmLibrary.glbStructureInvalid": "The VRM GLB structure is invalid.",
  "studio.producerError.vrmLibrary.glbAssetVersionInvalid": "The glTF asset.version in the VRM metadata must be 2.0.",
  "studio.producerError.vrmLibrary.glbVrmExtensionMissing": "The GLB has no VRM extension (VRM or VRMC_vrm).",
  "studio.producerError.vrmLibrary.glbVrmExtensionAmbiguous": "Ambiguous files that contain both VRM 0.x and 1.x extensions cannot be used.",
  "studio.producerError.vrmLibrary.glbVrmExtensionInvalid": "The VRM extension metadata is not a valid object.",
  "studio.producerError.vrmLibrary.blobSizeInvalid": "The VRM file is empty or has an invalid length.",
  "studio.producerError.vrmLibrary.readIncomplete": "Could not read the entire VRM file. Please select the file again.",
  "studio.producerError.vrmLibrary.hashResultLengthInvalid": "The SHA-256 result length is invalid.",
  "studio.producerError.vrmLibrary.hashUnavailable": "The VRM content hash cannot be computed in this browser.",
  "studio.producerError.vrmLibrary.nameTooLong": "The VRM character name must be {limit} characters or fewer.",
  "studio.producerError.vrmLibrary.nameControlChars": "Control characters cannot be used in the VRM character name.",
  "studio.producerError.vrmLibrary.storageUnavailable": "The VRM library storage is unavailable in this browser.",
  "studio.producerError.vrmLibrary.thumbnailDataUrlInvalid": "The VRM thumbnail must be a canonical PNG/JPEG/WebP data URL.",
  "studio.producerError.vrmLibrary.thumbnailBase64Corrupt": "The VRM thumbnail base64 is corrupted.",
  "studio.producerError.vrmLibrary.thumbnailTooLarge": "The VRM thumbnail must be 2 MiB or smaller.",
  "studio.producerError.vrmLibrary.thumbnailBase64Unavailable": "VRM thumbnail base64 cannot be created in this environment.",
  "studio.producerError.vrmLibrary.expectedHashFormatInvalid": "The expected VRM hash must be 64 hexadecimal digits after sha256:.",
  "studio.producerError.vrmLibrary.hashMismatch": "The VRM file's SHA-256 hash does not match the value recorded in the project.",
  "studio.producerError.vrmLibrary.deleteConflict": "The saved VRM may be referenced from a project by content hash, so it cannot be deleted right now. The original is preserved until a project reference ownership check is provided.",
});

const VRM_LIBRARY_ERROR_KEYS: Readonly<Record<VrmLibraryErrorCode, string>> = {
  "glb-too-short": "studio.producerError.vrmLibrary.glbTooShort",
  "glb-too-large": "studio.producerError.vrmLibrary.glbTooLarge",
  "glb-magic-invalid": "studio.producerError.vrmLibrary.glbMagicInvalid",
  "glb-version-unsupported": "studio.producerError.vrmLibrary.glbVersionUnsupported",
  "glb-length-mismatch": "studio.producerError.vrmLibrary.glbLengthMismatch",
  "glb-chunk-header-truncated": "studio.producerError.vrmLibrary.glbChunkHeaderTruncated",
  "glb-chunk-alignment-invalid": "studio.producerError.vrmLibrary.glbChunkAlignmentInvalid",
  "glb-chunk-out-of-bounds": "studio.producerError.vrmLibrary.glbChunkOutOfBounds",
  "glb-first-chunk-not-json": "studio.producerError.vrmLibrary.glbFirstChunkNotJson",
  "glb-json-chunk-size-invalid": "studio.producerError.vrmLibrary.glbJsonChunkSizeInvalid",
  "glb-json-utf8-invalid": "studio.producerError.vrmLibrary.glbJsonUtf8Invalid",
  "glb-json-parse-failed": "studio.producerError.vrmLibrary.glbJsonParseFailed",
  "glb-structure-invalid": "studio.producerError.vrmLibrary.glbStructureInvalid",
  "glb-asset-version-invalid": "studio.producerError.vrmLibrary.glbAssetVersionInvalid",
  "glb-vrm-extension-missing": "studio.producerError.vrmLibrary.glbVrmExtensionMissing",
  "glb-vrm-extension-ambiguous": "studio.producerError.vrmLibrary.glbVrmExtensionAmbiguous",
  "glb-vrm-extension-invalid": "studio.producerError.vrmLibrary.glbVrmExtensionInvalid",
  "blob-size-invalid": "studio.producerError.vrmLibrary.blobSizeInvalid",
  "read-incomplete": "studio.producerError.vrmLibrary.readIncomplete",
  "hash-result-length-invalid": "studio.producerError.vrmLibrary.hashResultLengthInvalid",
  "hash-unavailable": "studio.producerError.vrmLibrary.hashUnavailable",
  "name-too-long": "studio.producerError.vrmLibrary.nameTooLong",
  "name-control-chars": "studio.producerError.vrmLibrary.nameControlChars",
  "storage-unavailable": "studio.producerError.vrmLibrary.storageUnavailable",
  "thumbnail-data-url-invalid": "studio.producerError.vrmLibrary.thumbnailDataUrlInvalid",
  "thumbnail-base64-corrupt": "studio.producerError.vrmLibrary.thumbnailBase64Corrupt",
  "thumbnail-too-large": "studio.producerError.vrmLibrary.thumbnailTooLarge",
  "thumbnail-base64-unavailable": "studio.producerError.vrmLibrary.thumbnailBase64Unavailable",
  "expected-hash-format-invalid": "studio.producerError.vrmLibrary.expectedHashFormatInvalid",
  "hash-mismatch": "studio.producerError.vrmLibrary.hashMismatch",
  "delete-conflict": "studio.producerError.vrmLibrary.deleteConflict",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const VRM_LIBRARY_ERROR_KO: Readonly<Record<VrmLibraryErrorCode, string>> = {
  "glb-too-short": "VRM 파일이 너무 짧거나 GLB 헤더가 없습니다.",
  "glb-too-large": "VRM 파일은 {sizeMb}MB 이하여야 합니다.",
  "glb-magic-invalid": "VRM 파일이 아닙니다. GLB 'glTF' 헤더를 확인해 주세요.",
  "glb-version-unsupported": "지원하지 않는 GLB 버전입니다. GLB 2.0 기반 VRM만 업로드할 수 있습니다.",
  "glb-length-mismatch": "VRM 파일 길이 정보가 실제 바이트 길이와 일치하지 않습니다.",
  "glb-chunk-header-truncated": "VRM GLB 청크 헤더가 잘렸습니다.",
  "glb-chunk-alignment-invalid": "VRM GLB 청크 길이는 4바이트 경계에 맞아야 합니다.",
  "glb-chunk-out-of-bounds": "VRM GLB 청크 길이가 파일 범위를 벗어납니다.",
  "glb-first-chunk-not-json": "VRM GLB의 첫 청크는 JSON이어야 합니다.",
  "glb-json-chunk-size-invalid": "VRM 메타데이터(JSON) 크기가 허용 범위를 벗어납니다.",
  "glb-json-utf8-invalid": "VRM 메타데이터가 올바른 UTF-8 JSON이 아닙니다.",
  "glb-json-parse-failed": "VRM 메타데이터 JSON을 읽을 수 없습니다.",
  "glb-structure-invalid": "VRM GLB 구조가 올바르지 않습니다.",
  "glb-asset-version-invalid": "VRM 메타데이터의 glTF asset.version은 2.0이어야 합니다.",
  "glb-vrm-extension-missing": "GLB에 VRM 확장(VRM 또는 VRMC_vrm)이 없습니다.",
  "glb-vrm-extension-ambiguous": "VRM 0.x와 1.x 확장을 동시에 포함한 모호한 파일은 사용할 수 없습니다.",
  "glb-vrm-extension-invalid": "VRM 확장 메타데이터가 올바른 객체가 아닙니다.",
  "blob-size-invalid": "비어 있거나 길이가 올바르지 않은 VRM 파일입니다.",
  "read-incomplete": "VRM 파일을 완전히 읽지 못했습니다. 파일을 다시 선택해 주세요.",
  "hash-result-length-invalid": "SHA-256 결과 길이가 올바르지 않습니다.",
  "hash-unavailable": "이 브라우저에서는 VRM 콘텐츠 해시를 계산할 수 없습니다.",
  "name-too-long": "VRM 캐릭터 이름은 {limit}자 이하여야 합니다.",
  "name-control-chars": "VRM 캐릭터 이름에 제어 문자를 사용할 수 없습니다.",
  "storage-unavailable": "이 브라우저에서는 VRM 라이브러리 저장소를 사용할 수 없습니다.",
  "thumbnail-data-url-invalid": "VRM thumbnail은 canonical PNG/JPEG/WebP data URL이어야 합니다.",
  "thumbnail-base64-corrupt": "VRM thumbnail base64가 손상되었습니다.",
  "thumbnail-too-large": "VRM thumbnail은 2 MiB 이하여야 합니다.",
  "thumbnail-base64-unavailable": "이 환경에서는 VRM thumbnail base64를 만들 수 없습니다.",
  "expected-hash-format-invalid": "예상 VRM 해시는 sha256: 뒤에 64자리 16진수여야 합니다.",
  "hash-mismatch": "VRM 파일의 SHA-256 해시가 프로젝트에 기록된 값과 일치하지 않습니다.",
  "delete-conflict": "저장된 VRM은 프로젝트에서 콘텐츠 해시로 참조될 수 있어 현재 삭제할 수 없습니다. 프로젝트 참조 소유권 검사가 제공될 때까지 원본을 보존합니다.",
};

/** 표시 지점 전용 해석 (vrmLibrary): 구조화 코드를 현재 로케일 문구로 바꾼다. */
export function resolveStudioVrmLibraryError(
  error: Pick<{ code: VrmLibraryErrorCode; params?: Readonly<Record<string, string>> }, "code" | "params">,
): string {
  return resolveProducerError(VRM_LIBRARY_ERROR_KEYS[error.code], VRM_LIBRARY_ERROR_KO[error.code], error.params);
}

// === vrmRepo 구간 ===
registerI18nLocaleEntries("ko", {
  "studio.producerError.vrmRepo.aborted": "VRM 자산 저장 작업이 취소되었습니다.",
  "studio.producerError.vrmRepo.opfsUnavailable": "이 환경에서는 VRM 자산용 OPFS를 사용할 수 없습니다. 현재 탭 메모리 임시 상태만 사용할 수 있습니다.",
  "studio.producerError.vrmRepo.databaseOpenFailed": "VRM 자산용 shared SQLite/OPFS 권위를 열지 못했습니다. 현재 탭 메모리 임시 상태만 유지됩니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.vrmRepo.aborted": "The VRM asset save operation was cancelled.",
  "studio.producerError.vrmRepo.opfsUnavailable": "OPFS for VRM assets is unavailable in this environment. Only the current tab's in-memory temporary state can be used.",
  "studio.producerError.vrmRepo.databaseOpenFailed": "Could not open the shared SQLite/OPFS authority for VRM assets. Only the current tab's in-memory temporary state is kept.",
});

const VRM_REPO_ERROR_KEYS: Readonly<Partial<Record<StudioVrmAssetRepositoryDetailCode, string>>> = {
  aborted: "studio.producerError.vrmRepo.aborted",
  "database-open-failed": "studio.producerError.vrmRepo.databaseOpenFailed",
  "opfs-unavailable": "studio.producerError.vrmRepo.opfsUnavailable",
};

const VRM_REPO_ERROR_KO: Readonly<Partial<Record<StudioVrmAssetRepositoryDetailCode, string>>> = {
  "aborted": "VRM 자산 저장 작업이 취소되었습니다.",
  "opfs-unavailable": "이 환경에서는 VRM 자산용 OPFS를 사용할 수 없습니다. 현재 탭 메모리 임시 상태만 사용할 수 있습니다.",
  "database-open-failed": "VRM 자산용 shared SQLite/OPFS 권위를 열지 못했습니다. 현재 탭 메모리 임시 상태만 유지됩니다.",
};

/** 표시 지점 전용 해석 (vrmRepo): repository 세부 코드를 현재 로케일 문구로 바꾼다. */
export function resolveStudioVrmRepoError(
  error: Pick<{ detailCode: StudioVrmAssetRepositoryDetailCode; params?: Readonly<Record<string, string>> }, "detailCode" | "params">,
): string | null {
  const key = VRM_REPO_ERROR_KEYS[error.detailCode];
  const fallback = VRM_REPO_ERROR_KO[error.detailCode];
  if (!key || !fallback) return null;
  return resolveProducerError(key, fallback, error.params);
}

const REPO_DETAIL_TO_LIBRARY_CODE: Readonly<Partial<Record<StudioVrmAssetRepositoryDetailCode, VrmLibraryErrorCode>>> = {
  "delete-conflict": "delete-conflict",
  "thumbnail-base64-unavailable": "thumbnail-base64-unavailable",
};

/**
 * 표시 지점 전용 해석 (vrmLibrary·vrmRepo, 원인 객체 진입점): model-loading의
 * getErrorMessage 호출부가 원인 객체만으로 부른다(집계자 예외 — 범용 getErrorMessage
 * 자체는 바꾸지 않고, 호출부에서 code/detailCode 보유 시에만 이 함수로 해석한다).
 * 생산자 클래스를 런타임 import하면 진입 그래프에 vrm 저장소가 끌려오므로,
 * 이름+코드 덕 타이핑으로 판정한다. 해당하지 않으면 null이다.
 */
export function resolveStudioVrmLibraryErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, detailCode, params } = cause as {
    name?: unknown; code?: unknown; detailCode?: unknown; params?: unknown;
  };
  const safeParams =
    params && typeof params === "object" && !Array.isArray(params)
      ? (params as Readonly<Record<string, string>>)
      : undefined;
  if (name === "VrmLibraryError" && typeof code === "string" && Object.hasOwn(VRM_LIBRARY_ERROR_KEYS, code)) {
    return resolveStudioVrmLibraryError({
      code: code as VrmLibraryErrorCode,
      ...(safeParams ? { params: safeParams } : {}),
    });
  }
  if (typeof detailCode === "string") {
    const detail = detailCode as StudioVrmAssetRepositoryDetailCode;
    const repoResolved = resolveStudioVrmRepoError({
      detailCode: detail,
      ...(safeParams ? { params: safeParams } : {}),
    });
    if (repoResolved) return repoResolved;
    const libraryCode = REPO_DETAIL_TO_LIBRARY_CODE[detail];
    if (libraryCode) {
      return resolveStudioVrmLibraryError({
        code: libraryCode,
        ...(safeParams ? { params: safeParams } : {}),
      });
    }
  }
  return null;
}
