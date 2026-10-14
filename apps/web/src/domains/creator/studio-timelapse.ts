/**
 * Studio Timelapse — 편집 히스토리(pagesHistory)를 빠르게 재생해 "그리기 과정 타임랩스"
 * WebM 영상으로 녹화한다. 새 캡처 인프라를 만들지 않는다:
 *  - 단계 선택/라벨링은 studio-history-labels(순수, 이미 검증됨)를 그대로 재사용.
 *  - 인코딩은 studio-motion-export의 canvas.captureStream()+MediaRecorder 파이프라인 부품
 *    (MIME 선택·비트레이트 추천·캔버스/레코더 어댑터 타입·해상도 프리셋)을 그대로 재사용.
 *
 * 이 파일이 모르는 것: Konva, Stage, React state. 히스토리 스텝 하나를 실제 래스터로 바꾸는 일
 * (setPagesHi → 렌더 대기 → stage.toCanvas)은 캡처 콜백으로 주입받는다(StudioPage 통합 담당).
 */

import {
  MOTION_RESOLUTION_PRESETS,
  isMotionExportSupported,
  materializeExactMotionWebm,
  pickMotionVideoMime,
  recommendVideoBitsPerSecond,
  type MotionCanvasLike,
  type MotionCutImage,
  type MotionRecorderLike,
  type MotionStreamLike,
} from "./export/studio-motion-export";
import { describeHistoryStep, type HistoryPageLike, type HistorySnapshot } from "./studio-history-labels";

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

// ── 재사용(그대로) ───────────────────────────────────────────────────
export const TIMELAPSE_RESOLUTION_PRESETS = MOTION_RESOLUTION_PRESETS;
export const isTimelapseRecordingSupported = isMotionExportSupported;

// ── 단계 선택(페이지별 필터링) ──────────────────────────────────────
export interface TimelapseStepInfo {
  historyIndex: number; // pagesHistory 인덱스
  label: string; // describeHistoryStep 결과(진행 상황 캡션용)
  elementCount: number; // 그 시점 해당 페이지의 요소 수(빈 상태 판정용)
}

/**
 * 문서 전체 히스토리 중 지정한 페이지(pageId)의 내용이 실제로 바뀐 스텝만 오름차순으로 골라낸다.
 * "바뀜" 판정은 참조 비교다 — StudioPage의 모든 페이지 patch 경로(commit/commitCoalesced/
 * commitPages/updateActivePage)는 `pages.map(p => p.id === X ? {...p, ...patch} : p)` 형태라
 * 안 바뀐 페이지는 항상 같은 객체 참조를 유지한다(얕은 비교로 충분·정확).
 * 항상 0번(그 페이지가 존재하는 최초 시점)을 포함하고, 그 페이지가 마지막으로 존재했던 시점도
 * 항상 마지막 항목으로 포함해 영상이 "지금 화면에 보이는 상태"로 끝나게 보장한다.
 * 페이지가 어느 스냅샷에도 없으면(방어적 케이스) 빈 배열. 순수·결정적.
 */
export function selectTimelapsePageSteps(
  history: readonly HistorySnapshot[],
  pageId: string
): TimelapseStepInfo[] {
  const steps: TimelapseStepInfo[] = [];
  let prevPage: HistoryPageLike | undefined;
  let lastExistingIndex = -1;

  for (let i = 0; i < history.length; i++) {
    const page = history[i].find((p) => p.id === pageId);
    if (!page) {
      prevPage = undefined;
      continue;
    }
    lastExistingIndex = i;
    const changed = prevPage === undefined || page !== prevPage;
    if (changed) {
      steps.push({
        historyIndex: i,
        label: describeHistoryStep(i > 0 ? history[i - 1] : null, history[i]),
        elementCount: page.elements.length,
      });
    }
    prevPage = page;
  }

  if (lastExistingIndex >= 0 && steps[steps.length - 1]?.historyIndex !== lastExistingIndex) {
    const page = history[lastExistingIndex].find((p) => p.id === pageId)!;
    steps.push({
      historyIndex: lastExistingIndex,
      label: describeHistoryStep(
        lastExistingIndex > 0 ? history[lastExistingIndex - 1] : null,
        history[lastExistingIndex]
      ),
      elementCount: page.elements.length,
    });
  }
  return steps;
}

/**
 * steps(오름차순)를 최대 maxSteps개로 균등 샘플링(항상 첫/마지막 포함, 반올림 충돌은 dedupe).
 * 히스토리가 아무리 길어도 실제로 "캡처"(비용이 큰 Stage 렌더)할 스텝 수를 이 값으로 상한한다.
 * 순수.
 */
export function thinTimelapseSteps(
  steps: readonly TimelapseStepInfo[],
  maxSteps: number
): TimelapseStepInfo[] {
  const cap = Math.max(1, Math.floor(maxSteps));
  if (steps.length <= cap) return steps.slice();
  if (cap === 1) return [steps[steps.length - 1]];
  const result: TimelapseStepInfo[] = [];
  const lastIdx = steps.length - 1;
  for (let k = 0; k < cap; k++) {
    const idx = Math.round((k * lastIdx) / (cap - 1));
    const step = steps[idx];
    if (result.length === 0 || result[result.length - 1].historyIndex !== step.historyIndex) {
      result.push(step);
    }
  }
  return result;
}

// ── 내보내기 옵션 ────────────────────────────────────────────────────
export interface TimelapseExportOptions {
  width: number;
  height: number;
  fps: number; // 캡처 프레임레이트 — 정지 홀드 위주라 낮아도 충분
  targetDurationSec: number; // 목표 총 길이(프리셋에서 옴)
  minStepHoldSec: number; // 한 단계 최소 표시 시간(너무 빨라 잔상처럼 보이지 않게)
  maxStepHoldSec: number; // 한 단계 최대 표시 시간(단계가 너무 적을 때 지루하게 늘어지지 않게)
  maxDurationSec: number; // 절대 상한(모션 내보내기와 동일 관례) — 넘으면 균등 축소
  maxSteps: number; // 실제 캡처할 최대 단계 수(비용이 큰 Stage 캡처 자체를 상한)
  maxCaptureMemoryBytes: number; // 캡처 래스터 합산 메모리 상한 — 캡처본은 녹화 끝까지 유지되므로 단계 수를 이 상한으로 샘플링
  tailHoldSec: number; // 마지막 프레임 추가 정지(마무리 여운)
}

/** 캡처 래스터 합산 메모리의 기본 상한(256MiB). 모바일 브라우저 탭 메모리 제한을 보수적으로 본 값. */
export const TIMELAPSE_DEFAULT_MAX_CAPTURE_MEMORY_BYTES = 256 * 1024 * 1024;

export const DEFAULT_TIMELAPSE_EXPORT_OPTIONS: TimelapseExportOptions = {
  width: 720,
  height: 1280,
  fps: 12,
  targetDurationSec: 30,
  minStepHoldSec: 0.12,
  maxStepHoldSec: 5,
  maxDurationSec: 90,
  maxSteps: 220,
  maxCaptureMemoryBytes: TIMELAPSE_DEFAULT_MAX_CAPTURE_MEMORY_BYTES,
  tailHoldSec: 1.2,
};

export function normalizeTimelapseExportOptions(
  options?: Partial<TimelapseExportOptions>
): TimelapseExportOptions {
  const o = { ...DEFAULT_TIMELAPSE_EXPORT_OPTIONS, ...options };
  const minHold = clamp(o.minStepHoldSec, 0.03, 3);
  const targetDurationSec = clamp(o.targetDurationSec, 3, 300);
  // maxDurationSec을 명시하지 않은 호출(패널 등)은 기본 상한(90초)이 프리셋 목표를 깎지 않게
  // 목표 길이까지는 상한으로 인정한다. 명시한 호출은 기존대로 상한이 목표보다 우선한다.
  const maxDurationSec =
    options?.maxDurationSec != null
      ? clamp(o.maxDurationSec, 5, 300)
      : clamp(Math.max(o.maxDurationSec, targetDurationSec), 5, 300);
  return {
    width: Math.round(clamp(o.width, 16, 4096)),
    height: Math.round(clamp(o.height, 16, 4096)),
    fps: Math.round(clamp(o.fps, 5, 30)),
    targetDurationSec,
    minStepHoldSec: minHold,
    maxStepHoldSec: clamp(Math.max(o.maxStepHoldSec, minHold), 0.1, 15),
    maxDurationSec,
    maxSteps: Math.round(clamp(o.maxSteps, 8, 500)),
    maxCaptureMemoryBytes: Number.isFinite(o.maxCaptureMemoryBytes)
      ? clamp(Math.round(o.maxCaptureMemoryBytes), 16 * 1024 * 1024, 2 * 1024 * 1024 * 1024)
      : TIMELAPSE_DEFAULT_MAX_CAPTURE_MEMORY_BYTES,
    tailHoldSec: clamp(o.tailHoldSec, 0, 10),
  };
}

export const TIMELAPSE_DURATION_PRESETS = [
  { id: "short", label: "짧게 — 약 15초", targetDurationSec: 15, maxDurationSec: 15 },
  { id: "normal", label: "보통 — 약 30초", targetDurationSec: 30, maxDurationSec: 30 },
  { id: "long", label: "길게 — 약 60초", targetDurationSec: 60, maxDurationSec: 60 },
  { id: "m2", label: "2분 — 약 120초", targetDurationSec: 120, maxDurationSec: 120 },
  { id: "m3", label: "3분 — 약 180초", targetDurationSec: 180, maxDurationSec: 180 },
  { id: "m5", label: "5분 — 약 300초", targetDurationSec: 300, maxDurationSec: 300 },
] as const;

export type TimelapseDurationPreset = (typeof TIMELAPSE_DURATION_PRESETS)[number];

/** 캡처 래스터 1장의 메모리 추정 바이트(RGBA 4B/px). 순수. */
export function estimateTimelapseFrameBytes(width: number, height: number): number {
  const w = Number.isFinite(width) ? Math.max(0, Math.round(width)) : 0;
  const h = Number.isFinite(height) ? Math.max(0, Math.round(height)) : 0;
  return w * h * 4;
}

/**
 * 메모리 상한 안에서 허용되는 최대 캡처 단계 수 — 캡처본 전체를 녹화 끝까지 메모리에
 * 유지하므로, 해상도가 클수록 단계 수를 먼저 줄여(샘플링) 상한을 지킨다. 순수.
 */
export function timelapseMemoryCappedMaxSteps(
  width: number,
  height: number,
  maxSteps: number,
  maxCaptureMemoryBytes: number
): number {
  const stepCap = Math.max(1, Math.floor(maxSteps));
  const perFrame = estimateTimelapseFrameBytes(width, height);
  if (perFrame <= 0 || !Number.isFinite(maxCaptureMemoryBytes) || maxCaptureMemoryBytes <= 0) {
    return stepCap;
  }
  return Math.max(1, Math.min(stepCap, Math.floor(maxCaptureMemoryBytes / perFrame)));
}

// ── 순수 타임라인 플래너 ─────────────────────────────────────────────
export interface TimelapseFrameSegment {
  order: number; // 재생 순번(0부터) — 캡처된 images 배열과 같은 순서
  historyIndex: number; // 원본 pagesHistory 인덱스
  label: string;
  startSec: number;
  endSec: number;
}

export interface TimelapseExportPlan {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  frameCount: number;
  segments: TimelapseFrameSegment[];
  /** 캡처 단계들의 추정 합산 메모리 바이트(출력 해상도 RGBA 기준 보수 추정). planTimelapseExport가 항상 채운다. */
  estimatedCaptureMemoryBytes?: number;
  /** 메모리 상한 샘플링으로 단계 수가 maxSteps만 있을 때보다 더 줄었는지. planTimelapseExport가 항상 채운다. */
  captureMemoryCapped?: boolean;
}

/** steps → 시간 배분 플랜(내부에서 thinTimelapseSteps로 상한 적용). 순수·결정적. */
export function planTimelapseExport(
  steps: readonly TimelapseStepInfo[],
  options?: Partial<TimelapseExportOptions>
): TimelapseExportPlan {
  const o = normalizeTimelapseExportOptions(options);
  const memoryMaxSteps = timelapseMemoryCappedMaxSteps(
    o.width,
    o.height,
    o.maxSteps,
    o.maxCaptureMemoryBytes
  );
  const thinned = thinTimelapseSteps(steps, memoryMaxSteps);
  if (thinned.length === 0) {
    return {
      width: o.width,
      height: o.height,
      fps: o.fps,
      durationSec: 0,
      frameCount: 0,
      segments: [],
      estimatedCaptureMemoryBytes: 0,
      captureMemoryCapped: false,
    };
  }
  const stepHoldSec = clamp(o.targetDurationSec / thinned.length, o.minStepHoldSec, o.maxStepHoldSec);
  const segments: TimelapseFrameSegment[] = thinned.map((step, i) => {
    const startSec = i * stepHoldSec;
    const isLast = i === thinned.length - 1;
    return {
      order: i,
      historyIndex: step.historyIndex,
      label: step.label,
      startSec,
      endSec: startSec + stepHoldSec + (isLast ? o.tailHoldSec : 0),
    };
  });
  let durationSec = segments[segments.length - 1].endSec;
  // 절대 상한(maxDurationSec)을 넘으면 균등 축소한다. 장시간 프리셋이 실제로 상한에
  // 잘리던 문제는 normalizeTimelapseExportOptions가 미명시 상한을 목표 길이까지
  // 인정하는 방식으로 해결했다 — 홀드 클램프·tailHold를 포함한 길이 산정 방식은 유지.
  if (durationSec > o.maxDurationSec) {
    const k = o.maxDurationSec / durationSec;
    for (const s of segments) {
      s.startSec *= k;
      s.endSec *= k;
    }
    durationSec = o.maxDurationSec;
  }
  return {
    width: o.width,
    height: o.height,
    fps: o.fps,
    durationSec,
    frameCount: Math.max(1, Math.ceil(durationSec * o.fps)),
    segments,
    estimatedCaptureMemoryBytes: thinned.length * estimateTimelapseFrameBytes(o.width, o.height),
    captureMemoryCapped: memoryMaxSteps < o.maxSteps && steps.length > memoryMaxSteps,
  };
}

/** 플랜의 시각 t에 표시해야 할 세그먼트. 순수. 빈 플랜이면 null. */
export function timelapseSegmentAt(plan: TimelapseExportPlan, timeSec: number): TimelapseFrameSegment | null {
  if (plan.segments.length === 0) return null;
  const t = clamp(timeSec, 0, plan.durationSec);
  for (const s of plan.segments) {
    if (t < s.endSec) return s;
  }
  return plan.segments[plan.segments.length - 1];
}

// ── 프레임 렌더러(캔버스 2D, contain-fit 레터박스) ────────────────────
/**
 * 영상 우하단에 툰스튜디오 워터마크(반투명 알약 + 흰색 텍스트)를 그린다.
 * 게스트 공유 클립에는 항상 입히고, 로그인 사용자는 공유 시 끌 수 있다.
 * 구형 브라우저의 roundRect 미지원에 대비해 fillRect로 폴백한다. 순수(캔버스 부수효과 제외).
 */
export function drawTimelapseWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string
): void {
  const label = text.trim();
  if (!label || width <= 0 || height <= 0) return;
  const fontSize = Math.max(14, Math.round(Math.min(width, height) / 26));
  const padX = fontSize * 0.9;
  const padY = fontSize * 0.55;
  const margin = Math.max(10, Math.round(Math.min(width, height) * 0.03));
  ctx.save();
  try {
    ctx.font = `700 ${fontSize}px system-ui, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
    ctx.textBaseline = "bottom";
    const textWidth = ctx.measureText(label).width;
    const pillW = textWidth + padX * 2;
    const pillH = fontSize + padY * 2;
    const x = width - margin - pillW;
    const y = height - margin - pillH;
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = "rgba(10,10,14,0.62)";
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(x, y, pillW, pillH, pillH / 2);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, pillW, pillH);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, x + padX, y + pillH - padY);
  } finally {
    ctx.restore();
  }
}

/** 캡처된 래스터를 출력 캔버스에 배경 채우기 + 컨테인-핏으로 그린다(모션 없음, 정지 프레임). */
export function drawTimelapseFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: string,
  image: MotionCutImage | undefined,
  watermark?: TimelapseWatermark | null
): void {
  ctx.globalAlpha = 1;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  if (image) {
    const iw = Math.max(1, image.width);
    const ih = Math.max(1, image.height);
    const fit = Math.min(width / iw, height / ih);
    const dw = iw * fit;
    const dh = ih * fit;
    ctx.drawImage(image.source, (width - dw) / 2, (height - dh) / 2, dw, dh);
  }
  if (watermark) {
    drawTimelapseWatermark(ctx, width, height, watermark.text);
  }
}

// ── 레코더 오케스트레이터(주입형 DOM 어댑터 — MotionExportDeps와 같은 부품 재사용) ────
export interface TimelapseExportDeps {
  createCanvas(width: number, height: number): MotionCanvasLike;
  createRecorder(
    stream: MotionStreamLike,
    options: { mimeType: string; videoBitsPerSecond: number }
  ): MotionRecorderLike;
  isMimeSupported(mime: string): boolean;
  requestFrame(cb: () => void): number;
  cancelFrame(handle: number): void;
  now(): number; // ms
}

export function createDefaultTimelapseExportDeps(): TimelapseExportDeps {
  return {
    createCanvas(width, height) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    },
    createRecorder(stream, options) {
      return new MediaRecorder(stream as MediaStream, options) as unknown as MotionRecorderLike;
    },
    isMimeSupported(mime) {
      return typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function"
        ? MediaRecorder.isTypeSupported(mime)
        : false;
    },
    requestFrame(cb) {
      return requestAnimationFrame(() => cb());
    },
    cancelFrame(handle) {
      cancelAnimationFrame(handle);
    },
    now() {
      return typeof performance !== "undefined" ? performance.now() : Date.now();
    },
  };
}

/**
 * 히스토리 스텝 하나를 실제 캔버스(라이브 Konva Stage)로 렌더해 래스터를 돌려주는 콜백(주입형).
 * StudioPage(통합 담당)가 setPagesHi(historyIndex) → 렌더 대기 → stage.toCanvas({pixelRatio})로
 * 구현한다. targetWidth는 plan.width와 항상 같다(호출부가 매번 명시적으로 넘김 — 클로저에
 * 플랜을 미리 가둘 필요 없이 콜백을 상태 비의존적으로 유지하기 위함).
 * 반드시 순차 호출된다(같은 Stage를 재사용하므로 병렬 호출 금지 — 엔진이 이를 보장한다).
 */
export type TimelapseCaptureStep = (historyIndex: number, targetWidth: number) => Promise<MotionCutImage>;

export interface TimelapseExportProgress {
  phase: "capture" | "record" | "finalize";
  ratio: number; // 0..1 (phase 내부 진행률)
  captured: number; // 캡처 완료된 스텝 수
  total: number; // 전체 스텝 수
  timeSec: number;
  durationSec: number;
}

export interface TimelapseExportResult {
  blob: Blob;
  mimeType: string;
  durationSec: number;
  stepCount: number;
  /** 첫 캡처 프레임(공유 썸네일·포스터용). 인메모리 래스터라 persist하지 않는다. */
  poster: MotionCutImage;
}

/** 타임랩스 영상에 입히는 툰스튜디오 워터마크. null이면 워터마크 없음. */
export interface TimelapseWatermark {
  readonly text: string;
}

export interface TimelapseExportRequest {
  plan: TimelapseExportPlan;
  captureStep: TimelapseCaptureStep;
  background?: string; // 레터박스 배경색(기본 짙은 회흑 — 모션 내보내기와 동일 톤)
  /** 공유 플로우에서만 사용 — 다운로드(저장) 플로우는 기존처럼 워터마크 없이 녹화한다. */
  watermark?: TimelapseWatermark | null;
  /**
   * 캡처 래스터 합산 메모리 상한(바이트). 기본 TIMELAPSE_DEFAULT_MAX_CAPTURE_MEMORY_BYTES.
   * 플래너가 이미 단계 수를 상한에 맞췄지만, 실제 캡처 높이는 페이지 종횡비를 따라
   * 계획 해상도보다 클 수 있어 실행 단계에서도 실측 바이트로 다시 샘플링한다.
   */
  maxCaptureMemoryBytes?: number;
  onProgress?: (progress: TimelapseExportProgress) => void;
  deps?: Partial<TimelapseExportDeps>;
}

export interface TimelapseExportHandle {
  done: Promise<TimelapseExportResult>;
  cancel(): void;
}

export class TimelapseExportCancelledError extends Error {
  constructor() {
    super("타임랩스 녹화를 취소했어요.");
    this.name = "TimelapseExportCancelledError";
  }
}
export function isTimelapseExportCancelled(err: unknown): boolean {
  return err instanceof TimelapseExportCancelledError;
}

export function timelapseExportFileName(title: string): string {
  return `${title.trim() || "toonstudio-timelapse"}-timelapse.webm`;
}

interface TimelapseRunState {
  cancelled: boolean;
  interrupt: (() => void) | null;
}

/**
 * 플랜을 2단계로 실행한다: (1) 순차 캡처 — captureStep을 세그먼트 순서대로 await하며 래스터를
 * 모은다(취소는 각 스텝 사이에서 확인 — 응답성은 한 스텝 지연 이내). 캡처 합산 메모리가
 * 상한(maxCaptureMemoryBytes)을 넘지 않게 중간 단계를 건너뛰는 샘플링이 걸린다. (2) 실시간
 * 녹화 — 캡처된 프레임들을 오프스크린 캔버스에 정지 프레임으로 순서대로 그리며
 * captureStream+MediaRecorder로 인코딩한다(모션 내보내기와 동일 구조). done을 await — 취소 시
 * TimelapseExportCancelledError로 reject(isTimelapseExportCancelled로 판별).
 * 중단 시 부분 파일은 만들지 않는다: 청크는 레코더가 완전히 멈춘 뒤에만 Blob으로 합쳐지고
 * (materializeExactMotionWebm의 컨테이너 검증 포함), 취소 경로는 그 전에 reject되므로
 * 깨진 부분 파일이 사용자에게 전달될 수 없다.
 */
export function startTimelapseExport(request: TimelapseExportRequest): TimelapseExportHandle {
  const deps: TimelapseExportDeps = { ...createDefaultTimelapseExportDeps(), ...request.deps };
  const state: TimelapseRunState = { cancelled: false, interrupt: null };
  return {
    done: runTimelapseExport(request, deps, state),
    cancel() {
      if (state.cancelled) return;
      state.cancelled = true;
      state.interrupt?.();
    },
  };
}

async function runTimelapseExport(
  request: TimelapseExportRequest,
  deps: TimelapseExportDeps,
  state: TimelapseRunState
): Promise<TimelapseExportResult> {
  const { plan } = request;
  if (plan.segments.length === 0 || plan.durationSec <= 0) {
    throw new Error("녹화할 편집 기록이 없어요.");
  }
  const mimeType = pickMotionVideoMime(deps.isMimeSupported);
  if (!mimeType) throw new Error("이 브라우저는 WebM 영상 인코딩을 지원하지 않아요.");

  // ── Phase 1: 캡처(순차) ──
  // 캡처본은 녹화가 끝날 때까지 전부 메모리에 유지되므로, 실측 바이트 합이 상한을 넘지 않게
  // 중간 단계를 건너뛰는 메모리 상한 샘플링을 적용한다. 첫 단계(빈 캔버스/시작 상태)와
  // 마지막 단계(완성 상태)는 상한과 무관하게 항상 캡처해 영상의 시작·끝을 보장한다.
  const memoryCapBytes =
    request.maxCaptureMemoryBytes != null &&
    Number.isFinite(request.maxCaptureMemoryBytes) &&
    request.maxCaptureMemoryBytes > 0
      ? request.maxCaptureMemoryBytes
      : TIMELAPSE_DEFAULT_MAX_CAPTURE_MEMORY_BYTES;
  const images: MotionCutImage[] = [];
  const keptSegments: TimelapseFrameSegment[] = [];
  let capturedBytes = 0;
  let lastFrameBytes = estimateTimelapseFrameBytes(plan.width, plan.height);
  for (let i = 0; i < plan.segments.length; i++) {
    if (state.cancelled) throw new TimelapseExportCancelledError();
    const segment = plan.segments[i];
    const isFirst = i === 0;
    const isLast = i === plan.segments.length - 1;
    if (!isFirst && !isLast && capturedBytes + lastFrameBytes > memoryCapBytes) {
      continue; // 메모리 상한 샘플링 — 이 단계는 건너뛴다(이전 프레임이 그 구간을 대신 표시)
    }
    const image = await request.captureStep(segment.historyIndex, plan.width);
    images.push(image);
    keptSegments.push(segment);
    const frameBytes = estimateTimelapseFrameBytes(image.width, image.height);
    if (frameBytes > 0) lastFrameBytes = frameBytes;
    capturedBytes += frameBytes;
    request.onProgress?.({
      phase: "capture",
      ratio: (i + 1) / plan.segments.length,
      captured: images.length,
      total: plan.segments.length,
      timeSec: 0,
      durationSec: plan.durationSec,
    });
    if (state.cancelled) throw new TimelapseExportCancelledError();
  }
  // 건너뛴 단계가 있으면 order를 images 배열 순서에 맞게 다시 매긴 녹화용 플랜을 쓴다.
  // 총 길이(durationSec)는 그대로 유지한다 — 건너뛴 구간은 timelapseSegmentAt이 다음
  // 세그먼트를 앞당겨 보여주는 방식으로 흡수된다.
  const recordPlan: TimelapseExportPlan =
    keptSegments.length === plan.segments.length
      ? plan
      : { ...plan, segments: keptSegments.map((s, idx) => ({ ...s, order: idx })) };

  // ── Phase 2: 녹화(실시간) ──
  const canvas = deps.createCanvas(recordPlan.width, recordPlan.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스 컨텍스트를 만들지 못했어요.");
  const background = request.background ?? "#101014";
  const watermark = request.watermark ?? null;
  drawTimelapseFrame(ctx, recordPlan.width, recordPlan.height, background, images[0], watermark); // captureStream 전에 첫 프레임 채움

  const stream = canvas.captureStream(recordPlan.fps);
  const chunks: Blob[] = [];
  let recorderError: unknown = null;
  const recorder = deps.createRecorder(stream, {
    mimeType,
    videoBitsPerSecond: recommendVideoBitsPerSecond(recordPlan.width, recordPlan.height, recordPlan.fps),
  });
  let settleStopped: () => void = () => {};
  const stopped = new Promise<void>((resolve) => {
    settleStopped = resolve;
  });
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };
  recorder.onstop = () => settleStopped();
  recorder.onerror = (event) => {
    recorderError = event ?? new Error("recorder error");
    settleStopped();
  };

  let pendingFrame: number | null = null;
  const cleanup = () => {
    if (pendingFrame != null) {
      deps.cancelFrame(pendingFrame);
      pendingFrame = null;
    }
    try {
      recorder.stop();
    } catch {
      // 이미 정지된 레코더 — 무시
    }
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // 이미 종료된 트랙 — 무시
      }
    }
  };

  try {
    if (state.cancelled) throw new TimelapseExportCancelledError();
    recorder.start(500);

    await new Promise<void>((resolve, reject) => {
      const t0 = deps.now();
      state.interrupt = () => {
        if (pendingFrame != null) {
          deps.cancelFrame(pendingFrame);
          pendingFrame = null;
        }
        reject(new TimelapseExportCancelledError());
      };
      const tick = () => {
        pendingFrame = null;
        if (state.cancelled) {
          reject(new TimelapseExportCancelledError());
          return;
        }
        const nowMs = deps.now();
        const elapsedSec = (nowMs - t0) / 1000;
        const timeSec = Math.min(elapsedSec, recordPlan.durationSec);
        const segment = timelapseSegmentAt(recordPlan, timeSec);
        drawTimelapseFrame(
          ctx,
          recordPlan.width,
          recordPlan.height,
          background,
          segment ? images[segment.order] : undefined,
          watermark
        );
        request.onProgress?.({
          phase: "record",
          ratio: clamp01(timeSec / recordPlan.durationSec),
          captured: recordPlan.segments.length,
          total: recordPlan.segments.length,
          timeSec,
          durationSec: recordPlan.durationSec,
        });
        if (elapsedSec >= recordPlan.durationSec) {
          resolve();
          return;
        }
        pendingFrame = deps.requestFrame(tick);
      };
      tick();
    });

    state.interrupt = () => settleStopped();
    request.onProgress?.({
      phase: "finalize",
      ratio: 1,
      captured: recordPlan.segments.length,
      total: recordPlan.segments.length,
      timeSec: recordPlan.durationSec,
      durationSec: recordPlan.durationSec,
    });
    try {
      recorder.stop();
    } catch {
      // 이미 멈춘 레코더 — 무시
    }
    await stopped;
    if (state.cancelled) throw new TimelapseExportCancelledError();
    if (recorderError) throw new Error("영상 인코딩 중 오류가 발생했어요. 다시 시도해주세요.");
    if (chunks.length === 0) throw new Error("녹화된 영상 데이터가 없어요. 다시 시도해주세요.");
    const encoded = await materializeExactMotionWebm(chunks, mimeType, recorder.mimeType ?? "");
    return {
      blob: encoded.blob,
      mimeType: encoded.mimeType,
      durationSec: recordPlan.durationSec,
      stepCount: recordPlan.segments.length,
      poster: images[0],
    };
  } finally {
    state.interrupt = null;
    cleanup();
  }
}
