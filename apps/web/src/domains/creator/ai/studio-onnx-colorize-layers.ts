/**
 * studio-onnx-colorize-layers.ts
 *
 * 기기 채색(Tag2Pix) 결과를 작가가 이어 편집할 수 있는 레이어로 분리한다 —
 * style2paints의 "레이어 분리 PSD 출력" 방식을 이 파이프라인의 합성 수식에
 * 맞춰 차용한 것이다.
 *
 * 합성(`compositeStudioTag2pixColor`)은 모델 색상의 색조·채도를 쓰고 명도만
 * 원본 휘도로 곱하므로, 같은 입력에서 다음 세 레이어가 정확히 도출된다.
 *
 *  - 밑색(Color): 모델 색상을 자기 명도 그대로 되돌린 레이어. 선 아래까지
 *    색이 차 있어 밑색을 다시 칠하는 편집의 출발점이 된다.
 *  - 음영(Shading): 원본 휘도를 회색 맵으로 옮긴 곱하기 레이어. 단, 선으로
 *    볼 어두운 구간은 하한으로 눌러 선화 레이어와 이중으로 어두워지지 않게
 *    한다.
 *  - 선화(Line): 원본을 흰 배경에 합성한 RGB를 그대로 두고, 어두운 정도만큼
 *    알파를 세운 잉크 레이어. 유색 선도 원본 색을 유지한다.
 *
 * 정직성 경계 (만들 수 없는 레이어는 위조하지 않는다):
 *  - 하이라이트는 별도 레이어로 만들지 않는다. 원본 선화에는 하이라이트
 *    정보가 없고 모델의 밝은 영역은 밑색 레이어에 이미 들어 있어, 분리하면
 *    같은 정보의 복제가 된다. 대신 `skipped`에 사유를 기록한다.
 *  - 휘도만으로는 굵은 선과 진한 톤을 구분할 수 없다. 진한 톤의 일부는
 *    선화 레이어의 알파로 들어가지만, 선화 레이어가 원본 RGB를 그대로
 *    들고 있어 정보가 사라지지는 않는다.
 *  - 재합성(미리보기 합성)은 근사다. 곱하기 합성은 HSL 명도 곱셈과
 *    수학적으로 같지 않아서, 원본 톤이 있는 픽셀에서 모델 색이 밝을수록
 *    어긋난다(합성 장면 실측: 휘도 0.88 톤 구간 평균 약 19.6/255). 흰 배경
 *    위 선화라는 표준 입력에서는 거의 정확히 되돌아온다. 자세한 실측은
 *    impl-color-layers.md 기록과 단위 테스트의 오차 계약을 참조한다.
 *    레이어 자체(밑색·선화 RGB·휘도 맵)는 손실 없이 도출된다.
 *
 * PSD 인코딩은 프로젝트 표준인 `ag-psd`(MIT)를 재사용한다.
 */

import { writePsdUint8Array, type BlendMode, type Layer, type Psd } from "ag-psd";

import {
  sampleStudioTag2pixModelColor,
  studioTag2pixHslToRgb,
  studioTag2pixOverWhitePixel,
} from "../studio-onnx-tag2pix";

/* -------------------------------------------------------------------------- */
/* 공개 상수·타입                                                               */
/* -------------------------------------------------------------------------- */

/** 레이어 ID — PSD 패널 순서(위→아래)와 동일하다. */
export type StudioColorizeLayerId = "line" | "shading" | "color";

export const STUDIO_COLORIZE_LAYER_ORDER: readonly StudioColorizeLayerId[] =
  Object.freeze(["line", "shading", "color"]);

export const STUDIO_COLORIZE_LAYER_LABELS: Readonly<Record<StudioColorizeLayerId, string>> =
  Object.freeze({
    line: "01_선화 (Line)",
    shading: "02_음영 (Shading)",
    color: "03_밑색 (Color)",
  });

const STUDIO_COLORIZE_LAYER_BLEND_MODES: Readonly<Record<StudioColorizeLayerId, BlendMode>> =
  Object.freeze({
    line: "normal",
    shading: "multiply",
    color: "normal",
  });

/**
 * 선화 판정 휘도 구간. 이 값 이하의 어두움은 완전한 잉크로, 이상은 잉크가
 * 아닌 것으로 보고 그 사이를 알파 램프로 잇는다. 음영 맵은 이 상한 아래로
 * 내려가지 않아 선 구간이 음영과 선화 양쪽에서 이중으로 어두워지지 않는다.
 * (합성 장면 실측으로 고른 값 — 기록 문서 참조.)
 */
export const STUDIO_COLORIZE_LINE_FULL_LUMINANCE = 0.1;
export const STUDIO_COLORIZE_LINE_FADE_LUMINANCE = 0.55;

/**
 * PSD 예산. 채색 자체는 최대 16,777,216px까지 받지만, 레이어 3장과
 * 무압축 PSD를 메모리에 함께 올리는 내보내기는 절반으로 제한하고
 * 초과분은 오류로 정직하게 안내한다.
 */
export const STUDIO_COLORIZE_LAYER_PSD_MAX_CANVAS_PIXELS = 8_388_608;
export const STUDIO_COLORIZE_LAYER_PSD_MAX_OUTPUT_BYTES = 128 * 1024 * 1024;
export const STUDIO_COLORIZE_LAYER_PSD_MIME = "image/vnd.adobe.photoshop";

export interface StudioColorizeLayerRaster {
  readonly id: StudioColorizeLayerId;
  readonly rgba: Uint8ClampedArray;
}

export interface StudioColorizeLayerSkip {
  readonly layer: "highlight";
  readonly reason: string;
}

export interface StudioColorizeLayerSplit {
  readonly width: number;
  readonly height: number;
  /** PSD 패널 순서(위→아래): 선화 → 음영 → 밑색. */
  readonly layers: readonly StudioColorizeLayerRaster[];
  readonly skipped: readonly StudioColorizeLayerSkip[];
}

export interface SplitStudioColorizeLayersInput {
  /** Tag2Pix 색상 평면 (CHW float, 3×512×512, tanh 범위). */
  readonly colorPlane: Float32Array;
  /** 원본 래스터 RGBA8 — 합성에 쓴 바로 그 버퍼. */
  readonly sourceRgba: Uint8Array | Uint8ClampedArray;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
}

/* -------------------------------------------------------------------------- */
/* 검증                                                                         */
/* -------------------------------------------------------------------------- */

function assertCanvasSize(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) || width < 1 ||
    !Number.isSafeInteger(height) || height < 1
  ) {
    throw new RangeError("레이어 분리 캔버스 크기가 올바르지 않습니다.");
  }
  if (width * height > STUDIO_COLORIZE_LAYER_PSD_MAX_CANVAS_PIXELS) {
    throw new RangeError(
      `레이어 분리 내보내기는 ${STUDIO_COLORIZE_LAYER_PSD_MAX_CANVAS_PIXELS.toLocaleString("ko-KR")}px까지 지원합니다. 더 작은 이미지로 다시 채색해 주세요.`,
    );
  }
}

function assertRgbaShape(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  label: string,
): void {
  if (!(rgba instanceof Uint8ClampedArray) || rgba.length !== width * height * 4) {
    throw new TypeError(`${label} 레이어의 크기가 ${width}×${height}와 맞지 않습니다.`);
  }
}

/* -------------------------------------------------------------------------- */
/* 레이어 분리                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * 채색 합성의 입력(모델 색상 평면 + 원본 래스터)에서 선화/음영/밑색
 * 레이어를 분리한다. 합성과 같은 샘플링 경계를 쓰므로 밑색 레이어는
 * 합성 결과의 색조·채도·모델 명도와 정확히 일치한다.
 */
export function splitStudioColorizeLayers(
  input: SplitStudioColorizeLayersInput,
): StudioColorizeLayerSplit {
  const { colorPlane, sourceRgba, sourceWidth: width, sourceHeight: height } = input;
  assertCanvasSize(width, height);
  if (sourceRgba.length !== width * height * 4) {
    throw new RangeError("원본 RGBA 버퍼 길이가 이미지 크기와 일치하지 않습니다.");
  }

  const pixels = width * height;
  const line = new Uint8ClampedArray(pixels * 4);
  const shading = new Uint8ClampedArray(pixels * 4);
  const color = new Uint8ClampedArray(pixels * 4);
  const ramp = STUDIO_COLORIZE_LINE_FADE_LUMINANCE - STUDIO_COLORIZE_LINE_FULL_LUMINANCE;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = sourceRgba[offset + 3]!;
      const overWhite = studioTag2pixOverWhitePixel(
        sourceRgba[offset]!,
        sourceRgba[offset + 1]!,
        sourceRgba[offset + 2]!,
        alpha,
      );
      const luminance = overWhite.luminance;

      // 밑색: 모델 색상을 자기 명도 그대로. 알파는 원본을 따른다.
      const sample = sampleStudioTag2pixModelColor(colorPlane, x, y, width, height);
      const [cr, cg, cb] = studioTag2pixHslToRgb(sample.h, sample.s, sample.l);
      color[offset] = Math.round(cr * 255);
      color[offset + 1] = Math.round(cg * 255);
      color[offset + 2] = Math.round(cb * 255);
      color[offset + 3] = alpha;

      // 음영: 원본 휘도의 회색 맵. 선 구간은 하한으로 눌러 이중 어두워짐을 막는다.
      const shadeValue = Math.round(
        Math.max(luminance, STUDIO_COLORIZE_LINE_FADE_LUMINANCE) * 255,
      );
      shading[offset] = shadeValue;
      shading[offset + 1] = shadeValue;
      shading[offset + 2] = shadeValue;
      shading[offset + 3] = 255;

      // 선화: 원본 RGB 그대로, 어두운 만큼만 알파를 세운다.
      const ink = Math.min(
        1,
        Math.max(0, (STUDIO_COLORIZE_LINE_FADE_LUMINANCE - luminance) / ramp),
      );
      line[offset] = Math.round(overWhite.r);
      line[offset + 1] = Math.round(overWhite.g);
      line[offset + 2] = Math.round(overWhite.b);
      line[offset + 3] = Math.round(ink * 255);
    }
  }

  return Object.freeze({
    width,
    height,
    layers: Object.freeze([
      Object.freeze({ id: "line", rgba: line }),
      Object.freeze({ id: "shading", rgba: shading }),
      Object.freeze({ id: "color", rgba: color }),
    ] as const),
    skipped: Object.freeze([
      Object.freeze({
        layer: "highlight",
        reason: "하이라이트는 원본 선화에 정보가 없고 모델의 밝은 영역이 밑색 레이어에 이미 들어 있어 별도 레이어로 만들지 않았습니다.",
      }),
    ]),
  });
}

/* -------------------------------------------------------------------------- */
/* 재합성 미리보기 — PSD 합성 이미지와 테스트가 공유하는 근사 합성                 */
/* -------------------------------------------------------------------------- */

/** straight-alpha source-over 합성. */
function compositeSourceOver(
  base: Uint8ClampedArray,
  top: Uint8ClampedArray,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(base.length);
  for (let i = 0; i < base.length; i += 4) {
    const sa = top[i + 3]! / 255;
    const da = base[i + 3]! / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 0) continue;
    out[i] = (top[i]! * sa + base[i]! * da * (1 - sa)) / outA;
    out[i + 1] = (top[i + 1]! * sa + base[i + 1]! * da * (1 - sa)) / outA;
    out[i + 2] = (top[i + 2]! * sa + base[i + 2]! * da * (1 - sa)) / outA;
    out[i + 3] = outA * 255;
  }
  return out;
}

/** multiply 블렌드 합성 (포토샵·클립스튜디오의 곱하기 레이어와 같은 byte 합성). */
function compositeMultiplyBlend(
  base: Uint8ClampedArray,
  shade: Uint8ClampedArray,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(base.length);
  for (let i = 0; i < base.length; i += 4) {
    const sa = shade[i + 3]! / 255;
    const da = base[i + 3]! / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 0) continue;
    for (let c = 0; c < 3; c += 1) {
      const multiplied = (base[i + c]! * shade[i + c]!) / 255;
      out[i + c] = (multiplied * sa + base[i + c]! * da * (1 - sa)) / outA;
    }
    out[i + 3] = outA * 255;
  }
  return out;
}

/**
 * 분리 레이어를 편집 도구와 같은 순서(밑색 → 음영 곱하기 → 선화)로 다시
 * 합친다. 원본 합성의 근사이며, 차이는 선 경계와 진한 톤 구간에 남는다.
 */
export function compositeStudioColorizeLayerPreview(
  width: number,
  height: number,
  layers: readonly StudioColorizeLayerRaster[],
): Uint8ClampedArray {
  assertCanvasSize(width, height);
  const byId = new Map<StudioColorizeLayerId, Uint8ClampedArray>();
  for (const layer of layers) {
    assertRgbaShape(layer.rgba, width, height, STUDIO_COLORIZE_LAYER_LABELS[layer.id]);
    byId.set(layer.id, layer.rgba);
  }
  let canvas = new Uint8ClampedArray(width * height * 4);
  const color = byId.get("color");
  if (color) canvas = compositeSourceOver(canvas, color);
  const shading = byId.get("shading");
  if (shading) canvas = compositeMultiplyBlend(canvas, shading);
  const line = byId.get("line");
  if (line) canvas = compositeSourceOver(canvas, line);
  return canvas;
}

/* -------------------------------------------------------------------------- */
/* PSD 조립 (ag-psd 재사용)                                                     */
/* -------------------------------------------------------------------------- */

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function titleXmp(title: string): string {
  return [
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(title)}</rdf:li></rdf:Alt></dc:title>`,
    "</rdf:Description>",
    "</rdf:RDF>",
    "</x:xmpmeta>",
    '<?xpacket end="w"?>',
  ].join("");
}

export interface BuildStudioColorizeLayerPsdInput {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly layers: readonly StudioColorizeLayerRaster[];
  readonly skipped?: readonly StudioColorizeLayerSkip[];
  /**
   * PSD 합성 이미지(미리보기)용 실제 채색 결과. 없으면 레이어 재합성
   * 근사로 대체한다.
   */
  readonly flattened?: Uint8ClampedArray;
}

export interface StudioColorizeLayerPsdReceipt {
  readonly width: number;
  readonly height: number;
  readonly layerNames: readonly string[];
  readonly skipped: readonly StudioColorizeLayerSkip[];
  readonly byteLength: number;
}

export interface StudioColorizeLayerPsdResult {
  readonly blob: Blob;
  readonly receipt: StudioColorizeLayerPsdReceipt;
}

/**
 * 분리 레이어를 ag-psd로 PSD 파일로 조립한다.
 * `children[0]`이 패널 맨 위이므로 선화→음영→밑색 순서 그대로 넣는다.
 */
export function buildStudioColorizeLayerPsd(
  input: BuildStudioColorizeLayerPsdInput,
): StudioColorizeLayerPsdResult {
  const { width, height } = input;
  assertCanvasSize(width, height);
  const ordered = [...STUDIO_COLORIZE_LAYER_ORDER]
    .map((id) => input.layers.find((layer) => layer.id === id))
    .filter((layer): layer is StudioColorizeLayerRaster => !!layer);
  if (ordered.length === 0) throw new Error("PSD로 저장할 레이어가 없습니다.");
  const seen = new Set<StudioColorizeLayerId>();
  for (const layer of ordered) {
    if (seen.has(layer.id)) throw new TypeError("채색 레이어 ID가 중복되었습니다.");
    seen.add(layer.id);
    assertRgbaShape(layer.rgba, width, height, STUDIO_COLORIZE_LAYER_LABELS[layer.id]);
  }
  if (input.flattened) {
    assertRgbaShape(input.flattened, width, height, "채색 결과 합성본");
  }

  const children: Layer[] = ordered.map((layer) => ({
    name: STUDIO_COLORIZE_LAYER_LABELS[layer.id],
    top: 0,
    left: 0,
    bottom: height,
    right: width,
    opacity: 1,
    blendMode: STUDIO_COLORIZE_LAYER_BLEND_MODES[layer.id],
    hidden: false,
    imageData: { width, height, data: layer.rgba },
  }));

  const psd: Psd = {
    width,
    height,
    children,
    // ag-psd는 레이어를 합성하지 않으므로, 실제 채색 결과를 합성 이미지로 저장한다.
    imageData: {
      width,
      height,
      data: input.flattened ?? compositeStudioColorizeLayerPreview(width, height, ordered),
    },
    imageResources: { xmpMetadata: titleXmp(input.title) },
  };

  let bytes: Uint8Array;
  try {
    bytes = writePsdUint8Array(psd, {
      noBackground: true,
      generateThumbnail: false,
      trimImageData: false,
      compress: false,
    });
  } catch (error) {
    throw new Error(
      `PSD 파일을 만들지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (
    bytes.byteLength < 6 ||
    bytes.byteLength > STUDIO_COLORIZE_LAYER_PSD_MAX_OUTPUT_BYTES ||
    bytes[0] !== 0x38 || bytes[1] !== 0x42 || bytes[2] !== 0x50 || bytes[3] !== 0x53 ||
    bytes[4] !== 0 || bytes[5] !== 1
  ) {
    throw new RangeError("채색 레이어 PSD 결과가 signature, version 또는 출력 예산을 벗어났습니다.");
  }
  const blobBuffer = bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer
    : Uint8Array.from(bytes).buffer;

  return {
    blob: new Blob([blobBuffer], { type: STUDIO_COLORIZE_LAYER_PSD_MIME }),
    receipt: {
      width,
      height,
      layerNames: Object.freeze(children.map((layer) => layer.name ?? "")),
      skipped: Object.freeze([...(input.skipped ?? [])]),
      byteLength: bytes.byteLength,
    },
  };
}

/** 영수증 요약 문구 — 패널 상태 안내용. */
export function studioColorizeLayerPsdMessage(
  receipt: StudioColorizeLayerPsdReceipt,
): string {
  const parts = [`PSD 저장 완료 — 레이어 ${receipt.layerNames.length}개`];
  if (receipt.skipped.length > 0) parts.push(`건너뜀 ${receipt.skipped.length}건`);
  return parts.join(" · ");
}
