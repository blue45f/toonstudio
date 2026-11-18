/**
 * 한국형 세로 스크롤 웹툰 4컷 콘티 스트립(등장 로우앵글 · 대화 반측면 · 감정 클로즈업 · 여운 하이앵글)
 * 원고 여백·먹선 테두리·말풍선 상단 안전 여백 및 선택적 말풍선·효과선(집중선/속도선/반짝이) 래스터 베이킹 합성 모듈.
 */
import { DEFAULT_FRAMING, failVisible, isLabFailure } from "../contracts";

import { MAX_PNG_EXPORT_DIMENSION, MAX_SETTLE_STEPS, MIN_EXPORT_DIMENSION, exportFileName } from "./export-session";
import { PNG_MIME, encodePng } from "./png-encoder";

import type { ExportDeps, ExportOutcome } from "./export-session";
import type { CameraFramingMode, CapturedRaster, CharacterEngine, LabFailure } from "../contracts";

export interface WebtoonStripCutSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly mode: Exclude<CameraFramingMode, "custom">;
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly distanceScale: number;
}

export const WEBTOON_VERTICAL_STRIP_CUTS: readonly WebtoonStripCutSpec[] = Object.freeze([
  { id: "intro-low", labelKo: "1컷 · 등장 전신 로우앵글", mode: "full-body", yawDeg: 0, pitchDeg: -14, distanceScale: 1 },
  { id: "dialogue-side", labelKo: "2컷 · 대화 상반신 반측면", mode: "bust", yawDeg: 28, pitchDeg: 0, distanceScale: 1 },
  { id: "emotion-face", labelKo: "3컷 · 감정 클로즈업 정면", mode: "face", yawDeg: -10, pitchDeg: 0, distanceScale: 1 },
  { id: "linger-high", labelKo: "4컷 · 여운 상반신 하이앵글", mode: "bust", yawDeg: -26, pitchDeg: 18, distanceScale: 1 },
]);

export type WebtoonStripFxLinesKind = "none" | "focus-radial" | "speed-diagonal" | "romance-sparkle";

export interface WebtoonStripMangaFxOptions {
  readonly enabled: boolean;
  readonly linesKind?: WebtoonStripFxLinesKind;
  readonly includeSpeechBubbles?: boolean;
  readonly intensity?: number;
}

export interface WebtoonStripLayout {
  readonly stripWidth: number;
  readonly stripHeight: number;
  readonly cutWidth: number;
  readonly cutHeight: number;
  readonly marginX: number;
  readonly marginY: number;
  readonly gutterY: number;
  readonly borderPx: number;
  readonly bubbleSafeTopPx: number;
}

export interface ExportWebtoonVerticalStripOptions {
  /** 요청 원고 가로 폭(px, 기본 800px · 최대 1024px) */
  readonly stripWidth: number;
  /** 각 컷 상단에 말풍선 배치용 안전 여백을 확보할지 여부(기본 true) */
  readonly includeBubbleSafeZone?: boolean;
  /** 말풍선 풍선 프레임과 집중선·속도선·반짝이를 PNG 래스터에 직접 베이킹할지 여부(선택) */
  readonly mangaFx?: WebtoonStripMangaFxOptions;
  readonly settleSteps?: number;
  readonly onProgress?: (stepIndex: number, totalSteps: number, labelKo: string) => void;
}

const defaultNow = (): number => Date.now();
const MAX_STRIP_WIDTH = 1024;

function toFailure(code: string, reasonKo: string, error: unknown, now: number): LabFailure {
  return isLabFailure(error) ? error : failVisible(code, reasonKo, error, now);
}

function deterministicHash01(index: number, seed: number): number {
  const raw = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

/**
 * 요청 가로 폭으로부터 총 세로 길이가 MAX_PNG_EXPORT_DIMENSION(4096px) 이하에 수렴하는
 * 4컷 세로 웹툰 원고 레이아웃(외곽 여백·먹선 테두리·말풍선 상단 여백·스크롤 호흡 간격)을 계산한다.
 */
export function clampWebtoonStripLayout(requestedWidth: number, includeBubbleSafeZone = true): WebtoonStripLayout {
  const cutCount = WEBTOON_VERTICAL_STRIP_CUTS.length;
  const safeStripW = Number.isFinite(requestedWidth)
    ? Math.min(MAX_STRIP_WIDTH, Math.max(MIN_EXPORT_DIMENSION + 8, Math.floor(requestedWidth)))
    : 800;

  const borderPx = Math.max(1, Math.round(safeStripW * 0.00375));
  const maxMarginX = Math.max(1, Math.floor((safeStripW - MIN_EXPORT_DIMENSION - borderPx * 2) / 2));
  const marginX = Math.min(maxMarginX, Math.max(2, Math.round(safeStripW * 0.046)));
  const cutWidth = Math.max(MIN_EXPORT_DIMENSION, safeStripW - (marginX + borderPx) * 2);

  const marginY = Math.max(2, Math.round(safeStripW * 0.038));
  const gutterY = Math.max(4, Math.round(safeStripW * 0.065));
  const bubbleSafeTopPx = includeBubbleSafeZone ? Math.max(4, Math.round(safeStripW * 0.052)) : 0;

  const fixedVerticalOverhead = marginY * 2 + gutterY * (cutCount - 1) + cutCount * (borderPx * 2 + bubbleSafeTopPx);
  const maxCutHeight = Math.floor((MAX_PNG_EXPORT_DIMENSION - fixedVerticalOverhead) / cutCount);
  const idealCutHeight = Math.round(cutWidth * 1.12);
  const cutHeight = Math.max(MIN_EXPORT_DIMENSION, Math.min(maxCutHeight, idealCutHeight));
  const stripHeight = fixedVerticalOverhead + cutCount * cutHeight;

  return {
    stripWidth: safeStripW,
    stripHeight,
    cutWidth,
    cutHeight,
    marginX,
    marginY,
    gutterY,
    borderPx,
    bubbleSafeTopPx,
  };
}

function blendPixelRgba(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  x: number,
  y: number,
  clipX0: number,
  clipY0: number,
  clipX1: number,
  clipY1: number,
  r: number,
  g: number,
  b: number,
  alpha01: number,
): void {
  if (x < clipX0 || x >= clipX1 || y < clipY0 || y >= clipY1 || alpha01 <= 0) return;
  const a = alpha01 >= 1 ? 1 : alpha01;
  const dst = (y * canvasWidth + x) * 4;
  const inv = 1 - a;
  rgba[dst] = Math.round(r * a + (rgba[dst] ?? 255) * inv);
  rgba[dst + 1] = Math.round(g * a + (rgba[dst + 1] ?? 255) * inv);
  rgba[dst + 2] = Math.round(b * a + (rgba[dst + 2] ?? 255) * inv);
  rgba[dst + 3] = 255;
}

function drawClippedLineRgba(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  clipX0: number,
  clipY0: number,
  clipX1: number,
  clipY1: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radiusPx: number,
  r: number,
  g: number,
  b: number,
  opacity01: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  const steps = Math.ceil(len * 1.5);
  const pad = Math.ceil(radiusPx + 1);
  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const cx = x0 + dx * t;
    const cy = y0 + dy * t;
    const ix0 = Math.max(clipX0, Math.floor(cx - pad));
    const ix1 = Math.min(clipX1 - 1, Math.ceil(cx + pad));
    const iy0 = Math.max(clipY0, Math.floor(cy - pad));
    const iy1 = Math.min(clipY1 - 1, Math.ceil(cy + pad));
    for (let py = iy0; py <= iy1; py += 1) {
      for (let px = ix0; px <= ix1; px += 1) {
        const dist = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
        if (dist <= radiusPx + 0.75) {
          const cov = dist <= radiusPx - 0.35 ? 1 : Math.max(0, 1 - (dist - (radiusPx - 0.35)) / 1.1);
          blendPixelRgba(rgba, canvasWidth, px, py, clipX0, clipY0, clipX1, clipY1, r, g, b, cov * opacity01);
        }
      }
    }
  }
}

function bakePanelActionLines(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  innerX: number,
  innerY: number,
  innerWidth: number,
  innerHeight: number,
  kind: WebtoonStripFxLinesKind,
  intensity: number,
  cutIndex: number,
): void {
  if (kind === "none") return;
  const clipX1 = innerX + innerWidth;
  const clipY1 = innerY + innerHeight;
  const cx = innerX + innerWidth * 0.5;
  const cy = innerY + innerHeight * 0.46;
  const strokeScale = Math.max(0.55, innerWidth / 720);

  if (kind === "focus-radial") {
    const lineCount = Math.round(32 + intensity * 36);
    const minDim = Math.min(innerWidth, innerHeight);
    for (let i = 0; i < lineCount; i += 1) {
      const ang = (i / lineCount) * Math.PI * 2 + (deterministicHash01(i, cutIndex + 1.3) - 0.5) * 0.06;
      const rIn = minDim * (0.31 + deterministicHash01(i, cutIndex + 4.1) * 0.11);
      const rOut = Math.hypot(innerWidth, innerHeight) * 0.65;
      drawClippedLineRgba(
        rgba,
        canvasWidth,
        innerX,
        innerY,
        clipX1,
        clipY1,
        cx + Math.cos(ang) * rIn,
        cy + Math.sin(ang) * rIn,
        cx + Math.cos(ang) * rOut,
        cy + Math.sin(ang) * rOut,
        (0.65 + deterministicHash01(i, 7.7) * 0.95) * strokeScale,
        24,
        21,
        28,
        0.55 * intensity,
      );
    }
  } else if (kind === "speed-diagonal") {
    const lineCount = Math.round(22 + intensity * 26);
    const dirX = 0.88;
    const dirY = -0.475;
    const perpX = -dirY;
    const perpY = dirX;
    for (let i = 0; i < lineCount; i += 1) {
      const lane = ((i / Math.max(1, lineCount - 1)) - 0.5) * (innerWidth + innerHeight) * 0.62;
      const side = i % 2 === 0 ? -1 : 1;
      const startOff = side < 0 ? -innerWidth * 0.72 : innerWidth * (0.20 + deterministicHash01(i, 2.9) * 0.16);
      const segLen = innerWidth * (0.28 + deterministicHash01(i, 6.1) * 0.28);
      const bx = cx + perpX * lane;
      const by = cy + perpY * lane;
      drawClippedLineRgba(
        rgba,
        canvasWidth,
        innerX,
        innerY,
        clipX1,
        clipY1,
        bx + dirX * startOff,
        by + dirY * startOff,
        bx + dirX * (startOff + segLen),
        by + dirY * (startOff + segLen),
        (0.6 + deterministicHash01(i, 9.2) * 0.85) * strokeScale,
        24,
        21,
        28,
        0.52 * intensity,
      );
    }
  } else if (kind === "romance-sparkle") {
    const spots = [
      [0.16, 0.22, 0.036],
      [0.84, 0.20, 0.042],
      [0.14, 0.62, 0.030],
      [0.86, 0.58, 0.034],
    ] as const;
    for (const [ux, uy, ur] of spots) {
      const sx = innerX + innerWidth * ux;
      const sy = innerY + innerHeight * uy;
      const arm = Math.max(3, innerWidth * ur * (0.75 + intensity * 0.35));
      drawClippedLineRgba(rgba, canvasWidth, innerX, innerY, clipX1, clipY1, sx - arm, sy, sx + arm, sy, 0.9 * strokeScale, 240, 201, 120, 0.88);
      drawClippedLineRgba(rgba, canvasWidth, innerX, innerY, clipX1, clipY1, sx, sy - arm, sx, sy + arm, 0.9 * strokeScale, 240, 201, 120, 0.88);
    }
  }
}

function bakeSpeechBubbleBalloon(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  innerX: number,
  innerY: number,
  innerWidth: number,
  innerHeight: number,
  placeRight: boolean,
): void {
  const clipX1 = innerX + innerWidth;
  const clipY1 = innerY + innerHeight;
  const rx = Math.max(8, Math.round(innerWidth * 0.19));
  const ry = Math.max(5, Math.round(innerHeight * 0.085));
  const cx = placeRight ? innerX + Math.round(innerWidth * 0.74) : innerX + Math.round(innerWidth * 0.26);
  const cy = innerY + Math.round(ry * 1.32);
  const border = Math.max(1, Math.round(innerWidth * 0.0042));

  const x0 = Math.max(innerX, cx - rx - border - 1);
  const x1 = Math.min(clipX1 - 1, cx + rx + border + 1);
  const y0 = Math.max(innerY, cy - ry - border - 1);
  const y1 = Math.min(clipY1 - 1, cy + ry + border + 1);

  for (let py = y0; py <= y1; py += 1) {
    for (let px = x0; px <= x1; px += 1) {
      const ndOuter = Math.hypot((px - cx) / (rx + border), (py - cy) / (ry + border));
      if (ndOuter > 1.0) continue;
      const ndInner = Math.hypot((px - cx) / rx, (py - cy) / ry);
      if (ndInner <= 1.0) {
        blendPixelRgba(rgba, canvasWidth, px, py, innerX, innerY, clipX1, clipY1, 255, 254, 251, 0.97);
      } else {
        blendPixelRgba(rgba, canvasWidth, px, py, innerX, innerY, clipX1, clipY1, 24, 21, 28, 0.95);
      }
    }
  }

  // 말풍선 꼬리(캐릭터 얼굴 방향 지향)
  const dir = placeRight ? -1 : 1;
  const tailTipX = cx + dir * Math.round(rx * 0.72);
  const tailTipY = cy + Math.round(ry * 1.48);
  drawClippedLineRgba(
    rgba,
    canvasWidth,
    innerX,
    innerY,
    clipX1,
    clipY1,
    cx + dir * Math.round(rx * 0.34),
    cy + Math.round(ry * 0.88),
    tailTipX,
    tailTipY,
    Math.max(1, border * 0.9),
    24,
    21,
    28,
    0.95,
  );
}

function fillRectRgba(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  const xEnd = x0 + w;
  const yEnd = y0 + h;
  for (let y = y0; y < yEnd; y += 1) {
    let offset = (y * canvasWidth + x0) * 4;
    for (let x = x0; x < xEnd; x += 1) {
      rgba[offset] = r;
      rgba[offset + 1] = g;
      rgba[offset + 2] = b;
      rgba[offset + 3] = a;
      offset += 4;
    }
  }
}

/**
 * 캡처된 4컷 투명 캐릭터 래스터를 백색 웹툰 원고지·먹선 패널 프레임·은은한 아틀리에 배경 톤 위에 알파 합성하고,
 * 요청 시 말풍선 프레임 및 효과선(집중선/속도선/반짝이)을 함께 래스터 베이킹한다.
 */
export function composeWebtoonVerticalStrip(
  panels: readonly CapturedRaster[],
  layout: WebtoonStripLayout,
  mangaFx?: WebtoonStripMangaFxOptions,
): CapturedRaster {
  if (panels.length !== WEBTOON_VERTICAL_STRIP_CUTS.length) {
    throw new Error(`웹툰 4컷 스트립 합성에는 ${WEBTOON_VERTICAL_STRIP_CUTS.length}개의 컷이 필요합니다(전달됨: ${panels.length}).`);
  }
  const out = new Uint8ClampedArray(layout.stripWidth * layout.stripHeight * 4);
  out.fill(255);

  const frameWidth = layout.cutWidth + layout.borderPx * 2;
  const frameHeight = layout.bubbleSafeTopPx + layout.cutHeight + layout.borderPx * 2;
  const fxEnabled = mangaFx?.enabled === true;
  const fxLinesKind: WebtoonStripFxLinesKind = fxEnabled ? (mangaFx?.linesKind ?? "focus-radial") : "none";
  const fxIncludeBubbles = fxEnabled && mangaFx?.includeSpeechBubbles !== false;
  const fxIntensity = Math.min(1, Math.max(0.2, Number.isFinite(mangaFx?.intensity) ? (mangaFx?.intensity ?? 0.75) : 0.75));

  for (let idx = 0; idx < panels.length; idx += 1) {
    const panel = panels[idx];
    if (!panel) continue;
    if (panel.width !== layout.cutWidth || panel.height !== layout.cutHeight) {
      throw new Error(
        `${idx + 1}번째 컷 크기(${panel.width}×${panel.height})가 레이아웃 컷 크기(${layout.cutWidth}×${layout.cutHeight})와 다릅니다.`,
      );
    }

    const frameX = layout.marginX;
    const frameY = layout.marginY + idx * (frameHeight + layout.gutterY);

    // 1. 먹선 외곽 테두리 (#18151C)
    fillRectRgba(out, layout.stripWidth, frameX, frameY, frameWidth, frameHeight, 24, 21, 28, 255);

    const innerX = frameX + layout.borderPx;
    const innerY = frameY + layout.borderPx;
    const innerHeight = layout.bubbleSafeTopPx + layout.cutHeight;

    // 2. 패널 내부 웜 아틀리에 지면 그라디언트 (#FAF7F2 -> #EFEAE0)
    for (let py = 0; py < innerHeight; py += 1) {
      const t = innerHeight > 1 ? py / (innerHeight - 1) : 0;
      const bgR = Math.round(250 - 11 * t);
      const bgG = Math.round(247 - 13 * t);
      const bgB = Math.round(242 - 18 * t);
      let dst = ((innerY + py) * layout.stripWidth + innerX) * 4;
      for (let px = 0; px < layout.cutWidth; px += 1) {
        out[dst] = bgR;
        out[dst + 1] = bgG;
        out[dst + 2] = bgB;
        out[dst + 3] = 255;
        dst += 4;
      }
    }

    // 2-b. 선택적 배경 효과선 베이킹(캐릭터 뒤쪽에 깔려 얼굴·눈 가독성을 해치지 않음)
    if (fxLinesKind !== "none") {
      bakePanelActionLines(out, layout.stripWidth, innerX, innerY, layout.cutWidth, innerHeight, fxLinesKind, fxIntensity, idx);
    }

    // 3. 캐릭터 투명 래스터 알파 블렌딩 (말풍선 안전 여백 아래에 배치)
    const cutStartY = innerY + layout.bubbleSafeTopPx;
    for (let cy = 0; cy < layout.cutHeight; cy += 1) {
      let src = cy * layout.cutWidth * 4;
      let dst = ((cutStartY + cy) * layout.stripWidth + innerX) * 4;
      for (let cx = 0; cx < layout.cutWidth; cx += 1) {
        const srcA = panel.rgba[src + 3] ?? 0;
        if (srcA === 255) {
          out[dst] = panel.rgba[src] ?? 0;
          out[dst + 1] = panel.rgba[src + 1] ?? 0;
          out[dst + 2] = panel.rgba[src + 2] ?? 0;
        } else if (srcA > 0) {
          const alpha = srcA / 255;
          const inv = 1 - alpha;
          out[dst] = Math.round((panel.rgba[src] ?? 0) * alpha + (out[dst] ?? 255) * inv);
          out[dst + 1] = Math.round((panel.rgba[src + 1] ?? 0) * alpha + (out[dst + 1] ?? 255) * inv);
          out[dst + 2] = Math.round((panel.rgba[src + 2] ?? 0) * alpha + (out[dst + 2] ?? 255) * inv);
        }
        out[dst + 3] = 255;
        src += 4;
        dst += 4;
      }
    }

    // 4. 선택적 말풍선 안전 프레임 베이킹(좌상단 ↔ 우상단 교차 배치로 스크롤 리듬 형성)
    if (fxIncludeBubbles) {
      bakeSpeechBubbleBalloon(out, layout.stripWidth, innerX, innerY, layout.cutWidth, innerHeight, idx % 2 === 1);
    }
  }

  return { width: layout.stripWidth, height: layout.stripHeight, rgba: out };
}

/**
 * 4개의 한국 웹툰 연출 앵글(등장 로우앵글·대화 반측면·감정 클로즈업·여운 하이앵글)을 순차 캡처하여
 * 스크롤 호흡 여백과 먹선 컷 테두리를 갖춘 세로 웹툰 콘티 스트립 PNG로 내보낸다.
 */
export async function exportWebtoonVerticalStripPng(
  engine: CharacterEngine,
  options: ExportWebtoonVerticalStripOptions,
  deps: ExportDeps = {},
): Promise<ExportOutcome> {
  const now = deps.now ?? defaultNow;
  const started = now();
  const layout = clampWebtoonStripLayout(options.stripWidth, options.includeBubbleSafeZone ?? true);

  if (layout.stripHeight > MAX_PNG_EXPORT_DIMENSION || layout.stripWidth > MAX_PNG_EXPORT_DIMENSION) {
    return {
      ok: false,
      failure: failVisible(
        "export-webtoon-strip-size",
        `세로 4컷 웹툰 스트립 크기(${layout.stripWidth}×${layout.stripHeight}px)가 최대 허용 해상도(${MAX_PNG_EXPORT_DIMENSION}px)를 초과합니다.`,
        undefined,
        started,
      ),
    };
  }

  const settleSteps = Math.min(MAX_SETTLE_STEPS, Math.max(0, Math.floor(options.settleSteps ?? 0)));
  if (settleSteps > 0) {
    try {
      await engine.settle(settleSteps);
    } catch (error) {
      return { ok: false, failure: toFailure("export-settle", "웹툰 콘티 스트립 캡처 전 물리 settle에 실패했습니다.", error, started) };
    }
  }

  const panels: CapturedRaster[] = [];
  let lastProvenance = undefined;

  for (let idx = 0; idx < WEBTOON_VERTICAL_STRIP_CUTS.length; idx += 1) {
    const cut = WEBTOON_VERTICAL_STRIP_CUTS[idx];
    if (!cut) continue;
    options.onProgress?.(idx + 1, WEBTOON_VERTICAL_STRIP_CUTS.length, cut.labelKo);
    try {
      const captured = await engine.renderPasses({
        width: layout.cutWidth,
        height: layout.cutHeight,
        passes: ["lit"],
        transparentBackground: true,
        settleSteps: 0,
        camera: {
          ...DEFAULT_FRAMING,
          mode: cut.mode,
          yawDeg: cut.yawDeg,
          pitchDeg: cut.pitchDeg,
          distanceScale: cut.distanceScale,
        },
      });
      if (captured.width !== layout.cutWidth || captured.height !== layout.cutHeight) {
        return {
          ok: false,
          failure: failVisible(
            "export-capture-size",
            `엔진이 컷 크기 ${layout.cutWidth}×${layout.cutHeight} 대신 ${captured.width}×${captured.height}를 반환했습니다.`,
            undefined,
            started,
          ),
        };
      }
      const lit = captured.passes.lit;
      if (!lit) {
        return { ok: false, failure: failVisible("export-missing-lit", `${cut.labelKo} 캡처에 lit 패스가 없습니다.`, undefined, started) };
      }
      panels.push(lit);
      lastProvenance = captured.provenance;
    } catch (error) {
      return { ok: false, failure: toFailure("export-capture", `웹툰 4컷 스트립(${cut.labelKo}) 캡처에 실패했습니다.`, error, started) };
    }
  }

  if (!lastProvenance) {
    return { ok: false, failure: failVisible("export-missing-lit", "웹툰 4컷 스트립 캡처 결과가 비어 있습니다.", undefined, started) };
  }

  try {
    const composed = composeWebtoonVerticalStrip(panels, layout, options.mangaFx);
    const bytes = await encodePng(composed, { filter: "adaptive" });
    const baseName = exportFileName("png", lastProvenance.recipeDigest, composed.width, composed.height);
    const suffix = options.mangaFx?.enabled ? "-webtoon-4cut-fx-strip.png" : "-webtoon-4cut-strip.png";
    const fileName = baseName.replace(/\.png$/u, suffix);
    return {
      ok: true,
      bytes,
      receipt: {
        kind: "png",
        fileName,
        mime: PNG_MIME,
        bytes: bytes.length,
        width: composed.width,
        height: composed.height,
        settleSteps,
        provenance: lastProvenance,
        durationMs: now() - started,
      },
    };
  } catch (error) {
    return { ok: false, failure: toFailure("export-png-encode", "웹툰 4컷 스트립 PNG 인코딩에 실패했습니다.", error, started) };
  }
}
