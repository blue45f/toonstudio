/**
 * Studio → 홍보 영상 편집기로 넘기는 두 파일(컷 묶음·번역 초안)의 이름표와 상한.
 *
 * 의존성이 없는 파일이다. Studio 내보내기 쪽이 홍보 편집기의 모델 코드를 끌어오지 않고도 같은 값을 쓰고,
 * 홍보 편집기의 읽기 규칙(promo-document-cuts, promo-translation-drafts)이 같은 값을 다시 내보낸다.
 * 값이 한 곳에만 있으므로 내보내는 쪽과 읽는 쪽이 어긋나지 않는다.
 */

/** 컷 묶음 — 문서의 컷(프레임) 이미지와 컷 안 말풍선 텍스트. */
export const PROMO_DOCUMENT_CUTS_KIND = "toonstudio-document-cuts";
export const PROMO_DOCUMENT_CUTS_VERSION = 1;
/** 묶음 하나가 담을 수 있는 컷 수 — 한 번에 미리보기로 확인할 수 있는 분량이다. */
export const PROMO_DOCUMENT_CUTS_MAX = 60;
/** 불러올 수 있는 묶음 JSON의 최대 크기(바이트). 프로젝트 JSON 상한(80MB)과 같은 규모다. */
export const PROMO_DOCUMENT_CUTS_MAX_BYTES = 90_000_000;
/** 컷 하나당 대사(말풍선·텍스트) 수 상한. */
export const PROMO_DOCUMENT_DIALOGUES_MAX = 40;
/** 대사 하나의 글자 수 상한. */
export const PROMO_DOCUMENT_DIALOGUE_TEXT_MAX = 2_000;
/** 컷 이미지 data URL 하나의 길이 상한 — 홍보 프로젝트가 컷 이미지에 허용하는 크기(promoDataUrl)와 같다. */
export const PROMO_CUT_IMAGE_MAX_CHARS = 6_000_000;

/** 번역 초안 묶음 — 로케일별 번역문과 문서의 현재 원문 행. */
export const PROMO_TRANSLATION_DRAFTS_KIND = "toonstudio-translation-drafts";
export const PROMO_TRANSLATION_DRAFTS_VERSION = 1;
/** 창작 생태계 제작 기록(EcosystemRecord)의 번역 초안 상한과 같다. */
export const PROMO_TRANSLATION_DRAFTS_MAX = 1_000;
export const PROMO_TRANSLATION_ROWS_MAX = 5_000;
export const PROMO_TRANSLATION_FILE_MAX_BYTES = 8_000_000;
/** 번역문·원문 한 줄의 글자 수 상한(창작 생태계 번역 초안과 같다). */
export const PROMO_TRANSLATION_TEXT_MAX = 12_000;

const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/u;
/** 로케일 코드(en, ja, zh-Hans …). 폴더 이름으로도 쓰이므로 경로에 안전한 모양만 받는다. */
export function isPromoLocaleCode(value: string): boolean {
  return LOCALE_PATTERN.test(value);
}
