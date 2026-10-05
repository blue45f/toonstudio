/**
 * 뉴스레터 메일 발송 계약 지점 — 실제 이메일 전송은 이 계약으로만 연결한다.
 *
 * 어댑터는 둘이다:
 * - `localLogNewsletterMailAdapter` (기본): 네트워크 호출 없이 수신자 수만 확정한다.
 * - Resend BYOK 어댑터(`newsletter-mail-resend.ts`): 사용자가 통합 API 키 허브에
 *   자기 Resend 키를 등록하면 활성화된다. 발송은 서버 릴레이(POST /api/newsletter/deliver)를
 *   경유하고, 스토어는 `resolveNewsletterMailAdapter()`로 둘 중 하나를 고른다.
 *
 * 서버 릴레이가 아직 없어서 Resend 발송이 실패하면 스토어가 실패 이력을 남기고
 * 초안은 그대로 둔다 — 성공으로 위장하지 않는다.
 * 수신자 이메일 주소는 서버 계약 이후 어댑터 내부에서만 해석하고,
 * 이 인터페이스에는 사용자 ID만 넘긴다.
 */

export interface NewsletterMailRequest {
  readonly authorName: string;
  readonly subject: string;
  readonly body: string;
  /** 수신자 사용자 ID 목록. 이메일 주소는 포함하지 않는다. */
  readonly recipientIds: readonly string[];
  /** 구독 해지 안내 경로(예: "/newsletter"). 메일 하단에 필수로 실린다. */
  readonly unsubscribePath: string;
}

export interface NewsletterMailReceipt {
  readonly adapterId: string;
  readonly acceptedCount: number;
  /** ISO 8601. */
  readonly deliveredAt: string;
}

export interface NewsletterMailAdapter {
  readonly id: string;
  send(request: NewsletterMailRequest): Promise<NewsletterMailReceipt>;
}

/** 로컬 기록 전용 어댑터 — 실제 메일을 보내지 않고 접수 건수만 확정한다. */
export const localLogNewsletterMailAdapter: NewsletterMailAdapter = {
  id: "local-log",
  async send(request: NewsletterMailRequest): Promise<NewsletterMailReceipt> {
    return {
      adapterId: "local-log",
      acceptedCount: request.recipientIds.length,
      deliveredAt: new Date().toISOString(),
    };
  },
};

/**
 * 키 미등록 시의 기본 어댑터. 실제 선택은 스토어가
 * `resolveNewsletterMailAdapter()`(newsletter-mail-resend.ts)로 수행한다 —
 * Resend 키가 등록돼 있으면 그쪽 어댑터가 우선한다.
 */
export const NEWSLETTER_MAIL_ADAPTER: NewsletterMailAdapter = localLogNewsletterMailAdapter;
