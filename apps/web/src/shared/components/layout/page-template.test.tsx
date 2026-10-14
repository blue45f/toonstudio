// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdvancedSection } from "./AdvancedSection";
import { DetailTemplate } from "./DetailTemplate";
import { ListTemplate } from "./ListTemplate";
import { NowCard } from "./NowCard";
import { PageShell } from "./PageShell";
import { PurposeHeader } from "./PurposeHeader";

afterEach(cleanup);

describe("PageShell 템플릿 변형 (BLUEPRINT §3.1)", () => {
  it("variant를 지정하면 data-page-template가 붙고 슬롯 순서가 목적 헤더 → 지금 할 일 → 본문이다", () => {
    const { container } = render(
      <PageShell variant="dashboard" purposeHeader={<p>목적 헤더</p>} now={<p>지금 할 일</p>}>
        <p>본문</p>
      </PageShell>,
    );
    expect(container.firstElementChild?.getAttribute("data-page-template")).toBe("dashboard");
    const items = [...container.querySelector("[data-page-container]")!.children].map((child) => child.textContent);
    expect(items.indexOf("목적 헤더")).toBeLessThan(items.indexOf("지금 할 일"));
    expect(items.indexOf("지금 할 일")).toBeLessThan(items.indexOf("본문"));
  });

  it("reading 변형은 본문 폭(prose)으로 좁히고, dashboard는 wide를 쓴다", () => {
    const { container, rerender } = render(<PageShell variant="reading">본문</PageShell>);
    expect(container.querySelector("[data-page-container]")?.getAttribute("data-page-container")).toBe("prose");
    rerender(<PageShell variant="dashboard">본문</PageShell>);
    expect(container.querySelector("[data-page-container]")?.getAttribute("data-page-container")).toBe("wide");
  });

  it("size를 명시하면 변형 기본 폭보다 우선한다", () => {
    const { container } = render(
      <PageShell variant="reading" size="default">
        본문
      </PageShell>,
    );
    expect(container.querySelector("[data-page-container]")?.getAttribute("data-page-container")).toBe("default");
  });

  it("variant가 없으면 기존 동작과 동일하다 (data 속성 없음, wide)", () => {
    const { container } = render(<PageShell>본문</PageShell>);
    expect(container.firstElementChild?.hasAttribute("data-page-template")).toBe(false);
    expect(container.querySelector("[data-page-container]")?.getAttribute("data-page-container")).toBe("wide");
  });
});

describe("PageShell 말투 선언 (BLUEPRINT §3.4 — 표면 종류별 말투 ↔ 템플릿 변형)", () => {
  it("variant만 지정하면 변형 기본 말투(해요체)가 data-tone으로 고정된다", () => {
    const { container } = render(<PageShell variant="list">본문</PageShell>);
    expect(container.firstElementChild?.getAttribute("data-tone")).toBe("polite");
  });

  it("법적·결제 표면은 surfaceKind 선언으로 합니다체를 고정한다 (변형 기본값보다 우선)", () => {
    const { container, rerender } = render(
      <PageShell variant="reading" surfaceKind="legal">
        본문
      </PageShell>,
    );
    expect(container.firstElementChild?.getAttribute("data-tone")).toBe("formal");
    rerender(<PageShell surfaceKind="payment">본문</PageShell>);
    expect(container.firstElementChild?.getAttribute("data-tone")).toBe("formal");
    rerender(<PageShell surfaceKind="general">본문</PageShell>);
    expect(container.firstElementChild?.getAttribute("data-tone")).toBe("polite");
  });

  it("variant와 surfaceKind가 모두 없으면 data-tone도 렌더하지 않는다 (기존 동작 동일)", () => {
    const { container } = render(<PageShell>본문</PageShell>);
    expect(container.firstElementChild?.hasAttribute("data-tone")).toBe(false);
  });
});

describe("PageShell list/detail 슬롯 (S3-2 확정)", () => {
  it("list: 필터 슬롯이 지금 할 일 다음, 본문(결과)보다 앞에 렌더된다", () => {
    const { container } = render(
      <PageShell variant="list" now={<p>지금 할 일</p>} filters={<p>필터</p>}>
        <p>결과</p>
      </PageShell>,
    );
    const items = [...container.querySelector("[data-page-container]")!.children].map((child) => child.textContent);
    expect(items.indexOf("지금 할 일")).toBeLessThan(items.indexOf("필터"));
    expect(items.indexOf("필터")).toBeLessThan(items.indexOf("결과"));
    expect(container.querySelector("[data-template-slot='filters']")?.textContent).toBe("필터");
  });

  it("detail: rail이 주 대상 뒤 aside로 렌더되고 변형 속성은 중복되지 않는다", () => {
    const { container } = render(
      <PageShell variant="detail" rail={<p>보조 레일</p>}>
        <p>주 대상</p>
      </PageShell>,
    );
    const rail = container.querySelector("aside[data-template-slot='rail']");
    expect(rail?.textContent).toBe("보조 레일");
    const work = container.querySelector("[data-template-slot='work']");
    expect(work?.textContent).toBe("주 대상");
    expect(work!.compareDocumentPosition(rail!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll("[data-page-template]")).toHaveLength(1);
  });

  it("rail이 없으면 기존처럼 본문만 렌더된다 (그리드 래퍼 없음)", () => {
    const { container } = render(<PageShell variant="detail">주 대상</PageShell>);
    expect(container.querySelector("[data-template-slot='work']")).toBeNull();
    expect(screen.getByText("주 대상")).toBeTruthy();
  });
});

describe("ListTemplate 계약 (§3.1 list 변형, 섹션 단위)", () => {
  it("필터가 결과보다 앞에 오고 data-page-template=list를 선언한다", () => {
    const { container } = render(
      <ListTemplate filters={<p>필터</p>}>
        <p>결과 그리드</p>
      </ListTemplate>,
    );
    const root = container.querySelector("[data-page-template='list']");
    expect(root).toBeTruthy();
    const slots = [...root!.querySelectorAll("[data-template-slot]")].map((node) => node.getAttribute("data-template-slot"));
    expect(slots).toEqual(["filters", "work"]);
  });

  it("필터가 없으면 필터 슬롯을 만들지 않는다", () => {
    const { container } = render(<ListTemplate>결과</ListTemplate>);
    expect(container.querySelector("[data-template-slot='filters']")).toBeNull();
    expect(container.querySelector("[data-template-slot='work']")?.textContent).toBe("결과");
  });
});

describe("DetailTemplate 계약 (§3.1 detail 변형, 섹션 단위)", () => {
  it("레일이 있으면 그리드 + aside 레일, 없으면 단일 열이다", () => {
    const { container, rerender } = render(
      <DetailTemplate rail={<p>레일</p>}>
        <p>주 대상</p>
      </DetailTemplate>,
    );
    const root = container.querySelector("[data-page-template='detail']");
    expect(root?.className).toContain("lg:grid-cols-[minmax(0,1fr)_20rem]");
    expect(container.querySelector("aside[data-template-slot='rail']")?.textContent).toBe("레일");
    rerender(<DetailTemplate>주 대상</DetailTemplate>);
    expect(container.querySelector("[data-page-template='detail']")?.className).not.toContain("lg:grid");
    expect(container.querySelector("aside")).toBeNull();
  });
});

describe("PurposeHeader 계약 (§3.1 목적 헤더)", () => {
  it("제목은 h1 하나로 렌더되고 주 행동이 함께 보인다", () => {
    render(<PurposeHeader eyebrow="프로젝트" title="개요" primaryAction={<button type="button">주 행동</button>} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "주 행동" })).toBeTruthy();
  });
});

describe("NowCard 계약 (§3.2)", () => {
  it("title·reason·action을 렌더하고 tone을 데이터 속성으로 남긴다", () => {
    const { container } = render(
      <NowCard eyebrow="지금 할 일" title="검수 대기 2건" reason="마감이 오늘입니다" tone="warning" action={<a href="/x">검수 열기</a>} />,
    );
    expect(screen.getByText("검수 대기 2건")).toBeTruthy();
    expect(screen.getByText("마감이 오늘입니다")).toBeTruthy();
    expect(screen.getByRole("link", { name: "검수 열기" })).toBeTruthy();
    expect(container.querySelector("[data-now-card]")?.getAttribute("data-now-card")).toBe("warning");
  });

  it("dismissible이면 닫기 버튼이 카드를 숨기고 onDismiss를 부른다", () => {
    const onDismiss = vi.fn();
    render(
      <NowCard eyebrow="지금 할 일" title="제목" reason="이유" action={<a href="/x">이동</a>} dismissible dismissLabel="카드 닫기" onDismiss={onDismiss} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "카드 닫기" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("제목")).toBeNull();
  });
});

describe("AdvancedSection 계약 (§3.1 고급 구역)", () => {
  it("기본은 접힘이고 children을 마운트하지 않는다 (지연 렌더 보존)", () => {
    render(
      <AdvancedSection title="운영 자세히 보기">
        <p>비싼 상세</p>
      </AdvancedSection>,
    );
    expect(screen.getByText("운영 자세히 보기")).toBeTruthy();
    expect(screen.queryByText("비싼 상세")).toBeNull();
  });

  it("defaultOpen이면 처음부터 본문이 보인다", () => {
    render(
      <AdvancedSection title="운영 자세히 보기" defaultOpen>
        <p>비싼 상세</p>
      </AdvancedSection>,
    );
    expect(screen.getByText("비싼 상세")).toBeTruthy();
  });
});
