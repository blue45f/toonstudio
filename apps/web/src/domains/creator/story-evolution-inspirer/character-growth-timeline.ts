/**
 * 시간축 캐릭터 성장·심리 일관성 엔진 (순수 클라이언트 로컬 실행)
 *
 * 회차 경과에 따른 외형 변화(흉터·헤어·복장·소품), 심리 5축 벡터, 말투 톤 변화를
 * 추적해 "사건 기반의 의도된 성장"과 "사건 없는 설정 모순"을 구분하고 1클릭 보정 제안을 생성한다.
 */

export type PsychologyAxis = "courage" | "trust" | "warmth" | "restraint" | "ambition";
export type PsychologyVector = Readonly<Record<PsychologyAxis, number>>;
export type SpeechToneTag = "formal" | "casual" | "cynical" | "warm" | "terse";

export const PSYCHOLOGY_AXES: readonly PsychologyAxis[] = [
  "courage", "trust", "warmth", "restraint", "ambition",
] as const;

export const PSYCHOLOGY_AXIS_LABELS: Readonly<Record<PsychologyAxis, string>> = {
  courage: "결단력", trust: "신뢰도", warmth: "온기", restraint: "신중함", ambition: "야망",
};

export const SPEECH_TONE_LABELS: Readonly<Record<SpeechToneTag, string>> = {
  formal: "정중한 존대", casual: "편한 반말", cynical: "냉소적 어조", warm: "다정한 온기", terse: "간결한 단문",
};

export const SPEECH_TONE_GUIDES: Readonly<Record<SpeechToneTag, string>> = {
  formal: "감정이 격해져도 존댓말 어미를 유지하고, 호흡을 정돈해 품위와 거리를 지킵니다.",
  casual: "가까운 거리감의 일상 반말을 쓰며, 감탄사와 직설적 리듬으로 생동감을 살립니다.",
  cynical: "비꼼과 반어법을 섞어 본심을 한 겹 감추고, 짧고 건조한 어미로 방어선을 칩니다.",
  warm: "상대 감정을 먼저 짚어 주는 부드러운 어조로, 긴장된 장면에서도 여운을 남깁니다.",
  terse: "불필요한 수식어를 덜어 내고 핵심 동사 위주의 짧은 대사로 결단력을 드러냅니다.",
};

/** 사건 트리거 없이 이 수치 이상 심리 축이 급변하면 모순으로 판정한다. */
export const ABRUPT_PSYCHOLOGY_DELTA_THRESHOLD = 45;

export interface AppearanceDelta {
  readonly addedScars: readonly string[];
  readonly removedScars?: readonly string[];
  readonly visibleScarsOverride?: readonly string[];
  readonly hair?: string;
  readonly outfit?: string;
  readonly addedProps?: readonly string[];
  readonly removedProps?: readonly string[];
}

export interface CharacterEpisodeSnapshot {
  readonly id: string;
  readonly episode: number;
  readonly ageYears: number;
  readonly elapsedMonths: number;
  readonly appearanceDelta: AppearanceDelta;
  readonly psychology: PsychologyVector;
  readonly speechTone: SpeechToneTag;
  readonly lockSpeechTone?: boolean;
  readonly triggerEvent?: string | null;
  readonly memo?: string;
}

export interface CharacterGrowthArc {
  readonly id: string;
  readonly characterName: string;
  readonly roleSummary: string;
  readonly genreLabel: string;
  readonly baselineHair: string;
  readonly baselineOutfit: string;
  readonly baselineProps: readonly string[];
  readonly lockedSpeechTone?: SpeechToneTag | null;
  readonly snapshots: readonly CharacterEpisodeSnapshot[];
}

export type ConsistencyFindingCode =
  | "scar-vanished"
  | "age-regression"
  | "abrupt-psychology-reversal"
  | "speech-tone-lock-violation";

export type SuggestedFixKind = "restore-scars" | "fix-age" | "record-trigger" | "restore-speech-tone";

export interface TimelineSuggestedFix {
  readonly kind: SuggestedFixKind;
  readonly targetSnapshotId: string;
  readonly buttonLabelKo: string;
  readonly summaryKo: string;
  readonly restoreScars?: readonly string[];
  readonly proposedAgeYears?: number;
  readonly proposedElapsedMonths?: number;
  readonly proposedTriggerEvent?: string;
  readonly proposedSpeechTone?: SpeechToneTag;
}

export interface TimelineConsistencyFinding {
  readonly id: string;
  readonly code: ConsistencyFindingCode;
  readonly severity: "error" | "warning";
  readonly fromEpisode: number;
  readonly episode: number;
  readonly snapshotId: string;
  readonly titleKo: string;
  readonly detailKo: string;
  readonly suggestedFix: TimelineSuggestedFix;
}

export type TransitionVerdict = "intentional-growth" | "steady-continuity" | "contradiction";

export interface EpisodeTransitionEvaluation {
  readonly fromEpisode: number;
  readonly toEpisode: number;
  readonly snapshotId: string;
  readonly verdict: TransitionVerdict;
  readonly hasTriggerEvent: boolean;
  readonly triggerEvent: string | null;
  readonly psychologyDeltas: PsychologyVector;
  readonly addedScars: readonly string[];
  readonly vanishedScars: readonly string[];
  readonly findings: readonly TimelineConsistencyFinding[];
  readonly summaryKo: string;
}

export interface TimelineConsistencyReport {
  readonly arcId: string;
  readonly characterName: string;
  readonly overallStatus: "consistent" | "has-contradictions";
  readonly consistencyScore: number;
  readonly intentionalGrowthCount: number;
  readonly steadyContinuityCount: number;
  readonly contradictionCount: number;
  readonly transitions: readonly EpisodeTransitionEvaluation[];
  readonly findings: readonly TimelineConsistencyFinding[];
}

export interface InterpolatedCharacterState {
  readonly episode: number;
  readonly ageYears: number;
  readonly elapsedMonths: number;
  readonly activeScars: readonly string[];
  readonly hair: string;
  readonly outfit: string;
  readonly props: readonly string[];
  readonly psychology: PsychologyVector;
  readonly speechTone: SpeechToneTag;
  readonly speechToneLabelKo: string;
  readonly speechGuideKo: string;
  readonly activeTriggerEvent: string | null;
  readonly interpolationMode: "exact" | "interpolated" | "before-first" | "after-last";
  readonly sourceFromEpisode: number;
  readonly sourceToEpisode: number;
  readonly nextMilestoneEpisode: number | null;
  readonly nextMilestonePreviewKo: string | null;
}

interface CumulativeVisualState {
  readonly scars: readonly string[];
  readonly hair: string;
  readonly outfit: string;
  readonly props: readonly string[];
}

function clampScore(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

function normalizeTrigger(triggerEvent?: string | null): string | null {
  const trimmed = (triggerEvent ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function uniqueStrings(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of items) {
    const item = raw.trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

function sortSnapshots(snapshots: readonly CharacterEpisodeSnapshot[]): readonly CharacterEpisodeSnapshot[] {
  return [...snapshots].sort((a, b) => a.episode - b.episode);
}

function applyAppearanceToState(prev: CumulativeVisualState, delta: AppearanceDelta): CumulativeVisualState {
  const removedScars = new Set((delta.removedScars ?? []).map((item) => item.trim()));
  let nextScars = uniqueStrings([...prev.scars.filter((scar) => !removedScars.has(scar)), ...delta.addedScars]);
  if (delta.visibleScarsOverride) nextScars = uniqueStrings(delta.visibleScarsOverride);

  const removedProps = new Set((delta.removedProps ?? []).map((item) => item.trim()));
  const nextProps = uniqueStrings([
    ...prev.props.filter((prop) => !removedProps.has(prop)),
    ...(delta.addedProps ?? []),
  ]);
  return {
    scars: nextScars,
    hair: delta.hair?.trim() ? delta.hair.trim() : prev.hair,
    outfit: delta.outfit?.trim() ? delta.outfit.trim() : prev.outfit,
    props: nextProps,
  };
}

function computePsychologyDeltas(prev: PsychologyVector, curr: PsychologyVector): PsychologyVector {
  return {
    courage: clampScore(curr.courage) - clampScore(prev.courage),
    trust: clampScore(curr.trust) - clampScore(prev.trust),
    warmth: clampScore(curr.warmth) - clampScore(prev.warmth),
    restraint: clampScore(curr.restraint) - clampScore(prev.restraint),
    ambition: clampScore(curr.ambition) - clampScore(prev.ambition),
  };
}

function detectVanishedScars(accumulatedScars: readonly string[], delta: AppearanceDelta): readonly string[] {
  if (accumulatedScars.length === 0) return [];
  const vanished = new Set<string>();
  for (const removed of delta.removedScars ?? []) {
    const trimmed = removed.trim();
    if (trimmed && accumulatedScars.includes(trimmed)) vanished.add(trimmed);
  }
  if (delta.visibleScarsOverride) {
    const drawn = new Set(delta.visibleScarsOverride.map((item) => item.trim()));
    for (const scar of accumulatedScars) {
      if (!drawn.has(scar)) vanished.add(scar);
    }
  }
  return [...vanished];
}

function formatAxisDeltaList(deltas: PsychologyVector, axes: readonly PsychologyAxis[]): string {
  return axes.map((axis) => `${PSYCHOLOGY_AXIS_LABELS[axis]} ${deltas[axis] > 0 ? "+" : ""}${deltas[axis]}`).join(", ");
}

function hasMaterialGrowthChange(
  prev: CharacterEpisodeSnapshot,
  curr: CharacterEpisodeSnapshot,
  deltas: PsychologyVector,
): boolean {
  return (
    PSYCHOLOGY_AXES.some((axis) => deltas[axis] !== 0) ||
    curr.appearanceDelta.addedScars.length > 0 ||
    (curr.appearanceDelta.removedScars?.length ?? 0) > 0 ||
    Boolean(curr.appearanceDelta.hair?.trim()) ||
    Boolean(curr.appearanceDelta.outfit?.trim()) ||
    (curr.appearanceDelta.addedProps?.length ?? 0) > 0 ||
    (curr.appearanceDelta.removedProps?.length ?? 0) > 0 ||
    curr.speechTone !== prev.speechTone ||
    curr.ageYears > prev.ageYears ||
    curr.elapsedMonths > prev.elapsedMonths
  );
}

/**
 * 인접 회차 간 변화를 검사해 의도된 성장(`intentional-growth`)과
 * 설정 모순(`contradiction`)을 구분하고 1클릭 수정 제안을 반환한다.
 */
export function evaluateCharacterTimelineConsistency(arc: CharacterGrowthArc): TimelineConsistencyReport {
  const sorted = sortSnapshots(arc.snapshots);
  const first = sorted[0];
  if (!first) {
    return {
      arcId: arc.id, characterName: arc.characterName, overallStatus: "consistent",
      consistencyScore: 100, intentionalGrowthCount: 0, steadyContinuityCount: 0,
      contradictionCount: 0, transitions: [], findings: [],
    };
  }

  const transitions: EpisodeTransitionEvaluation[] = [];
  const allFindings: TimelineConsistencyFinding[] = [];
  let cumulative = applyAppearanceToState(
    { scars: [], hair: arc.baselineHair, outfit: arc.baselineOutfit, props: arc.baselineProps },
    first.appearanceDelta,
  );

  if (arc.lockedSpeechTone && first.speechTone !== arc.lockedSpeechTone) {
    const locked = arc.lockedSpeechTone;
    allFindings.push({
      id: `${first.id}:speech-tone-lock-first`,
      code: "speech-tone-lock-violation",
      severity: "error",
      fromEpisode: first.episode,
      episode: first.episode,
      snapshotId: first.id,
      titleKo: `${first.episode}화 말투 락킹 기준 위반`,
      detailKo: `고정 말투(${SPEECH_TONE_LABELS[locked]})와 달리 ${SPEECH_TONE_LABELS[first.speechTone]}로 지정되었습니다.`,
      suggestedFix: {
        kind: "restore-speech-tone",
        targetSnapshotId: first.id,
        buttonLabelKo: `${SPEECH_TONE_LABELS[locked]}로 맞추기`,
        summaryKo: `${first.episode}화 말투를 잠금 기준인 '${SPEECH_TONE_LABELS[locked]}'로 복구합니다.`,
        proposedSpeechTone: locked,
      },
    });
  }

  for (let index = 1; index < sorted.length; index += 1) {
    const prev = sorted[index - 1];
    const curr = sorted[index];
    if (!prev || !curr) continue;

    const trigger = normalizeTrigger(curr.triggerEvent);
    const hasTrigger = trigger !== null;
    const deltas = computePsychologyDeltas(prev.psychology, curr.psychology);
    const vanishedScars = detectVanishedScars(cumulative.scars, curr.appearanceDelta);
    const stepFindings: TimelineConsistencyFinding[] = [];

    if (vanishedScars.length > 0 && !hasTrigger) {
      stepFindings.push({
        id: `${curr.id}:scar-vanished`,
        code: "scar-vanished",
        severity: "error",
        fromEpisode: prev.episode,
        episode: curr.episode,
        snapshotId: curr.id,
        titleKo: `${curr.episode}화 흉터 설정 누락 (${vanishedScars.join(", ")})`,
        detailKo: `${prev.episode}화까지 누적된 흉터(${vanishedScars.join(", ")})가 치유·복원 사건 기록 없이 사라졌습니다.`,
        suggestedFix: {
          kind: "restore-scars",
          targetSnapshotId: curr.id,
          buttonLabelKo: "누락된 흉터 복구",
          summaryKo: `${curr.episode}화에 누락된 흉터(${vanishedScars.join(", ")})를 다시 유지합니다.`,
          restoreScars: vanishedScars,
        },
      });
    }

    if (curr.ageYears < prev.ageYears || curr.elapsedMonths < prev.elapsedMonths) {
      const correctedMonths = Math.max(prev.elapsedMonths, curr.elapsedMonths);
      const correctedAge = Math.max(prev.ageYears + Math.floor((correctedMonths - prev.elapsedMonths) / 12), prev.ageYears);
      stepFindings.push({
        id: `${curr.id}:age-regression`,
        code: "age-regression",
        severity: "error",
        fromEpisode: prev.episode,
        episode: curr.episode,
        snapshotId: curr.id,
        titleKo: `${curr.episode}화 연령·시간축 역행`,
        detailKo: `${prev.episode}화(${prev.ageYears}세, +${prev.elapsedMonths}개월)보다 ${curr.episode}화(${curr.ageYears}세, +${curr.elapsedMonths}개월)가 과거로 되돌아갔습니다.`,
        suggestedFix: {
          kind: "fix-age",
          targetSnapshotId: curr.id,
          buttonLabelKo: `${correctedAge}세로 시간축 보정`,
          summaryKo: `${curr.episode}화 연령을 ${correctedAge}세(+${correctedMonths}개월)로 단조 증가 보정합니다.`,
          proposedAgeYears: correctedAge,
          proposedElapsedMonths: correctedMonths,
        },
      });
    }

    const abruptAxes = PSYCHOLOGY_AXES.filter((axis) => Math.abs(deltas[axis]) >= ABRUPT_PSYCHOLOGY_DELTA_THRESHOLD);
    if (abruptAxes.length > 0 && !hasTrigger) {
      const axisText = formatAxisDeltaList(deltas, abruptAxes);
      stepFindings.push({
        id: `${curr.id}:abrupt-psychology`,
        code: "abrupt-psychology-reversal",
        severity: "error",
        fromEpisode: prev.episode,
        episode: curr.episode,
        snapshotId: curr.id,
        titleKo: `${curr.episode}화 사건 없는 급격한 성격 반전`,
        detailKo: `핵심 사건 기록 없이 심리 변화폭이 기준(±${ABRUPT_PSYCHOLOGY_DELTA_THRESHOLD})을 넘었습니다: ${axisText}.`,
        suggestedFix: {
          kind: "record-trigger",
          targetSnapshotId: curr.id,
          buttonLabelKo: "핵심 사건 1클릭 기록",
          summaryKo: `${curr.episode}화에 심리 전환 원인이 되는 사건 트리거를 추가해 의도된 성장으로 승인합니다.`,
          proposedTriggerEvent: `${curr.episode}화 결정적 전환 사건 (${axisText} 변화 계기)`,
        },
      });
    }

    const violatedArcLock = Boolean(arc.lockedSpeechTone) && curr.speechTone !== arc.lockedSpeechTone;
    const violatedPrevLock = Boolean(prev.lockSpeechTone) && curr.speechTone !== prev.speechTone;
    if (violatedArcLock || violatedPrevLock || (!hasTrigger && curr.speechTone !== prev.speechTone)) {
      const expectedTone = violatedArcLock && arc.lockedSpeechTone ? arc.lockedSpeechTone : prev.speechTone;
      const lockReason = violatedArcLock
        ? `캐릭터 말투 잠금('${SPEECH_TONE_LABELS[expectedTone]}')이 걸려 있으나`
        : violatedPrevLock
          ? `${prev.episode}화 말투 잠금('${SPEECH_TONE_LABELS[expectedTone]}')이 유지되어야 하나`
          : `전환 사건 없이 ${prev.episode}화 '${SPEECH_TONE_LABELS[expectedTone]}'에서`;
      stepFindings.push({
        id: `${curr.id}:speech-tone-lock`,
        code: "speech-tone-lock-violation",
        severity: "warning",
        fromEpisode: prev.episode,
        episode: curr.episode,
        snapshotId: curr.id,
        titleKo: `${curr.episode}화 말투 락킹 위반`,
        detailKo: `${lockReason} '${SPEECH_TONE_LABELS[curr.speechTone]}'로 어긋났습니다.`,
        suggestedFix: {
          kind: "restore-speech-tone",
          targetSnapshotId: curr.id,
          buttonLabelKo: `${SPEECH_TONE_LABELS[expectedTone]}로 복구`,
          summaryKo: `${curr.episode}화 말투를 '${SPEECH_TONE_LABELS[expectedTone]}'로 되돌려 톤 일관성을 지킵니다.`,
          proposedSpeechTone: expectedTone,
        },
      });
    }

    let verdict: TransitionVerdict;
    let summaryKo: string;
    if (stepFindings.length > 0) {
      verdict = "contradiction";
      summaryKo = `${prev.episode}화 → ${curr.episode}화 구간에서 설정 모순 ${stepFindings.length}건이 감지되었습니다.`;
    } else if (hasTrigger && hasMaterialGrowthChange(prev, curr, deltas)) {
      verdict = "intentional-growth";
      const changedAxes = PSYCHOLOGY_AXES.filter((axis) => Math.abs(deltas[axis]) >= 10);
      const axisSnippet = changedAxes.length > 0 ? ` · 심리(${formatAxisDeltaList(deltas, changedAxes)})` : "";
      const scarSnippet = curr.appearanceDelta.addedScars.length > 0 ? ` · 흉터(+${curr.appearanceDelta.addedScars.join(", ")})` : "";
      summaryKo = `${curr.episode}화 사건('${trigger}')을 근거로 의도된 성장 승인${scarSnippet}${axisSnippet}.`;
    } else {
      verdict = "steady-continuity";
      summaryKo = `${prev.episode}화 → ${curr.episode}화 구간은 설정 충돌 없이 안정적으로 이어집니다.`;
    }

    transitions.push({
      fromEpisode: prev.episode, toEpisode: curr.episode, snapshotId: curr.id, verdict,
      hasTriggerEvent: hasTrigger, triggerEvent: trigger, psychologyDeltas: deltas,
      addedScars: uniqueStrings(curr.appearanceDelta.addedScars), vanishedScars,
      findings: stepFindings, summaryKo,
    });
    allFindings.push(...stepFindings);
    cumulative = applyAppearanceToState(cumulative, curr.appearanceDelta);
  }

  const penalty = allFindings.reduce((acc, item) => acc + (item.severity === "error" ? 24 : 14), 0);
  return {
    arcId: arc.id,
    characterName: arc.characterName,
    overallStatus: allFindings.length === 0 ? "consistent" : "has-contradictions",
    consistencyScore: Math.max(0, 100 - penalty),
    intentionalGrowthCount: transitions.filter((item) => item.verdict === "intentional-growth").length,
    steadyContinuityCount: transitions.filter((item) => item.verdict === "steady-continuity").length,
    contradictionCount: allFindings.length,
    transitions,
    findings: allFindings,
  };
}

/** 1클릭 수정 제안(`suggestedFix`)을 불변 방식으로 캐릭터 아크에 적용한다. */
export function applyTimelineSuggestedFix(arc: CharacterGrowthArc, fix: TimelineSuggestedFix): CharacterGrowthArc {
  return {
    ...arc,
    snapshots: arc.snapshots.map((snapshot) => {
      if (snapshot.id !== fix.targetSnapshotId) return snapshot;
      if (fix.kind === "restore-scars") {
        const toRestore = new Set(fix.restoreScars ?? []);
        return {
          ...snapshot,
          appearanceDelta: {
            ...snapshot.appearanceDelta,
            removedScars: (snapshot.appearanceDelta.removedScars ?? []).filter((scar) => !toRestore.has(scar.trim())),
            visibleScarsOverride: snapshot.appearanceDelta.visibleScarsOverride
              ? uniqueStrings([...snapshot.appearanceDelta.visibleScarsOverride, ...(fix.restoreScars ?? [])])
              : undefined,
          },
        };
      }
      if (fix.kind === "fix-age") {
        return {
          ...snapshot,
          ageYears: fix.proposedAgeYears ?? snapshot.ageYears,
          elapsedMonths: fix.proposedElapsedMonths ?? snapshot.elapsedMonths,
        };
      }
      if (fix.kind === "record-trigger") {
        return { ...snapshot, triggerEvent: fix.proposedTriggerEvent ?? `${snapshot.episode}화 전환 사건 기록` };
      }
      return { ...snapshot, speechTone: fix.proposedSpeechTone ?? snapshot.speechTone };
    }),
  };
}

function buildSpeechGuide(tone: SpeechToneTag, psychology: PsychologyVector): string {
  const modifiers: string[] = [];
  if (psychology.restraint >= 75) modifiers.push("말끝을 아끼고 한 박자 멈춘 뒤 대답");
  if (psychology.trust <= 40) modifiers.push("상대 의도를 되묻는 확인성 표현 활용");
  else if (psychology.warmth >= 70) modifiers.push("상대 이름을 부드럽게 불러 안도감 부여");
  if (psychology.courage >= 80) modifiers.push("위기 장면에서도 단정형 종결 유지");
  return modifiers.length > 0 ? `${SPEECH_TONE_GUIDES[tone]} (${modifiers.join(" · ")})` : SPEECH_TONE_GUIDES[tone];
}

function makeInterpolatedState(params: {
  readonly episode: number;
  readonly ageYears: number;
  readonly elapsedMonths: number;
  readonly visual: CumulativeVisualState;
  readonly psychology: PsychologyVector;
  readonly speechTone: SpeechToneTag;
  readonly activeTriggerEvent: string | null;
  readonly interpolationMode: InterpolatedCharacterState["interpolationMode"];
  readonly sourceFromEpisode: number;
  readonly sourceToEpisode: number;
  readonly nextMilestoneEpisode: number | null;
  readonly nextMilestonePreviewKo: string | null;
}): InterpolatedCharacterState {
  return {
    episode: params.episode, ageYears: params.ageYears, elapsedMonths: params.elapsedMonths,
    activeScars: params.visual.scars, hair: params.visual.hair, outfit: params.visual.outfit,
    props: params.visual.props, psychology: params.psychology, speechTone: params.speechTone,
    speechToneLabelKo: SPEECH_TONE_LABELS[params.speechTone],
    speechGuideKo: buildSpeechGuide(params.speechTone, params.psychology),
    activeTriggerEvent: params.activeTriggerEvent, interpolationMode: params.interpolationMode,
    sourceFromEpisode: params.sourceFromEpisode, sourceToEpisode: params.sourceToEpisode,
    nextMilestoneEpisode: params.nextMilestoneEpisode, nextMilestonePreviewKo: params.nextMilestonePreviewKo,
  };
}

/** 특정 회차 입력 시 해당 시점의 누적 흉터·복장·심리 상태·말투 가이드를 즉시 합성 반환한다. */
export function interpolateCharacterAppearanceAtEpisode(
  arc: CharacterGrowthArc,
  episode: number,
): InterpolatedCharacterState {
  const safeEpisode = Math.max(1, Math.round(Number.isFinite(episode) ? episode : 1));
  const sorted = sortSnapshots(arc.snapshots);
  const baseVisual: CumulativeVisualState = {
    scars: [], hair: arc.baselineHair, outfit: arc.baselineOutfit, props: arc.baselineProps,
  };

  if (sorted.length === 0) {
    return makeInterpolatedState({
      episode: safeEpisode, ageYears: 20, elapsedMonths: 0, visual: baseVisual,
      psychology: { courage: 50, trust: 50, warmth: 50, restraint: 50, ambition: 50 },
      speechTone: arc.lockedSpeechTone ?? "formal", activeTriggerEvent: null,
      interpolationMode: "before-first", sourceFromEpisode: safeEpisode, sourceToEpisode: safeEpisode,
      nextMilestoneEpisode: null, nextMilestonePreviewKo: null,
    });
  }

  let cumulative = baseVisual;
  const cumulativeByIndex = sorted.map((snapshot) => {
    cumulative = applyAppearanceToState(cumulative, snapshot.appearanceDelta);
    return { snapshot, state: cumulative };
  });
  const firstEntry = cumulativeByIndex[0];
  const lastEntry = cumulativeByIndex[cumulativeByIndex.length - 1];
  if (!firstEntry || !lastEntry) throw new Error("unreachable: sorted snapshots is non-empty");

  const exactIndex = cumulativeByIndex.findIndex((item) => item.snapshot.episode === safeEpisode);
  if (exactIndex >= 0) {
    const entry = cumulativeByIndex[exactIndex];
    const nextEntry = cumulativeByIndex[exactIndex + 1];
    if (entry) {
      return makeInterpolatedState({
        episode: safeEpisode, ageYears: entry.snapshot.ageYears, elapsedMonths: entry.snapshot.elapsedMonths,
        visual: entry.state, psychology: entry.snapshot.psychology, speechTone: entry.snapshot.speechTone,
        activeTriggerEvent: normalizeTrigger(entry.snapshot.triggerEvent), interpolationMode: "exact",
        sourceFromEpisode: entry.snapshot.episode, sourceToEpisode: entry.snapshot.episode,
        nextMilestoneEpisode: nextEntry ? nextEntry.snapshot.episode : null,
        nextMilestonePreviewKo: nextEntry
          ? normalizeTrigger(nextEntry.snapshot.triggerEvent) ?? `${nextEntry.snapshot.episode}화 변화 예정`
          : null,
      });
    }
  }

  if (safeEpisode < firstEntry.snapshot.episode) {
    return makeInterpolatedState({
      episode: safeEpisode, ageYears: firstEntry.snapshot.ageYears, elapsedMonths: 0, visual: baseVisual,
      psychology: firstEntry.snapshot.psychology, speechTone: firstEntry.snapshot.speechTone,
      activeTriggerEvent: null, interpolationMode: "before-first",
      sourceFromEpisode: safeEpisode, sourceToEpisode: firstEntry.snapshot.episode,
      nextMilestoneEpisode: firstEntry.snapshot.episode,
      nextMilestonePreviewKo:
        normalizeTrigger(firstEntry.snapshot.triggerEvent) ?? `${firstEntry.snapshot.episode}화 첫 기준점`,
    });
  }

  if (safeEpisode > lastEntry.snapshot.episode) {
    return makeInterpolatedState({
      episode: safeEpisode, ageYears: lastEntry.snapshot.ageYears, elapsedMonths: lastEntry.snapshot.elapsedMonths,
      visual: lastEntry.state, psychology: lastEntry.snapshot.psychology, speechTone: lastEntry.snapshot.speechTone,
      activeTriggerEvent: normalizeTrigger(lastEntry.snapshot.triggerEvent), interpolationMode: "after-last",
      sourceFromEpisode: lastEntry.snapshot.episode, sourceToEpisode: safeEpisode,
      nextMilestoneEpisode: null, nextMilestonePreviewKo: null,
    });
  }

  let prevIndex = 0;
  for (let i = 0; i < cumulativeByIndex.length - 1; i += 1) {
    const cur = cumulativeByIndex[i];
    const nxt = cumulativeByIndex[i + 1];
    if (cur && nxt && safeEpisode > cur.snapshot.episode && safeEpisode < nxt.snapshot.episode) {
      prevIndex = i;
      break;
    }
  }
  const prevEntry = cumulativeByIndex[prevIndex];
  const nextEntry = cumulativeByIndex[prevIndex + 1];
  if (!prevEntry || !nextEntry) throw new Error("unreachable: interpolation bounds missing");

  const ratio =
    (safeEpisode - prevEntry.snapshot.episode) / Math.max(1, nextEntry.snapshot.episode - prevEntry.snapshot.episode);
  const lerpPsych = (axis: PsychologyAxis) =>
    clampScore(
      prevEntry.snapshot.psychology[axis] +
        (nextEntry.snapshot.psychology[axis] - prevEntry.snapshot.psychology[axis]) * ratio,
    );

  return makeInterpolatedState({
    episode: safeEpisode,
    ageYears: Math.round((prevEntry.snapshot.ageYears + (nextEntry.snapshot.ageYears - prevEntry.snapshot.ageYears) * ratio) * 10) / 10,
    elapsedMonths: Math.round(prevEntry.snapshot.elapsedMonths + (nextEntry.snapshot.elapsedMonths - prevEntry.snapshot.elapsedMonths) * ratio),
    visual: prevEntry.state,
    psychology: {
      courage: lerpPsych("courage"), trust: lerpPsych("trust"), warmth: lerpPsych("warmth"),
      restraint: lerpPsych("restraint"), ambition: lerpPsych("ambition"),
    },
    speechTone: prevEntry.snapshot.speechTone,
    activeTriggerEvent: normalizeTrigger(prevEntry.snapshot.triggerEvent),
    interpolationMode: "interpolated",
    sourceFromEpisode: prevEntry.snapshot.episode,
    sourceToEpisode: nextEntry.snapshot.episode,
    nextMilestoneEpisode: nextEntry.snapshot.episode,
    nextMilestonePreviewKo:
      normalizeTrigger(nextEntry.snapshot.triggerEvent) ?? `${nextEntry.snapshot.episode}화 외형·심리 변화 예정`,
  });
}

/** UI에서 모순 탐지·1클릭 보정을 즉시 시험할 수 있는 설정 오류 예시를 생성한다. */
export function createContradictionDemoArc(arc: CharacterGrowthArc): CharacterGrowthArc {
  const sorted = sortSnapshots(arc.snapshots);
  const second = sorted[1];
  const third = sorted[2];
  if (!second || !third) return arc;
  const firstScarFromSecond = second.appearanceDelta.addedScars[0];

  return {
    ...arc,
    snapshots: arc.snapshots.map((snapshot) =>
      snapshot.id === third.id
        ? {
            ...snapshot,
            ageYears: Math.max(1, second.ageYears - 1),
            triggerEvent: "",
            appearanceDelta: {
              ...snapshot.appearanceDelta,
              removedScars: firstScarFromSecond ? [firstScarFromSecond] : [],
            },
            psychology: { ...snapshot.psychology, trust: clampScore(second.psychology.trust >= 50 ? 0 : 98) },
          }
        : snapshot,
    ),
  };
}

/** 기본 캐릭터 성장 아크 프리셋 2종 (이도현 · 세라피나 — 1화→25화→60화 실데이터) */
export const DEFAULT_CHARACTER_GROWTH_PRESETS: readonly CharacterGrowthArc[] = [
  {
    id: "preset-lee-dohyun",
    characterName: "이도현",
    roleSummary: "게이트 정리반 출신 각성 헌터 → 선봉대장",
    genreLabel: "현대 판타지",
    baselineHair: "눈을 살짝 덮는 검은 단발",
    baselineOutfit: "회색 후드 집업 · 작업용 방진화",
    baselineProps: ["낡은 철제 단검"],
    lockedSpeechTone: null,
    snapshots: [
      {
        id: "dohyun-ep1", episode: 1, ageYears: 19, elapsedMonths: 0,
        appearanceDelta: { addedScars: [], hair: "눈을 살짝 덮는 검은 단발", outfit: "회색 후드 집업 · 작업용 방진화", addedProps: ["낡은 철제 단검"] },
        psychology: { courage: 38, trust: 72, warmth: 76, restraint: 44, ambition: 30 },
        speechTone: "casual",
        triggerEvent: "1화 서울 외곽 E급 게이트 붕괴 현장에서 민간인을 대피시키며 첫 각성",
      },
      {
        id: "dohyun-ep25", episode: 25, ageYears: 20, elapsedMonths: 11,
        appearanceDelta: { addedScars: ["왼뺨 사선 흉터"], hair: "이마를 드러낸 짧은 투블럭", outfit: "검은 방탄 전술 코트", addedProps: ["흑요석 쌍단검"], removedProps: ["낡은 철제 단검"] },
        psychology: { courage: 66, trust: 46, warmth: 58, restraint: 70, ambition: 56 },
        speechTone: "terse",
        triggerEvent: "25화 길드 배신과 지하 보스전 중 동료를 감싸다 왼뺨에 칼상을 입음",
      },
      {
        id: "dohyun-ep60", episode: 60, ageYears: 22, elapsedMonths: 34,
        appearanceDelta: { addedScars: ["오른손등 마력 화상 자국"], hair: "뒤로 넘긴 단정한 흑발", outfit: "은사 문양 헌터 지휘관 코트", addedProps: ["균열의 나침반"] },
        psychology: { courage: 86, trust: 64, warmth: 66, restraint: 84, ambition: 78 },
        speechTone: "formal",
        triggerEvent: "60화 수도권 대균열 방어전을 지휘하며 선봉대장으로 취임",
      },
    ],
  },
  {
    id: "preset-seraphina",
    characterName: "세라피나",
    roleSummary: "몰락 위기 백작가 장녀 → 북부 개혁 공작부인",
    genreLabel: "로맨스 판타지",
    baselineHair: "진주 핀으로 묶은 긴 은발 웨이브",
    baselineOutfit: "상아색 레이스 살롱 드레스",
    baselineProps: ["백작가 은빛 인장 반지"],
    lockedSpeechTone: null,
    snapshots: [
      {
        id: "seraphina-ep1", episode: 1, ageYears: 18, elapsedMonths: 0,
        appearanceDelta: { addedScars: [], hair: "진주 핀으로 묶은 긴 은발 웨이브", outfit: "상아색 레이스 살롱 드레스", addedProps: ["백작가 은빛 인장 반지"] },
        psychology: { courage: 32, trust: 78, warmth: 82, restraint: 62, ambition: 24 },
        speechTone: "formal",
        triggerEvent: "1화 황궁 무도회에서 약혼자의 공개 파혼 선언을 맞닥뜨림",
      },
      {
        id: "seraphina-ep25", episode: 25, ageYears: 19, elapsedMonths: 14,
        appearanceDelta: { addedScars: ["오른쪽 쇄골 계약 각인 흉터"], hair: "어깨선 단발로 자른 은발", outfit: "짙은 감색 승마 재킷 · 망토", addedProps: ["고대 회중시계"] },
        psychology: { courage: 68, trust: 36, warmth: 48, restraint: 78, ambition: 72 },
        speechTone: "cynical",
        triggerEvent: "25화 독살 미수 사건 뒤 가문 독립을 선언하고 금지된 계약 인장을 새김",
      },
      {
        id: "seraphina-ep60", episode: 60, ageYears: 21, elapsedMonths: 36,
        appearanceDelta: { addedScars: ["왼손목 은빛 마력 흉터"], hair: "금장 비녀로 올린 업스타일 은발", outfit: "적동색 자수 공작부인 예복", addedProps: ["황실 칙령서"] },
        psychology: { courage: 88, trust: 62, warmth: 68, restraint: 86, ambition: 84 },
        speechTone: "warm",
        triggerEvent: "60화 북부 영지 구원 협정을 성사시키며 스스로 새 질서를 세움",
      },
    ],
  },
];
