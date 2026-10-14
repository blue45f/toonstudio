import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const identity = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const mutation = { mutationId: z.string().uuid() };
const versioned = { ...mutation, expectedRevision: z.number().int().nonnegative().max(2_147_483_646) };
const stageId = z.enum(["plan", "storyboard", "art"]);
const decisionValue = z.enum(["approve", "approve-with-conditions", "request-changes", "veto", "abstain"]);

export const StageGateListParamsSchema = z.object({ projectId: identity, episodeId: identity }).strict();
export const StageGateParamsSchema = z.object({ projectId: identity, episodeId: identity, stageId }).strict();
/**
 * 게이트 커맨드. 행위자·판정자·역할 필드가 스키마에 없다 — 서버가 세션
 * 행위자와 게이트의 리드 지정으로 확정한다. strict라 그런 필드를 실어
 * 보내면 요청 자체가 거부된다(행위자 위조 차단, 조직 DTO와 같은 규칙).
 * 사유·조건의 내용 검증(반려 사유 필수 등)은 contracts의
 * validateStageGateDecisionForStorage가 리포지토리에서 강제하고,
 * DB check 제약이 마지막 방어선이다.
 */
export const StageGateCommandSchema = z.discriminatedUnion("type", [
  z.object({ ...versioned, type: z.literal("assign-lead"), leadReviewerId: identity }).strict(),
  z.object({ ...versioned, type: z.literal("submit-round"), revisionRef: z.string().trim().min(1).max(320).nullable() }).strict(),
  z.object({
    ...versioned, type: z.literal("record-decision"), round: z.number().int().positive().max(50),
    value: decisionValue, reason: z.string().max(2000),
    conditions: z.array(z.string().max(300)).max(20),
    pinThreadIds: z.array(identity).max(50),
  }).strict(),
]);
export class StageGateParamsDto extends createZodDto(StageGateParamsSchema) {}
export class StageGateListParamsDto extends createZodDto(StageGateListParamsSchema) {}
export type StageGateCommand = z.infer<typeof StageGateCommandSchema>;
