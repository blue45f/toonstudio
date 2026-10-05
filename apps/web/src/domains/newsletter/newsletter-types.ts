/**
 * 작가 뉴스레터 도메인 타입.
 *
 * 구독 관계의 정본은 당분간 이 브라우저의 로컬 스토어다(컷츠·캐릭터 챗과 같은
 * 로컬-퍼스트 파일럿). 서버 구독/발송 계약이 생기면 스토어 어댑터만 교체한다.
 */

/** 발송 주기 — 설계 기본값은 주 1회 묶음 발송이다. */
export type NewsletterCadence = "weekly" | "instant";

export interface NewsletterSubscription {
  readonly readerId: string;
  readonly authorName: string;
  readonly cadence: NewsletterCadence;
  /** ISO 8601. */
  readonly subscribedAt: string;
}

export type NewsletterIssueStatus = "draft" | "sent";

export interface NewsletterIssue {
  readonly id: string;
  readonly authorName: string;
  /**
   * 소유 계정(actorId). 웨이브11 이전 데이터는 null(미귀속)이며, 작성 화면이
   * 현재 계정으로 귀속(claim)한 뒤부터는 계정이 다르면 목록·수정·발송에서 제외된다.
   */
  readonly ownerId: string | null;
  readonly title: string;
  readonly body: string;
  readonly status: NewsletterIssueStatus;
  /** ISO 8601. */
  readonly createdAt: string;
  /** ISO 8601. */
  readonly updatedAt: string;
  /** ISO 8601. 발송 전이면 null. */
  readonly sentAt: string | null;
}

/**
 * 발송 이력 1건. `recipientCount`는 메일 어댑터가 확정한 실제 수신자 수이고,
 * 화면 표시용 구독자 수(시드 기준 포함)와는 다를 수 있다.
 */
export interface NewsletterSendRecord {
  readonly id: string;
  readonly issueId: string;
  readonly authorName: string;
  /** 소유 계정(actorId). 이슈의 ownerId를 그대로 잇는다 (null = 미귀속 레거시). */
  readonly ownerId: string | null;
  readonly issueTitle: string;
  /** ISO 8601. */
  readonly sentAt: string;
  readonly recipientCount: number;
  /** 발송을 처리한 메일 어댑터 식별자. "local-log"(실제 발송 없음) 또는 "resend". */
  readonly adapterId: string;
  /**
   * 발송 실패 기록이면 true. 실패 기록은 recipientCount가 0이고 이슈는 초안으로
   * 남는다 — 성공 이력과 섞어 "보낸 것처럼" 보이지 않게 화면이 구분해 표시한다.
   * 구 persist 데이터에는 이 필드 자체가 없어 undefined = 성공 기록이다.
   */
  readonly failed?: boolean;
  /** 실패 사유 요약. 키·수신자 같은 민감 정보는 넣지 않는다. */
  readonly failureMessage?: string;
}

export interface SubscribeResult {
  readonly subscribed: boolean;
  /** 게스트라서 로그인 유도가 필요한 경우 true. 이때 상태는 바뀌지 않는다. */
  readonly needsLogin: boolean;
}

export type SendIssueFailureReason =
  | "not-found"
  | "already-sent"
  | "empty-title"
  | "empty-body"
  | "no-subscribers"
  /** 메일 어댑터가 발송에 실패했다(릴레이 부재·서비스 거부 등). 실패 이력이 함께 남는다. */
  | "delivery-failed";

export interface SendIssueResult {
  readonly sent: boolean;
  readonly reason?: SendIssueFailureReason;
  readonly record?: NewsletterSendRecord;
}

export type IssueDraftFailureReason = "empty-title" | "empty-body";
