import { describe, expect, it } from "vitest";
import { STUDIO_VIRTUAL_ART_STYLE_KEYS } from "./studio-virtual-space-art-style";
import {
  STUDIO_PEER_WARM_MAX_BYTES,
  StudioCharacterAssetResidency,
  studioCharacterVisualAssets,
  studioCharacterWarmAssets,
  studioCharacterWarmBytes,
  studioCharacterWarmKind,
  studioCharacterWarmOwner,
  type StudioCharacterTextureBackend,
} from "./studio-virtual-space-character-assets";
import { STUDIO_CHARACTER_SKINS, studioCharacterSkinForArtStyle, type StudioCharacterSkin } from "./studio-virtual-space-character-skins";
import { STUDIO_PEER_WARM_INTERVAL_MS, StudioCharacterWarmup } from "./studio-virtual-space-character-warmup";

function skinByKey(key: string): StudioCharacterSkin {
  const skin = STUDIO_CHARACTER_SKINS.find((item) => item.key === key);
  if (!skin) throw new Error(`스킨이 없습니다: ${key}`);
  return skin;
}
/** 기본 스타일 팩의 가벼운 스킨. */
const pink = studioCharacterSkinForArtStyle(skinByKey("pink"), "sky-island");
const silver = studioCharacterSkinForArtStyle(skinByKey("silver"), "sky-island");
/** 방향마다 1254×1254 네이티브 시트를 쓰는 무거운 스킨. */
const heavy = skinByKey("imagegen25");
/** 방향 네 개가 한 장의 시트를 쓰는 픽셀 스킨(선적재로 새로 올라오는 텍스처가 없다). */
const pixel = (() => {
  const skin = STUDIO_CHARACTER_SKINS.find((item) => item.pixelArt);
  if (!skin) throw new Error("픽셀 스킨이 없습니다");
  return skin;
})();

describe("선적재 대상 구분", () => {
  it("내 캐릭터와 다른 참가자만 대상이고 NPC·배경 배우·기본 그림은 아니다", () => {
    expect(studioCharacterWarmKind("self")).toBe("self");
    expect(studioCharacterWarmKind("peer:abc")).toBe("peer");
    for (const owner of ["npc:concierge", "ambient:npc", "fallback", "", "peerless", "self:warm"]) expect(studioCharacterWarmKind(owner), owner).toBeNull();
  });

  it("선적재분 소유자 이름은 소유자 뒤에 :warm을 붙인다", () => {
    expect(studioCharacterWarmOwner("self")).toBe("self:warm");
    expect(studioCharacterWarmOwner("peer:abc")).toBe("peer:abc:warm");
  });
});

describe("선적재 크기 추정", () => {
  it.each(STUDIO_VIRTUAL_ART_STYLE_KEYS)("%s 스타일 팩의 기본 스킨은 다른 참가자 예산 안이다", (artStyle) => {
    for (const key of ["pink", "silver", "dark", "purple"]) {
      const bytes = studioCharacterWarmBytes(studioCharacterSkinForArtStyle(skinByKey(key), artStyle));
      expect(bytes, `${artStyle} ${key}`).toBeGreaterThan(0);
      expect(bytes, `${artStyle} ${key}`).toBeLessThanOrEqual(STUDIO_PEER_WARM_MAX_BYTES);
    }
  });

  it("어느 방향에서나 이미 올라와 있는 표정 시트는 선적재 때문에 늘어나지 않으므로 추정에서 뺀다", () => {
    // 기본 스킨은 표정 시트(드로잉 원본 크기)를 항상 올려 두지만 선적재 추정은 걷기 시트와 다른 방향 정지 그림만 센다.
    expect(studioCharacterVisualAssets(pink, "down", "idle").length).toBeGreaterThan(1);
    expect(studioCharacterWarmBytes(pink)).toBeLessThan(4 * 1024 * 1024);
  });

  it("방향마다 큰 시트를 받아야 하는 스킨은 예산을 넘는다", () => {
    expect(studioCharacterWarmBytes(heavy)).toBeGreaterThan(STUDIO_PEER_WARM_MAX_BYTES);
  });

  it("방향 네 개가 시트 한 장을 나눠 쓰는 스킨은 새로 올라오는 텍스처가 없다", () => {
    expect(studioCharacterWarmBytes(pixel)).toBe(0);
  });
});

describe("StudioCharacterWarmup", () => {
  function recorder() {
    const calls: Array<{ kind: "use" | "release"; owner: string; keys: readonly string[] }> = [];
    const residency = {
      use: (owner: string, assets: readonly { readonly key: string }[]) => { calls.push({ kind: "use", owner, keys: assets.map((asset) => asset.key) }); },
      release: (owner: string) => { calls.push({ kind: "release", owner, keys: [] }); },
    };
    return { calls, warmup: new StudioCharacterWarmup(residency, STUDIO_PEER_WARM_INTERVAL_MS) };
  }
  const warmKeys = (skin: StudioCharacterSkin) => studioCharacterWarmAssets(skin).map((asset) => asset.key);

  it("내 캐릭터는 스킨이 정해지면 한 번만 선적재하고 같은 스킨으로는 다시 요청하지 않는다", () => {
    const { calls, warmup } = recorder();
    expect(warmup.request("self", pink, undefined, 0)).toBe("pink");
    expect(calls).toEqual([{ kind: "use", owner: "self:warm", keys: warmKeys(pink) }]);
    expect(warmup.request("self", pink, "pink", 16)).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it("다른 참가자는 예산 안의 스킨을 자기 이름의 선적재 소유자로 요청한다", () => {
    const { calls, warmup } = recorder();
    expect(warmup.request("peer:a", pink, undefined, 1000)).toBe("pink");
    expect(calls).toEqual([{ kind: "use", owner: "peer:a:warm", keys: warmKeys(pink) }]);
  });

  it("한꺼번에 들어온 참가자는 간격을 두고 하나씩 요청하고, 기다리는 동안은 기록하지 않아 다음 프레임에 다시 시도한다", () => {
    const { calls, warmup } = recorder();
    expect(warmup.request("peer:a", pink, undefined, 1000)).toBe("pink");
    expect(warmup.request("peer:b", silver, undefined, 1000 + STUDIO_PEER_WARM_INTERVAL_MS - 1)).toBeUndefined();
    expect(calls.map((call) => call.owner)).toEqual(["peer:a:warm"]);
    expect(warmup.request("peer:b", silver, undefined, 1000 + STUDIO_PEER_WARM_INTERVAL_MS)).toBe("silver");
    expect(calls.map((call) => call.owner)).toEqual(["peer:a:warm", "peer:b:warm"]);
  });

  it("이미 선적재를 요청한 스킨을 쓰는 참가자는 새로 받을 것이 없어 간격을 기다리지 않는다", () => {
    const { calls, warmup } = recorder();
    expect(warmup.request("peer:a", pink, undefined, 1000)).toBe("pink");
    expect(warmup.request("peer:b", pink, undefined, 1001)).toBe("pink");
    expect(warmup.request("peer:c", silver, undefined, 1002)).toBeUndefined();
    expect(calls.map((call) => call.owner)).toEqual(["peer:a:warm", "peer:b:warm"]);
  });

  it("내 캐릭터는 다른 참가자 요청 간격에 막히지 않는다", () => {
    const { calls, warmup } = recorder();
    warmup.request("peer:a", pink, undefined, 1000);
    expect(warmup.request("self", silver, undefined, 1001)).toBe("silver");
    expect(calls.at(-1)?.owner).toBe("self:warm");
  });

  it("예산을 넘는 스킨은 선적재하지 않고 이전 선적재분을 반납하며, 그 판단은 요청 간격을 쓰지 않는다", () => {
    const { calls, warmup } = recorder();
    expect(warmup.request("peer:c", heavy, undefined, 5000)).toBe("imagegen25");
    expect(calls).toEqual([{ kind: "release", owner: "peer:c:warm", keys: [] }]);
    expect(warmup.request("peer:d", pink, undefined, 5001)).toBe("pink");
  });

  it("참가자가 스킨을 바꾸면 새 스킨으로 선적재를 교체한다", () => {
    const { calls, warmup } = recorder();
    warmup.request("peer:a", pink, undefined, 0);
    expect(warmup.request("peer:a", silver, "pink", 1000)).toBe("silver");
    expect(calls.at(-1)).toEqual({ kind: "use", owner: "peer:a:warm", keys: warmKeys(silver) });
    expect(warmup.request("peer:a", heavy, "silver", 2000)).toBe("imagegen25");
    expect(calls.at(-1)).toEqual({ kind: "release", owner: "peer:a:warm", keys: [] });
  });

  it("NPC·배경 배우·기본 그림 소유자는 건드리지 않는다", () => {
    const { calls, warmup } = recorder();
    for (const owner of ["npc:concierge", "ambient:npc", "fallback"]) expect(warmup.request(owner, pink, undefined, 0), owner).toBeUndefined();
    expect(calls).toEqual([]);
  });
});

describe("선적재와 에셋 상주", () => {
  function residencyHarness() {
    let now = 0;
    const pending = new Map<string, (success: boolean) => void>();
    const requested: string[] = [];
    const removed: string[] = [];
    const backend: StudioCharacterTextureBackend = {
      has: () => false,
      load: (asset, complete) => { requested.push(asset.key); pending.set(asset.key, complete); return () => { pending.delete(asset.key); }; },
      remove: (asset) => { removed.push(asset.key); },
    };
    const residency = new StudioCharacterAssetResidency(backend, () => now, 1_000);
    const finishLoads = () => { for (const [key, complete] of [...pending]) { pending.delete(key); complete(true); } };
    return { residency, requested, removed, finishLoads, advance: (ms: number) => { now += ms; } };
  }

  it("참가자를 반납하면 그 참가자의 선적재분도 함께 반납되어 유예 뒤 텍스처가 회수된다", () => {
    const h = residencyHarness();
    h.residency.use("peer:a", studioCharacterVisualAssets(pink, "down", "idle"));
    h.residency.use(studioCharacterWarmOwner("peer:a"), studioCharacterWarmAssets(pink));
    h.finishLoads();
    h.residency.release("peer:a");
    h.advance(1_001);
    h.residency.collect();
    expect(new Set(h.removed)).toEqual(new Set(warmKeysOf(pink)));
  });

  it("같은 스킨을 쓰는 참가자끼리 텍스처를 공유하고 마지막 참가자가 떠나야 회수한다", () => {
    const h = residencyHarness();
    for (const id of ["a", "b"]) {
      h.residency.use(`peer:${id}`, studioCharacterVisualAssets(pink, "down", "idle"));
      h.residency.use(studioCharacterWarmOwner(`peer:${id}`), studioCharacterWarmAssets(pink));
    }
    expect(h.requested).toHaveLength(new Set(h.requested).size);
    h.finishLoads();
    h.residency.release("peer:a");
    h.advance(1_001);
    h.residency.collect();
    expect(h.removed).toEqual([]);
    h.residency.release("peer:b");
    h.advance(1_001);
    h.residency.collect();
    expect(new Set(h.removed)).toEqual(new Set(warmKeysOf(pink)));
  });

  it("선적재분만 반납해도 지금 보이는 에셋은 남는다(예산을 넘는 스킨으로 바뀐 경우)", () => {
    const h = residencyHarness();
    const visible = studioCharacterVisualAssets(pink, "down", "idle");
    h.residency.use("peer:a", visible);
    h.residency.use(studioCharacterWarmOwner("peer:a"), studioCharacterWarmAssets(pink));
    h.finishLoads();
    h.residency.release(studioCharacterWarmOwner("peer:a"));
    h.advance(1_001);
    h.residency.collect();
    const kept = new Set(visible.map((asset) => asset.key));
    expect(h.removed.some((key) => kept.has(key))).toBe(false);
    expect(h.removed.length).toBeGreaterThan(0);
  });
});

function warmKeysOf(skin: StudioCharacterSkin): string[] {
  return studioCharacterWarmAssets(skin).map((asset) => asset.key);
}
