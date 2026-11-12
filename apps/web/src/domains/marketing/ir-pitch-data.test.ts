import { describe, expect, it } from "vitest";

import {
  BUSINESS_MODEL,
  CAPABILITIES,
  INVESTOR_QA_ITEMS,
  VALIDATION_GOALS,
} from "./ir-pitch-data";

describe("IR 피치 데이터의 현재 운영·제품 목표 구분", () => {
  it("다섯 제품 목적과 기존 진입점을 보존하고 개발 점수·퇴역 배포를 신뢰 배지로 쓰지 않는다", () => {
    const serialized = JSON.stringify(CAPABILITIES);
    expect(CAPABILITIES.map(({ id }) => id)).toEqual(["drawing", "three-d", "collaboration", "ai", "local-first"]);
    expect(CAPABILITIES.map(({ href }) => href)).toEqual(["/studio/canvas", "/studio/bg3d", "/production", "/studio/ai-lab", "/about/technology"]);
    expect(serialized).not.toMatch(/96\.84|96\.74|97\.43|98\.34|7-타깃|7-target|Vercel|171/);
    for (const locale of ["ko", "en"] as const) {
      const storage = CAPABILITIES.find(({ id }) => id === "local-first");
      expect(storage?.[locale].body).toContain("Cloudflare");
      expect(storage?.[locale].body).toContain("onpod");
    }
  });

  it("검증 로드맵 수치는 성과가 아니라 목표(30명, 10명+, 3–6개월)로 유지한다", () => {
    expect(VALIDATION_GOALS.map((g) => g.value)).toEqual(["30명", "10명+", "3–6개월"]);
  });

  it("비즈니스 모델에서 Pro 월 19,900원은 예시 가격(미확정)임을 명시한다", () => {
    const pro = BUSINESS_MODEL.find((m) => m.ko.tier === "Pro");
    expect(pro?.ko.body).toContain("예시 가격");
    expect(pro?.ko.body).toContain("확정된 가격은 아니에요");
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
