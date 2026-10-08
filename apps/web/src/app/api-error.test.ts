// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getAuthSession,
  getLastUnauthorizedDropHadSession,
  handleUnauthorizedSession,
  persistSession,
} from "@/domains/auth/public/session/auth-session-state";

import { api, apiFetch, isAppApiError } from "../platform/api";
import {
  SERVICE_CAPABILITY_ERROR_EVENT,
  isNotFoundError,
  registerUnauthorizedSessionProbe,
} from "../platform/api-error";

const originalFetch = globalThis.fetch;

// 앱 진입점(app/main.tsx)과 같은 방식으로 세션 판정을 등록해, 401 문구의 게스트·세션 구분을 그대로 검증한다.
registerUnauthorizedSessionProbe(() => getAuthSession() !== null || getLastUnauthorizedDropHadSession());

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("application API error contract", () => {
  it("preserves safe 503 capability metadata and emits a runtime signal", async () => {
    const events: unknown[] = [];
    const listener = (event: Event) => {
      events.push(event instanceof CustomEvent ? event.detail : null);
    };
    globalThis.addEventListener(SERVICE_CAPABILITY_ERROR_EVENT, listener);
    globalThis.fetch = vi.fn(async () => jsonResponse({
      statusCode: 503,
      code: "DATABASE_UNAVAILABLE",
      capability: "community.posts.read",
      retryable: true,
      retryAfterSeconds: 30,
      requestId: "req_test",
      incidentId: "inc_test",
      message: "Request could not be completed",
    }, 503, {
      "Retry-After": "30",
      "X-Request-Id": "req_test",
      "X-Incident-Id": "inc_test",
    })) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await api.get("/community/posts", { retry: 0 });
    } catch (error) {
      caught = error;
    } finally {
      globalThis.removeEventListener(SERVICE_CAPABILITY_ERROR_EVENT, listener);
    }

    expect(isAppApiError(caught)).toBe(true);
    expect(caught).toMatchObject({
      kind: "capability_unavailable",
      status: 503,
      code: "DATABASE_UNAVAILABLE",
      capability: "community.posts.read",
      retryable: true,
      retryAfterSeconds: 30,
      requestId: "req_test",
      incidentId: "inc_test",
    });
    expect((caught as Error).message).toContain("일부 온라인 기능");
    expect(events).toContainEqual(expect.objectContaining({
      capability: "community.posts.read",
      incidentId: "inc_test",
    }));
  });

  it("observes response-oriented 503 calls without forcing callers to throw", async () => {
    const events: unknown[] = [];
    const listener = (event: Event) => {
      events.push(event instanceof CustomEvent ? event.detail : null);
    };
    globalThis.addEventListener(SERVICE_CAPABILITY_ERROR_EVENT, listener);
    globalThis.fetch = vi.fn(async () => jsonResponse({
      statusCode: 503,
      code: "DATABASE_UNAVAILABLE",
      capability: "community.write",
      retryable: true,
      incidentId: "inc_raw",
    }, 503)) as unknown as typeof fetch;

    try {
      const response = await apiFetch("/community/posts", { method: "POST" });
      expect(response.status).toBe(503);
    } finally {
      globalThis.removeEventListener(SERVICE_CAPABILITY_ERROR_EVENT, listener);
    }
    expect(events).toContainEqual(expect.objectContaining({
      capability: "community.write",
      incidentId: "inc_raw",
    }));
  });

  it("uses Retry-After for rate-limit guidance", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(
      { statusCode: 429, message: "too many requests" },
      429,
      { "Retry-After": "7" },
    )) as unknown as typeof fetch;

    await expect(api.get("/limited", { retry: 0 })).rejects.toMatchObject({
      kind: "rate_limited",
      status: 429,
      retryAfterSeconds: 7,
      retryable: true,
      message: expect.stringContaining("7초 후"),
    });
  });

  it("preserves safe validation messages without reclassifying them", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(
      { statusCode: 422, message: "제목을 입력해 주세요." },
      422,
    )) as unknown as typeof fetch;

    await expect(api.get("/validation", { retry: 0 })).rejects.toMatchObject({
      kind: "validation",
      status: 422,
      message: "제목을 입력해 주세요.",
    });
  });

  it("classifies transport failures as reachable retries without leaking raw text", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    await expect(api.get("/transport", { retry: 0 })).rejects.toMatchObject({
      kind: "unreachable",
      status: null,
      retryable: true,
      message: expect.stringContaining("서버에 연결할 수 없습니다"),
    });
  });
});

describe("unauthorized copy (F-B09-1)", () => {
  afterEach(() => {
    // 세션 상태를 게스트로 되돌리고 만료 기록까지 비워 다음 테스트와 격리한다.
    persistSession(null);
    handleUnauthorizedSession();
  });

  it("tells guests sign-in is required instead of claiming an expiry", async () => {
    persistSession(null);
    handleUnauthorizedSession();
    globalThis.fetch = vi.fn(async () => jsonResponse(
      { statusCode: 401, message: "unauthorized" },
      401,
    )) as unknown as typeof fetch;

    const caught = await api.get("/protected", { retry: 0 }).catch((error: unknown) => error);
    expect(isAppApiError(caught)).toBe(true);
    expect(caught).toMatchObject({ kind: "unauthorized", status: 401 });
    expect((caught as Error).message).toContain("로그인이 필요합니다");
    expect((caught as Error).message).not.toContain("만료");
  });

  it("reports expiry when a signed-in session is dropped by the 401", async () => {
    persistSession({ user: { id: "user-qa-1" } });
    globalThis.fetch = vi.fn(async () => jsonResponse(
      { statusCode: 401, message: "unauthorized" },
      401,
    )) as unknown as typeof fetch;

    const caught = await api.get("/protected", { retry: 0 }).catch((error: unknown) => error);
    expect(isAppApiError(caught)).toBe(true);
    expect(caught).toMatchObject({ kind: "unauthorized", status: 401 });
    expect((caught as Error).message).toContain("로그인이 만료되었습니다");
  });
});

describe("forbidden copy (F-B17-1)", () => {
  it("keeps the server's stated reason instead of a generic permission line", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(
      { statusCode: 403, message: "로그인이 필요해요." },
      403,
    )) as unknown as typeof fetch;

    const caught = await api.post("/creator-support/applications", {}, { retry: 0 })
      .catch((error: unknown) => error);
    expect(isAppApiError(caught)).toBe(true);
    expect(caught).toMatchObject({ kind: "forbidden", status: 403 });
    expect((caught as Error).message).toBe("로그인이 필요해요.");
  });

  it("falls back to the generic permission line when the server gives no reason", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(
      { statusCode: 403 },
      403,
    )) as unknown as typeof fetch;

    const caught = await api.post("/creator-support/applications", {}, { retry: 0 })
      .catch((error: unknown) => error);
    expect(isAppApiError(caught)).toBe(true);
    expect(caught).toMatchObject({ kind: "forbidden", status: 403 });
    expect((caught as Error).message).toContain("이 작업을 수행할 권한이 없습니다");
  });
});

describe("isNotFoundError", () => {
  it("treats kind not_found as not found", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ message: "missing" }, 404)) as unknown as typeof fetch;
    const caught = await api.get("/missing", { retry: 0 }).catch((error: unknown) => error);
    expect(isAppApiError(caught)).toBe(true);
    expect(isNotFoundError(caught)).toBe(true);
  });

  it("rejects server errors and transport failures", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ message: "boom" }, 500)) as unknown as typeof fetch;
    const server = await api.get("/boom", { retry: 0 }).catch((error: unknown) => error);
    expect(isNotFoundError(server)).toBe(false);

    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const transport = await api.get("/down", { retry: 0 }).catch((error: unknown) => error);
    expect(isNotFoundError(transport)).toBe(false);
    expect(isNotFoundError(new Error("plain"))).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
  });
});
