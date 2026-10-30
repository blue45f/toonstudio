import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CustomerSupportAiService } from "./customer-support-ai.service";

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function completed(text = "설정 화면에서 로그인 상태를 확인해 주세요."): Response {
  return response({ stop_reason: "end_turn", content: [{ type: "text", text }] });
}

describe("고객센터 Claude 어댑터", () => {
  const service = new CustomerSupportAiService();
  const messages = [{ role: "user" as const, content: "로그인이 안 돼요" }];

  beforeEach(() => {
    vi.stubEnv("STUDIO_AI_ANTHROPIC_API_KEY", "support-fixture-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("CUSTOMER_SUPPORT_AI_ENABLED", "true");
    vi.stubEnv("STUDIO_AI_ANTHROPIC_MODEL", "claude-sonnet-5-5");
    vi.stubEnv("STUDIO_AI_ANTHROPIC_WORKSPACE_ID", "");
    vi.stubEnv("STUDIO_AI_PREMIUM_AUTO", "true");
    vi.stubEnv("STUDIO_AI_PREMIUM_USER_DAILY_REQUEST_LIMIT", "30");
    vi.stubEnv("STUDIO_AI_PREMIUM_GLOBAL_DAILY_REQUEST_LIMIT", "400");
    vi.stubEnv("STUDIO_AI_PREMIUM_GLOBAL_DAILY_TOKEN_LIMIT", "3000000");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("키의 값이나 모델을 상태 응답에 포함하지 않는다", () => {
    expect(service.status()).toEqual({ available: true, reason: "configured" });
    expect(JSON.stringify(service.status())).not.toContain("support-fixture-key");
  });

  it("키가 없거나 운영자가 끄면 호출 전에 안전하게 거절한다", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchFn);
    vi.stubEnv("STUDIO_AI_ANTHROPIC_API_KEY", "");
    expect(service.status()).toEqual({ available: false, reason: "missing_key" });
    await expect(service.answer(messages)).rejects.toBeInstanceOf(ServiceUnavailableException);
    vi.stubEnv("STUDIO_AI_ANTHROPIC_API_KEY", "support-fixture-key");
    vi.stubEnv("CUSTOMER_SUPPORT_AI_ENABLED", " FALSE ");
    expect(service.status()).toEqual({ available: false, reason: "disabled" });
    await expect(service.answer(messages)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("기존 서버 키·모델·워크스페이스로 공식 Messages API에만 요청한다", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(completed());
    vi.stubGlobal("fetch", fetchFn);
    vi.stubEnv("STUDIO_AI_ANTHROPIC_WORKSPACE_ID", "wrkspc_support123");
    const history = [{ role: "user" as const, content: "저장 문제" },
      { role: "assistant" as const, content: "저장 상태를 확인해 주세요." }, ...messages];
    await expect(service.answer(history)).resolves.toContain("로그인 상태");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init).toMatchObject({ method: "POST", redirect: "error", headers: {
      "x-api-key": "support-fixture-key",
      "anthropic-version": "2023-06-01",
      "anthropic-workspace-id": "wrkspc_support123",
    } });
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: "claude-sonnet-5-5", max_tokens: 1024, messages: history });
    expect(body.system).toContain("/studio/manual");
    expect(body.system).toContain("신뢰할 수 없는 문의 자료");
    expect(body.system).toContain("공개 게시판에 개인정보");
    expect(body.system).toContain("1:1 상담");
    expect(body.system).not.toContain("support-fixture-key");
    // 예약량의 시스템·메시지 포맷 여유가 실제 고정 프롬프트보다 커야 한다.
    expect(Buffer.byteLength(body.system, "utf8") + 20 * 128).toBeLessThan(8192);
  });

  it.each([
    ["STUDIO_AI_PREMIUM_AUTO", "false"],
    ["STUDIO_AI_PREMIUM_USER_DAILY_REQUEST_LIMIT", "0"],
    ["STUDIO_AI_PREMIUM_GLOBAL_DAILY_REQUEST_LIMIT", "0"],
    ["STUDIO_AI_PREMIUM_GLOBAL_DAILY_TOKEN_LIMIT", "0"],
  ])("기존 운영 중지 설정 %s=%s를 고객상담에서도 존중한다", async (name, value) => {
    vi.stubEnv(name, value);
    const fetchFn = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchFn);
    expect(service.status()).toEqual({ available: false, reason: "disabled" });
    await expect(service.answer(messages)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("문서에서 쓰는 표준 Anthropic 환경변수도 사용한다", async () => {
    vi.stubEnv("STUDIO_AI_ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "standard-fixture-key");
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(completed());
    vi.stubGlobal("fetch", fetchFn);
    await service.answer(messages);
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({ "x-api-key": "standard-fixture-key" });
  });

  it("잘못된 워크스페이스 설정은 전송하지 않는다", async () => {
    vi.stubEnv("STUDIO_AI_ANTHROPIC_WORKSPACE_ID", "invalid workspace");
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(completed());
    vi.stubGlobal("fetch", fetchFn);
    await service.answer(messages);
    expect(fetchFn.mock.calls[0]?.[1]?.headers).not.toHaveProperty("anthropic-workspace-id");
  });

  it.each([400, 401, 429, 500, 529])("제공자 오류 %i는 원문 유출이나 재시도 없이 매핑한다", async (status) => {
    const rawResponse = response({ error: { message: "private provider input" } }, status);
    const readBody = vi.spyOn(rawResponse, "json");
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(rawResponse);
    vi.stubGlobal("fetch", fetchFn);
    const error = await service.answer(messages).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    if (!(error instanceof ServiceUnavailableException)) throw new Error("오류 매핑 실패");
    expect(error.getResponse()).toMatchObject({ code: "SUPPORT_AI_UNAVAILABLE" });
    expect(JSON.stringify(error.getResponse())).not.toContain("private provider input");
    expect(readBody).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each(["max_tokens", "refusal", "pause_turn", "tool_use", undefined])(
    "완료되지 않은 응답 %s를 답변 성공으로 처리하지 않는다", async (stopReason) => {
      vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response({
        stop_reason: stopReason, content: [{ type: "text", text: "잘린 응답" }],
      })));
      await expect(service.answer(messages)).rejects.toBeInstanceOf(ServiceUnavailableException);
    },
  );

  it.each([null, {}, { stop_reason: "end_turn", content: [] },
    { stop_reason: "end_turn", content: [{ type: "text", text: " " }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "x".repeat(4_001) }] },
  ])("빈 응답이나 잘못된 응답을 거절한다", async (payload) => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response(payload)));
    await expect(service.answer(messages)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("JSON 해석과 네트워크 실패도 비공개 안전 오류로 매핑한다", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("invalid json")));
    await expect(service.answer(messages)).rejects.toBeInstanceOf(ServiceUnavailableException);
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("private key details")));
    await expect(service.answer(messages)).rejects.toThrow("AI 답변을 지금 받을 수 없어요");
  });

  it("30초가 지나면 요청을 취소하며 자동 재시도하지 않는다", async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchFn);
    const result = service.answer(messages).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toBeInstanceOf(ServiceUnavailableException);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("빈 입력·문자 수·대화 수 한도를 외부 호출 전에 확인한다", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchFn);
    const invalid = [[], [{ role: "user" as const, content: " " }],
      [{ role: "user" as const, content: "x".repeat(4_001) }],
      Array.from({ length: 21 }, () => messages[0]),
      Array.from({ length: 9 }, () => ({ role: "user" as const, content: "x".repeat(4_000) })),
      [{ role: "assistant" as const, content: "답변" }],
    ];
    for (const history of invalid) {
      await expect(service.answer(history)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
