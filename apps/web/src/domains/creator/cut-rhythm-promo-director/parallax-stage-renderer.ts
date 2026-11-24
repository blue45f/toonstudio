/**
 * 2.5D 다중 평면(BG · MG · FG) 패럴랙스 실시간 `<canvas>` 프리뷰 렌더러.
 *
 * - 원시 색상(hex/rgb/hsl) 리터럴을 0건 유지하며 모든 색상은 `getComputedStyle(canvas)` 시맨틱 CSS 토큰에서 해석한다.
 * - jsdom 등 2D 컨텍스트 미지원 환경에서도 안전하게 조기 반환한다.
 */

import type {
  AnalyzedWebtoonCut,
  BgMotifKind,
  CutToneToken,
  EvaluatedParallaxPose,
  FgAccentKind,
  MgSubjectKind,
  PromoAspectPreset,
  SfxCueMarker,
} from "./types";

interface CanvasSemanticPalette {
  readonly stageBg: string;
  readonly stagePanel: string;
  readonly cardBg: string;
  readonly line: string;
  readonly lineStrong: string;
  readonly fg: string;
  readonly fgMuted: string;
  readonly onAccent: string;
  readonly toneMap: Readonly<Record<CutToneToken, string>>;
}

function readToken(style: CSSStyleDeclaration, token: string, fallback: string): string {
  const value = style.getPropertyValue(token).trim();
  return value.length > 0 ? value : fallback;
}

export function resolveCanvasSemanticPalette(canvas: HTMLCanvasElement): CanvasSemanticPalette {
  const rootStyle =
    typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const elStyle = getComputedStyle(canvas);

  const fallbackFg = elStyle.color.trim() || "CanvasText";
  const fallbackBg = elStyle.backgroundColor.trim() || "Canvas";

  const pick = (token: string, fallback: string): string => {
    const fromEl = readToken(elStyle, token, "");
    if (fromEl.length > 0) return fromEl;
    if (rootStyle) {
      const fromRoot = readToken(rootStyle, token, "");
      if (fromRoot.length > 0) return fromRoot;
    }
    return fallback;
  };

  const fg = pick("--color-fg", fallbackFg);
  const accent = pick("--color-accent", fg);

  return {
    stageBg: pick("--color-reader-canvas", pick("--color-canvas", fallbackBg)),
    stagePanel: pick("--color-reader-panel", pick("--color-panel", fallbackBg)),
    cardBg: pick("--color-card", fallbackBg),
    line: pick("--color-line", fallbackFg),
    lineStrong: pick("--color-line-strong", fallbackFg),
    fg,
    fgMuted: pick("--color-fg-2", fg),
    onAccent: pick("--color-on-accent", fallbackBg),
    toneMap: {
      neutral: pick("--color-fg-2", fg),
      accent,
      cool: pick("--color-cool", accent),
      warn: pick("--color-warn", accent),
      bad: pick("--color-bad", accent),
      good: pick("--color-good", accent),
    },
  };
}

function drawBgMotif(
  ctx: CanvasRenderingContext2D,
  motif: BgMotifKind,
  w: number,
  h: number,
  tone: string,
  palette: CanvasSemanticPalette,
): void {
  ctx.save();
  ctx.strokeStyle = palette.lineStrong;
  ctx.fillStyle = palette.stagePanel;

  if (motif === "city-skyline") {
    const horizon = h * 0.64;
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = tone;
    ctx.beginPath();
    ctx.arc(w * 0.68, h * 0.24, Math.min(w, h) * 0.17, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.72;
    ctx.fillStyle = palette.stagePanel;
    const heights = [0.28, 0.42, 0.34, 0.5, 0.25, 0.46, 0.36, 0.3];
    const barW = (w * 1.2) / heights.length;
    heights.forEach((ratio, idx) => {
      const bx = -w * 0.1 + idx * barW;
      const bh = h * ratio;
      ctx.fillRect(bx, horizon - bh * 0.55, barW - 4, bh);
      ctx.strokeRect(bx, horizon - bh * 0.55, barW - 4, bh);
    });
  } else if (motif === "moonlit-ruins") {
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = tone;
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      const archX = w * (0.14 + i * 0.24);
      ctx.strokeRect(archX, h * 0.28, w * 0.14, h * 0.46);
    }
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.26, Math.min(w, h) * 0.2, 0, Math.PI * 2);
    ctx.stroke();
  } else if (motif === "cherry-blossom-street") {
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = tone;
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i += 1) {
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.56);
      ctx.lineTo(w * (i / 5), h);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = tone;
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.arc(w * (0.12 + i * 0.2), h * (0.16 + (i % 2) * 0.08), w * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (motif === "rainy-alley") {
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = palette.lineStrong;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.12);
    ctx.lineTo(w * 0.44, h * 0.52);
    ctx.lineTo(0, h * 0.92);
    ctx.moveTo(w, h * 0.12);
    ctx.lineTo(w * 0.56, h * 0.52);
    ctx.lineTo(w, h * 0.92);
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = tone;
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.38, Math.min(w, h) * 0.09, 0, Math.PI * 2);
    ctx.fill();
  } else if (motif === "classroom-window") {
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = palette.lineStrong;
    ctx.lineWidth = 2;
    const cols = 4;
    const rows = 3;
    for (let c = 1; c < cols; c += 1) {
      ctx.beginPath();
      ctx.moveTo((w * c) / cols, h * 0.12);
      ctx.lineTo((w * c) / cols, h * 0.78);
      ctx.stroke();
    }
    for (let r = 1; r < rows; r += 1) {
      ctx.beginPath();
      ctx.moveTo(w * 0.08, h * (0.12 + r * 0.22));
      ctx.lineTo(w * 0.92, h * (0.12 + r * 0.22));
      ctx.stroke();
    }
  } else {
    // void-speedlines
    ctx.globalAlpha = 0.36;
    ctx.strokeStyle = tone;
    ctx.lineWidth = 1.6;
    const cx = w * 0.5;
    const cy = h * 0.46;
    for (let i = 0; i < 24; i += 1) {
      const angle = (i / 24) * Math.PI * 2;
      const r0 = Math.min(w, h) * 0.16;
      const r1 = Math.max(w, h) * 0.82;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * r0, cy + Math.sin(angle) * r0);
      ctx.lineTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawMgSubject(
  ctx: CanvasRenderingContext2D,
  subject: MgSubjectKind,
  w: number,
  h: number,
  tone: string,
  palette: CanvasSemanticPalette,
  progress: number,
): void {
  ctx.save();
  const cx = w * 0.5;
  const cy = h * 0.48;
  const unit = Math.min(w, h);

  if (subject === "awakening-aura") {
    ctx.strokeStyle = tone;
    ctx.lineWidth = 2.4;
    for (let ring = 0; ring < 3; ring += 1) {
      ctx.globalAlpha = 0.65 - ring * 0.16;
      const radius = unit * (0.14 + ring * 0.08 + progress * 0.05);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 0.88;
  ctx.fillStyle = palette.cardBg;
  ctx.strokeStyle = tone;
  ctx.lineWidth = 2.2;

  if (subject === "couple-gaze") {
    for (const dir of [-1, 1]) {
      const px = cx + dir * unit * 0.16;
      ctx.beginPath();
      ctx.arc(px, cy - unit * 0.1, unit * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(px - unit * 0.1, cy, unit * 0.2, unit * 0.28, 12);
      ctx.fill();
      ctx.stroke();
    }
  } else if (subject === "blade-clash") {
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - unit * 0.34, cy - unit * 0.24);
    ctx.lineTo(cx + unit * 0.32, cy + unit * 0.24);
    ctx.moveTo(cx + unit * 0.34, cy - unit * 0.22);
    ctx.lineTo(cx - unit * 0.3, cy + unit * 0.26);
    ctx.stroke();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = tone;
    ctx.beginPath();
    ctx.arc(cx, cy, unit * 0.06, 0, Math.PI * 2);
    ctx.fill();
  } else if (subject === "phone-glow") {
    const pw = unit * 0.22;
    const ph = unit * 0.36;
    ctx.beginPath();
    ctx.roundRect(cx - pw * 0.5, cy - ph * 0.5, pw, ph, 10);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = tone;
    ctx.fillRect(cx - pw * 0.36, cy - ph * 0.26, pw * 0.72, ph * 0.14);
    ctx.fillRect(cx - pw * 0.36, cy - ph * 0.04, pw * 0.52, ph * 0.1);
  } else {
    // hero-silhouette / suspect-shadow / awakening core figure
    ctx.beginPath();
    ctx.arc(cx, cy - unit * 0.14, unit * 0.095, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - unit * 0.2, cy + unit * 0.3);
    ctx.lineTo(cx - unit * 0.13, cy - unit * 0.01);
    ctx.lineTo(cx + unit * 0.13, cy - unit * 0.01);
    ctx.lineTo(cx + unit * 0.2, cy + unit * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawFgAccent(
  ctx: CanvasRenderingContext2D,
  accent: FgAccentKind,
  w: number,
  h: number,
  tone: string,
  palette: CanvasSemanticPalette,
  progress: number,
): void {
  ctx.save();
  ctx.strokeStyle = tone;
  ctx.fillStyle = tone;

  if (accent === "debris-sparks" || accent === "petals-drift") {
    ctx.globalAlpha = 0.78;
    for (let i = 0; i < 10; i += 1) {
      const seed = i * 1.73;
      const px = ((Math.sin(seed * 2.1) * 0.5 + 0.5) * w + progress * (i % 2 === 0 ? 44 : -36)) % w;
      const py = ((Math.cos(seed * 1.4) * 0.5 + 0.5) * h + progress * 38) % h;
      const size = accent === "petals-drift" ? 6 : 4;
      ctx.beginPath();
      ctx.ellipse(px, py, size * 1.4, size * 0.7, seed + progress * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (accent === "rain-streaks") {
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 14; i += 1) {
      const rx = ((i * 73) % 100) * 0.01 * w;
      const ry = (((i * 41 + progress * 140) % 100) * 0.01) * h;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 8, ry + 26);
      ctx.stroke();
    }
  } else if (accent === "shattered-glass" || accent === "speed-slash") {
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 2.6;
    for (let i = 0; i < 6; i += 1) {
      const x0 = w * (0.08 + i * 0.16);
      const y0 = h * (0.14 + (i % 2) * 0.55);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + 28, y0 - 18);
      ctx.lineTo(x0 + 16, y0 + 14);
      ctx.closePath();
      ctx.stroke();
    }
  } else {
    // vignette-frame
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = palette.lineStrong;
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, w - 20, h - 20);
  }
  ctx.restore();
}

export interface RenderParallaxStageParams {
  readonly canvas: HTMLCanvasElement;
  readonly cut: AnalyzedWebtoonCut;
  readonly pose: EvaluatedParallaxPose;
  readonly aspectPreset: PromoAspectPreset;
  readonly activeSfx: readonly SfxCueMarker[];
  readonly beatLabelKo: string;
}

/**
 * 현재 프레임의 2.5D 다중 평면 패럴랙스 씬을 `<canvas>`에 그린다.
 */
export function renderParallaxStageCanvas(params: RenderParallaxStageParams): void {
  const { canvas, cut, pose, aspectPreset, activeSfx, beatLabelKo } = params;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const palette = resolveCanvasSemanticPalette(canvas);
  const tone = palette.toneMap[cut.depthLayers.toneTag];

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = palette.stageBg;
  ctx.fillRect(0, 0, w, h);

  const tiltRad = (pose.tiltDeg * Math.PI) / 180;
  const drawPlane = (
    offset: { readonly x: number; readonly y: number; readonly scale: number },
    renderFn: () => void,
  ): void => {
    ctx.save();
    ctx.translate(w * 0.5 + offset.x * w, h * 0.5 + offset.y * h);
    ctx.rotate(tiltRad);
    ctx.scale(offset.scale, offset.scale);
    ctx.translate(-w * 0.5, -h * 0.5);
    renderFn();
    ctx.restore();
  };

  // 1) BG 평면 (0.25x)
  drawPlane(pose.bgOffset, () =>
    drawBgMotif(ctx, cut.depthLayers.bgMotif, w, h, tone, palette),
  );

  // 2) MG 평면 (0.65x)
  drawPlane(pose.mgOffset, () =>
    drawMgSubject(ctx, cut.depthLayers.mgSubject, w, h, tone, palette, pose.localProgress),
  );

  // 3) FG 평면 (1.15x)
  drawPlane(pose.fgOffset, () =>
    drawFgAccent(ctx, cut.depthLayers.fgAccent, w, h, tone, palette, pose.localProgress),
  );

  // 4) 9:16 / 16:9 세이프존 가이드 & 말풍선 자막 카드
  const margin = Math.round(Math.min(w, h) * 0.06);
  ctx.save();
  ctx.strokeStyle = palette.line;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1;
  ctx.strokeRect(margin, margin, w - margin * 2, h - margin * 2);

  // 상단 컷/비트 배지
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = palette.stagePanel;
  ctx.strokeStyle = tone;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(margin + 8, margin + 8, Math.min(w - margin * 2 - 16, 178), 28, 7);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = palette.fg;
  ctx.font = "600 11px sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(`CUT ${cut.order} · ${beatLabelKo}`, margin + 18, margin + 22);

  // 말풍선 대사 카드 (하단 세이프존 상부)
  const captionText = cut.balloonTexts.join(" / ");
  if (captionText.length > 0) {
    const boxBottom = aspectPreset === "9:16" ? h - margin - 34 : h - margin - 14;
    const boxH = 40;
    const boxY = boxBottom - boxH;
    ctx.fillStyle = palette.cardBg;
    ctx.strokeStyle = palette.lineStrong;
    ctx.beginPath();
    ctx.roundRect(margin + 8, boxY, w - margin * 2 - 16, boxH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = palette.fg;
    ctx.font = "600 12px sans-serif";
    const clipped = captionText.length > 26 ? `${captionText.slice(0, 25)}…` : captionText;
    ctx.fillText(clipped, margin + 18, boxY + boxH * 0.5);
  }

  // 활성 SFX 펄스 배지
  const primarySfx = activeSfx[0];
  if (primarySfx) {
    const pillW = 112;
    const pillX = w - margin - pillW - 8;
    const pillY = margin + 8;
    ctx.fillStyle = tone;
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, 26, 7);
    ctx.fill();
    ctx.fillStyle = palette.onAccent;
    ctx.font = "700 11px sans-serif";
    ctx.fillText(`SFX · ${primarySfx.labelKo}`, pillX + 8, pillY + 13);
  }
  ctx.restore();
}
