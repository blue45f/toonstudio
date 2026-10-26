import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  NEXTGEN_COMPETITOR_REA_BENCHMARKS,
  advanceDeskEpisodeCutStage,
  applyStudioLightingMood,
  approachCutDeskAndInspect,
  computeCharacterSecondaryMotion,
  computeSpatialAudioGainAndPan,
  createInitialNextGenStudioEngineState,
  selectNanoBananaCreatorPersona,
  selectNanoBananaStudioTheme,
  setSoundscapeChannelGain,
  stepAvatarPhysicsTick,
  toggleGatherGhostModeGKey,
  triggerNearestObjectWithXKey,
} from "./studio-virtual-office-nextgen-engine-model";

describe("studio-virtual-office-nextgen-engine-model", () => {
  it("exposes REA competitor benchmarks and 4 Nano Banana v11 themes + 4 creator personas on disk", () => {
    const state = createInitialNextGenStudioEngineState();
    expect(NEXTGEN_COMPETITOR_REA_BENCHMARKS).toHaveLength(4);
    expect(state.themes).toHaveLength(4);
    expect(state.personas).toHaveLength(4);

    const publicDir = existsSync(resolve(process.cwd(), "public"))
      ? resolve(process.cwd(), "public")
      : resolve(process.cwd(), "apps/web/public");
    expect(existsSync(resolve(publicDir, `.${state.themesAtlasUrl}`))).toBe(true);
    expect(existsSync(resolve(publicDir, `.${state.castCleanAtlasUrl}`))).toBe(true);

    for (const theme of state.themes) {
      expect(existsSync(resolve(publicDir, `.${theme.assetUrl}`))).toBe(true);
    }
    for (const persona of state.personas) {
      expect(existsSync(resolve(publicDir, `.${persona.idleSpriteUrl}`))).toBe(true);
      expect(existsSync(resolve(publicDir, `.${persona.workSpriteUrl}`))).toBe(true);
    }
  });

  it("switches studio themes and automatically syncs recommended lighting mood & soundscape presets", () => {
    const initial = createInitialNextGenStudioEngineState();
    const cyber = selectNanoBananaStudioTheme(initial, "cyber-neon-lab");
    expect(cyber.activeThemeId).toBe("cyber-neon-lab");
    expect(cyber.lightingMoodId).toBe("midnight-crunch-fever");
    expect(cyber.deadlineCrunchFeverEnabled).toBe(true);

    const hanok = selectNanoBananaStudioTheme(cyber, "hanok-botanical-atelier");
    expect(hanok.activeThemeId).toBe("hanok-botanical-atelier");
    expect(hanok.lightingMoodId).toBe("dawn-ink");
    expect(hanok.deadlineCrunchFeverEnabled).toBe(false);
  });

  it("switches creator persona and pose while binding the default episode cut desk", () => {
    const initial = createInitialNextGenStudioEngineState();
    const cgi = selectNanoBananaCreatorPersona(initial, "cgi-director", "idle");
    expect(cgi.activePersonaId).toBe("cgi-director");
    expect(cgi.activePersonaPose).toBe("idle");
    expect(cgi.selectedCutDeskId).toBe("desk-ep43-c19");
  });

  it("simulates 60fps sub-tile spring-damper kinematics, corner-sliding collision, G-key ghost mode, and X-key trigger", () => {
    const initial = createInitialNextGenStudioEngineState();
    // Move left into desk-c04 collider at (110..174, 90..134) from (192, 132)
    let state = initial;
    for (let i = 0; i < 12; i += 1) {
      state = stepAvatarPhysicsTick(state, { dx: -1, dy: 0 }, 25);
    }
    expect(state.physics.cornerSlideEventsCount).toBeGreaterThan(0);

    // Enable Gather 'G' Ghost Mode to pass through solid desk colliders seamlessly
    const ghostOn = toggleGatherGhostModeGKey(state);
    expect(ghostOn.physics.ghostModeGKey).toBe(true);
    const movedInGhost = stepAvatarPhysicsTick(ghostOn, { dx: -1, dy: 0 }, 30);
    expect(movedInGhost.physics.x).toBeLessThan(ghostOn.physics.x);

    // Trigger nearest desk with Gather 'X' key
    const triggered = triggerNearestObjectWithXKey(movedInGhost);
    expect(triggered.physics.xKeyTriggeredObjectId).not.toBeNull();
  });

  it("computes smooth procedural secondary character motion (bobbing, squash-and-stretch breathing, blink, stylus tilt)", () => {
    const movingFrame = computeCharacterSecondaryMotion(850, 145, "work");
    expect(movingFrame.motionPhaseLabelKo).toContain("서브픽셀 보행 바운스");
    expect(movingFrame.breathScaleX).not.toBe(1);

    const blinkFrame = computeCharacterSecondaryMotion(3500, 0, "work");
    expect(blinkFrame.isBlinking).toBe(true);
    expect(Math.abs(blinkFrame.stylusTiltDeg)).toBeGreaterThan(0);
  });

  it("evaluates HRTF spatial audio distance rolloff, directional voice cone, and -28dB acoustic wall isolation", () => {
    const closeOpen = computeSpatialAudioGainAndPan(
      { x: 100, y: 100, facingAngleRad: 0 },
      { x: 130, y: 100 },
      0,
    );
    expect(closeOpen.finalGain).toBe(1);
    expect(closeOpen.audibleStatusKo).toContain("근접 선명 수음");

    const behindWall = computeSpatialAudioGainAndPan(
      { x: 100, y: 100, facingAngleRad: 0 },
      { x: 200, y: 100 },
      1,
    );
    expect(behindWall.wallAttenuationDb).toBe(-28);
    expect(behindWall.finalGain).toBeLessThan(0.05);

    const farAway = computeSpatialAudioGainAndPan(
      { x: 50, y: 50, facingAngleRad: 0 },
      { x: 450, y: 300 },
      0,
    );
    expect(farAway.finalGain).toBe(0);
  });

  it("approaches live episode cut desks, advances pipeline stages, and updates soundscape channel gains", () => {
    let state = createInitialNextGenStudioEngineState();
    state = approachCutDeskAndInspect(state, "desk-ep43-c37");
    expect(state.selectedCutDeskId).toBe("desk-ep43-c37");
    expect(state.activePersonaId).toBe("colorist");

    state = advanceDeskEpisodeCutStage(state, "desk-ep43-c37");
    const updatedDesk = state.cutDesks.find((d) => d.deskId === "desk-ep43-c37");
    expect(updatedDesk?.stage).toBe("typeset-approved");
    expect(updatedDesk?.progressPercent).toBe(100);

    state = setSoundscapeChannelGain(state, "wacom-pen-asmr", 88);
    expect(
      state.soundscapeChannels.find((c) => c.id === "wacom-pen-asmr")?.gainPercent,
    ).toBe(88);

    state = applyStudioLightingMood(state, "golden-sunset");
    expect(state.lightingMoodId).toBe("golden-sunset");
  });
});
