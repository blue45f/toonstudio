// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { attachStudioBg3dEditorSceneOpsHost } from "./studio-bg3d-editor-scene-ops-host";
import { buildStudioBg3dRoomParts, getStudioBg3dRoomPreset, type StudioBg3dRoomSpec } from "./studio-bg3d-room-builder";

import type { BgPrimitive } from "../studio-background-3d-metadata";

// 실제 씬 연산 호스트를 붙이고, 런타임 바인딩만 필요한 만큼 대체한다(studio-bg3d-scene-edit-readiness 와 같은 방식).
vi.mock("./studio-bg3d-editor-runtime-bindings", async () => {
  const react = await import("react");
  const rooms = await import("./studio-bg3d-room-builder");
  const composites = await import("../studio-background-3d-composites");
  return {
    ...react,
    DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT: { camera: {}, attachments: [], budgets: { complexity: { maxNodes: 100 } } },
    STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES: 100,
    planStudioBg3dRoomBuild: rooms.planStudioBg3dRoomBuild,
    COMPOSITE_PRESETS: composites.COMPOSITE_PRESETS,
    instantiateCompositePreset: composites.instantiateCompositePreset,
    clonePrimitives: (value: unknown) => structuredClone(value),
    cloneBgCustomModelInstances: (value: unknown) => structuredClone(value),
  };
});

afterEach(cleanup);

interface FixtureOptions {
  readonly spec: StudioBg3dRoomSpec;
  /** 뷰포트가 돌려주는 현재 카메라. null 이면 뷰포트가 없는 상태(문서 카메라로 대체). */
  readonly liveView: { position: number[]; target: number[] } | null;
  readonly documentCamera?: { position: number[]; target: number[] };
  readonly initialPrimitives?: readonly BgPrimitive[];
}

function useHostFixture({ spec, liveView, documentCamera = { position: [4, 3, 6], target: [0, 0.6, 0] }, initialPrimitives = [] }: FixtureOptions) {
  const [primitives, setPrimitives] = useState<readonly BgPrimitive[]>(initialPrimitives);
  const [customModels, setCustomModels] = useState<object[]>([]);
  const [document, setSceneBaseDocument] = useState({
    camera: documentCamera,
    attachments: [],
    budgets: { complexity: { maxNodes: 100 } },
  });
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const host = useRef<Record<string, any> | null>(null);
  if (!host.current) {
    const ref = (current: unknown = null) => ({ current });
    host.current = {
      open: true,
      modelRenderer: {},
      isRestoringScene: false,
      physicsRuntimeSourceRef: ref(),
      viewportApiRef: ref(null),
      setError: vi.fn(),
    };
  }
  const h = host.current;
  Object.assign(h, { primitives, customModels, sceneBaseDocument: document, selectedIds, setPrimitives, setCustomModels, setSceneBaseDocument, setSelectedIds, roomBuilderSpec: spec });
  h.viewportApiRef.current = liveView ? { readView: () => liveView } : null;
  h.physicsRuntimeSourceRef.current = { primitives, customModels, document, revision: h.physicsRuntimeSourceRef.current?.revision ?? 0 };
  h.replaceCanonicalDocumentState = (mutation: { primitives?: readonly BgPrimitive[] }) => {
    const current = h.physicsRuntimeSourceRef.current;
    const next = {
      primitives: mutation.primitives !== undefined ? [...mutation.primitives] : current.primitives,
      customModels: current.customModels,
      document: current.document,
      revision: current.revision + 1,
    };
    h.physicsRuntimeSourceRef.current = next;
    if (mutation.primitives !== undefined) setPrimitives(next.primitives);
    return next;
  };
  attachStudioBg3dEditorSceneOpsHost(h);
  return h;
}

const classroom = getStudioBg3dRoomPreset("classroom")!.spec;
const OUTSIDE_SOUTH = { position: [0, 2, 12], target: [0, 1, 0] };
const INSIDE = { position: [0, 1.6, 0], target: [1, 1.4, -2] };

function renderHost(options: FixtureOptions) {
  return renderHook(() => useHostFixture(options));
}

describe("씬 연산 호스트의 방 추가(addRoomBuild)와 공통 묶음 추가(addGeneratedParts)", () => {
  it("자동 단면을 끄면 모든 파츠를 보이는 상태로 한 번에 더하고 첫 도형을 선택한다", () => {
    const view = renderHost({ spec: classroom, liveView: OUTSIDE_SOUTH });
    act(() => view.result.current.addRoomBuild());
    const expectedCount = buildStudioBg3dRoomParts(classroom).length;
    expect(view.result.current.primitives).toHaveLength(expectedCount);
    expect(view.result.current.primitives.some((primitive: BgPrimitive) => primitive.visible === false)).toBe(false);
    expect(view.result.current.selectedIds).toEqual(new Set([view.result.current.primitives[0].id]));
  });

  it("자동 단면을 켜면 현재 카메라 쪽 벽의 벽체 파츠만 숨김 상태로 더한다", () => {
    const view = renderHost({ spec: classroom, liveView: OUTSIDE_SOUTH });
    act(() => view.result.current.addRoomBuild({ autoCutaway: true }));
    const added: BgPrimitive[] = view.result.current.primitives;
    const southParts = buildStudioBg3dRoomParts(classroom).filter((part) => part.wall === "south");
    const hidden = added.filter((primitive) => primitive.visible === false);
    expect(southParts.length).toBeGreaterThan(1);
    expect(hidden).toHaveLength(southParts.length);
    expect(hidden.every((primitive) => primitive.name === "앞벽 벽체")).toBe(true);
    // 숨김일 뿐 지워지지 않았다: 파츠 수는 단면을 끈 경우와 같다.
    expect(added).toHaveLength(buildStudioBg3dRoomParts(classroom).length);
  });

  it("카메라가 방 안에 있으면 자동 단면을 켜도 아무것도 숨기지 않는다", () => {
    const view = renderHost({ spec: classroom, liveView: INSIDE });
    act(() => view.result.current.addRoomBuild({ autoCutaway: true }));
    expect(view.result.current.primitives.some((primitive: BgPrimitive) => primitive.visible === false)).toBe(false);
  });

  it("뷰포트가 아직 없으면 문서에 저장된 카메라로 판정한다", () => {
    const view = renderHost({ spec: classroom, liveView: null, documentCamera: { position: [0, 2, 12], target: [0, 1, 0] } });
    act(() => view.result.current.addRoomBuild({ autoCutaway: true }));
    expect(view.result.current.primitives.some((primitive: BgPrimitive) => primitive.visible === false)).toBe(true);
  });

  it("카메라 값이 비정상이어도 방 추가는 막히지 않고 단면만 적용되지 않는다", () => {
    const view = renderHost({ spec: classroom, liveView: { position: undefined as unknown as number[], target: [0, 1, 0] } });
    act(() => view.result.current.addRoomBuild({ autoCutaway: true }));
    expect(view.result.current.primitives).toHaveLength(buildStudioBg3dRoomParts(classroom).length);
    expect(view.result.current.primitives.some((primitive: BgPrimitive) => primitive.visible === false)).toBe(false);
  });

  it("두 번째 방은 첫 방과 겹치지 않게 옆으로 밀리고, 판정도 밀린 만큼 반영한다", () => {
    // 한도(100개) 안에서 두 번 넣을 수 있도록 파츠가 적은 원룸을 쓴다.
    const flat = getStudioBg3dRoomPreset("studio-flat")!.spec;
    const view = renderHost({ spec: flat, liveView: OUTSIDE_SOUTH });
    act(() => view.result.current.addRoomBuild());
    const firstCount = view.result.current.primitives.length;
    expect(firstCount * 2).toBeLessThanOrEqual(100);
    // 두 번째 방의 X 오프셋 = 기존 도형 수 * 폭/6. 카메라를 그 방 정면 바깥으로 옮기면 그 방의 앞벽이 숨는다.
    const anchorX = firstCount * (flat.width / 6);
    const shiftedView = { position: [anchorX, 2, 12], target: [anchorX, 1, 0] };
    const second = renderHost({ spec: flat, liveView: shiftedView, initialPrimitives: view.result.current.primitives });
    act(() => second.result.current.addRoomBuild({ autoCutaway: true }));
    const all: BgPrimitive[] = second.result.current.primitives;
    expect(all).toHaveLength(firstCount * 2);
    const firstRoom = all.slice(0, firstCount);
    const secondRoom = all.slice(firstCount);
    expect(firstRoom.some((primitive) => primitive.visible === false)).toBe(false);
    expect(secondRoom.filter((primitive) => primitive.visible === false).length).toBeGreaterThan(0);
    // 두 방의 바닥 중심 X 차이가 오프셋과 같다 — 겹치지 않고 나란히 놓인다.
    const floorX = (room: BgPrimitive[]) => room.find((primitive) => primitive.name === "바닥")!.position[0];
    expect(floorX(secondRoom) - floorX(firstRoom)).toBeCloseTo(anchorX, 10);
  });

  it("노드 한도를 넘기는 방은 아무것도 더하지 않고 사유를 알린다", () => {
    const filler = Array.from({ length: 80 }, (_, index) => ({
      id: `filler-${index}`, kind: "box", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#ffffff",
    })) as BgPrimitive[];
    const view = renderHost({ spec: classroom, liveView: OUTSIDE_SOUTH, initialPrimitives: filler });
    act(() => view.result.current.addRoomBuild({ autoCutaway: true }));
    expect(view.result.current.primitives).toHaveLength(80);
    expect(view.result.current.setError).toHaveBeenCalledTimes(1);
    expect(view.result.current.setError.mock.calls[0][0]).toContain("오브젝트를 최대");
  });

  it("addGeneratedParts 는 만든 쪽이 기존 도형 수와 카메라 뷰를 받아 도형 묶음을 돌려주면 한 번에 커밋한다", () => {
    const view = renderHost({ spec: classroom, liveView: OUTSIDE_SOUTH });
    const seen: unknown[] = [];
    let accepted = false;
    act(() => {
      accepted = view.result.current.addGeneratedParts((count: number, cameraView: unknown) => {
        seen.push(count, cameraView);
        return [{ id: "gen-1", kind: "box", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#ffffff" }];
      });
    });
    expect(accepted).toBe(true);
    expect(seen).toEqual([0, OUTSIDE_SOUTH]);
    expect(view.result.current.primitives).toMatchObject([{ id: "gen-1" }]);
    expect(view.result.current.selectedIds).toEqual(new Set(["gen-1"]));
  });

  it("addGeneratedParts 는 빈 묶음이면 false 를 돌려주고 장면을 바꾸지 않는다", () => {
    const view = renderHost({ spec: classroom, liveView: OUTSIDE_SOUTH });
    let accepted = true;
    act(() => { accepted = view.result.current.addGeneratedParts(() => []); });
    expect(accepted).toBe(false);
    expect(view.result.current.primitives).toEqual([]);
  });

  it("복합 오브젝트 추가도 같은 공통 경로를 쓰고 동작이 그대로다", async () => {
    const { COMPOSITE_PRESETS, instantiateCompositePreset } = await import("../studio-background-3d-composites");
    const preset = COMPOSITE_PRESETS[0];
    const view = renderHost({ spec: classroom, liveView: OUTSIDE_SOUTH });
    act(() => view.result.current.addComposite(preset.id));
    const expected = instantiateCompositePreset(preset, 0);
    expect(view.result.current.primitives.map((primitive: BgPrimitive) => primitive.name)).toEqual(expected.map((primitive) => primitive.name));
    act(() => view.result.current.addComposite("no-such-preset"));
    expect(view.result.current.primitives).toHaveLength(expected.length);
  });
});
