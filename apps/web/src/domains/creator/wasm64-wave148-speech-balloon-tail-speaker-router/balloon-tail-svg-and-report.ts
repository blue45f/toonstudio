/**
 * Wave 148 — 순수 OKLCH 다인 대화 컷 꼬리 라우팅 SVG 시각화 &
 * 번역투 없는 한국어 식자 감독 QA 브리프.
 *
 * - 원시 색상 표기를 일절 쓰지 않고 순수 oklch(...) 토큰만 사용한다.
 * - XML/XSS 이스케이프와 유한 좌표 출력(NaN/Infinity 0건)을 보장한다.
 */

import { sanitizeFinite, sanitizePoint, sanitizeRect } from "./balloon-tail-math-and-sha256";
import {
  BALLOON_TAIL_STYLE_IDS,
  BALLOON_TAIL_STYLE_PRESETS,
  type BalloonTailRoutingResult,
  type BalloonTailStyleId,
  type BuiltBalloonTailGeometry,
  type OffPanelEdge,
  type PanelBalloonTailAudit,
  type PanelBalloonTailDocument,
  type Rect2D,
  type Vec2,
} from "./balloon-tail-types";

export type BalloonTailSvgTheme = "light" | "dark";

export interface BalloonTailSvgOptions {
  readonly title?: string;
  readonly theme?: BalloonTailSvgTheme;
  readonly width?: number;
  readonly showBaselineGhost?: boolean;
  readonly showSpeakerLabels?: boolean;
  readonly showDefectMarkers?: boolean;
}

export interface BalloonTailQaBriefKo {
  readonly verdictKo: "통과" | "주의" | "교정 필요";
  readonly headlineKo: string;
  readonly summaryLineKo: string;
  readonly beforeAfterLineKo: string;
  readonly styleBreakdownLineKo: string;
  readonly actionLinesKo: readonly string[];
  readonly fullTextKo: string;
}

export interface BalloonTailSvgInput {
  readonly tails: readonly BuiltBalloonTailGeometry[];
  readonly audit: PanelBalloonTailAudit;
  readonly baselineTails?: readonly BuiltBalloonTailGeometry[];
  readonly baselineAudit?: PanelBalloonTailAudit;
}

interface TailRouterOklchPalette {
  readonly canvasBg: string;
  readonly panelBg: string;
  readonly panelBorder: string;
  readonly headerBg: string;
  readonly headerBorder: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly faceFill: string;
  readonly faceStroke: string;
  readonly mouthFill: string;
  readonly mouthRing: string;
  readonly offPanelStripFill: string;
  readonly offPanelStripStroke: string;
  readonly balloonFill: string;
  readonly balloonStroke: string;
  readonly tailClassicFill: string;
  readonly tailClassicStroke: string;
  readonly tailShoutFill: string;
  readonly tailShoutStroke: string;
  readonly tailThoughtFill: string;
  readonly tailThoughtStroke: string;
  readonly tailOffPanelFill: string;
  readonly tailOffPanelStroke: string;
  readonly tailWhisperFill: string;
  readonly tailWhisperStroke: string;
  readonly baselineGhostStroke: string;
  readonly defectFill: string;
  readonly defectStroke: string;
  readonly badgePassBg: string;
  readonly badgePassText: string;
  readonly badgeWarnBg: string;
  readonly badgeWarnText: string;
  readonly badgeFailBg: string;
  readonly badgeFailText: string;
}

const LIGHT_PALETTE: TailRouterOklchPalette = {
  canvasBg: "oklch(0.975 0.007 90)",
  panelBg: "oklch(0.996 0.003 90)",
  panelBorder: "oklch(0.26 0.022 155)",
  headerBg: "oklch(0.992 0.004 92)",
  headerBorder: "oklch(0.86 0.014 155)",
  textPrimary: "oklch(0.22 0.022 155)",
  textSecondary: "oklch(0.46 0.018 155)",
  faceFill: "oklch(0.92 0.032 162 / 0.55)",
  faceStroke: "oklch(0.46 0.088 162)",
  mouthFill: "oklch(0.56 0.165 28)",
  mouthRing: "oklch(0.99 0.003 90)",
  offPanelStripFill: "oklch(0.92 0.042 238 / 0.55)",
  offPanelStripStroke: "oklch(0.46 0.11 238)",
  balloonFill: "oklch(0.998 0.002 90)",
  balloonStroke: "oklch(0.24 0.02 155)",
  tailClassicFill: "oklch(0.998 0.002 90)",
  tailClassicStroke: "oklch(0.26 0.024 155)",
  tailShoutFill: "oklch(0.96 0.045 42)",
  tailShoutStroke: "oklch(0.48 0.185 32)",
  tailThoughtFill: "oklch(0.97 0.025 225)",
  tailThoughtStroke: "oklch(0.42 0.095 225)",
  tailOffPanelFill: "oklch(0.95 0.038 242)",
  tailOffPanelStroke: "oklch(0.42 0.125 242)",
  tailWhisperFill: "oklch(0.98 0.012 185 / 0.85)",
  tailWhisperStroke: "oklch(0.48 0.055 185)",
  baselineGhostStroke: "oklch(0.58 0.165 26 / 0.65)",
  defectFill: "oklch(0.58 0.21 25 / 0.28)",
  defectStroke: "oklch(0.48 0.215 25)",
  badgePassBg: "oklch(0.94 0.028 155)",
  badgePassText: "oklch(0.32 0.105 155)",
  badgeWarnBg: "oklch(0.95 0.036 78)",
  badgeWarnText: "oklch(0.44 0.135 72)",
  badgeFailBg: "oklch(0.94 0.04 26)",
  badgeFailText: "oklch(0.46 0.195 26)",
};

const DARK_PALETTE: TailRouterOklchPalette = {
  canvasBg: "oklch(0.16 0.012 155)",
  panelBg: "oklch(0.20 0.014 155)",
  panelBorder: "oklch(0.78 0.018 92)",
  headerBg: "oklch(0.23 0.016 155)",
  headerBorder: "oklch(0.35 0.022 155)",
  textPrimary: "oklch(0.95 0.008 92)",
  textSecondary: "oklch(0.75 0.015 150)",
  faceFill: "oklch(0.34 0.055 162 / 0.55)",
  faceStroke: "oklch(0.72 0.11 162)",
  mouthFill: "oklch(0.72 0.175 30)",
  mouthRing: "oklch(0.18 0.014 155)",
  offPanelStripFill: "oklch(0.34 0.065 238 / 0.55)",
  offPanelStripStroke: "oklch(0.76 0.125 238)",
  balloonFill: "oklch(0.25 0.014 155)",
  balloonStroke: "oklch(0.88 0.012 92)",
  tailClassicFill: "oklch(0.25 0.014 155)",
  tailClassicStroke: "oklch(0.88 0.012 92)",
  tailShoutFill: "oklch(0.34 0.082 36)",
  tailShoutStroke: "oklch(0.82 0.175 38)",
  tailThoughtFill: "oklch(0.30 0.048 225)",
  tailThoughtStroke: "oklch(0.78 0.115 225)",
  tailOffPanelFill: "oklch(0.30 0.062 242)",
  tailOffPanelStroke: "oklch(0.80 0.135 242)",
  tailWhisperFill: "oklch(0.26 0.025 185 / 0.85)",
  tailWhisperStroke: "oklch(0.76 0.065 185)",
  baselineGhostStroke: "oklch(0.74 0.185 28 / 0.72)",
  defectFill: "oklch(0.62 0.21 26 / 0.36)",
  defectStroke: "oklch(0.80 0.195 28)",
  badgePassBg: "oklch(0.26 0.048 155)",
  badgePassText: "oklch(0.80 0.135 155)",
  badgeWarnBg: "oklch(0.28 0.055 76)",
  badgeWarnText: "oklch(0.84 0.145 78)",
  badgeFailBg: "oklch(0.28 0.065 26)",
  badgeFailText: "oklch(0.80 0.185 28)",
};

function fmt(value: number, digits = 2): string {
  const safe = sanitizeFinite(value, 0);
  const fixed = safe.toFixed(digits);
  return fixed === "-0.00" || fixed === "-0.0" || fixed === "-0" ? "0" : fixed;
}

export function escapeSvgXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isRoutingResult(
  input: BalloonTailRoutingResult | BalloonTailSvgInput,
): input is BalloonTailRoutingResult {
  return "routedTails" in input && "routedAudit" in input;
}

function tailColorsForStyle(
  style: BalloonTailStyleId,
  palette: TailRouterOklchPalette,
): { readonly fill: string; readonly stroke: string; readonly strokeWidth: number } {
  if (style === "sharp-shout-spike") {
    return { fill: palette.tailShoutFill, stroke: palette.tailShoutStroke, strokeWidth: 2.2 };
  }
  if (style === "thought-bubble-dots") {
    return { fill: palette.tailThoughtFill, stroke: palette.tailThoughtStroke, strokeWidth: 1.6 };
  }
  if (style === "off-panel-edge-arrow") {
    return { fill: palette.tailOffPanelFill, stroke: palette.tailOffPanelStroke, strokeWidth: 2.0 };
  }
  if (style === "whisper-thin-curve") {
    return { fill: palette.tailWhisperFill, stroke: palette.tailWhisperStroke, strokeWidth: 1.3 };
  }
  return { fill: palette.tailClassicFill, stroke: palette.tailClassicStroke, strokeWidth: 1.8 };
}

function buildPolylinePath(points: readonly Vec2[], mapPt: (pt: Vec2) => Vec2): string {
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const raw = points[i];
    if (!raw) continue;
    const m = mapPt(raw);
    parts.push(`${i === 0 ? "M" : "L"} ${fmt(m.x)} ${fmt(m.y)}`);
  }
  return parts.join(" ");
}

function renderOffPanelEdgeStrip(
  edge: OffPanelEdge,
  panelRect: Rect2D,
  mapPt: (pt: Vec2) => Vec2,
  scale: number,
  palette: TailRouterOklchPalette,
): string {
  const tl = mapPt({ x: panelRect.x, y: panelRect.y });
  const w = panelRect.width * scale;
  const h = panelRect.height * scale;
  const strip = 6;
  if (edge === "left") {
    return `<rect data-off-panel-edge="left" x="${fmt(tl.x)}" y="${fmt(tl.y)}" width="${fmt(strip)}" height="${fmt(h)}" fill="${palette.offPanelStripFill}" stroke="${palette.offPanelStripStroke}" stroke-width="1" />`;
  }
  if (edge === "right") {
    return `<rect data-off-panel-edge="right" x="${fmt(tl.x + w - strip)}" y="${fmt(tl.y)}" width="${fmt(strip)}" height="${fmt(h)}" fill="${palette.offPanelStripFill}" stroke="${palette.offPanelStripStroke}" stroke-width="1" />`;
  }
  if (edge === "top") {
    return `<rect data-off-panel-edge="top" x="${fmt(tl.x)}" y="${fmt(tl.y)}" width="${fmt(w)}" height="${fmt(strip)}" fill="${palette.offPanelStripFill}" stroke="${palette.offPanelStripStroke}" stroke-width="1" />`;
  }
  return `<rect data-off-panel-edge="bottom" x="${fmt(tl.x)}" y="${fmt(tl.y + h - strip)}" width="${fmt(w)}" height="${fmt(strip)}" fill="${palette.offPanelStripFill}" stroke="${palette.offPanelStripStroke}" stroke-width="1" />`;
}

export function renderBalloonTailRoutingSvg(
  doc: PanelBalloonTailDocument,
  resultOrInput: BalloonTailRoutingResult | BalloonTailSvgInput,
  options?: BalloonTailSvgOptions,
): string {
  const theme = options?.theme ?? "light";
  const palette = theme === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
  const panelRect = sanitizeRect(doc.panelBounds);
  const safePanelW = Math.max(120, panelRect.width);
  const safePanelH = Math.max(120, panelRect.height);

  const svgWidth = Math.max(360, sanitizeFinite(options?.width ?? 760, 760));
  const outerPad = 24;
  const headerH = 66;
  const innerW = svgWidth - outerPad * 2;
  const scale = innerW / safePanelW;
  const panelDrawH = safePanelH * scale;
  const svgHeight = Math.round(headerH + outerPad + panelDrawH + outerPad);

  const mapPt = (pt: Vec2): Vec2 => ({
    x: outerPad + (sanitizeFinite(pt.x, 0) - panelRect.x) * scale,
    y: headerH + outerPad + (sanitizeFinite(pt.y, 0) - panelRect.y) * scale,
  });

  const routed = isRoutingResult(resultOrInput);
  const tails = routed ? resultOrInput.routedTails : resultOrInput.tails;
  const audit = routed ? resultOrInput.routedAudit : resultOrInput.audit;
  const baselineTails = routed ? resultOrInput.baselineTails : resultOrInput.baselineTails;
  const baselineAudit = routed ? resultOrInput.baselineAudit : resultOrInput.baselineAudit;

  const showBaselineGhost =
    options?.showBaselineGhost !== undefined
      ? options.showBaselineGhost
      : Boolean(baselineTails && baselineAudit && baselineAudit.totalDefectCount > 0);
  const showSpeakerLabels = options?.showSpeakerLabels ?? true;
  const showDefectMarkers = options?.showDefectMarkers ?? true;

  const titleText = escapeSvgXml(
    options?.title ?? doc.titleKo ?? `컷 '${doc.panelId}' 말풍선 꼬리 자동 라우팅`,
  );

  const badgeColors =
    audit.verdict === "pass"
      ? { bg: palette.badgePassBg, text: palette.badgePassText, label: "통과" }
      : audit.verdict === "warn"
        ? { bg: palette.badgeWarnBg, text: palette.badgeWarnText, label: "주의" }
        : { bg: palette.badgeFailBg, text: palette.badgeFailText, label: "교정 필요" };

  const statusPillText = baselineAudit
    ? `${badgeColors.label} · 결함 ${baselineAudit.totalDefectCount}건 → ${audit.totalDefectCount}건`
    : `${badgeColors.label} · 결함 ${audit.totalDefectCount}건`;

  const subtitleText = escapeSvgXml(
    `화자 ${doc.speakers.length}명 · 말풍선 ${doc.balloons.length}개 · 얼굴 관통 ${audit.faceCrossingCount} · 꼬리 교차 ${audit.tailCrossingCount} · 침범 ${audit.speakerFacePiercingCount}`,
  );

  const elements: string[] = [];
  elements.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(svgWidth, 0)} ${fmt(svgHeight, 0)}" width="${fmt(svgWidth, 0)}" height="${fmt(svgHeight, 0)}" role="img" aria-label="${titleText}">`,
  );
  elements.push(
    `<rect x="0" y="0" width="${fmt(svgWidth, 0)}" height="${fmt(svgHeight, 0)}" fill="${palette.canvasBg}" />`,
  );

  // 상단 헤더 및 전/후 상태 배지
  elements.push(
    `<g data-layer="header">`,
    `<rect x="${fmt(outerPad)}" y="12" width="${fmt(innerW)}" height="${fmt(headerH - 12)}" rx="10" fill="${palette.headerBg}" stroke="${palette.headerBorder}" stroke-width="1" />`,
    `<text x="${fmt(outerPad + 14)}" y="34" fill="${palette.textPrimary}" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="700">${titleText}</text>`,
    `<text x="${fmt(outerPad + 14)}" y="53" fill="${palette.textSecondary}" font-family="system-ui, -apple-system, sans-serif" font-size="11">${subtitleText}</text>`,
    `<rect data-badge="before-after-status" x="${fmt(svgWidth - outerPad - 196)}" y="22" width="184" height="28" rx="14" fill="${badgeColors.bg}" />`,
    `<text x="${fmt(svgWidth - outerPad - 104)}" y="40" text-anchor="middle" fill="${badgeColors.text}" font-family="system-ui, -apple-system, sans-serif" font-size="11.5" font-weight="700">${escapeSvgXml(statusPillText)}</text>`,
    `</g>`,
  );

  // 컷 프레임
  const frameTopLeft = mapPt({ x: panelRect.x, y: panelRect.y });
  elements.push(
    `<g data-layer="panel-frame">`,
    `<rect x="${fmt(frameTopLeft.x)}" y="${fmt(frameTopLeft.y)}" width="${fmt(innerW)}" height="${fmt(panelDrawH)}" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2.4" />`,
  );

  // 오프패널 경계 표시 스트립
  const renderedEdges = new Set<OffPanelEdge>();
  for (let i = 0; i < tails.length; i += 1) {
    const tail = tails[i];
    if (tail?.offPanelEdge && !renderedEdges.has(tail.offPanelEdge)) {
      renderedEdges.add(tail.offPanelEdge);
      elements.push(renderOffPanelEdgeStrip(tail.offPanelEdge, panelRect, mapPt, scale, palette));
    }
  }
  elements.push(`</g>`);

  // 화자 얼굴 영역 및 입 마커
  elements.push(`<g data-layer="speakers">`);
  for (let i = 0; i < doc.speakers.length; i += 1) {
    const sp = doc.speakers[i];
    if (!sp || sp.isOffPanel) continue;
    const face = sanitizeRect(sp.faceBounds);
    if (face.width <= 0 || face.height <= 0) continue;
    const fTopLeft = mapPt({ x: face.x, y: face.y });
    const fw = face.width * scale;
    const fh = face.height * scale;
    const mouth = mapPt(sanitizePoint(sp.mouthPos));
    const safeSpeakerId = escapeSvgXml(sp.speakerId);
    const safeName = escapeSvgXml(sp.nameKo);

    elements.push(
      `<g data-speaker-id="${safeSpeakerId}">`,
      `<rect x="${fmt(fTopLeft.x)}" y="${fmt(fTopLeft.y)}" width="${fmt(fw)}" height="${fmt(fh)}" rx="10" fill="${palette.faceFill}" stroke="${palette.faceStroke}" stroke-width="1.6" />`,
      `<circle cx="${fmt(mouth.x)}" cy="${fmt(mouth.y)}" r="4.2" fill="${palette.mouthFill}" stroke="${palette.mouthRing}" stroke-width="1.5" />`,
      showSpeakerLabels
        ? `<text x="${fmt(fTopLeft.x + fw * 0.5)}" y="${fmt(fTopLeft.y + 16)}" text-anchor="middle" fill="${palette.textPrimary}" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600">${safeName}</text>`
        : "",
      `</g>`,
    );
  }
  elements.push(`</g>`);

  // 기준선(라우팅 전 단순 직선 꼬리) 고스트 오버레이
  if (showBaselineGhost && baselineTails && baselineTails.length > 0) {
    elements.push(`<g data-layer="baseline-ghost">`);
    for (let i = 0; i < baselineTails.length; i += 1) {
      const base = baselineTails[i];
      if (!base) continue;
      const d = buildPolylinePath(base.centerlineSamples, mapPt);
      if (d) {
        elements.push(
          `<path data-baseline-balloon-id="${escapeSvgXml(base.balloonId)}" d="${d}" fill="none" stroke="${palette.baselineGhostStroke}" stroke-width="1.5" stroke-dasharray="4 4" />`,
        );
      }
    }
    elements.push(`</g>`);
  }

  // 라우팅된 꼬리 기하 렌더링
  elements.push(`<g data-layer="balloon-tails">`);
  for (let i = 0; i < tails.length; i += 1) {
    const tail = tails[i];
    if (!tail) continue;
    const styleColors = tailColorsForStyle(tail.tailStyle, palette);
    const safeBalloonId = escapeSvgXml(tail.balloonId);
    const dashAttr = tail.dashedStroke ? ` stroke-dasharray="5 4"` : "";

    if (tail.tailStyle === "thought-bubble-dots") {
      elements.push(`<g data-tail-balloon-id="${safeBalloonId}" data-tail-style="${tail.tailStyle}">`);
      for (let d = 0; d < tail.thoughtDots.length; d += 1) {
        const dot = tail.thoughtDots[d];
        if (!dot) continue;
        const c = mapPt(dot.center);
        elements.push(
          `<circle cx="${fmt(c.x)}" cy="${fmt(c.y)}" r="${fmt(dot.radius * scale)}" fill="${styleColors.fill}" stroke="${styleColors.stroke}" stroke-width="${fmt(styleColors.strokeWidth, 1)}" />`,
        );
      }
      elements.push(`</g>`);
    } else {
      const mBaseL = mapPt(tail.baseLeft);
      const mCtrlL = mapPt(tail.leftControl);
      const mTip = mapPt(tail.tip);
      const mCtrlR = mapPt(tail.rightControl);
      const mBaseR = mapPt(tail.baseRight);
      const pathD = [
        `M ${fmt(mBaseL.x)} ${fmt(mBaseL.y)}`,
        `Q ${fmt(mCtrlL.x)} ${fmt(mCtrlL.y)} ${fmt(mTip.x)} ${fmt(mTip.y)}`,
        `Q ${fmt(mCtrlR.x)} ${fmt(mCtrlR.y)} ${fmt(mBaseR.x)} ${fmt(mBaseR.y)}`,
        "Z",
      ].join(" ");
      elements.push(
        `<path data-tail-balloon-id="${safeBalloonId}" data-tail-style="${tail.tailStyle}" d="${pathD}" fill="${styleColors.fill}" stroke="${styleColors.stroke}" stroke-width="${fmt(styleColors.strokeWidth, 1)}" stroke-linejoin="round"${dashAttr} />`,
      );
    }
  }
  elements.push(`</g>`);

  // 타원 말풍선 본체
  elements.push(`<g data-layer="speech-balloons">`);
  for (let i = 0; i < doc.balloons.length; i += 1) {
    const b = doc.balloons[i];
    if (!b) continue;
    const center = mapPt({ x: b.centerX, y: b.centerY });
    const rx = Math.max(8, sanitizeFinite(b.rx, 48) * scale);
    const ry = Math.max(8, sanitizeFinite(b.ry, 32) * scale);
    const styleColors = tailColorsForStyle(b.tailStyle, palette);
    const dashAttr = BALLOON_TAIL_STYLE_PRESETS[b.tailStyle].dashedStroke ? ` stroke-dasharray="5 4"` : "";
    const label = escapeSvgXml(b.dialoguePreviewKo ?? `${b.balloonId}`);
    elements.push(
      `<g data-balloon-id="${escapeSvgXml(b.balloonId)}">`,
      `<ellipse cx="${fmt(center.x)}" cy="${fmt(center.y)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="${palette.balloonFill}" stroke="${styleColors.stroke}" stroke-width="${fmt(styleColors.strokeWidth, 1)}"${dashAttr} />`,
      `<text x="${fmt(center.x)}" y="${fmt(center.y + 4)}" text-anchor="middle" fill="${palette.textPrimary}" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600">${label}</text>`,
      `</g>`,
    );
  }
  elements.push(`</g>`);

  // 남은 결함 마커
  if (showDefectMarkers && audit.defects.length > 0) {
    elements.push(`<g data-layer="defect-markers">`);
    for (let i = 0; i < audit.defects.length; i += 1) {
      const defect = audit.defects[i];
      if (!defect) continue;
      const pt = mapPt(defect.intersectionPoint);
      elements.push(
        `<circle data-defect-kind="${defect.kind}" cx="${fmt(pt.x)}" cy="${fmt(pt.y)}" r="9" fill="${palette.defectFill}" stroke="${palette.defectStroke}" stroke-width="2" />`,
      );
    }
    elements.push(`</g>`);
  }

  elements.push(`</svg>`);
  return elements.filter(Boolean).join("\n");
}

export function summarizeBalloonTailRoutingKo(
  doc: PanelBalloonTailDocument,
  result: BalloonTailRoutingResult,
): BalloonTailQaBriefKo {
  const audit = result.routedAudit;
  const cmp = result.comparison;
  const verdictKo: BalloonTailQaBriefKo["verdictKo"] =
    audit.verdict === "pass" ? "통과" : audit.verdict === "warn" ? "주의" : "교정 필요";

  const headlineKo =
    audit.passed
      ? `컷 '${doc.panelId}' 말풍선 꼬리 ${result.routedTails.length}건 라우팅 통과 — 얼굴 관통·꼬리 교차 0건`
      : `컷 '${doc.panelId}' 말풍선 꼬리 ${audit.totalDefectCount}건 교정 필요 — 얼굴 관통 ${audit.faceCrossingCount}건, 꼬리 교차 ${audit.tailCrossingCount}건`;

  const summaryLineKo = `화자 ${doc.speakers.length}명과 말풍선 ${doc.balloons.length}개를 대상으로 후보 ${result.evaluatedCandidateCount}건을 검토했습니다.`;

  const beforeAfterLineKo =
    cmp.baselineDefectCount > 0
      ? `단순 직선 꼬리 대비 결함을 ${cmp.baselineDefectCount}건에서 ${cmp.routedDefectCount}건으로 줄였습니다(얼굴 관통 ${cmp.baselineFaceCrossings}→${cmp.routedFaceCrossings}, 꼬리 교차 ${cmp.baselineTailCrossings}→${cmp.routedTailCrossings}, 화자 침범 ${cmp.baselineFacePiercings}→${cmp.routedFacePiercings}, 조준 모호 ${cmp.baselineAmbiguousAims}→${cmp.routedAmbiguousAims}).`
      : `단순 직선 배치 단계부터 결함이 없었으며, 곡선 스탠드오프 정렬 후에도 0건을 유지했습니다.`;

  const styleCounts = new Map<BalloonTailStyleId, number>();
  for (let i = 0; i < result.routedTails.length; i += 1) {
    const t = result.routedTails[i];
    if (!t) continue;
    styleCounts.set(t.tailStyle, (styleCounts.get(t.tailStyle) ?? 0) + 1);
  }
  const styleParts: string[] = [];
  for (let i = 0; i < BALLOON_TAIL_STYLE_IDS.length; i += 1) {
    const id = BALLOON_TAIL_STYLE_IDS[i];
    if (!id) continue;
    const count = styleCounts.get(id) ?? 0;
    if (count > 0) {
      styleParts.push(`${BALLOON_TAIL_STYLE_PRESETS[id].labelKo} ${count}건`);
    }
  }
  const styleBreakdownLineKo =
    styleParts.length > 0
      ? `꼬리 유형 구성: ${styleParts.join(", ")}.`
      : "배치된 말풍선 꼬리가 없습니다.";

  const actionLinesKo: string[] = [];
  if (audit.defects.length === 0 && audit.missingSpeakerBalloonIds.length === 0) {
    actionLinesKo.push("추가 손수정 없이 식자 출력 단계로 넘겨도 됩니다.");
  } else {
    for (let i = 0; i < audit.defects.length; i += 1) {
      const defect = audit.defects[i];
      if (defect) actionLinesKo.push(defect.detailKo);
    }
    if (audit.missingSpeakerBalloonIds.length > 0) {
      actionLinesKo.push(
        `화자 정보가 연결되지 않은 말풍선(${audit.missingSpeakerBalloonIds.join(", ")})의 speakerId를 확인하세요.`,
      );
    }
  }

  const fullTextKo = [
    `[${verdictKo}] ${headlineKo}`,
    summaryLineKo,
    beforeAfterLineKo,
    styleBreakdownLineKo,
    ...actionLinesKo.map((line) => `- ${line}`),
  ].join("\n");

  return {
    verdictKo,
    headlineKo,
    summaryLineKo,
    beforeAfterLineKo,
    styleBreakdownLineKo,
    actionLinesKo,
    fullTextKo,
  };
}
