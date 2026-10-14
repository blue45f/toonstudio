/**
 * Studio Image Trace — 브라우저 오케스트레이션 (Worker 배선).
 *
 * 기존 브리지(`traceStudioRasterImage`)와 결과·오류 문구가 동일하되, 픽셀 연산
 * (래스터 → 명도 격자 변환 + 색상 레이어 분리)을 모듈 Worker 로 옮긴 경로다.
 * 디코딩·다운스케일(캔버스)과 OpenCV 마스크→패스·DrawEl 조립은 호출 스레드에
 * 남는다 — OpenCV 런타임은 기존 lazy 로드 규약을 그대로 쓰기 때문이다.
 *
 * Worker 를 만들 수 없는 환경(팩토리 실패·준비 시간 초과 — 요청이 게시되기 전에만
 * 발생하는 불가용)에서는 픽셀 버퍼가 전송되지 않은 상태이므로, 실행 방식을 처음부터
 * 다시 고르는 셈으로 direct 실행 1회 폴백한다. 실행 도중의 실패는 매직 완드와 같은
 * 이유로 폴백하지 않고 그대로 전파한다(버퍼가 이미 detach 됐을 수 있다).
 *
 * 샘플→페이지 좌표 변환은 브리지의 `traceSampleToPagePoint` 와 같은 규약이며,
 * `studio-raster-vectorize-product` 가 같은 변환을 복제해 쓰는 선례를 따른다.
 */

import type { DrawEl, El } from "./studio-element-model";
import {
  STUDIO_IMAGE_TRACE_MAX_DIMENSION,
  buildStudioImageTraceSvg,
  studioImageTracePreset,
  traceContoursToPieces,
  tracePathVerbsToContours,
  tracePieceToSvgPathData,
  type StudioImageTracePresetId,
  type StudioImageTraceResult,
  type StudioImageTraceSvgLayer,
} from "./studio-image-trace";
import { studioPathBooleanPieceToDrawElSeed } from "./studio-path-boolean";
import {
  isStudioImageTraceWorkerUnavailableError,
  runStudioImageTraceWorker,
  type StudioImageTraceExecutionMode,
  type StudioImageTraceWorkerClientResult,
} from "./studio-image-trace-worker-client";
import type { StudioImageTraceWorkerRunRequest } from "./studio-image-trace-worker-protocol";
import {
  traceResultToVectorLayer,
  type StudioTraceVectorLayerConversion,
} from "./studio-image-trace-vector-layer";

type StudioTraceableImage = Extract<El, { type: "image" }>;

export interface StudioImageTraceBrowserResult extends StudioImageTraceResult {
  /** 픽셀 연산이 실제로 돈 곳. 불가용 폴백이 일어나면 "direct". */
  readonly execution: "worker" | "direct";
}

export interface StudioImageTraceBrowserOptions {
  readonly signal?: AbortSignal;
  /** 생략하면 Worker 우선 + 불가용 시 direct 폴백. 명시하면 그 방식만 쓴다. */
  readonly executionMode?: StudioImageTraceExecutionMode;
}

function loadTraceBrowserImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("선택한 이미지를 트레이싱용 픽셀로 읽지 못했습니다."));
    image.src = src;
  });
}

/** 샘플 좌표 → 페이지 좌표. 브리지와 같은 규약(뒤집기·회전). */
function traceSampleToPagePoint(
  px: number,
  py: number,
  sampleWidth: number,
  sampleHeight: number,
  image: StudioTraceableImage,
): readonly [number, number] {
  let localX = (px / sampleWidth) * image.width;
  let localY = (py / sampleHeight) * image.height;
  if (image.flipped) localX = image.width - localX;
  if (image.flippedY) localY = image.height - localY;
  const centerX = image.width / 2;
  const centerY = image.height / 2;
  const dx = localX - centerX;
  const dy = localY - centerY;
  const angle = (image.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    image.x + centerX + dx * cos - dy * sin,
    image.y + centerY + dx * sin + dy * cos,
  ];
}

async function runTraceGridJob(
  request: StudioImageTraceWorkerRunRequest,
  options: StudioImageTraceBrowserOptions,
): Promise<StudioImageTraceWorkerClientResult> {
  try {
    return await runStudioImageTraceWorker(request, {
      signal: options.signal,
      executionMode: options.executionMode,
    });
  } catch (error) {
    // 불가용은 요청 게시 전에만 발생해 픽셀 버퍼가 그대로다 — direct 로 1회만 폴백한다.
    if (options.executionMode === undefined && isStudioImageTraceWorkerUnavailableError(error)) {
      return runStudioImageTraceWorker(request, {
        signal: options.signal,
        executionMode: "direct",
      });
    }
    throw error;
  }
}

/**
 * 이미지 요소 1개를 프리셋으로 트레이싱해 채움 DrawEl 조각들과 SVG 를 돌려준다.
 * 결과 계약은 `traceStudioRasterImage` 와 동일하고, 픽셀 연산만 Worker 에서 돈다.
 */
export async function traceStudioRasterImageViaWorker(
  src: string,
  image: StudioTraceableImage,
  presetId: StudioImageTracePresetId,
  options: StudioImageTraceBrowserOptions = {},
): Promise<StudioImageTraceBrowserResult> {
  const preset = studioImageTracePreset(presetId);
  const decoded = await loadTraceBrowserImage(src);
  const sourceWidth = Math.max(1, decoded.naturalWidth || Math.round(image.width));
  const sourceHeight = Math.max(1, decoded.naturalHeight || Math.round(image.height));
  const scale = Math.min(1, STUDIO_IMAGE_TRACE_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("트레이싱용 캔버스를 준비하지 못했습니다.");
  context.clearRect(0, 0, width, height);
  context.drawImage(decoded, 0, 0, width, height);
  let pixels: ImageData;
  try {
    pixels = context.getImageData(0, 0, width, height);
  } catch {
    throw new Error("이미지 픽셀에 접근할 수 없습니다. 외부 이미지라면 먼저 편집 가능한 로컬 사본을 만들어 주세요.");
  }

  const job = await runTraceGridJob(
    { data: pixels.data, width, height, preset },
    options,
  );
  const layers = job.layers;
  if (layers.length === 0) {
    throw new Error("트레이싱할 영역을 찾지 못했습니다. 대비가 더 높은 원본으로 다시 시도해 주세요.");
  }

  const { maskToPathIR } = await import("./studio-opencv-selection");
  const simplifyEps = Math.max(1, preset.simplifyFactor * scale);
  const strokeScale = Math.min(image.width / width, image.height / height);
  const elements: DrawEl[] = [];
  const svgLayers: StudioImageTraceSvgLayer[] = [];
  let contourCount = 0;
  let holeCount = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
    const layer = layers[layerIndex]!;
    const artifact = await maskToPathIR(layer.mask, width, height, simplifyEps);
    contourCount += artifact.contourCount;
    holeCount += artifact.holeCount;
    const contours = tracePathVerbsToContours(artifact.path.verbs).map((contour) => ({
      closed: contour.closed,
      points: contour.points.flatMap((_, index, all) => {
        if (index % 2 !== 0) return [];
        const [x, y] = traceSampleToPagePoint(all[index]!, all[index + 1]!, width, height, image);
        return [x, y];
      }),
    }));
    const traced = traceContoursToPieces(contours);
    if (!traced.ok) continue;
    const pathDataParts: string[] = [];
    traced.pieces.forEach((piece, pieceIndex) => {
      const seed = studioPathBooleanPieceToDrawElSeed(piece, {
        stroke: layer.color,
        strokeWidth: Math.max(1, strokeScale),
        fill: layer.color,
        opacity: image.opacity ?? 1,
      });
      elements.push({
        ...seed,
        id: `traced-${image.id}-${Date.now().toString(36)}-${layerIndex}-${pieceIndex}`,
        groupId: image.groupId,
        name: `${image.name?.trim() || "이미지"} · 트레이싱 ${preset.label} ${layerIndex + 1}-${pieceIndex + 1}`,
      });
      pathDataParts.push(tracePieceToSvgPathData(piece));
      minX = Math.min(minX, piece.bounds.x);
      minY = Math.min(minY, piece.bounds.y);
      maxX = Math.max(maxX, piece.bounds.x + piece.bounds.width);
      maxY = Math.max(maxY, piece.bounds.y + piece.bounds.height);
    });
    const pathData = pathDataParts.filter((part) => part.length > 0).join(" ");
    if (pathData) svgLayers.push({ color: layer.color, pathData });
  }

  if (elements.length === 0) {
    throw new Error("트레이싱할 만큼 뚜렷한 영역을 찾지 못했습니다. 대비가 더 높은 원본으로 다시 시도해 주세요.");
  }
  const svg = buildStudioImageTraceSvg(svgLayers, {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  });
  return Object.freeze({
    elements: Object.freeze(elements),
    svg,
    layerCount: layers.length,
    pieceCount: elements.length,
    contourCount,
    holeCount,
    sampledWidth: width,
    sampledHeight: height,
    execution: job.execution,
  });
}

export interface StudioTraceSourceToVectorLayerInit {
  /** 합성 이미지 요소의 id — 트레이싱 요소 id 의 접두가 된다. */
  readonly id: string;
  readonly name?: string;
  readonly presetId?: StudioImageTracePresetId;
  /** 배치 위치·크기. 생략하면 원본 픽셀 크기로 (0, 0) 배치. */
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly layerId?: string;
  readonly layerName?: string;
  readonly signal?: AbortSignal;
}

export interface StudioTraceSourceToVectorLayerResult extends StudioTraceVectorLayerConversion {
  readonly trace: StudioImageTraceBrowserResult;
}

/**
 * 아직 캔버스에 놓이지 않은 이미지(소재 URL)를 바로 벡터 레이어로 변환한다.
 * 소재 가져오기 표면이 "벡터로 변환해 추가" 동작을 구현할 때 쓰는 한 번의 호출 —
 * 합성 이미지 요소로 트레이싱한 뒤 결과를 벡터 레이어로 주입해 돌려준다.
 */
export async function traceStudioImageSourceToVectorLayer(
  src: string,
  init: StudioTraceSourceToVectorLayerInit,
): Promise<StudioTraceSourceToVectorLayerResult> {
  const decoded = await loadTraceBrowserImage(src);
  const naturalWidth = Math.max(1, decoded.naturalWidth || Math.round(init.width ?? 0) || 1);
  const naturalHeight = Math.max(1, decoded.naturalHeight || Math.round(init.height ?? 0) || 1);
  const image = {
    id: init.id,
    type: "image",
    src,
    x: init.x ?? 0,
    y: init.y ?? 0,
    width: init.width ?? naturalWidth,
    height: init.height ?? naturalHeight,
    rotation: 0,
    opacity: 1,
    name: init.name,
  } as StudioTraceableImage;
  const trace = await traceStudioRasterImageViaWorker(src, image, init.presetId ?? "logo", {
    signal: init.signal,
  });
  const conversion = traceResultToVectorLayer(trace, {
    id: init.layerId ?? `traced-vector-${init.id}`,
    name: init.layerName ?? (init.name ? `${init.name} · 벡터 레이어` : undefined),
  });
  return Object.freeze({ ...conversion, trace });
}
