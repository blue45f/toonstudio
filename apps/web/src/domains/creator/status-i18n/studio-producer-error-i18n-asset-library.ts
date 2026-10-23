/**
 * 생산자 구조화 에러 해석 모듈 — 에셋 보관함 구간: studio-asset-library-sqlite-opfs
 * repository 오류 55 subcode + 필드 라벨 7키 + 작업 라벨 4키 (A4 D4, R15,
 * 설계 r10-d4-trace-3.md §2.1).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와 동일하다:
 * 생산자는 {code, subcode, params}만 방출하고(message = 거친 코드 문자열), 표시는
 * 이 모듈의 리졸버로만 해석한다. ko 값은 이관 전 생산자 원문과 글자 단위 동일하고,
 * en은 신규 번역이다. {label}·{operation} params는 생산자가 라벨 코드로 방출하고
 * 이 모듈의 라벨 표로 표시 라벨로 되돌린다. {detail}은 하위 OPFS/SQLite 원문
 * 패스스루라 그대로 전개한다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

import type {
  StudioAssetLibraryFieldLabelCode,
  StudioAssetLibraryOperationCode,
  StudioAssetLibraryRepositoryErrorSubcode,
} from "../studio-asset-library-repository-error";

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

registerI18nLocaleEntries("ko", {
  "studio.producerError.assetLibrary.quotaExceeded": "SQLite/OPFS 에셋 {operation} 중 저장 공간이 부족합니다.",
  "studio.producerError.assetLibrary.operationFailed": "SQLite/OPFS 에셋 {operation}를 완료하지 못했습니다: {detail}",
  "studio.producerError.assetLibrary.fieldMustBeString": "{label}은 문자열이어야 합니다.",
  "studio.producerError.assetLibrary.fieldLengthOrChars": "{label}의 길이 또는 문자가 허용 범위를 벗어났습니다.",
  "studio.producerError.assetLibrary.fieldMustBeStringOrNull": "{label}은 문자열 또는 null이어야 합니다.",
  "studio.producerError.assetLibrary.fieldLength": "{label}의 길이가 허용 범위를 벗어났습니다.",
  "studio.producerError.assetLibrary.rightsInvalid": "에셋 권리 메타데이터가 올바르지 않습니다.",
  "studio.producerError.assetLibrary.rightsUnknownField": "에셋 권리 메타데이터에 알 수 없는 필드가 있습니다.",
  "studio.producerError.assetLibrary.rightsSourceKind": "에셋 권리 sourceKind가 올바르지 않습니다.",
  "studio.producerError.assetLibrary.rightsUrlHttps": "권리 URL은 HTTPS여야 합니다.",
  "studio.producerError.assetLibrary.rightsUrlInvalid": "권리 URL이 올바르지 않습니다.",
  "studio.producerError.assetLibrary.attributionType": "attributionRequired는 boolean 또는 null이어야 합니다.",
  "studio.producerError.assetLibrary.rightsConfirmedType": "rightsConfirmed는 boolean이어야 합니다.",
  "studio.producerError.assetLibrary.entryNotObject": "에셋 manifest entry가 객체가 아닙니다.",
  "studio.producerError.assetLibrary.entryFields": "에셋 manifest entry 필드가 올바르지 않습니다.",
  "studio.producerError.assetLibrary.entryIdFormat": "에셋 ID가 안전한 canonical 형식이 아닙니다.",
  "studio.producerError.assetLibrary.entryContentHash": "에셋 contentHash가 올바르지 않습니다.",
  "studio.producerError.assetLibrary.entryByteSize": "에셋 byteSize가 허용 범위를 벗어났습니다.",
  "studio.producerError.assetLibrary.entryMime": "에셋 MIME이 canonical 형식이 아닙니다.",
  "studio.producerError.assetLibrary.entrySize": "에셋 크기가 허용 범위를 벗어났습니다.",
  "studio.producerError.assetLibrary.entryCreatedAt": "에셋 createdAt이 올바르지 않습니다.",
  "studio.producerError.assetLibrary.tooManyAssets": "에셋 보관함은 최대 {max}개까지 저장할 수 있습니다.",
  "studio.producerError.assetLibrary.duplicateAssetId": "중복 에셋 ID가 있습니다: {id}",
  "studio.producerError.assetLibrary.totalBytesExceeded": "에셋 보관함의 총 원본 바이트가 1 GiB 상한을 넘었습니다.",
  "studio.producerError.assetLibrary.manifestTooLarge": "에셋 SQLite manifest가 8 MiB 상한을 넘었습니다.",
  "studio.producerError.assetLibrary.manifestSizeLimit": "에셋 SQLite manifest가 크기 상한을 넘었습니다.",
  "studio.producerError.assetLibrary.manifestJsonCorrupt": "에셋 SQLite manifest JSON이 끊어졌거나 손상되었습니다.",
  "studio.producerError.assetLibrary.manifestNotObject": "에셋 SQLite manifest가 객체가 아닙니다.",
  "studio.producerError.assetLibrary.manifestVersionOrFields": "에셋 SQLite manifest 버전 또는 필드가 올바르지 않습니다.",
  "studio.producerError.assetLibrary.manifestCanonicalMismatch": "에셋 SQLite manifest가 canonical 원장과 일치하지 않습니다.",
  "studio.producerError.assetLibrary.manifestCorrupt": "에셋 SQLite manifest가 손상되었습니다.",
  "studio.producerError.assetLibrary.dataUrlTooLarge": "복원한 에셋 data URL이 제품 경계 상한을 넘었습니다.",
  "studio.producerError.assetLibrary.casVerificationFailed": "에셋 CAS 검증에 실패했습니다: {id}",
  "studio.producerError.assetLibrary.casBlobMissing": "에셋 CAS blob이 없습니다: {id}",
  "studio.producerError.assetLibrary.casLedgerMismatch": "에셋 CAS hash/size/MIME 원장이 일치하지 않습니다: {id}",
  "studio.producerError.assetLibrary.searchTooLong": "에셋 검색어가 너무 깁니다.",
  "studio.producerError.assetLibrary.binaryStoreOpfsUnavailable": "OPFS를 사용할 수 없어 에셋 바이너리 보관함을 열 수 없습니다.",
  "studio.producerError.assetLibrary.casIndexReadFailed": "에셋 CAS 색인을 읽지 못했습니다: {id}",
  "studio.producerError.assetLibrary.casManifestLedgerMismatch": "에셋 CAS manifest 원장이 일치하지 않습니다: {id}",
  "studio.producerError.assetLibrary.commitReconcileFailed": "SQLite/OPFS 에셋 manifest 커밋 결과를 재확인하지 못했습니다. old/candidate CAS union은 보존됩니다.",
  "studio.producerError.assetLibrary.commitRollbackFailed": "SQLite/OPFS 에셋 manifest 미커밋 확인 뒤 owner 참조를 되돌리지 못했습니다.",
  "studio.producerError.assetLibrary.manifestMismatch": "SQLite/OPFS 에셋 manifest가 old/candidate 어느 쪽과도 일치하지 않아 CAS union을 보존한 채 중단했습니다.",
  "studio.producerError.assetLibrary.webLocksUnavailable": "Web Locks가 없어 여러 탭의 SQLite/OPFS 에셋 쓰기를 안전하게 직렬화할 수 없습니다.",
  "studio.producerError.assetLibrary.bytesDecodeFailed": "에셋 바이트를 해석하지 못했습니다: {detail}",
  "studio.producerError.assetLibrary.bytesOutOfRange": "에셋 원본 바이트가 1 B~64 MiB 범위를 벗어났습니다.",
  "studio.producerError.assetLibrary.generatedIdFormat": "생성된 에셋 ID가 안전한 형식이 아닙니다.",
  "studio.producerError.assetLibrary.generatedIdConflict": "생성된 에셋 ID가 기존 행과 충돌했습니다.",
  "studio.producerError.assetLibrary.contentHashMismatch": "제공된 contentHash가 실제 에셋 바이트 SHA-256과 일치하지 않습니다.",
  "studio.producerError.assetLibrary.casReceiptMismatch": "OPFS CAS 저장 영수증의 hash/size/MIME이 입력과 일치하지 않습니다.",
  "studio.producerError.assetLibrary.committedEntryMissing": "커밋된 manifest에서 신규 에셋을 찾지 못했습니다.",
  "studio.producerError.assetLibrary.pageLimit": "에셋 page limit은 1~{max}이어야 합니다.",
  "studio.producerError.assetLibrary.cursorInvalid": "에셋 pagination cursor가 올바르지 않습니다.",
  "studio.producerError.assetLibrary.deleteIdInvalid": "삭제할 에셋 ID가 올바르지 않습니다.",
  "studio.producerError.assetLibrary.renameIdInvalid": "이름을 바꿀 에셋 ID가 올바르지 않습니다.",
  "studio.producerError.assetLibrary.notFound": "에셋을 찾을 수 없습니다.",
  "studio.producerError.assetLibrary.fieldRightsSourceId": "권리 sourceId",
  "studio.producerError.assetLibrary.fieldRightsLicenseId": "권리 licenseId",
  "studio.producerError.assetLibrary.fieldRightsLicenseLabel": "권리 licenseLabel",
  "studio.producerError.assetLibrary.fieldRightsLicenseUrl": "권리 licenseUrl",
  "studio.producerError.assetLibrary.fieldRightsAttributionText": "권리 attributionText",
  "studio.producerError.assetLibrary.fieldAssetName": "에셋 이름",
  "studio.producerError.assetLibrary.fieldAssetKind": "에셋 kind",
  "studio.producerError.assetLibrary.operationOpen": "열기",
  "studio.producerError.assetLibrary.operationManifestRead": "manifest 읽기",
  "studio.producerError.assetLibrary.operationBlobSave": "blob 저장",
  "studio.producerError.assetLibrary.operationManifestCommit": "manifest 커밋",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.assetLibrary.quotaExceeded": "Ran out of storage during the SQLite/OPFS asset operation ({operation}).",
  "studio.producerError.assetLibrary.operationFailed": "Could not complete the SQLite/OPFS asset operation ({operation}): {detail}",
  "studio.producerError.assetLibrary.fieldMustBeString": "{label} must be a string.",
  "studio.producerError.assetLibrary.fieldLengthOrChars": "The length or characters of {label} are out of the allowed range.",
  "studio.producerError.assetLibrary.fieldMustBeStringOrNull": "{label} must be a string or null.",
  "studio.producerError.assetLibrary.fieldLength": "The length of {label} is out of the allowed range.",
  "studio.producerError.assetLibrary.rightsInvalid": "The asset rights metadata is invalid.",
  "studio.producerError.assetLibrary.rightsUnknownField": "The asset rights metadata contains an unknown field.",
  "studio.producerError.assetLibrary.rightsSourceKind": "The asset rights sourceKind is invalid.",
  "studio.producerError.assetLibrary.rightsUrlHttps": "The rights URL must use HTTPS.",
  "studio.producerError.assetLibrary.rightsUrlInvalid": "The rights URL is invalid.",
  "studio.producerError.assetLibrary.attributionType": "attributionRequired must be a boolean or null.",
  "studio.producerError.assetLibrary.rightsConfirmedType": "rightsConfirmed must be a boolean.",
  "studio.producerError.assetLibrary.entryNotObject": "The asset manifest entry is not an object.",
  "studio.producerError.assetLibrary.entryFields": "The asset manifest entry fields are invalid.",
  "studio.producerError.assetLibrary.entryIdFormat": "The asset ID is not in a safe canonical format.",
  "studio.producerError.assetLibrary.entryContentHash": "The asset contentHash is invalid.",
  "studio.producerError.assetLibrary.entryByteSize": "The asset byteSize is out of the allowed range.",
  "studio.producerError.assetLibrary.entryMime": "The asset MIME type is not in canonical format.",
  "studio.producerError.assetLibrary.entrySize": "The asset dimensions are out of the allowed range.",
  "studio.producerError.assetLibrary.entryCreatedAt": "The asset createdAt is invalid.",
  "studio.producerError.assetLibrary.tooManyAssets": "The asset library can store at most {max} assets.",
  "studio.producerError.assetLibrary.duplicateAssetId": "There is a duplicate asset ID: {id}",
  "studio.producerError.assetLibrary.totalBytesExceeded": "The asset library's total original bytes exceed the 1 GiB limit.",
  "studio.producerError.assetLibrary.manifestTooLarge": "The asset SQLite manifest exceeds the 8 MiB limit.",
  "studio.producerError.assetLibrary.manifestSizeLimit": "The asset SQLite manifest exceeds the size limit.",
  "studio.producerError.assetLibrary.manifestJsonCorrupt": "The asset SQLite manifest JSON is truncated or corrupted.",
  "studio.producerError.assetLibrary.manifestNotObject": "The asset SQLite manifest is not an object.",
  "studio.producerError.assetLibrary.manifestVersionOrFields": "The asset SQLite manifest version or fields are invalid.",
  "studio.producerError.assetLibrary.manifestCanonicalMismatch": "The asset SQLite manifest does not match the canonical ledger.",
  "studio.producerError.assetLibrary.manifestCorrupt": "The asset SQLite manifest is corrupted.",
  "studio.producerError.assetLibrary.dataUrlTooLarge": "The restored asset data URL exceeds the product boundary limit.",
  "studio.producerError.assetLibrary.casVerificationFailed": "Asset CAS verification failed: {id}",
  "studio.producerError.assetLibrary.casBlobMissing": "The asset CAS blob is missing: {id}",
  "studio.producerError.assetLibrary.casLedgerMismatch": "The asset CAS hash/size/MIME ledger does not match: {id}",
  "studio.producerError.assetLibrary.searchTooLong": "The asset search query is too long.",
  "studio.producerError.assetLibrary.binaryStoreOpfsUnavailable": "Could not open the asset binary store because OPFS is unavailable.",
  "studio.producerError.assetLibrary.casIndexReadFailed": "Could not read the asset CAS index: {id}",
  "studio.producerError.assetLibrary.casManifestLedgerMismatch": "The asset CAS manifest ledger does not match: {id}",
  "studio.producerError.assetLibrary.commitReconcileFailed": "Could not re-verify the SQLite/OPFS asset manifest commit result. The old/candidate CAS union is preserved.",
  "studio.producerError.assetLibrary.commitRollbackFailed": "Could not roll back the owner references after confirming the SQLite/OPFS asset manifest was not committed.",
  "studio.producerError.assetLibrary.manifestMismatch": "The SQLite/OPFS asset manifest matches neither the old nor the candidate version, so the operation stopped with the CAS union preserved.",
  "studio.producerError.assetLibrary.webLocksUnavailable": "Could not safely serialize SQLite/OPFS asset writes across tabs because Web Locks is unavailable.",
  "studio.producerError.assetLibrary.bytesDecodeFailed": "Could not decode the asset bytes: {detail}",
  "studio.producerError.assetLibrary.bytesOutOfRange": "The original asset bytes are outside the 1 B–64 MiB range.",
  "studio.producerError.assetLibrary.generatedIdFormat": "The generated asset ID is not in a safe format.",
  "studio.producerError.assetLibrary.generatedIdConflict": "The generated asset ID conflicts with an existing row.",
  "studio.producerError.assetLibrary.contentHashMismatch": "The provided contentHash does not match the actual asset bytes SHA-256.",
  "studio.producerError.assetLibrary.casReceiptMismatch": "The OPFS CAS storage receipt's hash/size/MIME does not match the input.",
  "studio.producerError.assetLibrary.committedEntryMissing": "Could not find the new asset in the committed manifest.",
  "studio.producerError.assetLibrary.pageLimit": "The asset page limit must be between 1 and {max}.",
  "studio.producerError.assetLibrary.cursorInvalid": "The asset pagination cursor is invalid.",
  "studio.producerError.assetLibrary.deleteIdInvalid": "The asset ID to delete is invalid.",
  "studio.producerError.assetLibrary.renameIdInvalid": "The asset ID to rename is invalid.",
  "studio.producerError.assetLibrary.notFound": "Could not find the asset.",
  "studio.producerError.assetLibrary.fieldRightsSourceId": "rights sourceId",
  "studio.producerError.assetLibrary.fieldRightsLicenseId": "rights licenseId",
  "studio.producerError.assetLibrary.fieldRightsLicenseLabel": "rights licenseLabel",
  "studio.producerError.assetLibrary.fieldRightsLicenseUrl": "rights licenseUrl",
  "studio.producerError.assetLibrary.fieldRightsAttributionText": "rights attributionText",
  "studio.producerError.assetLibrary.fieldAssetName": "asset name",
  "studio.producerError.assetLibrary.fieldAssetKind": "asset kind",
  "studio.producerError.assetLibrary.operationOpen": "open",
  "studio.producerError.assetLibrary.operationManifestRead": "manifest read",
  "studio.producerError.assetLibrary.operationBlobSave": "blob save",
  "studio.producerError.assetLibrary.operationManifestCommit": "manifest commit",
});

const ASSET_LIBRARY_ERROR_KEYS: Readonly<Record<StudioAssetLibraryRepositoryErrorSubcode, string>> = {
  quotaExceeded: "studio.producerError.assetLibrary.quotaExceeded",
  operationFailed: "studio.producerError.assetLibrary.operationFailed",
  fieldMustBeString: "studio.producerError.assetLibrary.fieldMustBeString",
  fieldLengthOrChars: "studio.producerError.assetLibrary.fieldLengthOrChars",
  fieldMustBeStringOrNull: "studio.producerError.assetLibrary.fieldMustBeStringOrNull",
  fieldLength: "studio.producerError.assetLibrary.fieldLength",
  rightsInvalid: "studio.producerError.assetLibrary.rightsInvalid",
  rightsUnknownField: "studio.producerError.assetLibrary.rightsUnknownField",
  rightsSourceKind: "studio.producerError.assetLibrary.rightsSourceKind",
  rightsUrlHttps: "studio.producerError.assetLibrary.rightsUrlHttps",
  rightsUrlInvalid: "studio.producerError.assetLibrary.rightsUrlInvalid",
  attributionType: "studio.producerError.assetLibrary.attributionType",
  rightsConfirmedType: "studio.producerError.assetLibrary.rightsConfirmedType",
  entryNotObject: "studio.producerError.assetLibrary.entryNotObject",
  entryFields: "studio.producerError.assetLibrary.entryFields",
  entryIdFormat: "studio.producerError.assetLibrary.entryIdFormat",
  entryContentHash: "studio.producerError.assetLibrary.entryContentHash",
  entryByteSize: "studio.producerError.assetLibrary.entryByteSize",
  entryMime: "studio.producerError.assetLibrary.entryMime",
  entrySize: "studio.producerError.assetLibrary.entrySize",
  entryCreatedAt: "studio.producerError.assetLibrary.entryCreatedAt",
  tooManyAssets: "studio.producerError.assetLibrary.tooManyAssets",
  duplicateAssetId: "studio.producerError.assetLibrary.duplicateAssetId",
  totalBytesExceeded: "studio.producerError.assetLibrary.totalBytesExceeded",
  manifestTooLarge: "studio.producerError.assetLibrary.manifestTooLarge",
  manifestSizeLimit: "studio.producerError.assetLibrary.manifestSizeLimit",
  manifestJsonCorrupt: "studio.producerError.assetLibrary.manifestJsonCorrupt",
  manifestNotObject: "studio.producerError.assetLibrary.manifestNotObject",
  manifestVersionOrFields: "studio.producerError.assetLibrary.manifestVersionOrFields",
  manifestCanonicalMismatch: "studio.producerError.assetLibrary.manifestCanonicalMismatch",
  manifestCorrupt: "studio.producerError.assetLibrary.manifestCorrupt",
  dataUrlTooLarge: "studio.producerError.assetLibrary.dataUrlTooLarge",
  casVerificationFailed: "studio.producerError.assetLibrary.casVerificationFailed",
  casBlobMissing: "studio.producerError.assetLibrary.casBlobMissing",
  casLedgerMismatch: "studio.producerError.assetLibrary.casLedgerMismatch",
  searchTooLong: "studio.producerError.assetLibrary.searchTooLong",
  binaryStoreOpfsUnavailable: "studio.producerError.assetLibrary.binaryStoreOpfsUnavailable",
  casIndexReadFailed: "studio.producerError.assetLibrary.casIndexReadFailed",
  casManifestLedgerMismatch: "studio.producerError.assetLibrary.casManifestLedgerMismatch",
  commitReconcileFailed: "studio.producerError.assetLibrary.commitReconcileFailed",
  commitRollbackFailed: "studio.producerError.assetLibrary.commitRollbackFailed",
  manifestMismatch: "studio.producerError.assetLibrary.manifestMismatch",
  webLocksUnavailable: "studio.producerError.assetLibrary.webLocksUnavailable",
  bytesDecodeFailed: "studio.producerError.assetLibrary.bytesDecodeFailed",
  bytesOutOfRange: "studio.producerError.assetLibrary.bytesOutOfRange",
  generatedIdFormat: "studio.producerError.assetLibrary.generatedIdFormat",
  generatedIdConflict: "studio.producerError.assetLibrary.generatedIdConflict",
  contentHashMismatch: "studio.producerError.assetLibrary.contentHashMismatch",
  casReceiptMismatch: "studio.producerError.assetLibrary.casReceiptMismatch",
  committedEntryMissing: "studio.producerError.assetLibrary.committedEntryMissing",
  pageLimit: "studio.producerError.assetLibrary.pageLimit",
  cursorInvalid: "studio.producerError.assetLibrary.cursorInvalid",
  deleteIdInvalid: "studio.producerError.assetLibrary.deleteIdInvalid",
  renameIdInvalid: "studio.producerError.assetLibrary.renameIdInvalid",
  notFound: "studio.producerError.assetLibrary.notFound",
};

/** subcode별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const ASSET_LIBRARY_ERROR_KO: Readonly<Record<StudioAssetLibraryRepositoryErrorSubcode, string>> = {
  quotaExceeded: "SQLite/OPFS 에셋 {operation} 중 저장 공간이 부족합니다.",
  operationFailed: "SQLite/OPFS 에셋 {operation}를 완료하지 못했습니다: {detail}",
  fieldMustBeString: "{label}은 문자열이어야 합니다.",
  fieldLengthOrChars: "{label}의 길이 또는 문자가 허용 범위를 벗어났습니다.",
  fieldMustBeStringOrNull: "{label}은 문자열 또는 null이어야 합니다.",
  fieldLength: "{label}의 길이가 허용 범위를 벗어났습니다.",
  rightsInvalid: "에셋 권리 메타데이터가 올바르지 않습니다.",
  rightsUnknownField: "에셋 권리 메타데이터에 알 수 없는 필드가 있습니다.",
  rightsSourceKind: "에셋 권리 sourceKind가 올바르지 않습니다.",
  rightsUrlHttps: "권리 URL은 HTTPS여야 합니다.",
  rightsUrlInvalid: "권리 URL이 올바르지 않습니다.",
  attributionType: "attributionRequired는 boolean 또는 null이어야 합니다.",
  rightsConfirmedType: "rightsConfirmed는 boolean이어야 합니다.",
  entryNotObject: "에셋 manifest entry가 객체가 아닙니다.",
  entryFields: "에셋 manifest entry 필드가 올바르지 않습니다.",
  entryIdFormat: "에셋 ID가 안전한 canonical 형식이 아닙니다.",
  entryContentHash: "에셋 contentHash가 올바르지 않습니다.",
  entryByteSize: "에셋 byteSize가 허용 범위를 벗어났습니다.",
  entryMime: "에셋 MIME이 canonical 형식이 아닙니다.",
  entrySize: "에셋 크기가 허용 범위를 벗어났습니다.",
  entryCreatedAt: "에셋 createdAt이 올바르지 않습니다.",
  tooManyAssets: "에셋 보관함은 최대 {max}개까지 저장할 수 있습니다.",
  duplicateAssetId: "중복 에셋 ID가 있습니다: {id}",
  totalBytesExceeded: "에셋 보관함의 총 원본 바이트가 1 GiB 상한을 넘었습니다.",
  manifestTooLarge: "에셋 SQLite manifest가 8 MiB 상한을 넘었습니다.",
  manifestSizeLimit: "에셋 SQLite manifest가 크기 상한을 넘었습니다.",
  manifestJsonCorrupt: "에셋 SQLite manifest JSON이 끊어졌거나 손상되었습니다.",
  manifestNotObject: "에셋 SQLite manifest가 객체가 아닙니다.",
  manifestVersionOrFields: "에셋 SQLite manifest 버전 또는 필드가 올바르지 않습니다.",
  manifestCanonicalMismatch: "에셋 SQLite manifest가 canonical 원장과 일치하지 않습니다.",
  manifestCorrupt: "에셋 SQLite manifest가 손상되었습니다.",
  dataUrlTooLarge: "복원한 에셋 data URL이 제품 경계 상한을 넘었습니다.",
  casVerificationFailed: "에셋 CAS 검증에 실패했습니다: {id}",
  casBlobMissing: "에셋 CAS blob이 없습니다: {id}",
  casLedgerMismatch: "에셋 CAS hash/size/MIME 원장이 일치하지 않습니다: {id}",
  searchTooLong: "에셋 검색어가 너무 깁니다.",
  binaryStoreOpfsUnavailable: "OPFS를 사용할 수 없어 에셋 바이너리 보관함을 열 수 없습니다.",
  casIndexReadFailed: "에셋 CAS 색인을 읽지 못했습니다: {id}",
  casManifestLedgerMismatch: "에셋 CAS manifest 원장이 일치하지 않습니다: {id}",
  commitReconcileFailed: "SQLite/OPFS 에셋 manifest 커밋 결과를 재확인하지 못했습니다. old/candidate CAS union은 보존됩니다.",
  commitRollbackFailed: "SQLite/OPFS 에셋 manifest 미커밋 확인 뒤 owner 참조를 되돌리지 못했습니다.",
  manifestMismatch: "SQLite/OPFS 에셋 manifest가 old/candidate 어느 쪽과도 일치하지 않아 CAS union을 보존한 채 중단했습니다.",
  webLocksUnavailable: "Web Locks가 없어 여러 탭의 SQLite/OPFS 에셋 쓰기를 안전하게 직렬화할 수 없습니다.",
  bytesDecodeFailed: "에셋 바이트를 해석하지 못했습니다: {detail}",
  bytesOutOfRange: "에셋 원본 바이트가 1 B~64 MiB 범위를 벗어났습니다.",
  generatedIdFormat: "생성된 에셋 ID가 안전한 형식이 아닙니다.",
  generatedIdConflict: "생성된 에셋 ID가 기존 행과 충돌했습니다.",
  contentHashMismatch: "제공된 contentHash가 실제 에셋 바이트 SHA-256과 일치하지 않습니다.",
  casReceiptMismatch: "OPFS CAS 저장 영수증의 hash/size/MIME이 입력과 일치하지 않습니다.",
  committedEntryMissing: "커밋된 manifest에서 신규 에셋을 찾지 못했습니다.",
  pageLimit: "에셋 page limit은 1~{max}이어야 합니다.",
  cursorInvalid: "에셋 pagination cursor가 올바르지 않습니다.",
  deleteIdInvalid: "삭제할 에셋 ID가 올바르지 않습니다.",
  renameIdInvalid: "이름을 바꿀 에셋 ID가 올바르지 않습니다.",
  notFound: "에셋을 찾을 수 없습니다.",
};

const FIELD_LABEL_KEYS: Readonly<Record<StudioAssetLibraryFieldLabelCode, string>> = {
  rightsSourceId: "studio.producerError.assetLibrary.fieldRightsSourceId",
  rightsLicenseId: "studio.producerError.assetLibrary.fieldRightsLicenseId",
  rightsLicenseLabel: "studio.producerError.assetLibrary.fieldRightsLicenseLabel",
  rightsLicenseUrl: "studio.producerError.assetLibrary.fieldRightsLicenseUrl",
  rightsAttributionText: "studio.producerError.assetLibrary.fieldRightsAttributionText",
  assetName: "studio.producerError.assetLibrary.fieldAssetName",
  assetKind: "studio.producerError.assetLibrary.fieldAssetKind",
};

const FIELD_LABEL_KO: Readonly<Record<StudioAssetLibraryFieldLabelCode, string>> = {
  rightsSourceId: "권리 sourceId",
  rightsLicenseId: "권리 licenseId",
  rightsLicenseLabel: "권리 licenseLabel",
  rightsLicenseUrl: "권리 licenseUrl",
  rightsAttributionText: "권리 attributionText",
  assetName: "에셋 이름",
  assetKind: "에셋 kind",
};

const OPERATION_KEYS: Readonly<Record<StudioAssetLibraryOperationCode, string>> = {
  open: "studio.producerError.assetLibrary.operationOpen",
  manifestRead: "studio.producerError.assetLibrary.operationManifestRead",
  blobSave: "studio.producerError.assetLibrary.operationBlobSave",
  manifestCommit: "studio.producerError.assetLibrary.operationManifestCommit",
};

const OPERATION_KO: Readonly<Record<StudioAssetLibraryOperationCode, string>> = {
  open: "열기",
  manifestRead: "manifest 읽기",
  blobSave: "blob 저장",
  manifestCommit: "manifest 커밋",
};

function withAssetLibraryLabels(
  params?: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> | undefined {
  if (!params) return undefined;
  const next: Record<string, string> = { ...params };
  if (next.label && Object.hasOwn(FIELD_LABEL_KEYS, next.label)) {
    const code = next.label as StudioAssetLibraryFieldLabelCode;
    next.label = resolveProducerError(FIELD_LABEL_KEYS[code], FIELD_LABEL_KO[code]);
  }
  if (next.operation && Object.hasOwn(OPERATION_KEYS, next.operation)) {
    const code = next.operation as StudioAssetLibraryOperationCode;
    next.operation = resolveProducerError(OPERATION_KEYS[code], OPERATION_KO[code]);
  }
  return next;
}

/** 표시 지점 전용 해석 (에셋 보관함): 구조화 오류를 직접 받는 표시 지점이 부른다. */
export function resolveStudioAssetLibraryError(
  error: {
    readonly subcode: StudioAssetLibraryRepositoryErrorSubcode;
    readonly params?: Readonly<Record<string, string>>;
  },
): string {
  return resolveProducerError(
    ASSET_LIBRARY_ERROR_KEYS[error.subcode],
    ASSET_LIBRARY_ERROR_KO[error.subcode],
    withAssetLibraryLabels(error.params),
  );
}

/**
 * 표시 지점 전용 해석 (에셋 보관함, 원인 객체 진입점): mutations catch가 원인
 * 객체만으로 부른다. 생산자 모듈을 런타임 import하면 SQLite/OPFS 스택이 표시
 * 그래프에 끌려오므로, 이름+서브코드 덕 타이핑으로 판정한다.
 * 해당하지 않으면 null — 호출자는 기존 메시지 경로로 폴백한다.
 */
export function resolveStudioAssetLibraryErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, subcode, params } = cause as {
    name?: unknown;
    subcode?: unknown;
    params?: unknown;
  };
  if (
    name !== "StudioAssetLibraryRepositoryError"
    && name !== "StudioAssetLibraryCommitAggregateError"
  ) return null;
  if (typeof subcode !== "string" || !Object.hasOwn(ASSET_LIBRARY_ERROR_KEYS, subcode)) {
    return null;
  }
  return resolveStudioAssetLibraryError({
    subcode: subcode as StudioAssetLibraryRepositoryErrorSubcode,
    params: (params ?? undefined) as Readonly<Record<string, string>> | undefined,
  });
}
