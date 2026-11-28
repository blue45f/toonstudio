/**
 * Wave 122 — 순수 OKLCH 인쇄 안전 광학 진단 SVG 렌더러 및 한국어 촬영 감독 QA 브리프.
 *
 * - SVG 내부 모든 색상은 CSS Color 4 `oklch(...)`만 사용해 raw hex/rgb/hsl 문자열을 원천 차단한다.
 * - XML 특수문자(`<`, `>`, `&`, `"`, `'`)를 빠짐없이 이스케이프하고 모든 좌표에 유한수 가드를 적용한다.
 * - 번역투 없는 자연스러운 한국어 촬영 감독 QA 리포트를 생성한다.
 */

import {
  MIN_SAFE_CORNER_VIGNETTE_GAIN,
  type CinematicLensTileResult,
} from "./cinematic-lens-optics-solver";
import type { CinematicPostReadabilityAudit } from "./lens-optics-guard-and-wgsl";

export interface RenderLensOpticsSvgOptions {
  readonly titleOverrideKo?: string;
}

export interface SummarizeLensOpticsKoOptions {
  readonly generatedDateIso?: string;
}

const LENS_SVG_OKLCH = {
  canvasBg: "oklch(0.980 0.007 90)",
  panelBg: "oklch(1.000 0.000 0)",
  headerBg: "oklch(0.955 0.010 88)",
  chartBg: "oklch(0.970 0.006 90)",
  borderSoft: "oklch(0.320 0.036 158 / 0.22)",
  borderStrong: "oklch(0.280 0.048 158 / 0.45)",
  gridLine: "oklch(0.420 0.022 158 / 0.16)",
  inkPrimary: "oklch(0.230 0.042 158)",
  inkSecondary: "oklch(0.410 0.026 158)",
  inkMuted: "oklch(0.510 0.020 158)",
  forestAccent: "oklch(0.350 0.082 158)",
  forestSoftFill: "oklch(0.935 0.042 154)",
  cocCurve: "oklch(0.380 0.135 252)",
  cocAreaFill: "oklch(0.640 0.080 250 / 0.16)",
  focusLine: "oklch(0.460 0.140 152)",
  bokehOuter: "oklch(0.540 0.145 245 / 0.24)",
  bokehStroke: "oklch(0.380 0.130 245)",
  caRed: "oklch(0.540 0.190 28)",
  caBlue: "oklch(0.460 0.165 258)",
  vignetteCurve: "oklch(0.340 0.085 38)",
  floorLine: "oklch(0.540 0.165 32)",
  floorShade: "oklch(0.930 0.055 28 / 0.40)",
  textSafeFill: "oklch(0.920 0.058 152 / 0.65)",
  textSafeStroke: "oklch(0.370 0.110 152)",
  passFill: "oklch(0.935 0.045 152)",
  passStroke: "oklch(0.420 0.115 152)",
  passText: "oklch(0.250 0.078 152)",
  warnFill: "oklch(0.945 0.065 78)",
  warnStroke: "oklch(0.550 0.145 68)",
  warnText: "oklch(0.320 0.095 62)",
  failFill: "oklch(0.930 0.058 24)",
  failStroke: "oklch(0.520 0.185 26)",
  failText: "oklch(0.310 0.125 26)",
  frameBg: "oklch(0.940 0.008 92)",
} as const;

const FONT_SANS = "Pretendard, Apple SD Gothic Neo, sans-serif";
const FONT_MONO = "ui-monospace, SFMono-Regular, monospace";

/** XML 특수문자(`&`, `<`, `>`, `"`, `'`)를 안전하게 이스케이프한다. */
export function escapeLensOpticsXml(raw: string): string {
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

function gradeBadgePalette(grade: CinematicPostReadabilityAudit["grade"]): {
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
  readonly labelKo: string;
} {
  if (grade === "PASS") {
    return {
      fill: LENS_SVG_OKLCH.passFill,
      stroke: LENS_SVG_OKLCH.passStroke,
      text: LENS_SVG_OKLCH.passText,
      labelKo: "출고 적합 (PASS)",
    };
  }
  if (grade === "WARN") {
    return {
      fill: LENS_SVG_OKLCH.warnFill,
      stroke: LENS_SVG_OKLCH.warnStroke,
      text: LENS_SVG_OKLCH.warnText,
      labelKo: "조건부 주의 (WARN)",
    };
  }
  return {
    fill: LENS_SVG_OKLCH.failFill,
    stroke: LENS_SVG_OKLCH.failStroke,
    text: LENS_SVG_OKLCH.failText,
    labelKo: "출고 보류 (FAIL)",
  };
}

function renderCocPanel(
  result: CinematicLensTileResult,
  x: number,
  y: number,
  w: number,
  h: number,
): readonly string[] {
  const out: string[] = [];
  out.push(
    `  <rect x="${fmtSvgNum(x)}" y="${fmtSvgNum(y)}" width="${fmtSvgNum(w)}" height="${fmtSvgNum(h)}" rx="10" fill="${LENS_SVG_OKLCH.panelBg}" stroke="${LENS_SVG_OKLCH.borderSoft}" stroke-width="1" />`,
  );
  out.push(
    `  <text x="${fmtSvgNum(x + 16)}" y="${fmtSvgNum(y + 24)}" font-family="${FONT_SANS}" font-size="13" font-weight="700" fill="${LENS_SVG_OKLCH.inkPrimary}">깊이별 착란원(DoF CoC) 곡선</text>`,
  );
  out.push(
    `  <text x="${fmtSvgNum(x + 16)}" y="${fmtSvgNum(y + 40)}" font-family="${FONT_MONO}" font-size="10" fill="${LENS_SVG_OKLCH.inkSecondary}">초점면 ${result.focusDistanceM.toFixed(2)}m · f/${result.apertureFStop.toFixed(1)} · 초점 CoC ${result.metrics.focusPlaneCocPx.toFixed(2)}px</text>`,
  );

  const cx = x + 44;
  const cy = y + 54;
  const cw = w - 62;
  const ch = h - 86;
  out.push(
    `  <rect x="${fmtSvgNum(cx)}" y="${fmtSvgNum(cy)}" width="${fmtSvgNum(cw)}" height="${fmtSvgNum(ch)}" rx="6" fill="${LENS_SVG_OKLCH.chartBg}" stroke="${LENS_SVG_OKLCH.borderSoft}" stroke-width="1" />`,
  );

  const profile = result.depthCocProfile;
  const minDepth = profile.length > 0 ? profile[0].depthM : 0.5;
  const maxDepth = profile.length > 0 ? profile[profile.length - 1].depthM : 10;
  const depthSpan = Math.max(0.1, maxDepth - minDepth);
  const maxCoc = Math.max(
    4,
    profile.reduce((acc, s) => (Number.isFinite(s.cocPx) && s.cocPx > acc ? s.cocPx : acc), 0),
  );

  for (let g = 1; g <= 3; g += 1) {
    const gy = cy + (ch * g) / 4;
    out.push(
      `  <line x1="${fmtSvgNum(cx)}" y1="${fmtSvgNum(gy)}" x2="${fmtSvgNum(cx + cw)}" y2="${fmtSvgNum(gy)}" stroke="${LENS_SVG_OKLCH.gridLine}" stroke-width="1" />`,
    );
  }

  const pts: string[] = [];
  for (let i = 0; i < profile.length; i += 1) {
    const s = profile[i];
    const px = cx + ((s.depthM - minDepth) / depthSpan) * cw;
    const py = cy + ch - (Math.min(maxCoc, Math.max(0, s.cocPx)) / maxCoc) * (ch - 10) - 4;
    pts.push(`${fmtSvgNum(px)},${fmtSvgNum(py)}`);
  }

  const focusX = cx + ((result.focusDistanceM - minDepth) / depthSpan) * cw;
  out.push(
    `  <line x1="${fmtSvgNum(focusX)}" y1="${fmtSvgNum(cy)}" x2="${fmtSvgNum(focusX)}" y2="${fmtSvgNum(cy + ch)}" stroke="${LENS_SVG_OKLCH.focusLine}" stroke-width="1.5" stroke-dasharray="4 3" />`,
  );
  if (pts.length > 0) {
    const areaPts = `${fmtSvgNum(cx)},${fmtSvgNum(cy + ch)} ${pts.join(" ")} ${fmtSvgNum(cx + cw)},${fmtSvgNum(cy + ch)}`;
    out.push(`  <polygon points="${areaPts}" fill="${LENS_SVG_OKLCH.cocAreaFill}" />`);
    out.push(
      `  <polyline points="${pts.join(" ")}" fill="none" stroke="${LENS_SVG_OKLCH.cocCurve}" stroke-width="2.2" stroke-linejoin="round" />`,
    );
  }
  out.push(
    `  <circle cx="${fmtSvgNum(focusX)}" cy="${fmtSvgNum(cy + ch - 4)}" r="4.5" fill="${LENS_SVG_OKLCH.focusLine}" />`,
  );
  out.push(
    `  <text x="${fmtSvgNum(cx)}" y="${fmtSvgNum(cy + ch + 15)}" font-family="${FONT_MONO}" font-size="9.5" fill="${LENS_SVG_OKLCH.inkMuted}">${minDepth.toFixed(1)}m</text>`,
  );
  out.push(
    `  <text x="${fmtSvgNum(focusX - 18)}" y="${fmtSvgNum(cy + ch + 15)}" font-family="${FONT_MONO}" font-size="9.5" font-weight="700" fill="${LENS_SVG_OKLCH.focusLine}">초점 ${result.focusDistanceM.toFixed(1)}m</text>`,
  );
  out.push(
    `  <text x="${fmtSvgNum(cx + cw - 30)}" y="${fmtSvgNum(cy + ch + 15)}" font-family="${FONT_MONO}" font-size="9.5" fill="${LENS_SVG_OKLCH.inkMuted}">${maxDepth.toFixed(1)}m</text>`,
  );

  return out;
}

function renderBokehAndCaPanel(
  result: CinematicLensTileResult,
  x: number,
  y: number,
  w: number,
  h: number,
): readonly string[] {
  const out: string[] = [];
  out.push(
    `  <rect x="${fmtSvgNum(x)}" y="${fmtSvgNum(y)}" width="${fmtSvgNum(w)}" height="${fmtSvgNum(h)}" rx="10" fill="${LENS_SVG_OKLCH.panelBg}" stroke="${LENS_SVG_OKLCH.borderSoft}" stroke-width="1" />`,
  );
  out.push(
    `  <text x="${fmtSvgNum(x + 16)}" y="${fmtSvgNum(y + 24)}" font-family="${FONT_SANS}" font-size="13" font-weight="700" fill="${LENS_SVG_OKLCH.inkPrimary}">아나모픽 보케 실루엣 · 측면 색수차(CA)</text>`,
  );
  out.push(
    `  <text x="${fmtSvgNum(x + 16)}" y="${fmtSvgNum(y + 40)}" font-family="${FONT_MONO}" font-size="10" fill="${LENS_SVG_OKLCH.inkSecondary}">보케 종횡비 ${result.metrics.bokehAspectRatio.toFixed(2)}x · 스퀴즈 ${result.preset.anamorphicSqueeze.toFixed(1)}x</text>`,
  );

  const aspect = Math.max(0.5, Math.min(3.0, result.metrics.bokehAspectRatio));
  const bokehCx = x + 112;
  const bokehCy = y + 126;
  const baseR = 46;
  const rx = baseR / Math.sqrt(aspect);
  const ry = rx * aspect;
  const clampedRy = Math.min(62, ry);
  const clampedRx = clampedRy / aspect;

  out.push(
    `  <ellipse cx="${fmtSvgNum(bokehCx)}" cy="${fmtSvgNum(bokehCy)}" rx="${fmtSvgNum(clampedRx)}" ry="${fmtSvgNum(clampedRy)}" fill="${LENS_SVG_OKLCH.bokehOuter}" stroke="${LENS_SVG_OKLCH.bokehStroke}" stroke-width="2" />`,
  );
  out.push(
    `  <ellipse cx="${fmtSvgNum(bokehCx)}" cy="${fmtSvgNum(bokehCy)}" rx="${fmtSvgNum(clampedRx * 0.62)}" ry="${fmtSvgNum(clampedRy * 0.62)}" fill="none" stroke="${LENS_SVG_OKLCH.bokehStroke}" stroke-width="1" stroke-dasharray="3 2" />`,
  );
  out.push(
    `  <text x="${fmtSvgNum(bokehCx - 38)}" y="${fmtSvgNum(y + h - 16)}" font-family="${FONT_MONO}" font-size="10" font-weight="700" fill="${LENS_SVG_OKLCH.bokehStroke}">비율 1 : ${aspect.toFixed(2)}</text>`,
  );

  // 우측 측면 색수차(CA) 바 비교: 중심 vs 외곽 vs 코너
  const caX = x + 210;
  const caY = y + 66;
  const barMaxW = w - 232;
  const maxCaRef = Math.max(4, result.metrics.cornerCaSeparationPx * 1.15);

  const caRows: ReadonlyArray<{ readonly label: string; readonly value: number }> = [
    { label: "중심 (0.5, 0.5)", value: result.metrics.centerCaSeparationPx },
    { label: "좌우 외곽", value: result.metrics.edgeCaSeparationPx },
    { label: "코너 (1.0, 1.0)", value: result.metrics.cornerCaSeparationPx },
  ];

  for (let i = 0; i < caRows.length; i += 1) {
    const row = caRows[i];
    const ryPos = caY + i * 42;
    const barW = Math.min(barMaxW, (Math.max(0, row.value) / maxCaRef) * barMaxW);
    out.push(
      `  <text x="${fmtSvgNum(caX)}" y="${fmtSvgNum(ryPos)}" font-family="${FONT_SANS}" font-size="10.5" fill="${LENS_SVG_OKLCH.inkPrimary}">${escapeLensOpticsXml(row.label)} · ${row.value.toFixed(2)}px</text>`,
    );
    out.push(
      `  <rect x="${fmtSvgNum(caX)}" y="${fmtSvgNum(ryPos + 6)}" width="${fmtSvgNum(barMaxW)}" height="12" rx="4" fill="${LENS_SVG_OKLCH.chartBg}" stroke="${LENS_SVG_OKLCH.borderSoft}" stroke-width="0.8" />`,
    );
    if (barW > 0.5) {
      out.push(
        `  <rect x="${fmtSvgNum(caX)}" y="${fmtSvgNum(ryPos + 6)}" width="${fmtSvgNum(barW * 0.52)}" height="12" rx="3" fill="${LENS_SVG_OKLCH.caRed}" />`,
      );
      out.push(
        `  <rect x="${fmtSvgNum(caX + barW * 0.48)}" y="${fmtSvgNum(ryPos + 6)}" width="${fmtSvgNum(barW * 0.52)}" height="12" rx="3" fill="${LENS_SVG_OKLCH.caBlue}" />`,
      );
    }
  }

  return out;
}

function renderVignettePanel(
  result: CinematicLensTileResult,
  x: number,
  y: number,
  w: number,
  h: number,
): readonly string[] {
  const out: string[] = [];
  out.push(
    `  <rect x="${fmtSvgNum(x)}" y="${fmtSvgNum(y)}" width="${fmtSvgNum(w)}" height="${fmtSvgNum(h)}" rx="10" fill="${LENS_SVG_OKLCH.panelBg}" stroke="${LENS_SVG_OKLCH.borderSoft}" stroke-width="1" />`,
  );
  out.push(
    `  <text x="${fmtSvgNum(x + 16)}" y="${fmtSvgNum(y + 24)}" font-family="${FONT_SANS}" font-size="13" font-weight="700" fill="${LENS_SVG_OKLCH.inkPrimary}">Cos⁴ 물리 비네팅 감쇠 프로파일</text>`,
  );
  out.push(
    `  <text x="${fmtSvgNum(x + 16)}" y="${fmtSvgNum(y + 40)}" font-family="${FONT_MONO}" font-size="10" fill="${LENS_SVG_OKLCH.inkSecondary}">중심 ${(result.metrics.centerVignetteGain * 100).toFixed(0)}% → 코너 최소 ${(result.metrics.minCornerVignetteGain * 100).toFixed(1)}% (하한 35.0%)</text>`,
  );

  const cx = x + 44;
  const cy = y + 54;
  const cw = w - 62;
  const ch = h - 86;
  out.push(
    `  <rect x="${fmtSvgNum(cx)}" y="${fmtSvgNum(cy)}" width="${fmtSvgNum(cw)}" height="${fmtSvgNum(ch)}" rx="6" fill="${LENS_SVG_OKLCH.chartBg}" stroke="${LENS_SVG_OKLCH.borderSoft}" stroke-width="1" />`,
  );

  const floorY = cy + ch * (1 - MIN_SAFE_CORNER_VIGNETTE_GAIN);
  out.push(
    `  <rect x="${fmtSvgNum(cx)}" y="${fmtSvgNum(floorY)}" width="${fmtSvgNum(cw)}" height="${fmtSvgNum(cy + ch - floorY)}" fill="${LENS_SVG_OKLCH.floorShade}" />`,
  );
  out.push(
    `  <line x1="${fmtSvgNum(cx)}" y1="${fmtSvgNum(floorY)}" x2="${fmtSvgNum(cx + cw)}" y2="${fmtSvgNum(floorY)}" stroke="${LENS_SVG_OKLCH.floorLine}" stroke-width="1.4" stroke-dasharray="4 3" />`,
  );

  const pts: string[] = [];
  for (let i = 0; i < result.vignetteProfile.length; i += 1) {
    const s = result.vignetteProfile[i];
    const px = cx + Math.max(0, Math.min(1, s.radialNorm)) * cw;
    const py = cy + ch * (1 - Math.max(0, Math.min(1, s.gain)));
    pts.push(`${fmtSvgNum(px)},${fmtSvgNum(py)}`);
  }
  if (pts.length > 0) {
    out.push(
      `  <polyline points="${pts.join(" ")}" fill="none" stroke="${LENS_SVG_OKLCH.vignetteCurve}" stroke-width="2.4" stroke-linejoin="round" />`,
    );
  }
  out.push(
    `  <text x="${fmtSvgNum(cx + 6)}" y="${fmtSvgNum(floorY - 4)}" font-family="${FONT_MONO}" font-size="9.5" font-weight="700" fill="${LENS_SVG_OKLCH.floorLine}">암부 보호 하한 0.35</text>`,
  );
  out.push(
    `  <text x="${fmtSvgNum(cx)}" y="${fmtSvgNum(cy + ch + 15)}" font-family="${FONT_MONO}" font-size="9.5" fill="${LENS_SVG_OKLCH.inkMuted}">r=0.0 (중심)</text>`,
  );
  out.push(
    `  <text x="${fmtSvgNum(cx + cw - 58)}" y="${fmtSvgNum(cy + ch + 15)}" font-family="${FONT_MONO}" font-size="9.5" fill="${LENS_SVG_OKLCH.inkMuted}">r=1.0 (코너)</text>`,
  );

  return out;
}

function renderTextSafePanel(
  result: CinematicLensTileResult,
  audit: CinematicPostReadabilityAudit,
  x: number,
  y: number,
  w: number,
  h: number,
): readonly string[] {
  const out: string[] = [];
  out.push(
    `  <rect x="${fmtSvgNum(x)}" y="${fmtSvgNum(y)}" width="${fmtSvgNum(w)}" height="${fmtSvgNum(h)}" rx="10" fill="${LENS_SVG_OKLCH.panelBg}" stroke="${LENS_SVG_OKLCH.borderSoft}" stroke-width="1" />`,
  );
  out.push(
    `  <text x="${fmtSvgNum(x + 16)}" y="${fmtSvgNum(y + 24)}" font-family="${FONT_SANS}" font-size="13" font-weight="700" fill="${LENS_SVG_OKLCH.inkPrimary}">대사 보호 안전 영역(Text-Safe) · QA 체크</text>`,
  );
  out.push(
    `  <text x="${fmtSvgNum(x + 16)}" y="${fmtSvgNum(y + 40)}" font-family="${FONT_MONO}" font-size="10" fill="${LENS_SVG_OKLCH.inkSecondary}">마스크 ${String(result.metrics.textSafeBoxCount)}개 · 보호 ${String(result.metrics.textSafeProtectedPixelCount)}px · 훼손 ${String(result.metrics.textBoxCorruptedPixelCount)}px</text>`,
  );

  // 좌측 프레임 미니맵 + 대사 보호 사각 마스크
  const mapX = x + 16;
  const mapY = y + 54;
  const mapW = 166;
  const mapH = 132;
  out.push(
    `  <rect x="${fmtSvgNum(mapX)}" y="${fmtSvgNum(mapY)}" width="${fmtSvgNum(mapW)}" height="${fmtSvgNum(mapH)}" rx="6" fill="${LENS_SVG_OKLCH.frameBg}" stroke="${LENS_SVG_OKLCH.borderStrong}" stroke-width="1.2" />`,
  );
  const scaleX = mapW / Math.max(1, result.width);
  const scaleY = mapH / Math.max(1, result.height);
  for (let i = 0; i < result.textSafeBoxes.length; i += 1) {
    const box = result.textSafeBoxes[i];
    const bx = mapX + Math.max(0, box.x) * scaleX;
    const by = mapY + Math.max(0, box.y) * scaleY;
    const bw = Math.max(6, Math.min(mapW - (bx - mapX), box.width * scaleX));
    const bh = Math.max(6, Math.min(mapH - (by - mapY), box.height * scaleY));
    out.push(
      `  <rect x="${fmtSvgNum(bx)}" y="${fmtSvgNum(by)}" width="${fmtSvgNum(bw)}" height="${fmtSvgNum(bh)}" rx="3" fill="${LENS_SVG_OKLCH.textSafeFill}" stroke="${LENS_SVG_OKLCH.textSafeStroke}" stroke-width="1.4" />`,
    );
    const label = box.labelKo ?? box.id ?? `대사 ${String(i + 1)}`;
    out.push(
      `  <text x="${fmtSvgNum(bx + 4)}" y="${fmtSvgNum(by + Math.min(13, bh - 2))}" font-family="${FONT_SANS}" font-size="9" font-weight="700" fill="${LENS_SVG_OKLCH.passText}">${escapeLensOpticsXml(label)}</text>`,
    );
  }

  // 우측 감사 항목 리스트
  const listX = x + 196;
  const listY = y + 66;
  for (let i = 0; i < audit.checks.length; i += 1) {
    const chk = audit.checks[i];
    const rowY = listY + i * 21;
    const dotFill = chk.passed ? LENS_SVG_OKLCH.passStroke : LENS_SVG_OKLCH.failStroke;
    const statusTxt = chk.passed ? "OK" : "FAIL";
    out.push(
      `  <circle cx="${fmtSvgNum(listX + 5)}" cy="${fmtSvgNum(rowY - 3)}" r="4" fill="${dotFill}" />`,
    );
    out.push(
      `  <text x="${fmtSvgNum(listX + 14)}" y="${fmtSvgNum(rowY)}" font-family="${FONT_SANS}" font-size="10.2" fill="${LENS_SVG_OKLCH.inkPrimary}">${escapeLensOpticsXml(chk.labelKo)} [${statusTxt}]</text>`,
    );
  }

  return out;
}

/**
 * 시네마틱 렌즈 광학 진단 결과와 감사 상태를 인쇄 안전 순수 OKLCH SVG 대시보드로 렌더링한다.
 */
export function renderCinematicLensOpticsSvg(
  result: CinematicLensTileResult,
  audit: CinematicPostReadabilityAudit,
  options?: RenderLensOpticsSvgOptions,
): string {
  const totalW = 960;
  const totalH = 604;
  const padX = 24;
  const padY = 20;
  const headerH = 68;
  const gap = 18;
  const panelW = (totalW - padX * 2 - gap) / 2;
  const panelH = 228;

  const badge = gradeBadgePalette(audit.grade);
  const titleText = options?.titleOverrideKo ?? result.sceneTitleKo;
  const subtitle = `${result.preset.nameKo} (${result.preset.id}) · ${String(result.preset.focalLengthMm)}mm f/${result.apertureFStop.toFixed(1)} · 왕복 왜곡 오차 ${result.metrics.maxDistortionRoundTripUvError.toExponential(1)}`;

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(totalW)} ${String(totalH)}" width="${String(totalW)}" height="${String(totalH)}" role="img" aria-label="${escapeLensOpticsXml(`${titleText} 시네마틱 렌즈 광학 진단`)}">`,
    `  <rect x="0" y="0" width="${String(totalW)}" height="${String(totalH)}" fill="${LENS_SVG_OKLCH.canvasBg}" />`,
    `  <rect x="${String(padX)}" y="${String(padY)}" width="${String(totalW - padX * 2)}" height="${String(headerH)}" rx="12" fill="${LENS_SVG_OKLCH.headerBg}" stroke="${LENS_SVG_OKLCH.borderSoft}" stroke-width="1" />`,
    `  <text x="${String(padX + 18)}" y="${String(padY + 28)}" font-family="${FONT_SANS}" font-size="17" font-weight="800" fill="${LENS_SVG_OKLCH.inkPrimary}">${escapeLensOpticsXml(titleText)}</text>`,
    `  <text x="${String(padX + 18)}" y="${String(padY + 50)}" font-family="${FONT_MONO}" font-size="11" fill="${LENS_SVG_OKLCH.inkSecondary}">${escapeLensOpticsXml(subtitle)}</text>`,
    `  <rect x="${String(totalW - padX - 178)}" y="${String(padY + 18)}" width="160" height="32" rx="8" fill="${badge.fill}" stroke="${badge.stroke}" stroke-width="1.4" />`,
    `  <text x="${String(totalW - padX - 164)}" y="${String(padY + 38)}" font-family="${FONT_SANS}" font-size="12" font-weight="800" fill="${badge.text}">${escapeLensOpticsXml(badge.labelKo)}</text>`,
  ];

  const row1Y = padY + headerH + gap;
  const row2Y = row1Y + panelH + gap;
  const col1X = padX;
  const col2X = padX + panelW + gap;

  lines.push(...renderCocPanel(result, col1X, row1Y, panelW, panelH));
  lines.push(...renderBokehAndCaPanel(result, col2X, row1Y, panelW, panelH));
  lines.push(...renderVignettePanel(result, col1X, row2Y, panelW, panelH));
  lines.push(...renderTextSafePanel(result, audit, col2X, row2Y, panelW, panelH));
  lines.push("</svg>");

  return lines.join("\n");
}

/**
 * 번역투 없는 자연스러운 한국어 촬영 감독 QA 브리프를 생성한다.
 */
export function summarizeCinematicLensOpticsKo(
  result: CinematicLensTileResult,
  audit: CinematicPostReadabilityAudit,
  options?: SummarizeLensOpticsKoOptions,
): string {
  const { preset, metrics } = result;
  const dateHeader =
    options?.generatedDateIso !== undefined ? ` (${options.generatedDateIso})` : "";
  const verdictKo =
    audit.grade === "PASS"
      ? "출고 적합"
      : audit.grade === "WARN"
        ? "조건부 출고(육안 확인 필요)"
        : "출고 보류(수정 필요)";

  const lines: string[] = [
    `[촬영 감독 광학 QA 브리프] ${result.sceneTitleKo}${dateHeader}`,
    `- 최종 판정: ${verdictKo} (${audit.grade})`,
    `- 적용 렌즈: ${preset.nameKo} (${preset.id}) · ${String(preset.focalLengthMm)}mm f/${result.apertureFStop.toFixed(1)} · 초점면 ${result.focusDistanceM.toFixed(2)}m · 강도 ${Math.round(result.intensity * 100)}%`,
    `- 왜곡·가역성: Brown-Conrady 정·역왜곡 최대 왕복 오차 ${metrics.maxDistortionRoundTripUvError.toExponential(2)} UV, 중심 드리프트 ${metrics.centerDistortionDriftUv.toFixed(4)} UV`,
    `- 심도·보케: 초점면 착란원 ${metrics.focusPlaneCocPx.toFixed(2)}px, 타일 최대 착란원 ${metrics.maxObservedCocPx.toFixed(2)}px, 보케 종횡비 ${metrics.bokehAspectRatio.toFixed(2)}x`,
    `- 측면 색수차: 중심 ${metrics.centerCaSeparationPx.toFixed(2)}px → 외곽 ${metrics.edgeCaSeparationPx.toFixed(2)}px → 코너 ${metrics.cornerCaSeparationPx.toFixed(2)}px`,
    `- 비네팅·할레이션: 코너 최소 광량 ${(metrics.minCornerVignetteGain * 100).toFixed(1)}%(하한 35.0%), 할레이션 반응 픽셀 ${String(metrics.halationActivatedPixelCount)}개`,
    `- 대사 보호: 마스크 ${String(metrics.textSafeBoxCount)}개 · 보호 픽셀 ${String(metrics.textSafeProtectedPixelCount)}개 중 훼손 ${String(metrics.textBoxCorruptedPixelCount)}개`,
    `- 동작 축소 모드: ${result.prefersReducedMotion ? "활성" : "비활성"} (실효 셔터 지터 ${result.effectiveShutterJitterPx.toFixed(2)}px)`,
  ];

  if (audit.violations.length > 0) {
    lines.push("- 차단 사유:");
    for (let i = 0; i < audit.violations.length; i += 1) {
      lines.push(`  · ${audit.violations[i]}`);
    }
  } else if (audit.warnings.length > 0) {
    lines.push("- 참고 사항:");
    for (let i = 0; i < audit.warnings.length; i += 1) {
      lines.push(`  · ${audit.warnings[i]}`);
    }
  } else {
    lines.push("- 감독 소견: 중심부 선명도와 대사 가독성을 해치지 않으면서 의도한 시네마틱 렌즈 질감을 그대로 살렸습니다.");
  }

  return lines.join("\n");
}
