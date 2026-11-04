import { describe, expect, it } from "vitest";

import { BUSINESS_PLAN_SECTIONS } from "./business-plan-data";

/** 사업계획서 페이지 본문 데이터 계약: 문항 순서·표 형태·금지 표기를 고정한다. */

const FORBIDDEN_TEAM_NAMES = ["이현우", "김수진", "박지훈", "최예린"];

describe("사업계획서 페이지 본문 데이터", () => {
  it("문항 순서를 Q1 → 지원 동기 → Q2 → Q3 → Q4 → 붙임으로 유지한다", () => {
    expect(BUSINESS_PLAN_SECTIONS.map((section) => section.id)).toEqual([
      "q1",
      "why-webtoon",
      "q2",
      "q3",
      "q4",
      "appendix",
    ]);
  });

  it("모든 표의 행 길이가 헤더 길이와 일치한다", () => {
    for (const section of BUSINESS_PLAN_SECTIONS) {
      for (const table of section.tables) {
        for (const row of table.rows) {
          expect(row.length).toBe(table.headers.length);
        }
      }
    }
  });

  it("실제 팀이 아닌 4인의 이름이 본문에 나타나지 않는다", () => {
    const serialized = JSON.stringify(BUSINESS_PLAN_SECTIONS);
    for (const name of FORBIDDEN_TEAM_NAMES) {
      expect(serialized).not.toContain(name);
    }
  });

  it("Q3에서 팀 가격 미결정과 크레딧 중심 방향을 명시한다", () => {
    const q3 = BUSINESS_PLAN_SECTIONS.find((section) => section.id === "q3");
    expect(q3?.title).toContain("팀 가격은 지금 정하지 않는다");
    expect(q3?.lead).toContain("크레딧");
  });

  it("붙임에서 실제 수치와 검증 목표를 별도 표로 구분한다", () => {
    const appendix = BUSINESS_PLAN_SECTIONS.find((section) => section.id === "appendix");
    const captions = appendix?.tables.map((table) => table.caption) ?? [];
    expect(captions).toContain("실제 제품 수치 (서비스·공개 소스 코드 기준)");
    expect(captions).toContain("검증 목표 (결과가 아니다)");
  });
});
