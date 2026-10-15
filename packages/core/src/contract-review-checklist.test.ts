import { describe, expect, it } from "vitest";

import {
  CONTRACT_REVIEW_CATEGORIES,
  CONTRACT_REVIEW_CHECKED_ON,
  CONTRACT_REVIEW_ITEMS,
  CONTRACT_REVIEW_SOURCES,
  CONTRACT_REVIEW_STANDARD_EDITION,
  buildContractReviewMarkdown,
  contractReviewItemStatus,
  getContractReviewCategory,
  getContractReviewSource,
  isContractReviewAnswer,
  normalizeContractReviewAnswers,
  pickContractReviewText,
  resolveContractReviewLocale,
  setContractReviewAnswer,
  summarizeContractReview,
  type ContractReviewText,
} from "./contract-review-checklist";

const HANGUL = /[가-힣]/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;

function allTexts(): ContractReviewText[] {
  const texts: ContractReviewText[] = [];
  for (const category of CONTRACT_REVIEW_CATEGORIES) texts.push(category.title, category.description);
  for (const source of CONTRACT_REVIEW_SOURCES) texts.push(source.title, source.publisher, source.note);
  for (const item of CONTRACT_REVIEW_ITEMS) {
    texts.push(item.title, item.question, item.standard, item.attentionNote, ...item.lookFor);
    for (const reference of item.references) texts.push(reference.locator);
  }
  return texts;
}

describe("계약서 검토 체크리스트 데이터", () => {
  it("항목 id는 고유하고 저장 키로 안전한 kebab-case다", () => {
    const ids = CONTRACT_REVIEW_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(?:-[a-z]+)*$/u);
  });

  it("요청된 핵심 주제를 모두 다룬다(지체상금·2차 저작 독점·RS·정산 주기·해지·권리 반환)", () => {
    const ids = new Set(CONTRACT_REVIEW_ITEMS.map((item) => item.id));
    for (const required of [
      "delay-penalty",
      "secondary-rights-holder",
      "secondary-rights-license",
      "revenue-share",
      "settlement-cycle",
      "termination",
      "rights-return",
    ]) {
      expect(ids.has(required), required).toBe(true);
    }
  });

  it("모든 항목의 분류와 근거 출처가 실제로 존재한다", () => {
    const usedCategories = new Set<string>();
    for (const item of CONTRACT_REVIEW_ITEMS) {
      expect(() => getContractReviewCategory(item.category), item.id).not.toThrow();
      usedCategories.add(item.category);
      expect(item.references.length, item.id).toBeGreaterThan(0);
      for (const reference of item.references) {
        expect(() => getContractReviewSource(reference.sourceId), item.id).not.toThrow();
      }
      expect(item.lookFor.length, item.id).toBeGreaterThanOrEqual(2);
    }
    expect([...usedCategories].sort()).toEqual(CONTRACT_REVIEW_CATEGORIES.map((category) => category.id).sort());
  });

  it("모든 문구는 한국어·영어가 모두 채워져 있고 언어가 섞이지 않는다", () => {
    for (const text of allTexts()) {
      expect(text.ko.trim().length).toBeGreaterThan(0);
      expect(text.en.trim().length).toBeGreaterThan(0);
      expect(HANGUL.test(text.ko)).toBe(true);
      expect(HANGUL.test(text.en), text.en).toBe(false);
    }
  });

  it("출처는 https 주소와 확인일·문서 날짜를 갖고 확인일은 이 작업의 확인일이다", () => {
    expect(CONTRACT_REVIEW_SOURCES.length).toBeGreaterThanOrEqual(3);
    for (const source of CONTRACT_REVIEW_SOURCES) {
      expect(source.url.startsWith("https://"), source.id).toBe(true);
      expect(source.documentDate).toMatch(DATE);
      expect(source.checkedOn).toBe(CONTRACT_REVIEW_CHECKED_ON);
    }
    expect(CONTRACT_REVIEW_SOURCES.map((source) => source.id)).toContain("mcst-standard-contracts");
    expect(CONTRACT_REVIEW_STANDARD_EDITION.noticeNumber).toBe("2024-0032");
  });

  it("지체상금 항목은 표준계약서에 없는 조항이므로 ‘있을 때’ 주의로 분류한다", () => {
    const penalty = CONTRACT_REVIEW_ITEMS.find((item) => item.id === "delay-penalty");
    expect(penalty?.attention).toBe("when-present");
    expect(penalty?.standard.ko).toContain("‘지체상금’이라는 조항이 없다");
    // 확인하지 못한 법률 사실을 단정하지 않는다: 금액·한도 같은 숫자를 지어내지 않는다.
    expect(penalty?.standard.ko).not.toMatch(/\d+\s*%/u);
  });

  it("법률 자문을 대신한다는 표현을 쓰지 않는다", () => {
    for (const text of allTexts()) {
      expect(text.ko).not.toMatch(/법적 효력이 있다|반드시 무효|위법입니다/u);
    }
  });
});

describe("답 정규화와 변경", () => {
  it("알 수 없는 항목·값·객체가 아닌 입력을 버리고 항목 순서로 돌려준다", () => {
    const normalized = normalizeContractReviewAnswers({
      "revenue-share": "absent",
      "delay-penalty": "present",
      "not-a-real-item": "present",
      termination: "maybe",
      pause: 3,
    });
    expect(Object.keys(normalized)).toEqual(["delay-penalty", "revenue-share"]);
    expect(Object.isFrozen(normalized)).toBe(true);
    for (const bad of [null, undefined, "x", 7, ["present"], true]) {
      expect(normalizeContractReviewAnswers(bad)).toEqual({});
    }
  });

  it("상속된 속성이나 프로토타입 키는 답으로 읽지 않는다", () => {
    const inherited = Object.create({ "revenue-share": "present" }) as Record<string, unknown>;
    expect(normalizeContractReviewAnswers(inherited)).toEqual({});
    expect(normalizeContractReviewAnswers(JSON.parse('{"__proto__":"present","constructor":"absent"}'))).toEqual({});
  });

  it("답을 바꾸되 원본을 바꾸지 않고, null로 확인 전 상태로 되돌린다", () => {
    const base = normalizeContractReviewAnswers({ pause: "present" });
    const next = setContractReviewAnswer(base, "revenue-share", "absent");
    expect(next).toEqual({ pause: "present", "revenue-share": "absent" });
    expect(base).toEqual({ pause: "present" });
    expect(setContractReviewAnswer(next, "pause", null)).toEqual({ "revenue-share": "absent" });
    expect(setContractReviewAnswer(next, "unknown-id", "present")).toBe(next);
  });

  it("답 값 판별", () => {
    expect(isContractReviewAnswer("present")).toBe(true);
    expect(isContractReviewAnswer("absent")).toBe(true);
    expect(isContractReviewAnswer("unsure")).toBe(true);
    expect(isContractReviewAnswer("yes")).toBe(false);
    expect(isContractReviewAnswer(undefined)).toBe(false);
  });
});

describe("항목 분류와 요약", () => {
  it("‘없을 때 주의’ 항목과 ‘있을 때 주의’ 항목의 분류가 반대로 동작한다", () => {
    const whenAbsent = { attention: "when-absent" } as const;
    const whenPresent = { attention: "when-present" } as const;
    expect(contractReviewItemStatus(whenAbsent, undefined)).toBe("unchecked");
    expect(contractReviewItemStatus(whenAbsent, "unsure")).toBe("unsure");
    expect(contractReviewItemStatus(whenAbsent, "absent")).toBe("attention");
    expect(contractReviewItemStatus(whenAbsent, "present")).toBe("fine");
    expect(contractReviewItemStatus(whenPresent, "present")).toBe("attention");
    expect(contractReviewItemStatus(whenPresent, "absent")).toBe("fine");
    expect(contractReviewItemStatus(whenPresent, "unsure")).toBe("unsure");
  });

  it("아무것도 답하지 않으면 전부 먼저 확인할 항목이고 진행률은 0이다", () => {
    const summary = summarizeContractReview({});
    expect(summary.total).toBe(CONTRACT_REVIEW_ITEMS.length);
    expect(summary.answered).toBe(0);
    expect(summary.unchecked).toBe(summary.total);
    expect(summary.progressPercent).toBe(0);
    expect(summary.followUpIds).toEqual(CONTRACT_REVIEW_ITEMS.map((item) => item.id));
    expect(summary.attentionIds).toEqual([]);
  });

  it("답한 내용을 세고 주의 신호와 확인 전 항목을 구분한다", () => {
    const answers = normalizeContractReviewAnswers({
      "delay-penalty": "present", // 있을 때 주의 → 주의
      "revenue-share": "absent", // 없을 때 주의 → 주의
      pause: "present", // 문제 신호 없음
      termination: "unsure",
    });
    const summary = summarizeContractReview(answers);
    expect(summary.answered).toBe(4);
    expect(summary.present).toBe(2);
    expect(summary.absent).toBe(1);
    expect(summary.unsure).toBe(1);
    expect(summary.unchecked).toBe(summary.total - 4);
    expect(summary.progressPercent).toBe(Math.round((4 / summary.total) * 100));
    expect(summary.attentionIds).toEqual(["delay-penalty", "revenue-share"]);
    expect(summary.followUpIds).toContain("termination");
    expect(summary.followUpIds).not.toContain("pause");
  });

  it("모든 항목에 문제 없는 방향으로 답하면 먼저 확인할 항목이 없다", () => {
    const answers: Record<string, "present" | "absent"> = {};
    for (const item of CONTRACT_REVIEW_ITEMS) answers[item.id] = item.attention === "when-absent" ? "present" : "absent";
    const summary = summarizeContractReview(normalizeContractReviewAnswers(answers));
    expect(summary.followUpIds).toEqual([]);
    expect(summary.progressPercent).toBe(100);
  });
});

describe("언어 선택", () => {
  it("한국어 계열만 한국어, 나머지는 영어로 고른다", () => {
    expect(resolveContractReviewLocale("ko")).toBe("ko");
    expect(resolveContractReviewLocale("ko-KR")).toBe("ko");
    expect(resolveContractReviewLocale("KO_kr")).toBe("ko");
    expect(resolveContractReviewLocale("en")).toBe("en");
    expect(resolveContractReviewLocale("ja-JP")).toBe("en");
    expect(resolveContractReviewLocale("")).toBe("en");
    expect(resolveContractReviewLocale(undefined)).toBe("en");
    expect(pickContractReviewText({ ko: "가", en: "a" }, "ko")).toBe("가");
    expect(pickContractReviewText({ ko: "가", en: "a" }, "en")).toBe("a");
  });
});

describe("요약 Markdown", () => {
  const generatedAt = new Date("2026-10-15T09:30:00.000Z");
  const answers = normalizeContractReviewAnswers({
    "delay-penalty": "present",
    "revenue-share": "absent",
    pause: "present",
    termination: "unsure",
  });

  it("한국어 요약에 면책·진행 현황·먼저 확인할 항목·근거 문서가 들어 있다", () => {
    const markdown = buildContractReviewMarkdown({ answers, locale: "ko", generatedAt });
    expect(markdown.startsWith("# 계약서 검토 체크리스트 요약")).toBe(true);
    expect(markdown).toContain("- 작성일: 2026-10-15");
    expect(markdown).toContain("법률 자문이 아닙니다");
    expect(markdown).toContain("고시 제2024-0032호");
    expect(markdown).toContain("## 진행 현황");
    expect(markdown).toContain("답한 항목: 4 / " + CONTRACT_REVIEW_ITEMS.length);
    expect(markdown).toContain("## 먼저 확인할 항목");
    // 주의 항목은 체크되지 않은 상자와 다음 행동을 함께 갖는다.
    expect(markdown).toMatch(/- \[ \] \*\*지체상금\(마감 지연 패널티\)\*\* — 내 답: 있음 · 먼저 확인 필요/u);
    expect(markdown).toMatch(/- \[ \] \*\*수익 배분\(RS\) 비율과 ‘순 매출액’ 정의\*\* — 내 답: 없음 · 먼저 확인 필요/u);
    expect(markdown).toContain("다음 행동:");
    // 문제 신호가 없는 답은 체크된 상자로 따로 모은다.
    expect(markdown).toMatch(/- \[x\] \*\*휴재\(쉬어 갈 권리\)\*\* — 내 답: 있음/u);
    for (const source of CONTRACT_REVIEW_SOURCES) expect(markdown).toContain(`<${source.url}>`);
    expect(markdown).toContain("법률 자문이 아닙니다.");
  });

  it("영어 요약도 같은 구조다", () => {
    const markdown = buildContractReviewMarkdown({ answers, locale: "en", generatedAt });
    expect(markdown.startsWith("# Contract review checklist summary")).toBe(true);
    expect(markdown).toContain("- Created on: 2026-10-15");
    expect(markdown).toContain("This document is not legal advice");
    expect(markdown).toContain("## Check these first");
    expect(markdown).toContain("**Late-delivery penalties** — My answer: In my contract · Check first");
    expect(HANGUL.test(markdown)).toBe(false);
  });

  it("같은 입력은 같은 결과를 내고, 알 수 없는 키는 내보내지 않는다", () => {
    const polluted = { ...answers, "ghost-item": "present" } as unknown as typeof answers;
    const a = buildContractReviewMarkdown({ answers, locale: "ko", generatedAt });
    const b = buildContractReviewMarkdown({ answers: polluted, locale: "ko", generatedAt });
    expect(b).toBe(a);
    expect(a).not.toContain("ghost-item");
  });

  it("아무것도 답하지 않은 요약도 만들어지고 ‘문제 신호 없이 답한 항목’은 비어 있다고 알린다", () => {
    const markdown = buildContractReviewMarkdown({ answers: {}, locale: "ko", generatedAt });
    expect(markdown).toContain("답한 항목: 0 / " + CONTRACT_REVIEW_ITEMS.length);
    expect(markdown).toContain("## 문제 신호 없이 답한 항목\n- 아직 없습니다.");
  });

  it("모든 항목이 문제 없이 답해지면 안심시키지 않고 전문가 상담을 권한다", () => {
    const fine: Record<string, "present" | "absent"> = {};
    for (const item of CONTRACT_REVIEW_ITEMS) fine[item.id] = item.attention === "when-absent" ? "present" : "absent";
    const markdown = buildContractReviewMarkdown({
      answers: normalizeContractReviewAnswers(fine),
      locale: "ko",
      generatedAt,
    });
    expect(markdown).toContain("분류된 것이 없습니다");
    expect(markdown).toContain("전문가 상담은 여전히 권합니다");
  });

  it("유효하지 않은 날짜는 거부한다", () => {
    expect(() => buildContractReviewMarkdown({ answers, locale: "ko", generatedAt: new Date("nope") })).toThrow();
  });
});
