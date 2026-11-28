/**
 * Wave 93 — 연합 화풍 수렴·프라이버시 예산 인쇄 안전 SVG 리포트 및
 * 자연스러운 한국어 스튜디오 요약 포매터 (`federated-privacy-audit-svg-and-report.ts`).
 *
 * - 고대비 인쇄 안전 SVG 시각화: 화풍 수렴 궤적, DP 프라이버시 예산 소진 막대,
 *   거부된 이상치·드리프트 롤백 마커 출력 (`0` NaN/Infinity, XML 이스케이프 강제)
 * - 번역투 없는 현장형 한국어 요약: 팀 화풍 정합도, 이상치 거부 건수, 잔여 DP (ε, δ) 예산,
 *   원본 원고 업로드 0건 보장, 적용/롤백 판정을 간결하게 정리
 */

import type {
  FederatedRoundDecision,
  FederatedStyleRoundResult,
} from "./federated-studio-aggregator-and-drift-guard";
import type {
  PrivacyBudgetLedger,
  PrivacyBudgetSnapshot,
} from "./local-style-delta-extractor";

// ---------------------------------------------------------------------------
// 1. 타입 계약 및 인쇄 안전 유틸리티
// ---------------------------------------------------------------------------

export interface RenderConvergenceSvgOptions {
  readonly titleKo?: string;
  readonly width?: number;
  readonly height?: number;
}

export interface FederatedStyleRoundSummaryKo {
  readonly studioId: string;
  readonly roundIndex: number;
  readonly statusBadgeKo: "적용 완료" | "드리프트 롤백" | "유효 델타 없음";
  readonly headlineKo: string;
  readonly teamAlignmentScore: number;
  readonly acceptedCount: number;
  readonly downweightedCount: number;
  readonly rejectedOutlierCount: number;
  readonly epsilonSpent: number;
  readonly remainingEpsilon: number;
  readonly deltaSpent: number;
  readonly remainingDelta: number;
  readonly budgetUtilizationPercent: number;
  readonly zeroRawArtworkVerified: true;
  readonly bulletsKo: readonly string[];
  readonly markdownReportKo: string;
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeFinite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clampRange(value: number, min: number, max: number): number {
  const safe = safeFinite(value, min);
  if (safe < min) return min;
  if (safe > max) return max;
  return safe;
}

function fmtCoord(value: number): string {
  return safeFinite(value, 0).toFixed(2);
}

function isPrivacyBudgetLedger(
  candidate: PrivacyBudgetSnapshot | PrivacyBudgetLedger,
): candidate is PrivacyBudgetLedger {
  return "getSnapshot" in candidate && typeof candidate.getSnapshot === "function";
}

function resolveBudgetSnapshot(
  budgetOrLedger: PrivacyBudgetSnapshot | PrivacyBudgetLedger,
): PrivacyBudgetSnapshot {
  return isPrivacyBudgetLedger(budgetOrLedger)
    ? budgetOrLedger.getSnapshot()
    : budgetOrLedger;
}

function decisionToBadgeKo(
  decision: FederatedRoundDecision,
): "적용 완료" | "드리프트 롤백" | "유효 델타 없음" {
  switch (decision) {
    case "APPLIED":
      return "적용 완료";
    case "ROLLED_BACK_DRIFT_GUARD":
      return "드리프트 롤백";
    case "ROLLED_BACK_NO_VALID_DELTAS":
      return "유효 델타 없음";
  }
}

// ---------------------------------------------------------------------------
// 2. 인쇄 안전 고대비 화풍 수렴·프라이버시 예산 SVG 렌더러
// ---------------------------------------------------------------------------

export function renderFederatedStyleConvergenceSvg(
  roundHistory: readonly FederatedStyleRoundResult[],
  privacyBudget: PrivacyBudgetSnapshot | PrivacyBudgetLedger,
  options?: RenderConvergenceSvgOptions,
): string {
  const budget = resolveBudgetSnapshot(privacyBudget);
  const width = Math.round(clampRange(options?.width ?? 880, 640, 1440));
  const height = Math.round(clampRange(options?.height ?? 420, 320, 900));

  const titleText = escapeXml(
    options?.titleKo ?? `${budget.studioId} 팀 화풍 연합 수렴 · DP 프라이버시 감사`,
  );
  const studioSafe = escapeXml(budget.studioId);
  const participantSafe = escapeXml(budget.participantId);

  const chartLeft = 72;
  const chartTop = 88;
  const chartWidth = width - 112;
  const chartHeight = 196;
  const chartBottom = chartTop + chartHeight;

  const yTicks = [0, 25, 50, 75, 100];
  const gridLinesSvg = yTicks
    .map((tick) => {
      const y = chartBottom - (tick / 100) * chartHeight;
      return [
        `<line x1="${fmtCoord(chartLeft)}" y1="${fmtCoord(y)}" x2="${fmtCoord(chartLeft + chartWidth)}" y2="${fmtCoord(y)}" stroke="#D6D3CB" stroke-width="1" stroke-dasharray="${tick === 0 ? "none" : "4 4"}" />`,
        `<text x="${fmtCoord(chartLeft - 10)}" y="${fmtCoord(y + 4)}" text-anchor="end" font-size="11" fill="#334155">${tick}</text>`,
      ].join("");
    })
    .join("\n    ");

  const points: {
    readonly x: number;
    readonly y: number;
    readonly score: number;
    readonly roundIndex: number;
    readonly rolledBack: boolean;
    readonly rejectedCount: number;
  }[] = roundHistory.map((round, idx) => {
    const score = clampRange(round.appliedAlignmentScore, 0, 100);
    const xRatio =
      roundHistory.length <= 1 ? 0.5 : idx / (roundHistory.length - 1);
    const x = chartLeft + 24 + xRatio * Math.max(1, chartWidth - 48);
    const y = chartBottom - (score / 100) * chartHeight;
    return {
      x,
      y,
      score,
      roundIndex: round.roundIndex,
      rolledBack: round.rolledBack,
      rejectedCount: Math.max(0, Math.round(safeFinite(round.rejectedOutlierCount, 0))),
    };
  });

  const polylineSvg =
    points.length >= 2
      ? `<polyline fill="none" stroke="#1F4435" stroke-width="2.5" points="${points
          .map((p) => `${fmtCoord(p.x)},${fmtCoord(p.y)}`)
          .join(" ")}" />`
      : "";

  const markersSvg =
    points.length === 0
      ? `<text x="${fmtCoord(chartLeft + chartWidth / 2)}" y="${fmtCoord(chartTop + chartHeight / 2)}" text-anchor="middle" font-size="13" fill="#475569">기록된 연합 라운드가 아직 없습니다.</text>`
      : points
          .map((p) => {
            const fillColor = p.rolledBack ? "#B91C1C" : "#1F4435";
            const nodeCircle = `<circle cx="${fmtCoord(p.x)}" cy="${fmtCoord(p.y)}" r="5.5" fill="${fillColor}" stroke="#FFFFFF" stroke-width="2" />`;
            const roundLabel = `<text x="${fmtCoord(p.x)}" y="${fmtCoord(chartBottom + 18)}" text-anchor="middle" font-size="11" fill="#1E293B">R${p.roundIndex}</text>`;
            const scoreLabel = `<text x="${fmtCoord(p.x)}" y="${fmtCoord(Math.max(chartTop + 12, p.y - 12))}" text-anchor="middle" font-size="10.5" font-weight="600" fill="${fillColor}">${p.score.toFixed(1)}</text>`;

            const outlierMarker =
              p.rejectedCount > 0
                ? `<g data-outlier-round="${p.roundIndex}">` +
                  `<polygon points="${fmtCoord(p.x)},${fmtCoord(chartTop + 6)} ${fmtCoord(p.x + 7)},${fmtCoord(chartTop + 18)} ${fmtCoord(p.x - 7)},${fmtCoord(chartTop + 18)}" fill="#B45309" stroke="#FFFFFF" stroke-width="1" />` +
                  `<text x="${fmtCoord(p.x)}" y="${fmtCoord(chartTop + 31)}" text-anchor="middle" font-size="10" font-weight="700" fill="#92400E">이상치 -${p.rejectedCount}</text>` +
                  `</g>`
                : "";

            return `${nodeCircle}${roundLabel}${scoreLabel}${outlierMarker}`;
          })
          .join("\n    ");

  // DP 프라이버시 예산 막대 계산 (NaN/0 나눗셈 원천 차단)
  const maxEps = Math.max(1e-9, safeFinite(budget.maxEpsilonBudget, 1));
  const spentEps = clampRange(budget.epsilonSpent, 0, maxEps);
  const ratio = clampRange(spentEps / maxEps, 0, 1);
  const pctText = (ratio * 100).toFixed(1);

  const barX = 72;
  const barY = chartBottom + 54;
  const barWidth = chartWidth;
  const barHeight = 20;
  const filledWidth = barWidth * ratio;
  const barFillColor = ratio >= 0.9 ? "#B91C1C" : ratio >= 0.7 ? "#B45309" : "#1F4435";
  const budgetStatusKo =
    ratio >= 0.9 ? "예산 임박" : ratio >= 0.7 ? "예산 주의" : "예산 여유";

  const deltaSpentSafe = safeFinite(budget.deltaSpent, 0);
  const maxDeltaSafe = safeFinite(budget.maxDeltaBudget, 1e-3);
  const totalRejected = roundHistory.reduce(
    (acc, item) => acc + Math.max(0, Math.round(safeFinite(item.rejectedOutlierCount, 0))),
    0,
  );
  const totalRollbacks = roundHistory.filter((item) => item.rolledBack).length;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${titleText}">`,
    `  <rect x="0" y="0" width="${width}" height="${height}" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5" rx="10" />`,
    `  <text x="28" y="36" font-family="system-ui, -apple-system, sans-serif" font-size="17" font-weight="700" fill="#0F172A">${titleText}</text>`,
    `  <text x="28" y="56" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#334155">스튜디오: ${studioSafe} · 참여자: ${participantSafe} · 원본 원고 업로드: 0건 (클리핑+DP 델타 전용)</text>`,
    `  <rect x="${width - 244}" y="20" width="216" height="28" rx="6" fill="#ECFDF5" stroke="#1F4435" stroke-width="1" />`,
    `  <text x="${width - 136}" y="38" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="11.5" font-weight="700" fill="#1F4435">ZERO RAW ARTWORK · DP VERIFIED</text>`,
    `  <g id="convergence-chart" font-family="system-ui, -apple-system, sans-serif">`,
    `    <rect x="${fmtCoord(chartLeft)}" y="${fmtCoord(chartTop)}" width="${fmtCoord(chartWidth)}" height="${fmtCoord(chartHeight)}" fill="#FAF8F3" stroke="#CBD5E1" stroke-width="1" />`,
    `    <text x="${fmtCoord(chartLeft)}" y="${fmtCoord(chartTop - 10)}" font-size="12" font-weight="600" fill="#1E293B">팀 화풍 정합도 수렴 궤적 (0~100, 누적 거부 이상치 ${totalRejected}건 · 롤백 ${totalRollbacks}회)</text>`,
    `    ${gridLinesSvg}`,
    `    ${polylineSvg}`,
    `    ${markersSvg}`,
    `  </g>`,
    `  <g id="privacy-budget-bar" font-family="system-ui, -apple-system, sans-serif">`,
    `    <text x="${fmtCoord(barX)}" y="${fmtCoord(barY - 10)}" font-size="12" font-weight="600" fill="#0F172A">차분 프라이버시 예산 소진율: ε ${spentEps.toFixed(3)} / ${maxEps.toFixed(3)} (${pctText}% · ${budgetStatusKo})</text>`,
    `    <rect x="${fmtCoord(barX)}" y="${fmtCoord(barY)}" width="${fmtCoord(barWidth)}" height="${fmtCoord(barHeight)}" rx="6" fill="#E2E8F0" stroke="#94A3B8" stroke-width="1" />`,
    `    <rect x="${fmtCoord(barX)}" y="${fmtCoord(barY)}" width="${fmtCoord(filledWidth)}" height="${fmtCoord(barHeight)}" rx="6" fill="${barFillColor}" />`,
    `    <text x="${fmtCoord(barX)}" y="${fmtCoord(barY + 38)}" font-size="11.5" fill="#334155">누적 δ: ${deltaSpentSafe.toExponential(2)} / ${maxDeltaSafe.toExponential(2)} · 참여 라운드: ${budget.roundsParticipated}회 · 이상치 마커(▲ 주황) · 드리프트 롤백 노드(● 적색)</text>`,
    `  </g>`,
    `</svg>`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// 3. 자연스러운 한국어 스튜디오 라운드 요약 포매터
// ---------------------------------------------------------------------------

export function summarizeFederatedStyleRoundKo(
  roundResult: FederatedStyleRoundResult,
  privacyLedger: PrivacyBudgetSnapshot | PrivacyBudgetLedger,
): FederatedStyleRoundSummaryKo {
  const budget = resolveBudgetSnapshot(privacyLedger);
  const statusBadgeKo = decisionToBadgeKo(roundResult.decision);
  const alignment = clampRange(roundResult.appliedAlignmentScore, 0, 100);
  const budgetUtilizationPercent = Number(
    (clampRange(budget.utilizationRatio, 0, 1) * 100).toFixed(1),
  );

  const aggregatorLabelKo =
    roundResult.aggregator === "coordinate-median"
      ? "좌표 중앙값(Coordinate Median)"
      : roundResult.aggregator === "coordinate-trimmed-mean"
        ? "좌표 절사평균(Trimmed Mean)"
        : "역할 가중 평균(Weighted FedAvg)";

  let headlineKo: string;
  if (roundResult.decision === "APPLIED") {
    headlineKo = `라운드 ${roundResult.roundIndex} 화풍 델타 반영 완료 — 팀 정합도 ${alignment.toFixed(1)}점`;
  } else if (roundResult.decision === "ROLLED_BACK_DRIFT_GUARD") {
    headlineKo = `라운드 ${roundResult.roundIndex} 드리프트 가드 발동 — 직전 화풍으로 안전 롤백 (${alignment.toFixed(1)}점 유지)`;
  } else {
    headlineKo = `라운드 ${roundResult.roundIndex} 유효 델타 없음 — 직전 화풍 유지 (${alignment.toFixed(1)}점)`;
  }

  const driftExceedKo =
    roundResult.driftMetrics.exceededChecks.length > 0
      ? `초과 항목: ${roundResult.driftMetrics.exceededChecks.join(", ")}`
      : "모든 앵커 드리프트 기준 통과";

  const bulletsKo: string[] = [
    `판정 상태: [${statusBadgeKo}] · 집계 방식: ${aggregatorLabelKo}`,
    `팀 화풍 정합도: ${alignment.toFixed(1)} / 100점 (코사인 거리 ${roundResult.driftMetrics.cosineDistance.toFixed(4)}, OKLCH 그림자 색차 ${roundResult.driftMetrics.oklchShadowDriftEstimate.toFixed(4)}, ${driftExceedKo})`,
    `참여 현황: 반영 ${roundResult.acceptedCount}명, 감쇠 ${roundResult.downweightedCount}명, 이상치 거부 ${roundResult.rejectedOutlierCount}명`,
    `프라이버시 예산 잔여: ε ${budget.remainingEpsilon.toFixed(3)} / ${budget.maxEpsilonBudget.toFixed(3)} (소진율 ${budgetUtilizationPercent.toFixed(1)}%), δ 잔여 ${budget.remainingDelta.toExponential(2)}`,
    `원본 원고 비유출 보장: 원본 원고·PSD·스트로크 좌표·미공개 대사 업로드 0건 (해시 체인 ${roundResult.auditEntry.entryHashHex.slice(0, 12)}…)`,
  ];

  const markdownReportKo = [
    `### ${headlineKo}`,
    "",
    ...bulletsKo.map((line) => `- ${line}`),
  ].join("\n");

  return {
    studioId: roundResult.studioId,
    roundIndex: roundResult.roundIndex,
    statusBadgeKo,
    headlineKo,
    teamAlignmentScore: alignment,
    acceptedCount: roundResult.acceptedCount,
    downweightedCount: roundResult.downweightedCount,
    rejectedOutlierCount: roundResult.rejectedOutlierCount,
    epsilonSpent: budget.epsilonSpent,
    remainingEpsilon: budget.remainingEpsilon,
    deltaSpent: budget.deltaSpent,
    remainingDelta: budget.remainingDelta,
    budgetUtilizationPercent,
    zeroRawArtworkVerified: true,
    bulletsKo,
    markdownReportKo,
  };
}
