import { BadRequestException } from "@nestjs/common";
import { parseBusinessPlanState, type SaveBusinessPlanRequest } from "@toonstudio/contracts/business-plan";
import { z } from "zod";

const saveEnvelope = z.object({
  expectedRevision: z.number().int().min(0).max(2_147_483_646),
  mutationId: z.string().uuid(),
  board: z.unknown(),
}).strict();

/** 전체 보드의 2MiB 한도는 공유 계약이 검사한다. Core API의 16mb 본문 한도 안에 봉투도 들어간다. */
export function parseSaveBusinessPlanRequest(value: unknown, now = new Date()): SaveBusinessPlanRequest {
  const envelope = saveEnvelope.safeParse(value);
  if (!envelope.success) {
    throw new BadRequestException({ code: "business_plan_invalid_request", message: "사업계획서 저장 요청의 버전과 요청 ID를 확인해주세요." });
  }
  const board = parseBusinessPlanState(envelope.data.board, now);
  if (!board.ok) {
    // 검증 결과에 사용자 원문을 섞어 오류 응답이나 서버 로그에 복제하지 않는다.
    throw new BadRequestException({ code: "business_plan_invalid_board", message: "사업계획서 형식·근거·날짜와 2MiB 한도를 확인해주세요." });
  }
  return { expectedRevision: envelope.data.expectedRevision, mutationId: envelope.data.mutationId, board: board.value };
}
