import { describe, expect, it } from "vitest";

import { StudioBg3dCameraHeightValidationError } from "./studio-bg3d-camera-orientation";
import {
  applyStudioBg3dShot,
  captureStudioBg3dShot,
  createDefaultStudioBg3dSceneDocument,
  migrateStudioBg3dSceneDocument,
  normalizeStudioBg3dSceneDocument,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";

describe("평행 카메라 높이의 canonical 문서 계약", () => {
  it("기존 v3 문서와 샷의 필드 부재를 byte 왕복에서 유지한다", () => {
    const original = createDefaultStudioBg3dSceneDocument();
    const captured = captureStudioBg3dShot(original, { id: "legacy", name: "기존 컷" });
    expect(captured).not.toBeNull();
    const bytes = serializeStudioBg3dSceneDocument(captured);
    expect(bytes).not.toBeNull();
    if (!bytes) throw new Error("직렬화가 필요합니다.");
    expect(bytes).not.toContain("orthographicHeight");
    expect(serializeStudioBg3dSceneDocument(parseStudioBg3dSceneDocument(bytes))).toBe(bytes);
  });

  it.each([1e-6, 8.123456789, 100_000])("높이 %s를 보정 없이 저장하고 샷 캡처·재적용한다", (orthographicHeight) => {
    const base = createDefaultStudioBg3dSceneDocument();
    const original = { ...base, camera: { ...base.camera, projection: "orthographic", zoom: 2, orthographicHeight } };
    const captured = captureStudioBg3dShot(original, { id: "parallel", name: "평행 컷" });
    expect(captured?.shots?.[0]?.camera?.orthographicHeight).toBe(orthographicHeight);
    const bytes = serializeStudioBg3dSceneDocument(captured);
    if (!bytes) throw new Error("높이를 저장해야 합니다.");
    const restored = parseStudioBg3dSceneDocument(bytes);
    expect(restored?.camera.orthographicHeight).toBe(orthographicHeight);
    const applied = applyStudioBg3dShot({ ...restored, camera: { ...base.camera, orthographicHeight: 4 } }, "parallel");
    expect(applied?.camera.orthographicHeight).toBe(orthographicHeight);
    expect(serializeStudioBg3dSceneDocument(restored)).toBe(bytes);
  });

  it("부분 샷은 기본 높이를 상속하고 원근 투영도 잠재 높이를 보존한다", () => {
    const base = createDefaultStudioBg3dSceneDocument();
    const document = { ...base, camera: { ...base.camera, orthographicHeight: 8 }, shots: [{ id: "partial", name: "부분 컷", camera: { zoom: 2 } }] };
    expect(applyStudioBg3dShot(document, "partial")?.camera).toMatchObject({ orthographicHeight: 8, zoom: 2, projection: "perspective" });
    expect(serializeStudioBg3dSceneDocument(document)).not.toBeNull();
  });

  it.each([null, 0, -1, 1e-7, 100_001, "8", NaN, Infinity])("무효 높이 %s는 루트·샷에서 조용히 보정하거나 삭제하지 않는다", (orthographicHeight) => {
    const base = createDefaultStudioBg3dSceneDocument();
    const candidates = [
      { ...base, camera: { ...base.camera, orthographicHeight } },
      { ...base, shots: [{ id: "invalid", name: "무효", camera: { orthographicHeight } }] },
    ];
    for (const candidate of candidates) {
      expect(parseStudioBg3dSceneDocument(JSON.stringify(candidate))).toBeNull();
      expect(serializeStudioBg3dSceneDocument(candidate)).toBeNull();
      expect(() => normalizeStudioBg3dSceneDocument(candidate)).toThrow(StudioBg3dCameraHeightValidationError);
    }
  });

  it.each([1, 2])("새 필드를 거짓 v%s 문서의 레거시 값으로 추측하지 않는다", (version) => {
    const base = createDefaultStudioBg3dSceneDocument();
    const { nearClip, up, ...legacyCamera } = base.camera;
    expect(nearClip).toBeDefined();
    expect(up).toBeDefined();
    expect(migrateStudioBg3dSceneDocument({ ...base, version, camera: { ...legacyCamera, orthographicHeight: 8 } })).toBeNull();
  });
});
