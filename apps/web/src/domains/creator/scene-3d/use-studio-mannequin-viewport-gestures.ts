/**
 * 3D 데생 인형 뷰포트 제스처 경계 — 되돌리기 단위와 카메라 앵글 선택 표시를 맞춘다.
 *
 * 씬(studio-mannequin-scene)은 관절·IK 드래그가 끝날 때만 onPoseEdited를 한 번 부르고,
 * 빈 곳 드래그(궤도 회전)·우클릭 드래그(이동)·더블클릭(부위 확대)은 호스트에 알리지 않는다.
 * 그래서 호스트는 뷰포트 컨테이너에서 포인터를 직접 지켜본다.
 *
 * 1) 포인터를 누를 때마다 되돌리기 제스처 경계를 새로 긋는다. 예전에는 관절 탭에서만
 *    경계를 그어 뷰포트 드래그 여러 번이 직전 결정과 한 단계로 묶였다(드래그 3번이 되돌리기
 *    1번에 함께 취소됨). 이제 드래그 1회 = 되돌리기 1단계다.
 * 2) 포인터를 뗐을 때 움직였는데 그 사이 포즈 편집이 없었다면 카메라가 움직인 것이므로
 *    앵글 프리셋 선택 표시를 푼다(선택된 '정면' 칩이 실제 화면과 어긋나지 않게).
 *
 * React 포털 이벤트 순서: 캡처 단계 핸들러는 캔버스 리스너보다 먼저, 버블 단계 onPointerUp은
 * 캔버스의 pointerup(씬이 onPoseEdited를 부르는 곳)보다 나중에 돈다.
 */

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";

import type { StudioMannequinJointId, StudioMannequinVec3 } from "./studio-mannequin-model";
import type { StudioMannequinPose } from "./studio-mannequin-poses";

/** 이 거리(px)보다 덜 움직였으면 클릭으로 본다(씬의 직접 드래그 문턱 3px와 같다). */
const CAMERA_DRAG_THRESHOLD_PX = 3;
const POSE_EPSILON = 1e-6;
const IDENTITY: StudioMannequinVec3 = [0, 0, 0];

function vecNearlyEqual(a: StudioMannequinVec3, b: StudioMannequinVec3): boolean {
  return (
    Math.abs(a[0] - b[0]) <= POSE_EPSILON
    && Math.abs(a[1] - b[1]) <= POSE_EPSILON
    && Math.abs(a[2] - b[2]) <= POSE_EPSILON
  );
}

/**
 * 두 포즈가 사실상 같은지. 빠진 관절은 항등 회전으로 본다 — 씬이 그래프에서 읽은 포즈는
 * 모든 관절을 담고 호스트 포즈는 항등 관절을 생략하므로, 키 집합이 아니라 값으로 비교한다.
 * IK 핸들을 움직이지 않고 눌렀다 뗀 경우처럼 바뀐 것이 없으면 되돌리기 단계를 만들지 않는다.
 */
export function studioMannequinPosesNearlyEqual(
  a: StudioMannequinPose,
  b: StudioMannequinPose,
): boolean {
  if (!vecNearlyEqual(a.pelvisOffset, b.pelvisOffset)) return false;
  const jointIds = new Set<StudioMannequinJointId>([
    ...(Object.keys(a.joints) as StudioMannequinJointId[]),
    ...(Object.keys(b.joints) as StudioMannequinJointId[]),
  ]);
  for (const jointId of jointIds) {
    if (!vecNearlyEqual(a.joints[jointId] ?? IDENTITY, b.joints[jointId] ?? IDENTITY)) return false;
  }
  return true;
}

interface ViewportGesture {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  poseEdited: boolean;
}

export interface StudioMannequinViewportGestureOptions {
  /** 포인터를 누를 때마다 — 되돌리기 제스처 경계. */
  readonly onGestureStart: () => void;
  /** 궤도 회전·이동·부위 확대처럼 포즈가 아니라 카메라가 움직였을 때. */
  readonly onCameraMoved: () => void;
}

export interface StudioMannequinViewportGestureHandlers {
  readonly onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onDoubleClick: () => void;
}

export function useStudioMannequinViewportGestures(options: StudioMannequinViewportGestureOptions): {
  readonly handlers: StudioMannequinViewportGestureHandlers;
  /** 씬의 onPoseEdited에서 부른다 — 이번 제스처가 포즈 편집이었음을 표시한다. */
  readonly notePoseEdited: () => void;
} {
  const gestureRef = useRef<ViewportGesture | null>(null);

  const notePoseEdited = useCallback(() => {
    if (gestureRef.current) gestureRef.current.poseEdited = true;
  }, []);

  function finishGesture(event: ReactPointerEvent<HTMLElement>): void {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (gesture.poseEdited) return;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > CAMERA_DRAG_THRESHOLD_PX) {
      options.onCameraMoved();
    }
  }

  return {
    handlers: {
      onPointerDownCapture(event) {
        // 핀치의 두 번째 손가락은 진행 중인 제스처의 일부다. 주 포인터이거나 같은 포인터가
        // 다시 눌리면(놓친 pointerup 복구) 새 제스처를 시작한다.
        const active = gestureRef.current;
        if (active && event.isPrimary !== true && active.pointerId !== event.pointerId) return;
        options.onGestureStart();
        gestureRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          poseEdited: false,
        };
      },
      onPointerUp: finishGesture,
      onPointerCancel: finishGesture,
      onDoubleClick() {
        options.onCameraMoved();
      },
    },
    notePoseEdited,
  };
}
