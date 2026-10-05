import { describe, expect, it } from "vitest";

import {
  collectDialogueReviewRows,
  groupDialogueReviewRows,
  setDialogueReviewStatus,
  summarizeDialogueReview,
  updateDialogueTranslationText,
  type DialogueReviewPageLike,
} from "./studio-dialogue-review";
import { SOURCE_LOCALE } from "./studio-dialogue-translate";

function makePage(over: Partial<DialogueReviewPageLike> = {}): DialogueReviewPageLike {
  return {
    id: "p1",
    elements: [
      { id: "b1", type: "bubble", text: "안녕? 민수야" },
      { id: "t1", type: "text", text: "민수의 아침" },
      { id: "s1", type: "sticker", text: "💥" }, // 대사 요소가 아님 — 행에서 제외돼야 한다.
    ],
    dialogueI18n: {
      b1: { [SOURCE_LOCALE]: "안녕? 민수야", en: "Hi? Minsu" },
      // t1 은 번역이 없다(미번역).
    },
    ...over,
  };
}

describe("collectDialogueReviewRows", () => {
  it("대사 요소만 행으로 만들고 원문·번역·미번역을 구분한다", () => {
    const rows = collectDialogueReviewRows([makePage()], "en");
    expect(rows.map((r) => r.id)).toEqual(["b1", "t1"]);
    expect(rows[0]).toMatchObject({
      pageId: "p1",
      pageIndex: 0,
      sourceText: "안녕? 민수야",
      translation: "Hi? Minsu",
      status: null,
    });
    expect(rows[1].sourceText).toBeNull(); // 원문 스냅샷이 없으면 지어내지 않는다.
    expect(rows[1].translation).toBeNull(); // 미번역은 null.
  });

  it("원문 로케일은 검수 대상이 아니라 빈 목록이다", () => {
    expect(collectDialogueReviewRows([makePage()], SOURCE_LOCALE)).toEqual([]);
  });

  it("저장된 검수 상태를 행에 실어 준다", () => {
    const page = makePage({ dialogueReview: { b1: { en: "approved" } } });
    const rows = collectDialogueReviewRows([page], "en");
    expect(rows[0].status).toBe("approved");
    expect(rows[1].status).toBeNull();
  });

  it("페이지 순서를 유지하고 페이지별로 묶을 수 있다", () => {
    const p2: DialogueReviewPageLike = {
      id: "p2",
      elements: [{ id: "b2", type: "bubble", text: "두 번째 페이지" }],
      dialogueI18n: { b2: { [SOURCE_LOCALE]: "두 번째 페이지", en: "Second page" } },
    };
    const rows = collectDialogueReviewRows([makePage(), p2], "en");
    const groups = groupDialogueReviewRows(rows);
    expect(groups.map((g) => g.pageId)).toEqual(["p1", "p2"]);
    expect(groups[1].pageIndex).toBe(1);
    expect(groups[1].rows.map((r) => r.id)).toEqual(["b2"]);
  });
});

describe("summarizeDialogueReview", () => {
  it("전체/번역/승인/수정 필요/미검수/미번역을 센다", () => {
    const page = makePage({
      dialogueI18n: {
        b1: { [SOURCE_LOCALE]: "안녕? 민수야", en: "Hi? Minsu" },
        t1: { [SOURCE_LOCALE]: "민수의 아침", en: "Minsu's morning" },
      },
      dialogueReview: { b1: { en: "approved" }, t1: { en: "needs-edit" } },
    });
    expect(summarizeDialogueReview([page], "en")).toEqual({
      total: 2,
      translated: 2,
      untranslated: 0,
      approved: 1,
      needsEdit: 1,
      unreviewed: 0,
    });
  });

  it("번역이 없으면 전부 미번역으로 센다", () => {
    const summary = summarizeDialogueReview([makePage({ dialogueI18n: undefined })], "en");
    expect(summary.total).toBe(2);
    expect(summary.untranslated).toBe(2);
    expect(summary.translated).toBe(0);
  });
});

describe("updateDialogueTranslationText", () => {
  it("번역문을 고치면 dialogueI18n만 바뀌고 원문·다른 로케일은 그대로다", () => {
    const page = makePage({
      dialogueI18n: { b1: { [SOURCE_LOCALE]: "안녕? 민수야", en: "Hi? Minsu", ja: "やあ、ミンス" } },
    });
    const next = updateDialogueTranslationText([page], {
      pageId: "p1",
      elId: "b1",
      locale: "en",
      text: "Hey, Minsu!",
      visibleLocale: SOURCE_LOCALE,
    });
    expect(next).not.toBe([page]);
    expect(next[0].dialogueI18n?.b1).toEqual({
      [SOURCE_LOCALE]: "안녕? 민수야",
      en: "Hey, Minsu!",
      ja: "やあ、ミンス",
    });
    // 원문이 표시 중이라 el.text(원문)는 건드리지 않는다.
    expect(next[0].elements[0].text).toBe("안녕? 민수야");
    // 입력은 변형되지 않는다.
    expect(page.dialogueI18n?.b1.en).toBe("Hi? Minsu");
  });

  it("그 로케일이 표시 중이면 el.text도 함께 맞춘다", () => {
    const page = makePage();
    page.elements = [{ ...page.elements[0], text: "Hi? Minsu" }, ...page.elements.slice(1)]; // en 표시 중 상태.
    const next = updateDialogueTranslationText([page], {
      pageId: "p1",
      elId: "b1",
      locale: "en",
      text: "Hey, Minsu!",
      visibleLocale: "en",
    });
    expect(next[0].elements[0].text).toBe("Hey, Minsu!");
  });

  it("같은 텍스트면 입력 배열을 그대로(참조 동일) 돌려준다", () => {
    const pages = [makePage()];
    const next = updateDialogueTranslationText(pages, {
      pageId: "p1",
      elId: "b1",
      locale: "en",
      text: "Hi? Minsu",
      visibleLocale: SOURCE_LOCALE,
    });
    expect(next).toBe(pages);
  });

  it("번역문을 비우면 그 로케일이 사라져 미번역으로 돌아가고, 표시 중이면 원문으로 되돌린다", () => {
    const page = makePage();
    page.elements = [{ ...page.elements[0], text: "Hi? Minsu" }, ...page.elements.slice(1)];
    const next = updateDialogueTranslationText([page], {
      pageId: "p1",
      elId: "b1",
      locale: "en",
      text: "  ",
      visibleLocale: "en",
    });
    expect(next[0].dialogueI18n?.b1).toEqual({ [SOURCE_LOCALE]: "안녕? 민수야" });
    expect(next[0].elements[0].text).toBe("안녕? 민수야");
  });

  it("번역이 없던 항목에 새 번역을 넣으면 원문이 표시 중일 때만 원문을 시딩한다", () => {
    const page = makePage();
    const seeded = updateDialogueTranslationText([page], {
      pageId: "p1",
      elId: "t1",
      locale: "en",
      text: "Minsu's morning",
      visibleLocale: SOURCE_LOCALE,
    });
    expect(seeded[0].dialogueI18n?.t1).toEqual({
      [SOURCE_LOCALE]: "민수의 아침",
      en: "Minsu's morning",
    });

    // 다른 로케일이 표시 중이면 el.text는 그 로케일 텍스트라 원문으로 기록하지 않는다.
    const page2 = makePage();
    page2.elements = [...page2.elements.slice(0, 1), { ...page2.elements[1], text: "ミンスの朝" }, ...page2.elements.slice(2)];
    const unseeded = updateDialogueTranslationText([page2], {
      pageId: "p1",
      elId: "t1",
      locale: "en",
      text: "Minsu's morning",
      visibleLocale: "ja",
    });
    expect(unseeded[0].dialogueI18n?.t1).toEqual({ en: "Minsu's morning" });
  });

  it("번역문을 고치면 그 항목의 검수 상태가 사라진다(미검수 복귀)", () => {
    const page = makePage({ dialogueReview: { b1: { en: "approved", ja: "needs-edit" } } });
    const next = updateDialogueTranslationText([page], {
      pageId: "p1",
      elId: "b1",
      locale: "en",
      text: "Hey, Minsu!",
      visibleLocale: SOURCE_LOCALE,
    });
    expect(next[0].dialogueReview?.b1).toEqual({ ja: "needs-edit" }); // 다른 로케일 상태는 유지.
  });

  it("원문 로케일 수정과 대사 아닌 요소·없는 페이지는 무시한다", () => {
    const pages = [makePage()];
    expect(
      updateDialogueTranslationText(pages, {
        pageId: "p1",
        elId: "b1",
        locale: SOURCE_LOCALE,
        text: "원문 바꾸기",
        visibleLocale: SOURCE_LOCALE,
      })
    ).toBe(pages);
    expect(
      updateDialogueTranslationText(pages, {
        pageId: "p1",
        elId: "s1",
        locale: "en",
        text: "Boom",
        visibleLocale: SOURCE_LOCALE,
      })
    ).toBe(pages);
    expect(
      updateDialogueTranslationText(pages, {
        pageId: "nope",
        elId: "b1",
        locale: "en",
        text: "Hey",
        visibleLocale: SOURCE_LOCALE,
      })
    ).toBe(pages);
  });

  it("마지막 번역을 지우면 dialogueI18n 키 자체가 사라진다", () => {
    const page = makePage({
      dialogueI18n: { b1: { en: "Hi? Minsu" } },
      elements: [{ id: "b1", type: "bubble", text: "Hi? Minsu" }],
    });
    const next = updateDialogueTranslationText([page], {
      pageId: "p1",
      elId: "b1",
      locale: "en",
      text: "",
      visibleLocale: "ja",
    });
    expect(next[0].dialogueI18n).toBeUndefined();
  });
});

describe("setDialogueReviewStatus", () => {
  it("승인·수정 필요를 남기고 지울 수 있다", () => {
    const page = makePage();
    const approved = setDialogueReviewStatus([page], {
      pageId: "p1",
      elId: "b1",
      locale: "en",
      status: "approved",
    });
    expect(approved[0].dialogueReview).toEqual({ b1: { en: "approved" } });

    const cleared = setDialogueReviewStatus(approved, {
      pageId: "p1",
      elId: "b1",
      locale: "en",
      status: null,
    });
    expect(cleared[0].dialogueReview).toBeUndefined(); // 남은 상태가 없으면 키 제거.
  });

  it("같은 상태면 참조 동일, 번역 없는 항목에는 상태를 붙이지 않는다", () => {
    const pages = [makePage({ dialogueReview: { b1: { en: "approved" } } })];
    expect(
      setDialogueReviewStatus(pages, { pageId: "p1", elId: "b1", locale: "en", status: "approved" })
    ).toBe(pages);
    expect(
      setDialogueReviewStatus(pages, { pageId: "p1", elId: "t1", locale: "en", status: "approved" })
    ).toBe(pages); // t1 은 en 번역이 없다.
  });

  it("원문 로케일에는 상태를 붙이지 않는다", () => {
    const pages = [makePage()];
    expect(
      setDialogueReviewStatus(pages, {
        pageId: "p1",
        elId: "b1",
        locale: SOURCE_LOCALE,
        status: "approved",
      })
    ).toBe(pages);
  });
});
