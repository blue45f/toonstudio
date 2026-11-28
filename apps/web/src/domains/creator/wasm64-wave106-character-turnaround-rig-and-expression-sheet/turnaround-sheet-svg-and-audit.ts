/**
 * Wave 106 — 인쇄 대응 고대비 OKLCH 5각 턴어라운드 모델 시트 SVG 렌더러 및
 * 한국어 작화 감독 QA 보고서 생성기.
 *
 * - 모든 색상은 순수 `oklch(...)` (및 투명 `none`)만 사용하여 린트 규칙(`shadcn/no-raw-colors`)을 0건 위반한다.
 * - 모든 좌표 숫자에 유한수 가드를 적용해 `NaN`/`Infinity` 출력을 원천 차단하고 모든 문자열을 XML 이스케이프한다.
 * - 번역투 없는 실무형 한국어 작화 검수 요약을 생성한다.
 */

import type {
  ProjectedAsymmetricLandmark,
  ProjectedCharacterHeadView,
  ProjectedComicMarker,
  ProjectedPoint3D,
} from "./loomis-head-3d-turnaround-rig";
import type {
  FiveAngleTurnaroundSheet,
  OffModelDriftAuditReport,
} from "./turnaround-sheet-and-offmodel-auditor";

export interface TurnaroundSheetSvgOptions {
  readonly titleOverride?: string;
  readonly showLoomisGuides?: boolean;
  readonly showLandmarkLabels?: boolean;
}

export interface CharacterTurnaroundAuditSummaryKo {
  readonly verdictLabelKo: string;
  readonly headlineKo: string;
  readonly summaryParagraphKo: string;
  readonly chiralityNotesKo: readonly string[];
  readonly proportionNotesKo: readonly string[];
  readonly recommendedFixesKo: readonly string[];
  readonly markdownReportKo: string;
}

const OKLCH_PALETTE = {
  paperBg: "oklch(0.985 0.008 95)",
  cardBg: "oklch(1 0 0)",
  cardBorder: "oklch(0.84 0.016 145)",
  headerBand: "oklch(0.955 0.012 145)",
  inkPrimary: "oklch(0.20 0.02 255)",
  inkSecondary: "oklch(0.43 0.02 255)",
  railMajor: "oklch(0.36 0.085 155)",
  railMinor: "oklch(0.55 0.075 240)",
  loomisGuide: "oklch(0.68 0.045 240)",
  loomisSidePlane: "oklch(0.76 0.035 215)",
  hairStroke: "oklch(0.32 0.04 265)",
  headInk: "oklch(0.18 0.015 260)",
  eyeFill: "oklch(0.99 0.004 250)",
  leftLandmarkFill: "oklch(0.56 0.21 25)",
  leftLandmarkStroke: "oklch(0.30 0.14 25)",
  rightLandmarkFill: "oklch(0.52 0.17 255)",
  rightLandmarkStroke: "oklch(0.28 0.12 255)",
  comicAccent: "oklch(0.58 0.19 42)",
  badgeOkBg: "oklch(0.93 0.04 155)",
  badgeOkInk: "oklch(0.28 0.09 155)",
  footerBg: "oklch(0.96 0.01 95)",
} as const;

/** XML 특수문자(`&`, `<`, `>`, `"`, `'`)를 안전하게 이스케이프한다. */
export function escapeTurnaroundSvgXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function buildPolylinePoints(points: readonly ProjectedPoint3D[], visibleOnly: boolean): string {
  const filtered = visibleOnly ? points.filter((p) => p.visible) : points;
  return filtered.map((p) => `${fmt(p.position2D.x)},${fmt(p.position2D.y)}`).join(" ");
}

function renderAsymmetricLandmarkSvg(lm: ProjectedAsymmetricLandmark, showLabel: boolean): string {
  const x = lm.position2D.x;
  const y = lm.position2D.y;
  const r = Math.max(3, lm.sizePx * 0.55);
  const fill =
    lm.anatomicalSide === "anatomical-left"
      ? OKLCH_PALETTE.leftLandmarkFill
      : OKLCH_PALETTE.rightLandmarkFill;
  const stroke =
    lm.anatomicalSide === "anatomical-left"
      ? OKLCH_PALETTE.leftLandmarkStroke
      : OKLCH_PALETTE.rightLandmarkStroke;

  const parts: string[] = [];
  if (lm.kind === "scar") {
    parts.push(
      `<line x1="${fmt(x - r)}" y1="${fmt(y - r * 0.85)}" x2="${fmt(x + r)}" y2="${fmt(y + r * 0.85)}" stroke="${fill}" stroke-width="2.2" stroke-linecap="round"/>`,
      `<line x1="${fmt(x - r * 0.45)}" y1="${fmt(y + r * 0.15)}" x2="${fmt(x + r * 0.45)}" y2="${fmt(y - r * 0.15)}" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round"/>`,
    );
  } else if (lm.kind === "eyepatch") {
    parts.push(
      `<rect x="${fmt(x - r * 1.1)}" y="${fmt(y - r * 0.75)}" width="${fmt(r * 2.2)}" height="${fmt(r * 1.5)}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>`,
    );
  } else if (lm.kind === "earring") {
    parts.push(
      `<circle cx="${fmt(x)}" cy="${fmt(y + r * 0.75)}" r="${fmt(r * 0.65)}" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>`,
    );
  } else if (lm.kind === "hair-part") {
    parts.push(
      `<path d="M ${fmt(x - r * 0.7)} ${fmt(y + r * 0.5)} L ${fmt(x)} ${fmt(y - r * 0.6)} L ${fmt(x + r * 0.7)} ${fmt(y + r * 0.5)}" fill="none" stroke="${fill}" stroke-width="2" stroke-linecap="round"/>`,
    );
  } else {
    parts.push(
      `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(Math.max(2.6, r * 0.52))}" fill="${fill}" stroke="${stroke}" stroke-width="1.1"/>`,
    );
  }

  parts.push(
    `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r + 3.2)}" fill="none" stroke="${fill}" stroke-width="0.9" stroke-dasharray="2.5 2"/>`,
  );

  if (showLabel) {
    const sideTag = lm.anatomicalSide === "anatomical-left" ? "L" : "R";
    const labelOffsetX = lm.expectedScreenSide === "screen-left" ? -r - 6 : r + 6;
    const anchor = lm.expectedScreenSide === "screen-left" ? "end" : "start";
    parts.push(
      `<text x="${fmt(x + labelOffsetX)}" y="${fmt(y + 3)}" text-anchor="${anchor}" font-size="8.5" font-weight="600" fill="${stroke}">[${sideTag}] ${escapeTurnaroundSvgXml(lm.labelKo)}</text>`,
    );
  }
  return parts.join("");
}

function renderComicMarkerSvg(marker: ProjectedComicMarker): string {
  const x = marker.anchor2D.x;
  const y = marker.anchor2D.y;
  const s = Math.max(4, marker.scalePx * 0.55);
  if (marker.kind === "anger-vein") {
    return `<path d="M ${fmt(x - s)} ${fmt(y - s * 0.4)} Q ${fmt(x - s * 0.3)} ${fmt(y)} ${fmt(x - s)} ${fmt(y + s * 0.4)} M ${fmt(x + s)} ${fmt(y - s * 0.4)} Q ${fmt(x + s * 0.3)} ${fmt(y)} ${fmt(x + s)} ${fmt(y + s * 0.4)}" fill="none" stroke="${OKLCH_PALETTE.comicAccent}" stroke-width="1.4"/>`;
  }
  if (marker.kind === "sweat-drop" || marker.kind === "tear-glint") {
    return `<path d="M ${fmt(x)} ${fmt(y - s)} Q ${fmt(x + s * 0.7)} ${fmt(y + s * 0.3)} ${fmt(x)} ${fmt(y + s)} Q ${fmt(x - s * 0.7)} ${fmt(y + s * 0.3)} ${fmt(x)} ${fmt(y - s)} Z" fill="${OKLCH_PALETTE.rightLandmarkFill}" stroke="${OKLCH_PALETTE.rightLandmarkStroke}" stroke-width="0.9"/>`;
  }
  return `<line x1="${fmt(x - s)}" y1="${fmt(y)}" x2="${fmt(x + s)}" y2="${fmt(y)}" stroke="${OKLCH_PALETTE.comicAccent}" stroke-width="1.3" stroke-linecap="round"/>`;
}

function renderSingleHeadSvg(
  head: ProjectedCharacterHeadView,
  showLoomisGuides: boolean,
  showLandmarkLabels: boolean,
): string {
  const lines: string[] = [];

  if (showLoomisGuides) {
    lines.push(
      `<ellipse cx="${fmt(head.craniumSphere.center2D.x)}" cy="${fmt(head.craniumSphere.center2D.y)}" rx="${fmt(head.craniumSphere.radiusXPx)}" ry="${fmt(head.craniumSphere.radiusYPx)}" fill="none" stroke="${OKLCH_PALETTE.loomisGuide}" stroke-width="1.15" stroke-dasharray="3 2.5"/>`,
    );
    for (const sp of [head.craniumSphere.leftSidePlane, head.craniumSphere.rightSidePlane]) {
      if (sp.visible) {
        lines.push(
          `<ellipse cx="${fmt(sp.center2D.x)}" cy="${fmt(sp.center2D.y)}" rx="${fmt(sp.radiusXPx)}" ry="${fmt(sp.radiusYPx)}" fill="none" stroke="${OKLCH_PALETTE.loomisSidePlane}" stroke-width="0.95"/>`,
        );
      }
    }
    const centerPts = buildPolylinePoints(head.centerlineCurve, true);
    if (centerPts.length > 0) {
      lines.push(
        `<polyline points="${centerPts}" fill="none" stroke="${OKLCH_PALETTE.loomisGuide}" stroke-width="0.95" stroke-dasharray="2 2"/>`,
      );
    }
    const browBeltPts = buildPolylinePoints(head.browBeltCurve, true);
    if (browBeltPts.length > 0) {
      lines.push(
        `<polyline points="${browBeltPts}" fill="none" stroke="${OKLCH_PALETTE.loomisGuide}" stroke-width="0.9"/>`,
      );
    }
  }

  // 헤어 실루엣 및 3D 턱선 컨투어
  const hairPts = buildPolylinePoints(head.hairSilhouetteCurve, false);
  if (hairPts.length > 0) {
    lines.push(
      `<polyline points="${hairPts}" fill="none" stroke="${OKLCH_PALETTE.hairStroke}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }
  const jawPts = buildPolylinePoints(head.jawlineContour, false);
  if (jawPts.length > 0) {
    lines.push(
      `<polyline points="${jawPts}" fill="none" stroke="${OKLCH_PALETTE.headInk}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }

  // 귀 (눈썹~코밑 루미스 기준)
  for (const ear of [head.facialFeatures.leftEar, head.facialFeatures.rightEar]) {
    if (ear.visible) {
      lines.push(
        `<path d="M ${fmt(ear.top2D.x)} ${fmt(ear.top2D.y)} Q ${fmt(ear.outer2D.x)} ${fmt(ear.outer2D.y)} ${fmt(ear.bottom2D.x)} ${fmt(ear.bottom2D.y)}" fill="none" stroke="${OKLCH_PALETTE.headInk}" stroke-width="1.45" stroke-linecap="round"/>`,
      );
    }
  }

  // 눈 & 눈썹
  for (const eye of [head.facialFeatures.leftEye, head.facialFeatures.rightEye]) {
    if (eye.visible) {
      const rx = Math.max(2, eye.widthPx * 0.5);
      const ry = Math.max(1.2, eye.apertureHeightPx * 0.5);
      lines.push(
        `<ellipse cx="${fmt(eye.center2D.x)}" cy="${fmt(eye.center2D.y)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="${OKLCH_PALETTE.eyeFill}" stroke="${OKLCH_PALETTE.headInk}" stroke-width="1.35"/>`,
        `<circle cx="${fmt(eye.center2D.x)}" cy="${fmt(eye.center2D.y)}" r="${fmt(Math.min(rx * 0.72, Math.max(1.2, eye.pupilRadiusPx)))}" fill="${OKLCH_PALETTE.headInk}"/>`,
      );
    }
  }
  for (const brow of [head.facialFeatures.leftBrow, head.facialFeatures.rightBrow]) {
    if (brow.visible) {
      lines.push(
        `<path d="M ${fmt(brow.inner2D.x)} ${fmt(brow.inner2D.y)} Q ${fmt(brow.peak2D.x)} ${fmt(brow.peak2D.y)} ${fmt(brow.outer2D.x)} ${fmt(brow.outer2D.y)}" fill="none" stroke="${OKLCH_PALETTE.headInk}" stroke-width="1.7" stroke-linecap="round"/>`,
      );
    }
  }

  // 코 & 입
  if (head.facialFeatures.nose.visible) {
    const n = head.facialFeatures.nose;
    lines.push(
      `<polyline points="${fmt(n.bridge2D.x)},${fmt(n.bridge2D.y)} ${fmt(n.tip2D.x)},${fmt(n.tip2D.y)} ${fmt(n.base2D.x)},${fmt(n.base2D.y)}" fill="none" stroke="${OKLCH_PALETTE.headInk}" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }
  if (head.facialFeatures.mouth.visible) {
    const m = head.facialFeatures.mouth;
    lines.push(
      `<path d="M ${fmt(m.rightCorner2D.x)} ${fmt(m.rightCorner2D.y)} Q ${fmt(m.centerTop2D.x)} ${fmt(m.centerTop2D.y)} ${fmt(m.leftCorner2D.x)} ${fmt(m.leftCorner2D.y)}" fill="none" stroke="${OKLCH_PALETTE.headInk}" stroke-width="1.35" stroke-linecap="round"/>`,
    );
    if (m.openness > 0.12) {
      lines.push(
        `<path d="M ${fmt(m.rightCorner2D.x)} ${fmt(m.rightCorner2D.y)} Q ${fmt(m.centerBottom2D.x)} ${fmt(m.centerBottom2D.y)} ${fmt(m.leftCorner2D.x)} ${fmt(m.leftCorner2D.y)}" fill="none" stroke="${OKLCH_PALETTE.headInk}" stroke-width="1.2" stroke-linecap="round"/>`,
      );
    }
  }

  // 만화 표정 기호 및 노출된 좌우 잠금 비대칭 특징점 (가려진 특징점은 절대 그리지 않음)
  for (const marker of head.activeComicMarkers) {
    if (marker.visible) {
      lines.push(renderComicMarkerSvg(marker));
    }
  }
  for (const lm of head.asymmetricLandmarks) {
    if (lm.visible) {
      lines.push(renderAsymmetricLandmarkSvg(lm, showLandmarkLabels));
    }
  }

  return lines.join("\n    ");
}

/**
 * 5각 턴어라운드 모델 시트를 인쇄 안전 고대비 순수 OKLCH SVG 문자열로 렌더링한다.
 */
export function renderCharacterTurnaroundSheetSvg(
  sheet: FiveAngleTurnaroundSheet,
  options?: TurnaroundSheetSvgOptions,
): string {
  const showLoomisGuides = options?.showLoomisGuides ?? true;
  const showLandmarkLabels = options?.showLandmarkLabels ?? true;

  const panelCount = Math.max(1, sheet.panels.length);
  const rightMargin = 24;
  const totalWidth =
    sheet.leftRailLabelMarginPx +
    panelCount * sheet.panelWidthPx +
    Math.max(0, panelCount - 1) * sheet.panelGapPx +
    rightMargin;
  const topPanelY = sheet.panels[0]?.panelBounds.y ?? 84;
  const bottomPanelY = topPanelY + sheet.panelHeightPx;
  const footerY = bottomPanelY + 16;
  const totalHeight = footerY + 46;

  const title =
    options?.titleOverride ??
    `${sheet.canonSheet.characterName} (${sheet.canonSheet.characterId}) · 360° 루미스 턴어라운드 시트`;
  const subTitle = `표정: ${sheet.expressionLabelKo} · 기준 지문: ${sheet.canonFingerprintSha256.slice(0, 12)} · 수직 정렬 오차: ${fmt(sheet.railAlignmentAudit.maxVerticalDriftPx)}px`;

  const rails: readonly { readonly label: string; readonly y: number; readonly major: boolean }[] = [
    { label: "정수리", y: sheet.sharedCanonRails.crownY, major: true },
    { label: "눈썹", y: sheet.sharedCanonRails.browY, major: false },
    { label: "눈", y: sheet.sharedCanonRails.eyeY, major: false },
    { label: "코", y: sheet.sharedCanonRails.noseY, major: false },
    { label: "턱", y: sheet.sharedCanonRails.chinY, major: true },
  ];

  const railStartX = sheet.leftRailLabelMarginPx - 8;
  const railEndX = totalWidth - rightMargin + 6;

  const svgLines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(totalWidth)} ${fmt(totalHeight)}" width="${fmt(totalWidth)}" height="${fmt(totalHeight)}" role="img" aria-label="${escapeTurnaroundSvgXml(title)}">`,
    `  <rect x="0" y="0" width="${fmt(totalWidth)}" height="${fmt(totalHeight)}" fill="${OKLCH_PALETTE.paperBg}"/>`,
    `  <rect x="14" y="12" width="${fmt(totalWidth - 28)}" height="54" rx="8" fill="${OKLCH_PALETTE.headerBand}" stroke="${OKLCH_PALETTE.cardBorder}" stroke-width="1"/>`,
    `  <text x="28" y="34" font-family="system-ui, sans-serif" font-size="15" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">${escapeTurnaroundSvgXml(title)}</text>`,
    `  <text x="28" y="54" font-family="system-ui, sans-serif" font-size="11" fill="${OKLCH_PALETTE.inkSecondary}">${escapeTurnaroundSvgXml(subTitle)}</text>`,
    `  <rect x="${fmt(totalWidth - 186)}" y="24" width="156" height="28" rx="14" fill="${OKLCH_PALETTE.badgeOkBg}" stroke="${OKLCH_PALETTE.railMajor}" stroke-width="1"/>`,
    `  <text x="${fmt(totalWidth - 108)}" y="42" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="${OKLCH_PALETTE.badgeOkInk}">${sheet.railAlignmentAudit.withinTolerance ? "5각 수평선 정렬 통과" : "수평선 정렬 점검 필요"}</text>`,
  ];

  // 5개 패널 카드 배경 및 각도 헤더
  for (const panel of sheet.panels) {
    const b = panel.panelBounds;
    const visCount = panel.projectedHead.asymmetricLandmarks.filter((l) => l.visible).length;
    const occCount = panel.projectedHead.asymmetricLandmarks.length - visCount;
    svgLines.push(
      `  <g data-panel-yaw="${fmt(panel.yawDeg)}">`,
      `    <rect x="${fmt(b.x)}" y="${fmt(b.y)}" width="${fmt(b.width)}" height="${fmt(b.height)}" rx="8" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.cardBorder}" stroke-width="1.1"/>`,
      `    <text x="${fmt(b.x + b.width * 0.5)}" y="${fmt(b.y + 18)}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11.5" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">${escapeTurnaroundSvgXml(panel.labelKo)}</text>`,
      `    <text x="${fmt(b.x + b.width * 0.5)}" y="${fmt(b.y + b.height - 9)}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="9.5" fill="${OKLCH_PALETTE.inkSecondary}">${escapeTurnaroundSvgXml(`특징 노출 ${visCount} · 가림 ${occCount}`)}</text>`,
      `  </g>`,
    );
  }

  // 5개 패널을 가로지르는 공통 수평 캐논 가이드선 (정수리 / 눈썹 / 눈 / 코 / 턱)
  svgLines.push(`  <g data-layer="shared-canon-rails">`);
  for (const rail of rails) {
    const stroke = rail.major ? OKLCH_PALETTE.railMajor : OKLCH_PALETTE.railMinor;
    const dash = rail.major ? "6 3" : "2.5 3";
    svgLines.push(
      `    <line x1="${fmt(railStartX)}" y1="${fmt(rail.y)}" x2="${fmt(railEndX)}" y2="${fmt(rail.y)}" stroke="${stroke}" stroke-width="${rail.major ? "1.1" : "0.85"}" stroke-dasharray="${dash}"/>`,
      `    <text x="${fmt(railStartX - 6)}" y="${fmt(rail.y + 3.5)}" text-anchor="end" font-family="system-ui, sans-serif" font-size="10" font-weight="${rail.major ? "700" : "600"}" fill="${stroke}">${escapeTurnaroundSvgXml(rail.label)}</text>`,
    );
  }
  svgLines.push(`  </g>`);

  // 각 패널 두상 투영 레이어
  for (const panel of sheet.panels) {
    svgLines.push(
      `  <g data-head-view="${escapeTurnaroundSvgXml(panel.viewCode)}">`,
      `    ${renderSingleHeadSvg(panel.projectedHead, showLoomisGuides, showLandmarkLabels)}`,
      `  </g>`,
    );
  }

  // 하단 범례 (좌우 잠금 키랄리티 표기)
  svgLines.push(
    `  <rect x="14" y="${fmt(footerY)}" width="${fmt(totalWidth - 28)}" height="32" rx="6" fill="${OKLCH_PALETTE.footerBg}" stroke="${OKLCH_PALETTE.cardBorder}" stroke-width="0.9"/>`,
    `  <circle cx="32" cy="${fmt(footerY + 16)}" r="5" fill="${OKLCH_PALETTE.leftLandmarkFill}" stroke="${OKLCH_PALETTE.leftLandmarkStroke}" stroke-width="1"/>`,
    `  <text x="43" y="${fmt(footerY + 20)}" font-family="system-ui, sans-serif" font-size="10.5" fill="${OKLCH_PALETTE.inkPrimary}">[L] 해부학적 왼쪽 특징 (정면 시 화면 오른쪽 고정)</text>`,
    `  <circle cx="348" cy="${fmt(footerY + 16)}" r="5" fill="${OKLCH_PALETTE.rightLandmarkFill}" stroke="${OKLCH_PALETTE.rightLandmarkStroke}" stroke-width="1"/>`,
    `  <text x="359" y="${fmt(footerY + 20)}" font-family="system-ui, sans-serif" font-size="10.5" fill="${OKLCH_PALETTE.inkPrimary}">[R] 해부학적 오른쪽 특징 (정면 시 화면 왼쪽 고정)</text>`,
    `  <text x="${fmt(totalWidth - 26)}" y="${fmt(footerY + 20)}" text-anchor="end" font-family="system-ui, sans-serif" font-size="10" fill="${OKLCH_PALETTE.inkSecondary}">${escapeTurnaroundSvgXml(`두상비 ${sheet.canonSheet.headWidthToHeightRatio.toFixed(2)} · 눈간격 ${sheet.canonSheet.eyeSpacingInEyeWidths.toFixed(2)} · 하악비 ${sheet.canonSheet.jawHeightRatio.toFixed(2)}`)}</text>`,
    `</svg>`,
  );

  return svgLines.join("\n");
}

/**
 * 작붕 감사 결과를 번역투 없는 실무형 한국어 작화 감독 QA 리포트로 요약한다.
 */
export function summarizeCharacterTurnaroundAuditKo(
  report: OffModelDriftAuditReport,
): CharacterTurnaroundAuditSummaryKo {
  const verdictLabelKo =
    report.passStatus === "blocked"
      ? "출고 차단 (좌우 반전·중대 작붕)"
      : report.passStatus === "needs-revision"
        ? "수정 권고"
        : "작화 통과";

  const headlineKo = `[${verdictLabelKo}] ${report.characterName} · ${report.panelId} (${report.estimatedYawDeg}° / ${report.estimatedPitchDeg}°) — 정합도 ${report.onModelConsistencyScore.toFixed(1)}점`;

  const chiralityFindings = report.findings.filter(
    (f) =>
      f.code === "mirrored-asymmetric-landmark" ||
      f.code === "impossible-occluded-landmark" ||
      f.code === "missing-visible-landmark" ||
      f.code === "unknown-asymmetric-landmark",
  );
  const proportionFindings = report.findings.filter(
    (f) => f.code === "eye-spacing-drift" || f.code === "craniofacial-proportion-drift",
  );

  const chiralityNotesKo =
    chiralityFindings.length > 0
      ? chiralityFindings.map((f) => f.messageKo)
      : ["비대칭 특징점(흉터·점·소품) 좌우 위치와 가림 상태가 모두 설정 시트와 일치합니다."];

  const proportionNotesKo =
    proportionFindings.length > 0
      ? proportionFindings.map((f) => f.messageKo)
      : ["두상 가로·세로 비율과 눈 사이 간격, 하악 길이가 허용 오차 안에 들어옵니다."];

  const recommendedFixesKo =
    report.findings.length > 0
      ? report.findings.map((f) => f.recommendedFixKo)
      : ["별도 수정 없이 다음 선화·채색 공정으로 넘겨도 됩니다."];

  let summaryParagraphKo: string;
  if (report.passStatus === "blocked") {
    summaryParagraphKo =
      `${report.episodeLabel} ${report.panelId} 컷에서 치명적 작붕 ${report.blockerCount}건(경고 ${report.warningCount}건)을 잡았습니다. ` +
      `정합도 ${report.onModelConsistencyScore.toFixed(1)}점으로 출고를 막았으니, 뒤집힌 비대칭 특징점과 비율 이탈 구간을 먼저 고친 뒤 다시 검수하세요.`;
  } else if (report.passStatus === "needs-revision") {
    summaryParagraphKo =
      `${report.episodeLabel} ${report.panelId} 컷의 작화 정합도는 ${report.onModelConsistencyScore.toFixed(1)}점이며 수정 권고 항목이 ${report.warningCount}건 있습니다. ` +
      `가림 처리 오류나 미세 비율 편차를 다듬으면 캐릭터 인상이 훨씬 안정됩니다.`;
  } else {
    summaryParagraphKo =
      `${report.episodeLabel} ${report.panelId} 컷은 작화 정합도 ${report.onModelConsistencyScore.toFixed(1)}점으로 기준 모델 시트와 잘 맞습니다. ` +
      `비대칭 특징점 좌우 잠금과 두상 비율 모두 정상이어서 바로 후속 공정으로 진행할 수 있습니다.`;
  }

  const markdownLines: string[] = [
    `### ${headlineKo}`,
    "",
    summaryParagraphKo,
    "",
    `- **캐릭터 캐논 지문:** \`${report.canonFingerprintSha256.slice(0, 16)}\` (FNV-1a \`${report.canonFingerprintFnv1a}\`)`,
    `- **판정 요약:** 차단 ${report.blockerCount}건 · 경고 ${report.warningCount}건 · 점수 ${report.onModelConsistencyScore.toFixed(1)} / 100`,
    "",
    "#### 비대칭 특징점 좌우 점검",
    ...chiralityNotesKo.map((line) => `- ${line}`),
    "",
    "#### 두상·안면 비율 점검",
    ...proportionNotesKo.map((line) => `- ${line}`),
    "",
    "#### 권장 수정 조치",
    ...recommendedFixesKo.map((line) => `- ${line}`),
  ];

  return {
    verdictLabelKo,
    headlineKo,
    summaryParagraphKo,
    chiralityNotesKo,
    proportionNotesKo,
    recommendedFixesKo,
    markdownReportKo: markdownLines.join("\n"),
  };
}
