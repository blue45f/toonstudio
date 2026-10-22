import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { withInlineScriptHashes } from "../../../scripts/cloudflare-static-rules.mjs";

import {
  cloudflareLargeAssetDescriptor,
  cloudflareSameOriginOnlyAllows,
} from "./large-static-assets";

import {
  COMMON_SECURITY_HEADERS,
  createCloudflareStaticGateway,
  createCoreApiRequest,
  type CloudflareStaticEnv,
  type R2ObjectBodyBinding,
} from "./index";

function environment(overrides: Partial<CloudflareStaticEnv> = {}): CloudflareStaticEnv {
  return {
    ASSETS: {
      fetch: vi.fn(async () => new Response("static", { status: 200 })),
    },
    CORE_API_ORIGIN: "https://core.example.test",
    ...overrides,
  };
}

function r2Object(
  bodyText: string,
  options: {
    readonly size?: number;
    readonly range?: { readonly offset: number; readonly length: number };
    readonly etag?: string;
  } = {},
): R2ObjectBodyBinding {
  return {
    size: options.size ?? new TextEncoder().encode(bodyText).byteLength,
    httpEtag: options.etag ?? '"r2-etag"',
    range: options.range,
    body: new Response(bodyText).body!,
    writeHttpMetadata(headers) {
      headers.set("content-disposition", "inline");
    },
  };
}

// bundle-v2 GLB는 sha256 키로만 서빙한다 (원본 폴더·파일명이 든 옛 경로형 키는 서빙하지 않는다).
const BUNDLE_V2_SHA256 = "d2227ed901e6a19b768ac404016ff10696a5be849e2b2cfc9600400c24bd13c5";
const BUNDLE_V2_GLB_URL = `https://www.toonstudio.cloud/assets/studio/bundle-v2/${BUNDLE_V2_SHA256}.glb`;
const BUNDLE_V2_GLB_KEY = `assets/studio/bundle-v2/${BUNDLE_V2_SHA256}.glb`;
const BUNDLE_V2_INDEX_URL = "https://www.toonstudio.cloud/assets/studio/bundle-v2/manifest.json";
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable, s-maxage=0";
const SAME_ORIGIN_ONLY_BODY = { error: "BUNDLE_ASSET_SAME_ORIGIN_ONLY" };

/** R2 호출과 업스트림 fetch를 모두 관찰하는 게이트웨이 하니스. 업스트림은 폴백 응답을 돌려준다. */
function largeAssetHarness(
  makeObject: () => R2ObjectBodyBinding = () => r2Object("glb-bytes"),
  overrides: Partial<CloudflareStaticEnv> = {},
) {
  const get = vi.fn(async (
    _key: string,
    _options?: { readonly range?: Headers },
  ) => makeObject());
  const head = vi.fn(async (_key: string) => makeObject());
  const upstream = vi.fn<typeof fetch>(async () => new Response("origin-fallback"));
  const env = environment({
    LARGE_ASSETS: { get, head },
    LARGE_ASSET_ORIGIN: "https://large-assets.example.test",
    ...overrides,
  });
  return { get, head, upstream, env, gateway: createCloudflareStaticGateway({ fetch: upstream }) };
}

/** 응답에 실린 `access-control-*` 헤더 이름. 교차 출처 CORS가 닫혀 있으면 비어 있어야 한다. */
function accessControlHeaderNames(response: Response): string[] {
  return [...response.headers.keys()].filter((name) => name.startsWith("access-control-"));
}

describe("Cloudflare static gateway", () => {
  it("keeps dynamic security headers synchronized with the provider-neutral contract", () => {
    const responsePolicy = withInlineScriptHashes(JSON.parse(
      readFileSync(
        new URL("../../../config/http-response-headers.json", import.meta.url),
        "utf8",
      ),
    )) as {
      headers?: Array<{
        source?: string;
        headers?: Array<{ key?: string; value?: string }>;
      }>;
    };
    const rootHeaders = Object.fromEntries(
      (responsePolicy.headers?.find(({ source }) => source === "/(.*)")?.headers ?? [])
        .map(({ key, value }) => [key, value]),
    );

    for (const [key, value] of Object.entries(COMMON_SECURITY_HEADERS)) {
      expect(rootHeaders[key]).toBe(value);
    }
    expect(COMMON_SECURITY_HEADERS["Content-Security-Policy"]).toContain("https://commons.wikimedia.org");
    expect(COMMON_SECURITY_HEADERS["Content-Security-Policy"]).toContain(
      "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    );
  });

  it("keeps the Worker-first route list limited to dynamic and crawler paths", () => {
    const wrangler = JSON.parse(
      readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
    ) as {
      keep_vars?: boolean;
      assets?: { run_worker_first?: string[] };
      r2_buckets?: Array<{
        binding?: string;
        bucket_name?: string;
        preview_bucket_name?: string;
      }>;
    };

    expect((wrangler as { workers_dev?: boolean }).workers_dev).toBe(true);
    expect(wrangler.keep_vars).toBe(true);
    expect(wrangler.assets?.run_worker_first).toEqual([
      "/api",
      "/api/*",
      "/socket.io",
      "/socket.io/*",
      "/title/*",
      "/market",
      "/market/browse",
      "/market/resource/*",
      "/create/*",
      "/showcase/work/*",
      "/showcase/series/*",
      "/u/*",
      "/author/*",
      "/community/post/*",
      "/community/cafes/*",
      "/pencafe/*",
      "/collaborate/*",
      "/community/promote/*",
      "/ranking",
      "/play",
      "/assets/opencascade.wasm-*.wasm",
      "/assets/ort-wasm-simd-threaded.jsep-*.wasm",
      "/assets/ort-wasm-simd-threaded.asyncify-*.wasm",
      "/assets/tag2pix-*.onnx",
      "/assets/studio/cc0-20260906/assets/polyhaven-modular-street-seating/modular_street_seating.glb",
      "/assets/studio/bundle-v2/*",
      "/brand/toonstudio-product-tour.mp4",
    ]);
    expect(wrangler.assets?.run_worker_first).not.toContain("/market/*");
    expect(wrangler.r2_buckets).toEqual([{
      binding: "LARGE_ASSETS",
      bucket_name: "toonspectrum-public-assets",
      preview_bucket_name: "toonspectrum-public-assets",
    }]);
  });

  it("serves liveness at the edge without waking the Core API", async () => {
    const upstream = vi.fn<typeof fetch>();
    const env = environment();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });

    for (const pathname of ["/api/health", "/api/health/live"]) {
      const response = await gateway(
        new Request(`https://www.toonstudio.cloud${pathname}`),
        env,
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: "ok" });
      expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
      expect(response.headers.get("x-toonstudio-health-source")).toBe(
        "cloudflare-edge",
      );
    }

    const head = await gateway(new Request(
      "https://www.toonstudio.cloud/api/health/live",
      { method: "HEAD" },
    ), env);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("serves legal policies from first-party static content without an upstream", async () => {
    const upstream = vi.fn<typeof fetch>();
    const env = environment();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });

    const response = await gateway(new Request(
      "https://www.toonstudio.cloud/api/legal/policies/privacy-policy",
    ), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      policySlug: "privacy-policy",
      source: "static",
    }));
    expect(response.headers.get("x-toonstudio-policy-source")).toBe(
      "first-party-release",
    );
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();

    const missing = await gateway(new Request(
      "https://www.toonstudio.cloud/api/legal/policies/not-a-policy",
    ), env);
    expect(missing.status).toBe(404);
  });

  it("leaves static traffic on the free Static Assets path", async () => {
    const upstream = vi.fn<typeof fetch>();
    const env = environment();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });

    const response = await gateway(new Request("https://www.toonstudio.cloud/studio"), env);

    expect(await response.text()).toBe("static");
    expect(env.ASSETS.fetch).toHaveBeenCalledOnce();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("serves human shareable navigation from Static Assets", async () => {
    const upstream = vi.fn<typeof fetch>();
    const env = environment();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });

    for (const pathname of [
      "/title/a-title",
      "/market",
      "/market/browse",
      "/market/resource/123e4567-e89b-42d3-a456-426614174000",
      "/ranking",
      "/author/%EA%B9%80%EC%9E%91%EA%B0%80",
      "/create/work-1",
      "/community/post/post-1",
      "/collaborate/job-1",
    ]) {
      const response = await gateway(new Request(
        `https://www.toonstudio.cloud${pathname}`,
        { headers: { "user-agent": "Mozilla/5.0" } },
      ), env);
      expect(await response.text()).toBe("static");
    }

    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(9);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("routes crawler shareable requests to the Render OG endpoint", async () => {
    const requests: Request[] = [];
    const upstream = vi.fn<typeof fetch>(async (request) => {
      requests.push(request as Request);
      return new Response("crawler metadata", { status: 200 });
    });
    const env = environment();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });

    for (const pathname of [
      "/title/a%20b",
      "/market/browse",
      "/ranking",
      "/create/work-1",
    ]) {
      const response = await gateway(new Request(
        `https://www.toonstudio.cloud${pathname}`,
        {
          headers: {
            "user-agent": "Googlebot/2.1",
            authorization: "Bearer must-not-cross-public-og-boundary",
            cookie: "session=must-not-cross-public-og-boundary",
          },
        },
      ), env);
      expect(await response.text()).toBe("crawler metadata");
    }

    expect(requests.map((request) => new URL(request.url).href)).toEqual([
      "https://core.example.test/api/og?slug=a+b",
      "https://core.example.test/api/og?marketPage=browse",
      "https://core.example.test/api/og?staticPage=ranking",
      "https://core.example.test/api/og?creatorWorkId=work-1",
    ]);
    for (const request of requests) {
      expect(request.headers.get("authorization")).toBeNull();
      expect(request.headers.get("cookie")).toBeNull();
      expect(request.headers.get("x-toonstudio-edge-route")).toBe("core");
    }
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("keeps non-OG marketplace and nested crawler routes on Static Assets", async () => {
    const upstream = vi.fn<typeof fetch>();
    const env = environment();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });

    for (const pathname of [
      "/market/library",
      "/market/wishlist",
      "/market/manage",
      "/market/publish",
      "/market/fit",
      "/market/compare",
      "/market/resource/nested/path",
      "/title/nested/path",
      "/create/challenges",
      "/create/nested/path",
      "/community/post/nested/path",
      "/author/nested/path",
    ]) {
      const response = await gateway(
        new Request(`https://www.toonstudio.cloud${pathname}`),
        env,
      );
      expect(await response.text()).toBe("static");
    }

    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(12);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("proxies only dynamic paths to the configured HTTPS core", async () => {
    const upstream = vi.fn<typeof fetch>(async (request) => new Response(
      JSON.stringify({
        path: new URL(request instanceof Request ? request.url : String(request)).pathname,
      }),
      { headers: { "content-type": "application/json" } },
    ));
    const coreOriginSecret = "cloudflare-to-render-origin-secret-0123456789";
    const env = environment({ CORE_ORIGIN_SECRET: coreOriginSecret });
    const gateway = createCloudflareStaticGateway({ fetch: upstream });

    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/auth/session", {
        headers: {
          cookie: "session=opaque",
          "x-toonstudio-origin-secret": "client-spoofed-value",
        },
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledOnce();
    const proxied = upstream.mock.calls[0]?.[0];
    expect(proxied).toBeInstanceOf(Request);
    expect(new URL((proxied as Request).url).href).toBe(
      "https://core.example.test/api/auth/session",
    );
    expect((proxied as Request).headers.get("cookie")).toBe("session=opaque");
    expect((proxied as Request).headers.get("x-forwarded-host")).toBe("www.toonstudio.cloud");
    expect((proxied as Request).headers.get("x-toonstudio-edge-route")).toBe("core");
    expect((proxied as Request).headers.get("x-toonstudio-origin-secret")).toBe(
      coreOriginSecret,
    );
    expect(response.headers.get("content-security-policy")).toBe(
      COMMON_SECURITY_HEADERS["Content-Security-Policy"],
    );
  });

  it("fails closed when the Core origin secret binding is weak", async () => {
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/projects"),
      environment({ CORE_ORIGIN_SECRET: "too-short" }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "CORE_API_UNAVAILABLE",
    });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("routes social, playground, admin, and realtime traffic to isolated authorities", async () => {
    const upstream = vi.fn<typeof fetch>(async (request) => {
      const proxied = request as Request;
      return new Response(JSON.stringify({
        host: new URL(proxied.url).host,
        route: proxied.headers.get("x-toonstudio-edge-route"),
      }));
    });
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const env = environment({
      SOCIAL_API_ORIGIN: "https://social.example.test",
      PLAYGROUND_API_ORIGIN: "https://playground.example.test",
      ADMIN_API_ORIGIN: "https://admin.example.test",
      REALTIME_API_ORIGIN: "https://realtime.example.test",
    });

    const cases = [
      ["/api/community/posts", "social.example.test", "social"],
      ["/api/reviews", "social.example.test", "social"],
      ["/api/fortune/today", "playground.example.test", "playground"],
      ["/api/play/session", "playground.example.test", "playground"],
      ["/api/admin/community/posts", "admin.example.test", "admin"],
      ["/socket.io/?EIO=4&transport=polling", "realtime.example.test", "realtime"],
    ] as const;

    for (const [pathname, host, route] of cases) {
      const response = await gateway(
        new Request(`https://www.toonstudio.cloud${pathname}`),
        env,
      );
      await expect(response.json()).resolves.toEqual({ host, route });
    }
  });

  it("serves oversized assets from R2 without worker-side content negotiation", async () => {
    const get = vi.fn(async (
      _key: string,
      _options?: { readonly range?: Headers },
    ) => r2Object("r2-raw-bytes"));
    const head = vi.fn(async (_key: string) => null);
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const env = environment({
      LARGE_ASSETS: { get, head },
      LARGE_ASSET_ORIGIN: "https://large-assets.example.test",
    });
    const response = await gateway(new Request(
      "https://www.toonstudio.cloud/assets/opencascade.wasm-build123.wasm",
      {
        headers: {
          "accept-encoding": "gzip, br",
          authorization: "Bearer private",
          cookie: "session=private",
        },
      },
    ), env);

    expect(await response.text()).toBe("r2-raw-bytes");
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-type")).toBe("application/wasm");
    expect(response.headers.get("x-toonstudio-large-asset-source")).toBe("r2");
    expect(response.headers.get("cache-control")).toContain("s-maxage=0");
    expect(upstream).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledOnce();
  });

  it.each([
    ["brotli client", "gzip, deflate, br, zstd"],
    ["gzip client", "gzip"],
    ["identity client", "identity"],
  ])("serves byte-identical bodies to every %s", async (
    _label,
    acceptEncoding,
  ) => {
    const get = vi.fn(async (
      _key: string,
      _options?: { readonly range?: Headers },
    ) => r2Object("r2-raw-bytes"));
    const head = vi.fn(async (_key: string) => null);
    const gateway = createCloudflareStaticGateway({ fetch: vi.fn<typeof fetch>() });
    const response = await gateway(new Request(
      "https://www.toonstudio.cloud/assets/opencascade.wasm-build123.wasm",
      { headers: { "accept-encoding": acceptEncoding } },
    ), environment({ LARGE_ASSETS: { get, head } }));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("r2-raw-bytes");
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("x-toonstudio-large-asset-source")).toBe("r2");
  });

  it("serves oversized immutable assets from R2 before the origin", async () => {
    const get = vi.fn(async (_key: string, _options?: { readonly range?: Headers }) => r2Object("r2-wasm"));
    const head = vi.fn(async (_key: string) => null);
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(
      new Request(
        "https://www.toonstudio.cloud/assets/opencascade.wasm-build123.wasm",
        { headers: { authorization: "Bearer private", cookie: "session=private" } },
      ),
      environment({ LARGE_ASSETS: { get, head } }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("r2-wasm");
    expect(response.headers.get("content-type")).toBe("application/wasm");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable, s-maxage=0",
    );
    expect(response.headers.get("x-toonstudio-large-asset-source")).toBe("r2");
    expect(response.headers.get("etag")).toBe('"r2-etag"');
    expect(get).toHaveBeenCalledWith(
      "assets/opencascade.wasm-build123.wasm",
      undefined,
    );
    expect(head).not.toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("serves bundle-v2 GLBs from R2 under the sha256 object key", async () => {
    const get = vi.fn(async (
      _key: string,
      _options?: { readonly range?: Headers },
    ) => r2Object("glb-bytes"));
    const head = vi.fn(async (_key: string) => null);
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(
      new Request(BUNDLE_V2_GLB_URL),
      environment({ LARGE_ASSETS: { get, head } }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("glb-bytes");
    expect(response.headers.get("content-type")).toBe("model/gltf-binary");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable, s-maxage=0",
    );
    expect(response.headers.get("x-toonstudio-large-asset-source")).toBe("r2");
    expect(get).toHaveBeenCalledWith(BUNDLE_V2_GLB_KEY, undefined);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("serves the bundle-v2 deploy index from R2 with a short cache policy", async () => {
    const get = vi.fn(async (
      _key: string,
      _options?: { readonly range?: Headers },
    ) => r2Object("{\"files\":5303}"));
    const head = vi.fn(async (_key: string) => null);
    const gateway = createCloudflareStaticGateway({ fetch: vi.fn<typeof fetch>() });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/assets/studio/bundle-v2/manifest.json"),
      environment({ LARGE_ASSETS: { get, head } }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=0");
    expect(get).toHaveBeenCalledWith("assets/studio/bundle-v2/manifest.json", undefined);
  });

  it("fails bundle-v2 requests honestly when the R2 object is missing", async () => {
    const get = vi.fn(async (
      _key: string,
      _options?: { readonly range?: Headers },
    ) => null);
    const head = vi.fn(async (_key: string) => null);
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(
      new Request(`https://www.toonstudio.cloud/assets/studio/bundle-v2/${"f".repeat(64)}.glb`),
      environment({ LARGE_ASSETS: { get, head } }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "LARGE_ASSET_UNAVAILABLE" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("never falls back to LARGE_ASSET_ORIGIN for bundle-v2, so origin headers cannot break the guard contract", async () => {
    const get = vi.fn(async (_key: string, _options?: { readonly range?: Headers }) => null);
    const head = vi.fn(async (_key: string) => null);
    const upstream = vi.fn<typeof fetch>(async () => new Response("ORIGIN", {
      status: 200,
      headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=60" },
    }));
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const env = environment({
      LARGE_ASSETS: { get, head },
      LARGE_ASSET_ORIGIN: "https://large-assets.example.test",
    });
    for (const path of [`${"a".repeat(64)}.glb`, "manifest.json"]) {
      const response = await gateway(
        new Request(`https://www.toonstudio.cloud/assets/studio/bundle-v2/${path}`, {
          headers: { "sec-fetch-site": "same-origin" },
        }),
        env,
      );
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: "LARGE_ASSET_UNAVAILABLE" });
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
      // 응답이 Sec-Fetch-Site에 따라 달라지므로(교차 출처는 403) 이 응답도 같은 Vary를 가진다.
      expect(response.headers.get("vary")).toBe("Sec-Fetch-Site");
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  // 계약 변경(권리 원장 도입): 이전에는 `.glb`로 끝나는 모든 bundle-v2 경로를 R2 키로 복원해 서빙했다.
  // 이제는 소문자 sha256 hex 64자 키만 서빙한다 — 옛 경로형 키로 올라간 객체가 R2에 남아 있어도 열리지 않는다.
  it.each([
    ["legacy path-form key", "pack-a/native/Some%20Folder/Model%2BA%26B.glb"],
    ["legacy single-segment name", "Missing.glb"],
    ["uppercase hex", `${"A".repeat(64)}.glb`],
    ["63-char hex", `${"a".repeat(63)}.glb`],
    ["65-char hex", `${"a".repeat(65)}.glb`],
    ["uppercase extension", `${"a".repeat(64)}.GLB`],
    ["compressed sidecar suffix", `${"a".repeat(64)}.glb.br`],
    ["percent-encoded hex", `%61${"a".repeat(63)}.glb`],
    ["nested under a sha256 folder", `${"a".repeat(64)}/model.glb`],
  ])("does not route a bundle-v2 %s to R2 (only sha256 keys are served)", async (_label, path) => {
    const assetFetch = vi.fn(async () => new Response("static", { status: 200 }));
    const get = vi.fn(async (
      _key: string,
      _options?: { readonly range?: Headers },
    ) => r2Object("glb-bytes"));
    const gateway = createCloudflareStaticGateway({ fetch: vi.fn<typeof fetch>() });
    const response = await gateway(
      new Request(`https://www.toonstudio.cloud/assets/studio/bundle-v2/${path}`, {
        headers: { "sec-fetch-site": "same-origin" },
      }),
      environment({
        ASSETS: { fetch: assetFetch },
        LARGE_ASSETS: { get, head: vi.fn(async () => null) },
      }),
    );

    expect(get).not.toHaveBeenCalled();
    expect(response.headers.get("x-toonstudio-large-asset-source")).toBeNull();
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("does not route non-GLB bundle-v2 paths to the large-asset pipeline", async () => {
    const assetFetch = vi.fn(async () => new Response("static", { status: 200 }));
    const get = vi.fn(async (
      _key: string,
      _options?: { readonly range?: Headers },
    ) => r2Object("nope"));
    const gateway = createCloudflareStaticGateway({ fetch: vi.fn<typeof fetch>() });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/assets/studio/bundle-v2/pack-a/Textures/atlas.png"),
      environment({
        ASSETS: { fetch: assetFetch },
        LARGE_ASSETS: { get, head: vi.fn(async () => null) },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("static");
    expect(get).not.toHaveBeenCalled();
  });

  describe("bundle-v2 same-origin-only delivery", () => {
    it("treats Sec-Fetch-Site as same-origin only after trimming and lowercasing", () => {
      const withSite = (value: string | null) => ({ get: () => value });

      expect(cloudflareSameOriginOnlyAllows(withSite(null))).toBe(true);
      expect(cloudflareSameOriginOnlyAllows(withSite("same-origin"))).toBe(true);
      expect(cloudflareSameOriginOnlyAllows(withSite("  Same-Origin\t"))).toBe(true);
      for (const site of ["", "cross-site", "same-site", "none", "same-origin, same-origin"]) {
        expect(cloudflareSameOriginOnlyAllows(withSite(site))).toBe(false);
      }
    });

    it.each([
      ["same-origin", { "sec-fetch-site": "same-origin" }],
      ["mixed-case", { "sec-fetch-site": "Same-Origin" }],
      ["padded", { "sec-fetch-site": "  SAME-ORIGIN  " }],
      ["missing", {}],
    ] as Array<[string, Record<string, string>]>)(
      "serves a bundle-v2 GLB when Sec-Fetch-Site is %s without opening CORS",
      async (_label, headers) => {
        const { gateway, env, get, head, upstream } = largeAssetHarness();
        const response = await gateway(new Request(BUNDLE_V2_GLB_URL, { headers }), env);

        expect(response.status).toBe(200);
        expect(await response.text()).toBe("glb-bytes");
        expect(response.headers.get("content-type")).toBe("model/gltf-binary");
        expect(response.headers.get("cache-control")).toBe(IMMUTABLE_CACHE_CONTROL);
        expect(response.headers.get("x-toonstudio-large-asset-source")).toBe("r2");
        expect(response.headers.get("vary")).toContain("Sec-Fetch-Site");
        expect(accessControlHeaderNames(response)).toEqual([]);
        expect(get).toHaveBeenCalledWith(BUNDLE_V2_GLB_KEY, undefined);
        expect(head).not.toHaveBeenCalled();
        expect(upstream).not.toHaveBeenCalled();
      },
    );

    it.each(["cross-site", "same-site", "none", "bogus", ""])(
      "rejects a bundle-v2 GLB request with Sec-Fetch-Site %j before touching R2",
      async (site) => {
        const { gateway, env, get, head, upstream } = largeAssetHarness();
        const response = await gateway(
          new Request(BUNDLE_V2_GLB_URL, { headers: { "sec-fetch-site": site } }),
          env,
        );

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toEqual(SAME_ORIGIN_ONLY_BODY);
        expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("vary")).toContain("Sec-Fetch-Site");
        expect(response.headers.get("x-toonstudio-large-asset-source")).toBeNull();
        expect(response.headers.get("content-security-policy")).toBe(
          COMMON_SECURITY_HEADERS["Content-Security-Policy"],
        );
        expect(accessControlHeaderNames(response)).toEqual([]);
        expect(get).not.toHaveBeenCalled();
        expect(head).not.toHaveBeenCalled();
        expect(upstream).not.toHaveBeenCalled();
        expect(env.ASSETS.fetch).not.toHaveBeenCalled();
      },
    );

    it("rejects a cross-site bundle-v2 HEAD request with an empty body", async () => {
      const { gateway, env, get, head, upstream } = largeAssetHarness();
      const response = await gateway(new Request(BUNDLE_V2_GLB_URL, {
        method: "HEAD",
        headers: { "sec-fetch-site": "cross-site" },
      }), env);

      expect(response.status).toBe(403);
      expect(await response.text()).toBe("");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("vary")).toContain("Sec-Fetch-Site");
      expect(response.headers.get("x-toonstudio-large-asset-source")).toBeNull();
      expect(accessControlHeaderNames(response)).toEqual([]);
      expect(get).not.toHaveBeenCalled();
      expect(head).not.toHaveBeenCalled();
      expect(upstream).not.toHaveBeenCalled();
    });

    it("serves a same-origin bundle-v2 HEAD request from R2 metadata without CORS", async () => {
      const { gateway, env, get, head } = largeAssetHarness(() => r2Object("metadata"));
      const response = await gateway(new Request(BUNDLE_V2_GLB_URL, {
        method: "HEAD",
        headers: { "sec-fetch-site": "same-origin" },
      }), env);

      expect(response.status).toBe(200);
      expect(response.body).toBeNull();
      expect(response.headers.get("content-length")).toBe("8");
      expect(response.headers.get("vary")).toContain("Sec-Fetch-Site");
      expect(accessControlHeaderNames(response)).toEqual([]);
      expect(head).toHaveBeenCalledWith(BUNDLE_V2_GLB_KEY);
      expect(get).not.toHaveBeenCalled();
    });

    it("keeps byte ranges working same-origin and refuses them cross-site", async () => {
      const { gateway, env, get } = largeAssetHarness(() => r2Object("part", {
        size: 1024,
        range: { offset: 0, length: 4 },
      }));
      const sameOrigin = await gateway(new Request(BUNDLE_V2_GLB_URL, {
        headers: { range: "bytes=0-3", "sec-fetch-site": "same-origin" },
      }), env);

      expect(sameOrigin.status).toBe(206);
      expect(await sameOrigin.text()).toBe("part");
      expect(sameOrigin.headers.get("content-range")).toBe("bytes 0-3/1024");
      expect(sameOrigin.headers.get("vary")).toContain("Sec-Fetch-Site");
      expect(accessControlHeaderNames(sameOrigin)).toEqual([]);
      expect(get.mock.calls[0]?.[1]?.range?.get("range")).toBe("bytes=0-3");

      const crossSite = await gateway(new Request(BUNDLE_V2_GLB_URL, {
        headers: { range: "bytes=0-3", "sec-fetch-site": "cross-site" },
      }), env);

      expect(crossSite.status).toBe(403);
      expect(get).toHaveBeenCalledOnce();
    });

    it.each([
      ['"r2-etag"', 304],
      ['W/"r2-etag"', 304],
      ['"other", "r2-etag"', 304],
      ["*", 304],
      ['"other"', 200],
    ] as Array<[string, number]>)(
      "answers If-None-Match %s on a same-origin bundle-v2 GLB with %i",
      async (ifNoneMatch, status) => {
        const { gateway, env } = largeAssetHarness();
        const response = await gateway(new Request(BUNDLE_V2_GLB_URL, {
          headers: { "if-none-match": ifNoneMatch, "sec-fetch-site": "same-origin" },
        }), env);

        expect(response.status).toBe(status);
        expect(response.headers.get("etag")).toBe('"r2-etag"');
        expect(response.headers.get("vary")).toContain("Sec-Fetch-Site");
        expect(accessControlHeaderNames(response)).toEqual([]);
        if (status === 304) {
          expect(response.body).toBeNull();
          expect(response.headers.get("content-length")).toBeNull();
        }
      },
    );

    it.each(['"weak"', 'W/"weak"'])(
      "matches If-None-Match %s against a weak R2 etag with a 304",
      async (ifNoneMatch) => {
        const { gateway, env } = largeAssetHarness(() => r2Object("glb-bytes", { etag: 'W/"weak"' }));
        const response = await gateway(new Request(BUNDLE_V2_GLB_URL, {
          headers: { "if-none-match": ifNoneMatch, "sec-fetch-site": "same-origin" },
        }), env);

        expect(response.status).toBe(304);
        expect(response.headers.get("etag")).toBe('W/"weak"');
      },
    );

    it.each([
      ["same-origin", { "sec-fetch-site": "same-origin" }],
      ["missing", {}],
    ] as Array<[string, Record<string, string>]>)(
      "serves the bundle-v2 index when Sec-Fetch-Site is %s without CORS and keeps its short cache",
      async (_label, headers) => {
        const { gateway, env, get } = largeAssetHarness(() => r2Object("{\"files\":5303}"));
        const response = await gateway(new Request(BUNDLE_V2_INDEX_URL, { headers }), env);

        expect(response.status).toBe(200);
        expect(await response.text()).toBe("{\"files\":5303}");
        expect(response.headers.get("content-type")).toBe("application/json");
        expect(response.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=0");
        expect(response.headers.get("vary")).toContain("Sec-Fetch-Site");
        expect(accessControlHeaderNames(response)).toEqual([]);
        expect(get).toHaveBeenCalledWith("assets/studio/bundle-v2/manifest.json", undefined);
      },
    );

    it("rejects a cross-site bundle-v2 index request", async () => {
      const { gateway, env, get, head, upstream } = largeAssetHarness();
      const response = await gateway(new Request(BUNDLE_V2_INDEX_URL, {
        headers: { "sec-fetch-site": "cross-site" },
      }), env);

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual(SAME_ORIGIN_ONLY_BODY);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("vary")).toContain("Sec-Fetch-Site");
      expect(accessControlHeaderNames(response)).toEqual([]);
      expect(get).not.toHaveBeenCalled();
      expect(head).not.toHaveBeenCalled();
      expect(upstream).not.toHaveBeenCalled();
    });

    it.each([
      ["GLB", BUNDLE_V2_GLB_URL],
      ["index", BUNDLE_V2_INDEX_URL],
    ])("answers a bundle-v2 %s OPTIONS request with 204 and no CORS grants", async (_label, url) => {
      for (const headers of [{}, { "sec-fetch-site": "same-origin" }] as Array<Record<string, string>>) {
        const { gateway, env, get, head } = largeAssetHarness();
        const response = await gateway(new Request(url, { method: "OPTIONS", headers }), env);

        expect(response.status).toBe(204);
        expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
        expect(response.headers.get("vary")).toContain("Sec-Fetch-Site");
        expect(accessControlHeaderNames(response)).toEqual([]);
        expect(response.headers.get("content-security-policy")).toBe(
          COMMON_SECURITY_HEADERS["Content-Security-Policy"],
        );
        expect(get).not.toHaveBeenCalled();
        expect(head).not.toHaveBeenCalled();
      }
    });

    it("rejects a cross-site bundle-v2 OPTIONS preflight", async () => {
      const { gateway, env, get, head, upstream } = largeAssetHarness();
      const response = await gateway(new Request(BUNDLE_V2_GLB_URL, {
        method: "OPTIONS",
        headers: {
          "sec-fetch-site": "cross-site",
          origin: "https://hotlink.example.test",
          "access-control-request-method": "GET",
        },
      }), env);

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual(SAME_ORIGIN_ONLY_BODY);
      expect(accessControlHeaderNames(response)).toEqual([]);
      expect(get).not.toHaveBeenCalled();
      expect(head).not.toHaveBeenCalled();
      expect(upstream).not.toHaveBeenCalled();
    });

    it("checks Sec-Fetch-Site before the method gate", async () => {
      const { gateway, env, get } = largeAssetHarness();
      const crossSite = await gateway(new Request(BUNDLE_V2_GLB_URL, {
        method: "POST",
        body: "{}",
        headers: { "sec-fetch-site": "cross-site" },
      }), env);
      const sameOrigin = await gateway(new Request(BUNDLE_V2_GLB_URL, {
        method: "POST",
        body: "{}",
        headers: { "sec-fetch-site": "same-origin" },
      }), env);

      expect(crossSite.status).toBe(403);
      expect(sameOrigin.status).toBe(405);
      expect(sameOrigin.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
      expect(sameOrigin.headers.get("vary")).toBe("Sec-Fetch-Site");
      expect(get).not.toHaveBeenCalled();
    });

    it("keeps the 405 for other R2 paths free of Vary (only bundle-v2 depends on Sec-Fetch-Site)", async () => {
      const { gateway, env } = largeAssetHarness();
      const response = await gateway(new Request("https://www.toonstudio.cloud/assets/tag2pix-B03WmUfQ.onnx", {
        method: "POST",
        body: "{}",
        headers: { "sec-fetch-site": "same-origin" },
      }), env);

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
      expect(response.headers.get("vary")).toBeNull();
    });

    it("rejects cross-site requests even when the R2 binding is absent", async () => {
      const { gateway, env, upstream } = largeAssetHarness(undefined, { LARGE_ASSETS: undefined });
      const crossSite = await gateway(new Request(BUNDLE_V2_GLB_URL, {
        headers: { "sec-fetch-site": "cross-site" },
      }), env);

      expect(crossSite.status).toBe(403);
      await expect(crossSite.json()).resolves.toEqual(SAME_ORIGIN_ONLY_BODY);
      expect(upstream).not.toHaveBeenCalled();

      const sameOrigin = await gateway(new Request(BUNDLE_V2_GLB_URL, {
        headers: { "sec-fetch-site": "same-origin" },
      }), env);

      // 동일 출처 요청도 R2가 없으면 폴백 원본으로 넘기지 않고 정직하게 실패한다 (바이트는 R2에만 있다).
      expect(sameOrigin.status).toBe(503);
      await expect(sameOrigin.json()).resolves.toEqual({ error: "LARGE_ASSET_UNAVAILABLE" });
      expect(sameOrigin.headers.get("vary")).toBe("Sec-Fetch-Site");
      expect(upstream).not.toHaveBeenCalled();
    });
  });

  describe("large-asset CORS outside bundle-v2", () => {
    const legacyAssets: Array<[string, string, string]> = [
      ["OpenCascade wasm", "/assets/opencascade.wasm-build123.wasm", "application/wasm"],
      ["ORT JSEP wasm", "/assets/ort-wasm-simd-threaded.jsep-DC5y_g6C.wasm", "application/wasm"],
      ["Tag2Pix model", "/assets/tag2pix-B03WmUfQ.onnx", "application/octet-stream"],
      [
        "CC0 street seating GLB",
        "/assets/studio/cc0-20260906/assets/polyhaven-modular-street-seating/modular_street_seating.glb",
        "model/gltf-binary",
      ],
      ["product tour video", "/brand/toonstudio-product-tour.mp4", "video/mp4"],
    ];

    it("flags only the bundle-v2 index and GLBs as same-origin-only", () => {
      for (const pathname of [
        "/assets/studio/bundle-v2/manifest.json",
        `/assets/studio/bundle-v2/${BUNDLE_V2_SHA256}.glb`,
      ]) {
        expect(cloudflareLargeAssetDescriptor(pathname)?.sameOriginOnly).toBe(true);
      }
      // 옛 경로형 GLB 키는 대형 에셋 파이프라인에 매칭되지 않는다.
      expect(cloudflareLargeAssetDescriptor("/assets/studio/bundle-v2/pack-a/native/Model.glb")).toBeNull();
      for (const [, pathname] of legacyAssets) {
        const descriptor = cloudflareLargeAssetDescriptor(pathname);
        expect(descriptor).not.toBeNull();
        expect(descriptor?.sameOriginOnly).toBeFalsy();
      }
      expect(
        cloudflareLargeAssetDescriptor("/assets/studio/bundle-v2/pack-a/Textures/atlas.png"),
      ).toBeNull();
    });

    it.each(legacyAssets)(
      "keeps wildcard CORS and no Vary on the %s whatever Sec-Fetch-Site says",
      async (_label, pathname, contentType) => {
        const { gateway, env, get } = largeAssetHarness();
        const url = `https://www.toonstudio.cloud${pathname}`;
        const reference = await gateway(new Request(url), env);

        expect(reference.status).toBe(200);
        expect(await reference.text()).toBe("glb-bytes");
        expect(reference.headers.get("content-type")).toBe(contentType);
        expect(reference.headers.get("cache-control")).toBe(IMMUTABLE_CACHE_CONTROL);
        expect(reference.headers.get("access-control-allow-origin")).toBe("*");
        expect(reference.headers.get("access-control-expose-headers")).toBe(
          "Accept-Ranges, Content-Length, Content-Range, ETag",
        );
        expect(reference.headers.get("vary")).toBeNull();
        expect(reference.headers.get("x-toonstudio-large-asset-source")).toBe("r2");

        for (const site of ["cross-site", "same-site", "none", "same-origin", "bogus"]) {
          const response = await gateway(
            new Request(url, { headers: { "sec-fetch-site": site } }),
            env,
          );

          expect(response.status).toBe(200);
          expect(await response.text()).toBe("glb-bytes");
          expect(Object.fromEntries(response.headers)).toEqual(
            Object.fromEntries(reference.headers),
          );
        }
        expect(get).toHaveBeenCalledTimes(6);
      },
    );

    it.each(legacyAssets)(
      "keeps the wildcard CORS preflight on the %s whatever Sec-Fetch-Site says",
      async (_label, pathname) => {
        const { gateway, env, get, head } = largeAssetHarness();
        const url = `https://www.toonstudio.cloud${pathname}`;

        for (const headers of [{}, { "sec-fetch-site": "cross-site" }] as Array<Record<string, string>>) {
          const response = await gateway(new Request(url, { method: "OPTIONS", headers }), env);

          expect(response.status).toBe(204);
          expect(response.headers.get("access-control-allow-origin")).toBe("*");
          expect(response.headers.get("access-control-allow-methods")).toBe("GET, HEAD, OPTIONS");
          expect(response.headers.get("access-control-allow-headers")).toBe(
            "Range, If-Range, If-None-Match",
          );
          expect(response.headers.get("access-control-max-age")).toBe("86400");
          expect(response.headers.get("allow")).toBeNull();
          expect(response.headers.get("vary")).toBeNull();
        }
        expect(get).not.toHaveBeenCalled();
        expect(head).not.toHaveBeenCalled();
      },
    );

    it("keeps wildcard CORS on a cross-site conditional 304 for a legacy asset", async () => {
      const { gateway, env } = largeAssetHarness();
      const response = await gateway(new Request(
        "https://www.toonstudio.cloud/assets/opencascade.wasm-build123.wasm",
        { headers: { "if-none-match": '"r2-etag"', "sec-fetch-site": "cross-site" } },
      ), env);

      expect(response.status).toBe(304);
      expect(response.body).toBeNull();
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("access-control-expose-headers")).toBe(
        "Accept-Ranges, Content-Length, Content-Range, ETag",
      );
      expect(response.headers.get("vary")).toBeNull();
    });
  });

  it("serves the ONNX JSEP runtime and Tag2Pix model from R2, not Static Assets", async () => {
    const assetFetch = vi.fn<typeof fetch>();
    const get = vi.fn(async (
      _key: string,
      _options?: { readonly range?: Headers },
    ) => r2Object("onnx-bytes"));
    const head = vi.fn(async (_key: string) => null);
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const env = environment({
      ASSETS: { fetch: assetFetch },
      LARGE_ASSETS: { get, head },
    });

    for (const [pathname, contentType] of [
      ["/assets/ort-wasm-simd-threaded.jsep-DC5y_g6C.wasm", "application/wasm"],
      ["/assets/ort-wasm-simd-threaded.asyncify-CxOG5pUO.wasm", "application/wasm"],
      ["/assets/tag2pix-B03WmUfQ.onnx", "application/octet-stream"],
    ] as const) {
      const response = await gateway(
        new Request(`https://www.toonstudio.cloud${pathname}`),
        env,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(contentType);
      expect(response.headers.get("x-toonstudio-large-asset-source")).toBe("r2");
    }
    expect(assetFetch).not.toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("serves a full R2 object as 200 even when R2 reports its full byte range", async () => {
    const get = vi.fn(async () => r2Object("full", {
      size: 4,
      range: { offset: 0, length: 4 },
    }));
    const gateway = createCloudflareStaticGateway({ fetch: vi.fn<typeof fetch>() });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/brand/toonstudio-product-tour.mp4"),
      environment({ LARGE_ASSETS: { get, head: vi.fn(async () => null) } }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("full");
    expect(response.headers.get("content-range")).toBeNull();
    expect(response.headers.get("content-length")).toBe("4");
    expect(get).toHaveBeenCalledWith("brand/toonstudio-product-tour.mp4", undefined);
  });

  it("serves large-asset HEAD metadata as a full 200 response", async () => {
    const metadata = r2Object("ignored", {
      size: 35_347_422,
      range: { offset: 0, length: 35_347_422 },
    });
    const head = vi.fn(async () => metadata);
    const get = vi.fn(async () => null);
    const gateway = createCloudflareStaticGateway({ fetch: vi.fn<typeof fetch>() });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/brand/toonstudio-product-tour.mp4", { method: "HEAD" }),
      environment({ LARGE_ASSETS: { get, head } }),
    );

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers.get("content-range")).toBeNull();
    expect(response.headers.get("content-length")).toBe("35347422");
    expect(head).toHaveBeenCalledWith("brand/toonstudio-product-tour.mp4");
    expect(get).not.toHaveBeenCalled();
  });

  it("honors a matching If-Range validator for resumable video playback", async () => {
    const head = vi.fn(async (_key: string) => r2Object("metadata", { etag: '"video-etag"' }));
    const get = vi.fn(async (_key: string, _options?: { readonly range?: Headers }) => r2Object("part", {
      size: 35_347_422,
      range: { offset: 1024, length: 4 },
      etag: '"video-etag"',
    }));
    const gateway = createCloudflareStaticGateway({ fetch: vi.fn<typeof fetch>() });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/brand/toonstudio-product-tour.mp4", {
        headers: { range: "bytes=1024-1027", "if-range": '"video-etag"' },
      }),
      environment({ LARGE_ASSETS: { get, head } }),
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 1024-1027/35347422");
    expect(get.mock.calls[0]?.[1]?.range?.get("range")).toBe("bytes=1024-1027");
    expect(head).toHaveBeenCalledOnce();
  });

  it("falls back to a full 200 response when If-Range no longer matches", async () => {
    const head = vi.fn(async (_key: string) => r2Object("metadata", { etag: '"new-etag"' }));
    const get = vi.fn(async (_key: string, _options?: { readonly range?: Headers }) => r2Object("full", {
      size: 4,
      range: { offset: 0, length: 4 },
      etag: '"new-etag"',
    }));
    const gateway = createCloudflareStaticGateway({ fetch: vi.fn<typeof fetch>() });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/brand/toonstudio-product-tour.mp4", {
        headers: { range: "bytes=1024-1027", "if-range": '"old-etag"' },
      }),
      environment({ LARGE_ASSETS: { get, head } }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-range")).toBeNull();
    expect(await response.text()).toBe("full");
    expect(get).toHaveBeenCalledWith("brand/toonstudio-product-tour.mp4", undefined);
  });

  it("preserves byte ranges while serving R2 large assets", async () => {
    const get = vi.fn(async (_key: string, _options?: { readonly range?: Headers }) => r2Object("part", {
      size: 65_864_037,
      range: { offset: 0, length: 4 },
    }));
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(
      new Request(
        "https://www.toonstudio.cloud/assets/opencascade.wasm-build123.wasm",
        {
          headers: {
            range: "bytes=0-3",
            authorization: "Bearer private",
            cookie: "session=private",
          },
        },
      ),
      environment({ LARGE_ASSETS: { get, head: vi.fn(async (_key: string) => null) } }),
    );

    expect(response.status).toBe(206);
    expect(await response.text()).toBe("part");
    expect(response.headers.get("content-range")).toBe(
      "bytes 0-3/65864037",
    );
    expect(response.headers.get("content-length")).toBe("4");
    const options = get.mock.calls[0]?.[1];
    expect(options?.range?.get("range")).toBe("bytes=0-3");
    expect(options?.range?.get("authorization")).toBeNull();
    expect(options?.range?.get("cookie")).toBeNull();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("falls back to the immutable origin when R2 misses", async () => {
    const get = vi.fn(async (_key: string, _options?: { readonly range?: Headers }) => null);
    const upstream = vi.fn<typeof fetch>(async (request) => {
      const proxied = request as Request;
      return new Response(JSON.stringify({
        url: proxied.url,
        route: proxied.headers.get("x-toonstudio-edge-route"),
        range: proxied.headers.get("range"),
        authorization: proxied.headers.get("authorization"),
        cookie: proxied.headers.get("cookie"),
      }));
    });
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(
      new Request(
        "https://www.toonstudio.cloud/assets/opencascade.wasm-build123.wasm",
        {
          headers: {
            range: "bytes=0-1023",
            authorization: "Bearer private",
            cookie: "session=private",
          },
        },
      ),
      environment({
        LARGE_ASSETS: { get, head: vi.fn(async (_key: string) => null) },
        LARGE_ASSET_ORIGIN: "https://large-assets.example.test",
      }),
    );

    await expect(response.json()).resolves.toEqual({
      url: "https://large-assets.example.test/assets/opencascade.wasm-build123.wasm",
      route: "large-asset",
      range: "bytes=0-1023",
      authorization: null,
      cookie: null,
    });
    expect(get).toHaveBeenCalledOnce();
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("does not wake the Core API when every large-asset authority misses", async () => {
    const assetFetch = vi.fn(async () => new Response("missing", { status: 404 }));
    const get = vi.fn(async () => null);
    const head = vi.fn(async () => null);
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });

    const response = await gateway(new Request(
      "https://www.toonstudio.cloud/assets/opencascade.wasm-build123.wasm",
      { headers: { range: "bytes=0-7" } },
    ), environment({
      ASSETS: { fetch: assetFetch },
      LARGE_ASSETS: { get, head },
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "LARGE_ASSET_UNAVAILABLE",
    });
    expect(get).toHaveBeenCalledOnce();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("falls back to the core authority while a domain-specific service is not configured", async () => {
    const upstream = vi.fn<typeof fetch>(async (request) => new Response(
      new URL((request as Request).url).host,
    ));
    const gateway = createCloudflareStaticGateway({ fetch: upstream });

    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/community/posts"),
      environment(),
    );

    expect(await response.text()).toBe("core.example.test");
    const proxied = upstream.mock.calls[0]?.[0] as Request;
    expect(proxied.headers.get("x-toonstudio-edge-route")).toBe("social");
  });

  it("distributes public reads deterministically and retries only safe transient failures", async () => {
    const attempts: Request[] = [];
    const upstream = vi.fn<typeof fetch>(async (request) => {
      const proxied = request as Request;
      attempts.push(proxied);
      if (attempts.length === 1) return new Response("busy", { status: 503 });
      return new Response(new URL(proxied.url).host, { status: 200 });
    });
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const env = environment({
      PUBLIC_READ_API_ORIGINS:
        "https://catalog-a.example.test,https://catalog-b.example.test",
    });
    const request = new Request(
      "https://www.toonstudio.cloud/api/titles?genre=fantasy",
      {
        headers: {
          "cf-ray": "stable-ray-id",
          authorization: "Bearer private-session-token",
          cookie: "session=private",
          "x-user-id": "private-user",
          "x-forwarded-for": "203.0.113.200",
        },
      },
    );

    const response = await gateway(request, env);

    expect(response.status).toBe(200);
    expect(attempts).toHaveLength(2);
    expect(new URL(attempts[0].url).origin).not.toBe(
      new URL(attempts[1].url).origin,
    );
    expect(attempts.map((attempt) =>
      attempt.headers.get("x-toonstudio-edge-attempt"))).toEqual(["0", "1"]);
    expect(attempts.every((attempt) =>
      attempt.headers.get("x-toonstudio-edge-route") === "public-read")).toBe(true);
    for (const attempt of attempts) {
      expect(attempt.headers.get("authorization")).toBeNull();
      expect(attempt.headers.get("cookie")).toBeNull();
      expect(attempt.headers.get("x-user-id")).toBeNull();
      expect(attempt.headers.get("x-forwarded-for")).toBeNull();
    }
  });

  it("keeps public writes on the core authority instead of replica failover", async () => {
    const upstream = vi.fn<typeof fetch>(async () =>
      new Response("core-write", { status: 503 }));
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/creator-marketplace/orders", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      }),
      environment({
        PUBLIC_READ_API_ORIGINS:
          "https://catalog-a.example.test,https://catalog-b.example.test",
      }),
    );

    expect(response.status).toBe(503);
    expect(upstream).toHaveBeenCalledOnce();
    const proxied = upstream.mock.calls[0]?.[0] as Request;
    expect(new URL(proxied.url).origin).toBe("https://core.example.test");
    expect(proxied.headers.get("x-toonstudio-edge-route")).toBe("core");
  });

  it("keeps readiness and runtime configuration on core", async () => {
    const upstream = vi.fn<typeof fetch>(async (request) => new Response(
      JSON.stringify({
        host: new URL((request as Request).url).host,
        route: (request as Request).headers.get("x-toonstudio-edge-route"),
      }),
    ));
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const env = environment({
      PUBLIC_READ_API_ORIGINS:
        "https://catalog-a.example.test,https://catalog-b.example.test",
    });

    for (const pathname of [
      "/api/health/ready",
      "/api/config",
    ]) {
      const response = await gateway(
        new Request(`https://www.toonstudio.cloud${pathname}`),
        env,
      );
      await expect(response.json()).resolves.toEqual({
        host: "core.example.test",
        route: "core",
      });
    }
  });

  it("fails closed for an explicitly configured invalid domain authority", async () => {
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/community/posts"),
      environment({ SOCIAL_API_ORIGIN: "http://social.example.test" }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "CORE_API_UNAVAILABLE",
    });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("maps crawler paths to the provider-neutral OG endpoint", () => {
    const origin = new URL("https://core.example.test");
    const title = createCoreApiRequest(
      new Request("https://www.toonstudio.cloud/title/a%20b"),
      origin,
    );
    const market = createCoreApiRequest(
      new Request("https://www.toonstudio.cloud/market/resource/r%2F1"),
      origin,
    );

    expect(new URL(title.url).href).toBe("https://core.example.test/api/og?slug=a+b");
    expect(new URL(market.url).href).toBe(
      "https://core.example.test/api/og?marketResourceId=r%2F1",
    );
  });

  it("fails closed instead of serving SPA HTML for an unconfigured API", async () => {
    const env = environment({ CORE_API_ORIGIN: "http://insecure.example.test" });
    const gateway = createCloudflareStaticGateway({ fetch: vi.fn<typeof fetch>() });

    const response = await gateway(new Request("https://www.toonstudio.cloud/api/me"), env);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "CORE_API_UNAVAILABLE" });
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("rejects any self-reference inside the public read pool", async () => {
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/titles"),
      environment({
        PUBLIC_READ_API_ORIGINS:
          "https://catalog.example.test,https://www.toonstudio.cloud",
      }),
    );

    expect(response.status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects a self-referential core origin before it can create a proxy loop", async () => {
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/api/me"),
      environment({ CORE_API_ORIGIN: "https://www.toonstudio.cloud" }),
    );

    expect(response.status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("passes WebSocket upgrade responses through without reconstructing them", async () => {
    const upstreamResponse = new Response(null, {
      status: 200,
      headers: { "x-upstream-websocket": "preserved" },
    });
    const upstream = vi.fn<typeof fetch>(async () => upstreamResponse);
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/socket.io/?EIO=4&transport=websocket", {
        headers: { upgrade: "websocket" },
      }),
      environment(),
    );

    expect(response).toBe(upstreamResponse);
    expect(response.headers.get("x-upstream-websocket")).toBe("preserved");
    expect(response.headers.get("content-security-policy")).toBeNull();
  });

  it("returns a bounded upstream error without exposing exception details", async () => {
    const gateway = createCloudflareStaticGateway({
      fetch: vi.fn<typeof fetch>(async () => { throw new Error("secret upstream detail"); }),
    });
    const response = await gateway(
      new Request("https://www.toonstudio.cloud/socket.io/?EIO=4&transport=polling"),
      environment(),
    );

    expect(response.status).toBe(502);
    expect(await response.text()).toBe('{"error":"CORE_API_UPSTREAM_FAILED"}');
  });
});

function neisFixture(total = 1) {
  return {
    schoolInfo: [
      {
        head: [
          { list_total_count: total },
          { RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다." } },
        ],
      },
      {
        row: [{
          ATPT_OFCDC_SC_CODE: "B10",
          ATPT_OFCDC_SC_NM: "서울특별시교육청",
          SD_SCHUL_CODE: "7010080",
          SCHUL_NM: "서울고등학교",
          SCHUL_KND_SC_NM: "고등학교",
          FOND_SC_NM: "공립",
          ORG_RDNMA: "서울특별시 서초구 효령로 197",
          COEDU_SC_NM: "남",
          FOND_YMD: "19460201",
        }],
      },
    ],
  };
}

describe("NEIS creator-resource edge", () => {  it("serves keyed school metadata without waking the core origin", async () => {
    const apiKey = "a".repeat(32);
    const upstream = vi.fn<typeof fetch>(async (request) => {
      const url = new URL((request as Request).url);
      expect(url.origin).toBe("https://open.neis.go.kr");
      expect(url.searchParams.get("KEY")).toBe(apiKey);
      expect(url.searchParams.get("pSize")).toBe("12");
      return Response.json(neisFixture());
    });
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(new Request(
      "https://www.toonstudio.cloud/api/creator-resources/search?provider=neis&q=%EC%84%9C%EC%9A%B8%EA%B3%A0%EB%93%B1%ED%95%99%EA%B5%90&page=1",
      { headers: { "cf-connecting-ip": "203.0.113.10" } },
    ), environment({ NEIS_API_KEY: apiKey }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-toonstudio-neis-mode")).toBe("keyed");
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ provider: "neis", status: "ready", total: 1 });
    const item = (body.items as Array<Record<string, unknown>>)[0];
    expect(item).toMatchObject({
      id: "neis:B10-7010080",
      title: "서울고등학교",
      license: "metadata-only",
    });    expect(item?.provenance).toMatchObject({
      provider: "neis",
      importPermission: "metadata-only",
      termsReviewedAt: "2026-09-25",
    });
    expect(JSON.stringify(body)).not.toContain(apiKey);
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("falls back to the official five-row sample when the key is rejected", async () => {
    const apiKey = "b".repeat(32);
    const upstream = vi.fn<typeof fetch>(async (request) => {
      const url = new URL((request as Request).url);
      if (url.searchParams.has("KEY")) {
        return new Response("upstream failure", {
          status: 500,
          headers: { "content-type": "text/html" },
        });
      }
      expect(url.searchParams.get("pIndex")).toBe("1");
      expect(url.searchParams.get("pSize")).toBe("5");
      return Response.json(neisFixture(42));
    });
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(new Request(
      "https://www.toonstudio.cloud/api/creator-resources/search?provider=neis&q=%EA%B3%A0%EB%93%B1%ED%95%99%EA%B5%90&page=2",
      { headers: { "cf-connecting-ip": "203.0.113.11" } },
    ), environment({ NEIS_API_KEY: apiKey }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-toonstudio-neis-mode")).toBe("sample");
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      provider: "neis",
      status: "ready",
      page: 2,
      hasMore: false,
      total: 42,
      items: [],
    });
    expect(String(body.message)).toContain("공개 샘플 최대 5건");
    expect(JSON.stringify(body)).not.toContain(apiKey);
    expect(upstream).toHaveBeenCalledTimes(2);

    const next = await gateway(new Request(
      "https://www.toonstudio.cloud/api/creator-resources/search?provider=neis&q=%EC%A4%91%ED%95%99%EA%B5%90&page=1",
      { headers: { "cf-connecting-ip": "203.0.113.11" } },
    ), environment({ NEIS_API_KEY: apiKey }));
    expect(next.headers.get("x-toonstudio-neis-mode")).toBe("sample");
    expect(upstream).toHaveBeenCalledTimes(3);
  });

  it("caches repeated searches and bounds uncached traffic per client", async () => {
    const upstream = vi.fn<typeof fetch>(async () => Response.json({
      RESULT: { CODE: "INFO-200", MESSAGE: "해당하는 데이터가 없습니다." },
    }));
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const request = (query: string) => new Request(
      `https://www.toonstudio.cloud/api/creator-resources/search?provider=neis&q=${query}&page=1`,
      { headers: { "cf-connecting-ip": "203.0.113.12" } },
    );

    const first = await gateway(request("학교00"), environment());
    const cached = await gateway(request("학교00"), environment());
    expect(first.headers.get("x-toonstudio-edge-cache")).toBe("miss");
    expect(cached.headers.get("x-toonstudio-edge-cache")).toBe("hit");
    expect(upstream).toHaveBeenCalledOnce();
    for (const query of ["학교01", "학교02", "학교03", "학교04"]) {
      expect((await gateway(request(query), environment())).status).toBe(200);
    }
    const limited = await gateway(request("학교05"), environment());
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(upstream).toHaveBeenCalledTimes(5);
  });

  it("marks NEIS configured in the public provider summary", async () => {
    const upstream = vi.fn<typeof fetch>(async () => Response.json([
      { provider: "neis", availability: "not_configured" },
      { provider: "ambientcg", availability: "keyless" },
    ]));
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(new Request(
      "https://www.toonstudio.cloud/api/creator-resources/providers",
    ), environment({ NEIS_API_KEY: "c".repeat(32) }));

    expect(response.status).toBe(200);
    expect(response.headers.get(
      "x-toonstudio-creator-resource-source",
    )).toBe("cloudflare-neis-edge");
    await expect(response.json()).resolves.toEqual([
      { provider: "neis", availability: "configured" },
      { provider: "ambientcg", availability: "keyless" },
    ]);
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("rejects invalid input before any provider request", async () => {
    const upstream = vi.fn<typeof fetch>();
    const gateway = createCloudflareStaticGateway({ fetch: upstream });
    const response = await gateway(new Request(
      "https://www.toonstudio.cloud/api/creator-resources/search?provider=neis&q=x&page=99",
    ), environment());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_creator_resource_query",
    });
    expect(upstream).not.toHaveBeenCalled();
  });
});
