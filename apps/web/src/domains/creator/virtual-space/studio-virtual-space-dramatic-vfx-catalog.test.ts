import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  CREATOR_STRETCH_BREAK_SECONDS,
  CREATOR_WORK_REMINDER_INTERVAL_MINUTES,
  STUDIO_DRAMATIC_VFX_CATALOG,
  STUDIO_WELLNESS_GYMNASTICS_AND_DANCE_SPECS,
  evaluateCreatorWellnessReminder,
  getStudioDramaticVfxSpec,
  resolveDramaticVfxForEmoteOrAction,
  resolveDramaticVfxRenderPlan,
  resolveFloorMaterialFootstepVfx,
  resolveManuscriptStatusPresenceVfx,
  type CreatorManuscriptStageId,
  type StudioFloorMaterialKind,
} from "./studio-virtual-space-dramatic-vfx-catalog";
import {
  STUDIO_EXTENDED_SPRITE_ACTIONS,
  STUDIO_WEBTOON_ARCHETYPE_EXTRA_CAST,
  STUDIO_WEBTOON_MASTER_SPRITE_CAST,
  computeDynamicSpriteFrameKinematics,
  getDynamicCreatorPersonaSpec,
  renderDynamicCreatorSpriteSvg,
} from "./studio-virtual-space-dynamic-sprite-engine";
import { createOffice2dActor } from "./office2d/office2d-actors";
import {
  OFFICE2D_CHARACTER_MOTIONS,
  Office2dFootstepFx,
  resolveOffice2dCharacterMotion,
  resolveOffice2dFootstepMaterialKind,
} from "./office2d/office2d-footstep-fx";
import { Office2dParticles } from "./office2d/office2d-particles";
import {
  StudioThreeFootstepFx,
  resolveStudioThreeFootstepMaterialKind,
} from "./three/studio-virtual-space-three-footstep-fx";

describe("20종 화려한 연출(Dramatic VFX) 카탈로그 & reduced-motion 감쇠", () => {
  it("16종 이상의 고유한 연출 VFX를 OKLCH·HEX·Three.js 팔레트로 제공한다", () => {
    expect(STUDIO_DRAMATIC_VFX_CATALOG.length).toBeGreaterThanOrEqual(20);
    const ids = new Set(STUDIO_DRAMATIC_VFX_CATALOG.map((item) => item.id));
    expect(ids.size).toBe(STUDIO_DRAMATIC_VFX_CATALOG.length);

    for (const spec of STUDIO_DRAMATIC_VFX_CATALOG) {
      expect(spec.primaryOklch.startsWith("oklch(")).toBe(true);
      expect(spec.secondaryOklch.startsWith("oklch(")).toBe(true);
      expect(spec.accentOklch.startsWith("oklch(")).toBe(true);
      expect(spec.primaryHex).toMatch(/^#[0-9a-f]{6}$/iu);
      expect(spec.secondaryHex).toMatch(/^#[0-9a-f]{6}$/iu);
      expect(spec.burstCount).toBeGreaterThan(0);
      expect(spec.durationMs).toBeGreaterThanOrEqual(300);
      expect(getStudioDramaticVfxSpec(spec.id)).toBe(spec);

      const fullPlan = resolveDramaticVfxRenderPlan(spec.id, { reducedMotion: false });
      expect(fullPlan.effectiveBurstCount).toBeGreaterThan(0);

      const reducedPlan = resolveDramaticVfxRenderPlan(spec.id, { reducedMotion: true });
      expect(reducedPlan.reducedMotion).toBe(true);
      expect(reducedPlan.effectiveBurstCount).toBe(0);
      expect(reducedPlan.effectiveAfterimageTrail).toBe(0);
      expect(reducedPlan.badgeEmoji.length).toBeGreaterThan(0);
      expect(reducedPlan.glowColorOklch).toBe(spec.primaryOklch);
    }
  });

  it("나무·대리석·잔디·네온타일 등 8종 바닥 재질별 발자국·파문 VFX 레시피를 제공한다", () => {
    const materials: readonly StudioFloorMaterialKind[] = [
      "wood",
      "marble",
      "grass",
      "neon-tile",
      "carpet",
      "tile",
      "stone",
      "terrace",
    ];
    for (const material of materials) {
      const recipe = resolveFloorMaterialFootstepVfx(material);
      expect(recipe.material).toBe(material);
      expect(recipe.primaryOklch.startsWith("oklch(")).toBe(true);
      expect(recipe.ringRadiusScale).toBeGreaterThan(0.5);
    }
    expect(resolveFloorMaterialFootstepVfx("marble").rippleKind).toBe("starlight-wave");
    expect(resolveFloorMaterialFootstepVfx("grass").rippleKind).toBe("petal-dew");
    expect(resolveFloorMaterialFootstepVfx("neon-tile").rippleKind).toBe("neon-pulse");
  });

  it("체조 3종·댄스 3종 전용 연출과 50분 작업 → 30초 손목 체조 리마인더 · 원고 상태 자동 연동을 계산한다", () => {
    expect(STUDIO_WELLNESS_GYMNASTICS_AND_DANCE_SPECS).toHaveLength(6);
    expect(resolveDramaticVfxForEmoteOrAction("neck-shoulder-stretch")).toBe("mint-healing-spark");
    expect(resolveDramaticVfxForEmoteOrAction("wrist-roll-break")).toBe("mint-healing-spark");
    expect(resolveDramaticVfxForEmoteOrAction("standing-gymnastics")).toBe("mint-healing-spark");
    expect(resolveDramaticVfxForEmoteOrAction("groove-dance")).toBe("rhythm-note-wave");
    expect(resolveDramaticVfxForEmoteOrAction("deadline-victory-dance")).toBe("stage-spotlight-ring");
    expect(resolveDramaticVfxForEmoteOrAction("sync-group-dance")).toBe("team-harmony-wave");

    const working = evaluateCreatorWellnessReminder({ continuousWorkMinutes: 25 });
    expect(working.status).toBe("working");
    expect(working.nextReminderInMinutes).toBe(CREATOR_WORK_REMINDER_INTERVAL_MINUTES - 25);

    const due50 = evaluateCreatorWellnessReminder({ continuousWorkMinutes: 50 });
    expect(due50.status).toBe("stretch-due");
    expect(due50.recommendedActionId).toBe("wrist-roll-break");
    expect(due50.remainingBreakSeconds).toBe(CREATOR_STRETCH_BREAK_SECONDS);

    const due100 = evaluateCreatorWellnessReminder({ continuousWorkMinutes: 100 });
    expect(due100.recommendedActionId).toBe("neck-shoulder-stretch");

    const due150 = evaluateCreatorWellnessReminder({ continuousWorkMinutes: 150 });
    expect(due150.recommendedActionId).toBe("standing-gymnastics");

    const stretching = evaluateCreatorWellnessReminder({
      continuousWorkMinutes: 50,
      secondsInBreak: 12,
      reducedMotion: true,
    });
    expect(stretching.status).toBe("stretching");
    expect(stretching.remainingBreakSeconds).toBe(18);
    expect(stretching.renderPlan.effectiveBurstCount).toBe(0);

    const done = evaluateCreatorWellnessReminder({ continuousWorkMinutes: 50, secondsInBreak: 30 });
    expect(done.status).toBe("break-complete");
    expect(done.remainingBreakSeconds).toBe(0);

    const stages: readonly CreatorManuscriptStageId[] = [
      "storyboard",
      "line-art",
      "coloring",
      "bg-3d",
      "lettering",
      "review-waiting",
      "deadline-sprint",
      "episode-approved",
      "wrist-recovery",
    ];
    for (const stage of stages) {
      const presence = resolveManuscriptStatusPresenceVfx(stage, false);
      expect(presence.statusBadgeKo.length).toBeGreaterThan(2);
      expect(presence.statusColorOklch.startsWith("oklch(")).toBe(true);
      expect(presence.renderPlan.effectiveBurstCount).toBeGreaterThan(0);
    }
    expect(resolveManuscriptStatusPresenceVfx("episode-approved").dramaticVfxId).toBe("deadline-confetti-fireworks");
    expect(resolveManuscriptStatusPresenceVfx("wrist-recovery", true).renderPlan.effectiveBurstCount).toBe(0);
  });
});

describe("28인 한국 웹툰·스튜디오 아키타입 마스터 스프라이트 & 체조/댄스 다층 SVG 렌더링", () => {
  it("28인 비중복 아키타입(기본 12 + 장르 8 + 전문 직군 8)이 선명한 다층 파츠를 생성한다", () => {
    expect(STUDIO_WEBTOON_MASTER_SPRITE_CAST).toHaveLength(28);
    expect(STUDIO_WEBTOON_ARCHETYPE_EXTRA_CAST).toHaveLength(8);
    expect(STUDIO_EXTENDED_SPRITE_ACTIONS).toHaveLength(20);

    const uniqueIds = new Set(STUDIO_WEBTOON_MASTER_SPRITE_CAST.map((p) => p.personaId));
    expect(uniqueIds.size).toBe(28);
    const uniqueSilhouettes = new Set(
      STUDIO_WEBTOON_MASTER_SPRITE_CAST.map((p) => `${p.hairSilhouette}|${p.outfitSilhouette}`),
    );
    expect(uniqueSilhouettes.size).toBe(28);

    for (const persona of STUDIO_WEBTOON_MASTER_SPRITE_CAST) {
      expect(getDynamicCreatorPersonaSpec(persona.personaId).personaId).toBe(persona.personaId);
      const svg = renderDynamicCreatorSpriteSvg({
        personaId: persona.personaId,
        actionId: persona.defaultActionId,
        expressionId: persona.defaultExpressionId,
        vfxId: persona.defaultVfxId,
        dramaticVfxId: persona.dramaticVfxId,
        frameIndex: 2,
      });
      expect(svg).toContain(`data-persona="${persona.personaId}"`);
      expect(svg).toContain('data-part="hair-highlight-ring"');
      expect(svg).toContain('data-part="ground-shadow"');
      if (persona.companionKind && persona.companionKind !== "none") {
        expect(svg).toContain(`data-companion="${persona.companionKind}"`);
      }
    }
  });

  it("체조 3종·댄스 3종 8프레임 키네마틱스와 전용 드라마틱 VFX 및 reduced-motion 감쇠를 렌더링한다", () => {
    const actions = [
      ["neck-shoulder-stretch", "mint-healing-spark"],
      ["wrist-roll-break", "mint-healing-spark"],
      ["standing-gymnastics", "mint-healing-spark"],
      ["groove-dance", "rhythm-note-wave"],
      ["deadline-victory-dance", "stage-spotlight-ring"],
      ["sync-group-dance", "team-harmony-wave"],
    ] as const;

    for (const [actionId, expectedVfx] of actions) {
      const k = computeDynamicSpriteFrameKinematics("rofan-duchess", actionId, "bright-smile", "prism-stardust-burst", 2);
      expect(k.frameIndex).toBe(2);
      const svg = renderDynamicCreatorSpriteSvg({
        personaId: "rofan-duchess",
        actionId,
        expressionId: "bright-smile",
        vfxId: "prism-stardust-burst",
        frameIndex: 2,
      });
      expect(svg).toContain(`data-dramatic-vfx="${expectedVfx}"`);

      const reducedSvg = renderDynamicCreatorSpriteSvg({
        personaId: "rofan-duchess",
        actionId,
        expressionId: "bright-smile",
        vfxId: "prism-stardust-burst",
        frameIndex: 2,
        reducedMotion: true,
      });
      expect(reducedSvg).toContain('data-vfx-reduced="true"');
    }
  });
});

describe("Office2D · Three.js 체조/댄스 모션 및 20종 드라마틱 VFX 통합", () => {
  it("Office2D는 18종 모션·8종 바닥 재질 매핑·드라마틱 VFX 분사와 reduced-motion 억제를 처리한다", () => {
    expect(OFFICE2D_CHARACTER_MOTIONS).toHaveLength(18);
    expect(resolveOffice2dFootstepMaterialKind("terrazzo", "hq-lobby")).toBe("marble");
    expect(resolveOffice2dFootstepMaterialKind("oak", "sky-garden")).toBe("grass");
    expect(resolveOffice2dFootstepMaterialKind("tile-cream", "hq-bg3d-stage")).toBe("neon-tile");

    const actor = createOffice2dActor({ id: "self", kind: "self", character: "artist", accent: "#fff", name: "작가", x: 50, y: 50, now: 0 });
    actor.emote = { glyph: "👐", kind: "wrist-roll-break", until: 5000 };
    expect(resolveOffice2dCharacterMotion(actor, 1000)).toBe("wrist-roll-break");
    actor.emote = { glyph: "🪩", kind: "deadline-victory-dance", until: 5000 };
    expect(resolveOffice2dCharacterMotion(actor, 1000)).toBe("deadline-victory-dance");
    actor.emote = { glyph: "🕺", kind: "sync-group-dance", until: 5000 };
    expect(resolveOffice2dCharacterMotion(actor, 1000)).toBe("sync-group-dance");

    const particles = new Office2dParticles(11);
    const fx = new Office2dFootstepFx();
    fx.onEmote("deadline-victory-dance", true, { particles, x: 120, y: 120, reducedMotion: false });
    expect(particles.count).toBeGreaterThan(8);

    const reducedParticles = new Office2dParticles(11);
    const plan = fx.emitDramaticVfx(reducedParticles, "mint-healing-spark", 120, 120, true);
    expect(reducedParticles.count).toBe(0);
    expect(plan.reducedMotion).toBe(true);
  });

  it("Three.js 3D VFX 풀은 이모트·체조·댄스 전환 시 3D 링과 스파크를 생성하고 reduced-motion 시 정리한다", () => {
    expect(resolveStudioThreeFootstepMaterialKind("sky-garden")).toBe("grass");
    expect(resolveStudioThreeFootstepMaterialKind("hq-bg3d-stage")).toBe("neon-tile");
    expect(resolveStudioThreeFootstepMaterialKind("hq-lobby")).toBe("marble");

    const scene = new THREE.Scene();
    const fx = new StudioThreeFootstepFx(scene);
    fx.update({
      point: { x: 100, y: 120 },
      roomId: "hq-bg3d-stage",
      moving: false,
      sprinting: false,
      seated: false,
      emoteId: "deadline-victory-dance",
      dt: 0.016,
      reducedMotion: false,
    });
    expect(fx.activeEffectCount).toBeGreaterThan(4);

    // reduced-motion 전환 시 모든 활성 3D 동적 입자가 즉시 비활성화된다.
    fx.update({
      point: { x: 100, y: 120 },
      roomId: "hq-bg3d-stage",
      moving: false,
      sprinting: false,
      seated: false,
      emoteId: "deadline-victory-dance",
      dt: 0.016,
      reducedMotion: true,
    });
    expect(fx.activeEffectCount).toBe(0);

    const reducedPlan = fx.triggerDramaticVfx({ x: 100, y: 120 }, "mint-healing-spark", true);
    expect(reducedPlan.effectiveBurstCount).toBe(0);
    expect(fx.activeEffectCount).toBe(0);
    fx.dispose();
  });
});
