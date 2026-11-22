import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_WEBTOON_AVATAR_ARCHETYPE_PRESETS } from "./studio-virtual-space-avatar-options";
import { parseStudioVirtualAvatarProfile } from "./studio-virtual-space-avatar-store";
import { CAMPUS_NPCS } from "./studio-virtual-space-campus-blueprint";
import {
  STUDIO_RICH_MOTION_IDS,
  sampleStudioRichMotion,
} from "./studio-virtual-space-character-motion";
import {
  STUDIO_CHARACTER_PART_PRESETS,
  resolveStudioCharacterPartConflicts,
  studioCharacterPresetParts,
} from "./studio-virtual-space-character-parts";
import { STUDIO_PROCEDURAL_PLAYER_SKIN_DEFINITIONS } from "./studio-virtual-space-character-skins";
import {
  STUDIO_CREATOR_SPECIALIST_EXTRA_CAST,
  STUDIO_WEBTOON_MASTER_SPRITE_CAST,
} from "./studio-virtual-space-dynamic-sprite-catalog";
import { STUDIO_ALL_FOOTSTEP_SURFACES, stepStudioFootsteps, createStudioFootstepState } from "./studio-virtual-space-footsteps";
import {
  createStudioJumpMotionState,
  planStudioDustPuffs,
  stepStudioJump,
  studioDustSurfacePalette,
  studioRunGaitOffset,
  triggerStudioJump,
} from "./studio-virtual-space-jump-motion";
import {
  locomotionDirectionalSquashStretch,
  locomotionSquashStretch,
  studioLocomotionStopSettle,
} from "./studio-virtual-space-locomotion-feel";
import {
  studioBlinkScaleY,
  studioGaitBodyOffset,
  studioGaitRockAngle,
  studioGaitSquashScale,
  studioIdleSwayOffsetX,
  studioIdleUpperBodyBreathScale,
  studioImageSpriteSubframeMotion,
} from "./studio-virtual-space-locomotion-presentation";
import { StudioMotionFeelRuntime, createStudioMotionFeelFrame } from "./studio-virtual-space-motion-feel-runtime";
import { STUDIO_NPC_PROCEDURAL_DEFINITIONS } from "./studio-virtual-space-npc-cast";
import {
  StudioVirtualSpaceSoundEngine,
  registerStudioSoundEngine,
} from "./studio-virtual-space-sound-engine";
import {
  studioFootstepSynthSpec,
  studioSfxSpec,
  type StudioSfxKind,
} from "./studio-virtual-space-sound-synth";
import { studioPoseSettleScaleY } from "./studio-virtual-space-sprite-smoothing";
import { TOON_HQ_NPCS } from "./office2d/hq/toon-hq-blueprint";
import { studioVirtualToonHqManifest } from "./office2d/hq/toon-hq-manifest";
import { advanceOffice2dActor, createOffice2dActor, office2dActorBob } from "./office2d/office2d-actors";
import { planOffice2dCoworkers } from "./office2d/office2d-coworkers";
import { applyOffice2dActorEmote, resolveOffice2dEmoteTransform } from "./office2d/office2d-emote-motion";
import { Office2dParticles } from "./office2d/office2d-particles";
import { office2dSceneFor } from "./office2d/office2d-scene";

describe("1. 등신 비율 잠금 & 모션 흔들림·사이즈 요동 근본 차단", () => {
  it("대기·걷기·달리기·정지·자세 전이 전 구간에서 Phaser 스케일 배율이 1.0으로 고정된다", () => {
    const stride = 108;
    for (let frame = 0; frame < 120; frame += 1) {
      const timeMs = frame * 16.67;
      const dist = frame * 3.5;
      expect(studioBlinkScaleY(timeMs, 0.23, false)).toBe(1);
      expect(studioIdleUpperBodyBreathScale(timeMs, 0.23, false, false, false)).toEqual({ scaleX: 1, scaleY: 1 });
      expect(studioIdleUpperBodyBreathScale(timeMs, 0.23, false, true, false)).toEqual({ scaleX: 1, scaleY: 1 });
      expect(studioGaitSquashScale(dist, stride, true, false)).toEqual({ scaleX: 1, scaleY: 1 });
      expect(locomotionSquashStretch(240, 240, false)).toEqual({ scaleX: 1, scaleY: 1 });
      expect(locomotionDirectionalSquashStretch({ x: 240, y: 0 }, { x: 120, y: 0 }, 1 / 60, 240, false)).toEqual({ scaleX: 1, scaleY: 1 });
      expect(studioLocomotionStopSettle(frame * 4, 240, 240, false)).toMatchObject({ scaleX: 1, scaleY: 1 });
      expect(studioPoseSettleScaleY({ state: "sit", previousState: "idle", elapsedMs: frame * 4, reducedMotion: false })).toBe(1);

      // 과도한 좌우 흔들림·회전 요동 차단 검증
      expect(studioIdleSwayOffsetX(timeMs, 0.4, false)).toBe(0);
      expect(studioGaitRockAngle(dist, stride, true, false)).toBe(0);
      expect(studioGaitBodyOffset(dist, stride, true, false).offsetX).toBe(0);
      const subframe = studioImageSpriteSubframeMotion(dist, stride, 4, true, false);
      expect(subframe.scaleX).toBe(1);
      expect(subframe.scaleY).toBe(1);
      expect(subframe.tiltDeg).toBe(0);
      expect(subframe.liftPx).toBe(0);
    }
  });

  it("Office2D 배우(대기·걷기·달리기·점프·이모트)와 Rich Motion 18종이 모두 크기 요동 없이(scaleX=1, scaleY=1) 동작한다", () => {
    const actor = createOffice2dActor({
      id: "hero",
      kind: "self",
      character: "artist",
      accent: "#6366f1",
      name: "작가",
      x: 100,
      y: 100,
      facing: "right",
      now: 0,
    });

    // 대기
    expect(office2dActorBob(actor, 1.5, false)).toEqual({ offsetY: 0, scaleX: 1, scaleY: 1, tiltRad: 0, shadowScale: 1 });

    // 걷기 (발 바닥 접지 offsetY=0, scale=1)
    for (let i = 1; i <= 20; i += 1) {
      advanceOffice2dActor(actor, 100 + i * 2.8, 100, 1 / 60);
      const walkBob = office2dActorBob(actor, i / 60, false);
      expect(walkBob.scaleX).toBe(1);
      expect(walkBob.scaleY).toBe(1);
      expect(walkBob.offsetY).toBe(0);
    }

    // 달리기 (경쾌한 수직 리듬 offsetY <= 0, scale=1 유지)
    let sawRunLift = false;
    for (let i = 1; i <= 20; i += 1) {
      advanceOffice2dActor(actor, actor.x + 5.2, 100, 1 / 60);
      const runBob = office2dActorBob(actor, i / 60, false);
      expect(runBob.scaleX).toBe(1);
      expect(runBob.scaleY).toBe(1);
      if (runBob.offsetY < -0.2) sawRunLift = true;
    }
    expect(sawRunLift).toBe(true);

    // 점프 공중 (포물선 높이 반영 + 그림자 축소 + scale=1 유지)
    actor.jumpHeight = 24;
    const airBob = office2dActorBob(actor, 2.0, false);
    expect(airBob.scaleX).toBe(1);
    expect(airBob.scaleY).toBe(1);
    expect(airBob.offsetY).toBeLessThanOrEqual(-24);
    expect(airBob.shadowScale).toBeLessThan(0.8);

    // 이모트·체조·댄스 전 구간에서도 scale 1.0 유지
    actor.jumpHeight = 0;
    actor.moving = false;
    applyOffice2dActorEmote(actor, "groove-dance", 1_000);
    const emoteTx = resolveOffice2dEmoteTransform(actor, 1_500, false);
    expect(emoteTx.scaleX).toBe(1);
    expect(emoteTx.scaleY).toBe(1);

    for (const id of STUDIO_RICH_MOTION_IDS) {
      const pose = sampleStudioRichMotion(id, { elapsedMs: 520, nowMs: 1_520, speedRatio: 1.2, reducedMotion: false });
      expect(pose.scaleX, id).toBe(1);
      expect(pose.scaleY, id).toBeLessThanOrEqual(1);
    }
  });
});

describe("2. 캐릭터 디자인 비중복 보장 & 신규 고유 스튜디오 캐릭터 8종", () => {
  it("파츠 프리셋 22종(신규 8종 포함)이 헤어·의상 조합 비중복, 파츠 충돌 0건, 카탈로그 스키마 100% 호환을 만족한다", () => {
    expect(STUDIO_CHARACTER_PART_PRESETS.length).toBeGreaterThanOrEqual(22);
    const keys = new Set(STUDIO_CHARACTER_PART_PRESETS.map((item) => item.key));
    expect(keys.size).toBe(STUDIO_CHARACTER_PART_PRESETS.length);

    const combos = new Set(STUDIO_CHARACTER_PART_PRESETS.map((item) => `${item.hairStyle}|${item.outfitStyle}`));
    expect(combos.size).toBe(STUDIO_CHARACTER_PART_PRESETS.length);

    for (const preset of STUDIO_CHARACTER_PART_PRESETS) {
      const parts = studioCharacterPresetParts(preset);
      expect(resolveStudioCharacterPartConflicts(parts).accessory, preset.key).toBe(parts.accessory);
      const parsed = parseStudioVirtualAvatarProfile({
        skin: preset.skin,
        hair: preset.hair,
        hairHighlight: preset.hairHighlight,
        outfit: preset.outfit,
        accent: preset.accent,
        hairStyle: preset.hairStyle,
        outfitStyle: preset.outfitStyle,
        accessory: preset.accessory,
        expression: "bright",
      });
      expect(parsed, preset.key).not.toBeNull();
    }
  });

  it("프로시저럴 플레이어 스킨 14종이 NPC 프로시저럴 스킨 7종과 단 1건도 겹치지 않는다", () => {
    expect(STUDIO_PROCEDURAL_PLAYER_SKIN_DEFINITIONS).toHaveLength(14);
    const npcPresets = new Set(STUDIO_NPC_PROCEDURAL_DEFINITIONS.map((item) => item.presetKey));
    const playerPresets = new Set(STUDIO_PROCEDURAL_PLAYER_SKIN_DEFINITIONS.map((item) => item.presetKey));
    expect(playerPresets.size).toBe(STUDIO_PROCEDURAL_PLAYER_SKIN_DEFINITIONS.length);
    for (const presetKey of playerPresets) {
      expect(npcPresets.has(presetKey), `플레이어·NPC 프리셋 중복: ${presetKey}`).toBe(false);
    }
  });

  it("웹툰 아키타입 프리셋 26종과 마스터 스프라이트 캐스트 28종이 모두 비중복·무충돌이다", () => {
    expect(STUDIO_WEBTOON_AVATAR_ARCHETYPE_PRESETS).toHaveLength(26);
    expect(STUDIO_CREATOR_SPECIALIST_EXTRA_CAST).toHaveLength(8);
    expect(STUDIO_WEBTOON_MASTER_SPRITE_CAST).toHaveLength(28);

    const archetypeCombos = new Set(
      STUDIO_WEBTOON_AVATAR_ARCHETYPE_PRESETS.map((p) => `${p.profile.hairStyle}|${p.profile.outfitStyle}`),
    );
    expect(archetypeCombos.size).toBe(STUDIO_WEBTOON_AVATAR_ARCHETYPE_PRESETS.length);

    for (const preset of STUDIO_WEBTOON_AVATAR_ARCHETYPE_PRESETS) {
      expect(parseStudioVirtualAvatarProfile(preset.profile), preset.id).not.toBeNull();
      const outfitStyle = preset.profile.outfitStyle;
      expect(outfitStyle, `${preset.id} 의상 스타일 누락`).toBeDefined();
      if (!outfitStyle) continue;
      const resolved = resolveStudioCharacterPartConflicts({
        hairStyle: preset.profile.hairStyle,
        outfitStyle,
        accessory: preset.profile.accessory,
      });
      expect(resolved.accessory, `${preset.id} 헤어-액세서리 충돌`).toBe(preset.profile.accessory);
    }

    const masterSilhouettes = new Set(
      STUDIO_WEBTOON_MASTER_SPRITE_CAST.map((p) => `${p.hairSilhouette}|${p.outfitSilhouette}`),
    );
    expect(masterSilhouettes.size).toBe(STUDIO_WEBTOON_MASTER_SPRITE_CAST.length);
  });

  it("캠퍼스·본사 NPC와 상주 동료가 중복 외형 없이 고유 스킨·액센트를 사용한다", () => {
    expect(new Set(CAMPUS_NPCS.map((npc) => npc.skinKey)).size).toBe(CAMPUS_NPCS.length);
    expect(new Set(TOON_HQ_NPCS.map((npc) => npc.skinKey)).size).toBe(TOON_HQ_NPCS.length);

    const scene = office2dSceneFor(studioVirtualToonHqManifest(false));
    const coworkers = planOffice2dCoworkers(scene);
    expect(new Set(coworkers.map((c) => c.accent)).size).toBe(coworkers.length);
    const inkBay = coworkers.filter((c) => c.roomId === "hq-ink-bay");
    expect(new Set(inkBay.map((c) => c.character)).size).toBe(inkBay.length);
  });
});

describe("3. 달리기·점프 모션 물리 & 바닥 재질별 먼지 뭉게구름 파티클", () => {
  it("포물선 점프가 매끄럽게 상승·착지하고 착석·공중 재점프를 차단한다", () => {
    const initial = createStudioJumpMotionState();
    expect(triggerStudioJump(initial, { seated: true, blocked: false }).triggered).toBe(false);
    const launch = triggerStudioJump(initial, { seated: false, blocked: false });
    expect(launch.triggered).toBe(true);
    expect(triggerStudioJump(launch.state, { seated: false, blocked: false }).triggered).toBe(false);

    let state = launch.state;
    let maxHeight = 0;
    let minShadow = 1;
    let landedCount = 0;
    for (let i = 0; i < 60; i += 1) {
      const step = stepStudioJump(state, 1 / 60, false);
      state = step.state;
      maxHeight = Math.max(maxHeight, state.heightPx);
      minShadow = Math.min(minShadow, step.shadowScale);
      if (step.landed) landedCount += 1;
    }
    expect(maxHeight).toBeGreaterThan(25);
    expect(maxHeight).toBeLessThan(45);
    expect(minShadow).toBeLessThan(0.75);
    expect(landedCount).toBe(1);
    expect(state.heightPx).toBe(0);
  });

  it("걷기 vs 달리기 보행 리듬이 명확히 구분되고(케이던스·리프트·전진 기울기) 공중에서는 0이 된다", () => {
    const walk = studioRunGaitOffset(27, 108, { moving: true, sprinting: false, airborne: false, velocityX: 160, reducedMotion: false });
    const run = studioRunGaitOffset(27, 108, { moving: true, sprinting: true, airborne: false, velocityX: 240, reducedMotion: false });
    const air = studioRunGaitOffset(27, 108, { moving: true, sprinting: true, airborne: true, velocityX: 240, reducedMotion: false });

    expect(run.cadenceMultiplier).toBeGreaterThan(walk.cadenceMultiplier);
    expect(Math.abs(run.offsetY)).toBeGreaterThan(Math.abs(walk.offsetY));
    expect(walk.leanDegrees).toBe(0);
    expect(run.leanDegrees).toBeGreaterThan(1);
    expect(run.leanDegrees).toBeLessThanOrEqual(2.2);
    expect(air).toEqual({ offsetY: 0, leanDegrees: 0, cadenceMultiplier: 1 });
  });

  it("먼지 퍼프가 걷기(1~2알)·달리기(역방향 다층 구름)·스키드·점프 링·바닥 색조·reduced-motion을 모두 준수한다", () => {
    const walkPuffs = planStudioDustPuffs({ mode: "walk", material: "wood", vx: 150, vy: 0, reducedMotion: false, seed: 1 });
    const runPuffs = planStudioDustPuffs({ mode: "run", material: "wood", vx: 260, vy: 0, reducedMotion: false, seed: 2 });
    const skidPuffs = planStudioDustPuffs({ mode: "skid", material: "stone", vx: 240, vy: 0, reducedMotion: false, seed: 3 });
    const takeoffPuffs = planStudioDustPuffs({ mode: "jump-takeoff", material: "grass", reducedMotion: false, seed: 4 });
    const landPuffs = planStudioDustPuffs({ mode: "jump-land", material: "tile", reducedMotion: false, seed: 5 });

    expect(walkPuffs.length).toBeGreaterThanOrEqual(1);
    expect(walkPuffs.length).toBeLessThanOrEqual(2);
    expect(runPuffs.length).toBeGreaterThanOrEqual(4);
    expect(runPuffs.every((p) => p.vx < 0 && p.endSize > p.startSize && p.dragPerSecond > 0)).toBe(true);
    expect(skidPuffs.length).toBeGreaterThanOrEqual(5);
    expect(takeoffPuffs.length).toBeGreaterThanOrEqual(4);
    expect(landPuffs.length).toBeGreaterThanOrEqual(7);

    // 5종 바닥 재질별 고유 먼지 색조 자동 매칭
    const surfaceColors = new Set(
      (["wood", "carpet", "stone", "grass", "tile"] as const).map((m) => studioDustSurfacePalette(m).primaryHex),
    );
    expect(surfaceColors.size).toBe(5);

    // prefers-reduced-motion에서는 먼지 0알
    expect(planStudioDustPuffs({ mode: "run", material: "wood", vx: 260, vy: 0, reducedMotion: true })).toEqual([]);
    expect(planStudioDustPuffs({ mode: "jump-land", material: "grass", reducedMotion: true })).toEqual([]);

    // Office2dParticles 잔디 재질 포함 방출 + Phaser MotionFeelRuntime 점프 먼지 연동 확인
    const o2d = new Office2dParticles(11);
    o2d.emitFootstepDust(100, 100, { surface: "grass", vx: 260, vy: 0, sprint: true });
    expect(o2d.count).toBeGreaterThanOrEqual(4);

    const bursts: number[] = [];
    const emitter = {
      setDepth: () => emitter,
      setParticleTint: () => emitter,
      explode: (count: number) => bursts.push(count),
      destroy: () => undefined,
    };
    const sprite = { visible: false, setVisible: () => sprite, setTint: () => sprite, destroy: () => undefined };
    const feel = new StudioMotionFeelRuntime({
      textures: { exists: () => true },
      make: { graphics: () => ({ fillStyle: () => ({}), fillCircle: () => ({}), generateTexture: () => undefined, destroy: () => undefined }) },
      add: { particles: () => emitter, sprite: () => sprite },
    } as never);
    feel.emitJumpDust(100, 100, 50, "grass", false, false);
    expect(bursts.length).toBeGreaterThanOrEqual(7);
    const beforeReduced = bursts.length;
    feel.emitJumpDust(100, 100, 50, "grass", false, true);
    expect(bursts.length).toBe(beforeReduced);
    const frame = createStudioMotionFeelFrame();
    Object.assign(frame, { time: 16, deltaSeconds: 1 / 60, x: 100, y: 100, speed: 260, vx: 260, vy: 0, sprinting: true, reducedMotion: false });
    feel.step(frame, null);
    feel.destroy();
  });
});

describe("4. 절차적 WebAudio 효과음(₩0) 강화 — 걷기/달리기·점프/착지·스키드·착석·포털·이모트", () => {
  afterEach(() => registerStudioSoundEngine(null));

  function createAudioFixture(options: { state?: string; reducedMotion?: boolean } = {}) {
    const oscillators: Array<{ type: string; start: ReturnType<typeof vi.fn> }> = [];
    const sources: Array<{ start: ReturnType<typeof vi.fn> }> = [];
    const filters: Array<{ type: string; frequency: { value: number; setValueAtTime: ReturnType<typeof vi.fn>; exponentialRampToValueAtTime: ReturnType<typeof vi.fn> } }> = [];
    let now = 0;
    const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() });
    const context = {
      state: options.state ?? "running",
      currentTime: 1,
      sampleRate: 8000,
      destination: {},
      resume: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createGain: () => ({ gain: param(), connect: vi.fn() }),
      createBiquadFilter: () => {
        const f = { type: "lowpass", frequency: param(), Q: param(), connect: vi.fn((node: unknown) => node) };
        filters.push(f);
        return f;
      },
      createOscillator: () => {
        const osc = { type: "sine", frequency: param(), connect: vi.fn((node: unknown) => node), start: vi.fn(), stop: vi.fn() };
        oscillators.push(osc);
        return osc;
      },
      createBufferSource: () => {
        const src = { buffer: null as unknown, loop: false, connect: vi.fn((node: unknown) => node), start: vi.fn(), stop: vi.fn() };
        sources.push(src);
        return src;
      },
      createBuffer: (_c: number, length: number, sampleRate: number) => ({ sampleRate, getChannelData: () => new Float32Array(length) }),
    };
    const engine = new StudioVirtualSpaceSoundEngine({
      createContext: () => context as unknown as AudioContext,
      now: () => now,
      prefersReducedMotion: () => options.reducedMotion ?? false,
    });
    return { engine, context, oscillators, sources, filters, advance: (ms: number) => { now += ms; } };
  }

  it("바닥 재질별 걷기 vs 달리기 발소리가 뚜렷하게 구분되고 달리기에는 2단 추진 톤과 마찰음이 추가된다", () => {
    for (const surface of [...STUDIO_ALL_FOOTSTEP_SURFACES, "grass" as const]) {
      const walk = studioFootstepSynthSpec(surface, "left", false);
      const run = studioFootstepSynthSpec(surface, "left", true);
      expect(run.durationMs, surface).toBeLessThan(walk.durationMs);
      expect(run.filterFrequency, surface).toBeGreaterThan(walk.filterFrequency);
      expect(run.secondaryTone, surface).not.toBeNull();
      expect(run.frictionNoise, surface).not.toBeNull();
    }

    const stepped = stepStudioFootsteps(createStudioFootstepState(), 42, "wood", 265, undefined, true);
    expect(stepped.events[0]?.sprinting).toBe(true);

    const f = createAudioFixture();
    f.engine.playFootstep({ foot: "left", surface: "wood", volume: 0.7, sprinting: false });
    const walkOsc = f.oscillators.length;
    const walkSrc = f.sources.length;
    f.advance(120);
    f.engine.playFootstep({ foot: "right", surface: "wood", volume: 0.7, sprinting: true });
    // 달리기는 2단 톤(+2 osc)과 마찰 노이즈(+2 bufferSource)를 추가 합성한다.
    expect(f.oscillators.length - walkOsc).toBe(2);
    expect(f.sources.length - walkSrc).toBe(2);
    f.engine.dispose();
  });

  it("점프 스우시·착지 쿵·스키드·달리기 시작·착석·기립·포털 SFX가 필터링 노이즈와 톤을 안전하게 합성하고 음소거·자동재생 정책을 준수한다", () => {
    const richKinds: readonly StudioSfxKind[] = ["jump", "land", "skid", "sprint-start", "seat-settle", "seat-stand", "portal"];
    const f = createAudioFixture();
    for (const kind of richKinds) {
      const spec = studioSfxSpec(kind);
      expect(spec.steps.length, kind).toBeGreaterThanOrEqual(1);
      expect(spec.noiseSteps?.length ?? 0, kind).toBeGreaterThanOrEqual(1);
      const prevOsc = f.oscillators.length;
      const prevSrc = f.sources.length;
      f.engine.playSfx(kind, 0.9);
      expect(f.oscillators.length, kind).toBeGreaterThan(prevOsc);
      expect(f.sources.length, kind).toBeGreaterThan(prevSrc);
      f.advance(500);
    }

    // 음소거 시 재생 차단
    f.engine.setStageMuted(true);
    const mutedOsc = f.oscillators.length;
    const mutedSrc = f.sources.length;
    f.engine.playSfx("jump", 1);
    f.engine.playFootstep({ foot: "left", surface: "tile", volume: 0.8, sprinting: true });
    expect(f.oscillators.length).toBe(mutedOsc);
    expect(f.sources.length).toBe(mutedSrc);
    f.engine.dispose();

    // suspended 상태에서는 소리 예약 없이 resume만 시도한다
    const suspended = createAudioFixture({ state: "suspended" });
    suspended.engine.playSfx("portal", 1);
    expect(suspended.oscillators.length).toBe(0);
    expect(suspended.sources.length).toBe(0);
    expect(suspended.context.resume).toHaveBeenCalled();
    suspended.engine.dispose();
  });
});
