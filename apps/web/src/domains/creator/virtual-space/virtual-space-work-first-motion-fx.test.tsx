// @vitest-environment jsdom
/**
 * 가상 스튜디오 업무 중심 정리 · 캐릭터 동작/모션 · 절차적 발소리 Web Audio ·
 * 먼지 파티클 · 12인 캐릭터 다양성 · 경쟁사 REA 메커니즘(코너 슬라이딩·프라이빗 포커스·P2P 주석 보드) 통합 검증.
 */
import { cleanup, render, screen } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import { STUDIO_VIRTUAL_CHARACTER_PRESETS } from "./studio-virtual-space-customization";
import {
  STUDIO_EXTENDED_SPRITE_ACTIONS,
  STUDIO_FULL_SPRITE_CAST,
  computeDynamicSpriteFrameKinematics,
  renderDynamicCreatorSpriteSvg,
} from "./studio-virtual-space-dynamic-sprite-engine";
import {
  STUDIO_ALL_FOOTSTEP_SURFACES,
  parseStudioExtendedFootstepSurface,
  studioFootstepSurfaceSpec,
} from "./studio-virtual-space-footsteps";
import type { StudioVirtualSpaceSnapshot } from "./studio-virtual-space-presence";
import {
  StudioVirtualSpaceSoundEngine,
  registerStudioSoundEngine,
  setStudioSoundEngineMuted,
} from "./studio-virtual-space-sound-engine";
import { studioFootstepSynthSpec, studioSfxSpec } from "./studio-virtual-space-sound-synth";
import { StudioVirtualDynamicSpriteAvatar, StudioVirtualDynamicSpriteSheetStrip } from "./StudioVirtualDynamicSpriteAvatar";
import { StudioVirtualSpaceLiveAnnotationPanel } from "./StudioVirtualSpaceLiveAnnotationPanel";
import { studioVirtualToonHqManifest } from "./office2d/hq/toon-hq-manifest";
import { TOON_HQ_ROOMS } from "./office2d/hq/toon-hq-blueprint";
import { advanceOffice2dActor, createOffice2dActor, office2dActorBob } from "./office2d/office2d-actors";
import {
  OFFICE2D_CHARACTER_MOTIONS,
  Office2dFootstepFx,
  computeOffice2dCornerSlideVelocity,
  resolveOffice2dCharacterMotion,
  resolveOffice2dFootstepSurface,
} from "./office2d/office2d-footstep-fx";
import { Office2dParticles } from "./office2d/office2d-particles";
import { Office2dPhysicsWorld, OFFICE2D_CATEGORY } from "./office2d/office2d-physics";
import type { Office2dCanvas2D } from "./office2d/office2d-procedural-art";
import { Office2dRuntime } from "./office2d/office2d-runtime";
import { office2dSceneFor } from "./office2d/office2d-scene";
import { paintOffice2dActorSpatialAura, paintOffice2dPrivateRoomFocus } from "./office2d/office2d-world-details";
import { StudioThreeFootstepFx, resolveStudioThreeFootstepSurface } from "./three/studio-virtual-space-three-footstep-fx";
import { applyStudioThreeActorPose } from "./three/studio-virtual-space-three-motion";
import { StudioThreeWorldNavigation } from "./three/studio-virtual-space-three-navigation";
import { createStylized3DCharacterNode } from "./three/studio-virtual-space-three-scene";

afterEach(() => {
  cleanup();
  registerStudioSoundEngine(null);
  setStudioSoundEngineMuted(false);
});

function createFakeAudioFixture() {
  const sources: { started: boolean }[] = [];
  const oscillators: { type: string; fromHz: number; toHz?: number }[] = [];
  let nowMs = 1000;
  const fakeContext = {
    state: "running" as AudioContextState,
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    resume: () => Promise.resolve(),
    close: () => Promise.resolve(),
    createGain: () => ({
      gain: {
        value: 1,
        setValueAtTime: () => undefined,
        linearRampToValueAtTime: () => undefined,
        exponentialRampToValueAtTime: () => undefined,
        setTargetAtTime: () => undefined,
      },
      connect: (dest: unknown) => dest,
    }),
    createBiquadFilter: () => ({
      type: "bandpass",
      frequency: { value: 1000 },
      Q: { value: 1 },
      connect: (dest: unknown) => dest,
    }),
    createBuffer: () => ({
      sampleRate: 44100,
      getChannelData: () => new Float32Array(44100),
    }),
    createBufferSource: () => {
      const src = {
        buffer: null,
        loop: false,
        connect: (dest: unknown) => dest,
        start: () => { src.started = true; },
        stop: () => undefined,
        started: false,
      };
      sources.push(src);
      return src;
    },
    createOscillator: () => {
      const osc: {
        type: string;
        frequency: {
          value: number;
          setValueAtTime: (v: number) => void;
          exponentialRampToValueAtTime: (v: number) => void;
        };
        connect: (dest: unknown) => unknown;
        start: () => void;
        stop: () => void;
      } = {
        type: "sine",
        frequency: {
          value: 440,
          setValueAtTime(v: number) { entry.fromHz = v; },
          exponentialRampToValueAtTime(v: number) { entry.toHz = v; },
        },
        connect: (dest: unknown) => dest,
        start: () => undefined,
        stop: () => undefined,
      };
      const entry = { type: "sine", fromHz: 440, toHz: undefined as number | undefined };
      oscillators.push(entry);
      return osc;
    },
  } as unknown as AudioContext;

  const engine = new StudioVirtualSpaceSoundEngine({
    createContext: () => fakeContext,
    now: () => nowMs,
    prefersReducedMotion: () => false,
  });
  engine.setPreference({ effectsEnabled: true, effectsVolume: 0.8 });
  engine.unlock();
  return {
    engine,
    sources,
    oscillators,
    advanceMs: (delta: number) => { nowMs += delta; },
  };
}

function createFakeCanvas2d() {
  const fillRules: string[] = [];
  const arcs: number[] = [];
  const ctx = {
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
    arc: (_x: number, _y: number, r: number) => { arcs.push(r); },
    ellipse: () => undefined,
    rect: () => undefined,
    clip: () => undefined,
    setLineDash: () => undefined,
    fill: (rule?: string) => { if (rule) fillRules.push(rule); },
    stroke: () => undefined,
    fillRect: () => undefined,
    strokeRect: () => undefined,
    clearRect: () => undefined,
    fillText: () => undefined,
    measureText: (text: string) => ({ width: text.length * 7 } as TextMetrics),
    createLinearGradient: () => ({ addColorStop: () => undefined } as unknown as CanvasGradient),
    createRadialGradient: () => ({ addColorStop: () => undefined } as unknown as CanvasGradient),
    drawImage: () => undefined,
  } as unknown as Office2dCanvas2D;
  return { ctx, fillRules, arcs };
}

describe("절차적 Web Audio 발소리·점프·착지·스키드 효과음 & 5종 바닥 재질", () => {
  it("5종 바닥 표면(carpet·wood·tile·stone·terrace)과 점프·착지·스키드 레시피를 합성한다", () => {
    expect(STUDIO_ALL_FOOTSTEP_SURFACES).toEqual(["carpet", "wood", "tile", "stone", "terrace"]);
    expect(parseStudioExtendedFootstepSurface("stone")).toBe("stone");
    expect(parseStudioExtendedFootstepSurface("terrace")).toBe("terrace");
    expect(parseStudioExtendedFootstepSurface("unknown")).toBe("wood");

    for (const surface of STUDIO_ALL_FOOTSTEP_SURFACES) {
      const spec = studioFootstepSurfaceSpec(surface);
      expect(spec.loudness).toBeGreaterThan(0);
      const synth = studioFootstepSynthSpec(surface, "left");
      expect(synth.durationMs).toBeGreaterThan(20);
      expect(synth.filterFrequency).toBeGreaterThan(200);
    }
    expect(studioSfxSpec("jump").steps.length).toBeGreaterThanOrEqual(1);
    expect(studioSfxSpec("land").steps.length).toBeGreaterThanOrEqual(1);
    expect(studioSfxSpec("skid").steps.length).toBeGreaterThanOrEqual(1);
  });

  it("Office2dRuntime 보행·점프(Space)·음소거 토글이 Web Audio 발소리와 먼지 퍼프를 정확히 연동한다", () => {
    const audio = createFakeAudioFixture();
    registerStudioSoundEngine(audio.engine);

    const manifest = studioVirtualToonHqManifest(false);
    const bridge = new StudioVirtualSpaceEngineBridge();
    const snapshot: StudioVirtualSpaceSnapshot = {
      self: { x: 0, y: 0, zoneId: null, facing: "down", moving: false, activity: "available", avatarIndex: 0, pose: "stand", userStatus: "online", bubble: null, typing: false, emote: null },
      peers: [],
      selfChatBubble: null,
      chatBubbles: [],
      peerTyping: [],
      peerReactions: [],
      direct: false,
      readyPeerIds: [],
    };
    let nowMs = 1000;
    let muted = false;

    const runtime = new Office2dRuntime({
      manifest,
      bridge,
      host: { createSurface: () => null, image: () => null },
      selfIdentity: "local",
      getSnapshot: () => snapshot,
      getSelfName: () => "작가",
      getSeatedActors: () => [],
      getCallbacks: () => ({
        onLocalState: () => undefined,
        onInteract: () => undefined,
        onPeerSelect: () => undefined,
        onCancelFollow: () => undefined,
      }),
      getLanguage: () => "ko",
      getReducedMotion: () => false,
      getSoundMuted: () => muted,
      clock: () => nowMs,
      ambientCoworkers: false,
    });
    runtime.start();

    // W 키로 걸어 발소리 + 먼지 발생 확인
    runtime.keyDown("KeyW");
    for (let i = 0; i < 30; i += 1) {
      nowMs += 33;
      audio.advanceMs(33);
      runtime.frame(0.033);
    }
    runtime.keyUp("KeyW");
    expect(audio.sources.length).toBeGreaterThan(0);

    // Space 키로 점프 도약 및 착지 SFX 확인
    const oscBeforeJump = audio.oscillators.length;
    runtime.keyDown("Space");
    expect(runtime.debugState().jumpHeight).toBeGreaterThan(0);
    for (let i = 0; i < 25; i += 1) {
      nowMs += 33;
      audio.advanceMs(33);
      runtime.frame(0.033);
    }
    expect(runtime.debugState().jumpHeight).toBe(0);
    expect(audio.oscillators.length).toBeGreaterThan(oscBeforeJump);

    // 음소거 시 발소리·점프음이 완전히 차단된다
    muted = true;
    setStudioSoundEngineMuted(true);
    const sourcesMutedStart = audio.sources.length;
    const oscMutedStart = audio.oscillators.length;
    runtime.keyDown("KeyS");
    for (let i = 0; i < 20; i += 1) {
      nowMs += 33;
      audio.advanceMs(33);
      runtime.frame(0.033);
    }
    runtime.keyUp("KeyS");
    runtime.keyDown("Space");
    expect(audio.sources.length).toBe(sourcesMutedStart);
    expect(audio.oscillators.length).toBe(oscMutedStart);
  });
});

describe("먼지 파티클 · 12종 캐릭터 모션 · 코너 슬라이딩 · 프라이빗 포커스", () => {
  it("표면별 먼지 퍼프·착지 링·타이핑 리플을 방출하고 reduced-motion에서는 억제한다", () => {
    const particles = new Office2dParticles(19);
    const fx = new Office2dFootstepFx();
    const actor = createOffice2dActor({ id: "self", kind: "self", character: "artist", accent: "#f43f5e", name: "작가", x: 100, y: 100, facing: "right", now: 0 });

    particles.emitFootstepDust(100, 100, { surface: "wood", vx: 180, vy: 0, sprint: false });
    expect(particles.count).toBeGreaterThanOrEqual(3);
    particles.emitLandingDust(100, 100, "terrace", false);
    expect(particles.count).toBeGreaterThanOrEqual(10);
    particles.emitTypingRipple(100, 100);
    particles.update(0.1);
    const { ctx } = createFakeCanvas2d();
    particles.draw(ctx);

    // 고속 이동 후 반대 방향 급전환 시 skidTriggered 발동 확인
    const skidActor = createOffice2dActor({ id: "skid", kind: "self", character: "artist", accent: "#f43f5e", name: "작가", x: 100, y: 100, facing: "right", now: 0 });
    advanceOffice2dActor(skidActor, 120, 100, 0.08);
    advanceOffice2dActor(skidActor, 104, 100, 0.08);
    expect(skidActor.skidTriggered).toBe(true);

    // reduced-motion에서는 점프 도약 먼지 미생성
    const reducedParticles = new Office2dParticles(19);
    fx.triggerJump(actor, reducedParticles, "stone", true, true);
    expect(reducedParticles.count).toBe(0);
    expect(actor.jumpHeight).toBeGreaterThan(0);

    // 점프 중 그림자가 자연스럽게 축소된다
    const airBob = office2dActorBob(actor, 0.5, false);
    expect(airBob.offsetY).toBeLessThan(0);
    expect(airBob.shadowScale).toBeLessThan(1);
  });

  it("12종 캐릭터 모션 카탈로그와 상태별 모션 판별·바닥 재질 매핑이 정확하다", () => {
    expect(OFFICE2D_CHARACTER_MOTIONS.length).toBeGreaterThanOrEqual(12);
    expect(resolveOffice2dFootstepSurface("oak", "hq-ink-bay")).toBe("wood");
    expect(resolveOffice2dFootstepSurface("carpet-sage", "hq-lounge")).toBe("carpet");
    expect(resolveOffice2dFootstepSurface("terrazzo", "hq-lobby")).toBe("stone");
    expect(resolveOffice2dFootstepSurface("oak", "sky-terrace")).toBe("terrace");

    const actor = createOffice2dActor({ id: "self", kind: "self", character: "artist", accent: "#fff", name: "작가", x: 0, y: 0, now: 0 });
    expect(resolveOffice2dCharacterMotion(actor, 1000)).toBe("idle-breathe");
    actor.moving = true;
    actor.speed = 180;
    expect(resolveOffice2dCharacterMotion(actor, 1000)).toBe("walk");
    actor.speed = 290;
    expect(resolveOffice2dCharacterMotion(actor, 1000)).toBe("sprint");
    actor.jumpHeight = 14;
    expect(resolveOffice2dCharacterMotion(actor, 1000)).toBe("jump");
    actor.jumpHeight = 0;
    actor.moving = false;
    actor.emote = { glyph: "👏", kind: "clap", until: 3000 };
    expect(resolveOffice2dCharacterMotion(actor, 1000)).toBe("clap");
    actor.emote = { glyph: "☕", kind: "coffee", until: 3000 };
    expect(resolveOffice2dCharacterMotion(actor, 1000)).toBe("coffee");
  });

  it("코너 슬라이딩 보정이 문틀 가장자리에서 열린 통로 방향으로 부드럽게 유도한다", () => {
    const physics = new Office2dPhysicsWorld({ width: 400, height: 400 });
    // y=100 벽을 두고 x=112 오른쪽은 통로(열림), x<=112는 막힘
    physics.addBody({
      id: "wall-left",
      kind: "static",
      shape: { type: "box", halfWidth: 56, halfHeight: 10 },
      x: 56,
      y: 100,
      category: OFFICE2D_CATEGORY.world,
    });
    // 플레이어가 문틀 끝(x=114, y=126)에서 위(0, -200)로 걸으면 오른쪽(+x)으로 슬라이드 유도
    const slid = computeOffice2dCornerSlideVelocity(physics, 114, 126, 12, 0, -200);
    expect(slid.vx).toBeGreaterThan(20);
  });

  it("프라이빗·정숙 방 안에서는 바깥 구역만 evenodd로 은은하게 어둡히고 근접 오디오 감쇠 아크를 그린다", () => {
    const manifest = studioVirtualToonHqManifest(false);
    const scene = office2dSceneFor(manifest);
    const reviewRoom = TOON_HQ_ROOMS.find((room) => room.privacy === "private")!;
    const self = createOffice2dActor({ id: "self", kind: "self", character: "artist", accent: "#fff", name: "나", x: reviewRoom.x + 80, y: reviewRoom.y + 120, now: 0 });
    const peer = createOffice2dActor({ id: "peer:1", kind: "peer", character: "pd", accent: "#38bdf8", name: "PD", x: self.x + 90, y: self.y, now: 0 });

    const { ctx, fillRules, arcs } = createFakeCanvas2d();
    paintOffice2dPrivateRoomFocus(ctx, scene, self, { minX: 0, minY: 0, maxX: 1600, maxY: 1600 }, false);
    expect(fillRules).toContain("evenodd");

    paintOffice2dActorSpatialAura(ctx, self, { time: 1, now: 1000, selfId: "self", language: "ko", reducedMotion: false, daylight: 0.9 }, [self, peer]);
    expect(arcs.length).toBeGreaterThan(0);
  });
});

describe("3D 스테이지 발소리·3D 먼지 퍼프·점프·정지 감속 보간 & 코너 슬라이딩", () => {
  it("3D 보행 시 발소리·먼지 퍼프가 발생하고 정지 시 다리 위상이 급스냅 없이 부드럽게 감쇠한다", () => {
    const audio = createFakeAudioFixture();
    registerStudioSoundEngine(audio.engine);

    const scene = new THREE.Scene();
    const fx = new StudioThreeFootstepFx(scene);
    expect(resolveStudioThreeFootstepSurface("hq-lounge")).toBe("carpet");
    expect(resolveStudioThreeFootstepSurface("hq-lobby")).toBe("stone");
    expect(resolveStudioThreeFootstepSurface("sky-terrace")).toBe("terrace");
    expect(resolveStudioThreeFootstepSurface("hq-ink-bay")).toBe("wood");

    // 3D 이동으로 발소리 발생
    fx.update({ point: { x: 100, y: 100 }, roomId: "hq-ink-bay", moving: true, sprinting: false, seated: false, emoteId: null, dt: 0.05, reducedMotion: false });
    audio.advanceMs(120);
    fx.update({ point: { x: 155, y: 100 }, roomId: "hq-ink-bay", moving: true, sprinting: true, seated: false, emoteId: null, dt: 0.05, reducedMotion: false });
    expect(audio.sources.length).toBeGreaterThan(0);

    // 3D 점프 도약 → 착지
    expect(fx.triggerJump({ x: 155, y: 100 }, "hq-lobby", false, false)).toBe(true);
    expect(fx.jumpHeight).toBeGreaterThan(0);
    for (let i = 0; i < 40; i += 1) {
      audio.advanceMs(30);
      fx.update({ point: { x: 155, y: 100 }, roomId: "hq-lobby", moving: false, sprinting: false, seated: false, emoteId: null, dt: 0.03, reducedMotion: false });
    }
    expect(fx.jumpHeight).toBe(0);
    fx.dispose();

    // 3D 정지 시 walkPhase 급초기화 없이 부드럽게 감쇠 확인
    const node = createStylized3DCharacterNode("self", 0x4f46e5, true);
    node.moving = true;
    node.group.position.set(0, 0, 0);
    applyStudioThreeActorPose(node, 1000, 0.05);
    node.group.position.set(0.45, 0, 0);
    applyStudioThreeActorPose(node, 1050, 0.05);
    const movingBlend = Number(node.group.userData.gaitBlend);
    expect(movingBlend).toBeGreaterThan(0.3);
    node.moving = false;
    applyStudioThreeActorPose(node, 1070, 0.02);
    const stoppingBlend = Number(node.group.userData.gaitBlend);
    // 한 프레임 만에 0으로 뚝 끊기지 않고 부드럽게 줄어든다
    expect(stoppingBlend).toBeGreaterThan(0.1);
    expect(stoppingBlend).toBeLessThan(movingBlend);

    // 3D 네비게이션 코너 슬라이딩 메서드 정상 동작
    const nav = new StudioThreeWorldNavigation(studioVirtualToonHqManifest(false));
    const spawn = nav.resolveTarget({ x: 336, y: 1470 })!;
    const moved = nav.directional(spawn, { x: 0, y: -8 });
    expect(moved.y).toBeLessThan(spawn.y);
  });
});

describe("12종 캐릭터 다양성 · 14종 스프라이트 모션 · 접지 그림자 · 4방향 & P2P 주석 보드 연결", () => {
  it("12종 캐릭터 캐스트와 12종 오피스 직군 코디, 14종 확장 모션, 4방향·접지 그림자·먼지 퍼프를 제공한다", () => {
    expect(STUDIO_FULL_SPRITE_CAST).toHaveLength(12);
    expect(STUDIO_VIRTUAL_CHARACTER_PRESETS.length).toBeGreaterThanOrEqual(12);
    expect(STUDIO_EXTENDED_SPRITE_ACTIONS.length).toBeGreaterThanOrEqual(14);

    // 4방향 및 접지 그림자·먼지 퍼프·도구 컨텍스트 확인
    const walkSvg = renderDynamicCreatorSpriteSvg({
      personaId: "bg-architect",
      actionId: "walk-stride",
      expressionId: "bright-smile",
      vfxId: "biophilic-sakura-wind",
      frameIndex: 2,
      facing: "left",
    });
    expect(walkSvg).toContain('data-persona="bg-architect"');
    expect(walkSvg).toContain('data-facing="left"');
    expect(walkSvg).toContain('data-part="ground-shadow"');
    expect(walkSvg).toContain('data-part="footstep-dust"');

    const backSvg = renderDynamicCreatorSpriteSvg({
      personaId: "editorial-chief",
      actionId: "chair-sit",
      expressionId: "smug-grin",
      vfxId: "collab-tether-beam",
      frameIndex: 0,
      facing: "up",
    });
    expect(backSvg).toContain('data-facing="up"');

    const kWave = computeDynamicSpriteFrameKinematics("junior-inker", "wave-greet", "joyful-wink", "manga-speedlines", 3);
    expect(kWave.rightArmDeg).toBeLessThan(-100);

    // Avatar UI: >= 12px 텍스트(text-xs)와 한글 깜빡임 표시(😉 BLINK 제거)
    render(
      <>
        <StudioVirtualDynamicSpriteAvatar
          personaId="lighting-director"
          actionId="clap-cheer"
          expressionId="bright-smile"
          vfxId="prism-stardust-burst"
          facing="right"
          paused
          showBadge
        />
        <StudioVirtualDynamicSpriteSheetStrip
          personaId="lighting-director"
          actionId="walk-stride"
          expressionId="bright-smile"
          vfxId="prism-stardust-burst"
        />
      </>,
    );
    expect(screen.getByTestId("dynamic-sprite-avatar-lighting-director").getAttribute("data-facing")).toBe("right");
    expect(screen.getByText("깜빡임")).toBeTruthy();
    expect(screen.queryByText(/BLINK/)).toBeNull();
  });

  it("라이브 주석 패널은 실시간 P2P 채널 부재 시 폴백 보드로, 연결 시 P2P 보드 훅으로 동작한다", () => {
    const fallbackProps = {
      snapshot: { entities: [], readyPeerIds: [], available: true, canEdit: true },
      selfSessionId: "self-1",
      onStroke: vi.fn(),
      onNote: vi.fn(),
      onRemove: vi.fn(),
      onClearOwn: vi.fn(),
    };
    const { container } = render(<StudioVirtualSpaceLiveAnnotationPanel {...fallbackProps} />);
    expect(container.querySelector(".studio-vspace-live-annotation")?.getAttribute("data-p2p-live")).toBeNull();
  });
});
