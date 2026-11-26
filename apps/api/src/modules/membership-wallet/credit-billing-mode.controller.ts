import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Post,
} from "@nestjs/common";

import type { CreditPurchaseIntentInput } from "./credit-purchase-intent";
import { CreditBillingModeService } from "./credit-billing-mode.service";

@Controller()
export class CreditBillingModeController {
  constructor(
    @Inject(CreditBillingModeService)
    private readonly billingModeService: CreditBillingModeService,
  ) {}

  @Get("membership/billing-mode")
  @Header("Cache-Control", "no-store, max-age=0")
  getBillingMode() {
    return this.billingModeService.getBillingMode();
  }

  @Post("membership/waitlist-intent")
  @Header("Cache-Control", "no-store, max-age=0")
  registerWaitlistIntent(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: { targetType?: unknown; targetId?: unknown },
  ) {
    return this.billingModeService.registerWaitlistIntent(userId, body ?? {});
  }

  @Post("membership/referral-claim")
  @Header("Cache-Control", "no-store, max-age=0")
  claimReferralBonus(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: { inviterCode?: unknown },
  ) {
    return this.billingModeService.claimReferralBonus(userId, body ?? {});
  }

  @Post("membership/credit-packs/purchase")
  @Header("Cache-Control", "no-store, max-age=0")
  purchaseCreditPack(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: CreditPurchaseIntentInput,
  ) {
    return this.billingModeService.purchaseCreditPack(userId, body ?? {});
  }
}
