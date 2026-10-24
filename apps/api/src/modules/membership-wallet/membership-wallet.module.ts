import { Module } from "@nestjs/common";

import { AdminMutationGuard } from "../admin/admin-mutation.guard";

import { CreditSpendController } from "./credit-spend.controller";
import { CreditSpendService } from "./credit-spend.service";
import { MembershipWalletController } from "./membership-wallet.controller";
import { MembershipWalletService } from "./membership-wallet.service";
import { MEMBERSHIP_REWARD_SERVICE } from "./membership-wallet.tokens";

@Module({
  controllers: [MembershipWalletController, CreditSpendController],
  providers: [
    MembershipWalletService,
    CreditSpendService,
    {
      provide: MEMBERSHIP_REWARD_SERVICE,
      useExisting: MembershipWalletService,
    },
    AdminMutationGuard,
  ],
  exports: [MembershipWalletService, MEMBERSHIP_REWARD_SERVICE],
})
export class MembershipWalletModule {}
