import { describe, expect, it } from "vitest";

import {
  NANO_BANANA_2D_WORKSTATIONS,
  NANO_BANANA_CAMPUS_OBJECT_UPGRADES,
  NANO_BANANA_NPC_CAST_MAP,
  buildNanoBanana2dAssetManifest,
  getNanoBanana2dRuntimeState,
  nanoBananaEmoteTextureKey,
  nanoBananaPersonaTextureKey,
  nanoBananaV15ActionTextureKey,
  nanoBananaWalkTextureKey,
  requestOpenNanoBananaWorkstationModal,
  resolveNanoBanana2dActorTexture,
  subscribeNanoBanana2dVfxBurst,
  subscribeNanoBananaWorkstationModal,
  triggerNanoBanana2dEmote,
  triggerNanoBanana2dVfxBurst,
  triggerNanoBanana2dWalkPreview,
  updateNanoBanana2dRuntimeState,
} from "./studio-virtual-space-nano-banana-2d-runtime";
import {
  StudioVirtualSpaceEngineBridge,
  requestStudioActiveBridgeEmote,
  requestStudioActiveBridgeTeleport,
} from "./studio-virtual-space-engine-bridge";

describe("studio-virtual-space-nano-banana-2d-runtime", () => {
  const allLoadedTextures = {
    exists: () => true,
  };

  it("registers all 8 v15 sleek action, 4-directional walk, 8 persona (idle+work), 4 emote, 9 prop, 4 room, and 12 theme textures", () => {
    const manifest = buildNanoBanana2dAssetManifest();
    expect(manifest.length).toBe(8 + 4 + 16 + 4 + 9 + 4 + 12);
    const keys = new Set(manifest.map((item) => item.key));
    expect(keys.has(nanoBananaV15ActionTextureKey("stride-draw"))).toBe(true);
    expect(keys.has(nanoBananaV15ActionTextureKey("action-slash"))).toBe(true);
    expect(keys.has(nanoBananaWalkTextureKey("down"))).toBe(true);
    expect(keys.has(nanoBananaWalkTextureKey("left"))).toBe(true);
    expect(keys.has(nanoBananaWalkTextureKey("right"))).toBe(true);
    expect(keys.has(nanoBananaWalkTextureKey("up"))).toBe(true);
    expect(keys.has(nanoBananaPersonaTextureKey("line-artist", "work"))).toBe(true);
    expect(keys.has(nanoBananaPersonaTextureKey("studio-cat-mascot", "idle"))).toBe(true);
    expect(keys.has(nanoBananaEmoteTextureKey("crunch-flame-focus"))).toBe(true);
  });

  it("cycles across multi-frame v15 sleek action sprites when nowMs is provided and triggers VFX bursts", () => {
    updateNanoBanana2dRuntimeState({
      enabled: true,
      personaId: "line-artist",
      pose: "work",
      activeEmoteId: null,
      activeEmoteUntilMs: 0,
      activeV15ActionId: null,
      activeV15ActionUntilMs: 0,
      walkDirectionOverride: null,
      walkDirectionOverrideUntilMs: 0,
    });

    const frame0 = resolveNanoBanana2dActorTexture(allLoadedTextures, {
      owner: "self",
      skinKey: "pink",
      facing: "right",
      state: "draw",
      nowMs: 0,
    });
    const frame1 = resolveNanoBanana2dActorTexture(allLoadedTextures, {
      owner: "self",
      skinKey: "pink",
      facing: "right",
      state: "draw",
      nowMs: 1_500,
    });
    expect(frame0?.textureKey).toBe(nanoBananaV15ActionTextureKey("stride-draw"));
    expect(frame1?.textureKey).toBe(nanoBananaPersonaTextureKey("line-artist", "work"));

    const events: string[] = [];
    const unsubVfx = subscribeNanoBanana2dVfxBurst((ev) => events.push(ev.label));
    triggerNanoBanana2dVfxBurst("콰아앙—!! 💥", 0xf43f5e, "action-slash");
    unsubVfx();
    expect(events).toContain("콰아앙—!! 💥");
    expect(getNanoBanana2dRuntimeState().activeV15ActionId).toBe("action-slash");
    updateNanoBanana2dRuntimeState({ activeV15ActionId: null, activeV15ActionUntilMs: 0 });

    const openedStations: string[] = [];
    const unsubModal = subscribeNanoBananaWorkstationModal((id) => openedStations.push(id));
    requestOpenNanoBananaWorkstationModal("nb-plaza-cintiq-pod");
    unsubModal();
    expect(openedStations).toEqual(["nb-plaza-cintiq-pod"]);
  });

  it("resolves 4-directional walk and persona sprites for self and all 8 campus NPCs", () => {
    updateNanoBanana2dRuntimeState({
      enabled: true,
      personaId: "colorist",
      pose: "idle",
      activeEmoteId: null,
      activeEmoteUntilMs: 0,
      walkDirectionOverride: null,
      walkDirectionOverrideUntilMs: 0,
    });

    const walkLeft = resolveNanoBanana2dActorTexture(allLoadedTextures, {
      owner: "self",
      skinKey: "pink",
      facing: "left",
      state: "walk",
    });
    expect(walkLeft?.textureKey).toBe("nb-walk-left");
    expect(walkLeft?.flipX).toBe(false);

    const idleRight = resolveNanoBanana2dActorTexture(allLoadedTextures, {
      owner: "self",
      skinKey: "pink",
      facing: "right",
      state: "idle",
    });
    expect(idleRight?.textureKey).toBe("nb-cast-colorist-idle");
    expect(idleRight?.flipX).toBe(false);

    const drawLeft = resolveNanoBanana2dActorTexture(allLoadedTextures, {
      owner: "self",
      skinKey: "pink",
      facing: "left",
      state: "draw",
    });
    expect(drawLeft?.textureKey).toBe("nb-cast-colorist-work");
    expect(drawLeft?.flipX).toBe(true);

    for (const [npcSkin, personaId] of Object.entries(NANO_BANANA_NPC_CAST_MAP)) {
      const npcWork = resolveNanoBanana2dActorTexture(allLoadedTextures, {
        owner: `npc:${npcSkin}`,
        skinKey: npcSkin,
        facing: "down",
        state: "draw",
      });
      expect(npcWork?.textureKey).toBe(`nb-cast-${personaId}-work`);
    }
  });

  it("prioritizes active emote and walk direction preview overrides on self", () => {
    triggerNanoBanana2dEmote("celebrate-highfive", 5_000);
    const emoteMatch = resolveNanoBanana2dActorTexture(allLoadedTextures, {
      owner: "self",
      skinKey: "pink",
      facing: "down",
      state: "idle",
    });
    expect(emoteMatch?.textureKey).toBe("nb-emote-celebrate-highfive");

    updateNanoBanana2dRuntimeState({ activeEmoteId: null, activeEmoteUntilMs: 0 });
    triggerNanoBanana2dWalkPreview("up", 5_000);
    const walkOverrideMatch = resolveNanoBanana2dActorTexture(allLoadedTextures, {
      owner: "self",
      skinKey: "pink",
      facing: "down",
      state: "idle",
    });
    expect(walkOverrideMatch?.textureKey).toBe("nb-walk-up");
    triggerNanoBanana2dWalkPreview(null);
    expect(getNanoBanana2dRuntimeState().walkDirectionOverride).toBeNull();
  });

  it("defines 10 interactive 2.5D webtoon workstations and campus object upgrades", () => {
    expect(NANO_BANANA_2D_WORKSTATIONS).toHaveLength(10);
    expect(Object.keys(NANO_BANANA_CAMPUS_OBJECT_UPGRADES).length).toBeGreaterThanOrEqual(10);

    const bridge = new StudioVirtualSpaceEngineBridge();
    bridge.consumeTeleport();
    requestStudioActiveBridgeTeleport({ x: 1272, y: 1126 });
    expect(bridge.consumeTeleport()).toEqual({ x: 1272, y: 1126 });

    requestStudioActiveBridgeEmote("sparkles");
    expect(bridge.consumeEmote()).toBe("sparkles");
  });
});
