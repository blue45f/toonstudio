// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addQuickKey, removeQuickKey } from "./ai-quick-key";
import { getFreeAiRuntimeBudgetSnapshot, guardFreeAiRuntimeRequest, resetFreeAiRuntimeBudget } from "./free-ai-runtime-budget";
import {
  getUserAiSnapshot,
  lockUserAi,
  setUserAiConfiguration,
  userAiConnectionsForCapability,
  userAiPersonalFirstConnectionsForCapability,
} from "./user-ai-store";
import { EMPTY_AI_CONFIGURATION } from "./user-ai-types";

import type { UserAiResolvedConnection } from "./user-ai-types";

// 실제 키가 아니라 형식만 맞춘 가짜 값이다.
const OLD_KEY = `gsk_${"o".repeat(52)}`;
const NEW_KEY = `gsk_${"n".repeat(52)}`;

function textRoute(): UserAiResolvedConnection {
  const route = userAiConnectionsForCapability("text")[0];
  if (!route) throw new Error("텍스트 경로가 없어요.");
  return route;
}

async function useOnce(route: UserAiResolvedConnection) {
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
    await useOnce(oldRoute);
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
    await useOnce(route);

    const current = getUserAiSnapshot().configuration;
    setUserAiConfiguration({ ...current, connections: current.connections.map((item) => ({ ...item, enabled: false })) });
    expect(userAiConnectionsForCapability("text")).toHaveLength(0);
    setUserAiConfiguration(current);

    expect(getFreeAiRuntimeBudgetSnapshot(textRoute()).requests).toBe(1);
  });

  it("다른 경로의 기록은 건드리지 않는다", async () => {
    const groq = addQuickKey(EMPTY_AI_CONFIGURATION, "groq", OLD_KEY);
    setUserAiConfiguration(groq.configuration);
    const groqRoute = textRoute();
    await useOnce(groqRoute);

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
