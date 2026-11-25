import type { FlatBvh2d, FlatBvh2dBuildOptions, SceneObjectArenaSoA, SceneObjectInput } from "./instanced-bvh-spatial-engine";
import type { CullUniformsInput, PackedCullUniforms, RenderViewportUniformsInput } from "./instanced-bvh-wgsl-shaders";

/** 현재 CPU 예제의 할당 한도이며 실제 장치·WASM 메모리 한도 실측은 아니다. */
export const MAX_SCENE_OBJECTS = 1_000_000;
export const MAX_SCENE_ARENA_BYTES = 64 * 1024 * 1024;
const COLUMNS = ["minX", "minY", "maxX", "maxY", "rotationRad", "zOrder", "curveBias", "objectId", "kindCode", "colorPackedRgba8", "textureMaterialId", "flags"] as const;
export function checkedInteger(value: number, max: number, min = 0): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError("씬 정수 입력이 지원 범위를 벗어났습니다.");
  return value;
}
export function checkedFloat32(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > 3.4028234663852886e38 || !Number.isFinite(Math.fround(value))) throw new RangeError("씬 수치는 유한한 Float32 범위여야 합니다.");
  return value;
}
export function assertSceneArena(arena: SceneObjectArenaSoA): void {
  checkedInteger(arena.capacity, MAX_SCENE_OBJECTS); checkedInteger(arena.count, arena.capacity);
  for (const key of COLUMNS) if (arena[key].length !== arena.capacity || arena[key].buffer !== arena.buffer) throw new RangeError("씬 아레나 컬럼·버퍼 연결이 잘못되었습니다.");
}
function assertBounds(x0: number, y0: number, x1: number, y1: number, rotation = 0): void {
  for (const value of [x0, y0, x1, y1, rotation]) checkedFloat32(value);
  const hw = Math.abs(x1 - x0) * 0.5, hh = Math.abs(y1 - y0) * 0.5;
  const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
  const c = Math.abs(Math.cos(rotation)), s = Math.abs(Math.sin(rotation));
  for (const value of [cx - hw * c - hh * s, cx + hw * c + hh * s, cy - hw * s - hh * c, cy + hw * s + hh * c]) checkedFloat32(value);
}
export function assertSceneObject(input: SceneObjectInput): void {
  assertBounds(input.minX, input.minY, input.maxX, input.maxY, input.rotationRad ?? 0);
  checkedFloat32(input.zOrder ?? 0); checkedFloat32(input.curveBias ?? 0);
  checkedInteger(input.objectId, 0xffffffff); checkedInteger(input.kindCode, 5);
  for (const value of [input.flags, input.colorPackedRgba8, input.textureMaterialId]) if (value !== undefined) checkedInteger(value, 0xffffffff);
}
export function assertSceneBounds(x0: number, y0: number, x1: number, y1: number, rotation = 0): void { assertBounds(x0, y0, x1, y1, rotation); }

const roundingFloat = new Float32Array(1);
const roundingBits = new Uint32Array(roundingFloat.buffer);
/** 회전 보수 AABB를 Float32로 저장할 때 안쪽 반올림으로 가시 영역을 잃지 않게 한다. */
function outwardFloat(value: number, lower: boolean): number {
  roundingFloat[0] = value;
  const rounded = roundingFloat[0] ?? value;
  if ((lower && rounded > value) || (!lower && rounded < value)) roundingBits[0] = (roundingBits[0] ?? 0) + ((value >= 0) === lower ? -1 : 1);
  return roundingFloat[0] ?? value;
}
export function sceneWorldBounds(arena: SceneObjectArenaSoA) {
  let rotated = false;
  for (let index = 0; index < arena.count; index += 1) {
    assertBounds(arena.minX[index] ?? NaN, arena.minY[index] ?? NaN, arena.maxX[index] ?? NaN, arena.maxY[index] ?? NaN, arena.rotationRad[index] ?? NaN);
    if (arena.rotationRad[index] !== 0) rotated = true;
  }
  if (!rotated) return arena;
  const result = { minX: new Float32Array(arena.count), minY: new Float32Array(arena.count), maxX: new Float32Array(arena.count), maxY: new Float32Array(arena.count) };
  for (let index = 0; index < arena.count; index += 1) {
    const x0 = arena.minX[index] ?? 0, x1 = arena.maxX[index] ?? 0, y0 = arena.minY[index] ?? 0, y1 = arena.maxY[index] ?? 0;
    const hw = (x1 - x0) * 0.5, hh = (y1 - y0) * 0.5, cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
    const c = Math.abs(Math.cos(arena.rotationRad[index] ?? 0)), s = Math.abs(Math.sin(arena.rotationRad[index] ?? 0));
    result.minX[index] = outwardFloat(cx - hw * c - hh * s, true); result.maxX[index] = outwardFloat(cx + hw * c + hh * s, false);
    result.minY[index] = outwardFloat(cy - hw * s - hh * c, true); result.maxY[index] = outwardFloat(cy + hw * s + hh * c, false);
  }
  return result;
}
export function sceneIntersects(arena: SceneObjectArenaSoA, index: number, minX: number, minY: number, maxX: number, maxY: number): boolean {
  checkedInteger(index, arena.count - 1);
  const x0 = arena.minX[index] ?? NaN, x1 = arena.maxX[index] ?? NaN, y0 = arena.minY[index] ?? NaN, y1 = arena.maxY[index] ?? NaN;
  const rotation = arena.rotationRad[index] ?? NaN;
  assertBounds(x0, y0, x1, y1, rotation);
  const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5, hw = (x1 - x0) * 0.5, hh = (y1 - y0) * 0.5;
  const c = Math.abs(Math.cos(rotation)), s = Math.abs(Math.sin(rotation));
  return cx + hw * c + hh * s >= minX && cx - hw * c - hh * s <= maxX && cy + hw * s + hh * c >= minY && cy - hw * s - hh * c <= maxY;
}
export function assertBvhScene(bvh: FlatBvh2d, arena: SceneObjectArenaSoA): void {
  assertSceneArena(arena); checkedInteger(bvh.nodeCount, Math.max(0, 2 * arena.count - 1));
  if (bvh.objectCount !== arena.count || bvh.primIndices.length !== bvh.objectCount || bvh.nodeBounds.length < bvh.nodeCount * 4
    || bvh.nodeTopology.length < bvh.nodeCount * 4 || (arena.count > 0 && bvh.nodeCount === 0)) throw new RangeError("BVH와 씬 아레나의 범위가 다릅니다. 변경 후 다시 구축해 주세요.");
  checkedInteger(bvh.stats.maxDepth, bvh.nodeCount);
}
export function assertInstanceIndices(arena: SceneObjectArenaSoA, indices: Uint32Array): void {
  assertSceneArena(arena); checkedInteger(indices.length, MAX_SCENE_OBJECTS);
  for (const index of indices) {
    checkedInteger(index, arena.count - 1);
    assertBounds(arena.minX[index] ?? NaN, arena.minY[index] ?? NaN, arena.maxX[index] ?? NaN, arena.maxY[index] ?? NaN, arena.rotationRad[index] ?? NaN);
    checkedFloat32(arena.curveBias[index] ?? NaN);
  }
}
export function assertInstanceOutput(arena: SceneObjectArenaSoA, output: Float32Array | undefined, requiredFloats: number): void {
  if (!output || output.length < requiredFloats || output.buffer !== arena.buffer) return;
  const end = output.byteOffset + requiredFloats * 4;
  for (const key of COLUMNS) if (output.byteOffset < arena[key].byteOffset + arena[key].byteLength && end > arena[key].byteOffset) throw new RangeError("인스턴스 출력이 입력 아레나 컬럼과 겹칩니다.");
}
interface ByteSpan { readonly buffer: ArrayBufferLike; readonly byteOffset: number; readonly byteLength: number; }
function overlaps(left: ByteSpan, right: ByteSpan): boolean {
  return left.buffer === right.buffer && left.byteOffset < right.byteOffset + right.byteLength && right.byteOffset < left.byteOffset + left.byteLength;
}
export function assertTraversalBuffers(bvh: FlatBvh2d, arena: SceneObjectArenaSoA, output?: Uint32Array, stack?: Int32Array): void {
  const outSpan = output && output.length >= bvh.objectCount ? { buffer: output.buffer, byteOffset: output.byteOffset, byteLength: bvh.objectCount * 4 } : undefined;
  const stackSpan = stack && stack.length >= bvh.stats.maxDepth + 16 ? { buffer: stack.buffer, byteOffset: stack.byteOffset, byteLength: (bvh.stats.maxDepth + 16) * 4 } : undefined;
  for (const scratch of [outSpan, stackSpan]) {
    if (!scratch) continue;
    for (const key of COLUMNS) if (overlaps(scratch, arena[key])) throw new RangeError("BVH 작업 버퍼가 입력 아레나와 겹칩니다.");
    for (const input of [bvh.nodeBounds, bvh.nodeTopology, bvh.primIndices]) if (overlaps(scratch, input)) throw new RangeError("BVH 작업 버퍼가 입력 트리와 겹칩니다.");
  }
  if (outSpan && stackSpan && overlaps(outSpan, stackSpan)) throw new RangeError("BVH 출력·순회 작업 버퍼가 겹칩니다.");
}
export function assertBvhOptions(options: FlatBvh2dBuildOptions): void {
  for (const value of [options.maxLeafSize, options.sahBins, options.traversalCost, options.intersectionCost]) if (value !== undefined && !Number.isFinite(value)) throw new RangeError("BVH 옵션은 유한한 수치여야 합니다.");
}
export function assertCullUniformInput(input: CullUniformsInput): void {
  for (const value of [input.viewMinX, input.viewMinY, input.viewMaxX, input.viewMaxY, input.marginX ?? 0, input.marginY ?? 0]) checkedFloat32(value);
  checkedInteger(input.objectCount, MAX_SCENE_OBJECTS); checkedInteger(input.maxOutputInstances ?? input.objectCount, MAX_SCENE_OBJECTS);
  checkedInteger(input.kindMask ?? 63, 0xffffffff); checkedInteger(input.requiredFlags ?? 1, 15); checkedInteger(input.vertexCount ?? 6, 0xffffffff, 3);
}
export function assertRenderUniformInput(input: RenderViewportUniformsInput): void {
  for (const value of [input.viewMinX, input.viewMinY, input.viewMaxX, input.viewMaxY, input.pixelScale ?? 1, input.aaSharpness ?? 1, input.impastoLightX ?? 0.6, input.impastoLightY ?? -0.6]) checkedFloat32(value);
}
export function assertCpuCullInput(source: Float32Array, uniforms: PackedCullUniforms): void {
  if (source.length % 8 !== 0 || source.length / 8 > MAX_SCENE_OBJECTS || uniforms.floatView.length !== 12 || uniforms.uintView.length !== 12) throw new RangeError("CPU 컬링 참조 버퍼의 stride·범위가 잘못되었습니다.");
  const count = checkedInteger(uniforms.uintView[6] ?? NaN, source.length / 8);
  checkedInteger(uniforms.uintView[9] ?? NaN, MAX_SCENE_OBJECTS);
  for (let index = 0; index < 6; index += 1) checkedFloat32(uniforms.floatView[index] ?? NaN);
  for (let row = 0; row < count; row += 1) for (let column = 0; column < 6; column += 1) checkedFloat32(source[row * 8 + column] ?? NaN);
}
