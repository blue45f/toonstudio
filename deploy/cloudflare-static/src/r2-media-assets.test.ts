import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  CLOUDFLARE_R2_MEDIA_CACHE_CONTROL,
  CLOUDFLARE_R2_MEDIA_IGNORE_PATTERNS,
  CLOUDFLARE_R2_MEDIA_PREFIXES,
  CLOUDFLARE_R2_MEDIA_WORKER_FIRST_PATTERNS,
  cloudflareR2MediaDescriptor,
  supportsCloudflareStaticSidecar,
} from "./large-static-assets";

import {
  createCloudflareStaticGateway,
  type CloudflareStaticEnv,
  type R2ObjectBodyBinding,
} from "./index";

function r2Object(bodyText: string): R2ObjectBodyBinding {
  return {
    size: new TextEncoder().encode(bodyText).byteLength,
    httpEtag: '"media-etag"',
    body: new Response(bodyText).body!,
    writeHttpMetadata(headers) {
      headers.set("content-disposition", "inline");
    },
  };
}

/** R2 미디어 하니스: R2 객체와 Static Assets 응답을 갈아 끼우며 게이트웨이를 부른다. */
function mediaHarness(options: {
  readonly object?: R2ObjectBodyBinding | null;
  readonly staticResponse?: () => Response;
} = {}) {
  const get = vi.fn(async (_key: string, _options?: { readonly range?: Headers }) =>
    options.object === undefined ? r2Object("media-bytes") : options.object);
  const head = vi.fn(async (_key: string) => null);
  const assetFetch = vi.fn(async (_request: Request) =>
    options.staticResponse?.() ?? new Response("static-bytes", { headers: { "content-type": "model/gltf-binary" } }));
  const upstream = vi.fn<typeof fetch>();
  const env: CloudflareStaticEnv = {
    ASSETS: { fetch: assetFetch },
    LARGE_ASSETS: { get, head },
    CORE_API_ORIGIN: "https://core.example.test",
  };
  const gateway = createCloudflareStaticGateway({ fetch: upstream });
  return {
    get,
    assetFetch,
    upstream,
    request: (path: string, init?: RequestInit) =>
      gateway(new Request(`https://www.toonstudio.cloud${path}`, init), env),
  };
}

describe("R2 media offload descriptors", () => {
  it("covers binary media under the offloaded prefixes only", () => {
    expect(cloudflareR2MediaDescriptor("/assets/3d/environments/expansion-v1/library.glb")).toMatchObject({
      contentType: "model/gltf-binary",
      staticFallback: true,
      sameOriginResource: true,
      cacheControl: CLOUDFLARE_R2_MEDIA_CACHE_CONTROL,
    });
    expect(cloudflareR2MediaDescriptor("/vrm/Darkness_Shibu.vrm")).toMatchObject({
      contentType: "application/octet-stream",
      sameOriginResource: false,
    });
    expect(cloudflareR2MediaDescriptor("/assets/virtual-studio/style-packs-v5/a.WEBP")?.contentType).toBe("image/webp");
    // 매니페스트·라이선스·코드는 Static Assets에 남는다.
    expect(cloudflareR2MediaDescriptor("/assets/studio/cc0-20260906/manifest.json")).toBeNull();
    expect(cloudflareR2MediaDescriptor("/assets/studio/cc0-20260906/assets/pack/LICENSE.txt")).toBeNull();
    expect(cloudflareR2MediaDescriptor("/assets/index-abc123.js")).toBeNull();
    expect(cloudflareR2MediaDescriptor("/brand/hero.png")).toBeNull();
  });

  it("refuses encoded, traversing and doubled-slash paths so R2 keys stay literal", () => {
    expect(cloudflareR2MediaDescriptor("/vrm/hero%20model.vrm")).toBeNull();
    expect(cloudflareR2MediaDescriptor("/vrm/../index.png")).toBeNull();
    expect(cloudflareR2MediaDescriptor("/assets/3d//room.glb")).toBeNull();
  });

  it("does not build compressed sidecars for offloaded media except the registered oversized bench", () => {
    expect(supportsCloudflareStaticSidecar("/assets/3d/environments/room.glb")).toBe(false);
    expect(supportsCloudflareStaticSidecar(
      "/assets/studio/cc0-20260906/assets/polyhaven-modular-street-seating/modular_street_seating.glb",
    )).toBe(true);
  });

  it("routes every media path removed from Static Assets through the Worker before the SPA fallback", () => {
    // run_worker_first 가 배열이면 Sec-Fetch-Mode 판별이 꺼진다. 여기서 빠진 미디어는 SPA index.html(200)로 나간다.
    const wrangler = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")) as {
      assets?: { run_worker_first?: string[] };
    };
    const workerFirst = wrangler.assets?.run_worker_first ?? [];
    expect(CLOUDFLARE_R2_MEDIA_WORKER_FIRST_PATTERNS).toHaveLength(CLOUDFLARE_R2_MEDIA_IGNORE_PATTERNS.length);
    for (const ignored of CLOUDFLARE_R2_MEDIA_IGNORE_PATTERNS) {
      const workerFirstPattern = `/${ignored.replace("**/*.", "*.")}`;
      expect(CLOUDFLARE_R2_MEDIA_WORKER_FIRST_PATTERNS).toContain(workerFirstPattern);
      expect(workerFirst).toContain(workerFirstPattern);
    }
    expect(workerFirst).not.toContain("/assets/3d/*");
    expect(workerFirst.some((pattern) => pattern.endsWith(".json"))).toBe(false);
  });

  it("ignores every offloaded prefix and media extension on Static Assets", () => {
    for (const prefix of CLOUDFLARE_R2_MEDIA_PREFIXES) {
      expect(CLOUDFLARE_R2_MEDIA_IGNORE_PATTERNS).toContain(`${prefix.slice(1)}**/*.glb`);
    }
    expect(CLOUDFLARE_R2_MEDIA_IGNORE_PATTERNS.some((pattern) => pattern.endsWith(".json"))).toBe(false);
  });
});

describe("R2 media offload delivery", () => {
  it("serves /assets media from R2 with the Static Assets same-origin resource policy", async () => {
    const harness = mediaHarness();
    const response = await harness.request("/assets/3d/environments/expansion-v1/library.glb");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("media-bytes");
    expect(harness.get).toHaveBeenCalledWith("assets/3d/environments/expansion-v1/library.glb", undefined);
    expect(response.headers.get("content-type")).toBe("model/gltf-binary");
    expect(response.headers.get("cache-control")).toBe(CLOUDFLARE_R2_MEDIA_CACHE_CONTROL);
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("cross-origin-embedder-policy")).toBe("credentialless");
    expect([...response.headers.keys()].filter((name) => name.startsWith("access-control-"))).toEqual([]);
    expect(response.headers.get("x-toonstudio-large-asset-source")).toBe("r2");
    expect(harness.assetFetch).not.toHaveBeenCalled();
    expect(harness.upstream).not.toHaveBeenCalled();
  });

  it("keeps /vrm open to cross-origin reads like its Static Assets header rule", async () => {
    const harness = mediaHarness();
    const response = await harness.request("/vrm/hero.vrm");

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cross-origin-resource-policy")).toBeNull();
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
  });

  it("falls back to Static Assets while an object is not in R2 yet", async () => {
    const harness = mediaHarness({ object: null });
    const response = await harness.request("/assets/virtual-studio/style-packs-v5/a.webp");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("static-bytes");
    expect(harness.assetFetch).toHaveBeenCalledOnce();
    expect(harness.upstream).not.toHaveBeenCalled();
  });

  it("turns the Static Assets SPA fallback into a 404 instead of HTML in a media slot", async () => {
    const harness = mediaHarness({
      object: null,
      staticResponse: () => new Response("<!doctype html>", { headers: { "content-type": "text/html; charset=utf-8" } }),
    });
    const response = await harness.request("/assets/3d/characters/missing.glb");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers preflight with the same origin policy as the media GET", async () => {
    const harness = mediaHarness();
    const assets = await harness.request("/assets/3d/environments/room.glb", { method: "OPTIONS" });
    expect(assets.status).toBe(204);
    expect([...assets.headers.keys()].filter((name) => name.startsWith("access-control-"))).toEqual([]);

    const vrm = await harness.request("/vrm/hero.vrm", { method: "OPTIONS" });
    expect(vrm.status).toBe(204);
    expect(vrm.headers.get("access-control-allow-origin")).toBe("*");
    expect(harness.get).not.toHaveBeenCalled();
  });

  it("leaves media-prefix manifests on Static Assets without touching R2", async () => {
    const harness = mediaHarness();
    const response = await harness.request("/assets/studio/cc0-20260906/manifest.json");

    expect(await response.text()).toBe("static-bytes");
    expect(harness.get).not.toHaveBeenCalled();
    expect(harness.assetFetch).toHaveBeenCalledOnce();
  });
});
