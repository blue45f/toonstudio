import { useBilingual, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { lazy, Suspense, useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";

import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";
import { readStudioLaunchDensity } from "../studio-launch-mode";

import {
  resolveStudioProjectView,
  studioProjectDefaultView,
} from "../studio-project-views";
import { StudioAudiencePolicyPanel } from "./StudioAudiencePolicyPanel";
import { StudioExportPanel } from "./StudioExportPanel";
import { StudioIpOpportunityPanel } from "./StudioIpOpportunityPanel";
import { StudioLocalizationPanel } from "./StudioLocalizationPanel";
import { StudioProjectAssistantPanel } from "./StudioProjectAssistantPanel";
import { StudioProjectMediaGuide } from "./StudioProjectMediaGuide";
import { StudioProjectDeliveryPanel } from "./StudioProjectDeliveryPanel";
import { StudioProjectDocumentsPanel } from "./StudioProjectDocumentsPanel";
import { StudioProductionCocreatorBridgePanel } from "./StudioProductionCocreatorBridgePanel";
import { StudioStaffingSourcingPanel } from "./StudioStaffingSourcingPanel";
import { StudioProjectFeatureSuitePanel } from "./StudioProjectFeatureSuitePanel";
import { StudioReviewPanel } from "./StudioReviewPanel";
import { studioVirtualSpaceReviewSubjectFromLocation } from "../virtual-space/studio-virtual-space-review-invitation";
import { studioReviewResolutionRequestFromLocation } from "../review-resolution/studio-review-resolution-route";
import { StudioProductionToolchainPanel } from "../toolchain/StudioProductionToolchainPanel";
import { StudioSeriesKitPanel } from "./StudioSeriesKitPanel";
import {
  StudioProjectShellPage,
  type StudioProjectSection,
} from "./StudioProjectShellPage";

const StudioCreatorIntelligencePanel = lazy(async () => {
  const module = await import("../creator-intelligence/StudioCreatorIntelligencePanel");
  return { default: module.StudioCreatorIntelligencePanel };
});

const StudioCompatibilityReportsPanel = lazy(async () => {
  const module = await import("../project-graph/StudioCompatibilityReportsPanel");
  return { default: module.StudioCompatibilityReportsPanel };
});

const StudioProjectGraphContextBar = lazy(async () => {
  const module = await import("../project-graph/StudioProjectGraphContextBar");
  return { default: module.StudioProjectGraphContextBar };
});

const StudioProjectVersionStackPanel = lazy(async () => {
  const module = await import("../project-graph/StudioProjectVersionStackPanel");
  return { default: module.StudioProjectVersionStackPanel };
});

const StudioPinnedReviewPanel = lazy(async () => {
  const module = await import("../virtual-space/StudioPinnedReviewPanel");
  return { default: module.StudioPinnedReviewPanel };
});

// 투고 패키지는 ZIP·PDF 작성 코드를 끌고 오므로 '만든 파일' 보기를 열 때만 불러온다.
const StudioSubmissionPackagePanel = lazy(async () => {
  const module = await import("../submission-package/StudioSubmissionPackagePanel");
  return { default: module.StudioSubmissionPackagePanel };
});

// KAISTORY 만화 제작·다국어 검수·학습카드 워크벤치 (conti · design · editor · story 통합 표면).
const StudioKaistoryProductionWorkbench = lazy(async () => {
  const module = await import("../kaistory/StudioKaistoryProductionWorkbench");
  return { default: module.StudioKaistoryProductionWorkbench };
});

// 캔바·미리캔버스·망고보드·키틀 등 8대 디자인 플랫폼 역공학 내재화 워크벤치.
const StudioDesignPlatformWorkbench = lazy(async () => {
  const module = await import("../design-platform/StudioDesignPlatformWorkbench");
  return { default: module.StudioDesignPlatformWorkbench };
});

// ArtCraft Crafting Apps 15종 스위트 (Launcher, PhotoCraft ~ GridCraft, 미공개 AniCraft) 역공학 내재화 워크벤치.
const StudioArtCraftSuiteWorkbench = lazy(async () => {
  const module = await import("../artcraft-suite/StudioArtCraftSuiteWorkbench");
  return { default: module.StudioArtCraftSuiteWorkbench };
});

function SubmissionPackageFallback() {
  const bt = useBilingual("studioProjectIntegrated.submissionFallback");
  return (
    <div
      className="min-h-20 animate-pulse rounded-2xl border border-line bg-card/80 motion-reduce:animate-none"
      role="status"
      aria-label={bt("투고 패키지 화면을 불러오는 중", "Loading the submission package panel")}
    />
  );
}

function ProjectGraphPanelFallback({ locale: _locale }: { readonly locale: "ko" | "en" }) {
  const bt = useBilingual("studioProjectIntegrated.graphFallback");
  return (
    <div
      className="min-h-20 animate-pulse rounded-2xl border border-line bg-card/80"
      role="status"
      aria-label={bt("작품 버전 정보를 불러오는 중", "Loading project version data")}
    />
  );
}

function localeFromLanguage(language: string): "ko" | "en" {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

function decodeProjectId(projectId: string): string {
  try {
    return decodeURIComponent(projectId);
  } catch {
    return projectId;
  }
}

function SectionWorkflow({
  projectId,
  section,
  view,
  locale,
  focusedStory = false,
}: {
  readonly projectId: string;
  readonly section: StudioProjectSection;
  readonly view: string;
  readonly locale: "ko" | "en";
  readonly focusedStory?: boolean;
}) {
  const bt = useBilingual("StudioProjectIntegratedPage.workflow");
  useBilingualI18nRevision();
  const location = useLocation();
  const pinnedSubject = useMemo(
    () => studioVirtualSpaceReviewSubjectFromLocation(projectId, location.search),
    [projectId, location.search],
  );
  const resolutionRequest = useMemo(
    () => studioReviewResolutionRequestFromLocation(projectId, location.search),
    [projectId, location.search],
  );
  const hasReviewPin = new URLSearchParams(location.search).has("sharedReview");
  const showDelivery = section === "export" || (section === "settings" && view === "archive");

  if (section === "review" && hasReviewPin) {
    return (
      <Suspense fallback={<ProjectGraphPanelFallback locale={locale} />}>
        <StudioPinnedReviewPanel
          subject={pinnedSubject}
          resolutionRequest={resolutionRequest}
        />
      </Suspense>
    );
  }

  const hasExportSecondaryChecks =
    section === "export" &&
    (view === "preflight" || view === "targets" || view === "packages");

  return (
    <>
      {section === "export" ? (
        <StudioExportPanel projectId={projectId} locale={locale} />
      ) : null}
      {section === "export" && view === "packages" ? (
        <Suspense fallback={<SubmissionPackageFallback />}>
          {/* 프로젝트가 바뀌면 다시 만든다 — 작품 소개·회차 칸·고른 이미지가 다른 프로젝트로 섞이면 안 된다. */}
          <StudioSubmissionPackagePanel key={projectId} projectId={projectId} locale={locale} />
        </Suspense>
      ) : null}
      {showDelivery ? (
        <StudioProjectDeliveryPanel
          projectId={projectId}
          section={section}
          view={view}
          locale={locale}
        />
      ) : null}
      {hasExportSecondaryChecks ? (
        <details className="rounded-2xl border border-line bg-card/85">
          <summary className="min-h-12 cursor-pointer px-4 py-3 text-sm font-bold text-fg-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            {bt(
              "연령 등급 · 2차 저작물 · 호환성 상세 점검 펼쳐 보기 (선택)",
              "Show audience rating, IP opportunities & compatibility checks (optional)",
            )}
          </summary>
          <div className="space-y-4 border-t border-line p-3 sm:p-4">
            {view === "preflight" ? (
              <>
                <Suspense fallback={<ProjectGraphPanelFallback locale={locale} />}>
                  <StudioCompatibilityReportsPanel projectId={projectId} locale={locale} />
                </Suspense>
                <StudioAudiencePolicyPanel projectId={projectId} />
              </>
            ) : null}
            {view === "targets" || view === "packages" ? (
              <StudioIpOpportunityPanel projectId={projectId} />
            ) : null}
          </div>
        </details>
      ) : null}

      <StudioProjectFeatureSuitePanel
        projectId={projectId}
        section={section}
        view={view}
        locale={locale}
        focusedStory={focusedStory}
      />
      {section === "overview" && view === "intelligence" ? (
        <Suspense fallback={<ProjectGraphPanelFallback locale={locale} />}>
          <StudioCreatorIntelligencePanel projectId={projectId} locale={locale} />
        </Suspense>
      ) : null}
      {section === "production" ? (
        <StudioProductionCocreatorBridgePanel projectId={projectId} locale={locale} />
      ) : null}
      {section === "production" && (view === "board" || view === "workload") ? (
        <StudioStaffingSourcingPanel projectId={projectId} />
      ) : null}
      {section === "production" && view === "documents" ? (
        <StudioProjectDocumentsPanel projectId={projectId} locale={locale} />
      ) : null}
      {section === "production" && (view === "pipeline" || view === "renders") ? (
        <details className="rounded-2xl border border-line bg-card/85">
          <summary className="min-h-12 cursor-pointer px-4 py-3 text-sm font-bold text-fg-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            {bt(
              "제작·검토 도구 더 보기",
              "More production and review tools",
            )}
          </summary>
          <div className="space-y-4 border-t border-line p-3 sm:p-4">
            <StudioProductionToolchainPanel projectId={projectId} view={view} />
            <Suspense fallback={<ProjectGraphPanelFallback locale={locale} />}>
              <StudioKaistoryProductionWorkbench projectId={projectId} />
            </Suspense>
            <Suspense fallback={<ProjectGraphPanelFallback locale={locale} />}>
              <StudioDesignPlatformWorkbench projectId={projectId} />
            </Suspense>
            <Suspense fallback={<ProjectGraphPanelFallback locale={locale} />}>
              <StudioArtCraftSuiteWorkbench projectId={projectId} />
            </Suspense>
          </div>
        </details>
      ) : null}
      {section === "story" && view === "localization" ? (
        <StudioLocalizationPanel projectId={projectId} locale={locale} />
      ) : null}
      {section === "assets" && view === "series" ? (
        <StudioSeriesKitPanel projectId={projectId} locale={locale} />
      ) : null}
      {section === "review" && view === "versions" ? (
        <Suspense fallback={<ProjectGraphPanelFallback locale={locale} />}>
          <StudioProjectVersionStackPanel projectId={projectId} locale={locale} />
        </Suspense>
      ) : null}
      {section === "review" ? (
        <StudioReviewPanel projectId={projectId} locale={locale} />
      ) : null}
      {section === "assets" && (view === "missing" || view === "rights") ? (
        <Suspense fallback={<ProjectGraphPanelFallback locale={locale} />}>
          <StudioCompatibilityReportsPanel projectId={projectId} locale={locale} />
        </Suspense>
      ) : null}
      {section === "settings" && view === "general" ? (
        <StudioAudiencePolicyPanel projectId={projectId} />
      ) : null}
    </>
  );
}

/**
 * Compose the canonical project shell with every project-owned production capability.
 * Frequent stage tools and the AI assistant stay upfront, while reference guides and
 * secondary diagnostics fold cleanly so beginners aren't overwhelmed by stacked panels.
 */
export function StudioProjectIntegratedPage({
  section,
}: {
  readonly section: StudioProjectSection;
}) {
  const bt = useBilingual("StudioProjectIntegratedPage");
  const { projectId = "" } = useParams<{ projectId: string }>();
  const location = useLocation();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  const decodedProjectId = decodeProjectId(projectId);
  const view = (() => {
    try {
      return resolveStudioProjectView(decodedProjectId, section, location.search).view;
    } catch {
      return studioProjectDefaultView(section);
    }
  })();

  const focusedStory =
    section === "story" &&
    view === "script" &&
    readStudioLaunchDensity(location.search) === "focus";
  const workflow = (
    <SectionWorkflow
      projectId={decodedProjectId}
      section={section}
      view={view}
      locale={locale}
      focusedStory={focusedStory}
    />
  );
  const guidance = (
    <Suspense fallback={<ProjectGraphPanelFallback locale={locale} />}>
      <StudioProjectGraphContextBar projectId={decodedProjectId} locale={locale} />
      <StudioProjectMediaGuide section={section} />
    </Suspense>
  );
  const assistant = (
    <StudioProjectAssistantPanel
      projectId={decodedProjectId}
      section={section}
      locale={locale}
    />
  );
  return (
    <>
      <StudioProjectShellPage section={section} />
      {decodedProjectId ? (
        <Container size="wide" className="-mt-3 space-y-5 pb-10 sm:-mt-5 sm:pb-14">
          {focusedStory ? (
            <>
              {workflow}
              <details className="rounded-2xl border border-line bg-card">
                <summary className="min-h-12 cursor-pointer px-4 py-3 text-sm font-semibold text-fg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                  {bt("작품 정보·제작 도움말", "Project details and production help")}
                </summary>
                <div className="space-y-4 border-t border-line p-3">
                  {assistant}
                  {guidance}
                </div>
              </details>
            </>
          ) : (
            <>
              {workflow}
              {assistant}
              <details className="rounded-2xl border border-line bg-card/85">
                <summary className="min-h-12 cursor-pointer px-4 py-3 text-sm font-semibold text-fg-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                  {bt(
                    "작품 연결 구조 · 단계별 도움말 펼쳐 보기",
                    "Show project graph & step-by-step guide",
                  )}
                </summary>
                <div className="space-y-4 border-t border-line p-3 sm:p-4">{guidance}</div>
              </details>
            </>
          )}
        </Container>
      ) : null}
    </>
  );
}
