/**
 * 스토리 개연성 인과 감사관 엔진 (Wave 39D).
 *
 * 1. 체호프의 총 복선·회수 인과 그래프(DAG) 추적 · 미회수 경고 · 시간선 역전/순환 탐지
 * 2. 인물 지식 격차(Knowledge-Gap) 모순 및 미습득 전달자(transitive leak) 탐지
 * 3. 외형(흉터/부상) · 핵심 소품 · 계절/날씨 전후 회차 연속성 감시
 *
 * 순수 메모리 결정론적 연산(외부 I/O · 브라우저 스토리지 · 변경 가능 전역 저장소 없음).
 */

export type CausalitySeverity = "critical" | "warning" | "info";
export type ForeshadowImportance = "core" | "major" | "minor";
export type ContinuityCategory = "scar-injury" | "key-prop" | "season-weather";
export type CausalityGrade = "S" | "A" | "B" | "C" | "D";
export type KnowledgeChannel = "witnessed" | "told" | "deduced" | "document" | "public-broadcast";

export type CausalityWarningKind =
  | "unresolved-chekhov"
  | "timeline-inversion"
  | "causal-cycle"
  | "orphan-dependency"
  | "knowledge-gap"
  | "uninformed-informant"
  | "scar-injury-continuity"
  | "prop-continuity"
  | "season-continuity";

export interface ForeshadowThread {
  readonly id: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly importance: ForeshadowImportance;
  readonly plantEpisode: number;
  readonly plantCut: number;
  readonly payoffEpisode?: number;
  readonly payoffCut?: number;
  readonly dependsOnIds?: readonly string[];
}

export interface SecretFactRecord {
  readonly factId: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly introducedEpisode: number;
  readonly introducedCut: number;
  readonly publicAtEpisode?: number;
  readonly publicAtCut?: number;
}

export interface KnowledgeAcquisitionEvent {
  readonly eventId: string;
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly characterNameEn: string;
  readonly factId: string;
  readonly episode: number;
  readonly cut: number;
  readonly channel: KnowledgeChannel;
  readonly sourceCharacterId?: string;
}

export interface CharacterUtteranceRecord {
  readonly utteranceId: string;
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly characterNameEn: string;
  readonly episode: number;
  readonly cut: number;
  readonly dialogue: string;
  readonly referencedFactIds: readonly string[];
}

export interface ContinuityObservation {
  readonly observationId: string;
  readonly episode: number;
  readonly cut: number;
  readonly category: ContinuityCategory;
  readonly entityId: string;
  readonly entityNameKo: string;
  readonly entityNameEn: string;
  readonly stateValue: string;
  readonly stateLabelKo: string;
  readonly stateLabelEn: string;
  readonly sideTag?: "left" | "right" | "center" | "none";
  readonly permanent?: boolean;
  readonly propLifecycle?: "intact" | "damaged" | "lost" | "destroyed";
  readonly ownerId?: string;
  readonly seasonPhase?: "spring" | "summer" | "autumn" | "winter";
  readonly transitionCause?: string;
}

export interface NarrativeCausalityDataset {
  readonly seriesTitleKo: string;
  readonly seriesTitleEn: string;
  readonly currentEpisode: number;
  readonly foreshadowThreads: readonly ForeshadowThread[];
  readonly secretFacts: readonly SecretFactRecord[];
  readonly knowledgeEvents: readonly KnowledgeAcquisitionEvent[];
  readonly utterances: readonly CharacterUtteranceRecord[];
  readonly continuityObservations: readonly ContinuityObservation[];
}

export interface CausalDagNode {
  readonly id: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly importance: ForeshadowImportance;
  readonly plantEpisode: number;
  readonly plantCut: number;
  readonly payoffEpisode: number | null;
  readonly payoffCut: number | null;
  readonly status: "resolved" | "unresolved" | "inverted" | "cyclic";
  readonly episodesElapsed: number;
  readonly depth: number;
}

export interface CausalDagEdge {
  readonly fromId: string;
  readonly toId: string;
  readonly kind: "dependency" | "plant-to-payoff";
  readonly validChronology: boolean;
}

export interface CausalDagGraph {
  readonly nodes: readonly CausalDagNode[];
  readonly edges: readonly CausalDagEdge[];
  readonly topologicalOrder: readonly string[];
  readonly cycles: readonly (readonly string[])[];
}

export interface CausalityWarning {
  readonly warningId: string;
  readonly kind: CausalityWarningKind;
  readonly severity: CausalitySeverity;
  readonly episode: number;
  readonly cut: number;
  readonly targetId: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
  readonly suggestionKo: string;
  readonly suggestionEn: string;
}

export interface ChekhovSummary {
  readonly totalThreads: number;
  readonly resolvedCount: number;
  readonly unresolvedCount: number;
  readonly invertedCount: number;
  readonly cyclicCount: number;
  readonly payoffRatePct: number;
}

export interface CharacterKnowledgeEntry {
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly characterNameEn: string;
  readonly factId: string;
  readonly acquiredAtEpisode: number | null;
  readonly acquiredAtCut: number | null;
  readonly firstMentionedEpisode: number | null;
  readonly firstMentionedCut: number | null;
  readonly hasGapViolation: boolean;
}

export interface ContinuityAuditSummary {
  readonly totalObservations: number;
  readonly checkedTransitions: number;
  readonly scarInjuryMismatches: number;
  readonly propMismatches: number;
  readonly seasonMismatches: number;
}

export interface NarrativeCausalityAuditReport {
  readonly seriesTitleKo: string;
  readonly seriesTitleEn: string;
  readonly currentEpisode: number;
  readonly integrityScore: number;
  readonly grade: CausalityGrade;
  readonly dag: CausalDagGraph;
  readonly chekhovSummary: ChekhovSummary;
  readonly knowledgeMatrix: readonly CharacterKnowledgeEntry[];
  readonly continuitySummary: ContinuityAuditSummary;
  readonly warnings: readonly CausalityWarning[];
  readonly criticalCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

const SEASON_RING: Readonly<Record<"spring" | "summer" | "autumn" | "winter", number>> = {
  spring: 0,
  summer: 1,
  autumn: 2,
  winter: 3,
};

const SEVERITY_ORDER: Readonly<Record<CausalitySeverity, number>> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** 두 스토리 좌표 (episode, cut)를 시간순으로 비교한다. */
export function compareStoryPosition(epA: number, cutA: number, epB: number, cutB: number): number {
  return epA !== epB ? epA - epB : cutA - cutB;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeGrade(score: number): CausalityGrade {
  if (score >= 92) return "S";
  if (score >= 82) return "A";
  if (score >= 68) return "B";
  if (score >= 52) return "C";
  return "D";
}

function detectCausalDag(
  threads: readonly ForeshadowThread[],
  currentEpisode: number,
  warnings: CausalityWarning[],
): { readonly dag: CausalDagGraph; readonly summary: ChekhovSummary } {
  const byId = new Map<string, ForeshadowThread>();
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const thread of threads) {
    byId.set(thread.id, thread);
    adj.set(thread.id, []);
    inDegree.set(thread.id, 0);
  }

  const edges: CausalDagEdge[] = [];
  const invertedIds = new Set<string>();

  for (const thread of threads) {
    const payoffEp = thread.payoffEpisode ?? null;
    const payoffCut = thread.payoffCut ?? 1;

    if (payoffEp !== null) {
      const chronological =
        compareStoryPosition(thread.plantEpisode, thread.plantCut, payoffEp, payoffCut) < 0;
      edges.push({ fromId: thread.id, toId: thread.id, kind: "plant-to-payoff", validChronology: chronological });
      if (!chronological) {
        invertedIds.add(thread.id);
        warnings.push({
          warningId: `inv-${thread.id}`,
          kind: "timeline-inversion",
          severity: "critical",
          episode: payoffEp,
          cut: payoffCut,
          targetId: thread.id,
          titleKo: `복선 시간선 역전: ${thread.titleKo}`,
          titleEn: `Timeline Inversion: ${thread.titleEn}`,
          detailKo: `EP.${payoffEp} ${payoffCut}컷 회수가 EP.${thread.plantEpisode} ${thread.plantCut}컷 설치보다 앞서거나 같은 시점입니다.`,
          detailEn: `Payoff at EP.${payoffEp} Cut ${payoffCut} precedes or matches plant EP.${thread.plantEpisode} Cut ${thread.plantCut}.`,
          suggestionKo: `복선 설치를 EP.${Math.max(1, payoffEp - 1)} 이전으로 당기거나 회수를 설치 이후 컷으로 이동하세요.`,
          suggestionEn: `Move the plant earlier than EP.${payoffEp} or shift payoff strictly after plant.`,
        });
      }
    } else {
      const elapsed = Math.max(0, currentEpisode - thread.plantEpisode);
      const urgent =
        (thread.importance === "core" && elapsed >= 4) ||
        (thread.importance === "major" && elapsed >= 6) ||
        elapsed >= 8;
      warnings.push({
        warningId: `chekhov-${thread.id}`,
        kind: "unresolved-chekhov",
        severity: urgent ? "warning" : "info",
        episode: thread.plantEpisode,
        cut: thread.plantCut,
        targetId: thread.id,
        titleKo: `미회수 체호프의 총: ${thread.titleKo}`,
        titleEn: `Unresolved Chekhov's Gun: ${thread.titleEn}`,
        detailKo: `EP.${thread.plantEpisode} ${thread.plantCut}컷 복선이 EP.${currentEpisode}까지(${elapsed}화 경과) 회수되지 않았습니다.`,
        detailEn: `Foreshadowing from EP.${thread.plantEpisode} Cut ${thread.plantCut} remains unresolved at EP.${currentEpisode} (${elapsed} eps).`,
        suggestionKo: `EP.${currentEpisode + 1}~${currentEpisode + 2} 구간에 회수 컷 또는 리마인드 컷을 배치하세요.`,
        suggestionEn: `Schedule a payoff beat in EP.${currentEpisode + 1}-${currentEpisode + 2} or insert a reminder cut.`,
      });
    }

    for (const depId of thread.dependsOnIds ?? []) {
      const dep = byId.get(depId);
      if (!dep) {
        warnings.push({
          warningId: `orphan-${thread.id}-${depId}`,
          kind: "orphan-dependency",
          severity: "warning",
          episode: thread.plantEpisode,
          cut: thread.plantCut,
          targetId: thread.id,
          titleKo: `선행 복선 누락: ${thread.titleKo}`,
          titleEn: `Missing Prerequisite: ${thread.titleEn}`,
          detailKo: `선행 인과 ID(${depId})가 작품 복선 그래프에 없습니다.`,
          detailEn: `Prerequisite id (${depId}) does not exist in the foreshadow graph.`,
          suggestionKo: `선행 복선 노드를 등록하거나 의존 링크(${depId})를 정리하세요.`,
          suggestionEn: `Register the prerequisite node or remove dangling reference (${depId}).`,
        });
        continue;
      }

      // 후속 복선이 이미 회수된 경우에만 선행 복선의 발화 시점과 시간 선후를 검증한다.
      let validOrder = true;
      if (payoffEp !== null) {
        const depRefEp = dep.payoffEpisode ?? dep.plantEpisode;
        const depRefCut = dep.payoffEpisode !== undefined ? (dep.payoffCut ?? 1) : dep.plantCut;
        validOrder = compareStoryPosition(depRefEp, depRefCut, payoffEp, payoffCut) <= 0;
        if (!validOrder) {
          invertedIds.add(thread.id);
          warnings.push({
            warningId: `dep-inv-${depId}-${thread.id}`,
            kind: "timeline-inversion",
            severity: "critical",
            episode: payoffEp,
            cut: payoffCut,
            targetId: thread.id,
            titleKo: `인과 선후 역전: ${dep.titleKo} → ${thread.titleKo}`,
            titleEn: `Causal Order Inversion: ${dep.titleEn} -> ${thread.titleEn}`,
            detailKo: `선행 복선(${dep.titleKo}, EP.${depRefEp})보다 후속 회수(${thread.titleKo}, EP.${payoffEp})가 먼저 전개됩니다.`,
            detailEn: `Dependent payoff (${thread.titleEn}, EP.${payoffEp}) occurs before prerequisite (${dep.titleEn}, EP.${depRefEp}).`,
            suggestionKo: `선행 복선의 회수 시점을 후속 사건 이전 회차로 재배치하세요.`,
            suggestionEn: `Resolve the prerequisite thread strictly before the dependent payoff.`,
          });
        }
      }

      edges.push({ fromId: depId, toId: thread.id, kind: "dependency", validChronology: validOrder });
      adj.get(depId)?.push(thread.id);
      inDegree.set(thread.id, (inDegree.get(thread.id) ?? 0) + 1);
    }
  }

  // Kahn 위상 정렬 및 순환(cycle) 탐지
  const queue: string[] = [];
  const depthMap = new Map<string, number>();
  for (const thread of threads) {
    if ((inDegree.get(thread.id) ?? 0) === 0) {
      queue.push(thread.id);
      depthMap.set(thread.id, 0);
    }
  }

  const topologicalOrder: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    topologicalOrder.push(current);
    const curDepth = depthMap.get(current) ?? 0;
    for (const next of adj.get(current) ?? []) {
      depthMap.set(next, Math.max(depthMap.get(next) ?? 0, curDepth + 1));
      const deg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  const cyclicIds = new Set<string>();
  const cycles: string[][] = [];
  if (topologicalOrder.length < threads.length) {
    for (const thread of threads) {
      if ((inDegree.get(thread.id) ?? 0) > 0) cyclicIds.add(thread.id);
    }
    const list = Array.from(cyclicIds);
    if (list.length > 0) {
      cycles.push(list);
      const first = byId.get(list[0] ?? "");
      warnings.push({
        warningId: `cycle-${list.join("-")}`,
        kind: "causal-cycle",
        severity: "critical",
        episode: first?.plantEpisode ?? currentEpisode,
        cut: first?.plantCut ?? 1,
        targetId: list[0] ?? "dag",
        titleKo: `순환 인과 모순 감지 (${list.length}개 복선)`,
        titleEn: `Causal Cycle Detected (${list.length} threads)`,
        detailKo: `복선 [${list.join(" → ")}]가 서로 선행 조건을 순환 참조해 DAG가 깨졌습니다.`,
        detailEn: `Threads [${list.join(" -> ")}] form a circular dependency breaking DAG acyclicity.`,
        suggestionKo: `순환 고리의 역방향 간선을 제거해 단일 방향 인과선으로 정리하세요.`,
        suggestionEn: `Remove the back-edge in the cycle to restore an acyclic causal timeline.`,
      });
    }
  }

  const nodes: CausalDagNode[] = threads.map((t) => {
    const hasPayoff = t.payoffEpisode !== undefined;
    let status: CausalDagNode["status"] = hasPayoff ? "resolved" : "unresolved";
    if (cyclicIds.has(t.id)) status = "cyclic";
    else if (invertedIds.has(t.id)) status = "inverted";
    const elapsed = hasPayoff && t.payoffEpisode !== undefined
      ? Math.max(0, t.payoffEpisode - t.plantEpisode)
      : Math.max(0, currentEpisode - t.plantEpisode);
    return {
      id: t.id,
      titleKo: t.titleKo,
      titleEn: t.titleEn,
      importance: t.importance,
      plantEpisode: t.plantEpisode,
      plantCut: t.plantCut,
      payoffEpisode: t.payoffEpisode ?? null,
      payoffCut: t.payoffCut ?? null,
      status,
      episodesElapsed: elapsed,
      depth: depthMap.get(t.id) ?? 0,
    };
  });

  const resolvedCount = nodes.filter((n) => n.status === "resolved").length;
  return {
    dag: { nodes, edges, topologicalOrder, cycles },
    summary: {
      totalThreads: threads.length,
      resolvedCount,
      unresolvedCount: nodes.filter((n) => n.status === "unresolved").length,
      invertedCount: nodes.filter((n) => n.status === "inverted").length,
      cyclicCount: nodes.filter((n) => n.status === "cyclic").length,
      payoffRatePct: threads.length === 0 ? 100 : round1((resolvedCount / threads.length) * 100),
    },
  };
}

function auditKnowledgeGaps(
  dataset: NarrativeCausalityDataset,
  warnings: CausalityWarning[],
): readonly CharacterKnowledgeEntry[] {
  const factById = new Map<string, SecretFactRecord>();
  for (const f of dataset.secretFacts) factById.set(f.factId, f);

  const sortedEvents = [...dataset.knowledgeEvents].sort((a, b) =>
    compareStoryPosition(a.episode, a.cut, b.episode, b.cut),
  );
  const earliestAcq = new Map<string, KnowledgeAcquisitionEvent>();
  const charLabels = new Map<string, { readonly ko: string; readonly en: string }>();

  for (const ev of sortedEvents) {
    charLabels.set(ev.characterId, { ko: ev.characterNameKo, en: ev.characterNameEn });
    const fact = factById.get(ev.factId);
    if (ev.channel === "told" && ev.sourceCharacterId) {
      const srcAcq = earliestAcq.get(`${ev.sourceCharacterId}::${ev.factId}`);
      const isPublic =
        fact?.publicAtEpisode !== undefined &&
        compareStoryPosition(fact.publicAtEpisode, fact.publicAtCut ?? 1, ev.episode, ev.cut) <= 0;
      const srcKnew =
        isPublic || (srcAcq !== undefined && compareStoryPosition(srcAcq.episode, srcAcq.cut, ev.episode, ev.cut) <= 0);
      if (!srcKnew) {
        warnings.push({
          warningId: `leak-informant-${ev.eventId}`,
          kind: "uninformed-informant",
          severity: "critical",
          episode: ev.episode,
          cut: ev.cut,
          targetId: ev.eventId,
          titleKo: `미습득 전달자 모순: ${ev.sourceCharacterId} → ${ev.characterNameKo}`,
          titleEn: `Uninformed Informant: ${ev.sourceCharacterId} -> ${ev.characterNameEn}`,
          detailKo: `EP.${ev.episode} ${ev.cut}컷에서 ${ev.sourceCharacterId}가 비밀("${fact?.titleKo ?? ev.factId}")을 전달하지만 본인 습득 기록이 없습니다.`,
          detailEn: `At EP.${ev.episode} Cut ${ev.cut}, ${ev.sourceCharacterId} shares "${fact?.titleEn ?? ev.factId}" without prior knowledge.`,
          suggestionKo: `${ev.sourceCharacterId}가 해당 사실을 목격·입수하는 선행 컷을 EP.${ev.episode} 이전에 배치하세요.`,
          suggestionEn: `Add an earlier acquisition scene for ${ev.sourceCharacterId} before EP.${ev.episode}.`,
        });
      }
    }
    const key = `${ev.characterId}::${ev.factId}`;
    if (!earliestAcq.has(key)) earliestAcq.set(key, ev);
  }

  const firstMention = new Map<string, CharacterUtteranceRecord>();
  const violated = new Set<string>();
  const sortedUtterances = [...dataset.utterances].sort((a, b) =>
    compareStoryPosition(a.episode, a.cut, b.episode, b.cut),
  );

  for (const utt of sortedUtterances) {
    charLabels.set(utt.characterId, { ko: utt.characterNameKo, en: utt.characterNameEn });
    for (const factId of utt.referencedFactIds) {
      const key = `${utt.characterId}::${factId}`;
      if (!firstMention.has(key)) firstMention.set(key, utt);
      const fact = factById.get(factId);
      const acq = earliestAcq.get(key);
      const isPublic =
        fact?.publicAtEpisode !== undefined &&
        compareStoryPosition(fact.publicAtEpisode, fact.publicAtCut ?? 1, utt.episode, utt.cut) <= 0;
      const knewBefore =
        acq !== undefined && compareStoryPosition(acq.episode, acq.cut, utt.episode, utt.cut) <= 0;

      if (!isPublic && !knewBefore) {
        violated.add(key);
        const fKo = fact?.titleKo ?? factId;
        const fEn = fact?.titleEn ?? factId;
        warnings.push({
          warningId: `kgap-${utt.utteranceId}-${factId}`,
          kind: "knowledge-gap",
          severity: "critical",
          episode: utt.episode,
          cut: utt.cut,
          targetId: utt.utteranceId,
          titleKo: `인물 지식 격차 모순: ${utt.characterNameKo} · ${fKo}`,
          titleEn: `Knowledge Gap: ${utt.characterNameEn} · ${fEn}`,
          detailKo: `EP.${utt.episode} ${utt.cut}컷 대사("${utt.dialogue}")에서 아직 모르는 비밀("${fKo}")을 언급합니다(${acq ? `실제 습득 EP.${acq.episode}#${acq.cut}` : "습득 기록 없음"}).`,
          detailEn: `Line at EP.${utt.episode} Cut ${utt.cut} mentions "${fEn}" prematurely (${acq ? `learned at EP.${acq.episode}#${acq.cut}` : "never acquired"}).`,
          suggestionKo: `대사를 추측성 표현으로 수정하거나 EP.${utt.episode} ${utt.cut}컷 이전에 단서 습득 장면을 추가하세요.`,
          suggestionEn: `Soften the line into speculation or insert a discovery beat before EP.${utt.episode} Cut ${utt.cut}.`,
        });
      }
    }
  }

  const keys = new Set<string>([...earliestAcq.keys(), ...firstMention.keys()]);
  const matrix: CharacterKnowledgeEntry[] = [];
  for (const key of keys) {
    const [characterId, factId] = key.split("::");
    if (!characterId || !factId) continue;
    const acq = earliestAcq.get(key);
    const mention = firstMention.get(key);
    const label = charLabels.get(characterId) ?? { ko: characterId, en: characterId };
    matrix.push({
      characterId,
      characterNameKo: label.ko,
      characterNameEn: label.en,
      factId,
      acquiredAtEpisode: acq?.episode ?? null,
      acquiredAtCut: acq?.cut ?? null,
      firstMentionedEpisode: mention?.episode ?? null,
      firstMentionedCut: mention?.cut ?? null,
      hasGapViolation: violated.has(key),
    });
  }
  matrix.sort((a, b) =>
    a.hasGapViolation !== b.hasGapViolation
      ? a.hasGapViolation ? -1 : 1
      : a.characterId.localeCompare(b.characterId) || a.factId.localeCompare(b.factId),
  );
  return matrix;
}

function auditContinuity(
  observations: readonly ContinuityObservation[],
  warnings: CausalityWarning[],
): ContinuityAuditSummary {
  const grouped = new Map<string, ContinuityObservation[]>();
  for (const obs of observations) {
    const key = `${obs.category}::${obs.entityId}`;
    const arr = grouped.get(key);
    if (arr) arr.push(obs);
    else grouped.set(key, [obs]);
  }

  let checkedTransitions = 0;
  let scarInjuryMismatches = 0;
  let propMismatches = 0;
  let seasonMismatches = 0;

  for (const group of grouped.values()) {
    group.sort((a, b) => compareStoryPosition(a.episode, a.cut, b.episode, b.cut));
    for (let i = 1; i < group.length; i += 1) {
      const prev = group[i - 1];
      const curr = group[i];
      if (!prev || !curr) continue;
      checkedTransitions += 1;
      const hasCause = Boolean(curr.transitionCause?.trim());

      if (curr.category === "scar-injury") {
        const lost = prev.permanent === true && prev.stateValue !== "none" && curr.stateValue === "none" && !hasCause;
        const flipped =
          prev.sideTag !== undefined && curr.sideTag !== undefined &&
          prev.sideTag !== "none" && curr.sideTag !== "none" && prev.sideTag !== curr.sideTag && !hasCause;
        const instantHeal = prev.stateValue !== curr.stateValue && curr.stateValue === "none" && curr.episode - prev.episode <= 1 && !hasCause;
        if (lost || flipped || instantHeal) {
          scarInjuryMismatches += 1;
          warnings.push({
            warningId: `scar-${curr.observationId}`,
            kind: "scar-injury-continuity",
            severity: flipped || lost ? "critical" : "warning",
            episode: curr.episode,
            cut: curr.cut,
            targetId: curr.observationId,
            titleKo: `외형·흉터 연속성 불일치: ${curr.entityNameKo}`,
            titleEn: `Appearance/Scar Mismatch: ${curr.entityNameEn}`,
            detailKo: `EP.${prev.episode}#${prev.cut}(${prev.stateLabelKo}) → EP.${curr.episode}#${curr.cut}(${curr.stateLabelKo}) 전환에 모순이 있습니다.`,
            detailEn: `EP.${prev.episode}#${prev.cut} (${prev.stateLabelEn}) -> EP.${curr.episode}#${curr.cut} (${curr.stateLabelEn}) contradicts prior state.`,
            suggestionKo: `작화 레이어에서 흉터 위치·유무를 통일하거나 치료/가림 전환 컷을 명시하세요.`,
            suggestionEn: `Align the scar layer side/visibility or add a visible transition beat.`,
          });
        }
      } else if (curr.category === "key-prop") {
        const revived =
          (prev.propLifecycle === "destroyed" || prev.propLifecycle === "lost") &&
          (curr.propLifecycle === "intact" || curr.propLifecycle === "damaged") && !hasCause;
        const teleported =
          prev.ownerId !== undefined && curr.ownerId !== undefined && prev.ownerId !== curr.ownerId && !hasCause;
        if (revived || teleported) {
          propMismatches += 1;
          warnings.push({
            warningId: `prop-${curr.observationId}`,
            kind: "prop-continuity",
            severity: "critical",
            episode: curr.episode,
            cut: curr.cut,
            targetId: curr.observationId,
            titleKo: `핵심 소품 연속성 불일치: ${curr.entityNameKo}`,
            titleEn: `Key Prop Mismatch: ${curr.entityNameEn}`,
            detailKo: `EP.${prev.episode}(${prev.stateLabelKo}) → EP.${curr.episode}(${curr.stateLabelKo}) 전환에 수리·인계 설명이 없습니다.`,
            detailEn: `EP.${prev.episode} (${prev.stateLabelEn}) -> EP.${curr.episode} (${curr.stateLabelEn}) lacks recovery or handoff beat.`,
            suggestionKo: `수리·회수 또는 인계 장면을 삽입하거나 직전 파손 상태를 유지하세요.`,
            suggestionEn: `Insert a repair/handoff beat or keep the prop's prior damaged state.`,
          });
        }
      } else if (curr.category === "season-weather" && prev.seasonPhase && curr.seasonPhase && prev.seasonPhase !== curr.seasonPhase && !hasCause) {
        const steps = (SEASON_RING[curr.seasonPhase] - SEASON_RING[prev.seasonPhase] + 4) % 4;
        const epGap = curr.episode - prev.episode;
        if (epGap === 0 || steps >= 2 || (steps === 1 && epGap <= 1)) {
          seasonMismatches += 1;
          warnings.push({
            warningId: `season-${curr.observationId}`,
            kind: "season-continuity",
            severity: steps >= 2 || epGap === 0 ? "critical" : "warning",
            episode: curr.episode,
            cut: curr.cut,
            targetId: curr.observationId,
            titleKo: `계절·배경 연속성 불일치: ${curr.entityNameKo}`,
            titleEn: `Season/Weather Mismatch: ${curr.entityNameEn}`,
            detailKo: `EP.${prev.episode}(${prev.stateLabelKo}) → EP.${curr.episode}(${curr.stateLabelKo})로 시간 경과 표기 없이 급변했습니다.`,
            detailEn: `Abrupt jump from ${prev.stateLabelEn} (EP.${prev.episode}) to ${curr.stateLabelEn} (EP.${curr.episode}) with no time-skip cue.`,
            suggestionKo: `시간 경과 캡션을 추가하거나 배경 계절과 의상을 직전 회차에 맞추세요.`,
            suggestionEn: `Add an explicit time-skip caption or match foliage and wardrobe to prior episode.`,
          });
        }
      }
    }
  }

  return { totalObservations: observations.length, checkedTransitions, scarInjuryMismatches, propMismatches, seasonMismatches };
}

/** 작품 전체의 복선 DAG · 인물 지식 격차 · 외형/소품/계절 연속성을 일괄 감사한다. */
export function auditNarrativeCausality(dataset: NarrativeCausalityDataset): NarrativeCausalityAuditReport {
  const warnings: CausalityWarning[] = [];
  const { dag, summary: chekhovSummary } = detectCausalDag(dataset.foreshadowThreads, dataset.currentEpisode, warnings);
  const knowledgeMatrix = auditKnowledgeGaps(dataset, warnings);
  const continuitySummary = auditContinuity(dataset.continuityObservations, warnings);

  warnings.sort((a, b) =>
    SEVERITY_ORDER[a.severity] !== SEVERITY_ORDER[b.severity]
      ? SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      : compareStoryPosition(a.episode, a.cut, b.episode, b.cut),
  );

  const criticalCount = warnings.filter((w) => w.severity === "critical").length;
  const warningCount = warnings.filter((w) => w.severity === "warning").length;
  const infoCount = warnings.filter((w) => w.severity === "info").length;
  const integrityScore = clamp(100 - (criticalCount * 18 + warningCount * 8 + infoCount * 3), 0, 100);
  const grade = computeGrade(integrityScore);

  return {
    seriesTitleKo: dataset.seriesTitleKo,
    seriesTitleEn: dataset.seriesTitleEn,
    currentEpisode: dataset.currentEpisode,
    integrityScore,
    grade,
    dag,
    chekhovSummary,
    knowledgeMatrix,
    continuitySummary,
    warnings,
    criticalCount,
    warningCount,
    infoCount,
    summaryKo:
      criticalCount === 0 && warningCount === 0
        ? `EP.${dataset.currentEpisode} 기준 치명 모순 없이 정합도 ${integrityScore}점(${grade}등급)입니다.`
        : `EP.${dataset.currentEpisode} 기준 치명 모순 ${criticalCount}건 · 주의 ${warningCount}건 감지(정합도 ${integrityScore}점 · ${grade}등급).`,
    summaryEn:
      criticalCount === 0 && warningCount === 0
        ? `Clean causality through EP.${dataset.currentEpisode} (${integrityScore}/100, Grade ${grade}).`
        : `Detected ${criticalCount} critical and ${warningCount} warning issues through EP.${dataset.currentEpisode} (${integrityScore}/100, Grade ${grade}).`,
  };
}

/** 감사관 데모 기본 데이터셋 (의도적 복선·지식격차·연속성 모순 포함). */
export const DEFAULT_NARRATIVE_CAUSALITY_DATASET: NarrativeCausalityDataset = {
  seriesTitleKo: "검은 시계탑의 목격자",
  seriesTitleEn: "Witness of the Black Clocktower",
  currentEpisode: 12,
  foreshadowThreads: [
    { id: "fs-silver-key", titleKo: "종탑 지하실 은열쇠 문양", titleEn: "Silver Basement Key Emblem", descriptionKo: "1화 4컷 단서가 8화 금고 해제로 회수.", descriptionEn: "EP.1 Cut 4 emblem pays off in EP.8 vault.", importance: "core", plantEpisode: 1, plantCut: 4, payoffEpisode: 8, payoffCut: 19 },
    { id: "fs-clock-chime", titleKo: "자정 13번째 타종 기록", titleEn: "13th Midnight Bell Log", descriptionKo: "2화 관리인 수첩의 13번째 타종 미회수.", descriptionEn: "Caretaker log of 13th bell still unresolved.", importance: "core", plantEpisode: 2, plantCut: 11, dependsOnIds: ["fs-silver-key"] },
    { id: "fs-blue-ink-letter", titleKo: "청색 잉크 봉인 편지", titleEn: "Blue-Ink Sealed Letter", descriptionKo: "회수가 설치보다 앞선 시간선 역전 실수.", descriptionEn: "Payoff precedes the plant cut.", importance: "major", plantEpisode: 7, plantCut: 14, payoffEpisode: 5, payoffCut: 9 },
    { id: "fs-rooftop-shadow", titleKo: "옥상 난간의 붉은 실", titleEn: "Red Thread on Rooftop Rail", descriptionKo: "4화 단서가 10화 범인 옷자락으로 정상 회수.", descriptionEn: "EP.4 clue matches culprit coat in EP.10.", importance: "major", plantEpisode: 4, plantCut: 12, payoffEpisode: 10, payoffCut: 22, dependsOnIds: ["fs-silver-key"] },
  ],
  secretFacts: [
    { factId: "fact-vault-passcode", titleKo: "지하 금고 이중 암호(0413)", titleEn: "Basement Vault Passcode (0413)", introducedEpisode: 3, introducedCut: 8 },
    { factId: "fact-twin-alibi", titleKo: "쌍둥이 형제의 교대 알리바이", titleEn: "Twin Swap Alibi", introducedEpisode: 6, introducedCut: 15 },
  ],
  knowledgeEvents: [
    { eventId: "ke-1", characterId: "char-seojun", characterNameKo: "한서준", characterNameEn: "Han Seojun", factId: "fact-vault-passcode", episode: 3, cut: 8, channel: "witnessed" },
    { eventId: "ke-2", characterId: "char-yuna", characterNameKo: "최유나", characterNameEn: "Choi Yuna", factId: "fact-vault-passcode", episode: 9, cut: 5, channel: "told", sourceCharacterId: "char-seojun" },
    { eventId: "ke-3", characterId: "char-seojun", characterNameKo: "한서준", characterNameEn: "Han Seojun", factId: "fact-twin-alibi", episode: 6, cut: 15, channel: "document" },
  ],
  utterances: [
    { utteranceId: "utt-1", characterId: "char-seojun", characterNameKo: "한서준", characterNameEn: "Han Seojun", episode: 4, cut: 6, dialogue: "금고 암호 0413은 시계탑 준공일이었어.", referencedFactIds: ["fact-vault-passcode"] },
    { utteranceId: "utt-2", characterId: "char-yuna", characterNameKo: "최유나", characterNameEn: "Choi Yuna", episode: 6, cut: 11, dialogue: "서준아, 그 지하 금고 이중 암호 0413을 먼저 눌러야 열려!", referencedFactIds: ["fact-vault-passcode"] },
  ],
  continuityObservations: [
    { observationId: "obs-scar-1", episode: 2, cut: 5, category: "scar-injury", entityId: "char-seojun-brow", entityNameKo: "한서준 눈썹 흉터", entityNameEn: "Seojun Eyebrow Scar", stateValue: "scar-visible", stateLabelKo: "왼쪽 눈썹 흉터 선명", stateLabelEn: "Left eyebrow scar visible", sideTag: "left", permanent: true },
    { observationId: "obs-scar-2", episode: 9, cut: 14, category: "scar-injury", entityId: "char-seojun-brow", entityNameKo: "한서준 눈썹 흉터", entityNameEn: "Seojun Eyebrow Scar", stateValue: "scar-visible", stateLabelKo: "오른쪽 눈썹 흉터로 좌우 반전", stateLabelEn: "Flipped to right eyebrow", sideTag: "right", permanent: true },
    { observationId: "obs-prop-1", episode: 5, cut: 18, category: "key-prop", entityId: "prop-pocket-watch", entityNameKo: "은회중시계", entityNameEn: "Silver Pocket Watch", stateValue: "shattered", stateLabelKo: "유리판 파손·폐기", stateLabelEn: "Shattered and destroyed", propLifecycle: "destroyed", ownerId: "char-seojun" },
    { observationId: "obs-prop-2", episode: 8, cut: 4, category: "key-prop", entityId: "prop-pocket-watch", entityNameKo: "은회중시계", entityNameEn: "Silver Pocket Watch", stateValue: "intact", stateLabelKo: "온전한 상태로 재등장", stateLabelEn: "Reappears intact", propLifecycle: "intact", ownerId: "char-seojun" },
    { observationId: "obs-season-1", episode: 10, cut: 3, category: "season-weather", entityId: "loc-clocktower-square", entityNameKo: "시계탑 광장 계절", entityNameEn: "Clocktower Square Season", stateValue: "midwinter-snow", stateLabelKo: "한겨울 폭설", stateLabelEn: "Midwinter snow", seasonPhase: "winter" },
    { observationId: "obs-season-2", episode: 11, cut: 2, category: "season-weather", entityId: "loc-clocktower-square", entityNameKo: "시계탑 광장 계절", entityNameEn: "Clocktower Square Season", stateValue: "midsummer-sun", stateLabelKo: "한여름 녹음·반팔", stateLabelEn: "Midsummer short sleeves", seasonPhase: "summer" },
  ],
};

/** 모순 수정 완료(정합도 S등급) 비교 프리셋. */
export const CLEAN_NARRATIVE_CAUSALITY_DATASET: NarrativeCausalityDataset = {
  seriesTitleKo: "검은 시계탑의 목격자 (수정본)",
  seriesTitleEn: "Witness of the Black Clocktower (Fixed)",
  currentEpisode: 12,
  foreshadowThreads: [
    { id: "fs-silver-key", titleKo: "종탑 지하실 은열쇠 문양", titleEn: "Silver Basement Key Emblem", descriptionKo: "1화 설치 · 8화 회수.", descriptionEn: "Planted EP.1, resolved EP.8.", importance: "core", plantEpisode: 1, plantCut: 4, payoffEpisode: 8, payoffCut: 19 },
    { id: "fs-clock-chime", titleKo: "자정 13번째 타종 기록", titleEn: "13th Midnight Bell Log", descriptionKo: "2화 설치 · 12화 최종 회수.", descriptionEn: "Planted EP.2, resolved EP.12.", importance: "core", plantEpisode: 2, plantCut: 11, payoffEpisode: 12, payoffCut: 28, dependsOnIds: ["fs-silver-key"] },
    { id: "fs-blue-ink-letter", titleKo: "청색 잉크 봉인 편지", titleEn: "Blue-Ink Sealed Letter", descriptionKo: "5화 설치 · 11화 회수.", descriptionEn: "Planted EP.5, resolved EP.11.", importance: "major", plantEpisode: 5, plantCut: 9, payoffEpisode: 11, payoffCut: 14 },
  ],
  secretFacts: DEFAULT_NARRATIVE_CAUSALITY_DATASET.secretFacts,
  knowledgeEvents: [
    { eventId: "ke-c1", characterId: "char-seojun", characterNameKo: "한서준", characterNameEn: "Han Seojun", factId: "fact-vault-passcode", episode: 3, cut: 8, channel: "witnessed" },
    { eventId: "ke-c2", characterId: "char-yuna", characterNameKo: "최유나", characterNameEn: "Choi Yuna", factId: "fact-vault-passcode", episode: 5, cut: 16, channel: "told", sourceCharacterId: "char-seojun" },
  ],
  utterances: [
    { utteranceId: "utt-c1", characterId: "char-seojun", characterNameKo: "한서준", characterNameEn: "Han Seojun", episode: 4, cut: 6, dialogue: "금고 암호 0413은 시계탑 준공일이었어.", referencedFactIds: ["fact-vault-passcode"] },
    { utteranceId: "utt-c2", characterId: "char-yuna", characterNameKo: "최유나", characterNameEn: "Choi Yuna", episode: 6, cut: 11, dialogue: "어제 네가 알려준 이중 암호 0413을 먼저 눌러볼게.", referencedFactIds: ["fact-vault-passcode"] },
  ],
  continuityObservations: [
    { observationId: "obs-c-scar-1", episode: 2, cut: 5, category: "scar-injury", entityId: "char-seojun-brow", entityNameKo: "한서준 눈썹 흉터", entityNameEn: "Seojun Eyebrow Scar", stateValue: "scar-visible", stateLabelKo: "왼쪽 눈썹 흉터 선명", stateLabelEn: "Left eyebrow scar", sideTag: "left", permanent: true },
    { observationId: "obs-c-scar-2", episode: 9, cut: 14, category: "scar-injury", entityId: "char-seojun-brow", entityNameKo: "한서준 눈썹 흉터", entityNameEn: "Seojun Eyebrow Scar", stateValue: "scar-visible", stateLabelKo: "왼쪽 눈썹 흉터 유지", stateLabelEn: "Left eyebrow scar kept", sideTag: "left", permanent: true },
    { observationId: "obs-c-prop-1", episode: 5, cut: 18, category: "key-prop", entityId: "prop-pocket-watch", entityNameKo: "은회중시계", entityNameEn: "Silver Pocket Watch", stateValue: "shattered", stateLabelKo: "유리판 파손", stateLabelEn: "Shattered", propLifecycle: "destroyed", ownerId: "char-seojun" },
    { observationId: "obs-c-prop-2", episode: 8, cut: 4, category: "key-prop", entityId: "prop-pocket-watch", entityNameKo: "은회중시계", entityNameEn: "Silver Pocket Watch", stateValue: "repaired", stateLabelKo: "시계공 수리 완료", stateLabelEn: "Repaired by watchmaker", propLifecycle: "intact", ownerId: "char-seojun", transitionCause: "7화 시계방 장인 수리 장면" },
    { observationId: "obs-c-season-1", episode: 10, cut: 3, category: "season-weather", entityId: "loc-clocktower-square", entityNameKo: "시계탑 광장 계절", entityNameEn: "Clocktower Square Season", stateValue: "midwinter-snow", stateLabelKo: "한겨울 폭설", stateLabelEn: "Midwinter snow", seasonPhase: "winter" },
    { observationId: "obs-c-season-2", episode: 11, cut: 2, category: "season-weather", entityId: "loc-clocktower-square", entityNameKo: "시계탑 광장 계절", entityNameEn: "Clocktower Square Season", stateValue: "midsummer-sun", stateLabelKo: "6개월 뒤 한여름", stateLabelEn: "Six months later summer", seasonPhase: "summer", transitionCause: "11화 1컷 '6개월 뒤' 시간 경과 캡션" },
  ],
};
