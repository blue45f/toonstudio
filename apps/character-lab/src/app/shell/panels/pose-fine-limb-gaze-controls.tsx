/**
 * P2-17 포즈 편집 확장 UI: 손(손가락 그립·벌림·손목) · 발(발목 굴곡·기울기·발끝) · 시선(공동 주시·양안 대칭·개별 안구·카메라 응시)의
 * 개별 미세 조정, 해부학적 관절 제한(`JOINT_LIMITS_DEG` / `EYE_GAZE_LIMIT_DEG`) 자동 보호, 부위별 좌우 반전 및 기본값 복원.
 */
import { useEffect, useState } from "react";

import { clampPoseToLimits } from "../../../animation";
import { DEFAULT_EYE_GAZE, EYE_GAZE_LIMIT_DEG, bonesInScope, resolveEyeGaze } from "../../../contracts";
import { clamp } from "../../../shared/math";

import {
  ARM_UPPER_BONES,
  DEFAULT_HAND_SLIDERS,
  FOOT_SIDES,
  FOOT_SIDE_LABELS_KO,
  adjustedFootJoint,
  readFootSliders,
  buildSingleHandFinePose,
  deriveGazeControlMode,
  mirrorEyeGazeLeftRight,
  mirrorFeetOnlyPose,
  mirrorHandsOnlyPose,
  type FootSide,
  type FootSlidersState,
  type GazeControlMode,
  type HandSlidersState,
} from "./pose-fine-limb-gaze-math";
import { HAND_SIDES, HAND_SIDE_LABELS_KO, isHandSide, mirrorHumanoidPoseLeftRight, type HandSide } from "./pose-panel-helpers";

import type { CharacterRecipe, EyeGaze, HumanoidBoneName, LabCommand, Pose, Quat, SkeletonData } from "../../../contracts";

interface DegreeSliderRowProps {
  readonly id: string;
  readonly label: string;
  readonly testId: string;
  readonly min: number;
  readonly max: number;
  readonly value: number;
  readonly disabled: boolean;
  readonly onChange: (deg: number) => void;
}

function DegreeSliderRow({ id, label, testId, min, max, value, disabled, onChange }: DegreeSliderRowProps) {
  return (
    <div className="cl-pose-row">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        data-testid={testId}
        type="range"
        min={min}
        max={max}
        step={1}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output htmlFor={id}>{`${value}°`}</output>
    </div>
  );
}

export interface PoseFineLimbGazeControlsProps {
  readonly ids: string;
  readonly recipe: CharacterRecipe;
  readonly activeSkeleton: SkeletonData;
  readonly poseBlocked: boolean;
  readonly handBlocked: boolean;
  readonly guardCorruptedRig: () => boolean;
  readonly dispatch: (command: LabCommand) => void;
}

export function PoseFineLimbGazeControls(props: PoseFineLimbGazeControlsProps) {
  const { ids, recipe, activeSkeleton, poseBlocked, handBlocked, guardCorruptedRig, dispatch } = props;

  const [autoClampLimits, setAutoClampLimits] = useState(true);
  const [fineHandSide, setFineHandSide] = useState<HandSide>("both");
  const [handSliders, setHandSliders] = useState<Readonly<Record<"left" | "right", HandSlidersState>>>({
    left: DEFAULT_HAND_SLIDERS,
    right: DEFAULT_HAND_SLIDERS,
  });

  const [fineFootSide, setFineFootSide] = useState<FootSide>("both");
  const currentGaze = recipe.eyeGaze ?? DEFAULT_EYE_GAZE;
  const [gazeMode, setGazeMode] = useState<GazeControlMode>(() => deriveGazeControlMode(currentGaze));

  useEffect(() => {
    const nextDerived = deriveGazeControlMode(currentGaze);
    if (currentGaze.mode === "camera" && gazeMode !== "camera") {
      setGazeMode("camera");
    } else if (currentGaze.mode === "manual" && gazeMode === "camera") {
      setGazeMode(nextDerived);
    }
  }, [currentGaze, gazeMode]);

  const maybeClamp = (pose: Pose): Pose => (autoClampLimits ? clampPoseToLimits(pose, activeSkeleton) : pose);

  const activeHandValues = fineHandSide === "right" ? handSliders.right : handSliders.left;
  const activeFootValues = readFootSliders(recipe.pose, fineFootSide === "right" ? "right" : "left");

  const updateHandSliders = (patch: Partial<HandSlidersState>, coalesceSuffix: string): void => {
    if (guardCorruptedRig()) return;
    const nextLeft = fineHandSide === "left" || fineHandSide === "both" ? { ...handSliders.left, ...patch } : handSliders.left;
    const nextRight = fineHandSide === "right" || fineHandSide === "both" ? { ...handSliders.right, ...patch } : handSliders.right;
    setHandSliders({ left: nextLeft, right: nextRight });

    if (fineHandSide === "left") {
      dispatch({
        type: "pose/set",
        pose: maybeClamp(buildSingleHandFinePose("left", nextLeft)),
        scope: "left-hand",
        labelKo: "왼손 세부 관절 조정",
        coalesceKey: `pose:fine-hand:left:${coalesceSuffix}`,
      });
      return;
    }
    if (fineHandSide === "right") {
      dispatch({
        type: "pose/set",
        pose: maybeClamp(buildSingleHandFinePose("right", nextRight)),
        scope: "right-hand",
        labelKo: "오른손 세부 관절 조정",
        coalesceKey: `pose:fine-hand:right:${coalesceSuffix}`,
      });
      return;
    }
    const nextArmsHands: Partial<Record<HumanoidBoneName, Quat>> = {};
    for (const bone of ARM_UPPER_BONES) {
      const q = recipe.pose[bone];
      if (q) nextArmsHands[bone] = q;
    }
    Object.assign(nextArmsHands, buildSingleHandFinePose("left", nextLeft), buildSingleHandFinePose("right", nextRight));
    dispatch({
      type: "pose/set",
      pose: maybeClamp(nextArmsHands),
      scope: "arms-hands",
      labelKo: "양손 세부 관절 조정",
      coalesceKey: `pose:fine-hand:both:${coalesceSuffix}`,
    });
  };

  const mirrorHands = (): void => {
    if (guardCorruptedRig()) return;
    setHandSliders({ left: handSliders.right, right: handSliders.left });
    dispatch({ type: "pose/set", pose: maybeClamp(mirrorHandsOnlyPose(recipe)), scope: "arms-hands", labelKo: "손 포즈 좌우 반전" });
  };

  const resetHands = (): void => {
    if (guardCorruptedRig()) return;
    if (fineHandSide === "left") {
      setHandSliders((prev) => ({ ...prev, left: DEFAULT_HAND_SLIDERS }));
      dispatch({ type: "pose/set", pose: {}, scope: "left-hand", labelKo: "왼손 자세 복원" });
      return;
    }
    if (fineHandSide === "right") {
      setHandSliders((prev) => ({ ...prev, right: DEFAULT_HAND_SLIDERS }));
      dispatch({ type: "pose/set", pose: {}, scope: "right-hand", labelKo: "오른손 자세 복원" });
      return;
    }
    setHandSliders({ left: DEFAULT_HAND_SLIDERS, right: DEFAULT_HAND_SLIDERS });
    const preservedArms: Partial<Record<HumanoidBoneName, Quat>> = {};
    for (const bone of ARM_UPPER_BONES) {
      const q = recipe.pose[bone];
      if (q) preservedArms[bone] = q;
    }
    dispatch({ type: "pose/set", pose: preservedArms, scope: "arms-hands", labelKo: "양손 자세 복원" });
  };

  const updateFootSlider = (axis: keyof FootSlidersState, value: number): void => {
    if (guardCorruptedRig()) return;
    const nextLower: Pose = {};
    for (const bone of bonesInScope("lower")) {
      const q = recipe.pose[bone];
      if (q) nextLower[bone] = q;
    }
    for (const side of ["left", "right"] as const) {
      if (fineFootSide !== "both" && fineFootSide !== side) continue;
      const { bone, rotation } = adjustedFootJoint(recipe.pose, side, axis, value);
      if (Math.hypot(rotation[0], rotation[1], rotation[2]) < 1e-9) delete nextLower[bone];
      else Object.assign(nextLower, maybeClamp({ [bone]: rotation }));
    }
    dispatch({
      type: "pose/set", pose: nextLower, scope: "lower",
      labelKo: `${FOOT_SIDE_LABELS_KO[fineFootSide]} 발목·발끝 조정`,
      coalesceKey: `pose:fine-foot:${fineFootSide}:${axis}`,
    });
  };

  const mirrorFeet = (): void => {
    if (guardCorruptedRig()) return;
    dispatch({ type: "pose/set", pose: mirrorFeetOnlyPose(recipe.pose, maybeClamp), scope: "lower", labelKo: "발 자세 좌우 반전" });
  };

  const resetFeet = (): void => {
    if (guardCorruptedRig()) return;
    const nextLower: Partial<Record<HumanoidBoneName, Quat>> = {};
    for (const bone of bonesInScope("lower")) {
      const q = recipe.pose[bone];
      if (q) nextLower[bone] = q;
    }
    if (fineFootSide === "left" || fineFootSide === "both") {
      delete nextLower.leftFoot;
      delete nextLower.leftToes;
    }
    if (fineFootSide === "right" || fineFootSide === "both") {
      delete nextLower.rightFoot;
      delete nextLower.rightToes;
    }
    dispatch({ type: "pose/set", pose: nextLower, scope: "lower", labelKo: `${FOOT_SIDE_LABELS_KO[fineFootSide]} 자세 복원` });
  };

  const selectGazeMode = (mode: GazeControlMode): void => {
    setGazeMode(mode);
    if (mode === "camera") {
      dispatch({ type: "eye-gaze/set", gaze: { mode: "camera", symmetry: false, left: currentGaze.left, right: currentGaze.right } });
      return;
    }
    if (mode === "symmetry") {
      dispatch({ type: "eye-gaze/set", gaze: resolveEyeGaze({ mode: "manual", symmetry: true, left: currentGaze.left, right: currentGaze.right }) });
      return;
    }
    if (mode === "conjugate") {
      const anchor = currentGaze.left;
      dispatch({ type: "eye-gaze/set", gaze: { mode: "manual", symmetry: false, left: anchor, right: anchor } });
      return;
    }
    dispatch({ type: "eye-gaze/set", gaze: { mode: "manual", symmetry: false, left: currentGaze.left, right: resolveEyeGaze(currentGaze).right } });
  };

  const updateGazeAngles = (side: "left" | "right" | "both", axis: "yawDeg" | "pitchDeg", rawDeg: number): void => {
    const deg = clamp(rawDeg, -EYE_GAZE_LIMIT_DEG, EYE_GAZE_LIMIT_DEG);
    if (side === "both") {
      const nextAngle = { ...currentGaze.left, [axis]: deg };
      dispatch({ type: "eye-gaze/set", gaze: { mode: "manual", symmetry: false, left: nextAngle, right: nextAngle }, coalesceKey: `pose:gaze:both:${axis}` });
      return;
    }
    if (gazeMode === "symmetry") {
      const nextLeft = { ...currentGaze.left, [axis]: deg };
      dispatch({ type: "eye-gaze/set", gaze: resolveEyeGaze({ mode: "manual", symmetry: true, left: nextLeft, right: currentGaze.right }), coalesceKey: `pose:gaze:sym:${axis}` });
      return;
    }
    const resolved = resolveEyeGaze(currentGaze);
    const nextGaze: EyeGaze = {
      mode: "manual",
      symmetry: false,
      left: side === "left" ? { ...resolved.left, [axis]: deg } : resolved.left,
      right: side === "right" ? { ...resolved.right, [axis]: deg } : resolved.right,
    };
    dispatch({ type: "eye-gaze/set", gaze: nextGaze, coalesceKey: `pose:gaze:${side}:${axis}` });
  };

  const mirrorGaze = (): void => {
    dispatch({ type: "eye-gaze/set", gaze: mirrorEyeGazeLeftRight(currentGaze) });
  };

  const resetGaze = (): void => {
    setGazeMode("conjugate");
    dispatch({ type: "eye-gaze/set", gaze: DEFAULT_EYE_GAZE });
  };

  const mirrorAllBodyLimbsAndGaze = (): void => {
    if (guardCorruptedRig()) return;
    const combined: Partial<Record<HumanoidBoneName, Quat>> = { ...recipe.pose, ...recipe.handPose.left, ...recipe.handPose.right };
    setHandSliders({ left: handSliders.right, right: handSliders.left });
    dispatch({ type: "pose/set", pose: maybeClamp(mirrorHumanoidPoseLeftRight(combined)), scope: "full", labelKo: "전신·손·발 통합 좌우 반전" });
    dispatch({ type: "eye-gaze/set", gaze: mirrorEyeGazeLeftRight(currentGaze) });
  };

  const resetAllLimbsAndGaze = (): void => {
    if (guardCorruptedRig()) return;
    setHandSliders({ left: DEFAULT_HAND_SLIDERS, right: DEFAULT_HAND_SLIDERS });
    setGazeMode("conjugate");
    dispatch({ type: "pose/set", pose: {}, scope: "full", labelKo: "전신·손·발 전체 복원" });
    dispatch({ type: "hand-pose/set", side: "left", presetId: null });
    dispatch({ type: "hand-pose/set", side: "right", presetId: null });
    dispatch({ type: "eye-gaze/set", gaze: DEFAULT_EYE_GAZE });
  };

  const resolvedGaze = resolveEyeGaze(currentGaze);

  return (
    <div className="cl-pose-fine-suite" role="region" aria-label="손·발·시선 세부 편집 및 관절 보호" data-testid="pose-fine-limb-gaze-suite">
      <div className="cl-pose-row" data-testid="pose-joint-limit-guard-bar">
        <label className="cl-pose-radio" htmlFor={`${ids}-auto-clamp-limits`}>
          <input
            id={`${ids}-auto-clamp-limits`}
            data-testid="pose-auto-joint-limit-toggle"
            type="checkbox"
            checked={autoClampLimits}
            disabled={poseBlocked}
            onChange={(event) => setAutoClampLimits(event.target.checked)}
          />
          관절 제한 자동 유지 (손가락 95° · 손목 80° · 발목 50° · 발끝 40° · 시선 ±25°)
        </label>
        <div className="cl-pose-actions">
          <button type="button" data-testid="pose-mirror-all-integrated-btn" disabled={poseBlocked} onClick={mirrorAllBodyLimbsAndGaze}>
            전신·손·발·시선 통합 반전
          </button>
          <button type="button" data-testid="pose-reset-all-integrated-btn" disabled={poseBlocked} onClick={resetAllLimbsAndGaze}>
            전신·손·발·시선 전체 복원
          </button>
        </div>
      </div>

      <fieldset className="cl-pose-fine-hand" data-testid="pose-fine-hand-section">
        <legend>손·손가락·손목 개별 조정</legend>
        <div className="cl-pose-row" role="group" aria-label="손 세부 편집 대상">
          {HAND_SIDES.map((side) => (
            <label key={side} className="cl-pose-radio" htmlFor={`${ids}-fine-hand-${side}`}>
              <input
                id={`${ids}-fine-hand-${side}`}
                type="radio"
                name={`${ids}-fine-hand-side`}
                value={side}
                checked={fineHandSide === side}
                disabled={handBlocked}
                onChange={(event) => {
                  if (isHandSide(event.target.value)) setFineHandSide(event.target.value);
                }}
              />
              {`세부 ${HAND_SIDE_LABELS_KO[side]}`}
            </label>
          ))}
        </div>
        <DegreeSliderRow id={`${ids}-hand-curl`} label="손가락 굽힘(그립)" testId="pose-fine-hand-curl-slider" min={-15} max={90} value={activeHandValues.curlDeg} disabled={handBlocked} onChange={(curlDeg) => updateHandSliders({ curlDeg }, "curl")} />
        <DegreeSliderRow id={`${ids}-hand-spread`} label="손가락 벌림(스프레드)" testId="pose-fine-hand-spread-slider" min={-15} max={30} value={activeHandValues.spreadDeg} disabled={handBlocked} onChange={(spreadDeg) => updateHandSliders({ spreadDeg }, "spread")} />
        <DegreeSliderRow id={`${ids}-wrist-flex`} label="손목 굴곡(굽힘)" testId="pose-fine-wrist-flex-slider" min={-65} max={65} value={activeHandValues.wristFlexDeg} disabled={handBlocked} onChange={(wristFlexDeg) => updateHandSliders({ wristFlexDeg }, "wrist-flex")} />
        <DegreeSliderRow id={`${ids}-wrist-deviate`} label="손목 꺾임(요·척측)" testId="pose-fine-wrist-deviate-slider" min={-35} max={35} value={activeHandValues.wristDeviateDeg} disabled={handBlocked} onChange={(wristDeviateDeg) => updateHandSliders({ wristDeviateDeg }, "wrist-dev")} />
        <div className="cl-pose-actions">
          <button type="button" data-testid="pose-hand-mirror-btn" disabled={handBlocked} onClick={mirrorHands}>손 좌우 반전</button>
          <button type="button" data-testid="pose-hand-reset-btn" disabled={handBlocked} onClick={resetHands}>{`${HAND_SIDE_LABELS_KO[fineHandSide]} 복원`}</button>
        </div>
      </fieldset>

      <fieldset className="cl-pose-fine-foot" data-testid="pose-fine-foot-section">
        <legend>발·발목·발끝 개별 조정</legend>
        <div className="cl-pose-row" role="group" aria-label="발 세부 편집 대상">
          {FOOT_SIDES.map((side) => (
            <label key={side} className="cl-pose-radio" htmlFor={`${ids}-fine-foot-${side}`}>
              <input
                id={`${ids}-fine-foot-${side}`}
                type="radio"
                name={`${ids}-fine-foot-side`}
                value={side}
                checked={fineFootSide === side}
                disabled={poseBlocked}
                onChange={() => setFineFootSide(side)}
              />
              {`세부 ${FOOT_SIDE_LABELS_KO[side]}`}
            </label>
          ))}
        </div>
        <DegreeSliderRow id={`${ids}-ankle-pitch`} label="발목 굽힘(까치발·당김)" testId="pose-fine-ankle-pitch-slider" min={-45} max={45} value={Math.round(activeFootValues.anklePitchDeg)} disabled={poseBlocked} onChange={(anklePitchDeg) => updateFootSlider("anklePitchDeg", anklePitchDeg)} />
        <DegreeSliderRow id={`${ids}-ankle-roll`} label="발목 기울기(내반·외반)" testId="pose-fine-ankle-roll-slider" min={-25} max={25} value={Math.round(activeFootValues.ankleRollDeg)} disabled={poseBlocked} onChange={(ankleRollDeg) => updateFootSlider("ankleRollDeg", ankleRollDeg)} />
        <DegreeSliderRow id={`${ids}-toe-lift`} label="발끝 들기(발가락)" testId="pose-fine-toe-lift-slider" min={-35} max={35} value={Math.round(activeFootValues.toeLiftDeg)} disabled={poseBlocked} onChange={(toeLiftDeg) => updateFootSlider("toeLiftDeg", toeLiftDeg)} />
        <div className="cl-pose-actions">
          <button type="button" data-testid="pose-foot-mirror-btn" disabled={poseBlocked} onClick={mirrorFeet}>발 좌우 반전</button>
          <button type="button" data-testid="pose-foot-reset-btn" disabled={poseBlocked} onClick={resetFeet}>{`${FOOT_SIDE_LABELS_KO[fineFootSide]} 복원`}</button>
        </div>
      </fieldset>

      <fieldset className="cl-pose-fine-gaze" data-testid="pose-fine-gaze-section">
        <legend>시선 개별 조정 (±25° 제한)</legend>
        <div className="cl-pose-row" role="group" aria-label="시선 제어 모드">
          {(
            [
              { id: "conjugate", label: "공동 주시(같은 방향)" },
              { id: "independent", label: "왼눈·오른눈 개별" },
              { id: "symmetry", label: "양안 대칭(모으기)" },
              { id: "camera", label: "카메라 응시" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              className="cl-preset-chip"
              aria-pressed={gazeMode === item.id}
              disabled={poseBlocked}
              data-testid={`pose-gaze-mode-${item.id}`}
              onClick={() => selectGazeMode(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {gazeMode === "conjugate" ? (
          <>
            <DegreeSliderRow id={`${ids}-gaze-both-yaw`} label="시선 좌우(Yaw°)" testId="pose-gaze-both-yaw-slider" min={-EYE_GAZE_LIMIT_DEG} max={EYE_GAZE_LIMIT_DEG} value={resolvedGaze.left.yawDeg} disabled={poseBlocked} onChange={(deg) => updateGazeAngles("both", "yawDeg", deg)} />
            <DegreeSliderRow id={`${ids}-gaze-both-pitch`} label="시선 상하(Pitch°)" testId="pose-gaze-both-pitch-slider" min={-EYE_GAZE_LIMIT_DEG} max={EYE_GAZE_LIMIT_DEG} value={resolvedGaze.left.pitchDeg} disabled={poseBlocked} onChange={(deg) => updateGazeAngles("both", "pitchDeg", deg)} />
          </>
        ) : gazeMode === "camera" ? (
          <p className="cl-pose-hint" data-testid="pose-gaze-camera-hint">
            카메라 응시 활성 중: 뷰포트 회전 시 양쪽 눈이 카메라 렌즈를 자동으로 바라봅니다.
          </p>
        ) : (
          (["left", "right"] as const).map((side) => {
            const sideLabel = side === "left" ? "왼눈" : "오른눈";
            const disabledSide = poseBlocked || (gazeMode === "symmetry" && side === "right");
            return (
              <div key={side} className="cl-pose-gaze-eye-group">
                <DegreeSliderRow id={`${ids}-gaze-${side}-yaw`} label={`${sideLabel} 좌우(Yaw°)`} testId={`pose-gaze-${side}-yaw-slider`} min={-EYE_GAZE_LIMIT_DEG} max={EYE_GAZE_LIMIT_DEG} value={resolvedGaze[side].yawDeg} disabled={disabledSide} onChange={(deg) => updateGazeAngles(side, "yawDeg", deg)} />
                <DegreeSliderRow id={`${ids}-gaze-${side}-pitch`} label={`${sideLabel} 상하(Pitch°)`} testId={`pose-gaze-${side}-pitch-slider`} min={-EYE_GAZE_LIMIT_DEG} max={EYE_GAZE_LIMIT_DEG} value={resolvedGaze[side].pitchDeg} disabled={disabledSide} onChange={(deg) => updateGazeAngles(side, "pitchDeg", deg)} />
              </div>
            );
          })
        )}

        <div className="cl-pose-actions">
          <button type="button" data-testid="pose-gaze-mirror-btn" disabled={poseBlocked || gazeMode === "camera"} onClick={mirrorGaze}>시선 좌우 반전</button>
          <button type="button" data-testid="pose-gaze-reset-btn" disabled={poseBlocked} onClick={resetGaze}>시선 정면 복원</button>
        </div>
      </fieldset>
    </div>
  );
}
