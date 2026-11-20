import { Module } from "@nestjs/common";
import { dbPool } from "../../platform/database";
import { PrivateObjectStorageModule } from "../../platform/adapters/private-object-storage/private-object-storage.module";
import { AdminProductionChangesController, AdminProductionChangesUploadGuard } from "./admin-production-changes.controller";
import { AdminProductionChangesCaptureService } from "./admin-production-changes-capture.service";
import { ADMIN_PRODUCTION_CHANGES_POOL, AdminProductionChangesRepository } from "./admin-production-changes.repository";

const privateObjectStorageModule = PrivateObjectStorageModule.fromEnvironment(process.env);
@Module({
  imports: privateObjectStorageModule ? [privateObjectStorageModule] : [],
  controllers: [AdminProductionChangesController],
  providers: [{ provide: ADMIN_PRODUCTION_CHANGES_POOL, useValue: dbPool }, AdminProductionChangesRepository, AdminProductionChangesCaptureService, AdminProductionChangesUploadGuard],
})
export class AdminProductionChangesModule {}
