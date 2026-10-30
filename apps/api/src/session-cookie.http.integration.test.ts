import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { signSession } from "./server/session";
import { getSessionAuthenticationPrincipal, sessionAuth } from "./session-middleware";

import type { Server } from "node:http";

vi.mock("./server/user-lifecycle", () => ({
  isSessionAllowed: vi.fn(async () => true),
}));

describe("운영 세션 쿠키 HTTP 인증 경계", () => {
  let server: Server;
  let origin: string;
  let attacker: string;
  let hostUser: string;

  beforeAll(async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SESSION_SECRET", "cookie-http-integration-test-secret-123456789");
    attacker = signSession("attacker-user", 1);
    hostUser = signSession("host-user", 1);
    const app = express();
    app.use(sessionAuth);
    app.get("/api/auth/session", (request, response) => {
      const principal = getSessionAuthenticationPrincipal(request);
      response.status(principal ? 200 : 401).json({ userId: principal?.userId ?? null });
    });
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
      server.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("테스트 API 주소가 없습니다.");
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    vi.unstubAllEnvs();
  });

  it("서명된 공격자 토큰도 레거시 이름으로 보내면 인증되지 않는다", async () => {
    const response = await fetch(`${origin}/api/auth/session`, {
      headers: { Cookie: `toonstudio-auth-session=${attacker}` },
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ userId: null });
  });

  it("더 긴 Path의 Domain 쿠키가 앞서 와도 __Host- 사용자만 인증한다", async () => {
    const response = await fetch(`${origin}/api/auth/session`, {
      headers: { Cookie: `toonstudio-auth-session=${attacker}; __Host-toonstudio-auth-session=${hostUser}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: "host-user" });
  });
});
