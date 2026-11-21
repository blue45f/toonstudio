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

export const EXTENDED_MODE_JSON_SCHEMAS: Readonly<
  Record<ExtendedAssistMode, { readonly name: string; readonly schema: Record<string, unknown> }>
> = Object.freeze({
  "character-bible-forge": {
    name: "toonstudio_character_bible",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "characterName",
        "archetypeKo",
        "speechTone",
        "appearancePalette",
        "coreMotivation",
        "forbiddenLines",
        "relationshipHooks",
        "visualConsistencyCue",
      ],
      properties: {
        characterName: { type: "string" },
        archetypeKo: { type: "string" },
        speechTone: { type: "string" },
        appearancePalette: { type: "string" },
        coreMotivation: { type: "string" },
        forbiddenLines: { type: "array", items: { type: "string" } },
        relationshipHooks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["target", "dynamic"],
            properties: { target: { type: "string" }, dynamic: { type: "string" } },
          },
        },
        visualConsistencyCue: { type: "string" },
      },
    },
  },
  "continuity-plot-audit": {
    name: "toonstudio_continuity_audit",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["overallConsistencyScore", "summary", "issues"],
      properties: {
        overallConsistencyScore: { type: "integer" },
        summary: { type: "string" },
        issues: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["severity", "category", "locationHint", "conflictDetail", "fixSuggestion"],
            properties: {
              severity: { type: "string", enum: ["critical", "warn", "tip"] },
              category: { type: "string" },
              locationHint: { type: "string" },
              conflictDetail: { type: "string" },
              fixSuggestion: { type: "string" },
            },
          },
        },
      },
    },
  },
  "bg3d-camera-blocking": {
    name: "toonstudio_bg3d_blocking",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["sceneSummary", "camera", "lighting", "propsToPlace", "blockingNotes"],
      properties: {
        sceneSummary: { type: "string" },
        camera: {
          type: "object",
          additionalProperties: false,
          required: ["lensMm", "fovDeg", "angleLabel", "position", "target", "rollDeg"],
          properties: {
            lensMm: { type: "number" },
            fovDeg: { type: "number" },
            angleLabel: { type: "string" },
            position: { type: "array", items: { type: "number" } },
            target: { type: "array", items: { type: "number" } },
            rollDeg: { type: "number" },
          },
        },
        lighting: {
          type: "object",
          additionalProperties: false,
          required: ["timeOfDay", "keyLightColor", "rimLightNote", "ambientRatio"],
          properties: {
            timeOfDay: { type: "string" },
            keyLightColor: { type: "string" },
            rimLightNote: { type: "string" },
            ambientRatio: { type: "number" },
          },
        },
        propsToPlace: { type: "array", items: { type: "string" } },
        blockingNotes: { type: "array", items: { type: "string" } },
      },
    },
  },
  "color-mood-director": {
    name: "toonstudio_color_mood",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["emotionLabel", "moodSummary", "palette", "lightingGuide", "contrastWarning"],
      properties: {
        emotionLabel: { type: "string" },
        moodSummary: { type: "string" },
        palette: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["role", "nameKo", "oklch", "usageTip"],
            properties: {
              role: { type: "string" },
              nameKo: { type: "string" },
              oklch: { type: "string" },
              usageTip: { type: "string" },
            },
          },
        },
        lightingGuide: { type: "string" },
        contrastWarning: { type: "string" },
      },
    },
  },
  "sfx-onomatopoeia-lab": {
    name: "toonstudio_sfx_lab",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["sceneEnergy", "suggestions"],
      properties: {
        sceneEnergy: { type: "string" },
        suggestions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["ko", "ja", "en", "intent", "typographyTip", "placementHint"],
            properties: {
              ko: { type: "string" },
              ja: { type: "string" },
              en: { type: "string" },
              intent: { type: "string" },
              typographyTip: { type: "string" },
              placementHint: { type: "string" },
            },
          },
        },
      },
    },
  },
  "photoshop-fx-recipe": {
    name: "toonstudio_photoshop_fx",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["lookNameKo", "summary", "layerStyles", "cameraRaw", "nonDestructiveTip"],
      properties: {
        lookNameKo: { type: "string" },
        summary: { type: "string" },
        layerStyles: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["effect", "blendMode", "opacityPct", "paramsSummary"],
            properties: {
              effect: { type: "string" },
              blendMode: { type: "string" },
              opacityPct: { type: "integer" },
              paramsSummary: { type: "string" },
            },
          },
        },
        cameraRaw: {
          type: "object",
          additionalProperties: false,
          required: ["exposure", "contrast", "clarity", "dehaze", "temperatureShift", "grainPct"],
          properties: {
            exposure: { type: "number" },
            contrast: { type: "integer" },
            clarity: { type: "integer" },
            dehaze: { type: "integer" },
            temperatureShift: { type: "integer" },
            grainPct: { type: "integer" },
          },
        },
        nonDestructiveTip: { type: "string" },
      },
    },
  },
  "scroll-pacing-auditor": {
    name: "toonstudio_scroll_pacing",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["rhythmVerdict", "averageGapPx", "cliffhangerScore", "cliffhangerTip", "beatPacing"],
      properties: {
        rhythmVerdict: { type: "string" },
        averageGapPx: { type: "integer" },
        cliffhangerScore: { type: "integer" },
        cliffhangerTip: { type: "string" },
        beatPacing: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["section", "pacing", "recommendedGapPx", "readerRetentionNote"],
            properties: {
              section: { type: "string" },
              pacing: { type: "string", enum: ["tight", "steady", "breath", "drop"] },
              recommendedGapPx: { type: "integer" },
              readerRetentionNote: { type: "string" },
            },
          },
        },
      },
    },
  },
  "thumbnail-hook-optimizer": {
    name: "toonstudio_thumbnail_hook",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["hookDiagnosis", "titleVariants", "thumbnailSpec"],
      properties: {
        hookDiagnosis: { type: "string" },
        titleVariants: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["variantLabel", "title", "subCopy", "hookReason"],
            properties: {
              variantLabel: { type: "string" },
              title: { type: "string" },
              subCopy: { type: "string" },
              hookReason: { type: "string" },
            },
          },
        },
        thumbnailSpec: {
          type: "object",
          additionalProperties: false,
          required: ["focalSubject", "contrastNote", "textOverlayMaxChars", "cropSafetyTip"],
          properties: {
            focalSubject: { type: "string" },
            contrastNote: { type: "string" },
            textOverlayMaxChars: { type: "integer" },
            cropSafetyTip: { type: "string" },
          },
        },
      },
    },
  },
  "localization-glossary-check": {
    name: "toonstudio_localization_glossary",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["targetLocales", "glossary", "culturalNotes"],
      properties: {
        targetLocales: { type: "array", items: { type: "string" } },
        glossary: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["termKo", "en", "ja", "ruleNote"],
            properties: {
              termKo: { type: "string" },
              en: { type: "string" },
              ja: { type: "string" },
              ruleNote: { type: "string" },
            },
          },
        },
        culturalNotes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["severity", "topic", "adaptationTip"],
            properties: {
              severity: { type: "string", enum: ["info", "warn"] },
              topic: { type: "string" },
              adaptationTip: { type: "string" },
            },
          },
        },
      },
    },
  },
  "mcp-workflow-macro": {
    name: "toonstudio_mcp_macro",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["macroTitle", "summary", "zeroCostSafe", "steps"],
      properties: {
        macroTitle: { type: "string" },
        summary: { type: "string" },
        zeroCostSafe: { type: "boolean" },
        steps: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["stepOrder", "toolName", "reasonKo", "argumentsJson"],
            properties: {
              stepOrder: { type: "integer" },
              toolName: { type: "string" },
              reasonKo: { type: "string" },
              argumentsJson: { type: "string" },
            },
          },
        },
      },
    },
  },
});
