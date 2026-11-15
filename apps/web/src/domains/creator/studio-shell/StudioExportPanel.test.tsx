// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { studioAutosaveKey, writeStudioLifecycleAutosave } from "../studio-autosave";
import { createStudioProjectDocument } from "../studio-project-document-store";
import { createStudioProject } from "../studio-project-library-store";
import { StudioExportPanel } from "./StudioExportPanel";

beforeEach(() => {
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioExportPanel", () => {
  it("필수 목적·형식 선택을 먼저 보여 주고 해상도·DPI 등 고급 설정은 기본으로 접어 둔다", () => {
    render(
      <MemoryRouter>
        <StudioExportPanel projectId="proj-export-1" locale="ko" />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", {
        name: "올릴 곳을 고르면 알맞은 규격을 자동으로 맞춰 드려요",
      }),
    ).toBeTruthy();

    expect(screen.getByTestId("studio-export-preset-summary").textContent).toContain("자동 맞춤 적용됨");

    const advanced = screen.getByTestId("studio-export-advanced-settings") as HTMLDetailsElement;
    expect(advanced.open).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "현재 상태 검사" }));
    expect(screen.getByRole("status").textContent).toContain("출고 전 점검을 마치고 결과를 저장했어요");

    const finalizeLink = screen.getByRole("link", { name: /편집기에서 최종 출력/u });
    expect(finalizeLink.getAttribute("href")).toBe("/studio/work/proj-export-1/publish");
  });

  it("로컬 원고가 있는 프로젝트는 실제 원고 크기로 규격 불일치를 잡아내고 비로그인 로컬 편집기와 공개 게시 동선을 분리한다", () => {
    createStudioProject(window.localStorage, {
      id: "proj-local-1",
      title: "내 첫 웹툰",
      kind: "webtoon",
    });
    createStudioProjectDocument(window.localStorage, "proj-local-1", {
      id: "doc-local-1",
      title: "1화 원고",
      kind: "webtoon",
      width: 1080,
      height: 8000,
    });

    render(
      <MemoryRouter>
        <StudioExportPanel projectId="proj-local-1" locale="ko" />
      </MemoryRouter>,
    );

    // 실제 로컬 원고 크기(1080×8000)가 초기 점검 대상으로 반영된다.
    const summary = screen.getByTestId("studio-export-preset-summary");
    expect(summary.textContent).toContain("1080 × 8000 px");
    expect(summary.textContent).toContain("현재 원고 크기 기준");
    // 더미 38,400px 높이를 권장 규격으로 오표기하지 않고 플랫폼 권장 폭·분할 상한만 안내한다.
    expect(summary.textContent).not.toContain("38400");
    expect(summary.textContent).toContain("플랫폼 권장 폭 800px");

    // 웹툰 플랫폼(800px 고정 폭) 점검 시 실제 원고 폭 차이를 잡아낸다.
    fireEvent.click(screen.getByRole("button", { name: "현재 상태 검사" }));
    expect(screen.getByText(/꼭 고칠 항목 1건/u)).toBeTruthy();

    // 원클릭 권장값 복원 후 재검사하면 통과한다.
    fireEvent.click(screen.getByTestId("studio-export-reset-recommended"));
    expect(screen.getByTestId("studio-export-preset-summary").textContent).toContain("자동 맞춤 적용됨");
    fireEvent.click(screen.getByRole("button", { name: "현재 상태 검사" }));
    expect(screen.getByText(/꼭 고칠 항목 0건/u)).toBeTruthy();

    // 비로그인 로컬 편집기 저장과 커뮤니티 공개 게시 링크가 명확히 분리된다.
    const finalizeLink = screen.getByTestId("studio-export-finalize-link");
    expect(finalizeLink.getAttribute("href")).toContain("/studio/p/proj-local-1/d/doc-local-1");
    expect(finalizeLink.getAttribute("href")).toContain("exportPanel=1");
    const communityLink = screen.getByTestId("studio-export-community-publish");
    expect(communityLink.getAttribute("href")).toBe("/studio/publish");
  });

  it("저장된 원고 페이지 스냅샷이 있으면 실제 캔버스 해상도·선택 순서·플랫폼 추천치·용량 추정치를 분리하고 편집기 핸드오프 URL에 정확히 전달한다", async () => {
    createStudioProject(window.localStorage, {
      id: "proj-pages-1",
      title: "다중 페이지 웹툰",
      kind: "webtoon",
    });
    createStudioProjectDocument(window.localStorage, "proj-pages-1", {
      id: "doc-pages-1",
      title: "1화",
      kind: "webtoon",
      width: 1080,
      height: 8000,
    });
    writeStudioLifecycleAutosave(
      window.localStorage,
      studioAutosaveKey({ userId: null, workId: "doc-pages-1" }),
      {
        version: 6,
        savedAt: "2026-11-15T05:00:00.000Z",
        title: "1화",
        pagesList: [
          { id: "p-1", name: "오프닝", canvasH: 1280, elements: [] },
          { id: "p-2", name: "전개", canvasH: 1600, elements: [] },
          { id: "p-3", name: "엔딩", canvasH: 1280, elements: [] },
        ],
      } as never,
      { preservePrimary: false },
    );

    render(
      <MemoryRouter>
        <StudioExportPanel projectId="proj-pages-1" locale="ko" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("studio-export-scope-summary").textContent).toContain("실제 편집 원고 연결됨");
    });

    // ① 실제 해상도·순서, ② 플랫폼 추천치, ③ 사전 추정치가 각각 독립 카드에 구분 표시된다.
    expect(screen.getByTestId("studio-export-scope-actual").textContent).toContain("720 × 1,280 px · 총 3P");
    expect(screen.getByTestId("studio-export-scope-order").textContent).toContain(
      "1페이지(오프닝) → 2페이지(전개) → 3페이지(엔딩)",
    );
    expect(screen.getByTestId("studio-export-scope-recommended").textContent).toContain("가로 폭 800 px 고정");
    expect(screen.getByTestId("studio-export-scope-estimate").textContent).toContain("사전 추정치");

    // 비순차·중복 입력("3, 1, 3") 시 원고 순서(1 → 3)로 정렬된 출력 순서를 알리고 핸드오프 URL과 일치시킨다.
    fireEvent.click(screen.getByTestId("studio-export-scope-select-custom"));
    fireEvent.change(screen.getByTestId("studio-export-scope-page-input"), {
      target: { value: "3, 1, 3" },
    });
    expect(screen.getByTestId("studio-export-scope-order").textContent).toContain(
      "1페이지(오프닝) → 3페이지(엔딩) (페이지 1, 3 · 2P)",
    );
    expect(screen.getByTestId("studio-export-scope-reorder-note")).toBeTruthy();

    // 형식 JPG + 플랫폼 권장 폭(800px, 1.111×) 적용
    fireEvent.click(screen.getByTestId("studio-export-reset-recommended"));
    fireEvent.change(screen.getByLabelText("형식"), { target: { value: "jpg" } });

    expect(screen.getByTestId("studio-export-scope-output-px").textContent).toContain(
      "JPG · 800 × 1,422 px (1.111×)",
    );

    const href = screen.getByTestId("studio-export-finalize-link").getAttribute("href") ?? "";
    expect(href).toContain("exportPanel=1");
    expect(href).toContain("exportFormat=jpg");
    expect(href).toContain("exportScale=1.111");
    expect(href).toContain("exportPreset=webtoon-canvas");
    expect(href).toContain("exportPages=1%2C3");
  });
});
