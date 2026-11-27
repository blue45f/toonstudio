/**
 * Wave 51: 반응형 에피소드 씬 의존성 방향성 비순환 그래프(DAG) 커널.
 *
 * - 캐릭터 팔레트 토큰(머리색·의상·액세서리·피부), 씬 조명 프리셋(낮·노을·야간·실내 형광),
 *   배경 3D 카메라·무드 노드를 컷별 레이어와 방향성 간선으로 연결한다.
 * - Kahn 위상 정렬로 결정적 평가 순서를 산출하고, 직접·간접 순환 참조를 즉시 차단한다.
 * - 씬 격리(타 씬 오염 방지)와 작가 수동 오버라이드 핀(`pinnedByArtist`, `pinnedTokenIds`)
 *   보호 규칙을 적용해 정밀한 영향 범위(Dirty Cut & Layer Closure)를 계산한다.
 */

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly hDeg: number;
}

export type PaletteTokenSlot = "hair" | "costume" | "accessory" | "skin" | "prop";
export type SceneLightingPresetKind = "daylight" | "sunset" | "night" | "indoor-fluorescent";
export type CutLayerKind = "base-flat" | "cel-shadow" | "bg3d-lighting" | "speech-bubble-tone";
export type DependencyEdgeRelation = "palette-binding" | "lighting-preset" | "bg3d-mood" | "derived-layer";

export interface SceneLightingParams {
  readonly presetKind: SceneLightingPresetKind;
  readonly keyKelvin: number;
  readonly ambientKelvin: number;
  readonly shadowAzimuthDeg: number;
  readonly shadowElevationDeg: number;
  readonly shadowIntensity: number;
  readonly moodTintOklch: OklchColor;
  readonly speechBubbleTintStrength: number;
}

export interface Bg3dCameraMoodParams {
  readonly cameraFovMm: number;
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly fogDensity: number;
  readonly rimGlowStrength: number;
  readonly fogTintOklch: OklchColor;
}

export interface Bg3dLayerLightingState {
  readonly keyKelvin: number;
  readonly ambientKelvin: number;
  readonly sunAzimuthDeg: number;
  readonly sunElevationDeg: number;
  readonly shadowHardness: number;
  readonly fogDensity: number;
  readonly rimGlowStrength: number;
  readonly fogTintOklch: OklchColor;
}

export interface SpeechBubbleToneState {
  readonly fillOklch: OklchColor;
  readonly borderOklch: OklchColor;
  readonly inkOklch: OklchColor;
}

export interface CharacterPaletteTokenNode {
  readonly kind: "character-palette-token";
  readonly nodeId: string;
  readonly sceneId: string;
  readonly characterId: string;
  readonly slot: PaletteTokenSlot;
  readonly labelKo: string;
  readonly colorOklch: OklchColor;
}

export interface SceneLightingPresetNode {
  readonly kind: "scene-lighting-preset";
  readonly nodeId: string;
  readonly sceneId: string;
  readonly labelKo: string;
  readonly lighting: SceneLightingParams;
}

export interface Bg3dCameraMoodNode {
  readonly kind: "bg3d-camera-mood";
  readonly nodeId: string;
  readonly sceneId: string;
  readonly labelKo: string;
  readonly mood: Bg3dCameraMoodParams;
}

export interface CutLayerNode {
  readonly kind: "cut-layer";
  readonly nodeId: string;
  readonly sceneId: string;
  readonly cutId: string;
  readonly cutIndex: number;
  readonly layerId: string;
  readonly layerKind: CutLayerKind;
  readonly labelKo: string;
  readonly characterId?: string;
  readonly slot?: PaletteTokenSlot;
  readonly colorOklch: OklchColor;
  readonly shadowAngleDeg?: number;
  readonly bg3dLighting?: Bg3dLayerLightingState;
  readonly speechBubbleTone?: SpeechBubbleToneState;
  readonly pinnedByArtist: boolean;
  readonly pinnedReasonKo?: string;
  readonly pinnedTokenIds?: readonly string[];
  readonly baseRenderMs?: number;
}

export type EpisodeDagNode =
  | CharacterPaletteTokenNode
  | SceneLightingPresetNode
  | Bg3dCameraMoodNode
  | CutLayerNode;

export interface DependencyEdge {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly relation: DependencyEdgeRelation;
}

export interface EdgeMutationResult {
  readonly ok: boolean;
  readonly reasonKo?: string;
  readonly cyclePath?: readonly string[];
}

export interface DagValidationResult {
  readonly hasCycle: boolean;
  readonly topologicalOrder: readonly string[];
  readonly cyclePath: readonly string[];
  readonly messageKo: string;
}

export interface DirtyLayerEntry {
  readonly node: CutLayerNode;
  readonly depth: number;
  readonly triggerNodeIds: readonly string[];
}

export interface PinnedLayerConflict {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly layerId: string;
  readonly nodeId: string;
  readonly labelKo: string;
  readonly reasonKo: string;
  readonly blockedTriggerNodeIds: readonly string[];
}

export interface DirtyClosureOptions {
  /** 특정 씬 범위로만 전파를 한정한다. 지정 시 타 씬 노드는 격리 처리된다. */
  readonly scopeSceneId?: string;
  /** 기본값 `true`. `false`면 작가 핀을 무시하고 잠재 영향 범위를 모두 계산한다. */
  readonly respectArtistPins?: boolean;
}

export interface DirtyClosureResult {
  readonly triggerNodeIds: readonly string[];
  readonly scopeSceneId: string | null;
  readonly topologicalOrder: readonly string[];
  readonly dirtyCutIds: readonly string[];
  readonly dirtyLayers: readonly DirtyLayerEntry[];
  readonly protectedPinnedLayers: readonly PinnedLayerConflict[];
  readonly isolatedOtherSceneCutIds: readonly string[];
  readonly totalEvaluatedEdges: number;
}

/** 씬 시간대·공간별 기본 조명 프리셋 카탈로그. */
export const SCENE_LIGHTING_PRESETS: Readonly<Record<SceneLightingPresetKind, SceneLightingParams>> = {
  daylight: {
    presetKind: "daylight", keyKelvin: 6_500, ambientKelvin: 7_800,
    shadowAzimuthDeg: 45, shadowElevationDeg: 52, shadowIntensity: 0.34,
    moodTintOklch: { l: 0.96, c: 0.012, hDeg: 95 }, speechBubbleTintStrength: 0.08,
  },
  sunset: {
    presetKind: "sunset", keyKelvin: 3_200, ambientKelvin: 4_600,
    shadowAzimuthDeg: 215, shadowElevationDeg: 16, shadowIntensity: 0.56,
    moodTintOklch: { l: 0.78, c: 0.115, hDeg: 42 }, speechBubbleTintStrength: 0.24,
  },
  night: {
    presetKind: "night", keyKelvin: 9_200, ambientKelvin: 11_000,
    shadowAzimuthDeg: 140, shadowElevationDeg: 34, shadowIntensity: 0.68,
    moodTintOklch: { l: 0.36, c: 0.075, hDeg: 252 }, speechBubbleTintStrength: 0.3,
  },
  "indoor-fluorescent": {
    presetKind: "indoor-fluorescent", keyKelvin: 4_300, ambientKelvin: 5_200,
    shadowAzimuthDeg: 90, shadowElevationDeg: 72, shadowIntensity: 0.28,
    moodTintOklch: { l: 0.92, c: 0.038, hDeg: 158 }, speechBubbleTintStrength: 0.14,
  },
};

function findCyclePath(
  nodeIds: readonly string[],
  outgoing: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const dfs = (current: string): readonly string[] | null => {
    state.set(current, 1);
    stack.push(current);
    for (const next of [...(outgoing.get(current) ?? [])].sort()) {
      const nextState = state.get(next) ?? 0;
      if (nextState === 1) return [...stack.slice(stack.indexOf(next)), next];
      if (nextState === 0) {
        const found = dfs(next);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(current, 2);
    return null;
  };
  for (const id of [...nodeIds].sort()) {
    if ((state.get(id) ?? 0) === 0) {
      const cycle = dfs(id);
      if (cycle) return cycle;
    }
  }
  return [];
}

/** Kahn 위상 정렬로 순환 참조 여부를 검증하고 결정적 평가 순서를 산출한다. */
export function validateAcyclicDag(
  nodeIds: readonly string[],
  edges: readonly DependencyEdge[],
): DagValidationResult {
  const uniqueIds = [...new Set(nodeIds)].sort();
  const idSet = new Set(uniqueIds);
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const id of uniqueIds) {
    inDegree.set(id, 0);
    outgoing.set(id, []);
  }
  for (const edge of edges) {
    if (!idSet.has(edge.fromNodeId) || !idSet.has(edge.toNodeId)) continue;
    outgoing.get(edge.fromNodeId)?.push(edge.toNodeId);
    inDegree.set(edge.toNodeId, (inDegree.get(edge.toNodeId) ?? 0) + 1);
  }
  const ready = uniqueIds.filter((id) => (inDegree.get(id) ?? 0) === 0).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const current = ready.shift();
    if (current === undefined) break;
    order.push(current);
    for (const target of [...(outgoing.get(current) ?? [])].sort()) {
      const nextDeg = (inDegree.get(target) ?? 0) - 1;
      inDegree.set(target, nextDeg);
      if (nextDeg === 0) {
        ready.push(target);
        ready.sort();
      }
    }
  }
  if (order.length < uniqueIds.length) {
    const cyclePath = findCyclePath(uniqueIds, outgoing);
    return {
      hasCycle: true,
      topologicalOrder: order,
      cyclePath,
      messageKo: `순환 참조가 감지되어 위상 정렬을 완료할 수 없습니다: ${cyclePath.join(" -> ")}`,
    };
  }
  return {
    hasCycle: false,
    topologicalOrder: order,
    cyclePath: [],
    messageKo: `에피소드 의존성 DAG 검증 완료 (노드 ${uniqueIds.length}개, 간선 ${edges.length}개)`,
  };
}

function isLayerPinnedForTriggers(node: CutLayerNode, triggerIds: readonly string[]): boolean {
  if (node.pinnedByArtist) return true;
  if (!node.pinnedTokenIds || node.pinnedTokenIds.length === 0) return false;
  const pinnedSet = new Set(node.pinnedTokenIds);
  return triggerIds.some((id) => pinnedSet.has(id));
}

/** 에피소드 씬 의존성 DAG 관리기. 순환 차단·씬 격리·작가 수동 핀 보호를 강제한다. */
export class EpisodeSceneDependencyDag {
  private readonly nodes = new Map<string, EpisodeDagNode>();
  private readonly edges = new Map<string, DependencyEdge>();
  private readonly outgoing = new Map<string, DependencyEdge[]>();

  addNode(node: EpisodeDagNode): void {
    this.nodes.set(node.nodeId, node);
    if (!this.outgoing.has(node.nodeId)) this.outgoing.set(node.nodeId, []);
  }
  getNode(nodeId: string): EpisodeDagNode | undefined { return this.nodes.get(nodeId); }
  listNodes(): readonly EpisodeDagNode[] { return [...this.nodes.values()]; }
  listEdges(): readonly DependencyEdge[] { return [...this.edges.values()]; }
  listSceneCutLayers(sceneId: string): readonly CutLayerNode[] {
    return [...this.nodes.values()]
      .filter((n): n is CutLayerNode => n.kind === "cut-layer" && n.sceneId === sceneId)
      .sort((a, b) => (a.cutIndex !== b.cutIndex ? a.cutIndex - b.cutIndex : a.layerId.localeCompare(b.layerId)));
  }
  updateNode(node: EpisodeDagNode): void {
    if (!this.nodes.has(node.nodeId)) throw new Error(`등록되지 않은 DAG 노드입니다: ${node.nodeId}`);
    this.nodes.set(node.nodeId, node);
  }

  setLayerArtistPin(
    nodeId: string,
    pinned: boolean,
    reasonKo?: string,
    pinnedTokenIds?: readonly string[],
  ): void {
    const current = this.nodes.get(nodeId);
    if (!current || current.kind !== "cut-layer") {
      throw new Error(`핀 상태를 바꿀 컷 레이어 노드를 찾을 수 없습니다: ${nodeId}`);
    }
    this.nodes.set(nodeId, {
      ...current,
      pinnedByArtist: pinned,
      pinnedReasonKo: pinned ? (reasonKo ?? current.pinnedReasonKo ?? "작가 수동 잠금") : undefined,
      pinnedTokenIds: pinnedTokenIds ?? current.pinnedTokenIds,
    });
  }

  addEdge(edge: DependencyEdge): EdgeMutationResult {
    if (!this.nodes.has(edge.fromNodeId) || !this.nodes.has(edge.toNodeId)) {
      return { ok: false, reasonKo: `존재하지 않는 노드 간 연결입니다: ${edge.fromNodeId} -> ${edge.toNodeId}` };
    }
    if (edge.fromNodeId === edge.toNodeId) {
      return {
        ok: false,
        reasonKo: `자기 자신을 참조하는 순환 간선은 허용되지 않습니다: ${edge.fromNodeId}`,
        cyclePath: [edge.fromNodeId, edge.toNodeId],
      };
    }
    const key = `${edge.fromNodeId}=>${edge.toNodeId}:${edge.relation}`;
    if (this.edges.has(key)) return { ok: true };

    const validation = validateAcyclicDag([...this.nodes.keys()], [...this.edges.values(), edge]);
    if (validation.hasCycle) {
      return { ok: false, reasonKo: validation.messageKo, cyclePath: validation.cyclePath };
    }
    this.edges.set(key, edge);
    const list = this.outgoing.get(edge.fromNodeId) ?? [];
    list.push(edge);
    this.outgoing.set(edge.fromNodeId, list);
    return { ok: true };
  }

  getTopologicalOrder(): DagValidationResult {
    return validateAcyclicDag([...this.nodes.keys()], [...this.edges.values()]);
  }

  /** 변경된 시작 노드들로부터 하류 컷·레이어 영향 범위(Dirty Closure)를 정밀 산출한다. */
  computeDirtyClosure(
    changedNodeIds: readonly string[],
    options: DirtyClosureOptions = {},
  ): DirtyClosureResult {
    const respectPins = options.respectArtistPins ?? true;
    const scopeSceneId = options.scopeSceneId ?? null;
    const topoIndex = new Map<string, number>();
    this.getTopologicalOrder().topologicalOrder.forEach((id, idx) => topoIndex.set(id, idx));

    const queue: Array<{ nodeId: string; depth: number; originId: string }> = [];
    const originMap = new Map<string, Set<string>>();
    const minDepth = new Map<string, number>();
    for (const rawId of changedNodeIds) {
      if (!this.nodes.has(rawId)) continue;
      queue.push({ nodeId: rawId, depth: 0, originId: rawId });
      minDepth.set(rawId, 0);
      originMap.set(rawId, new Set([rawId]));
    }

    const isolatedCutIds = new Set<string>();
    const protectedMap = new Map<string, PinnedLayerConflict>();
    const dirtyLayerMap = new Map<string, CutLayerNode>();
    let evaluatedEdges = 0;

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      for (const edge of this.outgoing.get(current.nodeId) ?? []) {
        evaluatedEdges += 1;
        const target = this.nodes.get(edge.toNodeId);
        if (!target) continue;
        if (scopeSceneId !== null && target.sceneId !== scopeSceneId) {
          if (target.kind === "cut-layer") isolatedCutIds.add(target.cutId);
          continue;
        }
        const origins = originMap.get(target.nodeId) ?? new Set<string>();
        const prevSize = origins.size;
        origins.add(current.originId);
        originMap.set(target.nodeId, origins);

        const nextDepth = current.depth + 1;
        const existingDepth = minDepth.get(target.nodeId);
        const depthImproved = existingDepth === undefined || nextDepth < existingDepth;
        if (depthImproved) minDepth.set(target.nodeId, nextDepth);

        if (target.kind === "cut-layer" && respectPins) {
          const triggerList = [...origins].sort();
          if (isLayerPinnedForTriggers(target, triggerList)) {
            protectedMap.set(target.nodeId, {
              cutId: target.cutId,
              cutIndex: target.cutIndex,
              layerId: target.layerId,
              nodeId: target.nodeId,
              labelKo: target.labelKo,
              reasonKo: target.pinnedReasonKo ?? "작가가 수동으로 고정한 레이어입니다.",
              blockedTriggerNodeIds: triggerList,
            });
            continue;
          }
        }
        if (target.kind === "cut-layer") dirtyLayerMap.set(target.nodeId, target);
        if (depthImproved || origins.size > prevSize) {
          queue.push({ nodeId: target.nodeId, depth: nextDepth, originId: current.originId });
        }
      }
    }

    const dirtyLayers: DirtyLayerEntry[] = [...dirtyLayerMap.values()]
      .sort((a, b) =>
        a.cutIndex !== b.cutIndex
          ? a.cutIndex - b.cutIndex
          : (topoIndex.get(a.nodeId) ?? 0) - (topoIndex.get(b.nodeId) ?? 0),
      )
      .map((node) => ({
        node,
        depth: minDepth.get(node.nodeId) ?? 1,
        triggerNodeIds: [...(originMap.get(node.nodeId) ?? new Set<string>())].sort(),
      }));

    return {
      triggerNodeIds: [...changedNodeIds],
      scopeSceneId,
      topologicalOrder: [...minDepth.keys()].sort((a, b) => (topoIndex.get(a) ?? 0) - (topoIndex.get(b) ?? 0)),
      dirtyCutIds: [...new Set(dirtyLayers.map((entry) => entry.node.cutId))],
      dirtyLayers,
      protectedPinnedLayers: [...protectedMap.values()].sort((a, b) =>
        a.cutIndex !== b.cutIndex ? a.cutIndex - b.cutIndex : a.layerId.localeCompare(b.layerId),
      ),
      isolatedOtherSceneCutIds: [...isolatedCutIds].sort(),
      totalEvaluatedEdges: evaluatedEdges,
    };
  }
}
