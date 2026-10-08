import { Injectable } from "@nestjs/common";

import {
  drawPrescription,
  drawTarot,
  drawZodiac,
  getCharacters,
  type FortuneCharacter,
} from "../../../../../packages/core/src/fortune";
import { TITLES } from "../../../../../packages/core/src/catalog";

/**
 * Fortune calculations and character comic scripts are deterministic local content.
 * Optional AI restyling belongs to the browser BYOK layer; this service never reads or spends an
 * operator Gemini/OpenAI key. The core engine's authored fallback panels remain the authority.
 */
@Injectable()
export class FortuneService {
  getCharacters(): FortuneCharacter[] {
    return getCharacters();
  }

  drawTarot(
    characterId: string,
    cardIdx = 0,
    spread: "one" | "three" = "one",
  ) {
    return drawTarot(TITLES, characterId, cardIdx, spread);
  }

  // 오늘·사주·궁합은 웹이 @toonstudio/core 엔진으로 기기에서 직접 계산한다
  // (2026-10-08, F-B10-1 — 생년월일 서버 전송 제거). 서버 계산 메서드는 두지 않는다.
  // drawZodiac은 provenance 프로바이더의 내부 폴백 계산용으로만 남긴다.

  drawPrescription(query: string, characterId: string) {
    return drawPrescription(TITLES, query, characterId);
  }

  drawZodiac(characterId: string, month: number, day: number) {
    return drawZodiac(TITLES, characterId, month, day);
  }
}
