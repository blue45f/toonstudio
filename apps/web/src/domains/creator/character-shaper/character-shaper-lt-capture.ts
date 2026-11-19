import { r3c04StatusText } from "../studio-r3c04-status-i18n";
import { STUDIO_LT_CONVERT_SOURCE_MAX_EDGE } from "../lt-convert/studio-lt-convert-source";
import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";
import type { CaptureState } from "../vrm/StudioVrmPoserTypes";
import { captureStudioVrmRgba } from "../vrm/studio-vrm-raster-capture";

export function captureCharacterShaperLt(host: StudioVrmPoserHost): ImageData {
  const capture: CaptureState | undefined = host.captureRef?.current;
  const { gl, scene, camera } = capture ?? {};
  if (!gl || !scene || !camera || host.status !== "ready" || gl.getContext().isContextLost()) {
    throw new Error(r3c04StatusText("studio.r3c04Status.shaper.viewportHud.captureUnavailable", "캐릭터 화면이 준비되지 않았습니다. 모델을 불러온 후 다시 시도하세요."));
  }
  if (!host.acquireVrmCaptureOperation("export")) throw new Error(r3c04StatusText("studio.r3c04Status.shaper.viewportHud.captureBusy", "다른 캡처가 끝난 후 다시 시도하세요."));
  let restore: (() => void) | undefined;
  try {
    restore = host.acquireVrmCaptureHelperLease({ subjectOnly: true });
    const { width, height } = gl.domElement;
    if (width <= 0 || height <= 0) throw new Error(r3c04StatusText("studio.r3c04Status.shaper.viewportHud.captureEmpty", "캐릭터 화면의 크기를 확인할 수 없습니다."));
    const scale = Math.min(1, STUDIO_LT_CONVERT_SOURCE_MAX_EDGE / Math.max(width, height));
    const size = { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
    const image = new ImageData(size.width, size.height);
    image.data.set(captureStudioVrmRgba(gl, scene, camera, size, { color: "#ffffff", alpha: 0 }));
    return image;
  } finally {
    try { restore?.(); } finally { host.releaseVrmCaptureOperation("export"); }
  }
}
