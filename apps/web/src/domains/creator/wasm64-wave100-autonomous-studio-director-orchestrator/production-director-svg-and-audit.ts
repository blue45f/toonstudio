/**
 * Wave 100 — OKLCH 인쇄 대응 DAG·간트 임계 경로 다이어그램 SVG 및 한국어 마스터 출고 승인 보고서.
 *
 * - 모든 색상을 `oklch(...)` 토큰으로만 표현하고 모든 좌표에 유한수 가드와 XML 이스케이프를 적용한다.
 * - 번역투 없는 명료한 한국어로 임계 경로 가속비, 스테이지 상태, 멀티 서피스 출고 판정과 다음 조치를 정리한다.
 */

import type {
  EpisodeProductionRunReport,
  ProductionStageStatus,
} from "./episode-production-dag-scheduler";
import {
  MASTER_RELEASE_INVARIANT_IDS,
  RELEASE_SURFACE_PROFILES,
  RELEASE_SURFACE_TARGETS,
  type MasterReleaseCertificate,
  type MasterReleaseGateEvaluation,
  type MasterReleaseInvariantId,
} from "./master-release-gatekeeper-and-certificate";

export interface ProductionDirectorSvgOptions {
  readonly widthPx?: number;
  readonly rowHeightPx?: number;
  readonly titleOverride?: string;
}

interface OklchBadgeStyle {
  readonly token: string;
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
  readonly dash?: string;
}

const FONT_SANS = "Pretendard, Apple SD Gothic Neo, sans-serif";
const FONT_MONO = "ui-monospace, SFMono-Regular, monospace";

const STAGE_BADGE_STYLES: Readonly<Record<ProductionStageStatus, OklchBadgeStyle>> = {
  passed: { token: "PASS", fill: "oklch(0.94 0.04 152)", stroke: "oklch(0.45 0.12 152)", text: "oklch(0.28 0.09 152)" },
  "healed-passed": { token: "HEAL", fill: "oklch(0.94 0.04 240)", stroke: "oklch(0.46 0.13 240)", text: "oklch(0.28 0.10 240)", dash: "4 2" },
  blocked: { token: "BLOCK", fill: "oklch(0.93 0.05 26)", stroke: "oklch(0.50 0.18 26)", text: "oklch(0.32 0.14 26)" },
  "skipped-upstream-blocked": { token: "SKIP", fill: "oklch(0.94 0.01 90)", stroke: "oklch(0.54 0.02 90)", text: "oklch(0.38 0.02 90)", dash: "3 3" },
  pending: { token: "WAIT", fill: "oklch(0.96 0.01 90)", stroke: "oklch(0.60 0.02 90)", text: "oklch(0.42 0.02 90)" },
};

const INVARIANT_LABELS_KO: Readonly<Record<MasterReleaseInvariantId, string>> = {
  rightsBomCleared: "권리 BOM 상업·권역 라이선스",
  geoComplianceCleared: "글로벌 권역 심의 차단 0건",
  overnightQaZeroHardBlockers: "야간 자가치유 QA 하드 블로커 0건",
  accessibilityAndCvdPassed: "색각안전(CVD)·WCAG·저감 모션",
  continuityAndCanonPassed: "서사·설정 연속성 바이블",
  centennialVaultSealed: "100년 보존 C2PA 금고 봉인",
  allCriticalStagesSucceeded: "전체 DAG 임계 스테이지 통과·마스터 격리",
};

const INVARIANT_NEXT_ACTIONS_KO: Readonly<Record<MasterReleaseInvariantId, string>> = {
  rightsBomCleared: "만료·권역 제한 에셋 라이선스를 교체한 뒤 geo-compliance-and-rights-bom 단계부터 체크포인트를 재개하세요.",
  geoComplianceCleared: "권역별 비파괴 변형 레이어로 미해결 심의 차단 항목을 정리한 뒤 재검증하세요.",
  overnightQaZeroHardBlockers: "자동 치유에 실패한 하드 QA 블로커 패널을 수동 수정한 뒤 overnight-self-healing-qa를 다시 실행하세요.",
  accessibilityAndCvdPassed: "색각안전 대비 미달 텍스트나 저감 모션 위험 구간을 보정한 뒤 cvd-mobile-readability-audit를 재실행하세요.",
  continuityAndCanonPassed: "연속성 바이블 충돌 항목을 수정한 뒤 continuity-bible-check부터 다시 실행하세요.",
  centennialVaultSealed: "선행 패키징 차단을 해결한 뒤 centennial-c2pa-vault-seal 단계에서 100년 C2PA 봉인을 완료하세요.",
  allCriticalStagesSucceeded: "차단된 스테이지를 수정한 뒤 체크포인트에서 재개해 모든 임계 경로 스테이지를 통과시키세요.",
};

const STAGE_STATUS_LABEL_KO: Readonly<Record<ProductionStageStatus, string>> = {
  passed: "통과",
  "healed-passed": "자가치유 통과",
  blocked: "차단",
  "skipped-upstream-blocked": "선행 차단으로 보류",
  pending: "대기",
};

/** XML 특수문자(`&`, `<`, `>`, `"`, `'`)를 안전하게 이스케이프한다. */
export function escapeDirectorSvgXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clampFinite(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value * 100) / 100));
}

function fmtSvg(value: number): string {
  return String(Number.isFinite(value) ? Math.round(value * 100) / 100 : 0);
}

function truncateText(raw: string, maxChars: number): string {
  return raw.length <= maxChars ? raw : `${raw.slice(0, Math.max(1, maxChars - 1))}…`;
}

/**
 * 병렬 웨이브 레인, CPM 임계 경로 강조선, 스테이지 배지(`PASS`/`HEAL`/`BLOCK`),
 * 5대 멀티 서피스 출고 매트릭스, 인증서 SHA-256 지문을 OKLCH 고대비 SVG로 렌더링한다.
 */
export function renderWave100ProductionDirectorSvg(
  runReport: EpisodeProductionRunReport,
  certificate: MasterReleaseCertificate,
  options?: ProductionDirectorSvgOptions,
): string {
  const totalWidth = clampFinite(options?.widthPx ?? 1080, 1080, 820, 1600);
  const rowH = clampFinite(options?.rowHeightPx ?? 42, 42, 34, 60);

  const padX = 24;
  const padY = 22;
  const cardW = totalWidth - padX * 2;
  const labelColW = 286;
  const badgeColW = 92;
  const ganttLeft = padX + labelColW + badgeColW;
  const ganttW = Math.max(240, cardW - labelColW - badgeColW - 22);

  const headerH = 88;
  const axisH = 30;
  const ganttBodyH = Math.max(1, runReport.stages.length) * rowH;
  const matrixSectionH = 112;
  const footerH = 66;
  const totalHeight = padY * 2 + headerH + axisH + ganttBodyH + matrixSectionH + footerH;

  const titleText =
    options?.titleOverride ??
    `${runReport.episodeTitle} (${runReport.episodeId} · Rev.${runReport.masterRevision})`;
  const wallClockMs = Math.max(1, runReport.schedule.parallelWallClockMs);
  const approvedMaster = certificate.masterDecision === "APPROVED";

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmtSvg(totalWidth)}" height="${fmtSvg(totalHeight)}" viewBox="0 0 ${fmtSvg(totalWidth)} ${fmtSvg(totalHeight)}" role="img" aria-label="${escapeDirectorSvgXml(`Wave 100 에피소드 프로덕션 DAG 및 출고 게이트: ${titleText}`)}">`,
    `  <title>${escapeDirectorSvgXml(titleText)}</title>`,
    `  <rect x="0" y="0" width="${fmtSvg(totalWidth)}" height="${fmtSvg(totalHeight)}" fill="oklch(0.985 0.008 92)" />`,
    `  <rect x="${fmtSvg(padX)}" y="${fmtSvg(padY)}" width="${fmtSvg(cardW)}" height="${fmtSvg(totalHeight - padY * 2)}" rx="10" fill="oklch(0.998 0.002 95)" stroke="oklch(0.32 0.04 155 / 0.18)" stroke-width="1" />`,
    `  <text x="${fmtSvg(padX + 18)}" y="${fmtSvg(padY + 30)}" font-family="${FONT_SANS}" font-size="16" font-weight="700" fill="oklch(0.22 0.03 155)">${escapeDirectorSvgXml(titleText)}</text>`,
  ];

  const subMeta = `Wave 100 오케스트레이터 · CPM 병렬 가속 ${runReport.schedule.parallelSpeedupRatio.toFixed(2)}x (${fmtSvg(runReport.schedule.totalSerialMs)}ms → ${fmtSvg(runReport.schedule.parallelWallClockMs)}ms) · 연계 웨이브 ${runReport.waveCoverageCount}종 · 캐시 재사용 ${runReport.reusedCachedStageCount}단계`;
  lines.push(`  <text x="${fmtSvg(padX + 18)}" y="${fmtSvg(padY + 52)}" font-family="${FONT_SANS}" font-size="11.5" fill="oklch(0.40 0.025 155)">${escapeDirectorSvgXml(subMeta)}</text>`);

  const decisionFill = approvedMaster ? "oklch(0.94 0.04 152)" : "oklch(0.93 0.05 26)";
  const decisionStroke = approvedMaster ? "oklch(0.45 0.12 152)" : "oklch(0.50 0.18 26)";
  const decisionText = approvedMaster ? "oklch(0.28 0.09 152)" : "oklch(0.32 0.14 26)";
  const decisionBoxX = padX + cardW - 156;
  lines.push(`  <rect x="${fmtSvg(decisionBoxX)}" y="${fmtSvg(padY + 16)}" width="138" height="30" rx="6" fill="${decisionFill}" stroke="${decisionStroke}" stroke-width="1.6" />`);
  lines.push(`  <text x="${fmtSvg(decisionBoxX + 69)}" y="${fmtSvg(padY + 35)}" text-anchor="middle" font-family="${FONT_MONO}" font-size="12" font-weight="700" fill="${decisionText}">${certificate.masterDecision}</text>`);

  const legendY = padY + 74;
  const legendItems = [
    { label: "PASS 통과", fill: "oklch(0.94 0.04 152)", stroke: "oklch(0.45 0.12 152)" },
    { label: "HEAL 자가치유", fill: "oklch(0.94 0.04 240)", stroke: "oklch(0.46 0.13 240)" },
    { label: "BLOCK 차단", fill: "oklch(0.93 0.05 26)", stroke: "oklch(0.50 0.18 26)" },
    { label: "[CP] 임계 경로(slack=0)", fill: "oklch(0.95 0.05 42)", stroke: "oklch(0.56 0.18 42)" },
  ];
  for (let i = 0; i < legendItems.length; i += 1) {
    const lx = padX + 18 + i * 164;
    lines.push(`  <rect x="${fmtSvg(lx)}" y="${fmtSvg(legendY - 10)}" width="14" height="12" rx="3" fill="${legendItems[i].fill}" stroke="${legendItems[i].stroke}" stroke-width="1.5" />`);
    lines.push(`  <text x="${fmtSvg(lx + 20)}" y="${fmtSvg(legendY)}" font-family="${FONT_SANS}" font-size="10.5" fill="oklch(0.34 0.025 155)">${escapeDirectorSvgXml(legendItems[i].label)}</text>`);
  }

  // 간트 타임라인 축 헤더
  const axisTop = padY + headerH;
  lines.push(`  <rect x="${fmtSvg(padX)}" y="${fmtSvg(axisTop)}" width="${fmtSvg(cardW)}" height="${fmtSvg(axisH)}" fill="oklch(0.955 0.012 90)" stroke="oklch(0.32 0.04 155 / 0.14)" stroke-width="1" />`);
  lines.push(`  <text x="${fmtSvg(padX + 14)}" y="${fmtSvg(axisTop + 19)}" font-family="${FONT_SANS}" font-size="11.5" font-weight="700" fill="oklch(0.33 0.07 156)">웨이브 · 프로덕션 스테이지</text>`);
  lines.push(`  <text x="${fmtSvg(padX + labelColW + badgeColW * 0.5)}" y="${fmtSvg(axisTop + 19)}" text-anchor="middle" font-family="${FONT_SANS}" font-size="11.5" font-weight="700" fill="oklch(0.33 0.07 156)">상태</text>`);

  for (let t = 0; t <= 5; t += 1) {
    const ratio = t / 5;
    const tx = ganttLeft + ratio * ganttW;
    const anchor = t === 5 ? "end" : t === 0 ? "start" : "middle";
    lines.push(`  <line x1="${fmtSvg(tx)}" y1="${fmtSvg(axisTop + axisH)}" x2="${fmtSvg(tx)}" y2="${fmtSvg(axisTop + axisH + ganttBodyH)}" stroke="oklch(0.32 0.04 155 / 0.10)" stroke-width="1" />`);
    lines.push(`  <text x="${fmtSvg(tx)}" y="${fmtSvg(axisTop + 19)}" text-anchor="${anchor}" font-family="${FONT_MONO}" font-size="10" fill="oklch(0.42 0.025 155)">${fmtSvg(Math.round(ratio * wallClockMs))}ms</text>`);
  }

  const bodyTop = axisTop + axisH;
  const barGeom = new Map<string, { readonly x: number; readonly w: number; readonly midY: number; readonly isCritical: boolean }>();

  for (let i = 0; i < runReport.stages.length; i += 1) {
    const rec = runReport.stages[i];
    const timing = runReport.schedule.stageTimings[rec.stageId];
    const rowY = bodyTop + i * rowH;
    const laneTint = rec.waveIndex % 2 === 1 ? "oklch(0.980 0.008 92)" : "oklch(0.998 0.002 95)";
    const isCritical = timing?.isCritical === true;

    lines.push(`  <rect x="${fmtSvg(padX)}" y="${fmtSvg(rowY)}" width="${fmtSvg(cardW)}" height="${fmtSvg(rowH)}" fill="${laneTint}" />`);
    lines.push(`  <line x1="${fmtSvg(padX)}" y1="${fmtSvg(rowY)}" x2="${fmtSvg(padX + cardW)}" y2="${fmtSvg(rowY)}" stroke="oklch(0.32 0.04 155 / 0.10)" stroke-width="1" />`);

    const labelStr = truncateText(`W${rec.waveIndex} · ${rec.labelKo}${isCritical ? " [CP]" : ""}`, 28);
    const idSub = truncateText(`${rec.stageId} (W${rec.sourceWaves.join("+")})${rec.reusedFromCheckpoint ? " · CACHE" : ""}`, 38);
    lines.push(`  <text x="${fmtSvg(padX + 14)}" y="${fmtSvg(rowY + 18)}" font-family="${FONT_SANS}" font-size="11.5" font-weight="${isCritical ? "700" : "500"}" fill="oklch(0.22 0.03 155)">${escapeDirectorSvgXml(labelStr)}</text>`);
    lines.push(`  <text x="${fmtSvg(padX + 14)}" y="${fmtSvg(rowY + 33)}" font-family="${FONT_MONO}" font-size="9.5" fill="oklch(0.46 0.02 155)">${escapeDirectorSvgXml(idSub)}</text>`);

    const badge = STAGE_BADGE_STYLES[rec.status];
    const bx = padX + labelColW + 14;
    const by = rowY + 10;
    const dashAttr = badge.dash !== undefined ? ` stroke-dasharray="${badge.dash}"` : "";
    lines.push(`  <rect x="${fmtSvg(bx)}" y="${fmtSvg(by)}" width="64" height="22" rx="5" fill="${badge.fill}" stroke="${badge.stroke}" stroke-width="1.4"${dashAttr} />`);
    lines.push(`  <text x="${fmtSvg(bx + 32)}" y="${fmtSvg(by + 15)}" text-anchor="middle" font-family="${FONT_MONO}" font-size="10.5" font-weight="700" fill="${badge.text}">${badge.token}</text>`);

    const es = timing?.earliestStartMs ?? 0;
    const ef = timing?.earliestFinishMs ?? rec.estimatedDurationMs;
    const slack = timing?.slackMs ?? 0;
    const barX = ganttLeft + (es / wallClockMs) * ganttW;
    const barW = Math.max(12, ((ef - es) / wallClockMs) * ganttW);
    const barY = rowY + 10;
    const barH = rowH - 20;
    barGeom.set(rec.stageId, { x: barX, w: barW, midY: barY + barH * 0.5, isCritical });

    if (slack > 0) {
      const slackW = Math.max(4, (slack / wallClockMs) * ganttW);
      lines.push(`  <line x1="${fmtSvg(barX + barW)}" y1="${fmtSvg(barY + barH * 0.5)}" x2="${fmtSvg(barX + barW + slackW)}" y2="${fmtSvg(barY + barH * 0.5)}" stroke="oklch(0.55 0.04 155 / 0.55)" stroke-width="1.5" stroke-dasharray="4 3" />`);
    }
    const barStroke = isCritical ? "oklch(0.56 0.18 42)" : badge.stroke;
    lines.push(`  <rect x="${fmtSvg(barX)}" y="${fmtSvg(barY)}" width="${fmtSvg(barW)}" height="${fmtSvg(barH)}" rx="4" fill="${badge.fill}" stroke="${barStroke}" stroke-width="${isCritical ? "2.4" : "1.2"}" />`);
    const durLabel = `${fmtSvg(ef - es)}ms${slack > 0 ? ` (+${fmtSvg(slack)})` : ""}`;
    lines.push(`  <text x="${fmtSvg(barX + barW * 0.5)}" y="${fmtSvg(barY + barH * 0.68)}" text-anchor="middle" font-family="${FONT_MONO}" font-size="9.5" font-weight="700" fill="${badge.text}">${escapeDirectorSvgXml(durLabel)}</text>`);
  }

  // DAG 의존성 간선 오버레이 (임계 경로 강조)
  for (let i = 0; i < runReport.stages.length; i += 1) {
    const rec = runReport.stages[i];
    const targetTiming = runReport.schedule.stageTimings[rec.stageId];
    const toGeom = barGeom.get(rec.stageId);
    if (targetTiming === undefined || toGeom === undefined) continue;
    for (let j = 0; j < targetTiming.dependsOn.length; j += 1) {
      const depId = targetTiming.dependsOn[j];
      const depTiming = runReport.schedule.stageTimings[depId];
      const fromGeom = barGeom.get(depId);
      if (depTiming === undefined || fromGeom === undefined) continue;
      const criticalEdge =
        fromGeom.isCritical &&
        toGeom.isCritical &&
        depTiming.earliestFinishMs === targetTiming.earliestStartMs;
      const x1 = fromGeom.x + fromGeom.w;
      const midX = (x1 + toGeom.x) * 0.5;
      const edgeStroke = criticalEdge ? "oklch(0.56 0.18 42)" : "oklch(0.44 0.03 155 / 0.35)";
      lines.push(`  <path d="M ${fmtSvg(x1)} ${fmtSvg(fromGeom.midY)} C ${fmtSvg(midX)} ${fmtSvg(fromGeom.midY)} ${fmtSvg(midX)} ${fmtSvg(toGeom.midY)} ${fmtSvg(toGeom.x)} ${fmtSvg(toGeom.midY)}" fill="none" stroke="${edgeStroke}" stroke-width="${criticalEdge ? "2.2" : "1"}" />`);
    }
  }

  // 5대 멀티 서피스 출고 매트릭스
  const matrixTop = bodyTop + ganttBodyH;
  lines.push(`  <rect x="${fmtSvg(padX)}" y="${fmtSvg(matrixTop)}" width="${fmtSvg(cardW)}" height="${fmtSvg(matrixSectionH)}" fill="oklch(0.965 0.010 91)" stroke="oklch(0.32 0.04 155 / 0.14)" stroke-width="1" />`);
  lines.push(`  <text x="${fmtSvg(padX + 16)}" y="${fmtSvg(matrixTop + 24)}" font-family="${FONT_SANS}" font-size="12" font-weight="700" fill="oklch(0.33 0.07 156)">멀티 서피스 출고 매트릭스 (${certificate.approvedSurfaceCount}/${certificate.totalSurfaceCount} 승인)</text>`);

  const surfaceBoxW = (cardW - 32 - 10 * (RELEASE_SURFACE_TARGETS.length - 1)) / RELEASE_SURFACE_TARGETS.length;
  for (let i = 0; i < RELEASE_SURFACE_TARGETS.length; i += 1) {
    const target = RELEASE_SURFACE_TARGETS[i];
    const profile = RELEASE_SURFACE_PROFILES[target];
    const approved = certificate.surfaceDecisions[target] === "RELEASE_APPROVED";
    const sx = padX + 16 + i * (surfaceBoxW + 10);
    const sy = matrixTop + 36;
    const fill = approved ? "oklch(0.95 0.035 152)" : "oklch(0.94 0.045 26)";
    const stroke = approved ? "oklch(0.45 0.12 152)" : "oklch(0.50 0.18 26)";
    const textCol = approved ? "oklch(0.28 0.09 152)" : "oklch(0.32 0.14 26)";
    lines.push(`  <rect x="${fmtSvg(sx)}" y="${fmtSvg(sy)}" width="${fmtSvg(surfaceBoxW)}" height="62" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.4" />`);
    lines.push(`  <text x="${fmtSvg(sx + 10)}" y="${fmtSvg(sy + 20)}" font-family="${FONT_SANS}" font-size="10.5" font-weight="700" fill="oklch(0.22 0.03 155)">${escapeDirectorSvgXml(truncateText(profile.labelKo, 16))}</text>`);
    lines.push(`  <text x="${fmtSvg(sx + 10)}" y="${fmtSvg(sy + 36)}" font-family="${FONT_MONO}" font-size="9" fill="oklch(0.42 0.025 155)">${escapeDirectorSvgXml(truncateText(target, 22))}</text>`);
    lines.push(`  <text x="${fmtSvg(sx + 10)}" y="${fmtSvg(sy + 53)}" font-family="${FONT_MONO}" font-size="10" font-weight="700" fill="${textCol}">${approved ? "RELEASE_APPROVED" : "RELEASE_BLOCKED"}</text>`);
  }

  // 하단 암호학적 인증서 지문
  const footerTop = matrixTop + matrixSectionH;
  lines.push(`  <rect x="${fmtSvg(padX)}" y="${fmtSvg(footerTop)}" width="${fmtSvg(cardW)}" height="${fmtSvg(footerH)}" fill="oklch(0.955 0.012 90)" stroke="oklch(0.32 0.04 155 / 0.14)" stroke-width="1" />`);
  lines.push(`  <text x="${fmtSvg(padX + 16)}" y="${fmtSvg(footerTop + 26)}" font-family="${FONT_MONO}" font-size="10.5" font-weight="700" fill="oklch(0.24 0.04 155)">CERT SHA-256: ${escapeDirectorSvgXml(certificate.certificateSha256)}</text>`);
  lines.push(`  <text x="${fmtSvg(padX + 16)}" y="${fmtSvg(footerTop + 46)}" font-family="${FONT_MONO}" font-size="10" fill="oklch(0.40 0.025 155)">MERKLE: ${escapeDirectorSvgXml(certificate.merkleStageDigest.slice(0, 24))} · MASTER ISOLATED: ${runReport.masterStateIsolated ? "YES" : "NO"} · CERT ID: ${escapeDirectorSvgXml(certificate.certificateId)}</text>`);
  lines.push("</svg>");
  return lines.join("\n");
}

/**
 * 마스터 에피소드 프로덕션 실행 결과와 암호학적 출고 인증서를 종합해
 * 번역투 없는 자연스러운 한국어 최종 출고 승인 보고서를 작성한다.
 */
export function summarizeMasterProductionReleaseKo(
  runReport: EpisodeProductionRunReport,
  certificate: MasterReleaseCertificate,
  gateEvaluation?: MasterReleaseGateEvaluation,
): string {
  const verdictKo = certificate.masterDecision === "APPROVED" ? "최종 출고 승인" : "출고 차단 (보완 필요)";
  const lines: string[] = [
    "# Wave 100 마스터 에피소드 프로덕션 출고 보고서",
    "",
    `- 대상 회차: ${runReport.episodeTitle} (\`${runReport.episodeId}\`, 마스터 Rev.${runReport.masterRevision})`,
    `- 최종 판정: **${verdictKo}** (\`${certificate.masterDecision}\`)`,
    `- 임계 경로 병렬 가속: 직렬 ${runReport.schedule.totalSerialMs}ms → 병렬 ${runReport.schedule.parallelWallClockMs}ms (**${runReport.schedule.parallelSpeedupRatio.toFixed(2)}배 가속**, 최대 동시 실행 ${runReport.schedule.maxConcurrentStages}스테이지)`,
    `- 임계 경로(여유 시간 0ms): \`${runReport.schedule.criticalPathStageIds.join(" -> ")}\``,
    `- 스테이지 요약: 통과 ${runReport.passedStageCount} · 자가치유 ${runReport.healedStageCount} · 차단 ${runReport.blockedStageCount} · 선행 보류 ${runReport.skippedUpstreamBlockedCount} · 체크포인트 캐시 재사용 ${runReport.reusedCachedStageCount}`,
    `- 마스터 상태 격리: ${runReport.masterStateIsolated ? "유지됨 (원본 변경 0건)" : "경고 (원본 변경 감지)"}`,
    "",
    "## 스테이지 실행 내역",
    "",
    "| 웨이브 | 스테이지 | 상태 | 캐시 | 소요(ms) | 여유(ms) | 요약 |",
    "| :---: | --- | --- | :---: | ---: | ---: | --- |",
  ];

  for (let i = 0; i < runReport.stages.length; i += 1) {
    const rec = runReport.stages[i];
    const slack = runReport.schedule.stageTimings[rec.stageId]?.slackMs ?? 0;
    lines.push(
      `| W${rec.waveIndex} | ${rec.labelKo} (\`${rec.stageId}\`) | ${STAGE_STATUS_LABEL_KO[rec.status]} | ${rec.reusedFromCheckpoint ? "재사용" : "실행"} | ${rec.actualDurationMs} | ${slack} | ${rec.summaryKo} |`,
    );
  }

  lines.push("", "## 멀티 서피스 출고 판정", "", "| 배포 대상 | 구분 | 출고 판정 |", "| --- | :---: | --- |");
  for (let i = 0; i < RELEASE_SURFACE_TARGETS.length; i += 1) {
    const target = RELEASE_SURFACE_TARGETS[i];
    const profile = RELEASE_SURFACE_PROFILES[target];
    const decisionKo = certificate.surfaceDecisions[target] === "RELEASE_APPROVED" ? "출고 승인" : "출고 차단";
    lines.push(`| ${profile.labelKo} (\`${target}\`) | ${profile.isCommercial ? "상업 배포" : "영구 아카이브"} | **${decisionKo}** |`);
  }

  lines.push("", "## 권리 BOM · C2PA 봉인 · 7대 출고 불변식 검증", "");
  for (let i = 0; i < MASTER_RELEASE_INVARIANT_IDS.length; i += 1) {
    const invId = MASTER_RELEASE_INVARIANT_IDS[i];
    lines.push(`- [${certificate.invariants[invId] ? "통과" : "차단"}] ${INVARIANT_LABELS_KO[invId]}`);
  }
  lines.push(
    `- 인증서 서명(SHA-256): \`${certificate.certificateSha256}\` (머클 루트 \`${certificate.merkleStageDigest.slice(0, 16)}\`, 연계 웨이브 ${certificate.waveCoverageCount}종)`,
    "",
    "## 다음 조치",
    "",
  );

  if (certificate.masterDecision === "APPROVED") {
    lines.push("- 차단 사유가 없습니다. 승인된 5개 서피스 패키지를 바로 출고하고 C2PA 금고 사본을 보관하세요.");
  } else if (gateEvaluation !== undefined && gateEvaluation.remediationActions.length > 0) {
    for (let i = 0; i < gateEvaluation.remediationActions.length; i += 1) {
      const item = gateEvaluation.remediationActions[i];
      lines.push(`- **[${item.stageId}]** ${item.actionKo}`);
    }
  } else {
    for (let i = 0; i < MASTER_RELEASE_INVARIANT_IDS.length; i += 1) {
      const invId = MASTER_RELEASE_INVARIANT_IDS[i];
      if (!certificate.invariants[invId]) {
        lines.push(`- **[${INVARIANT_LABELS_KO[invId]}]** ${INVARIANT_NEXT_ACTIONS_KO[invId]}`);
      }
    }
  }

  return lines.join("\n");
}
