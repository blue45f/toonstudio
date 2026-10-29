/** 연속 IMAGE 손 인식. 한 프레임의 캡처·추론·적용이 끝난 뒤에만 다음 프레임을 요청한다. */
import { failVisible, isLabFailure } from "../../contracts";
import { handLandmarksToPose } from "../../domains/vision/hand-landmarks-to-pose";
import { resolveHandSide } from "../../domains/vision/vision-ports";

import type { LabFailure, Pose } from "../../contracts";
import type { HandDetectorPort, VisionImageSource } from "../../domains/vision/vision-ports";

export interface LiveHandFrame {
  readonly width: number;
  readonly height: number;
  readonly source: VisionImageSource;
  release(): void;
}
export interface LiveHandsSettings { readonly mirror: boolean; readonly selfie: boolean }
export interface LiveHandsStatus {
  readonly phase: "idle" | "loading" | "running" | "waiting" | "stopped" | "failed";
  readonly frames: number;
  readonly appliedHands: number;
  readonly latencyMs: number | null;
  readonly coordinateSpace?: "world" | "image" | "mixed";
  readonly messageKo: string;
  readonly failure?: LabFailure;
}
export interface LiveHandsDeps {
  ensureDetector(): Promise<HandDetectorPort>;
  capture(): Promise<LiveHandFrame | null>;
  /** 비디오의 다음 프레임을 예약하고 취소 함수를 반환한다. */
  schedule(next: () => void): () => void;
  apply(pose: Pose, sessionId: string): void;
  status(status: LiveHandsStatus): void;
  now(): number;
}
let sessionSequence = 0;
export function createLiveHandsController(deps: LiveHandsDeps) {
  let current: { id: string; settings: LiveHandsSettings; frames: number } | null = null;
  let cancel: (() => void) | null = null;
  let busy = false;
  let disposed = false;
  const emit = (phase: LiveHandsStatus["phase"], messageKo: string, extra: Partial<LiveHandsStatus> = {}): void => {
    if (!disposed) deps.status({ phase, frames: current?.frames ?? 0, appliedHands: 0, latencyMs: null, messageKo, ...extra });
  };
  const stop = (messageKo = "연속 손 인식을 중지했습니다."): void => {
    if (!current && !cancel) return;
    const frames = current?.frames ?? 0;
    current = null;
    cancel?.(); cancel = null;
    emit("stopped", messageKo, { frames });
  };
  const schedule = (): void => {
    if (current && !disposed && !cancel) cancel = deps.schedule(() => { cancel = null; void pump(); });
  };
  const pump = async (): Promise<void> => {
    if (busy || !current || disposed) return;
    const run = current;
    busy = true;
    let frame: LiveHandFrame | null = null;
    try {
      const detector = await deps.ensureDetector();
      if (current !== run || disposed) return;
      frame = await deps.capture();
      if (current !== run || disposed) return;
      if (!frame) { emit("waiting", "비디오 프레임을 기다립니다. 마지막 손 포즈를 유지합니다."); return; }
      const started = deps.now();
      const hands = await detector.detect(frame.source);
      if (current !== run || disposed) return;
      run.frames += 1;
      const selected = new Map<"left" | "right", (typeof hands)[number]>();
      for (const hand of hands) {
        const side = resolveHandSide(hand.reportedHandedness, run.settings);
        if (side && (!selected.has(side) || hand.score > (selected.get(side)?.score ?? -Infinity))) selected.set(side, hand);
      }
      let appliedHands = 0;
      const spaces = new Set<"world" | "image">();
      const pose: Pose = {};
      for (const [side, hand] of selected) {
        const space = hand.worldLandmarks ? "world" : "image";
        const result = handLandmarksToPose(hand.worldLandmarks ?? hand.landmarks, { side, mirror: run.settings.mirror, space, aspectRatio: frame.width / frame.height });
        spaces.add(space);
        if (result.appliedBones.length) { Object.assign(pose, result.pose); appliedHands += 1; }
      }
      const latencyMs = Math.max(0, deps.now() - started);
      if (appliedHands) deps.apply(pose, run.id);
      const coordinateSpace: LiveHandsStatus["coordinateSpace"] = spaces.size > 1 ? "mixed" : spaces.has("world") ? "world" : "image";
      emit(appliedHands ? "running" : "waiting", appliedHands ? `손 ${appliedHands}개를 적용했습니다.` : "적용할 손을 찾지 못했습니다. 마지막 손 포즈를 유지합니다.", { appliedHands, latencyMs, ...(spaces.size ? { coordinateSpace } : {}) });
    } catch (error) {
      if (current === run && !disposed) {
        const failure = isLabFailure(error) ? error : failVisible("vision-live-hands-failed", "연속 손 인식에 실패했습니다.", error);
        current = null;
        emit("failed", failure.reasonKo, { frames: run.frames, failure });
      }
    } finally {
      frame?.release();
      busy = false;
      schedule();
    }
  };
  return {
    start(settings: LiveHandsSettings) {
      if (disposed || current) return;
      current = { id: `live-hands-${++sessionSequence}`, settings: { ...settings }, frames: 0 };
      emit("loading", "고정 손 모델을 준비합니다.");
      void pump();
    },
    stop,
    running: () => current !== null,
    dispose() { disposed = true; stop(); },
  };
}
