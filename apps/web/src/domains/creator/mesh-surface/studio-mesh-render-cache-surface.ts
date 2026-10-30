/** 평가 메시의 표시 속성은 정본과 분리하고, 정확한 기하·메시 해시에 결합한다. */
import { sha256HexPortable } from "../studio-sha256";

export interface StudioRenderMeshCacheSurface {
  readonly revision: 1;
  readonly derivedMeshHash: string;
  readonly geometryContentHash: `sha256:${string}`;
  readonly cornerNormals: Float32Array;
  /** glTF의 V-flip을 적용하기 전 원본 V-up UV다. */
  readonly cornerUvs?: Float32Array;
  readonly triangleMaterialSlots: Float64Array;
  readonly contentHash: `sha256:${string}`;
}

export interface StudioRenderMeshCacheSurfaceBinding {
  readonly derivedMeshHash: string;
  readonly geometryContentHash: `sha256:${string}`;
  readonly indexCount: number;
}

type SurfaceAttributes = Pick<StudioRenderMeshCacheSurface, "cornerNormals" | "cornerUvs" | "triangleMaterialSlots">;
type SurfaceContent = Omit<StudioRenderMeshCacheSurface, "contentHash">;
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/u;
const MESH_HASH = /^(?:mesh:[0-9a-f]{8}|mesh:sha256:[0-9a-f]{64})$/u;
const NORMAL_UNIT_TOLERANCE = 1e-4;
const ENCODER = new TextEncoder();

function validBinding(binding: StudioRenderMeshCacheSurfaceBinding): boolean {
  return MESH_HASH.test(binding.derivedMeshHash) && CONTENT_HASH.test(binding.geometryContentHash)
    && Number.isSafeInteger(binding.indexCount) && binding.indexCount > 0 && binding.indexCount % 3 === 0;
}

function validAttributes(value: SurfaceAttributes, indexCount: number): boolean {
  if (!(value.cornerNormals instanceof Float32Array) || value.cornerNormals.length !== indexCount * 3
    || !(value.triangleMaterialSlots instanceof Float64Array) || value.triangleMaterialSlots.length !== indexCount / 3) return false;
  for (let index = 0; index < value.cornerNormals.length; index += 3) {
    const length = Math.hypot(value.cornerNormals[index] ?? NaN, value.cornerNormals[index + 1] ?? NaN, value.cornerNormals[index + 2] ?? NaN);
    if (!Number.isFinite(length) || Math.abs(length - 1) > NORMAL_UNIT_TOLERANCE) return false;
  }
  if (value.cornerUvs !== undefined && (!(value.cornerUvs instanceof Float32Array)
    || value.cornerUvs.length !== indexCount * 2 || value.cornerUvs.some((coordinate) => !Number.isFinite(coordinate)))) return false;
  for (const slot of value.triangleMaterialSlots) if (!Number.isSafeInteger(slot) || slot < 0) return false;
  return true;
}

/** 배열의 실제 byteOffset 범위와 UV 부재 여부까지 해시에 포함한다. */
export function contentAddressStudioMeshRenderCacheSurface(surface: SurfaceContent): `sha256:${string}` {
  const header = ENCODER.encode(JSON.stringify([
    "studio-render-mesh-cache-surface", surface.revision, surface.derivedMeshHash, surface.geometryContentHash,
    surface.cornerNormals.length, surface.cornerUvs?.length ?? null, surface.triangleMaterialSlots.length,
  ]));
  const arrays = [surface.cornerNormals, ...(surface.cornerUvs ? [surface.cornerUvs] : []), surface.triangleMaterialSlots];
  const bytes = new Uint8Array(4 + header.length + arrays.reduce((sum, array) => sum + array.byteLength, 0));
  new DataView(bytes.buffer).setUint32(0, header.length, true); bytes.set(header, 4);
  let offset = 4 + header.length;
  for (const array of arrays) {
    bytes.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), offset); offset += array.byteLength;
  }
  return `sha256:${sha256HexPortable(bytes)}`;
}

export function createStudioMeshRenderCacheSurface(
  binding: StudioRenderMeshCacheSurfaceBinding,
  attributes: SurfaceAttributes,
): StudioRenderMeshCacheSurface {
  if (!validBinding(binding) || !validAttributes(attributes, binding.indexCount)) {
    throw new Error("평가 메시의 표시 속성 또는 기하 연결이 올바르지 않습니다.");
  }
  const content: SurfaceContent = {
    revision: 1, derivedMeshHash: binding.derivedMeshHash, geometryContentHash: binding.geometryContentHash,
    cornerNormals: new Float32Array(attributes.cornerNormals),
    ...(attributes.cornerUvs === undefined ? {} : { cornerUvs: new Float32Array(attributes.cornerUvs) }),
    triangleMaterialSlots: new Float64Array(attributes.triangleMaterialSlots),
  };
  return Object.freeze({ ...content, contentHash: contentAddressStudioMeshRenderCacheSurface(content) });
}

/** 형식이 있는 메타데이터는 손상 시 legacy 경로로 낮추지 않고 거부한다. */
export function validateStudioMeshRenderCacheSurface(
  value: unknown,
  binding: StudioRenderMeshCacheSurfaceBinding,
): value is StudioRenderMeshCacheSurface {
  if (!validBinding(binding) || !value || typeof value !== "object") return false;
  if (!("revision" in value) || value.revision !== 1
    || !("derivedMeshHash" in value) || value.derivedMeshHash !== binding.derivedMeshHash
    || !("geometryContentHash" in value) || value.geometryContentHash !== binding.geometryContentHash
    || !("contentHash" in value) || typeof value.contentHash !== "string" || !CONTENT_HASH.test(value.contentHash)
    || !("cornerNormals" in value) || !(value.cornerNormals instanceof Float32Array)
    || !("triangleMaterialSlots" in value) || !(value.triangleMaterialSlots instanceof Float64Array)) return false;
  const cornerUvs = "cornerUvs" in value ? value.cornerUvs : undefined;
  if (cornerUvs !== undefined && !(cornerUvs instanceof Float32Array)) return false;
  const content: SurfaceContent = {
    revision: 1, derivedMeshHash: binding.derivedMeshHash, geometryContentHash: binding.geometryContentHash,
    cornerNormals: value.cornerNormals, triangleMaterialSlots: value.triangleMaterialSlots,
    ...(cornerUvs === undefined ? {} : { cornerUvs }),
  };
  return validAttributes(content, binding.indexCount) && value.contentHash === contentAddressStudioMeshRenderCacheSurface(content);
}
