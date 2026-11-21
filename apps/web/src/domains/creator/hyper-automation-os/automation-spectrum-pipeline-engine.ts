import {
  computeLightballShading,
  createCharacterDnaProfile,
  updateCharacterDnaSelection,
  type CharacterAngleId,
  type CharacterDnaProfile,
  type CharacterExpressionId,
  type LightballShadingState,
} from "./character-dna-lightball-engine";
import {
  AUTOMATION_SPECTRUM_PROFILES,
  DEFAULT_STAGE_AUTONOMY_BY_MODE,
  GENRE_BLUEPRINTS,
  STAGE_META,
  clampAutonomyPercent,
  computeAverageAutonomyPercent,
  normalizeStageAutonomy,
  type AutomationSpectrumMode,
  type AutomationSpectrumProfile,
  type MasterLayerId,
  type OklchSwatch,
  type OptionalBriefField,
  type PipelineStageId,
  type PipelineStageStatus,
  type StageAutonomyMap,
} from "./hyper-automation-catalog";
import {
  autoFillHyperAutomationInput,
  buildMasterLayers,
  buildPlatformChecks,
  buildStageSummaryAndMetrics,
  buildStoryboardCuts,
  clampInt,
  restoreAutoFillSnapshot,
  validateRequiredMinimalInput,
  type AutoFilledFieldMeta,
  type HyperAutomationRawInput,
  type MasterEditableLayer,
  type MasterLayerPatch,
  type PipelineStageState,
  type PlatformSpecCheck,
  type ResolvedHyperAutomationInput,
  type StoryboardCutPlan,
} from "./minimal-input-autofill-engine";

export {
  autoFillHyperAutomationInput,
  restoreAutoFillSnapshot,
  validateRequiredMinimalInput,
  type AutoFilledFieldMeta,
  type HyperAutomationRawInput,
  type PipelineStageState,
};

export interface HyperAutomationPipelineRun {
  readonly runId: string;
  readonly mode: AutomationSpectrumMode;
  readonly automationPercent: number;
  readonly stageAutonomy: StageAutonomyMap;
  readonly resolvedInput: ResolvedHyperAutomationInput;
  readonly autoFilledFields: readonly AutoFilledFieldMeta[];
  readonly userProvidedFields: readonly OptionalBriefField[];
  readonly undoSnapshot: HyperAutomationRawInput;
  readonly episodeTitle: string;
  readonly logline: string;
  readonly acts: readonly [string, string, string];
  readonly climaxHook: string;
  readonly cuts: readonly StoryboardCutPlan[];
  readonly paletteSwatches: readonly OklchSwatch[];
  readonly characterDna: CharacterDnaProfile;
  readonly lightball: LightballShadingState;
  readonly platformChecks: readonly PlatformSpecCheck[];
  readonly mobileReadabilityScore: number;
  readonly stages: readonly PipelineStageState[];
  readonly masterLayers: readonly MasterEditableLayer[];
  readonly protectedStageIds: readonly PipelineStageId[];
  readonly losslessLayerSeparation: true;
  readonly manualControlOpen: true;
}

interface SingleStageRerunResult {
  readonly run: HyperAutomationPipelineRun;
  readonly skippedBecauseLocked: boolean;
  readonly message: string;
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function getSpectrumProfile(mode: AutomationSpectrumMode): AutomationSpectrumProfile {
  return AUTOMATION_SPECTRUM_PROFILES.find((item) => item.mode === mode) ?? AUTOMATION_SPECTRUM_PROFILES[2];
}

export function runHyperAutomationPipeline(options: {
  readonly input: HyperAutomationRawInput;
  readonly mode: AutomationSpectrumMode;
  readonly stageAutonomy?: Partial<StageAutonomyMap>;
  readonly previousRun?: HyperAutomationPipelineRun | null;
  readonly variationSeed?: number;
}): HyperAutomationPipelineRun {
  const validation = validateRequiredMinimalInput(options.input);
  if (!validation.valid) {
    throw new Error(validation.message ?? "아이디어 한 줄이 필요합니다.");
  }

  const profile = getSpectrumProfile(options.mode);
  const filled = autoFillHyperAutomationInput(options.input);
  const { resolved } = filled;
  const blueprint = GENRE_BLUEPRINTS[resolved.genre];
  const previousRun = options.previousRun ?? null;
  const seed = options.variationSeed ?? ((previousRun?.stages[0]?.lastSeed ?? 0) + 1);
  const prevStageById = new Map((previousRun?.stages ?? []).map((stage) => [stage.id, stage] as const));

  const stageAutonomy = normalizeStageAutonomy(
    previousRun?.stageAutonomy ?? DEFAULT_STAGE_AUTONOMY_BY_MODE[options.mode],
    options.stageAutonomy,
  );
  const automationPercent = options.stageAutonomy || previousRun
    ? computeAverageAutonomyPercent(stageAutonomy)
    : profile.percent;

  const characterDna = previousRun?.characterDna ?? createCharacterDnaProfile({
    protagonistProfile: resolved.protagonistProfile,
    genreCode: resolved.genre,
  });

  const lightball = previousRun?.lightball ?? computeLightballShading({
    azimuthDeg: (35 + seed * 17) % 360,
    elevationDeg: 38,
    keyIntensity: 84,
    keyColorOklch: blueprint.swatches[1]?.value,
    rimColorOklch: blueprint.swatches[3]?.value,
    shadowColorOklch: blueprint.swatches[2]?.value,
  });

  const storyboardLocked = prevStageById.get("director-storyboard")?.manualLocked === true;
  const cuts = storyboardLocked && previousRun ? previousRun.cuts : buildStoryboardCuts(resolved, blueprint, seed);

  const preflightLocked = prevStageById.get("platform-preflight")?.manualLocked === true;
  const platformChecks = preflightLocked && previousRun
    ? previousRun.platformChecks
    : buildPlatformChecks(resolved, seed);

  const mobileReadabilityScore = Math.round(
    platformChecks.reduce((acc, item) => acc + item.readabilityScore, 0) / platformChecks.length,
  );

  const protectedStageIds: PipelineStageId[] = [];
  const stages: PipelineStageState[] = STAGE_META.map((meta) => {
    const prev = prevStageById.get(meta.id);
    const autonomy = stageAutonomy[meta.id];
    if (prev && prev.manualLocked) {
      protectedStageIds.push(meta.id);
      return {
        ...prev,
        status: "locked-protected",
      };
    }

    const generated = buildStageSummaryAndMetrics(
      meta.id,
      resolved,
      blueprint,
      autonomy,
      cuts,
      platformChecks,
      characterDna,
      lightball,
      seed,
    );
    const shouldLockByDefault = !previousRun && profile.defaultLockedStages.includes(meta.id);
    const status: PipelineStageStatus = shouldLockByDefault
      ? "locked-protected"
      : autonomy === 0 && meta.id !== "layered-master-output"
        ? "manual-edited"
        : "generated";

    return {
      id: meta.id,
      order: meta.order,
      title: meta.title,
      subtitle: meta.subtitle,
      status,
      manualLocked: shouldLockByDefault,
      autonomyPercent: autonomy,
      generationCount: (prev?.generationCount ?? 0) + 1,
      lastSeed: seed,
      summary: generated.summary,
      metrics: generated.metrics,
      manualOverrideNote: prev?.manualOverrideNote ?? null,
    };
  });

  const masterStageLocked = prevStageById.get("layered-master-output")?.manualLocked === true;
  const masterLayers = buildMasterLayers(resolved, blueprint, lightball, previousRun?.masterLayers, masterStageLocked);

  const storyLocked = prevStageById.get("story-plot")?.manualLocked === true;
  const shortTitle = resolved.ideaLine.length > 26 ? `${resolved.ideaLine.slice(0, 26)}…` : resolved.ideaLine;
  const episodeTitle = storyLocked && previousRun ? previousRun.episodeTitle : `EP.01 ${shortTitle}`;
  const logline = storyLocked && previousRun
    ? previousRun.logline
    : `${resolved.backgroundTheme}에서 ${resolved.protagonistProfile}이(가) "${resolved.ideaLine}" 사건의 중심에 선다.`;
  const acts: readonly [string, string, string] = storyLocked && previousRun
    ? previousRun.acts
    : [
        `1막 도입: ${resolved.backgroundTheme}의 평온이 깨지고 첫 징후가 포착된다.`,
        `2막 갈등: ${resolved.characterCount}명 사이의 이해관계가 충돌하며 반전의 단서가 드러난다.`,
        `3막 절정: 클라이맥스 컷에서 주인공이 규율을 깨고 다음 화로 직결되는 선택을 내린다.`,
      ];
  const climaxHook = storyLocked && previousRun
    ? previousRun.climaxHook
    : `마지막 컷 직전, "${resolved.ideaLine}"의 숨겨진 배후가 주인공의 이름을 부른다.`;

  const runHash = stableHash(`${resolved.ideaLine}:${options.mode}:${seed}`).toString(36).slice(0, 6);

  return {
    runId: `hyper-${runHash}-${seed}`,
    mode: options.mode,
    automationPercent,
    stageAutonomy,
    resolvedInput: resolved,
    autoFilledFields: filled.autoFilledFields,
    userProvidedFields: filled.userProvidedFields,
    undoSnapshot: filled.undoSnapshot,
    episodeTitle,
    logline,
    acts,
    climaxHook,
    cuts,
    paletteSwatches: blueprint.swatches,
    characterDna,
    lightball,
    platformChecks,
    mobileReadabilityScore,
    stages,
    masterLayers,
    protectedStageIds,
    losslessLayerSeparation: true,
    manualControlOpen: true,
  };
}

export function toggleStageManualLock(
  run: HyperAutomationPipelineRun,
  stageId: PipelineStageId,
): HyperAutomationPipelineRun {
  const stages = run.stages.map((stage) => {
    if (stage.id !== stageId) return stage;
    const nextLocked = !stage.manualLocked;
    return {
      ...stage,
      manualLocked: nextLocked,
      status: nextLocked
        ? ("locked-protected" as const)
        : stage.manualOverrideNote
          ? ("manual-edited" as const)
          : ("generated" as const),
    };
  });
  return {
    ...run,
    stages,
    protectedStageIds: stages.filter((stage) => stage.manualLocked).map((stage) => stage.id),
  };
}

export function setStageAutonomyPercent(
  run: HyperAutomationPipelineRun,
  stageId: PipelineStageId,
  percent: number,
): HyperAutomationPipelineRun {
  const clamped = clampAutonomyPercent(percent);
  const stageAutonomy = normalizeStageAutonomy(run.stageAutonomy, { [stageId]: clamped });
  const blueprint = GENRE_BLUEPRINTS[run.resolvedInput.genre];
  const stages = run.stages.map((stage) => {
    if (stage.id !== stageId) return stage;
    if (stage.manualLocked) {
      return { ...stage, autonomyPercent: clamped };
    }
    const updated = buildStageSummaryAndMetrics(
      stage.id,
      run.resolvedInput,
      blueprint,
      clamped,
      run.cuts,
      run.platformChecks,
      run.characterDna,
      run.lightball,
      stage.lastSeed,
    );
    return {
      ...stage,
      autonomyPercent: clamped,
      summary: updated.summary,
      metrics: updated.metrics,
    };
  });
  return {
    ...run,
    stageAutonomy,
    automationPercent: computeAverageAutonomyPercent(stageAutonomy),
    stages,
  };
}

export function applyArtistAutonomyPreset(
  run: HyperAutomationPipelineRun,
  presetAutonomy: StageAutonomyMap,
): HyperAutomationPipelineRun {
  const stageAutonomy = normalizeStageAutonomy(presetAutonomy);
  const blueprint = GENRE_BLUEPRINTS[run.resolvedInput.genre];
  const stages = run.stages.map((stage) => {
    const autonomy = stageAutonomy[stage.id];
    if (stage.manualLocked) {
      return { ...stage, autonomyPercent: autonomy };
    }
    const updated = buildStageSummaryAndMetrics(
      stage.id,
      run.resolvedInput,
      blueprint,
      autonomy,
      run.cuts,
      run.platformChecks,
      run.characterDna,
      run.lightball,
      stage.lastSeed,
    );
    return {
      ...stage,
      autonomyPercent: autonomy,
      summary: updated.summary,
      metrics: updated.metrics,
    };
  });
  return {
    ...run,
    stageAutonomy,
    automationPercent: computeAverageAutonomyPercent(stageAutonomy),
    stages,
  };
}

export function rerunSinglePipelineStage(
  run: HyperAutomationPipelineRun,
  stageId: PipelineStageId,
): SingleStageRerunResult {
  const target = run.stages.find((stage) => stage.id === stageId);
  if (!target) {
    return { run, skippedBecauseLocked: false, message: "대상 단계를 찾지 못했습니다." };
  }
  if (target.manualLocked) {
    return {
      run,
      skippedBecauseLocked: true,
      message: `"${target.title}" 단계는 수동 잠금 상태라 보호됩니다. 잠금을 해제한 뒤 다시 생성하세요.`,
    };
  }

  const nextSeed = target.lastSeed + 1;
  const blueprint = GENRE_BLUEPRINTS[run.resolvedInput.genre];
  const nextCuts = stageId === "director-storyboard"
    ? buildStoryboardCuts(run.resolvedInput, blueprint, nextSeed)
    : run.cuts;
  const nextChecks = stageId === "platform-preflight"
    ? buildPlatformChecks(run.resolvedInput, nextSeed)
    : run.platformChecks;
  const nextReadability = Math.round(
    nextChecks.reduce((acc, item) => acc + item.readabilityScore, 0) / nextChecks.length,
  );
  const nextLayers = stageId === "layered-master-output"
    ? buildMasterLayers(run.resolvedInput, blueprint, run.lightball, run.masterLayers, false)
    : run.masterLayers;

  const generated = buildStageSummaryAndMetrics(
    stageId,
    run.resolvedInput,
    blueprint,
    target.autonomyPercent,
    nextCuts,
    nextChecks,
    run.characterDna,
    run.lightball,
    nextSeed,
  );

  const stages = run.stages.map((stage) => {
    if (stage.id !== stageId) return stage;
    return {
      ...stage,
      status: "generated" as const,
      generationCount: stage.generationCount + 1,
      lastSeed: nextSeed,
      summary: generated.summary,
      metrics: generated.metrics,
    };
  });

  return {
    run: {
      ...run,
      cuts: nextCuts,
      platformChecks: nextChecks,
      mobileReadabilityScore: nextReadability,
      masterLayers: nextLayers,
      stages,
    },
    skippedBecauseLocked: false,
    message: `"${target.title}" 단계만 v${target.generationCount + 1}(변주 #${nextSeed})로 다시 생성했습니다.`,
  };
}

export function switchRunAutomationSpectrum(
  run: HyperAutomationPipelineRun,
  nextMode: AutomationSpectrumMode,
): HyperAutomationPipelineRun {
  const profile = getSpectrumProfile(nextMode);
  const stageAutonomy = DEFAULT_STAGE_AUTONOMY_BY_MODE[nextMode];
  return {
    ...run,
    mode: nextMode,
    automationPercent: profile.percent,
    stageAutonomy,
    stages: run.stages.map((stage) => ({
      ...stage,
      autonomyPercent: stageAutonomy[stage.id],
    })),
  };
}

export function updateRunCharacterDna(
  run: HyperAutomationPipelineRun,
  patch: {
    readonly selectedAngleId?: CharacterAngleId;
    readonly selectedExpressionId?: CharacterExpressionId;
    readonly consistencyLock?: boolean;
  },
): HyperAutomationPipelineRun {
  return {
    ...run,
    characterDna: updateCharacterDnaSelection(run.characterDna, patch),
  };
}

export function updateRunLightball(
  run: HyperAutomationPipelineRun,
  patch: {
    readonly azimuthDeg?: number;
    readonly elevationDeg?: number;
    readonly keyIntensity?: number;
  },
): HyperAutomationPipelineRun {
  const nextLightball = computeLightballShading({
    azimuthDeg: patch.azimuthDeg ?? run.lightball.azimuthDeg,
    elevationDeg: patch.elevationDeg ?? run.lightball.elevationDeg,
    keyIntensity: patch.keyIntensity ?? run.lightball.keyIntensity,
    keyColorOklch: run.lightball.keyColorOklch,
    rimColorOklch: run.lightball.rimColorOklch,
    shadowColorOklch: run.lightball.shadowColorOklch,
  });
  const blueprint = GENRE_BLUEPRINTS[run.resolvedInput.genre];
  const stages = run.stages.map((stage) => {
    if (stage.id !== "lighting-harmonizer" || stage.manualLocked) return stage;
    const synced = buildStageSummaryAndMetrics(
      "lighting-harmonizer",
      run.resolvedInput,
      blueprint,
      stage.autonomyPercent,
      run.cuts,
      run.platformChecks,
      run.characterDna,
      nextLightball,
      stage.lastSeed,
    );
    return {
      ...stage,
      summary: synced.summary,
      metrics: synced.metrics,
    };
  });
  const masterLayers = run.masterLayers.map((layer) => {
    if (layer.id !== "04_SHADE_LIGHT" || layer.manualLocked) return layer;
    return {
      ...layer,
      roleDescription: `3D 라이트볼 방위 ${nextLightball.azimuthDeg}° · 고도 ${nextLightball.elevationDeg}° · 림 ${nextLightball.rimLightPercent}% + 접촉음영 ${nextLightball.contactShadowPercent}%`,
    };
  });
  return {
    ...run,
    lightball: nextLightball,
    stages,
    masterLayers,
  };
}

export function updateMasterLayer(
  run: HyperAutomationPipelineRun,
  layerId: MasterLayerId,
  patch: MasterLayerPatch,
): HyperAutomationPipelineRun {
  const masterLayers = run.masterLayers.map((layer) => {
    if (layer.id !== layerId) return layer;
    return {
      ...layer,
      visible: patch.visible ?? layer.visible,
      manualLocked: patch.manualLocked ?? layer.manualLocked,
      opacity: patch.opacity !== undefined ? clampInt(patch.opacity, 0, 100) : layer.opacity,
      blendMode: patch.blendMode ?? layer.blendMode,
      manualNotes: patch.manualNotes ?? layer.manualNotes,
      editCount: layer.editCount + 1,
    };
  });
  return {
    ...run,
    masterLayers,
  };
}
