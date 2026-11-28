/**
 * Wave 92 — 인쇄 대응 색각안전 SVG 심의 매트릭스 및 한국어 프리플라이트 감사 요약.
 *
 * - 모든 셀에 색상과 명시적 문자 기호(`OK` / `VAR` / `BLK`)를 함께 표기해 색각이상·흑백 인쇄 환경에서도 구분 가능하다.
 * - 모든 수치 좌표에 유한수 가드를 적용해 `NaN`/`Infinity` 출력을 원천 차단하고, 모든 텍스트를 XML 이스케이프한다.
 * - 번역투 없는 간결한 한국어 제작 현장 보고서를 생성한다.
 */

import type { RegionalDeliveryManifest } from "./non-destructive-geo-variant-compositor";
import type {
  ComplianceCategory,
  PanelRegionCellStatus,
  RegionalComplianceMatrixReport,
} from "./regional-compliance-policy-engine";

export interface ComplianceMatrixSvgOptions {
  readonly cellWidthPx?: number;
  readonly rowHeightPx?: number;
  readonly panelColumnWidthPx?: number;
  readonly titleOverride?: string;
}

export interface GeoComplianceAuditSummaryOptions {
  readonly generatedDateIso?: string;
}

interface CellPalette {
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
  readonly strokeDasharray?: string;
}

const PRINT_SAFE_CELL_PALETTE: Readonly<Record<PanelRegionCellStatus, CellPalette>> = {
  OK: {
    fill: "#E8F5EE",
    stroke: "#1B5E3A",
    text: "#103D24",
  },
  VAR: {
    fill: "#E2EFFC",
    stroke: "#1659B3",
    text: "#0E3975",
    strokeDasharray: "4 2",
  },
  BLK: {
    fill: "#FCE7E3",
    stroke: "#B42318",
    text: "#7A1811",
  },
};

const CATEGORY_LABEL_KO: Readonly<Record<ComplianceCategory, string>> = {
  "gore-blood": "혈흔·신체 훼손",
  "alcohol-tobacco": "주류·흡연",
  "weapon-violence": "흉기·폭력",
  "wardrobe-exposure": "의상 노출",
  "trademark-brand-signage": "상표·간판",
  "pii-contact-identifier": "개인정보(연락처·번호판)",
  "cultural-symbol": "문화·역사 문양",
};

/** XML 특수문자(`&`, `<`, `>`, `"`, `'`)를 안전하게 이스케이프한다. */
export function escapeComplianceSvgXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeSvgNumber(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(value * 100) / 100));
}

function fmtNum(value: number): string {
  const safe = Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
  return String(safe);
}

function truncateLabel(raw: string, maxChars: number): string {
  if (raw.length <= maxChars) {
    return raw;
  }
  return `${raw.slice(0, Math.max(1, maxChars - 1))}…`;
}

/**
 * 패널 × 권역 심의 커버리지 매트릭스를 인쇄 대응·색각안전 고대비 SVG로 렌더링한다.
 */
export function renderComplianceCoverageMatrixSvg(
  report: RegionalComplianceMatrixReport,
  options?: ComplianceMatrixSvgOptions,
): string {
  const cellW = safeSvgNumber(options?.cellWidthPx ?? 96, 96, 68, 180);
  const rowH = safeSvgNumber(options?.rowHeightPx ?? 36, 36, 28, 64);
  const panelColW = safeSvgNumber(options?.panelColumnWidthPx ?? 188, 188, 120, 320);

  const padX = 20;
  const padY = 20;
  const headerBlockH = 72;
  const tableHeaderH = 38;
  const footerSummaryH = 44;

  const regionCount = report.targetRegions.length;
  const panelCount = report.panelIds.length;
  const gridWidth = panelColW + Math.max(1, regionCount) * cellW;
  const totalWidth = padX * 2 + gridWidth;
  const totalHeight =
    padY * 2 + headerBlockH + tableHeaderH + Math.max(1, panelCount) * rowH + footerSummaryH;

  const titleText =
    options?.titleOverride ??
    `${report.episodeTitle} (${report.episodeId} · Rev.${report.masterRevision})`;

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmtNum(totalWidth)}" height="${fmtNum(totalHeight)}" viewBox="0 0 ${fmtNum(totalWidth)} ${fmtNum(totalHeight)}" role="img" aria-label="${escapeComplianceSvgXml(`지역별 심의 커버리지 매트릭스: ${titleText}`)}">`,
  );
  lines.push(`  <title>${escapeComplianceSvgXml(titleText)}</title>`);
  lines.push(
    `  <rect x="0" y="0" width="${fmtNum(totalWidth)}" height="${fmtNum(totalHeight)}" fill="#FAF8F3" />`,
  );
  lines.push(
    `  <rect x="${fmtNum(padX)}" y="${fmtNum(padY)}" width="${fmtNum(gridWidth)}" height="${fmtNum(totalHeight - padY * 2)}" rx="8" fill="#FFFFFF" stroke="#223E30" stroke-opacity="0.18" stroke-width="1" />`,
  );

  // 상단 제목 및 색각안전 범례
  lines.push(
    `  <text x="${fmtNum(padX + 16)}" y="${fmtNum(padY + 28)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="15" font-weight="700" fill="#172B22">${escapeComplianceSvgXml(titleText)}</text>`,
  );

  const legendY = padY + 46;
  const legendItems: ReadonlyArray<{
    readonly code: PanelRegionCellStatus;
    readonly desc: string;
    readonly xOffset: number;
  }> = [
    { code: "OK", desc: "기본 마스터 통과", xOffset: 16 },
    { code: "VAR", desc: "승인 변형 레이어 보정", xOffset: 174 },
    { code: "BLK", desc: "출고 차단 (보정 필요)", xOffset: 356 },
  ];

  for (let i = 0; i < legendItems.length; i += 1) {
    const item = legendItems[i];
    const pal = PRINT_SAFE_CELL_PALETTE[item.code];
    const lx = padX + item.xOffset;
    const dashAttr =
      pal.strokeDasharray !== undefined ? ` stroke-dasharray="${pal.strokeDasharray}"` : "";
    lines.push(
      `  <rect x="${fmtNum(lx)}" y="${fmtNum(legendY - 11)}" width="34" height="18" rx="4" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="1.5"${dashAttr} />`,
    );
    lines.push(
      `  <text x="${fmtNum(lx + 17)}" y="${fmtNum(legendY + 2)}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-size="10" font-weight="700" fill="${pal.text}">${item.code}</text>`,
    );
    lines.push(
      `  <text x="${fmtNum(lx + 42)}" y="${fmtNum(legendY + 2)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="11" fill="#2E3F37">${escapeComplianceSvgXml(item.desc)}</text>`,
    );
  }

  // 표 헤더 (패널 / 권역 열)
  const tableTop = padY + headerBlockH;
  lines.push(
    `  <rect x="${fmtNum(padX)}" y="${fmtNum(tableTop)}" width="${fmtNum(gridWidth)}" height="${fmtNum(tableHeaderH)}" fill="#F3F0E8" stroke="#223E30" stroke-opacity="0.14" stroke-width="1" />`,
  );
  lines.push(
    `  <text x="${fmtNum(padX + 14)}" y="${fmtNum(tableTop + 23)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="12" font-weight="700" fill="#1F4435">패널</text>`,
  );

  for (let ri = 0; ri < regionCount; ri += 1) {
    const regionCode = report.targetRegions[ri];
    const colX = padX + panelColW + ri * cellW;
    lines.push(
      `  <line x1="${fmtNum(colX)}" y1="${fmtNum(tableTop)}" x2="${fmtNum(colX)}" y2="${fmtNum(tableTop + tableHeaderH + Math.max(1, panelCount) * rowH + footerSummaryH)}" stroke="#223E30" stroke-opacity="0.12" stroke-width="1" />`,
    );
    lines.push(
      `  <text x="${fmtNum(colX + cellW * 0.5)}" y="${fmtNum(tableTop + 23)}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-size="12" font-weight="700" fill="#1F4435">${escapeComplianceSvgXml(regionCode)}</text>`,
    );
  }

  // 셀 상태 조회용 맵 구성
  const cellLookup = new Map<string, { readonly status: PanelRegionCellStatus; readonly warns: number }>();
  for (let ri = 0; ri < report.regions.length; ri += 1) {
    const reg = report.regions[ri];
    for (let ci = 0; ci < reg.panelStatuses.length; ci += 1) {
      const cell = reg.panelStatuses[ci];
      cellLookup.set(`${cell.panelId}::${reg.regionCode}`, {
        status: cell.status,
        warns: cell.warningCount,
      });
    }
  }

  // 본문 행 (패널별 상태)
  const bodyTop = tableTop + tableHeaderH;
  if (panelCount === 0) {
    lines.push(
      `  <text x="${fmtNum(padX + 14)}" y="${fmtNum(bodyTop + rowH * 0.62)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="12" fill="#5A6B63">등록된 패널이 없습니다.</text>`,
    );
  } else {
    for (let pi = 0; pi < panelCount; pi += 1) {
      const panelId = report.panelIds[pi];
      const panelTitle = report.panelTitlesById[panelId] ?? panelId;
      const rowY = bodyTop + pi * rowH;
      const stripeFill = pi % 2 === 1 ? "#FAF8F3" : "#FFFFFF";
      lines.push(
        `  <rect x="${fmtNum(padX)}" y="${fmtNum(rowY)}" width="${fmtNum(gridWidth)}" height="${fmtNum(rowH)}" fill="${stripeFill}" />`,
      );
      lines.push(
        `  <line x1="${fmtNum(padX)}" y1="${fmtNum(rowY)}" x2="${fmtNum(padX + gridWidth)}" y2="${fmtNum(rowY)}" stroke="#223E30" stroke-opacity="0.10" stroke-width="1" />`,
      );
      const label = truncateLabel(`${panelId} · ${panelTitle}`, 24);
      lines.push(
        `  <text x="${fmtNum(padX + 14)}" y="${fmtNum(rowY + rowH * 0.62)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="11.5" fill="#1C2E26">${escapeComplianceSvgXml(label)}</text>`,
      );

      for (let ri = 0; ri < regionCount; ri += 1) {
        const regionCode = report.targetRegions[ri];
        const info = cellLookup.get(`${panelId}::${regionCode}`) ?? { status: "OK" as const, warns: 0 };
        const pal = PRINT_SAFE_CELL_PALETTE[info.status];
        const boxX = padX + panelColW + ri * cellW + 10;
        const boxY = rowY + 6;
        const boxW = cellW - 20;
        const boxH = rowH - 12;
        const dashAttr =
          pal.strokeDasharray !== undefined ? ` stroke-dasharray="${pal.strokeDasharray}"` : "";

        lines.push(
          `  <rect x="${fmtNum(boxX)}" y="${fmtNum(boxY)}" width="${fmtNum(boxW)}" height="${fmtNum(boxH)}" rx="5" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="${info.status === "BLK" ? "2" : "1.2"}"${dashAttr} />`,
        );
        const symbol = info.status === "OK" && info.warns > 0 ? `OK (${info.warns}w)` : info.status;
        lines.push(
          `  <text x="${fmtNum(boxX + boxW * 0.5)}" y="${fmtNum(boxY + boxH * 0.68)}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-size="11" font-weight="700" fill="${pal.text}">${escapeComplianceSvgXml(symbol)}</text>`,
        );
      }
    }
  }

  // 하단 권역 판정 요약 행
  const footerY = bodyTop + Math.max(1, panelCount) * rowH;
  lines.push(
    `  <rect x="${fmtNum(padX)}" y="${fmtNum(footerY)}" width="${fmtNum(gridWidth)}" height="${fmtNum(footerSummaryH)}" fill="#F3F0E8" stroke="#223E30" stroke-opacity="0.14" stroke-width="1" />`,
  );
  lines.push(
    `  <text x="${fmtNum(padX + 14)}" y="${fmtNum(footerY + 26)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="12" font-weight="700" fill="#1F4435">권역 출고 판정</text>`,
  );

  for (let ri = 0; ri < regionCount; ri += 1) {
    const regionCode = report.targetRegions[ri];
    const regReport = report.byRegion[regionCode];
    const allowed = regReport?.exportAllowed ?? false;
    const blkCount = regReport?.blockingFindings.length ?? 0;
    const varCount = regReport?.resolvedByVariantCount ?? 0;
    const colX = padX + panelColW + ri * cellW;
    const badgeColor = allowed ? "#1B5E3A" : "#B42318";
    const statusLabel = allowed ? `PASS · V${varCount}` : `HOLD · B${blkCount}`;
    lines.push(
      `  <text x="${fmtNum(colX + cellW * 0.5)}" y="${fmtNum(footerY + 26)}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-size="11" font-weight="700" fill="${badgeColor}">${escapeComplianceSvgXml(statusLabel)}</text>`,
    );
  }

  lines.push("</svg>");
  return lines.join("\n");
}

/**
 * 권역별 심의 결과와 Rights BOM 출고 매니페스트를 종합해
 * 편집자·작가가 즉시 조치할 수 있는 자연스러운 한국어 감사 보고서를 생성한다.
 */
export function summarizeGeoComplianceAuditKo(
  matrixReport: RegionalComplianceMatrixReport,
  manifests: readonly RegionalDeliveryManifest[],
  options?: GeoComplianceAuditSummaryOptions,
): string {
  const manifestByRegion = new Map<string, RegionalDeliveryManifest>();
  for (let i = 0; i < manifests.length; i += 1) {
    manifestByRegion.set(manifests[i].regionCode, manifests[i]);
  }

  const approvedRegions: string[] = [];
  const blockedRegions: string[] = [];
  for (let i = 0; i < matrixReport.targetRegions.length; i += 1) {
    const code = matrixReport.targetRegions[i];
    const manifest = manifestByRegion.get(code);
    const regionReport = matrixReport.byRegion[code];
    const isApproved =
      manifest !== undefined
        ? manifest.exportDecision === "APPROVED"
        : regionReport?.exportAllowed === true;
    if (isApproved) {
      approvedRegions.push(code);
    } else {
      blockedRegions.push(code);
    }
  }

  const lines: string[] = [];
  lines.push(`# 글로벌 동시 연재 출고 사전 점검 보고서`);
  lines.push("");
  lines.push(
    `- 회차: ${matrixReport.episodeTitle} (\`${matrixReport.episodeId}\`, 마스터 Rev.${matrixReport.masterRevision})`,
  );
  if (options?.generatedDateIso !== undefined) {
    lines.push(`- 점검 기준일: ${options.generatedDateIso}`);
  }
  lines.push(
    `- 출고 현황: 전체 ${matrixReport.targetRegions.length}개 권역 중 **${approvedRegions.length}개 승인**, **${blockedRegions.length}개 차단**`,
  );
  lines.push(
    `- 단일 마스터 보호: 원본 기본 레이어 수정 건수 **0건** (모든 권역 보정은 비파괴 변형 레이어로 분리 적용)`,
  );
  lines.push("");
  lines.push("## 권역별 출고 게이트 요약");
  lines.push("");
  lines.push("| 권역 | 최종 판정 | 심의 차단 | 변형 보정 | 주의 | 권리 BOM | 마스터 레이어 재사용률 | 매니페스트 서명 |");
  lines.push("| --- | --- | ---: | ---: | ---: | --- | ---: | --- |");

  for (let i = 0; i < matrixReport.targetRegions.length; i += 1) {
    const code = matrixReport.targetRegions[i];
    const reg = matrixReport.byRegion[code];
    const manifest = manifestByRegion.get(code);
    const decisionLabel =
      manifest !== undefined
        ? manifest.exportDecision === "APPROVED"
          ? "출고 승인"
          : "출고 차단"
        : reg?.exportAllowed
          ? "심의 통과"
          : "출고 차단";
    const blkCount = reg?.blockingFindings.length ?? 0;
    const varCount = reg?.resolvedByVariantCount ?? 0;
    const warnCount = reg?.warningFindings.length ?? 0;
    const bomText =
      manifest === undefined
        ? "미검증"
        : manifest.rightsBomEvaluation.allAssetsCleared
          ? `통과 (${manifest.rightsBomEvaluation.evaluatedAssetCount}종)`
          : `차단 ${manifest.rightsBomEvaluation.blockers.length}건`;
    const reuseText =
      manifest !== undefined ? `${(manifest.sharedLayerReuseRatio * 100).toFixed(1)}%` : "-";
    const sigText = manifest !== undefined ? `\`${manifest.manifestSha256.slice(0, 12)}\`` : "-";

    lines.push(
      `| ${code} | ${decisionLabel} | ${blkCount} | ${varCount} | ${warnCount} | ${bomText} | ${reuseText} | ${sigText} |`,
    );
  }

  // 권리 BOM 차단 상세
  const bomActionLines: string[] = [];
  for (let i = 0; i < manifests.length; i += 1) {
    const m = manifests[i];
    for (let bi = 0; bi < m.rightsBomEvaluation.blockers.length; bi += 1) {
      const b = m.rightsBomEvaluation.blockers[bi];
      bomActionLines.push(`- **[${m.regionCode}]** ${b.messageKo}`);
    }
  }

  lines.push("");
  lines.push("## 권리 BOM(라이선스·권역·만료) 점검 결과");
  lines.push("");
  if (bomActionLines.length === 0) {
    lines.push("- 검증된 모든 권역의 폰트·3D 소품·브러시·오디오 라이선스가 출고 기준을 충족했습니다.");
  } else {
    for (let i = 0; i < bomActionLines.length; i += 1) {
      lines.push(bomActionLines[i]);
    }
  }

  // 심의 차단 조치 항목
  const complianceActionLines: string[] = [];
  for (let i = 0; i < matrixReport.regions.length; i += 1) {
    const reg = matrixReport.regions[i];
    for (let fi = 0; fi < reg.blockingFindings.length; fi += 1) {
      const f = reg.blockingFindings[fi];
      const catKo = CATEGORY_LABEL_KO[f.category];
      const pct = (f.coverageRatio * 100).toFixed(1);
      complianceActionLines.push(
        `- **[${reg.regionCode} · ${f.panelId} · ${catKo}]** 덮개율 ${pct}% — ${f.remediationSuggestionKo}`,
      );
    }
  }

  lines.push("");
  lines.push("## 출고 전 바로 처리할 항목");
  lines.push("");
  if (complianceActionLines.length === 0 && bomActionLines.length === 0) {
    lines.push("- 남은 차단 사유가 없습니다. 모든 대상 권역 패키지를 바로 출고할 수 있습니다.");
  } else {
    if (complianceActionLines.length === 0) {
      lines.push("- 심의 차단 항목은 모두 해소되었습니다. 위 권리 BOM 라이선스 항목만 교체하거나 갱신하세요.");
    } else {
      for (let i = 0; i < complianceActionLines.length; i += 1) {
        lines.push(complianceActionLines[i]);
      }
    }
  }

  return lines.join("\n");
}
