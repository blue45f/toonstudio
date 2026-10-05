/**
 * 뉴스레터 Resend BYOK 어댑터 — 사용자가 등록한 Resend API 키로 실제 메일을 보낸다.
 *
 * 왜 브라우저가 Resend를 직접 부르지 않는가:
 * - 메일 어댑터 계약(`newsletter-mail-adapter.ts`)상 수신자 이메일 주소는
 *   클라이언트에 절대 오지 않는다. 인터페이스는 사용자 ID만 넘긴다.
 * - 그래서 발송은 ToonStudio 서버 릴레이를 경유한다. 클라이언트 도달 범위는
 *   여기까지(키 보관 + 릴레이 호출 + 영수증 확정)이고, 릴레이 서버 계약은 아래가 정본이다.
 *
 * 서버 릴레이 계약 — POST /api/newsletter/deliver (미구현, 서버 트랙에서 구현):
 * - 요청: { apiKey, authorName, subject, body, recipientIds, unsubscribePath }
 *   (세션 쿠키 인증 필수. apiKey는 사용자의 Resend 키로, 이 요청 1회에만 쓰고
 *   서버에 저장·로깅하지 않는다.)
 * - 서버 책임: recipientIds → 구독자 이메일 해석(서버 전용 데이터),
 *   SPF/DKIM 인증된 발신 도메인으로 Resend API 호출, 남용 방지(발송자 본인
 *   구독자만 수신 가능) 검증.
 * - 응답: { acceptedCount: number, deliveredAt?: ISO 8601 }
 * - 릴레이가 없거나 Resend가 거부하면 비정상 응답 → 이 어댑터는 실패로 던지고,
 *   스토어가 실패 이력을 남긴다. 성공으로 위장하지 않는다.
 *
 * 키 보관: API 키 허브의 다른 세션 키(Unsplash)와 같은 정책 — 현재 탭의
 * sessionStorage에만 둔다. 키 원문은 로그·이력·오류 메시지에 넣지 않는다.
 */

import { api } from "@/platform/api";

import {
  localLogNewsletterMailAdapter,
  type NewsletterMailAdapter,
  type NewsletterMailRequest,
} from "./newsletter-mail-adapter";

export const NEWSLETTER_RESEND_API_KEY_STORAGE_KEY = "toonstudio_newsletter_resend_api_key";

/** Resend 어댑터 식별자 — 발송 이력의 adapterId에 그대로 기록된다. */
export const RESEND_NEWSLETTER_ADAPTER_ID = "resend";

export interface NewsletterMailKeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 브라우저 sessionStorage를 안전하게 얻는다(비브라우저·차단 환경에서는 null). */
export function browserNewsletterSessionStorage(): NewsletterMailKeyStorage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** 저장된 Resend 키 로드 — 저장소 부재·조회 실패는 빈 문자열(미등록 상태)로 취급한다. */
export function loadNewsletterResendApiKey(
  storage: NewsletterMailKeyStorage | null | undefined,
): string {
  if (!storage) return "";
  try {
    return storage.getItem(NEWSLETTER_RESEND_API_KEY_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Resend 키를 현재 탭 세션에 저장한다. 성공 여부를 돌려준다(실패를 숨기지 않는다). */
export function saveNewsletterResendApiKey(
  storage: NewsletterMailKeyStorage | null | undefined,
  apiKey: string,
): boolean {
  if (!storage) return false;
  try {
    const trimmed = apiKey.trim();
    if (trimmed) storage.setItem(NEWSLETTER_RESEND_API_KEY_STORAGE_KEY, trimmed);
    else storage.removeItem(NEWSLETTER_RESEND_API_KEY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Resend 키가 등록돼 있으면 true — 빈 문자열은 미등록이다. */
export function isNewsletterResendConfigured(apiKey: string): boolean {
  return apiKey.trim().length > 0;
}

/** 릴레이에 넘기는 요청 — 메일 요청 + 사용자 키(전송 전용, 어디에도 기록하지 않는다). */
export interface NewsletterResendDeliveryRequest extends NewsletterMailRequest {
  readonly apiKey: string;
}

export interface NewsletterResendDeliveryResult {
  readonly acceptedCount: number;
  /** ISO 8601. 릴레이가 주지 않으면 어댑터가 접수 시각으로 채운다. */
  readonly deliveredAt?: string;
}

export type NewsletterResendDeliver = (
  request: NewsletterResendDeliveryRequest,
) => Promise<NewsletterResendDeliveryResult>;

/**
 * 발송 실패 오류 — 메시지에 키·수신자 정보를 넣지 않는다.
 * 스토어는 이 오류를 잡아 실패 이력으로 기록한다.
 */
export class NewsletterMailDeliveryError extends Error {
  constructor(message = "메일 발송 서비스가 요청을 처리하지 못했습니다.") {
    super(message);
    this.name = "NewsletterMailDeliveryError";
  }
}

/** 기본 릴레이 호출 — 공유 api 클라이언트로 서버 릴레이를 부른다. */
async function deliverViaNewsletterRelay(
  request: NewsletterResendDeliveryRequest,
): Promise<NewsletterResendDeliveryResult> {
  const response = await api.post<NewsletterResendDeliveryResult>("/newsletter/deliver", {
    apiKey: request.apiKey,
    authorName: request.authorName,
    subject: request.subject,
    body: request.body,
    recipientIds: request.recipientIds,
    unsubscribePath: request.unsubscribePath,
  });
  if (
    typeof response?.acceptedCount !== "number" ||
    !Number.isFinite(response.acceptedCount) ||
    response.acceptedCount < 0
  ) {
    throw new NewsletterMailDeliveryError("메일 발송 서비스가 올바르지 않은 결과를 돌려줬습니다.");
  }
  return response;
}

export interface ResendNewsletterMailAdapterOptions {
  readonly apiKey: string;
  /** 테스트·대체 전송 주입 지점. 기본값은 서버 릴레이 호출. */
  readonly deliver?: NewsletterResendDeliver;
}

/**
 * Resend BYOK 어댑터. 키가 비어 있으면 만들지 말고 `resolveNewsletterMailAdapter`를 쓸 것 —
 * 여기서는 빈 키를 조용히 넘기지 않고 실패로 드러낸다.
 */
export function createResendNewsletterMailAdapter(
  options: ResendNewsletterMailAdapterOptions,
): NewsletterMailAdapter {
  const deliver = options.deliver ?? deliverViaNewsletterRelay;
  return {
    id: RESEND_NEWSLETTER_ADAPTER_ID,
    async send(request) {
      const apiKey = options.apiKey.trim();
      if (!apiKey) {
        throw new NewsletterMailDeliveryError("Resend 키가 등록되어 있지 않습니다.");
      }
      let result: NewsletterResendDeliveryResult;
      try {
        result = await deliver({ ...request, apiKey });
      } catch (error) {
        if (error instanceof NewsletterMailDeliveryError) throw error;
        throw new NewsletterMailDeliveryError();
      }
      return {
        adapterId: RESEND_NEWSLETTER_ADAPTER_ID,
        acceptedCount: result.acceptedCount,
        deliveredAt: result.deliveredAt ?? new Date().toISOString(),
      };
    },
  };
}

/**
 * 현재 발송 어댑터 결정 — Resend 키가 등록돼 있으면 실발송 어댑터,
 * 없으면 기존 로컬 기록 전용 어댑터. 스토어의 sendIssue 기본값이 이 함수를 쓴다.
 */
export function resolveNewsletterMailAdapter(
  storage: NewsletterMailKeyStorage | null | undefined = browserNewsletterSessionStorage(),
): NewsletterMailAdapter {
  const apiKey = loadNewsletterResendApiKey(storage);
  if (!isNewsletterResendConfigured(apiKey)) return localLogNewsletterMailAdapter;
  return createResendNewsletterMailAdapter({ apiKey });
}
