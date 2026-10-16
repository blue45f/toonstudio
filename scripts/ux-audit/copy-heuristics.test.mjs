import assert from "node:assert/strict";

import { analyzeCopy, findPlaceholderLeak, looksLikeEnglishSentence, looksLikeTranslationKey } from "./copy-heuristics.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

describe("copy-heuristics: 번역 키 노출", () => {
  it("점으로 구분한 식별자가 그대로 보이면 번역 키로 본다", () => {
    for (const text of ["route.studioNew", "nav.home", "app.routes.route.stage", "common.save_all"]) {
      assert.equal(looksLikeTranslationKey(text), true, text);
    }
  });

  it("도메인·파일 이름·버전·문장은 번역 키가 아니다", () => {
    for (const text of ["toonstudio.com", "www.example.org", "logo.png", "v1.2.3", "e.g.", "홈 화면", "Next.js", "저장 route.x", "a.b"]) {
      assert.equal(looksLikeTranslationKey(text), false, text);
    }
  });
});

describe("copy-heuristics: 자리표시자 누출", () => {
  it("치환되지 않은 템플릿과 직렬화 누출 종류를 알려 준다", () => {
    assert.equal(findPlaceholderLeak("{value0} 화면입니다"), "value-template");
    assert.equal(findPlaceholderLeak("안녕 {{name}}"), "mustache");
    assert.equal(findPlaceholderLeak("총 ${count}개"), "template-literal");
    assert.equal(findPlaceholderLeak("[object Object]"), "object-object");
    assert.equal(findPlaceholderLeak("값: undefined"), "undefined");
    assert.equal(findPlaceholderLeak("점수 NaN"), "nan");
    assert.equal(findPlaceholderLeak("%s 개"), "printf");
  });

  it("정상 문장은 누출로 보지 않는다", () => {
    for (const text of ["저장했어요", "100% 완료", "nullable 타입 안내".replace("nullable", "널러블"), "Undefined behavior 설명"]) {
      assert.equal(findPlaceholderLeak(text), null, text);
    }
  });
});

describe("copy-heuristics: 영어/한국어 혼재 의심", () => {
  it("한글 없는 3단어 이상 영어 문장만 의심한다", () => {
    assert.equal(looksLikeEnglishSentence("This sentence is clearly English text"), true);
    assert.equal(looksLikeEnglishSentence("Draw Your World"), true);
  });

  it("대문자 라벨·브랜드 문구·한글 혼용·짧은 문자열은 제외한다", () => {
    for (const text of ["TOONSTUDIO CREATOR LOBBY", "Stories Come to Life", "AI 디렉터와 함께 Create", "OK", "Save", "https://example.com/a b c"]) {
      assert.equal(looksLikeEnglishSentence(text), false, text);
    }
  });
});

describe("copy-heuristics: 분석 요약", () => {
  it("종류별로 중복을 제거하고 많이 나온 순으로 표본을 돌려준다", () => {
    const result = analyzeCopy({
      texts: [
        { text: "route.studioNew", count: 2, tag: "a" },
        { text: "route.studioNew", count: 1, tag: "a" },
        { text: "{value0} 화면입니다", count: 1, tag: "p" },
        { text: "This sentence is clearly English text", count: 3, tag: "p" },
        { text: "일반 한국어 문장입니다", count: 9, tag: "p" },
      ],
      attributes: [{ kind: "aria-label", text: "nav.home", count: 1, tag: "button" }],
    });
    assert.equal(result.rawKeys.distinct, 2);
    assert.deepEqual(result.rawKeys.samples.map((entry) => [entry.text, entry.count]), [["route.studioNew", 3], ["nav.home", 1]]);
    assert.equal(result.rawKeys.samples[1].where, "button[aria-label]");
    assert.equal(result.placeholderLeaks.distinct, 1);
    assert.equal(result.englishSentences.distinct, 1);
  });
});
