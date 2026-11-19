import { catalogStatusText } from "./catalog-status-i18n";
import { BookOpen, EyeOff, Search } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  StudioPublicWiki,
  StudioPublicWikiEntry,
} from "@/domains/creator/public/world-wiki";

/**
 * 작품 상세의 공식 설정 위키(공개 뷰) — 독자가 보는 표면.
 *
 * 이 컴포넌트는 이미 정제된 공개 뷰(StudioPublicWiki)만 받는다. 경계 뒤 항목은
 * 애초에 데이터에 없으므로, 여기서 어떤 필터를 걸어도 스포일러가 샐 수 없다.
 * 검색은 공개된 항목 안에서만 동작한다.
 */
export function WorldWikiSection({
  wiki,
  titleName,
}: {
  readonly wiki: StudioPublicWiki;
  readonly titleName?: string;
}) {
  const [query, setQuery] = useState("");
  const [selectedKind, setSelectedKind] = useState<string>("all");
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const visibleSections = useMemo(() => {
    const scoped =
      selectedKind === "all"
        ? wiki.sections
        : wiki.sections.filter((section) => section.kind === selectedKind);
    if (!normalizedQuery) return scoped;
    const matches = (entry: StudioPublicWikiEntry) =>
      [entry.name, ...entry.aliases, entry.summary, entry.details]
        .join("\n")
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    return scoped
      .map((section) => ({
        ...section,
        entries: section.entries.filter(matches),
      }))
      .filter((section) => section.entries.length > 0);
  }, [normalizedQuery, selectedKind, wiki.sections]);

  return (
    <section
      aria-label="공식 설정 위키"
      data-world-wiki-public="true"
      data-world-wiki-boundary={wiki.spoilerThroughEpisode}
      className="break-keep [overflow-wrap:break-word] rounded-xl border border-line bg-panel p-4 sm:p-5"
    >
      <header className="flex flex-wrap items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <BookOpen size={19} strokeWidth={1.5} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-[1.35] tracking-[-0.015em] text-fg">
            {titleName ? `${titleName} 공식 설정 위키` : "공식 설정 위키"}
          </h2>
          <p className="mt-1 max-w-[72ch] text-xs leading-[1.6] tracking-[-0.01em] text-fg-3">
            작가가 직접 공개한 설정만 모았어요. 스포일러 방지를 위해{" "}
            <strong className="font-medium text-fg-2">
              {wiki.spoilerThroughEpisode}화까지
            </strong>
            의 설정만 담고 있어요.
          </p>
        </div>
        <span className="inline-flex min-h-7 shrink-0 items-center rounded-md bg-card px-2.5 text-[0.7rem] font-medium tabular-nums text-fg-2">
          공개 설정 {wiki.publicCount}개
        </span>
      </header>

      {wiki.publicCount === 0 ? (
        <div className="mt-4 rounded-xl bg-card/70 px-4 py-6 text-center">
          <EyeOff size={18} strokeWidth={1.5} aria-hidden className="mx-auto text-fg-3" />
          <p className="mt-2 text-sm font-semibold text-fg">
            {catalogStatusText("catalog.status.worldWiki.empty", "아직 공개된 설정이 없어요")}
          </p>
          <p className="mx-auto mt-1 max-w-[52ch] text-xs leading-[1.6] text-fg-3">
            작가가 설정을 공개하면 이곳에 캐릭터·장소·소품의 공식 설정이 모입니다.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-2.5">
            <label className="relative block">
              <Search
                size={15}
                strokeWidth={1.5}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
              />
              <span className="sr-only">공개 설정 검색</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="공개된 설정 안에서 검색"
                className="min-h-11 w-full rounded-lg border border-line bg-card py-2 pl-9 pr-3 text-sm text-fg outline-none placeholder:text-fg-3 transition-colors duration-150 hover:border-line-strong focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
            </label>

            {wiki.sections.length > 1 ? (
              <div
                role="group"
                aria-label="설정 분류 필터"
                className="flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible sm:pb-0"
              >
                <button
                  type="button"
                  aria-pressed={selectedKind === "all"}
                  onClick={() => setSelectedKind("all")}
                  className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg px-3 text-xs font-medium tabular-nums transition-colors duration-150 sm:min-h-8 ${
                    selectedKind === "all"
                      ? "bg-accent-soft text-accent"
                      : "bg-card text-fg-2 hover:bg-raised hover:text-fg"
                  }`}
                >
                  전체 · {wiki.publicCount}
                </button>
                {wiki.sections.map((section) => {
                  const active = selectedKind === section.kind;
                  return (
                    <button
                      key={section.kind}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedKind(section.kind)}
                      className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg px-3 text-xs font-medium tabular-nums transition-colors duration-150 sm:min-h-8 ${
                        active
                          ? "bg-accent-soft text-accent"
                          : "bg-card text-fg-2 hover:bg-raised hover:text-fg"
                      }`}
                    >
                      {section.label} · {section.entries.length}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {visibleSections.length === 0 ? (
            <p role="status" className="mt-4 text-sm leading-[1.6] text-fg-3">
              공개된 설정 중 “{query.trim()}”와 맞는 항목이 없어요.
            </p>
          ) : (
            <div className="mt-4 space-y-5">
              {visibleSections.map((section) => (
                <div key={section.kind}>
                  <h3 className="text-xs font-semibold text-fg-2">
                    {section.label} · <span className="tabular-nums">{section.entries.length}</span>
                  </h3>
                  <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {section.entries.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-xl bg-card p-3.5"
                      >
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="text-sm font-semibold leading-[1.35] text-fg">{entry.name}</span>
                          {entry.aliases.map((alias) => (
                            <span key={alias} className="text-[0.7rem] text-fg-3">
                              {alias}
                            </span>
                          ))}
                          {entry.revealEpisode !== null && (
                            <span className="ml-auto text-[0.7rem] tabular-nums text-fg-3">
                              {entry.revealEpisode}화 공개
                            </span>
                          )}
                        </div>
                        {entry.summary && (
                          <p className="mt-1.5 text-xs font-medium leading-[1.6] tracking-[-0.01em] text-fg-2">
                            {entry.summary}
                          </p>
                        )}
                        {entry.details && (
                          <p className="mt-1 whitespace-pre-line text-xs leading-[1.6] tracking-[-0.01em] text-fg-3">
                            {entry.details}
                          </p>
                        )}
                        {entry.related.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {entry.related.map((target) => (
                              <span
                                key={target.id}
                                className="inline-flex min-h-6 items-center rounded-md bg-panel px-2 text-[0.7rem] text-fg-2"
                              >
                                {target.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
