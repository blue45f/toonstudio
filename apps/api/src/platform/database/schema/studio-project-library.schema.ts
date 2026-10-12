import {
  foreignKey,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./auth.schema";

/**
 * 작품 라이브러리(이어가기 목록)의 계정 동기화 정본 (사용성 웨이브 2).
 * 한 행은 (userId, projectId) 하나다. entry는 웹 라이브러리 항목 전체 JSON이며,
 * 형식 검증은 DTO(studio-project-library.dto)가 맡고 이 층은 반복 검증하지 않는다.
 *
 * entryUpdatedAt은 항목 자체의 updatedAt 미러다. 병합은 항목 단위 최신 우선이라
 * 두 기기가 서로 다른 작품을 고쳐도 서로 지우지 않고, 삭제는 클라이언트가
 * 명시한 deletedIds로만 일어난다.
 */
export const studioProjectLibraryEntries = pgTable(
  "studio_project_library_entry",
  {
    userId: text("userId").notNull(),
    projectId: text("projectId").notNull(),
    entry: jsonb("entry").notNull(),
    entryUpdatedAt: timestamp("entryUpdatedAt", { withTimezone: true }).notNull(),
    syncedAt: timestamp("syncedAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.projectId] }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "studio_project_library_entry_userId_user_id_fk",
    }).onDelete("cascade"),
  ],
);

export type StudioProjectLibraryEntryRow = typeof studioProjectLibraryEntries.$inferSelect;
