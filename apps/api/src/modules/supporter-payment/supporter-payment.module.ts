import { Module } from "@nestjs/common";

import { AdminMutationGuard } from "../admin/admin-mutation.guard";

import { SupporterPaymentController } from "./supporter-payment.controller";
import { SupporterPaymentService } from "./supporter-payment.service";

@Module({
  controllers: [SupporterPaymentController],
  providers: [SupporterPaymentService, AdminMutationGuard],
})
export class SupporterPaymentModule {}
