/**
 * AI Result 채널 에러 문구 사전 (A4 후속 AI 이관 T1, 2026-10-22).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다 (studio-ai-status-i18n·
 * studio-panel-status-i18n 선례와 같은 방식). ko 값은 이관 전 원문 그대로,
 * en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (studio-ai-error-i18n.test.ts가 패리티를 고정한다).
 *
 * 비UI 생산자는 훅을 쓸 수 없으므로, 생산 시점에 현재 로케일로 해석하는
 * `aiErrorText` 헬퍼를 함께 둔다 (platform/api-error.ts의
 * `getLang()` + `resolveTranslationForDisplay` 선례). 반환 계약
 * `{ ok:false, code, error: string }`은 바꾸지 않으며 소비처는 무변경이다.
 * 동적 패스스루(제공자·서버·파서 메시지)는 키화하지 않고 호출부가
 * frame 문구의 파라미터로만 끼운다 (설계 §3.4).
 *
 * 네임스페이스 구간: `.client.*` studio-ai-client, `.reference.*`
 * studio-ai-reference-images, `.wizard.*` canon 사진 위저드,
 * `.server.*` studio-server-ai-client, `.fal.*` studio-lora-fal·
 * studio-lora-training (T2), `.personal.*` personal-inference-client,
 * `.threed.*` studio-3d-generation-client (T3). 후속 트랜치(T4~T5)는
 * `.issue.*` 구간을 이어 붙인다.
 *
 * 영속 코드 (T2): studio-lora-training의 잡 레코드 `lastError`는 해석된
 * 문구가 아니라 이 사전의 키 자체(`studio.aiError.fal.*`)와
 * `lastErrorParams`를 저장한다. 표시측은 `resolveAiErrorText`로 표시
 * 시점 로케일로 해석하며, 키 형식이 아닌 구 레코드 문자열은 그대로
 * 돌려주는 하위호환을 유지한다 (설계 §3.2-④).
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "studio.aiError.client.apiKeyRequired": "설정에서 API 키를 등록하세요.",
  "studio.aiError.client.animeImageMissing": "변환할 이미지가 없습니다.",
  "studio.aiError.client.backgroundPromptRequired": "배경 프롬프트를 입력하세요.",
  "studio.aiError.client.characterReferenceRequired": "기준 캐릭터 이미지를 선택하세요.",
  "studio.aiError.client.characterSituationRequired": "새로 그리고 싶은 상황을 입력하세요.",
  "studio.aiError.client.cloudRequestFailed": "클라우드 AI 요청에 실패했습니다.",
  "studio.aiError.client.colorizeImageMissing": "채색할 이미지가 없습니다.",
  "studio.aiError.client.colorizePromptRequired": "채색 지시 프롬프트를 입력하세요.",
  "studio.aiError.client.dialogueEmpty": "번역할 대사가 없습니다.",
  "studio.aiError.client.dialogueSuggestionMissing": "응답에서 대사 제안을 찾을 수 없습니다.",
  "studio.aiError.client.endpointUnreachable": "엔드포인트에 연결할 수 없어요. 주소·네트워크 상태와 CORS 허용 여부를 확인해 주세요.",
  "studio.aiError.client.httpRequestFailed": "요청이 실패했습니다 (HTTP {status}): {message}",
  "studio.aiError.client.imageDataMissing": "응답에서 이미지 데이터(b64_json)를 찾을 수 없습니다.",
  "studio.aiError.client.imageReadFailed": "이미지를 읽지 못했습니다.",
  "studio.aiError.client.moodRequired": "장르/무드를 입력하세요.",
  "studio.aiError.client.networkRequestFailed": "네트워크 요청에 실패했습니다.",
  "studio.aiError.client.paletteSuggestionMissing": "응답에서 팔레트 제안을 찾을 수 없습니다.",
  "studio.aiError.client.promptAndReferenceTooLong": "장면 프롬프트와 기준 이미지 지시문의 합계는 {count}자를 넘을 수 없습니다.",
  "studio.aiError.client.referenceBindingFailed": "기준 이미지 binding을 해석하지 못했습니다.",
  "studio.aiError.client.referenceFormatOrSizeMismatch": "기준 이미지의 형식 또는 디코딩 크기가 선언과 일치하지 않습니다.",
  "studio.aiError.client.referenceImageReadFailed": "기준 이미지를 읽지 못했습니다.",
  "studio.aiError.client.referenceInfoReadFailed": "기준 이미지 정보를 안전하게 읽지 못했습니다.",
  "studio.aiError.client.referenceListInvalid": "기준 이미지 목록이 올바르지 않습니다.",
  "studio.aiError.client.referenceMimeMismatch": "기준 이미지의 실제 파일 형식이 MIME 선언과 일치하지 않습니다.",
  "studio.aiError.client.referenceTotalSizeExceeded": "기준 이미지의 전체 디코딩 크기는 {count}바이트를 넘을 수 없습니다.",
  "studio.aiError.client.requestCancelled": "요청이 취소되었습니다.",
  "studio.aiError.client.responseBodyReadFailed": "응답 본문을 읽지 못했습니다.",
  "studio.aiError.client.responseNotJson": "응답을 해석하지 못했습니다(JSON 형식이 아닙니다).",
  "studio.aiError.client.scenarioTextMissing": "응답에서 장면 구성 텍스트를 찾을 수 없습니다.",
  "studio.aiError.client.scenePromptRequired": "새로 그리고 싶은 장면을 입력하세요.",
  "studio.aiError.client.sceneTextRequired": "장면 시나리오/대사를 입력하세요.",
  "studio.aiError.client.serverLoginOrApiKeyRequired": "서버 AI에 로그인하거나 설정에서 API 키를 등록하세요.",
  "studio.aiError.client.situationRequired": "장면 상황을 입력하세요.",
  "studio.aiError.client.storyIdeaRequired": "스토리 아이디어를 입력하세요.",
  "studio.aiError.client.storyToolsLoadTimeout": "스토리 편집 도구를 불러오는 시간이 초과됐어요. 다시 시도해 주세요.",
  "studio.aiError.client.suggestionTextMissing": "응답에서 제안 텍스트를 찾을 수 없습니다.",
  "studio.aiError.client.translationTextMissing": "응답에서 번역 텍스트를 찾을 수 없습니다.",
  "studio.aiError.client.unknownError": "알 수 없는 오류",
  "studio.aiError.client.writerRoomDraftMissing": "응답에서 Writer Room 초안을 찾을 수 없습니다.",
  "studio.aiError.reference.base64Invalid": "기준 이미지의 base64 데이터가 올바르지 않습니다.",
  "studio.aiError.reference.base64Required": "기준 이미지는 base64로 인코딩된 data URL이어야 합니다.",
  "studio.aiError.reference.dataUrlFormatRequired": "기준 이미지는 PNG, JPEG 또는 WebP base64 data URL이어야 합니다.",
  "studio.aiError.reference.dataUrlNotSupported": "data URL 형식이 아닙니다(원격 URL 이미지는 지원하지 않습니다).",
  "studio.aiError.reference.decodedSizeInvalid": "기준 이미지의 디코딩 크기가 올바르지 않습니다.",
  "studio.aiError.reference.duplicateReferenceConflict": "중복된 기준 이미지 ID({id})의 내용이 서로 다릅니다.",
  "studio.aiError.reference.formatOnly": "기준 이미지는 PNG, JPEG 또는 WebP 형식만 사용할 수 있습니다.",
  "studio.aiError.reference.maxImagesExceeded": "기준 이미지는 최대 {count}개까지 사용할 수 있습니다.",
  "studio.aiError.reference.perRoleLimitExceeded": "한 역할에는 기준 이미지를 최대 {count}개까지 사용할 수 있습니다.",
  "studio.aiError.reference.referenceIdOrRoleInvalid": "기준 이미지의 ID 또는 역할이 올바르지 않습니다.",
  "studio.aiError.reference.referenceInfoInvalid": "기준 이미지 정보가 올바르지 않습니다.",
  "studio.aiError.reference.roleReferenceRequired": "역할이 지정된 기준 이미지를 한 개 이상 선택하세요.",
  "studio.aiError.reference.singleImageSizeExceeded": "기준 이미지 한 장의 디코딩 크기는 {count}바이트를 넘을 수 없습니다.",
  "studio.aiError.server.invalidOperationId": "AI 요청 식별자가 올바르지 않아요.",
  "studio.aiError.server.loginRequired": "로그인하면 자동 무료 AI를 바로 사용할 수 있어요. 현재 입력은 그대로 유지됩니다. 로그인하지 않으려면 통합 AI 설정에서 개인 무료 API 키를 연결하세요.",
  "studio.aiError.server.poolExhausted": "현재 사용할 수 있는 자동 무료 AI와 개인 무료 키의 한도가 모두 소진됐어요. 통합 AI 설정에서 다른 무료 경로를 연결하거나 한도가 갱신된 뒤 다시 시도해 주세요.",
  "studio.aiError.server.requestCancelledNoRetry": "AI 요청이 취소되었습니다. 같은 요청을 다른 공급자로 자동 재전송하지 않았습니다.",
  "studio.aiError.server.requestFailed": "자동 무료 AI 요청에 실패했어요.",
  "studio.aiError.server.responseFormatUnconfirmed": "자동 무료 AI 응답 형식을 확인하지 못했어요.",
  "studio.aiError.wizard.photoRequired": "먼저 사진을 올려 주세요.",
  "studio.aiError.wizard.styleRequired": "스타일을 골라 주세요.",
  "studio.aiError.fal.notConfigured": "fal.ai 키가 등록되어 있지 않습니다.",
  "studio.aiError.fal.networkUnreachable": "fal 서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.",
  "studio.aiError.fal.requestRejected": "fal 요청이 거부됐습니다(HTTP {status}): {message}",
  "studio.aiError.fal.requestRejectedBare": "fal 요청이 거부됐습니다(HTTP {status}).",
  "studio.aiError.fal.queueSubmissionIdMissing": "fal 큐 제출 응답에서 요청 ID를 찾지 못했습니다.",
  "studio.aiError.fal.trainingImagesUrlEmpty": "학습 이미지 묶음 주소가 비어 있습니다.",
  "studio.aiError.fal.triggerWordRequired": "트리거 워드를 입력하세요.",
  "studio.aiError.fal.storageUploadAddressesMissing": "fal 스토리지 업로드 응답에서 주소를 찾지 못했습니다.",
  "studio.aiError.fal.storageUploadNetwork": "fal 스토리지에 파일을 올리지 못했습니다.",
  "studio.aiError.fal.storageUploadRejected": "fal 스토리지 업로드가 거부됐습니다(HTTP {status}).",
  "studio.aiError.fal.generationPromptRequired": "생성할 장면을 입력하세요.",
  "studio.aiError.fal.generationModelUrlMissing": "학습된 모델 파일 주소가 없습니다.",
  "studio.aiError.fal.generationRequestNotFound": "fal에서 생성 요청을 찾을 수 없습니다.",
  "studio.aiError.fal.generationImageMissing": "fal 생성 결과에서 이미지를 찾지 못했습니다.",
  "studio.aiError.fal.generationStatusUnparsable": "fal 생성 상태 응답을 해석하지 못했습니다.",
  "studio.aiError.fal.generationStillProcessing": "fal 생성이 제한 시간 안에 끝나지 않았습니다. 요청 자체는 fal에서 계속 처리될 수 있습니다.",
  "studio.aiError.fal.jobRequestNotFound": "fal에서 이 학습 요청을 찾을 수 없습니다(만료되었거나 취소됨).",
  "studio.aiError.fal.jobStatusRejected": "fal 상태 조회가 거부됐습니다(HTTP {status}). 잠시 뒤 다시 시도해 주세요.",
  "studio.aiError.fal.jobResultFetchFailed": "학습은 끝났지만 결과를 가져오지 못했습니다. 다시 새로고침해 주세요.",
  "studio.aiError.fal.jobEndedWithoutResult": "fal 학습이 결과 없이 종료됐습니다(HTTP {status}).",
  "studio.aiError.fal.jobResultLoraMissing": "fal 학습 결과에서 LoRA 파일을 찾지 못했습니다.",
  "studio.aiError.fal.jobUnknownStatus": "fal이 알 수 없는 학습 상태를 돌려줬습니다. 잠시 뒤 다시 새로고침해 주세요.",
  "studio.aiError.personal.runtimeNotConfigured": "통합 AI 설정에서 외부 Creator Runtime 주소와 토큰을 등록하세요.",
  "studio.aiError.personal.responseSizeUnknown": "클라우드 추론 런타임 응답 크기를 확인할 수 없습니다.",
  "studio.aiError.personal.responseTooLarge": "클라우드 추론 런타임 응답이 허용 크기를 초과했습니다.",
  "studio.aiError.personal.invalidPath": "클라우드 추론 런타임 경로가 올바르지 않습니다.",
  "studio.aiError.personal.requestRejected": "클라우드 추론 런타임 요청 실패 (HTTP {status}). 자동 재시도하지 않았습니다.",
  "studio.aiError.personal.invalidJson": "클라우드 추론 런타임 JSON 응답을 확인하지 못했습니다.",
  "studio.aiError.personal.invalidJob": "클라우드 추론 작업 응답이 올바르지 않습니다.",
  "studio.aiError.personal.invalidArtifactInfo": "클라우드 추론 결과 파일 정보가 올바르지 않습니다.",
  "studio.aiError.personal.capabilitiesUnknown": "클라우드 추론 런타임 기능 정보를 확인하지 못했습니다.",
  "studio.aiError.personal.assetTooLarge": "이미지는 8MB, GLB는 32MB 이하만 사용할 수 있습니다.",
  "studio.aiError.personal.invalidUploadResponse": "클라우드 추론 런타임 업로드 응답이 올바르지 않습니다.",
  "studio.aiError.personal.jobListUnknown": "클라우드 추론 작업 목록을 확인하지 못했습니다.",
  "studio.aiError.personal.invalidIdempotencyKey": "중복 방지 요청 키가 올바르지 않습니다.",
  "studio.aiError.personal.invalidJobId": "작업 ID가 올바르지 않습니다.",
  "studio.aiError.personal.unverifiedArtifact": "검증되지 않은 결과 파일입니다.",
  "studio.aiError.personal.artifactChunkTruncated": "결과 파일 조각이 잘렸습니다.",
  "studio.aiError.personal.integrityMismatch": "결과 파일 무결성 검사에 실패했습니다.",
  "studio.aiError.threed.invalidResponse": "3D 생성 서버의 응답 형식이 올바르지 않아요. 원본 작업은 변경하지 않았어요.",
  "studio.aiError.threed.responseTooLarge": "3D 생성 응답이 허용 크기를 초과했어요.",
  "studio.aiError.threed.authRequired": "3D 생성을 사용하려면 로그인과 이용 권한을 확인해 주세요.",
  "studio.aiError.threed.rateLimited": "3D 생성 요청이 많아요. 잠시 후 다시 시도해 주세요.",
  "studio.aiError.threed.serverUnavailable": "3D 생성 서버가 응답하지 못했어요. 원본을 유지한 채 다시 시도할 수 있어요.",
  "studio.aiError.threed.requestRejected": "3D 생성 요청에 실패했어요. (HTTP {status})",
  "studio.aiError.threed.userIdentityRequired": "Studio 3D generation client requires a user identity.",
  "studio.aiError.threed.idempotencyKeyRequired": "중복 생성을 막기 위한 요청 ID가 필요해요.",
  "studio.aiError.threed.inlineInputTooLarge": "현재 3D 요청은 입력 파일 합계 10MB까지 지원해요. 더 큰 자산은 객체 저장소 업로드가 필요합니다.",
  "studio.aiError.threed.jobIdRequired": "3D 생성 작업 ID가 필요해요.",
  "studio.aiError.threed.artifactDownloadFailed": "3D 결과를 내려받지 못했어요.",
  "studio.aiError.threed.artifactEmpty": "3D 결과 파일이 비어 있어요.",
  "studio.aiError.threed.artifactSizeMismatch": "3D 결과의 크기가 기록과 달라요. 다시 내려받아 주세요.",
  "studio.aiError.threed.secureContextRequired": "3D 결과 무결성 검증에는 보안 연결이 필요해요.",
  "studio.aiError.threed.artifactIntegrityMismatch": "3D 결과 검증에 실패했어요. 손상된 파일은 삽입하지 않았어요.",
  "studio.aiError.threed.artifactWrongDocument": "3D 모델 대신 오류 문서가 반환되었어요.",
  "studio.aiError.threed.inputLimitInvalid": "입력 파일의 크기 제한이 올바르지 않아요.",
  "studio.aiError.threed.inputSizeRange": "File must be between 1 byte and {maxBytes} bytes.",
  "studio.aiError.threed.inputSizeMismatch": "입력 파일의 실제 크기가 파일 정보와 달라요.",
});

registerI18nLocaleEntries("en", {
  "studio.aiError.client.apiKeyRequired": "Add an API key in Settings.",
  "studio.aiError.client.animeImageMissing": "There is no image to convert.",
  "studio.aiError.client.backgroundPromptRequired": "Enter a background prompt.",
  "studio.aiError.client.characterReferenceRequired": "Select a reference character image.",
  "studio.aiError.client.characterSituationRequired": "Describe the new scene you want to draw.",
  "studio.aiError.client.cloudRequestFailed": "The cloud AI request failed.",
  "studio.aiError.client.colorizeImageMissing": "There is no image to colorize.",
  "studio.aiError.client.colorizePromptRequired": "Enter a colorization prompt.",
  "studio.aiError.client.dialogueEmpty": "There is no dialogue to translate.",
  "studio.aiError.client.dialogueSuggestionMissing": "Could not find dialogue suggestions in the response.",
  "studio.aiError.client.endpointUnreachable": "Could not connect to the endpoint. Check the address, your network connection, and CORS settings.",
  "studio.aiError.client.httpRequestFailed": "The request failed (HTTP {status}): {message}",
  "studio.aiError.client.imageDataMissing": "Could not find image data (b64_json) in the response.",
  "studio.aiError.client.imageReadFailed": "Could not read the image.",
  "studio.aiError.client.moodRequired": "Enter a genre or mood.",
  "studio.aiError.client.networkRequestFailed": "The network request failed.",
  "studio.aiError.client.paletteSuggestionMissing": "Could not find a palette suggestion in the response.",
  "studio.aiError.client.promptAndReferenceTooLong": "The scene prompt and reference image instructions together must not exceed {count} characters.",
  "studio.aiError.client.referenceBindingFailed": "Could not resolve the reference image binding.",
  "studio.aiError.client.referenceFormatOrSizeMismatch": "The reference image format or decoded size does not match its declaration.",
  "studio.aiError.client.referenceImageReadFailed": "Could not read the reference image.",
  "studio.aiError.client.referenceInfoReadFailed": "Could not read the reference image information safely.",
  "studio.aiError.client.referenceListInvalid": "The reference image list is invalid.",
  "studio.aiError.client.referenceMimeMismatch": "The reference image file format does not match its declared MIME type.",
  "studio.aiError.client.referenceTotalSizeExceeded": "The total decoded size of the reference images must not exceed {count} bytes.",
  "studio.aiError.client.requestCancelled": "The request was cancelled.",
  "studio.aiError.client.responseBodyReadFailed": "Could not read the response body.",
  "studio.aiError.client.responseNotJson": "Could not parse the response (it is not in JSON format).",
  "studio.aiError.client.scenarioTextMissing": "Could not find scene composition text in the response.",
  "studio.aiError.client.scenePromptRequired": "Describe the scene you want to draw.",
  "studio.aiError.client.sceneTextRequired": "Enter the scene script or dialogue.",
  "studio.aiError.client.serverLoginOrApiKeyRequired": "Sign in to the server AI or add an API key in Settings.",
  "studio.aiError.client.situationRequired": "Describe the scene situation.",
  "studio.aiError.client.storyIdeaRequired": "Enter a story idea.",
  "studio.aiError.client.storyToolsLoadTimeout": "Loading the story editing tools timed out. Please try again.",
  "studio.aiError.client.suggestionTextMissing": "Could not find suggestion text in the response.",
  "studio.aiError.client.translationTextMissing": "Could not find translated text in the response.",
  "studio.aiError.client.unknownError": "Unknown error",
  "studio.aiError.client.writerRoomDraftMissing": "Could not find a Writer Room draft in the response.",
  "studio.aiError.reference.base64Invalid": "The reference image base64 data is invalid.",
  "studio.aiError.reference.base64Required": "Reference images must be base64-encoded data URLs.",
  "studio.aiError.reference.dataUrlFormatRequired": "Reference images must be PNG, JPEG, or WebP base64 data URLs.",
  "studio.aiError.reference.dataUrlNotSupported": "Not a data URL (remote URL images are not supported).",
  "studio.aiError.reference.decodedSizeInvalid": "The reference image decoded size is invalid.",
  "studio.aiError.reference.duplicateReferenceConflict": "The duplicated reference image ID ({id}) has conflicting content.",
  "studio.aiError.reference.formatOnly": "Reference images must be in PNG, JPEG, or WebP format.",
  "studio.aiError.reference.maxImagesExceeded": "You can use up to {count} reference images.",
  "studio.aiError.reference.perRoleLimitExceeded": "You can use up to {count} reference images per role.",
  "studio.aiError.reference.referenceIdOrRoleInvalid": "The reference image ID or role is invalid.",
  "studio.aiError.reference.referenceInfoInvalid": "The reference image information is invalid.",
  "studio.aiError.reference.roleReferenceRequired": "Select at least one reference image with a role assigned.",
  "studio.aiError.reference.singleImageSizeExceeded": "A single reference image must not exceed {count} bytes when decoded.",
  "studio.aiError.server.invalidOperationId": "The AI request identifier is invalid.",
  "studio.aiError.server.loginRequired": "Sign in to use the automatic free AI right away. Your current input will be kept. If you prefer not to sign in, connect a personal free API key in the unified AI settings.",
  "studio.aiError.server.poolExhausted": "The automatic free AI and your personal free keys are all exhausted. Connect another free route in the unified AI settings or try again after the quota resets.",
  "studio.aiError.server.requestCancelledNoRetry": "The AI request was cancelled. The same request was not automatically resent to another provider.",
  "studio.aiError.server.requestFailed": "The automatic free AI request failed.",
  "studio.aiError.server.responseFormatUnconfirmed": "Could not verify the automatic free AI response format.",
  "studio.aiError.wizard.photoRequired": "Upload a photo first.",
  "studio.aiError.wizard.styleRequired": "Choose a style.",
  "studio.aiError.fal.notConfigured": "No fal.ai API key is registered.",
  "studio.aiError.fal.networkUnreachable": "Could not connect to the fal server. Check your network connection.",
  "studio.aiError.fal.requestRejected": "The fal request was rejected (HTTP {status}): {message}",
  "studio.aiError.fal.requestRejectedBare": "The fal request was rejected (HTTP {status}).",
  "studio.aiError.fal.queueSubmissionIdMissing": "Could not find a request ID in the fal queue submission response.",
  "studio.aiError.fal.trainingImagesUrlEmpty": "The training image bundle URL is empty.",
  "studio.aiError.fal.triggerWordRequired": "Enter a trigger word.",
  "studio.aiError.fal.storageUploadAddressesMissing": "Could not find the upload addresses in the fal storage response.",
  "studio.aiError.fal.storageUploadNetwork": "Could not upload the file to fal storage.",
  "studio.aiError.fal.storageUploadRejected": "The fal storage upload was rejected (HTTP {status}).",
  "studio.aiError.fal.generationPromptRequired": "Describe the scene to generate.",
  "studio.aiError.fal.generationModelUrlMissing": "There is no trained model file URL.",
  "studio.aiError.fal.generationRequestNotFound": "Could not find the generation request on fal.",
  "studio.aiError.fal.generationImageMissing": "Could not find an image in the fal generation result.",
  "studio.aiError.fal.generationStatusUnparsable": "Could not parse the fal generation status response.",
  "studio.aiError.fal.generationStillProcessing": "The fal generation did not finish within the time limit. The request itself may still be processing on fal.",
  "studio.aiError.fal.jobRequestNotFound": "Could not find this training request on fal (it may have expired or been cancelled).",
  "studio.aiError.fal.jobStatusRejected": "The fal status check was rejected (HTTP {status}). Please try again shortly.",
  "studio.aiError.fal.jobResultFetchFailed": "Training finished, but the result could not be loaded. Please refresh again.",
  "studio.aiError.fal.jobEndedWithoutResult": "The fal training ended without a result (HTTP {status}).",
  "studio.aiError.fal.jobResultLoraMissing": "Could not find a LoRA file in the fal training result.",
  "studio.aiError.fal.jobUnknownStatus": "fal returned an unknown training status. Please refresh again shortly.",
  "studio.aiError.personal.runtimeNotConfigured": "Register the external Creator Runtime address and token in the unified AI settings.",
  "studio.aiError.personal.responseSizeUnknown": "Could not verify the size of the cloud inference runtime response.",
  "studio.aiError.personal.responseTooLarge": "The cloud inference runtime response exceeds the allowed size.",
  "studio.aiError.personal.invalidPath": "The cloud inference runtime path is invalid.",
  "studio.aiError.personal.requestRejected": "The cloud inference runtime request failed (HTTP {status}). It was not retried automatically.",
  "studio.aiError.personal.invalidJson": "Could not verify the cloud inference runtime JSON response.",
  "studio.aiError.personal.invalidJob": "The cloud inference job response is invalid.",
  "studio.aiError.personal.invalidArtifactInfo": "The cloud inference artifact information is invalid.",
  "studio.aiError.personal.capabilitiesUnknown": "Could not verify the cloud inference runtime capabilities.",
  "studio.aiError.personal.assetTooLarge": "Images must be 8MB or smaller, and GLB files 32MB or smaller.",
  "studio.aiError.personal.invalidUploadResponse": "The cloud inference runtime upload response is invalid.",
  "studio.aiError.personal.jobListUnknown": "Could not verify the cloud inference job list.",
  "studio.aiError.personal.invalidIdempotencyKey": "The idempotency request key is invalid.",
  "studio.aiError.personal.invalidJobId": "The job ID is invalid.",
  "studio.aiError.personal.unverifiedArtifact": "This artifact has not been verified.",
  "studio.aiError.personal.artifactChunkTruncated": "An artifact chunk was truncated.",
  "studio.aiError.personal.integrityMismatch": "The artifact integrity check failed.",
  "studio.aiError.threed.invalidResponse": "The 3D generation server response format is invalid. Your original job was not changed.",
  "studio.aiError.threed.responseTooLarge": "The 3D generation response exceeds the allowed size.",
  "studio.aiError.threed.authRequired": "Sign in and check your access permission to use 3D generation.",
  "studio.aiError.threed.rateLimited": "There are many 3D generation requests. Please try again shortly.",
  "studio.aiError.threed.serverUnavailable": "The 3D generation server did not respond. You can try again while keeping your original.",
  "studio.aiError.threed.requestRejected": "The 3D generation request failed. (HTTP {status})",
  "studio.aiError.threed.userIdentityRequired": "Studio 3D generation client requires a user identity.",
  "studio.aiError.threed.idempotencyKeyRequired": "A request ID is required to prevent duplicate generation.",
  "studio.aiError.threed.inlineInputTooLarge": "3D requests currently support input files up to 10MB in total. Larger assets require object storage upload.",
  "studio.aiError.threed.jobIdRequired": "A 3D generation job ID is required.",
  "studio.aiError.threed.artifactDownloadFailed": "Could not download the 3D result.",
  "studio.aiError.threed.artifactEmpty": "The 3D result file is empty.",
  "studio.aiError.threed.artifactSizeMismatch": "The 3D result size differs from the record. Please download it again.",
  "studio.aiError.threed.secureContextRequired": "A secure connection is required to verify the 3D result integrity.",
  "studio.aiError.threed.artifactIntegrityMismatch": "The 3D result verification failed. The damaged file was not inserted.",
  "studio.aiError.threed.artifactWrongDocument": "An error document was returned instead of a 3D model.",
  "studio.aiError.threed.inputLimitInvalid": "The input file size limit is invalid.",
  "studio.aiError.threed.inputSizeRange": "File must be between 1 byte and {maxBytes} bytes.",
  "studio.aiError.threed.inputSizeMismatch": "The actual input file size differs from the file information.",
});

/**
 * 생산 시점 로케일 해석 헬퍼 (설계 §3.2 안 3). 키가 사전에 없으면
 * koFallback을 그대로 돌려주므로, 등록 모듈이 로드되지 않은 표면에서도
 * 한국어 원문 표시가 깨지지 않는다. `{token}` 보간은 useT 리졸버와
 * 같은 규약(값 안의 중괄호는 재해석하지 않음)으로 한 번만 치환한다.
 */
export function aiErrorText(key: string, koFallback: string): string;
export function aiErrorText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function aiErrorText(
  key: string,
  paramsOrFallback: Readonly<Record<string, string | number>> | string,
  koFallback?: string,
): string {
  const params = typeof paramsOrFallback === "string" ? undefined : paramsOrFallback;
  const fallback = typeof paramsOrFallback === "string" ? paramsOrFallback : koFallback ?? "";
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  if (!params) return text;
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(params, token) ? String(params[token]) : placeholder,
  );
}

/**
 * 영속된 오류 코드의 표시 시점 해석 (설계 §3.2-④, T2). 레코드에 저장된
 * 값이 이 사전의 키(`studio.aiError.*`)면 현재 로케일로 해석하고,
 * `{token}` 보간은 저장된 파라미터로 채운다. 키 형식이 아닌 값은
 * 구 레코드의 해석済 문자열로 보고 그대로 돌려준다(하위호환).
 * 미등록 키는 해석 결과가 키 자체로 돌아오므로 손상 데이터가 빈
 * 문구로 표시되지는 않는다.
 */
export function resolveAiErrorText(
  stored: string,
  params?: Readonly<Record<string, string | number>> | null,
): string {
  if (!stored.startsWith("studio.aiError.")) return stored;
  const text = resolveTranslationForDisplay(getLang(), stored, FALLBACK_CHAIN, stored);
  if (!params) return text;
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(params, token) ? String(params[token]) : placeholder,
  );
}
