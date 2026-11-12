import { readFileSync } from "node:fs";
import { join } from "node:path";

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

  it("공개 본문에는 멘토 실명과 사업자 등록 상태 없이 작성자와 기관을 남긴다", () => {
    const serialized = JSON.stringify(BUSINESS_PLAN_SECTIONS);
    expect(serialized).not.toMatch(/멘토\s*[:·]?\s+[가-힣]{2,4}\s*[,·]/);
    expect(serialized).not.toMatch(/사업자\s*등록/);
    const appendix = BUSINESS_PLAN_SECTIONS.find((section) => section.id === "appendix");
    expect(appendix?.note).toContain(
      "멘토기관: 한국핀테크지원센터, 작성자: 김희준(1인 예비창업자, 팀 없음).",
    );
  });

  it("페이지 소개와 폰트 재생성 원본에도 공개하지 않는 개인 표기를 남기지 않는다", () => {
    const root = process.cwd();
    for (const path of [
      "apps/web/src/domains/marketing/BusinessPlanPage.tsx",
      "apps/web/scripts/generate-business-plan-font-subset.py",
    ]) {
      const source = readFileSync(join(root, path), "utf8");
      expect(source).not.toMatch(/멘토\s+[가-힣]{2,4}\s*[,·]/);
      expect(source).not.toMatch(/멘토\s+[가-힣]{2,4}\s+멘토기관/);
      expect(source).not.toMatch(/사업자\s*등록/);
      expect(source).toContain("한국핀테크지원센터");
      expect(source).toContain("김희준");
      expect(source).toContain("팀 없음");
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
    expect(captions).toContain("기능·기술 기록 (운영 성공 지표가 아니다)");
    expect(captions).toContain("검증 목표 (결과가 아니다)");
  });

  it("현재 배포 안내와 개발 기록을 구분하고 퇴역 환경의 성공을 보장하지 않는다", () => {
    const serialized = JSON.stringify(BUSINESS_PLAN_SECTIONS);
    expect(serialized).toContain("Cloudflare 정적 웹과 onpod API·DB");
    expect(serialized).toContain("승인·검증 후 수동 배포");
    expect(serialized).not.toMatch(/7개 환경|Vercel|171개|프리플라이트 100% 통과|96\.84|96\.74/);
  });
});
