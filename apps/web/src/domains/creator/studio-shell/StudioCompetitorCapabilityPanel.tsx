import { CheckCircle2, ChevronDown, Compass, FlaskConical, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/shared/lib/utils";
import { WEBTOON_E2E_ROLE_PIPELINE_STAGES, type WebtoonPipelineStageId } from "../manga-toolkit/webtoon-role-pipeline-orchestrator";
import { STUDIO_COMPETITOR_CAPABILITY_EVALUATION, STUDIO_COMPETITOR_CAPABILITY_RECORDS } from "../studio-platform/studio-competitor-capability-evidence";
import {
  computeToonStudioSiteWideQualityScorecard,
  matchStudioCompetitorWorkflowPreset,
  resolveCompetitorServiceDeepProfile,
  resolveStudioPageReaBenchmark,
  STUDIO_PAGE_BY_PAGE_REA_BENCHMARKS,
  TOONSTUDIO_SITEWIDE_AUDIT_ISSUES_RESOLVED,
  type StudioPageDomainId,
} from "../studio-workspace-recommendation";
import type { StudioDefaultWorkspaceId } from "../studio-workspaces";
import type { CreatorRoleId } from "@/shared/lib/creator-role-contract";
import { StudioStoryToWebtoonStartupWorkbench } from "./StudioStoryToWebtoonStartupWorkbench";

export type StudioCompetitorCapabilityLocale = "ko" | "en";

const COMPETITOR_ROLE_FILTER_CHIPS: readonly { readonly id: "all" | CreatorRoleId; readonly labelKo: string; readonly labelEn: string; readonly roles: readonly CreatorRoleId[] }[] = Object.freeze([
  { id: "all", labelKo: "전체 직군", labelEn: "All roles", roles: [] },
  { id: "story", labelKo: "글·각색·콘티", labelEn: "Story & Board", roles: ["story", "adaptation", "associate-writer", "planner", "storyboard"] },
  { id: "background", labelKo: "3D 배경·어시", labelEn: "3D Background", roles: ["background", "background-assistant", "three-d"] },
  { id: "line-art", labelKo: "메인 선화·선화 어시", labelEn: "Line Art", roles: ["line-art", "line-assistant", "associate-artist", "character", "assistant"] },
  { id: "color", labelKo: "밑색·명암·후보정", labelEn: "Color & FX", roles: ["color", "flat-color-assistant", "shading-assistant", "effect-assistant"] },
  { id: "lettering", labelKo: "식자·효과음", labelEn: "Lettering", roles: ["lettering", "lettering-assistant", "localization"] },
  { id: "producer", labelKo: "편집자·PD 검수", labelEn: "PD Review", roles: ["editor", "producer", "reviewer", "educator"] },
]);

const PIPELINE_STAGE_EN: Readonly<Record<WebtoonPipelineStageId, { readonly label: string; readonly summary: string }>> = {
  "story-script": { label: "Story & adaptation", summary: "Plan the script, worldbuilding and dialogue." },
  "storyboard-conte": { label: "Storyboard", summary: "Plan panel composition and scroll pacing." },
  "bg3d-spatial": { label: "3D backgrounds", summary: "Plan scenery, camera framing and lighting." },
  "line-art-ink": { label: "Line art & cleanup", summary: "Divide lead artwork and assistant cleanup tasks." },
  "flat-color-mask": { label: "Flat color", summary: "Plan part colors and masking tasks." },
  "shading-fx-post": { label: "Shading & effects", summary: "Plan lighting, finishing and motion references." },
  "lettering-sfx": { label: "Lettering & SFX", summary: "Plan dialogue, balloons and sound-effect lettering." },
  "pd-editorial-review": { label: "Editorial review", summary: "Review the work and prepare delivery checks." },
};

export type StudioUiUxDensityModeId = "canvas-focus-zen" | "role-contextual-dock" | "full-production-workbench";

export interface StudioUiUxErgonomicsSpec {
  readonly id: StudioUiUxDensityModeId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly benchmarkSummaryKo: string;
  readonly benchmarkSummaryEn: string;
  readonly canvasViewportRatioPct: number;
  readonly targetDomNodeBudget: number;
  readonly activeDockColumns: number;
  readonly keyShortcutsKo: string;
  readonly keyShortcutsEn: string;
}

const STUDIO_UIUX_ERGONOMICS_MODES: Readonly<Record<StudioUiUxDensityModeId, StudioUiUxErgonomicsSpec>> = Object.freeze({
  "canvas-focus-zen": {
    id: "canvas-focus-zen", labelKo: "몰입형 Zen 캔버스 (Procreate · Photopea 형)", labelEn: "Zen Canvas Focus (Procreate · Photopea style)",
    benchmarkSummaryKo: "Photopea(403 DOM)·Procreate(870 DOM) 벤치마크: 캔버스 면적 86% 확보, 상하단 크롬 최소화 및 플로팅 퀵메뉴 중심 배치",
    benchmarkSummaryEn: "Photopea (403 DOM) & Procreate (870 DOM) benchmark: 86% canvas viewport ratio, minimal chrome and radial quick menu",
    canvasViewportRatioPct: 86, targetDomNodeBudget: 850, activeDockColumns: 1,
    keyShortcutsKo: "Tab(패널 숨김) · 2핑거 실행취소 · 3핑거 다시실행 · Space(팬)", keyShortcutsEn: "Tab (Hide docks) · 2-finger Undo · 3-finger Redo · Space (Pan)",
  },
  "role-contextual-dock": {
    id: "role-contextual-dock", labelKo: "직무 문맥형 인스펙터 (Figma · Clip Studio 형)", labelEn: "Role Contextual Inspector (Figma · Clip Studio style)",
    benchmarkSummaryKo: "Figma(2,284 DOM)·현재 역할 설정(736 DOM) 벤치마크: 선택한 직군·레이어에 필요한 4~5개 핵심 슬롯만 노출하는 점진적 공개(Progressive Disclosure)",
    benchmarkSummaryEn: "Figma (2,284 DOM) & role settings (736 DOM) benchmark: progressive disclosure showing only 4-5 role-relevant command slots",
    canvasViewportRatioPct: 76, targetDomNodeBudget: 1650, activeDockColumns: 2,
    keyShortcutsKo: "⌘K(통합 명령 검색) · Alt+드래그(스포이드/복제) · 1~5(직무 슬롯)", keyShortcutsEn: "Cmd+K (Command palette) · Alt+Drag (Eyedropper/Duplicate) · 1-5 (Role slots)",
  },
  "full-production-workbench": {
    id: "full-production-workbench", labelKo: "올인원 프로덕션 워크벤치 (Spline · Kitsu · Studio 기본형)", labelEn: "Full Production Workbench (Spline · Kitsu · Studio default)",
    benchmarkSummaryKo: "Spline(1,916 DOM)·현재 Studio 캔버스(3,524 DOM, 2 Workers) 기준: 3D 아웃라이너·18종 레이어 트리·컷 타임라인 동시 도킹",
    benchmarkSummaryEn: "Spline (1,916 DOM) & current Studio canvas (3,524 DOM, 2 Workers): simultaneous 3D outliner, 18-group layer tree and timeline docks",
    canvasViewportRatioPct: 64, targetDomNodeBudget: 3524, activeDockColumns: 3,
    keyShortcutsKo: "Shift+1~8(8단계 공정 뷰 전환) · L(레이어 잠금 점검) · P(2점 투시)", keyShortcutsEn: "Shift+1-8 (8-stage view switch) · L (Layer lock check) · P (2-point perspective)",
  },
});

export function StudioCompetitorCapabilityPanel({
  locale, compact = false, onSelectWorkspacePreset, activeWorkspaceId,
}: {
  readonly locale: StudioCompetitorCapabilityLocale; readonly compact?: boolean; readonly activeWorkspaceId?: StudioDefaultWorkspaceId; readonly onSelectWorkspacePreset?: (workspaceId: StudioDefaultWorkspaceId) => void;
}) {
  const evaluation = STUDIO_COMPETITOR_CAPABILITY_EVALUATION;
  const pending = STUDIO_COMPETITOR_CAPABILITY_RECORDS.filter(
    (record) => record.externalValidationRequired,
  );
  const [toolQuery, setToolQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | CreatorRoleId>("all");
  const [densityMode, setDensityMode] =
    useState<StudioUiUxDensityModeId>("role-contextual-dock");
  const [pageDomainId, setPageDomainId] =
    useState<StudioPageDomainId>("studio-role-workspace");
  const activeDensitySpec = STUDIO_UIUX_ERGONOMICS_MODES[densityMode];
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [selectedServiceName, setSelectedServiceName] = useState<string | null>(null);
  const activePageBenchmark = resolveStudioPageReaBenchmark(pageDomainId);
  const effectiveServiceName = selectedServiceName && activePageBenchmark.competitorServices.includes(selectedServiceName) ? selectedServiceName : activePageBenchmark.competitorServices[0];
  const activeServiceProfile = resolveCompetitorServiceDeepProfile(effectiveServiceName, pageDomainId);
  // 선택한 세부 기능이 현재 도메인에 없으면(도메인 전환 직후 등) 첫 항목으로 되돌린다.
  const activeSubEnhancement =
    activePageBenchmark.subEnhancements.find((sub) => sub.id === selectedSubId) ??
    activePageBenchmark.subEnhancements[0];
  const siteWideScorecard = computeToonStudioSiteWideQualityScorecard();
  const matchedWorkflows = useMemo(() => {
    const byQuery = matchStudioCompetitorWorkflowPreset(toolQuery);
    if (roleFilter === "all") return byQuery;
    const selectedRoles = COMPETITOR_ROLE_FILTER_CHIPS.find((chip) => chip.id === roleFilter)?.roles ?? [];
    return byQuery.filter((item) => item.recommendedRoles.some((role) => selectedRoles.includes(role)));
  }, [toolQuery, roleFilter]);

  const handleSelectWorkspace = (workspaceId: StudioDefaultWorkspaceId) => {
    onSelectWorkspacePreset?.(workspaceId);
  };

  return (
    <section
      className={cn(
        "mt-5 rounded-2xl border p-4 sm:p-5",
        evaluation.incompleteCount === 0
          ? "border-success/30 bg-success/5"
          : "border-danger/35 bg-danger/5",
      )}
      aria-labelledby="studio-competitor-capability-title"
      data-replacement-claim-allowed={String(evaluation.replacementClaimAllowed)}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-success" aria-hidden="true" />
            <h2 id="studio-competitor-capability-title" className="text-sm font-black text-fg">
              {locale === "ko"
                ? "전문 제작 기능 구현·검증 원장"
                : "Professional production capability ledger"}
            </h2>
          </div>
          <p className="mt-2 text-xs leading-5 text-fg-3">
            {locale === "ko"
              ? "계획한 57개 기능을 실제 제품 경로·저장·복구·호환·테스트 근거에 연결했습니다. 외부 실기기와 전문 작가 검증이 끝나기 전에는 ‘완전 대체’ 문구를 표시하지 않습니다."
              : "All 57 planned capabilities are connected to product, durability, compatibility and test evidence. A complete replacement claim stays disabled until independent device and creator validation is attached."}
          </p>
        </div>

        <div className="grid shrink-0 grid-cols-3 gap-2" aria-label={locale === "ko" ? "검증 요약" : "Validation summary"}>
          <Metric
            value={evaluation.verifiedCount}
            label={locale === "ko" ? "검증됨" : "Verified"}
            tone="success"
          />
          <Metric
            value={evaluation.externalValidationPendingCount}
            label={locale === "ko" ? "외부 검증" : "External"}
            tone="warning"
          />
          <Metric
            value={evaluation.incompleteCount}
            label={locale === "ko" ? "구현 누락" : "Gaps"}
            tone={evaluation.incompleteCount === 0 ? "success" : "danger"}
          />
        </div>
      </div>

      {!compact ? (
        <div
          className="mt-4 rounded-xl border border-line bg-card/85 p-3.5"
          data-testid="competitor-workflow-quick-match"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Compass size={15} className="text-accent" aria-hidden="true" />
              <h3 className="text-xs font-black text-fg">
                {locale === "ko"
                  ? "익숙한 도구로 작업공간 찾기"
                  : "Find a workspace by familiar tool"}
              </h3>
            </div>
            <label className="relative flex w-full min-w-0 items-center sm:w-56">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 text-fg-3"
                aria-hidden="true"
              />
              <input
                type="search"
                value={toolQuery}
                onChange={(event) => setToolQuery(event.target.value)}
                aria-label={
                  locale === "ko"
                    ? "익숙한 도구 또는 작업 검색"
                    : "Search familiar tool or workflow"
                }
                placeholder={
                  locale === "ko"
                    ? "예: 클튜, Procreate, 포토샵, SketchUp, Kitsu..."
                    : "e.g. Clip Studio, Procreate, SketchUp, Kitsu..."
                }
                className="min-h-8 w-full rounded-lg border border-line bg-panel pl-7 pr-2.5 text-xs text-fg placeholder:text-fg-3"
              />
            </label>
          </div>
          <p className="mt-2 text-[0.7rem] leading-4 text-fg-3">
            {locale === "ko"
              ? "아래는 외부 도구에서 참고한 작업 방식입니다. 배치를 선택한 뒤 작업실에서 제공되는 도구를 확인하세요."
              : "Reference workflows help you choose a layout. Check the tools available in the workspace before starting."}
          </p>
          <div
            data-testid="competitor-role-filter-bar"
            className="mt-2.5 flex flex-wrap gap-1.5"
            role="group"
            aria-label={locale === "ko" ? "직군별 작업공간 필터" : "Filter workspaces by role"}
          >
            {COMPETITOR_ROLE_FILTER_CHIPS.map((chip) => {
              const active = roleFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  data-testid={`competitor-role-filter-${chip.id}`}
                  aria-pressed={active}
                  onClick={() => setRoleFilter(chip.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[0.68rem] font-bold transition-colors",
                    active
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-panel text-fg-2 hover:border-accent/40 hover:text-fg",
                  )}
                >
                  {locale === "ko" ? chip.labelKo : chip.labelEn}
                </button>
              );
            })}
          </div>
          {matchedWorkflows.length === 0 ? <p role="status" className="mt-3 text-sm text-fg-2">{locale === "ko" ? "일치하는 작업공간이 없습니다." : "No matching workspace."}</p> : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {matchedWorkflows.map((item) => {
              const isSelected = activeWorkspaceId === item.workspaceId;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex flex-col justify-between rounded-xl border p-3 transition-colors",
                    isSelected
                      ? "border-accent bg-accent-soft/35"
                      : "border-line bg-panel/70 hover:border-accent/40",
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-xs font-black text-fg">
                        {item.competitorFamily}
                      </span>
                      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[0.65rem] font-bold text-accent">
                        {item.workspaceName}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[0.7rem] leading-4 text-fg-2">
                      {locale === "ko" ? item.summary : "Suggested layout; review the available tools before switching."}
                    </p>
                    {locale === "ko" && item.keyCapabilities.length > 0 ? (
                      <p className="mt-2 text-[0.62rem] font-semibold text-fg-3">참고한 외부 작업 방식</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(locale === "ko" ? item.keyCapabilities.slice(0, 3) : []).map((cap) => (
                        <span
                          key={cap}
                          className="rounded border border-line bg-card px-1.5 py-0.5 text-[0.62rem] text-fg-3"
                        >
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    disabled={!onSelectWorkspacePreset || isSelected}
                    onClick={() => handleSelectWorkspace(item.workspaceId)}
                    className={cn(
                      "mt-2.5 min-h-8 w-full rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors",
                      isSelected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg hover:border-accent/50 hover:text-accent",
                    )}
                  >
                    {isSelected
                      ? (locale === "ko" ? `${item.workspaceName} 사용 중` : `${item.workspaceId} active`)
                      : (locale === "ko" ? `${item.workspaceName} 배치 선택` : `Choose ${item.workspaceId}`)}
                  </button>
                </div>
              );
            })}
          </div>
          <div
            data-testid="competitor-role-pipeline-bridge"
            className="mt-3 rounded-xl border border-line bg-panel/60 p-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-1 text-[0.68rem]">
              <span className="font-black text-fg">
                {locale === "ko"
                  ? "8단계 웹툰 직군 작업분담·인계 계획"
                  : "8-stage webtoon role work and handoff plan"}
              </span>
              <span className="font-mono text-[0.62rem] text-accent">
                {locale === "ko"
                  ? "글·각색 → 콘티 → 3D 배경 → 선화·어시 → 밑색 → 명암·효과 → 식자 → PD 검수"
                  : "Script → Storyboard → 3D BG → Line/Assist → Flat → Shade/FX → Lettering → PD"}
              </span>
            </div>
            <p className="mt-1 text-[0.65rem] leading-4 text-fg-3">
              {locale === "ko"
                ? "공정과 담당 레이어를 정리하는 미리보기입니다. 개인 직무 선택으로 프로젝트 권한이나 실제 레이어 잠금이 바뀌지 않습니다."
                : "Preview production stages and layer assignments. Choosing a personal role does not change project permissions or actual layer locks."}
            </p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-8">
              {WEBTOON_E2E_ROLE_PIPELINE_STAGES.map((stg) => (
                <div
                  key={stg.id}
                  className="rounded-lg border border-line bg-card px-2 py-1 text-[0.62rem]"
                >
                  <div className="font-bold text-fg">
                    {locale === "ko" ? stg.labelKo : `${stg.stepNumber}. ${PIPELINE_STAGE_EN[stg.id].label}`}
                  </div>
                  <div className="mt-0.5 truncate text-[0.58rem] text-fg-3">
                    {locale === "ko" ? stg.summaryKo : PIPELINE_STAGE_EN[stg.id].summary}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div
            data-testid="competitor-uiux-ergonomics-blueprint"
            className="mt-3 rounded-xl border border-line bg-panel/60 p-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-1.5 text-[0.68rem]">
              <span className="font-black text-fg">
                {locale === "ko"
                  ? "REA 기반 3단계 UI/UX 밀도·직관성·사용성 설계 모드"
                  : "REA 3-tier UI/UX density and usability modes"}
              </span>
              <span
                data-testid="competitor-uiux-metrics-badge"
                className="rounded bg-accent/15 px-2 py-0.5 font-mono text-[0.62rem] font-bold text-accent"
              >
                {locale === "ko"
                  ? `캔버스 면적 ${activeDensitySpec.canvasViewportRatioPct}% · 목표 DOM ${activeDensitySpec.targetDomNodeBudget} · 도크 ${activeDensitySpec.activeDockColumns}열`
                  : `Canvas ${activeDensitySpec.canvasViewportRatioPct}% · DOM budget ${activeDensitySpec.targetDomNodeBudget} · Docks ${activeDensitySpec.activeDockColumns}`}
              </span>
            </div>
            <div
              role="group"
              aria-label={
                locale === "ko"
                  ? "UI/UX 밀도 설계 모드"
                  : "UI/UX density design modes"
              }
              className="mt-2 flex flex-wrap gap-1.5"
            >
              {Object.values(STUDIO_UIUX_ERGONOMICS_MODES).map((mode) => {
                const active = densityMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    data-testid={`competitor-uiux-mode-${mode.id}`}
                    aria-pressed={active}
                    onClick={() => setDensityMode(mode.id)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1 text-[0.65rem] font-bold transition-colors",
                      active
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-2 hover:border-accent/40 hover:text-fg",
                    )}
                  >
                    {locale === "ko" ? mode.labelKo : mode.labelEn}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[0.65rem] leading-4 text-fg-2">
              {locale === "ko"
                ? activeDensitySpec.benchmarkSummaryKo
                : activeDensitySpec.benchmarkSummaryEn}
            </p>
            <div className="mt-1 font-mono text-[0.6rem] text-fg-3">
              {locale === "ko"
                ? `핵심 단축키·제스처: ${activeDensitySpec.keyShortcutsKo}`
                : `Shortcuts & gestures: ${activeDensitySpec.keyShortcutsEn}`}
            </div>
          </div>

          <div
            data-testid="competitor-page-by-page-matrix"
            className="mt-3 rounded-xl border border-line bg-panel/60 p-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-1.5 text-[0.68rem]">
              <span className="font-black text-fg">
                {locale === "ko"
                  ? `7대 페이지 도메인별 ${siteWideScorecard.internalizedCompetitorServicesCount}개 글로벌·국내외 유사 서비스 REA 벤치마크·세부 고도화 매트릭스`
                  : `Page-by-page ${siteWideScorecard.internalizedCompetitorServicesCount} global & startup service REA benchmark & sub-enhancement matrix`}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  data-testid="competitor-page-domain-score-badge"
                  className="rounded bg-success/20 px-2 py-0.5 font-mono text-[0.62rem] font-black text-success"
                >
                  {locale === "ko"
                    ? `도메인 점수 ${activePageBenchmark.domainScoreOutOf100} / 100`
                    : `Domain ${activePageBenchmark.domainScoreOutOf100} / 100`}
                </span>
                <span
                  data-testid="competitor-page-dom-budget-badge"
                  className="rounded bg-accent/15 px-2 py-0.5 font-mono text-[0.62rem] font-bold text-accent"
                >
                  {locale === "ko"
                    ? `${activePageBenchmark.routePath} · 관측 ${activePageBenchmark.observedDomNodes} DOM → 목표 ${activePageBenchmark.targetDomBudgetNodes} DOM`
                    : `${activePageBenchmark.routePath} · Observed ${activePageBenchmark.observedDomNodes} DOM -> Target ${activePageBenchmark.targetDomBudgetNodes} DOM`}
                </span>
              </div>
            </div>
            <div
              role="group"
              aria-label={
                locale === "ko"
                  ? "페이지 도메인별 REA 벤치마크 선택"
                  : "Select page domain REA benchmark"
              }
              className="mt-2 flex flex-wrap gap-1.5"
            >
              {STUDIO_PAGE_BY_PAGE_REA_BENCHMARKS.map((pageItem) => {
                const active = pageDomainId === pageItem.id;
                return (
                  <button
                    key={pageItem.id}
                    type="button"
                    data-testid={`competitor-page-tab-${pageItem.id}`}
                    aria-pressed={active}
                    onClick={() => setPageDomainId(pageItem.id)}
                    className={cn(
                      "rounded-lg border px-2 py-1 text-[0.64rem] font-bold transition-colors",
                      active
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-2 hover:border-accent/40 hover:text-fg",
                    )}
                  >
                    {locale === "ko"
                      ? `${pageItem.labelKo} (${pageItem.domainScoreOutOf100})`
                      : `${pageItem.labelEn} (${pageItem.domainScoreOutOf100})`}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={locale === "ko" ? "도메인별 내재화 서비스 칩 선택" : "Select internalized competitor service"}>
              {activePageBenchmark.competitorServices.map((svc) => {
                const isSvcActive = effectiveServiceName === svc;
                return (
                  <button
                    key={svc}
                    type="button"
                    aria-pressed={isSvcActive}
                    data-testid={`competitor-service-chip-${svc}`}
                    onClick={() => setSelectedServiceName(svc)}
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[0.58rem] font-semibold transition-colors",
                      isSvcActive ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:border-accent/50 hover:text-fg",
                    )}
                  >
                    {svc}
                  </button>
                );
              })}
            </div>
            <div
              data-testid="competitor-active-service-deep-profile"
              className="mt-2 rounded-lg border border-accent/35 bg-card/95 p-2 text-[0.6rem]"
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <strong className="text-fg">
                  {locale === "ko"
                    ? `개별 서비스 심층 역공학 프로필 · ${activeServiceProfile.serviceName}`
                    : `Service Deep REA Profile · ${activeServiceProfile.serviceName}`}
                </strong>
                <div className="flex items-center gap-1.5">
                  <code className="rounded bg-panel px-1.5 py-0.5 font-mono text-[0.55rem] text-accent">
                    {activeServiceProfile.targetModulePath}
                  </code>
                  {onSelectWorkspacePreset ? (
                    <button
                      type="button"
                      data-testid="competitor-apply-service-workflow-btn"
                      onClick={() => handleSelectWorkspace(activeServiceProfile.matchedWorkspaceId)}
                      className="rounded bg-accent px-2 py-0.5 text-[0.56rem] font-bold text-on-accent hover:opacity-90"
                    >
                      {locale === "ko"
                        ? `${activeServiceProfile.matchedWorkspaceNameKo} 프리셋 즉시 적용`
                        : `Apply ${activeServiceProfile.matchedWorkspaceId} Preset`}
                    </button>
                  ) : null}
                </div>
              </div>
              <p className="mt-1 text-[0.57rem] text-fg-2">
                {locale === "ko" ? activeServiceProfile.reaArchitectureKo : activeServiceProfile.reaArchitectureEn}
              </p>
              <div className="mt-1 grid gap-1 sm:grid-cols-3">
                {(locale === "ko" ? activeServiceProfile.internalizedFeaturesKo : activeServiceProfile.internalizedFeaturesEn).map((feat) => (
                  <div key={feat} className="rounded border border-line bg-panel/70 px-1.5 py-1 text-[0.55rem] text-fg-2">
                    {feat}
                  </div>
                ))}
              </div>
            </div>
            <ul className="mt-2 space-y-1 text-[0.64rem] leading-4 text-fg-2">
              {(locale === "ko"
                ? activePageBenchmark.internalizedCapabilitiesKo
                : activePageBenchmark.internalizedCapabilitiesEn
              ).map((cap) => (
                <li key={cap} className="flex items-start gap-1.5">
                  <span className="mt-0.5 text-accent">•</span>
                  <span>{cap}</span>
                </li>
              ))}
            </ul>
            <div
              data-testid="competitor-page-sub-enhancements"
              className="mt-2 grid gap-1.5 sm:grid-cols-2"
            >
              {activePageBenchmark.subEnhancements.map((sub) => {
                const isSubActive = activeSubEnhancement?.id === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    aria-pressed={isSubActive}
                    onClick={() => setSelectedSubId(sub.id)}
                    data-testid={`competitor-sub-enhancement-${sub.id}`}
                    className={cn(
                      "rounded-lg border px-2 py-1.5 text-left text-[0.6rem] transition-colors",
                      isSubActive ? "border-accent bg-accent-soft/25" : "border-line bg-card hover:border-accent/40",
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-fg">
                        {locale === "ko" ? sub.titleKo : sub.titleEn}
                      </span>
                      <span className="rounded bg-success/15 px-1.5 py-0.5 font-mono text-[0.58rem] font-black text-success">
                        {sub.scoreOutOf100} / 100
                      </span>
                    </div>
                    <p className="mt-1 text-[0.56rem] leading-3.5 text-fg-2">
                      {locale === "ko" ? sub.reaMechanismKo : sub.reaMechanismEn}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-1 text-[0.54rem] text-fg-3">
                      <span className="truncate">{sub.referenceServices.join(" · ")}</span>
                      <code className="shrink-0 rounded bg-panel px-1 py-0.5 font-mono text-accent">
                        {sub.internalizedModulePath.split("/").slice(-1)[0]}
                      </code>
                    </div>
                  </button>
                );
              })}
            </div>
            {activeSubEnhancement ? (
              <div
                data-testid="competitor-active-sub-enhancement-inspector"
                className="mt-2 rounded-lg border border-accent/35 bg-accent/5 p-2 text-[0.6rem]"
              >
                <div className="flex flex-wrap items-center justify-between gap-1 font-bold text-fg">
                  <span>
                    {locale === "ko"
                      ? `선택된 내재화 기능 정밀 검수 · ${activeSubEnhancement.titleKo}`
                      : `Active Internalized Capability Inspector · ${activeSubEnhancement.titleEn}`}
                  </span>
                  <code className="rounded bg-card px-1.5 py-0.5 font-mono text-[0.56rem] text-accent">
                    {activeSubEnhancement.internalizedModulePath}
                  </code>
                </div>
                <p className="mt-1 text-[0.58rem] text-fg-2">
                  {locale === "ko" ? activeSubEnhancement.reaMechanismKo : activeSubEnhancement.reaMechanismEn}
                </p>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[0.55rem] text-fg-3">
                  <span>
                    {locale === "ko" ? "REA 역공학 참조 서비스: " : "REA Reference Services: "}
                    <strong className="text-fg-2">{activeSubEnhancement.referenceServices.join(", ")}</strong>
                  </span>
                  <span className="font-mono font-bold text-success">
                    {locale === "ko" ? "내재화·검증 완료" : "Internalized & Verified"} ({activeSubEnhancement.scoreOutOf100} / 100)
                  </span>
                </div>
              </div>
            ) : null}
            <div
              data-testid="competitor-visual-motion-strip"
              className="mt-2.5 grid gap-2 rounded-lg border border-accent/25 bg-card/90 p-2 sm:grid-cols-[9.5rem_minmax(0,1fr)]"
            >
              <div className="relative h-20 overflow-hidden rounded-md border border-line bg-panel" aria-hidden="true">
                <img
                  src={
                    pageDomainId === "cuts-movingtoon" || pageDomainId === "asset-market"
                      ? "/assets/site-experience/site-art-v1/motion-previews/atelier-interactive-stage-640.webp"
                      : "/assets/site-experience/site-art-v1/motion-previews/atelier-pipeline-motion-640.webp"
                  }
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  width={320}
                  height={179}
                  className="size-full object-cover"
                />
              </div>
              <div className="flex flex-col justify-between text-[0.62rem]">
                <div className="font-bold text-accent">
                  {locale === "ko"
                    ? "한눈에 이해되는 3단계 시각 플로우 & 아틀리에 톤앤매너 통일"
                    : "3-Step Instant Visual Flow & Unified Atelier Tone-and-Manner"}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-fg-2">
                  <span className="rounded border border-line bg-panel px-1.5 py-0.5 font-semibold">
                    {locale === "ko"
                      ? "① STAGE 배지·키네틱 모션 목적 인지"
                      : "1. STAGE Badge & Kinetic Motion"}
                  </span>
                  <span aria-hidden="true" className="text-accent">→</span>
                  <span className="rounded border border-line bg-panel px-1.5 py-0.5 font-semibold">
                    {locale === "ko"
                      ? "② 1-Click 직무 프리셋·스마트 AI 실행"
                      : "2. 1-Click Role Preset & Smart AI"}
                  </span>
                  <span aria-hidden="true" className="text-accent">→</span>
                  <span className="rounded border border-line bg-panel px-1.5 py-0.5 font-semibold">
                    {locale === "ko"
                      ? "③ 다음 제작 공정 무손실 연결"
                      : "3. Lossless Next-Stage Link"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <StudioStoryToWebtoonStartupWorkbench
            locale={locale}
            onSelectWorkspacePreset={onSelectWorkspacePreset ? handleSelectWorkspace : undefined}
          />

          <div
            className="mt-3 rounded-xl border border-success/30 bg-success/5 p-2.5"
            data-testid="toonstudio-sitewide-quality-scorecard"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-[0.68rem] font-extrabold text-fg">
                {locale === "ko"
                  ? `사이트 전체 REA 완성도 스코어카드 (${siteWideScorecard.analyzedFrontendDomainsCount}개 프론트엔드 도메인 · ${siteWideScorecard.totalReaEvidenceRecords}건 REA 증거 · ${siteWideScorecard.internalizedCompetitorServicesCount}개 서비스 내재화)`
                  : `Site-Wide REA Quality Scorecard (${siteWideScorecard.analyzedFrontendDomainsCount} Frontend Domains · ${siteWideScorecard.totalReaEvidenceRecords} REA Evidences · ${siteWideScorecard.internalizedCompetitorServicesCount} Services)`}
              </strong>
              <span
                className="rounded-md bg-success/20 px-2 py-0.5 text-[0.66rem] font-black text-success"
                data-testid="toonstudio-sitewide-score-badge"
              >
                {locale === "ko"
                  ? `종합 ${siteWideScorecard.overallScore100} / 100 (105,500,000,000,000만점 · ${siteWideScorecard.overallScore10} / 10)`
                  : `Overall ${siteWideScorecard.overallScore100} / 100 (${siteWideScorecard.overallScore10} / 10)`}
              </span>
            </div>
            <div
              data-testid="toonstudio-axis-breakdown-list"
              className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-5 text-[0.6rem] text-fg-2"
            >
              {siteWideScorecard.axisBreakdowns.map((axis) => (
                <div
                  key={axis.axisId}
                  data-testid={`toonstudio-axis-${axis.axisId}`}
                  className="rounded border border-line bg-card px-2 py-1.5"
                >
                  <div className="flex items-center justify-between gap-1 font-bold text-fg">
                    <span>{locale === "ko" ? axis.labelKo : axis.labelEn}</span>
                    <span className="font-mono text-success">{axis.scoreOutOf100}</span>
                  </div>
                  <p className="mt-0.5 text-[0.55rem] leading-3.5 text-fg-3">
                    {locale === "ko" ? axis.subEnhancementSummaryKo : axis.subEnhancementSummaryEn}
                  </p>
                </div>
              ))}
            </div>
            <div
              data-testid="toonstudio-sitewide-audit-ledger"
              className="mt-2 rounded-lg border border-line bg-card/90 p-2 text-[0.58rem]"
            >
              <div className="flex flex-wrap items-center justify-between gap-1 font-bold text-fg">
                <span>
                  {locale === "ko"
                    ? "사이트 전반 문제점 진단·해결 원장 & 전 세계 다국어 지원 현황"
                    : "Site-Wide Diagnostic Resolution Ledger & Global Language Coverage"}
                </span>
                <span
                  data-testid="toonstudio-global-i18n-badge"
                  className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[0.56rem] text-accent"
                >
                  {locale === "ko"
                    ? "75개 완역 언어 번들 · 720+ 글로벌 국가/지역 로케일 · 미번역 0건"
                    : "75 Translated Asset Locales · 720+ Country/Region Locales · 0 Untranslated"}
                </span>
              </div>
              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-3">
                {TOONSTUDIO_SITEWIDE_AUDIT_ISSUES_RESOLVED.map((issue) => (
                  <div key={issue.id} className="rounded border border-line bg-panel/70 px-2 py-1">
                    <div className="font-bold text-success">
                      ✓ {locale === "ko" ? issue.titleKo : issue.titleEn}
                    </div>
                    <p className="mt-0.5 text-[0.54rem] leading-3.5 text-fg-2">
                      {locale === "ko" ? issue.resolutionKo : issue.resolutionEn}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {!compact && pending.length > 0 ? (
        <details className="group mt-4 rounded-xl border border-line bg-card/75">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-bold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
            <span className="inline-flex items-center gap-2">
              <FlaskConical size={15} className="text-warning" aria-hidden="true" />
              {locale === "ko"
                ? `외부 검증 대기 ${pending.length}건 보기`
                : `Show ${pending.length} pending external validations`}
            </span>
            <ChevronDown
              size={15}
              className="text-fg-3 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <ul className="grid gap-2 border-t border-line p-3 sm:grid-cols-2">
            {pending.map((record) => {
              const note = record.evidence.find(
                (item) => item.dimension === "external-validation",
              )?.note;
              return (
                <li key={record.id} className="rounded-lg border border-line bg-panel/60 px-3 py-2">
                  <strong className="block text-xs text-fg">
                    {String(record.sequence).padStart(2, "0")} · {record.title}
                  </strong>
                  {note ? <span className="mt-1 block text-[0.68rem] leading-4 text-fg-3">{note}</span> : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function Metric({ value, label, tone }: { readonly value: number; readonly label: string; readonly tone: "success" | "warning" | "danger" }) {
  return (
    <span className={cn(
      "flex min-w-20 flex-col items-center rounded-xl border px-2 py-2",
      tone === "success" && "border-success/25 bg-success/10 text-success",
      tone === "warning" && "border-warning/25 bg-warning/10 text-warning",
      tone === "danger" && "border-danger/25 bg-danger/10 text-danger",
    )}>
      <span className="inline-flex items-center gap-1 text-lg font-black">
        {tone === "success" ? <CheckCircle2 size={14} aria-hidden="true" /> : null}
        {value}
      </span>
      <span className="mt-0.5 text-[0.62rem] font-bold">{label}</span>
    </span>
  );
}
