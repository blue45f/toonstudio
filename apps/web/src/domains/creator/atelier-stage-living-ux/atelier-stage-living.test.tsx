// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ATELIER_STAGE_BRAND_NAME, ATELIER_STAGE_SCHEMA_VERSION, ATELIER_STAGE_STUDIO_NAME,
  AVATAR_COLLISION_RADIUS_M, AVATAR_FOOT_GROUND_Y, CORE_DOCK_ACTION_BUDGET,
  CREATOR_STAGE_POSES, DEFAULT_WALL_STICKY_NOTES, LOOK_AT_MAX_YAW_DEG,
  MAX_DOCK_OCCLUSION_PERCENT, PROXIMITY_CLEAR_RADIUS_M, PROXIMITY_FADE_RADIUS_M,
  PROXIMITY_WHISPER_RADIUS_M, RUN_MAX_SPEED_MPS, STAGE_AMBIENCE_PRESETS,
  STAGE_COLLABORATOR_DESKS, STAGE_CORE_DOCK_ACTIONS, STAGE_FURNITURE_OBSTACLES,
  STAGE_ROOM_DEPTH_M, STAGE_ROOM_WIDTH_M, STAGE_STICKY_NOTE_COLORS, STAGE_VOICE_CHAT_ZONES,
  StudioAtelierStageLivingPanel, VIOLET_HUE_MAX, VIOLET_HUE_MIN, WALK_MAX_SPEED_MPS,
  addWallStickyNote, buildAtelierStageLivingSnapshot, computeClampedLookAt,
  cycleWallStickyNoteColor, evaluateAvatarLocomotionAndPose, evaluateProximityBubble,
  evaluateStageDockBudget, evaluateStageInteractions, exportAtelierStageLivingJson,
  formatOklch, getCreatorPoseSpec, getStageAmbiencePreset, isForbiddenVioletHue,
  normalizeHue, resolveAvatarObstacleSlide, toggleWallStickyNoteDone,
  type CreatorPoseId, type StageAmbiencePresetId,
} from "./index";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function assertZeroRawColorsAndZeroViolet(markup: string): void {
  expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  expect(markup).not.toMatch(/\brgba?\s*\(/iu);
  expect(markup).not.toMatch(/\bhsla?\s*\(/iu);
  for (const match of markup.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu)) {
    expect(isForbiddenVioletHue(Number(match[1]))).toBe(false);
  }
}

describe("1. 캐릭터 자연 이동 & AABB 장애물 슬라이드 충돌 해소", () => {
  it("클릭 이동(Click-to-Walk)이 목표 지점으로 부드럽게 전진하고 방향각을 갱신한다", () => {
    const state = evaluateAvatarLocomotionAndPose({
      currentPos: { x: 4.0, y: 4.0 },
      targetPos: { x: 7.0, y: 4.0 },
      dtSec: 0.25,
    });
    expect(state.position.x).toBeGreaterThan(4.0);
    expect(state.position.y).toBeCloseTo(4.0, 2);
    expect(state.facingDeg).toBe(0);
    expect(state.gait).toBe("walking");
    expect(state.arrivedAtTarget).toBe(false);
    expect(state.footGroundY).toBe(0);
  });

  it("클릭 이동 목표 근접(1.05m 이내)에서 감속 곡선이 적용되고 도착 시 깔끔히 정지한다", () => {
    const slowing = evaluateAvatarLocomotionAndPose({
      currentPos: { x: 4.0, y: 4.0 },
      targetPos: { x: 4.45, y: 4.0 },
      dtSec: 0.2,
    });
    expect(slowing.speedMps).toBeGreaterThan(0);
    expect(slowing.speedMps).toBeLessThan(WALK_MAX_SPEED_MPS);
    expect(slowing.gait).toBe("decelerating");

    const arrived = evaluateAvatarLocomotionAndPose({
      currentPos: { x: 4.0, y: 4.0 },
      targetPos: { x: 4.05, y: 4.0 },
      dtSec: 0.2,
    });
    expect(arrived.arrivedAtTarget).toBe(true);
    expect(arrived.speedMps).toBe(0);
    expect(arrived.gait).toBe("idle");
  });

  it("WASD 방향 입력과 달리기(sprint) 전환이 걷기/달리기 속도 및 보폭 리듬을 구분한다", () => {
    const walk = evaluateAvatarLocomotionAndPose({
      currentPos: { x: 4.2, y: 4.2 },
      velocity: { vx: 1.4, vy: 0 },
      directionalInput: { x: 1, y: 0 },
      sprint: false,
      dtSec: 0.25,
    });
    const run = evaluateAvatarLocomotionAndPose({
      currentPos: { x: 4.2, y: 4.2 },
      velocity: { vx: 2.8, vy: 0 },
      directionalInput: { x: 1, y: 0 },
      sprint: true,
      dtSec: 0.25,
    });
    expect(walk.gait).toBe("walking");
    expect(run.gait).toBe("running");
    expect(run.speedMps).toBeGreaterThan(walk.speedMps);
    expect(run.maxSpeedMps).toBe(RUN_MAX_SPEED_MPS);
    expect(run.strideFrequencyHz).toBeGreaterThan(walk.strideFrequencyHz);
  });

  it("방향 키를 떼면 관성 감속(decelerating) 후 자연스럽게 정지하고 모션 감소 모드에서는 상하 흔들림이 0이다", () => {
    const coasting = evaluateAvatarLocomotionAndPose({
      currentPos: { x: 5.0, y: 4.2 },
      velocity: { vx: 1.5, vy: 0 },
      dtSec: 0.12,
      reducedMotion: false,
    });
    expect(coasting.gait).toBe("decelerating");
    expect(coasting.speedMps).toBeLessThan(1.5);
    expect(coasting.pelvisBobMm).toBeGreaterThan(0);

    const calm = evaluateAvatarLocomotionAndPose({
      currentPos: { x: 5.0, y: 4.2 },
      velocity: { vx: 1.5, vy: 0 },
      directionalInput: { x: 1, y: 0 },
      dtSec: 0.2,
      reducedMotion: true,
    });
    expect(calm.pelvisBobMm).toBe(0);
  });

  it("책상 AABB에 대각선으로 접근할 때 막혀 멈추지 않고 축 슬라이드로 미끄러지며 관통 0을 유지한다", () => {
    const desk = STAGE_FURNITURE_OBSTACLES.find((o) => o.id === "obs-desk-lineart");
    expect(desk).toBeDefined();
    const startPos = { x: 5.5, y: 3.16 };
    const desiredPos = { x: 6.1, y: 2.85 };
    const res = resolveAvatarObstacleSlide(startPos, desiredPos);

    expect(res.collided).toBe(true);
    expect(res.collidedObstacleIds).toContain("obs-desk-lineart");
    expect(res.slidAlongAxis).toBe("x");
    expect(res.position.x).toBeGreaterThan(startPos.x);
    expect(res.position.y).toBeGreaterThanOrEqual((desk?.maxY ?? 2.7) + AVATAR_COLLISION_RADIUS_M - 0.002);
  });

  it("소파 모서리 강제 관통 입력과 방 외벽 이탈 시도 모두 안전 좌표로 밀어낸다", () => {
    const wallClamped = resolveAvatarObstacleSlide({ x: 0.6, y: 4.0 }, { x: -2.0, y: 9.8 });
    expect(wallClamped.collided).toBe(true);
    expect(wallClamped.position.x).toBeGreaterThanOrEqual(AVATAR_COLLISION_RADIUS_M);
    expect(wallClamped.position.y).toBeLessThanOrEqual(STAGE_ROOM_DEPTH_M - AVATAR_COLLISION_RADIUS_M);

    const eastWall = resolveAvatarObstacleSlide({ x: 10.2, y: 6.8 }, { x: 14.5, y: 6.8 });
    expect(eastWall.collided).toBe(true);
    expect(eastWall.position.x).toBeLessThanOrEqual(STAGE_ROOM_WIDTH_M - AVATAR_COLLISION_RADIUS_M);

    const cornerPush = resolveAvatarObstacleSlide({ x: 2.5, y: 6.0 }, { x: 2.5, y: 6.0 });
    expect(cornerPush.collided).toBe(true);
    expect(cornerPush.collidedObstacleIds).toContain("obs-sofa-lounge");
    expect(cornerPush.slidAlongAxis).toBe("corner-push");
  });
});

describe("2. 시선 자동 추적 Look-At ±55° 클램프 & 8종 포즈 바닥 접지(footGroundY === 0)", () => {
  it("시선 대상이 ±55° 이내이면 정확한 각도로 추적하고 clamped=false를 반환한다", () => {
    const look = computeClampedLookAt({ x: 5, y: 4 }, 0, { x: 7, y: 5 });
    expect(look.targetLocked).toBe(true);
    expect(look.clamped).toBe(false);
    expect(Math.abs(look.headYawOffsetDeg)).toBeLessThanOrEqual(LOOK_AT_MAX_YAW_DEG);
    expect(look.headYawOffsetDeg).toBeCloseTo(26.6, 0);
    expect(look.recommendedBodyTurnDeg).toBe(0);
  });

  it("시선 대상이 +55°를 초과하면 +55°로 엄격 클램프하고 남은 몸체 회전각을 제안한다", () => {
    const look = computeClampedLookAt({ x: 5, y: 4 }, 0, { x: 4, y: 6 });
    expect(look.clamped).toBe(true);
    expect(look.headYawOffsetDeg).toBe(LOOK_AT_MAX_YAW_DEG);
    expect(look.maxYawClampDeg).toBe(55);
    expect(look.recommendedBodyTurnDeg).toBeGreaterThan(0);
  });

  it("시선 대상이 -55° 미만이면 -55°로 엄격 클램프한다", () => {
    const look = computeClampedLookAt({ x: 5, y: 4 }, 0, { x: 4, y: 2 });
    expect(look.clamped).toBe(true);
    expect(look.headYawOffsetDeg).toBe(-LOOK_AT_MAX_YAW_DEG);
    expect(look.recommendedBodyTurnDeg).toBeLessThan(0);
  });

  it("0°/360° 경계를 넘는 시선 각도 차이를 최단 부호각으로 계산한다", () => {
    const look = computeClampedLookAt({ x: 5, y: 4 }, 350, { x: 7, y: 4.5 });
    expect(look.clamped).toBe(false);
    expect(look.headYawOffsetDeg).toBeGreaterThan(0);
    expect(look.headYawOffsetDeg).toBeLessThan(35);
  });

  it("8종 원클릭 창작자 포즈 ID가 명세와 정확히 일치한다", () => {
    const expectedIds: readonly CreatorPoseId[] = [
      "sit-drawing", "stretch-break", "coffee-sip", "wave-hello",
      "applause-cheer", "peek-critique", "focus-headphones", "nap-desk",
    ];
    expect(CREATOR_STAGE_POSES.map((p) => p.id)).toEqual(expectedIds);
    expect(CREATOR_STAGE_POSES).toHaveLength(8);
  });

  it("8종 포즈 전체와 정지·걷기·달리기 상태에서 발바닥 접지(footGroundY === 0, grounded === true)가 깨지지 않는다", () => {
    for (const pose of CREATOR_STAGE_POSES) {
      expect(pose.footGroundY).toBe(AVATAR_FOOT_GROUND_Y);
      const idle = evaluateAvatarLocomotionAndPose({ currentPos: { x: 5.5, y: 4.2 }, poseId: pose.id });
      const moving = evaluateAvatarLocomotionAndPose({
        currentPos: { x: 5.5, y: 4.2 },
        directionalInput: { x: 1, y: 0 },
        sprint: true,
        poseId: pose.id,
      });
      expect(idle.footGroundY).toBe(0);
      expect(idle.grounded).toBe(true);
      expect(moving.footGroundY).toBe(0);
      expect(moving.grounded).toBe(true);
    }
  });
});

describe("3. 거리 기반 말풍선 자동 페이드(3.2m · 5.5m) & 3단계 음성·채팅 존", () => {
  it("기본 책상 그룹 존에서 3.2m 이내는 선명(opacity=1, clarity=clear)하다", () => {
    const near = evaluateProximityBubble(1.2, "table");
    const edge = evaluateProximityBubble(PROXIMITY_CLEAR_RADIUS_M, "table");
    expect(near).toMatchObject({ clarity: "clear", opacity: 1, audible: true, proximityTier: "whisper" });
    expect(edge).toMatchObject({ clarity: "clear", opacity: 1, audible: true, proximityTier: "table" });
  });

  it("3.2m 초과 ~ 5.5m 이내는 거리에 따라 단조 감쇠(fading)된다", () => {
    const mid1 = evaluateProximityBubble(3.8, "table");
    const mid2 = evaluateProximityBubble(4.6, "table");
    const edgeFade = evaluateProximityBubble(PROXIMITY_FADE_RADIUS_M, "table");
    expect(mid1.clarity).toBe("fading");
    expect(mid2.clarity).toBe("fading");
    expect(edgeFade.clarity).toBe("fading");
    expect(mid1.opacity).toBeGreaterThan(mid2.opacity);
    expect(mid2.opacity).toBeGreaterThan(edgeFade.opacity);
    expect(edgeFade.opacity).toBeGreaterThan(0);
    expect(edgeFade.audible).toBe(true);
  });

  it("5.5m 초과 원거리는 조용함(quiet, opacity=0, audible=false)으로 자동 음소거된다", () => {
    const far = evaluateProximityBubble(5.6, "table");
    expect(far).toEqual({ clarity: "quiet", opacity: 0, audible: false, proximityTier: "quiet" });
  });

  it("Whisper(1.8m) · Table(3.2m) · Room(5.5m) 3단계 존 규격과 감쇠 반경이 정확하다", () => {
    expect(STAGE_VOICE_CHAT_ZONES.map((z) => z.id)).toEqual(["whisper", "table", "room"]);
    expect(evaluateProximityBubble(PROXIMITY_WHISPER_RADIUS_M, "whisper").clarity).toBe("clear");
    expect(evaluateProximityBubble(2.5, "whisper").clarity).toBe("fading");
    expect(evaluateProximityBubble(3.5, "whisper").clarity).toBe("quiet");
    expect(evaluateProximityBubble(5.0, "room").clarity).toBe("clear");
    expect(evaluateProximityBubble(7.0, "room").clarity).toBe("fading");
  });

  it("아바타가 동쪽 책상군으로 이동하면 들리는 동료 수와 선명 대상이 실시간 변동한다", () => {
    const west = evaluateStageInteractions({ avatarPos: { x: 2.2, y: 3.4 }, voiceChatZone: "table" });
    const east = evaluateStageInteractions({ avatarPos: { x: 8.9, y: 3.8 }, voiceChatZone: "table" });
    const subinFromWest = west.peerBubbles.find((b) => b.deskId === "desk-lead");
    const subinFromEast = east.peerBubbles.find((b) => b.deskId === "desk-lead");
    expect(subinFromWest?.clarity).toBe("clear");
    expect(subinFromEast?.clarity).toBe("quiet");
    expect(east.peerBubbles.find((b) => b.deskId === "desk-color")?.clarity).toBe("clear");
  });
});

describe("4. 벽면 포스트잇 & 콘티 핀보드 상호작용", () => {
  it("기본 4개 콘티 포스트잇과 4종 무바이올렛 OKLCH 색상이 정상 구성된다", () => {
    expect(DEFAULT_WALL_STICKY_NOTES).toHaveLength(4);
    expect(STAGE_STICKY_NOTE_COLORS).toHaveLength(4);
    for (const c of STAGE_STICKY_NOTE_COLORS) {
      expect(isForbiddenVioletHue(c.fill.h)).toBe(false);
      expect(isForbiddenVioletHue(c.border.h)).toBe(false);
      expect(isForbiddenVioletHue(c.ink.h)).toBe(false);
    }
  });

  it("addWallStickyNote가 새 메모를 순차 ID와 핀 슬롯으로 추가한다", () => {
    const next = addWallStickyNote(DEFAULT_WALL_STICKY_NOTES, {
      text: "  24화 엔딩 컷 빗방울 하이라이트 보강  ",
      author: "민서",
      colorId: "sage-mint",
    });
    expect(next).toHaveLength(5);
    expect(next[4]).toMatchObject({
      id: "note-5",
      text: "24화 엔딩 컷 빗방울 하이라이트 보강",
      author: "민서",
      colorId: "sage-mint",
      done: false,
      pinSlot: 4,
    });
  });

  it("addWallStickyNote는 공백 문자열 입력을 무시하고 기존 배열을 보존한다", () => {
    const unchanged = addWallStickyNote(DEFAULT_WALL_STICKY_NOTES, { text: "   " });
    expect(unchanged).toBe(DEFAULT_WALL_STICKY_NOTES);
  });

  it("toggleWallStickyNoteDone이 완료 상태를 반전하고 핀보드 완료율을 재계산한다", () => {
    const toggled = toggleWallStickyNoteDone(DEFAULT_WALL_STICKY_NOTES, "note-1");
    const inter = evaluateStageInteractions({ avatarPos: { x: 5.7, y: 4.1 }, stickyNotes: toggled });
    expect(toggled.find((n) => n.id === "note-1")?.done).toBe(true);
    expect(inter.pinboard.completedNotes).toBe(2);
    expect(inter.pinboard.completionRatePercent).toBe(50);
  });

  it("cycleWallStickyNoteColor가 4종 무바이올렛 OKLCH 스티커 색상을 순환한다", () => {
    const once = cycleWallStickyNoteColor(DEFAULT_WALL_STICKY_NOTES, "note-1");
    expect(once.find((n) => n.id === "note-1")?.colorId).toBe("sage-mint");
    const twice = cycleWallStickyNoteColor(once, "note-1");
    expect(twice.find((n) => n.id === "note-1")?.colorId).toBe("terracotta-peach");
  });
});

describe("5. 옆자리 책상 엿보기(Desk Peek Portal) & 4종 작업실 분위기 프리셋", () => {
  it("4개 동료 책상이 원고 진행률·포모도로 타이머·컷 수 정보를 제공한다", () => {
    expect(STAGE_COLLABORATOR_DESKS).toHaveLength(4);
    for (const desk of STAGE_COLLABORATOR_DESKS) {
      expect(desk.progressPercent).toBeGreaterThanOrEqual(0);
      expect(desk.progressPercent).toBeLessThanOrEqual(100);
      expect(desk.pomodoroTotalMin).toBeGreaterThan(0);
      expect(isForbiddenVioletHue(desk.accentColor.h)).toBe(false);
    }
  });

  it("책상 선택 시 peeking, 공동 편집 요청 시 co-edit-ready 상태로 전환된다", () => {
    const peeking = evaluateStageInteractions({ avatarPos: { x: 5.7, y: 4.1 }, selectedDeskId: "desk-lineart" });
    expect(peeking.deskPeek.coEditInviteState).toBe("peeking");
    expect(peeking.deskPeek.canInstantJoin).toBe(true);

    const ready = evaluateStageInteractions({
      avatarPos: { x: 5.7, y: 4.1 },
      selectedDeskId: "desk-lineart",
      coEditInvitedDeskId: "desk-lineart",
    });
    expect(ready.deskPeek.coEditInviteState).toBe("co-edit-ready");
  });

  it("4종 작업실 분위기 씬 프리셋 ID가 명세와 정확히 일치한다", () => {
    const expected: readonly StageAmbiencePresetId[] = [
      "morning-sunlit-atelier",
      "rainy-night-deadline",
      "warm-cafe-lounge",
      "minimal-white-gallery",
    ];
    expect(STAGE_AMBIENCE_PRESETS.map((p) => p.id)).toEqual(expected);
  });

  it("4종 분위기 프리셋이 색온도(K)·앰비언트 음량·시각 피로도와 무바이올렛 OKLCH 팔레트를 충족한다", () => {
    for (const preset of STAGE_AMBIENCE_PRESETS) {
      expect(preset.colorTempKelvin).toBeGreaterThanOrEqual(3000);
      expect(preset.colorTempKelvin).toBeLessThanOrEqual(6500);
      expect(preset.ambientVolumePercent).toBeGreaterThan(0);
      expect(preset.ambientVolumePercent).toBeLessThanOrEqual(100);
      expect(preset.visualFatigueScore).toBeLessThanOrEqual(35);
      for (const token of Object.values(preset.palette)) {
        expect(isForbiddenVioletHue(token.h)).toBe(false);
      }
    }
    expect(getStageAmbiencePreset("rainy-night-deadline").polarity).toBe("dark");
    expect(getStageAmbiencePreset("rainy-night-deadline").blueLightReductionPercent).toBeGreaterThanOrEqual(60);
  });

  it("알 수 없는 포즈/프리셋 ID 폴백 및 바이올렛 휴(270~320°) 강제 치환이 안전하다", () => {
    expect(VIOLET_HUE_MIN).toBe(270);
    expect(VIOLET_HUE_MAX).toBe(320);
    expect(normalizeHue(-45)).toBe(315);
    expect(isForbiddenVioletHue(285)).toBe(true);
    expect(formatOklch({ l: 0.6, c: 0.15, h: 295 })).toBe("oklch(0.6 0.15 158)");
    expect(getCreatorPoseSpec("unknown" as CreatorPoseId).id).toBe("sit-drawing");
    expect(getStageAmbiencePreset("unknown" as StageAmbiencePresetId).id).toBe("morning-sunlit-atelier");
  });
});

describe("6. Calm 하단 플로팅 도크 예산(< 10%) & JSON 내보내기", () => {
  it("기본 6개 핵심 액션 도크가 화면 가림 10% 미만(calm-optimal)을 만족한다", () => {
    expect(STAGE_CORE_DOCK_ACTIONS).toHaveLength(CORE_DOCK_ACTION_BUDGET);
    expect(STAGE_CORE_DOCK_ACTIONS.map((a) => a.id)).toEqual([
      "move", "pose", "bubble", "sticky", "ambience", "desk-invite",
    ]);
    const budget = evaluateStageDockBudget();
    expect(budget.screenOcclusionPercent).toBeLessThan(MAX_DOCK_OCCLUSION_PERCENT);
    expect(budget.withinOcclusionBudget).toBe(true);
    expect(budget.withinActionBudget).toBe(true);
    expect(budget.effectiveStageOccupancyPercent).toBeGreaterThan(90);
    expect(budget.advancedCollapsedByDefault).toBe(true);
    expect(budget.grade).toBe("calm-optimal");
  });

  it("도크 면적이 10% 이상이거나 액션 수가 6개를 넘으면 over-budget으로 판정한다", () => {
    const tooLarge = evaluateStageDockBudget({ viewportWidthPx: 1000, viewportHeightPx: 600, dockWidthPx: 900, dockHeightPx: 80 });
    expect(tooLarge.withinOcclusionBudget).toBe(false);
    expect(tooLarge.grade).toBe("over-budget");

    const tooMany = evaluateStageDockBudget({ dockActionCount: 9 });
    expect(tooMany.withinActionBudget).toBe(false);
    expect(tooMany.grade).toBe("over-budget");
  });

  it("도크 면적이 6%~10% 미만 구간이면 within-budget 등급을 반환한다", () => {
    const mid = evaluateStageDockBudget({ viewportWidthPx: 1000, viewportHeightPx: 600, dockWidthPx: 600, dockHeightPx: 75 });
    expect(mid.screenOcclusionPercent).toBe(7.5);
    expect(mid.withinOcclusionBudget).toBe(true);
    expect(mid.grade).toBe("within-budget");
  });

  it("exportAtelierStageLivingJson이 스키마 버전·고유 브랜드·접지·도크 예산을 포함한 JSON을 반환한다", () => {
    const snap = buildAtelierStageLivingSnapshot({
      locomotion: { currentPos: { x: 5.7, y: 4.1 }, poseId: "coffee-sip", lookAtTarget: { x: 2.4, y: 3.15 } },
      interactions: { voiceChatZone: "table", ambienceId: "warm-cafe-lounge", selectedDeskId: "desk-lead" },
    });
    const parsed = JSON.parse(exportAtelierStageLivingJson(snap)) as Record<string, unknown>;
    expect(parsed.schemaVersion).toBe(ATELIER_STAGE_SCHEMA_VERSION);
    expect(parsed.brand).toBe(ATELIER_STAGE_BRAND_NAME);
    expect(parsed.studio).toBe(ATELIER_STAGE_STUDIO_NAME);
    expect(parsed.violetFree).toBe(true);
  });
});

describe("7. StudioAtelierStageLivingPanel UI 인터랙션 & 접근성", () => {
  it("props 없이 기본 렌더되며 2.5D 아이소메트릭 SVG·4개 책상·핀보드·아바타·시선 원뿔·Calm 도크를 표시한다", () => {
    render(<StudioAtelierStageLivingPanel />);
    const svg = screen.getByTestId("atelier-stage-iso-svg");
    expect(svg.getAttribute("data-foot-ground-y")).toBe("0");
    expect(svg.getAttribute("data-violet-free")).toBe("true");
    expect(screen.getByTestId("stage-svg-pinboard")).toBeTruthy();
    expect(screen.getByTestId("stage-svg-lookat-cone")).toBeTruthy();
    expect(screen.getByTestId("stage-svg-clear-ring")).toBeTruthy();
    expect(screen.getByTestId("stage-svg-player-avatar")).toBeTruthy();
    for (const desk of STAGE_COLLABORATOR_DESKS) {
      expect(screen.getByTestId(`stage-svg-desk-${desk.id}`)).toBeTruthy();
    }
    expect(screen.getByTestId("stage-calm-dock")).toBeTruthy();
  });

  it("SVG 바닥 클릭·방향 버튼·WASD 키 입력으로 아바타가 즉시 이동하고 중앙 복귀가 동작한다", () => {
    render(<StudioAtelierStageLivingPanel />);
    const svg = screen.getByTestId("atelier-stage-iso-svg");
    const initialLabel = svg.getAttribute("aria-label") ?? "";

    fireEvent.click(svg);
    expect(svg.getAttribute("aria-label")).not.toBe(initialLabel);

    fireEvent.click(screen.getByTestId("stage-move-right"));
    const wrap = screen.getByTestId("stage-interactive-canvas-wrap");
    fireEvent.keyDown(wrap, { key: "s" });
    fireEvent.keyDown(wrap, { key: "ArrowLeft" });
    expect(svg.getAttribute("data-foot-ground-y")).toBe("0");

    fireEvent.click(screen.getByTestId("stage-reset-pos"));
    expect(svg.getAttribute("aria-label")).toContain("5.7m, 4.1m");
  });

  it("8종 원클릭 포즈 버튼이 aria-pressed·SVG data-pose-id·onPoseChange를 즉시 갱신한다", () => {
    const onPoseChange = vi.fn();
    render(<StudioAtelierStageLivingPanel onPoseChange={onPoseChange} />);
    const svg = screen.getByTestId("atelier-stage-iso-svg");

    for (const pose of CREATOR_STAGE_POSES) {
      const btn = screen.getByTestId(`stage-pose-${pose.id}`);
      fireEvent.click(btn);
      expect(btn.getAttribute("aria-pressed")).toBe("true");
      expect(svg.getAttribute("data-pose-id")).toBe(pose.id);
      expect(svg.getAttribute("data-foot-ground-y")).toBe("0");
    }
    expect(onPoseChange).toHaveBeenCalledTimes(8);
  });

  it("4종 작업실 분위기 전환이 색온도·SVG 테마를 갱신하고 모든 프리셋에서 원시 색·바이올렛 0건을 유지한다", () => {
    const onAmbienceChange = vi.fn();
    render(<StudioAtelierStageLivingPanel onAmbienceChange={onAmbienceChange} />);
    const svg = screen.getByTestId("atelier-stage-iso-svg");

    for (const preset of STAGE_AMBIENCE_PRESETS) {
      fireEvent.click(screen.getByTestId(`stage-ambience-${preset.id}`));
      expect(svg.getAttribute("data-ambience-id")).toBe(preset.id);
      expect(screen.getByTestId("stage-ambience-metrics").textContent).toContain(`${preset.colorTempKelvin}K`);
      assertZeroRawColorsAndZeroViolet(svg.outerHTML);
    }
    expect(onAmbienceChange).toHaveBeenCalledTimes(4);
  });

  it("벽면 포스트잇 추가·완료 토글·색상 순환이 리스트와 2.5D 핀보드 SVG에 동시 반영된다", () => {
    render(<StudioAtelierStageLivingPanel />);
    const svg = screen.getByTestId("atelier-stage-iso-svg");
    expect(svg.getAttribute("data-sticky-count")).toBe("4");

    fireEvent.click(screen.getByTestId("stage-note-color-terracotta-peach"));
    fireEvent.change(screen.getByTestId("stage-note-input"), { target: { value: "24화 표지 로고 여백 확인" } });
    fireEvent.click(screen.getByTestId("stage-note-add-btn"));

    expect(svg.getAttribute("data-sticky-count")).toBe("5");
    expect(screen.getByTestId("stage-svg-note-note-5")).toBeTruthy();

    fireEvent.click(screen.getByTestId("stage-note-toggle-note-5"));
    expect(screen.getByTestId("stage-svg-note-note-5").getAttribute("data-done")).toBe("true");

    fireEvent.click(screen.getByTestId("stage-note-cycle-note-5"));
    expect(screen.getByTestId("stage-pinboard-metrics").textContent).toContain("2/5");
  });

  it("동료 책상 클릭 시 옆자리 엿보기 포털이 전환되고 공동 편집 입장 준비가 콜백을 호출한다", () => {
    const onDeskInvite = vi.fn();
    render(<StudioAtelierStageLivingPanel onDeskInvite={onDeskInvite} />);

    fireEvent.click(screen.getByTestId("stage-svg-desk-desk-color"));
    expect(screen.getByTestId("stage-desk-peek-portal").textContent).toContain("하린");
    expect(screen.getByTestId("stage-desk-peek-portal").textContent).toContain("86%");

    fireEvent.click(screen.getByTestId("stage-coedit-join-btn"));
    expect(onDeskInvite).toHaveBeenCalledTimes(1);
    expect(onDeskInvite.mock.calls[0]?.[0]).toBe("desk-color");
    expect(screen.getByTestId("stage-coedit-join-btn").textContent).toContain("공동 편집 입장 준비됨");
  });

  it("<details> 고급 설정에서 3단계 음성 존·말풍선·JSON 복사(성공/오류)·영문 로케일이 정상 동작한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const onExportJson = vi.fn();

    const { unmount } = render(
      <StudioAtelierStageLivingPanel locale="en" initialAmbienceId="warm-cafe-lounge" className="custom-stage" onExportJson={onExportJson} />,
    );
    expect(screen.getByTestId("atelier-stage-living-panel").className).toContain("custom-stage");
    expect(screen.getByTestId("atelier-stage-living-panel").getAttribute("aria-label")).toContain("AtelierStage");

    fireEvent.click(screen.getByTestId("stage-zone-whisper"));
    expect(screen.getByTestId("atelier-stage-iso-svg").getAttribute("data-voice-zone")).toBe("whisper");

    fireEvent.change(screen.getByTestId("stage-self-speech-input"), { target: { value: "Reviewing Cut 9" } });
    fireEvent.click(screen.getByTestId("stage-toggle-json-btn"));
    expect(screen.getByTestId("stage-json-preview").textContent).toContain("Reviewing Cut 9");

    fireEvent.click(screen.getByTestId("stage-copy-json-btn"));
    await waitFor(() => expect(screen.getByTestId("stage-copy-status")).toBeTruthy());
    expect(onExportJson).toHaveBeenCalledTimes(1);
    unmount();

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    Object.defineProperty(document, "execCommand", { value: vi.fn().mockReturnValue(false), configurable: true });
    render(<StudioAtelierStageLivingPanel />);
    fireEvent.click(screen.getByTestId("stage-copy-json-btn"));
    await waitFor(() => expect(screen.getByTestId("stage-copy-error").getAttribute("role")).toBe("alert"));
  });
});

describe("8. 엄격 품질·하네스 계약·고유 브랜드 청정 검증", () => {
  it("소유 파일 4종이 정확히 존재하고 줄 수 상한(engine<=720, panel<=680, index<=80, test<=740)을 지킨다", () => {
    const dir = path.resolve(import.meta.dirname);
    const expected = [
      "atelier-stage-living-engine.ts",
      "StudioAtelierStageLivingPanel.tsx",
      "index.ts",
      "atelier-stage-living.test.tsx",
    ];
    for (const file of expected) expect(existsSync(path.join(dir, file))).toBe(true);
    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles).toHaveLength(4);

    for (const file of allFiles) {
      const lines = readFileSync(path.join(dir, file), "utf8").split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "atelier-stage-living-engine.ts") expect(lines).toBeLessThanOrEqual(720);
      if (file === "StudioAtelierStageLivingPanel.tsx") expect(lines).toBeLessThanOrEqual(680);
      if (file === "index.ts") expect(lines).toBeLessThanOrEqual(80);
      if (file === "atelier-stage-living.test.tsx") expect(lines).toBeLessThanOrEqual(740);
    }
  });

  it("금지 패턴 0건(원시 색·transition-all·Sparkles·Web Storage·= {}·번역투)과 필수 접근성 토큰을 준수한다", () => {
    const dir = path.resolve(import.meta.dirname);
    for (const file of ["atelier-stage-living-engine.ts", "StudioAtelierStageLivingPanel.tsx", "index.ts"]) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src).not.toMatch(/\blocalStorage\b/u);
      expect(src).not.toMatch(/\bsessionStorage\b/u);
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(src).not.toMatch(/\brgba?\s*\(/iu);
      expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      expect(src).not.toContain("transition-all");
      expect(src).not.toContain("Sparkles");
      expect(src).not.toContain("가능하게 합니다");
      expect(src).not.toContain("직관적인 경험을 제공");
      expect(src).not.toContain("원활한 워크플로우를 보장");
      if (file === "StudioAtelierStageLivingPanel.tsx") {
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
      }
    }

    const { container } = render(<StudioAtelierStageLivingPanel />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(25);
    for (const btn of buttons) expect(btn.className).toContain("min-h-11");
    for (const svg of container.querySelectorAll("svg")) assertZeroRawColorsAndZeroViolet(svg.outerHTML);
  });

  it("4개 소유 파일 전체에서 외부 타사 브랜드명이 0건이며 ToonStudio·AtelierStage 고유 브랜드만 사용한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const forbiddenTokens = [
      ["g", "a", "t", "h", "e", "r"].join(""),
      ["z", "e", "p", "e", "t", "o"].join(""),
      ["s", "p", "a", "t", "i", "a", "l", ".", "i", "o"].join(""),
      ["v", "r", "c", "h", "a", "t"].join(""),
      ["r", "o", "b", "l", "o", "x"].join(""),
      ["k", "u", "m", "o", "s", "p", "a", "c", "e"].join(""),
      ["t", "o", "p", "i", "a"].join(""),
      ["m", "i", "r", "o"].join(""),
      ["f", "i", "g", "m", "a"].join(""),
      ["n", "o", "t", "i", "o", "n"].join(""),
      ["d", "i", "s", "c", "o", "r", "d"].join(""),
      ["s", "l", "a", "c", "k"].join(""),
    ];
    for (const file of readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f))) {
      const lower = readFileSync(path.join(dir, file), "utf8").toLowerCase();
      for (const token of forbiddenTokens) {
        expect(lower).not.toMatch(new RegExp(`\\b${token.replace(".", "\\.")}\\b`, "u"));
      }
    }
    expect(ATELIER_STAGE_BRAND_NAME).toBe("AtelierStage");
    expect(ATELIER_STAGE_STUDIO_NAME).toBe("ToonStudio");
  });

  it("소유 4파일이 금지 도메인(vrm·bg3d·market·apps/api·apps/admin-web)을 정적으로 import하지 않는다", () => {
    const dir = path.resolve(import.meta.dirname);
    for (const file of readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f))) {
      const importLines = readFileSync(path.join(dir, file), "utf8")
        .split(/\r?\n/)
        .filter((line) => /^\s*import\b/u.test(line));
      for (const line of importLines) {
        expect(line).not.toMatch(/\/(?:vrm|bg3d|market)\b/u);
        expect(line).not.toContain("apps/api");
        expect(line).not.toContain("apps/admin-web");
      }
    }
  });
});
