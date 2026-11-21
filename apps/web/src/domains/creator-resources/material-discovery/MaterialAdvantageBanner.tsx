import {
  Box,
  Check,
  ChevronDown,
  Layers3,
  MousePointerClick,
  Move3d,
  Paintbrush,
  Plug2,
  ShieldCheck,
  Sun,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useInRouterContext } from "react-router-dom";

import { HorizontalScrollRail } from "@/shared/components/HorizontalScrollRail";
import { prefersHorizontalReducedMotion } from "@/shared/lib/horizontal-scroll-ergonomics";

import { RESOURCE_BUTTON } from "../navigation";
import { MaterialHomeSpotlight } from "./MaterialHomeSpotlight";
import { useCountUp } from "./useCountUp";
import "./material-discovery.css";

interface QuickCategoryJump {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly href: string;
  readonly tone: "3d" | "market" | "collab" | "creation" | "support";
  readonly icon: LucideIcon;
  readonly scrollToSearch?: boolean;
}

const QUICK_CATEGORY_JUMPS: readonly QuickCategoryJump[] = [
  {
    id: "bg3d",
    label: "3D 배경·소품",
    summary: "CC0 3D 모델 바로 필터",
    href: "/research/materials?kind=model#material-search",
    tone: "3d",
    icon: Box,
    scrollToSearch: true,
  },
  {
    id: "texture",
    label: "재질·텍스처",
    summary: "PBR 벽돌·목재·바닥",
    href: "/research/materials?kind=texture#material-search",
    tone: "market",
    icon: Layers3,
    scrollToSearch: true,
  },
  {
    id: "hdri",
    label: "빛·환경 HDRI",
    summary: "야경·노을·실내 조명",
    href: "/research/materials?kind=hdri#material-search",
    tone: "collab",
    icon: Sun,
    scrollToSearch: true,
  },
  {
    id: "brush",
    label: "브러시",
    summary: "스튜디오 브러시 라이브러리",
    href: "/studio/assets/brushes",
    tone: "creation",
    icon: Paintbrush,
  },
  {
    id: "pose",
    label: "포즈",
    summary: "3D 데생 인형·포저",
    href: "/studio/poser",
    tone: "collab",
    icon: Move3d,
  },
  {
    id: "sfx",
    label: "효과음·오디오",
    summary: "장면 효과음·BGM",
    href: "/studio/assets/audio",
    tone: "support",
    icon: Volume2,
  },
];

const WORKFLOW_PILLARS = [
  {
    step: "01",
    title: "통합 한글 검색",
    detail: "3D 배경 · 브러시 · 텍스처 · 포즈 · 효과음을 탭 이동 없이 한 흐름에서 탐색",
  },
  {
    step: "02",
    title: "상업 라이선스 자동 검증",
    detail: "CC0 조건·원작자 출처·상업 이용 확인 항목을 명세서로 자동 정리",
  },
  {
    step: "03",
    title: "캔버스 1클릭 투입",
    detail: "장면 보드에 담아두고 스튜디오 캔버스로 클릭 한 번에 바로 전달",
  },
] as const;

function SafeBannerLink({
  href,
  className,
  ariaLabel,
  dataTone,
  onClick,
  children,
}: {
  readonly href: string;
  readonly className: string;
  readonly ariaLabel?: string;
  readonly dataTone?: string;
  readonly onClick?: () => void;
  readonly children: ReactNode;
}) {
  const inRouter = useInRouterContext();
  if (inRouter && href.startsWith("/")) {
    return (
      <Link
        to={href}
        className={className}
        aria-label={ariaLabel}
        data-tone={dataTone}
        onClick={onClick}
      >
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      className={className}
      aria-label={ariaLabel}
      data-tone={dataTone}
      onClick={onClick}
    >
      {children}
    </a>
  );
}

/**
 * 소재 페이지 상단 히어로 배너.
 * 경쟁사에 없는 ToonStudio 통합 소재 검색(3D 배경·브러시·텍스처·포즈·효과음·상업 라이선스 자동 검증·캔버스 1클릭 투입)과
 * 빠른 유형 점프 칩을 OKLCH 스펙트럼 비주얼로 부각한다.
 */
export function MaterialAdvantageBanner({
  assetCount,
  providerCount,
}: {
  assetCount: number;
  providerCount: number;
}) {
  const assets = useCountUp(assetCount);
  const providers = useCountUp(providerCount);
  const inRouter = useInRouterContext();
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const points = [
    { icon: Layers3, text: "유료 생성 API 없이 바로 쓰는 CC0 실측 소재" },
    { icon: Plug2, text: "Poly Haven·ambientCG 공식 오픈 API 연동, 한글 검색 지원" },
    { icon: ShieldCheck, text: "상업 라이선스 자동 검증과 출처 명세서 내보내기 기본 포함" },
    { icon: MousePointerClick, text: "클릭 한 번으로 장면 보드에 담고 스튜디오 캔버스로" },
  ];

  const scrollSearchIntoView = () => {
    const target = document.querySelector("#material-search");
    target?.scrollIntoView?.({
      behavior: prefersHorizontalReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  };

  return (
    <section
      className="md-advantage-banner"
      aria-labelledby="md-advantage-title"
      data-testid="material-advantage-banner"
    >
      <div className="md-advantage-ribbon" aria-hidden="true" />

      <div className="md-advantage-head">
        <div className="md-advantage-kicker-row">
          <p className="md-advantage-eyebrow">WHY TOONSTUDIO MATERIALS</p>
          <span className="md-license-badge">
            <ShieldCheck size={14} aria-hidden="true" />
            상업 라이선스 자동 검증 · CC0
          </span>
        </div>
        <h2 id="md-advantage-title" className="mt-2 text-xl font-bold sm:text-2xl">
          배경·소품 고민은 여기서 끝내세요
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-fg-2">
          경쟁사처럼 3D·텍스처·브러시·포즈·효과음 사이트를 따로 돌며 라이선스를 수동 확인할 필요가
          없습니다. ToonStudio 통합 소재 검색은 찾은 자료의 상업 라이선스를 자동 검증해 장면 보드에
          담고, 원클릭으로 스튜디오 캔버스에 바로 투입합니다. 가입·API 키·카드 등록이 필요 없습니다.
        </p>
      </div>

      <div className="md-advantage-workflow" role="list" aria-label="ToonStudio 통합 소재 검색 핵심 강점">
        {WORKFLOW_PILLARS.map((pillar) => (
          <div key={pillar.step} className="md-advantage-pillar" role="listitem">
            <span className="md-advantage-step" aria-hidden="true">
              {pillar.step}
            </span>
            <div>
              <strong>{pillar.title}</strong>
              <p>{pillar.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="md-advantage-jump-section">
        <p id="md-quick-jump-label" className="md-advantage-jump-label">
          빠른 소재 유형 점프
        </p>
        <HorizontalScrollRail
          trackRole="group"
          ariaLabelledBy="md-quick-jump-label"
          prevLabel="이전 소재 유형 보기"
          nextLabel="다음 소재 유형 보기"
          hintText="마우스 휠·드래그로 소재 유형 가로 이동"
          showProgress
          showHint
          className="md-jump-rail"
          trackClassName="md-jump-track"
        >
          {QUICK_CATEGORY_JUMPS.map(({ id, label, summary, href, tone, icon: Icon, scrollToSearch }) => (
            <SafeBannerLink
              key={id}
              href={href}
              className="md-jump-chip"
              dataTone={tone}
              ariaLabel={`${label} — ${summary}`}
              onClick={scrollToSearch ? scrollSearchIntoView : undefined}
            >
              <span className="md-jump-chip-icon" aria-hidden="true">
                <Icon size={16} />
              </span>
              <span className="md-jump-chip-copy">
                <strong>{label}</strong>
                <small>{summary}</small>
              </span>
            </SafeBannerLink>
          ))}
        </HorizontalScrollRail>
      </div>

      <div className="md-advantage-stats" role="list" aria-label="소재 도감 핵심 수치">
        <div className="md-advantage-stat" role="listitem">
          <strong aria-label={`무료 소재 ${assetCount}개`}>{assets.toLocaleString("ko-KR")}+</strong>
          <span>무료 CC0 소재</span>
        </div>
        <div className="md-advantage-stat" role="listitem">
          <strong aria-label={`오픈 API 제공처 ${providerCount}곳`}>{providers}</strong>
          <span>오픈 API 제공처</span>
        </div>
        <div className="md-advantage-stat" role="listitem">
          <strong>CC0 검증</strong>
          <span>상업 라이선스 자동 확인</span>
        </div>
        <div className="md-advantage-stat" role="listitem">
          <strong>1-click</strong>
          <span>스튜디오로 보내기</span>
        </div>
      </div>

      <ul className="md-advantage-points">
        {points.map(({ icon: Icon, text }) => (
          <li key={text}>
            <Icon size={16} aria-hidden="true" />
            {text}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <a
          className={`${RESOURCE_BUTTON} border-accent bg-accent text-on-accent hover:bg-accent-2`}
          href="#material-search"
        >
          <Check size={15} aria-hidden="true" />
          지금 소재 찾아보기
        </a>
        <a className={RESOURCE_BUTTON} href="#material-board">
          장면 소재 목록 열기
        </a>
        <SafeBannerLink href="/studio/bg3d" className={RESOURCE_BUTTON}>
          3D 배경 스튜디오 열기
        </SafeBannerLink>
        {inRouter ? (
          <button
            type="button"
            className={RESOURCE_BUTTON}
            aria-expanded={spotlightOpen}
            onClick={() => setSpotlightOpen((open) => !open)}
          >
            인기 키워드 · 캔버스 적용 가이드
            <ChevronDown
              size={15}
              aria-hidden="true"
              className={spotlightOpen ? "ml-1 rotate-180" : "ml-1"}
            />
          </button>
        ) : null}
      </div>

      {inRouter && spotlightOpen ? (
        <div className="mt-1">
          <MaterialHomeSpotlight />
        </div>
      ) : null}
    </section>
  );
}
