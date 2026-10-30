import { isStudioBg3dSceneGlbExportAvailable } from "./studio-bg3d-scene-glb-availability";
import { resolveStudioBg3dMaterialBackend } from "./studio-bg3d-model-material-variant";
import type { StudioBg3dSceneGlbExportHost } from "./studio-bg3d-scene-glb-source";
import type { StudioBg3dSceneGlbExportPorts } from "./studio-bg3d-scene-glb-ports";

function scope(host: StudioBg3dSceneGlbExportHost) {
  return { session: host.modalAssetSessionRef?.current, document: JSON.stringify(host.physicsRuntimeSourceRef?.current.document),
    materialBackend: resolveStudioBg3dMaterialBackend({ renderer: host.modelRenderer, materialBackend: host.materialBackend }), renderer: host.modelRenderer, isMaterialBackendCurrent: host.isMaterialBackendCurrent,
    framing: JSON.stringify(host.viewportApiRef?.current?.readFramingState()) };
}
/** 읽기 시점마다 가변 호스트를 확인하고 사용자 의도 뒤에만 exporter를 로드한다. */
export function createStudioBg3dSceneGlbHostPorts(host: StudioBg3dSceneGlbExportHost): StudioBg3dSceneGlbExportPorts {
  return {
    sceneGlbExportUnavailableReason: isStudioBg3dSceneGlbExportAvailable(host) ? null : "장면과 모델을 준비 중입니다. 준비가 끝나면 저장할 수 있습니다.",
    onExportCurrentSceneGlb: async (request) => {
      if (request.signal.aborted) return { ok: false, code: "aborted", messageKo: "장면 GLB 저장을 취소했습니다." };
      if (!isStudioBg3dSceneGlbExportAvailable(host)) return { ok: false, code: "unavailable", messageKo: "현재 장면과 모델이 준비된 뒤 다시 저장해 주세요." };
      try {
        const before = scope(host);
        const { exportStudioBg3dCurrentSceneGlb } = await import("./studio-bg3d-scene-glb-command");
        const latest = scope(host);
        if (before.isMaterialBackendCurrent?.() === false || before.materialBackend !== latest.materialBackend || before.renderer !== latest.renderer
          || before.session !== latest.session || before.document !== latest.document || before.framing !== latest.framing) {
          return { ok: false, code: "source-changed", messageKo: "저장 도구를 준비하는 동안 장면·카메라가 바뀌었습니다. 현재 장면에서 다시 저장해 주세요." };
        }
        return await exportStudioBg3dCurrentSceneGlb(host, request);
      } catch {
        return { ok: false, code: "unavailable", messageKo: "장면 GLB 저장 도구를 준비하지 못했습니다. 다시 시도하세요." };
      }
    },
  };
}
