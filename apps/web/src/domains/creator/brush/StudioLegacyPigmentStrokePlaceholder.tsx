import { Shape } from "react-konva/lib/ReactKonvaCore";
import { brushCanvasStatusText } from "../status-i18n/studio-brush-canvas-status-i18n-core";

/** 외부 혼색의 원본 픽셀로 오인하지 않도록 해당 획의 확인 필요 영역만 표시한다. */
export default function StudioLegacyPigmentStrokePlaceholder({ points }: { readonly points: readonly number[] }) {
  return <Shape listening={false} perfectDrawEnabled={false} sceneFunc={(context) => {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (let index = 0; index + 1 < points.length; index += 2) {
      const x = points[index], y = points[index + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (!Number.isFinite(left)) return;
    const width = Math.max(160, right - left), height = Math.max(30, bottom - top);
    const canvas = context._context;
    canvas.save();
    try {
      canvas.strokeStyle = "#a16207"; canvas.fillStyle = "#854d0e";
      canvas.setLineDash([5, 4]); canvas.strokeRect(left, top, width, height);
      canvas.font = "12px sans-serif";
      canvas.fillText(brushCanvasStatusText("studio.brushCanvasStatus.canvas.legacyPigmentConfirm", "이전 혼색 획 · 확인 필요"), left + 5, top + 18);
    } finally { canvas.restore(); }
  }} />;
}
