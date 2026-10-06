import { describe, expect, it } from "vitest";
import {
  STUDIO_CHARACTER_FACE_SETS,
  STUDIO_CHARACTER_SIT_SET_NAME,
  studioCharacterFaceSetFrame,
  studioCharacterSitSetFrame,
} from "./studio-virtual-space-character-frame-sets";
import { studioCharacterExpressionFrame, type StudioCharacterExpression } from "./studio-virtual-space-expressions";
import { STUDIO_CHARACTER_SKINS, studioCharacterSkinByKey } from "./studio-virtual-space-character-skins";
import { STUDIO_NPC_CAST } from "./studio-virtual-space-npc-cast";

describe("캐릭터 프레임 세트 등록부 (sit · face-*)", () => {
  it("앉기 세트 이름은 sit 하나로 고정한다", () => {
    expect(STUDIO_CHARACTER_SIT_SET_NAME).toBe("sit");
  });

  it("표정 세트는 기본·미소·인사·놀람 4종이며 열이 겹치지 않는다", () => {
    expect(STUDIO_CHARACTER_FACE_SETS.map((set) => set.name)).toEqual([
      "face-calm", "face-happy", "face-wave", "face-surprised",
    ]);
    expect(new Set(STUDIO_CHARACTER_FACE_SETS.map((set) => set.column)).size).toBe(4);
  });

  it("표정 프레임이 기존 표정 런타임(studioCharacterExpressionFrame)과 전 조합에서 일치한다", () => {
    for (const skinKey of ["pink", "silver", "dark", "purple"]) {
      for (const set of STUDIO_CHARACTER_FACE_SETS) {
        const named = studioCharacterFaceSetFrame(skinKey, set.name);
        const runtime = studioCharacterExpressionFrame({
          skinKey, time: 0, idleForMs: 0, moving: false, facing: "down",
          reducedMotion: false, expression: set.expression as StudioCharacterExpression,
        });
        expect(named?.frame, `${skinKey}/${set.name}`).toBe(runtime);
        expect(named?.textureUrl).toContain("actor-emotions.png");
        expect(named?.presentation).toBeDefined();
      }
    }
  });

  it("표정 시트가 없는 스킨은 null을 돌려 기존 자세를 유지한다", () => {
    expect(studioCharacterFaceSetFrame("imagegen25", "face-happy")).toBeNull();
    expect(studioCharacterFaceSetFrame("npc-cafe", "face-calm")).toBeNull();
  });

  it("앉기 세트는 포즈 시트를 가진 플레이어·NPC 스킨에서 방향 프레임을 해석한다", () => {
    for (const skin of [...STUDIO_CHARACTER_SKINS, ...STUDIO_NPC_CAST]) {
      const frame = studioCharacterSitSetFrame(skin, "down");
      if (skin.poses?.sit) {
        expect(frame, skin.key).not.toBeNull();
        expect(frame?.textureUrl).toBe(skin.poses.sit.textureUrl);
        expect(frame?.frame).toBe(skin.poses.sit.directionFrames.down);
      } else {
        expect(frame, skin.key).toBeNull();
      }
    }
    const pink = studioCharacterSkinByKey("pink");
    for (const facing of ["down", "right", "left", "up"] as const) {
      expect(studioCharacterSitSetFrame(pink, facing)?.frame).toBe(pink.poses?.sit?.directionFrames[facing]);
    }
  });
});
