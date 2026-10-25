/**
 * credit-spend.controller.ts — POST /membership/wallet/spend 전용 컨트롤러.
 * 기존 MembershipWalletController(157줄)를 늘리지 않고 별도 컨트롤러로 분리한다.
 * 인증은 기존 컨트롤러와 같은 x-user-id 헤더 관례를 따른다.
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Header,
  Headers,
  Inject,
  Optional,
  Post,
} from "@nestjs/common";

import { CreditSpendService } from "./credit-spend.service";
import type { CreditSpendInput } from "./credit-spend";
import {
  PAID_OPERATIONS_DISABLED,
  PAID_OPERATIONS_SETTING_STORE,
  resolvePaidOperationsEnabled,
  type PaidOperationsSettingStore,
} from "./paid-operations-gate";

@Controller()
export class CreditSpendController {
  constructor(
    @Inject(CreditSpendService) private readonly spendService: CreditSpendService,
    @Optional()
    @Inject(PAID_OPERATIONS_SETTING_STORE)
    private readonly paidOperations?: PaidOperationsSettingStore,
  ) {}

  @Post("membership/wallet/spend")
  @Header("Cache-Control", "no-store, max-age=0")
  async spendCredits(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: CreditSpendInput,
  ) {
    // 진입부 게이트: 서비스 내부 게이트와 같은 스토어 인스턴스의
    // 현재 값을 호출마다 읽는다 (스토어 미주입 시 미설정=false로 거부).
    if (!(await resolvePaidOperationsEnabled(this.paidOperations))) {
      throw new ForbiddenException({
        code: PAID_OPERATIONS_DISABLED,
        message:
          "유료 운영이 비활성화되어 있어 크레딧 지출을 실행할 수 없습니다.",
      });
    }
    return this.spendService.spend(userId, body ?? {});
  }
}
