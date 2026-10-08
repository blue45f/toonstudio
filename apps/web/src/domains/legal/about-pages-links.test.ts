import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * 서비스 소개와 제작 과정 페이지가 전체 기능 지도(/features)와 기술 자료로 이어지는지 고정한다.
 * 이전에는 소개 메뉴의 '기술과 신뢰' 탭 하나만 기술 자료로 가는 길이었고 /features로 가는 링크는 없었다.
 */
const ABOUT = readFileSync("apps/web/src/domains/legal/AboutPage.tsx", "utf8");
const WORKFLOW = readFileSync("apps/web/src/domains/legal/WebtoonWorkflowPage.tsx", "utf8");

const LINKS = [
  "/features",
  "/about/technology/architecture",
  "/about/technology/story",
  "/about/technology/deck",
  "/about/technology/atlas",
] as const;

describe("소개 페이지의 기능·기술 자료 연결", () => {
  it.each([
    ["AboutPage", ABOUT],
    ["WebtoonWorkflowPage", WORKFLOW],
  ] as const)("%s는 전체 기능 한눈에와 아키텍처 해설·제작 스토리·발표 모드·기술 도감으로 이어진다", (_name, source) => {
    for (const href of LINKS) expect(source, href).toContain(`href: "${href}"`);
  });

  it("서비스 소개는 섹션을 늘리지 않고 기존 '더 알아보기' 줄에 링크를 둔다", () => {
    expect(ABOUT.match(/<section\b/gu)).toHaveLength(5);
    expect(ABOUT.match(/<IntroActions\b/gu)).toHaveLength(1);
    expect(ABOUT).toContain('aria-label={bi("더 알아보기", "Learn more")}');
    // 영상 카드와 첫 화면 보조 행동은 그대로다.
    expect(ABOUT).toContain("8분 제품 투어 보기");
    expect(ABOUT).toContain('href: "/product-tour"');
  });

  it("기술 발표 모드 링크는 이전 audience/duration 주소가 아니라 기본 트랙 주소를 쓴다", () => {
    for (const source of [ABOUT, WORKFLOW]) expect(source).not.toMatch(/audience=|duration=/u);
  });
});
