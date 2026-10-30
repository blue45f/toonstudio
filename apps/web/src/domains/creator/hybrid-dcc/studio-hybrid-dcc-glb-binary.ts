/** 검증된 GLB 정점 스트림의 정렬·Float32 변환과 바이트 작성을 한 곳에서 처리한다. */
export interface StudioHybridDccGlbVertexStreams {
  readonly positions: readonly number[];
  readonly normals: readonly number[];
  readonly indices: readonly number[];
  /** 출력 정점별 두 좌표. 없으면 기존 POSITION/NORMAL/indices 바이트를 그대로 유지한다. */
  readonly texcoords?: readonly number[];
}

export interface StudioHybridDccGlbBinaryGeometry {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly positions: readonly number[];
  readonly normals: readonly number[];
  readonly boundsMin: readonly [number, number, number];
  readonly boundsMax: readonly [number, number, number];
  readonly positionOffset: number;
  readonly positionByteLength: number;
  readonly normalOffset: number;
  readonly normalByteLength: number;
  readonly indexOffset: number;
  readonly indexByteLength: number;
  readonly texcoordOffset?: number;
  readonly texcoordByteLength?: number;
}

export type StudioHybridDccGlbBinaryResult =
  | { readonly ok: true; readonly value: StudioHybridDccGlbBinaryGeometry }
  | { readonly ok: false; readonly code: "invalid-input" | "position-float32-overflow" | "normal-unresolved" | "uv-coordinate-invalid"; readonly detail: string };

function alignFour(value: number): number { return (value + 3) & ~3; }
function float32(value: number): number | null {
  const rounded = Math.fround(value);
  return Number.isFinite(rounded) ? Object.is(rounded, -0) ? 0 : rounded : null;
}

export function encodeStudioHybridDccGlbBinary(geometry: StudioHybridDccGlbVertexStreams): StudioHybridDccGlbBinaryResult {
  if (geometry.positions.length === 0 || geometry.positions.length % 3 !== 0
    || geometry.normals.length !== geometry.positions.length || geometry.indices.length % 3 !== 0) {
    return { ok: false, code: "invalid-input", detail: "GLB 정점·법선·삼각형 스트림의 길이가 맞지 않습니다." };
  }
  const positions: number[] = [];
  const normals: number[] = [];
  const minimum: [number, number, number] = [Infinity, Infinity, Infinity];
  const maximum: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < geometry.positions.length; index += 1) {
    const value = float32(geometry.positions[index] ?? NaN);
    if (value === null) return { ok: false, code: "position-float32-overflow", detail: "A source position cannot be represented as float32" };
    positions.push(value);
    const axis = index % 3;
    minimum[axis] = Math.min(minimum[axis] ?? Infinity, value);
    maximum[axis] = Math.max(maximum[axis] ?? -Infinity, value);
  }
  for (const source of geometry.normals) {
    const value = float32(source);
    if (value === null) return { ok: false, code: "normal-unresolved", detail: "A generated normal cannot be represented as float32" };
    normals.push(value);
  }
  const vertexCount = positions.length / 3;
  if (geometry.indices.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= vertexCount)) {
    return { ok: false, code: "invalid-input", detail: "GLB 삼각형 인덱스가 출력 정점 범위를 벗어났습니다." };
  }
  let texcoords: number[] | undefined;
  if (geometry.texcoords !== undefined) {
    if (geometry.texcoords.length !== vertexCount * 2) {
      return { ok: false, code: "uv-coordinate-invalid", detail: "GLB UV 좌표와 출력 정점 수가 맞지 않습니다." };
    }
    texcoords = [];
    for (const source of geometry.texcoords) {
      const value = float32(source);
      if (value === null) return { ok: false, code: "uv-coordinate-invalid", detail: "GLB UV 좌표를 유한한 Float32로 표현할 수 없습니다." };
      texcoords.push(value);
    }
  }
  const positionByteLength = positions.length * 4;
  const normalOffset = alignFour(positionByteLength);
  const normalByteLength = normals.length * 4;
  const indexOffset = alignFour(normalOffset + normalByteLength);
  const indexByteLength = geometry.indices.length * 4;
  const texcoordOffset = alignFour(indexOffset + indexByteLength);
  const texcoordByteLength = (texcoords?.length ?? 0) * 4;
  const bytes = new Uint8Array(alignFour(texcoordOffset + texcoordByteLength));
  const view = new DataView(bytes.buffer);
  positions.forEach((value, index) => view.setFloat32(index * 4, value, true));
  normals.forEach((value, index) => view.setFloat32(normalOffset + index * 4, value, true));
  geometry.indices.forEach((value, index) => view.setUint32(indexOffset + index * 4, value, true));
  texcoords?.forEach((value, index) => view.setFloat32(texcoordOffset + index * 4, value, true));
  return { ok: true, value: {
    bytes, positions, normals, boundsMin: minimum, boundsMax: maximum,
    positionOffset: 0, positionByteLength, normalOffset, normalByteLength, indexOffset, indexByteLength,
    ...(texcoords ? { texcoordOffset, texcoordByteLength } : {}),
  } };
}
