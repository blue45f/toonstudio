import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/**
 * 키 없이 쓰는 보조 기능(아트 디렉터·번역·대체 텍스트·명령 도우미와 구조화 출력 기능)의 서버 경로 계약.
 *
 * Messages API의 안전한 부분집합만 받는다: 텍스트·base64 이미지 블록, 시스템 블록, 출력 상한, 깊이(effort),
 * JSON 스키마 구조화 출력. 도구 호출·스트리밍·샘플링 매개변수·임의 필드는 받지 않는다(`strict`).
 * 서버는 운영 프리미엄 경로를 먼저 쓰고, 추론 전에 거절되면 같은 요청을 무료 풀 형식으로 바꿔 이어 간다.
 */
export const STUDIO_AI_MESSAGES_LIMITS = Object.freeze({
  maxMessages: 8,
  maxBlocks: 8,
  maxImages: 4,
  maxSystemBlocks: 4,
  maxTextChars: 60_000,
  maxTotalTextChars: 120_000,
  /** 4 MiB 이미지의 base64(약 5.6M자)에 여유를 둔 값. */
  maxImageBase64Chars: 7_200_000,
  /** 전역 JSON 본문 상한(16 MiB) 안에 들어오도록 모든 이미지의 합을 제한한다. */
  maxTotalImageBase64Chars: 12_000_000,
  maxOutputTokens: 16_000,
  maxSchemaChars: 60_000,
});

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/u;
const MODEL_PATTERN = /^claude-[a-z0-9][a-z0-9.-]{1,78}$/u;

const CacheControlSchema = z
  .object({
    type: z.literal("ephemeral"),
    ttl: z.enum(["5m", "1h"]).optional(),
  })
  .strict();

const TextBlockSchema = z
  .object({
    type: z.literal("text"),
    text: z.string().min(1).max(STUDIO_AI_MESSAGES_LIMITS.maxTextChars),
    cache_control: CacheControlSchema.optional(),
  })
  .strict();

const ImageBlockSchema = z
  .object({
    type: z.literal("image"),
    source: z
      .object({
        type: z.literal("base64"),
        media_type: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
        data: z
          .string()
          .min(16)
          .max(STUDIO_AI_MESSAGES_LIMITS.maxImageBase64Chars)
          .regex(BASE64_PATTERN, "이미지 데이터 형식이 올바르지 않습니다."),
      })
      .strict(),
    cache_control: CacheControlSchema.optional(),
  })
  .strict();

const ContentBlockSchema = z.discriminatedUnion("type", [TextBlockSchema, ImageBlockSchema]);

const MessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.union([
      z.string().min(1).max(STUDIO_AI_MESSAGES_LIMITS.maxTextChars),
      z.array(ContentBlockSchema).min(1).max(STUDIO_AI_MESSAGES_LIMITS.maxBlocks),
    ]),
  })
  .strict();

const OutputConfigSchema = z
  .object({
    effort: z.enum(["low", "medium", "high"]).optional(),
    format: z
      .object({
        type: z.literal("json_schema"),
        schema: z.record(z.string(), z.unknown()),
      })
      .strict()
      .optional(),
  })
  .strict();

function contentBlocks(content: z.infer<typeof MessageSchema>["content"]) {
  return typeof content === "string" ? [{ type: "text" as const, text: content }] : content;
}

export const StudioAiMessagesSchema = z
  .object({
    /** 원하는 고성능 모델. 운영 허용 목록에 없으면 서버 기본 모델을 쓰고 응답에 실제 모델을 돌려준다. */
    model: z.string().trim().toLowerCase().regex(MODEL_PATTERN).optional(),
    max_tokens: z.number().int().min(1).max(STUDIO_AI_MESSAGES_LIMITS.maxOutputTokens),
    system: z
      .union([
        z.string().min(1).max(STUDIO_AI_MESSAGES_LIMITS.maxTextChars),
        z.array(TextBlockSchema).min(1).max(STUDIO_AI_MESSAGES_LIMITS.maxSystemBlocks),
      ])
      .optional(),
    messages: z.array(MessageSchema).min(1).max(STUDIO_AI_MESSAGES_LIMITS.maxMessages),
    output_config: OutputConfigSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.messages[0]?.role !== "user") {
      context.addIssue({ code: "custom", path: ["messages", 0, "role"], message: "첫 메시지는 사용자 메시지여야 합니다." });
    }
    if (value.messages.at(-1)?.role !== "user") {
      context.addIssue({ code: "custom", path: ["messages"], message: "마지막 메시지는 사용자 메시지여야 합니다." });
    }
    let textChars = typeof value.system === "string"
      ? value.system.length
      : (value.system ?? []).reduce((sum, block) => sum + block.text.length, 0);
    let images = 0;
    let imageChars = 0;
    for (const message of value.messages) {
      for (const block of contentBlocks(message.content)) {
        if (block.type === "text") {
          textChars += block.text.length;
        } else {
          images += 1;
          imageChars += block.source.data.length;
          if (message.role !== "user") {
            context.addIssue({ code: "custom", path: ["messages"], message: "이미지는 사용자 메시지에만 넣을 수 있습니다." });
          }
        }
      }
    }
    if (textChars > STUDIO_AI_MESSAGES_LIMITS.maxTotalTextChars) {
      context.addIssue({ code: "custom", path: ["messages"], message: "AI 요청 글이 너무 깁니다." });
    }
    if (images > STUDIO_AI_MESSAGES_LIMITS.maxImages) {
      context.addIssue({ code: "custom", path: ["messages"], message: "이미지는 한 번에 4장까지 보낼 수 있습니다." });
    }
    if (imageChars > STUDIO_AI_MESSAGES_LIMITS.maxTotalImageBase64Chars) {
      context.addIssue({ code: "custom", path: ["messages"], message: "이미지 용량 합계가 너무 큽니다." });
    }
    const schema = value.output_config?.format?.schema;
    if (schema && JSON.stringify(schema).length > STUDIO_AI_MESSAGES_LIMITS.maxSchemaChars) {
      context.addIssue({ code: "custom", path: ["output_config", "format"], message: "출력 형식 정의가 너무 깁니다." });
    }
  });

export class StudioAiMessagesDto extends createZodDto(StudioAiMessagesSchema) {}

export type StudioAiMessagesRequest = z.infer<typeof StudioAiMessagesSchema>;
export type StudioAiMessagesContentBlock = z.infer<typeof ContentBlockSchema>;

/** 메시지 본문을 블록 배열로 펼친다. 문자열 본문은 텍스트 블록 하나로 본다. */
export function studioAiMessageBlocks(
  content: StudioAiMessagesRequest["messages"][number]["content"],
): StudioAiMessagesContentBlock[] {
  return contentBlocks(content);
}

export function studioAiMessagesHasImages(request: StudioAiMessagesRequest): boolean {
  return request.messages.some((message) =>
    studioAiMessageBlocks(message.content).some((block) => block.type === "image"));
}
