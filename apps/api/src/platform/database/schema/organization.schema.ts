import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";
import { productionTeamWorkspaces } from "./team-workspace.schema";

const time = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
export const productionOrganizations = pgTable("production_organization", {
  id: text("id").primaryKey(), name: text("name").notNull(),
  kind: text("kind").notNull(), description: text("description").notNull().default(""),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  revision: integer("revision").notNull().default(0),
  createdAt: time("created_at").notNull().defaultNow(), updatedAt: time("updated_at").notNull().defaultNow(),
}, (table) => [index("production_organization_owner").on(table.ownerUserId, table.id),
  check("production_organization_name_check", sql`char_length(btrim(${table.name})) between 1 and 40`),
  check("production_organization_kind_check", sql`${table.kind} in ('company','studio','team-circle')`),
  check("production_organization_description_check", sql`char_length(${table.description}) <= 200`),
  check("production_organization_revision_check", sql`${table.revision} >= 0`)]);
export const productionOrganizationMembers = pgTable("production_organization_member", {
  organizationId: text("organization_id").notNull().references(() => productionOrganizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  role: text("role").notNull(), joinedAt: time("joined_at").notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.organizationId, table.userId] }),
  uniqueIndex("production_organization_one_owner").on(table.organizationId).where(sql`${table.role}='owner'`),
  index("production_organization_member_user").on(table.userId, table.organizationId),
  check("production_organization_member_role_check", sql`${table.role} in ('owner','admin','manager','member','guest')`)]);
export const productionOrganizationInvites = pgTable("production_organization_invite", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => productionOrganizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(), role: text("role").notNull(), tokenHash: text("token_hash").notNull().unique(),
  createdBy: text("created_by").notNull().references(() => users.id),
  expiresAt: time("expires_at").notNull(), revokedAt: time("revoked_at"), acceptedAt: time("accepted_at"),
  createdAt: time("created_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("production_organization_pending_invite").on(table.organizationId, table.email)
  .where(sql`${table.revokedAt} is null and ${table.acceptedAt} is null`),
  index("production_organization_invite_org").on(table.organizationId, table.expiresAt),
  check("production_organization_invite_email_check", sql`${table.email}=lower(btrim(${table.email})) and char_length(${table.email}) between 3 and 320`),
  check("production_organization_invite_role_check", sql`${table.role} in ('admin','manager','member','guest')`),
  check("production_organization_invite_token_hash_check", sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`)]);
export const productionOrganizationLinks = pgTable("production_organization_link", {
  organizationId: text("organization_id").notNull().references(() => productionOrganizations.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => productionTeamWorkspaces.id, { onDelete: "cascade" }),
  linkedBy: text("linked_by").notNull().references(() => users.id), linkedAt: time("linked_at").notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.organizationId, table.workspaceId] }),
  index("production_organization_link_workspace").on(table.workspaceId, table.organizationId)]);
export const productionOrganizationNotices = pgTable("production_organization_notice", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => productionOrganizations.id, { onDelete: "cascade" }),
  authorUserId: text("author_user_id").notNull().references(() => users.id),
  body: text("body").notNull(), createdAt: time("created_at").notNull().defaultNow(),
}, (table) => [index("production_organization_notice_org").on(table.organizationId, table.createdAt.desc()),
  check("production_organization_notice_body_check", sql`char_length(btrim(${table.body})) between 1 and 300`)]);
export const productionOrganizationReceipts = pgTable("production_organization_receipt", {
  actorUserId: text("actor_user_id").notNull().references(() => users.id), mutationId: uuid("mutation_id").notNull(),
  organizationId: text("organization_id").notNull().references(() => productionOrganizations.id, { onDelete: "cascade" }),
  requestDigest: text("request_digest").notNull(), response: jsonb("response").notNull(), createdAt: time("created_at").notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.actorUserId, table.mutationId] }),
  check("production_organization_receipt_request_digest_check", sql`${table.requestDigest} ~ '^[a-f0-9]{64}$'`),
  check("production_organization_receipt_response_check", sql`jsonb_typeof(${table.response})='object'`)]);
export const productionOrganizationAudit = pgTable("production_organization_audit", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text("organization_id").notNull().references(() => productionOrganizations.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id), action: text("action").notNull(),
  targetId: text("target_id").notNull(), revision: integer("revision").notNull(), occurredAt: time("occurred_at").notNull().defaultNow(),
}, (table) => [index("production_organization_audit_org").on(table.organizationId, table.id.desc())]);
