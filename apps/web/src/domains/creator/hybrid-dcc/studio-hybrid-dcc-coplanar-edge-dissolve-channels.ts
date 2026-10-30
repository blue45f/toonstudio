/** 복사·전송 전에 확인하는 치유의 기존 단일 UV 채널 범위다. 추가 채널을 조용히 버리지 않는다. */
import type { StudioEditableMesh } from "../studio-editable-half-edge-mesh";

const SUPPORTED_KEYS = new Set(["revision", "vertices", "halfEdges", "faces",
  "nextVertexId", "nextHalfEdgeId", "nextFaceId", "uvLayer"]);

export function hasSupportedStudioCoplanarEdgeDissolveChannels(mesh: StudioEditableMesh): boolean {
  return Reflect.ownKeys(mesh).every((key) => typeof key === "string" && SUPPORTED_KEYS.has(key));
}
