import { describe, expect, it } from "vitest";

import {
  NOW_CARD_DEADLINE_WINDOW_DAYS,
  NOW_CARD_RULE_PRIORITY,
  deriveNowCard,
  type NowCardSignals,
} from "./now-card-model";

/** 한국어 고정 로컬라이저 — 도출 규칙만 검증한다(문구 자체는 ko 문자열로 고정). */
const ko = (value: string) => value;

const BASE: NowCardSignals = {
  hasProject: true,
  startHref: "/studio/new",
  allClearHref: "/studio/p/demo/story?panel=episodes",
};

describe("deriveNowCard 우선순위 (BLUEPRINT §3.2)", () => {
  it("우선순위 선언은 막힌 일 → 이어하기 → 마감 → 추천 → 빈 상태 → 전부 완료 순서다", () => {
    expect(NOW_CARD_RULE_PRIORITY).toEqual([
      "blocked-storage",
      "blocked-review",
      "blocked-publish",
      "resume",
      "deadline",
      "recommend",
      "start",
      "all-clear",
    ]);
  });

  it("① 저장 실패가 모든 신호보다 먼저고, 닫을 수 없다", () => {
    const card = deriveNowCard({
      ...BASE,
      storageBlocked: { href: "/studio?view=storage" },
      reviewBlocked: { pinCount: 2, href: "/review" },
      resume: { href: "/resume", projectTitle: "작품", summary: "요약" },
    }, ko);
    expect(card?.ruleId).toBe("blocked-storage");
    expect(card?.tone).toBe("danger");
    expect(card?.href).toBe("/studio?view=storage");
    expect(card?.dismissible).toBe(false);
  });

  it("① 검수 필수 핀은 이어하기보다 먼저고, 핀 0개면 막힌 일이 아니다", () => {
    const blocked = deriveNowCard({
      ...BASE,
      reviewBlocked: { pinCount: 3, href: "/review" },
      resume: { href: "/resume", projectTitle: "작품", summary: null },
    }, ko);
    expect(blocked?.ruleId).toBe("blocked-review");
    expect(blocked?.title).toContain("3");

    const clear = deriveNowCard({
      ...BASE,
      reviewBlocked: { pinCount: 0, href: "/review" },
      resume: { href: "/resume", projectTitle: "작품", summary: null },
    }, ko);
    expect(clear?.ruleId).toBe("resume");
  });

  it("① 게시 검사 실패는 검수 핀 다음, 이어하기보다 먼저다", () => {
    const card = deriveNowCard({
      ...BASE,
      publishBlocked: { failureCount: 1, href: "/publish" },
      resume: { href: "/resume", projectTitle: "작품", summary: null },
    }, ko);
    expect(card?.ruleId).toBe("blocked-publish");
    expect(card?.href).toBe("/publish");
  });

  it("② 이어하기는 요약을 근거 문장으로 쓰고, 요약이 없으면 작품명으로 근거를 만든다", () => {
    const withSummary = deriveNowCard({
      ...BASE,
      resume: { href: "/resume", projectTitle: "달의 노래", summary: "3화 원고 · 작화 단계", progress: "원고 2 / 5 완성" },
    }, ko);
    expect(withSummary?.ruleId).toBe("resume");
    expect(withSummary?.reason).toBe("3화 원고 · 작화 단계");
    expect(withSummary?.progress).toBe("원고 2 / 5 완성");

    const withoutSummary = deriveNowCard({
      ...BASE,
      resume: { href: "/resume", projectTitle: "달의 노래", summary: null },
    }, ko);
    expect(withoutSummary?.reason).toContain("달의 노래");
    expect(withoutSummary?.progress).toBeUndefined();
  });

  it("③ 마감은 창(3일) 안에서만 발화하고, 이어하기가 있으면 이어하기가 먼저다", () => {
    const near = deriveNowCard({
      ...BASE,
      deadline: { href: "/schedule", label: "5화 게시", daysUntil: NOW_CARD_DEADLINE_WINDOW_DAYS },
    }, ko);
    expect(near?.ruleId).toBe("deadline");
    expect(near?.tone).toBe("warning");

    const far = deriveNowCard({
      ...BASE,
      deadline: { href: "/schedule", label: "5화 게시", daysUntil: NOW_CARD_DEADLINE_WINDOW_DAYS + 1 },
    }, ko);
    expect(far?.ruleId).toBe("all-clear");

    const overdue = deriveNowCard({
      ...BASE,
      deadline: { href: "/schedule", label: "5화 게시", daysUntil: -1 },
    }, ko);
    expect(overdue?.tone).toBe("danger");

    const resumeFirst = deriveNowCard({
      ...BASE,
      deadline: { href: "/schedule", label: "5화 게시", daysUntil: 0 },
      resume: { href: "/resume", projectTitle: "작품", summary: null },
    }, ko);
    expect(resumeFirst?.ruleId).toBe("resume");
  });

  it("④ 추천은 걸린 일이 없을 때만 나오고 닫을 수 있다", () => {
    const card = deriveNowCard({
      ...BASE,
      recommendation: { href: "/learn/x", title: "콘티 입문 강의", reason: "지금 작업과 이어지는 학습이에요." },
    }, ko);
    expect(card?.ruleId).toBe("recommend");
    expect(card?.reason).toBe("지금 작업과 이어지는 학습이에요.");
    expect(card?.dismissible).toBe(true);
  });

  it("작품이 없으면 추천보다 빈 상태(start)가 먼저다", () => {
    const card = deriveNowCard({
      ...BASE,
      hasProject: false,
      recommendation: { href: "/learn/x", title: "콘티 입문 강의", reason: "추천 이유" },
    }, ko);
    expect(card?.ruleId).toBe("start");
    expect(card?.href).toBe("/studio/new");
    expect(card?.dismissible).toBe(false);
  });

  it("전부 완료면 청사진 표준 문형의 all-clear 카드를 돌려준다", () => {
    const card = deriveNowCard({ ...BASE }, ko);
    expect(card?.ruleId).toBe("all-clear");
    expect(card?.tone).toBe("success");
    expect(card?.title).toBe("지금 막힌 일은 없어요. 다음 회차를 시작할까요?");
    expect(card?.href).toBe(BASE.allClearHref);
  });

  it("어떤 신호 조합에서도 카드는 1개 이하이고 근거 문장이 비지 않는다", () => {
    const combos: NowCardSignals[] = [
      { ...BASE },
      { ...BASE, hasProject: false },
      { ...BASE, storageBlocked: { href: "/s" } },
      { ...BASE, reviewBlocked: { pinCount: 1, href: "/r" }, publishBlocked: { failureCount: 1, href: "/p" } },
      { ...BASE, resume: { href: "/x", projectTitle: "작품", summary: null }, deadline: { href: "/d", label: "마감", daysUntil: 0 } },
      { ...BASE, deadline: { href: "/d", label: "마감", daysUntil: 99 }, recommendation: { href: "/l", title: "제목", reason: "이유" } },
    ];
    for (const signals of combos) {
      const card = deriveNowCard(signals, ko);
      // 반환형 자체가 단일 객체|null이라 "표면당 1개"는 타입으로 강제되고,
      // 여기서는 근거 문장(§3.2 의무)이 모든 규칙에서 채워지는지 고정한다.
      expect(card).not.toBeNull();
      expect(card?.reason.trim().length).toBeGreaterThan(0);
      expect(card?.title.trim().length).toBeGreaterThan(0);
      expect(card?.href.length).toBeGreaterThan(0);
    }
  });
});
