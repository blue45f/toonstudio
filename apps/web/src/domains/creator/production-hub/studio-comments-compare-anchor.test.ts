import { describe, expect, it } from "vitest";

import { createCompareImageAnchor } from "./compare-review-model";
import {
  addStudioCommentReply, addStudioCommentThread, createEmptyStudioCommentsDocument,
  normalizeStudioCommentsDocument, serializeStudioCommentsDocument,
} from "../studio-comments";

const at = new Date("2026-10-30T03:00:00.000Z");
const author = { id: "reviewer", displayName: "검수자" };

describe("비교 이미지 댓글의 실제 직렬화 계약", () => {
  it.each([undefined, "paired-image"])("pageId 없는 비교핀과 상대 이미지 %s를 저장·복원해도 댓글·답글이 유지된다", (paired) => {
    const anchor = createCompareImageAnchor("original-image", { x: 0.25, y: 0.75 }, paired);
    const source = addStudioCommentReply(addStudioCommentThread(createEmptyStudioCommentsDocument(), {
      id: "thread", anchor, author, body: "팔 위치를 이전 버전과 비교해 주세요.",
      mentions: [{ id: "artist", displayName: "작화 담당" }],
      references: [{ id: "reference", sourceKind: "compare-pool", sourceId: "paired-image", label: "이전 시안" }],
    }, at), "thread", { id: "reply", author, body: "원본 좌표를 유지했습니다." }, at);
    const raw = serializeStudioCommentsDocument(source);
    expect(JSON.parse(raw).threads).toHaveLength(1);
    expect(normalizeStudioCommentsDocument(raw)).toEqual(source);
    expect(normalizeStudioCommentsDocument(raw).threads[0]?.anchor).toEqual(anchor);
    expect(normalizeStudioCommentsDocument(raw)).toEqual(normalizeStudioCommentsDocument(source));
  });

  it.each([
    { type: "compare-image", poolItemId: "", x: 0.2, y: 0.3 },
    { type: "compare-image", poolItemId: "image", x: -0.1, y: 0.3 },
    { type: "compare-image", poolItemId: "image", x: 0.2, y: 1.1 },
    { type: "compare-image", poolItemId: "image", x: Number.NaN, y: 0.3 },
    { type: "compare-image", poolItemId: "image", x: 0.2, y: 0.3, pairedPoolItemId: "" },
    { type: "compare-image", poolItemId: "image", x: 0.2, y: 0.3, unknown: true },
  ])("잘못된 비교핀을 페이지 핀으로 추정하거나 좌표를 보정해 복원하지 않는다: %j", (anchor) => {
    const malformed = { version: 1, threads: [{ id: "bad", anchor, author, body: "검수 의견",
      createdAt: at.toISOString(), updatedAt: at.toISOString(), mentions: [], replies: [], resolved: false }] };
    expect(normalizeStudioCommentsDocument(malformed)).toEqual(createEmptyStudioCommentsDocument());
    expect(normalizeStudioCommentsDocument(JSON.stringify(malformed))).toEqual(createEmptyStudioCommentsDocument());
  });
});
