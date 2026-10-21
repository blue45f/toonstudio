/**
 * verify-product-tour-live.mjs 판정 로직 단위 테스트 (Node 내장 test runner).
 * 실행: node --test scripts/verify-product-tour-live.test.mjs
 * 브라우저 수집 없이 관측값 → 판정 변환만 검증한다. 실재생 자체는 배포 후
 * verify-product-tour-live.mjs 실행이 담당한다.
 */
import assert from "node:assert/strict";

// 루트 Vitest 스위트와 node --test 양쪽에서 도는 이중 모드 (기존 scripts 테스트 관행).
const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

import { evaluateProductTourObservation } from "./verify-product-tour-live.mjs";

const healthy = {
  engine: "remotion",
  phase: "ready",
  started: "true",
  frameAtStart: 0,
  frameAfterWait: 95,
  mp4VideoCount: 0,
  fallbackNoticePresent: false,
  audioElements: [
    { readyState: 4, hasError: false, paused: false },
    { readyState: 3, hasError: false, paused: false },
  ],
  captionFound: true,
  chapterCount: 10,
  frameAfterChapterSeek: 6845,
};

describe("evaluateProductTourObservation", () => {
  it("정상 Remotion 재생 관측은 전 항목 통과한다", () => {
    const result = evaluateProductTourObservation(healthy);
    assert.equal(result.ok, true);
    assert.equal(result.checks.every((check) => check.ok), true);
  });

  it("MP4 폴백으로 뒤집힌 관측은 G5-1에서 실패한다", () => {
    const result = evaluateProductTourObservation({
      ...healthy,
      engine: "mp4",
      mp4VideoCount: 1,
      fallbackNoticePresent: true,
    });
    assert.equal(result.ok, false);
    const byId = new Map(result.checks.map((check) => [check.id, check.ok]));
    assert.equal(byId.get("G5-1.engine-remotion"), false);
    assert.equal(byId.get("G5-1.no-mp4-fallback"), false);
  });

  it("프레임이 전진하지 않으면(검은 화면·정지) 실패한다", () => {
    const result = evaluateProductTourObservation({ ...healthy, frameAfterWait: 2 });
    assert.equal(result.ok, false);
    assert.equal(result.checks.find((check) => check.id === "G5-1.frame-advances").ok, false);
  });

  it("오디오 오류·자막 부재·챕터 탐색 실패는 각각 G5-2에서 잡힌다", () => {
    const result = evaluateProductTourObservation({
      ...healthy,
      audioElements: [{ readyState: 0, hasError: true, paused: true }],
      captionFound: false,
      frameAfterChapterSeek: 120,
    });
    const byId = new Map(result.checks.map((check) => [check.id, check.ok]));
    assert.equal(byId.get("G5-2.audio-present"), false);
    assert.equal(byId.get("G5-2.caption-visible"), false);
    assert.equal(byId.get("G5-2.chapter-seek"), false);
    assert.equal(byId.get("G5-2.chapter-count"), true);
  });
});
