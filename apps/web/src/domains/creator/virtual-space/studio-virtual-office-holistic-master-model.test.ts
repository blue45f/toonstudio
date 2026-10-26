import { describe, expect, it } from "vitest";

import {
  HOLISTIC_40_VIRTUAL_OFFICE_PLATFORMS,
  NANO_BANANA_V10_CHARACTER_FRAMES,
  NANO_BANANA_V10_DECOR_PROPS,
  VIRTUAL_OFFICE_WAVE5_REA_EVIDENCE_LEDGER,
  advancePresentationSlideDeck,
  createInitialHolisticMasterState,
  evaluateCalendarAutoPresenceAtMinute,
  filterHolistic40Platforms,
  getActiveNanoBananaCharacterFrame,
  selectNanoBananaCharacterFrame,
  setCreatorPresentationMode,
  setKrispTranslationLocale,
  toggleFloatingPipAlwaysOnTop,
  toggleKrispBvcNoiseCancellation,
  toggleNanoBananaDecorPropPlacement,
} from "./studio-virtual-office-holistic-master-model";

describe("studio-virtual-office-holistic-master-model", () => {
  it("contains all 5 Wave 5 REA evidence records with non-empty ev_ IDs and positive AST counts", () => {
    expect(VIRTUAL_OFFICE_WAVE5_REA_EVIDENCE_LEDGER).toHaveLength(5);
    for (const item of VIRTUAL_OFFICE_WAVE5_REA_EVIDENCE_LEDGER) {
      expect(item.captureEvidenceId.startsWith("ev_")).toBe(true);
      expect(item.exportEvidenceId.startsWith("ev_")).toBe(true);
      expect(item.astEvidenceId.startsWith("ev_")).toBe(true);
      expect(item.viewEvidenceId.startsWith("ev_")).toBe(true);
      expect(item.visitedAstNodes).toBeGreaterThan(1000);
      expect(item.parsedJsFiles).toBeGreaterThanOrEqual(3);
    }
  });

  it("maintains the complete 40-platform catalog across Waves 1 to 5", () => {
    expect(HOLISTIC_40_VIRTUAL_OFFICE_PLATFORMS).toHaveLength(40);
    expect(filterHolistic40Platforms("", 1)).toHaveLength(13);
    expect(filterHolistic40Platforms("", 2)).toHaveLength(8);
    expect(filterHolistic40Platforms("", 3)).toHaveLength(7);
    expect(filterHolistic40Platforms("", 4)).toHaveLength(7);
    expect(filterHolistic40Platforms("", 5)).toHaveLength(5);
    expect(filterHolistic40Platforms("Krisp", "all")).toHaveLength(1);
  });

  it("switches Whereby/Airtime creator presentation overlay mode and cycles storyboard slides", () => {
    let state = createInitialHolisticMasterState();
    expect(state.presentation.mode).toBe("over-the-shoulder-tablet");
    state = setCreatorPresentationMode(state, "floating-pip-bubble");
    expect(state.presentation.mode).toBe("floating-pip-bubble");

    state = toggleFloatingPipAlwaysOnTop(state);
    expect(state.presentation.alwaysOnTopPip).toBe(false);

    state = advancePresentationSlideDeck(state, "next");
    expect(state.presentation.activeSlideIndex).toBe(1);
    state = advancePresentationSlideDeck(state, "prev");
    expect(state.presentation.activeSlideIndex).toBe(0);
  });

  it("toggles Krisp BVC noise cancellation and switches live multilingual translation locale", () => {
    let state = createInitialHolisticMasterState();
    expect(state.voiceClarity.bvcNoiseCancellationEnabled).toBe(true);
    state = toggleKrispBvcNoiseCancellation(state);
    expect(state.voiceClarity.bvcNoiseCancellationEnabled).toBe(false);

    state = setKrispTranslationLocale(state, "en");
    expect(state.voiceClarity.targetTranslationLocale).toBe("en");
    expect(state.voiceClarity.liveTranscripts[0]?.translatedText.startsWith("[EN Translation]")).toBe(true);
  });

  it("evaluates Cal.com calendar auto-presence sync and T-5min room auto-unlock", () => {
    const initial = createInitialHolisticMasterState();
    // At 09:56 (596m), 4 minutes before the 10:00 morning standup: room unlocks early (T-5min)
    const preUnlock = evaluateCalendarAutoPresenceAtMinute(initial, 9 * 60 + 56);
    expect(preUnlock.calendarSync.scheduledBlocks[0]?.roomUnlocked).toBe(true);
    expect(preUnlock.calendarSync.activeSyncedStatus).toBe("available");

    // At 10:10 (610m), inside the 10:00-10:30 morning standup: status is in-meeting
    const inStandup = evaluateCalendarAutoPresenceAtMinute(initial, 10 * 60 + 10);
    expect(inStandup.calendarSync.activeSyncedStatus).toBe("in-meeting");
    expect(inStandup.calendarSync.activeSyncedHat).toBe("🎙️ 녹화·더빙 중");

    // At 16:45 (1005m), inside the 16:30-17:30 editorial critique: status is reviewing
    const inCritique = evaluateCalendarAutoPresenceAtMinute(initial, 16 * 60 + 45);
    expect(inCritique.calendarSync.activeSyncedStatus).toBe("reviewing");
    expect(inCritique.calendarSync.scheduledBlocks[2]?.roomUnlocked).toBe(true);
  });

  it("manages Nano Banana v10 high-DPI studio theme props and 8-frame RGBA character sprites", () => {
    let state = createInitialHolisticMasterState();
    expect(NANO_BANANA_V10_DECOR_PROPS).toHaveLength(5);
    expect(NANO_BANANA_V10_CHARACTER_FRAMES).toHaveLength(8);
    expect(getActiveNanoBananaCharacterFrame(state).id).toBe("drawing-down");

    state = selectNanoBananaCharacterFrame(state, "left", "idle");
    const activeLeftIdle = getActiveNanoBananaCharacterFrame(state);
    expect(activeLeftIdle.id).toBe("idle-left");
    expect(activeLeftIdle.mirroredForDirectionConsistency).toBe(true);

    expect(state.nanoBananaStudioPack.equippedDecorPropIds).toContain("cintiq-drawing-desk");
    state = toggleNanoBananaDecorPropPlacement(state, "biophilic-planter-set");
    expect(state.nanoBananaStudioPack.equippedDecorPropIds).toContain("biophilic-planter-set");
    state = toggleNanoBananaDecorPropPlacement(state, "cintiq-drawing-desk");
    expect(state.nanoBananaStudioPack.equippedDecorPropIds).not.toContain("cintiq-drawing-desk");
  });
});
