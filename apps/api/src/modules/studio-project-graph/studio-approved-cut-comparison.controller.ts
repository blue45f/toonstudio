import { Body, Controller, Header, Headers, HttpCode, Post } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { dbPool } from "../../platform/database";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { readApprovedCutChanges } from "./studio-approved-cut-comparison";
import { authenticatedStudioUserId } from "./studio-project-graph.controller";
import { studioReviewCaptureSubjectSchema } from "./studio-review-capture-subject";

class CompareApprovedCutsDto extends createZodDto(z.object({
  approved: studioReviewCaptureSubjectSchema,
  current: studioReviewCaptureSubjectSchema,
}).strict()) {}

@Controller("/studio-project-graph")
export class StudioApprovedCutComparisonController {
  @Post("approved-cut-changes")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  compare(@Body(new ZodValidationPipe(CompareApprovedCutsDto)) request: CompareApprovedCutsDto,
    @Headers("x-user-id") userId?: string) {
    return readApprovedCutChanges(dbPool, authenticatedStudioUserId(userId), request.approved, request.current);
  }
}
