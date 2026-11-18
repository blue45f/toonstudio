import { describe, expect, it } from "vitest";

import {
  computeTextBoxBackgroundRect,
  computeTextScaleTransform,
  normalizeStudioTextBoxStyle,
  searchAndReplaceStoryDialogues,
} from "./studio-text-box-style";

import type { BubbleEl, TextEl } from "../studio-element-model";
import type { StoryDialoguePageInput } from "./studio-text-box-style";

describe("studio-text-box-style", () => {
  it("TextBackgroundEnabled/Color/Alpha 및 장평·자폭(50%~200%)을 안전하게 정규화·계산한다", () => {
    const normalized = normalizeStudioTextBoxStyle({
      textBackgroundEnabled: true,
      textBackgroundColor: "#112233",
      textBackgroundAlpha: 0.5,
      textBackgroundPaddingPx: 8,
      textHorizontalRatio: 260, // 상한 200 클램프
      textVerticalRatio: 20, // 하한 50 클램프
    });

    expect(normalized.textHorizontalRatio).toBe(200);
    expect(normalized.textVerticalRatio).toBe(50);

    const scale = computeTextScaleTransform(normalized);
    expect(scale).toEqual({
      scaleX: 2,
      scaleY: 0.5,
      cssTransform: "scale(2, 0.5)",
    });

    const bgRect = computeTextBoxBackgroundRect(
      { x: 40, y: 60, width: 120, height: 40 },
      normalized,
    );
    expect(bgRect).toEqual({
      x: 32,
      y: 52,
      width: 136,
      height: 56,
      fillRgba: "rgba(17, 34, 51, 0.5)",
      hexColor: "#112233",
      alpha: 0.5,
    });

    const disabledRect = computeTextBoxBackgroundRect(
      { x: 40, y: 60, width: 120, height: 40 },
      { ...normalized, textBackgroundEnabled: false },
    );
    expect(disabledRect).toBeNull();
  });

  it("대사 검색·치환이 일반 문자열·정규식·대소문자·온전한 단어·화자·페이지 필터를 지원한다", () => {
    const b1: BubbleEl & { speaker?: string } = {
      id: "b-1",
      type: "bubble",
      variant: "speech",
      text: "선배님, 오늘 선배님과 함께 옥상에 가요! 선배님들 모두요.",
      speaker: "하윤",
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      fill: "#ffffff",
      textFill: "#000000",
      rotation: 0,
    };
    const t1: TextEl & { speaker?: string } = {
      id: "t-1",
      type: "text",
      text: "Hero and heroics and HERO!",
      speaker: "내레이션",
      x: 10,
      y: 10,
      width: 200,
      fontSize: 20,
      fill: "#000000",
      rotation: 0,
    };
    const pages: StoryDialoguePageInput[] = [
      { pageId: "p-1", elements: [b1] },
      { pageId: "p-2", elements: [t1] },
    ];

    // 한글 유니코드 온전한 단어 일치: 조사 없는 단독 "선배님"만 치환("선배님과", "선배님들"은 유지)
    const wholeKor = searchAndReplaceStoryDialogues(pages, {
      search: "선배님",
      replace: "실장님",
      wholeWord: true,
    });
    expect(wholeKor.ok).toBe(true);
    expect(wholeKor.totalMatches).toBe(1);
    const updatedBubble = wholeKor.pages[0]!.elements[0] as BubbleEl;
    expect(updatedBubble.text).toBe("실장님, 오늘 선배님과 함께 옥상에 가요! 선배님들 모두요.");

    // 영문 대소문자 구분 + 온전한 단어 일치("Hero"만 바꾸고 "heroics", "HERO" 제외)
    const caseWord = searchAndReplaceStoryDialogues(pages, {
      search: "Hero",
      replace: "Champion",
      matchCase: true,
      wholeWord: true,
      pageIds: ["p-2"],
    });
    expect(caseWord.totalMatches).toBe(1);
    expect((caseWord.pages[1]!.elements[0] as TextEl).text).toBe("Champion and heroics and HERO!");

    // 정규식 캡처 그룹 + 화자 필터
    const regexRes = searchAndReplaceStoryDialogues(pages, {
      search: "(선배)님",
      replace: "$1!",
      mode: "regex",
      speakerFilter: "하윤",
    });
    expect(regexRes.ok).toBe(true);
    expect(regexRes.totalMatches).toBe(3);
  });

  it("잘못된 정규식·빈 검색어·0길이 패턴에서도 예외 없이 안전하게 동작한다", () => {
    const pages: StoryDialoguePageInput[] = [
      {
        pageId: "p-1",
        elements: [
          {
            id: "t-1",
            type: "text",
            text: "원본 대사 보존 확인",
            x: 0,
            y: 0,
            width: 150,
            fontSize: 24,
            fill: "#000000",
            rotation: 0,
          },
        ],
      },
    ];

    const invalidRegex = searchAndReplaceStoryDialogues(pages, {
      search: "[닫히지않은괄호(",
      replace: "대체",
      mode: "regex",
    });
    expect(invalidRegex.ok).toBe(false);
    expect(invalidRegex.errorMessage).toContain("정규식");
    expect(invalidRegex.pages).toBe(pages);

    const emptySearch = searchAndReplaceStoryDialogues(pages, {
      search: "",
      replace: "대체",
    });
    expect(emptySearch.ok).toBe(false);

    // 0길이 정규식("^")이 들어와도 무한 루프에 빠지지 않는다.
    const zeroLen = searchAndReplaceStoryDialogues(pages, {
      search: "^",
      replace: "머리말",
      mode: "regex",
    });
    expect(zeroLen.ok).toBe(true);
    expect(zeroLen.totalMatches).toBe(0);
  });
});
