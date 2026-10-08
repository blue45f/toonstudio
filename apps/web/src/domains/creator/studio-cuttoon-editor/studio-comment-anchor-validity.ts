import type { StudioCommentAnchor } from "../studio-comments";
import type { PageState } from "../studio-page-state";

/**
 * 스튜디오 문서 기준 댓글 앵커 유효성 판정 — 앵커가 가리키는 페이지·컷·요소가 현재 페이지 목록에
 * 실제로 있는지, 위치 핀 좌표가 0..1 정규화 범위 안인지 확인한다. 편집기 호스트가 페이지 목록을
 * 의존성으로 묶은 콜백에서 호출하는 순수 함수다.
 */
export function isStudioCommentAnchorValidInPages(
  anchor: StudioCommentAnchor,
  pages: readonly PageState[],
): boolean {
  // PDF 워크벤치 앵커는 스튜디오 페이지에 속하지 않으므로 이 문서에서는 유효할 수 없다.
  if (anchor.type === "pdf-page") return false;
  const page = pages.find((candidate) => candidate.id === anchor.pageId);
  if (!page) return false;
  if (anchor.type === "page") return true;
  if (anchor.type === "point") {
    return Number.isFinite(anchor.x)
      && Number.isFinite(anchor.y)
      && anchor.x >= 0
      && anchor.x <= 1
      && anchor.y >= 0
      && anchor.y <= 1;
  }
  const targetId = anchor.type === "frame" ? anchor.frameId : anchor.elementId;
  const target = page.elements.find((element) => element.id === targetId);
  return Boolean(target) && (anchor.type !== "frame" || target?.type === "frame");
}
