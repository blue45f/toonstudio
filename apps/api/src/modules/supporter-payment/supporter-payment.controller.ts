import {
  Body,
  Controller,
  Inject,
  Get,
  Header,
  Headers,
  Param,
  Post,
  UseGuards,
  Query,
  Req,
} from "@nestjs/common";
import { AdminMutationGuard } from "../admin/admin-mutation.guard";

import { createAnonymousClientLimiter } from "../auth/anonymous-client-limit";

import { SupporterPaymentService } from "./supporter-payment.service";

import type { Request } from "express";

// 로그인 없이 DB 에 주문 행을 만드는 경로다. 서비스의 한도는 모든 클라이언트가 함께 쓰는 전역
// 한도라서 한 클라이언트가 채우면 다른 후원자가 막히므로, 그보다 훨씬 낮은 클라이언트별 한도를 둔다.
const createOrderLimiter = createAnonymousClientLimiter({
  name: "supporter-payment-create-order",
  limit: 10,
  windowMs: 10 * 60_000,
});

@Controller()
export class SupporterPaymentController {
  constructor(@Inject(SupporterPaymentService) private readonly service: SupporterPaymentService) {}

  @Get("supporter-payments/config")
  @Header("Cache-Control", "no-store, max-age=0")
  getConfig() {
    return this.service.getPublicConfig();
  }

  @Get("supporter-payments/funding")
  @Header("Cache-Control", "no-store, max-age=0")
  async getFundingSummary() {
    return this.service.getPublicFundingSummary();
  }

  @Get("supporter-payments/supporters")
  @Header("Cache-Control", "no-store, max-age=0")
  async listPublicSupporters(@Query("limit") limit?: string) {
    return this.service.listPublicSupporters(limit);
  }
  @Get("supporter-payments/orders/:orderId")
  @Header("Cache-Control", "no-store, max-age=0")
  async getOrderStatus(@Param("orderId") orderId: string) {
    return this.service.getOrderStatus(orderId);
  }

  @Post("supporter-payments/orders")
  @Header("Cache-Control", "no-store, max-age=0")
  async createOrder(@Body() body: unknown, @Req() request?: Request) {
    if (request) createOrderLimiter.enforce(request);
    return this.service.createOrder(body);
  }

  @Post("supporter-payments/confirm")
  @Header("Cache-Control", "no-store, max-age=0")
  async confirm(@Body() body: unknown) {
    return this.service.confirm(body);
  }

  @Post("supporter-payments/webhooks/toss")
  @Header("Cache-Control", "no-store, max-age=0")
  async receiveTossWebhook(@Body() body: unknown) {
    return this.service.receiveTossWebhook(body);
  }

  @Get("admin/supporter-payments")
  @Header("Cache-Control", "no-store, max-age=0")
  async listForAdmin(
    @Headers("x-user-id") userId: string | undefined,
    @Query("status") status?: string,
    @Query("mode") mode?: string,
    @Query("q") query?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.listForAdmin(userId ?? "", status, mode, query, limit);
  }

  @Get("admin/supporter-payments/settings")
  @Header("Cache-Control", "no-store, max-age=0")
  async getSettingsForAdmin(@Headers("x-user-id") userId: string | undefined) {
    return this.service.getSettingsForAdmin(userId ?? "");
  }

  // 운영비 후원 설정은 전역 변경이라 운영자가 아니라 관리자만 바꾼다(AdminMutationGuard 정책).
  @Post("admin/supporter-payments/settings")
  @UseGuards(AdminMutationGuard)
  @Header("Cache-Control", "no-store, max-age=0")
  async updateSettingsForAdmin(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.updateSettingsForAdmin(userId ?? "", body);
  }

  @Post("admin/supporter-payments/:id/public-visibility")
  @Header("Cache-Control", "no-store, max-age=0")
  async setPublicVisibilityForAdmin(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string,
    @Body() body: { hidden?: unknown },
  ) {
    return this.service.setPublicVisibilityForAdmin(
      userId ?? "",
      id,
      body?.hidden,
    );
  }

  @Post("admin/supporter-payments/:id/resync")
  @Header("Cache-Control", "no-store, max-age=0")
  async resyncForAdmin(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string,
  ) {
    return this.service.resyncForAdmin(userId ?? "", id);
  }

  // 전액 취소는 Toss 환불 호출을 일으키는 금융 변경이라 운영자가 아니라 관리자만 실행한다.
  @Post("admin/supporter-payments/:id/cancel")
  @UseGuards(AdminMutationGuard)
  @Header("Cache-Control", "no-store, max-age=0")
  async cancelForAdmin(
    @Headers("x-user-id") userId: string | undefined,
    @Param("id") id: string,
    @Body() body: { reason?: unknown },
  ) {
    return this.service.cancelForAdmin(userId ?? "", id, body?.reason);
  }
}
