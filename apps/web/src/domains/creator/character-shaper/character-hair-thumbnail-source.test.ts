import { describe, expect, it } from "vitest";

import { createAvatarForgeState } from "../vrm/studio-vrm-avatar-forge";

import {
  characterHairThumbnailKey,
  resolveCharacterHairCardParams,
  type CharacterHairPreviewSpec,
} from "./character-hair-thumbnail-source";
import { CHARACTER_SLOT_CATALOG } from "./character-shaper-catalog";

import type { StudioVrmHeadFit } from "../vrm/studio-vrm-head-fit";

function hairCard(style: string): CharacterHairPreviewSpec {
  const entry = CHARACTER_SLOT_CATALOG.entries.find(
    (item) => item.preview.kind === "hair" && item.preview.style === style,
  );
  if (!entry || entry.preview.kind !== "hair") throw new Error(`헤어 카드 없음: ${style}`);
  return entry.preview;
}

const HEAD: StudioVrmHeadFit = {
  source: "mesh",
  center: [0, 0.086, -0.003],
  eyeCenter: [0, 0.0626, 0.0214],
  radiusX: 0.103,
  radiusY: 0.134,
  radiusZ: 0.119,
  faceFront: 0.104,
  frontSign: 1,
};

describe("헤어 카드 실제 렌더 썸네일(A-07)", () => {
  it("선택된 카드는 지금 헤어 그대로, 다른 카드는 지금 색 + 그 카드의 스타일 형태로 그린다", () => {
    const live = {
      ...createAvatarForgeState().hair,
      style: "bob" as const,
      baseColor: "#123456",
      tipColor: "#abcdef",
      accentMode: "streak" as const,
      accentColor: "#ff0088",
      length: 1.33,
    };
    expect(resolveCharacterHairCardParams(hairCard("bob"), live, true)).toBe(live);
    const other = resolveCharacterHairCardParams(hairCard("ponytail"), live, false);
    expect(other.style).toBe("ponytail");
    // 색·하이라이트는 지금 헤어를 따른다(카드와 실제 렌더의 색이 어긋나지 않게).
    expect(other.baseColor).toBe("#123456");
    expect(other.tipColor).toBe("#abcdef");
    expect(other.accentMode).toBe("streak");
    expect(other.accentColor).toBe("#ff0088");
    // 형태는 카드 레시피를 따른다(포니테일은 묶음 높이를 가진다).
    expect(other.tailHeight).toBeTypeOf("number");
  });

  it("렌더 캐시 키는 헤어 형태·색과 두상(실측 반경·얼굴 앞면)이 바뀌면 달라지고, 좌우 대칭 두상은 같다", () => {
    const hair = resolveCharacterHairCardParams(hairCard("short"), null, false);
    const base = characterHairThumbnailKey(hair, HEAD);
    expect(characterHairThumbnailKey(hair, HEAD)).toBe(base);
    expect(characterHairThumbnailKey({ ...hair, baseColor: "#000000" }, HEAD)).not.toBe(base);
    expect(characterHairThumbnailKey(hair, { ...HEAD, radiusX: 0.12 })).not.toBe(base);
    expect(characterHairThumbnailKey(hair, { ...HEAD, faceFront: 0.11 })).not.toBe(base);
    expect(characterHairThumbnailKey(hair, null)).not.toBe(base);
    // VRM0(−z 얼굴) 두상은 카드에서 앞으로 돌려 찍으므로 같은 그림이다.
    expect(characterHairThumbnailKey(hair, { ...HEAD, center: [0, 0.086, 0.003], frontSign: -1 })).toBe(base);
  });
});
