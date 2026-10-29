/** 단일 자산 HE 상한과 OBJ 파일 전체의 보수적 작업 메모리 추정을 분리한다. */
import { STUDIO_EDITABLE_MESH_LIMITS } from "../../studio-editable-half-edge-mesh";

import { estimateStudioNativeImportAssetBytes } from "./studio-hybrid-dcc-native-import-contracts";

export interface StudioNativeObjWorkingUsage {
  readonly textCharacters: number;
  readonly sourceVertices: number;
  readonly sourceUvs: number;
  readonly sourceCorners: number;
  readonly outputCorners: number;
  readonly outputFaces: number;
  readonly assetBytes: number;
}

export function estimateStudioNativeObjPartBytes(vertices: number, corners: number, faces: number, hasUv: boolean): number {
  if (vertices > STUDIO_EDITABLE_MESH_LIMITS.maxVertices || corners > STUDIO_EDITABLE_MESH_LIMITS.maxEdges
    || faces > STUDIO_EDITABLE_MESH_LIMITS.maxFaces) return Infinity;
  return estimateStudioNativeImportAssetBytes(vertices, corners, faces, hasUv);
}

/** 실측 heap 상한은 아니다. 원본 문자열·파싱 객체·결과 자산이 동시에 살아 있는 peak를 admission에 포함한다. */
export function estimateStudioNativeObjWorkingBytes(usage: StudioNativeObjWorkingUsage): number {
  if (Object.values(usage).some((count) => !Number.isSafeInteger(count) || count < 0)) return Infinity;
  // 64 KiB 줄의 토큰·복사본, 4096-corner polygon 임시 배열, 이름·재질 맵 등의 bounded 여유다.
  const scratch = 8 * 1024 * 1024;
  const bytes = usage.textCharacters * 2 + usage.sourceVertices * 96 + usage.sourceUvs * 96
    + usage.sourceCorners * 64 + usage.outputCorners * 16 + usage.outputFaces * 96 + usage.assetBytes + scratch;
  return Number.isSafeInteger(bytes) ? bytes : Infinity;
}
