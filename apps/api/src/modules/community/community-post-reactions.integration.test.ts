import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 실제 Postgres 경계 테스트 — TEST_DATABASE_URL(관리 접속)이 있을 때만 실행된다.
// 전역 db 모듈이 import 시점에 DATABASE_URL로 풀을 만들므로, 전용 데이터베이스를
// 먼저 만들고 env를 바꾼 뒤에 서버 모듈을 동적으로 불러온다.
const adminUrl = process.env.TEST_DATABASE_URL;
const suite = describe.skipIf(!adminUrl);

const dbName = `toonstudio_reactions_${randomUUID().replaceAll("-", "")}`;
const migration = (name: string) =>
  readFileSync(
    new URL(`../../platform/database/migrations/${name}`, import.meta.url),
    "utf8",
  );

// ensureCommunityTables가 요구하는 컬럼만으로 구성한 최소 베이스.
// 신규 테이블(fan_post_like 등)은 실제 마이그레이션 파일로 만드는 것이 이 테스트의 목적이다.
const BASE_DDL = `
CREATE TABLE "user" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL DEFAULT '',
  "email" text,
  "avatar" text,
  "role" text NOT NULL DEFAULT 'user'
);
CREATE TABLE "fan_post" (
  "id" text PRIMARY KEY,
  "scope" text NOT NULL,
  "targetId" text NOT NULL,
  "targetLabel" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "kind" text NOT NULL DEFAULT 'talk',
  "title" text NOT NULL,
  "text" text NOT NULL,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "images" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "hidden" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE "fan_post_reply" (
  "id" text PRIMARY KEY,
  "postId" text NOT NULL,
  "parentId" text,
  "userId" text NOT NULL,
  "text" text NOT NULL,
  "deletedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE "review_reply" (
  "id" text PRIMARY KEY,
  "reviewId" text NOT NULL,
  "parentId" text,
  "userId" text NOT NULL,
  "text" text NOT NULL,
  "spoiler" boolean NOT NULL DEFAULT false,
  "deletedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE "community_cafe" (
  "id" text PRIMARY KEY,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "genre" text NOT NULL DEFAULT '',
  "kind" text NOT NULL DEFAULT 'genre',
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "visibility" text NOT NULL DEFAULT 'public',
  "joinPolicy" text NOT NULL DEFAULT 'open',
  "postingPolicy" text NOT NULL DEFAULT 'members',
  "rules" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'active',
  "createdBy" text NOT NULL,
  "hidden" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE "community_cafe_member" (
  "cafeId" text NOT NULL,
  "userId" text NOT NULL,
  "role" text NOT NULL DEFAULT 'member',
  "joinedAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE "community_cafe_join_request" (
  "id" text PRIMARY KEY,
  "cafeId" text NOT NULL,
  "userId" text NOT NULL,
  "message" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'pending',
  "reviewedBy" text,
  "reviewedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE "community_cafe_invite" (
  "id" text PRIMARY KEY,
  "cafeId" text NOT NULL,
  "codeHash" text NOT NULL,
  "createdBy" text,
  "maxUses" integer NOT NULL DEFAULT 1,
  "useCount" integer NOT NULL DEFAULT 0,
  "expiresAt" timestamp NOT NULL,
  "revokedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE "community_cafe_ban" (
  "cafeId" text NOT NULL,
  "userId" text NOT NULL,
  "reason" text NOT NULL DEFAULT '',
  "bannedBy" text,
  "expiresAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE "community_cafe_moderation_log" (
  "id" text PRIMARY KEY,
  "cafeId" text NOT NULL,
  "actorId" text,
  "action" text NOT NULL,
  "targetUserId" text,
  "targetPostId" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
`;

suite("real Postgres: community post reactions", () => {
  let admin: Pool;
  let target: Pool;
  let community: typeof import("../../server/community");
  let dbPool: Pool;

  const authorId = "author-1";
  const fanId = "fan-1";
  const postId = "post-reactions-1";
  const hiddenPostId = "post-reactions-hidden";

  beforeAll(async () => {
    if (!adminUrl) throw new Error("TEST_DATABASE_URL required");
    admin = new Pool({ connectionString: adminUrl, max: 1 });
    await admin.query(`CREATE DATABASE "${dbName}"`);
    const targetUrl = new URL(adminUrl);
    targetUrl.pathname = `/${dbName}`;
    target = new Pool({ connectionString: targetUrl.toString(), max: 4 });
    await target.query(BASE_DDL);
    // 빈 DB에 실제 마이그레이션을 적용하고, 기존 상태 재적용(멱등)까지 확인한다.
    await target.query(migration("0104_community_post_likes.sql"));
    await target.query(migration("0104_community_post_likes.sql"));

    await target.query(
      `INSERT INTO "user" ("id", "name", "avatar") VALUES ($1, '작성자', '#111'), ($2, '독자', '#222')`,
      [authorId, fanId],
    );
    await target.query(
      `INSERT INTO "fan_post" ("id", "scope", "targetId", "targetLabel", "userId", "title", "text")
       VALUES ($1, 'title', 'work-1', '작품', $2, '좋아요 테스트 글', '본문'),
              ($3, 'title', 'work-1', '작품', $2, '숨김 글', '본문')`,
      [postId, authorId, hiddenPostId],
    );
    await target.query(`UPDATE "fan_post" SET "hidden" = true WHERE "id" = $1`, [
      hiddenPostId,
    ]);

    process.env.DATABASE_URL = targetUrl.toString();
    community = await import("../../server/community");
    ({ dbPool } = await import("../../platform/database"));
  });

  afterAll(async () => {
    await dbPool?.end();
    await target?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
      await admin.end();
    }
  });

  it("좋아요 토글이 켜고 끄기를 반복해도 집계가 정확하다", async () => {
    await expect(community.toggleFanPostLike(fanId, postId)).resolves.toEqual({
      liked: true,
      likeCount: 1,
    });
    // 같은 회원의 중복 좋아요는 행이 하나라 집계가 늘지 않는다.
    await expect(community.toggleFanPostLike(authorId, postId)).resolves.toEqual({
      liked: true,
      likeCount: 2,
    });
    await expect(community.toggleFanPostLike(fanId, postId)).resolves.toEqual({
      liked: false,
      likeCount: 1,
    });
    await expect(community.toggleFanPostLike(fanId, postId)).resolves.toEqual({
      liked: true,
      likeCount: 2,
    });
  });

  it("상세 응답에 좋아요 수와 조회 회원의 좋아요 여부가 실린다", async () => {
    const asFan = await community.getFanPost(postId, fanId);
    expect(asFan?.likeCount).toBe(2);
    expect(asFan?.viewerLiked).toBe(true);

    const asGuest = await community.getFanPost(postId, null);
    expect(asGuest?.likeCount).toBe(2);
    expect(asGuest?.viewerLiked).toBe(false);
  });

  it("숨김·없는 글에는 좋아요할 수 없다", async () => {
    await expect(community.toggleFanPostLike(fanId, hiddenPostId)).resolves.toBeNull();
    await expect(community.toggleFanPostLike(fanId, "post-missing")).resolves.toBeNull();
  });
});
