// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductionProjectPage } from "../production-hub/ProductionHubPage";
import { resetProductionDemoSession } from "../production-hub/production-demo-adapter";
import { StudioVirtualSpaceCollaborationHub } from "../virtual-space/StudioVirtualSpaceCollaborationHub";
import {
  PLAZA_CURRENCY_CODES,
  PLAZA_GUILD_ZONES,
  buildCrowdSpatialHash,
  computeKstWorkOverlap,
  convertCutRateAndEscrow,
  createDivisionOsCutSliceHandoff,
  createGlobalPlazaCrowd,
  createInitialOutsourcingQuests,
  filterPlazaFreelancers,
  negotiateFreelancerRate,
  publishOutsourcingQuest,
  queryVisibleCrowdWithLod,
  summarizeHybridCrowdPresence,
} from "./mmorpg-global-outsourcing-plaza";
import {
  PLAZA_LANGUAGE_CODES,
  computeInverseSquareGain,
  createInitialVoiceSession,
  createTranslatedChatMessage,
  detectVoiceTransportMode,
  setTypingStatus,
  setVoicePresenceMode,
  syncVoiceChannelWithRoom,
  toggleHandRaise,
  toggleScreenShare,
  toggleVoiceMute,
  translateWebtoonMessage,
} from "./realtime-meeting-voice-chat-engine";
import { StudioGlobalMmorpgPlazaPanel } from "./StudioGlobalMmorpgPlazaPanel";
import {
  ALL_INTERACTIVE_OBJECT_KINDS,
  ESPRESSO_SPEED_MULTIPLIER,
  MAX_PHYSICS_DT_SEC,
  STUDIO_WORLD_HEIGHT,
  STUDIO_WORLD_WIDTH,
  clampPhysicsDt,
  computeRoomAcousticAttenuation,
  createDefaultStudioPhysicsWorld,
  findNearestInteractable,
  interactWithStudioObject,
  resolveCircleVsAabb,
  resolveCircleVsCircle,
  setPhysicsTargetPoint,
  stepStudioPhysicsWorld,
  type CircleBody,
} from "./vspace-physics-interactions-engine";

const FIXED_ISO = "2026-11-21T15:00:00.000Z";

async function settleLazyImports() {
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetProductionDemoSession();
});

describe("Wave 15A — 가상 스튜디오 물리 엔진 · 10종 인터랙션 · 회의실 방음", () => {
  it("01. clampPhysicsDt는 비정상·대형 프레임 델타를 안전 범위로 클램프한다", () => {
    expect(clampPhysicsDt(Number.NaN)).toBe(0);
    expect(clampPhysicsDt(-0.5)).toBe(0);
    expect(clampPhysicsDt(0)).toBe(0);
    expect(clampPhysicsDt(1.5)).toBe(MAX_PHYSICS_DT_SEC);
    expect(clampPhysicsDt(0.016)).toBe(0.016);
  });

  it("02. resolveCircleVsAabb는 벽 관통을 0으로 해소하고 반발 계수로 속도를 반사한다", () => {
    const body: CircleBody = {
      id: "b1",
      x: 108,
      y: 100,
      vx: 120,
      vy: 0,
      radius: 16,
      mass: 1,
      restitution: 0.5,
      friction: 0,
      maxSpeed: 300,
    };
    const wall = {
      id: "w1",
      labelKo: "테스트 벽",
      minX: 112,
      minY: 50,
      maxX: 140,
      maxY: 150,
      restitution: 0.5,
      solid: true,
    };
    const res = resolveCircleVsAabb(body, wall);
    expect(res.collided).toBe(true);
    expect(res.body.x).toBeLessThanOrEqual(wall.minX - body.radius + 1e-6);
    expect(res.body.vx).toBeLessThan(0);

    // 중심이 AABB 내부에 들어간 극단 상황도 탈출시킨다
    const trapped = resolveCircleVsAabb({ ...body, x: 115, y: 100 }, wall);
    expect(trapped.collided).toBe(true);
    expect(trapped.body.x).toBeLessThanOrEqual(wall.minX - body.radius + 1e-6);
  });

  it("03. resolveCircleVsCircle은 겹친 강체를 분리하고 탄성 임펄스를 교환한다", () => {
    const a: CircleBody = {
      id: "a",
      x: 100,
      y: 100,
      vx: 100,
      vy: 0,
      radius: 16,
      mass: 1,
      restitution: 0.8,
      friction: 0,
      maxSpeed: 300,
    };
    const b: CircleBody = {
      id: "b",
      x: 120,
      y: 100,
      vx: -60,
      vy: 0,
      radius: 16,
      mass: 1,
      restitution: 0.8,
      friction: 0,
      maxSpeed: 300,
    };
    const res = resolveCircleVsCircle(a, b);
    expect(res.collided).toBe(true);
    expect(Math.hypot(res.b.x - res.a.x, res.b.y - res.a.y)).toBeGreaterThanOrEqual(31.99);
    expect(res.a.vx).toBeLessThan(0);
    expect(res.b.vx).toBeGreaterThan(0);
  });

  it("04. 닫힌 회의실 방음문과 벽은 고속 이동 시에도 0% 관통 불변성을 지킨다", () => {
    let world = createDefaultStudioPhysicsWorld();
    // 회의실 A 닫힌 문(x:132..192, y:206..220) 바로 아래에 배치 후 위로 강제 이동
    world = { ...world, player: { ...world.player, x: 162, y: 245 } };
    for (let i = 0; i < 60; i += 1) {
      world = stepStudioPhysicsWorld(world, { moveX: 0, moveY: -1, dtSec: 0.05, subSteps: 3 });
    }
    expect(world.player.y).toBeGreaterThanOrEqual(220 + world.player.radius - 0.5);
    expect(world.activeRoomId).toBe("open-lounge");
  });

  it("05. 회의실 방음문을 열면 충돌이 해제되어 콘티 회의실 A 내부로 입장할 수 있다", () => {
    let world = createDefaultStudioPhysicsWorld();
    world = { ...world, player: { ...world.player, x: 162, y: 245 } };
    const opened = interactWithStudioObject(world, "obj-door-room-a");
    expect(opened.ok).toBe(true);
    expect(opened.sideEffect).toBe("room-door-toggled");
    world = opened.world;

    for (let i = 0; i < 30; i += 1) {
      world = stepStudioPhysicsWorld(world, { moveX: 0, moveY: -1, dtSec: 0.04, subSteps: 2 });
    }
    expect(world.player.y).toBeLessThan(206);
    expect(world.activeRoomId).toBe("storyboard-room-a");
  });

  it("06. 클릭 이동(targetPoint)은 목표에 떨림 없이 수렴하고 월드 경계 내부를 유지한다", () => {
    let world = createDefaultStudioPhysicsWorld();
    world = setPhysicsTargetPoint(world, { x: 9999, y: -500 });
    expect(world.targetPoint?.x).toBeLessThanOrEqual(STUDIO_WORLD_WIDTH - 28);
    expect(world.targetPoint?.y).toBeGreaterThanOrEqual(28);

    world = setPhysicsTargetPoint(world, { x: 540, y: 296 });
    for (let i = 0; i < 40; i += 1) {
      world = stepStudioPhysicsWorld(world, { dtSec: 0.04, subSteps: 2 });
    }
    expect(world.targetPoint).toBeNull();
    expect(Math.hypot(world.player.vx, world.player.vy)).toBeLessThan(2);
    expect(Math.abs(world.player.x - 540)).toBeLessThan(12);
  });

  it("07. 10종 스튜디오 상호작용 오브젝트가 모두 등록되고 근접 탐색이 정확하다", () => {
    const world = createDefaultStudioPhysicsWorld();
    const presentKinds = new Set(world.objects.map((o) => o.kind));
    for (const kind of ALL_INTERACTIVE_OBJECT_KINDS) {
      expect(presentKinds.has(kind)).toBe(true);
    }
    const nearEspresso = { ...world, player: { ...world.player, x: 118, y: 292 } };
    expect(findNearestInteractable(nearEspresso)?.kind).toBe("coffee-machine");
  });

  it("08. 의자 착석 스냅(sit-chair)과 휴식 소파(rest-sofa)가 좌표 스냅 및 스태미나 회복을 수행한다", () => {
    const world0 = createDefaultStudioPhysicsWorld();
    const sat = interactWithStudioObject(world0, "obj-chair-work-01");
    expect(sat.world.seatedObjectId).toBe("obj-chair-work-01");
    expect(sat.world.player.x).toBe(162);
    expect(sat.world.player.y).toBe(166);
    const stood = interactWithStudioObject(sat.world, "obj-chair-work-01");
    expect(stood.world.seatedObjectId).toBeNull();

    const rested = interactWithStudioObject(world0, "obj-rest-sofa-01");
    expect(rested.world.stamina).toBe(100);
    expect(rested.world.seatedObjectId).toBe("obj-rest-sofa-01");
  });

  it("09. 자동 에스프레소 머신은 스태미나 회복과 180초 이동 속도 버프를 부여한다", () => {
    const base = { ...createDefaultStudioPhysicsWorld(), stamina: 60 };
    const brewed = interactWithStudioObject(base, "obj-coffee-machine-01");
    expect(brewed.world.stamina).toBe(85);
    expect(brewed.world.focusBuffSec).toBe(180);

    const normalStep = stepStudioPhysicsWorld(base, { moveX: 1, moveY: 0, dtSec: 0.05 });
    const buffedStep = stepStudioPhysicsWorld(brewed.world, { moveX: 1, moveY: 0, dtSec: 0.05 });
    expect(buffedStep.player.vx).toBeGreaterThan(normalStep.player.vx);
    expect(ESPRESSO_SPEED_MULTIPLIER).toBeGreaterThan(1);
  });

  it("10. 화이트보드 원고 메모 기록과 마감 카운트다운 전광판 경보 전환이 동작한다", () => {
    const world0 = createDefaultStudioPhysicsWorld();
    const wb = interactWithStudioObject(world0, "obj-whiteboard-01", {
      note: "14컷 말풍선 여백 확보 요청",
    });
    expect(wb.world.whiteboardNotes.at(-1)).toBe("14컷 말풍선 여백 확보 요청");

    const dl = interactWithStudioObject(wb.world, "obj-deadline-board-01");
    expect(dl.world.deadlineUrgentMode).toBe(true);
  });

  it("11. 조명 스위치 3모드 순환, 3D 에셋 진열대 회전, 외주 키오스크 오픈 신호가 동작한다", () => {
    let world = createDefaultStudioPhysicsWorld();
    world = interactWithStudioObject(world, "obj-light-switch-01").world;
    expect(world.lightingMood).toBe("warm-atelier");
    world = interactWithStudioObject(world, "obj-light-switch-01").world;
    expect(world.lightingMood).toBe("night-crunch");

    const ped = interactWithStudioObject(world, "obj-asset-pedestal-01");
    expect(ped.world.inspectedAssetIndex).toBe(1);

    const kiosk = interactWithStudioObject(ped.world, "obj-quest-kiosk-01");
    expect(kiosk.sideEffect).toBe("open-quest-board");
    expect(kiosk.world.questBoardOpenCount).toBe(1);
  });

  it("12. 응원 종이비행기 투척 소품은 벽에 튕기며 비행하고 TTL 만료 후 정리된다", () => {
    let world = { ...createDefaultStudioPhysicsWorld(), player: { ...createDefaultStudioPhysicsWorld().player, x: 900, y: 300 } };
    const launched = interactWithStudioObject(world, "obj-paper-plane-01", {
      throwDirection: { x: 1, y: 0 },
      projectileKind: "paper-plane",
    });
    expect(launched.world.projectiles).toHaveLength(1);
    world = launched.world;

    for (let i = 0; i < 12; i += 1) {
      world = stepStudioPhysicsWorld(world, { dtSec: 0.04, subSteps: 2 });
    }
    expect(world.projectiles[0]?.bounces).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < 120; i += 1) {
      world = stepStudioPhysicsWorld(world, { dtSec: 0.05 });
    }
    expect(world.projectiles).toHaveLength(0);
  });
});

describe("Wave 15A — 다중 회의실 음향 격리 · 음성 FSM · 6개국어 실시간 웹툰 번역", () => {
  it("13. 닫힌 회의실 방음문은 0% 완전 격리, 열린 문은 누설 감쇠, 동일 회의실은 100% 음향을 제공한다", () => {
    const world = createDefaultStudioPhysicsWorld();
    const insideRoomA = { x: 150, y: 150 };
    const inLounge = { x: 162, y: 260 };

    const closedRes = computeRoomAcousticAttenuation(world, insideRoomA, inLounge);
    expect(closedRes.isolated).toBe(true);
    expect(closedRes.gain).toBe(0);
    expect(closedRes.channelMode).toBe("soundproof-blocked");

    const openedWorld = interactWithStudioObject(world, "obj-door-room-a").world;
    const openRes = computeRoomAcousticAttenuation(openedWorld, insideRoomA, inLounge);
    expect(openRes.isolated).toBe(false);
    expect(openRes.gain).toBeGreaterThan(0);
    expect(openRes.gain).toBeLessThan(0.5);
    expect(openRes.channelMode).toBe("door-bleed");

    const sameRoomRes = computeRoomAcousticAttenuation(world, insideRoomA, { x: 240, y: 170 });
    expect(sameRoomRes.gain).toBe(1);
    expect(sameRoomRes.channelMode).toBe("room-channel");
  });

  it("14. 역제곱 근접 음성 감쇠(computeInverseSquareGain)는 거리에 따라 단조 감소하고 최대 거리 밖은 0이다", () => {
    const g0 = computeInverseSquareGain(0);
    const g50 = computeInverseSquareGain(50);
    const g150 = computeInverseSquareGain(150);
    const gFar = computeInverseSquareGain(320);
    expect(g0).toBe(1);
    expect(g50).toBeLessThan(g0);
    expect(g150).toBeLessThan(g50);
    expect(gFar).toBe(0);
  });

  it("15. 회의실 입장 시 음성 채널이 자동 전환되고 내부 참여자 오디오 게인이 즉시 1.0으로 연결된다", () => {
    const world0 = createDefaultStudioPhysicsWorld();
    const session0 = createInitialVoiceSession(world0, "plaza-open");
    expect(session0.activeChannelId).toBe("voice-proximity:open-lounge");
    expect(session0.participants.find((p) => p.id === "peer-pd-kim")?.effectiveGain).toBe(0);

    const worldInRoomA = {
      ...world0,
      player: { ...world0.player, x: 180, y: 160 },
      activeRoomId: "storyboard-room-a" as const,
    };
    const session1 = syncVoiceChannelWithRoom(session0, worldInRoomA, worldInRoomA.player);
    expect(session1.activeChannelId).toBe("voice-room:storyboard-room-a");
    expect(session1.participants.find((p) => p.id === "peer-pd-kim")?.effectiveGain).toBe(1);
  });

  it("16. 음성 제어 FSM(음소거·손들기·화면공유·타이핑)과 무과금 오프라인 폴백 감지가 정확하다", () => {
    const world = createDefaultStudioPhysicsWorld();
    let voice = createInitialVoiceSession(world, "plaza-open");
    expect(detectVoiceTransportMode(false)).toBe("local-sim-fallback");

    voice = toggleVoiceMute(voice);
    expect(voice.muted).toBe(true);
    voice = toggleHandRaise(voice);
    expect(voice.handRaised).toBe(true);
    voice = toggleScreenShare(voice);
    expect(voice.screenSharing).toBe(true);
    voice = setTypingStatus(voice, "artist-01", true);
    expect(voice.typingUserIds).toContain("artist-01");
    voice = setTypingStatus(voice, "artist-01", false);
    expect(voice.typingUserIds).not.toContain("artist-01");
  });

  it("17. 포커스 타임 격리(focus-dnd) 전환 시 군중 음성이 전원 0으로 차단되고 마이크가 음소거된다", () => {
    const world = createDefaultStudioPhysicsWorld();
    const openSession = createInitialVoiceSession(world, "plaza-open");
    expect(openSession.participants.some((p) => p.effectiveGain > 0)).toBe(true);

    const dndSession = setVoicePresenceMode(openSession, world, "focus-dnd");
    expect(dndSession.presenceMode).toBe("focus-dnd");
    expect(dndSession.muted).toBe(true);
    expect(dndSession.connectionStatus).toBe("disconnected");
    expect(dndSession.participants.every((p) => p.effectiveGain === 0)).toBe(true);
  });

  it("18. 웹툰 실무 핵심 4대 표현이 6개국어(ko·en·vi·th·id·ja)로 정확하게 번역된다", () => {
    const keyPhrases = ["선화 20컷 마감", "라인아트 수정", "채색 톤 통일", "단가 협의"];
    for (const phrase of keyPhrases) {
      for (const targetLang of PLAZA_LANGUAGE_CODES) {
        const res = translateWebtoonMessage(phrase, "ko", targetLang);
        expect(res.translatedText.length).toBeGreaterThan(0);
        if (targetLang !== "ko") {
          expect(res.method).toBe("exact-phrase");
          expect(res.translatedText).not.toBe(phrase);
        }
      }
    }
    expect(translateWebtoonMessage("선화 20컷 마감", "ko", "vi").translatedText).toBe(
      "Hạn chót 20 khung đi nét",
    );
    expect(translateWebtoonMessage("채색 톤 통일", "ko", "th").translatedText).toBe(
      "ปรับโทนสีให้สม่ำเสมอ",
    );
    expect(translateWebtoonMessage("단가 협의", "ko", "id").translatedText).toBe(
      "Negosiasi tarif per panel",
    );
    expect(translateWebtoonMessage("라인아트 수정", "ko", "ja").translatedText).toBe("線画修正");
  });

  it("19. 동남아·일본어 입력도 한국어 실무 용어로 역방향 정확 번역된다", () => {
    expect(translateWebtoonMessage("Hạn chót 20 khung đi nét", "vi", "ko").translatedText).toBe(
      "선화 20컷 마감",
    );
    expect(translateWebtoonMessage("เจรจาค่าจ้างต่อช่อง", "th", "ko").translatedText).toBe("단가 협의");
    expect(translateWebtoonMessage("Revisi lineart", "id", "ko").translatedText).toBe("라인아트 수정");
    expect(translateWebtoonMessage("着彩トーン統一", "ja", "ko").translatedText).toBe("채색 톤 통일");
  });

  it("20. 복합 문장 번역은 에피소드 번호를 유지하며 6개국어 채팅 메시지를 생성한다", () => {
    const msg = createTranslatedChatMessage({
      id: "m-1",
      channelId: "voice-room:global-meeting-room-c",
      roomId: "global-meeting-room-c",
      senderId: "pd-1",
      senderName: "김PD",
      senderLang: "ko",
      text: "EP12 선화 20컷 마감 · 단가 협의 부탁합니다",
      createdAtIso: FIXED_ISO,
    });
    expect(msg.matchedGlossaryIds).toContain("lineart-20-deadline");
    expect(msg.matchedGlossaryIds).toContain("rate-negotiation");
    expect(msg.translations.vi).toContain("EP12");
    expect(msg.translations.vi).toContain("Hạn chót 20 khung đi nét");
    expect(msg.translations.th).toContain("เจรจาค่าจ้างต่อช่อง");
  });

  it("21. 동일 언어 및 미등록 자유 문장은 원문을 손실 없이 보존한다", () => {
    const same = translateWebtoonMessage("오늘 야식 추천", "ko", "ko");
    expect(same.method).toBe("same-language");
    expect(same.translatedText).toBe("오늘 야식 추천");

    const fallback = translateWebtoonMessage("스튜디오 옥상 씬 참고 사진 공유합니다", "ko", "en");
    expect(fallback.method).toBe("fallback-tagged");
    expect(fallback.translatedText).toContain("스튜디오 옥상 씬 참고 사진 공유합니다");
  });
});

describe("Wave 15A — MMORPG 대규모 글로벌 외주 광장 엔진 (콜드스타트·시차·환율·에스크로)", () => {
  it("22. 60명 대규모 군중이 4개 길드 존에 고르게 생성되고 하이브리드 풀 + 신뢰 가드레일을 갖춘다", () => {
    const crowd = createGlobalPlazaCrowd(60);
    expect(crowd).toHaveLength(60);
    const summary = summarizeHybridCrowdPresence(crowd);
    expect(summary.liveOnlineCount).toBeGreaterThan(20);
    expect(summary.asyncStandbyCount).toBeGreaterThan(10);
    expect(summary.seaPartnerCount).toBeGreaterThanOrEqual(20);

    for (const zone of PLAZA_GUILD_ZONES) {
      expect(crowd.some((c) => c.guildZoneId === zone.id)).toBe(true);
    }
    for (const member of crowd) {
      expect(member.trust.zeroLeakWatermarkRequired).toBe(true);
      expect(member.trust.scopedCutViewOnly).toBe(true);
      expect(member.trust.onTimeDeliveryRatePct).toBeGreaterThanOrEqual(90);
      expect(member.sampleProfileLabel).toBe("예시 프로필");
    }
  });

  it("23. 공간 해시 및 3단계 LOD 컬링이 거리별로 full-bubble / compact-badge / dot-cluster를 정확히 분류한다", () => {
    const crowd = createGlobalPlazaCrowd(60);
    const grid = buildCrowdSpatialHash(crowd, 120);
    expect(grid.totalCount).toBe(60);

    const visible = queryVisibleCrowdWithLod(
      grid,
      { minX: 0, minY: 0, maxX: STUDIO_WORLD_WIDTH, maxY: STUDIO_WORLD_HEIGHT },
      { x: 148, y: 380 },
    );
    expect(visible).toHaveLength(60);
    expect(visible.some((v) => v.lod === "full-bubble")).toBe(true);
    expect(visible.some((v) => v.lod === "compact-badge")).toBe(true);
    expect(visible.some((v) => v.lod === "dot-cluster")).toBe(true);
    expect(visible[0]!.distanceToFocus).toBeLessThanOrEqual(visible[visible.length - 1]!.distanceToFocus);
  });

  it("24. 길드·국가·언어·하이브리드 대기풀·단가·검색어 다중 필터가 정확히 동작한다", () => {
    const crowd = createGlobalPlazaCrowd(60);
    const vnLive = filterPlazaFreelancers(crowd, {
      timezoneId: "VN-ICT",
      presenceMode: "live-only",
      maxRateKrw: 18000,
    });
    expect(vnLive.length).toBeGreaterThan(0);
    expect(vnLive.every((item) => item.timezoneId === "VN-ICT" && item.presenceKind === "live-online")).toBe(true);

    const asyncOnly = filterPlazaFreelancers(crowd, { presenceMode: "async-verified-pool" });
    expect(asyncOnly.length).toBeGreaterThan(0);
    expect(asyncOnly.every((item) => item.presenceKind === "async-standby")).toBe(true);
  });

  it("25. KST 기준 베트남·태국·인도네시아(-2h)·필리핀(-1h)·일본(0h)·미국(-17h) 겹치는 근무 시간을 정확히 계산한다", () => {
    expect(computeKstWorkOverlap(9, 18, "VN-ICT").overlapHours).toBe(7);
    expect(computeKstWorkOverlap(9, 18, "TH-ICT").overlapHours).toBe(7);
    expect(computeKstWorkOverlap(9, 18, "ID-WIB").overlapHours).toBe(7);
    expect(computeKstWorkOverlap(9, 18, "PH-PHT").overlapHours).toBe(8);
    expect(computeKstWorkOverlap(9, 18, "JP-JST").overlapHours).toBe(9);
    const us = computeKstWorkOverlap(9, 18, "US-PST");
    // LA PST 09~18시 = KST 02~11시 -> 서울 09~18시와 정확히 2시간(09~11시) 겹침, async-handoff 분류
    expect(us.overlapHours).toBe(2);
    expect(us.syncQuality).toBe("async-handoff");
  });

  it("26. 6종 통화(KRW·USD·VND·THB·IDR·JPY) 환산 및 30/40/30 마일스톤 에스크로 분할이 정확하다", () => {
    const calc = convertCutRateAndEscrow({
      ratePerCutKrw: 15000,
      cutCount: 20,
      targetCurrency: "VND",
    });
    expect(calc.grossKrw).toBe(300000);
    expect(calc.escrowFeeKrw).toBe(9000);
    expect(calc.totalDepositKrw).toBe(309000);
    for (const code of PLAZA_CURRENCY_CODES) {
      expect(calc.allCurrencies[code].perCut).toBeGreaterThan(0);
      expect(calc.allCurrencies[code].netTotal).toBeGreaterThan(0);
    }
    expect(calc.milestones.map((m) => m.ratioPct)).toEqual([30, 40, 30]);
    expect(calc.milestones.reduce((acc, m) => acc + m.amountKrw, 0)).toBe(calc.netPayoutKrw);
  });

  it("27. 1:1 단가 협상·1클릭 퀘스트 발행·분업 OS Cut-Slice 계약 인계 페이로드가 완전한 가드레일을 포함한다", () => {
    const crowd = createGlobalPlazaCrowd(60);
    const vnArtist = crowd[0]!;
    const accepted = negotiateFreelancerRate(vnArtist, vnArtist.ratePerCutKrw, 20);
    expect(accepted.accepted).toBe(true);

    const counter = negotiateFreelancerRate(vnArtist, Math.round(vnArtist.ratePerCutKrw * 0.6), 20);
    expect(counter.accepted).toBe(false);
    expect(counter.verdict).toBe("counter-offer");

    const quest = publishOutsourcingQuest({
      titleKo: "EP12 1~20컷 베트남 선화 협업",
      guildZoneId: "lineart-storyboard",
      roleKey: "lineart",
      episodeId: "episode-12",
      cutRangeStart: 1,
      cutRangeEnd: 20,
      budgetPerCutKrw: 14500,
      targetCurrency: "VND",
      targetLanguages: ["ko", "vi"],
      existingCount: createInitialOutsourcingQuests().length,
      nowIso: FIXED_ISO,
    });
    expect(quest.cutCount).toBe(20);
    expect(quest.dispatchMode).toBe("live-plaza-and-async-board");

    const handoff = createDivisionOsCutSliceHandoff({
      projectId: "sample-project",
      quest,
      freelancer: vnArtist,
      agreedRatePerCutKrw: accepted.agreedRatePerCutKrw,
      nowIso: FIXED_ISO,
    });
    expect(handoff.schemaVersion).toBe("toonstudio.cut-slice-handoff.v1");
    expect(handoff.divisionRoleFolder).toBe("20_LINE");
    expect(handoff.zeroLeakPolicy.forensicWatermarkRequired).toBe(true);
    expect(handoff.zeroLeakPolicy.scopedCutViewOnly).toBe(true);
    expect(handoff.escrowMilestones).toHaveLength(3);
  });
});

describe("Wave 15A — UI 렌더링 · 상호작용 · 가상 스튜디오 & 제작 허브 이중 지연 진입", () => {
  it("28. 최상단 포커스 타임 격리(방해 금지) 토글과 하이브리드 콜드스타트 방어 요약 바가 정상 동작한다", () => {
    render(<StudioGlobalMmorpgPlazaPanel entryContext="virtual-space" />);
    const root = screen.getByTestId("studio-global-mmorpg-plaza-panel");
    expect(root.getAttribute("data-focus-mode")).toBe("plaza-open");
    expect(screen.getByTestId("gpp-hybrid-coldstart-bar").textContent).toContain("실시간 접속");
    expect(screen.getByTestId("gpp-hybrid-coldstart-bar").textContent).toContain("상시 검증 풀");

    fireEvent.click(screen.getByTestId("gpp-focus-mode-toggle"));
    expect(root.getAttribute("data-focus-mode")).toBe("focus-dnd");
    expect(screen.getByTestId("gpp-voice-dnd-notice")).toBeTruthy();
    expect(screen.getByTestId("gpp-voice-connection-badge").textContent).toContain("방해 금지");
  });

  it("29. 회의실 입장·종이비행기 투척·6개국어 실시간 번역 채팅 전송이 UI에 즉시 반영된다", () => {
    render(<StudioGlobalMmorpgPlazaPanel />);
    fireEvent.click(screen.getByTestId("gpp-enter-room-storyboard-room-a"));
    expect(screen.getByTestId("gpp-voice-channel-label").textContent).toContain("콘티 회의실 A");

    fireEvent.click(screen.getByTestId("gpp-throw-plane-btn"));
    expect(screen.getByTestId("gpp-interaction-log").textContent).toContain("종이비행기");

    fireEvent.change(screen.getByTestId("gpp-viewer-lang-select"), { target: { value: "vi" } });
    fireEvent.change(screen.getByTestId("gpp-chat-input"), { target: { value: "선화 20컷 마감" } });
    fireEvent.click(screen.getByTestId("gpp-chat-send-btn"));
    expect(screen.getByTestId("gpp-chat-feed").textContent).toContain("Hạn chót 20 khung đi nét");
  });

  it("30. 동남아·글로벌 프리랜서 디렉터리, 신뢰 가드레일 카드, 1클릭 퀘스트 발행 및 Cut-Slice 인계가 동작한다", () => {
    render(<StudioGlobalMmorpgPlazaPanel projectId="sample-project" episodeId="episode-12" />);
    fireEvent.click(screen.getByTestId("gpp-tab-global-directory"));

    expect(screen.getByTestId("gpp-overlap-VN-ICT").textContent).toContain("7시간 겹침");
    expect(screen.getByTestId("gpp-currency-grid").textContent).toContain("VND");
    expect(screen.getByTestId("gpp-currency-grid").textContent).toContain("THB");
    expect(screen.getByTestId("gpp-freelancer-card-plaza-freelancer-001").textContent).toContain(
      "부분 컷 워터마크 열람",
    );

    fireEvent.click(screen.getByTestId("gpp-negotiate-btn-plaza-freelancer-001"));
    expect(screen.getByTestId("gpp-quest-handoff-view")).toBeTruthy();

    fireEvent.click(screen.getByTestId("gpp-submit-negotiation-btn"));
    expect(screen.getByTestId("gpp-negotiation-result")).toBeTruthy();

    fireEvent.click(screen.getByTestId("gpp-publish-quest-btn"));
    fireEvent.click(screen.getByTestId("gpp-handoff-btn-quest-ep12-lineart-01"));
    expect(screen.getByTestId("gpp-cut-slice-handoff-box").textContent).toContain(
      "toonstudio.cut-slice-handoff.v1",
    );
  });

  it("31. 가상 스튜디오 협업 허브에서 global-mmorpg-plaza 탭으로 지연 로딩 마운트된다", async () => {
    render(<StudioVirtualSpaceCollaborationHub />);
    fireEvent.click(screen.getByRole("tab", { name: "글로벌 외주 광장 · 물리/회의실" }));
    await settleLazyImports();
    await waitFor(() => {
      expect(screen.getByTestId("studio-global-mmorpg-plaza-panel")).toBeTruthy();
    });
    expect(
      screen.getByTestId("studio-global-mmorpg-plaza-panel").getAttribute("data-entry-context"),
    ).toBe("virtual-space");
  });

  it("32. 제작 허브(ProductionProjectPage)의 독립 disclosure에서 지연 로딩 마운트된다", async () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/overview"]}>
        <Routes>
          <Route
            path="/production/projects/:projectId/overview"
            element={<ProductionProjectPage surface="overview" />}
          />
        </Routes>
      </MemoryRouter>,
    );
    await settleLazyImports();
    const disclosure = await screen.findByTestId("studio-global-plaza-disclosure");
    expect(disclosure).toBeTruthy();

    fireEvent.click(disclosure.querySelector("summary")!);
    (disclosure as HTMLDetailsElement).open = true;
    fireEvent(disclosure, new Event("toggle"));
    await settleLazyImports();

    await waitFor(() => {
      expect(screen.getByTestId("studio-global-mmorpg-plaza-panel")).toBeTruthy();
    });
    expect(
      screen.getByTestId("studio-global-mmorpg-plaza-panel").getAttribute("data-entry-context"),
    ).toBe("production-hub");
  });
});
