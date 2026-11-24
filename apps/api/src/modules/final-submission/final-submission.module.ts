import { Module } from "@nestjs/common";

import { dbPool } from "../../platform/database";
import { FinalSubmissionController } from "./final-submission.controller";
import { FINAL_SUBMISSION_POOL, FinalSubmissionRepository } from "./final-submission.repository";

@Module({
  controllers: [FinalSubmissionController],
  providers: [{ provide: FINAL_SUBMISSION_POOL, useValue: dbPool }, FinalSubmissionRepository],
})
export class FinalSubmissionModule {}
