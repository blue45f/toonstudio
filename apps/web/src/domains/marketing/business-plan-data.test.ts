import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BUSINESS_PLAN_DOCUMENT_BASIS, BUSINESS_PLAN_SECTIONS } from "./business-plan-data";

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
    const pricing = q3?.tables.flatMap((table) => table.rows).find((row) => row[0] === "ToonStudio (방향)");
    expect(pricing?.[2]).toContain("개인 Pro 월 19,900원은 예시 가격이며 미확정");
    expect(pricing?.[2]).not.toContain("월 9,900원");
  });

  it("붙임에서 기능 설명과 검증 목표를 구분하고 미검증 수량을 제공량으로 표시하지 않는다", () => {
    const appendix = BUSINESS_PLAN_SECTIONS.find((section) => section.id === "appendix");
    const captions = appendix?.tables.map((table) => table.caption) ?? [];
    expect(captions).toContain("기능·기술 기록 (운영 성공 지표가 아니다)");
    expect(captions).toContain("검증 목표 (결과가 아니다)");
    const inventory = appendix?.tables.find((table) => table.caption.startsWith("기능·기술 기록"));
    expect(JSON.stringify(inventory)).not.toMatch(/42개|14,928개|226개|295종|375종/);
    expect(inventory?.rows.some((row) => row[0] === "드로잉 브러시")).toBe(true);
  });

  it("철회된 사전 제출과 최종 제출·카드 종료를 구분하고 AI 지원을 지급으로 단정하지 않는다", () => {
    const appendix = BUSINESS_PLAN_SECTIONS.find((section) => section.id === "appendix");
    expect(appendix?.note).toContain("11월 22일 사전 제출 요청은 철회됐다");
    expect(appendix?.note).toContain("2026-12-01 13:00(KST)");
    expect(appendix?.note).toContain("최종 마감 전까지 수정할 수 있다");
    expect(appendix?.note).toContain("카드 사용 종료일 12월 4일과 제출 마감은 별개");
    const q3 = BUSINESS_PLAN_SECTIONS.find((section) => section.id === "q3");
    const funding = q3?.tables.flatMap((table) => table.rows);
    expect(funding?.find((row) => row[0] === "창업활동자금")?.[2]).toContain("2026-12-04");
    expect(funding?.find((row) => row[0] === "AI 솔루션 지원")?.[2]).toContain("현재 신청 자격·접수·승인·추가 지급 완료를 뜻하지 않는다");
  });

  it("현재 배포 안내와 개발 기록을 구분하고 퇴역 환경의 성공을 보장하지 않는다", () => {
    const serialized = JSON.stringify(BUSINESS_PLAN_SECTIONS);
    expect(serialized).toContain("Cloudflare 정적 웹과 onpod API·DB");
    expect(serialized).toContain("승인·검증 후 수동 배포");
    expect(serialized).not.toMatch(/7개 환경|Vercel|171개|프리플라이트 100% 통과|96\.84|96\.74/);
  });

  it("2026-11-25 웨이브 45~49 구현·보안 기록을 운영 매출·고객 성과와 분리해 반영한다", () => {
    expect(BUSINESS_PLAN_DOCUMENT_BASIS).toContain("2026-11-25");
    const q2 = BUSINESS_PLAN_SECTIONS.find((section) => section.id === "q2");
    const milestoneTable = q2?.tables.find((table) => table.caption.startsWith("2026-11-25 현재 구현 기록"));
    expect(milestoneTable?.caption).toContain("운영 매출·고객 성과가 아니다");
    const serializedQ2 = JSON.stringify(milestoneTable);
    expect(serializedQ2).toContain("spectrum-editorial-theme.css");
    expect(serializedQ2).toContain("ReferenceCreatorDashboard.tsx");
    expect(serializedQ2).toContain("180도 카메라 각도 전환");
    expect(serializedQ2).toContain("15관절 자동 그립");
    expect(serializedQ2).toContain("120Hz 프레임 예산 가드");
    expect(serializedQ2).toContain("USB HID 0x0D");
    expect(serializedQ2).toContain("106/106 GitHub Actions 최소 권한");
    expect(serializedQ2).toContain("rustix 1.1.6");
    expect(serializedQ2).toContain("pnpm audit 보안 문제 0건");
    expect(serializedQ2).toContain("/compare/studio");
  });
});
