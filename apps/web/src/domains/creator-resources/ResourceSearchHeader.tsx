import { ChevronDown } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { RESOURCE_BUTTON, RESOURCE_MENU_GROUPS, resourceMenuGroupPages } from "./navigation";
import { ProviderStatus } from "./ProviderStatus";
import { OPEN_DATA_KEYLESS_PROVIDERS, RESOURCE_SEARCH_CONFIG, type ResourceSearchProvider } from "./resource-search-config";
import { researchSourceArtSrc, researchSourceIdentity } from "./research-source-identity";
import type { SourceStageCopy } from "./OpenDataSourceStage";

import { translateCurrentStaticSourceText, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** 검색을 첫 행동으로 두고 제공처의 긴 설명·전체 메뉴는 같은 자리에서 다시 찾을 수 있게 한다. */
export function ResourceSearchHeader({ provider, children, stage = false, stageCopy }: {
  readonly provider: ResourceSearchProvider;
  readonly children: ReactNode;
  readonly stage?: boolean;
  readonly stageCopy?: SourceStageCopy;
}) {
  const bt = useBilingual("ResourceSearchHeader");
  const config = RESOURCE_SEARCH_CONFIG[provider];
  const identity = researchSourceIdentity(provider);
  const { pathname } = useLocation();
  const header = useRef<HTMLElement>(null);
  // 제공처 표지는 검색 결과의 작품/소재 이미지와 구분한다. 경로용 판타지 아트는 붙이지 않는다.
  const art = identity.sceneArt ? researchSourceArtSrc(identity) : null;
  const keyless = stageCopy?.keyless ?? OPEN_DATA_KEYLESS_PROVIDERS.has(provider);
  useEffect(() => {
    const owner = header.current;
    if (!owner) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      const details = event.target instanceof HTMLElement ? event.target.closest("details") : null;
      if (event.key !== "Escape" || !details?.open || !owner.contains(details)) return;
      event.preventDefault();
      event.stopPropagation();
      details.open = false;
      details.querySelector("summary")?.focus({ preventScroll: true });
    };
    owner.addEventListener("keydown", closeOnEscape);
    return () => owner.removeEventListener("keydown", closeOnEscape);
  }, []);
  const summary = (label: string) => <><span>{label}</span><ChevronDown size={16} aria-hidden="true" /></>;
  return (
    <section ref={header} className={`resource-search-header${stage ? "" : " resource-masthead"}`}
      aria-label={stage ? stageCopy?.ariaLabel ?? "공개 데이터 제공처 소개" : bt("자료 찾기", "Find resources")}>
      <div className="resource-search-heading">
        <Link to="/research" className={RESOURCE_BUTTON}>{bt("리서치 데스크", "Research desk")}</Link>
        <p className="text-sm text-fg-2">{bt("현재 제공처", "Current source")} · <strong className="text-fg">{identity.name}</strong></p>
      </div>
      <h1 className="text-balance text-2xl font-bold leading-tight text-fg sm:text-3xl">{config.title}</h1>
      {children}
      <div className="resource-search-disclosures">
        <details data-resource-source-info="">
          <summary>{summary(bt("제공처 안내", "Source information"))}</summary>
          <div className="resource-search-disclosure-body">
            <p className="text-base leading-7"><strong>{identity.name}</strong> — {identity.tagline}</p>
            <p className="text-base leading-7 text-fg-2">{config.intro}</p>
            <ProviderStatus provider={provider} />
            {stage ? <p className="text-sm text-fg-2">{bt("기본 연결 방식", "Connection type")} · {keyless ? bt("가입·키 없이 즉시 검색", "Search without an account or key") : bt("무료 서버 키 연결형", "Free server-key connection")}</p> : null}
            {stage ? <Link to={stageCopy?.crumbTo ?? "/research/open-data"} className={RESOURCE_BUTTON}>{stageCopy?.crumbLabel ?? bt("공개 데이터 창작실", "Open data studio")}</Link> : null}
            <a href={config.url} target="_blank" rel="noopener noreferrer" className={RESOURCE_BUTTON}>{bt("공식 사이트 열기", "Open official site")} <span aria-hidden="true">↗</span></a>
            {art ? <figure className="m-0 overflow-hidden rounded-xl border border-line">
              <img src={art} alt="" aria-hidden="true" loading="lazy" width={960} height={640} className="max-h-44 w-full object-cover" />
              <figcaption className="px-3 py-2 text-sm text-fg-2">{bt("자료 출처", "Source")} · {identity.name}</figcaption>
            </figure> : null}
            <div role="note" aria-label={bt("자료 검색 역할 안내", "What to search here")} className="rounded-xl bg-raised p-3 text-base leading-7 text-fg-2">
              {bt("단행본·작법서·창작 자료는 이곳에서 찾으세요. 웹툰 작품은", "Find books, craft guides and reference material here. For webtoons, use")}{" "}
              <Link to="/search" className="font-semibold text-accent underline">{bt("통합 검색", "Search")}</Link>{" "}·{" "}
              <Link to="/explore" className="font-semibold text-accent underline">{bt("탐색", "Explore")}</Link>{bt("을 이용하세요.", ".")}
            </div>
          </div>
        </details>
        <details data-resource-search-menu="">
          <summary>{summary(bt("리서치 메뉴", "Research menu"))}</summary>
          <nav aria-label={bt("창작 리서치 메뉴", "Research navigation")} className="resource-search-disclosure-body">
            {RESOURCE_MENU_GROUPS.map((group) => <div key={group.id}>
              <p className="mb-2 text-sm font-bold text-fg-2">{bt(...group.title)}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {resourceMenuGroupPages(group).map((page) => <Link key={page.path} to={page.path}
                  aria-current={pathname === page.path || pathname.startsWith(`${page.path}/`) ? "page" : undefined}
                  className={RESOURCE_BUTTON}>{translateCurrentStaticSourceText("domains.creator.resources.ResourceLayout", "ko", page.title)}</Link>)}
              </div>
            </div>)}
          </nav>
        </details>
      </div>
    </section>
  );
}
