import { ApprovedDialoguePairSchema } from "@toonstudio/contracts/studio-approved-dialogue-review";
import { StudioOpenAiAssistModeSchema } from "@toonstudio/contracts/studio-openai-assist-result";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export {
  MODE_OUTPUT_SCHEMAS,
  OpenAiDialoguePolishOutputSchema,
  OpenAiExportCoachOutputSchema,
  OpenAiIdeaRemixOutputSchema,
  OpenAiScriptToCutsOutputSchema,
  StudioOpenAiAssistModeSchema,
  validateAssistModeStructuredOutput,
  type OpenAiAssistStructuredResult,
  type StudioOpenAiAssistMode,
} from "@toonstudio/contracts/studio-openai-assist-result";

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

export class StudioApprovedDialogueReviewDto extends createZodDto(ApprovedDialoguePairSchema) {}
