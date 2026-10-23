/**
 * 생산자 구조화 에러 해석 모듈 — personalCloud 구간: personal-cloud-upload 세부 22코드 (A4 D4, R14).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 코어 모듈이
 * 소스 파일 크기 래칫(800줄 상한)에 닿아, R11 구간부터 frozen 사전군과 같은
 * 분할 관례로 파일 단위 형제 모듈로 나눴다. 계약은 코어와 동일하다:
 * 생산자는 {code, params}만 방출하고, 표시는 이 모듈의 리졸버로만 해석한다.
 * ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규 번역이다.
 *
 * 클래스 code 5종(conflict·unauthorized·provider·network·cancelled)은
 * Page의 분기(unauthorized 재연결·conflict 상태)가 쓰므로 그대로 유지하고,
 * 표시 문구는 병행 신설한 detailCode 22종으로 해석한다.
 * requireOk의 서버 응답 detail은 {detail} 패스스루다 — 서버가 돌려준 문자열
 * 자체는 번역 대상이 아니며, 생산자가 선행 공백을 포함해 params로 싣는다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  PersonalCloudDetailCode,
  PersonalCloudUploadError,
} from "../save-first/personal-cloud-upload";

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
  "studio.producerError.personalCloud.cancelled": "개인 저장소 업로드를 취소했습니다.",
  "studio.producerError.personalCloud.responseInvalid": "저장소 응답을 해석하지 못했습니다. ({status})",
  "studio.producerError.personalCloud.unauthorized": "{provider} 연결 권한이 만료되었습니다. 계정을 다시 연결해 주세요.",
  "studio.producerError.personalCloud.providerRequestFailed": "{provider} 요청에 실패했습니다. ({status}){detail}",
  "studio.producerError.personalCloud.providerRemoteVersionFailed": "{provider} 원격 버전 확인에 실패했습니다. ({status}){detail}",
  "studio.producerError.personalCloud.providerUploadFailed": "{provider} 업로드에 실패했습니다. ({status}){detail}",
  "studio.producerError.personalCloud.providerUploadSessionFailed": "{provider} 업로드 세션 생성에 실패했습니다. ({status}){detail}",
  "studio.producerError.personalCloud.providerFolderCreateFailed": "{provider} 폴더 생성에 실패했습니다. ({status}){detail}",
  "studio.producerError.personalCloud.networkFailed": "{provider} 연결 중 네트워크 오류가 발생했습니다.",
  "studio.producerError.personalCloud.conflictRemoteChanged": "{provider}의 원격 사본이 다른 기기에서 변경되었습니다. 두 버전을 비교한 뒤 저장 방향을 선택해 주세요.",
  "studio.producerError.personalCloud.conflictPathOccupied": "{provider}에 “{path}” 경로를 차지한 다른 항목이 있습니다.",
  "studio.producerError.personalCloud.conflictSameNameExists": "같은 이름의 {provider} 파일이 이미 있습니다. 기존 파일을 연결하거나 이름을 바꿔 저장해 주세요.",
  "studio.producerError.personalCloud.conflictNameExists": "{provider}에 “{name}” 이름의 다른 항목이 이미 있습니다.",
  "studio.producerError.personalCloud.folderCreateFailed": "{provider} 폴더를 만들지 못했습니다.",
  "studio.producerError.personalCloud.uploadResultUnconfirmed": "{provider} 업로드 결과를 확인하지 못했습니다.",
  "studio.producerError.personalCloud.projectFileEmpty": "업로드할 프로젝트 파일이 비어 있습니다.",
  "studio.producerError.personalCloud.uploadSessionUrlMissing": "{provider} 업로드 세션 주소를 받지 못했습니다.",
  "studio.producerError.personalCloud.folderResultUnconfirmed": "{provider} 폴더 생성 결과를 확인하지 못했습니다.",
  "studio.producerError.personalCloud.uploadSessionStartFailed": "{provider} 업로드 세션을 시작하지 못했습니다.",
  "studio.producerError.personalCloud.appFolderOpenFailed": "{provider} 앱 저장 폴더를 열지 못했습니다.",
  "studio.producerError.personalCloud.bindingProviderMismatch": "프로젝트 저장 위치와 연결 계정이 일치하지 않습니다.",
  "studio.producerError.personalCloud.contentHashFailed": "업로드 전 프로젝트 무결성 해시를 만들지 못했습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.personalCloud.cancelled": "The personal storage upload was cancelled.",
  "studio.producerError.personalCloud.responseInvalid": "Could not parse the storage response. ({status})",
  "studio.producerError.personalCloud.unauthorized": "The {provider} connection permission has expired. Please reconnect your account.",
  "studio.producerError.personalCloud.providerRequestFailed": "The {provider} request failed. ({status}){detail}",
  "studio.producerError.personalCloud.providerRemoteVersionFailed": "Checking the {provider} remote version failed. ({status}){detail}",
  "studio.producerError.personalCloud.providerUploadFailed": "The {provider} upload failed. ({status}){detail}",
  "studio.producerError.personalCloud.providerUploadSessionFailed": "Creating the {provider} upload session failed. ({status}){detail}",
  "studio.producerError.personalCloud.providerFolderCreateFailed": "Creating the {provider} folder failed. ({status}){detail}",
  "studio.producerError.personalCloud.networkFailed": "A network error occurred while connecting to {provider}.",
  "studio.producerError.personalCloud.conflictRemoteChanged": "The remote copy in {provider} was changed on another device. Compare the two versions, then choose a save direction.",
  "studio.producerError.personalCloud.conflictPathOccupied": "Another item already occupies the path “{path}” in {provider}.",
  "studio.producerError.personalCloud.conflictSameNameExists": "A {provider} file with the same name already exists. Connect the existing file or save under a different name.",
  "studio.producerError.personalCloud.conflictNameExists": "Another item named “{name}” already exists in {provider}.",
  "studio.producerError.personalCloud.folderCreateFailed": "Could not create the {provider} folder.",
  "studio.producerError.personalCloud.uploadResultUnconfirmed": "Could not confirm the {provider} upload result.",
  "studio.producerError.personalCloud.projectFileEmpty": "The project file to upload is empty.",
  "studio.producerError.personalCloud.uploadSessionUrlMissing": "Did not receive the {provider} upload session address.",
  "studio.producerError.personalCloud.folderResultUnconfirmed": "Could not confirm the {provider} folder creation result.",
  "studio.producerError.personalCloud.uploadSessionStartFailed": "Could not start the {provider} upload session.",
  "studio.producerError.personalCloud.appFolderOpenFailed": "Could not open the {provider} app storage folder.",
  "studio.producerError.personalCloud.bindingProviderMismatch": "The project storage location and the connected account do not match.",
  "studio.producerError.personalCloud.contentHashFailed": "Could not create the project integrity hash before uploading.",
});

const PERSONAL_CLOUD_ERROR_KEYS: Readonly<Record<PersonalCloudDetailCode, string>> = {
  cancelled: "studio.producerError.personalCloud.cancelled",
  "response-invalid": "studio.producerError.personalCloud.responseInvalid",
  unauthorized: "studio.producerError.personalCloud.unauthorized",
  "provider-request-failed": "studio.producerError.personalCloud.providerRequestFailed",
  "provider-remote-version-failed": "studio.producerError.personalCloud.providerRemoteVersionFailed",
  "provider-upload-failed": "studio.producerError.personalCloud.providerUploadFailed",
  "provider-upload-session-failed": "studio.producerError.personalCloud.providerUploadSessionFailed",
  "provider-folder-create-failed": "studio.producerError.personalCloud.providerFolderCreateFailed",
  "network-failed": "studio.producerError.personalCloud.networkFailed",
  "conflict-remote-changed": "studio.producerError.personalCloud.conflictRemoteChanged",
  "conflict-path-occupied": "studio.producerError.personalCloud.conflictPathOccupied",
  "conflict-same-name-exists": "studio.producerError.personalCloud.conflictSameNameExists",
  "conflict-name-exists": "studio.producerError.personalCloud.conflictNameExists",
  "folder-create-failed": "studio.producerError.personalCloud.folderCreateFailed",
  "upload-result-unconfirmed": "studio.producerError.personalCloud.uploadResultUnconfirmed",
  "project-file-empty": "studio.producerError.personalCloud.projectFileEmpty",
  "upload-session-url-missing": "studio.producerError.personalCloud.uploadSessionUrlMissing",
  "folder-result-unconfirmed": "studio.producerError.personalCloud.folderResultUnconfirmed",
  "upload-session-start-failed": "studio.producerError.personalCloud.uploadSessionStartFailed",
  "app-folder-open-failed": "studio.producerError.personalCloud.appFolderOpenFailed",
  "binding-provider-mismatch": "studio.producerError.personalCloud.bindingProviderMismatch",
  "content-hash-failed": "studio.producerError.personalCloud.contentHashFailed",
};

/** 세부 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const PERSONAL_CLOUD_ERROR_KO: Readonly<Record<PersonalCloudDetailCode, string>> = {
  cancelled: "개인 저장소 업로드를 취소했습니다.",
  "response-invalid": "저장소 응답을 해석하지 못했습니다. ({status})",
  unauthorized: "{provider} 연결 권한이 만료되었습니다. 계정을 다시 연결해 주세요.",
  "provider-request-failed": "{provider} 요청에 실패했습니다. ({status}){detail}",
  "provider-remote-version-failed": "{provider} 원격 버전 확인에 실패했습니다. ({status}){detail}",
  "provider-upload-failed": "{provider} 업로드에 실패했습니다. ({status}){detail}",
  "provider-upload-session-failed": "{provider} 업로드 세션 생성에 실패했습니다. ({status}){detail}",
  "provider-folder-create-failed": "{provider} 폴더 생성에 실패했습니다. ({status}){detail}",
  "network-failed": "{provider} 연결 중 네트워크 오류가 발생했습니다.",
  "conflict-remote-changed": "{provider}의 원격 사본이 다른 기기에서 변경되었습니다. 두 버전을 비교한 뒤 저장 방향을 선택해 주세요.",
  "conflict-path-occupied": "{provider}에 “{path}” 경로를 차지한 다른 항목이 있습니다.",
  "conflict-same-name-exists": "같은 이름의 {provider} 파일이 이미 있습니다. 기존 파일을 연결하거나 이름을 바꿔 저장해 주세요.",
  "conflict-name-exists": "{provider}에 “{name}” 이름의 다른 항목이 이미 있습니다.",
  "folder-create-failed": "{provider} 폴더를 만들지 못했습니다.",
  "upload-result-unconfirmed": "{provider} 업로드 결과를 확인하지 못했습니다.",
  "project-file-empty": "업로드할 프로젝트 파일이 비어 있습니다.",
  "upload-session-url-missing": "{provider} 업로드 세션 주소를 받지 못했습니다.",
  "folder-result-unconfirmed": "{provider} 폴더 생성 결과를 확인하지 못했습니다.",
  "upload-session-start-failed": "{provider} 업로드 세션을 시작하지 못했습니다.",
  "app-folder-open-failed": "{provider} 앱 저장 폴더를 열지 못했습니다.",
  "binding-provider-mismatch": "프로젝트 저장 위치와 연결 계정이 일치하지 않습니다.",
  "content-hash-failed": "업로드 전 프로젝트 무결성 해시를 만들지 못했습니다.",
};

/** 표시 지점 전용 해석 (personalCloud 업로드): Page의 uploadFailureMessage가 부른다. */
export function resolvePersonalCloudUploadError(error: PersonalCloudUploadError): string {
  return resolveProducerError(
    PERSONAL_CLOUD_ERROR_KEYS[error.detailCode],
    PERSONAL_CLOUD_ERROR_KO[error.detailCode],
    error.params,
  );
}

/**
 * 표시 지점 전용 해석 (personalCloud 업로드, 원인 객체 진입점): Page는 생산자
 * 클래스를 이미 import하므로 instanceof 뒤 이 함수로 충분하지만, 클래스
 * 인스턴스가 아닌 원인은 null — 호출자는 기존 메시지 경로로 폴백한다.
 */
export function resolvePersonalCloudUploadErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, detailCode } = cause as { name?: unknown; detailCode?: unknown };
  if (name !== "PersonalCloudUploadError" || typeof detailCode !== "string") return null;
  if (!Object.hasOwn(PERSONAL_CLOUD_ERROR_KEYS, detailCode)) return null;
  return resolvePersonalCloudUploadError(cause as PersonalCloudUploadError);
}
