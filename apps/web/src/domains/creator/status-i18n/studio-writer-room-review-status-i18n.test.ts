import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";

/**
 * 작가실 리뷰 표면 로딩·실패·빈 상태 문구 i18n 키 이관 계약
 * (A4 잔여 3라운드 — WriterRoom 경계 계약 개정 과제, 신규 키 9개).
 *
 * 표시 정본은 studio.writerRoomReview.* 키이며 등록은 표면 전용 모듈
 * studio-writer-room-review-status-i18n.ts가 맡는다. 경계 계약
 * (studio-writer-room-review-boundary)은 개정으로 이 모듈을 리뷰 표면의
 * value import 화이트리스트에 추가하고 모듈 의존을 @/shared/lib/i18n 하나로
 * 고정한다. 이관 전 탐지기 위반은 4건(onError 폴백)이었고, 인벤토리
 * (a4-scan-after3) 기준 cat1 잔여는 9건이었다 — 이관 후 둘 다 0이어야 한다.
 */

const HANGUL = /[가-힣]/;

function readSource(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf-8");
}

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

const WRITER_ROOM_REVIEW_KEYS = [
  "studio.writerRoomReview.canvasPlan.applyFailed",
  "studio.writerRoomReview.canvasPlan.readyWithApply",
  "studio.writerRoomReview.canvasPlan.readyWithoutApply",
  "studio.writerRoomReview.suggestion.bulkDecideFailed",
  "studio.writerRoomReview.suggestion.decideFailed",
  "studio.writerRoomReview.suggestion.emptyTitle",
  "studio.writerRoomReview.suggestion.emptyValue",
  "studio.writerRoomReview.suggestion.pendingNotice",
  "studio.writerRoomReview.suggestion.undoFailed",
] as const;

const EXPECTED_KO: Readonly<Record<string, string>> = {
  "studio.writerRoomReview.canvasPlan.applyFailed": "컷 플랜을 캔버스에 적용하지 못했어요.",
  "studio.writerRoomReview.canvasPlan.readyWithApply": "검토된 컷 순서대로 새 페이지를 만듭니다. 버튼을 누르기 전에는 캔버스를 바꾸지 않습니다.",
  "studio.writerRoomReview.canvasPlan.readyWithoutApply": "컷과 페이지 구성이 준비되었습니다. 캔버스 적용 연결은 아직 제공되지 않습니다.",
  "studio.writerRoomReview.suggestion.bulkDecideFailed": "제안 묶음을 처리하지 못했어요.",
  "studio.writerRoomReview.suggestion.decideFailed": "제안을 처리하지 못했어요.",
  "studio.writerRoomReview.suggestion.emptyTitle": "검토할 제안이 없습니다",
  "studio.writerRoomReview.suggestion.emptyValue": "비어 있음",
  "studio.writerRoomReview.suggestion.pendingNotice": "AI 결과는 여기서 대기하며, 승인 버튼을 누르기 전에는 원고에 적용되지 않습니다.",
  "studio.writerRoomReview.suggestion.undoFailed": "마지막 결정을 되돌리지 못했어요.",
};

describe("studio writer room review status i18n", () => {
  it("신규 모듈의 ko/en 키가 패리티를 이루고 신규 키 ko 원문·플레이스홀더가 정확하다", () => {
    const blocks = parseRegisterModule(readSource("studio-writer-room-review-status-i18n.ts"));
    expect(Object.keys(blocks.ko).sort()).toEqual(Object.keys(blocks.en).sort());
    expect(Object.keys(blocks.ko).length).toBe(WRITER_ROOM_REVIEW_KEYS.length);
    for (const key of WRITER_ROOM_REVIEW_KEYS) {
      expect(blocks.ko[key], `ko missing ${key}`).toBe(EXPECTED_KO[key]);
      expect(blocks.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(blocks.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
      expect(placeholders(blocks.en[key] ?? ""), `placeholder mismatch ${key}`).toEqual(
        placeholders(blocks.ko[key] ?? ""),
      );
    }
  });

  it("신규 키가 리뷰 표면에서 실제로 참조되고 미등록 참조가 없다", () => {
    const consumerSource = readSource("StudioWriterRoomReviewSurfaces.tsx");
    const registered = new Set<string>(WRITER_ROOM_REVIEW_KEYS);
    for (const key of WRITER_ROOM_REVIEW_KEYS) {
      expect(consumerSource.includes(`writerRoomReviewText("${key}"`), `unreferenced key: ${key}`).toBe(true);
    }
    const referenced = new Set(
      [...consumerSource.matchAll(/"(studio\.writerRoomReview\.[A-Za-z0-9.]+)"/g)].map(
        (match) => match[1] ?? "",
      ),
    );
    expect(referenced.size).toBe(WRITER_ROOM_REVIEW_KEYS.length);
    for (const key of referenced) {
      expect(registered.has(key), `dangling key reference: ${key}`).toBe(true);
    }
  });

  it("리뷰 표면의 탐지기 위반이 기본·생산자 채널 모두 0건이다", () => {
    const source = readSource("StudioWriterRoomReviewSurfaces.tsx");
    expect(scanHardcodedStatusStrings(source)).toEqual([]);
    expect(scanHardcodedStatusStrings(source, { includeProducerChannels: true })).toEqual([]);
  });
});
