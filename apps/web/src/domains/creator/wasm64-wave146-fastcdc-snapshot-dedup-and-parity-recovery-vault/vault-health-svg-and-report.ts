/**
 * Wave 146 — 순수 OKLCH 금고 중복제거·패리티 건강도 SVG 및 한국어 내구성 QA 브리프.
 *
 * - 원시 색상 표기 없이 순수 `oklch(...)` 토큰만 사용한다.
 * - 모든 사용자 입력 문자열의 XML 특수문자 5종(`<`, `>`, `&`, `"`, `'`)을 이스케이프하고
 *   모든 기하 좌표를 유한 수치(`NaN`/`Infinity` 0건)로 보정한다.
 */

import {
  computeVaultManifestSha256Hex,
  type FixedVsFastCdcComparisonReport,
} from "./fastcdc-rolling-chunker";
import type {
  DualParityHealStatus,
  VaultHealthSnapshot,
} from "./gf256-parity-and-snapshot-vault";

const VAULT_OKLCH_PALETTE = {
  canvasBg: "oklch(0.985 0.006 92)",
  cardBg: "oklch(0.996 0.003 92)",
  headerBg: "oklch(0.954 0.014 156)",
  rowAltBg: "oklch(0.972 0.007 92)",
  borderStrong: "oklch(0.28 0.045 158)",
  borderSoft: "oklch(0.84 0.015 92)",
  gridLine: "oklch(0.9 0.01 92)",
  textPrimary: "oklch(0.21 0.028 158)",
  textMuted: "oklch(0.45 0.024 158)",
  textInverse: "oklch(0.985 0.004 92)",
  barLogical: "oklch(0.85 0.022 92)",
  barStored: "oklch(0.36 0.088 158)",
  barFixed: "oklch(0.62 0.13 38)",
  barFastCdc: "oklch(0.42 0.115 158)",
  statusGoodBg: "oklch(0.34 0.075 158)",
  statusHealedBg: "oklch(0.47 0.125 225)",
  statusWarnBg: "oklch(0.5 0.18 28)",
  shardHealthyFill: "oklch(0.92 0.045 158)",
  shardHealthyStroke: "oklch(0.42 0.105 158)",
  shardHealedFill: "oklch(0.92 0.055 225)",
  shardHealedStroke: "oklch(0.45 0.13 225)",
  shardParityFill: "oklch(0.94 0.042 78)",
  shardParityStroke: "oklch(0.52 0.13 72)",
  shardBrokenFill: "oklch(0.91 0.075 28)",
  shardBrokenStroke: "oklch(0.5 0.19 28)",
} as const;

export type VaultHealthGrade = "healthy" | "healed" | "degraded";

export interface SnapshotVaultHealthSvgOptions {
  readonly titleKo?: string;
  readonly shiftComparison?: FixedVsFastCdcComparisonReport | null;
  readonly maxSnapshotRows?: number;
  readonly maxStripeRows?: number;
}

export interface SnapshotVaultHealthReportKo {
  readonly overallGrade: VaultHealthGrade;
  readonly gradeLabelKo: string;
  readonly headlineKo: string;
  readonly bulletLinesKo: readonly string[];
  readonly fullBriefTextKo: string;
  readonly reportSha256Hex: string;
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/** XML 특수문자 5종(`<`, `>`, `&`, `"`, `'`)을 안전하게 이스케이프한다. */
export function escapeVaultXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncateText(raw: string, maxChars: number): string {
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, Math.max(1, maxChars - 1))}…`;
}

function formatBytesKo(bytes: number): string {
  const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (safe < 1024) return `${Math.round(safe)} B`;
  if (safe < 1024 * 1024) return `${(safe / 1024).toFixed(1)} KB`;
  return `${(safe / (1024 * 1024)).toFixed(2)} MB`;
}

function formatPct(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(1)}%`;
}

function classifyVaultGrade(health: VaultHealthSnapshot): VaultHealthGrade {
  const hasUnrecoverable = health.stripes.some(
    (s) =>
      s.lastStatus === "unrecoverable-exceeds-parity-budget" ||
      s.lastStatus === "unrecoverable-hash-mismatch",
  );
  if (hasUnrecoverable) return "degraded";
  const hasHealed = health.stripes.some((s) => s.lastStatus === "healed");
  if (hasHealed) return "healed";
  return "healthy";
}

function gradeBadgeLabelKo(grade: VaultHealthGrade): string {
  if (grade === "degraded") return "복구 예산 초과 경고";
  if (grade === "healed") return "자동 치유 완료";
  return "전 구간 무결성 정상";
}

function gradeBadgeFill(grade: VaultHealthGrade): string {
  if (grade === "degraded") return VAULT_OKLCH_PALETTE.statusWarnBg;
  if (grade === "healed") return VAULT_OKLCH_PALETTE.statusHealedBg;
  return VAULT_OKLCH_PALETTE.statusGoodBg;
}

function stripeStatusLabelKo(status: DualParityHealStatus): string {
  if (status === "healthy") return "정상";
  if (status === "healed") return "자가 치유";
  if (status === "unrecoverable-exceeds-parity-budget") return "3+ 손실 차단";
  return "해시 불일치";
}

function stripeStatusColors(status: DualParityHealStatus): {
  readonly fill: string;
  readonly stroke: string;
} {
  if (status === "healthy") {
    return {
      fill: VAULT_OKLCH_PALETTE.shardHealthyFill,
      stroke: VAULT_OKLCH_PALETTE.shardHealthyStroke,
    };
  }
  if (status === "healed") {
    return {
      fill: VAULT_OKLCH_PALETTE.shardHealedFill,
      stroke: VAULT_OKLCH_PALETTE.shardHealedStroke,
    };
  }
  return {
    fill: VAULT_OKLCH_PALETTE.shardBrokenFill,
    stroke: VAULT_OKLCH_PALETTE.shardBrokenStroke,
  };
}

/**
 * 스냅샷별 논리/실저장 용량 막대, 고정 청킹 vs FastCDC 시프트 내성 비교, GF(256) 스트라이프
 * 치유 상태를 순수 `oklch(...)` 색상만 사용해 인쇄 안전 SVG로 렌더링한다.
 */
export function renderSnapshotVaultHealthSvg(
  health: VaultHealthSnapshot,
  options?: SnapshotVaultHealthSvgOptions,
): string {
  const width = 1120;
  const padX = 28;
  const contentW = width - padX * 2;
  const titleKo =
    options?.titleKo?.trim() ||
    "ToonStudio 원고 증분 스냅샷 금고 · FastCDC 중복제거 & GF(256) 무결성";
  const shiftComparison = options?.shiftComparison ?? health.shiftBenchmark ?? null;
  const maxSnapshots = Math.max(1, Math.min(24, Math.floor(options?.maxSnapshotRows ?? 8)));
  const maxStripes = Math.max(1, Math.min(24, Math.floor(options?.maxStripeRows ?? 8)));

  const shownSnapshots = health.snapshots.slice(0, maxSnapshots);
  const shownStripes = health.stripes.slice(0, maxStripes);
  const grade = classifyVaultGrade(health);

  const snapRowH = 34;
  const snapSectionH = 66 + Math.max(1, shownSnapshots.length) * snapRowH + 18;
  const shiftSectionH = 148;
  const stripeRowH = 36;
  const stripeSectionH = 66 + Math.max(1, shownStripes.length) * stripeRowH + 18;

  const headerH = 74;
  const kpiH = 82;
  const footerH = 40;
  const gap = 16;

  const yHeader = 16;
  const yKpi = yHeader + headerH + gap;
  const ySnap = yKpi + kpiH + gap;
  const yShift = ySnap + snapSectionH + gap;
  const yStripe = yShift + shiftSectionH + gap;
  const yFooter = yStripe + stripeSectionH + 12;
  const totalHeight = yFooter + footerH + 12;

  const lines: string[] = [];
  const p = VAULT_OKLCH_PALETTE;
  const fontStack = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";

  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${fmt(totalHeight)}" viewBox="0 0 ${width} ${fmt(totalHeight)}" role="img" aria-label="${escapeVaultXml(titleKo)}">`,
  );
  lines.push(`<title>${escapeVaultXml(titleKo)}</title>`);
  lines.push(
    `<rect x="0" y="0" width="${width}" height="${fmt(totalHeight)}" fill="${p.canvasBg}"/>`,
  );

  // 1. 헤더 배너
  lines.push(
    `<rect x="${padX}" y="${fmt(yHeader)}" width="${contentW}" height="${headerH}" rx="12" fill="${p.headerBg}" stroke="${p.borderStrong}" stroke-width="1.2"/>`,
  );
  lines.push(
    `<text x="${padX + 20}" y="${fmt(yHeader + 31)}" font-family="${fontStack}" font-size="18" font-weight="700" fill="${p.textPrimary}">${escapeVaultXml(truncateText(titleKo, 62))}</text>`,
  );
  const subHeader = `FastCDC 평균 청크 ${formatBytesKo(health.chunkingOptions.avgChunkBytes)} · 스트라이프 폭 K=${health.stripeDataShards}+2(P/Q) · 활성 스냅샷 ${health.activeSnapshotCount}건`;
  lines.push(
    `<text x="${padX + 20}" y="${fmt(yHeader + 54)}" font-family="${fontStack}" font-size="12" fill="${p.textMuted}">${escapeVaultXml(subHeader)}</text>`,
  );
  const badgeW = 168;
  const badgeX = padX + contentW - badgeW - 18;
  lines.push(
    `<rect x="${fmt(badgeX)}" y="${fmt(yHeader + 20)}" width="${badgeW}" height="34" rx="17" fill="${gradeBadgeFill(grade)}"/>`,
  );
  lines.push(
    `<text x="${fmt(badgeX + badgeW / 2)}" y="${fmt(yHeader + 41)}" text-anchor="middle" font-family="${fontStack}" font-size="12.5" font-weight="700" fill="${p.textInverse}">${escapeVaultXml(gradeBadgeLabelKo(grade))}</text>`,
  );

  // 2. KPI 요약 카드 4종
  const kpiGap = 12;
  const kpiW = (contentW - kpiGap * 3) / 4;
  const healthyStripes = health.stripes.filter((s) => s.lastStatus === "healthy").length;
  const healedStripes = health.stripes.filter((s) => s.lastStatus === "healed").length;
  const kpiCards = [
    {
      label: "누적 논리 원고 용량",
      value: formatBytesKo(health.totalLogicalBytes),
      sub: `스냅샷 ${health.activeSnapshotCount}건 합계`,
    },
    {
      label: "실저장 고유 청크 용량",
      value: formatBytesKo(health.totalUniqueChunkBytes),
      sub: `고유 청크 ${health.uniqueChunkCount}개 · 패리티 ${formatBytesKo(health.totalParityBytes)}`,
    },
    {
      label: "FastCDC 중복제거 절감률",
      value: formatPct(health.dedupSavingsPercent),
      sub: `절감 ${formatBytesKo(health.dedupSavedBytes)} (패리티 포함 ${formatPct(health.effectiveSavingsAfterParityPercent)})`,
    },
    {
      label: "GF(256) 스트라이프 상태",
      value: `${healthyStripes + healedStripes}/${health.stripeCount} 정상`,
      sub: `자동 치유 ${healedStripes}건 · 미참조 청크 ${health.unreferencedChunkCount}개`,
    },
  ];
  for (let i = 0; i < kpiCards.length; i += 1) {
    const card = kpiCards[i];
    if (!card) continue;
    const cx = padX + i * (kpiW + kpiGap);
    lines.push(
      `<rect x="${fmt(cx)}" y="${fmt(yKpi)}" width="${fmt(kpiW)}" height="${kpiH}" rx="10" fill="${p.cardBg}" stroke="${p.borderSoft}" stroke-width="1"/>`,
    );
    lines.push(
      `<text x="${fmt(cx + 14)}" y="${fmt(yKpi + 24)}" font-family="${fontStack}" font-size="11.5" fill="${p.textMuted}">${escapeVaultXml(card.label)}</text>`,
    );
    lines.push(
      `<text x="${fmt(cx + 14)}" y="${fmt(yKpi + 51)}" font-family="${fontStack}" font-size="20" font-weight="700" fill="${p.textPrimary}">${escapeVaultXml(card.value)}</text>`,
    );
    lines.push(
      `<text x="${fmt(cx + 14)}" y="${fmt(yKpi + 70)}" font-family="${fontStack}" font-size="11" fill="${p.textMuted}">${escapeVaultXml(truncateText(card.sub, 34))}</text>`,
    );
  }

  // 3. 섹션 1: 스냅샷별 논리 용량 vs 실저장 중복제거 용량 막대
  lines.push(
    `<rect x="${padX}" y="${fmt(ySnap)}" width="${contentW}" height="${fmt(snapSectionH)}" rx="10" fill="${p.cardBg}" stroke="${p.borderSoft}" stroke-width="1"/>`,
  );
  lines.push(
    `<text x="${padX + 18}" y="${fmt(ySnap + 28)}" font-family="${fontStack}" font-size="14" font-weight="700" fill="${p.textPrimary}">스냅샷별 논리 용량 vs 신규 실저장 용량</text>`,
  );
  lines.push(
    `<rect x="${padX + contentW - 255}" y="${fmt(ySnap + 16)}" width="12" height="12" rx="3" fill="${p.barLogical}"/>`,
  );
  lines.push(
    `<text x="${padX + contentW - 237}" y="${fmt(ySnap + 26)}" font-family="${fontStack}" font-size="11" fill="${p.textMuted}">논리 용량</text>`,
  );
  lines.push(
    `<rect x="${padX + contentW - 155}" y="${fmt(ySnap + 16)}" width="12" height="12" rx="3" fill="${p.barStored}"/>`,
  );
  lines.push(
    `<text x="${padX + contentW - 137}" y="${fmt(ySnap + 26)}" font-family="${fontStack}" font-size="11" fill="${p.textMuted}">신규 저장(중복제거 후)</text>`,
  );

  if (shownSnapshots.length === 0) {
    lines.push(
      `<text x="${padX + 18}" y="${fmt(ySnap + 74)}" font-family="${fontStack}" font-size="12" fill="${p.textMuted}">커밋된 원고 스냅샷이 아직 없습니다.</text>`,
    );
  } else {
    let maxLogical = 1;
    for (let i = 0; i < shownSnapshots.length; i += 1) {
      const sz = shownSnapshots[i]?.logicalBytes ?? 0;
      if (sz > maxLogical) maxLogical = sz;
    }
    const labelColW = 240;
    const barAreaX = padX + labelColW;
    const barMaxW = contentW - labelColW - 210;
    for (let i = 0; i < shownSnapshots.length; i += 1) {
      const snap = shownSnapshots[i];
      if (!snap) continue;
      const ry = ySnap + 50 + i * snapRowH;
      if (i % 2 === 1) {
        lines.push(
          `<rect x="${padX + 10}" y="${fmt(ry - 4)}" width="${contentW - 20}" height="${snapRowH}" rx="6" fill="${p.rowAltBg}"/>`,
        );
      }
      const labelText = truncateText(`${snap.episodeId} · ${snap.revisionLabel}`, 28);
      lines.push(
        `<text x="${padX + 18}" y="${fmt(ry + 17)}" font-family="${fontStack}" font-size="12" font-weight="600" fill="${p.textPrimary}">${escapeVaultXml(labelText)}</text>`,
      );
      const logicalW = Math.max(4, clampRatio(snap.logicalBytes / maxLogical) * barMaxW);
      const storedW =
        snap.newStoredBytes > 0
          ? Math.max(4, clampRatio(snap.newStoredBytes / maxLogical) * barMaxW)
          : 0;
      lines.push(
        `<rect x="${fmt(barAreaX)}" y="${fmt(ry + 4)}" width="${fmt(logicalW)}" height="18" rx="4" fill="${p.barLogical}"/>`,
      );
      if (storedW > 0) {
        lines.push(
          `<rect x="${fmt(barAreaX)}" y="${fmt(ry + 4)}" width="${fmt(storedW)}" height="18" rx="4" fill="${p.barStored}"/>`,
        );
      }
      const metricText = `${formatBytesKo(snap.newStoredBytes)} / ${formatBytesKo(snap.logicalBytes)} (재사용 ${formatPct(snap.dedupReusePercent)})`;
      lines.push(
        `<text x="${fmt(padX + contentW - 18)}" y="${fmt(ry + 17)}" text-anchor="end" font-family="${fontStack}" font-size="11.5" fill="${p.textMuted}">${escapeVaultXml(metricText)}</text>`,
      );
    }
  }

  // 4. 섹션 2: 고정 청킹 vs FastCDC 시프트 내성 비교
  lines.push(
    `<rect x="${padX}" y="${fmt(yShift)}" width="${contentW}" height="${shiftSectionH}" rx="10" fill="${p.cardBg}" stroke="${p.borderSoft}" stroke-width="1"/>`,
  );
  lines.push(
    `<text x="${padX + 18}" y="${fmt(yShift + 28)}" font-family="${fontStack}" font-size="14" font-weight="700" fill="${p.textPrimary}">고정 크기 청킹 vs FastCDC 바이트 삽입(Shift) 내성 비교</text>`,
  );

  if (!shiftComparison) {
    lines.push(
      `<text x="${padX + 18}" y="${fmt(yShift + 78)}" font-family="${fontStack}" font-size="12" fill="${p.textMuted}">시프트 내성 비교 벤치마크가 전달되지 않았습니다. compareFixedVsFastCdcDedup 결과를 전달하면 비교 막대를 표시합니다.</text>`,
    );
  } else {
    const compBarX = padX + 240;
    const compBarW = contentW - 470;
    const fixedReuseW = clampRatio(shiftComparison.fixed.incrementalReusePercent / 100) * compBarW;
    const fastReuseW = clampRatio(shiftComparison.fastCdc.incrementalReusePercent / 100) * compBarW;

    lines.push(
      `<text x="${padX + 18}" y="${fmt(yShift + 66)}" font-family="${fontStack}" font-size="12.5" font-weight="600" fill="${p.textPrimary}">고정 크기 청킹 (${formatBytesKo(shiftComparison.fixed.targetAvgChunkBytes)})</text>`,
    );
    lines.push(
      `<rect x="${fmt(compBarX)}" y="${fmt(yShift + 52)}" width="${fmt(compBarW)}" height="20" rx="5" fill="${p.gridLine}"/>`,
    );
    if (fixedReuseW > 0) {
      lines.push(
        `<rect x="${fmt(compBarX)}" y="${fmt(yShift + 52)}" width="${fmt(Math.max(4, fixedReuseW))}" height="20" rx="5" fill="${p.barFixed}"/>`,
      );
    }
    lines.push(
      `<text x="${fmt(padX + contentW - 18)}" y="${fmt(yShift + 66)}" text-anchor="end" font-family="${fontStack}" font-size="12" fill="${p.textMuted}">${escapeVaultXml(`재사용 ${formatPct(shiftComparison.fixed.incrementalReusePercent)} · 절감 ${formatPct(shiftComparison.fixed.dedupSavingsPercent)}`)}</text>`,
    );

    lines.push(
      `<text x="${padX + 18}" y="${fmt(yShift + 104)}" font-family="${fontStack}" font-size="12.5" font-weight="600" fill="${p.textPrimary}">FastCDC 롤링 해시 청킹</text>`,
    );
    lines.push(
      `<rect x="${fmt(compBarX)}" y="${fmt(yShift + 90)}" width="${fmt(compBarW)}" height="20" rx="5" fill="${p.gridLine}"/>`,
    );
    if (fastReuseW > 0) {
      lines.push(
        `<rect x="${fmt(compBarX)}" y="${fmt(yShift + 90)}" width="${fmt(Math.max(4, fastReuseW))}" height="20" rx="5" fill="${p.barFastCdc}"/>`,
      );
    }
    lines.push(
      `<text x="${fmt(padX + contentW - 18)}" y="${fmt(yShift + 104)}" text-anchor="end" font-family="${fontStack}" font-size="12" font-weight="700" fill="${p.textPrimary}">${escapeVaultXml(`재사용 ${formatPct(shiftComparison.fastCdc.incrementalReusePercent)} · 절감 ${formatPct(shiftComparison.fastCdc.dedupSavingsPercent)}`)}</text>`,
    );

    const deltaSummary = `FastCDC 우위: 수정본 청크 재사용 +${shiftComparison.fastCdcAdvantageReusePoints.toFixed(1)}%p · 추가 절감 ${formatBytesKo(Math.max(0, shiftComparison.fastCdcSavedMoreBytes))}`;
    lines.push(
      `<text x="${padX + 18}" y="${fmt(yShift + 132)}" font-family="${fontStack}" font-size="11.5" font-weight="600" fill="${p.barFastCdc}">${escapeVaultXml(deltaSummary)}</text>`,
    );
  }

  // 5. 섹션 3: GF(256) 스트라이프 P/Q 치유 상태 매트릭스
  lines.push(
    `<rect x="${padX}" y="${fmt(yStripe)}" width="${contentW}" height="${fmt(stripeSectionH)}" rx="10" fill="${p.cardBg}" stroke="${p.borderSoft}" stroke-width="1"/>`,
  );
  lines.push(
    `<text x="${padX + 18}" y="${fmt(yStripe + 28)}" font-family="${fontStack}" font-size="14" font-weight="700" fill="${p.textPrimary}">GF(256) 이중 패리티(P+Q) 스트라이프 무결성·치유 매트릭스</text>`,
  );

  if (shownStripes.length === 0) {
    lines.push(
      `<text x="${padX + 18}" y="${fmt(yStripe + 74)}" font-family="${fontStack}" font-size="12" fill="${p.textMuted}">생성된 패리티 스트라이프가 없습니다.</text>`,
    );
  } else {
    for (let i = 0; i < shownStripes.length; i += 1) {
      const st = shownStripes[i];
      if (!st) continue;
      const ry = yStripe + 50 + i * stripeRowH;
      if (i % 2 === 1) {
        lines.push(
          `<rect x="${padX + 10}" y="${fmt(ry - 4)}" width="${contentW - 20}" height="${stripeRowH}" rx="6" fill="${p.rowAltBg}"/>`,
        );
      }
      lines.push(
        `<text x="${padX + 18}" y="${fmt(ry + 18)}" font-family="${fontStack}" font-size="12" font-weight="600" fill="${p.textPrimary}">${escapeVaultXml(truncateText(st.stripeId, 18))}</text>`,
      );

      let cursorX = padX + 150;
      const chipW = 54;
      const chipGap = 8;
      const maxVisibleDataChips = Math.min(st.dataShardCount, 8);
      for (let d = 0; d < maxVisibleDataChips; d += 1) {
        const label = `data[${d}]`;
        const wasHealed = st.lastHealedShardLabels.includes(label);
        const isBroken =
          st.lastStatus === "unrecoverable-exceeds-parity-budget" ||
          st.lastStatus === "unrecoverable-hash-mismatch";
        const fill = isBroken
          ? p.shardBrokenFill
          : wasHealed
            ? p.shardHealedFill
            : p.shardHealthyFill;
        const stroke = isBroken
          ? p.shardBrokenStroke
          : wasHealed
            ? p.shardHealedStroke
            : p.shardHealthyStroke;
        lines.push(
          `<rect x="${fmt(cursorX)}" y="${fmt(ry + 2)}" width="${chipW}" height="22" rx="5" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`,
        );
        lines.push(
          `<text x="${fmt(cursorX + chipW / 2)}" y="${fmt(ry + 17)}" text-anchor="middle" font-family="${fontStack}" font-size="11" font-weight="600" fill="${p.textPrimary}">D${d}</text>`,
        );
        cursorX += chipW + chipGap;
      }

      const parityLabels: readonly { readonly code: string; readonly key: string }[] = [
        { code: "P", key: "parity-P" },
        { code: "Q", key: "parity-Q" },
      ];
      for (let pi = 0; pi < parityLabels.length; pi += 1) {
        const pItem = parityLabels[pi];
        if (!pItem) continue;
        const wasHealed = st.lastHealedShardLabels.includes(pItem.key);
        const isBroken =
          st.lastStatus === "unrecoverable-exceeds-parity-budget" ||
          st.lastStatus === "unrecoverable-hash-mismatch";
        const fill = isBroken
          ? p.shardBrokenFill
          : wasHealed
            ? p.shardHealedFill
            : p.shardParityFill;
        const stroke = isBroken
          ? p.shardBrokenStroke
          : wasHealed
            ? p.shardHealedStroke
            : p.shardParityStroke;
        lines.push(
          `<rect x="${fmt(cursorX)}" y="${fmt(ry + 2)}" width="44" height="22" rx="5" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`,
        );
        lines.push(
          `<text x="${fmt(cursorX + 22)}" y="${fmt(ry + 17)}" text-anchor="middle" font-family="${fontStack}" font-size="11" font-weight="700" fill="${p.textPrimary}">${pItem.code}</text>`,
        );
        cursorX += 44 + chipGap;
      }

      const stColors = stripeStatusColors(st.lastStatus);
      const pillW = 112;
      const pillX = padX + contentW - pillW - 18;
      lines.push(
        `<rect x="${fmt(pillX)}" y="${fmt(ry + 2)}" width="${pillW}" height="22" rx="11" fill="${stColors.fill}" stroke="${stColors.stroke}" stroke-width="1"/>`,
      );
      lines.push(
        `<text x="${fmt(pillX + pillW / 2)}" y="${fmt(ry + 17)}" text-anchor="middle" font-family="${fontStack}" font-size="11" font-weight="700" fill="${p.textPrimary}">${escapeVaultXml(stripeStatusLabelKo(st.lastStatus))}</text>`,
      );
    }
  }

  // 6. 푸터 무결성 지문
  const footerText = `금고 매니페스트 SHA-256: ${health.vaultManifestSha256Hex.slice(0, 24)}… · Wave 146 FastCDC + GF(256) Dual-Parity Vault`;
  lines.push(
    `<text x="${padX}" y="${fmt(yFooter + 22)}" font-family="${fontStack}" font-size="11" fill="${p.textMuted}">${escapeVaultXml(footerText)}</text>`,
  );
  lines.push("</svg>");

  return lines.join("\n");
}

/**
 * 번역투 없는 자연스러운 한국어 스튜디오 원고 저장소 내구성 QA 브리프를 생성한다.
 */
export function summarizeSnapshotVaultHealthKo(
  health: VaultHealthSnapshot,
  shiftComparison?: FixedVsFastCdcComparisonReport | null,
): SnapshotVaultHealthReportKo {
  const effectiveShift = shiftComparison ?? health.shiftBenchmark ?? null;
  const overallGrade = classifyVaultGrade(health);
  const gradeLabelKo = gradeBadgeLabelKo(overallGrade);

  const bulletLines: string[] = [];
  if (health.activeSnapshotCount === 0) {
    bulletLines.push("현재 금고에 저장된 활성 스냅샷이 없어 중복제거·패리티 대기 상태입니다.");
  } else {
    bulletLines.push(
      `활성 스냅샷 ${health.activeSnapshotCount}건의 누적 원본 ${formatBytesKo(health.totalLogicalBytes)}를 FastCDC로 중복 제거해 고유 청크 ${formatBytesKo(health.totalUniqueChunkBytes)}만 저장했습니다(절감률 ${formatPct(health.dedupSavingsPercent)}).`,
    );
  }

  bulletLines.push(
    `GF(256) 이중 패리티(P+Q) ${health.stripeCount}개 스트라이프(${formatBytesKo(health.totalParityBytes)})를 포함해도 전체 실저장 용량은 ${formatBytesKo(health.totalPhysicalBytes)}입니다.`,
  );

  if (effectiveShift) {
    bulletLines.push(
      `바이트 삽입 시프트 시험에서 FastCDC는 수정본 청크 ${formatPct(effectiveShift.fastCdc.incrementalReusePercent)}를 재사용해 고정 크기 청킹(${formatPct(effectiveShift.fixed.incrementalReusePercent)})보다 ${formatBytesKo(Math.max(0, effectiveShift.fastCdcSavedMoreBytes))}를 더 아꼈습니다.`,
    );
  }

  if (health.lastScrubReport) {
    const sr = health.lastScrubReport;
    if (sr.unrecoverableStripeCount > 0) {
      bulletLines.push(
        `무결성 스크럽 결과 스트라이프 ${sr.unrecoverableStripeCount}건이 패리티 복구 한도(동시 2개 샤드)를 넘어 차단됐습니다. 백업본 동기화가 필요합니다.`,
      );
    } else if (sr.healedDataChunkCount > 0 || sr.healedParityShardCount > 0) {
      bulletLines.push(
        `오프라인 스크럽에서 손상 데이터 청크 ${sr.healedDataChunkCount}건과 패리티 샤드 ${sr.healedParityShardCount}건을 GF(256) P+Q 방정식으로 원본과 100% 동일하게 되살렸습니다.`,
      );
    } else {
      bulletLines.push(
        `전체 스트라이프 ${sr.checkedStripeCount}건·청크 ${sr.checkedChunkCount}건의 SHA-256 검사에서 비트 손상 0건을 확인했습니다.`,
      );
    }
  } else {
    bulletLines.push("초기 커밋 직후 상태입니다. 오프라인 장기간 보관 뒤에는 정기 스크럽을 권장합니다.");
  }

  if (health.unreferencedChunkCount > 0) {
    bulletLines.push(
      `삭제된 스냅샷에서 남은 미참조 청크 ${health.unreferencedChunkCount}건이 대기 중입니다. 압축 정리(GC)를 실행하면 공간을 회수할 수 있습니다.`,
    );
  }

  let headlineKo: string;
  if (overallGrade === "degraded") {
    headlineKo = `원고 스냅샷 금고 경고: 복구 한도를 초과한 스트라이프가 감지돼 안전 차단했습니다.`;
  } else if (overallGrade === "healed") {
    headlineKo = `원고 스냅샷 금고 자가 치유 완료: 손상 샤드를 GF(256) 패리티로 100% 무손실 복구했습니다.`;
  } else {
    headlineKo = `원고 스냅샷 금고 정상: 스냅샷 ${health.activeSnapshotCount}건 중복제거율 ${formatPct(health.dedupSavingsPercent)}, 전 구간 무결성 이상 없음.`;
  }

  const fullBriefTextKo = [
    `[${gradeLabelKo}] ${headlineKo}`,
    ...bulletLines.map((line) => `- ${line}`),
    `- 금고 지문(SHA-256): ${health.vaultManifestSha256Hex}`,
  ].join("\n");

  const reportSha256Hex = computeVaultManifestSha256Hex({
    overallGrade,
    gradeLabelKo,
    headlineKo,
    bulletLines,
    vaultManifestSha256Hex: health.vaultManifestSha256Hex,
  });

  return {
    overallGrade,
    gradeLabelKo,
    headlineKo,
    bulletLinesKo: bulletLines,
    fullBriefTextKo,
    reportSha256Hex,
  };
}
