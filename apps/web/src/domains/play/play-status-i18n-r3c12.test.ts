import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";

/**
 * play 로딩·실패·빈 상태 문구 i18n 키 이관 계약 (A4 잔여 3라운드 c12).
 *
 * 표시 정본은 play.status.* (play-status-i18n 등록 모듈) 키이며, 코드
 * 안의 한국어 원문은 playStatusText(키, 한국어 폴백) 폴백 인자로만
 * 남아야 한다. 게임 본문·홍보 문구·동사형 버튼 라벨·사용법 안내는
 * 상태 문구가 아니라 이관 대상이 아니다 (r3-c12.md 잔여 근거 참조).
 * PlayGameBoundary(클래스 컴포넌트)와 RpsVrmStage(비컴포넌트 로더)는
 * 훅을 쓸 수 없어 헬퍼로 같은 키를 해석한다.
 */

const HANGUL = /[가-힣]/;

function readSource(relativePath: string): string {
  return readFileSync(new URL(`./${relativePath}`, import.meta.url), "utf-8");
}

/** 등록 모듈(registerI18nLocaleEntries)의 locale 블록을 파싱한다. */
function parseRegisterModule(source: string): Record<"ko" | "en", Record<string, string>> {
  const blocks: Record<string, Record<string, string>> = {};
  const pattern = /registerI18nLocaleEntries\("(ko|en)", \{([\s\S]*?)\}\);/g;
  for (const match of source.matchAll(pattern)) {
    const entries: Record<string, string> = {};
    for (const entry of (match[2] ?? "").matchAll(/"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/g)) {
      entries[entry[1] ?? ""] = (entry[2] ?? "").replace(/\\(.)/g, "$1");
    }
    blocks[match[1] ?? ""] = { ...(blocks[match[1] ?? ""] ?? {}), ...entries };
  }
  return blocks as Record<"ko" | "en", Record<string, string>>;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1] ?? "").sort();
}

const PLAY_STATUS_KEYS = [
  "play.status.page.contentNotFound",
  "play.status.page.searchEmpty",
  "play.status.page.favoritesEmpty",
  "play.status.page.footerLoadingNote",
  "play.status.gameStates.loadFailed",
  "play.status.gameStates.loadFailedHint",
  "play.status.gameStates.retry",
  "play.status.fourPanel.unsupportedFile",
  "play.status.fourPanel.openFailed",
  "play.status.lineDojo.saveFailed",
  "play.status.motionPanel.imageLoadFailed",
  "play.status.motionPanel.pngSaveFailed",
  "play.status.motionPanel.recordSaveFailed",
  "play.status.memory.loadingCards",
  "play.status.popularityDuel.loadingData",
  "play.status.quiz.loadingQuestions",
  "play.status.roulette.empty",
  "play.status.roulette.retry",
  "play.status.rps.handNotRecognized",
  "play.status.rps.cameraLoading",
  "play.status.rps.cameraDenied",
  "play.status.rps.cameraError",
  "play.status.rpsVrm.dataNotFound",
  "play.status.lab.storageUnavailable",
  "play.status.lab.pngSaveFailed",
  "play.status.lab.fileSaveUnavailable",
  "play.status.boundary.openFailedTitle",
  "play.status.boundary.openFailedDescription",
  "play.status.boundary.openFailedNote",
] as const;

const CONSUMERS = [
  "PlayPage.tsx",
  "games/GameStates.tsx",
  "games/creative/FourPanel.tsx",
  "games/creative/LineDojo.tsx",
  "games/creative/MotionPanel.tsx",
  "games/memory/MemoryGame.tsx",
  "games/popularity-duel/PopularityDuelGame.tsx",
  "games/quiz/QuizGame.tsx",
  "games/roulette/RouletteGame.tsx",
  "games/rps/RpsGame.tsx",
  "games/rps/RpsVrmStage.tsx",
  "lab/LabShared.tsx",
  "lab/PlayGameBoundary.tsx",
] as const;

describe("play status i18n r3c12", () => {
  it("play.status 등록 모듈의 ko/en 키가 패리티를 이루고 en에 한글이 없으며 플레이스홀더가 일치한다", () => {
    const blocks = parseRegisterModule(readSource("play-status-i18n.ts"));
    expect(Object.keys(blocks.ko).sort()).toEqual(Object.keys(blocks.en).sort());
    expect(Object.keys(blocks.ko).length).toBe(PLAY_STATUS_KEYS.length);
    for (const key of PLAY_STATUS_KEYS) {
      expect(blocks.ko[key], `ko missing ${key}`).toBeTruthy();
      expect(blocks.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(blocks.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
      expect(placeholders(blocks.ko[key] ?? ""), `placeholder mismatch ${key}`).toEqual(
        placeholders(blocks.en[key] ?? ""),
      );
    }
    expect(blocks.ko["play.status.gameStates.loadFailed"]).toBe("데이터를 불러오지 못했어요.");
    expect(blocks.ko["play.status.memory.loadingCards"]).toBe("웹툰 카드를 불러오는 중");
    expect(blocks.ko["play.status.boundary.openFailedTitle"]).toBe("이 콘텐츠를 열지 못했어요.");
  });

  it("play.status 키가 소비 파일에서 실제로 참조되고 미등록 참조가 없다", () => {
    const consumerSource = CONSUMERS.map((file) => readSource(file)).join("\n");
    for (const key of PLAY_STATUS_KEYS) {
      expect(consumerSource.includes(`"${key}"`), `unreferenced key: ${key}`).toBe(true);
    }
    const referenced = new Set(
      [...consumerSource.matchAll(/"(play\.status\.[A-Za-z0-9.]+)"/g)].map((m) => m[1] ?? ""),
    );
    for (const key of referenced) {
      expect(
        (PLAY_STATUS_KEYS as readonly string[]).includes(key),
        `dangling key reference: ${key}`,
      ).toBe(true);
    }
  });

  it("이관한 소비 파일에 하드코딩 상태 문구가 남아 있지 않다", () => {
    for (const file of CONSUMERS) {
      expect(
        scanHardcodedStatusStrings(readSource(file)),
        `hardcoded status strings remain in ${file}`,
      ).toEqual([]);
    }
  });
});
