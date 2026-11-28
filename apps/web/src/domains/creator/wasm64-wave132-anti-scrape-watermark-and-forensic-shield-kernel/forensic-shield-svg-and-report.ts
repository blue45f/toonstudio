/**
 * Wave 132 — 인쇄 안전 순수 OKLCH 8×8 DCT 중주파 맵·PSNR 게이지·4종 공격 내성 차트 SVG
 * 및 번역투 없는 한국어 웹툰 저작권·보안 담당자 QA 브리프 생성기.
 *
 * - 원시 색상 포맷을 일절 사용하지 않고 순수 oklch(...) 토큰만 사용한다.
 * - 모든 동적 텍스트에 XML 이스케이프를 적용하고 비유한 좌표(NaN/Infinity) 0건을 보장한다.
 */

import {
  MID_BAND_DCT_PAIRS,
  type AntiScrapeRightsManifest,
  type ForensicShieldReportKo,
  type ForensicShieldSvgOptions,
  type ForensicShieldSvgTheme,
  type PiracyAttackSuiteResult,
  type WatermarkEmbedResult,
} from "./forensic-watermark-types";

interface ForensicOklchPalette {
  readonly canvasBg: string;
  readonly cardBg: string;
  readonly cardBorder: string;
  readonly subtleBg: string;
  readonly gridLine: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly safe: string;
  readonly safeBg: string;
  readonly caution: string;
  readonly cautionBg: string;
  readonly danger: string;
  readonly dangerBg: string;
  readonly dcCellFill: string;
  readonly pairStrokes: readonly [string, string, string, string];
}

const LIGHT_FORENSIC_PALETTE: ForensicOklchPalette = {
  canvasBg: "oklch(0.985 0.006 90)",
  cardBg: "oklch(0.996 0.003 90)",
  cardBorder: "oklch(0.86 0.014 155)",
  subtleBg: "oklch(0.955 0.008 92)",
  gridLine: "oklch(0.90 0.010 150)",
  textPrimary: "oklch(0.22 0.022 155)",
  textSecondary: "oklch(0.43 0.018 155)",
  textMuted: "oklch(0.55 0.014 155)",
  safe: "oklch(0.43 0.115 155)",
  safeBg: "oklch(0.945 0.028 155)",
  caution: "oklch(0.56 0.145 72)",
  cautionBg: "oklch(0.955 0.034 76)",
  danger: "oklch(0.50 0.185 26)",
  dangerBg: "oklch(0.948 0.036 26)",
  dcCellFill: "oklch(0.84 0.024 230)",
  pairStrokes: [
    "oklch(0.46 0.145 155)",
    "oklch(0.48 0.155 245)",
    "oklch(0.56 0.155 68)",
    "oklch(0.50 0.175 24)",
  ],
};

const DARK_FORENSIC_PALETTE: ForensicOklchPalette = {
  canvasBg: "oklch(0.16 0.012 155)",
  cardBg: "oklch(0.20 0.015 155)",
  cardBorder: "oklch(0.34 0.022 155)",
  subtleBg: "oklch(0.24 0.016 155)",
  gridLine: "oklch(0.30 0.018 155)",
  textPrimary: "oklch(0.95 0.008 92)",
  textSecondary: "oklch(0.76 0.015 150)",
  textMuted: "oklch(0.64 0.014 150)",
  safe: "oklch(0.74 0.135 155)",
  safeBg: "oklch(0.26 0.045 155)",
  caution: "oklch(0.80 0.145 76)",
  cautionBg: "oklch(0.28 0.052 74)",
  danger: "oklch(0.72 0.185 26)",
  dangerBg: "oklch(0.28 0.065 26)",
  dcCellFill: "oklch(0.35 0.042 230)",
  pairStrokes: [
    "oklch(0.74 0.145 155)",
    "oklch(0.74 0.145 245)",
    "oklch(0.80 0.155 72)",
    "oklch(0.72 0.175 26)",
  ],
};

function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function fmt(value: number, digits = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toFixed(digits);
}

/** SVG XML 특수문자(<, >, &, ", ')를 안전하게 이스케이프한다. */
export function escapeSvgXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function dctEnergyCellFill(energy: number, maxAcEnergy: number, theme: ForensicShieldSvgTheme): string {
  const safeEnergy = Number.isFinite(energy) ? Math.max(0, energy) : 0;
  const denom = Math.max(maxAcEnergy, 1);
  const ratio = clampFinite(Math.log1p(safeEnergy) / Math.log1p(denom), 0, 1, 0);
  if (theme === "dark") {
    const l = 0.22 + ratio * 0.44;
    const c = 0.015 + ratio * 0.095;
    return `oklch(${fmt(l, 3)} ${fmt(c, 3)} 162)`;
  }
  const l = 0.96 - ratio * 0.34;
  const c = 0.010 + ratio * 0.095;
  return `oklch(${fmt(l, 3)} ${fmt(c, 3)} 162)`;
}

/**
 * 8×8 DCT 중주파 삽입 히트맵, PSNR 화질 게이지, 4종 불법 복제 공격별 상관도·BER 막대 차트를
 * 인쇄 안전 순수 OKLCH SVG로 렌더링한다.
 */
export function renderForensicWatermarkShieldSvg(
  embedResult: WatermarkEmbedResult,
  attackSuite: PiracyAttackSuiteResult,
  options?: ForensicShieldSvgOptions,
): string {
  const theme: ForensicShieldSvgTheme = options?.theme ?? "light";
  const p = theme === "dark" ? DARK_FORENSIC_PALETTE : LIGHT_FORENSIC_PALETTE;
  const width = Math.round(clampFinite(options?.width ?? 960, 640, 2000, 960));
  const height = Math.round(clampFinite(options?.height ?? 560, 420, 1400, 560));

  const title =
    options?.title ??
    `Wave 132 8×8 DCT 포렌식 워터마크 보호 리포트 · ${embedResult.encodedPayload.episodeId}`;
  const psnrOk = embedResult.psnrDb >= 38.0 && embedResult.nonFiniteChannelCount === 0;
  const allOk = psnrOk && attackSuite.allAttacksPassed;
  const badgeColor = allOk ? p.safe : psnrOk ? p.caution : p.danger;
  const badgeBg = allOk ? p.safeBg : psnrOk ? p.cautionBg : p.dangerBg;
  const badgeText = allOk
    ? "통과 · 4종 공격 전수 복원"
    : psnrOk
      ? "일부 공격 복원 미달"
      : "화질·무결성 기준 미달";

  // 1) 좌측 패널: 8×8 DCT 주파수 히트맵 + 중주파 쌍 강조
  const mapCardX = 24;
  const mapCardY = 82;
  const mapCardW = 416;
  const mapCardH = 420;
  const gridOriginX = mapCardX + 52;
  const gridOriginY = mapCardY + 62;
  const cellSize = 39;

  let maxAcEnergy = 1;
  for (let i = 1; i < 64; i += 1) {
    const e = embedResult.averageDctAbsEnergy[i] ?? 0;
    if (Number.isFinite(e) && e > maxAcEnergy) {
      maxAcEnergy = e;
    }
  }

  const pairLookup = new Map<string, { readonly pairIndex: number; readonly role: "A" | "B" }>();
  for (let i = 0; i < MID_BAND_DCT_PAIRS.length; i += 1) {
    const pair = MID_BAND_DCT_PAIRS[i];
    pairLookup.set(`${pair.first.u},${pair.first.v}`, { pairIndex: i, role: "A" });
    pairLookup.set(`${pair.second.u},${pair.second.v}`, { pairIndex: i, role: "B" });
  }

  const cellsSvg: string[] = [];
  for (let v = 0; v < 8; v += 1) {
    for (let u = 0; u < 8; u += 1) {
      const cx = gridOriginX + u * cellSize;
      const cy = gridOriginY + v * cellSize;
      const energy = embedResult.averageDctAbsEnergy[v * 8 + u] ?? 0;
      const isDc = u === 0 && v === 0;
      const fill = isDc ? p.dcCellFill : dctEnergyCellFill(energy, maxAcEnergy, theme);
      const pairHit = pairLookup.get(`${u},${v}`);
      const stroke = pairHit ? p.pairStrokes[pairHit.pairIndex] : p.gridLine;
      const strokeW = pairHit ? 2.4 : 0.8;

      cellsSvg.push(
        `<rect x="${fmt(cx)}" y="${fmt(cy)}" width="${fmt(cellSize - 2)}" height="${fmt(cellSize - 2)}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${fmt(strokeW, 1)}" />`,
      );
      if (isDc) {
        cellsSvg.push(
          `<text x="${fmt(cx + (cellSize - 2) * 0.5)}" y="${fmt(cy + 23)}" text-anchor="middle" font-size="11" font-weight="700" fill="${p.textPrimary}">DC</text>`,
        );
      } else if (pairHit) {
        const tag = `P${pairHit.pairIndex}${pairHit.role}`;
        cellsSvg.push(
          `<text x="${fmt(cx + (cellSize - 2) * 0.5)}" y="${fmt(cy + 23)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${p.pairStrokes[pairHit.pairIndex]}">${tag}</text>`,
        );
      }
    }
  }

  // 중주파 계수 쌍 연결선 (대칭 쌍 시각화)
  const pairLinksSvg: string[] = [];
  for (let i = 0; i < MID_BAND_DCT_PAIRS.length; i += 1) {
    const pair = MID_BAND_DCT_PAIRS[i];
    const x1 = gridOriginX + pair.first.u * cellSize + (cellSize - 2) * 0.5;
    const y1 = gridOriginY + pair.first.v * cellSize + (cellSize - 2) * 0.5;
    const x2 = gridOriginX + pair.second.u * cellSize + (cellSize - 2) * 0.5;
    const y2 = gridOriginY + pair.second.v * cellSize + (cellSize - 2) * 0.5;
    pairLinksSvg.push(
      `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="${p.pairStrokes[i]}" stroke-width="1.3" stroke-dasharray="3 3" opacity="0.72" />`,
    );
  }

  // 축 눈금 u (0..7), v (0..7)
  const axisLabelsSvg: string[] = [];
  for (let k = 0; k < 8; k += 1) {
    axisLabelsSvg.push(
      `<text x="${fmt(gridOriginX + k * cellSize + (cellSize - 2) * 0.5)}" y="${fmt(gridOriginY - 8)}" text-anchor="middle" font-size="10" fill="${p.textMuted}">u${k}</text>`,
    );
    axisLabelsSvg.push(
      `<text x="${fmt(gridOriginX - 10)}" y="${fmt(gridOriginY + k * cellSize + 23)}" text-anchor="end" font-size="10" fill="${p.textMuted}">v${k}</text>`,
    );
  }

  // 중주파 쌍 범례
  const pairLegendSvg = MID_BAND_DCT_PAIRS.map((pair, idx) => {
    const lx = mapCardX + 18 + (idx % 2) * 196;
    const ly = mapCardY + 388 + Math.floor(idx / 2) * 18;
    return [
      `<rect x="${fmt(lx)}" y="${fmt(ly - 9)}" width="10" height="10" rx="2" fill="${p.pairStrokes[idx]}" />`,
      `<text x="${fmt(lx + 15)}" y="${fmt(ly)}" font-size="10.5" fill="${p.textSecondary}">P${idx} ${escapeSvgXml(pair.label)} · Q75 ${pair.jpegQ75Steps[0]}/${pair.jpegQ75Steps[1]}</text>`,
    ].join("");
  }).join("\n    ");

  // 2) 우상단 패널: 비가시 화질 PSNR 게이지
  const rightX = 458;
  const rightW = width - rightX - 24;
  const psnrCardY = 82;
  const psnrCardH = 152;
  const gaugeX = rightX + 20;
  const gaugeY = psnrCardY + 76;
  const gaugeW = rightW - 40;
  const gaugeH = 18;
  const psnrMin = 25;
  const psnrMax = 55;
  const psnrRatio = clampFinite((embedResult.psnrDb - psnrMin) / (psnrMax - psnrMin), 0, 1, 0);
  const psnrFillW = gaugeW * psnrRatio;
  const tick38X = gaugeX + gaugeW * ((38 - psnrMin) / (psnrMax - psnrMin));
  const tick40X = gaugeX + gaugeW * ((40 - psnrMin) / (psnrMax - psnrMin));
  const psnrBarColor = embedResult.psnrDb >= 40 ? p.safe : embedResult.psnrDb >= 38 ? p.caution : p.danger;

  // 3) 우하단 패널: 4종 불법 복제 공격 내성 차트 (상관도 & BER)
  const attackCardY = 250;
  const attackCardH = 252;
  const barStartX = rightX + 168;
  const barMaxW = Math.max(120, rightW - 282);
  const thresholdX = barStartX + barMaxW * 0.65;

  const attackRowsSvg = attackSuite.attacks
    .map((atk, idx) => {
      const rowY = attackCardY + 62 + idx * 45;
      const corr = clampFinite(atk.detection.normalizedCorrelation, 0, 1, 0);
      const fillW = barMaxW * corr;
      const barColor = atk.passed ? p.safe : p.danger;
      const berPct = fmt(atk.bitErrorRate * 100, 1);
      const statusText = atk.passed ? "복원" : "실패";
      const statusFill = atk.passed ? p.safeBg : p.dangerBg;
      const statusStroke = atk.passed ? p.safe : p.danger;

      return [
        `<text x="${fmt(rightX + 18)}" y="${fmt(rowY + 14)}" font-size="11.5" font-weight="600" fill="${p.textPrimary}">${escapeSvgXml(atk.labelKo)}</text>`,
        `<text x="${fmt(rightX + 18)}" y="${fmt(rowY + 29)}" font-size="10" fill="${p.textMuted}">BER ${berPct}% · CRC ${atk.detection.crcValid ? "일치" : "불일치"}</text>`,
        `<rect x="${fmt(barStartX)}" y="${fmt(rowY + 5)}" width="${fmt(barMaxW)}" height="16" rx="4" fill="${p.subtleBg}" stroke="${p.gridLine}" stroke-width="0.8" />`,
        `<rect x="${fmt(barStartX)}" y="${fmt(rowY + 5)}" width="${fmt(fillW)}" height="16" rx="4" fill="${barColor}" />`,
        `<text x="${fmt(barStartX + barMaxW + 10)}" y="${fmt(rowY + 17)}" font-size="11" font-weight="700" fill="${p.textPrimary}">r=${fmt(corr, 2)}</text>`,
        `<rect x="${fmt(barStartX + barMaxW + 58)}" y="${fmt(rowY + 3)}" width="42" height="20" rx="10" fill="${statusFill}" stroke="${statusStroke}" stroke-width="1" />`,
        `<text x="${fmt(barStartX + barMaxW + 79)}" y="${fmt(rowY + 17)}" text-anchor="middle" font-size="10" font-weight="700" fill="${statusStroke}">${statusText}</text>`,
      ].join("\n    ");
    })
    .join("\n    ");

  const policySummaryText = options?.manifest
    ? `TDM=1 · C2PA notAllowed · SHA-256 ${options.manifest.manifestSha256Hex.slice(0, 16)}`
    : `TDM=1 · C2PA notAllowed 권장 · 페이로드 0x${embedResult.encodedPayload.payloadHex}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeSvgXml(title)}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="${p.canvasBg}" />

  <!-- 헤더 -->
  <text x="24" y="34" font-family="system-ui, -apple-system, sans-serif" font-size="17" font-weight="700" fill="${p.textPrimary}">${escapeSvgXml(title)}</text>
  <text x="24" y="56" font-family="system-ui, -apple-system, sans-serif" font-size="11.5" fill="${p.textSecondary}">저작자 ${escapeSvgXml(embedResult.encodedPayload.creatorId)} · 대상 ${escapeSvgXml(embedResult.encodedPayload.recipientId)} · 페이로드 0x${escapeSvgXml(embedResult.encodedPayload.payloadHex)} · ${embedResult.watermarkedTile.width}×${embedResult.watermarkedTile.height} (${embedResult.totalBlocks}블록)</text>

  <rect x="${fmt(width - 216)}" y="20" width="192" height="30" rx="15" fill="${badgeBg}" stroke="${badgeColor}" stroke-width="1.2" />
  <text x="${fmt(width - 120)}" y="39" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="11.5" font-weight="700" fill="${badgeColor}">${escapeSvgXml(badgeText)}</text>

  <!-- 좌측: 8×8 DCT 중주파 히트맵 -->
  <rect x="${mapCardX}" y="${mapCardY}" width="${mapCardW}" height="${mapCardH}" rx="12" fill="${p.cardBg}" stroke="${p.cardBorder}" stroke-width="1.1" />
  <text x="${mapCardX + 18}" y="${mapCardY + 26}" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="${p.textPrimary}">8×8 DCT-II 중주파 워터마크 맵</text>
  <text x="${mapCardX + 18}" y="${mapCardY + 43}" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="${p.textSecondary}">평균 계수 에너지 및 4대 대칭 중주파 삽입 쌍 강조</text>
  <g font-family="system-ui, -apple-system, sans-serif">
    ${axisLabelsSvg.join("\n    ")}
    ${cellsSvg.join("\n    ")}
    ${pairLinksSvg.join("\n    ")}
    ${pairLegendSvg}
  </g>

  <!-- 우상단: PSNR 비가시 화질 게이지 -->
  <rect x="${rightX}" y="${psnrCardY}" width="${rightW}" height="${psnrCardH}" rx="12" fill="${p.cardBg}" stroke="${p.cardBorder}" stroke-width="1.1" />
  <text x="${rightX + 20}" y="${psnrCardY + 26}" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="${p.textPrimary}">비가시 화질 보존 (PSNR)</text>
  <text x="${fmt(rightX + rightW - 20)}" y="${psnrCardY + 32}" text-anchor="end" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="800" fill="${psnrBarColor}">${fmt(embedResult.psnrDb, 2)} dB</text>
  <text x="${rightX + 20}" y="${psnrCardY + 47}" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="${p.textSecondary}">MSE ${fmt(embedResult.mse, 2)} · 최대 화소 편차 ${embedResult.maxAbsChannelDelta} · 비유한 채널 ${embedResult.nonFiniteChannelCount}건 · 강도 ${fmt(embedResult.strength, 2)}×</text>

  <rect x="${fmt(gaugeX)}" y="${fmt(gaugeY)}" width="${fmt(gaugeW)}" height="${gaugeH}" rx="6" fill="${p.subtleBg}" stroke="${p.gridLine}" stroke-width="0.9" />
  <rect x="${fmt(gaugeX)}" y="${fmt(gaugeY)}" width="${fmt(psnrFillW)}" height="${gaugeH}" rx="6" fill="${psnrBarColor}" />
  <line x1="${fmt(tick38X)}" y1="${fmt(gaugeY - 5)}" x2="${fmt(tick38X)}" y2="${fmt(gaugeY + gaugeH + 5)}" stroke="${p.caution}" stroke-width="1.4" stroke-dasharray="3 2" />
  <line x1="${fmt(tick40X)}" y1="${fmt(gaugeY - 5)}" x2="${fmt(tick40X)}" y2="${fmt(gaugeY + gaugeH + 5)}" stroke="${p.safe}" stroke-width="1.6" />
  <text x="${fmt(gaugeX)}" y="${fmt(gaugeY + 34)}" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="${p.textMuted}">25 dB</text>
  <text x="${fmt(tick38X - 4)}" y="${fmt(gaugeY + 34)}" text-anchor="end" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="${p.caution}">38 dB 최소</text>
  <text x="${fmt(tick40X + 4)}" y="${fmt(gaugeY + 34)}" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="700" fill="${p.safe}">40 dB 권장</text>
  <text x="${fmt(gaugeX + gaugeW)}" y="${fmt(gaugeY + 34)}" text-anchor="end" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="${p.textMuted}">55 dB</text>
  <text x="${rightX + 20}" y="${psnrCardY + 136}" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="${p.textSecondary}">무공격 블라인드 복원 상관도 r=${fmt(attackSuite.baselineDetection.normalizedCorrelation, 3)} · 비트당 반복 ${fmt(embedResult.copiesPerBit, 1)}회</text>

  <!-- 우하단: 4종 불법 복제 공격 내성 -->
  <rect x="${rightX}" y="${attackCardY}" width="${rightW}" height="${attackCardH}" rx="12" fill="${p.cardBg}" stroke="${p.cardBorder}" stroke-width="1.1" />
  <text x="${rightX + 18}" y="${attackCardY + 26}" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="${p.textPrimary}">4종 유출·재가공 공격 내성 검증</text>
  <text x="${rightX + 18}" y="${attackCardY + 43}" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="${p.textSecondary}">정규화 상관도 임계선 0.65 · 최대 허용 BER 5.0%</text>
  <line x1="${fmt(thresholdX)}" y1="${attackCardY + 56}" x2="${fmt(thresholdX)}" y2="${attackCardY + 236}" stroke="${p.caution}" stroke-width="1.2" stroke-dasharray="4 3" />
  <g font-family="system-ui, -apple-system, sans-serif">
    ${attackRowsSvg}
  </g>

  <!-- 하단 요약 푸터 -->
  <rect x="24" y="${height - 42}" width="${width - 48}" height="28" rx="8" fill="${p.subtleBg}" stroke="${p.gridLine}" stroke-width="0.9" />
  <text x="38" y="${height - 24}" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="${p.textSecondary}">${escapeSvgXml(policySummaryText)}</text>
  <text x="${fmt(width - 38)}" y="${height - 24}" text-anchor="end" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="${p.textMuted}">순수 OKLCH 인쇄 안전 출력 · 키 지문 ${escapeSvgXml(embedResult.secretKeyFingerprintHex)}</text>
</svg>`;
}

/**
 * 번역투 없는 자연스러운 한국어 웹툰 저작권·보안 담당자 QA 브리프를 생성한다.
 */
export function summarizeForensicWatermarkShieldKo(
  embedResult: WatermarkEmbedResult,
  attackSuite: PiracyAttackSuiteResult,
  manifest: AntiScrapeRightsManifest,
): ForensicShieldReportKo {
  const psnrHealthy = embedResult.psnrDb >= 38.0 && embedResult.nonFiniteChannelCount === 0;
  const baselineOk =
    attackSuite.baselineDetection.detected &&
    (attackSuite.baselineDetection.bitErrorRate ?? 1) === 0;
  const passedAllGates = psnrHealthy && baselineOk && attackSuite.allAttacksPassed;

  const verdictKo: "배포 승인" | "재검토 필요" | "차단" = passedAllGates
    ? "배포 승인"
    : psnrHealthy
      ? "재검토 필요"
      : "차단";

  const passedCount = attackSuite.attacks.filter((a) => a.passed).length;
  const headlineKo = passedAllGates
    ? `${embedResult.encodedPayload.episodeId} 배포본의 비가시 워터마크와 4종 유출 공격 복원 기준을 모두 충족했습니다 (PSNR ${fmt(embedResult.psnrDb, 2)} dB · 최소 상관도 ${fmt(attackSuite.minCorrelationAcrossAttacks, 2)}).`
    : `${embedResult.encodedPayload.episodeId} 배포본 점검에서 보완 항목이 확인되었습니다 (PSNR ${fmt(embedResult.psnrDb, 2)} dB · 공격 통과 ${passedCount}/${attackSuite.attacks.length}건).`;

  const visualQualityLineKo = `화질 보존: PSNR ${fmt(embedResult.psnrDb, 2)} dB (MSE ${fmt(embedResult.mse, 2)}, 최대 화소 편차 ${embedResult.maxAbsChannelDelta}), 비유한·범위 이탈 채널 ${embedResult.nonFiniteChannelCount + embedResult.outOfRangeChannelCount}건.`;

  const attackResilienceLinesKo = attackSuite.attacks.map((atk) => {
    const berPct = fmt(atk.bitErrorRate * 100, 1);
    const corrText = fmt(atk.detection.normalizedCorrelation, 2);
    const phaseNote =
      atk.detection.phaseShiftX !== 0 || atk.detection.phaseShiftY !== 0
        ? `, 크롭 위상 (${atk.detection.phaseShiftX},${atk.detection.phaseShiftY}) 자동 정렬`
        : "";
    const statusLabel = atk.passed ? "통과" : "실패";
    return `${atk.labelKo}: ${statusLabel} (상관도 ${corrText}, BER ${berPct}%, 복원 코드 0x${atk.detection.recoveredPayloadHex}${phaseNote})`;
  });

  const antiScrapePolicyLineKo = `AI 학습 거부 선언: tdm-reservation=${manifest.tdmReservation}, ${manifest.c2paTrainingMining.label}=${manifest.c2paTrainingMining.summaryPolicy}, 봉인 SHA-256 ${manifest.manifestSha256Hex.slice(0, 16)}…`;

  const actionChecklistKo: string[] = passedAllGates
    ? [
        `배포 대상(${embedResult.encodedPayload.recipientId}) 추적 코드 0x${embedResult.encodedPayload.payloadHex}를 회차 유출 대장에 기록`,
        `CDN 응답 헤더(TDM-Reservation: 1, X-Robots-Tag: noai, noimageai)와 PNG/WebP XMP 패킷 부착 확인`,
        `불법 공유 제보 접수 시 원본 없이 비밀 키(${embedResult.secretKeyFingerprintHex})만으로 블라인드 검출 실행`,
      ]
    : [
        `화질(PSNR >= 38 dB) 또는 실패 공격 항목의 강도 파라미터를 조정해 재삽입`,
        `재검증 통과 전까지 외부 검토본·선공개 배포 보류`,
      ];

  const fullTextKo = [
    `□ 판정 요약: ${verdictKo}`,
    `  ㅇ ${headlineKo}`,
    `□ 비가시 화질 및 삽입 구성`,
    `  ㅇ ${visualQualityLineKo}`,
    `  - 타일 규격 ${embedResult.watermarkedTile.width}×${embedResult.watermarkedTile.height} (${embedResult.totalBlocks}개 8×8 블록), 비트당 ${fmt(embedResult.copiesPerBit, 1)}회 반복 부호화`,
    `  - 저작자 ${embedResult.encodedPayload.creatorId} · 대상 ${embedResult.encodedPayload.recipientId} · 추적 코드 0x${embedResult.encodedPayload.payloadHex}`,
    `□ 4종 불법 복제 공격 내성 실측`,
    ...attackResilienceLinesKo.map((line) => `  - ${line}`),
    `□ AI 무단 학습 거부 및 무결성 봉인`,
    `  ㅇ ${antiScrapePolicyLineKo}`,
    `□ 담당자 후속 조치`,
    ...actionChecklistKo.map((item) => `  - ${item}`),
  ].join("\n");

  return {
    verdictKo,
    passedAllGates,
    headlineKo,
    visualQualityLineKo,
    attackResilienceLinesKo,
    antiScrapePolicyLineKo,
    actionChecklistKo,
    fullTextKo,
  };
}
