export { AuthorNoticeManager } from "./AuthorNoticeManager";
export type { AuthorNoticeManagerProps, AuthorNoticeManagerWork } from "./AuthorNoticeManager";
export { AuthorNoticeSection } from "./AuthorNoticeSection";
export type { AuthorNoticeSectionProps } from "./AuthorNoticeSection";
export {
  buildStatusTransitionNoticeDraft,
  listPublishedNoticesForAuthor,
  listPublishedNoticesForWork,
  validateAuthorNoticeDraft,
} from "./author-notice-model";
export {
  createStatusTransitionNoticeDraft,
  useAuthorNoticeStore,
  useAuthorNoticesHydrated,
} from "./author-notice-store";
export type {
  AuthorNotice,
  AuthorNoticeDraftSeed,
  AuthorNoticeKind,
  AuthorNoticeScope,
  AuthorNoticeStatus,
  AuthorNoticeValidation,
  AuthorNoticeValidationReason,
} from "./author-notice-types";
