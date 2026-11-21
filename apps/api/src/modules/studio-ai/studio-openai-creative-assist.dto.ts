import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  Bg3dCameraBlockingOutputSchema,
  CharacterBibleForgeOutputSchema,
  ColorMoodDirectorOutputSchema,
  ContinuityPlotAuditOutputSchema,
  EXTENDED_ASSIST_MODES,
  LocalizationGlossaryCheckOutputSchema,
  McpWorkflowMacroOutputSchema,
  PhotoshopFxRecipeOutputSchema,
  ScrollPacingAuditorOutputSchema,
  SfxOnomatopoeiaLabOutputSchema,
  ThumbnailHookOptimizerOutputSchema,
} from "./openai-assist/studio-assist-extended-schemas";

export const StudioOpenAiAssistModeSchema = z.enum([
  "idea-remix",
  "script-to-cuts",
  "dialogue-polish",
  "export-preflight-coach",
  ...EXTENDED_ASSIST_MODES,
]);

export type StudioOpenAiAssistMode = z.infer<typeof StudioOpenAiAssistModeSchema>;

export const StudioOpenAiTargetPlatformSchema = z.enum([
  "vertical-webtoon",
  "cuttoon",
  "page-comic",
  "general",
]);

export type StudioOpenAiTargetPlatform = z.infer<typeof StudioOpenAiTargetPlatformSchema>;

export const StudioOpenAiCreativeAssistRequestSchema = z
  .object({
    mode: StudioOpenAiAssistModeSchema,
    inputText: z
      .string()
      .trim()
      .min(2, "도우미에게 전달할 아이디어나 대본을 두 글자 이상 입력해 주세요.")
      .max(6_000, "한 번에 6,000자까지 보낼 수 있어요. 장면을 나누어 입력해 주세요."),
    projectTitle: z.string().trim().max(120).optional(),
    genreOrTone: z.string().trim().max(80).optional(),
    targetPlatform: StudioOpenAiTargetPlatformSchema.optional(),
    allowZeroBillCascade: z.boolean().optional(),
  })
  .strict();

export class StudioOpenAiCreativeAssistDto extends createZodDto(
  StudioOpenAiCreativeAssistRequestSchema,
) {}

export type StudioOpenAiCreativeAssistRequest = z.infer<
  typeof StudioOpenAiCreativeAssistRequestSchema
>;

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
