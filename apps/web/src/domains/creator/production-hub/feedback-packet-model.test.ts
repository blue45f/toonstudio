import { describe, expect, it } from "vitest";

import type { StudioCommentReference } from "../studio-comments";
import {
  buildFeedbackReferenceFromBoardItem,
  buildFeedbackReferenceFromComparePoolItem,
  buildFeedbackReferenceFromUrl,
  evaluateFeedbackPacket,
  evaluateFeedbackPacketForPin,
  feedbackPacketMissingGuidance,
  feedbackReferenceIdentityKey,
  isFeedbackPacketAreaMarked,
  isSameFeedbackReference,
  toggleFeedbackPacketReference,
} from "./feedback-packet-model";

const URL_REFERENCE: StudioCommentReference = {
  id: "ref-1",
  label: "원하는 표정",
  sourceKind: "url",
  imageUrl: "https://example.com/expression.png",
};

const COMPARE_REFERENCE = buildFeedbackReferenceFromComparePoolItem({
  poolItemId: "pool-7",
  label: "비교 이미지 2",
  imageUrl: "https://example.com/compare.png",
});

describe("evaluateFeedbackPacket", () => {
  it("세 요소가 모두 있어야 제출할 수 있다", () => {
    const evaluation = evaluateFeedbackPacket({
      body: "표정을 더 밝게 바꿔 주세요",
      area: { x: 0.3, y: 0.4 },
      references: [URL_REFERENCE],
    });
    expect(evaluation.complete).toBe(true);
    expect(evaluation.canSubmit).toBe(true);
    expect(evaluation.missing).toEqual([]);
    expect(evaluation.referenceCount).toBe(1);
  });

  it("텍스트만으로는 제출할 수 없다 — 레퍼런스가 빈 요소로 남는다", () => {
    const evaluation = evaluateFeedbackPacket({
      body: "표정을 더 밝게 바꿔 주세요",
      area: { x: 0.3, y: 0.4 },
      references: [],
    });
    expect(evaluation.canSubmit).toBe(false);
    expect(evaluation.missing).toEqual(["reference"]);
    expect(feedbackPacketMissingGuidance(evaluation).map((item) => item.element)).toEqual([
      "reference",
    ]);
  });

  it("설명 공백·영역 없음·레퍼런스 없음이면 세 요소가 모두 빈 요소다", () => {
    const evaluation = evaluateFeedbackPacket({ body: "   ", area: null, references: [] });
    expect(evaluation.missing).toEqual(["description", "area", "reference"]);
    expect(feedbackPacketMissingGuidance(evaluation)).toHaveLength(3);
  });

  it("범위를 벗어난 좌표는 영역 표시로 인정하지 않는다", () => {
    expect(isFeedbackPacketAreaMarked({ x: 1.2, y: 0.5 })).toBe(false);
    expect(isFeedbackPacketAreaMarked({ x: Number.NaN, y: 0.5 })).toBe(false);
    expect(isFeedbackPacketAreaMarked({ x: 0, y: 1 })).toBe(true);
    expect(isFeedbackPacketAreaMarked(null)).toBe(false);
  });
});

describe("reference builders and toggle", () => {
  it("비교 풀 항목 레퍼런스는 poolItemId로 연결되고 id가 결정적이다", () => {
    expect(COMPARE_REFERENCE.sourceKind).toBe("compare-pool");
    expect(COMPARE_REFERENCE.sourceId).toBe("pool-7");
    expect(COMPARE_REFERENCE.id).toBe("compare-ref:pool-7");
    expect(COMPARE_REFERENCE.imageUrl).toBe("https://example.com/compare.png");
  });

  it("보드 항목 레퍼런스는 boardItemId로 연결된다", () => {
    const reference = buildFeedbackReferenceFromBoardItem({
      boardItemId: "board-item-3",
      label: "  포즈 참고  ",
    });
    expect(reference.sourceKind).toBe("reference-board");
    expect(reference.sourceId).toBe("board-item-3");
    expect(reference.label).toBe("포즈 참고");
    expect(reference.imageUrl).toBeUndefined();
  });

  it("URL 레퍼런스는 라벨·주소가 비면 만들지 않는다", () => {
    expect(buildFeedbackReferenceFromUrl({ id: "r", label: " ", imageUrl: "https://a" })).toBeNull();
    expect(buildFeedbackReferenceFromUrl({ id: "r", label: "참고", imageUrl: " " })).toBeNull();
    expect(
      buildFeedbackReferenceFromUrl({ id: "r", label: " 참고 ", imageUrl: " https://a/b.png " })
    ).toEqual({ id: "r", label: "참고", sourceKind: "url", imageUrl: "https://a/b.png" });
  });

  it("같은 출처 레퍼런스는 id가 달라도 동일하게 보고 토글로 빠진다", () => {
    const twin: StudioCommentReference = { ...COMPARE_REFERENCE, id: "another-id" };
    expect(isSameFeedbackReference(COMPARE_REFERENCE, twin)).toBe(true);
    expect(feedbackReferenceIdentityKey(COMPARE_REFERENCE)).toBe(
      feedbackReferenceIdentityKey(twin)
    );
    expect(toggleFeedbackPacketReference([COMPARE_REFERENCE], twin)).toEqual([]);
    expect(toggleFeedbackPacketReference([], COMPARE_REFERENCE)).toEqual([COMPARE_REFERENCE]);
  });

  it("상한(4개)에 닿으면 새 레퍼런스를 붙이지 않고 목록을 그대로 돌려준다", () => {
    const full: StudioCommentReference[] = [1, 2, 3, 4].map((n) => ({
      id: `ref-${n}`,
      label: `레퍼런스 ${n}`,
      sourceKind: "url" as const,
      imageUrl: `https://example.com/${n}.png`,
    }));
    expect(toggleFeedbackPacketReference(full, URL_REFERENCE)).toBe(full);
  });
});

describe("evaluateFeedbackPacketForPin", () => {
  it("레퍼런스가 있는 핀은 완전한 패킷, 없는 레거시 핀은 reference가 빈다", () => {
    expect(
      evaluateFeedbackPacketForPin({
        body: "선 정리 부탁해요",
        x: 0.25,
        y: 0.75,
        references: [URL_REFERENCE],
      }).complete
    ).toBe(true);
    const legacy = evaluateFeedbackPacketForPin({ body: "선 정리 부탁해요", x: 0.25, y: 0.75 });
    expect(legacy.complete).toBe(false);
    expect(legacy.missing).toEqual(["reference"]);
  });
});
