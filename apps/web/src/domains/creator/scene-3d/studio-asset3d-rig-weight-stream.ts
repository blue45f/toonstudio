import type { StudioRigFile } from "./studio-asset3d-rig-file";

type Json = Record<string, unknown>;
export function rigRecord(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("메시의 스킨 정보가 올바르지 않아요.");
  return value as Json;
}
export function rigRecords(value: unknown): Json[] {
  if (!Array.isArray(value)) throw new Error("메시의 스킨 목록이 올바르지 않아요.");
  return value.map(rigRecord);
}
function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("메시 버퍼의 범위를 확인해 주세요.");
  return value;
}
export interface RigStream {
  readonly index: number;
  readonly viewId: number;
  readonly count: number;
  readonly bytes: number;
  readonly scale: number;
  readonly start: number;
  readonly stride: number;
  readonly accessor: Json;
  readonly semantic: string;
  readonly get: (vertex: number, lane: number) => number;
}
export function readRigStream(model: StudioRigFile, attributes: Json, semantic: string): RigStream {
  const index = integer(attributes[semantic]),
    accessor = rigRecord(rigRecords(model.json.accessors)[index]);
  const viewId = integer(accessor.bufferView),
    view = rigRecord(rigRecords(model.json.bufferViews)[viewId]);
  if (accessor.sparse !== undefined || view.extensions !== undefined || view.buffer !== 0)
    throw new Error("압축·희소 웨이트는 원본 제작 도구에서 편집해 주세요.");
  const weights = semantic.startsWith("WEIGHTS_"),
    type = accessor.componentType;
  if (
    accessor.type !== "VEC4" ||
    (type !== 5121 && type !== 5123 && !(weights && type === 5126)) ||
    (accessor.normalized === true) !== (weights && type !== 5126)
  )
    throw new Error("지원하지 않는 조인트 또는 웨이트 형식이에요.");
  const bytes = type === 5121 ? 1 : type === 5123 ? 2 : 4;
  const offset = integer(view.byteOffset ?? 0),
    length = integer(view.byteLength),
    local = integer(accessor.byteOffset ?? 0);
  const count = integer(accessor.count),
    stride = integer(view.byteStride ?? 4 * bytes);
  const end = local + (count - 1) * stride + 4 * bytes;
  if (
    !count ||
    stride < bytes * 4 ||
    stride % bytes ||
    (offset + local) % bytes ||
    end > length ||
    offset + length > model.binary.byteLength
  )
    throw new Error("스킨 데이터가 GLB 버퍼의 범위를 벗어났어요.");
  const data = new DataView(model.binary.buffer, model.binary.byteOffset, model.binary.byteLength),
    start = offset + local;
  const scale = weights && bytes < 4 ? 2 ** (bytes * 8) - 1 : 1;
  return {
    index,
    viewId,
    accessor,
    semantic,
    bytes,
    count,
    start,
    stride,
    scale,
    get(vertex, lane) {
      const addr = start + vertex * stride + lane * bytes;
      return bytes === 1
        ? data.getUint8(addr)
        : bytes === 2
          ? data.getUint16(addr, true)
          : data.getFloat32(addr, true);
    },
  };
}

export type RigWeightWriter = (stream: RigStream, vertex: number, lane: number, value: number) => void;
function write(data: DataView, offset: number, bytes: number, value: number) {
  if (bytes === 1) data.setUint8(offset, value);
  else if (bytes === 2) data.setUint16(offset, value, true);
  else data.setFloat32(offset, value, true);
}

/** 전용 버퍼만 제자리에서 수정한다. 공유된 원장은 새 접근자에 복사해 다른 메시와 확장이 읽는 데이터를 보존한다. */
export function applyRigWeightChanges(
  model: StudioRigFile,
  meshId: number,
  primitiveId: number,
  streams: ReadonlySet<RigStream>,
  targetSlot: number,
  writeChanges: (writer: RigWeightWriter) => void,
): StudioRigFile {
  const views = rigRecords(model.json.bufferViews),
    accessors = rigRecords(model.json.accessors),
    meshes = rigRecords(model.json.meshes);
  const mesh = rigRecord(meshes[meshId]),
    primitives = rigRecords(mesh.primitives),
    primitive = rigRecord(primitives[primitiveId]);
  const attributes = { ...rigRecord(primitive.attributes) },
    buffers = rigRecords(model.json.buffers);
  const refs = new Map<number, number>();
  const count = (value: unknown) => {
    if (typeof value === "number") refs.set(value, (refs.get(value) ?? 0) + 1);
  };
  for (const entry of meshes)
    for (const p of rigRecords(entry.primitives)) {
      Object.values(rigRecord(p.attributes)).forEach(count);
      count(p.indices);
      for (const target of rigRecords(p.targets ?? [])) Object.values(target).forEach(count);
    }
  for (const skin of rigRecords(model.json.skins)) count(skin.inverseBindMatrices);
  for (const a of rigRecords(model.json.animations ?? []))
    for (const sampler of rigRecords(a.samplers)) {
      count(sampler.input);
      count(sampler.output);
    }
  const opaque =
    Array.isArray(model.json.extensionsUsed) &&
    model.json.extensionsUsed.some((x) => typeof x !== "string" || !x.startsWith("KHR_materials_"));
  const destinations = new Map<
    RigStream,
    { bytes: number; start: number; stride: number; duplicate: boolean; streamIndex: number }
  >();
  let end = model.binary.byteLength;
  for (const s of streams) {
    const v = rigRecord(views[s.viewId]),
      vStart = integer(v.byteOffset ?? 0),
      vEnd = vStart + integer(v.byteLength);
    const bytes = s.semantic.startsWith("JOINTS_") && s.bytes === 1 && targetSlot > 255 ? 2 : s.bytes;
    const duplicate =
      bytes !== s.bytes ||
      opaque ||
      refs.get(s.index) !== 1 ||
      accessors.some((a, i) => {
        if (i !== s.index && a.bufferView === s.viewId) return true;
        if (a.sparse === undefined) return false;
        const sparse = rigRecord(a.sparse);
        return rigRecord(sparse.indices).bufferView === s.viewId || rigRecord(sparse.values).bufferView === s.viewId;
      }) ||
      views.some(
        (other, id) =>
          id !== s.viewId &&
          integer(other.byteOffset ?? 0) < vEnd &&
          integer(other.byteOffset ?? 0) + integer(other.byteLength) > vStart,
      ) ||
      rigRecords(model.json.images ?? []).some((image) => image.bufferView === s.viewId);
    if (!duplicate) {
      destinations.set(s, { bytes, start: s.start, stride: s.stride, duplicate: false, streamIndex: s.index });
      continue;
    }
    const start = Math.ceil(end / 4) * 4,
      stride = bytes * 4,
      length = stride * s.count;
    end = start + length;
    if (end > 100 * 1024 * 1024) throw new Error("공유 웨이트를 분리하면 GLB의 100 MiB 한도를 넘어요.");
    const streamIndex = accessors.length;
    attributes[s.semantic] = streamIndex;
    accessors.push({
      ...s.accessor,
      ...(bytes !== s.bytes ? { componentType: 5123 } : {}),
      byteOffset: 0,
      bufferView: views.length,
    });
    views.push({ buffer: 0, byteOffset: start, byteLength: length, target: 34962 });
    destinations.set(s, { bytes, start, stride, duplicate: true, streamIndex });
  }
  const binary = new Uint8Array(end);
  binary.set(model.binary);
  const data = new DataView(binary.buffer);
  for (const [s, dest] of destinations)
    if (dest.duplicate) {
      for (let vertex = 0; vertex < s.count; vertex++) {
        const from = s.start + vertex * s.stride;
        if (dest.bytes === s.bytes)
          binary.set(model.binary.subarray(from, from + s.bytes * 4), dest.start + vertex * dest.stride);
        else
          for (let lane = 0; lane < 4; lane++)
            write(data, dest.start + vertex * dest.stride + lane * dest.bytes, dest.bytes, s.get(vertex, lane));
      }
    }
  writeChanges((stream, vertex, lane, value) => {
    const dest = destinations.get(stream);
    if (!dest) throw new Error("수정할 웨이트 버퍼를 찾지 못했어요.");
    write(data, dest.start + vertex * dest.stride + lane * dest.bytes, dest.bytes, value);
  });
  // glTF의 min/max는 이 선택 속성들에서는 선택 사항이다. 이전 범위를 기록한 파일은 실제 값으로 다시 계산한다.
  for (const [s, dest] of destinations)
    if (s.accessor.min !== undefined || s.accessor.max !== undefined) {
      const min = [Infinity, Infinity, Infinity, Infinity],
        max = [-Infinity, -Infinity, -Infinity, -Infinity];
      for (let vertex = 0; vertex < s.count; vertex++)
        for (let lane = 0; lane < 4; lane++) {
          const address = dest.start + vertex * dest.stride + lane * dest.bytes;
          const value =
            dest.bytes === 1
              ? data.getUint8(address)
              : dest.bytes === 2
                ? data.getUint16(address, true)
                : data.getFloat32(address, true);
          min[lane] = Math.min(min[lane] ?? Infinity, value);
          max[lane] = Math.max(max[lane] ?? -Infinity, value);
        }
      accessors[dest.streamIndex] = {
        ...accessors[dest.streamIndex],
        ...(s.accessor.min !== undefined ? { min } : {}),
        ...(s.accessor.max !== undefined ? { max } : {}),
      };
    }
  primitives[primitiveId] = { ...primitive, attributes };
  meshes[meshId] = { ...mesh, primitives };
  buffers[0] = { ...buffers[0], byteLength: end };
  return { json: { ...model.json, meshes, accessors, bufferViews: views, buffers }, binary };
}
