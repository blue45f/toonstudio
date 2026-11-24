/**
 * 습관 학습 적응형 워크벤치 엔진 (Wave 40A).
 *
 * 사용자의 도구 전환 이력을 순수 인메모리 1차 마르코프 전이 행렬(Markov 1st-order matrix)로 학습해
 * 자주 이어 쓰는 도구 쌍, 왼손 단축키 승격안, 툴바 인접 배치안을 계산한다.
 * 핵심 불변 조건:
 * - 브라우저 영속 스토리지를 일절 사용하지 않는 순수 인메모리 불변 상태 모델.
 * - 사용자 명시 승인(applyWorkbenchProposal) 전에는 activeToolbarOrder/activeShortcuts를 절대 변경하지 않는다.
 * - preview → apply → revert 3단계 옵트인 안전 흐름을 강제한다.
 */

export type WorkbenchToolId =
  | "gpen"
  | "eraser"
  | "fill"
  | "watercolor"
  | "lasso"
  | "eyedropper"
  | "balloon"
  | "transform";

export type WorkbenchApprovalStatus = "idle" | "previewing" | "applied" | "reverted";

export interface WorkbenchToolSpec {
  readonly id: WorkbenchToolId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly categoryKo: string;
  readonly categoryEn: string;
  readonly defaultShortcut: string;
  readonly isRightHandDistant: boolean;
}

export interface ToolTransitionPair {
  readonly fromToolId: WorkbenchToolId;
  readonly toToolId: WorkbenchToolId;
  readonly count: number;
  readonly probability: number;
  readonly reverseCount: number;
  readonly bidirectionalAffinity: number;
  readonly rationaleKo: string;
  readonly rationaleEn: string;
}

export interface ShortcutPromotionSuggestion {
  readonly toolId: WorkbenchToolId;
  readonly currentShortcut: string;
  readonly suggestedShortcut: string;
  readonly usageCount: number;
  readonly partnerToolId: WorkbenchToolId | null;
  readonly reasonKo: string;
  readonly reasonEn: string;
}

export interface AdaptiveWorkbenchProposal {
  readonly generatedAtTransitionCount: number;
  readonly minTransitionsRequired: number;
  readonly readyForProposal: boolean;
  readonly hasActionableChanges: boolean;
  readonly topTransitions: readonly ToolTransitionPair[];
  readonly shortcutPromotions: readonly ShortcutPromotionSuggestion[];
  readonly proposedToolbarOrder: readonly WorkbenchToolId[];
  readonly proposedShortcuts: Readonly<Record<WorkbenchToolId, string>>;
  readonly currentWeightedTravel: number;
  readonly proposedWeightedTravel: number;
  readonly estimatedTravelReductionPct: number;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface ToolUsageEvent {
  readonly toolId: WorkbenchToolId;
  readonly timestampMs: number;
}

export interface AdaptiveWorkbenchState {
  readonly tools: readonly WorkbenchToolSpec[];
  readonly baselineToolbarOrder: readonly WorkbenchToolId[];
  readonly baselineShortcuts: Readonly<Record<WorkbenchToolId, string>>;
  readonly activeToolbarOrder: readonly WorkbenchToolId[];
  readonly activeShortcuts: Readonly<Record<WorkbenchToolId, string>>;
  readonly previousToolbarOrder: readonly WorkbenchToolId[] | null;
  readonly previousShortcuts: Readonly<Record<WorkbenchToolId, string>> | null;
  readonly usageCounts: Readonly<Record<WorkbenchToolId, number>>;
  readonly transitionMatrix: Readonly<Record<WorkbenchToolId, Readonly<Record<WorkbenchToolId, number>>>>;
  readonly lastToolId: WorkbenchToolId | null;
  readonly totalToolActivations: number;
  readonly totalTransitions: number;
  readonly recentHistory: readonly ToolUsageEvent[];
  readonly approvalStatus: WorkbenchApprovalStatus;
  readonly pendingProposal: AdaptiveWorkbenchProposal | null;
  readonly appliedCount: number;
}

export interface ArtistHabitScenarioSpec {
  readonly id: "inking-cleanup" | "watercolor-shading" | "lettering-finish";
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly sequence: readonly WorkbenchToolId[];
}

export const WORKBENCH_TOOL_IDS: readonly WorkbenchToolId[] = [
  "gpen",
  "eraser",
  "fill",
  "watercolor",
  "lasso",
  "eyedropper",
  "balloon",
  "transform",
] as const;

export const DEFAULT_WORKBENCH_TOOLS: readonly WorkbenchToolSpec[] = [
  {
    id: "gpen",
    labelKo: "지펜 선화",
    labelEn: "G-Pen Ink",
    categoryKo: "선화",
    categoryEn: "Ink",
    defaultShortcut: "P",
    isRightHandDistant: true,
  },
  {
    id: "eraser",
    labelKo: "지우개",
    labelEn: "Eraser",
    categoryKo: "보정",
    categoryEn: "Erase",
    defaultShortcut: "E",
    isRightHandDistant: false,
  },
  {
    id: "fill",
    labelKo: "채우기",
    labelEn: "Fill Bucket",
    categoryKo: "채색",
    categoryEn: "Color",
    defaultShortcut: "G",
    isRightHandDistant: false,
  },
  {
    id: "watercolor",
    labelKo: "수채 붓",
    labelEn: "Watercolor",
    categoryKo: "채색",
    categoryEn: "Color",
    defaultShortcut: "B",
    isRightHandDistant: false,
  },
  {
    id: "lasso",
    labelKo: "올가미 선택",
    labelEn: "Lasso Select",
    categoryKo: "선택",
    categoryEn: "Select",
    defaultShortcut: "L",
    isRightHandDistant: true,
  },
  {
    id: "eyedropper",
    labelKo: "스포이드",
    labelEn: "Eyedropper",
    categoryKo: "색상",
    categoryEn: "Sample",
    defaultShortcut: "I",
    isRightHandDistant: true,
  },
  {
    id: "balloon",
    labelKo: "말풍선",
    labelEn: "Speech Balloon",
    categoryKo: "식자",
    categoryEn: "Lettering",
    defaultShortcut: "T",
    isRightHandDistant: true,
  },
  {
    id: "transform",
    labelKo: "자유 변형",
    labelEn: "Free Transform",
    categoryKo: "편집",
    categoryEn: "Edit",
    defaultShortcut: "V",
    isRightHandDistant: false,
  },
] as const;

export const DEFAULT_HABIT_SCENARIOS: readonly ArtistHabitScenarioSpec[] = [
  {
    id: "inking-cleanup",
    labelKo: "선화·정리 루틴 (지펜↔지우개·올가미)",
    labelEn: "Inking Cleanup (G-Pen ↔ Eraser · Lasso)",
    descriptionKo: "지펜으로 선을 긋고 지우개·올가미·자유 변형을 반복 전환하는 웹툰 선화 공정",
    descriptionEn: "Alternating G-Pen ink, eraser cleanup, lasso selection, and quick transform adjustments",
    sequence: [
      "gpen", "lasso", "transform", "gpen", "eraser", "gpen", "lasso",
      "transform", "gpen", "eraser", "gpen", "lasso", "gpen", "eraser",
      "gpen", "lasso", "transform",
    ],
  },
  {
    id: "watercolor-shading",
    labelKo: "수채·채색 루틴 (수채↔스포이드·채우기)",
    labelEn: "Watercolor Shading (Brush ↔ Eyedropper · Fill)",
    descriptionKo: "수채 붓과 스포이드를 오가며 올가미·채우기로 면을 채색하는 컬러 공정",
    descriptionEn: "Rapid color sampling with eyedropper paired with watercolor brush and lasso fills",
    sequence: [
      "watercolor", "eyedropper", "watercolor", "eyedropper", "lasso", "fill",
      "watercolor", "eyedropper", "watercolor", "eyedropper", "lasso", "fill",
      "watercolor", "eyedropper", "watercolor", "eraser",
    ],
  },
  {
    id: "lettering-finish",
    labelKo: "식자·마감 루틴 (말풍선↔변형·지펜)",
    labelEn: "Lettering Finish (Balloon ↔ Transform · G-Pen)",
    descriptionKo: "말풍선 배치 후 자유 변형과 지펜 말꼬리 보정을 반복하는 마감 공정",
    descriptionEn: "Placing speech balloons, refining scale with transform, and touching tails with G-Pen",
    sequence: [
      "balloon", "transform", "balloon", "gpen", "balloon", "transform",
      "balloon", "transform", "gpen", "balloon", "transform", "eraser",
      "balloon", "transform", "gpen",
    ],
  },
];

const ERGONOMIC_LEFT_HAND_KEYS: readonly string[] = ["Q", "W", "A", "S", "D", "F"] as const;
const MAX_HISTORY_ENTRIES = 64;

function createEmptyCounts(): Record<WorkbenchToolId, number> {
  return {
    gpen: 0,
    eraser: 0,
    fill: 0,
    watercolor: 0,
    lasso: 0,
    eyedropper: 0,
    balloon: 0,
    transform: 0,
  };
}

function createEmptyTransitionMatrix(): Record<WorkbenchToolId, Record<WorkbenchToolId, number>> {
  return {
    gpen: createEmptyCounts(),
    eraser: createEmptyCounts(),
    fill: createEmptyCounts(),
    watercolor: createEmptyCounts(),
    lasso: createEmptyCounts(),
    eyedropper: createEmptyCounts(),
    balloon: createEmptyCounts(),
    transform: createEmptyCounts(),
  };
}

function createShortcutMap(tools: readonly WorkbenchToolSpec[]): Record<WorkbenchToolId, string> {
  const result: Record<WorkbenchToolId, string> = {
    gpen: "P",
    eraser: "E",
    fill: "G",
    watercolor: "B",
    lasso: "L",
    eyedropper: "I",
    balloon: "T",
    transform: "V",
  };
  for (const tool of tools) {
    result[tool.id] = tool.defaultShortcut;
  }
  return result;
}

function findToolSpec(tools: readonly WorkbenchToolSpec[], id: WorkbenchToolId): WorkbenchToolSpec {
  const found = tools.find((item) => item.id === id);
  if (found) return found;
  return {
    id,
    labelKo: id,
    labelEn: id,
    categoryKo: "도구",
    categoryEn: "Tool",
    defaultShortcut: "?",
    isRightHandDistant: false,
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function computeWeightedTravel(
  order: readonly WorkbenchToolId[],
  matrix: Readonly<Record<WorkbenchToolId, Readonly<Record<WorkbenchToolId, number>>>>,
): number {
  const pos = new Map<WorkbenchToolId, number>();
  order.forEach((id, index) => pos.set(id, index));

  let total = 0;
  for (const fromId of WORKBENCH_TOOL_IDS) {
    const row = matrix[fromId];
    const fromPos = pos.get(fromId) ?? 0;
    for (const toId of WORKBENCH_TOOL_IDS) {
      if (fromId === toId) continue;
      const count = row[toId] ?? 0;
      if (count <= 0) continue;
      const toPos = pos.get(toId) ?? 0;
      total += count * Math.abs(fromPos - toPos);
    }
  }
  return total;
}

function arraysEqual(a: readonly WorkbenchToolId[], b: readonly WorkbenchToolId[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function shortcutsEqual(
  a: Readonly<Record<WorkbenchToolId, string>>,
  b: Readonly<Record<WorkbenchToolId, string>>,
): boolean {
  for (const id of WORKBENCH_TOOL_IDS) {
    if (a[id] !== b[id]) return false;
  }
  return true;
}

/** 순수 인메모리 적응형 워크벤치 초기 상태 생성. */
export function createAdaptiveWorkbenchState(
  initialTools: readonly WorkbenchToolSpec[] = DEFAULT_WORKBENCH_TOOLS,
): AdaptiveWorkbenchState {
  const tools = [...initialTools];
  const order = tools.map((item) => item.id);
  const shortcuts = createShortcutMap(tools);

  return {
    tools,
    baselineToolbarOrder: order,
    baselineShortcuts: shortcuts,
    activeToolbarOrder: [...order],
    activeShortcuts: { ...shortcuts },
    previousToolbarOrder: null,
    previousShortcuts: null,
    usageCounts: createEmptyCounts(),
    transitionMatrix: createEmptyTransitionMatrix(),
    lastToolId: null,
    totalToolActivations: 0,
    totalTransitions: 0,
    recentHistory: [],
    approvalStatus: "idle",
    pendingProposal: null,
    appliedCount: 0,
  };
}

/**
 * 단일 도구 사용 이벤트를 순수 인메모리 1차 마르코프 행렬에 기록한다.
 * 이 함수는 activeToolbarOrder나 activeShortcuts를 절대 변경하지 않는다.
 */
export function recordToolUsage(
  state: AdaptiveWorkbenchState,
  toolId: WorkbenchToolId,
  timestampMs?: number,
): AdaptiveWorkbenchState {
  const nextCounts: Record<WorkbenchToolId, number> = {
    ...state.usageCounts,
    [toolId]: (state.usageCounts[toolId] ?? 0) + 1,
  };

  let nextMatrix = state.transitionMatrix;
  let nextTotalTransitions = state.totalTransitions;

  if (state.lastToolId !== null && state.lastToolId !== toolId) {
    const prevId = state.lastToolId;
    const prevRow = state.transitionMatrix[prevId];
    nextMatrix = {
      ...state.transitionMatrix,
      [prevId]: {
        ...prevRow,
        [toolId]: (prevRow[toolId] ?? 0) + 1,
      },
    };
    nextTotalTransitions += 1;
  }

  const nextTime =
    timestampMs !== undefined && Number.isFinite(timestampMs)
      ? timestampMs
      : (state.recentHistory[state.recentHistory.length - 1]?.timestampMs ?? 0) + 450;

  const nextHistory = [...state.recentHistory, { toolId, timestampMs: nextTime }].slice(
    -MAX_HISTORY_ENTRIES,
  );

  return {
    ...state,
    usageCounts: nextCounts,
    transitionMatrix: nextMatrix,
    lastToolId: toolId,
    totalToolActivations: state.totalToolActivations + 1,
    totalTransitions: nextTotalTransitions,
    recentHistory: nextHistory,
  };
}

/** 다수의 도구 전환 시퀀스를 순차 기록한다(실제 배치는 여전히 미변경 유지). */
export function recordToolSequence(
  state: AdaptiveWorkbenchState,
  toolIds: readonly WorkbenchToolId[],
  startTimestampMs = 1000,
): AdaptiveWorkbenchState {
  let cursor = state;
  for (let i = 0; i < toolIds.length; i += 1) {
    const toolId = toolIds[i];
    if (!toolId) continue;
    cursor = recordToolUsage(cursor, toolId, startTimestampMs + i * 420);
  }
  return cursor;
}

/**
 * 현재 인메모리 1차 마르코프 행렬에서 상위 전환 쌍, 단축키 승격안, 툴바 인접 배치안을 계산한다.
 */
export function buildWorkbenchProposal(
  state: AdaptiveWorkbenchState,
  options?: { readonly minTransitions?: number; readonly maxShortcutPromotions?: number },
): AdaptiveWorkbenchProposal {
  const minTransitionsRequired = Math.max(2, Math.trunc(options?.minTransitions ?? 5));
  const maxShortcutPromotions = Math.max(1, Math.min(4, Math.trunc(options?.maxShortcutPromotions ?? 2)));

  // 1차 마르코프 조건부 확률 P(to | from) 및 양방향 친화도 집계
  const pairs: ToolTransitionPair[] = [];
  for (const fromId of WORKBENCH_TOOL_IDS) {
    const row = state.transitionMatrix[fromId];
    const rowSum = WORKBENCH_TOOL_IDS.reduce((acc, id) => acc + (row[id] ?? 0), 0);
    if (rowSum <= 0) continue;

    for (const toId of WORKBENCH_TOOL_IDS) {
      if (fromId === toId) continue;
      const count = row[toId] ?? 0;
      if (count <= 0) continue;
      const reverseCount = state.transitionMatrix[toId][fromId] ?? 0;
      const probability = round3(count / rowSum);
      const fromSpec = findToolSpec(state.tools, fromId);
      const toSpec = findToolSpec(state.tools, toId);

      pairs.push({
        fromToolId: fromId,
        toToolId: toId,
        count,
        probability,
        reverseCount,
        bidirectionalAffinity: count + reverseCount,
        rationaleKo: `${fromSpec.labelKo} 사용 후 ${Math.round(probability * 100)}% 확률로 ${toSpec.labelKo}로 전환됨 (${count}회)`,
        rationaleEn: `Switched from ${fromSpec.labelEn} to ${toSpec.labelEn} ${Math.round(probability * 100)}% of the time (${count}x)`,
      });
    }
  }

  pairs.sort((a, b) => {
    if (b.bidirectionalAffinity !== a.bidirectionalAffinity) {
      return b.bidirectionalAffinity - a.bidirectionalAffinity;
    }
    if (b.count !== a.count) return b.count - a.count;
    return `${a.fromToolId}:${a.toToolId}`.localeCompare(`${b.fromToolId}:${b.toToolId}`);
  });

  const topTransitions = pairs.slice(0, 5);
  const currentWeightedTravel = computeWeightedTravel(state.activeToolbarOrder, state.transitionMatrix);
  const readyForProposal = state.totalTransitions >= minTransitionsRequired;

  if (!readyForProposal) {
    return {
      generatedAtTransitionCount: state.totalTransitions,
      minTransitionsRequired,
      readyForProposal: false,
      hasActionableChanges: false,
      topTransitions,
      shortcutPromotions: [],
      proposedToolbarOrder: [...state.activeToolbarOrder],
      proposedShortcuts: { ...state.activeShortcuts },
      currentWeightedTravel,
      proposedWeightedTravel: currentWeightedTravel,
      estimatedTravelReductionPct: 0,
      summaryKo: `도구 전환이 ${minTransitionsRequired}회 이상 누적되면 맞춤 배치안을 제안합니다 (현재 ${state.totalTransitions}회).`,
      summaryEn: `Record at least ${minTransitionsRequired} tool switches to unlock tailored layout proposals (currently ${state.totalTransitions}).`,
    };
  }

  // 탐욕적 최대 친화도 체이닝으로 인접 도구 배치 후보 산출
  const baselineIndex = new Map<WorkbenchToolId, number>();
  state.baselineToolbarOrder.forEach((id, idx) => baselineIndex.set(id, idx));

  const remaining = new Set<WorkbenchToolId>(state.activeToolbarOrder);
  const chainedOrder: WorkbenchToolId[] = [];

  // 시드 도구: 총 사용 빈도가 가장 높은 도구
  const rankedByUsage = [...remaining].sort((a, b) => {
    const diff = (state.usageCounts[b] ?? 0) - (state.usageCounts[a] ?? 0);
    if (diff !== 0) return diff;
    return (baselineIndex.get(a) ?? 0) - (baselineIndex.get(b) ?? 0);
  });

  const firstTool = rankedByUsage[0];
  if (firstTool) {
    chainedOrder.push(firstTool);
    remaining.delete(firstTool);
  }

  while (remaining.size > 0) {
    const anchor = chainedOrder[chainedOrder.length - 1];
    const candidates = [...remaining];
    candidates.sort((a, b) => {
      const affA = anchor
        ? (state.transitionMatrix[anchor][a] ?? 0) + (state.transitionMatrix[a][anchor] ?? 0)
        : 0;
      const affB = anchor
        ? (state.transitionMatrix[anchor][b] ?? 0) + (state.transitionMatrix[b][anchor] ?? 0)
        : 0;
      if (affB !== affA) return affB - affA;

      const useDiff = (state.usageCounts[b] ?? 0) - (state.usageCounts[a] ?? 0);
      if (useDiff !== 0) return useDiff;
      return (baselineIndex.get(a) ?? 0) - (baselineIndex.get(b) ?? 0);
    });
    const nextPick = candidates[0];
    if (!nextPick) break;
    chainedOrder.push(nextPick);
    remaining.delete(nextPick);
  }

  const candidateTravel = computeWeightedTravel(chainedOrder, state.transitionMatrix);
  const shouldAdoptOrder = candidateTravel < currentWeightedTravel;
  const proposedToolbarOrder = shouldAdoptOrder ? chainedOrder : [...state.activeToolbarOrder];
  const proposedWeightedTravel = shouldAdoptOrder ? candidateTravel : currentWeightedTravel;
  const estimatedTravelReductionPct =
    currentWeightedTravel > 0 && shouldAdoptOrder
      ? Math.max(0, Math.round(((currentWeightedTravel - proposedWeightedTravel) / currentWeightedTravel) * 100))
      : 0;

  // 오른손 원거리 키(P/I/L/T) 중 고빈도 도구를 왼손 홈로우(Q/W/A/S/D/F)로 충돌 없이 승격 제안
  const proposedShortcuts: Record<WorkbenchToolId, string> = { ...state.activeShortcuts };
  const occupiedKeys = new Set<string>(Object.values(proposedShortcuts).map((k) => k.toUpperCase()));
  const shortcutPromotions: ShortcutPromotionSuggestion[] = [];

  const distantHighFreqTools = state.tools
    .filter((spec) => spec.isRightHandDistant && (state.usageCounts[spec.id] ?? 0) >= 2)
    .filter((spec) => !ERGONOMIC_LEFT_HAND_KEYS.includes((state.activeShortcuts[spec.id] ?? "").toUpperCase()))
    .sort((a, b) => (state.usageCounts[b.id] ?? 0) - (state.usageCounts[a.id] ?? 0));

  for (const spec of distantHighFreqTools) {
    if (shortcutPromotions.length >= maxShortcutPromotions) break;
    const freeKey = ERGONOMIC_LEFT_HAND_KEYS.find((key) => !occupiedKeys.has(key));
    if (!freeKey) break;

    const currentShortcut = state.activeShortcuts[spec.id];
    occupiedKeys.delete(currentShortcut.toUpperCase());
    occupiedKeys.add(freeKey);
    proposedShortcuts[spec.id] = freeKey;

    const partnerPair = topTransitions.find(
      (pair) => pair.fromToolId === spec.id || pair.toToolId === spec.id,
    );
    const partnerToolId = partnerPair
      ? partnerPair.fromToolId === spec.id
        ? partnerPair.toToolId
        : partnerPair.fromToolId
      : null;
    const partnerSpec = partnerToolId ? findToolSpec(state.tools, partnerToolId) : null;

    shortcutPromotions.push({
      toolId: spec.id,
      currentShortcut,
      suggestedShortcut: freeKey,
      usageCount: state.usageCounts[spec.id] ?? 0,
      partnerToolId,
      reasonKo: partnerSpec
        ? `${partnerSpec.labelKo}와 자주 교차하는 ${spec.labelKo}을(를) 왼손 홈키 ${freeKey}로 승격`
        : `고빈도 도구 ${spec.labelKo}을(를) 왼손 즉시 호출 키 ${freeKey}로 승격`,
      reasonEn: partnerSpec
        ? `Promote ${spec.labelEn} (paired often with ${partnerSpec.labelEn}) to left-hand key ${freeKey}`
        : `Promote frequent tool ${spec.labelEn} to ergonomic left-hand key ${freeKey}`,
    });
  }

  const orderChanged = !arraysEqual(state.activeToolbarOrder, proposedToolbarOrder);
  const shortcutsChanged = !shortcutsEqual(state.activeShortcuts, proposedShortcuts);
  const hasActionableChanges = orderChanged || shortcutsChanged;

  const summaryKo = hasActionableChanges
    ? `동선 ${estimatedTravelReductionPct}% 단축 배치안 · 왼손 단축키 승격 ${shortcutPromotions.length}건 준비됨 (승인 전 미반영)`
    : "현재 툴바 배치와 단축키가 최근 작업 습관에 이미 최적화되어 있습니다.";
  const summaryEn = hasActionableChanges
    ? `Proposal cuts toolbar travel by ${estimatedTravelReductionPct}% with ${shortcutPromotions.length} ergonomic shortcut promotion(s) (opt-in preview).`
    : "Active toolbar order and shortcuts already match your observed workflow.";

  return {
    generatedAtTransitionCount: state.totalTransitions,
    minTransitionsRequired,
    readyForProposal: true,
    hasActionableChanges,
    topTransitions,
    shortcutPromotions,
    proposedToolbarOrder,
    proposedShortcuts,
    currentWeightedTravel,
    proposedWeightedTravel,
    estimatedTravelReductionPct,
    summaryKo,
    summaryEn,
  };
}

/**
 * 제안안을 미리보기 상태로 전환한다.
 * 중요: 미리보기 단계에서는 실제 activeToolbarOrder와 activeShortcuts를 절대 수정하지 않는다.
 */
export function previewWorkbenchProposal(
  state: AdaptiveWorkbenchState,
  proposal?: AdaptiveWorkbenchProposal,
): AdaptiveWorkbenchState {
  const nextProposal = proposal ?? buildWorkbenchProposal(state);
  return {
    ...state,
    approvalStatus: "previewing",
    pendingProposal: nextProposal,
  };
}

/**
 * 사용자가 명시적으로 승인했을 때만 제안된 툴바 순서와 단축키를 실제 워크벤치에 반영한다.
 */
export function applyWorkbenchProposal(state: AdaptiveWorkbenchState): AdaptiveWorkbenchState {
  const proposal = state.pendingProposal ?? buildWorkbenchProposal(state);
  if (!proposal.readyForProposal || !proposal.hasActionableChanges) {
    return {
      ...state,
      approvalStatus: "idle",
      pendingProposal: null,
    };
  }

  return {
    ...state,
    previousToolbarOrder: [...state.activeToolbarOrder],
    previousShortcuts: { ...state.activeShortcuts },
    activeToolbarOrder: [...proposal.proposedToolbarOrder],
    activeShortcuts: { ...proposal.proposedShortcuts },
    approvalStatus: "applied",
    pendingProposal: null,
    appliedCount: state.appliedCount + 1,
  };
}

/** 승인 적용 직전의 툴바 순서와 단축키(또는 초기 기본값)로 즉시 되돌린다. */
export function revertWorkbenchLayout(state: AdaptiveWorkbenchState): AdaptiveWorkbenchState {
  const targetOrder = state.previousToolbarOrder ?? state.baselineToolbarOrder;
  const targetShortcuts = state.previousShortcuts ?? state.baselineShortcuts;

  return {
    ...state,
    activeToolbarOrder: [...targetOrder],
    activeShortcuts: { ...targetShortcuts },
    previousToolbarOrder: null,
    previousShortcuts: null,
    approvalStatus: "reverted",
    pendingProposal: null,
  };
}

/** 제안 미리보기를 거부·닫기하며 실제 배치는 유지한다. */
export function dismissWorkbenchProposal(state: AdaptiveWorkbenchState): AdaptiveWorkbenchState {
  return {
    ...state,
    approvalStatus: "idle",
    pendingProposal: null,
  };
}

/** 인메모리 학습 이력과 툴바 배치를 초기 상태로 완전히 리셋한다. */
export function resetWorkbenchLearning(state: AdaptiveWorkbenchState): AdaptiveWorkbenchState {
  return createAdaptiveWorkbenchState(state.tools);
}
