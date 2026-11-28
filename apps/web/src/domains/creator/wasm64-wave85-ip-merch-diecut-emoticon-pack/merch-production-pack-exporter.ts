/**
 * Wave 85 — 플로터 출력용 레이어드 인쇄 SVG 익스포터 및 통합 IP 굿즈·이모티콘 릴리스 매니페스트 빌더.
 *
 * - `renderMerchProductionSvg`: 인쇄 RIP 및 커팅 플로터용 3대 표준 레이어(`Artwork_CMYK`,
 *   `Spot_White_Underbase`, `CutContour`)와 키링 타공·아크릴 스탠드 하단 탭·포토카드 라운드 재단선·
 *   홀로그램 박 마스크를 NaN 좌표 0건 보증 하에 출력한다.
 * - `buildIpMerchReleasePackManifest`: Rights BOM 상업 라이선스 검증 게이트와 인쇄·이모티콘
 *   프리플라이트 체크리스트를 통합해 출고 가능 여부를 판정한다.
 */

import {
  mmToPx, pointsToSvgPath, pxToMm,
  type DieCutContourResult, type WhiteUnderbasePlateResult,
} from "./alpha-matte-and-diecut-offset-solver";
import {
  MERCH_PRODUCT_TEMPLATES,
  type CmykPrintReadinessReport, type EmoticonLoopSynthesisResult,
  type MerchProductType, type PhotocardGeometrySpec, type StandeeTabGeometry,
} from "./merch-print-templates-and-cmyk-packer";

export type ProductionSvgLayerId = "Artwork_CMYK" | "Spot_White_Underbase" | "CutContour";
export type MerchLicenseVerificationStatus = "verified-commercial" | "editorial-only" | "unverified" | "revoked";

export interface MerchProductionSvgInput {
  readonly title: string; readonly productType: MerchProductType;
  readonly dpi?: number; readonly bleedMm?: number;
  readonly artworkWidthPx: number; readonly artworkHeightPx: number;
  readonly dieCutContour?: DieCutContourResult | null;
  readonly whiteUnderbase?: WhiteUnderbasePlateResult | null;
  readonly standeeTab?: StandeeTabGeometry | null;
  readonly photocardSpec?: PhotocardGeometrySpec | null;
  readonly cmykReport?: CmykPrintReadinessReport | null;
}

export interface MerchProductionSvgResult {
  readonly svg: string;
  readonly widthMm: number; readonly heightMm: number;
  readonly widthPx: number; readonly heightPx: number; readonly dpi: number;
  readonly layers: readonly ProductionSvgLayerId[];
  readonly hasFiniteCoordinatesOnly: boolean; readonly suggestedFilename: string;
}

export interface MerchRightsBomAsset {
  readonly assetId: string; readonly assetName: string;
  readonly assetKind: "character-art" | "font" | "brush-texture" | "holo-pattern" | "sfx-vector";
  readonly licenseStatus: MerchLicenseVerificationStatus;
  readonly licenseHolder: string; readonly commercialMerchAllowed: boolean;
  readonly attributionRequired?: boolean;
}

export interface MerchPreflightCheck {
  readonly id: string;
  readonly category: "rights-bom" | "print-geometry" | "color-ink" | "emoticon-loop";
  readonly labelKo: string; readonly passed: boolean;
  readonly severity: "blocker" | "warning"; readonly detailKo: string;
}

export interface IpMerchReleasePackInput {
  readonly ipTitle: string; readonly characterName: string; readonly skuCode: string;
  readonly productType: MerchProductType; readonly generatedAtIso?: string;
  readonly rightsBomAssets: readonly MerchRightsBomAsset[];
  readonly dieCutContour?: DieCutContourResult | null;
  readonly whiteUnderbase?: WhiteUnderbasePlateResult | null;
  readonly cmykReport?: CmykPrintReadinessReport | null;
  readonly productionSvg?: MerchProductionSvgResult | null;
  readonly emoticonLoop?: EmoticonLoopSynthesisResult | null;
}

export interface IpMerchReleasePackManifest {
  readonly schemaVersion: "toonstudio.wave85-ip-merch-release-pack.v1";
  readonly generatedAtIso: string; readonly ipTitle: string;
  readonly characterName: string; readonly skuCode: string;
  readonly productType: MerchProductType; readonly productLabelKo: string;
  readonly exportStatus: "ready-for-production" | "blocked-rights-bom" | "blocked-preflight";
  readonly commercialExportAllowed: boolean; readonly productionArtifactLocked: boolean;
  readonly rightsBomAudit: {
    readonly passed: boolean; readonly totalAssets: number; readonly verifiedCount: number;
    readonly blockedAssetIds: readonly string[]; readonly blockedReasonsKo: readonly string[];
  };
  readonly preflightChecks: readonly MerchPreflightCheck[];
  readonly blockingIssuesKo: readonly string[]; readonly warningsKo: readonly string[];
  readonly deliverables: {
    readonly svgFilename: string | null; readonly dieCutPointCount: number;
    readonly dieCutMinClearancePx: number | null; readonly whiteUnderbaseChokePx: number | null;
    readonly emoticonPlatform: string | null; readonly emoticonFrameCount: number | null;
  };
}

function round2(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`SVG 좌표에 유한하지 않은 값이 전달되었습니다: ${String(value)}`);
  return round2(value).toFixed(2);
}

function escapeXml(raw: string): string {
  return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function sanitizeSlug(raw: string): string {
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9가-힣_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "toonstudio-merch";
}

function shiftSvgPath(points: readonly { readonly x: number; readonly y: number }[], dx: number, dy: number): string {
  return pointsToSvgPath(points.map((p) => ({ x: p.x + dx, y: p.y + dy })), true);
}

/**
 * 플로터·RIP 인쇄소에 바로 납품 가능한 레이어드 SVG(`Artwork_CMYK`, `Spot_White_Underbase`, `CutContour`)를 생성한다.
 */
export function renderMerchProductionSvg(input: MerchProductionSvgInput): MerchProductionSvgResult {
  const tpl = MERCH_PRODUCT_TEMPLATES[input.productType];
  const dpi = Number.isFinite(input.dpi) && (input.dpi ?? 0) > 0 ? Math.round(input.dpi!) : tpl.dpi;
  const bleedMm = input.bleedMm ?? tpl.bleedMm;
  const bleedPx = round2(mmToPx(bleedMm, dpi));
  const hairline = Math.max(0.75, round2(mmToPx(0.25, dpi)));
  const safeTitle = escapeXml(input.title.trim() || tpl.labelKo);
  const tacLimit = input.cmykReport?.maxTotalInkLimitPercent ?? tpl.maxTotalInkLimitPercent;
  const layers: readonly ProductionSvgLayerId[] = ["Artwork_CMYK", "Spot_White_Underbase", "CutContour"];

  // 1) 포토카드 전용 레이아웃 (55×85mm + R3mm + 2mm 도련 + 선택적 홀로그램 박)
  if (input.productType === "collectible-photocard" && input.photocardSpec) {
    const pc = input.photocardSpec;
    const holo = pc.holoFoilRegionPathD
      ? `<g id="Spot_Holo_Foil" data-spot-color="Spot_Holo_Foil" data-cmyk="15,0,15,0"><path d="${pc.holoFoilRegionPathD}" fill="oklch(0.84 0.14 195 / 0.24)" stroke="oklch(0.76 0.17 195)" stroke-width="${fmt(hairline)}" stroke-dasharray="6 4" /></g>`
      : "";
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(pc.totalBleedWidthMm)}mm" height="${fmt(pc.totalBleedHeightMm)}mm" viewBox="0 0 ${fmt(pc.bleedWidthPx)} ${fmt(pc.bleedHeightPx)}" data-product-type="${input.productType}" data-dpi="${dpi}">`,
      `<title>${safeTitle} — ${escapeXml(tpl.labelKo)}</title>`,
      `<metadata>ToonStudio Wave85 | Product=${input.productType} | Trim=${pc.trimWidthMm}x${pc.trimHeightMm}mm | CornerR=${pc.cornerRadiusMm}mm | Bleed=${pc.bleedMm}mm | DPI=${dpi} | TAC=${tacLimit}%</metadata>`,
      `<g id="Bleed_Guide" data-bleed-mm="${fmt(pc.bleedMm)}"><path d="${pc.bleedRectPathD}" fill="none" stroke="oklch(0.72 0.11 235 / 0.65)" stroke-width="${fmt(hairline)}" stroke-dasharray="8 5" /></g>`,
      `<g id="Artwork_CMYK" data-color-space="CMYK" data-tac-limit="${tacLimit}%" data-double-sided="${String(pc.includeBackSide)}"><path d="${pc.trimRoundedPathD}" fill="oklch(0.68 0.12 240 / 0.20)" stroke="oklch(0.78 0.10 240 / 0.8)" stroke-width="${fmt(hairline)}" />${holo}</g>`,
      `<g id="Spot_White_Underbase" data-spot-color="Spot_White" data-required="false" data-white-choke-px="0"></g>`,
      `<g id="CutContour" data-spot-color="CutContour" data-cmyk="0,100,0,0"><path id="Photocard_Trim_Rounded" data-width-mm="${fmt(pc.trimWidthMm)}" data-height-mm="${fmt(pc.trimHeightMm)}" data-corner-radius-mm="${fmt(pc.cornerRadiusMm)}" d="${pc.trimRoundedPathD}" fill="none" stroke="oklch(0.62 0.27 332)" stroke-width="${fmt(hairline)}" stroke-linejoin="round" /></g>`,
      `</svg>`,
    ].join("");
    return {
      svg, widthMm: pc.totalBleedWidthMm, heightMm: pc.totalBleedHeightMm,
      widthPx: pc.bleedWidthPx, heightPx: pc.bleedHeightPx, dpi, layers,
      hasFiniteCoordinatesOnly: !/(?:NaN|Infinity|undefined)/.test(svg),
      suggestedFilename: `${sanitizeSlug(input.title)}-${input.productType}-${dpi}dpi.svg`,
    };
  }

  // 2) 칼선 기반 굿즈(스티커·아크릴 키링·아크릴 스탠드) 레이아웃
  let minX = 0; let minY = 0;
  let maxX = Math.max(1, input.artworkWidthPx); let maxY = Math.max(1, input.artworkHeightPx);
  if (input.dieCutContour) {
    minX = Math.min(minX, input.dieCutContour.boundsPx.minX);
    minY = Math.min(minY, input.dieCutContour.boundsPx.minY);
    maxX = Math.max(maxX, input.dieCutContour.boundsPx.maxX);
    maxY = Math.max(maxY, input.dieCutContour.boundsPx.maxY);
    if (input.dieCutContour.keyringHole) {
      const kh = input.dieCutContour.keyringHole;
      minX = Math.min(minX, kh.cxPx - kh.outerLugRadiusPx); minY = Math.min(minY, kh.cyPx - kh.outerLugRadiusPx);
      maxX = Math.max(maxX, kh.cxPx + kh.outerLugRadiusPx); maxY = Math.max(maxY, kh.cyPx + kh.outerLugRadiusPx);
    }
  }
  if (input.standeeTab) {
    minX = Math.min(minX, input.standeeTab.xPx);
    maxX = Math.max(maxX, input.standeeTab.xPx + input.standeeTab.widthPx);
    maxY = Math.max(maxY, input.standeeTab.yPx + input.standeeTab.heightPx);
  }

  const sx = round2(bleedPx - minX); const sy = round2(bleedPx - minY);
  const widthPx = round2(maxX - minX + bleedPx * 2); const heightPx = round2(maxY - minY + bleedPx * 2);
  const widthMm = round2(pxToMm(widthPx, dpi)); const heightMm = round2(pxToMm(heightPx, dpi));

  const artBox = `<rect id="Artwork_Bounds" x="${fmt(sx)}" y="${fmt(sy)}" width="${fmt(input.artworkWidthPx)}" height="${fmt(input.artworkHeightPx)}" fill="oklch(0.68 0.12 240 / 0.18)" stroke="oklch(0.78 0.10 240 / 0.72)" stroke-width="${fmt(hairline)}" />`;
  const whitePaths = (input.whiteUnderbase?.contours ?? [])
    .map((loop, idx) => `<path id="Spot_White_Region_${idx + 1}" d="${shiftSvgPath(loop, sx, sy)}" fill="oklch(0.97 0.005 85 / 0.85)" stroke="none" />`)
    .join("");
  const cutPath = input.dieCutContour
    ? `<path id="Primary_CutContour_Path" data-offset-mm="${fmt(input.dieCutContour.offsetMm)}" d="${shiftSvgPath(input.dieCutContour.points, sx, sy)}" fill="none" stroke="oklch(0.62 0.27 332)" stroke-width="${fmt(hairline)}" stroke-linejoin="round" />`
    : `<rect id="Fallback_CutContour_Box" x="${fmt(sx)}" y="${fmt(sy)}" width="${fmt(input.artworkWidthPx)}" height="${fmt(input.artworkHeightPx)}" fill="none" stroke="oklch(0.62 0.27 332)" stroke-width="${fmt(hairline)}" />`;
  const kh = input.dieCutContour?.keyringHole;
  const keyringMarkup = kh
    ? `<circle id="Keyring_Outer_Lug" cx="${fmt(kh.cxPx + sx)}" cy="${fmt(kh.cyPx + sy)}" r="${fmt(kh.outerLugRadiusPx)}" fill="none" stroke="oklch(0.62 0.27 332)" stroke-width="${fmt(hairline)}" /><circle id="Keyring_Hole_Cut" data-diameter-mm="${fmt(kh.diameterMm)}" data-wall-thickness-mm="${fmt(kh.wallThicknessMm)}" cx="${fmt(kh.cxPx + sx)}" cy="${fmt(kh.cyPx + sy)}" r="${fmt(kh.radiusPx)}" fill="none" stroke="oklch(0.62 0.27 332)" stroke-width="${fmt(hairline)}" />`
    : "";
  const st = input.standeeTab;
  const standeeMarkup = st
    ? `<rect id="Standee_Bottom_Tab" data-tab-width-mm="${fmt(st.widthMm)}" data-tab-height-mm="${fmt(st.heightMm)}" data-slot-tolerance-mm="${fmt(st.slotToleranceMm)}" x="${fmt(st.xPx + sx)}" y="${fmt(st.yPx + sy)}" width="${fmt(st.widthPx)}" height="${fmt(st.heightPx)}" rx="${fmt(Math.min(2, st.heightPx * 0.2))}" fill="none" stroke="oklch(0.62 0.27 332)" stroke-width="${fmt(hairline)}" />`
    : "";
  const bleedMarkup = bleedMm > 0
    ? `<g id="Bleed_Guide" data-bleed-mm="${fmt(bleedMm)}"><rect x="${fmt(hairline * 0.5)}" y="${fmt(hairline * 0.5)}" width="${fmt(Math.max(1, widthPx - hairline))}" height="${fmt(Math.max(1, heightPx - hairline))}" fill="none" stroke="oklch(0.72 0.11 235 / 0.6)" stroke-width="${fmt(hairline)}" stroke-dasharray="8 5" /></g>`
    : "";

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(widthMm)}mm" height="${fmt(heightMm)}mm" viewBox="0 0 ${fmt(widthPx)} ${fmt(heightPx)}" data-product-type="${input.productType}" data-dpi="${dpi}">`,
    `<title>${safeTitle} — ${escapeXml(tpl.labelKo)}</title>`,
    `<metadata>ToonStudio Wave85 | Product=${input.productType} | DPI=${dpi} | Bleed=${fmt(bleedMm)}mm | TAC=${tacLimit}%</metadata>`,
    bleedMarkup,
    `<g id="Artwork_CMYK" data-color-space="CMYK" data-tac-limit="${tacLimit}%">${artBox}</g>`,
    `<g id="Spot_White_Underbase" data-spot-color="Spot_White" data-white-choke-px="${fmt(input.whiteUnderbase?.chokePx ?? 0)}" data-density-percent="${input.whiteUnderbase?.whiteInkDensityPercent ?? 0}">${whitePaths}</g>`,
    `<g id="CutContour" data-spot-color="CutContour" data-cmyk="0,100,0,0">${cutPath}${keyringMarkup}${standeeMarkup}</g>`,
    `</svg>`,
  ].join("");

  return {
    svg, widthMm, heightMm, widthPx, heightPx, dpi, layers,
    hasFiniteCoordinatesOnly: !/(?:NaN|Infinity|undefined)/.test(svg),
    suggestedFilename: `${sanitizeSlug(input.title)}-${input.productType}-${dpi}dpi.svg`,
  };
}

/**
 * 상업 IP 굿즈·이모티콘 출고 직전 Rights BOM 라이선스 검증 및 인쇄·루프 프리플라이트를 수행해
 * 통합 릴리스 매니페스트를 발급한다. 미검증 에셋이 하나라도 포함되면 상업 출고를 차단한다.
 */
export function buildIpMerchReleasePackManifest(input: IpMerchReleasePackInput): IpMerchReleasePackManifest {
  const tpl = MERCH_PRODUCT_TEMPLATES[input.productType];
  const generatedAtIso = input.generatedAtIso ?? new Date().toISOString();
  const blockedAssetIds: string[] = [];
  const blockedReasonsKo: string[] = [];
  let verifiedCount = 0;

  if (input.rightsBomAssets.length === 0) {
    blockedReasonsKo.push("권리 BOM(Rights BOM)에 등록된 에셋이 없어 상업 굿즈 출고를 진행할 수 없습니다.");
  } else {
    for (const asset of input.rightsBomAssets) {
      if (asset.licenseStatus === "verified-commercial" && asset.commercialMerchAllowed) {
        verifiedCount += 1;
      } else {
        blockedAssetIds.push(asset.assetId);
        blockedReasonsKo.push(`[${asset.assetName}(${asset.assetId})] 상태가 '${asset.licenseStatus}'이거나 상업 굿즈 권한이 미승인입니다.`);
      }
    }
  }
  const rightsPassed = input.rightsBomAssets.length > 0 && blockedAssetIds.length === 0;

  const checks: MerchPreflightCheck[] = [{
    id: "rights-bom-commercial-clear", category: "rights-bom", severity: "blocker",
    labelKo: "Rights BOM 상업 굿즈 라이선스 검증", passed: rightsPassed,
    detailKo: rightsPassed ? `총 ${verifiedCount}건 에셋 상업 라이선스 검증 완료` : blockedReasonsKo.join(" / "),
  }];

  if (input.productType !== "messenger-emoticon-pack") {
    const dpi = input.productionSvg?.dpi ?? input.dieCutContour?.dpi ?? tpl.dpi;
    checks.push({
      id: "print-dpi-300", category: "print-geometry", severity: "blocker",
      labelKo: "인쇄 해상도 300 DPI 이상 준수", passed: dpi >= 300, detailKo: `현재 ${dpi} DPI`,
    });
    if (input.dieCutContour) {
      const dc = input.dieCutContour;
      checks.push({
        id: "diecut-clearance-safe", category: "print-geometry", severity: "blocker",
        labelKo: "칼선 닫힘·비자기교차·아트워크 최소 이격거리 검증",
        passed: dc.closed && !dc.selfIntersecting && dc.clearanceSafe && dc.points.length >= 12,
        detailKo: `정점 ${dc.points.length}개 · 최소 이격 ${dc.minClearanceToArtworkPx}px (목표 ${dc.offsetPx}px)`,
      });
    }
    if (tpl.requiresWhiteUnderbase || input.whiteUnderbase) {
      const wu = input.whiteUnderbase;
      const wuOk = wu != null && wu.leakedOutsideArtworkPixels === 0 && wu.underbasePixelCount > 0 && wu.chokePx >= 1;
      checks.push({
        id: "white-underbase-no-leak", category: "color-ink", severity: "blocker",
        labelKo: "화이트 잉크 언더베이스 초크 및 외곽 누출 0px 검증", passed: wuOk,
        detailKo: wu
          ? `초크 ${wu.chokePx}px · 누출 ${wu.leakedOutsideArtworkPixels}px · 화이트 면적비 ${Math.round(wu.coverageRatio * 100)}%`
          : "필수 화이트 백킹 판이 생성되지 않았습니다.",
      });
    }
    if (input.cmykReport) {
      checks.push({
        id: "cmyk-tac-limit", category: "color-ink", severity: "blocker",
        labelKo: `CMYK 총잉크량(TAC) ${input.cmykReport.maxTotalInkLimitPercent}% 이하 검증`,
        passed: input.cmykReport.passed, detailKo: `최대 보정 총잉크량 ${input.cmykReport.peakClampedTacPercent}%`,
      });
    }
    if (input.productionSvg) {
      const s = input.productionSvg;
      const svgOk = s.hasFiniteCoordinatesOnly && s.svg.includes('id="Artwork_CMYK"') &&
        s.svg.includes('id="Spot_White_Underbase"') && s.svg.includes('id="CutContour"');
      checks.push({
        id: "svg-finite-layers", category: "print-geometry", severity: "blocker",
        labelKo: "플로터 SVG 3대 레이어 및 유한 좌표(NaN 0건) 검증", passed: svgOk,
        detailKo: svgOk ? `${s.widthMm}×${s.heightMm}mm · 레이어 3종 확인` : "필수 SVG 레이어 누락 또는 비정상 좌표 감지",
      });
    }
  }

  if (input.emoticonLoop) {
    const loop = input.emoticonLoop;
    const loopOk = loop.closureAudit.isC1Closed && loop.platformCompliance.passed;
    checks.push({
      id: "emoticon-loop-c1-and-spec", category: "emoticon-loop", severity: "blocker",
      labelKo: `${loop.platformLabelKo} 24fps C1 루프 닫힘 및 플랫폼 규격 검증`, passed: loopOk,
      detailKo: loopOk
        ? `${loop.widthPx}×${loop.heightPx}px · ${loop.fps}fps · ${loop.frameCount}프레임 · 예상 ${loop.platformCompliance.estimatedFileSizeKb}KB`
        : loop.platformCompliance.violationsKo.join(" / ") || "루프 연속성 검증 실패",
    });
  }

  const blockingIssuesKo = checks.filter((c) => !c.passed && c.severity === "blocker").map((c) => `${c.labelKo}: ${c.detailKo}`);
  const warningsKo: string[] = [
    ...(input.cmykReport?.warningsKo ?? []),
    ...(input.whiteUnderbase?.thinAreaWarning ? ["얇은 선화 영역이 많아 초크 화이트 백킹 면적비가 35% 미만입니다."] : []),
  ];
  const exportStatus: IpMerchReleasePackManifest["exportStatus"] =
    !rightsPassed ? "blocked-rights-bom" : blockingIssuesKo.length > 0 ? "blocked-preflight" : "ready-for-production";
  const commercialExportAllowed = exportStatus === "ready-for-production";

  return {
    schemaVersion: "toonstudio.wave85-ip-merch-release-pack.v1", generatedAtIso,
    ipTitle: input.ipTitle, characterName: input.characterName, skuCode: input.skuCode,
    productType: input.productType, productLabelKo: tpl.labelKo,
    exportStatus, commercialExportAllowed, productionArtifactLocked: !commercialExportAllowed,
    rightsBomAudit: { passed: rightsPassed, totalAssets: input.rightsBomAssets.length, verifiedCount, blockedAssetIds, blockedReasonsKo },
    preflightChecks: checks, blockingIssuesKo, warningsKo,
    deliverables: {
      svgFilename: commercialExportAllowed ? (input.productionSvg?.suggestedFilename ?? null) : null,
      dieCutPointCount: input.dieCutContour?.points.length ?? 0,
      dieCutMinClearancePx: input.dieCutContour?.minClearanceToArtworkPx ?? null,
      whiteUnderbaseChokePx: input.whiteUnderbase?.chokePx ?? null,
      emoticonPlatform: input.emoticonLoop?.platform ?? null,
      emoticonFrameCount: input.emoticonLoop?.frameCount ?? null,
    },
  };
}
