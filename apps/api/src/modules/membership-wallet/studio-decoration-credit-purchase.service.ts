/**
 * studio-decoration-credit-purchase.service.ts — 꾸미기 크레딧 결제의
 * 얇은 Nest 래퍼 (2단계 수익화 가동, 2026-10-25).
 * 가격·멱등·예약·캡처 판단은 순수 모듈
 * (studio-decoration-credit-purchase.ts)에 있고, 여기서는 라이브 지갑
 * 어댑터 배선과 Nest HTTP 예외 매핑만 담당한다.
 *
 * 배선: decoration-credit-wallet-adapter (예약·확정은 지갑 서비스 공개 경로).
 * 게이트는 순수 모듈 내부와 컨트롤러 진입부에서 모두 검사한다
 * (스토어 미주입 시 미설정=false로 거부 — fail-closed).
 * 카탈로그 조회는 과금이 아니므로 게이트를 검사하지 않는다.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";

import { createDecorationCreditWallet } from "./decoration-credit-wallet-adapter";
import { MembershipWalletService } from "./membership-wallet.service";
import {
  PAID_OPERATIONS_SETTING_STORE,
  type PaidOperationsSettingStore,
} from "./paid-operations-gate";
import {
  DECORATION_CREDIT_CATALOG,
  type DecorationCreditItem,
} from "./studio-decoration-credit-catalog";
import {
  DecorationCreditError,
  purchaseDecorationCredits,
  type DecorationCreditPurchaseInput,
  type DecorationCreditPurchaseResult,
} from "./studio-decoration-credit-purchase";

@Injectable()
export class StudioDecorationCreditPurchaseService {
  constructor(
    @Inject(MembershipWalletService)
    private readonly wallet: MembershipWalletService,
    @Optional()
    @Inject(PAID_OPERATIONS_SETTING_STORE)
    private readonly paidOperations?: PaidOperationsSettingStore,
  ) {}

  getCatalog(): readonly DecorationCreditItem[] {
    return DECORATION_CREDIT_CATALOG;
  }

  async purchase(
    userId: string | undefined,
    body: DecorationCreditPurchaseInput,
  ): Promise<DecorationCreditPurchaseResult> {
    try {
      // 게이트는 purchaseDecorationCredits 내부에서 현재 설정값으로 검사한다
      // (스토어 미주입 시 미설정=false로 거부 — fail-closed).
      return await purchaseDecorationCredits(
        createDecorationCreditWallet(this.wallet),
        userId,
        body,
        this.paidOperations,
      );
    } catch (error) {
      if (error instanceof DecorationCreditError) {
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
