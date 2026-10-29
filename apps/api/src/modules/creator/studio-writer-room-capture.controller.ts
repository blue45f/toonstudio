import { Controller, ForbiddenException, Get, Header, Headers, Inject, Param, Query } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { StudioWriterRoomCaptureRequestSchema } from "@toonstudio/contracts/studio-writer-room";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { StudioWriterRoomCaptureRepository } from "./studio-writer-room-capture.repository";

const subject = StudioWriterRoomCaptureRequestSchema.shape.subject;
class CaptureParams extends createZodDto(z.object({ id: subject.shape.workId, reviewId: subject.shape.reviewId }).strict()) {}
class CaptureQuery extends createZodDto(subject.omit({ schemaVersion: true, workId: true, reviewId: true }).extend({
  productionProjectId: StudioWriterRoomCaptureRequestSchema.shape.productionProjectId,
  submissionId: StudioWriterRoomCaptureRequestSchema.shape.submissionId,
}).strict()) {}

@Controller()
export class StudioWriterRoomCaptureController {
  constructor(@Inject(StudioWriterRoomCaptureRepository) private readonly repository: StudioWriterRoomCaptureRepository) {}
  @Get("/creator/works/:id/writer-room-captures/:reviewId")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Referrer-Policy", "no-referrer")
  read(@Param(new ZodValidationPipe(CaptureParams)) params: CaptureParams,
    @Query(new ZodValidationPipe(CaptureQuery)) query: CaptureQuery, @Headers("x-user-id") actor?: string) {
    if (!actor) throw new ForbiddenException("로그인이 필요합니다.");
    const { productionProjectId, submissionId, ...pin } = query;
    return this.repository.read(actor, { productionProjectId, submissionId, subject: { schemaVersion: 1, workId: params.id, reviewId: params.reviewId, ...pin } });
  }
}
