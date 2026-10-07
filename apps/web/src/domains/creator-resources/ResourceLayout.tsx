import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import {
  RESOURCE_BUTTON,
  RESOURCE_MENU_GROUPS,
  resourceMenuGroupPages,
  type ResourceMenuGroupId,
} from "./navigation";

import { ResearchSourceCover } from "./ResearchSourceCover";

import type { ResearchSourceIdentity } from "./research-source-identity";

import "./resource-atelier.css";
import "./resource-illustrated.css";
import "./research-source-identity.css";

import { Container } from "@/shared/components/container";
import { SectionNav, type SectionNavGroup } from "@/shared/components/section-nav";
import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
  useBilingual,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const NOTICE_SCOPE = "domains.creator.resources.ResourceLayout.LocalSaveNotice";
const noticeTx = (source: string): string => translateCurrentStaticSourceText(NOTICE_SCOPE, "ko", source);
const LAYOUT_SCOPE = "domains.creator.resources.ResourceLayout";
const layoutTx = (source: string): string => translateCurrentStaticSourceText(LAYOUT_SCOPE, "ko", source);

/**
 * 마스트헤드 아트 배정 — 정확 경로만 매치한다.
 * 중첩 경로(예: /research/catalog/notebook)는 부모 화면의 맥락을 잇는 화면이라
 * 아트를 비워 두는 것이 기존 계약(테스트로 고정)이다.
 */
const INTRO_ART: Record<string, string> = {
  "/research": "hero",
  "/research/open-creation": "canvas-noir",
  "/research/packs": "materials",
  "/research/assets": "character-pink",
  "/research/catalog": "storyboard",
  "/research/books": "project-romance",
  "/research/3d-assets": "background-city",
  "/research/material-assets": "materials",
  "/research/space-assets": "hero",
  "/research/vam": "character-blue",
  "/research/rijksmuseum": "project-crimson",
  "/research/fonts": "blank-canvas",
  "/research/creatures": "luna",
  "/research/music-metadata": "storyboard",
  "/research/archive": "project-romance",
  "/research/weather-light": "background-city",
  "/research/open-data": "materials",
  "/research/open-data/kheritage": "project-crimson",
  "/research/open-data/neis": "background-classroom",
  "/research/open-data/tourapi": "background-city",
  "/research/open-data/korean": "blank-canvas",
  "/research/open-data/smithsonian": "character-blue",
  "/research/open-data/wikimedia": "hero",
  "/research/open-data/europeana": "project-romance",
  "/research/open-data/dpla": "storyboard",
  "/research/open-data/ambientcg": "materials",
  "/research/open-data/vam": "character-pink",
  "/research/open-data/nasa": "background-city",
  "/research/open-data/gbif": "luna",
  "/research/open-data/musicbrainz": "storyboard",
  "/research/open-data/internetarchive": "canvas-noir",
  "/story-lab": "canvas-noir",
  "/about/data": "materials",
  "/now": "project-crimson",
  "/opportunities": "background-classroom",
  "/insights/resources": "storyboard",
  "/learn/resources": "blank-canvas",
  "/discover/works": "hero",
};

function isCurrentPath(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * 넓은 화면의 리서치 메뉴 — 위 줄은 목적별 5묶음, 아래 줄은 고른 묶음의 목적지.
 * 현재 화면이 속한 묶음이 처음 열리고, 다른 묶음은 한 번 눌러 바로 펼친다.
 */
function ResearchGroupedMenu({ pathname }: { readonly pathname: string }) {
  const bt = useBilingual(LAYOUT_SCOPE);
  const currentGroup = RESOURCE_MENU_GROUPS.find((group) => group.paths.some((path) => isCurrentPath(pathname, path)));
  const [openGroupId, setOpenGroupId] = useState<ResourceMenuGroupId>(currentGroup?.id ?? RESOURCE_MENU_GROUPS[0].id);
  const openGroup = RESOURCE_MENU_GROUPS.find((group) => group.id === openGroupId) ?? RESOURCE_MENU_GROUPS[0];
  return (
    <nav aria-label={layoutTx("창작 리서치 메뉴")} className="resource-menu resource-menu--desktop resource-menu--grouped">
      <div className="resource-menu-groups" role="group" aria-label={bt("리서치 메뉴 묶음", "Research menu groups")}>
        {RESOURCE_MENU_GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            aria-pressed={group.id === openGroup.id}
            aria-controls="resource-menu-links"
            onClick={() => setOpenGroupId(group.id)}
          >
            {bt(...group.title)}
            <span className="resource-menu-count" aria-hidden="true">{group.paths.length}</span>
            {group.id === currentGroup?.id ? <span className="sr-only">{bt("(현재 화면이 속한 묶음)", "(contains the current page)")}</span> : null}
          </button>
        ))}
      </div>
      <div id="resource-menu-links" className="resource-menu-links">
        {resourceMenuGroupPages(openGroup).map((page) => (
          <Link
            key={page.path}
            to={page.path}
            aria-current={isCurrentPath(pathname, page.path) ? "page" : undefined}
            className={`${RESOURCE_BUTTON} ${isCurrentPath(pathname, page.path) ? "bg-accent-soft text-accent" : "bg-panel"}`}
          >
            {layoutTx(page.title)}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/**
 * 넓은 화면의 좌측 레일 — 공용 SectionNav(링크 모드)가 유일한 구현이다 (표준 S-2).
 * 5묶음을 전부 펼쳐 현재 위치를 항상 보여 주고, 데스크 항목은 정확히 일치할 때만
 * 현재로 표시한다. 좁은 화면에서는 묶음 메뉴(중간 폭)와 접힌 전체 메뉴(모바일)가
 * 같은 역할을 하므로 레일은 lg 미만에서 숨겨, 폭마다 메뉴 DOM이 하나만 남는
 * 기존 계약을 유지한다.
 */
function ResourceSideNav({ pathname }: { readonly pathname: string }) {
  const bt = useBilingual(LAYOUT_SCOPE);
  const normalizedPath = pathname.replace(/\/$/u, "") || "/";
  const groups: readonly SectionNavGroup[] = [
    {
      id: "desk",
      items: [
        {
          id: "desk",
          href: "/research",
          label: layoutTx("리서치 데스크"),
          current: normalizedPath === "/research",
        },
      ],
    },
    ...RESOURCE_MENU_GROUPS.map((group) => ({
      id: group.id,
      label: bt(...group.title),
      items: resourceMenuGroupPages(group).map((page) => ({
        id: page.path,
        href: page.path,
        label: layoutTx(page.title),
      })),
    })),
  ];
  return <SectionNav label={layoutTx("창작 리서치 미니 내비")} groups={groups} className="max-lg:hidden" />;
}

export function ResourceLayout({
  title,
  intro,
  children,
  width = "default",
  heroContent,
  heroAside,
  sourceIdentity,
  menu = true,
  compact = false,
}: {
  title: string;
  intro: string;
  children: ReactNode;
  width?: "default" | "wide";
  /** 머리말 설명 아래에 두는 첫 행동(예: 리서치 데스크 통합 검색). */
  heroContent?: ReactNode;
  /** 머리말 오른쪽 보조 영역 — 주면 기본 일러스트 대신 쓰고 2열 머리말이 된다. */
  heroAside?: ReactNode;
  /**
   * 소스 정체성 (리서치 소스 검색 템플릿 전용) — 주면 경로 기반 안내 아트 대신
   * 소스 대표 비주얼을 쓰고, 제목 아래에 소스 칩·한 줄 정체성을 단다.
   * 소스 색 토큰(research-source-identity.css)이 마스트헤드·표지에 닿는다.
   */
  sourceIdentity?: ResearchSourceIdentity;
  /** 리서치 묶음 메뉴 표시 여부 — 모든 도구를 본문에서 직접 보여 주는 화면은 끈다. */
  menu?: boolean;
  /**
   * 머리말을 제목 한 줄로 줄인다 — 바로 아래에 자기 머리말(오늘의 장면 등)이 있는 화면용.
   * 안내 아트를 빼고, 한 줄 설명은 휴대폰에서 숨긴다(제목이 목적을 말한다).
   */
  compact?: boolean;
}) {
  useBilingualI18nRevision();
  const bt = useBilingual(LAYOUT_SCOPE);
  const { pathname } = useLocation();
  const introArt = heroAside || compact || sourceIdentity ? undefined : INTRO_ART[pathname.replace(/\/$/u, "")];
  const hasMastheadArt = Boolean(introArt) || Boolean(sourceIdentity && !heroAside);
  // 사이트 공통 Container(data-page-container)로 감싸 다른 공개 페이지와 폭·좌우선·통합 계약을 맞춘다.
  return <Container size={width === "wide" ? "wide" : "default"}>
  <section className={`resource-atelier resource-illustrated space-y-8 py-8 text-fg sm:py-12${sourceIdentity ? ` research-source research-source--${sourceIdentity.provider}` : ""}`}>
    <header className={`resource-masthead ${heroAside ? "resource-masthead--desk" : "resource-masthead--detail"} ${hasMastheadArt ? "resource-masthead--illustrated" : ""} ${compact ? "resource-masthead--compact" : ""}`}>
      <div className="resource-masthead-copy">
        {heroAside
          ? <p className="inline-flex min-h-8 items-center text-xs font-semibold tracking-[.12em] text-accent">{layoutTx("TOONSTUDIO / 리서치 데스크")}</p>
          : <Link to="/research" className="inline-flex min-h-11 items-center text-xs font-semibold tracking-[.12em] text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{layoutTx("TOONSTUDIO / 리서치 데스크")}</Link>}
        <h1 className="font-bold">{title}</h1>
        {sourceIdentity ? (
          <p className="mt-3 flex items-start gap-2.5 text-sm leading-6 text-fg-2 sm:mt-4">
            <span className="resource-source-dot mt-[.45rem] h-2.5 w-2.5 shrink-0 rounded-full" aria-hidden="true" />
            <span><strong className="font-bold text-fg">{sourceIdentity.name}</strong> — {sourceIdentity.tagline}</span>
          </p>
        ) : null}
        <p className={`mt-3 max-w-3xl text-base leading-7 text-fg-2 sm:mt-5 sm:leading-8 ${compact ? "max-sm:hidden" : ""}`}>{intro}</p>
        {heroContent ? <div className="mt-4 sm:mt-5">{heroContent}</div> : compact || sourceIdentity ? null : <p className="resource-context">{layoutTx("복식·소품·배경을 관찰하고, 다음 웹툰 컷의 근거로")}</p>}
      </div>
      {heroAside ?? (sourceIdentity ? <ResearchSourceCover identity={sourceIdentity} /> : introArt ? <img className="resource-masthead-image" src={`/brand/illustrated-20260928/${introArt}.webp`} alt="" aria-hidden="true" width={320} height={240} /> : null)}
    </header>
    {menu ? (
      <div className="resource-shell">
        <ResourceSideNav pathname={pathname} />
        <div className="resource-shell-main space-y-8">
          <div className="resource-shell-menus space-y-8">
            <ResearchGroupedMenu key={pathname} pathname={pathname} />
            <details className="resource-menu-mobile">
              <summary>{layoutTx("리서치·학습 전체 메뉴")} <span aria-hidden="true">⌄</span></summary>
              <nav aria-label={layoutTx("모바일 창작 리서치 메뉴")}>
                {RESOURCE_MENU_GROUPS.map((group) => (
                  <div key={group.id} className="resource-menu-mobile-group" role="group" aria-label={bt(...group.title)}>
                    <p aria-hidden="true">{bt(...group.title)}</p>
                    {resourceMenuGroupPages(group).map((page) => <Link key={page.path} to={page.path} aria-current={isCurrentPath(pathname, page.path) ? "page" : undefined}
                      className={isCurrentPath(pathname, page.path) ? "bg-accent-soft text-accent" : "bg-panel text-fg-2"}>{layoutTx(page.title)}</Link>)}
                  </div>
                ))}
              </nav>
            </details>
          </div>
          {children}
        </div>
      </div>
    ) : children}
    <footer className="resource-next-work">
      <div><p className="eyebrow text-accent">FROM REFERENCE TO CANVAS</p><h2>{layoutTx("찾아낸 장면을, 웹툰으로 그릴 시간.")}</h2><p className="max-sm:hidden">{layoutTx("자료에서 얻은 형태와 분위기를 내 이야기로 바꿔보세요. ToonStudio의 브러시와 레이어로 구도를 잡고, 필요한 표현은 제작 강좌에서 익힐 수 있습니다.")}</p></div>
      <div className="flex flex-wrap gap-2">
        <Link className={`${RESOURCE_BUTTON} border-accent bg-accent text-on-accent hover:bg-accent-2`} to="/studio" reloadDocument>{layoutTx("스튜디오 열기 ↗")}</Link>
        <Link className={RESOURCE_BUTTON} to="/learn">{layoutTx("제작 강좌")}</Link>
        <Link className={RESOURCE_BUTTON} to="/showcase">{layoutTx("작품 갤러리")}</Link>
        <Link className={RESOURCE_BUTTON} to="/community">{layoutTx("창작 커뮤니티")}</Link>
      </div>
    </footer>
  </section>
  </Container>;
}

export function LocalSaveNotice({ error, saving = false, writable = true }: { error?: string; saving?: boolean; writable?: boolean }) {
  useBilingualI18nRevision();
  return <div className="rounded-xl border border-line bg-panel p-4 text-sm leading-6 text-fg-2">
    <p>{noticeTx("자료와 기획서는 이 브라우저에만 저장됩니다. 계정·다른 기기로 동기화되지 않습니다. 공용 기기에서는 개인 작업 정보를 저장하지 마세요.")}</p>
    {saving && <p role="status">{noticeTx("다른 탭의 변경을 확인하며 저장하고 있습니다…")}</p>}
    {!writable && <p className="mt-2">{noticeTx("이 환경에서는 안전한 동시 저장을 사용할 수 없습니다. 읽기·내보내기는 가능하며, 저장은 HTTPS의 최신 브라우저를 이용하세요.")}</p>}
    {error && <p role="alert" className="mt-2 font-semibold text-fg">{formatI18nTemplate(noticeTx("저장 오류: {v0}"), { v0: error })}</p>}
  </div>;
}
