import { Module } from "@nestjs/common";
import { dbPool } from "../../platform/database";
import { StudioVirtualSpaceAccessController } from "./studio-virtual-space-access.controller";
import { STUDIO_SPACE_ACCESS_POOL, StudioVirtualSpaceAccessRepository } from "./studio-virtual-space-access.repository";

@Module({
  controllers: [StudioVirtualSpaceAccessController],
  providers: [
    { provide: STUDIO_SPACE_ACCESS_POOL, useValue: dbPool },
    StudioVirtualSpaceAccessRepository,
  ],
})
export class StudioVirtualSpaceAccessModule {}
