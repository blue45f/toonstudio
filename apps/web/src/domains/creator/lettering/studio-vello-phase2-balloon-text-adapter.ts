import { solidPaint } from "@toonstudio/studio-project-model";

import { layoutVerticalText, type VerticalBlockAlign } from "../studio-vertical-text";
import {
  bubbleHorizontalPadding, bubbleVerticalPadding, resolveBubbleFontFamily, resolveBubbleFontSize,
  resolveBubbleFontStyle, resolveBubbleLineHeight, wrapBubbleTextLines, type BubbleTextMeasurer,
} from "./studio-bubble-text-fit";

import type { ShapeTextOptions, ShapeTextVerticalOptions, ShapedText, VerticalShapedText } from "@toonstudio/studio-engine-vello";
import type { ColorIR, PathIR, PathVerbIR, SceneIR, SceneNodeIR } from "@toonstudio/studio-project-model";

export type StudioVelloBalloonShape = "oval" | "cloud" | "burst" | "box";
export type StudioVelloWritingMode = "htb" | "ttb";
export type StudioVelloTextAlign = "left" | "center" | "right";
export type StudioVelloTailAnchor = "bottom" | "top" | "left" | "right";

export interface StudioVelloBalloonTail {
  readonly anchor: StudioVelloTailAnchor; readonly ratio?: number; readonly length: number;
  readonly baseWidth: number; readonly tipOffset?: number; readonly bend?: number;
  readonly kind?: "pointed" | "thought-dots";
}
export interface StudioVelloBalloonSpec {
  readonly id: string; readonly shape: StudioVelloBalloonShape; readonly x: number; readonly y: number;
  readonly width: number; readonly height: number; readonly text: string;
  readonly writingMode?: StudioVelloWritingMode; readonly align?: StudioVelloTextAlign;
  readonly fontSize?: number; readonly lineHeight?: number; readonly letterSpacing?: number;
  readonly fontFamily?: string; readonly fontStyle?: string; readonly cornerRadius?: number;
  readonly fillColor?: ColorIR; readonly strokeColor?: ColorIR; readonly strokeWidth?: number;
  readonly textColor?: ColorIR; readonly tail?: StudioVelloBalloonTail | null;
}
export interface StudioVelloTextShaperBridge {
  readonly shapeHorizontal?: (text: string, options: ShapeTextOptions) => ShapedText;
  readonly shapeVertical?: (text: string, options: ShapeTextVerticalOptions) => VerticalShapedText;
}
export interface StudioVelloLaidOutTextRun {
  readonly text: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  readonly rotationDeg: 0 | 90; readonly horizontalScale: number; readonly lineOrColumnIndex: number;
  readonly form: "horizontal" | "upright" | "rotated" | "shifted" | "tate-chu-yoko";
  readonly glyphPaths?: readonly PathIR[];
}
export interface StudioVelloBalloonTextLayoutResult {
  readonly writingMode: StudioVelloWritingMode; readonly shaperBackend: "parley-harfrust" | "deterministic-fallback";
  readonly fontSize: number; readonly lineHeight: number; readonly letterSpacing: number;
  readonly fontFamily: string; readonly fontStyle: string;
  readonly textBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly blockWidth: number; readonly blockHeight: number; readonly overflow: boolean;
  readonly lines: readonly string[]; readonly runs: readonly StudioVelloLaidOutTextRun[];
  readonly verticalMetrics?: {
    readonly columnCount: number; readonly columnAdvance: number; readonly rotatedPunctuationCount: number;
    readonly tateChuYokoCount: number; readonly verticalMetricsSource: "vmtx" | "fallback-1em";
  };
  readonly warnings: readonly string[];
}
export interface StudioVelloBalloonGeometry {
  readonly bodyPath: PathIR; readonly satellitePaths: readonly PathIR[];
}
export interface StudioVelloPhase2BalloonOutput {
  readonly scene: SceneIR;
  readonly layouts: ReadonlyMap<string, StudioVelloBalloonTextLayoutResult>;
  readonly stats: { readonly balloonCount: number; readonly glyphPathCount: number; readonly textRunCount: number; readonly verticalBalloonCount: number };
}
export interface StudioVelloPhase2RenderOptions {
  readonly measurer?: BubbleTextMeasurer; readonly shaper?: StudioVelloTextShaperBridge;
  readonly velloSubmit?: (scene: SceneIR) => void; readonly canvas2d?: CanvasRenderingContext2D | null; readonly dpr?: number;
}
export interface StudioVelloPhase2RenderResult {
  readonly backend: "vello" | "canvas2d-fallback" | "scene-ir-only"; readonly output: StudioVelloPhase2BalloonOutput;
}

const WHITE: ColorIR = { r: 1, g: 1, b: 1, a: 1 };
const INK: ColorIR = { r: 0.08, g: 0.09, b: 0.1, a: 1 };
const KAPPA = 0.5522847498;
const TAIL_TAPER = 0.55;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** 결정적 한글/라틴 자폭 근사 측정기(Canvas 2D 미주입/헤드리스 폴백). */
export const FALLBACK_KOREAN_TEXT_MEASURER: BubbleTextMeasurer = {
  measureWidth(text: string, fontPx: number): number {
    let units = 0;
    for (const ch of text) {
      const code = ch.codePointAt(0) ?? 0;
      const wide = (code >= 0x1100 && code <= 0x11ff) || (code >= 0x3000 && code <= 0x9fff)
        || (code >= 0xac00 && code <= 0xd7af) || (code >= 0xff01 && code <= 0xff60);
      units += ch === " " ? 0.34 : wide ? 0.96 : 0.56;
    }
    return units * fontPx;
  },
};

function ellipseArcVerbs(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, segs: number, moveFirst: boolean): PathVerbIR[] {
  const verbs: PathVerbIR[] = [];
  const step = (a1 - a0) / segs;
  const k = (4 / 3) * Math.tan(step / 4);
  for (let i = 0; i < segs; i += 1) {
    const t0 = a0 + i * step;
    const t1 = t0 + step;
    const [x0, y0, x1, y1] = [cx + rx * Math.cos(t0), cy + ry * Math.sin(t0), cx + rx * Math.cos(t1), cy + ry * Math.sin(t1)];
    if (i === 0 && moveFirst) verbs.push({ v: "M", x: x0, y: y0 });
    verbs.push({ v: "C", c1x: x0 - k * rx * Math.sin(t0), c1y: y0 + k * ry * Math.cos(t0), c2x: x1 + k * rx * Math.sin(t1), c2y: y1 - k * ry * Math.cos(t1), x: x1, y: y1 });
  }
  return verbs;
}

function tailBezierVerbs(p1: readonly [number, number], p2: readonly [number, number], tip: readonly [number, number], bendPx: number): PathVerbIR[] {
  const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
  const [tx, ty] = [(p2[0] - p1[0]) / len, (p2[1] - p1[1]) / len];
  return [
    { v: "Q", cx: p1[0] + (tip[0] - p1[0]) * TAIL_TAPER + tx * bendPx, cy: p1[1] + (tip[1] - p1[1]) * TAIL_TAPER + ty * bendPx, x: tip[0], y: tip[1] },
    { v: "Q", cx: p2[0] + (tip[0] - p2[0]) * TAIL_TAPER + tx * bendPx, cy: p2[1] + (tip[1] - p2[1]) * TAIL_TAPER + ty * bendPx, x: p2[0], y: p2[1] },
  ];
}

function tailAnchorFrame(w: number, h: number, tail: StudioVelloBalloonTail) {
  const ratio = clamp(tail.ratio ?? 0.5, 0.16, 0.84);
  const base = Math.max(6, Math.min(tail.baseWidth, Math.min(w, h) * 0.45));
  const length = Math.max(6, tail.length);
  const tipOffset = tail.tipOffset ?? 0;
  const bendPx = clamp(tail.bend ?? 0, -1, 1) * Math.min(Math.max(base, length) * 0.42, base * 1.3);
  if (tail.anchor === "bottom") return { angle: Math.PI / 2 - (ratio - 0.5) * 0.9, p1: [w * ratio + base / 2, h] as const, p2: [w * ratio - base / 2, h] as const, tip: [w * ratio + tipOffset, h + length] as const, bendPx, base };
  if (tail.anchor === "top") return { angle: -Math.PI / 2 + (ratio - 0.5) * 0.9, p1: [w * ratio - base / 2, 0] as const, p2: [w * ratio + base / 2, 0] as const, tip: [w * ratio + tipOffset, -length] as const, bendPx, base };
  if (tail.anchor === "right") return { angle: (ratio - 0.5) * 0.9, p1: [w, h * ratio - base / 2] as const, p2: [w, h * ratio + base / 2] as const, tip: [w + length, h * ratio + tipOffset] as const, bendPx, base };
  return { angle: Math.PI - (ratio - 0.5) * 0.9, p1: [0, h * ratio + base / 2] as const, p2: [0, h * ratio - base / 2] as const, tip: [-length, h * ratio + tipOffset] as const, bendPx, base };
}

function offsetPathIR(path: PathIR, dx: number, dy: number): PathIR {
  return {
    verbs: path.verbs.map((v) =>
      v.v === "M" || v.v === "L" ? { v: v.v, x: v.x + dx, y: v.y + dy }
      : v.v === "Q" ? { v: "Q", cx: v.cx + dx, cy: v.cy + dy, x: v.x + dx, y: v.y + dy }
      : v.v === "C" ? { v: "C", c1x: v.c1x + dx, c1y: v.c1y + dy, c2x: v.c2x + dx, c2y: v.c2y + dy, x: v.x + dx, y: v.y + dy }
      : v
    ),
  };
}

/** 한국어 웹툰 말풍선 4종(oval·cloud·burst·box) + 동적 베지어 꼬리 PathIR을 생성한다. */
export function buildBalloonGeometryPathIR(spec: Pick<StudioVelloBalloonSpec, "shape" | "x" | "y" | "width" | "height" | "cornerRadius" | "tail">): StudioVelloBalloonGeometry {
  const [w, h] = [Math.max(24, spec.width), Math.max(24, spec.height)];
  const [cx, cy, rx, ry] = [w / 2, h / 2, w / 2, h / 2];
  const tail = spec.tail && spec.tail.length > 0 && spec.tail.baseWidth > 0 ? spec.tail : null;
  const satellites: PathIR[] = [];
  let localVerbs: PathVerbIR[] = [];

  if (spec.shape === "oval") {
    if (tail && tail.kind !== "thought-dots") {
      const f = tailAnchorFrame(w, h, tail);
      const half = clamp(f.base / (2 * Math.max(rx, ry)), 0.08, 0.36);
      const [tStart, tEnd] = [f.angle - half, f.angle + half];
      const pStart: readonly [number, number] = [cx + rx * Math.cos(tStart), cy + ry * Math.sin(tStart)];
      const pEnd: readonly [number, number] = [cx + rx * Math.cos(tEnd), cy + ry * Math.sin(tEnd)];
      localVerbs = [{ v: "M", x: pStart[0], y: pStart[1] }, ...tailBezierVerbs(pStart, pEnd, f.tip, f.bendPx), ...ellipseArcVerbs(cx, cy, rx, ry, tEnd, tStart + Math.PI * 2, 8, false), { v: "Z" }];
    } else {
      localVerbs = [...ellipseArcVerbs(cx, cy, rx, ry, 0, Math.PI * 2, 4, true), { v: "Z" }];
    }
  } else if (spec.shape === "cloud") {
    const lobes = clamp(Math.round((Math.PI * (rx + ry)) / 38), 10, 18);
    const puff = Math.min(rx, ry) * 0.16;
    for (let i = 0; i < lobes; i += 1) {
      const [a0, a1] = [(i / lobes) * Math.PI * 2, ((i + 1) / lobes) * Math.PI * 2];
      const am = (a0 + a1) / 2;
      const [x0, y0, x1, y1] = [cx + (rx - puff * 0.45) * Math.cos(a0), cy + (ry - puff * 0.45) * Math.sin(a0), cx + (rx - puff * 0.45) * Math.cos(a1), cy + (ry - puff * 0.45) * Math.sin(a1)];
      const [ox, oy] = [cx + (rx + puff) * Math.cos(am), cy + (ry + puff) * Math.sin(am)];
      if (i === 0) localVerbs.push({ v: "M", x: x0, y: y0 });
      localVerbs.push({ v: "C", c1x: x0 + (ox - x0) * 0.85, c1y: y0 + (oy - y0) * 0.85, c2x: x1 + (ox - x1) * 0.85, c2y: y1 + (oy - y1) * 0.85, x: x1, y: y1 });
    }
    localVerbs.push({ v: "Z" });
  } else if (spec.shape === "burst") {
    const spikes = clamp(Math.round((Math.PI * (rx + ry)) / 34), 12, 22);
    for (let i = 0; i < spikes; i += 1) {
      const [a0, av, a1] = [(i / spikes) * Math.PI * 2, ((i + 0.5) / spikes) * Math.PI * 2, ((i + 1) / spikes) * Math.PI * 2];
      if (i === 0) localVerbs.push({ v: "M", x: cx + rx * Math.cos(a0), y: cy + ry * Math.sin(a0) });
      localVerbs.push({ v: "Q", cx: cx + rx * 0.78 * Math.cos(av), cy: cy + ry * 0.78 * Math.sin(av), x: cx + rx * Math.cos(a1), y: cy + ry * Math.sin(a1) });
    }
    localVerbs.push({ v: "Z" });
  } else {
    const r = clamp(spec.cornerRadius ?? Math.min(w, h) * 0.14, 0, Math.min(w, h) / 2);
    const kr = r * KAPPA;
    const f = tail && tail.kind !== "thought-dots" ? tailAnchorFrame(w, h, tail) : null;
    const edge = (val: number, span: number) => clamp(val, r + 4, span - r - 4);
    localVerbs.push({ v: "M", x: r, y: 0 });
    if (f && tail?.anchor === "top") { const [b1, b2] = [edge(f.p1[0], w), edge(f.p2[0], w)]; localVerbs.push({ v: "L", x: b1, y: 0 }, ...tailBezierVerbs([b1, 0], [b2, 0], f.tip, f.bendPx)); }
    localVerbs.push({ v: "L", x: w - r, y: 0 }, { v: "C", c1x: w - r + kr, c1y: 0, c2x: w, c2y: r - kr, x: w, y: r });
    if (f && tail?.anchor === "right") { const [b1, b2] = [edge(f.p1[1], h), edge(f.p2[1], h)]; localVerbs.push({ v: "L", x: w, y: b1 }, ...tailBezierVerbs([w, b1], [w, b2], f.tip, f.bendPx)); }
    localVerbs.push({ v: "L", x: w, y: h - r }, { v: "C", c1x: w, c1y: h - r + kr, c2x: w - r + kr, c2y: h, x: w - r, y: h });
    if (f && tail?.anchor === "bottom") { const [b1, b2] = [edge(f.p1[0], w), edge(f.p2[0], w)]; localVerbs.push({ v: "L", x: b1, y: h }, ...tailBezierVerbs([b1, h], [b2, h], f.tip, f.bendPx)); }
    localVerbs.push({ v: "L", x: r, y: h }, { v: "C", c1x: r - kr, c1y: h, c2x: 0, c2y: h - r + kr, x: 0, y: h - r });
    if (f && tail?.anchor === "left") { const [b1, b2] = [edge(f.p1[1], h), edge(f.p2[1], h)]; localVerbs.push({ v: "L", x: 0, y: b1 }, ...tailBezierVerbs([0, b1], [0, b2], f.tip, f.bendPx)); }
    localVerbs.push({ v: "L", x: 0, y: r }, { v: "C", c1x: 0, c1y: r - kr, c2x: r - kr, c2y: 0, x: r, y: 0 }, { v: "Z" });
  }

  if (tail && (tail.kind === "thought-dots" || spec.shape === "cloud" || spec.shape === "burst")) {
    const f = tailAnchorFrame(w, h, tail);
    const [sx, sy] = [(f.p1[0] + f.p2[0]) / 2, (f.p1[1] + f.p2[1]) / 2];
    if (tail.kind === "thought-dots" || (spec.shape === "cloud" && tail.kind !== "pointed")) {
      for (const [t, rDot] of [[0.32, Math.max(4, f.base * 0.28)], [0.68, Math.max(3, f.base * 0.19)], [1, Math.max(2, f.base * 0.12)]] as const) {
        satellites.push(offsetPathIR({ verbs: [...ellipseArcVerbs(sx + (f.tip[0] - sx) * t, sy + (f.tip[1] - sy) * t, rDot, rDot * 0.85, 0, Math.PI * 2, 4, true), { v: "Z" }] }, spec.x, spec.y));
      }
    } else if (spec.shape === "cloud" || spec.shape === "burst") {
      satellites.push(offsetPathIR({ verbs: [{ v: "M", x: f.p1[0], y: f.p1[1] }, ...tailBezierVerbs(f.p1, f.p2, f.tip, f.bendPx), { v: "Z" }] }, spec.x, spec.y));
    }
  }
  return { bodyPath: offsetPathIR({ verbs: localVerbs }, spec.x, spec.y), satellitePaths: satellites };
}

/** 한국어 가로쓰기(HTB)·전통 세로쓰기(TTB·금칙·약물 회전·종중횡조) 레이아웃 + Parley/HarfRust 브리지. */
export function layoutKoreanBalloonText(
  spec: StudioVelloBalloonSpec,
  options: { readonly measurer?: BubbleTextMeasurer; readonly shaper?: StudioVelloTextShaperBridge } = {},
): StudioVelloBalloonTextLayoutResult {
  const writingMode: StudioVelloWritingMode = spec.writingMode ?? "htb";
  const fontSize = resolveBubbleFontSize(spec.fontSize);
  const lineHeight = resolveBubbleLineHeight({ lineHeight: spec.lineHeight, vertical: writingMode === "ttb", theme: "soft" });
  const letterSpacing = spec.letterSpacing ?? 0.3;
  const fontFamily = resolveBubbleFontFamily(spec.fontFamily);
  const fontStyle = resolveBubbleFontStyle(spec.fontStyle);
  const align: StudioVelloTextAlign = spec.align ?? "center";
  const measurer = options.measurer ?? FALLBACK_KOREAN_TEXT_MEASURER;
  const [hPad, vPad] = [bubbleHorizontalPadding(fontSize), bubbleVerticalPadding(fontSize)];
  const textBox = { x: spec.x + hPad, y: spec.y + vPad.top, width: Math.max(fontSize, spec.width - hPad * 2), height: Math.max(fontSize, spec.height - vPad.top - vPad.bottom) };

  if (writingMode === "ttb") {
    const blockAlign: VerticalBlockAlign = align === "left" ? "start" : align === "right" ? "end" : "center";
    const vertical = layoutVerticalText({ text: spec.text, fontSize, lineHeight, letterSpacing, fontFamily, fontStyle, maxColumnLength: textBox.height, blockAlign }, measurer);
    const shaped = options.shaper?.shapeVertical?.(spec.text, { fontSizePx: fontSize, maxHeightPx: textBox.height });
    const [ox, oy] = [textBox.x + Math.max(0, (textBox.width - vertical.width) / 2), textBox.y + Math.max(0, (textBox.height - vertical.height) / 2)];
    let [rotatedPunctuationCount, tateChuYokoCount] = [0, 0];
    const runs: StudioVelloLaidOutTextRun[] = [];
    for (const col of vertical.columns) {
      for (const item of col.items) {
        if (item.rotation === 90 && item.punctuation !== "none") rotatedPunctuationCount += 1;
        if (item.form === "tate-chu-yoko") tateChuYokoCount += 1;
        runs.push({ text: item.text, x: ox + item.x, y: oy + item.y, width: item.rotation === 90 ? item.length : fontSize, height: item.rotation === 90 ? fontSize : item.length, rotationDeg: item.rotation, form: item.form, horizontalScale: item.horizontalScale, lineOrColumnIndex: col.index });
      }
    }
    if (shaped && runs.length > 0) runs[0] = { ...runs[0]!, glyphPaths: shaped.glyphs.map((g) => offsetPathIR(g.path, ox + g.x, oy + g.y)) };
    return {
      writingMode, shaperBackend: shaped ? "parley-harfrust" : "deterministic-fallback", fontSize, lineHeight, letterSpacing, fontFamily, fontStyle, textBox,
      blockWidth: shaped ? shaped.width : vertical.width, blockHeight: shaped ? shaped.height : vertical.height,
      overflow: vertical.overflow || vertical.width > textBox.width,
      lines: vertical.columns.map((c) => c.items.map((it) => it.text.replace(/\n/gu, "")).join("")),
      runs,
      verticalMetrics: { columnCount: shaped ? shaped.columnCount : vertical.columns.length, columnAdvance: shaped ? shaped.columnAdvance : vertical.columnAdvance, rotatedPunctuationCount, tateChuYokoCount, verticalMetricsSource: shaped ? shaped.verticalMetricsSource : "fallback-1em" },
      warnings: shaped?.warnings ?? [],
    };
  }

  const lines = wrapBubbleTextLines(spec.text, textBox.width, fontSize, fontFamily, fontStyle, measurer, { kinsoku: true });
  const shaped = options.shaper?.shapeHorizontal?.(spec.text, { fontSizePx: fontSize, maxWidthPx: textBox.width });
  const stepY = fontSize * lineHeight;
  const blockHeight = shaped ? shaped.height : Math.max(stepY, lines.length * stepY);
  const startY = textBox.y + Math.max(0, (textBox.height - blockHeight) / 2);
  let blockWidth = 0;
  const runs: StudioVelloLaidOutTextRun[] = lines.map((line, index) => {
    const w = measurer.measureWidth(line, fontSize, fontFamily, fontStyle) + Math.max(0, [...line].length - 1) * letterSpacing;
    if (w > blockWidth) blockWidth = w;
    const x = align === "left" ? textBox.x : align === "right" ? textBox.x + textBox.width - w : textBox.x + (textBox.width - w) / 2;
    return { text: line, x, y: startY + index * stepY + fontSize * 0.85, width: w, height: stepY, rotationDeg: 0, form: "horizontal", horizontalScale: 1, lineOrColumnIndex: index };
  });
  if (shaped && runs.length > 0) runs[0] = { ...runs[0]!, glyphPaths: shaped.glyphs.map((g) => offsetPathIR(g.path, textBox.x + g.x, startY + g.y)) };
  return { writingMode, shaperBackend: shaped ? "parley-harfrust" : "deterministic-fallback", fontSize, lineHeight, letterSpacing, fontFamily, fontStyle, textBox, blockWidth: shaped ? shaped.width : blockWidth, blockHeight, overflow: blockHeight > textBox.height + 0.5, lines, runs, warnings: [] };
}

const fillIR = (id: string, path: PathIR, c: ColorIR): SceneNodeIR => ({ id, kind: "fill-path", opacity: 1, blend: "src-over", path, paint: solidPaint(c.r, c.g, c.b, c.a), fillRule: "nonzero" });
const strokeIR = (id: string, path: PathIR, c: ColorIR, strokeWidth: number): SceneNodeIR => ({ id, kind: "stroke-path", opacity: 1, blend: "src-over", path, paint: solidPaint(c.r, c.g, c.b, c.a), strokeWidth, cap: "round", join: "round", miterLimit: 4 });

/** Phase 2 말풍선 + 한국어 가로/세로 텍스트를 Vello SceneIR로 직렬화한다. */
export function buildVelloPhase2BalloonScene(
  balloons: readonly StudioVelloBalloonSpec[],
  viewport: { readonly width: number; readonly height: number; readonly background?: ColorIR },
  options: { readonly measurer?: BubbleTextMeasurer; readonly shaper?: StudioVelloTextShaperBridge } = {},
): StudioVelloPhase2BalloonOutput {
  const layouts = new Map<string, StudioVelloBalloonTextLayoutResult>();
  const nodes: SceneNodeIR[] = [];
  let [glyphPathCount, textRunCount, verticalBalloonCount] = [0, 0, 0];

  for (const spec of balloons) {
    const geom = buildBalloonGeometryPathIR(spec);
    const layout = layoutKoreanBalloonText(spec, options);
    layouts.set(spec.id, layout);
    if (layout.writingMode === "ttb") verticalBalloonCount += 1;
    const [fill, stroke, textColor, sw] = [spec.fillColor ?? WHITE, spec.strokeColor ?? INK, spec.textColor ?? INK, Math.max(0.5, spec.strokeWidth ?? 2)];
    const children: SceneNodeIR[] = [fillIR(`${spec.id}-fill`, geom.bodyPath, fill), strokeIR(`${spec.id}-stroke`, geom.bodyPath, stroke, sw)];
    geom.satellitePaths.forEach((sat, idx) => children.push(fillIR(`${spec.id}-sat-fill-${idx}`, sat, fill), strokeIR(`${spec.id}-sat-stroke-${idx}`, sat, stroke, sw)));
    const shapedPaths = layout.runs.flatMap((r) => r.glyphPaths ?? []);
    if (shapedPaths.length > 0) {
      shapedPaths.forEach((gp, idx) => { children.push(fillIR(`${spec.id}-glyph-${idx}`, gp, textColor)); glyphPathCount += 1; });
    } else {
      layout.runs.forEach((run, idx) => { children.push({ id: `${spec.id}-run-${idx}`, kind: "text", opacity: 1, blend: "src-over", x: run.x, y: run.y, text: run.text, fontSizePx: layout.fontSize, color: textColor, fontFamily: layout.fontFamily }); textRunCount += 1; });
    }
    nodes.push({ id: `balloon-${spec.id}`, kind: "group", opacity: 1, blend: "src-over", clip: null, children });
  }
  return {
    scene: { version: 11, width: Math.max(1, Math.round(viewport.width)), height: Math.max(1, Math.round(viewport.height)), background: viewport.background ?? { r: 0, g: 0, b: 0, a: 0 }, nodes },
    layouts, stats: { balloonCount: balloons.length, glyphPathCount, textRunCount, verticalBalloonCount },
  };
}

const rgbaCss = (c: ColorIR): string => `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a})`;

function tracePathIR(ctx: CanvasRenderingContext2D, path: PathIR): void {
  ctx.beginPath();
  for (const v of path.verbs) {
    if (v.v === "M") ctx.moveTo(v.x, v.y);
    else if (v.v === "L") ctx.lineTo(v.x, v.y);
    else if (v.v === "Q") ctx.quadraticCurveTo(v.cx, v.cy, v.x, v.y);
    else if (v.v === "C") ctx.bezierCurveTo(v.c1x, v.c1y, v.c2x, v.c2y, v.x, v.y);
    else ctx.closePath();
  }
}

/** Zero-dep 네이티브 Canvas 2D 폴백 렌더러 — 말풍선 베지어 + 가로/세로쓰기 런을 동일 좌표로 그린다. */
export function renderPhase2BalloonToCanvas2D(ctx: CanvasRenderingContext2D, output: StudioVelloPhase2BalloonOutput, dpr = 1): void {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? Math.min(4, Math.max(1, dpr)) : 1;
  ctx.save();
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, output.scene.width, output.scene.height);
  for (const group of output.scene.nodes) {
    if (group.kind !== "group") continue;
    const layout = output.layouts.get(group.id.replace(/^balloon-/u, ""));
    let textFill = rgbaCss(INK);
    for (const child of group.children) {
      if (child.kind === "fill-path" && child.paint.kind === "solid") { tracePathIR(ctx, child.path); ctx.fillStyle = rgbaCss(child.paint.color); ctx.fill(child.fillRule); }
      else if (child.kind === "stroke-path" && child.paint.kind === "solid") { tracePathIR(ctx, child.path); ctx.strokeStyle = rgbaCss(child.paint.color); ctx.lineWidth = child.strokeWidth; ctx.lineCap = child.cap; ctx.lineJoin = child.join; ctx.stroke(); }
      else if (child.kind === "text") { textFill = rgbaCss(child.color); }
    }
    if (!layout || layout.shaperBackend === "parley-harfrust") continue;
    ctx.font = `${layout.fontStyle} ${layout.fontSize}px ${layout.fontFamily}`;
    ctx.fillStyle = textFill;
    for (const run of layout.runs) {
      ctx.save();
      ctx.translate(run.x, run.y);
      if (run.rotationDeg === 90) ctx.rotate(Math.PI / 2);
      if (run.horizontalScale !== 1) ctx.scale(run.horizontalScale, 1);
      run.text.split("\n").forEach((part, idx) => ctx.fillText(part, 0, idx * (layout.fontSize + layout.letterSpacing)));
      ctx.restore();
    }
  }
  ctx.restore();
}

export function renderPhase2BalloonFrame(
  balloons: readonly StudioVelloBalloonSpec[],
  viewport: { readonly width: number; readonly height: number; readonly background?: ColorIR },
  options: StudioVelloPhase2RenderOptions = {},
): StudioVelloPhase2RenderResult {
  const output = buildVelloPhase2BalloonScene(balloons, viewport, options);
  if (options.velloSubmit) { options.velloSubmit(output.scene); return { backend: "vello", output }; }
  if (options.canvas2d) { renderPhase2BalloonToCanvas2D(options.canvas2d, output, options.dpr); return { backend: "canvas2d-fallback", output }; }
  return { backend: "scene-ir-only", output };
}
