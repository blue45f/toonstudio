import { Module } from "@nestjs/common";

import { StudioFreeAiZeroBillRouter } from "../studio-ai/studio-free-ai-zero-bill-router";

import { CustomerSupportAiService } from "./customer-support-ai.service";
import { CustomerSupportChatService } from "./customer-support-chat.service";
import { CustomerSupportController } from "./customer-support.controller";
import { customerSupportRepositoryProvider } from "./customer-support.repository";
import { CustomerSupportService } from "./customer-support.service";

@Module({
  controllers: [CustomerSupportController],
  providers: [
    customerSupportRepositoryProvider,
    CustomerSupportAiService,
    CustomerSupportService,
    StudioFreeAiZeroBillRouter,
    CustomerSupportChatService,
  ],
})
export class CustomerSupportModule {}
