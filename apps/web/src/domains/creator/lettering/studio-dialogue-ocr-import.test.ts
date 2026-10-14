import { describe, expect, it } from "vitest";

import type { DialoguePageLike } from "./studio-dialogue-batch";
import {
  applyOcrTranslationResults,
  buildOcrImportDrafts,
  buildOcrImportElements,
  groupOcrDrafts,
  normalizeOcrText,
  ocrBlocksFromPlainText,
  ocrDraftsNeedingTranslation,
  ocrElementIdForDraft,
  setOcrDraftReviewStatus,
  setOcrDraftTranslation,
  summarizeOcrImport,
  type OcrImportDraft,
} from "./studio-dialogue-ocr-import";

const PANEL = { x: 0, y: 0, w: 720, h: 1200 };

describe("normalizeOcrText", () => {
  it("줄마다 공백을 접고 빈 줄을 버린다", () => {
    expect(normalizeOcrText("  안녕   하세요 \r\n\r\n 다음  줄 ")).toBe("안녕 하세요\n다음 줄");
    expect(normalizeOcrText("   \n  ")).toBe("");
  });
});

describe("buildOcrImportDrafts", () => {
  it("박스 있는 블록을 읽기 순서(행 밴드→x)로 정렬하고 박스를 배치로 쓴다", () => {
    const { drafts, skippedEmpty } = buildOcrImportDrafts([
      {
        pageId: "p1",
        panel: PANEL,
        blocks: [
          { text: "두 번째 줄", box: { x: 100, y: 200, width: 200, height: 60 } },
          { text: "첫 줄 오른쪽", box: { x: 300, y: 30, width: 200, height: 60 } },
          { text: "첫 줄 왼쪽", box: { x: 40, y: 10, width: 200, height: 60 } },
          { text: "   " },
        ],
      },
    ]);
    expect(skippedEmpty).toBe(1);
    expect(drafts.map((d) => d.sourceText)).toEqual(["첫 줄 왼쪽", "첫 줄 오른쪽", "두 번째 줄"]);
    expect(drafts[0]).toMatchObject({
      pageId: "p1",
      pageIndex: 0,
      translation: null,
      status: null,
      placementSource: "ocr-box",
      placement: { x: 40, y: 10, width: 200, height: 60, source: "ocr-box" },
    });
    expect(drafts[0].id).toBe("p1:ocr:0");
  });

  it("패널 밖으로 나간 박스는 패널 안으로 클램프한다", () => {
    const { drafts } = buildOcrImportDrafts([
      {
        pageId: "p1",
        panel: PANEL,
        blocks: [{ text: "벗어난 대사", box: { x: 700, y: 1190, width: 200, height: 80 } }],
      },
    ]);
    expect(drafts[0].placement).toMatchObject({ x: 520, y: 1120, width: 200, height: 80 });
  });

  it("신뢰도는 0~1로 정규화하고 없으면 null, 임계 미만이면 lowConfidence다", () => {
    const { drafts } = buildOcrImportDrafts([
      {
        pageId: "p1",
        blocks: [
          { text: "확실", confidence: 0.95 },
          { text: "애매", confidence: 0.4 },
          { text: "모름" },
          { text: "이상한 값", confidence: Number.NaN },
        ],
      },
    ]);
    expect(drafts.map((d) => d.confidence)).toEqual([0.95, 0.4, null, null]);
    expect(drafts.map((d) => d.lowConfidence)).toEqual([false, true, false, false]);
  });

  it("패널이 있으면 박스 없는 블록은 자동 배치되고, 없으면 쌓기 배치로 출처가 남는다", () => {
    const withPanel = buildOcrImportDrafts([
      { pageId: "p1", panel: PANEL, blocks: [{ text: "박스 없는 대사" }] },
    ]);
    expect(withPanel.drafts[0].placementSource).toBe("auto-layout");
    expect(withPanel.drafts[0].placement).not.toBeNull();

    const withoutPanel = buildOcrImportDrafts([
      { pageId: "p1", blocks: [{ text: "첫째" }, { text: "둘째" }] },
    ]);
    expect(withoutPanel.drafts.map((d) => d.placementSource)).toEqual(["stacked", "stacked"]);
    const first = withoutPanel.drafts[0].placement;
    const second = withoutPanel.drafts[1].placement;
    expect(first?.x).toBe(24);
    expect(second?.y).toBeGreaterThan(first?.y ?? 0);
  });

  it("공급자 id가 있으면 초안 id로 그대로 쓴다", () => {
    const { drafts } = buildOcrImportDrafts([
      { pageId: "p1", blocks: [{ id: "seg-7", text: "식별자 있는 블록" }] },
    ]);
    expect(drafts[0].id).toBe("seg-7");
  });
});

describe("ocrBlocksFromPlainText", () => {
  it("빈 줄로 나뉜 덩어리를 블록으로 만든다", () => {
    expect(ocrBlocksFromPlainText("첫 대사\n이어지는 줄\n\n둘째 대사\n\n\n")).toEqual([
      { text: "첫 대사\n이어지는 줄" },
      { text: "둘째 대사" },
    ]);
  });
});

describe("번역 연결", () => {
  const build = () =>
    buildOcrImportDrafts([
      { pageId: "p1", blocks: [{ text: "안녕하세요" }, { text: "감사합니다" }] },
    ]).drafts;

  it("미번역 초안만 번역 입력 형태로 내보낸다", () => {
    const drafts = build();
    expect(ocrDraftsNeedingTranslation(drafts)).toEqual([
      { id: drafts[0].id, text: "안녕하세요" },
      { id: drafts[1].id, text: "감사합니다" },
    ]);
    const filled = applyOcrTranslationResults(drafts, new Map([[drafts[0].id, "Hello"]]));
    expect(ocrDraftsNeedingTranslation(filled)).toEqual([
      { id: drafts[1].id, text: "감사합니다" },
    ]);
  });

  it("요청하지 않은 id와 공백 결과는 무시하고, 바뀐 게 없으면 같은 배열을 돌려준다", () => {
    const drafts = build();
    expect(applyOcrTranslationResults(drafts, new Map([["없는 id", "x"]]))).toBe(drafts);
    expect(applyOcrTranslationResults(drafts, new Map([[drafts[0].id, "   "]]))).toBe(drafts);
    const filled = applyOcrTranslationResults(drafts, new Map([[drafts[0].id, "Hello"]]));
    expect(filled).not.toBe(drafts);
    expect(filled[0].translation).toBe("Hello");
    expect(filled[1]).toBe(drafts[1]); // 안 바뀐 초안은 참조 유지.
  });

  it("번역문을 고치면 검수 상태가 미검수로 돌아간다", () => {
    let drafts: readonly OcrImportDraft[] = build();
    drafts = applyOcrTranslationResults(drafts, new Map([[drafts[0].id, "Hello"]]));
    drafts = setOcrDraftReviewStatus(drafts, drafts[0].id, "approved");
    expect(drafts[0].status).toBe("approved");
    drafts = setOcrDraftTranslation(drafts, drafts[0].id, "Hi there");
    expect(drafts[0].translation).toBe("Hi there");
    expect(drafts[0].status).toBeNull();
  });
});

describe("setOcrDraftReviewStatus", () => {
  it("미번역 초안은 승인할 수 없고, 상태가 같으면 같은 배열을 돌려준다", () => {
    const drafts = buildOcrImportDrafts([{ pageId: "p1", blocks: [{ text: "대사" }] }]).drafts;
    expect(setOcrDraftReviewStatus(drafts, drafts[0].id, "approved")).toBe(drafts);
    const filled = applyOcrTranslationResults(drafts, new Map([[drafts[0].id, "Line"]]));
    const approved = setOcrDraftReviewStatus(filled, filled[0].id, "approved");
    expect(approved[0].status).toBe("approved");
    expect(setOcrDraftReviewStatus(approved, approved[0].id, "approved")).toBe(approved);
    expect(setOcrDraftReviewStatus(approved, approved[0].id, null)[0].status).toBeNull();
  });
});

describe("buildOcrImportElements", () => {
  const pages: DialoguePageLike[] = [
    { id: "p1", elements: [{ id: "existing", type: "bubble", text: "기존 대사" }] },
  ];

  function draftsAt(stage: "raw" | "translated" | "approved" | "needs-edit") {
    let drafts: readonly OcrImportDraft[] = buildOcrImportDrafts([
      {
        pageId: "p1",
        panel: PANEL,
        blocks: [{ text: "새 대사", box: { x: 10, y: 20, width: 180, height: 60 } }],
      },
    ]).drafts;
    if (stage === "raw") return drafts;
    drafts = applyOcrTranslationResults(drafts, new Map([[drafts[0].id, "New line"]]));
    if (stage === "translated") return drafts;
    return setOcrDraftReviewStatus(drafts, drafts[0].id, stage === "approved" ? "approved" : "needs-edit");
  }

  it("승인된 초안만 번역문 말풍선으로 페이지에 덧붙인다", () => {
    const drafts = draftsAt("approved");
    const result = buildOcrImportElements(pages, drafts);
    expect(result.imported).toBe(1);
    expect(result.blocked).toEqual([]);
    expect(result.pages).not.toBe(pages);
    expect(result.pages[0].elements).toHaveLength(2);
    expect(result.pages[0].elements[1]).toMatchObject({
      id: ocrElementIdForDraft(drafts[0].id),
      type: "bubble",
      text: "New line",
      x: 10,
      y: 20,
      width: 180,
      height: 60,
    });
    expect(pages[0].elements).toHaveLength(1); // 입력은 변형하지 않는다.
  });

  it("미번역·미검수·수정 필요는 사유와 함께 막히고 페이지는 그대로다", () => {
    expect(buildOcrImportElements(pages, draftsAt("raw")).blocked).toEqual([
      { draftId: draftsAt("raw")[0].id, reason: "untranslated" },
    ]);
    const translated = buildOcrImportElements(pages, draftsAt("translated"));
    expect(translated.blocked[0].reason).toBe("unreviewed");
    expect(translated.pages).toBe(pages);
    expect(buildOcrImportElements(pages, draftsAt("needs-edit")).blocked[0].reason).toBe(
      "needs-edit"
    );
  });

  it("이미 같은 id의 요소가 있으면 중복으로 막는다", () => {
    const drafts = draftsAt("approved");
    const once = buildOcrImportElements(pages, drafts);
    const twice = buildOcrImportElements(once.pages, drafts);
    expect(twice.imported).toBe(0);
    expect(twice.blocked[0].reason).toBe("duplicate-id");
  });
});

describe("summarizeOcrImport / groupOcrDrafts", () => {
  it("진척 숫자와 페이지 그룹을 만든다", () => {
    let drafts: readonly OcrImportDraft[] = buildOcrImportDrafts([
      { pageId: "p1", blocks: [{ text: "하나", confidence: 0.3 }] },
      { pageId: "p2", blocks: [{ text: "둘" }] },
    ]).drafts;
    drafts = applyOcrTranslationResults(drafts, new Map([[drafts[0].id, "One"]]));
    drafts = setOcrDraftReviewStatus(drafts, drafts[0].id, "approved");
    expect(summarizeOcrImport(drafts)).toEqual({
      total: 2,
      translated: 1,
      untranslated: 1,
      approved: 1,
      needsEdit: 0,
      unreviewed: 0,
      lowConfidence: 1,
      unplaced: 0,
    });
    const groups = groupOcrDrafts(drafts);
    expect(groups.map((g) => g.pageId)).toEqual(["p1", "p2"]);
    expect(groups[0].pageIndex).toBe(0);
  });
});
