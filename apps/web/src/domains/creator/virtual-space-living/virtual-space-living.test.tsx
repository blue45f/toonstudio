// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  AVATAR_SLOT_KEYS,
  DEFAULT_FURNITURE_GRID,
  DEFAULT_SPRITE_PHYSICS_CONFIG,
  FIXED_PHYSICS_DT_SEC,
  GENRE_OUTFIT_PRESETS,
  RADIAL_EMOTE_SECTORS,
  STUDIO_PET_OPTIONS,
  STUDIO_THEME_ROOMS,
  StudioVirtualSpaceLivingPanel,
  TIME_OF_DAY_LIST,
  TIME_OF_DAY_PROFILES,
  USER_WORK_PROTAGONIST_CATALOG,
  applyGenreOutfitPreset,
  applyTeamPomodoroSyncPacket,
  buildAvatarRenderLayers,
  checkFurniturePlacementCollision,
  clearImportedProtagonist,
  computeDirectionalShadowVector,
  computeVolumePreservingSquashStretch,
  createAtmosphereParticleSystem,
  createDefaultDeskLayout,
  createDefaultLayeredAvatar,
  createEmoteWheelState,
  createLivingSpriteState,
  createTeamPomodoroState,
  formatPomodoroClock,
  getEmoteRemainingCooldownMs,
  getPomodoroRemainingSec,
  importProtagonistToAvatar,
  interpolateTimeOfDayLighting,
  mapAngleDegToSectorIndex,
  mapPointerDeltaToRadialSector,
  mapVectorToOctant8,
  moveFurnitureItem,
  pauseTeamPomodoro,
  placeFurnitureItem,
  removeFurnitureItem,
  rotateFurnitureItem,
  simulateLivingSpriteFrames,
  smoothDirectionVector,
  snapPixelToGridCell,
  spawnCherryBlossomPetal,
  spawnCoffeeSteamPlume,
  spawnFocusAuraRing,
  spawnFootstepDustBurst,
  spawnWindowRainDrop,
  startTeamPomodoro,
  stepAtmosphereParticles,
  stepEyeBlinkState,
  stepLivingSpritePhysics,
  summarizeParticlesByLayer,
  tickTeamPomodoro,
  triggerRadialEmote,
} from "./index";

afterEach(cleanup);

describe("1. 60fps 2.5D 스프링 스프라이트 물리 엔진 (sprite-physics-engine)", () => {
  it("서브픽셀 관성 가속·전력 질주·마찰 감속·스테이지 경계 클램프를 정확히 계산한다", () => {
    const start = createLivingSpriteState({ x: 280, y: 164 });
    const moving = simulateLivingSpriteFrames(start, { moveX: 1, moveY: 0, sprinting: false }, 30);

    expect(moving.position.x).toBeGreaterThan(start.position.x + 20);
    expect(moving.speedPxPerSec).toBeGreaterThan(100);
    expect(moving.speedPxPerSec).toBeLessThanOrEqual(DEFAULT_SPRITE_PHYSICS_CONFIG.maxWalkSpeedPxPerSec + 0.01);

    const sprinting = simulateLivingSpriteFrames(start, { moveX: 1, moveY: 0, sprinting: true }, 45);
    expect(sprinting.speedPxPerSec).toBeGreaterThan(DEFAULT_SPRITE_PHYSICS_CONFIG.maxWalkSpeedPxPerSec * 1.3);
    expect(sprinting.afterimageTrail.length).toBeGreaterThan(0);

    // 입력 해제 후 마찰·감속으로 서브픽셀 떨림 없이 완전 정지
    const stopped = simulateLivingSpriteFrames(moving, { moveX: 0, moveY: 0 }, 90);
    expect(stopped.speedPxPerSec).toBe(0);
    expect(stopped.velocity.x).toBe(0);
    expect(stopped.velocity.y).toBe(0);

    // 경계 클램프 검증
    const clamped = simulateLivingSpriteFrames(start, { moveX: 1, moveY: 1, sprinting: true }, 240);
    expect(clamped.position.x).toBeLessThanOrEqual(DEFAULT_SPRITE_PHYSICS_CONFIG.bounds.maxX);
    expect(clamped.position.y).toBeLessThanOrEqual(DEFAULT_SPRITE_PHYSICS_CONFIG.bounds.maxY);
  });

  it("8방향 벡터 매핑과 지수 방향 스무딩이 급회전 시 부드럽게 보간된다", () => {
    expect(mapVectorToOctant8(1, 0).octant).toBe("E");
    expect(mapVectorToOctant8(1, 1).octant).toBe("SE");
    expect(mapVectorToOctant8(0, 1).octant).toBe("S");
    expect(mapVectorToOctant8(-1, 1).octant).toBe("SW");
    expect(mapVectorToOctant8(-1, 0).octant).toBe("W");
    expect(mapVectorToOctant8(-1, -1).octant).toBe("NW");
    expect(mapVectorToOctant8(0, -1).octant).toBe("N");
    expect(mapVectorToOctant8(1, -1).octant).toBe("NE");

    const step1 = smoothDirectionVector({ x: 1, y: 0 }, { x: 0, y: 1 }, FIXED_PHYSICS_DT_SEC, 12);
    expect(step1.x).toBeGreaterThan(0.5);
    expect(step1.y).toBeGreaterThan(0.05);
    expect(Math.hypot(step1.x, step1.y)).toBeCloseTo(1, 5);
  });

  it("스쿼시 & 스트레치는 가속·주행·급정지·유휴 전 구간에서 부피 보존(sx * sy === 1)을 유지한다", () => {
    const start = createLivingSpriteState();
    let curr = start;
    for (let i = 0; i < 60; i += 1) {
      const moveX = i < 30 ? 1 : 0;
      curr = stepLivingSpritePhysics(curr, { moveX, moveY: 0, sprinting: i < 20 }, FIXED_PHYSICS_DT_SEC);
      expect(curr.squashStretch.scaleX * curr.squashStretch.scaleY).toBeCloseTo(1, 10);
      expect(curr.squashStretch.volumeProduct).toBeCloseTo(1, 10);
    }

    const burstPose = computeVolumePreservingSquashStretch({
      normalizedSpeed: 1.4,
      signedAccelImpulse: 0.9,
      walkCycleRad: Math.PI / 4,
      breathWave: 0.4,
      vx: 200,
      maxSpeed: 168,
      maxSquashStretch: 0.18,
    });
    expect(burstPose.scaleY).toBeGreaterThan(1.05);
    expect(burstPose.scaleX).toBeLessThan(0.96);
    expect(burstPose.scaleX * burstPose.scaleY).toBeCloseTo(1, 10);
  });

  it("Hooke 탄성 + 감쇠 2차 스프링(머리카락·망토)이 이동 반대 방향으로 끌렸다가 정지 후 안정화된다", () => {
    const start = createLivingSpriteState({ x: 200, y: 160 });
    const running = simulateLivingSpriteFrames(start, { moveX: 1, moveY: 0, sprinting: true }, 35);

    const lastHair = running.hairNodes[running.hairNodes.length - 1];
    const lastCape = running.capeNodes[running.capeNodes.length - 1];
    expect(lastHair).toBeDefined();
    expect(lastCape).toBeDefined();
    // 동쪽(+X) 이동 시 머리카락과 망토 끝단이 캐릭터 기준 좌측(-X)으로 잔상 끌림
    expect(lastHair!.x).toBeLessThan(running.position.x - 1);
    expect(lastCape!.x).toBeLessThan(running.position.x - 2);

    // 정지 후 120프레임 뒤에는 NaN 없이 안정 수렴
    const settled = simulateLivingSpriteFrames(running, { moveX: 0, moveY: 0 }, 120);
    for (const node of [...settled.hairNodes, ...settled.capeNodes]) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(Math.hypot(node.vx, node.vy)).toBeLessThan(5);
    }
  });

  it("유휴 호흡 사인파, 자연 눈 깜빡임 주기, 포인터/동료 시선 추적(gazeAngle)을 계산한다", () => {
    // 1) 호흡 사인파 변위 검증
    const base = createLivingSpriteState();
    const afterBreath = simulateLivingSpriteFrames(base, { moveX: 0, moveY: 0 }, 54);
    expect(Math.abs(afterBreath.breathOffsetPx)).toBeGreaterThan(0.5);

    // 2) 자연 눈 깜빡임 상태 전이(open -> closing -> closed -> opening -> open)
    let blink = base.blink;
    const seenPhases = new Set<string>([blink.phase]);
    for (let i = 0; i < 260; i += 1) {
      blink = stepEyeBlinkState(blink, FIXED_PHYSICS_DT_SEC);
      seenPhases.add(blink.phase);
    }
    expect(seenPhases.has("closing")).toBe(true);
    expect(seenPhases.has("closed")).toBe(true);
    expect(seenPhases.has("opening")).toBe(true);
    expect(blink.blinkCount).toBeGreaterThanOrEqual(1);

    // 3) 포인터 시선 추적(우측 상단 포인터) 및 동료 자동 추적
    const gazeRight = simulateLivingSpriteFrames(
      base,
      { moveX: 0, moveY: 0, pointerTarget: { x: 460, y: 142 } },
      35,
    );
    expect(gazeRight.gaze.targetKind).toBe("pointer");
    expect(Math.abs(gazeRight.gaze.gazeAngleDeg)).toBeLessThan(20);
    expect(gazeRight.gaze.pupilOffsetX).toBeGreaterThan(2);

    const gazePeer = simulateLivingSpriteFrames(
      base,
      {
        moveX: 0,
        moveY: 0,
        peerTargets: [{ id: "p1", labelKo: "민서", position: { x: 140, y: 142 } }],
      },
      35,
    );
    expect(gazePeer.gaze.targetKind).toBe("peer");
    expect(gazePeer.gaze.targetLabelKo).toContain("민서");
    expect(gazePeer.gaze.pupilOffsetX).toBeLessThan(-1.5);
  });

  it("보행 주기에 맞춰 왼발·오른발 발걸음 이벤트가 번갈아 발생하며 발걸음 먼지와 연동된다", () => {
    let curr = createLivingSpriteState({ x: 100, y: 160 });
    let fx = createAtmosphereParticleSystem({ weatherPreset: "clear-breeze" });
    const triggeredFeet: string[] = [];

    for (let i = 0; i < 80; i += 1) {
      curr = stepLivingSpritePhysics(curr, { moveX: 1, moveY: 0, sprinting: false }, FIXED_PHYSICS_DT_SEC);
      if (curr.stepTriggered) {
        triggeredFeet.push(curr.footSide);
        fx = spawnFootstepDustBurst(fx, curr.position.x, curr.position.y + 18, curr.facingVector.x, curr.facingVector.y, 2);
      }
    }

    expect(triggeredFeet.length).toBeGreaterThanOrEqual(3);
    expect(new Set(triggeredFeet).size).toBe(2);
    expect(summarizeParticlesByLayer(fx.particles).byKind["footstep-dust"]).toBeGreaterThanOrEqual(6);
  });
});

describe("2. 시간대 광원 · 멀티레이어 파티클 · 8섹터 방사형 이모트 휠 (atmosphere-vfx-engine)", () => {
  it("4종 시간대(dawn/day/sunset/night) 광원 색온도·그림자 각도 프로파일과 보간이 유효하다", () => {
    expect(TIME_OF_DAY_LIST.map((p) => p.id)).toEqual(["dawn", "day", "sunset", "night"]);
    expect(TIME_OF_DAY_PROFILES.sunset.colorTemperatureK).toBeLessThan(TIME_OF_DAY_PROFILES.day.colorTemperatureK);
    expect(TIME_OF_DAY_PROFILES.night.ambientLux).toBeLessThan(TIME_OF_DAY_PROFILES.day.ambientLux);

    const dayShadow = computeDirectionalShadowVector(TIME_OF_DAY_PROFILES.day, 64);
    const sunsetShadow = computeDirectionalShadowVector(TIME_OF_DAY_PROFILES.sunset, 64);
    expect(sunsetShadow.lengthPx).toBeGreaterThan(dayShadow.lengthPx * 2);

    const mid = interpolateTimeOfDayLighting("dawn", "day", 0.5);
    expect(mid.colorTemperatureK).toBe(4600);
    expect(mid.ambientLux).toBeGreaterThan(TIME_OF_DAY_PROFILES.dawn.ambientLux);
    expect(mid.ambientLux).toBeLessThan(TIME_OF_DAY_PROFILES.day.ambientLux);
  });

  it("5종 파티클(발걸음 먼지/커피 스팀/창가 빗줄기/벚꽃 잎/집중 오라 링)이 3개 깊이 레이어로 시뮬레이션된다", () => {
    let sys = createAtmosphereParticleSystem({ weatherPreset: "rainy-window", maxParticles: 80 });
    sys = spawnFootstepDustBurst(sys, 260, 180, 1, 0, 3);
    sys = spawnCoffeeSteamPlume(sys, 420, 130);
    sys = spawnWindowRainDrop(sys);
    sys = spawnCherryBlossomPetal(sys);
    sys = spawnFocusAuraRing(sys, 280, 160);

    const summaryBefore = summarizeParticlesByLayer(sys.particles);
    expect(summaryBefore.byKind["footstep-dust"]).toBe(3);
    expect(summaryBefore.byKind["coffee-steam"]).toBe(1);
    expect(summaryBefore.byKind["window-rain"]).toBe(1);
    expect(summaryBefore.byKind["cherry-blossom"]).toBe(1);
    expect(summaryBefore.byKind["focus-aura-ring"]).toBe(1);
    expect(summaryBefore.byLayer.background).toBeGreaterThanOrEqual(1);
    expect(summaryBefore.byLayer.midground).toBeGreaterThanOrEqual(4);
    expect(summaryBefore.byLayer.foreground).toBeGreaterThanOrEqual(2);

    // 시간 경과 시 집중 오라 링은 확장하고 수명 만료 파티클은 정리된다
    const stepped = stepAtmosphereParticles(sys, 0.1);
    const ring = stepped.particles.find((p) => p.kind === "focus-aura-ring");
    expect(ring).toBeDefined();
    expect(ring!.radiusPx).toBeGreaterThan(14);
  });

  it("8섹터 방사형 이모트 휠의 각도 → 섹터 인덱스 수학 매핑과 중앙 데드존이 정확하다", () => {
    expect(RADIAL_EMOTE_SECTORS).toHaveLength(8);
    expect(RADIAL_EMOTE_SECTORS.every((s) => s.ariaLabelKo.length > 8)).toBe(true);

    // 12시(0°), 1:30(45°), 3시(90°), ..., 10:30(315°), 경계 359° -> 섹터 0
    expect(mapAngleDegToSectorIndex(0)).toBe(0);
    expect(mapAngleDegToSectorIndex(359)).toBe(0);
    expect(mapAngleDegToSectorIndex(-10)).toBe(0);
    expect(mapAngleDegToSectorIndex(45)).toBe(1);
    expect(mapAngleDegToSectorIndex(90)).toBe(2);
    expect(mapAngleDegToSectorIndex(135)).toBe(3);
    expect(mapAngleDegToSectorIndex(180)).toBe(4);
    expect(mapAngleDegToSectorIndex(225)).toBe(5);
    expect(mapAngleDegToSectorIndex(270)).toBe(6);
    expect(mapAngleDegToSectorIndex(315)).toBe(7);

    // 데드존 및 화면 상대 좌표 검증
    const center = mapPointerDeltaToRadialSector(5, -6, 18);
    expect(center.inDeadZone).toBe(true);
    expect(center.sectorIndex).toBeNull();

    const north = mapPointerDeltaToRadialSector(0, -60, 18);
    expect(north.inDeadZone).toBe(false);
    expect(north.sectorIndex).toBe(0);

    const east = mapPointerDeltaToRadialSector(60, 0, 18);
    expect(east.sectorIndex).toBe(2);

    const southWest = mapPointerDeltaToRadialSector(-50, 50, 18);
    expect(southWest.sectorIndex).toBe(5);
  });

  it("방사형 이모트 발동 시 섹터별 쿨다운을 적용하고 만료 후 재발동을 허용한다", () => {
    const initial = createEmoteWheelState();
    const first = triggerRadialEmote(initial, 1, 10000);
    expect(first.accepted).toBe(true);
    expect(first.sector?.id).toBe("coffee-break");
    expect(first.nextState.triggerCount).toBe(1);

    // 1초 뒤 재발동은 쿨다운(4초)으로 차단
    const blocked = triggerRadialEmote(first.nextState, 1, 11000);
    expect(blocked.accepted).toBe(false);
    expect(blocked.reason).toBe("cooldown");
    expect(blocked.remainingCooldownMs).toBe(3000);
    expect(getEmoteRemainingCooldownMs(first.nextState, "coffee-break", 11000)).toBe(3000);

    // 4.1초 뒤 만료되어 정상 재발동
    const again = triggerRadialEmote(first.nextState, 1, 14100);
    expect(again.accepted).toBe(true);
    expect(again.nextState.triggerCount).toBe(2);
  });

  it("날씨 프리셋별 자동 방출기(빗줄기·벚꽃·집중 오라)와 수명 만료 제거·상한 캡이 안정적으로 작동한다", () => {
    let blossomSys = createAtmosphereParticleSystem({ weatherPreset: "spring-blossom", maxParticles: 20 });
    for (let i = 0; i < 30; i += 1) {
      blossomSys = stepAtmosphereParticles(blossomSys, 0.08);
    }
    const blossomSummary = summarizeParticlesByLayer(blossomSys.particles);
    expect(blossomSummary.total).toBeLessThanOrEqual(20);
    expect(blossomSummary.byKind["cherry-blossom"]).toBeGreaterThanOrEqual(1);

    let focusSys = createAtmosphereParticleSystem({ weatherPreset: "deep-focus", maxParticles: 24 });
    for (let i = 0; i < 20; i += 1) {
      focusSys = stepAtmosphereParticles(focusSys, 0.08);
    }
    expect(summarizeParticlesByLayer(focusSys.particles).byKind["focus-aura-ring"]).toBeGreaterThanOrEqual(1);
  });
});

describe("3. 아바타 · 6종 테마 스튜디오 · 가구 배치 · 팀 뽀모도로 (avatar-room-studio-engine)", () => {
  it("6슬롯 레이어드 아바타(장르 6종 · 반려동물 4종) 및 내 작품 주인공 불러오기 슬롯이 동작한다", () => {
    expect(AVATAR_SLOT_KEYS).toHaveLength(6);
    expect(GENRE_OUTFIT_PRESETS).toHaveLength(6);
    expect(STUDIO_PET_OPTIONS).toHaveLength(4);

    const base = createDefaultLayeredAvatar();
    const mage = applyGenreOutfitPreset(base, "fantasy-mage", true);
    expect(mage.genreOutfitPreset).toBe("fantasy-mage");
    expect(buildAvatarRenderLayers(mage)).toHaveLength(6);

    const source = USER_WORK_PROTAGONIST_CATALOG[0]!;
    const imported = importProtagonistToAvatar(mage, source);
    expect(imported.protagonistImport.active).toBe(true);
    expect(imported.protagonistImport.characterNameKo).toBe(source.characterNameKo);
    expect(buildAvatarRenderLayers(imported)).toHaveLength(7);

    const cleared = clearImportedProtagonist(imported);
    expect(cleared.protagonistImport.active).toBe(false);
    expect(buildAvatarRenderLayers(cleared)).toHaveLength(6);
  });

  it("6종 테마 스튜디오 카탈로그가 실존하는 사전 베이크 WebP 파일 경로에 정확히 연결된다", () => {
    expect(STUDIO_THEME_ROOMS).toHaveLength(6);
    const expectedPaths = [
      "/assets/atelier/spaces/wood-atelier.webp",
      "/assets/atelier/spaces/rooftop-terrace.webp",
      "/assets/atelier/spaces/midnight-manga-cafe.webp",
      "/assets/atelier/spaces/reference-library.webp",
      "/assets/atelier/spaces/fantasy-guild-hall.webp",
      "/assets/atelier/spaces/comic-gallery.webp",
    ];
    expect(STUDIO_THEME_ROOMS.map((room) => room.imagePath)).toEqual(expectedPaths);

    const webPublicDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../public");
    for (const room of STUDIO_THEME_ROOMS) {
      const diskPath = resolve(webPublicDir, room.imagePath.replace(/^\//, ""));
      expect(existsSync(diskPath), `${room.imagePath} 실존 여부`).toBe(true);
    }
  });

  it("그리드 스냅 가구 배치 엔진이 픽셀 스냅·경계 이탈·AABB 겹침·회전·이동·제거를 판정한다", () => {
    expect(snapPixelToGridCell(125, 84, DEFAULT_FURNITURE_GRID)).toEqual({ col: 3, row: 2 });

    const layout = createDefaultDeskLayout();
    // 빈 공간 배치 성공
    const placed = placeFurnitureItem(layout, {
      instanceId: "plant-1",
      catalogId: "monstera-pot",
      col: 0,
      row: 0,
      rotationDeg: 0,
    });
    expect(placed.accepted).toBe(true);
    expect(placed.items).toHaveLength(layout.length + 1);

    // 기존 책상(col 4..6, row 2..3)과 겹침 차단
    const overlap = checkFurniturePlacementCollision(placed.items, {
      catalogId: "monstera-pot",
      col: 5,
      row: 2,
      rotationDeg: 0,
    });
    expect(overlap.ok).toBe(false);
    expect(overlap.reason).toBe("overlap");
    expect(overlap.collidingInstanceIds).toContain("desk-main");

    // 격자 경계 이탈 차단 (3×2 책상을 11열에 배치)
    const oob = checkFurniturePlacementCollision(placed.items, {
      catalogId: "pen-display-desk",
      col: 11,
      row: 0,
      rotationDeg: 0,
    });
    expect(oob.ok).toBe(false);
    expect(oob.reason).toBe("out-of-bounds");

    // 이동 및 90도 회전(2×1 -> 1×2) 검증
    const moved = moveFurnitureItem(placed.items, "shelf-left", 0, 5);
    expect(moved.accepted).toBe(true);
    const rotated = rotateFurnitureItem(moved.items, "shelf-left");
    expect(rotated.accepted).toBe(true);
    expect(rotated.collision.effectiveWidthCells).toBe(1);
    expect(rotated.collision.effectiveHeightCells).toBe(2);

    const removed = removeFurnitureItem(rotated.items, "plant-1");
    expect(removed).toHaveLength(layout.length);
  });

  it("팀 뽀모도로 타이머가 스프린트→짧은 휴식→4회차 긴 휴식 전환 및 호스트 드리프트 동기화를 수행한다", () => {
    let state = startTeamPomodoro(createTeamPomodoroState("quick-15-3"));
    expect(formatPomodoroClock(getPomodoroRemainingSec(state))).toBe("15:00");

    // 1회차 스프린트 15분 경과 -> 짧은 휴식(3분)
    const firstBreak = tickTeamPomodoro(state, 15 * 60);
    expect(firstBreak.phaseTransitioned).toBe(true);
    expect(firstBreak.nextState.phase).toBe("short-break");
    expect(firstBreak.nextState.completedSprints).toBe(1);
    expect(formatPomodoroClock(getPomodoroRemainingSec(firstBreak.nextState))).toBe("03:00");

    // 4회차 스프린트 완료 시 긴 휴식(10분)으로 자동 전환
    state = { ...firstBreak.nextState, phase: "sprint", phaseElapsedSec: 0, phaseDurationSec: 15 * 60, completedSprints: 3 };
    const longBreak = tickTeamPomodoro(state, 15 * 60);
    expect(longBreak.nextState.phase).toBe("long-break");
    expect(longBreak.nextState.completedSprints).toBe(4);
    expect(formatPomodoroClock(getPomodoroRemainingSec(longBreak.nextState))).toBe("10:00");

    // 일시정지 시 시간 미진행
    const paused = pauseTeamPomodoro(longBreak.nextState);
    const frozen = tickTeamPomodoro(paused, 120);
    expect(frozen.nextState.phaseElapsedSec).toBe(paused.phaseElapsedSec);

    // 호스트 동기화 패킷 드리프트(+500ms) 보정
    const synced = applyTeamPomodoroSyncPacket(
      paused,
      {
        roomSessionId: paused.roomSessionId,
        syncRevision: paused.syncRevision + 2,
        phase: "sprint",
        running: true,
        phaseElapsedSec: 120,
        completedSprints: 4,
        hostTimestampMs: 50000,
      },
      50500,
    );
    expect(synced.phase).toBe("sprint");
    expect(synced.lastDriftMs).toBe(500);
    expect(synced.phaseElapsedSec).toBeCloseTo(120.5, 2);
  });
});

describe("4. StudioVirtualSpaceLivingPanel 3탭 인터랙티브 UI 및 코드 위생 계약", () => {
  it("props 없이 단독 렌더링되고 3개 탭 전환과 탭 1 관성 이동 텔레메트리가 동작한다", () => {
    render(<StudioVirtualSpaceLivingPanel />);

    expect(screen.getByRole("tab", { name: "2.5D 스프링 캐릭터" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByTestId("dir-e"));

    expect(screen.getByTestId("telemetry-speed").textContent).toContain("동쪽");
    expect(screen.getByTestId("telemetry-squash").textContent).toContain("= 1.000");

    fireEvent.click(screen.getByTestId("living-tab-atmosphere"));
    expect(screen.getByRole("tab", { name: "시간·날씨·이모트 휠" }).getAttribute("aria-selected")).toBe("true");
  });

  it("탭 2에서 시간대 4종 전환, 파티클 버스트, 8섹터 이모트 휠 쿨다운이 동작한다", () => {
    render(<StudioVirtualSpaceLivingPanel initialTab="atmosphere-wheel" />);

    fireEvent.click(screen.getByTestId("tod-sunset"));
    expect(screen.getByTestId("lighting-readout").textContent).toContain("2800K");

    fireEvent.click(screen.getByTestId("burst-focus-aura-ring"));
    expect(screen.getByTestId("living-status-banner").textContent).toContain("집중 오라 링");

    const emoteBtn = screen.getByTestId("emote-sector-2");
    fireEvent.click(emoteBtn);
    expect(screen.getByTestId("living-status-banner").textContent).toContain("마감 집중");

    // 직후 재클릭 시 쿨다운 안내
    fireEvent.click(emoteBtn);
    expect(screen.getByTestId("living-status-banner").textContent).toContain("쿨다운");
  });

  it("탭 3에서 6종 테마 방 WebP <img>, 내 작품 주인공 불러오기, 가구 충돌 검사, 팀 뽀모도로가 동작한다", () => {
    render(<StudioVirtualSpaceLivingPanel initialTab="avatar-room-pomodoro" />);

    // 6종 테마 방 썸네일 <img> 모두 실존 .webp src 확인
    for (const room of STUDIO_THEME_ROOMS) {
      const card = screen.getByTestId(`room-card-${room.id}`);
      const img = card.querySelector("img");
      expect(img).not.toBeNull();
      expect(img?.getAttribute("src")).toBe(room.imagePath);
    }

    // 내 작품 주인공 불러오기
    fireEvent.click(screen.getByTestId("import-protagonist-work-starlight-ink"));
    expect(screen.getByTestId("protagonist-status").textContent).toContain("서연우");

    // 책상 점유 셀(4, 2) 클릭 시 충돌 검사 메시지 표시, 빈 셀(0, 0) 클릭 시 배치 성공
    fireEvent.click(screen.getByTestId("grid-cell-4-2"));
    expect(screen.getByTestId("living-status-banner").textContent).toContain("겹쳐");
    fireEvent.click(screen.getByTestId("grid-cell-0-0"));
    expect(screen.getByTestId("living-status-banner").textContent).toContain("배치 가능");

    // 팀 뽀모도로 +60초 스텝 및 다음 단계 전환
    fireEvent.click(screen.getByTestId("pomodoro-step-btn"));
    expect(screen.getByTestId("pomodoro-clock").textContent).toBe("24:00");
    fireEvent.click(screen.getByTestId("pomodoro-skip-btn"));
    expect(screen.getByTestId("pomodoro-phase-badge").textContent).toContain("짧은 휴식");
  });

  it("탭 3에서 테마 방 전환 시 권장 광원 색온도가 헤더에 반영되고 가구 회전·제거가 동작한다", () => {
    render(<StudioVirtualSpaceLivingPanel initialTab="avatar-room-pomodoro" />);

    fireEvent.click(screen.getByTestId("room-card-midnight-manga-cafe"));
    expect(screen.getByTestId("living-status-banner").textContent).toContain("심야 만화카페");
    expect(screen.getByText(/7400K/)).toBeDefined();

    // 책상 선택 상태에서 90도 회전 시 아래 의자(5,4)와 실제 충돌을 감지한다
    fireEvent.click(screen.getByRole("button", { name: /90° 회전/ }));
    expect(screen.getByTestId("living-status-banner").textContent).toContain("겹쳐");
    // 레퍼런스 책장(1,1) 선택 후 90도 회전 및 제거는 정상 완료된다
    fireEvent.click(screen.getByTestId("grid-cell-1-1"));
    fireEvent.click(screen.getByRole("button", { name: /90° 회전/ }));
    expect(screen.getByTestId("living-status-banner").textContent).toContain("레퍼런스 자료 책장");
    fireEvent.click(screen.getByRole("button", { name: /제거/ }));
    expect(screen.getByTestId("living-status-banner").textContent).toContain("제거했습니다");
  });

  it("서브폴더 내 모든 소스 파일이 800줄 이하·원시 색 금지·스토리지 금지·BigInt 금지·props 기본객체 금지 계약을 준수한다", () => {
    const dir = resolve(process.cwd(), "apps/web/src/domains/creator/virtual-space-living");
    const files = [
      "sprite-physics-engine.ts",
      "atmosphere-vfx-engine.ts",
      "avatar-room-studio-engine.ts",
      "StudioVirtualSpaceLivingPanel.tsx",
      "index.ts",
      "virtual-space-living.test.tsx",
    ];
    const hexPattern = new RegExp(`${"#"}${"[0-9a-fA-F]{3,8}"}\\b`);
    const fnColorPattern = new RegExp(`\\b(?:${["r", "gb"].join("")}|${["r", "gba"].join("")}|${["h", "sl"].join("")}|${["h", "sla"].join("")})\\s*\\(`, "i");
    const storagePattern = new RegExp(`\\b(?:${["local", "Storage"].join("")}|${["session", "Storage"].join("")})\\b`);
    const bigIntPattern = new RegExp(`${["0", "x"].join("")}[0-9a-fA-F]+${"n"}\\b`);
    const privateStoreMapPattern = new RegExp(`private\\s+(?:readonly\\s+)?${"store"}\\b[^;]*Map`);

    for (const file of files) {
      const content = readFileSync(resolve(dir, file), "utf8");
      const lines = content.split("\n").length;
      expect(lines, `${file} 줄 수 (${lines} <= 800)`).toBeLessThanOrEqual(800);
      expect(hexPattern.test(content), `${file} 원시 hex 금지`).toBe(false);
      expect(fnColorPattern.test(content), `${file} 원시 함수색 금지`).toBe(false);
      expect(storagePattern.test(content), `${file} Web Storage 금지`).toBe(false);
      expect(bigIntPattern.test(content), `${file} BigInt 리터럴 금지`).toBe(false);
      expect(privateStoreMapPattern.test(content), `${file} private Map store 금지`).toBe(false);
    }

    const panelContent = readFileSync(resolve(dir, "StudioVirtualSpaceLivingPanel.tsx"), "utf8");
    expect(panelContent).not.toMatch(/:\s*StudioVirtualSpaceLivingPanelProps\s*=\s*\{\s*\}/);
    expect(panelContent).toContain("[word-break:keep-all]");
    expect(panelContent).toContain("tabular-nums");
    expect(panelContent).toContain("min-h-11");
  });
});
