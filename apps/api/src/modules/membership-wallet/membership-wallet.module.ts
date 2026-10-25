import { Module } from "@nestjs/common";

import { AdminMutationGuard } from "../admin/admin-mutation.guard";

import { CreditSpendController } from "./credit-spend.controller";
import { CreditSpendService } from "./credit-spend.service";
import { MembershipWalletController } from "./membership-wallet.controller";
import {
  InMemoryPaidOperationsSettingStore,
  PAID_OPERATIONS_SETTING_STORE,
} from "./paid-operations-gate";
import { MembershipWalletService } from "./membership-wallet.service";
import { PaidOperationsAdminService } from "./paid-operations-admin.service";
import { MEMBERSHIP_REWARD_SERVICE } from "./membership-wallet.tokens";

@Module({
  controllers: [MembershipWalletController, CreditSpendController],
  providers: [
    MembershipWalletService,
    CreditSpendService,
    PaidOperationsAdminService,
    {
      provide: MEMBERSHIP_REWARD_SERVICE,
      useExisting: MembershipWalletService,
    },
    // 유료 운영 마스터 스위치 스토어 (이 단계는 프로세스 메모리 구현 —
    // 재시작 시 미설정(false)으로 초기화되는 fail-closed 동작이며,
    // 영속 저장소 연결은 후속 과제이다. 어드민 변경 API는 이 토큰으로
    // 같은 인스턴스를 주입받아 공유한다).
    {
      provide: PAID_OPERATIONS_SETTING_STORE,
      useClass: InMemoryPaidOperationsSettingStore,
    },
    AdminMutationGuard,
  ],
  exports: [
    MembershipWalletService,
    PaidOperationsAdminService,
    MEMBERSHIP_REWARD_SERVICE,
    PAID_OPERATIONS_SETTING_STORE,
  ],
})
export class MembershipWalletModule {}
