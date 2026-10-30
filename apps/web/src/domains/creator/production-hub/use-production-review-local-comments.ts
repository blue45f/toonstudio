import { useEffect, useState } from "react";
import { createEmptyStudioCommentsDocument, normalizeStudioCommentsDocument, serializeStudioCommentsDocument,
  type StudioCommentsDocument } from "../studio-comments";
import { readProductionReviewLocalState, writeProductionReviewLocalState,
  type ProductionReviewLocalScope } from "./production-review-local-state";

/** 호스트는 scope key로 이 hook의 소유자를 다시 만들어 이전 댓글을 새 scope에 기록하지 않는다. */
export function useProductionReviewLocalComments(scope: ProductionReviewLocalScope, isDemo: boolean) {
  const [comments, setComments] = useState<StudioCommentsDocument>(() => {
    const raw = isDemo ? null : readProductionReviewLocalState(scope, "compare-comments");
    return raw ? normalizeStudioCommentsDocument(raw) : createEmptyStudioCommentsDocument();
  });
  useEffect(() => {
    if (!isDemo) writeProductionReviewLocalState(scope, "compare-comments", serializeStudioCommentsDocument(comments));
  }, [comments, scope, isDemo]);
  return [comments, setComments] as const;
}
