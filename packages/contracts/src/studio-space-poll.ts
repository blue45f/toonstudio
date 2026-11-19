import { z } from "zod";

const world = z.string().trim().min(1).max(256);
const question = z.string().trim().min(1).max(200);
const option = z.string().trim().min(1).max(60);
const options = z.array(option).min(2).max(6).refine(values => new Set(values).size === values.length);
export const studioSpacePollScope = z.object({ world }).strict();
export const studioSpacePollCommand = z.discriminatedUnion("action", [
  studioSpacePollScope.extend({
    action: z.literal("create"), id: z.uuid(), previousId: z.uuid().nullable(),
    question, options, anonymous: z.boolean(), closesInMs: z.number().int().min(1_000).max(86_400_000).nullable(),
  }),
  studioSpacePollScope.extend({ action: z.literal("vote"), id: z.uuid(), optionIndex: z.number().int().min(0).max(5) }),
  studioSpacePollScope.extend({ action: z.literal("close"), id: z.uuid() }),
]);
export type StudioSpacePollCommand = z.infer<typeof studioSpacePollCommand>;

const result = z.object({
  text: option, count: z.number().int().nonnegative(), voters: z.array(z.string()),
}).strict();
export const studioSpacePollSnapshot = z.object({
  canCreate: z.boolean(), canClose: z.boolean(), canVote: z.boolean(), didVote: z.boolean(),
  poll: z.object({
    id: z.uuid(), question, anonymous: z.boolean(), closed: z.boolean(),
    createdByName: z.string(), createdAt: z.number().int(), deadlineMs: z.number().int().nullable(),
    options: z.array(result).min(2).max(6),
  }).strict().nullable(),
}).strict();
export type StudioSpacePollSnapshot = z.infer<typeof studioSpacePollSnapshot>;
