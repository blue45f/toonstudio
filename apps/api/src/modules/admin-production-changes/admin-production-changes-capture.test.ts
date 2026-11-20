import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { AdminProductionChangesCaptureService, validateProductionCapture, PRODUCTION_CAPTURE_MAX_BYTES } from "./admin-production-changes-capture.service";
import type { AdminProductionChangesRepository } from "./admin-production-changes.repository";
import type { PrivateObjectStoragePort } from "../../platform/adapters/private-object-storage/private-object-storage.port";

export function tinyPng(): Buffer {
  function chunk(type: string, data: Buffer): Buffer {
    const value = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff;
    for (const byte of value) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    const result = Buffer.alloc(data.length + 12); result.writeUInt32BE(data.length); value.copy(result, 4); result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4); return result;
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.from([0,255,0,0,255]))), chunk("IEND", Buffer.alloc(0))]);
}
function fixture() {
  const bytes = tinyPng(); const sha = createHash("sha256").update(bytes).digest("hex");
  const object = { contractVersion: "toonspectrum.private-object-storage.v2" as const, providerId: "cloudflare-r2" as const, purpose: "derived" as const, digest: `sha256:${sha}`, objectPath: `sha256/${sha.slice(0,2)}/${sha}`, byteLength: bytes.length, contentType: "image/png" };
  const repository = { assertWrite: vi.fn(async () => undefined), saveCapture: vi.fn(async () => undefined), readCapture: vi.fn(async () => ({ id: randomUUID(), object, contentType: "image/png", byteLength: bytes.length })) };
  const storage = { verifyPrivatePurposeBuckets: vi.fn(), uploadImmutable: vi.fn(async () => object), createSignedReadUrl: vi.fn(async () => ({ url: "https://storage.example.test/capture?signature=test", expiresAtEpochMs: Date.now() + 60_000 })), deleteGeneratedObject: vi.fn() };
  const service = new AdminProductionChangesCaptureService(repository as unknown as AdminProductionChangesRepository, storage as unknown as PrivateObjectStoragePort);
  return { bytes, object, repository, storage, service, file: { buffer: bytes, size: bytes.length, mimetype: "image/png" } };
}
describe("관리자 제작 변경 캡처 경계", () => {
  it("실제 PNG 구조를 검증하고 immutable 참조를 저장한 뒤 안정된 API URL을 반환한다", async () => {
    const f = fixture(); const result = await f.service.upload("admin", f.file);
    expect(result.url).toMatch(/^\/api\/admin\/production-changes\/captures\/[a-f0-9-]{36}$/u);
    expect(f.storage.uploadImmutable).toHaveBeenCalledWith(expect.objectContaining({ purpose: "derived", bytes: Uint8Array.from(f.bytes) }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(f.repository.saveCapture).toHaveBeenCalledWith("admin", expect.objectContaining({ object: f.object, byteLength: f.bytes.length }));
  });
  it("권한 실패는 외부 저장 전에 중단한다", async () => {
    const f = fixture(); f.repository.assertWrite.mockRejectedValueOnce(new Error("권한 없음"));
    await expect(f.service.upload("operator", f.file)).rejects.toThrow("권한 없음");
    expect(f.storage.uploadImmutable).not.toHaveBeenCalled();
  });
  it("SVG·MIME 불일치·손상된 CRC·크기 초과를 거부한다", () => {
    const f = fixture(); const broken = Buffer.from(f.bytes); broken[broken.length - 1] ^= 1;
    for (const file of [{ ...f.file, mimetype: "image/svg+xml" }, { ...f.file, mimetype: "image/jpeg" }, { ...f.file, buffer: broken }, { ...f.file, size: PRODUCTION_CAPTURE_MAX_BYTES + 1 }, undefined]) expect(() => validateProductionCapture(file)).toThrow();
  });
  it("저장소 미구성·응답 불일치·공급자 실패를 명확하게 503으로 알리고 성공 기록을 만들지 않는다", async () => {
    const f = fixture();
    const unavailable = new AdminProductionChangesCaptureService(f.repository as unknown as AdminProductionChangesRepository);
    await expect(unavailable.upload("admin", f.file)).rejects.toMatchObject({ status: 503 });
    f.storage.uploadImmutable.mockResolvedValueOnce({ ...f.object, byteLength: 1 });
    await expect(f.service.upload("admin", f.file)).rejects.toMatchObject({ status: 503 });
    f.storage.uploadImmutable.mockRejectedValueOnce(new Error("private provider credentials"));
    const error = await f.service.upload("admin", f.file).catch(error => error);
    expect(error.status).toBe(503); expect(error.message).not.toContain("private provider");
    expect(f.repository.saveCapture).not.toHaveBeenCalled();
  });
  it("이미지 조회도 서버 권한을 확인한 참조로만 짧은 읽기 URL을 발급한다", async () => {
    const f = fixture(); const id = randomUUID();
    expect(await f.service.read("operator", id)).toMatch(/^https:\/\/storage.example.test/u);
    expect(f.repository.readCapture).toHaveBeenCalledWith("operator", id);
    expect(f.storage.createSignedReadUrl).toHaveBeenCalledWith({ object: f.object, expiresInSeconds: 60 }, expect.any(Object));
    f.repository.readCapture.mockRejectedValueOnce(new Error("권한 없음"));
    await expect(f.service.read("member", id)).rejects.toThrow("권한 없음");
    expect(f.storage.createSignedReadUrl).toHaveBeenCalledTimes(1);
  });
});
