import { describe, expect, it } from "vitest";

import { deriveNowCard, type NowCardSignals } from "./now-card-model";

/**
 * S3-5 확산 고정 테스트 — 홈·연재 센터·판매자 센터가 "같은 계약·같은 우선순위"로
 * 도출하는지, 각 표면이 실제로 넘기는 신호 조합으로 고정한다(BLUEPRINT §3.2 판정).
 * 표면별 신호 조립 자체는 각 페이지가 소유하고, 여기서는 그 조립 결과 형태가
 * 공용 도출에서 어떤 규칙으로 떨어지는지를 검증한다.
 */
const ko = (value: string) => value;

describe("홈(/) 신호 — 작품 목록(listProductionProjects) 기준", () => {
  const home: NowCardSignals = {
    hasProject: true,
    startHref: "/create",
    allClearHref: "/production/projects/p1/episodes",
  };

  it("진행 중 회차가 있으면 마감이 더 가까워도 이어하기(②)가 먼저다", () => {
    const card = deriveNowCard({
      ...home,
      resume: { href: "/production/projects/p1/episodes", projectTitle: "달의 노래", summary: "달의 노래 · 진행 중 회차 2개" },
      deadline: { href: "/production/projects/p1/episodes", label: "달의 노래 다음 발행", daysUntil: 0 },
    }, ko);
    expect(card?.ruleId).toBe("resume");
    expect(card?.href).toBe("/production/projects/p1/episodes");
  });

  it("진행 중 회차가 없고 다음 발행만 가까우면 마감(③), 작품이 없으면 시작(start)이다", () => {
    const deadline = deriveNowCard({
      ...home,
      deadline: { href: "/production/projects/p1/episodes", label: "달의 노래 다음 발행", daysUntil: 2 },
    }, ko);
    expect(deadline?.ruleId).toBe("deadline");

    const start = deriveNowCard({ ...home, hasProject: false }, ko);
    expect(start?.ruleId).toBe("start");
    expect(start?.href).toBe("/create");
  });
});

describe("연재 센터(/publish) 신호 — 패키지 상태 기준", () => {
  const publish: NowCardSignals = {
    hasProject: true,
    startHref: "/create",
    allClearHref: "/studio/publish",
  };

  it("게시 검사 실패(①)가 준비 완료 이어하기보다 먼저다", () => {
    const card = deriveNowCard({
      ...publish,
      publishBlocked: { failureCount: 2, href: "#serial-package-result" },
      resume: { href: "#serial-package-result", projectTitle: "달의 노래", summary: "패키지가 준비됐어요." },
    }, ko);
    expect(card?.ruleId).toBe("blocked-publish");
    expect(card?.title).toContain("2");
    expect(card?.href).toBe("#serial-package-result");
  });

  it("예약이 오늘인데 입력이 갖춰졌으면 이어하기(②)가 마감(③)보다 먼저다", () => {
    const card = deriveNowCard({
      ...publish,
      resume: { href: "#serial-publish-target", projectTitle: "달의 노래", summary: "제목과 채널이 준비됐어요." },
      deadline: { href: "#serial-publish-target", label: "달의 노래 발행 예약", daysUntil: 0 },
    }, ko);
    expect(card?.ruleId).toBe("resume");
  });
});

describe("판매자 센터(/market/seller) 신호 — 공동구매 기준", () => {
  const seller: NowCardSignals = {
    hasProject: true,
    startHref: "#seller-tools",
    allClearHref: "#seller-tools",
  };

  it("참여가 붙은 공동구매는 이어하기(②)로, 진척이 progress로 통과한다", () => {
    const card = deriveNowCard({
      ...seller,
      resume: {
        href: "#seller-group-buys",
        projectTitle: "수채화 브러시 세트",
        summary: "수채화 브러시 세트 공동구매에 3명이 참여 중이에요.",
        progress: "참여 3명 · 목표 5명",
      },
      deadline: { href: "#seller-group-buys", label: "수채화 브러시 세트 공동구매", daysUntil: 1 },
    }, ko);
    expect(card?.ruleId).toBe("resume");
    expect(card?.progress).toBe("참여 3명 · 목표 5명");
    expect(card?.reason).toContain("3명");
  });

  it("참여 없는 공동구매의 임박 마감은 마감(③)으로, 아무것도 없으면 추천(④)이 닫기 가능하게 나온다", () => {
    const deadline = deriveNowCard({
      ...seller,
      deadline: { href: "#seller-group-buys", label: "수채화 브러시 세트 공동구매", daysUntil: 3 },
    }, ko);
    expect(deadline?.ruleId).toBe("deadline");
    expect(deadline?.title).toContain("마감까지 3일");

    const recommend = deriveNowCard({
      ...seller,
      recommendation: { href: "#seller-tools", title: "새 공동구매를 열어 보세요", reason: "진행 중인 공동구매가 없어요." },
    }, ko);
    expect(recommend?.ruleId).toBe("recommend");
    expect(recommend?.dismissible).toBe(true);
  });
});
