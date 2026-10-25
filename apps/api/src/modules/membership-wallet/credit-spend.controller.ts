/**
 * credit-spend.controller.ts — POST /membership/wallet/spend 전용 컨트롤러.
 * 기존 MembershipWalletController(157줄)를 늘리지 않고 별도 컨트롤러로 분리한다.
 * 인증은 기존 컨트롤러와 같은 x-user-id 헤더 관례를 따른다.
 */
import {
  Body,
  Controller,
  Header,
  Headers,
  Inject,
  Post,
} from "@nestjs/common";

import { CreditSpendService } from "./credit-spend.service";
import type { CreditSpendInput } from "./credit-spend";

@Controller()
export class CreditSpendController {
  constructor(
    @Inject(CreditSpendService) private readonly spendService: CreditSpendService,
  ) {}

  @Post("membership/wallet/spend")
  @Header("Cache-Control", "no-store, max-age=0")
  spendCredits(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: CreditSpendInput,
  ) {
    return this.spendService.spend(userId, body ?? {});
  }
}
