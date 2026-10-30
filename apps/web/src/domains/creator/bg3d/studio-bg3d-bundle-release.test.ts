import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getBuildFixedStudioBg3dBundleRelease, requireStudioBg3dBundleRelease } from "./studio-bg3d-bundle-release";
import { releaseFixture } from "./studio-bg3d-bundle-release.test-fixture";
import { findStudioBg3dBundleAsset, getStudioBg3dBundleThemePacksPublicationRevision, loadStudioBg3dBundleDeployAvailability,
  loadStudioBg3dBundleThemePacks, parseStudioBg3dBundleThemePacks, resetStudioBg3dBundleThemePacksCache,
  STUDIO_BG3D_BUNDLE_THEME_PACKS_URL, STUDIO_BG3D_BUNDLE_DEPLOY_INDEX_URL } from "./studio-bg3d-bundle-theme-packs";

vi.mock("./studio-bg3d-bundle-release", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-bg3d-bundle-release")>();
  return { ...actual, getBuildFixedStudioBg3dBundleRelease: vi.fn() };
});

beforeEach(() => {
  resetStudioBg3dBundleThemePacksCache();
  vi.stubGlobal("crypto", webcrypto);
  vi.mocked(getBuildFixedStudioBg3dBundleRelease).mockReturnValue(releaseFixture().release);
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); resetStudioBg3dBundleThemePacksCache(); });

describe("빌드에 고정한 번들 catalog/index 원문 결합", () => {
  it("커밋 대상의 실제 descriptor와 원문으로 기본 loader를 통과하고 역사 1,929개를 유지한다", async () => {
    const actual = await vi.importActual<typeof import("./studio-bg3d-bundle-release")>("./studio-bg3d-bundle-release");
    const release = actual.getBuildFixedStudioBg3dBundleRelease();
    vi.mocked(getBuildFixedStudioBg3dBundleRelease).mockReturnValue(release);
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url);
      if (![release.catalog.url, release.index.url].includes(path)) throw new Error("현재 발행 쌍 밖의 요청입니다.");
      const body = readFileSync(new URL("../../../../public" + path, import.meta.url));
      return new Response(Uint8Array.from(body).buffer, { headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetcher);
    const data = await loadStudioBg3dBundleThemePacks();
    expect(data.assets).toHaveLength(5229);
    expect(data.assets.reduce((sum, asset) => sum + asset.bytes, 0)).toBe(3985892748);
    expect(data.packs.find(pack => pack.catalogIds.includes("cbv1-030-nature-megapack-extended"))?.placeable).toBe(3300);
    const legacy = parseStudioBg3dBundleThemePacks(JSON.parse(readFileSync(new URL(
      "../../../../public/assets/3d/environments/bundle-v1/theme-packs.json", import.meta.url), "utf8")));
    expect(legacy.assets).toHaveLength(1929);
    const currentById = new Map(data.assets.map(asset => [asset.id, asset]));
    for (const asset of legacy.assets) expect(currentById.get(asset.id)).toEqual(asset);
    for (const id of ["cbv1-012-cemetery-statues", "cbv1-077-small-props-pack"]) {
      expect(data.packs.find(pack => pack.catalogIds.includes(id))?.rights?.status).toBe("licensed");
    }
    expect(await loadStudioBg3dBundleDeployAvailability(data)).toBe("available");
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([release.catalog.url, release.index.url]);
  });

  it("기본 호출이 실제 SHA가 맞는 새 catalog와 그 객체에 결합된 index를 요청한다", async () => {
    const fixture = releaseFixture();
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === fixture.release.catalog.url) return fixture.response("catalog");
      if (String(url) === fixture.release.index.url) return fixture.response("index");
      throw new Error("예상하지 않은 legacy 또는 다른 release 요청");
    });
    vi.stubGlobal("fetch", fetcher);
    const data = await loadStudioBg3dBundleThemePacks();
    expect(data.assets[0]?.id).toBe("cbv1-ingest-fixture-nature-leaf");
    expect(await loadStudioBg3dBundleDeployAvailability(data)).toBe("available");
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([fixture.release.catalog.url, fixture.release.index.url]);
    expect(fetcher).toHaveBeenCalledWith(fixture.release.catalog.url, expect.objectContaining({ cache: "force-cache", credentials: "same-origin", redirect: "error" }));
  });

  it("기본 경로는 검증한 같은 발행을 반복 파싱하지 않고 주입 포트와 명시 초기화는 재검증한다", async () => {
    const fixture = releaseFixture();
    const fetcher = vi.fn(async () => fixture.response("catalog"));
    vi.stubGlobal("fetch", fetcher);
    const first = await loadStudioBg3dBundleThemePacks();
    expect(await loadStudioBg3dBundleThemePacks()).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(loadStudioBg3dBundleThemePacks({ fetcher: async () => fixture.response("catalog",
      fixture.catalogText.replace("합성 자연", "변조 자연")) })).rejects.toThrow("SHA");
    expect(await loadStudioBg3dBundleThemePacks()).not.toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(2);
    resetStudioBg3dBundleThemePacksCache();
    await loadStudioBg3dBundleThemePacks();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("검증 캐시로 이전 선택에 복귀한 뒤 같은 후속 발행을 다시 요청해도 오래된 promise에 합치지 않는다", async () => {
    const first = releaseFixture(), second = releaseFixture("b".repeat(64));
    let finish: ((response: Response) => void) | undefined;
    const oldPending = new Promise<Response>(resolve => { finish = resolve; });
    let secondRequests = 0;
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === first.release.catalog.url) return first.response("catalog");
      if (String(url) === second.release.catalog.url) {
        secondRequests += 1;
        return secondRequests === 1 ? oldPending : second.response("catalog");
      }
      throw new Error("미등록 발행 요청입니다.");
    });
    vi.stubGlobal("fetch", fetcher);
    vi.mocked(getBuildFixedStudioBg3dBundleRelease).mockReturnValue(first.release);
    const original = await loadStudioBg3dBundleThemePacks();
    vi.mocked(getBuildFixedStudioBg3dBundleRelease).mockReturnValue(second.release);
    const oldRequest = loadStudioBg3dBundleThemePacks();
    vi.mocked(getBuildFixedStudioBg3dBundleRelease).mockReturnValue(first.release);
    expect(await loadStudioBg3dBundleThemePacks()).toBe(original);
    vi.mocked(getBuildFixedStudioBg3dBundleRelease).mockReturnValue(second.release);
    const current = await loadStudioBg3dBundleThemePacks();
    finish?.(second.response("catalog"));
    await oldRequest;
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(findStudioBg3dBundleAsset("cbv1-ingest-fixture-nature-leaf")).toEqual(current.assets[0]);
    expect(current.assets[0]?.sha256).toBe(`sha256:${"b".repeat(64)}`);
  });

  it("명시 포트의 최신 발행 뒤 기본 요청을 이전 세대의 진행 중 promise에 합치지 않는다", async () => {
    const first = releaseFixture(), second = releaseFixture("b".repeat(64));
    let finish: ((response: Response) => void) | undefined;
    const oldPending = new Promise<Response>(resolve => { finish = resolve; });
    let requests = 0;
    const fetcher = vi.fn(async () => {
      requests += 1;
      return requests === 1 ? oldPending : first.response("catalog");
    });
    vi.stubGlobal("fetch", fetcher);
    const oldRequest = loadStudioBg3dBundleThemePacks();
    await loadStudioBg3dBundleThemePacks({ release: second.release, fetcher: async () => second.response("catalog") });
    const currentRequest = loadStudioBg3dBundleThemePacks();
    finish?.(first.response("catalog"));
    const current = await currentRequest;
    await oldRequest;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(findStudioBg3dBundleAsset("cbv1-ingest-fixture-nature-leaf")).toEqual(current.assets[0]);
    expect(current.assets[0]?.sha256).toBe(`sha256:${"a".repeat(64)}`);
  });

  it("원문이 검증된 권리 A→B→A 발행도 이전 lease 세대로 돌아가지 않는다", async () => {
    const first = releaseFixture();
    const restricted = releaseFixture(undefined, {}, catalog => {
      const pack = catalog.packs[0];
      if (!pack) throw new Error("권리 ABA 회귀의 팩이 없습니다.");
      pack.rights.commercialUse = false;
    });
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      const fixture = String(url) === first.release.catalog.url ? first : restricted;
      return fixture.response("catalog");
    });
    vi.stubGlobal("fetch", fetcher);
    vi.mocked(getBuildFixedStudioBg3dBundleRelease).mockReturnValue(first.release);
    const original = await loadStudioBg3dBundleThemePacks();
    const revisionA = getStudioBg3dBundleThemePacksPublicationRevision();
    vi.mocked(getBuildFixedStudioBg3dBundleRelease).mockReturnValue(restricted.release);
    const denied = await loadStudioBg3dBundleThemePacks();
    const revisionB = getStudioBg3dBundleThemePacksPublicationRevision();
    expect(denied.packs[0]?.rights?.commercialUse).toBe(false);
    vi.mocked(getBuildFixedStudioBg3dBundleRelease).mockReturnValue(first.release);
    const restored = await loadStudioBg3dBundleThemePacks();
    expect(restored).toEqual(original);
    expect(revisionB).toBeGreaterThan(revisionA);
    expect(getStudioBg3dBundleThemePacksPublicationRevision()).toBeGreaterThan(revisionB);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("fetcher 주입만으로 기본 원문 검증을 생략하지 않으며 SHA 변조와 JSON-only 응답을 거부한다", async () => {
    const fixture = releaseFixture();
    await expect(loadStudioBg3dBundleThemePacks({
      fetcher: async () => fixture.response("catalog", fixture.catalogText.replace("합성 자연", "변조 자연")),
    })).rejects.toThrow("SHA");
    expect(findStudioBg3dBundleAsset("cbv1-ingest-fixture-nature-leaf")).toBeNull();
    await expect(loadStudioBg3dBundleThemePacks({ fetcher: async () => ({ ok: true, status: 200,
      json: async () => fixture.catalog }) })).rejects.toThrow("원문 응답");
  });

  it("명시 custom URL은 기존 JSON-only 계약을 유지한다", async () => {
    const fixture = releaseFixture();
    const data = await loadStudioBg3dBundleThemePacks({ url: "/custom-theme-packs.json",
      fetcher: async () => ({ ok: true, status: 200, json: async () => fixture.catalog }) });
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe(STUDIO_BG3D_BUNDLE_DEPLOY_INDEX_URL);
      return { ok: true, status: 200, json: async () => fixture.index };
    });
    expect(await loadStudioBg3dBundleDeployAvailability(data, { fetcher })).toBe("available");
  });

  it("원문 SHA가 맞아도 권리 거부와 실제 항목·합계 불일치를 우회하지 않는다", async () => {
    const invalid = [
      releaseFixture(undefined, {}, catalog => {
        const pack = catalog.packs[0];
        if (!pack) throw new Error("권리 거부 회귀의 팩이 없습니다.");
        pack.rights.serve = "hold";
      }),
      releaseFixture(undefined, {}, catalog => { catalog.totals.placeableAssets = 2; }),
    ];
    for (const fixture of invalid) {
      await expect(loadStudioBg3dBundleThemePacks({ release: fixture.release,
        fetcher: async () => fixture.response("catalog") })).rejects.toThrow();
    }
  });

  it("진행 중인 서로 다른 기본 release를 합치거나 늦은 이전 응답으로 새 색인을 덮지 않는다", async () => {
    const first = releaseFixture(), second = releaseFixture("b".repeat(64));
    let finish: ((response: Response) => void) | undefined;
    const pendingFirst = new Promise<Response>(resolve => { finish = resolve; });
    vi.mocked(getBuildFixedStudioBg3dBundleRelease).mockReturnValueOnce(first.release).mockReturnValueOnce(second.release);
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === first.release.catalog.url) return pendingFirst;
      if (String(url) === second.release.catalog.url) return second.response("catalog");
      throw new Error("미등록 release 요청");
    });
    vi.stubGlobal("fetch", fetcher);
    const oldRequest = loadStudioBg3dBundleThemePacks();
    const current = await loadStudioBg3dBundleThemePacks();
    finish?.(first.response("catalog"));
    expect((await oldRequest).assets[0]?.sha256).toBe(`sha256:${"a".repeat(64)}`);
    expect(current.assets[0]?.sha256).toBe(`sha256:${"b".repeat(64)}`);
    expect(findStudioBg3dBundleAsset("cbv1-ingest-fixture-nature-leaf")?.sha256).toBe(`sha256:${"b".repeat(64)}`);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("개수·바이트가 같은 두 release의 index를 섞지 않고 이전 객체도 자기 결합을 유지한다", async () => {
    const first = releaseFixture(), second = releaseFixture("b".repeat(64));
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      for (const fixture of [first, second]) {
        if (String(url) === fixture.release.catalog.url) return fixture.response("catalog");
        if (String(url) === fixture.release.index.url) return fixture.response("index");
      }
      throw new Error("미등록 release 요청");
    });
    const old = await loadStudioBg3dBundleThemePacks({ fetcher, release: first.release });
    const current = await loadStudioBg3dBundleThemePacks({ fetcher, release: second.release });
    expect(await loadStudioBg3dBundleDeployAvailability(old, { fetcher })).toBe("available");
    expect(await loadStudioBg3dBundleDeployAvailability(current, { fetcher })).toBe("available");
    expect(await loadStudioBg3dBundleDeployAvailability(old, { fetcher, url: second.release.index.url })).toBe("unavailable");
    expect(await loadStudioBg3dBundleDeployAvailability(old, { fetcher: async () => second.response("index") })).toBe("unavailable");
  });

  it("index 원문 해시가 맞아도 catalogSha256 또는 합계가 다르면 가용성을 열지 않는다", async () => {
    for (const patch of [{ catalogSha256: "d".repeat(64) }, { files: 2 }, { bytes: 129 }, { keyScheme: "path" }]) {
      const fixture = releaseFixture(undefined, patch);
      const data = await loadStudioBg3dBundleThemePacks({ release: fixture.release, fetcher: async () => fixture.response("catalog") });
      expect(await loadStudioBg3dBundleDeployAvailability(data, { fetcher: async () => fixture.response("index") })).toBe("unavailable");
    }
  });

  it("압축 전송 길이 대신 브라우저가 제공하는 압축 해제 원문 바이트를 검사한다", async () => {
    const fixture = releaseFixture();
    const response = fixture.response("catalog");
    response.headers.set("content-encoding", "br");
    response.headers.set("content-length", "17");
    const data = await loadStudioBg3dBundleThemePacks({ fetcher: async () => response });
    expect(data.totals.placeableAssets).toBe(1);
  });

  it("외부·encoded·query·fragment·잘못된 파일명 SHA·미지원 필드·크기를 거부한다", () => {
    const fixture = releaseFixture();
    for (const url of ["https://example.test/catalog.json", "//example.test/a.json", fixture.release.catalog.url + "?v=1",
      fixture.release.catalog.url + "#part", fixture.release.catalog.url.replace("theme-packs.", "%74heme-packs."),
      fixture.release.catalog.url.replace(fixture.release.catalog.sha256, "e".repeat(64)), STUDIO_BG3D_BUNDLE_THEME_PACKS_URL]) {
      expect(() => requireStudioBg3dBundleRelease({ ...fixture.release, catalog: { ...fixture.release.catalog, url } })).toThrow();
    }
    for (const patch of [{ bytes: 0 }, { bytes: 32 * 1024 * 1024 + 1 }, { sha256: "A".repeat(64) }, { future: true }]) {
      expect(() => requireStudioBg3dBundleRelease({ ...fixture.release, catalog: { ...fixture.release.catalog, ...patch } })).toThrow();
    }
    expect(() => requireStudioBg3dBundleRelease({ ...fixture.release, future: true })).toThrow();
  });
});
