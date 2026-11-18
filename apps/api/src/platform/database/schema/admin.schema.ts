import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import type { BusinessPlanState } from "@toonstudio/contracts/business-plan";

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

const businessPlanInstant = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

/** 비공개 사업계획서 최신값. 미생성 보드는 조회 시 INSERT하지 않는다. */
export const adminBusinessPlan = pgTable("admin_business_plan", {
  id: integer("id").primaryKey(),
  revision: integer("revision").notNull().default(0),
  payload: jsonb("payload").$type<BusinessPlanState>(),
  updatedAt: businessPlanInstant("updated_at"),
  ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "restrict" }),
}, (t) => [
  check("admin_business_plan_singleton_check", sql`${t.id} = 1`),
  check("admin_business_plan_revision_check", sql`${t.revision} >= 0`),
  check("admin_business_plan_state_check", sql`(${t.revision} = 0 AND ${t.payload} IS NULL AND ${t.updatedAt} IS NULL)
    OR (${t.revision} > 0 AND ${t.payload} IS NOT NULL AND ${t.updatedAt} IS NOT NULL
      AND (jsonb_typeof(${t.payload}) = 'object' AND ${t.payload}->'schemaVersion' = '1'::jsonb) IS TRUE)`),
]).enableRLS();

/** 원문 복구용 불변 snapshot. SQL migration의 trigger가 UPDATE·DELETE를 거절한다. */
export const adminBusinessPlanRevisions = pgTable("admin_business_plan_revision", {
  revision: integer("revision").primaryKey(),
  payload: jsonb("payload").$type<BusinessPlanState>().notNull(),
  createdAt: businessPlanInstant("created_at").notNull().defaultNow(),
}, (t) => [
  check("admin_business_plan_snapshot_revision_check", sql`${t.revision} > 0`),
  check("admin_business_plan_snapshot_payload_check", sql`(jsonb_typeof(${t.payload}) = 'object' AND ${t.payload}->'schemaVersion' = '1'::jsonb) IS TRUE`),
]).enableRLS();

/** 감사에는 본문·문서·근거 원문 대신 행위자와 digest만 기록한다. */
export const adminBusinessPlanAudit = pgTable("admin_business_plan_audit", {
  revision: integer("revision").primaryKey().references(() => adminBusinessPlanRevisions.revision, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  beforeDigest: text("before_digest").notNull(),
  afterDigest: text("after_digest").notNull(),
  occurredAt: businessPlanInstant("occurred_at").notNull().defaultNow(),
}, (t) => [
  check("admin_business_plan_audit_before_digest_check", sql`${t.beforeDigest} ~ '^[a-f0-9]{64}$'`),
  check("admin_business_plan_audit_after_digest_check", sql`${t.afterDigest} ~ '^[a-f0-9]{64}$'`),
]).enableRLS();

export const adminBusinessPlanReceipts = pgTable("admin_business_plan_receipt", {
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  mutationId: uuid("mutation_id").notNull(),
  requestDigest: text("request_digest").notNull(),
  acceptedRevision: integer("accepted_revision").notNull().references(() => adminBusinessPlanRevisions.revision, { onDelete: "restrict" }),
  createdAt: businessPlanInstant("created_at").notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.actorUserId, t.mutationId] }),
  check("admin_business_plan_receipt_digest_check", sql`${t.requestDigest} ~ '^[a-f0-9]{64}$'`),
]).enableRLS();

/** 삭제 대신 철회 시각을 기록한다. 소유자만 API를 통해 명시적으로 부여한다. */
export const adminBusinessPlanGrants = pgTable("admin_business_plan_grant", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "restrict" }),
  canWrite: boolean("can_write").notNull().default(false),
  canExport: boolean("can_export").notNull().default(false),
  grantedBy: text("granted_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  updatedAt: businessPlanInstant("updated_at").notNull().defaultNow(),
  revokedAt: businessPlanInstant("revoked_at"),
}, (t) => [check("admin_business_plan_grant_revoked_check", sql`${t.revokedAt} IS NULL OR (${t.canWrite}=false AND ${t.canExport}=false)`)]).enableRLS();

/** 열람·내보내기·권한 변경 감사에도 원문이나 문서 제목을 넣지 않는다. */
export const adminBusinessPlanAccessAudit = pgTable("admin_business_plan_access_audit", {
  id: uuid("id").primaryKey(),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  subjectUserId: text("subject_user_id").references(() => users.id, { onDelete: "restrict" }),
  mutationId: uuid("mutation_id"),
  requestDigest: text("request_digest"),
  canWrite: boolean("can_write"),
  canExport: boolean("can_export"),
  occurredAt: businessPlanInstant("occurred_at").notNull().defaultNow(),
}, (t) => [
  unique("admin_business_plan_access_audit_request_unique").on(t.actorUserId, t.mutationId),
  check("admin_business_plan_access_audit_shape_check", sql`(
    (${t.action} IN ('read','export','access-list') AND ${t.subjectUserId} IS NULL AND ${t.mutationId} IS NULL AND ${t.requestDigest} IS NULL AND ${t.canWrite} IS NULL AND ${t.canExport} IS NULL)
    OR (${t.action}='claim' AND ${t.subjectUserId} IS NULL AND ${t.mutationId} IS NOT NULL AND ${t.requestDigest} ~ '^[a-f0-9]{64}$' AND ${t.canWrite} IS NULL AND ${t.canExport} IS NULL)
    OR (${t.action} IN ('grant','revoke') AND ${t.subjectUserId} IS NOT NULL AND ${t.mutationId} IS NOT NULL AND ${t.requestDigest} ~ '^[a-f0-9]{64}$' AND ${t.canWrite} IS NOT NULL AND ${t.canExport} IS NOT NULL
      AND (${t.action} <> 'revoke' OR (${t.canWrite}=false AND ${t.canExport}=false)))
  ) IS TRUE`),
]).enableRLS();
