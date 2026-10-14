import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const identity = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const mutation = { mutationId: z.string().uuid() };
const versioned = { ...mutation, expectedRevision: z.number().int().nonnegative().max(2_147_483_646) };
const role = z.enum(["admin", "member", "guest"]);
export const WorkspaceCreateSchema = z.object({ ...mutation, name: z.string().trim().min(1).max(20) }).strict();
export const WorkspaceCommandSchema = z.discriminatedUnion("type", [
  z.object({ ...versioned, type: z.literal("rename"), name: z.string().trim().min(1).max(20) }).strict(),
  z.object({ ...versioned, type: z.literal("invite"), email: z.string().trim().toLowerCase().email().max(320), role }).strict(),
  z.object({ ...versioned, type: z.literal("revoke-invite"), invitationId: identity }).strict(),
  z.object({ ...versioned, type: z.literal("change-member-role"), userId: identity, role }).strict(),
  z.object({ ...versioned, type: z.literal("remove-member"), userId: identity }).strict(),
  z.object({ ...versioned, type: z.literal("transfer-owner"), userId: identity }).strict(),
  z.object({ ...versioned, type: z.literal("transfer-work-owner"), projectId: identity, userId: identity }).strict(),
  z.object({ ...versioned, type: z.literal("attach-project"), projectId: identity }).strict(),
  z.object({ ...versioned, type: z.literal("detach-project"), projectId: identity }).strict(),
]);
export const WorkspaceParamsSchema = z.object({ workspaceId: identity }).strict();
export const TEAM_WORKSPACE_AUDIT_ACTIONS = [
  "workspace.created", "workspace.rename", "workspace.invite", "workspace.revoke-invite",
  "workspace.change-member-role", "workspace.remove-member", "workspace.transfer-owner",
  "workspace.attach-project", "workspace.detach-project", "workspace.invite-accepted",
] as const;
/**
 * 감사 로그 조회 쿼리. 쿼리스트링은 전부 문자열로 오므로 cursor·limit은 coerce로 받는다.
 * from/to는 ISO 8601 오프셋 포함 시각이며 [from, to) 반열린 구간으로 해석한다.
 * 알 수 없는 키는 strict로 거부해 오타 필터가 조용히 무시되지 않게 한다.
 */
export const WorkspaceAuditQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  actorUserId: identity.optional(),
  action: z.enum(TEAM_WORKSPACE_AUDIT_ACTIONS).optional(),
  cursor: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict().refine((value) => !value.from || !value.to || value.from < value.to, {
  message: "조회 기간의 시작은 종료보다 앞서야 합니다.",
});
export const WorkspaceAcceptSchema = z.object({
  ...mutation, token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
}).strict();
/** 미리보기는 읽기 전용이라 mutationId가 없다. 토큰은 URL이 아닌 본문으로만 받는다. */
export const WorkspaceInvitePreviewSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
}).strict();
export class CreateTeamWorkspaceDto extends createZodDto(WorkspaceCreateSchema) {}
export class TeamWorkspaceParamsDto extends createZodDto(WorkspaceParamsSchema) {}
export class TeamWorkspaceAuditQueryDto extends createZodDto(WorkspaceAuditQuerySchema) {}
export type TeamWorkspaceAuditQueryInput = z.infer<typeof WorkspaceAuditQuerySchema>;
export class AcceptTeamWorkspaceDto extends createZodDto(WorkspaceAcceptSchema) {}
export class PreviewTeamWorkspaceInviteDto extends createZodDto(WorkspaceInvitePreviewSchema) {}
export type WorkspaceCommand = z.infer<typeof WorkspaceCommandSchema>;
