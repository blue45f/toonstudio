/**
 * Wave 148 — 인접 얼굴·꼬리 교차 제로 결정론 자동 라우터 &
 * 순수 ES2017 SHA-256 매니페스트 지문 (기하 생성·결함 감지기 통합 진입점).
 */

import {
  auditPanelBalloonTails,
  evaluateSpeakerAim,
  isOnPanelSpeaker,
  tailIntersectsFaceRect,
  tailsCross2D,
} from "./balloon-tail-audit";
import {
  buildBalloonTailGeometry,
  resolveOffPanelEdgeTarget,
} from "./balloon-tail-geometry";
import {
  clamp,
  doBoundsOverlap,
  isPointInsideEllipse,
  isPointInsideOrOnRect,
  isPointInsideRect,
  minDistancePolylineToPolyline,
  minDistancePolylineToRect,
  normalizeAngleDeg,
  radToDeg,
  roundFixed,
  sanitizePoint,
  sanitizeRect,
  sha256Utf8Hex,
  signedAngleDiffDeg,
} from "./balloon-tail-math-and-sha256";
import {
  BALLOON_TAIL_STYLE_PRESETS,
  type BalloonTailRouterOptions,
  type BalloonTailRoutingComparison,
  type BalloonTailRoutingResult,
  type BuiltBalloonTailGeometry,
  type PanelBalloonTailAudit,
  type PanelBalloonTailDocument,
  type SpeakerAnchorSpec,
  type SpeechBalloonTailSpec,
} from "./balloon-tail-types";

export { auditPanelBalloonTails } from "./balloon-tail-audit";
export {
  buildBalloonTailGeometry,
  ellipsePointAtAngle,
  inferOffPanelEdge,
} from "./balloon-tail-geometry";

interface ScoredCandidate {
  readonly tail: BuiltBalloonTailGeometry;
  readonly soloCost: number;
  readonly curveBand: number;
  readonly bucketKey: string;
}

function classifyCurveBand(curveOffsetPx: number): number {
  if (curveOffsetPx > 190) return 3;
  if (curveOffsetPx > 95) return 2;
  if (curveOffsetPx > 32) return 1;
  if (curveOffsetPx < -190) return -3;
  if (curveOffsetPx < -95) return -2;
  if (curveOffsetPx < -32) return -1;
  return 0;
}

function scoreSingleCandidate(
  tail: BuiltBalloonTailGeometry,
  spec: SpeechBalloonTailSpec,
  owner: SpeakerAnchorSpec,
  doc: PanelBalloonTailDocument,
  onPanelSpeakers: readonly SpeakerAnchorSpec[],
  preferredFaceClearancePx: number,
): ScoredCandidate {
  const panelRect = sanitizeRect(doc.panelBounds);
  const preset = BALLOON_TAIL_STYLE_PRESETS[spec.tailStyle];

  let faceCrossings = 0;
  let minOtherFaceClearance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < onPanelSpeakers.length; i += 1) {
    const other = onPanelSpeakers[i];
    if (!other || other.speakerId === owner.speakerId) continue;
    const otherFace = sanitizeRect(other.faceBounds);
    if (tailIntersectsFaceRect(tail, otherFace)) {
      faceCrossings += 1;
      minOtherFaceClearance = 0;
    } else {
      const clearance = minDistancePolylineToRect(tail.centerlineSamples, otherFace);
      if (clearance < minOtherFaceClearance) minOtherFaceClearance = clearance;
    }
  }

  let speakerPiercing = 0;
  let ambiguousAim = 0;
  let aimAngleErrorDeg = 0;
  if (isOnPanelSpeaker(owner)) {
    const ownerFace = sanitizeRect(owner.faceBounds);
    if (tail.tipInsideSpeakerFace) {
      speakerPiercing = 1;
    } else {
      const startIdx = Math.floor(tail.centerlineSamples.length * 0.4);
      for (let k = startIdx; k < tail.centerlineSamples.length; k += 1) {
        const pt = tail.centerlineSamples[k];
        if (pt && isPointInsideRect(pt, ownerFace)) {
          speakerPiercing = 1;
          break;
        }
      }
    }
    if (tail.tailStyle !== "off-panel-edge-arrow") {
      const aimDiag = evaluateSpeakerAim(tail, owner, onPanelSpeakers);
      aimAngleErrorDeg = aimDiag.aimAngleErrorDeg;
      if (aimDiag.isAmbiguous) ambiguousAim = 1;
    }
  }

  let outsidePanelSamples = 0;
  for (let k = 0; k < tail.centerlineSamples.length; k += 1) {
    const pt = tail.centerlineSamples[k];
    if (pt && !isPointInsideOrOnRect(pt, panelRect, 1)) outsidePanelSamples += 1;
  }

  let otherBalloonHits = 0;
  for (let b = 0; b < doc.balloons.length; b += 1) {
    const otherBalloon = doc.balloons[b];
    if (!otherBalloon || otherBalloon.balloonId === spec.balloonId) continue;
    for (let k = 1; k < tail.centerlineSamples.length; k += 1) {
      const pt = tail.centerlineSamples[k];
      if (
        pt &&
        isPointInsideEllipse(
          pt,
          otherBalloon.centerX,
          otherBalloon.centerY,
          otherBalloon.rx,
          otherBalloon.ry,
          0.95,
        )
      ) {
        otherBalloonHits += 1;
        break;
      }
    }
  }

  const directAngleDeg = normalizeAngleDeg(
    radToDeg(Math.atan2(tail.aimTarget.y - spec.centerY, tail.aimTarget.x - spec.centerX)),
  );
  const anchorDelta = Math.abs(signedAngleDiffDeg(tail.anchorAngleDeg, directAngleDeg));
  const preferredCurve = spec.curveOffsetPx ?? preset.defaultCurveOffsetPx;
  const curveDeviation = Math.abs(Math.abs(tail.curveOffsetPx) - Math.abs(preferredCurve));
  const clearanceShortfall = Number.isFinite(minOtherFaceClearance)
    ? Math.max(0, preferredFaceClearancePx - minOtherFaceClearance)
    : 0;

  const soloCost =
    faceCrossings * 120000 +
    speakerPiercing * 120000 +
    ambiguousAim * 80000 +
    outsidePanelSamples * 14000 +
    otherBalloonHits * 4500 +
    clearanceShortfall * 45 +
    aimAngleErrorDeg * 8 +
    curveDeviation * 1.4 +
    Math.abs(tail.curveOffsetPx) * 0.55 +
    anchorDelta * 0.9 +
    tail.arcLengthPx * 0.4;

  const curveBand = classifyCurveBand(tail.curveOffsetPx);
  const anchorQuadrant = Math.floor(normalizeAngleDeg(tail.anchorAngleDeg) / 90) % 4;
  return { tail, soloCost, curveBand, bucketKey: `${curveBand}:${anchorQuadrant}` };
}

function generateCandidatesForBalloon(
  spec: SpeechBalloonTailSpec,
  owner: SpeakerAnchorSpec,
  doc: PanelBalloonTailDocument,
  onPanelSpeakers: readonly SpeakerAnchorSpec[],
  maxCandidates: number,
  preferredFaceClearancePx: number,
  escalated: boolean,
): { readonly candidates: readonly ScoredCandidate[]; readonly evaluatedCount: number } {
  const preset = BALLOON_TAIL_STYLE_PRESETS[spec.tailStyle];
  const isOffPanel = spec.tailStyle === "off-panel-edge-arrow" || owner.isOffPanel === true;
  const aimTarget = isOffPanel
    ? resolveOffPanelEdgeTarget(spec, owner, doc.panelBounds, 0).target
    : sanitizePoint(owner.mouthPos);
  const directAngleDeg = normalizeAngleDeg(
    radToDeg(Math.atan2(aimTarget.y - spec.centerY, aimTarget.x - spec.centerX)),
  );

  const anchorOffsets = escalated
    ? [0, 16, -16, 36, -36, 58, -58, 84, -84, 112, -112, 142, -142, 172]
    : [0, 24, -24, 52, -52, 86, -86, 126, -126, 168];
  const anchorAngles: number[] = [];
  if (spec.preferredAnchorAngleDeg !== undefined) {
    anchorAngles.push(normalizeAngleDeg(spec.preferredAnchorAngleDeg));
  }
  for (let i = 0; i < anchorOffsets.length; i += 1) {
    const candidateAngle = normalizeAngleDeg(directAngleDeg + (anchorOffsets[i] ?? 0));
    if (!anchorAngles.some((e) => Math.abs(signedAngleDiffDeg(e, candidateAngle)) < 4)) {
      anchorAngles.push(candidateAngle);
    }
  }

  const tipOffsets = isOffPanel
    ? escalated
      ? [0, 36, -36, 78, -78, 128, -128]
      : [0, 44, -44, 96, -96]
    : escalated
      ? [0, 28, -28, 56, -56, 86, -86, 118, -118]
      : [0, 34, -34, 68, -68, 102, -102];

  const baseCurve = Math.abs(spec.curveOffsetPx ?? preset.defaultCurveOffsetPx);
  const rawCurveOffsets = escalated
    ? [0, baseCurve, -baseCurve, 30, -30, 72, -72, 130, -130, 195, -195, 265, -265, 340, -340, 410, -410]
    : [0, baseCurve, -baseCurve, 28, -28, 66, -66, 125, -125, 195, -195, 270, -270];
  const curveOffsets: number[] = [];
  for (let i = 0; i < rawCurveOffsets.length; i += 1) {
    const c = rawCurveOffsets[i] ?? 0;
    if (!curveOffsets.some((existing) => Math.abs(existing - c) < 4)) curveOffsets.push(c);
  }

  const allScored: ScoredCandidate[] = [];
  let evaluatedCount = 0;
  for (let a = 0; a < anchorAngles.length; a += 1) {
    const anchorAngleDeg = anchorAngles[a] ?? directAngleDeg;
    for (let t = 0; t < tipOffsets.length; t += 1) {
      const tipOff = tipOffsets[t] ?? 0;
      for (let c = 0; c < curveOffsets.length; c += 1) {
        const tail = buildBalloonTailGeometry(spec, owner, doc.panelBounds, {
          anchorAngleDeg,
          curveOffsetPx: curveOffsets[c] ?? 0,
          tipApproachAngleOffsetDeg: isOffPanel ? 0 : tipOff,
          offPanelEdgeTargetOffsetPx: isOffPanel ? tipOff : 0,
        });
        evaluatedCount += 1;
        allScored.push(
          scoreSingleCandidate(tail, spec, owner, doc, onPanelSpeakers, preferredFaceClearancePx),
        );
      }
    }
  }
  allScored.sort((x, y) => x.soloCost - y.soloCost);

  // (곡률 대역 -3..+3 × 앵커 사분면 0..3) 호모토피 셀마다 상위 후보를 고르게 보존해
  // 말풍선 위/아래·좌/우 우회 아치 대안이 솔로 비용 정렬에서 소실되지 않게 한다.
  const selected: ScoredCandidate[] = [];
  const seenKeys = new Set<string>();
  const bucketCounts = new Map<string, number>();
  const perCellBase = escalated ? 3 : 2;

  const tryPush = (item: ScoredCandidate): boolean => {
    const key = `${Math.round(item.tail.anchorAngleDeg)}:${Math.round(item.tail.curveOffsetPx)}:${Math.round(item.tail.tip.x)}:${Math.round(item.tail.tip.y)}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    selected.push(item);
    return true;
  };

  for (let passLimit = 1; passLimit <= perCellBase && selected.length < maxCandidates; passLimit += 1) {
    for (let i = 0; i < allScored.length && selected.length < maxCandidates; i += 1) {
      const item = allScored[i];
      if (!item) continue;
      const count = bucketCounts.get(item.bucketKey) ?? 0;
      if (count >= passLimit) continue;
      if (tryPush(item)) {
        bucketCounts.set(item.bucketKey, count + 1);
      }
    }
  }

  for (let i = 0; i < allScored.length && selected.length < maxCandidates; i += 1) {
    const item = allScored[i];
    if (item) tryPush(item);
  }

  selected.sort((x, y) => x.soloCost - y.soloCost);
  return { candidates: selected, evaluatedCount };
}

function pairwiseTailInteractionCost(
  a: BuiltBalloonTailGeometry,
  b: BuiltBalloonTailGeometry,
  preferredSeparationPx: number,
): number {
  if (tailsCross2D(a, b) !== null) return 220000;
  if (!doBoundsOverlap(a.bounds, b.bounds, preferredSeparationPx)) return 0;
  const dist = minDistancePolylineToPolyline(a.centerlineSamples, b.centerlineSamples);
  return dist < preferredSeparationPx ? (preferredSeparationPx - dist) * 35 : 0;
}

function solveJointAssignment(
  pools: readonly (readonly ScoredCandidate[])[],
  beamWidth: number,
  preferredSeparationPx: number,
): number[] {
  const n = pools.length;
  if (n === 0) return [];
  if (n === 1) return [0];

  if (n === 2) {
    const pool0 = pools[0] ?? [];
    const pool1 = pools[1] ?? [];
    let bestCost = Number.POSITIVE_INFINITY;
    let bestI = 0;
    let bestJ = 0;
    for (let i = 0; i < pool0.length; i += 1) {
      const c0 = pool0[i];
      if (!c0) continue;
      for (let j = 0; j < pool1.length; j += 1) {
        const c1 = pool1[j];
        if (!c1) continue;
        const total =
          c0.soloCost +
          c1.soloCost +
          pairwiseTailInteractionCost(c0.tail, c1.tail, preferredSeparationPx);
        if (total < bestCost) {
          bestCost = total;
          bestI = i;
          bestJ = j;
        }
      }
    }
    return [bestI, bestJ];
  }

  interface BeamState {
    readonly indices: readonly number[];
    readonly cost: number;
  }

  let beam: BeamState[] = (pools[0] ?? []).slice(0, beamWidth).map((cand, idx) => ({
    indices: [idx],
    cost: cand.soloCost,
  }));

  for (let step = 1; step < n; step += 1) {
    const pool = pools[step] ?? [];
    const nextBeam: BeamState[] = [];
    for (let b = 0; b < beam.length; b += 1) {
      const state = beam[b];
      if (!state) continue;
      for (let c = 0; c < pool.length; c += 1) {
        const cand = pool[c];
        if (!cand) continue;
        let pairCost = 0;
        for (let prev = 0; prev < step; prev += 1) {
          const prevCand = pools[prev]?.[state.indices[prev] ?? 0];
          if (prevCand) pairCost += pairwiseTailInteractionCost(prevCand.tail, cand.tail, preferredSeparationPx);
        }
        nextBeam.push({ indices: [...state.indices, c], cost: state.cost + cand.soloCost + pairCost });
      }
    }
    nextBeam.sort((x, y) => x.cost - y.cost);
    beam = nextBeam.slice(0, beamWidth);
  }

  const chosen = [...(beam[0]?.indices ?? pools.map(() => 0))];

  for (let pass = 0; pass < 3; pass += 1) {
    let improved = false;
    for (let i = 0; i < n; i += 1) {
      const pool = pools[i] ?? [];
      let bestIdx = chosen[i] ?? 0;
      let bestLocalCost = Number.POSITIVE_INFINITY;
      for (let c = 0; c < pool.length; c += 1) {
        const cand = pool[c];
        if (!cand) continue;
        let cost = cand.soloCost;
        for (let j = 0; j < n; j += 1) {
          if (j === i) continue;
          const otherCand = pools[j]?.[chosen[j] ?? 0];
          if (otherCand) cost += pairwiseTailInteractionCost(cand.tail, otherCand.tail, preferredSeparationPx);
        }
        if (cost < bestLocalCost - 1e-6) {
          bestLocalCost = cost;
          bestIdx = c;
        }
      }
      if (bestIdx !== chosen[i]) {
        chosen[i] = bestIdx;
        improved = true;
      }
    }
    if (!improved) break;
  }

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const tailI = pools[i]?.[chosen[i] ?? 0]?.tail;
      const tailJ = pools[j]?.[chosen[j] ?? 0]?.tail;
      if (!tailI || !tailJ || tailsCross2D(tailI, tailJ) === null) continue;
      const poolI = pools[i] ?? [];
      const poolJ = pools[j] ?? [];
      let bestPairCost = Number.POSITIVE_INFINITY;
      let bestPairI = chosen[i] ?? 0;
      let bestPairJ = chosen[j] ?? 0;
      for (let ci = 0; ci < poolI.length; ci += 1) {
        const candI = poolI[ci];
        if (!candI) continue;
        let extI = candI.soloCost;
        for (let k = 0; k < n; k += 1) {
          if (k === i || k === j) continue;
          const other = pools[k]?.[chosen[k] ?? 0];
          if (other) extI += pairwiseTailInteractionCost(candI.tail, other.tail, preferredSeparationPx);
        }
        for (let cj = 0; cj < poolJ.length; cj += 1) {
          const candJ = poolJ[cj];
          if (!candJ) continue;
          let total =
            extI +
            candJ.soloCost +
            pairwiseTailInteractionCost(candI.tail, candJ.tail, preferredSeparationPx);
          for (let k = 0; k < n; k += 1) {
            if (k === i || k === j) continue;
            const other = pools[k]?.[chosen[k] ?? 0];
            if (other) total += pairwiseTailInteractionCost(candJ.tail, other.tail, preferredSeparationPx);
          }
          if (total < bestPairCost) {
            bestPairCost = total;
            bestPairI = ci;
            bestPairJ = cj;
          }
        }
      }
      chosen[i] = bestPairI;
      chosen[j] = bestPairJ;
    }
  }

  return chosen;
}

export function computeTailRoutingSha256Hex(
  doc: PanelBalloonTailDocument,
  tails: readonly BuiltBalloonTailGeometry[],
  audit: PanelBalloonTailAudit,
): string {
  const canonical = {
    schema: "toonstudio.wave148.balloon-tail-router.v1",
    panelId: doc.panelId,
    panelBounds: {
      x: roundFixed(doc.panelBounds.x, 2),
      y: roundFixed(doc.panelBounds.y, 2),
      width: roundFixed(doc.panelBounds.width, 2),
      height: roundFixed(doc.panelBounds.height, 2),
    },
    audit: {
      passed: audit.passed,
      totalDefectCount: audit.totalDefectCount,
      faceCrossingCount: audit.faceCrossingCount,
      tailCrossingCount: audit.tailCrossingCount,
      speakerFacePiercingCount: audit.speakerFacePiercingCount,
      ambiguousAimCount: audit.ambiguousAimCount,
    },
    tails: [...tails]
      .sort((a, b) => a.balloonId.localeCompare(b.balloonId))
      .map((t) => ({
        balloonId: t.balloonId,
        speakerId: t.speakerId,
        tailStyle: t.tailStyle,
        anchorAngleDeg: roundFixed(t.anchorAngleDeg, 2),
        curveOffsetPx: roundFixed(t.curveOffsetPx, 2),
        anchor: [roundFixed(t.anchorPoint.x, 2), roundFixed(t.anchorPoint.y, 2)],
        control: [roundFixed(t.centerControl.x, 2), roundFixed(t.centerControl.y, 2)],
        tip: [roundFixed(t.tip.x, 2), roundFixed(t.tip.y, 2)],
        tipStandoffPx: roundFixed(t.tipStandoffPx, 2),
        tipInsideSpeakerFace: t.tipInsideSpeakerFace,
        thoughtDots: t.thoughtDots.map((d) => [
          roundFixed(d.center.x, 2),
          roundFixed(d.center.y, 2),
          roundFixed(d.radius, 2),
        ]),
        offPanelEdge: t.offPanelEdge,
      })),
  };
  return sha256Utf8Hex(JSON.stringify(canonical));
}

export function routeCollisionFreeBalloonTails(
  doc: PanelBalloonTailDocument,
  options?: BalloonTailRouterOptions,
): BalloonTailRoutingResult {
  const maxCandidates = Math.round(clamp(options?.maxCandidatesPerBalloon ?? 52, 20, 84));
  const beamWidth = Math.round(clamp(options?.beamWidth ?? 24, 6, 48));
  const preferredFaceClearancePx = clamp(options?.preferredFaceClearancePx ?? 14, 0, 48);
  const preferredTailSeparationPx = clamp(options?.preferredTailSeparationPx ?? 12, 0, 48);

  const speakerById = new Map<string, SpeakerAnchorSpec>();
  const onPanelSpeakers: SpeakerAnchorSpec[] = [];
  for (let i = 0; i < doc.speakers.length; i += 1) {
    const sp = doc.speakers[i];
    if (!sp) continue;
    speakerById.set(sp.speakerId, sp);
    if (isOnPanelSpeaker(sp)) onPanelSpeakers.push(sp);
  }

  const activeSpecs: { readonly spec: SpeechBalloonTailSpec; readonly owner: SpeakerAnchorSpec }[] = [];
  const baselineTails: BuiltBalloonTailGeometry[] = [];
  for (let i = 0; i < doc.balloons.length; i += 1) {
    const spec = doc.balloons[i];
    if (!spec) continue;
    const owner = speakerById.get(spec.speakerId);
    if (!owner) continue;
    activeSpecs.push({ spec, owner });
    baselineTails.push(
      buildBalloonTailGeometry(spec, owner, doc.panelBounds, {
        curveOffsetPx: 0,
        tipApproachAngleOffsetDeg: 0,
        offPanelEdgeTargetOffsetPx: 0,
      }),
    );
  }
  const baselineAudit = auditPanelBalloonTails(doc, baselineTails);

  let evaluatedCandidateCount = 0;
  const stage1Pools: (readonly ScoredCandidate[])[] = [];
  for (let i = 0; i < activeSpecs.length; i += 1) {
    const entry = activeSpecs[i];
    if (!entry) continue;
    const gen = generateCandidatesForBalloon(
      entry.spec,
      entry.owner,
      doc,
      onPanelSpeakers,
      maxCandidates,
      preferredFaceClearancePx,
      false,
    );
    evaluatedCandidateCount += gen.evaluatedCount;
    stage1Pools.push(gen.candidates);
  }

  const stage1Assignment = solveJointAssignment(stage1Pools, beamWidth, preferredTailSeparationPx);
  let routedTails = stage1Assignment
    .map((candIdx, i) => stage1Pools[i]?.[candIdx]?.tail)
    .filter((t): t is BuiltBalloonTailGeometry => t !== undefined);
  let routedAudit = auditPanelBalloonTails(doc, routedTails);

  if (routedAudit.totalDefectCount > 0 && activeSpecs.length > 0) {
    const escalatedPools: (readonly ScoredCandidate[])[] = [];
    for (let i = 0; i < activeSpecs.length; i += 1) {
      const entry = activeSpecs[i];
      if (!entry) continue;
      const gen = generateCandidatesForBalloon(
        entry.spec,
        entry.owner,
        doc,
        onPanelSpeakers,
        Math.min(76, maxCandidates + 24),
        preferredFaceClearancePx,
        true,
      );
      evaluatedCandidateCount += gen.evaluatedCount;
      escalatedPools.push(gen.candidates);
    }
    const escalatedAssignment = solveJointAssignment(
      escalatedPools,
      Math.min(36, beamWidth + 8),
      preferredTailSeparationPx,
    );
    const escalatedTails = escalatedAssignment
      .map((candIdx, i) => escalatedPools[i]?.[candIdx]?.tail)
      .filter((t): t is BuiltBalloonTailGeometry => t !== undefined);
    const escalatedAudit = auditPanelBalloonTails(doc, escalatedTails);
    if (escalatedAudit.totalDefectCount <= routedAudit.totalDefectCount) {
      routedTails = escalatedTails;
      routedAudit = escalatedAudit;
    }
  }

  const resolvedDefectCount = Math.max(0, baselineAudit.totalDefectCount - routedAudit.totalDefectCount);
  const defectReductionRatio =
    baselineAudit.totalDefectCount === 0
      ? routedAudit.totalDefectCount === 0
        ? 1
        : 0
      : roundFixed(
          clamp(
            (baselineAudit.totalDefectCount - routedAudit.totalDefectCount) /
              baselineAudit.totalDefectCount,
            0,
            1,
          ),
          4,
        );

  const comparison: BalloonTailRoutingComparison = {
    baselineDefectCount: baselineAudit.totalDefectCount,
    routedDefectCount: routedAudit.totalDefectCount,
    resolvedDefectCount,
    baselineFaceCrossings: baselineAudit.faceCrossingCount,
    routedFaceCrossings: routedAudit.faceCrossingCount,
    resolvedFaceCrossings: Math.max(0, baselineAudit.faceCrossingCount - routedAudit.faceCrossingCount),
    baselineTailCrossings: baselineAudit.tailCrossingCount,
    routedTailCrossings: routedAudit.tailCrossingCount,
    resolvedTailCrossings: Math.max(0, baselineAudit.tailCrossingCount - routedAudit.tailCrossingCount),
    baselineFacePiercings: baselineAudit.speakerFacePiercingCount,
    routedFacePiercings: routedAudit.speakerFacePiercingCount,
    resolvedFacePiercings: Math.max(
      0,
      baselineAudit.speakerFacePiercingCount - routedAudit.speakerFacePiercingCount,
    ),
    baselineAmbiguousAims: baselineAudit.ambiguousAimCount,
    routedAmbiguousAims: routedAudit.ambiguousAimCount,
    resolvedAmbiguousAims: Math.max(0, baselineAudit.ambiguousAimCount - routedAudit.ambiguousAimCount),
    defectReductionRatio,
    allDefectsResolved: routedAudit.totalDefectCount === 0,
  };

  return {
    panelId: doc.panelId,
    baselineTails,
    baselineAudit,
    routedTails,
    routedAudit,
    comparison,
    evaluatedCandidateCount,
    tailRoutingSha256Hex: computeTailRoutingSha256Hex(doc, routedTails, routedAudit),
  };
}
