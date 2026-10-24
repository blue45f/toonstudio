// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioCc0AssetLibraryPanel } from "./StudioCc0AssetLibraryPanel";
import { parseStudioCc0Catalog, studioCc0AssetUrl } from "./studio-cc0-asset-delivery";

const loadCatalog = vi.hoisted(() => vi.fn());
vi.mock("./studio-cc0-asset-delivery", async (importOriginal) => ({
  ...await importOriginal<typeof import("./studio-cc0-asset-delivery")>(),
  loadStudioCc0Catalog: loadCatalog,
}));

const catalog = parseStudioCc0Catalog(JSON.parse(readFileSync(resolve(
  process.cwd(), "apps/web/public/assets/studio/cc0-20260906/manifest.json",
), "utf8"))).filter(({ id }) => [
  "polyhaven-cassette-player",
  "polyhaven-brass-goblets",
  "polyhaven-korean-fire-extinguisher-01",
  "polyhaven-plastic-monobloc-chair-01",
].includes(id));
let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  loadCatalog.mockResolvedValue(catalog);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root.render(createElement(StudioCc0AssetLibraryPanel)); });
  const details = host.querySelector("details")!;
  await act(async () => {
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
  });
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  loadCatalog.mockReset();
  vi.unstubAllGlobals();
});

describe("CC0 original and optimized download controls", () => {
  it("offers distinct immutable downloads only on the three original-enabled cards", () => {
    expect(host.querySelectorAll("[data-cc0-asset-id]")).toHaveLength(4);
    for (const asset of catalog) {
      const card = host.querySelector(`[data-cc0-asset-id="${asset.id}"]`)!;
      const downloads = [...card.querySelectorAll<HTMLAnchorElement>("a[download]")];
      if (!asset.original) {
        expect(downloads).toHaveLength(1);
        expect(downloads[0]!.textContent).toBe("GLB 받기");
        continue;
      }
      expect(downloads).toHaveLength(2);
      expect(downloads[0]!.textContent).toBe("경량본 받기");
      expect(downloads[0]!.getAttribute("href")).toBe(studioCc0AssetUrl(asset.path));
      expect(downloads[0]!.download).toBe(`${asset.id}.glb`);
      expect(downloads[1]!.textContent).toBe("고품질 원본 받기");
      expect(downloads[1]!.getAttribute("href")).toBe(studioCc0AssetUrl(asset.original.path));
      expect(downloads[1]!.download).toBe(`${asset.id}-original.glb`);
      expect(card.textContent).toContain("144MiB");
      expect(card.textContent).toContain("고품질 모드를 선택한 뒤");
      expect(card.textContent).toContain("다운로드만으로 모드가 바뀌지는 않습니다");
    }
  });

  it("does not claim a quality improvement from lossless cassette deduplication", () => {
    const card = host.querySelector('[data-cc0-asset-id="polyhaven-cassette-player"]')!;
    expect(card.textContent).toContain("두 파일의 화질은 같습니다");
    expect(card.textContent).toContain("중복 텍스처 때문에 메모리를 더 사용합니다");
    const goblets = host.querySelector('[data-cc0-asset-id="polyhaven-brass-goblets"]')!;
    expect(goblets.textContent).toContain("색상·노멀·형상을 유지하고 ORM 텍스처만 줄였습니다");
    expect(goblets.textContent).toContain("다운로드 크기는 더 클 수 있습니다");
  });

  it("uses the same two download links inside the enlarged preview", async () => {
    const asset = catalog.find(({ id }) => id === "polyhaven-brass-goblets")!;
    const previewButton = host.querySelector<HTMLButtonElement>(`[data-cc0-asset-id="${asset.id}"] button`)!;
    await act(async () => { previewButton.click(); });
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    const downloads = [...dialog.querySelectorAll<HTMLAnchorElement>("a[download]")];
    expect(downloads.map((anchor) => anchor.getAttribute("href"))).toEqual([
      studioCc0AssetUrl(asset.path),
      studioCc0AssetUrl(asset.original!.path),
    ]);
    expect(dialog.textContent).toContain("다운로드만으로 모드가 바뀌지는 않습니다");
  });

  it("inserts the verified rendered 384x384 PNG preview of a 3D model onto the 2D canvas", async () => {
    const asset = catalog.find(({ id }) => id === "polyhaven-plastic-monobloc-chair-01")!;
    const pngBytes = readFileSync(resolve(
      process.cwd(),
      "apps/web/public",
      studioCc0AssetUrl(asset.previewPath!).slice(1),
    ));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(pngBytes), {
      status: 200,
      headers: { "content-length": String(pngBytes.byteLength) },
    })));
    const onUseAsset = vi.fn(() => true);
    await act(async () => {
      root.render(createElement(StudioCc0AssetLibraryPanel, { onUseAsset }));
    });
    const insertButton = host.querySelector<HTMLButtonElement>(`[data-cc0-insert-preview="${asset.id}"]`)!;
    expect(insertButton).not.toBeNull();
    expect(insertButton.textContent).toContain("2D 미리보기 삽입");
    await act(async () => {
      insertButton.click();
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 30));
    });
    expect(onUseAsset).toHaveBeenCalledTimes(1);
    const inserted = (onUseAsset.mock.calls[0] as unknown as [Record<string, unknown>])[0]!;
    expect(inserted.id).toBe(`cc0-preview:${asset.id}`);
    expect(inserted.width).toBe(640);
    expect(inserted.height).toBeGreaterThanOrEqual(384);
    expect(String(inserted.dataUrl)).toMatch(/^data:image\/png;base64,/u);
    expect(inserted.rights).toMatchObject({
      licenseId: "CC0-1.0",
      rightsConfirmed: true,
    });
  });

  it("places a CC0 3D model directly into the 3D scene when onPlaceModelIn3dScene is provided", async () => {
    const asset = catalog.find(({ id }) => id === "polyhaven-plastic-monobloc-chair-01")!;
    const onUseAsset = vi.fn(() => true);
    const onPlaceModelIn3dScene = vi.fn(() => true);
    await act(async () => {
      root.render(createElement(StudioCc0AssetLibraryPanel, { onUseAsset, onPlaceModelIn3dScene }));
    });
    const placeButton = host.querySelector<HTMLButtonElement>(`[data-cc0-place-3d="${asset.id}"]`)!;
    expect(placeButton).not.toBeNull();
    expect(placeButton.textContent).toBe("3D 씬에 배치");
    await act(async () => {
      placeButton.click();
    });
    expect(onPlaceModelIn3dScene).toHaveBeenCalledTimes(1);
    const [instance, passedAsset] = (onPlaceModelIn3dScene.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>]);
    expect(passedAsset.id).toBe(asset.id);
    expect(instance).toMatchObject({
      id: `cc0_3d_${asset.id}_1`,
      modelUrl: studioCc0AssetUrl(asset.path),
      visible: true,
    });
  });
});
