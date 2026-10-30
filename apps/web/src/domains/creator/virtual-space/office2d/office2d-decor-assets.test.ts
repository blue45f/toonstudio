// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioBuildPlacedFixture } from "../studio-virtual-space-build-mode-vitality";
import { studioVirtualDecorationPreset, type StudioVirtualDecorationState } from "../studio-virtual-space-customization";
import { studioOfficeEnvironmentManifest } from "../studio-virtual-space-office-environments";
import { createOffice2dDecorAssetLoader } from "./office2d-decor-assets";
import { office2dSceneFor, office2dSceneSpriteKeys } from "./office2d-scene";
import { office2dObjectUrl, Office2dSpriteStore, type Office2dImageSource } from "./office2d-sprite-catalog";
import { office2dPlacedDecorSpriteKeys } from "./office2d-stage-extensions";

afterEach(() => vi.useRealTimers());

function fixture(kind: StudioBuildPlacedFixture["kind"]): StudioBuildPlacedFixture {
  return { objectId: `fixture:${kind}`, kind, point: { x: 100, y: 200 },
    anchor: { x: 100, y: 146, baseY: 200 }, labelKo: "테스트 고정물", labelEn: "Test fixture" };
}

function deferredImage() {
  let complete: ((image: Office2dImageSource) => void) | undefined;
  const promise = new Promise<Office2dImageSource>((resolve) => { complete = resolve; });
  return { promise, resolve(image: Office2dImageSource) {
    if (!complete) throw new Error("이미지 promise가 준비되지 않았습니다.");
    complete(image);
  } };
}

describe("Office2D 꾸미기 이미지 준비", () => {
  it("장면 소품이 없는 숲 사무실에서도 기본 장식 7개에 필요한 원본 3개를 처음부터 불러온다", async () => {
    const manifest = studioOfficeEnvironmentManifest("forest-atelier");
    if (!manifest) throw new Error("숲 사무실 manifest가 없습니다.");
    expect(office2dSceneSpriteKeys(office2dSceneFor(manifest))).toEqual([]);
    const decorations = studioVirtualDecorationPreset("creator-garden");
    expect(decorations.placements).toHaveLength(7);
    expect(office2dPlacedDecorSpriteKeys(decorations, undefined)).toEqual(["plant-olive", "plant-monstera", "floor-lamp"]);

    const loadImage = vi.fn(async (_url: string) => ({ width: 128, height: 192 }));
    const store = new Office2dSpriteStore(loadImage);
    const invalidate = vi.fn();
    const loader = createOffice2dDecorAssetLoader(store, 6000, invalidate);
    expect(await loader.load(decorations, undefined)).toBe(3);
    for (const key of ["plant-olive", "plant-monstera", "floor-lamp"] as const) {
      expect(loadImage).toHaveBeenCalledWith(office2dObjectUrl(key));
      expect(store.get(office2dObjectUrl(key))).toEqual({ width: 128, height: 192 });
    }
    expect(loadImage).toHaveBeenCalledTimes(3);
    expect(invalidate).toHaveBeenCalledTimes(3);
    loader.dispose();
  });

  it("입장 후 추가한 소파·화이트보드만 이어 받고 중복 장식·같은 고정물은 다시 요청하지 않는다", async () => {
    const loadImage = vi.fn(async (_url: string) => ({ width: 120, height: 100 }));
    const store = new Office2dSpriteStore(loadImage);
    const invalidate = vi.fn();
    const loader = createOffice2dDecorAssetLoader(store, 6000, invalidate);
    const garden = studioVirtualDecorationPreset("creator-garden");
    await loader.load(garden, undefined);
    const changed: StudioVirtualDecorationState = { ...garden, placements: [...garden.placements,
      { id: "new-sofa", type: "sofa", x: 500, y: 500, rotation: 0, scale: 1 },
      { id: "second-sofa", type: "sofa", x: 650, y: 500, rotation: 0, scale: 1 },
    ] };
    const fixtures = [fixture("whiteboard"), fixture("light-switch")];
    const first = loader.load(changed, fixtures);
    const repeated = loader.load(changed, fixtures);
    expect(await first).toBe(2);
    expect(await repeated).toBe(0);
    expect(loadImage.mock.calls.map(([url]) => url)).toEqual([
      office2dObjectUrl("plant-olive"), office2dObjectUrl("plant-monstera"), office2dObjectUrl("floor-lamp"),
      office2dObjectUrl("sofa"), office2dObjectUrl("kanban-board"),
    ]);
    expect(store.get(office2dObjectUrl("sofa"))).not.toBeNull();
    expect(store.get(office2dObjectUrl("kanban-board"))).not.toBeNull();
    expect(invalidate).toHaveBeenCalledTimes(5);
    expect(await loader.load(studioVirtualDecorationPreset("minimal"), [])).toBe(0);
    expect(await loader.load(changed, fixtures)).toBe(0);
    expect(loadImage).toHaveBeenCalledTimes(5);
    loader.dispose();
  });

  it("실패하거나 비어 있는 원본은 폴백을 유지하고 꾸미기 재렌더로 자동 재시도하지 않는다", async () => {
    const loadImage = vi.fn((url: string) => url === office2dObjectUrl("floor-lamp")
      ? Promise.reject(new Error("이미지 로딩 실패")) : Promise.resolve({ width: 0, height: 0 }));
    const store = new Office2dSpriteStore(loadImage);
    const invalidate = vi.fn();
    const loader = createOffice2dDecorAssetLoader(store, 6000, invalidate);
    const garden = studioVirtualDecorationPreset("creator-garden");
    expect(await loader.load(garden, undefined)).toBe(0);
    expect(await loader.load(garden, undefined)).toBe(0);
    expect(loadImage).toHaveBeenCalledTimes(3);
    expect(store.get(office2dObjectUrl("floor-lamp"))).toBeNull();
    expect(invalidate).not.toHaveBeenCalled();
    loader.dispose();
  });

  it("초기 제한 뒤 늦게 도착한 고정물 이미지도 기존 스테이지를 갱신한다", async () => {
    vi.useFakeTimers();
    const pending = deferredImage();
    const store = new Office2dSpriteStore(() => pending.promise);
    const invalidate = vi.fn();
    const loader = createOffice2dDecorAssetLoader(store, 6000, invalidate);
    const ready = loader.load(undefined, [fixture("youtube")]);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await ready).toBe(0);
    expect(invalidate).not.toHaveBeenCalled();
    pending.resolve({ width: 200, height: 120 });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.get(office2dObjectUrl("review-screen"))).toEqual({ width: 200, height: 120 });
    expect(invalidate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    loader.dispose();
  });

  it("월드 해제 뒤의 도착은 이전 렌더러를 갱신하지 않고 후속 요청도 시작하지 않는다", async () => {
    const pending = deferredImage();
    const loadImage = vi.fn(() => pending.promise);
    const store = new Office2dSpriteStore(loadImage);
    const invalidate = vi.fn();
    const loader = createOffice2dDecorAssetLoader(store, 6000, invalidate);
    const ready = loader.load(undefined, [fixture("youtube")]);
    loader.dispose();
    expect(await loader.load(studioVirtualDecorationPreset("creator-garden"), undefined)).toBe(0);
    pending.resolve({ width: 200, height: 120 });
    expect(await ready).toBe(1);
    expect(loadImage).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
