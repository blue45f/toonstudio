import { OrbitControls } from "@react-three/drei/core/OrbitControls.js";
import { useCallback, useRef, type ComponentProps } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { preserveStudioHybridDccIdleOrbitCamera } from "./studio-hybrid-dcc-orbit-camera";

export function StudioHybridDccOrbitControls(props: Omit<ComponentProps<typeof OrbitControls>, "ref">) {
  const cleanup = useRef<(() => void) | undefined>(undefined);
  const attach = useCallback((controls: OrbitControlsImpl | null) => {
    cleanup.current?.();
    cleanup.current = controls ? preserveStudioHybridDccIdleOrbitCamera(controls) : undefined;
  }, []);
  return <OrbitControls {...props} ref={attach} />;
}
