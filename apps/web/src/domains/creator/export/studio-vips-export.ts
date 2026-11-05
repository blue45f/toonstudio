// 자체 Lanczos3 최종 내보내기 레인. 외부 wasm-vips 의존성을 사용하지 않는다.
// 기존 vips 이름의 공개 식별자·route는 저장된 계약과 호출자의 호환성을 위해 보존한다.
// 큰 축소는 정수 box prefilter와 3-lobe sinc, 알파는 premultiplied 필터링한다.
// 기존 Quality Lab의 PSNR/SSIM 하한을 낮추지 않고 통과해야 한다.
// final/export 전용이며 실패 시 다른 provider로 조용히 대체하지 않는다.

export const STUDIO_VIPS_EXPORT_REVISION = 2 as const;

/** 카탈로그 descriptor id — 테스트가 registry 와의 정합을 검증한다. */
export const STUDIO_VIPS_EXPORT_PROVIDER_ID = "wasm-vips-pipeline" as const;

/** 자체 Lanczos3 커널, 단일 스레드. */
export const STUDIO_VIPS_EXPORT_KERNEL = "lanczos3" as const;
export const STUDIO_VIPS_EXPORT_CONCURRENCY = 1 as const;

/** descriptor 와 동일해야 하는 라이선스 표기 — 자체 구현이므로 internal 정책을 따른다. */
export const STUDIO_VIPS_EXPORT_LICENSE = "internal" as const;
export const STUDIO_VIPS_EXPORT_ATTRIBUTION = "ToonStudio native Lanczos3" as const;

/**
 * 단일 인코어 표면(Canvas2D 슬라이스 합성 레인)의 한 변 상한.
 * 근거: WebGL/WebGPU maxTextureDimension 보수 기준선 8192(이 레포의
 * studio-bg3d-glb-validation.ts 텍스처 상한과 동일)이며, out-of-core provider 의
 * 타일 렌더 예산 maxTileRenderPixels(67,108,864 = 8192²)와 같은 축.
 */
export const STUDIO_VIPS_EXPORT_SINGLE_SURFACE_EDGE_PX = 8192 as const;

/**
 * 단일 인코어 표면 픽셀 예산 — out-of-core 기본 예산 maxTileRenderPixels 와 동일값.
 * 사각형에서는 edge 규칙이 사실상 지배하지만, edge 상한을 기기별로 올려 쓰는 경우
 * (limits 파라미터) 면적 상한이 독립 방어선이 된다.
 */
export const STUDIO_VIPS_EXPORT_SINGLE_SURFACE_PIXELS = 67_108_864 as const;

/**
 * vips 레인이 한 번에 붙잡는 입력 픽셀 상한 = 16384²(1GiB RGBA).
 * 근거: 16384 는 studio-export.ts MAX_CANVAS_DIM(브라우저 캔버스 보수 상한)이고,
 * 기존 입력 예산은 호환성을 위해 유지한다. 자체 구현은 전체 float 이미지 대신
 * 필요한 수평 행만 보관하지만, 소스·출력 allocation은 여전히 필요하다. 초과분은 타일 기반
 * studio-out-of-core-export-provider 가 소유한다.
 */
export const STUDIO_VIPS_EXPORT_MAX_INPUT_PIXELS = 268_435_456 as const;

/** 피라미드 레벨 상한 — 2^32 를 넘는 축은 존재하지 않으므로 32면 전 범위를 덮는다. */
export const STUDIO_VIPS_EXPORT_MAX_PYRAMID_LEVELS = 32 as const;

/**
 * ToonStudio native Lanczos3 로드/초기화 실패. 원인(cause)을 보존해 전달하며, 이 모듈과 호출자 모두
 * 같은 내보내기를 다른 provider로 조용히 대체하지 않는다.
 */
export class VipsUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "VipsUnavailableError";
  }
}

/** ToonStudio native Lanczos3 인스턴스의 최소 구조 타입 — 정적 import 없이 호출면만 서술한다. */
interface VipsImageHandle {
  readonly width: number;
  readonly height: number;
  resize(hscale: number, options?: { vscale?: number }): VipsImageHandle;
  writeToMemory(): Uint8Array;
  delete(): void;
}

interface VipsModule {
  Image: {
    newFromMemory(
      data: Uint8Array,
      width: number,
      height: number,
      bands: number,
      format: string,
    ): VipsImageHandle;
  };
  concurrency(threads: number): void;
}

export interface StudioVipsExportRuntime {
  readonly vips: VipsModule;
}

export interface StudioVipsLoadOptions {
  /**
   * 테스트/격리 배포용 주입점. 기본은 자체 resize runtime의 dynamic import.
   * 최초 성공 결과가 캐시되므로 이후 호출의 importVips 는 무시된다.
   */
  readonly importVips?: () => Promise<unknown>;
}

export interface StudioVipsRaster {
  readonly rgba: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export interface StudioVipsPyramidLevel extends StudioVipsRaster {
  /** 1 = 원본의 1/2, 2 = 1/4 … (원본 레벨 0 은 재표본이 아니므로 포함하지 않는다). */
  readonly level: number;
}

export interface StudioVipsResampleOptions {
  /** 이미 로드된 런타임 재사용(배치 내보내기). 없으면 공유 캐시를 로드한다. */
  readonly runtime?: StudioVipsExportRuntime;
}

export interface StudioVipsExportLimits {
  readonly singleSurfaceEdgePx: number;
  readonly singleSurfacePixels: number;
  readonly maxInputPixels: number;
}

export const STUDIO_VIPS_EXPORT_DEFAULT_LIMITS: StudioVipsExportLimits =
  Object.freeze({
    singleSurfaceEdgePx: STUDIO_VIPS_EXPORT_SINGLE_SURFACE_EDGE_PX,
    singleSurfacePixels: STUDIO_VIPS_EXPORT_SINGLE_SURFACE_PIXELS,
    maxInputPixels: STUDIO_VIPS_EXPORT_MAX_INPUT_PIXELS,
  });

export type StudioVipsExportRouteId = "canvas2d" | "vips" | "out-of-core";

export interface StudioVipsExportRoute {
  readonly route: StudioVipsExportRouteId;
  readonly reason: string;
}

const RGBA_BANDS = 4;
const VIPS_UCHAR_FORMAT = "uchar";

let runtimeCache: Promise<StudioVipsExportRuntime> | null = null;

function defaultImportVips(): Promise<unknown> {
  // 번들 게이트 계약: ToonStudio native Lanczos3 는 이 dynamic import 한 곳에서만 등장해야 한다.
  return import("./studio-native-resize-runtime");
}

function isVipsModule(value: unknown): value is VipsModule {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { Image?: unknown; concurrency?: unknown };
  if (typeof candidate.concurrency !== "function") return false;
  // 기존 주입 런타임의 클래스 또는 자체 객체 모두 정적 newFromMemory 계약을 따른다.
  const image = candidate.Image;
  if (
    (typeof image !== "object" && typeof image !== "function")
    || image === null
  ) {
    return false;
  }
  return (
    typeof (image as { newFromMemory?: unknown }).newFromMemory === "function"
  );
}

async function initializeRuntime(
  importVips: () => Promise<unknown>,
): Promise<StudioVipsExportRuntime> {
  let moduleNamespace: unknown;
  try {
    moduleNamespace = await importVips();
  } catch (cause) {
    throw new VipsUnavailableError(
      "ToonStudio native Lanczos3 module could not be imported for the export lane.",
      { cause },
    );
  }
  const factory = (moduleNamespace as { default?: unknown } | null)?.default;
  if (typeof factory !== "function") {
    throw new VipsUnavailableError(
      "ToonStudio native Lanczos3 module did not expose a default factory function.",
    );
  }
  let vips: unknown;
  try {
    // 기존 주입점의 옵션 계약은 보존한다. 자체 런타임은 외부 동적 라이브러리를 사용하지 않는다.
    vips = await (factory as (options?: Record<string, unknown>) => Promise<unknown>)(
      { dynamicLibraries: [] },
    );
  } catch (cause) {
    throw new VipsUnavailableError(
      "ToonStudio native Lanczos3 failed to initialize its JavaScript runtime.",
      { cause },
    );
  }
  if (!isVipsModule(vips)) {
    throw new VipsUnavailableError(
      "ToonStudio native Lanczos3 initialized but its module shape is not the expected vips API.",
    );
  }
  // 결정성 기준선: 자체 구현은 단일 스레드로 동작한다.
  vips.concurrency(STUDIO_VIPS_EXPORT_CONCURRENCY);
  return Object.freeze({ vips });
}

/**
 * ToonStudio native Lanczos3 를 dynamic import 로 1회 로드/초기화해 캐시한다.
 * 동시 호출은 같은 초기화 프로미스를 공유하고, 실패 시 캐시를 비워
 * 다음 호출이 재시도할 수 있게 한다(실패 자체는 VipsUnavailableError 로 전달).
 */
export function loadVipsForExport(
  options: StudioVipsLoadOptions = {},
): Promise<StudioVipsExportRuntime> {
  if (runtimeCache === null) {
    const pending = initializeRuntime(options.importVips ?? defaultImportVips)
      .catch((error: unknown) => {
        if (runtimeCache === pending) runtimeCache = null;
        throw error;
      });
    runtimeCache = pending;
  }
  return runtimeCache;
}

/** 테스트 전용 — 공유 런타임 캐시를 비운다(모듈 상태 격리). */
export function resetStudioVipsExportRuntimeForTests(): void {
  runtimeCache = null;
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
}

function assertSourceRaster(
  rgba: Uint8Array,
  width: number,
  height: number,
): void {
  if (!(rgba instanceof Uint8Array)) {
    throw new TypeError("rgba must be a Uint8Array of RGBA8 pixels.");
  }
  assertPositiveInteger(width, "width");
  assertPositiveInteger(height, "height");
  const expectedBytes = width * height * RGBA_BANDS;
  if (!Number.isSafeInteger(expectedBytes) || rgba.length !== expectedBytes) {
    throw new RangeError(
      `rgba byte length ${rgba.length} does not match ${width}x${height} RGBA8 `
      + `(expected ${expectedBytes}).`,
    );
  }
}

function assertDownscaleTarget(
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
): void {
  assertPositiveInteger(targetWidth, "targetWidth");
  assertPositiveInteger(targetHeight, "targetHeight");
  if (targetWidth > width || targetHeight > height) {
    throw new RangeError(
      "downscaleForExport is a downscale-only lane: "
      + `target ${targetWidth}x${targetHeight} exceeds source ${width}x${height}.`,
    );
  }
}

function resampleWithVips(
  source: VipsImageHandle,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): StudioVipsRaster {
  const resized = source.resize(targetWidth / sourceWidth, {
    vscale: targetHeight / sourceHeight,
  });
  try {
    // 조용한 손실 금지: 자체 resize의 목표 크기 반올림이 요청과 다르면 즉시 실패.
    if (resized.width !== targetWidth || resized.height !== targetHeight) {
      throw new Error(
        `ToonStudio native Lanczos3 resize drifted to ${resized.width}x${resized.height} `
        + `(requested ${targetWidth}x${targetHeight}); refusing silent size loss.`,
      );
    }
    const memory = resized.writeToMemory();
    const expectedBytes = targetWidth * targetHeight * RGBA_BANDS;
    if (memory.length !== expectedBytes) {
      throw new Error(
        `ToonStudio native Lanczos3 returned ${memory.length} bytes for `
        + `${targetWidth}x${targetHeight} RGBA8 (expected ${expectedBytes}).`,
      );
    }
    // 주입 런타임의 buffer 수명과 결합하지 않도록 방어적 사본을 반환한다.
    return {
      rgba: new Uint8Array(memory),
      width: targetWidth,
      height: targetHeight,
    };
  } finally {
    resized.delete();
  }
}

/**
 * 자체 lanczos3(기존 Quality Lab 품질 하한 유지)로 RGBA8 버퍼를
 * 정확히 targetWidth×targetHeight 로 축소한다. 결정적이며(단일 스레드,
 * 고정 커널), 동일 크기 요청은 재표본 없이 방어적 사본을 돌려준다.
 */
export async function downscaleForExport(
  rgba: Uint8Array,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
  options: StudioVipsResampleOptions = {},
): Promise<StudioVipsRaster> {
  assertSourceRaster(rgba, width, height);
  assertDownscaleTarget(width, height, targetWidth, targetHeight);
  if (targetWidth === width && targetHeight === height) {
    // 항등 요청은 무손실 사본 — 런타임 로드를 요구하지 않는다.
    return { rgba: new Uint8Array(rgba), width, height };
  }
  const runtime = options.runtime ?? (await loadVipsForExport());
  const image = runtime.vips.Image.newFromMemory(
    rgba,
    width,
    height,
    RGBA_BANDS,
    VIPS_UCHAR_FORMAT,
  );
  try {
    return resampleWithVips(image, width, height, targetWidth, targetHeight);
  } finally {
    image.delete();
  }
}

/**
 * 웹툰 세로 스크롤용 mip 피라미드. 레벨 k 의 크기는
 * max(1, floor(width/2^k)) × max(1, floor(height/2^k)) — 각 축은 1 에서 클램프된다.
 * 누적 오차를 피하려고 모든 레벨을 원본에서 직접 lanczos3 로 재표본한다
 * (큰 축소는 자체 box prefilter + sinc로 처리).
 * 양 축이 모두 1 에 도달한 다음 레벨부터는 정보가 늘지 않으므로 잘라낸다 —
 * 결과 길이는 요청 levels 보다 짧을 수 있다.
 */
export async function exportPyramid(
  rgba: Uint8Array,
  width: number,
  height: number,
  levels: number,
  options: StudioVipsResampleOptions = {},
): Promise<StudioVipsPyramidLevel[]> {
  assertSourceRaster(rgba, width, height);
  assertPositiveInteger(levels, "levels");
  if (levels > STUDIO_VIPS_EXPORT_MAX_PYRAMID_LEVELS) {
    throw new RangeError(
      `levels must be at most ${STUDIO_VIPS_EXPORT_MAX_PYRAMID_LEVELS}.`,
    );
  }
  if (width === 1 && height === 1) return [];
  const runtime = options.runtime ?? (await loadVipsForExport());
  const image = runtime.vips.Image.newFromMemory(
    rgba,
    width,
    height,
    RGBA_BANDS,
    VIPS_UCHAR_FORMAT,
  );
  try {
    const pyramid: StudioVipsPyramidLevel[] = [];
    let previousWidth = width;
    let previousHeight = height;
    for (let level = 1; level <= levels; level += 1) {
      const divisor = 2 ** level;
      const levelWidth = Math.max(1, Math.floor(width / divisor));
      const levelHeight = Math.max(1, Math.floor(height / divisor));
      if (levelWidth === previousWidth && levelHeight === previousHeight) break;
      const raster = resampleWithVips(
        image,
        width,
        height,
        levelWidth,
        levelHeight,
      );
      pyramid.push({ level, ...raster });
      previousWidth = levelWidth;
      previousHeight = levelHeight;
    }
    return pyramid;
  } finally {
    image.delete();
  }
}

/**
 * 최종 내보내기 라우팅 판정.
 * - "canvas2d": 단일 인코어 표면 예산(edge ≤ 8192, 면적 ≤ 8192²) 안 — vips 불필요.
 * - "vips": 인코어 표면 예산 초과 && 입력 ≤ 16384² px — 이 모듈이 소유.
 * - "out-of-core": 입력 > 16384² px(1GiB RGBA) — 타일 기반 provider 가 소유.
 */
export function planVipsExportRoute(
  width: number,
  height: number,
  limits: StudioVipsExportLimits = STUDIO_VIPS_EXPORT_DEFAULT_LIMITS,
): StudioVipsExportRoute {
  assertPositiveInteger(width, "width");
  assertPositiveInteger(height, "height");
  // 각 축이 safe integer 이고 임계 근방 곱은 2^53 미만이라 double 곱 비교는 정확하다.
  const pixels = width * height;
  if (pixels > limits.maxInputPixels) {
    return {
      route: "out-of-core",
      reason:
        `${width}x${height} = ${pixels}px exceeds the single-allocation input `
        + `budget ${limits.maxInputPixels}px (16384^2, 1GiB RGBA); the tiled `
        + "out-of-core export provider owns this document.",
    };
  }
  if (
    width > limits.singleSurfaceEdgePx
    || height > limits.singleSurfaceEdgePx
    || pixels > limits.singleSurfacePixels
  ) {
    return {
      route: "vips",
      reason:
        `${width}x${height} exceeds the single in-core surface budget `
        + `(edge ${limits.singleSurfaceEdgePx}px / area `
        + `${limits.singleSurfacePixels}px); the ToonStudio native Lanczos3 final lane owns it.`,
    };
  }
  return {
    route: "canvas2d",
    reason:
      `${width}x${height} fits the single in-core surface budget; the `
      + "Canvas2D slice-composition lane keeps ownership.",
  };
}

/** vips 레인이 이 캔버스 크기의 최종 내보내기를 소유해야 하는지 여부. */
export function canHandleExport(
  width: number,
  height: number,
  limits: StudioVipsExportLimits = STUDIO_VIPS_EXPORT_DEFAULT_LIMITS,
): boolean {
  return planVipsExportRoute(width, height, limits).route === "vips";
}
