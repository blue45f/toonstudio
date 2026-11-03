// @vitest-environment node
import "reflect-metadata";
import {
  Controller, ForbiddenException, Get, InternalServerErrorException,
  Logger, Module, Param, Post, Res, StreamableFile, UseInterceptors,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { request as httpRequest, type IncomingHttpHeaders, type Server } from "node:http";
import { gunzipSync } from "node:zlib";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { signSession } from "../../server/session";
import { AUTH_SESSION_COOKIE_NAME } from "../../session-cookie";
import { sessionAuth } from "../../session-middleware";
import { ProductionCollaborationController } from "./production-collaboration.controller";
import { ProductionCollaborationService } from "./production-collaboration.service";
import { ProductionProjectReadCompressionInterceptor } from "./production-project-read-compression.interceptor";

import type { INestApplication } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

const compression = vi.hoisted(() => ({ fail: false }));
vi.mock("node:zlib", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:zlib")>();
  return {
    ...original,
    gzip(input: Parameters<typeof original.gzip>[0], callback: (error: Error | null, result: Buffer) => void) {
      if (compression.fail) queueMicrotask(() => callback(new Error("synthetic gzip failure"), Buffer.alloc(0)));
      else original.gzip(input, callback);
    },
  };
});
// 서명과 session middleware는 실제 구현이다. DB 세션 상태·프로젝트 ACL만 독립 fixture로 둔다.
vi.mock("../../server/user-lifecycle", () => ({
  isSessionAllowed: vi.fn(async (id: string) => id === "compression-owner" || id === "compression-viewer"),
}));

const PROJECT = "00000000-0000-4000-8000-000000000001";
const WORK = "00000000-0000-4000-8000-000000000002";
const ERROR_PROJECT = "00000000-0000-4000-8000-000000000003";
const payload = {
  aggregate: { projectId: PROJECT, workId: WORK, title: "전송 원문 <&>", text: "가나다·동일 JSON ".repeat(512), revision: 7 },
  access: { view: true, edit: true, manage: true },
};
const plainBytes = Buffer.from(JSON.stringify(payload));
function projectRecord(actor: string, id: string) {
  if (actor !== "compression-owner") throw new ForbiddenException("fixture project access denied");
  if (id === ERROR_PROJECT) throw new InternalServerErrorException("fixture service failure");
  return payload;
}
const service = {
  getProject: vi.fn(projectRecord),
  getProjectByWork: vi.fn(projectRecord),
};

// 제외 조건도 실제 Nest 응답 파이프라인을 통과시킨다. 제품에 시험용 옵션은 추가하지 않는다.
@Controller("/compression-probe")
@UseInterceptors(ProductionProjectReadCompressionInterceptor)
class ProbeController {
  @Get("/:kind")
  get(@Param("kind") kind: string, @Res({ passthrough: true }) response: Response) {
    if (kind === "small") return { ok: true };
    if (kind === "binary") return new StreamableFile(Buffer.alloc(2_048, 7), { type: "application/octet-stream" });
    if (kind === "sse") {
      response.type("text/event-stream");
      return `data: ${"fixture".repeat(256)}\n\n`;
    }
    if (kind === "encoded") response.setHeader("Content-Encoding", "identity");
    if (kind === "status") response.status(202);
    return payload;
  }

  @Get("/sent/already")
  sent(@Res() response: Response) {
    response.json(payload);
    return payload;
  }

  @Post("/post")
  post() { return payload; }
}

@Module({
  controllers: [ProductionCollaborationController, ProbeController],
  providers: [{ provide: ProductionCollaborationService, useValue: service }],
})
class FixtureModule {}

type WireResponse = { status: number; headers: IncomingHttpHeaders; body: Buffer };
let app: INestApplication;
let port: number;
function wire(path: string, { encoding, actor = "compression-owner", method = "GET", forgedUserId }: {
  encoding?: string; actor?: string | null; method?: string; forgedUserId?: string;
} = {}): Promise<WireResponse> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (encoding !== undefined) headers["Accept-Encoding"] = encoding;
    if (actor) headers.Cookie = `${AUTH_SESSION_COOKIE_NAME}=${signSession(actor)}`;
    if (forgedUserId) headers["x-user-id"] = forgedUserId;
    const request = httpRequest({ host: "127.0.0.1", port, path: `/api${path}`, method, headers, agent: false }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("error", (error) => { clearTimeout(deadline); reject(error); });
      response.on("end", () => {
        clearTimeout(deadline);
        resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) });
      });
    });
    const deadline = setTimeout(() => request.destroy(new Error("fixture HTTP deadline")), 5_000);
    request.on("error", (error) => { clearTimeout(deadline); reject(error); });
    request.end();
  });
}

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("AUTH_SESSION_SECRET", "compression-http-synthetic-fixture-secret-at-least-32-bytes");
  app = await NestFactory.create(FixtureModule, { logger: false, abortOnError: false });
  app.setGlobalPrefix("api");
  app.use(sessionAuth);
  app.use((_request: Request, response: Response, next: NextFunction) => { response.vary("Origin"); next(); });
  await app.listen(0, "127.0.0.1");
  const server: Server = app.getHttpServer();
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("fixture TCP address required");
  port = address.port;
});
beforeEach(() => {
  compression.fail = false;
  vi.clearAllMocks();
  vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  try { await app?.close(); } finally { vi.unstubAllEnvs(); }
});

describe.each([
  { name: "project", path: `/production/projects/${PROJECT}`, read: service.getProject },
  { name: "work", path: `/production/works/${WORK}/project`, read: service.getProjectByWork },
])("aggregate GET의 실제 wire 응답: $name", ({ path, read }) => {
  it("gzip 원문 전체가 identity bytes와 같고 길이·캐시·Vary를 보존한다", async () => {
    const identity = await wire(path);
    const encoded = await wire(path, { encoding: "gzip" });
    expect(identity.status).toBe(200);
    expect(identity.headers["content-encoding"]).toBeUndefined();
    expect(identity.body).toEqual(plainBytes);
    expect(encoded.status).toBe(200);
    expect(encoded.headers["content-encoding"]).toBe("gzip");
    expect(encoded.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(Number(encoded.headers["content-length"])).toBe(encoded.body.length);
    expect(encoded.body.length).toBeLessThan(identity.body.length);
    expect(gunzipSync(encoded.body)).toEqual(identity.body);
    expect(JSON.parse(gunzipSync(encoded.body).toString("utf8"))).toEqual(payload);
    for (const response of [identity, encoded]) {
      expect(response.headers["cache-control"]).toBe("private, no-store, max-age=0");
      expect(String(response.headers.vary).split(/,\s*/u)).toEqual(expect.arrayContaining(["Origin", "Accept-Encoding"]));
    }
    expect(read).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["identity", false], ["gzip;q=0", false], ["gzip;q=0, *;q=1", false],
    ["gzip;q=0.2, identity;q=0.8", false], ["gzip;q=0.8, identity;q=0.2", true],
    ["GZIP;q=1, identity;q=0", true],
  ] as const)("Accept-Encoding %s의 우선순위를 지킨다", async (encoding, compressed) => {
    const response = await wire(path, { encoding });
    expect(response.status).toBe(200);
    expect(response.headers["content-encoding"]).toBe(compressed ? "gzip" : undefined);
    expect(compressed ? gunzipSync(response.body) : response.body).toEqual(plainBytes);
    expect(read).toHaveBeenCalledOnce();
  });

  it("HEAD에는 압축 본문이나 gzip 헤더를 추가하지 않는다", async () => {
    const response = await wire(path, { encoding: "gzip", method: "HEAD" });
    expect(response.status).toBe(200);
    expect(response.body.length).toBe(0);
    expect(response.headers["content-encoding"]).toBeUndefined();
  });

  it.each([null, "compression-viewer"])("미인증·권한 부족은 기존 403으로 유지한다: %s", async (actor) => {
    const response = await wire(path, { encoding: "gzip", actor });
    expect(response.status).toBe(403);
    expect(response.headers["content-encoding"]).toBeUndefined();
    expect(JSON.parse(response.body.toString("utf8")).statusCode).toBe(403);
    expect(read).toHaveBeenCalledTimes(actor === null ? 0 : 1);
  });

  it("압축 오류는 고정 경고와 원본문 응답으로 끝나고 서비스를 재실행하지 않는다", async () => {
    compression.fail = true;
    const response = await wire(path, { encoding: "gzip" });
    expect(response.status).toBe(200);
    expect(response.headers["content-encoding"]).toBeUndefined();
    expect(response.body).toEqual(plainBytes);
    expect(Number(response.headers["content-length"])).toBe(plainBytes.length);
    expect(response.headers["cache-control"]).toBe("private, no-store, max-age=0");
    expect(Logger.prototype.warn).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledOnce();
  });
});

it("위조 ID와 service 오류는 압축된 성공 응답으로 바꾸지 않는다", async () => {
  const forged = await wire(`/production/projects/${PROJECT}`, { encoding: "gzip", actor: null, forgedUserId: "compression-owner" });
  expect(forged.status).toBe(403);
  expect(service.getProject).not.toHaveBeenCalled();
  const failed = await wire(`/production/projects/${ERROR_PROJECT}`, { encoding: "gzip" });
  expect(failed.status).toBe(500);
  expect(failed.headers["content-encoding"]).toBeUndefined();
  expect(JSON.parse(failed.body.toString("utf8")).statusCode).toBe(500);
  expect(service.getProject).toHaveBeenCalledOnce();
});

it("작은 본문·기존 encoding·비200·POST·이미 전송한 응답을 압축하지 않는다", async () => {
  const small = await wire("/compression-probe/small", { encoding: "gzip" });
  expect(small.headers["content-encoding"]).toBeUndefined();
  expect(JSON.parse(small.body.toString("utf8"))).toEqual({ ok: true });
  const encoded = await wire("/compression-probe/encoded", { encoding: "gzip" });
  expect(encoded.headers["content-encoding"]).toBe("identity");
  expect(encoded.body).toEqual(plainBytes);
  const status = await wire("/compression-probe/status", { encoding: "gzip" });
  expect(status.status).toBe(202);
  expect(status.headers["content-encoding"]).toBeUndefined();
  const post = await wire("/compression-probe/post", { encoding: "gzip", method: "POST" });
  expect(post.status).toBe(201);
  expect(post.headers["content-encoding"]).toBeUndefined();
  expect(post.body).toEqual(plainBytes);
  const sent = await wire("/compression-probe/sent/already", { encoding: "gzip" });
  expect(sent.headers["content-encoding"]).toBeUndefined();
  expect(sent.body).toEqual(plainBytes);
});

it("SSE와 StreamableFile binary bytes는 그대로 보낸다", async () => {
  const sse = await wire("/compression-probe/sse", { encoding: "gzip" });
  expect(sse.headers["content-type"]).toContain("text/event-stream");
  expect(sse.headers["content-encoding"]).toBeUndefined();
  expect(sse.body.toString("utf8")).toBe(`data: ${"fixture".repeat(256)}\n\n`);
  const binary = await wire("/compression-probe/binary", { encoding: "gzip" });
  expect(binary.headers["content-type"]).toBe("application/octet-stream");
  expect(binary.headers["content-encoding"]).toBeUndefined();
  expect(binary.body).toEqual(Buffer.alloc(2_048, 7));
});
