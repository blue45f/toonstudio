function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function hasStudioBg3dSixPassImageMarker(element: unknown): boolean {
  return record(element) && (element.bg3dLtBundleReference !== undefined
    || (typeof element.src === "string" && element.src.startsWith("bg3d-lt-artifact:")));
}
/** 구형 패키지·복구 입구용 표식 탐지다. 전체 manifest 검증은 비동기 입장이 담당한다. */
export function hasStudioBg3dSixPassAutosaveMarkers(value: unknown): boolean {
  if (!record(value)) return false;
  const payload = record(value.payload) && typeof value.kind === "string" ? value.payload : value;
  return Array.isArray(payload.pagesList) && payload.pagesList.some((page) => record(page)
    && (page.bg3dLtBundles !== undefined || (Array.isArray(page.elements) && page.elements.some(hasStudioBg3dSixPassImageMarker))));
}
