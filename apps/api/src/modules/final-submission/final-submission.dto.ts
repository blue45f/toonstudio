import { BadRequestException } from "@nestjs/common";
import { parseFinalSubmissionBoard, type SaveFinalSubmissionRequest } from "@toonstudio/contracts/final-submission";
import { z } from "zod";

const saveEnvelope = z.object({
  board: z.unknown(),
  expectedRevision: z.number().int().min(0).max(2_147_483_646),
  mutationId: z.uuid(),
  summary: z.string().min(1).max(500).refine((value) => value.trim().length > 0),
}).strict();

/** 클라이언트 소유자·서버 시각·감사 이력 주입을 허용하지 않는다. */
export function parseSaveFinalSubmissionRequest(value: unknown): SaveFinalSubmissionRequest {
  const envelope = saveEnvelope.safeParse(value);
  if (!envelope.success) throw new BadRequestException({
    code: "final_submission_invalid_request",
    message: "저장 요청의 버전·요청 ID·변경 요약을 확인해 주세요.",
  });
  const board = parseFinalSubmissionBoard(envelope.data.board);
  if (!board.ok || board.value.revision !== envelope.data.expectedRevision) throw new BadRequestException({
    code: "final_submission_invalid_board",
    message: "점검 보드의 형식·근거·승인 항목과 서버 기준 버전을 확인해 주세요.",
  });
  return { ...envelope.data, board: board.value };
}
