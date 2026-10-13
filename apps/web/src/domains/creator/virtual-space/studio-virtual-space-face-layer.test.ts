import { describe, expect, it } from "vitest";

import type { StudioCharacterPoseSheet, StudioCharacterSkin } from "./studio-virtual-space-character-skins";
import {
  resolveStudioFaceSheet,
  studioActorFaceEmotion,
  studioFaceEmotionForNpcPhase,
  studioFaceLayerApplies,
} from "./studio-virtual-space-face-layer";

function poseSheet(textureUrl: string): StudioCharacterPoseSheet {
  const presentation = Object.freeze({ originX: 0.5, originY: 0.95, displayHeightRatio: 1 });
  return Object.freeze({
    textureUrl,
    frameWidth: 160,
    frameHeight: 160,
    directionFrames: Object.freeze({ down: 0, right: 1, left: 2, up: 3 }),
    frames: Object.freeze([presentation, presentation, presentation, presentation]),
  });
}

const skinWithFaces: Pick<StudioCharacterSkin, "faces"> = {
  faces: Object.freeze({
    "face-joy": poseSheet("joy.png"),
    "face-sleep": poseSheet("sleep.png"),
  }),
};

describe("resolveStudioFaceSheet", () => {
  it("선언된 감정은 이름 규칙으로 조회한다", () => {
    const resolved = resolveStudioFaceSheet(skinWithFaces, "joy");
    expect(resolved?.name).toBe("face-joy");
    expect(resolved?.sheet.textureUrl).toBe("joy.png");
    expect(resolveStudioFaceSheet(skinWithFaces, "sleep")?.sheet.textureUrl).toBe("sleep.png");
  });

  it("선언되지 않은 감정·스킨은 null이라 기존 경로로 폴백한다", () => {
    expect(resolveStudioFaceSheet(skinWithFaces, "sadness")).toBeNull();
    expect(resolveStudioFaceSheet({}, "joy")).toBeNull();
    expect(resolveStudioFaceSheet({ faces: undefined }, "neutral")).toBeNull();
  });
});

describe("studioActorFaceEmotion", () => {
  it("활성 이모트가 사용자 상태보다 우선한다", () => {
    expect(studioActorFaceEmotion({ emote: "wow", userStatus: "in-meeting" })).toBe("surprise");
    expect(studioActorFaceEmotion({ emote: "sleep", userStatus: "available" })).toBe("sleep");
    expect(studioActorFaceEmotion({ emote: "think", userStatus: "away" })).toBe("focus");
  });

  it("이모트가 없으면 사용자 상태로 해석한다", () => {
    expect(studioActorFaceEmotion({ emote: null, userStatus: "in-meeting" })).toBe("focus");
    expect(studioActorFaceEmotion({ userStatus: "break" })).toBe("sleep");
    expect(studioActorFaceEmotion({ userStatus: "available" })).toBe("neutral");
  });

  it("NPC 단계는 이모트 다음, 사용자 상태보다 먼저 해석한다", () => {
    expect(studioActorFaceEmotion({ npcPhase: "greet" })).toBe("joy");
    expect(studioActorFaceEmotion({ npcPhase: "rest" })).toBe("sleep");
    expect(studioActorFaceEmotion({ npcPhase: "work" })).toBe("focus");
    expect(studioActorFaceEmotion({ npcPhase: "inspect" })).toBe("focus");
    expect(studioActorFaceEmotion({ npcPhase: "wait" })).toBe("neutral");
  });

  it("걷기·양보 중인 NPC와 신호 없는 배우는 표정을 강제하지 않는다", () => {
    expect(studioActorFaceEmotion({ npcPhase: "walk" })).toBeNull();
    expect(studioActorFaceEmotion({ npcPhase: "yield" })).toBeNull();
    expect(studioActorFaceEmotion({})).toBeNull();
    expect(studioActorFaceEmotion({ emote: null, userStatus: null, npcPhase: null })).toBeNull();
  });

  it("NPC 단계 매핑은 걷기 계열에서 null이다", () => {
    expect(studioFaceEmotionForNpcPhase("walk")).toBeNull();
    expect(studioFaceEmotionForNpcPhase(undefined)).toBeNull();
  });
});

describe("studioFaceLayerApplies", () => {
  it("정지 상태에만 표정을 얹는다", () => {
    for (const state of ["idle", "talk", "draw", "review", "wave", "sit"] as const) {
      expect(studioFaceLayerApplies(state)).toBe(true);
    }
    expect(studioFaceLayerApplies("walk")).toBe(false);
    expect(studioFaceLayerApplies("lie")).toBe(false);
  });
});
