/** 기존 원본과 다운로드 주소를 유지하고 검증한 호환 미리보기 21개만 선택한다. */
const COMPATIBLE_SHORTS = new Set([
  "/brand/promo-shorts/shorts-1-drawing-autocolor.mp4",
  "/brand/promo-shorts/shorts-2-bg3d-collab.mp4",
  "/brand/promo-shorts/shorts-5-plan.mp4",
  "/brand/promo-shorts/shorts-6-space.mp4",
  "/brand/promo-shorts/shorts-7-assist.mp4",
  "/brand/promo-shorts/shorts-8-finish.mp4",
  "/brand/promo-shorts/shorts-11-storyboard.mp4",
  "/brand/promo-shorts/shorts-12-compare.mp4",
  "/brand/promo-shorts/shorts-13-continuity.mp4",
  "/brand/promo-shorts/shorts-14-assets.mp4",
  "/brand/promo-shorts/shorts-15-tone.mp4",
  "/brand/promo-shorts/shorts-16-expression.mp4",
  "/brand/promo-shorts/shorts-17-camera.mp4",
  "/brand/promo-shorts/shorts-19-rewind.mp4",
  "/brand/promo-shorts/shorts-20-send.mp4",
  "/brand/promo-shorts/shorts-23-pastel.mp4",
  "/brand/promo-shorts/shorts-24-nightwork.mp4",
  "/brand/promo-shorts/shorts-25-reader.mp4",
  "/brand/promo-shorts/shorts-26-handcam.mp4",
  "/brand/promo-shorts/shorts-27-alert.mp4",
  "/brand/promo-shorts/shorts-18-reactions.mp4",
]);

export function promoClipPlaybackSource(originalSrc: string): string {
  if (!COMPATIBLE_SHORTS.has(originalSrc)) return originalSrc;
  return originalSrc.replace("/brand/promo-shorts/", "/brand/promo-shorts/compat/");
}
