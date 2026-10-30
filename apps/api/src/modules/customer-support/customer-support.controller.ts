import { Body, Controller, Get, Header, Headers, Inject, Param, Post, Query } from "@nestjs/common";

import { CustomerSupportService } from "./customer-support.service";

@Controller()
export class CustomerSupportController {
  constructor(@Inject(CustomerSupportService) private readonly service: CustomerSupportService) {}

  @Get("support/status")
  @Header("Cache-Control", "no-store, max-age=0")
  status(@Headers("x-user-id") userId?: string) { return this.service.status(userId); }

  @Get("support/conversations")
  @Header("Cache-Control", "no-store, max-age=0")
  list(@Headers("x-user-id") userId: string | undefined, @Query() query: unknown) { return this.service.list(userId, query); }

  @Post("support/conversations")
  @Header("Cache-Control", "no-store, max-age=0")
  create(@Headers("x-user-id") userId: string | undefined, @Body() body: unknown) { return this.service.create(userId, body); }

  @Get("support/conversations/:id")
  @Header("Cache-Control", "no-store, max-age=0")
  detail(@Headers("x-user-id") userId: string | undefined, @Param("id") id: string) { return this.service.detail(userId, id); }

  @Post("support/conversations/:id/messages")
  @Header("Cache-Control", "no-store, max-age=0")
  send(@Headers("x-user-id") userId: string | undefined, @Param("id") id: string, @Body() body: unknown) { return this.service.send(userId, id, body); }

  @Post("support/conversations/:id/retry")
  @Header("Cache-Control", "no-store, max-age=0")
  retry(@Headers("x-user-id") userId: string | undefined, @Param("id") id: string) { return this.service.retry(userId, id); }

  @Post("support/conversations/:id/escalate")
  @Header("Cache-Control", "no-store, max-age=0")
  escalate(@Headers("x-user-id") userId: string | undefined, @Param("id") id: string) { return this.service.setStatus(userId, id, "waiting"); }

  @Post("support/conversations/:id/close")
  @Header("Cache-Control", "no-store, max-age=0")
  close(@Headers("x-user-id") userId: string | undefined, @Param("id") id: string) { return this.service.setStatus(userId, id, "closed"); }

  @Get("admin/support/conversations")
  @Header("Cache-Control", "no-store, max-age=0")
  adminList(@Headers("x-user-id") userId: string | undefined, @Query() query: unknown) { return this.service.list(userId, query, true); }

  @Get("admin/support/conversations/:id")
  @Header("Cache-Control", "no-store, max-age=0")
  adminDetail(@Headers("x-user-id") userId: string | undefined, @Param("id") id: string) { return this.service.detail(userId, id, true); }

  @Post("admin/support/conversations/:id/messages")
  @Header("Cache-Control", "no-store, max-age=0")
  adminSend(@Headers("x-user-id") userId: string | undefined, @Param("id") id: string, @Body() body: unknown) { return this.service.send(userId, id, body, true); }

  @Post("admin/support/conversations/:id/status")
  @Header("Cache-Control", "no-store, max-age=0")
  adminStatus(@Headers("x-user-id") userId: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    // 서비스에 원본을 전달해 누락·잘못된 상태가 조용히 성공하지 않게 한다.
    return this.service.setAdminStatus(userId, id, body);
  }
}
