import type { StudioDefaultWorkspaceId } from "../studio-workspaces";

import {
  getTooningBackground,
  getTooningCamera,
  getTooningCharacter,
  getTooningGenre,
  getTooningPose,
  getTooningSfx,
  getTooningTone,
  TOONING_BACKGROUNDS,
  TOONING_BUBBLE_STYLES,
  TOONING_CAMERAS,
  TOONING_CHARACTERS,
  TOONING_EXPRESSIONS,
  TOONING_GENRES,
  TOONING_POSES,
  TOONING_SAMPLE_SCENARIOS,
  TOONING_SFX_PRESETS,
  TOONING_TEAM_STAGES,
  TOONING_TONES,
  type TooningBackgroundId,
  type TooningBeatStageId,
  type TooningBubbleStyleId,
  type TooningCameraId,
  type TooningCharacterId,
  type TooningExpressionId,
  type TooningGenreId,
  type TooningLocale,
  type TooningPoseId,
  type TooningProductionMode,
  type TooningSampleScenarioSpec,
  type TooningSfxId,
  type TooningSpeakerPosition,
  type TooningTeamStageId,
  type TooningToneId,
} from "./tooning-plus-allinone-catalog";
import {
  applyToneToDialogue,
  BEAT_STAGE_LABELS,
  buildDialogueForBeat,
  GENRE_BEAT_PRESETS,
  getBeatStagesForCutCount,
  resolveToneOverrides,
} from "./tooning-plus-allinone-stories";

export {
  getTooningBackground,
  getTooningCamera,
  getTooningCharacter,
  getTooningGenre,
  getTooningPose,
  getTooningSfx,
  getTooningTone,
  TOONING_BACKGROUNDS,
  TOONING_BUBBLE_STYLES,
  TOONING_CAMERAS,
  TOONING_CHARACTERS,
  TOONING_EXPRESSIONS,
  TOONING_GENRES,
  TOONING_POSES,
  TOONING_SAMPLE_SCENARIOS,
  TOONING_SFX_PRESETS,
  TOONING_TEAM_STAGES,
  TOONING_TONES,
};

export type {
  TooningBackgroundId,
  TooningBeatStageId,
  TooningBubbleStyleId,
  TooningCameraId,
  TooningCharacterId,
  TooningExpressionId,
  TooningGenreId,
  TooningLocale,
  TooningPoseId,
  TooningProductionMode,
  TooningSampleScenarioSpec,
  TooningSfxId,
  TooningSpeakerPosition,
  TooningTeamStageId,
  TooningToneId,
};

export interface TooningNormalizedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TooningSmartCutLayout {
  readonly bubbleBox: TooningNormalizedRect;
  readonly tailTip: readonly [number, number];
  readonly tailBase: readonly [number, number];
  readonly sfxBox: TooningNormalizedRect;
  readonly characterHeadBox: TooningNormalizedRect;
  readonly hasBubbleCharacterOverlap: boolean;
  readonly hasBubbleSfxOverlap: boolean;
}

export interface TooningSpeakerSlot {
  readonly slotIndex: number;
  readonly characterId: TooningCharacterId;
}

export interface TooningCutSpec {
  readonly cutNumber: number;
  readonly beatStage: TooningBeatStageId;
  readonly beatLabelKo: string;
  readonly beatLabelEn: string;
  readonly characterId: TooningCharacterId;
  readonly speakerPosition: TooningSpeakerPosition;
  readonly poseId: TooningPoseId;
  readonly expressionId: TooningExpressionId;
  readonly cameraId: TooningCameraId;
  readonly backgroundId: TooningBackgroundId;
  readonly dialogueKo: string;
  readonly dialogueEn: string;
  readonly bubbleStyle: TooningBubbleStyleId;
  readonly sfxId: TooningSfxId;
  readonly customEdited: boolean;
  readonly smartLayout: TooningSmartCutLayout;
}

export interface TooningStoryPlanInput {
  readonly keywordKo: string;
  readonly keywordEn: string;
  readonly genreId: TooningGenreId;
  readonly toneId: TooningToneId;
  readonly cutCount: 4 | 6 | 8;
  readonly speakers: readonly TooningSpeakerSlot[];
}

export interface TooningEpisodePlan {
  readonly episodeTitleKo: string;
  readonly episodeTitleEn: string;
  readonly keywordKo: string;
  readonly keywordEn: string;
  readonly genreId: TooningGenreId;
  readonly toneId: TooningToneId;
  readonly cutCount: 4 | 6 | 8;
  readonly speakers: readonly TooningSpeakerSlot[];
  readonly cuts: readonly TooningCutSpec[];
}

export interface Tooning3dCutHandoffSpec {
  readonly cutNumber: number;
  readonly characterId: TooningCharacterId;
  readonly rigAssetKey: string;
  readonly rigClipKey: string;
  readonly stageX: number;
  readonly blendshapes: Readonly<Record<string, number>>;
  readonly camera: {
    readonly presetId: TooningCameraId;
    readonly lensMm: number;
    readonly elevationDeg: number;
    readonly azimuthDeg: number;
    readonly tiltDeg: number;
  };
  readonly background: {
    readonly presetId: TooningBackgroundId;
    readonly scene3dTemplateKey: string;
    readonly lightingMoodKo: string;
    readonly lightingMoodEn: string;
  };
}

export interface Tooning3dStageHandoff {
  readonly schemaVersion: "toonstudio.3d-stage-handoff/1";
  readonly episodeTitleKo: string;
  readonly episodeTitleEn: string;
  readonly totalCuts: number;
  readonly cuts: readonly Tooning3dCutHandoffSpec[];
}

export interface TooningChecklistItemState {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly completed: boolean;
}

export interface TooningTeamStageAssignment {
  readonly stageId: TooningTeamStageId;
  readonly order: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly ownerKo: string;
  readonly ownerEn: string;
  readonly workspacePreset: StudioDefaultWorkspaceId;
  readonly accentOklch: string;
  readonly assignedCutsLabel: string;
  readonly cutNumbers: readonly number[];
  readonly estimatedMinutes: number;
  readonly checklist: readonly TooningChecklistItemState[];
}

export interface TooningTeamDivisionPacket {
  readonly schemaVersion: "toonstudio.allinone-division-packet/1";
  readonly mode: TooningProductionMode;
  readonly episodeTitleKo: string;
  readonly episodeTitleEn: string;
  readonly genreId: TooningGenreId;
  readonly toneId: TooningToneId;
  readonly totalCuts: number;
  readonly totalEstimatedMinutes: number;
  readonly completedChecklistCount: number;
  readonly totalChecklistCount: number;
  readonly stages: readonly TooningTeamStageAssignment[];
  readonly stage3dHandoff: Tooning3dStageHandoff;
  readonly cuts: readonly TooningCutSpec[];
}

export interface TooningCutDirectionPatch {
  readonly characterId?: TooningCharacterId;
  readonly speakerPosition?: TooningSpeakerPosition;
  readonly poseId?: TooningPoseId;
  readonly expressionId?: TooningExpressionId;
  readonly cameraId?: TooningCameraId;
  readonly backgroundId?: TooningBackgroundId;
  readonly bubbleStyle?: TooningBubbleStyleId;
  readonly sfxId?: TooningSfxId;
  readonly dialogueKo?: string;
  readonly dialogueEn?: string;
  readonly customEdited?: boolean;
}

export function rectsOverlap(a: TooningNormalizedRect, b: TooningNormalizedRect, padding = 0): boolean {
  return !(
    a.x + a.width + padding <= b.x ||
    b.x + b.width + padding <= a.x ||
    a.y + a.height + padding <= b.y ||
    b.y + b.height + padding <= a.y
  );
}

export function inferSmartBubbleStyle(
  dialogue: string,
  expressionId: TooningExpressionId,
  toneId: TooningToneId,
  beatStage: TooningBeatStageId,
): TooningBubbleStyleId {
  if (dialogue.includes("!") || dialogue.includes("?!") || expressionId === "anger" || expressionId === "shock") {
    return "shout";
  }
  if (dialogue.includes("…") || dialogue.includes("...") || expressionId === "shy" || expressionId === "tears") {
    return "thought";
  }
  if (beatStage === "intro" && toneId === "serious") {
    return "narration";
  }
  return "normal";
}

export function inferSmartSfx(
  poseId: TooningPoseId,
  expressionId: TooningExpressionId,
  dialogue: string,
  toneId: TooningToneId,
): TooningSfxId {
  if (dialogue.includes("?!") || expressionId === "shock" || poseId === "midair-leap") {
    return "kwang";
  }
  if (poseId === "draw-sword" || expressionId === "anger" || poseId === "point") {
    return "beonjjeok";
  }
  if (expressionId === "shy" || expressionId === "tears" || toneId === "touching") {
    return "dugeun";
  }
  if (poseId === "victory-cheer" || expressionId === "sparkle-awe" || expressionId === "bright-smile") {
    return "banjjak";
  }
  if (toneId === "comic" || poseId === "desk-sit") {
    return "ungseong";
  }
  return getTooningPose(poseId).suggestedSfxId;
}

export function computeSmartBubbleLayout(params: {
  readonly speakerPosition: TooningSpeakerPosition;
  readonly bubbleStyle: TooningBubbleStyleId;
  readonly cameraId: TooningCameraId;
  readonly dialogueLength: number;
}): TooningSmartCutLayout {
  const { speakerPosition, bubbleStyle, cameraId, dialogueLength } = params;
  const camera = getTooningCamera(cameraId);

  const headCenterX = speakerPosition === "left" ? 30 : speakerPosition === "right" ? 70 : 50;
  const headWidth = Math.min(26, Math.round(18 * Math.min(camera.zoom, 1.35)));
  const headHeight = Math.min(26, Math.round(20 * Math.min(camera.zoom, 1.25)));
  const headY = cameraId === "extreme-eyes" ? 40 : 38;
  const characterHeadBox: TooningNormalizedRect = {
    x: Math.max(4, Math.min(96 - headWidth, Math.round(headCenterX - headWidth / 2))),
    y: headY,
    width: headWidth,
    height: headHeight,
  };

  const bubbleHeight = dialogueLength > 34 ? 26 : 22;
  let bubbleBox: TooningNormalizedRect;
  let tailTip: readonly [number, number];
  let tailBase: readonly [number, number];

  if (bubbleStyle === "narration") {
    bubbleBox = { x: 6, y: 5, width: 88, height: Math.min(24, bubbleHeight) };
    tailTip = [headCenterX, headY - 2];
    tailBase = [headCenterX, bubbleBox.y + bubbleBox.height];
  } else if (speakerPosition === "left") {
    bubbleBox = { x: 47, y: 6, width: 47, height: bubbleHeight };
    tailTip = [characterHeadBox.x + characterHeadBox.width + 2, characterHeadBox.y + 5];
    tailBase = [bubbleBox.x + 8, bubbleBox.y + bubbleBox.height - 2];
  } else if (speakerPosition === "right") {
    bubbleBox = { x: 6, y: 6, width: 47, height: bubbleHeight };
    tailTip = [characterHeadBox.x - 2, characterHeadBox.y + 5];
    tailBase = [bubbleBox.x + bubbleBox.width - 8, bubbleBox.y + bubbleBox.height - 2];
  } else {
    bubbleBox = { x: 14, y: 4, width: 72, height: Math.min(25, bubbleHeight) };
    tailTip = [50, characterHeadBox.y - 2];
    tailBase = [50, bubbleBox.y + bubbleBox.height];
  }

  if (rectsOverlap(bubbleBox, characterHeadBox, 2)) {
    const safeHeight = Math.max(16, characterHeadBox.y - 7);
    bubbleBox = { ...bubbleBox, y: 4, height: Math.min(bubbleBox.height, safeHeight) };
  }

  const sfxWidth = 28;
  const sfxHeight = 14;
  const sfxCandidates: readonly TooningNormalizedRect[] =
    speakerPosition === "left"
      ? [
          { x: 64, y: 76, width: sfxWidth, height: sfxHeight },
          { x: 64, y: 42, width: sfxWidth, height: sfxHeight },
          { x: 6, y: 78, width: sfxWidth, height: sfxHeight },
          { x: 64, y: 58, width: sfxWidth, height: sfxHeight },
        ]
      : speakerPosition === "right"
        ? [
            { x: 8, y: 76, width: sfxWidth, height: sfxHeight },
            { x: 8, y: 42, width: sfxWidth, height: sfxHeight },
            { x: 64, y: 78, width: sfxWidth, height: sfxHeight },
            { x: 8, y: 58, width: sfxWidth, height: sfxHeight },
          ]
        : [
            { x: 66, y: 76, width: sfxWidth, height: sfxHeight },
            { x: 6, y: 76, width: sfxWidth, height: sfxHeight },
            { x: 66, y: 42, width: sfxWidth, height: sfxHeight },
            { x: 6, y: 42, width: sfxWidth, height: sfxHeight },
          ];

  const chosenSfxBox =
    sfxCandidates.find(
      (candidate) =>
        !rectsOverlap(candidate, bubbleBox, 2) &&
        !rectsOverlap(candidate, characterHeadBox, 1),
    ) ?? { x: 66, y: 80, width: sfxWidth, height: sfxHeight };

  return {
    bubbleBox,
    tailTip,
    tailBase,
    sfxBox: chosenSfxBox,
    characterHeadBox,
    hasBubbleCharacterOverlap: rectsOverlap(bubbleBox, characterHeadBox, 0),
    hasBubbleSfxOverlap: rectsOverlap(bubbleBox, chosenSfxBox, 0),
  };
}

export function generateTooningEpisodePlan(input: TooningStoryPlanInput): TooningEpisodePlan {
  const genre = getTooningGenre(input.genreId);
  const safeSpeakers: readonly TooningSpeakerSlot[] =
    input.speakers.length >= 2
      ? input.speakers.slice(0, 3)
      : [
          { slotIndex: 0, characterId: genre.defaultCastIds[0] },
          { slotIndex: 1, characterId: genre.defaultCastIds[1] },
        ];

  const beatTemplates = GENRE_BEAT_PRESETS[input.genreId];
  const stageOrder = getBeatStagesForCutCount(input.cutCount);
  const keywordKo = input.keywordKo.trim() || TOONING_SAMPLE_SCENARIOS[0].keywordKo;
  const keywordEn = input.keywordEn.trim() || TOONING_SAMPLE_SCENARIOS[0].keywordEn;

  const cuts: TooningCutSpec[] = stageOrder.map((beatStage, index) => {
    const template = beatTemplates.find((item) => item.stage === beatStage) ?? beatTemplates[index % beatTemplates.length];
    const speakerSlot = safeSpeakers[index % safeSpeakers.length];
    const partnerSlot = safeSpeakers[(index + 1) % safeSpeakers.length];
    const speaker = getTooningCharacter(speakerSlot.characterId);
    const partner = getTooningCharacter(partnerSlot.characterId);

    const dialogue = buildDialogueForBeat(
      input.genreId,
      input.toneId,
      beatStage,
      keywordKo,
      keywordEn,
      speaker.nameKo,
      speaker.nameEn,
      partner.nameKo,
      partner.nameEn,
      index + 1,
    );

    const toneOverrides = resolveToneOverrides(template, input.toneId, index);
    const positionCycle: readonly TooningSpeakerPosition[] = ["left", "right", "center"];
    const speakerPosition = index < 4 ? template.position : positionCycle[index % positionCycle.length];

    const bubbleStyle = inferSmartBubbleStyle(dialogue.ko, toneOverrides.expressionId, input.toneId, beatStage);
    const sfxId = inferSmartSfx(template.poseId, toneOverrides.expressionId, dialogue.ko, input.toneId);
    const smartLayout = computeSmartBubbleLayout({
      speakerPosition,
      bubbleStyle,
      cameraId: toneOverrides.cameraId,
      dialogueLength: dialogue.ko.length,
    });

    const stageMeta = BEAT_STAGE_LABELS[beatStage];

    return {
      cutNumber: index + 1,
      beatStage,
      beatLabelKo: `${stageMeta.ko} · ${template.labelKo.replace(/^[^·]+·\s*/u, "")}`,
      beatLabelEn: `${stageMeta.en} · ${template.labelEn.replace(/^[^·]+·\s*/u, "")}`,
      characterId: speaker.id,
      speakerPosition,
      poseId: template.poseId,
      expressionId: toneOverrides.expressionId,
      cameraId: toneOverrides.cameraId,
      backgroundId: genre.defaultBackgroundId,
      dialogueKo: dialogue.ko,
      dialogueEn: dialogue.en,
      bubbleStyle,
      sfxId,
      customEdited: false,
      smartLayout,
    };
  });

  const tone = getTooningTone(input.toneId);
  return {
    episodeTitleKo: `[${genre.labelKo} · ${tone.labelKo}] ${keywordKo}`,
    episodeTitleEn: `[${genre.labelEn} · ${tone.labelEn}] ${keywordEn}`,
    keywordKo,
    keywordEn,
    genreId: input.genreId,
    toneId: input.toneId,
    cutCount: input.cutCount,
    speakers: safeSpeakers,
    cuts,
  };
}

export function createPlanFromSampleScenario(scenarioId: string): TooningEpisodePlan {
  const scenario =
    TOONING_SAMPLE_SCENARIOS.find((item) => item.id === scenarioId) ?? TOONING_SAMPLE_SCENARIOS[0];
  return generateTooningEpisodePlan({
    keywordKo: scenario.keywordKo,
    keywordEn: scenario.keywordEn,
    genreId: scenario.genreId,
    toneId: scenario.toneId,
    cutCount: scenario.cutCount,
    speakers: [
      { slotIndex: 0, characterId: scenario.castIds[0] },
      { slotIndex: 1, characterId: scenario.castIds[1] },
    ],
  });
}

export function applyToneVariationToPlan(
  plan: TooningEpisodePlan,
  nextToneId: TooningToneId,
): TooningEpisodePlan {
  const regenerated = generateTooningEpisodePlan({
    keywordKo: plan.keywordKo,
    keywordEn: plan.keywordEn,
    genreId: plan.genreId,
    toneId: nextToneId,
    cutCount: plan.cutCount,
    speakers: plan.speakers,
  });

  const mergedCuts = regenerated.cuts.map((freshCut, index) => {
    const prevCut = plan.cuts[index];
    if (!prevCut || !prevCut.customEdited) {
      return freshCut;
    }
    const tonedCustom = applyToneToDialogue(prevCut.dialogueKo, prevCut.dialogueEn, nextToneId, freshCut.cutNumber);
    const bubbleStyle = inferSmartBubbleStyle(tonedCustom.ko, freshCut.expressionId, nextToneId, freshCut.beatStage);
    const sfxId = inferSmartSfx(prevCut.poseId, freshCut.expressionId, tonedCustom.ko, nextToneId);
    return {
      ...freshCut,
      characterId: prevCut.characterId,
      poseId: prevCut.poseId,
      backgroundId: prevCut.backgroundId,
      dialogueKo: tonedCustom.ko,
      dialogueEn: tonedCustom.en,
      bubbleStyle,
      sfxId,
      customEdited: true,
      smartLayout: computeSmartBubbleLayout({
        speakerPosition: prevCut.speakerPosition,
        bubbleStyle,
        cameraId: freshCut.cameraId,
        dialogueLength: tonedCustom.ko.length,
      }),
    };
  });

  return { ...regenerated, cuts: mergedCuts };
}

export function updatePlanCut(
  plan: TooningEpisodePlan,
  cutNumber: number,
  patch: TooningCutDirectionPatch,
): TooningEpisodePlan {
  const nextCuts = plan.cuts.map((cut) => {
    if (cut.cutNumber !== cutNumber) {
      return cut;
    }
    const nextDialogueKo = patch.dialogueKo ?? cut.dialogueKo;
    const nextDialogueEn = patch.dialogueEn ?? cut.dialogueEn;
    const nextSpeakerPosition = patch.speakerPosition ?? cut.speakerPosition;
    const nextPoseId = patch.poseId ?? cut.poseId;
    const nextExpressionId = patch.expressionId ?? cut.expressionId;
    const nextCameraId = patch.cameraId ?? cut.cameraId;
    const nextBubbleStyle =
      patch.bubbleStyle ??
      (patch.expressionId || patch.dialogueKo
        ? inferSmartBubbleStyle(nextDialogueKo, nextExpressionId, plan.toneId, cut.beatStage)
        : cut.bubbleStyle);
    const nextSfxId =
      patch.sfxId ??
      (patch.poseId || patch.expressionId
        ? inferSmartSfx(nextPoseId, nextExpressionId, nextDialogueKo, plan.toneId)
        : cut.sfxId);

    return {
      ...cut,
      characterId: patch.characterId ?? cut.characterId,
      speakerPosition: nextSpeakerPosition,
      poseId: nextPoseId,
      expressionId: nextExpressionId,
      cameraId: nextCameraId,
      backgroundId: patch.backgroundId ?? cut.backgroundId,
      dialogueKo: nextDialogueKo,
      dialogueEn: nextDialogueEn,
      bubbleStyle: nextBubbleStyle,
      sfxId: nextSfxId,
      customEdited: patch.customEdited ?? cut.customEdited,
      smartLayout: computeSmartBubbleLayout({
        speakerPosition: nextSpeakerPosition,
        bubbleStyle: nextBubbleStyle,
        cameraId: nextCameraId,
        dialogueLength: nextDialogueKo.length,
      }),
    };
  });

  return { ...plan, cuts: nextCuts };
}

export function autoArrangeAllPlanCuts(plan: TooningEpisodePlan): TooningEpisodePlan {
  const positions: readonly TooningSpeakerPosition[] = ["left", "right", "center"];
  const nextCuts = plan.cuts.map((cut, index) => {
    const speakerPosition = positions[index % positions.length];
    const bubbleStyle = inferSmartBubbleStyle(cut.dialogueKo, cut.expressionId, plan.toneId, cut.beatStage);
    const sfxId = inferSmartSfx(cut.poseId, cut.expressionId, cut.dialogueKo, plan.toneId);
    return {
      ...cut,
      speakerPosition,
      bubbleStyle,
      sfxId,
      smartLayout: computeSmartBubbleLayout({
        speakerPosition,
        bubbleStyle,
        cameraId: cut.cameraId,
        dialogueLength: cut.dialogueKo.length,
      }),
    };
  });

  return { ...plan, cuts: nextCuts };
}

export function buildTooning3dStageHandoff(plan: TooningEpisodePlan): Tooning3dStageHandoff {
  return {
    schemaVersion: "toonstudio.3d-stage-handoff/1",
    episodeTitleKo: plan.episodeTitleKo,
    episodeTitleEn: plan.episodeTitleEn,
    totalCuts: plan.cuts.length,
    cuts: plan.cuts.map((cut) => {
      const character = getTooningCharacter(cut.characterId);
      const pose = getTooningPose(cut.poseId);
      const expression = TOONING_EXPRESSIONS.find((item) => item.id === cut.expressionId) ?? TOONING_EXPRESSIONS[0];
      const camera = getTooningCamera(cut.cameraId);
      const background = getTooningBackground(cut.backgroundId);
      const stageX = cut.speakerPosition === "left" ? -0.9 : cut.speakerPosition === "right" ? 0.9 : 0;

      return {
        cutNumber: cut.cutNumber,
        characterId: cut.characterId,
        rigAssetKey: character.rigAssetKey,
        rigClipKey: pose.rigClipKey,
        stageX,
        blendshapes: expression.blendshapePreset,
        camera: {
          presetId: camera.id,
          lensMm: camera.lensMm,
          elevationDeg: camera.elevationDeg,
          azimuthDeg: camera.azimuthDeg,
          tiltDeg: camera.tiltDeg,
        },
        background: {
          presetId: background.id,
          scene3dTemplateKey: background.scene3dTemplateKey,
          lightingMoodKo: background.lightingMoodKo,
          lightingMoodEn: background.lightingMoodEn,
        },
      };
    }),
  };
}

export function buildTeamDivisionHandoffPacket(
  plan: TooningEpisodePlan,
  mode: TooningProductionMode,
  completedChecklistIds: ReadonlySet<string>,
): TooningTeamDivisionPacket {
  const allCutNumbers = plan.cuts.map((cut) => cut.cutNumber);
  const firstCut = allCutNumbers[0] ?? 1;
  const lastCut = allCutNumbers[allCutNumbers.length - 1] ?? 4;
  const rangeLabel = `CUT 0${firstCut}~0${lastCut}`;

  let completedChecklistCount = 0;
  let totalChecklistCount = 0;

  const stages: TooningTeamStageAssignment[] = TOONING_TEAM_STAGES.map((stage) => {
    const checklist: TooningChecklistItemState[] = stage.checklistKo.map((labelKo, idx) => {
      const id = `${stage.id}-${idx + 1}`;
      const completed = completedChecklistIds.has(id);
      if (completed) completedChecklistCount += 1;
      totalChecklistCount += 1;
      return {
        id,
        labelKo,
        labelEn: stage.checklistEn[idx] ?? labelKo,
        completed,
      };
    });

    return {
      stageId: stage.id,
      order: stage.order,
      labelKo: stage.labelKo,
      labelEn: stage.labelEn,
      ownerKo: mode === "team" ? stage.roleOwnerKo : stage.soloOwnerKo,
      ownerEn: mode === "team" ? stage.roleOwnerEn : stage.soloOwnerEn,
      workspacePreset: stage.workspacePreset,
      accentOklch: stage.accentOklch,
      assignedCutsLabel: rangeLabel,
      cutNumbers: allCutNumbers,
      estimatedMinutes: stage.minutesPerCut * plan.cuts.length,
      checklist,
    };
  });

  const totalEstimatedMinutes = stages.reduce((acc, item) => acc + item.estimatedMinutes, 0);

  return {
    schemaVersion: "toonstudio.allinone-division-packet/1",
    mode,
    episodeTitleKo: plan.episodeTitleKo,
    episodeTitleEn: plan.episodeTitleEn,
    genreId: plan.genreId,
    toneId: plan.toneId,
    totalCuts: plan.cuts.length,
    totalEstimatedMinutes,
    completedChecklistCount,
    totalChecklistCount,
    stages,
    stage3dHandoff: buildTooning3dStageHandoff(plan),
    cuts: plan.cuts,
  };
}

export function buildStudio2dFountainScript(plan: TooningEpisodePlan, locale: TooningLocale): string {
  const ko = locale === "ko";
  return plan.cuts
    .map((cut) => {
      const char = getTooningCharacter(cut.characterId);
      const pose = getTooningPose(cut.poseId);
      const camera = getTooningCamera(cut.cameraId);
      const sfx = getTooningSfx(cut.sfxId);
      const aspect = cut.cameraId === "full-wide" ? "9:16" : cut.cameraId === "close-up" ? "1:1" : "4:5";
      const speakerLabel = ko ? `${char.nameKo}(DNA-90${cut.cutNumber})` : `${char.nameEn}(DNA-90${cut.cutNumber})`;
      const dialogue = ko ? cut.dialogueKo : cut.dialogueEn;
      const sfxText = ko ? sfx.textKo : sfx.textEn;
      const shot = ko ? camera.labelKo : camera.labelEn;
      const poseText = ko ? pose.labelKo : pose.labelEn;
      return [
        `## PANEL ${cut.cutNumber} | Shot: ${shot} | 3D Pose: ${poseText} | Aspect: ${aspect}`,
        `@${speakerLabel}: ${dialogue}`,
        `!SFX: ${sfxText}`,
      ].join("\n");
    })
    .join("\n");
}

export function serializeTooningPacketToText(
  packet: TooningTeamDivisionPacket,
  locale: TooningLocale,
): string {
  const ko = locale === "ko";
  const header = ko
    ? [
        `=== ${packet.episodeTitleKo} ===`,
        `제작 방식: ${packet.mode === "team" ? "6단계 팀 분업" : "1인 올인원"} · 총 ${packet.totalCuts}컷 · 예상 ${packet.totalEstimatedMinutes}분`,
        `체크리스트 진행: ${packet.completedChecklistCount}/${packet.totalChecklistCount}`,
      ]
    : [
        `=== ${packet.episodeTitleEn} ===`,
        `Mode: ${packet.mode === "team" ? "6-Stage Team Division" : "Solo All-in-One"} · ${packet.totalCuts} cuts · Est. ${packet.totalEstimatedMinutes}m`,
        `Checklist Progress: ${packet.completedChecklistCount}/${packet.totalChecklistCount}`,
      ];

  const cutLines = packet.cuts.map((cut) => {
    const char = getTooningCharacter(cut.characterId);
    const pose = getTooningPose(cut.poseId);
    const expr = TOONING_EXPRESSIONS.find((item) => item.id === cut.expressionId) ?? TOONING_EXPRESSIONS[0];
    const cam = getTooningCamera(cut.cameraId);
    const bg = getTooningBackground(cut.backgroundId);
    const sfx = getTooningSfx(cut.sfxId);
    if (ko) {
      return `CUT 0${cut.cutNumber} [${cut.beatLabelKo}] ${char.nameKo} · ${pose.labelKo} · ${expr.labelKo} · ${cam.labelKo} · ${bg.labelKo} | "${cut.dialogueKo}" | SFX ${sfx.textKo}`;
    }
    return `CUT 0${cut.cutNumber} [${cut.beatLabelEn}] ${char.nameEn} · ${pose.labelEn} · ${expr.labelEn} · ${cam.labelEn} · ${bg.labelEn} | "${cut.dialogueEn}" | SFX ${sfx.textEn}`;
  });

  const stageLines = packet.stages.map((stage) =>
    ko
      ? `${stage.order}. ${stage.labelKo} (${stage.ownerKo}, ${stage.assignedCutsLabel}, ${stage.estimatedMinutes}분)`
      : `${stage.order}. ${stage.labelEn} (${stage.ownerEn}, ${stage.assignedCutsLabel}, ${stage.estimatedMinutes}m)`,
  );

  return [...header, "", ...cutLines, "", ...stageLines].join("\n");
}

export function serializeTooningPacketToJson(packet: TooningTeamDivisionPacket): string {
  return JSON.stringify(packet, null, 2);
}
