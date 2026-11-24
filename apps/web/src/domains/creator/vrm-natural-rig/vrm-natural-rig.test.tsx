// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioVrmNaturalRigPanel,
  blendDualQuaternionVolumeRatio,
  createDefaultHairStrands,
  createDualQuaternion,
  decomposeSwingTwist,
  evaluateVrmNaturalRigPipeline,
  solveCandyWrapperGuard,
  solveClavicleScapulaShare,
  solveEyeGazeIntent,
  solveHairShoulderCapsuleRepulsion,
  solveHeadPropSurfaceSeat,
  solveTenFingerNaturalCurve,
} from "./index";

afterEach(cleanup);

describe("① 쇄골-견갑골 자동 연동 분산 (Clavicle-Scapula Auto-Share)", () => {
  it("팔을 높이 들수록 견갑상완 리듬으로 쇄골이 상승·전인하고 어깨 핀치 위험을 줄인다", () => {
    const resting = solveClavicleScapulaShare({
      side: "right",
      upperArmDirection: [-0.24, -0.96, 0.04],
      strength: 1,
    });
    const waving = solveClavicleScapulaShare({
      side: "right",
      upperArmDirection: [-0.54, 0.46, 0.36],
      strength: 1,
    });

    expect(resting.armElevationDeg).toBeLessThan(25);
    expect(resting.shoulderElevationDeg).toBeLessThanOrEqual(0);
    expect(waving.armElevationDeg).toBeGreaterThan(110);
    expect(waving.shoulderElevationDeg).toBeGreaterThan(10);
    expect(waving.clavicleProtractionDeg).toBeGreaterThan(2);
    expect(waving.shoulderRotationRad[2]).toBeLessThan(-0.15);
    expect(waving.pinchRiskAfter).toBeLessThan(waving.pinchRiskBefore * 0.45);
    expect(waving.contrappostoHint.hipsRollDeg).toBeGreaterThan(1);
    expect(Math.sign(waving.contrappostoHint.spineCounterRollDeg)).toBe(-Math.sign(waving.contrappostoHint.hipsRollDeg));
  });

  it("좌우 대칭 부호 규약(왼쪽 +Z 상승, 오른쪽 -Z 상승)을 정확히 따른다", () => {
    const leftRaised = solveClavicleScapulaShare({ side: "left", upperArmDirection: [0.4, 0.85, 0.15], strength: 1 });
    const rightRaised = solveClavicleScapulaShare({ side: "right", upperArmDirection: [-0.4, 0.85, 0.15], strength: 1 });

    expect(leftRaised.shoulderRotationRad[2]).toBeGreaterThan(0.2);
    expect(rightRaised.shoulderRotationRad[2]).toBeLessThan(-0.2);
    expect(leftRaised.shoulderElevationDeg).toBeCloseTo(rightRaised.shoulderElevationDeg, 2);
  });
});

describe("② 듀얼 쿼터니언 / 트위스트 분산 캔디래퍼 핀치 방지", () => {
  it("Swing-Twist 분해가 원본 회전을 정밀하게 재합성한다(swing * twist === q)", () => {
    const euler = new THREE.Euler(THREE.MathUtils.degToRad(-78), THREE.MathUtils.degToRad(24), THREE.MathUtils.degToRad(-15), "YXZ");
    const original = new THREE.Quaternion().setFromEuler(euler).normalize();
    const { swing, twist, twistAngleDeg } = decomposeSwingTwist(
      [original.x, original.y, original.z, original.w],
      [1, 0, 0],
    );
    const reconstructed = new THREE.Quaternion(...swing).multiply(new THREE.Quaternion(...twist)).normalize();

    expect(original.angleTo(reconstructed)).toBeLessThan(1e-4);
    expect(Math.abs(twistAngleDeg)).toBeGreaterThan(60);
  });

  it("듀얼 쿼터니언 블렌딩과 3구간 트위스트 분산이 극단 회전의 LBS 단면 붕괴를 크게 줄인다", () => {
    const dq = createDualQuaternion([0, 0, 0, 1], [0.1, -0.2, 0.3]);
    expect(dq.real).toEqual([0, 0, 0, 1]);
    expect(dq.dual[0]).toBeCloseTo(0.05, 6);

    const volume = blendDualQuaternionVolumeRatio(140, 0.5);
    expect(volume.lbsPinchCollapsePct).toBeGreaterThan(55);
    expect(volume.dqVolumeRetentionPct).toBeGreaterThan(99.9);

    const guard = solveCandyWrapperGuard({ side: "right", wristTwistDeg: -88, upperArmAxialTwistDeg: 45, strength: 1 });
    expect(guard.maxSegmentTwistDeg).toBeLessThan(50);
    expect(guard.lbsPinchAfterPct).toBeLessThan(guard.lbsPinchBeforePct * 0.4);
    expect(guard.dqVolumeRetentionPct).toBeGreaterThan(99.9);
    expect(guard.candyWrapperSafe).toBe(true);
    expect(
      guard.forearmChainDeg.lowerArm + guard.forearmChainDeg.midForearm + guard.forearmChainDeg.wristResidual,
    ).toBeCloseTo(-88, 1);
  });
});

describe("③ 포즈 의도 연동 자연 시선 & 10손가락 자연 그립 자동 커브", () => {
  it("스마트폰 보기(hands) 의도는 하방 시선·근거리 폭주·상안검 추종을, 인사(camera) 의도는 카메라 정면 보상을 산출한다", () => {
    const phoneGaze = solveEyeGazeIntent({
      headRotationRad: [THREE.MathUtils.degToRad(10), THREE.MathUtils.degToRad(-1), THREE.MathUtils.degToRad(2)],
      intent: { target: "hands", pitchDeg: -22, yawDeg: 0, convergence: 0.72 },
      strength: 1,
    });
    expect(phoneGaze.resolvedTarget).toBe("hands");
    expect(phoneGaze.effectivePitchDeg).toBeLessThan(-15);
    expect(phoneGaze.vergenceDeg).toBeGreaterThan(2.5);
    expect(phoneGaze.expressionWeights.lookDown).toBeGreaterThan(0.8);
    expect(phoneGaze.eyelidFollowWeight).toBeGreaterThan(0.2);
    // 왼쪽 눈은 -Y, 오른쪽 눈은 +Y로 안쪽 수렴
    expect(phoneGaze.leftEyeRotationRad[1]).toBeLessThan(0);
    expect(phoneGaze.rightEyeRotationRad[1]).toBeGreaterThan(0);

    const waveGaze = solveEyeGazeIntent({
      headRotationRad: [THREE.MathUtils.degToRad(-2), THREE.MathUtils.degToRad(-5), THREE.MathUtils.degToRad(3.5)],
      intent: { target: "camera", pitchDeg: 2, yawDeg: 4, convergence: 0.25 },
      strength: 1,
    });
    expect(waveGaze.resolvedTarget).toBe("camera");
    expect(waveGaze.effectiveYawDeg).toBeGreaterThan(3);
  });

  it("양손 10손가락 30본을 역관절 0건·교차 0건·DIP=0.67×PIP 규약으로 생성한다", () => {
    const waveHands = solveTenFingerNaturalCurve({ leftMode: "relaxed-idle", rightMode: "open-wave", strength: 1 });
    expect(waveHands.boneCount).toBe(30);
    expect(waveHands.reverseJointCount).toBe(0);
    expect(waveHands.crossingPairCount).toBe(0);
    expect(waveHands.dipPipMaxError).toBeLessThan(0.05);
    expect(waveHands.rightSummary.meanPipCurlDeg).toBeLessThan(waveHands.leftSummary.meanPipCurlDeg);
    expect(waveHands.rightSummary.maxSpreadDeg).toBeGreaterThan(waveHands.leftSummary.maxSpreadDeg);

    const phoneHands = solveTenFingerNaturalCurve({
      leftMode: "phone-cradle",
      rightMode: "phone-cradle",
      propRadiusM: 0.009,
      strength: 1,
    });
    expect(phoneHands.boneCount).toBe(30);
    expect(phoneHands.reverseJointCount).toBe(0);
    expect(phoneHands.crossingPairCount).toBe(0);
    expect(phoneHands.leftSummary.thumbOppositionDeg).toBeGreaterThan(25);
  });
});

describe("④ 두상/헤어 볼륨 소품 표면 밀착 & 헤어-어깨 캡슐 충돌 반발", () => {
  it("베레모는 두상 곡면 0.74 높이·14° 기울기로 부양 오차를 제거하고, 안경은 눈 간격에 정밀 정합된다", () => {
    const beretSeat = solveHeadPropSurfaceSeat({
      propId: "beret",
      headWidthM: 0.2097,
      crownHeightM: 0.2222,
      eyeDistanceM: 0.0734,
      faceFrontZM: 0.1035,
      eyeHeightM: 0.0626,
      hairVolumeMm: 12,
      fitStrength: 1,
    });
    expect(beretSeat.seatedPosition[0]).toBeLessThan(-0.015);
    expect(beretSeat.seatedPosition[1]).toBeLessThan(0.2222 * 0.78);
    expect(beretSeat.seatedPosition[2]).toBeLessThan(-0.01);
    expect(beretSeat.tiltDeg[2]).toBeCloseTo(14, 1);
    expect(beretSeat.floatGapAfterMm).toBeLessThan(2);
    expect(beretSeat.floatGapAfterMm).toBeLessThan(beretSeat.floatGapBeforeMm * 0.15);
    expect(beretSeat.crownCompressionFactor).toBeGreaterThan(0.4);

    const glassesSeat = solveHeadPropSurfaceSeat({
      propId: "glasses",
      headWidthM: 0.2097,
      crownHeightM: 0.2222,
      eyeDistanceM: 0.0734,
      faceFrontZM: 0.1035,
      eyeHeightM: 0.0626,
      fitStrength: 1,
    });
    expect(glassesSeat.seatedPosition[2]).toBeCloseTo(0.0975, 4);
    expect(glassesSeat.tiltDeg[0]).toBeCloseTo(4, 1);
    expect(glassesSeat.opticalAlignmentErrorMm).toBeLessThan(0.5);
    expect(glassesSeat.floatGapAfterMm).toBeLessThan(1.2);
  });

  it("팔 올림으로 쇄골·어깨 캡슐이 상승해도 머리카락 관통을 0mm로 반발시키고 가닥 길이를 보존한다", () => {
    const strands = createDefaultHairStrands();
    const repelled = solveHairShoulderCapsuleRepulsion({
      strands,
      leftClavicleLiftDeg: -2,
      rightClavicleLiftDeg: 14,
      repulsionStrength: 1,
      clearanceMm: 2.5,
    });
    expect(repelled.initialPenetrationCount).toBeGreaterThan(0);
    expect(repelled.initialMaxPenetrationMm).toBeGreaterThan(10);
    expect(repelled.resolvedMaxPenetrationMm).toBeLessThanOrEqual(0.05);
    expect(repelled.pushedJointCount).toBeGreaterThan(0);
    expect(repelled.maxLengthDriftPct).toBeLessThan(20);
    // 각 가닥 뿌리(인덱스 0)는 고정 유지
    for (let i = 0; i < strands.length; i += 1) {
      expect(repelled.resolvedStrands[i]!.joints[0]).toEqual(strands[i]!.joints[0]);
    }
  });
});

describe("통합 파이프라인 & StudioVrmNaturalRigPanel Calm Atelier UI", () => {
  it("손들어 인사+베레모 / 스마트폰 보기+안경 시나리오 모두 최적 점수를 통과한다", () => {
    const wave = evaluateVrmNaturalRigPipeline({ presetId: "xp_wave_greeting", propId: "beret" });
    const phone = evaluateVrmNaturalRigPipeline({ presetId: "xp_phone_look", propId: "glasses" });

    expect(wave.overallScore).toBeGreaterThanOrEqual(85);
    expect(wave.overallStatus).toBe("optimal");
    expect(wave.eyeGaze.resolvedTarget).toBe("camera");
    expect(wave.rightClavicle.shoulderElevationDeg).toBeGreaterThan(10);

    expect(phone.overallScore).toBeGreaterThanOrEqual(85);
    expect(phone.overallStatus).toBe("optimal");
    expect(phone.eyeGaze.resolvedTarget).toBe("hands");
    expect(phone.eyeGaze.effectivePitchDeg).toBeLessThan(-15);
    expect(phone.propSeat.opticalAlignmentErrorMm).toBeLessThan(0.5);
  });

  it("props 없이 단독 렌더링되며 시나리오 전환·3축 슬라이더·시선 의도·초기화가 실시간 반영된다", () => {
    const onReportChange = vi.fn();
    render(<StudioVrmNaturalRigPanel onReportChange={onReportChange} />);

    expect(screen.getByTestId("studio-vrm-natural-rig-panel")).toBeTruthy();
    expect(screen.getByTestId("vrm-natural-rig-status").textContent).toContain("/100");
    expect(screen.getByTestId("vrm-rig-card-prop-hair").textContent).toContain("beret");

    fireEvent.click(screen.getByTestId("vrm-rig-scenario-phone-glasses"));
    expect(screen.getByTestId("vrm-rig-card-prop-hair").textContent).toContain("glasses");
    expect(screen.getByTestId("vrm-rig-card-gaze-hands").textContent).toContain("hands");
    expect(onReportChange).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("vrm-rig-gaze-camera"));
    expect(screen.getByTestId("vrm-rig-card-gaze-hands").textContent).toContain("camera");

    fireEvent.change(screen.getByTestId("vrm-rig-slider-prop"), { target: { value: "0" } });
    fireEvent.click(screen.getByTestId("vrm-natural-rig-reset"));
    expect(screen.getByTestId("vrm-rig-card-prop-hair").textContent).toContain("beret");

    cleanup();
    render(<StudioVrmNaturalRigPanel locale="en" />);
    expect(screen.getByText("3D Natural Rigging & Prop Surface-Seat")).toBeTruthy();
  });

  it("Calm Atelier 위생 계약: 패널 소스에 원시 hex/rgb/hsl, Web Storage, transition-all이 0건이다", () => {
    const panelSource = readFileSync(resolve(__dirname, "StudioVrmNaturalRigPanel.tsx"), "utf8");
    expect(panelSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(panelSource).not.toMatch(/\b(?:rgba?|hsla?)\s*\(/u);
    expect(panelSource).not.toMatch(/\b(?:localStorage|sessionStorage)\b/u);
    expect(panelSource).not.toMatch(/\btransition-all\b/u);
  });
});
