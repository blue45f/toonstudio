// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  addStudioCommentThread,
  createEmptyStudioCommentsDocument,
  type StudioCommentsDocument,
} from "../studio-comments";
import {
  addComparePoolItems,
  createCompareImageAnchor,
  createEmptyCompareSession,
  poolItemFromExternal,
  poolItemFromProcessCompareItem,
  setCompareMode,
  type CompareSession,
} from "./compare-review-model";
import { MANUSCRIPT_PIN_URGENT_PREFIX } from "./manuscript-pin-feedback-model";
import {
  addPinToCompareSnapshot,
  buildExternalCompareReviewUrl,
  commentsDocumentToSnapshotPins,
  createCompareReviewSnapshot,
  decodeCompareSnapshotFromUrl,
  encodeCompareSnapshotForUrl,
  mergeSnapshotPinsIntoDocument,
  parseCompareReviewSnapshot,
  parseExternalComparePins,
  serializeCompareReviewSnapshot,
  serializeExternalComparePins,
  snapshotToCommentsDocument,
  toUrlSafeCompareSnapshot,
  COMPARE_SNAPSHOT_URL_PARAM,
} from "./compare-review-snapshot";

const NOW = "2026-10-14T00:00:00.000Z";

function sessionWithPool(): CompareSession {
  const base = createEmptyCompareSession("ep-1");
  const revision = poolItemFromProcessCompareItem(
    { id: "p1::r1", processId: "p1", processLabel: "선화", kind: "image", revisionId: "r1", revisionLabel: "v5", revisionIndex: 5, statusTone: "ready", imageUrl: "https://example.com/a.png", createdAt: NOW, source: { kind: "revision", processId: "p1", revisionId: "r1" }, sourceKind: "revision", originNote: null },
    "me",
    NOW,
  );
  const external = poolItemFromExternal({
    assetId: "ext-1",
    label: "시안.png",
    imageUrl: "https://example.com/brief.png",
    addedBy: "me",
    addedAt: NOW,
  });
  const withPool = addComparePoolItems(base, [revision, external]);
  return { ...setCompareMode(withPool, "overlay"), panes: [revision.source, external.source] };
}

function commentsWithPin(session: CompareSession): StudioCommentsDocument {
  const [first, second] = session.pool;
  let doc = createEmptyStudioCommentsDocument();
  doc = addStudioCommentThread(doc, {
    id: "thread-1",
    anchor: createCompareImageAnchor(second!.id, { x: 0.25, y: 0.5 }, first!.id),
    author: { id: "pd", displayName: "PD" },
    body: `${MANUSCRIPT_PIN_URGENT_PREFIX}이 구도로 맞춰 주세요`,
  }, new Date(NOW));
  return doc;
}

describe("compare-review-snapshot", () => {
  it("스냅샷 생성: 비교 구성(모드·페인)과 핀(긴급·상대 소스·좌표)을 함께 담는다", () => {
    const session = sessionWithPool();
    const snapshot = createCompareReviewSnapshot({
      reviewId: "rev-1",
      session,
      comments: commentsWithPin(session),
      capturedAt: NOW,
      capturedBy: "me",
    });
    expect(snapshot.reviewId).toBe("rev-1");
    expect(snapshot.session.mode).toBe("overlay");
    expect(snapshot.session.panes).toHaveLength(2);
    expect(snapshot.pins).toHaveLength(1);
    expect(snapshot.pins[0]).toMatchObject({
      threadId: "thread-1",
      poolItemId: session.pool[1]!.id,
      pairedPoolItemId: session.pool[0]!.id,
      x: 0.25,
      y: 0.5,
      resolved: false,
    });
    expect(snapshot.pins[0]!.body).toContain(MANUSCRIPT_PIN_URGENT_PREFIX);
  });

  it("직렬화 왕복: parse(serialize(snapshot))가 구성과 핀을 그대로 재현한다", () => {
    const session = sessionWithPool();
    const snapshot = createCompareReviewSnapshot({
      reviewId: "rev-1",
      session,
      comments: commentsWithPin(session),
      capturedAt: NOW,
      capturedBy: "me",
    });
    const restored = parseCompareReviewSnapshot(serializeCompareReviewSnapshot(snapshot), { reviewId: "rev-1", episodeId: "ep-1" });
    expect(restored).not.toBeNull();
    expect(restored!.session).toEqual(snapshot.session);
    expect(restored!.pins).toEqual(snapshot.pins);
    // 다른 검수본으로 기대하면 재현하지 않는다
    expect(parseCompareReviewSnapshot(serializeCompareReviewSnapshot(snapshot), { reviewId: "rev-2" })).toBeNull();
    // 깨진 입력은 null (외부 페이지는 기존 화면으로 폴백)
    expect(parseCompareReviewSnapshot("{broken")).toBeNull();
    expect(parseCompareReviewSnapshot(null)).toBeNull();
  });

  it("URL 재현: ?compare= 값만으로 같은 구성이 복원되고 data: 이미지는 링크에서 제외된다", () => {
    const session = sessionWithPool();
    const dataItem = poolItemFromExternal({
      assetId: "ext-data",
      label: "로컬 파일.png",
      imageUrl: "data:image/png;base64,AAAA",
      addedBy: "me",
      addedAt: NOW,
    });
    const withData = addComparePoolItems(session, [dataItem]);
    const snapshot = createCompareReviewSnapshot({
      reviewId: "rev-1",
      session: withData,
      comments: commentsWithPin(session),
      capturedAt: NOW,
      capturedBy: "me",
    });
    const url = buildExternalCompareReviewUrl("/review/proj-1/rev-1", snapshot, "tok-1");
    expect(url).not.toBeNull();
    const params = new URLSearchParams(url!.split("?")[1]);
    expect(params.get("token")).toBe("tok-1");
    const restored = decodeCompareSnapshotFromUrl(params.get(COMPARE_SNAPSHOT_URL_PARAM));
    expect(restored).not.toBeNull();
    expect(restored!.session.mode).toBe("overlay");
    expect(restored!.session.panes).toEqual(snapshot.session.panes);
    expect(restored!.pins).toEqual(snapshot.pins);
    const dataRestored = restored!.session.pool.find((item) => item.id === dataItem.id);
    expect(dataRestored?.imageUrl).toBeNull();
    // URL-safe 변환은 원본 스냅샷을 바꾸지 않는다
    expect(toUrlSafeCompareSnapshot(snapshot).session.pool.find((item) => item.id === dataItem.id)?.imageUrl).toBeNull();
    expect(snapshot.session.pool.find((item) => item.id === dataItem.id)?.imageUrl).toContain("data:");
    expect(encodeCompareSnapshotForUrl(snapshot)).not.toBeNull();
  });

  it("외부 핀 저장: 스냅샷→댓글 문서→핀 직렬화 왕복과 중복 방지 병합", () => {
    const session = sessionWithPool();
    const snapshot = createCompareReviewSnapshot({
      reviewId: "rev-1",
      session,
      comments: commentsWithPin(session),
      capturedAt: NOW,
      capturedBy: "me",
    });
    const doc = snapshotToCommentsDocument(snapshot);
    expect(doc.threads).toHaveLength(1);
    expect(doc.threads[0]!.anchor).toMatchObject({ type: "compare-image", poolItemId: session.pool[1]!.id });

    const withPin = addPinToCompareSnapshot(snapshot, {
      threadId: "thread-ext-1",
      poolItemId: session.pool[0]!.id,
      pairedPoolItemId: session.pool[1]!.id,
      x: 0.1,
      y: 0.9,
      body: "여기 색이 다릅니다",
      urgent: true,
      authorName: "외부 검수자",
      createdAt: NOW,
    });
    expect(withPin.pins).toHaveLength(2);
    expect(withPin.pins[1]!.body).toBe(`${MANUSCRIPT_PIN_URGENT_PREFIX}여기 색이 다릅니다`);
    // 같은 threadId 재추가는 무시, 풀 밖 핀도 무시
    expect(addPinToCompareSnapshot(withPin, {
      threadId: "thread-ext-1", poolItemId: session.pool[0]!.id, x: 0, y: 0, body: "중복", authorName: "x", createdAt: NOW,
    })).toBe(withPin);
    expect(addPinToCompareSnapshot(withPin, {
      threadId: "thread-ext-2", poolItemId: "없는 풀", x: 0, y: 0, body: "x", authorName: "x", createdAt: NOW,
    })).toBe(withPin);

    const merged = mergeSnapshotPinsIntoDocument(doc, withPin.pins);
    expect(merged.threads.map((thread) => thread.id).sort()).toEqual(["thread-1", "thread-ext-1"]);

    const poolIds = new Set(session.pool.map((item) => item.id));
    const roundTripped = commentsDocumentToSnapshotPins(merged, poolIds);
    expect(roundTripped).toHaveLength(2);
    const json = serializeExternalComparePins(merged, session);
    expect(parseExternalComparePins(json, session)).toHaveLength(2);
    expect(parseExternalComparePins("{broken", session)).toEqual([]);
  });
});
