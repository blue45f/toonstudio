/**
 * Studio Movie-to-Cel Import — CSP `파일 > 가져오기 > 무비` 동영상 셀 변환 플래너
 * (`planMovieToCelImport`) 및 주입형 비동기 프레임 추출기(`extractVideoFramesWithAdapter`).
 *
 * 특징:
 * - 원본 영상 길이·FPS를 목표 타임라인 FPS로 리샘플링 매핑한다.
 * - `[inSec, outSec]` 트림 구간 클램프, 최대 프레임 상한(`maxFramesCap`) 초과 경고,
 *   규칙적인 셀 명명(`cel_0001`…)을 순수 데이터 플랜으로 생성한다.
 * - 주입형 디코드 어댑터(`VideoFrameDecodeAdapter`)를 통해 DOM `<video>`/WebCodecs에
 *   직접 결합하지 않고 결정적으로 프레임을 추출하며, 동일 원본 프레임 중복 디코드를 캐시한다.
 *
 * REA 근거(clean-room math):
 * - ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
 * - ev_c10045d52f80466e2efbf42d666690099f787c85c31682edf4b202e78622f2f1
 */
import { MAX_ANIM_FRAMES, type StudioAnimFrame } from "../studio-frame-animation";
import { type StudioAnimKeyframe } from "../studio-anim-tracks";

export interface MovieToCelImportPlanInput {
  readonly sourceDurationSec: number;
  readonly sourceFps: number;
  readonly targetTimelineFps: number;
  readonly inSec?: number;
  readonly outSec?: number;
  readonly maxFramesCap?: number;
  readonly celNamePrefix?: string;
  readonly startTimelineFrame?: number;
}

export interface PlannedMovieCelEntry {
  readonly index: number;
  readonly celId: string;
  readonly celName: string;
  readonly timelineFrame: number;
  readonly sampleTimeSec: number;
  readonly sourceFrameIndex: number;
}

export interface MovieToCelImportPlan {
  readonly sourceDurationSec: number;
  readonly sourceFps: number;
  readonly targetTimelineFps: number;
  readonly trimInSec: number;
  readonly trimOutSec: number;
  readonly trimmedDurationSec: number;
  readonly requestedFrameCount: number;
  readonly maxFramesCap: number;
  readonly truncatedByCap: boolean;
  readonly warnings: readonly string[];
  readonly plannedCels: readonly PlannedMovieCelEntry[];
}

export interface DecodedVideoFramePayload {
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

export interface VideoFrameDecodeAdapter {
  decodeFrameAt(
    sampleTimeSec: number,
    sourceFrameIndex: number,
    signal?: AbortSignal,
  ): Promise<DecodedVideoFramePayload>;
  close?(): Promise<void> | void;
}

export interface ExtractVideoFramesOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (completed: number, total: number) => void;
}

export interface ExtractedMovieCelsResult {
  readonly frames: readonly StudioAnimFrame[];
  readonly keyframes: readonly StudioAnimKeyframe[];
  readonly decodedUniqueSourceFrames: number;
  readonly width: number;
  readonly height: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTime(sec: number): number {
  return Math.round(sec * 1_000_000) / 1_000_000;
}

/**
 * 원본 동영상 메타데이터와 트림·목표 FPS로부터 셀 가져오기 실행 계획을 계산한다.
 */
export function planMovieToCelImport(
  input: MovieToCelImportPlanInput,
): MovieToCelImportPlan {
  const sourceDurationSec = Math.max(0, Number.isFinite(input.sourceDurationSec) ? input.sourceDurationSec : 0);
  const sourceFps = clamp(input.sourceFps, 1, 240);
  const targetTimelineFps = Math.round(clamp(input.targetTimelineFps, 1, 60));
  const maxFramesCap = Math.max(1, Math.floor(input.maxFramesCap ?? MAX_ANIM_FRAMES));
  const startTimelineFrame = Math.max(0, Math.floor(input.startTimelineFrame ?? 0));
  const prefix = (input.celNamePrefix ?? "cel_").trim() || "cel_";

  const trimInSec = clamp(input.inSec ?? 0, 0, sourceDurationSec);
  const trimOutSec = clamp(input.outSec ?? sourceDurationSec, trimInSec, sourceDurationSec);
  const trimmedDurationSec = Math.max(0, trimOutSec - trimInSec);

  const warnings: string[] = [];
  if (trimmedDurationSec <= 0) {
    warnings.push("선택한 트림 구간의 길이가 0초여서 가져올 프레임이 없습니다.");
    return {
      sourceDurationSec,
      sourceFps,
      targetTimelineFps,
      trimInSec,
      trimOutSec,
      trimmedDurationSec: 0,
      requestedFrameCount: 0,
      maxFramesCap,
      truncatedByCap: false,
      warnings,
      plannedCels: [],
    };
  }

  if (targetTimelineFps > sourceFps + 1e-6) {
    warnings.push(
      `목표 타임라인 속도(${targetTimelineFps}fps)가 원본 영상 속도(${sourceFps}fps)보다 높아 일부 프레임이 반복 노출됩니다.`,
    );
  }

  const totalSourceFrames = Math.max(1, Math.ceil(sourceDurationSec * sourceFps));
  const rawCount = Math.max(1, Math.floor(trimmedDurationSec * targetTimelineFps + 1e-9));
  const truncatedByCap = rawCount > maxFramesCap;
  const finalCount = Math.min(rawCount, maxFramesCap);

  if (truncatedByCap) {
    warnings.push(
      `요청 구간(${rawCount}장)이 최대 프레임 한도(${maxFramesCap}장)를 초과하여 앞쪽 ${finalCount}장만 가져옵니다.`,
    );
  }

  const padDigits = Math.max(4, String(finalCount).length);
  const plannedCels: PlannedMovieCelEntry[] = [];

  for (let i = 0; i < finalCount; i += 1) {
    const sampleTimeSec = roundTime(
      Math.min(trimOutSec, trimInSec + i / targetTimelineFps),
    );
    const sourceFrameIndex = Math.min(
      totalSourceFrames - 1,
      Math.max(0, Math.floor(sampleTimeSec * sourceFps + 1e-9)),
    );
    const numStr = String(i + 1).padStart(padDigits, "0");
    const celName = `${prefix}${numStr}`;
    plannedCels.push({
      index: i,
      celId: celName,
      celName,
      timelineFrame: startTimelineFrame + i,
      sampleTimeSec,
      sourceFrameIndex,
    });
  }

  return {
    sourceDurationSec,
    sourceFps,
    targetTimelineFps,
    trimInSec,
    trimOutSec,
    trimmedDurationSec: roundTime(trimmedDurationSec),
    requestedFrameCount: rawCount,
    maxFramesCap,
    truncatedByCap,
    warnings,
    plannedCels,
  };
}

/**
 * 주입형 `VideoFrameDecodeAdapter`를 사용해 계획된 동영상 구간을 셀 프레임 배열과 타임라인 키프레임으로 추출한다.
 * 동일 `sourceFrameIndex`는 한 번만 디코드하여 메모리를 절약하고, 종료·취소·실패 시 항상 `adapter.close()`를 호출한다.
 */
export async function extractVideoFramesWithAdapter(
  plan: MovieToCelImportPlan,
  adapter: VideoFrameDecodeAdapter,
  options: ExtractVideoFramesOptions = {},
): Promise<ExtractedMovieCelsResult> {
  const total = plan.plannedCels.length;
  if (total === 0) {
    await adapter.close?.();
    return {
      frames: [],
      keyframes: [],
      decodedUniqueSourceFrames: 0,
      width: 0,
      height: 0,
    };
  }

  const cacheBySourceFrame = new Map<number, DecodedVideoFramePayload>();
  const frames: StudioAnimFrame[] = [];
  const keyframes: StudioAnimKeyframe[] = [];
  const frameDurationMs = Math.max(16, Math.round(1000 / plan.targetTimelineFps));
  let width = 0;
  let height = 0;

  try {
    for (let i = 0; i < total; i += 1) {
      if (options.signal?.aborted) {
        throw new Error("동영상 프레임 가져오기가 사용자에 의해 취소되었습니다.");
      }
      const item = plan.plannedCels[i]!;
      let decoded = cacheBySourceFrame.get(item.sourceFrameIndex);
      if (!decoded) {
        decoded = await adapter.decodeFrameAt(
          item.sampleTimeSec,
          item.sourceFrameIndex,
          options.signal,
        );
        cacheBySourceFrame.set(item.sourceFrameIndex, decoded);
      }
      if (width === 0 && decoded.width > 0) width = decoded.width;
      if (height === 0 && decoded.height > 0) height = decoded.height;

      const animFrame: StudioAnimFrame = {
        id: item.celId,
        src: decoded.src,
        durationMs: frameDurationMs,
      };
      frames.push(animFrame);
      keyframes.push({
        frameIndex: item.timelineFrame,
        frame: animFrame,
      });
      options.onProgress?.(i + 1, total);
    }

    return {
      frames,
      keyframes,
      decodedUniqueSourceFrames: cacheBySourceFrame.size,
      width,
      height,
    };
  } finally {
    await adapter.close?.();
  }
}
