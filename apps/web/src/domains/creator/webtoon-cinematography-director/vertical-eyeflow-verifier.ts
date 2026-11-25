/**
 * Wave 41C — 세로 스크롤 웹툰 Z/S-커브 시선 유도(Eye-Flow) 검증 및 말풍선·여백(Gutter) 처방 엔진.
 *
 * - 연속 컷 말풍선·인물 시선·액션 궤적 연결 경로 분석 (`analyzeVerticalEyeFlow`)
 * - 역주행(아래→위 역방향 점프) · 좌우 급격한 핑퐁 피로 · 시선 막힘(Dead Trap) 자동 탐지
 * - 말풍선 앵커 최적 이동량(dx, dy) 및 컷 여백(Gutter) 리듬 처방 + 원클릭 자동 보정(`applyEyeFlowPrescriptions`)
 */

export type EyeFlowNodeKind = "speech-balloon" | "character-gaze" | "action-vector" | "sfx-anchor";
export type PanelPacingIntent = "fast-action" | "dialogue-rhythm" | "emotional-pause" | "cliffhanger-reveal";
export type EyeFlowDefectKind = "reverse-backtrack" | "ping-pong-fatigue" | "dead-trap";
export type EyeFlowSeverity = "critical" | "warning";
export type EyeFlowCurvePattern = "smooth-s-curve" | "classic-z-curve" | "vertical-spine" | "chaotic-zigzag" | "stalled-backtrack";
export type EyeFlowGrade = "optimal" | "readable" | "fatiguing" | "broken";
export type GutterStatus = "optimal" | "too-tight" | "too-wide";

export interface Vector2D { readonly dx: number; readonly dy: number }

export interface EyeFlowNode {
  readonly id: string;
  readonly kind: EyeFlowNodeKind;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly x: number;
  readonly y: number;
  readonly readingOrder: number;
  readonly gazeVector?: Vector2D;
  readonly textLength?: number;
}

export interface WebtoonPanelSpec {
  readonly panelId: string;
  readonly order: number;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly width: number;
  readonly height: number;
  readonly gutterAfterPx: number;
  readonly pacingIntent: PanelPacingIntent;
  readonly nodes: readonly EyeFlowNode[];
}

export interface VerticalStripInput {
  readonly stripId: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly stripWidthPx: number;
  readonly panels: readonly WebtoonPanelSpec[];
}

export interface ResolvedPanelLayout {
  readonly panelId: string;
  readonly order: number;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly topY: number;
  readonly width: number;
  readonly height: number;
  readonly gutterAfterPx: number;
  readonly pacingIntent: PanelPacingIntent;
}

export interface EyeFlowPathPoint {
  readonly nodeId: string;
  readonly panelId: string;
  readonly panelIndex: number;
  readonly stepIndex: number;
  readonly kind: EyeFlowNodeKind;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly localX: number;
  readonly localY: number;
  readonly globalX: number;
  readonly globalY: number;
  readonly panelTopY: number;
  readonly panelWidth: number;
  readonly panelHeight: number;
  readonly gazeVector?: Vector2D;
  readonly textLength: number;
}

export interface EyeFlowSegmentMetric {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly fromPanelId: string;
  readonly toPanelId: string;
  readonly dx: number;
  readonly dy: number;
  readonly distancePx: number;
  readonly horizontalSpanRatio: number;
  readonly isReverseBacktrack: boolean;
  readonly isPingPongRisk: boolean;
  readonly isDeadTrapLink: boolean;
}

export interface EyeFlowDefect {
  readonly defectId: string;
  readonly kind: EyeFlowDefectKind;
  readonly severity: EyeFlowSeverity;
  readonly panelId: string;
  readonly nodeId: string;
  readonly relatedNodeId?: string;
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface BalloonAnchorPrescription {
  readonly nodeId: string;
  readonly panelId: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly issueKind: EyeFlowDefectKind;
  readonly currentLocal: { readonly x: number; readonly y: number };
  readonly dx: number;
  readonly dy: number;
  readonly targetLocal: { readonly x: number; readonly y: number };
  readonly recommendedGazeVector?: Vector2D;
  readonly reasonKo: string;
  readonly reasonEn: string;
}

export interface GutterPrescription {
  readonly panelId: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly pacingIntent: PanelPacingIntent;
  readonly currentGutterPx: number;
  readonly recommendedGutterPx: number;
  readonly idealRangePx: readonly [number, number];
  readonly deltaPx: number;
  readonly status: GutterStatus;
  readonly reasonKo: string;
  readonly reasonEn: string;
}

export interface VerticalEyeFlowReport {
  readonly stripId: string;
  readonly stripWidthPx: number;
  readonly totalHeightPx: number;
  readonly panels: readonly ResolvedPanelLayout[];
  readonly pathPoints: readonly EyeFlowPathPoint[];
  readonly segments: readonly EyeFlowSegmentMetric[];
  readonly defects: readonly EyeFlowDefect[];
  readonly anchorPrescriptions: readonly BalloonAnchorPrescription[];
  readonly gutterPrescriptions: readonly GutterPrescription[];
  readonly curvePattern: EyeFlowCurvePattern;
  readonly flowScore: number;
  readonly grade: EyeFlowGrade;
  readonly reverseJumpCount: number;
  readonly pingPongCount: number;
  readonly deadTrapCount: number;
  readonly gutterIssueCount: number;
  readonly horizontalTravelRatio: number;
  readonly estimatedReadSeconds: number;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface GutterPacingRule {
  readonly minPx: number;
  readonly maxPx: number;
  readonly idealPx: number;
  readonly labelKo: string;
  readonly labelEn: string;
}

export const GUTTER_PACING_RULES: Readonly<Record<PanelPacingIntent, GutterPacingRule>> = {
  "fast-action": { minPx: 32, maxPx: 72, idealPx: 48, labelKo: "고속 액션", labelEn: "Fast Action" },
  "dialogue-rhythm": { minPx: 64, maxPx: 120, idealPx: 88, labelKo: "대화 템포", labelEn: "Dialogue Rhythm" },
  "emotional-pause": { minPx: 140, maxPx: 240, idealPx: 180, labelKo: "감정 여운", labelEn: "Emotional Pause" },
  "cliffhanger-reveal": { minPx: 220, maxPx: 360, idealPx: 280, labelKo: "반전 · 클리프행어", labelEn: "Cliffhanger Reveal" },
};

const VERTICAL_BACKTRACK_TOLERANCE_PX = 12;
const MIN_SAFE_MARGIN_X_RATIO = 0.14;
const MAX_SAFE_MARGIN_X_RATIO = 0.86;
const MIN_SAFE_MARGIN_Y_PX = 42;

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function roundTo(value: number, decimals: number = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeVector2D(v: Vector2D): Vector2D {
  const len = Math.hypot(v.dx, v.dy);
  return len <= 1e-6 ? { dx: 0, dy: 1 } : { dx: v.dx / len, dy: v.dy / len };
}

/** 세로 스크롤 웹툰 연속 컷의 시선 유도(Z/S-커브)·역주행·핑퐁·시선 막힘·여백 리듬 종합 분석. */
export function analyzeVerticalEyeFlow(strip: VerticalStripInput): VerticalEyeFlowReport {
  const stripWidthPx = Math.max(320, strip.stripWidthPx);
  const sortedPanels = [...strip.panels].sort((a, b) => a.order - b.order);

  const resolvedPanels: ResolvedPanelLayout[] = [];
  const pathPoints: EyeFlowPathPoint[] = [];

  let cursorY = 0;
  for (let pIdx = 0; pIdx < sortedPanels.length; pIdx += 1) {
    const panel = sortedPanels[pIdx];
    if (!panel) continue;
    const width = Math.max(320, panel.width || stripWidthPx);
    const height = Math.max(180, panel.height);
    const gutter = Math.max(0, panel.gutterAfterPx);

    resolvedPanels.push({
      panelId: panel.panelId, order: panel.order, titleKo: panel.titleKo, titleEn: panel.titleEn,
      topY: cursorY, width, height, gutterAfterPx: gutter, pacingIntent: panel.pacingIntent,
    });

    const sortedNodes = [...panel.nodes].sort((a, b) => a.readingOrder - b.readingOrder);
    for (const node of sortedNodes) {
      pathPoints.push({
        nodeId: node.id, panelId: panel.panelId, panelIndex: pIdx, stepIndex: pathPoints.length,
        kind: node.kind, labelKo: node.labelKo, labelEn: node.labelEn,
        localX: roundTo(node.x, 1), localY: roundTo(node.y, 1),
        globalX: roundTo(node.x, 1), globalY: roundTo(cursorY + node.y, 1),
        panelTopY: cursorY, panelWidth: width, panelHeight: height,
        gazeVector: node.gazeVector, textLength: Math.max(0, node.textLength ?? 0),
      });
    }
    cursorY += height + (pIdx < sortedPanels.length - 1 ? gutter : 0);
  }

  const totalHeightPx = Math.max(300, cursorY);
  const defects: EyeFlowDefect[] = [];
  const prescriptionMap = new Map<string, BalloonAnchorPrescription>();
  const segments: EyeFlowSegmentMetric[] = [];

  const upsertPrescription = (next: BalloonAnchorPrescription): void => {
    const existing = prescriptionMap.get(next.nodeId);
    if (!existing) { prescriptionMap.set(next.nodeId, next); return; }
    const mergedX = clamp(existing.currentLocal.x + existing.dx + next.dx, stripWidthPx * MIN_SAFE_MARGIN_X_RATIO, stripWidthPx * MAX_SAFE_MARGIN_X_RATIO);
    const mergedY = clamp(existing.currentLocal.y + existing.dy + next.dy, MIN_SAFE_MARGIN_Y_PX, Math.max(MIN_SAFE_MARGIN_Y_PX + 20, existing.targetLocal.y));
    prescriptionMap.set(next.nodeId, {
      ...existing,
      dx: roundTo(mergedX - existing.currentLocal.x, 1),
      dy: roundTo(mergedY - existing.currentLocal.y, 1),
      targetLocal: { x: roundTo(mergedX, 1), y: roundTo(mergedY, 1) },
      recommendedGazeVector: next.recommendedGazeVector ?? existing.recommendedGazeVector,
    });
  };

  let reverseJumpCount = 0;
  let pingPongCount = 0;
  let deadTrapCount = 0;
  let totalHorizontalTravel = 0;
  let totalVerticalTravel = 0;
  let horizontalSignChanges = 0;
  let prevSignificantDx = 0;

  for (let i = 0; i < pathPoints.length; i += 1) {
    const curr = pathPoints[i];
    if (!curr) continue;
    const next = pathPoints[i + 1];

    if (i > 0) {
      const prev = pathPoints[i - 1];
      if (prev) {
        const dx = curr.globalX - prev.globalX;
        const dy = curr.globalY - prev.globalY;
        const dist = Math.hypot(dx, dy);
        const spanRatio = Math.abs(dx) / stripWidthPx;
        totalHorizontalTravel += Math.abs(dx);
        totalVerticalTravel += Math.abs(dy);

        const isReverseBacktrack = dy < -VERTICAL_BACKTRACK_TOLERANCE_PX;
        let isPingPongRisk = false;

        if (isReverseBacktrack) {
          reverseJumpCount += 1;
          const upwardPx = Math.round(Math.abs(dy));
          defects.push({
            defectId: `rev-${prev.nodeId}-${curr.nodeId}`,
            kind: "reverse-backtrack",
            severity: upwardPx >= 45 ? "critical" : "warning",
            panelId: curr.panelId, nodeId: curr.nodeId, relatedNodeId: prev.nodeId,
            messageKo: `시선 역주행 감지: "${prev.labelKo}" → "${curr.labelKo}" 구간에서 독자 시선이 위쪽으로 ${upwardPx}px 역점프합니다.`,
            messageEn: `Reverse eye-flow jump: "${prev.labelEn}" → "${curr.labelEn}" forces an upward ${upwardPx}px backtrack.`,
          });

          const safeTargetY = clamp(
            curr.panelId === prev.panelId ? prev.localY + 62 : Math.max(MIN_SAFE_MARGIN_Y_PX, curr.localY + upwardPx + 48),
            MIN_SAFE_MARGIN_Y_PX,
            Math.max(MIN_SAFE_MARGIN_Y_PX + 20, curr.panelHeight - MIN_SAFE_MARGIN_Y_PX),
          );
          const dyFix = roundTo(safeTargetY - curr.localY, 1);
          upsertPrescription({
            nodeId: curr.nodeId, panelId: curr.panelId, labelKo: curr.labelKo, labelEn: curr.labelEn,
            issueKind: "reverse-backtrack", currentLocal: { x: curr.localX, y: curr.localY },
            dx: 0, dy: dyFix, targetLocal: { x: curr.localX, y: roundTo(safeTargetY, 1) },
            reasonKo: `역방향 시선 점프(${upwardPx}px)를 해소하기 위해 말풍선을 아래쪽으로 ${dyFix >= 0 ? `+${dyFix}` : dyFix}px 재배치합니다.`,
            reasonEn: `Shift anchor vertically by ${dyFix >= 0 ? `+${dyFix}` : dyFix}px to eliminate the ${upwardPx}px upward backtrack.`,
          });
        }

        if (Math.abs(dx) >= stripWidthPx * 0.16) {
          if (prevSignificantDx !== 0 && Math.sign(dx) !== Math.sign(prevSignificantDx)) horizontalSignChanges += 1;
          const alternatingWideSwing =
            prevSignificantDx !== 0 && Math.sign(dx) !== Math.sign(prevSignificantDx) &&
            spanRatio >= 0.48 && (dy < 170 || Math.abs(dx) / Math.max(24, Math.abs(dy)) >= 2.0);
          const singleExtremeWhip = curr.panelId === prev.panelId && spanRatio >= 0.62 && Math.abs(dy) < 75;

          if (alternatingWideSwing || singleExtremeWhip) {
            isPingPongRisk = true;
            pingPongCount += 1;
            const swingPct = Math.round(spanRatio * 100);
            defects.push({
              defectId: `pingpong-${prev.nodeId}-${curr.nodeId}`,
              kind: "ping-pong-fatigue",
              severity: spanRatio >= 0.6 ? "critical" : "warning",
              panelId: curr.panelId, nodeId: curr.nodeId, relatedNodeId: prev.nodeId,
              messageKo: `좌우 핑퐁 피로: "${prev.labelKo}" → "${curr.labelKo}" 수평 이동이 폭의 ${swingPct}%로 급격해 눈의 왕복 피로를 유발합니다.`,
              messageEn: `Horizontal ping-pong fatigue: ${swingPct}% strip-width whip from "${prev.labelEn}" to "${curr.labelEn}".`,
            });

            const corridorTargetX = curr.localX > curr.panelWidth * 0.5 ? curr.panelWidth * 0.66 : curr.panelWidth * 0.34;
            const dxFix = roundTo(corridorTargetX - curr.localX, 1);
            const dyLift = curr.panelId === prev.panelId && dy >= 0 && dy < 72
              ? roundTo(clamp(curr.localY + (78 - dy), MIN_SAFE_MARGIN_Y_PX, curr.panelHeight - MIN_SAFE_MARGIN_Y_PX) - curr.localY, 1)
              : 0;
            upsertPrescription({
              nodeId: curr.nodeId, panelId: curr.panelId, labelKo: curr.labelKo, labelEn: curr.labelEn,
              issueKind: "ping-pong-fatigue", currentLocal: { x: curr.localX, y: curr.localY },
              dx: dxFix, dy: dyLift, targetLocal: { x: roundTo(curr.localX + dxFix, 1), y: roundTo(curr.localY + dyLift, 1) },
              reasonKo: `급격한 좌우 왕복을 완만한 S-커브 통로로 완화하기 위해 dx=${dxFix}px, dy=${dyLift}px 이동을 처방합니다.`,
              reasonEn: `Pull anchor into S-curve corridor (dx=${dxFix}px, dy=${dyLift}px) to reduce ping-pong fatigue.`,
            });
          }
          prevSignificantDx = dx;
        }

        segments.push({
          fromNodeId: prev.nodeId, toNodeId: curr.nodeId, fromPanelId: prev.panelId, toPanelId: curr.panelId,
          dx: roundTo(dx, 1), dy: roundTo(dy, 1), distancePx: roundTo(dist, 1),
          horizontalSpanRatio: roundTo(spanRatio, 3), isReverseBacktrack, isPingPongRisk, isDeadTrapLink: false,
        });
      }
    }

    let nodeTrapped = false;
    if (curr.gazeVector && next) {
      const gazeHat = normalizeVector2D(curr.gazeVector);
      const toNextHat = normalizeVector2D({ dx: next.globalX - curr.globalX, dy: next.globalY - curr.globalY });
      const alignment = gazeHat.dx * toNextHat.dx + gazeHat.dy * toNextHat.dy;
      const wallClash =
        (curr.localX < curr.panelWidth * 0.24 && gazeHat.dx < -0.58) ||
        (curr.localX > curr.panelWidth * 0.76 && gazeHat.dx > 0.58);
      const upwardTrap = gazeHat.dy < -0.42;

      if (alignment < -0.22 || wallClash || upwardTrap) {
        nodeTrapped = true;
        deadTrapCount += 1;
        defects.push({
          defectId: `trap-gaze-${curr.nodeId}`,
          kind: "dead-trap",
          severity: alignment < -0.48 || upwardTrap ? "critical" : "warning",
          panelId: curr.panelId, nodeId: curr.nodeId, relatedNodeId: next.nodeId,
          messageKo: `시선 막힘(Dead Trap): "${curr.labelKo}"의 시선·액션 방향이 다음 앵커("${next.labelKo}")와 반대이거나 닫힌 여백 벽을 향합니다.`,
          messageEn: `Eye-flow dead trap: "${curr.labelEn}" gaze/action vector points away from "${next.labelEn}" or into a closed edge.`,
        });
        const safeCenterX = clamp(curr.localX, curr.panelWidth * 0.25, curr.panelWidth * 0.75);
        const dxFix = roundTo(safeCenterX - curr.localX, 1);
        const desiredGaze = normalizeVector2D({ dx: next.globalX - (curr.globalX + dxFix), dy: Math.max(40, next.globalY - curr.globalY) });
        upsertPrescription({
          nodeId: curr.nodeId, panelId: curr.panelId, labelKo: curr.labelKo, labelEn: curr.labelEn,
          issueKind: "dead-trap", currentLocal: { x: curr.localX, y: curr.localY },
          dx: dxFix, dy: 0, targetLocal: { x: roundTo(safeCenterX, 1), y: curr.localY },
          recommendedGazeVector: { dx: roundTo(desiredGaze.dx, 2), dy: roundTo(desiredGaze.dy, 2) },
          reasonKo: `시선·액션 출구를 다음 앵커 방향(${roundTo(desiredGaze.dx, 2)}, ${roundTo(desiredGaze.dy, 2)})으로 열고 안쪽 여백으로 보정합니다.`,
          reasonEn: `Redirect gaze/action exit toward next anchor (${roundTo(desiredGaze.dx, 2)}, ${roundTo(desiredGaze.dy, 2)}).`,
        });
      }
    }

    if (!nodeTrapped && (curr.localX < curr.panelWidth * 0.09 || curr.localX > curr.panelWidth * 0.91 || curr.localY > curr.panelHeight - 26)) {
      deadTrapCount += 1;
      defects.push({
        defectId: `trap-margin-${curr.nodeId}`,
        kind: "dead-trap", severity: "warning", panelId: curr.panelId, nodeId: curr.nodeId,
        messageKo: `모서리 시선 막힘: "${curr.labelKo}"가 컷 경계 끝단에 밀착해 다음 컷으로의 시선 탈출을 가로막습니다.`,
        messageEn: `Edge dead trap: "${curr.labelEn}" is pinned against the panel border, blocking clean exit flow.`,
      });
      const targetX = clamp(curr.localX, curr.panelWidth * 0.2, curr.panelWidth * 0.8);
      const targetY = clamp(curr.localY, MIN_SAFE_MARGIN_Y_PX, curr.panelHeight - MIN_SAFE_MARGIN_Y_PX);
      upsertPrescription({
        nodeId: curr.nodeId, panelId: curr.panelId, labelKo: curr.labelKo, labelEn: curr.labelEn,
        issueKind: "dead-trap", currentLocal: { x: curr.localX, y: curr.localY },
        dx: roundTo(targetX - curr.localX, 1), dy: roundTo(targetY - curr.localY, 1),
        targetLocal: { x: roundTo(targetX, 1), y: roundTo(targetY, 1) },
        reasonKo: `컷 외곽선 밀착을 풀어 안쪽 안전 통로(dx=${roundTo(targetX - curr.localX, 1)}px, dy=${roundTo(targetY - curr.localY, 1)}px)로 이동합니다.`,
        reasonEn: `Pull trapped margin anchor inward (dx=${roundTo(targetX - curr.localX, 1)}px, dy=${roundTo(targetY - curr.localY, 1)}px).`,
      });
    }
  }

  const deadTrapNodeIds = new Set(defects.filter((d) => d.kind === "dead-trap").map((d) => d.nodeId));
  const annotatedSegments: readonly EyeFlowSegmentMetric[] = segments.map((seg) =>
    deadTrapNodeIds.has(seg.fromNodeId) ? { ...seg, isDeadTrapLink: true } : seg,
  );

  const gutterPrescriptions: GutterPrescription[] = [];
  let gutterIssueCount = 0;
  for (let pIdx = 0; pIdx < resolvedPanels.length - 1; pIdx += 1) {
    const p = resolvedPanels[pIdx];
    if (!p) continue;
    const rule = GUTTER_PACING_RULES[p.pacingIntent];
    const status: GutterStatus = p.gutterAfterPx < rule.minPx ? "too-tight" : p.gutterAfterPx > rule.maxPx ? "too-wide" : "optimal";
    const recommended = status === "optimal" ? p.gutterAfterPx : rule.idealPx;
    if (status !== "optimal") gutterIssueCount += 1;
    const deltaPx = recommended - p.gutterAfterPx;
    gutterPrescriptions.push({
      panelId: p.panelId, titleKo: p.titleKo, titleEn: p.titleEn, pacingIntent: p.pacingIntent,
      currentGutterPx: p.gutterAfterPx, recommendedGutterPx: recommended, idealRangePx: [rule.minPx, rule.maxPx],
      deltaPx, status,
      reasonKo:
        status === "optimal"
          ? `${rule.labelKo} 의도에 맞는 적정 여백(${rule.minPx}~${rule.maxPx}px)입니다.`
          : status === "too-tight"
            ? `${rule.labelKo} 호흡 대비 여백(${p.gutterAfterPx}px)이 좁습니다. +${deltaPx}px 확장을 권장합니다.`
            : `${rule.labelKo} 템포 대비 여백(${p.gutterAfterPx}px)이 과도합니다. ${deltaPx}px 축소를 권장합니다.`,
      reasonEn:
        status === "optimal"
          ? `Gutter fits ${rule.labelEn} target (${rule.minPx}-${rule.maxPx}px).`
          : status === "too-tight"
            ? `Gutter (${p.gutterAfterPx}px) is too tight for ${rule.labelEn}; expand by +${deltaPx}px.`
            : `Gutter (${p.gutterAfterPx}px) is overly wide for ${rule.labelEn}; tighten by ${deltaPx}px.`,
    });
  }

  const horizontalTravelRatio = roundTo(totalHorizontalTravel / Math.max(1, totalVerticalTravel), 2);
  const totalChars = pathPoints.reduce((acc, p) => acc + p.textLength, 0);
  const estimatedReadSeconds = roundTo(pathPoints.length * 0.65 + totalChars * 0.08 + totalHeightPx / 1600, 1);

  const curvePattern: EyeFlowCurvePattern =
    reverseJumpCount > 0
      ? "stalled-backtrack"
      : pingPongCount >= 2 || horizontalTravelRatio > 1.35
        ? "chaotic-zigzag"
        : horizontalTravelRatio < 0.25
          ? "vertical-spine"
          : horizontalSignChanges >= 2
            ? "smooth-s-curve"
            : "classic-z-curve";

  const flowScore = clamp(Math.round(100 - reverseJumpCount * 24 - pingPongCount * 16 - deadTrapCount * 15 - gutterIssueCount * 7), 0, 100);
  const grade: EyeFlowGrade = flowScore >= 85 ? "optimal" : flowScore >= 68 ? "readable" : flowScore >= 45 ? "fatiguing" : "broken";
  const summaryKo =
    defects.length === 0 && gutterIssueCount === 0
      ? `세로 스크롤 시선이 막힘 없이 자연스러운 ${curvePattern === "smooth-s-curve" ? "S-커브" : "Z-커브"} 궤적을 형성합니다.`
      : `시선 결함 ${defects.length}건(역주행 ${reverseJumpCount} · 핑퐁 ${pingPongCount} · 막힘 ${deadTrapCount}) 및 여백 조정 ${gutterIssueCount}건이 감지되었습니다.`;
  const summaryEn =
    defects.length === 0 && gutterIssueCount === 0
      ? `Vertical eye-flow forms a clean ${curvePattern} trajectory with zero reader friction.`
      : `Detected ${defects.length} eye-flow defect(s) (${reverseJumpCount} reverse, ${pingPongCount} ping-pong, ${deadTrapCount} trap) and ${gutterIssueCount} gutter fix(es).`;

  return {
    stripId: strip.stripId, stripWidthPx, totalHeightPx, panels: resolvedPanels, pathPoints,
    segments: annotatedSegments, defects, anchorPrescriptions: Array.from(prescriptionMap.values()),
    gutterPrescriptions, curvePattern, flowScore, grade, reverseJumpCount, pingPongCount,
    deadTrapCount, gutterIssueCount, horizontalTravelRatio, estimatedReadSeconds, summaryKo, summaryEn,
  };
}

/** 진단 처방(말풍선 dx/dy · 시선 방향 · 컷 여백)을 불변 복사로 일괄 적용해 시선 흐름을 자동 치유한다. */
export function applyEyeFlowPrescriptions(
  strip: VerticalStripInput,
  providedReport?: VerticalEyeFlowReport,
): VerticalStripInput {
  const report = providedReport ?? analyzeVerticalEyeFlow(strip);
  const anchorById = new Map<string, BalloonAnchorPrescription>(report.anchorPrescriptions.map((p) => [p.nodeId, p]));
  const gutterByPanel = new Map<string, number>(report.gutterPrescriptions.map((g) => [g.panelId, g.recommendedGutterPx]));

  const nextPanels: WebtoonPanelSpec[] = strip.panels.map((panel) => {
    const safeMinX = panel.width * 0.27;
    const safeMaxX = panel.width * 0.73;
    const safeMaxY = Math.max(MIN_SAFE_MARGIN_Y_PX + 24, panel.height - MIN_SAFE_MARGIN_Y_PX);

    const sorted = [...panel.nodes].sort((a, b) => a.readingOrder - b.readingOrder);
    const updatedNodes: EyeFlowNode[] = [];
    let prevY = MIN_SAFE_MARGIN_Y_PX - 56;

    for (let idx = 0; idx < sorted.length; idx += 1) {
      const node = sorted[idx];
      if (!node) continue;
      const rx = anchorById.get(node.id);
      let nextX = clamp(rx ? rx.targetLocal.x : node.x, safeMinX, safeMaxX);
      let nextY = clamp(rx ? rx.targetLocal.y : node.y, MIN_SAFE_MARGIN_Y_PX, safeMaxY);
      if (idx > 0 && nextY < prevY + 56) nextY = clamp(prevY + 62, MIN_SAFE_MARGIN_Y_PX, safeMaxY);
      const prevNode = updatedNodes[idx - 1];
      if (prevNode && Math.abs(nextX - prevNode.x) > panel.width * 0.44) {
        nextX = clamp(prevNode.x + (nextX >= prevNode.x ? 1 : -1) * panel.width * 0.36, safeMinX, safeMaxX);
      }
      prevY = nextY;
      updatedNodes.push({
        ...node, x: roundTo(nextX, 1), y: roundTo(nextY, 1),
        gazeVector: rx?.recommendedGazeVector ?? node.gazeVector,
      });
    }

    return { ...panel, gutterAfterPx: gutterByPanel.get(panel.panelId) ?? panel.gutterAfterPx, nodes: updatedNodes };
  });

  const flatNodes: { readonly panelIdx: number; readonly nodeIdx: number; readonly gx: number; readonly gy: number }[] = [];
  let cursorY = 0;
  for (let pIdx = 0; pIdx < nextPanels.length; pIdx += 1) {
    const p = nextPanels[pIdx];
    if (!p) continue;
    for (let nIdx = 0; nIdx < p.nodes.length; nIdx += 1) {
      const n = p.nodes[nIdx];
      if (n) flatNodes.push({ panelIdx: pIdx, nodeIdx: nIdx, gx: n.x, gy: cursorY + n.y });
    }
    cursorY += p.height + (pIdx < nextPanels.length - 1 ? p.gutterAfterPx : 0);
  }

  for (let i = 0; i < flatNodes.length - 1; i += 1) {
    const curRef = flatNodes[i];
    const nxtRef = flatNodes[i + 1];
    if (!curRef || !nxtRef) continue;
    const panel = nextPanels[curRef.panelIdx];
    const node = panel?.nodes[curRef.nodeIdx];
    if (!panel || !node?.gazeVector) continue;

    const toNext = normalizeVector2D({ dx: nxtRef.gx - curRef.gx, dy: Math.max(30, nxtRef.gy - curRef.gy) });
    const curHat = normalizeVector2D(node.gazeVector);
    if (curHat.dx * toNext.dx + curHat.dy * toNext.dy < 0.25 || curHat.dy < -0.1) {
      nextPanels[curRef.panelIdx] = {
        ...panel,
        nodes: panel.nodes.map((n, idx) =>
          idx === curRef.nodeIdx ? { ...n, gazeVector: { dx: roundTo(toNext.dx, 2), dy: roundTo(toNext.dy, 2) } } : n,
        ),
      };
    }
  }

  return { ...strip, panels: nextPanels };
}

/** 전역 시선 앵커 점열로부터 부드러운 3차 베지어 SVG 경로 문자열(`M ... C ...`) 생성. */
export function buildEyeFlowSvgPath(points: readonly EyeFlowPathPoint[]): string {
  const first = points[0];
  if (!first) return "";
  if (points.length === 1) return `M ${first.globalX} ${first.globalY}`;

  const parts: string[] = [`M ${first.globalX} ${first.globalY}`];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    if (!p0 || !p1) continue;
    const dy = p1.globalY - p0.globalY;
    const tensionY = Math.abs(dy) * 0.42;
    const signY = dy >= 0 ? tensionY : -tensionY;
    parts.push(`C ${roundTo(p0.globalX, 1)} ${roundTo(p0.globalY + signY, 1)}, ${roundTo(p1.globalX, 1)} ${roundTo(p1.globalY - signY, 1)}, ${p1.globalX} ${p1.globalY}`);
  }
  return parts.join(" ");
}

/** 3종 세로 스크롤 웹툰 시선 흐름 검증 데모 콘티. */
export const DEMO_VERTICAL_STRIPS: readonly VerticalStripInput[] = [
  {
    stripId: "crisis-rooftop-strip",
    titleKo: "옥상 위기 · 결함 집중 진단 4컷",
    titleEn: "Rooftop Crisis (Multi-Defect Audit)",
    descriptionKo: "역주행 말풍선·좌우 핑퐁 피로·시선 벽 막힘·반전 여백 부족이 모두 포함된 진단 샘플입니다.",
    descriptionEn: "Diagnostic 4-panel strip featuring upward backtrack, ping-pong whip, gaze dead trap, and tight gutter.",
    stripWidthPx: 800,
    panels: [
      {
        panelId: "p1-establish", order: 1, titleKo: "1컷 · 옥상 난간 대치", titleEn: "Panel 1 · Rooftop Standoff",
        width: 800, height: 440, gutterAfterPx: 44, pacingIntent: "dialogue-rhythm",
        nodes: [
          { id: "n1-speech-a", kind: "speech-balloon", labelKo: "서진 대사 ①", labelEn: "Seojin Line 1", x: 190, y: 230, readingOrder: 1, textLength: 18 },
          { id: "n2-speech-reverse", kind: "speech-balloon", labelKo: "도윤 끼어들기 (역주행!)", labelEn: "Doyoon Interruption (Backtrack!)", x: 640, y: 120, readingOrder: 2, textLength: 14 },
        ],
      },
      {
        panelId: "p2-pingpong", order: 2, titleKo: "2컷 · 설전 좌우 핑퐁", titleEn: "Panel 2 · Rapid Debate Ping-Pong",
        width: 800, height: 420, gutterAfterPx: 70, pacingIntent: "emotional-pause",
        nodes: [
          { id: "n3-left-whip", kind: "speech-balloon", labelKo: "서진 반박 (좌측 급회전)", labelEn: "Seojin Retort (Far Left)", x: 110, y: 95, readingOrder: 3, textLength: 16 },
          { id: "n4-right-whip", kind: "speech-balloon", labelKo: "도윤 응수 (우측 핑퐁)", labelEn: "Doyoon Counter (Far Right)", x: 710, y: 150, readingOrder: 4, textLength: 15 },
        ],
      },
      {
        panelId: "p3-dead-trap", order: 3, titleKo: "3컷 · 닫힌 시선 벽 (Dead Trap)", titleEn: "Panel 3 · Outward Gaze Trap",
        width: 800, height: 400, gutterAfterPx: 80, pacingIntent: "cliffhanger-reveal",
        nodes: [
          { id: "n5-gaze-trap", kind: "character-gaze", labelKo: "도윤 시선 (우측 벽 충돌)", labelEn: "Doyoon Gaze (Wall Trap)", x: 680, y: 190, readingOrder: 5, gazeVector: { dx: 0.92, dy: -0.39 } },
        ],
      },
      {
        panelId: "p4-reveal", order: 4, titleKo: "4컷 · 반전 증거 공개", titleEn: "Panel 4 · Evidence Reveal",
        width: 800, height: 460, gutterAfterPx: 120, pacingIntent: "cliffhanger-reveal",
        nodes: [
          { id: "n6-sfx-impact", kind: "sfx-anchor", labelKo: "충격 효과음 · 단서 클로즈업", labelEn: "Impact SFX & Reveal", x: 380, y: 230, readingOrder: 6, textLength: 6 },
        ],
      },
    ],
  },
  {
    stripId: "smooth-romance-s-curve",
    titleKo: "카페 로맨스 · 정석 S-커브 4컷",
    titleEn: "Cafe Romance (Textbook S-Curve)",
    descriptionKo: "완만한 S-커브 말풍선 흐름과 감정 여운 여백이 조화를 이루는 모범 세로 스크롤 콘티입니다.",
    descriptionEn: "Fluid S-curve reading cadence with natural gaze handoffs and balanced emotional gutters.",
    stripWidthPx: 800,
    panels: [
      {
        panelId: "r1-open", order: 1, titleKo: "1컷 · 창가 첫 인사", titleEn: "Panel 1 · Window Greeting",
        width: 800, height: 420, gutterAfterPx: 92, pacingIntent: "dialogue-rhythm",
        nodes: [
          { id: "rn1-hello", kind: "speech-balloon", labelKo: "하나 첫 대사", labelEn: "Hana Opening Line", x: 240, y: 110, readingOrder: 1, textLength: 15 },
          { id: "rn2-gaze", kind: "character-gaze", labelKo: "하나 시선 유도", labelEn: "Hana Gaze Lead", x: 490, y: 280, readingOrder: 2, gazeVector: { dx: 0.25, dy: 0.96 } },
        ],
      },
      {
        panelId: "r2-reply", order: 2, titleKo: "2컷 · 민재의 미소", titleEn: "Panel 2 · Minjae Smile",
        width: 800, height: 420, gutterAfterPx: 176, pacingIntent: "emotional-pause",
        nodes: [
          { id: "rn3-reply", kind: "speech-balloon", labelKo: "민재 대답", labelEn: "Minjae Reply", x: 540, y: 120, readingOrder: 3, textLength: 18 },
          { id: "rn4-hand", kind: "action-vector", labelKo: "커피잔 건네는 동선", labelEn: "Passing Coffee Arc", x: 310, y: 295, readingOrder: 4, gazeVector: { dx: -0.18, dy: 0.98 } },
        ],
      },
      {
        panelId: "r3-pause", order: 3, titleKo: "3컷 · 고요한 눈맞춤", titleEn: "Panel 3 · Quiet Eye Contact",
        width: 800, height: 440, gutterAfterPx: 260, pacingIntent: "cliffhanger-reveal",
        nodes: [
          { id: "rn5-inner", kind: "speech-balloon", labelKo: "속마음 내레이션", labelEn: "Inner Monologue", x: 290, y: 180, readingOrder: 5, textLength: 22 },
        ],
      },
      {
        panelId: "r4-bloom", order: 4, titleKo: "4컷 · 고백 엔딩", titleEn: "Panel 4 · Confession Beat",
        width: 800, height: 460, gutterAfterPx: 120, pacingIntent: "emotional-pause",
        nodes: [
          { id: "rn6-end", kind: "speech-balloon", labelKo: "엔딩 핵심 대사", labelEn: "Closing Confession", x: 460, y: 240, readingOrder: 6, textLength: 16 },
        ],
      },
    ],
  },
  {
    stripId: "action-z-curve-rush",
    titleKo: "추격전 · 고속 Z-커브 액션 3컷",
    titleEn: "Chase Sequence (Fast Z-Curve)",
    descriptionKo: "짧은 액션 여백으로 속도를 끌어올리되 마지막 반전 직전 여백 부족을 점검하는 액션 콘티입니다.",
    descriptionEn: "High-tempo action Z-curve strip testing compact action gutters and cliffhanger pause.",
    stripWidthPx: 800,
    panels: [
      {
        panelId: "a1-dash", order: 1, titleKo: "1컷 · 질주 개시", titleEn: "Panel 1 · Dash Launch",
        width: 800, height: 380, gutterAfterPx: 48, pacingIntent: "fast-action",
        nodes: [
          { id: "an1-shout", kind: "speech-balloon", labelKo: "추격 외침", labelEn: "Pursuit Shout", x: 220, y: 95, readingOrder: 1, textLength: 9 },
          { id: "an2-slash", kind: "action-vector", labelKo: "대각선 도약 궤적", labelEn: "Diagonal Leap Vector", x: 540, y: 265, readingOrder: 2, gazeVector: { dx: -0.45, dy: 0.89 } },
        ],
      },
      {
        panelId: "a2-leap", order: 2, titleKo: "2컷 · 담장 착지 직전", titleEn: "Panel 2 · Wall Vault",
        width: 800, height: 400, gutterAfterPx: 95, pacingIntent: "cliffhanger-reveal",
        nodes: [
          { id: "an3-land", kind: "sfx-anchor", labelKo: "착지 굉음 효과음", labelEn: "Landing Impact SFX", x: 320, y: 160, readingOrder: 3, textLength: 5 },
          { id: "an4-gaze-down", kind: "character-gaze", labelKo: "아래쪽 추격 시선", labelEn: "Downward Gaze", x: 470, y: 300, readingOrder: 4, gazeVector: { dx: 0.12, dy: 0.99 } },
        ],
      },
      {
        panelId: "a3-corner", order: 3, titleKo: "3컷 · 막다른 골목 반전", titleEn: "Panel 3 · Dead-End Reveal",
        width: 800, height: 440, gutterAfterPx: 80, pacingIntent: "emotional-pause",
        nodes: [
          { id: "an5-twist", kind: "speech-balloon", labelKo: "반전 마지막 한마디", labelEn: "Final Twist Line", x: 420, y: 210, readingOrder: 5, textLength: 14 },
        ],
      },
    ],
  },
];
