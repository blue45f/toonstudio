import { isEffectivelyHidden, type LayerGroup } from "../studio-layers";
import {
  drawVignette,
  isDefaultPageGrade,
  normalizePageGrade,
  pageGradeToCssFilter,
  type PageGrade,
} from "../studio-page-grade";
import {
  buildThumbNodes,
  type ThumbElement,
  type ThumbNode,
} from "../studio-page-thumbs";
import { drawWatermarkOnSlice } from "./studio-export-presets";

import type { WatermarkSettings } from "../studio-watermark";
import type { ExportFormat } from "./studio-export";

export interface StudioExportPreviewPageLike {
  readonly id: string;
  readonly elements: readonly ThumbElement[];
  readonly bg?: string;
  readonly bgGrad?: string[] | null;
  readonly canvasH?: number;
  readonly grade?: unknown;
  readonly groups?: LayerGroup[];
  readonly hideMaster?: boolean;
}

export interface StudioExportLayerVisibilitySummary {
  readonly visibleElementCount: number;
  readonly hiddenLayerCount: number;
  readonly hiddenGroupMemberCount: number;
  readonly excludedHiddenTotal: number;
  readonly masterHidden: boolean;
  readonly effectiveTransparent: boolean;
}

export function summarizeStudioExportLayerVisibility(
  page: StudioExportPreviewPageLike,
  exportFormat: ExportFormat,
  exportTransparent: boolean,
): StudioExportLayerVisibilitySummary {
  const groups: LayerGroup[] = page.groups ?? [];
  let visibleElementCount = 0;
  let hiddenLayerCount = 0;
  let hiddenGroupMemberCount = 0;

  for (const el of page.elements) {
    if (el.hidden) {
      hiddenLayerCount += 1;
      continue;
    }
    if (isEffectivelyHidden(el, groups)) {
      hiddenGroupMemberCount += 1;
      continue;
    }
    visibleElementCount += 1;
  }

  return {
    visibleElementCount,
    hiddenLayerCount,
    hiddenGroupMemberCount,
    excludedHiddenTotal: hiddenLayerCount + hiddenGroupMemberCount,
    masterHidden: page.hideMaster === true,
    effectiveTransparent: exportTransparent && exportFormat !== "jpg",
  };
}

function applySvgTransformTo2dContext(
  ctx: CanvasRenderingContext2D,
  transform: string | null,
): void {
  if (!transform) return;
  const translateMatch = /translate\(\s*([+-]?\d*\.?\d+)[,\s]+([+-]?\d*\.?\d+)\s*\)/u.exec(transform);
  if (translateMatch) {
    ctx.translate(Number(translateMatch[1]) || 0, Number(translateMatch[2]) || 0);
  }
  const rotateAroundMatch = /rotate\(\s*([+-]?\d*\.?\d+)[,\s]+([+-]?\d*\.?\d+)[,\s]+([+-]?\d*\.?\d+)\s*\)/u.exec(
    transform,
  );
  if (rotateAroundMatch) {
    const deg = Number(rotateAroundMatch[1]) || 0;
    const cx = Number(rotateAroundMatch[2]) || 0;
    const cy = Number(rotateAroundMatch[3]) || 0;
    ctx.translate(cx, cy);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.translate(-cx, -cy);
    return;
  }
  const rotateMatch = /rotate\(\s*([+-]?\d*\.?\d+)\s*\)/u.exec(transform);
  if (rotateMatch) {
    ctx.rotate(((Number(rotateMatch[1]) || 0) * Math.PI) / 180);
  }
}

function drawThumbNodeTo2dContext(
  ctx: CanvasRenderingContext2D,
  node: ThumbNode,
  imageCache: ReadonlyMap<string, HTMLImageElement>,
): void {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, node.opacity));
  applySvgTransformTo2dContext(ctx, node.transform);

  if (node.kind === "rect") {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function" && node.rx > 0) {
      ctx.roundRect(node.x, node.y, node.w, node.h, node.rx);
    } else {
      ctx.rect(node.x, node.y, node.w, node.h);
    }
    if (node.fill) {
      ctx.save();
      ctx.globalAlpha *= node.fillOpacity;
      ctx.fillStyle = node.fill;
      ctx.fill();
      ctx.restore();
    }
    if (node.stroke && node.strokeWidth > 0) {
      ctx.strokeStyle = node.stroke;
      ctx.lineWidth = node.strokeWidth;
      if (node.dashed) ctx.setLineDash([node.strokeWidth * 2, node.strokeWidth * 2]);
      ctx.stroke();
    }
  } else if (node.kind === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(node.cx, node.cy, node.rx, node.ry, 0, 0, Math.PI * 2);
    if (node.fill) {
      ctx.fillStyle = node.fill;
      ctx.fill();
    }
    if (node.stroke && node.strokeWidth > 0) {
      ctx.strokeStyle = node.stroke;
      ctx.lineWidth = node.strokeWidth;
      ctx.stroke();
    }
  } else if (node.kind === "polygon" || node.kind === "polyline") {
    const pairs = node.points
      .trim()
      .split(/\s+/u)
      .map((pair) => pair.split(",").map(Number));
    if (pairs.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(pairs[0]![0] ?? 0, pairs[0]![1] ?? 0);
      for (let i = 1; i < pairs.length; i += 1) {
        ctx.lineTo(pairs[i]![0] ?? 0, pairs[i]![1] ?? 0);
      }
      if (node.kind === "polygon") ctx.closePath();
      if (node.kind === "polygon" && node.fill) {
        ctx.fillStyle = node.fill;
        ctx.fill();
      }
      if (node.stroke && node.strokeWidth > 0) {
        ctx.strokeStyle = node.stroke;
        ctx.lineWidth = node.strokeWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }
    }
  } else if (node.kind === "path") {
    if (typeof Path2D === "function" && node.d) {
      const path = new Path2D(node.d);
      if (node.fill) {
        ctx.fillStyle = node.fill;
        ctx.fill(path);
      }
      if (node.stroke && node.strokeWidth > 0) {
        ctx.strokeStyle = node.stroke;
        ctx.lineWidth = node.strokeWidth;
        if (node.dashed) ctx.setLineDash([node.strokeWidth * 2, node.strokeWidth * 2]);
        ctx.stroke(path);
      }
    }
  } else if (node.kind === "image") {
    const img = imageCache.get(node.src);
    if (img && img.complete && img.naturalWidth > 0) {
      if (node.filterCss) ctx.filter = node.filterCss;
      ctx.drawImage(img, node.x, node.y, node.w, node.h);
      ctx.filter = "none";
    }
  } else if (node.kind === "text") {
    ctx.font = `${node.bold ? "700" : "500"} ${node.fontSize}px ${node.font}`;
    ctx.textAlign = node.anchor === "middle" ? "center" : node.anchor === "end" ? "right" : "left";
    ctx.textBaseline = "alphabetic";
    for (let i = 0; i < node.lines.length; i += 1) {
      const line = node.lines[i] ?? "";
      const y = node.y + i * node.lineStep;
      if (node.stroke && node.strokeWidth > 0) {
        ctx.strokeStyle = node.stroke;
        ctx.lineWidth = node.strokeWidth;
        ctx.lineJoin = "round";
        ctx.strokeText(line, node.x, y);
      }
      ctx.fillStyle = node.fill;
      ctx.fillText(line, node.x, y);
    }
  }
  ctx.restore();
}

export interface RenderStudioExportCompositePreviewOptions {
  readonly page: StudioExportPreviewPageLike;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly exportFormat: ExportFormat;
  readonly exportTransparent: boolean;
  readonly watermark: WatermarkSettings;
  readonly maxPreviewEdge?: number;
  readonly imageCache?: ReadonlyMap<string, HTMLImageElement>;
}

/**
 * 실제 내보내기와 동일한 레이어 가시성·배경·투명도·색보정·워터마크 규칙으로
 * 출력 미리보기 `<canvas>`를 합성한다. 숨김 레이어·숨김 그룹·편집 오버레이는 절대 그리지 않는다.
 */
export function renderStudioExportCompositePreviewToCanvas(
  canvas: HTMLCanvasElement,
  options: RenderStudioExportCompositePreviewOptions,
): StudioExportLayerVisibilitySummary {
  const {
    page,
    canvasWidth,
    canvasHeight,
    exportFormat,
    exportTransparent,
    watermark,
    maxPreviewEdge = 360,
    imageCache = new Map(),
  } = options;
  const summary = summarizeStudioExportLayerVisibility(page, exportFormat, exportTransparent);
  const docW = Math.max(1, Math.round(canvasWidth));
  const docH = Math.max(1, Math.round(page.canvasH || canvasHeight));
  const fitRatio = Math.min(1, maxPreviewEdge / Math.max(docW, docH));
  const outW = Math.max(1, Math.round(docW * fitRatio));
  const outH = Math.max(1, Math.round(docH * fitRatio));
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return summary;
  ctx.clearRect(0, 0, outW, outH);

  const grade = normalizePageGrade(
    page.grade && typeof page.grade === "object" ? (page.grade as Partial<PageGrade>) : null,
  );
  const needsGradeBuffer = !isDefaultPageGrade(grade) && typeof document !== "undefined";
  const targetCanvas = needsGradeBuffer ? document.createElement("canvas") : canvas;
  if (needsGradeBuffer) {
    targetCanvas.width = outW;
    targetCanvas.height = outH;
  }
  const targetCtx = (needsGradeBuffer ? targetCanvas.getContext("2d") : ctx) ?? ctx;
  if (needsGradeBuffer) targetCtx.clearRect(0, 0, outW, outH);

  if (!summary.effectiveTransparent) {
    if (page.bgGrad && page.bgGrad.length >= 2 && typeof targetCtx.createLinearGradient === "function") {
      const grad = targetCtx.createLinearGradient(0, 0, 0, outH);
      const last = page.bgGrad.length - 1;
      page.bgGrad.forEach((stop, index) => {
        grad.addColorStop(index / last, stop);
      });
      targetCtx.fillStyle = grad;
    } else {
      targetCtx.fillStyle = page.bg || "#ffffff";
    }
    targetCtx.fillRect(0, 0, outW, outH);
  }

  const groups = page.groups ?? [];
  const hasEraser = page.elements.some(
    (el: ThumbElement) => !isEffectivelyHidden(el, groups) && el.type === "draw" && el.mode === "eraser",
  );
  const contentCanvas =
    hasEraser && typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (contentCanvas) {
    contentCanvas.width = outW;
    contentCanvas.height = outH;
  }
  const contentCtx = (contentCanvas ? contentCanvas.getContext("2d") : null) ?? targetCtx;
  contentCtx.save();
  contentCtx.scale(outW / docW, outH / docH);

  for (const el of page.elements) {
    if (isEffectivelyHidden(el, groups)) continue;
    if (el.type === "draw" && el.mode === "eraser" && contentCanvas) {
      const pts = Array.isArray(el.points) ? el.points : [];
      if (pts.length >= 4) {
        contentCtx.save();
        contentCtx.globalCompositeOperation = "destination-out";
        contentCtx.strokeStyle = "#000000";
        contentCtx.lineWidth = Math.max(1, el.strokeWidth ?? 8);
        contentCtx.lineCap = "round";
        contentCtx.lineJoin = "round";
        contentCtx.beginPath();
        contentCtx.moveTo(pts[0] ?? 0, pts[1] ?? 0);
        for (let i = 2; i + 1 < pts.length; i += 2) {
          contentCtx.lineTo(pts[i] ?? 0, pts[i + 1] ?? 0);
        }
        contentCtx.stroke();
        contentCtx.restore();
      }
      continue;
    }
    const normalizedEl =
      el.type === "frame" && !el.bgColor && el.fill ? { ...el, bgColor: el.fill } : el;
    const built = buildThumbNodes(
      {
        id: page.id,
        bg: page.bg ?? "#ffffff",
        bgGrad: page.bgGrad ?? null,
        canvasH: docH,
        grade: page.grade,
        elements: [normalizedEl],
        groups,
      },
      { maxNodes: 4, minStroke: 1, maxTextLines: 6, maxLineChars: 48 },
    );
    for (const node of built.nodes) {
      drawThumbNodeTo2dContext(contentCtx, node, imageCache);
    }
  }
  contentCtx.restore();

  if (contentCanvas && contentCtx !== targetCtx) {
    targetCtx.drawImage(contentCanvas, 0, 0);
  }

  if (needsGradeBuffer && targetCanvas !== canvas) {
    const cssFilter = pageGradeToCssFilter(grade);
    if (cssFilter) ctx.filter = cssFilter;
    ctx.drawImage(targetCanvas, 0, 0);
    ctx.filter = "none";
    drawVignette(ctx, outW, outH, grade.vignette);
  }
  drawWatermarkOnSlice(canvas, watermark);
  return summary;
}
