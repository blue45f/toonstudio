import { describe, expect, it } from "vitest";
import { createBgCustomModelInstance } from "../studio-background-3d-model";
import { createPrimitive } from "../studio-background-3d-primitives";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  STUDIO_BG3D_GLB_MIME,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES,
  normalizeStudioBg3dGlbAttachment,
  type StudioBg3dModelAttachment,
} from "./studio-bg3d-scene-document";
import {
  createStudioBg3dSceneSnapshot,
  duplicateStudioBg3dSceneSnapshot,
  planStudioBg3dSceneSnapshotRestore,
  summarizeStudioBg3dSceneState,
} from "./studio-bg3d-scene-snapshot";

function makeVerifiedAttachment(id = "att_chair_01"): StudioBg3dModelAttachment {
  const normalized = normalizeStudioBg3dGlbAttachment({
    id,
    name: "chair.glb",
    mime: STUDIO_BG3D_GLB_MIME,
    byteSize: 4096,
    hash: `sha256:${"a".repeat(64)}`,
    source: "local-library",
    rights: {
      status: "owned",
      commercialUse: true,
      attributionRequired: false,
    },
  });
  if (!normalized) throw new Error("Invalid test attachment");
  return normalized;
}

describe("studio-bg3d-scene-snapshot", () => {
  it("deep-clones camera, lighting, and furniture transforms so mutating runtime state after restore never corrupts the snapshot clone", () => {
    const box = {
      ...createPrimitive("box", 0),
      id: "prim-box-1",
      name: "상자",
      position: [1.25, 0.5, -0.75] as [number, number, number],
      rotation: [0, 35, 0] as [number, number, number],
    };
    const chair = {
      ...createBgCustomModelInstance("storage-chair-1", 0),
      id: "model-chair-1",
      name: "의자",
      position: [-1.5, 0, 2.0] as [number, number, number],
    };
    const customDoc = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      camera: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
        position: [6.5, 4.2, 9.1] as const,
        fovDegrees: 38,
      },
      lighting: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.lighting,
        key: {
          ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.lighting.key,
          color: "#ffd9b3",
          intensity: 1.45,
        },
      },
      render: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.render,
        exposure: 1.15,
      },
    };
    const original = createStudioBg3dSceneSnapshot(
      {
        document: customDoc,
        primitives: [box],
        customModels: [chair],
      },
      { id: "bg-snap-1", name: "배치 전 스냅샷" },
    );

    // Mutate caller arrays after snapshot creation
    box.position[0] = -99;
    chair.position[2] = 99;

    const duplicated = duplicateStudioBg3dSceneSnapshot([original], "bg-snap-1", {
      id: "bg-snap-1-clone",
    });
    expect(duplicated).not.toBeNull();
    const clone = duplicated![1]!;
    expect(clone.name).toBe("배치 전 스냅샷 복제본");
    expect(clone.primitives[0]?.position).toEqual([1.25, 0.5, -0.75]);
    expect(clone.customModels[0]?.position).toEqual([-1.5, 0, 2.0]);

    const attachments = new Map<string, StudioBg3dModelAttachment>([
      ["storage-chair-1", makeVerifiedAttachment()],
    ]);

    const firstPlan = planStudioBg3dSceneSnapshotRestore({
      snapshot: clone,
      currentDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      attachmentByStorageModelId: attachments,
    });
    expect(firstPlan.ok).toBe(true);
    if (!firstPlan.ok) return;

    expect(firstPlan.document.camera.position).toEqual([6.5, 4.2, 9.1]);
    expect(firstPlan.document.camera.fovDegrees).toBe(38);
    expect(firstPlan.document.lighting.key.color.toLowerCase()).toBe("#ffd9b3");
    expect(firstPlan.document.render.exposure).toBe(1.15);
    expect(firstPlan.primitives).toHaveLength(1);
    expect(firstPlan.primitives[0]?.position).toEqual([1.25, 0.5, -0.75]);
    expect(firstPlan.customModels).toHaveLength(1);
    expect(firstPlan.customModels[0]?.position).toEqual([-1.5, 0, 2.0]);

    // Mutate restored mutable runtime arrays as if user rearranged again
    firstPlan.primitives[0]!.position[0] = -42;
    firstPlan.customModels[0]!.position[2] = 77;

    // Restoring the SAME clone a second time still yields pristine coordinates!
    const secondPlan = planStudioBg3dSceneSnapshotRestore({
      snapshot: clone,
      currentDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      attachmentByStorageModelId: attachments,
    });
    expect(secondPlan.ok).toBe(true);
    if (!secondPlan.ok) return;
    expect(secondPlan.primitives[0]?.position).toEqual([1.25, 0.5, -0.75]);
    expect(secondPlan.customModels[0]?.position).toEqual([-1.5, 0, 2.0]);
    expect(summarizeStudioBg3dSceneState(clone)).toContain("첫배치(1.25,0.50,-0.75)");
  });

  it("fails closed when a referenced GLB attachment was deleted from model storage", () => {
    const chair = {
      ...createBgCustomModelInstance("deleted-model-id", 0),
      id: "model-deleted-1",
      name: "삭제된 의자",
    };
    const snap = createStudioBg3dSceneSnapshot({
      document: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      primitives: [],
      customModels: [chair],
    });
    const plan = planStudioBg3dSceneSnapshotRestore({
      snapshot: snap,
      currentDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      attachmentByStorageModelId: new Map(),
    });
    expect(plan).toEqual({ ok: false, reason: "missing-model-attachment" });
  });

  it("fails closed when snapshot node count exceeds canonical scene document budget", () => {
    const tooManyPrimitives = Array.from(
      { length: STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES + 1 },
      (_, idx) => ({
        ...createPrimitive("box", idx),
        id: `prim-${idx + 1}`,
      }),
    );
    const snap = createStudioBg3dSceneSnapshot({
      document: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      primitives: tooManyPrimitives,
      customModels: [],
    });
    const plan = planStudioBg3dSceneSnapshotRestore({
      snapshot: snap,
      currentDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      attachmentByStorageModelId: new Map(),
    });
    expect(plan).toEqual({ ok: false, reason: "document-adaptation-failed" });
  });
});
