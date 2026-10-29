import { createStudioBg3dSceneGlbArtifact, type StudioBg3dSceneGlbArtifact } from "./studio-bg3d-scene-glb-artifact";
import { assertStudioBg3dSceneGlbSourceCurrent, captureStudioBg3dSceneGlbSource, StudioBg3dSceneGlbError,
  type StudioBg3dSceneGlbExportHost } from "./studio-bg3d-scene-glb-source";
import type { StudioBg3dSceneGlbExportRequest, StudioBg3dSceneGlbExportResult } from "./studio-bg3d-scene-glb-ports";
import { prepareStudioBg3dSceneGlbExportProvenance, assertStudioBg3dSceneGlbExportProvenanceCurrent } from "./studio-bg3d-scene-glb-export-provenance";
import type { StudioBg3dLibrariesAuthority } from "./studio-bg3d-libraries-sqlite-opfs-authority";

export interface StudioBg3dSceneGlbDownloadDependencies {
  readonly prepare: typeof createStudioBg3dSceneGlbArtifact;
  readonly createObjectUrl: (blob: Blob) => string;
  readonly revokeObjectUrl: (url: string) => void;
  readonly triggerDownload: (url: string, fileName: string) => void;
  readonly scheduleRevoke: (revoke: () => void) => void;
  readonly provenanceAuthority?: StudioBg3dLibrariesAuthority;
}
const DEFAULT_DEPENDENCIES: StudioBg3dSceneGlbDownloadDependencies = {
  prepare: createStudioBg3dSceneGlbArtifact,
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
  triggerDownload: (url, fileName) => {
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = fileName; anchor.rel = "noopener"; anchor.hidden = true;
    document.body.append(anchor);
    try { anchor.click(); } finally { anchor.remove(); }
  },
  scheduleRevoke: (revoke) => { globalThis.setTimeout(revoke, 1_000); },
};

/** 준비가 끝난 같은 장면의 파일만 한 번 다운로드한다. history·정본·모델 보관함은 쓰지 않는다. */
export async function exportStudioBg3dCurrentSceneGlb(host: StudioBg3dSceneGlbExportHost, request: StudioBg3dSceneGlbExportRequest,
  overrides: Partial<StudioBg3dSceneGlbDownloadDependencies> = {}): Promise<StudioBg3dSceneGlbExportResult> {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  let url: string | null = null;
  let downloaded = false;
  try {
    const source = captureStudioBg3dSceneGlbSource(host, request.signal);
    const assertCurrent = () => assertStudioBg3dSceneGlbSourceCurrent(host, source, request.signal);
    const exportProvenance = source.assets.size > 0 ? await prepareStudioBg3dSceneGlbExportProvenance(source,
      { signal: request.signal, assertCurrent, authority: dependencies.provenanceAuthority }) : undefined;
    assertCurrent();
    const artifact: StudioBg3dSceneGlbArtifact = await dependencies.prepare(source, { name: request.name, signal: request.signal, assertCurrent,
      provenanceAuthority: dependencies.provenanceAuthority, exportProvenance });
    if (exportProvenance) await assertStudioBg3dSceneGlbExportProvenanceCurrent(exportProvenance, source);
    assertCurrent();
    try {
      url = dependencies.createObjectUrl(new Blob([Uint8Array.from(artifact.bytes)], { type: "model/gltf-binary" }));
      assertCurrent();
      dependencies.triggerDownload(url, artifact.fileName);
      downloaded = true;
    } catch (error) {
      if (error instanceof StudioBg3dSceneGlbError) throw error;
      throw new StudioBg3dSceneGlbError("download-failed", "장면 GLB 파일 저장을 시작하지 못했습니다. 다시 시도해 주세요.");
    }
    return { ok: true, fileName: artifact.fileName, contentHash: artifact.contentHash, byteSize: artifact.bytes.byteLength,
      exportedNodeCount: artifact.exportedNodeCount, hiddenNodeCount: artifact.hiddenNodeCount };
  } catch (error) {
    if (request.signal.aborted) return { ok: false, code: "aborted", messageKo: "장면 GLB 저장을 취소했습니다." };
    if (error instanceof StudioBg3dSceneGlbError) return { ok: false, code: error.code, messageKo: error.messageKo };
    return { ok: false, code: "export-failed", messageKo: "현재 장면을 GLB로 보존하지 못했습니다. 모델·재질 상태를 확인한 뒤 다시 시도하세요." };
  } finally {
    if (url !== null) {
      const owned = url;
      const revoke = () => {
        try { dependencies.revokeObjectUrl(owned); }
        catch {
          // 다운로드 또는 원래 실패 결과를 자원 정리 예외로 덮지 않는다. 주소·파일 내용은 기록하지 않는다.
          console.warn("장면 GLB 저장의 임시 파일 주소를 해제하지 못했습니다.");
        }
      };
      if (downloaded) {
        try { dependencies.scheduleRevoke(revoke); } catch { revoke(); }
      } else revoke();
    }
  }
}
