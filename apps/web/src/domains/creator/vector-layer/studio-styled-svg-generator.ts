/**
 * Recraft V3형 작품 스타일·OKLCH 팔레트 락 네이티브 SVG 벡터 생성 계약 및 베지어 편집 정규화기.
 *
 * - 원시 색상 포맷 대신 지각 균일 OKLCH 팔레트(최대 8색)를 잠금 기준으로 사용한다.
 * - 외부/오프라인 생성 SVG를 선형 시간 안전 스캐너(`svg-safety/studio-svg-source-scan`)로 검증한 뒤
 *   모든 경로 명령(M/L/H/V/C/Q/Z 및 rect/circle/polygon)을 편집 가능한 3차 베지어 `VectorLayer`로 정규화한다.
 * - 잠긴 팔레트를 벗어난 색상은 OKLab 지각 거리 최소값으로 자동 스냅하며 Rights BOM 메타데이터를 부착한다.
 */

import {
  cssUrlTargets,
  hasEventHandlerAttribute,
  hasForbiddenSvgElement,
  imageElementTags,
} from "../svg-safety/studio-svg-source-scan";

import {
  VECTOR_LAYER_TYPE,
  type VectorBrushShapeId,
  type VectorCubicSegment,
  type VectorLayer,
  type VectorPoint2D,
  type VectorStroke,
} from "./vector-layer-model";

export interface OklchColor {
  /** 명도 (0..1). */
  readonly l: number;
  /** 채도 (0..0.4). */
  readonly c: number;
  /** 색상각 (0..360). */
  readonly h: number;
  /** 불투명도 (0..1). */
  readonly alpha?: number;
  readonly label?: string;
}

export type StyledSvgPresetKind =
  | "emblem"
  | "sfx-badge"
  | "prop-icon"
  | "ornament"
  | "pattern-tile";

export interface StyledSvgGenerationInput {
  readonly preset: StyledSvgPresetKind;
  readonly prompt: string;
  readonly seed?: number;
  readonly width?: number;
  readonly height?: number;
  readonly strokeWidthPx?: number;
  readonly cornerRoundness?: number;
  readonly complexity?: number;
  readonly lockedPalette: readonly OklchColor[];
  readonly brushShapeId?: VectorBrushShapeId;
  readonly allowFill?: boolean;
}

export interface NormalizedStyledSvgSpec {
  readonly preset: StyledSvgPresetKind;
  readonly prompt: string;
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly strokeWidthPx: number;
  readonly cornerRoundness: number;
  readonly complexity: number;
  readonly lockedPalette: readonly OklchColor[];
  readonly brushShapeId: VectorBrushShapeId;
  readonly allowFill: boolean;
}

export interface StyledSvgRightsEntry {
  readonly provider: "toonstudio-procedural-svg" | "byok-svg-adapter";
  readonly promptHash: string;
  readonly commercialSafe: boolean;
  readonly lockedSwatchCount: number;
}

export interface GeneratedStyledSvgResult {
  readonly spec: NormalizedStyledSvgSpec;
  readonly svgMarkup: string;
  readonly rightsBom: StyledSvgRightsEntry;
}

export interface SvgSafetyAuditResult {
  readonly safe: boolean;
  readonly violations: readonly string[];
}

export interface NormalizedVectorLayerResult {
  readonly ok: boolean;
  readonly safety: SvgSafetyAuditResult;
  readonly layer: VectorLayer | null;
  readonly swatchGroupMap: Readonly<Record<string, readonly string[]>>;
  readonly snappedColorCount: number;
  readonly parsedSegmentCount: number;
}

export const MAX_LOCKED_PALETTE_SWATCHES = 8 as const;
const CIRCLE_KAPPA = 0.5522847498307936;

export const DEFAULT_OKLCH_INK_PALETTE: readonly OklchColor[] = Object.freeze([
  Object.freeze({ l: 0.24, c: 0.03, h: 255, label: "먹선 주색" }),
  Object.freeze({ l: 0.62, c: 0.16, h: 252, label: "포인트 라벤더" }),
  Object.freeze({ l: 0.72, c: 0.14, h: 48, label: "강조 황금" }),
  Object.freeze({ l: 0.94, c: 0.02, h: 85, label: "종이 여백" }),
]);

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function normalizeHue(h: number): number {
  if (!Number.isFinite(h)) return 0;
  const mod = h % 360;
  return mod < 0 ? mod + 360 : mod;
}

function hashDeterministic(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function createSeededStream(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeOklchColor(color: OklchColor): OklchColor {
  const alpha = color.alpha === undefined ? undefined : round3(clamp(color.alpha, 0, 1));
  return Object.freeze({
    l: round3(clamp(color.l, 0, 1)),
    c: round3(clamp(color.c, 0, 0.4)),
    h: round3(normalizeHue(color.h)),
    ...(alpha !== undefined && alpha < 1 ? { alpha } : {}),
    ...(color.label ? { label: color.label } : {}),
  });
}

export function formatOklchColor(color: OklchColor): string {
  const norm = normalizeOklchColor(color);
  if (norm.alpha !== undefined && norm.alpha < 1) {
    return `oklch(${norm.l} ${norm.c} ${norm.h} / ${norm.alpha})`;
  }
  return `oklch(${norm.l} ${norm.c} ${norm.h})`;
}

const OKLCH_PATTERN =
  /^oklch\(\s*([0-9]*\.?[0-9]+)(%?)\s+([0-9]*\.?[0-9]+)\s+(-?[0-9]*\.?[0-9]+)(?:deg)?(?:\s*\/\s*([0-9]*\.?[0-9]+)(%?))?\s*\)$/iu;

export function parseOklchColor(value: string): OklchColor | null {
  const match = OKLCH_PATTERN.exec(value.trim());
  if (!match) return null;
  const rawL = Number(match[1]);
  const l = match[2] === "%" ? rawL / 100 : rawL;
  const c = Number(match[3]);
  const h = Number(match[4]);
  const rawAlpha = match[5] !== undefined ? Number(match[5]) : undefined;
  const alpha =
    rawAlpha === undefined ? undefined : match[6] === "%" ? rawAlpha / 100 : rawAlpha;
  return normalizeOklchColor({ l, c, h, alpha });
}

export function oklchPerceptualDistance(a: OklchColor, b: OklchColor): number {
  const radA = (a.h * Math.PI) / 180;
  const radB = (b.h * Math.PI) / 180;
  const dl = a.l - b.l;
  const da = a.c * Math.cos(radA) - b.c * Math.cos(radB);
  const db = a.c * Math.sin(radA) - b.c * Math.sin(radB);
  return Math.sqrt(dl * dl + da * da + db * db);
}

export function snapOklchToLockedPalette(
  candidate: OklchColor,
  lockedPalette: readonly OklchColor[],
): { readonly color: OklchColor; readonly index: number; readonly distance: number; readonly snapped: boolean } {
  const palette = lockedPalette.length > 0 ? lockedPalette : DEFAULT_OKLCH_INK_PALETTE;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i += 1) {
    const swatch = palette[i];
    if (!swatch) continue;
    const dist = oklchPerceptualDistance(candidate, swatch);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  const chosen = normalizeOklchColor(palette[bestIdx] ?? DEFAULT_OKLCH_INK_PALETTE[0]!);
  return Object.freeze({
    color: chosen,
    index: bestIdx,
    distance: round3(bestDist),
    snapped: bestDist > 0.002,
  });
}

export function normalizeStyledSvgSpec(input: StyledSvgGenerationInput): NormalizedStyledSvgSpec {
  const paletteSource =
    input.lockedPalette.length > 0 ? input.lockedPalette : DEFAULT_OKLCH_INK_PALETTE;
  const lockedPalette = paletteSource
    .slice(0, MAX_LOCKED_PALETTE_SWATCHES)
    .map(normalizeOklchColor);
  const prompt = input.prompt.trim() || `${input.preset} 벡터 장식`;
  const seed =
    input.seed !== undefined && Number.isFinite(input.seed)
      ? Math.abs(Math.trunc(input.seed))
      : hashDeterministic(`${input.preset}:${prompt}`);

  return Object.freeze({
    preset: input.preset,
    prompt,
    seed,
    width: Math.round(clamp(input.width ?? 256, 32, 2048)),
    height: Math.round(clamp(input.height ?? 256, 32, 2048)),
    strokeWidthPx: round3(clamp(input.strokeWidthPx ?? 3, 0.5, 32)),
    cornerRoundness: round3(clamp(input.cornerRoundness ?? 0.35, 0, 1)),
    complexity: Math.round(clamp(input.complexity ?? 3, 1, 5)),
    lockedPalette: Object.freeze(lockedPalette),
    brushShapeId: input.brushShapeId ?? "round",
    allowFill: input.allowFill ?? true,
  });
}

function buildPolygonPath(points: readonly VectorPoint2D[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  if (!first) return "";
  const cmds = [`M ${round3(first.x)} ${round3(first.y)}`];
  for (const pt of rest) {
    cmds.push(`L ${round3(pt.x)} ${round3(pt.y)}`);
  }
  cmds.push("Z");
  return cmds.join(" ");
}

/**
 * 오프라인 결정적 절차형 네이티브 SVG 생성기.
 * 잠긴 OKLCH 팔레트와 선 두께 규칙을 위반하지 않는 깨끗한 베지어·기하 SVG를 만든다.
 */
export function generateProceduralStyledSvg(
  input: StyledSvgGenerationInput,
): GeneratedStyledSvgResult {
  const spec = normalizeStyledSvgSpec(input);
  const rng = createSeededStream(spec.seed);
  const cx = spec.width / 2;
  const cy = spec.height / 2;
  const radius = Math.min(spec.width, spec.height) * 0.4;
  const primaryStroke = formatOklchColor(spec.lockedPalette[0]!);
  const accentStroke = formatOklchColor(
    spec.lockedPalette[1] ?? spec.lockedPalette[0]!,
  );
  const fillAccent = spec.allowFill
    ? formatOklchColor(spec.lockedPalette[2] ?? spec.lockedPalette[1] ?? spec.lockedPalette[0]!)
    : "none";

  const elements: string[] = [];

  if (spec.preset === "emblem") {
    elements.push(
      `<circle cx="${round3(cx)}" cy="${round3(cy)}" r="${round3(radius)}" fill="none" stroke="${primaryStroke}" stroke-width="${spec.strokeWidthPx}" />`,
    );
    elements.push(
      `<circle cx="${round3(cx)}" cy="${round3(cy)}" r="${round3(radius * 0.78)}" fill="none" stroke="${accentStroke}" stroke-width="${round3(spec.strokeWidthPx * 0.75)}" />`,
    );
    const spikes = 4 + spec.complexity * 2;
    const pts: VectorPoint2D[] = [];
    for (let i = 0; i < spikes * 2; i += 1) {
      const angle = (i * Math.PI) / spikes - Math.PI / 2;
      const r = i % 2 === 0 ? radius * 0.74 : radius * (0.34 + spec.cornerRoundness * 0.16);
      pts.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    }
    elements.push(
      `<path d="${buildPolygonPath(pts)}" fill="${fillAccent}" stroke="${primaryStroke}" stroke-width="${spec.strokeWidthPx}" />`,
    );
  } else if (spec.preset === "sfx-badge") {
    const teeth = 8 + spec.complexity * 3;
    const pts: VectorPoint2D[] = [];
    for (let i = 0; i < teeth * 2; i += 1) {
      const angle = (i * Math.PI) / teeth;
      const jitter = 0.88 + rng() * 0.22;
      const r = i % 2 === 0 ? radius * 1.05 * jitter : radius * 0.58;
      pts.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r * 0.78 });
    }
    elements.push(
      `<path d="${buildPolygonPath(pts)}" fill="${fillAccent}" stroke="${primaryStroke}" stroke-width="${spec.strokeWidthPx}" />`,
    );
  } else if (spec.preset === "prop-icon") {
    const boxW = radius * 1.45;
    const boxH = radius * 1.3;
    const x = cx - boxW / 2;
    const y = cy - boxH / 2;
    elements.push(
      `<rect x="${round3(x)}" y="${round3(y)}" width="${round3(boxW)}" height="${round3(boxH)}" fill="${fillAccent}" stroke="${primaryStroke}" stroke-width="${spec.strokeWidthPx}" />`,
    );
    const innerPath = `M ${round3(x + boxW * 0.2)} ${round3(cy)} Q ${round3(cx)} ${round3(y + boxH * 0.15)} ${round3(x + boxW * 0.8)} ${round3(cy)}`;
    elements.push(
      `<path d="${innerPath}" fill="none" stroke="${accentStroke}" stroke-width="${spec.strokeWidthPx}" />`,
    );
  } else if (spec.preset === "ornament") {
    const span = radius * 0.9;
    const bend = radius * (0.35 + spec.cornerRoundness * 0.45);
    const leftScroll = `M ${round3(cx)} ${round3(cy)} C ${round3(cx - span * 0.4)} ${round3(cy - bend)} ${round3(cx - span)} ${round3(cy - bend * 0.5)} ${round3(cx - span)} ${round3(cy)}`;
    const rightScroll = `M ${round3(cx)} ${round3(cy)} C ${round3(cx + span * 0.4)} ${round3(cy - bend)} ${round3(cx + span)} ${round3(cy - bend * 0.5)} ${round3(cx + span)} ${round3(cy)}`;
    elements.push(
      `<path d="${leftScroll}" fill="none" stroke="${primaryStroke}" stroke-width="${spec.strokeWidthPx}" />`,
    );
    elements.push(
      `<path d="${rightScroll}" fill="none" stroke="${accentStroke}" stroke-width="${spec.strokeWidthPx}" />`,
    );
  } else {
    const cells = Math.max(2, spec.complexity + 1);
    const stepX = spec.width / cells;
    const stepY = spec.height / cells;
    for (let gy = 0; gy < cells; gy += 1) {
      for (let gx = 0; gx < cells; gx += 1) {
        const px = gx * stepX + stepX / 2;
        const py = gy * stepY + stepY / 2;
        const rx = stepX * 0.36;
        const ry = stepY * 0.36;
        const diamond = buildPolygonPath([
          { x: px, y: py - ry },
          { x: px + rx, y: py },
          { x: px, y: py + ry },
          { x: px - rx, y: py },
        ]);
        const strokeCol = (gx + gy) % 2 === 0 ? primaryStroke : accentStroke;
        elements.push(
          `<path d="${diamond}" fill="none" stroke="${strokeCol}" stroke-width="${spec.strokeWidthPx}" />`,
        );
      }
    }
  }

  const svgMarkup = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${spec.width} ${spec.height}" width="${spec.width}" height="${spec.height}">`,
    ...elements.map((el) => `  ${el}`),
    "</svg>",
  ].join("\n");

  const promptHash = hashDeterministic(`${spec.preset}:${spec.prompt}:${spec.seed}`)
    .toString(16)
    .padStart(8, "0");

  return Object.freeze({
    spec,
    svgMarkup,
    rightsBom: Object.freeze({
      provider: "toonstudio-procedural-svg",
      promptHash,
      commercialSafe: true,
      lockedSwatchCount: spec.lockedPalette.length,
    }),
  });
}

export function auditStyledSvgSafety(svgMarkup: string): SvgSafetyAuditResult {
  const violations: string[] = [];
  if (hasForbiddenSvgElement(svgMarkup)) {
    violations.push("실행 가능하거나 외부 자원을 포함하는 금지 SVG 요소가 검출되었습니다.");
  }
  if (hasEventHandlerAttribute(svgMarkup)) {
    violations.push("인라인 이벤트 핸들러 속성(on*=)이 검출되었습니다.");
  }
  for (const target of cssUrlTargets(svgMarkup)) {
    const trimmed = target.trim();
    if (!trimmed.startsWith("#")) {
      violations.push(`외부 CSS url() 참조는 허용되지 않습니다: ${trimmed}`);
    }
  }
  if (imageElementTags(svgMarkup).length > 0) {
    violations.push("외부 래스터 <image>/<feImage> 요소는 순수 벡터 계약에서 허용되지 않습니다.");
  }
  if (/javascript\s*:/iu.test(svgMarkup)) {
    violations.push("javascript: URI 스킴이 검출되었습니다.");
  }
  return Object.freeze({
    safe: violations.length === 0,
    violations: Object.freeze(violations),
  });
}

function lineToCubic(a: VectorPoint2D, b: VectorPoint2D): VectorCubicSegment {
  return Object.freeze({
    p0: a,
    p1: { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
    p2: { x: a.x + ((b.x - a.x) * 2) / 3, y: a.y + ((b.y - a.y) * 2) / 3 },
    p3: b,
  });
}

function quadToCubic(
  p0: VectorPoint2D,
  q1: VectorPoint2D,
  p2: VectorPoint2D,
): VectorCubicSegment {
  return Object.freeze({
    p0,
    p1: { x: p0.x + (2 / 3) * (q1.x - p0.x), y: p0.y + (2 / 3) * (q1.y - p0.y) },
    p2: { x: p2.x + (2 / 3) * (q1.x - p2.x), y: p2.y + (2 / 3) * (q1.y - p2.y) },
    p3: p2,
  });
}

export function parseSvgPathDataToCubics(
  d: string,
): { readonly segments: readonly VectorCubicSegment[]; readonly closed: boolean } {
  const tokenRegex = /([MLHVCQZmlhvcqz])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/gu;
  const tokens: string[] = [];
  for (const m of d.matchAll(tokenRegex)) {
    tokens.push(m[0]);
  }

  const segments: VectorCubicSegment[] = [];
  let idx = 0;
  let cmd = "";
  let current: VectorPoint2D = { x: 0, y: 0 };
  let start: VectorPoint2D = { x: 0, y: 0 };
  let closed = false;

  const nextNum = (): number => {
    const val = Number(tokens[idx]);
    idx += 1;
    return Number.isFinite(val) ? val : 0;
  };

  while (idx < tokens.length) {
    const tok = tokens[idx] ?? "";
    if (/^[MLHVCQZmlhvcqz]$/u.test(tok)) {
      cmd = tok;
      idx += 1;
    }
    if (cmd === "M" || cmd === "m") {
      const x = nextNum();
      const y = nextNum();
      current = cmd === "m" ? { x: current.x + x, y: current.y + y } : { x, y };
      start = current;
      cmd = cmd === "m" ? "l" : "L";
    } else if (cmd === "L" || cmd === "l") {
      const x = nextNum();
      const y = nextNum();
      const target = cmd === "l" ? { x: current.x + x, y: current.y + y } : { x, y };
      segments.push(lineToCubic(current, target));
      current = target;
    } else if (cmd === "H" || cmd === "h") {
      const x = nextNum();
      const target = { x: cmd === "h" ? current.x + x : x, y: current.y };
      segments.push(lineToCubic(current, target));
      current = target;
    } else if (cmd === "V" || cmd === "v") {
      const y = nextNum();
      const target = { x: current.x, y: cmd === "v" ? current.y + y : y };
      segments.push(lineToCubic(current, target));
      current = target;
    } else if (cmd === "C" || cmd === "c") {
      const x1 = nextNum();
      const y1 = nextNum();
      const x2 = nextNum();
      const y2 = nextNum();
      const x3 = nextNum();
      const y3 = nextNum();
      const isRel = cmd === "c";
      const p1 = isRel ? { x: current.x + x1, y: current.y + y1 } : { x: x1, y: y1 };
      const p2 = isRel ? { x: current.x + x2, y: current.y + y2 } : { x: x2, y: y2 };
      const p3 = isRel ? { x: current.x + x3, y: current.y + y3 } : { x: x3, y: y3 };
      segments.push(Object.freeze({ p0: current, p1, p2, p3 }));
      current = p3;
    } else if (cmd === "Q" || cmd === "q") {
      const x1 = nextNum();
      const y1 = nextNum();
      const x2 = nextNum();
      const y2 = nextNum();
      const isRel = cmd === "q";
      const q1 = isRel ? { x: current.x + x1, y: current.y + y1 } : { x: x1, y: y1 };
      const p2 = isRel ? { x: current.x + x2, y: current.y + y2 } : { x: x2, y: y2 };
      segments.push(quadToCubic(current, q1, p2));
      current = p2;
    } else if (cmd === "Z" || cmd === "z") {
      if (Math.hypot(current.x - start.x, current.y - start.y) > 0.001) {
        segments.push(lineToCubic(current, start));
      }
      current = start;
      closed = true;
      cmd = "";
    } else {
      idx += 1;
    }
  }

  return Object.freeze({ segments: Object.freeze(segments), closed });
}

function circleToCubics(cx: number, cy: number, r: number): readonly VectorCubicSegment[] {
  const k = r * CIRCLE_KAPPA;
  const top: VectorPoint2D = { x: cx, y: cy - r };
  const right: VectorPoint2D = { x: cx + r, y: cy };
  const bottom: VectorPoint2D = { x: cx, y: cy + r };
  const left: VectorPoint2D = { x: cx - r, y: cy };
  return Object.freeze([
    { p0: top, p1: { x: cx + k, y: cy - r }, p2: { x: cx + r, y: cy - k }, p3: right },
    { p0: right, p1: { x: cx + r, y: cy + k }, p2: { x: cx + k, y: cy + r }, p3: bottom },
    { p0: bottom, p1: { x: cx - k, y: cy + r }, p2: { x: cx - r, y: cy + k }, p3: left },
    { p0: left, p1: { x: cx - r, y: cy - k }, p2: { x: cx - k, y: cy - r }, p3: top },
  ]);
}

function readAttr(tag: string, attrName: string): string | null {
  const pattern = new RegExp(`\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "iu");
  const match = pattern.exec(tag);
  return match ? (match[1] ?? match[2] ?? null) : null;
}

/**
 * SVG 마크업을 안전성 검수 후 잠긴 OKLCH 팔레트에 맞춰 편집 가능한 `VectorLayer`로 변환한다.
 */
export function sanitizeAndNormalizeSvgToVectorLayer(input: {
  readonly svgMarkup: string;
  readonly layerId: string;
  readonly layerName: string;
  readonly lockedPalette: readonly OklchColor[];
  readonly defaultStrokeWidthPx?: number;
  readonly brushShapeId?: VectorBrushShapeId;
}): NormalizedVectorLayerResult {
  const safety = auditStyledSvgSafety(input.svgMarkup);
  if (!safety.safe) {
    return Object.freeze({
      ok: false,
      safety,
      layer: null,
      swatchGroupMap: Object.freeze({}),
      snappedColorCount: 0,
      parsedSegmentCount: 0,
    });
  }

  const palette =
    input.lockedPalette.length > 0
      ? input.lockedPalette.slice(0, MAX_LOCKED_PALETTE_SWATCHES).map(normalizeOklchColor)
      : DEFAULT_OKLCH_INK_PALETTE;
  const fallbackWidth = clamp(input.defaultStrokeWidthPx ?? 3, 0.5, 32);
  const brushShapeId = input.brushShapeId ?? "round";

  const shapeTagRegex = /<\s*(path|circle|rect|polygon)\b[^>]*>/giu;
  const strokes: VectorStroke[] = [];
  const swatchGroups: Record<string, string[]> = {};
  let snappedColorCount = 0;
  let parsedSegmentCount = 0;
  let strokeCounter = 0;

  for (const match of input.svgMarkup.matchAll(shapeTagRegex)) {
    const tagText = match[0];
    const tagName = (match[1] ?? "").toLowerCase();
    let segments: readonly VectorCubicSegment[] = [];
    let closed = false;

    if (tagName === "path") {
      const d = readAttr(tagText, "d");
      if (!d) continue;
      const parsed = parseSvgPathDataToCubics(d);
      segments = parsed.segments;
      closed = parsed.closed;
    } else if (tagName === "circle") {
      const cx = Number(readAttr(tagText, "cx") ?? 0);
      const cy = Number(readAttr(tagText, "cy") ?? 0);
      const r = Number(readAttr(tagText, "r") ?? 0);
      if (!Number.isFinite(r) || r <= 0) continue;
      segments = circleToCubics(cx, cy, r);
      closed = true;
    } else if (tagName === "rect") {
      const x = Number(readAttr(tagText, "x") ?? 0);
      const y = Number(readAttr(tagText, "y") ?? 0);
      const w = Number(readAttr(tagText, "width") ?? 0);
      const h = Number(readAttr(tagText, "height") ?? 0);
      if (w <= 0 || h <= 0) continue;
      const p0 = { x, y };
      const p1 = { x: x + w, y };
      const p2 = { x: x + w, y: y + h };
      const p3 = { x, y: y + h };
      segments = [lineToCubic(p0, p1), lineToCubic(p1, p2), lineToCubic(p2, p3), lineToCubic(p3, p0)];
      closed = true;
    } else if (tagName === "polygon") {
      const rawPoints = (readAttr(tagText, "points") ?? "").trim();
      const nums = rawPoints.split(/[\s,]+/u).map(Number).filter(Number.isFinite);
      const pts: VectorPoint2D[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) {
        pts.push({ x: nums[i]!, y: nums[i + 1]! });
      }
      if (pts.length < 3) continue;
      const built: VectorCubicSegment[] = [];
      for (let i = 0; i < pts.length; i += 1) {
        built.push(lineToCubic(pts[i]!, pts[(i + 1) % pts.length]!));
      }
      segments = built;
      closed = true;
    }

    if (segments.length === 0) continue;

    const rawColor = readAttr(tagText, "stroke") ?? readAttr(tagText, "fill") ?? "";
    const parsedColor = parseOklchColor(rawColor);
    let finalOklch: OklchColor;
    let swatchKey: string;
    if (parsedColor) {
      const snapped = snapOklchToLockedPalette(parsedColor, palette);
      if (snapped.snapped) snappedColorCount += 1;
      finalOklch = snapped.color;
      swatchKey = `swatch-${snapped.index}`;
    } else {
      snappedColorCount += 1;
      finalOklch = palette[0]!;
      swatchKey = "swatch-0";
    }

    const strokeWidthAttr = Number(readAttr(tagText, "stroke-width"));
    const strokeWidth =
      Number.isFinite(strokeWidthAttr) && strokeWidthAttr > 0 ? strokeWidthAttr : fallbackWidth;

    strokeCounter += 1;
    const strokeId = `${input.layerId}-stroke-${strokeCounter}`;
    const widths = Array.from({ length: segments.length + 1 }, () => round3(strokeWidth));
    strokes.push(
      Object.freeze({
        id: strokeId,
        segments: Object.freeze(segments),
        widths: Object.freeze(widths),
        color: formatOklchColor(finalOklch),
        brushShapeId,
        opacity: finalOklch.alpha ?? 1,
        closed,
      }),
    );
    parsedSegmentCount += segments.length;
    const bucket = swatchGroups[swatchKey] ?? [];
    bucket.push(strokeId);
    swatchGroups[swatchKey] = bucket;
  }

  const layer: VectorLayer = Object.freeze({
    id: input.layerId,
    name: input.layerName,
    type: VECTOR_LAYER_TYPE,
    strokes: Object.freeze(strokes),
    visible: true,
    locked: false,
    opacity: 1,
  });

  return Object.freeze({
    ok: true,
    safety,
    layer,
    swatchGroupMap: Object.freeze(swatchGroups),
    snappedColorCount,
    parsedSegmentCount,
  });
}
