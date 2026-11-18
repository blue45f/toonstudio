import { Module } from "@nestjs/common";

import { dbPool } from "../../platform/database";
import { AdminWorkspaceController } from "./admin-workspace.controller";
import { ADMIN_WORKSPACE_POOL, AdminWorkspaceRepository } from "./admin-workspace.repository";

@Module({
  controllers: [AdminWorkspaceController],
  providers: [{ provide: ADMIN_WORKSPACE_POOL, useValue: dbPool }, AdminWorkspaceRepository],
})
export class AdminWorkspaceModule {}
