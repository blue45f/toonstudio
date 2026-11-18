import { Module } from "@nestjs/common";
import { dbPool } from "../../platform/database";
import { AdminNestjsQualityController } from "./admin-nestjs-quality.controller";
import { ADMIN_NESTJS_QUALITY_POOL, AdminNestjsQualityRepository } from "./admin-nestjs-quality.repository";

@Module({
  controllers: [AdminNestjsQualityController],
  providers: [
    { provide: ADMIN_NESTJS_QUALITY_POOL, useValue: dbPool },
    AdminNestjsQualityRepository,
  ],
})
export class AdminNestjsQualityModule {}
