/**
 * Wave 38D — 웹툰 컷 오버레이용 2D 벡터 SVG 레이어 · 오프스크린 RGBA 버퍼 · `<canvas>` 2D 프리뷰 렌더러.
 *
 * - Calm Atelier OKLCH 색공간 및 CSS 시맨틱 토큰 전용(원시 hex/rgb/hsl 0건).
 * - 근경 굵은 G펜 잉크 외곽선 → 원경 얇은 대기 원근 실루엣 감쇄를 SVG/RGBA/Canvas 전 출력에 일치시킨다.
 */

import {
  clampNumber,
  formatOklch,
  mixOklch,
  oklchToSrgbBytes,
  type CrowdAgentInstance,
  type CrowdPresetSpec,
  type CrowdSceneResult,
  type OklchColor,
} from "./crowd-presets-and-wgsl";

export interface CrowdSvgRenderOptions {
  readonly includePerspectiveGuides?: boolean;
  readonly includeFocalMarker?: boolean;
  readonly includeGazeVectors?: boolean;
  readonly precision?: number;
}

export interface CrowdSvgLayerResult {
  readonly svgMarkup: string;
  readonly byteLength: number;
  readonly viewBox: string;
  readonly width: number;
  readonly height: number;
  readonly agentElementCount: number;
  readonly pathCount: number;
  readonly minStrokeWidthPx: number;
  readonly maxStrokeWidthPx: number;
}

export interface CrowdRgbaPreviewBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  readonly nonBackgroundPixelCount: number;
  readonly renderedAgentCount: number;
  readonly elapsedMs: number;
}

export interface CrowdCanvasPreviewOptions {
  readonly showPerspectiveGuides?: boolean;
  readonly showGazeVectors?: boolean;
  readonly showFocalReticle?: boolean;
}

interface PreviewChromeTokens {
  readonly fg: string;
  readonly accent: string;
  readonly line: string;
}

function fmt(value: number, digits = 1): string {
  return value.toFixed(digits);
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function buildAgentPropSvg(
  agent: CrowdAgentInstance,
  preset: CrowdPresetSpec,
  strokeColor: string,
  accentColor: string,
  sw: string,
  digits: number,
): string {
  if (agent.lodTier === 2) return "";
  const x = agent.screenX;
  const footY = agent.screenY;
  const h = agent.silhouetteHeightPx;
  const w = agent.silhouetteWidthPx;
  const dir = agent.headYawRad >= 0 ? 1 : -1;

  switch (preset.prop) {
    case "spear-cape": {
      const spearX = x + dir * w * 0.62;
      const spearTop = footY - h * 1.42;
      const spearBot = footY - h * 0.14;
      const flagY = spearTop + h * 0.16;
      return `<path d="M${fmt(spearX, digits)} ${fmt(spearBot, digits)} L${fmt(spearX, digits)} ${fmt(spearTop, digits)} M${fmt(spearX, digits)} ${fmt(spearTop + h * 0.04, digits)} L${fmt(spearX + dir * w * 0.45, digits)} ${fmt(flagY, digits)} L${fmt(spearX, digits)} ${fmt(flagY + h * 0.08, digits)}" fill="${accentColor}" stroke="${strokeColor}" stroke-width="${sw}" stroke-linecap="round"/>`;
    }
    case "briefcase-umbrella": {
      if (agent.propVariant === 0) {
        const domeY = footY - h * 1.06;
        const r = w * 1.15;
        return `<path d="M${fmt(x - r, digits)} ${fmt(domeY, digits)} Q${fmt(x, digits)} ${fmt(domeY - r * 0.72, digits)} ${fmt(x + r, digits)} ${fmt(domeY, digits)} Z" fill="${accentColor}" stroke="${strokeColor}" stroke-width="${sw}"/>`;
      }
      const bx = x + dir * w * 0.56;
      const by = footY - h * 0.34;
      return `<path d="M${fmt(bx - w * 0.24, digits)} ${fmt(by, digits)} h${fmt(w * 0.48, digits)} v${fmt(h * 0.14, digits)} h${fmt(-w * 0.48, digits)} Z" fill="${strokeColor}" stroke="${strokeColor}" stroke-width="${sw}"/>`;
    }
    case "lightstick-cheer": {
      const handX = x + dir * w * 0.58;
      const handY = footY - h * 1.02;
      return `<path d="M${fmt(x + dir * w * 0.35, digits)} ${fmt(footY - h * 0.72, digits)} L${fmt(handX, digits)} ${fmt(handY, digits)}" fill="none" stroke="${strokeColor}" stroke-width="${sw}" stroke-linecap="round"/><circle cx="${fmt(handX, digits)}" cy="${fmt(handY - h * 0.06, digits)}" r="${fmt(Math.max(1.2, w * 0.16), digits)}" fill="${accentColor}"/>`;
    }
    case "rolling-luggage": {
      const lx = x - dir * w * 0.76;
      const lw = w * 0.46;
      const lh = h * 0.32;
      return `<path d="M${fmt(lx, digits)} ${fmt(footY - lh, digits)} h${fmt(lw, digits)} v${fmt(lh, digits)} h${fmt(-lw, digits)} Z M${fmt(lx + lw * 0.5, digits)} ${fmt(footY - lh, digits)} L${fmt(x - dir * w * 0.28, digits)} ${fmt(footY - h * 0.52, digits)}" fill="${accentColor}" stroke="${strokeColor}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    }
    case "handstrap-phone": {
      if (agent.propVariant === 0) {
        const armX = x + dir * w * 0.42;
        return `<path d="M${fmt(armX, digits)} ${fmt(footY - h * 0.7, digits)} L${fmt(armX + dir * w * 0.14, digits)} ${fmt(footY - h * 1.12, digits)}" fill="none" stroke="${strokeColor}" stroke-width="${sw}" stroke-linecap="round"/>`;
      }
      return "";
    }
    case "school-bag": {
      const bx = x - dir * w * 0.42;
      const by = footY - h * 0.68;
      return `<path d="M${fmt(bx - w * 0.18, digits)} ${fmt(by, digits)} h${fmt(w * 0.36, digits)} v${fmt(h * 0.24, digits)} h${fmt(-w * 0.36, digits)} Z" fill="${accentColor}" stroke="${strokeColor}" stroke-width="${sw}"/>`;
    }
    case "hood-basket": {
      const hx = x;
      const hy = footY - h * 0.86;
      return `<path d="M${fmt(hx - w * 0.44, digits)} ${fmt(hy + h * 0.16, digits)} Q${fmt(hx, digits)} ${fmt(hy - h * 0.16, digits)} ${fmt(hx + w * 0.44, digits)} ${fmt(hy + h * 0.16, digits)}" fill="none" stroke="${strokeColor}" stroke-width="${sw}"/>`;
    }
    case "coffee-seated": {
      if (!agent.seated) return "";
      const tx = x + dir * w * 0.75;
      const ty = footY - h * 0.38;
      return `<path d="M${fmt(tx - w * 0.38, digits)} ${fmt(ty, digits)} h${fmt(w * 0.76, digits)} M${fmt(tx, digits)} ${fmt(ty, digits)} v${fmt(h * 0.38, digits)}" fill="none" stroke="${strokeColor}" stroke-width="${sw}" stroke-linecap="round"/>`;
    }
  }
}

/**
 * 웹툰 컷에 바로 얹을 수 있는 2D 벡터 SVG 군중 레이어를 생성한다.
 * - 원경→근경 painter's order 정렬, 근경 굵은 G펜 선두께 → 원경 얇은 대기 원근 실루엣 반영.
 * - 모든 색상은 OKLCH 표기만 사용한다(원시 hex/rgb/hsl 0건).
 */
export function renderCrowdSvgLayer(
  scene: CrowdSceneResult,
  options: CrowdSvgRenderOptions = {},
): CrowdSvgLayerResult {
  const {
    includePerspectiveGuides = true,
    includeFocalMarker = true,
    includeGazeVectors = false,
    precision = 1,
  } = options;

  const { canvasWidth, canvasHeight, horizonRatio, vanishingX, focalPointX, focalPointY } =
    scene.options;
  const vpX = canvasWidth * vanishingX;
  const vpY = canvasHeight * horizonRatio;
  const focalX = canvasWidth * focalPointX;
  const focalY = canvasHeight * focalPointY;

  const parts: string[] = [];
  let pathCount = 0;

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}" data-preset="${scene.preset.id}" data-agent-count="${scene.agents.length}">`,
  );

  if (includePerspectiveGuides) {
    const guideStroke = formatOklch(scene.preset.inkNearOklch, 0.2);
    parts.push(`<g data-layer="perspective-guides" fill="none" stroke="${guideStroke}">`);
    parts.push(
      `<line x1="0" y1="${fmt(vpY, precision)}" x2="${canvasWidth}" y2="${fmt(vpY, precision)}" stroke-width="1" stroke-dasharray="6 4"/>`,
    );
    const rays = [0.04, 0.22, 0.4, 0.6, 0.78, 0.96];
    for (const rx of rays) {
      parts.push(
        `<line x1="${fmt(vpX, precision)}" y1="${fmt(vpY, precision)}" x2="${fmt(canvasWidth * rx, precision)}" y2="${canvasHeight}" stroke-width="0.8"/>`,
      );
    }
    parts.push("</g>");
  }

  parts.push('<g data-layer="crowd-silhouettes">');

  let minStroke = Number.POSITIVE_INFINITY;
  let maxStroke = 0;

  for (const agent of scene.agents) {
    const swNum = agent.strokeWidthPx;
    if (swNum < minStroke) minStroke = swNum;
    if (swNum > maxStroke) maxStroke = swNum;

    const sw = swNum.toFixed(2);
    const fillColor = formatOklch(agent.fillOklch);
    const strokeColor = formatOklch(agent.strokeOklch);
    const shadowColor = formatOklch(scene.preset.inkNearOklch, clampNumber(0.24 * (1 - agent.atmosphericFade * 0.7), 0.05, 0.28));
    const accentColor = formatOklch(
      mixOklch(scene.preset.accentTintOklch, scene.preset.hazeFarOklch, agent.atmosphericFade * 0.85),
    );

    const x = agent.screenX;
    const footY = agent.screenY;
    const h = agent.silhouetteHeightPx;
    const w = agent.silhouetteWidthPx;
    const headR = Math.max(1.1, h * 0.108);
    const headCx = x + Math.sin(agent.headYawRad) * headR * 0.36;
    const headCy = footY - h * 0.87;
    const shoulderY = footY - h * 0.73;
    const hipY = footY - h * (agent.seated ? 0.28 : 0.42);
    const stride = (agent.stridePhase - 0.5) * w * 0.45;
    const bodyTilt = Math.cos(agent.bodyYawRad) * 0.14 + 0.86;
    const halfShoulder = w * 0.52 * bodyTilt;
    const halfWaist = w * 0.36 * bodyTilt;

    const bodyPath = agent.seated
      ? `M${fmt(x - halfShoulder, precision)} ${fmt(shoulderY, precision)} Q${fmt(x, precision)} ${fmt(shoulderY - h * 0.04, precision)} ${fmt(x + halfShoulder, precision)} ${fmt(shoulderY, precision)} L${fmt(x + halfWaist, precision)} ${fmt(hipY, precision)} L${fmt(x + w * 0.34, precision)} ${fmt(footY, precision)} L${fmt(x - w * 0.32, precision)} ${fmt(footY, precision)} L${fmt(x - halfWaist, precision)} ${fmt(hipY, precision)} Z`
      : `M${fmt(x - halfShoulder, precision)} ${fmt(shoulderY, precision)} Q${fmt(x, precision)} ${fmt(shoulderY - h * 0.045, precision)} ${fmt(x + halfShoulder, precision)} ${fmt(shoulderY, precision)} L${fmt(x + halfWaist, precision)} ${fmt(hipY, precision)} L${fmt(x + w * 0.26 + stride, precision)} ${fmt(footY, precision)} L${fmt(x + w * 0.06, precision)} ${fmt(hipY + h * 0.08, precision)} L${fmt(x - w * 0.26 - stride, precision)} ${fmt(footY, precision)} L${fmt(x - halfWaist, precision)} ${fmt(hipY, precision)} Z`;

    const propSvg = buildAgentPropSvg(agent, scene.preset, strokeColor, accentColor, sw, precision);
    pathCount += propSvg.length > 0 ? 2 : 1;

    let gazeSvg = "";
    if (includeGazeVectors && agent.lodTier < 2) {
      const gx = headCx + Math.cos(agent.gazeAngleRad) * (headR * 2.2);
      const gy = headCy + Math.sin(agent.gazeAngleRad) * (headR * 2.2);
      gazeSvg = `<line x1="${fmt(headCx, precision)}" y1="${fmt(headCy, precision)}" x2="${fmt(gx, precision)}" y2="${fmt(gy, precision)}" stroke="${accentColor}" stroke-width="0.9"/>`;
    }

    parts.push(
      `<g data-agent-id="${agent.id}" data-depth="${agent.depth.toFixed(3)}" data-lod="${agent.lodTier}" data-facing="${agent.facing}" opacity="${agent.opacity.toFixed(3)}">` +
        `<ellipse cx="${fmt(x, precision)}" cy="${fmt(footY, precision)}" rx="${fmt(w * 0.54, precision)}" ry="${fmt(Math.max(0.8, w * 0.14), precision)}" fill="${shadowColor}"/>` +
        `<path d="${bodyPath}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${sw}" stroke-linejoin="round"/>` +
        `<circle cx="${fmt(headCx, precision)}" cy="${fmt(headCy, precision)}" r="${fmt(headR, precision)}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${sw}"/>` +
        propSvg +
        gazeSvg +
        "</g>",
    );
  }

  parts.push("</g>");

  if (includeFocalMarker) {
    const focalColor = formatOklch(scene.preset.accentTintOklch);
    parts.push(
      `<g data-layer="focal-point" fill="none" stroke="${focalColor}" stroke-width="1.6">` +
        `<circle cx="${fmt(focalX, precision)}" cy="${fmt(focalY, precision)}" r="10"/>` +
        `<line x1="${fmt(focalX - 15, precision)}" y1="${fmt(focalY, precision)}" x2="${fmt(focalX + 15, precision)}" y2="${fmt(focalY, precision)}"/>` +
        `<line x1="${fmt(focalX, precision)}" y1="${fmt(focalY - 15, precision)}" x2="${fmt(focalX, precision)}" y2="${fmt(focalY + 15, precision)}"/>` +
        "</g>",
    );
  }

  parts.push("</svg>");

  const svgMarkup = parts.join("\n");
  const byteLength =
    typeof TextEncoder !== "undefined"
      ? new TextEncoder().encode(svgMarkup).byteLength
      : svgMarkup.length;

  return {
    svgMarkup,
    byteLength,
    viewBox: `0 0 ${canvasWidth} ${canvasHeight}`,
    width: canvasWidth,
    height: canvasHeight,
    agentElementCount: scene.agents.length,
    pathCount,
    minStrokeWidthPx: Number.isFinite(minStroke) ? minStroke : 0,
    maxStrokeWidthPx: maxStroke,
  };
}

function blendRgbaPixel(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  alpha: number,
): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const a = clampNumber(alpha, 0, 1);
  if (a <= 0.004) return false;
  const idx = (y * width + x) * 4;
  const invA = 1 - a;
  buf[idx] = Math.round(r * a + (buf[idx] ?? 0) * invA);
  buf[idx + 1] = Math.round(g * a + (buf[idx + 1] ?? 0) * invA);
  buf[idx + 2] = Math.round(b * a + (buf[idx + 2] ?? 0) * invA);
  buf[idx + 3] = 255;
  return true;
}

/**
 * DOM/Canvas에 의존하지 않는 결정론적 오프스크린 RGBA 픽셀 버퍼 프리뷰 렌더러.
 * WebGPU 텍스처 폴백 및 헤드리스 회귀 검증에 바로 사용할 수 있다.
 */
export function renderCrowdRgbaPreview(
  scene: CrowdSceneResult,
  width = 240,
  height = 135,
): CrowdRgbaPreviewBuffer {
  const start = nowMs();
  const w = Math.max(32, Math.round(width));
  const h = Math.max(24, Math.round(height));
  const data = new Uint8ClampedArray(w * h * 4);
  const horizonY = Math.round(h * scene.options.horizonRatio);

  // 1) 하늘·바닥 대기 원근 그라데이션 채우기
  for (let y = 0; y < h; y += 1) {
    let rowColor: OklchColor;
    if (y < horizonY) {
      const t = horizonY > 0 ? y / horizonY : 0;
      rowColor = mixOklch(scene.preset.skyZenithOklch, scene.preset.skyHorizonOklch, t);
    } else {
      const denom = Math.max(1, h - horizonY);
      const t = (y - horizonY) / denom;
      rowColor = mixOklch(scene.preset.groundFarOklch, scene.preset.groundNearOklch, t);
    }
    const [r, g, b] = oklchToSrgbBytes(rowColor);
    for (let x = 0; x < w; x += 1) {
      const idx = (y * w + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  // 2) 원경→근경 군중 실루엣 래스터화
  const scaleX = w / scene.options.canvasWidth;
  const scaleY = h / scene.options.canvasHeight;
  let nonBackgroundPixelCount = 0;

  for (const agent of scene.agents) {
    const cx = agent.screenX * scaleX;
    const footY = agent.screenY * scaleY;
    const silH = Math.max(2.5, agent.silhouetteHeightPx * scaleY);
    const silW = Math.max(1.5, agent.silhouetteWidthPx * scaleX);
    const strokeBand = Math.max(0.6, agent.strokeWidthPx * scaleX);

    const [fr, fg, fb] = oklchToSrgbBytes(agent.fillOklch);
    const [sr, sg, sb] = oklchToSrgbBytes(agent.strokeOklch);

    // 몸통 타원-사다리꼴 근사
    const torsoTop = Math.floor(footY - silH * 0.76);
    const torsoBot = Math.ceil(footY);
    const halfW = silW * 0.5;
    const minX = Math.max(0, Math.floor(cx - halfW - strokeBand));
    const maxX = Math.min(w - 1, Math.ceil(cx + halfW + strokeBand));
    const minY = Math.max(0, torsoTop);
    const maxY = Math.min(h - 1, torsoBot);

    for (let py = minY; py <= maxY; py += 1) {
      const vNorm = (py - torsoTop) / Math.max(1, torsoBot - torsoTop);
      const rowHalfW = halfW * (1 - vNorm * 0.24);
      for (let px = minX; px <= maxX; px += 1) {
        const dist = Math.abs(px - cx);
        if (dist <= rowHalfW) {
          const isEdge = rowHalfW - dist <= strokeBand;
          const painted = isEdge
            ? blendRgbaPixel(data, w, h, px, py, sr, sg, sb, agent.opacity)
            : blendRgbaPixel(data, w, h, px, py, fr, fg, fb, agent.opacity);
          if (painted) nonBackgroundPixelCount += 1;
        }
      }
    }

    // 머리 원형 디스크
    const headR = Math.max(1.1, silH * 0.11);
    const headCx = cx + Math.sin(agent.headYawRad) * headR * 0.35;
    const headCy = footY - silH * 0.87;
    const hMinX = Math.max(0, Math.floor(headCx - headR - 1));
    const hMaxX = Math.min(w - 1, Math.ceil(headCx + headR + 1));
    const hMinY = Math.max(0, Math.floor(headCy - headR - 1));
    const hMaxY = Math.min(h - 1, Math.ceil(headCy + headR + 1));
    for (let py = hMinY; py <= hMaxY; py += 1) {
      for (let px = hMinX; px <= hMaxX; px += 1) {
        const dx = px - headCx;
        const dy = py - headCy;
        const dist = Math.hypot(dx, dy);
        if (dist <= headR) {
          const isRim = headR - dist <= strokeBand * 0.85;
          const painted = isRim
            ? blendRgbaPixel(data, w, h, px, py, sr, sg, sb, agent.opacity)
            : blendRgbaPixel(data, w, h, px, py, fr, fg, fb, agent.opacity);
          if (painted) nonBackgroundPixelCount += 1;
        }
      }
    }
  }

  // 3) 주인공 시선 포컬 마커 십자선
  const fx = Math.round(scene.options.focalPointX * w);
  const fy = Math.round(scene.options.focalPointY * h);
  const [ar, ag, ab] = oklchToSrgbBytes(scene.preset.accentTintOklch);
  for (let d = -4; d <= 4; d += 1) {
    if (blendRgbaPixel(data, w, h, fx + d, fy, ar, ag, ab, 0.95)) nonBackgroundPixelCount += 1;
    if (blendRgbaPixel(data, w, h, fx, fy + d, ar, ag, ab, 0.95)) nonBackgroundPixelCount += 1;
  }

  return {
    width: w,
    height: h,
    data,
    nonBackgroundPixelCount,
    renderedAgentCount: scene.agents.length,
    elapsedMs: Math.max(0, nowMs() - start),
  };
}

function resolveCanvasChromeTokens(canvas: HTMLCanvasElement): PreviewChromeTokens {
  const rootStyle =
    typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const elStyle = typeof getComputedStyle === "function" ? getComputedStyle(canvas) : null;
  const fallbackFg = elStyle?.color.trim() || "CanvasText";
  const pick = (token: string, fallback: string): string => {
    const fromEl = elStyle?.getPropertyValue(token).trim() ?? "";
    if (fromEl.length > 0) return fromEl;
    const fromRoot = rootStyle?.getPropertyValue(token).trim() ?? "";
    return fromRoot.length > 0 ? fromRoot : fallback;
  };
  const fg = pick("--color-fg", fallbackFg);
  return {
    fg,
    accent: pick("--color-accent", fg),
    line: pick("--color-line-strong", fg),
  };
}

function drawPresetEnvironmentCues(
  ctx: CanvasRenderingContext2D,
  scene: CrowdSceneResult,
  w: number,
  h: number,
  vpX: number,
  vpY: number,
): void {
  const cueStroke = formatOklch(scene.preset.inkNearOklch, 0.16);
  const cueFill = formatOklch(scene.preset.skyHorizonOklch, 0.34);
  ctx.save();
  ctx.strokeStyle = cueStroke;
  ctx.fillStyle = cueFill;

  if (scene.preset.layout === "crosswalk-lanes") {
    // 횡단보도 원근 줄무늬 힌트
    const stripeCount = 7;
    for (let i = 0; i < stripeCount; i += 1) {
      const t0 = 0.08 + (i / stripeCount) * 0.84;
      const t1 = t0 + 0.06;
      const nearY = h * 0.96;
      const farY = vpY + (h - vpY) * 0.28;
      ctx.beginPath();
      ctx.moveTo(w * t0, nearY);
      ctx.lineTo(w * t1, nearY);
      ctx.lineTo(vpX + (w * t1 - vpX) * 0.34, farY);
      ctx.lineTo(vpX + (w * t0 - vpX) * 0.34, farY);
      ctx.closePath();
      ctx.fill();
    }
  } else if (scene.preset.layout === "tiered-stadium") {
    // 계단식 관람석 원호
    ctx.lineWidth = 1;
    for (let ring = 1; ring <= 6; ring += 1) {
      const y = vpY + ((h - vpY) * ring) / 6;
      ctx.beginPath();
      ctx.moveTo(0, y + 10);
      ctx.quadraticCurveTo(vpX, y - 16, w, y + 10);
      ctx.stroke();
    }
  } else if (scene.preset.layout === "subway-aisle") {
    // 객차 천장 손잡이 레일
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(vpX - w * 0.06, vpY * 0.72);
    ctx.lineTo(w * 0.22, 0);
    ctx.moveTo(vpX + w * 0.06, vpY * 0.72);
    ctx.lineTo(w * 0.78, 0);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 실시간 `<canvas>` 2D 프리뷰 렌더러.
 * 프리셋 원근 소실점·대기 페이드·근경 G펜 선두께·주인공 시선 집중점을 즉시 시각화한다.
 */
export function renderCrowdPreviewCanvas(
  canvas: HTMLCanvasElement,
  scene: CrowdSceneResult,
  options: CrowdCanvasPreviewOptions = {},
): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  const {
    showPerspectiveGuides = true,
    showGazeVectors = false,
    showFocalReticle = true,
  } = options;

  const w = canvas.width || 640;
  const h = canvas.height || 360;
  const scaleX = w / scene.options.canvasWidth;
  const scaleY = h / scene.options.canvasHeight;
  const vpX = w * scene.options.vanishingX;
  const vpY = h * scene.options.horizonRatio;
  const focalX = w * scene.options.focalPointX;
  const focalY = h * scene.options.focalPointY;
  const chrome = resolveCanvasChromeTokens(canvas);

  ctx.clearRect(0, 0, w, h);

  // 1) 대기 원근 하늘·바닥 그라데이션
  const skyGrad = ctx.createLinearGradient(0, 0, 0, vpY);
  skyGrad.addColorStop(0, formatOklch(scene.preset.skyZenithOklch));
  skyGrad.addColorStop(1, formatOklch(scene.preset.skyHorizonOklch));
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, vpY);

  const groundGrad = ctx.createLinearGradient(0, vpY, 0, h);
  groundGrad.addColorStop(0, formatOklch(scene.preset.groundFarOklch));
  groundGrad.addColorStop(1, formatOklch(scene.preset.groundNearOklch));
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, vpY, w, h - vpY);

  drawPresetEnvironmentCues(ctx, scene, w, h, vpX, vpY);

  // 2) 1점 원근 소실점 가이드선
  if (showPerspectiveGuides) {
    ctx.save();
    ctx.strokeStyle = formatOklch(scene.preset.inkNearOklch, 0.24);
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(0, vpY);
    ctx.lineTo(w, vpY);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.strokeStyle = formatOklch(scene.preset.inkNearOklch, 0.14);
    const edgeTargets = [0.02, 0.2, 0.38, 0.62, 0.8, 0.98];
    for (const ex of edgeTargets) {
      ctx.beginPath();
      ctx.moveTo(vpX, vpY);
      ctx.lineTo(w * ex, h);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 3) 원경 → 근경 painter's order 실루엣 렌더링
  for (const agent of scene.agents) {
    const x = agent.screenX * scaleX;
    const footY = agent.screenY * scaleY;
    const silH = agent.silhouetteHeightPx * scaleY;
    const silW = agent.silhouetteWidthPx * scaleX;
    const sw = Math.max(0.35, agent.strokeWidthPx * scaleX);
    const headR = Math.max(1.2, silH * 0.108);
    const headCx = x + Math.sin(agent.headYawRad) * headR * 0.38;
    const headCy = footY - silH * 0.87;
    const shoulderY = footY - silH * 0.73;
    const hipY = footY - silH * (agent.seated ? 0.28 : 0.42);
    const bodyTilt = Math.cos(agent.bodyYawRad) * 0.14 + 0.86;
    const halfShoulder = silW * 0.52 * bodyTilt;
    const halfWaist = silW * 0.36 * bodyTilt;
    const stride = (agent.stridePhase - 0.5) * silW * 0.42;

    ctx.save();
    ctx.globalAlpha = agent.opacity;

    // 접지 그림자
    ctx.fillStyle = formatOklch(scene.preset.inkNearOklch, 0.22);
    ctx.beginPath();
    ctx.ellipse(x, footY, Math.max(1.2, silW * 0.52), Math.max(0.6, silW * 0.14), 0, 0, Math.PI * 2);
    ctx.fill();

    // 몸통·다리 실루엣
    ctx.fillStyle = formatOklch(agent.fillOklch);
    ctx.strokeStyle = formatOklch(agent.strokeOklch);
    ctx.lineWidth = sw;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(x - halfShoulder, shoulderY);
    ctx.lineTo(x + halfShoulder, shoulderY);
    ctx.lineTo(x + halfWaist, hipY);
    if (agent.seated) {
      ctx.lineTo(x + silW * 0.32, footY);
      ctx.lineTo(x - silW * 0.32, footY);
    } else {
      ctx.lineTo(x + silW * 0.26 + stride, footY);
      ctx.lineTo(x, hipY + silH * 0.08);
      ctx.lineTo(x - silW * 0.26 - stride, footY);
    }
    ctx.lineTo(x - halfWaist, hipY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 머리 실루엣
    ctx.beginPath();
    ctx.arc(headCx, headCy, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 근경·중경 프리셋 소품 포인트
    if (agent.lodTier < 2) {
      const dir = agent.headYawRad >= 0 ? 1 : -1;
      const accentStroke = formatOklch(
        mixOklch(scene.preset.accentTintOklch, scene.preset.hazeFarOklch, agent.atmosphericFade * 0.78),
      );
      if (scene.preset.prop === "spear-cape") {
        const sx = x + dir * silW * 0.62;
        ctx.beginPath();
        ctx.moveTo(sx, footY - silH * 0.15);
        ctx.lineTo(sx, footY - silH * 1.4);
        ctx.stroke();
      } else if (scene.preset.prop === "lightstick-cheer") {
        const lx = x + dir * silW * 0.56;
        const ly = footY - silH * 1.04;
        ctx.fillStyle = accentStroke;
        ctx.beginPath();
        ctx.arc(lx, ly, Math.max(1.3, silW * 0.16), 0, Math.PI * 2);
        ctx.fill();
      } else if (scene.preset.prop === "briefcase-umbrella" && agent.propVariant === 0) {
        const r = silW * 1.1;
        ctx.fillStyle = accentStroke;
        ctx.beginPath();
        ctx.arc(x, footY - silH * 1.04, r, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (scene.preset.prop === "rolling-luggage") {
        const lx = x - dir * silW * 0.78;
        ctx.fillStyle = accentStroke;
        ctx.fillRect(lx, footY - silH * 0.3, silW * 0.44, silH * 0.3);
        ctx.strokeRect(lx, footY - silH * 0.3, silW * 0.44, silH * 0.3);
      }
    }

    // 선택적 시선 벡터
    if (showGazeVectors && agent.lodTier < 2) {
      ctx.strokeStyle = formatOklch(scene.preset.accentTintOklch, 0.75);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(headCx, headCy);
      ctx.lineTo(
        headCx + Math.cos(agent.gazeAngleRad) * (headR * 2.6),
        headCy + Math.sin(agent.gazeAngleRad) * (headR * 2.6),
      );
      ctx.stroke();
    }

    ctx.restore();
  }

  // 4) 주인공 시선 집중점 레티클
  if (showFocalReticle) {
    ctx.save();
    ctx.strokeStyle = chrome.accent;
    ctx.fillStyle = formatOklch(scene.preset.accentTintOklch, 0.22);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(focalX, focalY, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(focalX - 16, focalY);
    ctx.lineTo(focalX + 16, focalY);
    ctx.moveTo(focalX, focalY - 16);
    ctx.lineTo(focalX, focalY + 16);
    ctx.stroke();

    ctx.fillStyle = chrome.fg;
    ctx.font = "600 11px sans-serif";
    ctx.fillText("주인공 시선점", Math.min(w - 84, focalX + 14), Math.max(16, focalY - 8));
    ctx.restore();
  }

  return true;
}
