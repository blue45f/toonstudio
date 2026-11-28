/**
 * Wave 157 — 순수 OKLCH 삼분할·황금나선·관절 안전대·DoF 비교 SVG 렌더러 및
 * 한국어 촬영 감독 QA 브리프 생성기.
 *
 * - 원시 색상 문법을 전혀 쓰지 않고 순수 `oklch(...)` 팔레트만 사용한다.
 * - 모든 동적 텍스트·속성 값에 XML/XSS 이스케이프를 적용한다.
 * - 자연스러운 한국어 촬영·웹툰 실무 어휘로 브리프를 작성한다.
 */

import {
  GOLDEN_RATIO_MAJOR,
  GOLDEN_RATIO_MINOR,
  RULE_OF_THIRDS_MAJOR,
  RULE_OF_THIRDS_MINOR,
  flattenJointLandmarks,
} from "./shot-framing-auditor-core";
import {
  BOKEH_GRADE_LABELS_KO,
  FRAMING_DEFECT_LABELS_KO,
  GAZE_DIRECTION_LABELS_KO,
  JOINT_LABELS_KO,
  SAFE_CUT_ZONE_LABELS_KO,
  type DepthOfFieldResult,
  type FocalBackgroundCompressionResult,
  type GazeDirection,
  type NormalizedCropRect,
  type SafeCutZoneKind,
  type ShotFramingAuditResult,
  type ShotFramingPanelInput,
  type ShotFramingSvgOptions,
  type ShotReframeOutcome,
} from "./shot-framing-types";

const OKLCH_PALETTE = {
  canvasBg: "oklch(0.985 0.006 90)",
  headerBg: "oklch(0.955 0.012 155)",
  cardBg: "oklch(0.996 0.003 90)",
  frameBg: "oklch(0.975 0.007 95)",
  borderStrong: "oklch(0.26 0.044 160)",
  borderSoft: "oklch(0.84 0.014 90)",
  textPrimary: "oklch(0.2 0.028 160)",
  textMuted: "oklch(0.45 0.024 160)",
  textInverse: "oklch(0.985 0.004 90)",
  jointDangerBand: "oklch(0.58 0.21 25 / 0.16)",
  jointDangerStroke: "oklch(0.52 0.22 25)",
  safeZoneStroke: "oklch(0.46 0.13 160)",
  safeZoneLabelBg: "oklch(0.94 0.035 158)",
  thirdsGrid: "oklch(0.36 0.06 235 / 0.52)",
  goldenGrid: "oklch(0.58 0.15 78 / 0.65)",
  goldenSpiral: "oklch(0.54 0.16 70 / 0.82)",
  originalCropStroke: "oklch(0.54 0.2 32)",
  originalCropFill: "oklch(0.6 0.17 32 / 0.06)",
  reframeCropStroke: "oklch(0.36 0.13 158)",
  reframeCropFill: "oklch(0.45 0.13 158 / 0.07)",
  eyeMarkerFill: "oklch(0.34 0.14 250)",
  gazeArrowStroke: "oklch(0.42 0.14 245)",
  dofTrackBg: "oklch(0.93 0.01 95)",
  dofSharpZone: "oklch(0.48 0.14 160 / 0.35)",
  dofSharpStroke: "oklch(0.38 0.13 160)",
  dofFocusPin: "oklch(0.3 0.06 160)",
  dofHyperfocalPin: "oklch(0.52 0.15 70)",
  dofBackgroundPin: "oklch(0.52 0.19 25)",
  badgeOkBg: "oklch(0.93 0.04 155)",
  badgeOkText: "oklch(0.34 0.1 158)",
  badgeWarnBg: "oklch(0.94 0.055 78)",
  badgeWarnText: "oklch(0.43 0.13 68)",
  badgeBlockerBg: "oklch(0.92 0.06 25)",
  badgeBlockerText: "oklch(0.42 0.18 25)",
} as const;

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function truncateText(raw: string, maxChars: number): string {
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, Math.max(1, maxChars - 1))}…`;
}

/**
 * SVG/XML 문자열의 `<`, `>`, `&`, `"`, `'` 문자를 완전 이스케이프한다.
 */
export function escapeShotFramingXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function scoreBadgeColors(audit: ShotFramingAuditResult): {
  readonly bg: string;
  readonly text: string;
} {
  if (audit.blockerCount > 0 || audit.framingScore < 55) {
    return { bg: OKLCH_PALETTE.badgeBlockerBg, text: OKLCH_PALETTE.badgeBlockerText };
  }
  if (audit.defects.length > 0 || audit.framingScore < 80) {
    return { bg: OKLCH_PALETTE.badgeWarnBg, text: OKLCH_PALETTE.badgeWarnText };
  }
  return { bg: OKLCH_PALETTE.badgeOkBg, text: OKLCH_PALETTE.badgeOkText };
}

/**
 * 지정된 사각형 내부에 시선 방향에 맞춘 피보나치 황금나선(6개 사분원 호 근사) SVG 경로를 생성한다.
 */
export function buildGoldenSpiralSvgPath(
  rectX: number,
  rectY: number,
  rectW: number,
  rectH: number,
  gazeDirection: GazeDirection,
): string {
  const focusX =
    gazeDirection === "left"
      ? rectX + rectW * GOLDEN_RATIO_MAJOR
      : rectX + rectW * GOLDEN_RATIO_MINOR;
  const focusY = rectY + rectH * GOLDEN_RATIO_MINOR;

  const scaleX = rectW * 0.48;
  const scaleY = rectH * 0.48;
  const flipX = gazeDirection === "left" ? -1 : 1;

  // 로그 나선 r(theta) = r0 * phi^(-2 * theta / pi) 샘플링으로 부드러운 폴리라인-베지어 경로 생성
  const steps = 28;
  const maxTheta = Math.PI * 2.5;
  const segments: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const theta = t * maxTheta;
    const decay = Math.pow(0.618034, (theta / (Math.PI * 0.5)) * 0.72);
    const px = focusX + flipX * Math.cos(theta) * scaleX * decay;
    const py = focusY + Math.sin(theta) * scaleY * decay;
    segments.push(`${i === 0 ? "M" : "L"} ${fmt(px)} ${fmt(py)}`);
  }
  return segments.join(" ");
}

function mapCropToSvgRect(
  crop: NormalizedCropRect,
  frameX: number,
  frameY: number,
  frameW: number,
  frameH: number,
): { readonly x: number; readonly y: number; readonly w: number; readonly h: number } {
  return {
    x: frameX + crop.x * frameW,
    y: frameY + crop.y * frameH,
    w: crop.width * frameW,
    h: crop.height * frameH,
  };
}

function renderDofComparisonBar(params: {
  readonly dof: DepthOfFieldResult;
  readonly compression?: FocalBackgroundCompressionResult;
  readonly barX: number;
  readonly barY: number;
  readonly barW: number;
  readonly barH: number;
}): string[] {
  const { dof, compression, barX, barY, barW, barH } = params;
  const out: string[] = [];
  const trackX = barX + 16;
  const trackY = barY + 46;
  const trackW = barW - 32;
  const trackH = 18;

  const finiteCandidates: number[] = [dof.focusDistanceM * 2.2, dof.hyperfocalDistanceM * 1.15];
  if (Number.isFinite(dof.farFocusLimitM)) {
    finiteCandidates.push(dof.farFocusLimitM * 1.2);
  }
  if (Number.isFinite(dof.sampleBackgroundDistanceM)) {
    finiteCandidates.push(dof.sampleBackgroundDistanceM * 1.12);
  }
  const maxScaleM = Math.max(2, ...finiteCandidates);
  const toX = (distM: number): number => {
    if (!Number.isFinite(distM)) return trackX + trackW;
    const ratio = Math.max(0, Math.min(1, distM / maxScaleM));
    return trackX + ratio * trackW;
  };

  const nearX = toX(dof.nearFocusLimitM);
  const focusX = toX(dof.focusDistanceM);
  const farX = dof.isFarLimitInfinite ? trackX + trackW : toX(dof.farFocusLimitM);
  const hyperX = toX(dof.hyperfocalDistanceM);
  const bgX = toX(dof.sampleBackgroundDistanceM);

  const farLabel = dof.isFarLimitInfinite ? "∞" : `${fmt(dof.farFocusLimitM)}m`;
  const dofSpanLabel = dof.isFarLimitInfinite ? "무한대" : `${fmt(dof.totalDofM)}m`;
  const compText = compression
    ? ` · 배경압축 ${fmt(compression.backgroundCompressionRatio)}x (기준 ${fmt(compression.referenceFocalLengthMm)}mm)`
    : "";

  out.push(
    `<g data-layer="dof-bar">`,
    `<rect x="${fmt(barX)}" y="${fmt(barY)}" width="${fmt(barW)}" height="${fmt(barH)}" rx="10" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.2" />`,
    `<text x="${fmt(barX + 16)}" y="${fmt(barY + 21)}" font-size="11.5" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${escapeShotFramingXml(`광학 피사계 심도(DoF) 구간 · ${fmt(dof.focalLengthMm)}mm f/${fmt(dof.fNumber)} · CoC ${fmt(dof.cocMm)}mm${compText}`)}</text>`,
    `<text x="${fmt(barX + barW - 16)}" y="${fmt(barY + 21)}" text-anchor="end" font-size="10.5" font-weight="600" fill="${OKLCH_PALETTE.textMuted}">${escapeShotFramingXml(`총 심도 ${dofSpanLabel} · ${BOKEH_GRADE_LABELS_KO[dof.bokehSeparationGrade]}`)}</text>`,
    `<rect x="${fmt(trackX)}" y="${fmt(trackY)}" width="${fmt(trackW)}" height="${fmt(trackH)}" rx="6" fill="${OKLCH_PALETTE.dofTrackBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
    `<rect x="${fmt(nearX)}" y="${fmt(trackY)}" width="${fmt(Math.max(3, farX - nearX))}" height="${fmt(trackH)}" rx="4" fill="${OKLCH_PALETTE.dofSharpZone}" stroke="${OKLCH_PALETTE.dofSharpStroke}" stroke-width="1.4" />`,
    `<line x1="${fmt(focusX)}" y1="${fmt(trackY - 6)}" x2="${fmt(focusX)}" y2="${fmt(trackY + trackH + 6)}" stroke="${OKLCH_PALETTE.dofFocusPin}" stroke-width="2.2" />`,
    `<circle cx="${fmt(focusX)}" cy="${fmt(trackY + trackH * 0.5)}" r="4" fill="${OKLCH_PALETTE.dofFocusPin}" />`,
    `<line x1="${fmt(hyperX)}" y1="${fmt(trackY - 3)}" x2="${fmt(hyperX)}" y2="${fmt(trackY + trackH + 3)}" stroke="${OKLCH_PALETTE.dofHyperfocalPin}" stroke-width="1.4" stroke-dasharray="3 2" />`,
    `<circle cx="${fmt(bgX)}" cy="${fmt(trackY + trackH * 0.5)}" r="4.5" fill="${OKLCH_PALETTE.dofBackgroundPin}" />`,
    `<text x="${fmt(trackX)}" y="${fmt(barY + 84)}" font-size="9.5" fill="${OKLCH_PALETTE.textMuted}">${escapeShotFramingXml(`근한계 Dn ${fmt(dof.nearFocusLimitM)}m · 초점 S ${fmt(dof.focusDistanceM)}m · 원한계 Df ${farLabel} · 과초점 H ${fmt(dof.hyperfocalDistanceM)}m`)}</text>`,
    `<text x="${fmt(barX + barW - 16)}" y="${fmt(barY + 84)}" text-anchor="end" font-size="9.5" fill="${OKLCH_PALETTE.dofBackgroundPin}">${escapeShotFramingXml(`배경 착란원 ${fmt(dof.blurCircleMm)}mm (${fmt(dof.blurRelativeToCoc)}x CoC)`)}</text>`,
    `</g>`,
  );
  return out;
}

/**
 * 삼분할 격자·황금비 교점·황금나선, 인체 관절 금지대(붉은 경고 띠) vs 안전 절단대,
 * 원본 vs 리프레임 크롭 박스, 하단 DoF 초점 구간 바를 순수 `oklch(...)` SVG로 렌더링한다.
 */
export function renderShotFramingAuditSvg(
  panel: ShotFramingPanelInput,
  audit: ShotFramingAuditResult,
  options: ShotFramingSvgOptions = {},
): string {
  const widthPx = Math.max(640, Math.round(options.widthPx ?? 860));
  const showDofBar = options.showDofBar !== false && options.dof !== undefined;
  const heightPx = Math.max(showDofBar ? 580 : 460, Math.round(options.heightPx ?? (showDofBar ? 620 : 500)));
  const showGoldenSpiral = options.showGoldenSpiral !== false;
  const showSafeCutZones = options.showSafeCutZones !== false;

  const headerH = 54;
  const pad = 18;
  const dofBarH = showDofBar ? 100 : 0;
  const bodyTop = headerH + 14;
  const bodyH = heightPx - bodyTop - dofBarH - (showDofBar ? 26 : 16);

  const frameW = Math.round((widthPx - pad * 3) * 0.58);
  const frameH = bodyH;
  const frameX = pad;
  const frameY = bodyTop;

  const cardX = frameX + frameW + pad;
  const cardY = bodyTop;
  const cardW = widthPx - cardX - pad;
  const cardH = bodyH;

  const activeAudit = options.reframe ? options.reframe.afterAudit : audit;
  const activeCrop = options.reframe ? options.reframe.reframedCrop : audit.crop;
  const badge = scoreBadgeColors(activeAudit);

  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(widthPx)} ${fmt(heightPx)}" width="${fmt(widthPx)}" height="${fmt(heightPx)}" role="img" aria-label="${escapeShotFramingXml(`${panel.panelId} 샷 프레이밍 감사 도표`)}">`,
    `<rect x="0" y="0" width="${fmt(widthPx)}" height="${fmt(heightPx)}" rx="14" fill="${OKLCH_PALETTE.canvasBg}" />`,
    `<rect x="0" y="0" width="${fmt(widthPx)}" height="${fmt(headerH)}" rx="14" fill="${OKLCH_PALETTE.headerBg}" />`,
    `<text x="${fmt(pad)}" y="24" font-size="14" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${escapeShotFramingXml(`${panel.panelId} · ${truncateText(panel.titleKo, 34)}`)}</text>`,
    `<text x="${fmt(pad)}" y="42" font-size="10.5" fill="${OKLCH_PALETTE.textMuted}">${escapeShotFramingXml(`시선 ${GAZE_DIRECTION_LABELS_KO[panel.subject.gazeDirection]} · 교점 ${activeAudit.nearestPowerPoint.id} · 지문 ${activeAudit.framingManifestSha256Hex.slice(0, 12)}`)}</text>`,
    `<rect x="${fmt(widthPx - 122)}" y="12" width="104" height="30" rx="15" fill="${badge.bg}" />`,
    `<text x="${fmt(widthPx - 70)}" y="31" text-anchor="middle" font-size="12" font-weight="700" fill="${badge.text}">${escapeShotFramingXml(`${fmt(activeAudit.framingScore)}점 · ${activeAudit.grade}`)}</text>`,
  ];

  // 마스터 프레임 배경
  out.push(
    `<g data-layer="master-frame">`,
    `<rect x="${fmt(frameX)}" y="${fmt(frameY)}" width="${fmt(frameW)}" height="${fmt(frameH)}" rx="8" fill="${OKLCH_PALETTE.frameBg}" stroke="${OKLCH_PALETTE.borderStrong}" stroke-width="1.4" />`,
  );

  // 관절 절단 금지대(붉은 경고 띠)
  const joints = flattenJointLandmarks(panel.subject.joints);
  const bandHalfH = Math.max(6, frameH * 0.032);
  out.push(`<g data-layer="joint-danger-bands">`);
  const drawnBandYs = new Set<string>();
  for (let i = 0; i < joints.length; i += 1) {
    const joint = joints[i];
    if (!joint) continue;
    const jx = frameX + joint.point.x * frameW;
    const jy = frameY + joint.point.y * frameH;
    const bandKey = `${joint.kind}:${Math.round(jy)}`;
    if (!drawnBandYs.has(bandKey)) {
      drawnBandYs.add(bandKey);
      out.push(
        `<rect x="${fmt(frameX + 2)}" y="${fmt(Math.max(frameY, jy - bandHalfH))}" width="${fmt(frameW - 4)}" height="${fmt(bandHalfH * 2)}" fill="${OKLCH_PALETTE.jointDangerBand}" data-joint-band="${escapeShotFramingXml(joint.kind)}" />`,
      );
    }
    out.push(
      `<circle cx="${fmt(jx)}" cy="${fmt(jy)}" r="4" fill="${OKLCH_PALETTE.jointDangerStroke}" data-joint-kind="${escapeShotFramingXml(joint.kind)}" />`,
    );
  }
  out.push(`</g>`);

  // 안전 절단 중간대(가슴·허리·허벅지 중간·정강이 중간)
  if (showSafeCutZones) {
    const safeKeys: readonly SafeCutZoneKind[] = ["chest", "waist", "mid-thigh", "mid-shin"];
    out.push(`<g data-layer="safe-cut-zones">`);
    for (let i = 0; i < safeKeys.length; i += 1) {
      const key = safeKeys[i];
      if (!key) continue;
      const sy = frameY + audit.resolvedSafeCutZones[key] * frameH;
      out.push(
        `<line x1="${fmt(frameX + 4)}" y1="${fmt(sy)}" x2="${fmt(frameX + frameW - 4)}" y2="${fmt(sy)}" stroke="${OKLCH_PALETTE.safeZoneStroke}" stroke-width="1.1" stroke-dasharray="5 4" />`,
        `<rect x="${fmt(frameX + 8)}" y="${fmt(sy - 9)}" width="62" height="15" rx="4" fill="${OKLCH_PALETTE.safeZoneLabelBg}" />`,
        `<text x="${fmt(frameX + 12)}" y="${fmt(sy + 2)}" font-size="8.5" font-weight="600" fill="${OKLCH_PALETTE.safeZoneStroke}">${escapeShotFramingXml(SAFE_CUT_ZONE_LABELS_KO[key])}</text>`,
      );
    }
    out.push(`</g>`);
  }

  // 원본 크롭 박스
  const origBox = mapCropToSvgRect(audit.crop, frameX, frameY, frameW, frameH);
  out.push(
    `<g data-layer="crop-boxes">`,
    `<rect x="${fmt(origBox.x)}" y="${fmt(origBox.y)}" width="${fmt(origBox.w)}" height="${fmt(origBox.h)}" fill="${OKLCH_PALETTE.originalCropFill}" stroke="${OKLCH_PALETTE.originalCropStroke}" stroke-width="2" stroke-dasharray="6 4" data-crop-role="original" />`,
  );

  // 리프레임 크롭 박스
  const activeBox = mapCropToSvgRect(activeCrop, frameX, frameY, frameW, frameH);
  if (options.reframe) {
    out.push(
      `<rect x="${fmt(activeBox.x)}" y="${fmt(activeBox.y)}" width="${fmt(activeBox.w)}" height="${fmt(activeBox.h)}" fill="${OKLCH_PALETTE.reframeCropFill}" stroke="${OKLCH_PALETTE.reframeCropStroke}" stroke-width="2.4" data-crop-role="reframed" />`,
    );
  }
  out.push(`</g>`);

  // 활성 크롭 기준 삼분할 격자·황금비 교점·황금나선
  const tX1 = activeBox.x + activeBox.w * RULE_OF_THIRDS_MINOR;
  const tX2 = activeBox.x + activeBox.w * RULE_OF_THIRDS_MAJOR;
  const tY1 = activeBox.y + activeBox.h * RULE_OF_THIRDS_MINOR;
  const tY2 = activeBox.y + activeBox.h * RULE_OF_THIRDS_MAJOR;

  const gX1 = activeBox.x + activeBox.w * GOLDEN_RATIO_MINOR;
  const gX2 = activeBox.x + activeBox.w * GOLDEN_RATIO_MAJOR;
  const gY1 = activeBox.y + activeBox.h * GOLDEN_RATIO_MINOR;
  const gY2 = activeBox.y + activeBox.h * GOLDEN_RATIO_MAJOR;

  out.push(
    `<g data-layer="composition-grids">`,
    `<line x1="${fmt(tX1)}" y1="${fmt(activeBox.y)}" x2="${fmt(tX1)}" y2="${fmt(activeBox.y + activeBox.h)}" stroke="${OKLCH_PALETTE.thirdsGrid}" stroke-width="1" stroke-dasharray="4 3" />`,
    `<line x1="${fmt(tX2)}" y1="${fmt(activeBox.y)}" x2="${fmt(tX2)}" y2="${fmt(activeBox.y + activeBox.h)}" stroke="${OKLCH_PALETTE.thirdsGrid}" stroke-width="1" stroke-dasharray="4 3" />`,
    `<line x1="${fmt(activeBox.x)}" y1="${fmt(tY1)}" x2="${fmt(activeBox.x + activeBox.w)}" y2="${fmt(tY1)}" stroke="${OKLCH_PALETTE.thirdsGrid}" stroke-width="1" stroke-dasharray="4 3" />`,
    `<line x1="${fmt(activeBox.x)}" y1="${fmt(tY2)}" x2="${fmt(activeBox.x + activeBox.w)}" y2="${fmt(tY2)}" stroke="${OKLCH_PALETTE.thirdsGrid}" stroke-width="1" stroke-dasharray="4 3" />`,
    `<circle cx="${fmt(tX1)}" cy="${fmt(tY1)}" r="4.2" fill="none" stroke="${OKLCH_PALETTE.thirdsGrid}" stroke-width="1.5" />`,
    `<circle cx="${fmt(tX2)}" cy="${fmt(tY1)}" r="4.2" fill="none" stroke="${OKLCH_PALETTE.thirdsGrid}" stroke-width="1.5" />`,
    `<circle cx="${fmt(tX1)}" cy="${fmt(tY2)}" r="4.2" fill="none" stroke="${OKLCH_PALETTE.thirdsGrid}" stroke-width="1.5" />`,
    `<circle cx="${fmt(tX2)}" cy="${fmt(tY2)}" r="4.2" fill="none" stroke="${OKLCH_PALETTE.thirdsGrid}" stroke-width="1.5" />`,
    `<line x1="${fmt(gX1)}" y1="${fmt(activeBox.y)}" x2="${fmt(gX1)}" y2="${fmt(activeBox.y + activeBox.h)}" stroke="${OKLCH_PALETTE.goldenGrid}" stroke-width="0.9" stroke-dasharray="2 3" />`,
    `<line x1="${fmt(gX2)}" y1="${fmt(activeBox.y)}" x2="${fmt(gX2)}" y2="${fmt(activeBox.y + activeBox.h)}" stroke="${OKLCH_PALETTE.goldenGrid}" stroke-width="0.9" stroke-dasharray="2 3" />`,
    `<line x1="${fmt(activeBox.x)}" y1="${fmt(gY1)}" x2="${fmt(activeBox.x + activeBox.w)}" y2="${fmt(gY1)}" stroke="${OKLCH_PALETTE.goldenGrid}" stroke-width="0.9" stroke-dasharray="2 3" />`,
    `<line x1="${fmt(activeBox.x)}" y1="${fmt(gY2)}" x2="${fmt(activeBox.x + activeBox.w)}" y2="${fmt(gY2)}" stroke="${OKLCH_PALETTE.goldenGrid}" stroke-width="0.9" stroke-dasharray="2 3" />`,
  );

  if (showGoldenSpiral) {
    const spiralPath = buildGoldenSpiralSvgPath(
      activeBox.x,
      activeBox.y,
      activeBox.w,
      activeBox.h,
      panel.subject.gazeDirection,
    );
    out.push(
      `<path d="${spiralPath}" fill="none" stroke="${OKLCH_PALETTE.goldenSpiral}" stroke-width="1.5" data-layer="golden-spiral" />`,
    );
  }
  out.push(`</g>`);

  // 정수리·눈 초점 및 시선 방향 화살표
  const eyeSvgX = frameX + panel.subject.eyeCenter.x * frameW;
  const eyeSvgY = frameY + panel.subject.eyeCenter.y * frameH;
  const crownSvgY = frameY + panel.subject.crownY * frameH;
  const gazeDx =
    panel.subject.gazeDirection === "right" ? 36 : panel.subject.gazeDirection === "left" ? -36 : 0;

  out.push(
    `<g data-layer="subject-focus">`,
    `<line x1="${fmt(eyeSvgX - 18)}" y1="${fmt(crownSvgY)}" x2="${fmt(eyeSvgX + 18)}" y2="${fmt(crownSvgY)}" stroke="${OKLCH_PALETTE.borderStrong}" stroke-width="1.6" />`,
    `<circle cx="${fmt(eyeSvgX)}" cy="${fmt(eyeSvgY)}" r="5.5" fill="${OKLCH_PALETTE.eyeMarkerFill}" stroke="${OKLCH_PALETTE.textInverse}" stroke-width="1.5" />`,
  );
  if (gazeDx !== 0) {
    out.push(
      `<line x1="${fmt(eyeSvgX)}" y1="${fmt(eyeSvgY)}" x2="${fmt(eyeSvgX + gazeDx)}" y2="${fmt(eyeSvgY)}" stroke="${OKLCH_PALETTE.gazeArrowStroke}" stroke-width="2.2" />`,
    );
  }
  out.push(`</g></g>`);

  // 우측 QA 지표 카드
  out.push(
    `<g data-layer="qa-summary-card">`,
    `<rect x="${fmt(cardX)}" y="${fmt(cardY)}" width="${fmt(cardW)}" height="${fmt(cardH)}" rx="10" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.2" />`,
    `<text x="${fmt(cardX + 14)}" y="${fmt(cardY + 24)}" font-size="12" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">촬영 구도 감사 지표</text>`,
    `<text x="${fmt(cardX + 14)}" y="${fmt(cardY + 46)}" font-size="10.5" fill="${OKLCH_PALETTE.textMuted}">${escapeShotFramingXml(`헤드룸: ${fmt(activeAudit.headroomRatio * 100)}%`)}</text>`,
    `<text x="${fmt(cardX + 14)}" y="${fmt(cardY + 64)}" font-size="10.5" fill="${OKLCH_PALETTE.textMuted}">${escapeShotFramingXml(`리드룸 / 뒤여백: ${fmt(activeAudit.leadRoomRatio * 100)}% / ${fmt(activeAudit.backRoomRatio * 100)}%`)}</text>`,
    `<text x="${fmt(cardX + 14)}" y="${fmt(cardY + 82)}" font-size="10.5" fill="${OKLCH_PALETTE.textMuted}">${escapeShotFramingXml(`교점 정렬 점수: ${fmt(activeAudit.powerPointAlignmentScore)}점`)}</text>`,
    `<text x="${fmt(cardX + 14)}" y="${fmt(cardY + 100)}" font-size="10.5" fill="${activeAudit.blockerCount > 0 ? OKLCH_PALETTE.badgeBlockerText : OKLCH_PALETTE.badgeOkText}">${escapeShotFramingXml(`관절 절단 블로커: ${activeAudit.jointCropViolations.length}건 · 총 결함 ${activeAudit.defects.length}건`)}</text>`,
  );

  let cursorY = cardY + 126;
  if (options.reframe) {
    out.push(
      `<line x1="${fmt(cardX + 14)}" y1="${fmt(cursorY - 12)}" x2="${fmt(cardX + cardW - 14)}" y2="${fmt(cursorY - 12)}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
      `<text x="${fmt(cardX + 14)}" y="${fmt(cursorY + 4)}" font-size="11" font-weight="700" fill="${OKLCH_PALETTE.reframeCropStroke}">${escapeShotFramingXml(`리프레임 결과: ${fmt(options.reframe.beforeAudit.framingScore)}점 → ${fmt(options.reframe.afterAudit.framingScore)}점 (${options.reframe.scoreDelta >= 0 ? "+" : ""}${fmt(options.reframe.scoreDelta)})`)}</text>`,
    );
    cursorY += 24;
  }

  const notes =
    activeAudit.defects.length > 0
      ? activeAudit.defects.slice(0, 4).map((d) => `[${FRAMING_DEFECT_LABELS_KO[d.code]}] ${d.messageKo}`)
      : options.reframe
        ? options.reframe.rationaleKo.slice(0, 4)
        : ["관절 절단·헤드룸·리드룸·교점 정렬 기준을 모두 충족했습니다."];

  for (let i = 0; i < notes.length; i += 1) {
    const line = notes[i];
    if (!line || cursorY > cardY + cardH - 18) break;
    out.push(
      `<text x="${fmt(cardX + 14)}" y="${fmt(cursorY)}" font-size="9.5" fill="${OKLCH_PALETTE.textPrimary}">${escapeShotFramingXml(`• ${truncateText(line, 44)}`)}</text>`,
    );
    cursorY += 18;
  }
  out.push(`</g>`);

  if (showDofBar && options.dof) {
    const dofLines = renderDofComparisonBar({
      dof: options.dof,
      compression: options.compression,
      barX: pad,
      barY: bodyTop + bodyH + 12,
      barW: widthPx - pad * 2,
      barH: dofBarH,
    });
    for (let i = 0; i < dofLines.length; i += 1) {
      const line = dofLines[i];
      if (line) out.push(line);
    }
  }

  out.push(`</svg>`);
  return out.join("\n");
}

/**
 * 번역투 없이 웹툰·영화 촬영 감독 실무 문체로 샷 프레이밍 QA 요약 브리프를 생성한다.
 */
export function summarizeShotFramingAuditKo(params: {
  readonly panel: ShotFramingPanelInput;
  readonly audit: ShotFramingAuditResult;
  readonly reframe?: ShotReframeOutcome;
  readonly compression?: FocalBackgroundCompressionResult;
  readonly dof?: DepthOfFieldResult;
}): string {
  const { panel, audit, reframe, compression, dof } = params;
  const lines: string[] = [];

  lines.push(`[샷 프레이밍 디렉터 QA] ${panel.panelId} — ${panel.titleKo}`);
  lines.push(
    `- 현재 구도 판정: ${fmt(audit.framingScore)}점 (${audit.grade}등급, ${audit.passed ? "통과" : "수정 필요"}) · 블로커 ${audit.blockerCount}건 · 경고 ${audit.warningCount}건`,
  );
  lines.push(
    `- 핵심 수치: 헤드룸 ${fmt(audit.headroomRatio * 100)}%, 리드룸 ${fmt(audit.leadRoomRatio * 100)}% (뒤여백 ${fmt(audit.backRoomRatio * 100)}%), 교점 정렬 ${fmt(audit.powerPointAlignmentScore)}점 (${audit.nearestPowerPoint.id})`,
  );

  if (audit.exemptionsApplied.length > 0) {
    lines.push(`- 예외 적용: ${audit.exemptionsApplied.join(", ")}`);
  }

  if (audit.defects.length > 0) {
    lines.push("- 검출 결함:");
    for (let i = 0; i < audit.defects.length; i += 1) {
      const d = audit.defects[i];
      if (!d) continue;
      const sevKo = d.severity === "blocker" ? "차단" : "주의";
      const jointSuffix = d.jointDetail ? ` (${JOINT_LABELS_KO[d.jointDetail.jointKind]})` : "";
      lines.push(`  · [${sevKo}] ${FRAMING_DEFECT_LABELS_KO[d.code]}${jointSuffix}: ${d.messageKo}`);
    }
  } else {
    lines.push("- 검출 결함 없음: 관절 안전선, 머리 위 여백, 시선 리드룸이 안정적으로 잡혀 있습니다.");
  }

  if (reframe) {
    lines.push(
      `- 자동 리프레임 결과: ${fmt(reframe.beforeAudit.framingScore)}점 → ${fmt(reframe.afterAudit.framingScore)}점 (${reframe.scoreDelta >= 0 ? "+" : ""}${fmt(reframe.scoreDelta)}점), 관절 절단 해소 ${reframe.jointCropsEliminated}건`,
    );
    for (let i = 0; i < reframe.rationaleKo.length; i += 1) {
      const reason = reframe.rationaleKo[i];
      if (reason) lines.push(`  · ${reason}`);
    }
  }

  if (compression) {
    lines.push(
      `- 렌즈 화각·배경 압축: ${fmt(compression.focalLengthMm)}mm (수평 ${fmt(compression.fov.hfovDeg)}° / 수직 ${fmt(compression.fov.vfovDeg)}°), 피사체 거리 ${fmt(compression.subjectDistanceM)}m, ${fmt(compression.referenceFocalLengthMm)}mm 대비 배경 압축률 ${fmt(compression.backgroundCompressionRatio)}배(면적 ${fmt(compression.backgroundAreaMagnification)}배)`,
    );
  }

  if (dof) {
    const farText = dof.isFarLimitInfinite ? "무한대" : `${fmt(dof.farFocusLimitM)}m`;
    const totalText = dof.isFarLimitInfinite ? "무한대" : `${fmt(dof.totalDofM)}m`;
    lines.push(
      `- 피사계 심도(DoF): f/${fmt(dof.fNumber)} · 과초점 ${fmt(dof.hyperfocalDistanceM)}m · 선명 구간 ${fmt(dof.nearFocusLimitM)}m~${farText} (총 심도 ${totalText}) · 배경 착란원 ${fmt(dof.blurCircleMm)}mm (${BOKEH_GRADE_LABELS_KO[dof.bokehSeparationGrade]})`,
    );
  }

  lines.push(`- 무결성 지문(SHA-256): ${audit.framingManifestSha256Hex}`);
  return lines.join("\n");
}
