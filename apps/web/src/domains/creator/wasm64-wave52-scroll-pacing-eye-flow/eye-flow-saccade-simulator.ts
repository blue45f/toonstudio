/**
 * Wave-52: 컷 내부 시선 도약(Saccade) 경로 · 역주행 탐지 · 정체 히트맵 시뮬레이터.
 *
 * - 말풍선 읽기 순서(좌→우, 상→하), 캐릭터 시선 벡터, 행동선·고대비 포컬 포인트를 통합해
 *   독자의 안구 도약 경로와 고정 체류 시간을 정량 계산한다.
 * - 세로 스크롤 흐름을 거스르는 역주행(상향 도약, 읽기 방향 역행, 화자 우회, 시선 충돌)을 진단한다.
 * - 2D 가우시안 커널과 역주행 교차 가중치로 `Float32Array` 시선 정체 히트맵을 `0..1` 정규화한다.
 */

export type ReadingDirection = "ltr" | "rtl";
export type BalloonEmphasis = "normal" | "shout" | "whisper" | "narration";
export type SaccadeNodeKind = "speech-balloon" | "character-gaze" | "action-line-focal" | "high-contrast-focal";
export type BacktrackErrorKind = "vertical-upward" | "horizontal-against-reading" | "speaker-detour" | "gaze-conflict";

export interface Point2D {
  readonly x: number;
  readonly y: number;
}
export interface SpeechBalloonSpec {
  readonly id: string;
  readonly readingOrder: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly characterCount: number;
  readonly speakerAnchorId?: string;
  readonly tailTarget?: Point2D;
  readonly emphasis?: BalloonEmphasis;
}
export interface CharacterGazeAnchor {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly gazeDx: number;
  readonly gazeDy: number;
  readonly gazeRangePx?: number;
  readonly saliencyWeight?: number;
}
export interface ActionLineFocalPoint {
  readonly id: string;
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly contrastScore: number;
  readonly kind: "action-line" | "high-contrast-focal";
}
export interface PanelEyeFlowInput {
  readonly panelId: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly balloons: readonly SpeechBalloonSpec[];
  readonly characterAnchors?: readonly CharacterGazeAnchor[];
  readonly actionFocals?: readonly ActionLineFocalPoint[];
  readonly readingDirection?: ReadingDirection;
  readonly heatmapCols?: number;
  readonly heatmapRows?: number;
  readonly congestionThreshold?: number;
}
export interface SaccadeNode {
  readonly id: string;
  readonly kind: SaccadeNodeKind;
  readonly x: number;
  readonly y: number;
  readonly dwellMs: number;
  readonly saliencyWeight: number;
  readonly vectorDx: number;
  readonly vectorDy: number;
}
export interface SaccadeSegment {
  readonly fromId: string;
  readonly toId: string;
  readonly fromKind: SaccadeNodeKind;
  readonly toKind: SaccadeNodeKind;
  readonly dx: number;
  readonly dy: number;
  readonly distancePx: number;
  readonly saccadeDurationMs: number;
  readonly gazeAlignmentScore: number;
  readonly isBacktrack: boolean;
}
export interface BacktrackError {
  readonly kind: BacktrackErrorKind;
  readonly severity: "warning" | "critical";
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly dx: number;
  readonly dy: number;
  readonly penalty: number;
  readonly messageKo: string;
}
export interface SpeakerFlowEvaluation {
  readonly balloonId: string;
  readonly speakerAnchorId: string;
  readonly distancePx: number;
  readonly dy: number;
  readonly tailAlignment: number;
  readonly isNaturalFlow: boolean;
  readonly score: number;
}
export interface CongestionZone {
  readonly col: number;
  readonly row: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly normalizedIntensity: number;
  readonly rawDwellDensity: number;
}
export interface EyeFlowHeatmap {
  readonly cols: number;
  readonly rows: number;
  readonly values: Float32Array;
  readonly rawMaxDensity: number;
  readonly congestionZones: readonly CongestionZone[];
}
export interface PanelEyeFlowReport {
  readonly panelId: string;
  readonly readingDirection: ReadingDirection;
  readonly nodes: readonly SaccadeNode[];
  readonly segments: readonly SaccadeSegment[];
  readonly backtrackErrors: readonly BacktrackError[];
  readonly speakerFlows: readonly SpeakerFlowEvaluation[];
  readonly naturalSpeakerLinkRate: number;
  readonly totalSaccadeDistancePx: number;
  readonly totalDwellMs: number;
  readonly flowSmoothnessScore: number;
  readonly frictionRatio: number;
  readonly heatmap: EyeFlowHeatmap;
  readonly summaryKo: string;
}

export const DEFAULT_HEATMAP_COLS = 16;
export const DEFAULT_HEATMAP_ROWS = 24;
export const DEFAULT_CONGESTION_THRESHOLD = 0.72;

const VERTICAL_BALLOON_BACKTRACK_PX = 28;
const VERTICAL_VISUAL_BACKTRACK_PX = 48;
const HORIZONTAL_ROW_BAND_PX = 48;
const HORIZONTAL_BACKTRACK_PX = 36;
const SPEAKER_UPWARD_DETOUR_PX = 36;
const SPEAKER_MAX_NATURAL_DIST_PX = 280;

const clamp = (v: number, min: number, max: number): number =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
const round2 = (v: number): number => Math.round(v * 100) / 100;

function normalizeVec(dx: number, dy: number): { readonly dx: number; readonly dy: number; readonly len: number } {
  const len = Math.hypot(dx, dy);
  return len <= 1e-6 ? { dx: 0, dy: 0, len: 0 } : { dx: dx / len, dy: dy / len, len };
}

function balloonCenter(b: SpeechBalloonSpec): Point2D {
  return { x: b.x + Math.max(0, b.width) * 0.5, y: b.y + Math.max(0, b.height) * 0.5 };
}

function balloonDwellMs(b: SpeechBalloonSpec): number {
  const factor = b.emphasis === "shout" ? 0.9 : b.emphasis === "whisper" ? 1.18 : b.emphasis === "narration" ? 1.12 : 1;
  return Math.round((210 + Math.max(0, b.characterCount) * 34) * factor);
}

function toAnchorNode(anchor: CharacterGazeAnchor, dwellMs: number): SaccadeNode {
  const gaze = normalizeVec(anchor.gazeDx, anchor.gazeDy);
  return {
    id: anchor.id, kind: "character-gaze", x: round2(anchor.x), y: round2(anchor.y), dwellMs,
    saliencyWeight: clamp(anchor.saliencyWeight ?? 0.8, 0.3, 1.3), vectorDx: round2(gaze.dx), vectorDy: round2(gaze.dy),
  };
}

function toFocalNode(focal: ActionLineFocalPoint): SaccadeNode {
  const dir = normalizeVec(focal.endX - focal.startX, focal.endY - focal.startY);
  const contrast = clamp(focal.contrastScore, 0, 1);
  return {
    id: focal.id, kind: focal.kind === "action-line" ? "action-line-focal" : "high-contrast-focal",
    x: round2(focal.endX), y: round2(focal.endY), dwellMs: Math.round(175 + contrast * 165),
    saliencyWeight: clamp(0.62 + contrast * 0.58, 0.4, 1.35), vectorDx: round2(dir.dx), vectorDy: round2(dir.dy),
  };
}

function evaluateSpeakerFlow(b: SpeechBalloonSpec, anchor: CharacterGazeAnchor): SpeakerFlowEvaluation {
  const center = balloonCenter(b);
  const dx = anchor.x - center.x;
  const dy = anchor.y - center.y;
  const dist = Math.hypot(dx, dy);
  let tailAlignment = 0.65;
  if (b.tailTarget !== undefined) {
    const tailDir = normalizeVec(b.tailTarget.x - center.x, b.tailTarget.y - center.y);
    const spkDir = normalizeVec(dx, dy);
    if (tailDir.len > 1 && spkDir.len > 1) {
      tailAlignment = clamp((tailDir.dx * spkDir.dx + tailDir.dy * spkDir.dy + 1) * 0.5, 0, 1);
    }
  }
  const upward = dy < -SPEAKER_UPWARD_DETOUR_PX;
  const distScore = clamp(1 - Math.max(0, dist - 90) / SPEAKER_MAX_NATURAL_DIST_PX, 0.1, 1);
  const vertScore = upward ? clamp(1 - Math.abs(dy) / 180, 0.1, 0.55) : 1;
  return {
    balloonId: b.id, speakerAnchorId: anchor.id, distancePx: round2(dist), dy: round2(dy),
    tailAlignment: round2(tailAlignment),
    isNaturalFlow: !upward && dist <= SPEAKER_MAX_NATURAL_DIST_PX && tailAlignment >= 0.45,
    score: round2(clamp(distScore * 0.45 + vertScore * 0.35 + tailAlignment * 0.2, 0, 1)),
  };
}

function findGazeTargetFocal(
  anchor: CharacterGazeAnchor,
  focals: readonly ActionLineFocalPoint[],
  visited: ReadonlySet<string>,
): ActionLineFocalPoint | undefined {
  const gaze = normalizeVec(anchor.gazeDx, anchor.gazeDy);
  if (gaze.len === 0) return undefined;
  const maxRange = Math.max(60, anchor.gazeRangePx ?? 240);
  let best: ActionLineFocalPoint | undefined;
  let bestScore = 0.52;
  for (const focal of focals) {
    if (visited.has(focal.id)) continue;
    const toFocal = normalizeVec(focal.endX - anchor.x, focal.endY - anchor.y);
    if (toFocal.len < 8 || toFocal.len > maxRange) continue;
    const score = (gaze.dx * toFocal.dx + gaze.dy * toFocal.dy) * (0.65 + clamp(focal.contrastScore, 0, 1) * 0.35);
    if (score > bestScore) {
      bestScore = score;
      best = focal;
    }
  }
  return best;
}

function buildHeatmap(
  w: number,
  h: number,
  cols: number,
  rows: number,
  nodes: readonly SaccadeNode[],
  segments: readonly SaccadeSegment[],
  threshold: number,
): EyeFlowHeatmap {
  const safeW = Math.max(1, w);
  const safeH = Math.max(1, h);
  const safeCols = Math.max(4, Math.floor(cols));
  const safeRows = Math.max(4, Math.floor(rows));
  const raw = new Float32Array(safeCols * safeRows);
  const twoSigmaSq = 2 * 1.35 * 1.35;

  // 고정 체류 지점을 2D 가우시안 커널로 누적한다.
  for (const node of nodes) {
    const gx = clamp((node.x / safeW) * safeCols, 0, safeCols - 0.001);
    const gy = clamp((node.y / safeH) * safeRows, 0, safeRows - 0.001);
    const weight = (node.dwellMs / 500) * clamp(node.saliencyWeight, 0.25, 1.5);
    for (let r = Math.max(0, Math.floor(gy - 3)); r <= Math.min(safeRows - 1, Math.ceil(gy + 3)); r += 1) {
      for (let c = Math.max(0, Math.floor(gx - 3)); c <= Math.min(safeCols - 1, Math.ceil(gx + 3)); c += 1) {
        const idx = r * safeCols + c;
        raw[idx] = (raw[idx] ?? 0) + weight * Math.exp(-((c + 0.5 - gx) ** 2 + (r + 0.5 - gy) ** 2) / twoSigmaSq);
      }
    }
  }

  // 역주행 구간은 시선 혼선 정체를 가중 반영한다.
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (const seg of segments) {
    if (!seg.isBacktrack) continue;
    const a = nodeById.get(seg.fromId);
    const b = nodeById.get(seg.toId);
    if (a === undefined || b === undefined) continue;
    for (let s = 1; s < 6; s += 1) {
      const t = s / 6;
      const col = clamp(Math.floor(((a.x + (b.x - a.x) * t) / safeW) * safeCols), 0, safeCols - 1);
      const row = clamp(Math.floor(((a.y + (b.y - a.y) * t) / safeH) * safeRows), 0, safeRows - 1);
      const idx = row * safeCols + col;
      raw[idx] = (raw[idx] ?? 0) + 0.35;
    }
  }

  let rawMax = 0;
  for (let i = 0; i < raw.length; i += 1) rawMax = Math.max(rawMax, raw[i] ?? 0);

  const values = new Float32Array(raw.length);
  const congestionZones: CongestionZone[] = [];
  if (rawMax > 1e-6) {
    const cellW = safeW / safeCols;
    const cellH = safeH / safeRows;
    for (let r = 0; r < safeRows; r += 1) {
      for (let c = 0; c < safeCols; c += 1) {
        const idx = r * safeCols + c;
        const rawVal = raw[idx] ?? 0;
        const normVal = clamp(rawVal / rawMax, 0, 1);
        values[idx] = normVal;
        if (normVal >= threshold && rawVal >= 1.35) {
          congestionZones.push({
            col: c, row: r, centerX: round2((c + 0.5) * cellW), centerY: round2((r + 0.5) * cellH),
            normalizedIntensity: round2(normVal), rawDwellDensity: round2(rawVal),
          });
        }
      }
    }
  }
  return { cols: safeCols, rows: safeRows, values, rawMaxDensity: round2(rawMax), congestionZones };
}

/**
 * 컷 내부 말풍선·캐릭터 시선·행동선 포컬 포인트를 통합해 독자 시선 동선과 정체 히트맵을 시뮬레이션한다.
 */
export function simulatePanelEyeFlow(input: PanelEyeFlowInput): PanelEyeFlowReport {
  const readingDirection: ReadingDirection = input.readingDirection ?? "ltr";
  const anchors = input.characterAnchors ?? [];
  const focals = input.actionFocals ?? [];
  const anchorById = new Map(anchors.map((a) => [a.id, a]));
  const sortedBalloons = [...input.balloons].sort((a, b) =>
    a.readingOrder !== b.readingOrder
      ? a.readingOrder - b.readingOrder
      : a.y !== b.y
        ? a.y - b.y
        : readingDirection === "ltr" ? a.x - b.x : b.x - a.x,
  );

  const nodes: SaccadeNode[] = [];
  const visited = new Set<string>();
  const speakerFlows: SpeakerFlowEvaluation[] = [];
  const backtrackErrors: BacktrackError[] = [];

  for (const b of sortedBalloons) {
    const center = balloonCenter(b);
    const tail = b.tailTarget ? normalizeVec(b.tailTarget.x - center.x, b.tailTarget.y - center.y) : { dx: 0, dy: 0, len: 0 };
    nodes.push({
      id: b.id, kind: "speech-balloon", x: round2(center.x), y: round2(center.y), dwellMs: balloonDwellMs(b),
      saliencyWeight: b.emphasis === "shout" ? 1.15 : 0.95, vectorDx: round2(tail.dx), vectorDy: round2(tail.dy),
    });
    visited.add(b.id);

    const speaker = b.speakerAnchorId !== undefined ? anchorById.get(b.speakerAnchorId) : undefined;
    if (speaker !== undefined) {
      const flow = evaluateSpeakerFlow(b, speaker);
      speakerFlows.push(flow);
      if (!flow.isNaturalFlow) {
        const upward = flow.dy < -SPEAKER_UPWARD_DETOUR_PX;
        backtrackErrors.push({
          kind: "speaker-detour", severity: upward ? "critical" : "warning",
          fromNodeId: b.id, toNodeId: speaker.id, dx: round2(speaker.x - center.x), dy: flow.dy,
          penalty: upward ? 14 : 8,
          messageKo: `말풍선(${b.id})에서 화자(${speaker.id})로 시선이 거슬러 올라가거나 멀리 우회합니다.`,
        });
      }
      if (!visited.has(speaker.id)) {
        nodes.push(toAnchorNode(speaker, 260));
        visited.add(speaker.id);
        const gazeTarget = findGazeTargetFocal(speaker, focals, visited);
        if (gazeTarget !== undefined) {
          nodes.push(toFocalNode(gazeTarget));
          visited.add(gazeTarget.id);
        }
      }
    }
  }

  // 잔여 캐릭터·행동선 포컬을 상→하 순서로 편입한다.
  nodes.push(
    ...[
      ...anchors.filter((a) => !visited.has(a.id)).map((a) => toAnchorNode(a, 250)),
      ...focals.filter((f) => !visited.has(f.id)).map((f) => toFocalNode(f)),
    ].sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x)),
  );

  // 연속 말풍선 간 읽기 순서 역주행(상향·방향 역행)을 점검한다.
  for (let i = 1; i < sortedBalloons.length; i += 1) {
    const prev = sortedBalloons[i - 1];
    const curr = sortedBalloons[i];
    if (prev === undefined || curr === undefined) continue;
    const prevC = balloonCenter(prev);
    const currC = balloonCenter(curr);
    const dx = round2(currC.x - prevC.x);
    const dy = round2(currC.y - prevC.y);
    if (dy < -VERTICAL_BALLOON_BACKTRACK_PX) {
      backtrackErrors.push({
        kind: "vertical-upward", severity: dy < -70 ? "critical" : "warning",
        fromNodeId: prev.id, toNodeId: curr.id, dx, dy, penalty: dy < -70 ? 22 : 14,
        messageKo: `말풍선(${prev.id}→${curr.id})이 아래에서 위로 ${Math.abs(Math.round(dy))}px 역주행합니다.`,
      });
    } else if (Math.abs(dy) <= HORIZONTAL_ROW_BAND_PX) {
      const against = readingDirection === "ltr" ? dx < -HORIZONTAL_BACKTRACK_PX : dx > HORIZONTAL_BACKTRACK_PX;
      if (against) {
        backtrackErrors.push({
          kind: "horizontal-against-reading", severity: Math.abs(dx) > 100 ? "critical" : "warning",
          fromNodeId: prev.id, toNodeId: curr.id, dx, dy, penalty: Math.abs(dx) > 100 ? 18 : 11,
          messageKo: `같은 높이의 말풍선(${prev.id}→${curr.id}) 배치가 읽기 방향(${readingDirection.toUpperCase()})과 어긋납니다.`,
        });
      }
    }
  }

  // 전체 도약 경로 세그먼트와 캐릭터 시선 벡터 충돌을 계산한다.
  const segments: SaccadeSegment[] = [];
  let totalDistance = 0;
  for (let i = 1; i < nodes.length; i += 1) {
    const prev = nodes[i - 1];
    const curr = nodes[i];
    if (prev === undefined || curr === undefined) continue;
    const dx = round2(curr.x - prev.x);
    const dy = round2(curr.y - prev.y);
    const dir = normalizeVec(dx, dy);
    const dist = round2(dir.len);
    totalDistance += dist;
    const hasVec = Math.hypot(prev.vectorDx, prev.vectorDy) > 0.1 && dir.len > 1;
    const align = hasVec ? round2(clamp(prev.vectorDx * dir.dx + prev.vectorDy * dir.dy, -1, 1)) : 0;
    const upwardVisual = prev.kind !== "speech-balloon" && dy < -VERTICAL_VISUAL_BACKTRACK_PX;
    const gazeConflict = prev.kind === "character-gaze" && hasVec && align < -0.45 && dist >= 45;
    if (gazeConflict) {
      backtrackErrors.push({
        kind: "gaze-conflict", severity: "warning", fromNodeId: prev.id, toNodeId: curr.id, dx, dy, penalty: 10,
        messageKo: `캐릭터(${prev.id})의 시선 방향이 다음 주목 지점(${curr.id})과 반대 방향을 향합니다.`,
      });
    }
    const isBacktrack =
      upwardVisual || gazeConflict || backtrackErrors.some((e) => e.fromNodeId === prev.id && e.toNodeId === curr.id);
    segments.push({
      fromId: prev.id, toId: curr.id, fromKind: prev.kind, toKind: curr.kind, dx, dy,
      distancePx: dist, saccadeDurationMs: round2(22 + 0.045 * dist), gazeAlignmentScore: align, isBacktrack,
    });
  }

  const heatmap = buildHeatmap(
    input.widthPx, input.heightPx, input.heatmapCols ?? DEFAULT_HEATMAP_COLS,
    input.heatmapRows ?? DEFAULT_HEATMAP_ROWS, nodes, segments,
    input.congestionThreshold ?? DEFAULT_CONGESTION_THRESHOLD,
  );
  const totalDwellMs = nodes.reduce((acc, n) => acc + n.dwellMs, 0);
  const backtrackPenalty = backtrackErrors.reduce((acc, e) => acc + e.penalty, 0);
  const congestionPenalty = Math.min(20, Math.max(0, heatmap.congestionZones.length - 2) * 3.5);
  const zigzagPenalty = Math.max(0, (totalDistance / Math.max(input.heightPx, 120) - 1.85) * 9);
  const naturalRate =
    speakerFlows.length > 0 ? round2(speakerFlows.filter((f) => f.isNaturalFlow).length / speakerFlows.length) : 1;
  const smoothness = round2(clamp(100 - backtrackPenalty - congestionPenalty - zigzagPenalty, 0, 100));
  const frictionRatio = round2(clamp((100 - smoothness) / 100, 0, 1));
  const summaryKo =
    backtrackErrors.length === 0 && heatmap.congestionZones.length <= 2
      ? `컷(${input.panelId}) 시선 동선이 자연스럽습니다(매끄러움 ${smoothness}점).`
      : `컷(${input.panelId})에서 역주행 ${backtrackErrors.length}건, 정체 구역 ${heatmap.congestionZones.length}곳이 확인되었습니다(매끄러움 ${smoothness}점).`;

  return {
    panelId: input.panelId, readingDirection, nodes, segments, backtrackErrors, speakerFlows,
    naturalSpeakerLinkRate: naturalRate, totalSaccadeDistancePx: round2(totalDistance), totalDwellMs,
    flowSmoothnessScore: smoothness, frictionRatio, heatmap, summaryKo,
  };
}
