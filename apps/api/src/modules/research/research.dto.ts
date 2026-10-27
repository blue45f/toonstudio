/**
 * research.dto.ts — 리서치 API 입력 스키마 (controller 경계에서 검증).
 * studio-ai.dto.ts와 같은 nestjs-zod 방식을 쓴다.
 *
 * 길이 제한은 검색 프로바이더 쿼리 상한(128자)과 일치한다. 이 제한이 곧
 * 개인정보 보호 가드레일이다: 128자를 넘는 미공개 원고는 이 API로
 * 검색 프로바이더에 전달될 수 없다.
 */
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const shortQuery = (label: string): z.ZodString =>
  z
    .string()
    .trim()
    .min(1, `${label}이 비어 있습니다.`)
    .max(128, `${label}은 128자 이하여야 합니다.`);

export const ResearchBriefSchema = z
  .object({
    question: shortQuery("리서치 질문"),
    fetchSources: z.boolean().optional(),
    maxFetchSources: z.int().min(0).max(3).optional(),
  })
  .strict();

export class ResearchBriefDto extends createZodDto(ResearchBriefSchema) {}

export const ExistenceCheckSchema = z
  .object({
    title: shortQuery("작품 제목 또는 소재 키워드"),
    maxResults: z.int().min(1).max(10).optional(),
  })
  .strict();

export class ExistenceCheckDto extends createZodDto(ExistenceCheckSchema) {}

export const TrendDigestSchema = z
  .object({
    queries: z
      .array(shortQuery("트렌드 질의"))
      .min(1, "트렌드 질의는 1건 이상이어야 합니다.")
      .max(10, "트렌드 질의는 10건 이하여야 합니다."),
    fetchSources: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.queries).size !== value.queries.length) {
      context.addIssue({
        code: "custom",
        path: ["queries"],
        message: "트렌드 질의에 중복 항목이 있습니다.",
      });
    }
  });

export class TrendDigestDto extends createZodDto(TrendDigestSchema) {}

export type ResearchBriefInput = z.infer<typeof ResearchBriefSchema>;
export type ExistenceCheckInput = z.infer<typeof ExistenceCheckSchema>;
export type TrendDigestInput = z.infer<typeof TrendDigestSchema>;
