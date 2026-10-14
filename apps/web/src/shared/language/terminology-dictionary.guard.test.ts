import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { findForbiddenAliases } from "./terminology";

/**
 * 가드: 한국어 사전 전수에서 같은 개념의 금지 별칭(에셋·에셋 마켓·무료 공유 마켓·
 * 즐겨찾기·보관함·찜 목록·서포터 선공개·롤링 페이월)이 다시 생기지 않게 막는다.
 * 정본 표기와 별칭 사전은 terminology.ts가 단일 출처다. (영문 사전은 한국어 정본을 미러링한다.)
 * 근거: plain-language 감사 P1-3 — 개념마다 화면 표기는 1개여야 한다.
 */
const DICTIONARIES = [
  "app",
  "studio",
  "admin",
  "studio/character",
  "studio/vrmPoser",
] as const;

/** 금지 별칭을 포함하지만 같은 개념이 아니라서 제외하는 키 (사유 필수) */
const ALLOWLIST: Readonly<Record<string, string>> = {
  // 글꼴 저장 용량 미터의 "보관함"은 저장 공간 이름이지 찜한 항목이 모이는 "서재"가 아니다.
  "studio.customFonts.storageAria": "글꼴 저장 공간 미터 — 서재와 다른 개념",
};

function readDictionary(path: string): Record<string, unknown> {
  const url = new URL(`../../../public/i18n/${path}/ko.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as Record<string, unknown>;
}

describe("용어 통일 가드 (개념마다 표기 1개)", () => {
  it("한국어 사전 전수에 금지 별칭이 없다", () => {
    const violations: string[] = [];
    for (const path of DICTIONARIES) {
      const dictionary = readDictionary(path);
      for (const [key, value] of Object.entries(dictionary)) {
        if (typeof value !== "string") continue;
        if (key in ALLOWLIST) continue;
        for (const violation of findForbiddenAliases(value)) {
          violations.push(
            `${path}:${key} — 금지 별칭 "${violation.alias}" 대신 정본 "${violation.canonical}"`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
