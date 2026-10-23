import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createStudioVrmAuthoredHairClumpGeometry } from "./studio-vrm-authored-hair-geometry";
import {
  buildAvatarForgeHairParts,
  createAvatarForgeState,
  sanitizeAvatarForgeState,
  serializeAvatarForgeState,
  type AvatarForgeHairPart,
} from "./studio-vrm-avatar-forge";
import {
  AVATAR_FORGE_DEFAULT_HAIR_ACCENT_COLOR,
  avatarForgeHairTipMix,
  decorateAvatarForgeHairParts,
  resolveAvatarForgeHairGradient,
} from "./studio-vrm-avatar-forge-hair-color";

function stateWithHair(patch: Record<string, unknown>) {
  const state = createAvatarForgeState();
  return sanitizeAvatarForgeState({ ...state, hair: { ...state.hair, ...patch } });
}

describe("헤어 색 확장(그라데이션·하이라이트)", () => {
  it("기본값·잘못된 값은 상태에 키를 남기지 않는다 — 예전 문서와 파츠 JSON 이 바이트 단위로 같다", () => {
    const plain = stateWithHair({});
    for (const key of ["accentMode", "accentColor", "gradientPosition", "gradientSoftness"]) {
      expect(Object.hasOwn(plain.hair, key)).toBe(false);
    }
    const defaults = stateWithHair({ gradientPosition: 0.5, gradientSoftness: 1, accentMode: "none" });
    expect(JSON.stringify(defaults.hair)).toBe(JSON.stringify(plain.hair));
    const junk = stateWithHair({ accentMode: "glitter", accentColor: "pink", gradientPosition: Number.NaN, gradientSoftness: null });
    expect(JSON.stringify(junk.hair)).toBe(JSON.stringify(plain.hair));
    expect(JSON.stringify(buildAvatarForgeHairParts(junk))).toBe(JSON.stringify(buildAvatarForgeHairParts(plain)));
  });

  it("고른 값은 저장 형식에 그대로 남는다(색은 소문자, 범위 밖은 잘라 낸다)", () => {
    const state = stateWithHair({ accentMode: "streak", accentColor: "#7DD3FC", gradientPosition: 0.3, gradientSoftness: -2 });
    expect(state.hair).toMatchObject({ accentMode: "streak", accentColor: "#7dd3fc", gradientPosition: 0.3, gradientSoftness: 0 });
    const reloaded = sanitizeAvatarForgeState(JSON.parse(JSON.stringify(serializeAvatarForgeState(state))));
    expect(reloaded.hair).toEqual(state.hair);
    expect(resolveAvatarForgeHairGradient(state.hair)).toEqual({ position: 0.3, softness: 0 });
    expect(resolveAvatarForgeHairGradient(stateWithHair({}).hair)).toEqual({ position: 0.5, softness: 1 });
  });

  it("v1 문서에 섞여 들어온 색 확장 키는 오염된 입력으로 보고 버린다", () => {
    const legacy = sanitizeAvatarForgeState({ version: 1, hair: { style: "bob", accentMode: "inner", gradientPosition: 0.2 } });
    expect(Object.hasOwn(legacy.hair, "accentMode")).toBe(false);
    expect(Object.hasOwn(legacy.hair, "gradientPosition")).toBe(false);
  });

  it("끝 색 비율: 확장이 없거나 기본값이면 예전 식(t × 0.58)과 같고, 경계 0 이면 또렷한 투톤이다", () => {
    for (const t of [0, 0.2, 0.5, 0.8, 1]) {
      expect(avatarForgeHairTipMix({}, t)).toBeCloseTo(t * 0.58, 12);
      expect(avatarForgeHairTipMix({ gradientPosition: 0.5, gradientSoftness: 1 }, t)).toBeCloseTo(t * 0.58, 12);
    }
    const twoTone = { gradientPosition: 0.45, gradientSoftness: 0 };
    expect(avatarForgeHairTipMix(twoTone, 0.3)).toBe(0);
    expect(avatarForgeHairTipMix(twoTone, 0.6)).toBe(1);
    expect(avatarForgeHairTipMix({}, Number.NaN)).toBe(0);
  });

  it("확장이 없으면 파츠 배열을 그대로 돌려주고, 브릿지는 대표 갈래·캡에만, 이너 컬러는 늘어진 머리에만 붙는다", () => {
    const plain = stateWithHair({ style: "long" });
    const parts = buildAvatarForgeHairParts(plain);
    expect(decorateAvatarForgeHairParts(parts, plain.hair)).toBe(parts);

    const streak = stateWithHair({ style: "long", bangStyle: "side-swept", accentMode: "streak" });
    const streakParts = decorateAvatarForgeHairParts(buildAvatarForgeHairParts(streak), streak.hair);
    const accented = streakParts.filter((part) => part.accentMode === "streak").map((part) => part.id);
    expect(accented).toEqual(expect.arrayContaining(["cap", "bang-sweep-main", "side-left"]));
    expect(accented).not.toContain("side-right");
    expect(streakParts.find((part) => part.id === "cap")?.accentColor).toBe(AVATAR_FORGE_DEFAULT_HAIR_ACCENT_COLOR);

    const inner = stateWithHair({ style: "ponytail", accentMode: "inner", accentColor: "#5eead4" });
    const innerParts = decorateAvatarForgeHairParts(buildAvatarForgeHairParts(inner), inner.hair);
    for (const part of innerParts) {
      const expected = ["side", "back", "tail", "braid"].includes(part.role);
      expect(part.accentMode === "inner", `${part.id}(${part.role})`).toBe(expected);
    }
  });

  it("하이라이트를 받은 가닥의 정점 색에 하이라이트 색이 실제로 섞인다", () => {
    const base: AvatarForgeHairPart = {
      id: "bang-sweep-main",
      role: "bang",
      primitive: "tapered-capsule",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      baseColor: "#201818",
      tipColor: "#3a2a2a",
      taper: 0.6,
      curl: 0,
      shine: 0.4,
    };
    const greenest = (part: AvatarForgeHairPart) => {
      const colors = createStudioVrmAuthoredHairClumpGeometry(part).getAttribute("color");
      let best = 0;
      for (let index = 0; index < colors.count; index += 1) {
        const color = new THREE.Color(colors.getX(index), colors.getY(index), colors.getZ(index));
        best = Math.max(best, color.g - Math.max(color.r, color.b));
      }
      return best;
    };
    expect(greenest(base)).toBeLessThan(0.02);
    expect(greenest({ ...base, accentMode: "streak", accentColor: "#00ff00" })).toBeGreaterThan(0.2);
  });
});
