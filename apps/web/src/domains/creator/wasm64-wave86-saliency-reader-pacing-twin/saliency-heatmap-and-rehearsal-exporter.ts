/**
 * Wave 86 — 비파괴 시선 현저성 열지도·스캔패스 오버레이 SVG 및 회차 리허설 스코어카드 익스포터.
 */

import {
  LOCAL_VISUAL_SALIENCY_PRIVACY_GUARANTEE,
  type BalloonGazeAuditResult,
  type PanelVisualSaliencyResult,
  type SpeechBalloonRegionInput,
  type VisualSaliencyPrivacyGuarantee,
} from "./visual-saliency-gaze-model";
import {
  PACING_TWIN_DISCLAIMER_KO,
  type EpisodeReaderPacingTwinResult,
} from "./reader-scroll-pacing-rehearsal-twin";

export type SaliencyOverlayPalette = "amber-forest" | "viridis-oklch";
export type RehearsalReadinessGrade = "출고 권장" | "일부 호흡 보정 권장" | "출고 전 연출 점검 필요";

export interface SaliencyOverlaySvgInput {
  readonly saliency: PanelVisualSaliencyResult;
  readonly audit?: BalloonGazeAuditResult;
  readonly speechBalloons?: readonly SpeechBalloonRegionInput[];
  readonly palette?: SaliencyOverlayPalette;
  readonly showSaccadeArrows?: boolean;
  readonly showBalloonBoxes?: boolean;
  readonly contourLevels?: readonly number[];
  readonly titleKo?: string;
}

export interface SaliencyOverlaySvgResult {
  readonly readerPiiCollected: false;
  readonly externalTelemetryUpload: false;
  readonly isSimulationEstimate: true;
  readonly privacy: VisualSaliencyPrivacyGuarantee;
  readonly palette: SaliencyOverlayPalette;
  readonly width: number;
  readonly height: number;
  readonly contourRingCount: number;
  readonly fixationNodeCount: number;
  readonly saccadeEdgeCount: number;
  readonly containsNaN: boolean;
  readonly svg: string;
}

export interface CutGazeAuditEntry {
  readonly cutId: string;
  readonly audit: BalloonGazeAuditResult;
}

export interface BuildPacingRehearsalReportInput {
  readonly pacing: EpisodeReaderPacingTwinResult;
  readonly cutGazeAudits?: readonly CutGazeAuditEntry[];
  readonly episodeTitleKo?: string;
}

export interface RehearsalPriorityAction {
  readonly priority: "high" | "medium" | "low";
  readonly category: "gaze-hijack" | "twist-whitespace" | "wall-of-text" | "rhythm-monotony" | "visual-overload";
  readonly cutId: string;
  readonly recommendedWhitespaceDeltaPx: number;
  readonly messageKo: string;
}

export interface RehearsalArchetypeSummary {
  readonly archetypeId: string;
  readonly labelKo: string;
  readonly totalReadTimeSec: number;
  readonly meanScrollVelocityPxPerSec: number;
  readonly peakFatigueRiskIndex: number;
  readonly estimatedDropOffRiskIndex: number;
}

export interface PacingRehearsalScorecard {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly generatedMode: "pre-export-local-rehearsal";
  readonly isSimulationEstimate: true;
  readonly readerPiiCollected: false;
  readonly externalTelemetryUpload: false;
  readonly disclaimerKo: string;
  readonly overallScore: number;
  readonly readinessGrade: RehearsalReadinessGrade;
  readonly metrics: {
    readonly gazeAlignmentScore: number;
    readonly suspensePacingScore: number;
    readonly readabilityComfortScore: number;
    readonly rhythmVarietyScore: number;
    readonly auditedCutCount: number;
    readonly hijackedCutCount: number;
    readonly abruptTwistCount: number;
    readonly wallOfTextCutCount: number;
  };
  readonly archetypeSummaries: readonly RehearsalArchetypeSummary[];
  readonly prioritizedActions: readonly RehearsalPriorityAction[];
  readonly summaryMarkdownKo: string;
}

interface OklchPaletteSpec {
  readonly contourFills: readonly string[];
  readonly contourStrokes: readonly string[];
  readonly saccadeStroke: string;
  readonly nodeFill: string;
  readonly nodeStroke: string;
  readonly nodeTextFill: string;
  readonly balloonStroke: string;
  readonly hijackStroke: string;
}

const OKLCH_PALETTES: Readonly<Record<SaliencyOverlayPalette, OklchPaletteSpec>> = {
  "amber-forest": {
    contourFills: ["oklch(0.45 0.08 160 / 0.14)", "oklch(0.62 0.12 135 / 0.18)", "oklch(0.76 0.15 82 / 0.24)", "oklch(0.66 0.19 42 / 0.32)"],
    contourStrokes: ["oklch(0.42 0.09 158 / 0.45)", "oklch(0.6 0.13 128 / 0.58)", "oklch(0.74 0.16 78 / 0.72)", "oklch(0.63 0.2 38 / 0.88)"],
    saccadeStroke: "oklch(0.32 0.07 162 / 0.92)",
    nodeFill: "oklch(0.32 0.07 162)",
    nodeStroke: "oklch(0.98 0.01 92)",
    nodeTextFill: "oklch(0.98 0.01 92)",
    balloonStroke: "oklch(0.54 0.11 225 / 0.78)",
    hijackStroke: "oklch(0.58 0.22 28 / 0.94)",
  },
  "viridis-oklch": {
    contourFills: ["oklch(0.38 0.11 290 / 0.16)", "oklch(0.55 0.12 215 / 0.2)", "oklch(0.72 0.15 152 / 0.25)", "oklch(0.88 0.16 98 / 0.34)"],
    contourStrokes: ["oklch(0.42 0.12 288 / 0.5)", "oklch(0.58 0.13 212 / 0.62)", "oklch(0.73 0.16 150 / 0.75)", "oklch(0.86 0.17 96 / 0.9)"],
    saccadeStroke: "oklch(0.88 0.15 96 / 0.92)",
    nodeFill: "oklch(0.34 0.11 286)",
    nodeStroke: "oklch(0.95 0.04 98)",
    nodeTextFill: "oklch(0.97 0.02 98)",
    balloonStroke: "oklch(0.72 0.13 210 / 0.8)",
    hijackStroke: "oklch(0.62 0.22 25 / 0.94)",
  },
};

function fmtSvgNumber(value: number, fallback = 0): string {
  return Number((Number.isFinite(value) ? value : fallback).toFixed(2)).toString();
}

function escapeXml(raw: string): string {
  return raw.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&#39;");
}

interface ContourBlobEllipse {
  readonly levelIndex: number;
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

function extractThermalContourEllipses(saliency: PanelVisualSaliencyResult, levels: readonly number[]): ContourBlobEllipse[] {
  const { heatmap, heatmapWidth: w, heatmapHeight: h, sourceWidth, sourceHeight } = saliency;
  const scaleX = sourceWidth / Math.max(w, 1);
  const scaleY = sourceHeight / Math.max(h, 1);
  const ellipses: ContourBlobEllipse[] = [];
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);

  for (let levelIdx = 0; levelIdx < levels.length; levelIdx += 1) {
    const threshold = levels[levelIdx] ?? 0.5;
    visited.fill(0);
    for (let start = 0; start < w * h; start += 1) {
      if ((visited[start] ?? 0) !== 0 || (heatmap[start] ?? 0) < threshold) continue;
      let head = 0;
      let tail = 0;
      queue[tail] = start;
      tail += 1;
      visited[start] = 1;
      let count = 0;
      let wSum = 0;
      let sumX = 0;
      let sumY = 0;
      let minX = w;
      let maxX = 0;
      let minY = h;
      let maxY = 0;

      while (head < tail) {
        const cur = queue[head] ?? 0;
        head += 1;
        const cy = Math.floor(cur / w);
        const cx = cur - cy * w;
        const weight = heatmap[cur] ?? threshold;
        count += 1;
        wSum += weight;
        sumX += (cx + 0.5) * weight;
        sumY += (cy + 0.5) * weight;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        const neighbors = [cx > 0 ? cur - 1 : -1, cx + 1 < w ? cur + 1 : -1, cy > 0 ? cur - w : -1, cy + 1 < h ? cur + w : -1];
        for (const nIdx of neighbors) {
          if (nIdx >= 0 && (visited[nIdx] ?? 0) === 0 && (heatmap[nIdx] ?? 0) >= threshold) {
            visited[nIdx] = 1;
            queue[tail] = nIdx;
            tail += 1;
          }
        }
      }
      if (count < 2 || wSum <= 0) continue;
      ellipses.push({
        levelIndex: levelIdx,
        cx: (sumX / wSum) * scaleX,
        cy: (sumY / wSum) * scaleY,
        rx: Math.max(3, (maxX - minX + 1.2) * 0.5 * scaleX),
        ry: Math.max(3, (maxY - minY + 1.2) * 0.5 * scaleY),
      });
    }
  }
  return ellipses;
}

/** 비파괴 OKLCH 열지도 등고선 링 + 번호 시선 노드(1 → 2 → 3) + 사카드 화살표 SVG 생성. */
export function renderSaliencyScanpathOverlaySvg(input: SaliencyOverlaySvgInput): SaliencyOverlaySvgResult {
  const { saliency } = input;
  const width = Math.max(4, Math.round(saliency.sourceWidth));
  const height = Math.max(4, Math.round(saliency.sourceHeight));
  const paletteName: SaliencyOverlayPalette = input.palette ?? "amber-forest";
  const palette = OKLCH_PALETTES[paletteName];
  const levels = input.contourLevels && input.contourLevels.length > 0 ? input.contourLevels : [0.32, 0.52, 0.72, 0.88];
  const ellipses = extractThermalContourEllipses(saliency, levels);
  const baseRadius = Math.max(7, Math.min(18, Math.min(width, height) * 0.055));
  const titleText = escapeXml(input.titleKo ?? "시각 현저성 및 예측 시선 경로 오버레이");

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmtSvgNumber(width)} ${fmtSvgNumber(height)}" width="${fmtSvgNumber(width)}" height="${fmtSvgNumber(height)}" role="img" aria-label="${titleText}" data-privacy-pii-collected="false" data-simulation-estimate="true">`,
    `  <title>${titleText}</title>`,
    "  <defs>",
    '    <marker id="wave86-saccade-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">',
    `      <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="${palette.saccadeStroke}" />`,
    "    </marker>",
    "  </defs>",
    '  <g data-layer="saliency-thermal-contours">',
  ];

  for (const el of ellipses) {
    const idx = Math.min(el.levelIndex, palette.contourFills.length - 1);
    const fill = palette.contourFills[idx] ?? "oklch(0.6 0.12 135 / 0.2)";
    const stroke = palette.contourStrokes[idx] ?? "oklch(0.6 0.12 135 / 0.6)";
    lines.push(`    <ellipse cx="${fmtSvgNumber(el.cx)}" cy="${fmtSvgNumber(el.cy)}" rx="${fmtSvgNumber(el.rx)}" ry="${fmtSvgNumber(el.ry)}" fill="${fill}" stroke="${stroke}" stroke-width="1.25" />`);
  }
  lines.push("  </g>");

  if ((input.showBalloonBoxes ?? true) && input.speechBalloons && input.speechBalloons.length > 0) {
    lines.push('  <g data-layer="speech-balloon-guides">');
    for (const balloon of input.speechBalloons) {
      const b = balloon.bounds;
      lines.push(`    <rect x="${fmtSvgNumber(b.x)}" y="${fmtSvgNumber(b.y)}" width="${fmtSvgNumber(b.width)}" height="${fmtSvgNumber(b.height)}" rx="4" fill="none" stroke="${palette.balloonStroke}" stroke-width="1.4" stroke-dasharray="4 3" data-balloon-id="${escapeXml(balloon.id)}" />`);
    }
    lines.push("  </g>");
  }

  if (input.audit?.backgroundHijackDetected && input.audit.backgroundPeakPoint) {
    const bp = input.audit.backgroundPeakPoint;
    lines.push('  <g data-layer="background-hijack-warning">', `    <circle cx="${fmtSvgNumber(bp.x)}" cy="${fmtSvgNumber(bp.y)}" r="${fmtSvgNumber(baseRadius * 1.45)}" fill="none" stroke="${palette.hijackStroke}" stroke-width="2" stroke-dasharray="5 3" />`, "  </g>");
  }

  let saccadeEdgeCount = 0;
  if ((input.showSaccadeArrows ?? true) && saliency.scanpath.length > 1) {
    lines.push('  <g data-layer="gaze-saccade-arrows">');
    for (let i = 0; i < saliency.scanpath.length - 1; i += 1) {
      const from = saliency.scanpath[i];
      const to = saliency.scanpath[i + 1];
      if (!from || !to) continue;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy);
      if (!Number.isFinite(dist) || dist < 1) continue;
      const ux = dx / dist;
      const uy = dy / dist;
      const x1 = from.x + ux * Math.min(baseRadius * (0.85 + 0.25 * from.score) + 1.5, dist * 0.35);
      const y1 = from.y + uy * Math.min(baseRadius * (0.85 + 0.25 * from.score) + 1.5, dist * 0.35);
      const x2 = to.x - ux * Math.min(baseRadius * (0.85 + 0.25 * to.score) + 3.5, dist * 0.35);
      const y2 = to.y - uy * Math.min(baseRadius * (0.85 + 0.25 * to.score) + 3.5, dist * 0.35);
      const curve = Math.min(12, dist * 0.08);
      lines.push(`    <path d="M ${fmtSvgNumber(x1)} ${fmtSvgNumber(y1)} Q ${fmtSvgNumber((x1 + x2) * 0.5 - uy * curve)} ${fmtSvgNumber((y1 + y2) * 0.5 + ux * curve)} ${fmtSvgNumber(x2)} ${fmtSvgNumber(y2)}" fill="none" stroke="${palette.saccadeStroke}" stroke-width="1.8" stroke-linecap="round" marker-end="url(#wave86-saccade-arrow)" data-saccade="${from.rank}-to-${to.rank}" />`);
      saccadeEdgeCount += 1;
    }
    lines.push("  </g>");
  }

  lines.push('  <g data-layer="gaze-fixation-nodes">');
  for (const node of saliency.scanpath) {
    const r = baseRadius * (0.85 + 0.25 * node.score);
    const fontSize = Math.max(8, r * 0.95);
    lines.push(
      `    <g data-fixation-rank="${node.rank}" data-target-kind="${node.matchedTargetKind}">`,
      `      <circle cx="${fmtSvgNumber(node.x)}" cy="${fmtSvgNumber(node.y)}" r="${fmtSvgNumber(r * 1.28)}" fill="none" stroke="${palette.nodeStroke}" stroke-width="1.2" opacity="0.65" />`,
      `      <circle cx="${fmtSvgNumber(node.x)}" cy="${fmtSvgNumber(node.y)}" r="${fmtSvgNumber(r)}" fill="${palette.nodeFill}" stroke="${palette.nodeStroke}" stroke-width="1.8" />`,
      `      <text x="${fmtSvgNumber(node.x)}" y="${fmtSvgNumber(node.y + fontSize * 0.34)}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${fmtSvgNumber(fontSize)}" font-weight="700" fill="${palette.nodeTextFill}">${node.rank}</text>`,
      "    </g>",
    );
  }
  lines.push("  </g>", "</svg>");

  const svg = lines.join("\n");
  return {
    readerPiiCollected: false,
    externalTelemetryUpload: false,
    isSimulationEstimate: true,
    privacy: LOCAL_VISUAL_SALIENCY_PRIVACY_GUARANTEE,
    palette: paletteName,
    width,
    height,
    contourRingCount: ellipses.length,
    fixationNodeCount: saliency.scanpath.length,
    saccadeEdgeCount,
    containsNaN: /\bNaN\b|Infinity/u.test(svg),
    svg,
  };
}

/** 시선 감사 결과와 회차 스크롤 리듬 트윈을 통합한 출고 전 리허설 스코어카드 빌더. */
export function buildPacingRehearsalReport(input: BuildPacingRehearsalReportInput): PacingRehearsalScorecard {
  const { pacing } = input;
  const audits = input.cutGazeAudits ?? [];
  const episodeTitleKo = input.episodeTitleKo ?? `${pacing.episodeId} 출고 전 시선·리듬 리허설`;
  const hijackedAudits = audits.filter((entry) => entry.audit.backgroundHijackDetected);
  const cautionAudits = audits.filter((entry) => !entry.audit.backgroundHijackDetected && entry.audit.severity === "caution");
  const gazeAlignmentScore =
    audits.length === 0 ? 90 : Math.max(15, Math.round(100 - (hijackedAudits.length / audits.length) * 65 - (cautionAudits.length / audits.length) * 18));

  const abruptTwistCount = pacing.twistAudits.filter((a) => a.status === "abrupt").length;
  const wallOfTextCutCount = pacing.riskHotspots.filter((h) => h.kind === "wall-of-text").length;
  const overallScore = Math.max(
    0,
    Math.min(100, Math.round(0.3 * gazeAlignmentScore + 0.3 * pacing.readabilityComfortScore + 0.24 * pacing.suspensePacingScore + 0.16 * pacing.rhythmVarietyScore)),
  );
  const readinessGrade: RehearsalReadinessGrade =
    overallScore >= 82 && hijackedAudits.length === 0 && abruptTwistCount === 0 && wallOfTextCutCount === 0
      ? "출고 권장"
      : overallScore >= 64
        ? "일부 호흡 보정 권장"
        : "출고 전 연출 점검 필요";

  const prioritizedActions: RehearsalPriorityAction[] = [];
  for (const entry of hijackedAudits) {
    prioritizedActions.push({ priority: "high", category: "gaze-hijack", cutId: entry.cutId, recommendedWhitespaceDeltaPx: 0, messageKo: `[컷 ${entry.cutId}] ${entry.audit.guidanceKo}` });
  }
  for (const h of pacing.riskHotspots) {
    const category: RehearsalPriorityAction["category"] =
      h.kind === "abrupt-twist" || h.kind === "over-stretched-gap" ? "twist-whitespace" : h.kind === "wall-of-text" ? "wall-of-text" : h.kind === "rhythm-monotony" ? "rhythm-monotony" : "visual-overload";
    prioritizedActions.push({ priority: h.severity === "critical" ? "high" : h.severity === "warning" ? "medium" : "low", category, cutId: h.cutId, recommendedWhitespaceDeltaPx: h.recommendedWhitespaceDeltaPx, messageKo: `[컷 ${h.cutId}] ${h.messageKo}` });
  }
  const rankMap: Record<RehearsalPriorityAction["priority"], number> = { high: 0, medium: 1, low: 2 };
  prioritizedActions.sort((a, b) => rankMap[a.priority] - rankMap[b.priority]);

  const archetypeSummaries: RehearsalArchetypeSummary[] = pacing.archetypeSimulations.map((sim) => ({
    archetypeId: sim.archetype.id,
    labelKo: sim.archetype.labelKo,
    totalReadTimeSec: sim.totalReadTimeSec,
    meanScrollVelocityPxPerSec: sim.meanScrollVelocityPxPerSec,
    peakFatigueRiskIndex: sim.peakFatigueRiskIndex,
    estimatedDropOffRiskIndex: sim.estimatedDropOffRiskIndex,
  }));

  const mdLines: string[] = [
    `# ${episodeTitleKo}`,
    "",
    `- 판정: **${readinessGrade}** (종합 ${overallScore}/100점)`,
    `- 안내: ${PACING_TWIN_DISCLAIMER_KO}`,
    `- 세부 지표: 시선 정렬 ${gazeAlignmentScore}점 · 가독 편안함 ${pacing.readabilityComfortScore}점 · 반전 호흡 ${pacing.suspensePacingScore}점 · 리듬 완급 ${pacing.rhythmVarietyScore}점`,
    "",
    "## 합성 독자 프로파일별 예상 감상 시간 (로컬 추정치)",
    ...archetypeSummaries.map((s) => `- ${s.labelKo}: 약 ${s.totalReadTimeSec}초 (평균 스크롤 ${s.meanScrollVelocityPxPerSec}px/s, 최대 피로 지수 ${s.peakFatigueRiskIndex})`),
    "",
    ...(prioritizedActions.length > 0
      ? ["## 출고 전 우선 보정 권장 항목", ...prioritizedActions.slice(0, 8).map((a) => `- (${a.priority}) ${a.messageKo}`)]
      : ["## 출고 전 점검 결과", "- 시선 탈취, 반전 호흡 급전환, 장문 과밀 위험이 발견되지 않았습니다."]),
  ];

  return {
    episodeId: pacing.episodeId,
    episodeTitleKo,
    generatedMode: "pre-export-local-rehearsal",
    isSimulationEstimate: true,
    readerPiiCollected: false,
    externalTelemetryUpload: false,
    disclaimerKo: PACING_TWIN_DISCLAIMER_KO,
    overallScore,
    readinessGrade,
    metrics: {
      gazeAlignmentScore,
      suspensePacingScore: pacing.suspensePacingScore,
      readabilityComfortScore: pacing.readabilityComfortScore,
      rhythmVarietyScore: pacing.rhythmVarietyScore,
      auditedCutCount: audits.length,
      hijackedCutCount: hijackedAudits.length,
      abruptTwistCount,
      wallOfTextCutCount,
    },
    archetypeSummaries,
    prioritizedActions,
    summaryMarkdownKo: mdLines.join("\n"),
  };
}
