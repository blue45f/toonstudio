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
 * `.server.*` studio-server-ai-client. 후속 트랜치(T2~T5)는
 * `.fal.*`·`.personal.*`·`.threed.*`·`.issue.*` 구간을 이어 붙인다.
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
