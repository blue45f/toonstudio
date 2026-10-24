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
} from "@nestjs/common";

import {
  CreditSpendError,
  spendStudioCredits,
  type CreditSpendInput,
  type CreditSpendResult,
} from "./credit-spend";
import { MembershipWalletService } from "./membership-wallet.service";

@Injectable()
export class CreditSpendService {
  constructor(
    @Inject(MembershipWalletService)
    private readonly wallet: MembershipWalletService,
  ) {}

  async spend(
    userId: string | undefined,
    body: CreditSpendInput,
  ): Promise<CreditSpendResult> {
    try {
      return await spendStudioCredits(this.wallet, userId, body);
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
