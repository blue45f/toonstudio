import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  CLOUDFLARE_BUNDLE_V2_INDEX_CACHE_CONTROL,
  CLOUDFLARE_BUNDLE_V2_INDEX_PATH,
  CLOUDFLARE_BUNDLE_V2_RELEASE_INDEX_PATH_PREFIX,
  cloudflareLargeAssetDescriptor,
  cloudflareLargeAssetKey,
  supportsCloudflareStaticSidecar,
} from "./large-static-assets";

import {
  createCloudflareStaticGateway,
  type CloudflareStaticEnv,
  type R2ObjectBodyBinding,
} from "./index";

const INDEX_SHA = "a5e46f6cfbe92a53ab8aedae578a5160e7c5fe9dc9fa87d4e96b16e6fa7b9994";
const INDEX_PATH = `${CLOUDFLARE_BUNDLE_V2_RELEASE_INDEX_PATH_PREFIX}${INDEX_SHA}.json`;
const INDEX_KEY = INDEX_PATH.slice(1);
const INDEX_URL = `https://www.toonstudio.cloud${INDEX_PATH}`;
const INDEX_BODY = readFileSync(new URL(
  `../../../apps/web/public/assets/3d/environments/bundle-v1/deploy-index.${INDEX_SHA}.json`,
  import.meta.url,
), "utf8");

type R2Mode = "present" | "missing" | "error" | "unbound";

function r2Index(): R2ObjectBodyBinding {
  return {
    size: new TextEncoder().encode(INDEX_BODY).byteLength,
    httpEtag: '"release-index"',
    body: new Response(INDEX_BODY).body!,
    writeHttpMetadata(headers) {
      headers.set("content-type", "text/html");
      headers.set("content-disposition", "inline");
    },
  };
}

function harness(mode: R2Mode = "present") {
  const object = () => {
    if (mode === "error") throw new Error("R2 조회 실패");
    return mode === "missing" ? null : r2Index();
  };
  const get = vi.fn(async (_key: string, _options?: { readonly range?: Headers }) => object());
  const head = vi.fn(async (_key: string) => object());
  // 정적 파일에도 같은 JSON이 있어야 R2 누락을 정적 성공으로 숨기는 회귀를 잡는다.
  const assets = vi.fn(async () => new Response(INDEX_BODY, { headers: { "content-type": "application/json" } }));
  const upstream = vi.fn<typeof fetch>(async () => new Response(INDEX_BODY));
  const env: CloudflareStaticEnv = {
    ASSETS: { fetch: assets },
    CORE_API_ORIGIN: "https://core.example.test",
    LARGE_ASSET_ORIGIN: "https://large-assets.example.test",
    ...(mode === "unbound" ? {} : { LARGE_ASSETS: { get, head } }),
  };
  return { get, head, assets, upstream, env, gateway: createCloudflareStaticGateway({ fetch: upstream }) };
}

describe("번들 release 완료 색인의 R2 전용 전달", () => {
  it("기존 배포 색인 원문을 같은 SHA의 GET·HEAD 전용 경로로만 연결한다", () => {
    expect(new TextEncoder().encode(INDEX_BODY).byteLength).toBe(304);
    expect(createHash("sha256").update(INDEX_BODY).digest("hex")).toBe(INDEX_SHA);
    expect(cloudflareLargeAssetDescriptor(INDEX_PATH)).toEqual({
      contentType: "application/json",
      cacheControl: CLOUDFLARE_BUNDLE_V2_INDEX_CACHE_CONTROL,
      sameOriginOnly: true,
      getHeadOnly: true,
    });
    expect(cloudflareLargeAssetKey(INDEX_PATH)).toBe(INDEX_KEY);
    expect(supportsCloudflareStaticSidecar(INDEX_PATH)).toBe(false);
  });

  it("정상 R2 GET의 정확한 키·JSON 본문·출처 헤더를 보존한다", async () => {
    const h = harness();
    const response = await h.gateway(new Request(INDEX_URL, { headers: { "sec-fetch-site": "same-origin" } }), h.env);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(INDEX_BODY);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("content-length")).toBe("304");
    expect(response.headers.get("cache-control")).toBe(CLOUDFLARE_BUNDLE_V2_INDEX_CACHE_CONTROL);
    expect(response.headers.get("x-toonstudio-large-asset-source")).toBe("r2");
    expect(response.headers.get("vary")).toBe("Sec-Fetch-Site");
    expect([...response.headers.keys()].filter((name) => name.startsWith("access-control-"))).toEqual([]);
    expect(h.get).toHaveBeenCalledWith(INDEX_KEY, undefined);
    expect(h.head).not.toHaveBeenCalled();
    expect(h.assets).not.toHaveBeenCalled();
    expect(h.upstream).not.toHaveBeenCalled();
  });

  it("HEAD는 R2 metadata만 확인하고 본문을 내보내지 않는다", async () => {
    const h = harness();
    const response = await h.gateway(new Request(INDEX_URL, { method: "HEAD" }), h.env);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("content-length")).toBe("304");
    expect(h.head).toHaveBeenCalledWith(INDEX_KEY);
    expect(h.get).not.toHaveBeenCalled();
    expect(h.assets).not.toHaveBeenCalled();
    expect(h.upstream).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", "GET"], ["error", "GET"], ["unbound", "GET"],
    ["missing", "HEAD"], ["error", "HEAD"], ["unbound", "HEAD"],
  ] as const)("R2 %s의 %s는 정적 JSON이 있어도 503으로 닫는다", async (mode, method) => {
    const h = harness(mode);
    const response = await h.gateway(new Request(INDEX_URL, { method }), h.env);
    expect(response.status).toBe(503);
    if (method === "HEAD") expect(await response.text()).toBe("");
    else expect(await response.json()).toEqual({ error: "LARGE_ASSET_UNAVAILABLE" });
    expect(h.assets).not.toHaveBeenCalled();
    expect(h.upstream).not.toHaveBeenCalled();
  });

  it.each(["POST", "PUT", "OPTIONS"])("완료 표식은 %s를 R2 접근 전에 405로 거부한다", async (method) => {
    for (const mode of ["present", "unbound"] as const) {
      const h = harness(mode);
      const response = await h.gateway(new Request(INDEX_URL, { method }), h.env);
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
      expect(h.get).not.toHaveBeenCalled();
      expect(h.head).not.toHaveBeenCalled();
      expect(h.assets).not.toHaveBeenCalled();
      expect(h.upstream).not.toHaveBeenCalled();
    }
  });

  it.each(["cross-site", "same-site", "none", ""])("외부 출처 %j는 GET·HEAD 모두 R2 접근 전에 거부한다", async (site) => {
    for (const method of ["GET", "HEAD"]) {
      const h = harness();
      const response = await h.gateway(new Request(INDEX_URL, {
        method, headers: { origin: "https://outside.example.test", "sec-fetch-site": site },
      }), h.env);
      expect(response.status).toBe(403);
      if (method === "HEAD") expect(await response.text()).toBe("");
      expect(h.get).not.toHaveBeenCalled();
      expect(h.head).not.toHaveBeenCalled();
      expect(h.assets).not.toHaveBeenCalled();
      expect(h.upstream).not.toHaveBeenCalled();
    }
  });

  it.each([
    `${INDEX_SHA.toUpperCase()}.json`, `${INDEX_SHA.slice(1)}.json`, `${INDEX_SHA}0.json`,
    `%61${INDEX_SHA.slice(1)}.json`, `${INDEX_SHA}%2f.json`,
    `nested/${INDEX_SHA}.json`, `nested%2f..%2f${INDEX_SHA}.json`, `${INDEX_SHA}.glb`,
  ])("잘못된 완료 색인 경로 %s는 정적·원점 폴백 없이 거부한다", async (name) => {
    const h = harness();
    const path = `${CLOUDFLARE_BUNDLE_V2_RELEASE_INDEX_PATH_PREFIX}${name}`;
    expect(cloudflareLargeAssetDescriptor(path)).toBeNull();
    expect(cloudflareLargeAssetKey(path)).toBeNull();
    const response = await h.gateway(new Request(`https://www.toonstudio.cloud${path}`), h.env);
    expect(response.status).toBe(404);
    expect(h.get).not.toHaveBeenCalled();
    expect(h.head).not.toHaveBeenCalled();
    expect(h.assets).not.toHaveBeenCalled();
    expect(h.upstream).not.toHaveBeenCalled();
  });

  it("인코딩된 namespace와 원문 traversal도 완료 경로로 허용하지 않는다", async () => {
    const traversal = `${CLOUDFLARE_BUNDLE_V2_RELEASE_INDEX_PATH_PREFIX}../${INDEX_SHA}.json`;
    expect(cloudflareLargeAssetDescriptor(traversal)).toBeNull();
    for (const path of [
      `/assets/studio/bundle-v2/%72elease-index/${INDEX_SHA}.json`,
      "/assets/studio/bundle-v2/%72elease-index/%ZZ.json",
      `/assets/studio/bundle-v2/Release-Index/${INDEX_SHA}.json`,
    ]) {
      const h = harness();
      expect(cloudflareLargeAssetDescriptor(path)).toBeNull();
      const response = await h.gateway(new Request(`https://www.toonstudio.cloud${path}`), h.env);
      expect(response.status).toBe(404);
      expect(h.get).not.toHaveBeenCalled();
      expect(h.assets).not.toHaveBeenCalled();
      expect(h.upstream).not.toHaveBeenCalled();
    }
  });

  it("기존 legacy index·GLB 경로의 descriptor를 유지한다", () => {
    expect(cloudflareLargeAssetDescriptor(CLOUDFLARE_BUNDLE_V2_INDEX_PATH)).toEqual({
      contentType: "application/json", cacheControl: CLOUDFLARE_BUNDLE_V2_INDEX_CACHE_CONTROL, sameOriginOnly: true,
    });
    expect(cloudflareLargeAssetDescriptor(`/assets/studio/bundle-v2/${INDEX_SHA}.glb`)).toEqual({
      contentType: "model/gltf-binary", sameOriginOnly: true,
    });
  });
});
