"use no memo";
// React Compiler 옵트아웃: 호스트 백(h)이 렌더마다 새 클로저를 만들어 넘기므로 최신 값을 ref 로 읽는다.

/**
 * 3D 배경 에디터 호스트 ↔ 추론 서비스 연결 훅.
 *
 * 에디터의 공유 파일(호스트 백 기반, 타입 검사 제외)에는 이 훅 한 줄과 JSX 몇 줄만 남기고, 연결 로직은
 * 이 타입 검사되는 파일에 둔다. 하는 일:
 *  - 줄자가 켜져 있는 동안 추론 세션을 열고(시작점·단위·기준 방향 동기화) 끝나면 닫는다
 *  - 장면(도형·모델·측정 가이드)을 서비스 색인에 맞춘다 — 변경이 있을 때만 다시 만든다
 *  - 길이 입력(Enter)·Esc를 줄자의 점 찍기·취소로 연결한다
 *  - 기즈모 이동 드래그용 스냅 세션을 만든다 (카메라는 컨트롤러가 ref로 알려 준다)
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { createStudioBg3dInferenceDragSession } from "./studio-bg3d-inference-drag";
import { applyStudioBg3dInferenceToPlacementTarget } from "./studio-bg3d-inference-placement";
import { createStudioBg3dInferenceService } from "./studio-bg3d-inference-service";
import {
  buildStudioBg3dInferenceEntities,
  buildStudioBg3dInferenceGuideSources,
  readStudioBg3dInferenceLocalBounds,
} from "./studio-bg3d-inference-scene";
import { collectStudioBg3dInferenceDescendantIds } from "./studio-bg3d-inference-sources";
import { useStudioBg3dInferenceKeyboard } from "./useStudioBg3dInference";

import type { Camera, Object3D } from "three";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { StudioBg3dInferenceDragSession } from "./studio-bg3d-inference-drag";
import type { StudioBg3dInferenceVec3 } from "./studio-bg3d-inference-math";
import type { StudioBg3dInferencePlacementTargetLike } from "./studio-bg3d-inference-placement";
import type { StudioBg3dInferenceService } from "./studio-bg3d-inference-service";
import type { StudioBg3dMeasurementDocument } from "./studio-bg3d-measurement";

type V3 = StudioBg3dInferenceVec3;

/** 훅이 호스트 백(h)에서 읽는 값의 부분집합. */
export interface StudioBg3dInferenceHostInput {
  readonly open: boolean;
  readonly primitives: readonly BgPrimitive[];
  readonly customModels: readonly BgCustomModelInstance[];
  readonly primitiveObjectsRef: { readonly current: ReadonlyMap<string, Object3D> | null | undefined };
  readonly modelRootCacheRef: {
    readonly current: ReadonlyMap<string, { readonly root?: Object3D | null }> | null | undefined;
  };
  readonly viewportHostRef: { readonly current: HTMLElement | null };
  readonly measurementActive: boolean;
  readonly measurementStartWorld: V3 | null;
  readonly measurementDocument: StudioBg3dMeasurementDocument;
  readonly effectiveIsQuadView: boolean;
  readonly immersiveSceneActive: boolean;
  /** 3D 모델 배치 미리보기 중인지. */
  readonly placementActive: boolean;
  readonly selectedIds: ReadonlySet<string>;
  readonly firstSelectedId: string | null | undefined;
  readonly transformSpace: string | undefined;
  /** 줄자: 점을 찍는다. 두 번째 인자는 정확한 길이(m) 잠금 — 길이 입력으로 확정할 때 쓴다. */
  readonly pickMeasurementPoint: (point: V3, lockedLengthMeters?: number) => void;
  /** 줄자: Esc. 시작점이 있으면 시작점만 취소하고, 없으면 도구를 끈다. */
  readonly cancelMeasurementStep: () => void;
}

export interface StudioBg3dInferenceHostResult {
  readonly service: StudioBg3dInferenceService;
  readonly drag: StudioBg3dInferenceDragSession;
  /** 컨트롤러가 이 뷰의 카메라를 알려 주는 콜백(`onCameraChange`). 항상 같은 함수다. */
  readonly onCameraChange: (camera: Camera | null) => void;
  /** 가장 최근에 알려 준 카메라 — 진단·테스트용. */
  readonly getCamera: () => Camera | null;
  /** 줄자·모델 배치처럼 포인터 추론을 쓰는 중인지 — 컨트롤러의 `active`. */
  readonly pointerToolActive: boolean;
  /** 모델 배치의 표면/바닥 목표점을 추론 점으로 바꿔 준다. 추론이 없으면 입력을 그대로 돌려준다. */
  readonly inferPlacementTarget: <T extends StudioBg3dInferencePlacementTargetLike>(target: T) => T;
  /** HUD의 키보드 점 고르기에서 점을 골랐을 때(줄자의 시작·끝점). */
  readonly pickPoint: (point: V3) => void;
}

function sameVec(a: V3 | null, b: V3 | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export function useStudioBg3dInferenceHost(host: StudioBg3dInferenceHostInput): StudioBg3dInferenceHostResult {
  const latest = useRef(host);
  useLayoutEffect(() => {
    latest.current = host;
  });
  const cameraRef = useRef<Camera | null>(null);
  const altRef = useRef(false);
  const [onCameraChange] = useState(() => (camera: Camera | null) => {
    cameraRef.current = camera;
  });
  const [getCamera] = useState(() => () => cameraRef.current);

  const guideSources = useMemo(
    () => buildStudioBg3dInferenceGuideSources(host.measurementDocument),
    [host.measurementDocument],
  );
  const guideSourcesRef = useRef(guideSources);
  useLayoutEffect(() => {
    guideSourcesRef.current = guideSources;
  }, [guideSources]);

  const [bundle] = useState(() => {
    const service = createStudioBg3dInferenceService();
    const syncScene = () => {
      const current = latest.current;
      service.syncScene({
        entities: buildStudioBg3dInferenceEntities({
          primitives: current.primitives,
          customModels: current.customModels,
          objects: current.primitiveObjectsRef.current ?? null,
          fallbackModelBounds: (instance) => {
            const root = current.modelRootCacheRef.current?.get(instance.modelId)?.root;
            return root ? readStudioBg3dInferenceLocalBounds(root) : null;
          },
        }),
        lines: guideSourcesRef.current.lines,
      });
    };
    const drag = createStudioBg3dInferenceDragSession({
      service,
      getCamera: () => cameraRef.current,
      getViewportHeightPx: () => latest.current.viewportHostRef.current?.clientHeight ?? 0,
      syncScene,
      getExcludedIds: () => {
        const current = latest.current;
        const hierarchy = [...current.primitives, ...current.customModels].map((entity) => ({
          id: entity.id,
          parentId: entity.parentId ?? null,
        }));
        return collectStudioBg3dInferenceDescendantIds(current.selectedIds, hierarchy);
      },
      getSpace: () => (latest.current.transformSpace === "local" ? "local" : "world"),
      isAltDown: () => altRef.current,
    });
    return { service, syncScene, drag };
  });
  const { service, syncScene, drag } = bundle;

  useStudioBg3dInferenceKeyboard(service, host.open);

  const measureActive = host.open && host.measurementActive && !host.effectiveIsQuadView && !host.immersiveSceneActive;
  const placementToolActive = host.open
    && host.placementActive
    && !measureActive
    && !host.effectiveIsQuadView
    && !host.immersiveSceneActive;

  // 줄자 세션 수명: 켜지면 열고 꺼지면 닫는다.
  useEffect(() => {
    if (!measureActive) return undefined;
    syncScene();
    service.begin("measure", {
      referencePoint: latest.current.measurementStartWorld,
      unit: latest.current.measurementDocument.unit,
      handlers: {
        applyLength: ({ endPoint, meters }) => latest.current.pickMeasurementPoint(endPoint, meters),
        cancel: () => latest.current.cancelMeasurementStep(),
      },
    });
    return () => service.end();
  }, [measureActive, service, syncScene]);

  // 모델 배치 미리보기 세션: HUD·키보드 없이 마커와 안내문만 쓰고, 배치 목표점을 추론 점으로 바꾼다.
  useEffect(() => {
    if (!placementToolActive) return undefined;
    syncScene();
    service.begin("generic", { keyboard: false, hud: false });
    return () => service.end();
  }, [placementToolActive, service, syncScene]);

  // 시작점이 바뀌면 기준점을 맞춘다 (값이 같으면 잠금·입력을 지우지 않는다).
  const startWorld = host.measurementStartWorld;
  useEffect(() => {
    if (!measureActive) return;
    if (sameVec(service.getSnapshot().session.referencePoint, startWorld)) return;
    service.setReference(startWorld);
  }, [measureActive, service, startWorld]);

  const unit = host.measurementDocument.unit;
  useEffect(() => {
    if (measureActive) service.setUnit(unit);
  }, [measureActive, service, unit]);

  // 측정 가이드가 바뀌면 평행·수직 기준과 장면 색인을 맞춘다.
  useEffect(() => {
    service.setReferenceDirections(guideSources.directions);
  }, [guideSources, service]);

  // 세션 중 장면이 바뀌면 색인을 맞춘다 (같은 장면이면 서비스가 재빌드를 건너뛴다).
  useEffect(() => {
    if (service.isActive()) syncScene();
  }, [host.primitives, host.customModels, guideSources, service, syncScene]);

  // 키보드 점 고르기 목록의 기준: 선택한 객체의 월드 위치.
  useEffect(() => {
    const id = host.firstSelectedId;
    const object = id ? host.primitiveObjectsRef.current?.get(id) : null;
    if (!object) {
      service.setFocusPoint(null);
      return;
    }
    object.updateWorldMatrix(true, false);
    service.setFocusPoint([object.matrixWorld.elements[12] ?? 0, object.matrixWorld.elements[13] ?? 0, object.matrixWorld.elements[14] ?? 0]);
  }, [host.firstSelectedId, host.primitives, host.customModels, host.primitiveObjectsRef, service]);

  // Alt(스냅 반전) 상태 추적 — 드래그 중에도 쓰도록 항상 켜 둔다.
  useEffect(() => {
    if (!host.open || typeof window === "undefined") return undefined;
    const sync = (event: { readonly altKey: boolean }) => {
      altRef.current = event.altKey;
    };
    const reset = () => {
      altRef.current = false;
    };
    window.addEventListener("keydown", sync, true);
    window.addEventListener("keyup", sync, true);
    window.addEventListener("pointermove", sync, { capture: true, passive: true });
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", sync, true);
      window.removeEventListener("keyup", sync, true);
      window.removeEventListener("pointermove", sync, true);
      window.removeEventListener("blur", reset);
    };
  }, [host.open]);

  // 언마운트·닫힘: 진행 중인 드래그·세션을 정리한다.
  useEffect(
    () => () => {
      drag.end();
      service.end();
    },
    [drag, service],
  );

  return {
    service,
    drag,
    onCameraChange,
    getCamera,
    pointerToolActive: measureActive || placementToolActive,
    inferPlacementTarget: (target) => applyStudioBg3dInferenceToPlacementTarget(service, target),
    pickPoint: (point) => latest.current.pickMeasurementPoint(point),
  };
}
