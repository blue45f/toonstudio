/**
 * 생산자 구조화 에러 해석 모듈 — vrmPaint 구간: studio-vrm-texture-paint-project-library
 * 세부 코드 41종 + 프레젠테이션 고지 12종, studio-vrm-texture-paint-runtime 오류 33종 +
 * guidance 1종 (A4 D4, R14).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와 동일하다:
 * 생산자는 {code/detailCode, params}만 방출하고, 표시는 이 모듈의 리졸버로만 해석한다.
 * ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규 번역이다.
 * paint-project-library의 프레젠테이션 함수(고지 생성)는 결과 타입이 문자열로 고정된
 * 집계 경계라, 그 함수 내부에서만 이 모듈을 불러 해석한다(집계자 예외).
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  StudioVrmTexturePaintProjectLibraryDetailCode,
  StudioVrmTexturePaintProjectNoticeCode,
} from "../vrm/studio-vrm-texture-paint-project-library";
import type {
  StudioVrmTexturePaintRuntimeError,
  StudioVrmTexturePaintRuntimeGuidance,
} from "../vrm/studio-vrm-texture-paint-runtime";

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

// === vrmPaintLibrary 구간 ===
registerI18nLocaleEntries("ko", {
  "studio.producerError.vrmPaintLibrary.aborted": "VRM 표면 페인팅 프로젝트 센터이 취소되었습니다.",
  "studio.producerError.vrmPaintLibrary.sceneIdInvalid": "프로젝트의 VRM 장면 식별자가 올바르지 않습니다.",
  "studio.producerError.vrmPaintLibrary.sceneNotCanonicalV6": "프로젝트의 VRM 표면 페인팅 장면이 canonical v6 형식이 아닙니다.",
  "studio.producerError.vrmPaintLibrary.projectStructureInvalid": "VRM 표면 페인팅 참조를 수집할 프로젝트 구조가 올바르지 않습니다.",
  "studio.producerError.vrmPaintLibrary.limitScenesOrRefs": "프로젝트의 VRM 표면 페인팅 장면 또는 참조가 archive 안전 한도를 넘었습니다.",
  "studio.producerError.vrmPaintLibrary.projectPageStructureInvalid": "프로젝트 페이지 요소 구조가 올바르지 않습니다.",
  "studio.producerError.vrmPaintLibrary.cryptoFingerprintUnavailable": "VRM 표면 페인팅 장면 fingerprint를 계산할 수 없습니다.",
  "studio.producerError.vrmPaintLibrary.cryptoFingerprintFailed": "VRM 표면 페인팅 장면 fingerprint 계산에 실패했습니다.",
  "studio.producerError.vrmPaintLibrary.scenePngHashInvalid": "VRM 표면 페인팅 PNG hash가 올바르지 않습니다.",
  "studio.producerError.vrmPaintLibrary.metadataMimeConflict": "같은 VRM 표면 페인팅 PNG hash에 서로 다른 MIME, 크기 또는 해상도가 선언되었습니다.",
  "studio.producerError.vrmPaintLibrary.metadataPointerDuplicate": "VRM 표면 페인팅 참조 포인터가 중복되었습니다.",
  "studio.producerError.vrmPaintLibrary.projectReferenceInvalid": "VRM 표면 페인팅 참조를 수집할 프로젝트가 올바르지 않습니다.",
  "studio.producerError.vrmPaintLibrary.fingerprintMismatchParser": "프로젝트 파서 전후의 VRM 장면 fingerprint가 일치하지 않습니다.",
  "studio.producerError.vrmPaintLibrary.scenePointerInvalid": "VRM 표면 페인팅 RFC 6901 포인터를 만들 수 없습니다.",
  "studio.producerError.vrmPaintLibrary.limitRefs": "VRM 표면 페인팅 참조 수가 archive 안전 한도를 넘었습니다.",
  "studio.producerError.vrmPaintLibrary.limitPngCount": "VRM 표면 페인팅 PNG 수가 archive 안전 한도를 넘었습니다.",
  "studio.producerError.vrmPaintLibrary.limitPngSingle": "VRM 표면 페인팅 PNG 하나가 archive 안전 한도를 넘었습니다.",
  "studio.producerError.vrmPaintLibrary.limitPngTotal": "VRM 표면 페인팅 PNG 합계가 archive 안전 한도를 넘었습니다.",
  "studio.producerError.vrmPaintLibrary.cryptoFingerprintFormatInvalid": "VRM 표면 페인팅 장면 fingerprint 형식이 올바르지 않습니다.",
  "studio.producerError.vrmPaintLibrary.fingerprintMismatchArchive": "archive 입력 프로젝트와 canonical 프로젝트의 VRM 장면 fingerprint가 일치하지 않습니다.",
  "studio.producerError.vrmPaintLibrary.metadataBindingMissing": "VRM 표면 페인팅 PNG에 binding 참조가 없습니다.",
  "studio.producerError.vrmPaintLibrary.readLocalPngFailed": "로컬 VRM 표면 페인팅 PNG를 읽지 못했습니다.",
  "studio.producerError.vrmPaintLibrary.verifyFailed": "VRM 표면 페인팅 PNG의 hash, MIME, 크기 또는 해상도 검증에 실패했습니다.",
  "studio.producerError.vrmPaintLibrary.verifyReceiptMismatch": "검증기가 반환한 VRM 표면 페인팅 PNG receipt가 프로젝트와 일치하지 않습니다.",
  "studio.producerError.vrmPaintLibrary.limitPreflightInvalid": "{label} archive 사전검사 한도가 올바르지 않습니다.",
  "studio.producerError.vrmPaintLibrary.limitDevicePngCount": "VRM 표면 페인팅 PNG 수가 현재 기기의 archive 사전검사 한도를 넘었습니다.",
  "studio.producerError.vrmPaintLibrary.limitDevicePngTotal": "VRM 표면 페인팅 PNG 합계가 현재 기기의 archive 사전검사 한도를 넘었습니다.",
  "studio.producerError.vrmPaintLibrary.limitDevicePngSingle": "VRM 표면 페인팅 PNG 하나가 현재 기기의 archive 사전검사 한도를 넘었습니다.",
  "studio.producerError.vrmPaintLibrary.archiveManifestRangeConflict": "archive manifest의 VRM 표면 페인팅 참조 범위가 canonical 프로젝트와 다릅니다.",
  "studio.producerError.vrmPaintLibrary.installSaveFailed": "검증된 VRM 표면 페인팅 PNG를 로컬 라이브러리에 저장하지 못했습니다.",
  "studio.producerError.vrmPaintLibrary.installResultInvalid": "로컬 VRM 표면 페인팅 라이브러리가 올바르지 않은 저장 결과를 반환했습니다.",
  "studio.producerError.vrmPaintLibrary.installRecheckFailed": "저장한 VRM 표면 페인팅 PNG를 로컬 라이브러리에서 다시 확인하지 못했습니다.",
  "studio.producerError.vrmPaintLibrary.installRollbackFailed": "프로젝트 적용 실패 뒤 새로 만든 VRM 표면 페인팅 PNG를 되돌리지 못했습니다.",
  "studio.producerError.vrmPaintLibrary.installRollbackBlocked": "프로젝트 적용 실패 뒤 VRM 표면 페인팅 저장소가 변경되어 안전한 보상을 완료하지 못했습니다.",
  "studio.producerError.vrmPaintLibrary.archiveManifestDuplicateHash": "archive manifest에 중복된 attachment hash가 있습니다.",
  "studio.producerError.vrmPaintLibrary.archiveMetadataMismatch": "archive의 VRM 표면 페인팅 attachment metadata가 canonical 프로젝트와 일치하지 않습니다.",
  "studio.producerError.vrmPaintLibrary.archiveManifestIncomplete": "archive manifest가 canonical 프로젝트의 모든 VRM 표면 페인팅 참조를 포함하지 않습니다.",
  "studio.producerError.vrmPaintLibrary.installSessionInvalid": "VRM 표면 페인팅 archive 준비 결과가 현재 검증 세션에 속하지 않습니다.",
  "studio.producerError.vrmPaintLibrary.fingerprintMismatchApply": "검증한 VRM 표면 페인팅 장면과 적용할 프로젝트가 일치하지 않습니다.",
  "studio.producerError.vrmPaintLibrary.aggregateApplyCompensationFailed": "VRM 표면 페인팅 archive 적용과 보상에 실패했습니다.",
  "studio.producerError.vrmPaintLibrary.archiveExportUnresolved": "VRM 표면 페인팅 PNG {count}개를 이 기기의 검증 저장소에서 찾지 못해 휴대 가능한 archive를 만들지 않았습니다.",
  "studio.producerError.vrmPaintLibrary.notice.jsonReceiptsOnly": "JSON에는 VRM 표면 페인팅 PNG {count}개의 SHA-256 영수증만 저장됩니다. 다른 기기로 옮길 때는 원본 PNG가 포함되는 무결성 archive(.toonproject.zip)를 함께 저장해 주세요.",
  "studio.producerError.vrmPaintLibrary.notice.jsonInspectFailed": "JSON 파일은 저장했지만 VRM 표면 페인팅 영수증을 검사하지 못했습니다. 이 JSON만으로 3D 재편집이 가능하다고 보장할 수 없으므로 원본 PNG가 포함되는 무결성 archive(.toonproject.zip)도 저장해 주세요.",
  "studio.producerError.vrmPaintLibrary.notice.jsonImportMissing": "JSON 프로젝트를 불러왔지만 VRM 표면 페인팅 PNG {missingCount}개가 이 기기에 없습니다. 기존 캡처는 보이지만 3D 재편집을 위해 원본이 든 .toonproject.zip archive를 가져와 주세요.",
  "studio.producerError.vrmPaintLibrary.notice.jsonImportMissingSuffix": "\n\nVRM 표면 페인팅 원본 {missingCount}개가 없어 3D 재편집은 archive 복구 후 가능합니다.",
  "studio.producerError.vrmPaintLibrary.notice.jsonImportUnavailable": "JSON 프로젝트를 불러왔지만 이 브라우저의 VRM 표면 페인팅 로컬 저장소를 확인할 수 없습니다. 기존 캡처는 보이지만 3D 재편집 가능 여부를 보장할 수 없으므로 원본이 든 .toonproject.zip archive를 가져와 주세요.",
  "studio.producerError.vrmPaintLibrary.notice.jsonImportUnavailableSuffix": "\n\nVRM 표면 페인팅 로컬 저장소를 확인할 수 없어 3D 재편집 가능 여부가 불확실합니다. 원본 archive로 복구해 주세요.",
  "studio.producerError.vrmPaintLibrary.notice.exportSelfContained": "프로젝트와 중복 제거 자산 {attachmentCount}개를 무결성 검증형 archive로 저장 요청했어요.",
  "studio.producerError.vrmPaintLibrary.notice.exportWithWarnings": "archive를 저장했지만 외부 종속성 경고 {warningCount}건이 있어 다른 기기에서 일부 원본 자산을 다시 연결해야 할 수 있어요.",
  "studio.producerError.vrmPaintLibrary.notice.exportMissingReferences": " 참고 이미지 원본 {missingReferenceCount}개를 이 기기에서 찾지 못했습니다.",
  "studio.producerError.vrmPaintLibrary.notice.exportMissingVrm": " 업로드 VRM 원본 {missingVrmCount}개를 이 기기에서 찾지 못했거나 검증하지 못했습니다.",
  "studio.producerError.vrmPaintLibrary.notice.importFullyResolved": "SHA-256·CRC-32·MIME 검증을 통과한 프로젝트와 자산 {attachmentCount}개를 복구했어요. 참고 이미지 {referenceInstalled}개 설치·{referenceReused}개 재사용, VRM {vrmInstalled}개 설치·{vrmReused}개 재사용, VRM 표면 페인팅 PNG {textureInstalled}개 설치·{textureReused}개 재사용, 3D 배경 모델 {background3dInstalled}개를 로컬 라이브러리에 원자적으로 설치했어요.",
  "studio.producerError.vrmPaintLibrary.notice.importPartiallyResolved": "프로젝트를 복구했지만 외부 종속성 경고 {warningCount}건, 미해결 참고 이미지 {referenceUnresolved}개, 미해결 VRM {vrmUnresolved}개, 미해결 VRM 표면 페인팅 {textureUnresolved}개가 있어 원본 자산 확인이 필요해요.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.vrmPaintLibrary.aborted": "The VRM surface paint project operation was cancelled.",
  "studio.producerError.vrmPaintLibrary.sceneIdInvalid": "The project's VRM scene identifier is invalid.",
  "studio.producerError.vrmPaintLibrary.sceneNotCanonicalV6": "The project's VRM surface paint scene is not in canonical v6 format.",
  "studio.producerError.vrmPaintLibrary.projectStructureInvalid": "The project structure for collecting VRM surface paint references is invalid.",
  "studio.producerError.vrmPaintLibrary.limitScenesOrRefs": "The project's VRM surface paint scenes or references exceed the archive safety limit.",
  "studio.producerError.vrmPaintLibrary.projectPageStructureInvalid": "The project page element structure is invalid.",
  "studio.producerError.vrmPaintLibrary.cryptoFingerprintUnavailable": "Could not compute the VRM surface paint scene fingerprint.",
  "studio.producerError.vrmPaintLibrary.cryptoFingerprintFailed": "Failed to compute the VRM surface paint scene fingerprint.",
  "studio.producerError.vrmPaintLibrary.scenePngHashInvalid": "The VRM surface paint PNG hash is invalid.",
  "studio.producerError.vrmPaintLibrary.metadataMimeConflict": "Different MIME type, size, or dimensions were declared for the same VRM surface paint PNG hash.",
  "studio.producerError.vrmPaintLibrary.metadataPointerDuplicate": "A VRM surface paint reference pointer is duplicated.",
  "studio.producerError.vrmPaintLibrary.projectReferenceInvalid": "The project for collecting VRM surface paint references is invalid.",
  "studio.producerError.vrmPaintLibrary.fingerprintMismatchParser": "The VRM scene fingerprint does not match before and after the project parser.",
  "studio.producerError.vrmPaintLibrary.scenePointerInvalid": "Could not create the VRM surface paint RFC 6901 pointer.",
  "studio.producerError.vrmPaintLibrary.limitRefs": "The number of VRM surface paint references exceeds the archive safety limit.",
  "studio.producerError.vrmPaintLibrary.limitPngCount": "The number of VRM surface paint PNGs exceeds the archive safety limit.",
  "studio.producerError.vrmPaintLibrary.limitPngSingle": "A single VRM surface paint PNG exceeds the archive safety limit.",
  "studio.producerError.vrmPaintLibrary.limitPngTotal": "The total size of VRM surface paint PNGs exceeds the archive safety limit.",
  "studio.producerError.vrmPaintLibrary.cryptoFingerprintFormatInvalid": "The VRM surface paint scene fingerprint format is invalid.",
  "studio.producerError.vrmPaintLibrary.fingerprintMismatchArchive": "The VRM scene fingerprint of the archive input project does not match the canonical project.",
  "studio.producerError.vrmPaintLibrary.metadataBindingMissing": "The VRM surface paint PNG has no binding reference.",
  "studio.producerError.vrmPaintLibrary.readLocalPngFailed": "Could not read the local VRM surface paint PNG.",
  "studio.producerError.vrmPaintLibrary.verifyFailed": "Failed to verify the VRM surface paint PNG hash, MIME type, size, or dimensions.",
  "studio.producerError.vrmPaintLibrary.verifyReceiptMismatch": "The VRM surface paint PNG receipt returned by the verifier does not match the project.",
  "studio.producerError.vrmPaintLibrary.limitPreflightInvalid": "The {label} archive preflight limit is invalid.",
  "studio.producerError.vrmPaintLibrary.limitDevicePngCount": "The number of VRM surface paint PNGs exceeds this device's archive preflight limit.",
  "studio.producerError.vrmPaintLibrary.limitDevicePngTotal": "The total size of VRM surface paint PNGs exceeds this device's archive preflight limit.",
  "studio.producerError.vrmPaintLibrary.limitDevicePngSingle": "A single VRM surface paint PNG exceeds this device's archive preflight limit.",
  "studio.producerError.vrmPaintLibrary.archiveManifestRangeConflict": "The VRM surface paint reference range in the archive manifest differs from the canonical project.",
  "studio.producerError.vrmPaintLibrary.installSaveFailed": "Could not save the verified VRM surface paint PNG to the local library.",
  "studio.producerError.vrmPaintLibrary.installResultInvalid": "The local VRM surface paint library returned an invalid save result.",
  "studio.producerError.vrmPaintLibrary.installRecheckFailed": "Could not re-verify the saved VRM surface paint PNG in the local library.",
  "studio.producerError.vrmPaintLibrary.installRollbackFailed": "Could not roll back the newly created VRM surface paint PNG after the project apply failed.",
  "studio.producerError.vrmPaintLibrary.installRollbackBlocked": "The VRM surface paint storage changed after the project apply failed, so safe compensation could not be completed.",
  "studio.producerError.vrmPaintLibrary.archiveManifestDuplicateHash": "The archive manifest contains a duplicate attachment hash.",
  "studio.producerError.vrmPaintLibrary.archiveMetadataMismatch": "The archive's VRM surface paint attachment metadata does not match the canonical project.",
  "studio.producerError.vrmPaintLibrary.archiveManifestIncomplete": "The archive manifest does not include all VRM surface paint references of the canonical project.",
  "studio.producerError.vrmPaintLibrary.installSessionInvalid": "The VRM surface paint archive preparation result does not belong to the current verification session.",
  "studio.producerError.vrmPaintLibrary.fingerprintMismatchApply": "The verified VRM surface paint scene does not match the project to apply.",
  "studio.producerError.vrmPaintLibrary.aggregateApplyCompensationFailed": "Failed to apply the VRM surface paint archive and to compensate.",
  "studio.producerError.vrmPaintLibrary.archiveExportUnresolved": "Could not find {count} VRM surface paint PNGs in this device's verified storage, so a portable archive was not created.",
  "studio.producerError.vrmPaintLibrary.notice.jsonReceiptsOnly": "The JSON stores only SHA-256 receipts for {count} VRM surface paint PNGs. When moving to another device, also save the integrity archive (.toonproject.zip) that contains the original PNGs.",
  "studio.producerError.vrmPaintLibrary.notice.jsonInspectFailed": "The JSON file was saved, but the VRM surface paint receipts could not be inspected. This JSON alone cannot guarantee 3D re-editing, so also save the integrity archive (.toonproject.zip) that contains the original PNGs.",
  "studio.producerError.vrmPaintLibrary.notice.jsonImportMissing": "The JSON project was loaded, but {missingCount} VRM surface paint PNGs are not on this device. Existing captures are visible, but please import the .toonproject.zip archive with the originals for 3D re-editing.",
  "studio.producerError.vrmPaintLibrary.notice.jsonImportMissingSuffix": "\n\n{missingCount} VRM surface paint originals are missing, so 3D re-editing is available after restoring from the archive.",
  "studio.producerError.vrmPaintLibrary.notice.jsonImportUnavailable": "The JSON project was loaded, but this browser's VRM surface paint local storage could not be checked. Existing captures are visible, but 3D re-editing cannot be guaranteed, so please import the .toonproject.zip archive with the originals.",
  "studio.producerError.vrmPaintLibrary.notice.jsonImportUnavailableSuffix": "\n\nThe VRM surface paint local storage could not be checked, so 3D re-editing availability is uncertain. Please restore from the original archive.",
  "studio.producerError.vrmPaintLibrary.notice.exportSelfContained": "Requested saving the project and {attachmentCount} deduplicated assets as an integrity-verified archive.",
  "studio.producerError.vrmPaintLibrary.notice.exportWithWarnings": "The archive was saved, but there are {warningCount} external dependency warnings, so some original assets may need to be relinked on another device.",
  "studio.producerError.vrmPaintLibrary.notice.exportMissingReferences": " Could not find {missingReferenceCount} reference image originals on this device.",
  "studio.producerError.vrmPaintLibrary.notice.exportMissingVrm": " Could not find or verify {missingVrmCount} uploaded VRM originals on this device.",
  "studio.producerError.vrmPaintLibrary.notice.importFullyResolved": "Restored the project and {attachmentCount} assets that passed SHA-256, CRC-32, and MIME verification. Atomically installed them to the local library: {referenceInstalled} reference images installed and {referenceReused} reused, {vrmInstalled} VRMs installed and {vrmReused} reused, {textureInstalled} VRM surface paint PNGs installed and {textureReused} reused, and {background3dInstalled} 3D background models.",
  "studio.producerError.vrmPaintLibrary.notice.importPartiallyResolved": "The project was restored, but there are {warningCount} external dependency warnings, {referenceUnresolved} unresolved reference images, {vrmUnresolved} unresolved VRMs, and {textureUnresolved} unresolved VRM surface paints, so the original assets need to be checked.",
});

const PAINT_LIBRARY_ERROR_KEYS: Readonly<Record<StudioVrmTexturePaintProjectLibraryDetailCode, string>> = {
  "aborted": "studio.producerError.vrmPaintLibrary.aborted",
  "scene-id-invalid": "studio.producerError.vrmPaintLibrary.sceneIdInvalid",
  "scene-not-canonical-v6": "studio.producerError.vrmPaintLibrary.sceneNotCanonicalV6",
  "project-structure-invalid": "studio.producerError.vrmPaintLibrary.projectStructureInvalid",
  "limit-scenes-or-refs": "studio.producerError.vrmPaintLibrary.limitScenesOrRefs",
  "project-page-structure-invalid": "studio.producerError.vrmPaintLibrary.projectPageStructureInvalid",
  "crypto-fingerprint-unavailable": "studio.producerError.vrmPaintLibrary.cryptoFingerprintUnavailable",
  "crypto-fingerprint-failed": "studio.producerError.vrmPaintLibrary.cryptoFingerprintFailed",
  "scene-png-hash-invalid": "studio.producerError.vrmPaintLibrary.scenePngHashInvalid",
  "metadata-mime-conflict": "studio.producerError.vrmPaintLibrary.metadataMimeConflict",
  "metadata-pointer-duplicate": "studio.producerError.vrmPaintLibrary.metadataPointerDuplicate",
  "project-reference-invalid": "studio.producerError.vrmPaintLibrary.projectReferenceInvalid",
  "fingerprint-mismatch-parser": "studio.producerError.vrmPaintLibrary.fingerprintMismatchParser",
  "scene-pointer-invalid": "studio.producerError.vrmPaintLibrary.scenePointerInvalid",
  "limit-refs": "studio.producerError.vrmPaintLibrary.limitRefs",
  "limit-png-count": "studio.producerError.vrmPaintLibrary.limitPngCount",
  "limit-png-single": "studio.producerError.vrmPaintLibrary.limitPngSingle",
  "limit-png-total": "studio.producerError.vrmPaintLibrary.limitPngTotal",
  "crypto-fingerprint-format-invalid": "studio.producerError.vrmPaintLibrary.cryptoFingerprintFormatInvalid",
  "fingerprint-mismatch-archive": "studio.producerError.vrmPaintLibrary.fingerprintMismatchArchive",
  "metadata-binding-missing": "studio.producerError.vrmPaintLibrary.metadataBindingMissing",
  "read-local-png-failed": "studio.producerError.vrmPaintLibrary.readLocalPngFailed",
  "verify-failed": "studio.producerError.vrmPaintLibrary.verifyFailed",
  "verify-receipt-mismatch": "studio.producerError.vrmPaintLibrary.verifyReceiptMismatch",
  "limit-preflight-invalid": "studio.producerError.vrmPaintLibrary.limitPreflightInvalid",
  "limit-device-png-count": "studio.producerError.vrmPaintLibrary.limitDevicePngCount",
  "limit-device-png-total": "studio.producerError.vrmPaintLibrary.limitDevicePngTotal",
  "limit-device-png-single": "studio.producerError.vrmPaintLibrary.limitDevicePngSingle",
  "archive-manifest-range-conflict": "studio.producerError.vrmPaintLibrary.archiveManifestRangeConflict",
  "install-save-failed": "studio.producerError.vrmPaintLibrary.installSaveFailed",
  "install-result-invalid": "studio.producerError.vrmPaintLibrary.installResultInvalid",
  "install-recheck-failed": "studio.producerError.vrmPaintLibrary.installRecheckFailed",
  "install-rollback-failed": "studio.producerError.vrmPaintLibrary.installRollbackFailed",
  "install-rollback-blocked": "studio.producerError.vrmPaintLibrary.installRollbackBlocked",
  "archive-manifest-duplicate-hash": "studio.producerError.vrmPaintLibrary.archiveManifestDuplicateHash",
  "archive-metadata-mismatch": "studio.producerError.vrmPaintLibrary.archiveMetadataMismatch",
  "archive-manifest-incomplete": "studio.producerError.vrmPaintLibrary.archiveManifestIncomplete",
  "install-session-invalid": "studio.producerError.vrmPaintLibrary.installSessionInvalid",
  "fingerprint-mismatch-apply": "studio.producerError.vrmPaintLibrary.fingerprintMismatchApply",
  "aggregate-apply-compensation-failed": "studio.producerError.vrmPaintLibrary.aggregateApplyCompensationFailed",
  "archive-export-unresolved": "studio.producerError.vrmPaintLibrary.archiveExportUnresolved",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const PAINT_LIBRARY_ERROR_KO: Readonly<Record<StudioVrmTexturePaintProjectLibraryDetailCode, string>> = {
  "aborted": "VRM 표면 페인팅 프로젝트 센터이 취소되었습니다.",
  "scene-id-invalid": "프로젝트의 VRM 장면 식별자가 올바르지 않습니다.",
  "scene-not-canonical-v6": "프로젝트의 VRM 표면 페인팅 장면이 canonical v6 형식이 아닙니다.",
  "project-structure-invalid": "VRM 표면 페인팅 참조를 수집할 프로젝트 구조가 올바르지 않습니다.",
  "limit-scenes-or-refs": "프로젝트의 VRM 표면 페인팅 장면 또는 참조가 archive 안전 한도를 넘었습니다.",
  "project-page-structure-invalid": "프로젝트 페이지 요소 구조가 올바르지 않습니다.",
  "crypto-fingerprint-unavailable": "VRM 표면 페인팅 장면 fingerprint를 계산할 수 없습니다.",
  "crypto-fingerprint-failed": "VRM 표면 페인팅 장면 fingerprint 계산에 실패했습니다.",
  "scene-png-hash-invalid": "VRM 표면 페인팅 PNG hash가 올바르지 않습니다.",
  "metadata-mime-conflict": "같은 VRM 표면 페인팅 PNG hash에 서로 다른 MIME, 크기 또는 해상도가 선언되었습니다.",
  "metadata-pointer-duplicate": "VRM 표면 페인팅 참조 포인터가 중복되었습니다.",
  "project-reference-invalid": "VRM 표면 페인팅 참조를 수집할 프로젝트가 올바르지 않습니다.",
  "fingerprint-mismatch-parser": "프로젝트 파서 전후의 VRM 장면 fingerprint가 일치하지 않습니다.",
  "scene-pointer-invalid": "VRM 표면 페인팅 RFC 6901 포인터를 만들 수 없습니다.",
  "limit-refs": "VRM 표면 페인팅 참조 수가 archive 안전 한도를 넘었습니다.",
  "limit-png-count": "VRM 표면 페인팅 PNG 수가 archive 안전 한도를 넘었습니다.",
  "limit-png-single": "VRM 표면 페인팅 PNG 하나가 archive 안전 한도를 넘었습니다.",
  "limit-png-total": "VRM 표면 페인팅 PNG 합계가 archive 안전 한도를 넘었습니다.",
  "crypto-fingerprint-format-invalid": "VRM 표면 페인팅 장면 fingerprint 형식이 올바르지 않습니다.",
  "fingerprint-mismatch-archive": "archive 입력 프로젝트와 canonical 프로젝트의 VRM 장면 fingerprint가 일치하지 않습니다.",
  "metadata-binding-missing": "VRM 표면 페인팅 PNG에 binding 참조가 없습니다.",
  "read-local-png-failed": "로컬 VRM 표면 페인팅 PNG를 읽지 못했습니다.",
  "verify-failed": "VRM 표면 페인팅 PNG의 hash, MIME, 크기 또는 해상도 검증에 실패했습니다.",
  "verify-receipt-mismatch": "검증기가 반환한 VRM 표면 페인팅 PNG receipt가 프로젝트와 일치하지 않습니다.",
  "limit-preflight-invalid": "{label} archive 사전검사 한도가 올바르지 않습니다.",
  "limit-device-png-count": "VRM 표면 페인팅 PNG 수가 현재 기기의 archive 사전검사 한도를 넘었습니다.",
  "limit-device-png-total": "VRM 표면 페인팅 PNG 합계가 현재 기기의 archive 사전검사 한도를 넘었습니다.",
  "limit-device-png-single": "VRM 표면 페인팅 PNG 하나가 현재 기기의 archive 사전검사 한도를 넘었습니다.",
  "archive-manifest-range-conflict": "archive manifest의 VRM 표면 페인팅 참조 범위가 canonical 프로젝트와 다릅니다.",
  "install-save-failed": "검증된 VRM 표면 페인팅 PNG를 로컬 라이브러리에 저장하지 못했습니다.",
  "install-result-invalid": "로컬 VRM 표면 페인팅 라이브러리가 올바르지 않은 저장 결과를 반환했습니다.",
  "install-recheck-failed": "저장한 VRM 표면 페인팅 PNG를 로컬 라이브러리에서 다시 확인하지 못했습니다.",
  "install-rollback-failed": "프로젝트 적용 실패 뒤 새로 만든 VRM 표면 페인팅 PNG를 되돌리지 못했습니다.",
  "install-rollback-blocked": "프로젝트 적용 실패 뒤 VRM 표면 페인팅 저장소가 변경되어 안전한 보상을 완료하지 못했습니다.",
  "archive-manifest-duplicate-hash": "archive manifest에 중복된 attachment hash가 있습니다.",
  "archive-metadata-mismatch": "archive의 VRM 표면 페인팅 attachment metadata가 canonical 프로젝트와 일치하지 않습니다.",
  "archive-manifest-incomplete": "archive manifest가 canonical 프로젝트의 모든 VRM 표면 페인팅 참조를 포함하지 않습니다.",
  "install-session-invalid": "VRM 표면 페인팅 archive 준비 결과가 현재 검증 세션에 속하지 않습니다.",
  "fingerprint-mismatch-apply": "검증한 VRM 표면 페인팅 장면과 적용할 프로젝트가 일치하지 않습니다.",
  "aggregate-apply-compensation-failed": "VRM 표면 페인팅 archive 적용과 보상에 실패했습니다.",
  "archive-export-unresolved": "VRM 표면 페인팅 PNG {count}개를 이 기기의 검증 저장소에서 찾지 못해 휴대 가능한 archive를 만들지 않았습니다.",
};

const PAINT_LIBRARY_NOTICE_KEYS: Readonly<Record<StudioVrmTexturePaintProjectNoticeCode, string>> = {
  "json-receipts-only": "studio.producerError.vrmPaintLibrary.notice.jsonReceiptsOnly",
  "json-inspect-failed": "studio.producerError.vrmPaintLibrary.notice.jsonInspectFailed",
  "json-import-missing": "studio.producerError.vrmPaintLibrary.notice.jsonImportMissing",
  "json-import-missing-suffix": "studio.producerError.vrmPaintLibrary.notice.jsonImportMissingSuffix",
  "json-import-unavailable": "studio.producerError.vrmPaintLibrary.notice.jsonImportUnavailable",
  "json-import-unavailable-suffix": "studio.producerError.vrmPaintLibrary.notice.jsonImportUnavailableSuffix",
  "export-self-contained": "studio.producerError.vrmPaintLibrary.notice.exportSelfContained",
  "export-with-warnings": "studio.producerError.vrmPaintLibrary.notice.exportWithWarnings",
  "export-missing-references": "studio.producerError.vrmPaintLibrary.notice.exportMissingReferences",
  "export-missing-vrm": "studio.producerError.vrmPaintLibrary.notice.exportMissingVrm",
  "import-fully-resolved": "studio.producerError.vrmPaintLibrary.notice.importFullyResolved",
  "import-partially-resolved": "studio.producerError.vrmPaintLibrary.notice.importPartiallyResolved",
};

const PAINT_LIBRARY_NOTICE_KO: Readonly<Record<StudioVrmTexturePaintProjectNoticeCode, string>> = {
  "json-receipts-only": "JSON에는 VRM 표면 페인팅 PNG {count}개의 SHA-256 영수증만 저장됩니다. 다른 기기로 옮길 때는 원본 PNG가 포함되는 무결성 archive(.toonproject.zip)를 함께 저장해 주세요.",
  "json-inspect-failed": "JSON 파일은 저장했지만 VRM 표면 페인팅 영수증을 검사하지 못했습니다. 이 JSON만으로 3D 재편집이 가능하다고 보장할 수 없으므로 원본 PNG가 포함되는 무결성 archive(.toonproject.zip)도 저장해 주세요.",
  "json-import-missing": "JSON 프로젝트를 불러왔지만 VRM 표면 페인팅 PNG {missingCount}개가 이 기기에 없습니다. 기존 캡처는 보이지만 3D 재편집을 위해 원본이 든 .toonproject.zip archive를 가져와 주세요.",
  "json-import-missing-suffix": "\n\nVRM 표면 페인팅 원본 {missingCount}개가 없어 3D 재편집은 archive 복구 후 가능합니다.",
  "json-import-unavailable": "JSON 프로젝트를 불러왔지만 이 브라우저의 VRM 표면 페인팅 로컬 저장소를 확인할 수 없습니다. 기존 캡처는 보이지만 3D 재편집 가능 여부를 보장할 수 없으므로 원본이 든 .toonproject.zip archive를 가져와 주세요.",
  "json-import-unavailable-suffix": "\n\nVRM 표면 페인팅 로컬 저장소를 확인할 수 없어 3D 재편집 가능 여부가 불확실합니다. 원본 archive로 복구해 주세요.",
  "export-self-contained": "프로젝트와 중복 제거 자산 {attachmentCount}개를 무결성 검증형 archive로 저장 요청했어요.",
  "export-with-warnings": "archive를 저장했지만 외부 종속성 경고 {warningCount}건이 있어 다른 기기에서 일부 원본 자산을 다시 연결해야 할 수 있어요.",
  "export-missing-references": " 참고 이미지 원본 {missingReferenceCount}개를 이 기기에서 찾지 못했습니다.",
  "export-missing-vrm": " 업로드 VRM 원본 {missingVrmCount}개를 이 기기에서 찾지 못했거나 검증하지 못했습니다.",
  "import-fully-resolved": "SHA-256·CRC-32·MIME 검증을 통과한 프로젝트와 자산 {attachmentCount}개를 복구했어요. 참고 이미지 {referenceInstalled}개 설치·{referenceReused}개 재사용, VRM {vrmInstalled}개 설치·{vrmReused}개 재사용, VRM 표면 페인팅 PNG {textureInstalled}개 설치·{textureReused}개 재사용, 3D 배경 모델 {background3dInstalled}개를 로컬 라이브러리에 원자적으로 설치했어요.",
  "import-partially-resolved": "프로젝트를 복구했지만 외부 종속성 경고 {warningCount}건, 미해결 참고 이미지 {referenceUnresolved}개, 미해결 VRM {vrmUnresolved}개, 미해결 VRM 표면 페인팅 {textureUnresolved}개가 있어 원본 자산 확인이 필요해요.",
};

/** 표시 지점 전용 해석 (vrmPaintLibrary): 구조화 세부 코드를 현재 로케일 문구로 바꾼다. */
export function resolveStudioVrmPaintLibraryError(
  error: Pick<{ detailCode: StudioVrmTexturePaintProjectLibraryDetailCode; params?: Readonly<Record<string, string>> }, "detailCode" | "params">,
): string {
  return resolveProducerError(
    PAINT_LIBRARY_ERROR_KEYS[error.detailCode],
    PAINT_LIBRARY_ERROR_KO[error.detailCode],
    error.params,
  );
}

/**
 * 표시 지점 전용 해석 (vrmPaintLibrary, 원인 객체 진입점): 오케스트레이션 런타임 catch가
 * 원인 객체만으로 부른다. 생산자 클래스를 런타임 import하면 진입 그래프에 archive
 * 생산자가 끌려오므로, 이름+세부 코드 덕 타이핑으로 판정한다. AggregateError와
 * message가 세부 코드와 같은 plain Error(archive-export-unresolved)도 같은 표로 판정한다.
 * 해당하지 않으면 null — 호출자는 기존 메시지 경로로 폴백한다.
 */
export function resolveStudioVrmPaintLibraryErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, detailCode, params, message } = cause as {
    name?: unknown; detailCode?: unknown; params?: unknown; message?: unknown;
  };
  if (typeof detailCode !== "string" || !Object.hasOwn(PAINT_LIBRARY_ERROR_KEYS, detailCode)) return null;
  const knownProducer =
    name === "StudioVrmTexturePaintProjectLibraryError"
    || name === "AggregateError"
    || message === detailCode;
  if (!knownProducer) return null;
  const safeParams =
    params && typeof params === "object" && !Array.isArray(params)
      ? (params as Readonly<Record<string, string>>)
      : undefined;
  return resolveStudioVrmPaintLibraryError({
    detailCode: detailCode as StudioVrmTexturePaintProjectLibraryDetailCode,
    ...(safeParams ? { params: safeParams } : {}),
  });
}

/**
 * 집계자 예외 전용 해석 (vrmPaintLibrary 프레젠테이션 고지): 고지 결과 타입이
 * 문자열로 고정돼 있어, 고지를 만드는 프레젠테이션 함수 내부에서만 부른다.
 */
export function resolveStudioVrmPaintLibraryNotice(
  code: StudioVrmTexturePaintProjectNoticeCode,
  params?: Readonly<Record<string, string>>,
): string {
  return resolveProducerError(PAINT_LIBRARY_NOTICE_KEYS[code], PAINT_LIBRARY_NOTICE_KO[code], params);
}

// === vrmPaintRuntime 구간 ===
registerI18nLocaleEntries("ko", {
  "studio.producerError.vrmPaintRuntime.aggregateRgbaBudget": "텍스처와 실행 취소 기록의 전체 상주 메모리 한도를 초과합니다.",
  "studio.producerError.vrmPaintRuntime.bindingConflict": "저장된 표면 텍스처와 현재 모델의 재질 결합이 서로 충돌합니다.",
  "studio.producerError.vrmPaintRuntime.bindingMissing": "저장된 표면 텍스처가 가리키는 모델 재질을 찾지 못했습니다.",
  "studio.producerError.vrmPaintRuntime.canvasUnavailable": "페인팅 캔버스를 사용할 수 없습니다.",
  "studio.producerError.vrmPaintRuntime.channelUnsupported": "이 재질은 선택한 페인팅 채널을 지원하지 않습니다.",
  "studio.producerError.vrmPaintRuntime.disposed": "텍스처 페인팅이 이미 종료되었습니다.",
  "studio.producerError.vrmPaintRuntime.fillMemoryBudget": "이 텍스처는 안전한 ColorDrop 메모리 한도를 초과합니다.",
  "studio.producerError.vrmPaintRuntime.fillWorkerFailed": "ColorDrop 영역 계산을 완료하지 못했습니다.",
  "studio.producerError.vrmPaintRuntime.fillWorkerUnavailable": "이 브라우저에서는 안전한 ColorDrop Worker를 사용할 수 없습니다.",
  "studio.producerError.vrmPaintRuntime.historyBudget": "이 획은 실행 취소 메모리 한도를 초과합니다.",
  "studio.producerError.vrmPaintRuntime.hitOutsideScene": "현재 캐릭터 밖의 지점입니다.",
  "studio.producerError.vrmPaintRuntime.invalidDimensions": "텍스처 크기 또는 RGBA 데이터가 올바르지 않습니다.",
  "studio.producerError.vrmPaintRuntime.invalidPointer": "포인터 정보가 올바르지 않습니다.",
  "studio.producerError.vrmPaintRuntime.invalidStyle": "브러시 설정이 올바르지 않습니다.",
  "studio.producerError.vrmPaintRuntime.mapMissing": "재질에 색상 텍스처가 없습니다.",
  "studio.producerError.vrmPaintRuntime.materialMissing": "색상 재질을 찾을 수 없습니다.",
  "studio.producerError.vrmPaintRuntime.meshMissing": "페인팅할 메시를 찾을 수 없습니다.",
  "studio.producerError.vrmPaintRuntime.pointerActive": "다른 페인팅 입력이 진행 중입니다.",
  "studio.producerError.vrmPaintRuntime.pointerMismatch": "현재 획을 시작한 포인터가 아닙니다.",
  "studio.producerError.vrmPaintRuntime.readConcurrencyBudget": "동시에 불러올 수 있는 텍스처 수를 초과했습니다.",
  "studio.producerError.vrmPaintRuntime.sourceChanged": "불러오는 동안 원본 텍스처가 변경되었습니다.",
  "studio.producerError.vrmPaintRuntime.sourceCompressed": "압축 GPU 텍스처에는 직접 칠할 수 없습니다.",
  "studio.producerError.vrmPaintRuntime.sourceReadAborted": "텍스처 불러오기를 취소했습니다.",
  "studio.producerError.vrmPaintRuntime.sourceReadActive": "이 텍스처를 이미 불러오는 중입니다.",
  "studio.producerError.vrmPaintRuntime.sourceUnreadable": "텍스처를 읽을 수 없습니다. CORS 설정을 확인하세요.",
  "studio.producerError.vrmPaintRuntime.staleCompletion": "이전 텍스처 준비 결과를 무시했습니다.",
  "studio.producerError.vrmPaintRuntime.strokeSampleBudget": "한 획의 입력 지점 한도를 초과했습니다.",
  "studio.producerError.vrmPaintRuntime.surfaceOperationInvalid": "표면 브러시 텍스처 연산이 올바르지 않습니다.",
  "studio.producerError.vrmPaintRuntime.surfaceSessionInvalid": "표면 브러시 세션이 만료되었거나 다른 대상에 속합니다.",
  "studio.producerError.vrmPaintRuntime.targetInvalid": "페인팅 대상을 더 이상 사용할 수 없습니다.",
  "studio.producerError.vrmPaintRuntime.targetMismatch": "한 획으로 서로 다른 텍스처를 칠할 수 없습니다.",
  "studio.producerError.vrmPaintRuntime.targetRgbaBudget": "이 텍스처는 안전한 페인팅 상주 메모리 한도를 초과합니다.",
  "studio.producerError.vrmPaintRuntime.uvMissing": "이 지점의 UV 좌표를 사용할 수 없습니다.",
  "studio.producerError.vrmPaintRuntime.surfaceGuidance": "고밀도 메시({triangleCount}면)는 안전 한도 {maxTriangles}면을 넘어 UV 분석을 생략하고 면 단위 안전 모드로 칠합니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.vrmPaintRuntime.aggregateRgbaBudget": "This exceeds the total resident memory limit for textures and undo history.",
  "studio.producerError.vrmPaintRuntime.bindingConflict": "The saved surface texture conflicts with the current model's material binding.",
  "studio.producerError.vrmPaintRuntime.bindingMissing": "Could not find the model material that the saved surface texture points to.",
  "studio.producerError.vrmPaintRuntime.canvasUnavailable": "The painting canvas is unavailable.",
  "studio.producerError.vrmPaintRuntime.channelUnsupported": "This material does not support the selected painting channel.",
  "studio.producerError.vrmPaintRuntime.disposed": "Texture painting has already ended.",
  "studio.producerError.vrmPaintRuntime.fillMemoryBudget": "This texture exceeds the safe ColorDrop memory limit.",
  "studio.producerError.vrmPaintRuntime.fillWorkerFailed": "Could not complete the ColorDrop region calculation.",
  "studio.producerError.vrmPaintRuntime.fillWorkerUnavailable": "The safe ColorDrop Worker is unavailable in this browser.",
  "studio.producerError.vrmPaintRuntime.historyBudget": "This stroke exceeds the undo memory limit.",
  "studio.producerError.vrmPaintRuntime.hitOutsideScene": "This point is outside the current character.",
  "studio.producerError.vrmPaintRuntime.invalidDimensions": "The texture size or RGBA data is invalid.",
  "studio.producerError.vrmPaintRuntime.invalidPointer": "The pointer information is invalid.",
  "studio.producerError.vrmPaintRuntime.invalidStyle": "The brush settings are invalid.",
  "studio.producerError.vrmPaintRuntime.mapMissing": "The material has no color texture.",
  "studio.producerError.vrmPaintRuntime.materialMissing": "Could not find the color material.",
  "studio.producerError.vrmPaintRuntime.meshMissing": "Could not find the mesh to paint.",
  "studio.producerError.vrmPaintRuntime.pointerActive": "Another painting input is in progress.",
  "studio.producerError.vrmPaintRuntime.pointerMismatch": "This is not the pointer that started the current stroke.",
  "studio.producerError.vrmPaintRuntime.readConcurrencyBudget": "This exceeds the number of textures that can be loaded at once.",
  "studio.producerError.vrmPaintRuntime.sourceChanged": "The source texture changed while it was being loaded.",
  "studio.producerError.vrmPaintRuntime.sourceCompressed": "Compressed GPU textures cannot be painted directly.",
  "studio.producerError.vrmPaintRuntime.sourceReadAborted": "Texture loading was cancelled.",
  "studio.producerError.vrmPaintRuntime.sourceReadActive": "This texture is already being loaded.",
  "studio.producerError.vrmPaintRuntime.sourceUnreadable": "Could not read the texture. Please check the CORS settings.",
  "studio.producerError.vrmPaintRuntime.staleCompletion": "The previous texture preparation result was ignored.",
  "studio.producerError.vrmPaintRuntime.strokeSampleBudget": "This exceeds the input point limit for a single stroke.",
  "studio.producerError.vrmPaintRuntime.surfaceOperationInvalid": "The surface brush texture operation is invalid.",
  "studio.producerError.vrmPaintRuntime.surfaceSessionInvalid": "The surface brush session has expired or belongs to another target.",
  "studio.producerError.vrmPaintRuntime.targetInvalid": "The painting target is no longer available.",
  "studio.producerError.vrmPaintRuntime.targetMismatch": "A single stroke cannot paint different textures.",
  "studio.producerError.vrmPaintRuntime.targetRgbaBudget": "This texture exceeds the safe painting resident memory limit.",
  "studio.producerError.vrmPaintRuntime.uvMissing": "The UV coordinates for this point are unavailable.",
  "studio.producerError.vrmPaintRuntime.surfaceGuidance": "The high-density mesh ({triangleCount} triangles) exceeds the safety limit of {maxTriangles} triangles, so UV analysis is skipped and painting uses the per-face safe mode.",
});

const PAINT_RUNTIME_ERROR_KEYS: Readonly<Record<StudioVrmTexturePaintRuntimeError["code"], string>> = {
  "aggregate-rgba-budget": "studio.producerError.vrmPaintRuntime.aggregateRgbaBudget",
  "binding-conflict": "studio.producerError.vrmPaintRuntime.bindingConflict",
  "binding-missing": "studio.producerError.vrmPaintRuntime.bindingMissing",
  "canvas-unavailable": "studio.producerError.vrmPaintRuntime.canvasUnavailable",
  "channel-unsupported": "studio.producerError.vrmPaintRuntime.channelUnsupported",
  "disposed": "studio.producerError.vrmPaintRuntime.disposed",
  "fill-memory-budget": "studio.producerError.vrmPaintRuntime.fillMemoryBudget",
  "fill-worker-failed": "studio.producerError.vrmPaintRuntime.fillWorkerFailed",
  "fill-worker-unavailable": "studio.producerError.vrmPaintRuntime.fillWorkerUnavailable",
  "history-budget": "studio.producerError.vrmPaintRuntime.historyBudget",
  "hit-outside-scene": "studio.producerError.vrmPaintRuntime.hitOutsideScene",
  "invalid-dimensions": "studio.producerError.vrmPaintRuntime.invalidDimensions",
  "invalid-pointer": "studio.producerError.vrmPaintRuntime.invalidPointer",
  "invalid-style": "studio.producerError.vrmPaintRuntime.invalidStyle",
  "map-missing": "studio.producerError.vrmPaintRuntime.mapMissing",
  "material-missing": "studio.producerError.vrmPaintRuntime.materialMissing",
  "mesh-missing": "studio.producerError.vrmPaintRuntime.meshMissing",
  "pointer-active": "studio.producerError.vrmPaintRuntime.pointerActive",
  "pointer-mismatch": "studio.producerError.vrmPaintRuntime.pointerMismatch",
  "read-concurrency-budget": "studio.producerError.vrmPaintRuntime.readConcurrencyBudget",
  "source-changed": "studio.producerError.vrmPaintRuntime.sourceChanged",
  "source-compressed": "studio.producerError.vrmPaintRuntime.sourceCompressed",
  "source-read-aborted": "studio.producerError.vrmPaintRuntime.sourceReadAborted",
  "source-read-active": "studio.producerError.vrmPaintRuntime.sourceReadActive",
  "source-unreadable": "studio.producerError.vrmPaintRuntime.sourceUnreadable",
  "stale-completion": "studio.producerError.vrmPaintRuntime.staleCompletion",
  "stroke-sample-budget": "studio.producerError.vrmPaintRuntime.strokeSampleBudget",
  "surface-operation-invalid": "studio.producerError.vrmPaintRuntime.surfaceOperationInvalid",
  "surface-session-invalid": "studio.producerError.vrmPaintRuntime.surfaceSessionInvalid",
  "target-invalid": "studio.producerError.vrmPaintRuntime.targetInvalid",
  "target-mismatch": "studio.producerError.vrmPaintRuntime.targetMismatch",
  "target-rgba-budget": "studio.producerError.vrmPaintRuntime.targetRgbaBudget",
  "uv-missing": "studio.producerError.vrmPaintRuntime.uvMissing",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const PAINT_RUNTIME_ERROR_KO: Readonly<Record<StudioVrmTexturePaintRuntimeError["code"], string>> = {
  "aggregate-rgba-budget": "텍스처와 실행 취소 기록의 전체 상주 메모리 한도를 초과합니다.",
  "binding-conflict": "저장된 표면 텍스처와 현재 모델의 재질 결합이 서로 충돌합니다.",
  "binding-missing": "저장된 표면 텍스처가 가리키는 모델 재질을 찾지 못했습니다.",
  "canvas-unavailable": "페인팅 캔버스를 사용할 수 없습니다.",
  "channel-unsupported": "이 재질은 선택한 페인팅 채널을 지원하지 않습니다.",
  "disposed": "텍스처 페인팅이 이미 종료되었습니다.",
  "fill-memory-budget": "이 텍스처는 안전한 ColorDrop 메모리 한도를 초과합니다.",
  "fill-worker-failed": "ColorDrop 영역 계산을 완료하지 못했습니다.",
  "fill-worker-unavailable": "이 브라우저에서는 안전한 ColorDrop Worker를 사용할 수 없습니다.",
  "history-budget": "이 획은 실행 취소 메모리 한도를 초과합니다.",
  "hit-outside-scene": "현재 캐릭터 밖의 지점입니다.",
  "invalid-dimensions": "텍스처 크기 또는 RGBA 데이터가 올바르지 않습니다.",
  "invalid-pointer": "포인터 정보가 올바르지 않습니다.",
  "invalid-style": "브러시 설정이 올바르지 않습니다.",
  "map-missing": "재질에 색상 텍스처가 없습니다.",
  "material-missing": "색상 재질을 찾을 수 없습니다.",
  "mesh-missing": "페인팅할 메시를 찾을 수 없습니다.",
  "pointer-active": "다른 페인팅 입력이 진행 중입니다.",
  "pointer-mismatch": "현재 획을 시작한 포인터가 아닙니다.",
  "read-concurrency-budget": "동시에 불러올 수 있는 텍스처 수를 초과했습니다.",
  "source-changed": "불러오는 동안 원본 텍스처가 변경되었습니다.",
  "source-compressed": "압축 GPU 텍스처에는 직접 칠할 수 없습니다.",
  "source-read-aborted": "텍스처 불러오기를 취소했습니다.",
  "source-read-active": "이 텍스처를 이미 불러오는 중입니다.",
  "source-unreadable": "텍스처를 읽을 수 없습니다. CORS 설정을 확인하세요.",
  "stale-completion": "이전 텍스처 준비 결과를 무시했습니다.",
  "stroke-sample-budget": "한 획의 입력 지점 한도를 초과했습니다.",
  "surface-operation-invalid": "표면 브러시 텍스처 연산이 올바르지 않습니다.",
  "surface-session-invalid": "표면 브러시 세션이 만료되었거나 다른 대상에 속합니다.",
  "target-invalid": "페인팅 대상을 더 이상 사용할 수 없습니다.",
  "target-mismatch": "한 획으로 서로 다른 텍스처를 칠할 수 없습니다.",
  "target-rgba-budget": "이 텍스처는 안전한 페인팅 상주 메모리 한도를 초과합니다.",
  "uv-missing": "이 지점의 UV 좌표를 사용할 수 없습니다.",
};

const PAINT_RUNTIME_GUIDANCE_KO = "고밀도 메시({triangleCount}면)는 안전 한도 {maxTriangles}면을 넘어 UV 분석을 생략하고 면 단위 안전 모드로 칠합니다.";

/** 표시 지점 전용 해석 (vrmPaintRuntime): 스냅샷 오류 코드를 현재 로케일 문구로 바꾼다. */
export function resolveStudioVrmPaintRuntimeError(
  error: Pick<StudioVrmTexturePaintRuntimeError, "code" | "params">,
): string {
  return resolveProducerError(
    PAINT_RUNTIME_ERROR_KEYS[error.code],
    PAINT_RUNTIME_ERROR_KO[error.code],
    error.params,
  );
}

/** 표시 지점 전용 해석 (vrmPaintRuntime guidance): 삼각형 예산 안내를 현재 로케일 문구로 바꾼다. */
export function resolveStudioVrmPaintRuntimeGuidance(
  guidance: Pick<StudioVrmTexturePaintRuntimeGuidance, "triangleCount" | "maxTriangles">,
): string {
  return resolveProducerError(
    "studio.producerError.vrmPaintRuntime.surfaceGuidance",
    PAINT_RUNTIME_GUIDANCE_KO,
    {
      triangleCount: String(guidance.triangleCount),
      maxTriangles: String(guidance.maxTriangles),
    },
  );
}
