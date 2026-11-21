import { describe, expect, it } from "vitest";

import {
  BUSINESS_MODEL,
  CAPABILITIES,
  CHAPTER_JUMPS,
  GTM_STEPS,
  INVESTOR_QA_ITEMS,
  VALIDATION_GOALS,
} from "./ir-pitch-data";
import { PRODUCT_TOUR } from "./product-tour-content";

describe("IR 피치 데이터의 현재 운영·제품 목표 구분", () => {
  it("다섯 제품 목적과 기존 진입점을 보존하고 개발 점수·퇴역 배포를 신뢰 배지로 쓰지 않는다", () => {
    const serialized = JSON.stringify(CAPABILITIES);
    expect(CAPABILITIES.map(({ id }) => id)).toEqual(["drawing", "three-d", "collaboration", "ai", "local-first"]);
    expect(CAPABILITIES.map(({ href }) => href)).toEqual(["/studio/canvas", "/studio/bg3d", "/production", "/studio/ai-lab", "/about/technology"]);
    expect(serialized).not.toMatch(/96\.84|96\.74|97\.43|98\.34|7-타깃|7-target|Vercel|171/);
    const storage = CAPABILITIES.find(({ id }) => id === "local-first");
    expect(storage?.ko.body).toContain("기기 내 임시 보관");
    expect(storage?.ko.body).toContain("별도로 저장");
    expect(storage?.en.body).toContain("Temporary device storage");
    expect(storage?.en.body).toContain("Save a separate copy");
    expect(JSON.stringify(storage)).not.toMatch(/Cloudflare|onpod|배포/);
  });

  it("IR의 기능별 투어 링크가 AI·협업을 포함해 같은 작업공간을 여는 챕터로 연결된다", () => {
    for (const capability of CAPABILITIES) {
      if (capability.chapterStart === null) continue;
      const chapter = PRODUCT_TOUR.chapters.find(({ start }) => start === capability.chapterStart);
      expect(chapter?.feature.href, capability.id).toBe(capability.href);
    }
    expect(CHAPTER_JUMPS.map((jump) =>
      PRODUCT_TOUR.chapters.find(({ start }) => start === jump.start)?.id,
    )).toEqual(["draw", "three-d", "assist", "production"]);
  });

  it("검증 로드맵 수치는 성과가 아니라 목표(30명, 10명+, 3–6개월)로 유지한다", () => {
    expect(VALIDATION_GOALS.map((g) => g.value)).toEqual(["30명", "10명+", "3–6개월"]);
  });

  it("한·영 비즈니스 모델에서 AI 크레딧 한도와 개인 예시 가격·팀 가격 미결정을 구분한다", () => {
    const free = BUSINESS_MODEL.find((m) => m.ko.tier === "Free");
    expect(free?.ko.body).toContain("크레딧 한도");
    expect(free?.en.body).toContain("credit limits");
    expect(JSON.stringify(free)).not.toMatch(/1만|10,000|전 기능|every feature/);
    const pro = BUSINESS_MODEL.find((m) => m.ko.tier === "Pro");
    expect(pro?.ko.body).toContain("예시 가격");
    expect(pro?.ko.body).toContain("확정된 가격은 아니에요");
    expect(pro?.ko.body).toContain("개인 플랜");
    expect(pro?.en.body).toContain("individual plan");
    expect(pro?.en.body).toContain("not a team price or a confirmed price");
    const team = BUSINESS_MODEL.find((m) => m.ko.tier === "Team · Education");
    expect(team?.ko.body).toContain("팀 가격은 미결정");
    expect(team?.en.body).toContain("Team pricing is undecided");
  });

  it("한·영 고객 확보 계획은 전문 제작팀 검증을 먼저 두고 교육기관 확대를 뒤에 둔다", () => {
    expect(GTM_STEPS[0].ko.title).toContain("전문가·제작팀");
    expect(GTM_STEPS[0].en.title).toContain("professional creators and teams");
    expect(GTM_STEPS[1].ko.body).toContain("결제 의사");
    expect(GTM_STEPS[1].en.body).toContain("willingness to pay");
    expect(GTM_STEPS[2].ko.body).toContain("제작 현장 검증 뒤");
    expect(GTM_STEPS[2].en.body).toContain("After validation in production settings");
    expect(JSON.stringify(GTM_STEPS)).not.toMatch(/아마추어|amateur|1만|10,000/);
  });

  it("보안·배포 답변도 저장 범위와 현재 운영을 구분하고 내부 점수를 품질 보장으로 쓰지 않는다", () => {
    expect(INVESTOR_QA_ITEMS.length).toBeGreaterThanOrEqual(3);
    const qaText = JSON.stringify(INVESTOR_QA_ITEMS);
    expect(qaText).toContain("Cloudflare");
    expect(qaText).toContain("onpod");
    expect(qaText).toContain("임시 보관");
    expect(qaText).toContain("Temporary device storage");
    expect(qaText).not.toMatch(/96\.84|96\.74|7-타깃|7-target|171|Vercel/);
  });
});
