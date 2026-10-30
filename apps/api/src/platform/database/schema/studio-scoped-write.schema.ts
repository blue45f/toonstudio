import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import type { StudioScopedWriteGrant, StudioScopedWriteTarget } from "@toonstudio/contracts/studio-scoped-write";
import { creatorWorks } from "./creator.schema";
import { users } from "./auth.schema";

/** 정책 변경과 새 객체 귀속은 작품 잠금 안에서 직렬화한다. 원고 내용은 이 테이블에 복제하지 않는다. */
export const creatorWorkScopedWritePolicies = pgTable("creator_work_scoped_write_policy", {
  workId: text("workId").primaryKey().references(() => creatorWorks.id, { onDelete: "cascade" }),
  policyVersion: integer("policyVersion").notNull(),
  targets: jsonb("targets").$type<StudioScopedWriteTarget[]>().notNull().default([]),
  grants: jsonb("grants").$type<StudioScopedWriteGrant[]>().notNull().default([]),
  ownership: jsonb("ownership").$type<Record<string, string>>().notNull().default({}),
  updatedBy: text("updatedBy").notNull().references(() => users.id),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).notNull(),
}, (table) => [
  check("creator_scoped_write_policy_version_check", sql`${table.policyVersion} > 0`),
  check("creator_scoped_write_policy_shape_check", sql`jsonb_typeof(${table.targets})='array' AND jsonb_array_length(${table.targets})<=100000
    AND jsonb_typeof(${table.grants})='array' AND jsonb_array_length(${table.grants})<=100000 AND jsonb_typeof(${table.ownership})='object'`),
]);

/** 기존 CRDT/op/Graph 영수증과 같은 transaction에서 당시 정책·본문 hash를 추가 기록한다. */
export const creatorWorkScopedWriteReceipts = pgTable("creator_work_scoped_write_receipt", {
  workId: text("workId").notNull().references(() => creatorWorks.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), mutationId: text("mutationId").notNull(),
  actorUserId: text("actorUserId").notNull().references(() => users.id),
  requestHash: text("requestHash").notNull(), policyVersion: integer("policyVersion").notNull(),
  targetIds: jsonb("targetIds").$type<string[]>().notNull(), response: jsonb("response").$type<unknown>(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.workId, table.kind, table.mutationId] }),
  check("creator_scoped_write_receipt_kind_check", sql`${table.kind} IN ('management','rest','crdt','op','graph','capture','asset','submission')`),
  check("creator_scoped_write_receipt_hash_check", sql`${table.requestHash} ~ '^[a-f0-9]{64}$' AND ${table.policyVersion}>0`),
  check("creator_scoped_write_receipt_shape_check", sql`length(${table.mutationId}) BETWEEN 1 AND 240
    AND jsonb_typeof(${table.targetIds})='array' AND jsonb_array_length(${table.targetIds})<=100000`),
]);
