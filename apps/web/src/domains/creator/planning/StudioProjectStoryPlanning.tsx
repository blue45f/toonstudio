/**
 * 프로젝트 story 뷰에 기획 7대 표면을 실제로 장착하는 연결 컴포넌트.
 *
 * - episodes: StudioEpisodeStoryPage + 시즌 비트 보드 + 캐릭터 커버리지 맵 + 씨앗 빌더 + 독자 반응 카드
 * - characters: StudioCharacterSheetPanel (서술형 캐릭터 시트)
 * - world: StudioWorldLoreHub (세계관 설정 허브, lazy)
 * - timeline: StudioPlotlineTimeline + StudioLoreTimeline (플롯라인 타임라인·로어 연표, lazy)
 * - relations: StudioLoreGraph + 캐릭터 관계 요약 (설정·캐릭터 관계도, lazy)
 * - foreshadow: StudioForeshadowLedgerPanel (복선 장부, lazy)
 * - concordance: StudioFactConcordancePanel (사실 색인, lazy)
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useApiResource } from "@/platform/use-api-resource";
import { useT } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { CreatorAnalyticsResponse } from "../analytics/types";
import { STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT, parseStudioProjectDiagnosticSource } from "../studio-project-diagnostic-source-store";
import type { StudioProjectDiagnosticSource } from "../studio-project-diagnostics";
import { updateStudioProjectStory } from "../studio-project-feature-adapters";
import { studioProjectSectionHref } from "../studio-project-views";
import { ensureStudioProjectWorkspaceState } from "../studio-project-workspace-store";
import { r3c04StatusText } from "../studio-r3c04-status-i18n";
import { StudioCharacterCoverageMap } from "./StudioCharacterCoverageMap";
import { StudioCharacterSheetPanel } from "./StudioCharacterSheetPanel";
import { StudioEpisodeStoryPage } from "./StudioEpisodeStoryPage";
import type { ForeshadowSeedDraft } from "./StudioForeshadowLedgerPanel";
import { StudioReaderReactionQuoteCard } from "./StudioReaderReactionQuoteCard";
import { StudioSeasonBeatBoard } from "./StudioSeasonBeatBoard";
import { StudioStorySeedBuilder } from "./StudioStorySeedBuilder";
import { upsertStoryCharacterProfile, upsertStoryCharacterRelation, type StudioStoryCharacterProfile, type StudioStoryCharacterRelation } from "./studio-character-profile";
import { studioEpisodeDocumentHref } from "./studio-episode-document-handoff";
import { resolveEpisodeMetricsLoad } from "./studio-episode-metrics-overlay";
import type { EpisodePlanWithSynopsis } from "./studio-episode-synopsis";
import { buildFactConcordance, loadFactConcordanceSideData, saveFactConcordanceSideData, type FactCheckVerdict, type FactConcordanceSideData } from "./studio-fact-concordance";
import { STUDIO_FORESHADOW_UPDATED_EVENT, deriveForeshadowDigest, ensureStudioForeshadowLedger, readStudioForeshadowLedger, saveStudioForeshadowSeed, saveStudioForeshadowStatus, type ForeshadowSeed, type ForeshadowStatus, type StudioForeshadowLedgerState } from "./studio-foreshadow-ledger";
import { currentPlanningEpisodeId } from "./studio-planning-current-episode";
import { STUDIO_PLANNING_UPDATED_EVENT, ensureStudioProjectPlanning, readStudioProjectPlanning, saveStudioEpisodePlan, writeStudioProjectPlanning, type StudioProjectPlanningState } from "./studio-planning-store";
import { defaultPlotlineTracks, type PlotlineCard } from "./studio-plotline-timeline";
import { buildReaderReactionQuoteCard, pickReaderReactionMemoTarget } from "./studio-reader-reaction-quote";
import {
  DEFAULT_CONCORDANCE_CHECKER_ID,
  STUDIO_STORY_PLANNING_VIEW_ITEMS,
  STUDIO_STORY_PLANNING_VIEWS,
  appendConcordanceCheck,
  appendConcordanceManuscriptFix,
  applyPlotlineCardsToPlanningState,
  buildFactConcordanceTerms,
  buildForeshadowEpisodeOptions,
  buildForeshadowFactOptions,
  buildPublishedEpisodesFromPlanning,
  createForeshadowSeedFromDraft,
  deriveCharacterAppearancesFromPlans,
  nextStoryPlanningTabView,
  normalizeStudioStoryPlanningView,
  reconcilePlotlineCardsWithPlans,
  studioStoryPlanningViewItem,
  type StudioProjectStoryPlanningView,
} from "./studio-story-planning-views";
import type { StorySeedDraft, StorySeedPlanPatch, StorySeedSettingRef } from "./studio-story-seed";
import { buildStorySeedSettingRefs, resolveStorySeedReferencedSettings } from "./studio-story-seed-settings";
import { createWorldLoreExamples, type StudioLoreEntry } from "./studio-world-lore";
import { STUDIO_WORLD_LORE_UPDATED_EVENT, ensureStudioWorldLore, readStudioWorldLore, saveStudioWorldLoreEntries, type StudioWorldLoreState } from "./studio-world-lore-store";
import { useStudioEpisodeDocumentTargets } from "./useStudioEpisodeDocumentTargets";
import type { FreshIdeasStorySeedPayload } from "../fresh-ideas/fresh-ideas-story-seed-bridge";

export { STUDIO_STORY_PLANNING_VIEWS };
export type { StudioProjectStoryPlanningView };

const FACT_CONCORDANCE_UPDATED_EVENT = "toonstudio:fact-concordance-updated";

const LazyWorldLoreHub = lazy(() => import("./StudioWorldLoreHub").then((m) => ({ default: m.StudioWorldLoreHub })));
const LazyPlotlineTimeline = lazy(() => import("./StudioPlotlineTimeline").then((m) => ({ default: m.StudioPlotlineTimeline })));
const LazyLoreTimeline = lazy(() => import("./StudioLoreTimeline").then((m) => ({ default: m.StudioLoreTimeline })));
const LazyLoreGraph = lazy(() => import("./StudioLoreGraph").then((m) => ({ default: m.StudioLoreGraph })));
const LazyForeshadowLedgerPanel = lazy(() => import("./StudioForeshadowLedgerPanel").then((m) => ({ default: m.StudioForeshadowLedgerPanel })));
const LazyFactConcordancePanel = lazy(() => import("./StudioFactConcordancePanel").then((m) => ({ default: m.StudioFactConcordancePanel })));
const LazyStudioFreshIdeasWorkbenchCard = lazy(() => import("../fresh-ideas/StudioFreshIdeasV2WorkbenchCard").then((m) => ({ default: m.StudioFreshIdeasV2WorkbenchCard })));

export interface StudioProjectStoryPlanningProps {
  readonly projectId: string;
  readonly view: StudioProjectStoryPlanningView;
  readonly onViewChange?: (view: StudioProjectStoryPlanningView) => void;
  readonly currentUserId?: string;
}

function safeLoad<T>(reader: () => T): T | null {
  if (typeof window === "undefined") return null;
  try {
    return reader();
  } catch {
    return null;
  }
}

function useProjectPlanning(projectId: string) {
  const [planning, setPlanning] = useState<StudioProjectPlanningState | null>(() =>
    safeLoad(() => ensureStudioProjectPlanning(window.localStorage, projectId)),
  );
  useEffect(() => {
    setPlanning(safeLoad(() => ensureStudioProjectPlanning(window.localStorage, projectId)));
    const onUpdated = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const next = readStudioProjectPlanning(window.localStorage, projectId);
      if (next) setPlanning(next);
    };
    window.addEventListener(STUDIO_PLANNING_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(STUDIO_PLANNING_UPDATED_EVENT, onUpdated);
  }, [projectId]);
  return [planning, setPlanning] as const;
}

function useProjectStorySource(projectId: string) {
  const [source, setSource] = useState<StudioProjectDiagnosticSource | null>(() =>
    safeLoad(() => ensureStudioProjectWorkspaceState(window.localStorage, projectId)),
  );
  useEffect(() => {
    setSource(safeLoad(() => ensureStudioProjectWorkspaceState(window.localStorage, projectId)));
    const onUpdated = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const next = parseStudioProjectDiagnosticSource(event.detail, projectId);
      if (next) setSource(next);
    };
    window.addEventListener(STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT, onUpdated);
  }, [projectId]);
  return [source, setSource] as const;
}

function useProjectWorldLore(projectId: string) {
  const [lore, setLore] = useState<StudioWorldLoreState | null>(() =>
    safeLoad(() => ensureStudioWorldLore(window.localStorage, projectId)),
  );
  useEffect(() => {
    setLore(safeLoad(() => ensureStudioWorldLore(window.localStorage, projectId)));
    const onUpdated = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const next = readStudioWorldLore(window.localStorage, projectId);
      if (next) setLore(next);
    };
    window.addEventListener(STUDIO_WORLD_LORE_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(STUDIO_WORLD_LORE_UPDATED_EVENT, onUpdated);
  }, [projectId]);
  return [lore, setLore] as const;
}

function PlanningBoardSkeleton() {
  const t = useT();
  const label = t("studio.canvas.shell.loadingPanel", "패널을 여는 중...");
  return (
    <div
      className="skeleton-group space-y-4 rounded-xl border border-line bg-panel p-4"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-busy="true"
      data-story-planning-skeleton="true"
    >
      <span className="sr-only">{label}</span>
      <div className="space-y-2" aria-hidden="true">
        <div className="skeleton h-4 w-44 rounded-md" />
        <div className="skeleton h-3 w-72 max-w-full rounded-md" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3" aria-hidden="true">
        <div className="skeleton h-24 rounded-lg" />
        <div className="skeleton h-24 rounded-lg" />
        <div className="skeleton h-24 rounded-lg" />
      </div>
    </div>
  );
}

function StoryPlanningViewSwitcher({
  activeView,
  onSelectView,
}: {
  readonly activeView: StudioProjectStoryPlanningView;
  readonly onSelectView: (nextView: StudioProjectStoryPlanningView) => void;
}) {
  const t = useBilingual("StudioProjectStoryPlanning.views");
  const tabRefs = useRef<Partial<Record<StudioProjectStoryPlanningView, HTMLButtonElement | null>>>({});
  const currentItem = studioStoryPlanningViewItem(activeView);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, viewId: StudioProjectStoryPlanningView) => {
    const next = nextStoryPlanningTabView(viewId, event.key);
    if (!next) return;
    event.preventDefault();
    onSelectView(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <header className="rounded-2xl border border-line bg-panel p-2" data-story-planning-switcher="true">
      <div
        role="tablist"
        aria-label={t("스토리 기획 보드 전환", "Switch story planning board")}
        className="flex items-center gap-1 overflow-x-auto overscroll-contain sm:flex-wrap"
      >
        {STUDIO_STORY_PLANNING_VIEW_ITEMS.map((item) => {
          const active = item.id === activeView;
          return (
            <button
              key={item.id}
              ref={(element) => {
                tabRefs.current[item.id] = element;
              }}
              type="button"
              role="tab"
              id={`story-planning-tab-${item.id}`}
              aria-selected={active}
              aria-controls={`story-planning-panel-${item.id}`}
              tabIndex={active ? 0 : -1}
              data-story-planning-tab={item.id}
              data-active={active ? "true" : "false"}
              onClick={() => onSelectView(item.id)}
              onKeyDown={(event) => handleKeyDown(event, item.id)}
              className={
                active
                  ? "relative inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-raised px-3 text-sm font-semibold text-fg transition-colors duration-150 motion-reduce:transition-none [word-break:keep-all] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  : "relative inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium text-fg-2 transition-colors duration-150 hover:bg-raised/60 hover:text-fg motion-reduce:transition-none [word-break:keep-all] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              }
            >
              <span aria-hidden="true" className={active ? "font-mono text-xs tabular-nums text-accent" : "font-mono text-xs tabular-nums text-fg-3"}>
                {item.indexLabel}
              </span>
              <span className="whitespace-nowrap">{t(item.labelKo, item.labelEn)}</span>
              <span
                aria-hidden="true"
                data-story-planning-active-rail={active ? "true" : "false"}
                className={
                  active
                    ? "pointer-events-none absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-accent"
                    : "pointer-events-none absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-transparent"
                }
              />
            </button>
          );
        })}
      </div>
      <p className="mt-2 border-t border-line px-2 pt-2 text-xs leading-5 text-fg-2 [word-break:keep-all]">
        {t(currentItem.summaryKo, currentItem.summaryEn)}
      </p>
    </header>
  );
}

export function StudioProjectStoryPlanning({ projectId, view, onViewChange, currentUserId }: StudioProjectStoryPlanningProps) {
  const [activeView, setActiveView] = useState<StudioProjectStoryPlanningView>(() => normalizeStudioStoryPlanningView(view));
  const [pickedEpisodeId, setPickedEpisodeId] = useState<string | null>(null);
  const [timelineCards, setTimelineCards] = useState<readonly PlotlineCard[]>([]);

  useEffect(() => {
    setActiveView(normalizeStudioStoryPlanningView(view));
  }, [view]);

  useEffect(() => {
    setPickedEpisodeId(null);
    setTimelineCards([]);
  }, [projectId]);

  const selectView = useCallback((nextView: StudioProjectStoryPlanningView) => {
    setActiveView(nextView);
    onViewChange?.(nextView);
  }, [onViewChange]);

  const openEpisodeInSynopsis = useCallback((episodeId: string) => {
    setPickedEpisodeId(episodeId);
    selectView("episodes");
  }, [selectView]);

  return (
    <div className="space-y-4" data-story-planning-root={activeView}>
      <StoryPlanningViewSwitcher activeView={activeView} onSelectView={selectView} />
      <div role="tabpanel" id={`story-planning-panel-${activeView}`} aria-labelledby={`story-planning-tab-${activeView}`} data-story-planning-panel={activeView}>
        {activeView === "episodes" ? (
          <EpisodeSynopsisSurface projectId={projectId} pickedEpisodeId={pickedEpisodeId} onPickEpisode={setPickedEpisodeId} />
        ) : activeView === "characters" ? (
          <CharacterSheetSurface projectId={projectId} />
        ) : (
          <Suspense fallback={<PlanningBoardSkeleton />}>
            {activeView === "world" ? (
              <WorldLoreSurface projectId={projectId} />
            ) : activeView === "timeline" ? (
              <TimelineSurface projectId={projectId} cards={timelineCards} onCardsStateChange={setTimelineCards} onOpenEpisode={openEpisodeInSynopsis} />
            ) : activeView === "relations" ? (
              <RelationsSurface projectId={projectId} onOpenWorld={() => selectView("world")} onOpenCharacters={() => selectView("characters")} />
            ) : activeView === "foreshadow" ? (
              <ForeshadowSurface projectId={projectId} />
            ) : (
              <ConcordanceSurface projectId={projectId} currentUserId={currentUserId} />
            )}
          </Suspense>
        )}
      </div>
    </div>
  );
}

function EpisodeSynopsisSurface({
  projectId,
  pickedEpisodeId,
  onPickEpisode,
}: {
  readonly projectId: string;
  readonly pickedEpisodeId: string | null;
  readonly onPickEpisode: (episodeId: string | null) => void;
}) {
  const t = useBilingual("StudioProjectStoryPlanning.handoff");
  const targets = useStudioEpisodeDocumentTargets(projectId);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [freshIdeasMounted, setFreshIdeasMounted] = useState(false);
  const [storySeedNotice, setStorySeedNotice] = useState<FreshIdeasStorySeedPayload | null>(null);
  const [planning, setPlanning] = useProjectPlanning(projectId);
  const [source] = useProjectStorySource(projectId);
  const [lore] = useProjectWorldLore(projectId);

  useEffect(() => {
    setSaveError(null);
    setFreshIdeasMounted(false);
    setStorySeedNotice(null);
  }, [projectId]);

  const bibleCharacters = useMemo(() => source?.story.bible.characters ?? [], [source]);
  const settingRefs = useMemo<readonly StorySeedSettingRef[]>(
    () => buildStorySeedSettingRefs({ bible: source?.story.bible ?? null, profiles: source?.story.narrative.profiles ?? [], lore }),
    [source, lore],
  );
  const metricsResource = useApiResource<CreatorAnalyticsResponse>(
    "/api/creator/analytics?period=30d",
    r3c04StatusText("studio.r3c04Status.planning.storyPlanning.metricsLoadFailed", "회차 성과를 불러오지 못했습니다."),
  );
  const episodeMetrics = resolveEpisodeMetricsLoad(metricsResource);
  const appearances = useMemo(() => deriveCharacterAppearancesFromPlans(planning?.plans ?? []), [planning]);
  const freshIdeasContext = useMemo(() => {
    const activePlan = planning?.plans.find((plan) => plan.episodeId === pickedEpisodeId) ?? planning?.plans[0];
    const sourceTitle = activePlan ? `${activePlan.episodeNumber}화 · ${activePlan.title.trim() || "회차 기획"}` : planning?.season.title.trim() || "연재 기획";
    const summaryParts = [activePlan?.logline.trim(), activePlan?.goal?.trim(), activePlan?.coreConflict?.trim(), activePlan?.synopsis?.trim(), activePlan?.turningPoints.length ? `전환점: ${activePlan.turningPoints.join(", ")}` : ""].filter((part): part is string => Boolean(part));
    const metricParts = [`기획 회차 ${planning?.plans.length ?? 0}화`, ...(bibleCharacters.length > 0 ? [`등장인물 ${bibleCharacters.length}명`] : []), ...(lore && lore.entries.length > 0 ? [`세계관 설정 ${lore.entries.length}건`] : [])];
    return {
      sourceTitle,
      sourceSummaryKo: summaryParts.join(" ") || "현재 회차의 로그라인과 전환점을 바탕으로 5대 각도 장면 아이디어를 탐색합니다.",
      sourceMetricsSummaryKo: metricParts.join(" · "),
    };
  }, [planning, pickedEpisodeId, bibleCharacters.length, lore]);

  if (!planning) return null;

  const handleSavePlan = (plan: EpisodePlanWithSynopsis) => {
    try {
      setPlanning(saveStudioEpisodePlan(window.localStorage, projectId, plan, window));
      setSaveError(null);
      return true;
    } catch {
      setSaveError(t("회차 기획을 저장하지 못해 원고를 열지 않았습니다. 입력은 유지됩니다. 저장 공간을 확인하고 다시 저장해 주세요.", "The episode plan could not be saved, so the manuscript was not opened. Your input is kept. Check device storage and save again."));
      return false;
    }
  };

  const targetPlan = planning.plans[0];
  const targetHasContent = Boolean(targetPlan && (targetPlan.logline.trim() || targetPlan.goal?.trim() || targetPlan.synopsis?.trim()));
  const handleApplySeed = (patch: StorySeedPlanPatch, draft: StorySeedDraft) => {
    if (!targetPlan) return;
    const seedSettingRefs = resolveStorySeedReferencedSettings(settingRefs, draft.referencedSettingIds).map((ref) => ({ id: ref.id, kind: ref.kind, name: ref.name }));
    handleSavePlan({ ...targetPlan, ...patch, seedSettingRefs });
  };

  const reactionCard = buildReaderReactionQuoteCard(episodeMetrics);
  const reactionTarget = pickReaderReactionMemoTarget(planning.plans, reactionCard.sourceEpisode?.episodeNumber ?? null);

  return (
    <div>
      <div className="mb-4">
        <StudioReaderReactionQuoteCard
          episodeMetrics={episodeMetrics}
          memoTargetLabel={reactionTarget ? `${reactionTarget.episodeNumber}화` : null}
          savedMemo={reactionTarget?.readerReactionMemo ?? null}
          onSaveMemo={reactionTarget ? (memo) => handleSavePlan({ ...reactionTarget, readerReactionMemo: memo }) : undefined}
        />
      </div>
      {targetPlan && (
        <div className="mb-4">
          <StudioStorySeedBuilder settingRefs={settingRefs} targetHasContent={targetHasContent} onApplySeed={handleApplySeed} />
        </div>
      )}
      <label className="mb-3 block text-sm font-semibold text-fg [word-break:keep-all]">
        {t("콘티·작화 대상 원고", "Storyboard and artwork manuscript")}
        <select
          className="mt-1 block min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg"
          value={targets.selected?.id ?? ""}
          onChange={(event) => targets.select(event.target.value)}
        >
          <option value="">{t("기존 원고 선택", "Select an existing manuscript")}</option>
          {targets.documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}
        </select>
      </label>
      {saveError ? <p role="alert" className="mb-3 text-sm text-bad">{saveError}</p> : null}
      <StudioEpisodeStoryPage
        season={planning.season}
        plans={planning.plans}
        onSavePlan={handleSavePlan}
        selectedEpisodeId={pickedEpisodeId ?? undefined}
        onSelectEpisode={onPickEpisode}
        storyboardHrefForEpisode={(episodeId) => targets.selected ? studioEpisodeDocumentHref(targets.selected, episodeId, "storyboard") : null}
      />
      <div className="mt-4">
        <StudioSeasonBeatBoard season={planning.season} plans={planning.plans} characters={bibleCharacters} episodeMetrics={episodeMetrics} onSelectEpisode={onPickEpisode} />
      </div>
      <div className="mt-4">
        <StudioCharacterCoverageMap characters={bibleCharacters} episodes={planning.plans} appearances={appearances} episodeMetrics={episodeMetrics} onOpenEpisode={onPickEpisode} />
      </div>
      {storySeedNotice ? (
        <div role="status" aria-live="polite" data-testid="story-planning-fresh-ideas-seed-banner" className="mt-4 rounded-xl border border-accent bg-raised px-4 py-3 text-xs text-fg [word-break:keep-all]">
          <p className="font-semibold text-fg">{storySeedNotice.summaryKo}</p>
          <p className="mt-1 text-fg-2">
            회차 목표 초안: {storySeedNotice.livingSpecSeed.goalKo} · <span className="font-mono tabular-nums">{storySeedNotice.cutSeed.cuts.length}컷</span> · 출처 <span className="font-mono tabular-nums">{storySeedNotice.cutSeed.preservedUrls.length}건</span>
          </p>
        </div>
      ) : null}
      <details
        data-testid="story-planning-fresh-ideas-disclosure"
        onToggle={(event) => { if (event.currentTarget.open) setFreshIdeasMounted(true); }}
        className="mt-4 rounded-xl border border-line bg-panel p-3"
      >
        <summary
          onClick={() => setFreshIdeasMounted(true)}
          className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2 text-sm font-semibold text-fg transition-[background-color,color] duration-150 hover:bg-raised motion-reduce:transition-none [word-break:keep-all] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span>{t("아이디어 리믹스 · 스토리 컷 시드 작업대", "Idea remix · Story cut seed workbench")}</span>
          <span className="font-mono text-xs text-fg-3">{t("5대 렌즈 → 대본·기획 명세", "5 lenses → script & spec")}</span>
        </summary>
        {freshIdeasMounted ? (
          <div className="mt-3 border-t border-line pt-3">
            <Suspense fallback={<PlanningBoardSkeleton />}>
              <LazyStudioFreshIdeasWorkbenchCard
                sourceTitle={freshIdeasContext.sourceTitle}
                sourceSummaryKo={freshIdeasContext.sourceSummaryKo}
                sourceMetricsSummaryKo={freshIdeasContext.sourceMetricsSummaryKo}
                onExportStorySeed={setStorySeedNotice}
              />
            </Suspense>
          </div>
        ) : null}
      </details>
    </div>
  );
}

function CharacterSheetSurface({ projectId }: { readonly projectId: string }) {
  const [source, setSource] = useProjectStorySource(projectId);
  if (!source) return null;

  const saveNarrative = (narrative: StudioProjectDiagnosticSource["story"]["narrative"]) => {
    try {
      setSource(updateStudioProjectStory(window.localStorage, projectId, { bible: source.story.bible, states: source.story.states, transitions: source.story.transitions, narrative }, { target: window }));
    } catch {
      // 저장 실패 시 시트 입력은 그대로 남는다. 다음 저장에서 다시 시도할 수 있다.
    }
  };

  return (
    <div>
      <StudioCharacterSheetPanel
        bible={source.story.bible}
        narrative={source.story.narrative}
        onSaveProfile={(profile: StudioStoryCharacterProfile) => saveNarrative(upsertStoryCharacterProfile(source.story.narrative, profile))}
        onSaveRelation={(relation: StudioStoryCharacterRelation) => saveNarrative(upsertStoryCharacterRelation(source.story.narrative, relation))}
      />
      {source.story.bible.characters.length === 0 && (
        <p className="mt-3 text-sm text-fg-2 [word-break:keep-all]">
          {r3c04StatusText("studio.r3c04Status.planning.storyPlanning.emptyCharacters", "아직 등록된 캐릭터가 없어요. 원고나 스토리월드에서 캐릭터가 생기면, 여기서 성격·말투·관계를 시트로 적을 수 있어요.")}
        </p>
      )}
    </div>
  );
}

function WorldLoreSurface({ projectId }: { readonly projectId: string }) {
  const [lore, setLore] = useProjectWorldLore(projectId);
  const [source] = useProjectStorySource(projectId);
  if (!lore) return null;

  const handleSaveEntries = (entries: readonly StudioLoreEntry[]) => {
    try {
      setLore(saveStudioWorldLoreEntries(window.localStorage, projectId, entries, window));
    } catch {
      // 저장 공간 오류 시 현재 화면 초안을 유지한다.
    }
  };

  return <LazyWorldLoreHub lore={lore} characters={source?.story.bible.characters ?? []} onSaveEntries={handleSaveEntries} />;
}

function TimelineSurface({
  projectId,
  cards,
  onCardsStateChange,
  onOpenEpisode,
}: {
  readonly projectId: string;
  readonly cards: readonly PlotlineCard[];
  readonly onCardsStateChange: (next: readonly PlotlineCard[]) => void;
  readonly onOpenEpisode: (episodeId: string) => void;
}) {
  const [planning, setPlanning] = useProjectPlanning(projectId);
  const [source] = useProjectStorySource(projectId);
  const [lore] = useProjectWorldLore(projectId);
  const characters = useMemo(() => source?.story.bible.characters ?? [], [source]);
  const locations = useMemo(() => source?.story.bible.locations ?? [], [source]);
  const tracks = useMemo(() => defaultPlotlineTracks(characters), [characters]);
  const reconciledCards = useMemo(() => (planning ? reconcilePlotlineCardsWithPlans(cards, planning.plans) : cards), [cards, planning]);

  if (!planning) return null;

  const handleCardsChange = (nextCards: readonly PlotlineCard[]) => {
    onCardsStateChange(nextCards);
    const nextPlanning = applyPlotlineCardsToPlanningState(planning, nextCards);
    if (!nextPlanning) return;
    try {
      setPlanning(writeStudioProjectPlanning(window.localStorage, nextPlanning, window));
    } catch {
      // 저장 실패 시에도 현재 타임라인 카드 배치는 유지한다.
    }
  };

  return (
    <div className="space-y-6">
      <LazyPlotlineTimeline
        season={planning.season}
        plans={planning.plans}
        tracks={tracks}
        cards={reconciledCards}
        characters={characters}
        locations={locations}
        onCardsChange={handleCardsChange}
        onSelectEpisode={onOpenEpisode}
      />
      {lore ? (
        <div className="border-t border-line pt-5">
          <LazyLoreTimeline lore={lore} characters={characters} worldHref={studioProjectSectionHref(projectId, "story", "world")} />
        </div>
      ) : null}
    </div>
  );
}

function RelationsSurface({
  projectId,
  onOpenWorld,
  onOpenCharacters,
}: {
  readonly projectId: string;
  readonly onOpenWorld: () => void;
  readonly onOpenCharacters: () => void;
}) {
  const t = useBilingual("StudioProjectStoryPlanning.relations");
  const [lore, setLore] = useProjectWorldLore(projectId);
  const [source] = useProjectStorySource(projectId);
  const characters = useMemo(() => source?.story.bible.characters ?? [], [source]);
  const characterRelations = source?.story.narrative.relations ?? [];
  const characterNameById = useMemo(() => new Map(characters.map((c) => [c.id, c.name])), [characters]);

  if (!lore) return null;

  const handleSeedExampleLore = () => {
    try {
      const examples = createWorldLoreExamples(projectId);
      setLore(saveStudioWorldLoreEntries(window.localStorage, projectId, examples.entries, window));
    } catch {
      // 저장 실패 시 현재 상태를 유지한다.
    }
  };

  return (
    <div className="space-y-5">
      {lore.entries.length === 0 ? (
        <section aria-label={t("설정 관계도 시작 안내", "Start lore relationship graph")} className="rounded-xl border border-line bg-panel p-5">
          <h2 className="text-base font-semibold text-fg [word-break:keep-all]">{t("설정 관계도", "Lore relationship graph")}</h2>
          <p className="mt-2 text-sm leading-6 text-fg-2 [word-break:keep-all]">
            {t("세계관 설정을 추가하고 이어지는 설정·캐릭터를 연결하면 이곳에 관계도가 자동으로 그려집니다.", "Add world lore entries and link related settings or characters to render the relationship graph here.")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={handleSeedExampleLore} className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent transition-colors duration-150 hover:bg-accent/90 motion-reduce:transition-none [word-break:keep-all] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              {t("예시 세계관으로 관계도 채우기", "Fill graph with example world")}
            </button>
            <button type="button" onClick={onOpenWorld} className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-4 text-sm font-semibold text-fg transition-colors duration-150 hover:bg-raised motion-reduce:transition-none [word-break:keep-all] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              {t("세계관 설정에서 직접 추가", "Add entries in World")}
            </button>
          </div>
        </section>
      ) : (
        <LazyLoreGraph lore={lore} characters={characters} />
      )}
      {characterRelations.length > 0 ? (
        <section aria-label={t("캐릭터 관계 요약", "Character relationship summary")} className="rounded-xl border border-line bg-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-fg [word-break:keep-all]">
              {t("캐릭터 관계 요약", "Character relationships")} (<span className="tabular-nums">{characterRelations.length}</span>)
            </h3>
            <button type="button" onClick={onOpenCharacters} className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg transition-colors duration-150 hover:bg-raised motion-reduce:transition-none [word-break:keep-all] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              {t("캐릭터 시트에서 편집", "Edit in Characters")}
            </button>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-fg-2">
            {characterRelations.map((relation) => (
              <li key={relation.id} className="flex flex-wrap items-center gap-2 border-t border-line pt-1.5 first:border-t-0 first:pt-0">
                <strong className="font-semibold text-fg">{characterNameById.get(relation.fromCharacterId) ?? relation.fromCharacterId}</strong>
                <span aria-hidden="true" className="text-fg-3">→</span>
                <strong className="font-semibold text-fg">{characterNameById.get(relation.toCharacterId) ?? relation.toCharacterId}</strong>
                <span className="rounded-md border border-line bg-card px-2 py-0.5 text-xs text-fg-2">{relation.label}</span>
                {relation.note ? <span className="text-xs text-fg-3">{relation.note}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ForeshadowSurface({ projectId }: { readonly projectId: string }) {
  const [ledger, setLedger] = useState<StudioForeshadowLedgerState | null>(() =>
    safeLoad(() => ensureStudioForeshadowLedger(window.localStorage, projectId)),
  );
  const [planning] = useProjectPlanning(projectId);
  const [source] = useProjectStorySource(projectId);
  const [lore] = useProjectWorldLore(projectId);

  useEffect(() => {
    setLedger(safeLoad(() => ensureStudioForeshadowLedger(window.localStorage, projectId)));
    const onUpdated = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const next = readStudioForeshadowLedger(window.localStorage, projectId);
      if (next) setLedger(next);
    };
    window.addEventListener(STUDIO_FORESHADOW_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(STUDIO_FORESHADOW_UPDATED_EVENT, onUpdated);
  }, [projectId]);

  const episodes = useMemo(() => (planning ? buildForeshadowEpisodeOptions(planning.season, planning.plans) : []), [planning]);
  const episodeOrder = useMemo(() => (!planning ? [] : planning.season.episodeOrder.length > 0 ? planning.season.episodeOrder : episodes.map((e) => e.episodeId)), [planning, episodes]);
  const currentEpisodeId = useMemo(() => (planning ? (currentPlanningEpisodeId(planning) ?? episodes[0]?.episodeId ?? "") : ""), [planning, episodes]);
  const digest = useMemo(() => deriveForeshadowDigest({ seeds: ledger?.seeds ?? [], episodeOrder, currentEpisodeId }), [ledger, episodeOrder, currentEpisodeId]);
  const facts = useMemo(() => buildForeshadowFactOptions(source?.story.bible ?? null, lore), [source, lore]);
  const characters = useMemo(() => (source?.story.bible.characters ?? []).map((c) => ({ id: c.id, name: c.name })), [source]);

  if (!ledger) return null;

  const handleCreateSeed = (draft: ForeshadowSeedDraft) => {
    try {
      const created = createForeshadowSeedFromDraft(projectId, ledger.seeds, draft);
      setLedger(saveStudioForeshadowSeed(window.localStorage, projectId, created, window));
    } catch {
      // 입력 검증 실패나 저장 불가 시 기존 장부 상태를 보존한다.
    }
  };
  const handleUpdateSeed = (seed: ForeshadowSeed) => {
    try {
      setLedger(saveStudioForeshadowSeed(window.localStorage, projectId, seed, window));
    } catch {
      // 저장 실패 시 기존 장부 상태를 보존한다.
    }
  };
  const handleChangeStatus = (seedId: string, status: ForeshadowStatus) => {
    try {
      setLedger(saveStudioForeshadowStatus(window.localStorage, projectId, seedId, status, window));
    } catch {
      // 저장 실패 시 기존 장부 상태를 보존한다.
    }
  };

  return (
    <LazyForeshadowLedgerPanel
      seeds={ledger.seeds}
      digest={digest}
      episodes={episodes}
      facts={facts}
      characters={characters}
      onCreateSeed={handleCreateSeed}
      onUpdateSeed={handleUpdateSeed}
      onChangeStatus={handleChangeStatus}
    />
  );
}

function ConcordanceSurface({ projectId, currentUserId }: { readonly projectId: string; readonly currentUserId?: string }) {
  const [planning] = useProjectPlanning(projectId);
  const [source] = useProjectStorySource(projectId);
  const [lore] = useProjectWorldLore(projectId);
  const [sideData, setSideData] = useState<FactConcordanceSideData>(() => loadFactConcordanceSideData(projectId));

  useEffect(() => {
    setSideData(loadFactConcordanceSideData(projectId));
    const onUpdated = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      if (event.detail && typeof event.detail === "object" && "projectId" in event.detail && event.detail.projectId !== projectId) return;
      setSideData(loadFactConcordanceSideData(projectId));
    };
    window.addEventListener(FACT_CONCORDANCE_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(FACT_CONCORDANCE_UPDATED_EVENT, onUpdated);
  }, [projectId]);

  const publishedEpisodes = useMemo(() => (planning ? buildPublishedEpisodesFromPlanning(planning.season, planning.plans) : []), [planning]);
  const terms = useMemo(() => buildFactConcordanceTerms(source?.story.bible ?? null, lore), [source, lore]);
  const concordance = useMemo(() => buildFactConcordance(publishedEpisodes, terms), [publishedEpisodes, terms]);
  const episodeOptions = useMemo(() => publishedEpisodes.map((ep) => ({ episodeId: ep.id, label: ep.label })), [publishedEpisodes]);
  const checkerId = currentUserId !== undefined ? currentUserId : DEFAULT_CONCORDANCE_CHECKER_ID;

  const handleRecordCheck = (entryKey: string, verdict: FactCheckVerdict, note: string): string | null => {
    const result = appendConcordanceCheck(sideData, concordance, publishedEpisodes, { entryKey, checkerId, verdict, note });
    if (result.error) return result.error;
    setSideData(result.next);
    saveFactConcordanceSideData(projectId, result.next);
    return null;
  };

  const handleProposeManuscriptFix = (input: {
    readonly entryKey: string;
    readonly episodeId: string;
    readonly segmentId: string;
    readonly before: string;
    readonly after: string;
    readonly reason: string;
  }): string | null => {
    const result = appendConcordanceManuscriptFix(sideData, { ...input, actorId: checkerId });
    if (result.error) return result.error;
    setSideData(result.next);
    saveFactConcordanceSideData(projectId, result.next);
    return null;
  };

  return (
    <LazyFactConcordancePanel
      concordance={concordance}
      episodes={episodeOptions}
      checks={sideData.checks}
      fixes={sideData.fixes}
      loreRevisions={sideData.loreRevisions}
      currentUserId={checkerId}
      onRecordCheck={handleRecordCheck}
      onProposeManuscriptFix={handleProposeManuscriptFix}
    />
  );
}
