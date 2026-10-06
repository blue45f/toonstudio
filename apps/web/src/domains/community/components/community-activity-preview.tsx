import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Flame, Image as ImageIcon, MessagesSquare, RotateCcw } from "lucide-react";

import { KIND_LABEL } from "./fan-cafe-utils";
import { CommunityUnderlineTabs } from "./community-underline-tabs";

import type { FanCafePost } from "@/shared/lib/types";

import { api, getApiErrorMessage } from "@/platform/api";
import { TypographicCover } from "@/shared/components/typographic-cover";
import { introItemProps } from "@/shared/components/page-intro/page-intro-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import { cn } from "@/shared/lib/utils";

type PoolKey = "popular" | "recent" | "fanart" | "events";
type ActivityTab = "recommend" | "popular" | "fresh" | "events";

interface PoolState {
  status: "loading" | "ready" | "error";
  posts: FanCafePost[];
  message?: string;
}

const POOL_KEYS: readonly PoolKey[] = ["popular", "recent", "fanart", "events"];

// 통합 피드(FanCafePanel)와 같은 쿼리를 재사용한다 — scope=all, limit=20.
const POOL_QUERIES: Record<PoolKey, string> = {
  popular: "scope=all&sort=popular&limit=20",
  recent: "scope=all&sort=recent&limit=20",
  fanart: "scope=all&sort=recent&kind=fanart&limit=20",
  events: "scope=all&sort=recent&kind=event&limit=20",
};

const TAB_POOL: Record<ActivityTab, PoolKey> = {
  recommend: "popular",
  popular: "popular",
  fresh: "recent",
  events: "events",
};

const LOADING_POOL: PoolState = { status: "loading", posts: [] };

/** 인기 목록에서 종류가 겹치지 않게 먼저 고르고, 남은 자리는 인기 순으로 채운다. */
function curateRecommended(posts: readonly FanCafePost[], limit = 4): FanCafePost[] {
  const picked: FanCafePost[] = [];
  const seenKinds = new Set<string>();
  for (const post of posts) {
    if (picked.length >= limit) break;
    if (!seenKinds.has(post.kind)) {
      picked.push(post);
      seenKinds.add(post.kind);
    }
  }
  for (const post of posts) {
    if (picked.length >= limit) break;
    if (!picked.includes(post)) picked.push(post);
  }
  return picked;
}

function ActivityArtCard({
  post,
  badge,
  className,
}: {
  post: FanCafePost;
  badge?: string;
  className?: string;
}) {
  const t = useBilingual("domains.community.CommunityActivityPreview");
  const cover = post.images?.[0];
  return (
    <Link
      href={`/community/post/${post.id}`}
      className={cn(
        "group block overflow-hidden rounded-2xl border border-line bg-panel transition-colors hover:border-line-strong",
        className,
      )}
    >
      <article>
        <div className="relative aspect-[4/3] overflow-hidden bg-raised">
          {cover ? (
            <img
              src={cover}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <TypographicCover title={post.title} seed={post.id} eyebrow={post.targetLabel} className="h-full w-full" />
          )}
          {badge ? (
            <span className="absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
              {badge}
            </span>
          ) : null}
        </div>
        <div className="p-3.5">
          <p className="truncate text-[11px] font-bold uppercase tracking-wide text-fg-3">
            {KIND_LABEL[post.kind]} · {post.targetLabel}
          </p>
          <h3 className="mt-1.5 line-clamp-2 min-h-10 text-sm font-bold leading-5 text-fg">{post.title}</h3>
          <p className="mt-2 flex items-center gap-2 text-xs text-fg-3">
            <span className="truncate font-semibold text-fg-2">{post.author.name}</span>
            <span className="inline-flex items-center gap-1">
              <MessagesSquare size={12} aria-hidden="true" />
              {t("댓글", "Replies")} {post.replyCount}
            </span>
          </p>
        </div>
      </article>
    </Link>
  );
}

function SkeletonCards({ count }: { count: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="skeleton h-52 rounded-2xl" />
      ))}
    </div>
  );
}

/**
 * 커뮤니티 홈 활동 미리보기 — 히어로 아래에서 "지금 오가는 이야기"를 보여 준다.
 *
 * 활동 스트립(인기 글 3 + 최신 팬아트 4)과 탭 미리보기(추천/인기/신작/이벤트, 각 상위 4개)로 구성한다.
 * 데이터는 통합 피드와 같은 /community/posts 쿼리를 재사용한다.
 * 상태 규칙: 로딩은 스켈레톤, 실패는 재시도 가능한 오류로, 글이 없는 탭은 성공 빈 상태로 표시한다.
 * 활동이 전혀 없으면(전 풀 빈 결과) 섹션 자체를 숨긴다 — 빈 껍데기를 만들지 않는다.
 */
export function CommunityActivityPreview() {
  const t = useBilingual("domains.community.CommunityActivityPreview");
  const [pools, setPools] = useState<Record<PoolKey, PoolState>>({
    popular: LOADING_POOL,
    recent: LOADING_POOL,
    fanart: LOADING_POOL,
    events: LOADING_POOL,
  });
  const [tab, setTab] = useState<ActivityTab>("recommend");

  const loadPool = useCallback(async (key: PoolKey, signal?: AbortSignal) => {
    try {
      const data = await api.get<{ items?: unknown }>(`/community/posts?${POOL_QUERIES[key]}`, {
        signal,
        errorMessage: "커뮤니티 글을 불러오지 못했어요.",
      });
      if (!Array.isArray(data.items)) throw new Error("invalid payload");
      setPools((current) => ({ ...current, [key]: { status: "ready", posts: data.items as FanCafePost[] } }));
    } catch (caught) {
      if ((caught as Error)?.name === "AbortError") return;
      const message = await getApiErrorMessage(caught, "커뮤니티 글을 불러오지 못했어요.");
      setPools((current) => ({ ...current, [key]: { status: "error", posts: [], message } }));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    for (const key of POOL_KEYS) void loadPool(key, controller.signal);
    return () => controller.abort();
  }, [loadPool]);

  const retryPool = useCallback(
    (key: PoolKey) => {
      setPools((current) => ({ ...current, [key]: LOADING_POOL }));
      void loadPool(key);
    },
    [loadPool],
  );

  const tabPosts = useMemo<Record<ActivityTab, FanCafePost[]>>(
    () => ({
      recommend: curateRecommended(pools.popular.posts),
      popular: pools.popular.posts.slice(0, 4),
      fresh: pools.recent.posts.slice(0, 4),
      events: pools.events.posts.slice(0, 4),
    }),
    [pools],
  );

  const stripPopular = pools.popular.posts.slice(0, 3);
  const stripFanart = useMemo(() => {
    const withImages = pools.fanart.posts.filter((post) => post.images?.length);
    const withoutImages = pools.fanart.posts.filter((post) => !post.images?.length);
    return [...withImages, ...withoutImages].slice(0, 4);
  }, [pools.fanart.posts]);

  const poolList = POOL_KEYS.map((key) => pools[key]);
  const allReady = poolList.every((pool) => pool.status === "ready");
  const allError = poolList.every((pool) => pool.status === "error");
  const totalPosts = poolList.reduce((sum, pool) => sum + pool.posts.length, 0);
  const anyLoading = poolList.some((pool) => pool.status === "loading");

  // 활동이 전혀 없으면 섹션 자체를 숨긴다(빈 껍데기 금지). 실패는 빈 상태로 위장하지 않는다.
  if (allReady && totalPosts === 0) return null;

  const activePool = pools[TAB_POOL[tab]];
  const activePosts = tabPosts[tab];

  const tabEmptyCopy: Record<ActivityTab, { title: string; description: string }> = {
    recommend: {
      title: t("아직 추천할 글이 없어요", "Nothing to recommend yet"),
      description: t("첫 이야기를 남기면 이곳에 모이기 시작해요.", "Post the first story and it will gather here."),
    },
    popular: {
      title: t("아직 인기 글이 없어요", "No popular posts yet"),
      description: t("대화가 쌓이면 가장 뜨거운 글이 이곳에 올라와요.", "As conversations grow, the hottest posts land here."),
    },
    fresh: {
      title: t("아직 새 글이 없어요", "No new posts yet"),
      description: t("첫 글을 남겨 커뮤니티의 오늘을 시작해 보세요.", "Write the first post and start the community's day."),
    },
    events: {
      title: t("아직 올라온 이벤트 글이 없어요", "No event posts yet"),
      description: t("전시·모임 소식을 이벤트 게시판에 가장 먼저 나눠 보세요.", "Share exhibition and meetup news on the events board first."),
    },
  };

  return (
    <section aria-label={t("커뮤니티 활동 미리보기", "Community activity preview")} className="mt-10 sm:mt-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-accent">NOW IN THE COMMUNITY</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
            {t("지금 오가는 이야기", "Stories moving right now")}
          </h2>
        </div>
        <Link
          href="/community/events"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-accent hover:text-accent-2"
        >
          <CalendarDays size={15} aria-hidden="true" />
          {t("이벤트 게시판 가기", "Go to the events board")}
        </Link>
      </div>

      {allError ? (
        <div className="mt-5 rounded-2xl border border-line bg-panel p-5 text-center" role="alert">
          <p className="text-sm font-bold text-fg">{t("커뮤니티 활동을 불러오지 못했어요", "Couldn't load community activity")}</p>
          <p className="mt-1 text-xs leading-5 text-fg-3">
            {t("네트워크 상태를 확인하고 다시 시도해 주세요.", "Check your connection and try again.")}
          </p>
          <button
            type="button"
            onClick={() => POOL_KEYS.forEach(retryPool)}
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-4 text-sm font-bold hover:bg-raised"
          >
            <RotateCcw size={14} aria-hidden="true" />
            {t("다시 시도", "Retry")}
          </button>
        </div>
      ) : (
        <>
          {/* 활동 스트립 — 인기 글 3 + 최신 팬아트 4, 모바일은 가로 스크롤 스냅 */}
          {(stripPopular.length > 0 || stripFanart.length > 0 || pools.popular.status === "loading" || pools.fanart.status === "loading") && (
            <div className="mt-6 space-y-6">
              {pools.popular.status === "loading" ? (
                <SkeletonCards count={3} />
              ) : stripPopular.length > 0 ? (
                <div>
                  <h3 className="flex items-center gap-1.5 text-sm font-black text-fg">
                    <Flame size={15} className="text-accent" aria-hidden="true" />
                    {t("지금 뜨는 글", "Trending now")}
                  </h3>
                  <div className="scrollbar-none -mx-1 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 lg:grid lg:grid-cols-3 lg:overflow-visible">
                    {stripPopular.map((post, index) => (
                      <div key={post.id} {...introItemProps(index)} className="w-64 shrink-0 snap-start lg:w-auto">
                        <ActivityArtCard post={post} badge={t("인기", "Popular")} className="h-full" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {pools.fanart.status === "loading" ? (
                <SkeletonCards count={4} />
              ) : pools.fanart.status === "error" ? (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3" role="alert">
                  <p className="text-sm font-bold text-fg">{t("최신 팬아트를 불러오지 못했어요", "Couldn't load the latest fan art")}</p>
                  <button
                    type="button"
                    onClick={() => retryPool("fanart")}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-xs font-bold hover:bg-raised"
                  >
                    <RotateCcw size={13} aria-hidden="true" />
                    {t("다시 시도", "Retry")}
                  </button>
                </div>
              ) : stripFanart.length > 0 ? (
                <div>
                  <h3 className="flex items-center gap-1.5 text-sm font-black text-fg">
                    <ImageIcon size={15} className="text-accent" aria-hidden="true" />
                    {t("최신 팬아트", "Latest fan art")}
                  </h3>
                  <div className="scrollbar-none -mx-1 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 lg:grid lg:grid-cols-4 lg:overflow-visible">
                    {stripFanart.map((post, index) => (
                      <div key={post.id} {...introItemProps(index)} className="w-56 shrink-0 snap-start lg:w-auto">
                        <ActivityArtCard post={post} badge={KIND_LABEL.fanart} className="h-full" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* 탭 미리보기 — 추천/인기/신작/이벤트 각 상위 4개 */}
          <div className="mt-8">
            <CommunityUnderlineTabs<ActivityTab>
              ariaLabel={t("활동 미리보기 탭", "Activity preview tabs")}
              layoutId="community-activity-tab-underline"
              value={tab}
              onChange={setTab}
              items={[
                { id: "recommend", label: t("추천", "Recommended") },
                { id: "popular", label: t("인기", "Popular") },
                { id: "fresh", label: t("신작", "New") },
                { id: "events", label: t("이벤트", "Events") },
              ]}
            />
            <div role="tabpanel" className="pt-5">
              {activePool.status === "loading" ? (
                <SkeletonCards count={4} />
              ) : activePool.status === "error" ? (
                <div className="rounded-2xl border border-line bg-panel p-5 text-center" role="alert">
                  <p className="text-sm font-bold text-fg">
                    {activePool.message ?? t("글을 불러오지 못했어요", "Couldn't load posts")}
                  </p>
                  <button
                    type="button"
                    onClick={() => retryPool(TAB_POOL[tab])}
                    className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-4 text-sm font-bold hover:bg-raised"
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    {t("다시 시도", "Retry")}
                  </button>
                </div>
              ) : activePosts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center">
                  <p className="text-sm font-bold text-fg">{tabEmptyCopy[tab].title}</p>
                  <p className="mt-1 text-xs leading-5 text-fg-3">{tabEmptyCopy[tab].description}</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {activePosts.map((post, index) => (
                    <div key={post.id} {...introItemProps(index)}>
                      <ActivityArtCard post={post} className="h-full" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {anyLoading ? <span className="sr-only" role="status">{t("불러오는 중", "Loading")}</span> : null}
        </>
      )}
    </section>
  );
}
