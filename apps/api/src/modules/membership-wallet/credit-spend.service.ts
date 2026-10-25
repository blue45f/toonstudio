/**
 * credit-spend.service.ts — spend 순수 로직(credit-spend.ts)의 얇은 Nest 래퍼.
 * 가격·멱등·예약·캡처 판단은 credit-spend.ts에 있고, 여기서는
 * CreditSpendError를 Nest HTTP 예외로만 매핑한다.
 * membership-wallet.service.ts(1,884줄, 기준선 상한)에는 코드를 추가하지 않는다.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";

import {
  CreditSpendError,
  spendStudioCredits,
  type CreditSpendInput,
  type CreditSpendResult,
} from "./credit-spend";
import { MembershipWalletService } from "./membership-wallet.service";
import {
  PAID_OPERATIONS_SETTING_STORE,
  type PaidOperationsSettingStore,
} from "./paid-operations-gate";

@Injectable()
export class CreditSpendService {
  constructor(
    @Inject(MembershipWalletService)
    private readonly wallet: MembershipWalletService,
    @Optional()
    @Inject(PAID_OPERATIONS_SETTING_STORE)
    private readonly paidOperations?: PaidOperationsSettingStore,
  ) {}

  async spend(
    userId: string | undefined,
    body: CreditSpendInput,
  ): Promise<CreditSpendResult> {
    try {
      // 게이트는 spendStudioCredits 내부에서 현재 설정값으로 검사한다
      // (스토어 미주입 시 미설정=false로 거부 — fail-closed).
      return await spendStudioCredits(
        this.wallet,
        userId,
        body,
        this.paidOperations,
      );
    } catch (error) {
      if (error instanceof CreditSpendError) {
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
