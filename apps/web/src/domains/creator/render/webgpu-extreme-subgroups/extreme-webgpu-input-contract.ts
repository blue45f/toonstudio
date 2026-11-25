import type { SparseStripDescriptor } from "./extreme-webgpu-runtime-bridge";

export const MAX_EXTREME_PIXELS = 1_048_576;
const MAX_DIMENSION = 4096;
const MAX_GEOMETRY_ELEMENTS = 65_536;
const MAX_GEOMETRY_WORK = 16_777_216;

export function extremeInteger(value: number, min: number, max: number, label: string): number {
  if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(`${label}: ${min}..${max} 범위의 유한 수치가 필요합니다.`);
  return Math.floor(value);
}
export function extremeDimensions(width: number, height: number): readonly [number, number] {
  const w = extremeInteger(width, 1, MAX_DIMENSION, "width");
  const h = extremeInteger(height, 1, MAX_DIMENSION, "height");
  if (w * h > MAX_EXTREME_PIXELS) throw new RangeError("픽셀 상한을 초과했습니다.");
  return [w, h];
}
export function extremeFiniteArray(values: Float32Array, length: number): void {
  if (!ArrayBuffer.isView(values) || Object.prototype.toString.call(values) !== "[object Float32Array]" || values.length < length) throw new RangeError("Float32 입력 버퍼가 너무 작습니다.");
  for (let i = 0; i < length; i += 1) if (!Number.isFinite(values[i])) throw new RangeError("입력 버퍼에 비유한 수치가 있습니다.");
}
export function extremePrefixCounts(values: ArrayLike<number>): Uint32Array {
  const length = extremeInteger(values.length, 0, MAX_EXTREME_PIXELS, "tile count");
  if (length !== values.length) throw new RangeError("타일 배열 길이는 정수여야 합니다.");
  const result = new Uint32Array(length);
  let total = 0;
  for (let i = 0; i < length; i += 1) {
    const value = Number(values[i]);
    const count = Number.isNaN(value) ? 0 : Math.max(0, Math.floor(value));
    if (!Number.isFinite(count) || count > 4294967295 || total + count > 4294967295) throw new RangeError("Prefix-Sum u32 범위를 초과했습니다.");
    result[i] = count; total += count;
  }
  return result;
}
export function extremeUniformView(byteLength: number, target?: ArrayBuffer, offset = 0): { buffer: ArrayBuffer; view: DataView } {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset % 16 !== 0 || offset + byteLength > 16_777_216) throw new RangeError("Uniform 오프셋은 16바이트 정렬과 arena 상한을 지켜야 합니다.");
  if (target && target.byteLength < offset + byteLength) throw new RangeError("Uniform 대상 버퍼가 너무 작습니다.");
  const buffer = target ?? new ArrayBuffer(offset + byteLength);
  return { buffer, view: new DataView(buffer, offset, byteLength) };
}
function finiteCoordinate(value: number): void {
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000) throw new RangeError("좌표·와인딩은 유한 지원 범위 안에 있어야 합니다.");
}
export function validateExtremeStrips(strips: readonly SparseStripDescriptor[]): void {
  extremeInteger(strips.length, 0, MAX_GEOMETRY_ELEMENTS, "strip count");
  let work = 0;
  let segmentCount = 0;
  for (const strip of strips) {
    for (const value of [strip.originX, strip.originY, strip.backdropWinding]) {
      finiteCoordinate(value);
      if (!Number.isInteger(value)) throw new RangeError("스트립 원점·와인딩은 정수여야 합니다.");
    }
    extremeInteger(strip.widthPx, 0, 8, "strip width");
    if (!Number.isInteger(strip.widthPx) || (strip.stripHeight !== 4 && strip.stripHeight !== 8)) throw new RangeError("스트립 크기는 4/8 높이와 정수 폭이어야 합니다.");
    extremeInteger(strip.segments.length, 0, MAX_GEOMETRY_ELEMENTS, "segment count");
    segmentCount += strip.segments.length;
    if (segmentCount > MAX_GEOMETRY_ELEMENTS) throw new RangeError("전체 선분 개수 상한을 초과했습니다.");
    work += Math.max(1, strip.widthPx * strip.stripHeight) * Math.max(1, strip.segments.length ** 3);
    if (work > MAX_GEOMETRY_WORK) throw new RangeError("스트립 계산량 상한을 초과했습니다.");
    for (const segment of strip.segments) for (const value of [segment.x0, segment.y0, segment.x1, segment.y1]) finiteCoordinate(value);
  }
}
export function validateExtremePolygons(polygons: readonly (readonly (readonly [number, number])[])[], cells: number): void {
  extremeInteger(polygons.length, 0, MAX_GEOMETRY_ELEMENTS, "polygon count");
  let points = 0;
  for (const polygon of polygons) {
    points += polygon.length;
    if (points > MAX_GEOMETRY_ELEMENTS || points * cells > MAX_GEOMETRY_WORK) throw new RangeError("폴리곤 계산량 상한을 초과했습니다.");
    for (const point of polygon) { finiteCoordinate(point[0]); finiteCoordinate(point[1]); }
  }
}
