/**
 * Studio Export Presets — 플랫폼별 내보내기 규격 프리셋 · 검증 · 스트립 슬라이스 계획·실행.
 *
 * 기존 내보내기는 배율(1/2/3)·포맷(png/jpg/webp)·투명배경만 있고, "네이버 도전만화는
 * 폭 690·JPG만·5MB" 같은 연재 규격을 알려주거나 검증하지 못했다. 이 모듈이 그 공백을
 * 메운다 — 대표 플랫폼 규격 데이터 + 현재 출력이 규격에 맞는지 한글 경고 + 긴 세로
 * 스트립을 규격 높이로 자르는 슬라이스 계획 + 그 계획을 실제 파일 저장으로 옮기는 실행부.
 *
 * 계획·검증(플랜·좌표·파일명·안내문)은 전부 순수·결정적(랜덤·부작용 없음)이라 node
 * 단위 테스트가 가능하다. 브라우저 캔버스·다운로드를 만지는 건 exportPresetSlices 실행부
 * 하나뿐이며, 저장 경로(canvasToBlob/downloadBlob)는 studio-export를 재사용한다.
 * 사용자 노출 문자열은 한글.
 */

import type { WatermarkSettings } from "../studio-watermark";
import { frozenStatus6Text } from "../status-i18n/studio-frozen6-status-i18n";

import {
  planStudioEpisodeByteBudget,
  planStudioEpisodeFileByteCap,
  studioEpisodeByteBudgetMessage,
} from "./studio-episode-byte-budget";
import { MAX_CANVAS_DIM } from "./studio-export";
import {
  studioPresetCanvasTileSource,
  type StudioPresetTiledRasterSource,
} from "./studio-preset-tiled-raster";
import {
  negotiateStudioExportQuality,
  studioQualityNegotiationMessage,
} from "./studio-export-quality-negotiation";
import {
  downscaleForExport,
  loadVipsForExport,
  planVipsExportRoute,
  type StudioVipsExportLimits,
  type StudioVipsExportRuntime,
  type StudioVipsRaster,
} from "./studio-vips-export";
import { formatNumber } from "@toonstudio/core/format";
import { validateCustomStripSlices } from "./studio-strip-slice-validation";
import {
  executePresetSlicesLoop,
  PresetSliceExportCancelledError,
  PresetSlicePartialExportError,
} from "./studio-export-preset-resume";
import {
  drawWatermarkOnSlice,
  planSliceDrawOps,
  presetSliceFileName,
  type ExportFormat,
  type PresetPageLayout,
  type SliceDrawOp,
  type StripSlice,
} from "./studio-export-slice-helpers";

export {
  PresetSliceExportCancelledError,
  PresetSlicePartialExportError,
  planStudioEpisodeByteBudget,
  planStudioEpisodeFileByteCap,
  studioEpisodeByteBudgetMessage,
  negotiateStudioExportQuality,
  studioQualityNegotiationMessage,
  drawWatermarkOnSlice,
  planSliceDrawOps,
  presetSliceFileName,
};
export type { ExportFormat, PresetPageLayout, SliceDrawOp, StripSlice };

export interface ExportPreset {
  id: string;
  label: string;
  platform: string;
  /** 권장 출력 폭(px). 0이면 "원본 유지"(폭 변환 없음). */
  width: number;
  allowedFormats: ExportFormat[];
  recommendedFormat: ExportFormat;
  /** 이미지 1장 최대 높이(px). 초과 시 분할 권장. */
  maxImageHeight?: number;
  /** 이미지 1장 최대 용량(byte). */
  maxFileBytes?: number;
  /**
   * 회차 전체 합계 최대 용량(byte).
   *
   * 도전만화의 실제 반려 사유 1위가 이 값인데, 지금까지는 `note` 문장 안에만 있어서
   * 어떤 코드도 쓰지 않았다 — 4.9MB 12장을 저장하면 장별 경고 없이 58MB 회차가 만들어졌다.
   * 이 값이 있으면 저장 단계에서 장별 실효 상한을 역산해(studio-episode-byte-budget)
   * 품질 협상 목표로 쓰고, 저장 후 합계도 정산한다.
   */
  maxEpisodeBytes?: number;
  note: string;
}

const MB = 1024 * 1024;

/**
 * 대표 웹툰/SNS 플랫폼 내보내기 규격. 좁은 폭 → 넓은 폭, 마지막은 "원본 유지".
 * 폭/포맷/높이/용량 기준은 각 플랫폼 업로드·공모전 가이드에서 가져온 일반 기준값이다.
 */
export const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: "naver-challenge",
    label: "네이버 도전만화",
    platform: "네이버 웹툰",
    width: 690,
    allowedFormats: ["jpg"],
    recommendedFormat: "jpg",
    maxImageHeight: 1280,
    maxFileBytes: 5 * MB,
    maxEpisodeBytes: 50 * MB,
    note: "폭 690px · JPG만 지원(PNG 불가) · 이미지당 5MB · 회차 합계 약 50MB.",
  },
  {
    id: "webtoon-canvas",
    label: "웹툰 캔버스",
    platform: "WEBTOON Canvas",
    width: 800,
    allowedFormats: ["jpg", "png"],
    recommendedFormat: "jpg",
    maxImageHeight: 1280,
    note: "폭 800px 권장 · 세로 1280px 단위로 잘라 업로드.",
  },
  {
    id: "lezhin",
    label: "레진코믹스",
    platform: "레진",
    width: 1440,
    allowedFormats: ["jpg"],
    recommendedFormat: "jpg",
    note: "폭 1440px · JPG · 300dpi 고해상 권장(공모전 기준).",
  },
  {
    id: "kakaopage",
    label: "카카오페이지",
    platform: "카카오",
    width: 720,
    allowedFormats: ["jpg", "png"],
    recommendedFormat: "jpg",
    maxImageHeight: 4200,
    note: "폭 720px · 이미지 1장 세로 4200px 이내.",
  },
  {
    id: "instagram-square",
    label: "인스타그램 정방형",
    platform: "Instagram",
    width: 1080,
    allowedFormats: ["jpg", "png"],
    recommendedFormat: "jpg",
    maxImageHeight: 1080,
    note: "1080×1080 정방형 피드.",
  },
  {
    id: "instagram-portrait",
    label: "인스타그램 세로",
    platform: "Instagram",
    width: 1080,
    allowedFormats: ["jpg", "png"],
    recommendedFormat: "jpg",
    maxImageHeight: 1350,
    note: "1080×1350 세로 피드(4:5).",
  },
  {
    id: "original",
    label: "원본 고해상도",
    platform: "범용",
    width: 0,
    allowedFormats: ["png", "jpg", "webp"],
    recommendedFormat: "png",
    note: "폭 변환 없이 현재 배율 그대로 — 백업·재편집용.",
  },
];

/** id로 프리셋 조회(없으면 undefined). */
export function findExportPreset(id: string): ExportPreset | undefined {
  return EXPORT_PRESETS.find((p) => p.id === id);
}


/**
 * 전체 세로 길이를 sliceHeight 단위로 자른 슬라이스 목록. 마지막 칸은 남은 높이.
 * sliceHeight<=0 또는 totalHeight<=0 이면 [].
 */
export function planStripSlices(totalHeight: number, sliceHeight: number): StripSlice[] {
  if (sliceHeight <= 0 || totalHeight <= 0) return [];
  const slices: StripSlice[] = [];
  let y = 0;
  let index = 0;
  while (y < totalHeight) {
    const height = Math.min(sliceHeight, totalHeight - y);
    slices.push({ index, y, height });
    y += sliceHeight;
    index += 1;
  }
  return slices;
}

/**
 * 캔버스 폭을 프리셋 권장 폭에 맞추는 출력 배율.
 * - preset.width<=0(원본 유지) 또는 canvasWidth<=0 이면 1.
 * - 그 외 preset.width/canvasWidth 를 0.25~4로 클램프, 소수 셋째 자리 반올림.
 *   690/720 같은 플랫폼 폭은 둘째 자리 반올림 시 691px가 되므로 실제 출력 폭 기준을 우선한다.
 */
export function recommendScale(canvasWidth: number, preset: ExportPreset): number {
  if (preset.width <= 0 || canvasWidth <= 0) return 1;
  const raw = preset.width / canvasWidth;
  const clamped = Math.min(4, Math.max(0.25, raw));
  return Math.round(clamped * 1000) / 1000;
}

export type ExportWarningCode = "format" | "height" | "filesize" | "width";
export interface ExportWarning {
  code: ExportWarningCode;
  message: string;
}
export interface ExportValidation {
  ok: boolean;
  warnings: ExportWarning[];
}

/**
 * 현재 출력 사양(폭·높이·포맷·용량)이 프리셋 규격에 맞는지 검사. 경고는 한글 메시지.
 * 경고가 하나도 없으면 ok:true.
 */
export function validateExport(
  input: { width: number; height: number; format: ExportFormat; bytes?: number },
  preset: ExportPreset
): ExportValidation {
  const warnings: ExportWarning[] = [];
  if (!preset.allowedFormats.includes(input.format)) {
    warnings.push({
      code: "format",
      message: `${preset.label}은(는) ${input.format.toUpperCase()} 형식을 지원하지 않아요. 권장: ${preset.recommendedFormat.toUpperCase()}.`,
    });
  }
  if (preset.maxImageHeight !== undefined && input.height > preset.maxImageHeight) {
    warnings.push({
      code: "height",
      message: `이미지 높이가 ${formatNumber(preset.maxImageHeight)}px를 넘어요. 여러 장으로 나눠 내보내는 걸 권장해요.`,
    });
  }
  if (
    preset.maxFileBytes !== undefined &&
    input.bytes !== undefined &&
    input.bytes > preset.maxFileBytes
  ) {
    warnings.push({
      code: "filesize",
      message: `용량이 ${Math.round(preset.maxFileBytes / MB)}MB를 넘어요. 품질을 낮추거나 분할하세요.`,
    });
  }
  if (preset.width > 0 && input.width !== preset.width) {
    warnings.push({
      code: "width",
      message: `출력 폭 ${formatNumber(input.width)}px가 권장 폭 ${formatNumber(preset.width)}px와 달라요.`,
    });
  }
  return { ok: warnings.length === 0, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// 규격 슬라이스 내보내기 실행 — 위 규격 데이터를 "안내"에서 "실행"으로 옮긴다.
// 페이지 캡처(색보정 합성)는 StudioPage의 기존 내보내기 경로가 담당하고, 여기서는
// 캡처된 캔버스들을 규격 폭으로 리샘플해 이어 붙인 "가상 스트립"을 규격 높이 단위로
// 잘라 여러 장으로 순차 저장한다(zip·추가 의존성 없음). 전체 스트립을 한 장의 중간
// 캔버스로 합치지 않고 페이지→슬라이스로 직접 그려 브라우저 캔버스 한계를 피한다.
// ─────────────────────────────────────────────────────────────────────────────

/** 규격 내보내기 범위 — 현재 페이지 1장 또는 전체 페이지 세로 연결. */
export type PresetExportScope = "current" | "all";


export interface PresetSlicePlan {
  /** 최종 출력 폭(px) — 프리셋 권장 폭, 원본 유지(0)면 첫 페이지 캡처 폭. */
  targetWidth: number;
  /** 리샘플 후 전체 스트립 높이(px). */
  totalHeight: number;
  /** 슬라이스 1장 기준 높이(px) — 프리셋 최대 높이, 없으면 브라우저 캔버스 한계. */
  sliceHeight: number;
  /** 프리셋 허용 포맷으로 강제된 최종 포맷. */
  format: ExportFormat;
  slices: StripSlice[];
  pages: PresetPageLayout[];
}

/** 프리셋이 허용하지 않는 포맷이면 권장 포맷으로 바꾼다(네이버=JPG 전용 등). */
export function resolvePresetFormat(preset: ExportPreset, format: ExportFormat): ExportFormat {
  return preset.allowedFormats.includes(format) ? format : preset.recommendedFormat;
}

/**
 * 캡처된 페이지 크기 목록 → 규격 슬라이스 실행 계획(순수).
 * - 페이지마다 규격 폭 리샘플 후 높이를 구해 간격 0으로 이어 붙인다(연재 업로드는
 *   슬라이스가 뷰어에서 다시 이어 보이므로 페이지 사이 여백을 넣지 않는다).
 * - 프리셋에 최대 높이가 없어도 브라우저 캔버스 한계(maxCanvasDim)로는 자른다 —
 *   한계를 넘는 캔버스는 조용히 빈 이미지가 되기 때문(studio-export의 MAX_CANVAS_DIM).
 * - 유효한(양수 크기) 페이지가 하나도 없으면 null.
 */
export function planPresetSliceExport(
  pageSizes: { width: number; height: number }[],
  preset: ExportPreset,
  format: ExportFormat,
  maxCanvasDim = MAX_CANVAS_DIM
): PresetSlicePlan | null {
  const valid = pageSizes.filter((size) => size.width > 0 && size.height > 0);
  if (valid.length === 0 || maxCanvasDim <= 0) return null;
  const targetWidth = preset.width > 0 ? preset.width : Math.max(1, Math.round(valid[0].width));
  const pages: PresetPageLayout[] = [];
  let y = 0;
  for (const size of valid) {
    const height = Math.max(1, Math.round((size.height * targetWidth) / size.width));
    pages.push({ y, height, sourceWidth: size.width, sourceHeight: size.height });
    y += height;
  }
  const sliceHeight = Math.min(preset.maxImageHeight ?? maxCanvasDim, maxCanvasDim);
  return {
    targetWidth,
    totalHeight: y,
    sliceHeight,
    format: resolvePresetFormat(preset, format),
    slices: planStripSlices(y, sliceHeight),
    pages,
  };
}


export interface PresetExportResult {
  /** 저장한 파일 수. */
  files: number;
  /** 프리셋 용량 제한을 넘은 파일 수(저장은 됨 — 업로드 전 확인 필요). */
  oversized: number;
  /** 실제 저장에 쓴 포맷(프리셋 허용 포맷으로 강제된 값). */
  format: ExportFormat;
  /** 실제 저장 폭(px). */
  targetWidth: number;
  /**
   * 자체 Lanczos3 고품질 축소 레인으로 처리된 대형 페이지 수.
   * 라우팅된 페이지가 없으면 키 자체가 없다(기존 결과 shape 불변 — pristine 계약).
  */
  vipsRoutedPages?: number;
  /** 원본 크기를 유지하며 영역 단위로 읽고 합성한 페이지 수. */
  tiledPages?: number;
}

/** 실행 결과를 한 줄 한글 안내로 — 용량 초과·vips 레인 정보를 덧붙인다. */
export function presetExportResultMessage(result: PresetExportResult, preset: ExportPreset): string {
  const parts = [
    `폭 ${formatNumber(result.targetWidth)}px ${result.format.toUpperCase()} ${result.files}장으로 저장했어요.`,
  ];
  if (result.oversized > 0 && preset.maxFileBytes !== undefined) {
    parts.push(
      `${result.oversized}장은 ${Math.round(preset.maxFileBytes / MB)}MB 제한을 넘어요 — 업로드 전에 용량을 줄여주세요.`
    );
  }
  if (result.vipsRoutedPages !== undefined && result.vipsRoutedPages > 0) {
    parts.push(`고해상 페이지 ${result.vipsRoutedPages}장은 고품질 축소(Lanczos3)로 저장했어요.`);
  }
  if (result.tiledPages) parts.push(`대형 페이지 ${result.tiledPages}장은 원본을 타일로 읽어 저장했어요.`);
  return parts.join(" ");
}

export type PresetExportPage = HTMLCanvasElement | StudioPresetTiledRasterSource;

export interface PresetSliceExportOptions {
  /** 캡처된 페이지 캔버스(색보정 합성 완료, 페이지 순서). */
  pages: PresetExportPage[];
  preset: ExportPreset;
  /** 사용자가 고른 포맷 — 프리셋이 허용하지 않으면 권장 포맷으로 강제된다. */
  format: ExportFormat;
  /** 파일명에 쓸 작품 제목(비어 있으면 기본 파일명). */
  title: string;
  /** 있으면 슬라이스마다 서명 — 파일 단위 귀속이 유지되고 절단면에서 잘리지 않는다. */
  watermark?: WatermarkSettings;
  customSlices?: readonly StripSlice[];
  /** 이전 시도에서 이미 저장 완료된 슬라이스 인덱스(재시도 시 건너뛰어 중복 다운로드를 막는다). */
  skipSliceIndices?: ReadonlySet<number>;
  /** 각 슬라이스가 실제 저장된 직후 호출되는 진행 콜백. */
  onSliceSaved?: (sliceIndex: number) => void;
  /** 내보내기 취소 신호. */
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /**
   * 다운로드 사이 **최소 간격**(ms) — 연속 다운로드 차단 회피. 기본 250, 테스트에선 0.
   * 다운로드 뒤에 무조건 쉬는 시간이 아니라, 다음 슬라이스의 합성·인코딩 시간이
   * 함께 차감되는 간격이다(§exportPresetSlices 주석).
   */
  delayMs?: number;
  /** 테스트 주입용 — 기본은 performance.now()(없으면 Date.now()). 단조 시계만 쓴다. */
  now?: () => number;
  /** 테스트 주입용 — 기본은 setTimeout 기반 대기. */
  sleep?: (ms: number) => Promise<void>;
  /** 테스트 주입용 — 기본은 document.createElement("canvas"). */
  createCanvas?: (width: number, height: number) => HTMLCanvasElement;
  /** 테스트 주입용 — 기본은 downloadBlob(실제 파일 저장). */
  download?: (blob: Blob, filename: string) => void;
  /** 테스트 주입용 — 기본은 loadVipsForExport(자체 Lanczos3 공유 캐시, dynamic import 유지). */
  loadVipsRuntime?: () => Promise<StudioVipsExportRuntime>;
  /** 테스트 주입용 — 기본은 getImageData 픽셀 읽기(null이면 선택된 vips 작업 실패). */
  readPageRgba?: (page: HTMLCanvasElement) => Uint8Array | null;
  /** 테스트 주입용 — 기본은 putImageData 로 리샘플 결과를 새 캔버스에 옮긴다. */
  createResampledPage?: (raster: StudioVipsRaster) => HTMLCanvasElement | null;
  /** 테스트 주입용 — 기본은 studio-vips-export 기본 예산(8192 edge / 8192² area / 16384² input). */
  vipsLimits?: StudioVipsExportLimits;
}

// ─────────────────────────────────────────────────────────────────────────────
// 자체 Lanczos3 대형 페이지 다운스케일 레인 — V12 게이트 매트릭스 Large image 행 실배선.
// 근거(tests/benchmarks/results/quality-lab.json 2026-08-07): downscale 에서
// 과거 wasm-vips lanczos3 는 PSNR 27.26dB/SSIM 0.9887 로 브라우저 drawImage 상당의
// canvaskit-linear(25.31dB/0.9834)를 이긴다. 단일 인코어 표면 예산(8192 edge /
// 8192² area — studio-vips-export planVipsExportRoute)을 넘는 페이지만 라우팅하고,
// 예산 안 페이지는 작업 시작 전에 Canvas2D 경로를 선택해 바이트 그대로 유지한다
// (pristine 계약). vips/out-of-core가 선택된 뒤에는 다른 provider로 재실행하지 않는다.
// ─────────────────────────────────────────────────────────────────────────────

export type PresetVipsUnavailableStage =
  | "out-of-core"
  | "load"
  | "read"
  | "resample"
  | "materialize";

/**
 * 선택된 대용량 내보내기 provider가 작업을 완료하지 못했다.
 * 다른 provider로 같은 내보내기를 다시 실행하지 않도록 단계와 페이지를 보존한다.
 */
export class PresetVipsUnavailableError extends Error {
  readonly stage: PresetVipsUnavailableStage;
  readonly pageIndex: number | null;
  override readonly cause?: unknown;

  constructor(input: {
    stage: PresetVipsUnavailableStage;
    message: string;
    pageIndex?: number;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "PresetVipsUnavailableError";
    this.stage = input.stage;
    this.pageIndex = input.pageIndex ?? null;
    this.cause = input.cause;
  }
}

/** vips 레인 준비 결과 — 슬라이스 합성 루프가 그대로 소비한다. */
export interface PresetVipsPreparedPages {
  /** 슬라이스 drawImage 가 쓸 페이지 캔버스 — 라우팅 안 된 페이지는 원본 참조 그대로. */
  drawPages: PresetExportPage[];
  /** 라우팅된 페이지는 source 크기가 리샘플 결과로 갱신된 레이아웃(1:1 blit). */
  layouts: PresetPageLayout[];
  /** 자체 Lanczos3로 실제 리샘플된 페이지 수. */
  vipsRoutedPages: number;
  tiledPages: ReadonlyMap<number, StudioPresetTiledRasterSource>;
}

/** getImageData 기반 기본 픽셀 읽기 — 컨텍스트가 없으면 선택된 vips 작업이 실패한다. */
function defaultReadPresetPageRgba(page: HTMLCanvasElement): Uint8Array | null {
  const ctx = page.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const image = ctx.getImageData(0, 0, page.width, page.height);
  return new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength);
}

/** putImageData 기반 기본 결과 캔버스 — DOM 이 없으면 선택된 vips 작업이 실패한다. */
function defaultCreateResampledPresetPage(raster: StudioVipsRaster): HTMLCanvasElement | null {
  if (typeof document === "undefined" || typeof ImageData === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // 새 ArrayBuffer 로 복사 — ImageData 는 SharedArrayBuffer 뷰를 받지 않는다.
  const pixels = new Uint8ClampedArray(raster.rgba);
  ctx.putImageData(new ImageData(pixels, raster.width, raster.height), 0, 0);
  return canvas;
}

/**
 * 인코어 표면 예산(8192 edge/면적)을 넘는 페이지만 자체 Lanczos3로 규격 폭까지
 * 미리 축소한다. 리샘플된 페이지의 레이아웃은 1:1 blit 이 되도록 source 크기를 결과
 * 크기로 바꿔치기하므로 슬라이스 합성의 drawImage 는 더 이상 화질을 결정하지 않는다.
 * 라우팅 대상이 하나도 없으면 축소 런타임도 로드하지 않고 원본 배열 사본을 돌려준다
 * (작업 전 Canvas2D 선택, 기존 경로 바이트 불변). vips 또는 out-of-core가 선택된 뒤
 * provider가 준비/실행되지 않으면 다운로드 전에 명시적으로 실패한다.
 */
export async function prepareVipsRoutedPresetPages(
  pages: PresetExportPage[],
  plan: PresetSlicePlan,
  options: Pick<
    PresetSliceExportOptions,
    "loadVipsRuntime" | "readPageRgba" | "createResampledPage" | "vipsLimits"
  > = {}
): Promise<PresetVipsPreparedPages> {
  // 슬라이스 합성 루프와 같은 인덱스 규약: layouts[k] ↔ pages[k].
  const drawPages = pages.filter((p) => p.width > 0 && p.height > 0);
  const layouts = plan.pages.slice();
  const tiledPages = new Map<number, StudioPresetTiledRasterSource>();

  // 라우팅 판정만 먼저 — 대상이 없으면 wasm 로드 자체가 일어나지 않는다(pristine).
  const routedIndices: number[] = [];
  layouts.forEach((layout, index) => {
    const route = planVipsExportRoute(layout.sourceWidth, layout.sourceHeight, options.vipsLimits).route;
    const page = drawPages[index];
    if (page && ("kind" in page || route === "out-of-core")) {
      tiledPages.set(index, "kind" in page ? page : studioPresetCanvasTileSource(page));
      return;
    }
    // vips 는 다운스케일 전용 레인 — 규격 폭이 원본 폭 이상이면 기존 경로 유지.
    if (route === "vips" && plan.targetWidth < layout.sourceWidth) routedIndices.push(index);
  });
  const finish = (routed: number): PresetVipsPreparedPages => ({
    drawPages,
    layouts,
    vipsRoutedPages: routed,
    tiledPages,
  });
  if (routedIndices.length === 0) return finish(0);

  let runtime: StudioVipsExportRuntime;
  try {
    runtime = await (options.loadVipsRuntime ?? loadVipsForExport)();
  } catch (cause) {
    throw new PresetVipsUnavailableError({
      stage: "load",
      message: frozenStatus6Text("studio.frozenStatus6.exportPresets.vipsLoadFailed", "선택된 고품질 축소 엔진(Lanczos3)을 불러오지 못해 내보내기를 중단했어요."),
      cause,
    });
  }

  const readPageRgba = options.readPageRgba ?? defaultReadPresetPageRgba;
  const createResampledPage = options.createResampledPage ?? defaultCreateResampledPresetPage;
  let routed = 0;
  for (const index of routedIndices) {
    const layout = layouts[index];
    const page = drawPages[index];
    if (!layout || !page || "kind" in page) continue;
    const rgba = readPageRgba(page);
    if (!rgba) {
      throw new PresetVipsUnavailableError({
        stage: "read",
        pageIndex: index,
        message: `페이지 ${index + 1}의 픽셀을 축소 입력으로 읽지 못해 내보내기를 중단했어요.`,
      });
    }
    let raster: StudioVipsRaster;
    try {
      // 목표 높이는 슬라이스 계획과 동일한 반올림(layout.height) — 크기 드리프트 없음.
      raster = await downscaleForExport(
        rgba,
        layout.sourceWidth,
        layout.sourceHeight,
        plan.targetWidth,
        layout.height,
        { runtime }
      );
    } catch (cause) {
      throw new PresetVipsUnavailableError({
        stage: "resample",
        pageIndex: index,
        message: `페이지 ${index + 1}을 Lanczos3로 축소하지 못해 내보내기를 중단했어요.`,
        cause,
      });
    }
    const resampled = createResampledPage(raster);
    if (!resampled) {
      throw new PresetVipsUnavailableError({
        stage: "materialize",
        pageIndex: index,
        message: `페이지 ${index + 1}의 축소 결과를 합성 표면으로 만들지 못해 내보내기를 중단했어요.`,
      });
    }
    drawPages[index] = resampled;
    // source 크기 = 결과 크기 → planSliceDrawOps 비율 1(무손실 1:1 blit).
    layouts[index] = { ...layout, sourceWidth: raster.width, sourceHeight: raster.height };
    routed += 1;
  }
  return finish(routed);
}

/** 기본 슬라이스 캔버스 팩토리 — 브라우저 전용(호출 시점에만 document 접근). */
function createSliceCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}


/**
 * 규격 슬라이스 내보내기 실행 — 캡처된 페이지들을 규격 폭으로 리샘플해 이어 붙인 뒤
 * 규격 높이 단위 이미지 여러 장으로 순차 다운로드한다. 플랫폼 업로드용이라 배경은
 * 흰색 불투명(네이버 등 JPG 전용 + 뷰어 배경 일치). 저장한 파일 수·용량 초과 수를
 * 담은 결과를 돌려주며, 페이지가 없거나 캔버스 생성이 막히면 한글 메시지로 throw.
 */
export async function exportPresetSlices(options: PresetSliceExportOptions): Promise<PresetExportResult> {
  const { pages, preset } = options;
  const basePlan = planPresetSliceExport(pages.map((canvas) => ({ width: canvas.width, height: canvas.height })), preset, options.format);
  if (!basePlan || basePlan.slices.length === 0) throw new Error("내보낼 페이지가 없어요.");
  const plan = options.customSlices ? { ...basePlan, slices: validateCustomStripSlices(basePlan.totalHeight, options.customSlices) } : basePlan;
  if (options.signal?.aborted) {
    throw new PresetSliceExportCancelledError({
      completedSliceIndices: [...(options.skipSliceIndices ?? [])],
      totalSliceCount: plan.slices.length,
    });
  }
  // 인코어 표면 예산(8192 edge/면적)을 넘는 페이지만 자체 Lanczos3로 선축소 —
  // 예산 안 문서는 아무 것도 바뀌지 않고(원본 참조·원본 레이아웃) 기존 바이트 그대로다.
  const prepared = await prepareVipsRoutedPresetPages(pages, plan, options);
  if (options.signal?.aborted) {
    throw new PresetSliceExportCancelledError({
      completedSliceIndices: [...(options.skipSliceIndices ?? [])],
      totalSliceCount: plan.slices.length,
    });
  }
  return executePresetSlicesLoop(plan, prepared, {
    ...options,
    createCanvas: options.createCanvas ?? createSliceCanvas,
  });
}
