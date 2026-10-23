/**
 * 생산자 구조화 에러 해석 모듈 — publish 구간: studio-publish-package 게시 이슈
 * 47코드(48템플릿 — THUMBNAIL_CONTENT_REVIEW_REQUIRED는 formal/casual 2변형) +
 * throw 3코드 (A4 D4, R15, 설계 r10-d4-trace-3.md §2.18).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와 동일하다:
 * 생산자는 {code, params}만 방출하고, 표시는 이 모듈의 리졸버로만 해석한다.
 * ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규 번역이다.
 * {label}은 게시처·썸네일 프리셋 라벨(생산자 데이터) 또는 호출부 지정 문자열
 * (jsonReadFailed·newerVersion — 부분 잔존 병기)이라 원문 패스스루 params로 받는다.
 * ko 템플릿의 은(는) 병기는 TM 구간과 같은 규칙으로 해석 시점에 하나로 선택한다
 * (라벨 마지막 한글 음절 받침 유무 — 받침 있음 → 은, 없음 → 는).
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type { StudioPublishPackageErrorCode } from "../studio-publish-package-error";
import type {
  StudioPublishPackageIssue,
  StudioPublishPackageIssueCode,
} from "../studio-publish-package";

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

/** ko 조사 선택 (TM 구간 규칙과 동일): 라벨 마지막 한글 음절의 받침 유무로 은/는을 고른다. */
function hasKoreanFinalConsonant(label: string): boolean {
  const last = [...label.trim()].at(-1);
  if (!last) return false;
  const code = last.codePointAt(0) ?? 0;
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

function applyKoreanParticles(text: string, label: string): string {
  return text.replaceAll("은(는)", hasKoreanFinalConsonant(label) ? "은" : "는");
}

registerI18nLocaleEntries("ko", {
  "studio.producerError.publish.issue.SERIES_TITLE_REQUIRED": "시리즈 제목을 입력해 주세요.",
  "studio.producerError.publish.issue.EPISODE_TITLE_REQUIRED": "회차 제목을 입력해 주세요.",
  "studio.producerError.publish.issue.EPISODE_NUMBER_INVALID": "회차 번호는 1 이상 999,999 이하의 정수여야 합니다.",
  "studio.producerError.publish.issue.CANVAS_METADATA_MISSING": "원본 캔버스 메타데이터가 없어 리샘플링 필요 여부를 확인할 수 없습니다.",
  "studio.producerError.publish.issue.CANVAS_LIMIT_EXCEEDED": "캔버스는 최대 {max}개까지 검증할 수 있습니다.",
  "studio.producerError.publish.issue.CANVAS_ID_REQUIRED": "캔버스 식별자가 비어 있습니다.",
  "studio.producerError.publish.issue.CANVAS_ID_DUPLICATE": "캔버스 식별자가 중복되었습니다: {id}",
  "studio.producerError.publish.issue.CANVAS_DIMENSIONS_MISSING": "캔버스 크기 정보가 없어 출력 배율을 확인할 수 없습니다.",
  "studio.producerError.publish.issue.CANVAS_DIMENSIONS_INVALID": "캔버스 폭과 높이는 유효한 양의 정수여야 합니다.",
  "studio.producerError.publish.issue.CANVAS_RESAMPLE_REQUIRED": "원본 폭 {width}px를 최종 폭 {targetWidth}px로 리샘플해야 합니다.",
  "studio.producerError.publish.issue.CANVAS_VERTICAL_RECOMMENDED": "세로 스크롤 게시처에서는 세로형 캔버스와 모바일 미리보기를 권장합니다.",
  "studio.producerError.publish.issue.CANVAS_PIXEL_AREA_LARGE": "원본 캔버스 픽셀 수가 커 브라우저 렌더링 메모리를 많이 사용할 수 있습니다. 분할 렌더를 사용하세요.",
  "studio.producerError.publish.issue.EPISODE_IMAGES_REQUIRED": "게시할 회차 이미지가 한 장 이상 필요합니다.",
  "studio.producerError.publish.issue.EPISODE_IMAGE_LIMIT_EXCEEDED": "회차 이미지가 검증 가능한 최대 {max}장을 넘었습니다.",
  "studio.producerError.publish.issue.IMAGE_ID_REQUIRED": "이미지 식별자가 비어 있습니다.",
  "studio.producerError.publish.issue.IMAGE_ID_DUPLICATE": "이미지 식별자가 중복되었습니다: {id}",
  "studio.producerError.publish.issue.IMAGE_SOURCE_UNKNOWN": "이미지가 현재 원본 캔버스 목록과 연결되지 않습니다.",
  "studio.producerError.publish.issue.IMAGE_MIME_MISSING": "출력 형식 정보가 없어 설정의 기본 형식으로 파일명을 계획했습니다.",
  "studio.producerError.publish.issue.IMAGE_MIME_UNSUPPORTED": "{label} 회차 이미지는 {formats} 형식만 허용합니다.",
  "studio.producerError.publish.issue.IMAGE_DIMENSIONS_MISSING": "최종 이미지 크기 정보가 없어 게시처 규격을 확인할 수 없습니다.",
  "studio.producerError.publish.issue.IMAGE_DIMENSIONS_INVALID": "이미지 폭과 높이가 유효하지 않습니다.",
  "studio.producerError.publish.issue.IMAGE_WIDTH_MISMATCH": "최종 이미지 폭은 {width}px여야 합니다.",
  "studio.producerError.publish.issue.IMAGE_HEIGHT_EXCEEDED": "이 형식의 이미지 높이는 {maxHeight}px 이하여야 합니다.",
  "studio.producerError.publish.issue.IMAGE_BYTE_SIZE_MISSING": "파일 용량 정보가 없어 게시처의 개별 파일 제한을 확인할 수 없습니다.",
  "studio.producerError.publish.issue.IMAGE_BYTE_SIZE_INVALID": "파일 용량 정보가 유효하지 않습니다.",
  "studio.producerError.publish.issue.IMAGE_FILE_TOO_LARGE": "개별 파일은 {maxMb}MB 미만이어야 합니다.",
  "studio.producerError.publish.issue.EPISODE_TOTAL_SIZE_UNVERIFIED": "일부 파일 용량이 없어 회차 전체 용량 제한을 확인할 수 없습니다.",
  "studio.producerError.publish.issue.EPISODE_TOTAL_SIZE_EXCEEDED": "회차 전체 파일은 {maxMb}MB 미만이어야 합니다.",
  "studio.producerError.publish.issue.CHECKSUM_INVALID": "SHA-256 값이 올바르지 않아 공개 manifest에서 제외했습니다.",
  "studio.producerError.publish.issue.THUMBNAIL_LIMIT_EXCEEDED": "썸네일은 최대 {max}개까지 검증할 수 있습니다.",
  "studio.producerError.publish.issue.THUMBNAIL_REQUIRED": "{label} 이미지가 필요합니다.",
  "studio.producerError.publish.issue.THUMBNAIL_SLOT_DUPLICATE": "같은 썸네일 종류가 중복되었습니다: {slot}",
  "studio.producerError.publish.issue.THUMBNAIL_SLOT_UNSUPPORTED": "{label} 패키지에서 사용하지 않는 썸네일 종류입니다: {slot}",
  "studio.producerError.publish.issue.THUMBNAIL_MIME_MISSING": "썸네일 형식 정보가 없어 기본 형식으로 파일명을 계획했습니다.",
  "studio.producerError.publish.issue.THUMBNAIL_MIME_UNSUPPORTED": "{label}은(는) {formats} 형식만 허용합니다.",
  "studio.producerError.publish.issue.THUMBNAIL_DIMENSIONS_MISSING": "썸네일 크기 정보가 없어 정확한 크기를 확인할 수 없습니다.",
  "studio.producerError.publish.issue.THUMBNAIL_DIMENSIONS_INVALID": "썸네일 폭과 높이가 유효하지 않습니다.",
  "studio.producerError.publish.issue.THUMBNAIL_DIMENSIONS_MISMATCH": "{label}은(는) {width}×{height}px여야 합니다.",
  "studio.producerError.publish.issue.THUMBNAIL_BYTE_SIZE_MISSING": "썸네일 파일 용량이 없어 제한을 확인할 수 없습니다.",
  "studio.producerError.publish.issue.THUMBNAIL_BYTE_SIZE_INVALID": "썸네일 파일 용량이 유효하지 않습니다.",
  "studio.producerError.publish.issue.THUMBNAIL_FILE_TOO_LARGE": "{label}은(는) {maxKb}KB 미만이어야 합니다.",
  "studio.producerError.publish.issue.THUMBNAIL_CONTENT_REVIEW_REQUIRED_FORMAL": "정식 게시 패키지 전 썸네일의 전 연령 노출 적합성, 텍스트 잘림, 안전 영역을 직접 확인해야 합니다.",
  "studio.producerError.publish.issue.THUMBNAIL_CONTENT_REVIEW_REQUIRED_CASUAL": "썸네일의 전 연령 노출 적합성, 텍스트 잘림, 안전 영역을 사람이 직접 확인하세요.",
  "studio.producerError.publish.issue.AI_DISCLOSURE_REQUIRED": "AI 보조 또는 생성 사용 범위를 설명하는 공개 문구가 필요합니다.",
  "studio.producerError.publish.issue.TAPAS_AI_GENERATED_CONTENT_PROHIBITED": "현재 벤치마크한 Tapas 정책에서는 AI 생성 콘텐츠 게시가 금지됩니다. 최신 원문 정책을 직접 확인하세요.",
  "studio.producerError.publish.issue.POLICY_REVIEW_REQUIRED": "{label} 정식 게시 패키지 전 최신 업로드·콘텐츠 정책을 직접 확인해야 합니다.",
  "studio.producerError.publish.issue.CREDITS_EMPTY": "출처·라이선스 파일을 포함하도록 설정했지만 입력된 내용이 없습니다.",
  "studio.producerError.publish.issue.ARTIFACT_FILENAME_COLLISION": "패키지 안에서 파일명이 충돌합니다: {fileName}",
  "studio.producerError.publish.jsonReadFailed": "{label} JSON을 읽을 수 없습니다.",
  "studio.producerError.publish.newerVersion": "이 {label}은(는) 더 최신 버전에서 만들어졌습니다.",
  "studio.producerError.publish.unsupportedThumbnail": "선택한 목적지에서 지원하지 않는 썸네일 종류예요.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.publish.issue.SERIES_TITLE_REQUIRED": "Please enter a series title.",
  "studio.producerError.publish.issue.EPISODE_TITLE_REQUIRED": "Please enter an episode title.",
  "studio.producerError.publish.issue.EPISODE_NUMBER_INVALID": "The episode number must be an integer between 1 and 999,999.",
  "studio.producerError.publish.issue.CANVAS_METADATA_MISSING": "There is no source canvas metadata, so whether resampling is needed cannot be checked.",
  "studio.producerError.publish.issue.CANVAS_LIMIT_EXCEEDED": "At most {max} canvases can be validated.",
  "studio.producerError.publish.issue.CANVAS_ID_REQUIRED": "The canvas identifier is empty.",
  "studio.producerError.publish.issue.CANVAS_ID_DUPLICATE": "The canvas identifier is duplicated: {id}",
  "studio.producerError.publish.issue.CANVAS_DIMENSIONS_MISSING": "There is no canvas size information, so the output scale cannot be checked.",
  "studio.producerError.publish.issue.CANVAS_DIMENSIONS_INVALID": "The canvas width and height must be valid positive integers.",
  "studio.producerError.publish.issue.CANVAS_RESAMPLE_REQUIRED": "The source width of {width}px must be resampled to the final width of {targetWidth}px.",
  "studio.producerError.publish.issue.CANVAS_VERTICAL_RECOMMENDED": "Vertical canvases and a mobile preview are recommended for vertical-scroll destinations.",
  "studio.producerError.publish.issue.CANVAS_PIXEL_AREA_LARGE": "The source canvas has a large pixel count and may use a lot of browser rendering memory. Use split rendering.",
  "studio.producerError.publish.issue.EPISODE_IMAGES_REQUIRED": "At least one episode image is required to publish.",
  "studio.producerError.publish.issue.EPISODE_IMAGE_LIMIT_EXCEEDED": "The episode images exceed the maximum of {max} that can be validated.",
  "studio.producerError.publish.issue.IMAGE_ID_REQUIRED": "The image identifier is empty.",
  "studio.producerError.publish.issue.IMAGE_ID_DUPLICATE": "The image identifier is duplicated: {id}",
  "studio.producerError.publish.issue.IMAGE_SOURCE_UNKNOWN": "The image is not linked to the current source canvas list.",
  "studio.producerError.publish.issue.IMAGE_MIME_MISSING": "There is no output format information, so the file name was planned with the default format from the settings.",
  "studio.producerError.publish.issue.IMAGE_MIME_UNSUPPORTED": "{label} episode images allow only these formats: {formats}.",
  "studio.producerError.publish.issue.IMAGE_DIMENSIONS_MISSING": "There is no final image size information, so the destination requirements cannot be checked.",
  "studio.producerError.publish.issue.IMAGE_DIMENSIONS_INVALID": "The image width and height are invalid.",
  "studio.producerError.publish.issue.IMAGE_WIDTH_MISMATCH": "The final image width must be {width}px.",
  "studio.producerError.publish.issue.IMAGE_HEIGHT_EXCEEDED": "Images in this format must be {maxHeight}px tall or less.",
  "studio.producerError.publish.issue.IMAGE_BYTE_SIZE_MISSING": "There is no file size information, so the destination's per-file limit cannot be checked.",
  "studio.producerError.publish.issue.IMAGE_BYTE_SIZE_INVALID": "The file size information is invalid.",
  "studio.producerError.publish.issue.IMAGE_FILE_TOO_LARGE": "Each file must be smaller than {maxMb}MB.",
  "studio.producerError.publish.issue.EPISODE_TOTAL_SIZE_UNVERIFIED": "Some file sizes are missing, so the total episode size limit cannot be checked.",
  "studio.producerError.publish.issue.EPISODE_TOTAL_SIZE_EXCEEDED": "The total episode files must be smaller than {maxMb}MB.",
  "studio.producerError.publish.issue.CHECKSUM_INVALID": "The SHA-256 value is invalid, so it was excluded from the public manifest.",
  "studio.producerError.publish.issue.THUMBNAIL_LIMIT_EXCEEDED": "At most {max} thumbnails can be validated.",
  "studio.producerError.publish.issue.THUMBNAIL_REQUIRED": "A {label} image is required.",
  "studio.producerError.publish.issue.THUMBNAIL_SLOT_DUPLICATE": "The same thumbnail kind is duplicated: {slot}",
  "studio.producerError.publish.issue.THUMBNAIL_SLOT_UNSUPPORTED": "This thumbnail kind is not used in the {label} package: {slot}",
  "studio.producerError.publish.issue.THUMBNAIL_MIME_MISSING": "There is no thumbnail format information, so the file name was planned with the default format.",
  "studio.producerError.publish.issue.THUMBNAIL_MIME_UNSUPPORTED": "{label} allows only these formats: {formats}.",
  "studio.producerError.publish.issue.THUMBNAIL_DIMENSIONS_MISSING": "There is no thumbnail size information, so the exact size cannot be checked.",
  "studio.producerError.publish.issue.THUMBNAIL_DIMENSIONS_INVALID": "The thumbnail width and height are invalid.",
  "studio.producerError.publish.issue.THUMBNAIL_DIMENSIONS_MISMATCH": "{label} must be {width}×{height}px.",
  "studio.producerError.publish.issue.THUMBNAIL_BYTE_SIZE_MISSING": "There is no thumbnail file size, so the limit cannot be checked.",
  "studio.producerError.publish.issue.THUMBNAIL_BYTE_SIZE_INVALID": "The thumbnail file size is invalid.",
  "studio.producerError.publish.issue.THUMBNAIL_FILE_TOO_LARGE": "{label} must be smaller than {maxKb}KB.",
  "studio.producerError.publish.issue.THUMBNAIL_CONTENT_REVIEW_REQUIRED_FORMAL": "Before the official publish package, check the thumbnail yourself for all-ages suitability, text cropping, and safe areas.",
  "studio.producerError.publish.issue.THUMBNAIL_CONTENT_REVIEW_REQUIRED_CASUAL": "Check the thumbnail yourself for all-ages suitability, text cropping, and safe areas.",
  "studio.producerError.publish.issue.AI_DISCLOSURE_REQUIRED": "A public statement explaining the scope of AI assistance or generation is required.",
  "studio.producerError.publish.issue.TAPAS_AI_GENERATED_CONTENT_PROHIBITED": "Under the currently benchmarked Tapas policy, publishing AI-generated content is prohibited. Check the latest original policy yourself.",
  "studio.producerError.publish.issue.POLICY_REVIEW_REQUIRED": "Before the official {label} publish package, check the latest upload and content policies yourself.",
  "studio.producerError.publish.issue.CREDITS_EMPTY": "Credits are set to be included, but no content was entered.",
  "studio.producerError.publish.issue.ARTIFACT_FILENAME_COLLISION": "A file name collides inside the package: {fileName}",
  "studio.producerError.publish.jsonReadFailed": "Could not read the {label} JSON.",
  "studio.producerError.publish.newerVersion": "This {label} was created in a newer version.",
  "studio.producerError.publish.unsupportedThumbnail": "This thumbnail kind is not supported for the selected destination.",
});

const PUBLISH_ISSUE_KEYS: Readonly<Record<StudioPublishPackageIssueCode, string>> = {
  SERIES_TITLE_REQUIRED: "studio.producerError.publish.issue.SERIES_TITLE_REQUIRED",
  EPISODE_TITLE_REQUIRED: "studio.producerError.publish.issue.EPISODE_TITLE_REQUIRED",
  EPISODE_NUMBER_INVALID: "studio.producerError.publish.issue.EPISODE_NUMBER_INVALID",
  CANVAS_METADATA_MISSING: "studio.producerError.publish.issue.CANVAS_METADATA_MISSING",
  CANVAS_LIMIT_EXCEEDED: "studio.producerError.publish.issue.CANVAS_LIMIT_EXCEEDED",
  CANVAS_ID_REQUIRED: "studio.producerError.publish.issue.CANVAS_ID_REQUIRED",
  CANVAS_ID_DUPLICATE: "studio.producerError.publish.issue.CANVAS_ID_DUPLICATE",
  CANVAS_DIMENSIONS_MISSING: "studio.producerError.publish.issue.CANVAS_DIMENSIONS_MISSING",
  CANVAS_DIMENSIONS_INVALID: "studio.producerError.publish.issue.CANVAS_DIMENSIONS_INVALID",
  CANVAS_RESAMPLE_REQUIRED: "studio.producerError.publish.issue.CANVAS_RESAMPLE_REQUIRED",
  CANVAS_VERTICAL_RECOMMENDED: "studio.producerError.publish.issue.CANVAS_VERTICAL_RECOMMENDED",
  CANVAS_PIXEL_AREA_LARGE: "studio.producerError.publish.issue.CANVAS_PIXEL_AREA_LARGE",
  EPISODE_IMAGES_REQUIRED: "studio.producerError.publish.issue.EPISODE_IMAGES_REQUIRED",
  EPISODE_IMAGE_LIMIT_EXCEEDED: "studio.producerError.publish.issue.EPISODE_IMAGE_LIMIT_EXCEEDED",
  IMAGE_ID_REQUIRED: "studio.producerError.publish.issue.IMAGE_ID_REQUIRED",
  IMAGE_ID_DUPLICATE: "studio.producerError.publish.issue.IMAGE_ID_DUPLICATE",
  IMAGE_SOURCE_UNKNOWN: "studio.producerError.publish.issue.IMAGE_SOURCE_UNKNOWN",
  IMAGE_MIME_MISSING: "studio.producerError.publish.issue.IMAGE_MIME_MISSING",
  IMAGE_MIME_UNSUPPORTED: "studio.producerError.publish.issue.IMAGE_MIME_UNSUPPORTED",
  IMAGE_DIMENSIONS_MISSING: "studio.producerError.publish.issue.IMAGE_DIMENSIONS_MISSING",
  IMAGE_DIMENSIONS_INVALID: "studio.producerError.publish.issue.IMAGE_DIMENSIONS_INVALID",
  IMAGE_WIDTH_MISMATCH: "studio.producerError.publish.issue.IMAGE_WIDTH_MISMATCH",
  IMAGE_HEIGHT_EXCEEDED: "studio.producerError.publish.issue.IMAGE_HEIGHT_EXCEEDED",
  IMAGE_BYTE_SIZE_MISSING: "studio.producerError.publish.issue.IMAGE_BYTE_SIZE_MISSING",
  IMAGE_BYTE_SIZE_INVALID: "studio.producerError.publish.issue.IMAGE_BYTE_SIZE_INVALID",
  IMAGE_FILE_TOO_LARGE: "studio.producerError.publish.issue.IMAGE_FILE_TOO_LARGE",
  EPISODE_TOTAL_SIZE_UNVERIFIED: "studio.producerError.publish.issue.EPISODE_TOTAL_SIZE_UNVERIFIED",
  EPISODE_TOTAL_SIZE_EXCEEDED: "studio.producerError.publish.issue.EPISODE_TOTAL_SIZE_EXCEEDED",
  CHECKSUM_INVALID: "studio.producerError.publish.issue.CHECKSUM_INVALID",
  THUMBNAIL_LIMIT_EXCEEDED: "studio.producerError.publish.issue.THUMBNAIL_LIMIT_EXCEEDED",
  THUMBNAIL_REQUIRED: "studio.producerError.publish.issue.THUMBNAIL_REQUIRED",
  THUMBNAIL_SLOT_DUPLICATE: "studio.producerError.publish.issue.THUMBNAIL_SLOT_DUPLICATE",
  THUMBNAIL_SLOT_UNSUPPORTED: "studio.producerError.publish.issue.THUMBNAIL_SLOT_UNSUPPORTED",
  THUMBNAIL_MIME_MISSING: "studio.producerError.publish.issue.THUMBNAIL_MIME_MISSING",
  THUMBNAIL_MIME_UNSUPPORTED: "studio.producerError.publish.issue.THUMBNAIL_MIME_UNSUPPORTED",
  THUMBNAIL_DIMENSIONS_MISSING: "studio.producerError.publish.issue.THUMBNAIL_DIMENSIONS_MISSING",
  THUMBNAIL_DIMENSIONS_INVALID: "studio.producerError.publish.issue.THUMBNAIL_DIMENSIONS_INVALID",
  THUMBNAIL_DIMENSIONS_MISMATCH: "studio.producerError.publish.issue.THUMBNAIL_DIMENSIONS_MISMATCH",
  THUMBNAIL_BYTE_SIZE_MISSING: "studio.producerError.publish.issue.THUMBNAIL_BYTE_SIZE_MISSING",
  THUMBNAIL_BYTE_SIZE_INVALID: "studio.producerError.publish.issue.THUMBNAIL_BYTE_SIZE_INVALID",
  THUMBNAIL_FILE_TOO_LARGE: "studio.producerError.publish.issue.THUMBNAIL_FILE_TOO_LARGE",
  THUMBNAIL_CONTENT_REVIEW_REQUIRED: "studio.producerError.publish.issue.THUMBNAIL_CONTENT_REVIEW_REQUIRED_CASUAL",
  AI_DISCLOSURE_REQUIRED: "studio.producerError.publish.issue.AI_DISCLOSURE_REQUIRED",
  TAPAS_AI_GENERATED_CONTENT_PROHIBITED: "studio.producerError.publish.issue.TAPAS_AI_GENERATED_CONTENT_PROHIBITED",
  POLICY_REVIEW_REQUIRED: "studio.producerError.publish.issue.POLICY_REVIEW_REQUIRED",
  CREDITS_EMPTY: "studio.producerError.publish.issue.CREDITS_EMPTY",
  ARTIFACT_FILENAME_COLLISION: "studio.producerError.publish.issue.ARTIFACT_FILENAME_COLLISION",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const PUBLISH_ISSUE_KO: Readonly<Record<string, string>> = {
  "studio.producerError.publish.issue.SERIES_TITLE_REQUIRED": "시리즈 제목을 입력해 주세요.",
  "studio.producerError.publish.issue.EPISODE_TITLE_REQUIRED": "회차 제목을 입력해 주세요.",
  "studio.producerError.publish.issue.EPISODE_NUMBER_INVALID": "회차 번호는 1 이상 999,999 이하의 정수여야 합니다.",
  "studio.producerError.publish.issue.CANVAS_METADATA_MISSING": "원본 캔버스 메타데이터가 없어 리샘플링 필요 여부를 확인할 수 없습니다.",
  "studio.producerError.publish.issue.CANVAS_LIMIT_EXCEEDED": "캔버스는 최대 {max}개까지 검증할 수 있습니다.",
  "studio.producerError.publish.issue.CANVAS_ID_REQUIRED": "캔버스 식별자가 비어 있습니다.",
  "studio.producerError.publish.issue.CANVAS_ID_DUPLICATE": "캔버스 식별자가 중복되었습니다: {id}",
  "studio.producerError.publish.issue.CANVAS_DIMENSIONS_MISSING": "캔버스 크기 정보가 없어 출력 배율을 확인할 수 없습니다.",
  "studio.producerError.publish.issue.CANVAS_DIMENSIONS_INVALID": "캔버스 폭과 높이는 유효한 양의 정수여야 합니다.",
  "studio.producerError.publish.issue.CANVAS_RESAMPLE_REQUIRED": "원본 폭 {width}px를 최종 폭 {targetWidth}px로 리샘플해야 합니다.",
  "studio.producerError.publish.issue.CANVAS_VERTICAL_RECOMMENDED": "세로 스크롤 게시처에서는 세로형 캔버스와 모바일 미리보기를 권장합니다.",
  "studio.producerError.publish.issue.CANVAS_PIXEL_AREA_LARGE": "원본 캔버스 픽셀 수가 커 브라우저 렌더링 메모리를 많이 사용할 수 있습니다. 분할 렌더를 사용하세요.",
  "studio.producerError.publish.issue.EPISODE_IMAGES_REQUIRED": "게시할 회차 이미지가 한 장 이상 필요합니다.",
  "studio.producerError.publish.issue.EPISODE_IMAGE_LIMIT_EXCEEDED": "회차 이미지가 검증 가능한 최대 {max}장을 넘었습니다.",
  "studio.producerError.publish.issue.IMAGE_ID_REQUIRED": "이미지 식별자가 비어 있습니다.",
  "studio.producerError.publish.issue.IMAGE_ID_DUPLICATE": "이미지 식별자가 중복되었습니다: {id}",
  "studio.producerError.publish.issue.IMAGE_SOURCE_UNKNOWN": "이미지가 현재 원본 캔버스 목록과 연결되지 않습니다.",
  "studio.producerError.publish.issue.IMAGE_MIME_MISSING": "출력 형식 정보가 없어 설정의 기본 형식으로 파일명을 계획했습니다.",
  "studio.producerError.publish.issue.IMAGE_MIME_UNSUPPORTED": "{label} 회차 이미지는 {formats} 형식만 허용합니다.",
  "studio.producerError.publish.issue.IMAGE_DIMENSIONS_MISSING": "최종 이미지 크기 정보가 없어 게시처 규격을 확인할 수 없습니다.",
  "studio.producerError.publish.issue.IMAGE_DIMENSIONS_INVALID": "이미지 폭과 높이가 유효하지 않습니다.",
  "studio.producerError.publish.issue.IMAGE_WIDTH_MISMATCH": "최종 이미지 폭은 {width}px여야 합니다.",
  "studio.producerError.publish.issue.IMAGE_HEIGHT_EXCEEDED": "이 형식의 이미지 높이는 {maxHeight}px 이하여야 합니다.",
  "studio.producerError.publish.issue.IMAGE_BYTE_SIZE_MISSING": "파일 용량 정보가 없어 게시처의 개별 파일 제한을 확인할 수 없습니다.",
  "studio.producerError.publish.issue.IMAGE_BYTE_SIZE_INVALID": "파일 용량 정보가 유효하지 않습니다.",
  "studio.producerError.publish.issue.IMAGE_FILE_TOO_LARGE": "개별 파일은 {maxMb}MB 미만이어야 합니다.",
  "studio.producerError.publish.issue.EPISODE_TOTAL_SIZE_UNVERIFIED": "일부 파일 용량이 없어 회차 전체 용량 제한을 확인할 수 없습니다.",
  "studio.producerError.publish.issue.EPISODE_TOTAL_SIZE_EXCEEDED": "회차 전체 파일은 {maxMb}MB 미만이어야 합니다.",
  "studio.producerError.publish.issue.CHECKSUM_INVALID": "SHA-256 값이 올바르지 않아 공개 manifest에서 제외했습니다.",
  "studio.producerError.publish.issue.THUMBNAIL_LIMIT_EXCEEDED": "썸네일은 최대 {max}개까지 검증할 수 있습니다.",
  "studio.producerError.publish.issue.THUMBNAIL_REQUIRED": "{label} 이미지가 필요합니다.",
  "studio.producerError.publish.issue.THUMBNAIL_SLOT_DUPLICATE": "같은 썸네일 종류가 중복되었습니다: {slot}",
  "studio.producerError.publish.issue.THUMBNAIL_SLOT_UNSUPPORTED": "{label} 패키지에서 사용하지 않는 썸네일 종류입니다: {slot}",
  "studio.producerError.publish.issue.THUMBNAIL_MIME_MISSING": "썸네일 형식 정보가 없어 기본 형식으로 파일명을 계획했습니다.",
  "studio.producerError.publish.issue.THUMBNAIL_MIME_UNSUPPORTED": "{label}은(는) {formats} 형식만 허용합니다.",
  "studio.producerError.publish.issue.THUMBNAIL_DIMENSIONS_MISSING": "썸네일 크기 정보가 없어 정확한 크기를 확인할 수 없습니다.",
  "studio.producerError.publish.issue.THUMBNAIL_DIMENSIONS_INVALID": "썸네일 폭과 높이가 유효하지 않습니다.",
  "studio.producerError.publish.issue.THUMBNAIL_DIMENSIONS_MISMATCH": "{label}은(는) {width}×{height}px여야 합니다.",
  "studio.producerError.publish.issue.THUMBNAIL_BYTE_SIZE_MISSING": "썸네일 파일 용량이 없어 제한을 확인할 수 없습니다.",
  "studio.producerError.publish.issue.THUMBNAIL_BYTE_SIZE_INVALID": "썸네일 파일 용량이 유효하지 않습니다.",
  "studio.producerError.publish.issue.THUMBNAIL_FILE_TOO_LARGE": "{label}은(는) {maxKb}KB 미만이어야 합니다.",
  "studio.producerError.publish.issue.THUMBNAIL_CONTENT_REVIEW_REQUIRED_FORMAL": "정식 게시 패키지 전 썸네일의 전 연령 노출 적합성, 텍스트 잘림, 안전 영역을 직접 확인해야 합니다.",
  "studio.producerError.publish.issue.THUMBNAIL_CONTENT_REVIEW_REQUIRED_CASUAL": "썸네일의 전 연령 노출 적합성, 텍스트 잘림, 안전 영역을 사람이 직접 확인하세요.",
  "studio.producerError.publish.issue.AI_DISCLOSURE_REQUIRED": "AI 보조 또는 생성 사용 범위를 설명하는 공개 문구가 필요합니다.",
  "studio.producerError.publish.issue.TAPAS_AI_GENERATED_CONTENT_PROHIBITED": "현재 벤치마크한 Tapas 정책에서는 AI 생성 콘텐츠 게시가 금지됩니다. 최신 원문 정책을 직접 확인하세요.",
  "studio.producerError.publish.issue.POLICY_REVIEW_REQUIRED": "{label} 정식 게시 패키지 전 최신 업로드·콘텐츠 정책을 직접 확인해야 합니다.",
  "studio.producerError.publish.issue.CREDITS_EMPTY": "출처·라이선스 파일을 포함하도록 설정했지만 입력된 내용이 없습니다.",
  "studio.producerError.publish.issue.ARTIFACT_FILENAME_COLLISION": "패키지 안에서 파일명이 충돌합니다: {fileName}",
};

const PUBLISH_CONTENT_REVIEW_FORMAL_KEY =
  "studio.producerError.publish.issue.THUMBNAIL_CONTENT_REVIEW_REQUIRED_FORMAL";

/** 표시 지점 전용 해석 (publish 이슈): Panel IssueLedger 렌더와 내보내기 선행 오류가 부른다. */
export function resolveStudioPublishPackageIssue(
  issue: Pick<StudioPublishPackageIssue, "code" | "params">,
): string {
  const key = issue.code === "THUMBNAIL_CONTENT_REVIEW_REQUIRED" && issue.params?.variant === "formal"
    ? PUBLISH_CONTENT_REVIEW_FORMAL_KEY
    : PUBLISH_ISSUE_KEYS[issue.code];
  const resolved = resolveProducerError(key, PUBLISH_ISSUE_KO[key] ?? key, issue.params);
  return issue.params?.label ? applyKoreanParticles(resolved, issue.params.label) : resolved;
}

const PUBLISH_ERROR_KEYS: Readonly<Record<StudioPublishPackageErrorCode, string>> = {
  jsonReadFailed: "studio.producerError.publish.jsonReadFailed",
  newerVersion: "studio.producerError.publish.newerVersion",
  unsupportedThumbnail: "studio.producerError.publish.unsupportedThumbnail",
};

const PUBLISH_ERROR_KO: Readonly<Record<StudioPublishPackageErrorCode, string>> = {
  jsonReadFailed: "{label} JSON을 읽을 수 없습니다.",
  newerVersion: "이 {label}은(는) 더 최신 버전에서 만들어졌습니다.",
  unsupportedThumbnail: "선택한 목적지에서 지원하지 않는 썸네일 종류예요.",
};

/** 표시 지점 전용 해석 (publish throw): 구조화 오류를 직접 받는 표시 지점이 부른다. */
export function resolveStudioPublishPackageError(
  error: { readonly code: StudioPublishPackageErrorCode; readonly params?: Readonly<Record<string, string>> },
): string {
  const resolved = resolveProducerError(PUBLISH_ERROR_KEYS[error.code], PUBLISH_ERROR_KO[error.code], error.params);
  return error.params?.label ? applyKoreanParticles(resolved, error.params.label) : resolved;
}

/** 표시 지점 전용 해석 (publish throw, 원인 객체 덕 타이핑). 해당하지 않으면 null. */
export function resolveStudioPublishPackageErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, params } = cause as { name?: unknown; code?: unknown; params?: unknown };
  if (name !== "StudioPublishPackageError" || typeof code !== "string") return null;
  if (!Object.hasOwn(PUBLISH_ERROR_KEYS, code)) return null;
  return resolveStudioPublishPackageError({
    code: code as StudioPublishPackageErrorCode,
    params: params as Readonly<Record<string, string>> | undefined,
  });
}
