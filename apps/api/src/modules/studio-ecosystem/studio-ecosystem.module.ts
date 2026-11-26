import { Module } from "@nestjs/common";

import { PlazaHandoffOpsController } from "./plaza-handoff-ops.controller";
import { PlazaHandoffOpsService } from "./plaza-handoff-ops.service";
import { StudioEcosystemController } from "./studio-ecosystem.controller";
import { StudioEcosystemEventsService } from "./studio-ecosystem-events.service";
import { StudioEcosystemService } from "./studio-ecosystem.service";

@Module({
  controllers: [StudioEcosystemController, PlazaHandoffOpsController],
  providers: [
    StudioEcosystemEventsService,
    StudioEcosystemService,
    PlazaHandoffOpsService,
  ],
  exports: [
    StudioEcosystemService,
    StudioEcosystemEventsService,
    PlazaHandoffOpsService,
  ],
})
export class StudioEcosystemModule {}
