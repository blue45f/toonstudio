import { describe, expect, it, vi } from "vitest";
import { acquireStudioHuddleAudioFocus } from "../../live/huddle/studio-p2p-huddle-audio-focus";

import { studioVirtualToonHqManifest } from "./hq/toon-hq-manifest";
import { advanceOffice2dActor, createOffice2dActor, office2dActorBlink, office2dActorBob } from "./office2d-actors";
import { office2dActorFoot, office2dActorHeadY, OFFICE2D_ACTOR_HEIGHT } from "./office2d-actor-geometry";
import {
  DYNAMIC_CREATOR_SPRITE_CAST,
  DYNAMIC_SPRITE_EXPRESSIONS,
  DYNAMIC_SPRITE_VFX_PRESETS,
  renderDynamicCreatorSpriteSvg,
} from "../studio-virtual-space-dynamic-sprite-engine";
import { office2dBaseZoom, office2dVisibleWorldSpan } from "./office2d-camera";
import {
  Office2dCoworkerCrowd,
  OFFICE2D_COWORKER_MAX,
  office2dCoworkerBudget,
  planOffice2dCoworkers,
  stepOffice2dCoworkerPresence,
} from "./office2d-coworkers";
import { layoutOffice2dLabels, office2dBoxesOverlap, office2dSignAlpha } from "./office2d-label-layout";
import { Office2dParticles } from "./office2d-particles";
import { OFFICE2D_WORK_LOOP, OFFICE2D_WORK_STEP_SECONDS, office2dPoseFrame } from "./office2d-poses";
import type { Office2dCanvas2D } from "./office2d-procedural-art";
import { OFFICE2D_PIXEL_RATIO_STEPS, Office2dResolutionGovernor } from "./office2d-quality";
import { office2dSceneFor, type Office2dSeatVisual } from "./office2d-scene";
import {
  OFFICE2D_CHARACTERS,
  OFFICE2D_GESTURE_FRAMES,
  OFFICE2D_SIT_FRONT_FRAMES,
  OFFICE2D_WORK_ROWS,
  office2dCharacterForNpc,
  office2dCharacterForRoleText,
  office2dGestureForEmote,
  office2dWorkSheetUrl,
} from "./office2d-sprite-catalog";
import {
  findOffice2dQuickEmote,
  OFFICE2D_DEFAULT_CLAIMED_SEAT_ID,
  OFFICE2D_QUICK_EMOTES,
  office2dDaylight,
  office2dOutsideColor,
  office2dPathSpeedMultiplier,
  Office2dStageExtensions,
  playOffice2dSpatialCue,
  readOffice2dClaimedSeatId,
  readOffice2dSoundMuted,
  writeOffice2dClaimedSeatId,
  writeOffice2dSoundMuted,
} from "./office2d-stage-extensions";
import {
  computeOffice2dObjectOcclusion,
  findOffice2dActionableObjectAhead,
  OFFICE2D_ROOM_ART_SPECS,
  paintOffice2dComicBursts,
  paintOffice2dDoorwayAndSeatPreview,
  paintOffice2dNorthWallArtMural,
  paintOffice2dRoomAmbientEffects,
  paintOffice2dRoomFloorBackdrops,
  paintOffice2dSchematicOverlay,
  resolveOffice2dSchematicClickTarget,
  resolveOffice2dWorkstation,
} from "./office2d-backdrop-art";
import { TOON_HQ_ROOMS } from "./hq/toon-hq-blueprint";
import {
  paintOffice2dActorSpatialAura,
  paintOffice2dFloorDetails,
  paintOffice2dObjectLiveOverlay,
  paintOffice2dWallDecorLive,
} from "./office2d-world-details";

const backSeat: Office2dSeatVisual = { id: "seat-back", anchor: { x: 100, y: 200 }, attach: { x: 100, y: 190 }, facing: "up", chair: "chair-back" };
const frontSeat: Office2dSeatVisual = { id: "seat-front", anchor: { x: 300, y: 200 }, attach: { x: 300, y: 190 }, facing: "down", chair: "chair-front" };

function actor(id = "a") {
  return createOffice2dActor({ id, kind: "peer", character: "artist", accent: "#fff", name: "작가", x: 10, y: 20, now: 0 });
}

describe("화면 공간 라벨 배치", () => {
  it("겹치면 우선순위 낮은 라벨을 위로 올리고, 자리가 없으면 흐리게 남긴다", () => {
    const base = { anchorX: 100, bottom: 100, width: 80, height: 20, distance: 0 };
    const layout = layoutOffice2dLabels([
      { ...base, id: "npc", priority: 2, distance: 30 },
      { ...base, id: "self", priority: 4 },
      { ...base, id: "peer", priority: 3, distance: 10 },
    ]);
    expect(layout.get("self")?.lift).toBe(0);
    expect(layout.get("peer")?.lift).toBe(23);
    expect(layout.get("npc")?.lift).toBe(46);
    expect([...layout.values()].every((placement) => placement.alpha === 1)).toBe(true);
    const crowded = layoutOffice2dLabels(Array.from({ length: 6 }, (_, index) => ({ ...base, id: `p${index}`, priority: 1, distance: index })));
    expect(crowded.get("p5")?.alpha).toBeLessThan(1);
    expect(crowded.get("p5")?.lift).toBe(0);
  });

  it("벽 명판은 이름표와 겹칠 때만 흐려진다", () => {
    const sign = { x: 0, y: 0, width: 100, height: 24 };
    expect(office2dSignAlpha(sign, [{ x: 50, y: 10, width: 60, height: 20 }])).toBeLessThan(0.5);
    expect(office2dSignAlpha(sign, [{ x: 300, y: 10, width: 60, height: 20 }])).toBe(1);
    expect(office2dBoxesOverlap(sign, { x: 101, y: 0, width: 10, height: 10 })).toBe(false);
  });
});

describe("배우 자세 프레임", () => {
  it("책상을 보고 앉으면 작업 루프를 돌고, 배우마다 박자가 다르다", () => {
    const worker = actor("worker-1");
    worker.seat = backSeat;
    const frames = Array.from({ length: OFFICE2D_WORK_LOOP.length }, (_, step) => office2dPoseFrame(worker, step * OFFICE2D_WORK_STEP_SECONDS + 0.01, 0, false));
    expect(frames.every((frame) => frame.sheet === "work" && frame.row === OFFICE2D_WORK_ROWS.sitBack)).toBe(true);
    expect(new Set(frames.map((frame) => frame.col)).size).toBeGreaterThan(2);
    const other = actor("worker-2");
    other.seat = backSeat;
    const sequence = (target: typeof worker) => Array.from({ length: 16 }, (_, step) => office2dPoseFrame(target, step * 0.2, 0, false).col).join("");
    expect(sequence(worker)).not.toBe(sequence(other));
    expect(office2dPoseFrame(worker, 3.3, 0, true).col).toBe(0);
  });

  it("앞을 보고 앉으면 말할 때 입을 움직이고, 웃음 이모트는 웃음 프레임이다", () => {
    const talker = actor();
    talker.seat = frontSeat;
    talker.bubble = "안녕하세요";
    const cols = new Set([0, 0.3, 0.6, 0.9].map((time) => office2dPoseFrame(talker, time, 0, false).col));
    expect(cols).toEqual(new Set([OFFICE2D_SIT_FRONT_FRAMES.talk, OFFICE2D_SIT_FRONT_FRAMES.idle]));
    talker.bubble = null;
    talker.emote = { glyph: "😂", until: 5000, kind: "laugh" };
    expect(office2dPoseFrame(talker, 0, 1000, false)).toEqual({ sheet: "work", row: OFFICE2D_WORK_ROWS.sitFront, col: OFFICE2D_SIT_FRONT_FRAMES.laugh });
  });

  it("서서 멈춘 상태의 제스처만 제스처 프레임이고, 걷거나 만료되면 보행 시트로 돌아간다", () => {
    const waver = actor();
    waver.gesture = { kind: "thumbs", until: 3000 };
    expect(office2dPoseFrame(waver, 0, 1000, false)).toEqual({ sheet: "work", row: OFFICE2D_WORK_ROWS.gesture, col: OFFICE2D_GESTURE_FRAMES.thumbs });
    expect(office2dPoseFrame(waver, 0, 4000, false).sheet).toBe("walk");
    waver.moving = true;
    expect(office2dPoseFrame(waver, 0, 1000, false).sheet).toBe("walk");
  });

  it("앉은 사람의 발과 머리 위치는 좌석 방향에 따라 정해진다", () => {
    const sitter = actor();
    sitter.seat = backSeat;
    expect(office2dActorFoot(sitter)).toEqual({ x: 100, y: 205 });
    expect(office2dActorHeadY(sitter)).toBeCloseTo(205 - OFFICE2D_ACTOR_HEIGHT * 0.8);
    sitter.seat = null;
    expect(office2dActorHeadY(sitter)).toBeCloseTo(20 - OFFICE2D_ACTOR_HEIGHT * 0.98);
  });
});

describe("직군 시트·제스처 매핑", () => {
  it("직함 문구로 직군을 고른다(더 구체적인 직군 우선)", () => {
    expect(office2dCharacterForRoleText("누르 · 식자 담당")).toBe("letterer");
    expect(office2dCharacterForRoleText("테오 · 3D 아티스트")).toBe("modeler");
    expect(office2dCharacterForRoleText("민재 · 편집 PD")).toBe("editor");
    expect(office2dCharacterForRoleText("하나 · 스토리 PD")).toBe("pd");
    expect(office2dCharacterForRoleText("루카 · 채색 어시스턴트")).toBe("colorist");
    expect(office2dCharacterForRoleText("아마라 · 배경 작가")).toBe("bgartist");
    expect(office2dCharacterForRoleText("도윤 · 콘티 작가")).toBe("writer");
    expect(office2dCharacterForRoleText("서하 · 웹툰 작가")).toBe("artist");
    expect(office2dCharacterForRoleText("하늘 Haneul")).toBeNull();
  });

  it("8개 직군 시트와 작업 자세 시트 경로를 갖고, 대화형 NPC도 직군에 맞는다", () => {
    expect(OFFICE2D_CHARACTERS).toHaveLength(8);
    expect(office2dWorkSheetUrl("editor")).toBe("/assets/virtual-studio/office-cast-v2/editor-work.webp");
    expect(office2dCharacterForNpc("npc-editor")).toBe("editor");
    expect(office2dGestureForEmote("wave")).toBe("wave");
    expect(office2dGestureForEmote("party")).toBe("cheer");
    expect(office2dGestureForEmote("coffee")).toBeNull();
  });
});

describe("상주 동료", () => {
  const scene = office2dSceneFor(studioVirtualToonHqManifest(false));

  it("공정 방의 책상 좌석에만, 결정적으로 배치한다", () => {
    const plans = planOffice2dCoworkers(scene);
    expect(plans).toHaveLength(OFFICE2D_COWORKER_MAX);
    expect(new Set(plans.map((plan) => plan.seat.id)).size).toBe(plans.length);
    expect(plans.every((plan) => plan.seat.facing === "up" && plan.seat.chair === "chair-back")).toBe(true);
    expect(plans.find((plan) => plan.roomId === "hq-lettering-desk")?.character).toBe("letterer");
    expect(planOffice2dCoworkers(scene).map((plan) => plan.id)).toEqual(plans.map((plan) => plan.id));
  });

  it("팀원이 늘면 그만큼 줄인다", () => {
    expect(office2dCoworkerBudget(8, 0)).toBe(8);
    expect(office2dCoworkerBudget(8, 3)).toBe(5);
    expect(office2dCoworkerBudget(8, 20)).toBe(0);
  });

  it("누가 다가오면 자리를 비켰다가, 12초 동안 비면 돌아온다", () => {
    const presence = { alpha: 1, vacatedAt: null as number | null };
    const base = { seat: backSeat, visible: true, seatTaken: false, deltaSeconds: 0.5 };
    expect(stepOffice2dCoworkerPresence(presence, { ...base, occupants: [{ x: 110, y: 210 }], now: 1000 })).toBe(false);
    expect(presence.vacatedAt).toBe(1000);
    expect(stepOffice2dCoworkerPresence(presence, { ...base, occupants: [{ x: 600, y: 600 }], now: 8000 })).toBe(false);
    expect(stepOffice2dCoworkerPresence(presence, { ...base, occupants: [{ x: 600, y: 600 }], now: 13_500 })).toBe(true);
  });

  it("무리는 자리를 막는 몸체를 앉을 때 붙이고 비킬 때 뗀다", () => {
    const blocked = new Set<string>();
    const crowd = new Office2dCoworkerCrowd(scene, 0, { block: (id) => blocked.add(id), unblock: (id) => blocked.delete(id) });
    const input = { peerCount: 0, language: "ko" as const, occupants: [], takenSeatIds: new Set<string>(), seatedAnchors: [] };
    for (let index = 0; index < 10; index += 1) crowd.update(0.1, index * 100, input);
    expect(blocked.size).toBe(crowd.size);
    expect(crowd.visibleActors().every((member) => member.kind === "ambient" && member.name.startsWith("NPC · "))).toBe(true);
    for (let index = 0; index < 10; index += 1) crowd.update(0.1, 1000 + index * 100, { ...input, peerCount: crowd.size });
    expect(blocked.size).toBe(0);
    expect(new Office2dCoworkerCrowd(null, 0, { block: () => undefined, unblock: () => undefined }).size).toBe(0);
  });
});

describe("동적 해상도", () => {
  it("느리면 한 단계씩 내리고, 오래 여유로우면 장치 배율까지만 되돌린다", () => {
    const governor = new Office2dResolutionGovernor(2);
    expect(governor.pixelRatio).toBe(2);
    let changed: number | null = null;
    for (let index = 0; index < 70 && changed === null; index += 1) changed = governor.sample(1000 / 30);
    expect(changed).toBe(1.5);
    const fast = () => { let next: number | null = null; for (let index = 0; index < 130 && next === null; index += 1) next = governor.sample(1000 / 60); return next; };
    expect(fast()).toBeNull();
    expect(fast()).toBeNull();
    expect(fast()).toBe(2);
    expect(new Office2dResolutionGovernor(1).pixelRatio).toBe(OFFICE2D_PIXEL_RATIO_STEPS.at(-1));
    expect(governor.sample(5000)).toBeNull();
  });
});

describe("화면 클래스별 기본 배율", () => {
  it("큰 화면일수록 더 넓게 보되 캐릭터가 너무 작아지지 않는다", () => {
    const laptop = office2dBaseZoom({ width: 1280, height: 680 });
    const fullHd = office2dBaseZoom({ width: 1920, height: 1080 });
    expect(office2dVisibleWorldSpan({ width: 1920, height: 1080 }).span).toBeGreaterThan(office2dVisibleWorldSpan({ width: 1280, height: 680 }).span);
    expect(fullHd).toBeLessThan(1080 / (14 * 48));
    expect(OFFICE2D_ACTOR_HEIGHT * fullHd).toBeGreaterThan(90);
    expect(OFFICE2D_ACTOR_HEIGHT * laptop).toBeGreaterThan(70);
    const phone = office2dBaseZoom({ width: 390, height: 844 });
    const tablet = office2dBaseZoom({ width: 768, height: 1024 });
    expect(OFFICE2D_ACTOR_HEIGHT * phone).toBeGreaterThan(65);
    expect(tablet).toBeLessThan(768 / (8.5 * 48));
  });
});

function createFakeCanvas2d(): Office2dCanvas2D & { readonly texts: string[] } {
  const texts: string[] = [];
  const gradient = { addColorStop: () => undefined } as unknown as CanvasGradient;
  return {
    texts,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    imageSmoothingEnabled: true,
    lineJoin: "miter",
    lineCap: "butt",
    save: () => undefined,
    restore: () => undefined,
    translate: () => undefined,
    scale: () => undefined,
    rotate: () => undefined,
    setTransform: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    quadraticCurveTo: () => undefined,
    arc: () => undefined,
    ellipse: () => undefined,
    rect: () => undefined,
    clip: () => undefined,
    setLineDash: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    fillRect: () => undefined,
    strokeRect: () => undefined,
    clearRect: () => undefined,
    fillText: (text: string) => { texts.push(text); },
    measureText: (text: string) => ({ width: text.length * 7 } as TextMetrics),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    drawImage: () => undefined,
  };
}

describe("스테이지 확장·배경 이펙트·상호작용 고도화", () => {
  const manifest = studioVirtualToonHqManifest(false);
  const scene = office2dSceneFor(manifest);

  it("원거리 경로 이동은 320px 바깥에서 최대 1.45배까지 가속하고 도착 근처에서 감속한다", () => {
    expect(office2dPathSpeedMultiplier(180, false)).toBe(1);
    expect(office2dPathSpeedMultiplier(640, false)).toBeCloseTo(1.225);
    expect(office2dPathSpeedMultiplier(1400, false)).toBeCloseTo(1.45);
    expect(office2dPathSpeedMultiplier(1400, true)).toBe(1);
  });

  it("공간 테마(spaceTheme)와 주야 사이클에 맞춰 배경 톤과 일광을 계산한다", () => {
    expect(office2dOutsideColor(undefined)).toBe("#2b2420");
    expect(office2dOutsideColor("sakura-campus")).toMatch(/^#/u);
    expect(office2dDaylight({ enabled: true, startMs: 0, now: 12 * 3_600_000, cycleMs: 24 * 3_600_000 }, 0)).toBeCloseTo(1);
    expect(office2dDaylight({ enabled: true, startMs: 0, now: 2 * 3_600_000, cycleMs: 24 * 3_600_000 }, 0)).toBeCloseTo(0.3);
  });

  it("가구 상호작용 시 상태 전이·파티클·타일 이펙트·손 흔들기·투어를 처리한다", () => {
    const ext = new Office2dStageExtensions();
    const particles = new Office2dParticles();
    const onStateChange = vi.fn();
    ext.interactWithObject("hq-break-coffee", "coffee-machine", 200, 300, 1000, particles, onStateChange);
    expect(onStateChange).toHaveBeenCalledWith({
      objectId: "hq-break-coffee",
      stateKey: "coffee:brewing",
      stateChangedAt: 1000,
    });
    expect(particles.count).toBeGreaterThan(0);

    const onTileTrigger = vi.fn();
    const tileEffects = [{
      id: "fx-1",
      name: "Story Portal",
      kind: "portal" as const,
      tileX: 2,
      tileY: 3,
      width: 2,
      height: 2,
      destinationRoom: "hq-story-room",
      destinationTileX: 4,
      destinationTileY: 5,
    }];
    ext.stepTileEffects({ x: 2.5 * 16, y: 3.5 * 16 }, tileEffects, particles, onTileTrigger);
    expect(onTileTrigger).toHaveBeenCalledOnce();
    ext.stepTileEffects({ x: 2.5 * 16, y: 3.5 * 16 }, tileEffects, particles, onTileTrigger);
    expect(onTileTrigger).toHaveBeenCalledOnce();

    const self = actor("local");
    const peers = new Map([["peer-1", actor("peer-1")]]);
    const showEmote = vi.fn();
    ext.syncWaveActors(["local", "peer-1"], self, peers, 2000, showEmote);
    expect(showEmote).toHaveBeenCalledTimes(2);

    const onTourChange = vi.fn();
    const approach = vi.fn();
    ext.stepGuideTour({ x: 400, y: 400 }, manifest, { id: "tour-1", guideId: "npc-pd" }, onTourChange, false, 3000, approach);
    expect(approach).toHaveBeenCalledOnce();
    expect(onTourChange).toHaveBeenCalledWith(expect.objectContaining({ status: "walking", stopIndex: 0 }));
  });

  it("바닥 건축 디테일·라이브 벽 소품·오브젝트 배지·작업 포드 오라를 그린다", () => {
    const ctx = createFakeCanvas2d();
    paintOffice2dFloorDetails(ctx, scene, 0, 0, scene.width, "ko");
    expect(ctx.texts.some((text) => text.includes("회의·보안") || text.includes("정숙·몰입") || text.includes("STEP"))).toBe(true);

    const states = new Map([["hq-break-coffee", { stateKey: "coffee:brewing", changedAt: 1000 }]]);
    const detailFrame = {
      time: 1.5,
      now: 2000,
      selfId: "self",
      language: "ko" as const,
      reducedMotion: false,
      daylight: 0.9,
      atmosphere: "rain",
      activeObjectStates: states,
    };
    for (const wall of scene.walls) {
      if (!wall.decor) continue;
      for (const decor of wall.decor) {
        paintOffice2dWallDecorLive(ctx, decor, decor.x, wall.y + wall.height * 0.45, decor.width, 40, detailFrame);
      }
    }

    const focusSeatId = scene.seats.find((seat) => seat.id.includes("focus"))?.id ?? "hq-focus-booth-1-seat";
    const occupiedSeats = new Set([focusSeatId]);
    for (const obj of scene.objects) {
      paintOffice2dObjectLiveOverlay(ctx, obj, 72, detailFrame, occupiedSeats);
    }
    expect(ctx.texts.some((text) => text.includes("커피 추출 중") || text.includes("ON AIR"))).toBe(true);

    const self = createOffice2dActor({ id: "self", kind: "self", character: "artist", accent: "#fff", name: "작가", x: 10, y: 20, now: 0 });
    self.seat = backSeat;
    paintOffice2dActorSpatialAura(ctx, self, detailFrame, [self]);
    expect(ctx.texts.some((text) => text.includes("내 작업 포드"))).toBe(true);
  });

  it("구역별 배경 아트·오클루전·24px 전방 하이라이트·코믹 효과음·평면도·워크스테이션 매핑을 제공한다", () => {
    expect(Object.keys(OFFICE2D_ROOM_ART_SPECS).length).toBeGreaterThanOrEqual(12);
    expect(resolveOffice2dWorkstation("hq-story-room", "story-board").id).toBe("nb-cowork-tarot-pavilion");
    expect(resolveOffice2dWorkstation("hq-color-lab", null).id).toBe("nb-studio-main-cintiq");
    expect(resolveOffice2dWorkstation("hq-bg3d-lab", null).id).toBe("nb-plaza-hologram-table");
    expect(resolveOffice2dWorkstation("hq-lettering-desk", null).id).toBe("nb-plaza-foley-booth");
    expect(resolveOffice2dWorkstation("hq-review-room", null).id).toBe("nb-plaza-cintiq-pod");

    const ctx = createFakeCanvas2d();
    paintOffice2dRoomFloorBackdrops(ctx, scene, 0, 0, scene.width, () => null);
    for (const wall of scene.walls) {
      paintOffice2dNorthWallArtMural(ctx, wall, () => null, 1.2, false);
    }
    paintOffice2dRoomAmbientEffects(ctx, scene, { minX: 0, minY: 0, maxX: scene.width, maxY: scene.height }, 2.4, false, () => null);

    const tallObj = scene.objects.find((obj) => Boolean(obj.footprint)) ?? scene.objects[0]!;
    const behindActor = createOffice2dActor({
      id: "behind",
      kind: "self",
      character: "artist",
      accent: "#fff",
      name: "작가",
      x: tallObj.x,
      y: tallObj.y - 16,
      now: 0,
    });
    expect(computeOffice2dObjectOcclusion(tallObj, 96, [behindActor]).alpha).toBe(0.44);

    const interactiveObj = scene.objects.find((obj) => Boolean(obj.interactionId))!;
    const facingActor = createOffice2dActor({
      id: "facing",
      kind: "self",
      character: "artist",
      accent: "#fff",
      name: "작가",
      x: interactiveObj.x,
      y: interactiveObj.y + 20,
      now: 0,
    });
    facingActor.facing = "up";
    expect(findOffice2dActionableObjectAhead([interactiveObj], facingActor)?.id).toBe(interactiveObj.id);

    paintOffice2dDoorwayAndSeatPreview(ctx, scene, facingActor, new Set(), 1.5, "ko");
    const fakeCamera = {
      worldToScreen: (pt: { readonly x: number; readonly y: number }) => pt,
    } as Parameters<typeof paintOffice2dComicBursts>[1];
    const bursts = [{ id: 1, text: "집중!", color: "#38bdf8", x: 300, y: 300, createdAt: 1000, durationMs: 1200 }];
    paintOffice2dComicBursts(ctx, fakeCamera, bursts, 1250, false);
    expect(ctx.texts.includes("집중!")).toBe(true);

    paintOffice2dSchematicOverlay(ctx, scene, [facingActor], "facing", "ko");
    expect(ctx.texts.some((text) => text.includes("STEP 01") || text.includes("상주"))).toBe(true);
  });

  it.each(["hq-reference-library", "hq-review-room"])("%s는 X좌표가 같은 북쪽·남쪽 출입구도 각각 안내한다", (roomId) => {
    const room = TOON_HQ_ROOMS.find((candidate) => candidate.id === roomId);
    if (!room) throw new Error(`테스트 구역이 없습니다: ${roomId}`);
    for (const side of ["north", "south"] as const) {
      const doorX = room.doors[side];
      if (doorX === undefined) throw new Error(`테스트 출입구가 없습니다: ${roomId}/${side}`);
      const doorY = side === "north" ? room.y : room.y + room.height;
      const ctx = createFakeCanvas2d();
      const fillText = vi.spyOn(ctx, "fillText");
      const walker = createOffice2dActor({ id: "self", kind: "self", character: "artist", accent: "#fff", name: "작가", x: doorX, y: doorY + 8, now: 0 });
      paintOffice2dDoorwayAndSeatPreview(ctx, scene, walker, new Set(), 1, "ko");
      const doorwayLabels = fillText.mock.calls.filter(([text, x, y]) =>
        (text.includes("노크") || text.includes("정숙 구역")) && x === doorX && y === doorY - 17,
      );
      expect(doorwayLabels).toEqual([[
        room.privacy === "private" ? "🔔 노크 · 회의실 입장" : "🔇 정숙 구역 · 자동 음소거",
        doorX,
        doorY - 17,
      ]]);
    }
  });

  it("내 지정석을 저장·복원하고 평면도와 착석 안내에 ★ 비콘을 그린다", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    });
    try {
      expect(readOffice2dClaimedSeatId()).toBe(OFFICE2D_DEFAULT_CLAIMED_SEAT_ID);
      const seat = scene.seats[3]!;
      expect(writeOffice2dClaimedSeatId(`  ${seat.id}  `)).toBe(seat.id);
      expect(readOffice2dClaimedSeatId()).toBe(seat.id);
      expect(writeOffice2dClaimedSeatId("   ")).toBe(OFFICE2D_DEFAULT_CLAIMED_SEAT_ID);
      expect(readOffice2dSoundMuted()).toBe(false);
      writeOffice2dSoundMuted(true);
      expect(readOffice2dSoundMuted()).toBe(true);

      const ctx = createFakeCanvas2d();
      const walker = createOffice2dActor({ id: "self", kind: "self", character: "artist", accent: "#fff", name: "작가", x: seat.anchor.x + 300, y: seat.anchor.y, now: 0 });
      paintOffice2dDoorwayAndSeatPreview(ctx, scene, walker, new Set(), 1, "ko", seat.id);
      expect(ctx.texts).toContain("★ 내 지정석");
      paintOffice2dDoorwayAndSeatPreview(ctx, scene, walker, new Set(), 1, "en", "missing-seat");
      expect(ctx.texts).not.toContain("★ MY DESK");
      paintOffice2dSchematicOverlay(ctx, scene, [walker], "self", "ko", seat.id);
      expect(ctx.texts.some((text) => text.includes("클릭 이동"))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("평면도 클릭은 좌석 28px 안이면 좌석, 아니면 방 스폰, 바깥이면 null로 바꾼다", () => {
    const seat = scene.seats[0]!;
    const seatHit = resolveOffice2dSchematicClickTarget(scene, { x: seat.anchor.x + 10, y: seat.anchor.y - 8 });
    expect(seatHit).toMatchObject({ kind: "seat", seatId: seat.id, point: seat.anchor });
    expect(seatHit?.roomId).toBeTruthy();

    const lobby = TOON_HQ_ROOMS.find((room) => room.id === "hq-lobby")!;
    let freePoint: { x: number; y: number } | null = null;
    for (let gx = lobby.x + 8; gx < lobby.x + lobby.width && !freePoint; gx += 16) {
      for (let gy = lobby.y + 8; gy < lobby.y + lobby.height && !freePoint; gy += 16) {
        if (scene.seats.every((candidate) => Math.hypot(candidate.anchor.x - gx, candidate.anchor.y - gy) > 28)) freePoint = { x: gx, y: gy };
      }
    }
    expect(freePoint).not.toBeNull();
    expect(resolveOffice2dSchematicClickTarget(scene, freePoint!)).toEqual({ kind: "room", roomId: "hq-lobby", point: lobby.spawn });
    expect(resolveOffice2dSchematicClickTarget(scene, { x: -500, y: -500 })).toBeNull();
    expect(resolveOffice2dSchematicClickTarget(scene, { x: Number.NaN, y: 10 })).toBeNull();
  });

  it("1~6 숫자키 이모트 의성어와 음소거·서버 환경에서 소리를 내지 않는 공간 큐", () => {
    expect(OFFICE2D_QUICK_EMOTES.map((item) => item.digit)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(findOffice2dQuickEmote("Digit4")?.glyph).toBe("💡");
    expect(findOffice2dQuickEmote("6")?.glyph).toBe("☕");
    expect(findOffice2dQuickEmote("Digit7")).toBeNull();
    expect(findOffice2dQuickEmote("KeyH")).toBeNull();
    expect(playOffice2dSpatialCue("emote", { muted: true })).toBe(false);
    expect(playOffice2dSpatialCue("emote")).toBe(false);
  });

  it("공간 큐는 방 화음으로 울리고 음성 대화 중에는 볼륨을 1/4로 낮춘다(WA ducking)", () => {
    const gains: number[] = [];
    const freqs: number[] = [];
    class FakeAudioContext {
      readonly currentTime = 0;
      readonly destination = {};
      createOscillator() {
        return {
          type: "sine",
          frequency: { setValueAtTime: (value: number) => void freqs.push(value), exponentialRampToValueAtTime: () => undefined },
          connect: () => undefined,
          start: () => undefined,
          stop: () => undefined,
        };
      }
      createGain() {
        return { gain: { setValueAtTime: (value: number) => void gains.push(value), exponentialRampToValueAtTime: () => undefined }, connect: () => undefined };
      }
      close() {
        return Promise.resolve();
      }
    }
    // 이 파일은 node 환경에서 돌아 window가 없으므로 AudioContext만 가진 최소 window를 심는다.
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    vi.useFakeTimers();
    try {
      expect(playOffice2dSpatialCue("room-enter", { roomId: "hq-color-lab" })).toBe(true);
      expect(playOffice2dSpatialCue("room-enter", { roomId: "hq-color-lab", talking: true })).toBe(true);
      expect(freqs[0]).toBeCloseTo(659.25);
      expect(gains[1]! / gains[0]!).toBeCloseTo(0.25);
      const release = acquireStudioHuddleAudioFocus();
      try {
        expect(playOffice2dSpatialCue("room-enter", { roomId: "hq-color-lab" })).toBe(true);
        expect(gains[2]! / gains[0]!).toBeCloseTo(0.25);
      } finally { release(); }
      expect(playOffice2dSpatialCue("room-enter", { roomId: "hq-color-lab" })).toBe(true);
      expect(gains[3]).toBeCloseTo(gains[0]!);
      vi.runAllTimers();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("생체역학 보행(방향 전환 쿠션·착석 안착·발걸음 접지·전력 질주 잔상·눈 깜빡임)과 12종 파티클·다이내믹 SVG를 계산한다", () => {
    const runner = createOffice2dActor({ id: "runner", kind: "self", character: "artist", accent: "#38bdf8", name: "작가", x: 100, y: 100, facing: "right", now: 0 });
    // 반대 방향 급전환 시 turnTransition 발동 및 발걸음 반주기(34px) 돌파 시 footstepTriggered 감지
    advanceOffice2dActor(runner, 64, 100, 0.05);
    expect(runner.facing).toBe("left");
    expect(runner.turnTransition).toBe(1);
    expect(runner.footstepTriggered).toBe(true);
    expect(runner.afterimages.length).toBeGreaterThanOrEqual(1);

    // 착석 전환 시 poseTransition 발동 및 탄성 보브 반영
    runner.seat = backSeat;
    advanceOffice2dActor(runner, 64, 100, 0.016);
    expect(runner.poseTransition).toBe(1);
    const seatedBob = office2dActorBob(runner, 1.2, false);
    expect(seatedBob.scaleY).toBeLessThanOrEqual(1.08);

    // 눈 깜빡임(뒷모습은 0, 정면/측면은 깜빡임 주기 내 양수)
    runner.seat = null;
    runner.facing = "up";
    expect(office2dActorBlink(runner, 0.05, false)).toBe(0);
    runner.facing = "down";
    let sawBlink = false;
    for (let t = 0; t < 6; t += 0.04) {
      if (office2dActorBlink(runner, t, false) > 0.5) sawBlink = true;
    }
    expect(sawBlink).toBe(true);

    // 12종 파티클 및 5종 멀티 레이어 콤보 버스트 렌더링 검증
    const particles = new Office2dParticles(42);
    for (const preset of ["interaction", "sprint", "emote", "seat", "awakening"] as const) {
      particles.emitComboBurst(preset, 200, 200, 1);
    }
    expect(particles.count).toBeGreaterThan(30);
    particles.update(0.05);
    const ctx = createFakeCanvas2d();
    particles.draw(ctx);

    // 다이내믹 크리에이터 스프라이트 10종 표정·8종 VFX·8인 페르소나 SVG 생성 검증
    for (const expr of DYNAMIC_SPRITE_EXPRESSIONS) {
      const svg = renderDynamicCreatorSpriteSvg({
        personaId: "line-artist",
        actionId: "tablet-combo-draw",
        expressionId: expr.id,
        vfxId: "crimson-ink-slash",
        frameIndex: 1,
      });
      expect(svg).toContain(`data-expression="${expr.id}"`);
    }
    for (const vfx of DYNAMIC_SPRITE_VFX_PRESETS) {
      const svg = renderDynamicCreatorSpriteSvg({
        personaId: "colorist",
        actionId: "awakening-skill-burst",
        expressionId: "sparkle-star",
        vfxId: vfx.id,
        frameIndex: 2,
      });
      expect(svg).toContain(`data-vfx="${vfx.id}"`);
    }
    for (const persona of DYNAMIC_CREATOR_SPRITE_CAST) {
      const svg = renderDynamicCreatorSpriteSvg({
        personaId: persona.personaId,
        actionId: persona.defaultActionId,
        expressionId: persona.defaultExpressionId,
        vfxId: persona.defaultVfxId,
        frameIndex: 0,
      });
      expect(svg).toContain(`data-persona="${persona.personaId}"`);
    }
  });
});
