/**
 * Blender 5.3 8대 웹툰 장르 확장 세트 V30 (학원물 옥상·교실 1.50px / 느와르 베네치안 탐정실 2.60px /
 * 헌터 길드 육각 각성 게이트 2.40px, CC0-1.0) 카탈로그 및 한글 초성·키워드 통합 검색 유틸리티.
 */

import type { StudioHybridDccPrecisionBgKitItem } from "./studio-hybrid-dcc-architectural-primitives";

export const STUDIO_HYBRID_DCC_BLENDER_V30_GENRE_KIT: readonly StudioHybridDccPrecisionBgKitItem[] =
  Object.freeze([
    {
      id: "webtoon-genre-academy-rooftop-corridor-v30",
      fileName: "webtoon-genre-academy-rooftop-corridor-v30.glb",
      glbUrl:
        "/studio-assets/blender-genre-expansion-v30/webtoon-genre-academy-rooftop-corridor-v30.glb",
      previewUrl:
        "/studio-assets/blender-genre-expansion-v30/thumbnails/webtoon-genre-academy-rooftop-corridor-v30.png",
      label: [
        "학원물 옥상 안전난간·교실 책상(0.74m) 고백 베이",
        "Academy rooftop fence & 0.74m school desk bay",
      ],
      hint: [
        "5400K · 1.50px · 24cm 키 차이 청춘 시선 교차",
        "5400K · 1.50px · 24cm height-gap confession duo",
      ],
      triangles: 10828,
    },
    {
      id: "webtoon-genre-noir-venetian-detective-v30",
      fileName: "webtoon-genre-noir-venetian-detective-v30.glb",
      glbUrl:
        "/studio-assets/blender-genre-expansion-v30/webtoon-genre-noir-venetian-detective-v30.glb",
      previewUrl:
        "/studio-assets/blender-genre-expansion-v30/thumbnails/webtoon-genre-noir-venetian-detective-v30.png",
      label: [
        "느와르 베네치안 블라인드·탐정 책상 심문 OTS 베이",
        "Noir Venetian blind & detective OTS desk bay",
      ],
      hint: [
        "4100K · 2.60px · 10단 블라인드 그림자·OTS 대화",
        "4100K · 2.60px · Venetian louvers & OTS duo",
      ],
      triangles: 10816,
    },
    {
      id: "webtoon-genre-hunter-guild-gate-lobby-v30",
      fileName: "webtoon-genre-hunter-guild-gate-lobby-v30.glb",
      glbUrl:
        "/studio-assets/blender-genre-expansion-v30/webtoon-genre-hunter-guild-gate-lobby-v30.glb",
      previewUrl:
        "/studio-assets/blender-genre-expansion-v30/thumbnails/webtoon-genre-hunter-guild-gate-lobby-v30.png",
      label: [
        "헌터물 길드 육각 각성 게이트(2.40m)·측정석 로비",
        "Hunter guild 2.40m hexagonal mana gate lobby",
      ],
      hint: [
        "8200K · 2.40px · 육각 마나 공명 링·S급 대치",
        "8200K · 2.40px · Hexagonal mana gate & standoff",
      ],
      triangles: 10460,
    },
  ]);

const HANGUL_CHOSEONG_TABLE = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
] as const;

/**
 * 한글 음절(가~힣)에서 초성을 추출하고, 이미 초성 자모이거나 영문·숫자인 문자는 소문자로 유지한다.
 */
export function extractKoreanChoseong(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const choseongIdx = Math.floor((code - 0xac00) / 588);
      out += HANGUL_CHOSEONG_TABLE[choseongIdx] ?? ch;
    } else {
      out += ch.toLowerCase();
    }
  }
  return out;
}

/**
 * 부분 문자열 일치 또는 공백 제거 한글 초성 시퀀스 일치를 판별한다.
 * 예: "ㅎㅇㅁ" -> "학원물", "ㄴㅇㄹ" -> "느와르", "ㅎㅌ" -> "헌터물", "ㅎㅇ" -> "한옥"
 */
export function matchesKitSearchQuery(
  rawQuery: string,
  fields: readonly string[],
): boolean {
  const normalized = rawQuery.trim().toLowerCase();
  if (!normalized) return true;
  const compactQuery = normalized.replace(/\s+/gu, "");

  for (const field of fields) {
    const lowerField = field.toLowerCase();
    if (lowerField.includes(normalized)) return true;
    const compactField = lowerField.replace(/\s+/gu, "");
    if (compactField.includes(compactQuery)) return true;
    const choseongField = extractKoreanChoseong(compactField);
    if (choseongField.includes(compactQuery)) return true;
  }
  return false;
}
