/**
 * research.module.ts — DeepSeek 리서치 모듈 배선.
 * MembershipWalletModule을 import해 지갑 서비스를 주입받으며,
 * DeepSeek 클라이언트는 환경변수에서 팩토리로 만든다 (키 없으면 null →
 * 서비스가 503으로 기능을 비활성화 상태로 보고한다).
 */
import { Module } from "@nestjs/common";

import { MembershipWalletModule } from "../membership-wallet/membership-wallet.module";
import {
  RESEARCH_DEEPSEEK_CLIENT,
  createDeepSeekSearchClientFromEnv,
} from "./deepseek-search-client";
import { RESEARCH_CREDIT_PRICING, ResearchService } from "./research.service";
import { resolveResearchCreditPricing } from "./research-credit-meter";
import { ResearchController } from "./research.controller";

@Module({
  imports: [MembershipWalletModule],
  controllers: [ResearchController],
  providers: [
    {
      provide: RESEARCH_DEEPSEEK_CLIENT,
      useFactory: () => createDeepSeekSearchClientFromEnv(process.env),
    },
    {
      provide: RESEARCH_CREDIT_PRICING,
      useFactory: () => resolveResearchCreditPricing(process.env),
    },
    ResearchService,
  ],
})
export class ResearchModule {}
