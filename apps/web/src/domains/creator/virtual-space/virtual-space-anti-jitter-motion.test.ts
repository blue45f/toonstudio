import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_DANCE_MOTION_IDS,
  STUDIO_GYMNASTICS_MOTION_IDS,
  STUDIO_RICH_MOTION_IDS,
  STUDIO_RICH_MOTION_PROFILES,
  createMotionStateMachine,
  requestMotionState,
  resolveStudioRichMotionId,
  sampleMotionRender,
  sampleStudioRichMotion,
  type StudioRichMotionId,
} from "./studio-virtual-space-character-motion";
import {
  STUDIO_DISPLAY_MAX_DELTA_SECONDS,
  STUDIO_DISPLAY_STOP_EPSILON_PX,
  createStudioFacingHysteresis,
  dampStudioDisplayPoint,
  stepCriticallyDampedPoint,
  stepCriticallyDampedScalar,
  stepStudioFacingHysteresis,
  type StudioCriticallyDampedPointState,
} from "./studio-virtual-space-sprite-smoothing";
import {
  STUDIO_PEER_MAX_FOLLOW_SPEED,
  STUDIO_PEER_STALE_GRACE_MS,
  createStudioPeerAntiJitterState,
  stepStudioPeerAntiJitter,
} from "./studio-virtual-space-peer-motion";
import { StudioSpriteCrossfadeRuntime } from "./studio-virtual-space-sprite-crossfade-runtime";
import {
  StudioMotionFeelRuntime,
  createStudioMotionFeelFrame,
} from "./studio-virtual-space-motion-feel-runtime";
import { createOffice2dActor } from "./office2d/office2d-actors";
import {
  Office2dActorSmoothingCache,
  applyOffice2dActorEmote,
  office2dEmoteBurstLabel,
  resolveOffice2dEmoteTransform,
} from "./office2d/office2d-emote-motion";
import {
  applyStudioThreeActorPose,
  triggerStudioThreeActorEmote,
  updateStudioThreeActorLookAt,
} from "./three/studio-virtual-space-three-motion";
import { applyNaturalVrmPosture, createStylized3DCharacterNode } from "./three/studio-virtual-space-three-scene";

const REQUIRED_CORE_12_MOTIONS: readonly StudioRichMotionId[] = [
  "idle-breathe",
  "walk-natural",
  "jog-brisk",
  "sprint-dash",
  "tiptoe-sneak",
  "hop-skip",
  "sit-draw",
  "stretch-break",
  "celebrate-spin",
  "wave-greet",
  "focus-typing",
  "dramatic-entrance",
];

const REQUIRED_GYMNASTICS_3: readonly StudioRichMotionId[] = [
  "neck-shoulder-stretch",
  "wrist-roll-break",
  "standing-gymnastics",
];

const REQUIRED_DANCE_3: readonly StudioRichMotionId[] = [
  "groove-dance",
  "deadline-victory-dance",
  "sync-group-dance",
];

function createFullVrmFixture() {
  const setValue = vi.fn();
  const update = vi.fn();
  const bones = {
    hips: new THREE.Object3D(),
    spine: new THREE.Object3D(),
    chest: new THREE.Object3D(),
    neck: new THREE.Object3D(),
    head: new THREE.Object3D(),
    leftUpperArm: new THREE.Object3D(),
    rightUpperArm: new THREE.Object3D(),
    leftLowerArm: new THREE.Object3D(),
    rightLowerArm: new THREE.Object3D(),
    leftUpperLeg: new THREE.Object3D(),
    rightUpperLeg: new THREE.Object3D(),
    leftLowerLeg: new THREE.Object3D(),
    rightLowerLeg: new THREE.Object3D(),
  };
  const vrm = {
    humanoid: {
      getNormalizedBoneNode: vi.fn((name: keyof typeof bones) => bones[name] ?? null),
      update: vi.fn(),
    },
    expressionManager: {
      setValue,
      getExpression: vi.fn(() => ({ name: "mock" })),
    },
    update,
  } as unknown as VRM;
  const node = createStylized3DCharacterNode("actor-test", 0x4f46e5, true);
  const sceneGroup = new THREE.Group();
  for (const bone of Object.values(bones)) sceneGroup.add(bone);
  applyNaturalVrmPosture(node, sceneGroup, vrm);
  return { node, bones, setValue, update };
}

describe("Anti-Jitter 수학 증명 — 방향 뒤집힘(Flip) 채터링 0회", () => {
  it("120프레임 연속 대각선 이동(+±15% 속도 노이즈)에서 facing 채터링이 정확히 0회다", () => {
    let state = createStudioFacingHysteresis("right", 0);
    let flips = 0;
    for (let frame = 1; frame <= 120; frame += 1) {
      const nowMs = frame * 16.67;
      // 대각선 경계(|vx| ≈ |vy|)에서 매 프레임 진동하는 노이즈 주입
      const noise = Math.sin(frame * 1.9) * 14;
      const vx = 110 + noise;
      const vy = 110 - noise;
      const next = stepStudioFacingHysteresis(state, vx, vy, nowMs);
      if (next.facing !== state.facing) flips += 1;
      state = next;
    }
    expect(flips).toBe(0);
    expect(state.facing).toBe("right");
  });

  it("정지·미세 속도 노이즈 구간(|v| < 데드존)에서 좌↔우 깜빡임이 0회이고, 의도적 고속 급반전에는 즉시 반응한다", () => {
    let state = createStudioFacingHysteresis("left", 0);
    let flips = 0;
    for (let frame = 1; frame <= 120; frame += 1) {
      const vx = frame % 2 === 0 ? 5.5 : -5.5;
      const vy = frame % 3 === 0 ? 4.2 : -4.2;
      const next = stepStudioFacingHysteresis(state, vx, vy, frame * 16);
      if (next.facing !== state.facing) flips += 1;
      state = next;
    }
    expect(flips).toBe(0);

    // 의도적인 고속 180도 급반전(left → right, 160px/s)은 최소 글리치 창(24ms) 이후 즉시 반영된다.
    const reversed = stepStudioFacingHysteresis(state, 160, 0, 2_000);
    expect(reversed.facing).toBe("right");
  });

  it("Office2dActorSmoothingCache가 120프레임 대각선 이동에서 방향 채터링 0회를 보장한다", () => {
    const cache = new Office2dActorSmoothingCache();
    const actor = createOffice2dActor({
      id: "self",
      kind: "self",
      character: "artist",
      accent: "oklch(0.62 0.19 265)",
      name: "작가",
      x: 100,
      y: 100,
      facing: "right",
      now: 0,
    });
    actor.moving = true;
    // 초기 프레임(t=0)에서 기준 상태("right")를 캐시에 등록한 뒤 120프레임 대각선 이동 검증
    cache.beginFrame(0, 0, false);
    let prevFacing = cache.resolveActor(actor, true).facing;
    cache.endFrame();
    let flips = 0;
    for (let frame = 1; frame <= 120; frame += 1) {
      const t = frame / 60;
      const noise = Math.cos(frame * 2.1) * 12;
      actor.vx = 105 + noise;
      actor.vy = 105 - noise;
      actor.x += actor.vx / 60;
      actor.y += actor.vy / 60;
      actor.facing = actor.vx >= actor.vy ? "right" : "down";
      cache.beginFrame(t, frame * 16.67, false);
      const resolved = cache.resolveActor(actor, true);
      cache.endFrame();
      if (resolved.facing !== prevFacing) flips += 1;
      prevFacing = resolved.facing;
    }
    expect(flips).toBe(0);
  });
});

describe("Anti-Jitter 수학 증명 — 정지 구간 좌표 변동 0 & 가변 dt(8ms~120ms) 발산·진동 0회", () => {
  it("정지 직전 스냅 데드존으로 제자리 미세 진동(0.1px 떨림)을 0% 차단한다", () => {
    const target = { x: 240, y: 180 };
    let expPt = { x: 220, y: 165 };
    let springState: StudioCriticallyDampedPointState = { x: 220, y: 165, vx: 120, vy: 90 };

    // 수렴 구간 (60프레임)
    for (let i = 0; i < 60; i += 1) {
      expPt = dampStudioDisplayPoint(expPt, target, 1 / 60);
      springState = stepCriticallyDampedPoint(springState, target, 1 / 60);
    }

    // 정지 구간 60프레임 동안 좌표 변동이 정확히 0이어야 한다.
    const expXs: number[] = [];
    const expYs: number[] = [];
    const springXs: number[] = [];
    const springYs: number[] = [];
    for (let i = 0; i < 60; i += 1) {
      expPt = dampStudioDisplayPoint(expPt, target, 1 / 60);
      springState = stepCriticallyDampedPoint(springState, target, 1 / 60);
      expXs.push(expPt.x);
      expYs.push(expPt.y);
      springXs.push(springState.x);
      springYs.push(springState.y);
    }
    expect(Math.max(...expXs) - Math.min(...expXs)).toBe(0);
    expect(Math.max(...expYs) - Math.min(...expYs)).toBe(0);
    expect(expPt).toEqual(target);
    expect(Math.max(...springXs) - Math.min(...springXs)).toBe(0);
    expect(Math.max(...springYs) - Math.min(...springYs)).toBe(0);
    expect(springState).toEqual({ x: target.x, y: target.y, vx: 0, vy: 0 });
    expect(STUDIO_DISPLAY_STOP_EPSILON_PX).toBeLessThan(0.1);
  });

  it("dt 8ms~120ms 가변 프레임 스케줄에서 지수·임계감쇠·피어 보간·3D 포즈 모두 발산·오버슈트·진동이 0회다", () => {
    const dtSchedule = [0.008, 0.016, 0.033, 0.05, 0.08, 0.12, 0.008, 0.095, 0.12, 0.011, 0.042, 0.115];
    const target = { x: 80, y: -45 };

    let expPt = { x: 0, y: 0 };
    let scalar = { value: 0, velocity: 0 };
    let spring: StudioCriticallyDampedPointState = { x: 0, y: 0, vx: 0, vy: 0 };
    let peer = createStudioPeerAntiJitterState(0, 0, "right", 0);
    const { node, update } = createFullVrmFixture();

    let prevExpDist = Math.hypot(target.x, target.y);
    let prevScalarErr = Math.abs(target.x);
    let prevSpringDist = Math.hypot(target.x, target.y);
    let nowMs = 0;

    for (let i = 0; i < 120; i += 1) {
      const dt = dtSchedule[i % dtSchedule.length]!;
      nowMs += dt * 1_000;

      expPt = dampStudioDisplayPoint(expPt, target, dt);
      const expDist = Math.hypot(target.x - expPt.x, target.y - expPt.y);
      expect(Number.isFinite(expDist)).toBe(true);
      expect(expDist).toBeLessThanOrEqual(prevExpDist + 1e-9);
      expect(expPt.x).toBeLessThanOrEqual(target.x);
      expect(expPt.y).toBeGreaterThanOrEqual(target.y);
      prevExpDist = expDist;

      scalar = stepCriticallyDampedScalar(scalar, target.x, dt, { smoothTimeSeconds: 0.05 });
      const scalarErr = target.x - scalar.value;
      expect(Number.isFinite(scalar.value)).toBe(true);
      expect(scalarErr).toBeGreaterThanOrEqual(-1e-9);
      expect(scalarErr).toBeLessThanOrEqual(prevScalarErr + 1e-9);
      prevScalarErr = scalarErr;

      spring = stepCriticallyDampedPoint(spring, target, dt, { smoothTimeSeconds: 0.05, maxSpeed: 360 });
      const springDist = Math.hypot(target.x - spring.x, target.y - spring.y);
      expect(Number.isFinite(springDist)).toBe(true);
      expect(springDist).toBeLessThanOrEqual(prevSpringDist + 1e-9);
      prevSpringDist = springDist;

      peer = stepStudioPeerAntiJitter(peer, {
        targetX: target.x,
        targetY: target.y,
        targetFacing: "right",
        targetMoving: i < 20,
        snapshotTimestampMs: nowMs,
        nowMs,
        deltaSeconds: dt,
      });
      expect(Number.isFinite(peer.x) && Number.isFinite(peer.y)).toBe(true);
      expect(peer.x).toBeLessThanOrEqual(target.x + 1e-6);

      node.moving = i < 30;
      if (node.moving) node.group.position.x += 0.05;
      applyStudioThreeActorPose(node, nowMs, dt);
      expect(Number.isFinite(node.rigGroup.position.y)).toBe(true);
      expect(Math.abs(node.rigGroup.position.y)).toBeLessThan(0.5);
      // VRM spring bone 폭발을 막기 위해 dt > 100ms 스파이크가 클램프되어 전달된다.
      const lastDt = update.mock.calls.at(-1)?.[0] as number;
      expect(lastDt).toBeLessThanOrEqual(STUDIO_DISPLAY_MAX_DELTA_SECONDS);
    }

    expect(expPt).toEqual(target);
    expect(scalar).toEqual({ value: target.x, velocity: 0 });
    expect(spring).toEqual({ x: target.x, y: target.y, vx: 0, vy: 0 });
    expect(peer.x).toBe(target.x);
    expect(peer.y).toBe(target.y);
  });

  it("원격 피어 속도 제한 보간과 패킷 손실 시 부드러운 감속 정지를 수행한다", () => {
    let peer = createStudioPeerAntiJitterState(0, 0, "right", 0);
    // 1) 큰 지연 점프(180px, 텔레포트 임계 미만)에서도 프레임당 이동량이 속도 상한을 넘지 않는다.
    const dt = 1 / 60;
    peer = stepStudioPeerAntiJitter(peer, {
      targetX: 180,
      targetY: 0,
      targetFacing: "right",
      targetMoving: true,
      snapshotTimestampMs: 16,
      nowMs: 16,
      deltaSeconds: dt,
    });
    expect(peer.x).toBeLessThanOrEqual(STUDIO_PEER_MAX_FOLLOW_SPEED * dt + 1e-6);
    expect(peer.x).toBeGreaterThan(0);

    // 2) 정상 이동으로 속도를 올린 뒤 패킷 손실(snapshotTimestamp 고정) 발생 시 부드럽게 감속 정지한다.
    let nowMs = 16;
    for (let i = 1; i <= 10; i += 1) {
      nowMs += 16;
      peer = stepStudioPeerAntiJitter(peer, {
        targetX: 180 + i * 4,
        targetY: 0,
        targetFacing: "right",
        targetMoving: true,
        snapshotTimestampMs: nowMs,
        nowMs,
        deltaSeconds: dt,
      });
    }
    const frozenSnapshotAt = nowMs;
    const frozenTargetX = peer.lastTargetX;
    let sawDecelerating = false;
    let prevSpeed = Math.hypot(peer.vx, peer.vy);
    for (let i = 0; i < 60; i += 1) {
      nowMs += 16;
      peer = stepStudioPeerAntiJitter(peer, {
        targetX: frozenTargetX,
        targetY: 0,
        targetFacing: "right",
        targetMoving: true,
        snapshotTimestampMs: frozenSnapshotAt,
        nowMs,
        deltaSeconds: dt,
      });
      if (nowMs - frozenSnapshotAt > STUDIO_PEER_STALE_GRACE_MS) {
        const curSpeed = Math.hypot(peer.vx, peer.vy);
        if (peer.decelerating) sawDecelerating = true;
        expect(curSpeed).toBeLessThanOrEqual(prevSpeed + 1e-6);
        prevSpeed = curSpeed;
      }
    }
    expect(sawDecelerating).toBe(true);
    expect(peer.moving).toBe(false);
    expect(peer.vx).toBe(0);
  });

  it("크로스페이드 런타임이 방향 전환 시 이전 포즈 flip을 보존하고 보행 위상을 유지한다", () => {
    let fadeFlipX: boolean | null = null;
    let fadeVisible = false;
    let fadeAlpha = 0;
    const fadeSprite = {
      active: true,
      setTexture: () => fadeSprite,
      setOrigin: () => fadeSprite,
      setDisplaySize: () => fadeSprite,
      setPosition: () => fadeSprite,
      setAngle: () => fadeSprite,
      setFlip: (fx: boolean) => { fadeFlipX = fx; return fadeSprite; },
      setDepth: () => fadeSprite,
      setVisible: (v: boolean) => { fadeVisible = v; return fadeSprite; },
      setAlpha: (a: number) => { fadeAlpha = a; return fadeSprite; },
      setTint: () => fadeSprite,
      clearTint: () => fadeSprite,
      destroy: () => undefined,
    };
    const runtime = new StudioSpriteCrossfadeRuntime({
      add: { sprite: () => fadeSprite },
    } as unknown as ConstructorParameters<typeof StudioSpriteCrossfadeRuntime>[0]);

    let animProgress = 0.52;
    const setProgress = vi.fn((value: number) => { animProgress = value; });
    const owner = {
      active: true,
      visible: true,
      alpha: 1,
      isTinted: false,
      x: 100,
      y: 200,
      angle: 0,
      depth: 100,
      originX: 0.5,
      originY: 0.9,
      displayWidth: 48,
      displayHeight: 64,
      flipX: false,
      flipY: false,
      texture: { key: "walk-left" },
      frame: { name: "2" },
      anims: {
        isPlaying: true,
        currentAnim: { key: "walk-left" },
        getProgress: () => animProgress,
        setProgress,
      },
      getData: (k: string) => (k === "visualMotionState" ? "walk" : ""),
    };

    runtime.capture(owner as never);
    // 방향 전환: flipX가 true로 바뀌고 새 클립이 프레임 0으로 리셋된 상황
    owner.texture = { key: "walk-right" };
    owner.anims.currentAnim = { key: "walk-right" };
    owner.flipX = true;
    animProgress = 0.0;
    runtime.commit(owner as never, 1_000, true);
    // 프레임 0 리셋 대신 이전 보행 위상(0.52)을 이어받는다.
    expect(setProgress).toHaveBeenCalledWith(0.52);

    // step() 호출 후에도 페이드 아웃 중인 이전 스프라이트는 새 flipX(true)로 뒤집히지 않고 false를 유지한다.
    runtime.step(1_050);
    expect(fadeVisible).toBe(true);
    expect(fadeAlpha).toBeGreaterThan(0);
    expect(fadeFlipX).toBe(false);
    runtime.destroy();
  });

  it("모션 상태머신 전이(idle→sit/lie)에서 1프레임 스냅 없이 중간 블렌딩 포즈를 보간한다", () => {
    const sitMachine = requestMotionState(createMotionStateMachine("idle", 0), "sit", 1_000);
    const sitMid = sampleMotionRender(sitMachine, 1_125);
    expect(sitMid.scaleY).toBeGreaterThan(0.82);
    expect(sitMid.scaleY).toBeLessThan(1);

    const lieMachine = requestMotionState(createMotionStateMachine("idle", 0), "lie", 1_000);
    const lieMid = sampleMotionRender(lieMachine, 1_200);
    expect(lieMid.rotationDeg).toBeLessThan(0);
    expect(lieMid.rotationDeg).toBeGreaterThan(-72);
  });

  it("MotionFeelRuntime이 정지 미세 떨림(0.06px)에서는 유령 발걸음/먼지를 발생시키지 않는다", () => {
    const bursts: number[] = [];
    const emitter = {
      setDepth: () => emitter,
      setParticleTint: () => emitter,
      explode: (count: number) => bursts.push(count),
      destroy: () => undefined,
    };
    const sprite = {
      visible: false,
      setVisible: () => sprite,
      setTint: () => sprite,
      destroy: () => undefined,
    };
    const runtime = new StudioMotionFeelRuntime({
      textures: { exists: () => true },
      make: { graphics: () => ({ fillStyle: () => ({}), fillCircle: () => ({}), generateTexture: () => undefined, destroy: () => undefined }) },
      add: { particles: () => emitter, sprite: () => sprite },
    } as never);
    const frame = createStudioMotionFeelFrame();
    Object.assign(frame, { deltaSeconds: 1 / 60, speed: 12, inputSpeed: 0, particleDensity: 1, reducedMotion: false });
    for (let i = 0; i < 40; i += 1) {
      Object.assign(frame, { time: i * 16, x: 100 + (i % 2 === 0 ? 0.04 : -0.04), y: 200 });
      runtime.step(frame, null);
    }
    expect(bursts).toEqual([]);
    runtime.destroy();
  });
});

describe("18종 자연 모션 레퍼토리 (기본 12종 + 작가 건강 체조 3종 + 신나는 댄스 3종) & reducedMotion 안전성", () => {
  it("필수 18종 모션 프로파일이 모두 등록되어 있고 이모트 별칭과 매핑된다", () => {
    expect(STUDIO_RICH_MOTION_IDS).toHaveLength(18);
    expect(STUDIO_GYMNASTICS_MOTION_IDS).toEqual(REQUIRED_GYMNASTICS_3);
    expect(STUDIO_DANCE_MOTION_IDS).toEqual(REQUIRED_DANCE_3);

    for (const id of [...REQUIRED_CORE_12_MOTIONS, ...REQUIRED_GYMNASTICS_3, ...REQUIRED_DANCE_3]) {
      expect(STUDIO_RICH_MOTION_IDS).toContain(id);
      const profile = STUDIO_RICH_MOTION_PROFILES[id];
      expect(profile.labelKo.length, id).toBeGreaterThan(0);
      expect(profile.labelEn.length, id).toBeGreaterThan(0);
      expect(profile.glyph.length, id).toBeGreaterThan(0);
    }
    expect(resolveStudioRichMotionId("neck-stretch")).toBe("neck-shoulder-stretch");
    expect(resolveStudioRichMotionId("calisthenics")).toBe("standing-gymnastics");
    expect(resolveStudioRichMotionId("kpop-dance")).toBe("sync-group-dance");
    expect(resolveStudioRichMotionId("cheers")).toBe("deadline-victory-dance");
  });

  it("18종 모든 모션이 부드러운 유한 포즈를 생성하고, 보행 계열은 정지 시 0으로 램프아웃하며, reducedMotion에서 진동 0을 보장한다", () => {
    for (const id of STUDIO_RICH_MOTION_IDS) {
      const active = sampleStudioRichMotion(id, { elapsedMs: 650, nowMs: 1_650, speedRatio: 1, reducedMotion: false });
      expect(Number.isFinite(active.offsetX) && Number.isFinite(active.offsetY), id).toBe(true);
      expect(Math.abs(active.offsetX), id).toBeLessThanOrEqual(8);
      expect(Math.abs(active.tiltRad), id).toBeLessThanOrEqual(STUDIO_RICH_MOTION_PROFILES[id].maxTiltRad + 1e-6);
      expect(active.scaleX, id).toBeGreaterThanOrEqual(0.9);
      expect(active.scaleX, id).toBeLessThanOrEqual(1.1);

      const reduced = sampleStudioRichMotion(id, { elapsedMs: 650, nowMs: 1_650, speedRatio: 1, reducedMotion: true });
      expect(reduced.offsetX, id).toBe(0);
      expect(reduced.offsetY, id).toBe(0);
      expect(reduced.tiltRad, id).toBe(0);
      expect(reduced.yawRad, id).toBe(0);
      expect(reduced.armSwingRad, id).toBe(0);
      expect(reduced.legSwingRad, id).toBe(0);
      expect(reduced.intensity, id).toBe(0);
    }

    // 보행 계열은 속도가 0으로 줄어들 때 바운스·기울기가 부드럽게 0으로 착지한다.
    for (const loco of ["walk-natural", "jog-brisk", "sprint-dash", "tiptoe-sneak", "hop-skip"] as const) {
      const stopped = sampleStudioRichMotion(loco, { elapsedMs: 500, speedRatio: 0, stridePhase: 1.2 });
      expect(stopped.offsetY, loco).toBe(0);
      expect(stopped.tiltRad, loco).toBe(0);
      const moving = sampleStudioRichMotion(loco, { elapsedMs: 500, speedRatio: 1, stridePhase: 1.2 });
      expect(Math.abs(moving.offsetY) + Math.abs(moving.tiltRad), loco).toBeGreaterThan(0);
    }
  });

  it("팀 동기화 댄스(sync-group-dance)는 서로 다른 시작 시각의 동료들이 동일 박자 위상으로 동기화된다", () => {
    const nowMs = 3_400;
    const peerA = sampleStudioRichMotion("sync-group-dance", { elapsedMs: nowMs - 1_000, nowMs, durationMs: 4_000 });
    const peerB = sampleStudioRichMotion("sync-group-dance", { elapsedMs: nowMs - 1_550, nowMs, durationMs: 4_000 });
    expect(peerA.offsetX).toBeCloseTo(peerB.offsetX, 6);
    expect(peerA.offsetY).toBeCloseTo(peerB.offsetY, 6);
    expect(peerA.tiltRad).toBeCloseTo(peerB.tiltRad, 6);
    expect(peerA.yawRad).toBeCloseTo(peerB.yawRad, 6);
  });

  it("작가 건강 체조 3종 + 신나는 댄스 3종이 Office2d 및 Three.js 3D 렌더러에서 흔들림 없이 동작하고 reducedMotion을 준수한다", () => {
    const actor = createOffice2dActor({
      id: "artist-1",
      kind: "self",
      character: "artist",
      accent: "oklch(0.62 0.19 265)",
      name: "작가",
      x: 200,
      y: 200,
      now: 1_000,
    });
    const { node, bones, setValue } = createFullVrmFixture();

    for (const id of [...REQUIRED_GYMNASTICS_3, ...REQUIRED_DANCE_3]) {
      const applied = applyOffice2dActorEmote(actor, id, 1_000);
      expect(applied, id).not.toBeNull();
      expect(office2dEmoteBurstLabel(id, "ko"), id).toContain(STUDIO_RICH_MOTION_PROFILES[id].labelKo);

      const tx = resolveOffice2dEmoteTransform(actor, 1_650, false);
      expect(Math.abs(tx.offsetX) + Math.abs(tx.offsetY) + Math.abs(tx.tiltRad), `2d:${id}`).toBeGreaterThan(0);
      const txReduced = resolveOffice2dEmoteTransform(actor, 1_650, true);
      expect(txReduced.offsetX, `2d-reduced:${id}`).toBe(0);
      expect(txReduced.offsetY, `2d-reduced:${id}`).toBe(0);
      expect(txReduced.tiltRad, `2d-reduced:${id}`).toBe(0);

      triggerStudioThreeActorEmote(node, id, 1_000, 3_600);
      applyStudioThreeActorPose(node, 1_650, 0.016, { reducedMotion: false });
      const activeMovement =
        Math.abs(node.rigGroup.position.y)
        + Math.abs(node.rigGroup.rotation.y)
        + Math.abs(node.rigGroup.rotation.z)
        + Math.abs(node.leftArm.rotation.x)
        + Math.abs(node.rightArm.rotation.x);
      expect(activeMovement, `3d:${id}`).toBeGreaterThan(0.05);
      if (id === "neck-shoulder-stretch") {
        expect(Math.abs(bones.neck.rotation.z) + Math.abs(bones.head.rotation.z)).toBeGreaterThan(0.01);
        expect(setValue).toHaveBeenCalledWith("relaxed", 0.75);
      }
      if (id === "wrist-roll-break") {
        expect(Math.abs(bones.leftLowerArm.rotation.z) + Math.abs(bones.rightLowerArm.rotation.z)).toBeGreaterThan(0.01);
      }
      if (STUDIO_RICH_MOTION_PROFILES[id].category === "dance") {
        expect(setValue).toHaveBeenCalledWith("happy", 0.85);
      }

      // reducedMotion에서는 3D 진동/기울기가 0으로 안전 감쇠된다.
      applyStudioThreeActorPose(node, 1_650, 0.016, { reducedMotion: true });
      expect(node.rigGroup.position.y, `3d-reduced:${id}`).toBe(0);
      expect(node.rigGroup.rotation.y, `3d-reduced:${id}`).toBe(0);
      expect(node.rigGroup.rotation.z, `3d-reduced:${id}`).toBe(0);
    }

    // LookAt 해제 후 정지 구간에서 잔여 미세 회전이 정확히 0으로 스냅된다.
    bones.head.rotation.set(0.00005, 0.00005, 0);
    updateStudioThreeActorLookAt(node, null, 0.016);
    expect(bones.head.rotation.x).toBe(0);
    expect(bones.head.rotation.y).toBe(0);
  });
});
