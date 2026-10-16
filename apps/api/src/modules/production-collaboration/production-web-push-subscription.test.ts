import { ConflictException, Logger } from "@nestjs/common";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductionCollaborationService } from "./production-collaboration.service";
import {
  ProductionIntegrationRepository,
  ProductionPushSubscriptionLimitError,
  type ProductionPushSubscriptionRecord,
} from "./production-integration.repository";
import { ProductionIntegrationService } from "./production-integration.service";
import { registerWebPushSubscription } from "./production-web-push-subscription";

const doubles = vi.hoisted(() => ({
  db: { transaction: vi.fn(), select: vi.fn() },
  send: vi.fn(),
}));

vi.mock("../../platform/database", async () => ({
  ...await import("../../platform/database/schema"),
  db: doubles.db,
  dbClient: {},
}));
vi.mock("./production-notification-provider", () => ({ sendProductionNotification: doubles.send }));

const dialect = new PgDialect();
const ENDPOINT_HASH = `sha256:${"a".repeat(64)}`;

function record(overrides: Partial<ProductionPushSubscriptionRecord> = {}): ProductionPushSubscriptionRecord {
  return {
    projectId: "project-1",
    actorUserId: "user-1",
    endpointHash: ENDPOINT_HASH,
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    p256dh: "p".repeat(64),
    auth: "a".repeat(22),
    expirationTime: null,
    ...overrides,
  };
}

interface Totals {
  readonly projectCount: number;
  readonly userCount: number;
  readonly registered: number;
}

interface FakeStatements {
  lock?: unknown;
  where?: unknown;
  oldestWhere?: unknown;
  oldestOrder?: unknown[];
  oldestLimit?: number;
  deleteWhere?: unknown;
}

/**
 * 구독 저장소 트랜잭션의 대역. 호출 순서(events)와 각 문장의 조건·정렬 객체를 기록해, 시험이 PgDialect 로 렌더링한
 * SQL 과 바인딩 값으로 검증할 수 있게 한다. oldestRows 는 "가장 오래 갱신되지 않은 본인 구독" 조회 결과다.
 */
function fakeTransaction(totals: Totals, oldestRows: readonly { endpointHash: string }[] = []) {
  const events: string[] = [];
  const statements: FakeStatements = {};
  const written: Record<string, unknown>[] = [];
  const transaction = {
    execute: vi.fn(async (query: unknown) => {
      events.push("lock");
      statements.lock = query;
    }),
    select: vi.fn((fields: Record<string, unknown>) => {
      if ("projectCount" in fields) {
        events.push("count");
        const counting = {
          from: () => counting,
          where: (condition: unknown) => {
            statements.where = condition;
            return Promise.resolve([totals]);
          },
        };
        return counting;
      }
      events.push("select-oldest");
      const oldest = {
        from: () => oldest,
        where: (condition: unknown) => {
          statements.oldestWhere = condition;
          return oldest;
        },
        orderBy: (...orders: unknown[]) => {
          statements.oldestOrder = orders;
          return oldest;
        },
        limit: (value: number) => {
          statements.oldestLimit = value;
          return Promise.resolve(oldestRows);
        },
      };
      return oldest;
    }),
    delete: vi.fn(() => ({
      where: (condition: unknown) => {
        events.push("delete-oldest");
        statements.deleteWhere = condition;
        return Promise.resolve();
      },
    })),
    insert: vi.fn(() => ({
      values: (value: Record<string, unknown>) => {
        events.push("write");
        written.push(value);
        return { onConflictDoUpdate: () => Promise.resolve() };
      },
    })),
  };
  doubles.db.transaction.mockImplementation(
    async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
  );
  return { events, statements, written, transaction };
}

function params(query: unknown): { sql: string; params: unknown[] } {
  const rendered = dialect.sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]);
  return { sql: rendered.sql, params: rendered.params };
}

beforeEach(() => {
  doubles.db.transaction.mockReset();
  doubles.db.select.mockReset();
  doubles.send.mockReset().mockResolvedValue({
    sent: 0,
    removedEndpointHashes: [],
    providerResponse: {},
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("웹 푸시 구독 저장소의 상한 검사", () => {
  const repository = new ProductionIntegrationRepository();
  const limits = { maxPerProject: 5, maxPerUser: 2 } as const;
  const OLDEST_HASH = `sha256:${"b".repeat(64)}`;

  it("프로젝트 단위 잠금을 잡고 집계한 뒤 같은 트랜잭션에서 저장한다", async () => {
    const test = fakeTransaction({ projectCount: 1, userCount: 1, registered: 0 });
    await repository.upsertPushSubscription(record(), limits);
    expect(test.events).toEqual(["lock", "count", "write"]);
    expect(test.written).toEqual([record()]);
    expect(params(test.statements.lock).params).toContain("production-push-subscription:project-1");
    // 집계는 해당 프로젝트 행으로 한정한다.
    expect(params(test.statements.where).params).toEqual(["project-1"]);
  });

  it("사용자 상한에 도달하면 거절하지 않고 본인의 가장 오래 갱신되지 않은 구독을 지운 뒤 저장한다", async () => {
    const test = fakeTransaction(
      { projectCount: 2, userCount: 2, registered: 0 },
      [{ endpointHash: OLDEST_HASH }],
    );
    await expect(repository.upsertPushSubscription(record(), limits)).resolves.toBeUndefined();
    // 잠금 → 집계 → 가장 오래된 본인 구독 조회 → 삭제 → 새 구독 저장, 모두 한 트랜잭션 안이다.
    expect(test.events).toEqual(["lock", "count", "select-oldest", "delete-oldest", "write"]);
    expect(doubles.db.transaction).toHaveBeenCalledTimes(1);
    expect(test.written).toEqual([record()]);

    // 조회는 이 프로젝트에서 이 사용자의 행으로만 한정하고, 갱신 시각이 가장 오래된 한 건을 고른다.
    expect(params(test.statements.oldestWhere).params).toEqual(["project-1", "user-1"]);
    expect(params(test.statements.oldestWhere).sql).toMatch(/"projectId" = \$1 and .*"actorUserId" = \$2/u);
    const order = (test.statements.oldestOrder ?? []).map((entry) => params(entry).sql);
    expect(order).toHaveLength(3);
    expect(order[0]).toMatch(/"updatedAt" asc/u);
    expect(order[1]).toMatch(/"createdAt" asc/u);
    expect(order[2]).toMatch(/"endpointHash" asc/u);
    expect(test.statements.oldestLimit).toBe(1);

    // 삭제도 같은 프로젝트·사용자에 조회로 고른 endpoint 하나로만 한정한다(다른 사용자의 구독을 건드리지 않는다).
    expect(params(test.statements.deleteWhere).params).toEqual(["project-1", "user-1", OLDEST_HASH]);
  });

  it("사용자 상한이 가득 차 있으면 프로젝트 상한도 가득 찼어도 교체로 받아들인다(행 수가 늘지 않는다)", async () => {
    const test = fakeTransaction(
      { projectCount: 5, userCount: 2, registered: 0 },
      [{ endpointHash: OLDEST_HASH }],
    );
    await expect(repository.upsertPushSubscription(record(), limits)).resolves.toBeUndefined();
    expect(test.events).toEqual(["lock", "count", "select-oldest", "delete-oldest", "write"]);
  });

  it("프로젝트 상한에 도달하면(사용자 상한은 남아 있을 때) 아무것도 지우지 않고 프로젝트 상한 오류를 던진다", async () => {
    const test = fakeTransaction({ projectCount: 5, userCount: 1, registered: 0 });
    const error = await repository.upsertPushSubscription(record(), limits).catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(ProductionPushSubscriptionLimitError);
    expect(error).toMatchObject({ scope: "project", limit: 5 });
    expect(test.events).toEqual(["lock", "count"]);
    expect(test.written).toEqual([]);
  });

  it("이미 등록한 endpoint 의 키 갱신은 두 상한에 도달해도 허용하고 다른 구독을 지우지 않는다", async () => {
    const test = fakeTransaction({ projectCount: 5, userCount: 2, registered: 1 });
    await repository.upsertPushSubscription(record({ expirationTime: 1_800_000_000_000 }), limits);
    expect(test.events).toEqual(["lock", "count", "write"]);
    expect(test.written[0]).toMatchObject({ expirationTime: 1_800_000_000_000 });
  });

  it("알림 대상 조회는 최근 갱신순으로 상한 개수만 읽는다", async () => {
    const calls: { where?: unknown; order?: unknown; limit?: number } = {};
    doubles.db.select.mockImplementation(() => {
      const chain = {
        from: () => chain,
        where: (condition: unknown) => {
          calls.where = condition;
          return chain;
        },
        orderBy: (order: unknown) => {
          calls.order = order;
          return chain;
        },
        limit: (value: number) => {
          calls.limit = value;
          return Promise.resolve([]);
        },
      };
      return chain;
    });
    await expect(repository.listPushSubscriptions("project-1", 200)).resolves.toEqual([]);
    expect(calls.limit).toBe(200);
    expect(params(calls.where).params).toEqual(["project-1"]);
    expect(params(calls.order).sql).toMatch(/"updatedAt"/u);
    expect(params(calls.order).sql).toMatch(/desc/iu);
  });
});

describe("registerWebPushSubscription", () => {
  const policy = { maxSubscriptionsPerProject: 200, maxSubscriptionsPerUser: 10 } as const;

  it("정책 상한을 저장소에 그대로 넘긴다", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    await registerWebPushSubscription({ upsertPushSubscription: upsert }, policy, record());
    expect(upsert).toHaveBeenCalledWith(record(), { maxPerProject: 200, maxPerUser: 10 });
  });

  it("프로젝트 상한 오류는 원인을 알려 주는 한국어 409 로 바꾼다", async () => {
    const upsert = vi.fn().mockRejectedValue(new ProductionPushSubscriptionLimitError(200));
    const error = await registerWebPushSubscription(
      { upsertPushSubscription: upsert },
      policy,
      record(),
    ).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: "production_push_subscription_limit",
      scope: "project",
      limit: 200,
      message: expect.stringContaining("알림 기기가 가득 찼어요(최대 200대)"),
    });
  });

  it("상한 오류가 아닌 저장소 오류는 그대로 전달한다", async () => {
    const failure = new Error("database offline");
    await expect(registerWebPushSubscription(
      { upsertPushSubscription: vi.fn().mockRejectedValue(failure) },
      policy,
      record(),
    )).rejects.toBe(failure);
  });
});

describe("ProductionIntegrationService 웹 푸시 상한 연결", () => {
  function fixture() {
    const projects = {
      getProject: vi.fn().mockResolvedValue({
        aggregate: { title: "Project" },
        access: { view: true, edit: true, manage: true },
      }),
    };
    const repository = {
      upsertPushSubscription: vi.fn().mockResolvedValue(undefined),
      listPushSubscriptions: vi.fn().mockResolvedValue([]),
      deletePushSubscriptionByHash: vi.fn().mockResolvedValue(undefined),
      beginMutation: vi.fn().mockResolvedValue({ replay: null }),
      countMutationsSince: vi.fn().mockResolvedValue(0),
      completeMutation: vi.fn().mockResolvedValue(undefined),
      failMutation: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ProductionIntegrationService(
      projects as unknown as ProductionCollaborationService,
      repository as unknown as ProductionIntegrationRepository,
    );
    return { projects, repository, service };
  }

  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    expirationTime: null,
    keys: { p256dh: "p".repeat(64), auth: "a".repeat(22) },
  } as const;

  it("기본 상한(프로젝트 200, 사용자 10)과 환경 변수로 바꾼 상한을 저장소에 넘긴다", async () => {
    const defaults = fixture();
    await expect(defaults.service.subscribeWebPush("user-1", "project-1", subscription))
      .resolves.toMatchObject({ subscribed: true });
    expect(defaults.repository.upsertPushSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-1", actorUserId: "user-1" }),
      { maxPerProject: 200, maxPerUser: 10 },
    );

    vi.stubEnv("PRODUCTION_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_PROJECT", "50");
    vi.stubEnv("PRODUCTION_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_USER", "3");
    const tuned = fixture();
    await tuned.service.subscribeWebPush("user-1", "project-1", subscription);
    expect(tuned.repository.upsertPushSubscription).toHaveBeenCalledWith(
      expect.anything(),
      { maxPerProject: 50, maxPerUser: 3 },
    );
  });

  it("서비스를 만들 때(서버 시작) 무시한 추가 허용 호스트를 한 번만 경고하고 정상 설정에는 경고하지 않는다", async () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    try {
      fixture();
      expect(warn).not.toHaveBeenCalled();

      vi.stubEnv(
        "PRODUCTION_WEB_PUSH_EXTRA_ALLOWED_HOSTS",
        "https://relay.example.com *.co.uk push.example-vendor.com",
      );
      const misconfigured = fixture();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain("2개 항목을 무시했습니다");

      // 요청을 처리하는 동안에는 같은 경고를 반복하지 않는다.
      await misconfigured.service.subscribeWebPush("user-1", "project-1", subscription);
      await misconfigured.service.subscribeWebPush("user-1", "project-1", subscription);
      expect(warn).toHaveBeenCalledTimes(1);

      vi.stubEnv("PRODUCTION_WEB_PUSH_EXTRA_ALLOWED_HOSTS", "push.example-vendor.com");
      fixture();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("상한에 걸린 구독 등록은 409 이고 응답에 구독 성공을 담지 않는다", async () => {
    const test = fixture();
    test.repository.upsertPushSubscription.mockRejectedValueOnce(
      new ProductionPushSubscriptionLimitError(200),
    );
    await expect(test.service.subscribeWebPush("user-1", "project-1", subscription))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it("프로젝트 조회 권한이 없으면 구독 저장을 시도하지 않는다", async () => {
    const test = fixture();
    test.projects.getProject.mockRejectedValueOnce(new Error("forbidden"));
    await expect(test.service.subscribeWebPush("user-1", "project-1", subscription)).rejects.toThrow();
    expect(test.repository.upsertPushSubscription).not.toHaveBeenCalled();
  });

  it("알림 전송은 프로젝트 구독 상한만큼만 읽어 온다", async () => {
    const test = fixture();
    await test.service.sendNotification("user-1", "project-1", {
      mutationId: "11111111-1111-4111-8111-111111111111",
      channel: "web-push",
      title: "검토 요청",
      body: "에피소드를 확인해 주세요.",
    });
    expect(test.repository.listPushSubscriptions).toHaveBeenCalledWith("project-1", 200);
  });
});
