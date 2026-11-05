// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineeringLicensesPage } from "./EngineeringLicensesPage";
import { ENGINEERING_LICENSE_GROUPS } from "./engineering-story-content";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));

afterEach(cleanup);

function renderLicenses() {
  return render(
    <MemoryRouter initialEntries={["/about/technology/licenses"]}>
      <EngineeringLicensesPage />
    </MemoryRouter>,
  );
}

function familiesSection(): HTMLElement {
  const heading = screen.getByRole("heading", { level: 2, name: /종류별 기본 의무|Baseline obligations/u });
  const section = heading.closest("section");
  if (!section) throw new Error("license families section is missing");
  return section;
}

describe("문서 첫 화면", () => {
  it("자료 · 라이선스 정체성 칩과 핵심 요약을 보여준다", () => {
    renderLicenses();

    expect(screen.getByText(/자료 · 라이선스|Resources · Licenses/u)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /핵심 요약|Key summary/u })).toBeTruthy();
  });

  it("목차의 모든 항목이 본문 섹션으로 이어진다", () => {
    renderLicenses();

    const [toc] = screen.getAllByRole("navigation", { name: /라이선스 문서 목차|Licensing document contents/u });
    if (!toc) throw new Error("licenses table of contents is missing");
    const links = within(toc).getAllByRole("link");
    expect(links).toHaveLength(5);
    for (const link of links) {
      const target = link.getAttribute("href")?.slice(1) ?? "";
      expect(document.getElementById(target), target).not.toBeNull();
    }
  });
});

describe("라이선스 이름 검색", () => {
  it("검색 전에는 여섯 종류를 모두 보여주고 개수를 알린다", () => {
    renderLicenses();
    const section = familiesSection();
    for (const group of ENGINEERING_LICENSE_GROUPS) {
      expect(within(section).getByRole("heading", { level: 3, name: group.title.ko })).toBeTruthy();
    }
    expect(within(section).getByRole("status").textContent).toContain(
      `${String(ENGINEERING_LICENSE_GROUPS.length)}개 / 전체 ${String(ENGINEERING_LICENSE_GROUPS.length)}개 종류`,
    );
  });

  it("이름으로 검색하면 맞는 종류만 남는다", () => {
    renderLicenses();
    const section = familiesSection();
    const search = within(section).getByLabelText(/라이선스 이름 검색|Search by license name/u);
    fireEvent.change(search, { target: { value: "MIT" } });

    expect(within(section).getByRole("heading", { level: 3, name: "MIT · BSD · ISC" })).toBeTruthy();
    expect(within(section).queryByRole("heading", { level: 3, name: "Apache-2.0" })).toBeNull();
    expect(within(section).queryByRole("heading", { level: 3, name: /GPL/u })).toBeNull();
    expect(within(section).getByRole("status").textContent).toContain("1개 / 전체 6개 종류");
  });

  it("예시에 든 이름으로도 찾을 수 있다", () => {
    renderLicenses();
    const section = familiesSection();
    const search = within(section).getByLabelText(/라이선스 이름 검색|Search by license name/u);
    fireEvent.change(search, { target: { value: "fonts" } });

    expect(within(section).getByRole("heading", { level: 3, name: /Creative Commons/u })).toBeTruthy();
    expect(within(section).getByRole("status").textContent).toContain("1개 / 전체 6개 종류");
  });

  it("결과가 없으면 빈 상태를 보여주고 초기화로 전체를 되돌린다", () => {
    renderLicenses();
    const section = familiesSection();
    const search = within(section).getByLabelText(/라이선스 이름 검색|Search by license name/u);
    fireEvent.change(search, { target: { value: "없는라이선스이름" } });

    expect(within(section).getByText(/검색과 일치하는 라이선스 종류가 없습니다|No license family matches/u)).toBeTruthy();
    expect(within(section).queryByRole("heading", { level: 3 })).toBeNull();
    expect(within(section).getByRole("status").textContent).toContain("0개 / 전체 6개 종류");

    fireEvent.click(within(section).getByRole("button", { name: /검색 초기화|Reset search/u }));
    for (const group of ENGINEERING_LICENSE_GROUPS) {
      expect(within(section).getByRole("heading", { level: 3, name: group.title.ko })).toBeTruthy();
    }
  });

  it("마지막 글이라 다음 글 자리에는 기술 허브 카드가 온다", () => {
    renderLicenses();
    const pager = screen.getByRole("navigation", { name: /기술 문서 이어보기|Continue through/u });
    expect(within(pager).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/about/technology/glossary",
      "/about/technology",
    ]);
    expect(within(pager).getByRole("link", { name: /이전 글.*용어집|Previous article.*Glossary/u })).toBeTruthy();
  });
});

describe("라이브러리 현황", () => {
  function inventorySection(): HTMLElement {
    const heading = screen.getByRole("heading", { level: 2, name: /실제로 설치해 쓰는 라이브러리|actually installed/u });
    const section = heading.closest("section");
    if (!section) throw new Error("library inventory section is missing");
    return section;
  }

  it("카피레프트와 자체 라이선스 항목을 따로 드러내고 모델 자산을 함께 보인다", () => {
    renderLicenses();
    const section = inventorySection();
    expect(within(section).getAllByText("opencascade.js").length).toBeGreaterThan(0);
    expect(within(section).getAllByText("LGPL-2.1-only").length).toBeGreaterThan(0);
    expect(within(section).queryByText("mixbox")).toBeNull();
    expect(within(section).getByText("u2netp.onnx")).toBeTruthy();
    expect(within(section).getByText("tag2pix.onnx")).toBeTruthy();
    expect(within(section).getByRole("status").textContent).toContain("115개 / 전체 115개 라이브러리");
  });

  it("라이브러리 검색은 이름으로 걸러 개수를 알린다", () => {
    renderLicenses();
    const section = inventorySection();
    const search = within(section).getByLabelText(/라이브러리·라이선스 검색|Search libraries/u);
    fireEvent.change(search, { target: { value: "opencascade" } });

    expect(within(section).getByRole("status").textContent).toContain("1개 / 전체 115개 라이브러리");
    expect(within(section).getAllByText("opencascade.js").length).toBeGreaterThan(0);
    expect(within(section).queryByText("three")).toBeNull();
  });

  it("Remotion의 무료 상업 사용 전제와 Tag2Pix 비상업 제한을 구별한다", () => {
    renderLicenses();
    const section = inventorySection();
    const notes = within(section).getAllByText(/Remotion 4\.0\.536의 자체 라이선스/u);
    expect(notes).toHaveLength(2);
    for (const note of notes) {
      expect(note.textContent).toContain("개인 또는 직원 3명 이하 영리 조직의 무료 상업 사용");
      expect(note.textContent).toContain("운영자가 설명한 개인·1인 운영 전제");
      expect(note.textContent).toContain("조직 전체 3명 이하");
      expect(note.textContent).toContain("실제 조직 인원은 독립 검증하지 않았습니다");
      expect(note.textContent).toContain("비상업 조건인 Tag2Pix 가중치와는 다른 항목");
    }
    expect(within(section).getByText("Non-commercial; redistribution restricted")).toBeTruthy();
  });
});


describe("모델 가중치 권리 공개", () => {
  it("기존 모델 기능을 숨기지 않고 제한·조건 충돌·MIT 체크포인트를 구별한다", () => {
    renderLicenses();
    const tagRow = screen.getByText("tag2pix.onnx").closest("article");
    const paprikaRow = screen.getByText("animegan2-paprika.onnx").closest("article");
    const faceRow = screen.getByText("animegan2-face-paint-512-v2.onnx").closest("article");
    expect(tagRow?.textContent).toContain("Non-commercial; redistribution restricted");
    expect(tagRow?.textContent).toMatch(/이용·재배포 제한|Use and redistribution restrictions/u);
    expect(paprikaRow?.textContent).toMatch(/권리 확인 대기|Rights verification pending/u);
    expect(faceRow?.textContent).toContain("MIT (repository checkpoint)");
    expect(faceRow?.textContent).toMatch(/학습 출처는 일부만 공개|Training provenance is partially documented/u);
    expect(faceRow?.textContent).not.toMatch(/권리 확인 대기|Rights verification pending/u);
    expect(screen.getByText(/고지 파일이나 SHA-256 일치가 상용 이용 허가를 뜻하지 않습니다|a notice file or matching SHA-256 does not grant commercial permission/u)).toBeTruthy();
  });
});
