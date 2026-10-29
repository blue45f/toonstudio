// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addQuickKey, removeQuickKey } from "./ai-quick-key";
import {
  FREE_AI_RUNTIME_BUDGET_STORAGE_KEY,
  getFreeAiRuntimeBudgetSnapshot,
  guardFreeAiRuntimeRequest,
  MANAGED_FREE_DAILY_REQUEST_LIMIT,
  recordFreeAiRuntimeResponse,
  resetFreeAiRuntimeBudget,
} from "./free-ai-runtime-budget";
import {
  getUserAiSnapshot,
  lockUserAi,
  setUserAiConfiguration,
  userAiConnectionsForCapability,
  userAiPersonalFirstConnectionsForCapability,
} from "./user-ai-store";
import { EMPTY_AI_CONFIGURATION } from "./user-ai-types";

import type { UserAiConfiguration, UserAiResolvedConnection } from "./user-ai-types";

// 실제 키가 아니라 형식만 맞춘 가짜 값이다.
const OLD_KEY = `gsk_${"o".repeat(52)}`;
const NEW_KEY = `gsk_${"n".repeat(52)}`;

function textRoute(): UserAiResolvedConnection {
  const route = userAiConnectionsForCapability("text")[0];
  if (!route) throw new Error("텍스트 경로가 없어요.");
  return route;
}

/** 이 설정에서 그 키를 쓰는 텍스트 경로. */
function routeOfKey(configuration: UserAiConfiguration, apiKey: string): UserAiResolvedConnection {
  const route = userAiConnectionsForCapability("text", configuration).find((item) => item.apiKey === apiKey);
  if (!route) throw new Error("그 키의 텍스트 경로가 없어요.");
  return route;
}

async function spendOnce(route: UserAiResolvedConnection) {
  await guardFreeAiRuntimeRequest(route, "text", "/models", "GET", undefined);
}

describe("setUserAiConfiguration — 경로 사용 기록 정리", () => {
  beforeEach(() => {
    localStorage.clear();
    resetFreeAiRuntimeBudget();
    lockUserAi(false);
  });

  afterEach(() => {
    lockUserAi(false);
    resetFreeAiRuntimeBudget();
  });

  it("키를 지우고 새 키를 넣어 같은 경로 ID를 다시 쓰면, 새 키는 옛 키의 사용 기록을 물려받지 않는다", async () => {
    const first = addQuickKey(EMPTY_AI_CONFIGURATION, "groq", OLD_KEY);
    setUserAiConfiguration(first.configuration);
    const oldRoute = textRoute();
    await spendOnce(oldRoute);
    expect(getFreeAiRuntimeBudgetSnapshot(oldRoute).requests).toBe(1);

    setUserAiConfiguration(removeQuickKey(getUserAiSnapshot().configuration, first.connectionId, first.keyId));
    setUserAiConfiguration(addQuickKey(getUserAiSnapshot().configuration, "groq", NEW_KEY).configuration);

    const newRoute = textRoute();
    // 연결·모델·키 ID가 같아 경로 ID도 같다. 기록은 키 값이 바뀐 시점에 지워진다.
    expect(newRoute.routeId).toBe(oldRoute.routeId);
    expect(newRoute.apiKey).toBe(NEW_KEY);
    expect(getFreeAiRuntimeBudgetSnapshot(newRoute).requests).toBe(0);
  });

  it("연결을 끄고 다시 켜기만 하면 같은 키라서 하루 사용 기록을 그대로 둔다", async () => {
    const first = addQuickKey(EMPTY_AI_CONFIGURATION, "groq", OLD_KEY);
    setUserAiConfiguration(first.configuration);
    const route = textRoute();
    await spendOnce(route);

    const current = getUserAiSnapshot().configuration;
    setUserAiConfiguration({ ...current, connections: current.connections.map((item) => ({ ...item, enabled: false })) });
    expect(userAiConnectionsForCapability("text")).toHaveLength(0);
    setUserAiConfiguration(current);

    expect(getFreeAiRuntimeBudgetSnapshot(textRoute()).requests).toBe(1);
  });

  it("잠금·새로 고침 뒤 같은 키를 다시 붙여 넣으면 같은 경로라서 하루 안전 한도 기록이 이어진다", async () => {
    setUserAiConfiguration(addQuickKey(EMPTY_AI_CONFIGURATION, "groq", OLD_KEY).configuration);
    const route = textRoute();
    for (let index = 0; index < 3; index += 1) await spendOnce(route);
    await recordFreeAiRuntimeResponse(route, 429, new Headers());

    // 기본 보관은 메모리 전용이라, 잠그거나 새로 고치면 설정이 비고 키를 다시 붙여 넣는다.
    lockUserAi(false);
    setUserAiConfiguration(addQuickKey(getUserAiSnapshot().configuration, "groq", OLD_KEY).configuration);

    const again = textRoute();
    expect(again.routeId).toBe(route.routeId);
    expect(getFreeAiRuntimeBudgetSnapshot(again)).toMatchObject({ requests: 3, blockedReason: "rate-limit" });
  });

  it("잠금·새로 고침 뒤 다른 키를 붙여 넣으면 같은 경로 ID라도 옛 키의 기록(결제 잠금 포함)을 물려받지 않는다", async () => {
    setUserAiConfiguration(addQuickKey(EMPTY_AI_CONFIGURATION, "groq", OLD_KEY).configuration);
    const oldRoute = textRoute();
    await spendOnce(oldRoute);
    await recordFreeAiRuntimeResponse(oldRoute, 402, new Headers());
    expect(getFreeAiRuntimeBudgetSnapshot(oldRoute).blockedReason).toBe("payment-required");

    lockUserAi(false);
    setUserAiConfiguration(addQuickKey(getUserAiSnapshot().configuration, "groq", NEW_KEY).configuration);

    const newRoute = textRoute();
    expect(newRoute.routeId).toBe(oldRoute.routeId);
    expect(getFreeAiRuntimeBudgetSnapshot(newRoute)).toMatchObject({ requests: 0, blockedReason: null });
    // 새 키로 요청을 보내면 그 키의 기록으로 새로 시작한다(옛 키의 결제 잠금에 걸리지 않는다).
    await expect(guardFreeAiRuntimeRequest(newRoute, "text", "/models", "GET", undefined)).resolves.toMatchObject({ guarded: true });
  });

  it("같은 세션에서 키를 지우고 같은 키를 다시 등록하면 안내대로 결제 잠금이 풀린다", async () => {
    const first = addQuickKey(EMPTY_AI_CONFIGURATION, "groq", OLD_KEY);
    setUserAiConfiguration(first.configuration);
    const route = textRoute();
    await recordFreeAiRuntimeResponse(route, 402, new Headers());

    setUserAiConfiguration(removeQuickKey(getUserAiSnapshot().configuration, first.connectionId, first.keyId));
    setUserAiConfiguration(addQuickKey(getUserAiSnapshot().configuration, "groq", OLD_KEY).configuration);

    expect(getFreeAiRuntimeBudgetSnapshot(textRoute()).blockedReason).toBeNull();
  });

  it("기록에는 키를 구별하는 짧은 표식만 남기고 키 값은 저장하지 않는다", async () => {
    setUserAiConfiguration(addQuickKey(EMPTY_AI_CONFIGURATION, "groq", OLD_KEY).configuration);
    await spendOnce(textRoute());

    const stored = localStorage.getItem(FREE_AI_RUNTIME_BUDGET_STORAGE_KEY) ?? "";
    expect(stored).not.toContain(OLD_KEY);
    expect(stored).not.toContain(OLD_KEY.slice(-8));
    expect(stored).toMatch(/"keyTag":"[0-9a-f]{8}"/u);
  });

  it("두 탭에 서로 다른 키를 붙여 경로 ID가 같아도 서로의 기록을 덮어쓰지 않는다(키마다 하루 한도·결제 잠금 유지)", async () => {
    // 메모리 전용 탭은 빈 설정에서 시작하므로, 탭마다 붙인 키가 모두 quick-groq:text-1:key-1이 된다. 기록은 두 탭이 함께 쓴다.
    const tabA = routeOfKey(addQuickKey(EMPTY_AI_CONFIGURATION, "groq", OLD_KEY).configuration, OLD_KEY);
    const tabB = routeOfKey(addQuickKey(EMPTY_AI_CONFIGURATION, "groq", NEW_KEY).configuration, NEW_KEY);
    expect(tabB.routeId).toBe(tabA.routeId);

    for (let index = 0; index < MANAGED_FREE_DAILY_REQUEST_LIMIT; index += 1) {
      await spendOnce(tabA);
      await spendOnce(tabB);
    }
    await expect(spendOnce(tabA)).rejects.toThrow(/안전 한도/u);
    await expect(spendOnce(tabB)).rejects.toThrow(/안전 한도/u);

    resetFreeAiRuntimeBudget();
    await recordFreeAiRuntimeResponse(tabA, 402, new Headers());
    await spendOnce(tabB);
    expect(getFreeAiRuntimeBudgetSnapshot(tabA).blockedReason).toBe("payment-required");
    await expect(spendOnce(tabA)).rejects.toThrow(/결제를 요구/u);
  });

  it("새로 고친 뒤 키를 다른 순서로 다시 붙여도 키마다 오늘 기록과 잠금이 이어진다", async () => {
    const both = addQuickKey(addQuickKey(EMPTY_AI_CONFIGURATION, "groq", OLD_KEY).configuration, "groq", NEW_KEY).configuration;
    setUserAiConfiguration(both);
    const oldRoute = routeOfKey(both, OLD_KEY);
    const newRoute = routeOfKey(both, NEW_KEY);
    for (let index = 0; index < 3; index += 1) await spendOnce(newRoute);
    await recordFreeAiRuntimeResponse(newRoute, 429, new Headers());
    await recordFreeAiRuntimeResponse(oldRoute, 402, new Headers());

    // 잠그거나 새로 고치면 설정이 빈다. 이번에는 새 키를 먼저 붙여 두 키의 자리(key-1·key-2)가 바뀐다.
    lockUserAi(false);
    setUserAiConfiguration(addQuickKey(getUserAiSnapshot().configuration, "groq", NEW_KEY).configuration);
    setUserAiConfiguration(addQuickKey(getUserAiSnapshot().configuration, "groq", OLD_KEY).configuration);

    const current = getUserAiSnapshot().configuration;
    expect(routeOfKey(current, NEW_KEY).routeId).toBe(oldRoute.routeId);
    expect(getFreeAiRuntimeBudgetSnapshot(routeOfKey(current, NEW_KEY))).toMatchObject({ requests: 3, blockedReason: "rate-limit" });
    expect(getFreeAiRuntimeBudgetSnapshot(routeOfKey(current, OLD_KEY)).blockedReason).toBe("payment-required");
  });

  it("표식 없는 옛 기록(이전 버전)은 오늘 횟수만 이어 받고, 키에 묶인 결제 잠금은 다른 키에 걸지 않는다", async () => {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(FREE_AI_RUNTIME_BUDGET_STORAGE_KEY, JSON.stringify({
      version: 1,
      entries: {
        "api.groq.com:quick-groq:text-1:key-1": {
          day: today,
          requests: 7,
          reservedTokens: 0,
          quotaFailures: 0,
          blockedReason: "payment-required",
          blockedUntil: null,
          updatedAt: Date.now(),
        },
      },
    }));

    setUserAiConfiguration(addQuickKey(EMPTY_AI_CONFIGURATION, "groq", NEW_KEY).configuration);
    const route = textRoute();
    expect(route.routeId).toBe("quick-groq:text-1:key-1");
    await expect(guardFreeAiRuntimeRequest(route, "text", "/models", "GET", undefined)).resolves.toMatchObject({ guarded: true });
    expect(getFreeAiRuntimeBudgetSnapshot(route)).toMatchObject({ requests: 8, blockedReason: null });

    // 그 옛 기록이 이 키의 것이었다면 제공자가 다시 402로 답하고, 이번에는 이 키의 표식과 함께 잠근다.
    await recordFreeAiRuntimeResponse(route, 402, new Headers());
    expect(getFreeAiRuntimeBudgetSnapshot(route).blockedReason).toBe("payment-required");
  });

  it("같은 키를 쓰는 다른 연결이 남아 있으면, 한 연결을 지워도 그 키의 결제 잠금은 풀리지 않는다", async () => {
    const quick = addQuickKey(EMPTY_AI_CONFIGURATION, "groq", OLD_KEY);
    const quickConnection = quick.configuration.connections[0]!;
    // 고급 설정에서 같은 주소·모델·키로 만든 연결.
    const copy = { ...quickConnection, id: "groq-advanced", label: "Groq 고급", priority: 90 };
    setUserAiConfiguration({ ...quick.configuration, connections: [quickConnection, copy] });
    await recordFreeAiRuntimeResponse(textRoute(), 402, new Headers());

    setUserAiConfiguration(removeQuickKey(getUserAiSnapshot().configuration, quick.connectionId, quick.keyId));
    const remaining = textRoute();
    expect(remaining.id).toBe("groq-advanced");
    expect(getFreeAiRuntimeBudgetSnapshot(remaining).blockedReason).toBe("payment-required");
  });

  it.each(["unverified", "switched-off"] as const)(
    "같은 키를 든 다른 연결이 %s이면 그 연결은 기록을 쓰지 않으므로, 삭제 후 다시 등록하면 결제 잠금이 풀린다",
    async (variant) => {
      const quick = addQuickKey(EMPTY_AI_CONFIGURATION, "groq", OLD_KEY);
      const quickConnection = quick.configuration.connections[0]!;
      // 옛 설정에서 가져온 "재확인 필요" 연결, 또는 고급 설정에서 만들어 꺼 둔 같은 키·모델의 연결.
      const duplicate = variant === "unverified"
        ? { ...quickConnection, id: "groq-migrated", label: "옛 설정", costPolicy: "unverified" as const, priority: 90 }
        : { ...quickConnection, id: "groq-advanced", label: "Groq 고급", enabled: false, priority: 90 };
      setUserAiConfiguration({ ...quick.configuration, connections: [quickConnection, duplicate] });
      await recordFreeAiRuntimeResponse(textRoute(), 402, new Headers());

      setUserAiConfiguration(removeQuickKey(getUserAiSnapshot().configuration, quick.connectionId, quick.keyId));
      setUserAiConfiguration(addQuickKey(getUserAiSnapshot().configuration, "groq", OLD_KEY).configuration);

      const again = textRoute();
      expect(again.apiKey).toBe(OLD_KEY);
      expect(getFreeAiRuntimeBudgetSnapshot(again).blockedReason).toBeNull();
      await expect(guardFreeAiRuntimeRequest(again, "text", "/models", "GET", undefined)).resolves.toMatchObject({ guarded: true });
    },
  );

  it.each(["connection", "key"] as const)(
    "%s을(를) 꺼 둔 동안 쓰지 않던 이미지 모델 프로필을 지워도 텍스트 키의 결제 잠금은 남는다",
    async (switchedOff) => {
      const base = addQuickKey(addQuickKey(EMPTY_AI_CONFIGURATION, "groq", OLD_KEY).configuration, "groq", NEW_KEY).configuration;
      const connection = base.connections[0]!;
      // 고급 설정에서 더하고 꺼 둔 이미지 모델 프로필(무료 정책은 텍스트만 허용하므로 꺼 두어야 저장된다).
      const imageProfile = { id: "image-1", label: "이미지", model: "groq-image", capability: "image" as const, enabled: false, priority: 20 };
      setUserAiConfiguration({ ...base, connections: [{ ...connection, models: [...(connection.models ?? []), imageProfile] }] });
      await recordFreeAiRuntimeResponse(routeOfKey(getUserAiSnapshot().configuration, OLD_KEY), 402, new Headers());

      const withLockedKeyOn = (configuration: UserAiConfiguration, on: boolean): UserAiConfiguration => ({
        ...configuration,
        connections: configuration.connections.map((item) => (switchedOff === "connection"
          ? { ...item, enabled: on }
          : { ...item, apiKeys: item.apiKeys?.map((key) => (key.apiKey === OLD_KEY ? { ...key, enabled: on } : key)) })),
      });
      setUserAiConfiguration(withLockedKeyOn(getUserAiSnapshot().configuration, false));
      // 키와 텍스트 모델은 그대로 두고, 쓰지 않던 이미지 모델 프로필만 지운다.
      const current = getUserAiSnapshot().configuration;
      setUserAiConfiguration({
        ...current,
        connections: current.connections.map((item) => ({ ...item, models: item.models?.filter((model) => model.id !== "image-1") })),
      });
      setUserAiConfiguration(withLockedKeyOn(getUserAiSnapshot().configuration, true));

      const again = routeOfKey(getUserAiSnapshot().configuration, OLD_KEY);
      expect(getFreeAiRuntimeBudgetSnapshot(again).blockedReason).toBe("payment-required");
      await expect(guardFreeAiRuntimeRequest(again, "text", "/models", "GET", undefined)).rejects.toThrow(/결제를 요구/u);
    },
  );

  it("다른 경로의 기록은 건드리지 않는다", async () => {
    const groq = addQuickKey(EMPTY_AI_CONFIGURATION, "groq", OLD_KEY);
    setUserAiConfiguration(groq.configuration);
    const groqRoute = textRoute();
    await spendOnce(groqRoute);

    // 다른 서비스 키를 더해도 기존 경로 기록은 남는다.
    setUserAiConfiguration(addQuickKey(getUserAiSnapshot().configuration, "gemini", `AIza${"G".repeat(35)}`).configuration);
    expect(getFreeAiRuntimeBudgetSnapshot(groqRoute).requests).toBe(1);
  });
});

describe("유료 키 자동 사용 — 연결마다 동의", () => {
  const DEEPSEEK = `sk-${"d".repeat(32)}`;
  const CLAUDE = `sk-ant-api03-${"c".repeat(40)}`;

  beforeEach(() => {
    lockUserAi(false);
  });

  afterEach(() => {
    lockUserAi(false);
  });

  it("한 유료 키에 한 동의가, 동의 없이 더한 다른 유료 키(AI 보조 카드 등)까지 자동 경로에 넣지 않는다", () => {
    const deepseek = addQuickKey(EMPTY_AI_CONFIGURATION, "deepseek", DEEPSEEK, { allowPaid: true });
    // 비용 동의 없이 연결한 Claude 키(AI 보조 대화상자용).
    const withClaude = addQuickKey(deepseek.configuration, "anthropic", CLAUDE);
    setUserAiConfiguration(withClaude.configuration);

    const firstIds = () => userAiPersonalFirstConnectionsForCapability("text").map((route) => route.id);
    expect(firstIds()).toContain(deepseek.connectionId);
    expect(firstIds()).not.toContain(withClaude.connectionId);

    // 동의한 DeepSeek 키를 지워도 Claude가 대신 자동 경로에 들어가지 않는다.
    const current = getUserAiSnapshot().configuration;
    setUserAiConfiguration({
      ...current,
      connections: current.connections.filter((item) => item.id !== deepseek.connectionId),
      assignments: { ...current.assignments, text: null },
      routeAssignments: { ...current.routeAssignments!, text: null },
    });
    expect(firstIds()).toEqual([]);
  });

  it("'하나만 고정'으로 직접 고른 유료 연결은 동의 표시와 상관없이 쓴다", () => {
    const claude = addQuickKey(EMPTY_AI_CONFIGURATION, "anthropic", CLAUDE);
    setUserAiConfiguration({
      ...claude.configuration,
      routing: { ...claude.configuration.routing!, mode: "manual" },
    });
    expect(userAiPersonalFirstConnectionsForCapability("text").map((route) => route.id)).toEqual([claude.connectionId]);
  });
});
