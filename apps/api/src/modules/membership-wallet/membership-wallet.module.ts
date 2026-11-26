import { Module } from "@nestjs/common";

import { AdminMutationGuard } from "../admin/admin-mutation.guard";

import { AppSettingPaidOperationsStore } from "./app-setting-paid-operations.store";
import { CreditBillingModeController } from "./credit-billing-mode.controller";
import {
  CreditBillingModeService,
  MembershipRewardDispatcherService,
} from "./credit-billing-mode.service";
import { CreditSpendController } from "./credit-spend.controller";
import { CreditSpendService } from "./credit-spend.service";
import { MarketplaceCreditPaymentController } from "./marketplace-credit-payment.controller";
import { MarketplaceCreditPaymentService } from "./marketplace-credit-payment.service";
import { MembershipWalletController } from "./membership-wallet.controller";
import { StudioDecorationCreditPurchaseController } from "./studio-decoration-credit-purchase.controller";
import { StudioDecorationCreditPurchaseService } from "./studio-decoration-credit-purchase.service";
import { PAID_OPERATIONS_SETTING_STORE } from "./paid-operations-gate";
import { MembershipWalletService } from "./membership-wallet.service";
import { PaidOperationsAdminService } from "./paid-operations-admin.service";
import { MEMBERSHIP_REWARD_SERVICE } from "./membership-wallet.tokens";

@Module({
  controllers: [
    MembershipWalletController,
    CreditBillingModeController,
    CreditSpendController,
    MarketplaceCreditPaymentController,
    StudioDecorationCreditPurchaseController,
  ],
  providers: [
    MembershipWalletService,
    CreditBillingModeService,
    MembershipRewardDispatcherService,
    CreditSpendService,
    MarketplaceCreditPaymentService,
    StudioDecorationCreditPurchaseService,
    PaidOperationsAdminService,
    {
      provide: MEMBERSHIP_REWARD_SERVICE,
      useExisting: MembershipRewardDispatcherService,
    },
    {
      provide: PAID_OPERATIONS_SETTING_STORE,
      useClass: AppSettingPaidOperationsStore,
    },
    AdminMutationGuard,
  ],
  exports: [
    MembershipWalletService,
    CreditBillingModeService,
    MarketplaceCreditPaymentService,
    StudioDecorationCreditPurchaseService,
    PaidOperationsAdminService,
    MEMBERSHIP_REWARD_SERVICE,
    PAID_OPERATIONS_SETTING_STORE,
  ],
})
export class MembershipWalletModule {}
