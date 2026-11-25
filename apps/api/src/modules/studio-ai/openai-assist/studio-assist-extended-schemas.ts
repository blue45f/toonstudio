import type { ExtendedAssistMode } from "@toonstudio/contracts/studio-openai-assist-result";

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
