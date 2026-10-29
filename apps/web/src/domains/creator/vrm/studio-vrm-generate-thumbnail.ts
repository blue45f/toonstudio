/**
 * 생성 VRM 썸네일 만들기(브라우저 전용).
 *
 * VRM 1.0 은 정사각형 썸네일을 권장 크기 1024px 로 요구한다. 두 경로가 있다.
 *  - 자동: 조형 패널의 캐릭터 미리보기 SVG 를 그대로 이미지로 읽어 정사각형 캔버스에 레터박스로 그린다.
 *    SVG 는 같은 문서에서 만든 blob URL 이라 캔버스가 오염되지 않는다(CSP 의 img-src 가 blob: 허용).
 *  - 사용자 이미지: 정사각형이 아니면 가운데를 잘라 정사각형으로 다시 인코딩한다.
 *
 * 캔버스·이미지 디코드를 쓸 수 없는 환경(테스트 DOM, 오래된 브라우저)에서는 `null` 을 돌려주고 호출자가
 * 썸네일 없이 내보낸다. 실패가 생성을 막지 않는다.
 */

import {
  inspectStudioVrmThumbnailBytes,
  STUDIO_VRM_THUMBNAIL_RECOMMENDED_SIZE,
  type StudioVrmThumbnailImage,
} from "./studio-vrm-generate-export-meta";

export type StudioVrmThumbnailFit = {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
  readonly dx: number;
  readonly dy: number;
  readonly dw: number;
  readonly dh: number;
};

/**
 * `width × height` 원본을 `size` 정사각형에 놓는 사각형. `contain` 은 전체를 여백과 함께 넣고,
 * `cover` 는 가운데를 잘라 꽉 채운다.
 */
export function studioVrmThumbnailFit(
  width: number,
  height: number,
  size: number,
  mode: "contain" | "cover",
): StudioVrmThumbnailFit {
  if (mode === "cover") {
    const side = Math.min(width, height);
    return { sx: (width - side) / 2, sy: (height - side) / 2, sw: side, sh: side, dx: 0, dy: 0, dw: size, dh: size };
  }
  const scale = size / Math.max(width, height);
  const dw = width * scale;
  const dh = height * scale;
  return { sx: 0, sy: 0, sw: width, sh: height, dx: (size - dw) / 2, dy: (size - dh) / 2, dw, dh };
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<StudioVrmThumbnailImage | null> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return null;
  const inspection = inspectStudioVrmThumbnailBytes(new Uint8Array(await blob.arrayBuffer()));
  return inspection.ok ? inspection.image : null;
}

function squareCanvas(size: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | null {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  return context ? { canvas, context } : null;
}

/** 캐릭터 미리보기 SVG 를 정사각형 PNG 썸네일로 굽는다. */
export async function rasterizeStudioVrmSvgThumbnail(
  svg: SVGSVGElement,
  options: { readonly size?: number; readonly background?: string } = {},
): Promise<StudioVrmThumbnailImage | null> {
  const size = options.size ?? STUDIO_VRM_THUMBNAIL_RECOMMENDED_SIZE;
  const viewBox = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/u).map(Number);
  const [, , width, height] = viewBox;
  if (viewBox.length !== 4 || !(width > 0) || !(height > 0)) return null;
  if (typeof XMLSerializer === "undefined" || typeof URL.createObjectURL !== "function") return null;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  // 화면 배치용 클래스는 독립 이미지에서 의미가 없다. 테마 색은 SVG 안의 var() 기본값으로 그려진다.
  clone.removeAttribute("class");
  const markup = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const target = squareCanvas(size);
    if (!target) return null;
    const image = new Image();
    image.src = url;
    await image.decode();
    target.context.fillStyle = options.background ?? "#f3ebe3";
    target.context.fillRect(0, 0, size, size);
    const fit = studioVrmThumbnailFit(width, height, size, "contain");
    target.context.drawImage(image, fit.dx, fit.dy, fit.dw, fit.dh);
    return await canvasToPng(target.canvas);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 사용자가 고른 이미지를 정사각형으로 맞춘다. 이미 정사각형이면 원본 바이트를 그대로 쓴다. */
export async function squareStudioVrmThumbnailImage(
  image: StudioVrmThumbnailImage,
): Promise<StudioVrmThumbnailImage | null> {
  if (image.width === image.height) return image;
  if (typeof createImageBitmap !== "function") return null;
  const size = Math.min(STUDIO_VRM_THUMBNAIL_RECOMMENDED_SIZE, image.width, image.height);
  try {
    const target = squareCanvas(size);
    if (!target) return null;
    const bitmap = await createImageBitmap(new Blob([image.bytes], { type: image.mimeType }));
    const fit = studioVrmThumbnailFit(bitmap.width, bitmap.height, size, "cover");
    target.context.drawImage(bitmap, fit.sx, fit.sy, fit.sw, fit.sh, fit.dx, fit.dy, fit.dw, fit.dh);
    bitmap.close();
    return await canvasToPng(target.canvas);
  } catch {
    return null;
  }
}
