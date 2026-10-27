/**
 * research.module.ts — 리서치 모듈 배선.
 * MembershipWalletModule을 import해 지갑 서비스를 주입받으며,
 * 검색 프로바이더는 환경변수에서 팩토리로 만든다 (키 없으면 null →
 * 서비스가 503으로 기능을 비활성화 상태로 보고한다).
 * 프로바이더 이름도 환경변수에서 해석해 status 응답에 쓴다.
 */
import { Module } from "@nestjs/common";

import { MembershipWalletModule } from "../membership-wallet/membership-wallet.module";
import {
  RESEARCH_SEARCH_PROVIDER,
  createSearchProviderFromEnv,
} from "./search-provider-factory";
import {
  RESEARCH_SEARCH_PROVIDER_NAME,
  resolveSearchProviderName,
} from "./search-provider-config";
import { RESEARCH_CREDIT_PRICING, ResearchService } from "./research.service";
import { resolveResearchCreditPricing } from "./research-credit-meter";
import { ResearchController } from "./research.controller";

@Module({
  imports: [MembershipWalletModule],
  controllers: [ResearchController],
  providers: [
    {
      provide: RESEARCH_SEARCH_PROVIDER,
      useFactory: () => createSearchProviderFromEnv(process.env),
    },
    {
      provide: RESEARCH_SEARCH_PROVIDER_NAME,
      useFactory: () => resolveSearchProviderName(process.env),
    },
    {
      provide: RESEARCH_CREDIT_PRICING,
      useFactory: () => resolveResearchCreditPricing(process.env),
    },
    ResearchService,
  ],
})
export class ResearchModule {}
