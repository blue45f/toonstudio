import "reflect-metadata";
import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { STUDIO_REVIEW_PREVIEW_UPLOAD_LIMITS, StudioReviewPreviewProducerController } from "./studio-review-preview-producer.controller";
import { STUDIO_REVIEW_PREVIEW_MAX_BYTES } from "./studio-review-preview-canonicalizer";
import type { StudioReviewPreviewIntent } from "./studio-review-preview-producer.contract";
import { StudioReviewPreviewProducerService } from "./studio-review-preview-producer.service";

const intent: StudioReviewPreviewIntent = {
  intentId: "intent-1", workId: "work-1", sourceServerRevision: 4, sourceContentDigest: "a".repeat(64),
  pageCount: 1, title: "검수 원고", deviceId: "device-1", createdAt: "2026-11-04T00:00:00.000Z",
  projectId: "graph-1", artifactId: "artifact-1", expectedHeadRevisionId: "head-1", expectedHeadRootGraphHash: "b".repeat(64),
};
const uploaded = { ordinal: 0, sha256: "c".repeat(64), width: 1, height: 1 };
const service = { upload: vi.fn().mockResolvedValue(uploaded) };

@Module({
  controllers: [StudioReviewPreviewProducerController],
  providers: [{ provide: StudioReviewPreviewProducerService, useValue: service }],
})
class StudioReviewPreviewProducerTestModule {}

describe("Studio review preview multipart limits", () => {
  it("reserves a terminal Busboy part while keeping exactly one field and one file", () => {
    expect(STUDIO_REVIEW_PREVIEW_UPLOAD_LIMITS).toEqual({
      fileSize: STUDIO_REVIEW_PREVIEW_MAX_BYTES,
      files: 1,
      fields: 1,
      fieldSize: 8192,
      fieldNameSize: 64,
      parts: 3,
    });
  });
});

describe("검수 페이지 업로드의 운영 전역 검증 경계", () => {
  let app: INestApplication, base: string;
  beforeAll(async () => {
    vi.stubEnv("STUDIO_WORK_ASSET_ADMISSION", "enable-immutable-readonly-work-assets-v1");
    app = await NestFactory.create(StudioReviewPreviewProducerTestModule, { logger: false });
    app.useGlobalPipes(new ZodValidationPipe());
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  beforeEach(() => { service.upload.mockReset().mockResolvedValue(uploaded); });
  afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); });

  async function upload(fields: Record<string, string>, authenticated = true) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    form.set("file", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), "preview.png");
    return fetch(`${base}/api/studio-project-graph/review-captures/pages/0`, {
      method: "PUT", headers: authenticated ? { "x-user-id": "verified-user" } : {}, body: form,
      signal: AbortSignal.timeout(10_000),
    });
  }

  it("전역 파이프와 명시 파이프를 함께 적용해도 운송 문자열을 한 번 디코딩한다", async () => {
    const response = await upload({ intent: JSON.stringify(intent) });
    const body: unknown = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body).toEqual(uploaded);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(service.upload).toHaveBeenCalledExactlyOnceWith("verified-user", intent, 0,
      expect.objectContaining({ buffer: Buffer.from([1, 2, 3]), size: 3, mimetype: "image/png" }),
      { signal: expect.any(AbortSignal) });
  });

  it.each([
    { intent: "{" },
    { intent: JSON.stringify({ ...intent, pageCount: 0 }) },
    { intent: JSON.stringify({ ...intent, unexpected: true }) },
  ])("잘못된 intent는 서비스 호출 전에 거절한다 (%j)", async (fields) => {
    expect((await upload(fields)).status).toBe(400);
    expect(service.upload).not.toHaveBeenCalled();
  });

  it("8192자 필드 한도와 한 개 필드 제한을 유지한다", async () => {
    expect((await upload({ intent: "a".repeat(8193) })).status).toBe(400);
    expect((await upload({ intent: JSON.stringify(intent), unexpected: "field" })).status).toBe(400);
    expect(service.upload).not.toHaveBeenCalled();
  });

  it("미인증 multipart 요청은 서비스에 도달하지 않는다", async () => {
    expect((await upload({ intent: JSON.stringify(intent) }, false)).status).toBe(403);
    expect(service.upload).not.toHaveBeenCalled();
  });
});
