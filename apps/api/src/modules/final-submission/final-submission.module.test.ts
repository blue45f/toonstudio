import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { expect, it } from "vitest";

import { dbPool } from "../../platform/database";
import { FinalSubmissionController } from "./final-submission.controller";
import { FinalSubmissionModule } from "./final-submission.module";
import { FINAL_SUBMISSION_POOL, FinalSubmissionRepository } from "./final-submission.repository";

it("전용 최종 제출 모듈은 기존 DB pool을 주입하고 시작 시 DB를 변경하지 않는다", async () => {
  const context = await NestFactory.createApplicationContext(FinalSubmissionModule, { logger: false });
  try {
    expect(context.get(FINAL_SUBMISSION_POOL)).toBe(dbPool);
    expect(context.get(FinalSubmissionRepository)).toBeInstanceOf(FinalSubmissionRepository);
    expect(context.get(FinalSubmissionController)).toBeInstanceOf(FinalSubmissionController);
  } finally { await context.close(); }
});
