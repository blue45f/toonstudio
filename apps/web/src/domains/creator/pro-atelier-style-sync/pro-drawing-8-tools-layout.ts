/**
 * 전문가 드로잉 8선 — 변형 · 컷 분할 · 공유 코드 · 특수 스냅 자 모듈.
 *
 * 4. 핀 기반 퍼펫 워프(IDW) & 4×4 메쉬 자유 변형 (`evaluatePuppetAndMeshWarp`)
 * 6. 1획 컷 테두리 분할 & 말풍선 꼬리 화자 자동 추적 (`sliceFrameAndTrackSpeechTail`)
 * 7. 팀 공유 브러시 URL-safe 코드 인코더/디코더 (`encodeTeamBrushShareCode`, `decodeTeamBrushShareCode`)
 * 8. 등각 30° · 360° 파노라마(등장방형) · 픽셀 격자 스냅 자 (`snapPointToSpecialtyRuler`)
 */

import {
  clampNumber,
  normalizeHueDeg,
  roundToDigits,
  type Point2D,
  type RectBounds,
} from "./pro-drawing-8-tools-color";

// ============================================================================
// 4. 핀 기반 퍼펫 워프(IDW) & 4×4 메쉬 자유 변형
// ============================================================================

export interface PuppetPin {
  readonly id: string;
  readonly anchor: Point2D;
  readonly target: Point2D;
  readonly radius?: number;
  readonly stiffness?: number;
}

export interface PuppetMeshWarpInput {
  readonly vertices: ReadonlyArray<Point2D>;
  readonly bounds: RectBounds;
  readonly pins: ReadonlyArray<PuppetPin>;
  readonly meshOffsets?: ReadonlyArray<Point2D>;
  readonly idwPower?: number;
}

export interface PuppetMeshWarpResult {
  readonly vertices: readonly Point2D[];
  readonly maxDisplacementPx: number;
  readonly meanDisplacementPx: number;
  readonly pinCount: number;
  readonly activeMeshHandles: number;
}

function cubicBernstein(index: number, t: number): number {
  const omt = 1 - t;
  if (index === 0) return omt * omt * omt;
  if (index === 1) return 3 * t * omt * omt;
  if (index === 2) return 3 * t * t * omt;
  return t * t * t;
}

export function evaluatePuppetAndMeshWarp(input: PuppetMeshWarpInput): PuppetMeshWarpResult {
  const power = clampNumber(input.idwPower ?? 2, 1, 4);
  const safeW = Math.max(1e-6, input.bounds.width);
  const safeH = Math.max(1e-6, input.bounds.height);
  const offsets: readonly Point2D[] =
    input.meshOffsets && input.meshOffsets.length === 16
      ? input.meshOffsets
      : Array.from({ length: 16 }, () => ({ x: 0, y: 0 }));

  const activeMeshHandles = offsets.filter((o) => Math.hypot(o.x, o.y) > 1e-4).length;
  let maxDisp = 0;
  let sumDisp = 0;

  const warped: Point2D[] = input.vertices.map((vertex) => {
    let pinDx = 0;
    let pinDy = 0;

    if (input.pins.length === 1) {
      const pin = input.pins[0];
      const dist = Math.hypot(vertex.x - pin.anchor.x, vertex.y - pin.anchor.y);
      const r = Math.max(1, pin.radius ?? Math.hypot(safeW, safeH) * 0.45);
      const weight = Math.exp(-(dist * dist) / (2 * r * r));
      pinDx = (pin.target.x - pin.anchor.x) * weight;
      pinDy = (pin.target.y - pin.anchor.y) * weight;
    } else if (input.pins.length > 1) {
      let exactHit: PuppetPin | null = null;
      let weightSum = 0;
      let accDx = 0;
      let accDy = 0;
      for (const pin of input.pins) {
        const dist = Math.hypot(vertex.x - pin.anchor.x, vertex.y - pin.anchor.y);
        if (dist <= 1e-6) {
          exactHit = pin;
          break;
        }
        const stiffness = clampNumber(pin.stiffness ?? 1, 0.1, 10);
        const w = stiffness / dist ** power;
        weightSum += w;
        accDx += w * (pin.target.x - pin.anchor.x);
        accDy += w * (pin.target.y - pin.anchor.y);
      }
      if (exactHit) {
        pinDx = exactHit.target.x - exactHit.anchor.x;
        pinDy = exactHit.target.y - exactHit.anchor.y;
      } else if (weightSum > 0) {
        pinDx = accDx / weightSum;
        pinDy = accDy / weightSum;
      }
    }

    const u = clampNumber((vertex.x - input.bounds.x) / safeW, 0, 1);
    const v = clampNumber((vertex.y - input.bounds.y) / safeH, 0, 1);
    let meshDx = 0;
    let meshDy = 0;
    for (let row = 0; row < 4; row += 1) {
      const bv = cubicBernstein(row, v);
      for (let col = 0; col < 4; col += 1) {
        const weight = cubicBernstein(col, u) * bv;
        const offset = offsets[row * 4 + col];
        meshDx += weight * offset.x;
        meshDy += weight * offset.y;
      }
    }

    const totalDx = pinDx + meshDx;
    const totalDy = pinDy + meshDy;
    const disp = Math.hypot(totalDx, totalDy);
    if (disp > maxDisp) maxDisp = disp;
    sumDisp += disp;

    return {
      x: roundToDigits(vertex.x + totalDx, 3),
      y: roundToDigits(vertex.y + totalDy, 3),
    };
  });

  return {
    vertices: warped,
    maxDisplacementPx: roundToDigits(maxDisp, 3),
    meanDisplacementPx:
      input.vertices.length > 0 ? roundToDigits(sumDisp / input.vertices.length, 3) : 0,
    pinCount: input.pins.length,
    activeMeshHandles,
  };
}

// ============================================================================
// 6. 1획 컷 테두리 분할 & 말풍선 꼬리 화자 자동 추적
// ============================================================================

export interface SpeechBubbleGeometry {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

export interface FrameSliceAndSpeechTailInput {
  readonly frame: RectBounds;
  readonly cutLine: { readonly start: Point2D; readonly end: Point2D };
  readonly gutterPx: number;
  readonly bubble: SpeechBubbleGeometry;
  readonly speakerMouth: Point2D;
  readonly tailBaseWidthPx?: number;
}

export interface SlicedFramePolygon {
  readonly vertices: readonly Point2D[];
  readonly area: number;
  readonly bounds: RectBounds;
}

export interface SpeechTailGeometry {
  readonly baseCenter: Point2D;
  readonly baseLeft: Point2D;
  readonly baseRight: Point2D;
  readonly tip: Point2D;
  readonly angleDeg: number;
  readonly tailLengthPx: number;
  readonly mouthInsideBubble: boolean;
}

export interface FrameSliceAndSpeechTailResult {
  readonly didSplit: boolean;
  readonly gutterPx: number;
  readonly originalArea: number;
  readonly firstFrame: SlicedFramePolygon;
  readonly secondFrame: SlicedFramePolygon;
  readonly speechTail: SpeechTailGeometry;
}

function clipPolygonHalfPlane(
  polygon: ReadonlyArray<Point2D>,
  signedDistance: (p: Point2D) => number,
): Point2D[] {
  const output: Point2D[] = [];
  if (polygon.length === 0) return output;
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const dCurr = signedDistance(current);
    const dNext = signedDistance(next);
    const currIn = dCurr >= -1e-7;
    const nextIn = dNext >= -1e-7;

    if (currIn && nextIn) {
      output.push(next);
    } else if (currIn && !nextIn) {
      const denom = dCurr - dNext;
      const t = Math.abs(denom) < 1e-12 ? 0 : dCurr / denom;
      output.push({
        x: roundToDigits(current.x + t * (next.x - current.x), 3),
        y: roundToDigits(current.y + t * (next.y - current.y), 3),
      });
    } else if (!currIn && nextIn) {
      const denom = dCurr - dNext;
      const t = Math.abs(denom) < 1e-12 ? 0 : dCurr / denom;
      output.push({
        x: roundToDigits(current.x + t * (next.x - current.x), 3),
        y: roundToDigits(current.y + t * (next.y - current.y), 3),
      });
      output.push(next);
    }
  }
  return output;
}

function polygonArea(vertices: ReadonlyArray<Point2D>): number {
  if (vertices.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < vertices.length; i += 1) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return roundToDigits(Math.abs(sum) * 0.5, 2);
}

function polygonBounds(vertices: ReadonlyArray<Point2D>): RectBounds {
  if (vertices.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }
  return {
    x: roundToDigits(minX, 3),
    y: roundToDigits(minY, 3),
    width: roundToDigits(maxX - minX, 3),
    height: roundToDigits(maxY - minY, 3),
  };
}

export function sliceFrameAndTrackSpeechTail(
  input: FrameSliceAndSpeechTailInput,
): FrameSliceAndSpeechTailResult {
  const { frame, cutLine, bubble, speakerMouth } = input;
  const gutterPx = Math.max(0, input.gutterPx);
  const rectPoly: readonly Point2D[] = [
    { x: frame.x, y: frame.y },
    { x: frame.x + frame.width, y: frame.y },
    { x: frame.x + frame.width, y: frame.y + frame.height },
    { x: frame.x, y: frame.y + frame.height },
  ];
  const originalArea = roundToDigits(frame.width * frame.height, 2);

  const ldx = cutLine.end.x - cutLine.start.x;
  const ldy = cutLine.end.y - cutLine.start.y;
  const lineLen = Math.hypot(ldx, ldy);

  let polyA: Point2D[] = [...rectPoly];
  let polyB: Point2D[] = [];

  if (lineLen > 1e-6) {
    const nx = -ldy / lineLen;
    const ny = ldx / lineLen;
    const halfGutter = gutterPx * 0.5;
    polyA = clipPolygonHalfPlane(
      rectPoly,
      (p) => (p.x - cutLine.start.x) * nx + (p.y - cutLine.start.y) * ny - halfGutter,
    );
    polyB = clipPolygonHalfPlane(
      rectPoly,
      (p) => -((p.x - cutLine.start.x) * nx + (p.y - cutLine.start.y) * ny) - halfGutter,
    );
  }

  const areaA = polygonArea(polyA);
  const areaB = polygonArea(polyB);

  const rx = Math.max(4, bubble.rx);
  const ry = Math.max(4, bubble.ry);
  const vx = speakerMouth.x - bubble.cx;
  const vy = speakerMouth.y - bubble.cy;
  const dist = Math.hypot(vx, vy);
  const ellipseNorm = Math.hypot(vx / rx, vy / ry);
  const mouthInsideBubble = ellipseNorm <= 1;

  const dirX = dist > 1e-6 ? vx / dist : 0;
  const dirY = dist > 1e-6 ? vy / dist : 1;
  const perpX = -dirY;
  const perpY = dirX;

  const tEdge = ellipseNorm > 1e-6 ? 1 / ellipseNorm : 1;
  const baseCenter: Point2D = mouthInsideBubble
    ? { x: roundToDigits(bubble.cx, 2), y: roundToDigits(bubble.cy + ry, 2) }
    : { x: roundToDigits(bubble.cx + vx * tEdge, 2), y: roundToDigits(bubble.cy + vy * tEdge, 2) };

  const baseHalfW = clampNumber(input.tailBaseWidthPx ?? 18, 4, Math.min(rx, ry)) * 0.5;
  const baseLeft: Point2D = {
    x: roundToDigits(baseCenter.x + perpX * baseHalfW, 2),
    y: roundToDigits(baseCenter.y + perpY * baseHalfW, 2),
  };
  const baseRight: Point2D = {
    x: roundToDigits(baseCenter.x - perpX * baseHalfW, 2),
    y: roundToDigits(baseCenter.y - perpY * baseHalfW, 2),
  };

  const edgeToMouth = Math.hypot(speakerMouth.x - baseCenter.x, speakerMouth.y - baseCenter.y);
  const clearance = mouthInsideBubble ? 0 : Math.min(8, edgeToMouth * 0.2);
  const tip: Point2D = mouthInsideBubble
    ? { x: roundToDigits(speakerMouth.x, 2), y: roundToDigits(speakerMouth.y, 2) }
    : {
        x: roundToDigits(speakerMouth.x - dirX * clearance, 2),
        y: roundToDigits(speakerMouth.y - dirY * clearance, 2),
      };

  const angleDeg = roundToDigits(normalizeHueDeg((Math.atan2(dirY, dirX) * 180) / Math.PI), 2);
  const tailLengthPx = roundToDigits(Math.hypot(tip.x - baseCenter.x, tip.y - baseCenter.y), 2);

  return {
    didSplit: areaA > 0 && areaB > 0,
    gutterPx,
    originalArea,
    firstFrame: { vertices: polyA, area: areaA, bounds: polygonBounds(polyA) },
    secondFrame: { vertices: polyB, area: areaB, bounds: polygonBounds(polyB) },
    speechTail: { baseCenter, baseLeft, baseRight, tip, angleDeg, tailLengthPx, mouthInsideBubble },
  };
}

// ============================================================================
// 7. 팀 공유 브러시 커스텀 스튜디오 코드 인코더 / 디코더
// ============================================================================

export type PaperGrainPattern = "smooth" | "cold-press" | "rough-cotton" | "screentone-dot";
export type DualTipShape = "round" | "flat-nib" | "bristle" | "charcoal-grain";
export type DualTipBlendMode = "multiply" | "subtract" | "overlay";

export interface TeamBrushSharePreset {
  readonly version: 1;
  readonly name: string;
  readonly baseSizePx: number;
  readonly spacing: number;
  readonly pressureCurve: readonly [Point2D, Point2D, Point2D, Point2D];
  readonly paperGrain: {
    readonly pattern: PaperGrainPattern;
    readonly depth: number;
    readonly scale: number;
  };
  readonly dualTip: {
    readonly enabled: boolean;
    readonly shape: DualTipShape;
    readonly blendMode: DualTipBlendMode;
    readonly scatter: number;
    readonly rotationJitterDeg: number;
  };
}

export type TeamBrushDecodeErrorCode =
  | "INVALID_PREFIX"
  | "CHECKSUM_MISMATCH"
  | "MALFORMED_PAYLOAD"
  | "INVALID_SCHEMA";

export type TeamBrushDecodeResult =
  | { readonly ok: true; readonly preset: TeamBrushSharePreset; readonly checksum: string }
  | { readonly ok: false; readonly errorCode: TeamBrushDecodeErrorCode; readonly messageKo: string };

const SHARE_CODE_PREFIX = "TSB1-";
const VALID_PATTERNS: ReadonlySet<string> = new Set(["smooth", "cold-press", "rough-cotton", "screentone-dot"]);
const VALID_SHAPES: ReadonlySet<string> = new Set(["round", "flat-nib", "bristle", "charcoal-grain"]);
const VALID_BLENDS: ReadonlySet<string> = new Set(["multiply", "subtract", "overlay"]);
const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function fnv1aHex32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    const b1 = has1 ? bytes[i + 1] : 0;
    const b2 = has2 ? bytes[i + 2] : 0;
    out += BASE64URL_ALPHABET[(b0 >> 2) & 0x3f];
    out += BASE64URL_ALPHABET[((b0 & 0x03) << 4) | ((b1 >> 4) & 0x0f)];
    if (has1) out += BASE64URL_ALPHABET[((b1 & 0x0f) << 2) | ((b2 >> 6) & 0x03)];
    if (has2) out += BASE64URL_ALPHABET[b2 & 0x3f];
  }
  return out;
}

function base64UrlToBytes(encoded: string): Uint8Array | null {
  if (encoded.length === 0 || encoded.length % 4 === 1) return null;
  const output: number[] = [];
  for (let i = 0; i < encoded.length; i += 4) {
    const c0 = BASE64URL_ALPHABET.indexOf(encoded[i]);
    const c1 = BASE64URL_ALPHABET.indexOf(encoded[i + 1]);
    const has2 = i + 2 < encoded.length;
    const has3 = i + 3 < encoded.length;
    const c2 = has2 ? BASE64URL_ALPHABET.indexOf(encoded[i + 2]) : 0;
    const c3 = has3 ? BASE64URL_ALPHABET.indexOf(encoded[i + 3]) : 0;
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) return null;
    output.push((c0 << 2) | (c1 >> 4));
    if (has2) output.push(((c1 & 0x0f) << 4) | (c2 >> 2));
    if (has3) output.push(((c2 & 0x03) << 6) | c3);
  }
  return Uint8Array.from(output);
}

function isPoint01(value: unknown): value is Point2D {
  if (typeof value !== "object" || value === null) return false;
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.x === "number" &&
    typeof rec.y === "number" &&
    Number.isFinite(rec.x) &&
    Number.isFinite(rec.y) &&
    rec.x >= 0 &&
    rec.x <= 1 &&
    rec.y >= 0 &&
    rec.y <= 1
  );
}

export function encodeTeamBrushShareCode(preset: TeamBrushSharePreset): string {
  const canonical: TeamBrushSharePreset = {
    version: 1,
    name: preset.name.trim() || "스튜디오 커스텀 브러시",
    baseSizePx: roundToDigits(clampNumber(preset.baseSizePx, 1, 500), 2),
    spacing: roundToDigits(clampNumber(preset.spacing, 0.01, 2), 3),
    pressureCurve: [
      { x: roundToDigits(clampNumber(preset.pressureCurve[0].x, 0, 1), 3), y: roundToDigits(clampNumber(preset.pressureCurve[0].y, 0, 1), 3) },
      { x: roundToDigits(clampNumber(preset.pressureCurve[1].x, 0, 1), 3), y: roundToDigits(clampNumber(preset.pressureCurve[1].y, 0, 1), 3) },
      { x: roundToDigits(clampNumber(preset.pressureCurve[2].x, 0, 1), 3), y: roundToDigits(clampNumber(preset.pressureCurve[2].y, 0, 1), 3) },
      { x: roundToDigits(clampNumber(preset.pressureCurve[3].x, 0, 1), 3), y: roundToDigits(clampNumber(preset.pressureCurve[3].y, 0, 1), 3) },
    ],
    paperGrain: {
      pattern: preset.paperGrain.pattern,
      depth: roundToDigits(clampNumber(preset.paperGrain.depth, 0, 1), 3),
      scale: roundToDigits(clampNumber(preset.paperGrain.scale, 0.25, 4), 3),
    },
    dualTip: {
      enabled: Boolean(preset.dualTip.enabled),
      shape: preset.dualTip.shape,
      blendMode: preset.dualTip.blendMode,
      scatter: roundToDigits(clampNumber(preset.dualTip.scatter, 0, 1), 3),
      rotationJitterDeg: roundToDigits(clampNumber(preset.dualTip.rotationJitterDeg, 0, 360), 1),
    },
  };
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(canonical)));
  return `${SHARE_CODE_PREFIX}${payload}.${fnv1aHex32(payload)}`;
}

export function decodeTeamBrushShareCode(code: string): TeamBrushDecodeResult {
  const trimmed = code.trim();
  if (!trimmed.startsWith(SHARE_CODE_PREFIX)) {
    return { ok: false, errorCode: "INVALID_PREFIX", messageKo: "공유 코드는 TSB1- 접두어로 시작해야 합니다." };
  }
  const body = trimmed.slice(SHARE_CODE_PREFIX.length);
  const dotIndex = body.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === body.length - 1) {
    return { ok: false, errorCode: "MALFORMED_PAYLOAD", messageKo: "공유 코드 형식이 손상되었습니다." };
  }
  const payload = body.slice(0, dotIndex);
  const checksum = body.slice(dotIndex + 1);
  if (fnv1aHex32(payload) !== checksum) {
    return { ok: false, errorCode: "CHECKSUM_MISMATCH", messageKo: "체크섬 검증에 실패했습니다. 코드 일부가 누락되었거나 변조되었습니다." };
  }
  const bytes = base64UrlToBytes(payload);
  if (!bytes) {
    return { ok: false, errorCode: "MALFORMED_PAYLOAD", messageKo: "Base64URL 데이터를 복원할 수 없습니다." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { ok: false, errorCode: "MALFORMED_PAYLOAD", messageKo: "브러시 JSON 구조가 올바르지 않습니다." };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, errorCode: "INVALID_SCHEMA", messageKo: "브러시 프리셋 객체 형식이 아닙니다." };
  }
  const rec = parsed as Record<string, unknown>;
  const curve = rec.pressureCurve;
  const grain = rec.paperGrain as Record<string, unknown> | undefined;
  const dual = rec.dualTip as Record<string, unknown> | undefined;

  const valid =
    rec.version === 1 &&
    typeof rec.name === "string" &&
    rec.name.trim().length > 0 &&
    typeof rec.baseSizePx === "number" &&
    rec.baseSizePx >= 1 &&
    rec.baseSizePx <= 500 &&
    typeof rec.spacing === "number" &&
    rec.spacing >= 0.01 &&
    rec.spacing <= 2 &&
    Array.isArray(curve) &&
    curve.length === 4 &&
    curve.every(isPoint01) &&
    typeof grain === "object" &&
    grain !== null &&
    typeof grain.pattern === "string" &&
    VALID_PATTERNS.has(grain.pattern) &&
    typeof grain.depth === "number" &&
    grain.depth >= 0 &&
    grain.depth <= 1 &&
    typeof grain.scale === "number" &&
    grain.scale >= 0.25 &&
    grain.scale <= 4 &&
    typeof dual === "object" &&
    dual !== null &&
    typeof dual.enabled === "boolean" &&
    typeof dual.shape === "string" &&
    VALID_SHAPES.has(dual.shape) &&
    typeof dual.blendMode === "string" &&
    VALID_BLENDS.has(dual.blendMode) &&
    typeof dual.scatter === "number" &&
    dual.scatter >= 0 &&
    dual.scatter <= 1 &&
    typeof dual.rotationJitterDeg === "number" &&
    dual.rotationJitterDeg >= 0 &&
    dual.rotationJitterDeg <= 360;

  if (!valid) {
    return { ok: false, errorCode: "INVALID_SCHEMA", messageKo: "브러시 파라미터 범위 또는 필수 필드가 규격을 벗어났습니다." };
  }
  return { ok: true, preset: parsed as TeamBrushSharePreset, checksum };
}

// ============================================================================
// 8. 등각 30° · 360° 파노라마(등장방형) · 픽셀 아트 격자 특수 스냅 자
// ============================================================================

export type SpecialtyRulerMode = "isometric-30" | "panorama-360" | "pixel-grid";

export interface SpecialtyRulerSnapInput {
  readonly point: Point2D;
  readonly mode: SpecialtyRulerMode;
  readonly origin?: Point2D;
  readonly gridSize?: number;
  readonly canvasWidth?: number;
  readonly canvasHeight?: number;
  readonly panoramaStepDeg?: number;
  readonly anchorPoint?: Point2D;
}

export interface SpecialtyRulerSnapResult {
  readonly mode: SpecialtyRulerMode;
  readonly input: Point2D;
  readonly snapped: Point2D;
  readonly snapDistancePx: number;
  readonly lockedAngleDeg: number;
  readonly gridCoord: { readonly u: number; readonly v: number };
  readonly panoramaMetadata?: {
    readonly longitudeDeg: number;
    readonly latitudeDeg: number;
    readonly equirectangularStretch: number;
  };
}

const ISO_COS_30 = Math.sqrt(3) / 2;
const ISO_SIN_30 = 0.5;
const ISO_RAY_ANGLES = [30, 90, 150] as const;

export function snapPointToSpecialtyRuler(input: SpecialtyRulerSnapInput): SpecialtyRulerSnapResult {
  const origin = input.origin ?? { x: 0, y: 0 };

  if (input.mode === "pixel-grid") {
    const cell = Math.max(1, Math.round(input.gridSize ?? 16));
    const col = Math.floor((input.point.x - origin.x) / cell);
    const row = Math.floor((input.point.y - origin.y) / cell);
    const snapped: Point2D = {
      x: roundToDigits(origin.x + col * cell, 3),
      y: roundToDigits(origin.y + row * cell, 3),
    };
    return {
      mode: "pixel-grid",
      input: input.point,
      snapped,
      snapDistancePx: roundToDigits(Math.hypot(snapped.x - input.point.x, snapped.y - input.point.y), 3),
      lockedAngleDeg: 0,
      gridCoord: { u: col, v: row },
    };
  }

  if (input.mode === "panorama-360") {
    const canvasW = Math.max(64, input.canvasWidth ?? 2048);
    const canvasH = Math.max(32, input.canvasHeight ?? 1024);
    const stepDeg = clampNumber(input.panoramaStepDeg ?? 15, 1, 90);
    const rawLon = (clampNumber(input.point.x, 0, canvasW) / canvasW) * 360 - 180;
    const rawLat = 90 - (clampNumber(input.point.y, 0, canvasH) / canvasH) * 180;
    const snappedLon = clampNumber(Math.round(rawLon / stepDeg) * stepDeg, -180, 180);
    const snappedLat = clampNumber(Math.round(rawLat / stepDeg) * stepDeg, -90, 90);

    const snapped: Point2D = {
      x: roundToDigits(((snappedLon + 180) / 360) * canvasW, 3),
      y: roundToDigits(((90 - snappedLat) / 180) * canvasH, 3),
    };
    const equirectangularStretch = roundToDigits(
      1 / Math.max(0.15, Math.cos((snappedLat * Math.PI) / 180)),
      3,
    );
    return {
      mode: "panorama-360",
      input: input.point,
      snapped,
      snapDistancePx: roundToDigits(Math.hypot(snapped.x - input.point.x, snapped.y - input.point.y), 3),
      lockedAngleDeg: roundToDigits(normalizeHueDeg(snappedLon), 1),
      gridCoord: { u: Math.round(snappedLon / stepDeg), v: Math.round(snappedLat / stepDeg) },
      panoramaMetadata: {
        longitudeDeg: roundToDigits(snappedLon, 2),
        latitudeDeg: roundToDigits(snappedLat, 2),
        equirectangularStretch,
      },
    };
  }

  const gridSize = Math.max(2, input.gridSize ?? 32);
  if (input.anchorPoint) {
    const dx = input.point.x - input.anchorPoint.x;
    const dy = input.point.y - input.anchorPoint.y;
    let bestPoint: Point2D = input.anchorPoint;
    let bestDist = Infinity;
    let bestAngle = 30;
    for (const deg of ISO_RAY_ANGLES) {
      const rad = (deg * Math.PI) / 180;
      const ux = Math.cos(rad);
      const uy = Math.sin(rad);
      const snappedProj = Math.round((dx * ux + dy * uy) / gridSize) * gridSize;
      const cand: Point2D = {
        x: roundToDigits(input.anchorPoint.x + snappedProj * ux, 3),
        y: roundToDigits(input.anchorPoint.y + snappedProj * uy, 3),
      };
      const dist = Math.hypot(cand.x - input.point.x, cand.y - input.point.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestPoint = cand;
        bestAngle = snappedProj >= 0 ? deg : normalizeHueDeg(deg + 180);
      }
    }
    const stepCount = Math.round(
      Math.hypot(bestPoint.x - input.anchorPoint.x, bestPoint.y - input.anchorPoint.y) / gridSize,
    );
    return {
      mode: "isometric-30",
      input: input.point,
      snapped: bestPoint,
      snapDistancePx: roundToDigits(bestDist, 3),
      lockedAngleDeg: bestAngle,
      gridCoord: { u: stepCount, v: 0 },
    };
  }

  const dx = input.point.x - origin.x;
  const dy = input.point.y - origin.y;
  const u = Math.round((dx / (2 * ISO_COS_30) + dy / (2 * ISO_SIN_30)) / gridSize);
  const v = Math.round((-dx / (2 * ISO_COS_30) + dy / (2 * ISO_SIN_30)) / gridSize);
  const snapped: Point2D = {
    x: roundToDigits(origin.x + (u - v) * ISO_COS_30 * gridSize, 3),
    y: roundToDigits(origin.y + (u + v) * ISO_SIN_30 * gridSize, 3),
  };
  return {
    mode: "isometric-30",
    input: input.point,
    snapped,
    snapDistancePx: roundToDigits(Math.hypot(snapped.x - input.point.x, snapped.y - input.point.y), 3),
    lockedAngleDeg: 30,
    gridCoord: { u, v },
  };
}
