/**
 * Wave 138 — 순수 OKLCH 세로 슬라이스 검수 지도 SVG 렌더러 및 한국어 출고 QA 브리프.
 *
 * - SVG 내부 모든 색상은 순수 `oklch(...)`만 사용해 raw hex/rgb/hsl 문자열을 원천 차단한다.
 * - 좌측에 단순 고정 분할선(위험 절단 강조), 중앙에 DP 지능형 분할선과 보호 영역(얼굴·말풍선·효과음),
 *   우측에 플랫폼별 용량·파일 수·품질 요약 배지를 배치한다.
 * - 모든 동적 텍스트는 XML/XSS 이스케이프를 거친다.
 */

import type {
  MultiPlatformSliceBundle,
  NaiveVsSmartSliceComparison,
  PlatformSlicePlan,
  ProtectedSpanKind,
  SliceAuditGrade,
} from "./platform-slice-types";

export interface RenderSmartSliceSvgOptions {
  readonly titleOverrideKo?: string;
  /** 함께 전달하면 우측 패널에 전 플랫폼 용량·파일 수 요약 배지를 표시한다. */
  readonly bundle?: MultiPlatformSliceBundle;
}

export interface SummarizeSliceAuditKoOptions {
  readonly generatedDateIso?: string;
}

const SLICE_SVG_OKLCH = {
  canvasBg: "oklch(0.980 0.007 90)",
  panelBg: "oklch(1.000 0.000 0)",
  headerBg: "oklch(0.955 0.010 88)",
  stripBg: "oklch(0.972 0.006 90)",
  borderSoft: "oklch(0.320 0.036 158 / 0.22)",
  borderStrong: "oklch(0.280 0.048 158 / 0.46)",
  inkPrimary: "oklch(0.230 0.042 158)",
  inkSecondary: "oklch(0.410 0.026 158)",
  inkMuted: "oklch(0.510 0.020 158)",
  forestAccent: "oklch(0.350 0.082 158)",
  faceFill: "oklch(0.640 0.165 24 / 0.26)",
  faceStroke: "oklch(0.470 0.175 24)",
  balloonFill: "oklch(0.620 0.140 245 / 0.24)",
  balloonStroke: "oklch(0.420 0.145 245)",
  sfxFill: "oklch(0.740 0.155 76 / 0.28)",
  sfxStroke: "oklch(0.480 0.145 68)",
  seamFill: "oklch(0.560 0.025 250 / 0.22)",
  seamStroke: "oklch(0.400 0.030 250)",
  gutterFill: "oklch(0.890 0.065 152 / 0.42)",
  gutterStroke: "oklch(0.440 0.115 152)",
  cutDanger: "oklch(0.520 0.210 26)",
  cutDangerBg: "oklch(0.930 0.060 24)",
  cutSafe: "oklch(0.430 0.135 152)",
  cutWarn: "oklch(0.550 0.160 66)",
  cutNeutral: "oklch(0.480 0.030 250)",
  energyLine: "oklch(0.450 0.110 255 / 0.72)",
  passFill: "oklch(0.935 0.045 152)",
  passStroke: "oklch(0.420 0.115 152)",
  passText: "oklch(0.250 0.078 152)",
  warnFill: "oklch(0.945 0.065 78)",
  warnStroke: "oklch(0.550 0.145 68)",
  warnText: "oklch(0.320 0.095 62)",
  failFill: "oklch(0.930 0.058 24)",
  failStroke: "oklch(0.520 0.185 26)",
  failText: "oklch(0.310 0.125 26)",
} as const;

const FONT_SANS = "Pretendard, Apple SD Gothic Neo, sans-serif";
const FONT_MONO = "ui-monospace, SFMono-Regular, monospace";

/** XML/XSS 특수문자(`&`, `<`, `>`, `"`, `'`)를 안전하게 이스케이프한다. */
export function escapeSliceSvgXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtSvgNum(value: number, fallback = 0): string {
  const safe = Number.isFinite(value) ? Math.round(value * 100) / 100 : fallback;
  return String(safe);
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function gradePalette(grade: SliceAuditGrade): {
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
  readonly labelKo: string;
} {
  if (grade === "PASS") {
    return {
      fill: SLICE_SVG_OKLCH.passFill,
      stroke: SLICE_SVG_OKLCH.passStroke,
      text: SLICE_SVG_OKLCH.passText,
      labelKo: "출고 적합 (PASS)",
    };
  }
  if (grade === "WARN") {
    return {
      fill: SLICE_SVG_OKLCH.warnFill,
      stroke: SLICE_SVG_OKLCH.warnStroke,
      text: SLICE_SVG_OKLCH.warnText,
      labelKo: "조건부 확인 (WARN)",
    };
  }
  return {
    fill: SLICE_SVG_OKLCH.failFill,
    stroke: SLICE_SVG_OKLCH.failStroke,
    text: SLICE_SVG_OKLCH.failText,
    labelKo: "출고 보류 (FAIL)",
  };
}

function spanVisualStyle(kind: ProtectedSpanKind): {
  readonly fill: string;
  readonly stroke: string;
  readonly tagKo: string;
} {
  if (kind === "character-face") {
    return { fill: SLICE_SVG_OKLCH.faceFill, stroke: SLICE_SVG_OKLCH.faceStroke, tagKo: "얼굴" };
  }
  if (kind === "dialogue-balloon") {
    return {
      fill: SLICE_SVG_OKLCH.balloonFill,
      stroke: SLICE_SVG_OKLCH.balloonStroke,
      tagKo: "말풍선",
    };
  }
  if (kind === "sfx-lettering") {
    return { fill: SLICE_SVG_OKLCH.sfxFill, stroke: SLICE_SVG_OKLCH.sfxStroke, tagKo: "효과음" };
  }
  if (kind === "panel-border-seam") {
    return { fill: SLICE_SVG_OKLCH.seamFill, stroke: SLICE_SVG_OKLCH.seamStroke, tagKo: "컷선" };
  }
  return { fill: SLICE_SVG_OKLCH.gutterFill, stroke: SLICE_SVG_OKLCH.gutterStroke, tagKo: "여백" };
}

function renderVerticalStripColumn(
  plan: PlatformSlicePlan,
  titleKo: string,
  subtitleKo: string,
  x: number,
  y: number,
  w: number,
  h: number,
  showEnergyProfile: boolean,
): readonly string[] {
  const out: string[] = [];
  out.push(
    `  <rect x="${fmtSvgNum(x)}" y="${fmtSvgNum(y)}" width="${fmtSvgNum(w)}" height="${fmtSvgNum(h)}" rx="10" fill="${SLICE_SVG_OKLCH.panelBg}" stroke="${SLICE_SVG_OKLCH.borderSoft}" stroke-width="1" />`,
  );
  out.push(
    `  <text x="${fmtSvgNum(x + 14)}" y="${fmtSvgNum(y + 24)}" font-family="${FONT_SANS}" font-size="13" font-weight="700" fill="${SLICE_SVG_OKLCH.inkPrimary}">${escapeSliceSvgXml(titleKo)}</text>`,
  );
  out.push(
    `  <text x="${fmtSvgNum(x + 14)}" y="${fmtSvgNum(y + 41)}" font-family="${FONT_MONO}" font-size="10" fill="${SLICE_SVG_OKLCH.inkSecondary}">${escapeSliceSvgXml(subtitleKo)}</text>`,
  );

  const stripX = x + 16;
  const stripY = y + 54;
  const stripW = showEnergyProfile ? w - 68 : w - 32;
  const stripH = h - 72;
  const scaleY = stripH / Math.max(1, plan.scaledHeightPx);

  out.push(
    `  <rect x="${fmtSvgNum(stripX)}" y="${fmtSvgNum(stripY)}" width="${fmtSvgNum(stripW)}" height="${fmtSvgNum(stripH)}" rx="6" fill="${SLICE_SVG_OKLCH.stripBg}" stroke="${SLICE_SVG_OKLCH.borderStrong}" stroke-width="1.1" />`,
  );

  // 보호 영역(여백 먼저, 그 위에 얼굴·말풍선·효과음 오버레이).
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < plan.scaledProtectedSpans.length; i += 1) {
      const span = plan.scaledProtectedSpans[i];
      const isGutter = span.kind === "gutter-safe-band";
      if ((pass === 0 && !isGutter) || (pass === 1 && isGutter)) continue;

      const sy = stripY + span.startY * scaleY;
      const sh = Math.max(2.5, (span.endY - span.startY) * scaleY);
      const inset = isGutter ? 2 : 8;
      const style = spanVisualStyle(span.kind);
      out.push(
        `  <rect x="${fmtSvgNum(stripX + inset)}" y="${fmtSvgNum(sy)}" width="${fmtSvgNum(Math.max(8, stripW - inset * 2))}" height="${fmtSvgNum(sh)}" rx="3" fill="${style.fill}" stroke="${style.stroke}" stroke-width="${isGutter ? "0.8" : "1.1"}" />`,
      );
      if (!isGutter && sh >= 12) {
        const label = `${style.tagKo}: ${span.labelKo}`;
        const clippedLabel = label.length > 22 ? `${label.slice(0, 21)}…` : label;
        out.push(
          `  <text x="${fmtSvgNum(stripX + inset + 5)}" y="${fmtSvgNum(sy + Math.min(sh - 2, 10.5))}" font-family="${FONT_SANS}" font-size="8.5" font-weight="600" fill="${SLICE_SVG_OKLCH.inkPrimary}">${escapeSliceSvgXml(clippedLabel)}</text>`,
        );
      }
    }
  }

  // 위험 절단 y 좌표 집합 구성.
  const criticalCutSet = new Set<number>();
  const forcedOversizedCutSet = new Set<number>();
  for (let i = 0; i < plan.violations.length; i += 1) {
    const v = plan.violations[i];
    if (v.forcedOversized) {
      forcedOversizedCutSet.add(v.cutY);
    } else if (v.severity === "critical") {
      criticalCutSet.add(v.cutY);
    }
  }

  // 절단선 그리기.
  for (let i = 0; i < plan.cutPositionsY.length; i += 1) {
    const cutY = plan.cutPositionsY[i];
    const py = stripY + cutY * scaleY;
    const isCritical = criticalCutSet.has(cutY);
    const isForced = forcedOversizedCutSet.has(cutY);
    const slice = plan.slices[i];
    const isGutterCut = slice !== undefined && slice.cutInGutterBand;

    const strokeColor = isCritical
      ? SLICE_SVG_OKLCH.cutDanger
      : isForced
        ? SLICE_SVG_OKLCH.cutWarn
        : plan.strategy === "dp-smart" || isGutterCut
          ? SLICE_SVG_OKLCH.cutSafe
          : SLICE_SVG_OKLCH.cutNeutral;

    const strokeDash = isCritical ? "" : isForced ? "4 2" : "5 3";
    const dashAttr = strokeDash.length > 0 ? ` stroke-dasharray="${strokeDash}"` : "";
    out.push(
      `  <line x1="${fmtSvgNum(stripX - 3)}" y1="${fmtSvgNum(py)}" x2="${fmtSvgNum(stripX + stripW + 3)}" y2="${fmtSvgNum(py)}" stroke="${strokeColor}" stroke-width="${isCritical ? "2.4" : "1.6"}"${dashAttr} />`,
    );

    if (isCritical) {
      out.push(
        `  <rect x="${fmtSvgNum(stripX + stripW - 56)}" y="${fmtSvgNum(py - 8)}" width="52" height="14" rx="4" fill="${SLICE_SVG_OKLCH.cutDangerBg}" stroke="${SLICE_SVG_OKLCH.cutDanger}" stroke-width="0.9" />`,
      );
      out.push(
        `  <text x="${fmtSvgNum(stripX + stripW - 51)}" y="${fmtSvgNum(py + 2)}" font-family="${FONT_SANS}" font-size="8" font-weight="700" fill="${SLICE_SVG_OKLCH.failText}">위험 절단</text>`,
      );
    } else if (isForced) {
      out.push(
        `  <rect x="${fmtSvgNum(stripX + stripW - 64)}" y="${fmtSvgNum(py - 8)}" width="60" height="14" rx="4" fill="${SLICE_SVG_OKLCH.warnFill}" stroke="${SLICE_SVG_OKLCH.cutWarn}" stroke-width="0.9" />`,
      );
      out.push(
        `  <text x="${fmtSvgNum(stripX + stripW - 59)}" y="${fmtSvgNum(py + 2)}" font-family="${FONT_SANS}" font-size="8" font-weight="700" fill="${SLICE_SVG_OKLCH.warnText}">저에너지 분할</text>`,
      );
    }
  }

  // 선택: 우측 가장자리 행 시각 에너지 프로파일 미니 그래프.
  if (showEnergyProfile && plan.normalizedRowEnergy.length > 0) {
    const graphX = stripX + stripW + 8;
    const graphW = 32;
    out.push(
      `  <rect x="${fmtSvgNum(graphX)}" y="${fmtSvgNum(stripY)}" width="${fmtSvgNum(graphW)}" height="${fmtSvgNum(stripH)}" rx="4" fill="${SLICE_SVG_OKLCH.canvasBg}" stroke="${SLICE_SVG_OKLCH.borderSoft}" stroke-width="0.8" />`,
    );
    const sampleCount = Math.min(80, plan.normalizedRowEnergy.length);
    const pts: string[] = [];
    for (let s = 0; s < sampleCount; s += 1) {
      const rowIdx = Math.min(
        plan.normalizedRowEnergy.length - 1,
        Math.floor((s * plan.normalizedRowEnergy.length) / Math.max(1, sampleCount)),
      );
      const energy = Math.max(0, Math.min(1, plan.normalizedRowEnergy[rowIdx]));
      const px = graphX + 2 + energy * (graphW - 4);
      const py = stripY + (s / Math.max(1, sampleCount - 1)) * stripH;
      pts.push(`${fmtSvgNum(px)},${fmtSvgNum(py)}`);
    }
    if (pts.length > 1) {
      out.push(
        `  <polyline points="${pts.join(" ")}" fill="none" stroke="${SLICE_SVG_OKLCH.energyLine}" stroke-width="1.3" stroke-linejoin="round" />`,
      );
    }
    out.push(
      `  <text x="${fmtSvgNum(graphX + 2)}" y="${fmtSvgNum(stripY + stripH + 12)}" font-family="${FONT_SANS}" font-size="8.5" fill="${SLICE_SVG_OKLCH.inkMuted}">에너지</text>`,
    );
  }

  return out;
}

function renderSummarySidePanel(
  comparison: NaiveVsSmartSliceComparison,
  x: number,
  y: number,
  w: number,
  h: number,
  bundle?: MultiPlatformSliceBundle,
): readonly string[] {
  const out: string[] = [];
  out.push(
    `  <rect x="${fmtSvgNum(x)}" y="${fmtSvgNum(y)}" width="${fmtSvgNum(w)}" height="${fmtSvgNum(h)}" rx="10" fill="${SLICE_SVG_OKLCH.panelBg}" stroke="${SLICE_SVG_OKLCH.borderSoft}" stroke-width="1" />`,
  );
  out.push(
    `  <text x="${fmtSvgNum(x + 16)}" y="${fmtSvgNum(y + 24)}" font-family="${FONT_SANS}" font-size="13" font-weight="700" fill="${SLICE_SVG_OKLCH.inkPrimary}">절단 방지 성과 · 플랫폼 출고 배지</text>`,
  );

  // 전후 핵심 비교 KPI 카드.
  const kpiY = y + 38;
  const kpiW = w - 32;
  out.push(
    `  <rect x="${fmtSvgNum(x + 16)}" y="${fmtSvgNum(kpiY)}" width="${fmtSvgNum(kpiW)}" height="82" rx="8" fill="${SLICE_SVG_OKLCH.headerBg}" stroke="${SLICE_SVG_OKLCH.borderSoft}" stroke-width="1" />`,
  );
  out.push(
    `  <text x="${fmtSvgNum(x + 28)}" y="${fmtSvgNum(kpiY + 22)}" font-family="${FONT_SANS}" font-size="11" font-weight="700" fill="${SLICE_SVG_OKLCH.inkSecondary}">치명 절단(얼굴 · 말풍선 · 효과음)</text>`,
  );
  out.push(
    `  <text x="${fmtSvgNum(x + 28)}" y="${fmtSvgNum(kpiY + 46)}" font-family="${FONT_MONO}" font-size="16" font-weight="800" fill="${SLICE_SVG_OKLCH.forestAccent}">고정 ${String(comparison.naive.criticalCutCount)}건 → DP ${String(comparison.smart.criticalCutCount)}건</text>`,
  );
  out.push(
    `  <text x="${fmtSvgNum(x + 28)}" y="${fmtSvgNum(kpiY + 67)}" font-family="${FONT_MONO}" font-size="10" fill="${SLICE_SVG_OKLCH.inkSecondary}">여백 정렬 ${String(comparison.smart.gutterAlignedCutCount)}곳 · 에너지 절감 ${(comparison.cutEnergyReductionRatio * 100).toFixed(1)}%</text>`,
  );

  // 보호 영역 범례.
  const legendY = kpiY + 98;
  const legendKinds: readonly ProtectedSpanKind[] = [
    "character-face",
    "dialogue-balloon",
    "sfx-lettering",
    "gutter-safe-band",
  ];
  out.push(
    `  <text x="${fmtSvgNum(x + 16)}" y="${fmtSvgNum(legendY)}" font-family="${FONT_SANS}" font-size="11" font-weight="700" fill="${SLICE_SVG_OKLCH.inkPrimary}">보호 영역 범례</text>`,
  );
  for (let i = 0; i < legendKinds.length; i += 1) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const lx = x + 16 + col * 140;
    const ly = legendY + 12 + row * 22;
    const st = spanVisualStyle(legendKinds[i]);
    out.push(
      `  <rect x="${fmtSvgNum(lx)}" y="${fmtSvgNum(ly)}" width="14" height="12" rx="3" fill="${st.fill}" stroke="${st.stroke}" stroke-width="1" />`,
    );
    out.push(
      `  <text x="${fmtSvgNum(lx + 20)}" y="${fmtSvgNum(ly + 10)}" font-family="${FONT_SANS}" font-size="10.5" fill="${SLICE_SVG_OKLCH.inkSecondary}">${escapeSliceSvgXml(st.tagKo)} 보호대</text>`,
    );
  }

  // 플랫폼별 용량·파일 수 요약 배지 목록.
  const listTitleY = legendY + 72;
  out.push(
    `  <text x="${fmtSvgNum(x + 16)}" y="${fmtSvgNum(listTitleY)}" font-family="${FONT_SANS}" font-size="11.5" font-weight="700" fill="${SLICE_SVG_OKLCH.inkPrimary}">플랫폼별 출고 요약 배지</text>`,
  );

  const plansToRender: PlatformSlicePlan[] = [];
  if (bundle !== undefined) {
    for (let i = 0; i < bundle.platformIds.length; i += 1) {
      const p = bundle.plansByPlatform[bundle.platformIds[i]];
      if (p !== undefined) plansToRender.push(p);
    }
  } else {
    plansToRender.push(comparison.smart);
  }

  const cardStartY = listTitleY + 12;
  const cardH = 54;
  const cardGap = 8;

  for (let i = 0; i < plansToRender.length && i < 5; i += 1) {
    const p = plansToRender[i];
    const cy = cardStartY + i * (cardH + cardGap);
    const badge = gradePalette(p.auditGrade);
    out.push(
      `  <rect x="${fmtSvgNum(x + 16)}" y="${fmtSvgNum(cy)}" width="${fmtSvgNum(kpiW)}" height="${fmtSvgNum(cardH)}" rx="7" fill="${SLICE_SVG_OKLCH.stripBg}" stroke="${SLICE_SVG_OKLCH.borderSoft}" stroke-width="1" />`,
    );
    out.push(
      `  <text x="${fmtSvgNum(x + 26)}" y="${fmtSvgNum(cy + 20)}" font-family="${FONT_SANS}" font-size="11" font-weight="700" fill="${SLICE_SVG_OKLCH.inkPrimary}">${escapeSliceSvgXml(p.preset.nameKo)}</text>`,
    );
    out.push(
      `  <rect x="${fmtSvgNum(x + 16 + kpiW - 76)}" y="${fmtSvgNum(cy + 8)}" width="66" height="18" rx="5" fill="${badge.fill}" stroke="${badge.stroke}" stroke-width="0.9" />`,
    );
    out.push(
      `  <text x="${fmtSvgNum(x + 16 + kpiW - 60)}" y="${fmtSvgNum(cy + 20)}" font-family="${FONT_MONO}" font-size="9.5" font-weight="700" fill="${badge.text}">${p.auditGrade}</text>`,
    );
    const detail = `${String(p.slices.length)}/${String(p.budget.maxSliceCount)}장 · ${formatMegabytes(p.budget.totalEstimatedBytes)}/${formatMegabytes(p.budget.maxTotalEpisodeBytes)} · Q${String(p.budget.lowestSelectedQuality)} · 절단 ${String(p.criticalCutCount)}건`;
    out.push(
      `  <text x="${fmtSvgNum(x + 26)}" y="${fmtSvgNum(cy + 40)}" font-family="${FONT_MONO}" font-size="9.5" fill="${SLICE_SVG_OKLCH.inkSecondary}">${escapeSliceSvgXml(detail)}</text>`,
    );
  }

  if (bundle !== undefined) {
    const hashY = y + h - 16;
    out.push(
      `  <text x="${fmtSvgNum(x + 16)}" y="${fmtSvgNum(hashY)}" font-family="${FONT_MONO}" font-size="9" fill="${SLICE_SVG_OKLCH.inkMuted}">SHA-256 ${escapeSliceSvgXml(bundle.manifestSha256Hex.slice(0, 24))}…</text>`,
    );
  }

  return out;
}

/**
 * 단순 고정 분할(좌측)과 DP 지능형 슬라이스(중앙) 및 플랫폼 출고 배지(우측)를 순수 OKLCH SVG로 렌더링한다.
 */
export function renderSmartSliceComparisonSvg(
  comparison: NaiveVsSmartSliceComparison,
  options?: RenderSmartSliceSvgOptions,
): string {
  const totalW = 980;
  const totalH = 668;
  const padX = 24;
  const padY = 20;
  const headerH = 68;
  const gap = 16;

  const titleText = options?.titleOverrideKo ?? comparison.smart.episodeTitleKo;
  const badge = gradePalette(comparison.smart.auditGrade);
  const subtitle = `${comparison.preset.nameKo} (${comparison.preset.id}) · 마스터 ${String(comparison.smart.masterWidthPx)}×${String(comparison.smart.masterHeightPx)}px → 출력 ${String(comparison.smart.scaledWidthPx)}×${String(comparison.smart.scaledHeightPx)}px · 최대 ${String(comparison.preset.maxSliceHeightPx)}px`;

  const bodyY = padY + headerH + gap;
  const bodyH = totalH - bodyY - padY;
  const col1W = 264;
  const col2W = 300;
  const col3W = totalW - padX * 2 - col1W - col2W - gap * 2;
  const col1X = padX;
  const col2X = col1X + col1W + gap;
  const col3X = col2X + col2W + gap;

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(totalW)} ${String(totalH)}" width="${String(totalW)}" height="${String(totalH)}" role="img" aria-label="${escapeSliceSvgXml(`${titleText} 멀티 플랫폼 스마트 슬라이스 검수 지도`)}">`,
    `  <rect x="0" y="0" width="${String(totalW)}" height="${String(totalH)}" fill="${SLICE_SVG_OKLCH.canvasBg}" />`,
    `  <rect x="${String(padX)}" y="${String(padY)}" width="${String(totalW - padX * 2)}" height="${String(headerH)}" rx="12" fill="${SLICE_SVG_OKLCH.headerBg}" stroke="${SLICE_SVG_OKLCH.borderSoft}" stroke-width="1" />`,
    `  <text x="${String(padX + 18)}" y="${String(padY + 28)}" font-family="${FONT_SANS}" font-size="17" font-weight="800" fill="${SLICE_SVG_OKLCH.inkPrimary}">${escapeSliceSvgXml(titleText)}</text>`,
    `  <text x="${String(padX + 18)}" y="${String(padY + 50)}" font-family="${FONT_MONO}" font-size="10.5" fill="${SLICE_SVG_OKLCH.inkSecondary}">${escapeSliceSvgXml(subtitle)}</text>`,
    `  <rect x="${String(totalW - padX - 178)}" y="${String(padY + 18)}" width="160" height="32" rx="8" fill="${badge.fill}" stroke="${badge.stroke}" stroke-width="1.4" />`,
    `  <text x="${String(totalW - padX - 162)}" y="${String(padY + 38)}" font-family="${FONT_SANS}" font-size="12" font-weight="800" fill="${badge.text}">${escapeSliceSvgXml(badge.labelKo)}</text>`,
  ];

  lines.push(
    ...renderVerticalStripColumn(
      comparison.naive,
      "단순 고정 높이 분할",
      `${String(comparison.naive.slices.length)}장 · 치명 절단 ${String(comparison.naive.criticalCutCount)}건`,
      col1X,
      bodyY,
      col1W,
      bodyH,
      false,
    ),
  );
  lines.push(
    ...renderVerticalStripColumn(
      comparison.smart,
      "DP 스마트 절단 제로 리패킹",
      `${String(comparison.smart.slices.length)}장 · 치명 절단 ${String(comparison.smart.criticalCutCount)}건 · 여백 ${String(comparison.smart.gutterAlignedCutCount)}곳`,
      col2X,
      bodyY,
      col2W,
      bodyH,
      true,
    ),
  );
  lines.push(
    ...renderSummarySidePanel(comparison, col3X, bodyY, col3W, bodyH, options?.bundle),
  );
  lines.push("</svg>");

  return lines.join("\n");
}

/**
 * 번역투 없는 자연스러운 한국어 멀티 플랫폼 출고 검수 요약 브리프를 생성한다.
 */
export function summarizeMultiPlatformSliceAuditKo(
  bundle: MultiPlatformSliceBundle,
  options?: SummarizeSliceAuditKoOptions,
): string {
  const dateSuffix =
    options?.generatedDateIso !== undefined
      ? ` (${options.generatedDateIso})`
      : bundle.generatedAtIso !== undefined
        ? ` (${bundle.generatedAtIso})`
        : "";

  const verdictKo =
    bundle.aggregate.overallGrade === "PASS"
      ? "전 플랫폼 출고 적합"
      : bundle.aggregate.overallGrade === "WARN"
        ? "조건부 출고(경고 항목 확인 필요)"
        : "출고 보류(규격 초과 또는 치명 절단 수정 필요)";

  const lines: string[] = [
    `[멀티 플랫폼 스마트 슬라이스 출고 QA 브리프] ${bundle.episodeTitleKo}${dateSuffix}`,
    `- 회차 식별자: ${bundle.episodeId} · 마스터 규격 ${String(bundle.masterWidthPx)}×${String(bundle.masterHeightPx)}px`,
    `- 종합 판정: ${verdictKo} (${bundle.aggregate.overallGrade}) · PASS ${String(bundle.aggregate.passCount)} / WARN ${String(bundle.aggregate.warnCount)} / FAIL ${String(bundle.aggregate.failCount)}`,
    `- 절단 차단 성과: 단순 고정 분할 치명 절단 ${String(bundle.aggregate.totalNaiveCriticalCuts)}건 → DP 리패킹 ${String(bundle.aggregate.totalSmartCriticalCuts)}건 (총 ${String(bundle.aggregate.totalPreventedCriticalCuts)}건 차단)`,
    `- 총 출고 파일: ${String(bundle.aggregate.totalSmartSliceFiles)}장 · 합계 용량 ${formatMegabytes(bundle.aggregate.totalSmartEstimatedBytes)}`,
    `- 매니페스트 SHA-256: ${bundle.manifestSha256Hex}`,
    "- 플랫폼별 검수 결과:",
  ];

  for (let i = 0; i < bundle.platformIds.length; i += 1) {
    const pid = bundle.platformIds[i];
    const cmp = bundle.comparisonsByPlatform[pid];
    if (cmp === undefined) continue;
    const s = cmp.smart;
    lines.push(
      `  · ${s.preset.nameKo} [${s.auditGrade}]: ${String(s.scaledWidthPx)}×${String(s.scaledHeightPx)}px (${String(s.slices.length)}/${String(s.budget.maxSliceCount)}장, ${formatMegabytes(s.budget.totalEstimatedBytes)}/${formatMegabytes(s.budget.maxTotalEpisodeBytes)}, 최저 Q${String(s.budget.lowestSelectedQuality)}) · 치명 절단 ${String(cmp.naive.criticalCutCount)}건 → ${String(s.criticalCutCount)}건 · 여백 정렬 ${String(s.gutterAlignedCutCount)}곳`,
    );
    for (let w = 0; w < s.warningsKo.length; w += 1) {
      lines.push(`    - 알림: ${s.warningsKo[w]}`);
    }
  }

  if (bundle.aggregate.overallGrade === "PASS") {
    lines.push(
      "- 담당자 소견: 모든 대상 플랫폼에서 얼굴·말풍선 절단 없이 파일 수와 용량 상한을 안정적으로 맞췄습니다. 바로 납품 패키지로 묶어도 됩니다.",
    );
  } else if (bundle.aggregate.overallGrade === "WARN") {
    lines.push(
      "- 담당자 소견: 치명 오류는 없으나 품질 자동 조정 또는 초대형 스플래시 분할 구간을 육안으로 한 번 확인한 뒤 출고하세요.",
    );
  } else {
    lines.push(
      "- 담당자 소견: 규격 상한을 넘었거나 보호 영역 절단이 남아 있는 플랫폼이 있습니다. 원고 해상도·여백 배치를 손본 뒤 다시 컴파일하세요.",
    );
  }

  return lines.join("\n");
}
