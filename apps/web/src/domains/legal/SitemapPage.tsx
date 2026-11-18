import { ArrowLeft, ArrowRight, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";

import {
  SITE_NAVIGATION_GROUPS,
  SITE_NAVIGATION_ITEMS,
  SITE_UTILITY_NAVIGATION,
  siteNavigationText,
  type SiteNavigationItem,
} from "@/shared/components/site-navigation";
import { OpenSearchButton } from "@/shared/components/open-search-button";
import { SitePurposeGraphic } from "@/shared/components/SiteMenuDestinations";
import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import "./sitemap-menu.css";

const DIRECTORY_QUERY_KEYS = new Set([
  "menu", "product", "purpose", "maturity", "access", "device", "tier", "saved",
]);

const CHOSEONG_TABLE = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
] as const;

function toKoreanChoseong(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 0xac00 && code <= 0xd7a3) {
      out += CHOSEONG_TABLE[Math.floor((code - 0xac00) / 588)] ?? "";
    } else if (code !== 0x20) {
      out += text[i]?.toLowerCase() ?? "";
    }
  }
  return out;
}

interface ExtraProEntry {
  readonly id: string;
  readonly groupId: string;
  readonly href: string;
  readonly ko: string;
  readonly en: string;
  readonly koDesc: string;
  readonly enDesc: string;
  readonly synonyms: string;
}

const EXTRA_PRO_ENTRIES: readonly ExtraProEntry[] = [
  {
    id: "pro-brush-lab",
    groupId: "create",
    href: "/studio/assets/brushes/new",
    ko: "WGSL 마스터 브러시 랩",
    en: "WGSL Master Brush Lab",
    koDesc: "필압 곡선 · 텍스처 · 간격 · 스크린톤 시필",
    enDesc: "Pressure curves, dual textures & screentones",
    synonyms: "브러시 펜선 말풍선 톤 깎기 ㅂㄹㅅ ㅁㅍㅅ",
  },
  {
    id: "pro-import-psd",
    groupId: "create",
    href: "/studio/import",
    ko: "원고 가져오기 (PSD · 클튜)",
    en: "Import Manuscript (PSD · Clip)",
    koDesc: "포토샵·클립스튜디오 레이어 보존 열기",
    enDesc: "Layer-preserving PSD and archive import",
    synonyms: "포토샵 클튜 파일 열기 psd clip",
  },
  {
    id: "pro-export-slice",
    groupId: "publish",
    href: "/studio/export",
    ko: "세로 조각 · PSD 내보내기",
    en: "Vertical Slice & PSD Export",
    koDesc: "연재 플랫폼 규격 자동 분할 및 출고",
    enDesc: "Platform slice export and PSD packaging",
    synonyms: "세로 조각 출고 다운로드 png psd",
  },
  {
    id: "pro-ai-director",
    groupId: "create",
    href: "/studio/ai-lab",
    ko: "AI 구도 · 연출 도우미",
    en: "AI Framing & Direction Helper",
    koDesc: "대본 컷 배분 · 카메라 앵글 제안",
    enDesc: "Script panel split and camera framing",
    synonyms: "콘티 대본 구도 연출 ai",
  },
  {
    id: "pro-fit-lab",
    groupId: "grow",
    href: "/market/fit",
    ko: "원고 위 소재 시험 (Fit Lab)",
    en: "Manuscript Fit Lab",
    koDesc: "설치 전 브러시·3D 배경 호환성 즉시 점검",
    enDesc: "Test brushes and 3D assets on your page",
    synonyms: "소재 테스트 호환성 라이선스 fit lab",
  },
  {
    id: "pro-ai-keys",
    groupId: "personal",
    href: "/settings/ai",
    ko: "내 AI 키 · 클라우드 연동",
    en: "AI Keys & Cloud Connection",
    koDesc: "개인 BYOK 키 및 백업 저장소 관리",
    enDesc: "Manage personal BYOK keys and cloud sync",
    synonyms: "api 키 설정 클라우드 백업",
  },
];

const ROUTE_SYNONYMS: Readonly<Record<string, string>> = {
  "/studio/comic": "드로잉 펜 선화 말풍선 컷 분할 원근 자 벡터 지우개 손떨림 보정",
  "/studio/bg3d": "3D 배경 선화 추출 카메라 소실점 blender glb",
  "/studio/assets/characters/new": "3D 캐릭터 셰이퍼 포즈 등신대 얼굴 체형 vrm",
  "/production": "협업 팀원 초대 역할 권한 공동 작업 핀 댓글 검수 승인 수정 이력 복원",
  "/market": "소재 마켓 브러시 스크린톤 상업용 무료 no-ai",
  "/my": "내 공간 서재 정산 알림 최근 작업",
  "/settings": "환경설정 테마 단축키 백업 언어",
};

/** 저장해 둔 검색·필터 주소는 전체 디렉터리에서 같은 조건으로 연다. */
function useLegacyDirectoryTarget(): string | null {
  const { search, hash } = useLocation();
  const hasFilter = [...new URLSearchParams(search).keys()].some((key) => DIRECTORY_QUERY_KEYS.has(key));
  return hasFilter || hash.startsWith("#sitemap-") ? `/sitemap/all${search}${hash}` : null;
}

function MenuDestination({ item }: { readonly item: SiteNavigationItem }) {
  const locale = useI18n((state) => state.lang);
  const Icon = item.icon;
  return <Link href={item.href} aria-label={siteNavigationText(item.label, locale)} className="sitemap-menu-destination">
    <Icon size={21} aria-hidden="true" />
    <span><strong>{siteNavigationText(item.label, locale)}</strong><small>{siteNavigationText(item.description, locale)}</small></span>
    <ChevronRight size={18} aria-hidden="true" />
  </Link>;
}

export function SitemapPage() {
  const bt = useBilingual("SitemapPage");
  const locale = useI18n((state) => state.lang);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeGroupId, setActiveGroupId] = useState<string>("all");
  const legacyTarget = useLegacyDirectoryTarget();

  const normalizedQuery = searchQuery.trim().toLowerCase().replace(/\s+/gu, "");
  const filteredGroups = useMemo(() => {
    return SITE_NAVIGATION_GROUPS
      .filter((group) => activeGroupId === "all" || group.id === activeGroupId)
      .map((group) => {
        const baseCards = group.items.map((navItem) => ({
          id: navItem.id,
          href: navItem.href,
          title: siteNavigationText(navItem.label, locale),
          desc: siteNavigationText(navItem.description, locale),
          synonyms: `${navItem.label.ko} ${navItem.label.en} ${navItem.description.ko} ${ROUTE_SYNONYMS[navItem.href] ?? ""}`,
        }));
        const extraCards = EXTRA_PRO_ENTRIES
          .filter((extra) => extra.groupId === group.id && !baseCards.some((card) => card.href === extra.href))
          .map((extra) => ({
            id: extra.id,
            href: extra.href,
            title: locale === "en" ? extra.en : extra.ko,
            desc: locale === "en" ? extra.enDesc : extra.koDesc,
            synonyms: `${extra.ko} ${extra.en} ${extra.koDesc} ${extra.synonyms}`,
          }));
        const allCards = [...baseCards, ...extraCards];
        const matched = !normalizedQuery
          ? allCards
          : allCards.filter((card) => {
              const haystack = `${card.title} ${card.desc} ${card.href} ${card.synonyms}`
                .toLowerCase()
                .replace(/\s+/gu, "");
              return haystack.includes(normalizedQuery) || toKoreanChoseong(haystack).includes(normalizedQuery);
            });
        return { group, cards: matched };
      })
      .filter((entry) => entry.cards.length > 0);
  }, [activeGroupId, locale, normalizedQuery]);

  if (legacyTarget) return <Navigate to={legacyTarget} replace />;

  return <div className="sitemap-menu-page" data-sitemap-view="hub">
    <header className="sitemap-menu-header">
      <p className="sitemap-menu-eyebrow">{bt("전체 메뉴 · 0클릭 통합 기능 디렉터리", "All menus · 0-Click Full Feature Directory")}</p>
      <h1>{bt("무엇을 하고 싶으세요?", "What would you like to do?")}</h1>
      <p>{bt("모든 기능을 명확한 실무 이름과 초성·동의어 검색으로 한 화면에서 바로 실행하세요.", "Find and launch every studio, collaboration, market, and account feature right on one screen.")}</p>
    </header>

    <nav className="sitemap-menu-start" aria-label={bt("바로 시작", "Quick start")}>
      <MenuDestination item={SITE_NAVIGATION_ITEMS.make} />
      <MenuDestination item={SITE_NAVIGATION_ITEMS.studio} />
    </nav>

    <div className="sitemap-v4-toolbar">
      <label className="sitemap-v4-search-box">
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setSearchQuery("");
              setActiveGroupId("all");
            }
          }}
          data-testid="sitemap-inline-search"
          aria-label={bt("전체 기능 실시간 초성·동의어 검색", "Live initial-consonant and synonym feature search")}
          placeholder={bt(
            "찾고 싶은 기능·도구·단축어 입력 (예: 말풍선, ㅁㅍㅅ, 3D 배경, 팀원 초대, PSD...)",
            "Filter features by name or keyword (e.g. balloon, 3D stage, invite, PSD...)",
          )}
        />
      </label>

      <OpenSearchButton className="sitemap-menu-search" aria-label={bt("메뉴 이름으로 검색", "Search by menu name")}>
        <Search size={18} aria-hidden="true" />
        <span>{bt("메뉴 이름으로 검색", "Search by menu name")}</span>
      </OpenSearchButton>
    </div>

    <div
      role="group"
      aria-label={bt("도메인별 빠른 필터", "Quick domain filters")}
      className="sitemap-v4-chips"
    >
      <button
        type="button"
        aria-pressed={activeGroupId === "all"}
        onClick={() => setActiveGroupId("all")}
        className={activeGroupId === "all" ? "sitemap-v4-chip is-active" : "sitemap-v4-chip"}
      >
        {bt("전체 한눈에 보기", "Show all")}
      </button>
      {SITE_NAVIGATION_GROUPS.map((group) => (
        <button
          key={group.id}
          type="button"
          aria-pressed={activeGroupId === group.id}
          onClick={() => setActiveGroupId(group.id)}
          className={activeGroupId === group.id ? "sitemap-v4-chip is-active" : "sitemap-v4-chip"}
        >
          {siteNavigationText(group.label, locale)}
        </button>
      ))}
    </div>

    <section
      aria-label={bt("전 기능 0클릭 도메인 그리드", "0-click domain feature grid")}
      data-testid="sitemap-zero-click-directory"
      key={activeGroupId}
      className="sitemap-v4-grid ink-cascade"
    >
      {filteredGroups.length > 0 ? (
        filteredGroups.map(({ group, cards }) => {
          return (
            <article key={group.id} className="sitemap-v4-domain-card ink-frame">
              <div className="sitemap-v4-domain-head">
                <div className="sitemap-v4-domain-title">
                  <SitePurposeGraphic group={group} />
                  <div>
                    <h2>{siteNavigationText(group.label, locale)}</h2>
                    <p>{siteNavigationText(group.description, locale)}</p>
                  </div>
                </div>
                <span className="sitemap-v4-domain-count">{`${cards.length}${locale === "en" ? "" : "종"}`}</span>
              </div>
              <ul className="sitemap-v4-link-list">
                {cards.map((card) => (
                  <li key={`${group.id}-${card.id}`}>
                    <Link href={card.href} className="sitemap-v4-direct-link">
                      <span>
                        <strong>{card.title}</strong>
                        <small>{card.desc}</small>
                      </span>
                      <code>{card.href}</code>
                    </Link>
                  </li>
                ))}
              </ul>
            </article>
          );
        })
      ) : (
        <div className="sitemap-v4-empty">
          <p>{bt("일치하는 기능이 없습니다. 검색어를 지우거나 전체 보기를 눌러 주세요.", "No features match your filter.")}</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setActiveGroupId("all");
            }}
            className="sitemap-v4-chip is-active"
          >
            {bt("필터 초기화", "Reset filter")}
          </button>
        </div>
      )}
    </section>

    <nav className="sitemap-menu-sections" aria-label={bt("목적별 메뉴", "Menus by purpose")}>
      {SITE_NAVIGATION_GROUPS.map((group) => {
        return <Link key={group.id} href={`/sitemap/${group.id}`} className="sitemap-menu-section">
          <SitePurposeGraphic group={group} />
          <span><strong>{siteNavigationText(group.label, locale)}</strong><small>{siteNavigationText(group.description, locale)}</small></span>
          <ChevronRight size={19} aria-hidden="true" />
        </Link>;
      })}
    </nav>

    <nav className="sitemap-menu-utilities" aria-label={bt("계정과 도움말", "Account and help")}>
      {SITE_UTILITY_NAVIGATION.map((item) => <Link key={item.id} href={item.href}>{siteNavigationText(item.label, locale)}</Link>)}
    </nav>
    <Link href="/sitemap/all" className="sitemap-menu-directory">
      <span>{bt("전체 기능 목록 보기", "Browse every feature")}</span><ArrowRight size={17} aria-hidden="true" />
    </Link>
  </div>;
}

export function SitemapSectionPage() {
  const { section } = useParams<{ section: string }>();
  const bt = useBilingual("SitemapPage");
  const locale = useI18n((state) => state.lang);
  const group = SITE_NAVIGATION_GROUPS.find((item) => item.id === section?.toLowerCase());

  return <div className="sitemap-menu-page" data-sitemap-view="section">
    <Link href="/sitemap" className="sitemap-menu-back"><ArrowLeft size={18} aria-hidden="true" />{bt("전체 메뉴", "All menus")}</Link>
    <header className="sitemap-menu-header">
      <h1>{group ? siteNavigationText(group.label, locale) : bt("메뉴를 찾을 수 없어요", "Menu not found")}</h1>
      <p>{group ? siteNavigationText(group.description, locale) : bt("전체 메뉴에서 하려는 일을 다시 골라주세요.", "Return to all menus and choose what you want to do.")}</p>
    </header>
    {group ? <nav className="sitemap-menu-destinations" aria-label={siteNavigationText(group.label, locale)}>
      {group.items.map((item) => <MenuDestination key={item.id} item={item} />)}
    </nav> : null}
  </div>;
}
