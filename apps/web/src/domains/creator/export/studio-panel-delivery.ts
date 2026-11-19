import {
  collectDialogueItems, collectSpatialFrames, inferredFrameRank,
  type DialogueElementLike, type DialoguePageLike, type SpatialFrame,
} from "../lettering/studio-dialogue-batch";
import { isEffectivelyHidden } from "../studio-layers";
import type { WatermarkSettings } from "../studio-watermark";
import { canvasToBlob } from "./studio-export";
import { exportMenuText } from "./studio-export-menu-i18n";
import { drawWatermarkOnSlice } from "./studio-export-presets";

type PanelElement = DialogueElementLike & { storyBeat?: { summary?: string }; points?: readonly number[] };
export type PanelPage = Omit<DialoguePageLike, "elements"> & { elements: readonly PanelElement[] };
type Panel = { pageIndex: number; number: number; frame?: SpatialFrame; points?: readonly number[]; action: string; lines: string[] };
export type PanelDeliveryFormat = "text" | "squares" | "sheet";

export function listDeliveryPanels(pages: readonly PanelPage[], indices: readonly number[]) {
  const panels: Panel[] = [];
  const outside: { pageIndex: number; lines: string[] }[] = [];
  for (const pageIndex of indices) {
    const page = pages[pageIndex];
    if (!page) throw new Error(exportMenuText("panelRangeChanged"));
    const visible = page.elements.filter(el => !isEffectivelyHidden(el, page.groups ?? []));
    const frames = collectSpatialFrames(visible);
    const byId = new Map(visible.map(el => [el.id, el]));
    const pagePanels: Panel[] = frames.map((frame, index) => {
      const source = byId.get(frame.id);
      return { pageIndex, number: index + 1, frame, points: source?.points, action: source?.storyBeat?.summary?.trim() ?? "", lines: [] };
    });
    if (frames.length === 0) pagePanels.push({ pageIndex, number: 1, action: "", lines: [] });
    const unassigned: string[] = [];
    for (const item of collectDialogueItems([{ ...page, elements: visible }])) {
      const el = byId.get(item.id);
      if (!el || !item.text.trim()) continue;
      const panel = pagePanels[inferredFrameRank(el, frames)];
      (panel?.lines ?? unassigned).push(item.text);
    }
    panels.push(...pagePanels);
    if (unassigned.length) outside.push({ pageIndex, lines: unassigned });
  }
  return { panels, outside };
}

export function panelScriptText(title: string, plan: ReturnType<typeof listDeliveryPanels>) {
  const sections = [title.trim()];
  const margins = new Map(plan.outside.map(entry => [entry.pageIndex, entry.lines]));
  for (const [index, panel] of plan.panels.entries()) {
    sections.push([exportMenuText("panelScriptHeading", { page: panel.pageIndex + 1, panel: panel.number }),
      panel.action, ...panel.lines].filter(Boolean).join("\n"));
    const margin = margins.get(panel.pageIndex);
    if (margin && plan.panels[index + 1]?.pageIndex !== panel.pageIndex) {
      sections.push([exportMenuText("panelOutside", { page: panel.pageIndex + 1 }), ...margin].join("\n"));
    }
  }
  return sections.filter(Boolean).join("\n\n") + "\n";
}

const tileSize = 1080;

function drawPanel(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, panel: Panel, canvasWidth: number, left: number, top: number) {
  if (!(canvasWidth > 0 && source.width > 0 && source.height > 0)) throw new Error(exportMenuText("panelRangeChanged"));
  const scale = source.width / canvasWidth;
  const x = (panel.frame?.x ?? 0) * scale, y = (panel.frame?.y ?? 0) * scale;
  const w = panel.frame ? panel.frame.width * scale : source.width;
  const h = panel.frame ? panel.frame.height * scale : source.height;
  if (!(w > 0 && h > 0 && x < source.width && y < source.height && x + w > 0 && y + h > 0)) {
    throw new Error(exportMenuText("panelOffPage", { page: panel.pageIndex + 1, panel: panel.number }));
  }
  const fit = tileSize / Math.max(w, h);
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(left, top, tileSize, tileSize);
    ctx.clip();
    ctx.translate(left + (tileSize - w * fit) / 2, top + (tileSize - h * fit) / 2);
    // 사선 프레임의 바깥에 있는 이웃 컷은 출력하지 않는다.
    if (panel.points && panel.points.length >= 6 && panel.points.length % 2 === 0 && panel.points.every(Number.isFinite)) {
      ctx.beginPath();
      ctx.moveTo(panel.points[0] * scale * fit, panel.points[1] * scale * fit);
      for (let i = 2; i < panel.points.length; i += 2) ctx.lineTo(panel.points[i] * scale * fit, panel.points[i + 1] * scale * fit);
      ctx.closePath();
      ctx.clip();
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, x, y, w, h, 0, 0, w * fit, h * fit);
  } finally { ctx.restore(); }
}

export async function renderPanelDelivery(input: {
  format: "squares" | "sheet"; plan: ReturnType<typeof listDeliveryPanels>; canvasWidth: number;
  captures: Map<number, HTMLCanvasElement>; transparent: boolean; watermark: WatermarkSettings;
  signal: AbortSignal; onProgress: (completed: number, total: number) => void;
}): Promise<{ blob: Blob; extension: "zip" | "png" }> {
  const { buildStudioPackageArchiveBlob, STUDIO_PACKAGE_ARCHIVE_LIMITS } = await import("../studio-package-archive");
  const { panels } = input.plan;
  const perFile = input.format === "sheet" ? 4 : 1;
  const fileCount = Math.ceil(panels.length / perFile);
  if (!fileCount || fileCount > STUDIO_PACKAGE_ARCHIVE_LIMITS.maxFiles) throw new Error(exportMenuText("panelReduceRange"));
  const entries: { path: string; data: Blob }[] = [];
  let bytes = 0;
  for (let first = 0; first < panels.length; first += perFile) {
    input.signal.throwIfAborted();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = perFile === 4 ? tileSize * 2 : tileSize;
    try {
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error(exportMenuText("panelCanvasFailed"));
      if (!input.transparent) { ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      const batch = panels.slice(first, first + perFile);
      for (const [slot, panel] of batch.entries()) {
        const source = input.captures.get(panel.pageIndex);
        if (!source) throw new Error(exportMenuText("panelRangeChanged"));
        drawPanel(ctx, source, panel, input.canvasWidth, slot % 2 * tileSize, Math.floor(slot / 2) * tileSize);
      }
      drawWatermarkOnSlice(canvas, input.watermark);
      const blob = await canvasToBlob(canvas);
      input.signal.throwIfAborted();
      bytes += blob.size;
      if (bytes > STUDIO_PACKAGE_ARCHIVE_LIMITS.maxTotalBytes) throw new Error(exportMenuText("panelReduceRange"));
      if (input.format === "sheet" && fileCount === 1) return { blob, extension: "png" };
      const serial = String(entries.length + 1).padStart(4, "0");
      entries.push({ path: (perFile === 4 ? "sheet-" : "panel-") + serial + ".png", data: blob });
      input.onProgress(first + batch.length, panels.length);
    } finally { canvas.width = canvas.height = 1; }
  }
  return { blob: await buildStudioPackageArchiveBlob(entries, { signal: input.signal }), extension: "zip" };
}
