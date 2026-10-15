import {
  Body,
  Controller,
  Inject,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";

import { createAnonymousClientLimiter } from "../auth/anonymous-client-limit";

import { BusinessInquiryService } from "./business-inquiry.service";

import type { Request } from "express";

// 로그인 없이 DB 에 쓰는 접수 경로다. 서비스의 이메일별 한도는 이메일 값을 바꾸면 우회되므로
// 클라이언트별 한도를 따로 둔다(한도 없는 행 증가 방지).
const createInquiryLimiter = createAnonymousClientLimiter({
  name: "business-inquiry-create",
  limit: 10,
  windowMs: 60 * 60_000,
});

@Controller()
export class BusinessInquiryController {
  constructor(@Inject(BusinessInquiryService) private readonly service: BusinessInquiryService) {}

  @Post("business/inquiries")
  @Header("Cache-Control", "no-store, max-age=0")
  async createInquiry(@Body() body: unknown, @Req() request?: Request) {
    if (request) createInquiryLimiter.enforce(request);
    return this.service.create(body);
  }

  @Get("admin/business-inquiries")
  @Header("Cache-Control", "no-store, max-age=0")
  async listInquiries(
    @Headers("x-user-id") userId: string | undefined,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.listForAdmin(userId ?? "", status, limit);
  }

  @Post("admin/business-inquiries/:id/status")
  @Header("Cache-Control", "no-store, max-age=0")
  async setInquiryStatus(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string,
    @Body() body: { status?: unknown },
  ) {
    return this.service.setStatus(userId ?? "", id, body?.status);
  }
}
