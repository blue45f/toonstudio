// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  addStudioCommentThread,
  assignStudioCommentThread,
  createEmptyStudioCommentsDocument,
  resolveStudioCommentThread,
  type StudioCommentsDocument,
} from "../studio-comments";
import {
  MANUSCRIPT_PIN_URGENT_PREFIX,
} from "./manuscript-pin-feedback-model";
import {
  addComparePoolItem,
  addComparePoolItems,
  applyComparePreset,
  clampCompareOpacity,
  clampCompareScale,
  commentsDocumentToComparePins,
  compareColorFromRgb,
  compareLabelNumberToken,
  comparePanesAligned,
  comparePointFromPaneLocal,
  compareSourceKey,
  computeCompareContainRect,
  createCompareImageAnchor,
  createEmptyCompareSession,
  defaultComparePanes,
  nudgeCompareOffset,
  panCompareViewport,
  parseCompareSession,
  poolItemFromExternal,
  poolItemFromPage,
  poolItemFromProcessCompareItem,
  removeComparePoolItem,
  resizeComparePanes,
  resolvePaneTransform,
  serializeCompareSession,
  setCompareMode,
  setCompareOffset,
  summarizeComparePinGate,
  toggleComparePaneSource,
  zoomCompareViewport,
  COMPARE_VIEWPORT_IDENTITY,
  type ComparePoolItem,
  type CompareSession,
} from "./compare-review-model";

const NOW = "2026-10-13T00:00:00.000Z";

function revisionItem(processId: string, revisionId: string, label: string): ComparePoolItem {
  return poolItemFromProcessCompareItem(
    {
      id: `${processId}::${revisionId}`,
      processId,
      processLabel: label,
      kind: "image",
      revisionId,
      revisionLabel: "v1",
      revisionIndex: 1,
      createdAt: NOW,
      imageUrl: null,
      statusTone: "working",
      source: { kind: "revision", processId, revisionId },
      sourceKind: "revision",
      originNote: null,
    },
    "me",
    NOW,
  );
}

function baseSession(): CompareSession {
  let session = createEmptyCompareSession("ep-1");
  session = addComparePoolItems(session, [
    revisionItem("storyboard", "sb-1", "콘티"),
    revisionItem("line", "line-1", "선화"),
    revisionItem("line", "line-2", "선화"),
    poolItemFromExternal({ assetId: "ext-1", label: "시안.png", imageUrl: "https://example.com/a.png", addedBy: "me", addedAt: NOW }),
    poolItemFromPage({ projectId: "p1", episodeId: "ep-0", pageId: "pg-34", label: "11화 34컷", imageUrl: null, addedBy: "me", addedAt: NOW }),
  ]);
  return session;
}

describe("소스 풀", () => {
  it("소스 키는 종류별로 안정적이다", () => {
    expect(compareSourceKey({ kind: "revision", processId: "a", revisionId: "b" })).toBe("revision:a:b");
    expect(compareSourceKey({ kind: "external", assetId: "x" })).toBe("external:x");
    expect(compareSourceKey({ kind: "page", projectId: "p", episodeId: "e", pageId: "g" })).toBe("page:p:e:g");
    expect(compareSourceKey({ kind: "reference", boardId: "b", itemId: "i" })).toBe("reference:b:i");
  });

  it("같은 소스는 풀에 중복으로 들어가지 않는다", () => {
    const session = baseSession();
    const again = addComparePoolItem(session, revisionItem("line", "line-1", "선화"));
    expect(again.pool).toHaveLength(session.pool.length);
  });

  it("풀에서 빼면 페인과 오프셋에서도 함께 빠진다", () => {
    let session = baseSession();
    const lineSource = { kind: "revision", processId: "line", revisionId: "line-1" } as const;
    session = toggleComparePaneSource(session, lineSource);
    session = setCompareOffset(session, lineSource, { dx: 0.1, dy: 0 });
    const target = session.pool.find((item) => item.source.kind === "revision" && item.source.revisionId === "line-1");
    const next = removeComparePoolItem(session, target!.id);
    expect(next.pool.some((item) => item.id === target!.id)).toBe(false);
    expect(next.panes).toHaveLength(0);
    expect(next.offsets[compareSourceKey(lineSource)]).toBeUndefined();
  });

  it("페인 배치는 최대 4개이며 가득 차면 가장 오래된 페인을 밀어낸다", () => {
    let session = baseSession();
    for (const item of session.pool) session = toggleComparePaneSource(session, item.source);
    expect(session.panes).toHaveLength(4);
    expect(compareSourceKey(session.panes[0])).toBe(compareSourceKey(session.pool[1].source));
    // 해제는 토글
    session = toggleComparePaneSource(session, session.panes[0]);
    expect(session.panes).toHaveLength(3);
  });

  it("기본 페인은 공정별 최신 리비전 2개다", () => {
    const session = baseSession();
    const panes = defaultComparePanes(session.pool);
    expect(panes).toHaveLength(2);
    expect(panes.map(compareSourceKey)).toContain("revision:line:line-2");
  });

  it("페인 수 조정은 풀의 미배치 항목으로 채운다", () => {
    let session = baseSession();
    session = { ...session, panes: defaultComparePanes(session.pool) };
    const grown = resizeComparePanes(session, 4);
    expect(grown.panes).toHaveLength(4);
    const shrunk = resizeComparePanes(grown, 2);
    expect(shrunk.panes).toHaveLength(2);
  });
});

describe("세션 직렬화", () => {
  it("왕복하면 같은 세션이 복원된다", () => {
    let session = baseSession();
    session = toggleComparePaneSource(session, session.pool[0].source);
    session = setCompareMode(session, "overlay");
    const restored = parseCompareSession(serializeCompareSession(session), "ep-1");
    expect(restored.pool).toHaveLength(session.pool.length);
    expect(restored.panes).toHaveLength(1);
    expect(restored.mode).toBe("overlay");
  });

  it("깨진 입력·다른 회차면 빈 세션으로 떨어진다", () => {
    expect(parseCompareSession("{broken", "ep-1").pool).toHaveLength(0);
    expect(parseCompareSession(serializeCompareSession(baseSession()), "ep-2").pool).toHaveLength(0);
    expect(parseCompareSession(null, "ep-1").episodeId).toBe("ep-1");
  });

  it("풀에 없는 소스를 가리키는 페인은 복원 시 버려진다", () => {
    const session = baseSession();
    const raw = JSON.parse(serializeCompareSession(session)) as Record<string, unknown>;
    raw.panes = [{ kind: "external", assetId: "ghost" }];
    const restored = parseCompareSession(JSON.stringify(raw), "ep-1");
    expect(restored.panes).toHaveLength(0);
  });
});

describe("공유 뷰포트·변환", () => {
  it("동기화 켜짐: 공유 뷰포트에 소스별 오프셋이 합성된다", () => {
    let session = baseSession();
    const source = session.pool[1].source;
    session = setCompareOffset(session, source, { dx: 0.05, dy: -0.02 });
    const transform = resolvePaneTransform(session, { scale: 2, tx: 0.1, ty: 0.1 }, source);
    expect(transform.scale).toBe(2);
    expect(transform.tx).toBeCloseTo(0.15);
    expect(transform.ty).toBeCloseTo(0.08);
  });

  it("동기화 꺼짐: 페인 개별 뷰포트를 쓰고 오프셋은 적용하지 않는다", () => {
    let session = baseSession();
    session = { ...session, syncView: false };
    const source = session.pool[1].source;
    session = setCompareOffset(session, source, { dx: 0.2, dy: 0 });
    const transform = resolvePaneTransform(session, { scale: 3, tx: 0, ty: 0 }, source, { scale: 1.5, tx: 0.3, ty: 0 });
    expect(transform.scale).toBe(1.5);
    expect(transform.tx).toBeCloseTo(0.3);
  });

  it("반전 플래그가 변환에 반영된다", () => {
    const session = { ...baseSession(), flipBoth: true, flipVertical: true };
    const transform = resolvePaneTransform(session, COMPARE_VIEWPORT_IDENTITY, session.pool[0].source);
    expect(transform.flipX).toBe(-1);
    expect(transform.flipY).toBe(-1);
  });

  it("확대는 중심점을 고정하고 배율 범위를 지킨다", () => {
    const zoomed = zoomCompareViewport(COMPARE_VIEWPORT_IDENTITY, 2, { x: 0.5, y: 0.5 });
    expect(zoomed.scale).toBe(2);
    expect(zoomed.tx).toBeCloseTo(-0.5);
    expect(clampCompareScale(100)).toBe(8);
    expect(clampCompareScale(0)).toBe(0.25);
    expect(clampCompareScale(Number.NaN)).toBe(1);
  });

  it("이동은 ±1 범위로 묶인다", () => {
    const panned = panCompareViewport(COMPARE_VIEWPORT_IDENTITY, { dx: 5, dy: -5 });
    expect(panned.tx).toBe(1);
    expect(panned.ty).toBe(-1);
  });

  it("오프셋은 ±0.25로 묶이고 0이면 정리되며 정렬 판정이 맞는다", () => {
    let session = baseSession();
    const source = session.pool[0].source;
    session = nudgeCompareOffset(session, source, { dx: 1, dy: 0 });
    expect(session.offsets[compareSourceKey(source)].dx).toBe(0.25);
    expect(comparePanesAligned({ ...session, panes: [source] })).toBe(false);
    session = setCompareOffset(session, source, { dx: 0, dy: 0 });
    expect(session.offsets[compareSourceKey(source)]).toBeUndefined();
    expect(comparePanesAligned({ ...session, panes: [source] })).toBe(true);
    expect(clampCompareOpacity(2)).toBe(1);
    expect(clampCompareOpacity(-1)).toBe(0);
  });
});

describe("contain 보정·좌표", () => {
  it("세로로 긴 이미지는 좌우 여백이 생긴다", () => {
    const rect = computeCompareContainRect(400, 400, 200, 400);
    expect(rect.widthPct).toBeCloseTo(50);
    expect(rect.leftPct).toBeCloseTo(25);
    expect(rect.heightPct).toBeCloseTo(100);
  });

  it("반전이 켜지면 클릭 좌표가 되돌려진다", () => {
    expect(comparePointFromPaneLocal({ x: 0.2, y: 0.3 }, true, false)).toEqual({ x: 0.8, y: 0.3 });
    expect(comparePointFromPaneLocal({ x: 0.2, y: 0.3 }, false, true)).toEqual({ x: 0.2, y: 0.7 });
    expect(comparePointFromPaneLocal({ x: 2, y: -1 }, false, false)).toEqual({ x: 1, y: 0 });
  });
});

describe("스포이드 색상", () => {
  it("RGB에서 HEX·HSV를 만든다", () => {
    const red = compareColorFromRgb(255, 0, 0);
    expect(red.hex).toBe("#FF0000");
    expect(red.h).toBe(0);
    expect(red.s).toBe(100);
    expect(red.v).toBe(100);
    const gray = compareColorFromRgb(128, 128, 128);
    expect(gray.hex).toBe("#808080");
    expect(gray.s).toBe(0);
  });
});

function documentWithComparePins(session: CompareSession): StudioCommentsDocument {
  const me = { id: "me", displayName: "나" };
  const artist = { id: "artist-1", displayName: "선화 작가" };
  let doc = createEmptyStudioCommentsDocument();
  const lineItem = session.pool.find((item) => item.source.kind === "revision" && item.source.revisionId === "line-1")!;
  const externalItem = session.pool.find((item) => item.source.kind === "external")!;
  doc = addStudioCommentThread(doc, {
    id: "comment_urgent",
    anchor: createCompareImageAnchor(lineItem.id, { x: 0.4, y: 0.5 }, externalItem.id),
    author: me,
    body: `${MANUSCRIPT_PIN_URGENT_PREFIX}이 부분 선이 시안과 다릅니다.`,
  }, new Date("2026-10-13T01:00:00.000Z"));
  doc = assignStudioCommentThread(doc, "comment_urgent", artist, new Date("2026-10-13T01:05:00.000Z"));
  doc = addStudioCommentThread(doc, {
    id: "comment_done",
    anchor: createCompareImageAnchor(externalItem.id, { x: 0.1, y: 0.2 }),
    author: me,
    body: "여기는 확인 완료.",
  }, new Date("2026-10-13T02:00:00.000Z"));
  doc = resolveStudioCommentThread(doc, "comment_done", artist, new Date("2026-10-13T03:00:00.000Z"));
  return doc;
}

describe("비교 핀 파생·게이트", () => {
  it("compare-image 앵커만 핀으로 해석하고 상대 소스 라벨을 붙인다", () => {
    const session = baseSession();
    const doc = documentWithComparePins(session);
    const pins = commentsDocumentToComparePins(doc, session.pool);
    expect(pins).toHaveLength(2);
    const urgent = pins.find((pin) => pin.threadId === "comment_urgent")!;
    expect(urgent.status).toBe("urgent");
    expect(urgent.body).toBe("이 부분 선이 시안과 다릅니다.");
    expect(urgent.pairedLabel).toBe("시안.png");
    expect(urgent.assigneeName).toBe("선화 작가");
    expect(urgent.poolLabel).toContain("선화");
    const done = pins.find((pin) => pin.threadId === "comment_done")!;
    expect(done.status).toBe("resolved");
    expect(done.number).toBe(2);
  });

  it("게이트 집계는 미해결·긴급과 출처 라벨을 센다", () => {
    const session = baseSession();
    const summary = summarizeComparePinGate(documentWithComparePins(session), session.pool);
    expect(summary.openCount).toBe(1);
    expect(summary.urgentOpenCount).toBe(1);
    expect(summary.urgentSourceLabels).toHaveLength(1);
    expect(summary.urgentSourceLabels[0]).toContain("선화");
  });

  it("풀에서 빠진 소스의 핀도 기록으로 남는다", () => {
    const session = baseSession();
    const doc = documentWithComparePins(session);
    const pins = commentsDocumentToComparePins(doc, []);
    expect(pins).toHaveLength(2);
    expect(pins[0].sourceKind).toBeNull();
  });

  it("앵커 좌표는 0..1로 묶이고 자기 자신은 상대 소스가 되지 않는다", () => {
    const anchor = createCompareImageAnchor("pool-1", { x: 1.4, y: -0.2 }, "pool-1");
    expect(anchor.x).toBe(1);
    expect(anchor.y).toBe(0);
    expect(anchor.pairedPoolItemId).toBeUndefined();
  });
});

describe("검수 프리셋", () => {
  it("전 회차와 비교: 같은 컷 번호 페이지를 상대 페인에 배치한다", () => {
    // 컷 번호가 다른 페이지(pg-12)를 먼저 풀에 넣어도 34컷이 골라져야 한다
    const current = { ...revisionItem("line", "line-1", "선화"), id: "revision:line:line-1", label: "선화 34컷" };
    let session = createEmptyCompareSession("ep-1");
    session = addComparePoolItems(session, [
      current,
      poolItemFromPage({ projectId: "p1", episodeId: "ep-0", pageId: "pg-12", label: "11화 12컷", imageUrl: null, addedBy: "me", addedAt: NOW }),
      poolItemFromPage({ projectId: "p1", episodeId: "ep-0", pageId: "pg-34", label: "11화 34컷", imageUrl: null, addedBy: "me", addedAt: NOW }),
    ]);
    session = { ...session, panes: [current.source] };
    const result = applyComparePreset(session, "previous-episode");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.panes).toHaveLength(2);
      expect(compareSourceKey(result.session.panes[1])).toBe("page:p1:ep-0:pg-34");
    }
  });

  it("시안과 비교: external이 없으면 실패 사유를 돌려준다", () => {
    let session = createEmptyCompareSession("ep-1");
    session = addComparePoolItem(session, revisionItem("line", "line-1", "선화"));
    session = { ...session, panes: [session.pool[0].source] };
    const result = applyComparePreset(session, "external-brief");
    expect(result).toEqual({ ok: false, reason: "no-counterpart" });
  });

  it("콘티와 비교: 지정한 콘티 소스를 상대 페인에 배치한다", () => {
    let session = baseSession();
    const line = session.pool.find((item) => item.source.kind === "revision" && item.source.revisionId === "line-1")!;
    const storyboard = session.pool.find((item) => item.source.kind === "revision" && item.source.processId === "storyboard")!;
    session = { ...session, panes: [line.source] };
    const result = applyComparePreset(session, "storyboard", { storyboardSource: storyboard.source });
    expect(result.ok).toBe(true);
    if (result.ok) expect(compareSourceKey(result.session.panes[1])).toBe("revision:storyboard:sb-1");
  });

  it("라벨 숫자 토큰을 뽑는다", () => {
    expect(compareLabelNumberToken("12화 34컷")).toBe("34");
    expect(compareLabelNumberToken("버전 없음")).toBeNull();
  });

  it("컷 표기가 붙은 숫자를 우선하고, 컷 표기가 없는 라벨만 첫 숫자로 폴백한다", () => {
    // 회차 번호가 앞에 오거나 버전 숫자가 뒤에 붙어도 컷 번호를 고른다(공백이 끼어도 같다).
    expect(compareLabelNumberToken("11화 · 선화 34 컷")).toBe("34");
    expect(compareLabelNumberToken("34컷 선화 v2")).toBe("34");
    // 컷 표기가 없는 라벨은 기존처럼 첫 숫자를 쓴다.
    expect(compareLabelNumberToken("선화 v3")).toBe("3");
    expect(compareLabelNumberToken("12화 · 선화")).toBe("12");
  });
});
