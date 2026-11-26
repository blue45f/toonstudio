import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  ART_STYLE_IDS,
  ART_STYLE_PACK_PROVENANCE,
  ART_STYLE_PACKS,
  BASE_CHANNEL_KEYS,
  CHANNEL_KEYS,
  CHARACTER_LOOK_FORMAT,
  DERIVED_CHANNEL_KEYS,
  LOOK_V2_IDENTITY,
  artStylePack,
  artStylePackSchema,
  channelColorOrigin,
  characterLookSchemaFor,
  clampProportion,
  deriveChannelHex,
  isCharacterLookFormat,
  isLookV2Identity,
  mergeLook,
  pickBaseChannelColors,
  resolveChannelColor,
  resolveChannelColors,
} from "./index";

const SAMPLE_BASE_COLORS = {
  skin: "#f3d3bd",
  iris: "#3a5a8c",
  hair: "#2b1d16",
  brow: "#2b1d16",
  top: "#4e6b8a",
  bottom: "#2a303c",
  shoes: "#1e1e22",
  accessory: "#c99a4a",
} as const;

describe("@toonstudio/studio-project-model/character-art-style", () => {
  it("validates all 8 T1 art-style packs against artStylePackSchema and freezes them", () => {
    expect(ART_STYLE_PACKS).toHaveLength(ART_STYLE_IDS.length);
    expect(ART_STYLE_PACKS.map((p) => p.id)).toEqual([...ART_STYLE_IDS]);

    for (const pack of ART_STYLE_PACKS) {
      expect(() => artStylePackSchema.parse(pack)).not.toThrow();
      expect(artStylePack(pack.id)).toBe(pack);
      expect(Object.isFrozen(pack)).toBe(true);
      expect(Object.isFrozen(pack.look)).toBe(true);
      expect(ART_STYLE_PACK_PROVENANCE[pack.id].noteKo.length).toBeGreaterThan(0);
    }
  });

  it("derives all 27 OKLab channels deterministically from base 8 colors without drift", () => {
    expect(BASE_CHANNEL_KEYS).toHaveLength(8);
    expect(DERIVED_CHANNEL_KEYS).toHaveLength(19);
    expect(CHANNEL_KEYS).toHaveLength(27);

    const resolved = resolveChannelColors(SAMPLE_BASE_COLORS);
    expect(Object.keys(resolved)).toEqual([...CHANNEL_KEYS]);
    for (const key of CHANNEL_KEYS) {
      expect(resolved[key]).toMatch(/^#[0-9a-f]{6}$/u);
    }

    // Identity rule (dL=0, chroma=1) must preserve exact hex without 1-LSB rounding drift
    expect(resolved["hair-accessory"]).toBe(SAMPLE_BASE_COLORS.accessory);
    expect(resolved["hair-accessory-accent"]).toBe(SAMPLE_BASE_COLORS.accessory);
    expect(deriveChannelHex("#4e6b8a", 0, 1, 0)).toBe("#4e6b8a");

    // Hue-rotated OKLab shift produces a valid hex distinct from base
    const rotated = deriveChannelHex("#f3d3bd", -0.22, 1.0, -20);
    expect(rotated).toMatch(/^#[0-9a-f]{6}$/u);
    expect(rotated).not.toBe("#f3d3bd");

    // Explicit override takes priority over inheritance
    const overridden = resolveChannelColor({ ...SAMPLE_BASE_COLORS, "hair-tip": "#e090a0" }, "hair-tip");
    expect(overridden).toBe("#e090a0");
    expect(channelColorOrigin({ ...SAMPLE_BASE_COLORS, "hair-tip": "#e090a0" }, "hair-tip")).toEqual({
      kind: "explicit",
    });
    expect(channelColorOrigin(SAMPLE_BASE_COLORS, "hair-tip")).toEqual({
      kind: "inherited",
      parent: "hair",
    });
    expect(channelColorOrigin(SAMPLE_BASE_COLORS, "sclera")).toEqual({ kind: "fixed" });
    expect(pickBaseChannelColors({ ...SAMPLE_BASE_COLORS, lip: "#d98080" })).toEqual(SAMPLE_BASE_COLORS);
  });

  it("enforces look/1 scope boundaries and look merge immutability", () => {
    const schema = characterLookSchemaFor(z.record(z.string(), z.unknown()));
    const valid = {
      format: CHARACTER_LOOK_FORMAT,
      id: "webtoon-romance-hero",
      nameKo: "로맨스 주인공 화풍",
      scope: "style" as const,
      payload: { style: { packId: "kr-webtoon-romance" }, look: LOOK_V2_IDENTITY },
      locks: ["face", "body"] as const,
    };
    expect(isCharacterLookFormat(valid)).toBe(true);
    expect(() => schema.parse(valid)).not.toThrow();

    // Out-of-scope section rejected
    const invalidScope = { ...valid, payload: { slots: { hair: "hair/romance-long" } } };
    expect(schema.safeParse(invalidScope).success).toBe(false);

    // mergeLook preserves immutability and identity detection
    expect(isLookV2Identity(LOOK_V2_IDENTITY)).toBe(true);
    const patched = mergeLook(LOOK_V2_IDENTITY, { ramp: { softness: 0.25 }, line: { inner: { enabled: true } } });
    expect(patched.ramp.softness).toBe(0.25);
    expect(patched.line.inner.enabled).toBe(true);
    expect(LOOK_V2_IDENTITY.ramp.softness).toBe(0);
    expect(isLookV2Identity(patched)).toBe(false);

    // NaN proportion clamps cleanly to range midpoint
    expect(clampProportion("headsTall", Number.NaN)).toBe(6.25);
    expect(clampProportion("headsTall", 99)).toBe(10);
  });
});
