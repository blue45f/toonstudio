/**
 * marketplace-credit-checkout.ts — 마켓 크레딧 결제 체크아웃 순수 오케스트레이션
 * (2단계 수익화 가동, 2026-10-25). Nest에 의존하지 않는 순수 모듈이다.
 *
 * 이 파일이 닫는 배선 한계 (P2/P3 실측, marketplace-credit-payment.ts 머리 주석):
 *  - 정산 모듈(settleMarketplaceCreditPayment)은 순수 로직 + 스텁 검증만
 *    존재했고, 라이브 획득 흐름에는 연결되지 않았다. 이유는 판매자 적립
 *    어댑터 부재였다. 이 파일은 그 연결을 "결제 → 상거래 이용권 부여 →
 *    기존 획득" 순서로 정의한다. 라이브 획득(`acquire()`) 자체는 건드리지
 *    않는다 — 결제 성공 시 기존 상거래 이용권 테이블에 행을 남기므로,
 *    그 뒤의 기존 획득 호출은 `alreadyEntitled` 판정으로 통과한다.
 *
 * 순서와 가격 권위:
 *  1. 입력 검증 (구매자·상품·요청 식별자).
 *  2. 유료 실행 게이트 (마스터 스위치, 최우선 — 스토어 미주입·미설정 시
 *     false로 거부한다. 게이트 OFF면 상품이 무료인지와 무관하게
 *     `PAID_OPERATIONS_DISABLED`(403)로 거부한다. 이 엔드포인트 자체가
 *     유료 결제 경로이기 때문이다. 무료 상품은 기존 무료 획득 경로를 쓴다).
 *  3. 상거래 접근 판정 서버 조회 (가격·판매자·기존 이용권 모두 서버 결정 —
 *     클라이언트 제시 가격·판매자는 받지 않는다).
 *  4. 이미 이용권 있음 → 409로 거부 (중복 과금 방지).
 *     결제 필요 없음(무료 모드·0원) → 400으로 거부 (무료 획득 경로로 안내).
 *  5. 정산 모듈로 구매자 차감 + 판매자 적립 + 수수료 20% 분리 영수증.
 *  6. 상거래 이용권 부여 (기존 테이블, 신규 테이블·마이그레이션 없음).
 *     부여 실패 시 구매자 결제는 이미 확정된 상태이므로, 영수증 식별자를
 *     담은 대조용 오류를 반환한다 (자동 환불 경로가 없는 것은 정산 모듈과
 *     동일 전제이며, 관리자 조정으로 복구한다).
 *
 * 현금 정산·출금·PG 호출은 절대 만들지 않는다. 판매자 잔액은 크레딧
 * 잔액으로만 표현한다. 크레딧 구매(충전) 활성화도 이 파일의 범위가 아니다.
 */

import {
  marketplacePriceCreditsFromKrw,
  type MarketplaceCreditPaymentInput,
  type MarketplaceCreditReceipt,
  settleMarketplaceCreditPayment,
  type MarketplaceCreditWallet,
} from "./marketplace-credit-payment";
import {
  PAID_OPERATIONS_DISABLED,
  resolvePaidOperationsEnabled,
  type PaidOperationsSettingStore,
} from "./paid-operations-gate";

/** 상거래 접근 판정의 최소 형태 (commerce-market-policy의 판정과 동일 구조). */
export interface MarketplaceCreditCheckoutDecision {
  product: {
    resourceId: string;
    publisherId: string;
    productId: string;
    productName: string;
  };
  amount: number;
  operationMode: "free" | "paid";
  alreadyEntitled: boolean;
  checkoutRequired: boolean;
}

export interface MarketplaceCreditCheckoutDeps {
  resolveDecision: (
    releaseId: string,
    userId: string,
  ) => Promise<MarketplaceCreditCheckoutDecision>;
  settle: (
    wallet: MarketplaceCreditWallet,
    input: MarketplaceCreditPaymentInput,
    paidOperations?: PaidOperationsSettingStore,
  ) => Promise<MarketplaceCreditReceipt>;
  grantEntitlement: (input: {
    userId: string;
    productType: "market-resource";
    productId: string;
  }) => Promise<{ granted: boolean }>;
}

export interface MarketplaceCreditCheckoutInput {
  userId?: unknown;
  releaseId?: unknown;
  requestId?: unknown;
}

export interface MarketplaceCreditCheckoutResult
  extends MarketplaceCreditReceipt {
  entitled: true;
  productId: string;
  krwAmount: number;
}

export class MarketplaceCreditCheckoutError extends Error {
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
    this.name = "MarketplaceCreditCheckoutError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function checkoutMarketplaceWithCredits(
  deps: MarketplaceCreditCheckoutDeps,
  wallet: MarketplaceCreditWallet,
  body: MarketplaceCreditCheckoutInput,
  paidOperations?: PaidOperationsSettingStore,
): Promise<MarketplaceCreditCheckoutResult> {
  const userId = boundedText(body?.userId, 160);
  const releaseId = boundedText(body?.releaseId, 200);
  const requestId = boundedText(body?.requestId, 180);
  if (!userId || !releaseId || !requestId) {
    throw new MarketplaceCreditCheckoutError(
      "marketplace_checkout_invalid_input",
      400,
      "구매자·상품·요청 식별자가 필요합니다.",
    );
  }

  // 유료 실행 게이트: 판정 조회·지갑 호출 전에 최우선으로 검사한다.
  if (!(await resolvePaidOperationsEnabled(paidOperations))) {
    throw new MarketplaceCreditCheckoutError(
      PAID_OPERATIONS_DISABLED,
      403,
      "유료 운영이 비활성화되어 있어 마켓 크레딧 결제를 실행할 수 없습니다.",
      { releaseId },
    );
  }

  const decision = await deps.resolveDecision(releaseId, userId);
  if (decision.alreadyEntitled) {
    throw new MarketplaceCreditCheckoutError(
      "marketplace_already_entitled",
      409,
      "이미 이용권을 보유한 상품입니다. 다시 결제하지 않습니다.",
      { releaseId, productId: decision.product.productId },
    );
  }
  if (!decision.checkoutRequired || decision.amount <= 0) {
    throw new MarketplaceCreditCheckoutError(
      "marketplace_free_item",
      400,
      "이 상품은 무료 획득 경로를 이용하세요. 크레딧 결제가 필요하지 않습니다.",
      { releaseId },
    );
  }
  const priced = marketplacePriceCreditsFromKrw(decision.amount);
  if (priced === null) {
    throw new MarketplaceCreditCheckoutError(
      "marketplace_free_item",
      400,
      "이 상품은 무료 획득 경로를 이용하세요. 크레딧 결제가 필요하지 않습니다.",
      { releaseId },
    );
  }

  // 가격·판매자는 서버 판정에서만 온다. 클라이언트 제시 가격은 받지 않는다.
  // 본인 상품·게이트 재검사는 정산 모듈이 담당한다.
  const receipt = await deps.settle(
    wallet,
    {
      buyerId: userId,
      sellerId: decision.product.publisherId,
      releaseId,
      priceCredits: priced.priceCredits,
      requestId,
    },
    paidOperations,
  );

  const entitlement = await deps.grantEntitlement({
    userId,
    productType: "market-resource",
    productId: decision.product.productId,
  });
  if (!entitlement.granted) {
    // 구매자 확정 이후 실패 — 자동 환불 경로가 없으므로 대조용 오류로 반환한다.
    throw new MarketplaceCreditCheckoutError(
      "marketplace_entitlement_failed",
      409,
      "마켓 이용권 부여에 실패했습니다. 관리자 대조가 필요합니다.",
      {
        buyerPaymentId: receipt.buyerPaymentId,
        buyerCaptured: true,
        entitled: false,
        releaseId,
      },
    );
  }

  return {
    ...receipt,
    entitled: true,
    productId: decision.product.productId,
    krwAmount: decision.amount,
  };
}

/** 기본 정산 의존성 — 실서비스는 이 함수를 deps.settle로 그대로 쓴다. */
export async function settleMarketplaceCreditCheckoutPayment(
  wallet: MarketplaceCreditWallet,
  input: MarketplaceCreditPaymentInput,
  paidOperations?: PaidOperationsSettingStore,
): Promise<MarketplaceCreditReceipt> {
  return settleMarketplaceCreditPayment(wallet, input, paidOperations);
}
