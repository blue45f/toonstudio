/**
 * #34 무서버 인터랙티브 선택 분기형 웹툰 정적 익스포터 (₩0 서버 상태 · 로컬 정적 컴파일).
 *
 * - 시작 노드, 독자 선택지, 조건 상태 플래그(`trust >= 2` 등), 숨겨진 시크릿 컷, 다중 엔딩으로
 *   구성된 분기 컷 그래프를 검증·컴파일한다.
 * - 정적 그래프 검증기(Tarjan SCC + 유한 상태 공간 BFS)로 막다른 길(dead-end), 도달 불가 엔딩/시크릿 컷,
 *   조건부 소프트락, 무한 무가드 루프(infinite unguarded loop)를 배포 전 100% 검출한다.
 * - 서버 상태 비용 ₩0으로 즉시 정적 배포 가능한 JSON 매니페스트, 단독 실행 HTML/JS 엣지 런타임,
 *   SHA-256 무결성 엣지 런타임 매니페스트를 산출한다.
 */

import {
  applyBranchMutations,
  computeNodesReachingAnyEnding,
  evaluateBranchCondition,
  extractConditionFlags,
  findStronglyConnectedCycles,
  parseBranchCondition,
  renderStandaloneBranchingHtml,
  simulateBranchingPlaythrough,
  type BranchingPlaythroughResult,
  type BranchingPlaythroughStep,
  type BranchMutationOp,
  type BranchStateMap,
  type BranchStateMutation,
  type BranchStateValue,
  type ComparisonOperator,
  type CompiledBranchChoice,
  type CompiledBranchNode,
  type ConditionAstNode,
  type ConditionParseResult,
  type StaticBranchingManifest,
} from "./branching-condition-and-runtime";
import { canonicalJsonStringify, encodeUtf8, sha256HexFromText } from "./sha256-digest";

export {
  applyBranchMutations,
  evaluateBranchCondition,
  extractConditionFlags,
  parseBranchCondition,
  renderStandaloneBranchingHtml,
  simulateBranchingPlaythrough,
  type BranchingPlaythroughResult,
  type BranchingPlaythroughStep,
  type BranchMutationOp,
  type BranchStateMap,
  type BranchStateMutation,
  type BranchStateValue,
  type ComparisonOperator,
  type CompiledBranchChoice,
  type CompiledBranchNode,
  type ConditionAstNode,
  type ConditionParseResult,
  type StaticBranchingManifest,
};

export type BranchCutKind = "cut" | "choice" | "secret" | "ending";
export type BranchEndingTier = "true" | "good" | "normal" | "bad" | "secret";

export interface BranchChoiceEdge {
  readonly choiceId: string;
  readonly label: string;
  readonly targetNodeId: string;
  readonly condition?: string;
  readonly effects?: readonly BranchStateMutation[];
  readonly hiddenUntilUnlocked?: boolean;
  readonly lockHint?: string;
}

export interface BranchCutNode {
  readonly id: string;
  readonly title: string;
  readonly kind: BranchCutKind;
  readonly imageAssetPath: string;
  readonly caption?: string;
  readonly endingCode?: string;
  readonly endingTier?: BranchEndingTier;
  readonly unlockCondition?: string;
  readonly onEnterEffects?: readonly BranchStateMutation[];
  readonly nextNodeId?: string;
  readonly choices?: readonly BranchChoiceEdge[];
}

export interface BranchingEpisodeGraph {
  readonly episodeId: string;
  readonly title: string;
  readonly author: string;
  readonly version: string;
  readonly locale?: "ko" | "en" | "ja" | "zh";
  readonly startNodeId: string;
  readonly initialFlags?: Readonly<BranchStateMap>;
  readonly nodes: readonly BranchCutNode[];
}

export type BranchingValidationIssueCode =
  | "MISSING_START_NODE"
  | "DUPLICATE_NODE_ID"
  | "DUPLICATE_CHOICE_ID"
  | "BROKEN_TARGET_REF"
  | "INVALID_CONDITION_SYNTAX"
  | "NO_ENDING_DEFINED"
  | "ENDING_HAS_OUTGOING_EDGES"
  | "DEAD_END_NODE"
  | "CONDITIONAL_DEAD_END"
  | "UNREACHABLE_NODE"
  | "UNREACHABLE_ENDING"
  | "UNREACHABLE_SECRET_CUT"
  | "INFINITE_UNGUARDED_LOOP";

export interface BranchingValidationIssue {
  readonly code: BranchingValidationIssueCode;
  readonly severity: "error" | "warning";
  readonly nodeId?: string;
  readonly choiceId?: string;
  readonly cycleNodeIds?: readonly string[];
  readonly messageKo: string;
}

export interface BranchingGraphValidationReport {
  readonly valid: boolean;
  readonly issues: readonly BranchingValidationIssue[];
  readonly reachableNodeIds: readonly string[];
  readonly unreachableNodeIds: readonly string[];
  readonly reachableEndingIds: readonly string[];
  readonly unreachableEndingIds: readonly string[];
  readonly reachableSecretCutIds: readonly string[];
  readonly unreachableSecretCutIds: readonly string[];
  readonly deadEndNodeIds: readonly string[];
  readonly infiniteLoopCycles: readonly (readonly string[])[];
  readonly maxDepth: number;
  readonly exploredStateCount: number;
}

export interface StaticEdgeRuntimeManifest {
  readonly runtimeMode: "static-edge-zero-server";
  readonly serverStateRequired: false;
  readonly estimatedServerCostKrw: 0;
  readonly cspSafeNoEval: true;
  readonly storageKey: string;
  readonly manifestBytes: number;
  readonly htmlBytes: number;
  readonly totalStaticBundleBytes: number;
  readonly manifestSha256: string;
  readonly htmlSha256: string;
  readonly bundleSha256: string;
}

export interface BranchingStaticExportResult {
  readonly ok: boolean;
  readonly validation: BranchingGraphValidationReport;
  readonly manifest: StaticBranchingManifest;
  readonly manifestJson: string;
  readonly standaloneHtml: string;
  readonly edgeRuntimeManifest: StaticEdgeRuntimeManifest;
}

export interface BranchingExporterOptions {
  readonly maxExploredStates?: number;
  readonly maxExplorationDepth?: number;
  readonly allowExportWithErrors?: boolean;
}

/**
 * 무서버 선택 분기형 웹툰 정적 익스포터.
 */
export class InteractiveBranchingWebtoonExporter {
  private readonly maxExploredStates: number;
  private readonly maxExplorationDepth: number;
  private readonly allowExportWithErrors: boolean;

  public constructor(options?: BranchingExporterOptions) {
    this.maxExploredStates = options?.maxExploredStates ?? 2048;
    this.maxExplorationDepth = options?.maxExplorationDepth ?? 64;
    this.allowExportWithErrors = options?.allowExportWithErrors ?? false;
  }

  /**
   * 분기 컷 그래프를 검증하고 막다른 길·도달 불가 엔딩·무한 무가드 루프를 정밀 진단한다.
   */
  public validateGraph(graph: BranchingEpisodeGraph): BranchingGraphValidationReport {
    return this.analyzeAndCompile(graph).validation;
  }

  /**
   * 분기 컷 그래프를 검증·컴파일하여 정적 JSON 매니페스트와 단독 HTML/JS 엣지 번들을 산출한다.
   */
  public exportStaticBundle(graph: BranchingEpisodeGraph): BranchingStaticExportResult {
    const { validation, manifest } = this.analyzeAndCompile(graph);
    const manifestJson = JSON.stringify(manifest, null, 2);
    const standaloneHtml =
      validation.valid || this.allowExportWithErrors
        ? renderStandaloneBranchingHtml(manifest)
        : "";

    const manifestBytes = encodeUtf8(manifestJson).length;
    const htmlBytes = encodeUtf8(standaloneHtml).length;
    const manifestSha256 = sha256HexFromText(canonicalJsonStringify(manifest));
    const htmlSha256 = sha256HexFromText(standaloneHtml);
    const bundleSha256 = sha256HexFromText(`${manifestSha256}:${htmlSha256}`);

    return {
      ok: validation.valid,
      validation,
      manifest,
      manifestJson,
      standaloneHtml,
      edgeRuntimeManifest: {
        runtimeMode: "static-edge-zero-server",
        serverStateRequired: false,
        estimatedServerCostKrw: 0,
        cspSafeNoEval: true,
        storageKey: `toonstudio.branch.${manifest.episodeId}.${manifest.version}`,
        manifestBytes,
        htmlBytes,
        totalStaticBundleBytes: manifestBytes + htmlBytes,
        manifestSha256,
        htmlSha256,
        bundleSha256,
      },
    };
  }

  private analyzeAndCompile(graph: BranchingEpisodeGraph): {
    readonly validation: BranchingGraphValidationReport;
    readonly manifest: StaticBranchingManifest;
  } {
    const issues: BranchingValidationIssue[] = [];
    const nodeMap: Record<string, CompiledBranchNode> = {};
    const compiledNodes: CompiledBranchNode[] = [];
    const referencedFlagsSet = new Set<string>();

    const initialFlags: BranchStateMap = graph.initialFlags ? { ...graph.initialFlags } : {};
    const initialKeys = Object.keys(initialFlags);
    for (let i = 0; i < initialKeys.length; i += 1) {
      referencedFlagsSet.add(initialKeys[i]);
    }

    for (let i = 0; i < graph.nodes.length; i += 1) {
      const raw = graph.nodes[i];
      if (Object.prototype.hasOwnProperty.call(nodeMap, raw.id)) {
        issues.push({ code: "DUPLICATE_NODE_ID", severity: "error", nodeId: raw.id, messageKo: `중복된 컷 노드 ID '${raw.id}'가 발견되었습니다.` });
        continue;
      }
      let unlockAst: ConditionAstNode | undefined;
      if (raw.unlockCondition !== undefined && raw.unlockCondition.trim().length > 0) {
        const parsed = parseBranchCondition(raw.unlockCondition);
        if (!parsed.ok || !parsed.ast) {
          issues.push({ code: "INVALID_CONDITION_SYNTAX", severity: "error", nodeId: raw.id, messageKo: `노드 '${raw.id}' 해금 조건식 오류: ${parsed.error ?? "구문 오류"}` });
        } else {
          unlockAst = parsed.ast;
          extractConditionFlags(parsed.ast, referencedFlagsSet);
        }
      }
      const onEnterEffects = raw.onEnterEffects ? raw.onEnterEffects.slice() : [];
      for (let e = 0; e < onEnterEffects.length; e += 1) {
        referencedFlagsSet.add(onEnterEffects[e].flag);
      }

      const seenChoices = new Set<string>();
      const compiledChoices: CompiledBranchChoice[] = [];
      const rawChoices = raw.choices ?? [];
      for (let c = 0; c < rawChoices.length; c += 1) {
        const choice = rawChoices[c];
        if (seenChoices.has(choice.choiceId)) {
          issues.push({ code: "DUPLICATE_CHOICE_ID", severity: "error", nodeId: raw.id, choiceId: choice.choiceId, messageKo: `노드 '${raw.id}' 내 중복 선택지 ID '${choice.choiceId}'가 발견되었습니다.` });
          continue;
        }
        seenChoices.add(choice.choiceId);
        let choiceAst: ConditionAstNode | undefined;
        if (choice.condition !== undefined && choice.condition.trim().length > 0) {
          const parsed = parseBranchCondition(choice.condition);
          if (!parsed.ok || !parsed.ast) {
            issues.push({ code: "INVALID_CONDITION_SYNTAX", severity: "error", nodeId: raw.id, choiceId: choice.choiceId, messageKo: `선택지 '${choice.choiceId}' 조건식 오류: ${parsed.error ?? "구문 오류"}` });
          } else {
            choiceAst = parsed.ast;
            extractConditionFlags(parsed.ast, referencedFlagsSet);
          }
        }
        const effects = choice.effects ? choice.effects.slice() : [];
        for (let e = 0; e < effects.length; e += 1) {
          referencedFlagsSet.add(effects[e].flag);
        }
        compiledChoices.push({
          choiceId: choice.choiceId,
          label: choice.label,
          targetNodeId: choice.targetNodeId,
          condition: choice.condition,
          conditionAst: choiceAst,
          effects,
          hiddenUntilUnlocked: choice.hiddenUntilUnlocked ?? false,
          lockHint: choice.lockHint,
        });
      }

      const compiled: CompiledBranchNode = {
        id: raw.id,
        title: raw.title,
        kind: raw.kind,
        imageAssetPath: raw.imageAssetPath,
        caption: raw.caption,
        endingCode: raw.endingCode,
        endingTier: raw.endingTier,
        unlockCondition: raw.unlockCondition,
        unlockConditionAst: unlockAst,
        onEnterEffects,
        nextNodeId: raw.nextNodeId,
        choices: compiledChoices,
      };
      nodeMap[compiled.id] = compiled;
      compiledNodes.push(compiled);
    }

    const endingIds: string[] = [];
    const secretCutIds: string[] = [];
    const deadEndSet = new Set<string>();

    for (let i = 0; i < compiledNodes.length; i += 1) {
      const node = compiledNodes[i];
      if (node.kind === "ending") {
        endingIds.push(node.id);
        if (node.nextNodeId || node.choices.length > 0) {
          issues.push({ code: "ENDING_HAS_OUTGOING_EDGES", severity: "warning", nodeId: node.id, messageKo: `엔딩 노드 '${node.id}'에 불필요한 후속 전이가 정의되어 있습니다.` });
        }
      } else {
        if (node.kind === "secret") {
          secretCutIds.push(node.id);
        }
        if (!node.nextNodeId && node.choices.length === 0) {
          deadEndSet.add(node.id);
          issues.push({ code: "DEAD_END_NODE", severity: "error", nodeId: node.id, messageKo: `비엔딩 노드 '${node.id}'에 다음 컷이나 선택지가 없어 독자가 막다른 길에 갇힙니다.` });
        }
      }
      if (node.nextNodeId && !Object.prototype.hasOwnProperty.call(nodeMap, node.nextNodeId)) {
        issues.push({ code: "BROKEN_TARGET_REF", severity: "error", nodeId: node.id, messageKo: `노드 '${node.id}'의 nextNodeId '${node.nextNodeId}' 대상이 존재하지 않습니다.` });
      }
      for (let c = 0; c < node.choices.length; c += 1) {
        const ch = node.choices[c];
        if (!Object.prototype.hasOwnProperty.call(nodeMap, ch.targetNodeId)) {
          issues.push({ code: "BROKEN_TARGET_REF", severity: "error", nodeId: node.id, choiceId: ch.choiceId, messageKo: `선택지 '${ch.choiceId}'의 대상 노드 '${ch.targetNodeId}'가 존재하지 않습니다.` });
        }
      }
    }

    if (endingIds.length === 0) {
      issues.push({ code: "NO_ENDING_DEFINED", severity: "error", messageKo: "최소 1개 이상의 엔딩 노드(kind='ending')가 정의되어야 합니다." });
    }
    const hasStart = Object.prototype.hasOwnProperty.call(nodeMap, graph.startNodeId);
    if (!hasStart) {
      issues.push({ code: "MISSING_START_NODE", severity: "error", nodeId: graph.startNodeId, messageKo: `시작 노드 '${graph.startNodeId}'를 찾을 수 없습니다.` });
    }

    const reachableNodeSet = new Set<string>();
    const conditionalDeadEndReported = new Set<string>();
    let maxDepth = 0;
    let exploredStateCount = 0;

    if (hasStart) {
      const startNode = nodeMap[graph.startNodeId];
      const startFlags = applyBranchMutations(initialFlags, startNode.onEnterEffects);
      const visitedStates = new Set<string>();
      const queue: { readonly nodeId: string; readonly flags: BranchStateMap; readonly depth: number }[] = [
        { nodeId: startNode.id, flags: startFlags, depth: 0 },
      ];
      visitedStates.add(`${startNode.id}|${canonicalJsonStringify(startFlags)}`);
      reachableNodeSet.add(startNode.id);

      let head = 0;
      while (head < queue.length && exploredStateCount < this.maxExploredStates) {
        const current = queue[head];
        head += 1;
        exploredStateCount += 1;
        if (current.depth > maxDepth) {
          maxDepth = current.depth;
        }
        const node = nodeMap[current.nodeId];
        if (node.kind === "ending" || current.depth >= this.maxExplorationDepth) {
          continue;
        }

        if (node.choices.length > 0) {
          let transitionsFound = 0;
          for (let c = 0; c < node.choices.length; c += 1) {
            const ch = node.choices[c];
            const target = nodeMap[ch.targetNodeId];
            if (!target) {
              continue;
            }
            const chOk = !ch.conditionAst || evaluateBranchCondition(ch.conditionAst, current.flags);
            const tgOk = !target.unlockConditionAst || evaluateBranchCondition(target.unlockConditionAst, current.flags);
            if (!chOk || !tgOk) {
              continue;
            }
            transitionsFound += 1;
            const nextFlags = applyBranchMutations(applyBranchMutations(current.flags, ch.effects), target.onEnterEffects);
            const key = `${target.id}|${canonicalJsonStringify(nextFlags)}`;
            reachableNodeSet.add(target.id);
            if (!visitedStates.has(key) && visitedStates.size < this.maxExploredStates) {
              visitedStates.add(key);
              queue.push({ nodeId: target.id, flags: nextFlags, depth: current.depth + 1 });
            }
          }
          if (transitionsFound === 0 && !node.nextNodeId && !conditionalDeadEndReported.has(node.id)) {
            conditionalDeadEndReported.add(node.id);
            deadEndSet.add(node.id);
            issues.push({ code: "CONDITIONAL_DEAD_END", severity: "error", nodeId: node.id, messageKo: `노드 '${node.id}'에 도달 가능한 상태 중 선택 가능한 분기가 0개인 조건부 소프트락이 검출되었습니다.` });
          }
        } else if (node.nextNodeId && nodeMap[node.nextNodeId]) {
          const target = nodeMap[node.nextNodeId];
          const tgOk = !target.unlockConditionAst || evaluateBranchCondition(target.unlockConditionAst, current.flags);
          if (tgOk) {
            const nextFlags = applyBranchMutations(current.flags, target.onEnterEffects);
            const key = `${target.id}|${canonicalJsonStringify(nextFlags)}`;
            reachableNodeSet.add(target.id);
            if (!visitedStates.has(key) && visitedStates.size < this.maxExploredStates) {
              visitedStates.add(key);
              queue.push({ nodeId: target.id, flags: nextFlags, depth: current.depth + 1 });
            }
          } else if (!conditionalDeadEndReported.has(node.id)) {
            conditionalDeadEndReported.add(node.id);
            deadEndSet.add(node.id);
            issues.push({ code: "CONDITIONAL_DEAD_END", severity: "error", nodeId: node.id, messageKo: `노드 '${node.id}'에서 다음 노드 '${target.id}' 해금 조건 미충족으로 진행이 멈춥니다.` });
          }
        }
      }
    }

    const fullAdj: Record<string, string[]> = {};
    const unguardedAdj: Record<string, string[]> = {};
    const reachableList = Array.from(reachableNodeSet);
    for (let i = 0; i < compiledNodes.length; i += 1) {
      const node = compiledNodes[i];
      fullAdj[node.id] = [];
      unguardedAdj[node.id] = [];
      if (node.nextNodeId && nodeMap[node.nextNodeId]) {
        const target = nodeMap[node.nextNodeId];
        fullAdj[node.id].push(target.id);
        if (!target.unlockConditionAst) {
          unguardedAdj[node.id].push(target.id);
        }
      }
      for (let c = 0; c < node.choices.length; c += 1) {
        const ch = node.choices[c];
        const target = nodeMap[ch.targetNodeId];
        if (!target) {
          continue;
        }
        fullAdj[node.id].push(target.id);
        if (!ch.conditionAst && !target.unlockConditionAst) {
          unguardedAdj[node.id].push(target.id);
        }
      }
    }

    const canReachEnding = computeNodesReachingAnyEnding(compiledNodes, nodeMap);
    const fullCycles = findStronglyConnectedCycles(reachableList, fullAdj);
    const unguardedCycles = findStronglyConnectedCycles(reachableList, unguardedAdj);
    const seenCycleKeys = new Set<string>();
    const infiniteLoopCycles: string[][] = [];

    const recordCycle = (cycle: string[], reasonKo: string): void => {
      const key = cycle.slice().sort().join("->");
      if (seenCycleKeys.has(key)) {
        return;
      }
      seenCycleKeys.add(key);
      infiniteLoopCycles.push(cycle);
      issues.push({ code: "INFINITE_UNGUARDED_LOOP", severity: "error", nodeId: cycle[0], cycleNodeIds: cycle, messageKo: `${reasonKo}: [${cycle.join(" → ")}]` });
    };

    for (let i = 0; i < fullCycles.length; i += 1) {
      const cycle = fullCycles[i];
      if (!cycle.some((id) => canReachEnding.has(id))) {
        recordCycle(cycle, "엔딩 탈출 경로가 없는 무한 순환(트랩 루프)이 감지되었습니다");
      }
    }
    for (let i = 0; i < unguardedCycles.length; i += 1) {
      recordCycle(unguardedCycles[i], "조건 가드가 없는 무한 순환 루프(unguarded cycle)가 감지되었습니다");
    }

    const unreachableNodeIds: string[] = [];
    const reachableEndingIds: string[] = [];
    const unreachableEndingIds: string[] = [];
    const reachableSecretCutIds: string[] = [];
    const unreachableSecretCutIds: string[] = [];

    for (let i = 0; i < compiledNodes.length; i += 1) {
      const node = compiledNodes[i];
      const reached = reachableNodeSet.has(node.id);
      if (node.kind === "ending") {
        if (reached) {
          reachableEndingIds.push(node.id);
        } else {
          unreachableEndingIds.push(node.id);
          unreachableNodeIds.push(node.id);
          issues.push({ code: "UNREACHABLE_ENDING", severity: "error", nodeId: node.id, messageKo: `엔딩 노드 '${node.id}'에 어떤 경로·상태 플래그 조합으로도 도달할 수 없습니다.` });
        }
      } else if (node.kind === "secret") {
        if (reached) {
          reachableSecretCutIds.push(node.id);
        } else {
          unreachableSecretCutIds.push(node.id);
          unreachableNodeIds.push(node.id);
          issues.push({ code: "UNREACHABLE_SECRET_CUT", severity: "error", nodeId: node.id, messageKo: `시크릿 컷 '${node.id}'의 해금 조건에 도달할 수 있는 경로가 존재하지 않습니다.` });
        }
      } else if (!reached) {
        unreachableNodeIds.push(node.id);
        issues.push({ code: "UNREACHABLE_NODE", severity: "warning", nodeId: node.id, messageKo: `컷 노드 '${node.id}'는 시작점에서 도달할 수 없는 고립 컷입니다.` });
      }
    }

    const validation: BranchingGraphValidationReport = {
      valid: !issues.some((issue) => issue.severity === "error"),
      issues,
      reachableNodeIds: reachableList,
      unreachableNodeIds,
      reachableEndingIds,
      unreachableEndingIds,
      reachableSecretCutIds,
      unreachableSecretCutIds,
      deadEndNodeIds: Array.from(deadEndSet),
      infiniteLoopCycles,
      maxDepth,
      exploredStateCount,
    };

    const manifest: StaticBranchingManifest = {
      schemaVersion: "toonstudio.branching.v1",
      episodeId: graph.episodeId,
      title: graph.title,
      author: graph.author,
      version: graph.version,
      locale: graph.locale ?? "ko",
      startNodeId: graph.startNodeId,
      initialFlags,
      nodes: compiledNodes,
      endingIds,
      secretCutIds,
      referencedFlags: Array.from(referencedFlagsSet).sort(),
      serverStateRequired: false,
      estimatedServerCostKrw: 0,
    };

    return { validation, manifest };
  }
}
