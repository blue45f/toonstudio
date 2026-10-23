// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { solveStudioMannequinDuoPlacement } from "./studio-mannequin-duo-composition";
import {
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  buildStudioMannequinSpec,
} from "./studio-mannequin-model";
import { measureStudioMannequinBodyFloor } from "./studio-mannequin-pose-ground-contact";
import {
  STUDIO_MANNEQUIN_STATE_DOC_DUO_VERSION,
  STUDIO_MANNEQUIN_STATE_DOC_VERSION,
  createStudioMannequinRestPose,
  findStudioMannequinPosePreset,
  parseStudioMannequinState,
  serializeStudioMannequinState,
  type StudioMannequinPersistentState,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";
import { resolveStudioMannequinLibraryPresetPose } from "./studio-mannequin-preset-application";
import {
  composeStudioMannequinDuoState,
  createStudioMannequinDuoPartner,
  useStudioMannequinDuoPartner,
} from "./use-studio-mannequin-duo-partner";

import type {
  StudioMannequinSceneHandle,
  StudioMannequinScenePartner,
  StudioMannequinScenePartnerListener,
} from "./studio-mannequin-scene";

const PARAMS = STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS;

/** 2인 구도 메서드만 가진 씬 스텁 — 훅이 부르는 경계만 기록한다. */
function createSceneStub() {
  let listener: StudioMannequinScenePartnerListener | null = null;
  const setPartner = vi.fn<(partner: StudioMannequinScenePartner | null) => void>();
  const setActiveFigure = vi.fn<(figure: "lead" | "partner") => void>();
  const frameAll = vi.fn<() => void>();
  const handle = {
    setPartner,
    setActiveFigure,
    frameAll,
    setPartnerListener: (next: StudioMannequinScenePartnerListener | null) => {
      listener = next;
    },
  } as unknown as StudioMannequinSceneHandle;
  return { handle, setPartner, setActiveFigure, frameAll, listener: () => listener };
}

function setup(groundPose?: (pose: StudioMannequinPose) => { readonly pose: StudioMannequinPose }) {
  const scene = createSceneStub();
  const sceneRef = { current: scene.handle as StudioMannequinSceneHandle | null };
  const stateRef: { current: StudioMannequinPersistentState } = {
    current: { params: PARAMS, pose: createStudioMannequinRestPose() },
  };
  const stateRevisionRef = { current: 0 };
  // 패널과 같은 규칙: 사용자 변경이면 개정 번호를 올리고, 같은 틱에 영속 스냅샷에 상대를 싣는다.
  const onPartnerCommitted = (
    partner: Parameters<typeof composeStudioMannequinDuoState>[1],
    userEdit: boolean,
  ) => {
    if (userEdit) stateRevisionRef.current += 1;
    stateRef.current = composeStudioMannequinDuoState(stateRef.current, partner);
  };
  const hook = renderHook(() =>
    useStudioMannequinDuoPartner({
      sceneRef,
      onPartnerCommitted,
      groundPose: groundPose ? (pose) => groundPose(pose) : undefined,
    }),
  );
  act(() => hook.result.current.attachScene(scene.handle));
  return { scene, sceneRef, stateRef, stateRevisionRef, hook };
}

function placeHug(hook: ReturnType<typeof setup>["hook"]) {
  const preset = findStudioMannequinPosePreset("couple-hug-front");
  if (!preset) throw new Error("couple-hug-front 프리셋이 없다");
  const leadPose = resolveStudioMannequinLibraryPresetPose(preset, PARAMS, createStudioMannequinRestPose());
  let plan: ReturnType<typeof solveStudioMannequinDuoPlacement> | null = null;
  act(() => {
    plan = hook.result.current.placeDuo({ presetId: preset.id, leadPose, leadParams: PARAMS });
  });
  return { plan: plan as unknown as ReturnType<typeof solveStudioMannequinDuoPlacement>, leadPose };
}

describe("useStudioMannequinDuoPartner — 2인 구도 상대 인형(B-02)", () => {
  it("2인 프리셋 배치는 상대 인형을 씬에 넣고 영속 스냅샷·개정 번호를 같은 틱에 갱신한다", () => {
    const { scene, stateRef, stateRevisionRef, hook } = setup();
    expect(scene.setPartner).toHaveBeenLastCalledWith(null);
    const { plan } = placeHug(hook);

    const partner = hook.result.current.partner;
    expect(partner).not.toBeNull();
    expect(hook.result.current.placement?.compositionId).toBe(plan.compositionId);
    expect(stateRef.current.partner).toEqual(partner);
    expect(stateRevisionRef.current).toBe(1);

    const scenePartner = scene.setPartner.mock.calls.at(-1)?.[0];
    expect(scenePartner?.offset[1]).toBe(0);
    expect(scenePartner?.offset[2]).toBeCloseTo(plan.partnerOffset[2], 5);
    // 마주 보기: 요는 π 와 2π 주기로 같은 방향이다.
    expect(Math.cos(scenePartner?.yawRad ?? 0)).toBeCloseTo(-1, 5);
    expect(scenePartner?.spec.heightM).toBeCloseTo(buildStudioMannequinSpec(PARAMS).heightM, 9);

    // 루트 높이 보정을 골반으로 옮겨도 상대 발은 바닥(y=0)에 닿는다.
    const floor = measureStudioMannequinBodyFloor(
      buildStudioMannequinSpec(PARAMS),
      partner!.pose,
      partner!.offset,
      partner!.yawRad,
    );
    expect(floor.lowestY).toBeCloseTo(0, 4);

    // 영속 스냅샷은 v2 문서로 무손실 왕복한다.
    const raw = serializeStudioMannequinState(stateRef.current);
    expect(JSON.parse(raw).version).toBe(STUDIO_MANNEQUIN_STATE_DOC_DUO_VERSION);
    expect(parseStudioMannequinState(raw)?.partner).toEqual(partner);
  });

  it("상대를 조작 중일 때만 1인 프리셋이 상대에게 가고, 상대 히스토리로 되돌린다", () => {
    const { scene, hook } = setup();
    placeHug(hook);
    const placedPose = hook.result.current.partner!.pose;
    const kneel = findStudioMannequinPosePreset("kneel");
    if (!kneel) throw new Error("kneel 프리셋이 없다");
    const resolveKneel = (partner: { readonly params: typeof PARAMS; readonly pose: StudioMannequinPose }) =>
      resolveStudioMannequinLibraryPresetPose(kneel, partner.params, partner.pose);

    let applied = true;
    act(() => {
      applied = hook.result.current.applyPoseToPartner(resolveKneel);
    });
    expect(applied).toBe(false);
    expect(hook.result.current.partner?.pose).toEqual(placedPose);

    act(() => hook.result.current.setActiveFigure("partner"));
    expect(hook.result.current.activeFigure).toBe("partner");
    expect(scene.setActiveFigure).toHaveBeenLastCalledWith("partner");

    act(() => {
      applied = hook.result.current.applyPoseToPartner(resolveKneel);
    });
    expect(applied).toBe(true);
    const kneeling = hook.result.current.partner!.pose;
    expect(kneeling).not.toEqual(placedPose);
    expect(hook.result.current.history).toMatchObject({ canUndo: true, undoCount: 1 });

    act(() => hook.result.current.undoPartner());
    expect(hook.result.current.partner?.pose).toEqual(placedPose);
    expect(hook.result.current.history).toMatchObject({ canUndo: false, canRedo: true });
    act(() => hook.result.current.redoPartner());
    expect(hook.result.current.partner?.pose).toEqual(kneeling);
  });

  it("뷰포트에서 다듬은 상대 포즈는 접지 후 1단계로 기록하고, 같은 포즈면 씬만 정본으로 되돌린다", () => {
    const lift = (pose: StudioMannequinPose) => ({
      pose: { joints: pose.joints, pelvisOffset: [pose.pelvisOffset[0], 0.02, pose.pelvisOffset[2]] as const },
    });
    const { scene, hook } = setup(lift);
    placeHug(hook);
    const listener = scene.listener();
    expect(listener).not.toBeNull();
    const dragged = { joints: { rightUpperArm: [-0.9, 0, -0.2] as const }, pelvisOffset: [0, -0.3, 0] as const };

    act(() => listener?.onPoseEdited?.(dragged));
    expect(hook.result.current.partner?.pose.pelvisOffset[1]).toBeCloseTo(0.02, 6);
    expect(hook.result.current.history.undoCount).toBe(1);
    const partnerSpec = scene.setPartner.mock.calls.at(-1)?.[0]?.spec;

    const callsBefore = scene.setPartner.mock.calls.length;
    act(() => listener?.onPoseEdited?.(dragged));
    expect(hook.result.current.history.undoCount).toBe(1);
    expect(scene.setPartner.mock.calls.length).toBe(callsBefore + 1);
    // 같은 체형이면 같은 스펙 객체 — 씬이 상대 메시를 다시 만들지 않는다.
    expect(scene.setPartner.mock.calls.at(-1)?.[0]?.spec).toBe(partnerSpec);

    act(() => listener?.onActiveFigureChange?.("partner"));
    expect(hook.result.current.activeFigure).toBe("partner");
  });

  it("상대 제거는 v1 스냅샷으로 돌아가고, 복원은 개정 번호 없이 정본 상대를 되살린다", () => {
    const { scene, stateRef, stateRevisionRef, hook } = setup();
    placeHug(hook);
    act(() => hook.result.current.setActiveFigure("partner"));
    const saved = hook.result.current.partner;

    act(() => hook.result.current.removePartner());
    expect(hook.result.current.partner).toBeNull();
    expect(hook.result.current.activeFigure).toBe("lead");
    expect(scene.setPartner).toHaveBeenLastCalledWith(null);
    expect("partner" in stateRef.current).toBe(false);
    expect(JSON.parse(serializeStudioMannequinState(stateRef.current)).version).toBe(
      STUDIO_MANNEQUIN_STATE_DOC_VERSION,
    );

    const revision = stateRevisionRef.current;
    act(() => hook.result.current.restorePartner(saved));
    expect(stateRevisionRef.current).toBe(revision);
    expect(hook.result.current.partner).toEqual(saved);
    expect(hook.result.current.placement).toBeNull();
    expect(stateRef.current.partner).toEqual(saved);
  });

  it("씬을 다시 만들면 attachScene 이 상대와 조작 대상을 새 씬에 옮긴다", () => {
    const { hook } = setup();
    placeHug(hook);
    act(() => hook.result.current.setActiveFigure("partner"));
    const next = createSceneStub();
    act(() => hook.result.current.attachScene(next.handle));
    expect(next.listener()).not.toBeNull();
    expect(next.setPartner.mock.calls.at(-1)?.[0]?.pose).toEqual(hook.result.current.partner?.pose);
    expect(next.setActiveFigure).toHaveBeenLastCalledWith("partner");
  });

  it("상대가 없으면 상대 전환은 주인공으로 머문다", () => {
    const { scene, hook } = setup();
    act(() => hook.result.current.setActiveFigure("partner"));
    expect(hook.result.current.activeFigure).toBe("lead");
    expect(scene.setActiveFigure).toHaveBeenLastCalledWith("lead");
    act(() => hook.result.current.frameBoth());
    expect(scene.frameAll).toHaveBeenCalledTimes(1);
  });
});

describe("2인 구도 순수 헬퍼", () => {
  it("composeStudioMannequinDuoState 는 상대가 없으면 partner 키를 남기지 않는다", () => {
    const base = { params: PARAMS, pose: createStudioMannequinRestPose() };
    const preset = findStudioMannequinPosePreset("couple-high-five");
    if (!preset) throw new Error("couple-high-five 프리셋이 없다");
    const partner = createStudioMannequinDuoPartner(
      solveStudioMannequinDuoPlacement({ presetId: preset.id, leadPose: preset.pose, leadBodyParams: PARAMS }),
      PARAMS,
    );
    const withPartner = composeStudioMannequinDuoState(base, partner);
    expect(withPartner.partner).toBe(partner);
    expect(Object.keys(composeStudioMannequinDuoState(withPartner, null)).sort()).toEqual(["params", "pose"]);
  });
});
