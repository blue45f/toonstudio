import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { expect, it } from "vitest";

import { dbPool } from "../../platform/database";
import { AdminWorkspaceController } from "./admin-workspace.controller";
import { AdminWorkspaceModule } from "./admin-workspace.module";
import { ADMIN_WORKSPACE_POOL, AdminWorkspaceRepository } from "./admin-workspace.repository";

it("관리자 보드 모듈은 전용 pool token과 명시적 생성자 주입으로 시작한다", async () => {
  const context = await NestFactory.createApplicationContext(AdminWorkspaceModule, { logger: false });
  try {
    expect(context.get(ADMIN_WORKSPACE_POOL)).toBe(dbPool);
    expect(context.get(AdminWorkspaceRepository)).toBeInstanceOf(AdminWorkspaceRepository);
    expect(context.get(AdminWorkspaceController)).toBeInstanceOf(AdminWorkspaceController);
  } finally { await context.close(); }
});
