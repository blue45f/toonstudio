import type { StudioAutosavePayload } from "../studio-autosave";
import type { ThumbElement, ThumbPageLike } from "../studio-page-thumbs";

export interface PreviewCandidate {
  readonly page: ThumbPageLike;
  readonly savedAt: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function thumbElements(value: unknown): ThumbElement[] {
  if (!Array.isArray(value)) return [];
  return value.filter((element): element is ThumbElement => {
    const item = record(element);
    return item !== null
      && typeof item.id === "string"
      && item.id.trim().length > 0
      && typeof item.type === "string"
      && item.type.trim().length > 0;
  });
}

function normalizePreviewPage(value: unknown, fallbackId: string): ThumbPageLike | null {
  const page = record(value);
  if (!page) return null;
  const elements = thumbElements(page.elements);
  if (elements.length === 0) return null;
  const rawGradient = Array.isArray(page.bgGrad)
    ? page.bgGrad.filter((color): color is string => typeof color === "string")
    : [];
  const canvasH = typeof page.canvasH === "number"
    && Number.isFinite(page.canvasH)
    && page.canvasH > 0
    ? page.canvasH
    : 1080;

  return {
    id: typeof page.id === "string" && page.id.trim() ? page.id : fallbackId,
    elements,
    bg: typeof page.bg === "string" && page.bg.trim() ? page.bg : "#ffffff",
    bgGrad: rawGradient.length >= 2 ? rawGradient.slice(0, 2) : null,
    canvasH,
    grade: page.grade,
  };
}

export function studioProjectPreviewFromAutosave(
  payload: StudioAutosavePayload,
): PreviewCandidate | null {
  const currentIndex = payload.currentPageId
    ? payload.pagesList.findIndex((page) => page.id === payload.currentPageId)
    : -1;
  const pages = currentIndex >= 0
    ? [payload.pagesList[currentIndex], ...payload.pagesList.filter((_, index) => index !== currentIndex)]
    : payload.pagesList;

  for (let index = 0; index < pages.length; index += 1) {
    const page = normalizePreviewPage(pages[index], `preview-page-${index + 1}`);
    if (!page) continue;
    const savedAt = Date.parse(payload.savedAt);
    return {
      page,
      savedAt: Number.isFinite(savedAt) ? savedAt : 0,
    };
  }
  return null;
}

export type PreviewDurableRecord = Readonly<{
  state: "snapshot";
  savedAt: string;
  payload: StudioAutosavePayload;
}> | Readonly<{ state: "cleared"; savedAt: string }> | null;

/** 같은 시각이면 삭제 표식을 먼저, 같은 종류이면 OPFS 기록을 먼저 선택한다. */
export function latestStudioPreviewRecord(opfs?: PreviewDurableRecord, sqlite?: PreviewDurableRecord): PreviewDurableRecord {
  const records = [opfs, sqlite].filter((row): row is NonNullable<PreviewDurableRecord> => row != null);
  records.sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt)
    || Number(right.state === "cleared") - Number(left.state === "cleared"));
  return records[0] ?? null;
}
