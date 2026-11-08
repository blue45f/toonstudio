import { uid } from "../studio-id";
import { DEFAULT_BG, PAGE_NOTE_MAX, STUDIO_PROJECT_MAX_PAGES } from "../page/studio-page-constants";

import type { PageState } from "../studio-page-state";

// 빈 원고 템플릿이 만드는 필드만 허용한다. 새 메타데이터가 추가되면 기존 작업으로 취급한다.
const STARTER_FIELDS = new Set(["id", "elements", "bg", "bgGrad", "canvasH", "name"]);

export function canInitializeEpisodeShotPages(
  pages: readonly PageState[],
  documentTitle: string,
): boolean {
  const page = pages[0];
  return pages.length === 1 && page !== undefined
    && page.elements.length === 0 && page.bg === DEFAULT_BG && page.bgGrad === null
    && (page.name === undefined || page.name === documentTitle)
    && Object.entries(page).every(([field, value]) => value === undefined || STARTER_FIELDS.has(field));
}

type EpisodeShot = { readonly summary: string };

export function canCopyEpisodeShots(shots: readonly EpisodeShot[]): boolean {
  return shots.length > 0 && shots.length <= STUDIO_PROJECT_MAX_PAGES
    && shots.every(({ summary }) => summary.trim().length > 0 && summary.length <= PAGE_NOTE_MAX);
}

/** 모든 샷을 손실 없이 옮길 수 있을 때만 한 번에 커밋할 페이지 목록을 만든다. */
export function initializeEpisodeShotPages(
  pages: readonly PageState[],
  documentTitle: string,
  shots: readonly EpisodeShot[],
): PageState[] | null {
  const starter = pages[0];
  if (!starter || !canInitializeEpisodeShotPages(pages, documentTitle) || !canCopyEpisodeShots(shots)) {
    return null;
  }
  return shots.map(({ summary }, index) => ({
    id: index === 0 ? starter.id : uid(),
    elements: [],
    bg: starter.bg,
    bgGrad: starter.bgGrad,
    canvasH: starter.canvasH,
    name: `C${String(index + 1).padStart(2, "0")}`,
    note: summary,
  }));
}
