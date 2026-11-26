import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Post,
} from "@nestjs/common";

import type { CreditPurchaseIntentInput } from "./credit-purchase-intent";
import { CreditBillingModeService } from "./credit-billing-mode.service";
import { TeamCreditSubwalletService } from "./team-credit-subwallet.service";

@Controller()
export class CreditBillingModeController {
  constructor(
    @Inject(CreditBillingModeService)
    private readonly billingModeService: CreditBillingModeService,
    @Inject(TeamCreditSubwalletService)
    private readonly teamSubwalletService: TeamCreditSubwalletService,
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

  @Get("membership/team-quotas")
  @Header("Cache-Control", "no-store, max-age=0")
  listTeamQuotas(@Headers("x-user-id") userId: string | undefined) {
    return this.teamSubwalletService.listQuotasForUser(userId);
  }

  @Post("membership/team-quotas/allocate")
  @Header("Cache-Control", "no-store, max-age=0")
  allocateTeamQuota(
    @Headers("x-user-id") userId: string | undefined,
    @Body()
    body: {
      workspaceId?: unknown;
      assistantUserId?: unknown;
      assistantNickname?: unknown;
      roleKo?: unknown;
      limitCredits?: unknown;
    },
  ) {
    return this.teamSubwalletService.allocateQuota(userId, body ?? {});
  }

  @Post("membership/team-quotas/:allocationId/spend")
  @Header("Cache-Control", "no-store, max-age=0")
  spendTeamQuota(
    @Headers("x-user-id") userId: string | undefined,
    @Param("allocationId") allocationId: string,
    @Body() body: { amountCredits?: unknown; featureLabel?: unknown },
  ) {
    return this.teamSubwalletService.spendWithinQuota(
      userId,
      allocationId,
      body ?? {},
    );
  }

  @Post("membership/team-quotas/:allocationId/revoke")
  @Header("Cache-Control", "no-store, max-age=0")
  revokeTeamQuota(
    @Headers("x-user-id") userId: string | undefined,
    @Param("allocationId") allocationId: string,
  ) {
    return this.teamSubwalletService.revokeQuota(userId, allocationId);
  }
}
