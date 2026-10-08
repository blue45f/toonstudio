/**
 * 운세 클라이언트 계산 — 생년월일이 필요한 도구(오늘·사주·궁합·별자리)는
 * 서버로 생년월일을 보내지 않고 이 기기에서 @toonstudio/core 엔진으로 직접 계산한다.
 *
 * 민감정보 정책 (LOW-2, 2026-10-06 확정): 생년월일·출생시간은 이 기기의
 * localStorage에만 저장하고, 서버에는 어떤 형태로도 전송하지 않는다.
 * (F-B10-1 처분, 2026-10-08: 구 POST /api/fortune/{today,saju,compatibility,zodiac}
 * 전송 경로를 제거하고 서버 엔드포인트도 함께 삭제했다.)
 *
 * 엔진(@toonstudio/core/fortune)은 웹·API가 공유하는 순수 함수라 같은 입력이면
 * 서버 계산과 같은 결과(점수·속성·해석·패널)를 낸다. 추천 타이틀만 카탈로그
 * 스토어 적재 상태에 의존한다 — 스토어가 비어 있으면 엔진 기본 동작대로 빈
 * 배열이 되고, 카탈로그를 둘러본 세션에서는 서버와 같은 추천이 나온다.
 */

import {
  drawCompatibility,
  drawSaju,
  drawTodayFortune,
  drawZodiac,
} from "@toonstudio/core/fortune";
import { apiFetch } from "@/platform/api";
import { allTitles } from "@/shared/lib/server/catalog-store";

import type { FortuneResult } from "./fortune-page-data";

/** 클라이언트에서 계산하는 운세 모드 — 리워드 기록(mode)에도 같은 값을 쓴다. */
export type FortuneLocalMode = "today" | "saju" | "compatibility" | "zodiac";

export async function drawTodayLocal(input: {
  characterId: string;
  birthDate?: string;
  birthTime?: string;
  gender: string;
}): Promise<FortuneResult> {
  const result = await drawTodayFortune(
    allTitles(),
    input.characterId,
    input.birthDate,
    input.birthTime,
    input.gender,
  );
  // 코어 결과는 없음 값을 null로, 웹 결과 타입(FortuneResult)은 undefined로 표현한다.
  // 나머지 필드(analysis·iljin·categories·luckyElement)는 양쪽 다 null을 허용한다.
  return {
    ...result,
    saju: result.saju ?? undefined,
  };
}

export async function drawSajuLocal(input: {
  birthDate: string;
  birthTime?: string;
  gender: string;
  characterId: string;
}): Promise<FortuneResult> {
  return drawSaju(
    allTitles(),
    input.birthDate,
    input.birthTime,
    input.gender,
    input.characterId,
  );
}

export async function drawCompatibilityLocal(input: {
  myBirthDate: string;
  myBirthTime?: string;
  partnerBirthDate: string;
  partnerBirthTime?: string;
  characterId: string;
}): Promise<FortuneResult> {
  return drawCompatibility(
    allTitles(),
    input.myBirthDate,
    input.myBirthTime,
    input.partnerBirthDate,
    input.partnerBirthTime,
    input.characterId,
  );
}

export async function drawZodiacLocal(input: {
  characterId: string;
  month: number;
  day: number;
}): Promise<FortuneResult> {
  return drawZodiac(allTitles(), input.characterId, input.month, input.day);
}

/**
 * 운세 이용 리워드 기록 — mode 하나만 서버로 보낸다. 생년월일·출생시간 같은
 * 프로필 원본은 어떤 필드에도 넣지 않는다. 리워드 회계가 불가능해도 운세
 * 결과는 그대로 보여야 하므로 실패는 조용히 무시한다(서버도 같은 원칙).
 */
export function reportFortuneUse(mode: FortuneLocalMode): void {
  void apiFetch("/api/fortune/used", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  }).catch(() => undefined);
}
