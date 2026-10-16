import { Module } from "@nestjs/common";

import { isAdminUser } from "../../server/app-config";
import { ProductionCollaborationModule } from "../production-collaboration/production-collaboration.module";
import { IntegrationPlatformController } from "./integration-platform.controller";
import { IntegrationPlatformService } from "./integration-platform.service";
import {
  createIntegrationRuntimeAccessPolicy,
  INTEGRATION_RUNTIME_ACCESS_POLICY,
} from "./integration-runtime.access";
import { IntegrationRuntimeController } from "./integration-runtime.controller";
import { IntegrationRuntimeProviderEngine } from "./integration-runtime.providers";
import {
  INTEGRATION_RUNTIME_DAILY_LIMIT,
  IntegrationRuntimeRepository,
  resolveIntegrationRuntimeDailyLimit,
} from "./integration-runtime.repository";
import {
  INTEGRATION_RUNTIME_ENGINE,
  IntegrationRuntimeService,
} from "./integration-runtime.service";

@Module({
  imports: [ProductionCollaborationModule],
  controllers: [IntegrationPlatformController, IntegrationRuntimeController],
  providers: [
    IntegrationPlatformService,
    {
      provide: INTEGRATION_RUNTIME_DAILY_LIMIT,
      useFactory: () => resolveIntegrationRuntimeDailyLimit(),
    },
    IntegrationRuntimeRepository,
    IntegrationRuntimeService,
    {
      provide: INTEGRATION_RUNTIME_ENGINE,
      useFactory: () => new IntegrationRuntimeProviderEngine(),
    },
    {
      provide: INTEGRATION_RUNTIME_ACCESS_POLICY,
      useFactory: () => createIntegrationRuntimeAccessPolicy(process.env, isAdminUser),
    },
  ],
  exports: [IntegrationPlatformService, IntegrationRuntimeService],
})
export class IntegrationPlatformModule {}
