import { Module } from "@nestjs/common";
import { dbPool } from "../../platform/database";
import { PrivateObjectStorageModule } from "../../platform/adapters/private-object-storage/private-object-storage.module";
import { TeamWorkspaceController } from "./team-workspace.controller";
import { PRODUCTION_TEAM_POOL, TeamWorkspaceRepository } from "./team-workspace.repository";
import { ProductionCollaborationController } from "./production-collaboration.controller";
import { ProductionIntegrationController } from "./production-integration.controller";
import { ProductionCollaborationRepository } from "./production-collaboration.repository";
import { ProductionIntegrationRepository } from "./production-integration.repository";
import { ProductionCollaborationService } from "./production-collaboration.service";
import { ProductionIntegrationService } from "./production-integration.service";
import { PresenceController } from "./presence.controller";
import { PresenceService } from "./presence.service";
import { ProductionVoiceCommentaryController } from "./production-voice-commentary.controller";
import { ProductionVoiceCommentaryRepository } from "./production-voice-commentary.repository";
import { ProductionVoiceCommentaryService } from "./production-voice-commentary.service";
import { ProductionDivisionOsController } from "./production-division-os.controller";
import { ProductionDivisionOsRepository } from "./production-division-os.repository";
import { ProductionDivisionOsService } from "./production-division-os.service";

const privateObjectStorageModule = PrivateObjectStorageModule.fromEnvironment(process.env);

@Module({
  imports: [...(privateObjectStorageModule ? [privateObjectStorageModule] : [])],
  controllers: [
    ProductionCollaborationController,
    ProductionIntegrationController,
    TeamWorkspaceController,
    PresenceController,
    ProductionVoiceCommentaryController,
    ProductionDivisionOsController,
  ],
  providers: [
    { provide: PRODUCTION_TEAM_POOL, useValue: dbPool },
    PresenceService,
    TeamWorkspaceRepository,
    ProductionCollaborationRepository,
    ProductionCollaborationService,
    ProductionIntegrationRepository,
    ProductionIntegrationService,
    ProductionVoiceCommentaryRepository,
    ProductionVoiceCommentaryService,
    ProductionDivisionOsRepository,
    ProductionDivisionOsService,
  ],
  exports: [ProductionCollaborationService, ProductionDivisionOsService],
})
export class ProductionCollaborationModule {}
