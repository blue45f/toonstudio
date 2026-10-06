import { describe, expect, it } from "vitest";

import {
  studioCharacterFaceTextureKey,
  studioCharacterPoseSheetMatches,
  studioCharacterVisualAssets,
} from "./studio-virtual-space-character-assets";
import {
  STUDIO_CHARACTER_FACE_ATLAS,
  STUDIO_CHARACTER_FACE_SETS,
  STUDIO_CHARACTER_FACE_TEXTURE_URL,
  STUDIO_FACE_EMOTION_BY_EXPRESSION,
  studioCharacterFaceSetFrame,
  studioCharacterFaceSheets,
} from "./studio-virtual-space-character-frame-sets";
import { studioFaceSetName, STUDIO_EMOTION_KINDS } from "./studio-virtual-space-character-motion";
import {
  STUDIO_CHARACTER_SKINS,
  studioCharacterSkinByKey,
  studioCharacterSkinForArtStyle,
} from "./studio-virtual-space-character-skins";
import { studioCharacterExpressionFrame } from "./studio-virtual-space-expressions";
import { resolveStudioFaceSheet, studioActorFaceEmotion } from "./studio-virtual-space-face-layer";
import { STUDIO_NPC_CAST, studioNpcCastSkinByKey } from "./studio-virtual-space-npc-cast";
import { STUDIO_ACTOR_EXPRESSION_PRESENTATION } from "./studio-virtual-space-scene-art-runtime";

const DRAWN_SKIN_KEYS = ["pink", "silver", "dark", "purple"] as const;
const FACINGS = ["down", "right", "left", "up"] as const;
/** 시트에 열이 있는 감정만 선언된다. 나머지는 폴백이 정직한 동작이다. */
const DECLARED_EMOTIONS = ["neutral", "joy", "surprise"] as const;
const UNDECLARED_EMOTIONS = ["sadness", "sleep", "focus"] as const;

describe("표정 레이어 연결 (등록부 → 스킨 faces 선언)", () => {
  it("드로잉 4종만 faces를 선언하고, 감정은 neutral·joy·surprise 3종이다", () => {
    for (const key of DRAWN_SKIN_KEYS) {
      const skin = studioCharacterSkinByKey(key);
      expect(Object.keys(skin.faces ?? {}).sort(), key).toEqual(
        DECLARED_EMOTIONS.map((emotion) => studioFaceSetName(emotion)).sort(),
      );
    }
    for (const emotion of UNDECLARED_EMOTIONS) {
      expect(DECLARED_EMOTIONS).not.toContain(emotion);
    }
    expect(STUDIO_EMOTION_KINDS).toHaveLength(DECLARED_EMOTIONS.length + UNDECLARED_EMOTIONS.length);
  });

  it("선언된 표정 시트는 등록부 프레임·기존 표정 런타임과 전 방향에서 일치한다", () => {
    for (const key of DRAWN_SKIN_KEYS) {
      const skin = studioCharacterSkinByKey(key);
      for (const set of STUDIO_CHARACTER_FACE_SETS) {
        const emotion = STUDIO_FACE_EMOTION_BY_EXPRESSION[set.expression];
        if (!emotion) continue;
        const resolved = resolveStudioFaceSheet(skin, emotion);
        expect(resolved, `${key}/${emotion}`).not.toBeNull();
        expect(resolved?.name).toBe(studioFaceSetName(emotion));
        const named = studioCharacterFaceSetFrame(key, set.name);
        const runtime = studioCharacterExpressionFrame({
          skinKey: key, time: 0, idleForMs: 0, moving: false, facing: "down",
          reducedMotion: false, expression: set.expression,
        });
        expect(named?.frame).toBe(runtime);
        for (const facing of FACINGS) {
          expect(resolved?.sheet.directionFrames[facing], `${key}/${emotion}/${facing}`).toBe(named?.frame);
        }
        expect(resolved?.sheet.textureUrl).toBe(STUDIO_CHARACTER_FACE_TEXTURE_URL);
        expect(resolved?.sheet.frames[named!.frame]).toBe(STUDIO_ACTOR_EXPRESSION_PRESENTATION[named!.frame]);
        // 실제 시트 크기(아틀라스 계약)와 대조해 기하가 어긋나면 실패한다.
        expect(
          studioCharacterPoseSheetMatches(resolved!.sheet, STUDIO_CHARACTER_FACE_ATLAS.width, STUDIO_CHARACTER_FACE_ATLAS.height),
          `${key}/${emotion} 기하`,
        ).toBe(true);
      }
    }
  });

  it("시트에 열이 없는 감정은 선언되지 않아 표정 레이어가 폴백(null)을 유지한다", () => {
    for (const key of DRAWN_SKIN_KEYS) {
      const skin = studioCharacterSkinByKey(key);
      for (const emotion of UNDECLARED_EMOTIONS) {
        expect(resolveStudioFaceSheet(skin, emotion), `${key}/${emotion}`).toBeNull();
      }
    }
  });

  it("배우 신호 → 감정 → 표정 시트까지 실제로 해석된다", () => {
    const skin = studioCharacterSkinByKey("pink");
    const fromEmote = studioActorFaceEmotion({ emote: "wave" });
    expect(fromEmote).toBe("joy");
    expect(resolveStudioFaceSheet(skin, fromEmote!)?.name).toBe("face-joy");
    const fromStatus = studioActorFaceEmotion({ userStatus: "available" });
    expect(fromStatus).toBe("neutral");
    expect(resolveStudioFaceSheet(skin, fromStatus!)?.name).toBe("face-neutral");
    const fromNpcPhase = studioActorFaceEmotion({ npcPhase: "greet" });
    expect(fromNpcPhase).toBe("joy");
    // 휴식(sleep)·회의(focus) 신호는 감정까지는 해석되지만 시트가 없어 폴백한다.
    expect(resolveStudioFaceSheet(skin, studioActorFaceEmotion({ npcPhase: "rest" })!)).toBeNull();
    expect(resolveStudioFaceSheet(skin, studioActorFaceEmotion({ userStatus: "in-meeting" })!)).toBeNull();
  });

  it("행 매핑이 없는 스킨은 faces가 없어 기존 표정 경로를 유지한다", () => {
    expect(studioCharacterFaceSheets("npc-cafe")).toBeUndefined();
    expect(studioCharacterFaceSheets("imagegen25")).toBeUndefined();
    expect(studioCharacterFaceSheets("unknown-skin")).toBeUndefined();
    expect(studioCharacterSkinByKey("imagegen25").faces).toBeUndefined();
    for (const npc of STUDIO_NPC_CAST) {
      expect(npc.faces, npc.key).toBeUndefined();
      expect(studioNpcCastSkinByKey(npc.key, "sky-island").faces, npc.key).toBeUndefined();
    }
    const themeSkin = STUDIO_CHARACTER_SKINS.find((skin) => skin.key.startsWith("theme-avatar-"));
    expect(themeSkin?.faces).toBeUndefined();
  });

  it("스타일 변형은 sky-island에서만 faces를 이어받고, 상주 텍스처 목록에도 실린다", () => {
    const pink = studioCharacterSkinByKey("pink");
    const skyIsland = studioCharacterSkinForArtStyle(pink, "sky-island");
    expect(skyIsland.faces).toBe(pink.faces);
    const faceKeys = studioCharacterVisualAssets(skyIsland, "down", "idle")
      .filter((asset) => asset.key.includes("face-"))
      .map((asset) => asset.key)
      .sort();
    expect(faceKeys).toEqual(
      DECLARED_EMOTIONS.map((emotion) => studioCharacterFaceTextureKey(skyIsland, studioFaceSetName(emotion))).sort(),
    );
    const webtoon = studioCharacterSkinForArtStyle(pink, "webtoon");
    expect(webtoon.faces).toBeUndefined();
    expect(studioCharacterVisualAssets(webtoon, "down", "idle").some((asset) => asset.key.includes("face-"))).toBe(false);
  });

  it("등록부에 표정 세트가 늘면 감정 대응 없이는 이 테스트가 실패한다", () => {
    // wave 열만 감정 대응이 없는 것이 문서화된 예외다. 다른 세트가 무대응으로
    // 추가되거나, 대응이 생겼는데 선언이 따라오지 않으면 여기서 걸린다.
    for (const set of STUDIO_CHARACTER_FACE_SETS) {
      const emotion = STUDIO_FACE_EMOTION_BY_EXPRESSION[set.expression];
      if (!emotion) {
        expect(set.name, "감정 대응 없는 세트는 wave뿐").toBe("face-wave");
        continue;
      }
      const pink = studioCharacterSkinByKey("pink");
      expect(pink.faces?.[studioFaceSetName(emotion)], set.name).toBeDefined();
    }
    const mappedCount = STUDIO_CHARACTER_FACE_SETS.filter((set) => STUDIO_FACE_EMOTION_BY_EXPRESSION[set.expression]).length;
    expect(Object.keys(studioCharacterSkinByKey("pink").faces ?? {})).toHaveLength(mappedCount);
  });
});
