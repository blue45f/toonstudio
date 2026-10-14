import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";
import { productionProjects } from "./production.schema";

const time = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
export const productionStageGates = pgTable("production_stage_gate", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => productionProjects.id, { onDelete: "cascade" }),
  episodeId: text("episode_id").notNull(),
  stageId: text("stage_id").notNull(),
  leadReviewerId: text("lead_reviewer_id").references(() => users.id, { onDelete: "set null" }),
  leadReviewerName: text("lead_reviewer_name").notNull().default(""),
  revision: integer("revision").notNull().default(0),
  createdAt: time("created_at").notNull().defaultNow(), updatedAt: time("updated_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("production_stage_gate_episode_unique").on(table.projectId, table.episodeId, table.stageId),
  index("production_stage_gate_episode").on(table.projectId, table.episodeId, table.stageId),
  check("production_stage_gate_id_check", sql`${table.id} ~ '^stage-gate:[^:]+:(plan|storyboard|art)$'`),
  check("production_stage_gate_episode_check", sql`char_length(btrim(${table.episodeId})) between 1 and 160`),
  check("production_stage_gate_stage_check", sql`${table.stageId} in ('plan','storyboard','art')`),
  check("production_stage_gate_lead_name_check", sql`char_length(${table.leadReviewerName}) <= 160`),
  check("production_stage_gate_revision_check", sql`${table.revision} >= 0`)]);
export const productionStageGateRounds = pgTable("production_stage_gate_round", {
  gateId: text("gate_id").notNull().references(() => productionStageGates.id, { onDelete: "cascade" }),
  round: integer("round").notNull(),
  submittedById: text("submitted_by_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  submittedByName: text("submitted_by_name").notNull(),
  revisionRef: text("revision_ref"),
  submittedAt: time("submitted_at").notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.gateId, table.round] }),
  check("production_stage_gate_round_round_check", sql`${table.round} >= 1`),
  check("production_stage_gate_round_submitter_check", sql`char_length(btrim(${table.submittedByName})) between 1 and 160`),
  check("production_stage_gate_round_revision_ref_check", sql`${table.revisionRef} is null or char_length(${table.revisionRef}) between 1 and 320`)]);
export const productionStageGateDecisions = pgTable("production_stage_gate_decision", {
  gateId: text("gate_id").notNull(),
  round: integer("round").notNull(),
  decisionIndex: integer("decision_index").notNull(),
  reviewerId: text("reviewer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reviewerName: text("reviewer_name").notNull(),
  role: text("role").notNull(),
  value: text("value").notNull(),
  reason: text("reason").notNull().default(""),
  conditions: jsonb("conditions").notNull().default([]),
  pinThreadIds: jsonb("pin_thread_ids").notNull().default([]),
  decidedAt: time("decided_at").notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.gateId, table.round, table.decisionIndex] }),
  foreignKey({ columns: [table.gateId, table.round], foreignColumns: [productionStageGateRounds.gateId, productionStageGateRounds.round] }).onDelete("cascade"),
  index("production_stage_gate_decision_round").on(table.gateId, table.round, table.decisionIndex),
  check("production_stage_gate_decision_index_check", sql`${table.decisionIndex} >= 0`),
  check("production_stage_gate_decision_reviewer_check", sql`char_length(btrim(${table.reviewerName})) between 1 and 160`),
  check("production_stage_gate_decision_role_check", sql`${table.role} in ('lead','participant')`),
  check("production_stage_gate_decision_value_check", sql`${table.value} in ('approve','approve-with-conditions','request-changes','veto','abstain')`),
  check("production_stage_gate_decision_reason_check", sql`char_length(${table.reason}) <= 2000`),
  check("production_stage_gate_decision_conditions_check", sql`jsonb_typeof(${table.conditions})='array'`),
  check("production_stage_gate_decision_pins_check", sql`jsonb_typeof(${table.pinThreadIds})='array'`),
  check("production_stage_gate_decision_reason_required_check", sql`${table.value} not in ('request-changes','veto') or char_length(btrim(${table.reason})) >= 1`),
  check("production_stage_gate_decision_conditions_required_check", sql`${table.value} <> 'approve-with-conditions' or jsonb_array_length(${table.conditions}) >= 1`)]);
export const productionStageGateReceipts = pgTable("production_stage_gate_receipt", {
  actorUserId: text("actor_user_id").notNull().references(() => users.id),
  mutationId: uuid("mutation_id").notNull(),
  gateId: text("gate_id").notNull().references(() => productionStageGates.id, { onDelete: "cascade" }),
  requestDigest: text("request_digest").notNull(), response: jsonb("response").notNull(),
  createdAt: time("created_at").notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.actorUserId, table.mutationId] }),
  check("production_stage_gate_receipt_request_digest_check", sql`${table.requestDigest} ~ '^[a-f0-9]{64}$'`),
  check("production_stage_gate_receipt_response_check", sql`jsonb_typeof(${table.response})='object'`)]);
export const productionStageGateAudit = pgTable("production_stage_gate_audit", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  gateId: text("gate_id").notNull().references(() => productionStageGates.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id), action: text("action").notNull(),
  targetId: text("target_id").notNull(), revision: integer("revision").notNull(), occurredAt: time("occurred_at").notNull().defaultNow(),
}, (table) => [index("production_stage_gate_audit_gate").on(table.gateId, table.id.desc())]);
