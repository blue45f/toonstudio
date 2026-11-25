import { z } from "zod";

export const EXTENDED_ASSIST_MODES = [
  "character-bible-forge",
  "continuity-plot-audit",
  "bg3d-camera-blocking",
  "color-mood-director",
  "sfx-onomatopoeia-lab",
  "photoshop-fx-recipe",
  "scroll-pacing-auditor",
  "thumbnail-hook-optimizer",
  "localization-glossary-check",
  "mcp-workflow-macro",
] as const;

export type ExtendedAssistMode = (typeof EXTENDED_ASSIST_MODES)[number];

export const CharacterBibleForgeOutputSchema = z
  .object({
    characterName: z.string().min(1).max(80),
    archetypeKo: z.string().min(1).max(100),
    speechTone: z.string().min(1).max(240),
    appearancePalette: z.string().min(1).max(240),
    coreMotivation: z.string().min(1).max(280),
    forbiddenLines: z.array(z.string().min(1).max(140)).min(2).max(5),
    relationshipHooks: z
      .array(
        z
          .object({
            target: z.string().min(1).max(60),
            dynamic: z.string().min(1).max(220),
          })
          .strict(),
      )
      .min(1)
      .max(5),
    visualConsistencyCue: z.string().min(1).max(240),
  })
  .strict();

export const ContinuityPlotAuditOutputSchema = z
  .object({
    overallConsistencyScore: z.number().int().min(0).max(100),
    summary: z.string().min(1).max(320),
    issues: z
      .array(
        z
          .object({
            severity: z.enum(["critical", "warn", "tip"]),
            category: z.string().min(1).max(60),
            locationHint: z.string().min(1).max(120),
            conflictDetail: z.string().min(1).max(280),
            fixSuggestion: z.string().min(1).max(280),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();

export const Bg3dCameraBlockingOutputSchema = z
  .object({
    sceneSummary: z.string().min(1).max(280),
    camera: z
      .object({
        lensMm: z.number().min(12).max(200),
        fovDeg: z.number().min(10).max(120),
        angleLabel: z.string().min(1).max(80),
        position: z.tuple([z.number(), z.number(), z.number()]),
        target: z.tuple([z.number(), z.number(), z.number()]),
        rollDeg: z.number().min(-45).max(45),
      })
      .strict(),
    lighting: z
      .object({
        timeOfDay: z.string().min(1).max(60),
        keyLightColor: z.string().min(1).max(60),
        rimLightNote: z.string().min(1).max(180),
        ambientRatio: z.number().min(0).max(1),
      })
      .strict(),
    propsToPlace: z.array(z.string().min(1).max(120)).min(2).max(8),
    blockingNotes: z.array(z.string().min(1).max(220)).min(2).max(6),
  })
  .strict();

export const ColorMoodDirectorOutputSchema = z
  .object({
    emotionLabel: z.string().min(1).max(80),
    moodSummary: z.string().min(1).max(280),
    palette: z
      .array(
        z
          .object({
            role: z.string().min(1).max(40),
            nameKo: z.string().min(1).max(60),
            oklch: z.string().min(1).max(60),
            usageTip: z.string().min(1).max(200),
          })
          .strict(),
      )
      .min(3)
      .max(6),
    lightingGuide: z.string().min(1).max(280),
    contrastWarning: z.string().min(1).max(220),
  })
  .strict();

export const SfxOnomatopoeiaLabOutputSchema = z
  .object({
    sceneEnergy: z.string().min(1).max(120),
    suggestions: z
      .array(
        z
          .object({
            ko: z.string().min(1).max(40),
            ja: z.string().min(1).max(40),
            en: z.string().min(1).max(40),
            intent: z.string().min(1).max(160),
            typographyTip: z.string().min(1).max(180),
            placementHint: z.string().min(1).max(160),
          })
          .strict(),
      )
      .min(2)
      .max(6),
  })
  .strict();

export const PhotoshopFxRecipeOutputSchema = z
  .object({
    lookNameKo: z.string().min(1).max(100),
    summary: z.string().min(1).max(280),
    layerStyles: z
      .array(
        z
          .object({
            effect: z.string().min(1).max(60),
            blendMode: z.string().min(1).max(40),
            opacityPct: z.number().int().min(0).max(100),
            paramsSummary: z.string().min(1).max(200),
          })
          .strict(),
      )
      .min(2)
      .max(6),
    cameraRaw: z
      .object({
        exposure: z.number().min(-4).max(4),
        contrast: z.number().int().min(-100).max(100),
        clarity: z.number().int().min(-100).max(100),
        dehaze: z.number().int().min(-100).max(100),
        temperatureShift: z.number().int().min(-100).max(100),
        grainPct: z.number().int().min(0).max(100),
      })
      .strict(),
    nonDestructiveTip: z.string().min(1).max(240),
  })
  .strict();

export const ScrollPacingAuditorOutputSchema = z
  .object({
    rhythmVerdict: z.string().min(1).max(260),
    averageGapPx: z.number().int().min(40).max(1_600),
    cliffhangerScore: z.number().int().min(0).max(100),
    cliffhangerTip: z.string().min(1).max(240),
    beatPacing: z
      .array(
        z
          .object({
            section: z.string().min(1).max(80),
            pacing: z.enum(["tight", "steady", "breath", "drop"]),
            recommendedGapPx: z.number().int().min(40).max(1_600),
            readerRetentionNote: z.string().min(1).max(220),
          })
          .strict(),
      )
      .min(2)
      .max(6),
  })
  .strict();

export const ThumbnailHookOptimizerOutputSchema = z
  .object({
    hookDiagnosis: z.string().min(1).max(260),
    titleVariants: z
      .array(
        z
          .object({
            variantLabel: z.string().min(1).max(40),
            title: z.string().min(1).max(100),
            subCopy: z.string().min(1).max(140),
            hookReason: z.string().min(1).max(200),
          })
          .strict(),
      )
      .min(2)
      .max(4),
    thumbnailSpec: z
      .object({
        focalSubject: z.string().min(1).max(160),
        contrastNote: z.string().min(1).max(180),
        textOverlayMaxChars: z.number().int().min(0).max(24),
        cropSafetyTip: z.string().min(1).max(180),
      })
      .strict(),
  })
  .strict();

export const LocalizationGlossaryCheckOutputSchema = z
  .object({
    targetLocales: z.array(z.string().min(2).max(12)).min(1).max(6),
    glossary: z
      .array(
        z
          .object({
            termKo: z.string().min(1).max(80),
            en: z.string().min(1).max(100),
            ja: z.string().min(1).max(100),
            ruleNote: z.string().min(1).max(200),
          })
          .strict(),
      )
      .min(2)
      .max(8),
    culturalNotes: z
      .array(
        z
          .object({
            severity: z.enum(["info", "warn"]),
            topic: z.string().min(1).max(80),
            adaptationTip: z.string().min(1).max(240),
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict();

export const McpWorkflowMacroOutputSchema = z
  .object({
    macroTitle: z.string().min(1).max(120),
    summary: z.string().min(1).max(280),
    zeroCostSafe: z.boolean(),
    steps: z
      .array(
        z
          .object({
            stepOrder: z.number().int().min(1).max(16),
            toolName: z.string().min(1).max(80),
            reasonKo: z.string().min(1).max(200),
            argumentsJson: z.string().min(2).max(600),
          })
          .strict(),
      )
      .min(2)
      .max(10),
  })
  .strict();

export const ALL_STUDIO_OPENAI_ASSIST_MODES = [
  "idea-remix",
  "script-to-cuts",
  "dialogue-polish",
  "export-preflight-coach",
  ...EXTENDED_ASSIST_MODES,
] as const;

export const StudioOpenAiAssistModeSchema = z.enum(ALL_STUDIO_OPENAI_ASSIST_MODES);

export type StudioOpenAiAssistMode = z.infer<typeof StudioOpenAiAssistModeSchema>;

export const OpenAiIdeaRemixOutputSchema = z
  .object({
    summary: z.string().min(1).max(400),
    angles: z
      .array(
        z
          .object({
            lens: z.enum([
              "contrarian",
              "personal-hook",
              "detail-evidence",
              "four-cut-playbook",
              "missed-angle",
            ]),
            lensLabelKo: z.string().min(1).max(60),
            headline: z.string().min(1).max(140),
            pitch: z.string().min(1).max(500),
            firstCutHint: z.string().min(1).max(240),
          })
          .strict(),
      )
      .min(3)
      .max(5),
  })
  .strict();

export const OpenAiScriptToCutsOutputSchema = z
  .object({
    episodeGoal: z.string().min(1).max(300),
    pacingTip: z.string().min(1).max(300),
    cuts: z
      .array(
        z
          .object({
            cutNumber: z.number().int().min(1).max(20),
            beatKind: z.enum([
              "setup",
              "dialogue",
              "action",
              "reaction",
              "reveal",
              "transition",
            ]),
            shotType: z.string().min(1).max(80),
            visualAction: z.string().min(1).max(320),
            dialogue: z.string().max(220),
            scrollGapHint: z.string().min(1).max(120),
          })
          .strict(),
      )
      .min(2)
      .max(12),
  })
  .strict();

export const OpenAiDialoguePolishOutputSchema = z
  .object({
    readabilityNote: z.string().min(1).max(320),
    balloons: z
      .array(
        z
          .object({
            toneLabel: z.string().min(1).max(60),
            line: z.string().min(1).max(200),
            subBubble: z.string().max(160),
            reason: z.string().min(1).max(240),
          })
          .strict(),
      )
      .min(2)
      .max(4),
  })
  .strict();

export const OpenAiExportCoachOutputSchema = z
  .object({
    readinessSummary: z.string().min(1).max(320),
    episodeBlurbSuggestion: z.string().min(1).max(240),
    checks: z
      .array(
        z
          .object({
            category: z.string().min(1).max(60),
            severity: z.enum(["pass", "tip", "fix"]),
            detail: z.string().min(1).max(280),
          })
          .strict(),
      )
      .min(2)
      .max(6),
  })
  .strict();

export type OpenAiAssistStructuredResult =
  | { readonly mode: "idea-remix"; readonly data: z.infer<typeof OpenAiIdeaRemixOutputSchema> }
  | { readonly mode: "script-to-cuts"; readonly data: z.infer<typeof OpenAiScriptToCutsOutputSchema> }
  | { readonly mode: "dialogue-polish"; readonly data: z.infer<typeof OpenAiDialoguePolishOutputSchema> }
  | { readonly mode: "export-preflight-coach"; readonly data: z.infer<typeof OpenAiExportCoachOutputSchema> }
  | { readonly mode: "character-bible-forge"; readonly data: z.infer<typeof CharacterBibleForgeOutputSchema> }
  | { readonly mode: "continuity-plot-audit"; readonly data: z.infer<typeof ContinuityPlotAuditOutputSchema> }
  | { readonly mode: "bg3d-camera-blocking"; readonly data: z.infer<typeof Bg3dCameraBlockingOutputSchema> }
  | { readonly mode: "color-mood-director"; readonly data: z.infer<typeof ColorMoodDirectorOutputSchema> }
  | { readonly mode: "sfx-onomatopoeia-lab"; readonly data: z.infer<typeof SfxOnomatopoeiaLabOutputSchema> }
  | { readonly mode: "photoshop-fx-recipe"; readonly data: z.infer<typeof PhotoshopFxRecipeOutputSchema> }
  | { readonly mode: "scroll-pacing-auditor"; readonly data: z.infer<typeof ScrollPacingAuditorOutputSchema> }
  | { readonly mode: "thumbnail-hook-optimizer"; readonly data: z.infer<typeof ThumbnailHookOptimizerOutputSchema> }
  | { readonly mode: "localization-glossary-check"; readonly data: z.infer<typeof LocalizationGlossaryCheckOutputSchema> }
  | { readonly mode: "mcp-workflow-macro"; readonly data: z.infer<typeof McpWorkflowMacroOutputSchema> };

export const MODE_OUTPUT_SCHEMAS: Readonly<Record<StudioOpenAiAssistMode, z.ZodTypeAny>> = Object.freeze({
  "idea-remix": OpenAiIdeaRemixOutputSchema,
  "script-to-cuts": OpenAiScriptToCutsOutputSchema,
  "dialogue-polish": OpenAiDialoguePolishOutputSchema,
  "export-preflight-coach": OpenAiExportCoachOutputSchema,
  "character-bible-forge": CharacterBibleForgeOutputSchema,
  "continuity-plot-audit": ContinuityPlotAuditOutputSchema,
  "bg3d-camera-blocking": Bg3dCameraBlockingOutputSchema,
  "color-mood-director": ColorMoodDirectorOutputSchema,
  "sfx-onomatopoeia-lab": SfxOnomatopoeiaLabOutputSchema,
  "photoshop-fx-recipe": PhotoshopFxRecipeOutputSchema,
  "scroll-pacing-auditor": ScrollPacingAuditorOutputSchema,
  "thumbnail-hook-optimizer": ThumbnailHookOptimizerOutputSchema,
  "localization-glossary-check": LocalizationGlossaryCheckOutputSchema,
  "mcp-workflow-macro": McpWorkflowMacroOutputSchema,
});

export function validateAssistModeStructuredOutput(
  mode: StudioOpenAiAssistMode,
  parsedJson: unknown,
): OpenAiAssistStructuredResult | null {
  const checked = MODE_OUTPUT_SCHEMAS[mode].safeParse(parsedJson);
  if (!checked.success) return null;
  return { mode, data: checked.data } as OpenAiAssistStructuredResult;
}
