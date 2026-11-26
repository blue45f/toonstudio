import { isWorkVrmCutActorScene } from "@toonstudio/contracts/studio-work-vrm-cut-scene-shape";
import { describe, expect, it } from "vitest";
import {
  areStudioVrmSceneDocumentsEqual,
  createDefaultStudioVrmSceneDocument,
  normalizeStudioVrmSceneDocument,
  parseStudioVrmSceneDocument,
  serializeStudioVrmSceneDocument,
} from "./studio-vrm-scene-document";

describe("장면에 배치한 제작 캐릭터의 문서 ID", () => {
  const defaults = createDefaultStudioVrmSceneDocument();
  const placed = normalizeStudioVrmSceneDocument({
    ...defaults,
    pose: {
      ...defaults.pose,
      bones: { head: { rotation: [0.25, 0, 0] } },
      translations: { ...defaults.pose.translations, root: [2, 0, -1] },
      yOffset: 0.25,
      bodyRotationY: 0.5,
    },
    camera: { ...defaults.camera, position: [1.5, 2, 3], target: [0, 1.2, 0.2] },
  });

  it("공통 모델을 쓰는 서로 다른 캐릭터의 포즈·배치·카메라를 보존한다", () => {
    const ids = ["character:library/hero@1", "character:library/hero@2"];
    const scenes = ids.map((characterDocumentId) => {
      const linked = { ...placed, characterDocumentId };
      const normalized = normalizeStudioVrmSceneDocument(linked);
      expect(normalized).toEqual(linked);
      expect(isWorkVrmCutActorScene(normalized)).toBe(true);
      const serialized = serializeStudioVrmSceneDocument(normalized);
      if (!serialized) throw new Error("연결된 VRM 장면을 저장하지 못했습니다.");
      expect(parseStudioVrmSceneDocument(serialized)).toEqual(linked);
      return normalized;
    });
    expect(areStudioVrmSceneDocumentsEqual(scenes[0], scenes[1])).toBe(false);
  });

  it("ID 없는 기존 v6·v5 장면에서 모델 ID로 캐릭터를 추정하지 않는다", () => {
    const serialized = serializeStudioVrmSceneDocument(placed);
    expect(serialized).toBe(JSON.stringify(placed));
    const { lightingTone: _lightingTone, ...historical } = placed;
    const v5 = JSON.stringify({ ...historical, version: 5 });
    for (const input of [JSON.stringify(placed), v5]) {
      const restored = parseStudioVrmSceneDocument(input);
      expect(restored).toEqual(placed);
      expect(restored).not.toHaveProperty("characterDocumentId");
      expect(isWorkVrmCutActorScene(restored)).toBe(true);
    }
  });

  it.each(["", "character title", "constructor", "file:/tmp/avatar.vrm", "x".repeat(257), null])(
    "올바르지 않은 문서 ID %j를 저장하거나 팀 컷에서 받아들이지 않는다",
    (characterDocumentId) => {
      const invalid = { ...placed, characterDocumentId };
      expect(serializeStudioVrmSceneDocument(invalid)).toBeNull();
      expect(parseStudioVrmSceneDocument(JSON.stringify(invalid))).toBeNull();
      expect(isWorkVrmCutActorScene(invalid)).toBe(false);
      expect(normalizeStudioVrmSceneDocument(invalid)).toEqual(placed);
    },
  );
});
