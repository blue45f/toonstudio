/**
 * 피츠의 법칙(`ID = log2(1 + D / W)`) 기반 8분할 방사형 파이 메뉴 및 한 손 코드 단축키 최적화기.
 *
 * - 명령별 호출 빈도, 명령 쌍 전이 횟수, 기존 화면 목표 좌표를 입력받아 분기 한정(`Branch-and-Bound`) 전역 탐색으로
 *   8방향 파이 슬롯(`N, NE, E, SE, S, SW, W, NW`)의 최적 배치를 푼다.
 * - 왕복 빈도가 높은 핵심 명령 쌍을 주축(`N/E/S/W`) 직선 플릭 축에 우선 배치해 각도 오차와 이동 거리를 최소화한다.
 * - 모든 터치·펜 히트 영역에 최소 `44×44px` 불변 조건을 강제하고, 한 손 무충돌 코드 단축키 배정을 산출한다.
 */

import {
  resolveConflictFreeSingleHandChords,
  type ChordBindingAssignment,
  type HandErgonomicProfile,
  type ModifierTouchPadTarget,
  type ScreenTargetRect,
  type ShortcutConflictFinding,
} from "./single-hand-chord-resolver";

export {
  normalizeShortcutChord,
  resolveConflictFreeSingleHandChords,
  type ChordBindingAssignment,
  type HandErgonomicProfile,
  type ModifierTouchPadTarget,
  type ParsedChord,
  type ScreenTargetRect,
  type ShortcutConflictFinding,
  type ShortcutConflictKind,
} from "./single-hand-chord-resolver";

export const MIN_HIT_TARGET_PX = 44 as const;

export const RADIAL_SLICE_COUNT = 8 as const;

/** 인접 8방향 슬롯의 `44×44px` 히트박스가 서로 겹치지 않기 위한 최소 안전 반지름(`ceil(sqrt(2) * 44) + 6`). */
export const MIN_SAFE_RADIAL_RING_RADIUS_PX = 68 as const;

export const RADIAL_COMPASS_DIRECTIONS = Object.freeze([
  "N", "NE", "E", "SE", "S", "SW", "W", "NW",
] as const);

export type RadialCompassDirection = (typeof RADIAL_COMPASS_DIRECTIONS)[number];

export const CARDINAL_FLICK_DIRECTIONS = Object.freeze(["N", "E", "S", "W"] as const);

export type CardinalFlickDirection = (typeof CARDINAL_FLICK_DIRECTIONS)[number];

export interface StudioCommandProfile {
  readonly commandId: string;
  readonly labelKo: string;
  readonly frequency: number;
  readonly screenTarget: ScreenTargetRect;
  readonly preferredChord?: string;
  readonly isHoldModifierTool?: boolean;
}

export interface CommandTransitionCount {
  readonly fromCommandId: string;
  readonly toCommandId: string;
  readonly count: number;
}

export interface RadialDirectionDescriptor {
  readonly direction: RadialCompassDirection;
  readonly slotIndex: number;
  readonly angleDeg: number;
  readonly angleRad: number;
  readonly isCardinal: boolean;
  readonly unitX: number;
  readonly unitY: number;
  readonly labelKo: string;
}

export interface RadialSliceAssignment {
  readonly slotIndex: number;
  readonly direction: RadialCompassDirection;
  readonly labelKo: string;
  readonly isCardinal: boolean;
  readonly commandId: string | null;
  readonly commandLabelKo: string | null;
  readonly frequency: number;
  readonly centerPoint: { readonly x: number; readonly y: number };
  readonly hitBox: ScreenTargetRect;
  readonly fittsIndexOfDifficultyBits: number;
  readonly expectedFlickTimeMs: number;
}

export interface AuditedScreenTarget {
  readonly commandId: string;
  readonly originalRect: ScreenTargetRect;
  readonly enforcedRect: ScreenTargetRect;
  readonly wasExpandedToMeetMinimum: boolean;
}

export interface RadialAndChordOptimizationOptions {
  readonly commands: readonly StudioCommandProfile[];
  readonly pairwiseTransitions?: readonly CommandTransitionCount[];
  readonly menuOrigin?: { readonly x: number; readonly y: number };
  readonly requestedRingRadiusPx?: number;
  readonly diagonalFlickPenalty?: number;
  readonly spatialAffinityWeight?: number;
  readonly pairTransitionWeight?: number;
  readonly fittsInterceptMs?: number;
  readonly fittsSlopeMsPerBit?: number;
  readonly handPreference?: HandErgonomicProfile;
  readonly touchStripOrigin?: { readonly x: number; readonly y: number };
}

export interface RadialAndChordOptimizationResult {
  readonly menuOrigin: { readonly x: number; readonly y: number };
  readonly effectiveRingRadiusPx: number;
  readonly radiusClampedForHitTargetInvariant: boolean;
  readonly deadzoneRadiusPx: number;
  readonly sliceAssignments: readonly RadialSliceAssignment[];
  readonly overflowCommandIds: readonly string[];
  readonly totalObjectiveCost: number;
  readonly baselineWeightedIdBits: number;
  readonly optimizedRadialWeightedIdBits: number;
  readonly averageBitsSavedPerInvoke: number;
  readonly auditedScreenTargets: readonly AuditedScreenTarget[];
  readonly subMinimumInputTargetCount: number;
  readonly detectedChordConflicts: readonly ShortcutConflictFinding[];
  readonly chordBindings: readonly ChordBindingAssignment[];
  readonly modifierTouchPads: readonly ModifierTouchPadTarget[];
  readonly allHitTargetsMeetMinimum44Px: boolean;
  readonly serverCostKrw: 0;
}

const INV_SQRT2 = Math.SQRT1_2;

export const RADIAL_DIRECTION_SPECS: readonly RadialDirectionDescriptor[] = Object.freeze([
  Object.freeze({ direction: "N", slotIndex: 0, angleDeg: -90, angleRad: -Math.PI / 2, isCardinal: true, unitX: 0, unitY: -1, labelKo: "북(↑)" }),
  Object.freeze({ direction: "NE", slotIndex: 1, angleDeg: -45, angleRad: -Math.PI / 4, isCardinal: false, unitX: INV_SQRT2, unitY: -INV_SQRT2, labelKo: "북동(↗)" }),
  Object.freeze({ direction: "E", slotIndex: 2, angleDeg: 0, angleRad: 0, isCardinal: true, unitX: 1, unitY: 0, labelKo: "동(→)" }),
  Object.freeze({ direction: "SE", slotIndex: 3, angleDeg: 45, angleRad: Math.PI / 4, isCardinal: false, unitX: INV_SQRT2, unitY: INV_SQRT2, labelKo: "남동(↘)" }),
  Object.freeze({ direction: "S", slotIndex: 4, angleDeg: 90, angleRad: Math.PI / 2, isCardinal: true, unitX: 0, unitY: 1, labelKo: "남(↓)" }),
  Object.freeze({ direction: "SW", slotIndex: 5, angleDeg: 135, angleRad: (3 * Math.PI) / 4, isCardinal: false, unitX: -INV_SQRT2, unitY: INV_SQRT2, labelKo: "남서(↙)" }),
  Object.freeze({ direction: "W", slotIndex: 6, angleDeg: 180, angleRad: Math.PI, isCardinal: true, unitX: -1, unitY: 0, labelKo: "서(←)" }),
  Object.freeze({ direction: "NW", slotIndex: 7, angleDeg: -135, angleRad: (-3 * Math.PI) / 4, isCardinal: false, unitX: -INV_SQRT2, unitY: -INV_SQRT2, labelKo: "북서(↖)" }),
]);

/**
 * 섀넌 공식 `ID = log2(1 + D / W)`으로 목표 포착 난이도 지수(비트)를 계산한다.
 */
export function computeFittsIndexOfDifficulty(distancePx: number, targetWidthPx: number): number {
  const safeDistance = Number.isFinite(distancePx) && distancePx > 0 ? distancePx : 0;
  const safeWidth = Number.isFinite(targetWidthPx) && targetWidthPx > 1e-6 ? targetWidthPx : MIN_HIT_TARGET_PX;
  return Math.log2(1 + safeDistance / safeWidth);
}

/**
 * 피츠의 법칙 선형 시간 모델 `MT = a + b * ID`로 예상 포착 소요 시간(밀리초)을 산출한다.
 */
export function estimateFittsMovementTimeMs(
  distancePx: number,
  targetWidthPx: number,
  interceptMs: number = 50,
  slopeMsPerBit: number = 110,
): number {
  const safeIntercept = Number.isFinite(interceptMs) ? Math.max(0, interceptMs) : 50;
  const safeSlope = Number.isFinite(slopeMsPerBit) ? Math.max(1, slopeMsPerBit) : 110;
  return safeIntercept + safeSlope * computeFittsIndexOfDifficulty(distancePx, targetWidthPx);
}

/**
 * 중심 좌표를 유지하면서 최소 `44×44px` 터치·펜 히트 영역 불변 조건을 충족하도록 사각형을 보정한다.
 */
export function enforceMinimumHitTargetRect(rect: ScreenTargetRect): {
  readonly rect: ScreenTargetRect;
  readonly wasExpanded: boolean;
} {
  const rawW = Number.isFinite(rect.width) ? Math.max(0, rect.width) : 0;
  const rawH = Number.isFinite(rect.height) ? Math.max(0, rect.height) : 0;
  const targetW = Math.max(MIN_HIT_TARGET_PX, rawW);
  const targetH = Math.max(MIN_HIT_TARGET_PX, rawH);
  const centerX = rect.x + rawW * 0.5;
  const centerY = rect.y + rawH * 0.5;
  return {
    rect: Object.freeze({
      x: centerX - targetW * 0.5,
      y: centerY - targetH * 0.5,
      width: targetW,
      height: targetH,
    }),
    wasExpanded: targetW > rawW + 1e-9 || targetH > rawH + 1e-9,
  };
}

export function rectsOverlap(a: ScreenTargetRect, b: ScreenTargetRect): boolean {
  return (
    a.x < b.x + b.width - 1e-6 &&
    a.x + a.width > b.x + 1e-6 &&
    a.y < b.y + b.height - 1e-6 &&
    a.y + a.height > b.y + 1e-6
  );
}

function computeSlotPairErgonomicFactor(slotA: number, slotB: number): number {
  const specA = RADIAL_DIRECTION_SPECS[slotA];
  const specB = RADIAL_DIRECTION_SPECS[slotB];
  if (!specA || !specB || slotA === slotB) {
    return 0;
  }
  const rawSteps = Math.abs(slotA - slotB);
  const circularSteps = Math.min(rawSteps, RADIAL_SLICE_COUNT - rawSteps);

  if (specA.isCardinal && specB.isCardinal) {
    return circularSteps === 4 ? 0.52 : 0.74;
  }
  if (circularSteps === 1) {
    return 1.58;
  }
  if (specA.isCardinal || specB.isCardinal) {
    return 1.12;
  }
  return circularSteps === 4 ? 1.24 : 1.36;
}

/**
 * 명령 호출 빈도·쌍 전이 행렬·화면 좌표를 종합하여 최적 8분할 파이 메뉴 배치와 무충돌 한 손 단축키를 계산한다.
 */
export function optimizeFittsRadialMenuAndChords(
  options: RadialAndChordOptimizationOptions,
): RadialAndChordOptimizationResult {
  const menuOrigin = Object.freeze({
    x: options.menuOrigin?.x ?? 960,
    y: options.menuOrigin?.y ?? 540,
  });
  const requestedRadius = options.requestedRingRadiusPx ?? 96;
  const effectiveRingRadiusPx = Math.max(
    MIN_SAFE_RADIAL_RING_RADIUS_PX,
    Number.isFinite(requestedRadius) ? requestedRadius : 96,
  );
  const radiusClampedForHitTargetInvariant = effectiveRingRadiusPx > requestedRadius + 1e-9;

  const maxDisjointBoxSize = Math.floor(effectiveRingRadiusPx * INV_SQRT2) - 2;
  const sliceBoxSizePx = Math.max(MIN_HIT_TARGET_PX, Math.min(64, maxDisjointBoxSize));
  const deadzoneRadiusPx = Math.max(22, Math.round(effectiveRingRadiusPx * 0.28));

  const diagonalFlickPenalty = Math.max(1.02, options.diagonalFlickPenalty ?? 1.28);
  const spatialAffinityWeight = Math.max(0, options.spatialAffinityWeight ?? 0.18);
  const pairTransitionWeight = Math.max(0, options.pairTransitionWeight ?? 1.35);
  const fittsInterceptMs = options.fittsInterceptMs ?? 50;
  const fittsSlopeMsPerBit = options.fittsSlopeMsPerBit ?? 110;
  const handPreference: HandErgonomicProfile = options.handPreference ?? "left-hand";

  const auditedScreenTargets: AuditedScreenTarget[] = [];
  let subMinimumInputTargetCount = 0;
  let totalFrequency = 0;
  let weightedScreenIdSum = 0;

  for (const cmd of options.commands) {
    const { rect: enforcedRect, wasExpanded } = enforceMinimumHitTargetRect(cmd.screenTarget);
    if (wasExpanded) {
      subMinimumInputTargetCount += 1;
    }
    auditedScreenTargets.push(Object.freeze({
      commandId: cmd.commandId,
      originalRect: Object.freeze({ ...cmd.screenTarget }),
      enforcedRect,
      wasExpandedToMeetMinimum: wasExpanded,
    }));

    const freq = Math.max(0, Number.isFinite(cmd.frequency) ? cmd.frequency : 0);
    totalFrequency += freq;
    const origCx = cmd.screenTarget.x + cmd.screenTarget.width * 0.5;
    const origCy = cmd.screenTarget.y + cmd.screenTarget.height * 0.5;
    const distFromOrigin = Math.hypot(origCx - menuOrigin.x, origCy - menuOrigin.y);
    const origEffWidth = Math.max(1, Math.min(cmd.screenTarget.width, cmd.screenTarget.height));
    weightedScreenIdSum += freq * computeFittsIndexOfDifficulty(distFromOrigin, origEffWidth);
  }

  const pairSymmetricWeights = new Map<string, number>();
  const transitionDegreeByCommand = new Map<string, number>();
  const makePairKey = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

  for (const tr of options.pairwiseTransitions ?? []) {
    if (tr.fromCommandId === tr.toCommandId || !Number.isFinite(tr.count) || tr.count <= 0) {
      continue;
    }
    const key = makePairKey(tr.fromCommandId, tr.toCommandId);
    pairSymmetricWeights.set(key, (pairSymmetricWeights.get(key) ?? 0) + tr.count);
    transitionDegreeByCommand.set(tr.fromCommandId, (transitionDegreeByCommand.get(tr.fromCommandId) ?? 0) + tr.count);
    transitionDegreeByCommand.set(tr.toCommandId, (transitionDegreeByCommand.get(tr.toCommandId) ?? 0) + tr.count);
  }

  const rankedCommands = [...options.commands].sort((a, b) => {
    const scoreA = Math.max(0, a.frequency) + 0.5 * (transitionDegreeByCommand.get(a.commandId) ?? 0);
    const scoreB = Math.max(0, b.frequency) + 0.5 * (transitionDegreeByCommand.get(b.commandId) ?? 0);
    return Math.abs(scoreB - scoreA) > 1e-9 ? scoreB - scoreA : a.commandId.localeCompare(b.commandId);
  });

  const activeCommands = rankedCommands.slice(0, RADIAL_SLICE_COUNT);
  const overflowCommandIds = rankedCommands.slice(RADIAL_SLICE_COUNT).map((c) => c.commandId);
  const k = activeCommands.length;

  const baseRadialId = computeFittsIndexOfDifficulty(effectiveRingRadiusPx, sliceBoxSizePx);
  const unaryCost = new Float64Array(k * RADIAL_SLICE_COUNT);
  const minUnaryPerCommand = new Float64Array(k);

  for (let i = 0; i < k; i += 1) {
    const cmd = activeCommands[i];
    if (!cmd) {
      continue;
    }
    const freqWeight = Math.max(1e-3, cmd.frequency);
    const dx = cmd.screenTarget.x + cmd.screenTarget.width * 0.5 - menuOrigin.x;
    const dy = cmd.screenTarget.y + cmd.screenTarget.height * 0.5 - menuOrigin.y;
    const hasDirectionCue = Math.hypot(dx, dy) > 1.0;
    const screenAngle = hasDirectionCue ? Math.atan2(dy, dx) : 0;

    let bestForCmd = Number.POSITIVE_INFINITY;
    for (let s = 0; s < RADIAL_SLICE_COUNT; s += 1) {
      const spec = RADIAL_DIRECTION_SPECS[s];
      if (!spec) {
        continue;
      }
      const axisMultiplier = spec.isCardinal ? 1.0 : diagonalFlickPenalty;
      const angularMismatch = hasDirectionCue ? (1 - Math.cos(screenAngle - spec.angleRad)) * 0.5 : 0;
      const cost = freqWeight * (baseRadialId * axisMultiplier + spatialAffinityWeight * angularMismatch);
      unaryCost[i * RADIAL_SLICE_COUNT + s] = cost;
      if (cost < bestForCmd) {
        bestForCmd = cost;
      }
    }
    minUnaryPerCommand[i] = bestForCmd;
  }

  const pairWeightMatrix = new Float64Array(k * k);
  const pairAxisBias = new Float64Array(k * k);
  for (let i = 0; i < k; i += 1) {
    const cmdI = activeCommands[i];
    if (!cmdI) {
      continue;
    }
    for (let j = i + 1; j < k; j += 1) {
      const cmdJ = activeCommands[j];
      if (!cmdJ) {
        continue;
      }
      const w = pairSymmetricWeights.get(makePairKey(cmdI.commandId, cmdJ.commandId)) ?? 0;
      pairWeightMatrix[i * k + j] = w;
      pairWeightMatrix[j * k + i] = w;

      const dxi = Math.abs(cmdI.screenTarget.x + cmdI.screenTarget.width * 0.5 - (cmdJ.screenTarget.x + cmdJ.screenTarget.width * 0.5));
      const dyi = Math.abs(cmdI.screenTarget.y + cmdI.screenTarget.height * 0.5 - (cmdJ.screenTarget.y + cmdJ.screenTarget.height * 0.5));
      const bias = Math.abs(dxi - dyi) > 1.0 ? (dxi > dyi ? 0.03 : -0.03) : 0;
      pairAxisBias[i * k + j] = bias;
      pairAxisBias[j * k + i] = bias;
    }
  }

  const slotPairFactorMatrix = new Float64Array(RADIAL_SLICE_COUNT * RADIAL_SLICE_COUNT);
  for (let s1 = 0; s1 < RADIAL_SLICE_COUNT; s1 += 1) {
    for (let s2 = 0; s2 < RADIAL_SLICE_COUNT; s2 += 1) {
      slotPairFactorMatrix[s1 * RADIAL_SLICE_COUNT + s2] = computeSlotPairErgonomicFactor(s1, s2);
    }
  }

  const remainingUnaryLowerBound = new Float64Array(k + 1);
  for (let i = k - 1; i >= 0; i -= 1) {
    remainingUnaryLowerBound[i] = (remainingUnaryLowerBound[i + 1] ?? 0) + (minUnaryPerCommand[i] ?? 0);
  }

  const currentSlotForCmd = new Int32Array(k).fill(-1);
  const bestSlotForCmd = new Int32Array(k).fill(-1);
  let bestObjectiveCost = Number.POSITIVE_INFINITY;

  const searchBranchAndBound = (depth: number, usedSlotMask: number, partialCost: number): void => {
    if (partialCost + (remainingUnaryLowerBound[depth] ?? 0) >= bestObjectiveCost - 1e-12) {
      return;
    }
    if (depth === k) {
      bestObjectiveCost = partialCost;
      for (let idx = 0; idx < k; idx += 1) {
        bestSlotForCmd[idx] = currentSlotForCmd[idx] ?? -1;
      }
      return;
    }

    for (let slot = 0; slot < RADIAL_SLICE_COUNT; slot += 1) {
      if ((usedSlotMask & (1 << slot)) !== 0) {
        continue;
      }
      let stepCost = unaryCost[depth * RADIAL_SLICE_COUNT + slot] ?? 0;
      for (let prev = 0; prev < depth; prev += 1) {
        const pairW = pairWeightMatrix[prev * k + depth] ?? 0;
        if (pairW <= 0) {
          continue;
        }
        const prevSlot = currentSlotForCmd[prev] ?? 0;
        let factor = slotPairFactorMatrix[prevSlot * RADIAL_SLICE_COUNT + slot] ?? 1;
        const axisBias = pairAxisBias[prev * k + depth] ?? 0;
        if (axisBias !== 0) {
          const isHorizPair = (prevSlot === 2 && slot === 6) || (prevSlot === 6 && slot === 2);
          const isVertPair = (prevSlot === 0 && slot === 4) || (prevSlot === 4 && slot === 0);
          if ((axisBias > 0 && isHorizPair) || (axisBias < 0 && isVertPair)) {
            factor -= 0.025;
          }
        }
        stepCost += pairTransitionWeight * pairW * baseRadialId * factor;
      }

      currentSlotForCmd[depth] = slot;
      searchBranchAndBound(depth + 1, usedSlotMask | (1 << slot), partialCost + stepCost);
    }
  };

  searchBranchAndBound(0, 0, 0);
  if (!Number.isFinite(bestObjectiveCost)) {
    bestObjectiveCost = 0;
  }

  const commandBySlot = new Map<number, StudioCommandProfile>();
  for (let i = 0; i < k; i += 1) {
    const assignedSlot = bestSlotForCmd[i];
    const cmd = activeCommands[i];
    if (assignedSlot !== undefined && assignedSlot >= 0 && cmd !== undefined) {
      commandBySlot.set(assignedSlot, cmd);
    }
  }

  const sliceAssignments: RadialSliceAssignment[] = [];
  let activeRadialFreqSum = 0;
  let weightedRadialIdSum = 0;

  for (let slot = 0; slot < RADIAL_SLICE_COUNT; slot += 1) {
    const spec = RADIAL_DIRECTION_SPECS[slot];
    if (!spec) {
      continue;
    }
    const cx = menuOrigin.x + effectiveRingRadiusPx * spec.unitX;
    const cy = menuOrigin.y + effectiveRingRadiusPx * spec.unitY;
    const hitBox: ScreenTargetRect = Object.freeze({
      x: cx - sliceBoxSizePx * 0.5,
      y: cy - sliceBoxSizePx * 0.5,
      width: sliceBoxSizePx,
      height: sliceBoxSizePx,
    });
    const axisAdjustedId = baseRadialId * (spec.isCardinal ? 1.0 : diagonalFlickPenalty);
    const expectedFlickTimeMs = estimateFittsMovementTimeMs(
      effectiveRingRadiusPx,
      sliceBoxSizePx,
      fittsInterceptMs,
      fittsSlopeMsPerBit * (spec.isCardinal ? 1.0 : 1.14),
    );
    const assignedCmd = commandBySlot.get(slot);
    if (assignedCmd) {
      const f = Math.max(0, assignedCmd.frequency);
      activeRadialFreqSum += f;
      weightedRadialIdSum += f * axisAdjustedId;
    }

    sliceAssignments.push(Object.freeze({
      slotIndex: slot,
      direction: spec.direction,
      labelKo: spec.labelKo,
      isCardinal: spec.isCardinal,
      commandId: assignedCmd?.commandId ?? null,
      commandLabelKo: assignedCmd?.labelKo ?? null,
      frequency: assignedCmd?.frequency ?? 0,
      centerPoint: Object.freeze({ x: cx, y: cy }),
      hitBox,
      fittsIndexOfDifficultyBits: baseRadialId,
      expectedFlickTimeMs,
    }));
  }

  const baselineWeightedIdBits = totalFrequency > 0 ? weightedScreenIdSum / totalFrequency : 0;
  const optimizedRadialWeightedIdBits = activeRadialFreqSum > 0 ? weightedRadialIdSum / activeRadialFreqSum : baseRadialId;
  const averageBitsSavedPerInvoke = Math.max(0, baselineWeightedIdBits - optimizedRadialWeightedIdBits);

  const { detectedChordConflicts, chordBindings, modifierTouchPads } = resolveConflictFreeSingleHandChords(
    options.commands,
    handPreference,
    options.touchStripOrigin,
  );

  const allSliceBoxesValid = sliceAssignments.every(
    (s) => s.hitBox.width >= MIN_HIT_TARGET_PX && s.hitBox.height >= MIN_HIT_TARGET_PX,
  );
  let sliceOverlapFound = false;
  for (let i = 0; i < sliceAssignments.length; i += 1) {
    const boxA = sliceAssignments[i]?.hitBox;
    if (!boxA) {
      continue;
    }
    for (let j = i + 1; j < sliceAssignments.length; j += 1) {
      const boxB = sliceAssignments[j]?.hitBox;
      if (boxB && rectsOverlap(boxA, boxB)) {
        sliceOverlapFound = true;
      }
    }
  }
  const allTouchPadsValid = modifierTouchPads.every(
    (p) => p.hitBox.width >= MIN_HIT_TARGET_PX && p.hitBox.height >= MIN_HIT_TARGET_PX,
  );
  const allAuditedTargetsValid = auditedScreenTargets.every(
    (t) => t.enforcedRect.width >= MIN_HIT_TARGET_PX && t.enforcedRect.height >= MIN_HIT_TARGET_PX,
  );

  return Object.freeze({
    menuOrigin,
    effectiveRingRadiusPx,
    radiusClampedForHitTargetInvariant,
    deadzoneRadiusPx,
    sliceAssignments: Object.freeze(sliceAssignments),
    overflowCommandIds: Object.freeze(overflowCommandIds),
    totalObjectiveCost: bestObjectiveCost,
    baselineWeightedIdBits,
    optimizedRadialWeightedIdBits,
    averageBitsSavedPerInvoke,
    auditedScreenTargets: Object.freeze(auditedScreenTargets),
    subMinimumInputTargetCount,
    detectedChordConflicts,
    chordBindings,
    modifierTouchPads,
    allHitTargetsMeetMinimum44Px:
      allSliceBoxesValid && !sliceOverlapFound && allTouchPadsValid && allAuditedTargetsValid,
    serverCostKrw: 0,
  });
}
