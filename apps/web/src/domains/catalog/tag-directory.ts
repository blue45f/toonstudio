import { matchesHangulAwareQuery } from "./local-catalog-fallback";

export interface TagDirectoryEntry {
  readonly tag: string;
  readonly count: number;
}

export type TagDirectorySort = "popular" | "name";

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/^#/u, "").trim();
}

export function filterTagDirectory(
  tags: readonly TagDirectoryEntry[],
  query: string,
  sort: TagDirectorySort,
): TagDirectoryEntry[] {
  const rawNeedle = query.slice(0, 80).replace(/^#/u, "").trim();
  const needle = normalized(rawNeedle);
  const safeTags = Array.isArray(tags)
    ? tags
        .filter(
          (entry): entry is TagDirectoryEntry =>
            Boolean(entry) &&
            typeof entry === "object" &&
            typeof entry.tag === "string" &&
            entry.tag.trim().length > 0,
        )
        .map((entry) => ({
          tag: entry.tag.trim(),
          count:
            typeof entry.count === "number" && Number.isFinite(entry.count) && entry.count >= 0
              ? entry.count
              : 0,
        }))
    : [];

  return safeTags
    .filter((entry) => {
      if (!needle) return true;
      const normTag = normalized(entry.tag);
      return normTag.includes(needle) || matchesHangulAwareQuery(entry.tag, rawNeedle);
    })
    .sort((a, b) =>
      sort === "popular"
        ? b.count - a.count || a.tag.localeCompare(b.tag, "ko-KR")
        : a.tag.localeCompare(b.tag, "ko-KR") || b.count - a.count,
    );
}

export function tagDirectorySort(value: string | null): TagDirectorySort {
  return value === "name" ? "name" : "popular";
}
