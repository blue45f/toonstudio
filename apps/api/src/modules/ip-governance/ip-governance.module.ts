import { Module } from "@nestjs/common";

import { IpGovernanceNotificationService } from "./ip-governance-notification.service";
import { IpGovernanceController } from "./ip-governance.controller";
import { IpGovernanceOperatorGuard } from "./ip-governance.guard";
import { IpGovernanceRepository } from "./ip-governance.repository";
import { IpGovernanceService } from "./ip-governance.service";

@Module({
  controllers: [IpGovernanceController],
  providers: [
    IpGovernanceRepository,
    IpGovernanceNotificationService,
    IpGovernanceOperatorGuard,
    IpGovernanceService,
  ],
  exports: [
    IpGovernanceRepository,
    IpGovernanceNotificationService,
    IpGovernanceService,
  ],
})
export class IpGovernanceModule {}
