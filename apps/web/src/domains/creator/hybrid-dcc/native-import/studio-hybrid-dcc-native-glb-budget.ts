/** 단일 메시 HE 예산과 장면 전체의 예상 작업 메모리 예산을 구분한다. */
import { STUDIO_EDITABLE_MESH_LIMITS } from "../../studio-editable-half-edge-mesh";

import { reject } from "./studio-hybrid-dcc-native-glb-data";
import { estimateStudioNativeImportAssetBytes, STUDIO_NATIVE_IMPORT_MAX_WORKING_BYTES } from "./studio-hybrid-dcc-native-import-contracts";

const MAX_PRIMITIVE_SCAN_WORK = 16_000_000;

/** 퇴화 면도 비용을 차감한다. index 검증과 후보별 index 3회·위치 구성 요소 9회의 최대 순회량이다. */
export function admitNativeGlbPrimitiveScanWork(previousWork: number, indices: number, mode: number, maximum = MAX_PRIMITIVE_SCAN_WORK): number {
  const triangles = mode === 4 ? indices / 3 : indices - 2;
  const total = previousWork + indices + triangles * 12;
  if (!Number.isSafeInteger(previousWork) || previousWork < 0 || !Number.isSafeInteger(indices) || indices < 3
    || ![4, 5, 6].includes(mode) || !Number.isSafeInteger(triangles) || !Number.isSafeInteger(maximum) || maximum < 0 || maximum > MAX_PRIMITIVE_SCAN_WORK
    || !Number.isSafeInteger(total) || total > maximum) {
    reject("PRIMITIVE_SCAN_BUDGET", "장면의 반복 primitive 검증 작업이 편집 예산을 넘었습니다.");
  }
  return total;
}

/** 객체·배열·twin wiring·UV 검증 복사본을 포함한 보수적 admission 추정이며 실측 heap 보장은 아니다. */
export function admitNativeGlbOutputWork(previousBytes: number, vertices: number, corners: number, hasUv: boolean): number {
  if (!Number.isSafeInteger(vertices) || !Number.isSafeInteger(corners) || vertices < 0 || corners < 0 || corners % 3 !== 0
    || vertices > STUDIO_EDITABLE_MESH_LIMITS.maxVertices || corners > STUDIO_EDITABLE_MESH_LIMITS.maxEdges) {
    reject("GEOMETRY_BUDGET", "개별 primitive의 참조 정점·생성 코너 수가 편집 메시 예산을 넘었습니다.");
  }
  const bytes = estimateStudioNativeImportAssetBytes(vertices, corners, corners / 3, hasUv);
  const total = previousBytes + bytes;
  if (!Number.isSafeInteger(previousBytes) || previousBytes < 0 || !Number.isSafeInteger(total) || total > STUDIO_NATIVE_IMPORT_MAX_WORKING_BYTES) {
    reject("OUTPUT_WORK_BUDGET", "장면의 예상 메시 생성 작업이 256 MiB 예산을 넘었습니다.");
  }
  return total;
}
