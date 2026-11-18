/**
 * 한국형 세로 스크롤 웹툰 4컷 콘티 스트립(등장 로우앵글 · 대화 반측면 · 감정 클로즈업 · 여운 하이앵글)
 * 원고 여백·먹선 테두리·말풍선 상단 안전 여백을 갖춘 단일 세로 PNG 합성 내보내기.
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
  readonly settleSteps?: number;
  readonly onProgress?: (stepIndex: number, totalSteps: number, labelKo: string) => void;
}

const defaultNow = (): number => Date.now();
const MAX_STRIP_WIDTH = 1024;

function toFailure(code: string, reasonKo: string, error: unknown, now: number): LabFailure {
  return isLabFailure(error) ? error : failVisible(code, reasonKo, error, now);
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
 * 캡처된 4컷 투명 캐릭터 래스터를 백색 웹툰 원고지·먹선 패널 프레임·은은한 아틀리에 배경 톤 위에 알파 합성한다.
 */
export function composeWebtoonVerticalStrip(
  panels: readonly CapturedRaster[],
  layout: WebtoonStripLayout,
): CapturedRaster {
  if (panels.length !== WEBTOON_VERTICAL_STRIP_CUTS.length) {
    throw new Error(`웹툰 4컷 스트립 합성에는 ${WEBTOON_VERTICAL_STRIP_CUTS.length}개의 컷이 필요합니다(전달됨: ${panels.length}).`);
  }
  const out = new Uint8ClampedArray(layout.stripWidth * layout.stripHeight * 4);
  // 원고지 전체 바탕: 순백색(#FFFFFF) 불투명
  out.fill(255);

  const frameWidth = layout.cutWidth + layout.borderPx * 2;
  const frameHeight = layout.bubbleSafeTopPx + layout.cutHeight + layout.borderPx * 2;

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
    const composed = composeWebtoonVerticalStrip(panels, layout);
    const bytes = await encodePng(composed, { filter: "adaptive" });
    const baseName = exportFileName("png", lastProvenance.recipeDigest, composed.width, composed.height);
    const fileName = baseName.replace(/\.png$/u, "-webtoon-4cut-strip.png");
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
