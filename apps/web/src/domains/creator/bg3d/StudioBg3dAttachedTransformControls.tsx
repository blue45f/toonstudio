import { TransformControls, type TransformControlsProps } from "@react-three/drei";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

import {
  watchStudioBg3dTransformControlsAttachment,
  watchStudioBg3dTransformControlsInterruption,
  type StudioBg3dInterruptibleTransformControls,
} from "./studio-bg3d-transform-controls-attachment";

import type { Object3D } from "three";
import type { TransformControls as TransformControlsInstance } from "three-stdlib";

type Props = Omit<TransformControlsProps, "object"> & {
  object: Object3D;
  onBeforeDragCancel?: () => void;
  onDragCancel?: () => void;
};

export function StudioBg3dAttachedTransformControls({
  object,
  onBeforeDragCancel,
  onDragCancel,
  ...props
}: Props) {
  // Drei는 같은 선택 객체에서도 camera 교체 시 새 controls를 전달한다.
  // 실제 인스턴스 수명에 구독을 묶어 정상 부모 재렌더가 drag를 reset하지 않게 한다.
  const [controls, setControls] = useState<TransformControlsInstance | null>(null);
  const objectRef = useRef(object);
  const bindingRef = useRef<{ controls: TransformControlsInstance; stop: () => void } | null>(null);
  const beforeCancelRef = useRef(onBeforeDragCancel);
  const cancelRef = useRef(onDragCancel);
  beforeCancelRef.current = onBeforeDragCancel;
  cancelRef.current = onDragCancel;
  const bindControls = useCallback((next: TransformControlsInstance | null) => {
    // ref 해제 시점에 정리해야 Drei의 detach 뒤에 이전 자세를 복원하려 하지 않는다.
    if (bindingRef.current?.controls !== next) bindingRef.current?.stop();
    setControls(next);
  }, []);
  useLayoutEffect(() => {
    if (!controls) return;
    // 안정된 object ref를 Drei에 넘기고 대상 교체는 이 구독에서 순서대로 소유한다.
    // 이전 cleanup이 먼저 drag를 복원하므로 reset이 새 선택 객체에 적용되지 않는다.
    objectRef.current = object;
    controls.attach(object);
    const stopAttachment = watchStudioBg3dTransformControlsAttachment(controls, object);
    const stopInterruption = watchStudioBg3dTransformControlsInterruption(
      controls as unknown as StudioBg3dInterruptibleTransformControls,
      {
        onBeforeCancel: () => beforeCancelRef.current?.(),
        onDragCancel: () => cancelRef.current?.(),
      },
    );
    let active = true;
    const stop = () => {
      if (!active) return;
      active = false;
      stopInterruption();
      stopAttachment();
      if (bindingRef.current?.stop === stop) bindingRef.current = null;
    };
    bindingRef.current = { controls, stop };
    return stop;
  }, [controls, object]);
  return <TransformControls {...props} ref={bindControls} object={objectRef} />;
}
