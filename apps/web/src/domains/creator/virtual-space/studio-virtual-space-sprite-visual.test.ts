import { describe, expect, it, vi } from "vitest";
import { studioCharacterSkinForArtStyle, STUDIO_CHARACTER_SKINS } from "./studio-virtual-space-character-skins";
import {
  studioCharacterStaticAsset,
  studioCharacterVisualAssets,
  studioCharacterWarmAssets,
  type StudioCharacterAssetResidency,
} from "./studio-virtual-space-character-assets";
import { STUDIO_PEER_WARM_INTERVAL_MS } from "./studio-virtual-space-character-warmup";
import { createStudioSpriteVisualApplier } from "./studio-virtual-space-sprite-visual";

/** 스프라이트·장면 중 적용기가 건드리는 만큼만 흉내 낸 가짜. */
function harness(options: { sceneReady?: boolean } = {}) {
  const calls: Array<{ owner: string; keys: string[] }> = [];
  const released: string[] = [];
  const characterAssets = {
    use: vi.fn((owner: string, assets: readonly { readonly key: string }[]) => { calls.push({ owner, keys: assets.map((asset) => asset.key) }); }),
    release: vi.fn((owner: string) => { released.push(owner); }),
  } as unknown as StudioCharacterAssetResidency;
  const clock = { now: 10_000 };
  const scene = {
    time: clock,
    textures: { exists: () => false, get: () => ({ source: [], frameTotal: 0 }) },
    anims: { exists: () => false },
  };
  let ready = options.sceneReady ?? true;
  const fallbackSkin = STUDIO_CHARACTER_SKINS[0];
  if (!fallbackSkin) throw new Error("스킨이 없습니다");
  const applier = createStudioSpriteVisualApplier({
    scene: scene as never,
    isCancelled: () => false,
    isSceneReady: () => ready,
    characterAssets,
    reducedMotion: { matches: false } as MediaQueryList,
    artStyle: "webtoon",
    actorExpressionTextureKey: "actor-expressions",
    fallbackAsset: studioCharacterStaticAsset(fallbackSkin, "down"),
    identityRef: { current: "self-identity" },
    getSelfCustomSheetSkin: () => null,
  });
  function sprite(owner: string) {
    const data = new Map<string, unknown>([["assetOwner", owner], ["visualWidth", 92], ["visualHeight", 123]]);
    const fake = {
      texture: { key: "fallback" },
      frame: { name: "0", width: 160, height: 160 },
      anims: { isPlaying: false },
      scaleX: 1,
      scaleY: 1,
      getData: (key: string) => data.get(key),
      setData(key: string, value: unknown) { data.set(key, value); return fake; },
      stop() { return fake; },
      setTexture() { return fake; },
      setDisplaySize() { return fake; },
      setOrigin() { return fake; },
      setScale() { return fake; },
    };
    return fake;
  }
  const apply = (target: ReturnType<typeof sprite>, identity: string, avatarIndex = 0) =>
    applier.applyAvatarVisual(target as never, { avatarIndex }, "down", "idle", identity);
  return { calls, released, clock, sprite, apply, setReady: (value: boolean) => { ready = value; } };
}

describe("스프라이트 비주얼 적용기의 선적재", () => {
  const skin = studioCharacterSkinForArtStyle(STUDIO_CHARACTER_SKINS[0] ?? (() => { throw new Error("스킨이 없습니다"); })(), "webtoon");

  it("다른 참가자의 스프라이트는 보이는 그림과 별개로 네 방향 선적재를 한 번만 요청한다", () => {
    const h = harness();
    const peer = h.sprite("peer:p1");
    h.apply(peer, "p1");
    h.apply(peer, "p1");
    const warm = h.calls.filter((call) => call.owner === "peer:p1:warm");
    expect(warm).toHaveLength(1);
    expect(warm[0]?.keys).toEqual(studioCharacterWarmAssets(skin).map((asset) => asset.key));
    expect(h.calls.filter((call) => call.owner === "peer:p1")).toHaveLength(2);
    expect(h.calls.find((call) => call.owner === "peer:p1")?.keys).toEqual(studioCharacterVisualAssets(skin, "down", "idle").map((asset) => asset.key));
    expect(peer.getData("warmSkinKey")).toBe(skin.key);
  });

  it("장면이 준비되기 전에는 아무것도 요청하지 않고, 준비되면 그때 요청한다", () => {
    const h = harness({ sceneReady: false });
    const peer = h.sprite("peer:p1");
    h.apply(peer, "p1");
    expect(h.calls).toEqual([]);
    expect(peer.getData("warmSkinKey")).toBeUndefined();
    h.setReady(true);
    h.apply(peer, "p1");
    expect(h.calls.some((call) => call.owner === "peer:p1:warm")).toBe(true);
  });

  it("한꺼번에 나타난 서로 다른 스킨의 참가자는 간격을 두고 차례로 선적재하며 기다리던 쪽은 다음 프레임에 다시 시도한다", () => {
    const h = harness();
    const first = h.sprite("peer:p1");
    const second = h.sprite("peer:p2");
    h.apply(first, "p1", 0);
    h.apply(second, "p2", 1);
    expect(h.calls.filter((call) => call.owner.endsWith(":warm")).map((call) => call.owner)).toEqual(["peer:p1:warm"]);
    expect(second.getData("warmSkinKey")).toBeUndefined();
    h.clock.now += STUDIO_PEER_WARM_INTERVAL_MS;
    h.apply(second, "p2", 1);
    expect(h.calls.filter((call) => call.owner.endsWith(":warm")).map((call) => call.owner)).toEqual(["peer:p1:warm", "peer:p2:warm"]);
  });

  it("내 캐릭터는 예전처럼 self:warm으로 선적재하고 NPC는 선적재하지 않는다", () => {
    const h = harness();
    h.apply(h.sprite("self"), "self-identity");
    h.apply(h.sprite("npc:concierge"), "concierge");
    const owners = h.calls.map((call) => call.owner);
    expect(owners).toContain("self:warm");
    expect(owners).not.toContain("npc:concierge:warm");
    expect(owners).toContain("npc:concierge");
  });
});
