/**
 * 결정적 CPU 3채널 MSDF 타일 생성기(`generateGlyphMsdfTile`),
 * 한국어 한글 음절(U+AC00~U+D7A3)·자모·ASCII 윤곽선 합성기(`buildKoreanGlyphContours`),
 * 및 글리프 아틀라스 슬롯 패커(`MsdfGlyphAtlas`).
 */

export const DEFAULT_MSDF_TILE_SIZE = 32 as const;
export const DEFAULT_MSDF_PX_RANGE = 4 as const;
export const DEFAULT_MSDF_ATLAS_WIDTH = 512 as const;
export const DEFAULT_MSDF_ATLAS_HEIGHT = 512 as const;
export const DEFAULT_MSDF_PADDING_PX = 2 as const;

const EDGE_COLOR_CYAN = 0b011; // G + B
const EDGE_COLOR_MAGENTA = 0b101; // R + B
const EDGE_COLOR_YELLOW = 0b110; // R + G
const EDGE_COLOR_WHITE = 0b111; // R + G + B
const EDGE_COLOR_PALETTE: readonly number[] = [
  EDGE_COLOR_YELLOW,
  EDGE_COLOR_CYAN,
  EDGE_COLOR_MAGENTA,
];

export interface MsdfVec2 {
  readonly x: number;
  readonly y: number;
}

/** 닫힌 2D 윤곽선. 반시계 방향(CCW)은 채움 외곽, 시계 방향(CW)은 내부 구멍을 나타낸다. */
export type MsdfContour = readonly MsdfVec2[];

export interface MsdfGlyphTileOptions {
  readonly tileSize?: number;
  readonly pxRange?: number;
  readonly cornerAngleThresholdRad?: number;
}

export interface MsdfGlyphTile {
  readonly char: string;
  readonly width: number;
  readonly height: number;
  readonly pxRange: number;
  /** RGBA8 텍셀: R/G/B = 3채널 MSDF, A = 단일 채널 True SDF(드롭 섀도·모서리 비교용) */
  readonly rgba: Uint8ClampedArray;
  readonly contourCount: number;
  readonly coloredEdgeCount: number;
}

export interface MsdfAtlasSlot {
  readonly char: string;
  readonly slotIndex: number;
  readonly pixelX: number;
  readonly pixelY: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
  readonly pxRange: number;
  readonly advanceEm: number;
}

export interface MsdfAtlasOptions {
  readonly atlasWidth?: number;
  readonly atlasHeight?: number;
  readonly tileSize?: number;
  readonly paddingPx?: number;
  readonly pxRange?: number;
}

export interface MsdfAtlasStats {
  readonly atlasWidth: number;
  readonly atlasHeight: number;
  readonly tileSize: number;
  readonly paddingPx: number;
  readonly cellStridePx: number;
  readonly cols: number;
  readonly rows: number;
  readonly capacity: number;
  readonly packedCount: number;
  readonly occupancyRatio: number;
  readonly bytesAllocated: number;
}

export function median3(r: number, g: number, b: number): number {
  return Math.max(Math.min(r, g), Math.min(Math.max(r, g), b));
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

interface ColoredSegment {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly dx: number;
  readonly dy: number;
  readonly dirX: number;
  readonly dirY: number;
  readonly lenSq: number;
  readonly colorMask: number;
}

function buildColoredSegments(
  contours: readonly MsdfContour[],
  cornerAngleThresholdRad: number,
): readonly ColoredSegment[] {
  const sinThreshold = Math.sin(cornerAngleThresholdRad);
  const segments: ColoredSegment[] = [];

  for (const contour of contours) {
    const rawEdges: { ax: number; ay: number; bx: number; by: number; dirX: number; dirY: number; lenSq: number }[] = [];
    for (let i = 0; i < contour.length; i += 1) {
      const a = contour[i];
      const b = contour[(i + 1) % contour.length];
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 1e-10) continue;
      const invLen = 1 / Math.sqrt(lenSq);
      rawEdges.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, dirX: dx * invLen, dirY: dy * invLen, lenSq });
    }
    const edgeCount = rawEdges.length;
    if (edgeCount === 0) continue;

    const cornerStarts: number[] = [];
    for (let i = 0; i < edgeCount; i += 1) {
      const prev = rawEdges[(i - 1 + edgeCount) % edgeCount];
      const curr = rawEdges[i];
      if (!prev || !curr) continue;
      const cross = Math.abs(prev.dirX * curr.dirY - prev.dirY * curr.dirX);
      const dot = prev.dirX * curr.dirX + prev.dirY * curr.dirY;
      if (cross > sinThreshold || dot <= 0) {
        cornerStarts.push(i);
      }
    }

    if (cornerStarts.length <= 1) {
      for (const e of rawEdges) {
        segments.push({ ...e, dx: e.bx - e.ax, dy: e.by - e.ay, colorMask: EDGE_COLOR_WHITE });
      }
      continue;
    }

    const edgeColors = new Uint8Array(edgeCount);
    let prevColor = 0;
    let firstColor = 0;
    for (let c = 0; c < cornerStarts.length; c += 1) {
      const start = cornerStarts[c] ?? 0;
      const nextStart = cornerStarts[(c + 1) % cornerStarts.length] ?? 0;
      const isLast = c === cornerStarts.length - 1;
      let chosen = EDGE_COLOR_PALETTE[c % EDGE_COLOR_PALETTE.length] ?? EDGE_COLOR_YELLOW;
      for (const candidate of EDGE_COLOR_PALETTE) {
        if (candidate !== prevColor && (!isLast || candidate !== firstColor)) {
          chosen = candidate;
          break;
        }
      }
      if (c === 0) firstColor = chosen;
      prevColor = chosen;

      let idx = start;
      let guard = 0;
      while (guard < edgeCount) {
        edgeColors[idx] = chosen;
        idx = (idx + 1) % edgeCount;
        guard += 1;
        if (idx === nextStart) break;
      }
    }

    for (let i = 0; i < edgeCount; i += 1) {
      const e = rawEdges[i];
      if (!e) continue;
      segments.push({
        ...e,
        dx: e.bx - e.ax,
        dy: e.by - e.ay,
        colorMask: edgeColors[i] ?? EDGE_COLOR_WHITE,
      });
    }
  }
  return segments;
}

function isPointInsideContours(px: number, py: number, contours: readonly MsdfContour[]): boolean {
  let winding = 0;
  for (const contour of contours) {
    const n = contour.length;
    for (let i = 0; i < n; i += 1) {
      const a = contour[i];
      const b = contour[(i + 1) % n];
      if (!a || !b) continue;
      if (a.y <= py) {
        if (b.y > py && (b.x - a.x) * (py - a.y) - (px - a.x) * (b.y - a.y) > 0) winding += 1;
      } else if (b.y <= py && (b.x - a.x) * (py - a.y) - (px - a.x) * (b.y - a.y) < 0) {
        winding -= 1;
      }
    }
  }
  return winding !== 0;
}

interface ChannelCandidate {
  absDist: number;
  ortho: number;
  pseudoDist: number;
}

function updateChannelCandidate(
  best: ChannelCandidate,
  absDist: number,
  ortho: number,
  pseudoDist: number,
): void {
  const eps = 1e-7;
  if (absDist < best.absDist - eps || (Math.abs(absDist - best.absDist) <= eps && ortho > best.ortho)) {
    best.absDist = absDist;
    best.ortho = ortho;
    best.pseudoDist = pseudoDist;
  }
}

/**
 * Viktor Chlumský 방식의 3채널 엣지 컬러링 + 의사 거리(pseudo-distance)로
 * 결정적 RGBA8 MSDF 글리프 타일을 생성한다.
 */
export function generateGlyphMsdfTile(
  char: string,
  contours: readonly MsdfContour[],
  options: MsdfGlyphTileOptions = {},
): MsdfGlyphTile {
  const width = Math.max(8, Math.round(options.tileSize ?? DEFAULT_MSDF_TILE_SIZE));
  const height = width;
  const pxRange = Math.max(1, options.pxRange ?? DEFAULT_MSDF_PX_RANGE);
  const cornerAngleThresholdRad = options.cornerAngleThresholdRad ?? Math.PI / 6;
  const segments = buildColoredSegments(contours, cornerAngleThresholdRad);
  const rgba = new Uint8ClampedArray(width * height * 4);
  const unitRange = pxRange / width;

  if (segments.length === 0) {
    return { char, width, height, pxRange, rgba, contourCount: contours.length, coloredEdgeCount: 0 };
  }

  for (let iy = 0; iy < height; iy += 1) {
    const py = (iy + 0.5) / height;
    for (let ix = 0; ix < width; ix += 1) {
      const px = (ix + 0.5) / width;
      const bestR: ChannelCandidate = { absDist: Infinity, ortho: -1, pseudoDist: -1 };
      const bestG: ChannelCandidate = { absDist: Infinity, ortho: -1, pseudoDist: -1 };
      const bestB: ChannelCandidate = { absDist: Infinity, ortho: -1, pseudoDist: -1 };
      let trueMinDist = Infinity;

      for (let s = 0; s < segments.length; s += 1) {
        const seg = segments[s];
        if (!seg) continue;
        const apx = px - seg.ax;
        const apy = py - seg.ay;
        const tRaw = (apx * seg.dx + apy * seg.dy) / seg.lenSq;
        const t = tRaw < 0 ? 0 : tRaw > 1 ? 1 : tRaw;
        const absDist = Math.hypot(px - (seg.ax + t * seg.dx), py - (seg.ay + t * seg.dy));
        const crossVal = seg.dirX * apy - seg.dirY * apx;
        const signedDist = (crossVal >= 0 ? 1 : -1) * absDist;
        const ortho = absDist > 1e-10 ? Math.abs(crossVal) / absDist : 1;
        const pseudoDist = t > 0 && t < 1 ? signedDist : crossVal;

        if (absDist < trueMinDist) trueMinDist = absDist;
        if ((seg.colorMask & 0b100) !== 0) updateChannelCandidate(bestR, absDist, ortho, pseudoDist);
        if ((seg.colorMask & 0b010) !== 0) updateChannelCandidate(bestG, absDist, ortho, pseudoDist);
        if ((seg.colorMask & 0b001) !== 0) updateChannelCandidate(bestB, absDist, ortho, pseudoDist);
      }

      const inside = isPointInsideContours(px, py, contours);
      const trueSignedDist = (inside ? 1 : -1) * trueMinDist;
      let rDist = bestR.pseudoDist;
      let gDist = bestG.pseudoDist;
      let bDist = bestB.pseudoDist;
      const med = median3(rDist, gDist, bDist);
      if ((med > 0) !== inside && Math.abs(med) > 1e-5) {
        rDist = trueSignedDist;
        gDist = trueSignedDist;
        bDist = trueSignedDist;
      }

      const outIdx = (iy * width + ix) * 4;
      rgba[outIdx] = Math.round(clamp(rDist / unitRange + 0.5, 0, 1) * 255);
      rgba[outIdx + 1] = Math.round(clamp(gDist / unitRange + 0.5, 0, 1) * 255);
      rgba[outIdx + 2] = Math.round(clamp(bDist / unitRange + 0.5, 0, 1) * 255);
      rgba[outIdx + 3] = Math.round(clamp(trueSignedDist / unitRange + 0.5, 0, 1) * 255);
    }
  }

  return { char, width, height, pxRange, rgba, contourCount: contours.length, coloredEdgeCount: segments.length };
}

function makeCcwRect(x0: number, y0: number, x1: number, y1: number): MsdfContour {
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
}

function makeCwHoleRect(x0: number, y0: number, x1: number, y1: number): MsdfContour {
  return [{ x: x0, y: y0 }, { x: x0, y: y1 }, { x: x1, y: y1 }, { x: x1, y: y0 }];
}

type JamoBoxKind = "giyeok" | "nieun" | "mieum" | "ieung" | "digeut" | "kiyeok" | "bar-v" | "bar-h";

function appendJamoBoxContours(
  out: MsdfContour[],
  kind: JamoBoxKind,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const w = x1 - x0;
  const h = y1 - y0;
  const t = Math.min(w, h) * 0.24;
  switch (kind) {
    case "giyeok":
      out.push([
        { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 },
        { x: x1 - t, y: y1 }, { x: x1 - t, y: y0 + t }, { x: x0, y: y0 + t },
      ]);
      break;
    case "nieun":
      out.push([
        { x: x0, y: y0 }, { x: x0 + t, y: y0 }, { x: x0 + t, y: y1 - t },
        { x: x1, y: y1 - t }, { x: x1, y: y1 }, { x: x0, y: y1 },
      ]);
      break;
    case "digeut":
      out.push([
        { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y0 + t },
        { x: x0 + t, y: y0 + t }, { x: x0 + t, y: y1 - t }, { x: x1, y: y1 - t },
        { x: x1, y: y1 }, { x: x0, y: y1 },
      ]);
      break;
    case "kiyeok":
      appendJamoBoxContours(out, "giyeok", x0, y0, x1, y1);
      out.push(makeCcwRect(x0 + t * 0.2, y0 + h * 0.44, x1 - t * 1.15, y0 + h * 0.44 + t * 0.85));
      break;
    case "mieum":
    case "ieung":
      out.push(makeCcwRect(x0, y0, x1, y1));
      out.push(makeCwHoleRect(x0 + t, y0 + t, x1 - t, y1 - t));
      break;
    case "bar-v": {
      const cx = x0 + w * 0.5;
      out.push(makeCcwRect(cx - t * 0.55, y0, cx + t * 0.55, y1));
      break;
    }
    case "bar-h": {
      const cy = y0 + h * 0.5;
      out.push(makeCcwRect(x0, cy - t * 0.55, x1, cy + t * 0.55));
      break;
    }
  }
}

/**
 * 한국어 한글 음절(U+AC00~U+D7A3)·자모·SFX 기호·ASCII용 결정적 벡터 윤곽선을 합성한다.
 */
export function buildKoreanGlyphContours(char: string): readonly MsdfContour[] {
  const code = char.codePointAt(0) ?? 0x20;
  const contours: MsdfContour[] = [];

  if (code >= 0xac00 && code <= 0xd7a3) {
    const syllable = code - 0xac00;
    const choseong = Math.floor(syllable / 588);
    const jungseong = Math.floor((syllable % 588) / 28);
    const jongseong = syllable % 28;
    const hasBatchim = jongseong > 0;
    const horizontalVowel =
      jungseong === 8 || jungseong === 12 || jungseong === 13 || jungseong === 17 || jungseong === 18;
    const bodyBottom = hasBatchim ? 0.62 : 0.88;

    const choPalette: readonly JamoBoxKind[] = [
      "giyeok", "giyeok", "nieun", "digeut", "digeut", "digeut", "mieum", "mieum", "mieum",
      "giyeok", "giyeok", "ieung", "giyeok", "giyeok", "kiyeok", "kiyeok", "digeut", "mieum", "ieung",
    ];
    const choKind = choPalette[choseong] ?? "mieum";

    if (horizontalVowel) {
      appendJamoBoxContours(contours, choKind, 0.22, 0.12, 0.78, bodyBottom * 0.66);
      appendJamoBoxContours(contours, "bar-h", 0.14, bodyBottom * 0.7, 0.86, bodyBottom);
    } else {
      appendJamoBoxContours(contours, choKind, 0.14, 0.12, 0.56, bodyBottom);
      appendJamoBoxContours(contours, "bar-v", 0.64, 0.12, 0.86, bodyBottom);
    }
    if (hasBatchim) {
      const jongKind = jongseong % 3 === 0 ? "ieung" : jongseong % 3 === 1 ? "giyeok" : "nieun";
      appendJamoBoxContours(contours, jongKind, 0.2, 0.68, 0.8, 0.9);
    }
    return contours;
  }

  if (char === "!") {
    contours.push(makeCcwRect(0.42, 0.12, 0.58, 0.66));
    contours.push(makeCcwRect(0.42, 0.74, 0.58, 0.88));
    return contours;
  }
  if (char === "ㄱ") {
    appendJamoBoxContours(contours, "giyeok", 0.16, 0.16, 0.84, 0.84);
    return contours;
  }
  if (char === "ㄴ" || char === "L") {
    appendJamoBoxContours(contours, "nieun", 0.16, 0.16, 0.84, 0.84);
    return contours;
  }
  if (char === "ㅁ" || char === "O" || char === "0") {
    appendJamoBoxContours(contours, "mieum", 0.16, 0.16, 0.84, 0.84);
    return contours;
  }
  appendJamoBoxContours(contours, code % 2 === 0 ? "digeut" : "giyeok", 0.18, 0.16, 0.82, 0.84);
  return contours;
}

/**
 * 한국어 한글·ASCII MSDF 글리프 아틀라스 슬롯 패커.
 */
export class MsdfGlyphAtlas {
  readonly atlasWidth: number;
  readonly atlasHeight: number;
  readonly tileSize: number;
  readonly paddingPx: number;
  readonly pxRange: number;
  readonly cellStridePx: number;
  readonly cols: number;
  readonly rows: number;
  readonly capacity: number;
  readonly rgba: Uint8ClampedArray;

  private readonly slots = new Map<string, MsdfAtlasSlot>();
  private readonly tiles = new Map<string, MsdfGlyphTile>();
  private nextSlotIndex = 0;

  constructor(options: MsdfAtlasOptions = {}) {
    this.atlasWidth = Math.max(64, Math.round(options.atlasWidth ?? DEFAULT_MSDF_ATLAS_WIDTH));
    this.atlasHeight = Math.max(64, Math.round(options.atlasHeight ?? DEFAULT_MSDF_ATLAS_HEIGHT));
    this.tileSize = Math.max(8, Math.round(options.tileSize ?? DEFAULT_MSDF_TILE_SIZE));
    this.paddingPx = Math.max(0, Math.round(options.paddingPx ?? DEFAULT_MSDF_PADDING_PX));
    this.pxRange = Math.max(1, options.pxRange ?? DEFAULT_MSDF_PX_RANGE);
    this.cellStridePx = this.tileSize + this.paddingPx * 2;
    this.cols = Math.max(1, Math.floor(this.atlasWidth / this.cellStridePx));
    this.rows = Math.max(1, Math.floor(this.atlasHeight / this.cellStridePx));
    this.capacity = this.cols * this.rows;
    this.rgba = new Uint8ClampedArray(this.atlasWidth * this.atlasHeight * 4);
  }

  ensureGlyph(char: string, customContours?: readonly MsdfContour[]): MsdfAtlasSlot {
    const existing = this.slots.get(char);
    if (existing) return existing;
    if (this.nextSlotIndex >= this.capacity) {
      throw new Error(`MSDF 글리프 아틀라스 용량(${this.capacity}슬롯)을 초과했습니다.`);
    }

    const contours = customContours ?? buildKoreanGlyphContours(char);
    const tile = generateGlyphMsdfTile(char, contours, {
      tileSize: this.tileSize,
      pxRange: this.pxRange,
    });

    const slotIndex = this.nextSlotIndex;
    this.nextSlotIndex += 1;
    const col = slotIndex % this.cols;
    const row = Math.floor(slotIndex / this.cols);
    const pixelX = col * this.cellStridePx + this.paddingPx;
    const pixelY = row * this.cellStridePx + this.paddingPx;

    for (let y = 0; y < this.tileSize; y += 1) {
      const srcRowOffset = y * this.tileSize * 4;
      const dstRowOffset = ((pixelY + y) * this.atlasWidth + pixelX) * 4;
      this.rgba.set(tile.rgba.subarray(srcRowOffset, srcRowOffset + this.tileSize * 4), dstRowOffset);
    }

    const code = char.codePointAt(0) ?? 0x20;
    const isHangul = (code >= 0xac00 && code <= 0xd7a3) || (code >= 0x3131 && code <= 0x318e);
    const slot: MsdfAtlasSlot = {
      char,
      slotIndex,
      pixelX,
      pixelY,
      tileWidth: this.tileSize,
      tileHeight: this.tileSize,
      u0: pixelX / this.atlasWidth,
      v0: pixelY / this.atlasHeight,
      u1: (pixelX + this.tileSize) / this.atlasWidth,
      v1: (pixelY + this.tileSize) / this.atlasHeight,
      pxRange: this.pxRange,
      advanceEm: isHangul ? 1.0 : 0.62,
    };

    this.slots.set(char, slot);
    this.tiles.set(char, tile);
    return slot;
  }

  ensureText(text: string): readonly MsdfAtlasSlot[] {
    const packed: MsdfAtlasSlot[] = [];
    for (const ch of text) {
      if (ch.trim().length === 0) continue;
      packed.push(this.ensureGlyph(ch));
    }
    return packed;
  }

  getSlot(char: string): MsdfAtlasSlot | undefined {
    return this.slots.get(char);
  }

  getTile(char: string): MsdfGlyphTile | undefined {
    return this.tiles.get(char);
  }

  getStats(): MsdfAtlasStats {
    return {
      atlasWidth: this.atlasWidth,
      atlasHeight: this.atlasHeight,
      tileSize: this.tileSize,
      paddingPx: this.paddingPx,
      cellStridePx: this.cellStridePx,
      cols: this.cols,
      rows: this.rows,
      capacity: this.capacity,
      packedCount: this.slots.size,
      occupancyRatio: this.capacity > 0 ? this.slots.size / this.capacity : 0,
      bytesAllocated: this.rgba.byteLength,
    };
  }
}
