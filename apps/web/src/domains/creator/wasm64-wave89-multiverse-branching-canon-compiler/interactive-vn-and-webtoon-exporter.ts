/**
 * Wave 89: 인터랙티브 웹툰 분기 패키지 및 비주얼 노벨 스크립트·Mermaid 플로차트 내보내기.
 *
 * - 검증된 멀티버스 Merkle DAG를 중복 제거 자산 테이블·선택지 오버레이 스펙·Merkle 루트 서명이
 *   포함된 인터랙티브 웹툰 패키지와 비주얼 노벨 스크립트 + 안전 따옴표(`id["Label"]`) Mermaid로 출력한다.
 */

import {
  canonicalSerializeMultiverse,
  sha256MultiverseHex,
  type AssetDeduplicationMetrics,
  type AssetLayerKind,
  type ChoiceEdge,
  type CutNodeKind,
  type DialogueLine,
  type EndingMetadata,
  type MultiverseEpisodeDag,
  type PanelLayerRef,
  type WorldStateEffect,
  type WorldStateGuardCondition,
} from "./multiverse-merkle-cut-store";
import {
  createInitialWorldStateSnapshot,
  type MultiverseWorldStateAuditReport,
  type WorldStateSnapshot,
} from "./world-state-invariant-verifier";

export const INTERACTIVE_WEBTOON_BUNDLE_FORMAT_VERSION = "toonstudio-multiverse-webtoon/v1";
export const VISUAL_NOVEL_SCRIPT_FORMAT_VERSION = "toonstudio-multiverse-vn/v1";
export const DEFAULT_CHOICE_HIT_TARGET_PX = 44;

export interface DeduplicatedAssetTableEntry {
  readonly hash: string;
  readonly kind: AssetLayerKind;
  readonly labelKo: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly referencedByCutIds: readonly string[];
}
export interface WebtoonChoiceOverlaySpec {
  readonly edgeId: string;
  readonly choiceLabelKo: string;
  readonly targetCutId: string;
  readonly branchTag?: string;
  readonly isAutoAdvance: boolean;
  readonly minHitTargetPx: number;
  readonly placement: "bottom-sheet" | "inline-panel";
  readonly guard?: WorldStateGuardCondition;
  readonly effects: readonly WorldStateEffect[];
}
export interface CompiledConditionalVariantOverlay {
  readonly variantId: string;
  readonly labelKo: string;
  readonly priority: number;
  readonly when: WorldStateGuardCondition;
  readonly overrideLayers: readonly PanelLayerRef[];
  readonly overrideDialogueKo?: readonly DialogueLine[];
}
export interface CompiledWebtoonCut {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly titleKo: string;
  readonly nodeKind: CutNodeKind;
  readonly contentMerkleHash: string;
  readonly baseLayers: readonly PanelLayerRef[];
  readonly conditionalVariants: readonly CompiledConditionalVariantOverlay[];
  readonly dialogue: readonly DialogueLine[];
  readonly onEnterEffects: readonly WorldStateEffect[];
  readonly onExitEffects: readonly WorldStateEffect[];
  readonly choiceOverlays: readonly WebtoonChoiceOverlaySpec[];
  readonly ending?: EndingMetadata;
}
export interface CompiledEndingSummary {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly endingId: string;
  readonly endingTitleKo: string;
  readonly endingTag: string;
  readonly verifiedReachable?: boolean;
}
export type InteractiveWebtoonVerificationStatus = "verified" | "unverified" | "failed-invariants";
export interface InteractiveWebtoonBranchPackage {
  readonly formatVersion: typeof INTERACTIVE_WEBTOON_BUNDLE_FORMAT_VERSION;
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly startCutId: string;
  readonly episodeMerkleRoot: string;
  readonly bundleSignatureHash: string;
  readonly verificationStatus: InteractiveWebtoonVerificationStatus;
  readonly initialWorldState: WorldStateSnapshot;
  readonly deduplicationSummary: AssetDeduplicationMetrics;
  readonly assetTable: readonly DeduplicatedAssetTableEntry[];
  readonly cuts: readonly CompiledWebtoonCut[];
  readonly endings: readonly CompiledEndingSummary[];
}
export interface CompileInteractiveWebtoonOptions {
  readonly choicePlacement?: "bottom-sheet" | "inline-panel";
  readonly minHitTargetPx?: number;
}
export interface BundleIntegrityVerificationResult {
  readonly valid: boolean;
  readonly signatureMatches: boolean;
  readonly missingAssetRefs: readonly string[];
  readonly hasNonFiniteNumbers: boolean;
  readonly issuesKo: readonly string[];
}
export interface VisualNovelDialogueStep {
  readonly lineId: string;
  readonly speakerCharacterId: string;
  readonly speakerNameKo: string;
  readonly textKo: string;
}
export interface VisualNovelChoiceCommand {
  readonly edgeId: string;
  readonly labelKo: string;
  readonly targetSceneId: string;
  readonly branchTag?: string;
  readonly isAutoAdvance: boolean;
  readonly guardSummaryKo: string;
}
export interface VisualNovelConditionalOverlay {
  readonly variantId: string;
  readonly labelKo: string;
  readonly guardSummaryKo: string;
  readonly overrideLayerAssetHashes: readonly string[];
}
export interface VisualNovelSceneNode {
  readonly sceneId: string;
  readonly cutNumber: number;
  readonly titleKo: string;
  readonly nodeKind: CutNodeKind;
  readonly backgroundAssetHash?: string;
  readonly layerAssetHashes: readonly string[];
  readonly conditionalOverlays: readonly VisualNovelConditionalOverlay[];
  readonly dialogueSteps: readonly VisualNovelDialogueStep[];
  readonly choices: readonly VisualNovelChoiceCommand[];
  readonly ending?: EndingMetadata;
}
export interface VisualNovelChoiceScript {
  readonly formatVersion: typeof VISUAL_NOVEL_SCRIPT_FORMAT_VERSION;
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly episodeMerkleRoot: string;
  readonly startSceneId: string;
  readonly initialVariables: WorldStateSnapshot;
  readonly scenes: readonly VisualNovelSceneNode[];
  readonly scriptTextKo: string;
}
export interface MultiverseExportMetricsSummary {
  readonly totalCuts: number;
  readonly totalEdges: number;
  readonly endingCount: number;
  readonly reconvergenceCount: number;
  readonly uniqueAssetCount: number;
  readonly deduplicationSavingsPercent: number;
}
export interface MultiverseVnAndMermaidExport {
  readonly episodeId: string;
  readonly episodeMerkleRoot: string;
  readonly vnScript: VisualNovelChoiceScript;
  readonly mermaidFlowchart: string;
  readonly metricsSummary: MultiverseExportMetricsSummary;
}
export interface ExportMermaidAndVnOptions {
  readonly direction?: "TD" | "LR";
}

function safeFinite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
function sanitizeMermaidNodeId(rawId: string): string {
  const cleaned = rawId.replace(/[^A-Za-z0-9_]/g, "_");
  return cleaned.length === 0 ? "cut_node" : /^[0-9]/.test(cleaned) ? `cut_${cleaned}` : cleaned;
}
function escapeMermaidQuotedLabel(raw: string): string {
  return raw.replace(/\r?\n/g, " ").replace(/"/g, "'").replace(/[<>]/g, "").replace(/\|/g, "/").trim();
}

function summarizeGuardKo(guard: WorldStateGuardCondition | undefined): string {
  if (!guard) return "조건 없음";
  if (guard.kind === "item-has") return `${guard.itemId}=${guard.expected ? "보유" : "미보유"}`;
  if (guard.kind === "character-status") return `${guard.characterId} 상태∈[${guard.allowed.join(",")}]`;
  if (guard.kind === "costume-is") return `${guard.characterId} 의상∈[${guard.allowed.join(",")}]`;
  if (guard.kind === "relationship-range") {
    const parts = [
      guard.min !== undefined ? `>=${safeFinite(guard.min, 0)}` : "",
      guard.max !== undefined ? `<=${safeFinite(guard.max, 0)}` : "",
    ].filter(Boolean);
    return `${guard.targetId} 호감도 ${parts.join(" ")}`.trim();
  }
  if (guard.kind === "secret-known") return `비밀(${guard.secretId})=${guard.expected ? "인지" : "미인지"}`;
  if (guard.kind === "all") return guard.conditions.map(summarizeGuardKo).join(" AND ");
  if (guard.kind === "any") return guard.conditions.map(summarizeGuardKo).join(" OR ");
  return `NOT(${summarizeGuardKo(guard.condition)})`;
}

function groupEdgesByCut(dag: MultiverseEpisodeDag): {
  readonly outgoing: Map<string, ChoiceEdge[]>;
  readonly incomingCount: Map<string, number>;
  readonly sortedCutIds: string[];
} {
  const outgoing = new Map<string, ChoiceEdge[]>();
  const incomingCount = new Map<string, number>();
  for (const edge of dag.edges) {
    const list = outgoing.get(edge.fromCutId);
    if (list) list.push(edge);
    else outgoing.set(edge.fromCutId, [edge]);
    incomingCount.set(edge.toCutId, (incomingCount.get(edge.toCutId) ?? 0) + 1);
  }
  outgoing.forEach((list) => list.sort((a, b) => a.edgeId.localeCompare(b.edgeId)));
  const sortedCutIds = Object.keys(dag.cuts).sort(
    (a, b) => (dag.cuts[a]?.cutNumber ?? 0) - (dag.cuts[b]?.cutNumber ?? 0) || a.localeCompare(b),
  );
  return { outgoing, incomingCount, sortedCutIds };
}

function computeBundleSignature(payload: Omit<InteractiveWebtoonBranchPackage, "bundleSignatureHash">): string {
  return sha256MultiverseHex(canonicalSerializeMultiverse(payload));
}

function detectNonFiniteNumbers(value: unknown): boolean {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(detectNonFiniteNumbers);
  if (value !== null && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    return Object.keys(rec).some((k) => detectNonFiniteNumbers(rec[k]));
  }
  return false;
}

/** 멀티버스 Merkle DAG를 중복 제거 자산 테이블·선택지 오버레이·Merkle 서명이 포함된 인터랙티브 웹툰 패키지로 컴파일한다. */
export function compileInteractiveWebtoonBundle(
  dag: MultiverseEpisodeDag,
  auditReport?: MultiverseWorldStateAuditReport,
  options?: CompileInteractiveWebtoonOptions,
): InteractiveWebtoonBranchPackage {
  const placement = options?.choicePlacement ?? "bottom-sheet";
  const minHitTargetPx = Math.max(
    DEFAULT_CHOICE_HIT_TARGET_PX,
    Math.round(safeFinite(options?.minHitTargetPx ?? DEFAULT_CHOICE_HIT_TARGET_PX, DEFAULT_CHOICE_HIT_TARGET_PX)),
  );
  const { outgoing, sortedCutIds } = groupEdgesByCut(dag);
  const refsByHash = new Map<string, Set<string>>();
  const recordRef = (hash: string, cutId: string): void => {
    const set = refsByHash.get(hash) ?? new Set<string>();
    set.add(cutId);
    refsByHash.set(hash, set);
  };

  const cuts: CompiledWebtoonCut[] = [];
  const endings: CompiledEndingSummary[] = [];
  for (const cutId of sortedCutIds) {
    const cut = dag.cuts[cutId];
    if (!cut) continue;
    for (const layer of cut.baseLayers) recordRef(layer.assetHash, cut.cutId);
    const conditionalVariants: CompiledConditionalVariantOverlay[] = (cut.conditionalVariants ?? [])
      .slice()
      .sort((a, b) => a.priority - b.priority || a.variantId.localeCompare(b.variantId))
      .map((v) => {
        const overrideLayers = v.overrideLayers ?? [];
        for (const layer of overrideLayers) recordRef(layer.assetHash, cut.cutId);
        return {
          variantId: v.variantId,
          labelKo: v.labelKo,
          priority: safeFinite(v.priority, 0),
          when: v.when,
          overrideLayers,
          ...(v.overrideDialogueKo ? { overrideDialogueKo: v.overrideDialogueKo } : {}),
        };
      });
    const choiceOverlays: WebtoonChoiceOverlaySpec[] = (outgoing.get(cut.cutId) ?? []).map((edge) => ({
      edgeId: edge.edgeId,
      choiceLabelKo: edge.choiceLabelKo,
      targetCutId: edge.toCutId,
      ...(edge.branchTag !== undefined ? { branchTag: edge.branchTag } : {}),
      isAutoAdvance: Boolean(edge.isAutoAdvance),
      minHitTargetPx,
      placement,
      ...(edge.guard !== undefined ? { guard: edge.guard } : {}),
      effects: edge.effects ?? [],
    }));
    cuts.push({
      cutId: cut.cutId,
      cutNumber: safeFinite(cut.cutNumber, 0),
      titleKo: cut.titleKo,
      nodeKind: cut.nodeKind,
      contentMerkleHash: cut.contentMerkleHash,
      baseLayers: cut.baseLayers,
      conditionalVariants,
      dialogue: cut.dialogue ?? [],
      onEnterEffects: cut.onEnterEffects ?? [],
      onExitEffects: cut.onExitEffects ?? [],
      choiceOverlays,
      ...(cut.ending !== undefined ? { ending: cut.ending } : {}),
    });
    if (cut.ending !== undefined || cut.nodeKind === "ending") {
      endings.push({
        cutId: cut.cutId,
        cutNumber: safeFinite(cut.cutNumber, 0),
        endingId: cut.ending?.endingId ?? cut.cutId,
        endingTitleKo: cut.ending?.endingTitleKo ?? cut.titleKo,
        endingTag: cut.ending?.endingTag ?? "neutral",
        ...(auditReport !== undefined ? { verifiedReachable: auditReport.reachableEndingIds.indexOf(cut.cutId) >= 0 } : {}),
      });
    }
  }

  const assetTable: DeduplicatedAssetTableEntry[] = Object.keys(dag.blobs).sort().map((hash) => {
    const blob = dag.blobs[hash];
    const cutSet = refsByHash.get(hash);
    return {
      hash,
      kind: blob?.kind ?? "background",
      labelKo: blob?.labelKo ?? hash.slice(0, 12),
      mimeType: blob?.mimeType ?? "application/octet-stream",
      byteLength: safeFinite(blob?.byteLength ?? 0, 0),
      ...(blob?.widthPx !== undefined ? { widthPx: safeFinite(blob.widthPx, 0) } : {}),
      ...(blob?.heightPx !== undefined ? { heightPx: safeFinite(blob.heightPx, 0) } : {}),
      referencedByCutIds: cutSet ? Array.from(cutSet).sort() : [],
    };
  });

  const unsignedBundle: Omit<InteractiveWebtoonBranchPackage, "bundleSignatureHash"> = {
    formatVersion: INTERACTIVE_WEBTOON_BUNDLE_FORMAT_VERSION,
    episodeId: dag.episodeId,
    episodeTitleKo: dag.episodeTitleKo,
    startCutId: dag.startCutId,
    episodeMerkleRoot: dag.episodeMerkleRoot,
    verificationStatus: auditReport === undefined ? "unverified" : auditReport.passed ? "verified" : "failed-invariants",
    initialWorldState: createInitialWorldStateSnapshot(dag.initialWorldState),
    deduplicationSummary: dag.deduplicationMetrics,
    assetTable,
    cuts,
    endings,
  };
  return { ...unsignedBundle, bundleSignatureHash: computeBundleSignature(unsignedBundle) };
}

/** 컴파일된 인터랙티브 웹툰 패키지의 Merkle 서명, 자산 참조 무결성, 비유한 숫자 부재를 검증한다. */
export function verifyInteractiveWebtoonBundle(bundle: InteractiveWebtoonBranchPackage): BundleIntegrityVerificationResult {
  const issuesKo: string[] = [];
  const { bundleSignatureHash, ...unsignedPayload } = bundle;
  const signatureMatches = computeBundleSignature(unsignedPayload) === bundleSignatureHash;
  if (!signatureMatches) issuesKo.push("패키지 서명 해시가 본문과 일치하지 않습니다(변조 또는 손상 감지).");
  const assetHashes = new Set<string>(bundle.assetTable.map((e) => e.hash));
  const missingAssetRefs: string[] = [];
  for (const cut of bundle.cuts) {
    for (const ref of cut.baseLayers) if (!assetHashes.has(ref.assetHash)) missingAssetRefs.push(`${cut.cutId}:${ref.layerId}:${ref.assetHash}`);
    for (const v of cut.conditionalVariants) {
      for (const ref of v.overrideLayers) if (!assetHashes.has(ref.assetHash)) missingAssetRefs.push(`${cut.cutId}:${v.variantId}:${ref.assetHash}`);
    }
  }
  if (missingAssetRefs.length > 0) issuesKo.push(`자산 테이블에 누락된 레이어 참조가 ${missingAssetRefs.length}건 있습니다.`);
  const hasNonFiniteNumbers = detectNonFiniteNumbers(bundle);
  if (hasNonFiniteNumbers) issuesKo.push("패키지 수치 필드에 NaN 또는 비유한 값이 포함되어 있습니다.");
  return {
    valid: signatureMatches && missingAssetRefs.length === 0 && !hasNonFiniteNumbers,
    signatureMatches,
    missingAssetRefs,
    hasNonFiniteNumbers,
    issuesKo,
  };
}

/** 멀티버스 에피소드 DAG를 비주얼 노벨 스크립트와 안전 따옴표(`id["Label"]`) Mermaid 플로차트로 내보낸다. */
export function exportMultiverseMermaidAndVnScript(
  dag: MultiverseEpisodeDag,
  auditReport?: MultiverseWorldStateAuditReport,
  options?: ExportMermaidAndVnOptions,
): MultiverseVnAndMermaidExport {
  const { outgoing, incomingCount, sortedCutIds } = groupEdgesByCut(dag);
  const dedupPct = Math.round(safeFinite(dag.deduplicationMetrics.deduplicationSavingsRatio, 0) * 1000) / 10;
  const scenes: VisualNovelSceneNode[] = [];
  const scriptLines = [`# ${dag.episodeTitleKo} (${dag.episodeId})`, `# Merkle Root: ${dag.episodeMerkleRoot}`, ""];
  const mermaidLines = [
    `flowchart ${options?.direction ?? "TD"}`,
    `  %% Episode: ${escapeMermaidQuotedLabel(dag.episodeTitleKo)} | Merkle: ${dag.episodeMerkleRoot.slice(0, 16)} | Dedup: ${dedupPct}%`,
  ];

  const mermaidIdMap = new Map<string, string>();
  const usedIds = new Set<string>();
  for (const cutId of sortedCutIds) {
    let candidate = sanitizeMermaidNodeId(cutId);
    for (let suffix = 2; usedIds.has(candidate); suffix += 1) candidate = `${sanitizeMermaidNodeId(cutId)}_${suffix}`;
    usedIds.add(candidate);
    mermaidIdMap.set(cutId, candidate);
  }

  let endingCount = 0;
  let reconvergenceCount = 0;
  for (const cutId of sortedCutIds) {
    const cut = dag.cuts[cutId];
    if (!cut) continue;
    const inDeg = incomingCount.get(cutId) ?? 0;
    if (inDeg >= 2) reconvergenceCount += 1;
    const isEnding = cut.ending !== undefined || cut.nodeKind === "ending";
    if (isEnding) endingCount += 1;

    const bgLayer = cut.baseLayers.find((l) => l.kind === "background");
    const conditionalOverlays: VisualNovelConditionalOverlay[] = (cut.conditionalVariants ?? []).map((v) => ({
      variantId: v.variantId,
      labelKo: v.labelKo,
      guardSummaryKo: summarizeGuardKo(v.when),
      overrideLayerAssetHashes: (v.overrideLayers ?? []).map((l) => l.assetHash),
    }));
    const dialogueSteps: VisualNovelDialogueStep[] = (cut.dialogue ?? []).map((l) => ({
      lineId: l.lineId,
      speakerCharacterId: l.speakerCharacterId,
      speakerNameKo: l.speakerNameKo,
      textKo: l.textKo,
    }));
    const choices: VisualNovelChoiceCommand[] = (outgoing.get(cut.cutId) ?? []).map((e) => ({
      edgeId: e.edgeId,
      labelKo: e.choiceLabelKo,
      targetSceneId: e.toCutId,
      ...(e.branchTag !== undefined ? { branchTag: e.branchTag } : {}),
      isAutoAdvance: Boolean(e.isAutoAdvance),
      guardSummaryKo: summarizeGuardKo(e.guard),
    }));
    scenes.push({
      sceneId: cut.cutId,
      cutNumber: safeFinite(cut.cutNumber, 0),
      titleKo: cut.titleKo,
      nodeKind: cut.nodeKind,
      ...(bgLayer ? { backgroundAssetHash: bgLayer.assetHash } : {}),
      layerAssetHashes: cut.baseLayers.map((l) => l.assetHash),
      conditionalOverlays,
      dialogueSteps,
      choices,
      ...(cut.ending !== undefined ? { ending: cut.ending } : {}),
    });

    scriptLines.push(`## [${cut.cutNumber}컷] ${cut.titleKo} (${cut.cutId})`);
    for (const ov of conditionalOverlays) scriptLines.push(`  [조건부 레이어: ${ov.labelKo} | ${ov.guardSummaryKo}]`);
    for (const step of dialogueSteps) scriptLines.push(`  ${step.speakerNameKo}: "${step.textKo}"`);
    for (const ch of choices) {
      const guardNote = ch.guardSummaryKo !== "조건 없음" ? ` (${ch.guardSummaryKo})` : "";
      scriptLines.push(`  -> ${ch.branchTag ? `[${ch.branchTag}] ` : ""}${ch.labelKo}${guardNote} => ${ch.targetSceneId}`);
    }
    if (cut.ending) scriptLines.push(`  [엔딩:${cut.ending.endingTag}] ${cut.ending.endingTitleKo}`);
    scriptLines.push("");

    const nodeMid = mermaidIdMap.get(cut.cutId) ?? sanitizeMermaidNodeId(cut.cutId);
    const kindTag = isEnding ? `엔딩(${cut.ending?.endingTag ?? "neutral"})` : cut.nodeKind === "merge" || inDeg >= 2 ? "재합류" : cut.nodeKind === "start" ? "시작" : cut.nodeKind === "choice" ? "분기" : "장면";
    const statusBadge = isEnding && auditReport ? (auditReport.reachableEndingIds.indexOf(cut.cutId) >= 0 ? " / 도달가능" : " / 미도달") : "";
    mermaidLines.push(`  ${nodeMid}["${escapeMermaidQuotedLabel(`[${kindTag}] ${safeFinite(cut.cutNumber, 0)}컷: ${cut.titleKo}${statusBadge}`)}"]`);
  }

  for (const cutId of sortedCutIds) {
    const fromMid = mermaidIdMap.get(cutId) ?? sanitizeMermaidNodeId(cutId);
    for (const edge of outgoing.get(cutId) ?? []) {
      const toMid = mermaidIdMap.get(edge.toCutId) ?? sanitizeMermaidNodeId(edge.toCutId);
      mermaidLines.push(`  ${fromMid} -->|"${escapeMermaidQuotedLabel(`${edge.branchTag ? `${edge.branchTag}: ` : ""}${edge.choiceLabelKo}`)}"| ${toMid}`);
    }
  }

  return {
    episodeId: dag.episodeId,
    episodeMerkleRoot: dag.episodeMerkleRoot,
    vnScript: {
      formatVersion: VISUAL_NOVEL_SCRIPT_FORMAT_VERSION, episodeId: dag.episodeId,
      episodeTitleKo: dag.episodeTitleKo, episodeMerkleRoot: dag.episodeMerkleRoot,
      startSceneId: dag.startCutId, initialVariables: createInitialWorldStateSnapshot(dag.initialWorldState),
      scenes, scriptTextKo: scriptLines.join("\n").trimEnd(),
    },
    mermaidFlowchart: mermaidLines.join("\n"),
    metricsSummary: {
      totalCuts: sortedCutIds.length, totalEdges: dag.edges.length,
      endingCount, reconvergenceCount,
      uniqueAssetCount: Object.keys(dag.blobs).length, deduplicationSavingsPercent: dedupPct,
    },
  };
}
