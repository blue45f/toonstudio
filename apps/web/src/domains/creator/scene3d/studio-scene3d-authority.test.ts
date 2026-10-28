import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  normalizeStudioBg3dSceneDocument,
} from "../bg3d/studio-bg3d-scene-document";
import { createStudioShared3dSceneSession } from "../studio-shared-3d-scene-bridge";
import { createStudioVrmSceneDocument } from "../vrm/studio-vrm-scene-document";
import {
  createStudioScene3dAuthority,
  projectStudioScene3dAuthorityToSources,
} from "./studio-scene3d-authority";

const NOW = "2026-09-17T00:00:00.000Z";

function scene() {
  return normalizeStudioBg3dSceneDocument({
    ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    nodes: [{
      id: "cube",
      name: "Cube",
      kind: "primitive",
      primitiveKind: "box",
      transform: { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      visible: true,
      locked: false,
      castsShadow: true,
      receivesShadow: true,
      parentId: null,
      color: "#ffffff",
    }],
  });
}

function authority() {
  const shared = createStudioShared3dSceneSession([{
    elementId: "hero",
    label: "Hero",
    scene: createStudioVrmSceneDocument(),
    stageTransform: { position: [1, 0, 2], rotationY: 0.25 },
  }]);
  return createStudioScene3dAuthority({
    authorityId: "scene:authority-test",
    bg3d: scene(),
    sharedSceneSession: shared,
    viewportAspectRatio: 1,
    revision: 4,
    now: NOW,
  });
}

describe("StudioScene3d authority", () => {
  const projections: readonly ("orthographic" | "perspective")[] = ["orthographic", "perspective"];
  it.each(projections)("명시 정사영 높이와 source zoom을 %s 왕복에서도 보존한다", (projection) => {
    const base = scene();
    const bg3d = normalizeStudioBg3dSceneDocument({ ...base, camera: { ...base.camera, projection, orthographicHeight: 17, zoom: 3 } });
    const current = createStudioScene3dAuthority({ authorityId: "explicit-height", bg3d, viewportAspectRatio: 1, now: NOW });
    const unchanged = projectStudioScene3dAuthorityToSources(current, current.document);
    expect(unchanged.bg3d.camera.orthographicHeight).toBe(17);
    expect(unchanged.bg3d.camera.zoom).toBe(3);
    const edited = { ...current.document, cameras: current.document.cameras.map((camera) => ({ ...camera, orthoScale: 8 })) };
    const updated = projectStudioScene3dAuthorityToSources(current, edited);
    expect(updated.bg3d.camera.orthographicHeight).toBe(24);
    expect(updated.bg3d.camera.zoom).toBe(3);
  });

  it.each([{ height: 16, zoom: 4, scale: 5 }, { height: undefined, zoom: 2, scale: 4 }])("활성 샷 높이 $height 편집은 같은 이름의 다른 샷·main을 보존하고 재투영한다", ({ height, zoom, scale }) => {
    const bg3d = normalizeStudioBg3dSceneDocument({ ...scene(),
      shots: [{ id: "only-shot", name: "동일 이름", camera: { projection: "orthographic", ...(height === undefined ? {} : { orthographicHeight: height }), zoom } },
        { id: "other-shot", name: "동일 이름", camera: { orthographicHeight: 9, zoom: 3 } }],
    });
    const current = createStudioScene3dAuthority({ authorityId: "shot-height", bg3d, viewportAspectRatio: 1, now: NOW });
    const edited = { ...current.document, activeCameraId: "camera:shot:only-shot", cameras: current.document.cameras.map((camera) => camera.id === "camera:shot:only-shot" ? { ...camera, orthoScale: scale } : camera) };
    const result = projectStudioScene3dAuthorityToSources(current, edited);
    expect(result.bg3d.camera).toEqual(bg3d.camera);
    expect(result.bg3d.shots?.[1]).toEqual(bg3d.shots?.[1]);
    expect(result.bg3d.activeShotId).toBe("only-shot");
    const shotCamera = result.bg3d.shots?.[0]?.camera;
    if (height === undefined) {
      expect(shotCamera).not.toHaveProperty("orthographicHeight");
      expect(shotCamera?.zoom).toBe(5 / scale);
    } else {
      expect(shotCamera).toMatchObject({ orthographicHeight: scale * zoom, zoom });
    }
    const roundTrip = createStudioScene3dAuthority({ authorityId: "shot-height-roundtrip", bg3d: result.bg3d, viewportAspectRatio: 1, now: NOW });
    expect(roundTrip.document.activeCameraId).toBe("camera:shot:only-shot");
    expect(roundTrip.document.cameras.find((camera) => camera.id === roundTrip.document.activeCameraId)?.orthoScale).toBe(scale);
    const mainResult = projectStudioScene3dAuthorityToSources(roundTrip, { ...roundTrip.document, activeCameraId: "camera:main" });
    expect(mainResult.bg3d).not.toHaveProperty("activeShotId");
    expect(mainResult.bg3d.shots).toEqual(result.bg3d.shots);
    const mainRoundTrip = createStudioScene3dAuthority({ authorityId: "main-roundtrip", bg3d: mainResult.bg3d, viewportAspectRatio: 1, now: NOW });
    expect(mainRoundTrip.document.activeCameraId).toBe("camera:main");
  });

  it("알 수 없는 카메라 ID를 원본 카메라 이름으로 추측하지 않고 거부한다", () => {
    const current = authority();
    const unknown = { ...current.document, activeCameraId: "camera:shot:missing",
      cameras: current.document.cameras.map((camera) => ({ ...camera, id: "camera:shot:missing", name: "Main camera" })),
    };
    expect(() => projectStudioScene3dAuthorityToSources(current, unknown)).toThrow(/no matching BG3D source camera/u);
    expect(current.bg3d.camera).toEqual(scene().camera);
  });

  it("main 카메라 편집은 샷 override를 변경하지 않는다", () => {
    const bg3d = normalizeStudioBg3dSceneDocument({ ...scene(), camera: { ...scene().camera, projection: "orthographic", orthographicHeight: 12, zoom: 3 },
      shots: [{ id: "other-shot", name: "별도 샷", camera: { orthographicHeight: 9, zoom: 3 } }],
    });
    const current = createStudioScene3dAuthority({ authorityId: "main-height", bg3d, viewportAspectRatio: 1, now: NOW });
    const edited = { ...current.document, activeCameraId: "camera:main", cameras: current.document.cameras.map((camera) => camera.id === "camera:main" ? { ...camera, orthoScale: 8 } : camera) };
    const result = projectStudioScene3dAuthorityToSources(current, edited);
    expect(result.bg3d.camera).toMatchObject({ orthographicHeight: 24, zoom: 3 });
    expect(result.bg3d.shots).toEqual(bg3d.shots);
  });

  it("높이가 없던 기존 source에 새 필드를 만들지 않고 5/scale zoom 역산을 유지한다", () => {
    const bg3d = normalizeStudioBg3dSceneDocument({ ...scene(), camera: { ...scene().camera, projection: "orthographic", zoom: 2 } });
    const current = createStudioScene3dAuthority({ authorityId: "legacy-height", bg3d, viewportAspectRatio: 1, now: NOW });
    const edited = { ...current.document, cameras: current.document.cameras.map((camera) => ({ ...camera, orthoScale: 4 })) };
    const result = projectStudioScene3dAuthorityToSources(current, edited);
    expect(result.bg3d.camera.zoom).toBe(1.25);
    expect(result.bg3d.camera).not.toHaveProperty("orthographicHeight");
  });

  it.each([{ height: 0.000001, zoom: 100 }, { height: 100000, zoom: 0.1 }])("허용 경계 높이 $height는 실제 문서 정규화 왕복에서도 보존한다", ({ height, zoom }) => {
    const bg3d = normalizeStudioBg3dSceneDocument({ ...scene(), camera: { ...scene().camera, projection: "orthographic", orthographicHeight: height, zoom } });
    const current = createStudioScene3dAuthority({ authorityId: "height-exact-boundary", bg3d, viewportAspectRatio: 1, now: NOW });
    const result = projectStudioScene3dAuthorityToSources(current, current.document);
    expect(result.bg3d.camera.orthographicHeight).toBe(height);
    expect(result.bg3d.camera.zoom).toBe(zoom);
  });

  it.each([0.00000001, 100001])("역투영 높이 %s는 canonical 범위 밖이면 clamp 없이 거부한다", (height) => {
    const bg3d = normalizeStudioBg3dSceneDocument({ ...scene(), camera: { ...scene().camera, projection: "orthographic", orthographicHeight: 20, zoom: 2 },
      shots: [{ id: "shot-boundary", name: "샷 범위", camera: { orthographicHeight: 20, zoom: 2 } }],
    });
    const current = createStudioScene3dAuthority({ authorityId: "height-boundary", bg3d, viewportAspectRatio: 1, now: NOW });
    for (const activeCameraId of ["camera:main", "camera:shot:shot-boundary"]) {
      const edited = { ...current.document, activeCameraId, cameras: current.document.cameras.map((camera) => camera.id === activeCameraId ? { ...camera, orthoScale: height / 2 } : camera) };
      expect(() => projectStudioScene3dAuthorityToSources(current, edited)).toThrow();
    }
    expect(current.bg3d.camera.orthographicHeight).toBe(20);
    expect(current.bg3d.shots?.[0]?.camera?.orthographicHeight).toBe(20);
  });
  it("projects BG3D and linked VRM sources into one validated document", () => {
    const value = authority();
    expect(value.document.revision).toBe(4);
    expect(value.document.entities.map((entry) => entry.id)).toEqual(["cube", "character:hero"]);
    expect(value.bindings).toHaveLength(2);
    expect(value.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(value.document.entities[1]).toMatchObject({
      kind: "character",
      characterDocumentId: value.characters[0]?.sourceHash,
    });
  });

  it("round-trips scene, camera, output, and source-owned character placement", () => {
    const current = authority();
    const next = {
      ...current.document,
      revision: 5,
      entities: current.document.entities.map((entity) => {
        if (entity.id === "cube") {
          return { ...entity, name: "Moved cube", transform: { ...entity.transform, position: [3, 2, 1] as const } };
        }
        if (entity.id === "character:hero") {
          const yaw = 0.75;
          return {
            ...entity,
            transform: {
              ...entity.transform,
              position: [4, 0, -2] as const,
              rotation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)] as const,
            },
          };
        }
        return entity;
      }),
      cameras: current.document.cameras.map((camera) =>
        camera.id === current.document.activeCameraId
          ? { ...camera, position: [8, 4, 6] as const, focalLengthMm: 85 }
          : camera),
      output: { ...current.document.output, width: 900, height: 1200 },
    };
    const projected = projectStudioScene3dAuthorityToSources(current, next);
    expect(projected.bg3d.nodes[0]).toMatchObject({
      id: "cube",
      name: "Moved cube",
      transform: { position: [3, 2, 1] },
    });
    expect(projected.bg3d.camera.position).toEqual([8, 4, 6]);
    expect(projected.bg3d.output).toMatchObject({ exportHeight: 1200, exportAspectRatio: 0.75 });
    expect(projected.characterTransformRequests).toEqual([expect.objectContaining({
      elementId: "hero",
      transform: expect.objectContaining({ position: [4, 0, -2], rotationY: expect.closeTo(0.75, 6) }),
    })]);
    expect(projected.changedEntityIds).toEqual(["character:hero", "cube"]);
    expect(projected.issues).toEqual([]);
  });

  it("fails closed when a linked source is deleted or the revision moves backwards", () => {
    const current = authority();
    const withoutCharacter = {
      ...current.document,
      revision: 5,
      entities: current.document.entities.filter((entity) => entity.id !== "character:hero"),
    };
    expect(projectStudioScene3dAuthorityToSources(current, withoutCharacter).issues)
      .toContainEqual(expect.objectContaining({ code: "linked-character-removal" }));
    expect(() => projectStudioScene3dAuthorityToSources(current, {
      ...current.document,
      revision: 3,
    })).toThrow(/revision moved backwards/u);
  });
});
