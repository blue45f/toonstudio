// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AdvancedSection } from "./AdvancedSection";
import { FormStepSection } from "./FormStepSection";
import { LAYOUT_TOKENS, PAGE_TEMPLATE_WIDTH } from "./layout-tokens";
import { PageShell } from "./PageShell";
import { PurposeHeader } from "./PurposeHeader";

afterEach(cleanup);

describe("FormStepSection 계약 (BLUEPRINT §3.1 form 변형)", () => {
  it("단계 섹션은 aria-labelledby가 제목 h2를 가리키고 번호 배지를 데이터로 렌더한다", () => {
    const { container } = render(
      <FormStepSection step={3} titleId="details-title" title="프로젝트 세부 설정" description="형식마다 다르게 준비됩니다">
        <p>입력 본문</p>
      </FormStepSection>,
    );
    const section = container.querySelector("section");
    expect(section?.getAttribute("aria-labelledby")).toBe("details-title");
    expect(section?.getAttribute("data-form-step")).toBe("3");
    const heading = screen.getByRole("heading", { level: 2, name: "프로젝트 세부 설정" });
    expect(heading.id).toBe("details-title");
    expect(section?.textContent).toContain("3");
    expect(screen.getByText("형식마다 다르게 준비됩니다")).toBeTruthy();
    expect(screen.getByText("입력 본문")).toBeTruthy();
  });

  it("설명 없이도 제목과 본문만으로 렌더된다", () => {
    render(
      <FormStepSection step={1} titleId="only-title" title="첫 단계">
        <p>본문</p>
      </FormStepSection>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "첫 단계" })).toBeTruthy();
    expect(screen.getByText("본문")).toBeTruthy();
  });

  it("단계 카드 리듬은 토큰이 고정한다 (기존 /studio/new 섹션과 같은 값)", () => {
    expect(LAYOUT_TOKENS.formStep).toBe("mt-4 rounded-3xl border border-line bg-card p-4 sm:p-5");
    expect(LAYOUT_TOKENS.formStepBadge).toContain("rounded-full");
  });
});

describe("AdvancedSection 설정 파일럿 (S3-3: panel 프리셋 + keepMounted)", () => {
  it("기본(card) 동작은 원형 그대로 — 접힌 동안 본문을 마운트하지 않는다", () => {
    const { container } = render(
      <AdvancedSection title="운영 상세">
        <p>비싼 상세 본문</p>
      </AdvancedSection>,
    );
    const details = container.querySelector("details");
    expect(details?.open).toBe(false);
    expect(details?.className).toContain("bg-card");
    expect(screen.queryByText("비싼 상세 본문")).toBeNull();
  });

  it("panel + keepMounted는 접힌 상태에서도 링크가 DOM에 남고 data 속성이 루트로 전달된다", () => {
    const { container } = render(
      <AdvancedSection
        preset="panel"
        keepMounted
        data-related-settings=""
        className="mb-6"
        title="다른 설정 화면"
        description="멤버십 · AI"
      >
        <nav aria-label="관련 설정">
          <a href="/membership">멤버십</a>
          <a href="/settings/ai">AI</a>
          <a href="/settings/notifications">알림 설정</a>
        </nav>
      </AdvancedSection>,
    );
    // SettingsPage.test.tsx가 고정하는 계약과 같은 형태: 셀렉터 + 닫힌 상태 + 링크 조회.
    const related = container.querySelector("details[data-related-settings]") as HTMLDetailsElement;
    expect(related).toBeTruthy();
    expect(related.open).toBe(false);
    expect(related.className).toContain("bg-panel/40");
    expect(related.className).toContain("mb-6");
    const hrefs = within(related)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/membership", "/settings/ai", "/settings/notifications"]));
  });
});

describe("form 변형 조립 (PageShell + PurposeHeader + FormStepSection)", () => {
  it("슬롯 순서는 목적 헤더 → 단계 1 → 단계 2 이고 루트에 form 변형이 선언된다", () => {
    const { container } = render(
      <PageShell
        variant="form"
        purposeHeader={<PurposeHeader eyebrow="새 프로젝트" title="어떤 결과물을 완성하려고 하나요?" />}
      >
        <FormStepSection step={1} titleId="step-one" title="형식 선택">
          <p>형식 본문</p>
        </FormStepSection>
        <FormStepSection step={2} titleId="step-two" title="재료 선택">
          <p>재료 본문</p>
        </FormStepSection>
      </PageShell>,
    );
    expect(container.firstElementChild?.getAttribute("data-page-template")).toBe("form");
    // form 변형의 셸 폭은 표준 폭이다 — 필드 열은 표면 안 단계 섹션이 정한다.
    expect(PAGE_TEMPLATE_WIDTH.form).toBe("standard");
    expect(container.querySelector("[data-page-container]")?.getAttribute("data-page-container")).toBe("wide");
    const steps = [...container.querySelectorAll("[data-form-step]")].map((el) => el.getAttribute("data-form-step"));
    expect(steps).toEqual(["1", "2"]);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
