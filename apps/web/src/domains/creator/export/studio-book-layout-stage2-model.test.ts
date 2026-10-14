import { describe, expect, it } from "vitest";
import { BOOK_TRIM_PRESETS } from "./studio-book-layout-model";
import {
  buildBookPagination,
  canAdvanceProofStage,
  diffPrintRuns,
  evaluateProofChecks,
  formatFolio,
  resolveParentElements,
  DEFAULT_PARENT_TEMPLATES,
  type BookPageInput,
} from "./studio-book-layout-stage2-model";

const spec = BOOK_TRIM_PRESETS[0].spec; // 신국판

const content = (id: string, extra: Partial<BookPageInput> = {}): BookPageInput => ({
  id,
  sectionKind: "content",
  contentHash: `h-${id}`,
  ...extra,
});

describe("2A 스프레드 페이지네이션", () => {
  it("좌철: 첫 본문은 오른쪽 면, 스프레드는 좌우 쌍으로 묶인다", () => {
    const result = buildBookPagination(
      [content("p1"), content("p2"), content("p3"), content("p4")],
      spec,
      { binding: "left" },
    );
    expect(result.pages.map((p) => p.side)).toEqual(["right", "left", "right", "left"]);
    expect(result.spreads).toHaveLength(2);
    expect(result.spreads[0].leftPhysicalIndex).toBe(1);
    expect(result.spreads[0].rightPhysicalIndex).toBe(0);
    expect(result.spreads[0].media?.width).toBeGreaterThan(0);
    expect(result.pages.map((p) => p.folio)).toEqual([1, 2, 3, 4]);
  });

  it("우철: 첫 본문은 왼쪽 면이다", () => {
    const result = buildBookPagination([content("p1"), content("p2")], spec, {
      binding: "right",
    });
    expect(result.pages.map((p) => p.side)).toEqual(["left", "right"]);
  });

  it("챕터 시작면이 어긋나면 백지를 자동 삽입하고 경고한다", () => {
    const result = buildBookPagination(
      [
        content("p1"),
        content("opener", {
          sectionKind: "chapter-opener",
          chapterId: "c2",
          chapterTitle: "2화",
        }),
        content("p2"),
      ],
      spec,
      { binding: "left" }, // 시작면 기본 = right. p1=right라 다음은 left → 백지 필요
    );
    const opener = result.pages.find((p) => p.inputId === "opener");
    expect(opener?.side).toBe("right");
    expect(result.pages.some((p) => p.isInsertedBlank)).toBe(true);
    expect(result.warnings.some((w) => w.code === "chapter-opener-side-adjusted")).toBe(true);
  });

  it("표지는 단면으로 분리되고 쪽번호를 차지하지 않는다", () => {
    const result = buildBookPagination(
      [{ id: "cov", sectionKind: "cover" }, content("p1")],
      spec,
      { binding: "left" },
    );
    expect(result.pages[0].side).toBe("single");
    expect(result.pages[0].spreadIndex).toBeNull();
    expect(result.pages[1].folio).toBe(1);
  });

  it("홀수 페이지면 마지막 펼침 경고를 남긴다", () => {
    const result = buildBookPagination([content("p1")], spec, { binding: "left" });
    expect(result.warnings.some((w) => w.code === "odd-total-pages")).toBe(true);
  });
});

describe("2B 부모 페이지", () => {
  it("본문 페이지에 쪽번호(바깥 하단)와 작품명이 자동 해소된다", () => {
    const pagination = buildBookPagination(
      [content("p1", { chapterTitle: "1화" }), content("p2", { chapterTitle: "1화" })],
      spec,
      { binding: "left" },
    );
    const resolved = resolveParentElements(DEFAULT_PARENT_TEMPLATES, pagination.pages[0], {
      workTitle: "내 작품",
    });
    const folio = resolved.find((e) => e.kind === "folio");
    expect(folio?.text).toBe("1");
    expect(folio?.anchor).toBe("bottom-outside");
    expect(resolved.some((e) => e.kind === "work-title" && e.text === "내 작품")).toBe(true);
    // 오른쪽 면의 바깥쪽 = 오른쪽 → 박스가 안전 영역 오른쪽 1/3에 있다
    expect(folio!.box.x).toBeGreaterThan(pagination.pages[0].boxes.safe.x);
  });

  it("백지에는 자동 요소를 붙이지 않는다(템플릿 hide 규칙)", () => {
    const pagination = buildBookPagination(
      [content("p1"), { id: "b", sectionKind: "blank" }, content("p2")],
      spec,
      { binding: "left", chapterOpenerSide: "any" },
    );
    const blank = pagination.pages.find((p) => p.sectionKind === "blank")!;
    const resolved = resolveParentElements(DEFAULT_PARENT_TEMPLATES, blank, {
      workTitle: "내 작품",
    });
    expect(resolved).toHaveLength(0);
  });

  it("쪽번호 서식: 대시형과 로마자", () => {
    expect(formatFolio(3, "arabic")).toBe("3");
    expect(formatFolio(3, "arabic-dash")).toBe("- 3 -");
    expect(formatFolio(4, "roman-lower")).toBe("iv");
    expect(formatFolio(9, "roman-lower")).toBe("ix");
    expect(formatFolio(3, "none")).toBe("");
  });
});

describe("2C 재인쇄 검수", () => {
  it("내용 해시가 바뀐 페이지만 변경으로 잡고 재검수 범위를 한정한다", () => {
    const before = buildBookPagination([content("p1"), content("p2")], spec, {
      binding: "left",
    });
    const afterInputs = [content("p1"), { ...content("p2"), contentHash: "changed" }];
    const after = buildBookPagination(afterInputs, spec, { binding: "left" });
    const diff = diffPrintRuns(
      { runId: "r1", editionLabel: "초판", structureHash: "s1", pages: before.pages },
      { runId: "r2", editionLabel: "재쇄", structureHash: "s1", pages: after.pages },
    );
    expect(diff.structureChanged).toBe(false);
    expect(diff.changedPhysicalIndexes).toEqual([1]);
    expect(diff.reproofPhysicalIndexes).toEqual([1]);
  });

  it("구조 해시가 바뀌면 전 페이지 재검수를 강제한다", () => {
    const pages = buildBookPagination([content("p1"), content("p2")], spec, {
      binding: "left",
    }).pages;
    const diff = diffPrintRuns(
      { runId: "r1", editionLabel: "초판", structureHash: "s1", pages },
      { runId: "r2", editionLabel: "재쇄", structureHash: "s2", pages },
    );
    expect(diff.structureChanged).toBe(true);
    expect(diff.reproofPhysicalIndexes).toEqual([0, 1]);
  });

  it("검수 fail이 있으면 승인 단계로 전이할 수 없다", () => {
    const pagination = buildBookPagination([content("p1"), content("p2")], spec, {
      binding: "left",
    });
    const checks = evaluateProofChecks(pagination, null);
    expect(checks.every((c) => c.status !== "fail")).toBe(true);
    expect(canAdvanceProofStage("proof-review", "approved", checks)).toBe(true);
    expect(
      canAdvanceProofStage("proof-review", "approved", [
        { id: "folio-continuity", status: "fail", message: "x" },
      ]),
    ).toBe(false);
    expect(canAdvanceProofStage("draft", "approved", checks)).toBe(false);
  });
});
