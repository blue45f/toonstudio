/**
 * Wave 118 — 인쇄 안전 순수 OKLCH 해부학 원근 단축·실루엣 대조 SVG 렌더러 및 한국어 작화 디렉터 브리프.
 *
 * - 원시 16진수/RGB/HSL 색상 배제, 100% OKLCH 컬러 토큰만 사용
 * - 좌측: 원근 단축 원통 겹침 링 · 17관절 뼈대 · 무게중심 수직선 · 지지 발판
 * - 우측: 순수 단색 실루엣 가독성 검수 뷰 + 파묻힘/접선 충돌 마커
 * - XML 특수문자 이스케이프 및 NaN/Infinity 완전 차단
 */

import {
  ANATOMY_JOINT_IDS,
  type AnatomyForeshorteningProjection,
  type ProjectedLimbSegment,
} from "./anatomy-rig-and-foreshortening";
import type {
  PoseBalanceAndSilhouetteAudit,
  SilhouetteRefinementResult,
} from "./balance-and-silhouette-auditor";

export type AnatomySvgTheme = "light" | "dark";

export interface AnatomyForeshorteningSvgOptions {
  readonly theme?: AnatomySvgTheme;
  readonly title?: string;
  readonly showOverlapRings?: boolean;
  readonly showIssueMarkers?: boolean;
}

export type AnatomyAuditVerdict = "pass" | "warn" | "fail";

export interface AnatomyForeshorteningReportKo {
  readonly verdict: AnatomyAuditVerdict;
  readonly verdictLabelKo: string;
  readonly headlineKo: string;
  readonly summaryParagraphKo: string;
  readonly bulletLinesKo: readonly string[];
  readonly actionableDirectivesKo: readonly string[];
}

interface AnatomyOklchPalette {
  readonly canvasBg: string;
  readonly panelBg: string;
  readonly panelBorder: string;
  readonly gridLine: string;
  readonly headerInk: string;
  readonly mutedInk: string;
  readonly capsuleFill: string;
  readonly capsuleStroke: string;
  readonly ringBackStroke: string;
  readonly ringFrontStroke: string;
  readonly boneStroke: string;
  readonly jointFill: string;
  readonly jointStroke: string;
  readonly comLineStroke: string;
  readonly comFill: string;
  readonly supportOkFill: string;
  readonly supportOkStroke: string;
  readonly supportWarnFill: string;
  readonly supportWarnStroke: string;
  readonly issueErrorStroke: string;
  readonly issueWarnStroke: string;
  readonly silhouetteInk: string;
  readonly badgeBg: string;
  readonly badgeInk: string;
}

const LIGHT_PALETTE: AnatomyOklchPalette = {
  canvasBg: "oklch(0.974 0.008 92)",
  panelBg: "oklch(0.996 0.003 95)",
  panelBorder: "oklch(0.32 0.02 250)",
  gridLine: "oklch(0.84 0.012 92)",
  headerInk: "oklch(0.22 0.02 255)",
  mutedInk: "oklch(0.45 0.02 255)",
  capsuleFill: "oklch(0.92 0.018 88 / 0.72)",
  capsuleStroke: "oklch(0.38 0.025 250)",
  ringBackStroke: "oklch(0.68 0.03 245 / 0.45)",
  ringFrontStroke: "oklch(0.34 0.11 162)",
  boneStroke: "oklch(0.28 0.05 245)",
  jointFill: "oklch(0.985 0.004 95)",
  jointStroke: "oklch(0.24 0.04 250)",
  comLineStroke: "oklch(0.52 0.16 28)",
  comFill: "oklch(0.55 0.17 28)",
  supportOkFill: "oklch(0.76 0.11 158 / 0.32)",
  supportOkStroke: "oklch(0.42 0.12 158)",
  supportWarnFill: "oklch(0.78 0.14 35 / 0.34)",
  supportWarnStroke: "oklch(0.52 0.17 28)",
  issueErrorStroke: "oklch(0.54 0.19 25)",
  issueWarnStroke: "oklch(0.62 0.16 65)",
  silhouetteInk: "oklch(0.18 0.014 258)",
  badgeBg: "oklch(0.935 0.018 158)",
  badgeInk: "oklch(0.26 0.07 158)",
};

const DARK_PALETTE: AnatomyOklchPalette = {
  canvasBg: "oklch(0.165 0.012 165)",
  panelBg: "oklch(0.21 0.014 165)",
  panelBorder: "oklch(0.72 0.04 162)",
  gridLine: "oklch(0.32 0.015 165)",
  headerInk: "oklch(0.95 0.008 95)",
  mutedInk: "oklch(0.74 0.016 165)",
  capsuleFill: "oklch(0.31 0.02 165 / 0.72)",
  capsuleStroke: "oklch(0.74 0.04 162)",
  ringBackStroke: "oklch(0.56 0.03 165 / 0.45)",
  ringFrontStroke: "oklch(0.78 0.13 158)",
  boneStroke: "oklch(0.84 0.05 162)",
  jointFill: "oklch(0.22 0.015 165)",
  jointStroke: "oklch(0.88 0.04 162)",
  comLineStroke: "oklch(0.72 0.16 32)",
  comFill: "oklch(0.74 0.17 32)",
  supportOkFill: "oklch(0.52 0.11 158 / 0.36)",
  supportOkStroke: "oklch(0.76 0.12 158)",
  supportWarnFill: "oklch(0.54 0.15 30 / 0.38)",
  supportWarnStroke: "oklch(0.76 0.17 30)",
  issueErrorStroke: "oklch(0.74 0.18 28)",
  issueWarnStroke: "oklch(0.8 0.15 72)",
  silhouetteInk: "oklch(0.94 0.008 95)",
  badgeBg: "oklch(0.3 0.05 158)",
  badgeInk: "oklch(0.92 0.04 158)",
};

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/**
 * XML/SVG 텍스트 및 속성 특수문자 이스케이프.
 */
export function escapeAnatomyXmlText(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildTaperedCapsulePath(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const safeR1 = Math.max(2, r1);
  const safeR2 = Math.max(2, r2);
  if (dist < 1e-3) {
    const r = Math.max(safeR1, safeR2);
    return `M ${fmt(x1 - r)} ${fmt(y1)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(x1 + r)} ${fmt(y1)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(x1 - r)} ${fmt(y1)} Z`;
  }
  const nx = -dy / dist;
  const ny = dx / dist;
  const ax = x1 + nx * safeR1;
  const ay = y1 + ny * safeR1;
  const bx = x2 + nx * safeR2;
  const by = y2 + ny * safeR2;
  const cx = x2 - nx * safeR2;
  const cy = y2 - ny * safeR2;
  const dxp = x1 - nx * safeR1;
  const dyp = y1 - ny * safeR1;
  return [
    `M ${fmt(ax)} ${fmt(ay)}`,
    `L ${fmt(bx)} ${fmt(by)}`,
    `A ${fmt(safeR2)} ${fmt(safeR2)} 0 0 1 ${fmt(cx)} ${fmt(cy)}`,
    `L ${fmt(dxp)} ${fmt(dyp)}`,
    `A ${fmt(safeR1)} ${fmt(safeR1)} 0 0 1 ${fmt(ax)} ${fmt(ay)}`,
    "Z",
  ].join(" ");
}

function renderSegmentOverlapRingsSvg(
  seg: ProjectedLimbSegment,
  palette: AnatomyOklchPalette,
): string {
  if (seg.overlapRings.length === 0) return "";
  const parts: string[] = [];
  for (const ring of seg.overlapRings) {
    const rx = Math.max(1.5, ring.rxPx);
    const ry = Math.max(1.2, ring.ryPx);
    // visibleArcDirection2D는 원경(far) 방향 단위벡터.
    // 근경이 원경을 감싸는 가시 반원 호는 axisAngleDeg 기준 +X(원경 쪽)으로 볼록하게 그려진다.
    const rotateDeg = ring.axisAngleDeg;
    const frontArcPath = `M 0 ${fmt(-rx)} A ${fmt(ry)} ${fmt(rx)} 0 0 1 0 ${fmt(rx)}`;
    parts.push(
      `<g transform="translate(${fmt(ring.cx)}, ${fmt(ring.cy)}) rotate(${fmt(rotateDeg)})" data-overlap-ring="${escapeAnatomyXmlText(seg.boneId)}" data-enclosing="${ring.enclosingOrder}">` +
        `<ellipse cx="0" cy="0" rx="${fmt(ry)}" ry="${fmt(rx)}" fill="none" stroke="${palette.ringBackStroke}" stroke-width="1" stroke-dasharray="3 3" />` +
        `<path d="${frontArcPath}" fill="none" stroke="${palette.ringFrontStroke}" stroke-width="1.8" stroke-linecap="round" />` +
        `</g>`,
    );
  }
  return parts.join("\n      ");
}

function renderAnatomyViewLayer(
  projection: AnatomyForeshorteningProjection,
  audit: PoseBalanceAndSilhouetteAudit,
  palette: AnatomyOklchPalette,
  showOverlapRings: boolean,
  showIssueMarkers: boolean,
): string {
  const { viewportWidthPx: w, viewportHeightPx: h } = projection;
  const groundY = clampToViewport(audit.balance.comGroundScreen2D.y, 24, h - 18);
  const supportLeftX = clampToViewport(
    Math.min(audit.balance.supportLeftScreen2D.x, audit.balance.supportRightScreen2D.x),
    16,
    w - 16,
  );
  const supportRightX = clampToViewport(
    Math.max(audit.balance.supportLeftScreen2D.x, audit.balance.supportRightScreen2D.x),
    16,
    w - 16,
  );
  const supportWidth = Math.max(24, supportRightX - supportLeftX);
  const isTipRisk = audit.balance.classification === "unintentional-tip-risk";
  const supportFill = isTipRisk ? palette.supportWarnFill : palette.supportOkFill;
  const supportStroke = isTipRisk ? palette.supportWarnStroke : palette.supportOkStroke;

  const segmentsSvg: string[] = [];
  for (const seg of projection.segmentsFarToNear) {
    const a = projection.joints2D[seg.startJoint];
    const b = projection.joints2D[seg.endJoint];
    const capsule = buildTaperedCapsulePath(
      a.screenX,
      a.screenY,
      seg.startRadiusPx,
      b.screenX,
      b.screenY,
      seg.endRadiusPx,
    );
    const rings = showOverlapRings ? renderSegmentOverlapRingsSvg(seg, palette) : "";
    segmentsSvg.push(
      `<g data-segment="${escapeAnatomyXmlText(seg.boneId)}" data-depth-rank="${seg.nearToFarIndex}">` +
        `<path d="${capsule}" fill="${palette.capsuleFill}" stroke="${palette.capsuleStroke}" stroke-width="1.4" />` +
        (rings ? `\n      ${rings}` : "") +
        `<line x1="${fmt(a.screenX)}" y1="${fmt(a.screenY)}" x2="${fmt(b.screenX)}" y2="${fmt(b.screenY)}" stroke="${palette.boneStroke}" stroke-width="1.6" stroke-linecap="round" />` +
        `</g>`,
    );
  }

  const head2D = projection.joints2D.head;
  const headRy = Math.max(6, (projection.pose.profile.headHeightM * 0.5) * head2D.scaleFactorPxPerM);
  const headRx = Math.max(5, head2D.radiusPx);

  const romViolationJoints = new Set(projection.pose.romAudit.violations.map((v) => v.jointId));
  const jointsSvg = ANATOMY_JOINT_IDS.map((jointId) => {
    const j = projection.joints2D[jointId];
    const hasViolation = romViolationJoints.has(jointId);
    const r = hasViolation ? 5.2 : 3.4;
    const stroke = hasViolation ? palette.issueErrorStroke : palette.jointStroke;
    return `<circle cx="${fmt(j.screenX)}" cy="${fmt(j.screenY)}" r="${fmt(r)}" fill="${palette.jointFill}" stroke="${stroke}" stroke-width="${hasViolation ? "2.4" : "1.5"}" data-joint="${jointId}" />`;
  }).join("\n      ");

  const comX = audit.balance.comScreen2D.x;
  const comY = audit.balance.comScreen2D.y;
  const comPlumbSvg = [
    `<rect x="${fmt(supportLeftX)}" y="${fmt(groundY - 5)}" width="${fmt(supportWidth)}" height="10" rx="5" fill="${supportFill}" stroke="${supportStroke}" stroke-width="1.6" data-support-base="true" />`,
    `<line x1="${fmt(comX)}" y1="${fmt(comY)}" x2="${fmt(audit.balance.comGroundScreen2D.x)}" y2="${fmt(groundY)}" stroke="${palette.comLineStroke}" stroke-width="1.8" stroke-dasharray="5 4" data-com-plumb="true" />`,
    `<circle cx="${fmt(comX)}" cy="${fmt(comY)}" r="6" fill="${palette.comFill}" stroke="${palette.panelBg}" stroke-width="1.8" data-com-marker="true" />`,
    `<circle cx="${fmt(audit.balance.comGroundScreen2D.x)}" cy="${fmt(groundY)}" r="4" fill="${palette.comFill}" />`,
  ].join("\n      ");

  const issueMarkersSvg = showIssueMarkers
    ? audit.silhouetteIssues
        .map((issue) => {
          const stroke = issue.severity === "error" ? palette.issueErrorStroke : palette.issueWarnStroke;
          return `<circle cx="${fmt(issue.screenPoint.x)}" cy="${fmt(issue.screenPoint.y)}" r="13" fill="none" stroke="${stroke}" stroke-width="2" stroke-dasharray="4 3" data-issue="${issue.kind}" />`;
        })
        .join("\n      ")
    : "";

  return [
    `<line x1="16" y1="${fmt(groundY)}" x2="${fmt(w - 16)}" y2="${fmt(groundY)}" stroke="${palette.gridLine}" stroke-width="1.2" />`,
    comPlumbSvg,
    segmentsSvg.join("\n      "),
    `<ellipse cx="${fmt(head2D.screenX)}" cy="${fmt(head2D.screenY)}" rx="${fmt(headRx)}" ry="${fmt(headRy)}" fill="${palette.capsuleFill}" stroke="${palette.capsuleStroke}" stroke-width="1.6" />`,
    jointsSvg,
    issueMarkersSvg,
  ]
    .filter((s) => s.length > 0)
    .join("\n      ");
}

function renderPureSilhouetteLayer(
  projection: AnatomyForeshorteningProjection,
  audit: PoseBalanceAndSilhouetteAudit,
  palette: AnatomyOklchPalette,
  showIssueMarkers: boolean,
): string {
  const capsules = projection.segmentsFarToNear
    .map((seg) => {
      const a = projection.joints2D[seg.startJoint];
      const b = projection.joints2D[seg.endJoint];
      const d = buildTaperedCapsulePath(
        a.screenX,
        a.screenY,
        seg.startRadiusPx * 1.05,
        b.screenX,
        b.screenY,
        seg.endRadiusPx * 1.05,
      );
      return `<path d="${d}" fill="${palette.silhouetteInk}" />`;
    })
    .join("\n      ");

  const head2D = projection.joints2D.head;
  const headRy = Math.max(6, (projection.pose.profile.headHeightM * 0.5) * head2D.scaleFactorPxPerM);
  const headRx = Math.max(5, head2D.radiusPx * 1.04);
  const chest2D = projection.joints2D.chest;
  const pelvis2D = projection.joints2D.pelvis;
  const lShoulder = projection.joints2D.leftShoulder;
  const rShoulder = projection.joints2D.rightShoulder;
  const lHip = projection.joints2D.leftHip;
  const rHip = projection.joints2D.rightHip;
  const torsoPoly =
    `M ${fmt(lShoulder.screenX)} ${fmt(lShoulder.screenY)} ` +
    `L ${fmt(rShoulder.screenX)} ${fmt(rShoulder.screenY)} ` +
    `L ${fmt(rHip.screenX)} ${fmt(rHip.screenY)} ` +
    `L ${fmt(pelvis2D.screenX)} ${fmt(pelvis2D.screenY + pelvis2D.radiusPx * 0.45)} ` +
    `L ${fmt(lHip.screenX)} ${fmt(lHip.screenY)} Z`;

  const issueRings = showIssueMarkers
    ? audit.silhouetteIssues
        .map((issue) => {
          const stroke = issue.severity === "error" ? palette.issueErrorStroke : palette.issueWarnStroke;
          return `<circle cx="${fmt(issue.screenPoint.x)}" cy="${fmt(issue.screenPoint.y)}" r="15" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-dasharray="4 3" data-silhouette-issue="${issue.kind}" />`;
        })
        .join("\n      ")
    : "";

  return [
    `<g data-pure-silhouette="true">`,
    `  <path d="${torsoPoly}" fill="${palette.silhouetteInk}" />`,
    `  ${capsules}`,
    `  <ellipse cx="${fmt(head2D.screenX)}" cy="${fmt(head2D.screenY)}" rx="${fmt(headRx)}" ry="${fmt(headRy)}" fill="${palette.silhouetteInk}" />`,
    `  <circle cx="${fmt(chest2D.screenX)}" cy="${fmt(chest2D.screenY)}" r="${fmt(Math.max(4, chest2D.radiusPx * 0.9))}" fill="${palette.silhouetteInk}" />`,
    `</g>`,
    issueRings,
  ]
    .filter((s) => s.length > 0)
    .join("\n      ");
}

function clampToViewport(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * 좌측(원근 단축 원통 링·뼈대·무게중심 수직선·지지 발판)과
 * 우측(순수 단색 실루엣 가독성 뷰)을 나란히 배치한 인쇄 안전 OKLCH SVG를 생성한다.
 */
export function renderAnatomyForeshorteningSvg(
  projection: AnatomyForeshorteningProjection,
  audit: PoseBalanceAndSilhouetteAudit,
  options?: AnatomyForeshorteningSvgOptions,
): string {
  const palette = options?.theme === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
  const showOverlapRings = options?.showOverlapRings ?? true;
  const showIssueMarkers = options?.showIssueMarkers ?? true;
  const panelW = projection.viewportWidthPx;
  const panelH = projection.viewportHeightPx;
  const pad = 20;
  const gap = 18;
  const headerH = 52;
  const subHeaderH = 26;
  const totalW = pad * 2 + panelW * 2 + gap;
  const totalH = headerH + subHeaderH + panelH + pad;

  const titleText =
    options?.title ??
    `Wave 118 해부학 단축·실루엣 검수 (${projection.pose.profile.labelKo} · ${projection.lensCategoryKo})`;
  const subtitleText =
    `주먹/머리 배율 ${fmt(projection.wristToHeadScaleRatio)}x · 균형 ${audit.balance.classificationLabelKo} · 실루엣 ${fmt(audit.silhouetteClarityScore)}/100`;

  const leftPanelX = pad;
  const rightPanelX = pad + panelW + gap;
  const panelTopY = headerH + subHeaderH;

  const anatomyLayer = renderAnatomyViewLayer(
    projection,
    audit,
    palette,
    showOverlapRings,
    showIssueMarkers,
  );
  const silhouetteLayer = renderPureSilhouetteLayer(
    projection,
    audit,
    palette,
    showIssueMarkers,
  );

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(totalW)} ${fmt(totalH)}" width="${fmt(totalW)}" height="${fmt(totalH)}" role="img" aria-label="${escapeAnatomyXmlText(titleText)}" font-family="'Pretendard', 'Noto Sans KR', sans-serif">`,
    `  <rect x="0" y="0" width="${fmt(totalW)}" height="${fmt(totalH)}" fill="${palette.canvasBg}" />`,
    `  <text x="${fmt(pad)}" y="24" font-size="14" font-weight="700" fill="${palette.headerInk}">${escapeAnatomyXmlText(titleText)}</text>`,
    `  <text x="${fmt(pad)}" y="43" font-size="11.5" fill="${palette.mutedInk}">${escapeAnatomyXmlText(subtitleText)}</text>`,
    `  <text x="${fmt(leftPanelX)}" y="${fmt(panelTopY - 8)}" font-size="12" font-weight="600" fill="${palette.headerInk}">원근 단축 원통 링 · 뼈대 · 무게중심(CoM)</text>`,
    `  <text x="${fmt(rightPanelX)}" y="${fmt(panelTopY - 8)}" font-size="12" font-weight="600" fill="${palette.headerInk}">순수 단색 실루엣 가독성 검수 (${fmt(audit.silhouetteClarityScore)}/100)</text>`,
    `  <rect x="${fmt(leftPanelX)}" y="${fmt(panelTopY)}" width="${fmt(panelW)}" height="${fmt(panelH)}" rx="10" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="1.8" />`,
    `  <rect x="${fmt(rightPanelX)}" y="${fmt(panelTopY)}" width="${fmt(panelW)}" height="${fmt(panelH)}" rx="10" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="1.8" />`,
    `  <g transform="translate(${fmt(leftPanelX)}, ${fmt(panelTopY)})" data-view="anatomy-foreshortening">`,
    `      ${anatomyLayer}`,
    "  </g>",
    `  <g transform="translate(${fmt(rightPanelX)}, ${fmt(panelTopY)})" data-view="pure-silhouette">`,
    `      ${silhouetteLayer}`,
    "  </g>",
    `  <rect x="${fmt(rightPanelX + panelW - 134)}" y="${fmt(panelTopY + 12)}" width="122" height="26" rx="13" fill="${palette.badgeBg}" />`,
    `  <text x="${fmt(rightPanelX + panelW - 73)}" y="${fmt(panelTopY + 29)}" text-anchor="middle" font-size="11.5" font-weight="700" fill="${palette.badgeInk}">가독성 ${fmt(audit.silhouetteClarityScore)}점</text>`,
    "</svg>",
  ].join("\n");
}

/**
 * 원근 단축 투영과 균형·실루엣 감사 결과를 번역투 없는 자연스러운 한국어 작화 디렉터 브리프로 요약한다.
 */
export function summarizeAnatomyForeshorteningKo(
  projection: AnatomyForeshorteningProjection,
  audit: PoseBalanceAndSilhouetteAudit,
  refinement?: SilhouetteRefinementResult,
): AnatomyForeshorteningReportKo {
  const { pose } = projection;
  const romErrors = pose.romAudit.hyperextensionViolationCount;
  const hasHardFailure =
    romErrors > 0 ||
    audit.balance.classification === "unintentional-tip-risk" ||
    audit.silhouetteClarityScore < 60;
  const hasWarning =
    pose.romAudit.totalViolationCount > 0 ||
    audit.tuckedLimbCount > 0 ||
    audit.tangentClashCount > 0 ||
    audit.silhouetteClarityScore < 80;

  const verdict: AnatomyAuditVerdict = hasHardFailure ? "fail" : hasWarning ? "warn" : "pass";
  const verdictLabelKo =
    verdict === "pass"
      ? "작화 검수 통과"
      : verdict === "warn"
        ? "실루엣·균형 보완 권장"
        : "해부학·실루엣 즉시 수정 필요";

  const wristScaleText = `${fmt(projection.wristToHeadScaleRatio)}배`;
  const clarityText = `${fmt(audit.silhouetteClarityScore)}점`;

  const headlineKo =
    verdict === "pass"
      ? `${pose.profile.labelKo} · ${projection.lensCategoryKo} 컷 작화 통과(실루엣 ${clarityText}, ${audit.balance.classificationLabelKo})`
      : verdict === "warn"
        ? `${pose.profile.labelKo} · ${projection.lensCategoryKo} 컷 윤곽 분리 보완 권장(실루엣 ${clarityText})`
        : `${pose.profile.labelKo} · ${projection.lensCategoryKo} 컷 관절 역꺾임·균형·실루엣 즉시 교정 필요`;

  const perspectiveSentence =
    projection.wristToHeadScaleRatio >= 1.45
      ? `근경 손목이 머리보다 ${wristScaleText} 크게 투영되어 전경 타격감이 또렷하다.`
      : projection.wristToHeadScaleRatio <= 1.08
        ? `근경 손목과 머리 배율 차가 ${wristScaleText}로 압축되어 차분한 망원 구도다.`
        : `근경 손목 대 머리 배율은 ${wristScaleText}로 자연스러운 표준 원근이다.`;

  const balanceSentence =
    audit.balance.classification === "static-balanced"
      ? "무게중심이 양발 지지 구간 안에 안정적으로 떨어진다."
      : audit.balance.classification === "dynamic-action-lean"
        ? "무게중심이 이동 방향으로 앞서 나가 역동적인 액션 추진력이 산다."
        : `무게중심이 발 지지 범위 밖으로 ${fmt(audit.balance.distanceOutsideSupportM * 100)}cm 벗어나 넘어질 듯 불안정하다.`;

  const silhouetteSentence =
    audit.isSilhouetteClean
      ? `팔 파묻힘과 접선 충돌 없이 단색 실루엣 가독성 ${clarityText}를 확보했다.`
      : `몸통 파묻힘 ${audit.tuckedLimbCount}건, 사지 접선 충돌 ${audit.tangentClashCount}건이 잡혀 실루엣 가독성이 ${clarityText}에 머문다.`;

  const summaryParagraphKo = `${pose.profile.labelKo}(${fmt(pose.standingHeadRatio)}등신 실측, ${projection.lensCategoryKo}) 컷 검수 결과다. ${perspectiveSentence} ${balanceSentence} ${silhouetteSentence}`;

  const directives: string[] = [];
  if (romErrors > 0) {
    directives.push(
      `팔꿈치·무릎 역꺾임 ${romErrors}곳을 0° 이상 정상 관절 각도로 되돌려 뼈대 꺾임을 바로잡아라.`,
    );
  }
  if (audit.balance.classification === "unintentional-tip-risk") {
    directives.push(
      "양발 폭을 넓히거나 상체 기울기를 반대로 잡아 무게중심 수직선을 지지 발판 안으로 들여라.",
    );
  }
  if (audit.tuckedLimbCount > 0) {
    directives.push(
      "몸통 안으로 파묻힌 팔꿈치와 손목의 어깨 외전을 넓혀 겨드랑이·허리 사이 빈 공간을 열어라.",
    );
  }
  if (audit.tangentClashCount > 0) {
    directives.push(
      "화면에서 12px 이내로 스치는 사지 끝단을 상하·좌우로 떼거나 골반을 반측면으로 돌려 접선을 끊어라.",
    );
  }
  if (refinement && refinement.clarityScoreDelta > 0) {
    directives.push(
      `자동 교정 포즈 적용 시 실루엣 가독성이 ${fmt(refinement.originalClarityScore)}점에서 ${fmt(refinement.refinedClarityScore)}점(+${fmt(refinement.clarityScoreDelta)}점)으로 올라간다.`,
    );
  }
  if (directives.length === 0) {
    directives.push("현재 뼈대 원근과 실루엣 여백이 깔끔하므로 바로 선화 단계로 넘어가도 좋다.");
  }

  return {
    verdict,
    verdictLabelKo,
    headlineKo,
    summaryParagraphKo,
    bulletLinesKo: [
      `비례·카메라: ${pose.profile.labelKo}(실측 ${fmt(pose.standingHeadRatio)}등신) · ${projection.lensCategoryKo} · 유효 거리 ${fmt(projection.effectiveCameraDistanceM)}m`,
      `원근 단축: 근경 손목/머리 배율 ${wristScaleText} · 최대 단축 강도 ${Math.round(projection.maxForeshorteningStrength * 100)}% (${projection.mostForeshortenedBoneId})`,
      `관절 가동 범위: 역꺾임 ${romErrors}건 · 전체 ROM 경고 ${pose.romAudit.totalViolationCount}건`,
      `무게중심 균형: ${audit.balance.classificationLabelKo} · 지지 구간 X=[${fmt(audit.balance.baseOfSupportXMin)}m, ${fmt(audit.balance.baseOfSupportXMax)}m] · 이탈 ${fmt(audit.balance.distanceOutsideSupportM * 100)}cm`,
      `실루엣 가독성: ${clarityText} · 팔 파묻힘 ${audit.tuckedLimbCount}건 · 접선 충돌 ${audit.tangentClashCount}건`,
    ],
    actionableDirectivesKo: directives,
  };
}
