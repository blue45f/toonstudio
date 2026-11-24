/**
 * 온디바이스 로컬 크리에이터 습관 학습 코어 엔진 (Wave 31 Track D: Local Creator Copilot).
 *
 * 설계 계약:
 * - 외부 서버 전송 0바이트 · 외부 네트워크 호출 0건 (100% 온디바이스 순수 TS · OPFS 스냅샷 호환).
 * - OKLCH 군집화(5색 시그니처 팔레트) · 브러시 전이 마르코프 체인 · 선호 컷 비율/배치 · 반복 매크로 1클릭 자동화.
 * - 완전 옵트인(기본 비활성) · 1클릭 초기화(`wipeLocalHabits`) · JSON 내보내기/가져오기.
 */

import {
  COLOR_USAGE_LABELS,
  LOCAL_COPILOT_PRIVACY_CONTRACT,
  LOCAL_HABIT_SNAPSHOT_SCHEMA_VERSION,
  MAX_ACTION_HISTORY,
  MAX_COLOR_OBSERVATIONS,
  PANEL_ANCHOR_LABELS,
  clampNumber,
  classifyOklchHueFamily,
  formatCssOklch,
  isPanelAspectRatioKey,
  isPanelLayoutAnchor,
  isSafeHabitKey,
  oklabDistanceSq,
  oklabToOklch,
  oklchToOklab,
  roundToDigits,
  sanitizeHabitKey,
  sanitizeOklchColor,
  type ActionDescriptor,
  type BrushDescriptor,
  type ColorUsageKind,
  type CreatorHabitEvent,
  type LocalCopilotInsights,
  type LocalCreatorHabitState,
  type MacroExecutionReceipt,
  type NextBrushCandidate,
  type NextBrushSuggestion,
  type OklabPoint,
  type PreferredPanelLayoutHabit,
  type RecordHabitEventResult,
  type RepeatedMacroSuggestion,
  type SignatureColorSwatch,
  type SignaturePaletteSuggestion,
  type StoredColorObservation,
} from "./local-habit-types";
import { SAMPLE_CREATOR_WORKFLOW_EVENTS } from "./local-habit-storage";

export {
  LOCAL_COPILOT_PRIVACY_CONTRACT,
  LOCAL_HABIT_OPFS_DIR,
  LOCAL_HABIT_OPFS_FILE,
  LOCAL_HABIT_SNAPSHOT_SCHEMA_VERSION,
  PANEL_ANCHOR_KEYS,
  PANEL_ASPECT_KEYS,
  computeOklabDistance,
  formatCssOklch,
  sanitizeOklchColor,
  type ActionDescriptor,
  type BrushDescriptor,
  type BrushSelectedHabitEvent,
  type BrushWorkflowStage,
  type ColorUsageKind,
  type ColorUsedHabitEvent,
  type CreatorHabitEvent,
  type ExplainableEvidence,
  type ImportLocalHabitsResult,
  type LocalCopilotInsights,
  type LocalCreatorHabitState,
  type MacroExecutionReceipt,
  type NextBrushCandidate,
  type NextBrushSuggestion,
  type OklchColor,
  type OpfsDirectoryHandleLike,
  type OpfsFileHandleLike,
  type OpfsSnapshotLoadResult,
  type OpfsSnapshotSaveResult,
  type OpfsStorageManagerLike,
  type OpfsWritableLike,
  type PanelAspectRatioKey,
  type PanelCreatedHabitEvent,
  type PanelLayoutAnchor,
  type PreferredPanelLayoutHabit,
  type RecordHabitEventResult,
  type RepeatedMacroSuggestion,
  type SignatureColorSwatch,
  type SignaturePaletteSuggestion,
  type StoredColorObservation,
  type StudioActionCategory,
  type StudioActionHabitEvent,
} from "./local-habit-types";

export {
  SAMPLE_CREATOR_WORKFLOW_EVENTS,
  createInMemoryOpfsStorageManager,
  exportLocalHabitsToJson,
  importLocalHabitsFromJson,
  loadLocalHabitsSnapshotFromOpfs,
  saveLocalHabitsSnapshotToOpfs,
  wipeLocalHabitsSnapshotInOpfs,
} from "./local-habit-storage";

// === 상태 생성 · 옵트인 · 1클릭 초기화 ===

export function createEmptyLocalHabitState(options?: {
  readonly optInEnabled?: boolean;
  readonly nowMs?: number;
}): LocalCreatorHabitState {
  return {
    schemaVersion: LOCAL_HABIT_SNAPSHOT_SCHEMA_VERSION,
    optInEnabled: options?.optInEnabled ?? false,
    updatedAtMs: options?.nowMs ?? 0,
    externalBytesTransmitted: 0,
    totalRecordedEvents: 0,
    colorObservations: [],
    brushCatalog: {},
    lastBrushId: null,
    brushTransitions: {},
    panelAspectCounts: {},
    panelAnchorCounts: {},
    panelPairCounts: {},
    actionCatalog: {},
    actionHistory: [],
    appliedSuggestionCount: 0,
    executedMacroCount: 0,
  };
}

export function setLocalHabitOptIn(
  state: LocalCreatorHabitState,
  enabled: boolean,
  nowMs = Date.now(),
): LocalCreatorHabitState {
  if (state.optInEnabled === enabled) return state;
  return { ...state, optInEnabled: enabled, updatedAtMs: nowMs, externalBytesTransmitted: 0 };
}

/** 로컬에 학습된 모든 습관 데이터를 즉시 0으로 초기화한다. */
export function wipeLocalHabits(options?: {
  readonly keepOptIn?: boolean;
  readonly currentOptIn?: boolean;
  readonly nowMs?: number;
}): LocalCreatorHabitState {
  const optInEnabled = options?.keepOptIn ? Boolean(options.currentOptIn) : false;
  return createEmptyLocalHabitState({ optInEnabled, nowMs: options?.nowMs ?? Date.now() });
}

// === 이벤트 기록 ===

export function recordHabitEvent(
  state: LocalCreatorHabitState,
  event: CreatorHabitEvent,
): RecordHabitEventResult {
  if (!state.optInEnabled) {
    return { state, recorded: false, ignoredReason: "opt-in-disabled", externalBytesTransmitted: 0 };
  }
  const ts = event.timestampMs ?? (state.updatedAtMs + 1);

  if (event.kind === "color-used") {
    const safeColor = sanitizeOklchColor(event.color);
    const weight = roundToDigits(clampNumber(event.weight ?? 1, 0.1, 20), 3);
    const usage: ColorUsageKind = event.usage ?? "base-fill";
    const nextColors = [...state.colorObservations, { ...safeColor, weight, usage }].slice(-MAX_COLOR_OBSERVATIONS);
    return {
      state: {
        ...state,
        updatedAtMs: ts,
        totalRecordedEvents: state.totalRecordedEvents + 1,
        colorObservations: nextColors,
        externalBytesTransmitted: 0,
      },
      recorded: true,
      ignoredReason: null,
      externalBytesTransmitted: 0,
    };
  }

  if (event.kind === "brush-selected") {
    const id = sanitizeHabitKey(event.brushId);
    if (!isSafeHabitKey(id)) {
      return { state, recorded: false, ignoredReason: "invalid-event", externalBytesTransmitted: 0 };
    }
    const existing = state.brushCatalog[id];
    const nextDescriptor: BrushDescriptor = {
      id,
      labelKo: event.brushLabelKo?.trim() || existing?.labelKo || id,
      labelEn: event.brushLabelEn?.trim() || existing?.labelEn || id,
      stage: event.stage ?? existing?.stage ?? "ink",
      totalUses: (existing?.totalUses ?? 0) + 1,
    };
    let nextTransitions = state.brushTransitions;
    if (state.lastBrushId && state.lastBrushId !== id && isSafeHabitKey(state.lastBrushId)) {
      const prevRow = state.brushTransitions[state.lastBrushId] ?? {};
      nextTransitions = {
        ...state.brushTransitions,
        [state.lastBrushId]: { ...prevRow, [id]: (prevRow[id] ?? 0) + 1 },
      };
    }
    return {
      state: {
        ...state,
        updatedAtMs: ts,
        totalRecordedEvents: state.totalRecordedEvents + 1,
        brushCatalog: { ...state.brushCatalog, [id]: nextDescriptor },
        lastBrushId: id,
        brushTransitions: nextTransitions,
        externalBytesTransmitted: 0,
      },
      recorded: true,
      ignoredReason: null,
      externalBytesTransmitted: 0,
    };
  }

  if (event.kind === "panel-created") {
    if (!isPanelAspectRatioKey(event.aspectRatio) || !isPanelLayoutAnchor(event.anchor)) {
      return { state, recorded: false, ignoredReason: "invalid-event", externalBytesTransmitted: 0 };
    }
    const pairKey = `${event.aspectRatio}@${event.anchor}`;
    return {
      state: {
        ...state,
        updatedAtMs: ts,
        totalRecordedEvents: state.totalRecordedEvents + 1,
        panelAspectCounts: {
          ...state.panelAspectCounts,
          [event.aspectRatio]: (state.panelAspectCounts[event.aspectRatio] ?? 0) + 1,
        },
        panelAnchorCounts: {
          ...state.panelAnchorCounts,
          [event.anchor]: (state.panelAnchorCounts[event.anchor] ?? 0) + 1,
        },
        panelPairCounts: {
          ...state.panelPairCounts,
          [pairKey]: (state.panelPairCounts[pairKey] ?? 0) + 1,
        },
        externalBytesTransmitted: 0,
      },
      recorded: true,
      ignoredReason: null,
      externalBytesTransmitted: 0,
    };
  }

  if (event.kind === "studio-action") {
    const id = sanitizeHabitKey(event.actionId);
    if (!isSafeHabitKey(id)) {
      return { state, recorded: false, ignoredReason: "invalid-event", externalBytesTransmitted: 0 };
    }
    const existing = state.actionCatalog[id];
    const nextAction: ActionDescriptor = {
      id,
      labelKo: event.labelKo?.trim() || existing?.labelKo || id,
      labelEn: event.labelEn?.trim() || existing?.labelEn || id,
      category: event.category ?? existing?.category ?? "layer",
      totalRuns: (existing?.totalRuns ?? 0) + 1,
    };
    return {
      state: {
        ...state,
        updatedAtMs: ts,
        totalRecordedEvents: state.totalRecordedEvents + 1,
        actionCatalog: { ...state.actionCatalog, [id]: nextAction },
        actionHistory: [...state.actionHistory, id].slice(-MAX_ACTION_HISTORY),
        externalBytesTransmitted: 0,
      },
      recorded: true,
      ignoredReason: null,
      externalBytesTransmitted: 0,
    };
  }

  return { state, recorded: false, ignoredReason: "invalid-event", externalBytesTransmitted: 0 };
}

export function recordHabitEventsBatch(
  state: LocalCreatorHabitState,
  events: readonly CreatorHabitEvent[],
): LocalCreatorHabitState {
  let current = state;
  for (const event of events) {
    current = recordHabitEvent(current, event).state;
  }
  return current;
}

// === ① OKLCH 개인 시그니처 팔레트 5색 군집화 ===

export function clusterSignaturePaletteOklch(
  observations: readonly StoredColorObservation[],
  targetK = 5,
): SignaturePaletteSuggestion {
  const k = Math.max(1, Math.min(8, Math.round(targetK)));
  if (observations.length === 0) {
    return {
      swatches: [],
      evidence: {
        confidence: 0,
        confidencePercent: 0,
        observationCount: 0,
        rationaleKo: "색상 관측 이력이 없어 로컬 팔레트를 아직 구성하지 않았습니다.",
        rationaleEn: "No local color observations yet to build a signature palette.",
      },
    };
  }

  const labPoints = observations.map((obs) => oklchToOklab(obs));
  const centroids: OklabPoint[] = [];

  let firstIdx = 0;
  let maxWeight = -1;
  for (let i = 0; i < observations.length; i += 1) {
    const w = observations[i]?.weight ?? 1;
    if (w > maxWeight) {
      maxWeight = w;
      firstIdx = i;
    }
  }
  const firstPoint = labPoints[firstIdx];
  if (firstPoint) centroids.push(firstPoint);

  while (centroids.length < k && centroids.length < observations.length) {
    let bestIdx = -1;
    let bestScore = -1;
    for (let i = 0; i < labPoints.length; i += 1) {
      const pt = labPoints[i];
      if (!pt) continue;
      let minDistSq = Number.POSITIVE_INFINITY;
      for (const center of centroids) {
        const dSq = oklabDistanceSq(pt, center);
        if (dSq < minDistSq) minDistSq = dSq;
      }
      const score = minDistSq * (observations[i]?.weight ?? 1);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx < 0 || bestScore < 1e-6) break;
    const picked = labPoints[bestIdx];
    if (picked) centroids.push(picked);
  }

  const assignments = new Int32Array(labPoints.length);
  for (let iter = 0; iter < 18; iter += 1) {
    for (let i = 0; i < labPoints.length; i += 1) {
      const pt = labPoints[i];
      if (!pt) continue;
      let nearestIdx = 0;
      let nearestDist = Number.POSITIVE_INFINITY;
      for (let c = 0; c < centroids.length; c += 1) {
        const center = centroids[c];
        if (!center) continue;
        const dSq = oklabDistanceSq(pt, center);
        if (dSq < nearestDist) {
          nearestDist = dSq;
          nearestIdx = c;
        }
      }
      assignments[i] = nearestIdx;
    }

    let maxShiftSq = 0;
    for (let c = 0; c < centroids.length; c += 1) {
      let sumL = 0;
      let sumA = 0;
      let sumB = 0;
      let sumW = 0;
      for (let i = 0; i < labPoints.length; i += 1) {
        if (assignments[i] !== c) continue;
        const pt = labPoints[i];
        const w = observations[i]?.weight ?? 1;
        if (!pt) continue;
        sumL += pt.l * w;
        sumA += pt.a * w;
        sumB += pt.b * w;
        sumW += w;
      }
      if (sumW > 0) {
        const nextCenter: OklabPoint = { l: sumL / sumW, a: sumA / sumW, b: sumB / sumW };
        const prevCenter = centroids[c];
        if (prevCenter) {
          const shiftSq = oklabDistanceSq(prevCenter, nextCenter);
          if (shiftSq > maxShiftSq) maxShiftSq = shiftSq;
        }
        centroids[c] = nextCenter;
      }
    }
    if (maxShiftSq < 1e-8) break;
  }

  const totalWeight = observations.reduce((acc, item) => acc + item.weight, 0);
  const rawClusters: Array<{
    readonly center: OklabPoint;
    readonly count: number;
    readonly weight: number;
    readonly meanDist: number;
    readonly dominantUsage: ColorUsageKind;
  }> = [];

  for (let c = 0; c < centroids.length; c += 1) {
    const center = centroids[c];
    if (!center) continue;
    let count = 0;
    let weight = 0;
    let distSum = 0;
    const usageWeights: Partial<Record<ColorUsageKind, number>> = {};

    for (let i = 0; i < observations.length; i += 1) {
      if (assignments[i] !== c) continue;
      const obs = observations[i];
      const pt = labPoints[i];
      if (!obs || !pt) continue;
      count += 1;
      weight += obs.weight;
      distSum += Math.sqrt(oklabDistanceSq(pt, center)) * obs.weight;
      usageWeights[obs.usage] = (usageWeights[obs.usage] ?? 0) + obs.weight;
    }
    if (count === 0) continue;

    let dominantUsage: ColorUsageKind = "base-fill";
    let topUsageWeight = -1;
    for (const [usageKey, uWeight] of Object.entries(usageWeights)) {
      if ((uWeight ?? 0) > topUsageWeight) {
        topUsageWeight = uWeight ?? 0;
        dominantUsage = usageKey as ColorUsageKind;
      }
    }
    rawClusters.push({ center, count, weight, meanDist: weight > 0 ? distSum / weight : 0, dominantUsage });
  }

  rawClusters.sort((a, b) => b.weight - a.weight || b.count - a.count || a.center.l - b.center.l);

  const swatches: SignatureColorSwatch[] = rawClusters.slice(0, k).map((cluster, idx) => {
    const oklch = oklabToOklch(cluster.center);
    const family = classifyOklchHueFamily(oklch);
    const usageLabel = COLOR_USAGE_LABELS[cluster.dominantUsage];
    const sharePercent = totalWeight > 0 ? roundToDigits((cluster.weight / totalWeight) * 100, 1) : 0;
    const cohesion = clampNumber(1 - cluster.meanDist * 2.4, 0.35, 1);
    const sampleFactor = 1 - Math.exp(-cluster.count / 3);
    const confidence = roundToDigits(clampNumber(cohesion * sampleFactor, 0.2, 0.99), 3);

    return {
      id: `sig-color-${idx + 1}`,
      oklch,
      cssOklch: formatCssOklch(oklch),
      dominantUsage: cluster.dominantUsage,
      hueFamilyKo: family.ko,
      hueFamilyEn: family.en,
      labelKo: `${usageLabel.ko} · ${family.ko}`,
      labelEn: `${usageLabel.en} · ${family.en}`,
      observationCount: cluster.count,
      sharePercent,
      confidence,
    };
  });

  const avgMeanDist = rawClusters.reduce((acc, c) => acc + c.meanDist * c.weight, 0) / Math.max(1e-6, totalWeight);
  const overallConfidence = roundToDigits(
    clampNumber(clampNumber(1 - avgMeanDist * 2.2, 0.4, 1) * (1 - Math.exp(-observations.length / 8)), 0.2, 0.99),
    3,
  );

  return {
    swatches,
    evidence: {
      confidence: overallConfidence,
      confidencePercent: Math.round(overallConfidence * 100),
      observationCount: observations.length,
      rationaleKo: `로컬 색상 사용 ${observations.length}건을 Oklab 지각 공간에서 ${swatches.length}개 군집으로 요약했습니다.`,
      rationaleEn: `Clustered ${observations.length} local color samples in Oklab space into ${swatches.length} signature swatches.`,
    },
  };
}

// === ② 브러시 전이 마르코프 체인 다음 공정 추천 ===

export function recommendNextBrush(
  state: LocalCreatorHabitState,
  currentBrushId?: string | null,
): NextBrushSuggestion | null {
  const sourceId = currentBrushId ?? state.lastBrushId;
  const fromBrush = sourceId ? (state.brushCatalog[sourceId] ?? null) : null;
  const row = sourceId ? state.brushTransitions[sourceId] : undefined;

  if (sourceId && row) {
    const entries = Object.entries(row)
      .filter(([targetId, count]) => count > 0 && Boolean(state.brushCatalog[targetId]))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    const totalFrom = entries.reduce((acc, [, count]) => acc + count, 0);
    if (entries.length > 0 && totalFrom > 0) {
      const candidates: NextBrushCandidate[] = entries.slice(0, 3).flatMap(([targetId, count]) => {
        const brush = state.brushCatalog[targetId];
        if (!brush) return [];
        const prob = count / totalFrom;
        return [{ brush, transitionCount: count, probability: roundToDigits(prob, 3), probabilityPercent: Math.round(prob * 100) }];
      });
      const top = candidates[0];
      if (top) {
        const confidence = roundToDigits(clampNumber(top.probability * (1 - Math.exp(-totalFrom / 2.2)), 0.18, 0.99), 3);
        const fromKo = fromBrush?.labelKo ?? sourceId;
        const fromEn = fromBrush?.labelEn ?? sourceId;
        return {
          fromBrush,
          recommendedBrush: top.brush,
          isMarkovTransition: true,
          transitionProbability: top.probability,
          candidates,
          evidence: {
            confidence,
            confidencePercent: Math.round(confidence * 100),
            observationCount: totalFrom,
            rationaleKo: `${fromKo} 직후 ${top.brush.labelKo} 전환 ${top.transitionCount}/${totalFrom}회 (${top.probabilityPercent}%)`,
            rationaleEn: `Switched from ${fromEn} to ${top.brush.labelEn} in ${top.transitionCount}/${totalFrom} transitions (${top.probabilityPercent}%).`,
          },
        };
      }
    }
  }

  const allBrushes = Object.values(state.brushCatalog)
    .filter((b) => b.totalUses > 0 && b.id !== sourceId)
    .sort((a, b) => b.totalUses - a.totalUses || a.id.localeCompare(b.id));
  const fallbackTop = allBrushes[0] ?? Object.values(state.brushCatalog).sort((a, b) => b.totalUses - a.totalUses)[0];
  if (!fallbackTop) return null;

  const totalUsesAll = Object.values(state.brushCatalog).reduce((acc, b) => acc + b.totalUses, 0);
  const share = totalUsesAll > 0 ? fallbackTop.totalUses / totalUsesAll : 0;
  const confidence = roundToDigits(clampNumber(share * 0.55, 0.15, 0.48), 3);

  return {
    fromBrush,
    recommendedBrush: fallbackTop,
    isMarkovTransition: false,
    transitionProbability: roundToDigits(share, 3),
    candidates: [{
      brush: fallbackTop,
      transitionCount: fallbackTop.totalUses,
      probability: roundToDigits(share, 3),
      probabilityPercent: Math.round(share * 100),
    }],
    evidence: {
      confidence,
      confidencePercent: Math.round(confidence * 100),
      observationCount: fallbackTop.totalUses,
      rationaleKo: `직전 전이 표본이 없어 로컬 최다 사용 브러시(${fallbackTop.labelKo}, ${fallbackTop.totalUses}회)를 제안합니다.`,
      rationaleEn: `No direct transition yet; suggesting most-used local brush (${fallbackTop.labelEn}, ${fallbackTop.totalUses} uses).`,
    },
  };
}

// === 선호 컷 종횡비 · 배치 앵커 요약 ===

export function summarizePreferredPanelLayout(
  state: LocalCreatorHabitState,
): PreferredPanelLayoutHabit | null {
  const pairEntries = Object.entries(state.panelPairCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const totalPanels = pairEntries.reduce((acc, [, count]) => acc + count, 0);
  const topPair = pairEntries[0];
  if (!topPair || totalPanels === 0) return null;

  const [rawAspect, rawAnchor] = topPair[0].split("@");
  if (!isPanelAspectRatioKey(rawAspect) || !isPanelLayoutAnchor(rawAnchor)) return null;

  const topCount = topPair[1];
  const share = topCount / totalPanels;
  const sharePct = Math.round(share * 100);
  const confidence = roundToDigits(clampNumber(share * (1 - Math.exp(-totalPanels / 2.8)), 0.2, 0.99), 3);
  const anchorLabel = PANEL_ANCHOR_LABELS[rawAnchor];

  return {
    aspectRatio: rawAspect,
    anchor: rawAnchor,
    anchorLabelKo: anchorLabel.ko,
    anchorLabelEn: anchorLabel.en,
    pairObservationCount: topCount,
    evidence: {
      confidence,
      confidencePercent: Math.round(confidence * 100),
      observationCount: totalPanels,
      rationaleKo: `최근 컷 생성 ${totalPanels}건 중 ${rawAspect} · ${anchorLabel.ko} 배치 ${topCount}회 (${sharePct}%)`,
      rationaleEn: `Preferred ${rawAspect} at ${anchorLabel.en} in ${topCount}/${totalPanels} panel creations (${sharePct}%).`,
    },
  };
}

// === ③ 반복 컷·레이어 액션 시퀀스 매크로 마이닝 & 1클릭 실행 ===

function findNonOverlappingMatches(
  history: readonly string[],
  pattern: readonly string[],
  coveredIndices?: ReadonlySet<number>,
): number[] {
  const starts: number[] = [];
  let i = 0;
  while (i <= history.length - pattern.length) {
    let matched = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (history[i + j] !== pattern[j] || coveredIndices?.has(i + j)) {
        matched = false;
        break;
      }
    }
    if (matched) {
      starts.push(i);
      i += pattern.length;
    } else {
      i += 1;
    }
  }
  return starts;
}

export function discoverRepeatedMacros(
  state: LocalCreatorHabitState,
  minOccurrences = 2,
): readonly RepeatedMacroSuggestion[] {
  const history = state.actionHistory;
  if (history.length < 4) return [];

  const minCount = Math.max(2, Math.round(minOccurrences));
  const seenKeys = new Set<string>();
  const rawCandidates: Array<{ readonly key: string; readonly ids: readonly string[]; readonly occurrences: number }> = [];

  for (let len = 4; len >= 2; len -= 1) {
    for (let i = 0; i <= history.length - len; i += 1) {
      const slice = history.slice(i, i + len);
      if (new Set(slice).size < 2) continue;
      const key = slice.join(">");
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const occurrences = findNonOverlappingMatches(history, slice).length;
      if (occurrences >= minCount) {
        rawCandidates.push({ key, ids: slice, occurrences });
      }
    }
  }

  rawCandidates.sort(
    (a, b) =>
      b.occurrences * (b.ids.length + 0.5) - a.occurrences * (a.ids.length + 0.5) ||
      b.occurrences - a.occurrences ||
      b.ids.length - a.ids.length ||
      a.key.localeCompare(b.key),
  );

  // 탐욕적 비겹침 구간 커버리지로 하위 시퀀스 및 순환 이동(B-C-A 등) 중복 제거
  const coveredIndices = new Set<number>();
  const accepted: Array<{ readonly key: string; readonly ids: readonly string[]; readonly occurrences: number }> = [];
  for (const cand of rawCandidates) {
    const uncoveredStarts = findNonOverlappingMatches(history, cand.ids, coveredIndices);
    if (uncoveredStarts.length < minCount) continue;
    accepted.push({ key: cand.key, ids: cand.ids, occurrences: uncoveredStarts.length });
    for (const start of uncoveredStarts) {
      for (let j = 0; j < cand.ids.length; j += 1) {
        coveredIndices.add(start + j);
      }
    }
    if (accepted.length >= 4) break;
  }

  const panelHabit = summarizePreferredPanelLayout(state);

  return accepted.map((cand, index) => {
    const steps: ActionDescriptor[] = cand.ids.map((id) =>
      state.actionCatalog[id] ?? { id, labelKo: id, labelEn: id, category: "layer", totalRuns: cand.occurrences },
    );
    const hasPanelStep = steps.some((s) => s.category === "panel" || s.id.includes("panel") || s.id.includes("cut"));
    const confidence = roundToDigits(clampNumber(1 - Math.exp(-(cand.occurrences - 1) * 0.65), 0.42, 0.99), 3);
    const firstStep = steps[0];
    const lastStep = steps[steps.length - 1];
    const titleKo = firstStep && lastStep
      ? `${firstStep.labelKo} → ${lastStep.labelKo} (${steps.length}단계)`
      : `반복 작업 매크로 #${index + 1}`;
    const titleEn = firstStep && lastStep
      ? `${firstStep.labelEn} -> ${lastStep.labelEn} (${steps.length} steps)`
      : `Repeated Macro #${index + 1}`;

    return {
      macroId: `macro-${index + 1}-${cand.ids.join("_")}`,
      titleKo,
      titleEn,
      steps,
      occurrences: cand.occurrences,
      estimatedClicksSavedPerRun: Math.max(1, steps.length - 1),
      preferredPanelSpec: hasPanelStep && panelHabit
        ? {
            aspectRatio: panelHabit.aspectRatio,
            anchor: panelHabit.anchor,
            anchorLabelKo: panelHabit.anchorLabelKo,
            anchorLabelEn: panelHabit.anchorLabelEn,
          }
        : null,
      evidence: {
        confidence,
        confidencePercent: Math.round(confidence * 100),
        observationCount: cand.occurrences,
        rationaleKo: `동일한 ${steps.length}단계 연속 작업이 로컬에서 ${cand.occurrences}회 반복 관측되었습니다.`,
        rationaleEn: `Observed the same ${steps.length}-step action sequence ${cand.occurrences} times locally.`,
      },
    };
  });
}

export function executeHabitMacro(
  state: LocalCreatorHabitState,
  macro: RepeatedMacroSuggestion,
  nowMs = Date.now(),
): MacroExecutionReceipt {
  const nextState: LocalCreatorHabitState = {
    ...state,
    updatedAtMs: nowMs,
    executedMacroCount: state.executedMacroCount + 1,
    appliedSuggestionCount: state.appliedSuggestionCount + 1,
    externalBytesTransmitted: 0,
  };
  return {
    macroId: macro.macroId,
    titleKo: macro.titleKo,
    titleEn: macro.titleEn,
    stepsExecuted: macro.steps,
    clicksSaved: macro.estimatedClicksSavedPerRun,
    appliedPanelSpec: macro.preferredPanelSpec,
    executedAtMs: nowMs,
    externalBytesTransmitted: 0,
    nextState,
  };
}

export function markSuggestionApplied(
  state: LocalCreatorHabitState,
  nowMs = Date.now(),
): LocalCreatorHabitState {
  return {
    ...state,
    updatedAtMs: nowMs,
    appliedSuggestionCount: state.appliedSuggestionCount + 1,
    externalBytesTransmitted: 0,
  };
}

export function generateLocalCopilotInsights(
  state: LocalCreatorHabitState,
  options?: {
    readonly currentBrushId?: string | null;
    readonly paletteSize?: number;
    readonly minMacroOccurrences?: number;
  },
): LocalCopilotInsights {
  return {
    privacy: LOCAL_COPILOT_PRIVACY_CONTRACT,
    optInEnabled: state.optInEnabled,
    totalObservations: state.totalRecordedEvents,
    signaturePalette: clusterSignaturePaletteOklch(state.colorObservations, options?.paletteSize ?? 5),
    nextBrush: recommendNextBrush(state, options?.currentBrushId),
    panelLayout: summarizePreferredPanelLayout(state),
    macros: discoverRepeatedMacros(state, options?.minMacroOccurrences ?? 2),
  };
}

export function buildSampleLocalHabitState(nowMs = 4300): LocalCreatorHabitState {
  const optedIn = setLocalHabitOptIn(createEmptyLocalHabitState({ optInEnabled: false, nowMs }), true, nowMs);
  return recordHabitEventsBatch(optedIn, SAMPLE_CREATOR_WORKFLOW_EVENTS);
}
