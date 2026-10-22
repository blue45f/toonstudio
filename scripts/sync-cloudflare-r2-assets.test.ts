import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CLOUDFLARE_LARGE_ASSET_CACHE_CONTROL,
  CLOUDFLARE_R2_MEDIA_CACHE_CONTROL,
  CLOUDFLARE_STATIC_MAX_FILE_BYTES,
} from "../deploy/cloudflare-static/src/large-static-assets";

import {
  createRequestPacer,
  discoverR2LargeAssets,
  fileMd5,
  planR2Uploads,
  r2ObjectPutRequest,
  r2RetryDelayMs,
  type R2LargeAssetUpload,
} from "./sync-cloudflare-r2-assets.mts";

const temporaryDirectories: string[] = [];

function temporaryDist(): string {
  const directory = mkdtempSync(join(tmpdir(), "toonstudio-r2-assets-"));
  temporaryDirectories.push(directory);
  return directory;
}

function sparseFile(path: string, bytes: number): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "");
  truncateSync(path, bytes);
}

function smallFile(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("Cloudflare R2 large asset synchronization", () => {
  it("discovers reviewed oversized assets with the large-asset cache policy", () => {
    const dist = temporaryDist();
    const relativePath = "assets/opencascade.wasm-build123.wasm";
    sparseFile(join(dist, relativePath), CLOUDFLARE_STATIC_MAX_FILE_BYTES + 1);

    const assets = discoverR2LargeAssets(dist);
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      key: relativePath,
      contentType: "application/wasm",
      cacheControl: CLOUDFLARE_LARGE_ASSET_CACHE_CONTROL,
    });
  });

  it("routes the product tour video through R2 with the correct media type", () => {
    const dist = temporaryDist();
    const relativePath = "brand/toonstudio-product-tour.mp4";
    sparseFile(join(dist, relativePath), CLOUDFLARE_STATIC_MAX_FILE_BYTES + 1);

    const assets = discoverR2LargeAssets(dist);
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({ key: relativePath, contentType: "video/mp4" });
  });

  it("collects small binary media under the R2 media prefixes but leaves manifests on Static Assets", () => {
    const dist = temporaryDist();
    smallFile(join(dist, "assets/3d/environments/room.glb"), "glb");
    smallFile(join(dist, "vrm/hero.vrm"), "vrm");
    smallFile(join(dist, "assets/virtual-studio/style-packs-v5/a.webp"), "webp");
    smallFile(join(dist, "assets/studio/cc0-20260906/manifest.json"), "{}");
    smallFile(join(dist, "assets/studio/cc0-20260906/assets/pack/LICENSE.txt"), "cc0");
    smallFile(join(dist, "assets/index-abc123.js"), "code");

    const keys = discoverR2LargeAssets(dist).map((asset) => asset.key);
    expect(keys).toEqual([
      "assets/3d/environments/room.glb",
      "assets/virtual-studio/style-packs-v5/a.webp",
      "vrm/hero.vrm",
    ]);
    const vrm = discoverR2LargeAssets(dist).find((asset) => asset.key === "vrm/hero.vrm");
    expect(vrm).toMatchObject({
      contentType: "application/octet-stream",
      cacheControl: CLOUDFLARE_R2_MEDIA_CACHE_CONTROL,
    });
  });

  it("fails closed for an unreviewed file above the platform limit", () => {
    const dist = temporaryDist();
    sparseFile(join(dist, "assets/unreviewed-model.glb"), CLOUDFLARE_STATIC_MAX_FILE_BYTES + 1);

    expect(() => discoverR2LargeAssets(dist)).toThrow(
      /Unreviewed file exceeds the Static Assets limit/u,
    );
  });

  it("skips objects whose size and MD5 etag already match and re-uploads everything else", async () => {
    const dist = temporaryDist();
    smallFile(join(dist, "vrm/same.vrm"), "same");
    smallFile(join(dist, "vrm/changed.vrm"), "changed");
    smallFile(join(dist, "vrm/missing.vrm"), "missing");
    smallFile(join(dist, "vrm/multipart.vrm"), "multipart");
    const assets = discoverR2LargeAssets(dist);
    const md5 = new Map<string, string>();
    for (const asset of assets) md5.set(asset.key, await fileMd5(asset.absolutePath));

    const remote = new Map([
      ["vrm/same.vrm", { size: 4, etag: md5.get("vrm/same.vrm")!.toUpperCase() }],
      ["vrm/changed.vrm", { size: 7, etag: "0".repeat(32) }],
      ["vrm/multipart.vrm", { size: 9, etag: `${md5.get("vrm/multipart.vrm")}-2` }],
    ]);
    const plan = planR2Uploads(assets, md5, remote);
    expect(plan.unchanged.map((asset) => asset.key)).toEqual(["vrm/same.vrm"]);
    expect(plan.uploads.map((asset) => asset.key)).toEqual([
      "vrm/changed.vrm",
      "vrm/missing.vrm",
      "vrm/multipart.vrm",
    ]);
  });

  it("builds an R2 REST put request that keeps the object key and media metadata", () => {
    const asset: R2LargeAssetUpload = {
      absolutePath: "/tmp/unused",
      key: "assets/studio/cc0-20260906/assets/pack/hero model.glb",
      bytes: 3,
      contentType: "model/gltf-binary",
      cacheControl: CLOUDFLARE_R2_MEDIA_CACHE_CONTROL,
    };
    const request = r2ObjectPutRequest(asset, "account-id", "token-value");
    expect(request.url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/account-id/r2/buckets/toonspectrum-public-assets/objects/assets/studio/cc0-20260906/assets/pack/hero%20model.glb",
    );
    expect(request.headers).toMatchObject({
      authorization: "Bearer token-value",
      "content-type": "model/gltf-binary",
      "cache-control": CLOUDFLARE_R2_MEDIA_CACHE_CONTROL,
      "content-disposition": "inline",
    });
  });
});

describe("Cloudflare R2 REST rate limit", () => {
  it("waits out Retry-After on 429, the documented five-minute block without it, and backs off on 5xx", () => {
    expect(r2RetryDelayMs(429, "42", 1)).toBe(42_000);
    expect(r2RetryDelayMs(429, null, 1)).toBe(300_000);
    expect(r2RetryDelayMs(429, "Thu, 23 Oct 2026 06:00:00 GMT", 1)).toBe(300_000);
    expect(r2RetryDelayMs(503, null, 2)).toBe(2_000);
    expect(r2RetryDelayMs(403, null, 1)).toBeNull();
  });

  it("spaces request starts across concurrent uploads and holds them all after a 429", async () => {
    vi.useFakeTimers();
    try {
      const pacer = createRequestPacer(2);
      const origin = Date.now();
      const startedAt: number[] = [];
      const first = Array.from({ length: 3 }, () =>
        pacer.wait().then(() => startedAt.push(Date.now() - origin)));
      await vi.runAllTimersAsync();
      await Promise.all(first);
      expect(startedAt).toEqual([0, 500, 1_000]);

      pacer.pause(10_000);
      const held = pacer.wait().then(() => startedAt.push(Date.now() - origin));
      await vi.runAllTimersAsync();
      await held;
      expect(startedAt.at(-1)).toBe(11_000);
    } finally {
      vi.useRealTimers();
    }
  });
});
