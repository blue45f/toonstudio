import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyData } from "@toonstudio/contracts/admin-production-change";
import { configureApiBodyParserBoundary } from "../../config/api-body-parser-boundary";
import { createCsrfProtectionMiddleware } from "../../csrf-middleware";
import { sessionAuth } from "../../session-middleware";
import { AdminProductionChangesController, AdminProductionChangesUploadGuard } from "./admin-production-changes.controller";
import { AdminProductionChangesRepository } from "./admin-production-changes.repository";
import { AdminProductionChangesCaptureService } from "./admin-production-changes-capture.service";

const { verify, allowed } = vi.hoisted(() => ({ verify: vi.fn(), allowed: vi.fn() }));
vi.mock("../../server/session", () => ({ verifySessionToken: verify, SESSION_TOKEN_TTL_MS: 60_000 }));
vi.mock("../../server/user-lifecycle", () => ({ isSessionAllowed: allowed }));

describe("제작 변경 HTTP 인증·CSRF·본문 경계", () => {
  let app: INestApplication, base: string;
  const query = vi.fn(async (statement: string, values?: unknown[]) => {
    if (statement.includes('FROM "user"')) return { rows: [{ role: values?.[0] === "admin" ? "admin" : values?.[0] === "operator" ? "operator" : "user", name: "합성 계정" }] };
    return { rows: [] };
  });
  const repository = new AdminProductionChangesRepository({ connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool);
  const captures = new AdminProductionChangesCaptureService(repository);
  beforeAll(async () => {
    @Module({ controllers: [AdminProductionChangesController], providers: [
      { provide: AdminProductionChangesRepository, useValue: repository }, { provide: AdminProductionChangesCaptureService, useValue: captures }, AdminProductionChangesUploadGuard,
    ] })
    class BoundaryModule {}
    app = await NestFactory.create(BoundaryModule, { bodyParser: false, logger: false });
    app.use(sessionAuth); app.use(createCsrfProtectionMiddleware({ NODE_ENV: "test" }));
    configureApiBodyParserBoundary(app, null); app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  beforeEach(() => {
    query.mockClear();
    verify.mockImplementation((token: string) => ["verified-admin", "verified-operator", "verified-member"].includes(token) ? { userId: token.replace("verified-", ""), sessionVersion: 1, expiresAt: Date.now() + 60_000 } : null);
    allowed.mockResolvedValue(true);
  });
  afterAll(async () => { await app?.close(); });
  const cookie = (actor="admin") => ({ cookie: `toonstudio-auth-session=verified-${actor}` });
  function request(headers: Record<string,string>={}, body?: unknown, path="") {
    return fetch(base + "/api/admin/production-changes" + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  const command = () => ({ data: emptyData(), mutationId: randomUUID() });
  it("익명·위조한 사용자ID·만료 세션은 보드와 캡처에 접근하지 못한다", async () => {
    for (const headers of [{}, { "x-user-id": "admin" }, { cookie: "toonstudio-auth-session=expired" }]) {
      for (const path of ["", "/captures/" + randomUUID()]) {
        const result=await request(headers,undefined,path);expect(result.status).toBe(401);await result.text();
      }
    }
    expect(query).not.toHaveBeenCalled();
  });
  it("관리자·운영자만 조회하고 응답은 캐시하지 않는다", async () => {
    for(const actor of ["admin","operator"]){const response=await request(cookie(actor));expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store");expect(await response.json()).toEqual({requests:[]});}
    const member=await request(cookie("member"));expect(member.status).toBe(403);await member.text();
  });
  it("쿠키 쓰기에는 동일 출처·CSRF 증명이 필요하고 operator 변경도 차단한다", async () => {
    for(const headers of [{...cookie(),origin:base},{...cookie(),origin:"https://foreign.example","x-toonstudio-csrf":"1"}]){
      const response=await request(headers,command());expect(response.status).toBe(403);await response.text();
    }
    expect(query).not.toHaveBeenCalled();
    const operator=await request({...cookie("operator"),origin:base,"x-toonstudio-csrf":"1"},command());expect(operator.status).toBe(403);await operator.text();
    expect(query.mock.calls.some(([sql])=>/INSERT|UPDATE/u.test(sql))).toBe(false);
  });
  it("위조된 전체 record·잘못된 명령은 controller에서 DB 호출 전에 거부한다", async () => {
    const headers={...cookie(),origin:base,"x-toonstudio-csrf":"1"};
    for(const body of [{},{...command(),status:"approved",history:[]},{...command(),mutationId:"not-a-uuid"}]){
      const response=await request(headers,body);expect(response.status).toBe(400);await response.text();
    }
    expect(query).not.toHaveBeenCalled();
  });
  it("업로드 guard가 파일 파싱 전에 익명과 운영자를 거부한다", async () => {
    for(const actor of [null,"operator"]){
      const form=new FormData();form.append("file",new Blob(["not-an-image"],{type:"image/png"}),"capture.png");
      const response=await fetch(base+"/api/admin/production-changes/captures",{method:"POST",headers:{...(actor?cookie(actor):{}),origin:base,"x-toonstudio-csrf":"1"},body:form});
      expect(response.status).toBe(actor?403:401);await response.text();
    }
    expect(query.mock.calls.some(([sql])=>/INSERT|UPDATE/u.test(sql))).toBe(false);
  });
  it("세션 회수 뒤에는 기존 쿠키로 기록을 읽지 못한다", async () => {
    allowed.mockResolvedValue(false);const response=await request(cookie());expect(response.status).toBe(401);await response.text();expect(query).not.toHaveBeenCalled();
  });
});
