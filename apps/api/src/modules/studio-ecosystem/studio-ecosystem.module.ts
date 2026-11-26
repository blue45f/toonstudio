import { Module } from "@nestjs/common";

import { HandoffProofAndGuestController } from "./handoff-proof-and-guest.controller";
import { HandoffProofAndGuestService } from "./handoff-proof-and-guest.service";
import { PlazaHandoffOpsController } from "./plaza-handoff-ops.controller";
import { PlazaHandoffOpsService } from "./plaza-handoff-ops.service";
import { StudioEcosystemController } from "./studio-ecosystem.controller";
import { StudioEcosystemEventsService } from "./studio-ecosystem-events.service";
import { StudioEcosystemService } from "./studio-ecosystem.service";

@Module({
  controllers: [
    StudioEcosystemController,
    PlazaHandoffOpsController,
    HandoffProofAndGuestController,
  ],
  providers: [
    StudioEcosystemEventsService,
    StudioEcosystemService,
    PlazaHandoffOpsService,
    HandoffProofAndGuestService,
  ],
  exports: [
    StudioEcosystemService,
    StudioEcosystemEventsService,
    PlazaHandoffOpsService,
    HandoffProofAndGuestService,
  ],
})
export class StudioEcosystemModule {}
