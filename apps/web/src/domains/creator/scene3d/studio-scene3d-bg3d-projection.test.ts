import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  type StudioBg3dSceneDocument,
} from "../bg3d/studio-bg3d-scene-document";
import { isStudioScene3dDocument } from "./studio-scene3d-document";
import { projectStudioBg3dDocumentToScene3d } from "./studio-scene3d-bg3d-projection";

describe("BG3D → Scene3D projection", () => {
  it.each([{ height: 12, zoom: 3 }, { height: 0.000001, zoom: 100 }, { height: 100000, zoom: 0.1 }])("명시 높이 $height와 zoom $zoom의 실제 보이는 높이를 자르지 않고 전달한다", ({ height, zoom }) => {
    const source: StudioBg3dSceneDocument = { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      camera: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera, projection: "orthographic", orthographicHeight: height, zoom },
    };
    const projected = projectStudioBg3dDocumentToScene3d({ documentId: "explicit-ortho", source, viewportAspectRatio: 1 });
    expect(projected.cameras[0]?.orthoScale).toBe(height / zoom);
  });

  it("샷 높이 override·상속과 값이 없는 기존 5/zoom 경로를 각각 유지한다", () => {
    const source: StudioBg3dSceneDocument = { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      camera: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera, projection: "orthographic", orthographicHeight: 12, zoom: 3 },
      shots: [{ id: "override", name: "높이 변경", camera: { orthographicHeight: 30, zoom: 5 } }, { id: "inherit", name: "높이 상속", camera: { zoom: 2 } }],
    };
    const projected = projectStudioBg3dDocumentToScene3d({ documentId: "shot-ortho", source, viewportAspectRatio: 1 });
    expect(projected.cameras.map((camera) => camera.orthoScale)).toEqual([4, 6, 6]);
    const legacy = projectStudioBg3dDocumentToScene3d({ documentId: "legacy-ortho", viewportAspectRatio: 1,
      source: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT, camera: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera, projection: "orthographic", zoom: 2 } },
    });
    expect(legacy.cameras[0]?.orthoScale).toBe(2.5);
  });
  it("keeps primitives procedural and models content-addressed while sharing camera/light/output authority", () => {
    const source: StudioBg3dSceneDocument = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      attachments: [{
        id: "chair",
        name: "Chair",
        mime: "model/gltf-binary",
        byteSize: 1024,
        hash: `sha256:${"a".repeat(64)}`,
        rights: {
          status: "public-domain",
          commercialUse: true,
          attributionRequired: false,
          licenseName: "CC0-1.0",
        },
        source: "bundled",
      }],
      nodes: [{
        id: "floor",
        name: "Floor",
        kind: "primitive",
        primitiveKind: "plane",
        color: "#dddddd",
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [4, 1, 4] },
        visible: true,
        locked: false,
        castsShadow: false,
        receivesShadow: true,
        parentId: null,
      }, {
        id: "chair-node",
        name: "Chair",
        kind: "model",
        attachmentId: "chair",
        transform: { position: [1, 0, 0], rotation: [0, Math.PI / 2, 0], scale: [1, 1, 1] },
        visible: true,
        locked: false,
        castsShadow: true,
        receivesShadow: true,
        parentId: null,
      }],
      output: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output,
        exportHeight: 640,
        exportAspectRatio: 0.75,
      },
    };

    const projected = projectStudioBg3dDocumentToScene3d({
      documentId: "scene:test",
      source,
      now: "2026-09-10T00:00:00.000Z",
    });

    expect(isStudioScene3dDocument(projected)).toBe(true);
    expect(projected.entities.map((entity) => entity.kind)).toEqual(["primitive", "model"]);
    expect(projected.assets).toHaveLength(1);
    expect(projected.assets[0]).toMatchObject({
      id: "bg3d:chair",
      uri: "attachment:chair",
      quality: { accepted: false, score: 0 },
    });
    expect(projected.output.height).toBe(640);
    expect(projected.output.width).toBe(480);
    expect(projected.output.pixelRatio).toBe(1);
    expect(projected.lights.map((light) => light.id)).toEqual(["light:key", "light:fill"]);
    expect(projected.render.shadows).toMatchObject({ mode: "standard", cascades: 1 });
  });

  it("creates independent shot cameras instead of dropping legacy camera overrides", () => {
    const source: StudioBg3dSceneDocument = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      shots: [{
        id: "close-up",
        name: "Close up",
        camera: { fovDegrees: 25 },
        nodeVisibility: [],
      }],
      activeShotId: "close-up",
    };

    const projected = projectStudioBg3dDocumentToScene3d({ documentId: "scene:shot", source, viewportAspectRatio: 1 });

    expect(projected.activeCameraId).toBe("camera:shot:close-up");
    expect(projected.cameras).toHaveLength(2);
    expect(projected.cameras[1]?.focalLengthMm).toBeGreaterThan(projected.cameras[0]!.focalLengthMm);
  });

  it("upgrades the legacy 256px shadow tier and recovers a stale active shot", () => {
    const source: StudioBg3dSceneDocument = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      activeShotId: "deleted-shot",
      shots: [],
      quality: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.quality,
        desktop: {
          ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.quality.desktop,
          shadowMapSize: 256,
        },
      },
    };

    const projected = projectStudioBg3dDocumentToScene3d({
      documentId: "scene:legacy-shadow",
      source,
      viewportAspectRatio: 1,
    });

    expect(projected.activeCameraId).toBe("camera:main");
    expect(projected.render.shadows.mapSize).toBe(512);
    expect(isStudioScene3dDocument(projected)).toBe(true);
  });
});
