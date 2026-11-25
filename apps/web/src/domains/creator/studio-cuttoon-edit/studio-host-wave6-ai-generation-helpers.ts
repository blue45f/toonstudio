import type { Dispatch, SetStateAction } from "react";
import { CANVAS_W } from "../studio-assets";
import type { El } from "../studio-element-model";
import { uid } from "../studio-id";
import { createCanvasImageElement } from "../studio-image-placement";
import type { StudioPublishAiProvenance } from "../studio-publish-preflight";

export function runStudioInsertAiBackgroundImage({
  dataUrl, width, height, aiProvenance, selected, elements, canvasH,
  patchEl, commit, setSelectedId, setTool,
}: {
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly aiProvenance: StudioPublishAiProvenance;
  readonly selected: El | undefined;
  readonly elements: readonly El[];
  readonly canvasH: number;
  readonly patchEl: (id: string, patch: Partial<El>) => boolean;
  readonly commit: (next: El[]) => boolean;
  readonly setSelectedId: Dispatch<SetStateAction<string | null>>;
  readonly setTool: (tool: "select" | "draw") => void;
}): boolean {
  if (selected?.type === "frame") {
    if (!patchEl(selected.id, { bg: dataUrl, aiProvenance, bundleSourceCredit: undefined } as Partial<El>)) {
      return false;
    }
    setTool("select");
    return true;
  }
  const frames = elements.filter((e) => e.type === "frame");
  if (frames.length > 0) {
    if (!commit(elements.map((e) => (e.type === "frame" ? ({ ...e, bg: dataUrl, aiProvenance, bundleSourceCredit: undefined } as El) : e)))) {
      return false;
    }
    setTool("select");
    return true;
  }
  const el = createCanvasImageElement({
    id: uid(),
    src: dataUrl,
    canvasWidth: CANVAS_W,
    canvasHeight: canvasH,
    sourceWidth: width,
    sourceHeight: height,
    horizontalInset: 0,
    minY: 0,
  });
  if (!commit([{ ...el, aiProvenance }, ...elements])) return false;
  setSelectedId(el.id);
  setTool("select");
  return true;
}

export { runStudioContextNoteChange, runStudioOnGenerateAsset } from "./studio-image-ai-intents";
