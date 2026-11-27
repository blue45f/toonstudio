import { describe, expect, it } from "vitest";

import { buildAvatarForgeHairParts, createAvatarForgeState, sanitizeAvatarForgeState } from "./studio-vrm-avatar-forge";
import { expandAvatarForgeHairPartsForRender } from "./studio-vrm-avatar-forge-hair-object";
import { HAIR_SECTIONS, mergeAvatarForgeHair } from "./studio-vrm-hair-sections";

const hair = { ...createAvatarForgeState().hair, style: "bob" as const };

describe("앞·옆·뒷머리 조합", () => {
  for (const { id, options } of HAIR_SECTIONS) {
    it(`${id}의 각 커트는 실제 파츠가 다르고 다른 영역의 모양을 보존한다`, () => {
      const roles = { front: ["bang"], side: ["side"], back: ["back", "tail", "bun", "braid"] }[id];
      for (const detail of [undefined, expandAvatarForgeHairPartsForRender]) {
        const baseline = buildAvatarForgeHairParts(hair, detail);
        const shapes = new Set<string>();
        for (const option of options) {
          const next = buildAvatarForgeHairParts({ ...hair, [`${id}Part`]: option.id }, detail);
          const unrelated = next.filter((part) => !roles.includes(part.role));
          expect(unrelated.slice().sort((a,b) => a.id.localeCompare(b.id)))
            .toEqual(baseline.filter((part) => !roles.includes(part.role)).sort((a,b) => a.id.localeCompare(b.id)));
          const selected = next.filter((part) => roles.includes(part.role));
          shapes.add(JSON.stringify(selected.map(({ id: _id, ...geometry }) => geometry)));
          if (option.id === "side-none" || option.id === "front-slick-back") expect(selected).toHaveLength(0);
        }
        expect(shapes.size).toBe(options.length);
      }
    });
  }
  it("부위 색을 머리 전체에 덮어쓰지 않으며 기존 저장 형식에는 선택 필드가 없다", () => {
    const customized = mergeAvatarForgeHair(hair, { frontPart: "front-curtain", sidePart: "side-hime", backPart: "back-long-wave", sideTint: "#cc7799" });
    const parts = buildAvatarForgeHairParts(customized, expandAvatarForgeHairPartsForRender);
    for (const part of parts) expect(part.baseColor).toBe(part.role === "side" ? "#cc7799" : hair.baseColor);
    expect(mergeAvatarForgeHair(customized, { bangStyle: "blunt" })).toMatchObject({ sidePart: "side-hime" });
    expect(mergeAvatarForgeHair(customized, { bangStyle: "blunt" }).frontPart).toBeUndefined();
    expect(mergeAvatarForgeHair(customized, { style: "long" }).sideTint).toBeUndefined();
    expect(sanitizeAvatarForgeState({ hair: { ...customized, sidePart: "unknown" }, version: 4 }).hair.sidePart).toBeUndefined();
    expect(Object.keys(sanitizeAvatarForgeState({ hair, version: 4 }).hair)).not.toContain("frontPart");
  });
});
