/**
 * Magic Poser — 포즈 강도(MP2). 지금 인형 포즈를 중립 자세 쪽으로 누그러뜨린다.
 *
 * 예전에는 매직 포저 '포즈' 탭이 웹툰 프리셋 23개 그리드를 포즈 탭과 똑같이 한 번 더 두고,
 * 강도 슬라이더는 그 그리드에서 고른 프리셋에만 먹었다. 이제 포즈 고르기는 포즈 탭의 통합
 * 라이브러리 한 곳에서 하고, 여기서는 "지금 포즈"의 강도만 다룬다(어느 라이브러리에서 고른
 * 포즈든, 뷰포트에서 드래그로 다듬은 포즈든).
 *
 * 기준 포즈: 슬라이더가 만든 포즈가 아닌 다른 경로(라이브러리 적용·뷰포트 드래그·되돌리기)로
 * 포즈가 바뀌면 그 포즈를 새 100%로 삼고 슬라이더를 100%로 되돌린다. 호스트가 currentPose를
 * 넘기면 렌더 시점에 알아채고, 없으면(단독 사용) 슬라이더를 움직이는 순간 확인한다.
 */

import { useState, type ReactElement } from "react";

import { StudioSectionHeader, StudioSliderRow } from "../studio-panel-ui";
import type { StudioMannequinPose } from "./studio-mannequin-poses";
import {
  applyStudioPoseIntensity,
  clampStudioPoseIntensity,
  STUDIO_POSE_INTENSITY_MAX,
  STUDIO_POSE_INTENSITY_MIN,
} from "./studio-pose-intensity";

export interface StudioMagicPoserIntensityScene {
  readonly setPose: (pose: StudioMannequinPose) => void;
  readonly getPose: () => StudioMannequinPose;
}

interface IntensityTrack {
  /** 호스트가 마지막으로 알려 준 포즈(렌더 시점 비교용). */
  readonly seen: StudioMannequinPose | undefined;
  /** 강도 100%에 해당하는 포즈. null이면 다음 조작 때 지금 포즈로 잡는다. */
  readonly base: StudioMannequinPose | null;
  /** 이 슬라이더가 마지막으로 커밋한 포즈(호스트 접지 보정 뒤의 값). */
  readonly applied: StudioMannequinPose | null;
  readonly intensity: number;
}

export function StudioMagicPoserIntensitySection({
  scene,
  currentPose,
  onBeforeChange,
  onGestureStart,
}: {
  readonly scene: StudioMagicPoserIntensityScene;
  /** 호스트의 현재 포즈. 다른 경로로 포즈가 바뀌면 기준을 다시 잡는 데 쓴다. */
  readonly currentPose?: StudioMannequinPose;
  /** 강도를 바꾸기 직전(되돌리기 기록 — 제스처당 한 번은 호출자가 맡는다). */
  readonly onBeforeChange?: () => void;
  /** 슬라이더를 누를 때(되돌리기 제스처 경계). */
  readonly onGestureStart?: () => void;
}): ReactElement {
  const [track, setTrack] = useState<IntensityTrack>({
    seen: currentPose,
    base: null,
    applied: null,
    intensity: STUDIO_POSE_INTENSITY_MAX,
  });

  // 렌더 중 파생 상태 조정: 슬라이더가 만든 포즈가 아니면 기준을 새 포즈로 되돌린다.
  if (currentPose !== undefined && currentPose !== track.seen) {
    setTrack(
      currentPose === track.applied
        ? { ...track, seen: currentPose }
        : { seen: currentPose, base: null, applied: null, intensity: STUDIO_POSE_INTENSITY_MAX },
    );
  }

  function handleChange(value: number): void {
    const intensity = clampStudioPoseIntensity(value);
    const current = scene.getPose();
    // 단독 사용(currentPose 없음)에서도 바깥 변경을 놓치지 않게 조작 순간 한 번 더 확인한다.
    const base = track.base !== null && current === track.applied ? track.base : current;
    onBeforeChange?.();
    scene.setPose(applyStudioPoseIntensity(base, intensity));
    setTrack({ seen: track.seen, base, applied: scene.getPose(), intensity });
  }

  return (
    <section>
      <StudioSectionHeader
        title="포즈 강도"
        description="지금 인형 포즈를 중립 자세 쪽으로 누그러뜨립니다. 100%는 지금 포즈, 0%는 차렷 기본 자세입니다. 포즈는 '포즈' 탭의 라이브러리에서 고르세요."
      />
      <div className="mb-2" onPointerDownCapture={onGestureStart}>
        <StudioSliderRow
          label="포즈 강도"
          min={STUDIO_POSE_INTENSITY_MIN}
          max={STUDIO_POSE_INTENSITY_MAX}
          step={1}
          value={track.intensity}
          onChange={handleChange}
          readout={`${track.intensity}%`}
        />
      </div>
      <p role="status" className="text-[0.66rem] text-fg-3">
        {track.intensity === STUDIO_POSE_INTENSITY_MAX
          ? "지금 포즈를 그대로 쓰고 있습니다(강도 100%)."
          : `지금 포즈의 ${track.intensity}% 강도로 누그러뜨렸습니다. 100%로 올리면 원래 포즈로 돌아갑니다.`}
      </p>
    </section>
  );
}
