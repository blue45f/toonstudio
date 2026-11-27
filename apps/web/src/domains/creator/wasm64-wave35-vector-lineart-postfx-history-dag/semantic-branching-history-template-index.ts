/**
 * Wave-35: 비선형 시맨틱 브랜칭 작업 히스토리 DAG 및 적응형 컷·패널 템플릿 인덱서.
 *
 * 미세 편집(Micro-Edit)을 창작 단계별 마일스톤(`stroke-batch`, `color-pass`, `balloon-layout`, `post-fx`)으로
 * 자동 응집하고, 변경되지 않은 레이어 버퍼를 복사하지 않는 O(LCA) 브랜치 체크아웃·변주 비교(Diff)와
 * 장르·컷 수·화면비·극적 비트·한영 키워드 기반 적응형 패널 템플릿 랭킹을 수행한다.
 */

export type CreativeMilestoneKind = "initial" | "stroke-batch" | "color-pass" | "balloon-layout" | "post-fx";
export type EditableMilestoneKind = Exclude<CreativeMilestoneKind, "initial">;

export interface LayerPayloadRef {
  readonly layerId: string;
  readonly contentDigest: string;
  readonly byteLength: number;
  readonly payload: Uint8Array | Readonly<Record<string, unknown>>;
}

export interface LayerDeltaEntry {
  readonly before: LayerPayloadRef | null;
  readonly after: LayerPayloadRef | null;
}

export interface MicroEditOperation {
  readonly kind: EditableMilestoneKind;
  readonly layerId: string;
  readonly nextLayerRef?: LayerPayloadRef;
  readonly deleted?: boolean;
  readonly label: string;
  readonly timestampMs: number;
}

export interface HistoryMilestoneNode {
  readonly nodeId: string;
  readonly parentId: string | null;
  readonly depth: number;
  readonly kind: CreativeMilestoneKind;
  readonly label: string;
  readonly microEditCount: number;
  readonly createdAtMs: number;
  readonly layerDeltas: ReadonlyMap<string, LayerDeltaEntry>;
}

export interface SemanticHistoryDagOptions {
  readonly initialLayers?: readonly LayerPayloadRef[];
  readonly defaultBranchName?: string;
  readonly coalesceWindowMs?: number;
  readonly maxMicroEditsPerMilestone?: number;
}

export interface BranchCheckoutReport {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly lcaNodeId: string;
  readonly stepsTraversed: number;
  readonly mutatedLayerIds: readonly string[];
  readonly reusedUnchangedLayerCount: number;
  readonly activeBranchName: string;
}

export interface VariationDiffSummary {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly lcaNodeId: string;
  readonly sourceStepsFromLca: number;
  readonly targetStepsFromLca: number;
  readonly stepsTraversed: number;
  readonly addedLayerIds: readonly string[];
  readonly removedLayerIds: readonly string[];
  readonly modifiedLayerIds: readonly string[];
  readonly unchangedActiveLayerCount: number;
  readonly milestoneCountsByKind: Readonly<Record<EditableMilestoneKind, number>>;
}

interface PendingMilestoneBatch {
  kind: EditableMilestoneKind;
  lastTimestampMs: number;
  microEditCount: number;
  lastLabel: string;
  deltas: Map<string, { before: LayerPayloadRef | null; after: LayerPayloadRef | null }>;
}

/**
 * 레이어 참조 공유(Zero-Copy Structural Sharing)와 최소 공통 조상(LCA) 경로 역추적으로
 * 대용량 멀티레이어 웹툰 원고의 창작 변주 브랜치를 즉시 전환·비교하는 히스토리 DAG.
 */
export class SemanticHistoryDag {
  private readonly nodes = new Map<string, HistoryMilestoneNode>();
  private readonly branches = new Map<string, string>();
  private readonly activeLayers = new Map<string, LayerPayloadRef>();
  private readonly coalesceWindowMs: number;
  private readonly maxMicroEditsPerMilestone: number;
  private activeBranchName: string;
  private activeNodeId: string;
  private nextMilestoneSeq = 1;
  private pendingBatch: PendingMilestoneBatch | null = null;

  public constructor(options: SemanticHistoryDagOptions = {}) {
    this.coalesceWindowMs = Math.max(0, options.coalesceWindowMs ?? 4000);
    this.maxMicroEditsPerMilestone = Math.max(1, options.maxMicroEditsPerMilestone ?? 32);
    this.activeBranchName = (options.defaultBranchName ?? "main").trim() || "main";

    const rootDeltas = new Map<string, LayerDeltaEntry>();
    for (const layer of options.initialLayers ?? []) {
      this.activeLayers.set(layer.layerId, layer);
      rootDeltas.set(layer.layerId, { before: null, after: layer });
    }

    const rootNode: HistoryMilestoneNode = {
      nodeId: "ms-0", parentId: null, depth: 0, kind: "initial",
      label: "초기 원고 상태", microEditCount: 0, createdAtMs: 0, layerDeltas: rootDeltas,
    };
    this.nodes.set(rootNode.nodeId, rootNode);
    this.activeNodeId = rootNode.nodeId;
    this.branches.set(this.activeBranchName, rootNode.nodeId);
  }

  public getActiveNodeId(): string { return this.activeNodeId; }
  public getActiveBranchName(): string { return this.activeBranchName; }
  public getLayerRef(layerId: string): LayerPayloadRef | undefined { return this.activeLayers.get(layerId); }
  public getActiveLayerCount(): number { return this.activeLayers.size; }
  public getBranchHeadNodeId(branchName: string): string | undefined { return this.branches.get(branchName); }
  public getMilestoneNode(nodeId: string): HistoryMilestoneNode | undefined { return this.nodes.get(nodeId); }

  /** 연속 미세 편집을 창작 단계와 시간 창 기준으로 버퍼링하고 경계 전환 시 자동 마일스톤을 봉인한다. */
  public recordMicroEdit(op: MicroEditOperation): void {
    if (
      this.pendingBatch !== null &&
      (this.pendingBatch.kind !== op.kind ||
        op.timestampMs - this.pendingBatch.lastTimestampMs > this.coalesceWindowMs ||
        this.pendingBatch.microEditCount >= this.maxMicroEditsPerMilestone)
    ) {
      this.flushMilestone();
    }

    if (this.pendingBatch === null) {
      this.pendingBatch = {
        kind: op.kind,
        lastTimestampMs: op.timestampMs,
        microEditCount: 0,
        lastLabel: op.label,
        deltas: new Map(),
      };
    }

    const prevRef = this.activeLayers.get(op.layerId) ?? null;
    const nextRef = op.deleted === true || op.nextLayerRef === undefined ? null : op.nextLayerRef;
    const existingDelta = this.pendingBatch.deltas.get(op.layerId);
    if (existingDelta !== undefined) existingDelta.after = nextRef;
    else this.pendingBatch.deltas.set(op.layerId, { before: prevRef, after: nextRef });

    if (nextRef === null) this.activeLayers.delete(op.layerId);
    else this.activeLayers.set(op.layerId, nextRef);

    this.pendingBatch.microEditCount += 1;
    this.pendingBatch.lastTimestampMs = Math.max(this.pendingBatch.lastTimestampMs, op.timestampMs);
    this.pendingBatch.lastLabel = op.label;
  }

  /** 대기 중인 미세 편집 배치를 불변 마일스톤 노드로 확정한다. */
  public flushMilestone(summaryLabel?: string): HistoryMilestoneNode | null {
    if (this.pendingBatch === null || this.pendingBatch.microEditCount === 0) {
      this.pendingBatch = null;
      return null;
    }
    const batch = this.pendingBatch;
    this.pendingBatch = null;

    const netDeltas = new Map<string, LayerDeltaEntry>();
    for (const [layerId, delta] of batch.deltas.entries()) {
      const sameDigest =
        delta.before?.contentDigest !== undefined &&
        delta.before.contentDigest === delta.after?.contentDigest;
      if ((delta.before === null && delta.after === null) || sameDigest) continue;
      netDeltas.set(layerId, { before: delta.before, after: delta.after });
    }

    const parentNode = this.getNodeOrThrow(this.activeNodeId);
    const nodeId = `ms-${this.nextMilestoneSeq}`;
    this.nextMilestoneSeq += 1;

    const node: HistoryMilestoneNode = {
      nodeId, parentId: parentNode.nodeId, depth: parentNode.depth + 1, kind: batch.kind,
      label: summaryLabel?.trim() || `${batch.kind} (${batch.microEditCount}회 편집): ${batch.lastLabel}`,
      microEditCount: batch.microEditCount, createdAtMs: batch.lastTimestampMs, layerDeltas: netDeltas,
    };

    this.nodes.set(nodeId, node);
    this.activeNodeId = nodeId;
    this.branches.set(this.activeBranchName, nodeId);
    return node;
  }

  /** 현재 마일스톤(또는 지정한 브랜치/노드)에서 새 창작 변주 브랜치를 분기한다. */
  public createBranch(branchName: string, fromBranchOrNodeId?: string): string {
    const cleanName = branchName.trim();
    if (!cleanName) throw new Error("브랜치 이름은 비어 있을 수 없습니다.");
    this.flushMilestone();
    const baseNodeId =
      fromBranchOrNodeId !== undefined ? this.resolveNodeId(fromBranchOrNodeId) : this.activeNodeId;
    this.branches.set(cleanName, baseNodeId);
    return baseNodeId;
  }

  /** 대상 브랜치 또는 노드로 O(LCA) 경로만 전환하며 미변경 레이어 참조를 복사 없이 보존한다. */
  public checkout(branchOrNodeId: string): BranchCheckoutReport {
    this.flushMilestone();
    const fromNodeId = this.activeNodeId;
    const isNamedBranch = this.branches.has(branchOrNodeId);
    const toNodeId = this.resolveNodeId(branchOrNodeId);
    if (isNamedBranch) this.activeBranchName = branchOrNodeId;

    const lca = this.traceLcaPaths(fromNodeId, toNodeId);
    const mutatedSet = new Set<string>();

    for (const node of lca.upFromSourceToLca) {
      for (const [layerId, delta] of node.layerDeltas.entries()) {
        mutatedSet.add(layerId);
        if (delta.before === null) this.activeLayers.delete(layerId);
        else this.activeLayers.set(layerId, delta.before);
      }
    }
    for (const node of lca.downFromLcaToTarget) {
      for (const [layerId, delta] of node.layerDeltas.entries()) {
        mutatedSet.add(layerId);
        if (delta.after === null) this.activeLayers.delete(layerId);
        else this.activeLayers.set(layerId, delta.after);
      }
    }

    this.activeNodeId = toNodeId;
    let reusedUnchangedLayerCount = 0;
    for (const layerId of this.activeLayers.keys()) {
      if (!mutatedSet.has(layerId)) reusedUnchangedLayerCount += 1;
    }

    return {
      fromNodeId, toNodeId, lcaNodeId: lca.lcaNodeId, stepsTraversed: lca.stepsTraversed,
      mutatedLayerIds: [...mutatedSet].sort(), reusedUnchangedLayerCount, activeBranchName: this.activeBranchName,
    };
  }

  /** 전체 스냅샷 복제 없이 두 브랜치/노드 간 LCA 이후 델타만 집계해 변주 차이를 요약한다. */
  public diffVariations(sourceBranchOrNode: string, targetBranchOrNode: string): VariationDiffSummary {
    this.flushMilestone();
    const sourceNodeId = this.resolveNodeId(sourceBranchOrNode);
    const targetNodeId = this.resolveNodeId(targetBranchOrNode);
    const lca = this.traceLcaPaths(sourceNodeId, targetNodeId);

    const downFromLcaToSource = [...lca.upFromSourceToLca].reverse();
    const lcaBaseline = new Map<string, LayerPayloadRef | null>();
    const sourceFinal = new Map<string, LayerPayloadRef | null>();
    const targetFinal = new Map<string, LayerPayloadRef | null>();
    const milestoneCountsByKind: Record<EditableMilestoneKind, number> = {
      "stroke-batch": 0,
      "color-pass": 0,
      "balloon-layout": 0,
      "post-fx": 0,
    };

    for (const node of downFromLcaToSource) {
      if (node.kind !== "initial") milestoneCountsByKind[node.kind] += 1;
      for (const [layerId, delta] of node.layerDeltas.entries()) {
        if (!lcaBaseline.has(layerId)) lcaBaseline.set(layerId, delta.before);
        sourceFinal.set(layerId, delta.after);
      }
    }
    for (const node of lca.downFromLcaToTarget) {
      if (node.kind !== "initial") milestoneCountsByKind[node.kind] += 1;
      for (const [layerId, delta] of node.layerDeltas.entries()) {
        if (!lcaBaseline.has(layerId)) lcaBaseline.set(layerId, delta.before);
        targetFinal.set(layerId, delta.after);
      }
    }

    const addedLayerIds: string[] = [];
    const removedLayerIds: string[] = [];
    const modifiedLayerIds: string[] = [];

    for (const [layerId, baseRef] of lcaBaseline.entries()) {
      const srcRef = sourceFinal.has(layerId) ? (sourceFinal.get(layerId) ?? null) : baseRef;
      const dstRef = targetFinal.has(layerId) ? (targetFinal.get(layerId) ?? null) : baseRef;
      if (srcRef === null && dstRef !== null) addedLayerIds.push(layerId);
      else if (srcRef !== null && dstRef === null) removedLayerIds.push(layerId);
      else if (srcRef !== null && dstRef !== null && srcRef.contentDigest !== dstRef.contentDigest) {
        modifiedLayerIds.push(layerId);
      }
    }

    addedLayerIds.sort();
    removedLayerIds.sort();
    modifiedLayerIds.sort();
    const changedCount = addedLayerIds.length + removedLayerIds.length + modifiedLayerIds.length;

    return {
      sourceNodeId, targetNodeId, lcaNodeId: lca.lcaNodeId,
      sourceStepsFromLca: downFromLcaToSource.length, targetStepsFromLca: lca.downFromLcaToTarget.length,
      stepsTraversed: lca.stepsTraversed, addedLayerIds, removedLayerIds, modifiedLayerIds,
      unchangedActiveLayerCount: Math.max(0, this.activeLayers.size - changedCount), milestoneCountsByKind,
    };
  }

  public listMilestonesOnActiveLineage(): readonly HistoryMilestoneNode[] {
    this.flushMilestone();
    const chain: HistoryMilestoneNode[] = [];
    let cursor: HistoryMilestoneNode | undefined = this.nodes.get(this.activeNodeId);
    while (cursor !== undefined) {
      chain.push(cursor);
      cursor = cursor.parentId !== null ? this.nodes.get(cursor.parentId) : undefined;
    }
    return chain.reverse();
  }

  private resolveNodeId(branchOrNodeId: string): string {
    const branchHead = this.branches.get(branchOrNodeId);
    if (branchHead !== undefined) return branchHead;
    if (this.nodes.has(branchOrNodeId)) return branchOrNodeId;
    throw new Error(`알 수 없는 브랜치 또는 마일스톤 식별자입니다: ${branchOrNodeId}`);
  }

  private getNodeOrThrow(nodeId: string): HistoryMilestoneNode {
    const node = this.nodes.get(nodeId);
    if (node === undefined) throw new Error(`히스토리 마일스톤 노드를 찾을 수 없습니다: ${nodeId}`);
    return node;
  }

  private traceLcaPaths(sourceNodeId: string, targetNodeId: string) {
    let currSrc = this.getNodeOrThrow(sourceNodeId);
    let currDst = this.getNodeOrThrow(targetNodeId);
    const upFromSource: HistoryMilestoneNode[] = [];
    const upFromTarget: HistoryMilestoneNode[] = [];

    while (currSrc.depth > currDst.depth && currSrc.parentId !== null) {
      upFromSource.push(currSrc);
      currSrc = this.getNodeOrThrow(currSrc.parentId);
    }
    while (currDst.depth > currSrc.depth && currDst.parentId !== null) {
      upFromTarget.push(currDst);
      currDst = this.getNodeOrThrow(currDst.parentId);
    }
    while (currSrc.nodeId !== currDst.nodeId) {
      upFromSource.push(currSrc);
      upFromTarget.push(currDst);
      if (currSrc.parentId === null || currDst.parentId === null) {
        throw new Error("공통 루트를 공유하지 않는 분리된 히스토리 그래프입니다.");
      }
      currSrc = this.getNodeOrThrow(currSrc.parentId);
      currDst = this.getNodeOrThrow(currDst.parentId);
    }

    upFromTarget.reverse();
    return {
      lcaNodeId: currSrc.nodeId,
      upFromSourceToLca: upFromSource,
      downFromLcaToTarget: upFromTarget,
      stepsTraversed: upFromSource.length + upFromTarget.length,
    };
  }
}

export type PanelTemplateGenre = "action" | "romance" | "thriller" | "slice-of-life" | "fantasy" | "comedy";
export type PanelDramaticBeat = "establish" | "dialogue-build" | "emotional-close-up" | "impact-climax" | "cliffhanger-reveal" | "comedic-pause";

export interface NormalizedPanelSlot {
  readonly slotId: string; readonly x: number; readonly y: number;
  readonly width: number; readonly height: number; readonly slantDeg?: number;
}

export interface AdaptivePanelTemplate {
  readonly id: string; readonly titleKo: string; readonly titleEn: string;
  readonly genres: readonly PanelTemplateGenre[]; readonly cutCount: number;
  readonly aspectRatio: number; readonly dramaticBeat: PanelDramaticBeat;
  readonly scrollGutterRatio: number;
  readonly keywordsKo: readonly string[]; readonly keywordsEn: readonly string[];
  readonly slots: readonly NormalizedPanelSlot[];
}

export interface PanelTemplateSearchQuery {
  readonly genre?: PanelTemplateGenre; readonly cutCount?: number; readonly aspectRatio?: number;
  readonly dramaticBeat?: PanelDramaticBeat; readonly queryText?: string; readonly limit?: number;
}

export interface RankedPanelTemplateMatch {
  readonly template: AdaptivePanelTemplate;
  readonly score: number;
  readonly matchedKeywords: readonly string[];
}

export const DEFAULT_ADAPTIVE_PANEL_TEMPLATES: readonly AdaptivePanelTemplate[] = [
  {
    id: "tpl-action-diagonal-clash-3cut", titleKo: "대각선 격돌 3단 타격 컷", titleEn: "Diagonal Clash 3-Cut Impact",
    genres: ["action", "fantasy"], cutCount: 3, aspectRatio: 0.45, dramaticBeat: "impact-climax", scrollGutterRatio: 0.04,
    keywordsKo: ["대각선", "속도선", "타격", "필살기", "격돌", "액션"],
    keywordsEn: ["diagonal", "speedline", "clash", "impact", "slash", "battle"],
    slots: [
      { slotId: "c1", x: 0.04, y: 0.02, width: 0.92, height: 0.26, slantDeg: -12 },
      { slotId: "c2", x: 0.02, y: 0.31, width: 0.96, height: 0.38, slantDeg: 14 },
      { slotId: "c3", x: 0.06, y: 0.72, width: 0.88, height: 0.25, slantDeg: -8 },
    ],
  },
  {
    id: "tpl-romance-emotional-closeup-2cut", titleKo: "여백 호흡 감정 클로즈업 2컷", titleEn: "Breathing Scroll Emotional Close-Up 2-Cut",
    genres: ["romance", "slice-of-life"], cutCount: 2, aspectRatio: 0.45, dramaticBeat: "emotional-close-up", scrollGutterRatio: 0.18,
    keywordsKo: ["감정선", "독백", "눈빛", "클로즈업", "여백", "고백"],
    keywordsEn: ["emotion", "monologue", "gaze", "closeup", "confession", "romance"],
    slots: [
      { slotId: "c1", x: 0.1, y: 0.06, width: 0.8, height: 0.34 },
      { slotId: "c2", x: 0.05, y: 0.56, width: 0.9, height: 0.38 },
    ],
  },
  {
    id: "tpl-thriller-cliffhanger-reveal-1cut", titleKo: "암전 스크롤 반전 공개 풀블리드 1컷", titleEn: "Dark Scroll Cliffhanger Full-Bleed Reveal",
    genres: ["thriller", "fantasy"], cutCount: 1, aspectRatio: 0.42, dramaticBeat: "cliffhanger-reveal", scrollGutterRatio: 0.24,
    keywordsKo: ["반전", "절단신공", "서스펜스", "풀블리드", "엔딩", "공포"],
    keywordsEn: ["cliffhanger", "reveal", "suspense", "fullbleed", "ending", "twist"],
    slots: [{ slotId: "c1", x: 0, y: 0.2, width: 1, height: 0.8 }],
  },
  {
    id: "tpl-daily-dialogue-rhythm-4cut", titleKo: "일상 티키타카 대화 4컷 균등 배치", titleEn: "Everyday Dialogue Rhythm 4-Panel",
    genres: ["slice-of-life", "comedy", "romance"], cutCount: 4, aspectRatio: 0.707, dramaticBeat: "dialogue-build", scrollGutterRatio: 0.05,
    keywordsKo: ["일상", "대화", "말풍선", "4컷", "학교", "카페"],
    keywordsEn: ["dialogue", "fourpanel", "daily", "conversation", "balloon", "school"],
    slots: [
      { slotId: "c1", x: 0.06, y: 0.04, width: 0.88, height: 0.21 },
      { slotId: "c2", x: 0.06, y: 0.28, width: 0.88, height: 0.21 },
      { slotId: "c3", x: 0.06, y: 0.52, width: 0.88, height: 0.21 },
      { slotId: "c4", x: 0.06, y: 0.76, width: 0.88, height: 0.2 },
    ],
  },
  {
    id: "tpl-fantasy-world-establish-5cut", titleKo: "세계관 전경 파노라마 도입 5컷", titleEn: "World-Building Panorama Establish 5-Cut",
    genres: ["fantasy", "action"], cutCount: 5, aspectRatio: 1.6, dramaticBeat: "establish", scrollGutterRatio: 0.04,
    keywordsKo: ["세계관", "전경", "파노라마", "도입부", "성채", "원경"],
    keywordsEn: ["establish", "panorama", "worldbuilding", "opening", "landscape", "wide"],
    slots: [
      { slotId: "c1", x: 0.02, y: 0.04, width: 0.96, height: 0.42 },
      { slotId: "c2", x: 0.02, y: 0.5, width: 0.22, height: 0.46 },
      { slotId: "c3", x: 0.26, y: 0.5, width: 0.22, height: 0.46 },
      { slotId: "c4", x: 0.5, y: 0.5, width: 0.22, height: 0.46 },
      { slotId: "c5", x: 0.74, y: 0.5, width: 0.24, height: 0.46 },
    ],
  },
  {
    id: "tpl-comedy-deadpan-pause-3cut", titleKo: "무표정 정적 개그 3박자 컷", titleEn: "Deadpan Pause 3-Beat Gag",
    genres: ["comedy", "slice-of-life"], cutCount: 3, aspectRatio: 1, dramaticBeat: "comedic-pause", scrollGutterRatio: 0.08,
    keywordsKo: ["개그", "정적", "무표정", "리액션", "반전개그", "인스타툰"],
    keywordsEn: ["comedy", "deadpan", "pause", "gag", "reaction", "square"],
    slots: [
      { slotId: "c1", x: 0.05, y: 0.05, width: 0.43, height: 0.43 },
      { slotId: "c2", x: 0.52, y: 0.05, width: 0.43, height: 0.43 },
      { slotId: "c3", x: 0.05, y: 0.52, width: 0.9, height: 0.43 },
    ],
  },
];

function tokenizeQueryText(text: string): readonly string[] {
  return text
    .normalize("NFC")
    .toLowerCase()
    .split(/[\s,./|;:!?()[\]{}"'`~+-]+/u)
    .map((tok) => tok.trim())
    .filter((tok) => tok.length > 0);
}

/** 장르·컷 수·화면비·극적 비트·한영 검색어를 다중 가중치로 평가해 패널 템플릿을 순위화한다. */
export class AdaptivePanelTemplateIndex {
  private readonly templates = new Map<string, AdaptivePanelTemplate>();

  public constructor(
    initialTemplates: readonly AdaptivePanelTemplate[] = DEFAULT_ADAPTIVE_PANEL_TEMPLATES,
  ) {
    for (const tpl of initialTemplates) this.templates.set(tpl.id, tpl);
  }

  public registerTemplate(template: AdaptivePanelTemplate): void {
    this.templates.set(template.id, template);
  }

  public getTemplateCount(): number { return this.templates.size; }

  public search(query: PanelTemplateSearchQuery): readonly RankedPanelTemplateMatch[] {
    const queryTokens = query.queryText !== undefined ? tokenizeQueryText(query.queryText) : [];
    const limit = Math.max(1, Math.floor(query.limit ?? 10));
    const matches: RankedPanelTemplateMatch[] = [];

    for (const tpl of this.templates.values()) {
      let weightedSum = 0;
      let weightTotal = 0;

      if (query.genre !== undefined) {
        weightTotal += 0.28;
        const idx = tpl.genres.indexOf(query.genre);
        if (idx === 0) weightedSum += 0.28;
        else if (idx > 0) weightedSum += 0.28 * 0.78;
      }
      if (query.cutCount !== undefined && Number.isFinite(query.cutCount)) {
        weightTotal += 0.22;
        weightedSum += 0.22 * Math.exp(-Math.abs(tpl.cutCount - query.cutCount) * 0.65);
      }
      if (query.aspectRatio !== undefined && query.aspectRatio > 0) {
        weightTotal += 0.18;
        const logDist = Math.abs(Math.log(Math.max(0.05, tpl.aspectRatio) / query.aspectRatio));
        weightedSum += 0.18 * Math.exp(-logDist * 2.1);
      }
      if (query.dramaticBeat !== undefined) {
        weightTotal += 0.22;
        if (tpl.dramaticBeat === query.dramaticBeat) weightedSum += 0.22;
      }

      const matchedKeywords: string[] = [];
      if (queryTokens.length > 0) {
        weightTotal += 0.3;
        const corpus = [
          ...tpl.keywordsKo,
          ...tpl.keywordsEn,
          ...tokenizeQueryText(tpl.titleKo),
          ...tokenizeQueryText(tpl.titleEn),
        ].map((item) => item.normalize("NFC").toLowerCase());

        let tokenHits = 0;
        for (const qTok of queryTokens) {
          const hit = corpus.find((cand) => cand === qTok || cand.includes(qTok) || qTok.includes(cand));
          if (hit !== undefined) {
            tokenHits += 1;
            if (!matchedKeywords.includes(qTok)) matchedKeywords.push(qTok);
          }
        }
        weightedSum += 0.3 * (tokenHits / queryTokens.length);
      }

      matches.push({
        template: tpl,
        score: Number((weightTotal > 0 ? weightedSum / weightTotal : 1).toFixed(6)),
        matchedKeywords,
      });
    }

    matches.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.template.id.localeCompare(b.template.id)));
    return matches.slice(0, limit);
  }
}
