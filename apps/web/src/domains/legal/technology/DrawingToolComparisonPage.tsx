import {
  AlertCircle,
  ArrowRight,
  Award,
  GitCompareArrows,
  Layers3,
  Scale,
  Sparkles,
} from "lucide-react";

import {
  COMPETITOR_ADVANTAGES,
  DRAWING_COMPARE_SNAPSHOT_DATE,
  DRAWING_COMPARISON_CATEGORIES,
  DRAWING_TOOL_PROFILES,
  TOONSTUDIO_HONEST_LIMITATIONS,
  countDrawingCriteria,
  countToolSupportStats,
  getDrawingToolProfile,
  type BilingualText,
} from "./drawing-tool-comparison-data";
import { DrawingToolComparisonMatrix } from "./DrawingToolComparisonMatrix";
import { EngineeringPageFrame, EngineeringPageIntro } from "./EngineeringStoryUi";

import { useI18n } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle, useMetaDescription } from "@/shared/seo/use-document-title";

function pick(text: BilingualText, locale: "ko" | "en"): string {
  return locale === "ko" ? text.ko : text.en;
}

const COPY = {
  ko: {
    docTitle: "드로잉 툴 8종 기술 심층 비교 · 브러시·필터·안료 물리·협업",
    metaDescription:
      "ToonStudio와 Clip Studio Paint, Krita, Magma Studio, Procreate, Rebelle 7, Photoshop, ibisPaint/MediBang의 브러시 엔진, 안료 물리, 필터, 선화, 만화 도구, 실시간 협업을 37개 항목으로 비교합니다.",
    eyebrow: `DRAWING ENGINE COMPARISON · ${DRAWING_COMPARE_SNAPSHOT_DATE}`,
    title: "드로잉 툴 8종 기술 심층 비교: 브러시·안료·필터·협업.",
    description:
      "ToonStudio와 Clip Studio Paint · Krita · Magma Studio · Procreate · Rebelle 7 · Photoshop · ibisPaint/MediBang을 7개 기술 영역, 37개 세부 기능으로 대조했습니다. 각 항목을 펼치면 실제 저장소 구현 근거와 경쟁 툴 간 아키텍처 차이를 바로 확인할 수 있습니다.",
    openStudio: "₩0 브라우저 캔버스 열기",
    overallCompare: "전체 제작 도구 비교(/about/compare)",
    kpiAria: "드로잉 툴 비교 기준 요약",
    kpiToolsLabel: "비교 대상 드로잉 툴",
    kpiCriteriaLabel: "세부 기술 비교 항목 (7개 영역)",
    kpiCurrentLabel: "ToonStudio 지원 / 부분 지원",
    kpiCostLabel: "브라우저 로컬 베타 비용",
    methodologyNote:
      "기준일 2026-11-22 코드·문서 실측 기준입니다. 허위 FPS나 추정 원화 단가 대신 실제 저장소 파일과 공식 지원 범위만 적었으며, 각 경쟁 도구가 앞서는 지점과 ToonStudio의 현재 한계를 분리해 밝힙니다.",
    profilesEyebrow: "8 DRAWING TOOLS · ENGINE PROFILES",
    profilesTitle: "비교 대상 8종 엔진 구조 · 플랫폼 · 지원 분포",
    profilesSubtitle:
      "아래 수치는 본 표의 37개 항목을 단순 집계한 분포이며, 절대적인 우열 점수가 아닙니다. 작업 목적에 맞는 강점 영역을 함께 살펴보세요.",
    engineLabel: "엔진",
    platformLabel: "플랫폼",
    pricingLabel: "과금 구조",
    strengthLabel: "핵심 강점",
    interopLabel: "파일·포맷 연동",
    honestyEyebrow: "HONEST LIMITS & PEER STRENGTHS",
    honestyTitle: "경쟁 툴이 앞서는 지점과 ToonStudio의 정직한 한계",
    honestySubtitle:
      "모든 면에서 기존 데스크톱·전용 앱을 앞선다고 말하지 않습니다. 경쟁 도구의 검증된 우위를 먼저 인정하고, 브라우저 로컬 WebGPU가 푸는 차별점만 선명하게 대비합니다.",
    competitorStrengthsTitle: "각 경쟁 도구가 실제로 앞서는 영역",
    toonLimitsTitle: "ToonStudio의 현재 한계 vs 브라우저 WebGPU 차별점",
    limitBadge: "현재 한계 (Honest limit)",
    edgeBadge: "브라우저 WebGPU 차별점",
    nextTitle: "관련 기술 문서와 전체 도구 비교로 이어가기",
    nextBody:
      "브러시·3D·협업 아키텍처의 내부 설계, 채택 라이브러리와 라이선스 감사, 3D·제작관리 도구까지 포함한 전체 비교표를 바로 확인할 수 있습니다.",
    nextAllCompare: "전체 제작 도구 비교 (/about/compare)",
    nextArch: "기술 아키텍처 해설",
    nextLibs: "라이브러리 선택 이유",
    nextLicenses: "오픈소스·라이선스 감사",
  },
  en: {
    docTitle: "8 Drawing Tools Deep Technical Comparison · Brushes, Filters, Pigments & Collab",
    metaDescription:
      "Compare ToonStudio with Clip Studio Paint, Krita, Magma Studio, Procreate, Rebelle 7, Photoshop and ibisPaint/MediBang across 7 technical domains and 37 drawing criteria.",
    eyebrow: `DRAWING ENGINE COMPARISON · ${DRAWING_COMPARE_SNAPSHOT_DATE}`,
    title: "8 drawing tools compared in depth: brushes, pigments, filters and collab.",
    description:
      "A factual 7-domain, 37-criterion technical comparison of ToonStudio against Clip Studio Paint, Krita, Magma Studio, Procreate, Rebelle 7, Photoshop and ibisPaint/MediBang. Expand any row to inspect repository paths and architectural differences.",
    openStudio: "Open KRW 0 browser canvas",
    overallCompare: "Full production tool matrix (/about/compare)",
    kpiAria: "Drawing tool comparison summary",
    kpiToolsLabel: "Drawing tools compared",
    kpiCriteriaLabel: "Detailed criteria across 7 domains",
    kpiCurrentLabel: "ToonStudio supported / partial",
    kpiCostLabel: "Local browser beta cost",
    methodologyNote:
      "Grounded in the 2026-11-22 repository and docs. No invented FPS claims or stale currency estimates; every row distinguishes ToonStudio's current scope while candidly detailing competitor leads.",
    profilesEyebrow: "8 DRAWING TOOLS · ENGINE PROFILES",
    profilesTitle: "Architecture, platforms & matrix distribution across all 8 tools",
    profilesSubtitle:
      "Counts below summarize this 37-row matrix transparently rather than acting as an absolute score. Evaluate each tool by its standout strength.",
    engineLabel: "Engine",
    platformLabel: "Platforms",
    pricingLabel: "Pricing",
    strengthLabel: "Standout strength",
    interopLabel: "Format interop",
    honestyEyebrow: "HONEST LIMITS & PEER STRENGTHS",
    honestyTitle: "Where peer tools lead and ToonStudio's honest limitations",
    honestySubtitle:
      "ToonStudio does not claim universal superiority over native desktop or iPad apps. Here is where each peer leads and what browser-local WebGPU uniquely solves.",
    competitorStrengthsTitle: "Where each peer drawing tool genuinely leads",
    toonLimitsTitle: "ToonStudio's honest limits vs. browser WebGPU edge",
    limitBadge: "Honest limit",
    edgeBadge: "Browser WebGPU edge",
    nextTitle: "Continue to engineering deep dives and the full tool matrix",
    nextBody:
      "Inspect the underlying architecture, library choices, commercial license audit or the broader production comparison including Blender, Creco and ACON3D.",
    nextAllCompare: "Full production compare (/about/compare)",
    nextArch: "Architecture guide",
    nextLibs: "Library choices",
    nextLicenses: "Open-source & licenses",
  },
} as const;

export function DrawingToolComparisonPage() {
  const lang = useI18n((state) => state.lang);
  const locale: "ko" | "en" = lang === "en" ? "en" : "ko";
  const copy = COPY[locale];

  useDocumentTitle(copy.docTitle);
  useMetaDescription(copy.metaDescription);

  const totalCriteria = countDrawingCriteria();
  const toonStats = countToolSupportStats("toonstudio");

  const summaryFacts = [
    {
      value: locale === "ko" ? `${DRAWING_TOOL_PROFILES.length}종` : String(DRAWING_TOOL_PROFILES.length),
      label: copy.kpiToolsLabel,
    },
    {
      value: locale === "ko"
        ? `${DRAWING_COMPARISON_CATEGORIES.length}영역 · ${totalCriteria}항목`
        : `${DRAWING_COMPARISON_CATEGORIES.length} domains · ${totalCriteria}`,
      label: copy.kpiCriteriaLabel,
    },
    {
      value: locale === "ko"
        ? `${toonStats.supported} / ${toonStats.partial}`
        : `${toonStats.supported} / ${toonStats.partial}`,
      label: copy.kpiCurrentLabel,
    },
    {
      value: "₩0",
      label: copy.kpiCostLabel,
    },
  ];

  return (
    <EngineeringPageFrame pageId="drawing-compare">
      <EngineeringPageIntro
        pageId="drawing-compare"
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        aside={
          <div className="flex flex-wrap gap-2 lg:flex-col">
            <Link
              href="/studio/new"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <span>{copy.openStudio}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link
              href="/about/compare"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line-strong bg-card px-4 py-2.5 text-xs font-bold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <GitCompareArrows size={14} aria-hidden="true" />
              <span>{copy.overallCompare}</span>
            </Link>
          </div>
        }
      />

      {/* 실측 기준 KPI 요약 */}
      <section className="mt-4" aria-label={copy.kpiAria}>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summaryFacts.map((fact) => (
            <div key={fact.label} className="rounded-3xl border border-line/75 bg-card/80 px-4 py-4 sm:px-5">
              <dd className="font-display text-2xl font-black tracking-tight tabular-nums text-fg sm:text-3xl">
                {fact.value}
              </dd>
              <dt className="mt-1 break-keep text-xs leading-5 text-fg-3">{fact.label}</dt>
            </div>
          ))}
        </dl>
        <p className="mt-3 max-w-4xl break-keep text-xs leading-6 text-fg-3">
          {copy.methodologyNote}
        </p>
      </section>

      {/* 7개 영역 · 37개 항목 인터랙티브 비교 매트릭스 */}
      <DrawingToolComparisonMatrix locale={locale} />

      {/* 8종 드로잉 툴 프로필 카드 */}
      <section className="mt-12 sm:mt-16" aria-labelledby="drawing-profiles-heading">
        <p className="eyebrow text-accent">{copy.profilesEyebrow}</p>
        <h2
          id="drawing-profiles-heading"
          className="mt-2 break-keep text-xl font-black tracking-tight text-fg sm:text-2xl"
        >
          {copy.profilesTitle}
        </h2>
        <p className="mt-2 max-w-3xl break-keep text-sm leading-6 text-fg-2">
          {copy.profilesSubtitle}
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {DRAWING_TOOL_PROFILES.map((profile) => {
            const isToonStudio = profile.id === "toonstudio";
            const stats = countToolSupportStats(profile.id);
            return (
              <article
                key={profile.id}
                data-testid={`drawing-profile-${profile.id}`}
                className={
                  isToonStudio
                    ? "flex flex-col rounded-3xl border border-accent/55 bg-panel/90 p-5"
                    : "flex flex-col rounded-3xl border border-line/75 bg-card/75 p-5"
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-black text-fg">{profile.name}</h3>
                    <p className="mt-0.5 break-keep text-xs text-fg-3">
                      {pick(profile.engineSummary, locale)}
                    </p>
                  </div>
                  <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-[11px] font-bold tabular-nums text-fg-2">
                    {locale === "ko"
                      ? `지원 ${stats.supported} · 부분 ${stats.partial}${stats.plugin > 0 ? ` · 외부 ${stats.plugin}` : ""}`
                      : `Full ${stats.supported} · Partial ${stats.partial}${stats.plugin > 0 ? ` · Plugin ${stats.plugin}` : ""}`}
                  </span>
                </div>

                <dl className="mt-4 space-y-2.5 border-t border-line/60 pt-3.5 text-xs leading-5">
                  <div>
                    <dt className="font-bold text-fg-3">{copy.platformLabel}</dt>
                    <dd className="mt-0.5 break-keep text-fg-2">{pick(profile.platforms, locale)}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-fg-3">{copy.pricingLabel}</dt>
                    <dd className="mt-0.5 break-keep text-fg">{pick(profile.pricing, locale)}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-fg-3">{copy.strengthLabel}</dt>
                    <dd className="mt-0.5 break-keep text-fg-2">{pick(profile.standoutStrength, locale)}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-fg-3">{copy.interopLabel}</dt>
                    <dd className="mt-0.5 break-keep text-fg-2">{pick(profile.interopSummary, locale)}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>

      {/* 정직한 한계 & 경쟁 툴 강점 vs 브라우저 WebGPU 차별점 */}
      <section
        className="mt-12 rounded-[2rem] border border-line/80 bg-panel/75 p-5 shadow-sm sm:mt-16 sm:p-7"
        aria-labelledby="drawing-honesty-heading"
        data-testid="drawing-honest-limits-section"
      >
        <div className="flex items-center gap-2 text-accent">
          <Scale size={16} aria-hidden="true" />
          <p className="eyebrow">{copy.honestyEyebrow}</p>
        </div>
        <h2
          id="drawing-honesty-heading"
          className="mt-2 break-keep text-xl font-black tracking-tight text-fg sm:text-2xl"
        >
          {copy.honestyTitle}
        </h2>
        <p className="mt-2 max-w-3xl break-keep text-sm leading-6 text-fg-2">
          {copy.honestySubtitle}
        </p>

        {/* 경쟁 툴이 실제로 앞서는 지점 */}
        <div className="mt-6">
          <h3 className="flex items-center gap-2 text-sm font-black text-fg sm:text-base">
            <Award size={16} className="text-cool" aria-hidden="true" />
            <span>{copy.competitorStrengthsTitle}</span>
          </h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {COMPETITOR_ADVANTAGES.map((note) => {
              const profile = getDrawingToolProfile(note.toolId);
              return (
                <article
                  key={note.toolId}
                  data-testid={`drawing-peer-lead-${note.toolId}`}
                  className="rounded-2xl border border-line/70 bg-card/85 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full border border-cool/35 bg-cool/10 px-2.5 py-0.5 text-[11px] font-bold text-cool">
                      {profile.name}
                    </span>
                  </div>
                  <h4 className="mt-2 break-keep text-sm font-black text-fg">
                    {pick(note.advantageTitle, locale)}
                  </h4>
                  <p className="mt-1.5 break-keep text-xs leading-6 text-fg-2">
                    {pick(note.detail, locale)}
                  </p>
                </article>
              );
            })}
          </div>
        </div>

        {/* ToonStudio 현재 한계 vs 브라우저 WebGPU 차별점 */}
        <div className="mt-8 border-t border-line/70 pt-6">
          <h3 className="flex items-center gap-2 text-sm font-black text-fg sm:text-base">
            <Layers3 size={16} className="text-accent" aria-hidden="true" />
            <span>{copy.toonLimitsTitle}</span>
          </h3>
          <div className="mt-4 divide-y divide-line/70">
            {TOONSTUDIO_HONEST_LIMITATIONS.map((item) => (
              <div
                key={item.id}
                data-testid={`drawing-honest-limit-${item.id}`}
                className="grid gap-3 py-4 lg:grid-cols-[13.5rem_minmax(0,1fr)_minmax(0,1fr)]"
              >
                <div>
                  <h4 className="break-keep text-sm font-black text-fg">{pick(item.area, locale)}</h4>
                  <ul className="mt-2 space-y-1 font-mono text-[11px] text-fg-3">
                    {item.repoPaths.map((repoPath) => (
                      <li key={repoPath} className="break-all">
                        {repoPath}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl border border-warn/30 bg-card/85 px-4 py-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-warn">
                    <AlertCircle size={14} aria-hidden="true" />
                    <span>{copy.limitBadge}</span>
                  </div>
                  <p className="mt-1.5 break-keep text-xs leading-6 text-fg-2">
                    {pick(item.honestLimit, locale)}
                  </p>
                </div>
                <div className="rounded-2xl border border-accent/30 bg-accent-soft/25 px-4 py-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-accent">
                    <Sparkles size={14} aria-hidden="true" />
                    <span>{copy.edgeBadge}</span>
                  </div>
                  <p className="mt-1.5 break-keep text-xs leading-6 text-fg-2">
                    {pick(item.browserWebGpuEdge, locale)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 관련 문서 연결 */}
      <section
        className="mt-10 rounded-3xl border border-line/75 bg-card/75 p-5 sm:p-6"
        aria-labelledby="drawing-next-heading"
      >
        <h2 id="drawing-next-heading" className="break-keep text-lg font-black text-fg">
          {copy.nextTitle}
        </h2>
        <p className="mt-1.5 max-w-3xl break-keep text-sm leading-6 text-fg-2">
          {copy.nextBody}
        </p>
        <nav
          aria-label={locale === "ko" ? "관련 기술 문서 이동" : "Related engineering destinations"}
          className="mt-4 flex flex-wrap gap-2"
        >
          <Link
            href="/about/compare"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-on-accent transition-colors hover:bg-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-sm"
          >
            <GitCompareArrows size={15} aria-hidden="true" />
            <span>{copy.nextAllCompare}</span>
          </Link>
          <Link
            href="/about/technology/architecture"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line-strong bg-panel px-4 py-2 text-xs font-bold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-sm"
          >
            {copy.nextArch}
          </Link>
          <Link
            href="/about/technology/libraries"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line-strong bg-panel px-4 py-2 text-xs font-bold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-sm"
          >
            {copy.nextLibs}
          </Link>
          <Link
            href="/about/technology/licenses"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line-strong bg-panel px-4 py-2 text-xs font-bold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-sm"
          >
            {copy.nextLicenses}
          </Link>
        </nav>
      </section>
    </EngineeringPageFrame>
  );
}
