// apps/api/src/modules/fortune/fortune.dto.ts
//
// 운세 엔드포인트 입력 검증 — nestjs-zod DTO. 전역 ZodValidationPipe가 자동 검증해
// 빈/잘못된 입력은 500 크래시 대신 400 + 한글 메시지로 막는다.
//
// 2026-10-08 (F-B10-1): 생년월일을 받던 Today/Saju/Compatibility/Zodiac DTO와
// 엔드포인트를 제거했다. 해당 도구들은 웹이 기기에서 직접 계산하며, 서버는
// 리워드 기록용 FortuneUsedDto(mode만)를 받는다.

import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const characterId = z.string({ error: "캐릭터를 선택해 주세요." }).min(1, "캐릭터를 선택해 주세요.");

// 클라이언트 계산 모드 — 생년월일 없이 mode만으로 리워드를 기록한다.
// tarot/prescription은 서버 계산 엔드포인트가 직접 기록하므로 여기에 넣지 않는다.
export class FortuneUsedDto extends createZodDto(
  z.object({
    mode: z.enum(["today", "saju", "compatibility", "zodiac"]),
  })
) {}

export class PrescriptionDto extends createZodDto(
  z.object({
    characterId,
    query: z.string().trim().min(2, "고민을 조금만 더 적어 주세요.").max(500, "내용이 너무 길어요. 500자 이내로 적어 주세요."),
  })
) {}

export class TarotDto extends createZodDto(
  z.object({
    characterId,
    cardIdx: z.number().int().min(0).max(11).optional(),
    spread: z.enum(["one", "three"]).optional(),
  })
) {}
