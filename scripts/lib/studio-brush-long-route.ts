import type { StudioDurabilityViewport } from "./studio-durability-viewport";

/** Choose a visible pointer route whose saved document stroke can clear the 300 px gate. */
export function studioLongBrushRoute(view: StudioDurabilityViewport) {
  const { documentToScreen, visibleBox, viewport } = view;
  const scale = Math.hypot(documentToScreen[0], documentToScreen[1]);
  const left = visibleBox.x + 70;
  const right = visibleBox.x + visibleBox.width - 70;
  const preferredLeft = Math.max(left, viewport.width * 0.34);
  const preferredRight = Math.min(right, viewport.width * 0.69);
  // Allow for pointer rounding and endpoint filtering at either end of the saved stroke.
  const width = Math.max(300, Math.ceil(320 * scale), preferredRight - preferredLeft);
  if (!Number.isFinite(width) || scale <= 0 || right - left < width) {
    throw new Error("visible paper cannot fit a 300 document px brush stroke at the current zoom");
  }
  const startX = Math.max(left, Math.min((preferredLeft + preferredRight - width) / 2, right - width));
  const top = Math.max(visibleBox.y + 70, viewport.height * 0.18);
  const bottom = Math.min(visibleBox.y + visibleBox.height - 70, viewport.height * 0.52);
  if (bottom - top < 120) throw new Error("visible canvas is too short for the isolated long-brush lane");
  return { startX, endX: startX + width, y: (top + bottom) / 2 };
}
