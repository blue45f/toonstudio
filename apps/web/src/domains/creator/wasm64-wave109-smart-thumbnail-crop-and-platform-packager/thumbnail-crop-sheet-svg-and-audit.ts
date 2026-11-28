/**
 * Wave 109 — 인쇄 안전 고대비 OKLCH 스마트 썸네일 크롭 시트 SVG 및 한국어 출고 QA 보고서.
 *
 * - raw hex / rgb() 리터럴 없이 순수 OKLCH 색상 토큰만 사용한다.
 * - 마스터 원본 캔버스 위에 6종 플랫폼별 크롭 프레임·주연 눈높이 조준선·UI 배지 회피 구역을 시각화하고,
 *   우측/하단에 프리셋별 검토 카드를 나란히 배치한다.
 */

import type { PlatformThumbnailPackageReport } from "./anti-ringing-lanczos3-resampler";
import type {
  PlatformThumbnailPresetId,
  SmartThumbnailSourceSpec,
} from "./smart-thumbnail-crop-solver";

export interface SmartThumbnailSheetSvgResult {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  readonly containsNaN: boolean;
  readonly renderedPresetCount: number;
  readonly hasPrimaryEyeCrosshair: boolean;
}

const SHEET_PALETTE = {
  paper: "oklch(0.985 0.006 90)",
  linen: "oklch(0.955 0.011 88)",
  card: "oklch(0.996 0.003 90)",
  canvasBg: "oklch(0.935 0.012 88)",
  border: "oklch(0.81 0.016 86)",
  ink: "oklch(0.20 0.015 250)",
  muted: "oklch(0.43 0.016 250)",
  guide: "oklch(0.68 0.015 250)",
  forestFill: "oklch(0.93 0.032 155)",
  forestStroke: "oklch(0.36 0.088 155)",
  forestText: "oklch(0.26 0.075 155)",
  warnFill: "oklch(0.94 0.048 75)",
  warnStroke: "oklch(0.55 0.14 68)",
  warnText: "oklch(0.38 0.12 65)",
  dangerFill: "oklch(0.94 0.042 25)",
  dangerStroke: "oklch(0.49 0.17 25)",
  dangerText: "oklch(0.37 0.16 25)",
  badgeFill: "oklch(0.88 0.055 28 / 0.42)",
  badgeStroke: "oklch(0.48 0.16 26)",
  eyeCrosshair: "oklch(0.46 0.19 25)",
  faceStroke: "oklch(0.36 0.11 155)",
} as const;

const PRESET_STROKE_COLORS: Readonly<Record<PlatformThumbnailPresetId, string>> = {
  "naver-episode-thumb": "oklch(0.46 0.14 152)",
  "naver-series-square": "oklch(0.47 0.15 248)",
  "kakao-vertical-poster": "oklch(0.54 0.15 72)",
  "global-webtoon-banner": "oklch(0.48 0.16 305)",
  "og-social-card": "oklch(0.46 0.13 196)",
  "hero-widescreen": "oklch(0.49 0.17 28)",
};

function sanitizeSvgNum(value: number, fallback = 0): string {
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

/**
 * 마스터 캔버스 크롭 프레임·주연 시선 조준선·UI 배지 회피 구역·프리셋 카드를 담은
 * 인쇄 안전 고대비 OKLCH 검수 시트 SVG를 생성한다.
 */
export function renderSmartThumbnailSheetSvg(
  packageReport: PlatformThumbnailPackageReport,
  sourceSpec?: SmartThumbnailSourceSpec,
): SmartThumbnailSheetSvgResult {
  const width = 1120;
  const height = 760;
  const ready = packageReport.readyForPublish;
  const statusFill = ready ? SHEET_PALETTE.forestFill : SHEET_PALETTE.dangerFill;
  const statusStroke = ready ? SHEET_PALETTE.forestStroke : SHEET_PALETTE.dangerStroke;
  const statusText = ready ? SHEET_PALETTE.forestText : SHEET_PALETTE.dangerText;
  const statusLabel = ready ? "PUBLISH READY" : "REVIEW REQUIRED";

  // 마스터 캔버스 투영 영역(좌측 패널)
  const stageBoxX = 48;
  const stageBoxY = 148;
  const stageBoxW = 460;
  const stageBoxH = 446;

  const srcW = Math.max(1, packageReport.sourceWidthPx);
  const srcH = Math.max(1, packageReport.sourceHeightPx);
  const fitScale = Math.min((stageBoxW - 36) / srcW, (stageBoxH - 54) / srcH);
  const drawW = srcW * fitScale;
  const drawH = srcH * fitScale;
  const drawX = stageBoxX + (stageBoxW - drawW) * 0.5;
  const drawY = stageBoxY + 38 + (stageBoxH - 46 - drawH) * 0.5;

  const mapX = (sx: number): number => drawX + sx * fitScale;
  const mapY = (sy: number): number => drawY + sy * fitScale;

  const masterParts: string[] = [
    `<rect x="${sanitizeSvgNum(drawX)}" y="${sanitizeSvgNum(drawY)}" width="${sanitizeSvgNum(drawW)}" height="${sanitizeSvgNum(drawH)}" fill="${SHEET_PALETTE.canvasBg}" stroke="${SHEET_PALETTE.border}" stroke-width="1.5"/>`,
  ];

  // 원본 로고·피사체 얼굴 박스(옵션으로 sourceSpec 전달 시 오버레이)
  let hasPrimaryEyeCrosshair = false;
  if (sourceSpec) {
    if (sourceSpec.logoBox) {
      const lb = sourceSpec.logoBox;
      masterParts.push(
        `<rect x="${sanitizeSvgNum(mapX(lb.x))}" y="${sanitizeSvgNum(mapY(lb.y))}" width="${sanitizeSvgNum(lb.width * fitScale)}" height="${sanitizeSvgNum(lb.height * fitScale)}" fill="none" stroke="${SHEET_PALETTE.muted}" stroke-width="1" stroke-dasharray="4 3"/>`,
      );
    }
    for (let i = 0; i < sourceSpec.subjects.length; i += 1) {
      const sub = sourceSpec.subjects[i];
      const isPrimary = sub.subjectId === packageReport.cropSolution.primarySubjectId;
      const fb = sub.faceBox;
      masterParts.push(
        `<rect data-subject-face="${escapeXml(sub.subjectId)}" x="${sanitizeSvgNum(mapX(fb.x))}" y="${sanitizeSvgNum(mapY(fb.y))}" width="${sanitizeSvgNum(fb.width * fitScale)}" height="${sanitizeSvgNum(fb.height * fitScale)}" rx="3" fill="${SHEET_PALETTE.forestFill}" fill-opacity="0.35" stroke="${SHEET_PALETTE.faceStroke}" stroke-width="${isPrimary ? "2" : "1.2"}"/>`,
      );
      if (isPrimary) {
        hasPrimaryEyeCrosshair = true;
        const ex = mapX(sub.eyeLinePoint.x);
        const ey = mapY(sub.eyeLinePoint.y);
        masterParts.push(
          `<g data-primary-eye-crosshair="master">`,
          `  <line x1="${sanitizeSvgNum(ex - 10)}" y1="${sanitizeSvgNum(ey)}" x2="${sanitizeSvgNum(ex + 10)}" y2="${sanitizeSvgNum(ey)}" stroke="${SHEET_PALETTE.eyeCrosshair}" stroke-width="1.8"/>`,
          `  <line x1="${sanitizeSvgNum(ex)}" y1="${sanitizeSvgNum(ey - 10)}" x2="${sanitizeSvgNum(ex)}" y2="${sanitizeSvgNum(ey + 10)}" stroke="${SHEET_PALETTE.eyeCrosshair}" stroke-width="1.8"/>`,
          `  <circle cx="${sanitizeSvgNum(ex)}" cy="${sanitizeSvgNum(ey)}" r="4.5" fill="none" stroke="${SHEET_PALETTE.eyeCrosshair}" stroke-width="1.5"/>`,
          `</g>`,
        );
      }
    }
  }

  // 마스터 캔버스 위에 각 프리셋 크롭 프레임 투영
  const crops = packageReport.cropSolution.crops;
  for (let i = 0; i < crops.length; i += 1) {
    const c = crops[i];
    const stroke = PRESET_STROKE_COLORS[c.presetId];
    const cx = mapX(c.cropWindow.x);
    const cy = mapY(c.cropWindow.y);
    const cw = c.cropWindow.width * fitScale;
    const ch = c.cropWindow.height * fitScale;
    masterParts.push(
      `<g data-master-crop="${escapeXml(c.presetId)}">`,
      `  <rect x="${sanitizeSvgNum(cx)}" y="${sanitizeSvgNum(cy)}" width="${sanitizeSvgNum(cw)}" height="${sanitizeSvgNum(ch)}" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-dasharray="${i % 2 === 0 ? "none" : "6 3"}"/>`,
      `  <text x="${sanitizeSvgNum(cx + 4)}" y="${sanitizeSvgNum(cy + 12)}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="9.5" font-weight="700" fill="${stroke}">${escapeXml(c.presetId)}</text>`,
      `</g>`,
    );
    if (!hasPrimaryEyeCrosshair && c.primaryEyeNorm) {
      hasPrimaryEyeCrosshair = true;
      const ex = mapX(c.cropWindow.x + c.primaryEyeNorm.x * c.cropWindow.width);
      const ey = mapY(c.cropWindow.y + c.primaryEyeNorm.y * c.cropWindow.height);
      masterParts.push(
        `<g data-primary-eye-crosshair="derived">`,
        `  <line x1="${sanitizeSvgNum(ex - 9)}" y1="${sanitizeSvgNum(ey)}" x2="${sanitizeSvgNum(ex + 9)}" y2="${sanitizeSvgNum(ey)}" stroke="${SHEET_PALETTE.eyeCrosshair}" stroke-width="1.8"/>`,
        `  <line x1="${sanitizeSvgNum(ex)}" y1="${sanitizeSvgNum(ey - 9)}" x2="${sanitizeSvgNum(ex)}" y2="${sanitizeSvgNum(ey + 9)}" stroke="${SHEET_PALETTE.eyeCrosshair}" stroke-width="1.8"/>`,
        `</g>`,
      );
    }
  }

  // 우측 2×3 프리셋 카드 그리드
  const cardParts: string[] = [];
  const gridStartX = 530;
  const gridStartY = 148;
  const cardW = 266;
  const cardH = 140;
  const gapX = 14;
  const gapY = 13;

  const displayItems = packageReport.deliverables.slice(0, 6);
  for (let i = 0; i < displayItems.length; i += 1) {
    const item = displayItems[i];
    const c = item.crop;
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = gridStartX + col * (cardW + gapX);
    const y = gridStartY + row * (cardH + gapY);
    const stroke = PRESET_STROKE_COLORS[c.presetId];

    const previewAreaX = x + 12;
    const previewAreaY = y + 36;
    const previewMaxW = 104;
    const previewMaxH = 88;
    const pScale = Math.min(previewMaxW / c.preset.targetWidthPx, previewMaxH / c.preset.targetHeightPx);
    const pw = c.preset.targetWidthPx * pScale;
    const ph = c.preset.targetHeightPx * pScale;
    const px = previewAreaX + (previewMaxW - pw) * 0.5;
    const py = previewAreaY + (previewMaxH - ph) * 0.5;

    const badgeOverlays: string[] = [];
    for (let bi = 0; bi < c.preset.uiBadgeZones.length; bi += 1) {
      const z = c.preset.uiBadgeZones[bi];
      const bx = px + z.normRect.x * pw;
      const by = py + z.normRect.y * ph;
      const bw = z.normRect.width * pw;
      const bh = z.normRect.height * ph;
      badgeOverlays.push(
        `  <rect data-ui-badge-zone="${escapeXml(z.zoneId)}" x="${sanitizeSvgNum(bx)}" y="${sanitizeSvgNum(by)}" width="${sanitizeSvgNum(bw)}" height="${sanitizeSvgNum(bh)}" fill="${SHEET_PALETTE.badgeFill}" stroke="${SHEET_PALETTE.badgeStroke}" stroke-width="1"/>`,
      );
    }

    const eyeMarkup: string[] = [];
    if (c.primaryEyeNorm) {
      const ex = px + c.primaryEyeNorm.x * pw;
      const ey = py + c.primaryEyeNorm.y * ph;
      eyeMarkup.push(
        `  <line x1="${sanitizeSvgNum(ex - 5)}" y1="${sanitizeSvgNum(ey)}" x2="${sanitizeSvgNum(ex + 5)}" y2="${sanitizeSvgNum(ey)}" stroke="${SHEET_PALETTE.eyeCrosshair}" stroke-width="1.5"/>`,
        `  <line x1="${sanitizeSvgNum(ex)}" y1="${sanitizeSvgNum(ey - 5)}" x2="${sanitizeSvgNum(ex)}" y2="${sanitizeSvgNum(ey + 5)}" stroke="${SHEET_PALETTE.eyeCrosshair}" stroke-width="1.5"/>`,
      );
    }

    const cardOk = c.primaryFaceFullyContained && !c.primaryEyeOccludedByUiBadge && !c.lowResolutionWarning;
    const pillFill = !c.primaryFaceFullyContained || c.primaryEyeOccludedByUiBadge
      ? SHEET_PALETTE.dangerFill
      : c.lowResolutionWarning
        ? SHEET_PALETTE.warnFill
        : SHEET_PALETTE.forestFill;
    const pillText = !c.primaryFaceFullyContained || c.primaryEyeOccludedByUiBadge
      ? SHEET_PALETTE.dangerText
      : c.lowResolutionWarning
        ? SHEET_PALETTE.warnText
        : SHEET_PALETTE.forestText;
    const pillLabel = cardOk ? "PASS" : c.lowResolutionWarning ? "LOW-RES" : "CHECK";

    const infoX = x + 126;
    const eyeCoordText = c.primaryEyeNorm
      ? `시선 (${sanitizeSvgNum(c.primaryEyeNorm.x * 100)}%, ${sanitizeSvgNum(c.primaryEyeNorm.y * 100)}%)`
      : "시선 기준 없음";

    cardParts.push(
      `<g data-preset-card="${escapeXml(c.presetId)}">`,
      `  <rect x="${sanitizeSvgNum(x)}" y="${sanitizeSvgNum(y)}" width="${sanitizeSvgNum(cardW)}" height="${sanitizeSvgNum(cardH)}" rx="10" fill="${SHEET_PALETTE.card}" stroke="${SHEET_PALETTE.border}" stroke-width="1"/>`,
      `  <rect x="${sanitizeSvgNum(x)}" y="${sanitizeSvgNum(y)}" width="5" height="${sanitizeSvgNum(cardH)}" rx="2.5" fill="${stroke}"/>`,
      `  <text x="${sanitizeSvgNum(x + 14)}" y="${sanitizeSvgNum(y + 22)}" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="${SHEET_PALETTE.ink}">${escapeXml(truncateText(`${c.preset.platformNameKo} · ${c.preset.deliveryNameKo}`, 20))}</text>`,
      `  <rect x="${sanitizeSvgNum(x + cardW - 64)}" y="${sanitizeSvgNum(y + 9)}" width="54" height="18" rx="9" fill="${pillFill}"/>`,
      `  <text x="${sanitizeSvgNum(x + cardW - 37)}" y="${sanitizeSvgNum(y + 21.5)}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="9.5" font-weight="700" fill="${pillText}">${pillLabel}</text>`,
      `  <rect x="${sanitizeSvgNum(px)}" y="${sanitizeSvgNum(py)}" width="${sanitizeSvgNum(pw)}" height="${sanitizeSvgNum(ph)}" fill="${SHEET_PALETTE.canvasBg}" stroke="${stroke}" stroke-width="1.5"/>`,
      `  <line x1="${sanitizeSvgNum(px + pw / 3)}" y1="${sanitizeSvgNum(py)}" x2="${sanitizeSvgNum(px + pw / 3)}" y2="${sanitizeSvgNum(py + ph)}" stroke="${SHEET_PALETTE.guide}" stroke-width="0.6" stroke-dasharray="2 2"/>`,
      `  <line x1="${sanitizeSvgNum(px + (2 * pw) / 3)}" y1="${sanitizeSvgNum(py)}" x2="${sanitizeSvgNum(px + (2 * pw) / 3)}" y2="${sanitizeSvgNum(py + ph)}" stroke="${SHEET_PALETTE.guide}" stroke-width="0.6" stroke-dasharray="2 2"/>`,
      `  <line x1="${sanitizeSvgNum(px)}" y1="${sanitizeSvgNum(py + ph / 3)}" x2="${sanitizeSvgNum(px + pw)}" y2="${sanitizeSvgNum(py + ph / 3)}" stroke="${SHEET_PALETTE.guide}" stroke-width="0.6" stroke-dasharray="2 2"/>`,
      ...badgeOverlays,
      ...eyeMarkup,
      `  <text x="${sanitizeSvgNum(infoX)}" y="${sanitizeSvgNum(y + 52)}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" font-weight="700" fill="${SHEET_PALETTE.ink}">${sanitizeSvgNum(c.preset.targetWidthPx)}×${sanitizeSvgNum(c.preset.targetHeightPx)} px</text>`,
      `  <text x="${sanitizeSvgNum(infoX)}" y="${sanitizeSvgNum(y + 70)}" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="${SHEET_PALETTE.muted}">${escapeXml(eyeCoordText)}</text>`,
      `  <text x="${sanitizeSvgNum(infoX)}" y="${sanitizeSvgNum(y + 88)}" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="${SHEET_PALETTE.muted}">얼굴 보존 ${sanitizeSvgNum(c.primaryFaceContainedRatio * 100)}% · 배지 ${c.primaryEyeOccludedByUiBadge ? "가림" : "회피"}</text>`,
      `  <text x="${sanitizeSvgNum(infoX)}" y="${sanitizeSvgNum(y + 106)}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="10" fill="${c.lowResolutionWarning ? SHEET_PALETTE.warnText : SHEET_PALETTE.muted}">UPSCALE ${sanitizeSvgNum(c.upscaleRatio)}x · ERR ${sanitizeSvgNum(c.aspectRatioRelativeError * 100)}%</text>`,
      `</g>`,
    );
  }

  const audit = packageReport.resamplerAudit;
  const resamplerSummaryLine =
    audit.resampledPresetCount > 0
      ? `Lanczos-3 안티링잉 ${audit.antiRingingEnabled ? "ON" : "OFF"} · 오버슈트 ${sanitizeSvgNum(audit.totalRingingOvershootCount)}px · 선명도 ${sanitizeSvgNum(audit.averageLanczosAcutance)} (Bilinear 대비 ${sanitizeSvgNum(audit.sharpnessGainRatio)}x)`
      : `크롭 규격 ${sanitizeSvgNum(crops.length)}종 계산 완료 · 최대 종횡비 오차 ${sanitizeSvgNum(packageReport.cropSolution.maxAspectRatioRelativeError * 100)}%`;

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sanitizeSvgNum(width)} ${sanitizeSvgNum(height)}" width="${sanitizeSvgNum(width)}" height="${sanitizeSvgNum(height)}" role="img" aria-label="${escapeXml(`ToonStudio 스마트 썸네일 크롭 시트 — ${packageReport.titleKo}`)}">`,
    `  <rect x="0" y="0" width="${sanitizeSvgNum(width)}" height="${sanitizeSvgNum(height)}" fill="${SHEET_PALETTE.paper}"/>`,
    `  <rect x="20" y="20" width="${sanitizeSvgNum(width - 40)}" height="${sanitizeSvgNum(height - 40)}" rx="16" fill="${SHEET_PALETTE.linen}" stroke="${SHEET_PALETTE.border}" stroke-width="1.5"/>`,
    `  <rect x="34" y="34" width="${sanitizeSvgNum(width - 68)}" height="${sanitizeSvgNum(height - 68)}" rx="12" fill="${SHEET_PALETTE.card}" stroke="${SHEET_PALETTE.border}" stroke-width="1"/>`,
    `  <text x="52" y="68" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11.5" font-weight="700" letter-spacing="1.2" fill="${SHEET_PALETTE.muted}">TOONSTUDIO WAVE 109 · SMART THUMBNAIL CROP &amp; ANTI-RINGING LANCZOS-3 PACKAGER</text>`,
    `  <text x="52" y="100" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="${SHEET_PALETTE.ink}">${escapeXml(truncateText(packageReport.titleKo, 38))} — 플랫폼별 눈높이 크롭 검수 시트</text>`,
    `  <text x="52" y="124" font-family="system-ui, -apple-system, sans-serif" font-size="12.5" fill="${SHEET_PALETTE.muted}">작품 ID: ${escapeXml(truncateText(packageReport.artworkId, 36))} · 원본 ${sanitizeSvgNum(packageReport.sourceWidthPx)}×${sanitizeSvgNum(packageReport.sourceHeightPx)}px · 프리셋 ${sanitizeSvgNum(crops.length)}종</text>`,
    `  <rect x="854" y="54" width="212" height="36" rx="18" fill="${statusFill}" stroke="${statusStroke}" stroke-width="1.5"/>`,
    `  <text x="960" y="77" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" font-weight="700" fill="${statusText}">${statusLabel}</text>`,
    `  <rect x="${sanitizeSvgNum(stageBoxX)}" y="${sanitizeSvgNum(stageBoxY)}" width="${sanitizeSvgNum(stageBoxW)}" height="${sanitizeSvgNum(stageBoxH)}" rx="10" fill="${SHEET_PALETTE.linen}" stroke="${SHEET_PALETTE.border}" stroke-width="1"/>`,
    `  <text x="${sanitizeSvgNum(stageBoxX + 16)}" y="${sanitizeSvgNum(stageBoxY + 24)}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" font-weight="700" fill="${SHEET_PALETTE.muted}">MASTER SOURCE CANVAS &amp; ASPECT OVERLAYS</text>`,
    ...masterParts.map((line) => `  ${line}`),
    ...cardParts.map((line) => `  ${line}`),
    `  <rect x="48" y="616" width="1024" height="86" rx="10" fill="${SHEET_PALETTE.linen}" stroke="${SHEET_PALETTE.border}" stroke-width="1"/>`,
    `  <text x="66" y="642" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" font-weight="700" fill="${SHEET_PALETTE.muted}">MANIFEST SHA-256: ${escapeXml(packageReport.manifestSha256Hex)}</text>`,
    `  <text x="66" y="666" font-family="system-ui, -apple-system, sans-serif" font-size="12.5" font-weight="700" fill="${SHEET_PALETTE.ink}">${escapeXml(resamplerSummaryLine)}</text>`,
    `  <text x="66" y="688" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="${SHEET_PALETTE.muted}">주연 얼굴 100% 보존: ${packageReport.cropSolution.allPrimaryFacesContained ? "전 규격 통과" : "일부 미달"} · UI 배지 눈 가림: ${packageReport.cropSolution.anyPrimaryEyeOccludedByUiBadge ? "감지됨" : "0건"} · 저해상도 경고: ${sanitizeSvgNum(packageReport.cropSolution.lowResolutionPresetIds.length)}건</text>`,
    `</svg>`,
  ].join("\n");

  return {
    svg,
    width,
    height,
    containsNaN: /\b(?:NaN|Infinity|-Infinity)\b/.test(svg),
    renderedPresetCount: displayItems.length,
    hasPrimaryEyeCrosshair,
  };
}

/** 플랫폼별 스마트 썸네일 패키징 결과를 자연스러운 한국어 출고 QA 브리프로 요약한다. */
export function summarizePlatformThumbnailPackageKo(
  packageReport: PlatformThumbnailPackageReport,
): string {
  const sol = packageReport.cropSolution;
  const audit = packageReport.resamplerAudit;
  const verdict = packageReport.readyForPublish
    ? "출고 승인 (전 규격 얼굴 보존·UI 배지 회피·종횡비 정밀도 충족)"
    : "재검토 필요 (일부 규격 경고 또는 가림 항목 확인 필요)";

  const lines: string[] = [
    "[플랫폼별 스마트 썸네일 출고 QA 브리프]",
    `- 판정: ${verdict}`,
    `- 작품: ${packageReport.titleKo} (${packageReport.artworkId})`,
    `- 원본 해상도: ${packageReport.sourceWidthPx}×${packageReport.sourceHeightPx}px (대상 프리셋 ${sol.crops.length}종)`,
    `- 종횡비 최대 상대오차: ${(sol.maxAspectRatioRelativeError * 100).toFixed(6)}%`,
    `- 주연 얼굴 100% 보존: ${sol.allPrimaryFacesContained ? "전 규격 통과" : "일부 규격 잘림 감지"}`,
    `- 플랫폼 UI 배지 시선 회피: ${sol.anyPrimaryEyeOccludedByUiBadge ? "가림 감지됨" : "전 규격 0건"}`,
    `- 저해상도 업스케일 경고(>${sol.upscaleWarningThreshold.toFixed(1)}배): ${
      sol.lowResolutionPresetIds.length > 0 ? sol.lowResolutionPresetIds.join(", ") : "없음"
    }`,
    `- 매니페스트 SHA-256: ${packageReport.manifestSha256Hex}`,
  ];

  if (audit.resampledPresetCount > 0) {
    lines.push(
      `- 안티링잉 Lanczos-3 감사(${audit.resampledPresetCount}종): 오버슈트 ${audit.totalRingingOvershootCount}px, ` +
        `평균 선명도 ${audit.averageLanczosAcutance.toFixed(2)} (Bilinear ${audit.averageBilinearAcutance.toFixed(2)} 대비 ${audit.sharpnessGainRatio.toFixed(2)}배)`,
    );
  } else {
    lines.push("- 리샘플링 감사: 크롭 좌표·매니페스트 검증 모드(원본 RGBA 타일 미전달)");
  }

  lines.push("- 프리셋별 세부 내역:");
  for (let i = 0; i < sol.crops.length; i += 1) {
    const c = sol.crops[i];
    const eyeDesc = c.primaryEyeNorm
      ? `시선(${(c.primaryEyeNorm.x * 100).toFixed(1)}%, ${(c.primaryEyeNorm.y * 100).toFixed(1)}%)`
      : "시선 없음";
    const statusTag = c.primaryFaceFullyContained && !c.primaryEyeOccludedByUiBadge ? "적합" : "점검";
    const resTag = c.lowResolutionWarning ? " / 저해상도 경고" : "";
    lines.push(
      `  · [${statusTag}] ${c.preset.platformNameKo} ${c.preset.deliveryNameKo}(${c.preset.targetWidthPx}×${c.preset.targetHeightPx}): ` +
        `크롭(${c.cropWindow.x.toFixed(1)}, ${c.cropWindow.y.toFixed(1)}, ${c.cropWindow.width.toFixed(1)}×${c.cropWindow.height.toFixed(1)}), ` +
        `${eyeDesc}, 얼굴 ${(c.primaryFaceContainedRatio * 100).toFixed(0)}%, 업스케일 ${c.upscaleRatio.toFixed(2)}배${resTag}`,
    );
  }

  return lines.join("\n");
}
