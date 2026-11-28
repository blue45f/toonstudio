/**
 * Wave 137 — 순수 OKLCH 시선 동선·무게중심·컷 전환 핸드오프 SVG 렌더러 및
 * 한국어 연출 QA 브리프 생성기.
 *
 * - 원시 색상 표기를 전혀 쓰지 않고 순수 `oklch(...)` 팔레트만 사용한다.
 * - 모든 텍스트 노드의 XML/XSS 특수문자(`<`, `>`, `&`, `"`, `'`)를 이스케이프한다.
 */

import {
  GAZE_ELEMENT_LABELS_KO,
  GAZE_PATTERN_LABELS_KO,
  GAZE_VIOLATION_LABELS_KO,
  READING_DIRECTION_LABELS_KO,
  type BalloonOptimizationOutcome,
  type CutHandoffAuditResult,
  type EpisodeGazeAuditResult,
  type GazeElementKind,
  type GazeFlowSvgOptions,
  type GazeFlowViolation,
  type PanelGazeAuditResult,
} from "./gaze-flow-types";
import { round2, sanitizeFinite } from "./visual-weight-and-reading-order";

const OKLCH_PALETTE = {
  canvasBg: "oklch(0.985 0.006 90)",
  headerBg: "oklch(0.955 0.012 155)",
  cardBg: "oklch(0.996 0.003 90)",
  panelCanvasBg: "oklch(0.978 0.007 95)",
  borderStrong: "oklch(0.26 0.044 160)",
  borderSoft: "oklch(0.84 0.014 90)",
  textPrimary: "oklch(0.2 0.028 160)",
  textMuted: "oklch(0.45 0.024 160)",
  textInverse: "oklch(0.985 0.004 90)",
  gazePathOk: "oklch(0.42 0.14 160)",
  gazePathWarn: "oklch(0.54 0.19 28)",
  stepBadgeBg: "oklch(0.28 0.055 162)",
  stepBadgeWarnBg: "oklch(0.5 0.21 26)",
  comRing: "oklch(0.52 0.17 55)",
  comFill: "oklch(0.68 0.16 62 / 0.24)",
  intersectionFill: "oklch(0.52 0.22 24)",
  handoffOk: "oklch(0.46 0.13 180)",
  handoffJump: "oklch(0.52 0.21 25)",
  sightlineOk: "oklch(0.48 0.11 235)",
  sightlineLeak: "oklch(0.54 0.22 25)",
  badgeErrorBg: "oklch(0.92 0.06 25)",
  badgeErrorText: "oklch(0.42 0.18 25)",
  badgeWarnBg: "oklch(0.94 0.055 78)",
  badgeWarnText: "oklch(0.43 0.13 68)",
  badgeOkBg: "oklch(0.93 0.04 155)",
  badgeOkText: "oklch(0.34 0.1 158)",
  patternChipBg: "oklch(0.92 0.025 225)",
  patternChipText: "oklch(0.32 0.075 230)",
} as const;

const ELEMENT_FILL_OKLCH: Readonly<Record<GazeElementKind, string>> = {
  "dialogue-balloon": "oklch(0.99 0.006 90 / 0.92)",
  "character-face": "oklch(0.91 0.052 58 / 0.78)",
  "action-focal": "oklch(0.9 0.068 28 / 0.65)",
  "sfx-lettering": "oklch(0.91 0.056 295 / 0.68)",
  "lead-line-arrow": "oklch(0.92 0.05 195 / 0.65)",
};

const ELEMENT_STROKE_OKLCH: Readonly<Record<GazeElementKind, string>> = {
  "dialogue-balloon": "oklch(0.34 0.04 160)",
  "character-face": "oklch(0.52 0.14 48)",
  "action-focal": "oklch(0.5 0.19 26)",
  "sfx-lettering": "oklch(0.48 0.15 295)",
  "lead-line-arrow": "oklch(0.44 0.13 200)",
};

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/**
 * SVG/XML 출력용 문자열을 XSS 및 마크업 깨짐 방지를 위해 완전 이스케이프한다.
 */
export function escapeGazeFlowXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncateLabel(raw: string, maxChars: number): string {
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, Math.max(1, maxChars - 1))}…`;
}

function scoreColorOklch(score: number): string {
  if (score >= 80) return OKLCH_PALETTE.badgeOkText;
  if (score >= 55) return OKLCH_PALETTE.badgeWarnText;
  return OKLCH_PALETTE.badgeErrorText;
}

interface PanelLayoutRect {
  readonly panelAudit: PanelGazeAuditResult;
  readonly cardX: number;
  readonly cardY: number;
  readonly cardW: number;
  readonly cardH: number;
  readonly frameX: number;
  readonly frameY: number;
  readonly frameW: number;
  readonly frameH: number;
}

function renderSinglePanelLayer(
  rect: PanelLayoutRect,
  showCenterOfMass: boolean,
): string[] {
  const { panelAudit, cardX, cardY, cardW, cardH, frameX, frameY, frameW, frameH } = rect;
  const { panel, visualMass, gazePath, intersections, outwardLeaks, violations } = panelAudit;
  const out: string[] = [];

  const hasError = violations.some((v) => v.severity === "error");
  const cardStroke = hasError ? OKLCH_PALETTE.gazePathWarn : OKLCH_PALETTE.borderSoft;

  out.push(
    `<g data-panel-id="${escapeGazeFlowXml(panel.panelId)}">`,
    `<rect x="${fmt(cardX)}" y="${fmt(cardY)}" width="${fmt(cardW)}" height="${fmt(cardH)}" rx="12" fill="${OKLCH_PALETTE.cardBg}" stroke="${cardStroke}" stroke-width="${hasError ? "1.8" : "1.2"}" />`,
  );

  // 컷 헤더
  const titleText = truncateLabel(`${panel.panelId} · ${panel.titleKo}`, 22);
  out.push(
    `<text x="${fmt(cardX + 12)}" y="${fmt(cardY + 20)}" font-size="11.5" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${escapeGazeFlowXml(titleText)}</text>`,
    `<text x="${fmt(cardX + cardW - 12)}" y="${fmt(cardY + 20)}" text-anchor="end" font-size="11" font-weight="700" fill="${scoreColorOklch(panelAudit.panelFlowScore)}">${fmt(panelAudit.panelFlowScore)}점</text>`,
  );

  // 패턴 칩 및 균형 지표
  const patternLabel = GAZE_PATTERN_LABELS_KO[panelAudit.pattern];
  out.push(
    `<rect x="${fmt(cardX + 12)}" y="${fmt(cardY + 28)}" width="112" height="18" rx="9" fill="${OKLCH_PALETTE.patternChipBg}" />`,
    `<text x="${fmt(cardX + 68)}" y="${fmt(cardY + 40)}" text-anchor="middle" font-size="9.5" font-weight="600" fill="${OKLCH_PALETTE.patternChipText}">${escapeGazeFlowXml(patternLabel)}</text>`,
    `<text x="${fmt(cardX + cardW - 12)}" y="${fmt(cardY + 40)}" text-anchor="end" font-size="9.5" fill="${OKLCH_PALETTE.textMuted}">균형 ${fmt(visualMass.visualBalanceScore)}%</text>`,
  );

  // 컷 프레임
  out.push(
    `<rect x="${fmt(frameX)}" y="${fmt(frameY)}" width="${fmt(frameW)}" height="${fmt(frameH)}" rx="6" fill="${OKLCH_PALETTE.panelCanvasBg}" stroke="${OKLCH_PALETTE.borderStrong}" stroke-width="1.2" />`,
  );

  const leakIdSet = new Set(outwardLeaks.map((l) => l.elementId));

  // 요소 박스 및 얼굴/유도선 시선 벡터
  for (let i = 0; i < panel.elements.length; i += 1) {
    const el = panel.elements[i];
    if (!el) continue;
    const ex = frameX + el.x * frameW;
    const ey = frameY + el.y * frameH;
    const ew = Math.max(8, el.width * frameW);
    const eh = Math.max(8, el.height * frameH);
    const rx = el.kind === "dialogue-balloon" ? Math.min(12, eh / 2) : el.kind === "character-face" ? 8 : 4;
    const stroke = leakIdSet.has(el.elementId)
      ? OKLCH_PALETTE.sightlineLeak
      : ELEMENT_STROKE_OKLCH[el.kind];

    out.push(
      `<rect x="${fmt(ex)}" y="${fmt(ey)}" width="${fmt(ew)}" height="${fmt(eh)}" rx="${fmt(rx)}" fill="${ELEMENT_FILL_OKLCH[el.kind]}" stroke="${stroke}" stroke-width="${leakIdSet.has(el.elementId) ? "1.8" : "1.1"}" />`,
    );

    const shortName = truncateLabel(
      el.scriptOrder !== null ? `#${el.scriptOrder} ${el.labelKo}` : el.labelKo,
      12,
    );
    out.push(
      `<text x="${fmt(ex + ew / 2)}" y="${fmt(ey + eh / 2 + 3)}" text-anchor="middle" font-size="8.5" fill="${OKLCH_PALETTE.textPrimary}">${escapeGazeFlowXml(shortName)}</text>`,
    );

    if (el.gazeDir) {
      const rayLen = Math.min(frameW, frameH) * 0.24;
      const sx = frameX + el.cx * frameW;
      const sy = frameY + el.cy * frameH;
      const tx = sx + el.gazeDir.dx * rayLen;
      const ty = sy + el.gazeDir.dy * rayLen;
      const isLeak = leakIdSet.has(el.elementId);
      const rayColor = isLeak ? OKLCH_PALETTE.sightlineLeak : OKLCH_PALETTE.sightlineOk;
      const rayMarker = isLeak ? "w137-arrow-warn" : "w137-arrow-sight";
      out.push(
        `<line x1="${fmt(sx)}" y1="${fmt(sy)}" x2="${fmt(tx)}" y2="${fmt(ty)}" stroke="${rayColor}" stroke-width="1.5" stroke-dasharray="4 2" marker-end="url(#${rayMarker})" />`,
      );
    }
  }

  // 번호 매겨진 시선 동선 화살표
  const pathStroke =
    intersections.length > 0 || panelAudit.reversals.length > 0
      ? OKLCH_PALETTE.gazePathWarn
      : OKLCH_PALETTE.gazePathOk;
  const pathMarker =
    intersections.length > 0 || panelAudit.reversals.length > 0
      ? "w137-arrow-warn"
      : "w137-arrow-ok";

  for (let i = 0; i < gazePath.length - 1; i += 1) {
    const a = gazePath[i];
    const b = gazePath[i + 1];
    if (!a || !b) continue;
    const x1 = frameX + a.center.x * frameW;
    const y1 = frameY + a.center.y * frameH;
    const x2 = frameX + b.center.x * frameW;
    const y2 = frameY + b.center.y * frameH;
    out.push(
      `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="${pathStroke}" stroke-width="2.1" marker-end="url(#${pathMarker})" />`,
    );
  }

  // 시선 교차 경고 마커
  for (let i = 0; i < intersections.length; i += 1) {
    const hit = intersections[i];
    if (!hit) continue;
    const ix = frameX + hit.point.x * frameW;
    const iy = frameY + hit.point.y * frameH;
    out.push(
      `<circle cx="${fmt(ix)}" cy="${fmt(iy)}" r="6" fill="${OKLCH_PALETTE.intersectionFill}" />`,
      `<text x="${fmt(ix)}" y="${fmt(iy + 3)}" text-anchor="middle" font-size="8.5" font-weight="700" fill="${OKLCH_PALETTE.textInverse}">X</text>`,
    );
  }

  // 번호 스텝 뱃지
  const badgeBg =
    intersections.length > 0 || panelAudit.reversals.length > 0
      ? OKLCH_PALETTE.stepBadgeWarnBg
      : OKLCH_PALETTE.stepBadgeBg;
  for (let i = 0; i < gazePath.length; i += 1) {
    const node = gazePath[i];
    if (!node) continue;
    const nx = frameX + node.center.x * frameW;
    const ny = frameY + node.center.y * frameH;
    out.push(
      `<circle cx="${fmt(nx)}" cy="${fmt(ny)}" r="8.5" fill="${badgeBg}" stroke="${OKLCH_PALETTE.cardBg}" stroke-width="1.4" />`,
      `<text x="${fmt(nx)}" y="${fmt(ny + 3.2)}" text-anchor="middle" font-size="9" font-weight="700" fill="${OKLCH_PALETTE.textInverse}">${i + 1}</text>`,
    );
  }

  // 시각적 무게중심 십자선(Center of Visual Mass)
  if (showCenterOfMass && panel.elements.length > 0) {
    const cx = frameX + visualMass.centerOfVisualMass.x * frameW;
    const cy = frameY + visualMass.centerOfVisualMass.y * frameH;
    out.push(
      `<g data-role="center-of-visual-mass">`,
      `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="10" fill="${OKLCH_PALETTE.comFill}" stroke="${OKLCH_PALETTE.comRing}" stroke-width="1.3" />`,
      `<line x1="${fmt(cx - 13)}" y1="${fmt(cy)}" x2="${fmt(cx + 13)}" y2="${fmt(cy)}" stroke="${OKLCH_PALETTE.comRing}" stroke-width="1.2" />`,
      `<line x1="${fmt(cx)}" y1="${fmt(cy - 13)}" x2="${fmt(cx)}" y2="${fmt(cy + 13)}" stroke="${OKLCH_PALETTE.comRing}" stroke-width="1.2" />`,
      `</g>`,
    );
  }

  // 하단 위반 뱃지 영역
  const badgeY = frameY + frameH + 10;
  if (violations.length === 0) {
    out.push(
      `<rect x="${fmt(cardX + 12)}" y="${fmt(badgeY)}" width="${fmt(cardW - 24)}" height="20" rx="6" fill="${OKLCH_PALETTE.badgeOkBg}" />`,
      `<text x="${fmt(cardX + cardW / 2)}" y="${fmt(badgeY + 13.5)}" text-anchor="middle" font-size="9.5" font-weight="600" fill="${OKLCH_PALETTE.badgeOkText}">시선 흐름 정상 · 역독 0 · 교차 0</text>`,
    );
  } else {
    const uniqueCodes = Array.from(new Set(violations.map((v) => v.code))).slice(0, 3);
    const chipGap = 6;
    const chipW = (cardW - 24 - chipGap * (uniqueCodes.length - 1)) / uniqueCodes.length;
    for (let i = 0; i < uniqueCodes.length; i += 1) {
      const code = uniqueCodes[i];
      if (!code) continue;
      const isErr = violations.some((v) => v.code === code && v.severity === "error");
      const bx = cardX + 12 + i * (chipW + chipGap);
      out.push(
        `<rect x="${fmt(bx)}" y="${fmt(badgeY)}" width="${fmt(chipW)}" height="20" rx="6" fill="${isErr ? OKLCH_PALETTE.badgeErrorBg : OKLCH_PALETTE.badgeWarnBg}" />`,
        `<text x="${fmt(bx + chipW / 2)}" y="${fmt(badgeY + 13.5)}" text-anchor="middle" font-size="9" font-weight="700" fill="${isErr ? OKLCH_PALETTE.badgeErrorText : OKLCH_PALETTE.badgeWarnText}">${escapeGazeFlowXml(GAZE_VIOLATION_LABELS_KO[code])}</text>`,
      );
    }
  }

  out.push(`</g>`);
  return out;
}

function renderHandoffBridgeLayer(
  handoff: CutHandoffAuditResult,
  fromRect: PanelLayoutRect,
  toRect: PanelLayoutRect,
): string[] {
  const sx = fromRect.frameX + handoff.exitPoint.x * fromRect.frameW;
  const sy = fromRect.frameY + handoff.exitPoint.y * fromRect.frameH;
  const ex = toRect.frameX + handoff.entryPoint.x * toRect.frameW;
  const ey = toRect.frameY + handoff.entryPoint.y * toRect.frameH;
  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2;
  const ctrlX = mx + (handoff.abruptJumpDetected ? 24 : 10);

  const stroke = handoff.abruptJumpDetected ? OKLCH_PALETTE.handoffJump : OKLCH_PALETTE.handoffOk;
  const marker = handoff.abruptJumpDetected ? "w137-arrow-warn" : "w137-arrow-handoff";
  const dashAttr = handoff.abruptJumpDetected ? ` stroke-dasharray="6 4"` : "";
  const label = handoff.abruptJumpDetected
    ? `급도약 ${round2(handoff.effectiveJumpRatio * 100)}%`
    : `연속 ${round2(handoff.handoffScore)}점`;

  const pillX = Math.max(12, mx - 46);
  const pillY = my - 10;

  return [
    `<g data-handoff="${escapeGazeFlowXml(`${handoff.fromPanelId}->${handoff.toPanelId}`)}">`,
    `<path d="M ${fmt(sx)} ${fmt(sy)} Q ${fmt(ctrlX)} ${fmt(my)} ${fmt(ex)} ${fmt(ey)}" fill="none" stroke="${stroke}" stroke-width="2.2"${dashAttr} marker-end="url(#${marker})" />`,
    `<rect x="${fmt(pillX)}" y="${fmt(pillY)}" width="92" height="20" rx="10" fill="${handoff.abruptJumpDetected ? OKLCH_PALETTE.badgeErrorBg : OKLCH_PALETTE.badgeOkBg}" stroke="${stroke}" stroke-width="1" />`,
    `<text x="${fmt(pillX + 46)}" y="${fmt(pillY + 13.5)}" text-anchor="middle" font-size="9" font-weight="700" fill="${handoff.abruptJumpDetected ? OKLCH_PALETTE.badgeErrorText : OKLCH_PALETTE.badgeOkText}">${escapeGazeFlowXml(label)}</text>`,
    `</g>`,
  ];
}

/**
 * 멀티 컷 시선 동선 화살표·무게중심 십자선·컷 간 핸드오프 브리지·위반 뱃지를
 * 순수 `oklch(...)` SVG 문자열로 렌더링한다.
 */
export function renderEpisodeGazeFlowSvg(
  audit: EpisodeGazeAuditResult,
  options?: GazeFlowSvgOptions,
): string {
  const thumbW = Math.round(sanitizeFinite(options?.panelThumbWidthPx, 256, 160, 520));
  const maxThumbH = Math.round(sanitizeFinite(options?.maxPanelThumbHeightPx, 340, 140, 680));
  const panelGap = Math.round(sanitizeFinite(options?.panelGapPx, 54, 24, 160));
  const includeHeader = options?.includeHeader !== false;
  const showCenterOfMass = options?.showCenterOfMass !== false;

  const padX = 24;
  const padY = 20;
  const headerH = includeHeader ? 72 : 0;
  const cardPadX = 12;
  const cardHeaderH = 54;
  const cardFooterH = 38;
  const cardW = thumbW + cardPadX * 2;
  const isVerticalStack = audit.readingDirection === "vertical-webtoon-ltr";

  const rects: PanelLayoutRect[] = [];
  let cursorX = padX;
  let cursorY = padY + headerH;
  let maxRight: number;
  let maxBottom = cursorY + 120;

  if (isVerticalStack) {
    for (let i = 0; i < audit.panels.length; i += 1) {
      const p = audit.panels[i];
      if (!p) continue;
      const frameH = Math.round(
        Math.max(120, Math.min(maxThumbH, thumbW / Math.max(0.35, p.panel.aspectRatio))),
      );
      const cardH = cardHeaderH + frameH + cardFooterH;
      rects.push({
        panelAudit: p,
        cardX: padX,
        cardY: cursorY,
        cardW,
        cardH,
        frameX: padX + cardPadX,
        frameY: cursorY + cardHeaderH,
        frameW: thumbW,
        frameH,
      });
      cursorY += cardH + panelGap;
      maxBottom = Math.max(maxBottom, cursorY);
    }
    maxRight = Math.max(420, cardW + padX * 2);
  } else {
    const orderedPanels =
      audit.readingDirection === "manga-rtl"
        ? audit.panels.slice().reverse()
        : audit.panels.slice();
    const rowH = Math.round(Math.min(maxThumbH, thumbW * 1.15));
    const cardH = cardHeaderH + rowH + cardFooterH;
    const rectByPanelIndex = new Map<number, PanelLayoutRect>();
    for (let col = 0; col < orderedPanels.length; col += 1) {
      const p = orderedPanels[col];
      if (!p) continue;
      const frameH = Math.round(
        Math.max(120, Math.min(rowH, thumbW / Math.max(0.45, p.panel.aspectRatio))),
      );
      const cardX = padX + col * (cardW + panelGap);
      const rect: PanelLayoutRect = {
        panelAudit: p,
        cardX,
        cardY: cursorY,
        cardW,
        cardH,
        frameX: cardX + cardPadX,
        frameY: cursorY + cardHeaderH + Math.round((rowH - frameH) / 2),
        frameW: thumbW,
        frameH,
      };
      rectByPanelIndex.set(p.panelIndex, rect);
      cursorX = cardX + cardW + padX;
    }
    for (let i = 0; i < audit.panels.length; i += 1) {
      const rect = rectByPanelIndex.get(i);
      if (rect) rects.push(rect);
    }
    maxRight = Math.max(440, cursorX);
    maxBottom = cursorY + cardH + padY;
  }

  const totalW = Math.max(420, Math.round(maxRight));
  const totalH = Math.max(220, Math.round(maxBottom));

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" role="img" aria-label="${escapeGazeFlowXml(`${audit.titleKo} 시선 동선 감사 오버레이`)}">`,
    `<defs>`,
    `<marker id="w137-arrow-ok" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="${OKLCH_PALETTE.gazePathOk}" /></marker>`,
    `<marker id="w137-arrow-warn" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="${OKLCH_PALETTE.gazePathWarn}" /></marker>`,
    `<marker id="w137-arrow-sight" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse"><path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="${OKLCH_PALETTE.sightlineOk}" /></marker>`,
    `<marker id="w137-arrow-handoff" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="${OKLCH_PALETTE.handoffOk}" /></marker>`,
    `</defs>`,
    `<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="${OKLCH_PALETTE.canvasBg}" />`,
  ];

  if (includeHeader) {
    const dirLabel = READING_DIRECTION_LABELS_KO[audit.readingDirection];
    const headerTitle = truncateLabel(`${audit.titleKo} · 시선 동선 QA`, 38);
    const shortHash = audit.manifestSha256.slice(0, 12);
    lines.push(
      `<rect x="${padX}" y="${padY}" width="${totalW - padX * 2}" height="56" rx="12" fill="${OKLCH_PALETTE.headerBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
      `<text x="${padX + 16}" y="${padY + 23}" font-size="13.5" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${escapeGazeFlowXml(headerTitle)}</text>`,
      `<text x="${padX + 16}" y="${padY + 42}" font-size="10.5" fill="${OKLCH_PALETTE.textMuted}">${escapeGazeFlowXml(`${dirLabel} · ${audit.panels.length}컷 · 위반 ${audit.violations.length}건 · SHA ${shortHash}`)}</text>`,
      `<text x="${totalW - padX - 16}" y="${padY + 34}" text-anchor="end" font-size="16" font-weight="700" fill="${scoreColorOklch(audit.overallGazeFlowScore)}">${fmt(audit.overallGazeFlowScore)}점</text>`,
    );
  }

  for (let i = 0; i < rects.length; i += 1) {
    const rect = rects[i];
    if (rect) {
      lines.push(...renderSinglePanelLayer(rect, showCenterOfMass));
    }
  }

  for (let i = 0; i < audit.handoffs.length; i += 1) {
    const handoff = audit.handoffs[i];
    if (!handoff) continue;
    const fromRect = rects[handoff.fromPanelIndex];
    const toRect = rects[handoff.toPanelIndex];
    if (fromRect && toRect) {
      lines.push(...renderHandoffBridgeLayer(handoff, fromRect, toRect));
    }
  }

  lines.push(`</svg>`);
  return lines.join("\n");
}

function gradeKo(score: number): string {
  if (score >= 85) return "우수 (연재 즉시 배포 가능)";
  if (score >= 70) return "양호 (경미한 시선 정리 권장)";
  if (score >= 50) return "주의 (컷 내 역독·도약 수정 필요)";
  return "보완 필수 (시선 엉킴 및 끊김 심각)";
}

function formatViolationLineKo(v: GazeFlowViolation): string {
  const tag = v.severity === "error" ? "필수 수정" : "권장 수정";
  const label = GAZE_VIOLATION_LABELS_KO[v.code];
  const scope = v.nextPanelId ? `${v.panelId} → ${v.nextPanelId}` : v.panelId;
  return `- [${tag} · ${label} · ${scope}] ${v.messageKo}`;
}

/**
 * 시선 동선·무게중심·컷 전환 감사 결과를 번역투 없는 실무 한국어 연출 QA 브리프로 요약한다.
 */
export function summarizeEpisodeGazeFlowKo(
  audit: EpisodeGazeAuditResult,
  optimization?: BalloonOptimizationOutcome,
): string {
  const lines: string[] = [
    `[연출 시선 동선 QA 브리프] ${audit.titleKo} (${audit.episodeId})`,
    `읽기 방향: ${READING_DIRECTION_LABELS_KO[audit.readingDirection]}`,
    `종합 점수: ${round2(audit.overallGazeFlowScore)}점 — ${gradeKo(audit.overallGazeFlowScore)}`,
    `세부 지표: 컷 내부 흐름 ${round2(audit.averagePanelFlowScore)}점 · 시각 균형 ${round2(audit.averageVisualBalanceScore)}점 · 컷 전환 연속성 ${round2(audit.averageHandoffScore)}점`,
    `검출 요약: 말풍선 역독 ${audit.violationCounts["balloon-reading-order-reversal"]}건 · 시선 경로 교차 ${audit.violationCounts["self-intersecting-gaze-path"]}건 · 컷 전환 급도약 ${audit.violationCounts["abrupt-handoff-jump"]}건 · 외곽 시선 이탈 ${audit.violationCounts["outward-gaze-leak"]}건`,
    "",
    "1. 컷별 시선 동선 및 무게중심 진단",
  ];

  for (let i = 0; i < audit.panels.length; i += 1) {
    const p = audit.panels[i];
    if (!p) continue;
    const comX = Math.round(p.visualMass.centerOfVisualMass.x * 100);
    const comY = Math.round(p.visualMass.centerOfVisualMass.y * 100);
    const biasText =
      Math.abs(p.visualMass.horizontalBias) < 0.14
        ? "좌우 균형 안정"
        : p.visualMass.horizontalBias > 0
          ? "우측 치우침"
          : "좌측 치우침";
    const elementSummary = p.panel.elements
      .slice(0, 3)
      .map((el) => GAZE_ELEMENT_LABELS_KO[el.kind])
      .join("·");
    lines.push(
      `- ${p.panel.panelId}(${p.panel.titleKo}): ${GAZE_PATTERN_LABELS_KO[p.pattern]} · ${round2(p.panelFlowScore)}점 · 무게중심(${comX}%, ${comY}%, ${biasText}) · 평균 꺾임 ${round2(p.meanTurnAngleDeg)}도${elementSummary.length > 0 ? ` · 주요 요소(${elementSummary})` : ""}`,
    );
  }

  if (audit.handoffs.length > 0) {
    lines.push("", "2. 연속 컷 시선 핸드오프 진단");
    for (let i = 0; i < audit.handoffs.length; i += 1) {
      const h = audit.handoffs[i];
      if (!h) continue;
      const status = h.abruptJumpDetected ? "급격한 시선 끊김" : "자연스러운 연결";
      lines.push(
        `- ${h.fromPanelId} → ${h.toPanelId}: ${status} (도약 ${round2(h.effectiveJumpRatio * 100)}%, 방향 정합성 ${round2(h.exitVectorAlignment)}, ${round2(h.handoffScore)}점)`,
      );
    }
  }

  lines.push("", "3. 연출 수정 지시 사항");
  if (audit.violations.length === 0) {
    lines.push("- 역독, 시선 교차, 외곽 이탈, 급격한 컷 전환 도약 없이 매끄럽게 읽힙니다.");
  } else {
    for (let i = 0; i < audit.violations.length; i += 1) {
      const v = audit.violations[i];
      if (v) lines.push(formatViolationLineKo(v));
    }
  }

  if (optimization) {
    lines.push(
      "",
      "4. 말풍선 자동 교정 결과",
      `- 재배치 말풍선 ${optimization.adjustments.length}개 (${optimization.optimizedPanelIds.length}개 컷 적용) · 종합 점수 ${optimization.scoreDelta >= 0 ? "+" : ""}${round2(optimization.scoreDelta)}점 변화`,
      `- 교정 후 잔여 역독 ${optimization.remainingReversals}건 · 잔여 시선 교차 ${optimization.remainingIntersections}건 · 캐릭터 얼굴 가림 없음(${optimization.allFacesCleared ? "통과" : "확인 필요"}) · 안전 여백 유지(${optimization.allInsideSafeMargin ? "통과" : "확인 필요"})`,
    );
  }

  lines.push("", `매니페스트 지문(SHA-256): ${audit.manifestSha256}`);
  return lines.join("\n");
}
