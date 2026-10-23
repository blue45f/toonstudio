import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  normalizeStudioBg3dSceneDocument,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
} from "../bg3d/studio-bg3d-scene-document";
import { createStudioScene3dAuthority, projectStudioScene3dAuthorityToSources } from "./studio-scene3d-authority";
import { projectStudioBg3dDocumentToScene3d } from "./studio-scene3d-bg3d-projection";
import { describeStudioScene3dLinkedLayerReview } from "./studio-scene3d-linked-layer-source";
import {
  approveStudioScene3dVersionedCut,
  createStudioScene3dVersionedCut,
  validateStudioScene3dShotVersionCollection,
} from "./studio-scene3d-shot-versions";

function node(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: `상자 ${id}`,
    kind: "primitive",
    primitiveKind: "box",
    color: "#c9a876",
    transform: { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    parentId: null,
    visible: true,
    locked: false,
    castsShadow: true,
    receivesShadow: true,
    ...extra,
  };
}

function sceneWith(overrides: Record<string, unknown> = {}): StudioBg3dSceneDocument {
  return normalizeStudioBg3dSceneDocument({
    ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    nodes: [node("wall", { tags: ["벽"], componentRef: { id: "comp-wall", name: "벽체" } }), node("floor", { tags: ["바닥"] })],
    ...overrides,
  });
}

function pinned(source: StudioBg3dSceneDocument) {
  const cut = approveStudioScene3dVersionedCut(createStudioScene3dVersionedCut({
    id: "cut:organization",
    name: "태그 컷",
    scene: projectStudioBg3dDocumentToScene3d({ documentId: "project:organization", source, viewportAspectRatio: 1 }),
    characters: {},
    legacyBg3d: source,
  }));
  return { cut, scene: { ...source, pinnedVersionedCut: cut } as StudioBg3dSceneDocument };
}

describe("고정 컷과 태그·장면 정보", () => {
  it("태그 숨김을 포함한 원본으로 컷을 만들고 저장 모음을 거쳐도 해시가 그대로다", () => {
    const source = sceneWith({ meta: { name: "교실", memo: "아침", hiddenTags: ["벽"] } });
    const { cut } = pinned(source);
    expect(cut.source.legacyBg3d?.meta).toEqual({ name: "교실", memo: "아침", hiddenTags: ["벽"] });
    expect(cut.source.legacyBg3d?.nodes[0]).toMatchObject({ tags: ["벽"], componentRef: { id: "comp-wall", name: "벽체" } });
    const restored = validateStudioScene3dShotVersionCollection(JSON.parse(JSON.stringify({ version: 1, cuts: [cut] })));
    expect(restored.cuts[0]?.sourceHash).toBe(cut.sourceHash);
    expect(restored.cuts[0]?.source.legacyBg3d?.meta?.hiddenTags).toEqual(["벽"]);
  });

  it("구성 정보가 없는 예전 원본으로 만든 컷도 그대로 검증된다", () => {
    const legacy = normalizeStudioBg3dSceneDocument({ ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT, nodes: [node("a")] });
    expect(legacy.meta).toBeUndefined();
    const { cut } = pinned(legacy);
    expect(validateStudioScene3dShotVersionCollection({ version: 1, cuts: [cut] }).cuts[0]?.sourceHash).toBe(cut.sourceHash);
    expect("meta" in (cut.source.legacyBg3d ?? {})).toBe(false);
  });

  it("컷을 되살리는 투영이 노드 태그·컴포넌트 참조·숨긴 태그를 잃지 않는다", () => {
    const source = sceneWith({ meta: { name: "교실", hiddenTags: ["벽"] } });
    const { cut } = pinned(source);
    const legacy = cut.source.legacyBg3d;
    if (!legacy) throw new Error("원본 BG3D 장면이 없습니다.");
    const authority = createStudioScene3dAuthority({
      authorityId: cut.source.scene.documentId,
      bg3d: legacy,
      viewportAspectRatio: 1,
      now: cut.source.scene.createdAt,
    });
    const projection = projectStudioScene3dAuthorityToSources(authority, cut.source.scene);
    expect(projection.issues).toEqual([]);
    expect(projection.bg3d.meta).toEqual({ name: "교실", hiddenTags: ["벽"] });
    expect(projection.bg3d.nodes.find((entry) => entry.id === "wall")).toMatchObject({
      visible: true,
      tags: ["벽"],
      componentRef: { id: "comp-wall", name: "벽체" },
    });
    const reparsed = parseStudioBg3dSceneDocument(JSON.stringify({ ...projection.bg3d, pinnedVersionedCut: cut }));
    expect(reparsed?.pinnedVersionedCut?.sourceHash).toBe(cut.sourceHash);
    expect(serializeStudioBg3dSceneDocument(reparsed ?? source)).not.toBeNull();
  });
});

describe("연결 레이어 재검토 판정과 태그·장면 정보", () => {
  it("보이는 결과를 바꾸지 않는 편집(태그 붙이기·컴포넌트·장면 이름·메모)은 재검토 대상이 아니다", () => {
    const { scene } = pinned(sceneWith());
    expect(describeStudioScene3dLinkedLayerReview({ scene })?.sceneNeedsReview).toBe(false);
    const edited = normalizeStudioBg3dSceneDocument({
      ...scene,
      meta: { name: "새 이름", memo: "새 메모" },
      nodes: [
        node("wall", { tags: ["벽", "교실"], componentRef: { id: "comp-other", name: "다른 묶음" } }),
        node("floor"),
      ],
      pinnedVersionedCut: scene.pinnedVersionedCut,
    });
    expect(describeStudioScene3dLinkedLayerReview({ scene: edited })?.sceneNeedsReview).toBe(false);
  });

  it("태그를 숨기면 가려지는 오브젝트가 있을 때만 재검토 대상이 된다", () => {
    const { scene } = pinned(sceneWith());
    const hideWall = normalizeStudioBg3dSceneDocument({ ...scene, meta: { hiddenTags: ["벽"] }, pinnedVersionedCut: scene.pinnedVersionedCut });
    expect(describeStudioScene3dLinkedLayerReview({ scene: hideWall })?.sceneNeedsReview).toBe(true);
    const hideMissing = normalizeStudioBg3dSceneDocument({ ...scene, meta: { hiddenTags: ["없는태그"] }, pinnedVersionedCut: scene.pinnedVersionedCut });
    expect(describeStudioScene3dLinkedLayerReview({ scene: hideMissing })?.sceneNeedsReview).toBe(false);
  });

  it("고정할 때 숨겼던 태그를 다시 보이게 하면 재검토 대상이 된다", () => {
    const { scene } = pinned(sceneWith({ meta: { hiddenTags: ["벽"] } }));
    expect(describeStudioScene3dLinkedLayerReview({ scene })?.sceneNeedsReview).toBe(false);
    const { meta: _meta, ...withoutMeta } = scene;
    const shown = normalizeStudioBg3dSceneDocument({ ...withoutMeta, pinnedVersionedCut: scene.pinnedVersionedCut });
    expect(describeStudioScene3dLinkedLayerReview({ scene: shown })?.sceneNeedsReview).toBe(true);
  });

  it("오브젝트를 직접 숨긴 것과 태그로 숨긴 것은 같은 보이는 결과로 본다", () => {
    const { scene } = pinned(sceneWith({
      nodes: [node("wall", { tags: ["벽"], visible: false }), node("floor", { tags: ["바닥"] })],
    }));
    const hiddenByTag = normalizeStudioBg3dSceneDocument({
      ...scene,
      meta: { hiddenTags: ["벽"] },
      nodes: [node("wall", { tags: ["벽"] }), node("floor", { tags: ["바닥"] })],
      pinnedVersionedCut: scene.pinnedVersionedCut,
    });
    expect(describeStudioScene3dLinkedLayerReview({ scene: hiddenByTag })?.sceneNeedsReview).toBe(false);
  });
});
