import { describe, expect, it } from "vitest";

import {
  isPrivateOrLocalAiHostname,
  normalizeUserAiConfiguration,
  resolvedUserAiRoutes,
  userAiRoutingSettings,
  validateUserAiBaseUrl,
  validateUserAiPath,
} from "./user-ai-types";

const connection = {
  id: "personal",
  label: "내 연결",
  baseUrl: "https://api.groq.com/openai/v1",
  apiKey: "secret-key",
  textModel: "text-model",
  imageModel: "",
  imageGenerationPath: "/images/generations",
  imageEditPath: "/images/edits",
  chatCompletionsPath: "/chat/completions",
  costPolicy: "provider-free-tier" as const,
};

describe("unified cloud AI configuration", () => {
  it("migrates a legacy single key/model connection into profiles", () => {
    const normalized = normalizeUserAiConfiguration({
      version: 1,
      connections: [connection],
      assignments: { text: "personal", image: null, inference: null, "three-d": null },
    });
    expect(normalized.connections[0]).toMatchObject({
      id: "personal",
      apiKey: "secret-key",
      textModel: "text-model",
      enabled: true,
      priority: 100,
      apiKeys: [{ id: "key-1", apiKey: "secret-key", priority: 100 }],
      models: [{ id: "text-1", model: "text-model", capability: "text", priority: 100 }],
    });
    expect(normalized.routeAssignments?.text).toEqual({
      connectionId: "personal",
      apiKeyId: null,
      modelId: null,
    });
    expect(userAiRoutingSettings(normalized)).toMatchObject({
      mode: "automatic",
      allowPaidFallback: false,
      managedPoolPriority: 50,
    });
  });

  it("rejects local, loopback, and private-network dependencies", () => {
    for (const baseUrl of [
      "http://localhost:8082/v1",
      "https://127.0.0.1/v1",
      "https://192.168.1.20/v1",
      "https://runtime.local/v1",
    ]) {
      expect(() => normalizeUserAiConfiguration({
        version: 1,
        connections: [{ ...connection, baseUrl }],
        assignments: { text: "personal", image: null, inference: null, "three-d": null },
      })).toThrow(/공개 HTTPS|사설망|localhost/u);
    }
  });

  it("normalizes multiple keys, models, priorities, and exact manual routes", () => {
    const normalized = normalizeUserAiConfiguration({
      version: 1,
      connections: [{
        ...connection,
        apiKey: "legacy-unused",
        textModel: "legacy-unused",
        priority: 20,
        apiKeys: [
          { id: "backup", label: "백업", apiKey: "key-b", enabled: true, priority: 20 },
          { id: "primary", label: "주 키", apiKey: "key-a", enabled: true, priority: 10 },
        ],
        models: [
          { id: "large", label: "대형", model: "model-large", capability: "text", enabled: true, priority: 20 },
          { id: "fast", label: "고속", model: "model-fast", capability: "text", enabled: true, priority: 10 },
        ],
      }],
      assignments: { text: "personal", image: null, inference: null, "three-d": null },
      routeAssignments: {
        text: { connectionId: "personal", apiKeyId: "backup", modelId: "large" },
        image: null,
        inference: null,
        "three-d": null,
      },
      routing: {
        mode: "manual",
        allowPaidFallback: true,
        managedPoolPriority: 200,
        serverProviderOrder: ["groq", "gemini", "groq"],
      },
    });
    const routes = resolvedUserAiRoutes(normalized.connections[0]!, "text");
    expect(routes.map((route) => route.routeId)).toEqual([
      "personal:fast:primary",
      "personal:fast:backup",
      "personal:large:primary",
      "personal:large:backup",
    ]);
    expect(normalized.routing?.serverProviderOrder.slice(0, 2)).toEqual(["groq", "gemini"]);
  });

  it("marks ambiguous legacy remote settings as unverified", () => {
    const { costPolicy: _costPolicy, ...legacy } = connection;
    const normalized = normalizeUserAiConfiguration({
      version: 1,
      connections: [{ ...legacy, baseUrl: "https://api.openai.com/v1" }],
      assignments: { text: "personal", image: null, inference: null, "three-d": null },
    });
    expect(normalized.connections[0]?.costPolicy).toBe("unverified");
  });

  it("rejects dangling assignments and unsafe paths", () => {
    expect(() => normalizeUserAiConfiguration({
      version: 1,
      connections: [connection],
      assignments: { text: "missing", image: null, inference: null, "three-d": null },
    })).toThrow(/연결 대상/u);
    expect(() => validateUserAiPath("/jobs/../admin")).toThrow(/상대 경로/u);
    expect(() => validateUserAiPath("//other.example/path")).toThrow(/상대 경로/u);
  });
});

describe("클라우드 AI 주소의 사설망 판정", () => {
  // WHATWG URL 은 IPv4 매핑 주소를 16진 두 묶음([::ffff:7f00:1])으로, 끝 점은 그대로 돌려준다.
  // 판정은 URL 이 돌려주는 정규형 호스트 이름 기준이어야 우회되지 않는다.
  it.each([
    "https://[::ffff:127.0.0.1]/v1",
    "https://[::ffff:10.0.0.1]/v1",
    "https://[::ffff:192.168.0.10]/v1",
    "https://[::ffff:169.254.169.254]/v1",
    "https://[::ffff:172.16.0.1]/v1",
    "https://[::127.0.0.1]/v1",
    "https://[64:ff9b::7f00:1]/v1",
    "https://[2002:7f00:1::]/v1",
    "https://[fec0::1]/v1",
    "https://[ff02::1]/v1",
    "https://localhost./v1",
    "https://printer.local./v1",
    "https://router.internal./v1",
    "https://127.1/v1",
    "https://0x7f.1/v1",
    "https://2130706433/v1",
  ])("사설·루프백으로 향하는 표기는 모두 거부한다: %s", (baseUrl) => {
    expect(() => validateUserAiBaseUrl(baseUrl)).toThrow(/공개 HTTPS/u);
    expect(isPrivateOrLocalAiHostname(new URL(baseUrl).hostname)).toBe(true);
  });

  it.each([
    "https://api.openai.com/v1",
    "https://openrouter.ai/api/v1",
    "https://fcm.googleapis.com/v1",
    "https://fdaa.example.com/v1",
    "https://[2606:4700:4700::1111]/v1",
    "https://[::ffff:8.8.8.8]/v1",
    "https://[2002:808:808::]/v1",
    "https://example.com./v1",
  ])("공개 주소는 계속 허용한다: %s", (baseUrl) => {
    expect(() => validateUserAiBaseUrl(baseUrl)).not.toThrow();
  });
});
