/**
 * 기즈모 이동 드래그 ↔ 추론 변형 스냅 — three.js 접착 코드.
 *
 * TransformControls는 포인터마다 객체 위치를 직접 바꾸고 `objectChange`를 알린다. 이 모듈은 그 직후에
 * 객체의 기준점(경계 상자 바닥 중심·모서리)이 주변 끝점·중간점·중심·상자 면에 붙도록 위치를 보정한다.
 * 계산은 순수 어댑터(`planStudioBg3dInferenceTransformSnap`)와 변형 스냅 계획기가 하고, 여기서는
 *  - 드래그 시작 시 기준점·시작 위치를 기록하고,
 *  - 샘플마다 카메라 깊이에서 화면 1px의 월드 길이를 구하고,
 *  - 기즈모 축(X/XY/…)을 계획기의 축·평면 제약으로 바꾸고,
 *  - 계획 결과를 부모 좌표계로 변환해 객체에 쓰고, 표시용 추론 결과를 서비스에 게시한다.
 * Alt를 누르고 있으면 스냅을 반전(끔)한다. 이동 모드가 아니면 아무것도 하지 않는다.
 */

import * as THREE from "three";

import { resolveStudioBg3dInferenceProjection } from "./studio-bg3d-inference-pointer";
import { planStudioBg3dInferenceTransformSnap } from "./studio-bg3d-inference-transform";

import type { StudioBg3dInferenceVec3 } from "./studio-bg3d-inference-math";
import type { StudioBg3dInferenceService } from "./studio-bg3d-inference-service";
import type {
  StudioBg3dTransformConstraint,
  StudioBg3dTransformOrientation,
} from "./studio-bg3d-transform-snap-planner";

type V3 = StudioBg3dInferenceVec3;

export type StudioBg3dInferenceDragSpace = "world" | "local";

export interface StudioBg3dInferenceDragHost {
  readonly service: StudioBg3dInferenceService;
  readonly getCamera: () => THREE.Camera | null;
  /** 뷰포트 높이(px) — 화면 1px의 월드 길이를 구하는 데 쓴다. */
  readonly getViewportHeightPx: () => number;
  /** 드래그 직전에 장면 색인을 최신으로 맞춘다. */
  readonly syncScene: () => void;
  /** 드래그하는 객체(와 그 하위) id — 자기 자신에게는 붙지 않는다. */
  readonly getExcludedIds: () => ReadonlySet<string>;
  readonly getSpace: () => StudioBg3dInferenceDragSpace;
  /** Alt 키가 눌린 상태인지 (스냅 반전). */
  readonly isAltDown?: () => boolean;
}

export interface StudioBg3dInferenceDragUpdate {
  /** 지오메트리(끝점·면) 스냅이 적용되어 객체 위치를 바꿨는지. */
  readonly snapped: boolean;
}

export interface StudioBg3dInferenceDragSession {
  /** 이동 드래그 시작. 이미 진행 중이면 무시한다. */
  begin(object: THREE.Object3D): void;
  /** `objectChange`마다 호출한다. `axis`는 TransformControls의 현재 축('X','XY','XYZ', null …). */
  update(axis: string | null | undefined): StudioBg3dInferenceDragUpdate;
  /** 드래그 종료. 마지막 샘플이 지오메트리 스냅이었는지 돌려준다. */
  end(): { readonly lastSnapped: boolean };
  readonly isActive: () => boolean;
}

const EMPTY_UPDATE: StudioBg3dInferenceDragUpdate = Object.freeze({ snapped: false });

/** TransformControls 축 이름 → 계획기 제약. 이동 외의 축 이름은 자유로 본다. */
export function resolveStudioBg3dInferenceDragConstraint(
  axis: string | null | undefined,
): StudioBg3dTransformConstraint {
  switch (axis) {
    case "X":
      return { kind: "axis", axis: "x" };
    case "Y":
      return { kind: "axis", axis: "y" };
    case "Z":
      return { kind: "axis", axis: "z" };
    case "XY":
      return { kind: "plane", excludedAxis: "z" };
    case "YZ":
      return { kind: "plane", excludedAxis: "x" };
    case "XZ":
      return { kind: "plane", excludedAxis: "y" };
    default:
      return { kind: "free" };
  }
}

/** 경계 상자의 스냅 기준점들: 바닥 중심, 바닥 모서리 4개, 윗면 모서리 4개 (최대 9개). */
export function collectStudioBg3dInferenceDragBases(box: THREE.Box3, fallback: V3): V3[] {
  if (box.isEmpty()) return [fallback];
  const { min, max } = box;
  const midX = (min.x + max.x) / 2;
  const midZ = (min.z + max.z) / 2;
  return [
    [midX, min.y, midZ],
    [min.x, min.y, min.z],
    [max.x, min.y, min.z],
    [min.x, min.y, max.z],
    [max.x, min.y, max.z],
    [min.x, max.y, min.z],
    [max.x, max.y, min.z],
    [min.x, max.y, max.z],
    [max.x, max.y, max.z],
  ];
}

/** 객체 깊이에서 화면 1px에 해당하는 월드 길이. 계산할 수 없으면 null. */
export function resolveStudioBg3dInferenceWorldPerPixel(
  camera: THREE.Camera,
  viewportHeightPx: number,
  worldPoint: THREE.Vector3,
): number | null {
  const projection = resolveStudioBg3dInferenceProjection(camera, viewportHeightPx);
  if (!projection) return null;
  if (projection.type === "orthographic") return projection.worldPerPixel;
  const depth = camera.getWorldPosition(new THREE.Vector3()).distanceTo(worldPoint);
  const value = depth * projection.radiansPerPixel;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function localAxes(object: THREE.Object3D): { x: V3; y: V3; z: V3 } {
  const rotation = object.getWorldQuaternion(new THREE.Quaternion());
  const axis = (x: number, y: number, z: number): V3 => {
    const vector = new THREE.Vector3(x, y, z).applyQuaternion(rotation).normalize();
    return [vector.x, vector.y, vector.z];
  };
  return { x: axis(1, 0, 0), y: axis(0, 1, 0), z: axis(0, 0, 1) };
}

export function createStudioBg3dInferenceDragSession(
  host: StudioBg3dInferenceDragHost,
): StudioBg3dInferenceDragSession {
  let object: THREE.Object3D | null = null;
  let startWorld: V3 = [0, 0, 0];
  let bases: V3[] = [];
  let lastSnapped = false;

  const publish = (result: Parameters<StudioBg3dInferenceService["publishResult"]>[0]) => {
    host.service.publishResult(result);
  };

  return {
    begin(target) {
      if (object) return;
      target.updateWorldMatrix(true, true);
      const world = target.getWorldPosition(new THREE.Vector3());
      startWorld = [world.x, world.y, world.z];
      bases = collectStudioBg3dInferenceDragBases(new THREE.Box3().setFromObject(target), startWorld);
      object = target;
      lastSnapped = false;
      host.syncScene();
      host.service.begin("move", {
        referencePoint: startWorld,
        excludeSourceIds: host.getExcludedIds(),
        keyboard: false,
        hud: false,
      });
    },

    update(axis) {
      const target = object;
      const camera = host.getCamera();
      if (!target || !camera) return EMPTY_UPDATE;
      target.updateWorldMatrix(true, false);
      const world = target.getWorldPosition(new THREE.Vector3());
      const proposed: V3 = [world.x, world.y, world.z];
      const worldPerPixel = resolveStudioBg3dInferenceWorldPerPixel(camera, host.getViewportHeightPx(), world);
      if (worldPerPixel === null) {
        lastSnapped = false;
        publish(null);
        return EMPTY_UPDATE;
      }
      const orientation: StudioBg3dTransformOrientation = host.getSpace() === "local"
        ? { space: "local", axes: localAxes(target) }
        : { space: "global" };
      const outcome = planStudioBg3dInferenceTransformSnap({
        index: host.service.getIndex(),
        startWorldPosition: startWorld,
        proposedWorldPosition: proposed,
        snapBases: bases,
        orientation,
        constraint: resolveStudioBg3dInferenceDragConstraint(axis),
        snap: { enabled: true, modes: ["vertex", "surface"] },
        modifiers: { invertSnapping: host.isAltDown?.() === true },
        worldPerPixel,
        excludeSourceIds: host.getExcludedIds(),
      });
      if (!outcome.ok || !outcome.geometrySnapped) {
        lastSnapped = false;
        publish(null);
        return EMPTY_UPDATE;
      }

      const next = outcome.plan.positionWorld;
      const local = new THREE.Vector3(next[0], next[1], next[2]);
      if (target.parent) {
        target.parent.updateWorldMatrix(true, false);
        target.parent.worldToLocal(local);
      }
      target.position.copy(local);
      target.updateMatrixWorld(true);
      lastSnapped = true;
      publish(outcome.inference);
      return { snapped: true };
    },

    end() {
      const snapped = lastSnapped;
      if (object) host.service.end();
      object = null;
      bases = [];
      lastSnapped = false;
      return { lastSnapped: snapped };
    },

    isActive: () => object !== null,
  };
}
