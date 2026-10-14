import { describe, expect, it } from "vitest";

import type { StudioCommentsDocument, StudioCommentThread } from "../studio-comments";
import {
  buildPinPatternPlaybookCard,
  buildPinPatternQcChecks,
  buildPinPatternReport,
  classifyPinPatternCategory,
  pinPatternQcItemId,
  pinPatternSourcesFromDocument,
  type PinPatternSourcePin,
} from "./pin-pattern-report-model";

function source(partial: Partial<PinPatternSourcePin> & { readonly threadId: string }): PinPatternSourcePin {
  return {
    pageId: "page-1",
    body: "",
    status: "resolved",
    wasUrgent: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    ...partial,
  };
}

function thread(partial: Partial<StudioCommentThread> & { readonly id: string }): StudioCommentThread {
  const resolved = partial.resolved ?? false;
  return {
    author: { displayName: "PD" },
    body: "",
    mentions: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    anchor: { type: "point", pageId: "page-1", x: 0.5, y: 0.5 },
    replies: [],
    ...(resolved ? { resolvedAt: "2026-09-02T00:00:00.000Z" } : {}),
    ...partial,
    resolved,
  } as StudioCommentThread;
}

describe("classifyPinPatternCategory", () => {
  it("키워드로 유형을 추정한다 (손 방향 → 해부학, 말풍선 꼬리 → 말풍선)", () => {
    expect(classifyPinPatternCategory("왼손 방향이 반대예요. 손가락도 어색해요.")).toBe("anatomy");
    expect(classifyPinPatternCategory("말풍선 꼬리 방향이 화자와 반대예요.")).toBe("balloon");
    expect(classifyPinPatternCategory("대사에 오타가 있어요.")).toBe("dialogue");
    expect(classifyPinPatternCategory("배경 원근이 어긋나요.")).toBe("background");
  });

  it("수동 해시태그가 키워드 추정보다 우선한다", () => {
    // 본문에는 '손'이 있지만 작가가 직접 단 #말풍선 태그가 이긴다.
    expect(classifyPinPatternCategory("손을 가리는 풍선 위치 #말풍선")).toBe("balloon");
    expect(classifyPinPatternCategory("여기 다시 봐 주세요 #설정")).toBe("continuity");
  });

  it("어느 키워드도 없으면 other다", () => {
    expect(classifyPinPatternCategory("이 컷 다시 확인 부탁해요.")).toBe("other");
  });
});

describe("pinPatternSourcesFromDocument", () => {
  it("point 앵커만 모으고 긴급 접두사를 벗기며 상태를 복원한다", () => {
    const document: StudioCommentsDocument = {
      version: 1,
      threads: [
        thread({ id: "t1", body: "[긴급] 손 방향 반대예요.", resolved: true }),
        thread({ id: "t2", body: "말풍선 꼬리 확인해 주세요." }),
        thread({
          id: "t3",
          body: "페이지 전체 의견",
          anchor: { type: "page", pageId: "page-1" },
          resolved: true,
        }),
      ],
    } as StudioCommentsDocument;
    const sources = pinPatternSourcesFromDocument(document);
    expect(sources.map((entry) => entry.threadId)).toEqual(["t1", "t2"]);
    expect(sources[0]).toMatchObject({ body: "손 방향 반대예요.", status: "resolved", wasUrgent: true, pageId: "page-1" });
    expect(sources[1]).toMatchObject({ status: "open", wasUrgent: false });
  });
});

describe("buildPinPatternReport", () => {
  const sources: PinPatternSourcePin[] = [
    source({ threadId: "a1", body: "손 방향이 반대예요.", createdAt: "2026-09-01T00:00:00.000Z" }),
    source({ threadId: "a2", body: "손가락 관절이 꺾였어요.", createdAt: "2026-09-03T00:00:00.000Z", wasUrgent: true }),
    source({ threadId: "a3", body: "포즈가 어색해요. 팔 비율 확인.", createdAt: "2026-09-05T00:00:00.000Z", pageId: "page-2" }),
    source({ threadId: "b1", body: "말풍선 꼬리 방향 반대예요.", createdAt: "2026-09-02T00:00:00.000Z" }),
    source({ threadId: "b2", body: "말풍선 꼬리가 다른 사람을 가리켜요.", createdAt: "2026-09-04T00:00:00.000Z" }),
    source({ threadId: "o1", body: "대사 오타 있어요.", status: "open", createdAt: "2026-09-06T00:00:00.000Z" }),
  ];

  it("해결된 핀만 유형별로 집계하고 반복 TOP 순서로 정렬한다", () => {
    const report = buildPinPatternReport(sources);
    expect(report.totalPinCount).toBe(6);
    expect(report.resolvedPinCount).toBe(5);
    expect(report.openPinCount).toBe(1);
    // 미해결 대사 핀은 패턴에 들어가지 않는다.
    expect(report.patterns.map((entry) => entry.categoryId)).toEqual(["anatomy", "balloon"]);
    const anatomy = report.patterns[0];
    expect(anatomy.count).toBe(3);
    expect(anatomy.share).toBeCloseTo(3 / 5);
    expect(anatomy.pageCount).toBe(2);
    expect(anatomy.urgentCount).toBe(1);
    expect(anatomy.threadIds).toEqual(["a1", "a2", "a3"]);
    expect(anatomy.firstAt).toBe("2026-09-01T00:00:00.000Z");
    expect(anatomy.lastAt).toBe("2026-09-05T00:00:00.000Z");
    expect(anatomy.promotable).toBe(true);
    expect(report.patterns[1].promotable).toBe(false);
  });

  it("예시는 긴급 접두사 없는 본문을 최대 개수까지만 담는다", () => {
    const report = buildPinPatternReport(sources, { exampleLimit: 2 });
    expect(report.patterns[0].examples.map((example) => example.threadId)).toEqual(["a1", "a2"]);
    expect(report.topPatterns).toHaveLength(2);
  });

  it("해결된 핀이 없으면 빈 리포트다", () => {
    const report = buildPinPatternReport([source({ threadId: "x", status: "open", body: "손" })]);
    expect(report.resolvedPinCount).toBe(0);
    expect(report.patterns).toEqual([]);
    expect(report.topPatterns).toEqual([]);
  });

  it("minOccurrences를 낮추면 승격 후보가 늘어난다", () => {
    const report = buildPinPatternReport(sources, { minOccurrences: 2 });
    expect(report.patterns.every((entry) => entry.promotable)).toBe(true);
  });
});

describe("승격 재료", () => {
  const resolvedSources: PinPatternSourcePin[] = [
    source({ threadId: "a1", body: "손 방향 반대예요." }),
    source({ threadId: "a2", body: "손가락 꺾였어요." }),
    source({ threadId: "a3", body: "팔 비율 봐 주세요." }),
  ];

  it("QC 체크는 승격 패턴별로 이번 회차 열린 핀 수를 센다", () => {
    const report = buildPinPatternReport(resolvedSources);
    const episodeSources: PinPatternSourcePin[] = [
      source({ threadId: "e1", body: "손 방향 또 반대예요.", status: "open" }),
      source({ threadId: "e2", body: "말풍선 꼬리 확인.", status: "open" }),
    ];
    const checks = buildPinPatternQcChecks(report.patterns, episodeSources);
    expect(checks).toHaveLength(1);
    expect(checks[0].id).toBe("pin-pattern:anatomy");
    expect(checks[0].id).toBe(pinPatternQcItemId("anatomy"));
    expect(checks[0].openCount).toBe(1);
    expect(checks[0].label.ko).toContain("해부학·손·포즈");
  });

  it("플레이북 카드는 근거 스레드와 예시를 담는다", () => {
    const report = buildPinPatternReport(resolvedSources);
    const card = buildPinPatternPlaybookCard(report.patterns[0]);
    expect(card.categoryId).toBe("anatomy");
    expect(card.occurrences).toBe(3);
    expect(card.evidenceThreadIds).toEqual(["a1", "a2", "a3"]);
    expect(card.title.ko).toContain("반복 지적 규칙");
    expect(card.body.ko).toContain("3번 반복");
    expect(card.body.ko).toContain("손 방향 반대예요.");
  });
});
