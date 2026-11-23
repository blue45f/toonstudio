/**
 * Process-wide authority for MediaPipe Vision module loading and Task creation.
 *
 * tasks-vision uses the ambient `Module`/`ModuleFactory` globals while createFromOptions settles.
 * Different Task classes therefore cannot initialize concurrently, even when each feature owns a
 * separate singleton promise. This FIFO keeps the entire factory settlement exclusive without
 * touching MediaPipe's globals itself.
 */

import type { StudioMediaPipeVisionWasmVariant } from "./studio-mediapipe-vision-assets";

export type StudioMediaPipeVisionInitOwner =
  | "foreground-image-segmenter"
  | "mannequin-video-hand"
  | "mannequin-video-pose"
  | "vrm-avatar-reference-image"
  | "vrm-photo-hand"
  | "vrm-photo-pose"
  | "vrm-video-face"
  | "vrm-video-hand"
  | "vrm-video-pose";

export type StudioMediaPipeVisionRuntimeErrorCode =
  | "aborted"
  | "module-import-failed";

export class StudioMediaPipeVisionRuntimeError extends Error {
  readonly code: StudioMediaPipeVisionRuntimeErrorCode;

  constructor(
    code: StudioMediaPipeVisionRuntimeErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "StudioMediaPipeVisionRuntimeError";
    this.code = code;
  }
}

/** 두 SDK가 공통으로 제공하는 factory만 노출한다. private 필드나 다른 Task까지 섞지 않는다. */
export type StudioMediaPipeVisionModule = Pick<
  typeof import("@mediapipe/tasks-vision-nosimd"),
  "FaceLandmarker" | "HandLandmarker" | "PoseLandmarker" | "ImageSegmenter" | "ImageEmbedder"
>;
export type StudioMediaPipeVisionFaceLandmarker = Pick<
  import("@mediapipe/tasks-vision").FaceLandmarker, "detect" | "detectForVideo" | "setOptions" | "close"
>;
export type StudioMediaPipeVisionHandLandmarker = Pick<
  import("@mediapipe/tasks-vision").HandLandmarker, "detect" | "detectForVideo" | "setOptions" | "close"
>;
export type StudioMediaPipeVisionPoseLandmarker = Pick<
  import("@mediapipe/tasks-vision").PoseLandmarker, "detect" | "detectForVideo" | "setOptions" | "close"
>;
export type StudioMediaPipeVisionImageEmbedder = Pick<
  import("@mediapipe/tasks-vision").ImageEmbedder, "embed" | "embedForVideo" | "setOptions" | "close"
>;

export interface StudioMediaPipeVisionTaskCreationInput<T> {
  readonly owner: StudioMediaPipeVisionInitOwner;
  readonly signal?: AbortSignal;
  readonly create: () => Promise<T>;
}

export interface StudioMediaPipeVisionInitArbiter {
  loadModule(variant?: StudioMediaPipeVisionWasmVariant): Promise<StudioMediaPipeVisionModule>;
  runTaskCreation<T>(input: StudioMediaPipeVisionTaskCreationInput<T>): Promise<T>;
}

export interface StudioMediaPipeVisionInitArbiterOptions {
  readonly loadModule?: (variant: StudioMediaPipeVisionWasmVariant) => Promise<StudioMediaPipeVisionModule>;
}

interface QueuedCreation<T> {
  readonly create: () => Promise<T>;
  readonly reject: (cause: unknown) => void;
  readonly resolve: (value: T) => void;
  readonly signal?: AbortSignal;
  abortListener: (() => void) | null;
  started: boolean;
}

function abortedError(signal?: AbortSignal): StudioMediaPipeVisionRuntimeError {
  return new StudioMediaPipeVisionRuntimeError(
    "aborted",
    "MediaPipe Vision Task initialization was cancelled before it started.",
    signal?.reason === undefined ? undefined : { cause: signal.reason },
  );
}

function defaultModuleLoader(variant: StudioMediaPipeVisionWasmVariant): Promise<StudioMediaPipeVisionModule> {
  return variant === "simd"
    ? import("@mediapipe/tasks-vision")
    : import("@mediapipe/tasks-vision-nosimd");
}

export function createStudioMediaPipeVisionInitArbiter(
  options: StudioMediaPipeVisionInitArbiterOptions = {},
): StudioMediaPipeVisionInitArbiter {
  const loadModule = options.loadModule ?? defaultModuleLoader;
  const modulePromises = new Map<StudioMediaPipeVisionWasmVariant, Promise<StudioMediaPipeVisionModule>>();
  const queue: QueuedCreation<unknown>[] = [];
  let active = false;

  const pump = (): void => {
    if (active) return;
    const queued = queue.shift();
    if (!queued) return;
    if (queued.signal?.aborted) {
      queued.signal.removeEventListener("abort", queued.abortListener!);
      queued.abortListener = null;
      queued.reject(abortedError(queued.signal));
      pump();
      return;
    }

    active = true;
    queued.started = true;
    if (queued.abortListener) {
      queued.signal?.removeEventListener("abort", queued.abortListener);
      queued.abortListener = null;
    }
    void Promise.resolve()
      .then(queued.create)
      .then(queued.resolve, queued.reject)
      .finally(() => {
        active = false;
        pump();
      });
  };

  return Object.freeze({
    loadModule(variant: StudioMediaPipeVisionWasmVariant = "simd"): Promise<StudioMediaPipeVisionModule> {
      const existing = modulePromises.get(variant);
      if (existing) return existing;
      const pending = Promise.resolve()
        .then(() => loadModule(variant))
        .catch((cause: unknown) => {
          if (modulePromises.get(variant) === pending) modulePromises.delete(variant);
          throw new StudioMediaPipeVisionRuntimeError(
            "module-import-failed",
            "MediaPipe Vision runtime module failed to load.",
            { cause },
          );
        });
      modulePromises.set(variant, pending);
      return pending;
    },

    runTaskCreation<T>(input: StudioMediaPipeVisionTaskCreationInput<T>): Promise<T> {
      if (input.signal?.aborted) return Promise.reject(abortedError(input.signal));
      return new Promise<T>((resolve, reject) => {
        const queued: QueuedCreation<T> = {
          create: input.create,
          reject,
          resolve,
          signal: input.signal,
          abortListener: null,
          started: false,
        };
        const abortListener = () => {
          if (queued.started) return;
          const index = queue.indexOf(queued as QueuedCreation<unknown>);
          if (index >= 0) queue.splice(index, 1);
          queued.abortListener = null;
          reject(abortedError(input.signal));
          pump();
        };
        queued.abortListener = abortListener;
        input.signal?.addEventListener("abort", abortListener, { once: true });
        queue.push(queued as QueuedCreation<unknown>);
        pump();
      });
    },
  });
}

const productArbiter = createStudioMediaPipeVisionInitArbiter();

export function loadStudioMediaPipeVisionModule(
  variant: StudioMediaPipeVisionWasmVariant = "simd",
): Promise<StudioMediaPipeVisionModule> {
  return productArbiter.loadModule(variant);
}

export function runStudioMediaPipeVisionTaskCreation<T>(
  input: StudioMediaPipeVisionTaskCreationInput<T>,
): Promise<T> {
  return productArbiter.runTaskCreation(input);
}
