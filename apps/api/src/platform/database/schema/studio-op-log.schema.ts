import {
  bigint,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users } from "./auth.schema";
import { creatorWorks } from "./creator.schema";

/**
 * op 채널 병행 로그 (HOST_INSERTION_SPEC 2절). Yjs CRDT 로그(creator_work_crdt_*)와
 * 나란히 두는 검증·복제 용도 기록이며, 프로덕션 권위는 CRDT 쪽에 그대로 있다.
 * sequence는 전역 identity — 방(workId)별 정렬은 (workId, sequence) 인덱스가 맡고,
 * (workId, opId) 유니크가 재제출 dedupe 정본이다.
 */
export const creatorWorkOpLogs = pgTable(
  "creator_work_op_log",
  {
    workId: text("workId").notNull(),
    sequence: bigint("sequence", { mode: "bigint" }).generatedAlwaysAsIdentity(),
    opId: text("opId").notNull(),
    actorId: text("actorId").notNull(),
    actorUserId: text("actorUserId"),
    op: jsonb("op").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "creator_work_op_log_work_fkey",
      columns: [t.workId],
      foreignColumns: [creatorWorks.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "creator_work_op_log_actor_fkey",
      columns: [t.actorUserId],
      foreignColumns: [users.id],
    }).onDelete("set null"),
    primaryKey({ name: "creator_work_op_log_pkey", columns: [t.workId, t.sequence] }),
    unique("creator_work_op_log_work_op_id_unique").on(t.workId, t.opId),
    index("idx_creator_work_op_log_actor_created").on(t.actorId, t.createdAt.desc()),
    check("creator_work_op_log_op_id_check", sql`length(${t.opId}) between 3 and 200`),
    check("creator_work_op_log_op_object_check", sql`jsonb_typeof(${t.op}) = 'object'`),
  ]
);

/**
 * 방 단위 스냅샷 기준점. snapshot JSON은 {seq, state, opIds} 전체를 담는다 —
 * 계약 요구 1(스냅샷 응답에 포함 opId 집합)은 이 행이 있어 재시작 뒤에도 지켜진다.
 */
export const creatorWorkOpSnapshots = pgTable(
  "creator_work_op_snapshot",
  {
    workId: text("workId").primaryKey(),
    seq: bigint("seq", { mode: "bigint" }).notNull().default(sql`0`),
    snapshot: jsonb("snapshot").notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "creator_work_op_snapshot_work_fkey",
      columns: [t.workId],
      foreignColumns: [creatorWorks.id],
    }).onDelete("cascade"),
    check("creator_work_op_snapshot_seq_check", sql`${t.seq} >= 0`),
    check(
      "creator_work_op_snapshot_object_check",
      sql`jsonb_typeof(${t.snapshot}) = 'object'`
    ),
  ]
);
