import {
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./auth.schema";

/**
 * 작품별 Unity 가상스튜디오 공간 정의의 서버 정본 (4단계 — 월드 저작).
 * 한 행은 (workId, spaceId) 하나다. 정의는 공간 포맷 v1 JSON 전체
 * (크기·구역·소품·배경)를 담고, 웹 셸이 저장·동기화의 소유자다.
 *
 * revision은 낙관적 동시성 토큰이다. 클라이언트가 보낸 expectedRevision이
 * 다르면 덮어쓰지 않고 409로 거절한다 — 두 편집자가 서로의 배치를
 * 조용히 지우는 일을 막기 위해서다.
 *
 * definition은 zod 검증기(studio-unity-space-layout.dto)를 통과한 값만
 * 저장하므로 스키마 층에서 형식 검증을 반복하지 않는다.
 */
export const studioUnitySpaceLayouts = pgTable(
  "studio_godot_space_layout",
  {
    workId: text("workId").notNull(),
    spaceId: text("spaceId").notNull(),
    definition: jsonb("definition").notNull(),
    revision: integer("revision").notNull().default(0),
    updatedByUserId: text("updatedByUserId").notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workId, table.spaceId] }),
    foreignKey({
      columns: [table.updatedByUserId],
      foreignColumns: [users.id],
      name: "studio_godot_space_layout_updatedByUserId_user_id_fk",
    }).onDelete("restrict"),
  ],
);

export type StudioUnitySpaceLayoutRow = typeof studioUnitySpaceLayouts.$inferSelect;
