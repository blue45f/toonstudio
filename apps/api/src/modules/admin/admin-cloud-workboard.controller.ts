import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  Post,
} from "@nestjs/common";
import { cloudWorkboardSaveSchema } from "@toonstudio/contracts/admin-cloud-workboard";

import { AdminCloudWorkboardRepository } from "./admin-cloud-workboard.repository";

function authenticatedActor(userId: string | undefined): string {
  if (typeof userId !== "string" || !userId.trim()) {
    throw new ForbiddenException("로그인이 필요합니다.");
  }
  return userId;
}

@Controller("admin/cloud-workboard")
export class AdminCloudWorkboardController {
  constructor(
    @Inject(AdminCloudWorkboardRepository)
    private readonly repository: Pick<AdminCloudWorkboardRepository, "read" | "save">,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store, max-age=0")
  read(@Headers("x-user-id") userId?: string) {
    return this.repository.read(authenticatedActor(userId));
  }

  @Post()
  @Header("Cache-Control", "private, no-store, max-age=0")
  save(@Body() body: unknown, @Headers("x-user-id") userId?: string) {
    const actor = authenticatedActor(userId);
    const parsed = cloudWorkboardSaveSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "cloud_workboard_invalid",
        message: "작업 보드의 형식과 근거 정보를 확인해주세요.",
      });
    }
    return this.repository.save(actor, parsed.data);
  }
}
