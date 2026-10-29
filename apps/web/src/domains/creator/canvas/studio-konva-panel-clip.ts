import { traceStudioFrameClip, type StudioFrameClip } from "@toonstudio/studio-project-model/frame-clip";
import type Konva from "konva";

export function studioKonvaPanelClip(clip: StudioFrameClip | null | undefined): Pick<Konva.GroupConfig,
  "clipX" | "clipY" | "clipWidth" | "clipHeight" | "clipFunc"> {
  if (!clip) return {};
  if (!clip.points) return { clipX: clip.x, clipY: clip.y, clipWidth: clip.width, clipHeight: clip.height };
  return { clipFunc: (context: Konva.Context) => { context.beginPath(); traceStudioFrameClip(context, clip); } };
}
