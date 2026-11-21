/**
 * 비겹침 3단 깊이 군중(엑스트라) 자동 드로잉 엔진.
 * - Poisson-disc 기반 비겹침 배치
 * - 주인공 비움 영역(Protagonist Safe Halo) 및 말풍선 충돌 0건 수학 보장
 * - 소실점 지평선 눈높이 잠금(vanishingPointY)
 * - 전경(흐림)/중경(0.65× 선두께)/원경(0.35× 톤 실루엣) 3단 깊이 감쇠
 * - 12종 포즈·실루엣·의상 스타일 + 순수 SVG + RGBA 픽셀 레이어 동시 출력
 */

import {
  buildOklchScenePalette,
  clampNumber,
  createSeededRng,
  CROWD_STYLE_VARIANTS,
  formatOklch,
  getCrowdStyleSpec,
  getThemeSpec,
  oklchToSrgbRgba,
  type AutoBgThemeId,
  type CrowdDensity,
  type CrowdStyleId,
  type DepthTier,
  type OklchColor,
  type OklchScenePalette,
  type TimeOfDay,
} from "./auto-bg-crowd-palettes";

export interface CutRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Circle2D {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

export interface Ellipse2D {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

export interface SafeHaloRegion {
  readonly protagonistBox: CutRect;
  readonly rect: CutRect;
  readonly faceEllipse: Ellipse2D;
  readonly paddingPx: number;
}

export interface DepthTierAttenuation {
  readonly tier: DepthTier;
  readonly strokeMultiplier: number;
  readonly blurPx: number;
  readonly fillOpacity: number;
  readonly lightnessDelta: number;
  readonly chromaScale: number;
  readonly minHeightRatio: number;
  readonly maxHeightRatio: number;
}

export const DEPTH_TIER_PROFILES: Readonly<Record<DepthTier, DepthTierAttenuation>> = Object.freeze({
  background: {
    tier: "background",
    strokeMultiplier: 0.35,
    blurPx: 0,
    fillOpacity: 0.5,
    lightnessDelta: 0.16,
    chromaScale: 0.55,
    minHeightRatio: 0.17,
    maxHeightRatio: 0.25,
  },
  midground: {
    tier: "midground",
    strokeMultiplier: 0.65,
    blurPx: 0,
    fillOpacity: 0.84,
    lightnessDelta: 0,
    chromaScale: 0.9,
    minHeightRatio: 0.3,
    maxHeightRatio: 0.42,
  },
  foreground: {
    tier: "foreground",
    strokeMultiplier: 1.0,
    blurPx: 3.5,
    fillOpacity: 0.92,
    lightnessDelta: -0.18,
    chromaScale: 0.65,
    minHeightRatio: 0.56,
    maxHeightRatio: 0.72,
  },
});

export interface PlacedCrowdMember {
  readonly id: string;
  readonly tier: DepthTier;
  readonly styleId: CrowdStyleId;
  readonly styleLabelKo: string;
  readonly centerX: number;
  readonly topY: number;
  readonly eyeY: number;
  readonly footY: number;
  readonly width: number;
  readonly height: number;
  readonly bounds: CutRect;
  readonly headCircle: Circle2D;
  readonly strokeMultiplier: number;
  readonly strokeWidth: number;
  readonly blurPx: number;
  readonly fillOklch: string;
  readonly strokeOklch: string;
  readonly accentOklch: string;
  readonly fillColor: OklchColor;
  readonly strokeColor: OklchColor;
  readonly opacity: number;
}

export interface CrowdRgbaPixelLayer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  readonly nonTransparentPixelCount: number;
}

export interface CrowdCollisionAudit {
  readonly protagonistSafeHaloCollisions: number;
  readonly speechBubbleCollisions: number;
  readonly sameTierOverlaps: number;
}

export interface CrowdTierSummary {
  readonly count: number;
  readonly strokeMultiplier: number;
  readonly strokeWidth: number;
  readonly blurPx: number;
}

export interface CrowdGenerationOptions {
  readonly width: number;
  readonly height: number;
  readonly vanishingPointX: number;
  readonly vanishingPointY: number;
  readonly theme: AutoBgThemeId;
  readonly timeOfDay: TimeOfDay;
  readonly density: CrowdDensity;
  readonly targetCount?: number;
  readonly baseStrokeWidth?: number;
  readonly protagonistBox: CutRect;
  readonly safeHaloPaddingPx?: number;
  readonly speechBubbles?: readonly CutRect[];
  readonly seed?: number;
  readonly includeRgbaLayer?: boolean;
  readonly rgbaMaxDimension?: number;
  readonly forceStylePool?: readonly CrowdStyleId[];
}

export interface CrowdGenerationResult {
  readonly svg: string;
  readonly innerMarkup: string;
  readonly defsMarkup: string;
  readonly members: readonly PlacedCrowdMember[];
  readonly safeHalo: SafeHaloRegion;
  readonly speechBubbles: readonly CutRect[];
  readonly vanishingPointY: number;
  readonly tierSummary: Readonly<Record<DepthTier, CrowdTierSummary>>;
  readonly collisionAudit: CrowdCollisionAudit;
  readonly rgbaLayer: CrowdRgbaPixelLayer | null;
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : "0.0";
}

export function rectsIntersect(a: CutRect, b: CutRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function circleIntersectsRect(circle: Circle2D, rect: CutRect): boolean {
  const closestX = clampNumber(circle.cx, rect.x, rect.x + rect.width);
  const closestY = clampNumber(circle.cy, rect.y, rect.y + rect.height);
  const dx = circle.cx - closestX;
  const dy = circle.cy - closestY;
  return dx * dx + dy * dy < circle.r * circle.r;
}

export function circleIntersectsEllipse(circle: Circle2D, ellipse: Ellipse2D): boolean {
  const rx = Math.max(1, ellipse.rx + circle.r);
  const ry = Math.max(1, ellipse.ry + circle.r);
  const nx = (circle.cx - ellipse.cx) / rx;
  const ny = (circle.cy - ellipse.cy) / ry;
  return nx * nx + ny * ny < 1;
}

export function expandRect(rect: CutRect, padX: number, padY = padX): CutRect {
  return {
    x: rect.x - padX,
    y: rect.y - padY,
    width: Math.max(0, rect.width + padX * 2),
    height: Math.max(0, rect.height + padY * 2),
  };
}

/** 주인공 얼굴·상반신·주변 여유 간격을 포함하는 수학적 비움 영역(Safe Halo)을 계산한다. */
export function computeProtagonistSafeHalo(
  protagonistBox: CutRect,
  canvasWidth: number,
  canvasHeight: number,
  paddingPx?: number,
): SafeHaloRegion {
  const pad = clampNumber(
    paddingPx ?? Math.max(22, protagonistBox.width * 0.16),
    8,
    Math.max(48, canvasWidth * 0.22),
  );
  const rx = clampNumber(protagonistBox.x - pad, 0, canvasWidth);
  const ry = clampNumber(protagonistBox.y - pad, 0, canvasHeight);
  const right = clampNumber(protagonistBox.x + protagonistBox.width + pad, rx, canvasWidth);
  const bottom = clampNumber(protagonistBox.y + protagonistBox.height + pad * 0.5, ry, canvasHeight);

  const faceEllipse: Ellipse2D = {
    cx: protagonistBox.x + protagonistBox.width * 0.5,
    cy: protagonistBox.y + protagonistBox.height * 0.17,
    rx: protagonistBox.width * 0.56 + pad,
    ry: protagonistBox.height * 0.24 + pad,
  };

  return {
    protagonistBox,
    rect: {
      x: rx,
      y: ry,
      width: Math.max(0, right - rx),
      height: Math.max(0, bottom - ry),
    },
    faceEllipse,
    paddingPx: pad,
  };
}

function tierCountsForDensity(density: CrowdDensity, targetCount?: number): Record<DepthTier, number> {
  if (density === "none") return { background: 0, midground: 0, foreground: 0 };
  const total =
    targetCount !== undefined
      ? Math.round(clampNumber(targetCount, 0, 48))
      : density === "sparse"
        ? 6
        : density === "medium"
          ? 12
          : 20;
  if (total <= 0) return { background: 0, midground: 0, foreground: 0 };
  const fg = total >= 5 ? Math.min(3, Math.max(1, Math.round(total * 0.16))) : 0;
  const mid = Math.max(1, Math.round(total * 0.36));
  const bg = Math.max(0, total - fg - mid);
  return { background: bg, midground: mid, foreground: fg };
}

function isCandidateValid(
  bounds: CutRect,
  headCircle: Circle2D,
  tier: DepthTier,
  safeHalo: SafeHaloRegion,
  expandedBubbles: readonly CutRect[],
  placed: readonly PlacedCrowdMember[],
): boolean {
  // 1. 주인공 Safe Halo(바운딩 + 얼굴 보호 타원) 절대 회피
  if (rectsIntersect(bounds, safeHalo.rect)) return false;
  if (circleIntersectsRect(headCircle, safeHalo.rect)) return false;
  if (circleIntersectsEllipse(headCircle, safeHalo.faceEllipse)) return false;

  // 2. 말풍선 절대 회피
  for (const bubble of expandedBubbles) {
    if (rectsIntersect(bounds, bubble)) return false;
    if (circleIntersectsRect(headCircle, bubble)) return false;
  }

  // 3. 같은 깊이 층 비겹침(Poisson-disc 거리) + 전 층 머리 충돌 방지
  for (const existing of placed) {
    const hdx = headCircle.cx - existing.headCircle.cx;
    const hdy = headCircle.cy - existing.headCircle.cy;
    const minHeadDist = (headCircle.r + existing.headCircle.r) * 1.15;
    if (hdx * hdx + hdy * hdy < minHeadDist * minHeadDist) return false;

    if (existing.tier === tier) {
      if (rectsIntersect(bounds, existing.bounds)) return false;
      const minCenterDist = (bounds.width + existing.bounds.width) * 0.56;
      const cdx = headCircle.cx - existing.headCircle.cx;
      if (Math.abs(cdx) < minCenterDist) return false;
    }
  }
  return true;
}

function pickStyleForMember(
  theme: AutoBgThemeId,
  rng: () => number,
  index: number,
  forceStylePool?: readonly CrowdStyleId[],
): CrowdStyleId {
  if (forceStylePool && forceStylePool.length > 0) {
    return forceStylePool[index % forceStylePool.length];
  }
  const spec = getThemeSpec(theme);
  // 80%는 테마 어울림 의상, 20%는 전체 12종 풀에서 자연 변주
  if (rng() < 0.82 && spec.preferredCrowdStyles.length > 0) {
    const idx = Math.floor(rng() * spec.preferredCrowdStyles.length);
    return spec.preferredCrowdStyles[idx];
  }
  const allIdx = Math.floor(rng() * CROWD_STYLE_VARIANTS.length);
  return CROWD_STYLE_VARIANTS[allIdx].id;
}

function buildCrowdMemberSvg(member: PlacedCrowdMember): string {
  const spec = getCrowdStyleSpec(member.styleId);
  const cx = member.centerX;
  const topY = member.topY;
  const h = member.height;
  const w = member.width;
  const headR = member.headCircle.r;
  const headCy = member.headCircle.cy;
  const shoulderY = topY + headR * 2.35;
  const waistY = topY + h * 0.52;
  const footY = member.footY;
  const shoulderHalf = (w * spec.shoulderRatio) / 0.34 * 0.5;
  const hipHalf = (w * spec.hipRatio) / 0.34 * 0.5;
  const sw = fmt(member.strokeWidth);

  // 상체·하체 실루엣 패스 (포즈 + 의상 스타일 반영)
  const stride = spec.poseKind === "walk-left" ? -w * 0.16 : spec.poseKind === "walk-right" ? w * 0.16 : 0;
  const skirtFlare = spec.accessory === "gown" ? w * 0.24 : spec.accessory === "cape" ? w * 0.1 : 0;

  const torsoPath = [
    `M ${fmt(cx - shoulderHalf)} ${fmt(shoulderY)}`,
    `Q ${fmt(cx)} ${fmt(shoulderY - headR * 0.45)} ${fmt(cx + shoulderHalf)} ${fmt(shoulderY)}`,
    `L ${fmt(cx + hipHalf + skirtFlare)} ${fmt(spec.accessory === "gown" ? footY : waistY + h * 0.12)}`,
    `L ${fmt(cx - hipHalf - skirtFlare)} ${fmt(spec.accessory === "gown" ? footY : waistY + h * 0.12)}`,
    "Z",
  ].join(" ");

  const legsMarkup =
    spec.accessory === "gown"
      ? ""
      : [
          `<path d="M ${fmt(cx - hipHalf * 0.5)} ${fmt(waistY + h * 0.1)} L ${fmt(cx - hipHalf * 0.65 - stride)} ${fmt(footY)} L ${fmt(cx - hipHalf * 0.15 - stride)} ${fmt(footY)} L ${fmt(cx - 1)} ${fmt(waistY + h * 0.15)} Z" fill="${member.fillOklch}" stroke="${member.strokeOklch}" stroke-width="${sw}"/>`,
          `<path d="M ${fmt(cx + 1)} ${fmt(waistY + h * 0.15)} L ${fmt(cx + hipHalf * 0.15 + stride)} ${fmt(footY)} L ${fmt(cx + hipHalf * 0.65 + stride)} ${fmt(footY)} L ${fmt(cx + hipHalf * 0.5)} ${fmt(waistY + h * 0.1)} Z" fill="${member.fillOklch}" stroke="${member.strokeOklch}" stroke-width="${sw}"/>`,
        ].join("");

  let accessoryMarkup = "";
  if (spec.accessory === "umbrella") {
    const canopyY = topY - headR * 0.2;
    const canopyR = w * 0.52;
    accessoryMarkup = [
      `<path d="M ${fmt(cx - canopyR)} ${fmt(canopyY + headR * 0.9)} Q ${fmt(cx)} ${fmt(canopyY - headR * 1.1)} ${fmt(cx + canopyR)} ${fmt(canopyY + headR * 0.9)} Z" fill="${member.accentOklch}" stroke="${member.strokeOklch}" stroke-width="${sw}"/>`,
      `<line x1="${fmt(cx)}" y1="${fmt(canopyY + headR * 0.6)}" x2="${fmt(cx + shoulderHalf * 0.35)}" y2="${fmt(waistY)}" stroke="${member.strokeOklch}" stroke-width="${fmt(Math.max(0.7, member.strokeWidth * 0.8))}"/>`,
    ].join("");
  } else if (spec.accessory === "hat") {
    accessoryMarkup = `<polygon points="${fmt(cx - headR * 2.1)},${fmt(headCy - headR * 0.25)} ${fmt(cx)},${fmt(headCy - headR * 1.6)} ${fmt(cx + headR * 2.1)},${fmt(headCy - headR * 0.25)}" fill="${member.accentOklch}" stroke="${member.strokeOklch}" stroke-width="${sw}"/>`;
  } else if (spec.accessory === "lightstick") {
    const stickX = cx + shoulderHalf * 0.95;
    const stickY = topY + headR * 0.4;
    accessoryMarkup = [
      `<line x1="${fmt(cx + shoulderHalf * 0.7)}" y1="${fmt(shoulderY + headR)}" x2="${fmt(stickX)}" y2="${fmt(stickY)}" stroke="${member.strokeOklch}" stroke-width="${fmt(Math.max(1, member.strokeWidth * 1.1))}"/>`,
      `<circle cx="${fmt(stickX)}" cy="${fmt(stickY)}" r="${fmt(Math.max(2.5, headR * 0.45))}" fill="${member.accentOklch}"/>`,
    ].join("");
  } else if (spec.accessory === "bag") {
    accessoryMarkup = `<rect x="${fmt(cx + shoulderHalf * 0.55)}" y="${fmt(waistY - headR * 0.4)}" width="${fmt(w * 0.22)}" height="${fmt(h * 0.14)}" rx="2" fill="${member.accentOklch}" stroke="${member.strokeOklch}" stroke-width="${sw}"/>`;
  } else if (spec.accessory === "cup") {
    accessoryMarkup = `<rect x="${fmt(cx + shoulderHalf * 0.65)}" y="${fmt(shoulderY + headR * 1.4)}" width="${fmt(Math.max(3, w * 0.12))}" height="${fmt(Math.max(5, h * 0.06))}" rx="1" fill="${member.accentOklch}"/>`;
  } else if (spec.accessory === "phone") {
    accessoryMarkup = `<rect x="${fmt(cx - headR * 0.35)}" y="${fmt(shoulderY + headR * 1.2)}" width="${fmt(Math.max(3, headR * 0.7))}" height="${fmt(Math.max(4, headR * 0.9))}" rx="1" fill="${member.accentOklch}"/>`;
  }

  return [
    `<g data-crowd-id="${member.id}" data-crowd-tier="${member.tier}" data-crowd-style="${member.styleId}" data-eye-y="${fmt(member.eyeY)}" opacity="${member.opacity.toFixed(2)}">`,
    legsMarkup,
    `<path d="${torsoPath}" fill="${member.fillOklch}" stroke="${member.strokeOklch}" stroke-width="${sw}" stroke-linejoin="round"/>`,
    `<circle cx="${fmt(cx)}" cy="${fmt(headCy)}" r="${fmt(headR)}" fill="${member.fillOklch}" stroke="${member.strokeOklch}" stroke-width="${sw}"/>`,
    accessoryMarkup,
    `</g>`,
  ].join("");
}

/** Alpha-over 블렌딩으로 단일 픽셀을 RGBA 버퍼에 합성한다. */
function blendPixel(
  data: Uint8ClampedArray,
  idx: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const srcA = a / 255;
  if (srcA <= 0) return;
  const dstA = data[idx + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;
  data[idx] = Math.round((r * srcA + data[idx] * dstA * (1 - srcA)) / outA);
  data[idx + 1] = Math.round((g * srcA + data[idx + 1] * dstA * (1 - srcA)) / outA);
  data[idx + 2] = Math.round((b * srcA + data[idx + 2] * dstA * (1 - srcA)) / outA);
  data[idx + 3] = Math.round(outA * 255);
}

function applyBoxBlur1D(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
  horizontal: boolean,
): void {
  const span = radius * 2 + 1;
  if (horizontal) {
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const sx = clampNumber(x + k, 0, w - 1);
          const idx = (y * w + sx) * 4;
          r += src[idx];
          g += src[idx + 1];
          b += src[idx + 2];
          a += src[idx + 3];
        }
        const out = (y * w + x) * 4;
        dst[out] = Math.round(r / span);
        dst[out + 1] = Math.round(g / span);
        dst[out + 2] = Math.round(b / span);
        dst[out + 3] = Math.round(a / span);
      }
    }
    return;
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const sy = clampNumber(y + k, 0, h - 1);
        const idx = (sy * w + x) * 4;
        r += src[idx];
        g += src[idx + 1];
        b += src[idx + 2];
        a += src[idx + 3];
      }
      const out = (y * w + x) * 4;
      dst[out] = Math.round(r / span);
      dst[out + 1] = Math.round(g / span);
      dst[out + 2] = Math.round(b / span);
      dst[out + 3] = Math.round(a / span);
    }
  }
}

function rasterizeMemberIntoBuffer(
  data: Uint8ClampedArray,
  bufW: number,
  bufH: number,
  scaleX: number,
  scaleY: number,
  member: PlacedCrowdMember,
): void {
  const [fr, fg, fb, fa] = oklchToSrgbRgba({ ...member.fillColor, a: member.opacity });
  const cx = member.centerX * scaleX;
  const headCy = member.headCircle.cy * scaleY;
  const headR = Math.max(1.5, member.headCircle.r * Math.min(scaleX, scaleY));

  // 머리 원 래스터라이즈
  const hx0 = Math.max(0, Math.floor(cx - headR));
  const hx1 = Math.min(bufW - 1, Math.ceil(cx + headR));
  const hy0 = Math.max(0, Math.floor(headCy - headR));
  const hy1 = Math.min(bufH - 1, Math.ceil(headCy + headR));
  for (let y = hy0; y <= hy1; y += 1) {
    for (let x = hx0; x <= hx1; x += 1) {
      const dx = x - cx;
      const dy = y - headCy;
      if (dx * dx + dy * dy <= headR * headR) {
        blendPixel(data, (y * bufW + x) * 4, fr, fg, fb, fa);
      }
    }
  }

  // 상체+하체 실루엣 사다리꼴 래스터라이즈
  const yStart = Math.max(0, Math.floor((member.topY + member.headCircle.r * 2.1) * scaleY));
  const yEnd = Math.min(bufH - 1, Math.ceil(member.footY * scaleY));
  const topHalf = Math.max(2, member.width * 0.44 * scaleX);
  const botHalf = Math.max(2, member.width * 0.34 * scaleX);
  const bodySpan = Math.max(1, yEnd - yStart);
  for (let y = yStart; y <= yEnd; y += 1) {
    const t = (y - yStart) / bodySpan;
    const halfW = topHalf + (botHalf - topHalf) * t;
    const x0 = Math.max(0, Math.floor(cx - halfW));
    const x1 = Math.min(bufW - 1, Math.ceil(cx + halfW));
    for (let x = x0; x <= x1; x += 1) {
      blendPixel(data, (y * bufW + x) * 4, fr, fg, fb, fa);
    }
  }
}

/** 3단 깊이 군중을 순수 TypeScript RGBA 픽셀 레이어로 래스터라이즈한다(전경 흐림 포함). */
function rasterizeCrowdToRgba(
  members: readonly PlacedCrowdMember[],
  canvasW: number,
  canvasH: number,
  maxDimension: number,
): CrowdRgbaPixelLayer {
  const longest = Math.max(canvasW, canvasH, 1);
  const scale = longest > maxDimension ? maxDimension / longest : 1;
  const bufW = Math.max(16, Math.round(canvasW * scale));
  const bufH = Math.max(16, Math.round(canvasH * scale));
  const scaleX = bufW / canvasW;
  const scaleY = bufH / canvasH;

  const data = new Uint8ClampedArray(bufW * bufH * 4);
  const fgMembers: PlacedCrowdMember[] = [];

  for (const member of members) {
    if (member.tier === "foreground") {
      fgMembers.push(member);
    } else {
      rasterizeMemberIntoBuffer(data, bufW, bufH, scaleX, scaleY, member);
    }
  }

  if (fgMembers.length > 0) {
    const fgRaw = new Uint8ClampedArray(bufW * bufH * 4);
    for (const member of fgMembers) {
      rasterizeMemberIntoBuffer(fgRaw, bufW, bufH, scaleX, scaleY, member);
    }
    const blurRadius = Math.max(1, Math.round(2 * scale));
    const tmp = new Uint8ClampedArray(bufW * bufH * 4);
    const blurred = new Uint8ClampedArray(bufW * bufH * 4);
    applyBoxBlur1D(fgRaw, tmp, bufW, bufH, blurRadius, true);
    applyBoxBlur1D(tmp, blurred, bufW, bufH, blurRadius, false);

    for (let i = 0; i < data.length; i += 4) {
      if (blurred[i + 3] > 0) {
        blendPixel(data, i, blurred[i], blurred[i + 1], blurred[i + 2], blurred[i + 3]);
      }
    }
  }

  let nonTransparentPixelCount = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) nonTransparentPixelCount += 1;
  }

  return { width: bufW, height: bufH, data, nonTransparentPixelCount };
}

/** Poisson-disc 비겹침 3단 깊이 군중 레이어를 생성한다. */
export function generateDepthSortedCrowdLayer(
  options: CrowdGenerationOptions,
): CrowdGenerationResult {
  const w = Math.round(clampNumber(options.width, 160, 4096));
  const h = Math.round(clampNumber(options.height, 160, 4096));
  const vpY = clampNumber(options.vanishingPointY, h * 0.14, h * 0.84);
  const baseStroke = clampNumber(options.baseStrokeWidth ?? 2.2, 0.6, 6);
  const rng = createSeededRng(options.seed ?? 42019);
  const palette: OklchScenePalette = buildOklchScenePalette(options.theme, options.timeOfDay);

  const safeHalo = computeProtagonistSafeHalo(
    options.protagonistBox,
    w,
    h,
    options.safeHaloPaddingPx,
  );
  const speechBubbles = options.speechBubbles ?? [];
  const expandedBubbles = speechBubbles.map((b) => expandRect(b, 8, 8));
  const counts = tierCountsForDensity(options.density, options.targetCount);

  const placed: PlacedCrowdMember[] = [];
  const tiers: readonly DepthTier[] = ["background", "midground", "foreground"];
  let globalIndex = 0;

  for (const tier of tiers) {
    const profile = DEPTH_TIER_PROFILES[tier];
    const desired = counts[tier];
    if (desired <= 0) continue;

    const strokeWidth = Number((baseStroke * profile.strokeMultiplier).toFixed(3));
    const maxAttempts = desired * 48;
    let tierPlaced = 0;

    // Poisson-disc 다중 후보 샘플링 (좌·우 코리더 균형 탐색)
    for (let attempt = 0; attempt < maxAttempts && tierPlaced < desired; attempt += 1) {
      const heightRatio =
        profile.minHeightRatio + rng() * (profile.maxHeightRatio - profile.minHeightRatio);
      const memberHeight = h * heightRatio;
      const memberWidth = memberHeight * 0.34;
      const headR = memberHeight * 0.072;

      let centerX: number;
      if (tier === "foreground") {
        // 전경 프레이밍 엑스트라는 좌우 바깥쪽 가장자리(0..22% / 78..100%) 우선 배치
        const leftSide = attempt % 2 === 0;
        centerX = leftSide
          ? memberWidth * 0.32 + rng() * (w * 0.2)
          : w - memberWidth * 0.32 - rng() * (w * 0.2);
      } else {
        // 계층적 스트래티파이드 + 지터 Poisson 후보
        const band = (attempt % Math.max(2, desired)) / Math.max(2, desired);
        const jitter = (rng() - 0.5) * (1 / Math.max(2, desired));
        const normX = clampNumber(band + 0.5 / Math.max(2, desired) + jitter, 0.05, 0.95);
        centerX = normX * w;
      }

      // 소실점 지평선 눈높이 잠금 (±4.5% 자연 신장 편차)
      const eyeVariance = (rng() - 0.5) * 0.09 * memberHeight;
      const eyeY = clampNumber(vpY + eyeVariance, headR * 1.4, h - headR * 2);
      const topY = eyeY - memberHeight * 0.105;
      const footY = topY + memberHeight;
      const headCircle: Circle2D = { cx: centerX, cy: topY + headR, r: headR };
      const bounds: CutRect = {
        x: clampNumber(centerX - memberWidth * 0.5, 0, w),
        y: clampNumber(topY, 0, h),
        width: Math.min(memberWidth, w),
        height: clampNumber(Math.min(footY, h) - clampNumber(topY, 0, h), 1, h),
      };

      if (!isCandidateValid(bounds, headCircle, tier, safeHalo, expandedBubbles, placed)) {
        continue;
      }

      const styleId = pickStyleForMember(options.theme, rng, globalIndex, options.forceStylePool);
      const styleSpec = getCrowdStyleSpec(styleId);
      const fillColor: OklchColor = {
        l: clampNumber(palette.crowdBase.l + profile.lightnessDelta + (rng() - 0.5) * 0.06, 0.12, 0.88),
        c: clampNumber(palette.crowdBase.c * profile.chromaScale, 0.01, 0.16),
        h: (palette.crowdBase.h + styleSpec.hueShift + 360) % 360,
      };
      const strokeColor: OklchColor = {
        l: clampNumber(palette.crowdInk.l + (tier === "background" ? 0.22 : 0), 0.1, 0.7),
        c: palette.crowdInk.c,
        h: palette.crowdInk.h,
      };
      const accentColor: OklchColor = {
        l: clampNumber(palette.crowdAccent.l + profile.lightnessDelta * 0.5, 0.2, 0.9),
        c: clampNumber(palette.crowdAccent.c * (tier === "background" ? 0.6 : 1), 0.02, 0.22),
        h: (palette.crowdAccent.h + styleSpec.hueShift + 360) % 360,
      };

      placed.push({
        id: `crowd-${tier}-${tierPlaced + 1}`,
        tier,
        styleId,
        styleLabelKo: styleSpec.labelKo,
        centerX,
        topY,
        eyeY,
        footY,
        width: memberWidth,
        height: memberHeight,
        bounds,
        headCircle,
        strokeMultiplier: profile.strokeMultiplier,
        strokeWidth,
        blurPx: profile.blurPx,
        fillOklch: formatOklch(fillColor),
        strokeOklch: formatOklch(strokeColor),
        accentOklch: formatOklch(accentColor),
        fillColor,
        strokeColor,
        opacity: profile.fillOpacity,
      });

      tierPlaced += 1;
      globalIndex += 1;
    }
  }

  // 화가 알고리즘(Painter's Order): 원경 → 중경 → 전경, 층 내에서는 발끝(footY) 오름차순
  const tierOrder: Record<DepthTier, number> = { background: 0, midground: 1, foreground: 2 };
  const sorted = [...placed].sort((a, b) => {
    const tDiff = tierOrder[a.tier] - tierOrder[b.tier];
    return tDiff !== 0 ? tDiff : a.footY - b.footY;
  });

  // 독립 충돌 감사
  let protagonistSafeHaloCollisions = 0;
  let speechBubbleCollisions = 0;
  let sameTierOverlaps = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const m = sorted[i];
    if (
      rectsIntersect(m.bounds, safeHalo.rect) ||
      circleIntersectsRect(m.headCircle, safeHalo.rect) ||
      circleIntersectsEllipse(m.headCircle, safeHalo.faceEllipse)
    ) {
      protagonistSafeHaloCollisions += 1;
    }
    for (const bubble of expandedBubbles) {
      if (rectsIntersect(m.bounds, bubble) || circleIntersectsRect(m.headCircle, bubble)) {
        speechBubbleCollisions += 1;
      }
    }
    for (let j = i + 1; j < sorted.length; j += 1) {
      const other = sorted[j];
      if (m.tier === other.tier && rectsIntersect(m.bounds, other.bounds)) {
        sameTierOverlaps += 1;
      }
    }
  }

  const bgMarkup = sorted.filter((m) => m.tier === "background").map(buildCrowdMemberSvg).join("");
  const midMarkup = sorted.filter((m) => m.tier === "midground").map(buildCrowdMemberSvg).join("");
  const fgMarkup = sorted.filter((m) => m.tier === "foreground").map(buildCrowdMemberSvg).join("");

  const defsMarkup = `<filter id="crowd-fg-blur" x="-15%" y="-15%" width="130%" height="130%"><feGaussianBlur stdDeviation="${DEPTH_TIER_PROFILES.foreground.blurPx.toFixed(1)}"/></filter>`;
  const innerMarkup = [
    `<g id="crowd-background" data-stroke-multiplier="0.35">${bgMarkup}</g>`,
    `<g id="crowd-midground" data-stroke-multiplier="0.65">${midMarkup}</g>`,
    `<g id="crowd-foreground" data-stroke-multiplier="1.00" filter="url(#crowd-fg-blur)">${fgMarkup}</g>`,
  ].join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"><defs>${defsMarkup}</defs>${innerMarkup}</svg>`;

  const tierSummary: Record<DepthTier, CrowdTierSummary> = {
    background: {
      count: sorted.filter((m) => m.tier === "background").length,
      strokeMultiplier: DEPTH_TIER_PROFILES.background.strokeMultiplier,
      strokeWidth: Number((baseStroke * DEPTH_TIER_PROFILES.background.strokeMultiplier).toFixed(3)),
      blurPx: DEPTH_TIER_PROFILES.background.blurPx,
    },
    midground: {
      count: sorted.filter((m) => m.tier === "midground").length,
      strokeMultiplier: DEPTH_TIER_PROFILES.midground.strokeMultiplier,
      strokeWidth: Number((baseStroke * DEPTH_TIER_PROFILES.midground.strokeMultiplier).toFixed(3)),
      blurPx: DEPTH_TIER_PROFILES.midground.blurPx,
    },
    foreground: {
      count: sorted.filter((m) => m.tier === "foreground").length,
      strokeMultiplier: DEPTH_TIER_PROFILES.foreground.strokeMultiplier,
      strokeWidth: Number((baseStroke * DEPTH_TIER_PROFILES.foreground.strokeMultiplier).toFixed(3)),
      blurPx: DEPTH_TIER_PROFILES.foreground.blurPx,
    },
  };

  const rgbaLayer =
    options.includeRgbaLayer === false
      ? null
      : rasterizeCrowdToRgba(sorted, w, h, options.rgbaMaxDimension ?? 240);

  return {
    svg,
    innerMarkup,
    defsMarkup,
    members: Object.freeze(sorted),
    safeHalo,
    speechBubbles: Object.freeze([...speechBubbles]),
    vanishingPointY: vpY,
    tierSummary: Object.freeze(tierSummary),
    collisionAudit: Object.freeze({
      protagonistSafeHaloCollisions,
      speechBubbleCollisions,
      sameTierOverlaps,
    }),
    rgbaLayer,
  };
}
