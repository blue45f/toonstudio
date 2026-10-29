import type { StudioFrameClip } from "@toonstudio/studio-project-model/frame-clip";
import type { Canvas, CanvasKit } from "canvaskit-wasm";

/** Konva·내보내기와 같은 문서 좌표 winding 클립을 GPU에도 적용한다. */
export function clipSkiaDocumentItem(ck: CanvasKit, canvas: Canvas, clip: StudioFrameClip): void {
  if (!clip.points) {
    canvas.clipRect([clip.x, clip.y, clip.x + clip.width, clip.y + clip.height], ck.ClipOp.Intersect, true);
    return;
  }
  const builder = new ck.PathBuilder();
  try {
    for (let index = 0; index < clip.points.length; index += 2) {
      const x = clip.points[index], y = clip.points[index + 1];
      if (x === undefined || y === undefined) throw new Error("컷 좌표 쌍이 누락됐습니다.");
      if (index === 0) builder.moveTo(x, y); else builder.lineTo(x, y);
    }
    builder.close();
    const path = builder.detach();
    try { canvas.clipPath(path, ck.ClipOp.Intersect, true); } finally { path.delete(); }
  } finally { builder.delete(); }
}
