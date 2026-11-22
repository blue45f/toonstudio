import { describe, expect, it } from "vitest";

import type { StudioWeatherCondition } from "../studio-virtual-space-weather";
import {
  STUDIO_CHARACTER_BODY_SCALE_LOCK,
  STUDIO_DAYLIGHT_MAX_KELVIN,
  STUDIO_DAYLIGHT_MIN_KELVIN,
  STUDIO_LIVE_BUBBLE_MAX_LENGTH,
  STUDIO_LIVE_CHARACTER_ACTIONS,
  STUDIO_LIVE_WORK_STATES,
  STUDIO_MINIMAP_CAMERA_BASE_ZOOM,
  STUDIO_MINIMAP_CAMERA_SPRINT_ZOOM,
  STUDIO_MINIMAP_DEFAULT_LANDMARKS,
  STUDIO_MINIMAP_LANDMARK_IDS,
  clampMinimapCameraPoint,
  computeVirtualSpaceContactShadow,
  computeVirtualSpaceDaylightAtHour,
  computeVirtualSpaceDaylightAtTimeOfDay,
  createVirtualSpaceLiveChoreographyState,
  createVirtualSpaceMinimapCameraState,
  isStudioLiveWorkState,
  isStudioMinimapLandmarkId,
  jumpMinimapCameraToLandmark,
  jumpMinimapCameraToPoint,
  normalizeDaylightHour,
  resolveStudioMinimapSprintZoom,
  resolveVirtualSpaceLiveChoreography,
  sampleVirtualSpaceLiveChoreographyPose,
  sanitizeLiveChoreographyBubble,
  stepVirtualSpaceMinimapCamera,
  studioDaylightPeriodForHour,
  studioDaylightPeriodLabel,
  studioKelvinToHexColor,
  studioMinimapLandmarkById,
  transitionVirtualSpaceLiveWorkState,
  type StudioLiveWorkState,
} from "./index";

const ALL_WEATHERS: readonly (StudioWeatherCondition | null)[] = [
  null,
  "clear",
  "cloudy",
  "fog",
  "rain",
  "snow",
  "thunderstorm",
];

describe("1. 24시간 자연광 색온도 · 창문 빛줄기(God-ray) · 캐릭터 발밑 접지 그림자", () => {
  it("24시간 전 구간(5분 간격 288샘플 + 자정 wrap-around)이 끊김 없이 연속적으로 변화한다", () => {
    const start0 = computeVirtualSpaceDaylightAtHour(0);
    const wrap24 = computeVirtualSpaceDaylightAtHour(24);
    expect(wrap24).toEqual(start0);

    const steps = 288;
    const samples = Array.from({ length: steps }, (_, index) =>
      computeVirtualSpaceDaylightAtHour((index * 24) / steps),
    );

    for (let index = 0; index < steps; index += 1) {
      const current = samples[index];
      const next = samples[(index + 1) % steps];

      expect(current.kelvin).toBeGreaterThanOrEqual(STUDIO_DAYLIGHT_MIN_KELVIN);
      expect(current.kelvin).toBeLessThanOrEqual(STUDIO_DAYLIGHT_MAX_KELVIN);
      expect(current.colorHex).toMatch(/^#[0-9a-f]{6}$/);
      expect(current.godRay.colorHex).toMatch(/^#[0-9a-f]{6}$/);
      expect(current.contactShadow.colorHex).toMatch(/^#[0-9a-f]{6}$/);
      expect(current.godRay.opacity).toBeGreaterThanOrEqual(0);
      expect(current.godRay.opacity).toBeLessThanOrEqual(0.55);
      expect(current.contactShadow.lengthMultiplier).toBeGreaterThanOrEqual(0.55);
      expect(current.contactShadow.lengthMultiplier).toBeLessThanOrEqual(1.85);
      expect(current.contactShadow.opacity).toBeGreaterThanOrEqual(0.1);
      expect(current.contactShadow.opacity).toBeLessThanOrEqual(0.44);

      // 5분 간격 연속성(자정 23:55 -> 00:00 경계 포함)
      expect(Math.abs(next.kelvin - current.kelvin)).toBeLessThanOrEqual(160);
      expect(Math.abs(next.godRay.angleDeg - current.godRay.angleDeg)).toBeLessThanOrEqual(3);
      expect(Math.abs(next.godRay.opacity - current.godRay.opacity)).toBeLessThanOrEqual(0.04);
      expect(Math.abs(next.contactShadow.lengthMultiplier - current.contactShadow.lengthMultiplier)).toBeLessThanOrEqual(0.07);
      expect(Math.abs(next.contactShadow.opacity - current.contactShadow.opacity)).toBeLessThanOrEqual(0.02);
    }
  });

  it("아침·낮·노을·야간 스탠드 4대 시간대의 색온도·빛줄기 방향·그림자 길이가 물리적으로 정합하다", () => {
    const morning = computeVirtualSpaceDaylightAtHour(8.5);
    const midday = computeVirtualSpaceDaylightAtHour(12.5);
    const sunset = computeVirtualSpaceDaylightAtHour(18.2);
    const nightLamp = computeVirtualSpaceDaylightAtHour(0.0);

    expect(morning.period).toBe("morning");
    expect(midday.period).toBe("day");
    expect(sunset.period).toBe("sunset");
    expect(nightLamp.period).toBe("night-lamp");

    expect(studioDaylightPeriodForHour(7)).toBe("morning");
    expect(studioDaylightPeriodLabel("night-lamp").ko).toBe("야간 스탠드");

    // 한낮 6800K 피크 vs 야간 스탠드 2700K
    expect(midday.kelvin).toBe(6_800);
    expect(nightLamp.kelvin).toBe(2_700);
    expect(morning.kelvin).toBeGreaterThan(sunset.kelvin);
    expect(nightLamp.deskLampWeight).toBeGreaterThan(0.9);
    expect(midday.deskLampWeight).toBe(0);

    // 아침은 동쪽 창문(우하향 directionX > 0), 노을은 서쪽 창문(좌하향 directionX < 0)
    expect(morning.godRay.directionX).toBeGreaterThan(0.3);
    expect(sunset.godRay.directionX).toBeLessThan(-0.3);
    expect(Math.hypot(morning.godRay.directionX, morning.godRay.directionY)).toBeCloseTo(1, 3);

    // 정오는 고도가 높아 그림자가 가장 짧고, 아침·노을은 길게 늘어진다
    expect(midday.contactShadow.lengthMultiplier).toBeLessThan(0.75);
    expect(morning.contactShadow.lengthMultiplier).toBeGreaterThan(1.1);
    expect(sunset.contactShadow.lengthMultiplier).toBeGreaterThan(1.5);
    expect(sunset.godRay.opacity).toBeGreaterThan(nightLamp.godRay.opacity);
  });

  it("시간대·날씨·점프 높이·착석 여부 전 조합에서 캐릭터 본체 scaleX/scaleY가 항상 1.0 고정이다", () => {
    expect(STUDIO_CHARACTER_BODY_SCALE_LOCK).toEqual({ scaleX: 1, scaleY: 1 });

    for (let hour = 0; hour < 24; hour += 1) {
      for (const weather of ALL_WEATHERS) {
        for (const jumpHeightPx of [0, 14, 34]) {
          for (const seated of [false, true]) {
            const sample = computeVirtualSpaceDaylightAtHour(hour + 0.35, {
              weather,
              jumpHeightPx,
              seated,
            });
            expect(sample.characterScale).toEqual({ scaleX: 1, scaleY: 1 });
            expect(sample.contactShadow.characterScaleX).toBe(1);
            expect(sample.contactShadow.characterScaleY).toBe(1);
            expect(sample.kelvin).toBeGreaterThanOrEqual(STUDIO_DAYLIGHT_MIN_KELVIN);
            expect(sample.kelvin).toBeLessThanOrEqual(STUDIO_DAYLIGHT_MAX_KELVIN);
          }
        }
      }
    }

    // 점프 공중 및 흐린 날씨에서는 접지 그림자만 자연스럽게 감쇠한다(본체 스케일은 여전히 1.0)
    const ground = computeVirtualSpaceDaylightAtHour(12.5, { weather: "clear", jumpHeightPx: 0 });
    const airborne = computeVirtualSpaceDaylightAtHour(12.5, { weather: "clear", jumpHeightPx: 32 });
    const stormy = computeVirtualSpaceDaylightAtHour(12.5, { weather: "thunderstorm", jumpHeightPx: 0 });
    expect(airborne.contactShadow.radiusX).toBeLessThan(ground.contactShadow.radiusX);
    expect(airborne.contactShadow.opacity).toBeLessThan(ground.contactShadow.opacity);
    expect(airborne.contactShadow.characterScaleX).toBe(1);
    expect(airborne.contactShadow.characterScaleY).toBe(1);
    expect(stormy.godRay.opacity).toBeLessThan(ground.godRay.opacity);
    expect(stormy.contactShadow.opacity).toBeLessThan(ground.contactShadow.opacity);

    const directShadow = computeVirtualSpaceContactShadow(ground, { seated: true, baseRadiusX: 26 });
    expect(directShadow.characterScaleX).toBe(1);
    expect(directShadow.characterScaleY).toBe(1);
    expect(directShadow.lengthPx).toBeGreaterThan(0);
  });

  it("음수·초과·NaN 시각과 하루 분율(0..1) 및 색온도 경계값을 안전하게 처리한다", () => {
    expect(normalizeDaylightHour(-2)).toBe(22);
    expect(normalizeDaylightHour(26)).toBe(2);
    expect(normalizeDaylightHour(Number.NaN)).toBe(12);
    expect(computeVirtualSpaceDaylightAtTimeOfDay(0.5)).toEqual(computeVirtualSpaceDaylightAtHour(12));
    expect(computeVirtualSpaceDaylightAtTimeOfDay(Number.POSITIVE_INFINITY)).toEqual(computeVirtualSpaceDaylightAtHour(12));
    expect(studioKelvinToHexColor(1000)).toBe(studioKelvinToHexColor(STUDIO_DAYLIGHT_MIN_KELVIN));
    expect(studioKelvinToHexColor(12000)).toBe(studioKelvinToHexColor(STUDIO_DAYLIGHT_MAX_KELVIN));
  });
});

describe("2. 실시간 작업 상태 연동 캐릭터 모션 · 상체 제스처 · 말풍선", () => {
  it("작업 상태 5종이 캐릭터 동작 4종(타블렛 작화·커피 휴식·회의실 착석·마감 환호)·제스처·말풍선으로 빠짐없이 매핑된다", () => {
    expect(STUDIO_LIVE_WORK_STATES).toEqual(["line-art", "coloring", "bg3d", "deadline-qa", "idle-break"]);
    expect(isStudioLiveWorkState("line-art")).toBe(true);
    expect(isStudioLiveWorkState("unknown-state")).toBe(false);

    const reachedActions = new Set<string>();
    for (const workState of STUDIO_LIVE_WORK_STATES) {
      const preset = resolveVirtualSpaceLiveChoreography(workState);
      reachedActions.add(preset.action);
      expect(preset.scaleX).toBe(1);
      expect(preset.scaleY).toBe(1);
      expect(preset.bodyScale).toEqual({ scaleX: 1, scaleY: 1 });
      expect(preset.bubbleKo.length).toBeGreaterThan(0);
      expect(preset.bubbleEn.length).toBeGreaterThan(0);
    }

    for (const action of STUDIO_LIVE_CHARACTER_ACTIONS) {
      expect(reachedActions.has(action), `미도달 캐릭터 동작: ${action}`).toBe(true);
    }

    expect(resolveVirtualSpaceLiveChoreography("line-art").action).toBe("tablet-drawing");
    expect(resolveVirtualSpaceLiveChoreography("coloring").action).toBe("tablet-drawing");
    expect(resolveVirtualSpaceLiveChoreography("bg3d").action).toBe("meeting-seated");
    expect(resolveVirtualSpaceLiveChoreography("deadline-qa").action).toBe("deadline-cheer");
    expect(resolveVirtualSpaceLiveChoreography("deadline-qa", { deadlineQaStage: "checking" }).action).toBe("meeting-seated");
    expect(resolveVirtualSpaceLiveChoreography("idle-break").action).toBe("coffee-break");
  });

  it("작업 상태 전환·히스테리시스·말풍선 살균 및 전 프레임 몸 크기 변형 0(scale 1.0)을 보장한다", () => {
    let state = createVirtualSpaceLiveChoreographyState("line-art", 1_000);
    // 동일 상태 재요청은 참조 유지
    expect(transitionVirtualSpaceLiveWorkState(state, "line-art", 1_050)).toBe(state);
    // minHoldMs 미만이면 빠른 채터링 전환 차단
    expect(transitionVirtualSpaceLiveWorkState(state, "coloring", 1_080, { minHoldMs: 200 })).toBe(state);

    const sequence: readonly StudioLiveWorkState[] = [
      "coloring",
      "bg3d",
      "deadline-qa",
      "idle-break",
      "line-art",
    ];
    let nowMs = 1_500;
    for (const nextState of sequence) {
      const prev = state.workState;
      state = transitionVirtualSpaceLiveWorkState(state, nextState, nowMs, {
        deadlineQaStage: nextState === "deadline-qa" ? "cleared" : undefined,
      });
      expect(state.previousWorkState).toBe(prev);
      expect(state.workState).toBe(nextState);

      for (let frame = 0; frame < 30; frame += 1) {
        const pose = sampleVirtualSpaceLiveChoreographyPose(state, nowMs + frame * 33, false);
        expect(pose.scaleX).toBe(1);
        expect(pose.scaleY).toBe(1);
        expect(pose.bubbleVisible).toBe(true);
        expect(pose.transitionBlend).toBeGreaterThanOrEqual(0);
        expect(pose.transitionBlend).toBeLessThanOrEqual(1);

        const reducedPose = sampleVirtualSpaceLiveChoreographyPose(state, nowMs + frame * 33, true);
        expect(reducedPose.scaleX).toBe(1);
        expect(reducedPose.scaleY).toBe(1);
        expect(reducedPose.transitionBlend).toBe(1);
        expect(reducedPose.headTiltDeg).toBe(0);
        expect(reducedPose.shoulderYawDeg).toBe(0);
        expect(reducedPose.dominantHandOffsetX).toBe(0);
        expect(reducedPose.dominantHandOffsetY).toBe(0);
        expect(reducedPose.steamPhase).toBe(0);
      }
      nowMs += 1_200;
    }

    // 말풍선 살균(제어 문자 제거 및 최대 길이 제한)
    const dirty = `  \u0000마감\t완료!\n${"가".repeat(80)}  `;
    const cleaned = sanitizeLiveChoreographyBubble(dirty);
    expect(cleaned).not.toBeNull();
    expect(cleaned?.length).toBeLessThanOrEqual(STUDIO_LIVE_BUBBLE_MAX_LENGTH);
    expect(cleaned?.startsWith("마감 완료!")).toBe(true);
    expect(sanitizeLiveChoreographyBubble("   \u0007  ")).toBeNull();
  });

  it("browser-KV(localStorage·indexedDB)에 단 한 번도 접근하지 않는다", () => {
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const indexedDbDescriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    let kvTouches = 0;

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        kvTouches += 1;
        throw new Error("localStorage direct access is forbidden");
      },
    });
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      get() {
        kvTouches += 1;
        throw new Error("indexedDB direct access is forbidden");
      },
    });

    try {
      let state = createVirtualSpaceLiveChoreographyState("line-art", 0);
      for (const workState of STUDIO_LIVE_WORK_STATES) {
        state = transitionVirtualSpaceLiveWorkState(state, workState, 1_000, {
          customBubble: `${workState} 작업 확인`,
        });
        const pose = sampleVirtualSpaceLiveChoreographyPose(state, 1_450, false);
        expect(pose.scaleX).toBe(1);
        expect(pose.scaleY).toBe(1);
      }
      expect(kvTouches).toBe(0);
    } finally {
      if (localStorageDescriptor) {
        Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, "localStorage");
      }
      if (indexedDbDescriptor) {
        Object.defineProperty(globalThis, "indexedDB", indexedDbDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, "indexedDB");
      }
    }
  });
});

describe("3. 미니맵 원클릭 임계 감쇠 카메라 추적기 · 달리기 시야 확장 · reducedMotion", () => {
  it("작업실·회의실·외주 광장·휴게실 4대 거점 원클릭 이동이 오버슈트 없이 임계 감쇠로 수렴한다", () => {
    expect(STUDIO_MINIMAP_LANDMARK_IDS).toEqual([
      "workroom",
      "meeting-room",
      "outsourcing-plaza",
      "lounge",
    ]);
    expect(STUDIO_MINIMAP_DEFAULT_LANDMARKS).toHaveLength(4);
    expect(isStudioMinimapLandmarkId("outsourcing-plaza")).toBe(true);
    expect(isStudioMinimapLandmarkId("invalid")).toBe(false);

    const startLandmark = studioMinimapLandmarkById("workroom");
    const targetLandmark = studioMinimapLandmarkById("lounge");
    let camera = createVirtualSpaceMinimapCameraState({ landmarkId: "workroom" });
    expect(camera.x).toBe(startLandmark.target.x);
    expect(camera.y).toBe(startLandmark.target.y);
    expect(camera.settled).toBe(true);

    camera = jumpMinimapCameraToLandmark(camera, "lounge");
    expect(camera.mode).toBe("minimap-jump");
    expect(camera.activeLandmarkId).toBe("lounge");
    expect(camera.settled).toBe(false);

    let prevX = camera.x;
    let prevY = camera.y;
    for (let frame = 0; frame < 150; frame += 1) {
      camera = stepVirtualSpaceMinimapCamera(camera, { deltaSeconds: 1 / 60 });
      // 임계 감쇠 특성: 단조 증가하며 목표 지점을 절대 지나치지 않는다(오버슈트 0)
      expect(camera.x).toBeGreaterThanOrEqual(prevX - 1e-6);
      expect(camera.y).toBeGreaterThanOrEqual(prevY - 1e-6);
      expect(camera.x).toBeLessThanOrEqual(targetLandmark.target.x + 1e-6);
      expect(camera.y).toBeLessThanOrEqual(targetLandmark.target.y + 1e-6);
      prevX = camera.x;
      prevY = camera.y;
    }

    expect(camera.settled).toBe(true);
    expect(camera.x).toBeCloseTo(targetLandmark.target.x, 2);
    expect(camera.y).toBeCloseTo(targetLandmark.target.y, 2);
    expect(camera.vx).toBe(0);
    expect(camera.vy).toBe(0);

    // 나머지 거점(회의실 → 외주 광장) 연속 전환도 안정적으로 수렴
    for (const landmarkId of ["meeting-room", "outsourcing-plaza"] as const) {
      const dest = studioMinimapLandmarkById(landmarkId);
      camera = jumpMinimapCameraToLandmark(camera, landmarkId);
      for (let frame = 0; frame < 150; frame += 1) {
        camera = stepVirtualSpaceMinimapCamera(camera, { deltaSeconds: 1 / 60 });
      }
      expect(camera.settled, landmarkId).toBe(true);
      expect(camera.x, landmarkId).toBeCloseTo(dest.target.x, 2);
      expect(camera.y, landmarkId).toBeCloseTo(dest.target.y, 2);
    }
  });

  it("달리기 시 시야가 1.0 → 0.94로 미세 확장되고, 멈추면 1.0으로 부드럽게 복귀한다", () => {
    expect(STUDIO_MINIMAP_CAMERA_BASE_ZOOM).toBe(1.0);
    expect(STUDIO_MINIMAP_CAMERA_SPRINT_ZOOM).toBe(0.94);
    expect(resolveStudioMinimapSprintZoom({ sprinting: false })).toBe(1.0);
    expect(resolveStudioMinimapSprintZoom({ sprinting: true })).toBe(0.94);
    expect(resolveStudioMinimapSprintZoom({ sprinting: true, sprintSpeedRatio: 0.5 })).toBe(0.97);
    expect(resolveStudioMinimapSprintZoom({ sprinting: true, reducedMotion: true })).toBe(1.0);

    let camera = createVirtualSpaceMinimapCameraState({ x: 300, y: 300 });
    for (let frame = 0; frame < 120; frame += 1) {
      camera = stepVirtualSpaceMinimapCamera(camera, {
        deltaSeconds: 1 / 60,
        followTarget: { x: 300 + frame * 3, y: 300 },
        sprinting: true,
      });
      expect(camera.zoom).toBeGreaterThanOrEqual(STUDIO_MINIMAP_CAMERA_SPRINT_ZOOM - 1e-6);
      expect(camera.zoom).toBeLessThanOrEqual(STUDIO_MINIMAP_CAMERA_BASE_ZOOM + 1e-6);
    }
    expect(camera.zoom).toBeCloseTo(0.94, 3);

    // 달리기 종료 후 1.0으로 복귀
    const stopPoint = { x: camera.targetX, y: camera.targetY };
    for (let frame = 0; frame < 120; frame += 1) {
      camera = stepVirtualSpaceMinimapCamera(camera, {
        deltaSeconds: 1 / 60,
        followTarget: stopPoint,
        sprinting: false,
      });
    }
    expect(camera.zoom).toBeCloseTo(1.0, 3);
    expect(camera.settled).toBe(true);
  });

  it("prefers-reduced-motion에서는 미니맵 원클릭 점프·추적이 즉시 이동하고 줌을 1.0으로 고정한다", () => {
    const start = createVirtualSpaceMinimapCameraState({ landmarkId: "workroom" });
    const meeting = studioMinimapLandmarkById("meeting-room");
    const jumped = jumpMinimapCameraToLandmark(start, "meeting-room", { reducedMotion: true });

    expect(jumped.x).toBe(meeting.target.x);
    expect(jumped.y).toBe(meeting.target.y);
    expect(jumped.vx).toBe(0);
    expect(jumped.vy).toBe(0);
    expect(jumped.zoom).toBe(1.0);
    expect(jumped.settled).toBe(true);

    // reducedMotion에서 달리기 + 추적 복귀 시에도 즉시 스냅 & 줌 1.0 유지
    const stepped = stepVirtualSpaceMinimapCamera(jumped, {
      deltaSeconds: 1 / 60,
      followTarget: { x: 420, y: 610 },
      resumeFollow: true,
      sprinting: true,
      reducedMotion: true,
    });
    expect(stepped.x).toBe(420);
    expect(stepped.y).toBe(610);
    expect(stepped.zoom).toBe(1.0);
    expect(stepped.vx).toBe(0);
    expect(stepped.vy).toBe(0);
    expect(stepped.settled).toBe(true);
  });

  it("월드 경계 클램프와 임의 좌표 점프가 화면 밖 공백으로 이탈하지 않도록 제한한다", () => {
    const bounds = {
      worldWidth: 1280,
      worldHeight: 960,
      viewportWidth: 640,
      viewportHeight: 480,
    };
    const clamped = clampMinimapCameraPoint({ x: -120, y: 2000 }, bounds);
    expect(clamped).toEqual({ x: 320, y: 720 });

    const start = createVirtualSpaceMinimapCameraState({ x: 640, y: 480, bounds });
    const jumped = jumpMinimapCameraToPoint(start, { x: 1260, y: 10 }, {
      reducedMotion: true,
      bounds,
    });
    expect(jumped.x).toBe(960);
    expect(jumped.y).toBe(240);
    expect(stepVirtualSpaceMinimapCamera(jumped, { deltaSeconds: 0, bounds })).toBe(jumped);
  });
});
