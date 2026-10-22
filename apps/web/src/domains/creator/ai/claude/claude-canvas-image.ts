/**
 * 스튜디오 캔버스(현재 페이지)를 Claude 보조가 받는 이미지 파일로 만든다.
 *
 * 올린 파일과 같은 관문(`useArtDirectorImage.load`)을 지나가므로, 여기서는 그 관문이 받아 줄 크기만 맞춘다:
 * 픽셀 수 상한(`ART_DIRECTOR_MAX_PIXELS`) 안으로 줄이고, PNG가 파일 한도에 가깝게 크면 JPEG로 내린다.
 * 캔버스는 원본이 아니라 이 함수 전용 사본이므로 쓰고 나면 비운다(큰 캔버스가 메모리에 남지 않게).
 */
import { ART_DIRECTOR_MAX_FILE_BYTES, ART_DIRECTOR_MAX_PIXELS } from "./claude-art-director-image";

/** 파일 한도(12MB)에 바짝 붙지 않게 둔 목표 크기. */
const TARGET_BYTES = Math.floor(ART_DIRECTOR_MAX_FILE_BYTES * 0.85);

export interface CanvasImageDeps {
  createCanvas(): HTMLCanvasElement;
}

const BROWSER_DEPS: CanvasImageDeps = { createCanvas: () => document.createElement("canvas") };

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    } catch {
      resolve(null);
    }
  });
}

/** 같은 그림을 `width×height`로 줄이고(필요하면) 흰 바탕에 올린 사본. JPEG는 투명을 검게 만들기 때문이다. */
function redraw(source: HTMLCanvasElement, width: number, height: number, deps: CanvasImageDeps, flatten: boolean): HTMLCanvasElement | null {
  const copy = deps.createCanvas();
  copy.width = width;
  copy.height = height;
  const context = copy.getContext("2d");
  if (!context) return null;
  if (flatten) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(source, 0, 0, width, height);
  return copy;
}

function release(canvas: HTMLCanvasElement): void {
  canvas.width = 1;
  canvas.height = 1;
}

/**
 * 캔버스를 이미지 파일(PNG, 너무 크면 JPEG)로 만든다. 만들 수 없으면 던진다. 받은 캔버스는 비운다.
 * 픽셀 수가 상한을 넘으면 비율을 지켜 줄인다.
 */
export async function canvasToImageFile(
  canvas: HTMLCanvasElement,
  name = "canvas-page",
  deps: CanvasImageDeps = BROWSER_DEPS,
): Promise<File> {
  const owned: HTMLCanvasElement[] = [canvas];
  try {
    const { width, height } = canvas;
    if (!(width > 0 && height > 0)) throw new Error("empty-canvas");
    const pixels = width * height;
    let base = canvas;
    if (pixels > ART_DIRECTOR_MAX_PIXELS) {
      const ratio = Math.sqrt(ART_DIRECTOR_MAX_PIXELS / pixels);
      const scaled = redraw(canvas, Math.max(1, Math.floor(width * ratio)), Math.max(1, Math.floor(height * ratio)), deps, false);
      if (!scaled) throw new Error("scale-failed");
      owned.push(scaled);
      base = scaled;
    }

    const png = await toBlob(base, "image/png");
    if (png && png.size <= TARGET_BYTES) return new File([png], `${name}.png`, { type: "image/png" });

    // PNG가 크면 흰 바탕에 올린 사본을 JPEG로 낮춘다. 그래도 크면 한 번 더 낮추고, 그 결과는 관문이 한도로 판정한다.
    const flat = redraw(base, base.width, base.height, deps, true);
    if (!flat) throw new Error("flatten-failed");
    owned.push(flat);
    for (const quality of [0.9, 0.75]) {
      const jpeg = await toBlob(flat, "image/jpeg", quality);
      if (jpeg && (jpeg.size <= TARGET_BYTES || quality === 0.75)) return new File([jpeg], `${name}.jpg`, { type: "image/jpeg" });
    }
    if (png) return new File([png], `${name}.png`, { type: "image/png" });
    throw new Error("encode-failed");
  } finally {
    for (const item of owned) release(item);
  }
}
