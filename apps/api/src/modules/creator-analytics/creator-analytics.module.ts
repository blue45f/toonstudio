import { Module } from "@nestjs/common";

import { CreatorAnalyticsController } from "./creator-analytics.controller";
import { creatorAnalyticsSourceRegistrationProvider } from "./creator-analytics.source-provider";

@Module({
  controllers: [CreatorAnalyticsController],
  providers: [creatorAnalyticsSourceRegistrationProvider],
})
export class CreatorAnalyticsModule {}
