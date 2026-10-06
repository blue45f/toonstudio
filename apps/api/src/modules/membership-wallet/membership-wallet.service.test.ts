import { beforeEach, describe, expect, it, vi } from "vitest";

import { MembershipWalletService } from "./membership-wallet.service";

// grantRewardMilestone의 지급·멱등·제한 게이트만 검증하는 인메모리 가짜 풀.
// wallet_lot의 (accountId, sourceKey) 유니크 + ON CONFLICT DO NOTHING 의미를 흉내낸다.
type FakeLot = { id: string; accountId: string; source: string; sourceKey: string; amount: number };
type FakeLedgerEntry = { amount: number; reason: string; referenceKey: string | null };

const fakeDb = vi.hoisted(() => {
  const state = {
    restricted: false,
    balance: 0,
    lifetimeGranted: 0,
    lots: [] as FakeLot[],
    ledger: [] as FakeLedgerEntry[],
    connectCalls: 0,
  };

  function accountRow() {
    return {
      id: "account-1",
      userId: "user-1",
      asset: "reward_point",
      availableAmount: state.balance,
      reservedAmount: 0,
      lifetimeGranted: state.lifetimeGranted,
      lifetimeSpent: 0,
    };
  }

  function clientQuery(sql: string, params: unknown[] = []) {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO wallet_account")) return { rows: [] };
    if (sql.includes("INSERT INTO wallet_lot")) {
      const [lotId, accountId, , , source, sourceKey, , amount] = params as [
        string, string, string, string, string, string, unknown, number,
      ];
      const existing = state.lots.find(
        (lot) => lot.accountId === accountId && lot.sourceKey === sourceKey,
      );
      if (existing) return { rows: [] };
      state.lots.push({ id: lotId, accountId, source, sourceKey, amount });
      return { rows: [{ id: lotId }] };
    }
    if (sql.includes("SELECT id FROM wallet_lot")) {
      const [accountId, sourceKey] = params as [string, string];
      const existing = state.lots.find(
        (lot) => lot.accountId === accountId && lot.sourceKey === sourceKey,
      );
      return { rows: existing ? [{ id: existing.id }] : [] };
    }
    if (sql.includes("FROM wallet_account")) return { rows: [accountRow()] };
    if (sql.includes("UPDATE wallet_account")) {
      const amount = Number(params[1]);
      state.balance += amount;
      state.lifetimeGranted += amount;
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO wallet_ledger_entry")) {
      // VALUES ($1..$6, $6, 0, $7, $8, $9, $10) — amount가 $6 하나로 두 번 쓰인다.
      state.ledger.push({
        amount: Number(params[5]),
        reason: String(params[6]),
        referenceKey: (params[7] as string | null) ?? null,
      });
      return { rows: [] };
    }
    throw new Error(`unexpected client sql: ${sql.slice(0, 80)}`);
  }

  const pool = {
    async query(sql: string) {
      if (sql.includes("member_level")) {
        return {
          rows: [{ trustLevel: state.restricted ? "restricted" : "new" }],
        };
      }
      throw new Error(`unexpected pool sql: ${sql.slice(0, 80)}`);
    },
    async connect() {
      state.connectCalls += 1;
      return { query: clientQuery, release: () => undefined };
    },
  };

  return { state, pool };
});

const fake = fakeDb.state;

vi.mock("../../platform/database", () => ({ dbPool: fakeDb.pool }));
vi.mock("../../server/app-config", () => ({
  isAdminUser: vi.fn(async () => false),
}));
vi.mock("../admin/admin-types", () => ({ logAuditAction: vi.fn() }));

const service = new MembershipWalletService();

describe("grantRewardMilestone welcome", () => {
  beforeEach(() => {
    fake.restricted = false;
    fake.balance = 0;
    fake.lifetimeGranted = 0;
    fake.lots = [];
    fake.ledger = [];
    fake.connectCalls = 0;
  });

  it("가입 확정 지급 경로로 웰컴 100P를 한 번 지급한다", async () => {
    const result = await service.grantRewardMilestone(
      "user-1",
      "welcome",
      "user-1",
    ) as { granted: boolean; amount?: number };

    expect(result.granted).toBe(true);
    expect(result.amount).toBe(100);
    expect(fake.balance).toBe(100);
    expect(fake.lots).toEqual([
      expect.objectContaining({
        source: "event",
        sourceKey: "reward:welcome:user-1",
        amount: 100,
      }),
    ]);
    expect(fake.ledger).toEqual([
      expect.objectContaining({ amount: 100, reason: "신규 가입 웰컴" }),
    ]);
  });

  it("같은 근거로 다시 호출해도 멱등하게 추가 지급하지 않는다", async () => {
    await service.grantRewardMilestone("user-1", "welcome", "user-1");
    const second = await service.grantRewardMilestone(
      "user-1",
      "welcome",
      "user-1",
    ) as { granted: boolean };

    expect(second.granted).toBe(false);
    expect(fake.balance).toBe(100);
    expect(fake.lots).toHaveLength(1);
    expect(fake.ledger).toHaveLength(1);
  });

  it("적립 제한 계정에는 지급하지 않는다", async () => {
    fake.restricted = true;

    const result = await service.grantRewardMilestone(
      "user-1",
      "welcome",
      "user-1",
    );

    expect(result).toEqual({
      granted: false,
      restricted: true,
      milestone: "welcome",
      points: 0,
    });
    expect(fake.balance).toBe(0);
    expect(fake.lots).toHaveLength(0);
    expect(fake.connectCalls).toBe(0);
  });
});
