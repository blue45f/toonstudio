import { useEffect, useRef, type RefObject } from "react";

import {
  createStudioVrmSurfacePaintTool,
  type StudioVrmSurfacePaintTool,
  type StudioVrmSurfacePaintToolSnapshot,
} from "./studio-vrm-surface-paint-tool";

export function useStudioVrmSurfacePaintTool(
  snapshotListener: RefObject<(snapshot: StudioVrmSurfacePaintToolSnapshot | null) => void>,
) {
  const toolRef = useRef<StudioVrmSurfacePaintTool | null>(null);
  useEffect(() => {
    const onSnapshot = (snapshot: StudioVrmSurfacePaintToolSnapshot | null) => snapshotListener.current(snapshot);
    const tool = createStudioVrmSurfacePaintTool({ onSnapshot });
    toolRef.current = tool;
    return () => {
      toolRef.current = null;
      tool.cancel("unmount");
      tool.dispose();
      onSnapshot(null);
    };
  }, [snapshotListener]);
  return toolRef;
}
