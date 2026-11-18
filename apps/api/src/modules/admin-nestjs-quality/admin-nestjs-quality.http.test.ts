import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createNestBoardDocument } from "@toonstudio/contracts/admin-nestjs-quality-seed";
import { configureApiBodyParserBoundary } from "../../config/api-body-parser-boundary";
import { createCsrfProtectionMiddleware } from "../../csrf-middleware";
import { sessionAuth } from "../../session-middleware";
import { AdminNestjsQualityController } from "./admin-nestjs-quality.controller";
import { AdminNestjsQualityRepository } from "./admin-nestjs-quality.repository";

const { verify, allowed } = vi.hoisted(() => ({ verify: vi.fn(), allowed: vi.fn() }));
vi.mock("../../server/session", () => ({ verifySessionToken: verify, SESSION_TOKEN_TTL_MS: 60_000 }));
vi.mock("../../server/user-lifecycle", () => ({ isSessionAllowed: allowed }));

describe("NestJS 검증 보드 HTTP 인증·CSRF 경계", () => {
  let app: INestApplication;
  let base: string;
  const query = vi.fn(async (statement: string, args?: unknown[]) => {
    if (statement.includes('FROM "user"')) return { rows: [{ role: args?.[0] === "admin" ? "admin" : "operator" }] };
    return { rows: [] };
  });
  const repository = new AdminNestjsQualityRepository({ connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool);

  beforeAll(async () => {
    @Module({ controllers: [AdminNestjsQualityController], providers: [{ provide: AdminNestjsQualityRepository, useValue: repository }] })
    class BoundaryModule {}
    app = await NestFactory.create(BoundaryModule, { bodyParser: false, logger: false });
    // 운영 main.ts와 동일한 인증 → CSRF → 본문 파싱 순서를 사용한다.
    app.use(sessionAuth);
    app.use(createCsrfProtectionMiddleware({ NODE_ENV: "test" }));
    configureApiBodyParserBoundary(app, null);
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    query.mockClear();
    verify.mockImplementation((token: string) => ["verified-admin", "verified-operator"].includes(token)
      ? { userId: token.replace("verified-", ""), sessionVersion: 1, expiresAt: Date.now() + 60_000 } : null);
    allowed.mockResolvedValue(true);
  });
  afterAll(async () => { await app?.close(); });

  function request(headers: Record<string, string> = {}, body?: unknown, path = "") {
    return fetch(`${base}/api/admin/quality/nestjs${path}`, {
      method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  const cookie = (actor = "admin") => ({ cookie: `toonstudio-auth-session=verified-${actor}` });
  const command = () => ({ expectedRevision: 0, mutationId: randomUUID(), document: createNestBoardDocument(), reason: "HTTP 권한 검증" });

  it("익명·평문 사용자 ID 헤더·만료 세션으로 보드를 읽을 수 없다", async () => {
    for (const headers of [{}, { "x-user-id": "admin" }, { cookie: "toonstudio-auth-session=expired" }]) {
      const response = await request(headers);
      expect(response.status).toBe(401);
      expect(await response.json()).not.toHaveProperty("document");
    }
    expect(query).not.toHaveBeenCalled();
  });

  it("검증된 관리자·운영자 쿠키를 실제 controller에 전달하고 응답을 캐시하지 않는다", async () => {
    for (const actor of ["admin", "operator"]) {
      const response = await request(cookie(actor));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.json()).toMatchObject({ revision: 0, canEdit: actor === "admin" });
    }
  });

  it("쿠키 변경 요청의 출처·CSRF 증명을 확인하고 인증 출처 헤더 위조를 무시한다", async () => {
    const attempts = [
      { ...cookie(), origin: base },
      { ...cookie(), origin: "https://foreign.example", "x-toonstudio-csrf": "1" },
      { ...cookie(), origin: "https://foreign.example", "x-toonstudio-csrf": "1", "x-session-authentication-source": "header" },
    ];
    for (const headers of attempts) {
      const response = await request(headers, command());
      expect(response.status).toBe(403);
      await response.text();
    }
    expect(query).not.toHaveBeenCalled();
  });

  it("동일 출처·CSRF 증명을 통과한 운영자도 저장 권한을 얻지 못한다", async () => {
    const response = await request({ ...cookie("operator"), origin: base, "x-toonstudio-csrf": "1" }, command());
    expect(response.status).toBe(403);
    await response.text();
    expect(query.mock.calls.some(([sql]) => /INSERT|UPDATE/u.test(sql))).toBe(false);
  });

  it("정상 관리자 요청은 본문 검증까지 도달하지만 잘못된 입력과 2MB 초과 자료는 저장하지 않는다", async () => {
    for (const body of [{}, { ...command(), extra: "x".repeat(2_000_001) }]) {
      const response = await request({ ...cookie(), origin: base, "x-toonstudio-csrf": "1" }, body);
      expect(response.status).toBe(400);
      await response.text();
    }
    expect(query).not.toHaveBeenCalled();
  });

  it("세션 회수 뒤의 요청은 이전 쿠키로 문서와 이력을 읽지 못한다", async () => {
    allowed.mockResolvedValue(false);
    for (const path of ["", "/history/1"]) {
      const response = await request(cookie(), undefined, path);
      expect(response.status).toBe(401);
      await response.text();
    }
    expect(query).not.toHaveBeenCalled();
  });
});
