/**
 * OpenSKP 프리미티브를 재질별로 합친다.
 *
 * 근거(openskp 1.3.0 README·소스): buildScene() 은 배치된 인스턴스마다 월드 좌표로 구운 프리미티브를
 * 따로 만든다("definition geometry x number of placed instances"). 컴포넌트를 수백 번 배치한 모델은
 * 프리미티브(= 드로 콜)가 수천 개가 되어 가져오기 예산(모바일 256·데스크톱 1,024 드로 콜,
 * 메시/프리미티브 안전 기준)에서 거부된다. 굽는 시점에 이미 월드 좌표이므로 같은 재질끼리 이어 붙여도
 * 모양·색·UV 는 달라지지 않고 드로 콜만 재질 수까지 줄어든다.
 *
 * 입력은 openskp 의 GlbPrimitive 와 구조가 같은 최소 계약이다. 배열 길이가 서로 어긋나거나 인덱스가
 * 정점 수를 넘으면 손상된 변환 결과이므로 skp-parse-failed 로 실패한다.
 */

import { StudioBg3dSkpParseError } from "./studio-bg3d-skp-contract";

export interface StudioBg3dSkpPrimitive {
  /** [x, y, z, ...] 미터·Y-up */
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** [u, v, ...] */
  readonly uvs: Float32Array;
  /** 삼각형 정점 인덱스(3개씩) */
  readonly indices: Uint32Array;
  readonly materialIndex: number;
  readonly geomName: string;
}

const MAX_MERGED_VERTICES = 0xffff_ffff;

function invalidGeometry(message: string): StudioBg3dSkpParseError {
  return new StudioBg3dSkpParseError(message, { reason: "invalid-geometry" });
}

/** 프리미티브의 배열 길이와 인덱스 범위를 검증하고 정점 수를 돌려준다. */
export function validateStudioBg3dSkpPrimitive(primitive: StudioBg3dSkpPrimitive): number {
  const { positions, normals, uvs, indices, materialIndex } = primitive;
  if (!Number.isSafeInteger(materialIndex) || materialIndex < 0) {
    throw invalidGeometry("변환 결과의 재질 번호가 올바르지 않습니다.");
  }
  if (positions.length % 3 !== 0 || normals.length !== positions.length) {
    throw invalidGeometry("변환 결과의 정점·법선 배열 길이가 서로 맞지 않습니다.");
  }
  const vertexCount = positions.length / 3;
  if (uvs.length !== vertexCount * 2) {
    throw invalidGeometry("변환 결과의 UV 배열 길이가 정점 수와 맞지 않습니다.");
  }
  if (indices.length % 3 !== 0) {
    throw invalidGeometry("변환 결과의 인덱스 수가 3의 배수가 아닙니다.");
  }
  for (let index = 0; index < indices.length; index += 1) {
    if (indices[index] >= vertexCount) {
      throw invalidGeometry("변환 결과의 인덱스가 정점 범위를 벗어났습니다.");
    }
  }
  return vertexCount;
}

interface MaterialBucket {
  readonly materialIndex: number;
  readonly members: StudioBg3dSkpPrimitive[];
  vertexCount: number;
  indexCount: number;
}

function concatenateBucket(bucket: MaterialBucket): StudioBg3dSkpPrimitive {
  const positions = new Float32Array(bucket.vertexCount * 3);
  const normals = new Float32Array(bucket.vertexCount * 3);
  const uvs = new Float32Array(bucket.vertexCount * 2);
  const indices = new Uint32Array(bucket.indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const member of bucket.members) {
    positions.set(member.positions, vertexOffset * 3);
    normals.set(member.normals, vertexOffset * 3);
    uvs.set(member.uvs, vertexOffset * 2);
    for (let index = 0; index < member.indices.length; index += 1) {
      indices[indexOffset + index] = member.indices[index] + vertexOffset;
    }
    vertexOffset += member.positions.length / 3;
    indexOffset += member.indices.length;
  }
  return {
    positions,
    normals,
    uvs,
    indices,
    materialIndex: bucket.materialIndex,
    geomName: `merged_material_${bucket.materialIndex}`,
  };
}

/**
 * 같은 materialIndex 의 프리미티브를 하나로 합친다. 재질의 첫 등장 순서를 유지하고, 정점이 없거나
 * 삼각형이 없는 프리미티브는 버린다. 한 재질에 프리미티브가 하나뿐이면 같은 객체를 그대로 쓴다.
 */
export function mergeStudioBg3dSkpPrimitivesByMaterial(
  primitives: readonly StudioBg3dSkpPrimitive[],
): readonly StudioBg3dSkpPrimitive[] {
  const buckets = new Map<number, MaterialBucket>();
  for (const primitive of primitives) {
    const vertexCount = validateStudioBg3dSkpPrimitive(primitive);
    if (vertexCount === 0 || primitive.indices.length === 0) continue;
    let bucket = buckets.get(primitive.materialIndex);
    if (!bucket) {
      bucket = { materialIndex: primitive.materialIndex, members: [], vertexCount: 0, indexCount: 0 };
      buckets.set(primitive.materialIndex, bucket);
    }
    if (bucket.vertexCount + vertexCount > MAX_MERGED_VERTICES) {
      throw invalidGeometry("합친 정점 수가 32비트 인덱스 범위를 넘습니다.");
    }
    bucket.members.push(primitive);
    bucket.vertexCount += vertexCount;
    bucket.indexCount += primitive.indices.length;
  }
  return [...buckets.values()].map((bucket) =>
    bucket.members.length === 1 ? bucket.members[0] : concatenateBucket(bucket));
}
