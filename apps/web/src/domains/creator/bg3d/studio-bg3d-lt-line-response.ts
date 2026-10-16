/**
 * LT 선 반응(주선·재질선) 계산.
 *
 * `studio-bg3d-lt-render.ts` 가 검증한 입력과 설정을 받아 0..255 반응 배열 두 장(주선, 재질선)을 만든다.
 * 흐름은 다음과 같고, 각 단계의 정의와 한계는 docs/features/bg3d-lineart-quality.md 에 있다.
 *
 * 1. 휘도 능선: 흐린 휘도의 Sobel 크기에서 기울기 방향 비최대 억제로 한 픽셀 중심선만 남긴다.
 * 2. 가려진 선 제거(`hiddenLineRemoval`): 깊이가 있으면 앞 물체 경계의 먼 쪽(가려지는 면)에 앉은 능선을 가장
 *    가까운 이웃으로 옮겨 깊이 윤곽과 한 줄로 합친다. 재질선도 먼 쪽 반점은 지운다.
 * 3. 윤곽 계열(알파 윤곽, 깊이 윤곽)과 내부 계열(휘도 능선, 법선 모서리, 깊이 굴곡)을 따로 모은다.
 * 4. 내부선 억제: 내부 계열 농도에 `1 - s × (1 - 윤곽 근접도)` 를 곱한다(꺼져 있으면 곱하지 않는다).
 * 5. 선 폭: 한 픽셀 중심선에 `widthPx` 연속 폭을 칠한다(`studio-bg3d-lt-line-stroke.ts`). 알파 윤곽은 투명 쪽을
 *    그릴 수 없으므로 물체 안쪽으로만 칠한다.
 *
 * 순수 타입 배열 연산이며 입력을 바꾸지 않는다. 한 출력 픽셀이 영향받는 입력 거리(수용 영역)는
 * `STUDIO_BG3D_LT_LINE_RECEPTIVE_FIELD_PX` 에 항목별로 계산해 두었고, 타일 헤일로(12픽셀) 안에 들어와야
 * 타일로 나눠 처리해도 전체 프레임과 같은 결과가 나온다. 단계를 더하면 이 값을 먼저 갱신하고 시험을 확인한다.
 */

import { extractStudioBg3dLtDepthEdgeChannels } from "./studio-bg3d-lt-depth-edges";
import { extractStudioBg3dLtNormalEdges } from "./studio-bg3d-lt-normal-edges";
import {
  extractStudioBg3dLtRidgeField,
  relocateStudioBg3dLtOccludedRidges,
} from "./studio-bg3d-lt-line-ridge";
import { strokeStudioBg3dLtResponse, studioBg3dLtStrokeReach } from "./studio-bg3d-lt-line-stroke";
import { buildStudioBg3dLtOutlineProximity } from "./studio-bg3d-lt-line-suppression";
import {
  boxBlur,
  byteAt,
  clamp01,
  clampedIndex,
  smoothResponse,
} from "./studio-bg3d-lt-raster-math";
import {
  resolveStudioBg3dInteriorSuppression,
  studioBg3dLineNeedsDepth,
  type StudioBg3dLineOutputSettings,
} from "./studio-bg3d-scene-document-types";

import type { StudioBg3dRasterWindow } from "./studio-bg3d-tile-plan";

/** 렌더러가 검증을 마친 입력(구조적으로 `ValidatedInput` 과 같다). */
export interface StudioBg3dLtLineInput {
  readonly window?: StudioBg3dRasterWindow;
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  readonly rgba: Uint8Array | Uint8ClampedArray;
  readonly depth?: Float32Array;
  readonly normalRgba?: Uint8Array | Uint8ClampedArray;
}

export interface StudioBg3dLtLineResponses {
  /** 주선 반응(0..255, 폭을 칠한 뒤). */
  readonly main: Uint8ClampedArray;
  /** 재질선 반응. 재질선이 꺼져 있으면 null. */
  readonly texture: Uint8ClampedArray | null;
}

/**
 * 선 반응이 한 출력 픽셀에 대해 읽는 입력 거리(px)의 최악값. 항목별 근거:
 * - 주선: 휘도 흐림(최대 2) + Sobel 1 + 비최대 억제 1 + 가려진 선 이동 1 + 폭 8 칠하기 도달 거리.
 * - 알파 윤곽: 알파 Sobel 1 + 안쪽 칠하기(폭 `2w - 1` = 15) 도달 거리.
 * - 재질선: 주선 주변 비움 구역(폭 8 칠하기, 주선 중심선 기준) 거리와 휘도 3칸(흐림 2 + 라플라시안 1) 중 큰 쪽에
 *   재질선 칠하기(폭 6) 도달 거리를 더한다.
 */
const BLUR_RADIUS_MAX = 2;
const MAIN_CENTERLINE_PX = BLUR_RADIUS_MAX + 1 + 1 + 1;
const MAIN_PX = MAIN_CENTERLINE_PX + studioBg3dLtStrokeReach(8);
const EXTERIOR_PX = 1 + studioBg3dLtStrokeReach(15);
const TEXTURE_PX =
  Math.max(MAIN_PX, BLUR_RADIUS_MAX + 1) + studioBg3dLtStrokeReach(6);
export const STUDIO_BG3D_LT_LINE_RECEPTIVE_FIELD_PX = Math.max(MAIN_PX, EXTERIOR_PX, TEXTURE_PX);

/** 알파 Sobel 크기(0..1). 가장자리는 가장 가까운 픽셀로 채운다. */
function alphaGradient(input: StudioBg3dLtLineInput, x: number, y: number): number {
  const { rgba, width, height } = input;
  let topLeft: number;
  let top: number;
  let topRight: number;
  let left: number;
  let right: number;
  let bottomLeft: number;
  let bottom: number;
  let bottomRight: number;
  if (x > 0 && y > 0 && x < width - 1 && y < height - 1) {
    const center = y * width + x;
    topLeft = rgba[(center - width - 1) * 4 + 3]!;
    top = rgba[(center - width) * 4 + 3]!;
    topRight = rgba[(center - width + 1) * 4 + 3]!;
    left = rgba[(center - 1) * 4 + 3]!;
    right = rgba[(center + 1) * 4 + 3]!;
    bottomLeft = rgba[(center + width - 1) * 4 + 3]!;
    bottom = rgba[(center + width) * 4 + 3]!;
    bottomRight = rgba[(center + width + 1) * 4 + 3]!;
  } else {
    topLeft = byteAt(rgba, clampedIndex(x - 1, y - 1, width, height), 3);
    top = byteAt(rgba, clampedIndex(x, y - 1, width, height), 3);
    topRight = byteAt(rgba, clampedIndex(x + 1, y - 1, width, height), 3);
    left = byteAt(rgba, clampedIndex(x - 1, y, width, height), 3);
    right = byteAt(rgba, clampedIndex(x + 1, y, width, height), 3);
    bottomLeft = byteAt(rgba, clampedIndex(x - 1, y + 1, width, height), 3);
    bottom = byteAt(rgba, clampedIndex(x, y + 1, width, height), 3);
    bottomRight = byteAt(rgba, clampedIndex(x + 1, y + 1, width, height), 3);
  }
  const horizontal = -topLeft + topRight - 2 * left + 2 * right - bottomLeft + bottomRight;
  const vertical = -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight;
  return clamp01(Math.hypot(horizontal / 255, vertical / 255) / 4);
}

function toByte(value: number): number {
  return Math.round(clamp01(value) * 255);
}

interface MainLineResult {
  /** 폭을 칠하기 전, 내부선 억제를 적용하기 전의 한 픽셀 중심선 반응(재질선이 주선 근처를 비울 때 쓴다). */
  readonly thin: Uint8ClampedArray;
  /** 폭을 칠한 뒤의 주선 반응. */
  readonly response: Uint8ClampedArray;
  /** 깊이 기반 가려진 면 정보. 가려진 선 제거가 꺼져 있거나 깊이가 없으면 null. */
  readonly occlusion: { readonly occluded: Uint8ClampedArray; readonly visibilityByByte: Float32Array } | null;
}

function renderMainLine(
  input: StudioBg3dLtLineInput,
  luminance: Float32Array,
  line: StudioBg3dLineOutputSettings
): MainLineResult {
  const { width, height, pixelCount } = input;
  const smoothingRadius = Math.round(line.smoothing * 2);
  const edgeField = boxBlur(luminance, width, height, smoothingRadius);
  const maximumDimension = Math.max(input.window?.fullWidth ?? width, input.window?.fullHeight ?? height);
  const scaleFactor = line.scaleAwareAccuracy
    ? Math.min(1.35, Math.max(0.65, Math.sqrt(640 / maximumDimension)))
    : 1;
  const threshold = (0.16 - line.accuracy * 0.12) * scaleFactor;
  const softness = 0.22 - line.accuracy * 0.1;
  const depthThreshold = threshold * 0.5;

  const suppression = resolveStudioBg3dInteriorSuppression(line);
  // 깊이는 선 설정이 요구할 때만 쓴다. 깊이 패스만 함께 내보내려고 들어온 깊이가 주선을 바꾸면 안 된다.
  const depth = input.depth && studioBg3dLineNeedsDepth(line) ? input.depth : undefined;
  const depthChannels = depth ? extractStudioBg3dLtDepthEdgeChannels({ width, height, depth }) : null;
  const includeCreases = !line.depthOutlineOnly && !input.normalRgba;

  const ridgeField = extractStudioBg3dLtRidgeField({
    width,
    height,
    field: edgeField,
    rgba: input.rgba,
    floor: threshold,
  });
  let occlusion: MainLineResult["occlusion"] = null;
  if (line.hiddenLineRemoval && depth && depthChannels) {
    const visibilityByByte = new Float32Array(256);
    for (let byte = 0; byte < 256; byte += 1) {
      visibilityByByte[byte] = 1 - smoothResponse(byte / 255, depthThreshold, softness);
    }
    occlusion = { occluded: depthChannels.occluded, visibilityByByte };
    relocateStudioBg3dLtOccludedRidges(ridgeField, {
      width,
      height,
      depth,
      occluded: depthChannels.occluded,
      visibilityByByte,
    });
  }
  const normalResponse =
    line.depthEnabled && !line.depthOutlineOnly && input.normalRgba && input.depth
      ? extractStudioBg3dLtNormalEdges({
          width,
          height,
          normalRgba: input.normalRgba,
          depth: input.depth,
          creaseAngleDegrees: line.creaseAngleDegrees,
        })
      : null;

  const response = new Uint8ClampedArray(pixelCount);
  // 알파 윤곽은 투명 쪽을 그릴 수 없어 가운데를 중심으로 칠하면 보이는 두께가 절반이 된다. 그래서 따로 모아
  // 안쪽으로만 칠한다(아래 `inwardOutlineWidthPx`). 폭 1 이하에서는 그럴 필요가 없다.
  const exteriorThin =
    line.widthPx > 1 && line.exteriorOutlineStrength > 0 ? new Uint8ClampedArray(pixelCount) : null;
  // 억제가 켜져 있을 때만 내부 계열과 윤곽 근거를 따로 보관한다(꺼져 있으면 한 번에 합쳐 메모리를 아낀다).
  const interior = suppression.active ? new Uint8ClampedArray(pixelCount) : null;
  const evidence = suppression.active ? new Uint8ClampedArray(pixelCount) : null;
  const drawDepth = line.depthEnabled && depthChannels !== null;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (input.rgba[index * 4 + 3] === 0) continue;
      const luminanceEdge = ridgeField.ridge[index]
        ? smoothResponse(ridgeField.magnitude[index]!, threshold, softness)
        : 0;
      const exteriorEvidence = smoothResponse(alphaGradient(input, x, y), 0.01, 0.2);
      const exteriorEdge = exteriorEvidence * line.exteriorOutlineStrength;
      let depthContourEvidence = 0;
      let depthContourEdge = 0;
      let depthCreaseEdge = 0;
      if (depthChannels) {
        depthContourEvidence = smoothResponse(depthChannels.contour[index]! / 255, depthThreshold, softness);
        if (drawDepth) {
          depthContourEdge = depthContourEvidence * line.depthStrength;
          if (includeCreases) {
            depthCreaseEdge =
              smoothResponse(depthChannels.crease[index]! / 255, depthThreshold, softness) * line.depthStrength;
          }
        }
      }
      const normalEdge = normalResponse ? (normalResponse[index]! / 255) * line.depthStrength : 0;
      if (exteriorThin) exteriorThin[index] = toByte(exteriorEdge * line.strength);
      const outline = Math.max(exteriorEdge, depthContourEdge);
      const inner = Math.max(luminanceEdge, depthCreaseEdge, normalEdge);
      if (interior && evidence) {
        response[index] = toByte(outline * line.strength);
        interior[index] = toByte(inner * line.strength);
        evidence[index] = toByte(Math.max(exteriorEvidence, depthContourEvidence));
      } else {
        response[index] = toByte(Math.max(outline, inner) * line.strength);
      }
    }
  }

  // 재질선이 주선 옆을 비우는 기준은 억제 전의 주선이다. 억제로 옅어진 선 곁에 재질선이 다시 차오르면 줄이려던
  // 안쪽 선이 도로 늘어난다.
  let unsuppressed: Uint8ClampedArray = response;
  if (interior && evidence) {
    const proximity = buildStudioBg3dLtOutlineProximity(evidence, width, height);
    unsuppressed = new Uint8ClampedArray(pixelCount);
    for (let index = 0; index < pixelCount; index += 1) {
      const value = interior[index]!;
      unsuppressed[index] = Math.max(response[index]!, value);
      if (value === 0) continue;
      const factor = 1 - suppression.strength * (1 - proximity[index]! / 255);
      const kept = Math.round(value * factor);
      if (kept > response[index]!) response[index] = kept;
    }
  }
  const stroked = strokeStudioBg3dLtResponse(response, width, height, line.widthPx);
  if (exteriorThin) {
    const inward = strokeStudioBg3dLtResponse(exteriorThin, width, height, inwardOutlineWidthPx(line.widthPx));
    for (let index = 0; index < pixelCount; index += 1) {
      if (inward[index]! > stroked[index]!) stroked[index] = inward[index]!;
    }
  }
  return { thin: unsuppressed, response: stroked, occlusion };
}

/**
 * 알파 윤곽을 물체 안쪽으로만 칠할 때의 칠하기 폭. 중심선이 물체 가장자리 픽셀에 있고 바깥쪽 절반은 투명이라
 * 잘리므로, 폭 `2w - 1` 로 칠하면 안쪽에 정확히 `w` 픽셀이 남는다(`(2w - 1 + 1) / 2 = w`).
 */
export function inwardOutlineWidthPx(widthPx: number): number {
  return Math.max(widthPx, 2 * widthPx - 1);
}

/** 재질선 폭. 주선보다 약 2px 가늘게 그린다(이전 버전의 "반경 - 1" 규칙을 연속 폭으로 옮긴 것). */
function textureWidthPx(widthPx: number): number {
  return Math.max(1, widthPx - 2);
}

/** 재질선이 주선 근처를 비우는 구역의 폭. 주선보다 2px 넓게, 최소 3px. */
function separationWidthPx(widthPx: number): number {
  return Math.min(8, Math.max(3, widthPx + 2));
}

function renderTextureLine(
  input: StudioBg3dLtLineInput,
  luminance: Float32Array,
  main: MainLineResult,
  line: StudioBg3dLineOutputSettings
): Uint8ClampedArray {
  const { width, height, pixelCount } = input;
  const localAverage = boxBlur(luminance, width, height, line.smoothing > 0.66 ? 2 : 1);
  const suppression = resolveStudioBg3dInteriorSuppression(line);
  // 재질선은 정의상 물체 안쪽 선이다. 윤곽 근접도 예외 없이 억제 강도만큼 줄인다.
  const interiorFactor = suppression.active ? 1 - suppression.strength : 1;
  // 주선 근처를 비우는 구역. 주선은 한 픽셀 중심선을 칠한 것이라 그대로 쓰면 바로 옆에 재질선이 다시 붙는다.
  const separation = strokeStudioBg3dLtResponse(
    main.thin,
    width,
    height,
    separationWidthPx(line.widthPx)
  );
  const response = new Uint8ClampedArray(pixelCount);
  const threshold =
    0.012 +
    (line.creaseAngleDegrees / 180) * 0.2 +
    line.smoothing * 0.025 +
    (1 - line.accuracy) * 0.035;
  const softness = 0.08 + line.smoothing * 0.08;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (input.rgba[index * 4 + 3] === 0) continue;
      const center = luminance[index]!;
      const residual = Math.abs(center - localAverage[index]!) * 3;
      const laplacian = Math.abs(
        center * 4 -
          luminance[clampedIndex(x - 1, y, width, height)]! -
          luminance[clampedIndex(x + 1, y, width, height)]! -
          luminance[clampedIndex(x, y - 1, width, height)]! -
          luminance[clampedIndex(x, y + 1, width, height)]!
      );
      const highFrequency = clamp01(Math.max(residual, laplacian * 0.5));
      const separationFactor = 1 - (separation[index]! / 255) * 0.85;
      const intensity =
        smoothResponse(highFrequency, threshold, softness) *
        separationFactor *
        line.textureLineStrength *
        line.strength *
        interiorFactor *
        (main.occlusion ? main.occlusion.visibilityByByte[main.occlusion.occluded[index]!]! : 1);
      response[index] = toByte(intensity);
    }
  }
  const width2 = textureWidthPx(line.widthPx);
  return width2 > 1
    ? strokeStudioBg3dLtResponse(response, width, height, width2, { diagonalMidpoints: false })
    : response;
}

/**
 * 주선과(켜져 있으면) 재질선 반응을 만든다. `luminance` 는 알파와 무관한 0..1 휘도 장이다.
 */
export function renderStudioBg3dLtLineResponses(
  input: StudioBg3dLtLineInput,
  luminance: Float32Array,
  line: StudioBg3dLineOutputSettings
): StudioBg3dLtLineResponses {
  const main = renderMainLine(input, luminance, line);
  const texture =
    line.textureLineEnabled && line.textureLineStrength > 0
      ? renderTextureLine(input, luminance, main, line)
      : null;
  return { main: main.response, texture };
}
