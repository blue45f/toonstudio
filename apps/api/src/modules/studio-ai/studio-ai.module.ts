import { Module } from "@nestjs/common";
import { CreatorInferenceController, CreatorInferenceGateway } from "./creator-inference.controller";

import { Studio3dGenerationController } from "./studio-3d-generation.controller";
import { Studio3dGenerationService } from "./studio-3d-generation.service";
import { StudioMediaInferenceController } from "./studio-media-inference.controller";
import { StudioMediaInferenceService } from "./studio-media-inference.service";
import { studioAiAdmissionSchemaPreflightProvider } from "./studio-ai-admission-schema-preflight";
import { studioAiAdmissionRepositoryProvider } from "./studio-ai-admission.repository";
import { StudioAiComicDirectorController } from "./studio-ai-comic-director.controller";
import {
  STUDIO_AI_COMIC_DIRECTOR_REPOSITORY,
  PostgresStudioAiComicDirectorRepository,
} from "./studio-ai-comic-director.repository";
import { studioAiComicDirectorSchemaPreflightProvider } from "./studio-ai-comic-director-schema-preflight";
import { StudioAiComicDirectorService } from "./studio-ai-comic-director.service";
import { studioAiIdempotencySchemaPreflightProvider } from "./studio-ai-idempotency-schema-preflight";
import { STUDIO_AI_USAGE_STORE } from "./studio-ai-usage";
import { PostgresStudioAiUsageStore } from "./studio-ai-usage.repository";
import { MembershipWalletModule } from "../membership-wallet/membership-wallet.module";
import { MembershipWalletService } from "../membership-wallet/membership-wallet.service";
import { STUDIO_AI_CREDIT_WALLET } from "./studio-ai-credit-charge";
import { StudioAiController } from "./studio-ai.controller";
import { StudioAiService } from "./studio-ai.service";

@Module({
  imports: [MembershipWalletModule],
  controllers: [
    CreatorInferenceController,
    StudioAiController,
    StudioAiComicDirectorController,
    Studio3dGenerationController,
    StudioMediaInferenceController,
  ],
  providers: [
    CreatorInferenceGateway,
    {
      provide: STUDIO_AI_CREDIT_WALLET,
      useExisting: MembershipWalletService,
    },
    studioAiAdmissionRepositoryProvider,
    studioAiAdmissionSchemaPreflightProvider,
    studioAiIdempotencySchemaPreflightProvider,
    studioAiComicDirectorSchemaPreflightProvider,
    StudioAiService,
    StudioAiComicDirectorService,
    Studio3dGenerationService,
    StudioMediaInferenceService,
    {
      provide: STUDIO_AI_COMIC_DIRECTOR_REPOSITORY,
      useFactory: () => new PostgresStudioAiComicDirectorRepository(),
    },
    {
      provide: STUDIO_AI_USAGE_STORE,
      useFactory: () => new PostgresStudioAiUsageStore(),
    },
  ],
})
export class StudioAiModule {}
