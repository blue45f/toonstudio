import { sql } from "drizzle-orm";
import { check, foreignKey, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth.schema";

const instant = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

/** 원문은 인증된 관리자가 가져온 뒤 DB에만 저장한다. 공개 소스 seed는 두지 않는다. */
export const adminWorkspace = pgTable("admin_workspace", {
  id: text("id").primaryKey(),
  revision: integer("revision").notNull().default(0),
  payload: jsonb("payload"),
  payloadDigest: text("payload_digest"),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: instant("updated_at"),
}, (table) => [
  check("admin_workspace_id_check", sql`${table.id} = 'toonstudio'`),
  check("admin_workspace_revision_check", sql`${table.revision} >= 0`),
  check("admin_workspace_state_check", sql`((
    ${table.revision} = 0 AND ${table.payload} IS NULL AND ${table.payloadDigest} IS NULL AND ${table.updatedBy} IS NULL AND ${table.updatedAt} IS NULL
  ) OR (
    ${table.revision} > 0 AND jsonb_typeof(${table.payload}) = 'object'
    AND ${table.payload}->>'kind' = 'toonstudio-admin-workspace' AND ${table.payload}->'schemaVersion' = '1'::jsonb
    AND ${table.payloadDigest} ~ '^[a-f0-9]{64}$' AND octet_length(${table.payload}::text) <= 12582912 AND ${table.updatedAt} IS NOT NULL
  )) IS TRUE`),
]).enableRLS();

export const adminWorkspaceAudit = pgTable("admin_workspace_audit", {
  boardId: text("board_id").notNull().references(() => adminWorkspace.id, { onDelete: "restrict" }),
  revision: integer("revision").notNull(),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  beforeDigest: text("before_digest"),
  afterDigest: text("after_digest").notNull(),
  occurredAt: instant("occurred_at").notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.boardId, table.revision] }),
  check("admin_workspace_audit_revision_check", sql`${table.revision} > 0`),
  check("admin_workspace_audit_action_check", sql`${table.action} IN ('import', 'save')`),
  check("admin_workspace_audit_before_check", sql`((${table.revision} = 1 AND ${table.beforeDigest} IS NULL) OR (${table.revision} > 1 AND ${table.beforeDigest} ~ '^[a-f0-9]{64}$')) IS TRUE`),
  check("admin_workspace_audit_after_check", sql`${table.afterDigest} ~ '^[a-f0-9]{64}$'`),
]).enableRLS();

export const adminWorkspaceReceipt = pgTable("admin_workspace_receipt", {
  boardId: text("board_id").notNull(),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  mutationId: uuid("mutation_id").notNull(),
  requestDigest: text("request_digest").notNull(),
  acceptedRevision: integer("accepted_revision").notNull(),
  acceptedAt: instant("accepted_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.boardId, table.actorUserId, table.mutationId] }),
  foreignKey({ columns: [table.boardId, table.acceptedRevision], foreignColumns: [adminWorkspaceAudit.boardId, adminWorkspaceAudit.revision] }).onDelete("restrict"),
  check("admin_workspace_receipt_digest_check", sql`${table.requestDigest} ~ '^[a-f0-9]{64}$'`),
]).enableRLS();
