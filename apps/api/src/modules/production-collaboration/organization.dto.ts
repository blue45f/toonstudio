import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const identity = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const mutation = { mutationId: z.string().uuid() };
const versioned = { ...mutation, expectedRevision: z.number().int().nonnegative().max(2_147_483_646) };
const invitableRole = z.enum(["admin", "manager", "member", "guest"]);
const kind = z.enum(["company", "studio", "team-circle"]);
const profile = {
  name: z.string().trim().min(1).max(40),
  kind,
  description: z.string().trim().max(200),
};
export const OrganizationCreateSchema = z.object({ ...mutation, ...profile }).strict();
export const OrganizationCommandSchema = z.discriminatedUnion("type", [
  z.object({ ...versioned, type: z.literal("update-profile"), ...profile }).strict(),
  z.object({ ...versioned, type: z.literal("link-workspace"), workspaceId: identity }).strict(),
  z.object({ ...versioned, type: z.literal("unlink-workspace"), workspaceId: identity }).strict(),
  z.object({ ...versioned, type: z.literal("post-notice"), body: z.string().trim().min(1).max(300) }).strict(),
  z.object({ ...versioned, type: z.literal("delete-notice"), noticeId: identity }).strict(),
  z.object({ ...versioned, type: z.literal("invite"), email: z.string().trim().toLowerCase().email().max(320), role: invitableRole }).strict(),
  z.object({ ...versioned, type: z.literal("revoke-invite"), invitationId: identity }).strict(),
  z.object({ ...versioned, type: z.literal("change-member-role"), userId: identity, role: invitableRole }).strict(),
  z.object({ ...versioned, type: z.literal("remove-member"), userId: identity }).strict(),
  z.object({ ...versioned, type: z.literal("transfer-owner"), userId: identity }).strict(),
]);
export const OrganizationParamsSchema = z.object({ organizationId: identity }).strict();
export const OrganizationAcceptSchema = z.object({
  ...mutation, token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
}).strict();
/** 미리보기는 읽기 전용이라 mutationId가 없다. 토큰은 URL이 아닌 본문으로만 받는다. */
export const OrganizationInvitePreviewSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
}).strict();
export class CreateOrganizationDto extends createZodDto(OrganizationCreateSchema) {}
export class OrganizationParamsDto extends createZodDto(OrganizationParamsSchema) {}
export class AcceptOrganizationDto extends createZodDto(OrganizationAcceptSchema) {}
export class PreviewOrganizationInviteDto extends createZodDto(OrganizationInvitePreviewSchema) {}
export type OrganizationCommand = z.infer<typeof OrganizationCommandSchema>;
