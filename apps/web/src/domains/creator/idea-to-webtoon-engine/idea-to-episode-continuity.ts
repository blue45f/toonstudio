/**
 * Stage 4: 장기 연재 연속성·모순 감사기(`auditEpisodeContinuity`) 및
 * 결정론적 자동 교정(`repairContinuityCore`) · 데모 오류 주입기.
 *
 * 5대 연속성 규칙을 검사한다:
 * 1. OUTFIT_MISMATCH: 캐릭터 DNA 락 의상과 컷별 의상 배정 불일치
 * 2. TIMELINE_REGRESSION: 회상(flashback)이 아닌 컷의 시간대 역행
 * 3. DIALOGUE_BUBBLE_OVERLOAD: 컷당 말풍선 3개 초과 또는 대사 48자 초과
 * 4. MISSING_CLIFFHANGER: 마지막 컷 클리프행어 표식/긴장도/비트 누락
 * 5. MONOTONOUS_SHOT_SEQUENCE: 연속 3컷 이상 동일 카메라 샷 반복
 */

import {
  CLIFFHANGER_MIN_TENSION,
  MAX_BUBBLES_PER_PANEL,
  MAX_BUBBLE_CHAR_LENGTH,
  MONOTONOUS_SHOT_RUN_THRESHOLD,
  TIME_OF_DAY_RANK,
  type CameraShotType,
  type CharacterDnaLock,
  type CompiledWebtoonEpisodePlan,
  type ContinuityAuditFinding,
  type ContinuityAuditReport,
  type ContinuityRuleId,
  type GeneratedPanelBlueprint,
  type PanelDialogueBubble,
  type StoryBeatNode,
  type TimeOfDayId,
} from "./idea-to-episode-types";

const SHOT_CONTRAST_ROTATION: readonly CameraShotType[] = [
  "ECU",
  "WS",
  "MS",
  "Dutch",
  "CU",
  "BirdEye",
] as const;

const ERROR_PENALTY = 18;
const WARNING_PENALTY = 10;

function createEmptyRuleCounts(): Record<ContinuityRuleId, number> {
  return {
    OUTFIT_MISMATCH: 0,
    TIMELINE_REGRESSION: 0,
    DIALOGUE_BUBBLE_OVERLOAD: 0,
    MISSING_CLIFFHANGER: 0,
    MONOTONOUS_SHOT_SEQUENCE: 0,
  };
}

function clampBubbleLine(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function pickContrastingShot(
  prevShot: CameraShotType,
  nextShot: CameraShotType | undefined,
  panelIndex: number,
): CameraShotType {
  const start = panelIndex % SHOT_CONTRAST_ROTATION.length;
  for (let offset = 0; offset < SHOT_CONTRAST_ROTATION.length; offset += 1) {
    const candidate = SHOT_CONTRAST_ROTATION[(start + offset) % SHOT_CONTRAST_ROTATION.length];
    if (candidate !== prevShot && candidate !== nextShot) {
      return candidate;
    }
  }
  return prevShot === "ECU" ? "WS" : "ECU";
}

export function auditEpisodeContinuity(
  plan: Pick<
    CompiledWebtoonEpisodePlan,
    "deterministicSeed" | "characters" | "storyBeats" | "panels"
  >,
): ContinuityAuditReport {
  const findings: ContinuityAuditFinding[] = [];
  const counts = createEmptyRuleCounts();
  const charById = new Map<string, CharacterDnaLock>(
    plan.characters.map((character) => [character.id, character]),
  );

  // 1. 의상 불일치 (OUTFIT_MISMATCH)
  for (const panel of plan.panels) {
    const checkedCharIds = new Set<string>([
      ...panel.featuredCharacterIds,
      ...Object.keys(panel.outfitAssignments),
    ]);
    for (const charId of checkedCharIds) {
      const lockedChar = charById.get(charId);
      if (!lockedChar) continue;
      const assigned = panel.outfitAssignments[charId];
      if (assigned !== lockedChar.lockedOutfitId) {
        counts.OUTFIT_MISMATCH += 1;
        findings.push({
          findingId: `outfit-p${panel.panelIndex}-${charId}`,
          ruleId: "OUTFIT_MISMATCH",
          severity: "error",
          panelIndices: [panel.panelIndex],
          characterId: charId,
          message: {
            ko: `${panel.panelIndex}컷에서 ${lockedChar.name.ko}의 의상(${assigned ?? "미지정"})이 DNA 락(${lockedChar.lockedOutfitLabel.ko})과 어긋납니다.`,
            en: `Panel ${panel.panelIndex}: ${lockedChar.name.en} outfit (${assigned ?? "unset"}) conflicts with DNA lock (${lockedChar.lockedOutfitLabel.en}).`,
          },
          autoFixPreview: {
            ko: `${lockedChar.lockedOutfitLabel.ko} 의상으로 즉시 재잠금`,
            en: `Re-lock outfit to ${lockedChar.lockedOutfitLabel.en}`,
          },
        });
      }
    }
  }

  // 2. 시간대 역행 (TIMELINE_REGRESSION)
  let lastOrder = -1;
  let lastTimeRank = -1;
  let lastPanelIndex = 0;
  let lastTimeOfDay: TimeOfDayId = "dawn";

  for (const panel of plan.panels) {
    if (panel.isFlashback) continue;
    const rank = TIME_OF_DAY_RANK[panel.timeOfDay];
    if (
      lastPanelIndex > 0 &&
      (panel.timeSlotOrder < lastOrder || rank < lastTimeRank)
    ) {
      counts.TIMELINE_REGRESSION += 1;
      findings.push({
        findingId: `timeline-p${panel.panelIndex}`,
        ruleId: "TIMELINE_REGRESSION",
        severity: "error",
        panelIndices: [lastPanelIndex, panel.panelIndex],
        message: {
          ko: `${panel.panelIndex}컷 시간대(${panel.timeOfDay})가 직전 ${lastPanelIndex}컷(${lastTimeOfDay})보다 과거로 역행했습니다.`,
          en: `Panel ${panel.panelIndex} time (${panel.timeOfDay}) regresses earlier than panel ${lastPanelIndex} (${lastTimeOfDay}).`,
        },
        autoFixPreview: {
          ko: `${panel.panelIndex}컷 시간대를 ${lastTimeOfDay} 이후로 순행 정렬`,
          en: `Align panel ${panel.panelIndex} chronology to ${lastTimeOfDay} or later`,
        },
      });
    } else {
      lastOrder = panel.timeSlotOrder;
      lastTimeRank = rank;
      lastPanelIndex = panel.panelIndex;
      lastTimeOfDay = panel.timeOfDay;
    }
  }

  // 3. 말풍선 과밀 (DIALOGUE_BUBBLE_OVERLOAD: >3개 또는 48자 초과)
  for (const panel of plan.panels) {
    const tooMany = panel.dialogues.length > MAX_BUBBLES_PER_PANEL;
    const maxObservedLen = panel.dialogues.reduce(
      (acc, bubble) => Math.max(acc, bubble.text.ko.length, bubble.text.en.length),
      0,
    );
    const tooLong = maxObservedLen > MAX_BUBBLE_CHAR_LENGTH;
    if (tooMany || tooLong) {
      counts.DIALOGUE_BUBBLE_OVERLOAD += 1;
      findings.push({
        findingId: `dialogue-p${panel.panelIndex}`,
        ruleId: "DIALOGUE_BUBBLE_OVERLOAD",
        severity: "warning",
        panelIndices: [panel.panelIndex],
        message: {
          ko: `${panel.panelIndex}컷 말풍선 과밀(${panel.dialogues.length}개 · 최대 ${maxObservedLen}자 / 기준 ${MAX_BUBBLES_PER_PANEL}개·${MAX_BUBBLE_CHAR_LENGTH}자 이하).`,
          en: `Panel ${panel.panelIndex} dialogue overload (${panel.dialogues.length} bubbles, max ${maxObservedLen} chars; limit ${MAX_BUBBLES_PER_PANEL} bubbles / ${MAX_BUBBLE_CHAR_LENGTH} chars).`,
        },
        autoFixPreview: {
          ko: `핵심 대사 ${MAX_BUBBLES_PER_PANEL}개 이하·${MAX_BUBBLE_CHAR_LENGTH}자 이내로 압축`,
          en: `Trim to <=${MAX_BUBBLES_PER_PANEL} bubbles and <=${MAX_BUBBLE_CHAR_LENGTH} chars each`,
        },
      });
    }
  }

  // 4. 클리프행어 누락 (MISSING_CLIFFHANGER)
  const lastPanel = plan.panels[plan.panels.length - 1];
  const hasCliffhangerBeat = plan.storyBeats.some((beat) => beat.isCliffhanger);
  if (
    !lastPanel ||
    !lastPanel.isCliffhangerPanel ||
    lastPanel.tensionScore < CLIFFHANGER_MIN_TENSION ||
    !hasCliffhangerBeat
  ) {
    counts.MISSING_CLIFFHANGER += 1;
    const targetIdx = lastPanel ? lastPanel.panelIndex : 1;
    findings.push({
      findingId: `cliffhanger-p${targetIdx}`,
      ruleId: "MISSING_CLIFFHANGER",
      severity: "error",
      panelIndices: [targetIdx],
      message: {
        ko: `엔딩 ${targetIdx}컷의 클리프행어 표식 또는 긴장도(${lastPanel?.tensionScore ?? 0}점 / 최소 ${CLIFFHANGER_MIN_TENSION}점)가 부족합니다.`,
        en: `Ending panel ${targetIdx} is missing cliffhanger framing or tension (${lastPanel?.tensionScore ?? 0}/${CLIFFHANGER_MIN_TENSION} min).`,
      },
      autoFixPreview: {
        ko: `${targetIdx}컷을 클리프행어 드롭·긴장도 92+ 및 확장 여백으로 보강`,
        en: `Promote panel ${targetIdx} to cliffhanger drop with 92+ tension and wide gutter`,
      },
    });
  }

  // 5. 샷 단조로움 (MONOTONOUS_SHOT_SEQUENCE: 연속 3컷 이상 동일 샷)
  let runStart = 0;
  while (runStart < plan.panels.length) {
    const baseShot = plan.panels[runStart].cameraShot;
    let runEnd = runStart;
    while (
      runEnd + 1 < plan.panels.length &&
      plan.panels[runEnd + 1].cameraShot === baseShot
    ) {
      runEnd += 1;
    }
    const runLen = runEnd - runStart + 1;
    if (runLen >= MONOTONOUS_SHOT_RUN_THRESHOLD) {
      counts.MONOTONOUS_SHOT_SEQUENCE += 1;
      const runIndices = plan.panels
        .slice(runStart, runEnd + 1)
        .map((panel) => panel.panelIndex);
      findings.push({
        findingId: `monotonous-${runIndices[0]}-${runIndices[runIndices.length - 1]}`,
        ruleId: "MONOTONOUS_SHOT_SEQUENCE",
        severity: "warning",
        panelIndices: runIndices,
        message: {
          ko: `${runIndices[0]}~${runIndices[runIndices.length - 1]}컷까지 ${baseShot} 샷이 ${runLen}회 연속 반복되어 시각 리듬이 단조롭습니다.`,
          en: `Panels ${runIndices[0]}-${runIndices[runIndices.length - 1]} repeat ${baseShot} ${runLen} times in a row, flattening scroll rhythm.`,
        },
        autoFixPreview: {
          ko: `반복 구간의 카메라 샷을 대비 앵글로 자동 재배치`,
          en: `Break shot streak with contrasting camera framing`,
        },
      });
    }
    runStart = runEnd + 1;
  }

  const penalty = findings.reduce(
    (sum, finding) => sum + (finding.severity === "error" ? ERROR_PENALTY : WARNING_PENALTY),
    0,
  );
  const score = Math.max(0, 100 - penalty);

  return {
    checkedAtSeed: plan.deterministicSeed,
    score,
    passed: findings.length === 0,
    findings,
    countsByRule: counts,
  };
}

export interface ContinuityRepairCoreResult {
  readonly storyBeats: readonly StoryBeatNode[];
  readonly panels: readonly GeneratedPanelBlueprint[];
}

export function repairContinuityCore(
  plan: Pick<CompiledWebtoonEpisodePlan, "characters" | "storyBeats" | "panels">,
): ContinuityRepairCoreResult {
  const charById = new Map<string, CharacterDnaLock>(
    plan.characters.map((character) => [character.id, character]),
  );

  // Step 1: 의상 락 복구 + 말풍선 과밀 압축 + 시간대 순행 정렬
  let lastOrder = 0;
  let lastTimeRank = 0;
  let lastTimeOfDay: TimeOfDayId = "dawn";
  let seenNonFlashback = false;

  const repairedPanels: GeneratedPanelBlueprint[] = plan.panels.map((panel) => {
    const fixedOutfits: Record<string, string> = { ...panel.outfitAssignments };
    for (const charId of [...panel.featuredCharacterIds, ...Object.keys(fixedOutfits)]) {
      const lockedChar = charById.get(charId);
      if (lockedChar) {
        fixedOutfits[charId] = lockedChar.lockedOutfitId;
      }
    }

    let nextOrder = panel.timeSlotOrder;
    let nextTimeOfDay = panel.timeOfDay;
    if (!panel.isFlashback) {
      const rank = TIME_OF_DAY_RANK[panel.timeOfDay];
      if (!seenNonFlashback) {
        seenNonFlashback = true;
        lastOrder = panel.timeSlotOrder;
        lastTimeRank = rank;
        lastTimeOfDay = panel.timeOfDay;
      } else {
        if (nextOrder < lastOrder) nextOrder = lastOrder;
        if (rank < lastTimeRank) {
          nextTimeOfDay = lastTimeOfDay;
        } else {
          lastTimeRank = rank;
          lastTimeOfDay = nextTimeOfDay;
        }
        lastOrder = nextOrder;
      }
    }

    const trimmedDialogues: PanelDialogueBubble[] = panel.dialogues
      .slice(0, MAX_BUBBLES_PER_PANEL)
      .map((bubble) => ({
        ...bubble,
        text: {
          ko: clampBubbleLine(bubble.text.ko, MAX_BUBBLE_CHAR_LENGTH),
          en: clampBubbleLine(bubble.text.en, MAX_BUBBLE_CHAR_LENGTH),
        },
      }));

    return {
      ...panel,
      timeSlotOrder: nextOrder,
      timeOfDay: nextTimeOfDay,
      outfitAssignments: fixedOutfits,
      dialogues: trimmedDialogues,
    };
  });

  // Step 2: 샷 단조로움(연속 3컷 동일 샷) 해소
  for (let i = 2; i < repairedPanels.length; i += 1) {
    const prev2 = repairedPanels[i - 2];
    const prev1 = repairedPanels[i - 1];
    const curr = repairedPanels[i];
    if (curr.cameraShot === prev1.cameraShot && prev1.cameraShot === prev2.cameraShot) {
      const nextShot = repairedPanels[i + 1]?.cameraShot;
      repairedPanels[i] = {
        ...curr,
        cameraShot: pickContrastingShot(prev1.cameraShot, nextShot, curr.panelIndex),
      };
    }
  }

  // Step 3: 엔딩 클리프행어 보강
  let repairedBeats: readonly StoryBeatNode[] = plan.storyBeats;
  if (repairedPanels.length > 0) {
    const lastIdx = repairedPanels.length - 1;
    const lastPanel = repairedPanels[lastIdx];
    const leadChar = plan.characters[0];
    const fallbackHookBubble: PanelDialogueBubble | null =
      lastPanel.dialogues.length === 0 && leadChar
        ? {
            id: `${lastPanel.panelId}-hook-dlg`,
            speakerId: leadChar.id,
            speakerName: leadChar.name,
            speechRegister: leadChar.speechRegister,
            kind: "narration",
            text: {
              ko: "그 순간, 숨겨졌던 진짜 판이 열렸다.",
              en: "At that instant, the true trap snapped open.",
            },
          }
        : null;

    repairedPanels[lastIdx] = {
      ...lastPanel,
      act: "cliffhanger",
      isCliffhangerPanel: true,
      tensionScore: Math.max(lastPanel.tensionScore, 94),
      gutterBeforePx: Math.max(lastPanel.gutterBeforePx, 380),
      scrollTempo: "cliffhanger-drop",
      dialogues: fallbackHookBubble ? [fallbackHookBubble] : lastPanel.dialogues,
    };

    const hasCliffBeat = repairedBeats.some((beat) => beat.isCliffhanger);
    if (!hasCliffBeat && repairedBeats.length > 0) {
      repairedBeats = repairedBeats.map((beat, idx) =>
        idx === repairedBeats.length - 1
          ? {
              ...beat,
              act: "cliffhanger",
              isCliffhanger: true,
              tensionScore: Math.max(beat.tensionScore, 94),
            }
          : beat,
      );
    }
  }

  return {
    storyBeats: repairedBeats,
    panels: repairedPanels,
  };
}

/**
 * 워크벤치 및 단위 테스트용: 의도적 연속성 모순 5종을 안전하게 주입해
 * 감사기 검출과 원클릭 자동 교정을 검증한다.
 */
export function injectDemoContinuityFaults(
  plan: CompiledWebtoonEpisodePlan,
): CompiledWebtoonEpisodePlan {
  if (plan.panels.length < 4) return plan;
  const lead = plan.characters[0];
  const mutatedPanels = plan.panels.map((panel, idx) => {
    // 1) 의상 불일치 (2컷)
    if (idx === 1 && lead) {
      return {
        ...panel,
        outfitAssignments: {
          ...panel.outfitAssignments,
          [lead.id]: "outfit-continuity-drift-err",
        },
        cameraShot: "MS" as CameraShotType,
      };
    }
    // 2) 연속 3컷 동일 샷 (1~3컷 모두 MS) + 시간대 역행 (3컷 새벽으로 역행)
    if (idx === 0) {
      return {
        ...panel,
        cameraShot: "MS" as CameraShotType,
        timeOfDay: "night" as TimeOfDayId,
        timeSlotOrder: 4,
      };
    }
    if (idx === 2 && lead) {
      return {
        ...panel,
        cameraShot: "MS" as CameraShotType,
        timeOfDay: "dawn" as TimeOfDayId,
        timeSlotOrder: 0,
        // 3) 말풍선 과밀 (4개 + 48자 초과)
        dialogues: [
          {
            id: `${panel.panelId}-ov-1`,
            speakerId: lead.id,
            speakerName: lead.name,
            speechRegister: lead.speechRegister,
            kind: "speech" as const,
            text: {
              ko: "이 대사는 의도적으로 마흔여덟 글자를 훌쩍 넘겨 말풍선 가독성 경고를 일으키는 장문 테스트 대사입니다.",
              en: "This deliberately oversized dialogue line exceeds forty-eight characters to trigger readability audit alerts.",
            },
          },
          {
            id: `${panel.panelId}-ov-2`,
            speakerId: lead.id,
            speakerName: lead.name,
            speechRegister: lead.speechRegister,
            kind: "speech" as const,
            text: { ko: "둘째 말풍선 추가", en: "Extra bubble two" },
          },
          {
            id: `${panel.panelId}-ov-3`,
            speakerId: lead.id,
            speakerName: lead.name,
            speechRegister: lead.speechRegister,
            kind: "thought" as const,
            text: { ko: "셋째 말풍선 추가", en: "Extra bubble three" },
          },
          {
            id: `${panel.panelId}-ov-4`,
            speakerId: lead.id,
            speakerName: lead.name,
            speechRegister: lead.speechRegister,
            kind: "shout" as const,
            text: { ko: "넷째 초과 말풍선!", en: "Fourth overflow bubble!" },
          },
        ],
      };
    }
    // 4) 마지막 컷 클리프행어 누락
    if (idx === plan.panels.length - 1) {
      return {
        ...panel,
        isCliffhangerPanel: false,
        tensionScore: 32,
      };
    }
    return panel;
  });

  const mutatedBeats = plan.storyBeats.map((beat) => ({
    ...beat,
    isCliffhanger: false,
  }));

  const nextAudit = auditEpisodeContinuity({
    deterministicSeed: plan.deterministicSeed,
    characters: plan.characters,
    storyBeats: mutatedBeats,
    panels: mutatedPanels,
  });

  const updatedStages = plan.stages.map((stage) =>
    stage.stageId === "continuity-audit"
      ? {
          ...stage,
          status: nextAudit.passed ? ("completed" as const) : ("warning" as const),
          artifactCount: nextAudit.findings.length,
        }
      : stage,
  );

  return {
    ...plan,
    storyBeats: mutatedBeats,
    panels: mutatedPanels,
    continuityAudit: nextAudit,
    stages: updatedStages,
  };
}
