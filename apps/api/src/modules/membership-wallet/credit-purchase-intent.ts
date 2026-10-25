/**
 * credit-purchase-intent.ts — 크레딧 구매 의도 처리 (P3, 게이트 OFF 유지).
 * Nest에 의존하지 않는 순수 모듈이다.
 *
 * 구현 범위와 금지선:
 *  - 이 모듈은 팩 카탈로그 조회 + 게이트 판정 + 게이트 on 시 지갑
 *    적립 연결 지점(seam)까지만 코드로 완성한다.
 *  - **실결제·테스트 결제·PG 호출은 절대 실행하지 않는다.** 이 파일은
 *    어떤 결제 SDK도 import하지 않으며, 결제 확인 식별자
 *    (`paymentConfirmationId`)는 PG 핸들러가 별도로 발급·검증하는
 *    불투명 식별자로만 취급한다.
 *  - **실제 과금은 사업자등록·PG 심사 후 활성화한다.** 사업자등록이
 *    없는 현 상태에서는 게이트를 켤 수 없으며, 게이트 on은 제품·법무
 *    결정 사항이다. 게이트가 꺼져 있는 한 구매 의도는 거부된다.
 *
 * 게이트 구조 (우회 방지):
 *  - 게이트 값은 호출부가 인자로 명시한다. 현행 정책값은
 *    `MEMBERSHIP_ECONOMY_POLICY.creditPurchasesEnabled`(core, false)이며,
 *    실서비스 래퍼는 반드시 이 값을 그대로 전달해야 한다. 테스트에서만
 *    게이트 on 경로를 스텁 검증한다.
 *  - 게이트 on 경로도 결제를 대신하지 않는다. 지갑 적립은 PG 결제
 *    확인 이후에만 호출되도록 `paymentConfirmationId`를 필수로 요구한다.
 *    확인 식별자 없이 적립을 호출하면 무결제 지급이 되므로 거부한다.
 *  - 구매 크레딧 만료는 null이다 (기존 코드 상수
 *    `purchasedCreditExpiryDays: null` — 확정 아님, 구매 경로 미검증).
 *    보상 크레딧의 90일 만료와 다르며, 이 차등을 코드로 명시한다.
 */
import { MEMBERSHIP_ECONOMY_POLICY } from "../../../../../packages/core/src/membership-wallet";

import {
  findCreditPack,
  isCreditPackPriceConsistent,
  type CreditPack,
} from "./credit-pack-catalog";

/** 현행 정책 게이트값 (core 원천, 이 단계에서 변경하지 않는다). */
export const CREDIT_PURCHASES_ENABLED: boolean =
  MEMBERSHIP_ECONOMY_POLICY.creditPurchasesEnabled;

/** 구매 크레딧 만료: 없음 (기존 코드 상수, 보상 90일과 차등). */
export const PURCHASED_CREDIT_EXPIRY: null = null;

/** 지갑 서비스 중 구매 적립이 사용하는 구조적 인터페이스 (seam). */
export interface CreditPurchaseWallet {
  grantPurchasedCredits(input: {
    userId: string;
    packId: string;
    credits: number;
    requestKey: string;
    paymentConfirmationId: string;
    expiresAt: null;
  }): Promise<{ granted: boolean }>;
}

export interface CreditPurchaseIntentInput {
  packId?: unknown;
  requestId?: unknown;
  /** PG 핸들러가 발급한 결제 확인 식별자 (게이트 on 경로에서 필수). */
  paymentConfirmationId?: unknown;
}

export interface CreditPurchaseIntentResult {
  purchaseIntentId: string;
  packId: string;
  credits: number;
  krwPrice: number;
  granted: true;
  /** 구매 크레딧 만료 없음. */
  expiresAt: null;
}

export class CreditPurchaseError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    status: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CreditPurchaseError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function creditPurchaseRequestKey(requestId: string): string {
  return `credit-purchase:${requestId}`;
}

/**
 * 구매 의도를 처리한다. `purchasesEnabled`는 실서비스에서 반드시
 * 현행 정책값(`CREDIT_PURCHASES_ENABLED`)을 전달한다.
 */
export async function requestCreditPurchase(
  wallet: CreditPurchaseWallet,
  userIdValue: string | undefined,
  body: CreditPurchaseIntentInput,
  purchasesEnabled: boolean,
): Promise<CreditPurchaseIntentResult> {
  const userId = userIdValue?.trim();
  if (!userId) {
    throw new CreditPurchaseError(
      "credit_purchase_login_required",
      403,
      "로그인이 필요해요.",
    );
  }
  const packId = boundedText(body?.packId, 200);
  if (!packId) {
    throw new CreditPurchaseError(
      "credit_purchase_invalid_input",
      400,
      "크레딧 팩 식별자가 필요합니다.",
    );
  }
  const requestId = boundedText(body?.requestId, 200);
  if (!requestId) {
    throw new CreditPurchaseError(
      "credit_purchase_invalid_input",
      400,
      "구매 요청 식별자가 필요합니다.",
    );
  }

  const pack: CreditPack | null = findCreditPack(packId);
  if (pack === null || !isCreditPackPriceConsistent(pack)) {
    throw new CreditPurchaseError(
      "credit_purchase_pack_not_found",
      400,
      "판매하지 않는 크레딧 팩입니다.",
      { packId },
    );
  }

  // 게이트 OFF: 지갑·PG를 일절 호출하지 않고 거부한다.
  if (!purchasesEnabled) {
    throw new CreditPurchaseError(
      "credit_purchase_disabled",
      403,
      "크레딧 구매가 아직 열려 있지 않습니다. 실제 과금은 사업자등록·PG 심사 후 활성화됩니다.",
      { packId },
    );
  }

  // 게이트 on: PG 결제 확인 식별자 없이는 적립하지 않는다.
  const paymentConfirmationId = boundedText(body?.paymentConfirmationId, 200);
  if (!paymentConfirmationId) {
    throw new CreditPurchaseError(
      "credit_purchase_payment_unconfirmed",
      409,
      "결제 확인 식별자가 없어 크레딧을 적립할 수 없습니다.",
      { packId },
    );
  }

  const grant = await wallet.grantPurchasedCredits({
    userId,
    packId: pack.id,
    credits: pack.credits,
    requestKey: creditPurchaseRequestKey(requestId),
    paymentConfirmationId,
    expiresAt: PURCHASED_CREDIT_EXPIRY,
  });
  if (!grant.granted) {
    throw new CreditPurchaseError(
      "credit_purchase_grant_failed",
      409,
      "크레딧 적립에 실패했습니다. 결제 확인 식별자로 대조가 필요합니다.",
      { packId, paymentConfirmationId },
    );
  }

  return {
    purchaseIntentId: creditPurchaseRequestKey(requestId),
    packId: pack.id,
    credits: pack.credits,
    krwPrice: pack.krwPrice,
    granted: true,
    expiresAt: PURCHASED_CREDIT_EXPIRY,
  };
}
