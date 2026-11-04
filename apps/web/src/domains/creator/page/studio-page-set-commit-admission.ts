import { studioLayerCompPageAdmissionError } from "../layer/studio-layer-comp-page-admission";
import { hasStudioBg3dSixPassImageMarker } from "../studio-cuttoon-editor/runtime/bg3d-six-pass/studio-bg3d-six-pass-persistence-markers";
import { STUDIO_PROJECT_MAX_CANVAS_HEIGHT, STUDIO_PROJECT_MAX_PAGES } from "../studio-project-file";
import { frozenStatus6Text } from "../status-i18n/studio-frozen6-status-i18n";
import type { PageState } from "../studio-page-state";

/** 원고의 레이어 삭제와 달리 페이지 제거에는 별도 보존 계약이 필요하다. */
export function studioBg3dRetainedPageRemovalReason(before: readonly PageState[], after: readonly PageState[]): string | null {
  const remaining = new Set(after.map((page) => page.id));
  const removesRetainedPage = before.some((page) => !remaining.has(page.id) && (
    page.bg3dLtBundles?.bundles.some((bundle) => bundle.revisions.length > 0)
    || page.elements.some((element) => element.type === "image" && (element.bg3dLtBundleReference !== undefined || element.src.startsWith("bg3d-lt-artifact:")))
  ));
  return removesRetainedPage
    ? "봉인된 6패스 원본을 보존하는 페이지의 전체 삭제는 아직 지원하지 않습니다. 페이지를 유지한 채 레이어를 삭제하거나 내용을 비워 주세요."
    : null;
}

/** 페이지 세트 교체의 공통 사전 검사. pending 획·history·CRDT를 건드리기 전에 실행한다. */
export function studioPageSetCommitAdmissionError(before: readonly PageState[], after: readonly PageState[]): string | null {
  const retainedPageError = studioBg3dRetainedPageRemovalReason(before, after);
  if (retainedPageError) return retainedPageError;
  if (after.length === 0 || after.length > STUDIO_PROJECT_MAX_PAGES) {
    return frozenStatus6Text("studio.frozenStatus6.deferred.pageCountRange", { max: STUDIO_PROJECT_MAX_PAGES }, `프로젝트는 1–${STUDIO_PROJECT_MAX_PAGES}페이지 범위에서 편집할 수 있어요.`);
  }
  if (after.some((page) => !Number.isFinite(page.canvasH) || page.canvasH <= 0 || page.canvasH > STUDIO_PROJECT_MAX_CANVAS_HEIGHT)) {
    return frozenStatus6Text("studio.frozenStatus6.deferred.canvasHeightRange", { max: STUDIO_PROJECT_MAX_CANVAS_HEIGHT.toLocaleString("ko-KR") }, `페이지 높이는 1–${STUDIO_PROJECT_MAX_CANVAS_HEIGHT.toLocaleString("ko-KR")}px 범위여야 저장할 수 있어요.`);
  }
  return null;
}

/** 기존 레이어 보기 용량 검사와 불변 6패스 결박을 같은 원고 사전 검사로 실행한다. */
export function studioPageContentCommitAdmissionError(previous: PageState | undefined, next: PageState,
  admitNative?: (previous: PageState | undefined, next: PageState) => string | null): string | null {
  const layerCompError = studioLayerCompPageAdmissionError(previous, next);
  if (layerCompError) return layerCompError;
  if (![previous, next].some((page) => page?.bg3dLtBundles !== undefined || page?.elements.some(hasStudioBg3dSixPassImageMarker))) return null;
  return admitNative ? admitNative(previous, next) : "6패스 원고의 저장 검증 경로를 준비하고 있습니다. 준비가 끝난 뒤 다시 편집해 주세요.";
}
