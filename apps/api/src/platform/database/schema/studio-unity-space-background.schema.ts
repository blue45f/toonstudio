import { sql } from "drizzle-orm";
import {
  check,
  customType,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./auth.schema";

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});

/**
 * 작품별 Unity 가상스튜디오 배경 GLB 업로드의 서버 정본
 * (배경 GLB 교체 업로드 — DESIGN §14).
 *
 * 페이로드를 DB bytea에 두는 것은 래스터 자산의 선례를 따른
 * 것이다. 비공개 오브젝트 저장소는 미구성 환경에서 503으로
 * 닫히는 별도 표면이라, 공간 배경처럼 "업로드하면 그 방에서
 * 바로 보여야 하는" 자산의 저장소로 맞지 않는다.
 *
 * assetId는 서버 발급 UUID다. 공간 정의는 `uploads/<assetId>.glb`
 * 참조만 싣고, 실제 바이트는 content 엔드포인트가 이 표에서
 * 서빙한다. 배경은 방 안 전원에게 보이는 장식층이라 서빙은
 * capability URL(assetId) 기반이다 — 권한 경계(멤버십)는
 * 업로드·목록·삭제가 진다.
 */
export const studioUnitySpaceBackgrounds = pgTable(
  "studio_godot_space_background",
  {
    workId: text("workId").notNull(),
    assetId: text("assetId").notNull(),
    fileName: text("fileName").notNull(),
    byteSize: integer("byteSize").notNull(),
    sha256: text("sha256").notNull(),
    payload: bytea("payload").notNull(),
    uploadedByUserId: text("uploadedByUserId").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "studio_godot_space_background_pkey",
      columns: [table.workId, table.assetId],
    }),
    foreignKey({
      columns: [table.uploadedByUserId],
      foreignColumns: [users.id],
      name: "studio_godot_space_background_uploadedByUserId_user_id_fk",
    }).onDelete("restrict"),
    check(
      "studio_godot_space_background_payload_size_check",
      sql`octet_length(${table.payload}) = ${table.byteSize}`,
    ),
  ],
);

export type StudioUnitySpaceBackgroundRow =
  typeof studioUnitySpaceBackgrounds.$inferSelect;
