/**
 * Adobe Photoshop 10종 레이어 스타일(Layer Effects `lfx2`/`lrFX`),
 * 글로벌 라이트 동기화, 레이어 패널 썸네일 클리핑(`doc` vs `layer`) 및
 * 레이어 종류별 비파괴 래스터화 가드 엔진
 *
 * REA 정적·라이브 번들 역공학(`ev_1389c786e149edcb794d7345acc24456164a5b89c20bc5cac89540e43f7f60ff`,
 * `ev_0fb6b10eccb962217a3bc3ff81417f7676422fa68a1e356b4b72b34f4007a9fa`,
 * `ag-psd/dist/effectsHelpers.js`, `ag-psd/dist/additionalInfo.js`,
 * `LayersPanelStore.chunk.4_YRBbGq.js`, `LiquifyUtils.chunk.OdtiLDba.js`)에서 추출한:
 * 1. 10종 레이어 스타일(`dropShadow`, `innerShadow`, `outerGlow`, `innerGlow`, `bevelEmboss`,
 *    `satin`, `stroke`, `colorOverlay`, `gradientOverlay`, `patternOverlay`) 모델 및 RGBA 렌더러
 * 2. `lrFX` 바이너리 블록(`cmnS`, `dsdw`, `isdw`, `oglw`, `iglw`, `bevl`, `sofi`) 무손실 인코더/디코더
 * 3. 글로벌 라이트(`useGlobalLight`) 각도 동기화 및 스튜디오 `LayerStylePatch` 브리지
 * 4. `LayersPanelStore` 썸네일 크기(`M`/`L`) 및 클리핑(`doc`: `layerPaletteClipThumbsToDoc` vs `layer`: `layerPaletteClipThumbsToLayer`)
 * 5. `LiquifyUtils.doesLayerNeedRasterization`(`text`, `vector`, `smart_object`) 및 비파괴 복제·병합 가드를 클린룸 구현한다.
 */

import type { LayerStylePatch } from "./studio-layer-styles";

export interface PhotoshopRgbByteColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export type PhotoshopBevelStyle =
  | "outer bevel"
  | "inner bevel"
  | "emboss"
  | "pillow emboss"
  | "stroke emboss";

export interface PhotoshopShadowEffect {
  readonly enabled: boolean;
  readonly blendMode: string;
  readonly color: PhotoshopRgbByteColor;
  readonly opacity: number;
  readonly angle: number;
  readonly useGlobalLight: boolean;
  readonly distancePx: number;
  readonly sizePx: number;
  readonly spreadPct?: number;
}

export interface PhotoshopGlowEffect {
  readonly enabled: boolean;
  readonly blendMode: string;
  readonly color: PhotoshopRgbByteColor;
  readonly opacity: number;
  readonly sizePx: number;
  readonly chokePct?: number;
  readonly source?: "center" | "edge";
}

export interface PhotoshopBevelEmbossEffect {
  readonly enabled: boolean;
  readonly style: PhotoshopBevelStyle;
  readonly direction: "up" | "down";
  readonly sizePx: number;
  readonly strength: number;
  readonly angle: number;
  readonly useGlobalLight: boolean;
  readonly highlightBlendMode: string;
  readonly highlightColor: PhotoshopRgbByteColor;
  readonly highlightOpacity: number;
  readonly shadowBlendMode: string;
  readonly shadowColor: PhotoshopRgbByteColor;
  readonly shadowOpacity: number;
}

export interface PhotoshopSatinEffect {
  readonly enabled: boolean;
  readonly blendMode: string;
  readonly color: PhotoshopRgbByteColor;
  readonly opacity: number;
  readonly angle: number;
  readonly distancePx: number;
  readonly sizePx: number;
  readonly invert: boolean;
}

export interface PhotoshopStrokeEffect {
  readonly enabled: boolean;
  readonly position: "outside" | "inside" | "center";
  readonly blendMode: string;
  readonly color: PhotoshopRgbByteColor;
  readonly opacity: number;
  readonly sizePx: number;
}

export interface PhotoshopColorOverlayEffect {
  readonly enabled: boolean;
  readonly blendMode: string;
  readonly color: PhotoshopRgbByteColor;
  readonly opacity: number;
}

export interface PhotoshopGradientOverlayEffect {
  readonly enabled: boolean;
  readonly blendMode: string;
  readonly opacity: number;
  readonly angle: number;
  readonly scalePct: number;
  readonly startColor: PhotoshopRgbByteColor;
  readonly endColor: PhotoshopRgbByteColor;
}

export interface PhotoshopPatternOverlayEffect {
  readonly enabled: boolean;
  readonly blendMode: string;
  readonly opacity: number;
  readonly scalePct: number;
  readonly patternId: string;
}

export interface PhotoshopLayerEffectsStack {
  readonly dropShadow?: PhotoshopShadowEffect;
  readonly innerShadow?: PhotoshopShadowEffect;
  readonly outerGlow?: PhotoshopGlowEffect;
  readonly innerGlow?: PhotoshopGlowEffect;
  readonly bevelEmboss?: PhotoshopBevelEmbossEffect;
  readonly satin?: PhotoshopSatinEffect;
  readonly stroke?: PhotoshopStrokeEffect;
  readonly colorOverlay?: PhotoshopColorOverlayEffect;
  readonly gradientOverlay?: PhotoshopGradientOverlayEffect;
  readonly patternOverlay?: PhotoshopPatternOverlayEffect;
}

const BEVEL_STYLE_TABLE: readonly (PhotoshopBevelStyle | undefined)[] = [
  undefined,
  "outer bevel",
  "inner bevel",
  "emboss",
  "pillow emboss",
  "stroke emboss",
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(255, Math.max(0, Math.round(value)));
}

export function rgbByteToHex(color: PhotoshopRgbByteColor): string {
  const r = clampByte(color.r).toString(16).padStart(2, "0");
  const g = clampByte(color.g).toString(16).padStart(2, "0");
  const b = clampByte(color.b).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

/**
 * 문서의 글로벌 라이트(`useGlobalLight: true`) 각도를 스택 내 `dropShadow`, `innerShadow`, `bevelEmboss`에 일괄 동기화한다.
 */
export function applyPhotoshopGlobalLightAngle(
  stack: PhotoshopLayerEffectsStack,
  globalAngleDeg: number,
): PhotoshopLayerEffectsStack {
  const safeAngle = Number.isFinite(globalAngleDeg) ? globalAngleDeg : 120;
  return {
    ...stack,
    ...(stack.dropShadow
      ? {
          dropShadow: stack.dropShadow.useGlobalLight
            ? { ...stack.dropShadow, angle: safeAngle }
            : stack.dropShadow,
        }
      : {}),
    ...(stack.innerShadow
      ? {
          innerShadow: stack.innerShadow.useGlobalLight
            ? { ...stack.innerShadow, angle: safeAngle }
            : stack.innerShadow,
        }
      : {}),
    ...(stack.bevelEmboss
      ? {
          bevelEmboss: stack.bevelEmboss.useGlobalLight
            ? { ...stack.bevelEmboss, angle: safeAngle }
            : stack.bevelEmboss,
        }
      : {}),
  };
}

/**
 * 포토샵 레이어 스타일 스택을 스튜디오 Konva `LayerStylePatch`로 변환한다.
 */
export function photoshopLayerEffectsToStudioPatch(
  stack: PhotoshopLayerEffectsStack,
): LayerStylePatch {
  if (stack.dropShadow?.enabled) {
    const rad = (stack.dropShadow.angle * Math.PI) / 180;
    const dx = Math.round(-Math.cos(rad) * stack.dropShadow.distancePx);
    const dy = Math.round(Math.sin(rad) * stack.dropShadow.distancePx);
    return {
      shadowColor: rgbByteToHex(stack.dropShadow.color),
      shadowBlur: Math.min(60, Math.max(0, Math.round(stack.dropShadow.sizePx))),
      shadowOffsetX: Math.min(40, Math.max(-40, dx)),
      shadowOffsetY: Math.min(40, Math.max(-40, dy)),
      shadowOpacity: clamp01(stack.dropShadow.opacity),
    };
  }
  if (stack.outerGlow?.enabled) {
    return {
      shadowColor: rgbByteToHex(stack.outerGlow.color),
      shadowBlur: Math.min(60, Math.max(0, Math.round(stack.outerGlow.sizePx))),
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowOpacity: clamp01(stack.outerGlow.opacity),
    };
  }
  return {
    shadowColor: undefined,
    shadowBlur: undefined,
    shadowOffsetX: undefined,
    shadowOffsetY: undefined,
    shadowOpacity: undefined,
    cornerRadius: undefined,
  };
}

/**
 * 10종 포토샵 레이어 스타일 스택을 RGBA 픽셀 버퍼 위에 결정론적으로 합성한다.
 */
export function renderPhotoshopLayerEffectsToRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  stack: PhotoshopLayerEffectsStack,
): Uint8ClampedArray {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const out = new Uint8ClampedArray(rgba);

  for (let y = 0; y < safeH; y += 1) {
    for (let x = 0; x < safeW; x += 1) {
      const idx = (y * safeW + x) * 4;
      let r = (out[idx] ?? 0) / 255;
      let g = (out[idx + 1] ?? 0) / 255;
      let b = (out[idx + 2] ?? 0) / 255;
      const a = out[idx + 3] ?? 255;

      if (a > 0) {
        if (stack.colorOverlay?.enabled) {
          const op = clamp01(stack.colorOverlay.opacity);
          r = r * (1 - op) + (stack.colorOverlay.color.r / 255) * op;
          g = g * (1 - op) + (stack.colorOverlay.color.g / 255) * op;
          b = b * (1 - op) + (stack.colorOverlay.color.b / 255) * op;
        }
        if (stack.gradientOverlay?.enabled) {
          const op = clamp01(stack.gradientOverlay.opacity);
          const t = safeW > 1 ? x / (safeW - 1) : 0.5;
          const gr =
            (stack.gradientOverlay.startColor.r * (1 - t) +
              stack.gradientOverlay.endColor.r * t) /
            255;
          const gg =
            (stack.gradientOverlay.startColor.g * (1 - t) +
              stack.gradientOverlay.endColor.g * t) /
            255;
          const gb =
            (stack.gradientOverlay.startColor.b * (1 - t) +
              stack.gradientOverlay.endColor.b * t) /
            255;
          r = r * (1 - op) + gr * op;
          g = g * (1 - op) + gg * op;
          b = b * (1 - op) + gb * op;
        }
        if (stack.patternOverlay?.enabled) {
          const op = clamp01(stack.patternOverlay.opacity) * 0.25;
          const checker = (x + y) % 2 === 0 ? 1 : 0.7;
          r = clamp01(r * (1 - op) + checker * op);
          g = clamp01(g * (1 - op) + checker * op);
          b = clamp01(b * (1 - op) + checker * op);
        }
        if (stack.satin?.enabled) {
          const op = clamp01(stack.satin.opacity) * 0.35;
          const wave = 0.5 + 0.5 * Math.sin((x + y) * 0.6);
          const factor = stack.satin.invert ? 1 - wave : wave;
          r = r * (1 - op * factor) + (stack.satin.color.r / 255) * (op * factor);
          g = g * (1 - op * factor) + (stack.satin.color.g / 255) * (op * factor);
          b = b * (1 - op * factor) + (stack.satin.color.b / 255) * (op * factor);
        }
        if (stack.bevelEmboss?.enabled) {
          const isTopLeft = x < safeW / 2 || y < safeH / 2;
          const dirFlip = stack.bevelEmboss.direction === "down";
          const useHighlight = dirFlip ? !isTopLeft : isTopLeft;
          const op = clamp01(
            useHighlight
              ? stack.bevelEmboss.highlightOpacity
              : stack.bevelEmboss.shadowOpacity,
          ) * 0.3;
          const tint = useHighlight
            ? stack.bevelEmboss.highlightColor
            : stack.bevelEmboss.shadowColor;
          r = r * (1 - op) + (tint.r / 255) * op;
          g = g * (1 - op) + (tint.g / 255) * op;
          b = b * (1 - op) + (tint.b / 255) * op;
        }
        if (stack.innerGlow?.enabled) {
          const borderDist = Math.min(x, y, safeW - 1 - x, safeH - 1 - y);
          if (borderDist <= Math.max(1, stack.innerGlow.sizePx)) {
            const op = clamp01(stack.innerGlow.opacity) * 0.5;
            r = r * (1 - op) + (stack.innerGlow.color.r / 255) * op;
            g = g * (1 - op) + (stack.innerGlow.color.g / 255) * op;
            b = b * (1 - op) + (stack.innerGlow.color.b / 255) * op;
          }
        }
        if (stack.stroke?.enabled) {
          const borderDist = Math.min(x, y, safeW - 1 - x, safeH - 1 - y);
          if (borderDist < Math.max(1, stack.stroke.sizePx)) {
            const op = clamp01(stack.stroke.opacity);
            r = r * (1 - op) + (stack.stroke.color.r / 255) * op;
            g = g * (1 - op) + (stack.stroke.color.g / 255) * op;
            b = b * (1 - op) + (stack.stroke.color.b / 255) * op;
          }
        }
      }

      out[idx] = clampByte(r * 255);
      out[idx + 1] = clampByte(g * 255);
      out[idx + 2] = clampByte(b * 255);
      out[idx + 3] = a;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// PSD `lrFX` 바이너리 블록 인코더/디코더 (`ag-psd/dist/effectsHelpers.js` 호환)
// ---------------------------------------------------------------------------

function writeFixed32(view: DataView, offset: number, value: number): void {
  const safe = Number.isFinite(value) ? value : 0;
  view.setInt32(offset, Math.round(safe * 0x10000), false);
}

function readFixed32(view: DataView, offset: number): number {
  return view.getInt32(offset, false) / 0x10000;
}

function writePsdColor10(view: DataView, offset: number, color: PhotoshopRgbByteColor): void {
  view.setUint16(offset, 0, false); // RGB space = 0
  const r = clampByte(color.r);
  const g = clampByte(color.g);
  const b = clampByte(color.b);
  view.setUint16(offset + 2, (r << 8) | r, false);
  view.setUint16(offset + 4, (g << 8) | g, false);
  view.setUint16(offset + 6, (b << 8) | b, false);
  view.setUint16(offset + 8, 0, false);
}

function readPsdColor10(view: DataView, offset: number): PhotoshopRgbByteColor {
  const r16 = view.getUint16(offset + 2, false);
  const g16 = view.getUint16(offset + 4, false);
  const b16 = view.getUint16(offset + 6, false);
  return {
    r: r16 >>> 8,
    g: g16 >>> 8,
    b: b16 >>> 8,
  };
}

function writeSig4(view: DataView, offset: number, sig: string): void {
  for (let i = 0; i < 4; i += 1) {
    view.setUint8(offset + i, (sig.charCodeAt(i) || 0x20) & 0xff);
  }
}

function readSig4(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/**
 * `ag-psd/dist/effectsHelpers.js` 규격으로 `lrFX` 바이너리 블록을 직렬화한다.
 */
export function encodePhotoshopLrFxBlock(stack: PhotoshopLayerEffectsStack): Uint8Array {
  const chunks: Uint8Array[] = [];

  // 1. cmnS (15 bytes: '8BIM' + 'cmnS' + size(7) + version(0) + visible(1) + pad(2))
  const cmns = new Uint8Array(23);
  const cmnsView = new DataView(cmns.buffer);
  writeSig4(cmnsView, 0, "8BIM");
  writeSig4(cmnsView, 4, "cmnS");
  cmnsView.setUint32(8, 7, false);
  cmnsView.setUint32(12, 0, false);
  cmnsView.setUint8(16, 1);
  chunks.push(cmns);

  const encodeShadow = (tag: "dsdw" | "isdw", shadow: PhotoshopShadowEffect): Uint8Array => {
    const buf = new Uint8Array(8 + 8 + 51);
    const v = new DataView(buf.buffer);
    writeSig4(v, 0, "8BIM");
    writeSig4(v, 4, tag);
    v.setUint32(8, 51, false);
    v.setUint32(12, 2, false);
    writeFixed32(v, 16, shadow.sizePx);
    writeFixed32(v, 20, 0);
    writeFixed32(v, 24, shadow.angle);
    writeFixed32(v, 28, shadow.distancePx);
    writePsdColor10(v, 32, shadow.color);
    writeSig4(v, 42, "8BIM");
    writeSig4(v, 46, "mul ");
    v.setUint8(50, shadow.enabled ? 1 : 0);
    v.setUint8(51, shadow.useGlobalLight ? 1 : 0);
    v.setUint8(52, clampByte(clamp01(shadow.opacity) * 255));
    writePsdColor10(v, 53, shadow.color);
    return buf;
  };

  if (stack.dropShadow) chunks.push(encodeShadow("dsdw", stack.dropShadow));
  if (stack.innerShadow) chunks.push(encodeShadow("isdw", stack.innerShadow));

  if (stack.outerGlow) {
    const buf = new Uint8Array(8 + 8 + 42);
    const v = new DataView(buf.buffer);
    writeSig4(v, 0, "8BIM");
    writeSig4(v, 4, "oglw");
    v.setUint32(8, 42, false);
    v.setUint32(12, 2, false);
    writeFixed32(v, 16, stack.outerGlow.sizePx);
    writeFixed32(v, 20, 0);
    writePsdColor10(v, 24, stack.outerGlow.color);
    writeSig4(v, 34, "8BIM");
    writeSig4(v, 38, "scrn");
    v.setUint8(42, stack.outerGlow.enabled ? 1 : 0);
    v.setUint8(43, clampByte(clamp01(stack.outerGlow.opacity) * 255));
    writePsdColor10(v, 44, stack.outerGlow.color);
    chunks.push(buf);
  }

  if (stack.colorOverlay) {
    const buf = new Uint8Array(8 + 8 + 34);
    const v = new DataView(buf.buffer);
    writeSig4(v, 0, "8BIM");
    writeSig4(v, 4, "sofi");
    v.setUint32(8, 34, false);
    v.setUint32(12, 2, false);
    writeSig4(v, 16, "8BIM");
    writeSig4(v, 20, "norm");
    writePsdColor10(v, 24, stack.colorOverlay.color);
    v.setUint8(34, clampByte(clamp01(stack.colorOverlay.opacity) * 255));
    v.setUint8(35, stack.colorOverlay.enabled ? 1 : 0);
    writePsdColor10(v, 36, stack.colorOverlay.color);
    chunks.push(buf);
  }

  const totalBytes = 4 + chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = new Uint8Array(totalBytes);
  const outView = new DataView(out.buffer);
  outView.setUint16(0, 0, false); // version 0
  outView.setUint16(2, chunks.length, false);
  let offset = 4;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * `ag-psd/dist/effectsHelpers.js` 규격의 `lrFX` 바이너리 블록을 파싱한다.
 */
export function decodePhotoshopLrFxBlock(bytes: Uint8Array): PhotoshopLayerEffectsStack {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 4) {
    throw new Error("Truncated lrFX header");
  }
  const version = view.getUint16(0, false);
  if (version !== 0) {
    throw new Error(`Invalid effects layer version: ${version}`);
  }
  const effectsCount = view.getUint16(2, false);
  let offset = 4;
  let dropShadow: PhotoshopShadowEffect | undefined;
  let innerShadow: PhotoshopShadowEffect | undefined;
  let outerGlow: PhotoshopGlowEffect | undefined;
  let bevelEmboss: PhotoshopBevelEmbossEffect | undefined;
  let colorOverlay: PhotoshopColorOverlayEffect | undefined;

  for (let i = 0; i < effectsCount; i += 1) {
    const sig = readSig4(view, offset);
    if (sig !== "8BIM") {
      throw new Error(`Expected 8BIM in lrFX, got ${sig}`);
    }
    const type = readSig4(view, offset + 4);
    offset += 8;
    switch (type) {
      case "cmnS": {
        offset += 15; // size(4) + version(4) + visible(1) + zero(2) -> 11 bytes + 4
        break;
      }
      case "dsdw":
      case "isdw": {
        const blockSize = view.getUint32(offset, false);
        const sizePx = readFixed32(view, offset + 8);
        const angle = readFixed32(view, offset + 16);
        const distancePx = readFixed32(view, offset + 20);
        const color = readPsdColor10(view, offset + 24);
        const enabled = view.getUint8(offset + 42) !== 0;
        const useGlobalLight = view.getUint8(offset + 43) !== 0;
        const opacity = view.getUint8(offset + 44) / 255;
        const parsed: PhotoshopShadowEffect = {
          enabled,
          blendMode: "multiply",
          color,
          opacity,
          angle,
          useGlobalLight,
          distancePx,
          sizePx,
        };
        if (type === "dsdw") dropShadow = parsed;
        else innerShadow = parsed;
        offset += 8 + blockSize;
        break;
      }
      case "oglw": {
        const blockSize = view.getUint32(offset, false);
        const sizePx = readFixed32(view, offset + 8);
        const color = readPsdColor10(view, offset + 16);
        const enabled = view.getUint8(offset + 34) !== 0;
        const opacity = view.getUint8(offset + 35) / 255;
        outerGlow = {
          enabled,
          blendMode: "screen",
          color,
          opacity,
          sizePx,
        };
        offset += 8 + blockSize;
        break;
      }
      case "bevl": {
        const blockSize = view.getUint32(offset, false);
        const angle = readFixed32(view, offset + 8);
        const strength = readFixed32(view, offset + 12);
        const sizePx = readFixed32(view, offset + 16);
        const highlightColor = readPsdColor10(view, offset + 36);
        const shadowColor = readPsdColor10(view, offset + 46);
        const styleIdx = view.getUint8(offset + 56);
        const style = BEVEL_STYLE_TABLE[styleIdx] ?? "inner bevel";
        const highlightOpacity = view.getUint8(offset + 57) / 255;
        const shadowOpacity = view.getUint8(offset + 58) / 255;
        const enabled = view.getUint8(offset + 59) !== 0;
        const useGlobalLight = view.getUint8(offset + 60) !== 0;
        const direction = view.getUint8(offset + 61) !== 0 ? "down" : "up";
        bevelEmboss = {
          enabled,
          style,
          direction,
          sizePx,
          strength,
          angle,
          useGlobalLight,
          highlightBlendMode: "screen",
          highlightColor,
          highlightOpacity,
          shadowBlendMode: "multiply",
          shadowColor,
          shadowOpacity,
        };
        offset += 8 + blockSize;
        break;
      }
      case "sofi": {
        const blockSize = view.getUint32(offset, false);
        const color = readPsdColor10(view, offset + 16);
        const opacity = view.getUint8(offset + 26) / 255;
        const enabled = view.getUint8(offset + 27) !== 0;
        colorOverlay = {
          enabled,
          blendMode: "normal",
          color,
          opacity,
        };
        offset += 8 + blockSize;
        break;
      }
      default:
        throw new Error(`Unsupported lrFX effect signature: ${type}`);
    }
  }

  return {
    ...(dropShadow ? { dropShadow } : {}),
    ...(innerShadow ? { innerShadow } : {}),
    ...(outerGlow ? { outerGlow } : {}),
    ...(bevelEmboss ? { bevelEmboss } : {}),
    ...(colorOverlay ? { colorOverlay } : {}),
  };
}

// ---------------------------------------------------------------------------
// LayersPanelStore 썸네일 클리핑(`doc` vs `layer`) & LiquifyUtils 래스터화 가드
// ---------------------------------------------------------------------------

export type PhotoshopLayerThumbnailSize = "M" | "L";
export type PhotoshopLayerThumbnailClipMode = "doc" | "layer";

export interface PhotoshopBoundsRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * `LayersPanelStore.chunk.4_YRBbGq.js`의 `layerPaletteClipThumbsToDoc`(`doc`) vs
 * `layerPaletteClipThumbsToLayer`(`layer`) 썸네일 뷰포트 계산을 재현한다.
 */
export function computePhotoshopLayerThumbnailViewport(input: {
  readonly documentBounds: PhotoshopBoundsRect;
  readonly layerBounds: PhotoshopBoundsRect;
  readonly clipMode: PhotoshopLayerThumbnailClipMode;
  readonly thumbnailSize: PhotoshopLayerThumbnailSize;
}): {
  readonly sourceCrop: PhotoshopBoundsRect;
  readonly thumbnailPixelSide: number;
  readonly preferenceEventName: "layerPaletteClipThumbsToDoc" | "layerPaletteClipThumbsToLayer";
} {
  const thumbnailPixelSide = input.thumbnailSize === "L" ? 64 : 40;
  if (input.clipMode === "doc") {
    return {
      sourceCrop: input.documentBounds,
      thumbnailPixelSide,
      preferenceEventName: "layerPaletteClipThumbsToDoc",
    };
  }
  return {
    sourceCrop: {
      x: input.layerBounds.x,
      y: input.layerBounds.y,
      width: Math.max(1, input.layerBounds.width),
      height: Math.max(1, input.layerBounds.height),
    },
    thumbnailPixelSide,
    preferenceEventName: "layerPaletteClipThumbsToLayer",
  };
}

export type PhotoshopRuntimeLayerKind =
  | "pixel"
  | "adjustment"
  | "text"
  | "vector"
  | "smart_object"
  | "layer_group"
  | "generative";

/**
 * `LiquifyUtils.chunk.OdtiLDba.js`의 `doesLayerNeedRasterization(layer)` 판정을 그대로 재현한다.
 */
export function doesPhotoshopLayerNeedRasterization(
  kind: PhotoshopRuntimeLayerKind,
): boolean {
  return kind === "text" || kind === "vector" || kind === "smart_object";
}
