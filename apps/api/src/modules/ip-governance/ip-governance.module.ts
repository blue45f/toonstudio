import { Module } from "@nestjs/common";

import { IpGovernanceController } from "./ip-governance.controller";
import { IpGovernanceRepository } from "./ip-governance.repository";
import { IpGovernanceService } from "./ip-governance.service";

@Module({
  controllers: [IpGovernanceController],
  providers: [IpGovernanceRepository, IpGovernanceService],
  exports: [IpGovernanceRepository, IpGovernanceService],
})
export class IpGovernanceModule {}
