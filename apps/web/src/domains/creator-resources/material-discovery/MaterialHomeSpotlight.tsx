import {
  ArrowRight,
  FileCheck2,
  Layers3,
  MousePointerClick,
  Plug2,
  ShieldCheck,
} from "lucide-react";

import { HorizontalScrollRail } from "@/shared/components/HorizontalScrollRail";
import Link from "@/shared/navigation/router-link";

import catalogData from "../material-atlas/catalog.json";
import { MATERIAL_PROVIDERS, parseMaterialCatalog } from "../material-atlas/model";
import { TRENDING_MATERIAL_KEYWORDS } from "./material-search-ux";
import { useCountUp } from "./useCountUp";
import "./material-discovery.css";

const CATALOG = parseMaterialCatalog(catalogData);
const ASSET_COUNT = CATALOG?.assets.length ?? 0;
const PROVIDER_COUNT = Object.keys(MATERIAL_PROVIDERS).length;

/** 스포트라이트 수치 항목. `fixed`가 있으면 카운트업 대신 고정 문구를 보여준다. */
type SpotlightStat = {
  readonly label: string;
  readonly suffix: string;
  readonly fixed?: string;
};

const EN_POPULAR_KEYWORDS = ["wood", "brick", "concrete", "forest", "night", "chair", "stone", "metal"] as const;

const COPY = {
  ko: {
    eyebrow: "INTEGRATED MATERIAL DISCOVERY",
    licenseBadge: "CC0 상업 라이선스 자동 검증",
    title: "배경·소품 고민은\n여기서 끝내세요",
    body: "경쟁사처럼 외부 사이트를 오가며 출처를 수동 확인할 필요가 없습니다. ToonStudio는 3D 배경·브러시·텍스처·포즈·효과음을 한 곳에서 찾고, 상업 라이선스를 자동 검증해 원클릭으로 스튜디오 캔버스에 올립니다.",
    categories: ["3D 배경", "브러시", "텍스처", "포즈", "효과음", "HDRI 조명"],
    safetyBadges: [
      { icon: ShieldCheck, label: "상업 라이선스 자동 검증" },
      { icon: FileCheck2, label: "출처 명세서 원클릭 내보내기" },
      { icon: MousePointerClick, label: "캔버스 1클릭 즉시 적용" },
    ],
    keywordHeading: "인기 소재 키워드 바로 검색",
    keywordRailLabel: "인기 소재 키워드 바로가기",
    keywordPrevLabel: "이전 인기 키워드 보기",
    keywordNextLabel: "다음 인기 키워드 보기",
    keywordHint: "마우스 휠·드래그로 인기 키워드 이동",
    points: [
      { icon: Layers3, title: "유료 생성 API 없이", body: "실측 CC0 소재를 바로 쓰는 진짜 제작 자료" },
      { icon: Plug2, title: "공식 오픈 API 연동", body: "Poly Haven·ambientCG, 한글 검색 지원" },
      { icon: MousePointerClick, title: "클릭 한 번으로", body: "장면 보드에 담고 스튜디오 캔버스로 즉시 적용" },
    ],
    stats: [
      { label: "무료 CC0 소재", suffix: "+" },
      { label: "오픈 API 제공처", suffix: "" },
      { label: "스튜디오 캔버스 투입", suffix: "", fixed: "1-click" },
    ] as SpotlightStat[],
    handoffTitle: "캔버스 즉시 적용 3단계",
    handoffSteps: [
      "한글 키워드·유형으로 CC0 소재 탐색",
      "상업 라이선스·출처 확인 후 장면 보드 담기",
      "'캔버스로 보내기' 클릭해 스튜디오 바로 열기",
    ],
    handoffAction: "스튜디오 캔버스 바로 열기",
    primary: "소재 도감 열어보기",
    secondary: "소재 바로 검색하기",
  },
  en: {
    eyebrow: "INTEGRATED MATERIAL DISCOVERY",
    licenseBadge: "Auto-verified CC0 commercial license",
    title: "Stop hunting for\nbackgrounds and props",
    body: "Unlike tab-hopping across disconnected asset sites, ToonStudio unifies 3D backdrops, brushes, textures, poses, and audio with automatic CC0 license checks and one-click canvas handoff. No sign-up, API key, or card required.",
    categories: ["3D Backdrops", "Brushes", "Textures", "Poses", "Audio SFX", "HDRI Light"],
    safetyBadges: [
      { icon: ShieldCheck, label: "Auto CC0 license check" },
      { icon: FileCheck2, label: "1-click credit spec export" },
      { icon: MousePointerClick, label: "1-click canvas apply" },
    ],
    keywordHeading: "Jump in with popular keywords",
    keywordRailLabel: "Popular material keyword shortcuts",
    keywordPrevLabel: "Previous popular keywords",
    keywordNextLabel: "Next popular keywords",
    keywordHint: "Use mouse wheel or drag to browse keywords",
    points: [
      { icon: Layers3, title: "No paid generation API", body: "Real production-ready CC0 materials" },
      { icon: Plug2, title: "Official open APIs", body: "Poly Haven and ambientCG, Korean and English search" },
      { icon: MousePointerClick, title: "One click", body: "Collect to a scene board and apply on canvas" },
    ],
    stats: [
      { label: "Free CC0 materials", suffix: "+" },
      { label: "Open API providers", suffix: "" },
      { label: "Send to studio canvas", suffix: "", fixed: "1-click" },
    ] as SpotlightStat[],
    handoffTitle: "Apply to canvas in 3 steps",
    handoffSteps: [
      "Search verified CC0 materials by keyword or type",
      "Review license metadata and save to your scene board",
      "Click Send to Canvas to open directly in Studio",
    ],
    handoffAction: "Open Studio canvas",
    primary: "Open the material atlas",
    secondary: "Jump to material search",
  },
} as const;

type Locale = keyof typeof COPY;

/**
 * 홈 마케팅용 소재 탐색 스포트라이트.
 * 통합 소재 검색 바로가기, 인기 키워드 레일, 상업 라이선스 안전 배지,
 * 캔버스 즉시 적용 안내와 실측 카운트업 수치를 OKLCH 스펙트럼 디자인으로 보여준다.
 */
export function MaterialHomeSpotlight({ locale = "ko" }: { locale?: Locale }) {
  const copy = COPY[locale];
  const assets = useCountUp(ASSET_COUNT);
  const providers = useCountUp(PROVIDER_COUNT);
  const statValues = [assets.toLocaleString(locale === "ko" ? "ko-KR" : "en-US"), String(providers), null];
  const keywords = locale === "ko" ? TRENDING_MATERIAL_KEYWORDS.slice(0, 8) : EN_POPULAR_KEYWORDS;

  return (
    <section
      className="md-spotlight"
      aria-labelledby="md-spotlight-title"
      data-testid="material-home-spotlight"
    >
      <div className="md-spotlight-ribbon" aria-hidden="true" />
      <div className="md-spotlight-copy">
        <div className="md-spotlight-kicker-row">
          <p className="md-spotlight-eyebrow">{copy.eyebrow}</p>
          <span className="md-license-badge">
            <ShieldCheck size={14} aria-hidden="true" />
            {copy.licenseBadge}
          </span>
        </div>

        <h2 id="md-spotlight-title">
          {copy.title.split("\n").map((line, index) => (
            <span key={index}>
              {line}
              <br />
            </span>
          ))}
        </h2>
        <p className="md-spotlight-body">{copy.body}</p>

        <div className="md-spotlight-categories" role="list" aria-label={locale === "ko" ? "통합 지원 소재 영역" : "Integrated material categories"}>
          {copy.categories.map((category) => (
            <span key={category} className="md-spotlight-category-pill" role="listitem">
              {category}
            </span>
          ))}
        </div>

        <ul className="md-spotlight-badges" aria-label={locale === "ko" ? "라이선스·캔버스 안전 보증" : "License and canvas handoff guarantees"}>
          {copy.safetyBadges.map(({ icon: Icon, label }) => (
            <li key={label} className="md-spotlight-badge-item">
              <Icon size={15} aria-hidden="true" />
              <span>{label}</span>
            </li>
          ))}
        </ul>

        <div className="md-spotlight-keywords">
          <p id="md-spotlight-keyword-heading" className="md-spotlight-keyword-label">
            {copy.keywordHeading}
          </p>
          <HorizontalScrollRail
            trackRole="group"
            ariaLabel={copy.keywordRailLabel}
            ariaLabelledBy="md-spotlight-keyword-heading"
            prevLabel={copy.keywordPrevLabel}
            nextLabel={copy.keywordNextLabel}
            hintText={copy.keywordHint}
            showProgress={false}
            showHint
            className="md-keyword-rail"
            trackClassName="md-keyword-track"
          >
            {keywords.map((keyword) => (
              <Link
                key={keyword}
                href={`/research/materials?q=${encodeURIComponent(keyword)}#material-search`}
                className="md-keyword-chip"
              >
                #{keyword}
              </Link>
            ))}
          </HorizontalScrollRail>
        </div>

        <ul className="md-spotlight-points">
          {copy.points.map(({ icon: Icon, title, body }) => (
            <li key={title}>
              <span className="md-spotlight-icon" aria-hidden="true">
                <Icon size={18} />
              </span>
              <div>
                <strong>{title}</strong>
                <span>{body}</span>
              </div>
            </li>
          ))}
        </ul>

        <div className="md-spotlight-actions">
          <Link href="/research/materials" className="md-spotlight-primary">
            {copy.primary}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link href="/research/materials#material-search" className="md-spotlight-secondary">
            {copy.secondary}
          </Link>
        </div>
      </div>

      <div className="md-spotlight-aside">
        <div
          className="md-spotlight-stats"
          role="list"
          aria-label={locale === "ko" ? "소재 도감 핵심 수치" : "Material atlas highlights"}
        >
          {copy.stats.map((stat, index) => (
            <div key={stat.label} className="md-spotlight-stat" role="listitem">
              <strong>{stat.fixed ?? `${statValues[index] ?? 0}${stat.suffix}`}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>

        <div className="md-spotlight-handoff">
          <p className="md-spotlight-handoff-title">{copy.handoffTitle}</p>
          <ol className="md-spotlight-handoff-steps">
            {copy.handoffSteps.map((step, index) => (
              <li key={step}>
                <span aria-hidden="true">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <Link href="/studio/new" className="md-spotlight-handoff-link">
            {copy.handoffAction}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
