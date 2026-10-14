import { describe, expect, it } from "vitest";

import type {
  StudioBg3dCameraSettings,
  StudioBg3dLightingSettings,
  StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document-types";
import {
  acknowledgeAllStudioBg3dPlaceSetImpacts,
  acknowledgeStudioBg3dPlaceSetImpact,
  applyStudioBg3dPlaceSetStateToDocument,
  buildStudioBg3dPlaceSetImpactNotices,
  captureStudioBg3dPlaceSetState,
  createStudioBg3dPlaceSetPackage,
  diffStudioBg3dPlaceSetStates,
  getStudioBg3dPlaceSetLatestVersion,
  publishStudioBg3dPlaceSetVersion,
  resolveStudioBg3dPlaceSetStartState,
  summarizeStudioBg3dPlaceSetImpacts,
  type StudioBg3dPlaceSetState,
  type StudioBg3dPlaceSetUsageRef,
} from "./studio-bg3d-place-set-package";

const CAMERA: StudioBg3dCameraSettings = {
  position: [4, 2.4, 6],
  target: [0, 1, 0],
  fovDegrees: 40,
};

const LIGHTING: StudioBg3dLightingSettings = {
  ambientColor: "#cdd6e4",
  ambientIntensity: 0.55,
  key: { color: "#fff1d6", direction: [0.4, 0.8, 0.45], intensity: 2.2, castsShadow: true },
  fill: { color: "#bcd2ff", direction: [-0.6, 0.35, -0.4], intensity: 0.7, castsShadow: false },
};

function makeDocument(
  overrides: Partial<StudioBg3dSceneDocument> = {},
): StudioBg3dSceneDocument {
  return {
    kind: "toonstudio.bg3d-scene",
    version: 3,
    camera: CAMERA,
    lighting: LIGHTING,
    nodes: [
      {
        id: "node-desk",
        name: "책상",
        kind: "primitive",
        primitiveKind: "box",
        color: "#8a6f4d",
        transform: { position: [0, 0.45, 0], rotation: [0, 0, 0], scale: [1.6, 0.9, 0.8] },
        visible: true,
        locked: false,
        castsShadow: true,
        receivesShadow: true,
      },
      {
        id: "node-lamp",
        name: "스탠드",
        kind: "model",
        attachmentId: "att-lamp",
        transform: { position: [0.6, 0.9, 0.1], rotation: [0, 0, 0], scale: [1, 1, 1] },
        visible: true,
        locked: false,
        castsShadow: true,
        receivesShadow: false,
      },
    ],
    ...overrides,
  } as StudioBg3dSceneDocument;
}

function makeState(overrides: Partial<StudioBg3dPlaceSetState> = {}): StudioBg3dPlaceSetState {
  return { ...captureStudioBg3dPlaceSetState(makeDocument()), ...overrides };
}

const USAGES: readonly StudioBg3dPlaceSetUsageRef[] = [
  { episodeId: "ep-12", episodeLabel: "12화", shotId: "shot-3", shotLabel: "컷 3", appliedVersion: 1 },
  { episodeId: "ep-13", episodeLabel: "13화", shotId: null, shotLabel: null, appliedVersion: 1 },
];

describe("studio-bg3d-place-set-package", () => {
  it("씬 문서에서 카메라·조명·소품 정본 상태를 캡처한다", () => {
    const state = captureStudioBg3dPlaceSetState(makeDocument(), {
      environmentAssetId: "ts-bg3d-stylized_cafe_interior-v1",
    });
    expect(state.camera).toEqual(CAMERA);
    expect(state.lighting.key.intensity).toBe(2.2);
    expect(state.environmentAssetId).toBe("ts-bg3d-stylized_cafe_interior-v1");
    expect(state.props.map((prop) => prop.nodeId)).toEqual(["node-desk", "node-lamp"]);
    expect(state.props[1]?.attachmentId).toBe("att-lamp");
  });

  it("propNodeIds를 주면 그 노드만 소품으로 고정한다", () => {
    const state = captureStudioBg3dPlaceSetState(makeDocument(), {
      propNodeIds: ["node-lamp"],
    });
    expect(state.props).toHaveLength(1);
    expect(state.props[0]?.nodeId).toBe("node-lamp");
  });

  it("세트를 열면 마지막 정본 상태로 시작한다", () => {
    const v1 = makeState();
    const placeSet = createStudioBg3dPlaceSetPackage({
      placeId: "place-cafe",
      placeName: "단골 카페",
      state: v1,
      createdAt: "2026-10-14T00:00:00.000Z",
    });
    const moved = makeState({
      props: v1.props.map((prop) =>
        prop.nodeId === "node-desk"
          ? { ...prop, transform: { ...prop.transform, position: [1, 0.45, 0] as const } }
          : prop,
      ),
    });
    const published = publishStudioBg3dPlaceSetVersion(placeSet, moved, {
      createdAt: "2026-10-14T01:00:00.000Z",
      note: "책상을 창가로 이동",
    });
    expect(published.publishedVersion?.version).toBe(2);
    const start = resolveStudioBg3dPlaceSetStartState(published.placeSet);
    expect(start?.props.find((prop) => prop.nodeId === "node-desk")?.transform.position).toEqual([
      1, 0.45, 0,
    ]);
    expect(getStudioBg3dPlaceSetLatestVersion(published.placeSet)?.note).toBe(
      "책상을 창가로 이동",
    );
  });

  it("변경이 없으면 새 버전을 발행하지 않는다", () => {
    const placeSet = createStudioBg3dPlaceSetPackage({
      placeId: "place-cafe",
      placeName: "단골 카페",
      state: makeState(),
      createdAt: "2026-10-14T00:00:00.000Z",
    });
    const result = publishStudioBg3dPlaceSetVersion(placeSet, makeState(), {
      createdAt: "2026-10-14T02:00:00.000Z",
    });
    expect(result.publishedVersion).toBeNull();
    expect(result.placeSet.versions).toHaveLength(1);
  });

  it("카메라·조명·소품 이동·가시성·추가·제거를 구분해 diff 한다", () => {
    const before = makeState();
    const after = makeState({
      camera: { ...CAMERA, fovDegrees: 50 },
      props: [
        { ...before.props[0]!, visible: false },
        {
          nodeId: "node-plant",
          name: "화분",
          kind: "primitive",
          primitiveKind: "cylinder",
          transform: { position: [-1, 0.3, 0.5], rotation: [0, 0, 0], scale: [0.4, 0.6, 0.4] },
          visible: true,
        },
      ],
    });
    const kinds = diffStudioBg3dPlaceSetStates(before, after).map((change) => change.kind);
    expect(kinds).toEqual(["camera", "prop-visibility", "prop-added", "prop-removed"]);
  });

  it("정본 적용 시 카메라·조명은 교체되고 없는 소품은 건너뛰어 보고한다", () => {
    const state = makeState({
      camera: { ...CAMERA, position: [9, 9, 9] },
      props: [
        ...makeState().props,
        {
          nodeId: "node-missing",
          name: "없는 소품",
          kind: "primitive",
          primitiveKind: "box",
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          visible: true,
        },
      ],
    });
    const applied = applyStudioBg3dPlaceSetStateToDocument(makeDocument(), state);
    expect(applied.document.camera.position).toEqual([9, 9, 9]);
    expect(applied.skippedPropNodeIds).toEqual(["node-missing"]);
    expect(applied.document.nodes).toHaveLength(2);
  });

  it("정본이 오르면 옛 버전을 쓴 사용처에만 결정적 id의 영향 알림이 간다", () => {
    const v1 = makeState();
    const placeSet = createStudioBg3dPlaceSetPackage({
      placeId: "place-cafe",
      placeName: "단골 카페",
      state: v1,
      createdAt: "2026-10-14T00:00:00.000Z",
    });
    const brighter = makeState({
      lighting: { ...LIGHTING, ambientIntensity: 0.9 },
    });
    const { placeSet: updated } = publishStudioBg3dPlaceSetVersion(placeSet, brighter, {
      createdAt: "2026-10-14T01:00:00.000Z",
    });
    const usages: readonly StudioBg3dPlaceSetUsageRef[] = [
      ...USAGES,
      { episodeId: "ep-14", episodeLabel: "14화", shotId: null, shotLabel: null, appliedVersion: 2 },
    ];
    const notices = buildStudioBg3dPlaceSetImpactNotices(updated, usages);
    expect(notices).toHaveLength(2);
    expect(notices[0]?.fromVersion).toBe(1);
    expect(notices[0]?.toVersion).toBe(2);
    expect(notices[0]?.changes.map((change) => change.kind)).toEqual(["lighting"]);
    // 재계산해도 같은 id → 중복 알림이 생기지 않는다.
    expect(buildStudioBg3dPlaceSetImpactNotices(updated, usages)[0]?.id).toBe(notices[0]?.id);
  });

  it("확인 전에는 배지 집계에 남고 전부 확인하면 0이 된다", () => {
    const placeSet = createStudioBg3dPlaceSetPackage({
      placeId: "place-cafe",
      placeName: "단골 카페",
      state: makeState(),
      createdAt: "2026-10-14T00:00:00.000Z",
    });
    const { placeSet: updated } = publishStudioBg3dPlaceSetVersion(
      placeSet,
      makeState({ camera: { ...CAMERA, fovDegrees: 35 } }),
      { createdAt: "2026-10-14T01:00:00.000Z" },
    );
    const notices = buildStudioBg3dPlaceSetImpactNotices(updated, USAGES);
    let acknowledged = acknowledgeStudioBg3dPlaceSetImpact([], notices[0]!.id);
    expect(summarizeStudioBg3dPlaceSetImpacts(notices, acknowledged).unacknowledgedCount).toBe(1);
    acknowledged = acknowledgeAllStudioBg3dPlaceSetImpacts(notices);
    expect(summarizeStudioBg3dPlaceSetImpacts(notices, acknowledged).unacknowledgedCount).toBe(0);
  });
});
