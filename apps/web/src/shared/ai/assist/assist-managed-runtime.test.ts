/**
 * 관리형 보조 경로(ToonStudio AI) — 키 없이 서버 `/studio-ai/messages`로 보내는 계약을 검증한다.
 * 서버 호출은 바꿔 끼운 `post`나 모킹한 API 클라이언트로 대신하고, 전송 계층이 관리형 경로를
 * 사용자 예산·사용량 미터 밖에서 처리하는지도 함께 본다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AppApiError } from "@/platform/api-error";

import { UserAiTransportError } from "../user-ai-transport-error";

import { resetAssistBudgetForTests, setAssistBudgetLimit } from "./assist-budget";
import {
  mapManagedAssistError,
  runManagedAssistMessage,
  runManagedAssistParse,
  toManagedAssistRequest,
  type ManagedAssistRequestBody,
} from "./assist-managed-runtime";
import { isManagedAssistModelLabel, managedAssistModelLabel, managedAssistRoute } from "./assist-route";
import { getAssistUsageSnapshot, resetAssistUsage } from "./assist-usage-meter";

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));

vi.mock("@/platform/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/api")>();
  return { ...actual, api: { ...actual.api, post: postMock } };
});

function serverMessage(text: string, model = "claude-opus-5-5") {
  return {
    provider: "anthropic",
    message: {
      id: "msg_managed_1",
      type: "message",
      role: "assistant",
      model,
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 120, output_tokens: 40, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  };
}

const Schema = z.object({ verdict: z.string(), score: z.number().int().min(0).max(100) });

describe("toManagedAssistRequest", () => {
  it("시스템 블록·base64 이미지·캐시 제어를 옮기고 깊은 사고 요청은 high로 맞춘다", () => {
    const body = toManagedAssistRequest({
      model: "claude-sonnet-5-5",
      max_tokens: 99_999,
      system: [{ type: "text", text: "고정 지시", cache_control: { type: "ephemeral", ttl: "1h" } }],
      output_config: { effort: "max" },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } },
          { type: "text", text: "평가해 줘" },
        ],
      }],
    });

    expect(body).toEqual({
      model: "claude-sonnet-5-5",
      // 서버 계약의 출력 상한(16k)을 넘지 않는다.
      max_tokens: 16_000,
      system: [{ type: "text", text: "고정 지시", cache_control: { type: "ephemeral", ttl: "1h" } }],
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } },
          { type: "text", text: "평가해 줘" },
        ],
      }],
      output_config: { effort: "high" },
    } satisfies ManagedAssistRequestBody);
  });

  it("도구 사용과 URL 이미지는 서버 경로 계약 밖이라 보내기 전에 막는다", () => {
    expect(() => toManagedAssistRequest({
      model: "claude-opus-5-5",
      max_tokens: 100,
      tools: [{ name: "lookup", input_schema: { type: "object" } }],
      messages: [{ role: "user", content: "hi" }],
    })).toThrow(UserAiTransportError);
    expect(() => toManagedAssistRequest({
      model: "claude-opus-5-5",
      max_tokens: 100,
      messages: [{ role: "user", content: [{ type: "image", source: { type: "url", url: "https://example.com/a.png" } }] }],
    })).toThrow(/ToonStudio AI에서 지원하지 않아요/u);
  });
});

describe("runManagedAssistParse", () => {
  it("구조화 출력 스키마를 함께 보내고, 결과를 같은 Zod 스키마로 다시 검증한다", async () => {
    const post = vi.fn(async () => serverMessage(JSON.stringify({ verdict: "좋아요", score: 82 })));

    const { parsed, message } = await runManagedAssistParse(
      { model: "claude-opus-5-5", max_tokens: 800, messages: [{ role: "user", content: "점검해 줘" }] },
      Schema,
      { post },
    );

    expect(parsed).toEqual({ verdict: "좋아요", score: 82 });
    // 결과의 모델 이름은 사용자 청구처럼 보이지 않게 "ToonStudio AI (실제 모델)"로 감싼다.
    expect(message.model).toBe("ToonStudio AI (claude-opus-5-5)");
    expect(isManagedAssistModelLabel(message.model)).toBe(true);
    const [body, init] = post.mock.calls[0] as unknown as [ManagedAssistRequestBody, { idempotencyKey: string }];
    expect(body.output_config?.format?.type).toBe("json_schema");
    expect(body.output_config?.format?.schema).toMatchObject({ type: "object" });
    expect(init.idempotencyKey).toMatch(/^assist-/u);
  });

  it("JSON 앞뒤에 설명이 붙어 와도 객체를 꺼내 검증하고 다시 보내지 않는다", async () => {
    const post = vi.fn(async () => serverMessage("결과예요.\n```json\n{\"verdict\": \"좋아요\", \"score\": 77}\n```\n참고하세요."));

    const { parsed } = await runManagedAssistParse(
      { model: "claude-opus-5-5", max_tokens: 800, messages: [{ role: "user", content: "점검해 줘" }] },
      Schema,
      { post },
    );

    expect(parsed).toEqual({ verdict: "좋아요", score: 77 });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("스키마에 맞지 않으면 앞 답과 검증 문제를 붙여 한 번만 고쳐 달라고 한다", async () => {
    const post = vi.fn()
      .mockResolvedValueOnce(serverMessage(JSON.stringify({ verdict: "좋아요", score: 140 })))
      .mockResolvedValueOnce(serverMessage(JSON.stringify({ verdict: "좋아요", score: 90 }), "openai/gpt-oss-120b"));

    const { parsed, message } = await runManagedAssistParse(
      { model: "claude-opus-5-5", max_tokens: 800, messages: [{ role: "user", content: "점검해 줘" }] },
      Schema,
      { post },
    );

    expect(parsed).toEqual({ verdict: "좋아요", score: 90 });
    expect(message.model).toBe("ToonStudio AI (openai/gpt-oss-120b)");
    expect(post).toHaveBeenCalledTimes(2);
    const [repair, init] = post.mock.calls[1] as unknown as [ManagedAssistRequestBody, { idempotencyKey: string }];
    const [, firstInit] = post.mock.calls[0] as unknown as [ManagedAssistRequestBody, { idempotencyKey: string }];
    // 같은 요청을 다시 보내는 것이 아니라 앞 답과 문제를 붙인 새 요청이다(멱등 키도 새로 만든다).
    expect(init.idempotencyKey).not.toBe(firstInit.idempotencyKey);
    expect(repair.messages).toHaveLength(3);
    expect(repair.messages[1]).toEqual({ role: "assistant", content: JSON.stringify({ verdict: "좋아요", score: 140 }) });
    expect(repair.messages[2]?.role).toBe("user");
    expect(String(repair.messages[2]?.content)).toMatch(/score: /u);
    expect(repair.output_config?.format?.type).toBe("json_schema");
  });

  it("끝이 잘린 답 안의 중첩 객체를 답으로 쓰지 않고, 복구 요청에 바깥 문법 문제를 싣는다", async () => {
    const post = vi.fn()
      .mockResolvedValueOnce(serverMessage("{\"verdict\": \"좋아요\", \"detail\": {\"score\": 5}"))
      .mockResolvedValueOnce(serverMessage(JSON.stringify({ verdict: "좋아요", score: 90 })));

    const { parsed } = await runManagedAssistParse(
      { model: "claude-opus-5-5", max_tokens: 800, messages: [{ role: "user", content: "점검해 줘" }] },
      Schema,
      { post },
    );
    expect(parsed).toEqual({ verdict: "좋아요", score: 90 });
    const [repair] = post.mock.calls[1] as unknown as [ManagedAssistRequestBody];
    const instruction = String(repair.messages[2]?.content);
    expect(instruction).toMatch(/JSON 문법이 맞지 않아요/u);
    expect(instruction).not.toMatch(/verdict: /u);
  });

  it("설명 속 짝 없는 괄호 뒤의 진짜 답이 스키마를 통과하면 복구 요청 없이 쓴다", async () => {
    const post = vi.fn(async () => serverMessage("예시 { 는 무시하고, 답: {\"verdict\": \"좋아요\", \"score\": 90}"));
    const { parsed } = await runManagedAssistParse(
      { model: "claude-opus-5-5", max_tokens: 800, messages: [{ role: "user", content: "점검해 줘" }] },
      Schema,
      { post },
    );
    expect(parsed).toEqual({ verdict: "좋아요", score: 90 });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("고친 답도 맞지 않으면 더 보내지 않고 형식 오류로 알린다", async () => {
    const post = vi.fn(async () => serverMessage("지금은 답하기 어려워요."));

    await expect(runManagedAssistParse(
      { model: "claude-opus-5-5", max_tokens: 800, messages: [{ role: "user", content: "점검해 줘" }] },
      Schema,
      { post },
    )).rejects.toThrow(/정해진 형식으로 해석하지 못했어요/u);
    expect(post).toHaveBeenCalledTimes(2);
    const [repair] = post.mock.calls[1] as unknown as [ManagedAssistRequestBody];
    expect(String(repair.messages[2]?.content)).toMatch(/JSON 객체를 찾지 못했어요/u);
  });

  it("복구 요청이 서버에서 막혀도 처음 답의 형식 문제로 알린다", async () => {
    const post = vi.fn()
      .mockResolvedValueOnce(serverMessage("{\"verdict\": 3}"))
      .mockRejectedValueOnce(new AppApiError("AI 요청 글이 너무 깁니다.", { kind: "validation", status: 400 }));

    await expect(runManagedAssistParse(
      { model: "claude-opus-5-5", max_tokens: 800, messages: [{ role: "user", content: "점검해 줘" }] },
      Schema,
      { post },
    )).rejects.toThrow(/정해진 형식으로 해석하지 못했어요/u);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("서버 메시지 수 한도를 넘게 되면 고쳐 달라고 하지 않는다", async () => {
    const post = vi.fn(async () => serverMessage("{}"));
    const messages = Array.from({ length: 7 }, (_, index) => ({
      role: index % 2 === 0 ? "user" as const : "assistant" as const,
      content: `대화 ${index + 1}`,
    }));

    await expect(runManagedAssistParse(
      { model: "claude-opus-5-5", max_tokens: 800, messages },
      Schema,
      { post },
    )).rejects.toThrow(/정해진 형식으로 해석하지 못했어요/u);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("출력 한도에서 잘린 응답은 결과로 쓰지 않는다", async () => {
    const truncated = serverMessage("{\"verdict\":\"좋");
    truncated.message.stop_reason = "max_tokens";
    const post = vi.fn(async () => truncated);

    await expect(runManagedAssistParse(
      { model: "claude-opus-5-5", max_tokens: 800, messages: [{ role: "user", content: "점검해 줘" }] },
      Schema,
      { post },
    )).rejects.toThrow();
  });
});

describe("runManagedAssistMessage", () => {
  it("응답 형식이 다르면 처리 여부를 알 수 없으므로 다시 보내지 않고 알린다", async () => {
    const post = vi.fn(async () => ({ message: { type: "error" } }));

    await expect(runManagedAssistMessage(
      { model: "claude-opus-5-5", max_tokens: 100, messages: [{ role: "user", content: "hi" }] },
      { post },
    )).rejects.toThrow(/응답 형식을 확인하지 못했어요/u);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("무료 모델이 처리한 결과도 ToonStudio AI 표기로 돌려준다", async () => {
    const post = vi.fn(async () => serverMessage("안녕하세요", "gemini-2.5-flash"));

    const message = await runManagedAssistMessage(
      { model: "claude-opus-5-5", max_tokens: 100, messages: [{ role: "user", content: "hi" }] },
      { post },
    );

    expect(message.model).toBe(managedAssistModelLabel("gemini-2.5-flash"));
  });

  it("같은 탭의 관리형 요청은 서버의 사용자당 단일 처리에 막히지 않게 차례로 보낸다", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const post = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return serverMessage("결과");
    });
    const params = { model: "claude-opus-5-5", max_tokens: 100, messages: [{ role: "user" as const, content: "hi" }] };

    await Promise.all([
      runManagedAssistMessage(params, { post }),
      runManagedAssistMessage(params, { post }),
      runManagedAssistMessage(params, { post }),
    ]);

    expect(post).toHaveBeenCalledTimes(3);
    expect(maxInFlight).toBe(1);
  });

  it("차례를 기다리던 요청을 취소하면 바로 끝나고, 뒤 요청은 앞 요청이 끝난 뒤에 간다", async () => {
    let releaseFirst!: () => void;
    const order: string[] = [];
    const post = vi.fn(async (body: ManagedAssistRequestBody) => {
      const label = String(body.messages[0]?.content);
      order.push(`start:${label}`);
      if (label === "first") await new Promise<void>((resolve) => { releaseFirst = resolve; });
      order.push(`end:${label}`);
      return serverMessage(label);
    });
    const request = (content: string) => ({ model: "claude-opus-5-5", max_tokens: 100, messages: [{ role: "user" as const, content }] });
    const controller = new AbortController();

    const first = runManagedAssistMessage(request("first"), { post });
    const second = runManagedAssistMessage(request("second"), { post, signal: controller.signal });
    const third = runManagedAssistMessage(request("third"), { post });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(second).rejects.toThrow(/취소/u);
    expect(order).toEqual(["start:first"]);

    releaseFirst();
    await first;
    await third;
    expect(order).toEqual(["start:first", "end:first", "start:third", "end:third"]);
  });
});

describe("mapManagedAssistError", () => {
  it.each([
    [new AppApiError("login", { kind: "unauthorized", status: 401, code: "FREE_AI_LOGIN_REQUIRED" }), "authentication"],
    [new AppApiError("pool", { kind: "rate_limited", status: 429, code: "FREE_AI_POOL_EXHAUSTED" }), "all-free-exhausted"],
    [new AppApiError("busy", { kind: "rate_limited", status: 429, code: "SOMETHING_ELSE" }), "quota-exhausted"],
    [new AppApiError("off", { kind: "capability_unavailable", status: 503, code: "PREMIUM_AI_UNAVAILABLE" }), "not-configured"],
    [new AppApiError("boom", { kind: "server", status: 500, code: "INTERNAL" }), "http-error"],
  ] as const)("서버 오류 %#를 보조 기능 오류 코드로 바꾼다", (error, code) => {
    const mapped = mapManagedAssistError(error);
    expect(mapped).toBeInstanceOf(UserAiTransportError);
    expect((mapped as UserAiTransportError).code).toBe(code);
  });

  it("사용자가 멈추거나 시간이 지나면 자동 재전송하지 않는다는 문구로 끝낸다", () => {
    const controller = new AbortController();
    controller.abort();
    expect(mapManagedAssistError(new DOMException("aborted", "AbortError"), controller.signal).message)
      .toMatch(/자동 재전송하지 않습니다/u);
  });
});

describe("전송 계층의 관리형 경로", () => {
  beforeEach(() => {
    postMock.mockReset();
    resetAssistUsage();
    resetAssistBudgetForTests();
  });

  afterEach(() => {
    resetAssistUsage();
    resetAssistBudgetForTests();
  });

  it("사용자 예산 한도와 사용량 미터를 거치지 않고 서버 경로로 보낸다", async () => {
    // 사용자 비용이 없는 경로라, 아주 작은 예산 한도가 있어도 막지 않고 세션 사용액에도 더하지 않는다.
    setAssistBudgetLimit(0.0001);
    postMock.mockImplementation(async () => serverMessage(JSON.stringify({ verdict: "좋아요", score: 90 })));
    const { assistParse } = await import("./assist-transport");

    const { parsed } = await assistParse(
      managedAssistRoute(),
      { model: "claude-opus-5-5", max_tokens: 800, messages: [{ role: "user", content: "점검해 줘" }] },
      Schema,
      { capUsd: 5 },
    );

    expect(parsed.score).toBe(90);
    expect(postMock).toHaveBeenCalledTimes(1);
    const [path, body, init] = postMock.mock.calls[0] as [string, ManagedAssistRequestBody, { headers: Record<string, string> }];
    expect(path).toBe("/studio-ai/messages");
    expect(body.messages).toHaveLength(1);
    expect(init.headers["Idempotency-Key"]).toMatch(/^assist-/u);
    expect(getAssistUsageSnapshot()).toMatchObject({ requests: 0, unconfirmedRequests: 0 });
  });

  it("관리형 경로는 키 값을 담지 않는다", () => {
    const route = managedAssistRoute();
    expect(route).toMatchObject({ managed: true, apiKey: "", label: "ToonStudio AI" });
  });
});
