/**
 * 웹툰 구조(회차→컷→레이어→말풍선) 단위 시맨틱 버전 제어 엔진 (Wave 40D).
 * - 바이너리 덮어쓰기 대신 컷·레이어·말풍선 단위 커밋 스냅샷·구조적 Diff·브랜치(main/alt-ending/editor-revision)
 * - LCA 기반 3-Way 시맨틱 자동 병합(서로 다른 컷·레이어 무충돌 병합, 동일 말풍선 충돌 핀포인트 + ours/theirs/manual 해결)
 * - 100% 인메모리 불변 결정론적 롤백(외부 브라우저 스토리지 미사용)
 */

import { computeDeterministicDigestHex, type RenderPassStage } from "./distributed-render-scheduler";

export type BalloonStyleKind = "normal" | "shout" | "whisper" | "thought" | "narration";
export type LayerBlendMode = "normal" | "multiply" | "screen" | "overlay" | "add";
export type CutCameraShot = "establishing" | "wide" | "medium" | "closeup" | "extreme-closeup";
export type SemanticEntityKind = "cut" | "layer" | "balloon";
export type SemanticChangeKind = "added" | "modified" | "removed";
export type MergeResolutionChoice = "ours" | "theirs" | "manual";
export type RollbackMode = "revert-commit" | "reset-head";

export interface ComicBalloonNode {
  readonly id: string;
  readonly speaker: string;
  readonly text: string;
  readonly style: BalloonStyleKind;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fontSizePx: number;
}

export interface ComicLayerNode {
  readonly id: string;
  readonly name: string;
  readonly role: RenderPassStage;
  readonly visible: boolean;
  readonly opacity: number;
  readonly blendMode: LayerBlendMode;
  readonly strokeDigest: string;
}

export interface ComicCutNode {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly cameraShot: CutCameraShot;
  readonly heightPx: number;
  readonly layers: readonly ComicLayerNode[];
  readonly balloons: readonly ComicBalloonNode[];
}

export interface ComicEpisodeSnapshot {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly title: string;
  readonly cuts: readonly ComicCutNode[];
}

export interface SemanticFieldChange {
  readonly field: string;
  readonly before: string;
  readonly after: string;
}

export interface SemanticDiffEntry {
  readonly id: string;
  readonly entityKind: SemanticEntityKind;
  readonly changeKind: SemanticChangeKind;
  readonly cutId: string;
  readonly entityId: string;
  readonly path: string;
  readonly label: string;
  readonly changedFields: readonly SemanticFieldChange[];
}

export interface SemanticDiffSummary {
  readonly cutsAdded: number;
  readonly cutsModified: number;
  readonly cutsRemoved: number;
  readonly layersAdded: number;
  readonly layersModified: number;
  readonly layersRemoved: number;
  readonly balloonsAdded: number;
  readonly balloonsModified: number;
  readonly balloonsRemoved: number;
  readonly totalChanges: number;
  readonly hasChanges: boolean;
}

export interface SemanticDiffReport {
  readonly baseTreeHash: string;
  readonly targetTreeHash: string;
  readonly entries: readonly SemanticDiffEntry[];
  readonly summary: SemanticDiffSummary;
}

export interface SemanticCommit {
  readonly id: string;
  readonly parentIds: readonly string[];
  readonly branchName: string;
  readonly author: string;
  readonly message: string;
  readonly timestampIso: string;
  readonly treeHash: string;
  readonly snapshot: ComicEpisodeSnapshot;
}

export interface SemanticBranchRef {
  readonly name: string;
  readonly headCommitId: string;
  readonly description: string;
  readonly createdFromCommitId: string;
  readonly isProtected: boolean;
}

export interface SemanticMergeConflict {
  readonly conflictId: string;
  readonly entityKind: SemanticEntityKind;
  readonly cutId: string;
  readonly entityId: string;
  readonly path: string;
  readonly label: string;
  readonly reason: "concurrent-edit" | "modify-delete";
  readonly conflictedFields: readonly string[];
  readonly baseSummary: string;
  readonly oursSummary: string;
  readonly theirsSummary: string;
  readonly baseBalloon?: ComicBalloonNode;
  readonly oursBalloon?: ComicBalloonNode;
  readonly theirsBalloon?: ComicBalloonNode;
  readonly baseLayer?: ComicLayerNode;
  readonly oursLayer?: ComicLayerNode;
  readonly theirsLayer?: ComicLayerNode;
  readonly baseCut?: ComicCutNode;
  readonly oursCut?: ComicCutNode;
  readonly theirsCut?: ComicCutNode;
}

export interface ThreeWayMergePlan {
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly baseCommitId: string;
  readonly oursCommitId: string;
  readonly theirsCommitId: string;
  readonly canAutoMerge: boolean;
  readonly autoMergedFromOurs: number;
  readonly autoMergedFromTheirs: number;
  readonly mergedSnapshot: ComicEpisodeSnapshot;
  readonly conflicts: readonly SemanticMergeConflict[];
}

export interface ConflictResolutionInput {
  readonly conflictId: string;
  readonly choice: MergeResolutionChoice;
  readonly manualText?: string;
  readonly manualSpeaker?: string;
  readonly manualStyle?: BalloonStyleKind;
  readonly manualOpacity?: number;
  readonly manualTitle?: string;
}

export interface RollbackRecord {
  readonly rollbackId: string;
  readonly branchName: string;
  readonly fromCommitId: string;
  readonly toCommitId: string;
  readonly resultCommitId: string;
  readonly mode: RollbackMode;
  readonly reason: string;
  readonly timestampIso: string;
}

export interface SemanticVcsRepository {
  readonly repoId: string;
  readonly activeBranch: string;
  readonly commits: Readonly<Record<string, SemanticCommit>>;
  readonly commitOrder: readonly string[];
  readonly branches: Readonly<Record<string, SemanticBranchRef>>;
  readonly rollbackHistory: readonly RollbackRecord[];
}

function serializeBalloon(b: ComicBalloonNode): string {
  return JSON.stringify([b.id, b.speaker, b.text, b.style, b.x, b.y, b.width, b.height, b.fontSizePx]);
}

function serializeLayer(l: ComicLayerNode): string {
  return JSON.stringify([l.id, l.name, l.role, l.visible, l.opacity, l.blendMode, l.strokeDigest]);
}

function serializeCutMeta(c: ComicCutNode): string {
  return JSON.stringify([c.id, c.order, c.title, c.cameraShot, c.heightPx]);
}

function serializeCutFull(c: ComicCutNode): string {
  return JSON.stringify([serializeCutMeta(c), c.layers.map(serializeLayer), c.balloons.map(serializeBalloon)]);
}

/** 에피소드 스냅샷의 정규화된 시맨틱 트리 해시를 결정론적으로 계산한다. */
export function computeEpisodeTreeHash(snapshot: ComicEpisodeSnapshot): string {
  const requireIds = (ids: readonly string[]): void => {
    if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length) throw new Error("스냅샷의 컷·레이어·말풍선 ID는 각 범위에서 고유하고 비어 있지 않아야 합니다.");
  };
  const requireNumbers = (values: readonly number[]): void => {
    if (values.some((value) => !Number.isFinite(value))) throw new RangeError("스냅샷 수치는 유한해야 합니다.");
  };
  requireNumbers([snapshot.episodeNumber]);
  requireIds(snapshot.cuts.map((cut) => cut.id));
  for (const cut of snapshot.cuts) {
    requireNumbers([cut.order, cut.heightPx, ...cut.layers.map((layer) => layer.opacity)]);
    for (const balloon of cut.balloons) requireNumbers([balloon.x, balloon.y, balloon.width, balloon.height, balloon.fontSizePx]);
    requireIds(cut.layers.map((layer) => layer.id));
    requireIds(cut.balloons.map((balloon) => balloon.id));
  }
  return computeDeterministicDigestHex(
    JSON.stringify([snapshot.episodeId, snapshot.episodeNumber, snapshot.title, snapshot.cuts.map(serializeCutFull)]),
  );
}

function createCommitId(parentIds: readonly string[], treeHash: string, branchName: string, message: string, seq: number): string {
  return `c-${computeDeterministicDigestHex(`${parentIds.join(",")}|${treeHash}|${branchName}|${message}|#${seq}`).slice(0, 8)}`;
}

function diffBalloonFields(before: ComicBalloonNode, after: ComicBalloonNode): SemanticFieldChange[] {
  const changes: SemanticFieldChange[] = [];
  if (before.speaker !== after.speaker) changes.push({ field: "speaker", before: before.speaker, after: after.speaker });
  if (before.text !== after.text) changes.push({ field: "text", before: before.text, after: after.text });
  if (before.style !== after.style) changes.push({ field: "style", before: before.style, after: after.style });
  if (before.x !== after.x || before.y !== after.y || before.width !== after.width || before.height !== after.height) {
    changes.push({ field: "bounds", before: `${before.x},${before.y} (${before.width}×${before.height})`, after: `${after.x},${after.y} (${after.width}×${after.height})` });
  }
  if (before.fontSizePx !== after.fontSizePx) changes.push({ field: "fontSizePx", before: `${before.fontSizePx}px`, after: `${after.fontSizePx}px` });
  return changes;
}

function diffLayerFields(before: ComicLayerNode, after: ComicLayerNode): SemanticFieldChange[] {
  const changes: SemanticFieldChange[] = [];
  if (before.name !== after.name) changes.push({ field: "name", before: before.name, after: after.name });
  if (before.role !== after.role) changes.push({ field: "role", before: before.role, after: after.role });
  if (before.visible !== after.visible) changes.push({ field: "visible", before: String(before.visible), after: String(after.visible) });
  if (before.opacity !== after.opacity) changes.push({ field: "opacity", before: `${Math.round(before.opacity * 100)}%`, after: `${Math.round(after.opacity * 100)}%` });
  if (before.blendMode !== after.blendMode) changes.push({ field: "blendMode", before: before.blendMode, after: after.blendMode });
  if (before.strokeDigest !== after.strokeDigest) changes.push({ field: "strokeDigest", before: before.strokeDigest, after: after.strokeDigest });
  return changes;
}

function diffCutMetaFields(before: ComicCutNode, after: ComicCutNode): SemanticFieldChange[] {
  const changes: SemanticFieldChange[] = [];
  if (before.order !== after.order) changes.push({ field: "order", before: String(before.order), after: String(after.order) });
  if (before.title !== after.title) changes.push({ field: "title", before: before.title, after: after.title });
  if (before.cameraShot !== after.cameraShot) changes.push({ field: "cameraShot", before: before.cameraShot, after: after.cameraShot });
  if (before.heightPx !== after.heightPx) changes.push({ field: "heightPx", before: `${before.heightPx}px`, after: `${after.heightPx}px` });
  return changes;
}

/** 두 웹툰 스냅샷 사이의 컷·레이어·말풍선 구조적 Diff를 정확히 산출한다. */
export function computeSemanticDiff(base: ComicEpisodeSnapshot, target: ComicEpisodeSnapshot): SemanticDiffReport {
  const entries: SemanticDiffEntry[] = [];
  const baseCuts = new Map(base.cuts.map((c) => [c.id, c]));
  const targetCuts = new Map(target.cuts.map((c) => [c.id, c]));
  let cutsAdded = 0, cutsModified = 0, cutsRemoved = 0;
  let layersAdded = 0, layersModified = 0, layersRemoved = 0;
  let balloonsAdded = 0, balloonsModified = 0, balloonsRemoved = 0;

  for (const cutId of new Set([...baseCuts.keys(), ...targetCuts.keys()])) {
    const bCut = baseCuts.get(cutId);
    const aCut = targetCuts.get(cutId);
    if (!bCut && aCut) {
      cutsAdded += 1;
      entries.push({ id: `diff-cut-add-${cutId}`, entityKind: "cut", changeKind: "added", cutId, entityId: cutId, path: cutId, label: aCut.title, changedFields: [{ field: "cut", before: "(없음)", after: `${aCut.title} (${aCut.layers.length}레이어 · ${aCut.balloons.length}말풍선)` }] });
      continue;
    }
    if (bCut && !aCut) {
      cutsRemoved += 1;
      entries.push({ id: `diff-cut-del-${cutId}`, entityKind: "cut", changeKind: "removed", cutId, entityId: cutId, path: cutId, label: bCut.title, changedFields: [{ field: "cut", before: bCut.title, after: "(삭제됨)" }] });
      continue;
    }
    if (!bCut || !aCut) continue;

    const metaDiff = diffCutMetaFields(bCut, aCut);
    if (metaDiff.length > 0) {
      cutsModified += 1;
      entries.push({ id: `diff-cut-mod-${cutId}`, entityKind: "cut", changeKind: "modified", cutId, entityId: cutId, path: cutId, label: aCut.title, changedFields: metaDiff });
    }

    const bLayers = new Map(bCut.layers.map((l) => [l.id, l]));
    const aLayers = new Map(aCut.layers.map((l) => [l.id, l]));
    for (const layerId of new Set([...bLayers.keys(), ...aLayers.keys()])) {
      const bL = bLayers.get(layerId);
      const aL = aLayers.get(layerId);
      if (!bL && aL) {
        layersAdded += 1;
        entries.push({ id: `diff-layer-add-${cutId}-${layerId}`, entityKind: "layer", changeKind: "added", cutId, entityId: layerId, path: `${cutId}/layer/${layerId}`, label: aL.name, changedFields: [{ field: "layer", before: "(없음)", after: `${aL.name} (${aL.role})` }] });
      } else if (bL && !aL) {
        layersRemoved += 1;
        entries.push({ id: `diff-layer-del-${cutId}-${layerId}`, entityKind: "layer", changeKind: "removed", cutId, entityId: layerId, path: `${cutId}/layer/${layerId}`, label: bL.name, changedFields: [{ field: "layer", before: bL.name, after: "(삭제됨)" }] });
      } else if (bL && aL) {
        const lDiff = diffLayerFields(bL, aL);
        if (lDiff.length > 0) {
          layersModified += 1;
          entries.push({ id: `diff-layer-mod-${cutId}-${layerId}`, entityKind: "layer", changeKind: "modified", cutId, entityId: layerId, path: `${cutId}/layer/${layerId}`, label: aL.name, changedFields: lDiff });
        }
      }
    }

    const bBals = new Map(bCut.balloons.map((b) => [b.id, b]));
    const aBals = new Map(aCut.balloons.map((b) => [b.id, b]));
    for (const balloonId of new Set([...bBals.keys(), ...aBals.keys()])) {
      const bB = bBals.get(balloonId);
      const aB = aBals.get(balloonId);
      if (!bB && aB) {
        balloonsAdded += 1;
        entries.push({ id: `diff-bal-add-${cutId}-${balloonId}`, entityKind: "balloon", changeKind: "added", cutId, entityId: balloonId, path: `${cutId}/balloon/${balloonId}`, label: `${aB.speaker} 말풍선`, changedFields: [{ field: "text", before: "(없음)", after: aB.text }] });
      } else if (bB && !aB) {
        balloonsRemoved += 1;
        entries.push({ id: `diff-bal-del-${cutId}-${balloonId}`, entityKind: "balloon", changeKind: "removed", cutId, entityId: balloonId, path: `${cutId}/balloon/${balloonId}`, label: `${bB.speaker} 말풍선`, changedFields: [{ field: "text", before: bB.text, after: "(삭제됨)" }] });
      } else if (bB && aB) {
        const bDiff = diffBalloonFields(bB, aB);
        if (bDiff.length > 0) {
          balloonsModified += 1;
          entries.push({ id: `diff-bal-mod-${cutId}-${balloonId}`, entityKind: "balloon", changeKind: "modified", cutId, entityId: balloonId, path: `${cutId}/balloon/${balloonId}`, label: `${aB.speaker} 말풍선`, changedFields: bDiff });
        }
      }
    }
  }

  return {
    baseTreeHash: computeEpisodeTreeHash(base),
    targetTreeHash: computeEpisodeTreeHash(target),
    entries,
    summary: {
      cutsAdded, cutsModified, cutsRemoved, layersAdded, layersModified, layersRemoved,
      balloonsAdded, balloonsModified, balloonsRemoved, totalChanges: entries.length, hasChanges: entries.length > 0,
    },
  };
}

/** 활성 브랜치 또는 지정 브랜치의 현재 HEAD 커밋을 반환한다. */
export function getBranchHeadCommit(repo: SemanticVcsRepository, branchName: string = repo.activeBranch): SemanticCommit | undefined {
  const ref = repo.branches[branchName];
  return ref ? repo.commits[ref.headCommitId] : undefined;
}

/** 지정 브랜치의 조상 커밋 이력을 최신순으로 반환한다. */
export function getBranchHistory(repo: SemanticVcsRepository, branchName: string = repo.activeBranch): readonly SemanticCommit[] {
  const head = getBranchHeadCommit(repo, branchName);
  if (!head) return [];
  const result: SemanticCommit[] = [];
  const visited = new Set<string>();
  const queue: string[] = [head.id];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    const commit = repo.commits[id];
    if (!commit) continue;
    result.push(commit);
    for (const parentId of commit.parentIds) {
      if (!visited.has(parentId)) queue.push(parentId);
    }
  }
  return result;
}

/** 신규 시맨틱 VCS 저장소를 루트 스냅샷으로 초기화한다. */
export function createSemanticVcsRepository(options: {
  readonly repoId: string;
  readonly initialSnapshot: ComicEpisodeSnapshot;
  readonly author?: string;
  readonly initialMessage?: string;
  readonly timestampIso?: string;
}): SemanticVcsRepository {
  const treeHash = computeEpisodeTreeHash(options.initialSnapshot);
  const message = options.initialMessage ?? "초기 원고 스냅샷 생성";
  const commitId = createCommitId([], treeHash, "main", message, 1);
  const rootCommit: SemanticCommit = {
    id: commitId, parentIds: [], branchName: "main", author: options.author ?? "작가 한서윤",
    message, timestampIso: options.timestampIso ?? "2026-11-24T09:00:00.000Z", treeHash, snapshot: options.initialSnapshot,
  };
  return {
    repoId: options.repoId, activeBranch: "main", commits: { [commitId]: rootCommit }, commitOrder: [commitId],
    branches: { main: { name: "main", headCommitId: commitId, description: "연재 출고 기준 본편 브랜치", createdFromCommitId: commitId, isProtected: true } },
    rollbackHistory: [],
  };
}

/** 기존 브랜치 또는 지정 커밋에서 새 시맨틱 브랜치를 분기한다. */
export function createSemanticBranch(
  repo: SemanticVcsRepository,
  branchName: string,
  options?: { readonly fromBranch?: string; readonly fromCommitId?: string; readonly description?: string; readonly switchToNew?: boolean },
): SemanticVcsRepository {
  const normalized = branchName.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-");
  if (!normalized || repo.branches[normalized]) return repo;
  const sourceBranch = options?.fromBranch ?? repo.activeBranch;
  const baseCommitId = options?.fromCommitId ?? repo.branches[sourceBranch]?.headCommitId;
  if (!baseCommitId || !repo.commits[baseCommitId]) return repo;
  return {
    ...repo,
    activeBranch: options?.switchToNew ? normalized : repo.activeBranch,
    branches: {
      ...repo.branches,
      [normalized]: {
        name: normalized, headCommitId: baseCommitId,
        description: options?.description ?? `${sourceBranch}에서 분기된 작업 브랜치`,
        createdFromCommitId: baseCommitId, isProtected: false,
      },
    },
  };
}

/** 작업 대상 활성 브랜치를 전환한다. */
export function switchSemanticBranch(repo: SemanticVcsRepository, branchName: string): SemanticVcsRepository {
  return repo.branches[branchName] ? { ...repo, activeBranch: branchName } : repo;
}

/** 지정 브랜치에 구조적 스냅샷 커밋을 추가한다. */
export function commitSemanticSnapshot(
  repo: SemanticVcsRepository,
  snapshot: ComicEpisodeSnapshot,
  options: { readonly branchName?: string; readonly author?: string; readonly message: string; readonly timestampIso?: string; readonly extraParentIds?: readonly string[] },
): { readonly repo: SemanticVcsRepository; readonly commit: SemanticCommit } {
  const targetBranch = options.branchName ?? repo.activeBranch;
  const branchRef = repo.branches[targetBranch];
  const parentIds = [...(branchRef ? [branchRef.headCommitId] : []), ...(options.extraParentIds ?? [])];
  const treeHash = computeEpisodeTreeHash(snapshot);
  const seq = repo.commitOrder.length + 1;
  const id = createCommitId(parentIds, treeHash, targetBranch, options.message, seq);
  const commit: SemanticCommit = {
    id, parentIds, branchName: targetBranch, author: options.author ?? "작가 한서윤", message: options.message,
    timestampIso: options.timestampIso ?? `2026-11-24T09:${String(Math.min(59, seq * 3)).padStart(2, "0")}:00.000Z`,
    treeHash, snapshot,
  };
  const nextBranch: SemanticBranchRef = branchRef
    ? { ...branchRef, headCommitId: id }
    : { name: targetBranch, headCommitId: id, description: "작업 브랜치", createdFromCommitId: id, isProtected: false };
  return {
    commit,
    repo: {
      ...repo, commits: { ...repo.commits, [id]: commit }, commitOrder: [...repo.commitOrder, id],
      branches: { ...repo.branches, [targetBranch]: nextBranch },
    },
  };
}

/** 두 커밋의 최소 공통 조상(LCA / Merge Base) 커밋 ID를 BFS로 탐색한다. */
export function findMergeBaseCommitId(repo: SemanticVcsRepository, commitAId: string, commitBId: string): string | null {
  const depthsA = new Map<string, number>();
  const queueA: { id: string; depth: number }[] = [{ id: commitAId, depth: 0 }];
  while (queueA.length > 0) {
    const current = queueA.shift();
    if (!current || depthsA.has(current.id)) continue;
    depthsA.set(current.id, current.depth);
    for (const parentId of repo.commits[current.id]?.parentIds ?? []) {
      if (!depthsA.has(parentId)) queueA.push({ id: parentId, depth: current.depth + 1 });
    }
  }
  let bestId: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const visitedB = new Set<string>();
  const queueB: { id: string; depth: number }[] = [{ id: commitBId, depth: 0 }];
  while (queueB.length > 0) {
    const current = queueB.shift();
    if (!current || visitedB.has(current.id)) continue;
    visitedB.add(current.id);
    const depthA = depthsA.get(current.id);
    if (depthA !== undefined && depthA + current.depth < bestScore) {
      bestScore = depthA + current.depth;
      bestId = current.id;
    }
    for (const parentId of repo.commits[current.id]?.parentIds ?? []) {
      if (!visitedB.has(parentId)) queueB.push({ id: parentId, depth: current.depth + 1 });
    }
  }
  return bestId;
}

function summarizeBalloon(b: ComicBalloonNode | undefined): string {
  return b ? `[${b.speaker}/${b.style}] "${b.text}"` : "(삭제됨)";
}

function summarizeLayer(l: ComicLayerNode | undefined): string {
  return l ? `${l.name} (${l.blendMode}, ${Math.round(l.opacity * 100)}%, ${l.strokeDigest})` : "(삭제됨)";
}

function createConflictId(kind: "cut" | "cut-meta" | "layer" | "balloon", cutId: string, entityId?: string): string {
  // 구분자를 포함한 ID도 튜플 경계를 보존하며, DOM 식별자에는 공백을 넣지 않는다.
  return `conflict-${encodeURIComponent(JSON.stringify([kind, cutId, entityId ?? null]))}`;
}

/** 3-Way 시맨틱 자동 병합 계획을 수립한다(무충돌 자동 병합 + 동시 수정 충돌 핀포인트). */
export function planThreeWaySemanticMerge(
  repo: SemanticVcsRepository,
  sourceBranch: string,
  targetBranch: string = repo.activeBranch,
): ThreeWayMergePlan {
  const oursCommit = getBranchHeadCommit(repo, targetBranch);
  const theirsCommit = getBranchHeadCommit(repo, sourceBranch);
  if (!oursCommit || !theirsCommit) throw new Error(`브랜치를 찾을 수 없습니다: target=${targetBranch}, source=${sourceBranch}`);
  const baseCommitId = findMergeBaseCommitId(repo, oursCommit.id, theirsCommit.id) ?? oursCommit.id;
  const baseCommit = repo.commits[baseCommitId] ?? oursCommit;

  const baseCuts = new Map(baseCommit.snapshot.cuts.map((c) => [c.id, c]));
  const oursCuts = new Map(oursCommit.snapshot.cuts.map((c) => [c.id, c]));
  const theirsCuts = new Map(theirsCommit.snapshot.cuts.map((c) => [c.id, c]));
  const mergedCuts: ComicCutNode[] = [];
  const conflicts: SemanticMergeConflict[] = [];
  let autoMergedFromOurs = 0;
  let autoMergedFromTheirs = 0;

  for (const cutId of new Set([...baseCuts.keys(), ...oursCuts.keys(), ...theirsCuts.keys()])) {
    const bCut = baseCuts.get(cutId);
    const oCut = oursCuts.get(cutId);
    const tCut = theirsCuts.get(cutId);
    if (!bCut) {
      if (oCut && !tCut) { mergedCuts.push(oCut); autoMergedFromOurs += 1; }
      else if (!oCut && tCut) { mergedCuts.push(tCut); autoMergedFromTheirs += 1; }
      else if (oCut && tCut) {
        mergedCuts.push(oCut);
        if (serializeCutFull(oCut) !== serializeCutFull(tCut)) {
          conflicts.push({ conflictId: createConflictId("cut", cutId), entityKind: "cut", cutId, entityId: cutId, path: cutId, label: oCut.title, reason: "concurrent-edit", conflictedFields: ["cut"], baseSummary: "(없음)", oursSummary: oCut.title, theirsSummary: tCut.title, oursCut: oCut, theirsCut: tCut });
        }
      }
      continue;
    }
    if (!oCut && !tCut) continue;
    if (!oCut && tCut) {
      if (serializeCutFull(bCut) === serializeCutFull(tCut)) { autoMergedFromOurs += 1; continue; }
      mergedCuts.push(tCut);
      conflicts.push({ conflictId: createConflictId("cut", cutId), entityKind: "cut", cutId, entityId: cutId, path: cutId, label: bCut.title, reason: "modify-delete", conflictedFields: ["cut"], baseSummary: bCut.title, oursSummary: "(삭제됨)", theirsSummary: tCut.title, baseCut: bCut, theirsCut: tCut });
      continue;
    }
    if (oCut && !tCut) {
      if (serializeCutFull(bCut) === serializeCutFull(oCut)) { autoMergedFromTheirs += 1; continue; }
      mergedCuts.push(oCut);
      conflicts.push({ conflictId: createConflictId("cut", cutId), entityKind: "cut", cutId, entityId: cutId, path: cutId, label: bCut.title, reason: "modify-delete", conflictedFields: ["cut"], baseSummary: bCut.title, oursSummary: oCut.title, theirsSummary: "(삭제됨)", baseCut: bCut, oursCut: oCut });
      continue;
    }
    if (!oCut || !tCut) continue;

    const bMeta = serializeCutMeta(bCut), oMeta = serializeCutMeta(oCut), tMeta = serializeCutMeta(tCut);
    let chosenMetaCut: ComicCutNode = oCut;
    if (oMeta === bMeta && tMeta !== bMeta) { chosenMetaCut = tCut; autoMergedFromTheirs += 1; }
    else if (oMeta !== bMeta && tMeta === bMeta) { chosenMetaCut = oCut; autoMergedFromOurs += 1; }
    else if (oMeta !== tMeta) {
      conflicts.push({ conflictId: createConflictId("cut-meta", cutId), entityKind: "cut", cutId, entityId: cutId, path: cutId, label: oCut.title, reason: "concurrent-edit", conflictedFields: diffCutMetaFields(oCut, tCut).map((f) => f.field), baseSummary: `${bCut.title} (${bCut.cameraShot})`, oursSummary: `${oCut.title} (${oCut.cameraShot})`, theirsSummary: `${tCut.title} (${tCut.cameraShot})`, baseCut: bCut, oursCut: oCut, theirsCut: tCut });
    }

    const bLayers = new Map(bCut.layers.map((l) => [l.id, l]));
    const oLayers = new Map(oCut.layers.map((l) => [l.id, l]));
    const tLayers = new Map(tCut.layers.map((l) => [l.id, l]));
    const mergedLayers: ComicLayerNode[] = [];
    for (const layerId of new Set([...bLayers.keys(), ...oLayers.keys(), ...tLayers.keys()])) {
      const bL = bLayers.get(layerId), oL = oLayers.get(layerId), tL = tLayers.get(layerId);
      const bStr = bL ? serializeLayer(bL) : "", oStr = oL ? serializeLayer(oL) : "", tStr = tL ? serializeLayer(tL) : "";
      if (oStr === tStr) { if (oL) mergedLayers.push(oL); }
      else if (oStr === bStr) { if (tL) mergedLayers.push(tL); autoMergedFromTheirs += 1; }
      else if (tStr === bStr) { if (oL) mergedLayers.push(oL); autoMergedFromOurs += 1; }
      else {
        if (oL) mergedLayers.push(oL); else if (tL) mergedLayers.push(tL);
        conflicts.push({ conflictId: createConflictId("layer", cutId, layerId), entityKind: "layer", cutId, entityId: layerId, path: `${cutId}/layer/${layerId}`, label: (oL ?? tL ?? bL)?.name ?? layerId, reason: !oL || !tL ? "modify-delete" : "concurrent-edit", conflictedFields: oL && tL ? diffLayerFields(oL, tL).map((f) => f.field) : ["layer"], baseSummary: summarizeLayer(bL), oursSummary: summarizeLayer(oL), theirsSummary: summarizeLayer(tL), baseLayer: bL, oursLayer: oL, theirsLayer: tL });
      }
    }

    const bBals = new Map(bCut.balloons.map((b) => [b.id, b]));
    const oBals = new Map(oCut.balloons.map((b) => [b.id, b]));
    const tBals = new Map(tCut.balloons.map((b) => [b.id, b]));
    const mergedBalloons: ComicBalloonNode[] = [];
    for (const balloonId of new Set([...bBals.keys(), ...oBals.keys(), ...tBals.keys()])) {
      const bB = bBals.get(balloonId), oB = oBals.get(balloonId), tB = tBals.get(balloonId);
      const bStr = bB ? serializeBalloon(bB) : "", oStr = oB ? serializeBalloon(oB) : "", tStr = tB ? serializeBalloon(tB) : "";
      if (oStr === tStr) { if (oB) mergedBalloons.push(oB); }
      else if (oStr === bStr) { if (tB) mergedBalloons.push(tB); autoMergedFromTheirs += 1; }
      else if (tStr === bStr) { if (oB) mergedBalloons.push(oB); autoMergedFromOurs += 1; }
      else {
        if (oB) mergedBalloons.push(oB); else if (tB) mergedBalloons.push(tB);
        conflicts.push({ conflictId: createConflictId("balloon", cutId, balloonId), entityKind: "balloon", cutId, entityId: balloonId, path: `${cutId}/balloon/${balloonId}`, label: `${(oB ?? tB ?? bB)?.speaker ?? "화자"} 말풍선`, reason: !oB || !tB ? "modify-delete" : "concurrent-edit", conflictedFields: oB && tB ? diffBalloonFields(oB, tB).map((f) => f.field) : ["balloon"], baseSummary: summarizeBalloon(bB), oursSummary: summarizeBalloon(oB), theirsSummary: summarizeBalloon(tB), baseBalloon: bB, oursBalloon: oB, theirsBalloon: tB });
      }
    }

    mergedCuts.push({ id: cutId, order: chosenMetaCut.order, title: chosenMetaCut.title, cameraShot: chosenMetaCut.cameraShot, heightPx: chosenMetaCut.heightPx, layers: mergedLayers, balloons: mergedBalloons });
  }

  mergedCuts.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return {
    sourceBranch, targetBranch, baseCommitId, oursCommitId: oursCommit.id, theirsCommitId: theirsCommit.id,
    canAutoMerge: conflicts.length === 0, autoMergedFromOurs, autoMergedFromTheirs,
    mergedSnapshot: { episodeId: oursCommit.snapshot.episodeId, episodeNumber: oursCommit.snapshot.episodeNumber, title: oursCommit.snapshot.title, cuts: mergedCuts },
    conflicts,
  };
}

/** 충돌 해결안(ours / theirs / manual)을 적용하여 2-부모 병합 커밋을 생성한다. */
export function resolveMergeConflictsAndCommit(
  repo: SemanticVcsRepository,
  plan: ThreeWayMergePlan,
  resolutions: readonly ConflictResolutionInput[] = [],
  options?: { readonly author?: string; readonly message?: string; readonly timestampIso?: string },
): { readonly repo: SemanticVcsRepository; readonly commit: SemanticCommit } {
  // 계획 이후 어느 한쪽 HEAD라도 바뀌면 최신 원고를 덮지 않고 재계산을 요구한다.
  if (repo.branches[plan.targetBranch]?.headCommitId !== plan.oursCommitId ||
      repo.branches[plan.sourceBranch]?.headCommitId !== plan.theirsCommitId) {
    throw new Error("병합 계획 이후 브랜치가 변경되었습니다. 병합 계획을 다시 계산하세요.");
  }
  const resMap = new Map(resolutions.map((r) => [r.conflictId, r]));
  for (const conflict of plan.conflicts) {
    const res = resMap.get(conflict.conflictId);
    if (!res) throw new Error(`해결되지 않은 충돌이 있습니다: ${conflict.conflictId}`);
    if (res.choice === "manual" && conflict.entityKind === "balloon" && !res.manualText?.trim()) {
      throw new Error(`수동 병합 대사 텍스트가 비어 있습니다: ${conflict.conflictId}`);
    }
  }

  let cuts: ComicCutNode[] = plan.mergedSnapshot.cuts.map((c) => ({ ...c, layers: [...c.layers], balloons: [...c.balloons] }));
  for (const conflict of plan.conflicts) {
    const res = resMap.get(conflict.conflictId);
    if (!res) continue;
    if (conflict.entityKind === "balloon") {
      cuts = cuts.map((cut) => {
        if (cut.id !== conflict.cutId) return cut;
        const rest = cut.balloons.filter((b) => b.id !== conflict.entityId);
        const template = conflict.oursBalloon ?? conflict.theirsBalloon ?? conflict.baseBalloon;
        const chosen =
          res.choice === "ours" ? conflict.oursBalloon
            : res.choice === "theirs" ? conflict.theirsBalloon
              : template ? { ...template, speaker: res.manualSpeaker ?? template.speaker, text: res.manualText ?? template.text, style: res.manualStyle ?? template.style } : undefined;
        return { ...cut, balloons: chosen ? [...rest, chosen] : rest };
      });
    } else if (conflict.entityKind === "layer") {
      cuts = cuts.map((cut) => {
        if (cut.id !== conflict.cutId) return cut;
        const rest = cut.layers.filter((l) => l.id !== conflict.entityId);
        const template = conflict.oursLayer ?? conflict.theirsLayer ?? conflict.baseLayer;
        const chosen =
          res.choice === "ours" ? conflict.oursLayer
            : res.choice === "theirs" ? conflict.theirsLayer
              : template ? { ...template, opacity: res.manualOpacity !== undefined ? Math.max(0, Math.min(1, res.manualOpacity)) : template.opacity } : undefined;
        return { ...cut, layers: chosen ? [...rest, chosen] : rest };
      });
    } else if (conflict.entityKind === "cut") {
      if ((res.choice === "ours" && !conflict.oursCut) || (res.choice === "theirs" && !conflict.theirsCut)) {
        cuts = cuts.filter((c) => c.id !== conflict.cutId);
      } else {
        const chosen = res.choice === "ours" ? conflict.oursCut : res.choice === "theirs" ? conflict.theirsCut
          : conflict.oursCut ? { ...conflict.oursCut, title: res.manualTitle ?? conflict.oursCut.title } : conflict.theirsCut;
        if (chosen) {
          cuts = cuts.map((c) => (c.id !== conflict.cutId ? c : conflict.conflictedFields.includes("cut")
            ? { ...chosen, layers: [...chosen.layers], balloons: [...chosen.balloons] }
            : { ...c, title: chosen.title, cameraShot: chosen.cameraShot, order: chosen.order, heightPx: chosen.heightPx }));
        }
      }
    }
  }

  return commitSemanticSnapshot(repo, { ...plan.mergedSnapshot, cuts }, {
    branchName: plan.targetBranch,
    author: options?.author ?? "작가 한서윤",
    message: options?.message ?? (plan.conflicts.length === 0 ? `${plan.sourceBranch} → ${plan.targetBranch} 무충돌 3-Way 시맨틱 자동 병합` : `${plan.sourceBranch} → ${plan.targetBranch} 충돌 ${plan.conflicts.length}건 해결 후 병합`),
    timestampIso: options?.timestampIso,
    extraParentIds: [plan.theirsCommitId],
  });
}

/** 지정된 커밋 스냅샷으로 결정론적 롤백을 수행한다(revert-commit 또는 reset-head). */
export function rollbackBranchToCommit(
  repo: SemanticVcsRepository,
  branchName: string,
  targetCommitId: string,
  options?: { readonly mode?: RollbackMode; readonly reason?: string; readonly timestampIso?: string },
): { readonly repo: SemanticVcsRepository; readonly record: RollbackRecord } {
  const branchRef = repo.branches[branchName];
  const targetCommit = repo.commits[targetCommitId];
  if (!branchRef || !targetCommit) throw new Error(`롤백 대상 브랜치 또는 커밋을 찾을 수 없습니다: ${branchName}@${targetCommitId}`);
  const mode = options?.mode ?? "revert-commit";
  const reason = options?.reason ?? `커밋 ${targetCommitId} 스냅샷으로 결정론적 롤백`;
  const timestampIso = options?.timestampIso ?? `2026-11-24T10:${String(Math.min(59, (repo.rollbackHistory.length + 1) * 5)).padStart(2, "0")}:00.000Z`;

  let nextRepo: SemanticVcsRepository;
  let resultCommitId = targetCommitId;
  if (mode === "revert-commit") {
    const committed = commitSemanticSnapshot(repo, targetCommit.snapshot, {
      branchName, author: "시맨틱 VCS 롤백 엔진", message: `롤백(${targetCommitId}): ${reason}`, timestampIso,
    });
    nextRepo = committed.repo;
    resultCommitId = committed.commit.id;
  } else {
    nextRepo = { ...repo, branches: { ...repo.branches, [branchName]: { ...branchRef, headCommitId: targetCommitId } } };
  }

  const record: RollbackRecord = {
    rollbackId: `rb-${String(repo.rollbackHistory.length + 1).padStart(2, "0")}-${targetCommitId.slice(-4)}`,
    branchName, fromCommitId: branchRef.headCommitId, toCommitId: targetCommitId, resultCommitId, mode, reason, timestampIso,
  };
  return { record, repo: { ...nextRepo, rollbackHistory: [...nextRepo.rollbackHistory, record] } };
}

/** 기본 웹툰 시맨틱 VCS 프리셋(main / alt-ending / editor-revision)을 생성한다. */
export function createDefaultComicVcsRepository(): SemanticVcsRepository {
  const baseSnapshot: ComicEpisodeSnapshot = {
    episodeId: "ep-14", episodeNumber: 14, title: "14화 · 빗속의 옥상 대치",
    cuts: [
      {
        id: "cut-01", order: 1, title: "컷 1 · 옥상 철문 개방", cameraShot: "establishing", heightPx: 1280,
        layers: [
          { id: "l-01-line", name: "선화-주인공", role: "lineart", visible: true, opacity: 1, blendMode: "normal", strokeDigest: "st-101a" },
          { id: "l-01-shadow", name: "빗물-그림자", role: "shadow", visible: true, opacity: 0.72, blendMode: "multiply", strokeDigest: "st-102b" },
        ],
        balloons: [{ id: "bal-01-a", speaker: "서진", text: "비 그치기 전에 끝내자.", style: "normal", x: 76, y: 140, width: 320, height: 112, fontSizePx: 22 }],
      },
      {
        id: "cut-02", order: 2, title: "컷 2 · 빗속 시선 교차", cameraShot: "closeup", heightPx: 1120,
        layers: [
          { id: "l-02-line", name: "선화-대치", role: "lineart", visible: true, opacity: 1, blendMode: "normal", strokeDigest: "st-201c" },
          { id: "l-02-light", name: "네온-림라이트", role: "lighting", visible: true, opacity: 0.65, blendMode: "screen", strokeDigest: "st-202d" },
        ],
        balloons: [
          { id: "bal-02-a", speaker: "하린", text: "열쇠를 넘기면 여기서 멈출게.", style: "normal", x: 110, y: 180, width: 360, height: 120, fontSizePx: 23 },
          { id: "bal-02-b", speaker: "서진", text: "그 약속, 한 번도 지킨 적 없잖아.", style: "whisper", x: 340, y: 690, width: 350, height: 116, fontSizePx: 21 },
        ],
      },
      {
        id: "cut-03", order: 3, title: "컷 3 · 옥상 난간 결말", cameraShot: "wide", heightPx: 1440,
        layers: [{ id: "l-03-line", name: "선화-난간", role: "lineart", visible: true, opacity: 1, blendMode: "normal", strokeDigest: "st-301e" }],
        balloons: [{ id: "bal-03-a", speaker: "내레이션", text: "그 밤의 선택은 두 사람의 시간을 갈라놓았다.", style: "narration", x: 88, y: 980, width: 480, height: 130, fontSizePx: 20 }],
      },
    ],
  };

  let repo = createSemanticVcsRepository({ repoId: "repo-ep14-rooftop", initialSnapshot: baseSnapshot, author: "작가 한서윤", initialMessage: "14화 콘티·선화·초고 대사 기준 스냅샷" });
  const rootCommitId = repo.commitOrder[0] ?? "";

  const mainRevised: ComicEpisodeSnapshot = {
    ...baseSnapshot,
    cuts: baseSnapshot.cuts.map((cut) => {
      if (cut.id === "cut-01") return { ...cut, layers: cut.layers.map((l) => (l.id === "l-01-shadow" ? { ...l, opacity: 0.86, strokeDigest: "st-102b-v2" } : l)) };
      if (cut.id === "cut-02") return { ...cut, balloons: cut.balloons.map((b) => (b.id === "bal-02-a" ? { ...b, text: "지금 열쇠를 내놓지 않으면 옥상 문을 잠글 거야!", style: "shout" } : b)) };
      return cut;
    }),
  };
  repo = commitSemanticSnapshot(repo, mainRevised, { branchName: "main", author: "작가 한서윤", message: "컷 1 그림자 보강 및 컷 2 하린 대사 긴장감 상향" }).repo;

  repo = createSemanticBranch(repo, "alt-ending", { fromCommitId: rootCommitId, description: "화해·협력 루트 대체 엔딩 분기" });
  const altEndingSnapshot: ComicEpisodeSnapshot = {
    ...baseSnapshot,
    cuts: [
      ...baseSnapshot.cuts.map((cut) => cut.id === "cut-03" ? { ...cut, balloons: cut.balloons.map((b) => (b.id === "bal-03-a" ? { ...b, text: "빗속에서 두 사람은 처음으로 같은 방향을 바라보았다." } : b)) } : cut),
      {
        id: "cut-04", order: 4, title: "컷 4 · 대체 엔딩 에필로그", cameraShot: "medium", heightPx: 1180,
        layers: [
          { id: "l-04-line", name: "선화-에필로그", role: "lineart", visible: true, opacity: 1, blendMode: "normal", strokeDigest: "st-401f" },
          { id: "l-04-fx", name: "여명-빛번짐", role: "fx", visible: true, opacity: 0.8, blendMode: "screen", strokeDigest: "st-402g" },
        ],
        balloons: [{ id: "bal-04-a", speaker: "하린", text: "내일 새벽, 함께 금고를 열자.", style: "normal", x: 120, y: 240, width: 340, height: 114, fontSizePx: 22 }],
      },
    ],
  };
  repo = commitSemanticSnapshot(repo, altEndingSnapshot, { branchName: "alt-ending", author: "스토리 작가 민지", message: "컷 3 화해 내레이션 변경 및 컷 4 에필로그 추가" }).repo;

  repo = createSemanticBranch(repo, "editor-revision", { fromCommitId: rootCommitId, description: "담당 PD 대사 교정 및 빗줄기 FX 보강 브랜치" });
  const editorSnapshot: ComicEpisodeSnapshot = {
    ...baseSnapshot,
    cuts: baseSnapshot.cuts.map((cut) => {
      if (cut.id === "cut-02") return { ...cut, balloons: cut.balloons.map((b) => (b.id === "bal-02-a" ? { ...b, text: "열쇠만 돌려줘. 이번엔 정말 끝낼 테니까.", style: "whisper" } : b)) };
      if (cut.id === "cut-03") return { ...cut, layers: [...cut.layers, { id: "l-03-fx-rain", name: "폭우-파티클FX", role: "fx", visible: true, opacity: 0.88, blendMode: "add", strokeDigest: "st-309r" }] };
      return cut;
    }),
  };
  repo = commitSemanticSnapshot(repo, editorSnapshot, { branchName: "editor-revision", author: "담당 PD 정우", message: "컷 2 하린 대사 절제 톤 교정 및 컷 3 폭우 FX 레이어 추가" }).repo;

  return repo;
}
