/**
 * Story Living Spec 노드 생성·해시·컷 준비 슬롯·드리프트·그래프 레이아웃 핵심 로직.
 */

import {
  CUT_READINESS_SLOT_KEYS,
  STORY_NODE_PREFIXES,
  STORY_THREE_VIEWS,
  type CutReadinessSlotKey,
  type CutReadinessSlots,
  type CutReadinessSummary,
  type StoryAgeRating,
  type StoryGraphLayoutNode,
  type StoryLivingNode,
  type StoryLivingSpecState,
  type StoryNodeEdge,
  type StoryNodeId,
  type StoryNodePrefix,
  type StoryRightsAssetTag,
  type StorySensitiveCue,
  type StoryThreeViewMode,
  type StoryWorkLogEntry,
  type StoryboardDriftBadge,
} from "./studio-story-living-spec-types";

export function formatStoryNodeKey(id: StoryNodeId): string {
  return `${id.prefix}:${id.code.trim()}`;
}

export function createStoryNodeId(prefix: StoryNodePrefix, code: string): StoryNodeId {
  return { prefix, code: code.trim() };
}

export function parseStoryNodeId(raw: string): StoryNodeId | null {
  const trimmed = raw.trim();
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx > 0) {
    const prefix = trimmed.slice(0, colonIdx) as StoryNodePrefix;
    const code = trimmed.slice(colonIdx + 1).trim();
    if ((STORY_NODE_PREFIXES as readonly string[]).includes(prefix) && code.length > 0) {
      return { prefix, code };
    }
  }
  const match = /^(ARC|EP|BEAT|CUT|CHAR|LOC|RULE)[-_\s]?([A-Za-z0-9-]+)$/u.exec(trimmed);
  if (!match) return null;
  const prefix = match[1] as StoryNodePrefix;
  return { prefix, code: trimmed };
}

/**
 * 결정론적 64비트 이중 FNV-1a 콘텐츠 다이제스트(동기식, 브라우저·Node 공통).
 * 노드 내용 불변 여부를 밀리초 이하로 판정해 드리프트와 증분 검수에 쓴다.
 */
export function computeStableContentHash(payload: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < payload.length; i += 1) {
    const code = payload.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + ((i & 0xff) << 1);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

export function computeStoryNodeContentHash(
  node: Pick<
    StoryLivingNode,
    | "id"
    | "title"
    | "summary"
    | "parentKey"
    | "cutSlots"
    | "dialogueLines"
    | "rightsAssets"
    | "sensitiveCues"
  >,
): string {
  return computeStableContentHash(
    JSON.stringify({
      id: node.id,
      title: node.title,
      summary: node.summary,
      parentKey: node.parentKey,
      cutSlots: node.cutSlots ?? null,
      dialogueLines: node.dialogueLines ?? [],
      rightsAssets: node.rightsAssets ?? [],
      sensitiveCues: node.sensitiveCues ?? [],
    }),
  );
}

export function createEmptyCutReadinessSlots(
  overrides?: Partial<CutReadinessSlots>,
): CutReadinessSlots {
  return {
    ...overrides,
    hiddenSlots: overrides?.hiddenSlots ? [...overrides.hiddenSlots] : [],
    openQuestions: overrides?.openQuestions ? [...overrides.openQuestions] : [],
  };
}

function isSlotFilled(slots: CutReadinessSlots, key: CutReadinessSlotKey): boolean {
  if (key === "actors") {
    return Array.isArray(slots.actors) && slots.actors.some((name) => name.trim().length > 0);
  }
  const value = slots[key];
  return typeof value === "string" && value.trim().length > 0;
}

export function evaluateCutReadiness(slots: CutReadinessSlots): CutReadinessSummary {
  const hiddenSet = new Set<CutReadinessSlotKey>(slots.hiddenSlots);
  const filledKeys: CutReadinessSlotKey[] = [];
  const missingKeys: CutReadinessSlotKey[] = [];
  for (const key of CUT_READINESS_SLOT_KEYS) {
    if (hiddenSet.has(key)) continue;
    if (isSlotFilled(slots, key)) {
      filledKeys.push(key);
    } else {
      missingKeys.push(key);
    }
  }
  const visibleTotal = CUT_READINESS_SLOT_KEYS.length - hiddenSet.size;
  const filledCount = filledKeys.length;
  const ratio01 = visibleTotal === 0 ? 1 : filledCount / visibleTotal;
  return {
    filledCount,
    visibleTotal,
    totalSlots: 9,
    hiddenCount: hiddenSet.size,
    ratio01,
    percent: Math.round(ratio01 * 100),
    label: `${filledCount}/${visibleTotal}`,
    filledKeys,
    missingKeys,
  };
}

export function createStoryNode(input: {
  readonly id: StoryNodeId;
  readonly title: string;
  readonly summary?: string;
  readonly parentKey?: string | null;
  readonly order?: number;
  readonly cutSlots?: CutReadinessSlots;
  readonly dialogueLines?: readonly string[];
  readonly rightsAssets?: readonly StoryRightsAssetTag[];
  readonly sensitiveCues?: readonly StorySensitiveCue[];
  readonly updatedAt?: string;
}): StoryLivingNode {
  const base = {
    id: createStoryNodeId(input.id.prefix, input.id.code),
    key: formatStoryNodeKey(input.id),
    title: input.title.trim(),
    summary: (input.summary ?? "").trim(),
    parentKey: input.parentKey ?? null,
    order: input.order ?? 0,
    cutSlots: input.cutSlots ?? (input.id.prefix === "CUT" ? createEmptyCutReadinessSlots() : undefined),
    dialogueLines: input.dialogueLines ? [...input.dialogueLines] : undefined,
    rightsAssets: input.rightsAssets ? [...input.rightsAssets] : undefined,
    sensitiveCues: input.sensitiveCues ? [...input.sensitiveCues] : undefined,
    updatedAt: input.updatedAt ?? "2026-11-20T00:00:00.000Z",
  };
  return {
    ...base,
    contentHash: computeStoryNodeContentHash(base),
  };
}

export function createStoryLivingSpecState(input: {
  readonly projectId: string;
  readonly targetRating?: StoryAgeRating;
  readonly nodes?: readonly StoryLivingNode[];
  readonly edges?: readonly StoryNodeEdge[];
  readonly activeView?: StoryThreeViewMode;
}): StoryLivingSpecState {
  const nodes = input.nodes ? [...input.nodes] : [];
  const driftBadges: Record<string, StoryboardDriftBadge> = {};
  for (const node of nodes) {
    if (node.id.prefix === "CUT") {
      driftBadges[node.key] = {
        cutId: node.key,
        canvasContentHash: node.contentHash,
        syncedScriptHash: node.contentHash,
        isStale: false,
        lastSyncedAt: node.updatedAt,
      };
    }
  }
  return {
    projectId: input.projectId,
    targetRating: input.targetRating ?? "15+",
    activeView: input.activeView ?? "graph",
    selectedNodeKey: nodes[0]?.key ?? null,
    nodes,
    edges: input.edges ? [...input.edges] : [],
    proposals: [],
    driftBadges,
    reviewFindings: [],
    reviewNodeHashes: {},
    lastReviewReport: null,
    workLog: [],
    sequence: 1,
  };
}

export function cycleStoryThreeView(
  current: StoryThreeViewMode,
  reverse = false,
): StoryThreeViewMode {
  const index = STORY_THREE_VIEWS.indexOf(current);
  const safeIndex = index < 0 ? 0 : index;
  const delta = reverse ? -1 : 1;
  const nextIndex = (safeIndex + delta + STORY_THREE_VIEWS.length) % STORY_THREE_VIEWS.length;
  return STORY_THREE_VIEWS[nextIndex] ?? "graph";
}

export function setStoryActiveView(
  state: StoryLivingSpecState,
  view: StoryThreeViewMode,
): StoryLivingSpecState {
  return state.activeView === view ? state : { ...state, activeView: view };
}

export function selectStoryNode(
  state: StoryLivingSpecState,
  nodeKey: string | null,
): StoryLivingSpecState {
  return state.selectedNodeKey === nodeKey ? state : { ...state, selectedNodeKey: nodeKey };
}

export function findStoryNodeIndex(nodes: readonly StoryLivingNode[], entityId: string): number {
  const exact = nodes.findIndex((node) => node.key === entityId);
  if (exact >= 0) return exact;
  return nodes.findIndex((node) => node.id.code === entityId);
}

export function appendStoryWorkLog(
  state: StoryLivingSpecState,
  entry: Omit<StoryWorkLogEntry, "id">,
): readonly StoryWorkLogEntry[] {
  const id = `wl-${state.sequence}-${state.workLog.length + 1}`;
  return [...state.workLog, { ...entry, id }];
}

export function refreshStoryDriftAndStaleFindings(
  state: StoryLivingSpecState,
  nodes: readonly StoryLivingNode[],
  driftOverrides?: Readonly<Record<string, StoryboardDriftBadge>>,
): Pick<StoryLivingSpecState, "driftBadges" | "reviewFindings"> {
  const nodeByKey = new Map(nodes.map((node) => [node.key, node]));
  const nextDrift: Record<string, StoryboardDriftBadge> = {
    ...state.driftBadges,
    ...driftOverrides,
  };
  for (const node of nodes) {
    if (node.id.prefix !== "CUT") continue;
    const prev = nextDrift[node.key];
    if (!prev) {
      nextDrift[node.key] = {
        cutId: node.key,
        canvasContentHash: node.contentHash,
        syncedScriptHash: node.contentHash,
        isStale: false,
        lastSyncedAt: node.updatedAt,
      };
    } else {
      const scriptDrifted = prev.syncedScriptHash !== node.contentHash;
      const canvasDrifted = prev.canvasContentHash !== prev.syncedScriptHash;
      nextDrift[node.key] = {
        ...prev,
        isStale: scriptDrifted || canvasDrifted,
      };
    }
  }
  const nextFindings = state.reviewFindings.map((finding) => {
    const node = nodeByKey.get(finding.targetNodeKey);
    const isStale = !node || node.contentHash !== finding.evaluatedNodeHash;
    return isStale === finding.isStale ? finding : { ...finding, isStale };
  });
  return { driftBadges: nextDrift, reviewFindings: nextFindings };
}

export function updateCutReadinessSlot(
  state: StoryLivingSpecState,
  nodeKey: string,
  slotKey: CutReadinessSlotKey,
  value: string | readonly string[],
  now = "2026-11-20T00:00:00.000Z",
): StoryLivingSpecState {
  const idx = findStoryNodeIndex(state.nodes, nodeKey);
  if (idx < 0) return state;
  const target = state.nodes[idx];
  if (!target) return state;
  const currentSlots = target.cutSlots ?? createEmptyCutReadinessSlots();
  const nextSlots: CutReadinessSlots =
    slotKey === "actors"
      ? {
          ...currentSlots,
          actors: Array.isArray(value)
            ? value.map((item) => item.trim()).filter(Boolean)
            : String(value)
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
        }
      : {
          ...currentSlots,
          [slotKey]: Array.isArray(value) ? value.join(", ") : value,
        };
  const updated: StoryLivingNode = {
    ...target,
    cutSlots: nextSlots,
    updatedAt: now,
    contentHash: computeStoryNodeContentHash({ ...target, cutSlots: nextSlots }),
  };
  const nodes = state.nodes.map((node, i) => (i === idx ? updated : node));
  const refreshed = refreshStoryDriftAndStaleFindings(state, nodes);
  return {
    ...state,
    ...refreshed,
    nodes,
    sequence: state.sequence + 1,
    workLog: appendStoryWorkLog(state, {
      at: now,
      actor: "creator",
      action: "slot_updated",
      targetEntityId: updated.key,
      summary: `${updated.id.code}의 ${slotKey} 슬롯을 갱신했습니다.`,
    }),
  };
}

export function toggleCutReadinessSlotVisibility(
  state: StoryLivingSpecState,
  nodeKey: string,
  slotKey: CutReadinessSlotKey,
): StoryLivingSpecState {
  const idx = findStoryNodeIndex(state.nodes, nodeKey);
  if (idx < 0) return state;
  const target = state.nodes[idx];
  if (!target) return state;
  const currentSlots = target.cutSlots ?? createEmptyCutReadinessSlots();
  const hiddenSet = new Set(currentSlots.hiddenSlots);
  if (hiddenSet.has(slotKey)) {
    hiddenSet.delete(slotKey);
  } else {
    hiddenSet.add(slotKey);
  }
  const nextSlots: CutReadinessSlots = {
    ...currentSlots,
    hiddenSlots: CUT_READINESS_SLOT_KEYS.filter((key) => hiddenSet.has(key)),
  };
  const updated: StoryLivingNode = {
    ...target,
    cutSlots: nextSlots,
    contentHash: computeStoryNodeContentHash({ ...target, cutSlots: nextSlots }),
  };
  const nodes = state.nodes.map((node, i) => (i === idx ? updated : node));
  return { ...state, nodes, sequence: state.sequence + 1 };
}

export function answerCutReadinessQuestion(
  state: StoryLivingSpecState,
  nodeKey: string,
  questionId: string,
  optionIndex: number,
  now = "2026-11-20T00:00:00.000Z",
): StoryLivingSpecState {
  const idx = findStoryNodeIndex(state.nodes, nodeKey);
  if (idx < 0) return state;
  const target = state.nodes[idx];
  if (!target?.cutSlots) return state;
  const question = target.cutSlots.openQuestions.find((item) => item.id === questionId);
  if (!question) return state;
  const chosen = question.options[optionIndex];
  if (chosen === undefined) return state;
  const remaining = target.cutSlots.openQuestions.filter((item) => item.id !== questionId);
  const nextSlots: CutReadinessSlots =
    question.slot === "actors"
      ? {
          ...target.cutSlots,
          actors: chosen
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          openQuestions: remaining,
        }
      : {
          ...target.cutSlots,
          [question.slot]: chosen,
          openQuestions: remaining,
        };
  const updated: StoryLivingNode = {
    ...target,
    cutSlots: nextSlots,
    updatedAt: now,
    contentHash: computeStoryNodeContentHash({ ...target, cutSlots: nextSlots }),
  };
  const nodes = state.nodes.map((node, i) => (i === idx ? updated : node));
  const refreshed = refreshStoryDriftAndStaleFindings(state, nodes);
  return {
    ...state,
    ...refreshed,
    nodes,
    sequence: state.sequence + 1,
    workLog: appendStoryWorkLog(state, {
      at: now,
      actor: "creator",
      action: "slot_updated",
      targetEntityId: updated.key,
      summary: `미정 질문 응답으로 ${updated.id.code}의 ${question.slot} 항목을 확정했습니다.`,
    }),
  };
}

export function recordCanvasContentChange(
  state: StoryLivingSpecState,
  cutKey: string,
  nextCanvasContentHash: string,
): StoryLivingSpecState {
  const idx = findStoryNodeIndex(state.nodes, cutKey);
  if (idx < 0) return state;
  const target = state.nodes[idx];
  if (!target || target.id.prefix !== "CUT") return state;
  const prev = state.driftBadges[target.key];
  const syncedScriptHash = prev?.syncedScriptHash ?? target.contentHash;
  const isStale =
    nextCanvasContentHash !== syncedScriptHash || target.contentHash !== syncedScriptHash;
  return {
    ...state,
    driftBadges: {
      ...state.driftBadges,
      [target.key]: {
        cutId: target.key,
        canvasContentHash: nextCanvasContentHash,
        syncedScriptHash,
        isStale,
        lastSyncedAt: prev?.lastSyncedAt,
      },
    },
    sequence: state.sequence + 1,
  };
}

export function syncCutDriftBadge(
  state: StoryLivingSpecState,
  cutKey: string,
  now = "2026-11-20T00:00:00.000Z",
): StoryLivingSpecState {
  const idx = findStoryNodeIndex(state.nodes, cutKey);
  if (idx < 0) return state;
  const target = state.nodes[idx];
  if (!target || target.id.prefix !== "CUT") return state;
  return {
    ...state,
    driftBadges: {
      ...state.driftBadges,
      [target.key]: {
        cutId: target.key,
        canvasContentHash: target.contentHash,
        syncedScriptHash: target.contentHash,
        isStale: false,
        lastSyncedAt: now,
      },
    },
    sequence: state.sequence + 1,
    workLog: appendStoryWorkLog(state, {
      at: now,
      actor: "creator",
      action: "drift_synced",
      targetEntityId: target.key,
      summary: `${target.id.code} 컷 캔버스와 대본 기준을 다시 맞췄습니다.`,
    }),
  };
}

export function evaluateDriftBadges(
  state: StoryLivingSpecState,
): readonly StoryboardDriftBadge[] {
  return state.nodes
    .filter((node) => node.id.prefix === "CUT")
    .map((node) => {
      const existing = state.driftBadges[node.key];
      if (!existing) {
        return {
          cutId: node.key,
          canvasContentHash: node.contentHash,
          syncedScriptHash: node.contentHash,
          isStale: false,
          lastSyncedAt: node.updatedAt,
        };
      }
      return {
        ...existing,
        isStale:
          existing.syncedScriptHash !== node.contentHash ||
          existing.canvasContentHash !== existing.syncedScriptHash,
      };
    });
}

const PREFIX_COLUMN: Readonly<Record<StoryNodePrefix, number>> = Object.freeze({
  ARC: 0,
  EP: 1,
  BEAT: 2,
  CUT: 3,
  CHAR: 4,
  LOC: 4,
  RULE: 4,
});

/** 150노드 이상에서도 < 5ms로 끝나는 계층형 그래프 좌표 계산. */
export function buildStoryGraphLayout(
  nodes: readonly StoryLivingNode[],
): readonly StoryGraphLayoutNode[] {
  const rowCounts = new Map<number, number>();
  return [...nodes]
    .sort((a, b) => PREFIX_COLUMN[a.id.prefix] - PREFIX_COLUMN[b.id.prefix] || a.order - b.order)
    .map((node) => {
      const column = PREFIX_COLUMN[node.id.prefix];
      const row = rowCounts.get(column) ?? 0;
      rowCounts.set(column, row + 1);
      return {
        node,
        column,
        row,
        x: 24 + column * 220,
        y: 24 + row * 124,
      };
    });
}
