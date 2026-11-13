import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { RESOURCE_BUTTON } from "./navigation";
import { ResearchNavigation } from "./ResearchNavigation";

import { ResearchSourceCover } from "./ResearchSourceCover";

import type { ResearchSourceIdentity } from "./research-source-identity";

import "./resource-atelier.css";
import "./resource-illustrated.css";
import "./research-source-identity.css";
import "./resource-task-layout.css";

import { Container } from "@/shared/components/container";
import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
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

export function ResourceLayout({
  title,
  intro,
  children,
  width = "default",
  heroContent,
  heroAside,
  mastheadArt,
  heroStage,
  sourceIdentity,
  menu = true,
  compact = false,
}: {
  title: string;
  intro: string;
  children: ReactNode;
  width?: "default" | "wide";
  /**
   * 머리말 전체를 대체하는 첫 화면 무대 (디자인 웨이브 14) — 주면 기본 마스트헤드
   * 머리말을 그리지 않는다. 제목(h1)·소개를 무대 안에 종속 배치하는 구도 교체
   * 전용 슬롯으로, 무대 안에 h1을 포함해 구성하는 것은 페이지의 책임이다.
   */
  heroStage?: ReactNode;
  /** 머리말 설명 아래에 두는 첫 행동(예: 리서치 데스크 통합 검색). */
  heroContent?: ReactNode;
  /** 머리말 오른쪽 보조 영역 — 주면 기본 일러스트 대신 쓰고 2열 머리말이 된다. */
  heroAside?: ReactNode;
  /**
   * 머리말 맨 위에 전폭으로 세우는 실물 아트 — 주면 작은 안내 아트(INTRO_ART)를
   * 대신하고, 머리말 그리드의 첫 행 전체를 차지한다. 페이지 정체성 장면 전용.
   */
  mastheadArt?: { src: string; srcSet: string; alt: string };
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
  const { pathname } = useLocation();
  const introArt = heroAside || compact || sourceIdentity || mastheadArt ? undefined : INTRO_ART[pathname.replace(/\/$/u, "")];
  const hasMastheadArt = Boolean(introArt) || Boolean(sourceIdentity && !heroAside) || Boolean(mastheadArt);
  // 사이트 공통 Container(data-page-container)로 감싸 다른 공개 페이지와 폭·좌우선·통합 계약을 맞춘다.
  return <Container size={width === "wide" ? "wide" : "default"}>
  <section className={`resource-atelier resource-illustrated space-y-8 py-8 text-fg sm:py-12${sourceIdentity ? ` research-source research-source--${sourceIdentity.provider}` : ""}`}>
    {heroStage ?? (
    <header className={`resource-masthead ${heroAside ? "resource-masthead--desk" : "resource-masthead--detail"} ${hasMastheadArt ? "resource-masthead--illustrated" : ""} ${compact ? "resource-masthead--compact" : ""}`}>
      {mastheadArt ? (
        <figure className="relative col-span-full m-0 overflow-hidden rounded-2xl border border-line">
          <img
            src={mastheadArt.src}
            srcSet={mastheadArt.srcSet}
            sizes="(max-width: 768px) 100vw, 1200px"
            width={1680}
            height={560}
            alt={mastheadArt.alt}
            fetchPriority="high"
            className="aspect-[3/1] w-full object-cover motion-safe:animate-fade-up"
          />
          <figcaption className="absolute bottom-3 left-3 rounded-full bg-black/45 px-2.5 py-1 text-[0.65rem] font-semibold text-white/90 backdrop-blur-sm">
            {layoutTx("브랜드 콘셉트 아트 · 실제 화면이 아닙니다")}
          </figcaption>
        </figure>
      ) : null}
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
    )}
    {menu ? <ResearchNavigation key={pathname} pathname={pathname} /> : null}
    <div className="resource-task-content">{children}</div>
    <details className="resource-follow-up group/follow-up">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl border border-line px-4 text-sm font-bold text-fg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{layoutTx("다음 창작 단계")}<span aria-hidden="true">⌄</span></summary>
    <footer className="resource-next-work">
      <div><p className="eyebrow text-accent">FROM REFERENCE TO CANVAS</p><h2>{layoutTx("찾아낸 장면을, 웹툰으로 그릴 시간.")}</h2><p className="max-sm:hidden">{layoutTx("자료에서 얻은 형태와 분위기를 내 이야기로 바꿔보세요. ToonStudio의 브러시와 레이어로 구도를 잡고, 필요한 표현은 제작 강좌에서 익힐 수 있습니다.")}</p></div>
      <div className="flex flex-wrap gap-2">
        <Link className={`${RESOURCE_BUTTON} border-accent bg-accent text-on-accent hover:bg-accent-2`} to="/studio" reloadDocument>{layoutTx("스튜디오 열기 ↗")}</Link>
        <Link className={RESOURCE_BUTTON} to="/learn">{layoutTx("제작 강좌")}</Link>
        <Link className={RESOURCE_BUTTON} to="/showcase">{layoutTx("작품 갤러리")}</Link>
        <Link className={RESOURCE_BUTTON} to="/community">{layoutTx("창작 커뮤니티")}</Link>
      </div>
    </footer>
    </details>
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
