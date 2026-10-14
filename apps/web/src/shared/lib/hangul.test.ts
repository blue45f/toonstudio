import { describe, expect, it } from "vitest";

import {
  choseongOf,
  isChoseongQuery,
  matchesHangulText,
  pickJosa,
  withJosa,
} from "./hangul";

describe("hangul (es-hangul 공용 유틸)", () => {
  describe("choseongOf", () => {
    it("한글 음절을 초성으로 바꾸고 비한글은 보존한다 (기존 손구현 계약)", () => {
      expect(choseongOf("말풍선")).toBe("ㅁㅍㅅ");
      expect(choseongOf("스튜디오")).toBe("ㅅㅌㄷㅇ");
      expect(choseongOf("Studio 2D")).toBe("Studio 2D");
      expect(choseongOf("G펜 (B)")).toBe("Gㅍ (B)");
    });
  });

  describe("isChoseongQuery", () => {
    it("초성만인 질의만 true 다", () => {
      expect(isChoseongQuery("ㅁㅍ")).toBe(true);
      expect(isChoseongQuery("ㅁㅍㅅ")).toBe(true);
      expect(isChoseongQuery("말풍선")).toBe(false);
      expect(isChoseongQuery("ㅁㅍ선")).toBe(false);
      expect(isChoseongQuery("")).toBe(false);
      expect(isChoseongQuery("   ")).toBe(false);
    });
  });

  describe("matchesHangulText", () => {
    it("부분일치(대소문자 무시)는 기존과 같다", () => {
      expect(matchesHangulText("안녕? 민수야", "민수")).toBe(true);
      expect(matchesHangulText("MINSU!", "minsu")).toBe(true);
      expect(matchesHangulText("민수의 아침", "없는대사")).toBe(false);
      expect(matchesHangulText("아무 대사", "")).toBe(true);
    });

    it("초성만으로 대사·라벨을 찾는다", () => {
      expect(matchesHangulText("말풍선·말하기", "ㅁㅍ")).toBe(true);
      expect(matchesHangulText("안녕? 민수야", "ㅁㅅ")).toBe(true);
      expect(matchesHangulText("다음 날 민수네 집", "ㅁㅅㄴ")).toBe(true);
      expect(matchesHangulText("텍스트", "ㅁㅍ")).toBe(false);
    });

    it("초성 질의는 대상의 공백을 건너뛰어 매칭한다", () => {
      expect(matchesHangulText("안녕하세요 반갑습니다", "ㅇㄴㅎㅅㅇㅂㄱ")).toBe(true);
      expect(matchesHangulText("안녕하세요 반갑습니다", "ㅇㄴㅎㅅㅇ ㅂㄱ")).toBe(true);
    });
  });

  describe("조사 선택 (문구 생성)", () => {
    it("받침 유무로 조사를 골라 붙인다", () => {
      expect(withJosa("서식", "을/를")).toBe("서식을");
      expect(withJosa("굵게", "을/를")).toBe("굵게를");
      expect(withJosa("말풍선", "이/가")).toBe("말풍선이");
      expect(withJosa("사과", "이/가")).toBe("사과가");
      expect(withJosa("말풍선", "은/는")).toBe("말풍선은");
      expect(withJosa("사과", "은/는")).toBe("사과는");
    });

    it("조사만 고를 수도 있다", () => {
      expect(pickJosa("책", "을/를")).toBe("을");
      expect(pickJosa("사과", "을/를")).toBe("를");
    });
  });
});
