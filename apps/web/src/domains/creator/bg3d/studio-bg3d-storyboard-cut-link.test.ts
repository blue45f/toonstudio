import { describe, expect, it } from "vitest";

import {
  applySceneRestorePatch,
  asSceneLinkedStoryboardCut,
  buildSceneRestorePatch,
  buildSceneReturnHref,
  cameraRollDegreesFromUp,
  createStoryboardCutFromSceneCapture,
  getStoryboardSceneMeta,
  nearestCutAspectRatio,
  parseStoryboardSceneCutMeta,
  reissueSceneLinkedCut,
  serializeStoryboardSceneCutMeta,
  storyboardSceneMetaBadgeKo,
  type StoryboardSceneDocumentView,
} from "./studio-bg3d-storyboard-cut-link";
import { Studio3DStoryboardCutStrip, type StoryboardCut } from "../scene-3d/studio-3d-storyboard-cut-strip";

const DUTCH_UP: readonly [number, number, number] = [
  Math.sin(Math.PI / 6),
  Math.cos(Math.PI / 6),
  0,
];

function makeDocument(): StoryboardSceneDocumentView {
  return {
    camera: {
      position: [3, 2, 6],
      target: [0, 1.2, 0],
      fovDegrees: 42,
      up: [...DUTCH_UP],
    },
    lighting: {
      ambientColor: "#404040",
      ambientIntensity: 0.5,
      key: { color: "#ffffff", direction: [0.5, 1, 0.25], intensity: 1.2, castsShadow: true },
      fill: { color: "#88aaff", direction: [-0.5, 0.4, 0.6], intensity: 0.4, castsShadow: false },
      environment: {
        source: "hdri",
        assetId: null,
        intensity: 0.8,
        rotationDegrees: 30,
        useAsBackground: false,
      },
    },
    render: { exposure: 1.1 },
    nodes: [
      {
        kind: "model",
        id: "char-1",
        name: "주인공",
        transform: { position: [0, 0, 0], rotation: [0, 0.4, 0], scale: [1, 1, 1] },
        visible: true,
        locked: false,
        castsShadow: true,
        receivesShadow: true,
        attachmentId: "att-1",
        pose: {
          enabled: true,
          weight: 1,
          joints: [{ jointKey: "skin-0:joint-3", rotationOffset: [0, 0, 0.5, 0.866] }],
        },
        morph: {
          enabled: true,
          weight: 0.8,
          targets: [{ targetKey: "mesh-0:target-1", weightOffset: 0.3 }],
        },
      },
      {
        kind: "primitive",
        id: "prop-1",
        name: "책상",
        primitiveKind: "box",
        color: "#884422",
        transform: { position: [1, 0.5, -1], rotation: [0, 0, 0], scale: [2, 1, 1] },
        visible: false,
        locked: false,
        castsShadow: false,
        receivesShadow: true,
      },
    ],
    shots: [{ id: "shot-1", name: "오프닝 와이드" }],
    activeShotId: "shot-1",
  };
}

function makeCut() {
  return createStoryboardCutFromSceneCapture({
    cutId: "cut-1",
    cutNumber: 1,
    sceneId: "scene-ep12-cafe",
    document: makeDocument(),
    image: { ref: "capture-asset-1", width: 1600, height: 900 },
    capturedAt: "2026-10-14T00:00:00.000Z",
  });
}

describe("createStoryboardCutFromSceneCapture", () => {
  it("freezes camera, lighting, exposure and poses into the cut meta", () => {
    const cut = makeCut();
    expect(cut.sceneMeta.sceneId).toBe("scene-ep12-cafe");
    expect(cut.sceneMeta.shotId).toBe("shot-1");
    expect(cut.sceneMeta.camera.fovDegrees).toBe(42);
    expect(cut.sceneMeta.exposure).toBe(1.1);
    expect(cut.sceneMeta.lighting.key.intensity).toBe(1.2);
    expect(cut.sceneMeta.lighting.environment?.intensity).toBe(0.8);
    expect(cut.sceneMeta.poses).toHaveLength(2);
    expect(cut.sceneMeta.poses[0]?.pose?.joints[0]?.jointKey).toBe("skin-0:joint-3");
    expect(cut.sceneMeta.poses[1]?.pose).toBeNull();
    expect(cut.sceneMeta.image).toEqual({ ref: "capture-asset-1", width: 1600, height: 900 });
    expect(Object.isFrozen(cut.sceneMeta)).toBe(true);
    expect(Object.isFrozen(cut.sceneMeta.camera)).toBe(true);
  });

  it("derives the flat cut camera fields and aspect from the same snapshot", () => {
    const cut = makeCut();
    expect(cut.cameraPosition).toEqual([3, 2, 6]);
    expect(cut.cameraTarget).toEqual([0, 1.2, 0]);
    expect(cut.cameraFovDeg).toBe(42);
    expect(cut.cameraRollDeg).toBe(30);
    expect(cut.aspectRatio).toBe("16:9-cinematic");
    expect(cut.title).toBe("오프닝 와이드");
    expect(cut.characterIds).toEqual(["char-1"]);
  });

  it("is isolated from later edits of the source document", () => {
    const document = makeDocument();
    const cut = createStoryboardCutFromSceneCapture({
      cutId: "cut-1",
      cutNumber: 1,
      sceneId: "scene-1",
      document,
    });
    (document.camera.position as unknown as number[])[0] = 99;
    const model = document.nodes[0];
    if (model?.kind === "model" && model.pose) {
      (model.pose.joints[0] as unknown as { rotationOffset: number[] }).rotationOffset[2] = 9;
    }
    expect(cut.sceneMeta.camera.position[0]).toBe(3);
    expect(cut.sceneMeta.poses[0]?.pose?.joints[0]?.rotationOffset[2]).toBe(0.5);
  });

  it("fails closed on an unknown shot, empty scene id and invalid camera", () => {
    const document = makeDocument();
    expect(() =>
      createStoryboardCutFromSceneCapture({ cutId: "c", cutNumber: 1, sceneId: "s", document, shotId: "nope" }),
    ).toThrow(/없는 샷/);
    expect(() =>
      createStoryboardCutFromSceneCapture({ cutId: "c", cutNumber: 1, sceneId: " ", document }),
    ).toThrow();
    const badCamera = {
      ...document,
      camera: { ...document.camera, fovDegrees: 190 },
    };
    expect(() =>
      createStoryboardCutFromSceneCapture({ cutId: "c", cutNumber: 1, sceneId: "s", document: badCamera }),
    ).toThrow(/화각/);
    const nanCamera = {
      ...document,
      camera: { ...document.camera, position: [Number.NaN, 0, 0] as const },
    };
    expect(() =>
      createStoryboardCutFromSceneCapture({ cutId: "c", cutNumber: 1, sceneId: "s", document: nanCamera }),
    ).toThrow();
  });

  it("defaults to a square cut and a generated title without a shot or image", () => {
    const document = makeDocument();
    const cut = createStoryboardCutFromSceneCapture({
      cutId: "cut-9",
      cutNumber: 9,
      sceneId: "scene-1",
      sourceKind: "poser",
      document: { ...document, shots: undefined, activeShotId: undefined },
    });
    expect(cut.aspectRatio).toBe("1:1-square-medium");
    expect(cut.title).toBe("포저 씬 컷 9");
    expect(cut.sceneMeta.shotId).toBeNull();
    expect(storyboardSceneMetaBadgeKo(cut.sceneMeta)).toContain("포저 씬 연결");
  });
});

describe("cameraRollDegreesFromUp / nearestCutAspectRatio", () => {
  it("maps up vectors to dutch roll degrees", () => {
    expect(cameraRollDegreesFromUp(undefined)).toBe(0);
    expect(cameraRollDegreesFromUp([0, 1, 0])).toBe(0);
    expect(cameraRollDegreesFromUp(DUTCH_UP)).toBe(30);
    expect(cameraRollDegreesFromUp([-0.309, 0.951, 0])).toBeCloseTo(-18, 0);
  });

  it("picks the nearest aspect preset by log distance", () => {
    expect(nearestCutAspectRatio(21 / 9)).toBe("21:9-wide-action");
    expect(nearestCutAspectRatio(16 / 9)).toBe("16:9-cinematic");
    expect(nearestCutAspectRatio(1)).toBe("1:1-square-medium");
    expect(nearestCutAspectRatio(0.5)).toBe("9:16-vertical-climax");
    expect(() => nearestCutAspectRatio(0)).toThrow();
    expect(() => nearestCutAspectRatio(Number.NaN)).toThrow();
  });
});

describe("scene restore round-trip", () => {
  it("restores camera, lighting, exposure, poses and the active shot onto a changed document", () => {
    const cut = makeCut();
    const changed = makeDocument();
    const drifted: StoryboardSceneDocumentView = {
      ...changed,
      camera: { position: [9, 9, 9], target: [5, 5, 5], fovDegrees: 80 },
      render: { exposure: 0.4 },
      nodes: changed.nodes.map((node) =>
        node.kind === "model"
          ? { ...node, transform: { position: [7, 0, 7], rotation: [0, 0, 0], scale: [1, 1, 1] }, pose: undefined, morph: undefined }
          : node,
      ),
      activeShotId: undefined,
    };
    const patch = buildSceneRestorePatch(cut.sceneMeta, drifted);
    expect(patch.missingNodeIds).toEqual([]);
    expect(patch.warnings).toEqual([]);
    const restored = applySceneRestorePatch(drifted, patch);
    expect(restored.camera).toEqual(cut.sceneMeta.camera);
    expect(restored.lighting).toEqual(cut.sceneMeta.lighting);
    expect(restored.render.exposure).toBe(1.1);
    expect(restored.activeShotId).toBe("shot-1");
    const model = restored.nodes[0];
    expect(model?.kind).toBe("model");
    if (model?.kind === "model") {
      expect(model.pose?.joints[0]?.rotationOffset[2]).toBe(0.5);
      expect(model.morph?.targets[0]?.weightOffset).toBe(0.3);
      expect(model.transform.rotation).toEqual([0, 0.4, 0]);
    }
    // 원본 문서는 바뀌지 않는다.
    expect(drifted.camera.fovDegrees).toBe(80);
  });

  it("reports nodes and shots that no longer exist instead of dropping them silently", () => {
    const cut = makeCut();
    const shrunk: StoryboardSceneDocumentView = {
      ...makeDocument(),
      nodes: makeDocument().nodes.filter((node) => node.id === "char-1"),
      shots: [],
      activeShotId: undefined,
    };
    const patch = buildSceneRestorePatch(cut.sceneMeta, shrunk);
    expect(patch.shotId).toBeNull();
    expect(patch.missingNodeIds).toEqual(["prop-1"]);
    expect(patch.warnings).toContain("shot-missing:shot-1");
    expect(patch.warnings.some((warning) => warning.startsWith("nodes-missing:"))).toBe(true);
    const restored = applySceneRestorePatch({ ...shrunk, activeShotId: "stale" }, patch);
    expect("activeShotId" in restored && restored.activeShotId !== undefined).toBe(false);
    expect(restored.nodes).toHaveLength(1);
  });

  it("rejects a tampered meta when building a patch", () => {
    const cut = makeCut();
    const tampered = { ...cut.sceneMeta, camera: { ...cut.sceneMeta.camera, fovDegrees: 999 } };
    expect(() => buildSceneRestorePatch(tampered, makeDocument())).toThrow(/화각/);
  });
});

describe("meta access, reissue, serialization and return href", () => {
  it("reads meta only from valid linked cuts", () => {
    const cut = makeCut();
    expect(getStoryboardSceneMeta(cut)?.sceneId).toBe("scene-ep12-cafe");
    expect(asSceneLinkedStoryboardCut(cut)?.id).toBe("cut-1");
    const plain: StoryboardCut = {
      id: "plain",
      cutNumber: 2,
      title: "손 컷",
      aspectRatio: "1:1-square-medium",
      cameraPosition: [0, 1.6, 6],
      cameraTarget: [0, 1.4, 0],
      cameraFovDeg: 45,
      cameraRollDeg: 0,
      characterIds: [],
    };
    expect(getStoryboardSceneMeta(plain)).toBeNull();
    expect(asSceneLinkedStoryboardCut(plain)).toBeNull();
    const broken = { ...plain, sceneMeta: { ...cut.sceneMeta, version: 2 } } as unknown as StoryboardCut;
    expect(getStoryboardSceneMeta(broken)).toBeNull();
  });

  it("reissues a placed cut with a fresh id while sharing the frozen meta", () => {
    const cut = makeCut();
    const placed = reissueSceneLinkedCut(cut, { id: "cut-2", cutNumber: 5 });
    expect(placed.id).toBe("cut-2");
    expect(placed.cutNumber).toBe(5);
    expect(placed.sceneMeta).toBe(cut.sceneMeta);
    expect(() => reissueSceneLinkedCut(cut, { id: "", cutNumber: 2 })).toThrow();
  });

  it("round-trips through serialization and rejects foreign or oversized payloads", () => {
    const cut = makeCut();
    const text = serializeStoryboardSceneCutMeta(cut.sceneMeta);
    expect(parseStoryboardSceneCutMeta(text)).toEqual(cut.sceneMeta);
    expect(() => parseStoryboardSceneCutMeta(JSON.stringify({ kind: "other", version: 1 }))).toThrow();
    expect(() => parseStoryboardSceneCutMeta("x".repeat(300_000))).toThrow(/256KB/);
  });

  it("builds the scene return href with encoded identifiers", () => {
    const cut = makeCut();
    const href = buildSceneReturnHref(cut.sceneMeta, { episodeId: "ep 12", cutId: "cut-1" });
    expect(href.startsWith("/studio/new?")).toBe(true);
    const params = new URLSearchParams(href.slice("/studio/new?".length));
    expect(params.get("start")).toBe("bg3d");
    expect(params.get("scene")).toBe("scene-ep12-cafe");
    expect(params.get("shot")).toBe("shot-1");
    expect(params.get("cut")).toBe("cut-1");
    expect(params.get("episode")).toBe("ep 12");
  });

  it("keeps the meta inside the PSD export manifest cuts", () => {
    const cut = makeCut();
    const strip = new Studio3DStoryboardCutStrip([cut]);
    const manifest = strip.generatePsdExportManifest();
    expect(manifest.cuts[0]?.sceneMeta?.sceneId).toBe("scene-ep12-cafe");
    const roundTripped = JSON.parse(JSON.stringify(manifest)) as typeof manifest;
    expect(roundTripped.cuts[0]?.sceneMeta?.camera.fovDegrees).toBe(42);
  });

  it("summarizes the meta into a one-line badge", () => {
    const badge = storyboardSceneMetaBadgeKo(makeCut().sceneMeta);
    expect(badge).toBe("3D 씬 연결 · FOV 42° · 포즈 1개 · 조명 보존");
  });
});
