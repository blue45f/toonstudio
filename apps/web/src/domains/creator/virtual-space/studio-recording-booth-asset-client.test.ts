import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteStudioRecordingBoothAsset,
  listStudioRecordingBoothAssets,
  readStudioRecordingBoothAsset,
  uploadStudioRecordingBoothAsset,
} from "./studio-recording-booth-asset-client";

const io = vi.hoisted(() => ({ post: vi.fn(), rawPost: vi.fn(), json: vi.fn() }));
vi.mock("@/platform/api", () => ({
  api: { post: io.post, raw: { post: io.rawPost } },
  apiPath: (value: string) => `/api${value}`,
}));
const asset = { contract: "studio-recording-booth-asset-v1" as const, id: "asset", workId: "work", authorUserId: "actor",
  name: "녹음부스 테이크 20261006", boothId: "booth-main", durationMs: 42_000, contentType: "audio/webm" as const,
  byteLength: 4, sha256: "b".repeat(64), createdAt: "2026-10-06T00:00:00.000Z", deletedAt: null };
const view = { asset, canDelete: true };

beforeEach(() => {
  vi.clearAllMocks();
  io.rawPost.mockReturnValue({ json: io.json });
});

describe("recording booth asset client", () => {
  it("queries the durable assets saved for the work", async () => {
    io.post.mockResolvedValue({ items: [view] });
    expect(await listStudioRecordingBoothAssets("work")).toEqual({ items: [view] });
    expect(io.post).toHaveBeenCalledExactlyOnceWith("/studio-project-graph/works/work/recording-booth-assets/query", {},
      { signal: undefined, retry: 0, cache: "no-store" });
  });

  it("uploads multipart audio with immutable metadata and no automatic retry", async () => {
    io.json.mockResolvedValue({ view, replayed: false });
    const blob = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: "audio/webm" });
    const input = { operationId: "operation", assetId: "asset", name: asset.name, boothId: "booth-main", durationMs: 42_000 };
    expect(await uploadStudioRecordingBoothAsset("work", input, blob)).toEqual({ view, replayed: false });
    const options = io.rawPost.mock.calls[0]?.[1] as { body: FormData; retry: number };
    expect(io.rawPost).toHaveBeenCalledOnce(); expect(io.rawPost.mock.calls[0]?.[0]).toBe("/api/studio-project-graph/works/work/recording-booth-assets");
    expect(options.retry).toBe(0); expect(JSON.parse(String(options.body.get("metadata")))).toEqual(input);
    expect(options.body.get("file")).toBeInstanceOf(Blob);
  });

  it("rejects an empty take locally before any request", async () => {
    const blob = new Blob([], { type: "audio/webm" });
    const input = { operationId: "operation", assetId: "asset", name: asset.name, boothId: "booth-main", durationMs: 42_000 };
    await expect(uploadStudioRecordingBoothAsset("work", input, blob)).rejects.toThrow("studio_recording_booth_asset_file_invalid");
    expect(io.rawPost).not.toHaveBeenCalled();
  });

  it("obtains a signed URL only after explicit playback preparation", async () => {
    io.post.mockResolvedValue({ ...view, signedRead: { url: "https://storage.invalid/booth", expiresAtEpochMs: Date.now() + 60_000 } });
    const result = await readStudioRecordingBoothAsset("work", "asset");
    expect(result.signedRead.url).toBe("https://storage.invalid/booth");
    expect(io.post).toHaveBeenCalledWith("/studio-project-graph/works/work/recording-booth-assets/asset/read", {}, expect.objectContaining({ retry: 0 }));
  });

  it("deletes with an explicit operation identity and exact hash", async () => {
    io.post.mockResolvedValue({ ...view, asset: { ...asset, deletedAt: "2026-10-06T01:00:00.000Z" }, replayed: false });
    const input = { operationId: "delete-op", expectedSha256: asset.sha256 };
    await deleteStudioRecordingBoothAsset("work", "asset", input);
    expect(io.post).toHaveBeenCalledWith("/studio-project-graph/works/work/recording-booth-assets/asset/delete", input, expect.objectContaining({ retry: 0 }));
  });
});
