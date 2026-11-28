/**
 * Wave 139 — 인과 그래프(Tarjan SCC)·원거리 텔레포트·복선 회수 원장·캐릭터 생애 궤적 모듈.
 *
 * - `timeline-canon-auditor.ts`에서 호출하는 결정론적 서브 감사기와 공개 `buildCharacterLifecycleTrace`를 제공한다.
 * - 순수 ES2017 strict TypeScript, 외부 의존성 0개.
 */

import {
  computeExactAgeYears,
  formatCivilDateIso,
  isValidCivilDate,
  parseWorldDateIso,
  type ParsedWorldDate,
} from "./timeline-canon-crypto-and-calendar";
import {
  FORESHADOW_IMPORTANCE_LABEL_KO,
  type CanonIssueCode,
  type CanonIssueSeverity,
  type CanonIssueSubCode,
  type CharacterCanonSpec,
  type CharacterLifeStatus,
  type CharacterLifecycleTrace,
  type CharacterTracePoint,
  type CharacterTransitionKind,
  type EpisodeTimelineEvent,
  type ForeshadowLedgerSummary,
  type ForeshadowThreadAuditEntry,
  type ForeshadowThreadSpec,
  type ForeshadowThreadStatus,
  type SeriesTimelineCanonInput,
  type TimelineCanonIssue,
  type WorldHemisphere,
  type WorldLocationSpec,
} from "./timeline-canon-types";

export interface PreparedEvent {
  readonly raw: EpisodeTimelineEvent;
  readonly parsedDate: ParsedWorldDate | null;
  readonly hemisphere: WorldHemisphere;
  readonly isFlashback: boolean;
  readonly isDreamOrAlternate: boolean;
  readonly presentCharacterIds: readonly string[];
}

export interface DraftIssue {
  readonly code: CanonIssueCode;
  readonly subCode: CanonIssueSubCode;
  readonly severity: CanonIssueSeverity;
  readonly episodeNumber: number | null;
  readonly sceneIndex: number | null;
  readonly worldDateIso: string | null;
  readonly eventId: string | null;
  readonly relatedEventIds: readonly string[];
  readonly characterIds: readonly string[];
  readonly threadId: string | null;
  readonly messageKo: string;
  readonly fixHintKo: string;
}

export function uniqueSortedStrings(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  out.sort();
  return out;
}

export function comparePreparedEvents(a: PreparedEvent, b: PreparedEvent): number {
  const aValid = a.parsedDate !== null ? 0 : 1;
  const bValid = b.parsedDate !== null ? 0 : 1;
  if (aValid !== bValid) return aValid - bValid;
  if (a.parsedDate !== null && b.parsedDate !== null) {
    if (a.parsedDate.epochDay !== b.parsedDate.epochDay) {
      return a.parsedDate.epochDay - b.parsedDate.epochDay;
    }
  }
  if (a.raw.episodeNumber !== b.raw.episodeNumber) {
    return a.raw.episodeNumber - b.raw.episodeNumber;
  }
  if (a.raw.sceneIndex !== b.raw.sceneIndex) {
    return a.raw.sceneIndex - b.raw.sceneIndex;
  }
  return a.raw.eventId < b.raw.eventId ? -1 : a.raw.eventId > b.raw.eventId ? 1 : 0;
}

/**
 * 반복형 Tarjan 강결합 요소(SCC) 알고리즘으로 인과 그래프의 순환(자기 루프 포함)을 추출한다.
 */
export function findCausalCycles(
  nodeIds: readonly string[],
  adjacency: ReadonlyMap<string, readonly string[]>,
): string[][] {
  let nextIndex = 0;
  const indexMap = new Map<string, number>();
  const lowLinkMap = new Map<string, number>();
  const onStack = new Set<string>();
  const tarjanStack: string[] = [];
  const cycles: string[][] = [];

  interface Frame {
    readonly node: string;
    edgePos: number;
  }

  for (let i = 0; i < nodeIds.length; i += 1) {
    const startNode = nodeIds[i];
    if (indexMap.has(startNode)) continue;

    const callStack: Frame[] = [{ node: startNode, edgePos: 0 }];
    indexMap.set(startNode, nextIndex);
    lowLinkMap.set(startNode, nextIndex);
    nextIndex += 1;
    tarjanStack.push(startNode);
    onStack.add(startNode);

    while (callStack.length > 0) {
      const top = callStack[callStack.length - 1];
      const neighbors = adjacency.get(top.node) ?? [];
      if (top.edgePos < neighbors.length) {
        const next = neighbors[top.edgePos];
        top.edgePos += 1;
        if (!indexMap.has(next)) {
          indexMap.set(next, nextIndex);
          lowLinkMap.set(next, nextIndex);
          nextIndex += 1;
          tarjanStack.push(next);
          onStack.add(next);
          callStack.push({ node: next, edgePos: 0 });
        } else if (onStack.has(next)) {
          const curLow = lowLinkMap.get(top.node) ?? 0;
          const nextIdx = indexMap.get(next) ?? 0;
          if (nextIdx < curLow) lowLinkMap.set(top.node, nextIdx);
        }
      } else {
        callStack.pop();
        const topLow = lowLinkMap.get(top.node) ?? 0;
        const topIdx = indexMap.get(top.node) ?? 0;
        if (callStack.length > 0) {
          const parent = callStack[callStack.length - 1];
          const parentLow = lowLinkMap.get(parent.node) ?? 0;
          if (topLow < parentLow) lowLinkMap.set(parent.node, topLow);
        }
        if (topLow === topIdx) {
          const component: string[] = [];
          while (tarjanStack.length > 0) {
            const member = tarjanStack.pop();
            if (member === undefined) break;
            onStack.delete(member);
            component.push(member);
            if (member === top.node) break;
          }
          component.sort();
          if (component.length > 1) {
            cycles.push(component);
          } else if (component.length === 1) {
            const single = component[0];
            if ((adjacency.get(single) ?? []).indexOf(single) >= 0) {
              cycles.push(component);
            }
          }
        }
      }
    }
  }

  cycles.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return cycles;
}

export function auditCausalChronologyGraph(
  eventsById: ReadonlyMap<string, PreparedEvent>,
  drafts: DraftIssue[],
): void {
  const causalAdjacency = new Map<string, string[]>();
  const allEventIdsSorted = Array.from(eventsById.keys()).sort();
  for (let i = 0; i < allEventIdsSorted.length; i += 1) {
    const evId = allEventIdsSorted[i];
    const sourceEv = eventsById.get(evId);
    if (!sourceEv) continue;
    const targets = uniqueSortedStrings(sourceEv.raw.causesEventIds ?? []);
    const validTargets: string[] = [];
    for (let t = 0; t < targets.length; t += 1) {
      const targetId = targets[t];
      const targetEv = eventsById.get(targetId);
      if (!targetEv) {
        drafts.push({
          code: "unknown-reference",
          subCode: "missing-event",
          severity: "warning",
          episodeNumber: sourceEv.raw.episodeNumber,
          sceneIndex: sourceEv.raw.sceneIndex,
          worldDateIso: sourceEv.raw.worldDateIso,
          eventId: sourceEv.raw.eventId,
          relatedEventIds: [sourceEv.raw.eventId, targetId],
          characterIds: [],
          threadId: null,
          messageKo: `이벤트 ${sourceEv.raw.eventId}의 인과 결과 대상(${targetId})이 연표에 없습니다.`,
          fixHintKo: "존재하는 결과 이벤트 ID로 연결하거나 누락된 씬을 추가하세요.",
        });
        continue;
      }
      validTargets.push(targetId);
      if (
        sourceEv.raw.eventId !== targetId &&
        sourceEv.parsedDate !== null &&
        targetEv.parsedDate !== null &&
        targetEv.parsedDate.epochDay < sourceEv.parsedDate.epochDay
      ) {
        drafts.push({
          code: "causal-chronology-inversion",
          subCode: "effect-before-cause-date",
          severity: "blocker",
          episodeNumber: targetEv.raw.episodeNumber,
          sceneIndex: targetEv.raw.sceneIndex,
          worldDateIso: targetEv.raw.worldDateIso,
          eventId: sourceEv.raw.eventId,
          relatedEventIds: [sourceEv.raw.eventId, targetEv.raw.eventId],
          characterIds: [],
          threadId: null,
          messageKo: `원인 이벤트 ${sourceEv.raw.eventId}(${sourceEv.raw.worldDateIso})보다 결과 이벤트 ${targetEv.raw.eventId}(${targetEv.raw.worldDateIso})의 세계관 날짜가 앞섭니다.`,
          fixHintKo: "인과 화살표 방향을 뒤집거나 두 씬의 세계관 날짜 순서를 맞추세요.",
        });
      }
    }
    causalAdjacency.set(evId, validTargets);
  }

  const causalCycles = findCausalCycles(allEventIdsSorted, causalAdjacency);
  for (let i = 0; i < causalCycles.length; i += 1) {
    const cycleNodes = causalCycles[i];
    const leadEv = eventsById.get(cycleNodes[0]);
    drafts.push({
      code: "causal-chronology-inversion",
      subCode: "causal-cycle",
      severity: "blocker",
      episodeNumber: leadEv ? leadEv.raw.episodeNumber : null,
      sceneIndex: leadEv ? leadEv.raw.sceneIndex : null,
      worldDateIso: leadEv ? leadEv.raw.worldDateIso : null,
      eventId: cycleNodes[0],
      relatedEventIds: cycleNodes,
      characterIds: [],
      threadId: null,
      messageKo: `인과 그래프에 닫힌 순환 모순이 존재합니다: ${cycleNodes.join(" → ")} → ${cycleNodes[0]}.`,
      fixHintKo: "순환 고리를 만드는 원인-결과 연결 중 최소 1건을 제거해 비순환 그래프(DAG)로 정리하세요.",
    });
  }
}

function buildTransitRuleMap(input: SeriesTimelineCanonInput): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  const rules = input.transitLinks ?? [];
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i];
    const minDays = Math.max(0, Math.floor(rule.minTransitDays));
    const fwd = `${rule.fromLocationId}\0${rule.toLocationId}`;
    const prevFwd = map.get(fwd);
    map.set(fwd, prevFwd === undefined ? minDays : Math.max(prevFwd, minDays));
    if (rule.bidirectional !== false) {
      const rev = `${rule.toLocationId}\0${rule.fromLocationId}`;
      const prevRev = map.get(rev);
      map.set(rev, prevRev === undefined ? minDays : Math.max(prevRev, minDays));
    }
  }
  return map;
}

function hasExplicitTravelBetween(
  characterId: string,
  prevEvent: EpisodeTimelineEvent,
  currEvent: EpisodeTimelineEvent,
): boolean {
  const check = (ev: EpisodeTimelineEvent): boolean => {
    const list = ev.stateTransitions ?? [];
    for (let i = 0; i < list.length; i += 1) {
      const tr = list[i];
      if (
        tr.characterId === characterId &&
        tr.kind === "travel" &&
        (tr.targetLocationId === undefined || tr.targetLocationId === currEvent.locationId)
      ) {
        return true;
      }
    }
    return false;
  };
  return check(prevEvent) || check(currEvent);
}

export function auditSimultaneousLocationTeleports(
  input: SeriesTimelineCanonInput,
  sortedCharacters: readonly CharacterCanonSpec[],
  preparedEvents: readonly PreparedEvent[],
  locationsById: ReadonlyMap<string, WorldLocationSpec>,
  drafts: DraftIssue[],
): void {
  const transitRuleMap = buildTransitRuleMap(input);
  for (let i = 0; i < sortedCharacters.length; i += 1) {
    const ch = sortedCharacters[i];
    const appearances: PreparedEvent[] = [];
    for (let e = 0; e < preparedEvents.length; e += 1) {
      const ev = preparedEvents[e];
      if (ev.parsedDate === null || ev.isDreamOrAlternate) continue;
      if (ev.presentCharacterIds.indexOf(ch.characterId) >= 0) appearances.push(ev);
    }
    for (let a = 1; a < appearances.length; a += 1) {
      const prev = appearances[a - 1];
      const curr = appearances[a];
      if (prev.raw.locationId === curr.raw.locationId) continue;
      const dayDelta =
        (curr.parsedDate ? curr.parsedDate.epochDay : 0) -
        (prev.parsedDate ? prev.parsedDate.epochDay : 0);

      const explicitMinDays = transitRuleMap.get(`${prev.raw.locationId}\0${curr.raw.locationId}`);
      let requiredMinDays = 0;
      let subCode: CanonIssueSubCode = "same-day-different-location";

      if (explicitMinDays !== undefined) {
        requiredMinDays = explicitMinDays;
        subCode = dayDelta === 0 ? "same-day-different-location" : "transit-days-insufficient";
      } else {
        const locA = locationsById.get(prev.raw.locationId);
        const locB = locationsById.get(curr.raw.locationId);
        if (locA?.regionCluster && locB?.regionCluster) {
          if (locA.regionCluster !== locB.regionCluster) {
            requiredMinDays = Math.max(
              locA.minInterRegionTransitDays ?? 1,
              locB.minInterRegionTransitDays ?? 1,
            );
            subCode = dayDelta === 0 ? "same-day-different-location" : "transit-days-insufficient";
          }
        } else if (dayDelta === 0 && !hasExplicitTravelBetween(ch.characterId, prev.raw, curr.raw)) {
          requiredMinDays = 1;
          subCode = "same-day-different-location";
        }
      }

      if (dayDelta < requiredMinDays) {
        const prevLocName = locationsById.get(prev.raw.locationId)?.nameKo ?? prev.raw.locationId;
        const currLocName = locationsById.get(curr.raw.locationId)?.nameKo ?? curr.raw.locationId;
        drafts.push({
          code: "simultaneous-location-teleport",
          subCode,
          severity: "blocker",
          episodeNumber: curr.raw.episodeNumber,
          sceneIndex: curr.raw.sceneIndex,
          worldDateIso: curr.raw.worldDateIso,
          eventId: curr.raw.eventId,
          relatedEventIds: [prev.raw.eventId, curr.raw.eventId],
          characterIds: [ch.characterId],
          threadId: null,
          messageKo: `${ch.nameKo}가 ${prev.raw.worldDateIso} ${prevLocName}(${prev.raw.eventId})에서 ${curr.raw.worldDateIso} ${currLocName}(${curr.raw.eventId})로 ${dayDelta}일 만에 이동했습니다(최소 필요 ${requiredMinDays}일).`,
          fixHintKo: "이동 경과일을 확보하거나 동일 권역 씬으로 묶고, 원거리 이동이라면 중간 이동 전환 씬을 삽입하세요.",
        });
      }
    }
  }
}

export function auditForeshadowThreads(
  threads: readonly ForeshadowThreadSpec[],
  eventsById: ReadonlyMap<string, PreparedEvent>,
  currentEpisodeNumber: number,
  seriesCompleted: boolean,
  drafts: DraftIssue[],
): ForeshadowLedgerSummary {
  const sortedThreads = threads.slice().sort((a, b) =>
    a.threadId < b.threadId ? -1 : a.threadId > b.threadId ? 1 : 0,
  );
  const entries: ForeshadowThreadAuditEntry[] = [];
  let paidOffCount = 0;
  let openWithinWindowCount = 0;
  let overdueUnpaidCount = 0;
  let intentionallyOpenSequelCount = 0;
  let invalidChronologyCount = 0;

  for (let i = 0; i < sortedThreads.length; i += 1) {
    const thread = sortedThreads[i];
    const setupEv = eventsById.get(thread.setupEventId);
    if (!setupEv) {
      drafts.push({
        code: "unknown-reference",
        subCode: "missing-event",
        severity: "warning",
        episodeNumber: thread.setupEpisode,
        sceneIndex: null,
        worldDateIso: null,
        eventId: thread.setupEventId,
        relatedEventIds: [thread.setupEventId],
        characterIds: [],
        threadId: thread.threadId,
        messageKo: `복선 「${thread.titleKo}」의 설치 이벤트(${thread.setupEventId})가 연표에 등록되지 않았습니다.`,
        fixHintKo: "설치 이벤트 ID를 실제 화차 씬과 연결하거나 누락된 씬을 연표에 추가하세요.",
      });
    }

    const resolvedPayoffEvents: PreparedEvent[] = [];
    let hasChronologyError = false;
    const payoffIds = uniqueSortedStrings(thread.payoffEventIds);
    for (let p = 0; p < payoffIds.length; p += 1) {
      const payoffId = payoffIds[p];
      const payoffEv = eventsById.get(payoffId);
      if (!payoffEv) {
        drafts.push({
          code: "unknown-reference",
          subCode: "missing-event",
          severity: "warning",
          episodeNumber: thread.setupEpisode,
          sceneIndex: null,
          worldDateIso: null,
          eventId: payoffId,
          relatedEventIds: [thread.setupEventId, payoffId],
          characterIds: [],
          threadId: thread.threadId,
          messageKo: `복선 「${thread.titleKo}」의 회수 이벤트(${payoffId})가 연표에 존재하지 않습니다.`,
          fixHintKo: "회수 이벤트 ID 오타를 확인하거나 해당 회수 씬을 연표에 등록하세요.",
        });
        continue;
      }
      resolvedPayoffEvents.push(payoffEv);
      if (
        setupEv &&
        setupEv.parsedDate !== null &&
        payoffEv.parsedDate !== null &&
        payoffEv.parsedDate.epochDay < setupEv.parsedDate.epochDay
      ) {
        hasChronologyError = true;
        drafts.push({
          code: "payoff-before-setup",
          subCode: "payoff-earlier-world-date",
          severity: "blocker",
          episodeNumber: payoffEv.raw.episodeNumber,
          sceneIndex: payoffEv.raw.sceneIndex,
          worldDateIso: payoffEv.raw.worldDateIso,
          eventId: payoffEv.raw.eventId,
          relatedEventIds: [thread.setupEventId, payoffEv.raw.eventId],
          characterIds: [],
          threadId: thread.threadId,
          messageKo: `복선 「${thread.titleKo}」의 회수 시점(${payoffEv.raw.worldDateIso}, ${payoffEv.raw.episodeNumber}화)이 설치 시점(${setupEv.raw.worldDateIso}, ${setupEv.raw.episodeNumber}화)보다 과거입니다.`,
          fixHintKo: "설치 씬과 회수 씬의 세계관 날짜를 재검토해 인과 순서를 바로잡으세요.",
        });
      }
    }

    const resolvedPayoffEpisodes = resolvedPayoffEvents
      .map((ev) => ev.raw.episodeNumber)
      .sort((a, b) => a - b);
    const intentionallyOpen = thread.intentionallyOpenForSequel === true;
    let status: ForeshadowThreadStatus;

    if (hasChronologyError) {
      status = "invalid-chronology";
      invalidChronologyCount += 1;
    } else if (resolvedPayoffEvents.length > 0) {
      status = "paid-off";
      paidOffCount += 1;
    } else if (intentionallyOpen) {
      status = "intentionally-open-sequel";
      intentionallyOpenSequelCount += 1;
    } else {
      const deadlineMissed =
        thread.targetPayoffDeadlineEpisode !== undefined &&
        currentEpisodeNumber > thread.targetPayoffDeadlineEpisode;
      if (deadlineMissed || seriesCompleted) {
        status = "overdue-unpaid";
        overdueUnpaidCount += 1;
        const severity: CanonIssueSeverity =
          thread.importance === "main-arc"
            ? "blocker"
            : thread.importance === "subplot"
              ? "warning"
              : "info";
        const impLabel = FORESHADOW_IMPORTANCE_LABEL_KO[thread.importance];
        const reasonKo = deadlineMissed
          ? `마감 화차(${thread.targetPayoffDeadlineEpisode}화)를 넘긴 현재 ${currentEpisodeNumber}화까지 회수되지 않았습니다.`
          : `작품 완결(${currentEpisodeNumber}화) 시점까지 회수되지 않았습니다.`;
        drafts.push({
          code: "unpaid-foreshadow-chekhov-gun",
          subCode: deadlineMissed ? "deadline-missed" : "series-completed-unpaid",
          severity,
          episodeNumber: thread.targetPayoffDeadlineEpisode ?? currentEpisodeNumber,
          sceneIndex: null,
          worldDateIso: setupEv ? setupEv.raw.worldDateIso : null,
          eventId: thread.setupEventId,
          relatedEventIds: [thread.setupEventId],
          characterIds: [],
          threadId: thread.threadId,
          messageKo: `[${impLabel}] ${thread.setupEpisode}화 설치 복선 「${thread.titleKo}」이 ${reasonKo}`,
          fixHintKo: "회수 씬을 연표에 추가하거나, 속편 이월 복선이면 속편 보류 플래그를 명시하세요.",
        });
      } else {
        status = "open-within-window";
        openWithinWindowCount += 1;
      }
    }

    const lastPayoffEp =
      resolvedPayoffEpisodes.length > 0
        ? resolvedPayoffEpisodes[resolvedPayoffEpisodes.length - 1]
        : null;
    entries.push({
      threadId: thread.threadId,
      titleKo: thread.titleKo,
      importance: thread.importance,
      setupEventId: thread.setupEventId,
      setupEpisode: thread.setupEpisode,
      setupDateIso: setupEv ? setupEv.raw.worldDateIso : null,
      targetPayoffDeadlineEpisode: thread.targetPayoffDeadlineEpisode ?? null,
      payoffEventIds: payoffIds,
      resolvedPayoffEpisodes,
      status,
      intentionallyOpenForSequel: intentionallyOpen,
      spanEpisodes: lastPayoffEp !== null ? Math.max(0, lastPayoffEp - thread.setupEpisode) : null,
    });
  }

  const eligibleTotal = entries.length - intentionallyOpenSequelCount;
  const payoffRateRatio = eligibleTotal <= 0 ? 1 : paidOffCount / eligibleTotal;
  return {
    totalThreads: entries.length,
    paidOffCount,
    openWithinWindowCount,
    overdueUnpaidCount,
    intentionallyOpenSequelCount,
    invalidChronologyCount,
    payoffRateRatio,
    remainingThreads: entries.filter((entry) => entry.status !== "paid-off"),
    entries,
  };
}

/**
 * 단일 캐릭터의 전체 연표·화차 생애 궤적을 시간순으로 산출한다.
 */
export function buildCharacterLifecycleTrace(
  character: CharacterCanonSpec,
  events: readonly EpisodeTimelineEvent[],
  issues: readonly TimelineCanonIssue[] = [],
): CharacterLifecycleTrace {
  const validBirth = isValidCivilDate(
    character.birthYear,
    character.birthMonth,
    character.birthDay,
  );
  const birthDateIso = formatCivilDateIso(
    character.birthYear,
    character.birthMonth,
    character.birthDay,
  );
  const prepared: PreparedEvent[] = events.map((ev) => ({
    raw: ev,
    parsedDate: parseWorldDateIso(ev.worldDateIso),
    hemisphere: ev.hemisphere ?? "north",
    isFlashback: ev.isFlashback === true,
    isDreamOrAlternate: ev.isDreamOrAlternate === true,
    presentCharacterIds: uniqueSortedStrings(ev.presentCharacterIds),
  }));
  prepared.sort(comparePreparedEvents);

  const issueCodesByEvent = new Map<string, Set<CanonIssueCode>>();
  for (let i = 0; i < issues.length; i += 1) {
    const issue = issues[i];
    if (
      issue.eventId !== null &&
      (issue.characterIds.length === 0 || issue.characterIds.indexOf(character.characterId) >= 0)
    ) {
      let set = issueCodesByEvent.get(issue.eventId);
      if (!set) {
        set = new Set<CanonIssueCode>();
        issueCodesByEvent.set(issue.eventId, set);
      }
      set.add(issue.code);
    }
  }

  let lifeStatus: CharacterLifeStatus = "alive";
  const deathEventIds: string[] = [];
  const revivalEventIds: string[] = [];
  const permanentInjuryNotesKo: string[] = [];
  const memoryLossEventIds: string[] = [];
  const points: CharacterTracePoint[] = [];
  let firstEp: number | null = null;
  let lastEp: number | null = null;
  let flashbackAppearances = 0;

  for (let i = 0; i < prepared.length; i += 1) {
    const ev = prepared[i];
    const transitions = (ev.raw.stateTransitions ?? []).filter(
      (tr) => tr.characterId === character.characterId,
    );
    const isPresent = ev.presentCharacterIds.indexOf(character.characterId) >= 0;
    const hasDepictedAge =
      ev.raw.depictedAges !== undefined &&
      Object.prototype.hasOwnProperty.call(ev.raw.depictedAges, character.characterId);
    if (!isPresent && transitions.length === 0 && !hasDepictedAge) continue;

    const appliedKinds: CharacterTransitionKind[] = [];
    if (!ev.isDreamOrAlternate) {
      for (let t = 0; t < transitions.length; t += 1) {
        const tr = transitions[t];
        appliedKinds.push(tr.kind);
        if (tr.kind === "revival-canonical") {
          lifeStatus = "alive";
          revivalEventIds.push(ev.raw.eventId);
        }
      }
      for (let t = 0; t < transitions.length; t += 1) {
        const tr = transitions[t];
        if (tr.kind === "death") {
          lifeStatus = "deceased";
          deathEventIds.push(ev.raw.eventId);
        } else if (tr.kind === "injury-permanent") {
          permanentInjuryNotesKo.push(
            tr.noteKo && tr.noteKo.trim().length > 0
              ? `${ev.raw.episodeNumber}화: ${tr.noteKo.trim()}`
              : `${ev.raw.episodeNumber}화(${ev.raw.eventId}) 영구 부상`,
          );
        } else if (tr.kind === "memory-loss") {
          memoryLossEventIds.push(ev.raw.eventId);
        }
      }
    }

    const exactAgeYears =
      validBirth && ev.parsedDate !== null
        ? computeExactAgeYears(character, ev.raw.worldDateIso)
        : null;
    const depictedAgeYears = hasDepictedAge
      ? (ev.raw.depictedAges as Readonly<Record<string, number>>)[character.characterId]
      : null;

    if (firstEp === null || ev.raw.episodeNumber < firstEp) firstEp = ev.raw.episodeNumber;
    if (lastEp === null || ev.raw.episodeNumber > lastEp) lastEp = ev.raw.episodeNumber;
    if (ev.isFlashback) flashbackAppearances += 1;

    const codeSet = issueCodesByEvent.get(ev.raw.eventId);
    points.push({
      eventId: ev.raw.eventId,
      episodeNumber: ev.raw.episodeNumber,
      sceneIndex: ev.raw.sceneIndex,
      worldDateIso: ev.raw.worldDateIso,
      locationId: ev.raw.locationId,
      exactAgeYears,
      depictedAgeYears,
      isFlashback: ev.isFlashback,
      isDreamOrAlternate: ev.isDreamOrAlternate,
      lifeStatusAfter: lifeStatus,
      appliedTransitions: appliedKinds,
      issueCodesAtPoint: codeSet ? Array.from(codeSet).sort() : [],
    });
  }

  return {
    characterId: character.characterId,
    nameKo: character.nameKo,
    birthDateIso,
    initialLocationId: character.initialLocationId,
    finalLifeStatus: lifeStatus,
    deathEventIds,
    revivalEventIds,
    permanentInjuryNotesKo,
    memoryLossEventIds,
    firstAppearanceEpisode: firstEp,
    lastAppearanceEpisode: lastEp,
    totalAppearances: points.length,
    flashbackAppearances,
    points,
  };
}
