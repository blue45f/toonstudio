import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrivateObjectStoragePort } from "../../platform/adapters/private-object-storage/private-object-storage.port";
import { StudioRecordingBoothAssetRepositoryError, type StudioRecordingBoothAssetRepository } from "./studio-recording-booth-asset.repository";
import { StudioRecordingBoothAssetService } from "./studio-recording-booth-asset.service";

const bytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x86, 0x81, 0x01]);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const object = { contractVersion: "toonspectrum.private-object-storage.v2" as const, providerId: "cloudflare-r2" as const,
  purpose: "derived" as const, digest: `sha256:${sha256}`, objectPath: `sha256/${sha256.slice(0, 2)}/${sha256}`,
  byteLength: bytes.length, contentType: "audio/webm" };
const asset = { contract: "studio-recording-booth-asset-v1" as const, id: "asset", workId: "work", authorUserId: "actor",
  name: "녹음부스 테이크 20261006", boothId: "booth-main", durationMs: 42_000, contentType: "audio/webm" as const,
  byteLength: bytes.length, sha256, createdAt: new Date().toISOString(), deletedAt: null };
const input = { operationId: "operation", assetId: "asset", name: asset.name, boothId: "booth-main", durationMs: 42_000 };
const authorizeCreate = vi.fn(), create = vi.fn(), list = vi.fn(), read = vi.fn(), remove = vi.fn(), objectReferenced = vi.fn();
const repository = { authorizeCreate, create, list, read, delete: remove, objectReferenced } as unknown as StudioRecordingBoothAssetRepository;
const uploadImmutable = vi.fn(), createSignedReadUrl = vi.fn(), deleteGeneratedObject = vi.fn(), verifyPrivatePurposeBuckets = vi.fn();
const storage = { uploadImmutable, createSignedReadUrl, deleteGeneratedObject, verifyPrivatePurposeBuckets } as unknown as PrivateObjectStoragePort;
let service: StudioRecordingBoothAssetService;

beforeEach(() => {
  vi.resetAllMocks();
  authorizeCreate.mockResolvedValue(undefined);
  uploadImmutable.mockResolvedValue(object);
  verifyPrivatePurposeBuckets.mockResolvedValue({ ready: true, privatePurposeBuckets: 1 });
  create.mockResolvedValue({ view: { asset, canDelete: true }, replayed: false });
  list.mockResolvedValue({ items: [{ asset, canDelete: true }] });
  read.mockResolvedValue({ view: { asset, canDelete: true }, object });
  remove.mockResolvedValue({ view: { asset: { ...asset, deletedAt: new Date().toISOString() }, canDelete: true }, object, deleteObject: true, replayed: false });
  objectReferenced.mockResolvedValue(false); deleteGeneratedObject.mockResolvedValue({ deleted: true });
  createSignedReadUrl.mockResolvedValue({ url: "https://storage.invalid/booth?sig=private", expiresAtEpochMs: Date.now() + 300_000 });
  service = new StudioRecordingBoothAssetService(repository, storage);
});

describe("recording booth asset service", () => {
  it("uploads a bounded webm take as a durable work asset", async () => {
    const result = await service.create("actor", "work", input, { buffer: bytes, size: bytes.length, mimetype: "audio/webm;codecs=opus" });
    expect(result.view.asset.id).toBe("asset");
    expect(authorizeCreate).toHaveBeenCalledWith("actor", "work");
    expect(uploadImmutable).toHaveBeenCalledWith(expect.objectContaining({ purpose: "derived", contentType: "audio/webm",
      controlMetadata: expect.objectContaining({ documentId: "work", operationId: "operation" }) }));
    expect(create).toHaveBeenCalledWith("actor", "work", input, expect.objectContaining({ sha256, object }));
  });

  it.each([
    ["audio/webm", Buffer.from("not-webm")],
    ["audio/ogg", bytes],
    ["text/plain", bytes],
  ])("rejects a mismatched or unsupported %s payload before storage", async (mimetype, buffer) => {
    await expect(service.create("actor", "work", input, { buffer, size: buffer.length, mimetype })).rejects.toThrow();
    expect(uploadImmutable).not.toHaveBeenCalled();
  });

  it("rejects an empty or oversized file before storage", async () => {
    await expect(service.create("actor", "work", input, { buffer: Buffer.alloc(0), size: 0, mimetype: "audio/webm" })).rejects.toHaveProperty("status", 400);
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
    bytes.copy(oversized, 0);
    await expect(service.create("actor", "work", input, { buffer: oversized, size: oversized.length, mimetype: "audio/webm" })).rejects.toHaveProperty("status", 413);
    expect(uploadImmutable).not.toHaveBeenCalled();
  });

  it("checks upload authority before allocating private storage", async () => {
    authorizeCreate.mockRejectedValueOnce(new StudioRecordingBoothAssetRepositoryError("forbidden"));
    await expect(service.create("actor", "work", input, { buffer: bytes, size: bytes.length, mimetype: "audio/webm" })).rejects.toHaveProperty("status", 403);
    expect(uploadImmutable).not.toHaveBeenCalled();
  });

  it("fails closed without private object storage", async () => {
    await expect(new StudioRecordingBoothAssetService(repository).create("actor", "work", input,
      { buffer: bytes, size: bytes.length, mimetype: "audio/webm" })).rejects.toHaveProperty("status", 503);
  });

  it("compensates an unreferenced object after the authoritative record fails", async () => {
    create.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(service.create("actor", "work", input, { buffer: bytes, size: bytes.length, mimetype: "audio/webm" })).rejects.toHaveProperty("status", 503);
    expect(objectReferenced).toHaveBeenCalledWith(object); expect(deleteGeneratedObject).toHaveBeenCalledWith({ object });
  });

  it("lists durable assets for the work", async () => {
    const result = await service.list("actor", "work");
    expect(list).toHaveBeenCalledWith("actor", "work");
    expect(result.items[0]?.asset.id).toBe("asset");
  });

  it("returns only a short-lived signed read after rechecking work access", async () => {
    const result = await service.signedRead("actor", "work", "asset");
    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledWith("actor", "work", "asset");
    expect(result.signedRead.url).toMatch(/^https:\/\/storage\.invalid/u);
    expect(result).not.toHaveProperty("object");
  });

  it("deletes immutable bytes only after the last active asset reference is removed", async () => {
    await service.delete("actor", "work", "asset", { operationId: "delete-op", expectedSha256: sha256 });
    expect(deleteGeneratedObject).toHaveBeenCalledWith({ object });
    remove.mockResolvedValueOnce({ view: { asset, canDelete: true }, object, deleteObject: false, replayed: false });
    await service.delete("actor", "work", "asset", { operationId: "delete-two", expectedSha256: sha256 });
    expect(deleteGeneratedObject).toHaveBeenCalledTimes(1);
  });
});
