/**
 * Wave 158 — 순수 OKLCH 진단 SVG 시각화 및 한국어 스튜디오 QA 복구 보고서 생성기.
 *
 * - 원시 hex/rgb/hsl 표기와 `#` 문자를 SVG 출력에서 완전히 배제하고 `oklch(...)`만 사용한다.
 * - WAL 크래시 복구 상태(LSN·정상 바이트 경계·끝단 잘림·압축 절감)와
 *   OPFS/SQLite 스토리지 할당량(보호 원고·회수 대상·여유 공간)을 한눈에 보여 준다.
 */

import {
  canonicalJsonStringify,
  computeSha256Utf8Hex,
} from "./wal-binary-crc32c-codec";
import type {
  OpfsEvictionPlan,
  QuotaPressureTier,
  WalCompactionResult,
  WalHealthStatus,
  WalRecoveryReport,
  WalReplayResult,
} from "./wal-recovery-types";

const PALETTE = {
  canvasBg: "oklch(0.985 0.008 92)",
  cardBg: "oklch(0.962 0.009 90)",
  cardSurface: "oklch(0.994 0.003 95)",
  borderSoft: "oklch(0.34 0.03 155 / 0.14)",
  inkPrimary: "oklch(0.22 0.025 155)",
  inkSecondary: "oklch(0.44 0.02 150)",
  inkMuted: "oklch(0.56 0.015 145)",
  forest: "oklch(0.33 0.068 156)",
  forestLight: "oklch(0.92 0.028 156)",
  good: "oklch(0.52 0.115 152)",
  goodSoft: "oklch(0.93 0.035 152)",
  warn: "oklch(0.67 0.145 72)",
  warnSoft: "oklch(0.94 0.045 78)",
  bad: "oklch(0.55 0.175 26)",
  badSoft: "oklch(0.94 0.042 28)",
  cool: "oklch(0.54 0.095 232)",
  coolSoft: "oklch(0.93 0.028 232)",
  trackBg: "oklch(0.91 0.010 92)",
  white: "oklch(0.99 0.004 95)",
} as const;

export interface BuildWalRecoveryReportInput {
  readonly replay: WalReplayResult;
  readonly compaction: WalCompactionResult | null;
  readonly quotaPlan: OpfsEvictionPlan;
  readonly rawWalSha256Hex?: string;
}

function escapeXmlSafe(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/#/g, "");
}

function formatBytesReadable(bytes: number): string {
  const safe = Math.max(0, bytes);
  if (safe >= 1024 * 1024 * 1024) {
    return `${(safe / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (safe >= 1024 * 1024) {
    return `${(safe / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (safe >= 1024) {
    return `${(safe / 1024).toFixed(1)} KB`;
  }
  return `${String(Math.round(safe))} B`;
}

function formatPercent(ratio: number): string {
  const clamped = Math.max(0, ratio);
  return `${(clamped * 100).toFixed(1)}%`;
}

function walHealthBadge(status: WalHealthStatus): {
  readonly labelKo: string;
  readonly bg: string;
  readonly fg: string;
} {
  if (status === "clean") {
    return { labelKo: "무결성 정상", bg: PALETTE.goodSoft, fg: PALETTE.forest };
  }
  if (status === "recovered_torn_tail") {
    return { labelKo: "끝단 잘림 복구", bg: PALETTE.warnSoft, fg: PALETTE.inkPrimary };
  }
  return { labelKo: "손상 프레임 차단", bg: PALETTE.badSoft, fg: PALETTE.bad };
}

function quotaTierBadge(tier: QuotaPressureTier): {
  readonly labelKo: string;
  readonly bg: string;
  readonly fg: string;
} {
  if (tier === "healthy") {
    return { labelKo: "여유 정상", bg: PALETTE.goodSoft, fg: PALETTE.forest };
  }
  if (tier === "elevated") {
    return { labelKo: "주의 구간", bg: PALETTE.warnSoft, fg: PALETTE.inkPrimary };
  }
  if (tier === "critical") {
    return { labelKo: "용량 경고", bg: PALETTE.badSoft, fg: PALETTE.bad };
  }
  return { labelKo: "비상 압박", bg: PALETTE.bad, fg: PALETTE.white };
}

/**
 * WAL 복구 상태와 OPFS 할당량 회수 계획을 순수 OKLCH SVG 진단 차트로 렌더링한다.
 */
export function renderWalQuotaDiagnosticSvg(
  input: BuildWalRecoveryReportInput,
  proofSha256Hex: string
): string {
  const { replay, compaction, quotaPlan } = input;
  const walBadge = walHealthBadge(replay.healthStatus);
  const quotaBadge = quotaTierBadge(quotaPlan.pressureTierAfter);

  const walBarTotalW = 340;
  const walTotalBytes = Math.max(1, replay.totalBytesScanned);
  const walValidW = Math.max(
    0,
    Math.min(walBarTotalW, Math.round((replay.validByteEndOffset / walTotalBytes) * walBarTotalW))
  );
  const walTailW = Math.max(
    0,
    Math.min(walBarTotalW - walValidW, Math.round((replay.truncatedTailBytes / walTotalBytes) * walBarTotalW))
  );
  const walCorruptW =
    replay.corruptedMiddleFrame !== null ? Math.max(6, walBarTotalW - walValidW - walTailW) : 0;

  const compactOrigBytes = Math.max(1, compaction ? compaction.originalBytes : replay.totalBytesScanned);
  const compactAfterBytes = compaction ? compaction.compactedBytes : replay.validByteEndOffset;
  const compactAfterW = Math.max(
    4,
    Math.min(walBarTotalW, Math.round((compactAfterBytes / compactOrigBytes) * walBarTotalW))
  );

  const quotaBarW = 340;
  const quotaTotal = Math.max(1, quotaPlan.quotaBytes);
  const dirtyW = Math.min(
    quotaBarW,
    Math.round((quotaPlan.protectedDirtyBytes / quotaTotal) * quotaBarW)
  );
  const activeOnlyBytes = Math.max(
    0,
    quotaPlan.protectedActiveBytes -
      quotaPlan.protectedEntries.reduce((acc, e) => {
        const isDirty = e.unsyncedDirty || e.bucket === "unsynced_episode_db";
        const isActive = e.pinnedActive || e.bucket === "active_wal_segment";
        return isDirty && isActive ? acc + Math.max(0, Math.floor(e.bytes)) : acc;
      }, 0)
  );
  const activeW = Math.min(
    quotaBarW - dirtyW,
    Math.round((activeOnlyBytes / quotaTotal) * quotaBarW)
  );
  const keptCacheBytes = Math.max(
    0,
    quotaPlan.usedBytesAfter - (quotaPlan.protectedDirtyBytes + activeOnlyBytes)
  );
  const keptCacheW = Math.min(
    quotaBarW - dirtyW - activeW,
    Math.round((keptCacheBytes / quotaTotal) * quotaBarW)
  );
  const reclaimW = Math.min(
    quotaBarW - dirtyW - activeW - keptCacheW,
    Math.round((quotaPlan.plannedReclaimBytes / quotaTotal) * quotaBarW)
  );
  const targetMarkerX = 452 + Math.round((1 - quotaPlan.targetFreeRatio) * quotaBarW);

  const footerNote =
    quotaPlan.operatorActionsKo[0] ??
    "로컬 WAL 무결성과 OPFS 여유 공간이 정상 기준을 충족합니다.";

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 380" width="840" height="380" role="img" aria-label="OPFS WAL 크래시 복구 및 스토리지 할당량 진단">`,
    `  <rect x="0" y="0" width="840" height="380" rx="16" fill="${PALETTE.canvasBg}" />`,
    `  <rect x="16" y="16" width="808" height="48" rx="10" fill="${PALETTE.forest}" />`,
    `  <text x="32" y="45" font-family="sans-serif" font-size="15" font-weight="700" fill="${PALETTE.white}">${escapeXmlSafe(`ToonStudio 로컬 OPFS WAL 복구 · 할당량 진단 (${replay.episodeId})`)}</text>`,
    `  <text x="808" y="45" text-anchor="end" font-family="monospace" font-size="11" fill="${PALETTE.forestLight}">${escapeXmlSafe(`SHA-256 ${proofSha256Hex.slice(0, 16)}`)}</text>`,

    `  <rect x="16" y="78" width="396" height="226" rx="12" fill="${PALETTE.cardSurface}" stroke="${PALETTE.borderSoft}" stroke-width="1" />`,
    `  <text x="34" y="106" font-family="sans-serif" font-size="13" font-weight="700" fill="${PALETTE.inkPrimary}">바이너리 WAL 무결성 및 LSN 재생</text>`,
    `  <rect x="286" y="89" width="110" height="24" rx="12" fill="${walBadge.bg}" />`,
    `  <text x="341" y="105" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="700" fill="${walBadge.fg}">${escapeXmlSafe(walBadge.labelKo)}</text>`,

    `  <text x="34" y="132" font-family="sans-serif" font-size="11" fill="${PALETTE.inkSecondary}">${escapeXmlSafe(`정상 경계 ${formatBytesReadable(replay.validByteEndOffset)} / 전체 ${formatBytesReadable(replay.totalBytesScanned)} · 최종 LSN ${String(replay.lastValidLsn)}`)}</text>`,
    `  <rect x="34" y="142" width="${String(walBarTotalW)}" height="18" rx="6" fill="${PALETTE.trackBg}" />`,
    `  <rect x="34" y="142" width="${String(walValidW)}" height="18" rx="6" fill="${PALETTE.good}" />`,
    ...(walTailW > 0
      ? [`  <rect x="${String(34 + walValidW)}" y="142" width="${String(walTailW)}" height="18" rx="4" fill="${PALETTE.warn}" />`]
      : []),
    ...(walCorruptW > 0
      ? [`  <rect x="${String(34 + walValidW + walTailW)}" y="142" width="${String(walCorruptW)}" height="18" rx="4" fill="${PALETTE.bad}" />`]
      : []),

    `  <text x="34" y="182" font-family="sans-serif" font-size="11" fill="${PALETTE.inkSecondary}">${escapeXmlSafe(`트랜잭션: 커밋 ${String(replay.committedTxCount)} · 중단 ${String(replay.abortedTxCount)} · 미커밋 ${String(replay.uncommittedTxCount)}`)}</text>`,
    `  <text x="34" y="200" font-family="sans-serif" font-size="11" fill="${PALETTE.inkSecondary}">${escapeXmlSafe(`연산 반영 ${String(replay.committedOpCount)}건 · 폐기 ${String(replay.discardedOpCount)}건 · 잘림 절단 ${formatBytesReadable(replay.truncatedTailBytes)}`)}</text>`,

    `  <text x="34" y="228" font-family="sans-serif" font-size="11" font-weight="600" fill="${PALETTE.inkPrimary}">${escapeXmlSafe(compaction ? `체크포인트 압축 (${formatBytesReadable(compaction.originalBytes)} -> ${formatBytesReadable(compaction.compactedBytes)}, 해시 ${compaction.stateHashEquivalent ? "동치" : "불일치"})` : "체크포인트 압축 미실행")}</text>`,
    `  <rect x="34" y="238" width="${String(walBarTotalW)}" height="14" rx="5" fill="${PALETTE.trackBg}" />`,
    `  <rect x="34" y="238" width="${String(compactAfterW)}" height="14" rx="5" fill="${PALETTE.cool}" />`,
    `  <text x="34" y="274" font-family="monospace" font-size="10" fill="${PALETTE.inkMuted}">${escapeXmlSafe(`상태 해시 ${replay.stateSha256Hex.slice(0, 32)}`)}</text>`,
    `  <text x="34" y="290" font-family="sans-serif" font-size="10" fill="${PALETTE.inkMuted}">${escapeXmlSafe(`복원 요소: 레이어 ${String(replay.recoveredState.layers.length)} · 패널 ${String(replay.recoveredState.panels.length)} · 스트로크 ${String(replay.recoveredState.strokes.length)}`)}</text>`,

    `  <rect x="428" y="78" width="396" height="226" rx="12" fill="${PALETTE.cardSurface}" stroke="${PALETTE.borderSoft}" stroke-width="1" />`,
    `  <text x="446" y="106" font-family="sans-serif" font-size="13" font-weight="700" fill="${PALETTE.inkPrimary}">OPFS/SQLite 스토리지 할당량 · GC</text>`,
    `  <rect x="716" y="89" width="92" height="24" rx="12" fill="${quotaBadge.bg}" />`,
    `  <text x="762" y="105" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="700" fill="${quotaBadge.fg}">${escapeXmlSafe(quotaBadge.labelKo)}</text>`,

    `  <text x="446" y="132" font-family="sans-serif" font-size="11" fill="${PALETTE.inkSecondary}">${escapeXmlSafe(`정리 전 ${formatPercent(quotaPlan.utilizationBefore)} -> 정리 후 ${formatPercent(quotaPlan.utilizationAfter)} (총 ${formatBytesReadable(quotaPlan.quotaBytes)})`)}</text>`,
    `  <rect x="446" y="142" width="${String(quotaBarW)}" height="18" rx="6" fill="${PALETTE.trackBg}" />`,
    ...(dirtyW > 0
      ? [`  <rect x="446" y="142" width="${String(dirtyW)}" height="18" rx="4" fill="${PALETTE.forest}" />`]
      : []),
    ...(activeW > 0
      ? [`  <rect x="${String(446 + dirtyW)}" y="142" width="${String(activeW)}" height="18" rx="2" fill="${PALETTE.cool}" />`]
      : []),
    ...(keptCacheW > 0
      ? [`  <rect x="${String(446 + dirtyW + activeW)}" y="142" width="${String(keptCacheW)}" height="18" rx="2" fill="${PALETTE.good}" />`]
      : []),
    ...(reclaimW > 0
      ? [`  <rect x="${String(446 + dirtyW + activeW + keptCacheW)}" y="142" width="${String(reclaimW)}" height="18" rx="2" fill="${PALETTE.warn}" />`]
      : []),
    `  <line x1="${String(targetMarkerX)}" y1="138" x2="${String(targetMarkerX)}" y2="164" stroke="${PALETTE.bad}" stroke-width="2" />`,

    `  <rect x="446" y="172" width="10" height="10" rx="2" fill="${PALETTE.forest}" />`,
    `  <text x="462" y="181" font-family="sans-serif" font-size="10" fill="${PALETTE.inkSecondary}">${escapeXmlSafe(`미동기화 보호 ${formatBytesReadable(quotaPlan.protectedDirtyBytes)}`)}</text>`,
    `  <rect x="612" y="172" width="10" height="10" rx="2" fill="${PALETTE.cool}" />`,
    `  <text x="628" y="181" font-family="sans-serif" font-size="10" fill="${PALETTE.inkSecondary}">${escapeXmlSafe(`활성 보호 ${formatBytesReadable(quotaPlan.protectedActiveBytes)}`)}</text>`,

    `  <rect x="446" y="192" width="10" height="10" rx="2" fill="${PALETTE.warn}" />`,
    `  <text x="462" y="201" font-family="sans-serif" font-size="10" fill="${PALETTE.inkSecondary}">${escapeXmlSafe(`회수 예정 ${formatBytesReadable(quotaPlan.plannedReclaimBytes)} (${String(quotaPlan.evictEntries.length)}건)`)}</text>`,
    `  <rect x="612" y="192" width="10" height="10" rx="2" fill="${PALETTE.good}" />`,
    `  <text x="628" y="201" font-family="sans-serif" font-size="10" fill="${PALETTE.inkSecondary}">${escapeXmlSafe(`정리 후 여유 ${formatBytesReadable(quotaPlan.freeBytesAfter)}`)}</text>`,

    `  <text x="446" y="232" font-family="sans-serif" font-size="11" fill="${PALETTE.inkPrimary}">${escapeXmlSafe(quotaPlan.targetHeadroomMet ? "목표 여유 공간 달성: 미동기화 원고 0건 삭제" : `목표 여유 공간 부족분 ${formatBytesReadable(quotaPlan.shortfallBytes)} (보호 데이터 유지)`)}</text>`,
    `  <text x="446" y="252" font-family="sans-serif" font-size="10" fill="${PALETTE.inkSecondary}">${escapeXmlSafe(`보호 항목 ${String(quotaPlan.protectedEntries.length)}건 · 유지 항목 ${String(quotaPlan.keptEntries.length)}건 · 회수 항목 ${String(quotaPlan.evictEntries.length)}건`)}</text>`,
    `  <text x="446" y="274" font-family="sans-serif" font-size="10" fill="${PALETTE.inkMuted}">${escapeXmlSafe(`목표 사용률 상한 ${formatPercent(1 - quotaPlan.targetFreeRatio)} (빨간 기준선)`)}</text>`,
    `  <text x="446" y="290" font-family="sans-serif" font-size="10" fill="${PALETTE.inkMuted}">${escapeXmlSafe(quotaPlan.dirtyBlocksHeadroom ? "미동기화 원고 점유로 수동 동기화 필요" : "자동 캐시 정리만으로 안전선 유지")}</text>`,

    `  <rect x="16" y="318" width="808" height="46" rx="10" fill="${PALETTE.cardBg}" stroke="${PALETTE.borderSoft}" stroke-width="1" />`,
    `  <text x="34" y="346" font-family="sans-serif" font-size="12" font-weight="600" fill="${PALETTE.inkPrimary}">${escapeXmlSafe(`권장 조치: ${footerNote}`)}</text>`,
    `</svg>`,
  ];

  return lines.join("\n");
}

/**
 * WAL 크래시 복구·압축·OPFS 할당량 GC 결과를 자연스러운 한국어 QA 보고서와
 * 결정론적 SHA-256 복구 증명, OKLCH SVG 차트로 조합한다.
 */
export function buildWalRecoveryReport(input: BuildWalRecoveryReportInput): WalRecoveryReport {
  const { replay, compaction, quotaPlan } = input;

  const proofBasis = {
    rawWalSha256Hex: input.rawWalSha256Hex ?? null,
    episodeId: replay.episodeId,
    stateSha256Hex: replay.stateSha256Hex,
    totalBytesScanned: replay.totalBytesScanned,
    validByteEndOffset: replay.validByteEndOffset,
    truncatedTailBytes: replay.truncatedTailBytes,
    corruptedMiddleFrame: replay.corruptedMiddleFrame,
    lastValidLsn: replay.lastValidLsn,
    committedTxCount: replay.committedTxCount,
    abortedTxCount: replay.abortedTxCount,
    uncommittedTxCount: replay.uncommittedTxCount,
    compaction: compaction
      ? {
          originalBytes: compaction.originalBytes,
          compactedBytes: compaction.compactedBytes,
          checkpointLsn: compaction.checkpointLsn,
          stateSha256After: compaction.stateSha256After,
          stateHashEquivalent: compaction.stateHashEquivalent,
        }
      : null,
    quota: {
      quotaBytes: quotaPlan.quotaBytes,
      usedBytesBefore: quotaPlan.usedBytesBefore,
      usedBytesAfter: quotaPlan.usedBytesAfter,
      plannedReclaimBytes: quotaPlan.plannedReclaimBytes,
      shortfallBytes: quotaPlan.shortfallBytes,
      evictIds: quotaPlan.evictEntries.map((entry) => entry.id),
      protectedIds: quotaPlan.protectedEntries.map((entry) => entry.id),
    },
  };

  const recoveryProofSha256Hex = computeSha256Utf8Hex(canonicalJsonStringify(proofBasis));
  const svgDiagram = renderWalQuotaDiagnosticSvg(input, recoveryProofSha256Hex);

  let headlineKo = `회차 ${replay.episodeId} 로컬 WAL 복구와 OPFS 스토리지 점검을 마쳤습니다.`;
  if (replay.corruptedMiddleFrame !== null) {
    headlineKo = `회차 ${replay.episodeId} WAL 중간 손상을 감지해 오프셋 ${String(replay.corruptedMiddleFrame.byteOffset)}B 직전에서 재생을 안전하게 멈췄습니다.`;
  } else if (replay.tornWriteTruncated) {
    headlineKo = `회차 ${replay.episodeId} 비정상 종료 끝단 ${formatBytesReadable(replay.truncatedTailBytes)}를 잘라내고 커밋 연산 ${String(replay.committedOpCount)}건을 손실 없이 복원했습니다.`;
  }

  const summaryLinesKo: string[] = [
    `WAL 재생: 커밋 트랜잭션 ${String(replay.committedTxCount)}건(${String(replay.committedOpCount)}개 연산) 반영, 미커밋·중단 ${String(replay.abortedTxCount + replay.uncommittedTxCount)}건(${String(replay.discardedOpCount)}개 연산) 격리 폐기`,
  ];

  if (compaction) {
    const savedPct = Math.round(Math.max(0, compaction.reductionRatio) * 100);
    summaryLinesKo.push(
      `체크포인트 압축: ${formatBytesReadable(compaction.originalBytes)}에서 ${formatBytesReadable(compaction.compactedBytes)}로 ${String(savedPct)}% 줄였고 상태 SHA-256 해시가 ${compaction.stateHashEquivalent ? "완전 일치합니다" : "불일치합니다"}.`
    );
  }

  summaryLinesKo.push(
    `OPFS 할당량: 사용률 ${formatPercent(quotaPlan.utilizationBefore)}에서 ${formatPercent(quotaPlan.utilizationAfter)}로 정리 예정(회수 ${String(quotaPlan.evictEntries.length)}건 / ${formatBytesReadable(quotaPlan.plannedReclaimBytes)}, 미동기화·활성 보호 ${String(quotaPlan.protectedEntries.length)}건).`
  );

  for (let i = 0; i < quotaPlan.warningsKo.length; i += 1) {
    summaryLinesKo.push(`주의: ${quotaPlan.warningsKo[i]}`);
  }
  for (let i = 0; i < quotaPlan.operatorActionsKo.length; i += 1) {
    summaryLinesKo.push(`조치: ${quotaPlan.operatorActionsKo[i]}`);
  }

  return {
    headlineKo,
    summaryLinesKo,
    svgDiagram,
    recoveryProofSha256Hex,
  };
}
