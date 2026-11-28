/**
 * Wave 94 — 아침 마감 검토 SVG 트리아지 보드 및 자연스러운 한국어 브리핑 리포트
 * (`morning-review-brief-svg-and-report`).
 *
 * - 원시 hex/rgb 문자열 없이 인쇄 안전 고대비 OKLCH 팔레트만 사용한다.
 * - 모든 좌표·폭·높이는 유한수 가드(`safeFinite`)를 통과시켜 `NaN`/`Infinity`를 원천 차단한다.
 * - 모든 사용자 텍스트는 XML 이스케이프(`escapeSvgXml`)를 거쳐 안전한 SVG를 출력한다.
 * - 번역투 없는 간결한 실무 한국어 아침 브리핑을 생성한다.
 */

import {
  PLATFORM_SLICE_SPECS,
  type OvernightDefect,
} from "./overnight-episode-defect-scanner";
import type {
  OvernightSelfHealingRunResult,
  SelfHealingPatchRecord,
} from "./self-healing-staging-patch-engine";

export interface RenderOvernightTriageSvgOptions {
  readonly widthPx?: number;
  readonly heightPx?: number;
}

export interface MorningQaTriageMetrics {
  readonly episodeId: string;
  readonly title: string;
  readonly platformLabelKo: string;
  readonly beforeDefectCount: number;
  readonly afterDefectCount: number;
  readonly autoHealedCount: number;
  readonly reviewCount: number;
  readonly blockedCount: number;
  readonly rolledBackCount: number;
  readonly exportReady: boolean;
  readonly masterUnmutated: boolean;
  readonly masterSha256Short: string;
  readonly interiorSliceCutsY: readonly number[];
}

// 인쇄 안전 고대비 Calm Atelier OKLCH 팔레트 (원시 hex/rgb 금지)
const PALETTE = Object.freeze({
  paperBg: "oklch(0.985 0.008 92)",
  panelCard: "oklch(0.998 0.003 90)",
  trackBg: "oklch(0.945 0.012 90)",
  borderSoft: "oklch(0.84 0.018 140)",
  inkPrimary: "oklch(0.22 0.025 150)",
  inkSecondary: "oklch(0.42 0.022 150)",
  forestPrimary: "oklch(0.36 0.08 156)",
  healedBg: "oklch(0.93 0.045 154)",
  healedFg: "oklch(0.32 0.095 154)",
  reviewBg: "oklch(0.94 0.055 82)",
  reviewFg: "oklch(0.38 0.11 72)",
  blockedBg: "oklch(0.93 0.055 25)",
  blockedFg: "oklch(0.42 0.16 25)",
  rollbackBg: "oklch(0.93 0.045 305)",
  rollbackFg: "oklch(0.38 0.12 305)",
  panelBlockFill: "oklch(0.87 0.025 225)",
  balloonFill: "oklch(0.74 0.11 235)",
  faceBoxFill: "oklch(0.68 0.14 45)",
  cutLineStroke: "oklch(0.45 0.14 152)",
  barBeforeFill: "oklch(0.58 0.06 250)",
  barAfterFill: "oklch(0.46 0.12 154)",
  barBlockedFill: "oklch(0.54 0.17 26)",
});

/** SVG 텍스트·속성에 삽입되는 문자열을 XML 규격에 맞게 이스케이프한다. */
export function escapeSvgXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeFinite(value: number, fallback: number = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function fmtSvgNum(value: number): string {
  const clean = safeFinite(value, 0);
  const rounded = Math.round(clean * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** 야간 실행 결과에서 아침 트리아지 핵심 지표를 추출한다. */
export function buildMorningQaTriageMetrics(
  runResult: OvernightSelfHealingRunResult,
): MorningQaTriageMetrics {
  const limits = PLATFORM_SLICE_SPECS[runResult.platformSpec];
  const cuts = runResult.stagingSnapshot.plannedSliceCutsY ?? [
    0,
    runResult.stagingSnapshot.canvasHeightPx,
  ];
  const interiorSliceCutsY = cuts.filter(
    (y) => Number.isFinite(y) && y > 0 && y < runResult.stagingSnapshot.canvasHeightPx,
  );

  return {
    episodeId: runResult.episodeId,
    title: runResult.title,
    platformLabelKo: limits.labelKo,
    beforeDefectCount: runResult.beforeScan.defects.length,
    afterDefectCount: runResult.afterScan.defects.length,
    autoHealedCount: runResult.appliedPatchCount,
    reviewCount: runResult.afterScan.proposeReviewCount,
    blockedCount: runResult.afterScan.hardBlockerCount,
    rolledBackCount: runResult.rolledBackPatchCount,
    exportReady: runResult.exportReady,
    masterUnmutated: runResult.masterUnmutated,
    masterSha256Short: runResult.masterSha256Before.slice(0, 16),
    interiorSliceCutsY,
  };
}

/**
 * 인쇄 안전 고대비 아침 검토 트리아지 보드 SVG를 생성한다.
 * - 실행 전/후 결함 비교 막대
 * - 등급별 필 배지(`AUTO-HEALED`, `REVIEW`, `BLOCKED`, `ROLLED-BACK`)
 * - 패널·말풍선·얼굴 보호 영역·안전 세로 분할선(Y) 눈금자
 */
export function renderOvernightQaTriageSvg(
  runResult: OvernightSelfHealingRunResult,
  options: RenderOvernightTriageSvgOptions = {},
): string {
  const width = Math.max(640, Math.round(safeFinite(options.widthPx ?? 960, 960)));
  const height = Math.max(460, Math.round(safeFinite(options.heightPx ?? 520, 520)));
  const metrics = buildMorningQaTriageMetrics(runResult);
  const limits = PLATFORM_SLICE_SPECS[runResult.platformSpec];

  const padX = 32;
  const innerW = width - padX * 2;
  const titleEsc = escapeSvgXml(metrics.title);
  const epEsc = escapeSvgXml(metrics.episodeId);
  const platformEsc = escapeSvgXml(metrics.platformLabelKo);
  const hashEsc = escapeSvgXml(metrics.masterSha256Short);
  const readinessLabel = metrics.exportReady ? "EXPORT READY" : "BLOCKED - HUMAN REVIEW";
  const readinessBg = metrics.exportReady ? PALETTE.healedBg : PALETTE.blockedBg;
  const readinessFg = metrics.exportReady ? PALETTE.healedFg : PALETTE.blockedFg;
  const immutabilityTag = metrics.masterUnmutated ? "UNMUTATED" : "TAMPERED";

  // 4개 상태 필 배지 레이아웃
  const pillItems = [
    {
      code: "AUTO-HEALED",
      labelKo: "자동 복구",
      count: metrics.autoHealedCount,
      bg: PALETTE.healedBg,
      fg: PALETTE.healedFg,
    },
    {
      code: "REVIEW",
      labelKo: "작가 확인",
      count: metrics.reviewCount,
      bg: PALETTE.reviewBg,
      fg: PALETTE.reviewFg,
    },
    {
      code: "BLOCKED",
      labelKo: "출고 차단",
      count: metrics.blockedCount,
      bg: PALETTE.blockedBg,
      fg: PALETTE.blockedFg,
    },
    {
      code: "ROLLED-BACK",
      labelKo: "자동 되돌림",
      count: metrics.rolledBackCount,
      bg: PALETTE.rollbackBg,
      fg: PALETTE.rollbackFg,
    },
  ];
  const pillGap = 14;
  const pillW = (innerW - pillGap * 3) / 4;
  const pillY = 98;
  const pillH = 74;

  const pillSvg = pillItems
    .map((item, idx) => {
      const px = padX + idx * (pillW + pillGap);
      return [
        `  <g data-pill="${item.code}">`,
        `    <rect x="${fmtSvgNum(px)}" y="${fmtSvgNum(pillY)}" width="${fmtSvgNum(pillW)}" height="${fmtSvgNum(pillH)}" rx="10" fill="${item.bg}" stroke="${item.fg}" stroke-width="1.2" />`,
        `    <text x="${fmtSvgNum(px + 14)}" y="${fmtSvgNum(pillY + 24)}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" font-weight="700" fill="${item.fg}">${item.code}</text>`,
        `    <text x="${fmtSvgNum(px + 14)}" y="${fmtSvgNum(pillY + 42)}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" fill="${PALETTE.inkSecondary}">${escapeSvgXml(item.labelKo)}</text>`,
        `    <text x="${fmtSvgNum(px + pillW - 16)}" y="${fmtSvgNum(pillY + 52)}" text-anchor="end" font-family="ui-monospace, monospace" font-size="28" font-weight="700" fill="${item.fg}">${fmtSvgNum(item.count)}</text>`,
        "  </g>",
      ].join("\n");
    })
    .join("\n");

  // 전/후 결함 비교 바
  const barSectionY = 194;
  const barCardH = 112;
  const barTrackX = padX + 148;
  const barTrackW = Math.max(120, innerW - 236);
  const maxBarRef = Math.max(1, metrics.beforeDefectCount, metrics.afterDefectCount);
  const beforeBarW = (metrics.beforeDefectCount / maxBarRef) * barTrackW;
  const afterBarW = (metrics.afterDefectCount / maxBarRef) * barTrackW;
  const afterBarColor = metrics.blockedCount > 0 ? PALETTE.barBlockedFill : PALETTE.barAfterFill;

  // 안전 세로 슬라이스 컷 눈금자
  const rulerSectionY = 326;
  const rulerCardH = Math.max(150, height - rulerSectionY - 24);
  const trackX = padX + 24;
  const trackW = Math.max(200, innerW - 48);
  const trackY = rulerSectionY + 58;
  const trackH = 38;
  const safeCanvasH = Math.max(1, safeFinite(runResult.stagingSnapshot.canvasHeightPx, 1));
  const mapYToX = (yPx: number): number => {
    const clamped = Math.max(0, Math.min(safeCanvasH, safeFinite(yPx, 0)));
    return trackX + (clamped / safeCanvasH) * trackW;
  };

  const panelRectsSvg = runResult.stagingSnapshot.panels
    .map((panel) => {
      const rx1 = mapYToX(panel.bounds.y);
      const rx2 = mapYToX(panel.bounds.y + panel.bounds.height);
      const rw = Math.max(2, rx2 - rx1);
      return `    <rect x="${fmtSvgNum(rx1)}" y="${fmtSvgNum(trackY + 4)}" width="${fmtSvgNum(rw)}" height="${fmtSvgNum(trackH - 8)}" rx="3" fill="${PALETTE.panelBlockFill}" stroke="${PALETTE.borderSoft}" stroke-width="1" />`;
    })
    .join("\n");

  const balloonMarksSvg = runResult.stagingSnapshot.speechBalloons
    .map((b) => {
      const bx1 = mapYToX(b.bbox.y);
      const bx2 = mapYToX(b.bbox.y + b.bbox.height);
      const bw = Math.max(2, bx2 - bx1);
      return `    <rect x="${fmtSvgNum(bx1)}" y="${fmtSvgNum(trackY + 8)}" width="${fmtSvgNum(bw)}" height="9" rx="2" fill="${PALETTE.balloonFill}" />`;
    })
    .join("\n");

  const faceMarksSvg = runResult.stagingSnapshot.faceKeepOutBoxes
    .map((f) => {
      const fx1 = mapYToX(f.bbox.y);
      const fx2 = mapYToX(f.bbox.y + f.bbox.height);
      const fw = Math.max(2, fx2 - fx1);
      return `    <rect x="${fmtSvgNum(fx1)}" y="${fmtSvgNum(trackY + 21)}" width="${fmtSvgNum(fw)}" height="9" rx="2" fill="${PALETTE.faceBoxFill}" />`;
    })
    .join("\n");

  const cutTicksSvg = metrics.interiorSliceCutsY
    .map((cutY) => {
      const cx = mapYToX(cutY);
      const cutLabel = `${fmtSvgNum(cutY)}px`;
      return [
        `    <line x1="${fmtSvgNum(cx)}" y1="${fmtSvgNum(trackY - 8)}" x2="${fmtSvgNum(cx)}" y2="${fmtSvgNum(trackY + trackH + 10)}" stroke="${PALETTE.cutLineStroke}" stroke-width="2" stroke-dasharray="4 3" />`,
        `    <text x="${fmtSvgNum(cx)}" y="${fmtSvgNum(trackY + trackH + 25)}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="11" font-weight="700" fill="${PALETTE.cutLineStroke}">${cutLabel}</text>`,
      ].join("\n");
    })
    .join("\n");

  const ariaLabel = escapeSvgXml(
    `Wave 94 야간 자율 마감 QA 아침 보드 — ${metrics.title} (${metrics.beforeDefectCount}건에서 ${metrics.afterDefectCount}건)`,
  );

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmtSvgNum(width)} ${fmtSvgNum(height)}" width="${fmtSvgNum(width)}" height="${fmtSvgNum(height)}" role="img" aria-label="${ariaLabel}">`,
    `  <title>${titleEsc} — Overnight Finishing QA Board</title>`,
    `  <rect x="0" y="0" width="${fmtSvgNum(width)}" height="${fmtSvgNum(height)}" fill="${PALETTE.paperBg}" />`,
    `  <rect x="${fmtSvgNum(padX)}" y="20" width="${fmtSvgNum(innerW)}" height="62" rx="12" fill="${PALETTE.panelCard}" stroke="${PALETTE.borderSoft}" stroke-width="1.2" />`,
    `  <text x="${fmtSvgNum(padX + 18)}" y="45" font-family="ui-sans-serif, system-ui, sans-serif" font-size="16" font-weight="700" fill="${PALETTE.inkPrimary}">${titleEsc}</text>`,
    `  <text x="${fmtSvgNum(padX + 18)}" y="67" font-family="ui-monospace, monospace" font-size="11" fill="${PALETTE.inkSecondary}">${epEsc} · ${platformEsc} · SHA-256 ${hashEsc} [${immutabilityTag}]</text>`,
    `  <rect x="${fmtSvgNum(width - padX - 224)}" y="34" width="208" height="34" rx="8" fill="${readinessBg}" stroke="${readinessFg}" stroke-width="1.2" />`,
    `  <text x="${fmtSvgNum(width - padX - 120)}" y="55" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" font-weight="700" fill="${readinessFg}">${readinessLabel}</text>`,
    pillSvg,
    `  <g data-section="before-after-metrics">`,
    `    <rect x="${fmtSvgNum(padX)}" y="${fmtSvgNum(barSectionY)}" width="${fmtSvgNum(innerW)}" height="${fmtSvgNum(barCardH)}" rx="12" fill="${PALETTE.panelCard}" stroke="${PALETTE.borderSoft}" stroke-width="1.2" />`,
    `    <text x="${fmtSvgNum(padX + 18)}" y="${fmtSvgNum(barSectionY + 26)}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" font-weight="700" fill="${PALETTE.inkPrimary}">야간 자가 복구 전·후 결함 비교</text>`,
    `    <text x="${fmtSvgNum(padX + 18)}" y="${fmtSvgNum(barSectionY + 58)}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" fill="${PALETTE.inkSecondary}">복구 전 (Before)</text>`,
    `    <rect x="${fmtSvgNum(barTrackX)}" y="${fmtSvgNum(barSectionY + 44)}" width="${fmtSvgNum(barTrackW)}" height="18" rx="6" fill="${PALETTE.trackBg}" />`,
    `    <rect x="${fmtSvgNum(barTrackX)}" y="${fmtSvgNum(barSectionY + 44)}" width="${fmtSvgNum(beforeBarW)}" height="18" rx="6" fill="${PALETTE.barBeforeFill}" />`,
    `    <text x="${fmtSvgNum(width - padX - 18)}" y="${fmtSvgNum(barSectionY + 58)}" text-anchor="end" font-family="ui-monospace, monospace" font-size="13" font-weight="700" fill="${PALETTE.inkPrimary}">${fmtSvgNum(metrics.beforeDefectCount)}건</text>`,
    `    <text x="${fmtSvgNum(padX + 18)}" y="${fmtSvgNum(barSectionY + 90)}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" fill="${PALETTE.inkSecondary}">복구 후 (After)</text>`,
    `    <rect x="${fmtSvgNum(barTrackX)}" y="${fmtSvgNum(barSectionY + 76)}" width="${fmtSvgNum(barTrackW)}" height="18" rx="6" fill="${PALETTE.trackBg}" />`,
    `    <rect x="${fmtSvgNum(barTrackX)}" y="${fmtSvgNum(barSectionY + 76)}" width="${fmtSvgNum(afterBarW)}" height="18" rx="6" fill="${afterBarColor}" />`,
    `    <text x="${fmtSvgNum(width - padX - 18)}" y="${fmtSvgNum(barSectionY + 90)}" text-anchor="end" font-family="ui-monospace, monospace" font-size="13" font-weight="700" fill="${PALETTE.inkPrimary}">${fmtSvgNum(metrics.afterDefectCount)}건</text>`,
    "  </g>",
    `  <g data-section="safe-slice-cut-ruler">`,
    `    <rect x="${fmtSvgNum(padX)}" y="${fmtSvgNum(rulerSectionY)}" width="${fmtSvgNum(innerW)}" height="${fmtSvgNum(rulerCardH)}" rx="12" fill="${PALETTE.panelCard}" stroke="${PALETTE.borderSoft}" stroke-width="1.2" />`,
    `    <text x="${fmtSvgNum(padX + 18)}" y="${fmtSvgNum(rulerSectionY + 26)}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" font-weight="700" fill="${PALETTE.inkPrimary}">여백 기반 안전 세로 분할선 눈금자 (최대 ${fmtSvgNum(limits.maxSliceHeightPx)}px · 총 ${fmtSvgNum(runResult.stagingSnapshot.canvasHeightPx)}px)</text>`,
    `    <text x="${fmtSvgNum(padX + 18)}" y="${fmtSvgNum(rulerSectionY + 44)}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" fill="${PALETTE.inkSecondary}">패널 구간 / 상단 막대: 말풍선 / 하단 막대: 얼굴 보호 영역 / 점선: 거터 안전 분할선 (${fmtSvgNum(metrics.interiorSliceCutsY.length)}곳)</text>`,
    `    <rect x="${fmtSvgNum(trackX)}" y="${fmtSvgNum(trackY)}" width="${fmtSvgNum(trackW)}" height="${fmtSvgNum(trackH)}" rx="6" fill="${PALETTE.trackBg}" stroke="${PALETTE.borderSoft}" stroke-width="1" />`,
    panelRectsSvg,
    balloonMarksSvg,
    faceMarksSvg,
    cutTicksSvg,
    `    <text x="${fmtSvgNum(trackX)}" y="${fmtSvgNum(trackY + trackH + 44)}" font-family="ui-monospace, monospace" font-size="10" fill="${PALETTE.inkSecondary}">0px</text>`,
    `    <text x="${fmtSvgNum(trackX + trackW)}" y="${fmtSvgNum(trackY + trackH + 44)}" text-anchor="end" font-family="ui-monospace, monospace" font-size="10" fill="${PALETTE.inkSecondary}">${fmtSvgNum(runResult.stagingSnapshot.canvasHeightPx)}px</text>`,
    "  </g>",
    "</svg>",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function formatPatchLine(patch: SelfHealingPatchRecord): string {
  if (patch.status === "AUTO_ROLLED_BACK_REGRESSION") {
    const reason = patch.rollbackReasonKo ? ` (${patch.rollbackReasonKo})` : "";
    return `- [${patch.patchId}] ${patch.summaryKo}${reason}`;
  }
  return `- [${patch.patchId}] ${patch.summaryKo}`;
}

function formatDefectLine(defect: OvernightDefect): string {
  return `- [${defect.defectClass}] ${defect.summaryKo} → ${defect.recommendedActionKo}`;
}

/**
 * 작가가 아침에 1분 안에 확인하고 최종 승인할 수 있는 자연스러운 한국어 브리핑을 생성한다.
 */
export function summarizeMorningQaBriefKo(runResult: OvernightSelfHealingRunResult): string {
  const metrics = buildMorningQaTriageMetrics(runResult);
  const appliedPatches = runResult.patches.filter((p) => p.status === "APPLIED");
  const rolledBackPatches = runResult.patches.filter(
    (p) => p.status === "AUTO_ROLLED_BACK_REGRESSION",
  );
  const reviewDefects = runResult.afterScan.defects.filter(
    (d) => d.safetyTier === "PROPOSE_REVIEW_PATCH",
  );
  const hardBlockers = runResult.afterScan.defects.filter(
    (d) => d.safetyTier === "HARD_HUMAN_BLOCKER",
  );

  const lines: string[] = [];
  lines.push(`[아침 마감 브리핑] ${metrics.title} (${metrics.episodeId} · ${metrics.platformLabelKo})`);
  lines.push(
    `출고 판정: ${metrics.exportReady ? "출고 가능 (스테이징 최종 승인 대기)" : "출고 보류 (작가 확인 필요)"}`,
  );
  lines.push(
    `원본 무결성: ${
      metrics.masterUnmutated
        ? `검증 완료 (SHA-256 ${runResult.masterSha256Before}, 원본 변경 0건)`
        : `경고 — 원본 해시 불일치 (${runResult.masterSha256Before} ≠ ${runResult.masterSha256After})`
    }`,
  );
  lines.push(
    `야간 점검 요약: 결함 ${metrics.beforeDefectCount}건 → ${metrics.afterDefectCount}건 ` +
      `(자동 복구 ${metrics.autoHealedCount}건, 자동 되돌림 ${metrics.rolledBackCount}건, ` +
      `작가 확인 ${metrics.reviewCount}건, 출고 차단 ${metrics.blockedCount}건)`,
  );

  lines.push("");
  lines.push(`1. 야간 자동 복구 완료 (${appliedPatches.length}건)`);
  if (appliedPatches.length === 0) {
    lines.push("- 자동 복구 대상이 없었습니다.");
  } else {
    for (let i = 0; i < appliedPatches.length; i += 1) {
      const p = appliedPatches[i];
      if (p) lines.push(formatPatchLine(p));
    }
  }

  lines.push("");
  lines.push(`2. 회귀 감지로 자동 되돌린 항목 (${rolledBackPatches.length}건)`);
  if (rolledBackPatches.length === 0) {
    lines.push("- 회귀 충돌로 취소된 패치가 없습니다.");
  } else {
    for (let i = 0; i < rolledBackPatches.length; i += 1) {
      const p = rolledBackPatches[i];
      if (p) lines.push(formatPatchLine(p));
    }
  }

  lines.push("");
  lines.push(`3. 작가 확인 필요 항목 (${reviewDefects.length}건)`);
  if (reviewDefects.length === 0) {
    lines.push("- 추가 육안 검토가 필요한 항목이 없습니다.");
  } else {
    for (let i = 0; i < reviewDefects.length; i += 1) {
      const d = reviewDefects[i];
      if (d) lines.push(formatDefectLine(d));
    }
  }

  lines.push("");
  lines.push(`4. 출고 차단 항목 · Rights BOM / 치명 충돌 (${hardBlockers.length}건)`);
  if (hardBlockers.length === 0) {
    lines.push("- 출고를 막는 라이선스·치명 결함이 없습니다.");
  } else {
    for (let i = 0; i < hardBlockers.length; i += 1) {
      const d = hardBlockers[i];
      if (d) lines.push(formatDefectLine(d));
    }
  }

  if (metrics.interiorSliceCutsY.length > 0) {
    lines.push("");
    lines.push(
      `안전 세로 분할선: ${metrics.interiorSliceCutsY.map((y) => `${y}px`).join(", ")} (빈 여백 구간 적용)`,
    );
  }

  return lines.join("\n");
}
