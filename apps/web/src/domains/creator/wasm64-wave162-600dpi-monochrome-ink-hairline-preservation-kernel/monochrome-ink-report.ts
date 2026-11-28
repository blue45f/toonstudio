/**
 * Wave 162: 순수 OKLCH SVG 전·후 1비트 픽셀 확대 비교 리포트 및 자연스러운 한글 인쇄 검수 요약.
 *
 * 디자인 규칙 준수: raw hex / rgb() / hsl() 색상을 일절 쓰지 않고 oklch(...) 토큰만 사용한다.
 */

import type {
  BinaryInkBuffer,
  InkBinarizationComparison,
  MonochromeInkAuditStatus,
  PrintMonochromeProfileSpec,
} from './monochrome-ink-types';

const PALETTE = {
  canvas: 'oklch(0.982 0.007 85)',
  card: 'oklch(0.996 0.003 85)',
  border: 'oklch(0.865 0.014 145)',
  grid: 'oklch(0.925 0.008 90)',
  ink: 'oklch(0.18 0.015 155)',
  paper: 'oklch(0.995 0.002 90)',
  fgPrimary: 'oklch(0.22 0.018 155)',
  fgMuted: 'oklch(0.46 0.016 155)',
  recovered: 'oklch(0.38 0.088 155)',
  speckleRemoved: 'oklch(0.58 0.14 35)',
  statusPassBg: 'oklch(0.93 0.04 152)',
  statusPassFg: 'oklch(0.32 0.085 152)',
  statusWarnBg: 'oklch(0.95 0.05 78)',
  statusWarnFg: 'oklch(0.42 0.11 65)',
  statusFailBg: 'oklch(0.93 0.05 26)',
  statusFailFg: 'oklch(0.42 0.14 25)',
} as const;

export interface MonochromeInkAuditSvgOptions {
  readonly title: string;
  readonly profile: PrintMonochromeProfileSpec;
  readonly baseline: BinaryInkBuffer;
  readonly preserved: BinaryInkBuffer;
  readonly comparison: InkBinarizationComparison;
  readonly binaryFingerprintSha256: string;
}

/** SVG XML 특수문자 이스케이프. */
export function escapeSvgXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeFinite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function formatFixed(value: number, digits: number): string {
  return safeFinite(value, 0).toFixed(digits);
}

function resolveStatusPalette(status: MonochromeInkAuditStatus): {
  readonly bg: string;
  readonly fg: string;
  readonly labelKo: string;
} {
  if (status === 'PASS') {
    return {
      bg: PALETTE.statusPassBg,
      fg: PALETTE.statusPassFg,
      labelKo: 'PASS · 제판 적합',
    };
  }
  if (status === 'WARN') {
    return {
      bg: PALETTE.statusWarnBg,
      fg: PALETTE.statusWarnFg,
      labelKo: 'WARN · 세선 점검',
    };
  }
  return {
    bg: PALETTE.statusFailBg,
    fg: PALETTE.statusFailFg,
    labelKo: 'FAIL · 수정 필요',
  };
}

function renderPixelPanelRects(
  buffer: BinaryInkBuffer,
  compareAgainst: BinaryInkBuffer | undefined,
  mode: 'baseline' | 'preserved',
  originX: number,
  originY: number,
  panelW: number,
  panelH: number,
): string {
  const { width, height, bits } = buffer;
  const maxSampleCols = Math.min(width, 64);
  const maxSampleRows = Math.min(height, 48);
  const stepX = Math.max(1, Math.floor(width / maxSampleCols));
  const stepY = Math.max(1, Math.floor(height / maxSampleRows));
  const cols = Math.max(1, Math.ceil(width / stepX));
  const rows = Math.max(1, Math.ceil(height / stepY));

  const cellSize = Math.max(1, Math.min(panelW / cols, panelH / rows));
  const gridW = cellSize * cols;
  const gridH = cellSize * rows;
  const padX = originX + (panelW - gridW) * 0.5;
  const padY = originY + (panelH - gridH) * 0.5;

  const rects: string[] = [];
  rects.push(
    `<rect x="${formatFixed(padX, 2)}" y="${formatFixed(padY, 2)}" width="${formatFixed(gridW, 2)}" height="${formatFixed(gridH, 2)}" fill="${PALETTE.paper}" stroke="${PALETTE.grid}" stroke-width="1"/>`,
  );

  for (let row = 0; row < rows; row += 1) {
    const sy = Math.min(height - 1, row * stepY);
    for (let col = 0; col < cols; col += 1) {
      const sx = Math.min(width - 1, col * stepX);
      const idx = sy * width + sx;
      const bit = (bits[idx] ?? 0) !== 0 ? 1 : 0;
      if (bit === 0) continue;

      const otherBit =
        compareAgainst !== undefined && (compareAgainst.bits[idx] ?? 0) !== 0 ? 1 : 0;

      let fill: string = PALETTE.ink;
      if (mode === 'preserved' && otherBit === 0) {
        fill = PALETTE.recovered;
      } else if (mode === 'baseline' && otherBit === 0) {
        fill = PALETTE.speckleRemoved;
      }

      const rx = padX + col * cellSize;
      const ry = padY + row * cellSize;
      rects.push(
        `<rect x="${formatFixed(rx, 2)}" y="${formatFixed(ry, 2)}" width="${formatFixed(cellSize, 2)}" height="${formatFixed(cellSize, 2)}" fill="${fill}"/>`,
      );
    }
  }

  return rects.join('');
}

/** 순수 OKLCH 색상으로 1비트 흑백 펜선 전·후 확대 비교 및 연속성 검수 SVG를 렌더링한다. */
export function renderMonochromeInkAuditSvg(options: MonochromeInkAuditSvgOptions): string {
  const { title, profile, baseline, preserved, comparison, binaryFingerprintSha256 } = options;
  const svgW = 860;
  const svgH = 440;
  const statusInfo = resolveStatusPalette(comparison.preservedAudit.status);
  const shortHash = binaryFingerprintSha256.slice(0, 12);

  const safeTitle = escapeSvgXml(title);
  const safeProfile = escapeSvgXml(profile.labelKo);
  const safeStatusLabel = escapeSvgXml(statusInfo.labelKo);
  const safeHash = escapeSvgXml(shortHash);

  const leftPanelRects = renderPixelPanelRects(baseline, preserved, 'baseline', 28, 98, 384, 240);
  const rightPanelRects = renderPixelPanelRects(
    preserved,
    baseline,
    'preserved',
    448,
    98,
    384,
    240,
  );

  const beforeScore = formatFixed(comparison.continuityScoreBefore, 1);
  const afterScore = formatFixed(comparison.continuityScoreAfter, 1);
  const minMm = formatFixed(comparison.preservedAudit.minPhysicalWidthMm, 3);
  const safeMm = formatFixed(comparison.preservedAudit.minSafeStrokeWidthMm, 3);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(svgW)} ${String(svgH)}" width="${String(svgW)}" height="${String(svgH)}" role="img" aria-label="${safeTitle}">`,
    `<rect x="0" y="0" width="${String(svgW)}" height="${String(svgH)}" rx="16" fill="${PALETTE.canvas}" stroke="${PALETTE.border}" stroke-width="1"/>`,
    `<text x="28" y="38" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="700" fill="${PALETTE.fgPrimary}">${safeTitle}</text>`,
    `<text x="28" y="58" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="${PALETTE.fgMuted}">${safeProfile} · ${String(preserved.width)}×${String(preserved.height)}px · ${String(preserved.dpi)}DPI</text>`,
    `<rect x="692" y="20" width="140" height="30" rx="15" fill="${statusInfo.bg}"/>`,
    `<text x="762" y="40" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="${statusInfo.fg}">${safeStatusLabel}</text>`,

    `<rect x="20" y="72" width="400" height="278" rx="12" fill="${PALETTE.card}" stroke="${PALETTE.border}" stroke-width="1"/>`,
    `<text x="32" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="600" fill="${PALETTE.fgPrimary}">기준선: 전역 임계값 (잉크 ${String(comparison.baselineInkPixels)}px · 끊김 ${String(comparison.baselineDropoutCount)}건)</text>`,
    leftPanelRects,

    `<rect x="440" y="72" width="400" height="278" rx="12" fill="${PALETTE.card}" stroke="${PALETTE.border}" stroke-width="1"/>`,
    `<text x="452" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="600" fill="${PALETTE.recovered}">Wave 162 보존 커널 (잉크 ${String(comparison.preservedInkPixels)}px · 끊김 ${String(comparison.preservedDropoutCount)}건)</text>`,
    rightPanelRects,

    `<rect x="20" y="362" width="820" height="60" rx="10" fill="${PALETTE.card}" stroke="${PALETTE.border}" stroke-width="1"/>`,
    `<text x="36" y="386" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="600" fill="${PALETTE.fgPrimary}">연속성 점수 ${beforeScore} → ${afterScore} · 최소 선폭 ${minMm}mm (기준 ${safeMm}mm) · 유착 ${String(comparison.preservedAudit.fusedParallelStrandCount)}건 · 먼지 제거 ${String(comparison.specklesRemoved)}개</text>`,
    `<text x="36" y="408" font-family="ui-monospace, SFMono-Regular, monospace" font-size="11" fill="${PALETTE.fgMuted}">연결 성분 ${String(comparison.baselineConnectedComponents)} → ${String(comparison.preservedConnectedComponents)} · 복구 잉크 +${String(comparison.recoveredInkPixels)}px · SHA-256 ${safeHash}</text>`,
    `</svg>`,
  ].join('');
}

/** 인쇄 출판 검수 담당자를 위한 자연스러운 한글 QA 브리프 생성 (번역투 배제). */
export function summarizeMonochromeInkAuditKo(
  profile: PrintMonochromeProfileSpec,
  comparison: InkBinarizationComparison,
  binaryFingerprintSha256: string,
): string {
  const { preservedAudit } = comparison;
  const shortHash = binaryFingerprintSha256.slice(0, 12);
  const minMm = formatFixed(preservedAudit.minPhysicalWidthMm, 3);
  const safeMm = formatFixed(preservedAudit.minSafeStrokeWidthMm, 3);
  const beforeScore = formatFixed(comparison.continuityScoreBefore, 1);
  const afterScore = formatFixed(comparison.continuityScoreAfter, 1);

  const headlineByStatus: Readonly<Record<MonochromeInkAuditStatus, string>> = {
    PASS: `[PASS] ${profile.labelKo} 1비트 흑백 펜선 검수 통과`,
    WARN: `[WARN] ${profile.labelKo} 1비트 펜선 보존 완료 · 물리 선폭·세부 항목 점검 필요`,
    FAIL: `[FAIL] ${profile.labelKo} 1비트 펜선 끊김 또는 평행선 유착 감지 · 보정 필요`,
  };

  const lines: string[] = [
    headlineByStatus[preservedAudit.status],
    `- 펜선 연속성: 기준선 ${beforeScore}점 → 보존 커널 ${afterScore}점 (복구 잉크 +${String(comparison.recoveredInkPixels)}px, 끊김 ${String(comparison.baselineDropoutCount)}건 → ${String(comparison.preservedDropoutCount)}건)`,
    `- 평행선 분리 상태: ${comparison.parallelStrandsPreserved ? '인접 평행 가닥 유착 없음(정상 분리)' : `평행선 유착 ${String(preservedAudit.fusedParallelStrandCount)}건 발생`}`,
    `- 물리 선폭 계측(${String(preservedAudit.dpi)}DPI): 최소 ${minMm}mm / 제판 권장 하한 ${safeMm}mm${preservedAudit.belowPrintMinimum ? ' (하한 미만 — 인쇄 시 뭉개짐 방지를 위해 선폭 보강 권장)' : ' (제판 안전 범위)'}`,
    `- 노이즈 정리: 고립 먼지 ${String(comparison.specklesRemoved)}개 제거, 잔여 먼지 ${String(preservedAudit.speckleCount)}개`,
    `- 판하 무결성 지문(SHA-256): ${shortHash}`,
  ];

  if (preservedAudit.warningsKo.length > 0) {
    lines.push(`- 점검 항목: ${preservedAudit.warningsKo.join(' / ')}`);
  }

  return lines.join('\n');
}
