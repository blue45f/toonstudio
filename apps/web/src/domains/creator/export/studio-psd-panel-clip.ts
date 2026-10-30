import { studioFrameClip, studioFrameClipBounds, traceStudioFrameClip,
  type StudioFrameGeometry } from "@toonstudio/studio-project-model/frame-clip";
import { StudioPsdExportError } from "./studio-psd-export-error";

/** 개별 노드 캡처에서 빠진 부모 클립을 같은 문서 경로로 복원한다. */
export function applyStudioPsdPanelClip(canvas: HTMLCanvasElement, originDocX: number, originDocY: number,
  scale: number, panel: StudioFrameGeometry): void {
  const clip = studioFrameClip(panel);
  const context = canvas.getContext("2d");
  if (!context) throw new StudioPsdExportError("panelCropSurfaceFailed");
  context.save();
  try {
    context.setTransform(scale, 0, 0, scale, -originDocX * scale, -originDocY * scale);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "destination-in";
    context.fillStyle = "#000";
    context.beginPath();
    traceStudioFrameClip(context, clip);
    context.fill();
  } finally { context.restore(); }
}

export function cropToPanel(canvas: HTMLCanvasElement, originDocX: number, originDocY: number,
  scale: number, panel: StudioFrameGeometry): { canvas: HTMLCanvasElement; dx: number; dy: number } {
  const bounds = studioFrameClipBounds(studioFrameClip(panel));
  const x0 = Math.floor(Math.max(0, (bounds.x - originDocX) * scale));
  const y0 = Math.floor(Math.max(0, (bounds.y - originDocY) * scale));
  const x1 = Math.ceil(Math.min(canvas.width, (bounds.x + bounds.width - originDocX) * scale));
  const y1 = Math.ceil(Math.min(canvas.height, (bounds.y + bounds.height - originDocY) * scale));
  const width = x1 - x0, height = y1 - y0;
  if (width > 0 && height > 0 && x0 === 0 && y0 === 0 && width === canvas.width && height === canvas.height) {
    return { canvas, dx: 0, dy: 0 };
  }
  const cropped = document.createElement("canvas");
  cropped.width = Math.max(1, width); cropped.height = Math.max(1, height);
  const context = cropped.getContext("2d");
  if (!context) throw new StudioPsdExportError("panelCropSurfaceFailed");
  if (width > 0 && height > 0) context.drawImage(canvas, x0, y0, width, height, 0, 0, width, height);
  return { canvas: cropped, dx: x0, dy: y0 };
}
