import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const identity = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const inviteToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);
/** 클라이언트 입장코드와 같은 규칙: 혼동 문자(0/O/1/I)를 제외한 6자리. */
const entryCode = z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{6}$/u);

export const VerifySpatialInviteSchema = z.object({
  token: inviteToken,
  context: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("team-lobby") }).strict(),
    z.object({ kind: z.literal("project-space"), projectId: identity }).strict(),
    z.object({ kind: z.literal("interview-waiting") }).strict(),
  ]),
}).strict();

export const IssueSpaceEntryCodeSchema = z.object({
  spaceId: identity,
  spaceName: z.string().trim().max(40).optional(),
  ttlDays: z.number().int().min(1).max(90).optional(),
}).strict();

export const VerifySpaceEntryCodeSchema = z.object({
  spaceId: identity,
  code: entryCode,
}).strict();

export const SpaceEntryCodeParamsSchema = z.object({ id: identity }).strict();

export class VerifySpatialInviteDto extends createZodDto(VerifySpatialInviteSchema) {}
export class IssueSpaceEntryCodeDto extends createZodDto(IssueSpaceEntryCodeSchema) {}
export class VerifySpaceEntryCodeDto extends createZodDto(VerifySpaceEntryCodeSchema) {}
export class SpaceEntryCodeParamsDto extends createZodDto(SpaceEntryCodeParamsSchema) {}

export type VerifySpatialInviteInput = z.infer<typeof VerifySpatialInviteSchema>;
export type IssueSpaceEntryCodeInput = z.infer<typeof IssueSpaceEntryCodeSchema>;
export type VerifySpaceEntryCodeInput = z.infer<typeof VerifySpaceEntryCodeSchema>;
