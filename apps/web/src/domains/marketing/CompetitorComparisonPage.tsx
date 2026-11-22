import { ArrowRight, CheckCircle2, Compass, Layers, Scale, ShieldCheck, Sparkles } from "lucide-react";

import { CompetitorComparisonMatrix } from "./CompetitorComparisonMatrix";
import {
  COMPARISON_AXES,
  COMPARISON_SNAPSHOT_DATE,
  COMPETITOR_PROFILES,
  CURRENT_VS_TARGET_BOUNDARIES,
  DECISION_SCENARIOS,
  countComparisonCriteria,
  getCompetitorProfile,
  type BilingualCopy,
} from "./competitor-comparison-data";

import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle, useMetaDescription } from "@/shared/seo/use-document-title";

function pick(copy: BilingualCopy, locale: "ko" | "en"): string {
  return locale === "ko" ? copy.ko : copy.en;
}

const COPY = {
  ko: {
    eyebrow: `TOOL COMPARISON · ${COMPARISON_SNAPSHOT_DATE}`,
    title: "ToonStudio vs 주요 제작 도구 7종, 사실 기준 비교.",
    description:
      "Clip Studio Paint · Procreate · Photoshop · Rebelle · Blender · Creco · ACON3D와 ToonStudio를 드로잉·3D·식자·협업·UX·비용 5개 축으로 대조했습니다. 허위 벤치마크나 과장 수치 없이 실제 코드·테스트 근거와 타사 강점을 함께 밝힙니다.",
    startCta: "₩0 베타 스튜디오 열기",
    pricingCta: "요금·베타 정책 보기",
    docTitle: "ToonStudio vs 경쟁 도구 7종 비교 · 기능·디자인·품질·비용",
    metaDescription:
      "ToonStudio와 Clip Studio Paint, Procreate, Photoshop, Rebelle, Blender, Creco, ACON3D의 5대 비교 축, 코드 실측 근거, 상황별 선택 가이드를 확인하세요.",
    factsAria: "비교 기준 요약",
    factToolsLabel: "비교 대상 도구 (ToonStudio 포함)",
    factCriteriaLabel: "실측 대조 항목 (5대 비교 축)",
    factBetaLabel: "현재 베타 전 기능 구독 비용",
    factLicenseLabel: "비상업 mixbox 의존성 (자동 감사)",
    honestyNote:
      "기준일 2026-11-22 코드·문서 실측 기준입니다. 각 항목은 현재 구현(Current)·전환 중(In progress)·향후 목표(Target)를 구분해 표기하며, 타사 금액은 지역·환율·프로모션 변동이 크므로 임의 원화 추정 대신 공식 과금 구조만 적었습니다.",
    profilesEyebrow: "8-TOOL LANDSCAPE",
    profilesTitle: "비교 대상 8종 역할·과금 구조·호환성 한눈에 보기",
    profilesSubtitle:
      "경쟁 도구를 전면 대체하기보다, 각 도구의 강점을 인정하고 PSD·GLB·VRM·SKP 파일 왕복으로 연결하는 구성을 전제로 정리했습니다.",
    pricingLabel: "과금 구조",
    platformLabel: "실행 환경",
    strengthLabel: "핵심 강점",
    interopLabel: "ToonStudio 연동",
    guideEyebrow: "OBJECTIVE DECISION GUIDE",
    guideTitle: "언제 어떤 도구를 쓰면 좋을까요?",
    guideSubtitle:
      "작업 환경과 연재 단계에 따라 가장 합리적인 조합은 다릅니다. ToonStudio가 최선이 아닌 경우도 솔직하게 적었습니다.",
    recommendedLabel: "권장 조합",
    coexistenceLabel: "함께 쓰는 방법",
    boundaryEyebrow: "CURRENT VS TARGET",
    boundaryTitle: "현재 구현(Current)과 향후 목표(Target)의 경계",
    boundarySubtitle:
      "아직 진행 중이거나 베타 실증이 필요한 영역을 완성된 성과처럼 포장하지 않습니다.",
    currentBadge: "현재 구현 (Current)",
    targetBadge: "향후 목표 (Target)",
    nextTitle: "직접 확인해 보세요",
    nextBody:
      "설치나 결제 등록 없이 브라우저에서 캔버스·3D 배경·식자·분업 OS를 바로 열어 보고, 기술 아키텍처와 IR 브리프에서 상세 근거를 확인할 수 있습니다.",
    nextStudio: "새 작품 시작하기",
    nextIr: "IR · 투자 소개",
    nextDrawingCompare: "드로잉 툴 8종 심층 기술 비교",
    nextTech: "기술과 신뢰 허브",
    nextFeatures: "전체 기능 한눈에",
    nextWorkCompare: "독자용 두 작품 비교(/compare)",
  },
  en: {
    eyebrow: `TOOL COMPARISON · ${COMPARISON_SNAPSHOT_DATE}`,
    title: "ToonStudio vs. 7 leading creative tools — grounded in code.",
    description:
      "A side-by-side comparison of ToonStudio against Clip Studio Paint, Procreate, Photoshop, Rebelle, Blender, Creco and ACON3D across 5 axes: drawing, 3D, lettering, collaboration and UX/cost — backed by real code paths and candid competitor strengths.",
    startCta: "Open KRW 0 beta studio",
    pricingCta: "View beta pricing policy",
    docTitle: "ToonStudio vs. 7 Creative Tools · Features, Design, Quality & Cost",
    metaDescription:
      "Compare ToonStudio with Clip Studio Paint, Procreate, Photoshop, Rebelle, Blender, Creco and ACON3D across 5 production axes with verified code evidence.",
    factsAria: "Comparison scope summary",
    factToolsLabel: "Tools compared (incl. ToonStudio)",
    factCriteriaLabel: "Verified criteria across 5 axes",
    factBetaLabel: "Current beta subscription cost",
    factLicenseLabel: "Non-commercial mixbox packages",
    honestyNote:
      "Measured from the 2026-11-22 repository and docs. Every capability separates Current, In progress and Target states. Competitor pricing lists official billing structures rather than stale currency estimates.",
    profilesEyebrow: "8-TOOL LANDSCAPE",
    profilesTitle: "Roles, pricing structures & interoperability across all 8 tools",
    profilesSubtitle:
      "Rather than claiming total replacement, ToonStudio respects each tool's strengths and connects via PSD, GLB, VRM and SKP round-trips.",
    pricingLabel: "Billing model",
    platformLabel: "Platforms",
    strengthLabel: "Core strength",
    interopLabel: "ToonStudio interop",
    guideEyebrow: "OBJECTIVE DECISION GUIDE",
    guideTitle: "When should you pick which tool?",
    guideSubtitle:
      "The best stack depends on your hardware, habits and team size — including cases where another tool fits better.",
    recommendedLabel: "Recommended stack",
    coexistenceLabel: "How they work together",
    boundaryEyebrow: "CURRENT VS TARGET",
    boundaryTitle: "Clear boundary between Current implementation and Target goals",
    boundarySubtitle:
      "Ongoing migrations and unvalidated beta goals are disclosed openly rather than presented as finished milestones.",
    currentBadge: "Current",
    targetBadge: "Target",
    nextTitle: "Verify it directly in your browser",
    nextBody:
      "Launch the canvas, 3D stage, lettering tools and Division OS with no install or billing, or inspect our engineering and IR briefs.",
    nextStudio: "Start a new work",
    nextIr: "IR · Investor brief",
    nextDrawingCompare: "8-tool drawing technical deep dive",
    nextTech: "Technology & trust hub",
    nextFeatures: "All features at a glance",
    nextWorkCompare: "Reader work comparison (/compare)",
  },
} as const;

export function CompetitorComparisonPage() {
  const lang = useI18n((state) => state.lang);
  const locale: "ko" | "en" = lang === "en" ? "en" : "ko";
  const copy = COPY[locale];
  const totalCriteria = countComparisonCriteria();

  useDocumentTitle(copy.docTitle);
  useMetaDescription(copy.metaDescription);

  const summaryFacts = [
    {
      value: locale === "ko" ? `${COMPETITOR_PROFILES.length}종` : String(COMPETITOR_PROFILES.length),
      label: copy.factToolsLabel,
    },
    {
      value: locale === "ko" ? `${COMPARISON_AXES.length}축 · ${totalCriteria}항목` : `${COMPARISON_AXES.length} axes · ${totalCriteria}`,
      label: copy.factCriteriaLabel,
    },
    {
      value: "₩0",
      label: copy.factBetaLabel,
    },
    {
      value: locale === "ko" ? "0건" : "0",
      label: copy.factLicenseLabel,
    },
  ];

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <SitePageHeader
        size="hero"
        icon={Scale}
        eyebrow={copy.eyebrow}
        titleId="competitor-comparison-title"
        title={copy.title}
        description={copy.description}
        art="canvas-noir"
        actions={
          <>
            <Link href="/studio/new" className={buttonClass({ size: "md", className: "min-h-11" })}>
              {copy.startCta}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link href="/pricing" className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}>
              {copy.pricingCta}
            </Link>
          </>
        }
      />

      {/* 실측 요약 지표 */}
      <section className="mt-8 sm:mt-10" aria-label={copy.factsAria}>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summaryFacts.map((fact) => (
            <div key={fact.label} className="rounded-3xl border border-line bg-card/80 px-5 py-4">
              <dd className="font-display text-2xl font-bold tracking-[-0.03em] tabular-nums text-fg sm:text-3xl">
                {fact.value}
              </dd>
              <dt className="mt-1 break-keep text-xs leading-5 text-fg-3 sm:text-sm">{fact.label}</dt>
            </div>
          ))}
        </dl>
        <p className="mt-3 max-w-4xl break-keep text-xs leading-6 text-fg-3">
          {copy.honestyNote}
        </p>
      </section>

      {/* 5축 인터랙티브 비교 매트릭스 */}
      <CompetitorComparisonMatrix locale={locale} />

      {/* 8종 도구 프로필 & 호환성 요약 */}
      <section className="mt-12 sm:mt-16" aria-labelledby="compare-profiles-heading">
        <p className="font-display text-xs font-bold tracking-[0.12em] text-accent uppercase">
          {copy.profilesEyebrow}
        </p>
        <h2
          id="compare-profiles-heading"
          className="mt-1 break-keep text-xl font-bold tracking-[-0.02em] text-fg sm:text-2xl"
        >
          {copy.profilesTitle}
        </h2>
        <p className="mt-2 max-w-3xl break-keep text-sm leading-6 text-fg-2">
          {copy.profilesSubtitle}
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COMPETITOR_PROFILES.map((profile) => {
            const isToonStudio = profile.id === "toonstudio";
            return (
              <article
                key={profile.id}
                data-testid={`compare-profile-${profile.id}`}
                className={
                  isToonStudio
                    ? "flex flex-col rounded-3xl border border-accent/60 bg-panel p-5"
                    : "flex flex-col rounded-3xl border border-line bg-card p-5"
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-fg">{profile.name}</h3>
                    <p className="mt-0.5 break-keep text-xs text-fg-3">{pick(profile.role, locale)}</p>
                  </div>
                  {isToonStudio ? (
                    <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold text-accent">
                      ₩0 Beta
                    </span>
                  ) : null}
                </div>

                <dl className="mt-4 space-y-2.5 border-t border-line/60 pt-3.5 text-xs leading-5">
                  <div>
                    <dt className="font-semibold text-fg-3">{copy.pricingLabel}</dt>
                    <dd className="mt-0.5 break-keep text-fg">{pick(profile.pricingModel, locale)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-fg-3">{copy.platformLabel}</dt>
                    <dd className="mt-0.5 break-keep text-fg-2">{pick(profile.platform, locale)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-fg-3">{copy.strengthLabel}</dt>
                    <dd className="mt-0.5 break-keep text-fg-2">{pick(profile.primaryStrength, locale)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-fg-3">{copy.interopLabel}</dt>
                    <dd className="mt-0.5 break-keep text-fg-2">{pick(profile.interopWithToonStudio, locale)}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>

      {/* 상황별 객관적 선택 가이드 */}
      <section className="mt-12 sm:mt-16" aria-labelledby="compare-decision-guide-heading">
        <div className="flex items-center gap-2 text-accent">
          <Compass size={16} aria-hidden="true" />
          <p className="font-display text-xs font-bold tracking-[0.12em] uppercase">
            {copy.guideEyebrow}
          </p>
        </div>
        <h2
          id="compare-decision-guide-heading"
          className="mt-1 break-keep text-xl font-bold tracking-[-0.02em] text-fg sm:text-2xl"
        >
          {copy.guideTitle}
        </h2>
        <p className="mt-2 max-w-3xl break-keep text-sm leading-6 text-fg-2">
          {copy.guideSubtitle}
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {DECISION_SCENARIOS.map((scenario) => (
            <article
              key={scenario.id}
              data-testid={`compare-scenario-${scenario.id}`}
              className="flex flex-col justify-between rounded-3xl border border-line bg-panel p-5"
            >
              <div>
                <h3 className="break-keep text-sm font-bold leading-6 text-fg sm:text-base">
                  {pick(scenario.situation, locale)}
                </h3>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-fg-3">{copy.recommendedLabel}:</span>
                  {scenario.recommendedTools.map((toolId) => {
                    const tool = getCompetitorProfile(toolId);
                    return (
                      <span
                        key={toolId}
                        className={
                          toolId === "toonstudio"
                            ? "rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent"
                            : "rounded-full bg-raised px-2.5 py-0.5 text-xs font-semibold text-fg"
                        }
                      >
                        {tool.name}
                      </span>
                    );
                  })}
                </div>
                <p className="mt-3 break-keep text-xs leading-6 text-fg-2 sm:text-sm">
                  {pick(scenario.reason, locale)}
                </p>
              </div>

              <div className="mt-4 border-t border-line/60 pt-3 text-xs leading-5 text-fg-3">
                <strong className="font-semibold text-fg-2">{copy.coexistenceLabel}: </strong>
                <span className="break-keep">{pick(scenario.coexistenceTip, locale)}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Current vs Target 투명 경계 */}
      <section
        className="mt-12 rounded-3xl border border-line bg-card p-5 sm:mt-16 sm:p-7"
        aria-labelledby="compare-boundary-heading"
      >
        <div className="flex items-center gap-2 text-accent">
          <ShieldCheck size={16} aria-hidden="true" />
          <p className="font-display text-xs font-bold tracking-[0.12em] uppercase">
            {copy.boundaryEyebrow}
          </p>
        </div>
        <h2
          id="compare-boundary-heading"
          className="mt-1 break-keep text-xl font-bold tracking-[-0.02em] text-fg sm:text-2xl"
        >
          {copy.boundaryTitle}
        </h2>
        <p className="mt-2 max-w-3xl break-keep text-sm leading-6 text-fg-2">
          {copy.boundarySubtitle}
        </p>

        <div className="mt-5 divide-y divide-line/70">
          {CURRENT_VS_TARGET_BOUNDARIES.map((item) => (
            <div key={item.id} className="grid gap-4 py-4 lg:grid-cols-[14rem_minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <h3 className="break-keep text-sm font-bold text-fg">{pick(item.area, locale)}</h3>
                <ul className="mt-2 space-y-1 font-mono text-[11px] text-fg-3">
                  {item.repoPaths.map((repoPath) => (
                    <li key={repoPath} className="break-all">
                      {repoPath}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl bg-panel/80 px-4 py-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-good">
                  <CheckCircle2 size={14} aria-hidden="true" />
                  <span>{copy.currentBadge}</span>
                </div>
                <p className="mt-1.5 break-keep text-xs leading-6 text-fg-2 sm:text-sm">
                  {pick(item.currentState, locale)}
                </p>
              </div>
              <div className="rounded-2xl bg-raised/60 px-4 py-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-cool">
                  <Sparkles size={14} aria-hidden="true" />
                  <span>{copy.targetBadge}</span>
                </div>
                <p className="mt-1.5 break-keep text-xs leading-6 text-fg-2 sm:text-sm">
                  {pick(item.targetState, locale)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 다음 행동 및 관련 경로 */}
      <section
        className="mt-10 rounded-3xl border border-line bg-panel p-5 sm:p-7"
        aria-labelledby="compare-next-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <h2 id="compare-next-heading" className="break-keep text-lg font-bold text-fg sm:text-xl">
              {copy.nextTitle}
            </h2>
            <p className="mt-1.5 break-keep text-sm leading-6 text-fg-2">
              {copy.nextBody}
            </p>
          </div>
          <Layers size={24} className="hidden text-accent sm:block" aria-hidden="true" />
        </div>

        <nav
          aria-label={locale === "ko" ? "관련 페이지 이동" : "Related destinations"}
          className="mt-5 flex flex-wrap gap-2.5"
        >
          <Link href="/studio/new" className={buttonClass({ size: "md", className: "min-h-11" })}>
            {copy.nextStudio}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
          <Link href="/ir" className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}>
            {copy.nextIr}
          </Link>
          <Link href="/about/technology/drawing-compare" className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}>
            {copy.nextDrawingCompare}
          </Link>
          <Link href="/about/technology" className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}>
            {copy.nextTech}
          </Link>
          <Link href="/features" className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}>
            {copy.nextFeatures}
          </Link>
          <Link href="/compare" className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}>
            {copy.nextWorkCompare}
          </Link>
        </nav>
      </section>
    </Container>
  );
}
