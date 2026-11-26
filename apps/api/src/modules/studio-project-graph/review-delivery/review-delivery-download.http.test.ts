// @vitest-environment node
import "reflect-metadata";
import { ConflictException, Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ZodValidationPipe } from "../../../platform/http/zod-validation.pipe";
import { StudioReviewDeliveryController } from "./review-delivery.controller";
import { StudioReviewDeliveryService } from "./review-delivery.service";
import { buildReviewDeliveryZip } from "./review-delivery-zip";

const archive = buildReviewDeliveryZip([
  { path: "manifest.json", bytes: Buffer.from("{}") },
  { path: "README.txt", bytes: Buffer.from("검수 원고") },
  { path: "source/manuscript.toonstudio-work.json", bytes: Buffer.from('{"width":720}') },
]);
const fileName = "toonstudio-approved-delivery-test.zip";
const download = vi.fn(async () => ({ bytes: archive.bytes, fileName }));

@Module({
  controllers: [StudioReviewDeliveryController],
  providers: [{ provide: StudioReviewDeliveryService, useValue: {
    run: (action: () => Promise<unknown>) => action(), download,
  } }],
})
class DeliveryTestModule {}

describe("담당자 ZIP 다운로드의 HTTP 응답", () => {
  let app: INestApplication;
  let url: URL;
  beforeAll(async () => {
    app = await NestFactory.create(DeliveryTestModule, { logger: false });
    app.useGlobalPipes(new ZodValidationPipe());
    await app.listen(0, "127.0.0.1");
    url = new URL(`/creator/works/example/review-deliveries/${randomUUID()}/download`, await app.getUrl());
  });
  afterAll(async () => { await app?.close(); });

  function requestZip() {
    return fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-user-id": "test-editor" },
      body: JSON.stringify({ operationId: randomUUID(), expectedVersion: 2, manifestDigest: "a".repeat(64) }) });
  }

  it("ZIP 형식·파일 이름·바이트 수·SHA-256을 수신 측에서 확인한다", async () => {
    const response = await requestZip();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename=("?)toonstudio-approved-delivery-test\.zip\1$/u);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const received = Buffer.from(await response.arrayBuffer());
    expect(Number(response.headers.get("content-length"))).toBe(received.length);
    expect(received.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 3, 4]));
    expect(createHash("sha256").update(received).digest("hex")).toBe(archive.sha256);
  });

  it("이전 승인본의 409 안내는 ZIP 다운로드를 시작하지 않는다", async () => {
    download.mockRejectedValueOnce(new ConflictException({ code: "studio_review_delivery_source_changed" }));
    const response = await requestZip();
    expect(response.status).toBe(409);
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(await response.json()).toMatchObject({ code: "studio_review_delivery_source_changed" });
  });
});
