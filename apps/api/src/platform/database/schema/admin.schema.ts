import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";
import type { NestBoardDocument } from "@toonstudio/contracts/admin-nestjs-quality";

import { users } from "./auth.schema";

// 런타임 토글/설정(key-value). 예: monetization.enabled (광고형 수익화 on/off).
export const appSettings = pgTable("app_setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull().default({}),
  updatedAt: timestamp("updatedAt", { mode: "date" }).$defaultFn(() => new Date()),
});


export const monetizationPlans = pgTable("monetization_plan", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  intervalDays: integer("intervalDays").notNull().default(30),
  currency: text("currency").notNull().default("KRW"),
  priceCents: bigint("priceCents", { mode: "number" }).notNull(),
  perks: jsonb("perks").$type<string[]>().notNull().default([]),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
  updatedAt: timestamp("updatedAt", { mode: "date" }).$defaultFn(() => new Date()),
});


export const creatorCampaigns = pgTable(
  "creator_campaign",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    creatorId: text("creatorId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    titleId: text("titleId"),
    planId: text("planId").references(() => monetizationPlans.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    targetAmountCents: bigint("targetAmountCents", { mode: "number" }).notNull().default(0),
    raisedAmountCents: bigint("raisedAmountCents", { mode: "number" }).notNull().default(0),
    isActive: boolean("isActive").notNull().default(true),
    startsAt: timestamp("startsAt", { mode: "date" }),
    endsAt: timestamp("endsAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
    updatedAt: timestamp("updatedAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [index("idx_creator_campaign_creator").on(t.creatorId)]
);


export const revenueLedger = pgTable(
  "revenue_ledger",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    payerId: text("payerId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipientId: text("recipientId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: text("planId").references(() => monetizationPlans.id, { onDelete: "set null" }),
    campaignId: text("campaignId").references(() => creatorCampaigns.id, { onDelete: "set null" }),
    kind: text("kind").notNull().default("plan"),
    status: text("status").notNull().default("paid"),
    amountCents: bigint("amountCents", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("KRW"),
    metadata: jsonb("metadata").notNull().default({}),
    reviewedBy: text("reviewedBy").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewedAt", { mode: "date" }),
    reviewNote: text("reviewNote").default(""),
    settledAt: timestamp("settledAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_revenue_ledger_recipient_created").on(t.recipientId, t.createdAt), // 크리에이터 수익 내역
    index("idx_revenue_ledger_payer_created").on(t.payerId, t.createdAt), // 후원/결제 내역
    index("idx_revenue_ledger_createdat").on(t.createdAt),
    index("idx_revenue_ledger_status_createdat").on(t.status, t.createdAt),
    index("idx_revenue_ledger_reviewedat").on(t.reviewedAt),
    index("idx_revenue_ledger_settledat").on(t.settledAt),
  ]
);


// Managed administrator tables. Keep persisted SQL defaults and existing FK deletion semantics.
export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: text("id").primaryKey(),
    adminId: text("adminId").notNull().references(() => users.id, { onDelete: "cascade" }),
    adminEmail: text("adminEmail"),
    action: text("action").notNull(),
    targetType: text("targetType").notNull().default("system"),
    targetId: text("targetId"),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_admin_audit_logs_createdat").on(t.createdAt),
    index("idx_admin_audit_logs_action").on(t.action),
  ],
);

export const adminBannedWords = pgTable(
  "admin_banned_words",
  {
    id: text("id").primaryKey(),
    word: text("word").notNull().unique(),
    category: text("category").notNull().default("general"),
    createdBy: text("createdBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
);

export const adminPromos = pgTable(
  "admin_promos",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    discountType: text("discountType").notNull().default("percent"),
    discountValue: integer("discountValue").notNull().default(10),
    maxUses: integer("maxUses").notNull().default(100),
    usedCount: integer("usedCount").notNull().default(0),
    isActive: boolean("isActive").notNull().default(true),
    expiresAt: timestamp("expiresAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
);

export const adminAnnouncements = pgTable(
  "admin_announcements",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    level: text("level").notNull().default("info"),
    placement: text("placement").notNull().default("top_banner"),
    targetRole: text("targetRole").notNull().default("all"),
    isActive: boolean("isActive").notNull().default(true),
    startsAt: timestamp("startsAt", { mode: "date" }),
    endsAt: timestamp("endsAt", { mode: "date" }),
    createdBy: text("createdBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_admin_announcements_active").on(t.isActive),
  ],
);

export const adminSecurityPolicies = pgTable(
  "admin_security_policies",
  {
    id: text("id").primaryKey(),
    ipAddress: text("ipAddress").notNull().unique(),
    reason: text("reason").notNull().default(""),
    action: text("action").notNull().default("block"),
    createdBy: text("createdBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
);

export const adminContentReports = pgTable(
  "admin_content_reports",
  {
    id: text("id").primaryKey(),
    reporterId: text("reporterId").notNull().references(() => users.id, { onDelete: "cascade" }),
    targetType: text("targetType").notNull(),
    targetId: text("targetId").notNull(),
    reason: text("reason").notNull().default(""),
    status: text("status").notNull().default("pending"),
    resolvedBy: text("resolvedBy").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolvedAt", { mode: "date" }),
    resolutionNote: text("resolutionNote").default(""),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_admin_reports_status").on(t.status),
  ],
);

/** 내부 품질 검증 계정 표시. 공개 사용자 프로필이나 인증 권한과 분리한다. */
export const adminMemberTestAccounts = pgTable("admin_member_test_accounts", {
  userId: text("userId").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  isTestAccount: boolean("isTestAccount").notNull().default(false),
  reason: text("reason").notNull(),
  updatedBy: text("updatedBy").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}).enableRLS();

/** 관리자 NestJS 검증 보드와 변경 이력의 영속 스키마. */
const instant = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const adminNestjsQualityBoard = pgTable("admin_nestjs_quality_board", {
  repository: text("repository").primaryKey(),
  revision: integer("revision").notNull().default(0),
  document: jsonb("document").$type<NestBoardDocument>().notNull(),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "restrict" }),
  updatedAt: instant("updated_at").notNull().defaultNow(),
}, (table) => [
  check("admin_nestjs_quality_board_repository_check", sql`${table.repository}='blue45f/toonstudio'`),
  check("admin_nestjs_quality_board_revision_check", sql`${table.revision}>=0`),
  check("admin_nestjs_quality_board_document_check", sql`(jsonb_typeof(${table.document})='object'
    AND ${table.document}->'schemaVersion'='1'::jsonb AND ${table.document}->>'repository'=${table.repository}
    AND jsonb_typeof(${table.document}->'tasks')='array' AND jsonb_typeof(${table.document}->'snapshot')='object'
    AND jsonb_typeof(${table.document}->'sourceHistory')='array' AND octet_length(${table.document}::text)<=4194304) IS TRUE`),
]);

export const adminNestjsQualityHistory = pgTable("admin_nestjs_quality_history", {
  repository: text("repository").notNull().references(() => adminNestjsQualityBoard.repository, { onDelete: "restrict" }),
  revision: integer("revision").notNull(),
  actorId: text("actor_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  mutationId: text("mutation_id").notNull(),
  requestDigest: text("request_digest").notNull(),
  reason: text("reason").notNull(),
  changedTaskIds: jsonb("changed_task_ids").$type<string[]>().notNull(),
  snapshotChanged: boolean("snapshot_changed").notNull(),
  beforeDocument: jsonb("before_document").$type<NestBoardDocument>().notNull(),
  afterDocument: jsonb("after_document").$type<NestBoardDocument>().notNull(),
  createdAt: instant("created_at").notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.repository, table.revision] }),
  unique("admin_nestjs_quality_history_mutation_unique").on(table.repository, table.actorId, table.mutationId),
  check("admin_nestjs_quality_history_revision_check", sql`${table.revision}>0`),
  check("admin_nestjs_quality_history_mutation_id_check", sql`${table.mutationId} ~ '^[A-Za-z0-9._:-]{8,128}$'`),
  check("admin_nestjs_quality_history_request_digest_check", sql`${table.requestDigest} ~ '^[a-f0-9]{64}$'`),
  check("admin_nestjs_quality_history_reason_check", sql`char_length(btrim(${table.reason})) BETWEEN 1 AND 1000`),
  check("admin_nestjs_quality_history_changed_task_ids_check", sql`jsonb_typeof(${table.changedTaskIds})='array'`),
  check("admin_nestjs_quality_history_before_check", sql`(jsonb_typeof(${table.beforeDocument})='object'
    AND ${table.beforeDocument}->'schemaVersion'='1'::jsonb AND ${table.beforeDocument}->>'repository'=${table.repository}
    AND octet_length(${table.beforeDocument}::text)<=4194304) IS TRUE`),
  check("admin_nestjs_quality_history_after_check", sql`(jsonb_typeof(${table.afterDocument})='object'
    AND ${table.afterDocument}->'schemaVersion'='1'::jsonb AND ${table.afterDocument}->>'repository'=${table.repository}
    AND octet_length(${table.afterDocument}::text)<=4194304) IS TRUE`),
]);

/** 위 관리자 스키마의 읽기 전용 정합성 검사. 런타임 DDL을 실행하지 않는다. */
export const ADMIN_SCHEMA_COLUMNS_SQL = `NOT EXISTS (
  SELECT 1 FROM (VALUES
    ('admin_audit_logs', 'id', 'text', true),
    ('admin_audit_logs', 'adminId', 'text', true),
    ('admin_audit_logs', 'adminEmail', 'text', false),
    ('admin_audit_logs', 'action', 'text', true),
    ('admin_audit_logs', 'targetType', 'text', true),
    ('admin_audit_logs', 'targetId', 'text', false),
    ('admin_audit_logs', 'details', 'jsonb', true),
    ('admin_audit_logs', 'createdAt', 'timestamp without time zone', true),
    ('admin_banned_words', 'id', 'text', true),
    ('admin_banned_words', 'word', 'text', true),
    ('admin_banned_words', 'category', 'text', true),
    ('admin_banned_words', 'createdBy', 'text', false),
    ('admin_banned_words', 'createdAt', 'timestamp without time zone', true),
    ('admin_promos', 'id', 'text', true),
    ('admin_promos', 'code', 'text', true),
    ('admin_promos', 'discountType', 'text', true),
    ('admin_promos', 'discountValue', 'integer', true),
    ('admin_promos', 'maxUses', 'integer', true),
    ('admin_promos', 'usedCount', 'integer', true),
    ('admin_promos', 'isActive', 'boolean', true),
    ('admin_promos', 'expiresAt', 'timestamp without time zone', false),
    ('admin_promos', 'createdAt', 'timestamp without time zone', true),
    ('admin_announcements', 'id', 'text', true),
    ('admin_announcements', 'title', 'text', true),
    ('admin_announcements', 'content', 'text', true),
    ('admin_announcements', 'level', 'text', true),
    ('admin_announcements', 'placement', 'text', true),
    ('admin_announcements', 'targetRole', 'text', true),
    ('admin_announcements', 'isActive', 'boolean', true),
    ('admin_announcements', 'startsAt', 'timestamp without time zone', false),
    ('admin_announcements', 'endsAt', 'timestamp without time zone', false),
    ('admin_announcements', 'createdBy', 'text', false),
    ('admin_announcements', 'createdAt', 'timestamp without time zone', true),
    ('admin_security_policies', 'id', 'text', true),
    ('admin_security_policies', 'ipAddress', 'text', true),
    ('admin_security_policies', 'reason', 'text', true),
    ('admin_security_policies', 'action', 'text', true),
    ('admin_security_policies', 'createdBy', 'text', false),
    ('admin_security_policies', 'createdAt', 'timestamp without time zone', true),
    ('admin_content_reports', 'id', 'text', true),
    ('admin_content_reports', 'reporterId', 'text', true),
    ('admin_content_reports', 'targetType', 'text', true),
    ('admin_content_reports', 'targetId', 'text', true),
    ('admin_content_reports', 'reason', 'text', true),
    ('admin_content_reports', 'status', 'text', true),
    ('admin_content_reports', 'resolvedBy', 'text', false),
    ('admin_content_reports', 'resolvedAt', 'timestamp without time zone', false),
    ('admin_content_reports', 'resolutionNote', 'text', false),
    ('admin_content_reports', 'createdAt', 'timestamp without time zone', true),
    ('revenue_ledger', 'reviewedBy', 'text', false),
    ('revenue_ledger', 'reviewedAt', 'timestamp without time zone', false),
    ('revenue_ledger', 'reviewNote', 'text', false),
    ('revenue_ledger', 'settledAt', 'timestamp without time zone', false)
  ) AS expected(table_name, column_name, column_type, not_null)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = to_regclass('public.' || expected.table_name)
      AND attribute.attname = expected.column_name
      AND pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = expected.column_type
      AND attribute.attnotnull = expected.not_null
      AND attribute.attnum > 0 AND NOT attribute.attisdropped
  )
)`;

export const ADMIN_SCHEMA_INDEXES_SQL = `NOT EXISTS (
  SELECT 1 FROM (VALUES
    ('idx_admin_audit_logs_createdat', 'admin_audit_logs', ARRAY['createdAt']::text[]),
    ('idx_admin_audit_logs_action', 'admin_audit_logs', ARRAY['action']::text[]),
    ('idx_admin_announcements_active', 'admin_announcements', ARRAY['isActive']::text[]),
    ('idx_admin_reports_status', 'admin_content_reports', ARRAY['status']::text[]),
    ('idx_revenue_ledger_createdat', 'revenue_ledger', ARRAY['createdAt']::text[]),
    ('idx_revenue_ledger_status_createdat', 'revenue_ledger', ARRAY['status', 'createdAt']::text[]),
    ('idx_revenue_ledger_reviewedat', 'revenue_ledger', ARRAY['reviewedAt']::text[]),
    ('idx_revenue_ledger_settledat', 'revenue_ledger', ARRAY['settledAt']::text[])
  ) AS expected(index_name, table_name, columns)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index AS state
    JOIN pg_catalog.pg_class AS index_record ON index_record.oid = state.indexrelid
    WHERE state.indrelid = to_regclass('public.' || expected.table_name)
      AND index_record.relnamespace = to_regnamespace('public')
      AND index_record.relname = expected.index_name
      AND state.indisvalid AND state.indisready AND state.indislive
      AND NOT state.indisunique AND NOT state.indisprimary AND NOT state.indisexclusion
      AND state.indpred IS NULL AND state.indexprs IS NULL
      AND state.indnatts = state.indnkeyatts
      AND ARRAY(SELECT attribute.attname::text
        FROM unnest(state.indkey) WITH ORDINALITY AS key(attnum, position)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = state.indrelid AND attribute.attnum = key.attnum
        ORDER BY key.position) = expected.columns
  )
)`;
