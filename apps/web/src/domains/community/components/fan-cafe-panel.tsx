import {
  translateBilingualValueForActiveLocale,
  translateCurrentStaticSourceText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  Bell,
  MessageCircle,
  RefreshCw,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  FanCafeComposerColumn,
  FanCafeSpaceGuide,
  FanCafeStarterEmpty,
} from "./fan-cafe-composer";
import { fanCafeDraftStorageKey, isComposerDraftKind, type FanCafeComposerDraft } from "./fan-cafe-composer-draft";
import {
  FAN_CAFE_POST_TAGS_MAX_LENGTH,
  FAN_CAFE_POST_TEXT_MAX_LENGTH,
  FAN_CAFE_POST_TITLE_MAX_LENGTH,
  KIND_ITEMS,
  TAG_CHIP_LIMIT,
  type FanCafeComposeLock,
  type FanCafeKindFilter,
} from "./fan-cafe-constants";
import FanPostCard from "./fan-cafe-post-card";
import { FanPostCardSkeleton } from "./fan-cafe-post-card-skeleton";

import type { FanCafePost, FanCafePostKind, FanCafeScopeFilter } from "@/shared/lib/types";

import { api, getApiErrorMessage } from "@/platform/api";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { CampusObjectSource } from "@/shared/components/spatial-campus/CampusObjectSource";
import { useCelebrate } from "@/shared/hooks/use-celebrate";
import {
  COMMUNITY_SCOPE_LABEL_WITH_ALL,
  COMMUNITY_SORT_LABEL,
  FAN_CAFE_SCOPE_COPY,
} from "@/shared/lib/community-ui";
import { ensureArray } from "@/shared/lib/http-safe";
import {
  ATTACHMENT_MAX_COUNT,
  fileToAttachmentDataUrl,
} from "@/shared/lib/image-attach";
import { useApp } from "@/shared/lib/store";
import { cn } from "@/shared/lib/utils";

export { FanPostImages } from "./fan-cafe-images";
export { FanPostReplySection } from "./fan-cafe-reply-section";
export type { FanCafeComposeLock };

const bi = (ko: string, en: string) => translateBilingualValueForActiveLocale("FanCafePanel", ko, en);
const POSTS_LOAD_ERROR = () => bi("커뮤니티 글을 불러오지 못했습니다.", "Couldn't load community posts.");
const MORE_POSTS_LOAD_ERROR = () => bi("글을 더 불러오지 못했습니다.", "Couldn't load more posts.");
const SORT_ORDER = ["recent", "popular"] as const;

/** 빈 목록일 때 보여줄 안내 카드 — 전달한 페이지에서만 ActionableEmptyState로 렌더링된다. */
export type FanCafeEmptyGuide = {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly primary: { readonly href: string; readonly label: string };
  readonly secondary?: { readonly href: string; readonly label: string };
};

export function FanCafePanel({
  scope,
  targetId,
  targetLabel,
  compact = false,
  initialKind = "all",
  composeLock = null,
  emptyGuide,
  hideSpaceGuide = false,
  onTopLevelReplyDelta,
  onTopLevelPostCreated,
}: {
  scope: FanCafeScopeFilter;
  targetId?: string;
  targetLabel: string;
  compact?: boolean;
  initialKind?: FanCafeKindFilter;
  composeLock?: FanCafeComposeLock | null;
  emptyGuide?: FanCafeEmptyGuide;
  /** 글을 쓸 수 없는 통합 피드에서 "대화 공간 고르기" 안내를 숨긴다(페이지가 같은 입구를 이미 보여줄 때). */
  hideSpaceGuide?: boolean;
  onTopLevelReplyDelta?: (post: FanCafePost, delta: number) => void;
  onTopLevelPostCreated?: (post: FanCafePost) => void;
}) {
  useBilingualI18nRevision();
  const userId = useApp((s) => s.userId);
  const sessionToken = useApp((s) => s.sessionToken);
  const [posts, setPosts] = useState<FanCafePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterKind, setFilterKind] = useState<FanCafeKindFilter>(initialKind);
  const [composeKind, setComposeKind] = useState<FanCafePostKind>(initialKind === "all" ? "talk" : initialKind);
  const [sort, setSort] = useState<"popular" | "recent">("recent");
  const [searchText, setSearchText] = useState("");
  const [queryText, setQueryText] = useState("");
  const [selectedTagState, setSelectedTagState] = useState<{ context: string; tag: string | null }>({
    context: "",
    tag: null,
  });
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [tags, setTags] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [attachBusy, setAttachBusy] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<FanCafeComposerDraft | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [showMyPostsOnly, setShowMyPostsOnly] = useState(false);
  const [postPulse, setPostPulse] = useState(0);
  const postsRequestSignatureRef = useRef("");
  const postPulseTimerRef = useRef<number | null>(null);
  const celebrate = useCelebrate();
  const selectedTagContext = `${scope}|${targetId ?? ""}`;

  function applyTopLevelReplyDelta(postItem: FanCafePost, delta: number) {
    if (!Number.isFinite(delta) || delta === 0) return;
    setPosts((current) => {
      const nextPosts = current.map((item) =>
        item.id === postItem.id ? { ...item, replyCount: Math.max(0, item.replyCount + delta) } : item,
      );
      const changed = nextPosts.some((post, index) => post !== current[index]);
      if (!changed) return current;
      if (sort !== "popular") return nextPosts;
      return nextPosts
        .slice()
        .sort((a, b) => b.replyCount - a.replyCount || b.createdAt.localeCompare(a.createdAt));
    });
    onTopLevelReplyDelta?.(postItem, delta);
  }

  const postTagSuggests = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of posts) {
      for (const rawTag of post.tags) {
        const tag = String(rawTag ?? "")
          .replace(/^#/, "")
          .trim()
          .toLowerCase();
        if (!tag) continue;
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TAG_CHIP_LIMIT)
      .map(([tag]) => tag);
  }, [posts]);

  const selectedTag = selectedTagState.context === selectedTagContext ? selectedTagState.tag : null;
  const showOnlyMine = Boolean(showMyPostsOnly && userId);
  const hasActiveFilters = filterKind !== "all" || Boolean(selectedTag || queryText || showOnlyMine);

  function setSelectedTagFilter(tag: string | null) {
    setLoading(true);
    setLoadError(null);
    setError(null);
    setSelectedTagState({ context: selectedTagContext, tag });
  }

  const apiQuery = useMemo(() => {
    const params = new URLSearchParams({ scope, sort });
    if (scope !== "all" && targetId) params.set("targetId", targetId);
    if (filterKind !== "all") params.set("kind", filterKind);
    if (selectedTag) params.set("tag", selectedTag);
    if (showOnlyMine) params.set("mine", "true");
    return params.toString();
  }, [filterKind, scope, selectedTag, showOnlyMine, sort, targetId]);

  const requestSignature = useMemo(
    () => `${scope}|${targetId ?? ""}|${filterKind}|${sort}|${selectedTag ?? ""}|${queryText}|${showOnlyMine}`,
    [filterKind, queryText, scope, selectedTag, showOnlyMine, sort, targetId],
  );

  const canComposePost = scope !== "all" && Boolean(targetId);
  const isUnifiedFlat = scope === "all" && hideSpaceGuide;
  const showSideColumn = canComposePost || !hideSpaceGuide;
  const authHeaders = useMemo(() => (sessionToken ? { "x-user-id": sessionToken } : undefined), [sessionToken]);

  useEffect(() => {
    const normalized = searchText.trim().toLowerCase();
    if (normalized === queryText) return;
    const timer = setTimeout(() => {
      setLoading(true);
      setLoadError(null);
      setError(null);
      setQueryText(normalized);
    }, 220);
    return () => clearTimeout(timer);
  }, [queryText, searchText]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const refresh = () => {
      if (document.visibilityState === "visible") {
        setLoading(true);
        setLoadError(null);
        setError(null);
        setRefreshTick((current) => current + 1);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const interval = setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [autoRefreshEnabled]);

  useEffect(() => {
    if (!postPulse) return;
    if (postPulseTimerRef.current) globalThis.clearTimeout(postPulseTimerRef.current);
    postPulseTimerRef.current = window.setTimeout(() => setPostPulse(0), 5500);
    return () => {
      if (postPulseTimerRef.current) {
        globalThis.clearTimeout(postPulseTimerRef.current);
        postPulseTimerRef.current = null;
      }
    };
  }, [postPulse]);

  useEffect(() => {
    return () => {
      if (postPulseTimerRef.current) {
        globalThis.clearTimeout(postPulseTimerRef.current);
        postPulseTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setPendingDraft(null);
    if (!userId || !canComposePost) return;
    if (title || text || tags) return;
    try {
      const raw = globalThis.localStorage.getItem(fanCafeDraftStorageKey(userId, scope, targetId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<FanCafeComposerDraft> | null;
      if (parsed && (parsed.title || parsed.text || parsed.tags)) {
        setPendingDraft({
          title: String(parsed.title ?? ""),
          text: String(parsed.text ?? ""),
          tags: String(parsed.tags ?? ""),
          composeKind: isComposerDraftKind(parsed.composeKind) ? parsed.composeKind : "talk",
          savedAt: String(parsed.savedAt ?? ""),
        });
      }
    } catch {
      setPendingDraft(null);
    }
  }, [userId, scope, targetId, canComposePost, title, text, tags]);

  useEffect(() => {
    if (!userId || !canComposePost || pendingDraft) return;
    const key = fanCafeDraftStorageKey(userId, scope, targetId);
    if (!title.trim() && !text.trim() && !tags.trim()) {
      try {
        globalThis.localStorage.removeItem(key);
      } catch {
        // 저장 공간 접근 실패는 작성 흐름을 막지 않는다.
      }
      setDraftSavedAt(null);
      return;
    }
    const timer = globalThis.setTimeout(() => {
      try {
        globalThis.localStorage.setItem(
          key,
          JSON.stringify({ title, text, tags, composeKind, savedAt: new Date().toISOString() } satisfies FanCafeComposerDraft),
        );
        setDraftSavedAt(new Date().toISOString());
      } catch {
        setDraftSavedAt(null);
      }
    }, 800);
    return () => globalThis.clearTimeout(timer);
  }, [userId, scope, targetId, canComposePost, title, text, tags, composeKind, pendingDraft]);

  function applyPendingDraft() {
    if (!pendingDraft) return;
    setTitle(pendingDraft.title.slice(0, FAN_CAFE_POST_TITLE_MAX_LENGTH));
    setText(pendingDraft.text.slice(0, FAN_CAFE_POST_TEXT_MAX_LENGTH));
    setTags(pendingDraft.tags.slice(0, FAN_CAFE_POST_TAGS_MAX_LENGTH));
    setComposeKind(pendingDraft.composeKind);
    setDraftSavedAt(pendingDraft.savedAt || null);
    setPendingDraft(null);
  }

  function discardPendingDraft() {
    if (!userId) return;
    try {
      globalThis.localStorage.removeItem(fanCafeDraftStorageKey(userId, scope, targetId));
    } catch {
      // 저장 공간 접근 실패는 작성 흐름을 막지 않는다.
    }
    setDraftSavedAt(null);
    setPendingDraft(null);
  }

  function clearComposerDraft() {
    if (!userId) return;
    try {
      globalThis.localStorage.removeItem(fanCafeDraftStorageKey(userId, scope, targetId));
    } catch {
      // 등록 성공 후에는 임시글이 남으면 안 된다.
    }
    setDraftSavedAt(null);
    setPendingDraft(null);
    setPreviewing(false);
  }

  useEffect(() => {
    const isContextChanged = postsRequestSignatureRef.current !== requestSignature;
    postsRequestSignatureRef.current = requestSignature;

    const controller = new AbortController();
    const resetTimer = globalThis.setTimeout(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setLoadError(null);
      if (isContextChanged) {
        setPostPulse(0);
        setPosts([]);
        setHasMore(false);
        setNextCursor(null);
      }
    }, 0);
    const params = new URLSearchParams(apiQuery);
    if (queryText) params.set("q", queryText);
    params.set("limit", "20");
    api
      .get<{ items?: unknown; nextCursor?: string | null; hasMore?: boolean }>(
        `/community/posts?${params.toString()}`,
        {
          signal: controller.signal,
          headers: authHeaders,
          errorMessage: POSTS_LOAD_ERROR(),
        },
      )
      .then((data) => {
        if (controller.signal.aborted) return;
        globalThis.clearTimeout(resetTimer);
        if (!Array.isArray(data.items)) throw new Error("invalid payload");
        const nextItems = ensureArray(data.items) as FanCafePost[];
        let incomingPosts = 0;

        setPosts((currentPosts) => {
          if (!isContextChanged && sort === "recent" && currentPosts.length > 0) {
            const currentIdSet = new Set(currentPosts.map((post) => post.id));
            const nextIdSet = new Set(nextItems.map((post) => post.id));
            incomingPosts = nextItems.reduce((count, post) => (currentIdSet.has(post.id) ? count : count + 1), 0);
            const retained = currentPosts.filter((post) => !nextIdSet.has(post.id));
            return [...nextItems, ...retained];
          }
          return nextItems;
        });

        if (!isContextChanged && incomingPosts > 0) setPostPulse(incomingPosts);
        setNextCursor(data.nextCursor ?? null);
        setHasMore(Boolean(data.hasMore));
        setLoadError(null);
      })
      .catch(async (caught) => {
        if ((caught as Error).name === "AbortError") return;
        const message = await getApiErrorMessage(caught, POSTS_LOAD_ERROR());
        if (!controller.signal.aborted) {
          if (isContextChanged) {
            setPosts([]);
            setHasMore(false);
            setNextCursor(null);
          }
          setLoadError(message);
        }
      })
      .finally(() => {
        globalThis.clearTimeout(resetTimer);
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      globalThis.clearTimeout(resetTimer);
      controller.abort();
    };
  }, [apiQuery, authHeaders, queryText, refreshTick, requestSignature, sort]);

  async function loadMore() {
    if (!nextCursor || loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    const params = new URLSearchParams(apiQuery);
    if (queryText) params.set("q", queryText);
    params.set("limit", "20");
    params.set("cursor", nextCursor);
    try {
      const data = await api.get<{
        items?: unknown;
        nextCursor?: string | null;
        hasMore?: boolean;
      }>(`/community/posts?${params.toString()}`, {
        headers: authHeaders,
        errorMessage: MORE_POSTS_LOAD_ERROR(),
      });
      if (!Array.isArray(data.items)) throw new Error("invalid payload");
      const nextItems = ensureArray<FanCafePost>(data.items);
      setPosts((current) => [...current, ...nextItems]);
      setNextCursor(data.nextCursor ?? null);
      setHasMore(Boolean(data.hasMore));
    } catch (caught) {
      setError(await getApiErrorMessage(caught, MORE_POSTS_LOAD_ERROR()));
    } finally {
      setLoadingMore(false);
    }
  }

  async function attachFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setAttachBusy(true);
    try {
      const incoming = [...files].slice(0, ATTACHMENT_MAX_COUNT - images.length);
      if (incoming.length === 0) {
        setError(`이미지는 최대 ${ATTACHMENT_MAX_COUNT}장까지 첨부할 수 있어요.`);
        return;
      }
      const converted: string[] = [];
      for (const file of incoming) converted.push(await fileToAttachmentDataUrl(file));
      setImages((current) => [...current, ...converted].slice(0, ATTACHMENT_MAX_COUNT));
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지를 처리하지 못했어요.");
    } finally {
      setAttachBusy(false);
    }
  }

  async function submit(sourceEl?: HTMLElement | null) {
    if (!userId) return;
    if (!title.trim() || !text.trim()) return;
    if (!canComposePost) {
      setError("팬카페 대상이 지정된 보드에서만 글을 작성할 수 있어요.");
      return;
    }
    setIsSubmittingPost(true);
    setError(null);
    try {
      const created = await api.post<FanCafePost>(
        "/community/posts",
        {
          scope,
          targetId,
          targetLabel,
          kind: composeKind,
          title,
          text,
          images,
          tags: tags
            .split(/[,\s#]+/)
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean),
        },
        {
          headers: authHeaders,
          errorMessage: "팬카페 글을 저장하지 못했습니다. 입력한 내용은 유지됩니다.",
        },
      );
      if (!created || typeof created !== "object") {
        throw new Error("팬카페 글 응답이 유효하지 않습니다.");
      }
      celebrate(sourceEl, { chars: ["🎉", "✨", "💬"], count: 18 });
      onTopLevelPostCreated?.(created);
      const normalizedCreatedTags = created.tags.map((tag) => tag.toLowerCase());
      const tagMatch = !selectedTag || normalizedCreatedTags.includes(selectedTag);
      const shouldInsert =
        (filterKind === "all" || filterKind === created.kind) &&
        tagMatch &&
        (!queryText || `${created.title} ${created.text}`.toLowerCase().includes(queryText));

      if (!shouldInsert) {
        setError("현재 필터/검색 조건과 달라 목록에 바로 반영되지 않습니다.");
      } else {
        setError(null);
        setPosts((current) => {
          const next = [created, ...current];
          if (sort === "popular") {
            return next
              .slice()
              .sort((a, b) => b.replyCount - a.replyCount || b.createdAt.localeCompare(a.createdAt));
          }
          return next;
        });
      }
      setTitle("");
      setText("");
      setTags("");
      setImages([]);
      clearComposerDraft();
      setRefreshTick((current) => current + 1);
    } catch (caught) {
      setError(await getApiErrorMessage(caught, "팬카페 글을 저장하지 못했습니다. 입력한 내용은 유지됩니다."));
    } finally {
      setIsSubmittingPost(false);
    }
  }

  function refreshNow() {
    setLoading(true);
    setLoadError(null);
    setError(null);
    setRefreshTick((current) => current + 1);
  }

  const headingTitle =
    scope === "cafe" || scope === "pencafe" || scope === "all"
      ? targetLabel
      : `${targetLabel} ${bi("대화방", "Board")}`;

  return (
    <section
      className={cn(
        isUnifiedFlat
          ? "space-y-4"
          : "space-y-4 rounded-2xl border border-line bg-panel/35 p-4 sm:p-5",
      )}
    >
      <CampusObjectSource
        objects={posts.slice(0, 24).map((post) => ({
          id: post.id,
          title: post.title || post.text.slice(0, 80),
          href: `/community/post/${encodeURIComponent(post.id)}`,
          kind: "community-post",
          exposure: "public",
        }))}
      />

      {!isUnifiedFlat ? (
        <div className="flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium text-accent">{COMMUNITY_SCOPE_LABEL_WITH_ALL[scope]}</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-fg [word-break:keep-all] sm:text-xl">
              {headingTitle}
            </h2>
            <p className="mt-1 max-w-xl text-pretty text-sm leading-relaxed text-fg-2">
              {FAN_CAFE_SCOPE_COPY[scope]}
            </p>
          </div>
          <p className="shrink-0 text-xs text-fg-3">
            {translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "게시글 ")}
            <span className="font-medium tabular-nums text-fg-2">{posts.length}</span>
          </p>
        </div>
      ) : null}

      {/* 단일 통합 필터 툴바: 검색 + 8px 세그먼트 정렬(최신순 | 인기순) + 새로고침 + 평면 분류/태그 칩 */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-full sm:basis-60">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden="true" />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              maxLength={80}
              aria-label={translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "팬카페 글 검색 (제목·본문 키워드)")}
              placeholder={translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "제목·본문 검색")}
              className="min-h-11 w-full min-w-0 rounded-lg border border-line bg-canvas pl-9 pr-8 text-sm text-fg outline-none transition-colors duration-150 placeholder:text-fg-3 focus:border-accent motion-reduce:transition-none"
            />
            {searchText ? (
              <button
                type="button"
                onClick={() => setSearchText("")}
                aria-label={bi("검색어 지우기", "Clear search")}
                className="absolute right-1 top-1/2 inline-flex min-h-9 min-w-9 -translate-y-1/2 items-center justify-center rounded-md text-fg-3 hover:text-fg"
              >
                <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div
            role="group"
            aria-label={bi("정렬 기준", "Sort order")}
            className="inline-flex min-h-11 items-center gap-0.5 rounded-[10px] border border-line bg-panel p-1"
          >
            {SORT_ORDER.map((value) => {
              const active = sort === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setLoading(true);
                    setLoadError(null);
                    setError(null);
                    setSort(value);
                  }}
                  className={cn(
                    "min-h-9 whitespace-nowrap rounded-lg px-3 text-xs transition-colors duration-150 motion-reduce:transition-none",
                    active ? "bg-raised font-semibold text-fg" : "font-medium text-fg-3 hover:text-fg",
                  )}
                >
                  {COMMUNITY_SORT_LABEL[value]}
                </button>
              );
            })}
          </div>

          {userId ? (
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-panel px-3 text-xs font-medium text-fg-2">
              <input
                type="checkbox"
                checked={showOnlyMine}
                onChange={(event) => {
                  setLoading(true);
                  setLoadError(null);
                  setError(null);
                  setShowMyPostsOnly(event.target.checked);
                }}
                className="size-4 shrink-0 rounded accent-accent"
              />
              <span>{translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "내 글만 보기")}</span>
            </label>
          ) : null}

          <div className="ml-auto flex items-center gap-1.5">
            {postPulse > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-accent/35 bg-accent-soft px-2 py-1 text-xs tabular-nums text-accent">
                <Bell size={12} aria-hidden="true" />
                {translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "새 글 ")}
                {postPulse}
                {translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "개 반영")}
              </span>
            ) : null}
            <label className="hidden min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-transparent px-2.5 text-xs text-fg-3 hover:text-fg-2 sm:inline-flex">
              <input
                type="checkbox"
                checked={autoRefreshEnabled}
                onChange={(event) => setAutoRefreshEnabled(event.target.checked)}
                className="size-3.5 shrink-0 rounded accent-accent"
              />
              <span>{bi("자동 갱신", "Auto sync")}</span>
            </label>
            <button
              type="button"
              onClick={refreshNow}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-transparent px-3 text-xs font-medium text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg motion-reduce:transition-none"
            >
              <RefreshCw size={13} className={cn(loading && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
              {translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "새로고침")}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {KIND_ITEMS.map((item) => {
            const active = filterKind === item.value;
            return (
              <button
                key={item.value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setLoading(true);
                  setLoadError(null);
                  setError(null);
                  setFilterKind(item.value);
                }}
                className={cn(
                  "inline-flex min-h-11 min-w-11 items-center justify-center whitespace-nowrap rounded-lg border px-3 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none",
                  active
                    ? "border-accent/55 bg-accent-soft text-accent"
                    : "border-line bg-transparent text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                {item.label}
              </button>
            );
          })}

          {postTagSuggests.length > 0 ? (
            <>
              <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-line" />
              {postTagSuggests.map((tag) => {
                const active = selectedTag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedTagFilter(active ? null : tag)}
                    className={cn(
                      "inline-flex min-h-11 items-center whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none",
                      active
                        ? "border-accent/55 bg-accent-soft text-accent"
                        : "border-line bg-transparent text-fg-3 hover:bg-raised hover:text-fg",
                    )}
                  >
                    #{tag}
                  </button>
                );
              })}
            </>
          ) : null}
        </div>
      </div>

      <div className={cn("grid gap-4", showSideColumn && !compact && "lg:grid-cols-[0.9fr_1.1fr]")}>
        {canComposePost ? (
          <FanCafeComposerColumn
            userId={userId}
            composeLock={composeLock}
            composeKind={composeKind}
            onComposeKindChange={setComposeKind}
            title={title}
            onTitleChange={setTitle}
            text={text}
            onTextChange={setText}
            tags={tags}
            onTagsChange={setTags}
            images={images}
            onRemoveImage={(index) => setImages((current) => current.filter((_, i) => i !== index))}
            onAttachFiles={(files) => void attachFiles(files)}
            attachBusy={attachBusy}
            previewing={previewing}
            onTogglePreview={() => setPreviewing((current) => !current)}
            isSubmittingPost={isSubmittingPost}
            onSubmit={(sourceEl) => void submit(sourceEl)}
            draftSavedAt={draftSavedAt}
            pendingDraft={pendingDraft}
            onApplyDraft={applyPendingDraft}
            onDiscardDraft={discardPendingDraft}
            error={error}
          />
        ) : !hideSpaceGuide ? (
          <div>
            <FanCafeSpaceGuide />
            {error && <p role="alert" className="mt-3 text-xs text-bad">{error}</p>}
          </div>
        ) : error ? (
          <p role="alert" className="text-xs text-bad">{error}</p>
        ) : null}

        <div className="flex flex-col gap-3">
          {!loading && loadError && posts.length > 0 ? (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel/60 px-3.5 py-2 text-xs text-fg-2"
            >
              <span className="min-w-0 flex-1">최신 글을 확인하지 못해 마지막으로 불러온 목록을 표시합니다.</span>
              <button
                type="button"
                onClick={refreshNow}
                className="min-h-11 rounded-lg border border-line bg-raised px-2.5 font-medium text-fg transition-colors duration-150 hover:border-accent/50 motion-reduce:transition-none"
              >
                다시 확인
              </button>
            </div>
          ) : null}

          {loading && posts.length === 0 ? (
            <>
              <FanPostCardSkeleton />
              <FanPostCardSkeleton />
            </>
          ) : loadError && posts.length === 0 ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel/50 px-4 py-4 sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{POSTS_LOAD_ERROR()}</p>
                <p className="mt-1 text-xs leading-relaxed text-fg-2">
                  {`${loadError} ${bi("현재 글이 없다는 뜻은 아닙니다.", "This doesn't mean there are no posts.")}`}
                </p>
              </div>
              <button
                type="button"
                onClick={refreshNow}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-raised px-3.5 text-xs font-medium text-fg transition-colors duration-150 hover:border-accent/50 motion-reduce:transition-none"
              >
                <RefreshCw size={14} aria-hidden="true" />
                {bi("다시 시도", "Retry")}
              </button>
            </div>
          ) : posts.length === 0 ? (
            scope === "all" && filterKind === "all" && !selectedTag && !queryText && !showOnlyMine ? (
              <FanCafeStarterEmpty />
            ) : emptyGuide && !hasActiveFilters ? (
              <ActionableEmptyState
                icon={emptyGuide.icon}
                title={emptyGuide.title}
                description={emptyGuide.description}
                primary={emptyGuide.primary}
                secondary={emptyGuide.secondary}
                art="generic"
              />
            ) : (
              <div className="rounded-xl border border-dashed border-line bg-panel/35 px-5 py-8 text-center">
                <MessageCircle className="mx-auto mb-2.5 text-fg-3" size={20} aria-hidden="true" />
                <p className="text-sm font-medium text-fg">
                  {hasActiveFilters
                    ? bi("검색 조건에 맞는 글이 없습니다.", "No posts match your filters.")
                    : translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "아직 팬카페 글이 없습니다.")}
                </p>
                <p className="mt-1 text-xs text-fg-3">
                  {hasActiveFilters
                    ? bi("검색어나 필터를 바꿔 다른 대화를 찾아보세요.", "Try another keyword or reset your filters.")
                    : translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "첫 해석이나 응원을 남겨보세요.")}
                </p>
                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchText("");
                      setQueryText("");
                      setFilterKind("all");
                      setSelectedTagFilter(null);
                      setShowMyPostsOnly(false);
                    }}
                    className="mt-4 min-h-11 rounded-lg border border-line bg-raised px-4 text-xs font-medium text-fg-2 transition-colors duration-150 hover:text-fg motion-reduce:transition-none"
                  >
                    {bi("검색 조건 초기화", "Reset filters")}
                  </button>
                ) : null}
              </div>
            )
          ) : (
            <div key={`${filterKind}-${sort}-${selectedTag ?? "all"}`} className="ink-cascade flex flex-col gap-3" data-ink-stagger>
              {posts.map((post) => (
                <FanPostCard
                  key={post.id}
                  post={post}
                  compact={compact}
                  onReplyCreated={(replyPost, delta) => applyTopLevelReplyDelta(replyPost, delta)}
                  onDeleted={(id) => setPosts((current) => current.filter((p) => p.id !== id))}
                />
              ))}
            </div>
          )}

          {loadingMore ? (
            <FanPostCardSkeleton />
          ) : hasMore ? (
            <button
              type="button"
              onClick={loadMore}
              className="min-h-11 rounded-lg border border-line bg-panel px-3.5 py-2 text-sm font-medium text-fg transition-colors duration-150 hover:bg-raised motion-reduce:transition-none"
            >
              {translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "더 보기")}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
