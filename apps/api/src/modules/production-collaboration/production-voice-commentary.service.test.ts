import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrivateObjectStoragePort } from "../../platform/adapters/private-object-storage/private-object-storage.port";
import type { ProductionVoiceCommentaryCreate } from "./production-voice-commentary.dto";
import {
  ProductionVoiceCommentaryRepositoryError,
  type ProductionVoiceCommentaryRepository,
} from "./production-voice-commentary.repository";
import { ProductionVoiceCommentaryService } from "./production-voice-commentary.service";

const bytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x86, 0x81, 0x01]);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const object = { contractVersion: "toonspectrum.private-object-storage.v2" as const, providerId: "cloudflare-r2" as const,
  purpose: "derived" as const, digest: `sha256:${sha256}`, objectPath: `sha256/${sha256.slice(0, 2)}/${sha256}`,
  byteLength: bytes.length, contentType: "audio/webm" };
const meta = { version: 1 as const, id: "voice-episode-1-1720000000000", episodeId: "episode-1", authorId: "actor",
  authorName: "검수자", createdAt: new Date().toISOString(), durationMs: 1_500,
  keyframes: [{ atMs: 0, view: { surface: "manuscript" as const, poolItemId: null, pageId: "page-1", mode: null, scale: 1, tx: 0, ty: 0 }, pinThreadIds: [] }],
  pinThreadIds: [] };
const input: ProductionVoiceCommentaryCreate = {
  operationId: "episode-voice-commentary:voice-episode-1-1720000000000", track: meta, retentionDays: 14,
};
const record = { meta, canDelete: true, contentType: "audio/webm", byteLength: bytes.length, sha256, object, deletedAt: null };
const authorizeCreate = vi.fn(), create = vi.fn(), list = vi.fn(), read = vi.fn(), remove = vi.fn(), claimExpired = vi.fn(), objectReferenced = vi.fn();
const repository = { authorizeCreate, create, list, read, delete: remove, claimExpired, objectReferenced } as unknown as ProductionVoiceCommentaryRepository;
const uploadImmutable = vi.fn(), createSignedReadUrl = vi.fn(), deleteGeneratedObject = vi.fn(), verifyPrivatePurposeBuckets = vi.fn();
const storage = { uploadImmutable, createSignedReadUrl, deleteGeneratedObject, verifyPrivatePurposeBuckets } as unknown as PrivateObjectStoragePort;
let service: ProductionVoiceCommentaryService;

beforeEach(() => {
  vi.resetAllMocks();
  authorizeCreate.mockResolvedValue(undefined);
  uploadImmutable.mockResolvedValue(object);
  verifyPrivatePurposeBuckets.mockResolvedValue({ ready: true, privatePurposeBuckets: 1 });
  create.mockResolvedValue({ record, replayed: false });
  list.mockResolvedValue({ items: [record] });
  read.mockResolvedValue({ record });
  remove.mockResolvedValue({ record: { ...record, deletedAt: new Date().toISOString() }, deleteObject: true, replayed: false });
  claimExpired.mockResolvedValue([]); objectReferenced.mockResolvedValue(false); deleteGeneratedObject.mockResolvedValue({ deleted: true });
  createSignedReadUrl.mockResolvedValue({ url: "https://storage.invalid/voice?sig=private", expiresAtEpochMs: Date.now() + 300_000 });
  service = new ProductionVoiceCommentaryService(repository, storage);
});

describe("production voice commentary service", () => {
  it("uploads a bounded recording pinned to the episode and returns a playable server track", async () => {
    const result = await service.create("actor", "project-1", "episode-1", input, { buffer: bytes, size: bytes.length, mimetype: "audio/webm" });
    expect(result.replayed).toBe(false);
    expect(result.view.track.id).toBe(meta.id);
    expect(result.view.track.audio).toEqual({
      kind: "server", url: "https://storage.invalid/voice?sig=private", mimeType: "audio/webm", byteSize: bytes.length,
    });
    expect(authorizeCreate).toHaveBeenCalledWith("actor", "project-1", "episode-1", meta);
    expect(uploadImmutable).toHaveBeenCalledWith(expect.objectContaining({ purpose: "derived", contentType: "audio/webm",
      controlMetadata: expect.objectContaining({ documentId: "project-1", operationId: input.operationId }) }));
    expect(create).toHaveBeenCalledWith("actor", "project-1", "episode-1", input, expect.objectContaining({ sha256, object }));
  });

  it("rejects a track whose episode does not match the path before any storage work", async () => {
    const mismatched = { ...input, track: { ...meta, episodeId: "episode-2" } };
    await expect(service.create("actor", "project-1", "episode-1", mismatched, { buffer: bytes, size: bytes.length, mimetype: "audio/webm" }))
      .rejects.toHaveProperty("status", 400);
    expect(authorizeCreate).not.toHaveBeenCalled();
    expect(uploadImmutable).not.toHaveBeenCalled();
  });

  it.each([
    ["audio/webm", Buffer.from("not-webm")],
    ["audio/wav", Buffer.from("RIFFnot-wave")],
    ["text/plain", bytes],
  ])("rejects a mismatched or unsupported %s payload before storage", async (mimetype, buffer) => {
    await expect(service.create("actor", "project-1", "episode-1", input, { buffer, size: buffer.length, mimetype })).rejects.toThrow();
    expect(uploadImmutable).not.toHaveBeenCalled();
  });

  it("checks upload authority before allocating private storage", async () => {
    authorizeCreate.mockRejectedValueOnce(new ProductionVoiceCommentaryRepositoryError("forbidden"));
    await expect(service.create("actor", "project-1", "episode-1", input, { buffer: bytes, size: bytes.length, mimetype: "audio/webm" }))
      .rejects.toHaveProperty("status", 403);
    expect(uploadImmutable).not.toHaveBeenCalled();
  });

  it("fails closed without private object storage", async () => {
    await expect(new ProductionVoiceCommentaryService(repository).create("actor", "project-1", "episode-1", input,
      { buffer: bytes, size: bytes.length, mimetype: "audio/webm" })).rejects.toHaveProperty("status", 503);
  });

  it("compensates an unreferenced object after the authoritative record fails", async () => {
    create.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(service.create("actor", "project-1", "episode-1", input, { buffer: bytes, size: bytes.length, mimetype: "audio/webm" }))
      .rejects.toThrow();
    expect(deleteGeneratedObject).toHaveBeenCalledWith({ object });
  });

  it("lists episode tracks with freshly signed audio urls", async () => {
    const result = await service.list("actor", "project-1", "episode-1");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.track.audio?.kind).toBe("server");
    expect(list).toHaveBeenCalledWith("actor", "project-1", "episode-1");
  });

  it("rejects a signed read when the record changes between the two reads", async () => {
    read.mockResolvedValueOnce({ record });
    read.mockResolvedValueOnce({ record: { ...record, sha256: "b".repeat(64) } });
    await expect(service.signedRead("actor", "project-1", "episode-1", meta.id)).rejects.toHaveProperty("status", 409);
  });

  it("deletes through the repository and removes the object when unreferenced", async () => {
    const result = await service.delete("actor", "project-1", "episode-1", meta.id, { operationId: "delete-op", expectedSha256: sha256 });
    expect(result.view.track.audio).toBeNull();
    expect(deleteGeneratedObject).toHaveBeenCalledWith({ object });
  });
});
