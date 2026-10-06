import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import type { LocatedPrivateObjectReference } from "../../adapters/private-object-storage/private-object-storage.contract";
import { users } from "./auth.schema";
import { creatorWorks } from "./creator.schema";

export const studioRecordingBoothAssets = pgTable("studio_recording_booth_asset", {
  id: text("id").primaryKey(),
  workId: text("workId").notNull().references(() => creatorWorks.id, { onDelete: "cascade" }),
  authorUserId: text("authorUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  boothId: text("boothId").notNull(),
  durationMs: integer("durationMs").notNull(),
  contentType: text("contentType").notNull(),
  byteLength: integer("byteLength").notNull(),
  sha256: text("sha256").notNull(),
  objectReference: jsonb("objectReference").$type<LocatedPrivateObjectReference>().notNull(),
  requestHash: text("requestHash").notNull(),
  operationId: text("operationId").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  deletedAt: timestamp("deletedAt", { withTimezone: true }),
  deleteOperationId: text("deleteOperationId"),
}, (t) => [
  unique("studio_recording_booth_asset_operation_unique").on(t.authorUserId, t.operationId),
  index("studio_recording_booth_asset_work_idx").on(t.workId, t.createdAt),
  check("studio_recording_booth_asset_hashes", sql`${t.sha256} ~ '^[a-f0-9]{64}$' and ${t.requestHash} ~ '^[a-f0-9]{64}$'`),
]);
