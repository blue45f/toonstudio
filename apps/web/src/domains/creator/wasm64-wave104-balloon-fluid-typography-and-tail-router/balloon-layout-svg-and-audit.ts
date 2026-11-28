/**
 * Wave 104 — 고대비 인쇄 안전 OKLCH 말풍선 배치 SVG 다이어그램 및 한국어 식자 검수 요약.
 *
 * - 원시 16진수/RGB 색상 없이 OKLCH 색상 토큰만 사용
 * - 패널 외곽, 안전 여백 가이드, 빗금 얼굴 회피 영역, 번호 매긴 시선 흐름(1 → 2 → 3),
 *   5종 말풍선 형태, 곡선 베지어 꼬리·생각 방울 꼬리, 중앙 정렬 한국어 조판 텍스트 렌더링
 * - NaN/Infinity 차단 및 XML 특수문자 이스케이프 보장
 */

import type { Rect2D } from "./balloon-geometry-primitives";
import type { BalloonShapeKind } from "./korean-balloon-typography-solver";
import type {
  PanelBalloonLayoutResult,
  PlacedPanelBalloon,
  ReadingOrderMode,
} from "./obstacle-avoiding-balloon-and-tail-router";

export type BalloonSvgTheme = "light" | "dark";

export interface BalloonLayoutSvgOptions {
  readonly theme?: BalloonSvgTheme;
  readonly showSafeMarginGuide?: boolean;
  readonly showFaceKeepOutZones?: boolean;
  readonly showReadingFlow?: boolean;
  readonly showSpeakerMouthMarkers?: boolean;
  readonly title?: string;
}

export type BalloonAuditVerdict = "pass" | "warn" | "fail";

export interface BalloonLayoutAuditSummaryKo {
  readonly panelId: string;
  readonly verdict: BalloonAuditVerdict;
  readonly verdictLabelKo: string;
  readonly readingOrderLabelKo: string;
  readonly headlineKo: string;
  readonly summaryParagraphKo: string;
  readonly bulletLinesKo: readonly string[];
}

interface OklchSvgPalette {
  readonly canvasBg: string;
  readonly panelBg: string;
  readonly panelBorder: string;
  readonly safeGuideStroke: string;
  readonly faceFill: string;
  readonly faceHatch: string;
  readonly faceStroke: string;
  readonly faceText: string;
  readonly flowStroke: string;
  readonly flowBadgeFill: string;
  readonly flowBadgeText: string;
  readonly balloonFill: string;
  readonly narrationFill: string;
  readonly balloonStroke: string;
  readonly textInk: string;
  readonly mouthFill: string;
  readonly mouthRing: string;
  readonly headerInk: string;
  readonly mutedInk: string;
}

const LIGHT_OKLCH_PALETTE: OklchSvgPalette = {
  canvasBg: "oklch(0.975 0.008 92)",
  panelBg: "oklch(0.996 0.003 95)",
  panelBorder: "oklch(0.22 0.018 255)",
  safeGuideStroke: "oklch(0.54 0.09 162)",
  faceFill: "oklch(0.92 0.045 28 / 0.34)",
  faceHatch: "oklch(0.56 0.14 28 / 0.48)",
  faceStroke: "oklch(0.5 0.15 28)",
  faceText: "oklch(0.4 0.13 28)",
  flowStroke: "oklch(0.44 0.11 162)",
  flowBadgeFill: "oklch(0.32 0.08 162)",
  flowBadgeText: "oklch(0.99 0.004 95)",
  balloonFill: "oklch(0.998 0.002 95)",
  narrationFill: "oklch(0.962 0.016 88)",
  balloonStroke: "oklch(0.18 0.015 260)",
  textInk: "oklch(0.16 0.015 260)",
  mouthFill: "oklch(0.54 0.16 25)",
  mouthRing: "oklch(0.99 0.004 95)",
  headerInk: "oklch(0.24 0.02 255)",
  mutedInk: "oklch(0.46 0.02 255)",
};

const DARK_OKLCH_PALETTE: OklchSvgPalette = {
  canvasBg: "oklch(0.17 0.012 165)",
  panelBg: "oklch(0.21 0.014 165)",
  panelBorder: "oklch(0.76 0.04 162)",
  safeGuideStroke: "oklch(0.68 0.11 162)",
  faceFill: "oklch(0.38 0.09 28 / 0.32)",
  faceHatch: "oklch(0.7 0.14 28 / 0.48)",
  faceStroke: "oklch(0.72 0.14 28)",
  faceText: "oklch(0.86 0.09 28)",
  flowStroke: "oklch(0.74 0.12 162)",
  flowBadgeFill: "oklch(0.68 0.12 162)",
  flowBadgeText: "oklch(0.14 0.015 165)",
  balloonFill: "oklch(0.96 0.006 95)",
  narrationFill: "oklch(0.92 0.018 88)",
  balloonStroke: "oklch(0.18 0.015 260)",
  textInk: "oklch(0.16 0.015 260)",
  mouthFill: "oklch(0.7 0.16 25)",
  mouthRing: "oklch(0.18 0.012 165)",
  headerInk: "oklch(0.94 0.008 95)",
  mutedInk: "oklch(0.74 0.016 165)",
};

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/**
 * XML/SVG 텍스트 및 속성 안전 이스케이프 유틸리티.
 */
export function escapeXmlText(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildScreamBurstPath(rect: Rect2D): string {
  const cx = rect.x + rect.width * 0.5;
  const cy = rect.y + rect.height * 0.5;
  const outerRx = rect.width * 0.5;
  const outerRy = rect.height * 0.5;
  const spikes = 16;
  const parts: string[] = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const angle = (i * Math.PI) / spikes;
    const scale = i % 2 === 0 ? 1 : 0.81;
    parts.push(`${i === 0 ? "M" : "L"} ${fmt(cx + Math.cos(angle) * outerRx * scale)} ${fmt(cy + Math.sin(angle) * outerRy * scale)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

function buildThoughtCloudPath(rect: Rect2D): string {
  const cx = rect.x + rect.width * 0.5;
  const cy = rect.y + rect.height * 0.5;
  const baseRx = rect.width * 0.43;
  const baseRy = rect.height * 0.43;
  const ctrlRx = rect.width * 0.53;
  const ctrlRy = rect.height * 0.53;
  const lobes = 12;
  const segments: string[] = [];
  for (let i = 0; i < lobes; i += 1) {
    const a0 = (i * 2 * Math.PI) / lobes;
    const aMid = ((i + 0.5) * 2 * Math.PI) / lobes;
    const a1 = ((i + 1) * 2 * Math.PI) / lobes;
    if (i === 0) segments.push(`M ${fmt(cx + Math.cos(a0) * baseRx)} ${fmt(cy + Math.sin(a0) * baseRy)}`);
    segments.push(
      `Q ${fmt(cx + Math.cos(aMid) * ctrlRx)} ${fmt(cy + Math.sin(aMid) * ctrlRy)} ${fmt(cx + Math.cos(a1) * baseRx)} ${fmt(cy + Math.sin(a1) * baseRy)}`,
    );
  }
  segments.push("Z");
  return segments.join(" ");
}

function renderBalloonShapeSvg(shape: BalloonShapeKind, rect: Rect2D, palette: OklchSvgPalette): string {
  const cx = rect.x + rect.width * 0.5;
  const cy = rect.y + rect.height * 0.5;
  if (shape === "rounded-narration") {
    return `<rect x="${fmt(rect.x)}" y="${fmt(rect.y)}" width="${fmt(rect.width)}" height="${fmt(rect.height)}" rx="8" ry="8" fill="${palette.narrationFill}" stroke="${palette.balloonStroke}" stroke-width="2" />`;
  }
  if (shape === "scream-burst") {
    return `<path d="${buildScreamBurstPath(rect)}" fill="${palette.balloonFill}" stroke="${palette.balloonStroke}" stroke-width="2.2" stroke-linejoin="miter" />`;
  }
  if (shape === "thought-cloud") {
    return `<path d="${buildThoughtCloudPath(rect)}" fill="${palette.balloonFill}" stroke="${palette.balloonStroke}" stroke-width="2" stroke-linejoin="round" />`;
  }
  const dashAttr = shape === "whisper-dashed" ? ' stroke-dasharray="6 4"' : "";
  const strokeW = shape === "whisper-dashed" ? "1.8" : "2";
  return `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(rect.width * 0.5)}" ry="${fmt(rect.height * 0.5)}" fill="${palette.balloonFill}" stroke="${palette.balloonStroke}" stroke-width="${strokeW}"${dashAttr} />`;
}

function renderBalloonTailSvg(balloon: PlacedPanelBalloon, palette: OklchSvgPalette): string {
  const { tail } = balloon;
  if (tail.tailKind === "none") return "";
  if (tail.tailKind === "thought-bubbles") {
    return tail.thoughtBubbles
      .map((dot) => `<circle cx="${fmt(dot.cx)}" cy="${fmt(dot.cy)}" r="${fmt(dot.radiusPx)}" fill="${palette.balloonFill}" stroke="${palette.balloonStroke}" stroke-width="1.6" />`)
      .join("\n      ");
  }
  if (!tail.baseLeft || !tail.baseRight || !tail.controlLeft || !tail.controlRight || !tail.tipPoint) return "";
  const d =
    `M ${fmt(tail.baseLeft.x)} ${fmt(tail.baseLeft.y)} ` +
    `Q ${fmt(tail.controlLeft.x)} ${fmt(tail.controlLeft.y)} ${fmt(tail.tipPoint.x)} ${fmt(tail.tipPoint.y)} ` +
    `Q ${fmt(tail.controlRight.x)} ${fmt(tail.controlRight.y)} ${fmt(tail.baseRight.x)} ${fmt(tail.baseRight.y)} Z`;
  return `<path d="${d}" fill="${palette.balloonFill}" stroke="${palette.balloonStroke}" stroke-width="1.9" stroke-linejoin="round" />`;
}

function renderBalloonTextLinesSvg(balloon: PlacedPanelBalloon, palette: OklchSvgPalette): string {
  const { center, typography } = balloon;
  return typography.lines
    .map((line) => {
      const y = center.y + line.centerYOffsetPx + typography.fontSizePx * 0.34;
      return `<text x="${fmt(center.x)}" y="${fmt(y)}" text-anchor="middle" font-size="${fmt(typography.fontSizePx)}" font-weight="600" fill="${palette.textInk}">${escapeXmlText(line.text)}</text>`;
    })
    .join("\n      ");
}

function readingOrderLabel(mode: ReadingOrderMode): string {
  return mode === "manga-rtl-tb" ? "출판 만화형 (오른→왼·위→아래)" : "한국 웹툰형 (위→아래·왼→오)";
}

/**
 * 패널 말풍선 배치 및 곡선 베지어 꼬리 결과를 고대비 인쇄 안전 OKLCH SVG로 렌더링한다.
 */
export function renderPanelBalloonLayoutSvg(
  layout: PanelBalloonLayoutResult,
  options?: BalloonLayoutSvgOptions,
): string {
  const palette = options?.theme === "dark" ? DARK_OKLCH_PALETTE : LIGHT_OKLCH_PALETTE;
  const headerHeight = 36;
  const padOuter = 16;
  const totalW = layout.widthPx + padOuter * 2;
  const totalH = layout.heightPx + padOuter * 2 + headerHeight;
  const titleText = options?.title ?? `패널 ${layout.panelId} · ${readingOrderLabel(layout.readingOrder)}`;

  const faceLayer = (options?.showFaceKeepOutZones ?? true)
    ? layout.faceKeepOutBoxes
        .map((face) => {
          const r = face.rect;
          const label = face.label ?? face.characterId ?? face.id;
          return [
            `<g data-face-keepout="${escapeXmlText(face.id)}">`,
            `  <rect x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.width)}" height="${fmt(r.height)}" rx="6" fill="${palette.faceFill}" />`,
            `  <rect x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.width)}" height="${fmt(r.height)}" rx="6" fill="url(#wave104-face-hatch)" stroke="${palette.faceStroke}" stroke-width="1.5" stroke-dasharray="4 3" />`,
            `  <text x="${fmt(r.x + r.width * 0.5)}" y="${fmt(r.y + r.height * 0.5 + 4)}" text-anchor="middle" font-size="11" font-weight="600" fill="${palette.faceText}">${escapeXmlText(label)}</text>`,
            "</g>",
          ].join("\n    ");
        })
        .join("\n    ")
    : "";

  const mouthLayer = (options?.showSpeakerMouthMarkers ?? true)
    ? layout.placedBalloons
        .flatMap((b) =>
          b.speakerMouthPoint === null
            ? []
            : [`<circle cx="${fmt(b.speakerMouthPoint.x)}" cy="${fmt(b.speakerMouthPoint.y)}" r="4.5" fill="${palette.mouthFill}" stroke="${palette.mouthRing}" stroke-width="1.5" data-speaker-mouth="${escapeXmlText(b.speakerId)}" />`],
        )
        .join("\n    ")
    : "";

  const balloonsLayer = layout.placedBalloons
    .map((b) => {
      const tailSvg = renderBalloonTailSvg(b, palette);
      const shapeSvg = renderBalloonShapeSvg(b.shape, b.rect, palette);
      const textSvg = renderBalloonTextLinesSvg(b, palette);
      return [
        `<g data-balloon-id="${escapeXmlText(b.balloonId)}" data-balloon-shape="${escapeXmlText(b.shape)}">`,
        tailSvg ? `      ${tailSvg}` : "",
        `      ${shapeSvg}`,
        textSvg ? `      ${textSvg}` : "",
        "    </g>",
      ]
        .filter((line) => line.length > 0)
        .join("\n");
    })
    .join("\n    ");

  const flowSegments: string[] = [];
  if ((options?.showReadingFlow ?? true) && layout.readingFlowPoints.length > 0) {
    if (layout.readingFlowPoints.length >= 2) {
      const pointsAttr = layout.readingFlowPoints.map((pt) => `${fmt(pt.x)},${fmt(pt.y)}`).join(" ");
      flowSegments.push(
        `<polyline points="${pointsAttr}" fill="none" stroke="${palette.flowStroke}" stroke-width="2" stroke-dasharray="6 4" marker-end="url(#wave104-flow-arrow)" opacity="0.82" />`,
      );
    }
    for (let i = 0; i < layout.placedBalloons.length; i += 1) {
      const b = layout.placedBalloons[i];
      const bx = b.rect.x + 12;
      const by = b.rect.y + 12;
      flowSegments.push(
        `<g data-reading-step="${i + 1}"><circle cx="${fmt(bx)}" cy="${fmt(by)}" r="10" fill="${palette.flowBadgeFill}" /><text x="${fmt(bx)}" y="${fmt(by + 3.5)}" text-anchor="middle" font-size="11" font-weight="700" fill="${palette.flowBadgeText}">${i + 1}</text></g>`,
      );
    }
  }

  const safeGuideSvg = (options?.showSafeMarginGuide ?? true)
    ? `<rect x="${fmt(layout.safeBounds.x)}" y="${fmt(layout.safeBounds.y)}" width="${fmt(layout.safeBounds.width)}" height="${fmt(layout.safeBounds.height)}" fill="none" stroke="${palette.safeGuideStroke}" stroke-width="1.2" stroke-dasharray="6 5" />`
    : "";

  const auditSubtitle = `말풍선 ${layout.audit.balloonCount} · 얼굴겹침 ${layout.audit.faceOverlapCount} · 꼬리통과 ${layout.audit.tailObstacleCrossings} · 360px최소 ${fmt(layout.audit.minEffectiveMobileFontPx)}px`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(totalW)} ${fmt(totalH)}" width="${fmt(totalW)}" height="${fmt(totalH)}" role="img" aria-label="${escapeXmlText(titleText)}" font-family="'Pretendard', 'Noto Sans KR', sans-serif">`,
    "  <defs>",
    `    <pattern id="wave104-face-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`,
    `      <line x1="0" y1="0" x2="0" y2="8" stroke="${palette.faceHatch}" stroke-width="2" />`,
    "    </pattern>",
    `    <marker id="wave104-flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">`,
    `      <path d="M 0 1 L 9 5 L 0 9 z" fill="${palette.flowStroke}" />`,
    "    </marker>",
    "  </defs>",
    `  <rect x="0" y="0" width="${fmt(totalW)}" height="${fmt(totalH)}" fill="${palette.canvasBg}" />`,
    `  <text x="${fmt(padOuter)}" y="24" font-size="13" font-weight="700" fill="${palette.headerInk}">${escapeXmlText(titleText)}</text>`,
    `  <text x="${fmt(totalW - padOuter)}" y="24" text-anchor="end" font-size="11" fill="${palette.mutedInk}">${escapeXmlText(auditSubtitle)}</text>`,
    `  <g transform="translate(${fmt(padOuter)}, ${fmt(headerHeight)})">`,
    `    <rect x="0" y="0" width="${fmt(layout.widthPx)}" height="${fmt(layout.heightPx)}" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2.2" />`,
    safeGuideSvg ? `    ${safeGuideSvg}` : "",
    faceLayer ? `    ${faceLayer}` : "",
    mouthLayer ? `    ${mouthLayer}` : "",
    balloonsLayer ? `    ${balloonsLayer}` : "",
    flowSegments.length > 0 ? `    ${flowSegments.join("\n    ")}` : "",
    "  </g>",
    "</svg>",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * 패널 말풍선 조판·배치·꼬리 라우팅 결과를 자연스러운 한국어 식자 감독 리포트로 요약한다.
 */
export function summarizeBalloonLayoutAuditKo(layout: PanelBalloonLayoutResult): BalloonLayoutAuditSummaryKo {
  const { audit } = layout;
  const orderLabel = readingOrderLabel(layout.readingOrder);
  const hasHardFailure =
    audit.faceOverlapCount > 0 ||
    audit.balloonOverlapCount > 0 ||
    audit.outOfSafeMarginCount > 0 ||
    audit.tailObstacleCrossings > 0;
  const hasWarning =
    audit.orphanLineCount > 0 ||
    !audit.readingOrderMonotonic ||
    audit.tailPairCrossingCount > 0 ||
    !audit.allMobileLegible;

  const verdict: BalloonAuditVerdict = hasHardFailure ? "fail" : hasWarning ? "warn" : "pass";
  const verdictLabelKo =
    verdict === "pass" ? "식자 검수 통과" : verdict === "warn" ? "식자 보완 권장" : "배치 충돌 수정 필요";

  const headlineKo =
    verdict === "pass"
      ? `패널 ${layout.panelId} 말풍선 ${audit.balloonCount}개 배치·꼬리·360px 가독성 모두 통과`
      : verdict === "warn"
        ? `패널 ${layout.panelId} 말풍선 ${audit.balloonCount}개 무충돌 배치 완료, 식자·가독성 세부 점검 필요`
        : `패널 ${layout.panelId} 얼굴·말풍선·꼬리 충돌 감지, 재조정 필요`;

  const mobileDetailKo =
    audit.balloonCount === 0
      ? "배치된 말풍선 없음"
      : audit.allMobileLegible
        ? `모바일 360px 최소 글자 크기 ${fmt(audit.minEffectiveMobileFontPx)}px (11.5px 기준 충족)`
        : `모바일 360px 가독성 미달 ${audit.mobileLegibilityFailureIds.length}건 (최소 ${fmt(audit.minEffectiveMobileFontPx)}px, 대상: ${audit.mobileLegibilityFailureIds.join(", ")})`;

  const readingFlowKo = audit.readingOrderMonotonic
    ? `${orderLabel} 시선 흐름 순서 유지`
    : `${orderLabel} 시선 역행 ${audit.readingOrderViolations}건 발견`;

  const whitespacePct = Math.round(audit.whitespaceCoverageRatio * 100);
  const summaryParagraphKo =
    `패널 ${layout.panelId}(${fmt(layout.widthPx)}×${fmt(layout.heightPx)}px, 안전 여백 ${fmt(layout.safeMarginPx)}px)에 ` +
    `말풍선 ${audit.balloonCount}개를 배치했다. 얼굴 겹침 ${audit.faceOverlapCount}건, 말풍선 겹침 ${audit.balloonOverlapCount}건, ` +
    `꼬리 장애물 통과 ${audit.tailObstacleCrossings}건, 외톨이 줄 ${audit.orphanLineCount}건이며 ${readingFlowKo}. ${mobileDetailKo}.`;

  return {
    panelId: layout.panelId,
    verdict,
    verdictLabelKo,
    readingOrderLabelKo: orderLabel,
    headlineKo,
    summaryParagraphKo,
    bulletLinesKo: [
      `배치 규모: 말풍선 ${audit.balloonCount}개, 화면 여백 보존율 ${whitespacePct}%`,
      `충돌 검수: 얼굴 겹침 ${audit.faceOverlapCount}건 · 말풍선 겹침 ${audit.balloonOverlapCount}건 · 안전 여백 이탈 ${audit.outOfSafeMarginCount}건`,
      `한국어 조판: 외톨이 줄 ${audit.orphanLineCount}건 · 강제 어절 분절 ${audit.forcedHardBreakCount}건`,
      `시선 흐름: ${readingFlowKo}`,
      `꼬리 라우팅: 장애물 통과 ${audit.tailObstacleCrossings}건 · 꼬리 상호 교차 ${audit.tailPairCrossingCount}건`,
      `모바일 가독성: ${mobileDetailKo}`,
    ],
  };
}
