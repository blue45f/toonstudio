/**
 * Rust `brush_kernel::mix_pigments_km` · `tile_compositor_kernel::composite_tile_dirty_rect`와
 * 바이트 단위 동등한 순수 JS 폴백 구현.
 *
 * - `Math.fround`로 Rust `f32` 연산 순서를 일치시켜 3채널 Kubelka-Munk 감산 혼색과
 *   12종 W3C 블렌드 타일 Dirty-Rect 합성의 0-diff 교차 검증 기준선을 제공한다.
 */

import type { TileBlendModeCode, WasmDirtyRect } from "./wasm64-hotpath-types";

const f = Math.fround;
const KM_REFLECTANCE_MIN = f(0.003);
const KM_REFLECTANCE_MAX = f(0.997);
const INV_255 = f(1 / 255);

function clampF32(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function toU8ClampedF32(v: number): number {
  return Math.round(f(clampF32(v, 0, 1) * 255));
}

function srgbU8ToLinearF32(channel: number): number {
  const s = f(f(channel) / 255);
  return s <= f(0.04045)
    ? f(s / f(12.92))
    : f(Math.pow(f(f(s + f(0.055)) / f(1.055)), f(2.4)));
}

function linearToSrgbU8F32(linear: number): number {
  const c = clampF32(linear, 0, 1);
  const s =
    c <= f(0.0031308)
      ? f(c * f(12.92))
      : f(f(f(1.055) * f(Math.pow(c, f(f(1) / f(2.4))))) - f(0.055));
  return Math.round(f(clampF32(s, 0, 1) * 255));
}

function reflectanceToKsF32(reflectance: number): number {
  const r = clampF32(reflectance, KM_REFLECTANCE_MIN, KM_REFLECTANCE_MAX);
  const oneMinusR = f(f(1) - r);
  return f(f(oneMinusR * oneMinusR) / f(f(2) * r));
}

function ksToReflectanceF32(ks: number): number {
  const safeKs = ks > 0 ? ks : f(0);
  const denom = f(
    f(f(1) + safeKs) + f(Math.sqrt(f(f(safeKs * safeKs) + f(f(2) * safeKs)))),
  );
  return clampF32(f(f(1) / denom), 0, 1);
}

/** Rust `wasm_mix_pigments_km_packed`와 바이트 단위 동등한 3채널 Kubelka-Munk 감산 혼색 JS 폴백. */
export function jsMixPigmentsKmPacked(rgbaA: number, rgbaB: number, ratio: number): number {
  if (!Number.isFinite(ratio)) return rgbaA >>> 0;
  const t = clampF32(f(ratio), 0, 1);
  if (t === 0) return rgbaA >>> 0;
  if (t === 1) return rgbaB >>> 0;

  const invT = f(f(1) - t);
  const a0 = rgbaA & 0xff;
  const a1 = (rgbaA >>> 8) & 0xff;
  const a2 = (rgbaA >>> 16) & 0xff;
  const a3 = (rgbaA >>> 24) & 0xff;
  const b0 = rgbaB & 0xff;
  const b1 = (rgbaB >>> 8) & 0xff;
  const b2 = (rgbaB >>> 16) & 0xff;
  const b3 = (rgbaB >>> 24) & 0xff;

  const mixChannel = (ca: number, cb: number): number => {
    const ra = srgbU8ToLinearF32(ca);
    const rb = srgbU8ToLinearF32(cb);
    const ksMix = f(f(invT * reflectanceToKsF32(ra)) + f(t * reflectanceToKsF32(rb)));
    return linearToSrgbU8F32(ksToReflectanceF32(ksMix));
  };

  const outR = mixChannel(a0, b0);
  const outG = mixChannel(a1, b1);
  const outB = mixChannel(a2, b2);
  const outA = Math.round(clampF32(f(f(invT * f(a3)) + f(t * f(b3))), 0, 255));

  return (outR | (outG << 8) | (outB << 16) | (outA << 24)) >>> 0;
}

function blendOverlayF32(base: number, top: number): number {
  return base <= f(0.5)
    ? f(f(f(2) * base) * top)
    : f(f(1) - f(f(f(2) * f(f(1) - base)) * f(f(1) - top)));
}

function blendChannelF32(mode: TileBlendModeCode, b: number, s: number): number {
  switch (mode) {
    case 0: // Normal
      return s;
    case 1: // Multiply
      return f(b * s);
    case 2: // Screen
      return f(f(b + s) - f(b * s));
    case 3: // Overlay
      return blendOverlayF32(b, s);
    case 4: {
      // SoftLight
      if (s <= f(0.5)) {
        return f(b - f(f(f(f(1) - f(f(2) * s)) * b) * f(f(1) - b)));
      }
      const d =
        b <= f(0.25)
          ? f(f(f(f(f(16) * b) - f(12)) * b + f(4)) * b)
          : f(Math.sqrt(b));
      return f(b + f(f(f(f(2) * s) - f(1)) * f(d - b)));
    }
    case 5: // HardLight
      return blendOverlayF32(s, b);
    case 6: // ColorDodge
      if (b <= 0) return f(0);
      if (s >= 1) return f(1);
      return Math.min(f(b / f(f(1) - s)), f(1));
    case 7: // ColorBurn
      if (b >= 1) return f(1);
      if (s <= 0) return f(0);
      return f(f(1) - Math.min(f(f(f(1) - b) / s), f(1)));
    case 8: // Darken
      return b < s ? b : s;
    case 9: // Lighten
      return b > s ? b : s;
    case 10: {
      // LinearBurn
      const v = f(f(b + s) - f(1));
      return v > 0 ? v : f(0);
    }
    case 11: {
      // Add
      const v = f(b + s);
      return v < 1 ? v : f(1);
    }
  }
}

function composeChannelF32(
  cb: number,
  cs: number,
  mode: TileBlendModeCode,
  ab: number,
  asEff: number,
  invOutA: number,
): number {
  const b = f(f(cb) * INV_255);
  const s = f(f(cs) * INV_255);
  const bVal = blendChannelF32(mode, b, s);
  const cMix = f(f(f(f(1) - ab) * s) + f(ab * bVal));
  return toU8ClampedF32(
    f(f(f(asEff * cMix) + f(f(ab * f(f(1) - asEff)) * b)) * invOutA),
  );
}

/** Rust `wasm_composite_tile_dirty_rect`와 바이트 단위 동등한 12종 블렌드 타일 합성 JS 폴백. */
export function jsCompositeTileDirtyRect(
  dstRgba: Uint8Array,
  srcRgba: Uint8Array,
  tileWidth: number,
  tileHeight: number,
  dirty: WasmDirtyRect,
  blendMode: TileBlendModeCode,
  opacityU8: number,
): { readonly output: Uint8Array; readonly processedPixels: number } {
  const expected = tileWidth * tileHeight * 4;
  if (dstRgba.length !== expected || srcRgba.length !== expected) {
    throw new RangeError(
      `타일 합성 버퍼 길이 불일치: expected=${expected}, dst=${dstRgba.length}, src=${srcRgba.length}`,
    );
  }
  const output = new Uint8Array(dstRgba);
  const clampedOpacity = Math.max(0, Math.min(255, Math.round(opacityU8)));
  if (
    clampedOpacity === 0 ||
    dirty.width <= 0 ||
    dirty.height <= 0 ||
    dirty.x >= tileWidth ||
    dirty.y >= tileHeight
  ) {
    return { output, processedPixels: 0 };
  }

  const x0 = Math.max(0, Math.floor(dirty.x));
  const y0 = Math.max(0, Math.floor(dirty.y));
  const x1 = Math.min(tileWidth, x0 + Math.floor(dirty.width));
  const y1 = Math.min(tileHeight, y0 + Math.floor(dirty.height));
  if (x1 <= x0 || y1 <= y0) {
    return { output, processedPixels: 0 };
  }

  const opacityF = f(f(clampedOpacity) * INV_255);
  const rowBytes = tileWidth * 4;
  let processedPixels = 0;

  for (let y = y0; y < y1; y += 1) {
    const rowOff = y * rowBytes;
    for (let x = x0; x < x1; x += 1) {
      processedPixels += 1;
      const off = rowOff + x * 4;
      const sA = srcRgba[off + 3] ?? 0;
      if (sA === 0) continue;

      const dA = output[off + 3] ?? 0;
      const asEff = f(f(f(sA) * INV_255) * opacityF);
      const ab = f(f(dA) * INV_255);
      const invAs = f(f(1) - asEff);
      const outA = f(asEff + f(ab * invAs));
      if (outA <= f(1e-6)) {
        output[off] = 0;
        output[off + 1] = 0;
        output[off + 2] = 0;
        output[off + 3] = 0;
        continue;
      }
      const invOutA = f(f(1) / outA);
      output[off] = composeChannelF32(
        output[off] ?? 0,
        srcRgba[off] ?? 0,
        blendMode,
        ab,
        asEff,
        invOutA,
      );
      output[off + 1] = composeChannelF32(
        output[off + 1] ?? 0,
        srcRgba[off + 1] ?? 0,
        blendMode,
        ab,
        asEff,
        invOutA,
      );
      output[off + 2] = composeChannelF32(
        output[off + 2] ?? 0,
        srcRgba[off + 2] ?? 0,
        blendMode,
        ab,
        asEff,
        invOutA,
      );
      output[off + 3] = toU8ClampedF32(outA);
    }
  }

  return { output, processedPixels };
}
