// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PolicyArticle, PrivacyPage, TermsPage } from "./PolicyPage";
import { getStaticPolicyDocument, groupPolicySections, parsePolicyBlocks, shortContentHash } from "./policy-content";

import { useI18n } from "@/shared/lib/i18n-core";

afterEach(() => {
  cleanup();
  act(() => useI18n.getState().setLang("ko"));
  vi.restoreAllMocks();
});

describe("개인정보 안내의 문서 우선 디자인", () => {
  it("정책 원문의 모든 본문·목록과 게시 버전을 그대로 유지한다", () => {
    const doc = getStaticPolicyDocument("privacy-policy");
    const canonical = render(<PolicyArticle doc={doc} />);
    const originalText = canonical.container.querySelector(".policy-page__article")?.textContent;
    canonical.unmount();
    const page = render(<PrivacyPage />);
    expect(page.container.querySelector(".policy-page__article")?.textContent).toBe(originalText);
    expect(screen.getAllByText(doc.versionLabel).length).toBeGreaterThan(0);
    expect(screen.getAllByText(shortContentHash(doc.contentHash)).length).toBeGreaterThan(0);
    expect(screen.getByText("툰스튜디오 게시 정책")).toBeTruthy();
  });

  it("개인정보 문서에는 마케팅 이미지 없이 요약·목차·전체 본문을 제공한다", () => {
    const { container } = render(<PrivacyPage />);
    const root = container.querySelector(".privacy-policy");
    expect(root?.querySelector("img")).toBeNull();
    expect(within(screen.getByRole("region", { name: "먼저 보는 쉬운 말 요약" })).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "전체 정책 읽기" }).getAttribute("href")).toBe("#privacy-policy-document");
    expect(screen.getByRole("article", { name: "개인정보처리방침" }).getAttribute("tabindex")).toBe("-1");
  });

  it("접힌 모바일 목차와 데스크톱 목차 모두 모든 실제 조항으로 연결한다", () => {
    const { container } = render(<PrivacyPage />);
    const sections = groupPolicySections(parsePolicyBlocks(getStaticPolicyDocument("privacy-policy").body));
    const expected = sections.flatMap((section, index) => section.heading ? [`#policy-section-${index + 1}`] : []);
    const mobile = container.querySelector("details");
    expect(mobile?.hasAttribute("open")).toBe(false);
    for (const selector of [".privacy-policy__mobile-contents", ".privacy-policy__desktop-contents"]) {
      const links = Array.from(container.querySelectorAll(`${selector} a`));
      expect(links.map((a) => a.getAttribute("href"))).toEqual(expected);
      for (const href of expected) {
        expect(container.querySelector(href)?.getAttribute("tabindex")).toBe("-1");
      }
    }
  });

  it("조항 주소가 중복되지 않고 직접 링크도 유지된다", () => {
    const { container } = render(<PrivacyPage />);
    const ids = Array.from(container.querySelectorAll("[id]")).map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of container.querySelectorAll(".policy-page__article section[id]")) {
      expect(section.querySelector(`a[href="#${section.id}"]`)).toBeTruthy();
    }
  });

  it("목차를 반복해서 열고 닫아도 정책 원문은 항상 남는다", () => {
    const { container } = render(<PrivacyPage />);
    const details = container.querySelector("details");
    const summary = details?.querySelector("summary");
    if (!details || !summary) throw new Error("모바일 목차 누락");
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(summary);
      expect(details.open).toBe(true);
      fireEvent.click(summary);
      expect(details.open).toBe(false);
    }
    expect(screen.getByRole("heading", { name: "4. 기기 내 AI 기능과 MediaPipe", level: 2 })).toBeTruthy();
  });

  it("인쇄는 사용자 조작 때만 실행하며 반복 실행을 막지 않는다", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<PrivacyPage />);
    expect(print).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "인쇄·PDF 저장" }));
    fireEvent.click(screen.getByRole("button", { name: "인쇄·PDF 저장" }));
    expect(print).toHaveBeenCalledTimes(2);
  });

  it("문의 및 다른 법적 문서 링크를 보존하며 개인정보 동의나 전송을 추가하지 않는다", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const { container } = render(<PrivacyPage />);
    expect(screen.getByRole("link", { name: "문의 안내" }).getAttribute("href")).toBe("/support");
    expect(container.querySelector('a[href="/terms"]')).toBeTruthy();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("언어 변경 시 새 조작 문구가 갱신되며 검토된 한국어 정책 원문을 임의 번역하지 않는다", () => {
    render(<PrivacyPage />);
    act(() => useI18n.getState().setLang("en"));
    expect(screen.getByRole("link", { name: "Read the full policy" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Print / save as PDF" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "4. 기기 내 AI 기능과 MediaPipe", level: 2 })).toBeTruthy();
  });

  it("이용약관은 기존 공용 레이아웃과 기본 조항 포커스 계약을 유지한다", () => {
    const { container } = render(<TermsPage />);
    expect(container.querySelector(".privacy-policy")).toBeNull();
    expect(container.querySelector(".policy-page__summary")).toBeTruthy();
    expect(container.querySelector(".policy-page__layout")).toBeTruthy();
    expect(container.querySelector(".policy-page__article section")?.hasAttribute("tabindex")).toBe(false);
    expect(screen.getByRole("heading", { name: "제1조 (목적)", level: 2 })).toBeTruthy();
  });
});
