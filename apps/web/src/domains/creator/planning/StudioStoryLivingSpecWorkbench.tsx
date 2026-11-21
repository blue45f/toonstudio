/**
 * Manyfast 스토리 기획 3-뷰 라이브 워크벤치 (React.lazy 전용).
 *
 * - ① 스토리 텍스트 ↔ 시나리오 표 ↔ 컷 카드 3-뷰 실시간 동기화 + StudioStoryThreeViewWorkspace
 * - ② 시나리오 표 ↔ 컷 카드 양방향 호버 하이라이트(`hoveredCutKey`)
 * - ③ `컷 수정됨` 드리프트 배지 (원고 컷 커밋 이벤트 자동 감지 + 1클릭 동기화)
 * - ④ AI 변경 제안 Diff 게이트 (`StudioAiProposalDiffGate`)
 * - ⑤ 6관점 증분 원고 검수 드로어 (`StudioSixPerspectiveReviewDrawer`)
 * - ⑥ 컷 단위 승인 공유 상태 (승인 단계 & 읽기 전용 공유 링크 토글·영속화)
 */
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileText, Layers, Link2, RefreshCw, ShieldCheck, Sparkles, Table2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import { cn } from "@/shared/lib/utils";
import { StudioAiProposalDiffGate } from "./StudioAiProposalDiffGate";
import { StudioSixPerspectiveReviewDrawer } from "./StudioSixPerspectiveReviewDrawer";
import { StudioStoryThreeViewWorkspace } from "./StudioStoryThreeViewWorkspace";
import type { StudioProjectPlanningState } from "./studio-planning-store";
import {
  answerCutReadinessQuestion,
  approveAiProposal,
  computeStableContentHash,
  convertConfirmedDecisionsToProposals,
  countPendingProposals,
  createEmptyCutReadinessSlots,
  createStoryLivingSpecState,
  createStoryNode,
  createStoryNodeId,
  editAndApproveAiProposal,
  enqueuePendingAiProposal,
  evaluateCutReadiness,
  evaluateDriftBadges,
  proposeReviewQuickFix,
  recordCanvasContentChange,
  rejectAiProposal,
  runIncrementalSixPerspectiveReview,
  selectStoryNode,
  setStoryActiveView,
  syncCutDriftBadge,
  toggleCutReadinessSlotVisibility,
  triageReviewFinding,
  updateCutReadinessSlot,
  type CutReadinessSlotKey,
  type StoryLivingNode,
  type StoryLivingSpecState,
  type StoryNodeEdge,
} from "./studio-story-living-spec-store";

export type CutApprovalStatus = "draft" | "review-requested" | "approved";

export interface CutApprovalShareRecord {
  readonly cutKey: string;
  readonly status: CutApprovalStatus;
  readonly shareLinkEnabled: boolean;
  readonly shareUrl: string;
  readonly snapshotHash: string;
  readonly updatedAt: string;
}

export interface PersistedStoryLivingSpecRecord {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly state: StoryLivingSpecState;
  readonly cutApprovals: Readonly<Record<string, CutApprovalShareRecord>>;
  readonly updatedAt: string;
}

export interface StudioStoryLivingSpecWorkbenchProps {
  readonly projectId: string;
  readonly planning: StudioProjectPlanningState;
  readonly characters?: readonly { readonly id: string; readonly name: string }[];
  readonly locations?: readonly { readonly id: string; readonly name: string }[];
  readonly selectedEpisodeId?: string | null;
}

type WorkbenchTabId = "synced-3view" | "living-spec" | "proposal-gate" | "review-drawer";

const EXPANDED_TOOL_COMMIT_EVENT = "toonstudio:expanded-tool-commit";
const LIVING_SPEC_UPDATED_EVENT = "toonstudio:story-living-spec-updated";
const APPROVAL_LABEL_KO: Readonly<Record<CutApprovalStatus, string>> = Object.freeze({ draft: "초안", "review-requested": "검토 요청", approved: "승인 완료" });
const APPROVAL_NEXT_STATUS: Readonly<Record<CutApprovalStatus, CutApprovalStatus>> = Object.freeze({ draft: "review-requested", "review-requested": "approved", approved: "draft" });
const TAB_ITEMS: readonly { readonly id: WorkbenchTabId; readonly labelKo: string }[] = Object.freeze([
  { id: "synced-3view", labelKo: "3-뷰 동기화 (텍스트·표·컷)" },
  { id: "living-spec", labelKo: "리빙 스펙 뷰" },
  { id: "proposal-gate", labelKo: "AI 제안 Diff 게이트" },
  { id: "review-drawer", labelKo: "6관점 증분 검수" },
]);

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const BTN_SM = `inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none ${FOCUS_RING}`;
const INPUT_CLS = `min-h-11 w-full rounded-lg border border-line bg-card px-2.5 text-xs text-fg ${FOCUS_RING}`;

const EMPTY_ENTITIES: readonly { readonly id: string; readonly name: string }[] = Object.freeze([]);
const storyLivingSpecStorageKey = (projectId: string): string =>
  `toonstudio:story-living-spec:v1:${encodeURIComponent(projectId.trim())}`;

const buildCutShareUrl = (projectId: string, cutCode: string, hash: string): string =>
  `/studio/p/${encodeURIComponent(projectId)}/review/cut/${encodeURIComponent(cutCode)}?snap=${hash.slice(0, 8)}`;

function buildInitialLivingSpecFromPlanning(
  projectId: string,
  planning: StudioProjectPlanningState,
  characters: readonly { readonly id: string; readonly name: string }[],
  locations: readonly { readonly id: string; readonly name: string }[],
): PersistedStoryLivingSpecRecord {
  const now = "2026-11-20T09:00:00.000Z";
  const nodes: StoryLivingNode[] = [];
  const edges: StoryNodeEdge[] = [];
  const arcNode = createStoryNode({ id: createStoryNodeId("ARC", "ARC-01"), title: planning.season.title.trim() || "시즌 1", summary: planning.season.goal?.trim() || "연재 핵심 서사 아크", order: 0, updatedAt: now });
  nodes.push(arcNode);

  let orderCounter = 1;
  const defaultActors = characters.slice(0, 2).map((c) => c.name);
  const defaultLocation = locations[0]?.name ?? "주요 배경";

  planning.plans.forEach((plan, planIdx) => {
    const epCode = `EP-${String(plan.episodeNumber).padStart(2, "0")}`;
    const epNode = createStoryNode({ id: createStoryNodeId("EP", epCode), title: `${plan.episodeNumber}화: ${plan.title.trim() || "회차 기획"}`, summary: plan.logline.trim() || plan.synopsis?.trim() || "회차 시놉시스 초안", parentKey: arcNode.key, order: orderCounter++, updatedAt: now });
    nodes.push(epNode);
    edges.push({ id: `edge-arc-${epCode}`, fromKey: arcNode.key, toKey: epNode.key, relation: "parent" });

    const beats = plan.turningPoints.length > 0 ? plan.turningPoints : [plan.synopsis?.trim() || plan.logline.trim() || `${plan.episodeNumber}화 오프닝 컷`];
    beats.slice(0, 4).forEach((beatTitle, cutIdx) => {
      const cutCode = `${epCode}-C${String(cutIdx + 1).padStart(2, "0")}`;
      const cutNode = createStoryNode({
        id: createStoryNodeId("CUT", cutCode), title: beatTitle,
        summary: cutIdx === 0 && plan.synopsis?.trim() ? plan.synopsis.trim() : `${plan.title} · ${beatTitle} 연출 컷`,
        parentKey: epNode.key, order: orderCounter++,
        cutSlots: createEmptyCutReadinessSlots({
          location: defaultLocation, timeLighting: cutIdx % 2 === 0 ? "자연광 정오" : "노을 역광",
          actors: defaultActors.length > 0 ? defaultActors : ["주인공"], emotionalBeat: cutIdx === 0 ? "도입 호기심" : "긴장감 고조",
          cameraAngleLens: cutIdx % 2 === 0 ? "아이레벨 바스트샷 50mm" : "로우앵글 미디엄 35mm",
          keyAction: beatTitle, keyDialogue: cutIdx === 0 ? (plan.logline.trim() || `${beatTitle}의 순간이다.`) : "",
        }),
        dialogueLines: cutIdx === 0 && plan.logline.trim() ? [plan.logline.trim()] : [], updatedAt: now,
      });
      nodes.push(cutNode);
      edges.push({ id: `edge-${epCode}-${cutCode}`, fromKey: epNode.key, toKey: cutNode.key, relation: "parent" });
    });

    if (planIdx === 0 && beats.length === 1) {
      const cut2Code = `${epCode}-C02`;
      const cut2 = createStoryNode({
        id: createStoryNodeId("CUT", cut2Code), title: `${plan.episodeNumber}화 전환 클로즈업`, summary: "인물의 표정 변화로 다음 컷의 긴장감을 끌어올린다.",
        parentKey: epNode.key, order: orderCounter++,
        cutSlots: createEmptyCutReadinessSlots({ location: defaultLocation, timeLighting: "노을 역광", actors: defaultActors.length > 0 ? defaultActors : ["주인공"], emotionalBeat: "결심과 전환", cameraAngleLens: "클로즈업 85mm", keyAction: "시선을 들며 결정적인 한마디를 건넨다", keyDialogue: "이제 물러설 수 없어." }),
        dialogueLines: ["이제 물러설 수 없어."], updatedAt: now,
      });
      nodes.push(cut2);
      edges.push({ id: `edge-${epCode}-${cut2Code}`, fromKey: epNode.key, toKey: cut2.key, relation: "parent" });
    }
  });

  characters.forEach((char, idx) => nodes.push(createStoryNode({ id: createStoryNodeId("CHAR", `CHAR-${String(idx + 1).padStart(2, "0")}`), title: char.name, summary: `${char.name} 캐릭터 바이블 등록 인물`, order: orderCounter++, updatedAt: now })));
  locations.forEach((loc, idx) => nodes.push(createStoryNode({ id: createStoryNodeId("LOC", `LOC-${String(idx + 1).padStart(2, "0")}`), title: loc.name, summary: `${loc.name} 배경 장소 설정`, order: orderCounter++, updatedAt: now })));

  const firstCut = nodes.find((n) => n.id.prefix === "CUT") ?? nodes[0] ?? null;
  let state = createStoryLivingSpecState({ projectId, activeView: "directory", nodes, edges });
  if (firstCut) {
    state = selectStoryNode(state, firstCut.key);
    state = enqueuePendingAiProposal(state, {
      id: `prop-init-${projectId}`, targetEntityId: firstCut.key, op: "update", source: "studio_chat",
      title: `${firstCut.id.code} 도입 연출 밀도 보강`,
      rationale: "첫 컷의 시선 집중을 높이기 위해 구도 설명과 감정 목표를 선명하게 다듬습니다.",
      proposedSnapshot: { title: `${firstCut.title} (강조)`, summary: `${firstCut.summary} — 독자 시선 유도용 28mm 광각 도입.` },
      evidenceCitations: [{ sourceDocId: firstCut.parentKey ?? "EP-01", quote: firstCut.summary || firstCut.title }],
      createdAt: now,
    });
  }
  state = runIncrementalSixPerspectiveReview(state, now);

  const cutApprovals: Record<string, CutApprovalShareRecord> = {};
  for (const node of state.nodes) {
    if (node.id.prefix !== "CUT") continue;
    cutApprovals[node.key] = { cutKey: node.key, status: "draft", shareLinkEnabled: false, shareUrl: buildCutShareUrl(projectId, node.id.code, node.contentHash), snapshotHash: node.contentHash, updatedAt: now };
  }
  return { schemaVersion: 1, projectId, state, cutApprovals, updatedAt: now };
}

function readOrSeedLivingSpec(
  projectId: string,
  planning: StudioProjectPlanningState,
  characters: readonly { readonly id: string; readonly name: string }[],
  locations: readonly { readonly id: string; readonly name: string }[],
): PersistedStoryLivingSpecRecord {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(storyLivingSpecStorageKey(projectId));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedStoryLivingSpecRecord> | null;
        if (parsed && parsed.schemaVersion === 1 && parsed.state && Array.isArray(parsed.state.nodes)) {
          return { schemaVersion: 1, projectId, state: parsed.state, cutApprovals: parsed.cutApprovals ?? {}, updatedAt: parsed.updatedAt ?? new Date().toISOString() };
        }
      }
    } catch { /* 파싱 실패 시 재시드 */ }
  }
  const seeded = buildInitialLivingSpecFromPlanning(projectId, planning, characters, locations);
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(storyLivingSpecStorageKey(projectId), JSON.stringify(seeded)); } catch { /* 저장 한도 초과 시 유지 */ }
  }
  return seeded;
}

export function StudioStoryLivingSpecWorkbench({
  projectId,
  planning,
  characters = EMPTY_ENTITIES,
  locations = EMPTY_ENTITIES,
}: StudioStoryLivingSpecWorkbenchProps): ReactElement {
  const seedContextRef = useRef({ planning, characters, locations });
  seedContextRef.current = { planning, characters, locations };
  const [record, setRecord] = useState<PersistedStoryLivingSpecRecord>(() => readOrSeedLivingSpec(projectId, planning, characters, locations));
  const [activeTab, setActiveTab] = useState<WorkbenchTabId>("synced-3view");
  const [hoveredCutKey, setHoveredCutKey] = useState<string | null>(null);
  const [noticeKo, setNoticeKo] = useState<string | null>(null);

  useEffect(() => {
    const ctx = seedContextRef.current;
    setRecord(readOrSeedLivingSpec(projectId, ctx.planning, ctx.characters, ctx.locations));
  }, [projectId]);

  const persistRecord = useCallback(
    (updater: (prev: PersistedStoryLivingSpecRecord, now: string) => PersistedStoryLivingSpecRecord) => {
      const now = new Date().toISOString();
      setRecord((prev) => {
        const next = { ...updater(prev, now), schemaVersion: 1 as const, projectId, updatedAt: now };
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(storyLivingSpecStorageKey(projectId), JSON.stringify(next));
            window.dispatchEvent(new CustomEvent(LIVING_SPEC_UPDATED_EVENT, { detail: next }));
          } catch { /* 저장 실패 시 초안 유지 */ }
        }
        return next;
      });
    },
    [projectId],
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onExpandedCommit = (event: Event) => {
      if (!(event instanceof CustomEvent) || !event.detail) return;
      const detail = event.detail as { readonly cutId?: string; readonly id?: string; readonly summaryKo?: string };
      persistRecord((prev) => {
        const cutNodes = prev.state.nodes.filter((n) => n.id.prefix === "CUT");
        const target = cutNodes.find((n) => n.key === detail.cutId || n.id.code.toLowerCase() === detail.cutId?.toLowerCase()) ?? cutNodes[0];
        if (!target) return prev;
        return { ...prev, state: recordCanvasContentChange(prev.state, target.key, computeStableContentHash(`${detail.id ?? "canvas"}:${detail.summaryKo ?? "edit"}`)) };
      });
    };
    const onExternalSpecUpdate = (event: Event) => {
      if (!(event instanceof CustomEvent) || !event.detail) return;
      const incoming = event.detail as Partial<PersistedStoryLivingSpecRecord>;
      if (incoming.projectId === projectId && incoming.state && incoming.updatedAt) {
        setRecord((prev) => (incoming.updatedAt && incoming.updatedAt > prev.updatedAt ? { schemaVersion: 1, projectId, state: incoming.state!, cutApprovals: incoming.cutApprovals ?? prev.cutApprovals, updatedAt: incoming.updatedAt } : prev));
      }
    };
    window.addEventListener(EXPANDED_TOOL_COMMIT_EVENT, onExpandedCommit);
    window.addEventListener(LIVING_SPEC_UPDATED_EVENT, onExternalSpecUpdate);
    return () => {
      window.removeEventListener(EXPANDED_TOOL_COMMIT_EVENT, onExpandedCommit);
      window.removeEventListener(LIVING_SPEC_UPDATED_EVENT, onExternalSpecUpdate);
    };
  }, [persistRecord, projectId]);

  const { state, cutApprovals } = record;
  const cutNodes = useMemo(() => state.nodes.filter((node) => node.id.prefix === "CUT").sort((a, b) => a.order - b.order), [state.nodes]);
  const selectedCut = useMemo(() => cutNodes.find((node) => node.key === state.selectedNodeKey) ?? cutNodes[0] ?? null, [cutNodes, state.selectedNodeKey]);
  const driftList = useMemo(() => evaluateDriftBadges(state), [state]);
  const driftByCut = useMemo(() => new Map(driftList.map((badge) => [badge.cutId, badge])), [driftList]);
  const staleCutCount = driftList.filter((badge) => badge.isStale).length;
  const pendingProposalCount = countPendingProposals(state);
  const openReviewCount = state.reviewFindings.filter((item) => item.status === "open").length;

  const updateSelectedCutText = useCallback(
    (cutKey: string, patch: { readonly title?: string; readonly summary?: string; readonly keyDialogue?: string }) => {
      persistRecord((prev, now) => {
        let nextState = prev.state;
        if (patch.keyDialogue !== undefined) nextState = updateCutReadinessSlot(nextState, cutKey, "keyDialogue", patch.keyDialogue, now);
        if (patch.title !== undefined || patch.summary !== undefined) {
          const nextNodes = nextState.nodes.map((node) => {
            if (node.key !== cutKey) return node;
            const title = patch.title ?? node.title;
            const summary = patch.summary ?? node.summary;
            const dialogueLines = patch.keyDialogue !== undefined ? (patch.keyDialogue.trim() ? [patch.keyDialogue.trim()] : []) : node.dialogueLines;
            return { ...node, title, summary, dialogueLines, updatedAt: now, contentHash: computeStableContentHash(JSON.stringify({ id: node.id, title, summary, cutSlots: node.cutSlots, dialogueLines })) };
          });
          nextState = { ...nextState, nodes: nextNodes, sequence: nextState.sequence + 1 };
        }
        return { ...prev, state: nextState };
      });
    },
    [persistRecord],
  );

  const handleMarkCanvasEdited = useCallback((cutKey: string) => {
    persistRecord((prev, now) => ({ ...prev, state: recordCanvasContentChange(prev.state, cutKey, computeStableContentHash(`canvas-edit:${cutKey}:${now}`)) }));
    setNoticeKo(`${cutKey} 원고 컷 변경을 감지해 '컷 수정됨' 배지를 표시했습니다.`);
  }, [persistRecord]);

  const handleSyncDrift = useCallback((cutKey: string) => {
    persistRecord((prev, now) => ({ ...prev, state: syncCutDriftBadge(prev.state, cutKey, now) }));
    setNoticeKo(`${cutKey} 컷 원고와 스토리 스펙을 1클릭으로 다시 맞췄습니다.`);
  }, [persistRecord]);

  const updateCutApproval = useCallback(
    (cut: StoryLivingNode, mutate: (cur: CutApprovalShareRecord | undefined) => { readonly status: CutApprovalStatus; readonly shareLinkEnabled: boolean }, message: string) => {
      persistRecord((prev, now) => {
        const nextFields = mutate(prev.cutApprovals[cut.key]);
        return {
          ...prev,
          cutApprovals: {
            ...prev.cutApprovals,
            [cut.key]: { cutKey: cut.key, ...nextFields, shareUrl: buildCutShareUrl(projectId, cut.id.code, cut.contentHash), snapshotHash: cut.contentHash, updatedAt: now },
          },
        };
      });
      setNoticeKo(message);
    },
    [persistRecord, projectId],
  );

  return (
    <section
      aria-label="Manyfast 스토리 리빙 스펙 3-뷰 워크벤치"
      data-testid="studio-story-living-spec-workbench"
      data-hovered-cut={hoveredCutKey ?? ""}
      className="space-y-4 rounded-2xl border border-line bg-canvas p-3 text-fg sm:p-4 [word-break:keep-all]"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div role="tablist" aria-label="스토리 리빙 스펙 영역 전환" className="flex flex-wrap gap-1.5">
          {TAB_ITEMS.map((tab) => {
            const active = activeTab === tab.id;
            const badge = tab.id === "proposal-gate" ? pendingProposalCount : tab.id === "review-drawer" ? openReviewCount : tab.id === "synced-3view" ? cutNodes.length : null;
            return (
              <button
                key={tab.id} type="button" role="tab" aria-selected={active} data-testid={`living-spec-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={cn(BTN_SM, "px-3", active ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")}
              >
                <span>{tab.labelKo}</span>
                {badge !== null ? <span className="tabular-nums opacity-90">{badge}</span> : null}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {staleCutCount > 0 ? (
            <span data-testid="living-spec-stale-counter" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-warn/40 bg-warn/10 px-3 text-xs font-semibold tabular-nums text-warn">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              컷 수정됨 {staleCutCount}건
            </span>
          ) : (
            <span className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-good/40 bg-good/10 px-3 text-xs font-semibold text-good">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              원고·스펙 동기화됨
            </span>
          )}
        </div>
      </header>

      {noticeKo ? (
        <p role="status" aria-live="polite" data-testid="living-spec-status-notice" className="rounded-lg border border-line bg-panel px-3 py-2 text-xs text-fg-2">
          {noticeKo}
        </p>
      ) : null}

      {activeTab === "synced-3view" ? (
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-3">
            {/* 뷰 1: 스토리 텍스트 */}
            <section aria-label="스토리 텍스트 뷰" className="flex flex-col gap-2.5 rounded-xl border border-line bg-panel p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
                  <FileText className="h-4 w-4 text-accent" aria-hidden />
                  스토리 텍스트
                </h3>
                {selectedCut ? <span className="rounded border border-line bg-card px-2 py-0.5 font-mono text-[11px] tabular-nums text-fg-2">{selectedCut.id.code}</span> : null}
              </div>

              {selectedCut ? (
                <div className="space-y-2.5">
                  <label className="block space-y-1 text-xs">
                    <span className="font-semibold text-fg-2">컷 제목</span>
                    <input type="text" data-testid="manyfast-story-title-input" value={selectedCut.title} onChange={(e) => updateSelectedCutText(selectedCut.key, { title: e.target.value })} className={INPUT_CLS} />
                  </label>
                  <label className="block space-y-1 text-xs">
                    <span className="font-semibold text-fg-2">장면 지문 · 요약</span>
                    <textarea rows={3} data-testid="manyfast-story-summary-input" value={selectedCut.summary} onChange={(e) => updateSelectedCutText(selectedCut.key, { summary: e.target.value })} className={`w-full rounded-lg border border-line bg-card p-2.5 text-xs text-fg ${FOCUS_RING}`} />
                  </label>
                  <label className="block space-y-1 text-xs">
                    <span className="font-semibold text-fg-2">핵심 대사</span>
                    <input type="text" data-testid="manyfast-story-dialogue-input" value={selectedCut.cutSlots?.keyDialogue ?? ""} onChange={(e) => updateSelectedCutText(selectedCut.key, { keyDialogue: e.target.value })} className={INPUT_CLS} />
                  </label>
                  <button type="button" data-testid="manyfast-simulate-canvas-drift-btn" onClick={() => handleMarkCanvasEdited(selectedCut.key)} className={cn(BTN_SM, "w-full justify-center border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")}>
                    <AlertTriangle className="h-3.5 w-3.5 text-warn" aria-hidden />
                    원고 컷 변경 감지 기록
                  </button>
                </div>
              ) : (
                <p className="text-xs text-fg-2">편집할 컷 노드를 선택하세요.</p>
              )}
            </section>

            {/* 뷰 2: 시나리오 표 */}
            <section aria-label="시나리오 표 뷰" className="flex flex-col gap-2.5 rounded-xl border border-line bg-panel p-3 lg:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
                  <Table2 className="h-4 w-4 text-accent" aria-hidden />
                  시나리오 표 · 컷 양방향 동기화
                </h3>
                <span className="text-xs text-fg-2">행 또는 컷 카드에 마우스를 올리면 서로 강조됩니다</span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-line bg-card">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-line bg-panel text-fg-2">
                      <th className="px-2.5 py-2 font-semibold">컷</th>
                      <th className="px-2.5 py-2 font-semibold">제목 · 대사</th>
                      <th className="px-2.5 py-2 font-semibold">카메라</th>
                      <th className="px-2.5 py-2 font-semibold">준비도</th>
                      <th className="px-2.5 py-2 font-semibold">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {cutNodes.map((cut) => {
                      const isSelected = selectedCut?.key === cut.key;
                      const isHovered = hoveredCutKey === cut.key;
                      const drift = driftByCut.get(cut.key);
                      const readiness = evaluateCutReadiness(cut.cutSlots ?? createEmptyCutReadinessSlots());
                      const approval = cutApprovals[cut.key];
                      return (
                        <tr
                          key={cut.key} data-testid={`scenario-table-row-${cut.key}`} data-scenario-row-cut={cut.key} data-hovered={isHovered ? "true" : "false"}
                          onMouseEnter={() => setHoveredCutKey(cut.key)}
                          onMouseLeave={() => setHoveredCutKey((prev) => (prev === cut.key ? null : prev))}
                          onClick={() => persistRecord((prev) => ({ ...prev, state: selectStoryNode(prev.state, cut.key) }))}
                          className={cn("cursor-pointer transition-colors duration-150 motion-reduce:transition-none", isHovered ? "bg-accent-soft/60" : isSelected ? "bg-raised" : "hover:bg-panel")}
                        >
                          <td className="whitespace-nowrap px-2.5 py-2 font-mono font-semibold tabular-nums text-fg">{cut.id.code}</td>
                          <td className="px-2.5 py-2">
                            <p className="font-semibold text-fg">{cut.title}</p>
                            {cut.cutSlots?.keyDialogue ? <p className="mt-0.5 text-fg-2">“{cut.cutSlots.keyDialogue}”</p> : null}
                          </td>
                          <td className="px-2.5 py-2 text-fg-2">{cut.cutSlots?.cameraAngleLens ?? "미지정"}</td>
                          <td className="whitespace-nowrap px-2.5 py-2 font-semibold tabular-nums text-accent">{readiness.label}</td>
                          <td className="whitespace-nowrap px-2.5 py-2">
                            <div className="flex flex-wrap items-center gap-1">
                              {drift?.isStale ? <span data-testid={`scenario-drift-badge-${cut.key}`} className="rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[11px] font-semibold text-warn">컷 수정됨</span> : null}
                              <span className="rounded border border-line bg-panel px-1.5 py-0.5 text-[11px] font-medium text-fg-2">{APPROVAL_LABEL_KO[approval?.status ?? "draft"]}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* 뷰 3: 컷 카드 보드 */}
          <section aria-label="컷 카드 보드" className="space-y-2.5 rounded-xl border border-line bg-panel p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
                <Layers className="h-4 w-4 text-accent" aria-hidden />
                컷 카드 · 컷 단위 승인 및 공유 스냅샷
              </h3>
              <span className="text-xs tabular-nums text-fg-2">총 {cutNodes.length}컷</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {cutNodes.map((cut) => {
                const isSelected = selectedCut?.key === cut.key;
                const isHovered = hoveredCutKey === cut.key;
                const drift = driftByCut.get(cut.key);
                const readiness = evaluateCutReadiness(cut.cutSlots ?? createEmptyCutReadinessSlots());
                const approval = cutApprovals[cut.key] ?? { cutKey: cut.key, status: "draft" as const, shareLinkEnabled: false, shareUrl: buildCutShareUrl(projectId, cut.id.code, cut.contentHash), snapshotHash: cut.contentHash, updatedAt: record.updatedAt };
                return (
                  <article
                    key={cut.key} data-testid={`manyfast-cut-card-${cut.key}`} data-cut-card={cut.key} data-hovered={isHovered ? "true" : "false"} data-drift-stale={drift?.isStale ? "true" : "false"}
                    onMouseEnter={() => setHoveredCutKey(cut.key)}
                    onMouseLeave={() => setHoveredCutKey((prev) => (prev === cut.key ? null : prev))}
                    onFocus={() => setHoveredCutKey(cut.key)}
                    onBlur={() => setHoveredCutKey((prev) => (prev === cut.key ? null : prev))}
                    className={cn("flex flex-col gap-2.5 rounded-xl border p-3 transition-colors duration-150 motion-reduce:transition-none", isHovered ? "border-accent bg-accent-soft/45" : isSelected ? "border-accent/60 bg-raised" : "border-line bg-card")}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <button type="button" onClick={() => persistRecord((prev) => ({ ...prev, state: selectStoryNode(prev.state, cut.key) }))} className={`text-left ${FOCUS_RING}`}>
                        <span className="font-mono text-[11px] font-semibold tabular-nums text-fg-3">{cut.id.code}</span>
                        <h4 className="text-sm font-bold text-fg">{cut.title}</h4>
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {drift?.isStale ? (
                          <span data-testid={`cut-card-drift-badge-${cut.key}`} className="inline-flex items-center gap-1 rounded-md border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] font-bold text-warn">
                            <AlertTriangle className="h-3 w-3" aria-hidden />
                            컷 수정됨
                          </span>
                        ) : null}
                        <span className="rounded-md border border-line bg-panel px-2 py-0.5 text-[11px] font-semibold tabular-nums text-accent">준비 {readiness.label}</span>
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed text-fg-2">{cut.summary}</p>
                    {cut.cutSlots?.keyDialogue ? <p className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-fg">“{cut.cutSlots.keyDialogue}”</p> : null}
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
                      {drift?.isStale ? (
                        <button type="button" data-testid={`cut-card-sync-drift-${cut.key}`} onClick={() => handleSyncDrift(cut.key)} className={cn(BTN_SM, "border-warn/50 bg-warn/10 text-warn hover:bg-raised")}>
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                          대본과 다시 맞추기
                        </button>
                      ) : null}
                      <button
                        type="button" data-testid={`cut-approval-toggle-${cut.key}`} data-approval-status={approval.status}
                        onClick={() => updateCutApproval(cut, (cur) => ({ status: APPROVAL_NEXT_STATUS[cur?.status ?? "draft"], shareLinkEnabled: cur?.shareLinkEnabled ?? false }), `${cut.id.code} 컷 승인 상태를 변경했습니다.`)}
                        className={cn(BTN_SM, approval.status === "approved" ? "border-good/50 bg-good/10 text-good" : approval.status === "review-requested" ? "border-cool/50 bg-cool/10 text-cool" : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg")}
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
                        <span>승인: {APPROVAL_LABEL_KO[approval.status]}</span>
                      </button>
                      <button
                        type="button" data-testid={`cut-share-toggle-${cut.key}`} aria-pressed={approval.shareLinkEnabled}
                        onClick={() => updateCutApproval(cut, (cur) => ({ status: cur?.status ?? "draft", shareLinkEnabled: !(cur?.shareLinkEnabled ?? false) }), `${cut.id.code} 컷 승인 공유 링크 상태를 전환했습니다.`)}
                        className={cn(BTN_SM, approval.shareLinkEnabled ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg")}
                      >
                        <Link2 className="h-3.5 w-3.5" aria-hidden />
                        <span>{approval.shareLinkEnabled ? "공유 켜짐" : "공유 링크 켜기"}</span>
                      </button>
                    </div>
                    {approval.shareLinkEnabled ? (
                      <p data-testid={`cut-share-url-${cut.key}`} className="truncate rounded-lg border border-accent/35 bg-panel px-2.5 py-1.5 font-mono text-[11px] text-fg-2">
                        {approval.shareUrl}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "living-spec" ? (
        <StudioStoryThreeViewWorkspace
          state={state}
          onChangeView={(nextView) => persistRecord((prev) => ({ ...prev, state: setStoryActiveView(prev.state, nextView) }))}
          onSelectNode={(nodeKey) => persistRecord((prev) => ({ ...prev, state: selectStoryNode(prev.state, nodeKey) }))}
          onUpdateCutSlot={(nodeKey: string, slotKey: CutReadinessSlotKey, value: string) => persistRecord((prev, now) => ({ ...prev, state: updateCutReadinessSlot(prev.state, nodeKey, slotKey, value, now) }))}
          onToggleSlotVisibility={(nodeKey, slotKey) => persistRecord((prev) => ({ ...prev, state: toggleCutReadinessSlotVisibility(prev.state, nodeKey, slotKey) }))}
          onAnswerOpenQuestion={(nodeKey, questionId, optionIndex) => persistRecord((prev, now) => ({ ...prev, state: answerCutReadinessQuestion(prev.state, nodeKey, questionId, optionIndex, now) }))}
          onSyncDrift={handleSyncDrift}
          onOpenProposalGate={() => setActiveTab("proposal-gate")}
          onOpenReviewDrawer={() => setActiveTab("review-drawer")}
        />
      ) : null}

      {activeTab === "proposal-gate" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-xs text-fg-2">
            <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
              <Sparkles className="h-4 w-4 text-accent" aria-hidden />
              AI 제안 승인·수정 후 승인·거절 결과가 프로젝트 스펙에 즉시 반영됩니다.
            </span>
          </div>
          <StudioAiProposalDiffGate
            state={state}
            onApprove={(proposalId) => { persistRecord((prev, now) => ({ ...prev, state: approveAiProposal(prev.state, proposalId, now) })); setNoticeKo("AI 변경 제안을 승인해 프로젝트 스펙에 반영했습니다."); }}
            onEditAndApprove={(proposalId, edited) => { persistRecord((prev, now) => ({ ...prev, state: editAndApproveAiProposal(prev.state, proposalId, edited, now) })); setNoticeKo("제안 내용을 직접 다듬어 승인했습니다."); }}
            onReject={(proposalId) => { persistRecord((prev, now) => ({ ...prev, state: rejectAiProposal(prev.state, proposalId, now) })); setNoticeKo("AI 변경 제안을 거절했습니다."); }}
            onConvertMeetingDecisions={(decisions) => { persistRecord((prev, now) => ({ ...prev, state: convertConfirmedDecisionsToProposals(prev.state, decisions, now) })); setNoticeKo("회의록 확정 항목을 승인 대기 큐로 보냈습니다."); }}
            onJumpToTarget={(targetEntityId) => { persistRecord((prev) => ({ ...prev, state: selectStoryNode(prev.state, targetEntityId) })); setActiveTab("synced-3view"); }}
          />
        </div>
      ) : null}

      {activeTab === "review-drawer" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-xs text-fg-2">
            <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
              <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
              변경된 컷만 증분 재검수하며 보완 제안 클릭 시 Diff 게이트 큐로 자동 전송됩니다.
            </span>
          </div>
          <StudioSixPerspectiveReviewDrawer
            state={state}
            onRunIncrementalReview={() => { persistRecord((prev, now) => ({ ...prev, state: runIncrementalSixPerspectiveReview(prev.state, now) })); setNoticeKo("6관점 증분 원고 검수를 완료하고 결과를 저장했습니다."); }}
            onTriageFinding={(findingId, status) => { persistRecord((prev, now) => ({ ...prev, state: triageReviewFinding(prev.state, findingId, status, now) })); setNoticeKo(`검수 항목 상태를 변경했습니다 (${status}).`); }}
            onProposeQuickFix={(findingId, optionIndex) => { persistRecord((prev, now) => ({ ...prev, state: proposeReviewQuickFix(prev.state, findingId, optionIndex, now) })); setNoticeKo("선택한 검수 보완안을 AI 제안 Diff 게이트에 등록했습니다."); }}
            onJumpToNode={(nodeKey) => { persistRecord((prev) => ({ ...prev, state: selectStoryNode(prev.state, nodeKey) })); setActiveTab("synced-3view"); }}
          />
        </div>
      ) : null}
    </section>
  );
}

export default StudioStoryLivingSpecWorkbench;
