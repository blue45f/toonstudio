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
import { clonePrimitives, makeGeometry } from "../studio-background-3d-primitives";
import { StudioBg3dBackgroundObjectClusterSection } from "./StudioBg3dBackgroundObjectClusterSection";
import { StudioBg3dWebtoonBackgroundPicker } from "./StudioBg3dWebtoonBackgroundPicker";
import {
  STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES,
  buildBg3dObjectClusterPrimitives,
  composeWorldYawWithLocalEulerXyz,
  measureBg3dPrimitivesWorldBounds,
  searchStudioBg3dObjectClusterArchetypes,
} from "./studio-bg3d-background-object-cluster";
import { attachStudioBg3dEditorSceneOpsHost } from "./studio-bg3d-editor-scene-ops-host";
import { findStudioBg3dEssentialAsset } from "./studio-bg3d-essential-pose-prop-catalog";
import { getStudioBg3dRoomPreset } from "./studio-bg3d-room-builder";
import {
  createDefaultStudioBg3dSceneDocument,
  parseStudioBg3dSceneDocument,
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
  const sceneDoc = await import("./studio-bg3d-scene-document");
  const sceneRuntime = await import("./studio-bg3d-scene-runtime");
  return {
    ...react,
    DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT: sceneDoc.DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES: sceneDoc.STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES,
    planStudioBg3dRoomBuild: rooms.planStudioBg3dRoomBuild,
    COMPOSITE_PRESETS: composites.COMPOSITE_PRESETS,
    instantiateCompositePreset: composites.instantiateCompositePreset,
    clonePrimitives: prims.clonePrimitives,
    cloneBgCustomModelInstances: (value: unknown) => structuredClone(value),
    createStudioBg3dHistorySnapshot: derivations.createStudioBg3dHistorySnapshot,
    studioBg3dHistoryDocumentAtView: derivations.studioBg3dHistoryDocumentAtView,
    applyOrDeferStudioBg3dHistoryCamera: vi.fn(),
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

function useLiveBg3dOpsHost() {
  const initialDoc = createDefaultStudioBg3dSceneDocument();
  const [primitives, setPrimitives] = useState<readonly BgPrimitive[]>([]);
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
    revision: (h.physicsRuntimeSourceRef.current?.revision ?? 0),
  };
  h.replaceCanonicalDocumentState = (mutation: {
    primitives?: readonly BgPrimitive[];
    document?: typeof initialDoc;
  }) => {
    const cur = h.physicsRuntimeSourceRef.current;
    const next = {
      primitives: mutation.primitives !== undefined ? [...mutation.primitives] : cur.primitives,
      customModels: cur.customModels,
      document: mutation.document ?? cur.document,
      revision: cur.revision + 1,
    };
    h.physicsRuntimeSourceRef.current = next;
    if (mutation.primitives !== undefined) setPrimitives(next.primitives);
    if (mutation.document !== undefined) setSceneBaseDocument(mutation.document);
    return next;
  };
  attachStudioBg3dEditorSceneOpsHost(h);
  return h;
}

describe("studio-bg3d-background-object-cluster — 6 core flows + search & keyboard a11y", () => {
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

    // 교실 ㄱ자 코너 2모듈에서 2번째 모듈 시계 원판이 -X 방향(코너 벽 법선)을 정확히 향하는지 확인
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

  it("3~5. 중복 삽입 · Undo/Redo · 저장/재불러오기: 피커와 워크벤치 반복 배치 시 ID 충돌·위치 중첩 없이 Undo/Redo와 문서 v3·DataURL 왕복을 무손실 통과한다", () => {
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

    // 저장/재불러오기 1: 정규 장면 문서 v3 왕복 무손실 검증 (0 dropped, 0 diagnostics)
    const saved = adaptStudioBg3dRuntimeToDocument({
      primitives: afterSecond,
      customModels: [],
      attachmentByStorageModelId: new Map(),
      baseDocument: hostHook.result.current.sceneBaseDocument,
    });
    expect(saved.counts.droppedPrimitives).toBe(0);
    expect(saved.diagnostics).toEqual([]);
    const parsedDoc = parseStudioBg3dSceneDocument(saved.serialized);
    expect(parsedDoc).not.toBeNull();
    const reopened = hydrateStudioBg3dDocumentToRuntime({
      document: parsedDoc!,
      storageModelIdByAttachmentId: new Map(),
    });
    expect(reopened.ok).toBe(true);
    expect(reopened.primitives).toEqual(afterSecond);

    // 저장/재불러오기 2: PNG 캡처 DataURL 해시 왕복 검증
    const fakeDataUrl = `data:image/png;base64,AAAA#${encodeBg3dSceneHash([...afterSecond])}`;
    expect(parseBg3dSceneFromDataUrl(fakeDataUrl)).toEqual(afterSecond);

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

    picker.unmount();

    // 공간 모델러 워크벤치 삽입 경로 2회 연속 배치 비중첩 검증
    const workbenchInsert = createStudioBg3dWorkbenchInsertionFromHost(hostHook.result.current, {
      selectAllInserted: true,
      immediateHistory: true,
    });
    render(
      <StudioBg3dBackgroundObjectClusterSection
        defaultExpanded
        onInsertScenePrimitives={workbenchInsert}
      />,
    );
    const beforeWb = hostHook.result.current.primitives.length;
    act(() => {
      fireEvent.click(screen.getByTestId("bg3d-object-cluster-insert-btn"));
    });
    const afterWb1 = hostHook.result.current.primitives.length;
    act(() => {
      fireEvent.click(screen.getByTestId("bg3d-object-cluster-insert-btn"));
    });
    const afterWb2 = hostHook.result.current.primitives.length;
    const wbChunk1 = hostHook.result.current.primitives.slice(beforeWb, afterWb1);
    const wbChunk2 = hostHook.result.current.primitives.slice(afterWb1, afterWb2);
    expect(wbChunk1.length).toBeGreaterThan(10);
    expect(wbChunk2.length).toBe(wbChunk1.length);
    expect(computeThreeWorldBox(wbChunk1).intersectsBox(computeThreeWorldBox(wbChunk2))).toBe(false);

    hostHook.unmount();
  });

  it("6. 검색·키보드 접근성·말투 가드: 키워드 필터/초기화, 라디오그룹 방향키·Home·End 포커스 이동 및 해요체·오류문형 가드를 만족한다", () => {
    expect(searchStudioBg3dObjectClusterArchetypes("장독대").map((x) => x.id)).toEqual([
      "hanok-jangdokdae-stone-wall",
    ]);
    expect(searchStudioBg3dObjectClusterArchetypes("포션 촛대").map((x) => x.id)).toEqual([
      "fantasy-dungeon-alchemy-props",
    ]);

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

    // 밀도·배치 대형 라디오그룹 키보드 전환
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

    // 검색 필터링, 빈 결과 시 배치 비활성 + 말투/오류 문형 가드, Escape 초기화
    const searchInput = screen.getByTestId("bg3d-object-cluster-search-input");
    fireEvent.change(searchInput, { target: { value: "장독대" } });
    expect(screen.getByTestId("bg3d-object-cluster-match-count").textContent).toBe("1/8종");
    expect(screen.getByTestId("bg3d-object-cluster-arch-hanok-jangdokdae-stone-wall")).toBeTruthy();

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
