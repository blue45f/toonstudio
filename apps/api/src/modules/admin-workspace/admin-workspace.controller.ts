import { Body, Controller, ForbiddenException, Get, Header, Headers, Inject, Post } from "@nestjs/common";

import { requireAdminWorkspaceSave } from "./admin-workspace.dto";
import { AdminWorkspaceRepository } from "./admin-workspace.repository";

function requireActor(value: string | undefined): string {
  if (typeof value !== "string" || !value.trim() || value.length > 256) {
    throw new ForbiddenException("로그인이 필요합니다.");
  }
  return value;
}

/** 기록 저장 전용이다. 코드·CI·계정·제출·배포를 실행하는 경로는 제공하지 않는다. */
@Controller("admin/workspaces/toonstudio")
export class AdminWorkspaceController {
  constructor(@Inject(AdminWorkspaceRepository) private readonly repository: AdminWorkspaceRepository) {}

  @Get()
  @Header("Cache-Control", "private, no-store, max-age=0")
  read(@Headers("x-user-id") userId?: string) {
    return this.repository.read(requireActor(userId));
  }

  @Post("save")
  @Header("Cache-Control", "private, no-store, max-age=0")
  save(@Body() body: unknown, @Headers("x-user-id") userId?: string) {
    const actor = requireActor(userId);
    return this.repository.save(actor, requireAdminWorkspaceSave(body));
  }
}
