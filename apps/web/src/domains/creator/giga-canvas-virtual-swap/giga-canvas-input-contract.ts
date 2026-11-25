export const MAX_TILE_RAW_BYTES = 512 * 512 * 4;
export const MAX_TILE_ENCODED_BYTES = MAX_TILE_RAW_BYTES + Math.ceil(MAX_TILE_RAW_BYTES / 128) + 13;
export const MAX_SWAP_POOL_BYTES = 16 * MAX_TILE_RAW_BYTES;
export const MAX_SWAP_SLOTS = 256;

export function requireSwapInteger(value: number, min: number, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(`${label}: ${min}..${max} 범위의 정수가 필요합니다.`);
  return value;
}
export function normalizedSampleTileSize(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("예제 타일 크기는 유한 수치여야 합니다.");
  return Math.max(4, Math.min(512, Math.floor(value)));
}
export function requireTileBytes(value: Uint8Array | Uint8ClampedArray, kind: "Uint8Array" | "Uint8ClampedArray", max: number): void {
  if (!ArrayBuffer.isView(value) || Object.prototype.toString.call(value) !== `[object ${kind}]` || value.byteLength > max) throw new RangeError("타일 버퍼 종류 또는 지원 크기가 잘못되었습니다.");
}
export function requireSwapSlotKey(key: string): void {
  if (typeof key !== "string" || !key.trim() || key.length > 256 || [...key].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new RangeError("스왑 슬롯 키가 잘못되었습니다.");
}
export function requireMipPreset(preset: { widthPx: number; heightPx: number; layerCount: number; bytesPerPixel: number }): void {
  requireSwapInteger(preset.widthPx, 1, 256 * 65536, "canvas width");
  requireSwapInteger(preset.heightPx, 1, 256 * 65536, "canvas height");
  requireSwapInteger(preset.layerCount, 1, 4096, "layer count");
  if (preset.bytesPerPixel !== 4 && preset.bytesPerPixel !== 8) throw new RangeError("RGBA 타일은 4/8바이트 형식만 모델링합니다.");
  const bytes = Math.ceil(preset.widthPx / 256) * Math.ceil(preset.heightPx / 256) * preset.layerCount * 256 * 256 * preset.bytesPerPixel;
  if (!Number.isSafeInteger(bytes)) throw new RangeError("캔버스 메모리 모델이 안전한 정수 범위를 초과했습니다.");
}
