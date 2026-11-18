import type { StudioEditorMutationTicket } from "../studio-editor-scope";
import { createCanvasImageElement, type CanvasImagePlacement } from "../studio-image-placement";
import { STUDIO_LT_CONVERT_MAX_PIXELS } from "./studio-lt-convert";
import type { StudioLtPngPair } from "./studio-lt-raster-output";

export function createStudioLtImagePair([line, tone]: StudioLtPngPair, canvas: {
  readonly canvasWidth: number; readonly canvasHeight: number; readonly placement?: CanvasImagePlacement; readonly uid: () => string;
}) {
  if (!Number.isSafeInteger(line.width) || !Number.isSafeInteger(line.height)
    || line.width < 1 || line.height < 1 || line.width * line.height > STUDIO_LT_CONVERT_MAX_PIXELS
    || line.width !== tone.width || line.height !== tone.height
    || ![line, tone].every((layer) => layer.src.startsWith("data:image/png;base64,") && layer.src.length > 22)) return null;
  const base = createCanvasImageElement({ ...canvas, id: canvas.uid(), src: tone.src, sourceWidth: tone.width, sourceHeight: tone.height });
  return [
    { ...base, name: tone.name },
    { ...base, id: canvas.uid(), src: line.src, name: line.name },
  ] as const;
}

export function applyStudioLtToManuscript(input: {
  readonly layers: StudioLtPngPair;
  readonly openedPageId: string | null;
  readonly currentPageId: string;
  readonly locked: boolean;
  readonly ticket: StudioEditorMutationTicket | null;
  readonly admit: (ticket: StudioEditorMutationTicket) => boolean;
  readonly canvas: () => Parameters<typeof createStudioLtImagePair>[1];
  readonly commit: (pair: NonNullable<ReturnType<typeof createStudioLtImagePair>>, pageId: string) => boolean;
}) {
  if (!input.openedPageId || input.openedPageId !== input.currentPageId || input.locked
    || !input.ticket || !input.admit(input.ticket)) return false;
  const pair = createStudioLtImagePair(input.layers, input.canvas());
  return Boolean(pair && input.commit(pair, input.openedPageId));
}
