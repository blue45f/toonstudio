/**
 * Wave 89: 심볼릭 전수 경로 세계관 상태 불변식(World State Invariants) 컴파일러 및 감사기.
 *
 * - 시작 컷부터 모든 엔딩까지 도달 가능한 전 분기 경로를 BFS + 방문 상태 메모이제이션 +
 *   순환 깊이 상한으로 전수 탐색하며 5대 서사 모순과 최소 반례 경로를 결정론적으로 보고한다.
 */

import {
  DEFAULT_WORLD_STATE_BOUNDS,
  canonicalSerializeMultiverse,
  sha256MultiverseHex,
  type CharacterAvailabilityStatus,
  type CharacterWorldState,
  type ChoiceEdge,
  type CostumeCondition,
  type CutCanonRequirement,
  type DialogueLine,
  type InitialWorldStateConfig,
  type MultiverseCutNode,
  type MultiverseEpisodeDag,
  type PanelLayerRef,
  type WorldStateBounds,
  type WorldStateEffect,
  type WorldStateGuardCondition,
} from "./multiverse-merkle-cut-store";

export type WorldStateContradictionCode =
  | "impossible-item-usage"
  | "costume-state-contradiction"
  | "character-availability-violation"
  | "unreachable-ending"
  | "dialogue-spoiler-leak";

export interface WorldStateSnapshot {
  readonly characters: Readonly<Record<string, CharacterWorldState>>;
  readonly inventory: Readonly<Record<string, boolean>>;
  readonly relationships: Readonly<Record<string, number>>;
  readonly knownSecrets: readonly string[];
  readonly relationshipBounds: WorldStateBounds;
}

export interface MinimalCounterexampleTrace {
  readonly pathNodeIds: readonly string[];
  readonly choiceLabelsKo: readonly string[];
  readonly branchTags: readonly string[];
  readonly edgeIds: readonly string[];
  readonly failingCutId: string;
  readonly failingCutNumber: number;
  readonly stateAtFailure: WorldStateSnapshot;
}

export interface WorldStateContradiction {
  readonly code: WorldStateContradictionCode;
  readonly severity: "error";
  readonly cutId: string;
  readonly cutNumber: number;
  readonly subjectId: string;
  readonly messageKo: string;
  readonly counterexample: MinimalCounterexampleTrace;
}

export interface EndingReachabilityWitness {
  readonly endingCutId: string;
  readonly endingId: string;
  readonly endingTitleKo: string;
  readonly endingTag: string;
  readonly reachablePathCount: number;
  readonly shortestPathNodeIds: readonly string[];
  readonly shortestChoiceLabelsKo: readonly string[];
  readonly finalStateSnapshot: WorldStateSnapshot;
}

export interface ResolvedCutProjection {
  readonly cutId: string;
  readonly appliedVariantIds: readonly string[];
  readonly layers: readonly PanelLayerRef[];
  readonly dialogue: readonly DialogueLine[];
  readonly requirements: CutCanonRequirement;
}

export interface SilentCostumeRegression {
  readonly characterId: string;
  readonly previousCostume: CostumeCondition;
  readonly attemptedCostume: CostumeCondition;
}

export interface VerifyWorldStateOptions {
  readonly maxPathDepth?: number;
  readonly maxCycleRevisitsPerCut?: number;
  readonly maxExploredStates?: number;
}

export interface MultiverseWorldStateAuditReport {
  readonly episodeId: string;
  readonly episodeMerkleRoot: string;
  readonly passed: boolean;
  readonly exploredStateCount: number;
  readonly exploredPathCount: number;
  readonly maxDepthReached: number;
  readonly explorationTruncated: boolean;
  readonly reachableEndingIds: readonly string[];
  readonly unreachableEndingIds: readonly string[];
  readonly endingWitnesses: Readonly<Record<string, EndingReachabilityWitness>>;
  readonly contradictions: readonly WorldStateContradiction[];
  readonly contradictionCountsByCode: Readonly<Record<WorldStateContradictionCode, number>>;
  readonly summaryKo: string;
}

const DEFAULT_SPEAKER_STATUSES: readonly CharacterAvailabilityStatus[] = ["alive", "injured"];
const DAMAGED_COSTUMES: ReadonlySet<CostumeCondition> = new Set<CostumeCondition>(["wet", "torn", "bloodstained"]);
const COSTUME_KO: Readonly<Record<CostumeCondition, string>> = {
  intact: "멀쩡함",
  wet: "젖음",
  torn: "찢어짐",
  bloodstained: "혈흔 오염",
  changed: "갈아입음",
};
const STATUS_KO: Readonly<Record<CharacterAvailabilityStatus, string>> = {
  alive: "정상 활동",
  injured: "부상",
  unconscious: "의식 불명",
  absent: "부재중",
};

function clampRelationship(value: number, bounds: WorldStateBounds): number {
  if (!Number.isFinite(value)) return 0;
  if (value < bounds.minRelationship) return bounds.minRelationship;
  if (value > bounds.maxRelationship) return bounds.maxRelationship;
  return Math.round(value * 1000) / 1000;
}

/** 초기 세계관 설정으로부터 정규화된 불변 상태 스냅샷을 생성한다. */
export function createInitialWorldStateSnapshot(config: InitialWorldStateConfig): WorldStateSnapshot {
  const bounds: WorldStateBounds = {
    minRelationship: config.relationshipBounds?.minRelationship ?? DEFAULT_WORLD_STATE_BOUNDS.minRelationship,
    maxRelationship: config.relationshipBounds?.maxRelationship ?? DEFAULT_WORLD_STATE_BOUNDS.maxRelationship,
  };
  const characters: Record<string, CharacterWorldState> = {};
  for (const ch of config.characters) characters[ch.characterId] = { ...ch };

  const inventory: Record<string, boolean> = {};
  if (config.inventory) {
    for (const k of Object.keys(config.inventory).sort()) inventory[k] = Boolean(config.inventory[k]);
  }
  const relationships: Record<string, number> = {};
  if (config.relationships) {
    for (const k of Object.keys(config.relationships).sort()) {
      relationships[k] = clampRelationship(config.relationships[k] ?? 0, bounds);
    }
  }
  return {
    characters,
    inventory,
    relationships,
    knownSecrets: Array.from(new Set<string>(config.knownSecrets ?? [])).sort(),
    relationshipBounds: bounds,
  };
}

/** 방문 상태 메모이제이션용 결정론적 SHA-256 상태 지문을 생성한다. */
export function computeWorldStateFingerprint(state: WorldStateSnapshot): string {
  return sha256MultiverseHex(canonicalSerializeMultiverse(state));
}

/** 선택지 또는 조건부 변형의 가드 조건식을 주어진 세계관 상태에서 평가한다. */
export function evaluateWorldStateGuard(guard: WorldStateGuardCondition, state: WorldStateSnapshot): boolean {
  switch (guard.kind) {
    case "item-has":
      return Boolean(state.inventory[guard.itemId]) === guard.expected;
    case "character-status": {
      const ch = state.characters[guard.characterId];
      return ch !== undefined && guard.allowed.indexOf(ch.status) >= 0;
    }
    case "costume-is": {
      const ch = state.characters[guard.characterId];
      return ch !== undefined && guard.allowed.indexOf(ch.costume) >= 0;
    }
    case "relationship-range": {
      const score = state.relationships[guard.targetId] ?? 0;
      if (guard.min !== undefined && score < guard.min) return false;
      if (guard.max !== undefined && score > guard.max) return false;
      return true;
    }
    case "secret-known":
      return (state.knownSecrets.indexOf(guard.secretId) >= 0) === guard.expected;
    case "all":
      return guard.conditions.every((sub) => evaluateWorldStateGuard(sub, state));
    case "any":
      return guard.conditions.some((sub) => evaluateWorldStateGuard(sub, state));
    case "not":
      return !evaluateWorldStateGuard(guard.condition, state);
  }
}

/** 세계관 상태 변경 효과를 순차 적용하고, 명시적 교체 없는 의상 원복 시도를 기록한다. */
export function applyWorldStateEffects(
  state: WorldStateSnapshot,
  effects: readonly WorldStateEffect[] | undefined,
): { readonly nextState: WorldStateSnapshot; readonly silentCostumeRegressions: readonly SilentCostumeRegression[] } {
  if (!effects || effects.length === 0) return { nextState: state, silentCostumeRegressions: [] };

  const characters: Record<string, CharacterWorldState> = {};
  for (const key of Object.keys(state.characters)) {
    const ch = state.characters[key];
    if (ch) characters[key] = { ...ch };
  }
  const inventory: Record<string, boolean> = { ...state.inventory };
  const relationships: Record<string, number> = { ...state.relationships };
  const secretSet = new Set<string>(state.knownSecrets);
  const silentCostumeRegressions: SilentCostumeRegression[] = [];

  for (const effect of effects) {
    switch (effect.kind) {
      case "set-item":
        inventory[effect.itemId] = effect.value;
        break;
      case "set-character-status": {
        const prev = characters[effect.characterId];
        characters[effect.characterId] = prev
          ? { ...prev, status: effect.status }
          : { characterId: effect.characterId, displayNameKo: effect.characterId, status: effect.status, costume: "intact" };
        break;
      }
      case "set-costume": {
        const prev = characters[effect.characterId];
        const prevCostume: CostumeCondition = prev ? prev.costume : "intact";
        if (DAMAGED_COSTUMES.has(prevCostume) && effect.costume === "intact" && effect.explicitChange !== true) {
          silentCostumeRegressions.push({
            characterId: effect.characterId,
            previousCostume: prevCostume,
            attemptedCostume: effect.costume,
          });
        } else {
          characters[effect.characterId] = prev
            ? { ...prev, costume: effect.costume }
            : { characterId: effect.characterId, displayNameKo: effect.characterId, status: "alive", costume: effect.costume };
        }
        break;
      }
      case "adjust-relationship":
        relationships[effect.targetId] = clampRelationship((relationships[effect.targetId] ?? 0) + effect.delta, state.relationshipBounds);
        break;
      case "set-relationship":
        relationships[effect.targetId] = clampRelationship(effect.value, state.relationshipBounds);
        break;
      case "reveal-secret":
        secretSet.add(effect.secretId);
        break;
      case "forget-secret":
        secretSet.delete(effect.secretId);
        break;
    }
  }

  return {
    nextState: {
      characters,
      inventory,
      relationships,
      knownSecrets: Array.from(secretSet).sort(),
      relationshipBounds: state.relationshipBounds,
    },
    silentCostumeRegressions,
  };
}

/** 현재 세계관 상태와 일치하는 조건부 레이어·대사·검증 요구사항 변형을 우선순위 순으로 투영한다. */
export function resolveCutForWorldState(cut: MultiverseCutNode, state: WorldStateSnapshot): ResolvedCutProjection {
  const layerMap = new Map<string, PanelLayerRef>(cut.baseLayers.map((layer) => [layer.layerId, layer]));
  let dialogue: readonly DialogueLine[] = cut.dialogue ?? [];
  let requirements: CutCanonRequirement = { ...(cut.requirements ?? {}) };
  const appliedVariantIds: string[] = [];

  const sortedVariants = (cut.conditionalVariants ?? [])
    .slice()
    .sort((a, b) => a.priority - b.priority || a.variantId.localeCompare(b.variantId));

  for (const variant of sortedVariants) {
    if (!evaluateWorldStateGuard(variant.when, state)) continue;
    appliedVariantIds.push(variant.variantId);
    for (const layer of variant.overrideLayers ?? []) layerMap.set(layer.layerId, layer);
    if (variant.overrideDialogueKo) dialogue = variant.overrideDialogueKo;
    if (variant.overrideRequirements) requirements = { ...requirements, ...variant.overrideRequirements };
  }

  const layers = Array.from(layerMap.values()).sort((a, b) => a.zIndex - b.zIndex || a.layerId.localeCompare(b.layerId));
  return { cutId: cut.cutId, appliedVariantIds, layers, dialogue, requirements };
}

function formatBranchPrefixKo(branchTags: readonly string[], choiceLabelsKo: readonly string[]): string {
  const branch = branchTags[branchTags.length - 1];
  const choice = choiceLabelsKo[choiceLabelsKo.length - 1];
  if (branch && choice) return `${branch} 분기('${choice}') 경로의`;
  if (choice) return `'${choice}' 선택 경로의`;
  if (branch) return `${branch} 분기 경로의`;
  return "기본 진행 경로의";
}

function resolveNameKo(state: WorldStateSnapshot, characterId: string): string {
  return state.characters[characterId]?.displayNameKo ?? characterId;
}

interface BfsSearchFrame {
  readonly cutId: string;
  readonly state: WorldStateSnapshot;
  readonly pathNodeIds: readonly string[];
  readonly choiceLabelsKo: readonly string[];
  readonly branchTags: readonly string[];
  readonly edgeIds: readonly string[];
  readonly visitCounts: Readonly<Record<string, number>>;
}

interface PendingSpoilerCandidate {
  readonly key: string;
  readonly cutId: string;
  readonly cutNumber: number;
  readonly secretId: string;
  readonly secretLabelKo: string;
  readonly branchPrefixKo: string;
  readonly counterexample: MinimalCounterexampleTrace;
}

interface BlockedEdgeAttempt {
  readonly edge: ChoiceEdge;
  readonly trace: MinimalCounterexampleTrace;
}

/**
 * 분기 에피소드 DAG의 모든 도달 가능 경로를 전수 탐색해 세계관 상태 불변식을 검증한다.
 * BFS 순서로 탐색해 각 모순의 최단 반례 경로(`MinimalCounterexampleTrace`)를 결정론적으로 보고한다.
 */
export function verifyMultiverseWorldStateInvariants(
  dag: MultiverseEpisodeDag,
  options?: VerifyWorldStateOptions,
): MultiverseWorldStateAuditReport {
  const maxPathDepth = options?.maxPathDepth ?? 128;
  const maxCycleRevisitsPerCut = options?.maxCycleRevisitsPerCut ?? 3;
  const maxExploredStates = options?.maxExploredStates ?? 20000;

  const outgoingByCut = new Map<string, ChoiceEdge[]>();
  for (const edge of dag.edges) {
    const list = outgoingByCut.get(edge.fromCutId);
    if (list) list.push(edge);
    else outgoingByCut.set(edge.fromCutId, [edge]);
  }
  outgoingByCut.forEach((list) => list.sort((a, b) => a.edgeId.localeCompare(b.edgeId)));

  const contradictionByKey = new Map<string, WorldStateContradiction>();
  const pendingSpoilers = new Map<string, PendingSpoilerCandidate>();
  const revealedAnywhereSecrets = new Set<string>(dag.initialWorldState.knownSecrets ?? []);
  const endingWitnesses: Record<string, EndingReachabilityWitness> = {};
  const blockedAttemptsByTarget = new Map<string, BlockedEdgeAttempt>();

  const recordContradiction = (key: string, entry: WorldStateContradiction): void => {
    if (!contradictionByKey.has(key)) contradictionByKey.set(key, entry);
  };
  const recordSilentRegressions = (
    regressions: readonly SilentCostumeRegression[],
    cut: MultiverseCutNode,
    prefix: string,
    phaseKo: string,
    trace: MinimalCounterexampleTrace,
    prevState: WorldStateSnapshot,
  ): void => {
    for (const reg of regressions) {
      recordContradiction(`costume-state-contradiction:${cut.cutId}:${reg.characterId}`, {
        code: "costume-state-contradiction",
        severity: "error",
        cutId: cut.cutId,
        cutNumber: cut.cutNumber,
        subjectId: reg.characterId,
        messageKo: `${prefix} ${cut.cutNumber}컷${phaseKo} '${resolveNameKo(prevState, reg.characterId)}'의 의상이 명시적 교체 이벤트 없이 '${COSTUME_KO[reg.previousCostume]}'에서 '${COSTUME_KO[reg.attemptedCostume]}'으로 되돌아갔습니다.`,
        counterexample: trace,
      });
    }
  };

  let exploredStateCount = 0;
  let exploredPathCount = 0;
  let maxDepthReached = 0;
  let explorationTruncated = false;

  const startCut = dag.cuts[dag.startCutId];
  if (startCut) {
    const initialState = createInitialWorldStateSnapshot(dag.initialWorldState);
    const visitedStateKeys = new Set<string>([`${startCut.cutId}::${computeWorldStateFingerprint(initialState)}`]);
    const queue: BfsSearchFrame[] = [
      {
        cutId: startCut.cutId,
        state: initialState,
        pathNodeIds: [startCut.cutId],
        choiceLabelsKo: [],
        branchTags: [],
        edgeIds: [],
        visitCounts: { [startCut.cutId]: 1 },
      },
    ];

    for (let head = 0; head < queue.length; head += 1) {
      const frame = queue[head];
      if (!frame) break;
      if (exploredStateCount >= maxExploredStates) {
        explorationTruncated = true;
        break;
      }
      exploredStateCount += 1;
      if (frame.pathNodeIds.length > maxDepthReached) maxDepthReached = frame.pathNodeIds.length;

      const cut = dag.cuts[frame.cutId];
      if (!cut) continue;

      const prefix = formatBranchPrefixKo(frame.branchTags, frame.choiceLabelsKo);
      const buildTrace = (snapshot: WorldStateSnapshot): MinimalCounterexampleTrace => ({
        pathNodeIds: frame.pathNodeIds.slice(),
        choiceLabelsKo: frame.choiceLabelsKo.slice(),
        branchTags: frame.branchTags.slice(),
        edgeIds: frame.edgeIds.slice(),
        failingCutId: cut.cutId,
        failingCutNumber: cut.cutNumber,
        stateAtFailure: snapshot,
      });

      const enterApplied = applyWorldStateEffects(frame.state, cut.onEnterEffects);
      const stateAtCut = enterApplied.nextState;
      for (const s of stateAtCut.knownSecrets) revealedAnywhereSecrets.add(s);
      recordSilentRegressions(enterApplied.silentCostumeRegressions, cut, prefix, "에서", buildTrace(frame.state), frame.state);

      const resolved = resolveCutForWorldState(cut, stateAtCut);

      // 1) 소품 사용 모순 (`impossible-item-usage`)
      for (const req of resolved.requirements.requiredItems ?? []) {
        const expected = req.expectedValue ?? true;
        const actual = Boolean(stateAtCut.inventory[req.itemId]);
        const isBroken = req.forbiddenBrokenFlagId !== undefined && Boolean(stateAtCut.inventory[req.forbiddenBrokenFlagId]);
        if (isBroken) {
          recordContradiction(`impossible-item-usage:${cut.cutId}:${req.itemId}`, {
            code: "impossible-item-usage",
            severity: "error",
            cutId: cut.cutId,
            cutNumber: cut.cutNumber,
            subjectId: req.itemId,
            messageKo: `${prefix} ${cut.cutNumber}컷에서 이미 파손된 '${req.itemLabelKo}' 소품을 사용하고 있습니다.`,
            counterexample: buildTrace(stateAtCut),
          });
        } else if (actual !== expected) {
          const reason = expected ? "보유하지 않은" : "이미 보유 중이라 사용할 수 없는";
          recordContradiction(`impossible-item-usage:${cut.cutId}:${req.itemId}`, {
            code: "impossible-item-usage",
            severity: "error",
            cutId: cut.cutId,
            cutNumber: cut.cutNumber,
            subjectId: req.itemId,
            messageKo: `${prefix} ${cut.cutNumber}컷에서 ${reason} '${req.itemLabelKo}' 소품을 사용하고 있습니다.`,
            counterexample: buildTrace(stateAtCut),
          });
        }
      }

      // 2) 의상 상태 모순 (`costume-state-contradiction`)
      const costumeChecks: Array<{ readonly characterId: string; readonly expectedCostume: CostumeCondition }> = [
        ...(resolved.requirements.depictedCostumes ?? []).map((c) => ({
          characterId: c.characterId,
          expectedCostume: c.expectedCostume,
        })),
        ...resolved.layers
          .filter((l): l is PanelLayerRef & { readonly characterId: string; readonly depictedCostume: CostumeCondition } =>
            Boolean(l.characterId && l.depictedCostume),
          )
          .map((l) => ({ characterId: l.characterId, expectedCostume: l.depictedCostume })),
      ];
      for (const check of costumeChecks) {
        const ch = stateAtCut.characters[check.characterId];
        if (ch && ch.costume !== check.expectedCostume) {
          recordContradiction(`costume-state-contradiction:${cut.cutId}:${check.characterId}`, {
            code: "costume-state-contradiction",
            severity: "error",
            cutId: cut.cutId,
            cutNumber: cut.cutNumber,
            subjectId: check.characterId,
            messageKo: `${prefix} ${cut.cutNumber}컷에서 '${ch.displayNameKo}'의 의상이 현재 상태('${COSTUME_KO[ch.costume]}')와 달리 '${COSTUME_KO[check.expectedCostume]}' 상태로 그려져 있습니다(의상 교체 이벤트 누락).`,
            counterexample: buildTrace(stateAtCut),
          });
        }
      }

      // 3) 캐릭터 부재/의식불명 발화 모순 (`character-availability-violation`)
      const speakerChecks = [
        ...(resolved.requirements.speakingCharacters ?? []).map((sp) => ({
          characterId: sp.characterId,
          allowed: sp.allowedStatuses ?? DEFAULT_SPEAKER_STATUSES,
        })),
        ...resolved.dialogue.map((line) => ({
          characterId: line.speakerCharacterId,
          allowed: DEFAULT_SPEAKER_STATUSES,
        })),
      ];
      for (const check of speakerChecks) {
        const ch = stateAtCut.characters[check.characterId];
        if (ch && check.allowed.indexOf(ch.status) < 0) {
          recordContradiction(`character-availability-violation:${cut.cutId}:${check.characterId}`, {
            code: "character-availability-violation",
            severity: "error",
            cutId: cut.cutId,
            cutNumber: cut.cutNumber,
            subjectId: check.characterId,
            messageKo: `${prefix} ${cut.cutNumber}컷에서 현재 '${STATUS_KO[ch.status]}' 상태인 '${ch.displayNameKo}'가 복귀·회복 이벤트 없이 대사를 말하고 있습니다.`,
            counterexample: buildTrace(stateAtCut),
          });
        }
      }

      // 4) 교차 분기 스포일러 유출 (`dialogue-spoiler-leak`)
      const secretRefs: Array<{ readonly secretId: string; readonly secretLabelKo: string }> = [
        ...(resolved.requirements.referencedSecrets ?? []).map((sr) => ({
          secretId: sr.secretId,
          secretLabelKo: sr.secretLabelKo,
        })),
      ];
      for (const line of resolved.dialogue) {
        for (const sid of line.referencedSecretIds ?? []) {
          secretRefs.push({ secretId: sid, secretLabelKo: dag.initialWorldState.secretLabelsKo?.[sid] ?? sid });
        }
      }
      for (const ref of secretRefs) {
        if (stateAtCut.knownSecrets.indexOf(ref.secretId) < 0) {
          const key = `dialogue-spoiler-leak:${cut.cutId}:${ref.secretId}`;
          if (!pendingSpoilers.has(key)) {
            pendingSpoilers.set(key, {
              key,
              cutId: cut.cutId,
              cutNumber: cut.cutNumber,
              secretId: ref.secretId,
              secretLabelKo: ref.secretLabelKo,
              branchPrefixKo: prefix,
              counterexample: buildTrace(stateAtCut),
            });
          }
        }
      }

      // 컷 퇴장 효과 및 엔딩 기록
      const exitApplied = applyWorldStateEffects(stateAtCut, cut.onExitEffects);
      const postCutState = exitApplied.nextState;
      for (const s of postCutState.knownSecrets) revealedAnywhereSecrets.add(s);
      recordSilentRegressions(exitApplied.silentCostumeRegressions, cut, prefix, " 퇴장 시", buildTrace(stateAtCut), stateAtCut);

      const isEnding = cut.ending !== undefined || cut.nodeKind === "ending";
      if (isEnding) {
        exploredPathCount += 1;
        const existing = endingWitnesses[cut.cutId];
        endingWitnesses[cut.cutId] = existing
          ? { ...existing, reachablePathCount: existing.reachablePathCount + 1 }
          : {
              endingCutId: cut.cutId,
              endingId: cut.ending?.endingId ?? cut.cutId,
              endingTitleKo: cut.ending?.endingTitleKo ?? cut.titleKo,
              endingTag: cut.ending?.endingTag ?? "neutral",
              reachablePathCount: 1,
              shortestPathNodeIds: frame.pathNodeIds.slice(),
              shortestChoiceLabelsKo: frame.choiceLabelsKo.slice(),
              finalStateSnapshot: postCutState,
            };
      }

      const outEdges = outgoingByCut.get(cut.cutId) ?? [];
      if (outEdges.length === 0 && !isEnding) exploredPathCount += 1;

      for (const edge of outEdges) {
        if (edge.guard && !evaluateWorldStateGuard(edge.guard, postCutState)) {
          if (!blockedAttemptsByTarget.has(edge.toCutId)) {
            blockedAttemptsByTarget.set(edge.toCutId, { edge, trace: buildTrace(postCutState) });
          }
          continue;
        }
        if (frame.pathNodeIds.length + 1 > maxPathDepth) {
          explorationTruncated = true;
          continue;
        }
        const prevVisits = frame.visitCounts[edge.toCutId] ?? 0;
        if (prevVisits >= maxCycleRevisitsPerCut) continue;

        const nextCut = dag.cuts[edge.toCutId];
        if (!nextCut) continue;
        const edgeApplied = applyWorldStateEffects(postCutState, edge.effects);
        const nextState = edgeApplied.nextState;
        for (const s of nextState.knownSecrets) revealedAnywhereSecrets.add(s);

        const nextChoiceLabels = edge.isAutoAdvance
          ? frame.choiceLabelsKo.slice()
          : frame.choiceLabelsKo.concat([edge.choiceLabelKo]);
        const nextBranchTags = edge.branchTag ? frame.branchTags.concat([edge.branchTag]) : frame.branchTags.slice();
        const nextPathIds = frame.pathNodeIds.concat([edge.toCutId]);
        const nextEdgeIds = frame.edgeIds.concat([edge.edgeId]);

        recordSilentRegressions(
          edgeApplied.silentCostumeRegressions,
          nextCut,
          formatBranchPrefixKo(nextBranchTags, nextChoiceLabels),
          " 진입 전",
          {
            pathNodeIds: nextPathIds,
            choiceLabelsKo: nextChoiceLabels,
            branchTags: nextBranchTags,
            edgeIds: nextEdgeIds,
            failingCutId: nextCut.cutId,
            failingCutNumber: nextCut.cutNumber,
            stateAtFailure: postCutState,
          },
          postCutState,
        );

        const stateKey = `${edge.toCutId}::${computeWorldStateFingerprint(nextState)}`;
        if (visitedStateKeys.has(stateKey)) continue;
        visitedStateKeys.add(stateKey);
        queue.push({
          cutId: edge.toCutId,
          state: nextState,
          pathNodeIds: nextPathIds,
          choiceLabelsKo: nextChoiceLabels,
          branchTags: nextBranchTags,
          edgeIds: nextEdgeIds,
          visitCounts: { ...frame.visitCounts, [edge.toCutId]: prevVisits + 1 },
        });
      }
    }
  }

  pendingSpoilers.forEach((cand) => {
    const origin = revealedAnywhereSecrets.has(cand.secretId)
      ? "다른 분기에서만 공개되는 비밀"
      : "어느 분기에서도 공개되지 않은 비밀";
    recordContradiction(cand.key, {
      code: "dialogue-spoiler-leak",
      severity: "error",
      cutId: cand.cutId,
      cutNumber: cand.cutNumber,
      subjectId: cand.secretId,
      messageKo: `${cand.branchPrefixKo} ${cand.cutNumber}컷에서 ${origin} '${cand.secretLabelKo}'을 대사로 먼저 언급하고 있습니다.`,
      counterexample: cand.counterexample,
    });
  });

  // 5) 도달 불가능한 엔딩 (`unreachable-ending`)
  const reachableEndingIds: string[] = [];
  const unreachableEndingIds: string[] = [];
  const fallbackState = createInitialWorldStateSnapshot(dag.initialWorldState);

  for (const cutId of Object.keys(dag.cuts).sort()) {
    const cut = dag.cuts[cutId];
    if (!cut || (cut.ending === undefined && cut.nodeKind !== "ending")) continue;
    if (Object.prototype.hasOwnProperty.call(endingWitnesses, cutId)) {
      reachableEndingIds.push(cutId);
    } else {
      unreachableEndingIds.push(cutId);
      const endingTitle = cut.ending?.endingTitleKo ?? cut.titleKo;
      const endingId = cut.ending?.endingId ?? cutId;
      const blocked = blockedAttemptsByTarget.get(cutId);
      const counterexample: MinimalCounterexampleTrace = blocked
        ? { ...blocked.trace, failingCutId: cut.cutId, failingCutNumber: cut.cutNumber }
        : {
            pathNodeIds: startCut ? [startCut.cutId] : [],
            choiceLabelsKo: [],
            branchTags: [],
            edgeIds: [],
            failingCutId: cut.cutId,
            failingCutNumber: cut.cutNumber,
            stateAtFailure: fallbackState,
          };
      const blockDetail = blocked
        ? `('${blocked.edge.choiceLabelKo}' 진입 조건식 불충족)`
        : "(도달 가능한 분기 경로 없음)";
      recordContradiction(`unreachable-ending:${cut.cutId}:${endingId}`, {
        code: "unreachable-ending",
        severity: "error",
        cutId: cut.cutId,
        cutNumber: cut.cutNumber,
        subjectId: endingId,
        messageKo: `선언된 엔딩 '${endingTitle}'(${cut.cutNumber}컷)에 도달 가능한 분기 경로가 없습니다${blockDetail}.`,
        counterexample,
      });
    }
  }

  const contradictions = Array.from(contradictionByKey.values()).sort(
    (a, b) => a.cutNumber - b.cutNumber || a.code.localeCompare(b.code) || a.subjectId.localeCompare(b.subjectId),
  );
  const contradictionCountsByCode: Record<WorldStateContradictionCode, number> = {
    "impossible-item-usage": 0,
    "costume-state-contradiction": 0,
    "character-availability-violation": 0,
    "unreachable-ending": 0,
    "dialogue-spoiler-leak": 0,
  };
  for (const item of contradictions) contradictionCountsByCode[item.code] += 1;

  const passed = contradictions.length === 0 && !explorationTruncated;
  return {
    episodeId: dag.episodeId,
    episodeMerkleRoot: dag.episodeMerkleRoot,
    passed,
    exploredStateCount,
    exploredPathCount,
    maxDepthReached,
    explorationTruncated,
    reachableEndingIds,
    unreachableEndingIds,
    endingWitnesses,
    contradictions,
    contradictionCountsByCode,
    summaryKo: passed
      ? `세계관 상태 불변식 검증 통과: 상태 ${exploredStateCount}건 전수 검증, 도달 가능 엔딩 ${reachableEndingIds.length}개, 모순 0건.`
      : `세계관 상태 불변식 위반 ${contradictions.length}건 발견 (소품 ${contradictionCountsByCode["impossible-item-usage"]}, 의상 ${contradictionCountsByCode["costume-state-contradiction"]}, 발화자 ${contradictionCountsByCode["character-availability-violation"]}, 미도달 엔딩 ${contradictionCountsByCode["unreachable-ending"]}, 스포일러 유출 ${contradictionCountsByCode["dialogue-spoiler-leak"]}).`,
  };
}
