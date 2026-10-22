/** PSD 원본 픽셀, 폴더 경로와 클리핑을 보존하는 교환 경계.
 * 조정 레이어는 파라미터를 변환해 Studio 조정 레이어 명세(adjustmentLayers)로
 * 복원하고, 효과·격리 그룹은 임의 재현하지 않고 원본 합성본과 편집 레이어를 함께 준비한다.
 * ag-psd의 앞→뒤 순서를 Studio의 뒤→앞 순서로 반전한다.
 */

import { readPsd, type BlendMode, type Layer, type Psd, type ReadOptions } from "ag-psd";

import { studioGroupsFromPsdElements } from "./export/studio-psd-folder-structure";
import {
  convertPsdAdjustmentLayer,
  type StudioPsdAdjustmentConversion,
} from "./studio-psd-adjustment-import";
import {
  buildPsdAdjustmentImportReport,
  classifyPsdAdjustmentFidelity,
  PSD_ADJUSTMENT_FIDELITY_LABELS,
  type PsdAdjustmentUnsupportedInput,
} from "./studio-psd-adjustment-report";
import { planStudioPsdEditableText } from "./export/studio-psd-text-import";
import type { El } from "./studio-element-model";

import { encodeStudioLosslessCanvasSource } from "./studio-lossless-canvas-source";
import { reportStudioPsdImportProgress, throwIfStudioPsdImportAborted, type StudioPsdImportOptions } from "./studio-psd-import-progress";
import {
  rasterizePsdLayerMasks,
  type PsdLayerMaskRasterResult,
  type PsdLayerMaskSource,
} from "./studio-psd-mask-import";
import type { PsdImportedElement, PsdImportedAdjustmentLayer, PsdImportResult, PsdImportEncodedPngMemory, PsdInterchangeContainer, PsdInterchangeDisposition, PsdInterchangeFeature, PsdInterchangeProfile, PsdInterchangeLossDecision, PsdInterchangeLossManifest, PsdHeaderInfo, PsdImportPreflight, PsdImportDeps, FlattenedPsdLayer, RawFlattenedLeaf } from "./studio-psd-import-types";
import type { StudioPsdFolder } from "./export/studio-psd-folder-structure";

export type { PsdImportedElement, PsdImportedAdjustmentLayer, PsdImportResult, PsdImportEncodedPngMemory, PsdInterchangeContainer, PsdInterchangeDisposition, PsdInterchangeFeature, PsdInterchangeProfile, PsdInterchangeLossDecision, PsdInterchangeLossManifest, PsdHeaderInfo, PsdImportPreflight, PsdImportDeps, FlattenedPsdLayer };


function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

// 그룹(폴더) 레이어 판별 — ag-psd 는 리프 레이어엔 children 필드를 아예 만들지 않고(undefined),
// 그룹에만 배열(빈 배열 포함)을 채운다(ag-psd psdReader.ts 의 SectionDivider 처리 확인 완료).
function isGroupLayer(layer: Layer): layer is Layer & { children: Layer[] } {
  return Array.isArray(layer.children);
}

function flattenInto(
  layers: readonly Layer[],
  inheritedOpacity: number,
  inheritedHidden: boolean,
  out: RawFlattenedLeaf[],
  folderPath: readonly StudioPsdFolder[] = [],
): void {
  for (const layer of layers) {
    const opacity = inheritedOpacity * clamp01(layer.opacity ?? 1);
    const hidden = inheritedHidden || !!layer.hidden;

    if (isGroupLayer(layer)) {
      const folder = { id: createImportedLayerId(), name: layer.name?.trim() || "이름 없는 폴더" };
      flattenInto(layer.children, opacity, hidden, out, [...folderPath, folder]);
      continue;
    }

    const left = layer.left ?? 0;
    const top = layer.top ?? 0;
    const width = (layer.right ?? left) - left;
    const height = (layer.bottom ?? top) - top;

    let skipReason: RawFlattenedLeaf["skipReason"];
    let adjustmentConversion: StudioPsdAdjustmentConversion | undefined;
    if (layer.adjustment) {
      // 조정 레이어는 래스터 내용이 없어 이미지 요소로는 만들지 않는다 — 대신 파라미터를
      // 여기서 변환해 실어 보내고, importPsdFile 이 조정 레이어로 복원한다.
      skipReason = "adjustment";
      adjustmentConversion = convertPsdAdjustmentLayer(layer.adjustment);
    } else if (width <= 0 || height <= 0) {
      skipReason = "empty-bounds";
    } else if (!layer.canvas) {
      skipReason = "no-canvas";
    }

    out.push({
      layer, left, top, width, height, opacity, hidden, folderPath, skipReason,
      ...(adjustmentConversion ? { adjustmentConversion } : {}),
    });
  }
}

/**
 * psd.children(중첩 그룹 트리, ag-psd 관례상 [0]=포토샵 패널 맨 위)을 재귀적으로 평탄화해
 * **Studio 순서(뒤→앞, 배열 앞쪽이 배경)로 이미 뒤집힌** 리프 레이어 목록을 반환한다(studio-psd-
 * export.ts 가 반대 방향으로 하는 `[...layers].reverse()`와 정확히 대칭). adjustment 레이어
 * (layer.adjustment 존재)는 래스터 내용이 없으므로 skipReason:"adjustment" 로 표시하고 canvas 를
 * 읽지 않는 대신, 변환 결과(adjustmentConversion)를 함께 실어 복원 재료로 쓴다. 이름 없는 레이어는 최종 Studio 순서 기준 순번으로 "레이어 N" 폴백을 받는다
 * (studio-psd-export.ts 의 elementLabel 과 동일한 fallback 관례).
 */
export function flattenPsdLayers(psd: Psd): FlattenedPsdLayer[] {
  const raw: RawFlattenedLeaf[] = [];
  flattenInto(psd.children ?? [], 1, false, raw);
  raw.reverse(); // ag-psd(패널 맨 위가 먼저) → Studio(맨 뒤가 먼저) 순서 반전.
  return raw.map((entry, index) => {
    const trimmed = entry.layer.name?.trim();
    return { ...entry, name: trimmed ? trimmed : `레이어 ${index + 1}` };
  });
}

// ── blendMode 매핑 ───────────────────────────────────────────────────────────

/**
 * ag-psd BlendMode → Studio El.blendMode(CSS globalCompositeOperation) 문자열.
 * studio-psd-export.ts 의 BLEND_MODE_MAP(Studio→ag-psd)을 손으로 뒤집은 표 — 그 파일을 import
 * 하지 않고 이 파일에 독립적으로 정의한다(기존 파일 무수정 원칙 유지). 두 표가 갈라지지 않도록
 * 값 목록을 나란히 유지할 것 — 한쪽을 고치면 다른 쪽도 확인. 매핑 없는 값(pass through·dissolve·
 * linear burn 등 Canvas 합성에 대응 개념이 없는 모드)은 "source-over"로 방어한다.
 */
const PSD_BLEND_MODE_TO_STUDIO: Partial<Record<BlendMode, string>> = {
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
  "color dodge": "color-dodge",
  "color burn": "color-burn",
  "hard light": "hard-light",
  "soft light": "soft-light",
  difference: "difference",
  exclusion: "exclusion",
  hue: "hue",
  saturation: "saturation",
  color: "color",
  luminosity: "luminosity",
};

export function mapPsdBlendMode(mode: BlendMode | undefined): string {
  if (!mode) return "source-over";
  return PSD_BLEND_MODE_TO_STUDIO[mode] ?? "source-over";
}

// ── 배치 스케일 ──────────────────────────────────────────────────────────────

/** scale = min(1, targetWidth/psdWidth) — onPickImage/createCanvasImageElement 와 동일하게
 *  "확대는 하지 않고 축소만"(저해상도 PSD 가 억지로 커지지 않게). */
function uniformScale(psdWidth: number, targetWidth: number): number {
  if (psdWidth <= 0 || targetWidth <= 0) return 1;
  return Math.min(1, targetWidth / psdWidth);
}

/** 레이어의 PSD 좌표(left/top/width/height)를 targetWidth 기준 균일 스케일로 변환. */
export function placementForLayer(
  bounds: { left: number; top: number; width: number; height: number },
  psdWidth: number,
  targetWidth: number
): { x: number; y: number; width: number; height: number; scale: number } {
  const scale = uniformScale(psdWidth, targetWidth);
  return {
    x: bounds.left * scale,
    y: bounds.top * scale,
    width: bounds.width * scale,
    height: bounds.height * scale,
    scale,
  };
}

// ── 결과 요약 ────────────────────────────────────────────────────────────────

/** 결과 요약 한 줄(상태 배너용) — psdExportResultMessage 와 동일한 톤. */
export function psdImportResultMessage(result: PsdImportResult): string {
  const parts = [`PSD 준비 완료 — 레이어 ${result.elements.length}개`];
  const report = result.adjustmentReport;
  if (report && report.restored > 0) {
    const caveats: string[] = [];
    if (report.counts.approximated > 0) caveats.push(`근사 ${report.counts.approximated}`);
    if (report.counts["preserved-only"] > 0) {
      caveats.push(`파라미터만 보존 ${report.counts["preserved-only"]}`);
    }
    parts.push(
      `조정 레이어 ${report.restored}개 복원${caveats.length > 0 ? `(${caveats.join(" · ")})` : ""}`,
    );
  }
  if (result.skipped.length > 0) parts.push(`알림 ${result.skipped.length}건`);
  return parts.join(" · ");
}

interface LayerMaskImportSelection {
  sources: PsdLayerMaskSource[];
  fallbackMask?: PsdLayerMaskSource;
}

function layerMaskSources(layer: Layer): LayerMaskImportSelection {
  if (layer.realMask) {
    return {
      // PSD channel -3 is the authoritative final pixel+vector composite. It
      // must not be multiplied by channel -2 a second time.
      sources: [{
        kind: "real",
        mask: layer.realMask,
        // ag-psd reads density/feather parameters from the primary descriptor.
        parameterMask: layer.mask ?? layer.realMask,
      }],
      // Keep channel -2 only for explicit recovery when -3 pixels are corrupt.
      fallbackMask: layer.mask ? { kind: "primary", mask: layer.mask } : undefined,
    };
  }
  return {
    sources: layer.mask ? [{ kind: "primary", mask: layer.mask }] : [],
  };
}

function maskEditabilityWarnings(layer: Layer): string[] {
  const warnings: string[] = [];
  const rasterizedVectorMask = !!layer.mask?.fromVectorData || !!layer.realMask?.fromVectorData;
  if (rasterizedVectorMask) {
    warnings.push("벡터 마스크를 편집 가능한 단일 래스터 마스크로 근사했어요.");
  }
  if (layer.mask && layer.realMask) {
    warnings.push("픽셀·벡터 이중 마스크를 편집 가능한 단일 래스터 마스크로 합성했어요.");
  } else if (layer.mask && layer.vectorMask && !rasterizedVectorMask) {
    warnings.push("벡터 마스크 경로는 별도로 편집할 수 없어 래스터 마스크에 포함되지 않았어요.");
  }
  return warnings;
}

function isUsableImageDataUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const separator = value.indexOf(",");
  return separator > 0
    && value.slice(0, separator).toLowerCase().startsWith("data:image/")
    && separator < value.length - 1;
}

// ── id 생성 — studio-asset-library.ts 의 createAssetId 와 동일한 안전장치 패턴 ──

function createImportedLayerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `psd-layer-${Date.now()}-${Math.random().toString(36).slice(2)}`; // NOSONAR S2245 비암호화 용도(ID 생성)
}

/** ag-psd otherwise permits up to 2GB of decoded bitmaps, which is not a safe
 * browser/mobile boundary. The source ArrayBuffer and decoded layer pixels are
 * independently bounded before original PNG layers are admitted to the project. */
export const PSD_IMPORT_MAX_FILE_BYTES = 128 * 1024 * 1024;
export const PSD_IMPORT_MAX_DECODED_BYTES = 128 * 1024 * 1024;
export const PSD_IMPORT_MAX_DIMENSION_PX = 30_000;

/**
 * 인코딩된 PNG data URL이 가져오기 결과에 상주하는 총량의 상한.
 * 디코딩 예산(128MB)은 디코더가 다루는 원본 픽셀 기준이라, base64로 부풀고
 * (약 4/3) 합성본이 전체 캔버스를 한 번 더 담는 data URL 상주량과는 별개로
 * 운용해야 한다. 디코딩 예산의 1.5배를 상한으로 두면 정상 가져오기(레이어 합계가
 * 디코딩 예산 안에 있고 PNG는 대개 원본보다 작다)는 걸리지 않으면서, 결과 객체가
 * 무한정 커지는 것만은 막을 수 있다. 상한을 넘는 항목은 전체 실패가 아니라
 * 레이어·마스크·합성본 단위로 상주를 포기하고 skipped로 정직하게 고지한다.
 */
export const PSD_IMPORT_MAX_ENCODED_PNG_BYTES = Math.floor(PSD_IMPORT_MAX_DECODED_BYTES * 1.5);

/** data URL payload를 디코딩했을 때의 바이트 수 추정치.
 * base64면 패딩을 뺀 정확한 디코딩 길이를, 아니면 percent-encoding이 디코딩 후
 * 길어지지 않으므로 payload 문자 수를 상한 추정치로 돌려준다. */
export function estimatePsdDataUrlDecodedBytes(dataUrl: string): number {
  const separator = dataUrl.indexOf(",");
  if (separator < 0) return dataUrl.length;
  const payload = dataUrl.slice(separator + 1);
  const header = dataUrl.slice(0, separator).toLowerCase();
  if (!header.endsWith(";base64")) return payload.length;
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

/** 상주 PNG 회계 — charge가 상한을 넘으면 false를 돌려주고 회계는 변하지 않는다. */
export interface PsdEncodedPngAccountant {
  chargeLayer(bytes: number): boolean;
  chargeMask(bytes: number): boolean;
  chargeComposite(bytes: number): boolean;
  snapshot(): PsdImportEncodedPngMemory;
  readonly skippedLayerCount: number;
  readonly droppedMaskCount: number;
}

class PsdEncodedPngAccountantImpl implements PsdEncodedPngAccountant {
  constructor(private readonly budgetBytes: number = PSD_IMPORT_MAX_ENCODED_PNG_BYTES) {}
  layerBytes = 0;
  maskBytes = 0;
  compositeBytes = 0;
  peakLayerBytes = 0;
  layerCount = 0;
  skippedLayerCount = 0;
  droppedMaskCount = 0;
  compositeSkipped = false;

  get totalBytes(): number {
    return this.layerBytes + this.maskBytes + this.compositeBytes;
  }

  chargeLayer(bytes: number): boolean {
    if (this.totalBytes + bytes > this.budgetBytes) {
      this.skippedLayerCount += 1;
      return false;
    }
    this.layerBytes += bytes;
    this.layerCount += 1;
    if (bytes > this.peakLayerBytes) this.peakLayerBytes = bytes;
    return true;
  }

  chargeMask(bytes: number): boolean {
    if (this.totalBytes + bytes > this.budgetBytes) {
      this.droppedMaskCount += 1;
      return false;
    }
    this.maskBytes += bytes;
    return true;
  }

  chargeComposite(bytes: number): boolean {
    if (this.totalBytes + bytes > this.budgetBytes) {
      this.compositeSkipped = true;
      return false;
    }
    this.compositeBytes += bytes;
    return true;
  }

  snapshot(): PsdImportEncodedPngMemory {
    return {
      budgetBytes: this.budgetBytes,
      layerBytes: this.layerBytes,
      maskBytes: this.maskBytes,
      compositeBytes: this.compositeBytes,
      totalBytes: this.totalBytes,
      peakLayerBytes: this.peakLayerBytes,
      layerCount: this.layerCount,
      skippedLayerCount: this.skippedLayerCount,
      droppedMaskCount: this.droppedMaskCount,
      compositeSkipped: this.compositeSkipped,
    };
  }
}

/** 상주 PNG 회계 생성 — 가져오기는 기본 상한으로, 테스트는 작은 상한으로 검증한다. */
export function createPsdEncodedPngAccountant(
  budgetBytes: number = PSD_IMPORT_MAX_ENCODED_PNG_BYTES,
): PsdEncodedPngAccountant {
  return new PsdEncodedPngAccountantImpl(budgetBytes);
}

const PSD_HEADER_BYTES = 26;
const PSD_SIGNATURE = 0x38425053; // ASCII "8BPS"
const PSD_IMPORT_ALTERNATIVES = Object.freeze([
  "Photoshop·Photopea에서 복사본을 8-bit RGB PSD(한 변 30,000px 이하)로 저장",
  "레이어 구조가 중요하면 OpenRaster(.ora), 합성 결과만 필요하면 PNG로 변환",
] as const);

const PSD_COLOR_MODE_LABELS: Readonly<Record<number, string>> = Object.freeze({
  0: "Bitmap",
  1: "Grayscale",
  2: "Indexed",
  3: "RGB",
  4: "CMYK",
  7: "Multichannel",
  8: "Duotone",
  9: "Lab",
});

function psdColorModeLabel(code: number): string {
  return PSD_COLOR_MODE_LABELS[code] ?? `Unknown(${code})`;
}

function psdProfile(
  container: PsdInterchangeContainer,
  width: number,
  height: number,
  channels: number,
  bitsPerChannel: number,
  colorMode: string,
): PsdInterchangeProfile {
  return { container, width, height, channels, bitsPerChannel, colorMode };
}

function psdDecision(
  feature: PsdInterchangeFeature,
  disposition: PsdInterchangeDisposition,
  count: number,
  message: string,
  alternative?: string,
): PsdInterchangeLossDecision {
  return alternative
    ? { feature, disposition, count, message, alternative }
    : { feature, disposition, count, message };
}

/**
 * ag-psd에 전체 파일을 넘기기 전에 공개 PSD/PSB 헤더 26바이트만 독립적으로 읽는다.
 * 대형/고비트/미지원 색 공간 파일을 디코더가 메모리를 할당하기 전에 판별하기 위한 경계다.
 */
export function inspectPsdHeader(buffer: ArrayBuffer): PsdHeaderInfo {
  if (buffer.byteLength < PSD_HEADER_BYTES) {
    throw new Error("PSD 헤더가 26바이트보다 짧아 손상된 파일로 판단했어요.");
  }
  const view = new DataView(buffer, 0, PSD_HEADER_BYTES);
  if (view.getUint32(0, false) !== PSD_SIGNATURE) {
    throw new Error("PSD/PSB 서명(8BPS)을 찾지 못했어요.");
  }
  const version = view.getUint16(4, false);
  if (version !== 1 && version !== 2) {
    throw new Error(`지원하지 않는 Photoshop 문서 버전 ${version}이에요.`);
  }
  for (let offset = 6; offset < 12; offset += 1) {
    if (view.getUint8(offset) !== 0) {
      throw new Error("PSD 예약 헤더 영역이 올바르지 않아 안전하게 열지 않았어요.");
    }
  }
  const channels = view.getUint16(12, false);
  const height = view.getUint32(14, false);
  const width = view.getUint32(18, false);
  const bitsPerChannel = view.getUint16(22, false);
  const colorModeCode = view.getUint16(24, false);
  if (channels < 1 || channels > 56) {
    throw new Error(`PSD 채널 수 ${channels}개는 사양 범위(1~56)를 벗어났어요.`);
  }
  if (width < 1 || height < 1) {
    throw new Error("PSD 캔버스 크기가 비어 있어 안전하게 열 수 없어요.");
  }
  if (![1, 8, 16, 32].includes(bitsPerChannel)) {
    throw new Error(`PSD 채널 비트 깊이 ${bitsPerChannel}bit는 사양 범위를 벗어났어요.`);
  }
  return {
    container: version === 2 ? "psb" : "psd",
    version,
    width,
    height,
    channels,
    bitsPerChannel,
    colorModeCode,
    colorMode: psdColorModeLabel(colorModeCode),
  };
}

/**
 * 실제 디코딩 전 fail-closed 사전검사. ag-psd 자체는 PSB 쓰기/읽기 코드가 존재하지만 Studio의
 * 대형 문서 메모리·왕복 테스트 계약은 아직 PSD에만 있으므로 PSB를 지원한다고 간주하지 않는다.
 */
export function preflightPsdImport(
  buffer: ArrayBuffer,
  fileName = "",
): PsdImportPreflight {
  const header = inspectPsdHeader(buffer);
  const decisions: PsdInterchangeLossDecision[] = [];
  const blockingReasons: string[] = [];
  const extensionClaimsPsb = /\.psb$/iu.test(fileName.trim());
  if (header.container === "psb" || extensionClaimsPsb) {
    blockingReasons.push(
      "PSB(대용량 문서)는 메모리·레이어 왕복 검증이 끝나지 않아 현재 안전하게 열지 않습니다.",
    );
    decisions.push(psdDecision(
      "layers",
      "blocked",
      1,
      "PSB의 64-bit 길이 필드와 대형 레이어 구조는 현재 Studio PSD 경계에서 지원하지 않습니다.",
      PSD_IMPORT_ALTERNATIVES[0],
    ));
  }
  if (header.width > PSD_IMPORT_MAX_DIMENSION_PX || header.height > PSD_IMPORT_MAX_DIMENSION_PX) {
    blockingReasons.push(
      `PSD 캔버스 ${header.width.toLocaleString("ko-KR")}×${header.height.toLocaleString("ko-KR")}px가 안전 한 변 ${PSD_IMPORT_MAX_DIMENSION_PX.toLocaleString("ko-KR")}px를 넘습니다.`,
    );
    decisions.push(psdDecision(
      "resolution",
      "blocked",
      1,
      "캔버스를 나누거나 축소하기 전에는 디코딩하지 않습니다.",
      PSD_IMPORT_ALTERNATIVES[0],
    ));
  }

  const supportedBitDepth =
    header.bitsPerChannel === 8
    || (header.colorModeCode === 0 && header.bitsPerChannel === 1);
  if (!supportedBitDepth) {
    blockingReasons.push(
      `${header.bitsPerChannel}bit PSD는 8-bit Studio 캔버스에서 원본 비트 깊이를 보존할 수 없어 열지 않습니다.`,
    );
    decisions.push(psdDecision(
      "bit-depth",
      "blocked",
      1,
      `${header.bitsPerChannel}bit/channel 데이터를 8-bit로 조용히 절삭하지 않습니다.`,
      PSD_IMPORT_ALTERNATIVES[0],
    ));
  } else {
    decisions.push(psdDecision(
      "bit-depth",
      header.bitsPerChannel === 8 ? "preserved" : "rasterized",
      1,
      header.bitsPerChannel === 8
        ? "8-bit/channel 픽셀 깊이를 유지합니다."
        : "1-bit Bitmap을 8-bit Studio 래스터로 확장합니다.",
    ));
  }

  const supportedColorMode = [0, 1, 2, 3].includes(header.colorModeCode);
  if (!supportedColorMode) {
    blockingReasons.push(
      `${header.colorMode} PSD는 현재 브라우저 디코더에서 신뢰성 있게 변환할 수 없어 열지 않습니다.`,
    );
    decisions.push(psdDecision(
      "color-space",
      "blocked",
      1,
      `${header.colorMode} 채널을 RGB로 조용히 변환하지 않습니다.`,
      PSD_IMPORT_ALTERNATIVES[0],
    ));
  } else {
    decisions.push(psdDecision(
      "color-space",
      "rasterized",
      1,
      header.colorModeCode === 3
        ? "RGB 픽셀은 가져오지만 내장 ICC 프로필은 Studio sRGB 캔버스에 포함되지 않습니다."
        : `${header.colorMode} 픽셀을 Studio sRGB 래스터로 변환합니다.`,
      "색상 관리가 중요한 원본은 PSD와 함께 보관하세요.",
    ));
  }

  return {
    canImport: blockingReasons.length === 0,
    header,
    blockingReasons,
    lossManifest: {
      direction: "import",
      source: header,
      target: psdProfile("studio", header.width, header.height, 4, 8, "sRGB"),
      decisions,
      budgets: {
        maxFileBytes: PSD_IMPORT_MAX_FILE_BYTES,
        maxDecodedBytes: PSD_IMPORT_MAX_DECODED_BYTES,
        maxDimensionPx: PSD_IMPORT_MAX_DIMENSION_PX,
        maxEncodedPngBytes: PSD_IMPORT_MAX_ENCODED_PNG_BYTES,
      },
      alternatives: PSD_IMPORT_ALTERNATIVES,
    },
  };
}

const PSD_READ_OPTIONS: ReadOptions = Object.freeze({
  skipCompositeImageData: false,
  skipThumbnail: true,
  skipLinkedFilesData: true,
  totalMemoryLimit: PSD_IMPORT_MAX_DECODED_BYTES,
});

interface PsdImportLossMetrics {
  maskPreserved: number;
  maskRasterized: number;
  maskDropped: number;
  unsupportedBlendModes: number;
  encodedPngSkippedLayers: number;
  encodedPngDroppedMasks: number;
}

function psdGroupCompositingWarnings(layers: readonly Layer[], ancestors: readonly string[] = []): string[] {
  const warnings: string[] = [];
  for (const layer of layers) {
    if (!isGroupLayer(layer)) continue;
    const path = [...ancestors, layer.name?.trim() || "이름 없는 폴더"];
    const features = [
      layer.blendMode && layer.blendMode !== "pass through" ? `${layer.blendMode} 격리 합성` : null,
      (layer.opacity ?? 1) < 1 ? "그룹 불투명도" : null,
      layer.mask || layer.realMask || layer.vectorMask ? "그룹 마스크" : null,
      layer.effects ? "그룹 효과" : null,
    ].filter(Boolean);
    if (features.length) warnings.push(`${path.join(" / ")}: ${features.join("·")}은 개별 편집 레이어에서 완전히 재현되지 않아요. 원본 외관은 PSD 합성본으로 확인해 주세요.`);
    warnings.push(...psdGroupCompositingWarnings(layer.children, path));
  }
  return warnings;
}

function countPsdGroups(layers: readonly Layer[]): number {
  let count = 0;
  for (const layer of layers) {
    if (!isGroupLayer(layer)) continue;
    count += 1 + countPsdGroups(layer.children);
  }
  return count;
}

function psdImportLossManifest(
  preflight: PsdImportPreflight | null,
  psd: Psd,
  flattened: readonly FlattenedPsdLayer[],
  importedLayerCount: number,
  metrics: PsdImportLossMetrics,
): PsdInterchangeLossManifest {
  const width = Math.max(1, Math.round(psd.width || 0));
  const height = Math.max(1, Math.round(psd.height || 0));
  const fallbackSource = psdProfile("psd", width, height, 4, 8, "RGB");
  const base = preflight?.lossManifest;
  const decisions = [...(base?.decisions ?? [
    psdDecision(
      "bit-depth",
      "preserved",
      1,
      "테스트 주입 경로의 PSD를 8-bit/channel로 처리합니다.",
    ),
    psdDecision(
      "color-space",
      "rasterized",
      1,
      "테스트 주입 경로의 PSD를 Studio sRGB 캔버스로 처리합니다.",
    ),
  ])];
  if (importedLayerCount > 0) {
    decisions.push(psdDecision(
      "layers",
      "preserved",
      importedLayerCount,
      `래스터 레이어 ${importedLayerCount.toLocaleString("ko-KR")}개를 개별 Studio 레이어로 유지합니다.`,
    ));
  }
  const usable = flattened.filter((entry) => entry.skipReason === undefined);
  const originalGroupCount = countPsdGroups(psd.children ?? []);
  const groupCount = new Set(usable.flatMap((entry) => entry.folderPath.map((folder) => folder.id))).size;
  if (groupCount > 0) {
    decisions.push(psdDecision(
      "groups",
      "preserved",
      groupCount,
      `그룹 ${groupCount.toLocaleString("ko-KR")}개의 원본 폴더 경로와 레이어 순서를 유지합니다. Studio에서는 전체 경로명으로 폴더를 표시합니다.`,
    ));
  }
  if (originalGroupCount > groupCount) decisions.push(psdDecision(
    "groups", "dropped", originalGroupCount - groupCount,
    "가져올 픽셀이 없는 빈 폴더는 Studio 폴더로 만들지 않으며 원본 PSD에 보존합니다.",
  ));
  const clippingCount = usable.filter((entry) => entry.layer.clipping).length;
  if (clippingCount > 0) decisions.push(psdDecision(
    "clipping", "preserved", clippingCount, `레이어 ${clippingCount}개의 아래 레이어 클리핑을 유지합니다.`,
  ));
  const textCount = usable.filter((entry) => !!entry.layer.text).length;
  if (textCount > 0) {
    decisions.push(psdDecision(
      "text",
      "rasterized",
      textCount,
      `텍스트 레이어 ${textCount.toLocaleString("ko-KR")}개는 글자 편집 정보 대신 화면 픽셀로 가져오며, 표현 가능한 단일 서식은 숨겨진 문자 편집본을 함께 제공합니다.`,
    ));
  }
  const smartObjectCount = usable.filter((entry) => !!entry.layer.placedLayer).length;
  if (smartObjectCount > 0) {
    decisions.push(psdDecision(
      "smart-object",
      "rasterized",
      smartObjectCount,
      `스마트 오브젝트 ${smartObjectCount.toLocaleString("ko-KR")}개는 연결 원본 대신 미리보기 픽셀로 가져옵니다.`,
      "연결/포함 원본은 원본 PSD에서 별도로 보관하세요.",
    ));
  }
  const adjustmentEntries = flattened.filter((entry) => entry.skipReason === "adjustment");
  const convertedAdjustments = adjustmentEntries.filter(
    (entry) => entry.adjustmentConversion?.status === "converted",
  );
  const unsupportedAdjustments = adjustmentEntries.filter(
    (entry) => entry.adjustmentConversion?.status !== "converted",
  );
  if (convertedAdjustments.length > 0) {
    const kinds = [...new Set(convertedAdjustments.map((entry) =>
      entry.adjustmentConversion?.status === "converted" ? entry.adjustmentConversion.kind : "",
    ))].filter(Boolean).join("·");
    const fidelityCounts: Record<string, number> = {};
    for (const entry of convertedAdjustments) {
      if (entry.adjustmentConversion?.status !== "converted") continue;
      const fidelity = classifyPsdAdjustmentFidelity(entry.adjustmentConversion);
      fidelityCounts[fidelity] = (fidelityCounts[fidelity] ?? 0) + 1;
    }
    const fidelitySummary = (["exact", "approximated", "preserved-only"] as const)
      .filter((fidelity) => (fidelityCounts[fidelity] ?? 0) > 0)
      .map((fidelity) => `${PSD_ADJUSTMENT_FIDELITY_LABELS[fidelity]} ${fidelityCounts[fidelity]}개`)
      .join(" · ");
    const caveat = (fidelityCounts.approximated ?? 0) > 0 || (fidelityCounts["preserved-only"] ?? 0) > 0
      ? " 근사 변환은 픽셀 결과가 원본과 다를 수 있고, 파라미터만 보존한 항목은 픽셀에 적용되지 않습니다."
      : "";
    decisions.push(psdDecision(
      "adjustment-layer",
      "preserved",
      convertedAdjustments.length,
      `조정 레이어 ${convertedAdjustments.length.toLocaleString("ko-KR")}개를 비파괴 파라미터와 함께 Studio 조정 레이어로 복원합니다(${kinds}). 충실도: ${fidelitySummary}.${caveat}`,
    ));
  }
  if (unsupportedAdjustments.length > 0) {
    const reasons = unsupportedAdjustments.map((entry) =>
      entry.adjustmentConversion?.status === "unsupported"
        ? `${entry.adjustmentConversion.psdType}: ${entry.adjustmentConversion.reason}`
        : `${entry.name}: 변환 결과 없음`,
    ).join(" / ");
    decisions.push(psdDecision(
      "adjustment-layer",
      "dropped",
      unsupportedAdjustments.length,
      `변환할 수 없는 조정 레이어 ${unsupportedAdjustments.length.toLocaleString("ko-KR")}개는 가져오지 않습니다 — ${reasons}`,
    ));
  }
  const effectsCount = usable.filter((entry) => !!entry.layer.effects).length;
  if (effectsCount > 0) {
    decisions.push(psdDecision(
      "layer-effects",
      "dropped",
      effectsCount,
      `레이어 스타일 ${effectsCount.toLocaleString("ko-KR")}개는 편집 파라미터와 효과 합성을 가져오지 않습니다.`,
    ));
  }
  if (metrics.maskPreserved > 0) {
    decisions.push(psdDecision(
      "layer-mask",
      "preserved",
      metrics.maskPreserved,
      `래스터 마스크 ${metrics.maskPreserved.toLocaleString("ko-KR")}개를 편집 가능한 무손실 PNG 마스크로 유지합니다.`,
    ));
  }
  if (metrics.maskRasterized > 0) {
    decisions.push(psdDecision(
      "layer-mask",
      "rasterized",
      metrics.maskRasterized,
      `벡터·이중 마스크 ${metrics.maskRasterized.toLocaleString("ko-KR")}개를 단일 래스터 마스크로 합성합니다.`,
    ));
  }
  if (metrics.maskDropped > 0) {
    decisions.push(psdDecision(
      "layer-mask",
      "dropped",
      metrics.maskDropped,
      `픽셀 채널이 없거나 변환에 실패한 마스크 ${metrics.maskDropped.toLocaleString("ko-KR")}개는 적용하지 않습니다.`,
    ));
  }
  if (metrics.encodedPngSkippedLayers > 0) {
    decisions.push(psdDecision(
      "layers",
      "dropped",
      metrics.encodedPngSkippedLayers,
      `인코딩된 PNG 상주 상한(${Math.round(PSD_IMPORT_MAX_ENCODED_PNG_BYTES / 1024 / 1024)}MB)을 넘어 레이어 ${metrics.encodedPngSkippedLayers.toLocaleString("ko-KR")}개를 상주시키지 않았습니다. 원본 PSD에는 보존됩니다.`,
    ));
  }
  if (metrics.encodedPngDroppedMasks > 0) {
    decisions.push(psdDecision(
      "layer-mask",
      "dropped",
      metrics.encodedPngDroppedMasks,
      `인코딩된 PNG 상주 상한을 넘어 마스크 ${metrics.encodedPngDroppedMasks.toLocaleString("ko-KR")}개를 적용하지 않았습니다.`,
    ));
  }
  if (metrics.unsupportedBlendModes > 0) {
    decisions.push(psdDecision(
      "blend-mode",
      "dropped",
      metrics.unsupportedBlendModes,
      `Canvas에 대응하지 않는 블렌드 모드 ${metrics.unsupportedBlendModes.toLocaleString("ko-KR")}개를 일반 합성으로 바꿉니다.`,
    ));
  }
  return {
    direction: "import",
    source: base?.source ?? fallbackSource,
    target: psdProfile("studio", width, height, 4, 8, "sRGB"),
    decisions,
    budgets: base?.budgets ?? {
      maxFileBytes: PSD_IMPORT_MAX_FILE_BYTES,
      maxDecodedBytes: PSD_IMPORT_MAX_DECODED_BYTES,
      maxDimensionPx: PSD_IMPORT_MAX_DIMENSION_PX,
      maxEncodedPngBytes: PSD_IMPORT_MAX_ENCODED_PNG_BYTES,
    },
    alternatives: base?.alternatives ?? PSD_IMPORT_ALTERNATIVES,
  };
}

// ── 메인 진입점 ──────────────────────────────────────────────────────────────

/**
 * .psd 파일을 파싱해 레이어별 이미지 요소 배열로 변환한다.
 * @param file 사용자가 고른 .psd 파일.
 * @param targetWidth 배치될 캔버스 폭(보통 CANVAS_W=720) — PSD 폭에 맞춰 균일 스케일한다.
 * 실패(손상된 파일 등)는 throw한다(한국어 메시지) — exportPagePsd 의 실패 계약과 대칭.
 */
export async function importPsdFile(
  file: File,
  targetWidth: number,
  deps: PsdImportDeps = {},
  options: StudioPsdImportOptions = {},
): Promise<PsdImportResult> {
  throwIfStudioPsdImportAborted(options.signal);
  reportStudioPsdImportProgress(options, "read", 0, 0);
  const readPsdImpl = deps.readPsdImpl ?? readPsd;
  const rasterizeMaskImpl = deps.rasterizeMaskImpl ?? rasterizePsdLayerMasks;

  if (/\.psb$/iu.test(file.name?.trim() ?? "")) {
    throw new Error(
      `PSB(대용량 문서)는 현재 안전하게 열지 않습니다. ${PSD_IMPORT_ALTERNATIVES.join(" 또는 ")}해 주세요.`,
    );
  }
  if (
    typeof file.size === "number"
    && (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > PSD_IMPORT_MAX_FILE_BYTES)
  ) {
    throw new Error(`PSD 파일은 최대 ${PSD_IMPORT_MAX_FILE_BYTES / 1024 / 1024}MB까지 가져올 수 있어요.`);
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch (err) {
    throw new Error(`PSD 파일을 읽지 못했어요: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
  if (buffer.byteLength > PSD_IMPORT_MAX_FILE_BYTES) {
    throw new Error(`PSD 파일은 최대 ${PSD_IMPORT_MAX_FILE_BYTES / 1024 / 1024}MB까지 가져올 수 있어요.`);
  }

  throwIfStudioPsdImportAborted(options.signal);
  let preflight: PsdImportPreflight | null = null;
  // readPsdImpl만 주입한 기존 테스트 픽스처에는 실제 26-byte 헤더가 없다. 프로덕션은 주입이
  // 없으므로 반드시 헤더 사전검사를 통과해야 디코더로 진입한다.
  const inspectHeaderImpl =
    deps.inspectHeaderImpl ?? (deps.readPsdImpl ? null : preflightPsdImport);
  if (inspectHeaderImpl) {
    try {
      preflight = inspectHeaderImpl(buffer, file.name);
    } catch (err) {
      throw new Error(
        `PSD 파일을 해석하지 못했어요: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
    if (!preflight.canImport) {
      throw new Error(
        `${preflight.blockingReasons.join(" ")} ${preflight.lossManifest.alternatives.join(" 또는 ")}해 주세요.`,
      );
    }
  }

  reportStudioPsdImportProgress(options, "decode", 0, 0);
  throwIfStudioPsdImportAborted(options.signal);
  let psd: Psd;
  try {
    psd = readPsdImpl(buffer, PSD_READ_OPTIONS);
  } catch (err) {
    throw new Error(`PSD 파일을 해석하지 못했어요: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }

  throwIfStudioPsdImportAborted(options.signal);
  const sourceWidth = Math.max(1, Math.round(psd.width || 0));
  const sourceHeight = Math.max(1, Math.round(psd.height || 0));
  if (
    preflight
    && (preflight.header.width !== sourceWidth || preflight.header.height !== sourceHeight)
  ) {
    throw new Error(
      `PSD 헤더(${preflight.header.width}×${preflight.header.height}px)와 디코딩 결과(${sourceWidth}×${sourceHeight}px)가 달라 안전하게 열지 않았어요.`,
    );
  }
  const scale = uniformScale(sourceWidth, targetWidth);

  const flattened = flattenPsdLayers(psd);
  const skipped: string[] = [];
  const elements: PsdImportedElement[] = [];
  const editableTextElements: El[] = [];
  const groupWarnings = psdGroupCompositingWarnings(psd.children ?? []);
  skipped.push(...groupWarnings);
  const seenGroupIds = new Set<string>();
  let previousFolderId: string | undefined;
  let groupRunId: string | undefined;
  const lossMetrics: PsdImportLossMetrics = {
    maskPreserved: 0,
    maskRasterized: 0,
    maskDropped: 0,
    unsupportedBlendModes: 0,
    encodedPngSkippedLayers: 0,
    encodedPngDroppedMasks: 0,
  };
  const encodedPng = createPsdEncodedPngAccountant();

  const adjustmentLayers: PsdImportedAdjustmentLayer[] = [];
  const unsupportedAdjustments: PsdAdjustmentUnsupportedInput[] = [];
  let completedLayers = 0;
  reportStudioPsdImportProgress(options, "layers", 0, flattened.length);
  for (const [stackIndex, entry] of flattened.entries()) {
    throwIfStudioPsdImportAborted(options.signal);
    // Let cancel/input events run between batches without reducing source quality.
    if (completedLayers % 4 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    throwIfStudioPsdImportAborted(options.signal);
    reportStudioPsdImportProgress(options, "layers", completedLayers++, flattened.length);
    if (entry.skipReason === "adjustment") {
      const conversion = entry.adjustmentConversion;
      if (conversion?.status === "converted") {
        const restored: PsdImportedAdjustmentLayer = {
          id: createImportedLayerId(),
          name: entry.name,
          kind: conversion.kind,
          parameters: conversion.parameters,
          notes: conversion.notes,
          stackIndex,
        };
        if (entry.opacity < 1) restored.opacity = entry.opacity;
        const blendMode = mapPsdBlendMode(entry.layer.blendMode);
        if (blendMode !== "source-over") restored.blendMode = blendMode;
        if (entry.hidden) restored.hidden = true;
        if (entry.layer.clipping) restored.clipBelow = true;
        if (entry.folderPath.length > 0) restored.psdFolderPath = entry.folderPath;
        // 조정 레이어의 마스크도 래스터 레이어와 같은 경로로 보존한다 — 예전에는
        // 조정 분기가 마스크 처리에 닿기 전에 끝나 마스크 픽셀이 통째로 사라져,
        // 문서에 남은 것은 실물 없는 maskHash뿐이라는 오해가 생겼다. 마스크는
        // 문서 전체 좌표계라 레이어 경계가 아니라 캔버스 크기를 기준으로 삼는다.
        const adjustmentMaskSelection = layerMaskSources(entry.layer);
        const adjustmentMaskRasterized =
          !!entry.layer.mask?.fromVectorData
          || !!entry.layer.realMask?.fromVectorData
          || (!!entry.layer.mask && !!entry.layer.realMask);
        for (const warning of maskEditabilityWarnings(entry.layer)) {
          skipped.push(`${entry.name}: ${warning}`);
        }
        if (adjustmentMaskSelection.sources.length > 0) {
          let maskResult: PsdLayerMaskRasterResult;
          try {
            maskResult = await rasterizeMaskImpl({
              layerLeft: entry.left,
              layerTop: entry.top,
              layerPixelWidth: entry.width > 0 ? entry.width : sourceWidth,
              layerPixelHeight: entry.height > 0 ? entry.height : sourceHeight,
              masks: adjustmentMaskSelection.sources,
              fallbackMask: adjustmentMaskSelection.fallbackMask,
              maxWidth: entry.width > 0 ? entry.width : sourceWidth,
            });
          } catch {
            maskResult = {
              warnings: ["마스크 변환에 실패해 조정 레이어를 가리지 않고 가져왔어요."],
            };
          }
          throwIfStudioPsdImportAborted(options.signal);
          if (maskResult.maskSrc && !encodedPng.chargeMask(estimatePsdDataUrlDecodedBytes(maskResult.maskSrc))) {
            lossMetrics.maskDropped += 1;
            skipped.push(`${entry.name}: 인코딩된 PNG 상주 상한을 넘어 마스크를 적용하지 않았어요.`);
          } else if (maskResult.maskSrc) {
            restored.maskSrc = maskResult.maskSrc;
            if (maskResult.disabled) restored.maskEnabled = false;
            if (adjustmentMaskRasterized) lossMetrics.maskRasterized += 1;
            else lossMetrics.maskPreserved += 1;
          } else {
            lossMetrics.maskDropped += 1;
          }
          for (const warning of maskResult.warnings) skipped.push(`${entry.name}: ${warning}`);
        } else if (entry.layer.vectorMask) {
          lossMetrics.maskDropped += 1;
          skipped.push(`${entry.name}: 벡터 전용 마스크는 래스터 픽셀이 없어 조정 레이어를 가리지 않고 가져왔어요.`);
        }
        adjustmentLayers.push(restored);
        for (const note of conversion.notes) {
          skipped.push(`${entry.name}: 조정 레이어 변환 메모 — ${note}`);
        }
      } else {
        const reason = conversion?.status === "unsupported"
          ? conversion.reason
          : "변환 결과가 없습니다.";
        const psdType = conversion?.status === "unsupported" ? conversion.psdType : "알 수 없음";
        unsupportedAdjustments.push({ name: entry.name, psdType, reason });
        skipped.push(`${entry.name}: 조정 레이어(${psdType})는 변환할 수 없어 제외됨 — ${reason}`);
      }
      continue;
    }
    if (entry.skipReason === "empty-bounds") {
      skipped.push(`${entry.name}: 크기가 0이라 건너뜀`);
      continue;
    }
    if (entry.skipReason === "no-canvas") {
      skipped.push(`${entry.name}: 이미지 데이터를 찾을 수 없어 건너뜀`);
      continue;
    }

    const canvas = entry.layer.canvas;
    if (!canvas) {
      // flattenPsdLayers 계약상 skipReason 없는 항목은 canvas 가 있어야 하지만, 타입 시스템이 이
      // 불변식을 표현하지 못하므로(Layer.canvas 는 항상 optional) 방어적으로 한 번 더 좁힌다.
      skipped.push(`${entry.name}: 이미지 데이터를 찾을 수 없어 건너뜀`);
      continue;
    }

    let rawDataUrl: string;
    try {
      rawDataUrl = await encodeStudioLosslessCanvasSource(canvas, options.signal);
    } catch {
      throwIfStudioPsdImportAborted(options.signal);
      skipped.push(`${entry.name}: 래스터화 실패로 건너뜀`);
      continue;
    }
    if (!isUsableImageDataUrl(rawDataUrl)) {
      skipped.push(`${entry.name}: 래스터 PNG가 비어 있어 건너뜀`);
      continue;
    }
    if (!encodedPng.chargeLayer(estimatePsdDataUrlDecodedBytes(rawDataUrl))) {
      // 상주 상한 초과 — 전체 가져오기를 버리지 않고 이 레이어만 포기한다.
      skipped.push(`${entry.name}: 인코딩된 PNG 상주 상한(${Math.round(PSD_IMPORT_MAX_ENCODED_PNG_BYTES / 1024 / 1024)}MB)을 넘어 건너뜀`);
      continue;
    }

    // Store the original PNG; placement scale must never downsample document pixels.
    const src = rawDataUrl;
    const sourcePixelWidth = canvas.width || entry.width;
    const sourcePixelHeight = canvas.height || entry.height;
    throwIfStudioPsdImportAborted(options.signal);
    const placement = placementForLayer(
      { left: entry.left, top: entry.top, width: entry.width, height: entry.height },
      sourceWidth,
      targetWidth
    );

    const el: PsdImportedElement = {
      id: createImportedLayerId(),
      type: "image",
      src,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      rotation: 0,
      name: entry.name,
      stackIndex,
    };
    const folderId = entry.folderPath.at(-1)?.id;
    if (folderId !== previousFolderId) {
      groupRunId = folderId && seenGroupIds.has(folderId) ? createImportedLayerId() : folderId;
      if (folderId) seenGroupIds.add(folderId);
      previousFolderId = folderId;
    }
    if (groupRunId) {
      el.groupId = groupRunId;
      el.psdGroupId = groupRunId;
      el.psdFolderPath = entry.folderPath;
    }
    if (entry.layer.clipping) el.clipBelow = true;
    if (entry.opacity < 1) el.opacity = entry.opacity;
    const blendMode = mapPsdBlendMode(entry.layer.blendMode);
    if (blendMode !== "source-over") el.blendMode = blendMode;
    if (
      entry.layer.blendMode
      && entry.layer.blendMode !== "normal"
      && blendMode === "source-over"
    ) {
      lossMetrics.unsupportedBlendModes += 1;
      skipped.push(`${entry.name}: ${entry.layer.blendMode} 블렌드 모드는 일반 합성으로 가져왔어요.`);
    }
    if (entry.hidden) el.hidden = true;

    const maskSelection = layerMaskSources(entry.layer);
    const hasRasterizedVectorOrDualMask =
      !!entry.layer.mask?.fromVectorData
      || !!entry.layer.realMask?.fromVectorData
      || (!!entry.layer.mask && !!entry.layer.realMask);
    const hasDroppedVectorPath =
      !!entry.layer.vectorMask
      && !entry.layer.mask?.fromVectorData
      && !entry.layer.realMask?.fromVectorData;
    for (const warning of maskEditabilityWarnings(entry.layer)) {
      skipped.push(`${entry.name}: ${warning}`);
    }
    if (maskSelection.sources.length > 0) {
      let maskResult: PsdLayerMaskRasterResult;
      try {
        maskResult = await rasterizeMaskImpl({
          layerLeft: entry.left,
          layerTop: entry.top,
          layerPixelWidth: sourcePixelWidth,
          layerPixelHeight: sourcePixelHeight,
          masks: maskSelection.sources,
          fallbackMask: maskSelection.fallbackMask,
          // Keep masks at the same native dimensions as their original layer pixels.
          maxWidth: sourcePixelWidth,
        });
      } catch {
        maskResult = {
          warnings: ["마스크 변환에 실패해 원본 레이어를 가리지 않고 가져왔어요."],
        };
      }
      throwIfStudioPsdImportAborted(options.signal);
      if (maskResult.maskSrc && !encodedPng.chargeMask(estimatePsdDataUrlDecodedBytes(maskResult.maskSrc))) {
        // 상주 상한 초과 — 레이어는 유지하고 마스크만 적용하지 않는다.
        lossMetrics.maskDropped += 1;
        skipped.push(`${entry.name}: 인코딩된 PNG 상주 상한을 넘어 마스크를 적용하지 않았어요.`);
      } else if (maskResult.maskSrc) {
        el.maskSrc = maskResult.maskSrc;
        if (maskResult.disabled) el.maskEnabled = false;
        if (hasRasterizedVectorOrDualMask) lossMetrics.maskRasterized += 1;
        else lossMetrics.maskPreserved += 1;
        if (hasDroppedVectorPath) lossMetrics.maskDropped += 1;
      } else {
        lossMetrics.maskDropped += 1;
      }
      for (const warning of maskResult.warnings) skipped.push(`${entry.name}: ${warning}`);
    } else if (entry.layer.vectorMask) {
      // vector-only masks have no decoded pixel channel for the bounded Canvas bridge.
      lossMetrics.maskDropped += 1;
      skipped.push(`${entry.name}: 벡터 전용 마스크는 래스터 픽셀이 없어 원본 레이어를 가리지 않고 가져왔어요.`);
    }
    elements.push(el);
    const editableText = planStudioPsdEditableText(entry.layer, el, scale, createImportedLayerId);
    if (editableText) editableTextElements.push(editableText);

    // 반영은 하되(원본 그대로 래스터에 이미 포함) 재현되지 않는 부분을 정직하게 고지 — v1 명시적
    // 제외 목록(docs/studio-psd-import-integration.md §1.2)과 1:1 대응.
    if (entry.layer.effects) {
      skipped.push(`${entry.name}: 레이어 스타일(그림자 등)은 반영되지 않아요`);
    }
    if (entry.layer.placedLayer) {
      skipped.push(`${entry.name}: 스마트 오브젝트는 편집 가능한 원본이 아니라 미리보기 이미지로 가져왔어요`);
    }
    if (entry.layer.text) {
      skipped.push(editableText
        ? `${entry.name}: 원본 외관은 이미지로 유지하고 숨겨진 텍스트 편집본을 함께 준비했어요. 글꼴·줄바꿈은 편집본을 켜서 확인해 주세요.`
        : `${entry.name}: 복잡한 문자 서식은 원본 이미지로 유지해요. 문자 편집 정보는 함께 보관한 PSD에서 다시 열 수 있어요`);
    }
  }

  let compositeElement: PsdImportedElement | undefined;
  if (psd.canvas) {
    let src: string | undefined;
    try {
      src = await encodeStudioLosslessCanvasSource(psd.canvas, options.signal);
    } catch {
      // 합성본 인코딩 실패가 성공한 레이어 전체를 버리지 않게 격리한다(레이어 인코딩
      // 실패가 개별 건너뜀인 것과 대칭). 취소는 아래에서 다시 던진다.
      throwIfStudioPsdImportAborted(options.signal);
      skipped.push("PSD 원본 합성본: 래스터화 실패로 건너뜀");
    }
    if (src && isUsableImageDataUrl(src)) {
      if (encodedPng.chargeComposite(estimatePsdDataUrlDecodedBytes(src))) {
        compositeElement = {
          id: createImportedLayerId(), type: "image", src, x: 0, y: 0,
          width: sourceWidth * scale, height: sourceHeight * scale, rotation: 0,
          name: "PSD 원본 합성본",
        };
      } else {
        skipped.push("PSD 원본 합성본: 인코딩된 PNG 상주 상한을 넘어 생략했어요. 레이어는 그대로 가져왔어요.");
      }
    }
  }
  if (groupWarnings.length) lossMetrics.unsupportedBlendModes += groupWarnings.length;
  reportStudioPsdImportProgress(options, "complete", flattened.length, flattened.length);
  if (elements.length === 0 && adjustmentLayers.length === 0 && skipped.length === 0) {
    skipped.push("PSD에서 가져올 레이어를 찾지 못했어요.");
  }

  lossMetrics.encodedPngSkippedLayers = encodedPng.skippedLayerCount;
  lossMetrics.encodedPngDroppedMasks = encodedPng.droppedMaskCount;
  const adjustmentReport = adjustmentLayers.length > 0 || unsupportedAdjustments.length > 0
    ? buildPsdAdjustmentImportReport(adjustmentLayers, unsupportedAdjustments)
    : undefined;
  return {
    layerPixelStorage: "native-png",
    encodedPngMemory: encodedPng.snapshot(),
    elements,
    ...(adjustmentLayers.length > 0 ? { adjustmentLayers } : {}),
    ...(adjustmentReport ? { adjustmentReport } : {}),
    groups: studioGroupsFromPsdElements(elements),
    editableTextElements,
    ...(compositeElement ? { compositeElement } : {}),
    originalFile: file,
    sourceWidth,
    sourceHeight,
    scale,
    skipped,
    lossManifest: psdImportLossManifest(
      preflight,
      psd,
      flattened,
      elements.length,
      lossMetrics,
    ),
  };
}
