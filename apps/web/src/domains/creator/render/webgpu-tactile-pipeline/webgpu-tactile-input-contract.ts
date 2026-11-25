import type { CanvasDirtyRect, CpuReferenceTilePassInput, CpuReferenceTilePassResult } from "./webgpu-tactile-compositor-bridge";

export const MAX_TACTILE_TILE_DIMENSION = 4096;
export const MAX_TACTILE_TILE_PIXELS = 1048576;
export const MAX_TACTILE_DISPATCH_COMMANDS = 4096;
export const MAX_TACTILE_CANVAS_DIMENSION = 65536;
export const MAX_TACTILE_UNIFORM_ARENA_BYTES = 16777216;

export function boundedTactileInteger(value: number, min: number, max: number, label: string): number {
  const integer = Math.floor(value);
  if (!Number.isFinite(value) || integer < min || integer > max) throw new RangeError(`${label}: ${min}..${max} 범위의 유한 수치가 필요합니다.`);
  return integer;
}

export function tactileTileDimensions(width: number, height: number): readonly [number, number] {
  const w = boundedTactileInteger(width, 1, MAX_TACTILE_TILE_DIMENSION, "tile width");
  const h = boundedTactileInteger(height, 1, MAX_TACTILE_TILE_DIMENSION, "tile height");
  if (w * h > MAX_TACTILE_TILE_PIXELS) throw new RangeError("타일 픽셀 상한을 초과했습니다.");
  return [w, h];
}

export function clippedTactileRect(rect: CanvasDirtyRect, width: number, height: number): CanvasDirtyRect {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) throw new RangeError("Dirty-Rect는 유한 수치여야 합니다.");
  const x = Math.max(0, Math.min(width, Math.floor(rect.x)));
  const y = Math.max(0, Math.min(height, Math.floor(rect.y)));
  const x1 = Math.max(x, Math.min(width, Math.ceil(rect.x + Math.max(0, rect.width))));
  const y1 = Math.max(y, Math.min(height, Math.ceil(rect.y + Math.max(0, rect.height))));
  return { x, y, width: x1 - x, height: y1 - y };
}

export function tactileUniformView(byteLength: number, target?: ArrayBuffer, offset = 0) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset % 16 !== 0 || offset + byteLength > MAX_TACTILE_UNIFORM_ARENA_BYTES) {
    throw new RangeError("uniform 오프셋은 16바이트 정렬과 arena 상한을 지켜야 합니다.");
  }
  if (target && target.byteLength < offset + byteLength) throw new RangeError("uniform 대상 버퍼가 너무 작습니다.");
  const buffer = target ?? new ArrayBuffer(offset + byteLength);
  return { buffer, view: new DataView(buffer, offset, byteLength) };
}

function requireArray(values: Float32Array | Uint32Array, length: number, kind: "Float32Array" | "Uint32Array", label: string): void {
  if (!ArrayBuffer.isView(values) || Object.prototype.toString.call(values) !== `[object ${kind}]` || values.length < length) {
    throw new RangeError(`${label}: ${kind} 길이가 ${length} 이상이어야 합니다.`);
  }
}
function requireFinite(values: Float32Array, length: number, label: string): void {
  requireArray(values, length, "Float32Array", label);
  for (let i = 0; i < length; i += 1) if (!Number.isFinite(values[i])) throw new RangeError(`${label}: 비유한 픽셀 수치가 있습니다.`);
}
function forbidOverlap(a: Float32Array | Uint32Array, aCount: number, b: Float32Array | Uint32Array, bCount: number, allowSame = false): void {
  if (a.buffer !== b.buffer || (allowSame && a.byteOffset === b.byteOffset)) return;
  if (a.byteOffset < b.byteOffset + bCount * 4 && b.byteOffset < a.byteOffset + aCount * 4) throw new RangeError("서로 다른 입력·출력 버퍼 영역이 겹칩니다.");
}

/** 검증과 임시 출력 계산이 모두 끝난 뒤에만 호출자의 픽셀 버퍼를 갱신한다. */
export function executeAtomicTactileCpuPass(input: CpuReferenceTilePassInput, run: (pass: CpuReferenceTilePassInput) => CpuReferenceTilePassResult): CpuReferenceTilePassResult {
  const [width, height] = tactileTileDimensions(input.params.width, input.params.height);
  if (Object.values(input.params).some((value) => typeof value === "number" && !Number.isFinite(value))) throw new RangeError("실행 파라미터에 비유한 수치가 있습니다.");
  const pixels = width * height;
  const params = { ...input.params, width, height };
  const outputs: { target: Float32Array | Uint32Array; candidate: Float32Array | Uint32Array }[] = [];
  const outputF32 = (target: Float32Array, length: number): Float32Array => {
    requireArray(target, length, "Float32Array", "output");
    const candidate = target.slice(0, length); outputs.push({ target, candidate }); return candidate;
  };
  const outputU32 = (target: Uint32Array, length: number): Uint32Array => {
    requireArray(target, length, "Uint32Array", "packed output");
    const candidate = target.slice(0, length); outputs.push({ target, candidate }); return candidate;
  };
  let staged: CpuReferenceTilePassInput;
  if (input.stage === "tactile-bristle") {
    if (input.paperHeightmap.length !== 4096) throw new RangeError("종이 하이트맵은 64×64여야 합니다.");
    requireFinite(input.paperHeightmap, 4096, "paper"); requireFinite(input.strokeMaskIn, pixels, "mask");
    requireFinite(input.canvasRgbaF32, pixels * 4, "canvas"); requireFinite(input.paintHeightOut, pixels, "paint height");
    if (input.canvasRgba8Out) requireArray(input.canvasRgba8Out, pixels, "Uint32Array", "packed output");
    const writable = [{ value: input.canvasRgbaF32, count: pixels * 4 }, { value: input.paintHeightOut, count: pixels }, ...(input.canvasRgba8Out ? [{ value: input.canvasRgba8Out, count: pixels }] : [])];
    for (let i = 0; i < writable.length; i += 1) {
      const current = writable[i]; if (!current) continue;
      forbidOverlap(current.value, current.count, input.paperHeightmap, 4096);
      forbidOverlap(current.value, current.count, input.strokeMaskIn, pixels);
      for (const other of writable.slice(i + 1)) forbidOverlap(current.value, current.count, other.value, other.count);
    }
    staged = { ...input, params, canvasRgbaF32: outputF32(input.canvasRgbaF32, pixels * 4), paintHeightOut: outputF32(input.paintHeightOut, pixels),
      ...(input.canvasRgba8Out ? { canvasRgba8Out: outputU32(input.canvasRgba8Out, pixels) } : {}) };
  } else if (input.stage === "impasto-relief") {
    requireFinite(input.heightIn, pixels, "height"); requireFinite(input.colorIn, pixels * 4, "color");
    requireArray(input.colorOut, pixels * 4, "Float32Array", "color output");
    forbidOverlap(input.heightIn, pixels, input.colorOut, pixels * 4);
    forbidOverlap(input.colorIn, pixels * 4, input.colorOut, pixels * 4, true);
    staged = { ...input, params, colorOut: outputF32(input.colorOut, pixels * 4) };
  } else {
    requireFinite(input.srcTile, pixels * 4, "source"); requireFinite(input.dstTile, pixels * 4, "destination");
    forbidOverlap(input.srcTile, pixels * 4, input.dstTile, pixels * 4, true);
    staged = { ...input, params, dstTile: outputF32(input.dstTile, pixels * 4) };
  }
  const result = run(staged);
  if (!Number.isFinite(result.checksum)) throw new RangeError("CPU 참조 계산 결과가 유한 범위를 벗어났습니다.");
  for (const { candidate } of outputs) {
    for (let i = 0; i < candidate.length; i += 1) if (!Number.isFinite(candidate[i])) throw new RangeError("Float32 출력이 유한 범위를 벗어났습니다.");
  }
  for (const { target, candidate } of outputs) target.set(candidate);
  return result;
}
