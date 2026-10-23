/**
 * Studio 3D 데생 인형 — 2인 구도 상대 인형 상태 훅(B-02).
 *
 * 2인 프리셋을 적용하면 상대 인형이 계산된 거리·시선·접지로 실제 씬에 그려진다. 예전에는
 * 배치 계산 결과를 문구로만 보여 줘서 캡처에 상대가 없었다. 이 훅이 상대 인형의 단일 진실
 * 공급원이다.
 * - 상대(체형·포즈·배치)는 저장 정본(StudioMannequinPersistentPartner)으로 들고, 바뀔 때마다
 *   같은 틱에 onPartnerCommitted 로 알려 패널이 영속 스냅샷·개정 번호를 맞추게 한다 — 닫기
 *   저장·JSON 내보내기·공유 해시가 항상 최신 상대를 담는다(상대가 없으면 v1 문서 그대로).
 * - 씬에는 setPartner 로 넣고, 뷰포트에서 상대를 다듬은 결과는 리스너로 받아 상대 전용
 *   되돌리기 히스토리에 기록한다(드래그 1회 = 1단계, 주인공 히스토리와 섞지 않는다).
 * - 조작 대상(주인공/상대)은 씬과 양방향으로 맞춘다 — 인형을 누르면 씬이, 전환 버튼을 누르면
 *   이 훅이 바꾼다.
 * 상대도 주인공과 같은 로컬 접지 규약을 쓴다: 루트는 바닥(y=0)에 두고 높이 보정은 골반
 * 오프셋에 싣는다. 그래야 프리셋 적용 접지·자동 접지·IK 가 두 인형에서 똑같이 동작한다.
 * 씬 핸들의 2인 구도 메서드는 선택 기능이라(테스트 스텁·구형 호스트) 없으면 건너뛴다.
 */

import { useCallback, useMemo, useRef, useState } from "react";

import {
  solveStudioMannequinDuoPlacement,
  type StudioMannequinDuoPlacement,
} from "./studio-mannequin-duo-composition";
import {
  buildStudioMannequinSpec,
  type StudioMannequinBodyParams,
  type StudioMannequinSpec,
} from "./studio-mannequin-model";
import {
  canonicalizeStudioMannequinPartner,
  normalizeStudioMannequinPose,
  type StudioMannequinPersistentPartner,
  type StudioMannequinPersistentState,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";
import {
  createStudioPoseHistory,
  describeStudioPoseHistory,
  recordStudioPoseHistory,
  redoStudioPoseHistory,
  undoStudioPoseHistory,
  type StudioPoseHistory,
} from "./studio-pose-history";
import { studioMannequinPosesNearlyEqual } from "./use-studio-mannequin-viewport-gestures";

import type {
  StudioMannequinFigureId,
  StudioMannequinSceneHandle,
  StudioMannequinScenePartnerListener,
} from "./studio-mannequin-scene";

/** 패널 영속 스냅샷에 상대를 얹는다. 상대가 없으면 키 자체를 빼 v1 문서 그대로 저장되게 한다. */
export function composeStudioMannequinDuoState(
  state: Pick<StudioMannequinPersistentState, "params" | "pose">,
  partner: StudioMannequinPersistentPartner | null,
): StudioMannequinPersistentState {
  return partner
    ? { params: state.params, pose: state.pose, partner }
    : { params: state.params, pose: state.pose };
}

/**
 * 2인 구도 배치 결과를 상대 인형 저장 정본으로 바꾼다. 솔버가 루트 높이(partnerOffset[1])에
 * 실은 접지 보정을 골반 오프셋으로 옮겨, 상대 루트는 항상 바닥 위(y=0)에 선다.
 */
export function createStudioMannequinDuoPartner(
  placement: StudioMannequinDuoPlacement,
  params: StudioMannequinBodyParams,
): StudioMannequinPersistentPartner {
  const pose = placement.partnerPose;
  return canonicalizeStudioMannequinPartner({
    params,
    pose: normalizeStudioMannequinPose({
      joints: pose.joints,
      pelvisOffset: [
        pose.pelvisOffset[0],
        pose.pelvisOffset[1] + placement.partnerOffset[1],
        pose.pelvisOffset[2],
      ],
    }),
    offset: [placement.partnerOffset[0], 0, placement.partnerOffset[2]],
    yawRad: placement.partnerYawRad,
  });
}

function sameBodyParams(a: StudioMannequinBodyParams, b: StudioMannequinBodyParams): boolean {
  if (a === b) return true;
  const left = Object.entries(a);
  const right = new Map(Object.entries(b));
  return left.length === right.size && left.every(([key, value]) => right.get(key) === value);
}

export interface StudioMannequinDuoPartnerOptions {
  readonly sceneRef: { readonly current: StudioMannequinSceneHandle | null };
  /**
   * 상대가 바뀐 같은 틱에 호출된다. 패널은 여기서 영속 스냅샷(상대 포함)과 상태 개정 번호를
   * 맞춘다 — userEdit 이면 사용자 변경이라 개정 번호를 올리고, 불러오기 복원이면 올리지 않는다.
   */
  readonly onPartnerCommitted: (partner: StudioMannequinPersistentPartner | null, userEdit: boolean) => void;
  /** 주인공과 같은 자동 접지 경로(토글 포함). 없으면 상대 포즈를 그대로 쓴다. */
  readonly groundPose?: (
    pose: StudioMannequinPose,
    params: StudioMannequinBodyParams,
  ) => { readonly pose: StudioMannequinPose };
}

export interface StudioMannequinDuoPlaceInput {
  readonly presetId: string;
  /** 지금 체형으로 접지까지 끝낸 주인공 포즈. */
  readonly leadPose: StudioMannequinPose;
  readonly leadParams: StudioMannequinBodyParams;
}

export interface StudioMannequinDuoPartnerController {
  readonly partner: StudioMannequinPersistentPartner | null;
  /** 마지막 2인 프리셋 배치 결과(불러오기·가져오기로 되살린 상대에는 없다). */
  readonly placement: StudioMannequinDuoPlacement | null;
  readonly activeFigure: StudioMannequinFigureId;
  readonly history: ReturnType<typeof describeStudioPoseHistory>;
  readonly setActiveFigure: (figure: StudioMannequinFigureId) => void;
  /** 2인 프리셋 — 상대 인형을 계산된 배치로 넣고, 주인공에 적용할 포즈가 담긴 배치를 돌려준다. */
  readonly placeDuo: (input: StudioMannequinDuoPlaceInput) => StudioMannequinDuoPlacement;
  /** 상대를 조작 중이면 포즈를 상대에게 적용하고 true. 아니면 아무것도 하지 않고 false. */
  readonly applyPoseToPartner: (
    resolvePose: (partner: StudioMannequinPersistentPartner) => StudioMannequinPose,
  ) => boolean;
  /** 불러오기·가져오기 — 히스토리 없이 상대를 통째로 바꾼다(null 이면 1인). */
  readonly restorePartner: (
    partner: StudioMannequinPersistentPartner | null,
    options?: { readonly userEdit?: boolean },
  ) => void;
  readonly removePartner: () => void;
  readonly undoPartner: () => void;
  readonly redoPartner: () => void;
  readonly frameBoth: () => void;
  /** 씬을 (다시) 만든 직후 호출 — 리스너를 걸고 상대·조작 대상을 새 씬에 옮긴다. */
  readonly attachScene: (handle: StudioMannequinSceneHandle) => void;
}

export function useStudioMannequinDuoPartner(
  options: StudioMannequinDuoPartnerOptions,
): StudioMannequinDuoPartnerController {
  const { sceneRef, onPartnerCommitted, groundPose } = options;
  const [partner, setPartner] = useState<StudioMannequinPersistentPartner | null>(null);
  const partnerRef = useRef<StudioMannequinPersistentPartner | null>(null);
  const [placement, setPlacement] = useState<StudioMannequinDuoPlacement | null>(null);
  const [activeFigure, setActiveFigureState] = useState<StudioMannequinFigureId>("lead");
  const activeFigureRef = useRef<StudioMannequinFigureId>("lead");
  const historyRef = useRef<StudioPoseHistory>(createStudioPoseHistory());
  const [historySnapshot, setHistorySnapshot] = useState<StudioPoseHistory>(historyRef.current);
  const specCacheRef = useRef<{
    readonly params: StudioMannequinBodyParams;
    readonly spec: StudioMannequinSpec;
  } | null>(null);

  /** 같은 체형이면 같은 스펙 객체를 돌려준다 — 씬은 스펙이 바뀔 때만 상대 메시를 다시 만든다. */
  const resolveSpec = useCallback((params: StudioMannequinBodyParams): StudioMannequinSpec => {
    const cached = specCacheRef.current;
    if (cached && sameBodyParams(cached.params, params)) return cached.spec;
    const spec = buildStudioMannequinSpec(params);
    specCacheRef.current = { params, spec };
    return spec;
  }, []);

  const pushToScene = useCallback(
    (handle: StudioMannequinSceneHandle | null, next: StudioMannequinPersistentPartner | null) => {
      handle?.setPartner?.(
        next
          ? { spec: resolveSpec(next.params), pose: next.pose, offset: next.offset, yawRad: next.yawRad }
          : null,
      );
    },
    [resolveSpec],
  );

  const resetHistory = useCallback(() => {
    historyRef.current = createStudioPoseHistory();
    setHistorySnapshot(historyRef.current);
  }, []);

  const commitPartner = useCallback(
    (next: StudioMannequinPersistentPartner | null, userEdit: boolean) => {
      partnerRef.current = next;
      onPartnerCommitted(next, userEdit);
      setPartner(next);
      pushToScene(sceneRef.current, next);
      if (!next && activeFigureRef.current !== "lead") {
        activeFigureRef.current = "lead";
        setActiveFigureState("lead");
      }
    },
    [onPartnerCommitted, pushToScene, sceneRef],
  );

  /** 사용자 결정(뷰포트 드래그·프리셋)으로 상대 포즈를 바꾼다 — 접지 후 바뀐 경우에만 1단계 기록. */
  const editPartnerPose = useCallback(
    (pose: StudioMannequinPose) => {
      const current = partnerRef.current;
      if (!current) return;
      const nextPose = normalizeStudioMannequinPose(groundPose ? groundPose(pose, current.params).pose : pose);
      if (studioMannequinPosesNearlyEqual(nextPose, current.pose)) {
        // 드래그가 남긴 미세한 차이는 버리고 씬을 정본 포즈로 되돌린다.
        pushToScene(sceneRef.current, current);
        return;
      }
      historyRef.current = recordStudioPoseHistory(historyRef.current, current.pose);
      setHistorySnapshot(historyRef.current);
      commitPartner({ ...current, pose: nextPose }, true);
    },
    [commitPartner, groundPose, pushToScene, sceneRef],
  );

  const listener = useMemo<StudioMannequinScenePartnerListener>(
    () => ({
      onPoseEdited: editPartnerPose,
      onActiveFigureChange: (figure) => {
        activeFigureRef.current = figure;
        setActiveFigureState(figure);
      },
    }),
    [editPartnerPose],
  );

  const setActiveFigure = useCallback(
    (figure: StudioMannequinFigureId) => {
      const resolved: StudioMannequinFigureId = figure === "partner" && partnerRef.current ? "partner" : "lead";
      activeFigureRef.current = resolved;
      setActiveFigureState(resolved);
      sceneRef.current?.setActiveFigure?.(resolved);
    },
    [sceneRef],
  );

  const placeDuo = useCallback(
    (input: StudioMannequinDuoPlaceInput): StudioMannequinDuoPlacement => {
      // 상대 체형은 배치하는 순간의 주인공 체형과 같다(솔버 기본값과 같은 규칙).
      const plan = solveStudioMannequinDuoPlacement({
        presetId: input.presetId,
        leadPose: input.leadPose,
        leadBodyParams: input.leadParams,
      });
      resetHistory();
      setPlacement(plan);
      commitPartner(createStudioMannequinDuoPartner(plan, input.leadParams), true);
      return plan;
    },
    [commitPartner, resetHistory],
  );

  const applyPoseToPartner = useCallback(
    (resolvePose: (partner: StudioMannequinPersistentPartner) => StudioMannequinPose): boolean => {
      const current = partnerRef.current;
      if (!current || activeFigureRef.current !== "partner") return false;
      editPartnerPose(resolvePose(current));
      return true;
    },
    [editPartnerPose],
  );

  const restorePartner = useCallback(
    (next: StudioMannequinPersistentPartner | null, restoreOptions?: { readonly userEdit?: boolean }) => {
      resetHistory();
      setPlacement(null);
      commitPartner(next ? canonicalizeStudioMannequinPartner(next) : null, restoreOptions?.userEdit === true);
    },
    [commitPartner, resetHistory],
  );

  const removePartner = useCallback(() => {
    restorePartner(null, { userEdit: true });
  }, [restorePartner]);

  const stepHistory = useCallback(
    (direction: "undo" | "redo") => {
      const current = partnerRef.current;
      if (!current) return;
      const step = direction === "undo"
        ? undoStudioPoseHistory(historyRef.current, current.pose)
        : redoStudioPoseHistory(historyRef.current, current.pose);
      if (!step) return;
      historyRef.current = step.history;
      setHistorySnapshot(step.history);
      commitPartner({ ...current, pose: step.pose }, true);
    },
    [commitPartner],
  );
  const undoPartner = useCallback(() => stepHistory("undo"), [stepHistory]);
  const redoPartner = useCallback(() => stepHistory("redo"), [stepHistory]);

  const frameBoth = useCallback(() => {
    sceneRef.current?.frameAll?.();
  }, [sceneRef]);

  const attachScene = useCallback(
    (handle: StudioMannequinSceneHandle) => {
      handle.setPartnerListener?.(listener);
      pushToScene(handle, partnerRef.current);
      if (activeFigureRef.current === "partner" && partnerRef.current) handle.setActiveFigure?.("partner");
    },
    [listener, pushToScene],
  );

  const history = useMemo(() => describeStudioPoseHistory(historySnapshot), [historySnapshot]);

  return useMemo(
    () => ({
      partner,
      placement,
      activeFigure,
      history,
      setActiveFigure,
      placeDuo,
      applyPoseToPartner,
      restorePartner,
      removePartner,
      undoPartner,
      redoPartner,
      frameBoth,
      attachScene,
    }),
    [
      activeFigure,
      applyPoseToPartner,
      attachScene,
      frameBoth,
      history,
      partner,
      placeDuo,
      placement,
      redoPartner,
      removePartner,
      restorePartner,
      setActiveFigure,
      undoPartner,
    ],
  );
}
