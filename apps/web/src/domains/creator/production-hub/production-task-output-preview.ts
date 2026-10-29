import { studioReviewPageMappingSchema } from "@toonstudio/studio-project-model";
import type { StudioReviewPreviewRead } from "../project-graph/studio-project-graph-client";
import type { PinnedSubmissionVisualSource } from "./production-submission-visual-review";

/** 명시적으로 연결한 페이지·프레임을 실제 서버 mapping과 대조한 뒤 표시한다. */
export function selectTaskOutputPreviewPages<TPage extends StudioReviewPreviewRead>(source: PinnedSubmissionVisualSource,
  pages: readonly TPage[], complete: boolean): readonly TPage[] {
  const evidence = source.outputEvidence;
  if (!evidence) return pages;
  const selected = new Map(evidence.pages.map((entry) => [entry.ordinal, entry]));
  const visible = pages.filter((page) => selected.has(page.ordinal));
  for (const page of visible) {
    const expected = selected.get(page.ordinal), parsed = studioReviewPageMappingSchema.safeParse(page.mapping);
    if (!expected || !parsed.success || parsed.data.status !== "mapped") {
      throw new Error("고정한 원고 사용 범위와 페이지 연결이 다릅니다.");
    }
    const mapping = parsed.data;
    if (page.sha256 !== expected.sha256
      || mapping.sourceServerRevision !== evidence.sourceServerRevision
      || mapping.sourceContentDigest !== evidence.subject.rootGraphHash || mapping.page.id !== expected.pageId
      || mapping.page.ordinal !== expected.ordinal) throw new Error("고정한 원고 사용 범위와 페이지 연결이 다릅니다.");
    const frames = new Set(mapping.page.frames.map((frame) => frame.id));
    if (expected.frameIds.some((id) => !frames.has(id))) throw new Error("고정한 원고 사용 범위와 프레임 연결이 다릅니다.");
  }
  if (complete && visible.length !== evidence.pages.length) throw new Error("선택한 원고 페이지를 끝까지 확인하지 못했습니다.");
  return Object.freeze(visible);
}
