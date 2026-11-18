/**
 * 브라우저 오프스크린 `<canvas>` Data-URL 픽셀 실행기 및 순수 RGBA 버퍼 러너.
 *
 * 인스펙터 필터·변형 섹션에서 `imageSrc`(PNG/WebP/JPEG data URL 또는 URL)를 디코드하여
 * 동기식 순수 RGBA 프로세서(`StudioRgbaProcessor`)를 실행하고 새 `image/png` Data-URL을 반환한다.
 *
 * Clean-room implementation based on Ghidra/REA behavioral specification:
 * - evidence_id: ev_15e228e28971596b30e7ed81ed1948b9b94a4f9f1077f50da55441fb336580be
 * - evidence_id: ev_af42bc7907f5e98eacfcb3b02c9c7f14cbf6c06dd0234d34033ff0059556946b
 */

import type { StudioImageDataLike } from "../studio-filters";

export type StudioRgbaProcessor = (
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
) => StudioImageDataLike;

/**
 * 호출자의 원본 버퍼를 보존한 채 동기식 순수 RGBA 프로세서를 실행하고 검증된 결과를 반환한다.
 */
export function runStudioRgbaProcessor(
  source: StudioImageDataLike,
  processor: StudioRgbaProcessor,
): StudioImageDataLike {
  const { width, height, data } = source;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    data.length < width * height * 4
  ) {
    throw new Error("유효하지 않은 RGBA 픽셀 버퍼 크기입니다.");
  }

  const inputCopy = new Uint8ClampedArray(data.subarray(0, width * height * 4));
  const result = processor(inputCopy, width, height);
  if (
    !Number.isSafeInteger(result.width) ||
    !Number.isSafeInteger(result.height) ||
    result.width <= 0 ||
    result.height <= 0 ||
    result.data.length < result.width * result.height * 4
  ) {
    throw new Error("프로세서가 잘못된 크기의 RGBA 버퍼를 반환했습니다.");
  }

  return {
    width: result.width,
    height: result.height,
    data: new Uint8ClampedArray(
      result.data.subarray(0, result.width * result.height * 4),
    ),
  };
}

/**
 * 먼지 선택 마스크(`255` = 검출된 먼지)를 마젠타 강조 오버레이 RGBA 버퍼로 합성한다.
 */
export function overlayDustSelectionMaskRgba(
  source: StudioImageDataLike,
  mask: Uint8Array,
): StudioImageDataLike {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(data);
  const total = Math.min(width * height, mask.length);
  for (let p = 0; p < total; p += 1) {
    if (mask[p] === 0) continue;
    const off = p * 4;
    out[off] = 236;
    out[off + 1] = 72;
    out[off + 2] = 153;
    out[off + 3] = 255;
  }
  return { width, height, data: out };
}

function decodeHtmlImage(imageSrc: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    img.src = imageSrc;
  });
}

/**
 * `imageSrc`를 오프스크린 `<canvas>`에 디코드해 `processor`를 실행한 뒤 `image/png` Data-URL로 인코딩한다.
 */
export async function runStudioRasterDataUrlProcessor(
  imageSrc: string,
  processor: StudioRgbaProcessor,
): Promise<string> {
  if (typeof imageSrc !== "string" || !imageSrc.trim()) {
    throw new Error("처리할 이미지 원본 주소가 비어 있습니다.");
  }
  if (typeof document === "undefined") {
    throw new Error("브라우저 캔버스 환경을 사용할 수 없습니다.");
  }

  const img = await decodeHtmlImage(imageSrc);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) {
    throw new Error("이미지 가로·세로 해상도를 읽을 수 없습니다.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D 캔버스 컨텍스트를 열 수 없습니다.");
  }

  ctx.drawImage(img, 0, 0, width, height);
  const srcImageData = ctx.getImageData(0, 0, width, height);
  const processed = runStudioRgbaProcessor(
    { width, height, data: srcImageData.data },
    processor,
  );

  if (processed.width !== width || processed.height !== height) {
    canvas.width = processed.width;
    canvas.height = processed.height;
  }
  const outImageData = ctx.createImageData(processed.width, processed.height);
  outImageData.data.set(processed.data);
  ctx.putImageData(outImageData, 0, 0);
  return canvas.toDataURL("image/png");
}
