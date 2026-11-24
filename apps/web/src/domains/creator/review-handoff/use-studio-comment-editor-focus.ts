import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { CANVAS_W } from "../studio-assets";
import { studioEditorTargetForComment, type StudioEditorCommentTarget } from "../studio-comment-editor-selection";
import type { StudioCommentAnchor } from "../studio-comments";
import { projectStudioDocumentPointToView, type StudioViewRotation } from "../studio-view-controls";

export function useStudioCommentEditorFocus({
  select, open, documentEpoch, currentPageId, wrapRef, hostRef, canvasHeight, canvasFlipH, canvasRotation,
}: {
  select: (target: StudioEditorCommentTarget, current?: () => boolean) => boolean;
  open: boolean;
  documentEpoch: number;
  currentPageId: string;
  wrapRef: RefObject<HTMLDivElement | null>;
  hostRef: RefObject<HTMLDivElement | null>;
  canvasHeight: number;
  canvasFlipH: boolean;
  canvasRotation: StudioViewRotation;
}) {
  const bt = useBilingual("StudioReviewEditorFocus");
  const label = bt("검수 의견 위치", "Review comment location");
  const [request, setRequest] = useState<{ target: StudioEditorCommentTarget; epoch: number } | null>(null);
  const handled = useRef<typeof request>(null);
  const dismissed = useRef<typeof request>(null);
  useLayoutEffect(() => {
    if (!request || request === dismissed.current) return;
    const { target } = request;
    if (request.epoch !== documentEpoch || (handled.current === request && target.pageId !== currentPageId)) {
      dismissed.current = request;
      return;
    }
    if (open || target.pageId !== currentPageId || !target.point) return;

    // 페이지 전환이 끝난 뒤 새 원고의 실제 크기·회전·좌우 반전을 반영한다.
    const wrap = wrapRef.current;
    const hostNode = hostRef.current;
    const host = hostNode?.getBoundingClientRect();
    if (!wrap || !hostNode || !host || !host.width || !host.height) return;
    const viewport = wrap.getBoundingClientRect();
    const point = projectStudioDocumentPointToView({
      documentWidth: CANVAS_W, documentHeight: canvasHeight, canvasFlipH, canvasRotation,
      x: target.point.x * CANVAS_W, y: target.point.y * canvasHeight,
    });
    // 캔버스 DOM 위에만 놓아 원고 데이터·내보내기 렌더의 요소가 되지 않는다.
    const marker = hostNode.ownerDocument.createElement("span");
    marker.dataset.studioReviewFocusMarker = "true";
    marker.setAttribute("role", "img");
    marker.setAttribute("aria-label", label);
    marker.className = "pointer-events-none absolute z-30 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-red-700 bg-transparent ring-2 ring-white after:absolute after:left-1/2 after:top-1/2 after:size-1.5 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-red-700 after:ring-1 after:ring-white";
    marker.style.left = `${100 * point.x / point.viewWidth}%`;
    marker.style.top = `${100 * point.y / point.viewHeight}%`;
    hostNode.append(marker);
    if (handled.current !== request) wrap.scrollBy({
      left: host.left + host.width * point.x / point.viewWidth - viewport.left - wrap.clientWidth / 2,
      top: host.top + host.height * point.y / point.viewHeight - viewport.top - wrap.clientHeight / 2,
      behavior: "instant",
    });
    handled.current = request;
    return () => marker.remove();
  }, [request, label, open, documentEpoch, currentPageId, wrapRef, hostRef, canvasHeight, canvasFlipH, canvasRotation]);

  const selectCommentEditorTarget = useCallback((target: StudioEditorCommentTarget, current?: () => boolean) => {
    if (!select(target, current)) return false;
    setRequest(target.point ? { target, epoch: documentEpoch } : null);
    return true;
  }, [select, documentEpoch]);
  const selectStudioCommentAnchor = useCallback((anchor: StudioCommentAnchor) =>
    selectCommentEditorTarget(studioEditorTargetForComment(anchor)), [selectCommentEditorTarget]);
  return { selectCommentEditorTarget, selectStudioCommentAnchor };
}
