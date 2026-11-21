import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import type { LocatedPrivateObjectReference } from "../../adapters/private-object-storage/private-object-storage.contract";
import type { ProductionVoiceCommentaryTrackMeta } from "../../../modules/production-collaboration/production-voice-commentary.dto";
import { users } from "./auth.schema";
import { creatorWorks } from "./creator.schema";

export const productionProjects = pgTable(
  "production_project",
  {
    id: text("id").primaryKey(),
    workId: text("workId")
      .notNull()
      .references(() => creatorWorks.id, { onDelete: "cascade" }),
    organizationId: text("organizationId"),
    title: text("title").notNull(),
    collaborationModel: text("collaborationModel").notNull(),
    modelVersion: integer("modelVersion").notNull().default(1),
    revision: integer("revision").notNull().default(0),
    aggregate: jsonb("aggregate").$type<ProductionProjectAggregate>().notNull(),
    createdBy: text("createdBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("production_project_work_unique").on(table.workId),
    index("idx_production_project_updated").on(table.updatedAt.desc(), table.id),
    index("idx_production_project_organization_updated").on(
      table.organizationId,
      table.updatedAt.desc(),
    ),
    check("production_project_id_check", sql`length(${table.id}) between 1 and 160`),
    check("production_project_title_check", sql`length(btrim(${table.title})) between 1 and 240`),
    check(
      "production_project_collaboration_model_check",
      sql`${table.collaborationModel} in (
        'solo', 'co-creator', 'story-led-commission', 'art-led-commission',
        'adaptation', 'studio-production', 'anthology', 'replacement'
      )`,
    ),
    check("production_project_model_version_check", sql`${table.modelVersion} in (1, 2)`),
    check("production_project_revision_check", sql`${table.revision} between 0 and 2147483647`),
    check(
      "production_project_aggregate_check",
      sql`(
        jsonb_typeof(${table.aggregate}) = 'object'
        and ${table.aggregate}->>'modelVersion' = ${table.modelVersion}::text
        and ${table.aggregate}->>'projectId' = ${table.id}
        and ${table.aggregate}->>'workId' = ${table.workId}
        and ${table.aggregate}->>'revision' = ${table.revision}::text
        and jsonb_typeof(${table.aggregate}->'parties') = 'array'
        and jsonb_typeof(${table.aggregate}->'assignments') = 'array'
        and jsonb_typeof(${table.aggregate}->'auditEvents') = 'array'
      ) is true`,
    ),
  ],
);

export const productionProjectEvents = pgTable(
  "production_project_event",
  {
    id: text("id").notNull(),
    projectId: text("projectId")
      .notNull()
      .references(() => productionProjects.id, { onDelete: "cascade" }),
    aggregateRevision: integer("aggregateRevision").notNull(),
    actorUserId: text("actorUserId").references(() => users.id, { onDelete: "set null" }),
    actorPartyId: text("actorPartyId"),
    action: text("action").notNull(),
    targetType: text("targetType").notNull(),
    targetId: text("targetId").notNull(),
    beforeDigest: text("beforeDigest"),
    afterDigest: text("afterDigest"),
    reason: text("reason"),
    occurredAt: timestamp("occurredAt", { mode: "date", withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "production_project_event_pkey",
      columns: [table.projectId, table.aggregateRevision],
    }),
    unique("production_project_event_id_unique").on(table.id),
    index("idx_production_project_event_actor_created").on(
      table.actorUserId,
      table.createdAt.desc(),
    ),
    check("production_project_event_revision_check", sql`${table.aggregateRevision} between 1 and 2147483647`),
    check("production_project_event_action_check", sql`length(btrim(${table.action})) between 1 and 120`),
    check("production_project_event_target_type_check", sql`length(btrim(${table.targetType})) between 1 and 120`),
    check("production_project_event_target_id_check", sql`length(btrim(${table.targetId})) between 1 and 160`),
    check(
      "production_project_event_digest_check",
      sql`(${table.beforeDigest} is null or ${table.beforeDigest} ~ '^(?:fnv1a64:[0-9a-f]{16}|sha256:[0-9a-f]{64})$')
        and (${table.afterDigest} is null or ${table.afterDigest} ~ '^(?:fnv1a64:[0-9a-f]{16}|sha256:[0-9a-f]{64})$')`,
    ),
  ],
);

export const productionProjectMutationReceipts = pgTable(
  "production_project_mutation_receipt",
  {
    projectId: text("projectId")
      .notNull()
      .references(() => productionProjects.id, { onDelete: "cascade" }),
    actorUserId: text("actorUserId").notNull(),
    mutationId: text("mutationId").notNull(),
    requestDigest: text("requestDigest").notNull(),
    resultRevision: integer("resultRevision").notNull(),
    response: jsonb("response").$type<{ aggregate: ProductionProjectAggregate; derived?: unknown }>().notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "production_project_mutation_receipt_pkey",
      columns: [table.projectId, table.actorUserId, table.mutationId],
    }),
    index("idx_production_project_mutation_receipt_created").on(table.createdAt),
    check(
      "production_project_mutation_receipt_id_check",
      sql`${table.mutationId} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
    ),
    check(
      "production_project_mutation_receipt_digest_check",
      sql`${table.requestDigest} ~ '^fnv1a64:[0-9a-f]{16}$'`,
    ),
    check(
      "production_project_mutation_receipt_revision_check",
      sql`${table.resultRevision} between 1 and 2147483647`,
    ),
    check(
      "production_project_mutation_receipt_response_check",
      sql`jsonb_typeof(${table.response}) = 'object'
        and jsonb_typeof(${table.response}->'aggregate') = 'object'`,
    ),
  ],
);

export const productionIntegrationReceipts = pgTable(
  "production_integration_receipt",
  {
    projectId: text("projectId")
      .notNull()
      .references(() => productionProjects.id, { onDelete: "cascade" }),
    actorUserId: text("actorUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mutationId: text("mutationId").notNull(),
    provider: text("provider").notNull(),
    operation: text("operation").notNull(),
    requestDigest: text("requestDigest").notNull(),
    state: text("state").notNull().default("pending"),
    externalId: text("externalId"),
    response: jsonb("response").$type<Record<string, unknown> | null>(),
    errorCode: text("errorCode"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "production_integration_receipt_pkey",
      columns: [table.projectId, table.actorUserId, table.mutationId],
    }),
    index("idx_production_integration_receipt_state").on(
      table.provider,
      table.state,
      table.updatedAt,
    ),
    check(
      "production_integration_receipt_mutation_check",
      sql`${table.mutationId} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
    ),
    check("production_integration_receipt_provider_check", sql`length(btrim(${table.provider})) between 1 and 80`),
    check("production_integration_receipt_operation_check", sql`length(btrim(${table.operation})) between 1 and 120`),
    check("production_integration_receipt_digest_check", sql`${table.requestDigest} ~ '^sha256:[0-9a-f]{64}$'`),
    check("production_integration_receipt_state_check", sql`${table.state} in ('pending', 'succeeded', 'failed', 'uncertain')`),
    check("production_integration_receipt_response_check", sql`${table.response} is null or jsonb_typeof(${table.response}) = 'object'`),
    check(
      "production_integration_receipt_result_check",
      sql`(${table.state} = 'pending' and ${table.response} is null and ${table.errorCode} is null)
        or (${table.state} = 'succeeded' and ${table.response} is not null and ${table.errorCode} is null)
        or (${table.state} in ('failed', 'uncertain') and ${table.errorCode} is not null)`,
    ),
  ],
);

export const productionIntegrationConnections = pgTable(
  "production_integration_connection",
  {
    projectId: text("projectId")
      .notNull()
      .references(() => productionProjects.id, { onDelete: "cascade" }),
    actorUserId: text("actorUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    ciphertext: text("ciphertext").notNull(),
    externalAccountId: text("externalAccountId"),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    expiresAt: timestamp("expiresAt", { mode: "date", withTimezone: true }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "production_integration_connection_pkey",
      columns: [table.projectId, table.actorUserId, table.provider],
    }),
    index("idx_production_integration_connection_actor").on(
      table.actorUserId,
      table.updatedAt.desc(),
    ),
    check("production_integration_connection_provider_check", sql`${table.provider} in ('google-workspace')`),
    check("production_integration_connection_ciphertext_check", sql`length(${table.ciphertext}) between 32 and 16384`),
    check("production_integration_connection_scopes_check", sql`jsonb_typeof(${table.scopes}) = 'array'`),
  ],
);

export const productionIntegrationOauthStates = pgTable(
  "production_integration_oauth_state",
  {
    stateHash: text("stateHash").primaryKey(),
    projectId: text("projectId")
      .notNull()
      .references(() => productionProjects.id, { onDelete: "cascade" }),
    actorUserId: text("actorUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    redirectPath: text("redirectPath").notNull(),
    expiresAt: timestamp("expiresAt", { mode: "date", withTimezone: true }).notNull(),
    consumedAt: timestamp("consumedAt", { mode: "date", withTimezone: true }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_production_integration_oauth_expiry")
      .on(table.expiresAt)
      .where(sql`${table.consumedAt} is null`),
    check("production_integration_oauth_state_hash_check", sql`${table.stateHash} ~ '^sha256:[0-9a-f]{64}$'`),
    check("production_integration_oauth_state_provider_check", sql`${table.provider} in ('google-workspace')`),
    check(
      "production_integration_oauth_state_redirect_check",
      sql`${table.redirectPath} ~ '^/production(?:/|$)' and length(${table.redirectPath}) <= 512`,
    ),
    check("production_integration_oauth_state_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const productionPushSubscriptions = pgTable(
  "production_push_subscription",
  {
    projectId: text("projectId")
      .notNull()
      .references(() => productionProjects.id, { onDelete: "cascade" }),
    actorUserId: text("actorUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpointHash: text("endpointHash").notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    expirationTime: bigint("expirationTime", { mode: "number" }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "production_push_subscription_pkey",
      columns: [table.projectId, table.actorUserId, table.endpointHash],
    }),
    index("idx_production_push_subscription_project").on(
      table.projectId,
      table.updatedAt.desc(),
    ),
    check("production_push_subscription_endpoint_hash_check", sql`${table.endpointHash} ~ '^sha256:[0-9a-f]{64}$'`),
    check("production_push_subscription_endpoint_check", sql`${table.endpoint} ~ '^https://' and length(${table.endpoint}) <= 4096`),
    check(
      "production_push_subscription_key_check",
      sql`length(${table.p256dh}) between 32 and 512 and length(${table.auth}) between 8 and 256`,
    ),
    check(
      "production_push_subscription_expiry_check",
      sql`${table.expirationTime} is null or ${table.expirationTime} >= 0`,
    ),
  ],
);

export const productionEpisodeVoiceCommentaries = pgTable(
  "production_episode_voice_commentary",
  {
    id: text("id").primaryKey(),
    projectId: text("projectId")
      .notNull()
      .references(() => productionProjects.id, { onDelete: "cascade" }),
    episodeId: text("episodeId").notNull(),
    authorUserId: text("authorUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    track: jsonb("track").$type<ProductionVoiceCommentaryTrackMeta>().notNull(),
    durationMs: integer("durationMs").notNull(),
    contentType: text("contentType").notNull(),
    byteLength: integer("byteLength").notNull(),
    sha256: text("sha256").notNull(),
    objectReference: jsonb("objectReference").$type<LocatedPrivateObjectReference>().notNull(),
    requestHash: text("requestHash").notNull(),
    operationId: text("operationId").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull(),
    expiresAt: timestamp("expiresAt", { mode: "date", withTimezone: true }).notNull(),
    deletedAt: timestamp("deletedAt", { mode: "date", withTimezone: true }),
    deleteOperationId: text("deleteOperationId"),
  },
  (table) => [
    unique("production_episode_voice_commentary_operation_unique").on(table.authorUserId, table.operationId),
    index("idx_production_episode_voice_commentary_episode").on(
      table.projectId,
      table.episodeId,
      table.createdAt.desc(),
    ),
    index("idx_production_episode_voice_commentary_expiry").on(table.expiresAt),
    check(
      "production_episode_voice_commentary_hashes_check",
      sql`${table.sha256} ~ '^[a-f0-9]{64}$' and ${table.requestHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "production_episode_voice_commentary_track_check",
      sql`jsonb_typeof(${table.track}) = 'object'
        and ${table.track}->>'id' = ${table.id}
        and ${table.track}->>'episodeId' = ${table.episodeId}`,
    ),
    check(
      "production_episode_voice_commentary_retention_check",
      sql`${table.expiresAt} > ${table.createdAt} and ${table.expiresAt} <= ${table.createdAt} + interval '30 days'`,
    ),
  ],
);

/**
 * AD 검수 레드라인 스트로크 JSONB 페이로드 계약.
 * 스키마 계층에서 모듈 DTO 역참조(순환 의존)를 막기 위해 최소 구조를 직접 선언한다.
 */
export interface ProductionQaRedlinePoint {
  readonly x: number;
  readonly y: number;
}

export interface ProductionQaRedlineStroke {
  readonly id: string;
  readonly cutNumber: number;
  readonly color?: string;
  readonly width?: number;
  readonly points: readonly ProductionQaRedlinePoint[];
  readonly note?: string;
  readonly voicePinUrl?: string;
}

const divisionTzTimestamp = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

/**
 * 컷 슬라이스(Cut-Slice) 분업 단위 원장.
 * 1화 분량(예: 70~100컷)을 공정별·구간별로 나누고 레이어 폴더 쓰기 권위와 리스 만료를 추적한다.
 */
export const productionCutSlice = pgTable(
  "production_cut_slice",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => productionProjects.id, { onDelete: "cascade" }),
    episodeId: text("episode_id").notNull(),
    stageCode: text("stage_code").notNull(),
    cutStart: integer("cut_start").notNull(),
    cutEnd: integer("cut_end").notNull(),
    allowedFolders: jsonb("allowed_folders").$type<string[]>().notNull().default([]),
    assigneeUserId: text("assignee_user_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status").notNull().default("assigned"),
    leaseExpiresAt: divisionTzTimestamp("lease_expires_at"),
    latestRevHash: text("latest_rev_hash"),
    dueAt: divisionTzTimestamp("due_at"),
    updatedAt: divisionTzTimestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_production_cut_slice_project_episode_stage").on(
      table.projectId,
      table.episodeId,
      table.stageCode,
      table.cutStart,
    ),
    index("idx_production_cut_slice_assignee_status").on(table.assigneeUserId, table.status),
    index("idx_production_cut_slice_project_due").on(table.projectId, table.dueAt),
    check("production_cut_slice_id_check", sql`char_length(btrim(${table.id})) between 1 and 160`),
    check(
      "production_cut_slice_episode_check",
      sql`char_length(btrim(${table.episodeId})) between 1 and 160`,
    ),
    check(
      "production_cut_slice_stage_check",
      sql`${table.stageCode} in ('script','storyboard','bg3d','line','flat','shade','fx','lettering','qa_final')`,
    ),
    check(
      "production_cut_slice_cut_range_check",
      sql`${table.cutStart} >= 1 and ${table.cutEnd} >= ${table.cutStart} and ${table.cutEnd} <= 10000`,
    ),
    check(
      "production_cut_slice_allowed_folders_check",
      sql`jsonb_typeof(${table.allowedFolders}) = 'array'`,
    ),
    check(
      "production_cut_slice_status_check",
      sql`${table.status} in ('assigned','in_progress','submitted','in_qa','retake','approved','stitched')`,
    ),
  ],
);

/**
 * 바이너리 에셋(.clip/.psd/.blend/.skp/.vrm 등) 단독 체크아웃 잠금 테이블.
 * 동시 편집 충돌을 막고 만료 자동 회수 및 PD 강제 회수 이력을 일관되게 보장한다.
 */
export const productionBinaryLock = pgTable(
  "production_binary_lock",
  {
    assetKey: text("asset_key").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => productionProjects.id, { onDelete: "cascade" }),
    holderUserId: text("holder_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lockReason: text("lock_reason").notNull(),
    lockedAt: divisionTzTimestamp("locked_at").notNull().defaultNow(),
    expiresAt: divisionTzTimestamp("expires_at").notNull(),
  },
  (table) => [
    index("idx_production_binary_lock_project_expires").on(table.projectId, table.expiresAt),
    index("idx_production_binary_lock_holder").on(table.holderUserId, table.expiresAt),
    check(
      "production_binary_lock_asset_key_check",
      sql`char_length(btrim(${table.assetKey})) between 1 and 320`,
    ),
    check(
      "production_binary_lock_reason_check",
      sql`char_length(btrim(${table.lockReason})) between 1 and 500`,
    ),
    check("production_binary_lock_expiry_check", sql`${table.expiresAt} > ${table.lockedAt}`),
  ],
);

/**
 * AD 5종 자동 레귤레이션 검수 및 레드라인 스트로크 이력 테이블.
 * 팔레트 이탈(ΔE), 선폭 변동계수(CV), 모바일 375px 가독성, Rights BOM 통과 여부를 영속화한다.
 */
export const productionQaInspection = pgTable(
  "production_qa_inspection",
  {
    id: text("id").primaryKey(),
    cutSliceId: text("cut_slice_id")
      .notNull()
      .references(() => productionCutSlice.id, { onDelete: "cascade" }),
    revisionHash: text("revision_hash").notNull(),
    paletteDriftMax: doublePrecision("palette_drift_max").notNull(),
    lineWidthCv: doublePrecision("line_width_cv").notNull(),
    mobile375Ok: boolean("mobile_375_ok").notNull(),
    rightsBomOk: boolean("rights_bom_ok").notNull(),
    redlineStrokes: jsonb("redline_strokes").$type<ProductionQaRedlineStroke[]>().notNull().default([]),
    verdict: text("verdict").notNull(),
    reviewerUserId: text("reviewer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: divisionTzTimestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_production_qa_inspection_slice_created").on(table.cutSliceId, table.createdAt.desc()),
    index("idx_production_qa_inspection_reviewer").on(table.reviewerUserId, table.createdAt.desc()),
    check(
      "production_qa_inspection_id_check",
      sql`char_length(btrim(${table.id})) between 1 and 160`,
    ),
    check(
      "production_qa_inspection_revision_check",
      sql`char_length(btrim(${table.revisionHash})) between 6 and 160`,
    ),
    check(
      "production_qa_inspection_palette_drift_check",
      sql`${table.paletteDriftMax} >= 0 and ${table.paletteDriftMax} <= 200`,
    ),
    check(
      "production_qa_inspection_line_width_cv_check",
      sql`${table.lineWidthCv} >= 0 and ${table.lineWidthCv} <= 10`,
    ),
    check(
      "production_qa_inspection_redline_strokes_check",
      sql`jsonb_typeof(${table.redlineStrokes}) = 'array'`,
    ),
    check(
      "production_qa_inspection_verdict_check",
      sql`${table.verdict} in ('approved','conditional','retake','rejected')`,
    ),
  ],
);

/**
 * 스튜디오 정산·인세 원장 테이블.
 * Studio No.9식 기본 컷 단가 + 공정별 인세(hybrid-base-plus-royalty)를 기본 모델로 지원하고,
 * 한국 CP 표준 MG 선공제 + RS(mg-recoup-rs), 컷당 정산(per-cut), 정액(flat)을 함께 관리한다.
 */
export const productionRoyaltyLedger = pgTable(
  "production_royalty_ledger",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => productionProjects.id, { onDelete: "cascade" }),
    episodeId: text("episode_id").notNull(),
    payeeUserId: text("payee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    roleCode: text("role_code").notNull(),
    settlementModel: text("settlement_model").notNull().default("hybrid-base-plus-royalty"),
    approvedCuts: integer("approved_cuts").notNull().default(0),
    baseAmountKrw: bigint("base_amount_krw", { mode: "number" }).notNull().default(0),
    royaltyBps: integer("royalty_bps").notNull().default(0),
    mgBalanceKrw: bigint("mg_balance_krw", { mode: "number" }).notNull().default(0),
    status: text("status").notNull().default("accruing"),
    settledAt: divisionTzTimestamp("settled_at"),
  },
  (table) => [
    uniqueIndex("production_royalty_ledger_payee_episode_role_unique").on(
      table.projectId,
      table.episodeId,
      table.payeeUserId,
      table.roleCode,
    ),
    index("idx_production_royalty_ledger_project_status").on(
      table.projectId,
      table.status,
      table.episodeId,
    ),
    index("idx_production_royalty_ledger_payee").on(table.payeeUserId, table.status),
    check(
      "production_royalty_ledger_id_check",
      sql`char_length(btrim(${table.id})) between 1 and 160`,
    ),
    check(
      "production_royalty_ledger_role_check",
      sql`${table.roleCode} in ('pd','art_director','writer','storyboard','bg3d','line','flat','shade','finishing_lettering')`,
    ),
    check(
      "production_royalty_ledger_model_check",
      sql`${table.settlementModel} in ('hybrid-base-plus-royalty','mg-recoup-rs','per-cut','flat')`,
    ),
    check("production_royalty_ledger_approved_cuts_check", sql`${table.approvedCuts} >= 0`),
    check("production_royalty_ledger_base_amount_check", sql`${table.baseAmountKrw} >= 0`),
    check(
      "production_royalty_ledger_royalty_bps_check",
      sql`${table.royaltyBps} between 0 and 10000`,
    ),
    check("production_royalty_ledger_mg_balance_check", sql`${table.mgBalanceKrw} >= 0`),
    check(
      "production_royalty_ledger_status_check",
      sql`${table.status} in ('accruing','ready','settled','disputed','void')`,
    ),
  ],
);

export type ProductionCutSliceRow = typeof productionCutSlice.$inferSelect;
export type NewProductionCutSliceRow = typeof productionCutSlice.$inferInsert;

export type ProductionBinaryLockRow = typeof productionBinaryLock.$inferSelect;
export type NewProductionBinaryLockRow = typeof productionBinaryLock.$inferInsert;

export type ProductionQaInspectionRow = typeof productionQaInspection.$inferSelect;
export type NewProductionQaInspectionRow = typeof productionQaInspection.$inferInsert;

export type ProductionRoyaltyLedgerRow = typeof productionRoyaltyLedger.$inferSelect;
export type NewProductionRoyaltyLedgerRow = typeof productionRoyaltyLedger.$inferInsert;
