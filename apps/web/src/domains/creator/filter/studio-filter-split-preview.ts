import {
  studioFilterDraftToPatch,
  type StudioFilterDraft,
} from "./studio-filter-menu";

export interface StudioFilterRgbaBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface StudioFilterRgbaResult extends StudioFilterRgbaBuffer {
  readonly filterCount: number;
}

/**
 * 이미지가 없거나 교차 출처로 픽셀 읽기가 제한될 때 사용하는 결정적 웹툰 스와치(RGBA).
 * 고대비 선화 격자 + 그라데이션 + 색면 블록을 포함해 블러·선화 추출·색보정 차이를 선명히 드러낸다.
 */
export function createStudioFilterPreviewSwatchRgba(
  width = 240,
  height = 152,
): StudioFilterRgbaBuffer {
  const safeW = Math.max(16, Math.min(320, Math.round(width)));
  const safeH = Math.max(16, Math.min(240, Math.round(height)));
  const data = new Uint8ClampedArray(safeW * safeH * 4);
  const cx = safeW * 0.5;
  const cy = safeH * 0.48;
  const radius = Math.min(safeW, safeH) * 0.28;

  for (let y = 0; y < safeH; y += 1) {
    const ty = y / Math.max(1, safeH - 1);
    for (let x = 0; x < safeW; x += 1) {
      const tx = x / Math.max(1, safeW - 1);
      const idx = (y * safeW + x) * 4;

      // 배경 하늘/석양 그라데이션
      let r = Math.round(238 - tx * 78 + ty * 18);
      let g = Math.round(226 - ty * 58 + tx * 24);
      let b = Math.round(244 - tx * 34 - ty * 26);

      // 중앙 캐릭터 실루엣 원 + 림 하이라이트 + 외곽 먹선
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < radius) {
        r = Math.round(245 - (dy / radius) * 32);
        g = Math.round(178 - (dx / radius) * 28);
        b = Math.round(142 + (tx - 0.5) * 40);
      }
      if (Math.abs(dist - radius) <= 1.8) {
        r = 26;
        g = 24;
        b = 34;
      }

      // 배경 원근 선화 스트로크
      const onGrid = x % 36 === 0 || y % 36 === 0;
      if (onGrid && dist > radius + 2) {
        r = Math.round(r * 0.62);
        g = Math.round(g * 0.64);
        b = Math.round(b * 0.72);
      }

      data[idx] = Math.max(0, Math.min(255, r));
      data[idx + 1] = Math.max(0, Math.min(255, g));
      data[idx + 2] = Math.max(0, Math.min(255, b));
      data[idx + 3] = 255;
    }
  }

  return { width: safeW, height: safeH, data };
}

let cachedKonvaLike: { Filters: Record<string, unknown> } | null = null;

/**
 * 실제 ToonStudio 픽셀 필터 파이프라인(`registerStudioKonvaFilters` + `buildImageFilters` +
 * `applyImageFilters`)을 지연 로드해 원본 RGBA 버퍼에 필터 커널을 직접 실행한다(CSS 근사 금지, 진입 그래프 +0B).
 */
export async function applyStudioFilterDraftToRgba(
  source: StudioFilterRgbaBuffer,
  draft: StudioFilterDraft,
): Promise<StudioFilterRgbaResult> {
  const copied = new Uint8ClampedArray(source.data);
  const patch = studioFilterDraftToPatch(draft);
  const { applyImageFilters, buildImageFilters, registerStudioKonvaFilters } = await import(
    "../render/studio-konva-filters"
  );
  if (!cachedKonvaLike) {
    const stub = { Filters: {} as Record<string, unknown> };
    registerStudioKonvaFilters(stub);
    cachedKonvaLike = stub;
  }
  const built = buildImageFilters(patch, cachedKonvaLike);
  const target = {
    width: source.width,
    height: source.height,
    data: copied,
  };
  if (built.filters.length > 0) {
    applyImageFilters(target, built.filters, built.attrs);
  }
  return {
    width: source.width,
    height: source.height,
    data: copied,
    filterCount: built.filters.length,
  };
}

function loadPreviewImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function paintRgbaToCanvas(
  canvas: HTMLCanvasElement,
  buffer: StudioFilterRgbaBuffer,
): boolean {
  canvas.width = buffer.width;
  canvas.height = buffer.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  if (typeof ImageData !== "undefined") {
    const clamped = new Uint8ClampedArray(buffer.data);
    const imgData = new ImageData(clamped, buffer.width, buffer.height);
    ctx.putImageData(imgData, 0, 0);
    return true;
  }
  const fallback = ctx.createImageData(buffer.width, buffer.height);
  fallback.data.set(buffer.data);
  ctx.putImageData(fallback, 0, 0);
  return true;
}

/**
 * Split-Wipe 좌(원본)·우(실제 필터 커널 출력) 캔버스에 픽셀 버퍼를 직접 렌더링한다.
 */
export async function renderStudioFilterSplitPreviewCanvases(
  beforeCanvas: HTMLCanvasElement,
  afterCanvas: HTMLCanvasElement,
  imageSrc: string | null | undefined,
  draft: StudioFilterDraft,
): Promise<{ readonly filterCount: number; readonly usedSourceImage: boolean }> {
  let sourceBuffer: StudioFilterRgbaBuffer | null = null;
  let usedSourceImage = false;

  if (imageSrc) {
    const loaded = await loadPreviewImage(imageSrc);
    if (loaded && loaded.naturalWidth > 0 && loaded.naturalHeight > 0) {
      const scale = Math.min(1, 280 / loaded.naturalWidth, 176 / loaded.naturalHeight);
      const w = Math.max(16, Math.round(loaded.naturalWidth * scale));
      const h = Math.max(16, Math.round(loaded.naturalHeight * scale));
      beforeCanvas.width = w;
      beforeCanvas.height = h;
      const ctx = beforeCanvas.getContext("2d");
      if (ctx) {
        try {
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(loaded, 0, 0, w, h);
          const pixels = ctx.getImageData(0, 0, w, h);
          sourceBuffer = {
            width: w,
            height: h,
            data: new Uint8ClampedArray(pixels.data),
          };
          usedSourceImage = true;
        } catch {
          sourceBuffer = null;
        }
      }
    }
  }

  if (!sourceBuffer) {
    sourceBuffer = createStudioFilterPreviewSwatchRgba(240, 152);
    paintRgbaToCanvas(beforeCanvas, sourceBuffer);
  }

  const filtered = await applyStudioFilterDraftToRgba(sourceBuffer, draft);
  paintRgbaToCanvas(afterCanvas, filtered);

  return {
    filterCount: filtered.filterCount,
    usedSourceImage,
  };
}
