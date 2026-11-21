/**
 * WebAssembly Memory64 미지원 구형 런타임 전용 순수 JS 레퍼런스 래스터 폴백
 * 및 256×3 RGB 톤 LUT · FNV-1a 픽셀 무결성 체크섬 유틸리티.
 *
 * 모든 고정소수점/f32 연산을 Wasm64 네이티브 바이트코드와 비트 단위로 일치시킨다.
 */

export function clampByte(value: number): number {
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return value | 0;
}

export function jsApplyTonalLut(
  mem: Uint8Array,
  pixelPtr: bigint,
  pixelCount: bigint,
  lutPtr: bigint,
): void {
  const count = Number(pixelCount);
  if (count <= 0) return;
  let p = Number(pixelPtr);
  const end = p + count * 4;
  const lutBase = Number(lutPtr);
  while (p < end) {
    const r = mem[p]!;
    const g = mem[p + 1]!;
    const b = mem[p + 2]!;
    mem[p] = mem[lutBase + r * 3]!;
    mem[p + 1] = mem[lutBase + g * 3 + 1]!;
    mem[p + 2] = mem[lutBase + b * 3 + 2]!;
    p += 4;
  }
}

function jsSourceOverWrite(
  mem: Uint8Array,
  dPtr: number,
  sr: number,
  sg: number,
  sb: number,
  sa: number,
): void {
  if (sa === 255) {
    mem[dPtr] = sr;
    mem[dPtr + 1] = sg;
    mem[dPtr + 2] = sb;
    mem[dPtr + 3] = 255;
    return;
  }
  const dr = mem[dPtr]!;
  const dg = mem[dPtr + 1]!;
  const db = mem[dPtr + 2]!;
  const da = mem[dPtr + 3]!;
  const daScaled = ((da * (255 - sa) + 127) / 255) | 0;
  const outA = sa + daScaled;
  const halfOutA = outA >>> 1;
  mem[dPtr] = ((sr * sa + dr * daScaled + halfOutA) / outA) | 0;
  mem[dPtr + 1] = ((sg * sa + dg * daScaled + halfOutA) / outA) | 0;
  mem[dPtr + 2] = ((sb * sa + db * daScaled + halfOutA) / outA) | 0;
  mem[dPtr + 3] = outA;
}

export function jsCompositeLayerSourceOver(
  mem: Uint8Array,
  dstPtr: bigint,
  srcPtr: bigint,
  pixelCount: bigint,
  opacity255: number,
): void {
  const count = Number(pixelCount);
  const op = clampByte(opacity255);
  if (count <= 0 || op <= 0) return;
  let d = Number(dstPtr);
  let s = Number(srcPtr);
  const dEnd = d + count * 4;
  while (d < dEnd) {
    const sa = ((mem[s + 3]! * op + 127) / 255) | 0;
    if (sa > 0) {
      jsSourceOverWrite(mem, d, mem[s]!, mem[s + 1]!, mem[s + 2]!, sa);
    }
    d += 4;
    s += 4;
  }
}

export function jsCompositeLayerMultiply(
  mem: Uint8Array,
  dstPtr: bigint,
  srcPtr: bigint,
  pixelCount: bigint,
  opacity255: number,
): void {
  const count = Number(pixelCount);
  const op = clampByte(opacity255);
  if (count <= 0 || op <= 0) return;
  let d = Number(dstPtr);
  let s = Number(srcPtr);
  const dEnd = d + count * 4;
  while (d < dEnd) {
    const sa = ((mem[s + 3]! * op + 127) / 255) | 0;
    if (sa > 0) {
      const sr = mem[s]!;
      const sg = mem[s + 1]!;
      const sb = mem[s + 2]!;
      const da = mem[d + 3]!;
      if (da === 0) {
        mem[d] = sr;
        mem[d + 1] = sg;
        mem[d + 2] = sb;
        mem[d + 3] = sa;
      } else {
        const dr = mem[d]!;
        const dg = mem[d + 1]!;
        const db = mem[d + 2]!;
        const invDa = 255 - da;
        const cr = ((invDa * sr + da * (((dr * sr + 127) / 255) | 0) + 127) / 255) | 0;
        const cg = ((invDa * sg + da * (((dg * sg + 127) / 255) | 0) + 127) / 255) | 0;
        const cb = ((invDa * sb + da * (((db * sb + 127) / 255) | 0) + 127) / 255) | 0;
        const daScaled = ((da * (255 - sa) + 127) / 255) | 0;
        const outA = sa + daScaled;
        const halfOutA = outA >>> 1;
        mem[d] = ((cr * sa + dr * daScaled + halfOutA) / outA) | 0;
        mem[d + 1] = ((cg * sa + dg * daScaled + halfOutA) / outA) | 0;
        mem[d + 2] = ((cb * sa + db * daScaled + halfOutA) / outA) | 0;
        mem[d + 3] = outA;
      }
    }
    d += 4;
    s += 4;
  }
}

export function jsStampSoftBrushDab(
  mem: Uint8Array,
  canvasPtr: bigint,
  width: bigint,
  height: bigint,
  cx: number,
  cy: number,
  radius: number,
  r: number,
  g: number,
  b: number,
  alpha255: number,
  hardness255: number,
): number {
  const w = Number(width);
  const h = Number(height);
  const fRadius = Math.fround(radius);
  const alphaClamped = clampByte(alpha255);
  const hardClamped = clampByte(hardness255);
  if (w <= 0 || h <= 0 || fRadius <= 0 || alphaClamped <= 0) return 0;

  const fCx = Math.fround(cx);
  const fCy = Math.fround(cy);
  const minX = Math.trunc(Math.min(w, Math.max(0, Math.floor(Math.fround(fCx - fRadius)))));
  const maxX = Math.trunc(Math.min(w - 1, Math.max(-1, Math.ceil(Math.fround(fCx + fRadius)))));
  const minY = Math.trunc(Math.min(h, Math.max(0, Math.floor(Math.fround(fCy - fRadius)))));
  const maxY = Math.trunc(Math.min(h - 1, Math.max(-1, Math.ceil(Math.fround(fCy + fRadius)))));
  if (minX > maxX || minY > maxY) return 0;

  const radSq = Math.fround(fRadius * fRadius);
  const inner = Math.fround(hardClamped / 255);
  const invSpan = Math.fround(1 / Math.max(Math.fround(1e-5), Math.fround(1 - inner)));
  const basePtr = Number(canvasPtr);
  let touched = 0;

  for (let y = minY; y <= maxY; y += 1) {
    const dy = Math.fround(Math.fround(y + 0.5) - fCy);
    const dySq = Math.fround(dy * dy);
    for (let x = minX; x <= maxX; x += 1) {
      const dx = Math.fround(Math.fround(x + 0.5) - fCx);
      const distSq = Math.fround(Math.fround(dx * dx) + dySq);
      if (distSq >= radSq) continue;
      const dist = Math.fround(Math.sqrt(distSq));
      let cov: number;
      if (hardClamped >= 255) {
        cov = Math.min(1, Math.max(0, Math.fround(fRadius - dist)));
      } else {
        const norm = Math.fround(dist / fRadius);
        if (norm <= inner) {
          cov = 1;
        } else {
          const s = Math.min(
            1,
            Math.max(0, Math.fround(1 - Math.fround(Math.fround(norm - inner) * invSpan))),
          );
          cov = Math.fround(Math.fround(s * s) * Math.fround(3 - Math.fround(2 * s)));
        }
      }
      const sa = Math.min(255, Math.trunc(Math.fround(Math.fround(cov * alphaClamped) + 0.5)));
      if (sa > 0) {
        jsSourceOverWrite(mem, basePtr + (y * w + x) * 4, r, g, b, sa);
        touched += 1;
      }
    }
  }
  return touched;
}

/** 256×3 RGB 톤 커브 LUT를 생성한다(명암 대비·따뜻한 색조·그림자 리프트). */
export function buildWebtoonTonalLut256x3(options?: {
  readonly contrast?: number;
  readonly warmShift?: number;
  readonly shadowLift?: number;
}): Uint8Array {
  const contrast = options?.contrast ?? 1.12;
  const warmShift = options?.warmShift ?? 8;
  const shadowLift = options?.shadowLift ?? 6;
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const centered = (i - 128) * contrast + 128 + shadowLift * (1 - i / 255);
    lut[i * 3] = clampByte(Math.round(centered + warmShift));
    lut[i * 3 + 1] = clampByte(Math.round(centered));
    lut[i * 3 + 2] = clampByte(Math.round(centered - warmShift * 0.6));
  }
  return lut;
}

/** 출력 픽셀 버퍼 전체의 FNV-1a 32비트 무결성 체크섬을 계산한다. */
export function fnv1aChecksum32(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i]!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
