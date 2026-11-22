import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { DodgeBurnMode, DodgeBurnRange, DodgeBurnSpongeMode } from "../studio-dodge-burn";
import type { StudioEditorMutationTicket } from "../studio-editor-scope";
import type { El, ImageEl } from "../studio-element-model";
import { hexToRgb } from "../studio-filters";
import { isEffectivelyLocked, type LayerGroup } from "../studio-layers";
import type { createStudioPixelEditCanvas } from "../studio-legacy-editor-runtime-helpers";
import { flipNormalizedPoint } from "../studio-magic-wand";
import { loadStudioPixelEditBrushRuntime } from "../studio-page-editor-runtime-loaders";
import type { SelPoint } from "../studio-selection-tools";

type PixelEditBrushRuntime = Awaited<ReturnType<typeof loadStudioPixelEditBrushRuntime>>;

interface StudioRasterStrokeBaseInput {
  readonly elId: string;
  readonly points: readonly SelPoint[];
  readonly activeElementsRef: MutableRefObject<El[]>;
  readonly activeSurfaceReviewLocked: boolean;
  readonly groups: LayerGroup[];
  readonly captureStudioMutationTicket: () => StudioEditorMutationTicket;
  readonly canApplyStudioMutation: (ticket: StudioEditorMutationTicket) => boolean;
  readonly isLatestLayerContentMutationLocked: (elementId: string) => boolean;
  readonly commitUpdatedSrc: (target: ImageEl & El, src: string) => void;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly applyFailedMessage: string;
}

export async function runStudioSmudgeStroke({
  elId, points, smudgeBusy, smudgeAbortRef, activeElementsRef, activeSurfaceReviewLocked,
  groups, smudgeRadius, smudgeStrength, captureStudioMutationTicket, canApplyStudioMutation,
  isLatestLayerContentMutationLocked, commitUpdatedSrc, setSmudgeBusy, setError, applyFailedMessage,
}: StudioRasterStrokeBaseInput & {
  readonly smudgeBusy: boolean;
  readonly smudgeAbortRef: MutableRefObject<AbortController | null>;
  readonly smudgeRadius: number;
  readonly smudgeStrength: number;
  readonly setSmudgeBusy: Dispatch<SetStateAction<boolean>>;
}): Promise<void> {
  if (smudgeBusy || smudgeAbortRef.current) return;
  const target = activeElementsRef.current.find((element) => element.id === elId);
  if (
    !target
    || target.type !== "image"
    || activeSurfaceReviewLocked
    || isEffectivelyLocked(target, groups)
  ) return;
  const mutationTicket = captureStudioMutationTicket();
  const controller = new AbortController();
  smudgeAbortRef.current = controller;
  setSmudgeBusy(true);
  try {
    const { smudgeStrokeImage } = await loadStudioPixelEditBrushRuntime();
    const radiusNorm = smudgeRadius / Math.max(1, target.width);
    const src = await smudgeStrokeImage(target.src, points, radiusNorm, smudgeStrength / 100, {
      flipX: target.flipped,
      flipY: target.flippedY,
      signal: controller.signal,
    });
    if (!canApplyStudioMutation(mutationTicket)) return;
    if (src !== target.src && !isLatestLayerContentMutationLocked(target.id)) {
      commitUpdatedSrc(target, src);
    }
    setError(null);
  } catch (err) {
    if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) return;
    console.error("Failed to apply smudge stroke:", err);
    setError(err instanceof Error ? err.message : applyFailedMessage);
  } finally {
    if (smudgeAbortRef.current === controller) {
      smudgeAbortRef.current = null;
      setSmudgeBusy(false);
    }
  }
}

export async function runStudioDodgeBurnStroke({
  elId, points, dodgeBurnBusy, dodgeBurnAbortRef, activeElementsRef, activeSurfaceReviewLocked,
  groups, dodgeBurnRadius, dodgeBurnHardness, dodgeBurnExposure, dodgeBurnMode,
  dodgeBurnRange, dodgeBurnSponge, captureStudioMutationTicket, canApplyStudioMutation,
  isLatestLayerContentMutationLocked, loadSourceImage, createCanvas, commitUpdatedSrc,
  setDodgeBurnBusy, setError, canvasCreateFailedMessage, applyFailedMessage,
}: StudioRasterStrokeBaseInput & {
  readonly dodgeBurnBusy: boolean;
  readonly dodgeBurnAbortRef: MutableRefObject<AbortController | null>;
  readonly dodgeBurnRadius: number;
  readonly dodgeBurnHardness: number;
  readonly dodgeBurnExposure: number;
  readonly dodgeBurnMode: DodgeBurnMode;
  readonly dodgeBurnRange: DodgeBurnRange;
  readonly dodgeBurnSponge: DodgeBurnSpongeMode;
  readonly loadSourceImage: (
    runtime: PixelEditBrushRuntime,
    src: string,
    signal: AbortSignal,
  ) => ReturnType<PixelEditBrushRuntime["loadStudioRetouchSourceImage"]>;
  readonly createCanvas: typeof createStudioPixelEditCanvas;
  readonly setDodgeBurnBusy: Dispatch<SetStateAction<boolean>>;
  readonly canvasCreateFailedMessage: string;
}): Promise<void> {
  if (dodgeBurnBusy || dodgeBurnAbortRef.current) return;
  const target = activeElementsRef.current.find((element) => element.id === elId);
  if (
    !target
    || target.type !== "image"
    || activeSurfaceReviewLocked
    || isEffectivelyLocked(target, groups)
  ) return;
  const mutationTicket = captureStudioMutationTicket();
  const controller = new AbortController();
  dodgeBurnAbortRef.current = controller;
  setDodgeBurnBusy(true);
  try {
    const runtime = await loadStudioPixelEditBrushRuntime();
    const {
      encodeStudioRetouchCanvasPng,
      planStudioRasterRetouchRegion,
      runStudioDodgeBurnRetouch,
      studioRetouchSourceDimensions,
      translateStudioRasterRetouchPoints,
    } = runtime;
    const img = await loadSourceImage(runtime, target.src, controller.signal);
    const { width: w, height: h } = studioRetouchSourceDimensions(img);
    const made = createCanvas(w, h);
    if (!made) throw new Error(canvasCreateFailedMessage);
    made.ctx.drawImage(img, 0, 0, w, h);
    const flipX = target.flipped ?? false;
    const flipY = target.flippedY ?? false;
    const pixelPoints = points.map((p) => {
      const unflipped = flipNormalizedPoint(p, flipX, flipY);
      return { x: unflipped.x * w, y: unflipped.y * h };
    });
    const radiusPx = Math.max(1, (dodgeBurnRadius / Math.max(1, target.width)) * w);
    const region = planStudioRasterRetouchRegion(pixelPoints, radiusPx, w, h);
    if (!region) return;
    const imageData = made.ctx.getImageData(region.x, region.y, region.width, region.height);
    const pixels = await runStudioDodgeBurnRetouch(
      imageData.data,
      region.width,
      region.height,
      translateStudioRasterRetouchPoints(pixelPoints, region),
      {
        radiusPx,
        hardness: dodgeBurnHardness,
        exposure: dodgeBurnExposure,
        mode: dodgeBurnMode,
        range: dodgeBurnRange,
        sponge: dodgeBurnSponge,
      },
      { signal: controller.signal },
    );
    const output = made.ctx.createImageData(region.width, region.height);
    output.data.set(pixels);
    made.ctx.putImageData(output, region.x, region.y);
    const src = await encodeStudioRetouchCanvasPng(made.canvas, { signal: controller.signal });
    if (!canApplyStudioMutation(mutationTicket)) return;
    if (src !== target.src && !isLatestLayerContentMutationLocked(target.id)) {
      commitUpdatedSrc(target, src);
    }
    setError(null);
  } catch (err) {
    if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) return;
    console.error("Failed to apply dodge/burn stroke:", err);
    setError(err instanceof Error ? err.message : applyFailedMessage);
  } finally {
    if (dodgeBurnAbortRef.current === controller) {
      dodgeBurnAbortRef.current = null;
      setDodgeBurnBusy(false);
    }
  }
}

export async function runStudioWetMixStroke({
  elId, points, wetMixBusy, wetMixAbortRef, activeElementsRef, activeSurfaceReviewLocked,
  groups, wetMixRadius, wetMixHardness, wetMixStrength, wetMixWetness, wetMixPickup, color,
  captureStudioMutationTicket, canApplyStudioMutation, isLatestLayerContentMutationLocked,
  loadSourceImage, createCanvas, commitUpdatedSrc, setWetMixBusy, setError,
  canvasCreateFailedMessage, applyFailedMessage,
}: StudioRasterStrokeBaseInput & {
  readonly wetMixBusy: boolean;
  readonly wetMixAbortRef: MutableRefObject<AbortController | null>;
  readonly wetMixRadius: number;
  readonly wetMixHardness: number;
  readonly wetMixStrength: number;
  readonly wetMixWetness: number;
  readonly wetMixPickup: number;
  readonly color: string;
  readonly loadSourceImage: (
    runtime: PixelEditBrushRuntime,
    src: string,
    signal: AbortSignal,
  ) => ReturnType<PixelEditBrushRuntime["loadStudioRetouchSourceImage"]>;
  readonly createCanvas: typeof createStudioPixelEditCanvas;
  readonly setWetMixBusy: Dispatch<SetStateAction<boolean>>;
  readonly canvasCreateFailedMessage: string;
}): Promise<void> {
  if (wetMixBusy || wetMixAbortRef.current) return;
  const target = activeElementsRef.current.find((element) => element.id === elId);
  if (
    !target
    || target.type !== "image"
    || activeSurfaceReviewLocked
    || isEffectivelyLocked(target, groups)
  ) return;
  const mutationTicket = captureStudioMutationTicket();
  const controller = new AbortController();
  wetMixAbortRef.current = controller;
  setWetMixBusy(true);
  try {
    const runtime = await loadStudioPixelEditBrushRuntime();
    const {
      encodeStudioRetouchCanvasPng,
      getStudioWetMixModelPreference,
      planStudioRasterRetouchRegion,
      runStudioWetMixRetouch,
      studioRetouchSourceDimensions,
      translateStudioRasterRetouchPoints,
    } = runtime;
    const img = await loadSourceImage(runtime, target.src, controller.signal);
    const { width: w, height: h } = studioRetouchSourceDimensions(img);
    const made = createCanvas(w, h);
    if (!made) throw new Error(canvasCreateFailedMessage);
    made.ctx.drawImage(img, 0, 0, w, h);
    const flipX = target.flipped ?? false;
    const flipY = target.flippedY ?? false;
    const pixelPoints = points.map((p) => {
      const unflipped = flipNormalizedPoint(p, flipX, flipY);
      return { x: unflipped.x * w, y: unflipped.y * h };
    });
    const radiusPx = Math.max(1, (wetMixRadius / Math.max(1, target.width)) * w);
    const region = planStudioRasterRetouchRegion(pixelPoints, radiusPx, w, h);
    if (!region) return;
    const imageData = made.ctx.getImageData(region.x, region.y, region.width, region.height);
    const pixels = await runStudioWetMixRetouch(
      imageData.data,
      region.width,
      region.height,
      translateStudioRasterRetouchPoints(pixelPoints, region),
      {
        radiusPx,
        hardness: wetMixHardness,
        strength: wetMixStrength / 100,
        wetness: wetMixWetness / 100,
        pickup: wetMixPickup / 100,
        paintColor: hexToRgb(color),
        loadDepletion: 0.06,
        mixModel: getStudioWetMixModelPreference(),
      },
      { signal: controller.signal },
    );
    const output = made.ctx.createImageData(region.width, region.height);
    output.data.set(pixels);
    made.ctx.putImageData(output, region.x, region.y);
    const src = await encodeStudioRetouchCanvasPng(made.canvas, { signal: controller.signal });
    if (!canApplyStudioMutation(mutationTicket)) return;
    if (src !== target.src && !isLatestLayerContentMutationLocked(target.id)) {
      commitUpdatedSrc(target, src);
    }
    setError(null);
  } catch (err) {
    if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) return;
    console.error("Failed to apply wet mix stroke:", err);
    setError(err instanceof Error ? err.message : applyFailedMessage);
  } finally {
    if (wetMixAbortRef.current === controller) {
      wetMixAbortRef.current = null;
      setWetMixBusy(false);
    }
  }
}
