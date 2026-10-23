/**
 * 실제 @anthropic-ai/sdk + 모킹한 전역 fetch로 와이어 형식(URL·헤더·본문)과 오류 처리를 검증한다.
 * SDK를 모킹하지 않으므로 API 버전·헤더·요청 모양이 바뀌면 이 테스트가 먼저 알려 준다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { probeUserAiConnection } from "../user-ai-connection-probe";
import { lockUserAi, setUserAiConfiguration } from "../user-ai-store";
import { completeUserAiTextDetailed, userAiFetch, userAiLegacyJson } from "../user-ai-transport";
import { DEFAULT_USER_AI_ROUTING, type UserAiConnection } from "../user-ai-types";

import { resetClaudeBudgetForTests, setClaudeBudgetLimit } from "./claude-budget";
import { listClaudeRoutes, resolveClaudeRoute } from "./claude-route";
import { ClaudeBudgetError, claudeCreate, claudeParse, listClaudeModelsForKey } from "./claude-transport";
import {
  getClaudeUsageSnapshot,
  recordClaudeUsage,
  resetClaudeUsage,
} from "./claude-usage-meter";

const TEST_KEY = "test-anthropic-key-0000";

const claude: UserAiConnection = {
  id: "claude-user",
  label: "Claude (내 키)",
  baseUrl: "https://api.anthropic.com",
  apiKey: TEST_KEY,
  textModel: "claude-sonnet-5-5",
  imageModel: "",
  imageGenerationPath: "/images/generations",
  imageEditPath: "/images/edits",
  chatCompletionsPath: "/chat/completions",
  costPolicy: "user-funded-byok",
};

function configure(mode: "manual" | "automatic" = "manual", extra: Partial<UserAiConnection> = {}) {
  setUserAiConfiguration({
    version: 1,
    connections: [{ ...claude, ...extra }],
    assignments: { text: claude.id, image: null, inference: null, "three-d": null },
    routing: { ...DEFAULT_USER_AI_ROUTING, mode },
  });
}

function usage(overrides: Record<string, unknown> = {}) {
  return {
    input_tokens: 12,
    output_tokens: 7,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation: null,
    inference_geo: null,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: null,
    ...overrides,
  };
}

function messageBody(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_test_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text: "안녕하세요", citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    container: null,
    diagnostics: null,
    usage: usage(),
    ...overrides,
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "request-id": "req_test_1", ...headers },
  });
}

function apiError(status: number, type: string, message: string): Response {
  return json({ type: "error", error: { type, message } }, status);
}

function lastRequest(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return {
    url,
    init,
    headers: new Headers(init.headers),
    body: (typeof init.body === "string" ? JSON.parse(init.body) : {}) as Record<string, unknown>,
  };
}

beforeEach(() => {
  resetClaudeUsage();
  resetClaudeBudgetForTests();
  configure();
});

afterEach(() => {
  vi.unstubAllGlobals();
  lockUserAi(false);
  resetClaudeUsage();
  resetClaudeBudgetForTests();
});

describe("OpenAI 호환 호출자 → Claude 브리지", () => {
  it("Messages API로 보내고 OpenAI 형식 응답을 돌려준다 (와이어 형식 검증)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(messageBody()));
    vi.stubGlobal("fetch", fetchMock);

    const result = await completeUserAiTextDetailed("시스템 지시", "사용자 입력");

    expect(result.content).toBe("안녕하세요");
    expect(result.connection.id).toBe("claude-user");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = lastRequest(fetchMock);
    expect(request.url).toBe("https://api.anthropic.com/v1/messages");
    expect(request.init.method).toBe("POST");
    // SDK 1.x는 API 키를 Authorization: Bearer로 보낸다. 사용자의 키와 정확히 같아야 한다.
    expect(request.headers.get("authorization")).toBe(`Bearer ${TEST_KEY}`);
    expect(request.headers.has("x-api-key")).toBe(false);
    expect(request.headers.get("anthropic-version")).toBe("2026-10-21");
    expect(request.headers.get("anthropic-dangerous-direct-browser-access")).toBe("true");
    expect(request.headers.has("cookie")).toBe(false);
    expect(request.init.credentials).toBe("omit");
    expect(request.init.redirect).toBe("error");
    expect(request.body).toMatchObject({
      model: "claude-sonnet-5-5",
      system: "시스템 지시",
      messages: [{ role: "user", content: "사용자 입력" }],
      max_tokens: 4_096 + 2_048,
      output_config: { effort: "medium" },
    });
    for (const removed of ["temperature", "top_p", "top_k"]) {
      expect(request.body).not.toHaveProperty(removed);
    }
  });

  it("레거시 호출자가 보내는 temperature를 제거한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(messageBody()));
    vi.stubGlobal("fetch", fetchMock);
    await userAiLegacyJson("text", {
      messages: [{ role: "user", content: "hello" }],
      temperature: 0.7,
      max_tokens: 800,
    });
    const { body } = lastRequest(fetchMock);
    expect(body).not.toHaveProperty("temperature");
    expect(body.max_tokens).toBe(800 + 2_048);
  });

  it("OpenAI 응답 형태(choices·usage·model)를 그대로 읽을 수 있다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(messageBody({
      usage: usage({ input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 }),
    }))));
    const response = await userAiFetch("text", "/chat/completions", {
      messages: [{ role: "user", content: "hello" }],
    });
    const payload = await response.json() as {
      choices: Array<{ message: { content: string }; finish_reason: string }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model: string;
    };
    expect(payload.choices[0]).toMatchObject({ message: { content: "안녕하세요" }, finish_reason: "stop" });
    expect(payload.usage).toMatchObject({ prompt_tokens: 110, completion_tokens: 5, total_tokens: 115 });
    expect(payload.model).toBe("claude-sonnet-5-5");
  });

  it("유료 BYOK는 자동 체인에 들어가지 않는다 (명시 동의 규칙 유지)", async () => {
    configure("automatic");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(completeUserAiTextDetailed("s", "u")).rejects.toMatchObject({ code: "not-configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("텍스트 채팅 이외의 경로·기능은 보내지 않고 거절한다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(userAiFetch("text", "/images/generations", { prompt: "x" })).rejects.toThrow(/텍스트 채팅/u);
    await expect(userAiFetch("text", "/chat/completions", undefined, { method: "GET" })).rejects.toThrow(/텍스트 채팅/u);
    await expect(userAiFetch("image", "/chat/completions", {})).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("옮길 수 없는 요청은 네트워크 전에 거절한다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(userAiFetch("text", "/chat/completions", {
      messages: [{ role: "user", content: "x" }],
      stream: true,
    })).rejects.toThrow(/스트리밍/u);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("오류 처리 — 자동 재시도·키 누출 없음", () => {
  it.each([
    [401, "authentication_error", "invalid x-api-key", "authentication"],
    [403, "permission_error", "forbidden", "authentication"],
    // 쿼터 소진은 기존 규칙대로 마지막 실패일 때 all-free-exhausted로 감싸 올라온다.
    [429, "rate_limit_error", "slow down", "all-free-exhausted"],
    [400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API.", "all-free-exhausted"],
    [404, "not_found_error", "model: claude-nope", "http-error"],
    [500, "api_error", "internal", "http-error"],
    [529, "overloaded_error", "Overloaded", "http-error"],
    [400, "invalid_request_error", "messages.0: bad shape", "http-error"],
  ])("HTTP %i(%s)는 %s 코드로 바꾸고 한 번만 요청한다", async (status, type, message, code) => {
    const fetchMock = vi.fn().mockResolvedValue(apiError(status, type, message));
    vi.stubGlobal("fetch", fetchMock);
    const error: unknown = await completeUserAiTextDetailed("s", "u").then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toMatchObject({ code, status });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((error as Error).message).not.toContain(TEST_KEY);
  });

  it("오류 본문에 키 형태가 섞여도 화면에 남기지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      apiError(400, "invalid_request_error", "bad key sk-ant-api03-ABCDEF_0123456789-xyz in request"),
    ));
    const error: unknown = await completeUserAiTextDetailed("s", "u").then(
      () => null,
      (reason: unknown) => reason,
    );
    // 400은 쿼터 소진이 아니라 요청 거절이므로 원 오류가 그대로 올라온다. 키 형태는 지워져야 한다.
    expect((error as Error).message).not.toMatch(/sk-ant-api03/u);
    expect((error as Error).message).toContain("[비밀정보 제거]");
  });

  it("네트워크 실패는 재전송 없이 사유를 알린다", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(completeUserAiTextDetailed("s", "u")).rejects.toThrow(/CORS|네트워크/u);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["refusal", /안전 정책/u],
    ["max_tokens", /길이 제한/u],
    ["model_context_window_exceeded", /읽을 수 있는 길이/u],
    ["pause_turn", /멈췄어요/u],
  ])("stop_reason %s는 조용히 넘기지 않는다", async (stop, pattern) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(messageBody({ stop_reason: stop }))));
    await expect(completeUserAiTextDetailed("s", "u")).rejects.toThrow(pattern);
  });

  it("빈 응답은 오류다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(messageBody({ content: [] }))));
    await expect(completeUserAiTextDetailed("s", "u")).rejects.toThrow(/비어/u);
  });

  it("보관함 잠금 시 진행 중 요청이 취소된다", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })));
    const pending = completeUserAiTextDetailed("s", "u");
    await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    lockUserAi(false);
    await expect(pending).rejects.toThrow(/취소/u);
  });
});

describe("사용량 미터", () => {
  it("성공 호출의 토큰과 추정 비용을 기록한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(messageBody({
      usage: usage({ input_tokens: 1_000_000, output_tokens: 0 }),
    }))));
    await completeUserAiTextDetailed("s", "u");
    const snapshot = getClaudeUsageSnapshot();
    expect(snapshot.requests).toBe(1);
    expect(snapshot.usage.inputTokens).toBe(1_000_000);
    expect(snapshot.estimatedUsd).toBeCloseTo(2, 6); // Sonnet 5.5 입력 $2/MTok
    expect(snapshot.byModel["claude-sonnet-5-5"]?.requests).toBe(1);
  });

  it("거절·잘림으로 오류가 나도 이미 과금된 호출은 기록한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(messageBody({
      stop_reason: "refusal",
      usage: usage({ input_tokens: 500, output_tokens: 3 }),
    }))));
    await expect(completeUserAiTextDetailed("s", "u")).rejects.toThrow();
    expect(getClaudeUsageSnapshot().requests).toBe(1);
    expect(getClaudeUsageSnapshot().usage.outputTokens).toBe(3);
  });

  it("단가를 모르는 모델은 비용 합계에서 빼고 별도로 센다", async () => {
    configure("manual", { textModel: "claude-experimental-9" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(messageBody({ model: "claude-experimental-9" }))));
    await completeUserAiTextDetailed("s", "u");
    expect(getClaudeUsageSnapshot().unpricedRequests).toBe(1);
    expect(getClaudeUsageSnapshot().estimatedUsd).toBe(0);
  });
});

describe("예산 한도 강제 — 대화상자 밖의 호출도 같은 규칙", () => {
  const params = { model: "claude-sonnet-5-5", max_tokens: 1_000, messages: [{ role: "user" as const, content: "평가" }] };

  it("OpenAI 호환 호출은 한도를 넘을 수 있으면 보내지 않는다 (기본 상한 6,144토큰 ≈ $0.06)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(messageBody()));
    vi.stubGlobal("fetch", fetchMock);
    setClaudeBudgetLimit(0.05);

    const error: unknown = await completeUserAiTextDetailed("s", "u").then(() => null, (reason: unknown) => reason);

    expect(error).toBeInstanceOf(ClaudeBudgetError);
    expect((error as Error).message).toMatch(/예산 한도\(\$0\.05\)를 넘을 수 있어/u);
    expect((error as Error).message).toMatch(/다시 시도해 주세요/u);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getClaudeUsageSnapshot()).toMatchObject({ pendingRequests: 0, pendingUsd: 0, unconfirmedRequests: 0 });
  });

  it("한도 안이면 보낸다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(messageBody()));
    vi.stubGlobal("fetch", fetchMock);
    setClaudeBudgetLimit(1);

    await expect(completeUserAiTextDetailed("s", "u")).resolves.toMatchObject({ content: "안녕하세요" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("이미 쓴 금액까지 더해 판정한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(messageBody()));
    vi.stubGlobal("fetch", fetchMock);
    setClaudeBudgetLimit(1);
    recordClaudeUsage("claude-sonnet-5-5", { input_tokens: 495_000, output_tokens: 0 }); // $0.99

    await expect(completeUserAiTextDetailed("s", "u")).rejects.toBeInstanceOf(ClaudeBudgetError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("한도가 있는데 단가를 모르는 모델이면 비용을 가늠할 수 없다고 알리고 보내지 않는다", async () => {
    configure("manual", { textModel: "claude-experimental-9" });
    const fetchMock = vi.fn().mockResolvedValue(json(messageBody()));
    vi.stubGlobal("fetch", fetchMock);
    setClaudeBudgetLimit(5);

    await expect(completeUserAiTextDetailed("s", "u")).rejects.toThrow(/단가를 몰라/u);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("claudeParse·claudeCreate도 비용 상한 없이는 한도가 있을 때 보내지 않고, 사용자가 허용한 요청(budgetOverride)만 통과한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(messageBody({
      content: [{ type: "text", text: "{\"score\":1}", citations: null }],
    })));
    vi.stubGlobal("fetch", fetchMock);
    const route = resolveClaudeRoute();
    if (!route) throw new Error("route");
    setClaudeBudgetLimit(0.01);
    const Schema = z.object({ score: z.number() });

    await expect(claudeParse(route, params, Schema)).rejects.toBeInstanceOf(ClaudeBudgetError);
    await expect(claudeParse(route, params, Schema, { capUsd: 0.5 })).rejects.toBeInstanceOf(ClaudeBudgetError);
    await expect(claudeCreate(route, params, { capUsd: 0.5 })).rejects.toBeInstanceOf(ClaudeBudgetError);
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(claudeParse(route, params, Schema, { capUsd: 0.5, budgetOverride: true })).resolves.toMatchObject({ parsed: { score: 1 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("한도가 없으면 비용 상한 없이도 보낸다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(messageBody()));
    vi.stubGlobal("fetch", fetchMock);
    const route = resolveClaudeRoute();
    if (!route) throw new Error("route");

    await claudeCreate(route, params);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("진행 중인 요청의 상한을 예약해 동시에 나가는 요청이 한도를 함께 넘지 않게 한다", async () => {
    let release: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { release = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const route = resolveClaudeRoute();
    if (!route) throw new Error("route");
    setClaudeBudgetLimit(0.3);

    const first = claudeCreate(route, params, { capUsd: 0.2 });
    await vi.waitFor(() => expect(getClaudeUsageSnapshot()).toMatchObject({ pendingRequests: 1, pendingUsd: 0.2 }));
    await expect(claudeCreate(route, params, { capUsd: 0.2 })).rejects.toBeInstanceOf(ClaudeBudgetError);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    release(json(messageBody()));
    await first;
    expect(getClaudeUsageSnapshot()).toMatchObject({ pendingRequests: 0, pendingUsd: 0, unconfirmedRequests: 0, requests: 1 });
  });
});

describe("응답을 받지 못한 요청의 집계", () => {
  const params = { model: "claude-sonnet-5-5", max_tokens: 1_000, messages: [{ role: "user" as const, content: "평가" }] };

  it("본문을 넘긴 뒤 취소하면 '확인되지 않은 요청'으로 남고 예산 판정에 더해진다", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })));
    const route = resolveClaudeRoute();
    if (!route) throw new Error("route");
    const controller = new AbortController();

    const pending = claudeCreate(route, params, { capUsd: 0.2, signal: controller.signal });
    await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    controller.abort();
    await expect(pending).rejects.toThrow(/취소/u);

    const snapshot = getClaudeUsageSnapshot();
    expect(snapshot).toMatchObject({ pendingRequests: 0, pendingUsd: 0, unconfirmedRequests: 1, unconfirmedUsd: 0.2, requests: 0, estimatedUsd: 0 });

    // 확인되지 않은 최대 비용 $0.2가 이미 쓴 것으로 계산되므로 $0.25 한도에서 $0.1 요청도 넘을 수 있다고 본다.
    setClaudeBudgetLimit(0.25);
    await expect(claudeCreate(route, params, { capUsd: 0.1 })).rejects.toBeInstanceOf(ClaudeBudgetError);
  });

  it("서버가 오류 응답을 돌려준 요청은 청구되지 않았다고 보고 세지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(apiError(500, "api_error", "internal")));
    const route = resolveClaudeRoute();
    if (!route) throw new Error("route");

    await expect(claudeCreate(route, params, { capUsd: 0.2 })).rejects.toThrow(/Claude 서버/u);

    expect(getClaudeUsageSnapshot()).toMatchObject({ pendingRequests: 0, pendingUsd: 0, unconfirmedRequests: 0, unconfirmedUsd: 0 });
  });

  it("연결 자체가 실패한 요청(오프라인·CORS)도 세지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const route = resolveClaudeRoute();
    if (!route) throw new Error("route");

    await expect(claudeCreate(route, params, { capUsd: 0.2 })).rejects.toThrow();

    expect(getClaudeUsageSnapshot()).toMatchObject({ pendingRequests: 0, unconfirmedRequests: 0 });
  });

  it("사용량을 받은 호출은 거절·잘림 오류로 끝나도 확인되지 않은 요청이 아니다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(messageBody({ stop_reason: "max_tokens" }))));
    const route = resolveClaudeRoute();
    if (!route) throw new Error("route");

    await expect(claudeCreate(route, params, { capUsd: 0.2 })).rejects.toThrow(/길이 제한/u);

    expect(getClaudeUsageSnapshot()).toMatchObject({ requests: 1, pendingRequests: 0, unconfirmedRequests: 0 });
  });

  it("응답을 받는 동안 설정이 바뀌어 결과를 쓰지 못한 요청도 '확인되지 않은 요청'이다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      configure("manual", { label: "바뀐 연결" });
      return json(messageBody());
    }));
    const route = resolveClaudeRoute();
    if (!route) throw new Error("route");

    // 설정이 바뀌면 진행 중 요청이 함께 취소되므로 "취소" 문구나 "연결 변경" 문구 중 하나로 끝난다.
    await expect(claudeCreate(route, params, { capUsd: 0.2 })).rejects.toThrow(/취소|연결이 변경/u);

    expect(getClaudeUsageSnapshot()).toMatchObject({ unconfirmedRequests: 1, unconfirmedUsd: 0.2, requests: 0 });
  });
});

describe("Claude 네이티브 호출", () => {
  it("라우트는 정책을 통과한 Claude 연결만 후보로 삼고 키를 요약에 담지 않는다", () => {
    expect(listClaudeRoutes()).toHaveLength(1);
    const route = resolveClaudeRoute();
    expect(route).toMatchObject({ connectionId: "claude-user", model: "claude-sonnet-5-5", apiKey: TEST_KEY });
    configure("manual", { costPolicy: "provider-free-tier" });
    expect(resolveClaudeRoute()).toBeNull();
  });

  it("claudeCreate는 시스템 블록·이미지·캐시 제어를 그대로 보낸다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(messageBody()));
    vi.stubGlobal("fetch", fetchMock);
    const route = resolveClaudeRoute();
    if (!route) throw new Error("route");
    await claudeCreate(route, {
      model: route.model,
      max_tokens: 1_000,
      system: [{ type: "text", text: "고정 지시", cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } },
          { type: "text", text: "평가해줘" },
        ],
      }],
    });
    const { body, headers } = lastRequest(fetchMock);
    expect(headers.get("authorization")).toBe(`Bearer ${TEST_KEY}`);
    expect(body.system).toEqual([{ type: "text", text: "고정 지시", cache_control: { type: "ephemeral" } }]);
    expect((body.messages as Array<{ content: Array<{ type: string }> }>)[0]?.content[0]?.type).toBe("image");
  });

  it("claudeParse는 Zod 스키마로 구조화 출력을 검증한다", async () => {
    const Schema = z.object({ score: z.number(), notes: z.array(z.string()) });
    const fetchMock = vi.fn().mockResolvedValue(json(messageBody({
      content: [{ type: "text", text: JSON.stringify({ score: 7, notes: ["좋아요"] }), citations: null }],
    })));
    vi.stubGlobal("fetch", fetchMock);
    const route = resolveClaudeRoute();
    if (!route) throw new Error("route");
    const result = await claudeParse(route, {
      model: route.model,
      max_tokens: 1_000,
      messages: [{ role: "user", content: "평가" }],
    }, Schema);
    expect(result.parsed).toEqual({ score: 7, notes: ["좋아요"] });
    const { body } = lastRequest(fetchMock);
    expect(body.output_config).toMatchObject({ format: { type: "json_schema" } });
  });

  it("claudeParse는 스키마에 맞지 않는 응답을 오류로 올리고 사용량은 기록한다", async () => {
    const Schema = z.object({ score: z.number() });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(messageBody({
      content: [{ type: "text", text: "{\"score\":\"high\"}", citations: null }],
    }))));
    const route = resolveClaudeRoute();
    if (!route) throw new Error("route");
    await expect(claudeParse(route, {
      model: route.model,
      max_tokens: 1_000,
      messages: [{ role: "user", content: "평가" }],
    }, Schema)).rejects.toThrow();
    expect(getClaudeUsageSnapshot().requests).toBe(1);
  });

  it("claudeCreate도 거절을 오류로 올린다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(messageBody({ stop_reason: "refusal" }))));
    const route = resolveClaudeRoute();
    if (!route) throw new Error("route");
    await expect(claudeCreate(route, {
      model: route.model,
      max_tokens: 100,
      messages: [{ role: "user", content: "x" }],
    })).rejects.toThrow(/안전 정책/u);
  });
});

describe("연결 확인(프로브)과 모델 목록", () => {
  function modelsBody() {
    return {
      data: [
        {
          type: "model",
          id: "claude-haiku-5-5",
          display_name: "Claude Haiku 5.5",
          created_at: "2026-10-07T18:00:00Z",
          lifecycle: "active",
          max_input_tokens: 1_000_000,
          max_tokens: 128_000,
          capabilities: { image_input: { supported: true }, structured_outputs: { supported: true } },
        },
      ],
      has_more: false,
      first_id: "claude-haiku-5-5",
      last_id: "claude-haiku-5-5",
    };
  }

  it("GET /v1/models로 키를 확인한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(modelsBody()));
    const result = await probeUserAiConnection(claude, fetchMock);
    expect(result).toEqual({ status: "ok", modelCount: 1 });
    const { url, init, headers } = lastRequest(fetchMock);
    expect(url).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/models/u);
    expect(init.method).toBe("GET");
    expect(headers.get("authorization")).toBe(`Bearer ${TEST_KEY}`);
  });

  it("401은 키 거절, 그 밖의 상태는 http_error, 네트워크 실패는 unreachable", async () => {
    expect(await probeUserAiConnection(claude, vi.fn().mockResolvedValue(apiError(401, "authentication_error", "no")))).toEqual({ status: "unauthorized" });
    expect(await probeUserAiConnection(claude, vi.fn().mockResolvedValue(apiError(500, "api_error", "no")))).toEqual({ status: "http_error", httpStatus: 500 });
    expect(await probeUserAiConnection(claude, vi.fn().mockRejectedValue(new TypeError("net")))).toEqual({ status: "unreachable" });
  });

  it("키가 없으면 요청하지 않는다", async () => {
    const fetchMock = vi.fn();
    expect(await probeUserAiConnection({ ...claude, apiKey: "", apiKeys: [] }, fetchMock)).toEqual({ status: "no_key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("모델 목록에서 이미지 입력·구조화 출력 지원 여부를 읽는다", async () => {
    const listing = await listClaudeModelsForKey(TEST_KEY, { fetchImpl: vi.fn().mockResolvedValue(json(modelsBody())) });
    expect(listing).toEqual([{
      id: "claude-haiku-5-5",
      displayName: "Claude Haiku 5.5",
      lifecycle: "active",
      imageInput: true,
      structuredOutputs: true,
      maxInputTokens: 1_000_000,
      maxOutputTokens: 128_000,
    }]);
  });
});
