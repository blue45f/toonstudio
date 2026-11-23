// @vitest-environment jsdom
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  getVibrantPageIdentity,
  listVibrantPageIdentities,
  VIBRANT_GLOBAL_QUICK_LINKS,
  VIBRANT_PAGE_IDENTITY_CATALOG,
  VIBRANT_PAGE_IDENTITY_IDS,
  type VibrantPageIdentityId,
} from "./page-identity-catalog";
import { VibrantPageIdentityBanner } from "./VibrantPageIdentityBanner";
import { VibrantVisualEmptyState } from "./VibrantVisualEmptyState";

const REPO_ROOT = process.cwd();
const IDENTITY_DIR = resolve(REPO_ROOT, "apps/web/src/shared/ui/vibrant-identity");
const PUBLIC_ROOT = resolve(REPO_ROOT, "apps/web/public");

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: "ko" });
});

describe("12대 페이지 비주얼 아이덴티티 엠블럼 자산 & 카탈로그 감사", () => {
  it("12개 엠블럼 WebP 파일이 public 자산 디렉터리에 실제로 존재하고 유효한 RIFF/WEBP 헤더를 가진다", () => {
    expect(VIBRANT_PAGE_IDENTITY_IDS).toHaveLength(12);
    const seenPaths = new Set<string>();

    for (const id of VIBRANT_PAGE_IDENTITY_IDS) {
      const spec = getVibrantPageIdentity(id);
      expect(spec.emblemSrc).toBe(`/assets/studio/vibrant-sprites/emblem-${id}.webp`);
      expect(seenPaths.has(spec.emblemSrc)).toBe(false);
      seenPaths.add(spec.emblemSrc);

      const diskPath = resolve(PUBLIC_ROOT, spec.emblemSrc.replace(/^\//u, ""));
      expect(existsSync(diskPath), `엠블럼 파일 누락: ${diskPath}`).toBe(true);
      const stat = statSync(diskPath);
      expect(stat.size).toBeGreaterThan(1024);

      const header = readFileSync(diskPath).subarray(0, 12).toString("ascii");
      expect(header.startsWith("RIFF")).toBe(true);
      expect(header.slice(8, 12)).toBe("WEBP");
    }
  });

  it("12대 페이지 모두 3단계 도식 칩, 1클릭 CTA, OKLCH 무드 변수, 3대 빠른 링크 계약을 충족한다", () => {
    const identities = listVibrantPageIdentities();
    expect(identities).toHaveLength(12);

    for (const spec of identities) {
      expect(VIBRANT_PAGE_IDENTITY_CATALOG[spec.id]).toBe(spec);
      expect(spec.steps).toHaveLength(3);
      expect(spec.steps.map((step) => step.stepNumber)).toEqual([1, 2, 3]);
      for (const step of spec.steps) {
        expect(step.href.startsWith("/")).toBe(true);
        expect(step.label.ko.trim().length).toBeGreaterThan(0);
        expect(step.label.en.trim().length).toBeGreaterThan(0);
        expect(step.detail.ko.trim().length).toBeGreaterThan(0);
        expect(step.detail.en.trim().length).toBeGreaterThan(0);
      }
      expect(spec.primaryCta.href.startsWith("/")).toBe(true);
      expect(spec.mood.key).toBe(spec.id);
      expect(spec.mood.accentVar).toBe(`--vp-mood-${spec.id}-accent`);
      expect(spec.mood.oklchHue).toBeGreaterThanOrEqual(0);
      expect(spec.mood.oklchHue).toBeLessThanOrEqual(360);
    }

    expect(VIBRANT_GLOBAL_QUICK_LINKS.map((link) => link.href)).toEqual([
      "/studio",
      "/compare/studio",
      "/tech",
    ]);
  });
});

describe("VibrantPageIdentityBanner 전 페이지 렌더링 & 인터랙션 회귀 테스트", () => {
  it.each(VIBRANT_PAGE_IDENTITY_IDS)(
    "%s 페이지 배너가 엠블럼·3단계 도식·1클릭 CTA·3대 빠른 링크를 정상 렌더한다",
    (pageId: VibrantPageIdentityId) => {
      const spec = getVibrantPageIdentity(pageId);
      const { container } = render(
        <MemoryRouter initialEntries={["/"]}>
          <VibrantPageIdentityBanner pageId={pageId} activeStep={2} />
        </MemoryRouter>,
      );

      const banner = screen.getByTestId(`vibrant-page-banner-${pageId}`);
      expect(banner.getAttribute("data-vibrant-mood")).toBe(pageId);
      expect(banner.getAttribute("data-vibrant-page-id")).toBe(pageId);

      // 페이지 단일 <h1>·기사 카드(<article>) 계약을 침범하지 않는다.
      expect(container.querySelectorAll("h1")).toHaveLength(0);
      expect(container.querySelectorAll("article")).toHaveLength(0);

      const emblemImg = banner.querySelector<HTMLImageElement>("img.vp-emblem-img");
      expect(emblemImg?.getAttribute("src")).toBe(spec.emblemSrc);

      // 3단계 도식 플로우와 tabular 인덱스 01·02·03 확인
      const flowList = within(banner).getByRole("list");
      const flowItems = within(flowList).getAllByRole("listitem");
      expect(flowItems).toHaveLength(3);
      expect(flowList.textContent).toContain("01");
      expect(flowList.textContent).toContain("02");
      expect(flowList.textContent).toContain("03");
      expect(flowItems[1]?.querySelector('a[aria-current="step"]')).toBeTruthy();

      // 1클릭 CTA + 빠른 허브 링크(/studio, /compare/studio, /tech) 확인
      const allHrefs = Array.from(banner.querySelectorAll("a"), (a) => a.getAttribute("href"));
      expect(allHrefs).toContain(spec.primaryCta.href);
      expect(allHrefs).toContain("/studio");
      expect(allHrefs).toContain("/compare/studio");
      expect(allHrefs).toContain("/tech");
    },
  );

  it("영어 로케일(en)에서 한글 누출 없이 영문 카피를 렌더한다", () => {
    useI18n.setState({ lang: "en" });
    render(
      <MemoryRouter>
        <VibrantPageIdentityBanner pageId="market" />
      </MemoryRouter>,
    );

    const banner = screen.getByTestId("vibrant-page-banner-market");
    expect(banner.textContent).not.toMatch(/[가-힣]/u);
    expect(banner.textContent).toContain("Creator Asset Market");
    expect(banner.textContent).toContain("Tool Benchmark");
    expect(banner.textContent).toContain("Tech Lab");
  });

  it("Router 컨텍스트 바깥에서도 안전하게 네이티브 앵커로 렌더하고 이미지 오류 시 폴백을 보여준다", () => {
    render(<VibrantPageIdentityBanner pageId="studio" compact />);
    const banner = screen.getByTestId("vibrant-page-banner-studio");
    expect(banner.getAttribute("data-vibrant-compact")).toBe("true");
    const ctaLink = within(banner).getByRole("link", { name: "새 원고 바로 열기" });
    expect(ctaLink.getAttribute("href")).toBe("/studio/new");

    const img = banner.querySelector<HTMLImageElement>("img.vp-emblem-img");
    expect(img).toBeTruthy();
    if (img) fireEvent.error(img);
    expect(screen.getByTestId("vibrant-emblem-fallback-studio")).toBeTruthy();
  });

  it("데스크톱 포인터 이동 시 엠블럼 스테이지 틸트 변수를 갱신하고 이탈 시 0deg로 복원한다", () => {
    render(
      <MemoryRouter>
        <VibrantPageIdentityBanner pageId="tech-lab" />
      </MemoryRouter>,
    );
    const banner = screen.getByTestId("vibrant-page-banner-tech-lab");
    const stage = banner.querySelector<HTMLDivElement>(".vp-emblem-stage");
    expect(stage).toBeTruthy();
    if (!stage) return;

    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.pointerMove(stage, { clientX: 80, clientY: 20, pointerType: "mouse" });
    expect(stage.style.getPropertyValue("--vp-tilt-rx")).toMatch(/deg$/u);
    expect(stage.style.getPropertyValue("--vp-tilt-ry")).toMatch(/deg$/u);

    fireEvent.pointerLeave(stage);
    expect(stage.style.getPropertyValue("--vp-tilt-rx")).toBe("0deg");
    expect(stage.style.getPropertyValue("--vp-tilt-ry")).toBe("0deg");
  });
});

describe("VibrantVisualEmptyState 일러스트·스프링 모션·1클릭 CTA 테스트", () => {
  it("생성 엠블럼, 3단계 힌트, 1클릭 버튼 콜백과 보조 링크를 함께 렌더한다", () => {
    const onReset = vi.fn();
    render(
      <MemoryRouter>
        <VibrantVisualEmptyState
          pageId="market"
          title="조건에 맞는 소재가 없어요"
          description="필터를 초기화하거나 전체 카탈로그에서 찾아보세요."
          showStepHints
          primaryAction={{ label: "필터 초기화", onClick: onReset }}
          secondaryAction={{ label: "전체 카탈로그", href: "/market/browse" }}
        />
      </MemoryRouter>,
    );

    const empty = screen.getByTestId("vibrant-empty-state-market");
    expect(empty.getAttribute("data-vibrant-mood")).toBe("market");
    const img = empty.querySelector<HTMLImageElement>("img.vp-emblem-img");
    expect(img?.getAttribute("src")).toBe("/assets/studio/vibrant-sprites/emblem-market.webp");

    fireEvent.click(within(empty).getByRole("button", { name: "필터 초기화" }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(within(empty).getByRole("link", { name: "전체 카탈로그" }).getAttribute("href")).toBe(
      "/market/browse",
    );
    expect(within(empty).getAllByRole("listitem")).toHaveLength(3);

    if (img) fireEvent.error(img);
    expect(screen.getByTestId("vibrant-empty-fallback-market")).toBeTruthy();
  });
});

describe("320px~2560px 반응형 · 고대비 · 모션 안전 · keep-all · 원시색 0건 감사", () => {
  it("vibrant-page-motion.css가 12대 OKLCH 무드·반응형·Scroll-Driven·고대비·모션감소·44px·keep-all 계약을 모두 포함한다", () => {
    const cssPath = resolve(IDENTITY_DIR, "vibrant-page-motion.css");
    const css = readFileSync(cssPath, "utf8");

    // 12대 페이지 무드 선언 모두 존재
    for (const id of VIBRANT_PAGE_IDENTITY_IDS) {
      expect(css).toContain(`[data-vibrant-mood="${id}"]`);
    }

    // 반응형 브레이크포인트 (320px 기본 + 640px/1024px/1536px/2048px 확장)
    expect(css).toContain("min-width: 640px");
    expect(css).toContain("min-width: 1024px");
    expect(css).toContain("min-width: 1536px");
    expect(css).toContain("min-width: 2048px");

    // 모션 시스템 (Staggered Cascade, Specular 광택, Scroll-Driven Reveal, Spring 팝)
    expect(css).toContain("@keyframes vp-cascade-rise");
    expect(css).toContain("@keyframes vp-empty-spring-pop");
    expect(css).toContain(".vp-specular-sheen::before");
    expect(css).toContain("@supports (animation-timeline: view())");

    // 접근성·가독성·터치 안전 계약
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain(':root[data-design-theme="contrast"]');
    expect(css).toContain("word-break: keep-all");
    expect(css).toContain("font-variant-numeric: tabular-nums");
    expect(css).toContain("min-block-size: 44px");
    expect(css).toContain("min-inline-size: 44px");

    // 원시 hex/rgb 색상이 CSS에도 없고 OKLCH만 사용
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(css).not.toMatch(/\brgba?\s*\(/iu);
    expect(css).toContain("oklch(");
  });

  it("vibrant-identity 소스 파일(.ts/.tsx)에 원시 색상이 0건이고 모든 파일이 500줄 이하이다", () => {
    const sourceFiles = [
      "page-identity-catalog.ts",
      "VibrantPageIdentityBanner.tsx",
      "VibrantVisualEmptyState.tsx",
      "vibrant-page-motion.css",
    ] as const;

    const rawColorPatterns = [
      /#[0-9a-fA-F]{3,8}\b/u,
      /\brgba?\s*\(/iu,
      /\bhsla?\s*\(/iu,
      /\b(?:bg|text|border|ring|from|to|via)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})\b/u,
    ];

    for (const fileName of sourceFiles) {
      const content = readFileSync(resolve(IDENTITY_DIR, fileName), "utf8");
      const lineCount = content.split("\n").length;
      expect(lineCount, `${fileName} 줄 수 초과 (${lineCount}줄)`).toBeLessThanOrEqual(500);

      for (const pattern of rawColorPatterns) {
        expect(content, `${fileName}에 원시 색상 패턴 발견: ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
