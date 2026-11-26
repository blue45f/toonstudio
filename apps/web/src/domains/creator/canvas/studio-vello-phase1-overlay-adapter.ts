import { solidPaint } from "@toonstudio/studio-project-model";

import {
  createStudioCanvasRulerTicks,
  normalizeStudioCanvasRulerDpr,
  snapStudioCanvasRulerDevicePixel,
  STUDIO_CANVAS_RULER_THICKNESS,
} from "./studio-canvas-ruler";

import type { StudioPoint2D, StudioRect2D } from "./studio-stage-handle-types";
import type { ColorIR, PathIR, PathVerbIR, SceneIR, SceneNodeIR } from "@toonstudio/studio-project-model";

export interface StudioVelloOverlayViewport {
  readonly width: number; readonly height: number; readonly scale: number;
  readonly offsetX: number; readonly offsetY: number; readonly dpr: number;
  readonly documentWidth?: number; readonly documentHeight?: number;
}
export interface StudioVelloGuideLine {
  readonly id?: string; readonly axis: "x" | "y"; readonly position: number;
  readonly kind?: "user" | "safe-area" | "gutter" | "margin"; readonly color?: ColorIR; readonly locked?: boolean;
}
export interface StudioVelloSnapLine {
  readonly id?: string; readonly axis: "x" | "y"; readonly position: number;
  readonly start?: number; readonly end?: number; readonly color?: ColorIR;
}
export interface StudioVelloRulerOverlayConfig {
  readonly visible: boolean; readonly thickness?: number; readonly showLabels?: boolean;
  readonly backgroundColor?: ColorIR; readonly borderColor?: ColorIR; readonly tickColor?: ColorIR; readonly textColor?: ColorIR;
}
export interface StudioVelloPerspectiveGridConfig {
  readonly vanishingPoints: readonly StudioPoint2D[]; readonly horizonY?: number | null; readonly rayCount?: number;
  readonly horizonColor?: ColorIR; readonly rayColor?: ColorIR; readonly active?: boolean;
}
export interface StudioVelloMarqueeRect {
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  readonly fillColor?: ColorIR; readonly strokeColor?: ColorIR; readonly dashed?: boolean;
}
export type StudioTransformResizeHandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type StudioTransformHandleId = StudioTransformResizeHandleId | "rotate" | "move";
export interface StudioVelloTransformBox {
  readonly bounds: StudioRect2D; readonly rotationDeg?: number; readonly locked?: boolean; readonly rotatable?: boolean;
  readonly handleSizeCss?: number; readonly rotateHandleOffsetCss?: number; readonly strokeColor?: ColorIR; readonly handleFillColor?: ColorIR;
}
export interface StudioVelloPhase1OverlayState {
  readonly guides?: readonly StudioVelloGuideLine[]; readonly snapLines?: readonly StudioVelloSnapLine[];
  readonly rulers?: StudioVelloRulerOverlayConfig | null; readonly perspectiveGrid?: StudioVelloPerspectiveGridConfig | null;
  readonly marqueeRect?: StudioVelloMarqueeRect | null; readonly transformBox?: StudioVelloTransformBox | null;
}
export interface StudioTransformHandleGeometry {
  readonly id: Exclude<StudioTransformHandleId, "move">; readonly docPoint: StudioPoint2D;
  readonly screenPoint: StudioPoint2D; readonly cursor: string; readonly hitRadiusCss: number;
}
export interface StudioTransformHitResult {
  readonly handle: StudioTransformHandleId; readonly cursor: string; readonly distanceCss: number; readonly screenPoint: StudioPoint2D;
}
export interface StudioVelloPhase1OverlayOutput {
  readonly scene: SceneIR;
  readonly handles: readonly StudioTransformHandleGeometry[];
  readonly stats: {
    readonly guideCount: number; readonly snapLineCount: number; readonly rulerTickCount: number;
    readonly perspectiveRayCount: number; readonly nodeCount: number; readonly hairlineStrokeCss: number;
  };
}
export interface StudioVelloPhase1RenderOptions {
  readonly velloSubmit?: (scene: SceneIR) => void; readonly canvas2d?: CanvasRenderingContext2D | null;
}
export interface StudioVelloPhase1RenderResult {
  readonly backend: "vello" | "canvas2d-fallback" | "scene-ir-only"; readonly output: StudioVelloPhase1OverlayOutput;
}

const PALETTE: Readonly<Record<string, ColorIR>> = {
  guide: { r: 0.16, g: 0.62, b: 0.96, a: 0.85 },
  safeGuide: { r: 0.12, g: 0.45, b: 0.34, a: 0.72 },
  snap: { r: 0.94, g: 0.24, b: 0.48, a: 0.92 },
  ray: { r: 0.48, g: 0.36, b: 0.95, a: 0.32 },
  horizon: { r: 0.48, g: 0.36, b: 0.95, a: 0.72 },
  marqueeFill: { r: 0.12, g: 0.27, b: 0.21, a: 0.12 },
  marqueeStroke: { r: 0.12, g: 0.27, b: 0.21, a: 0.9 },
  transform: { r: 0.12, g: 0.27, b: 0.21, a: 0.95 },
  locked: { r: 0.85, g: 0.55, b: 0.1, a: 0.9 },
  handleFill: { r: 1, g: 1, b: 1, a: 1 },
  rulerBg: { r: 0.96, g: 0.95, b: 0.92, a: 0.96 },
  rulerBorder: { r: 0.13, g: 0.24, b: 0.19, a: 0.18 },
  rulerTick: { r: 0.13, g: 0.24, b: 0.19, a: 0.52 },
  rulerText: { r: 0.13, g: 0.24, b: 0.19, a: 0.78 },
};
const RESIZE_ORDER: readonly StudioTransformResizeHandleId[] = ["nw", "ne", "se", "sw", "n", "e", "s", "w"];
const HANDLE_BASE_DEG: Readonly<Record<StudioTransformResizeHandleId, number>> = {
  e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315,
};
const safeScale = (scale: number): number => (Number.isFinite(scale) && scale > 0 ? scale : 1);

/** 줌 배율과 무관한 1-디바이스-픽셀(DPR-crisp) 비스케일 헤어라인 두께(CSS px). */
export function hairlineStrokeWidthPx(dpr: number, devicePixels = 1): number {
  return (Number.isFinite(devicePixels) && devicePixels > 0 ? devicePixels : 1) / normalizeStudioCanvasRulerDpr(dpr);
}

/** 물리 픽셀 중심(0.5px 오프셋)으로 스냅해 DPR 흐림을 제거한다. */
export function snapToDevicePixelCenter(cssCoord: number, dpr: number): number {
  return snapStudioCanvasRulerDevicePixel(cssCoord, dpr);
}

export function documentToOverlayScreen(vp: StudioVelloOverlayViewport, pt: StudioPoint2D): StudioPoint2D {
  const s = safeScale(vp.scale);
  return { x: pt.x * s - vp.offsetX, y: pt.y * s - vp.offsetY };
}

export function overlayScreenToDocument(vp: StudioVelloOverlayViewport, pt: StudioPoint2D): StudioPoint2D {
  const s = safeScale(vp.scale);
  return { x: (pt.x + vp.offsetX) / s, y: (pt.y + vp.offsetY) / s };
}

function rotatePoint(pt: StudioPoint2D, center: StudioPoint2D, deg: number): StudioPoint2D {
  if (!deg) return pt;
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const dx = pt.x - center.x;
  const dy = pt.y - center.y;
  return { x: center.x + dx * c - dy * s, y: center.y + dx * s + dy * c };
}

export function resolveResizeHandleCursor(handle: StudioTransformHandleId, rotationDeg = 0): string {
  if (handle === "rotate") return "grab";
  if (handle === "move") return "move";
  const a = (((HANDLE_BASE_DEG[handle] + rotationDeg) % 180) + 180) % 180;
  return a < 22.5 || a >= 157.5 ? "ew-resize" : a < 67.5 ? "nwse-resize" : a < 112.5 ? "ns-resize" : "nesw-resize";
}

export function computeTransformBoxHandles(box: StudioVelloTransformBox, vp: StudioVelloOverlayViewport): StudioTransformHandleGeometry[] {
  const { x, y, width, height } = box.bounds;
  const rot = box.rotationDeg ?? 0;
  const center = { x: x + width / 2, y: y + height / 2 };
  const hitRadius = Math.max(Math.max(6, box.handleSizeCss ?? 8) * 0.9, 9);
  const raw: Readonly<Record<StudioTransformResizeHandleId, StudioPoint2D>> = {
    nw: { x, y }, n: { x: center.x, y }, ne: { x: x + width, y }, e: { x: x + width, y: center.y },
    se: { x: x + width, y: y + height }, s: { x: center.x, y: y + height }, sw: { x, y: y + height }, w: { x, y: center.y },
  };
  const handles: StudioTransformHandleGeometry[] = RESIZE_ORDER.map((id) => {
    const docPoint = rotatePoint(raw[id], center, rot);
    return {
      id, docPoint, screenPoint: documentToOverlayScreen(vp, docPoint),
      cursor: box.locked ? "not-allowed" : resolveResizeHandleCursor(id, rot), hitRadiusCss: hitRadius,
    };
  });
  if (box.rotatable !== false && !box.locked) {
    const topMid = documentToOverlayScreen(vp, rotatePoint(raw.n, center, rot));
    const rad = ((rot - 90) * Math.PI) / 180;
    const offset = Math.max(16, box.rotateHandleOffsetCss ?? 24);
    const screenPoint = { x: topMid.x + Math.cos(rad) * offset, y: topMid.y + Math.sin(rad) * offset };
    handles.push({ id: "rotate", docPoint: overlayScreenToDocument(vp, screenPoint), screenPoint, cursor: "grab", hitRadiusCss: hitRadius + 1 });
  }
  return handles;
}

/** 8-핸들·회전 핸들·회전된 OBB 내부 이동 영역에 대한 결정적 히트 테스트. */
export function hitTestTransformBox(
  box: StudioVelloTransformBox,
  vp: StudioVelloOverlayViewport,
  screenPoint: StudioPoint2D,
  options?: { readonly hitSlopCss?: number },
): StudioTransformHitResult | null {
  const slop = Math.max(0, options?.hitSlopCss ?? 0);
  let best: StudioTransformHitResult | null = null;
  for (const h of computeTransformBoxHandles(box, vp)) {
    const dist = Math.hypot(screenPoint.x - h.screenPoint.x, screenPoint.y - h.screenPoint.y);
    if (dist <= h.hitRadiusCss + slop && (!best || dist < best.distanceCss)) {
      best = { handle: h.id, cursor: h.cursor, distanceCss: dist, screenPoint: h.screenPoint };
    }
  }
  if (best) return best;
  const { x, y, width, height } = box.bounds;
  const local = rotatePoint(overlayScreenToDocument(vp, screenPoint), { x: x + width / 2, y: y + height / 2 }, -(box.rotationDeg ?? 0));
  if (local.x >= x && local.x <= x + width && local.y >= y && local.y <= y + height) {
    return { handle: "move", cursor: box.locked ? "not-allowed" : "move", distanceCss: 0, screenPoint };
  }
  return null;
}

const strokeNode = (id: string, verbs: PathVerbIR[], c: ColorIR, strokeWidth: number): SceneNodeIR => ({
  id, kind: "stroke-path", opacity: 1, blend: "src-over", path: { verbs },
  paint: solidPaint(c.r, c.g, c.b, c.a), strokeWidth, cap: "butt", join: "miter", miterLimit: 4,
});
const fillNode = (id: string, verbs: PathVerbIR[], c: ColorIR): SceneNodeIR => ({
  id, kind: "fill-path", opacity: 1, blend: "src-over", path: { verbs },
  paint: solidPaint(c.r, c.g, c.b, c.a), fillRule: "nonzero",
});
const rectVerbs = (x: number, y: number, w: number, h: number): PathVerbIR[] => [
  { v: "M", x, y }, { v: "L", x: x + w, y }, { v: "L", x: x + w, y: y + h }, { v: "L", x, y: y + h }, { v: "Z" },
];
function dashedVerbs(a: StudioPoint2D, b: StudioPoint2D, dash = 5, gap = 3): PathVerbIR[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len <= 0) return [];
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const out: PathVerbIR[] = [];
  for (let t = 0; t < len; t += dash + gap) {
    const end = Math.min(len, t + dash);
    out.push({ v: "M", x: a.x + ux * t, y: a.y + uy * t }, { v: "L", x: a.x + ux * end, y: a.y + uy * end });
  }
  return out;
}

function appendRulers(nodes: SceneNodeIR[], cfg: StudioVelloRulerOverlayConfig, vp: StudioVelloOverlayViewport, hairline: number): number {
  const t = Math.max(14, cfg.thickness ?? STUDIO_CANVAS_RULER_THICKNESS);
  const dpr = normalizeStudioCanvasRulerDpr(vp.dpr);
  const s = safeScale(vp.scale);
  nodes.push(
    fillNode("overlay-ruler-top-bg", rectVerbs(0, 0, vp.width, t), cfg.backgroundColor ?? PALETTE.rulerBg!),
    fillNode("overlay-ruler-left-bg", rectVerbs(0, t, t, Math.max(0, vp.height - t)), cfg.backgroundColor ?? PALETTE.rulerBg!),
    strokeNode("overlay-ruler-borders", [
      { v: "M", x: 0, y: snapToDevicePixelCenter(t, dpr) }, { v: "L", x: vp.width, y: snapToDevicePixelCenter(t, dpr) },
      { v: "M", x: snapToDevicePixelCenter(t, dpr), y: 0 }, { v: "L", x: snapToDevicePixelCenter(t, dpr), y: vp.height },
    ], cfg.borderColor ?? PALETTE.rulerBorder!, hairline),
  );
  const xTicks = createStudioCanvasRulerTicks({ viewportPixels: vp.width, scrollPixels: vp.offsetX, scale: vp.scale, documentExtent: vp.documentWidth ?? Math.max(vp.width / s, 1600) });
  const yTicks = createStudioCanvasRulerTicks({ viewportPixels: vp.height, scrollPixels: vp.offsetY, scale: vp.scale, documentExtent: vp.documentHeight ?? Math.max(vp.height / s, 2400) });
  const tickVerbs: PathVerbIR[] = [];
  for (const tk of xTicks) {
    if (tk.screenPosition < t || tk.screenPosition > vp.width) continue;
    const sx = snapToDevicePixelCenter(tk.screenPosition, dpr);
    tickVerbs.push({ v: "M", x: sx, y: tk.major ? 4 : t - 6 }, { v: "L", x: sx, y: t });
    if (cfg.showLabels !== false && tk.major && tk.label) {
      nodes.push({ id: `overlay-ruler-xlabel-${tk.documentPosition}`, kind: "text", opacity: 1, blend: "src-over", x: sx + 3, y: 11, text: tk.label, fontSizePx: 9, color: cfg.textColor ?? PALETTE.rulerText!, fontFamily: "ui-sans-serif, system-ui, sans-serif" });
    }
  }
  for (const tk of yTicks) {
    if (tk.screenPosition < t || tk.screenPosition > vp.height) continue;
    const sy = snapToDevicePixelCenter(tk.screenPosition, dpr);
    tickVerbs.push({ v: "M", x: tk.major ? 4 : t - 6, y: sy }, { v: "L", x: t, y: sy });
  }
  if (tickVerbs.length > 0) nodes.push(strokeNode("overlay-ruler-ticks", tickVerbs, cfg.tickColor ?? PALETTE.rulerTick!, hairline));
  return xTicks.length + yTicks.length;
}

/** Konva Phase 1 오버레이(가이드·스냅·눈금자·투시·마키·8-핸들 변형 상자)를 Vello SceneIR로 직렬화한다. */
export function buildVelloPhase1OverlayScene(state: StudioVelloPhase1OverlayState, vp: StudioVelloOverlayViewport): StudioVelloPhase1OverlayOutput {
  const width = Math.max(1, Math.round(vp.width));
  const height = Math.max(1, Math.round(vp.height));
  const dpr = normalizeStudioCanvasRulerDpr(vp.dpr);
  const hairline = hairlineStrokeWidthPx(dpr, 1);
  const nodes: SceneNodeIR[] = [];
  let perspectiveRayCount = 0;

  if (state.perspectiveGrid && state.perspectiveGrid.active !== false) {
    const rays = Math.max(4, Math.min(48, state.perspectiveGrid.rayCount ?? 12));
    const span = Math.hypot(width, height) * 1.5;
    const rayVerbs: PathVerbIR[] = [];
    for (const vpDoc of state.perspectiveGrid.vanishingPoints) {
      const origin = documentToOverlayScreen(vp, vpDoc);
      for (let i = 0; i < rays; i += 1) {
        const theta = (i / rays) * Math.PI * 2;
        rayVerbs.push({ v: "M", x: origin.x, y: origin.y }, { v: "L", x: origin.x + Math.cos(theta) * span, y: origin.y + Math.sin(theta) * span });
        perspectiveRayCount += 1;
      }
    }
    if (rayVerbs.length > 0) nodes.push(strokeNode("overlay-perspective-rays", rayVerbs, state.perspectiveGrid.rayColor ?? PALETTE.ray!, hairline));
    if (typeof state.perspectiveGrid.horizonY === "number" && Number.isFinite(state.perspectiveGrid.horizonY)) {
      const hy = snapToDevicePixelCenter(documentToOverlayScreen(vp, { x: 0, y: state.perspectiveGrid.horizonY }).y, dpr);
      nodes.push(strokeNode("overlay-perspective-horizon", [{ v: "M", x: 0, y: hy }, { v: "L", x: width, y: hy }], state.perspectiveGrid.horizonColor ?? PALETTE.horizon!, hairline));
    }
  }
  for (const [idx, g] of (state.guides ?? []).entries()) {
    const pos = snapToDevicePixelCenter(g.axis === "x" ? documentToOverlayScreen(vp, { x: g.position, y: 0 }).x : documentToOverlayScreen(vp, { x: 0, y: g.position }).y, dpr);
    const a: StudioPoint2D = g.axis === "x" ? { x: pos, y: 0 } : { x: 0, y: pos };
    const b: StudioPoint2D = g.axis === "x" ? { x: pos, y: height } : { x: width, y: pos };
    const verbs: PathVerbIR[] = g.locked ? dashedVerbs(a, b) : [{ v: "M", x: a.x, y: a.y }, { v: "L", x: b.x, y: b.y }];
    nodes.push(strokeNode(g.id ?? `overlay-guide-${idx}`, verbs, g.color ?? (g.kind === "safe-area" ? PALETTE.safeGuide! : PALETTE.guide!), hairline));
  }
  for (const [idx, s] of (state.snapLines ?? []).entries()) {
    const pos = snapToDevicePixelCenter(s.axis === "x" ? documentToOverlayScreen(vp, { x: s.position, y: 0 }).x : documentToOverlayScreen(vp, { x: 0, y: s.position }).y, dpr);
    const lo = s.start !== undefined ? (s.axis === "x" ? documentToOverlayScreen(vp, { x: 0, y: s.start }).y : documentToOverlayScreen(vp, { x: s.start, y: 0 }).x) : 0;
    const hi = s.end !== undefined ? (s.axis === "x" ? documentToOverlayScreen(vp, { x: 0, y: s.end }).y : documentToOverlayScreen(vp, { x: s.end, y: 0 }).x) : (s.axis === "x" ? height : width);
    const verbs: PathVerbIR[] = s.axis === "x" ? [{ v: "M", x: pos, y: lo }, { v: "L", x: pos, y: hi }] : [{ v: "M", x: lo, y: pos }, { v: "L", x: hi, y: pos }];
    nodes.push(strokeNode(s.id ?? `overlay-snap-${idx}`, verbs, s.color ?? PALETTE.snap!, hairline));
  }
  if (state.marqueeRect) {
    const mx = Math.min(state.marqueeRect.x, state.marqueeRect.x + state.marqueeRect.width);
    const my = Math.min(state.marqueeRect.y, state.marqueeRect.y + state.marqueeRect.height);
    const tl = documentToOverlayScreen(vp, { x: mx, y: my });
    const br = documentToOverlayScreen(vp, { x: mx + Math.abs(state.marqueeRect.width), y: my + Math.abs(state.marqueeRect.height) });
    const x0 = snapToDevicePixelCenter(tl.x, dpr);
    const y0 = snapToDevicePixelCenter(tl.y, dpr);
    const w0 = Math.max(0, snapToDevicePixelCenter(br.x, dpr) - x0);
    const h0 = Math.max(0, snapToDevicePixelCenter(br.y, dpr) - y0);
    nodes.push(fillNode("overlay-marquee-fill", rectVerbs(x0, y0, w0, h0), state.marqueeRect.fillColor ?? PALETTE.marqueeFill!));
    const sv = state.marqueeRect.dashed !== false
      ? [...dashedVerbs({ x: x0, y: y0 }, { x: x0 + w0, y: y0 }), ...dashedVerbs({ x: x0 + w0, y: y0 }, { x: x0 + w0, y: y0 + h0 }), ...dashedVerbs({ x: x0 + w0, y: y0 + h0 }, { x: x0, y: y0 + h0 }), ...dashedVerbs({ x: x0, y: y0 + h0 }, { x: x0, y: y0 })]
      : rectVerbs(x0, y0, w0, h0);
    nodes.push(strokeNode("overlay-marquee-stroke", sv, state.marqueeRect.strokeColor ?? PALETTE.marqueeStroke!, hairline));
  }
  const handles = state.transformBox ? computeTransformBoxHandles(state.transformBox, vp) : [];
  if (state.transformBox) {
    const stroke = state.transformBox.strokeColor ?? (state.transformBox.locked ? PALETTE.locked! : PALETTE.transform!);
    const fill = state.transformBox.handleFillColor ?? PALETTE.handleFill!;
    const byId = new Map(handles.map((h) => [h.id, h.screenPoint]));
    const [nw, ne, se, sw] = [byId.get("nw")!, byId.get("ne")!, byId.get("se")!, byId.get("sw")!];
    nodes.push(strokeNode("overlay-transform-frame", [{ v: "M", x: nw.x, y: nw.y }, { v: "L", x: ne.x, y: ne.y }, { v: "L", x: se.x, y: se.y }, { v: "L", x: sw.x, y: sw.y }, { v: "Z" }], stroke, hairline));
    const hs = Math.max(6, state.transformBox.handleSizeCss ?? 8);
    for (const h of handles) {
      if (h.id === "rotate") {
        const nPt = byId.get("n")!;
        nodes.push(strokeNode("overlay-transform-rotate-stem", [{ v: "M", x: nPt.x, y: nPt.y }, { v: "L", x: h.screenPoint.x, y: h.screenPoint.y }], stroke, hairline));
      }
      const hv = rectVerbs(h.screenPoint.x - hs / 2, h.screenPoint.y - hs / 2, hs, hs);
      nodes.push(fillNode(`overlay-transform-handle-fill-${h.id}`, hv, fill), strokeNode(`overlay-transform-handle-stroke-${h.id}`, hv, stroke, hairline));
    }
  }
  const rulerTickCount = state.rulers?.visible ? appendRulers(nodes, state.rulers, vp, hairline) : 0;
  return {
    scene: { version: 11, width, height, background: { r: 0, g: 0, b: 0, a: 0 }, nodes },
    handles,
    stats: { guideCount: state.guides?.length ?? 0, snapLineCount: state.snapLines?.length ?? 0, rulerTickCount, perspectiveRayCount, nodeCount: nodes.length, hairlineStrokeCss: hairline },
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

/** Zero-dep 네이티브 Canvas 2D 폴백 렌더러 — Vello SceneIR 명령을 동일 픽셀 정렬로 재생한다. */
export function renderPhase1OverlayToCanvas2D(ctx: CanvasRenderingContext2D, output: StudioVelloPhase1OverlayOutput, vp: StudioVelloOverlayViewport): void {
  const dpr = normalizeStudioCanvasRulerDpr(vp.dpr);
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, output.scene.width, output.scene.height);
  const draw = (list: readonly SceneNodeIR[]): void => {
    for (const node of list) {
      if (node.kind === "group") draw(node.children);
      else if (node.kind === "fill-path" && node.paint.kind === "solid") { tracePathIR(ctx, node.path); ctx.fillStyle = rgbaCss(node.paint.color); ctx.fill(node.fillRule); }
      else if (node.kind === "stroke-path" && node.paint.kind === "solid") { tracePathIR(ctx, node.path); ctx.strokeStyle = rgbaCss(node.paint.color); ctx.lineWidth = node.strokeWidth; ctx.lineCap = node.cap; ctx.lineJoin = node.join; ctx.stroke(); }
      else if (node.kind === "text") { ctx.fillStyle = rgbaCss(node.color); ctx.font = `${node.fontSizePx}px ${node.fontFamily}`; ctx.fillText(node.text, node.x, node.y); }
    }
  };
  draw(output.scene.nodes);
  ctx.restore();
}

export function renderPhase1OverlayFrame(state: StudioVelloPhase1OverlayState, vp: StudioVelloOverlayViewport, options: StudioVelloPhase1RenderOptions = {}): StudioVelloPhase1RenderResult {
  const output = buildVelloPhase1OverlayScene(state, vp);
  if (options.velloSubmit) { options.velloSubmit(output.scene); return { backend: "vello", output }; }
  if (options.canvas2d) { renderPhase1OverlayToCanvas2D(options.canvas2d, output, vp); return { backend: "canvas2d-fallback", output }; }
  return { backend: "scene-ir-only", output };
}
