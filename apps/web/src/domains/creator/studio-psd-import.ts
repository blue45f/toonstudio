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
import {
  StudioPsdImportError,
  type PsdAlternativeCode,
  type PsdBlockingReason,
  type PsdImportSkipEntry,
  type PsdLossDecisionCode,
} from "./studio-psd-import-error";
import {
  resolveStudioPsdBlockedMessage,
  resolveStudioPsdNoConversionResult,
  resolveStudioPsdResultAdjustment,
  resolveStudioPsdResultSkipped,
  resolveStudioPsdResultSummary,
} from "./status-i18n/studio-producer-error-i18n-psd-import";
import type { PsdImportedElement, PsdImportedAdjustmentLayer, PsdImportResult, PsdImportEncodedPngMemory, PsdInterchangeContainer, PsdInterchangeDisposition, PsdInterchangeFeature, PsdInterchangeProfile, PsdInterchangeLossDecision, PsdInterchangeLossManifest, PsdHeaderInfo, PsdImportPreflight, PsdImportDeps, FlattenedPsdLayer, RawFlattenedLeaf } from "./studio-psd-import-types";
import type { StudioPsdFolder } from "./export/studio-psd-folder-structure";

export type { PsdImportedElement, PsdImportedAdjustmentLayer, PsdImportResult, PsdImportEncodedPngMemory, PsdInterchangeContainer, PsdInterchangeDisposition, PsdInterchangeFeature, PsdInterchangeProfile, PsdInterchangeLossDecision, PsdInterchangeLossManifest, PsdHeaderInfo, PsdImportPreflight, PsdImportDeps, FlattenedPsdLayer };
export { StudioPsdImportError } from "./studio-psd-import-error";
export type { PsdAlternativeCode, PsdBlockingReason, PsdBlockingReasonCode, PsdImportSkipCode, PsdImportSkipEntry, PsdLossDecisionCode, StudioPsdImportErrorCode } from "./studio-psd-import-error";


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

/**
 * 결과 요약 한 줄(상태 배너용) — psdExportResultMessage 와 동일한 톤.
 * A4 D4 (R15) 집계자 예외: 반환 타입이 문자열로 고정돼 있어 이 경계 안에서만
 * 리졸버로 해석한다(근사·파라미터만 보존 caveat도 코드로 넘긴다).
 */
export function psdImportResultMessage(result: PsdImportResult): string {
  const parts = [resolveStudioPsdResultSummary(result.elements.length)];
  const report = result.adjustmentReport;
  if (report && report.restored > 0) {
    const caveats: Array<{ code: "approximated" | "preservedOnly"; count: number }> = [];
    if (report.counts.approximated > 0) caveats.push({ code: "approximated", count: report.counts.approximated });
    if (report.counts["preserved-only"] > 0) {
      caveats.push({ code: "preservedOnly", count: report.counts["preserved-only"] });
    }
    parts.push(resolveStudioPsdResultAdjustment(report.restored, caveats));
  }
  if (result.skipped.length > 0) parts.push(resolveStudioPsdResultSkipped(result.skipped.length));
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

function maskEditabilityWarnings(layer: Layer): PsdImportSkipEntry[] {
  const warnings: PsdImportSkipEntry[] = [];
  const rasterizedVectorMask = !!layer.mask?.fromVectorData || !!layer.realMask?.fromVectorData;
  if (rasterizedVectorMask) warnings.push({ code: "maskVectorApprox" });
  if (layer.mask && layer.realMask) {
    warnings.push({ code: "maskDualComposite" });
  } else if (layer.mask && layer.vectorMask && !rasterizedVectorMask) {
    warnings.push({ code: "maskVectorPathExcluded" });
  }
  return warnings;
}

/** 마스크 래스터화 경고(문자열 채널)를 고지 항목으로 바꾼다 — 이 파일의 폴백 토큰은 코드로, 주입·타 모듈 경고는 패스스루로. */
function maskWarningSkipEntry(name: string, warning: string): PsdImportSkipEntry {
  if (warning === "maskAdjustConvertFailed" || warning === "maskLayerConvertFailed") {
    return { code: warning, params: { name } };
  }
  return { code: "passthrough", params: { name, detail: warning } };
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
/** A4 D4 (R15): 대안 문구 자체는 리졸버가 소유하고, 생산자는 코드만 싣는다. */
const PSD_IMPORT_ALTERNATIVES: readonly PsdAlternativeCode[] = Object.freeze([
  "altSaveCopy",
  "altConvert",
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
  code: PsdLossDecisionCode,
  params?: Readonly<Record<string, string>>,
  alternativeCode?: PsdAlternativeCode,
): PsdInterchangeLossDecision {
  return {
    feature,
    disposition,
    count,
    code,
    ...(params !== undefined ? { params } : {}),
    ...(alternativeCode !== undefined ? { alternativeCode } : {}),
  };
}

/**
 * ag-psd에 전체 파일을 넘기기 전에 공개 PSD/PSB 헤더 26바이트만 독립적으로 읽는다.
 * 대형/고비트/미지원 색 공간 파일을 디코더가 메모리를 할당하기 전에 판별하기 위한 경계다.
 */
export function inspectPsdHeader(buffer: ArrayBuffer): PsdHeaderInfo {
  if (buffer.byteLength < PSD_HEADER_BYTES) {
    throw new StudioPsdImportError("headerTooShort");
  }
  const view = new DataView(buffer, 0, PSD_HEADER_BYTES);
  if (view.getUint32(0, false) !== PSD_SIGNATURE) {
    throw new StudioPsdImportError("signatureMissing");
  }
  const version = view.getUint16(4, false);
  if (version !== 1 && version !== 2) {
    throw new StudioPsdImportError("unsupportedVersion", { version: String(version) });
  }
  for (let offset = 6; offset < 12; offset += 1) {
    if (view.getUint8(offset) !== 0) {
      throw new StudioPsdImportError("reservedHeader");
    }
  }
  const channels = view.getUint16(12, false);
  const height = view.getUint32(14, false);
  const width = view.getUint32(18, false);
  const bitsPerChannel = view.getUint16(22, false);
  const colorModeCode = view.getUint16(24, false);
  if (channels < 1 || channels > 56) {
    throw new StudioPsdImportError("channelCount", { channels: String(channels) });
  }
  if (width < 1 || height < 1) {
    throw new StudioPsdImportError("emptyCanvas");
  }
  if (![1, 8, 16, 32].includes(bitsPerChannel)) {
    throw new StudioPsdImportError("bitDepthRange", { bits: String(bitsPerChannel) });
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
  const blockingReasons: PsdBlockingReason[] = [];
  const extensionClaimsPsb = /\.psb$/iu.test(fileName.trim());
  if (header.container === "psb" || extensionClaimsPsb) {
    blockingReasons.push({ code: "blockedPsb" });
    decisions.push(psdDecision("layers", "blocked", 1, "decisionPsbLayers", undefined, PSD_IMPORT_ALTERNATIVES[0]));
  }
  if (header.width > PSD_IMPORT_MAX_DIMENSION_PX || header.height > PSD_IMPORT_MAX_DIMENSION_PX) {
    blockingReasons.push({
      code: "blockedDimension",
      params: {
        width: header.width.toLocaleString("ko-KR"),
        height: header.height.toLocaleString("ko-KR"),
        max: PSD_IMPORT_MAX_DIMENSION_PX.toLocaleString("ko-KR"),
      },
    });
    decisions.push(psdDecision("resolution", "blocked", 1, "decisionResolutionBlocked", undefined, PSD_IMPORT_ALTERNATIVES[0]));
  }

  const supportedBitDepth =
    header.bitsPerChannel === 8
    || (header.colorModeCode === 0 && header.bitsPerChannel === 1);
  if (!supportedBitDepth) {
    blockingReasons.push({ code: "blockedBitDepth", params: { bits: String(header.bitsPerChannel) } });
    decisions.push(psdDecision("bit-depth", "blocked", 1, "decisionBitDepthBlocked", { bits: String(header.bitsPerChannel) }, PSD_IMPORT_ALTERNATIVES[0]));
  } else {
    decisions.push(psdDecision(
      "bit-depth",
      header.bitsPerChannel === 8 ? "preserved" : "rasterized",
      1,
      header.bitsPerChannel === 8 ? "decisionBitDepthPreserved" : "decisionBitDepthRasterized",
    ));
  }

  const supportedColorMode = [0, 1, 2, 3].includes(header.colorModeCode);
  if (!supportedColorMode) {
    blockingReasons.push({ code: "blockedColorMode", params: { colorMode: header.colorMode } });
    decisions.push(psdDecision("color-space", "blocked", 1, "decisionColorSpaceBlocked", { colorMode: header.colorMode }, PSD_IMPORT_ALTERNATIVES[0]));
  } else {
    decisions.push(psdDecision("color-space", "rasterized", 1, header.colorModeCode === 3 ? "decisionColorSpaceRgb" : "decisionColorSpaceConverted", header.colorModeCode === 3 ? undefined : { colorMode: header.colorMode }, "altKeepOriginal"));
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

function psdGroupCompositingWarnings(layers: readonly Layer[], ancestors: readonly string[] = []): PsdImportSkipEntry[] {
  const warnings: PsdImportSkipEntry[] = [];
  for (const layer of layers) {
    if (!isGroupLayer(layer)) continue;
    const path = [...ancestors, layer.name?.trim() || "이름 없는 폴더"];
    const features = [
      layer.blendMode && layer.blendMode !== "pass through" ? "blendMode" : null,
      (layer.opacity ?? 1) < 1 ? "opacity" : null,
      layer.mask || layer.realMask || layer.vectorMask ? "mask" : null,
      layer.effects ? "effects" : null,
    ].filter(Boolean);
    if (features.length) {
      warnings.push({
        code: "groupComposite",
        params: {
          path: path.join(" / "),
          features: features.join("·"),
          ...(layer.blendMode && layer.blendMode !== "pass through" ? { blendMode: layer.blendMode } : {}),
        },
      });
    }
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
    psdDecision("bit-depth", "preserved", 1, "decisionTestBitDepth"),
    psdDecision("color-space", "rasterized", 1, "decisionTestColorSpace"),
  ])];
  if (importedLayerCount > 0) {
    decisions.push(psdDecision("layers", "preserved", importedLayerCount, "decisionLayersPreserved", { count: importedLayerCount.toLocaleString("ko-KR") }));
  }
  const usable = flattened.filter((entry) => entry.skipReason === undefined);
  const originalGroupCount = countPsdGroups(psd.children ?? []);
  const groupCount = new Set(usable.flatMap((entry) => entry.folderPath.map((folder) => folder.id))).size;
  if (groupCount > 0) {
    decisions.push(psdDecision("groups", "preserved", groupCount, "decisionGroupsPreserved", { count: groupCount.toLocaleString("ko-KR") }));
  }
  if (originalGroupCount > groupCount) decisions.push(psdDecision(
    "groups", "dropped", originalGroupCount - groupCount, "decisionGroupsDropped",
  ));
  const clippingCount = usable.filter((entry) => entry.layer.clipping).length;
  if (clippingCount > 0) decisions.push(psdDecision(
    "clipping", "preserved", clippingCount, "decisionClippingPreserved", { count: String(clippingCount) },
  ));
  const textCount = usable.filter((entry) => !!entry.layer.text).length;
  if (textCount > 0) {
    decisions.push(psdDecision("text", "rasterized", textCount, "decisionTextRasterized", { count: textCount.toLocaleString("ko-KR") }));
  }
  const smartObjectCount = usable.filter((entry) => !!entry.layer.placedLayer).length;
  if (smartObjectCount > 0) {
    decisions.push(psdDecision("smart-object", "rasterized", smartObjectCount, "decisionSmartObjectRasterized", { count: smartObjectCount.toLocaleString("ko-KR") }, "altKeepLinked"));
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
      ? "approx"
      : "";
    decisions.push(psdDecision("adjustment-layer", "preserved", convertedAdjustments.length, "decisionAdjustmentPreserved", { count: convertedAdjustments.length.toLocaleString("ko-KR"), kinds, fidelitySummary, caveat }));
  }
  if (unsupportedAdjustments.length > 0) {
    // 사유 합성은 조정 변환 모듈의 동적 문자열 패스스루 — "변환 결과 없음" 조각만 리졸버로 해석한다(집계 합성).
    const reasons = unsupportedAdjustments.map((entry) =>
      entry.adjustmentConversion?.status === "unsupported"
        ? `${entry.adjustmentConversion.psdType}: ${entry.adjustmentConversion.reason}`
        : `${entry.name}: ${resolveStudioPsdNoConversionResult()}`,
    ).join(" / ");
    decisions.push(psdDecision("adjustment-layer", "dropped", unsupportedAdjustments.length, "decisionAdjustmentDropped", { count: unsupportedAdjustments.length.toLocaleString("ko-KR"), reasons }));
  }
  const effectsCount = usable.filter((entry) => !!entry.layer.effects).length;
  if (effectsCount > 0) {
    decisions.push(psdDecision("layer-effects", "dropped", effectsCount, "decisionEffectsDropped", { count: effectsCount.toLocaleString("ko-KR") }));
  }
  if (metrics.maskPreserved > 0) {
    decisions.push(psdDecision("layer-mask", "preserved", metrics.maskPreserved, "decisionMaskPreserved", { count: metrics.maskPreserved.toLocaleString("ko-KR") }));
  }
  if (metrics.maskRasterized > 0) {
    decisions.push(psdDecision("layer-mask", "rasterized", metrics.maskRasterized, "decisionMaskRasterized", { count: metrics.maskRasterized.toLocaleString("ko-KR") }));
  }
  if (metrics.maskDropped > 0) {
    decisions.push(psdDecision("layer-mask", "dropped", metrics.maskDropped, "decisionMaskDropped", { count: metrics.maskDropped.toLocaleString("ko-KR") }));
  }
  if (metrics.encodedPngSkippedLayers > 0) {
    decisions.push(psdDecision("layers", "dropped", metrics.encodedPngSkippedLayers, "decisionEncodedLayersDropped", { budgetMb: String(Math.round(PSD_IMPORT_MAX_ENCODED_PNG_BYTES / 1024 / 1024)), count: metrics.encodedPngSkippedLayers.toLocaleString("ko-KR") }));
  }
  if (metrics.encodedPngDroppedMasks > 0) {
    decisions.push(psdDecision("layer-mask", "dropped", metrics.encodedPngDroppedMasks, "decisionEncodedMasksDropped", { count: metrics.encodedPngDroppedMasks.toLocaleString("ko-KR") }));
  }
  if (metrics.unsupportedBlendModes > 0) {
    decisions.push(psdDecision("blend-mode", "dropped", metrics.unsupportedBlendModes, "decisionBlendModeDropped", { count: metrics.unsupportedBlendModes.toLocaleString("ko-KR") }));
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
    throw new StudioPsdImportError("psbUnsupported", {
      alternative1: PSD_IMPORT_ALTERNATIVES[0],
      alternative2: PSD_IMPORT_ALTERNATIVES[1],
    });
  }
  if (
    typeof file.size === "number"
    && (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > PSD_IMPORT_MAX_FILE_BYTES)
  ) {
    throw new StudioPsdImportError("fileTooLarge", { maxMb: String(PSD_IMPORT_MAX_FILE_BYTES / 1024 / 1024) });
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch (err) {
    throw new StudioPsdImportError("fileReadFailed", { detail: err instanceof Error ? err.message : String(err) }, { cause: err });
  }
  if (buffer.byteLength > PSD_IMPORT_MAX_FILE_BYTES) {
    throw new StudioPsdImportError("fileTooLarge", { maxMb: String(PSD_IMPORT_MAX_FILE_BYTES / 1024 / 1024) });
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
      // 사전검사 자체의 실패(헤더 오류 코드 포함)는 코드째로 감싸 표시 지점에서 해석한다.
      throw new StudioPsdImportError("parseFailed", { detail: err instanceof Error ? err.message : String(err) }, { cause: err });
    }
    if (!preflight.canImport) {
      // 차단 합성은 집계자 예외 — 리졸버가 사유·대안을 현재 언어로 합성한 문자열을 던진다.
      throw new Error(resolveStudioPsdBlockedMessage(preflight));
    }
  }

  reportStudioPsdImportProgress(options, "decode", 0, 0);
  throwIfStudioPsdImportAborted(options.signal);
  let psd: Psd;
  try {
    psd = readPsdImpl(buffer, PSD_READ_OPTIONS);
  } catch (err) {
    throw new StudioPsdImportError("parseFailed", { detail: err instanceof Error ? err.message : String(err) }, { cause: err });
  }

  throwIfStudioPsdImportAborted(options.signal);
  const sourceWidth = Math.max(1, Math.round(psd.width || 0));
  const sourceHeight = Math.max(1, Math.round(psd.height || 0));
  if (
    preflight
    && (preflight.header.width !== sourceWidth || preflight.header.height !== sourceHeight)
  ) {
    throw new StudioPsdImportError("headerMismatch", {
      headerWidth: String(preflight.header.width),
      headerHeight: String(preflight.header.height),
      width: String(sourceWidth),
      height: String(sourceHeight),
    });
  }
  const scale = uniformScale(sourceWidth, targetWidth);

  const flattened = flattenPsdLayers(psd);
  const skipped: PsdImportSkipEntry[] = [];
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
          skipped.push({ code: warning.code, params: { name: entry.name } });
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
            maskResult = { warnings: ["maskAdjustConvertFailed"] };
          }
          throwIfStudioPsdImportAborted(options.signal);
          if (maskResult.maskSrc && !encodedPng.chargeMask(estimatePsdDataUrlDecodedBytes(maskResult.maskSrc))) {
            lossMetrics.maskDropped += 1;
            skipped.push({ code: "maskEncodedDropped", params: { name: entry.name } });
          } else if (maskResult.maskSrc) {
            restored.maskSrc = maskResult.maskSrc;
            if (maskResult.disabled) restored.maskEnabled = false;
            if (adjustmentMaskRasterized) lossMetrics.maskRasterized += 1;
            else lossMetrics.maskPreserved += 1;
          } else {
            lossMetrics.maskDropped += 1;
          }
          for (const warning of maskResult.warnings) skipped.push(maskWarningSkipEntry(entry.name, warning));
        } else if (entry.layer.vectorMask) {
          lossMetrics.maskDropped += 1;
          skipped.push({ code: "maskVectorOnlyAdjust", params: { name: entry.name } });
        }
        adjustmentLayers.push(restored);
        for (const note of conversion.notes) {
          skipped.push({ code: "adjustmentNote", params: { name: entry.name, note } });
        }
      } else {
        const reason = conversion?.status === "unsupported"
          ? conversion.reason
          : "변환 결과가 없습니다.";
        const psdType = conversion?.status === "unsupported" ? conversion.psdType : "알 수 없음";
        unsupportedAdjustments.push({ name: entry.name, psdType, reason });
        skipped.push({
          code: "adjustmentUnsupported",
          params: {
            name: entry.name,
            ...(conversion?.status === "unsupported"
              ? { psdType: conversion.psdType, reason: conversion.reason }
              : {}),
          },
        });
      }
      continue;
    }
    if (entry.skipReason === "empty-bounds") {
      skipped.push({ code: "emptyBounds", params: { name: entry.name } });
      continue;
    }
    if (entry.skipReason === "no-canvas") {
      skipped.push({ code: "noCanvas", params: { name: entry.name } });
      continue;
    }

    const canvas = entry.layer.canvas;
    if (!canvas) {
      // flattenPsdLayers 계약상 skipReason 없는 항목은 canvas 가 있어야 하지만, 타입 시스템이 이
      // 불변식을 표현하지 못하므로(Layer.canvas 는 항상 optional) 방어적으로 한 번 더 좁힌다.
      skipped.push({ code: "noCanvas", params: { name: entry.name } });
      continue;
    }

    let rawDataUrl: string;
    try {
      rawDataUrl = await encodeStudioLosslessCanvasSource(canvas, options.signal);
    } catch {
      throwIfStudioPsdImportAborted(options.signal);
      skipped.push({ code: "rasterizeFailed", params: { name: entry.name } });
      continue;
    }
    if (!isUsableImageDataUrl(rawDataUrl)) {
      skipped.push({ code: "emptyPng", params: { name: entry.name } });
      continue;
    }
    if (!encodedPng.chargeLayer(estimatePsdDataUrlDecodedBytes(rawDataUrl))) {
      // 상주 상한 초과 — 전체 가져오기를 버리지 않고 이 레이어만 포기한다.
      skipped.push({
        code: "encodedLayerSkipped",
        params: { name: entry.name, budgetMb: String(Math.round(PSD_IMPORT_MAX_ENCODED_PNG_BYTES / 1024 / 1024)) },
      });
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
      skipped.push({
        code: "blendModeFallback",
        params: { name: entry.name, blendMode: entry.layer.blendMode },
      });
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
      skipped.push({ code: warning.code, params: { name: entry.name } });
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
        maskResult = { warnings: ["maskLayerConvertFailed"] };
      }
      throwIfStudioPsdImportAborted(options.signal);
      if (maskResult.maskSrc && !encodedPng.chargeMask(estimatePsdDataUrlDecodedBytes(maskResult.maskSrc))) {
        // 상주 상한 초과 — 레이어는 유지하고 마스크만 적용하지 않는다.
        lossMetrics.maskDropped += 1;
        skipped.push({ code: "maskEncodedDropped", params: { name: entry.name } });
      } else if (maskResult.maskSrc) {
        el.maskSrc = maskResult.maskSrc;
        if (maskResult.disabled) el.maskEnabled = false;
        if (hasRasterizedVectorOrDualMask) lossMetrics.maskRasterized += 1;
        else lossMetrics.maskPreserved += 1;
        if (hasDroppedVectorPath) lossMetrics.maskDropped += 1;
      } else {
        lossMetrics.maskDropped += 1;
      }
      for (const warning of maskResult.warnings) skipped.push(maskWarningSkipEntry(entry.name, warning));
    } else if (entry.layer.vectorMask) {
      // vector-only masks have no decoded pixel channel for the bounded Canvas bridge.
      lossMetrics.maskDropped += 1;
      skipped.push({ code: "maskVectorOnlyLayer", params: { name: entry.name } });
    }
    elements.push(el);
    const editableText = planStudioPsdEditableText(entry.layer, el, scale, createImportedLayerId);
    if (editableText) editableTextElements.push(editableText);

    // 반영은 하되(원본 그대로 래스터에 이미 포함) 재현되지 않는 부분을 정직하게 고지 — v1 명시적
    // 제외 목록(docs/studio-psd-import-integration.md §1.2)과 1:1 대응.
    if (entry.layer.effects) {
      skipped.push({ code: "effectsNotReflected", params: { name: entry.name } });
    }
    if (entry.layer.placedLayer) {
      skipped.push({ code: "smartObjectPreview", params: { name: entry.name } });
    }
    if (entry.layer.text) {
      skipped.push({
        code: editableText ? "textEditablePrepared" : "textComplexPreserved",
        params: { name: entry.name },
      });
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
      skipped.push({ code: "compositeRasterizeFailed" });
    }
    if (src && isUsableImageDataUrl(src)) {
      if (encodedPng.chargeComposite(estimatePsdDataUrlDecodedBytes(src))) {
        compositeElement = {
          id: createImportedLayerId(), type: "image", src, x: 0, y: 0,
          width: sourceWidth * scale, height: sourceHeight * scale, rotation: 0,
          name: "PSD 원본 합성본",
        };
      } else {
        skipped.push({ code: "compositeEncodedSkipped" });
      }
    }
  }
  if (groupWarnings.length) lossMetrics.unsupportedBlendModes += groupWarnings.length;
  reportStudioPsdImportProgress(options, "complete", flattened.length, flattened.length);
  if (elements.length === 0 && adjustmentLayers.length === 0 && skipped.length === 0) {
    skipped.push({ code: "noLayersFound" });
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
