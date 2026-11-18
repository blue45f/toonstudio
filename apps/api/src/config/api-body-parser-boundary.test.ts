import "reflect-metadata";
import { request as requestHttp } from "node:http";
import type { AddressInfo } from "node:net";
import { Body, Controller, Module, Post, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { MAX_AI_OPERATIONS_BYTES } from "@toonstudio/contracts/ai-operations";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { configureApiBodyParserBoundary } from "./api-body-parser-boundary";

const execution = vi.fn();

@Controller()
class BodyParserProbeController {
  @Post(["admin/ai-operations", "parser-probe"])
  receive(@Body() body: unknown) {
    execution(body);
    return { received: true };
  }
}

@Module({ controllers: [BodyParserProbeController] })
class BodyParserTestModule {}

function post(base: URL, path: string, chunks: readonly string[], contentLength: boolean, contentType = "application/json") {
  return new Promise<number>((resolve, reject) => {
    const request = requestHttp({
      hostname: base.hostname, port: base.port, method: "POST", path,
      headers: { "content-type": contentType,
        ...(contentLength ? { "content-length": chunks.reduce((sum, chunk) => sum + Buffer.byteLength(chunk), 0) } : {}) },
    }, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode ?? 0));
    });
    request.once("error", reject);
    request.setTimeout(5_000, () => request.destroy(new Error("로컬 본문 경계 검사 시간 초과")));
    for (const chunk of chunks) request.write(chunk);
    request.end();
  });
}

describe("운영 보드 실제 Nest/Express 본문 한도", () => {
  let app: INestApplication;
  let base: URL;

  beforeAll(async () => {
    app = await NestFactory.create(BodyParserTestModule, { bodyParser: false, logger: false });
    configureApiBodyParserBoundary(app, null);
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    base = new URL(`http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`);
  });
  beforeEach(() => execution.mockClear());
  afterAll(async () => { await app.close(); });

  it.each(["/api/admin/ai-operations", "/api/admin/ai-operations/", "/api/admin/AI-OPERATIONS"])(
    "%s 경로는 파싱 뒤 작아지는 큰 본문도 거부한다", async (path) => {
      const body = "{}" + " ".repeat(MAX_AI_OPERATIONS_BYTES - 1);
      expect(await post(base, path, [body], true)).toBe(413);
      expect(execution).not.toHaveBeenCalled();
    },
  );

  it("Content-Length 없는 UTF-8 chunked 본문도 실제 byte 수로 제한한다", async () => {
    const text = "가".repeat(Math.ceil(MAX_AI_OPERATIONS_BYTES / 3));
    expect(text.length).toBeLessThan(MAX_AI_OPERATIONS_BYTES);
    expect(await post(base, "/api/admin/ai-operations", ['{"notes":"', text, '"}'], false)).toBe(413);
    expect(execution).not.toHaveBeenCalled();
  });

  it("정확히 한도인 JSON 본문은 파싱한다", async () => {
    const body = "{}" + " ".repeat(MAX_AI_OPERATIONS_BYTES - 2);
    expect(await post(base, "/api/admin/ai-operations", [body], true)).toBe(201);
    expect(execution).toHaveBeenCalledWith({});
  });

  it("폼 본문으로도 운영 보드 한도를 우회할 수 없다", async () => {
    expect(await post(base, "/api/admin/ai-operations", ["note=" + "x".repeat(MAX_AI_OPERATIONS_BYTES)], true,
      "application/x-www-form-urlencoded")).toBe(413);
    expect(execution).not.toHaveBeenCalled();
  });

  it("다른 API 경로는 기존 16 MiB 본문 한도를 유지한다", async () => {
    const body = "{}" + " ".repeat(MAX_AI_OPERATIONS_BYTES);
    expect(await post(base, "/api/parser-probe", [body], true)).toBe(201);
    expect(execution).toHaveBeenCalledWith({});
  });
});
