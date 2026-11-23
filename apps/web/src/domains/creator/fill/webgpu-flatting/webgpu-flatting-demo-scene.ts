/**
 * WebGPU 자동 플랫팅 인터랙티브 데모용 웹툰 캐릭터 선화 버퍼 및 합성기.
 *
 * - 외부 이미지 자산 없이 순수 결정론 픽셀 래스터라이저로 웹툰 캐릭터 상반신 선화를 생성한다.
 * - 머리(Hair)·피부(Skin)·의상(Outfit) 3개 영역에 의도적인 틈새(4px/6px/8px 또는 6px/10px/12px)를
 *   배치해 `gapClosePx (0~16px)` 슬라이더 조절에 따른 누수 차단 과정을 실시간으로 검증할 수 있다.
 */

export type RgbaColorTuple = readonly [number, number, number, number];

export interface AutoFlattingSeed {
  readonly id: number;
  readonly label?: string;
  readonly x: number;
  readonly y: number;
  readonly color: RgbaColorTuple;
}

export type DemoCharacterPresetId = "portrait-open-gaps" | "wide-gap-sketch";

export interface DemoGapMarker {
  readonly id: string;
  readonly regionKey: "hair" | "skin" | "outfit";
  readonly x: number;
  readonly y: number;
  readonly gapWidthPx: number;
}

export interface DemoCharacterLineartScene {
  readonly presetId: DemoCharacterPresetId;
  readonly width: number;
  readonly height: number;
  readonly lineartRgba: Uint8ClampedArray;
  readonly seeds: readonly AutoFlattingSeed[];
  readonly gapMarkers: readonly DemoGapMarker[];
}

export const DEMO_FLATTING_PALETTE = Object.freeze({
  hair: Object.freeze([74, 92, 138, 255] as const),
  skin: Object.freeze([246, 212, 186, 255] as const),
  outfit: Object.freeze([208, 110, 78, 255] as const),
  ink: Object.freeze([30, 27, 25, 255] as const),
  paper: Object.freeze([248, 245, 240, 255] as const),
  bridgeHighlight: Object.freeze([42, 178, 196, 255] as const),
});

interface Point2D {
  readonly x: number;
  readonly y: number;
}

function plotAntiAliasedDot(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
): void {
  const minX = Math.max(0, Math.floor(cx - radius - 1));
  const maxX = Math.min(width - 1, Math.ceil(cx + radius + 1));
  const minY = Math.max(0, Math.floor(cy - radius - 1));
  const maxY = Math.min(height - 1, Math.ceil(cy + radius + 1));
  const [ir, ig, ib] = DEMO_FLATTING_PALETTE.ink;

  for (let y = minY; y <= maxY; y += 1) {
    const dy = y - cy;
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      const dist = Math.hypot(dx, dy);
      if (dist > radius + 0.85) continue;
      const coverage = dist <= radius ? 1 : Math.max(0, 1 - (dist - radius) / 0.85);
      const alpha = Math.round(coverage * 255);
      const off = (y * width + x) * 4;
      const prevA = rgba[off + 3] ?? 0;
      if (alpha > prevA) {
        rgba[off] = ir;
        rgba[off + 1] = ig;
        rgba[off + 2] = ib;
        rgba[off + 3] = alpha;
      }
    }
  }
}

function strokePolyline(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  points: readonly Point2D[],
  thickness: number,
): void {
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(segLen * 2));
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      plotAntiAliasedDot(rgba, width, height, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, thickness);
    }
  }
}

function eraseHorizontalGap(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  gapWidthPx: number,
  bandHalfHeight: number,
): void {
  const halfW = Math.floor(gapWidthPx / 2);
  const minX = Math.max(0, Math.round(centerX) - halfW);
  const maxX = Math.min(width - 1, minX + Math.max(1, Math.round(gapWidthPx)) - 1);
  const minY = Math.max(0, Math.round(centerY) - bandHalfHeight);
  const maxY = Math.min(height - 1, Math.round(centerY) + bandHalfHeight);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const off = (y * width + x) * 4;
      rgba[off] = 0;
      rgba[off + 1] = 0;
      rgba[off + 2] = 0;
      rgba[off + 3] = 0;
    }
  }
}

function eraseVerticalGap(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  gapHeightPx: number,
  bandHalfWidth: number,
): void {
  const halfH = Math.floor(gapHeightPx / 2);
  const minY = Math.max(0, Math.round(centerY) - halfH);
  const maxY = Math.min(height - 1, minY + Math.max(1, Math.round(gapHeightPx)) - 1);
  const minX = Math.max(0, Math.round(centerX) - bandHalfWidth);
  const maxX = Math.min(width - 1, Math.round(centerX) + bandHalfWidth);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const off = (y * width + x) * 4;
      rgba[off] = 0;
      rgba[off + 1] = 0;
      rgba[off + 2] = 0;
      rgba[off + 3] = 0;
    }
  }
}

function sampleEllipseArc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  startRad: number,
  endRad: number,
  segments: number,
): Point2D[] {
  const pts: Point2D[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const angle = startRad + (endRad - startRad) * t;
    pts.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
  }
  return pts;
}

/**
 * 열린 선화 틈새가 포함된 웹툰 캐릭터 상반신 데모 장면을 생성한다.
 * 기본 해상도는 224×224이며 머리·피부·의상 3개 시드와 틈새 좌표를 반환한다.
 */
export function buildDemoCharacterLineartScene(
  presetId: DemoCharacterPresetId = "portrait-open-gaps",
  sizePx = 224,
): DemoCharacterLineartScene {
  const width = Math.max(64, Math.floor(sizePx));
  const height = width;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const s = width / 224;
  const strokeR = Math.max(1.15, 1.35 * s);

  const pt = (x: number, y: number): Point2D => ({ x: x * s, y: y * s });

  // 1. 머리 실루엣(상단 크라운 + 양쪽 옆머리 + 앞머리 경계선)
  const hairCrown = sampleEllipseArc(112 * s, 94 * s, 68 * s, 68 * s, Math.PI * 1.02, Math.PI * 1.98, 48);
  const crownLeft = hairCrown[0] ?? pt(44, 94);
  const crownRight = hairCrown[hairCrown.length - 1] ?? pt(180, 94);
  const leftSideHair: Point2D[] = [
    crownLeft,
    pt(40, 118),
    pt(48, 134),
    pt(66, 126),
    pt(68, 102),
  ];
  const rightSideHair: Point2D[] = [
    crownRight,
    pt(184, 118),
    pt(176, 134),
    pt(158, 126),
    pt(156, 102),
  ];
  const bangsLine: Point2D[] = [
    pt(68, 102),
    pt(82, 82),
    pt(96, 98),
    pt(112, 78),
    pt(128, 98),
    pt(142, 82),
    pt(156, 102),
  ];

  strokePolyline(rgba, width, height, hairCrown, strokeR);
  strokePolyline(rgba, width, height, leftSideHair, strokeR);
  strokePolyline(rgba, width, height, rightSideHair, strokeR);
  strokePolyline(rgba, width, height, bangsLine, strokeR);

  // 2. 얼굴·턱선 실루엣 (피부 영역 — 좌하단 볼 외곽선이 외부 배경과 직접 맞닿도록 배치)
  const jawline: Point2D[] = [
    pt(68, 102),
    pt(68, 144),
    pt(84, 160),
    pt(112, 168),
    pt(140, 160),
    pt(156, 144),
    pt(156, 102),
  ];
  strokePolyline(rgba, width, height, jawline, strokeR);

  // 얼굴 내부 표정 선화 (눈·눈썹·코·미소)
  strokePolyline(rgba, width, height, [pt(84, 110), pt(98, 108)], strokeR * 0.72);
  strokePolyline(rgba, width, height, [pt(126, 108), pt(140, 110)], strokeR * 0.72);
  strokePolyline(rgba, width, height, sampleEllipseArc(92 * s, 120 * s, 7 * s, 5 * s, 0, Math.PI * 2, 18), strokeR * 0.75);
  strokePolyline(rgba, width, height, sampleEllipseArc(132 * s, 120 * s, 7 * s, 5 * s, 0, Math.PI * 2, 18), strokeR * 0.75);
  strokePolyline(rgba, width, height, [pt(112, 128), pt(110, 136)], strokeR * 0.65);
  strokePolyline(rgba, width, height, [pt(102, 146), pt(112, 150), pt(122, 146)], strokeR * 0.75);

  // 3. 의상 실루엣 (칼라·어깨·재킷 하단 — 중앙 채널 높이를 충분히 확보해 16px에서도 좌우 단일 영역 유지)
  const outfitLoop: Point2D[] = [
    pt(94, 164),
    pt(92, 174),
    pt(48, 182),
    pt(40, 214),
    pt(184, 214),
    pt(176, 182),
    pt(132, 174),
    pt(130, 164),
  ];
  const collarV: Point2D[] = [pt(92, 174), pt(112, 184), pt(132, 174)];
  strokePolyline(rgba, width, height, outfitLoop, strokeR);
  strokePolyline(rgba, width, height, collarV, strokeR * 0.9);

  // 4. 프리셋별 의도적 선화 틈새 개방 (세 영역 모두 외곽 배경과 직접 맞닿는 경계에 독립 배치)
  const hairGapPx = presetId === "wide-gap-sketch" ? 6 : 4;
  const outfitGapPx = presetId === "wide-gap-sketch" ? 10 : 6;
  const skinGapPx = presetId === "wide-gap-sketch" ? 12 : 8;

  const hairGapPt = { x: Math.round(112 * s), y: Math.round(26 * s) };
  const skinGapPt = { x: Math.round(68 * s), y: Math.round(138 * s) };
  const outfitGapPt = { x: Math.round(142 * s), y: Math.round(214 * s) };

  eraseHorizontalGap(rgba, width, height, hairGapPt.x, hairGapPt.y, hairGapPx, Math.max(4, Math.round(5 * s)));
  eraseVerticalGap(rgba, width, height, skinGapPt.x, skinGapPt.y, skinGapPx, Math.max(4, Math.round(5 * s)));
  eraseHorizontalGap(rgba, width, height, outfitGapPt.x, outfitGapPt.y, outfitGapPx, Math.max(4, Math.round(5 * s)));

  const seeds: readonly AutoFlattingSeed[] = Object.freeze([
    Object.freeze({
      id: 1,
      label: "hair",
      x: Math.round(112 * s),
      y: Math.round(54 * s),
      color: DEMO_FLATTING_PALETTE.hair,
    }),
    Object.freeze({
      id: 2,
      label: "skin",
      x: Math.round(112 * s),
      y: Math.round(116 * s),
      color: DEMO_FLATTING_PALETTE.skin,
    }),
    Object.freeze({
      id: 3,
      label: "outfit",
      x: Math.round(80 * s),
      y: Math.round(198 * s),
      color: DEMO_FLATTING_PALETTE.outfit,
    }),
  ]);

  const gapMarkers: readonly DemoGapMarker[] = Object.freeze([
    Object.freeze({
      id: "gap-hair",
      regionKey: "hair",
      x: hairGapPt.x,
      y: hairGapPt.y,
      gapWidthPx: hairGapPx,
    }),
    Object.freeze({
      id: "gap-skin",
      regionKey: "skin",
      x: skinGapPt.x,
      y: skinGapPt.y,
      gapWidthPx: skinGapPx,
    }),
    Object.freeze({
      id: "gap-outfit",
      regionKey: "outfit",
      x: outfitGapPt.x,
      y: outfitGapPt.y,
      gapWidthPx: outfitGapPx,
    }),
  ]);

  return {
    presetId,
    width,
    height,
    lineartRgba: rgba,
    seeds,
    gapMarkers,
  };
}

/**
 * 512×512 / 1024×1024 처리량 벤치마크용 3영역(8px 틈새 포함) 선화 버퍼를 고속 생성한다.
 */
export function createBenchmarkLineartScene(sizePx: number): {
  readonly width: number;
  readonly height: number;
  readonly lineartRgba: Uint8ClampedArray;
  readonly seeds: readonly AutoFlattingSeed[];
} {
  const width = Math.max(32, Math.floor(sizePx));
  const height = width;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const [ir, ig, ib] = DEMO_FLATTING_PALETTE.ink;

  const drawBoxWithGap = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    gapWidthPx: number,
  ): void => {
    const gapMidY = Math.floor((y0 + y1) / 2);
    const gapStart = gapMidY - Math.floor(gapWidthPx / 2);
    const gapEnd = gapStart + gapWidthPx - 1;

    for (let x = x0; x <= x1; x += 1) {
      for (const y of [y0, y0 + 1, y1 - 1, y1]) {
        if (y < 0 || y >= height || x < 0 || x >= width) continue;
        const off = (y * width + x) * 4;
        rgba[off] = ir;
        rgba[off + 1] = ig;
        rgba[off + 2] = ib;
        rgba[off + 3] = 255;
      }
    }
    for (let y = y0; y <= y1; y += 1) {
      for (const x of [x0, x0 + 1]) {
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const off = (y * width + x) * 4;
        rgba[off] = ir;
        rgba[off + 1] = ig;
        rgba[off + 2] = ib;
        rgba[off + 3] = 255;
      }
      if (y >= gapStart && y <= gapEnd) continue;
      for (const x of [x1 - 1, x1]) {
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const off = (y * width + x) * 4;
        rgba[off] = ir;
        rgba[off + 1] = ig;
        rgba[off + 2] = ib;
        rgba[off + 3] = 255;
      }
    }
  };

  const margin = Math.max(12, Math.floor(width * 0.08));
  const gutterHalf = Math.max(12, Math.floor(width * 0.035));
  const midX = Math.floor(width * 0.5);
  const midY = Math.floor(height * 0.5);

  drawBoxWithGap(margin, margin, midX - gutterHalf, midY - gutterHalf, 8);
  drawBoxWithGap(midX + gutterHalf, margin, width - margin, midY - gutterHalf, 8);
  drawBoxWithGap(margin, midY + gutterHalf, width - margin, height - margin, 8);

  const seeds: readonly AutoFlattingSeed[] = Object.freeze([
    Object.freeze({
      id: 1,
      label: "hair",
      x: Math.floor((margin + midX - gutterHalf) / 2),
      y: Math.floor((margin + midY - gutterHalf) / 2),
      color: DEMO_FLATTING_PALETTE.hair,
    }),
    Object.freeze({
      id: 2,
      label: "skin",
      x: Math.floor((midX + gutterHalf + width - margin) / 2),
      y: Math.floor((margin + midY - gutterHalf) / 2),
      color: DEMO_FLATTING_PALETTE.skin,
    }),
    Object.freeze({
      id: 3,
      label: "outfit",
      x: midX,
      y: Math.floor((midY + gutterHalf + height - margin) / 2),
      color: DEMO_FLATTING_PALETTE.outfit,
    }),
  ]);

  return { width, height, lineartRgba: rgba, seeds };
}

/**
 * 종이 배경 위에 플랫팅 채색 레이어 + 선택적 틈새 브리지 하이라이트 + 원본 선화를 합성한다.
 */
export function compositeFlattingPreview(params: {
  readonly width: number;
  readonly height: number;
  readonly flattingRgba: Uint8ClampedArray;
  readonly lineartRgba: Uint8ClampedArray;
  readonly originalInkBarrier?: Uint8Array;
  readonly closedBarrier?: Uint8Array;
  readonly showGapBridges?: boolean;
}): Uint8ClampedArray {
  const {
    width,
    height,
    flattingRgba,
    lineartRgba,
    originalInkBarrier,
    closedBarrier,
    showGapBridges = false,
  } = params;
  const total = Math.max(0, width * height);
  const out = new Uint8ClampedArray(total * 4);
  const [pr, pg, pb] = DEMO_FLATTING_PALETTE.paper;
  const [br, bg, bb] = DEMO_FLATTING_PALETTE.bridgeHighlight;

  for (let i = 0; i < total; i += 1) {
    const off = i * 4;
    let r: number = pr;
    let g: number = pg;
    let b: number = pb;

    const fa = (flattingRgba[off + 3] ?? 0) / 255;
    if (fa > 0) {
      r = Math.round(r * (1 - fa) + (flattingRgba[off] ?? 0) * fa);
      g = Math.round(g * (1 - fa) + (flattingRgba[off + 1] ?? 0) * fa);
      b = Math.round(b * (1 - fa) + (flattingRgba[off + 2] ?? 0) * fa);
    }

    if (
      showGapBridges &&
      closedBarrier &&
      originalInkBarrier &&
      closedBarrier[i] === 1 &&
      originalInkBarrier[i] === 0
    ) {
      r = Math.round(r * 0.25 + br * 0.75);
      g = Math.round(g * 0.25 + bg * 0.75);
      b = Math.round(b * 0.25 + bb * 0.75);
    }

    const la = (lineartRgba[off + 3] ?? 0) / 255;
    if (la > 0) {
      r = Math.round(r * (1 - la) + (lineartRgba[off] ?? 0) * la);
      g = Math.round(g * (1 - la) + (lineartRgba[off + 1] ?? 0) * la);
      b = Math.round(b * (1 - la) + (lineartRgba[off + 2] ?? 0) * la);
    }

    out[off] = r;
    out[off + 1] = g;
    out[off + 2] = b;
    out[off + 3] = 255;
  }

  return out;
}
