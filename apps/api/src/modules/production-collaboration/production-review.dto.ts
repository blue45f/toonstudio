import { z } from "zod";
import { REVIEW_LANES } from "@toonstudio/core/production";
import { HumanTextSchema, IdentitySchema, IsoDateTimeSchema, ProductionScopeRefSchema } from "./production-collaboration-schema-primitives";

export const ReviewPolicyLaneSchema = z.object({
  lane: z.enum(REVIEW_LANES), eligibleAssignmentIds: z.array(IdentitySchema).max(100),
  requiredAssignmentIds: z.array(IdentitySchema).max(100), quorum: z.number().int().min(1).max(100),
  vetoAssignmentIds: z.array(IdentitySchema).max(100), blocksPublication: z.boolean(),
}).strict();

export const ReviewPolicySchema = z.object({
  id: IdentitySchema, projectId: IdentitySchema, scope: ProductionScopeRefSchema,
  lanes: z.array(ReviewPolicyLaneSchema).min(1).max(20)
    .refine((lanes) => new Set(lanes.map((entry) => entry.lane)).size === lanes.length, "검수 lane은 정책 안에서 중복될 수 없습니다."),
  quorumBasis: z.enum(["assignments", "accounts"]).optional(),
  responseDueHours: z.number().int().min(1).max(8_760),
  expiredReviewAction: z.enum(["escalate", "replace-reviewer", "reschedule"]),
}).strict();

export const ReviewDecisionSchema = z.object({
  id: IdentitySchema, reviewRoundId: IdentitySchema, lane: z.enum(REVIEW_LANES), assignmentId: IdentitySchema,
  reviewerAccountUserId: IdentitySchema.optional(),
  value: z.enum(["approve", "approve-with-conditions", "request-changes", "veto", "abstain"]),
  reasonCode: z.string().trim().min(1).max(120).nullable(), evidenceScopeRefs: z.array(ProductionScopeRefSchema).max(1_000),
  conditions: z.array(HumanTextSchema).max(100), createdAt: IsoDateTimeSchema,
}).strict();

export const UpsertReviewPolicyCommandSchema = z.object({ type: z.literal("upsert-review-policy"), policy: ReviewPolicySchema }).strict();
export const RecordReviewDecisionCommandSchema = z.object({
  type: z.literal("record-review-decision"), policyId: IdentitySchema, decision: ReviewDecisionSchema,
}).strict();
