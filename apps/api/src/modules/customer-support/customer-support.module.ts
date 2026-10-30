import { Module } from "@nestjs/common";

import { CustomerSupportAiService } from "./customer-support-ai.service";
import { CustomerSupportController } from "./customer-support.controller";
import { customerSupportRepositoryProvider } from "./customer-support.repository";
import { CustomerSupportService } from "./customer-support.service";

@Module({
  controllers: [CustomerSupportController],
  providers: [customerSupportRepositoryProvider, CustomerSupportAiService, CustomerSupportService],
})
export class CustomerSupportModule {}
