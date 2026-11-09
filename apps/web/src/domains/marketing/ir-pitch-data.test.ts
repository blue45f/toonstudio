import { describe, expect, it } from "vitest";

import {
  BUSINESS_MODEL,
  CAPABILITIES,
  INVESTOR_QA_ITEMS,
  VALIDATION_GOALS,
} from "./ir-pitch-data";

describe("IR 피치 데이터 계약 (3-Labs · Verify AI · 7-타깃 배포 및 검증 목표 분리)", () => {
  it("5대 핵심 역량에 3-Labs 브리지(96.84), Verify AI(96.74점), 7-타깃 배포 수치를 포함한다", () => {
    const serialized = JSON.stringify(CAPABILITIES);
    expect(serialized).toContain("96.84");
    expect(serialized).toContain("96.74");
    expect(serialized).toContain("97.43");
    expect(serialized).toContain("171");
  });

  it("검증 로드맵 수치는 성과가 아니라 목표(30명, 10명+, 3–6개월)로 유지한다", () => {
    expect(VALIDATION_GOALS.map((g) => g.value)).toEqual(["30명", "10명+", "3–6개월"]);
  });

  it("비즈니스 모델에서 Pro 월 19,900원은 예시 가격(미확정)임을 명시한다", () => {
    const pro = BUSINESS_MODEL.find((m) => m.ko.tier === "Pro");
    expect(pro?.ko.body).toContain("예시 가격");
    expect(pro?.ko.body).toContain("확정된 가격은 아니에요");
  });

  it("투자자 미팅 핵심 Q&A에 클립스튜디오 공존, 3-Labs 브리지, 7-타깃 배포/보안 답변을 포함한다", () => {
    expect(INVESTOR_QA_ITEMS.length).toBeGreaterThanOrEqual(3);
    const qaText = JSON.stringify(INVESTOR_QA_ITEMS);
    expect(qaText).toContain("X_LABS = 96.84");
    expect(qaText).toContain("OPFS");
  });
});
