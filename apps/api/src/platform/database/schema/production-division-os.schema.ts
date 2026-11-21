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
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { users } from "./auth.schema";
import { productionProjects } from "./production.schema";

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

const tzTimestamp = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

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
    leaseExpiresAt: tzTimestamp("lease_expires_at"),
    latestRevHash: text("latest_rev_hash"),
    dueAt: tzTimestamp("due_at"),
    updatedAt: tzTimestamp("updated_at").notNull().defaultNow(),
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
    lockedAt: tzTimestamp("locked_at").notNull().defaultNow(),
    expiresAt: tzTimestamp("expires_at").notNull(),
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
    createdAt: tzTimestamp("created_at").notNull().defaultNow(),
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
    settledAt: tzTimestamp("settled_at"),
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
