// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { ensureStudioSaveProfile } from "../save-first/studio-save-profile";
import { EXAMPLE_PROJECT_ID } from "../studio-example-project-content";
import { writeStudioExactResumeContext } from "../studio-exact-resume-context";
import { ensureInitialStudioProjectDocument } from "../studio-project-document-store";
import { archiveStudioProject, createStudioProject, markStudioProjectOpened } from "../studio-project-library-store";
import { resolveStudioProjectResumeTarget } from "../studio-project-resume-target";
import { SAMPLE_PROJECT_ID } from "../studio-sample-manuscript-content";
import { studioLibraryRecentWork } from "./studio-library-recent-work";
import { StudioProjectLibraryManagementContent } from "./StudioProjectLibraryManagementContent";
import { StudioProjectLibraryManagementHeader } from "./StudioProjectLibraryManagementHeader";
import { useStudioProjectLibraryManagementController } from "./useStudioProjectLibraryManagementController";

const AT = "2026-11-11T00:00:00.000Z";

function seedProject(id: string, title: string) {
  const project = createStudioProject(window.localStorage, { id, title, kind: "webtoon", createdAt: AT });
  const document = ensureInitialStudioProjectDocument(window.localStorage, {
    projectId: project.id, projectTitle: project.title, projectKind: project.kind, createdAt: AT,
  });
  markStudioProjectOpened(window.localStorage, id, document.id, { at: AT });
  return { project, document };
}

function seedExamples() {
  return [seedProject(EXAMPLE_PROJECT_ID, "기본 예제 원고"), seedProject(SAMPLE_PROJECT_ID, "기본 샘플 원고")];
}

function Harness({ content = false }: { content?: boolean }) {
  const controller = useStudioProjectLibraryManagementController();
  return <><StudioProjectLibraryManagementHeader controller={controller} />{content ? <StudioProjectLibraryManagementContent controller={controller} /> : null}</>;
}

function show(content = true, route = "/studio") {
  return render(<MemoryRouter initialEntries={[route]}><Harness content={content} /></MemoryRouter>);
}

beforeEach(() => { window.localStorage.clear(); useI18n.setState({ lang: "ko" }); });
afterEach(() => { cleanup(); window.localStorage.clear(); useI18n.setState({ lang: "ko" }); });

describe("개인 활동에 따른 작업 홈", () => {
  it("시딩된 예제만 있으면 새 작업을 우선하고 개인 최근 작업으로 오인시키지 않는다", () => {
    seedExamples();
    const { container } = show(true);
    expect(screen.queryByRole("region", { name: "최근 작업 빠른 이어하기" })).toBeNull();
    const primary = document.querySelectorAll("[data-studio-library-primary-action]");
    expect(primary).toHaveLength(1);
    expect(primary[0]?.getAttribute("data-studio-library-primary-action")).toBe("new");
    expect(screen.getByRole("link", { name: "새 작업" }).getAttribute("href")).toBe("/create");
    const alternatives = screen.getByRole("navigation", { name: "작업 시작 방식" }).closest("details");
    expect(alternatives?.open).toBe(false);
    fireEvent.click(screen.getByText("다른 작업 시작", { exact: true }));
    expect(alternatives?.open).toBe(true);
    expect(Array.from(alternatives?.querySelectorAll("a") ?? [], (link) => link.getAttribute("href"))).toEqual([
      "/studio/new?kind=webtoon&template=webtoon-vertical", "/studio/new?kind=four-cut&template=four-cut-classic", "/studio/bg3d", "/studio/import",
    ]);
    const list = container.querySelector('[data-studio-project-sections="true"]');
    if (!list || !alternatives) throw new Error("작품 목록이나 보조 도구가 없습니다.");
    expect(list.compareDocumentPosition(alternatives) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: "작업 복구" }).getAttribute("href")).toBe("/studio/recovery");
  });

  it.each([EXAMPLE_PROJECT_ID, SAMPLE_PROJECT_ID])("실제 편집기 사용 맥락이 있는 %s 원본은 같은 ID로 이어한다", (id) => {
    const examples = seedExamples();
    const opened = examples.find((entry) => entry.project.id === id);
    if (!opened) throw new Error("기본 원고가 없습니다.");
    writeStudioExactResumeContext(window.localStorage, {
      projectId: id, documentId: opened.document.id, workspace: "comic", pageId: "page-actual", updatedAt: AT,
    });
    show();
    const recent = screen.getByRole("region", { name: "최근 작업 빠른 이어하기" });
    expect(within(recent).getByText(opened.project.title)).toBeTruthy();
    const resume = within(recent).getByRole("link", { name: "이어서 작업" });
    expect(resume.getAttribute("href")).toContain(`/studio/p/${id}/d/${opened.document.id}`);
    expect(resume.getAttribute("data-studio-library-primary-action")).toBe("resume");
    expect(screen.getByRole("link", { name: "새 작업" }).hasAttribute("data-studio-library-primary-action")).toBe(false);
  });

  it("제목에 샘플이 들어가도 사용자가 만든 작업은 우선하며 다른 시작 방식은 펼쳐서 고른다", () => {
    seedExamples();
    seedProject("user-named-sample", "샘플이라는 이름의 나의 작품");
    show(true);
    expect(screen.getByRole("region", { name: "최근 작업 빠른 이어하기" }).textContent).toContain("샘플이라는 이름의 나의 작품");
    const summary = screen.getByText("다른 작업 시작", { exact: true });
    const details = summary.closest("details");
    expect(details?.open).toBe(false);
    expect(screen.getByRole("navigation", { name: "작업 시작 방식" }).closest("details")).toBe(details);
    fireEvent.click(summary);
    expect(details?.open).toBe(true);
    const starts = screen.getByRole("navigation", { name: "작업 시작 방식" });
    expect(within(starts).getAllByRole("link")).toHaveLength(4);
    expect(within(starts).getByRole("link", { name: /3D 장면 만들기/u }).getAttribute("href")).toBe("/studio/bg3d");
    fireEvent.click(summary);
    expect(details?.open).toBe(false);
  });

  it("최근 작업을 한 번만 표시하고 목록의 예제와 사용자 작업을 모두 보존한다", () => {
    seedExamples();
    seedProject("user-work", "직접 만든 개인 작품");
    const { container } = show(true);
    expect(container.querySelectorAll("[data-recent-primary='true']")).toHaveLength(1);
    expect(container.querySelectorAll("[data-studio-project-card='true']")).toHaveLength(3);
    expect(container.querySelector("[data-recent-primary='true']")?.textContent).toContain("직접 만든 개인 작품");
    expect(screen.getByRole("heading", { name: "기본 예제 원고" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "기본 샘플 원고" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "직접 만든 개인 작품" })).toBeTruthy();
    expect(screen.queryByText("복구 가능", { exact: true })).toBeNull();
    expect(container.textContent).not.toContain("이 기기에 자동저장된 작업입니다.");
    expect(container.textContent).not.toContain("파일 또는 개인 저장소와 연결한 정식 프로젝트입니다.");
  });

  it("검색 다음에 최근 원고를 한 번만 두고 같은 원고를 선택·보관·실행 취소한다", () => {
    seedProject("hero-actions", "최근 원고 관리");
    const { container } = show(true);
    const search = screen.getByRole("textbox", { name: "프로젝트 검색" });
    const recent = screen.getByRole("region", { name: "최근 작업 빠른 이어하기" });
    expect(search.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll('[data-studio-selection-checkbox]')).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "작품 선택" }));
    const checkbox = within(recent).getByRole("checkbox", { name: "최근 원고 관리 선택" });
    fireEvent.click(checkbox);
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("region", { name: "선택 작업" }).textContent).toContain("1개 선택");
    fireEvent.click(screen.getByRole("button", { name: "선택 마치기" }));
    expect(screen.queryByRole("region", { name: "선택 작업" })).toBeNull();
    fireEvent.click(within(recent).getByText("작업 관리", { exact: true }));
    const archive = within(recent).getByRole("button", { name: "보관" });
    archive.focus();
    fireEvent.click(archive);
    expect(screen.queryByRole("heading", { name: "최근 원고 관리" })).toBeNull();
    const notice = container.querySelector('[data-studio-library-notice="true"]');
    expect(document.activeElement).toBe(notice);
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(screen.getByRole("heading", { name: "최근 원고 관리" })).toBeTruthy();
    expect(container.querySelectorAll('[data-recent-primary="true"]')).toHaveLength(1);
  });

  it("프로필의 수동 저장 메타데이터만으로 최근 저장 완료를 표시하지 않는다", () => {
    seedProject("profile-only", "저장 설정만 있는 작품");
    ensureStudioSaveProfile(window.localStorage, "profile-only", { provider: "local-file", now: AT });
    const { container } = show(true);
    expect(container.querySelector("[data-studio-recent-save-badge]")).toBeNull();
    const explanation = screen.getByText("저장 설정이 있는 프로젝트입니다. 실제 저장 위치와 완료 시각은 원고에서 확인하세요.");
    const details = explanation.closest("details");
    expect(details?.open).toBe(false);
    fireEvent.click(screen.getByText("저장·내보내기·제작 관리", { exact: true }));
    expect(details?.open).toBe(true);
    expect(explanation.closest('[data-studio-project-sections="true"]')).toBeNull();
  });

  it("보관된 작업을 숨기지 않고 보관함에서도 개인 이어하기 주 행동으로 승격하지 않는다", () => {
    const { project } = seedProject("archived-user", "보관한 개인 작품");
    archiveStudioProject(window.localStorage, project.id, { at: AT });
    show(true, "/studio?view=archived");
    expect(screen.queryByRole("region", { name: "최근 작업 빠른 이어하기" })).toBeNull();
    expect(screen.getByText("보관한 개인 작품", { exact: true })).toBeTruthy();
  });
});

describe("최근 작업 자격의 단일 판정", () => {
  it("이어하기 맥락이 없는 고정 예제는 개인 최근 후보가 아니지만 일반 작업은 제목과 무관하다", () => {
    const examples = seedExamples();
    const user = seedProject("actual-user", "기본 샘플 원고");
    const entries = [...examples, user].map((entry) => entry.project);
    const resolve = (project: (typeof entries)[number]) => resolveStudioProjectResumeTarget(window.localStorage, project, "ko");
    expect(studioLibraryRecentWork(entries, resolve, 5).map((project) => project.id)).toEqual([user.project.id]);
  });
});
