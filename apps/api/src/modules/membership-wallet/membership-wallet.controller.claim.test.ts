import { describe, expect, it, vi } from "vitest";

import { MembershipWalletController } from "./membership-wallet.controller";
import {
  ACTIVITY_CLAIM_METADATA_MAX_BYTES,
  ACTIVITY_CLAIM_METADATA_MAX_KEYS,
  ACTIVITY_CLAIM_METADATA_MAX_VALUE_LENGTH,
  sanitizeActivityClaimMetadata,
} from "./membership-activity-metadata";

import type { MembershipWalletService } from "./membership-wallet.service";

function setup() {
  const claimClientActivityPoints = vi.fn(async (_input: unknown) => ({ granted: true, points: 5 }));
  const controller = new MembershipWalletController({
    claimClientActivityPoints,
  } as unknown as MembershipWalletService);
  const forwarded = (): Record<string, unknown> => {
    const input = claimClientActivityPoints.mock.calls[0]?.[0] as { metadata?: Record<string, unknown> };
    return input.metadata ?? {};
  };
  return { controller, claimClientActivityPoints, forwarded };
}

describe("POST /membership/activity/claim 의 metadata 경계", () => {
  it("웹 클라이언트가 보내는 정상 metadata({ gameId })는 그대로 전달한다", async () => {
    const { controller, claimClientActivityPoints, forwarded } = setup();
    await controller.claimActivityPoints("user-1", {
      activity: "playground.used",
      sourceRef: "11111111-2222-4333-8444-555555555555",
      metadata: { gameId: "sketch-sprint" },
    });
    expect(claimClientActivityPoints).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        activity: "playground.used",
        sourceRef: "11111111-2222-4333-8444-555555555555",
      }),
    );
    expect(forwarded()).toEqual({ gameId: "sketch-sprint" });
  });

  it("거대하거나 깊은 metadata 는 지갑 로트·원장에 저장되기 전에 작은 값으로 줄인다", async () => {
    const { controller, forwarded } = setup();
    const hostile: Record<string, unknown> = {
      nested: { deep: { deeper: Array.from({ length: 10_000 }, (_, index) => `x${index}`) } },
      list: Array.from({ length: 5_000 }, () => "y".repeat(1_000)),
      blob: "z".repeat(5_000_000),
    };
    for (let index = 0; index < 500; index += 1) hostile[`key-${index}`] = "v".repeat(2_000);
    await controller.claimActivityPoints("user-1", {
      activity: "playground.used",
      sourceRef: "ref-1",
      metadata: hostile,
    });
    const metadata = forwarded();
    expect(Object.keys(metadata).length).toBeLessThanOrEqual(ACTIVITY_CLAIM_METADATA_MAX_KEYS);
    expect(Buffer.byteLength(JSON.stringify(metadata), "utf8")).toBeLessThanOrEqual(
      ACTIVITY_CLAIM_METADATA_MAX_BYTES,
    );
    for (const value of Object.values(metadata)) {
      expect(["string", "number", "boolean"]).toContain(typeof value);
      if (typeof value === "string") {
        expect(value.length).toBeLessThanOrEqual(ACTIVITY_CLAIM_METADATA_MAX_VALUE_LENGTH);
      }
    }
  });

  it.each([undefined, null, "문자열", 42, ["a", "b"]])("객체가 아닌 metadata(%j)는 빈 객체가 된다", async (raw) => {
    const { controller, forwarded } = setup();
    await controller.claimActivityPoints("user-1", {
      activity: "playground.used",
      sourceRef: "ref-1",
      metadata: raw as never,
    });
    expect(forwarded()).toEqual({});
  });
});

describe("sanitizeActivityClaimMetadata", () => {
  it("원시값만 남기고 중첩 객체·배열·함수·비유한 숫자는 버린다", () => {
    expect(
      sanitizeActivityClaimMetadata({
        gameId: "g1",
        score: 12.5,
        cleared: true,
        nested: { a: 1 },
        list: [1, 2],
        nan: Number.NaN,
        inf: Number.POSITIVE_INFINITY,
        nothing: null,
      }),
    ).toEqual({ gameId: "g1", score: 12.5, cleared: true });
  });

  it("긴 키는 버리고 긴 값은 자르며, __proto__ 같은 키가 프로토타입을 바꾸지 못한다", () => {
    const polluted = JSON.parse('{"__proto__":"x","constructor":"y","ok":"v"}') as Record<string, unknown>;
    const result = sanitizeActivityClaimMetadata({
      ["k".repeat(200)]: "too-long-key",
      long: "v".repeat(1_000),
      ...polluted,
    });
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result).not.toHaveProperty("kkkkkkkkkkkkkkkkkkkk");
    expect(String(result.long).length).toBe(ACTIVITY_CLAIM_METADATA_MAX_VALUE_LENGTH);
    expect(result.ok).toBe("v");
  });
});
