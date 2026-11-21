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

import * as localOAuth from "./lib/cloudflare-local-oauth.mjs";
import {
  computeCandidateMd5s,
  createRequestPacer,
  discoverR2LargeAssets,
  fileMd5,
  normalizeEtag,
  planR2Uploads,
  r2ObjectPutRequest,
  r2RetryDelayMs,
  runPool,
  syncCloudflareR2Assets,
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
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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

describe("로컬 OAuth로 실제 동기화 함수를 실행", () => {
  it("명시한 계정의 목록과 새 객체만 요청하고 기존 API 토큰을 덮어쓰지 않는다", async () => {
    const account = "a".repeat(32);
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", account);
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "ambient-fixture");
    const read = vi.spyOn(localOAuth, "readLocalWranglerOAuthToken").mockReturnValue("mock-session");
    const dist = temporaryDist();
    smallFile(join(dist, "vrm/new.vrm"), "new");
    smallFile(join(dist, "vrm/same.vrm"), "same");
    const etag = await fileMd5(join(dist, "vrm/same.vrm"));
    const requests: { method: string; url: string; authorized: boolean }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const method = init.method ?? "GET";
      requests.push({ method, url, authorized: new Headers(init.headers).get("authorization") === "Bearer mock-session" });
      expect(init.redirect).toBe("error");
      if (method === "GET") return Response.json({ success: true, result: [{ key: "vrm/same.vrm", size: 4, etag }] });
      expect(init.body?.toString()).toBe("new");
      return new Response(null, { status: 200 });
    });
    await syncCloudflareR2Assets("dry-run", dist, true);
    expect(requests).toEqual([]);
    expect(read).not.toHaveBeenCalled();
    const uploads = await syncCloudflareR2Assets("production", dist, true);
    const objects = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/toonspectrum-public-assets/objects`;
    expect(requests).toEqual([
      { method: "GET", url: objects + "?per_page=1000", authorized: true },
      { method: "PUT", url: objects + "/vrm/new.vrm", authorized: true },
    ]);
    expect(uploads.map((upload) => upload.key)).toEqual(["vrm/new.vrm"]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(process.env.CLOUDFLARE_API_TOKEN).toBe("ambient-fixture");
  });

  it("계정 누락과 목록 조회 거절 시 PUT 없이 끝나며 응답 본문을 출력하지 않는다", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
    const read = vi.spyOn(localOAuth, "readLocalWranglerOAuthToken").mockReturnValue("mock-session");
    const service = vi.fn(() => Promise.resolve(new Response("private response fixture", { status: 403 })));
    vi.stubGlobal("fetch", service);
    const dist = temporaryDist();
    smallFile(join(dist, "vrm/new.vrm"), "new");
    await expect(syncCloudflareR2Assets("production", dist, true)).rejects.toThrow("CLOUDFLARE_ACCOUNT_ID");
    expect(read).not.toHaveBeenCalled();
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
    await expect(syncCloudflareR2Assets("production", dist, true)).rejects.toThrow(/^Cloudflare API 403 for https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/a{32}\/r2\/buckets\/toonspectrum-public-assets\/objects$/u);
    expect(service).toHaveBeenCalledTimes(1);
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

describe("R2 차분 해싱·캐시·동시성·네트워크 재시도 최적화", () => {
  it("따옴표로 감싼 원격 ETag도 정규화해 동일 파일 재업로드를 생략한다", async () => {
    const dist = temporaryDist();
    smallFile(join(dist, "vrm/quoted.vrm"), "quoted-payload");
    const assets = discoverR2LargeAssets(dist);
    const md5 = await fileMd5(assets[0]!.absolutePath);
    expect(normalizeEtag(`"${md5.toUpperCase()}"`)).toBe(md5);

    const plan = planR2Uploads(
      assets,
      new Map([["vrm/quoted.vrm", md5]]),
      new Map([["vrm/quoted.vrm", { size: assets[0]!.bytes, etag: `"${md5.toUpperCase()}"` }]]),
    );
    expect(plan.unchanged.map((item) => item.key)).toEqual(["vrm/quoted.vrm"]);
    expect(plan.uploads).toEqual([]);
  });

  it("원격 누락·크기 불일치·멀티파트 ETag 파일은 디스크 MD5를 생략하고 stat 캐시로 재검증한다", async () => {
    const dist = temporaryDist();
    const cachePath = join(dist, ".r2-md5-cache.json");
    smallFile(join(dist, "vrm/same.vrm"), "same-bytes");
    smallFile(join(dist, "vrm/size-diff.vrm"), "size-diff-bytes");
    smallFile(join(dist, "vrm/missing.vrm"), "missing-bytes");
    smallFile(join(dist, "vrm/multi.vrm"), "multipart-bytes");
    const assets = discoverR2LargeAssets(dist);
    const sameMd5 = await fileMd5(join(dist, "vrm/same.vrm"));

    const remote = new Map([
      ["vrm/same.vrm", { size: 10, etag: sameMd5 }],
      ["vrm/size-diff.vrm", { size: 999, etag: "0".repeat(32) }],
      ["vrm/multi.vrm", { size: 15, etag: `${sameMd5}-2` }],
    ]);

    const first = await computeCandidateMd5s(assets, remote, { hashConcurrency: 4, hashCachePath: cachePath });
    expect(first.hashedCount).toBe(1);
    expect(first.cacheHits).toBe(0);
    expect(first.skippedHashCount).toBe(3);
    expect(first.localMd5.get("vrm/same.vrm")).toBe(sameMd5);
    expect(first.localMd5.has("vrm/missing.vrm")).toBe(false);

    // 두 번째 실행은 stat(size+mtimeMs+ctimeMs) 캐시 적중으로 디스크 MD5 0건
    const second = await computeCandidateMd5s(assets, remote, { hashConcurrency: 4, hashCachePath: cachePath });
    expect(second.hashedCount).toBe(0);
    expect(second.cacheHits).toBe(1);
    expect(second.skippedHashCount).toBe(3);
    expect(second.localMd5.get("vrm/same.vrm")).toBe(sameMd5);

    // 파일 내용이 변경되면 즉시 캐시를 무효화하고 새 MD5를 계산한다
    smallFile(join(dist, "vrm/same.vrm"), "changed-10");
    const third = await computeCandidateMd5s(assets, remote, { hashConcurrency: 4, hashCachePath: cachePath });
    expect(third.hashedCount).toBe(1);
    expect(third.cacheHits).toBe(0);
    expect(third.localMd5.get("vrm/same.vrm")).not.toBe(sameMd5);
  });

  it("runPool은 동시성 상한을 지키면서 일시 네트워크 오류 재시도 후 안전하게 업로드를 완료한다", async () => {
    let active = 0;
    let peak = 0;
    await runPool([1, 2, 3, 4, 5, 6], async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
      active -= 1;
    }, 3);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);

    const account = "b".repeat(32);
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", account);
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "retry-fixture-token");
    const dist = temporaryDist();
    smallFile(join(dist, "vrm/retry.vrm"), "retry-payload");

    let putAttempts = 0;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const method = init.method ?? "GET";
      if (method === "GET") {
        return Response.json({ success: true, result: [] });
      }
      putAttempts += 1;
      if (putAttempts === 1) {
        throw new TypeError("fetch failed: ECONNRESET");
      }
      return new Response(null, { status: 200 });
    });

    const uploads = await syncCloudflareR2Assets("production", dist, false, {
      concurrency: 6,
      hashCachePath: null,
      networkRetryBaseMs: 1,
    });
    expect(putAttempts).toBe(2);
    expect(uploads.map((item) => item.key)).toEqual(["vrm/retry.vrm"]);
  });
});
