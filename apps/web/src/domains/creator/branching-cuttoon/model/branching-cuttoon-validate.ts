/**
 * 분기형 컷툰 그래프 검증기.
 *
 * 결정적이고 fail-closed 다: 같은 그래프는 언제나 같은 순서의 같은 보고서를 내고, 오류가 하나라도 있으면 `valid` 가 false 라서
 * 독자에게 보여 주지 않는다. 경고(되돌아가는 길 등)는 읽기를 막지 않는다. 입력은 바꾸지 않는다.
 *
 * 이 검증기가 보장하는 것과 보장하지 않는 것은 docs/features/branching-cuttoon.md 에 적어 두었다.
 * 요약하면, 오류가 없는 그래프는 (1) 시작 장면이 하나 있고, (2) 모든 선택지가 존재하는 장면을 가리키며, (3) 시작에서 닿을 수 있는 모든 장면이
 * 결말이거나 갈 곳이 있고, (4) 그런 모든 장면에서 어떤 결말에든 닿는 길이 적어도 하나 있다. 독자가 결말에 "반드시" 닿는다는 뜻은 아니다.
 */
import {
  BRANCHING_PATH_LIMITS,
  distancesFromStart,
  enumerateEndingPaths,
  findBackEdges,
  indexBranchingGraph,
  nodesThatReachEnding,
  type BranchingPathLimits,
} from "./branching-cuttoon-analysis";
import { choiceLabelKey, countCodePoints, hasUnsafeText, isBlankText, isValidBranchingId } from "./branching-cuttoon-text";
import {
  BRANCHING_CUTTOON_LIMITS,
  BRANCHING_ISSUE_CODES,
  BRANCHING_ISSUE_SEVERITY,
  type BranchingCuttoonGraph,
  type BranchingGraphStats,
  type BranchingIssue,
  type BranchingIssueCode,
  type BranchingLimitName,
  type BranchingValidationReport,
} from "./branching-cuttoon-types";
import { branchingGraphVersion } from "./branching-cuttoon-version";

export interface BranchingValidateOptions {
  /** 길 열거 상한. 시험에서 작게 줄여 쓴다. */
  readonly pathLimits?: BranchingPathLimits;
}

const VALUE_CLIP = 60;

/** 보고서에 싣는 값은 길이를 자른다: 아주 긴 글이 보고서를 부풀리지 않게 한다. */
function clipValue(value: string): string {
  if (value.length <= VALUE_CLIP * 2) {
    const points = Array.from(value);
    return points.length <= VALUE_CLIP ? value : `${points.slice(0, VALUE_CLIP).join("")}…`;
  }
  return `${Array.from(value.slice(0, VALUE_CLIP * 2)).slice(0, VALUE_CLIP).join("")}…`;
}

function countBy(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

type IssueFields = Omit<BranchingIssue, "code" | "severity">;

class IssueCollector {
  readonly issues: BranchingIssue[] = [];

  add(code: BranchingIssueCode, fields: IssueFields = {}): void {
    this.issues.push({ code, severity: BRANCHING_ISSUE_SEVERITY[code], ...fields });
  }

  limit(limit: BranchingLimitName, actual: number, fields: IssueFields = {}): void {
    this.add("limit-exceeded", { ...fields, limit, max: BRANCHING_CUTTOON_LIMITS[limit], actual });
  }
}

/** 장면 하나의 식별자·글·선택지·컷 참조를 점검한다. 연결 분석은 따로 한다. */
function checkNode(
  collector: IssueCollector,
  graph: BranchingCuttoonGraph,
  position: number,
  context: {
    readonly nodeIdCounts: ReadonlyMap<string, number>;
    readonly reportedNodeIds: Set<string>;
    readonly nodeIds: ReadonlySet<string>;
    readonly cutIds: ReadonlySet<string>;
  },
): void {
  const node = graph.nodes[position];
  if (!node) return;
  const nodeId = node.id;
  const limits = BRANCHING_CUTTOON_LIMITS;

  if (!isValidBranchingId(nodeId)) collector.add("node-id-invalid", { nodeId, value: clipValue(nodeId) });
  const duplicates = context.nodeIdCounts.get(nodeId) ?? 0;
  if (duplicates > 1 && !context.reportedNodeIds.has(nodeId)) {
    context.reportedNodeIds.add(nodeId);
    collector.add("node-id-duplicate", { nodeId, value: clipValue(nodeId), count: duplicates });
  }

  if (isBlankText(node.title)) collector.add("node-title-empty", { nodeId });
  else if (countCodePoints(node.title) > limits.nodeTitleLength) {
    collector.limit("nodeTitleLength", countCodePoints(node.title), { nodeId });
  }
  if (hasUnsafeText(node.title, false)) collector.add("text-invalid-character", { nodeId, value: "title" });

  if (node.kind === "ending" && node.choices.length > 0) collector.add("ending-has-choices", { nodeId, count: node.choices.length });
  if (node.choices.length > limits.choicesPerNode) collector.limit("choicesPerNode", node.choices.length, { nodeId });
  if (node.cutIds.length > limits.cutsPerNode) collector.limit("cutsPerNode", node.cutIds.length, { nodeId });

  const cutRefCounts = countBy(node.cutIds);
  const reportedCuts = new Set<string>();
  for (const cutId of node.cutIds) {
    if (!context.cutIds.has(cutId)) {
      if (!reportedCuts.has(`missing:${cutId}`)) {
        reportedCuts.add(`missing:${cutId}`);
        collector.add("cut-ref-dangling", { nodeId, cutId: clipValue(cutId) });
      }
    } else if ((cutRefCounts.get(cutId) ?? 0) > 1 && !reportedCuts.has(`repeat:${cutId}`)) {
      reportedCuts.add(`repeat:${cutId}`);
      collector.add("cut-ref-repeated", { nodeId, cutId, count: cutRefCounts.get(cutId) ?? 0 });
    }
  }

  const choiceIdCounts = countBy(node.choices.map((choice) => choice.id));
  const reportedChoiceIds = new Set<string>();
  const labelKeys = new Set<string>();
  for (const choice of node.choices) {
    const choiceId = clipValue(choice.id);
    if (!isValidBranchingId(choice.id)) collector.add("choice-id-invalid", { nodeId, choiceId, value: choiceId });
    if ((choiceIdCounts.get(choice.id) ?? 0) > 1 && !reportedChoiceIds.has(choice.id)) {
      reportedChoiceIds.add(choice.id);
      collector.add("choice-id-duplicate", { nodeId, choiceId, value: choiceId, count: choiceIdCounts.get(choice.id) ?? 0 });
    }

    if (isBlankText(choice.label)) {
      collector.add("choice-label-empty", { nodeId, choiceId });
    } else {
      const length = countCodePoints(choice.label);
      if (length > limits.choiceLabelLength) collector.limit("choiceLabelLength", length, { nodeId, choiceId });
      const key = choiceLabelKey(choice.label);
      if (labelKeys.has(key)) collector.add("choice-label-duplicate", { nodeId, choiceId, value: clipValue(choice.label) });
      labelKeys.add(key);
    }
    if (hasUnsafeText(choice.label, false)) collector.add("text-invalid-character", { nodeId, choiceId, value: "label" });

    if (choice.targetNodeId === "") collector.add("choice-target-empty", { nodeId, choiceId });
    else if (!context.nodeIds.has(choice.targetNodeId)) {
      collector.add("choice-target-dangling", { nodeId, choiceId, value: clipValue(choice.targetNodeId) });
    }
  }
}

/** 컷 표를 점검한다. 컷 글 문제는 그 컷을 처음 쓰는 장면으로 이동할 수 있게 장면 식별자를 함께 싣는다. */
function checkCutTable(collector: IssueCollector, graph: BranchingCuttoonGraph): void {
  const limits = BRANCHING_CUTTOON_LIMITS;
  if (graph.cuts.length > limits.cuts) collector.limit("cuts", graph.cuts.length);
  const firstUser = new Map<string, string>();
  for (const node of graph.nodes) {
    for (const cutId of node.cutIds) if (!firstUser.has(cutId)) firstUser.set(cutId, node.id);
  }
  const counts = countBy(graph.cuts.map((cut) => cut.id));
  const reported = new Set<string>();
  for (const cut of graph.cuts) {
    const nodeId = firstUser.get(cut.id);
    const where: IssueFields = nodeId === undefined ? { cutId: clipValue(cut.id) } : { cutId: clipValue(cut.id), nodeId };
    if (!isValidBranchingId(cut.id)) collector.add("cut-id-invalid", { ...where, value: clipValue(cut.id) });
    if ((counts.get(cut.id) ?? 0) > 1 && !reported.has(cut.id)) {
      reported.add(cut.id);
      collector.add("cut-id-duplicate", { ...where, value: clipValue(cut.id), count: counts.get(cut.id) ?? 0 });
    }
    const length = countCodePoints(cut.caption);
    if (length > limits.captionLength) collector.limit("captionLength", length, where);
    if (hasUnsafeText(cut.caption, true)) collector.add("text-invalid-character", { ...where, value: "caption" });
  }
}

/** 시작 장면 규칙: 하나 있고, 존재하며, 종류가 start 이고, start 종류가 둘 이상이 아니다. */
function checkStart(collector: IssueCollector, graph: BranchingCuttoonGraph, startIndex: number | null): void {
  if (graph.nodes.length === 0 || graph.startNodeId === "") {
    collector.add("start-missing");
  } else if (startIndex === null) {
    collector.add("start-dangling", { value: clipValue(graph.startNodeId) });
  } else if (graph.nodes[startIndex]?.kind !== "start") {
    collector.add("start-kind-mismatch", { nodeId: graph.nodes[startIndex]?.id ?? "" });
  }
  const startKinds = graph.nodes
    .map((node, position) => ({ node, position }))
    .filter(({ node }) => node.kind === "start");
  const primary = startKinds.find(({ position }) => position === startIndex) ?? startKinds[0];
  for (const { node, position } of startKinds) {
    if (position !== primary?.position) collector.add("start-duplicate", { nodeId: node.id });
  }
}

const CODE_RANK = new Map<BranchingIssueCode, number>(BRANCHING_ISSUE_CODES.map((code, rank) => [code, rank]));

/** 오류 먼저, 그다음 그래프 전체 → 장면 순서, 같은 장면 안에서는 코드 순서. 나머지는 발견한 순서를 지킨다(안정 정렬). */
function sortIssues(issues: readonly BranchingIssue[], graph: BranchingCuttoonGraph): BranchingIssue[] {
  const nodeOrder = new Map<string, number>();
  graph.nodes.forEach((node, position) => {
    if (!nodeOrder.has(node.id)) nodeOrder.set(node.id, position);
  });
  const orderOf = (issue: BranchingIssue): number => (issue.nodeId === undefined ? -1 : nodeOrder.get(issue.nodeId) ?? Number.MAX_SAFE_INTEGER);
  const severityOf = (issue: BranchingIssue): number => (issue.severity === "error" ? 0 : 1);
  return [...issues].sort((left, right) => (
    severityOf(left) - severityOf(right)
    || orderOf(left) - orderOf(right)
    || (CODE_RANK.get(left.code) ?? 0) - (CODE_RANK.get(right.code) ?? 0)
  ));
}

export function validateBranchingCuttoon(
  graph: BranchingCuttoonGraph,
  options: BranchingValidateOptions = {},
): BranchingValidationReport {
  const collector = new IssueCollector();
  const index = indexBranchingGraph(graph);
  const limits = BRANCHING_CUTTOON_LIMITS;

  if (graph.nodes.length > limits.nodes) collector.limit("nodes", graph.nodes.length);
  const titleLength = countCodePoints(graph.title);
  if (titleLength > limits.graphTitleLength) collector.limit("graphTitleLength", titleLength);
  if (hasUnsafeText(graph.title, false)) collector.add("text-invalid-character", { value: "graphTitle" });

  checkStart(collector, graph, index.startIndex);

  const context = {
    nodeIdCounts: countBy(graph.nodes.map((node) => node.id)),
    reportedNodeIds: new Set<string>(),
    nodeIds: new Set(graph.nodes.map((node) => node.id)),
    cutIds: new Set(graph.cuts.map((cut) => cut.id)),
  };
  graph.nodes.forEach((_node, position) => checkNode(collector, graph, position, context));
  checkCutTable(collector, graph);

  const endingCount = graph.nodes.filter((node) => node.kind === "ending").length;
  if (graph.nodes.length > 0 && endingCount === 0) collector.add("ending-missing");

  graph.nodes.forEach((node, position) => {
    if (node.kind !== "ending" && (index.outEdges[position]?.length ?? 0) === 0) collector.add("dead-end", { nodeId: node.id });
  });

  const distance = distancesFromStart(index);
  const reachesEnding = nodesThatReachEnding(index);
  if (index.startIndex !== null) {
    graph.nodes.forEach((node, position) => {
      const reachable = (distance[position] ?? -1) >= 0;
      if (!reachable) {
        collector.add("node-unreachable", { nodeId: node.id });
      } else if (endingCount > 0 && node.kind !== "ending" && (index.outEdges[position]?.length ?? 0) > 0 && !reachesEnding[position]) {
        collector.add("ending-unreachable", { nodeId: node.id });
      }
    });
  }

  const backEdges = findBackEdges(index);
  for (const edge of backEdges) {
    const from = graph.nodes[edge.from];
    const choice = from?.choices[edge.choiceIndex];
    if (!from || !choice) continue;
    collector.add("loop-back", { nodeId: from.id, choiceId: clipValue(choice.id), value: graph.nodes[edge.to]?.id ?? "" });
  }

  const issues = sortIssues(collector.issues, graph);
  const errorCount = issues.filter((issue) => issue.severity === "error").length;

  const enumeration = enumerateEndingPaths(index, options.pathLimits ?? BRANCHING_PATH_LIMITS);
  const reachableEndingDistances = graph.nodes
    .map((node, position) => (node.kind === "ending" ? distance[position] ?? -1 : -1))
    .filter((steps) => steps >= 0);
  const stats: BranchingGraphStats = {
    nodeCount: graph.nodes.length,
    endingCount,
    choiceCount: graph.nodes.reduce((total, node) => total + node.choices.length, 0),
    cutCount: graph.cuts.length,
    reachableNodeCount: distance.filter((steps) => steps >= 0).length,
    loopBackCount: backEdges.length,
    shortestPathSteps: reachableEndingDistances.length > 0 ? reachableEndingDistances.reduce((least, steps) => Math.min(least, steps)) : null,
    pathCount: enumeration.paths.length,
    pathCountExact: enumeration.complete,
    longestPathSteps: enumeration.paths.length > 0 ? enumeration.paths.reduce((most, path) => Math.max(most, path.length - 1), 0) : null,
  };

  return {
    valid: errorCount === 0,
    errorCount,
    warningCount: issues.length - errorCount,
    issues,
    stats,
    graphVersion: branchingGraphVersion(graph),
  };
}

/** 오류가 없어 독자에게 보여 줄 수 있는지. */
export function isBranchingCuttoonPlayable(graph: BranchingCuttoonGraph): boolean {
  return validateBranchingCuttoon(graph).valid;
}
