// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { violatesErrorPattern } from "@/shared/language/error-pattern";
import { findToneViolations } from "@/shared/language/tone-policy";

import { COMPOSITE_PRESETS, instantiateCompositePreset } from "../studio-background-3d-composites";
import { KITBASH_V10_BG_OBJECT_PRESETS } from "../studio-background-3d-kitbash-presets";
import {
  encodeBg3dSceneHash,
  parseBg3dSceneFromDataUrl,
  type BgPrimitive,
} from "../studio-background-3d-metadata";
import {
  encodeBg3dSceneWithModelsHash,
  parseBg3dSceneWithModelsFromDataUrl,
} from "../studio-background-3d-model";
import { clonePrimitives, makeGeometry } from "../studio-background-3d-primitives";
import { StudioBg3dBackgroundObjectClusterSection } from "./StudioBg3dBackgroundObjectClusterSection";
import { StudioBg3dWebtoonBackgroundPicker } from "./StudioBg3dWebtoonBackgroundPicker";
import {
  STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES,
  buildBg3dObjectClusterPrimitives,
  composeWorldYawWithLocalEulerXyz,
  createBg3dClusterUniqueInstanceKey,
  measureBg3dPrimitivesWorldBounds,
  resolveBg3dClusterPlacementOrdinal,
  searchStudioBg3dObjectClusterArchetypes,
} from "./studio-bg3d-background-object-cluster";
import { attachStudioBg3dEditorSceneOpsHost } from "./studio-bg3d-editor-scene-ops-host";
import { findStudioBg3dEssentialAsset } from "./studio-bg3d-essential-pose-prop-catalog";
import {
  collectStudioBg3dEffectivelyVisibleEntityIds,
  withStudioBg3dHiddenTags,
} from "./studio-bg3d-hierarchy";
import { prepareStudioBg3dTemplateSave } from "./studio-bg3d-measurement-template";
import { getStudioBg3dRoomPreset } from "./studio-bg3d-room-builder";
import {
  createDefaultStudioBg3dSceneDocument,
  parseStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import {
  adaptStudioBg3dRuntimeToDocument,
  hydrateStudioBg3dDocumentToRuntime,
} from "./studio-bg3d-scene-runtime";
import { createStudioBg3dWorkbenchInsertionFromHost } from "./studio-bg3d-workbench-insertion";

vi.mock("./studio-bg3d-editor-runtime-bindings", async () => {
  const react = await import("react");
  const rooms = await import("./studio-bg3d-room-builder");
  const composites = await import("../studio-background-3d-composites");
  const prims = await import("../studio-background-3d-primitives");
  const derivations = await import("./studio-bg3d-editor-derivations");
  const physicsUi = await import("./studio-bg3d-physics-ui");
  const sceneDoc = await import("./studio-bg3d-scene-document");
  const sceneRemoval = await import("./studio-bg3d-scene-removal");
  const sceneRuntime = await import("./studio-bg3d-scene-runtime");
  return {
    ...react,
    DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT: sceneDoc.DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES: sceneDoc.STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES,
    planStudioBg3dRoomBuild: rooms.planStudioBg3dRoomBuild,
    COMPOSITE_PRESETS: composites.COMPOSITE_PRESETS,
    instantiateCompositePreset: composites.instantiateCompositePreset,
    clonePrimitives: prims.clonePrimitives,
    createPrimitive: prims.createPrimitive,
    duplicatePrimitive: prims.duplicatePrimitive,
    cloneBgCustomModelInstances: (value: unknown) => structuredClone(value),
    createStudioBg3dHistorySnapshot: derivations.createStudioBg3dHistorySnapshot,
    studioBg3dHistoryDocumentAtView: derivations.studioBg3dHistoryDocumentAtView,
    applyOrDeferStudioBg3dHistoryCamera: vi.fn(),
    isStudioBg3dPhysicsTransientPhase: physicsUi.isStudioBg3dPhysicsTransientPhase,
    planStudioBg3dSceneEntityRemoval: sceneRemoval.planStudioBg3dSceneEntityRemoval,
    tryAdaptStudioBg3dRuntimeToDocument: sceneRuntime.tryAdaptStudioBg3dRuntimeToDocument,
    hydrateStudioBg3dDocumentToRuntime: sceneRuntime.hydrateStudioBg3dDocumentToRuntime,
  };
});

const NODE_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,79}$/u;

function computeThreeWorldBox(primitives: readonly BgPrimitive[]): THREE.Box3 {
  const total = new THREE.Box3();
  for (const prim of primitives) {
    const geom = makeGeometry(prim.kind);
    geom.computeBoundingBox();
    const mat = new THREE.Matrix4().compose(
      new THREE.Vector3(...prim.position),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(prim.rotation[0], prim.rotation[1], prim.rotation[2], "XYZ"),
      ),
      new THREE.Vector3(...prim.scale),
    );
    const partBox = geom.boundingBox!.clone().applyMatrix4(mat);
    expect(partBox.min.y, `${prim.id} penetrated floor`).toBeGreaterThanOrEqual(-1e-3);
    total.union(partBox);
    geom.dispose();
  }
  return total;
}

function useLiveBg3dOpsHost(
  seedPrimitives: readonly BgPrimitive[] = [],
  seedDocument?: StudioBg3dSceneDocument,
) {
  const initialDoc = seedDocument ?? createDefaultStudioBg3dSceneDocument();
  const [primitives, setPrimitives] = useState<readonly BgPrimitive[]>(seedPrimitives);
  const [customModels, setCustomModels] = useState<object[]>([]);
  const [document, setSceneBaseDocument] = useState(initialDoc);
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const hostRef = useRef<Record<string, unknown> | null>(null);
  if (!hostRef.current) {
    hostRef.current = {
      open: true,
      modelRenderer: {},
      isRestoringScene: false,
      isCapturing: false,
      isBatchRenderingShots: false,
      physicsInteractionLocked: false,
      isUploadingModel: false,
      isSavingTemplate: false,
      applyingTemplateId: null,
      hasPendingClone: false,
      hasCloneFailure: false,
      physicsPhaseRef: { current: "idle" },
      physicsRuntimeSourceRef: { current: null },
      attachmentByStorageModelIdRef: { current: new Map() },
      viewportApiRef: {
        current: {
          readView: () => initialDoc.camera,
        },
      },
      pendingInitialCameraRef: { current: null },
      historyRef: { current: [] },
      historyIndexRef: { current: -1 },
      historyCommandTimelineRef: { current: null },
      setError: vi.fn(),
    };
  }
  const h = hostRef.current as Record<string, any>;
  Object.assign(h, {
    primitives,
    customModels,
    sceneBaseDocument: document,
    selectedIds,
    canUndo,
    canRedo,
    setPrimitives,
    setCustomModels,
    setSceneBaseDocument,
    setSelectedIds,
    setCanUndo,
    setCanRedo,
    roomBuilderSpec: getStudioBg3dRoomPreset("classroom")!.spec,
  });
  h.physicsRuntimeSourceRef.current = {
    primitives,
    customModels,
    document,
    revision: h.physicsRuntimeSourceRef.current?.revision ?? 0,
  };
  h.replaceCanonicalDocumentState = (mutation: {
    primitives?: readonly BgPrimitive[];
    customModels?: readonly object[];
    document?: StudioBg3dSceneDocument;
  }) => {
    const cur = h.physicsRuntimeSourceRef.current;
    const next = {
      primitives: mutation.primitives !== undefined ? [...mutation.primitives] : cur.primitives,
      customModels:
        mutation.customModels !== undefined ? [...mutation.customModels] : cur.customModels,
      document: mutation.document ?? cur.document,
      revision: cur.revision + 1,
    };
    h.physicsRuntimeSourceRef.current = next;
    if (mutation.primitives !== undefined) setPrimitives(next.primitives);
    if (mutation.customModels !== undefined) setCustomModels(next.customModels);
    if (mutation.document !== undefined) setSceneBaseDocument(mutation.document);
    return next;
  };
  attachStudioBg3dEditorSceneOpsHost(h);
  return h;
}

describe("studio-bg3d-background-object-cluster — 6 core flows + post-reload persistence & a11y", () => {
  afterEach(() => {
    cleanup();
  });

  it("1. 바닥 접지 & 스케일: 8종 클러스터와 V10 복합 프리셋이 실제 makeGeometry 메쉬 기준 y=0에 정확히 접지되고 비박스 도형 미터 규격을 지킨다", () => {
    expect(STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES).toHaveLength(8);

    for (const arch of STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES) {
      const linkedGlb = findStudioBg3dEssentialAsset(arch.v10GlbAssetId);
      expect(linkedGlb).toBeDefined();
      expect(linkedGlb?.category).toBe("kitbash-v10-prop-3d");

      for (const arrangement of ["linear-wall", "l-corner", "staggered-street"] as const) {
        const built = buildBg3dObjectClusterPrimitives({
          archetype: arch.id,
          moduleCount: 2,
          clutterDensity: "lived-in",
          arrangement,
          surfaceTheme: "daylight-neutral",
        });

        const threeBox = computeThreeWorldBox(built.primitives);
        expect(Math.abs(threeBox.min.y), `${arch.id} (${arrangement}) floating`).toBeLessThanOrEqual(
          2e-3,
        );

        const measured = measureBg3dPrimitivesWorldBounds(built.primitives);
        expect(Math.abs(measured.min[1])).toBeLessThanOrEqual(2e-3);
      }
    }

    // 비박스(cylinder / cone / torus) 스케일 1:1 미터 보정 검증
    const patio = buildBg3dObjectClusterPrimitives({
      archetype: "convenience-patio-street-furniture",
      moduleCount: 1,
      clutterDensity: "lived-in",
      arrangement: "linear-wall",
      surfaceTheme: "daylight-neutral",
    });
    const roundTable = patio.primitives.find((p) => p.id.endsWith("-patio-tbl"))!;
    const parasol = patio.primitives.find((p) => p.id.endsWith("-parasol"))!;
    expect(computeThreeWorldBox([roundTable]).getSize(new THREE.Vector3()).x).toBeCloseTo(0.76, 2);
    expect(computeThreeWorldBox([parasol]).getSize(new THREE.Vector3()).x).toBeCloseTo(1.55, 2);

    const alchemy = buildBg3dObjectClusterPrimitives({
      archetype: "fantasy-dungeon-alchemy-props",
      moduleCount: 1,
      clutterDensity: "lived-in",
      arrangement: "linear-wall",
      surfaceTheme: "warm-wood",
    });
    const archTorus = alchemy.primitives.find((p) => p.id.endsWith("-arch"))!;
    expect(computeThreeWorldBox([archTorus]).getSize(new THREE.Vector3()).x).toBeCloseTo(1.36, 2);

    // KITBASH_V10_BG_OBJECT_PRESETS 8종 실제 지오메트리 접지 검증
    expect(KITBASH_V10_BG_OBJECT_PRESETS).toHaveLength(8);
    const compositeIds = new Set(COMPOSITE_PRESETS.map((p) => p.id));
    for (const preset of KITBASH_V10_BG_OBJECT_PRESETS) {
      expect(compositeIds.has(preset.id)).toBe(true);
      const instanced = instantiateCompositePreset(preset, 0);
      const box = computeThreeWorldBox(instanced);
      expect(Math.abs(box.min.y), `${preset.id} min.y`).toBeLessThanOrEqual(2e-3);
    }
  });

  it("2. 회전: composeWorldYawWithLocalEulerXyz가 Three.js 'XYZ' 행렬 합성과 일치해 ㄱ자 코너 배치에서도 짐벌락 없이 회전한다", () => {
    const sampleLocalRots: ReadonlyArray<readonly [number, number, number]> = [
      [Math.PI / 2, 0, 0],
      [-0.62, 0, 0],
      [0.18, 0, 0],
      [-Math.PI / 2, 0, Math.PI / 2],
      [0.35, -0.42, 0.19],
    ];
    for (const yaw of [-Math.PI / 2, Math.PI / 2, Math.PI, -0.75]) {
      const mYaw = new THREE.Matrix4().makeRotationY(yaw);
      for (const local of sampleLocalRots) {
        const expectedMat = mYaw
          .clone()
          .multiply(
            new THREE.Matrix4().makeRotationFromEuler(
              new THREE.Euler(local[0], local[1], local[2], "XYZ"),
            ),
          );
        const composed = composeWorldYawWithLocalEulerXyz(local, yaw);
        const actualMat = new THREE.Matrix4().makeRotationFromEuler(
          new THREE.Euler(composed[0], composed[1], composed[2], "XYZ"),
        );
        for (let i = 0; i < 16; i += 1) {
          expect(actualMat.elements[i]).toBeCloseTo(expectedMat.elements[i]!, 4);
        }
      }
    }

    const classroomCorner = buildBg3dObjectClusterPrimitives({
      archetype: "classroom-front-locker-rig",
      moduleCount: 2,
      clutterDensity: "detailed",
      arrangement: "l-corner",
      surfaceTheme: "daylight-neutral",
    });
    const cornerClock = classroomCorner.primitives.find((p) => p.id.endsWith("-m2-clock"))!;
    const clockNormal = new THREE.Vector3(0, 1, 0).applyEuler(
      new THREE.Euler(
        cornerClock.rotation[0],
        cornerClock.rotation[1],
        cornerClock.rotation[2],
        "XYZ",
      ),
    );
    expect(Math.abs(clockNormal.x)).toBeCloseTo(1, 3);
    expect(Math.abs(clockNormal.z)).toBeLessThan(1e-3);
  });

  it("3~5. 중복 삽입 · Undo/Redo · 저장/복원 후 재삽입: 문서 v3 · 사용자 템플릿 · DataURL 해시 왕복 및 탭 재마운트 후 재삽입까지 ID 충돌·중첩 없이 통과한다", () => {
    // 소수 기존 도형(5개) 상태에서 연속 삽입해도 순번이 충돌하지 않는지 확인
    const usedOrds = new Set<number>();
    expect(resolveBg3dClusterPlacementOrdinal(0, 22, usedOrds)).toBe(0);
    expect(resolveBg3dClusterPlacementOrdinal(5, 22, usedOrds)).toBe(1);
    expect(resolveBg3dClusterPlacementOrdinal(27, 22, usedOrds)).toBe(2);
    expect(resolveBg3dClusterPlacementOrdinal(27, 22, usedOrds)).toBe(3);
    expect(createBg3dClusterUniqueInstanceKey("p")).not.toBe(createBg3dClusterUniqueInstanceKey("p"));

    const hostHook = renderHook(() => useLiveBg3dOpsHost());

    const picker = render(
      <StudioBg3dWebtoonBackgroundPicker
        autoCutaway={false}
        onAutoCutawayChange={vi.fn()}
        onBuild={(buildParts, options) => hostHook.result.current.addGeneratedParts(buildParts, options)}
      />,
    );

    fireEvent.click(screen.getByTestId("bg3d-object-cluster-toggle"));
    fireEvent.click(screen.getByTestId("bg3d-object-cluster-arch-classroom-front-locker-rig"));

    // 1차 삽입 & 2차 중복 삽입 (피커 경유)
    act(() => {
      fireEvent.click(screen.getByTestId("bg3d-object-cluster-insert-btn"));
    });
    const afterFirstCount = hostHook.result.current.primitives.length;
    expect(afterFirstCount).toBeGreaterThanOrEqual(16);
    expect(hostHook.result.current.canUndo).toBe(true);
    expect(hostHook.result.current.selectedIds.size).toBe(afterFirstCount);

    act(() => {
      fireEvent.click(screen.getByTestId("bg3d-object-cluster-insert-btn"));
    });
    const afterSecond: readonly BgPrimitive[] = hostHook.result.current.primitives;
    expect(afterSecond).toHaveLength(afterFirstCount * 2);

    const uniqueIds = new Set(afterSecond.map((p) => p.id));
    expect(uniqueIds.size).toBe(afterSecond.length);
    for (const id of uniqueIds) {
      expect(NODE_ID_REGEX.test(id)).toBe(true);
    }

    // 1차 클러스터와 2차 클러스터가 겹치지 않고 X축으로 분리됐는지 검증
    const box1 = computeThreeWorldBox(afterSecond.slice(0, afterFirstCount));
    const box2 = computeThreeWorldBox(afterSecond.slice(afterFirstCount));
    expect(box1.intersectsBox(box2)).toBe(false);

    // Undo 2단계 → 빈 장면 → Redo 2단계 복원 및 clonePrimitives 참조 격리 검증
    act(() => {
      hostHook.result.current.doUndo();
    });
    expect(hostHook.result.current.primitives).toHaveLength(afterFirstCount);
    expect(hostHook.result.current.canRedo).toBe(true);

    act(() => {
      hostHook.result.current.doUndo();
    });
    expect(hostHook.result.current.primitives).toHaveLength(0);

    act(() => {
      hostHook.result.current.doRedo();
      hostHook.result.current.doRedo();
    });
    expect(hostHook.result.current.primitives).toEqual(afterSecond);

    const cloned = clonePrimitives([...afterSecond]);
    (cloned[0]!.tags as string[]).push("Mutated_Tag");
    expect(afterSecond[0]!.tags).not.toContain("Mutated_Tag");

    // 저장/복원 1: 사용자 템플릿 엄격 무손실 저장(prepareStudioBg3dTemplateSave) 통과 검증
    const templateSaved = prepareStudioBg3dTemplateSave({
      snapshot: {
        primitives: afterSecond,
        customModels: [],
        document: hostHook.result.current.sceneBaseDocument,
      },
      camera: hostHook.result.current.sceneBaseDocument.camera,
      attachmentByStorageModelId: new Map(),
    });
    expect(templateSaved.counts.droppedPrimitives).toBe(0);
    expect(templateSaved.diagnostics).toEqual([]);

    // 저장/복원 2: 장면 문서 v3 + 숨긴 태그 메타 저장 → 파싱 → 새 호스트 복원 → 피커 재마운트 후 동일 아키타입 추가 삽입
    const docWithHiddenTag: StudioBg3dSceneDocument = {
      ...hostHook.result.current.sceneBaseDocument,
      meta: withStudioBg3dHiddenTags(hostHook.result.current.sceneBaseDocument.meta, [
        "BgObject_Cluster_V10",
      ]),
    };
    const saved = adaptStudioBg3dRuntimeToDocument({
      primitives: afterSecond,
      customModels: [],
      attachmentByStorageModelId: new Map(),
      baseDocument: docWithHiddenTag,
    });
    expect(saved.counts.droppedPrimitives).toBe(0);
    expect(saved.diagnostics).toEqual([]);

    const parsedDoc = parseStudioBg3dSceneDocument(saved.serialized);
    expect(parsedDoc).not.toBeNull();
    expect(parsedDoc!.meta?.hiddenTags).toEqual(["BgObject_Cluster_V10"]);

    const reopened = hydrateStudioBg3dDocumentToRuntime({
      document: parsedDoc!,
      storageModelIdByAttachmentId: new Map(),
    });
    expect(reopened.ok).toBe(true);
    expect(reopened.primitives).toEqual(afterSecond);
    expect(reopened.primitives[0]?.tags).toEqual(["BgCluster_class", "BgObject_Cluster_V10"]);
    expect(
      collectStudioBg3dEffectivelyVisibleEntityIds(
        reopened.primitives,
        new Set(parsedDoc!.meta?.hiddenTags ?? []),
      ).size,
    ).toBe(0);
    expect(collectStudioBg3dEffectivelyVisibleEntityIds(reopened.primitives).size).toBe(
      afterSecond.length,
    );

    // 8종 전체 아키타입(ㄱ자 코너 회전 포함) 문서 v3 직렬화·역직렬화 무손실 deepEqual 검증
    for (const arch of STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES) {
      const cornerBuilt = buildBg3dObjectClusterPrimitives({
        archetype: arch.id,
        moduleCount: 2,
        clutterDensity: "lived-in",
        arrangement: "l-corner",
        surfaceTheme: "daylight-neutral",
      });
      const cornerSaved = adaptStudioBg3dRuntimeToDocument({
        primitives: cornerBuilt.primitives,
        customModels: [],
        attachmentByStorageModelId: new Map(),
      });
      expect(cornerSaved.counts.droppedPrimitives).toBe(0);
      expect(cornerSaved.diagnostics).toEqual([]);
      const cornerHydrated = hydrateStudioBg3dDocumentToRuntime({
        document: parseStudioBg3dSceneDocument(cornerSaved.serialized)!,
        storageModelIdByAttachmentId: new Map(),
      });
      expect(cornerHydrated.primitives).toEqual(cornerBuilt.primitives);
    }

    // 저장/복원 3: PNG 캡처 DataURL 해시(레거시 + 모델 확장 해시) 왕복 검증
    const legacyDataUrl = `data:image/png;base64,AAAA#${encodeBg3dSceneHash([...afterSecond])}`;
    expect(parseBg3dSceneFromDataUrl(legacyDataUrl)).toEqual(afterSecond);
    const fullDataUrl = `data:image/png;base64,AAAA#${encodeBg3dSceneWithModelsHash([...afterSecond], [])}`;
    expect(parseBg3dSceneWithModelsFromDataUrl(fullDataUrl)).toEqual({
      primitives: afterSecond,
      customModels: [],
    });

    picker.unmount();
    hostHook.unmount();

    // 복원된 장면을 새 에디터 세션으로 열고 새로 마운트된 피커에서 같은 아키타입을 다시 배치해도
    // duplicate-node-id 거부나 좌표 중첩 없이 3번째 클러스터가 추가·재저장되는지 검증
    const restoredHostHook = renderHook(() =>
      useLiveBg3dOpsHost(reopened.primitives, parsedDoc!),
    );
    const remountedPicker = render(
      <StudioBg3dWebtoonBackgroundPicker
        autoCutaway={false}
        onAutoCutawayChange={vi.fn()}
        onBuild={(buildParts, options) =>
          restoredHostHook.result.current.addGeneratedParts(buildParts, options)
        }
      />,
    );

    fireEvent.click(screen.getByTestId("bg3d-object-cluster-toggle"));
    fireEvent.click(screen.getByTestId("bg3d-object-cluster-arch-classroom-front-locker-rig"));
    act(() => {
      fireEvent.click(screen.getByTestId("bg3d-object-cluster-insert-btn"));
    });

    const afterPostReloadInsert: readonly BgPrimitive[] =
      restoredHostHook.result.current.primitives;
    expect(afterPostReloadInsert).toHaveLength(afterFirstCount * 3);
    expect(new Set(afterPostReloadInsert.map((p) => p.id)).size).toBe(afterFirstCount * 3);

    const box3 = computeThreeWorldBox(afterPostReloadInsert.slice(afterFirstCount * 2));
    expect(box1.intersectsBox(box3)).toBe(false);
    expect(box2.intersectsBox(box3)).toBe(false);

    const resaved = adaptStudioBg3dRuntimeToDocument({
      primitives: afterPostReloadInsert,
      customModels: [],
      attachmentByStorageModelId: new Map(),
      baseDocument: restoredHostHook.result.current.sceneBaseDocument,
    });
    expect(resaved.counts.droppedPrimitives).toBe(0);
    expect(resaved.diagnostics).toEqual([]);

    remountedPicker.unmount();

    // 공간 모델러 워크벤치 삽입 경로 2회 연속 배치 비중첩 검증
    const workbenchInsert = createStudioBg3dWorkbenchInsertionFromHost(
      restoredHostHook.result.current,
      {
        selectAllInserted: true,
        immediateHistory: true,
      },
    );
    render(
      <StudioBg3dBackgroundObjectClusterSection
        defaultExpanded
        onInsertScenePrimitives={workbenchInsert}
      />,
    );
    const beforeWb = restoredHostHook.result.current.primitives.length;
    act(() => {
      fireEvent.click(screen.getByTestId("bg3d-object-cluster-insert-btn"));
    });
    const afterWb1 = restoredHostHook.result.current.primitives.length;
    act(() => {
      fireEvent.click(screen.getByTestId("bg3d-object-cluster-insert-btn"));
    });
    const afterWb2 = restoredHostHook.result.current.primitives.length;
    const wbChunk1 = restoredHostHook.result.current.primitives.slice(beforeWb, afterWb1);
    const wbChunk2 = restoredHostHook.result.current.primitives.slice(afterWb1, afterWb2);
    expect(wbChunk1.length).toBeGreaterThan(10);
    expect(wbChunk2.length).toBe(wbChunk1.length);
    expect(computeThreeWorldBox(wbChunk1).intersectsBox(computeThreeWorldBox(wbChunk2))).toBe(false);

    restoredHostHook.unmount();
  });

  it("6. 검색·키보드 접근성·말투 가드: 고유 aria-controls/useId, 라디오그룹 방향키·Home·End 이동, 검색 초기화 포커스 복귀 및 해요체 가드를 만족한다", () => {
    expect(searchStudioBg3dObjectClusterArchetypes("장독대").map((x) => x.id)).toEqual([
      "hanok-jangdokdae-stone-wall",
    ]);
    expect(searchStudioBg3dObjectClusterArchetypes("포션 촛대").map((x) => x.id)).toEqual([
      "fantasy-dungeon-alchemy-props",
    ]);

    // 접힌 상태에서 깨진 aria-controls 참조가 없으며, 두 섹션이 동시 마운트돼도 DOM id가 충돌하지 않는지 검증
    const multiRender = render(
      <div>
        <StudioBg3dBackgroundObjectClusterSection onInsertScenePrimitives={() => true} />
        <StudioBg3dBackgroundObjectClusterSection
          defaultExpanded
          onInsertScenePrimitives={() => true}
        />
        <StudioBg3dBackgroundObjectClusterSection
          defaultExpanded
          disabled
          onInsertScenePrimitives={() => true}
        />
      </div>,
    );
    const toggles = screen.getAllByTestId("bg3d-object-cluster-toggle");
    expect(toggles[0]!.getAttribute("aria-expanded")).toBe("false");
    expect(toggles[0]!.getAttribute("aria-controls")).toBeNull();
    const expandedId1 = toggles[1]!.getAttribute("aria-controls");
    const expandedId2 = toggles[2]!.getAttribute("aria-controls");
    expect(expandedId1).toBeTruthy();
    expect(expandedId2).toBeTruthy();
    expect(expandedId1).not.toBe(expandedId2);
    expect(document.getElementById(expandedId1!)).not.toBeNull();
    expect(document.getElementById(expandedId2!)).not.toBeNull();

    // disabled 상태에서 키보드 방향키가 선택을 바꾸지 않는지 검증
    const disabledAlley = screen.getAllByTestId(
      "bg3d-object-cluster-arch-alley-wall-utility-clutter",
    )[1]!;
    fireEvent.keyDown(disabledAlley, { key: "ArrowRight" });
    expect(disabledAlley.getAttribute("aria-checked")).toBe("true");
    multiRender.unmount();

    const onInsert = vi.fn(() => true);
    const { container } = render(
      <StudioBg3dBackgroundObjectClusterSection
        defaultExpanded
        onInsertScenePrimitives={onInsert}
      />,
    );

    // 라디오그룹 로빙 탭인덱스 및 방향키/End/Home 이동 검증
    const firstRadio = screen.getByTestId(
      "bg3d-object-cluster-arch-alley-wall-utility-clutter",
    );
    const secondRadio = screen.getByTestId(
      "bg3d-object-cluster-arch-classroom-front-locker-rig",
    );
    const lastRadio = screen.getByTestId(
      "bg3d-object-cluster-arch-fantasy-dungeon-alchemy-props",
    );
    expect(firstRadio.getAttribute("aria-checked")).toBe("true");
    expect(firstRadio.tabIndex).toBe(0);
    expect(secondRadio.tabIndex).toBe(-1);

    firstRadio.focus();
    fireEvent.keyDown(firstRadio, { key: "ArrowRight" });
    expect(secondRadio.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(secondRadio);

    fireEvent.keyDown(secondRadio, { key: "End" });
    expect(lastRadio.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(lastRadio);

    // 밀도·배치 대형 라디오그룹 키보드 전환 + 상태 요약 role="status" 확인
    expect(screen.getByTestId("bg3d-object-cluster-readout").getAttribute("role")).toBe("status");
    const livedInRadio = screen.getByTestId("bg3d-object-cluster-density-lived-in");
    livedInRadio.focus();
    fireEvent.keyDown(livedInRadio, { key: "Home" });
    expect(
      screen.getByTestId("bg3d-object-cluster-density-essential").getAttribute("aria-checked"),
    ).toBe("true");

    const linearArr = screen.getByTestId("bg3d-object-cluster-arr-linear-wall");
    linearArr.focus();
    fireEvent.keyDown(linearArr, { key: "ArrowRight" });
    expect(
      screen.getByTestId("bg3d-object-cluster-arr-l-corner").getAttribute("aria-checked"),
    ).toBe("true");

    // 검색 필터링, 검색 지우기 버튼 클릭 시 검색창 포커스 복귀, 빈 결과 말투/오류 문형 가드, Escape 초기화
    const searchInput = screen.getByTestId("bg3d-object-cluster-search-input");
    fireEvent.change(searchInput, { target: { value: "장독대" } });
    expect(screen.getByTestId("bg3d-object-cluster-match-count").textContent).toBe("1/8종");
    expect(screen.getByTestId("bg3d-object-cluster-arch-hanok-jangdokdae-stone-wall")).toBeTruthy();

    fireEvent.click(screen.getByTestId("bg3d-object-cluster-search-clear"));
    expect((searchInput as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(searchInput);

    fireEvent.change(searchInput, { target: { value: "없는우주선오브젝트" } });
    expect(screen.getByTestId("bg3d-object-cluster-match-count").textContent).toBe("0/8종");
    expect((screen.getByTestId("bg3d-object-cluster-insert-btn") as HTMLButtonElement).disabled).toBe(
      true,
    );
    const emptyMsg = screen.getByTestId("bg3d-object-cluster-empty").textContent ?? "";
    expect(findToneViolations(emptyMsg, "polite")).toEqual([]);
    expect(violatesErrorPattern(emptyMsg)).toBe(false);

    for (const p of container.querySelectorAll("p")) {
      const txt = p.textContent ?? "";
      expect(findToneViolations(txt, "polite")).toEqual([]);
      expect(violatesErrorPattern(txt)).toBe(false);
    }

    fireEvent.keyDown(searchInput, { key: "Escape" });
    expect(screen.getByTestId("bg3d-object-cluster-match-count").textContent).toBe("8/8종");
  });
});
