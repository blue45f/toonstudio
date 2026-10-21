import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import type {
  TrafficD1Executor,
  TrafficD1Statement,
} from "../traffic-analytics/traffic-analytics-d1.client";

import { CreatorAnalyticsNotConnectedError } from "./creator-analytics.service";
import { D1CreatorAnalyticsTrafficReader } from "./creator-analytics.traffic-d1-repository";
import type { CreatorAnalyticsTrafficWindow } from "./creator-analytics.traffic-source";

// D1 리더 통합 경계 테스트 — 실제 D1 스키마를 인메모리 SQLite에 적용하고
// RPC executor 계약(statements 배치)으로만 읽는다.

const databases: DatabaseSync[] = [];
const schema = readFileSync(
  new URL(
    "../../../../../deploy/federated-data-plane/d1/traffic-analytics.sql",
    import.meta.url,
  ),
  "utf8",
);

const WINDOW: CreatorAnalyticsTrafficWindow = {
  start: new Date("2026-09-20T00:00:00.000Z"),
  end: new Date("2026-09-27T00:00:00.000Z"),
  previousStart: new Date("2026-09-13T00:00:00.000Z"),
};

function fixture(withSchema = true) {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  if (withSchema) database.exec(schema);
  const executor: TrafficD1Executor = {
    async execute(statements: readonly TrafficD1Statement[]) {
      return statements.map(({ sql, params }) => ({
        results: database.prepare(sql).all(...params) as Record<string, unknown>[],
      }));
    },
  };
  return { database, reader: new D1CreatorAnalyticsTrafficReader(executor) };
}

let sequence = 0;
function insertView(
  database: DatabaseSync,
  overrides: {
    path: string;
    occurredAt: string;
    source?: string;
    medium?: string;
    isBot?: 0 | 1;
  },
) {
  sequence += 1;
  database
    .prepare(
      `INSERT INTO traffic_page_view
         (id, occurred_at, visitor_hash, session_hash, path, source, medium,
          device_type, browser, os, screen_class, is_bot)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'desktop', 'Chrome', 'macOS', 'large', ?)`,
    )
    .run(
      `event-${sequence}`,
      overrides.occurredAt,
      "a".repeat(64),
      "b".repeat(64),
      overrides.path,
      overrides.source ?? "direct",
      overrides.medium ?? "none",
      overrides.isBot ?? 0,
    );
}

function seed(database: DatabaseSync) {
  database
    .prepare(
      `INSERT INTO traffic_session
         (session_hash, visitor_hash, first_seen_at, last_seen_at, entry_path,
          last_path, source, medium, device_type, browser, os, screen_class,
          page_views, engaged_seconds, is_bot, updated_at)
       VALUES (?, ?, ?, ?, '/title/moon', '/title/moon', 'direct', 'none',
               'desktop', 'Chrome', 'macOS', 'large', 0, 0, 0, ?)`,
    )
    .run(
      "b".repeat(64),
      "a".repeat(64),
      "2026-09-13T00:00:00.000Z",
      "2026-09-26T00:00:00.000Z",
      "2026-09-26T00:00:00.000Z",
    );
  const at = (day: string) => `${day}T10:00:00.000Z`;
  // 현재 기간: 상세 2, 1화 3, 2화 1 (유입은 상세+리더 경로 합산)
  insertView(database, { path: "/title/moon", occurredAt: at("2026-09-21") });
  insertView(database, { path: "/title/moon", occurredAt: at("2026-09-22") });
  for (let i = 0; i < 3; i += 1) {
    insertView(database, {
      path: "/title/moon/read/1",
      occurredAt: at("2026-09-23"),
      source: "google",
      medium: "organic",
    });
  }
  insertView(database, { path: "/title/moon/read/2", occurredAt: at("2026-09-24") });
  // 리다이렉트 경로는 소비로 세지 않지만 유입 집계에는 Postgres 리더와 같이 포함된다.
  for (let i = 0; i < 5; i += 1) {
    insertView(database, {
      path: "/title/moon/episodes",
      occurredAt: at("2026-09-24"),
      source: "internal",
      medium: "redirect",
    });
  }
  // 봇과 다른 작품은 제외한다.
  for (let i = 0; i < 4; i += 1) {
    insertView(database, { path: "/title/moon", occurredAt: at("2026-09-25"), isBot: 1 });
  }
  for (let i = 0; i < 7; i += 1) {
    insertView(database, { path: "/title/other", occurredAt: at("2026-09-25") });
  }
  // 직전 기간: 상세 1, 1화 2. 기간 밖 조회는 어느 쪽에도 들어가지 않는다.
  insertView(database, { path: "/title/moon", occurredAt: at("2026-09-15") });
  insertView(database, { path: "/title/moon/read/1", occurredAt: at("2026-09-16") });
  insertView(database, { path: "/title/moon/read/1", occurredAt: at("2026-09-17") });
  insertView(database, { path: "/title/moon", occurredAt: at("2026-09-01") });
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("D1CreatorAnalyticsTrafficReader", () => {
  it("상세·회차·직전 기간·유입을 Postgres 리더와 같은 의미로 집계한다", async () => {
    const { database, reader } = fixture();
    seed(database);
    const stats = await reader.readWindowStats("moon", WINDOW);
    expect(stats.detailViews).toBe(2);
    expect(stats.episodeViews.get(1)).toBe(3);
    expect(stats.episodeViews.get(2)).toBe(1);
    expect(stats.previousDetailViews).toBe(1);
    expect(stats.previousEpisodeViews.get(1)).toBe(2);
    expect(stats.sources[0]).toEqual({
      source: "internal",
      medium: "redirect",
      visits: 5,
    });
    expect(stats.sources.slice(1)).toEqual(
      expect.arrayContaining([
        { source: "direct", medium: "none", visits: 3 },
        { source: "google", medium: "organic", visits: 3 },
      ]),
    );
    expect(stats.sources).toHaveLength(3);
  });

  it("traffic_page_view 테이블이 없으면 0이 아니라 연결 전 오류를 던진다", async () => {
    const { reader } = fixture(false);
    await expect(reader.readWindowStats("moon", WINDOW)).rejects.toBeInstanceOf(
      CreatorAnalyticsNotConnectedError,
    );
  });

  it("executor 전송 오류는 연결 전으로 위장하지 않고 그대로 전파한다", async () => {
    const failing: TrafficD1Executor = {
      async execute() {
        throw new Error("rpc down");
      },
    };
    const reader = new D1CreatorAnalyticsTrafficReader(failing);
    await expect(reader.readWindowStats("moon", WINDOW)).rejects.toThrow("rpc down");
  });
});
