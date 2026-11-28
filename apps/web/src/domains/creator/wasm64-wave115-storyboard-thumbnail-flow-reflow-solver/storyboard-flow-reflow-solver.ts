/**
 * Wave 115 — 웹툰 스토리보드 5종 원자 드래그·재편집 리플로우 솔버 및 가역 명령 세션.
 *
 * - `applyStoryboardReflowOperation`: `reorder-cut`, `move-scene-group`, `split-cut`,
 *   `merge-adjacent-cuts`, `insert-breathing-gutter` 5종 원자 연산 + 잠금 앵커 보호
 * - `createStoryboardReflowSession`: 불변 스냅샷 기반 가역 Undo/Redo 및 FIPS 180-4 SHA-256 비트 동일성 검증
 */

import {
  STORYBOARD_ACT_ORDER,
  type NormalizedStoryboardCut,
  type StoryboardAct,
  type StoryboardCutInput,
  type StoryboardFlowProjection,
  type StoryboardHistoryStepResult,
  type StoryboardProjectionOptions,
  type StoryboardReflowOperation,
  type StoryboardReflowResult,
  type StoryboardReflowSession,
  type StoryboardRejectionCode,
} from "./storyboard-board-types";
import {
  buildStoryboardFlowProjection,
  clampInt,
  clampNumber,
  cloneNormalizedCut,
  dedupeStringIds,
  normalizeStoryboardCuts,
  round3,
} from "./storyboard-dual-projection";
import { computeStoryboardStateSha256Hex } from "./storyboard-sha256-and-canonical";

export const DEFAULT_MAX_BREATHING_GUTTER_PX = 640;

function makeUniqueCutId(preferred: string, existingIds: ReadonlySet<string>): string {
  const base = preferred.trim() || "cut";
  if (!existingIds.has(base)) return base;
  let suffix = 2;
  while (existingIds.has(`${base}_${suffix}`)) {
    suffix += 1;
  }
  return `${base}_${suffix}`;
}

function remapContinuityTargets(
  cuts: readonly NormalizedStoryboardCut[],
  replacements: ReadonlyMap<string, string>,
): NormalizedStoryboardCut[] {
  return cuts.map((cut) => {
    if (cut.continuityTargetCutIds.length === 0) return cut;
    const remapped: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < cut.continuityTargetCutIds.length; i += 1) {
      const original = cut.continuityTargetCutIds[i];
      if (!original) continue;
      const nextId = replacements.get(original) ?? original;
      if (nextId !== cut.cutId && !seen.has(nextId)) {
        seen.add(nextId);
        remapped.push(nextId);
      }
    }
    return { ...cut, continuityTargetCutIds: remapped };
  });
}

function buildRejectionResult(
  normalized: readonly NormalizedStoryboardCut[],
  operation: StoryboardReflowOperation,
  rejectionCode: StoryboardRejectionCode,
  rejectionReasonKo: string,
  affectedCutIds: readonly string[],
  options?: StoryboardProjectionOptions,
): StoryboardReflowResult {
  const projection = buildStoryboardFlowProjection(normalized, options);
  return {
    applied: false,
    rejected: true,
    rejectionCode,
    rejectionReasonKo,
    operationKind: operation.kind,
    affectedCutIds,
    previousSha256Hex: projection.stateSha256Hex,
    nextSha256Hex: projection.stateSha256Hex,
    cuts: normalized.map(cloneNormalizedCut),
    projection,
    continuityViolations: projection.continuityViolations,
    summaryKo: rejectionReasonKo,
  };
}

function buildAppliedResult(
  previousSha256Hex: string,
  nextCuts: readonly NormalizedStoryboardCut[],
  operation: StoryboardReflowOperation,
  affectedCutIds: readonly string[],
  summaryKo: string,
  options?: StoryboardProjectionOptions,
): StoryboardReflowResult {
  const projection = buildStoryboardFlowProjection(nextCuts, options);
  return {
    applied: true,
    rejected: false,
    operationKind: operation.kind,
    affectedCutIds,
    previousSha256Hex,
    nextSha256Hex: projection.stateSha256Hex,
    cuts: nextCuts.map(cloneNormalizedCut),
    projection,
    continuityViolations: projection.continuityViolations,
    summaryKo,
  };
}

/**
 * 5종 원자 스토리보드 리플로우 연산을 불변 실행하고 잠금 보호 및 연속성 감사를 즉시 수행한다.
 */
export function applyStoryboardReflowOperation(
  cutsInput: readonly StoryboardCutInput[],
  operation: StoryboardReflowOperation,
  projectionOptions?: StoryboardProjectionOptions,
): StoryboardReflowResult {
  const normalized = normalizeStoryboardCuts(cutsInput);
  const previousSha256Hex = computeStoryboardStateSha256Hex(normalized);
  const reject = (
    code: StoryboardRejectionCode,
    reasonKo: string,
    affected: readonly string[],
  ): StoryboardReflowResult =>
    buildRejectionResult(normalized, operation, code, reasonKo, affected, projectionOptions);

  if (operation.kind === "reorder-cut") {
    const sourceIndex = normalized.findIndex((cut) => cut.cutId === operation.cutId);
    const targetCut = sourceIndex >= 0 ? normalized[sourceIndex] : undefined;
    if (!targetCut) {
      return reject("CUT_NOT_FOUND", `컷(${operation.cutId})을 보드에서 찾을 수 없습니다.`, [operation.cutId]);
    }
    if (!Number.isFinite(operation.targetIndex)) {
      return reject("INVALID_OPERATION", "이동 대상 위치(targetIndex)는 유한한 정수여야 합니다.", [targetCut.cutId]);
    }
    if (targetCut.lockedAnchor && operation.forceOverrideLock !== true) {
      return reject(
        "LOCKED_ANCHOR",
        `고정 앵커 컷(${targetCut.cutId}: ${targetCut.titleKo})은 잠금 해제(forceOverrideLock) 없이 이동할 수 없습니다.`,
        [targetCut.cutId],
      );
    }
    const clampedTarget = clampInt(
      operation.targetIndex,
      0,
      Math.max(0, normalized.length - 1),
      sourceIndex,
    );
    if (clampedTarget === sourceIndex) {
      return reject("NO_OP", `컷(${targetCut.cutId})이 이미 #${sourceIndex + 1} 위치에 있습니다.`, [targetCut.cutId]);
    }
    const next = normalized.map(cloneNormalizedCut);
    const moved = next.splice(sourceIndex, 1)[0];
    if (moved) next.splice(clampedTarget, 0, moved);
    return buildAppliedResult(
      previousSha256Hex,
      next,
      operation,
      [targetCut.cutId],
      `컷 ${targetCut.cutId}를 #${sourceIndex + 1}에서 #${clampedTarget + 1}로 이동했습니다.`,
      projectionOptions,
    );
  }

  if (operation.kind === "move-scene-group") {
    const movedCuts = normalized.filter((cut) => cut.sceneId === operation.sceneId);
    if (movedCuts.length === 0) {
      return reject("SCENE_NOT_FOUND", `씬(${operation.sceneId})에 속한 컷을 찾을 수 없습니다.`, []);
    }
    const movedIds = movedCuts.map((cut) => cut.cutId);
    const lockedInScene = movedCuts.find((cut) => cut.lockedAnchor);
    if (lockedInScene && operation.forceOverrideLock !== true) {
      return reject(
        "LOCKED_ANCHOR",
        `씬(${operation.sceneId})에 고정 앵커 컷(${lockedInScene.cutId})이 포함되어 있어 잠금 해제 없이 일괄 이동할 수 없습니다.`,
        movedIds,
      );
    }
    if (operation.targetBeforeSceneId === operation.sceneId) {
      return reject("NO_OP", `씬(${operation.sceneId})을 자기 자신 앞으로 이동할 수 없습니다.`, movedIds);
    }
    const remaining = normalized
      .filter((cut) => cut.sceneId !== operation.sceneId)
      .map(cloneNormalizedCut);

    let insertIndex = remaining.length;
    if (operation.targetBeforeSceneId !== null && operation.targetBeforeSceneId.trim().length > 0) {
      const targetId = operation.targetBeforeSceneId.trim();
      const targetIdx = remaining.findIndex((cut) => cut.sceneId === targetId);
      if (targetIdx < 0) {
        return reject("SCENE_NOT_FOUND", `기준 씬(${targetId})을 보드에서 찾을 수 없습니다.`, movedIds);
      }
      insertIndex = targetIdx;
    }

    const next = [
      ...remaining.slice(0, insertIndex),
      ...movedCuts.map(cloneNormalizedCut),
      ...remaining.slice(insertIndex),
    ];
    const targetLabel =
      operation.targetBeforeSceneId === null ? "에피소드 끝" : `${operation.targetBeforeSceneId} 앞`;
    return buildAppliedResult(
      previousSha256Hex,
      next,
      operation,
      movedIds,
      `씬 ${operation.sceneId}(${movedCuts.length}컷)을 ${targetLabel}으로 일괄 이동했습니다.`,
      projectionOptions,
    );
  }

  if (operation.kind === "split-cut") {
    const index = normalized.findIndex((cut) => cut.cutId === operation.cutId);
    const target = index >= 0 ? normalized[index] : undefined;
    if (!target) {
      return reject("CUT_NOT_FOUND", `분할 대상 컷(${operation.cutId})을 찾을 수 없습니다.`, [operation.cutId]);
    }
    if (target.lockedAnchor && operation.forceOverrideLock !== true) {
      return reject("LOCKED_ANCHOR", `고정 앵커 컷(${target.cutId})은 잠금 해제 없이 분할할 수 없습니다.`, [target.cutId]);
    }
    if (operation.splitRatio !== undefined && !Number.isFinite(operation.splitRatio)) {
      return reject("INVALID_OPERATION", "분할 비율(splitRatio)은 유한한 숫자여야 합니다.", [target.cutId]);
    }

    const ratio = clampNumber(operation.splitRatio ?? 0.5, 0.25, 0.75);
    const existingIds = new Set(normalized.map((cut) => cut.cutId));
    existingIds.delete(target.cutId);
    const firstId = makeUniqueCutId(operation.firstCutId ?? `${target.cutId}__a`, existingIds);
    existingIds.add(firstId);
    const secondId = makeUniqueCutId(operation.secondCutId ?? `${target.cutId}__b`, existingIds);

    const minHalfHeight = target.heightPx >= 240 ? 120 : 80;
    const firstHeight =
      target.heightPx >= minHalfHeight * 2
        ? clampInt(target.heightPx * ratio, minHalfHeight, target.heightPx - minHalfHeight, minHalfHeight)
        : minHalfHeight;
    const secondHeight = Math.max(minHalfHeight, target.heightPx - firstHeight);
    const firstDialogue = Math.round(target.dialogueCharCount * ratio);
    const secondDialogue = Math.max(0, target.dialogueCharCount - firstDialogue);

    const firstHalf: NormalizedStoryboardCut = {
      ...cloneNormalizedCut(target),
      cutId: firstId,
      titleKo: `${target.titleKo} (전반)`,
      tension: round3(clampNumber(target.tension * 0.96, 0, 1)),
      dialogueCharCount: firstDialogue,
      visualComplexity: round3(clampNumber(target.visualComplexity * (0.72 + 0.28 * ratio), 0.1, 1)),
      heightPx: firstHeight,
      gutterBeforePx: target.gutterBeforePx,
      lockedAnchor: false,
      continuityTargetCutIds: [...target.continuityTargetCutIds],
    };
    const secondHalf: NormalizedStoryboardCut = {
      ...cloneNormalizedCut(target),
      cutId: secondId,
      titleKo: `${target.titleKo} (후반)`,
      tension: target.tension,
      dialogueCharCount: secondDialogue,
      visualComplexity: round3(
        clampNumber(target.visualComplexity * (0.72 + 0.28 * (1 - ratio)), 0.1, 1),
      ),
      heightPx: secondHeight,
      gutterBeforePx: clampInt(target.gutterBeforePx * 0.55 + 56, 48, 160, 72),
      lockedAnchor: false,
      continuityTargetCutIds: [],
    };

    const spliced = normalized.map(cloneNormalizedCut);
    spliced.splice(index, 1, firstHalf, secondHalf);
    const remapped = remapContinuityTargets(spliced, new Map([[target.cutId, firstId]]));
    return buildAppliedResult(
      previousSha256Hex,
      remapped,
      operation,
      [firstId, secondId],
      `컷 ${target.cutId}를 ${firstId}(${firstDialogue}자)와 ${secondId}(${secondDialogue}자)로 2분할했습니다.`,
      projectionOptions,
    );
  }

  if (operation.kind === "merge-adjacent-cuts") {
    const firstIndex = normalized.findIndex((cut) => cut.cutId === operation.firstCutId);
    const secondIndex = normalized.findIndex((cut) => cut.cutId === operation.secondCutId);
    const first = firstIndex >= 0 ? normalized[firstIndex] : undefined;
    const second = secondIndex >= 0 ? normalized[secondIndex] : undefined;
    if (!first || !second) {
      return reject(
        "CUT_NOT_FOUND",
        `병합 대상 컷(${operation.firstCutId}, ${operation.secondCutId}) 중 보드에 없는 컷이 있습니다.`,
        [operation.firstCutId, operation.secondCutId],
      );
    }
    if (secondIndex !== firstIndex + 1) {
      return reject(
        "NOT_ADJACENT",
        `인접한 컷만 병합할 수 있습니다(${first.cutId}: #${firstIndex + 1}, ${second.cutId}: #${secondIndex + 1}).`,
        [first.cutId, second.cutId],
      );
    }
    if ((first.lockedAnchor || second.lockedAnchor) && operation.forceOverrideLock !== true) {
      return reject(
        "LOCKED_ANCHOR",
        `고정 앵커 컷이 포함된 쌍(${first.cutId}, ${second.cutId})은 잠금 해제 없이 병합할 수 없습니다.`,
        [first.cutId, second.cutId],
      );
    }

    const existingIds = new Set(normalized.map((cut) => cut.cutId));
    existingIds.delete(first.cutId);
    existingIds.delete(second.cutId);
    const mergedId = makeUniqueCutId(
      operation.mergedCutId ?? `${first.cutId}__merged`,
      existingIds,
    );
    const combinedOutgoing = dedupeStringIds([
      ...first.continuityTargetCutIds,
      ...second.continuityTargetCutIds,
    ]).filter((id) => id !== first.cutId && id !== second.cutId && id !== mergedId);
    const mergedAct: StoryboardAct =
      STORYBOARD_ACT_ORDER[second.act] >= STORYBOARD_ACT_ORDER[first.act]
        ? second.act
        : first.act;

    const mergedCut: NormalizedStoryboardCut = {
      cutId: mergedId,
      sceneId: first.sceneId,
      sceneTitleKo: first.sceneTitleKo,
      titleKo: `${first.titleKo} + ${second.titleKo}`,
      act: mergedAct,
      tension: round3(Math.max(first.tension, second.tension)),
      dialogueCharCount: first.dialogueCharCount + second.dialogueCharCount,
      visualComplexity: round3(
        clampNumber(
          Math.max(first.visualComplexity, second.visualComplexity) * 0.65 +
            ((first.visualComplexity + second.visualComplexity) / 2) * 0.35,
          0,
          1,
        ),
      ),
      heightPx: first.heightPx + second.heightPx,
      gutterBeforePx: first.gutterBeforePx,
      lockedAnchor: first.lockedAnchor || second.lockedAnchor,
      continuityTargetCutIds: combinedOutgoing,
    };

    const spliced = normalized.map(cloneNormalizedCut);
    spliced.splice(firstIndex, 2, mergedCut);
    const remapped = remapContinuityTargets(
      spliced,
      new Map([
        [first.cutId, mergedId],
        [second.cutId, mergedId],
      ]),
    );
    return buildAppliedResult(
      previousSha256Hex,
      remapped,
      operation,
      [mergedId],
      `인접 컷 ${first.cutId}와 ${second.cutId}를 ${mergedId}(총 ${mergedCut.heightPx}px, 대사 ${mergedCut.dialogueCharCount}자)로 병합했습니다.`,
      projectionOptions,
    );
  }

  // insert-breathing-gutter
  const targetIndex = normalized.findIndex((cut) => cut.cutId === operation.cutId);
  const current = targetIndex >= 0 ? normalized[targetIndex] : undefined;
  if (!current) {
    return reject("CUT_NOT_FOUND", `여백 보강 대상 컷(${operation.cutId})을 찾을 수 없습니다.`, [operation.cutId]);
  }
  if (!Number.isFinite(operation.extraGutterPx) || operation.extraGutterPx <= 0) {
    return reject(
      "INVALID_OPERATION",
      "추가 여백(extraGutterPx)은 0보다 큰 유한한 픽셀 값이어야 합니다.",
      [current.cutId],
    );
  }
  const maxGutterPx = clampInt(
    operation.maxGutterPx ?? DEFAULT_MAX_BREATHING_GUTTER_PX,
    80,
    2400,
    DEFAULT_MAX_BREATHING_GUTTER_PX,
  );
  const nextGutterPx = Math.min(maxGutterPx, current.gutterBeforePx + Math.round(operation.extraGutterPx));
  if (nextGutterPx === current.gutterBeforePx) {
    return reject("NO_OP", `컷(${current.cutId}) 앞 여백이 이미 상한(${maxGutterPx}px)에 도달했습니다.`, [current.cutId]);
  }
  const next = normalized.map(cloneNormalizedCut);
  next[targetIndex] = { ...current, gutterBeforePx: nextGutterPx };
  return buildAppliedResult(
    previousSha256Hex,
    next,
    operation,
    [current.cutId],
    `컷 ${current.cutId} 앞 호흡 여백을 ${current.gutterBeforePx}px에서 ${nextGutterPx}px로 확장했습니다.`,
    projectionOptions,
  );
}

interface SessionSnapshot {
  readonly cuts: readonly NormalizedStoryboardCut[];
  readonly projection: StoryboardFlowProjection;
  readonly stateSha256Hex: string;
  readonly labelKo: string;
}

/**
 * 가역 명령 스택(Undo/Redo)과 FIPS 180-4 SHA-256 상태 지문 검증을 갖춘 리플로우 세션을 생성한다.
 */
export function createStoryboardReflowSession(
  initialCuts: readonly StoryboardCutInput[],
  projectionOptions?: StoryboardProjectionOptions,
): StoryboardReflowSession {
  const initialNormalized = normalizeStoryboardCuts(initialCuts);
  const initialProjection = buildStoryboardFlowProjection(initialNormalized, projectionOptions);

  const past: SessionSnapshot[] = [];
  const future: SessionSnapshot[] = [];
  let present: SessionSnapshot = {
    cuts: initialNormalized.map(cloneNormalizedCut),
    projection: initialProjection,
    stateSha256Hex: initialProjection.stateSha256Hex,
    labelKo: "초기 스토리보드",
  };

  const makeEmptyStep = (labelKo: string): StoryboardHistoryStepResult => ({
    ok: false,
    exactRoundTrip: false,
    expectedSha256Hex: present.stateSha256Hex,
    stateSha256Hex: present.stateSha256Hex,
    cuts: present.cuts.map(cloneNormalizedCut),
    projection: present.projection,
    labelKo,
  });

  return {
    getState: () => present.cuts.map(cloneNormalizedCut),
    getProjection: () => present.projection,
    getStateSha256Hex: () => present.stateSha256Hex,
    apply(operation: StoryboardReflowOperation): StoryboardReflowResult {
      const result = applyStoryboardReflowOperation(present.cuts, operation, projectionOptions);
      if (result.applied) {
        past.push(present);
        future.length = 0;
        present = {
          cuts: result.cuts.map(cloneNormalizedCut),
          projection: result.projection,
          stateSha256Hex: result.nextSha256Hex,
          labelKo: result.summaryKo,
        };
      }
      return result;
    },
    undo(): StoryboardHistoryStepResult {
      const previous = past.pop();
      if (!previous) return makeEmptyStep("되돌릴 이력이 없습니다.");
      future.push(present);
      present = previous;
      const recomputedSha = computeStoryboardStateSha256Hex(present.cuts);
      return {
        ok: true,
        exactRoundTrip: recomputedSha === previous.stateSha256Hex,
        expectedSha256Hex: previous.stateSha256Hex,
        stateSha256Hex: recomputedSha,
        cuts: present.cuts.map(cloneNormalizedCut),
        projection: present.projection,
        labelKo: `되돌리기 완료: ${present.labelKo}`,
      };
    },
    redo(): StoryboardHistoryStepResult {
      const nextSnapshot = future.pop();
      if (!nextSnapshot) return makeEmptyStep("다시 실행할 이력이 없습니다.");
      past.push(present);
      present = nextSnapshot;
      const recomputedSha = computeStoryboardStateSha256Hex(present.cuts);
      return {
        ok: true,
        exactRoundTrip: recomputedSha === nextSnapshot.stateSha256Hex,
        expectedSha256Hex: nextSnapshot.stateSha256Hex,
        stateSha256Hex: recomputedSha,
        cuts: present.cuts.map(cloneNormalizedCut),
        projection: present.projection,
        labelKo: `다시 실행 완료: ${present.labelKo}`,
      };
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    getUndoDepth: () => past.length,
    getRedoDepth: () => future.length,
  };
}

export {
  DEFAULT_BASE_VISUAL_READ_SEC,
  DEFAULT_BOARD_COLUMNS,
  DEFAULT_BOARD_PADDING_PX,
  DEFAULT_CANVAS_WIDTH_PX,
  DEFAULT_CARD_GAP_X_PX,
  DEFAULT_CARD_GAP_Y_PX,
  DEFAULT_CARD_HEIGHT_PX,
  DEFAULT_CARD_WIDTH_PX,
  DEFAULT_READING_CHARS_PER_SEC,
  DEFAULT_SCENE_GAP_Y_PX,
  DEFAULT_SCENE_HEADER_HEIGHT_PX,
  DEFAULT_SCROLL_SPEED_PX_PER_SEC,
  auditContinuityLinks,
  buildStoryboardFlowProjection,
  estimateCutReadingSec,
  normalizeStoryboardCut,
  normalizeStoryboardCuts,
  resolveStoryboardProjectionOptions,
} from "./storyboard-dual-projection";

export { computeStoryboardStateSha256Hex } from "./storyboard-sha256-and-canonical";
