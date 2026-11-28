/**
 * Wave 137 — 말풍선 역독·시선 교차 안전 자동 교정 솔버(`optimizeBalloonPositionsForGazeFlow`).
 *
 * 컷 내부 안전 여백(`safeMarginNorm`), 캐릭터 얼굴 무가림(`faceClearanceNorm`),
 * 말풍선 비겹침 제약을 하드 불변식으로 유지하면서 3종 읽기 방향(`vertical-webtoon-ltr`,
 * `page-comic-ltr`, `manga-rtl`)에 맞춰 말풍선을 결정론적으로 재배치한다.
 */

import {
  DEFAULT_ROW_BAND_TOLERANCE_Y,
  type BalloonAdjustmentRecord,
  type BalloonOptimizationOptions,
  type BalloonOptimizationOutcome,
  type EpisodeGazeAuditResult,
  type GazeAuditOptions,
  type GazeEpisodeInput,
  type GazePanelElementInput,
  type GazePanelInput,
  type GazePoint2D,
  type GazeReadingDirection,
  type NormalizedGazeElement,
  type PanelGazeAuditResult,
} from "./gaze-flow-types";
import {
  auditEpisodeGazeFlow,
  auditSinglePanelGazeFlow,
} from "./panel-gaze-handoff-solver";
import {
  computeRectOverlapArea,
  findSegmentIntersection2D,
  rectsOverlapWithGap,
  round2,
  round4,
  sanitizeFinite,
  type RectBox2D,
} from "./visual-weight-and-reading-order";

const EPSILON = 1e-9;
const DEFAULT_SAFE_MARGIN_NORM = 0.04;
const DEFAULT_FACE_CLEARANCE_NORM = 0.015;
const DEFAULT_BALLOON_GAP_NORM = 0.015;
const BEAM_WIDTH = 48;

interface CandidatePlacement extends RectBox2D {
  readonly cx: number;
  readonly cy: number;
  readonly softPenalty: number;
  readonly displacement: number;
}

interface BeamState {
  readonly placements: readonly CandidatePlacement[];
  readonly cost: number;
}

function makeCandidate(
  x: number,
  y: number,
  width: number,
  height: number,
  origX: number,
  origY: number,
  softObstacles: readonly RectBox2D[],
): CandidatePlacement {
  const box: RectBox2D = {
    x: round4(x),
    y: round4(y),
    width: round4(width),
    height: round4(height),
  };
  let softOverlap = 0;
  for (let i = 0; i < softObstacles.length; i += 1) {
    const obs = softObstacles[i];
    if (obs) softOverlap += computeRectOverlapArea(box, obs);
  }
  return {
    ...box,
    cx: round4(box.x + box.width / 2),
    cy: round4(box.y + box.height / 2),
    softPenalty: softOverlap,
    displacement: Math.hypot(box.x - origX, box.y - origY),
  };
}

function generateSafeCandidatesForBalloon(
  balloon: NormalizedGazeElement,
  hardObstacles: readonly RectBox2D[],
  softObstacles: readonly RectBox2D[],
  safeMargin: number,
  faceClearance: number,
): readonly CandidatePlacement[] {
  const maxAllowedW = Math.max(0.04, 1 - safeMargin * 2);
  const maxAllowedH = Math.max(0.04, 1 - safeMargin * 2);
  const w = Math.min(balloon.width, maxAllowedW);
  const h = Math.min(balloon.height, maxAllowedH);
  const minX = safeMargin;
  const maxX = Math.max(safeMargin, 1 - safeMargin - w);
  const minY = safeMargin;
  const maxY = Math.max(safeMargin, 1 - safeMargin - h);

  const rawCoords: Array<{ readonly x: number; readonly y: number }> = [];
  const xCols = 11;
  const yRows = 15;
  for (let r = 0; r < yRows; r += 1) {
    const y = yRows > 1 ? minY + ((maxY - minY) * r) / (yRows - 1) : minY;
    for (let c = 0; c < xCols; c += 1) {
      const x = xCols > 1 ? minX + ((maxX - minX) * c) / (xCols - 1) : minX;
      rawCoords.push({ x, y });
    }
  }

  rawCoords.push({
    x: Math.max(minX, Math.min(maxX, balloon.x)),
    y: Math.max(minY, Math.min(maxY, balloon.y)),
  });

  for (let i = 0; i < hardObstacles.length; i += 1) {
    const obs = hardObstacles[i];
    if (!obs) continue;
    const flankYs = [obs.y - h - faceClearance, obs.y + obs.height + faceClearance, obs.y];
    const flankXs = [obs.x - w - faceClearance, obs.x + obs.width + faceClearance, obs.x];
    for (let yi = 0; yi < flankYs.length; yi += 1) {
      const fy = flankYs[yi];
      if (fy === undefined || fy < minY - EPSILON || fy > maxY + EPSILON) continue;
      for (let xi = 0; xi < flankXs.length; xi += 1) {
        const fx = flankXs[xi];
        if (fx === undefined || fx < minX - EPSILON || fx > maxX + EPSILON) continue;
        rawCoords.push({
          x: Math.max(minX, Math.min(maxX, fx)),
          y: Math.max(minY, Math.min(maxY, fy)),
        });
      }
    }
  }

  const filterWithClearance = (clearance: number): CandidatePlacement[] => {
    const dedup = new Set<string>();
    const valid: CandidatePlacement[] = [];
    for (let i = 0; i < rawCoords.length; i += 1) {
      const coord = rawCoords[i];
      if (!coord) continue;
      const key = `${Math.round(coord.x * 1000)}:${Math.round(coord.y * 1000)}`;
      if (dedup.has(key)) continue;
      dedup.add(key);

      const cand = makeCandidate(coord.x, coord.y, w, h, balloon.x, balloon.y, softObstacles);
      let blocked = false;
      for (let j = 0; j < hardObstacles.length; j += 1) {
        const obs = hardObstacles[j];
        if (obs && rectsOverlapWithGap(cand, obs, clearance)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) valid.push(cand);
    }
    return valid;
  };

  const primary = filterWithClearance(faceClearance);
  return primary.length > 0 ? primary : filterWithClearance(0.001);
}

function isMonotonicNextPlacement(
  prev: CandidatePlacement,
  next: CandidatePlacement,
  readingDirection: GazeReadingDirection,
  rowBandTolY: number,
): boolean {
  if (next.cy < prev.cy - EPSILON) return false;
  const dy = next.cy - prev.cy;
  if (dy > rowBandTolY + 0.025) return true;
  if (dy <= rowBandTolY * 0.45) {
    const dx = next.cx - prev.cx;
    return readingDirection === "manga-rtl" ? dx <= -0.04 : dx >= 0.04;
  }
  return false;
}

function createsBalloonSelfIntersection(
  placements: readonly CandidatePlacement[],
  next: CandidatePlacement,
): boolean {
  const n = placements.length;
  if (n < 3) return false;
  const prev = placements[n - 1];
  if (!prev) return false;
  const newStart: GazePoint2D = { x: prev.cx, y: prev.cy };
  const newEnd: GazePoint2D = { x: next.cx, y: next.cy };
  for (let i = 0; i < n - 2; i += 1) {
    const a = placements[i];
    const b = placements[i + 1];
    if (!a || !b) continue;
    if (
      findSegmentIntersection2D({ x: a.cx, y: a.cy }, { x: b.cx, y: b.cy }, newStart, newEnd) !==
      null
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 빔 가지치기 시 초기 역배치 쪽 슬롯만 독식하지 않도록
 * `(세로 구간, 좌/중/우 구역)` 버킷별로 최우수 상태를 고르게 보존한다.
 */
function pruneBeamWithSpatialDiversity(states: BeamState[], limit: number): BeamState[] {
  states.sort((a, b) => a.cost - b.cost);
  if (states.length <= limit) return states;

  const selected: BeamState[] = [];
  const usedIndices = new Set<number>();
  const seenBuckets = new Set<string>();

  for (let i = 0; i < states.length && selected.length < limit; i += 1) {
    const st = states[i];
    const last = st?.placements[st.placements.length - 1];
    if (!st || !last) continue;
    const yBucket = Math.min(4, Math.floor(last.cy * 5));
    const xBucket = last.cx < 0.36 ? 0 : last.cx > 0.64 ? 2 : 1;
    const key = `${yBucket}:${xBucket}`;
    if (!seenBuckets.has(key)) {
      seenBuckets.add(key);
      usedIndices.add(i);
      selected.push(st);
    }
  }

  for (let i = 0; i < states.length && selected.length < limit; i += 1) {
    if (usedIndices.has(i)) continue;
    const st = states[i];
    if (st) selected.push(st);
  }
  return selected;
}

function buildPanelWithPlacements(
  panelInput: GazePanelInput,
  movableIds: readonly string[],
  placements: readonly CandidatePlacement[],
): GazePanelInput {
  const byId = new Map<string, CandidatePlacement>();
  for (let i = 0; i < movableIds.length; i += 1) {
    const id = movableIds[i];
    const box = placements[i];
    if (id && box) byId.set(id, box);
  }
  const elements: GazePanelElementInput[] = panelInput.elements.map((el) => {
    const updated = byId.get(el.elementId.trim());
    if (!updated) return el;
    return {
      ...el,
      x: updated.x,
      y: updated.y,
      width: updated.width,
      height: updated.height,
    };
  });
  return { ...panelInput, elements };
}

function optimizeSinglePanelBalloons(
  panelInput: GazePanelInput,
  panelAudit: PanelGazeAuditResult,
  readingDirection: GazeReadingDirection,
  options: {
    readonly rowBandToleranceY: number;
    readonly safeMarginNorm: number;
    readonly faceClearanceNorm: number;
    readonly balloonGapNorm: number;
    readonly auditOptions?: GazeAuditOptions;
    readonly preferredEntryX: number | null;
    readonly preferredExitX: number | null;
  },
): {
  readonly panelInput: GazePanelInput;
  readonly adjustments: readonly BalloonAdjustmentRecord[];
} {
  const movable = panelAudit.panel.elements
    .filter((el) => el.kind === "dialogue-balloon" && !el.locked)
    .slice();

  if (movable.length === 0) {
    return { panelInput, adjustments: [] };
  }

  const rankById = new Map<string, number>();
  for (let i = 0; i < panelAudit.visualReadingOrder.length; i += 1) {
    const entry = panelAudit.visualReadingOrder[i];
    if (entry) rankById.set(entry.elementId, entry.visualRank);
  }

  movable.sort((a, b) => {
    const ao = a.scriptOrder ?? Number.MAX_SAFE_INTEGER;
    const bo = b.scriptOrder ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    const ar = rankById.get(a.elementId) ?? 0;
    const br = rankById.get(b.elementId) ?? 0;
    if (ar !== br) return ar - br;
    return a.elementId.localeCompare(b.elementId);
  });

  const hardObstacles: RectBox2D[] = panelAudit.panel.elements
    .filter((el) => el.kind === "character-face" || (el.kind === "dialogue-balloon" && el.locked))
    .map((el) => ({ x: el.x, y: el.y, width: el.width, height: el.height }));

  const softObstacles: RectBox2D[] = panelAudit.panel.elements
    .filter(
      (el) =>
        el.kind === "action-focal" || el.kind === "sfx-lettering" || el.kind === "lead-line-arrow",
    )
    .map((el) => ({ x: el.x, y: el.y, width: el.width, height: el.height }));

  const candidateSets = movable.map((b) =>
    generateSafeCandidatesForBalloon(
      b,
      hardObstacles,
      softObstacles,
      options.safeMarginNorm,
      options.faceClearanceNorm,
    ),
  );

  const isRtl = readingDirection === "manga-rtl";
  const count = movable.length;

  const runBeam = (balloonGap: number): readonly BeamState[] => {
    let beam: BeamState[] = [{ placements: [], cost: 0 }];
    for (let k = 0; k < count; k += 1) {
      const cands = candidateSets[k] ?? [];
      const targetProgressY = count > 1 ? 0.14 + (0.72 * k) / (count - 1) : 0.25;
      const preferStartSide = k % 2 === 0;
      const targetProgressX = preferStartSide ? (isRtl ? 0.76 : 0.24) : isRtl ? 0.24 : 0.76;

      const nextBeam: BeamState[] = [];
      for (let bi = 0; bi < beam.length; bi += 1) {
        const state = beam[bi];
        if (!state) continue;
        const prev = state.placements[state.placements.length - 1];
        for (let ci = 0; ci < cands.length; ci += 1) {
          const cand = cands[ci];
          if (!cand) continue;
          if (
            prev &&
            !isMonotonicNextPlacement(prev, cand, readingDirection, options.rowBandToleranceY)
          ) {
            continue;
          }
          let overlapsBalloon = false;
          for (let pi = 0; pi < state.placements.length; pi += 1) {
            const placed = state.placements[pi];
            if (placed && rectsOverlapWithGap(cand, placed, balloonGap)) {
              overlapsBalloon = true;
              break;
            }
          }
          if (overlapsBalloon) continue;
          if (createsBalloonSelfIntersection(state.placements, cand)) continue;

          let stepCost =
            cand.displacement * 0.65 +
            cand.softPenalty * 6.0 +
            Math.abs(cand.cy - targetProgressY) * 0.7 +
            Math.abs(cand.cx - targetProgressX) * 0.35;
          if (k === 0 && options.preferredEntryX !== null) {
            stepCost += Math.abs(cand.cx - options.preferredEntryX) * 0.45;
          }
          if (k === count - 1 && options.preferredExitX !== null) {
            stepCost += Math.abs(cand.cx - options.preferredExitX) * 0.45;
          }

          nextBeam.push({
            placements: [...state.placements, cand],
            cost: state.cost + stepCost,
          });
        }
      }
      if (nextBeam.length === 0) return [];
      beam = pruneBeamWithSpatialDiversity(nextBeam, BEAM_WIDTH);
    }
    return beam;
  };

  let finalStates = runBeam(options.balloonGapNorm);
  if (finalStates.length === 0) {
    finalStates = runBeam(0);
  }
  if (finalStates.length === 0) {
    return { panelInput, adjustments: [] };
  }

  const movableIds = movable.map((b) => b.elementId);
  let bestCandidatePanel = panelInput;
  let bestAudit: PanelGazeAuditResult | null = null;
  let bestPlacements: readonly CandidatePlacement[] | null = null;
  let bestCost = Number.POSITIVE_INFINITY;

  for (let i = 0; i < finalStates.length; i += 1) {
    const state = finalStates[i];
    if (!state) continue;
    const candidatePanel = buildPanelWithPlacements(panelInput, movableIds, state.placements);
    const audited = auditSinglePanelGazeFlow(
      candidatePanel,
      panelAudit.panelIndex,
      readingDirection,
      options.auditOptions,
    );

    const isStrictlyBetter =
      !bestAudit ||
      audited.reversals.length < bestAudit.reversals.length ||
      (audited.reversals.length === bestAudit.reversals.length &&
        audited.intersections.length < bestAudit.intersections.length) ||
      (audited.reversals.length === bestAudit.reversals.length &&
        audited.intersections.length === bestAudit.intersections.length &&
        (audited.panelFlowScore > bestAudit.panelFlowScore + 0.5 ||
          (Math.abs(audited.panelFlowScore - bestAudit.panelFlowScore) <= 0.5 &&
            state.cost < bestCost)));

    if (isStrictlyBetter) {
      bestAudit = audited;
      bestCandidatePanel = candidatePanel;
      bestPlacements = state.placements;
      bestCost = state.cost;
    }
  }

  if (!bestPlacements) {
    return { panelInput, adjustments: [] };
  }

  const adjustments: BalloonAdjustmentRecord[] = [];
  for (let i = 0; i < movable.length; i += 1) {
    const orig = movable[i];
    const placed = bestPlacements[i];
    if (!orig || !placed) continue;
    const disp = round4(Math.hypot(placed.x - orig.x, placed.y - orig.y));
    if (disp > 0.0005 || Math.abs(placed.width - orig.width) > 0.0005) {
      adjustments.push({
        panelId: panelAudit.panel.panelId,
        elementId: orig.elementId,
        scriptOrder: orig.scriptOrder,
        beforeBox: { x: orig.x, y: orig.y, width: orig.width, height: orig.height },
        afterBox: { x: placed.x, y: placed.y, width: placed.width, height: placed.height },
        displacementNorm: disp,
      });
    }
  }

  return { panelInput: bestCandidatePanel, adjustments };
}

function verifyFacesAndSafeMargin(
  audit: EpisodeGazeAuditResult,
  safeMarginNorm: number,
): { readonly allFacesCleared: boolean; readonly allInsideSafeMargin: boolean } {
  let allFacesCleared = true;
  let allInsideSafeMargin = true;

  for (let i = 0; i < audit.panels.length; i += 1) {
    const p = audit.panels[i];
    if (!p) continue;
    const faces = p.panel.elements.filter((el) => el.kind === "character-face");
    const balloons = p.panel.elements.filter((el) => el.kind === "dialogue-balloon" && !el.locked);
    for (let bi = 0; bi < balloons.length; bi += 1) {
      const b = balloons[bi];
      if (!b) continue;
      if (
        b.x < safeMarginNorm - 0.001 ||
        b.y < safeMarginNorm - 0.001 ||
        b.x + b.width > 1 - safeMarginNorm + 0.001 ||
        b.y + b.height > 1 - safeMarginNorm + 0.001
      ) {
        allInsideSafeMargin = false;
      }
      for (let fi = 0; fi < faces.length; fi += 1) {
        const f = faces[fi];
        if (f && rectsOverlapWithGap(b, f, 0)) {
          allFacesCleared = false;
        }
      }
    }
  }

  return { allFacesCleared, allInsideSafeMargin };
}

/**
 * 말풍선 역독·시선 교차가 발생한 컷의 말풍선 좌표를 컷 안전 여백과 캐릭터 얼굴 무가림
 * 제약을 지키며 안전하게 재배치하고 교정 전후 감사 결과를 함께 반환한다.
 */
export function optimizeBalloonPositionsForGazeFlow(
  episode: GazeEpisodeInput,
  options?: BalloonOptimizationOptions,
): BalloonOptimizationOutcome {
  const rowBandToleranceY = sanitizeFinite(
    options?.rowBandToleranceY,
    DEFAULT_ROW_BAND_TOLERANCE_Y[episode.readingDirection],
    0.01,
    0.35,
  );
  const safeMarginNorm = sanitizeFinite(
    options?.safeMarginNorm,
    DEFAULT_SAFE_MARGIN_NORM,
    0.01,
    0.12,
  );
  const faceClearanceNorm = sanitizeFinite(
    options?.faceClearanceNorm,
    DEFAULT_FACE_CLEARANCE_NORM,
    0,
    0.08,
  );
  const balloonGapNorm = sanitizeFinite(
    options?.balloonGapNorm,
    DEFAULT_BALLOON_GAP_NORM,
    0,
    0.06,
  );
  const optimizeAllPanels = Boolean(options?.optimizeAllPanels);

  const beforeAudit = auditEpisodeGazeFlow(episode, options);
  const optimizedPanels: GazePanelInput[] = [];
  const adjustments: BalloonAdjustmentRecord[] = [];
  const optimizedPanelIds: string[] = [];

  for (let i = 0; i < episode.panels.length; i += 1) {
    const rawPanel = episode.panels[i];
    const panelAudit = beforeAudit.panels[i];
    if (!rawPanel || !panelAudit) continue;

    const needsOptimization =
      optimizeAllPanels ||
      panelAudit.reversals.length > 0 ||
      panelAudit.intersections.length > 0;

    if (!needsOptimization) {
      optimizedPanels.push(rawPanel);
      continue;
    }

    const prevAudit = i > 0 ? beforeAudit.panels[i - 1] : undefined;
    const nextAudit = i + 1 < beforeAudit.panels.length ? beforeAudit.panels[i + 1] : undefined;
    const result = optimizeSinglePanelBalloons(rawPanel, panelAudit, episode.readingDirection, {
      rowBandToleranceY,
      safeMarginNorm,
      faceClearanceNorm,
      balloonGapNorm,
      auditOptions: options,
      preferredEntryX: prevAudit ? prevAudit.exitPoint.x : null,
      preferredExitX: nextAudit ? nextAudit.entryPoint.x : null,
    });

    optimizedPanels.push(result.panelInput);
    if (result.adjustments.length > 0) {
      optimizedPanelIds.push(panelAudit.panel.panelId);
      for (let j = 0; j < result.adjustments.length; j += 1) {
        const adj = result.adjustments[j];
        if (adj) adjustments.push(adj);
      }
    }
  }

  const optimizedEpisode: GazeEpisodeInput = { ...episode, panels: optimizedPanels };
  const afterAudit = auditEpisodeGazeFlow(optimizedEpisode, options);
  const checks = verifyFacesAndSafeMargin(afterAudit, safeMarginNorm);

  return {
    optimizedEpisode,
    beforeAudit,
    afterAudit,
    adjustments,
    optimizedPanelIds,
    scoreDelta: round2(afterAudit.overallGazeFlowScore - beforeAudit.overallGazeFlowScore),
    remainingReversals: afterAudit.violationCounts["balloon-reading-order-reversal"],
    remainingIntersections: afterAudit.violationCounts["self-intersecting-gaze-path"],
    allFacesCleared: checks.allFacesCleared,
    allInsideSafeMargin: checks.allInsideSafeMargin,
    manifestSha256: afterAudit.manifestSha256,
  };
}
