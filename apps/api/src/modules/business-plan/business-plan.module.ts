import { Module } from "@nestjs/common";
import { dbPool } from "../../platform/database";
import { BusinessPlanController } from "./business-plan.controller";
import { BUSINESS_PLAN_POOL, BusinessPlanRepository } from "./business-plan.repository";

@Module({
  controllers: [BusinessPlanController],
  providers: [{ provide: BUSINESS_PLAN_POOL, useValue: dbPool }, BusinessPlanRepository],
})
export class BusinessPlanModule {}
