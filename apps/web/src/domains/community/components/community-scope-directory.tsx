import { communityStatusText } from "../community-status-i18n";
import { ArrowRight, MessageCircle, Search } from "lucide-react";
import { type FormEvent, useId } from "react";
import { useSearchParams } from "react-router-dom";

import Link from "@/shared/navigation/router-link";
import { ErrorState } from "@/shared/components/feedback/error-state";
import { TypographicCover } from "@/shared/components/typographic-cover";
import { useApiResource } from "@/platform/use-api-resource";
import { COMMUNITY_SCOPE_LABEL, COMMUNITY_SORT_OPTIONS, getCommunityScopeTargetLink, parseCommunitySort } from "@/shared/lib/community-ui";

export type DirectoryScope = "title" | "author" | "pencafe";
interface Board { scope: DirectoryScope; targetId: string; targetLabel: string }
interface BoardResponse { items: Board[] }

const EMPTY_DESTINATION = {
  title: { href: "/discover", label: "이야기 나눌 작품 찾기" },
  author: { href: "/authors", label: "좋아하는 작가 찾기" },
  pencafe: { href: "/community/cafes", label: "회원 카페 둘러보기" },
} as const;

/** A category is a directory, not a single-target post feed. Target validation stays intact. */
export function CommunityScopeDirectory({ scope }: { scope: DirectoryScope }) {
  const [params, setParams] = useSearchParams();
  const searchId = useId();
  const sortId = useId();
  const query = (params.get("q") ?? "").slice(0, 120);
  const sort = parseCommunitySort(params.get("sort"));
  const request = new URLSearchParams({ scope, sort, limit: "60" });
  if (query.trim()) request.set("q", query.trim());
  const { data, loading, error, notFound, reload } = useApiResource<BoardResponse>(
    `/api/community/boards?${request.toString()}`,
    communityStatusText("community.status.scope.loadFailed", "커뮤니티 목록을 불러오지 못했습니다."),
  );
  const malformed = data !== null && !Array.isArray(data.items);
  const boards = Array.isArray(data?.items) ? data.items.filter((board) => board
    && board.scope === scope && typeof board.targetId === "string" && board.targetId.trim()
    && typeof board.targetLabel === "string" && board.targetLabel.trim()).slice(0, 60) : [];
  const destination = EMPTY_DESTINATION[scope];
  const update = (key: string, value: string) => setParams((previous) => {
    const next = new URLSearchParams(previous);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    update("q", String(new FormData(event.currentTarget).get("q") ?? "").trim().slice(0, 120));
  };

  return (
    <section aria-label={`${COMMUNITY_SCOPE_LABEL[scope]} 대화 목록`} className="space-y-5">
      <form onSubmit={submit} role="search" aria-label="커뮤니티 이름 검색" className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-panel/45 p-4">
        <div className="min-w-0 flex-1 basis-52">
          <label htmlFor={searchId} className="mb-1.5 block text-xs font-medium text-fg-2">{COMMUNITY_SCOPE_LABEL[scope]} 이름 검색</label>
          <input id={searchId} key={`${scope}:${query}`} name="q" type="search" maxLength={120} defaultValue={query}
            placeholder="이름을 입력하세요" className="min-h-11 w-full rounded-lg border border-line bg-canvas px-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent" />
        </div>
        <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent"><Search size={16} aria-hidden="true" />검색</button>
        <div>
          <label htmlFor={sortId} className="mb-1.5 block text-xs font-medium text-fg-2">정렬</label>
          <select id={sortId} value={sort} onChange={(event) => update("sort", event.target.value)} className="min-h-11 rounded-lg border border-line bg-canvas px-3 text-sm text-fg">
            {COMMUNITY_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        {query && <button type="button" onClick={() => update("q", "")} className="min-h-11 rounded-lg border border-line px-4 text-sm text-fg-2">검색 지우기</button>}
      </form>

      {error || notFound || malformed ? <ErrorState title={communityStatusText("community.status.scope.loadFailed", "커뮤니티 목록을 불러오지 못했습니다.")}
        message={communityStatusText("community.status.scope.loadFailedMessage", "잠시 후 다시 시도해 주세요. 통합 커뮤니티와 작품 탐색은 아래 링크로 계속 이용할 수 있습니다.")} onRetry={reload} />
        : loading ? <div role="status" className="space-y-3"><span className="sr-only">대화가 있는 커뮤니티를 찾고 있습니다…</span><div aria-hidden="true" className="space-y-3"><div className="skeleton h-20 rounded-xl" /><div className="skeleton h-20 rounded-xl" /><div className="skeleton h-20 rounded-xl" /></div></div>
          : boards.length ? <>
            <p role="status" className="text-xs leading-relaxed tabular-nums text-fg-2">대화가 있는 {COMMUNITY_SCOPE_LABEL[scope]} {boards.length}개 · 최대 60개를 표시합니다. 이름으로 검색해 더 좁혀보세요.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-ink-stagger>
              {boards.map((board) => <Link key={`${board.scope}:${board.targetId}`} href={getCommunityScopeTargetLink(board.scope, board.targetId, board.targetLabel)}
                className="ink-frame group flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-card/80 transition-colors duration-150 hover:bg-card focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none">
                <TypographicCover title={board.targetLabel} seed={`${board.scope}:${board.targetId}`} eyebrow={COMMUNITY_SCOPE_LABEL[scope]} className="h-20 w-full shrink-0" />
                <span className="flex min-w-0 flex-1 items-center gap-3.5 p-4">
                  <MessageCircle size={18} aria-hidden="true" className="shrink-0 text-fg-2" />
                  <span className="min-w-0 flex-1"><strong className="block break-words text-sm font-semibold text-fg">{board.targetLabel}</strong><span className="mt-1 block text-xs text-fg-2">작품과 대화 살펴보기</span></span>
                  <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-fg-3 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-accent motion-reduce:transition-none" />
                </span>
              </Link>)}
            </div>
          </> : <div className="rounded-xl border border-dashed border-line bg-panel/35 p-8 text-center">
            <h2 className="text-base font-semibold text-fg">{query ? communityStatusText("community.status.scope.searchEmpty", "검색한 이름의 대화가 아직 없어요") : communityStatusText("community.status.scope.empty", "아직 등록된 대화가 없어요")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-fg-2">{query ? "다른 이름으로 검색하거나 관심 있는 작품과 작가를 찾아보세요." : "관심 있는 작품과 작가의 페이지에서 첫 이야기를 시작해 보세요."}</p>
          </div>}
      <nav aria-label="커뮤니티 탐색 이어가기" className="flex flex-wrap gap-3">
        <Link href={destination.href} className="ink-arrow inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium text-accent hover:bg-raised">{destination.label}<ArrowRight size={15} aria-hidden="true" /></Link>
        <Link href="/community" className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm text-fg-2 hover:text-fg">통합 커뮤니티로 돌아가기</Link>
      </nav>
    </section>
  );
}
