/**
 * 추론 컨트롤러 — 포인터를 레이로 바꿔 추론 서비스에 먹이는 R3F 컴포넌트.
 *
 * 반드시 렌더링 뷰(`View`) 안에 마운트한다. `View`의 포털은 자기 카메라를 갖기 때문에, 루트 수준에서
 * `useThree().camera`를 쓰면 실제로 화면에 그려지는 카메라와 다를 수 있다. 렌더링은 하지 않고
 * (`null` 반환) 이벤트 연결만 한다. 실제 로직은 DOM·three.js 합성 객체로 테스트되는
 * `attachStudioBg3dInferencePointer`에 있다.
 */

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";

import { isStudioBg3dViewportControlTarget } from "./studio-bg3d-camera-application";
import { attachStudioBg3dInferencePointer } from "./studio-bg3d-inference-pointer-binding";

import type { Camera, Object3D } from "three";

import type { StudioBg3dInferenceService } from "./studio-bg3d-inference-service";

export interface StudioBg3dInferenceControllerProps {
  readonly service: StudioBg3dInferenceService;
  /** 줄자·벽 그리기처럼 포인터로 점을 찍는 도구가 활성일 때만 true. */
  readonly active: boolean;
  /** 장면 객체 id → three 객체. 보이는 객체만 레이캐스트한다. */
  readonly objectsRef: { readonly current: ReadonlyMap<string, Object3D> | null | undefined };
  /** 바닥 평면 높이. null이면 바닥을 후보로 쓰지 않는다. */
  readonly groundY?: number | null;
  /**
   * 이 뷰의 실제 카메라를 호스트에 알린다. 기즈모 드래그 같은 R3F 밖의 코드가 화면 1px의
   * 월드 길이를 구할 때 쓴다. `active` 여부와 무관하게 항상 알리고, 사라질 때 null을 알린다.
   */
  readonly onCameraChange?: (camera: Camera | null) => void;
}

export function StudioBg3dInferenceController({
  service,
  active,
  objectsRef,
  groundY = 0,
  onCameraChange,
}: StudioBg3dInferenceControllerProps) {
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  const connected = useThree((state) => state.events.connected as HTMLElement | undefined);

  useEffect(() => {
    if (!onCameraChange) return undefined;
    onCameraChange(camera);
    return () => onCameraChange(null);
  }, [camera, onCameraChange]);

  useEffect(() => {
    if (!active || !canvas?.addEventListener) return undefined;
    const target = connected ?? canvas;
    const binding = attachStudioBg3dInferencePointer({
      target,
      service,
      getCamera: () => camera,
      getRect: () => target.getBoundingClientRect(),
      getRoots: () => objectsRef.current ?? null,
      groundY,
      isControlTarget: isStudioBg3dViewportControlTarget,
    });
    return () => binding.detach();
  }, [active, camera, canvas, connected, groundY, objectsRef, service]);

  return null;
}
