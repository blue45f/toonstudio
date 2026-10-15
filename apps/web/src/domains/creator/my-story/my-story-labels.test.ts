import { describe, expect, it } from "vitest";

import type { MyStoryDraftWarning } from "./my-story-draft";
import {
  myStorySensitiveKindNames,
  myStoryWarningMessage,
  type MyStoryBilingual,
} from "./my-story-labels";

const HANGUL = /[ㄱ-ㆎ가-힣]/u;

/** bt 대역 — 받은 (ko, en) 원문 인자를 기록하고 한국어 쪽을 돌려준다. */
function recordingBt() {
  const calls: { readonly ko: string; readonly en: string }[] = [];
  const bt: MyStoryBilingual = (ko, en) => {
    calls.push({ ko, en });
    return ko;
  };
  return { bt, calls };
}

const WARNINGS: readonly MyStoryDraftWarning[] = [
  { code: "blank-cuts", count: 2 },
  { code: "few-answers", answered: 1, total: 6 },
  { code: "narration-overflow", cutIndexes: [2, 3] },
  { code: "balloon-overflow", cutIndexes: [4] },
  { code: "sensitive-text", kinds: ["phone", "email"] },
];

describe("myStorySensitiveKindNames", () => {
  it("종류 이름을 쉼표로 이어 한국어·영어 원문 한 쌍으로 돌려준다", () => {
    expect(myStorySensitiveKindNames(["phone", "account"])).toEqual({
      ko: "전화번호, 계좌번호",
      en: "phone number, account number",
    });
    expect(myStorySensitiveKindNames([])).toEqual({ ko: "", en: "" });
  });

  it("네 종류 모두 한국어 이름에는 한글이, 영어 이름에는 한글이 없다", () => {
    const names = myStorySensitiveKindNames(["phone", "email", "resident-id", "account"]);
    expect(names.ko.split(", ")).toHaveLength(4);
    expect(names.en.split(", ")).toHaveLength(4);
    expect(HANGUL.test(names.ko)).toBe(true);
    expect(HANGUL.test(names.en)).toBe(false);
  });
});

describe("myStoryWarningMessage", () => {
  it.each(WARNINGS.map((warning) => [warning.code, warning] as const))(
    "%s — bt를 한 번만 부르고 한국어 원문과 영어 원문이 서로 섞이지 않는다",
    (_code, warning) => {
      const { bt, calls } = recordingBt();
      const message = myStoryWarningMessage(bt, warning);
      expect(calls).toHaveLength(1);
      const [call] = calls;
      expect(message).toBe(call?.ko);
      expect(HANGUL.test(call?.ko ?? "")).toBe(true);
      // 영어 원문에는 한글이 한 글자도 없다 — 이미 번역된 조각을 문장 안에 끼우지 않았다는 뜻이다.
      expect(HANGUL.test(call?.en ?? "")).toBe(false);
      for (const text of [call?.ko ?? "", call?.en ?? ""]) {
        expect(text).not.toMatch(/undefined|\[object|\$\{/u);
      }
    },
  );

  it("개수·컷 번호·종류 이름이 두 언어 원문에 모두 들어간다", () => {
    const { bt, calls } = recordingBt();
    myStoryWarningMessage(bt, { code: "blank-cuts", count: 2 });
    myStoryWarningMessage(bt, { code: "few-answers", answered: 1, total: 6 });
    myStoryWarningMessage(bt, { code: "narration-overflow", cutIndexes: [2, 3] });
    myStoryWarningMessage(bt, { code: "sensitive-text", kinds: ["phone", "email"] });
    expect(calls[0]).toMatchObject({ ko: expect.stringContaining("2장"), en: expect.stringContaining("2 panel(s)") });
    expect(calls[1]).toMatchObject({ ko: expect.stringContaining("6개 중 1개"), en: expect.stringContaining("1 of 6") });
    expect(calls[2]).toMatchObject({ ko: expect.stringContaining("컷 2, 3"), en: expect.stringContaining("panel 2, 3") });
    expect(calls[3]).toMatchObject({
      ko: expect.stringContaining("전화번호, 이메일"),
      en: expect.stringContaining("phone number, email address"),
    });
  });
});
