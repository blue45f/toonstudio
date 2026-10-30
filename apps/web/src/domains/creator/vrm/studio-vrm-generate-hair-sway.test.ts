import { describe, expect, it } from "vitest";

import {
  applyStudioVrmHairSway,
  applyStudioVrmHairSwayPreset,
  countStudioVrmHairSwayScopes,
  keepStudioVrmHairSwayChains,
  matchStudioVrmHairSwayPreset,
  resetStudioVrmHairSwayScope,
  resolveStudioVrmHairSwayScope,
  sanitizeStudioVrmHairSwayAuthoring,
  setStudioVrmHairSwayParam,
  STUDIO_VRM_HAIR_SWAY_MAX_CHAINS,
  STUDIO_VRM_HAIR_SWAY_PRESETS,
  studioVrmHairSwayChainScope,
  studioVrmHairSwayGroupForRole,
} from "./studio-vrm-generate-hair-sway";

const CHAIN = { stiffness: 1.2, gravityPower: 0.1, dragForce: 0.6 };

describe("sanitizeStudioVrmHairSwayAuthoring", () => {
  it("drops neutral multipliers so untouched hair keeps the forge state key-free", () => {
    expect(sanitizeStudioVrmHairSwayAuthoring(undefined)).toBeUndefined();
    expect(sanitizeStudioVrmHairSwayAuthoring({ global: { stiffness: 1, gravity: 1, drag: 1 } })).toBeUndefined();
    expect(
      sanitizeStudioVrmHairSwayAuthoring({ global: { stiffness: 2.5 }, groups: { bang: { drag: 1 }, nope: { drag: 2 } } }),
    ).toEqual({ global: { stiffness: 2.5 } });
  });

  it("clamps every multiplier into its slider range", () => {
    expect(
      sanitizeStudioVrmHairSwayAuthoring({ global: { stiffness: 99, gravity: -4, drag: 0.1 } }),
    ).toEqual({ global: { stiffness: 3, gravity: 0, drag: 0.4 } });
  });
});

describe("applyStudioVrmHairSway", () => {
  it("leaves the automatic tuning untouched when nothing was adjusted", () => {
    expect(applyStudioVrmHairSway(CHAIN, undefined, "bang")).toBe(CHAIN);
    expect(applyStudioVrmHairSway(CHAIN, { groups: { tail: { stiffness: 2 } } }, "bang")).toBe(CHAIN);
  });

  it("multiplies the global and group multipliers and respects VRM ranges", () => {
    const authoring = { global: { stiffness: 2, drag: 1.6 }, groups: { tail: { stiffness: 1.5, gravity: 3 } } };
    const tuned = applyStudioVrmHairSway(CHAIN, authoring, "tail");
    expect(tuned.stiffness).toBeCloseTo(1.2 * 2 * 1.5, 9);
    expect(tuned.gravityPower).toBeCloseTo(0.3, 9);
    // dragForce 는 VRM 1.0 에서 0~1 이다.
    expect(tuned.dragForce).toBe(0.96);
    expect(applyStudioVrmHairSway({ ...CHAIN, dragForce: 0.9 }, authoring, "tail").dragForce).toBe(1);
  });

  it("maps hair part roles to sway groups, treating braid chains as tied hair", () => {
    expect(studioVrmHairSwayGroupForRole("bang")).toBe("bang");
    expect(studioVrmHairSwayGroupForRole("side")).toBe("side");
    expect(studioVrmHairSwayGroupForRole("back")).toBe("back");
    expect(studioVrmHairSwayGroupForRole("ahoge")).toBe("ahoge");
    expect(studioVrmHairSwayGroupForRole("tail")).toBe("tail");
    expect(studioVrmHairSwayGroupForRole("bun")).toBe("tail");
    expect(studioVrmHairSwayGroupForRole(undefined)).toBe("tail");
  });
});

describe("hair sway editing helpers", () => {
  it("applies presets globally while keeping group adjustments", () => {
    const grouped = setStudioVrmHairSwayParam(undefined, "bang", "stiffness", 2);
    const still = applyStudioVrmHairSwayPreset(grouped, "still");
    expect(matchStudioVrmHairSwayPreset(still)).toBe("still");
    expect(still?.groups?.bang).toEqual({ stiffness: 2 });
    expect(countStudioVrmHairSwayScopes(still)).toBe(2);
    expect(matchStudioVrmHairSwayPreset(applyStudioVrmHairSwayPreset(still, "auto"))).toBe("auto");
  });

  it("reports manual global edits as no preset and resets scopes back to automatic", () => {
    const manual = setStudioVrmHairSwayParam(undefined, "global", "gravity", 1.75);
    expect(matchStudioVrmHairSwayPreset(manual)).toBeNull();
    expect(resolveStudioVrmHairSwayScope(manual, "global")).toEqual({ stiffness: 1, gravity: 1.75, drag: 1 });
    expect(resetStudioVrmHairSwayScope(manual, "global")).toBeUndefined();
    const grouped = setStudioVrmHairSwayParam(manual, "side", "drag", 0.5);
    expect(resetStudioVrmHairSwayScope(grouped, "side")).toEqual({ global: { gravity: 1.75 } });
  });

  it("tunes one strand on top of the global and group multipliers", () => {
    const strand = studioVrmHairSwayChainScope("bang-blunt-1");
    let authoring = setStudioVrmHairSwayParam(undefined, "global", "stiffness", 2);
    authoring = setStudioVrmHairSwayParam(authoring, "bang", "stiffness", 1.5);
    authoring = setStudioVrmHairSwayParam(authoring, strand, "stiffness", 0.5);
    expect(authoring?.chains).toEqual({ "bang-blunt-1": { stiffness: 0.5 } });
    expect(resolveStudioVrmHairSwayScope(authoring, strand)).toEqual({ stiffness: 0.5, gravity: 1, drag: 1 });
    expect(countStudioVrmHairSwayScopes(authoring)).toBe(3);

    // 같은 묶음의 다른 가닥은 전체 × 묶음만, 고른 가닥은 전체 × 묶음 × 가닥 배율을 받는다.
    expect(applyStudioVrmHairSway(CHAIN, authoring, "bang", "bang-blunt-0").stiffness).toBeCloseTo(1.2 * 2 * 1.5, 9);
    expect(applyStudioVrmHairSway(CHAIN, authoring, "bang", "bang-blunt-1").stiffness).toBeCloseTo(1.2 * 2 * 1.5 * 0.5, 9);

    // 프리셋은 가닥 조정을 남기고, 가닥 되돌리기는 그 가닥만 지운다.
    expect(applyStudioVrmHairSwayPreset(authoring, "calm")?.chains).toEqual(authoring?.chains);
    expect(resetStudioVrmHairSwayScope(authoring, strand)?.chains).toBeUndefined();
  });

  it("keeps only well-formed strand ids, in a stable order, up to the cap", () => {
    const raw = {
      chains: {
        "side-right": { drag: 0.5 },
        "Bang-Upper": { drag: 0.5 },
        "../escape": { drag: 0.5 },
        "back-0": { gravity: 1 },
        "side-left": { stiffness: 2 },
      },
    };
    const sanitized = sanitizeStudioVrmHairSwayAuthoring(raw);
    expect(Object.keys(sanitized?.chains ?? {})).toEqual(["side-left", "side-right"]);

    const many = Object.fromEntries(
      Array.from({ length: STUDIO_VRM_HAIR_SWAY_MAX_CHAINS + 5 }, (_unused, index) => [`bang-${index}`, { stiffness: 2 }]),
    );
    expect(Object.keys(sanitizeStudioVrmHairSwayAuthoring({ chains: many })?.chains ?? {}))
      .toHaveLength(STUDIO_VRM_HAIR_SWAY_MAX_CHAINS);
  });

  it("drops strand tweaks of a previous hairstyle and counts only what the current hair has", () => {
    // 이전 헤어(울프컷)의 가닥 조정이 지금 헤어(히메컷)의 조정과 함께 남은 상태.
    const authoring = {
      groups: { bang: { stiffness: 2 }, tail: { drag: 0.5 } },
      chains: { "wolf-nape-left": { gravity: 2 }, "hime-lock-left": { stiffness: 0.5 } },
    };
    const present = [
      { id: "hime-lock-left", group: "side" as const },
      { id: "bang-blunt-0", group: "bang" as const },
    ];
    expect(keepStudioVrmHairSwayChains(authoring, present.map((chain) => chain.id))).toEqual({
      groups: authoring.groups,
      chains: { "hime-lock-left": { stiffness: 0.5 } },
    });
    // 걷어 낼 것이 없으면 같은 객체, 가닥 조정이 모두 사라지면 키도 지운다.
    const kept = { chains: { "hime-lock-left": { stiffness: 0.5 } } };
    expect(keepStudioVrmHairSwayChains(kept, ["hime-lock-left"])).toBe(kept);
    expect(keepStudioVrmHairSwayChains({ chains: { "wolf-nape-left": { gravity: 2 } } }, [])).toBeUndefined();

    // 묶은 머리(tail) 묶음과 울프컷 가닥은 지금 헤어에 없어 세지 않는다.
    expect(countStudioVrmHairSwayScopes(authoring)).toBe(4);
    expect(countStudioVrmHairSwayScopes(authoring, present)).toBe(2);
  });

  it("ships presets whose values stay inside the slider limits", () => {
    for (const preset of STUDIO_VRM_HAIR_SWAY_PRESETS) {
      const sanitized = sanitizeStudioVrmHairSwayAuthoring({ global: preset.params });
      expect(resolveStudioVrmHairSwayScope(sanitized, "global")).toEqual(preset.params);
    }
  });
});
