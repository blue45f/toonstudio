/**
 * 작가 공지 도메인의 공개 경계 — 다른 도메인(catalog 작품/작가 페이지,
 * creator 시리즈 상세)이 공지 표면을 가져다 쓰는 유일한 진입점.
 * 도메인 내부 파일로 직접 들어오는 deep import는 아키텍처 래칫이 금지한다.
 */
export { AuthorNoticeManager } from "../AuthorNoticeManager";
export type { AuthorNoticeManagerProps, AuthorNoticeManagerWork } from "../AuthorNoticeManager";
export { AuthorNoticeSection } from "../AuthorNoticeSection";
export type { AuthorNoticeSectionProps } from "../AuthorNoticeSection";
export { createStatusTransitionNoticeDraft } from "../author-notice-store";
