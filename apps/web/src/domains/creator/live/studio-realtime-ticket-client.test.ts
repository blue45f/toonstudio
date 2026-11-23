import { describe, expect, it, vi } from "vitest";

import {
  StudioRealtimeTicketDeniedError,
} from "../studio-realtime-provider-runtime";
import {
  StudioRealtimeHttpTicketIssuer,
} from "../studio-realtime-ticket-client";

import type { StudioRealtimeTicketRequest } from "../studio-realtime-provider-protocol";

const request: StudioRealtimeTicketRequest = {
  version: 1 as const,
  providerId: "cloudflare-realtime",
  sessionId: "session-1",
  scope: { workId: "work-1", roomId: "room-1" },
  workloads: ["presence"],
  capabilities: [
    "presence.snapshot-v1",
    "presence.members-v1",
    "presence.cursor-v1",
    "presence.resume-v1",
  ],
};

describe("StudioRealtimeHttpTicketIssuer", () => {
  it("오프라인 대기 중에는 입장권 타이머를 시작하지 않고 재연결 뒤 현재 세션만 발급한다", async () => {
    const browser = Object.assign(new EventTarget(), { navigator: { onLine: false } });
    vi.stubGlobal("window", browser);
    try {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("{}", { status: 200 }));
      const timeout = vi.fn();
      const issuer = new StudioRealtimeHttpTicketIssuer({
        endpoint: "/api/studio-realtime/tickets", fetch, setTimeout: timeout, clearTimeout: vi.fn(),
      });
      const previous = new AbortController();
      const stale = issuer.issue(request, previous.signal);
      const active = issuer.issue(request, new AbortController().signal);
      previous.abort();
      await expect(stale).rejects.toMatchObject({ name: "AbortError" });
      expect(fetch).not.toHaveBeenCalled();
      expect(timeout).not.toHaveBeenCalled();
      browser.navigator.onLine = true;
      browser.dispatchEvent(new Event("online"));
      await expect(active).resolves.toEqual({});
      expect(fetch).toHaveBeenCalledOnce();
      expect(timeout).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses only the HttpOnly cookie boundary and keeps tickets out of URLs", async () => {
    const response = {
      version: 1,
      providerId: "cloudflare-realtime",
      scope: request.scope,
      workloads: request.workloads,
      capabilities: request.capabilities,
      issuedAt: "2026-07-31T00:00:00.000Z",
      expiresAt: "2026-07-31T00:02:00.000Z",
      ticket: "opaque-provider-ticket-123456789012345678901234567890",
    };
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const issuer = new StudioRealtimeHttpTicketIssuer({
      endpoint: "/api/studio-realtime/tickets",
      fetch,
    });

    await expect(
      issuer.issue(request, new AbortController().signal),
    ).resolves.toEqual(response);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("/api/studio-realtime/tickets");
    expect(String(url)).not.toContain(response.ticket);
    const headers = new Headers(init?.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.has("x-user-id")).toBe(false);
    expect(headers.get("x-toonstudio-csrf")).toBe("1");
    expect(init?.credentials).toBe("include");
    expect(JSON.stringify(init)).not.toContain(response.ticket);
  });

  it("treats 401 and 403 as a permanent ticket denial", async () => {
    for (const status of [401, 403]) {
      const issuer = new StudioRealtimeHttpTicketIssuer({
        endpoint: "/api/studio-realtime/tickets",
        fetch: vi.fn<typeof globalThis.fetch>(
          async () =>
            new Response(JSON.stringify({ message: "로그인이 필요해요." }), {
              status,
            }),
        ),
      });
      await expect(
        issuer.issue(request, new AbortController().signal),
      ).rejects.toBeInstanceOf(StudioRealtimeTicketDeniedError);
    }
  });

  it("fails closed on oversized and token-bearing error bodies", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          JSON.stringify({
            error: "opaque-provider-ticket-should-never-be-reflected",
          }),
          { status: 503 },
        ),
    );
    const issuer = new StudioRealtimeHttpTicketIssuer({
      endpoint: "/api/studio-realtime/tickets",
      fetch,
    });

    const error = await issuer
      .issue(request, new AbortController().signal)
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("opaque-provider-ticket");
  });

  it("cancels a streaming response as soon as it exceeds the byte budget", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(12 * 1024));
        controller.enqueue(new Uint8Array(5 * 1024));
      },
      cancel,
    });
    const issuer = new StudioRealtimeHttpTicketIssuer({
      endpoint: "/api/studio-realtime/tickets",
      fetch: vi.fn<typeof globalThis.fetch>(
        async () => new Response(body, { status: 200 }),
      ),
    });

    await expect(
      issuer.issue(request, new AbortController().signal),
    ).rejects.toThrow("허용 크기를 초과");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("aborts a timed-out request without exposing a browser session credential", async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi.fn<typeof globalThis.fetch>(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          }),
      );
      const issuer = new StudioRealtimeHttpTicketIssuer({
        endpoint: "/api/studio-realtime/tickets",
        fetch,
        timeoutMs: 1_000,
      });
      const pending = issuer.issue(request, new AbortController().signal);
      const rejection = expect(pending).rejects.toMatchObject({
        name: "AbortError",
      });
      await vi.advanceTimersByTimeAsync(1_000);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });
});
