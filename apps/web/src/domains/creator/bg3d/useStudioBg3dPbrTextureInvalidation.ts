import { useThree } from "@react-three/fiber";
import { useEffect, useSyncExternalStore } from "react";

import {
  getStudioBg3dCc0PbrTextureReadyRevision,
  subscribeStudioBg3dCc0PbrTextureReady,
} from "./studio-bg3d-cc0-pbr-texture-loader";

/** 캐시 이미지 완료를 해당 Canvas의 정상 demand frame으로 전달한다. */
export function useStudioBg3dPbrTextureInvalidation(): void {
  const invalidate = useThree((state) => state.invalidate);
  const revision = useSyncExternalStore(
    subscribeStudioBg3dCc0PbrTextureReady,
    getStudioBg3dCc0PbrTextureReadyRevision,
    getStudioBg3dCc0PbrTextureReadyRevision,
  );
  useEffect(() => { invalidate(); }, [invalidate, revision]);
}
