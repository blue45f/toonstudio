import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_AI_STARTER_MANIFEST_URL,
  DEFAULT_IDLE_MAX_SLICE_MS,
  DEFAULT_SEMANTIC_INDEX_256D_URL,
  DEFAULT_WASM64_CORE_ASSET_URLS,
  IdleThumbnailAndPreflightScheduler,
  PWA_BASE_CACHE_PREFIX,
  PwaBaseAssetPinner,
  computeBaseAssetVersionHash,
  computeFnv1a32,
  computeRgbaContentHash,
  createInMemoryCacheStorage,
  downsampleRgba8BilinearBox,
  hasValidWasmMagicHeader,
  validateCutExportPreflight,
  type CutPrecomputeJob,
  type IdleSliceYieldContext,
  type PinCacheLike,
  type PinCacheStorageLike,
  type RightsBomAssetItem,
} from "./index";

function makeValidWasmBinary(extraBytes = 32, tag = 1): Uint8Array {
  const buf = new Uint8Array(8 + extraBytes);
  // \0asm + version 1
  buf.set([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00], 0);
  for (let i = 8; i < buf.length; i += 1) buf[i] = (i + tag) & 0xff;
  return buf;
}

function makeCoreAssetFixtures(versionTag = "v1"): Map<string, { bytes: Uint8Array; contentType: string }> {
  const enc = new TextEncoder();
  const map = new Map<string, { bytes: Uint8Array; contentType: string }>();
  DEFAULT_WASM64_CORE_ASSET_URLS.forEach((url, idx) => {
    map.set(url, { bytes: makeValidWasmBinary(64 + idx * 16, idx + 1), contentType: "application/wasm" });
  });
  map.set(DEFAULT_AI_STARTER_MANIFEST_URL, {
    bytes: enc.encode(JSON.stringify({ schemaVersion: 1, release: versionTag, items: 884 })),
    contentType: "application/json",
  });
  const semanticEntries = Array.from({ length: 884 }, (_, i) => ({ id: `item-${i}`, category: "bg" }));
  map.set(DEFAULT_SEMANTIC_INDEX_256D_URL, {
    bytes: enc.encode(JSON.stringify({ version: versionTag, dimensions: 256, count: 884, entries: semanticEntries })),
    contentType: "application/json",
  });
  map.set("/fonts/pretendard-subset.woff2", {
    bytes: new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01, 0x02, 0x03]),
    contentType: "font/woff2",
  });
  map.set("/icons/studio-icon-192.png", {
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    contentType: "image/png",
  });
  return map;
}

function createFixtureFetch(
  fixtures: Map<string, { bytes: Uint8Array; contentType: string }>,
  overrides?: Readonly<Record<string, () => Promise<Response> | Response>>,
): { fetchFn: typeof fetch; getCalls: () => number; resetCalls: () => void } {
  let calls = 0;
  const fetchFn: typeof fetch = async (input) => {
    calls += 1;
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const override = overrides?.[url];
    if (override) return await override();
    const item = fixtures.get(url);
    if (!item) return new Response("Not Found", { status: 404, statusText: "Not Found" });
    return new Response(new Uint8Array(item.bytes), {
      status: 200,
      statusText: "OK",
      headers: { "content-type": item.contentType },
    });
  };
  return { fetchFn, getCalls: () => calls, resetCalls: () => { calls = 0; } };
}

function makeSplitRgbaCanvas(
  width: number,
  height: number,
  topRgba: readonly [number, number, number, number],
  bottomRgba: readonly [number, number, number, number],
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  const splitY = Math.floor(height / 2);
  for (let y = 0; y < height; y += 1) {
    const color = y < splitY ? topRgba : bottomRgba;
    const rowOff = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const o = rowOff + x * 4;
      buf[o] = color[0];
      buf[o + 1] = color[1];
      buf[o + 2] = color[2];
      buf[o + 3] = color[3];
    }
  }
  return buf;
}

function makeBaseCutJob(overrides: Partial<CutPrecomputeJob> = {}): CutPrecomputeJob {
  const width = overrides.width ?? 800;
  const height = overrides.height ?? 1200;
  const rgba = overrides.rgba ?? makeSplitRgbaCanvas(width, height, [220, 60, 40, 255], [30, 120, 160, 255]);
  return {
    pageId: "cut-001",
    revisionHash: "rev-001",
    rgba,
    width,
    height,
    dpi: 72,
    colorProfile: "srgb",
    exportTarget: "naver-webtoon",
    commercialUse: true,
    rightsBom: [
      { assetId: "brush-ink-01", name: "스튜디오 기본 잉크펜", kind: "brush", licenseTier: "cc0" },
      { assetId: "bg-corridor-14", name: "학교 복도 3D 배경", kind: "3d-bg", licenseTier: "commercial-cleared" },
    ],
    ...overrides,
  };
}

describe("PwaBaseAssetPinner — 무비용($0) 원자적 피닝 · 0-네트워크 재방문 · 무결성 검증", () => {
  it("4종 WASM64 바이너리 + AI 매니페스트 + 884개 시맨틱 인덱스 + 폰트/아이콘을 원자적으로 고정하고 재방문 시 네트워크 호출 0회를 보장한다", async () => {
    const cacheStorage = createInMemoryCacheStorage();
    const fixtures = makeCoreAssetFixtures("20261126a");
    const mockNet = createFixtureFetch(fixtures);

    const pinner = new PwaBaseAssetPinner({
      versionHash: "20261126a",
      fontUrls: ["/fonts/pretendard-subset.woff2"],
      iconUrls: ["/icons/studio-icon-192.png"],
      cacheStorage,
      fetchFn: mockNet.fetchFn,
    });

    expect(pinner.cacheName).toBe(`${PWA_BASE_CACHE_PREFIX}20261126a`);
    expect(pinner.assets).toHaveLength(8);

    const firstRun = await pinner.pinAll();
    expect(firstRun.ok).toBe(true);
    expect(firstRun.status).toBe("pinned");
    expect(firstRun.fetchCalls).toBe(8);
    expect(firstRun.pinnedAssets).toHaveLength(8);
    expect(firstRun.failures).toHaveLength(0);
    expect(mockNet.getCalls()).toBe(8);

    // 오프라인 재방문 시뮬레이션: 새 인스턴스가 동일 버전 캐시를 열어도 네트워크 호출은 정확히 0회여야 한다.
    mockNet.resetCalls();
    const revisitFetch = vi.fn<typeof fetch>(() => Promise.reject(new Error("OFFLINE_NO_NETWORK_ALLOWED")));
    const revisitPinner = new PwaBaseAssetPinner({
      versionHash: "20261126a",
      fontUrls: ["/fonts/pretendard-subset.woff2"],
      iconUrls: ["/icons/studio-icon-192.png"],
      cacheStorage,
      fetchFn: revisitFetch,
    });

    const revisitPin = await revisitPinner.pinAll();
    expect(revisitPin.ok).toBe(true);
    expect(revisitPin.status).toBe("already-pinned");
    expect(revisitPin.fetchCalls).toBe(0);
    expect(revisitPin.cacheHits).toBe(8);
    expect(revisitFetch).not.toHaveBeenCalled();

    // 모든 고정 에셋 조회도 네트워크 0회로 캐시 히트해야 한다.
    for (const wasmUrl of DEFAULT_WASM64_CORE_ASSET_URLS) {
      const bytes = await revisitPinner.readPinnedAssetBytes(wasmUrl);
      expect(bytes).not.toBeNull();
      expect(hasValidWasmMagicHeader(bytes as Uint8Array)).toBe(true);
    }

    const indexResponse = await revisitPinner.matchPinnedAsset(DEFAULT_SEMANTIC_INDEX_256D_URL);
    expect(indexResponse).not.toBeNull();
    const indexJson = (await indexResponse?.json()) as { count: number; entries: unknown[] };
    expect(indexJson.count).toBe(884);
    expect(indexJson.entries).toHaveLength(884);
    expect(revisitFetch).not.toHaveBeenCalled();

    const telemetry = revisitPinner.getTelemetry();
    expect(telemetry.totalNetworkFetchCalls).toBe(0);
    expect(telemetry.offlineCacheHits).toBe(5);
    expect(telemetry.offlineCacheMisses).toBe(0);
  });

  it("저장소 실물 apps/web/public/wasm/*.wasm 4종 바이너리가 매직 헤더 검증 및 피닝을 통과한다", async () => {
    const publicWasmDir = path.resolve(process.cwd(), "apps/web/public/wasm");
    const cacheStorage = createInMemoryCacheStorage();
    const realWasmMap = new Map<string, Uint8Array>();

    for (const url of DEFAULT_WASM64_CORE_ASSET_URLS) {
      const filename = path.basename(url);
      const bytes = new Uint8Array(fs.readFileSync(path.join(publicWasmDir, filename)));
      expect(hasValidWasmMagicHeader(bytes)).toBe(true);
      realWasmMap.set(url, bytes);
    }

    const pinner = new PwaBaseAssetPinner({
      versionHash: "real-wasm-check",
      assets: DEFAULT_WASM64_CORE_ASSET_URLS.map((url) => ({
        url,
        kind: "wasm",
        expectedByteLength: realWasmMap.get(url)?.byteLength,
      })),
      cacheStorage,
      fetchFn: async (input) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const bytes = realWasmMap.get(url);
        return bytes
          ? new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": "application/wasm" } })
          : new Response("missing", { status: 404 });
      },
    });

    const result = await pinner.pinAll();
    expect(result.ok).toBe(true);
    expect(result.pinnedAssets).toHaveLength(4);
    expect(result.totalBytes).toBeGreaterThan(300_000);
  });

  it("손상된 .wasm(\\0asm 헤더 불일치), 바이트 길이 불일치, 깨진 JSON을 거부하고 기존 오프라인 캐시를 보존한다", async () => {
    const cacheStorage = createInMemoryCacheStorage();
    const fixturesV1 = makeCoreAssetFixtures("v1");
    const netV1 = createFixtureFetch(fixturesV1);

    // 1) 정상 v1 피닝 완료
    const pinnerV1 = new PwaBaseAssetPinner({ versionHash: "v1", cacheStorage, fetchFn: netV1.fetchFn });
    expect((await pinnerV1.pinAll()).ok).toBe(true);

    // 2) v2에서 SIMD wasm 대신 SPA HTML 폴백이 반환된 손상 시나리오
    const corruptNet = createFixtureFetch(makeCoreAssetFixtures("v2"), {
      "/wasm/studio-wasm64-drawing-core-simd.wasm": () =>
        new Response("<!doctype html><html><body>404 fallback</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    });
    const pinnerV2 = new PwaBaseAssetPinner({ versionHash: "v2-corrupt", cacheStorage, fetchFn: corruptNet.fetchFn });
    const corruptResult = await pinnerV2.pinAll();
    expect(corruptResult.ok).toBe(false);
    expect(corruptResult.status).toBe("failed");
    expect(corruptResult.failures[0]?.reason).toBe("invalid-wasm-magic");
    expect(corruptResult.prunedCacheNames).toEqual([]);

    // 구버전 v1 캐시는 그대로 살아 있고 새 손상 캐시는 생성되지 않았어야 한다.
    expect(await cacheStorage.has(`${PWA_BASE_CACHE_PREFIX}v1`)).toBe(true);
    expect(await cacheStorage.has(`${PWA_BASE_CACHE_PREFIX}v2-corrupt`)).toBe(false);

    // 오프라인 폴백 조회가 v1 캐시에서 0-네트워크로 정상 히트한다.
    const fallback = await pinnerV2.resolvePinnedAsset("/wasm/studio-wasm64-drawing-core-simd.wasm");
    expect(fallback.hit).toBe(true);
    expect(fallback.source).toBe("fallback-cache");
    expect(fallback.cacheName).toBe(`${PWA_BASE_CACHE_PREFIX}v1`);

    // 3) 깨진 JSON 매니페스트 거부 확인
    const badJsonNet = createFixtureFetch(makeCoreAssetFixtures("v3"), {
      [DEFAULT_AI_STARTER_MANIFEST_URL]: () => new Response("{broken json", { status: 200 }),
    });
    const badJsonPinner = new PwaBaseAssetPinner({ versionHash: "v3-bad-json", cacheStorage, fetchFn: badJsonNet.fetchFn });
    const badJsonResult = await badJsonPinner.pinAll();
    expect(badJsonResult.ok).toBe(false);
    expect(badJsonResult.failures[0]?.reason).toBe("invalid-json");

    // 4) expectedByteLength 불일치 거부 확인
    const wrongLenPinner = new PwaBaseAssetPinner({
      versionHash: "v4-bad-len",
      assets: [{ url: "/wasm/studio-wasm64-drawing-core.wasm", kind: "wasm", expectedByteLength: 9999 }],
      cacheStorage,
      fetchFn: netV1.fetchFn,
    });
    const wrongLenResult = await wrongLenPinner.pinAll();
    expect(wrongLenResult.ok).toBe(false);
    expect(wrongLenResult.failures[0]?.reason).toBe("byte-length-mismatch");
  });

  it("새 버전이 100% 원자적으로 커밋된 뒤에만 구버전 캐시를 정리하며, 관련 없는 캐시와 실패 시 구버전은 절대 삭제하지 않는다", async () => {
    const cacheStorage = createInMemoryCacheStorage();
    // 관련 없는 사용자 캐시 사전 생성
    const unrelatedCache = await cacheStorage.open("toonstudio-user-projects-v99");
    await unrelatedCache.put("/project/demo.json", new Response('{"ok":true}', { status: 200 }));

    // v1 피닝 성공
    const netV1 = createFixtureFetch(makeCoreAssetFixtures("v1"));
    const pinnerV1 = new PwaBaseAssetPinner({ versionHash: "v1", cacheStorage, fetchFn: netV1.fetchFn });
    expect((await pinnerV1.pinAll()).ok).toBe(true);

    // v2 부분 실패 (HTTP 503): v1 유지, prunedCacheNames === []
    const failingNetV2 = createFixtureFetch(makeCoreAssetFixtures("v2"), {
      [DEFAULT_SEMANTIC_INDEX_256D_URL]: () => new Response("Service Unavailable", { status: 503 }),
    });
    const pinnerV2Fail = new PwaBaseAssetPinner({ versionHash: "v2", cacheStorage, fetchFn: failingNetV2.fetchFn });
    const failedRes = await pinnerV2Fail.pinAll();
    expect(failedRes.ok).toBe(false);
    expect(failedRes.failures[0]?.reason).toBe("http-error");
    expect(failedRes.failures[0]?.httpStatus).toBe(503);
    expect(failedRes.prunedCacheNames).toEqual([]);
    expect(await cacheStorage.keys()).toEqual(["toonstudio-user-projects-v99", `${PWA_BASE_CACHE_PREFIX}v1`]);

    // v2 정상 재시도: 100% 성공 직후 v1만 정리하고 관련 없는 캐시는 보존
    const netV2 = createFixtureFetch(makeCoreAssetFixtures("v2"));
    const pinnerV2Ok = new PwaBaseAssetPinner({ versionHash: "v2", cacheStorage, fetchFn: netV2.fetchFn });
    const okRes = await pinnerV2Ok.pinAll();
    expect(okRes.ok).toBe(true);
    expect(okRes.status).toBe("pinned");
    expect(okRes.prunedCacheNames).toEqual([`${PWA_BASE_CACHE_PREFIX}v1`]);
    expect(await cacheStorage.keys()).toEqual(["toonstudio-user-projects-v99", `${PWA_BASE_CACHE_PREFIX}v2`]);
  });

  it("캐시 쓰기 도중 쿼터 오류 발생 시 신규 캐시를 롤백하고, AbortSignal 취소를 안전하게 처리한다", async () => {
    const backing = createInMemoryCacheStorage();
    const fixtures = makeCoreAssetFixtures("v1");
    const net = createFixtureFetch(fixtures);
    const pinnerV1 = new PwaBaseAssetPinner({ versionHash: "v1", cacheStorage: backing, fetchFn: net.fetchFn });
    expect((await pinnerV1.pinAll()).ok).toBe(true);

    // 3번째 put에서 QuotaExceededError를 던지는 래퍼
    let putCount = 0;
    const flakyStorage: PinCacheStorageLike = {
      keys: () => backing.keys(),
      delete: (name) => backing.delete(name),
      has: (name) => backing.has(name),
      match: (req) => backing.match(req),
      open: async (name): Promise<PinCacheLike> => {
        const inner = await backing.open(name);
        if (name !== `${PWA_BASE_CACHE_PREFIX}v2-quota`) return inner;
        return {
          match: (req) => inner.match(req),
          delete: (req) => inner.delete(req),
          keys: () => inner.keys(),
          put: async (req, res) => {
            putCount += 1;
            if (putCount === 3) throw new Error("QuotaExceededError");
            return inner.put(req, res);
          },
        };
      },
    };

    const quotaPinner = new PwaBaseAssetPinner({ versionHash: "v2-quota", cacheStorage: flakyStorage, fetchFn: net.fetchFn });
    const quotaResult = await quotaPinner.pinAll();
    expect(quotaResult.ok).toBe(false);
    expect(quotaResult.failures[0]?.reason).toBe("cache-write-error");
    expect(await backing.has(`${PWA_BASE_CACHE_PREFIX}v2-quota`)).toBe(false);
    expect(await backing.has(`${PWA_BASE_CACHE_PREFIX}v1`)).toBe(true);

    // AbortSignal 사전 취소
    const ac = new AbortController();
    ac.abort();
    const abortPinner = new PwaBaseAssetPinner({ versionHash: "v3-abort", cacheStorage: backing, fetchFn: net.fetchFn });
    const abortRes = await abortPinner.pinAll(ac.signal);
    expect(abortRes.ok).toBe(false);
    expect(abortRes.status).toBe("aborted");
    expect(abortRes.fetchCalls).toBe(0);

    // 버전 해시 결정성 확인
    const h1 = computeBaseAssetVersionHash(pinnerV1.assets, "build-1");
    const h2 = computeBaseAssetVersionHash(pinnerV1.assets, "build-1");
    const h3 = computeBaseAssetVersionHash(pinnerV1.assets, "build-2");
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("IdleThumbnailAndPreflightScheduler — RGBA8 다운샘플링 · Rights BOM 프리플라이트 · 0ms 웜 캐시", () => {
  it("800×1200 → 160×240 이중선형 박스 다운샘플링 및 프리멀티플라이드 알파 블렌딩이 정확하다", () => {
    const src = makeSplitRgbaCanvas(800, 1200, [220, 60, 40, 255], [30, 120, 160, 255]);
    const thumb = downsampleRgba8BilinearBox(src, 800, 1200, 160, 240);
    expect(thumb.length).toBe(160 * 240 * 4);

    // 상단 영역 (dy=0..119)은 정확히 (220, 60, 40, 255)
    expect(Array.from(thumb.slice(0, 4))).toEqual([220, 60, 40, 255]);
    const row119 = 119 * 160 * 4;
    expect(Array.from(thumb.slice(row119, row119 + 4))).toEqual([220, 60, 40, 255]);

    // 하단 영역 (dy=120..239)은 정확히 (30, 120, 160, 255)
    const row120 = 120 * 160 * 4;
    expect(Array.from(thumb.slice(row120, row120 + 4))).toEqual([30, 120, 160, 255]);

    // 투명(0,0,0,0)과 불투명 빨강(255,0,0,255)의 2×1 축소: 검은 프린지 없이 RGB=(255,0,0), A=128 유지
    const edgeSrc = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]);
    const edgeDst = downsampleRgba8BilinearBox(edgeSrc, 2, 1, 1, 1);
    expect(Array.from(edgeDst)).toEqual([255, 0, 0, 128]);

    // 2×2 → 4×4 확대(upscale)에서도 균일색이 보존된다
    const small = new Uint8ClampedArray([100, 150, 200, 255, 100, 150, 200, 255, 100, 150, 200, 255, 100, 150, 200, 255]);
    const up = downsampleRgba8BilinearBox(small, 2, 2, 4, 4);
    expect(up.length).toBe(64);
    expect(Array.from(up.slice(0, 4))).toEqual([100, 150, 200, 255]);
  });

  it("Rights BOM 비상업/만료 에셋, 색 프로파일·DPI 불일치, 네이버/카카오 800px 미만 세로 폭을 정확히 차단한다", () => {
    const clean = validateCutExportPreflight({
      width: 800,
      height: 1200,
      dpi: 72,
      colorProfile: "srgb",
      exportTarget: "naver-webtoon",
      commercialUse: true,
      rgbaByteLength: 800 * 1200 * 4,
      rightsBom: [
        { assetId: "font-01", name: "오픈 폰트", kind: "font", licenseTier: "cc0" },
        { assetId: "bg-02", name: "상업용 배경", kind: "3d-bg", licenseTier: "commercial-cleared" },
      ],
    });
    expect(clean.ok).toBe(true);
    expect(clean.canExport).toBe(true);
    expect(clean.errorCount).toBe(0);
    expect(clean.unlicensedAssetIds).toEqual([]);

    const invalidRights: RightsBomAssetItem[] = [
      { assetId: "vrm-personal", name: "개인용 VRM 아바타", kind: "vrm", licenseTier: "personal-only" },
      { assetId: "tex-unlicensed", name: "미승인 텍스처", kind: "texture", licenseTier: "unlicensed" },
      {
        assetId: "font-expired",
        name: "만료된 유료 폰트",
        kind: "font",
        licenseTier: "commercial-cleared",
        expiresAtMs: 1_700_000_000_000,
      },
      {
        assetId: "brush-cc-by",
        name: "저작자 표기 필요 브러시",
        kind: "brush",
        licenseTier: "commercial-cleared",
        attributionRequired: true,
        attributionProvided: false,
      },
    ];

    const blocked = validateCutExportPreflight({
      width: 690,
      height: 24000,
      dpi: 48,
      colorProfile: "cmyk",
      exportTarget: "kakao-webtoon",
      commercialUse: true,
      rgbaByteLength: 1024,
      nowEpochMs: 1_800_000_000_000,
      rightsBom: invalidRights,
    });

    expect(blocked.ok).toBe(false);
    expect(blocked.canExport).toBe(false);
    expect(blocked.unlicensedAssetIds).toEqual(["vrm-personal", "tex-unlicensed", "font-expired"]);
    const codes = blocked.issues.map((i) => i.code);
    expect(codes).toContain("STRIP_WIDTH_TOO_NARROW");
    expect(codes).toContain("STRIP_HEIGHT_NEEDS_SLICING");
    expect(codes).toContain("RESOLUTION_DPI_TOO_LOW");
    expect(codes).toContain("COLOR_PROFILE_MISMATCH");
    expect(codes).toContain("BUFFER_DIMENSION_MISMATCH");
    expect(codes).toContain("RIGHTS_UNLICENSED_COMMERCIAL");
    expect(codes).toContain("RIGHTS_ATTRIBUTION_MISSING");
  });

  it("동일 (pageId, revisionHash) 내보내기 요청은 0ms 웜 캐시 히트(0 재계산)하고, 편집/무효화 시 즉시 재계산한다", async () => {
    const scheduler = new IdleThumbnailAndPreflightScheduler({
      maxSliceMs: DEFAULT_IDLE_MAX_SLICE_MS,
      yieldToIdle: async () => Promise.resolve(),
    });

    const jobV1 = makeBaseCutJob({ pageId: "ep1-cut1", revisionHash: "rev-a1" });
    const first = await scheduler.schedulePage(jobV1);
    expect(first.status).toBe("completed");
    if (first.status !== "completed") throw new Error("expected completed");
    expect(first.result.cacheHit).toBe(false);
    expect(first.result.thumbnail.width).toBe(160);
    expect(first.result.thumbnail.height).toBe(240);
    expect(first.result.preflight.canExport).toBe(true);

    // Export 버튼 클릭 시 동기/비동기 모두 0ms 웜 캐시 히트 (재계산 작업 0회)
    const syncWarm = scheduler.getWarmResult("ep1-cut1", "rev-a1");
    expect(syncWarm).not.toBeNull();
    expect(syncWarm?.cacheHit).toBe(true);
    expect(syncWarm?.computeMs).toBe(0);
    expect(syncWarm?.slicesUsed).toBe(0);

    const exportClick = await scheduler.getOrComputeForExport(jobV1);
    expect(exportClick.status).toBe("completed");
    if (exportClick.status !== "completed") throw new Error("expected completed");
    expect(exportClick.result.cacheHit).toBe(true);
    expect(exportClick.result.computeMs).toBe(0);
    expect(exportClick.result.slicesUsed).toBe(0);
    expect(scheduler.getTelemetry().jobsCompleted).toBe(1);
    expect(scheduler.getTelemetry().warmCacheHits).toBe(2);

    // 페이지 편집 발생 -> rev-a2 예약 시 rev-a1 즉시 무효화 및 새 썸네일/프리플라이트 계산
    const editedRgba = makeSplitRgbaCanvas(800, 1200, [10, 200, 90, 255], [240, 220, 30, 255]);
    const jobV2 = makeBaseCutJob({ pageId: "ep1-cut1", revisionHash: "rev-a2", rgba: editedRgba });
    const second = await scheduler.schedulePage(jobV2);
    expect(second.status).toBe("completed");
    if (second.status !== "completed") throw new Error("expected completed");
    expect(second.result.cacheHit).toBe(false);
    expect(second.result.contentHash).not.toBe(first.result.contentHash);
    expect(Array.from(second.result.thumbnail.rgba.slice(0, 4))).toEqual([10, 200, 90, 255]);
    expect(scheduler.getWarmResult("ep1-cut1", "rev-a1")).toBeNull();

    // 명시적 무효화 확인
    expect(scheduler.invalidatePage("ep1-cut1")).toBe(1);
    expect(scheduler.getWarmResult("ep1-cut1", "rev-a2")).toBeNull();
  });

  it("FNV-1a 콘텐츠 해시 중복 제거로 동일 픽셀 컷의 다운샘플링을 생략하고, 바운드 LRU가 오래된 항목을 방출한다", async () => {
    const scheduler = new IdleThumbnailAndPreflightScheduler({
      maxCacheEntries: 2,
      yieldToIdle: async () => Promise.resolve(),
    });

    const sharedPixels = makeSplitRgbaCanvas(64, 96, [80, 90, 100, 255], [200, 180, 160, 255]);
    expect(computeFnv1a32(sharedPixels)).toBe(computeFnv1a32(new Uint8ClampedArray(sharedPixels)));
    expect(computeRgbaContentHash(sharedPixels, 64, 96)).toBe(computeRgbaContentHash(sharedPixels, 64, 96));

    const p1 = await scheduler.schedulePage(makeBaseCutJob({
      pageId: "p1", revisionHash: "r1", width: 64, height: 96, rgba: sharedPixels, thumbnailWidth: 16, thumbnailHeight: 24,
    }));
    const p2 = await scheduler.schedulePage(makeBaseCutJob({
      pageId: "p2", revisionHash: "r1", width: 64, height: 96, rgba: new Uint8ClampedArray(sharedPixels), thumbnailWidth: 16, thumbnailHeight: 24,
    }));

    expect(p1.status).toBe("completed");
    expect(p2.status).toBe("completed");
    if (p1.status !== "completed" || p2.status !== "completed") throw new Error("expected completed");
    expect(p1.result.thumbnail.deduplicated).toBe(false);
    expect(p2.result.thumbnail.deduplicated).toBe(true);
    expect(p2.result.contentHash).toBe(p1.result.contentHash);
    expect(Array.from(p2.result.thumbnail.rgba)).toEqual(Array.from(p1.result.thumbnail.rgba));
    expect(scheduler.getTelemetry().thumbnailContentDedupHits).toBe(1);

    // p1을 웜 조회해 LRU 최근 사용으로 승격한 뒤 p3를 추가하면 p2가 방출되어야 한다.
    expect(scheduler.getWarmResult("p1", "r1")).not.toBeNull();
    const diffPixels = makeSplitRgbaCanvas(64, 96, [12, 34, 56, 255], [78, 90, 12, 255]);
    await scheduler.schedulePage(makeBaseCutJob({
      pageId: "p3", revisionHash: "r1", width: 64, height: 96, rgba: diffPixels, thumbnailWidth: 16, thumbnailHeight: 24,
    }));

    expect(scheduler.getWarmResult("p1", "r1")).not.toBeNull();
    expect(scheduler.getWarmResult("p2", "r1")).toBeNull();
    expect(scheduler.getWarmResult("p3", "r1")).not.toBeNull();
    expect(scheduler.getTelemetry().lruEvictions).toBe(1);
  });

  it("maxSliceMs(4.0ms) 유휴 슬라이스 양보, 우선순위 선점, 진행 중 리비전 대체 및 AbortSignal 취소를 준수한다", async () => {
    let virtualClockMs = 0;
    const yieldLog: IdleSliceYieldContext[] = [];
    const yieldGate: { release: (() => void) | null; pauseNext: boolean } = {
      release: null,
      pauseNext: false,
    };

    const scheduler = new IdleThumbnailAndPreflightScheduler({
      maxSliceMs: 4.0,
      rowsPerChunk: 16,
      now: () => {
        virtualClockMs += 2.2;
        return virtualClockMs;
      },
      yieldToIdle: async (ctx) => {
        yieldLog.push(ctx);
        if (yieldGate.pauseNext) {
          yieldGate.pauseNext = false;
          await new Promise<void>((resolve) => {
            yieldGate.release = resolve;
          });
        }
      },
    });

    // 1) low 우선순위와 high 우선순위를 같은 틱에 넣으면 high가 먼저 완료된다.
    const completionOrder: string[] = [];
    const smallRgba = makeSplitRgbaCanvas(64, 128, [255, 200, 100, 255], [40, 80, 120, 255]);
    const lowPromise = scheduler.schedulePage(makeBaseCutJob({
      pageId: "cut-low", revisionHash: "r1", width: 64, height: 128, rgba: smallRgba,
      thumbnailWidth: 16, thumbnailHeight: 64, priority: "low",
    })).then((res) => { completionOrder.push("low"); return res; });

    const highPromise = scheduler.schedulePage(makeBaseCutJob({
      pageId: "cut-high", revisionHash: "r1", width: 64, height: 128,
      rgba: makeSplitRgbaCanvas(64, 128, [10, 20, 30, 255], [40, 50, 60, 255]),
      thumbnailWidth: 16, thumbnailHeight: 64, priority: "high",
    })).then((res) => { completionOrder.push("high"); return res; });

    const [lowRes, highRes] = await Promise.all([lowPromise, highPromise]);
    expect(highRes.status).toBe("completed");
    expect(lowRes.status).toBe("completed");
    expect(completionOrder).toEqual(["high", "low"]);
    expect(yieldLog.length).toBeGreaterThanOrEqual(4);
    expect(highRes.status === "completed" && highRes.result.slicesUsed).toBeGreaterThanOrEqual(2);

    // 2) 진행 중인 작업이 새 리비전으로 대체(superseded)되고 AbortSignal로 취소되는 동작 검증
    yieldGate.pauseNext = true;
    const ac = new AbortController();
    const abortedJob = scheduler.schedulePage(makeBaseCutJob({
      pageId: "cut-abort", revisionHash: "r1", width: 64, height: 128,
      rgba: makeSplitRgbaCanvas(64, 128, [9, 9, 9, 255], [8, 8, 8, 255]),
      thumbnailWidth: 16, thumbnailHeight: 64, signal: ac.signal,
    }));
    const supersededJob = scheduler.schedulePage(makeBaseCutJob({
      pageId: "cut-edit", revisionHash: "r1", width: 64, height: 128,
      rgba: makeSplitRgbaCanvas(64, 128, [1, 2, 3, 255], [4, 5, 6, 255]),
      thumbnailWidth: 16, thumbnailHeight: 64,
    }));

    // 첫 양보 지점까지 대기
    await vi.waitFor(() => { expect(yieldGate.release).not.toBeNull(); });
    ac.abort();
    const newerJob = scheduler.schedulePage(makeBaseCutJob({
      pageId: "cut-edit", revisionHash: "r2", width: 64, height: 128,
      rgba: makeSplitRgbaCanvas(64, 128, [70, 80, 90, 255], [10, 20, 30, 255]),
      thumbnailWidth: 16, thumbnailHeight: 64,
    }));

    yieldGate.release?.();
    const [abortedOutcome, supersededOutcome, newerOutcome] = await Promise.all([
      abortedJob,
      supersededJob,
      newerJob,
    ]);
    expect(abortedOutcome).toEqual({ status: "cancelled", pageId: "cut-abort", revisionHash: "r1", reason: "aborted" });
    expect(supersededOutcome).toEqual({ status: "cancelled", pageId: "cut-edit", revisionHash: "r1", reason: "superseded" });
    expect(newerOutcome.status).toBe("completed");
    scheduler.dispose();
  });
});
