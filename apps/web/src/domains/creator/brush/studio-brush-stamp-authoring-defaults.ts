import { resolveStudioCc0MypaintStampTuning } from "../studio-cc0-mypaint-preset-import-v1";
import { resolveStudioStampBrushKind, STUDIO_STAMP_BRUSH_DEFAULTS } from "./studio-brush-stamp-engine";

import type { StudioBrushStampTuning } from "./studio-brush-library";

/** Used only for selection and reset; never rewrites explicit saved stroke or brush tuning. */
export function defaultStampTuningForBrushId(brushId: string): StudioBrushStampTuning | null {
  const kind = resolveStudioStampBrushKind(brushId);
  if (!kind) return null;
  // Fringe's authored deposit, hardness, and size floor must not be replaced by generic
  // watercolor defaults when the editor snapshots the active controls into a new stroke.
  const authored = brushId === "mypaint-cc0--watercolor-fringe"
    ? resolveStudioCc0MypaintStampTuning(brushId)
    : null;
  const defaults = authored ?? STUDIO_STAMP_BRUSH_DEFAULTS[kind];
  return { flow: defaults.flow, hardness: defaults.hardness, minSize: defaults.minSizeRatio };
}
