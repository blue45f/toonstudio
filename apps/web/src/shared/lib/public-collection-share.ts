/**
 * 5종 읽기 상태(보류 hiatus 포함) 및 공개 컬렉션 공유 URL 빌더 (AC-013 / DIFFERENTIATION.md F04).
 */

export const FIVE_READ_STATES = ["want", "reading", "done", "hiatus", "dropped"] as const;
export type FiveReadState = (typeof FIVE_READ_STATES)[number];

export const FIVE_READ_STATE_LABELS: Record<FiveReadState, { readonly ko: string; readonly en: string }> = {
  want: { ko: "보고 싶어요", en: "Want to read" },
  reading: { ko: "보는 중", en: "Reading" },
  done: { ko: "완독", en: "Completed" },
  hiatus: { ko: "잠시 보류", en: "On hold" },
  dropped: { ko: "하차", en: "Dropped" },
};

export interface PublicCollectionShareDescriptor {
  readonly slug: string;
  readonly sharePath: string;
  readonly shareUrl: string;
  readonly ogTitle: string;
  readonly ogDescription: string;
}

export function slugifyCollectionName(name: string, id: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48)
    .replace(/^-|-$/g, "");
  const suffix = id.replace(/[^a-zA-Z0-9]/g, "").slice(-6) || "list";
  return base ? `${base}-${suffix}` : `collection-${suffix}`;
}

export function buildPublicCollectionShareDescriptor(input: {
  readonly id: string;
  readonly name: string;
  readonly curatorName?: string;
  readonly titleCount: number;
  readonly origin?: string;
}): PublicCollectionShareDescriptor {
  const slug = slugifyCollectionName(input.name, input.id);
  const sharePath = `/collections/${encodeURIComponent(slug)}`;
  const origin = (input.origin ?? "https://www.toonstudio.cloud").replace(/\/+$/, "");
  const curator = input.curatorName?.trim() || "툰스튜디오 독자";

  return Object.freeze({
    slug,
    sharePath,
    shareUrl: `${origin}${sharePath}`,
    ogTitle: `${input.name.trim() || "공개 컬렉션"} · ${curator}`,
    ogDescription: `${curator}님이 엄선한 ${input.titleCount}편의 웹툰·웹소설 컬렉션을 툰스튜디오에서 확인하세요.`,
  });
}
