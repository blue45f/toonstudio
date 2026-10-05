/**
 * 뉴스레터 도메인의 공개 경계 — 다른 도메인(통합 API 키 허브)이 Resend 발송 키
 * 보관 함수를 가져다 쓰는 유일한 진입점. 도메인 내부 파일로 직접 들어오는
 * deep import는 아키텍처 래칫이 금지한다.
 *
 * 키 원문은 이 경계를 넘어도 화면·로그에 남기지 않는 것이 호출부의 책임이다
 * (마스킹 표시는 키 허브의 maskApiKey가 담당).
 */
export {
  NEWSLETTER_RESEND_API_KEY_STORAGE_KEY,
  RESEND_NEWSLETTER_ADAPTER_ID,
  browserNewsletterSessionStorage,
  isNewsletterResendConfigured,
  loadNewsletterResendApiKey,
  saveNewsletterResendApiKey,
} from "../newsletter-mail-resend";
export type { NewsletterMailKeyStorage } from "../newsletter-mail-resend";
