/**
 * 후보 이미지 분석 큐 — 후보를 한 장씩 풀어 특징을 계산하고, 앵커 세트의 특징을 만든다.
 *
 * 상태: current. 점수는 여기서 만들지 않는다. 이 모듈은 이미지에서 특징(`AnchorImageFeatures`)만 뽑고, 앵커와의 점수는
 * 호출자가 `scoreCandidateAgainstAnchors` 로 파생한다(앵커가 바뀌어도 후보를 다시 풀 필요가 없다).
 *
 * 규칙
 * - 후보는 큐 순서대로 한 번에 하나씩 처리한다. 한 장이 실패해도 나머지는 계속한다.
 * - 취소하면 처리 중이던 후보와 남은 후보가 `cancelled` 가 된다. 이미 끝난 후보는 그대로다.
 * - 후보마다 시간 상한이 있다. 넘으면 그 후보만 `timeout` 으로 실패한다.
 * - 오류는 던지지 않고 `onUpdate` 의 패치로 전달한다. 같은 후보를 다시 큐에 넣어 재시도할 수 있다.
 * - 이미지는 이 기기 안에서만 읽고 푼다. 파일 이름은 화면 표시용이며 분석에 쓰지 않는다.
 */

import { ANCHOR_LIMITS, type AnchorAngleId } from "./anchor-capture-spec";
import {
  AnchorCaptureError,
  type AnchorCapturedFrame,
  type AnchorCaptureErrorCode,
} from "./anchor-capture-session";
import { readAnchorImageFile } from "./anchor-frame-sources";
import { extractAnchorFeaturesInBackground } from "./anchor-consistency-client";
import { decodeAnchorRasterInBrowser, type AnchorRasterDecoder } from "./anchor-image-io";
import type { AnchorReferenceFeatures } from "./anchor-consistency-score";
import type { AnchorImageFeatures } from "./anchor-image-features";
import { AnchorFeatureError, type AnchorFeatureErrorCode, type AnchorRaster } from "./anchor-raster";

/** 한 번에 올릴 수 있는 후보 수. 특징은 작지만 미리보기 이미지가 메모리에 남아 상한을 둔다. */
export const ANCHOR_CANDIDATE_LIMITS = Object.freeze({ maxCandidates: 24 });

/** 후보 한 장을 푸는 데 기다리는 최대 시간(ms). */
export const ANCHOR_CANDIDATE_TIMEOUT_MS = 30_000;

export type AnchorCandidateStatus = "queued" | "analyzing" | "done" | "failed" | "cancelled";
export type AnchorCandidateErrorCode = AnchorCaptureErrorCode | AnchorFeatureErrorCode;

export interface AnchorCandidateExtractOptions {
  readonly signal: AbortSignal;
}

export interface AnchorCandidateDeps {
  readonly decode: AnchorRasterDecoder;
  readonly extract: (raster: AnchorRaster, options: AnchorCandidateExtractOptions) => Promise<AnchorImageFeatures>;
}

export const defaultAnchorCandidateDeps: AnchorCandidateDeps = Object.freeze({
  decode: decodeAnchorRasterInBrowser,
  extract: (raster: AnchorRaster, options: AnchorCandidateExtractOptions) =>
    extractAnchorFeaturesInBackground(raster, { signal: options.signal }),
});

export interface AnchorAnalysisResult {
  readonly features: AnchorImageFeatures;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
}

export interface AnchorFailure {
  readonly code: AnchorCandidateErrorCode;
  readonly params: Readonly<Record<string, number>>;
}

/** 던져진 값을 화면이 번역할 수 있는 오류 코드로 바꾼다. 알 수 없는 오류는 `source-failed` 다. */
export function anchorFailureOf(error: unknown, parentAborted: boolean): AnchorFailure {
  if (error instanceof AnchorCaptureError) return { code: error.code, params: error.params };
  if (error instanceof AnchorFeatureError) return { code: error.code, params: {} };
  if (parentAborted) return { code: "cancelled", params: {} };
  return { code: "source-failed", params: {} };
}

/**
 * 파일 한 장을 읽고 풀어 특징을 계산한다. 형식·크기는 풀기 전에 헤더로 검사한다.
 * 문제가 있으면 AnchorCaptureError 또는 AnchorFeatureError 로 이유를 알린다.
 */
export async function analyzeAnchorImageFile(
  file: Blob & { readonly name?: string },
  deps: AnchorCandidateDeps,
  signal: AbortSignal,
): Promise<AnchorAnalysisResult> {
  const frame = await readAnchorImageFile(file, signal);
  if (frame.width * frame.height > ANCHOR_LIMITS.maxPixels) {
    throw new AnchorCaptureError("image-too-large", {
      params: { width: frame.width, height: frame.height, max: ANCHOR_LIMITS.maxEdgePx },
    });
  }
  const raster = await deps.decode({ bytes: frame.bytes, mimeType: frame.mimeType, width: frame.width, height: frame.height }, signal);
  if (signal.aborted) throw new AnchorCaptureError("cancelled");
  const features = await deps.extract(raster, { signal });
  return { features, width: frame.width, height: frame.height, byteLength: frame.bytes.byteLength };
}

/** 앵커 프레임(이미 검증·해시를 마친 바이트)을 풀어 특징을 계산한다. */
export async function analyzeAnchorFrame(
  frame: AnchorCapturedFrame,
  deps: AnchorCandidateDeps,
  signal: AbortSignal,
): Promise<AnchorImageFeatures> {
  const raster = await deps.decode({ bytes: frame.bytes, mimeType: frame.mimeType, width: frame.width, height: frame.height }, signal);
  if (signal.aborted) throw new AnchorCaptureError("cancelled");
  return deps.extract(raster, { signal });
}

export interface AnchorSetFeaturesResult {
  /** 특징을 계산한 앵커(정본 각도 순서는 입력 순서를 따른다). */
  readonly features: readonly AnchorReferenceFeatures[];
  /** 계산하지 못한 각도와 이유. 비어 있으면 모두 계산했다. */
  readonly failed: readonly { readonly angleId: AnchorAngleId; readonly failure: AnchorFailure }[];
}

/**
 * 앵커 세트의 특징을 계산한다. 이미지 해시가 같으면 `cache` 의 결과를 다시 쓴다. 한 각도가 실패해도 나머지는 계속하고,
 * 취소되면 지금까지의 결과 없이 AnchorCaptureError("cancelled") 를 던진다.
 */
export async function extractAnchorSetFeatures(
  frames: readonly AnchorCapturedFrame[],
  deps: AnchorCandidateDeps,
  signal: AbortSignal,
  cache?: Map<string, AnchorImageFeatures>,
): Promise<AnchorSetFeaturesResult> {
  const features: AnchorReferenceFeatures[] = [];
  const failed: { angleId: AnchorAngleId; failure: AnchorFailure }[] = [];
  for (const frame of frames) {
    if (signal.aborted) throw new AnchorCaptureError("cancelled");
    const cached = cache?.get(frame.imageSha256);
    if (cached) {
      features.push({ angleId: frame.angleId, features: cached });
      continue;
    }
    try {
      const extracted = await analyzeAnchorFrame(frame, deps, signal);
      cache?.set(frame.imageSha256, extracted);
      features.push({ angleId: frame.angleId, features: extracted });
    } catch (error) {
      const failure = anchorFailureOf(error, signal.aborted);
      if (failure.code === "cancelled") throw new AnchorCaptureError("cancelled", { cause: error });
      failed.push({ angleId: frame.angleId, failure });
    }
  }
  return Object.freeze({ features: Object.freeze(features), failed: Object.freeze(failed) });
}

export interface AnchorCandidateJob {
  readonly id: string;
  readonly file: Blob & { readonly name?: string };
}

export interface AnchorCandidatePatch {
  readonly status: AnchorCandidateStatus;
  readonly features?: AnchorImageFeatures;
  readonly width?: number;
  readonly height?: number;
  readonly byteLength?: number;
  readonly errorCode?: AnchorCandidateErrorCode;
  readonly errorParams?: Readonly<Record<string, number>>;
}

export interface RunAnchorCandidateQueueOptions {
  readonly jobs: readonly AnchorCandidateJob[];
  readonly deps: AnchorCandidateDeps;
  readonly signal?: AbortSignal;
  readonly perCandidateTimeoutMs?: number;
  readonly onUpdate: (id: string, patch: AnchorCandidatePatch) => void;
}

/** 후보를 큐 순서대로 한 장씩 분석한다. 모든 후보가 끝나거나 취소되면 돌려준다. 오류는 던지지 않는다. */
export async function runAnchorCandidateQueue(options: RunAnchorCandidateQueueOptions): Promise<void> {
  const parent = options.signal;
  const timeoutMs = options.perCandidateTimeoutMs ?? ANCHOR_CANDIDATE_TIMEOUT_MS;
  for (const job of options.jobs) {
    if (parent?.aborted) {
      options.onUpdate(job.id, { status: "cancelled", errorCode: "cancelled" });
      continue;
    }
    options.onUpdate(job.id, { status: "analyzing" });
    const controller = new AbortController();
    const onParentAbort = (): void => { controller.abort(); };
    parent?.addEventListener("abort", onParentAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const result = await Promise.race([
        analyzeAnchorImageFile(job.file, options.deps, controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new AnchorCaptureError("timeout"));
          }, timeoutMs);
        }),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new AnchorCaptureError(parent?.aborted ? "cancelled" : "timeout"));
          }, { once: true });
        }),
      ]);
      if (parent?.aborted) throw new AnchorCaptureError("cancelled");
      options.onUpdate(job.id, {
        status: "done",
        features: result.features,
        width: result.width,
        height: result.height,
        byteLength: result.byteLength,
      });
    } catch (error) {
      const failure = anchorFailureOf(error, parent?.aborted === true);
      options.onUpdate(job.id, {
        status: failure.code === "cancelled" ? "cancelled" : "failed",
        errorCode: failure.code,
        ...(Object.keys(failure.params).length > 0 ? { errorParams: failure.params } : {}),
      });
    } finally {
      if (timer !== null) clearTimeout(timer);
      parent?.removeEventListener("abort", onParentAbort);
    }
  }
}
