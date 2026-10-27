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
  navigateAvatarClickToWalk,
  selectNanoBananaCreatorPersona,
  selectNanoBananaStudioTheme,
  setSoundscapeChannelGain,
  stepAvatarPhysicsTick,
  toggleGatherGhostModeGKey,
  triggerNearestObjectWithXKey,
  triggerWebAudioSynthesizerPing,
} from "./studio-virtual-office-nextgen-engine-model";
import {
  addDeskRetakeNote,
  completePomodoroSprintAndCut,
  createInitialPracticalWorkbenchState,
  generateDailyStudioHandoffMarkdown,
  handoffDeskToNextDepartment,
  setPracticalWorkMode,
  toggleDeskQualityChecklistItem,
  togglePomodoroSprintRunning,
  toggleResolveDeskRetakeNote,
} from "./studio-virtual-office-practical-workbench-model";

describe("studio-virtual-office-nextgen-engine-model", () => {
  it("exposes REA competitor benchmarks and 8 Nano Banana (v11+v12) themes + 8 creator/mascot personas on disk", () => {
    const state = createInitialNextGenStudioEngineState();
    expect(NEXTGEN_COMPETITOR_REA_BENCHMARKS).toHaveLength(4);
    expect(state.themes).toHaveLength(8);
    expect(state.personas).toHaveLength(8);

    const publicDir = existsSync(resolve(process.cwd(), "public"))
      ? resolve(process.cwd(), "public")
      : resolve(process.cwd(), "apps/web/public");
    expect(existsSync(resolve(publicDir, `.${state.themesAtlasUrl}`))).toBe(true);
    expect(existsSync(resolve(publicDir, `.${state.castCleanAtlasUrl}`))).toBe(true);
    expect(existsSync(resolve(publicDir, `.${state.v12ThemesAtlasUrl}`))).toBe(true);
    expect(existsSync(resolve(publicDir, `.${state.v12CastCleanAtlasUrl}`))).toBe(true);

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

    // Click-to-walk waypoint navigation + companion pet follower spring tracking + WebAudio synth ping
    state = navigateAvatarClickToWalk(state, 280, 180);
    expect(state.waypointPath).toHaveLength(3);
    expect(state.physics.x).toBe(280);
    expect(state.companionFollower.trailingDistancePx).toBeGreaterThan(0);

    state = triggerWebAudioSynthesizerPing(state, "page-flip-chime");
    expect(state.lastSynthesizedAudioPing?.carrierHz).toBe(880);
    expect(state.lastSynthesizedAudioPing?.statusKo).toContain("WebAudio 합성 완료");
  });

  it("manages practical daily studio workbench: Pomodoro sprints, DCC layer checklists, retake instructions, and handoff reports", () => {
    const engineState = createInitialNextGenStudioEngineState();
    let wb = createInitialPracticalWorkbenchState();

    expect(wb.workModeId).toBe("deep-focus-dnd");
    wb = setPracticalWorkMode(wb, "coffee-break");
    expect(wb.workModeId).toBe("coffee-break");
    expect(wb.pomodoro.isRunning).toBe(false);

    wb = togglePomodoroSprintRunning(wb);
    expect(wb.pomodoro.isRunning).toBe(true);
    wb = completePomodoroSprintAndCut(wb);
    expect(wb.pomodoro.todayCompletedCuts).toBe(15);

    wb = toggleDeskQualityChecklistItem(wb, "desk-ep43-c04", "chk-c04-3");
    expect(wb.deskWorkbenches["desk-ep43-c04"].checklistCompletionPercent).toBe(100);

    wb = addDeskRetakeNote(wb, "desk-ep43-c04", "박서준 PD", "검기 이펙트 레이어 투명도 90% 보정");
    expect(wb.deskWorkbenches["desk-ep43-c04"].retakeNotes[0]?.noteKo).toContain("검기 이펙트");

    const retakeId = wb.deskWorkbenches["desk-ep43-c04"].retakeNotes[0]?.id ?? "rt-c04-1";
    wb = toggleResolveDeskRetakeNote(wb, "desk-ep43-c04", retakeId);
    expect(wb.deskWorkbenches["desk-ep43-c04"].retakeNotes[0]?.resolved).toBe(true);

    wb = handoffDeskToNextDepartment(wb, "desk-ep43-c04");
    expect(wb.deskWorkbenches["desk-ep43-c04"].handoffCount).toBe(2);

    wb = generateDailyStudioHandoffMarkdown(wb, engineState);
    expect(wb.lastGeneratedHandoffMarkdown).toContain("[툰스튜디오 일일 원고 마감·인수인계 브리핑]");
    expect(wb.lastGeneratedHandoffMarkdown).toContain("EP43_C04_Action_Slash_v3.clip");
  });
});
