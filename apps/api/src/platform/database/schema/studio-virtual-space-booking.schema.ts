import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.schema";
import { creatorWorks } from "./creator.schema";

/**
 * 가상 스튜디오 스페이스 예약·대기열·갤러리 좋아요의 서버 정본.
 *
 * 지금까지 이 상태는 StudioVirtualSpacePage의 useState에만 있어 새로고침하면
 * 사라졌고, 같은 월드의 다른 사용자와 공유되지도 않았다. scopeKey는
 * (projectId, worldScope)로 만든 불투명 범위 키이며 장식 배치의 개인 scopeKey와
 * 달리 모드(authoringMode)를 포함하지 않는다 — 같은 월드의 예약은 편집 모드와
 * 무관하게 하나여야 하기 때문이다.
 *
 * 시각은 클라이언트 순수 함수와 같은 epoch ms(bigint number)로 저장한다.
 * KST 표기 변환은 클라이언트 책임이며 서버는 순서·충돌 판정만 한다.
 */
export const studioVirtualSpaceBookings = pgTable(
  "studio_virtual_space_booking",
  {
    id: text("id").notNull(),
    scopeKey: text("scopeKey").notNull(),
    spaceId: text("spaceId").notNull(),
    spaceName: text("spaceName").notNull(),
    capacity: integer("capacity").notNull(),
    equipmentTags: jsonb("equipmentTags").notNull().default([]),
    startsAt: bigint("startsAt", { mode: "number" }).notNull(),
    endsAt: bigint("endsAt", { mode: "number" }).notNull(),
    bookerNames: jsonb("bookerNames").notNull().default([]),
    note: text("note").notNull().default(""),
    status: text("status").notNull().default("confirmed"),
    createdByUserId: text("createdByUserId").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "studio_virtual_space_booking_pkey",
      columns: [table.id],
    }),
    index("studio_virtual_space_booking_scope_space_start_idx").on(
      table.scopeKey,
      table.spaceId,
      table.startsAt,
    ),
    foreignKey({
      columns: [table.createdByUserId],
      foreignColumns: [users.id],
      name: "studio_virtual_space_booking_user_fkey",
    }).onDelete("cascade"),
  ],
);

/** 예약이 꽉 찬 시간대의 대기열. requestedAt 오름차순이 승격 순서(FIFO)다. */
export const studioVirtualSpaceWaitlistEntries = pgTable(
  "studio_virtual_space_waitlist_entry",
  {
    id: text("id").notNull(),
    scopeKey: text("scopeKey").notNull(),
    spaceId: text("spaceId").notNull(),
    spaceName: text("spaceName").notNull(),
    capacity: integer("capacity").notNull(),
    equipmentTags: jsonb("equipmentTags").notNull().default([]),
    startsAt: bigint("startsAt", { mode: "number" }).notNull(),
    endsAt: bigint("endsAt", { mode: "number" }).notNull(),
    bookerNames: jsonb("bookerNames").notNull().default([]),
    note: text("note").notNull().default(""),
    requestedAt: bigint("requestedAt", { mode: "number" }).notNull(),
    createdByUserId: text("createdByUserId").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "studio_virtual_space_waitlist_entry_pkey",
      columns: [table.id],
    }),
    index("studio_virtual_space_waitlist_scope_space_requested_idx").on(
      table.scopeKey,
      table.spaceId,
      table.requestedAt,
    ),
    foreignKey({
      columns: [table.createdByUserId],
      foreignColumns: [users.id],
      name: "studio_virtual_space_waitlist_entry_user_fkey",
    }).onDelete("cascade"),
  ],
);

/**
 * 갤러리 프레임 좋아요. (scopeKey, frameId, userId) 한 행이 좋아요 1건이다.
 * 좋아요 수는 행 개수로 세며, likedBy 목록은 클라이언트 통계 형태와 같은 의미다.
 * 조회수(views)는 세션 통계로 남기므로 여기 저장하지 않는다.
 */
export const studioVirtualSpaceGalleryLikes = pgTable(
  "studio_virtual_space_gallery_like",
  {
    scopeKey: text("scopeKey").notNull(),
    frameId: text("frameId").notNull(),
    userId: text("userId").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // PK의 앞부분 (scopeKey, frameId)이 프레임별 집계 조회를 그대로 커버한다.
    primaryKey({
      name: "studio_virtual_space_gallery_like_pkey",
      columns: [table.scopeKey, table.frameId, table.userId],
    }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "studio_virtual_space_gallery_like_user_fkey",
    }).onDelete("cascade"),
  ],
);

/** 작품 공간별 투표와 계정당 한 표. 식별 정보는 서버의 중복 확인에만 사용한다. */
export const studioSpacePolls = pgTable("studio_space_poll", {
  id: uuid("id").primaryKey(),
  workId: text("workId").notNull().references(() => creatorWorks.id, { onDelete: "cascade" }),
  world: text("world").notNull(), question: text("question").notNull(), options: text("options").array().notNull(),
  anonymous: boolean("anonymous").notNull(),
  createdBy: text("createdBy").references(() => users.id, { onDelete: "set null" }),
  creatorName: text("creatorName").notNull(), requestHash: text("requestHash").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  deadline: timestamp("deadline", { withTimezone: true }), closed: boolean("closed").notNull().default(false),
}, table => [
  index("studio_space_poll_current_idx").on(table.workId, table.world, table.createdAt.desc(), table.id.desc()),
  check("studio_space_poll_world_check", sql`length(${table.world}) BETWEEN 1 AND 256`),
  check("studio_space_poll_question_check", sql`length(${table.question}) BETWEEN 1 AND 200`),
  check("studio_space_poll_options_check", sql`cardinality(${table.options}) BETWEEN 2 AND 6`),
]);

export const studioSpacePollVotes = pgTable("studio_space_poll_vote", {
  pollId: uuid("pollId").notNull().references(() => studioSpacePolls.id, { onDelete: "cascade" }),
  voterId: text("voterId").notNull().references(() => users.id, { onDelete: "cascade" }),
  optionIndex: smallint("optionIndex").notNull(), voterName: text("voterName"),
}, table => [
  primaryKey({ columns: [table.pollId, table.voterId] }),
  check("studio_space_poll_vote_optionIndex_check", sql`${table.optionIndex} BETWEEN 0 AND 5`),
]);
