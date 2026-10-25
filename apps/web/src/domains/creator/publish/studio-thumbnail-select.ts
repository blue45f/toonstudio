/**
 * studio-thumbnail-select.ts — 작품·회차 대표 썸네일 선택 (순수 모듈, fetch 없음).
 *
 * 발행 썸네일 자동 생성은 배선돼 있으나 작품·회차 대표 썸네일의 지정·
 * 저장 플로우는 없었다. 이 모듈은 페이지·컷 목록에서 대표 썸네일을
 * 고르는 규칙과 저장용 메타데이터만 담당한다. 우선순위는 작가의 명시
 * 선택 > 첫 페이지 > 없음이다. 실제 이미지 크롭·인코딩은 기존 발행
 * 썸네일 생성 경로를 재사용하며, 이 모듈은 이미지를 만들지 않는다.
 */

export interface StudioThumbnailPageOption {
  readonly pageId: string;
  readonly isFirst: boolean;
}

export interface StudioThumbnailSelection {
  readonly pageId: string | null;
  readonly source: "explicit" | "first-page" | "none";
}

export interface StudioThumbnailRecord {
  readonly workId: string;
  readonly episodeId: string | null;
  readonly pageId: string | null;
  readonly source: StudioThumbnailSelection["source"];
  readonly updatedAt: number;
}

/** 대표 썸네일을 고른다. 명시 선택이 없으면 첫 페이지를 쓴다. */
export function selectRepresentativeThumbnail(input: {
  readonly pages: readonly StudioThumbnailPageOption[];
  readonly explicitPageId?: string | null;
}): StudioThumbnailSelection {
  if (input.explicitPageId) {
    const found = input.pages.find(
      (page) => page.pageId === input.explicitPageId,
    );
    if (found) return { pageId: found.pageId, source: "explicit" };
  }
  const first =
    input.pages.find((page) => page.isFirst) ?? input.pages[0] ?? null;
  if (!first) return { pageId: null, source: "none" };
  return { pageId: first.pageId, source: "first-page" };
}

/** 선택 결과를 저장용 메타데이터로 만든다. */
export function buildThumbnailRecord(input: {
  readonly workId: string;
  readonly episodeId?: string | null;
  readonly selection: StudioThumbnailSelection;
  readonly now?: number;
}): StudioThumbnailRecord | null {
  if (!input.workId.trim()) return null;
  return {
    workId: input.workId,
    episodeId: input.episodeId ?? null,
    pageId: input.selection.pageId,
    source: input.selection.source,
    updatedAt: input.now ?? Date.now(),
  };
}
