import { TransformControls, type TransformControlsProps } from "@react-three/drei";
import { useEffect, useLayoutEffect, useRef } from "react";

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
  const controls = useRef<TransformControlsInstance>(null);
  const beforeCancelRef = useRef(onBeforeDragCancel);
  const cancelRef = useRef(onDragCancel);
  beforeCancelRef.current = onBeforeDragCancel;
  cancelRef.current = onDragCancel;
  // 같은 target에서도 camera 교체로 Drei controls 인스턴스가 바뀔 수 있다.
  useLayoutEffect(() => {
    if (!controls.current) return;
    return watchStudioBg3dTransformControlsAttachment(controls.current, object);
  });
  useEffect(() => {
    if (!controls.current) return;
    return watchStudioBg3dTransformControlsInterruption(
      controls.current as unknown as StudioBg3dInterruptibleTransformControls,
      {
        onBeforeCancel: () => beforeCancelRef.current?.(),
        onDragCancel: () => cancelRef.current?.(),
      },
    );
  });
  return <TransformControls {...props} ref={controls} object={object} />;
}
