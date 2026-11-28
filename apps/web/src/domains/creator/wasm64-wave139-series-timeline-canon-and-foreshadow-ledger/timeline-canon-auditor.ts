/**
 * Wave 139 — 장편 웹툰 세계관 연표·캐릭터·복선 무결성 그래프 감사기 오케스트레이터.
 *
 * - 6대 설정 붕괴 자동 탐지(`auditSeriesTimelineCanon`), 캐릭터 생애 궤적(`buildCharacterLifecycleTrace`),
 *   정밀 만 나이(`computeExactAgeYears`), 순수 ES2017 FIPS 180-4 SHA-256 원장 지문을 통합 제공한다.
 */

import {
  canonicalizeCanonLedgerJson,
  classifySeasonCalendarCompatibility,
  computeExactAgeYears,
  formatCivilDateIso,
  inferExpectedSeasonForMonth,
  isValidCivilDate,
  parseWorldDateIso,
  sha256CanonLedgerHex,
} from "./timeline-canon-crypto-and-calendar";
import {
  auditCausalChronologyGraph,
  auditForeshadowThreads,
  auditSimultaneousLocationTeleports,
  buildCharacterLifecycleTrace,
  comparePreparedEvents,
  uniqueSortedStrings,
  type DraftIssue,
  type PreparedEvent,
} from "./timeline-canon-graph-and-trace";
import {
  ALL_CANON_ISSUE_CODES,
  HEMISPHERE_LABEL_KO,
  SEASON_LABEL_KO,
  type CanonIssueCode,
  type CanonIssueSeverity,
  type CharacterCanonSpec,
  type CharacterLifeStatus,
  type CharacterLifecycleTrace,
  type SeriesTimelineCanonAuditResult,
  type SeriesTimelineCanonInput,
  type TimelineCanonIssue,
  type TimelineCanonVerdict,
  type TimelineEventSnapshot,
  type WorldHemisphere,
  type WorldLocationSpec,
} from "./timeline-canon-types";

export {
  canonicalizeCanonLedgerJson,
  computeExactAgeYears,
  sha256CanonLedgerHex,
} from "./timeline-canon-crypto-and-calendar";
export { buildCharacterLifecycleTrace } from "./timeline-canon-graph-and-trace";

const SEVERITY_RANK: Readonly<Record<CanonIssueSeverity, number>> = {
  blocker: 0,
  warning: 1,
  info: 2,
};

function compareDraftIssues(a: DraftIssue, b: DraftIssue): number {
  const sevDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (sevDiff !== 0) return sevDiff;
  if (a.code !== b.code) return a.code < b.code ? -1 : 1;
  const epA = a.episodeNumber ?? 999999;
  const epB = b.episodeNumber ?? 999999;
  if (epA !== epB) return epA - epB;
  const scA = a.sceneIndex ?? 999999;
  const scB = b.sceneIndex ?? 999999;
  if (scA !== scB) return scA - scB;
  const evA = a.eventId ?? "";
  const evB = b.eventId ?? "";
  if (evA !== evB) return evA < evB ? -1 : 1;
  const thA = a.threadId ?? "";
  const thB = b.threadId ?? "";
  if (thA !== thB) return thA < thB ? -1 : 1;
  const chA = a.characterIds.join(",");
  const chB = b.characterIds.join(",");
  if (chA !== chB) return chA < chB ? -1 : 1;
  return a.messageKo < b.messageKo ? -1 : a.messageKo > b.messageKo ? 1 : 0;
}

function resolveCurrentEpisodeNumber(input: SeriesTimelineCanonInput): number {
  if (input.currentEpisodeNumber !== undefined && Number.isFinite(input.currentEpisodeNumber)) {
    return Math.max(0, Math.floor(input.currentEpisodeNumber));
  }
  let latest = 0;
  for (let i = 0; i < input.events.length; i += 1) {
    if (input.events[i].episodeNumber > latest) latest = input.events[i].episodeNumber;
  }
  for (let i = 0; i < input.foreshadowThreads.length; i += 1) {
    if (input.foreshadowThreads[i].setupEpisode > latest) {
      latest = input.foreshadowThreads[i].setupEpisode;
    }
  }
  return latest;
}

function auditEventDatesAgesAndSeasons(
  preparedEvents: readonly PreparedEvent[],
  charactersById: ReadonlyMap<string, CharacterCanonSpec>,
  validBirthByCharId: ReadonlyMap<string, boolean>,
  drafts: DraftIssue[],
): void {
  for (let i = 0; i < preparedEvents.length; i += 1) {
    const ev = preparedEvents[i];
    if (ev.parsedDate === null) {
      drafts.push({
        code: "invalid-world-date",
        subCode: "malformed-date",
        severity: "blocker",
        episodeNumber: ev.raw.episodeNumber,
        sceneIndex: ev.raw.sceneIndex,
        worldDateIso: ev.raw.worldDateIso,
        eventId: ev.raw.eventId,
        relatedEventIds: [ev.raw.eventId],
        characterIds: ev.presentCharacterIds,
        threadId: null,
        messageKo: `${ev.raw.episodeNumber}화 ${ev.raw.sceneIndex}씬(${ev.raw.eventId})의 세계관 날짜 "${ev.raw.worldDateIso}"가 유효하지 않습니다.`,
        fixHintKo: "YYYY-MM-DD 형식과 윤년·월말 일수에 맞는 실제 날짜로 고치세요.",
      });
    }

    const unknownChars = new Set<string>();
    for (let c = 0; c < ev.presentCharacterIds.length; c += 1) {
      if (!charactersById.has(ev.presentCharacterIds[c])) unknownChars.add(ev.presentCharacterIds[c]);
    }
    if (ev.raw.depictedAges) {
      const keys = Object.keys(ev.raw.depictedAges).sort();
      for (let a = 0; a < keys.length; a += 1) {
        if (!charactersById.has(keys[a])) unknownChars.add(keys[a]);
      }
    }
    const transitions = ev.raw.stateTransitions ?? [];
    for (let t = 0; t < transitions.length; t += 1) {
      if (!charactersById.has(transitions[t].characterId)) {
        unknownChars.add(transitions[t].characterId);
      }
    }
    const sortedUnknown = Array.from(unknownChars).sort();
    for (let u = 0; u < sortedUnknown.length; u += 1) {
      const missingCharId = sortedUnknown[u];
      drafts.push({
        code: "unknown-reference",
        subCode: "missing-character",
        severity: "warning",
        episodeNumber: ev.raw.episodeNumber,
        sceneIndex: ev.raw.sceneIndex,
        worldDateIso: ev.raw.worldDateIso,
        eventId: ev.raw.eventId,
        relatedEventIds: [ev.raw.eventId],
        characterIds: [missingCharId],
        threadId: null,
        messageKo: `${ev.raw.episodeNumber}화 ${ev.raw.sceneIndex}씬에 캐릭터 프로필 미등록 ID(${missingCharId})가 참조됐습니다.`,
        fixHintKo: "캐릭터 정본 목록에 출생일과 초기 거점을 등록하세요.",
      });
    }

    if (ev.parsedDate === null || ev.isDreamOrAlternate) continue;

    if (ev.raw.depictedAges) {
      const ageCharIds = Object.keys(ev.raw.depictedAges).sort();
      for (let a = 0; a < ageCharIds.length; a += 1) {
        const charId = ageCharIds[a];
        const ch = charactersById.get(charId);
        if (!ch || validBirthByCharId.get(charId) !== true) continue;
        const depictedAge = ev.raw.depictedAges[charId];
        const expectedAge = computeExactAgeYears(ch, ev.raw.worldDateIso);
        if (depictedAge !== expectedAge) {
          const sceneTag = ev.isFlashback ? "회상 씬" : "본편 씬";
          drafts.push({
            code: "character-age-mismatch",
            subCode: "age-value-diff",
            severity: "blocker",
            episodeNumber: ev.raw.episodeNumber,
            sceneIndex: ev.raw.sceneIndex,
            worldDateIso: ev.raw.worldDateIso,
            eventId: ev.raw.eventId,
            relatedEventIds: [ev.raw.eventId],
            characterIds: [charId],
            threadId: null,
            messageKo: `${ev.raw.episodeNumber}화 ${ev.raw.sceneIndex}씬(${sceneTag}, ${ev.raw.worldDateIso})에서 ${ch.nameKo}의 표기 나이는 ${depictedAge}세이나 출생일 기준 만 나이는 ${expectedAge}세입니다.`,
            fixHintKo: `대사·자막 나이를 만 ${expectedAge}세로 맞추거나 씬의 세계관 날짜를 재조정하세요.`,
          });
        }
      }
    }

    for (let c = 0; c < ev.presentCharacterIds.length; c += 1) {
      const charId = ev.presentCharacterIds[c];
      const ch = charactersById.get(charId);
      if (!ch || validBirthByCharId.get(charId) !== true) continue;
      const hasDepicted =
        ev.raw.depictedAges !== undefined &&
        Object.prototype.hasOwnProperty.call(ev.raw.depictedAges, charId);
      if (hasDepicted) continue;
      const expectedAge = computeExactAgeYears(ch, ev.raw.worldDateIso);
      if (expectedAge < 0) {
        drafts.push({
          code: "character-age-mismatch",
          subCode: "pre-birth-appearance",
          severity: "blocker",
          episodeNumber: ev.raw.episodeNumber,
          sceneIndex: ev.raw.sceneIndex,
          worldDateIso: ev.raw.worldDateIso,
          eventId: ev.raw.eventId,
          relatedEventIds: [ev.raw.eventId],
          characterIds: [charId],
          threadId: null,
          messageKo: `${ev.raw.episodeNumber}화 ${ev.raw.sceneIndex}씬(${ev.raw.worldDateIso})은 ${ch.nameKo} 출생 전 시점(만 ${expectedAge}세)인데 생존 등장합니다.`,
          fixHintKo: "출생일을 조정하거나 해당 씬에서 캐릭터 등장 목록을 제거하세요.",
        });
      }
    }

    if (ev.raw.depictedSeason !== undefined) {
      const compat = classifySeasonCalendarCompatibility(
        ev.parsedDate.month,
        ev.hemisphere,
        ev.raw.depictedSeason,
      );
      if (compat.kind !== "match") {
        const severity: CanonIssueSeverity =
          compat.kind === "adjacent-season-mismatch" ? "warning" : "blocker";
        drafts.push({
          code: "season-calendar-contradiction",
          subCode: compat.kind,
          severity,
          episodeNumber: ev.raw.episodeNumber,
          sceneIndex: ev.raw.sceneIndex,
          worldDateIso: ev.raw.worldDateIso,
          eventId: ev.raw.eventId,
          relatedEventIds: [ev.raw.eventId],
          characterIds: [],
          threadId: null,
          messageKo: `${ev.raw.episodeNumber}화 ${ev.raw.sceneIndex}씬(${ev.raw.worldDateIso}, ${HEMISPHERE_LABEL_KO[ev.hemisphere]})은 달력상 ${SEASON_LABEL_KO[compat.expectedSeason]}인데 작화가 ${SEASON_LABEL_KO[ev.raw.depictedSeason]}로 묘사됐습니다.`,
          fixHintKo: `배경 식생·의상을 ${SEASON_LABEL_KO[compat.expectedSeason]} 톤으로 수정하거나 씬 날짜·반구 설정을 교정하세요.`,
        });
      }
    }
  }
}

function auditDeceasedAppearances(
  sortedCharacters: readonly CharacterCanonSpec[],
  charactersById: ReadonlyMap<string, CharacterCanonSpec>,
  preparedEvents: readonly PreparedEvent[],
  drafts: DraftIssue[],
): void {
  const lifeByCharId = new Map<
    string,
    { status: CharacterLifeStatus; deathEventId: string | null; deathDateIso: string | null }
  >();
  for (let i = 0; i < sortedCharacters.length; i += 1) {
    lifeByCharId.set(sortedCharacters[i].characterId, {
      status: "alive",
      deathEventId: null,
      deathDateIso: null,
    });
  }

  for (let i = 0; i < preparedEvents.length; i += 1) {
    const ev = preparedEvents[i];
    if (ev.parsedDate === null || ev.isDreamOrAlternate) continue;
    const transitions = ev.raw.stateTransitions ?? [];

    for (let t = 0; t < transitions.length; t += 1) {
      const tr = transitions[t];
      if (tr.kind !== "revival-canonical") continue;
      const state = lifeByCharId.get(tr.characterId);
      if (state) {
        state.status = "alive";
        state.deathEventId = null;
        state.deathDateIso = null;
      }
    }

    if (!ev.isFlashback) {
      for (let c = 0; c < ev.presentCharacterIds.length; c += 1) {
        const charId = ev.presentCharacterIds[c];
        const state = lifeByCharId.get(charId);
        const ch = charactersById.get(charId);
        if (!state || !ch || state.status !== "deceased") continue;
        drafts.push({
          code: "deceased-character-non-flashback",
          subCode: "deceased-without-revival",
          severity: "blocker",
          episodeNumber: ev.raw.episodeNumber,
          sceneIndex: ev.raw.sceneIndex,
          worldDateIso: ev.raw.worldDateIso,
          eventId: ev.raw.eventId,
          relatedEventIds: state.deathEventId
            ? [state.deathEventId, ev.raw.eventId]
            : [ev.raw.eventId],
          characterIds: [charId],
          threadId: null,
          messageKo: `${state.deathDateIso ?? "이전 시점"}(${state.deathEventId ?? "사망 씬"})에 사망한 ${ch.nameKo}가 정식 부활 없이 ${ev.raw.episodeNumber}화 ${ev.raw.sceneIndex}씬(${ev.raw.worldDateIso}) 비회상 장면에 등장합니다.`,
          fixHintKo: "회상(isFlashback) 또는 꿈/대체세계 표기를 지정하거나, 선행 화차에 정식 부활(revival-canonical) 이벤트를 배치하세요.",
        });
      }
    }

    for (let t = 0; t < transitions.length; t += 1) {
      const tr = transitions[t];
      if (tr.kind !== "death") continue;
      const state = lifeByCharId.get(tr.characterId);
      if (state) {
        state.status = "deceased";
        state.deathEventId = ev.raw.eventId;
        state.deathDateIso = ev.raw.worldDateIso;
      }
    }
  }
}

/**
 * 장편 웹툰 세계관 연표·캐릭터·복선 전체 무결성을 감사하고 결정론적 원장 지문을 반환한다.
 */
export function auditSeriesTimelineCanon(
  input: SeriesTimelineCanonInput,
): SeriesTimelineCanonAuditResult {
  const defaultHemisphere: WorldHemisphere = input.defaultHemisphere ?? "north";
  const currentEpisodeNumber = resolveCurrentEpisodeNumber(input);
  const seriesCompleted = input.seriesCompleted === true;
  const drafts: DraftIssue[] = [];

  const sortedCharacters = input.characters.slice().sort((a, b) =>
    a.characterId < b.characterId ? -1 : a.characterId > b.characterId ? 1 : 0,
  );
  const charactersById = new Map<string, CharacterCanonSpec>();
  const validBirthByCharId = new Map<string, boolean>();
  for (let i = 0; i < sortedCharacters.length; i += 1) {
    const ch = sortedCharacters[i];
    charactersById.set(ch.characterId, ch);
    const validBirth = isValidCivilDate(ch.birthYear, ch.birthMonth, ch.birthDay);
    validBirthByCharId.set(ch.characterId, validBirth);
    if (!validBirth) {
      const rawBirth = formatCivilDateIso(ch.birthYear, ch.birthMonth, ch.birthDay);
      drafts.push({
        code: "invalid-world-date",
        subCode: "malformed-date",
        severity: "blocker",
        episodeNumber: null,
        sceneIndex: null,
        worldDateIso: rawBirth,
        eventId: null,
        relatedEventIds: [],
        characterIds: [ch.characterId],
        threadId: null,
        messageKo: `캐릭터 ${ch.nameKo}(${ch.characterId})의 출생일 ${rawBirth}이 그레고리력에 존재하지 않습니다.`,
        fixHintKo: "윤년과 월말 일수를 확인해 올바른 생년월일로 수정하세요.",
      });
    }
  }

  const locationsById = new Map<string, WorldLocationSpec>();
  const rawLocations = input.locations ?? [];
  for (let i = 0; i < rawLocations.length; i += 1) {
    locationsById.set(rawLocations[i].locationId, rawLocations[i]);
  }

  const preparedEvents: PreparedEvent[] = input.events.map((ev) => ({
    raw: ev,
    parsedDate: parseWorldDateIso(ev.worldDateIso),
    hemisphere: ev.hemisphere ?? locationsById.get(ev.locationId)?.hemisphere ?? defaultHemisphere,
    isFlashback: ev.isFlashback === true,
    isDreamOrAlternate: ev.isDreamOrAlternate === true,
    presentCharacterIds: uniqueSortedStrings(ev.presentCharacterIds),
  }));
  preparedEvents.sort(comparePreparedEvents);

  const eventsById = new Map<string, PreparedEvent>();
  for (let i = 0; i < preparedEvents.length; i += 1) {
    eventsById.set(preparedEvents[i].raw.eventId, preparedEvents[i]);
  }

  auditEventDatesAgesAndSeasons(preparedEvents, charactersById, validBirthByCharId, drafts);
  auditDeceasedAppearances(sortedCharacters, charactersById, preparedEvents, drafts);
  auditCausalChronologyGraph(eventsById, drafts);
  auditSimultaneousLocationTeleports(
    input,
    sortedCharacters,
    preparedEvents,
    locationsById,
    drafts,
  );
  const foreshadowSummary = auditForeshadowThreads(
    input.foreshadowThreads,
    eventsById,
    currentEpisodeNumber,
    seriesCompleted,
    drafts,
  );

  drafts.sort(compareDraftIssues);
  const issues: TimelineCanonIssue[] = drafts.map((draft, idx) => ({
    issueId: `CANON-${String(idx + 1).padStart(3, "0")}`,
    code: draft.code,
    subCode: draft.subCode,
    severity: draft.severity,
    episodeNumber: draft.episodeNumber,
    sceneIndex: draft.sceneIndex,
    worldDateIso: draft.worldDateIso,
    eventId: draft.eventId,
    relatedEventIds: draft.relatedEventIds,
    characterIds: draft.characterIds,
    threadId: draft.threadId,
    messageKo: draft.messageKo,
    fixHintKo: draft.fixHintKo,
  }));

  const issueCountsByCode: Record<CanonIssueCode, number> = {
    "character-age-mismatch": 0,
    "deceased-character-non-flashback": 0,
    "season-calendar-contradiction": 0,
    "causal-chronology-inversion": 0,
    "simultaneous-location-teleport": 0,
    "unpaid-foreshadow-chekhov-gun": 0,
    "payoff-before-setup": 0,
    "invalid-world-date": 0,
    "unknown-reference": 0,
  };
  let blockerCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (let i = 0; i < issues.length; i += 1) {
    const issue = issues[i];
    issueCountsByCode[issue.code] += 1;
    if (issue.severity === "blocker") blockerCount += 1;
    else if (issue.severity === "warning") warningCount += 1;
    else infoCount += 1;
  }

  const verdict: TimelineCanonVerdict =
    blockerCount > 0 ? "blocked" : warningCount > 0 ? "needs-review" : "clean";

  const characterTraces: CharacterLifecycleTrace[] = sortedCharacters.map((ch) =>
    buildCharacterLifecycleTrace(ch, input.events, issues),
  );
  const chronologicalEvents: TimelineEventSnapshot[] = preparedEvents.map((ev) => ({
    eventId: ev.raw.eventId,
    titleKo: ev.raw.titleKo ?? `${ev.raw.episodeNumber}화 ${ev.raw.sceneIndex}씬`,
    episodeNumber: ev.raw.episodeNumber,
    sceneIndex: ev.raw.sceneIndex,
    worldDateIso: ev.raw.worldDateIso,
    epochDay: ev.parsedDate ? ev.parsedDate.epochDay : null,
    isFlashback: ev.isFlashback,
    isDreamOrAlternate: ev.isDreamOrAlternate,
    locationId: ev.raw.locationId,
    hemisphere: ev.hemisphere,
    depictedSeason: ev.raw.depictedSeason ?? null,
    expectedSeason:
      ev.parsedDate !== null
        ? inferExpectedSeasonForMonth(ev.parsedDate.month, ev.hemisphere)
        : null,
    presentCharacterIds: ev.presentCharacterIds,
  }));
  const chronologicalEventIds = chronologicalEvents.map((ev) => ev.eventId);

  const canonLedgerSha256Hex = sha256CanonLedgerHex(
    canonicalizeCanonLedgerJson({
      schemaVersion: "toonstudio-wave139-timeline-canon-v1",
      seriesId: input.seriesId,
      seriesTitleKo: input.seriesTitleKo,
      currentEpisodeNumber,
      seriesCompleted,
      verdict,
      issueCountsByCode,
      issues: issues.map((item) => ({
        code: item.code,
        subCode: item.subCode,
        severity: item.severity,
        episodeNumber: item.episodeNumber,
        sceneIndex: item.sceneIndex,
        worldDateIso: item.worldDateIso,
        eventId: item.eventId,
        relatedEventIds: item.relatedEventIds,
        characterIds: item.characterIds,
        threadId: item.threadId,
      })),
      characterTraces: characterTraces.map((trace) => ({
        characterId: trace.characterId,
        birthDateIso: trace.birthDateIso,
        finalLifeStatus: trace.finalLifeStatus,
        deathEventIds: trace.deathEventIds,
        revivalEventIds: trace.revivalEventIds,
        totalAppearances: trace.totalAppearances,
        points: trace.points.map((pt) => ({
          eventId: pt.eventId,
          worldDateIso: pt.worldDateIso,
          locationId: pt.locationId,
          exactAgeYears: pt.exactAgeYears,
          lifeStatusAfter: pt.lifeStatusAfter,
        })),
      })),
      foreshadowSummary: {
        totalThreads: foreshadowSummary.totalThreads,
        paidOffCount: foreshadowSummary.paidOffCount,
        overdueUnpaidCount: foreshadowSummary.overdueUnpaidCount,
        intentionallyOpenSequelCount: foreshadowSummary.intentionallyOpenSequelCount,
        invalidChronologyCount: foreshadowSummary.invalidChronologyCount,
        entries: foreshadowSummary.entries.map((entry) => ({
          threadId: entry.threadId,
          setupEventId: entry.setupEventId,
          payoffEventIds: entry.payoffEventIds,
          status: entry.status,
        })),
      },
      chronologicalEventIds,
      issueCodeList: ALL_CANON_ISSUE_CODES,
    }),
  );

  return {
    seriesId: input.seriesId,
    seriesTitleKo: input.seriesTitleKo,
    currentEpisodeNumber,
    verdict,
    totalCharacters: sortedCharacters.length,
    totalEvents: preparedEvents.length,
    totalForeshadowThreads: foreshadowSummary.totalThreads,
    issues,
    blockerCount,
    warningCount,
    infoCount,
    issueCountsByCode,
    characterTraces,
    foreshadowSummary,
    chronologicalEvents,
    chronologicalEventIds,
    canonLedgerSha256Hex,
  };
}
