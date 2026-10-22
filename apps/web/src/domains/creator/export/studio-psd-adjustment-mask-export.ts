/**
 * studio-psd-adjustment-mask-export.ts
 *
 * Studio 조정 레이어의 실물 마스크(`maskSrc` — 흰 RGB + 알파=가시성 PNG)를
 * ag-psd 네이티브 레이어 마스크(`Layer.mask`)로 되쓰는 역변환 모듈.
 * 가져오기 다리(`studio-psd-mask-import.ts`)의 정확한 반대 방향이다:
 *
 *  - 가져오기: ag-psd 그레이스케일 RGB 픽셀 → Studio 알파 (밀도 적용 포함).
 *  - 내보내기(이 모듈): Studio 알파 → ag-psd 그레이스케일 RGB (R=G=B=알파, A=255).
 *    ag-psd writer는 마스크 채널을 imageData의 R 채널에서 읽으므로 이 인코딩이면
 *    Photoshop·재가져오기 양쪽에서 같은 가시성으로 복원된다.
 *
 * 보존 경계(정직성 규약):
 *  - 문서에 남는 마스크 메타데이터는 `maskSrc`와 `maskEnabled`뿐이다. 원본 PSD의
 *    마스크 bounds·밀도(density)·페더·defaultColor·벡터/래스터 구분은 가져올 때
 *    이미 픽셀에 구워졌고(밀도는 값으로, 페더는 블러로, 영역 밖은 기본값으로 채움)
 *    문서 어디에도 따로 남지 않는다. 그래서 내보내기는 밀도·페더 파라미터를
 *    다시 쓰지 않는다 — 쓰면 이미 반영된 효과가 이중으로 적용된다.
 *  - 좌표계: Studio 합성(StudioAdjustmentElGroup)이 마스크를 페이지 전체
 *    버퍼에 투영해 적용하므로, 문서에서 마스크의 기준 틀은 페이지 전체다.
 *    내보내기도 페이지 전체 틀(left=0, top=0, 출력 픽셀 크기)로 기록한다 —
 *    가져오기 때 조정 레이어 bounds가 0이거나 비어 캔버스 크기로 대체된
 *    일반 케이스와 정확히 일치하고, 그 밖의 경우에도 Studio가 실제로 적용하는
 *    틀과 같은 의미다.
 *  - 비활성 마스크(`maskEnabled === false`)는 지우지 않고 `disabled: true`로
 *    기록한다 — Photoshop의 "마스크 비활성"과 같은 상태로 편집 가능성이 남는다.
 *
 * 순수 변환(`convertStudioMaskPixelsToPsdLayerMask`)은 DOM에 닿지 않아 단위
 * 테스트로 고정하고, 디코드·재투영(`decodeStudioMaskPixelsForPsd`)만 브라우저
 * Image/Canvas를 쓴다.
 */
import type { LayerMaskData, PixelData } from "ag-psd";

/** 내보내기 마스크 픽셀 상한 — PSD 내보내기의 캔버스 픽셀 예산과 같은 값. */
export const PSD_ADJUSTMENT_MASK_MAX_PIXELS = 32 * 1024 * 1024;

export interface StudioMaskPixelDataLike {
  readonly data: Uint8ClampedArray | Uint8Array;
  readonly width: number;
  readonly height: number;
}

export interface StudioMaskToPsdOptions {
  /** PSD 문서 좌표 기준 마스크 왼쪽(기본 0 — 페이지 전체 틀). */
  readonly left?: number;
  /** PSD 문서 좌표 기준 마스크 위쪽(기본 0 — 페이지 전체 틀). */
  readonly top?: number;
  /** Studio에서 마스크가 꺼져 있었으면 true — PSD에서도 비활성으로 기록한다. */
  readonly disabled?: boolean;
  /** 테스트·예산 조정용 픽셀 상한 주입(기본 PSD_ADJUSTMENT_MASK_MAX_PIXELS). */
  readonly maxPixels?: number;
}

function positiveInteger(value: number): number | null {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * Studio 마스크 픽셀(알파=가시성)을 ag-psd 네이티브 마스크로 변환한다.
 * 입력 RGB는 규약상 흰색이라 읽지 않고 알파만 권위 값으로 삼는다(합성 실행기의
 * 커버리지 추출과 같은 규약). 형식이 어긋난 입력은 마스크를 지어내지 않고
 * null을 돌려준다 — 호출자가 실패로 닫아 잘못된 마스크가 조용히 나가지 않게 한다.
 */
export function convertStudioMaskPixelsToPsdLayerMask(
  pixels: StudioMaskPixelDataLike,
  options: StudioMaskToPsdOptions = {},
): LayerMaskData | null {
  const width = positiveInteger(pixels.width);
  const height = positiveInteger(pixels.height);
  if (!width || !height) return null;
  const maxPixels = positiveInteger(options.maxPixels ?? PSD_ADJUSTMENT_MASK_MAX_PIXELS);
  if (!maxPixels || width * height > maxPixels) return null;
  if (!(pixels.data instanceof Uint8ClampedArray) && !(pixels.data instanceof Uint8Array)) {
    return null;
  }
  if (pixels.data.length !== width * height * 4) return null;
  const left = Number.isSafeInteger(options.left ?? 0) ? (options.left ?? 0) : null;
  const top = Number.isSafeInteger(options.top ?? 0) ? (options.top ?? 0) : null;
  if (left === null || top === null) return null;

  const source = pixels.data;
  const data = new Uint8ClampedArray(source.length);
  for (let i = 0; i < source.length; i += 4) {
    const visibility = source[i + 3]!;
    data[i] = visibility;
    data[i + 1] = visibility;
    data[i + 2] = visibility;
    data[i + 3] = 255;
  }
  const imageData: PixelData = { width, height, data };
  return {
    top,
    left,
    bottom: top + height,
    right: left + width,
    // 픽셀이 틀 전체를 덮으므로 영역 밖 기본값은 쓰이지 않는다. 가져오기 규약의
    // 기본값 0(가림)과 같은 값을 명시해 재가져오기 판정이 흔들리지 않게 한다.
    defaultColor: 0,
    ...(options.disabled ? { disabled: true } : {}),
    imageData,
  };
}

/**
 * `maskSrc`(PNG data URL)를 출력 픽셀 크기(width×height)로 재투영해 픽셀을 읽는다.
 * 마스크 원본에서 바로 다시 그리므로(미리보기 확대가 아니라 원본 재투영) 가져올 때
 * 보존된 해상도가 그대로 쓰이고, 출력 배율이 원본보다 크면 그만큼만 보간된다.
 * 디코드·캔버스 실패는 throw 한다 — 마스크 없는 조정 레이어는 화면과 다른
 * 결과(전면 적용)를 만들므로, 호출자는 내보내기 자체를 실패로 닫아야 한다.
 */
export async function decodeStudioMaskPixelsForPsd(
  maskSrc: string,
  width: number,
  height: number,
): Promise<StudioMaskPixelDataLike> {
  if (!positiveInteger(width) || !positiveInteger(height)) {
    throw new Error("조정 레이어 마스크의 출력 크기가 올바르지 않아요.");
  }
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("조정 레이어 마스크 이미지를 불러오지 못했어요."));
    img.src = maskSrc;
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("조정 레이어 마스크 캔버스를 만들지 못했어요.");
    context.drawImage(image, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
