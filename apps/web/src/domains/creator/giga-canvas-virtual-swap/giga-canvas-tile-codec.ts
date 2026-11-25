import { MAX_TILE_RAW_BYTES, MAX_TILE_ENCODED_BYTES, requireTileBytes } from "./giga-canvas-input-contract";

const CODEC_MAGIC = [0x54, 0x53, 0x52, 0x44] as const;
const CODEC_HEADER_BYTES = 9;

/** 실제 Uint8ClampedArray 타일 버퍼를 평면 채널 Delta + PackBits RLE로 무손실 압축한다. */
export function compressTileRleDelta(pixels: Uint8ClampedArray): Uint8Array {
  requireTileBytes(pixels, "Uint8ClampedArray", MAX_TILE_RAW_BYTES);
  const rawLen = pixels.length;
  const useRgbaPlanar = rawLen >= 4 && rawLen % 4 === 0;
  const delta = new Uint8Array(rawLen);
  if (useRgbaPlanar) {
    const pixelCount = rawLen >>> 2;
    for (let ch = 0; ch < 4; ch += 1) {
      const planeOffset = ch * pixelCount;
      let prev = 0;
      for (let p = 0; p < pixelCount; p += 1) { const cur = pixels[(p << 2) + ch] ?? 0; delta[planeOffset + p] = (cur - prev) & 0xff; prev = cur; }
    }
  } else {
    let prev = 0;
    for (let i = 0; i < rawLen; i += 1) { const cur = pixels[i] ?? 0; delta[i] = (cur - prev) & 0xff; prev = cur; }
  }
  const out = new Uint8Array(CODEC_HEADER_BYTES + rawLen + Math.ceil(rawLen / 128) + 4);
  out[0] = CODEC_MAGIC[0]; out[1] = CODEC_MAGIC[1]; out[2] = CODEC_MAGIC[2]; out[3] = CODEC_MAGIC[3];
  out[4] = useRgbaPlanar ? 1 : 0;
  out[5] = rawLen & 0xff; out[6] = (rawLen >>> 8) & 0xff; out[7] = (rawLen >>> 16) & 0xff; out[8] = (rawLen >>> 24) & 0xff;
  let outPos = CODEC_HEADER_BYTES;
  let pos = 0;
  while (pos < rawLen) {
    const currentByte = delta[pos] ?? 0;
    let runLen = 1;
    while (pos + runLen < rawLen && runLen < 65665 && delta[pos + runLen] === currentByte) runLen += 1;
    if (runLen >= 130) {
      const ext = runLen - 130;
      out[outPos] = 0xff; out[outPos + 1] = ext & 0xff; out[outPos + 2] = (ext >>> 8) & 0xff; out[outPos + 3] = currentByte;
      outPos += 4; pos += runLen;
      continue;
    }
    if (runLen >= 3) {
      out[outPos] = 0x80 | (runLen - 3); out[outPos + 1] = currentByte;
      outPos += 2; pos += runLen;
      continue;
    }
    const litStart = pos;
    let litLen = 0;
    while (pos < rawLen && litLen < 128) {
      const b0 = delta[pos] ?? 0;
      if (pos + 2 < rawLen && delta[pos + 1] === b0 && delta[pos + 2] === b0) break;
      pos += 1; litLen += 1;
    }
    if (litLen === 0) { litLen = 1; pos += 1; }
    out[outPos] = litLen - 1; outPos += 1;
    for (let k = 0; k < litLen; k += 1) { out[outPos] = delta[litStart + k] ?? 0; outPos += 1; }
  }
  return out.slice(0, outPos);
}

/** RLE-Delta 압축 바이너리를 원래 Uint8ClampedArray 픽셀 버퍼로 무손실 복원한다. */
export function decompressTileRleDelta(compressed: Uint8Array): Uint8ClampedArray {
  requireTileBytes(compressed, "Uint8Array", MAX_TILE_ENCODED_BYTES);
  if (compressed.length < CODEC_HEADER_BYTES) throw new Error("Invalid RLE-Delta tile stream: header truncated");
  if (compressed[0] !== CODEC_MAGIC[0] || compressed[1] !== CODEC_MAGIC[1] || compressed[2] !== CODEC_MAGIC[2] || compressed[3] !== CODEC_MAGIC[3]) {
    throw new Error("Invalid RLE-Delta tile stream: magic mismatch");
  }
  const flags = compressed[4] ?? 0;
  if (flags !== 0 && flags !== 1) throw new Error(`Invalid RLE-Delta tile stream: unsupported flags ${flags}`);
  const rawLen = ((compressed[5] ?? 0) | ((compressed[6] ?? 0) << 8) | ((compressed[7] ?? 0) << 16) | ((compressed[8] ?? 0) << 24)) >>> 0;
  if (rawLen > MAX_TILE_RAW_BYTES || (flags === 1 && (rawLen < 4 || rawLen % 4 !== 0))) throw new RangeError("RLE-Delta 출력 크기·채널 배열이 지원 범위를 벗어났습니다.");
  const delta = new Uint8Array(rawLen);
  let inPos = CODEC_HEADER_BYTES;
  let outPos = 0;
  while (outPos < rawLen) {
    if (inPos >= compressed.length) throw new Error("Invalid RLE-Delta tile stream: unexpected EOF");
    const control = compressed[inPos] ?? 0;
    inPos += 1;
    if (control === 0xff) {
      if (inPos + 2 >= compressed.length) throw new Error("Invalid RLE-Delta tile stream: extended run truncated");
      const runLen = ((compressed[inPos] ?? 0) | ((compressed[inPos + 1] ?? 0) << 8)) + 130;
      const val = compressed[inPos + 2] ?? 0;
      inPos += 3;
      if (outPos + runLen > rawLen) throw new Error("Invalid RLE-Delta tile stream: run packet overflow");
      delta.fill(val, outPos, outPos + runLen);
      outPos += runLen;
    } else if ((control & 0x80) !== 0) {
      const runLen = (control & 0x7f) + 3;
      if (inPos >= compressed.length || outPos + runLen > rawLen) throw new Error("Invalid RLE-Delta tile stream: run packet overflow");
      delta.fill(compressed[inPos] ?? 0, outPos, outPos + runLen);
      inPos += 1; outPos += runLen;
    } else {
      const litLen = control + 1;
      if (inPos + litLen > compressed.length || outPos + litLen > rawLen) throw new Error("Invalid RLE-Delta tile stream: literal packet overflow");
      delta.set(compressed.subarray(inPos, inPos + litLen), outPos);
      inPos += litLen; outPos += litLen;
    }
  }
  if (inPos !== compressed.length) throw new Error("Invalid RLE-Delta tile stream: trailing bytes");
  const restored = new Uint8ClampedArray(rawLen);
  if (flags === 1 && rawLen >= 4 && rawLen % 4 === 0) {
    const pixelCount = rawLen >>> 2;
    for (let ch = 0; ch < 4; ch += 1) {
      const planeOffset = ch * pixelCount;
      let acc = 0;
      for (let p = 0; p < pixelCount; p += 1) { acc = (acc + (delta[planeOffset + p] ?? 0)) & 0xff; restored[(p << 2) + ch] = acc; }
    }
  } else {
    let acc = 0;
    for (let i = 0; i < rawLen; i += 1) { acc = (acc + (delta[i] ?? 0)) & 0xff; restored[i] = acc; }
  }
  return restored;
}
