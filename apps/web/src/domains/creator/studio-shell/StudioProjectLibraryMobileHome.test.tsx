// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { createDefaultStudioSaveProfile } from "../save-first/studio-save-profile";
import { createStudioProject } from "../studio-project-library-store";
import { StudioProjectLibraryCompactCard } from "./StudioProjectLibraryCompactCard";
import { StudioProjectLibraryResumeCard } from "./StudioProjectLibraryResumeCard";

vi.mock("./StudioProjectCardThumbnail", () => ({
  StudioProjectCardThumbnail: ({ project }: { project: { id: string; thumbnailUrl?: string | null } }) => (
    <div data-thumbnail-project={project.id} data-thumbnail-source={project.thumbnailUrl ?? ""} />
  ),
}));

const AT = "2026-11-12T03:00:00.000Z";
const RESUME = "/studio/p/my-work/d/my-document?workspace=comic&page=page-three";
const onResume = vi.fn();

beforeEach(() => { window.localStorage.clear(); useI18n.setState({ lang: "ko" }); onResume.mockReset(); });
afterEach(() => { cleanup(); window.localStorage.clear(); useI18n.setState({ lang: "ko" }); });

function project() {
  return createStudioProject(window.localStorage, { id: "my-work", title: "내 원고", kind: "webtoon", createdAt: AT });
}

describe("모바일 작업 홈의 재개와 저장 정보", () => {
  it("원래 문서·컷의 재개 주소를 그대로 사용하며 실제 작품으로 미리보기를 요청한다", () => {
    const work = project();
    const { container } = render(<MemoryRouter><StudioProjectLibraryResumeCard
      project={work} profile={createDefaultStudioSaveProfile(work.id, { now: AT })}
      authUserId={null} locale="ko" resumeHref={RESUME}
      overviewHref="/studio/p/my-work/overview" onResume={onResume}
    /></MemoryRouter>);
    const resume = screen.getByRole("link", { name: "최근 작업 열기" });
    expect(resume.getAttribute("href")).toBe(RESUME);
    expect(container.querySelector("[data-thumbnail-project='my-work']")).toBeTruthy();
    fireEvent.click(resume);
    expect(onResume).toHaveBeenCalledOnce();
    expect(screen.getByText(/^마지막 열기/u)).toBeTruthy();
    expect(container.textContent).not.toMatch(/저장됨|저장 완료|자동저장됨/u);
  });

  it("프로필 설정과 갱신 시각을 저장 완료로 표시하지 않고 오류 확인을 가까이 둔다", () => {
    const work = project();
    const profile = createDefaultStudioSaveProfile(work.id, { provider: "local-file", now: AT });
    const { container } = render(<MemoryRouter><StudioProjectLibraryResumeCard
      project={work} profile={{ ...profile, lastManualSaveAt: AT,
        bindings: profile.bindings.map((binding) => ({ ...binding, syncState: "error" })) }}
      authUserId={null} locale="ko" resumeHref={RESUME}
      overviewHref="/studio/p/my-work/overview" onResume={onResume}
    /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "저장 오류 확인" }).getAttribute("href"))
      .toBe("/studio?view=storage&project=my-work");
    expect(container.textContent).not.toMatch(/저장됨|저장 완료|자동저장됨/u);
  });

  it("간결한 목록에서 이어하기·저장은 직접 제공하고 관리 기능은 펼쳐서 실행한다", () => {
    const work = project();
    const archive = vi.fn(); const save = vi.fn();
    const { container } = render(<MemoryRouter><StudioProjectLibraryCompactCard
      project={work} profile={createDefaultStudioSaveProfile(work.id, { now: AT })}
      authUserId={null} locale="ko" checked={false} temporary localFileSaved={false} busy={false}
      continueHref={RESUME} resumeSummary="3번째 컷" resumeExact overviewHref="/studio/p/my-work/overview"
      storageHref="/studio?view=storage&project=my-work" onToggle={vi.fn()} onTouch={onResume}
      onOpenSave={save} onSavePackage={vi.fn()} onDuplicate={vi.fn()} onArchive={archive} onTrash={vi.fn()}
    /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "이어서 작업" }).getAttribute("href")).toBe(RESUME);
    expect(screen.getByRole("heading", { name: work.title })).toBeTruthy();
    const management = container.querySelector("details");
    expect(management?.open).toBe(false);
    expect(screen.getByRole("button", { name: "보관" }).closest("details")).toBe(management);
    expect(screen.getByText("3번째 컷").closest("details")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "정식 저장" }));
    expect(save).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("작업 관리", { exact: true }));
    const details = container.querySelector("details");
    expect(details?.open).toBe(true);
    if (!details) throw new Error("관리 메뉴가 없습니다.");
    fireEvent.click(within(details).getByRole("button", { name: "보관" }));
    expect(archive).toHaveBeenCalledOnce();
  });
});
