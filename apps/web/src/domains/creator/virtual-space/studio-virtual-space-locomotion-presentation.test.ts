import { describe, expect, it, vi } from "vitest";
import {
  StudioCameraFollowModeController,
  studioAwayDozeMotion,
  studioBlinkScaleY,
  studioEffectiveGaitStride,
  studioGaitBodyOffset,
  studioGaitRockAngle,
  studioGaitShadowAlpha,
  studioGaitShadowScale,
  studioGaitSquashScale,
  studioGaitSquashScaleY,
  studioIdleSwayOffsetX,
  studioIdleUpperBodyBreathScale,
  studioImageSpriteSubframeMotion,
  studioPlayerLocomotionProfile,
} from "./studio-virtual-space-locomotion-presentation";
import { DEFAULT_STUDIO_MOTION_CONFIG, stepStudioVirtualSpaceMotion } from "./studio-virtual-space-motion";
import { STUDIO_VIRTUAL_SPACE_WALK_SPEED } from "./studio-virtual-space-navigation";
import { studioGaitFrame } from "./studio-virtual-space-presentation";

describe("업무 공간의 걷기 표현", () => {
  it("내장 장소에서는 몸 크기에 맞게 걷고 네 자세를 초당 약 여섯 번 표시한다", () => {
    const profile = studioPlayerLocomotionProfile(true);
    const bodyHeight = 131 * .65;
    expect(profile.walkSpeed / bodyHeight).toBeGreaterThan(1);
    expect(profile.walkSpeed / bodyHeight).toBeLessThan(2);
    expect(profile.gaitDistancePerCycle).toBeDefined();
    const framesPerSecond = profile.walkSpeed / profile.gaitDistancePerCycle! * 4;
    expect(framesPerSecond).toBeGreaterThan(5);
    expect(framesPerSecond).toBeLessThan(7);
    expect(profile.walkSpeed * profile.sprintMultiplier).toBe(208);
  });

  it.each([30, 60, 120])("%iHz에서도 이동한 거리만큼 보폭이 진행하고 멈추면 고정된다", (hz) => {
    const profile = studioPlayerLocomotionProfile(true);
    const config = { ...DEFAULT_STUDIO_MOTION_CONFIG, maxSpeed: profile.walkSpeed };
    let state = { velocity: { x: profile.walkSpeed, y: 0 } };
    let distance = 0;
    const frames = new Set<number>();
    for (let index = 0; index < hz; index++) {
      state = stepStudioVirtualSpaceMotion(state, { x: 1, y: 0 }, 1 / hz, config);
      distance += Math.hypot(state.velocity.x, state.velocity.y) / hz;
      frames.add(studioGaitFrame(distance, 4, profile.gaitDistancePerCycle));
    }
    expect(distance).toBeCloseTo(160, 5);
    expect(frames).toEqual(new Set([0, 1, 2, 3]));
    const stoppedFrame = studioGaitFrame(distance, 4, profile.gaitDistancePerCycle);
    for (let index = 0; index < hz; index++) {
      expect(studioGaitFrame(distance, 4, profile.gaitDistancePerCycle)).toBe(stoppedFrame);
    }
  });

  it("기존 사용자 월드의 속도와 원본별 보폭을 보존한다", () => {
    const profile = studioPlayerLocomotionProfile(false);
    expect(profile.walkSpeed).toBe(STUDIO_VIRTUAL_SPACE_WALK_SPEED);
    expect(profile.sprintMultiplier).toBe(1.35);
    expect(profile.gaitDistancePerCycle).toBeUndefined();
  });

  it("양발 접지와 그림자의 주기를 맞추고 멈춤과 모션 감소에서는 고정한다", () => {
    expect(studioGaitShadowScale(0, 108, true, false)).toBe(1);
    expect(studioGaitShadowScale(27, 108, true, false)).toBeCloseTo(.92);
    expect(studioGaitShadowScale(54, 108, true, false)).toBe(1);
    expect(studioGaitShadowScale(108, 108, true, false)).toBe(1);
    expect(studioGaitShadowScale(27, 108, false, false)).toBe(1);
    expect(studioGaitShadowScale(27, 108, true, true)).toBe(1);
    expect(studioGaitShadowScale(NaN, 108, true, false)).toBe(1);
    expect(studioGaitShadowScale(27, 0, true, false)).toBe(1);
    const atWall = studioGaitShadowScale(21, 108, true, false);
    for (let render = 0; render < 120; render++) expect(studioGaitShadowScale(21, 108, true, false)).toBe(atWall);
  });
});

describe("몸의 보행 위상", () => {
  it("접지 순간에만 몸이 절제된 진폭(-2px)으로 낮아지고 그림자와 같은 거리 위상을 쓴다", () => {
    const stride = 108;
    const planted = studioGaitBodyOffset(27, stride, true, false);
    expect(planted.offsetY).toBeLessThan(0);
    expect(planted.offsetY).toBeCloseTo(-2, 6);
    expect(studioGaitBodyOffset(0, stride, true, false).offsetY).toBeCloseTo(0, 6);
    expect(studioGaitBodyOffset(54, stride, true, false).offsetY).toBeCloseTo(0, 6);

    for (let step = 0; step <= 108; step += 3) {
      const distance = step;
      const shadow = studioGaitShadowScale(distance, stride, true, false);
      const body = studioGaitBodyOffset(distance, stride, true, false);
      const shadowDip = 1 - shadow;
      const bodyDip = -body.offsetY;
      expect(shadowDip === 0, `거리 ${distance}`).toBe(bodyDip === 0);
      if (shadowDip > 0) expect(bodyDip / shadowDip, `거리 ${distance}`).toBeCloseTo(25, 6);
    }
  });

  it("좌우 흔들림(sway)을 제거해 보행 중 수평 요동이 0이다", () => {
    const stride = 108;
    for (const d of [0, 13.5, 27, 40.5, 54, 13.5 + stride]) {
      expect(studioGaitBodyOffset(d, stride, true, false).offsetX).toBe(0);
    }
  });

  it("정지·벽·모션 감소·입력 오류에서는 몸이 완전히 고정된다", () => {
    for (const offset of [
      studioGaitBodyOffset(27, 108, false, false),
      studioGaitBodyOffset(27, 108, true, true),
      studioGaitBodyOffset(NaN, 108, true, false),
      studioGaitBodyOffset(-5, 108, true, false),
      studioGaitBodyOffset(27, 0, true, false),
      studioGaitBodyOffset(27, Number.NaN, true, false),
    ]) {
      expect(offset).toEqual({ offsetX: 0, offsetY: 0 });
    }
  });

  it("보행 클립이 있는 내장 장소에서도 좌우 요동 없이 상하 리듬만 그림자와 동기화된다", () => {
    const profile = studioPlayerLocomotionProfile(true);
    expect(profile.gaitDistancePerCycle).toBeDefined();
    const stride = profile.gaitDistancePerCycle!;
    const moving = studioGaitBodyOffset(27, stride, true, false);
    const idle = studioGaitBodyOffset(27, stride, false, false);
    expect(moving.offsetY).toBeLessThan(idle.offsetY);
    expect(moving.offsetX).toBe(0);
    expect(studioPlayerLocomotionProfile(false).gaitDistancePerCycle).toBeUndefined();
  });
});

describe("카메라 추적 모드 변경", () => {
  it("렌더링마다 같은 모드를 전달해도 Phaser의 추적 위치를 다시 초기화하지 않는다", () => {
    const position = { scrollX: 0 };
    const camera = { setDeadzone: vi.fn(() => { position.scrollX = 500; }) };
    const controller = new StudioCameraFollowModeController(camera);
    controller.update("follow");
    position.scrollX = 128;
    for (let frame = 0; frame < 120; frame++) controller.update("follow");
    expect(position.scrollX).toBe(128);
    expect(camera.setDeadzone).toHaveBeenCalledExactlyOnceWith(150, 100);
    controller.update("steady");
    expect(camera.setDeadzone).toHaveBeenLastCalledWith(200, 135);
    controller.update("cinematic");
    expect(camera.setDeadzone).toHaveBeenLastCalledWith(110, 78);
    controller.update("follow");
    expect(camera.setDeadzone).toHaveBeenCalledTimes(4);
  });
});

describe("유효 보폭 단일화", () => {
  it("장소 프로필 강제 보폭이 클립 보폭보다 우선하고, 둘 다 없으면 표준 84를 쓴다", () => {
    expect(studioEffectiveGaitStride(108, 76)).toBe(108);
    expect(studioEffectiveGaitStride(undefined, 76)).toBe(76);
    expect(studioEffectiveGaitStride(undefined, undefined)).toBe(84);
  });

  it("0 이하·비유한 보폭은 없는 것으로 보고 다음 후보로 넘어간다", () => {
    expect(studioEffectiveGaitStride(0, 70)).toBe(70);
    expect(studioEffectiveGaitStride(Number.NaN, -5)).toBe(84);
    expect(studioEffectiveGaitStride(undefined, Number.POSITIVE_INFINITY)).toBe(84);
  });
});

describe("걸음 위상 안정화 및 등신 비율 고정", () => {
  it("보행 중 과도한 좌우 회전 흔들림과 접지 스쿼시를 제거해 항상 0도와 1.0 배율을 유지한다", () => {
    const stride = 84;
    for (let d = 0; d <= stride * 2; d += 7) {
      expect(studioGaitRockAngle(d, stride, true, false)).toBe(0);
      expect(studioGaitSquashScaleY(d, stride, true, false)).toBe(1);
      expect(studioGaitSquashScale(d, stride, true, false)).toEqual({ scaleX: 1, scaleY: 1 });
    }
    expect(studioGaitRockAngle(30, 84, false, false)).toBe(0);
    expect(studioGaitRockAngle(30, 84, true, true)).toBe(0);
    expect(studioGaitSquashScaleY(0, 84, false, false)).toBe(1);
    expect(studioGaitSquashScaleY(0, 84, true, true)).toBe(1);
  });
});

describe("대기 접지 안정성", () => {
  it("정지 중 좌우 흔들림과 몸 전체 찌그러짐(가짜 눈 깜빡임)이 항상 중립이다", () => {
    for (let t = 0; t <= 12_000; t += 250) {
      expect(studioIdleSwayOffsetX(t, 0.3, false)).toBe(0);
      expect(studioBlinkScaleY(t, 0, false)).toBe(1);
    }
    expect(studioIdleSwayOffsetX(1_000, 0.3, true)).toBe(0);
    expect(studioBlinkScaleY(1_000, 0.5, true)).toBe(1);
  });
});

describe("자리 비움 졸기 모션", () => {
  it("주기 안에서는 과도한 흔들림 없이 미세하게(0.8px, 0.6도) 내려갔다 돌아오고 주기 밖에서는 중립이다", () => {
    const deepest = studioAwayDozeMotion(850, 0, false);
    expect(deepest.offsetY).toBeCloseTo(0.8, 5);
    expect(Math.abs(deepest.angleDegrees)).toBeCloseTo(0.6, 5);
    expect(studioAwayDozeMotion(0, 0, false)).toEqual({ offsetY: 0, angleDegrees: 0 });
    expect(studioAwayDozeMotion(3_000, 0, false)).toEqual({ offsetY: 0, angleDegrees: 0 });
    expect(studioAwayDozeMotion(6_400 + 850, 0, false).offsetY).toBeCloseTo(0.8, 5);
  });

  it("시드가 다르면 위상과 기울기 방향이 어긋나고, 모션 감소에서는 항상 중립이다", () => {
    expect(studioAwayDozeMotion(850, 0.5, false).offsetY).toBe(0);
    expect(Math.sign(studioAwayDozeMotion(850, 0, false).angleDegrees)).toBe(-1);
    expect(Math.sign(studioAwayDozeMotion(3_410, 0.6, false).angleDegrees)).toBe(1);
    expect(studioAwayDozeMotion(850, 0, true)).toEqual({ offsetY: 0, angleDegrees: 0 });
  });
});

describe("이미지 스프라이트 서브프레임 위상 및 접지 그림자 농도", () => {
  it("접지 순간 그림자 알파가 가장 짙어지고 공중에서 옅어지며 정지 시 기본 알파를 유지한다", () => {
    const stride = 108;
    const planted = studioGaitShadowAlpha(27, stride, true, false, 0.28);
    const airborne = studioGaitShadowAlpha(0, stride, true, false, 0.28);
    expect(planted).toBeGreaterThan(0.28);
    expect(airborne).toBeLessThan(0.28);
    expect(studioGaitShadowAlpha(27, stride, false, false, 0.28)).toBe(0.28);
    expect(studioGaitShadowAlpha(27, stride, true, true, 0.28)).toBe(0.28);
  });

  it("대기·착석·보행 전 구간에서 상체 호흡 스케일 펌핑이 1.0으로 고정된다", () => {
    expect(studioIdleUpperBodyBreathScale(950, 0, false, false, false)).toEqual({ scaleX: 1, scaleY: 1 });
    expect(studioIdleUpperBodyBreathScale(950, 0, false, true, false)).toEqual({ scaleX: 1, scaleY: 1 });
    expect(studioIdleUpperBodyBreathScale(950, 0, true, false, false)).toEqual({ scaleX: 1, scaleY: 1 });
    expect(studioIdleUpperBodyBreathScale(950, 0, false, false, true)).toEqual({ scaleX: 1, scaleY: 1 });
  });

  it("서브프레임은 위상(0~1)만 계산하고 추가 스케일·기울기·리프트 요동을 만들지 않는다", () => {
    const stride = 84;
    const boundary0 = studioImageSpriteSubframeMotion(0, stride, 4, true, false);
    expect(boundary0).toEqual({ subframePhase: 0, liftPx: 0, tiltDeg: 0, scaleX: 1, scaleY: 1 });
    const mid0 = studioImageSpriteSubframeMotion(10.5, stride, 4, true, false);
    expect(mid0.subframePhase).toBeCloseTo(0.5, 3);
    expect(mid0.liftPx).toBe(0);
    expect(mid0.tiltDeg).toBe(0);
    expect(mid0.scaleX).toBe(1);
    expect(mid0.scaleY).toBe(1);
    expect(studioImageSpriteSubframeMotion(10.5, stride, 4, false, false)).toEqual({
      subframePhase: 0,
      liftPx: 0,
      tiltDeg: 0,
      scaleX: 1,
      scaleY: 1,
    });
  });
});

