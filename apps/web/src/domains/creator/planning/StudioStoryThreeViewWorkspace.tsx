import {
  AlertTriangle,
  Eye,
  EyeOff,
  FileText,
  FolderTree,
  GitBranch,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useId, type KeyboardEvent } from "react";

import {
  CUT_READINESS_SLOT_META,
  STORY_NODE_PREFIX_LABELS_KO,
  STORY_THREE_VIEWS,
  buildStoryGraphLayout,
  countPendingProposals,
  createEmptyCutReadinessSlots,
  cycleStoryThreeView,
  evaluateCutReadiness,
  evaluateDriftBadges,
  type CutReadinessSlotKey,
  type StoryLivingNode,
  type StoryLivingSpecState,
  type StoryThreeViewMode,
} from "./studio-story-living-spec-store";

import { cn } from "@/shared/lib/utils";

export interface StudioStoryThreeViewWorkspaceProps {
  readonly state: StoryLivingSpecState;
  readonly className?: string;
  readonly onChangeView: (nextView: StoryThreeViewMode) => void;
  readonly onSelectNode: (nodeKey: string) => void;
  readonly onUpdateCutSlot?: (
    nodeKey: string,
    slotKey: CutReadinessSlotKey,
    value: string,
  ) => void;
  readonly onToggleSlotVisibility?: (
    nodeKey: string,
    slotKey: CutReadinessSlotKey,
  ) => void;
  readonly onAnswerOpenQuestion?: (
    nodeKey: string,
    questionId: string,
    optionIndex: number,
  ) => void;
  readonly onSyncDrift?: (cutKey: string) => void;
  readonly onOpenProposalGate?: () => void;
  readonly onOpenReviewDrawer?: () => void;
}

const VIEW_META: Readonly<
  Record<StoryThreeViewMode, { readonly labelKo: string; readonly hintKo: string }>
> = {
  graph: { labelKo: "그래프 뷰", hintKo: "아크·회차·비트·컷과 설정 연결을 한눈에 조감합니다." },
  directory: { labelKo: "디렉토리 뷰", hintKo: "계층 트리에서 노드를 고르고 9칸 연출 슬롯을 채웁니다." },
  document: { labelKo: "도큐먼트 뷰", hintKo: "회차 대본과 컷 준비 상태를 세로 스크롤로 점검합니다." },
};

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function slotDisplayValue(node: StoryLivingNode, key: CutReadinessSlotKey): string {
  const slots = node.cutSlots;
  if (!slots) return "";
  if (key === "actors") return (slots.actors ?? []).join(", ");
  return slots[key] ?? "";
}

/**
 * Story Living Spec 3-뷰 단일 소스 워크스페이스.
 * 그래프·디렉토리·도큐먼트 3개 뷰가 같은 상태를 공유하며 Shift+Space로 즉시 순환한다.
 */
export function StudioStoryThreeViewWorkspace({
  state,
  className,
  onChangeView,
  onSelectNode,
  onUpdateCutSlot,
  onToggleSlotVisibility,
  onAnswerOpenQuestion,
  onSyncDrift,
  onOpenProposalGate,
  onOpenReviewDrawer,
}: StudioStoryThreeViewWorkspaceProps) {
  const baseId = useId();
  const pendingCount = countPendingProposals(state);
  const openReviewCount = state.reviewFindings.filter((item) => item.status === "open").length;
  const driftList = evaluateDriftBadges(state);
  const driftByCut = new Map(driftList.map((badge) => [badge.cutId, badge]));
  const staleCutCount = driftList.filter((badge) => badge.isStale).length;

  const selectedNode =
    state.nodes.find((node) => node.key === state.selectedNodeKey) ?? state.nodes[0] ?? null;

  useEffect(() => {
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!event.shiftKey || event.code !== "Space") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableKeyboardTarget(event.target)) return;
      event.preventDefault();
      onChangeView(cycleStoryThreeView(state.activeView));
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [onChangeView, state.activeView]);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onChangeView(cycleStoryThreeView(state.activeView, false));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      onChangeView(cycleStoryThreeView(state.activeView, true));
    }
  };

  const graphNodes = buildStoryGraphLayout(state.nodes);
  const graphPosByKey = new Map(graphNodes.map((entry) => [entry.node.key, entry]));
  const orderedNodes = [...state.nodes].sort((a, b) => a.order - b.order);

  const selectedSlots =
    selectedNode?.id.prefix === "CUT"
      ? (selectedNode.cutSlots ?? createEmptyCutReadinessSlots())
      : null;
  const selectedReadiness = selectedSlots ? evaluateCutReadiness(selectedSlots) : null;
  const selectedDrift = selectedNode ? driftByCut.get(selectedNode.key) : undefined;

  return (
    <section
      aria-label="스토리 리빙 스펙 3-뷰 워크스페이스"
      data-testid="studio-story-three-view-workspace"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all]",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="기획 보기 방식 전환"
            className="inline-flex items-center gap-1 rounded-xl border border-line bg-card p-1"
          >
            {STORY_THREE_VIEWS.map((viewId) => {
              const active = state.activeView === viewId;
              const Icon =
                viewId === "graph"
                  ? GitBranch
                  : viewId === "directory"
                    ? FolderTree
                    : FileText;
              return (
                <button
                  key={viewId}
                  id={`${baseId}-tab-${viewId}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`${baseId}-panel-${viewId}`}
                  tabIndex={active ? 0 : -1}
                  onKeyDown={handleTabKeyDown}
                  onClick={() => onChangeView(viewId)}
                  className={cn(
                    "inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-[background-color,color,transform] duration-150 enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                    active
                      ? "bg-accent text-on-accent"
                      : "text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{VIEW_META[viewId].labelKo}</span>
                </button>
              );
            })}
          </div>
          <span className="rounded-md border border-line bg-raised px-2 py-1 text-[0.7rem] font-medium text-fg-2 tabular-nums">
            Shift+Space 순환
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {staleCutCount > 0 ? (
            <span
              role="status"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-warn/40 bg-warn/10 px-3 text-xs font-semibold text-warn tabular-nums"
            >
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              컷 수정됨 {staleCutCount}건
            </span>
          ) : null}

          {onOpenProposalGate ? (
            <button
              type="button"
              onClick={onOpenProposalGate}
              className="inline-flex min-h-11 min-w-11 items-center gap-2 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg transition-[background-color,border-color,transform] duration-150 hover:border-line-strong hover:bg-raised enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            >
              {pendingCount > 0 ? (
                <span
                  data-testid="pending-proposal-blue-dot"
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full bg-cool ring-2 ring-cool/30"
                />
              ) : null}
              <span>AI 제안</span>
              <span className="tabular-nums text-fg-2">{pendingCount}</span>
            </button>
          ) : null}

          {onOpenReviewDrawer ? (
            <button
              type="button"
              onClick={onOpenReviewDrawer}
              className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg transition-[background-color,border-color,transform] duration-150 hover:border-line-strong hover:bg-raised enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            >
              <ShieldCheck className="size-4 shrink-0 text-accent" aria-hidden="true" />
              <span>6관점 검수</span>
              <span className="tabular-nums text-fg-2">{openReviewCount}</span>
            </button>
          ) : null}
        </div>
      </header>

      <p className="text-xs text-fg-2">{VIEW_META[state.activeView].hintKo}</p>

      {state.activeView === "graph" ? (
        <div
          id={`${baseId}-panel-graph`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-graph`}
          className="overflow-auto overscroll-contain rounded-xl border border-line bg-card p-3"
        >
          {graphNodes.length === 0 ? (
            <p className="py-10 text-center text-sm text-fg-2">
              아직 등록된 스토리 노드가 없습니다.
            </p>
          ) : (
            <div className="relative min-h-80 min-w-[68rem]">
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                {state.edges.map((edge) => {
                  const from = graphPosByKey.get(edge.fromKey);
                  const to = graphPosByKey.get(edge.toKey);
                  if (!from || !to) return null;
                  return (
                    <line
                      key={edge.id}
                      x1={from.x + 196}
                      y1={from.y + 44}
                      x2={to.x}
                      y2={to.y + 44}
                      stroke="currentColor"
                      strokeWidth={1.5}
                      className="text-line-strong"
                    />
                  );
                })}
              </svg>

              {graphNodes.map(({ node, x, y }) => {
                const isSelected = selectedNode?.key === node.key;
                const drift = driftByCut.get(node.key);
                const readiness = node.cutSlots ? evaluateCutReadiness(node.cutSlots) : null;
                return (
                  <button
                    key={node.key}
                    type="button"
                    onClick={() => onSelectNode(node.key)}
                    style={{ left: `${x}px`, top: `${y}px` }}
                    className={cn(
                      "absolute flex min-h-24 w-48 flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition-[background-color,border-color,transform] duration-150 enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                      isSelected
                        ? "border-accent bg-raised shadow-sm"
                        : "border-line bg-panel hover:border-line-strong",
                    )}
                  >
                    <div className="flex w-full items-center justify-between gap-1">
                      <span className="rounded border border-line bg-card px-1.5 py-0.5 text-[0.65rem] font-semibold text-fg-2 tabular-nums">
                        {STORY_NODE_PREFIX_LABELS_KO[node.id.prefix]} · {node.id.code}
                      </span>
                      {drift?.isStale ? (
                        <span className="rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[0.65rem] font-semibold text-warn">
                          컷 수정됨
                        </span>
                      ) : null}
                    </div>
                    <span className="line-clamp-1 text-xs font-semibold text-fg">{node.title}</span>
                    {readiness ? (
                      <div className="mt-auto flex w-full items-center gap-2 pt-1">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${readiness.percent}%` }}
                          />
                        </div>
                        <span className="text-[0.65rem] font-semibold text-fg-2 tabular-nums">
                          {readiness.label}
                        </span>
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {state.activeView === "directory" ? (
        <div
          id={`${baseId}-panel-directory`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-directory`}
          className="grid gap-3 lg:grid-cols-[17rem_1fr]"
        >
          <aside
            aria-label="스토리 노드 트리"
            className="flex max-h-[34rem] flex-col gap-1.5 overflow-y-auto overscroll-contain rounded-xl border border-line bg-card p-2"
          >
            {orderedNodes.map((node) => {
              const isSelected = selectedNode?.key === node.key;
              const drift = driftByCut.get(node.key);
              const readiness = node.cutSlots ? evaluateCutReadiness(node.cutSlots) : null;
              const hasNodePending = state.proposals.some(
                (item) => item.status === "pending" && item.targetEntityId === node.key,
              );
              return (
                <button
                  key={node.key}
                  type="button"
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => onSelectNode(node.key)}
                  className={cn(
                    "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                    isSelected
                      ? "border-accent bg-raised font-semibold text-fg"
                      : "border-transparent bg-panel text-fg-2 hover:border-line hover:text-fg",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {hasNodePending ? (
                      <span
                        aria-label="대기 중인 AI 제안 있음"
                        className="size-2 shrink-0 rounded-full bg-cool"
                      />
                    ) : null}
                    <span className="shrink-0 text-[0.68rem] text-fg-3 tabular-nums">
                      {node.id.code}
                    </span>
                    <span className="truncate">{node.title}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {drift?.isStale ? (
                      <span className="rounded bg-warn/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-warn">
                        컷 수정됨
                      </span>
                    ) : null}
                    {readiness ? (
                      <span className="rounded bg-raised px-1.5 py-0.5 text-[0.65rem] font-semibold text-fg-2 tabular-nums">
                        {readiness.label}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </aside>

          <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
            {selectedNode ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
                  <div>
                    <p className="text-[0.7rem] font-semibold text-fg-3 tabular-nums">
                      {STORY_NODE_PREFIX_LABELS_KO[selectedNode.id.prefix]} · {selectedNode.id.code}
                    </p>
                    <h3 className="text-base font-bold text-fg">{selectedNode.title}</h3>
                    {selectedNode.summary ? (
                      <p className="mt-1 text-xs leading-relaxed text-fg-2">
                        {selectedNode.summary}
                      </p>
                    ) : null}
                  </div>
                  {selectedDrift?.isStale ? (
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-1 text-xs font-semibold text-warn">
                        컷 수정됨
                      </span>
                      {onSyncDrift ? (
                        <button
                          type="button"
                          onClick={() => onSyncDrift(selectedNode.key)}
                          className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg border border-line bg-raised px-3 text-xs font-semibold text-fg transition-colors hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                        >
                          <RefreshCw className="size-3.5" aria-hidden="true" />
                          대본과 다시 맞추기
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {selectedSlots && selectedReadiness ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-fg">
                        컷 연출 준비 슬롯
                      </span>
                      <span
                        data-testid="cut-readiness-progress-label"
                        className="text-xs font-bold text-accent tabular-nums"
                      >
                        {selectedReadiness.label} ({selectedReadiness.percent}%)
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label="컷 연출 준비 진행률"
                      aria-valuemin={0}
                      aria-valuemax={selectedReadiness.visibleTotal}
                      aria-valuenow={selectedReadiness.filledCount}
                      className="h-2 w-full overflow-hidden rounded-full bg-raised"
                    >
                      <div
                        className="h-full rounded-full bg-accent transition-[width] duration-150 motion-reduce:transition-none"
                        style={{ width: `${selectedReadiness.percent}%` }}
                      />
                    </div>

                    {selectedSlots.openQuestions.length > 0 ? (
                      <div className="flex flex-col gap-2 rounded-xl border border-cool/35 bg-cool/10 p-3">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-cool">
                          <Sparkles className="size-4 shrink-0" aria-hidden="true" />
                          <span>미정 항목 선택 카드</span>
                        </div>
                        {selectedSlots.openQuestions.map((question) => (
                          <div
                            key={question.id}
                            className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-2.5"
                          >
                            <p className="text-xs font-medium text-fg">{question.question}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {question.options.map((option, optIndex) => {
                                const recommended = optIndex === question.aiRecommendedIndex;
                                return (
                                  <button
                                    key={`${question.id}-${option}`}
                                    type="button"
                                    onClick={() =>
                                      onAnswerOpenQuestion?.(selectedNode.key, question.id, optIndex)
                                    }
                                    className={cn(
                                      "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                                      recommended
                                        ? "border-accent bg-accent-soft text-accent"
                                        : "border-line bg-raised text-fg hover:border-line-strong",
                                    )}
                                  >
                                    <span>{option}</span>
                                    {recommended ? (
                                      <span className="rounded bg-accent px-1.5 py-0.5 text-[0.62rem] font-bold text-on-accent">
                                        AI 추천
                                      </span>
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="grid gap-2 sm:grid-cols-2">
                      {CUT_READINESS_SLOT_META.map((meta) => {
                        const isHidden = selectedSlots.hiddenSlots.includes(meta.key);
                        const inputId = `${baseId}-slot-${selectedNode.key}-${meta.key}`;
                        const value = slotDisplayValue(selectedNode, meta.key);
                        return (
                          <div
                            key={meta.key}
                            className={cn(
                              "flex flex-col gap-1.5 rounded-xl border p-2.5",
                              isHidden
                                ? "border-dashed border-line bg-panel/60 opacity-70"
                                : "border-line bg-panel",
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <label
                                htmlFor={inputId}
                                className="text-xs font-semibold text-fg"
                              >
                                {meta.labelKo}
                              </label>
                              {onToggleSlotVisibility ? (
                                <button
                                  type="button"
                                  aria-label={
                                    isHidden
                                      ? `${meta.labelKo} 슬롯 다시 표시`
                                      : `${meta.labelKo} 슬롯 숨기기`
                                  }
                                  onClick={() =>
                                    onToggleSlotVisibility(selectedNode.key, meta.key)
                                  }
                                  className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border border-line bg-raised px-2 text-[0.7rem] text-fg-2 hover:border-line-strong hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                                >
                                  {isHidden ? (
                                    <Eye className="size-3.5" aria-hidden="true" />
                                  ) : (
                                    <EyeOff className="size-3.5" aria-hidden="true" />
                                  )}
                                  <span>{isHidden ? "표시" : "숨기기"}</span>
                                </button>
                              ) : null}
                            </div>
                            {!isHidden ? (
                              <input
                                id={inputId}
                                type="text"
                                value={value}
                                placeholder={meta.placeholderKo}
                                onChange={(event) =>
                                  onUpdateCutSlot?.(selectedNode.key, meta.key, event.target.value)
                                }
                                className="min-h-11 w-full rounded-lg border border-line bg-card px-2.5 text-xs text-fg placeholder:text-fg-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                              />
                            ) : (
                              <p className="text-[0.7rem] text-fg-3">
                                이 컷에서는 필요 없는 칸으로 숨겨 두었습니다.
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-fg-2">왼쪽 목록에서 노드를 선택하세요.</p>
            )}
          </div>
        </div>
      ) : null}

      {state.activeView === "document" ? (
        <div
          id={`${baseId}-panel-document`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-document`}
          className="flex max-h-[34rem] flex-col gap-2.5 overflow-y-auto overscroll-contain rounded-xl border border-line bg-card p-3"
        >
          {orderedNodes.map((node) => {
            const drift = driftByCut.get(node.key);
            const readiness = node.cutSlots ? evaluateCutReadiness(node.cutSlots) : null;
            const isSelected = selectedNode?.key === node.key;
            return (
              <article
                key={node.key}
                className={cn(
                  "flex flex-col gap-2 rounded-xl border p-3 transition-colors duration-150 motion-reduce:transition-none",
                  isSelected ? "border-accent bg-raised" : "border-line bg-panel",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectNode(node.key)}
                    className="inline-flex min-h-11 items-center gap-2 text-left text-sm font-bold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                  >
                    <span className="rounded border border-line bg-card px-2 py-0.5 text-[0.7rem] font-semibold text-fg-2 tabular-nums">
                      {STORY_NODE_PREFIX_LABELS_KO[node.id.prefix]} · {node.id.code}
                    </span>
                    <span>{node.title}</span>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    {drift?.isStale ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-xs font-semibold text-warn">
                        <AlertTriangle className="size-3.5" aria-hidden="true" />
                        컷 수정됨
                      </span>
                    ) : null}
                    {readiness ? (
                      <span className="rounded-md border border-line bg-card px-2 py-1 text-xs font-semibold text-fg-2 tabular-nums">
                        준비도 {readiness.label}
                      </span>
                    ) : null}
                  </div>
                </div>
                {node.summary ? (
                  <p className="text-xs leading-relaxed text-fg-2">{node.summary}</p>
                ) : null}
                {node.dialogueLines && node.dialogueLines.length > 0 ? (
                  <ul className="space-y-1 border-l-2 border-accent/50 pl-3 text-xs text-fg">
                    {node.dialogueLines.map((line, idx) => (
                      <li key={`${node.key}-dlg-${idx}`}>“{line}”</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export default StudioStoryThreeViewWorkspace;
