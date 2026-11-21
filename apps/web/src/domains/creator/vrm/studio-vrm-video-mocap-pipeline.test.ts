import { describe, expect, it } from "vitest";

import {
  DEFAULT_FOOT_LOCKING_CONFIG,
  applyPhysicsFootLocking,
  extractKeyActionPeakFrames,
  retargetLandmarkFrameToVrmPose,
  scrubMocapClipAtTime,
  validateLocalMocapVideoSource,
  type MonocularPoseLandmarkFrame,
} from "./studio-vrm-video-mocap-pipeline";

function makeLandmarkFrame(
  timeSec: number,
  hipsY: number,
  leftAnkle: readonly [number, number, number],
  rightAnkle: readonly [number, number, number],
): MonocularPoseLandmarkFrame {
  return {
    timeSec,
    hips: [0, hipsY, 0],
    spine: [0, hipsY + 0.16, 0],
    chest: [0, hipsY + 0.34, 0],
    neck: [0, hipsY + 0.48, 0],
    head: [0, hipsY + 0.64, 0],
    leftShoulder: [0.18, hipsY + 0.44, 0],
    leftElbow: [0.42, hipsY + 0.38, 0.12],
    leftWrist: [0.62, hipsY + 0.36, 0.25],
    rightShoulder: [-0.18, hipsY + 0.44, 0],
    rightElbow: [-0.42, hipsY + 0.42, 0],
    rightWrist: [-0.66, hipsY + 0.42, 0],
    leftHip: [0.1, hipsY, 0],
    leftKnee: [0.1, hipsY - 0.45, 0.04],
    leftAnkle,
    rightHip: [-0.1, hipsY, 0],
    rightKnee: [-0.1, hipsY - 0.45, 0.02],
    rightAnkle,
  };
}

describe("studio-vrm-video-mocap-pipeline", () => {
  it("validates local MP4/WebM sources and rejects remote or unsupported streams", () => {
    expect(validateLocalMocapVideoSource({
      fileName: "action_kick.mp4",
      mimeType: "video/mp4",
      durationSec: 8.5,
      fps: 30,
      width: 1280,
      height: 720,
      isLocalObjectUrl: true,
    }).valid).toBe(true);

    expect(validateLocalMocapVideoSource({
      fileName: "remote.mp4",
      mimeType: "video/mp4",
      durationSec: 5,
      fps: 30,
      width: 1280,
      height: 720,
      isLocalObjectUrl: false,
    }).valid).toBe(false);
  });

  it("pins planted feet against horizontal skating and prevents floor penetration", () => {
    const rawFrames = [
      // 왼발이 바닥 근처에서 미세하게 미끄러지는(0.005m/frame) 스탠스 구간
      retargetLandmarkFrameToVrmPose(makeLandmarkFrame(0.0, 0.95, [0.1, 0.03, 0.0], [-0.1, 0.25, 0.1])),
      retargetLandmarkFrameToVrmPose(makeLandmarkFrame(0.033, 0.95, [0.104, 0.02, 0.003], [-0.1, 0.3, 0.15])),
      retargetLandmarkFrameToVrmPose(makeLandmarkFrame(0.066, 0.95, [0.109, 0.01, 0.006], [-0.1, 0.28, 0.18])),
    ];

    const locked = applyPhysicsFootLocking(rawFrames, DEFAULT_FOOT_LOCKING_CONFIG);
    expect(locked[0].leftFootLocked).toBe(true);
    expect(locked[1].leftFootLocked).toBe(true);
    expect(locked[2].leftFootLocked).toBe(true);
    // 왼발 XZ가 첫 착지 앵커(0.1, 0.0)에 고정되고 바닥 아래로 파고들지 않아야 한다
    expect(locked[2].leftFootWorldM[0]).toBeCloseTo(0.1, 5);
    expect(locked[2].leftFootWorldM[2]).toBeCloseTo(0.0, 5);
    expect(locked[2].leftFootWorldM[1]).toBeCloseTo(DEFAULT_FOOT_LOCKING_CONFIG.soleThicknessM, 5);
  });

  it("scrubs sub-frame still poses smoothly and detects jump apex & landing peaks", () => {
    const frames = [
      makeLandmarkFrame(0.0, 0.95, [0.1, 0.04, 0], [-0.1, 0.04, 0]),
      makeLandmarkFrame(0.1, 1.15, [0.1, 0.24, 0], [-0.1, 0.24, 0]),
      makeLandmarkFrame(0.2, 1.42, [0.1, 0.52, 0], [-0.1, 0.52, 0]),
      makeLandmarkFrame(0.3, 1.18, [0.1, 0.28, 0], [-0.1, 0.28, 0]),
      makeLandmarkFrame(0.4, 0.95, [0.1, 0.04, 0], [-0.1, 0.04, 0]),
    ].map(retargetLandmarkFrameToVrmPose);

    const locked = applyPhysicsFootLocking(frames);
    const scrubbed = scrubMocapClipAtTime(locked, 0.15);
    expect(scrubbed).not.toBeNull();
    expect(scrubbed!.hipsPositionM[1]).toBeCloseTo((1.15 + 1.42) * 0.5, 4);

    const peaks = extractKeyActionPeakFrames(locked, 4);
    expect(peaks.some((p) => p.tagKo === "점프 정점" && p.frameIndex === 2)).toBe(true);
  });
});
