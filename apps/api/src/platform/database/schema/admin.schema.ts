import type { Board } from "@toonstudio/contracts/admin-cloud-workboard";
import { sql } from "drizzle-orm";
import { bigint, boolean, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { users } from "./index";

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

// 서버가 확인한 관리자 소유자별로 분리한다. 최초 조회는 저장 행을 만들지 않는다.
export const adminCloudWorkboard = pgTable("admin_cloud_workboard", {
  ownerUserId: text("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  boardId: text("board_id").notNull().default("cloud-workboard-v1"),
  revision: bigint("revision", { mode: "number" }).notNull().default(0),
  payload: jsonb("payload").$type<Board>().notNull(),
  storedAt: timestamp("stored_at", { withTimezone: true, mode: "date" }),
}, (t) => [
  primaryKey({ columns: [t.ownerUserId, t.boardId] }),
  check("admin_cloud_workboard_id_check", sql`${t.boardId}='cloud-workboard-v1'`),
  check("admin_cloud_workboard_revision_check", sql`${t.revision} BETWEEN 0 AND 9007199254740991`),
  check("admin_cloud_workboard_payload_check", sql`jsonb_typeof(${t.payload})='object'
    AND ${t.payload} ?& ARRAY['schemaVersion','snapshotAt','tasks','audit']
    AND ${t.payload}->'schemaVersion'='1'::jsonb AND jsonb_typeof(${t.payload}->'snapshotAt')='string'
    AND jsonb_typeof(${t.payload}->'tasks')='array' AND ${t.payload}->'audit'='[]'::jsonb`),
  check("admin_cloud_workboard_time_check", sql`(${t.revision}=0 AND ${t.storedAt} IS NULL)
    OR (${t.revision}>0 AND ${t.storedAt} IS NOT NULL)`),
]).enableRLS();

// 원본 메모를 복제하지 않고 서버의 행위자·변경 다이제스트·시각만 별도 보존한다.
export const adminCloudWorkboardAudit = pgTable("admin_cloud_workboard_audit", {
  ownerUserId: text("owner_user_id").notNull(),
  boardId: text("board_id").notNull(),
  revision: bigint("revision", { mode: "number" }).notNull(),
  actorUserId: text("actor_user_id").notNull(),
  mutationId: uuid("mutation_id").notNull(),
  beforeDigest: text("before_digest").notNull(),
  afterDigest: text("after_digest").notNull(),
  taskCount: integer("task_count").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.ownerUserId, t.boardId, t.revision] }),
  unique().on(t.ownerUserId, t.mutationId),
  foreignKey({ columns: [t.ownerUserId, t.boardId], foreignColumns: [adminCloudWorkboard.ownerUserId, adminCloudWorkboard.boardId] }).onDelete("cascade"),
  check("admin_cloud_workboard_audit_actor_check", sql`${t.actorUserId}=${t.ownerUserId}`),
  check("admin_cloud_workboard_audit_revision_check", sql`${t.revision} BETWEEN 1 AND 9007199254740991`),
  check("admin_cloud_workboard_audit_before_check", sql`${t.beforeDigest} ~ '^[a-f0-9]{64}$'`),
  check("admin_cloud_workboard_audit_after_check", sql`${t.afterDigest} ~ '^[a-f0-9]{64}$'`),
  check("admin_cloud_workboard_audit_count_check", sql`${t.taskCount}>=0`),
]).enableRLS();

export const adminCloudWorkboardReceipts = pgTable("admin_cloud_workboard_receipt", {
  ownerUserId: text("owner_user_id").notNull(),
  boardId: text("board_id").notNull(),
  mutationId: uuid("mutation_id").notNull(),
  requestDigest: text("request_digest").notNull(),
  acceptedRevision: bigint("accepted_revision", { mode: "number" }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.ownerUserId, t.mutationId] }),
  foreignKey({ columns: [t.ownerUserId, t.boardId, t.acceptedRevision],
    foreignColumns: [adminCloudWorkboardAudit.ownerUserId, adminCloudWorkboardAudit.boardId, adminCloudWorkboardAudit.revision] }).onDelete("cascade"),
  check("admin_cloud_workboard_receipt_digest_check", sql`${t.requestDigest} ~ '^[a-f0-9]{64}$'`),
]).enableRLS();
