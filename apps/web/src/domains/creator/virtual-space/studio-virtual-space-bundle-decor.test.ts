// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { office2dSceneFor } from "./office2d/office2d-scene";
import { Office2dRuntime, type Office2dRuntimeCallbacks } from "./office2d/office2d-runtime";
import { Office2dSpriteStore } from "./office2d/office2d-sprite-catalog";
import { studioVirtualPlaceBundleDecor } from "./studio-virtual-space-bundle-decor";
import { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import { nearestInteraction } from "./studio-virtual-space-phaser-canvas-model";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";
import type { StudioVirtualSpaceSnapshot } from "./studio-virtual-space-presence";
import { studioWorldCollisionRects, studioWorldInteractions, validateStudioWorldManifest, type StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { findStudioWorldPath } from "./studio-virtual-space-world-pathfinding";

const PLACES = ["garden", "tree-library", "creator-cafe"] as const;
const isBundle = (id: string) => id.includes("-bundle-park-");

function simulate(manifest: StudioVirtualSpaceWorldManifest) {
  let clock = 0;
  const bridge = new StudioVirtualSpaceEngineBridge();
  const onInteract = vi.fn();
  const callbacks = {
    onLocalState: vi.fn(), onInteract, onNearbyInteractionChange: vi.fn(), onPeerSelect: vi.fn(), onCancelFollow: vi.fn(),
  } satisfies Office2dRuntimeCallbacks;
  const snapshot: StudioVirtualSpaceSnapshot = {
    self: { x: 480, y: 540, zoneId: manifest.rooms[0]?.id ?? "", facing: "up", activity: "available", moving: false, avatarIndex: 1 },
    peers: [], nearbyPeers: [], selfReaction: null, peerReactions: [], chatMessages: [], chatBubbles: [], selfChatBubble: null,
    peerTyping: [], peerImpacts: [], objectStates: [], peerFixtures: [], direct: false,
  };
  const runtime = new Office2dRuntime({ manifest, bridge, selfIdentity: "decor-test", getSnapshot: () => snapshot,
    getSelfName: () => "나", getSeatedActors: () => [], getCallbacks: () => callbacks, getLanguage: () => "ko",
    getReducedMotion: () => true, clock: () => clock, ambientCoworkers: false,
    host: { createSurface: () => null, image: () => null },
  });
  runtime.setViewport(390, 600);
  runtime.start();
  const step = (frames: number) => {
    for (let frame = 0; frame < frames; frame += 1) { clock += 1000 / 60; runtime.frame(1 / 60); }
  };
  runtime.keyDown("KeyW");
  step(50);
  runtime.keyUp("KeyW");
  step(10);
  const walked = runtime.debugState().self;
  bridge.requestMove({ x: 480, y: 312 });
  step(180);
  bridge.requestInteract();
  step(1);
  return { walked, arrived: runtime.debugState().self, interactions: onInteract.mock.calls };
}

describe("검수된 CC0 고정 장소 장식", () => {
  it("세 장소만 고유 imageUrl 2개를 전달하고 HQ·custom·다른 장소에는 추가하지 않는다", async () => {
    const catalog = JSON.parse(readFileSync(resolve("apps/web/public/assets/virtual-studio/bundle-decor-v1/manifest.json"), "utf8")) as {
      readonly assets: readonly { readonly id: string; readonly path: string }[];
    };
    expect(studioVirtualPlaceBundleDecor("toon-hq")).toEqual([]);
    expect(studioVirtualPlaceBundleDecor("personal-atelier")).toEqual([]);
    const allUrls = new Set<string>();
    for (const place of PLACES) {
      const manifest = studioVirtualPlaceWorldManifest(place);
      expect(validateStudioWorldManifest(manifest)).toEqual([]);
      const decor = manifest.props.filter((prop) => isBundle(prop.id));
      expect(decor).toHaveLength(2);
      const scene = office2dSceneFor(manifest);
      const urls = scene.objects.filter((object) => isBundle(object.id)).map((object) => object.imageUrl ?? "");
      expect(new Set(urls).size).toBe(2);
      const load = vi.fn(async () => ({ width: 772, height: 1073 }));
      const store = new Office2dSpriteStore(load);
      await Promise.all([store.loadAll(urls, 1000), store.loadAll(urls, 1000)]);
      for (let frame = 0; frame < 180; frame += 1) urls.forEach((url) => store.get(url));
      expect(load).toHaveBeenCalledTimes(2);
      for (const prop of decor) {
        expect(prop).toMatchObject({ kind: "decor", depth: "y-sort" });
        expect(prop.collider).toBeUndefined();
        expect(prop.action).toBeUndefined();
        expect(prop.assetKey).toMatch(/^bundle-decor-v1-park-/u);
        expect(prop.assetUrl).toMatch(/^\/assets\/virtual-studio\/bundle-decor-v1\/park-[a-z]+\.webp$/u);
        expect(catalog.assets.some((asset) => prop.assetUrl === `/assets/virtual-studio/bundle-decor-v1/${asset.path}`
          && prop.assetKey === `bundle-decor-v1-${asset.id}`)).toBe(true);
        const object = scene.objects.find((candidate) => candidate.id === prop.id);
        expect(object).toMatchObject({ sprite: null, imageUrl: prop.assetUrl, footprint: null, interactionId: null, layer: "y-sort" });
        allUrls.add(prop.assetUrl ?? "");
      }
    }
    expect(allUrls.size).toBe(3);
  });

  it.each(PLACES)("%s의 충돌·작업대 선택·경로와 실제 입력 이동을 보존한다", (place) => {
    const manifest = studioVirtualPlaceWorldManifest(place);
    const before = { ...manifest, props: manifest.props.filter((prop) => !isBundle(prop.id)) };
    expect(studioWorldCollisionRects(manifest)).toEqual(studioWorldCollisionRects(before));
    expect(studioWorldInteractions(manifest)).toEqual(studioWorldInteractions(before));
    const target = { x: 480, y: 312 };
    const path = findStudioWorldPath(manifest, { x: 480, y: 540 }, target);
    expect(path.length).toBeGreaterThan(0);
    expect(path).toEqual(findStudioWorldPath(before, { x: 480, y: 540 }, target));
    expect(nearestInteraction(studioWorldInteractions(manifest), target)?.id).toBe(`${place}-primary-action`);
    const baseline = simulate(before);
    const decorated = simulate(manifest);
    expect(decorated).toEqual(baseline);
    expect(decorated.walked.y).toBeLessThan(500);
    expect(decorated.interactions.some((call) => call[0]?.id === `${place}-primary-action`)).toBe(true);
  });
});
