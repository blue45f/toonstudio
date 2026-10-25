/**
 * marketplace-credit-payment.service.ts — 마켓 크레딧 결제 체크아웃의
 * 얇은 Nest 래퍼 (2단계 수익화 가동, 2026-10-25).
 * 가격·판매자·이용권 판정·정산 판단은 순수 모듈
 * (marketplace-credit-checkout.ts / marketplace-credit-payment.ts)에 있고,
 * 여기서는 라이브 의존성 배선과 Nest HTTP 예외 매핑만 담당한다.
 *
 * 배선:
 *  - 상거래 판정: commerce-market-policy의 resolveMarketplaceAccessDecision
 *    (라이브러리 서비스가 이미 같은 함수를 직접 import하는 전례가 있다).
 *  - 정산 지갑: marketplace-credit-wallet-adapter (예약·확정·해제는 지갑
 *    서비스 공개 경로, 판매자 적립은 grantAsset 공개 경로).
 *  - 이용권 부여: 기존 commerce_entitlement 테이블에 대한 INSERT
 *    (신규 테이블·마이그레이션 없음, 사용자·상품 UNIQUE 충돌 시 기존
 *    행 존재로 간주해 성공 처리한다 — 결제 이후 이용권이 이미 있으면
 *    부여 목적은 달성된 것이므로 실패로 돌리지 않는다).
 *  - 게이트는 체크아웃 순수 모듈 내부와 컨트롤러 진입부에서 모두 검사한다
 *    (스토어 미주입 시 미설정=false로 거부 — fail-closed).
 *  - 현금 정산·출금·PG 호출은 없다. 판매자 잔액은 크레딧 잔액으로만 표현한다.
 */
import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";

import { dbPool } from "../../platform/database";
import {
  resolveMarketplaceAccessDecision,
} from "../commerce/commerce-market-policy";

import {
  checkoutMarketplaceWithCredits,
  settleMarketplaceCreditCheckoutPayment,
  type MarketplaceCreditCheckoutInput,
  type MarketplaceCreditCheckoutResult,
  MarketplaceCreditCheckoutError,
} from "./marketplace-credit-checkout";
import { createMarketplaceCreditWallet } from "./marketplace-credit-wallet-adapter";
import {
  MarketplaceCreditError,
} from "./marketplace-credit-payment";
import { MembershipWalletService } from "./membership-wallet.service";
import {
  PAID_OPERATIONS_SETTING_STORE,
  type PaidOperationsSettingStore,
} from "./paid-operations-gate";

@Injectable()
export class MarketplaceCreditPaymentService {
  constructor(
    @Inject(MembershipWalletService)
    private readonly wallet: MembershipWalletService,
    @Optional()
    @Inject(PAID_OPERATIONS_SETTING_STORE)
    private readonly paidOperations?: PaidOperationsSettingStore,
  ) {}

  async checkout(
    userId: string | undefined,
    body: MarketplaceCreditCheckoutInput,
  ): Promise<MarketplaceCreditCheckoutResult> {
    try {
      return await checkoutMarketplaceWithCredits(
        {
          resolveDecision: (releaseId, buyerId) =>
            resolveMarketplaceAccessDecision(releaseId, buyerId),
          settle: (wallet, input, store) =>
            settleMarketplaceCreditCheckoutPayment(wallet, input, store),
          grantEntitlement: async (input) => {
            const inserted = await dbPool.query<{ id: string }>(
              `INSERT INTO commerce_entitlement
                 (id, "userId", "productType", "productId", "sourceOrderId",
                  "grantedAt", "revokedAt", "updatedAt")
               VALUES ($1, $2, $3, $4, NULL, now(), NULL, now())
               ON CONFLICT ("userId", "productType", "productId") DO NOTHING
               RETURNING id`,
              [
                randomUUID(),
                input.userId,
                input.productType,
                input.productId,
              ],
            );
            if (inserted.rows[0]) return { granted: true };
            const existing = await dbPool.query<{ id: string }>(
              `SELECT id FROM commerce_entitlement
                WHERE "userId" = $1 AND "productType" = $2
                  AND "productId" = $3 AND "revokedAt" IS NULL
                LIMIT 1`,
              [input.userId, input.productType, input.productId],
            );
            return { granted: Boolean(existing.rows[0]) };
          },
        },
        createMarketplaceCreditWallet(this.wallet),
        body,
        this.paidOperations,
      );
    } catch (error) {
      // 상거래 판정의 Nest 예외(404·409)는 그대로 전파한다.
      if (error instanceof HttpException) throw error;
      if (
        error instanceof MarketplaceCreditCheckoutError
        || error instanceof MarketplaceCreditError
      ) {
        const payload = { code: error.code, message: error.message };
        if (error.status === 403) throw new ForbiddenException(payload);
        if (error.status === 409) throw new ConflictException(payload);
        throw new BadRequestException(payload);
      }
      // 지갑 서비스의 잔액 부족·일 한도 등 Conflict는 그대로 전파한다.
      throw error;
    }
  }
}
