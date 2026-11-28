/**
 * Wave 98 — 인쇄 안전 고대비 OKLCH 100년 보존 인증서 SVG 및 한국어 봉인 보고서 생성기.
 *
 * - raw hex / rgb() 색상 없이 OKLCH 토큰만 사용해 인쇄·화면 모두에서 높은 대비를 유지한다.
 * - 모든 수치 좌표는 NaN/Infinity를 차단하고, 외부 입력 문자열은 XML 이스케이프 처리한다.
 */

import type { CentennialPreservationAuditReport } from "./c2pa-provenance-chain-and-deterministic-replay";

export interface CentennialCertificateSvgResult {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  readonly containsNaN: boolean;
  readonly badgeCount: number;
  readonly timelineNodeCount: number;
}

const SVG_PALETTE = {
  paper: "oklch(0.985 0.008 90)",
  linen: "oklch(0.955 0.012 88)",
  card: "oklch(0.995 0.003 90)",
  border: "oklch(0.82 0.018 85)",
  brass: "oklch(0.62 0.11 80)",
  ink: "oklch(0.20 0.015 250)",
  muted: "oklch(0.42 0.015 250)",
  forestFill: "oklch(0.93 0.032 155)",
  forestStroke: "oklch(0.36 0.085 155)",
  forestText: "oklch(0.28 0.075 155)",
  crimsonFill: "oklch(0.94 0.04 25)",
  crimsonStroke: "oklch(0.48 0.17 25)",
  crimsonText: "oklch(0.38 0.16 25)",
  timelineLine: "oklch(0.72 0.04 155)",
} as const;

function sanitizeSvgNumber(value: number, fallback = 0): string {
  if (!Number.isFinite(value)) {
    return String(fallback);
  }
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncateText(text: string, maxChars: number): string {
  const chars = Array.from(text);
  if (chars.length <= maxChars) {
    return text;
  }
  return `${chars.slice(0, Math.max(1, maxChars - 1)).join("")}…`;
}

/** 100년 보존 아카이브 인쇄 안전 OKLCH 봉인 인증서 SVG 생성. */
export function renderCentennialArchiveCertificateSvg(
  report: CentennialPreservationAuditReport,
): CentennialCertificateSvgResult {
  const width = 960;
  const height = 640;
  const sealed = report.readyForCentennialSeal;
  const accentFill = sealed ? SVG_PALETTE.forestFill : SVG_PALETTE.crimsonFill;
  const accentStroke = sealed ? SVG_PALETTE.forestStroke : SVG_PALETTE.crimsonStroke;
  const accentText = sealed ? SVG_PALETTE.forestText : SVG_PALETTE.crimsonText;

  const merkleTop = report.merkleRootHex.slice(0, 32);
  const merkleBottom = report.merkleRootHex.slice(32, 64);
  const creatorLabel = report.c2paAudit.creatorIdentity
    ? `${report.c2paAudit.creatorIdentity.displayNameKo} · ${report.c2paAudit.creatorIdentity.studioNameKo}`
    : "서명 창작자 미확인";

  const badgeSpecs: readonly { readonly code: string; readonly labelKo: string; readonly passed: boolean }[] = [
    { code: "SELF-CONTAINED", labelKo: "단독 자급 봉인", passed: report.badges.selfContained },
    { code: "GLYPH-COMPLETE", labelKo: "대사 글리프 100%", passed: report.badges.glyphComplete },
    { code: "ZERO-CLOUD-DEPS", labelKo: "외부 URL 0건", passed: report.badges.zeroCloudDeps },
    { code: "BIT-EXACT-2126", labelKo: "2126 비트 일치", passed: report.badges.bitExact2126 },
  ];

  const badgeSvgParts: string[] = [];
  const badgeW = 205;
  const badgeH = 68;
  const badgeGap = 16;
  const badgeStartX = 46;
  const badgeY = 236;

  for (let i = 0; i < badgeSpecs.length; i += 1) {
    const b = badgeSpecs[i];
    const x = badgeStartX + i * (badgeW + badgeGap);
    const fill = b.passed ? SVG_PALETTE.forestFill : SVG_PALETTE.crimsonFill;
    const stroke = b.passed ? SVG_PALETTE.forestStroke : SVG_PALETTE.crimsonStroke;
    const textCol = b.passed ? SVG_PALETTE.forestText : SVG_PALETTE.crimsonText;
    const stateTag = b.passed ? "PASS" : "FAIL";
    badgeSvgParts.push(
      `<g data-badge="${escapeXml(b.code)}">`,
      `  <rect x="${sanitizeSvgNumber(x)}" y="${sanitizeSvgNumber(badgeY)}" width="${sanitizeSvgNumber(badgeW)}" height="${sanitizeSvgNumber(badgeH)}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`,
      `  <text x="${sanitizeSvgNumber(x + 14)}" y="${sanitizeSvgNumber(badgeY + 26)}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" font-weight="700" fill="${textCol}">${escapeXml(b.code)}</text>`,
      `  <text x="${sanitizeSvgNumber(x + badgeW - 14)}" y="${sanitizeSvgNumber(badgeY + 26)}" text-anchor="end" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" font-weight="700" fill="${textCol}">${stateTag}</text>`,
      `  <text x="${sanitizeSvgNumber(x + 14)}" y="${sanitizeSvgNumber(badgeY + 49)}" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="${SVG_PALETTE.ink}">${escapeXml(b.labelKo)}</text>`,
      `</g>`,
    );
  }

  const claims = report.c2paAudit.claimsSummary.slice(0, 6);
  const timelineParts: string[] = [];
  const timelineY = 398;
  const lineStartX = 84;
  const lineEndX = 676;

  if (claims.length > 0) {
    timelineParts.push(
      `<line x1="${sanitizeSvgNumber(lineStartX)}" y1="${sanitizeSvgNumber(timelineY)}" x2="${sanitizeSvgNumber(lineEndX)}" y2="${sanitizeSvgNumber(timelineY)}" stroke="${SVG_PALETTE.timelineLine}" stroke-width="2.5"/>`,
    );
    const stepX = claims.length === 1 ? 0 : (lineEndX - lineStartX) / (claims.length - 1);
    for (let i = 0; i < claims.length; i += 1) {
      const claim = claims[i];
      const cx = claims.length === 1 ? (lineStartX + lineEndX) / 2 : lineStartX + i * stepX;
      const nodeStroke = report.c2paAudit.valid ? SVG_PALETTE.forestStroke : SVG_PALETTE.crimsonStroke;
      timelineParts.push(
        `<g data-c2pa-node="${sanitizeSvgNumber(claim.index)}">`,
        `  <circle cx="${sanitizeSvgNumber(cx)}" cy="${sanitizeSvgNumber(timelineY)}" r="15" fill="${SVG_PALETTE.card}" stroke="${nodeStroke}" stroke-width="2.5"/>`,
        `  <text x="${sanitizeSvgNumber(cx)}" y="${sanitizeSvgNumber(timelineY + 4)}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" font-weight="700" fill="${SVG_PALETTE.ink}">${sanitizeSvgNumber(claim.index + 1)}</text>`,
        `  <text x="${sanitizeSvgNumber(cx)}" y="${sanitizeSvgNumber(timelineY + 34)}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="10.5" font-weight="600" fill="${SVG_PALETTE.ink}">${escapeXml(truncateText(claim.label, 22))}</text>`,
        `  <text x="${sanitizeSvgNumber(cx)}" y="${sanitizeSvgNumber(timelineY + 50)}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="10" fill="${SVG_PALETTE.muted}">${escapeXml(claim.shortClaimSha256)}</text>`,
        `  <text x="${sanitizeSvgNumber(cx)}" y="${sanitizeSvgNumber(timelineY + 65)}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="9.5" fill="${SVG_PALETTE.muted}">${escapeXml(claim.timestampIso.slice(0, 10))}</text>`,
        `</g>`,
      );
    }
  } else {
    timelineParts.push(
      `<text x="84" y="${sanitizeSvgNumber(timelineY + 4)}" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="${SVG_PALETTE.crimsonText}">C2PA 서명 클레임 없음</text>`,
    );
  }

  const yearsText = report.replayAudit.simulatedHostYears.join(" ↔ ");
  const stampTitle = sealed ? "SEALED 2126" : "BLOCKED";
  const statusHeadline = sealed ? "CENTENNIAL SEAL VERIFIED" : "PRESERVATION SEAL BLOCKED";

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sanitizeSvgNumber(width)} ${sanitizeSvgNumber(height)}" width="${sanitizeSvgNumber(width)}" height="${sanitizeSvgNumber(height)}" role="img" aria-label="${escapeXml(`ToonStudio 100년 보존 봉인 인증서 — ${report.episodeId}`)}">`,
    `  <rect x="0" y="0" width="${sanitizeSvgNumber(width)}" height="${sanitizeSvgNumber(height)}" fill="${SVG_PALETTE.paper}"/>`,
    `  <rect x="18" y="18" width="${sanitizeSvgNumber(width - 36)}" height="${sanitizeSvgNumber(height - 36)}" rx="16" fill="${SVG_PALETTE.linen}" stroke="${SVG_PALETTE.brass}" stroke-width="2"/>`,
    `  <rect x="28" y="28" width="${sanitizeSvgNumber(width - 56)}" height="${sanitizeSvgNumber(height - 56)}" rx="12" fill="${SVG_PALETTE.card}" stroke="${SVG_PALETTE.border}" stroke-width="1"/>`,
    `  <text x="48" y="68" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" font-weight="700" letter-spacing="1.4" fill="${SVG_PALETTE.muted}">TOONSTUDIO ARCHIVAL VAULT · TSVA v1</text>`,
    `  <text x="48" y="100" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="700" fill="${SVG_PALETTE.ink}">100년 결정론적 보존 봉인 인증서</text>`,
    `  <text x="48" y="124" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="${SVG_PALETTE.muted}">회차: ${escapeXml(truncateText(report.episodeId, 44))} · 창작자: ${escapeXml(truncateText(creatorLabel, 40))}</text>`,
    `  <rect x="652" y="54" width="260" height="36" rx="18" fill="${accentFill}" stroke="${accentStroke}" stroke-width="1.5"/>`,
    `  <text x="782" y="77" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" font-weight="700" fill="${accentText}">${statusHeadline}</text>`,
    `  <rect x="46" y="144" width="868" height="74" rx="10" fill="${SVG_PALETTE.linen}" stroke="${SVG_PALETTE.border}" stroke-width="1"/>`,
    `  <text x="64" y="166" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" font-weight="700" fill="${SVG_PALETTE.muted}">MERKLE ROOT FINGERPRINT (SHA-256 · ${sanitizeSvgNumber(report.chunkCount)} CHUNKS · ${sanitizeSvgNumber(report.archiveByteLength)} BYTES)</text>`,
    `  <text x="64" y="188" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="14" font-weight="700" fill="${SVG_PALETTE.ink}">${escapeXml(merkleTop)}</text>`,
    `  <text x="64" y="207" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="14" font-weight="700" fill="${SVG_PALETTE.ink}">${escapeXml(merkleBottom)}</text>`,
    ...badgeSvgParts.map((line) => `  ${line}`),
    `  <rect x="46" y="324" width="664" height="172" rx="10" fill="${SVG_PALETTE.linen}" stroke="${SVG_PALETTE.border}" stroke-width="1"/>`,
    `  <text x="64" y="348" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" font-weight="700" fill="${SVG_PALETTE.muted}">C2PA PROVENANCE TIMELINE (${sanitizeSvgNumber(report.c2paAudit.verifiedClaimCount)} VERIFIED CLAIMS)</text>`,
    ...timelineParts.map((line) => `  ${line}`),
    `  <g data-verification-stamp="true">`,
    `    <circle cx="818" cy="410" r="82" fill="${accentFill}" stroke="${accentStroke}" stroke-width="3"/>`,
    `    <circle cx="818" cy="410" r="71" fill="none" stroke="${SVG_PALETTE.brass}" stroke-width="1.5" stroke-dasharray="4 3"/>`,
    `    <text x="818" y="394" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" font-weight="700" fill="${SVG_PALETTE.muted}">VERIFICATION STAMP</text>`,
    `    <text x="818" y="420" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="17" font-weight="700" fill="${accentText}">${stampTitle}</text>`,
    `    <text x="818" y="442" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="10.5" fill="${SVG_PALETTE.ink}">DIFF ${sanitizeSvgNumber(report.replayAudit.totalPixelDiffCount)} PX · GLYPH ${sanitizeSvgNumber(report.glyphAudit.coveragePercent)}%</text>`,
    `  </g>`,
    `  <rect x="46" y="514" width="868" height="74" rx="10" fill="${SVG_PALETTE.linen}" stroke="${SVG_PALETTE.border}" stroke-width="1"/>`,
    `  <text x="64" y="538" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="${SVG_PALETTE.ink}">결정론적 픽셀 재생 대조 (${escapeXml(yearsText)}) · 패널 ${sanitizeSvgNumber(report.replayAudit.panelCount)}매 · 오차 ${sanitizeSvgNumber(report.replayAudit.totalPixelDiffCount)}px</text>`,
    `  <text x="64" y="562" font-family="system-ui, -apple-system, sans-serif" font-size="12.5" fill="${SVG_PALETTE.muted}">Rights BOM 영구 보존 허가 ${sanitizeSvgNumber(report.rightsBomAudit.archivalPermittedCount)}/${sanitizeSvgNumber(report.rightsBomAudit.assetCount)}건 · 외부 URL ${sanitizeSvgNumber(report.externalUrlCount)}건 · XOR 패리티 ECC ${report.parityEccVerified ? "정상" : "미검증"}</text>`,
    `</svg>`,
  ].join("\n");

  return {
    svg,
    width,
    height,
    containsNaN: /\b(?:NaN|Infinity|-Infinity)\b/.test(svg),
    badgeCount: badgeSpecs.length,
    timelineNodeCount: claims.length,
  };
}

/** 100년 보존 봉인 감사 결과를 자연스러운 한국어 보고서로 요약. */
export function summarizeCentennialArchiveKo(report: CentennialPreservationAuditReport): string {
  const verdict = report.readyForCentennialSeal
    ? "통과 (2026↔2126 비트 일치 봉인 완료)"
    : `보류 (차단 사유 ${report.blockers.length}건 해소 필요)`;
  const creatorText = report.c2paAudit.creatorIdentity
    ? `${report.c2paAudit.creatorIdentity.displayNameKo} (${report.c2paAudit.creatorIdentity.studioNameKo})`
    : "미확인";
  const yearsText = report.replayAudit.simulatedHostYears.join(" ↔ ");

  const lines: string[] = [
    `[100년 보존 아카이브 봉인 보고서]`,
    `- 판정: ${verdict}`,
    `- 회차: ${report.episodeId}`,
    `- 아카이브 용량: ${report.archiveByteLength} bytes (청크 ${report.chunkCount}개, XOR 패리티 ECC ${report.parityEccVerified ? "정상" : "미포함/불일치"})`,
    `- Merkle 루트: ${report.merkleRootHex}`,
    `- C2PA 출처 체인: ${report.c2paAudit.valid ? "검증 통과" : "검증 실패"} (${report.c2paAudit.verifiedClaimCount}건, 창작자 ${creatorText})`,
    `- 대사 글리프 내장률: ${report.glyphAudit.coveragePercent}% (${report.glyphAudit.coveredChars}/${report.glyphAudit.totalUniqueChars}자, 누락 ${report.glyphAudit.missingGlyphs.length}자)`,
    `- 외부 네트워크 의존: ${report.externalUrlCount}건`,
    `- 결정론적 픽셀 재생(${yearsText}): 패널 ${report.replayAudit.panelCount}매, 픽셀 오차 ${report.replayAudit.totalPixelDiffCount}px (${report.replayAudit.allPanelsBitIdentical ? "전수 일치" : "불일치 감지"})`,
    `- Rights BOM 영구 보존 권한: ${report.rightsBomAudit.archivalPermittedCount}/${report.rightsBomAudit.assetCount}건 허가`,
  ];

  if (report.blockers.length > 0) {
    lines.push("- 차단 사유:");
    for (let i = 0; i < report.blockers.length; i += 1) {
      const b = report.blockers[i];
      lines.push(`  · [${b.code}] ${b.messageKo}`);
    }
  }

  return lines.join("\n");
}
