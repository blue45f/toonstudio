import { Module } from "@nestjs/common";

import { StudioEcosystemController } from "./studio-ecosystem.controller";
import { StudioEcosystemEventsService } from "./studio-ecosystem-events.service";
import { StudioEcosystemService } from "./studio-ecosystem.service";

@Module({
  controllers: [StudioEcosystemController],
  providers: [StudioEcosystemEventsService, StudioEcosystemService],
  exports: [StudioEcosystemService, StudioEcosystemEventsService],
})
export class StudioEcosystemModule {}
