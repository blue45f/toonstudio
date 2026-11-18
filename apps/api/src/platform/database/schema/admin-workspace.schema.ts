import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

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
  operationsRevision: integer("operations_revision").notNull().default(0),
  operationsUpdatedAt: instant("operations_updated_at"),
  businessRevision: integer("business_revision").notNull().default(0),
  businessUpdatedAt: instant("business_updated_at"),
  businessOwnerUserId: text("business_owner_user_id").references(() => users.id, { onDelete: "restrict" }),
}, (table) => [
  check("admin_workspace_id_check", sql`${table.id} = 'toonstudio'`),
  check("admin_workspace_revision_check", sql`${table.revision} >= 0`),
  check("admin_workspace_operations_scope_check", sql`(${table.operationsRevision}=0 AND ${table.operationsUpdatedAt} IS NULL) OR (${table.operationsRevision}>0 AND ${table.operationsUpdatedAt} IS NOT NULL)`),
  check("admin_workspace_business_scope_check", sql`(${table.businessRevision}=0 AND ${table.businessUpdatedAt} IS NULL) OR (${table.businessRevision}>0 AND ${table.businessUpdatedAt} IS NOT NULL)`),
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
  scope: text("scope").notNull().default("legacy"),
  scopeRevision: integer("scope_revision"),
}, (table) => [
  primaryKey({ columns: [table.boardId, table.revision] }),
  check("admin_workspace_audit_revision_check", sql`${table.revision} > 0`),
  check("admin_workspace_audit_action_check", sql`${table.action} IN ('import', 'save')`),
  check("admin_workspace_audit_before_check", sql`((${table.revision} = 1 AND ${table.beforeDigest} IS NULL) OR (${table.revision} > 1 AND ${table.beforeDigest} ~ '^[a-f0-9]{64}$')) IS TRUE`),
  check("admin_workspace_audit_after_check", sql`${table.afterDigest} ~ '^[a-f0-9]{64}$'`),
  check("admin_workspace_audit_scope_check", sql`((${table.scope}='legacy' AND ${table.scopeRevision} IS NULL) OR (${table.scope} IN ('operations','business') AND ${table.scopeRevision}>0)) IS TRUE`),
]).enableRLS();

export const adminWorkspaceReceipt = pgTable("admin_workspace_receipt", {
  boardId: text("board_id").notNull(),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  mutationId: uuid("mutation_id").notNull(),
  requestDigest: text("request_digest").notNull(),
  acceptedRevision: integer("accepted_revision").notNull(),
  acceptedAt: instant("accepted_at").notNull(),
  scope: text("scope").notNull().default("legacy"),
  acceptedScopeRevision: integer("accepted_scope_revision"),
}, (table) => [
  primaryKey({ columns: [table.boardId, table.actorUserId, table.mutationId] }),
  foreignKey({ columns: [table.boardId, table.acceptedRevision], foreignColumns: [adminWorkspaceAudit.boardId, adminWorkspaceAudit.revision] }).onDelete("restrict"),
  check("admin_workspace_receipt_digest_check", sql`${table.requestDigest} ~ '^[a-f0-9]{64}$'`),
  check("admin_workspace_receipt_scope_check", sql`((${table.scope}='legacy' AND ${table.acceptedScopeRevision} IS NULL) OR (${table.scope} IN ('operations','business') AND ${table.acceptedScopeRevision}>0)) IS TRUE`),
]).enableRLS();

export const adminWorkspaceBusinessGrant = pgTable("admin_workspace_business_grant", {
  boardId: text("board_id").notNull().references(() => adminWorkspace.id, { onDelete: "restrict" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  canWrite: boolean("can_write").notNull().default(false),
  canExport: boolean("can_export").notNull().default(false),
  grantedBy: text("granted_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  updatedAt: instant("updated_at").notNull().defaultNow(),
  revokedAt: instant("revoked_at"),
}, (table) => [
  primaryKey({ columns: [table.boardId, table.userId] }),
  check("admin_workspace_grant_revoked_check", sql`${table.revokedAt} IS NULL OR (NOT ${table.canWrite} AND NOT ${table.canExport})`),
]).enableRLS();

export const adminWorkspaceAccessAudit = pgTable("admin_workspace_access_audit", {
  id: uuid("id").primaryKey(),
  boardId: text("board_id").notNull().references(() => adminWorkspace.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  subjectUserId: text("subject_user_id").references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  mutationId: uuid("mutation_id"),
  requestDigest: text("request_digest"),
  canWrite: boolean("can_write"),
  canExport: boolean("can_export"),
  occurredAt: instant("occurred_at").notNull().defaultNow(),
}, (table) => [
  unique().on(table.boardId, table.actorUserId, table.mutationId),
  check("admin_workspace_access_audit_action_check", sql`${table.action} IN ('read','export','claim','access-list','grant','revoke')`),
  check("admin_workspace_access_event_check", sql`((
    ${table.action} IN ('read','export','claim','access-list') AND ${table.subjectUserId} IS NULL AND ${table.mutationId} IS NULL
      AND ${table.requestDigest} IS NULL AND ${table.canWrite} IS NULL AND ${table.canExport} IS NULL
  ) OR (
    ${table.action} IN ('grant','revoke') AND ${table.subjectUserId} IS NOT NULL AND ${table.mutationId} IS NOT NULL
      AND ${table.requestDigest} ~ '^[a-f0-9]{64}$' AND ${table.canWrite} IS NOT NULL AND ${table.canExport} IS NOT NULL
      AND (${table.action}='grant' OR (NOT ${table.canWrite} AND NOT ${table.canExport}))
  )) IS TRUE`),
]).enableRLS();
