import { traceStudioFrameClip, type StudioFrameClip } from "@toonstudio/studio-project-model/frame-clip";
import type { StudioClipConfigLike, StudioClipContextLike } from "./studio-stage-handle-types";

export function studioKonvaPanelClip(clip: StudioFrameClip | null | undefined): StudioClipConfigLike {
  if (!clip) return {};
  if (!clip.points) return { clipX: clip.x, clipY: clip.y, clipWidth: clip.width, clipHeight: clip.height };
  return { clipFunc: (context: StudioClipContextLike) => { context.beginPath(); traceStudioFrameClip(context, clip); } };
}
