import { TransformControls, type TransformControlsProps } from "@react-three/drei";
import { useLayoutEffect, useRef } from "react";

import { watchStudioBg3dTransformControlsAttachment } from "./studio-bg3d-transform-controls-attachment";

import type { Object3D } from "three";
import type { TransformControls as TransformControlsInstance } from "three-stdlib";

type Props = Omit<TransformControlsProps, "object"> & { object: Object3D };

export function StudioBg3dAttachedTransformControls({ object, ...props }: Props) {
  const controls = useRef<TransformControlsInstance>(null);
  // 같은 target에서도 camera 교체로 Drei controls 인스턴스가 바뀔 수 있다.
  useLayoutEffect(() => {
    if (!controls.current) return;
    return watchStudioBg3dTransformControlsAttachment(controls.current, object);
  });
  return <TransformControls {...props} ref={controls} object={object} />;
}
