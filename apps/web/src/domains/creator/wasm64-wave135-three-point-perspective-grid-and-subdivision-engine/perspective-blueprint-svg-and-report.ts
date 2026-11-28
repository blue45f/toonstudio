/**
 * Wave 135 — 순수 OKLCH 3점 투시 블루프린트 SVG 렌더러 및 한국어 배경 연출 QA 브리프.
 *
 * - SVG 내부 모든 색상은 CSS Color 4 `oklch(...)`만 사용한다(원시 hex/rgb/hsl 전면 금지).
 * - XML/XSS 특수문자(`&`, `<`, `>`, `"`, `'`)를 빠짐없이 이스케이프하고 좌표를 유한수로 고정한다.
 * - 번역투 없는 자연스러운 한국어 배경 연출 QA 요약을 생성한다.
 */

import {
  canonicalizePerspectiveJson,
  computePerspectiveRigFingerprint,
  sha256PerspectiveHex,
  type PerspectiveRigFingerprint,
} from "./perspective-sha256-and-fingerprint";
import type {
  PerspectiveDistortionSeverity,
  ThreePointPerspectiveRig,
  VanishingPoint2D,
  VanishingPointEstimationResult,
  Vec2D,
} from "./perspective-types-and-math";
import type {
  PerspectiveQuad2D,
  PerspectiveStaircaseResult,
  SnappedPerspectiveStrokeResult,
  SubdividedPerspectiveQuadResult,
} from "./projective-subdivision-and-snap";

export {
  canonicalizePerspectiveJson,
  computePerspectiveRigFingerprint,
  sha256PerspectiveHex,
  type PerspectiveRigFingerprint,
};

export interface RenderThreePointPerspectiveSvgInput {
  readonly rig: ThreePointPerspectiveRig;
  readonly subdivision?: SubdividedPerspectiveQuadResult | null;
  readonly staircase?: PerspectiveStaircaseResult | null;
  readonly snappedStroke?: SnappedPerspectiveStrokeResult | null;
  readonly estimation?: VanishingPointEstimationResult | null;
  readonly titleKo?: string;
  readonly guideRayCount?: number;
}

export interface SummarizeThreePointPerspectiveKoInput {
  readonly rig: ThreePointPerspectiveRig;
  readonly subdivision?: SubdividedPerspectiveQuadResult | null;
  readonly staircase?: PerspectiveStaircaseResult | null;
  readonly estimation?: VanishingPointEstimationResult | null;
  readonly snappedStroke?: SnappedPerspectiveStrokeResult | null;
  readonly generatedDateIso?: string;
}

const PERSPECTIVE_SVG_OKLCH = {
  pageBg: "oklch(0.980 0.007 90)",
  cardBg: "oklch(1.000 0.000 0)",
  viewportBg: "oklch(0.992 0.004 92)",
  headerBg: "oklch(0.955 0.010 88)",
  borderSoft: "oklch(0.320 0.036 158 / 0.22)",
  borderStrong: "oklch(0.280 0.048 158 / 0.45)",
  inkPrimary: "oklch(0.230 0.042 158)",
  inkSecondary: "oklch(0.410 0.026 158)",
  inkMuted: "oklch(0.510 0.020 158)",
  vp1Ray: "oklch(0.460 0.120 248 / 0.34)",
  vp1Strong: "oklch(0.400 0.135 248)",
  vp2Ray: "oklch(0.470 0.115 168 / 0.34)",
  vp2Strong: "oklch(0.370 0.125 168)",
  vp3Ray: "oklch(0.540 0.135 42 / 0.30)",
  vp3Strong: "oklch(0.470 0.150 42)",
  horizonStroke: "oklch(0.310 0.078 158)",
  quadFill: "oklch(0.935 0.035 162 / 0.40)",
  quadPaneFill: "oklch(0.890 0.055 240 / 0.42)",
  quadStroke: "oklch(0.280 0.075 158)",
  quadSubStroke: "oklch(0.390 0.070 158 / 0.72)",
  stairTreadFill: "oklch(0.925 0.045 84 / 0.78)",
  stairRiserFill: "oklch(0.840 0.050 64 / 0.85)",
  stairStroke: "oklch(0.310 0.060 54)",
  strokeSnapLine: "oklch(0.510 0.185 26)",
  principalStroke: "oklch(0.350 0.082 158)",
  safeFill: "oklch(0.935 0.045 152)",
  safeStroke: "oklch(0.420 0.115 152)",
  safeText: "oklch(0.250 0.078 152)",
  warnFill: "oklch(0.945 0.065 78)",
  warnStroke: "oklch(0.550 0.145 68)",
  warnText: "oklch(0.320 0.095 62)",
  critFill: "oklch(0.930 0.058 24)",
  critStroke: "oklch(0.520 0.185 26)",
  critText: "oklch(0.310 0.125 26)",
} as const;

const FONT_SANS = "Pretendard, Apple SD Gothic Neo, sans-serif";
const FONT_MONO = "ui-monospace, SFMono-Regular, monospace";

/** XML/XSS 특수문자(`&`, `<`, `>`, `"`, `'`)를 안전하게 이스케이프한다. */
export function escapePerspectiveXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtSvgNum(value: number, fallback = 0): string {
  const safe = Number.isFinite(value) ? Math.round(value * 100) / 100 : fallback;
  return String(safe);
}

function severityBadgeStyle(severity: PerspectiveDistortionSeverity): {
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
  readonly labelKo: string;
} {
  if (severity === "SAFE") {
    return {
      fill: PERSPECTIVE_SVG_OKLCH.safeFill,
      stroke: PERSPECTIVE_SVG_OKLCH.safeStroke,
      text: PERSPECTIVE_SVG_OKLCH.safeText,
      labelKo: "구도 안정 (SAFE)",
    };
  }
  if (severity === "WARN") {
    return {
      fill: PERSPECTIVE_SVG_OKLCH.warnFill,
      stroke: PERSPECTIVE_SVG_OKLCH.warnStroke,
      text: PERSPECTIVE_SVG_OKLCH.warnText,
      labelKo: "왜곡 주의 (WARN)",
    };
  }
  return {
    fill: PERSPECTIVE_SVG_OKLCH.critFill,
    stroke: PERSPECTIVE_SVG_OKLCH.critStroke,
    text: PERSPECTIVE_SVG_OKLCH.critText,
    labelKo: "왜곡 위험 (CRITICAL)",
  };
}

function clipSegmentToRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): readonly [number, number, number, number] | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - minX, maxX - x1, y1 - minY, maxY - y1];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i += 1) {
    if (Math.abs(p[i]) < 1e-12) {
      if (q[i] < 0) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
}

function quadPointsSvg(q: PerspectiveQuad2D, mapPt: (p: Vec2D) => Vec2D): string {
  const p0 = mapPt(q.tl);
  const p1 = mapPt(q.tr);
  const p2 = mapPt(q.br);
  const p3 = mapPt(q.bl);
  return `${fmtSvgNum(p0.x)},${fmtSvgNum(p0.y)} ${fmtSvgNum(p1.x)},${fmtSvgNum(p1.y)} ${fmtSvgNum(p2.x)},${fmtSvgNum(p2.y)} ${fmtSvgNum(p3.x)},${fmtSvgNum(p3.y)}`;
}

function renderVpGuideRays(
  vp: VanishingPoint2D,
  strokeColor: string,
  vpBadgeColor: string,
  vpX: number,
  vpY: number,
  vpW: number,
  vpH: number,
  scaleX: number,
  scaleY: number,
  rayCount: number,
): readonly string[] {
  const out: string[] = [];
  const maxX = vpX + vpW;
  const maxY = vpY + vpH;

  if (vp.isFinite) {
    const mappedVpX = vpX + vp.x * scaleX;
    const mappedVpY = vpY + vp.y * scaleY;
    for (let i = 0; i <= rayCount; i += 1) {
      const t = i / rayCount;
      const targets: readonly Vec2D[] = [
        { x: vpX + t * vpW, y: vpY },
        { x: vpX + t * vpW, y: maxY },
        { x: vpX, y: vpY + t * vpH },
        { x: maxX, y: vpY + t * vpH },
      ];
      for (let k = 0; k < targets.length; k += 1) {
        if ((i + k) % 2 !== 0) continue;
        const c = clipSegmentToRect(
          mappedVpX,
          mappedVpY,
          targets[k].x,
          targets[k].y,
          vpX,
          vpY,
          maxX,
          maxY,
        );
        if (c) {
          out.push(
            `    <line x1="${fmtSvgNum(c[0])}" y1="${fmtSvgNum(c[1])}" x2="${fmtSvgNum(c[2])}" y2="${fmtSvgNum(c[3])}" stroke="${strokeColor}" stroke-width="0.9" />`,
          );
        }
      }
    }
    const clampedX = Math.max(vpX + 12, Math.min(maxX - 12, mappedVpX));
    const clampedY = Math.max(vpY + 12, Math.min(maxY - 12, mappedVpY));
    const isInside = mappedVpX >= vpX && mappedVpX <= maxX && mappedVpY >= vpY && mappedVpY <= maxY;
    out.push(
      `    <circle cx="${fmtSvgNum(clampedX)}" cy="${fmtSvgNum(clampedY)}" r="${isInside ? "5.5" : "4.5"}" fill="${vpBadgeColor}" stroke="${PERSPECTIVE_SVG_OKLCH.cardBg}" stroke-width="1.5" />`,
    );
    out.push(
      `    <text x="${fmtSvgNum(clampedX + 8)}" y="${fmtSvgNum(clampedY + 4)}" font-family="${FONT_MONO}" font-size="10" font-weight="700" fill="${vpBadgeColor}">${escapePerspectiveXml(vp.id)}${isInside ? "" : "→"}</text>`,
    );
  } else {
    const dir = vp.direction2d;
    const norm = { x: -dir.y, y: dir.x };
    const cx = vpX + vpW * 0.5;
    const cy = vpY + vpH * 0.5;
    const diag = Math.hypot(vpW, vpH);
    for (let i = -3; i <= 3; i += 1) {
      const off = (i / 3.5) * (diag * 0.5);
      const px = cx + norm.x * off;
      const py = cy + norm.y * off;
      const c = clipSegmentToRect(
        px - dir.x * diag,
        py - dir.y * diag,
        px + dir.x * diag,
        py + dir.y * diag,
        vpX,
        vpY,
        maxX,
        maxY,
      );
      if (c) {
        out.push(
          `    <line x1="${fmtSvgNum(c[0])}" y1="${fmtSvgNum(c[1])}" x2="${fmtSvgNum(c[2])}" y2="${fmtSvgNum(c[3])}" stroke="${strokeColor}" stroke-width="0.9" stroke-dasharray="4 3" />`,
        );
      }
    }
  }
  return out;
}

/**
 * 지평선·3점 소실점 가이드·등분할 건축 창문·원근 계단·왜곡 위험 배지를
 * 순수 `oklch(...)` SVG 블루프린트로 렌더링한다.
 */
export function renderThreePointPerspectiveSvg(
  input: RenderThreePointPerspectiveSvgInput,
): string {
  const { rig, subdivision, staircase, snappedStroke, estimation } = input;
  const fingerprint = computePerspectiveRigFingerprint(rig, subdivision, staircase, estimation);
  const titleKo = input.titleKo ?? "3점 투시 자동 그리드 · 사영 등분할 블루프린트";
  const rayCount = Math.max(4, Math.min(12, Math.round(input.guideRayCount ?? 6)));

  const svgW = 960;
  const svgH = 620;
  const vpX = 28;
  const vpY = 82;
  const vpW = 636;
  const vpH = 424;
  const scaleX = vpW / rig.canvasWidth;
  const scaleY = vpH / rig.canvasHeight;
  const mapPt = (p: Vec2D): Vec2D => ({ x: vpX + p.x * scaleX, y: vpY + p.y * scaleY });

  const badge = severityBadgeStyle(rig.distortionSeverity);
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(svgW)} ${String(svgH)}" width="${String(svgW)}" height="${String(svgH)}" role="img" aria-label="${escapePerspectiveXml(titleKo)}">`,
    `  <rect x="0" y="0" width="${String(svgW)}" height="${String(svgH)}" fill="${PERSPECTIVE_SVG_OKLCH.pageBg}" />`,
    `  <rect x="16" y="14" width="${String(svgW - 32)}" height="54" rx="12" fill="${PERSPECTIVE_SVG_OKLCH.headerBg}" stroke="${PERSPECTIVE_SVG_OKLCH.borderSoft}" stroke-width="1" />`,
    `  <text x="32" y="38" font-family="${FONT_SANS}" font-size="16" font-weight="700" fill="${PERSPECTIVE_SVG_OKLCH.inkPrimary}">${escapePerspectiveXml(titleKo)}</text>`,
    `  <text x="32" y="56" font-family="${FONT_MONO}" font-size="10.5" fill="${PERSPECTIVE_SVG_OKLCH.inkSecondary}">${escapePerspectiveXml(rig.mode)} · ${rig.focalLengthMm.toFixed(1)}mm (FOV ${rig.horizontalFovDeg.toFixed(1)}°) · Yaw ${rig.yawDeg.toFixed(1)}° · Pitch ${rig.pitchDeg.toFixed(1)}° · Roll ${rig.rollDeg.toFixed(1)}°</text>`,
    `  <rect x="760" y="25" width="168" height="32" rx="16" fill="${badge.fill}" stroke="${badge.stroke}" stroke-width="1.2" />`,
    `  <text x="844" y="45" text-anchor="middle" font-family="${FONT_SANS}" font-size="11.5" font-weight="700" fill="${badge.text}">${escapePerspectiveXml(badge.labelKo)}</text>`,
    `  <rect x="${String(vpX)}" y="${String(vpY)}" width="${String(vpW)}" height="${String(vpH)}" rx="10" fill="${PERSPECTIVE_SVG_OKLCH.viewportBg}" stroke="${PERSPECTIVE_SVG_OKLCH.borderStrong}" stroke-width="1.2" />`,
    `  <g data-layer="perspective-rays">`,
    ...renderVpGuideRays(
      rig.vp1,
      PERSPECTIVE_SVG_OKLCH.vp1Ray,
      PERSPECTIVE_SVG_OKLCH.vp1Strong,
      vpX,
      vpY,
      vpW,
      vpH,
      scaleX,
      scaleY,
      rayCount,
    ),
    ...renderVpGuideRays(
      rig.vp2,
      PERSPECTIVE_SVG_OKLCH.vp2Ray,
      PERSPECTIVE_SVG_OKLCH.vp2Strong,
      vpX,
      vpY,
      vpW,
      vpH,
      scaleX,
      scaleY,
      rayCount,
    ),
    ...renderVpGuideRays(
      rig.vp3,
      PERSPECTIVE_SVG_OKLCH.vp3Ray,
      PERSPECTIVE_SVG_OKLCH.vp3Strong,
      vpX,
      vpY,
      vpW,
      vpH,
      scaleX,
      scaleY,
      rayCount,
    ),
    `  </g>`,
  ];

  if (!rig.horizonLine.isAtInfinity) {
    const h = rig.horizonLine;
    const span = Math.max(rig.canvasWidth, rig.canvasHeight) * 4;
    const p0x = -h.a * h.c;
    const p0y = -h.b * h.c;
    const hA = mapPt({ x: p0x - h.b * span, y: p0y + h.a * span });
    const hB = mapPt({ x: p0x + h.b * span, y: p0y - h.a * span });
    const c = clipSegmentToRect(hA.x, hA.y, hB.x, hB.y, vpX, vpY, vpX + vpW, vpY + vpH);
    if (c) {
      lines.push(
        `  <line data-layer="horizon" x1="${fmtSvgNum(c[0])}" y1="${fmtSvgNum(c[1])}" x2="${fmtSvgNum(c[2])}" y2="${fmtSvgNum(c[3])}" stroke="${PERSPECTIVE_SVG_OKLCH.horizonStroke}" stroke-width="1.8" stroke-dasharray="7 4" />`,
      );
    }
  }

  const pp = mapPt(rig.principalPoint);
  lines.push(
    `  <circle cx="${fmtSvgNum(pp.x)}" cy="${fmtSvgNum(pp.y)}" r="5" fill="none" stroke="${PERSPECTIVE_SVG_OKLCH.principalStroke}" stroke-width="1.4" />`,
    `  <line x1="${fmtSvgNum(pp.x - 9)}" y1="${fmtSvgNum(pp.y)}" x2="${fmtSvgNum(pp.x + 9)}" y2="${fmtSvgNum(pp.y)}" stroke="${PERSPECTIVE_SVG_OKLCH.principalStroke}" stroke-width="1.1" />`,
    `  <line x1="${fmtSvgNum(pp.x)}" y1="${fmtSvgNum(pp.y - 9)}" x2="${fmtSvgNum(pp.x)}" y2="${fmtSvgNum(pp.y + 9)}" stroke="${PERSPECTIVE_SVG_OKLCH.principalStroke}" stroke-width="1.1" />`,
  );

  if (subdivision) {
    lines.push(
      `  <g data-layer="projective-subdivision">`,
      `    <polygon points="${quadPointsSvg(subdivision.quad, mapPt)}" fill="${PERSPECTIVE_SVG_OKLCH.quadFill}" stroke="${PERSPECTIVE_SVG_OKLCH.quadStroke}" stroke-width="1.8" />`,
    );
    for (let i = 0; i < subdivision.cells.length; i += 1) {
      const inset = subdivision.cells[i].insetQuad;
      if (inset) {
        lines.push(
          `    <polygon points="${quadPointsSvg(inset, mapPt)}" fill="${PERSPECTIVE_SVG_OKLCH.quadPaneFill}" stroke="${PERSPECTIVE_SVG_OKLCH.quadSubStroke}" stroke-width="0.9" />`,
        );
      }
    }
    const allGridLines = [...subdivision.horizontalLines, ...subdivision.verticalLines];
    for (let i = 0; i < allGridLines.length; i += 1) {
      const a = mapPt(allGridLines[i].start);
      const b = mapPt(allGridLines[i].end);
      lines.push(
        `    <line x1="${fmtSvgNum(a.x)}" y1="${fmtSvgNum(a.y)}" x2="${fmtSvgNum(b.x)}" y2="${fmtSvgNum(b.y)}" stroke="${PERSPECTIVE_SVG_OKLCH.quadSubStroke}" stroke-width="1.1" />`,
      );
    }
    lines.push(`  </g>`);
  }

  if (staircase && staircase.steps.length > 0) {
    lines.push(`  <g data-layer="perspective-staircase">`);
    for (let i = staircase.steps.length - 1; i >= 0; i -= 1) {
      const step = staircase.steps[i];
      lines.push(
        `    <polygon points="${quadPointsSvg(step.treadQuad, mapPt)}" fill="${PERSPECTIVE_SVG_OKLCH.stairTreadFill}" stroke="${PERSPECTIVE_SVG_OKLCH.stairStroke}" stroke-width="1.1" />`,
        `    <polygon points="${quadPointsSvg(step.riserQuad, mapPt)}" fill="${PERSPECTIVE_SVG_OKLCH.stairRiserFill}" stroke="${PERSPECTIVE_SVG_OKLCH.stairStroke}" stroke-width="1.1" />`,
      );
    }
    lines.push(`  </g>`);
  }

  if (snappedStroke && snappedStroke.snappedPoints.length >= 2) {
    const pts = snappedStroke.snappedPoints
      .map((p) => {
        const m = mapPt(p);
        return `${fmtSvgNum(m.x)},${fmtSvgNum(m.y)}`;
      })
      .join(" ");
    lines.push(
      `  <polyline data-layer="snapped-stroke" points="${pts}" fill="none" stroke="${PERSPECTIVE_SVG_OKLCH.strokeSnapLine}" stroke-width="2.4" stroke-linecap="round" />`,
    );
  }

  const panelX = 680;
  lines.push(
    `  <rect x="${String(panelX)}" y="${String(vpY)}" width="264" height="${String(vpH)}" rx="10" fill="${PERSPECTIVE_SVG_OKLCH.cardBg}" stroke="${PERSPECTIVE_SVG_OKLCH.borderSoft}" stroke-width="1" />`,
    `  <text x="${String(panelX + 16)}" y="${String(vpY + 28)}" font-family="${FONT_SANS}" font-size="13" font-weight="700" fill="${PERSPECTIVE_SVG_OKLCH.inkPrimary}">사영 기하 검증 계측</text>`,
  );

  const metricLines: readonly string[] = [
    `수심=주점 오차: ${rig.orthocenterCheck.applicable ? `${rig.orthocenterCheck.errorPx.toFixed(4)}px` : "1·2점 해당없음"}`,
    `지평선 기울기: ${rig.horizonLine.tiltDeg.toFixed(2)}°`,
    `VP1: ${rig.vp1.isFinite ? `${rig.vp1.x.toFixed(0)}, ${rig.vp1.y.toFixed(0)}` : "무한 소실점"}`,
    `VP2: ${rig.vp2.isFinite ? `${rig.vp2.x.toFixed(0)}, ${rig.vp2.y.toFixed(0)}` : "무한 소실점"}`,
    `VP3: ${rig.vp3.isFinite ? `${rig.vp3.x.toFixed(0)}, ${rig.vp3.y.toFixed(0)}` : "무한 소실점"}`,
    subdivision
      ? `등분할: ${String(subdivision.cols)}×${String(subdivision.rows)} (CR ${subdivision.verification.maxCrossRatioError.toExponential(1)})`
      : "등분할 격자: 미지정",
    staircase
      ? `계단: ${String(staircase.stepCount)}단 (${staircase.isForeshorteningMonotonic ? "단조 축소 정상" : "축소 역전 주의"})`
      : "원근 계단: 미지정",
    estimation
      ? `역추정: 인라이어 ${(estimation.inlierRatio * 100).toFixed(1)}% · ${estimation.overallMeanInlierAngleErrorDeg.toFixed(2)}°`
      : "선분 역추정: 미실행",
    `왜곡 경보: ${String(rig.distortionAlerts.length)}건`,
  ];
  for (let i = 0; i < metricLines.length; i += 1) {
    lines.push(
      `  <text x="${String(panelX + 16)}" y="${String(vpY + 56 + i * 28)}" font-family="${FONT_MONO}" font-size="10.2" fill="${PERSPECTIVE_SVG_OKLCH.inkSecondary}">${escapePerspectiveXml(metricLines[i])}</text>`,
    );
  }

  const firstAlert =
    rig.distortionAlerts.length > 0
      ? rig.distortionAlerts[0].messageKo
      : "광각 왜곡·소실점 근접·수심 이탈 경보 없이 안정된 3점 투시 구도입니다.";
  lines.push(
    `  <rect x="16" y="522" width="${String(svgW - 32)}" height="82" rx="10" fill="${PERSPECTIVE_SVG_OKLCH.cardBg}" stroke="${PERSPECTIVE_SVG_OKLCH.borderSoft}" stroke-width="1" />`,
    `  <text x="32" y="548" font-family="${FONT_SANS}" font-size="11.5" font-weight="700" fill="${PERSPECTIVE_SVG_OKLCH.inkPrimary}">투시 리깅 매니페스트 지문 (FIPS 180-4 SHA-256)</text>`,
    `  <text x="32" y="570" font-family="${FONT_MONO}" font-size="10.5" fill="${PERSPECTIVE_SVG_OKLCH.inkSecondary}">${escapePerspectiveXml(fingerprint.sha256Hex)}</text>`,
    `  <text x="32" y="592" font-family="${FONT_SANS}" font-size="11" fill="${PERSPECTIVE_SVG_OKLCH.inkMuted}">${escapePerspectiveXml(firstAlert)}</text>`,
    `</svg>`,
  );
  return lines.join("\n");
}

/** 3점 투시 리깅·역추정·등분할·계단·스냅 검증 결과를 자연스러운 한국어 배경 연출 QA 브리프로 요약한다. */
export function summarizeThreePointPerspectiveKo(
  input: SummarizeThreePointPerspectiveKoInput,
): string {
  const { rig, subdivision, staircase, estimation, snappedStroke } = input;
  const fingerprint = computePerspectiveRigFingerprint(rig, subdivision, staircase, estimation);
  const dateLabel = input.generatedDateIso ?? "2026-11-28";
  const severityKo =
    rig.distortionSeverity === "SAFE"
      ? "안정 (출고 적합)"
      : rig.distortionSeverity === "WARN"
        ? "주의 (구도 보정 권장)"
        : "왜곡 위험 (초점거리·소실점 재배치 필요)";

  const rows: string[] = [
    `# 웹툰 배경 3점 투시 연출 QA 브리프 (${dateLabel})`,
    "",
    "## 1. 카메라 광학 리깅 및 소실점 배치",
    `- 투시 형식: ${rig.mode} · 캔버스 ${String(rig.canvasWidth)}×${String(rig.canvasHeight)}px · 35mm 환산 ${rig.focalLengthMm.toFixed(1)}mm (수평 화각 ${rig.horizontalFovDeg.toFixed(1)}°)`,
    `- 카메라 각도: 좌우(Yaw) ${rig.yawDeg.toFixed(1)}° · 앙각/부감(Pitch) ${rig.pitchDeg.toFixed(1)}° · 롤(Roll) ${rig.rollDeg.toFixed(1)}°`,
    `- 지평선 기울기: ${rig.horizonLine.isAtInfinity ? "천정/바닥 직하 시점으로 지평선이 화면 밖에 위치함" : `${rig.horizonLine.tiltDeg.toFixed(2)}°`}`,
    `- 소실점 좌표: VP1(${rig.vp1.isFinite ? `${rig.vp1.x.toFixed(1)}, ${rig.vp1.y.toFixed(1)}` : "무한"}) · VP2(${rig.vp2.isFinite ? `${rig.vp2.x.toFixed(1)}, ${rig.vp2.y.toFixed(1)}` : "무한"}) · VP3(${rig.vp3.isFinite ? `${rig.vp3.x.toFixed(1)}, ${rig.vp3.y.toFixed(1)}` : "무한"})`,
    `- 수심=주점 직교 검증: ${rig.orthocenterCheck.reasonKo} (편차 ${rig.orthocenterCheck.errorPx.toFixed(4)}px)`,
    `- 왜곡 판정: ${severityKo}`,
  ];

  if (rig.distortionAlerts.length > 0) {
    rows.push("", "## 2. 왜곡 경보 및 작화 보정 권고");
    for (let i = 0; i < rig.distortionAlerts.length; i += 1) {
      rows.push(`- [${rig.distortionAlerts[i].severity}] ${rig.distortionAlerts[i].messageKo}`);
    }
  }
  if (estimation) {
    rows.push(
      "",
      "## 3. 가이드 선분 소실점 역추정 결과",
      `- 판별 형식: ${estimation.detectedMode} · 유효 선분 ${String(estimation.totalValidSegments)}개 중 인라이어 ${String(estimation.totalInlierCount)}개 (${(estimation.inlierRatio * 100).toFixed(1)}%)`,
      `- 평균 재투영 각도 오차: ${estimation.overallMeanInlierAngleErrorDeg.toFixed(3)}° · 제외된 이상치 선분 ${String(estimation.outlierSegmentIds.length)}개`,
    );
  }
  if (subdivision) {
    rows.push(
      "",
      "## 4. 건축 창문·타일 사영 등분할 검증",
      `- 분할 격자: ${String(subdivision.cols)}열 × ${String(subdivision.rows)}행 (총 ${String(subdivision.cells.length)}셀)`,
      `- 교차비 불변량 최대 오차: ${subdivision.verification.maxCrossRatioError.toExponential(2)} · 소실점 수렴 오차: ${subdivision.verification.maxVpConvergenceErrorDeg.toExponential(2)}° · X-대각선 중심 일치 오차: ${subdivision.verification.xDiagonalAgreementPx.toExponential(2)}px`,
    );
  }
  if (staircase) {
    rows.push(
      "",
      "## 5. 3D 원근 계단 구조 검증",
      `- 계단 단 수: ${String(staircase.stepCount)}단 (${staircase.directionAxis} 진행) · 원근 폭 단조 축소: ${staircase.isForeshorteningMonotonic ? "정상" : "검토 필요"}`,
      `- 모서리 소실점 최대 오차: ${staircase.maxVpConvergenceErrorDeg.toExponential(2)}° · 코선 교차비 최대 오차: ${staircase.maxNosingCrossRatioError.toExponential(2)}`,
    );
  }
  if (snappedStroke) {
    rows.push(
      "",
      "## 6. 투시 자 브러시 스냅 계측",
      `- 잠금 축: ${snappedStroke.lockedAxis} · 원본 각도 이탈 ${snappedStroke.originalAngleDeviationDeg.toFixed(2)}° → 스냅 잔차 ${snappedStroke.maxSnapAngleResidualDeg.toExponential(2)}° (평균 보정 ${snappedStroke.meanCorrectionDistancePx.toFixed(2)}px)`,
    );
  }
  rows.push("", "## 7. 무결성 지문", `- SHA-256 (FIPS 180-4): ${fingerprint.sha256Hex}`);
  return rows.join("\n");
}
