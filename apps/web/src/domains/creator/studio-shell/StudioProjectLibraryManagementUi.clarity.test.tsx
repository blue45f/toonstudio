// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { createDefaultStudioSaveProfile, type StudioSaveProfile } from "../save-first/studio-save-profile";
import { createStudioProject } from "../studio-project-library-store";
import { StudioProjectLibraryCard, StudioProjectSaveBadge } from "./StudioProjectLibraryManagementUi";
import { studioProjectLibraryDateLabel } from "./studio-project-library-management-model";

const MANUAL_AT = "2026-10-01T02:00:00.000Z";
const METADATA_AT = "2026-11-11T03:00:00.000Z";
const noop = () => {};

function renderCard(profile: StudioSaveProfile) {
  const project = createStudioProject(window.localStorage, { id: profile.projectId, title: "메타데이터 확인", kind: "webtoon", createdAt: MANUAL_AT });
  return render(<MemoryRouter><StudioProjectLibraryCard
    project={project} profile={profile} locale="ko" authUserId={null} checked={false}
    temporary={false} localFileSaved={false} busy={false}
    continueHref="/studio/test-document" resumeSummary={null} resumeExact={false}
    overviewHref="/studio/test-overview" storageHref={`/studio?view=storage&project=${project.id}`}
    onToggle={noop} onTouch={noop} onOpenSave={noop} onSavePackage={noop}
    onDuplicate={noop} onArchive={noop} onTrash={noop}
  /></MemoryRouter>);
}

beforeEach(() => { window.localStorage.clear(); useI18n.setState({ lang: "ko" }); });
afterEach(() => { cleanup(); window.localStorage.clear(); useI18n.setState({ lang: "ko" }); });

describe("프로젝트 목록의 저장 정보 표현", () => {
  it("브라우저 작업의 분류를 자동저장 완료로 표현하지 않는다", () => {
    const profile = createDefaultStudioSaveProfile("browser-work", { now: METADATA_AT });
    const { container } = render(<StudioProjectSaveBadge profile={profile} locale="ko" />);
    expect(screen.getByText("임시 작업", { exact: true })).toBeTruthy();
    expect(container.textContent).not.toMatch(/자동저장|저장됨|완료|백업/u);
  });

  it("프로필의 synced 메타데이터만으로 저장 성공을 단정하지 않는다", () => {
    const base = createDefaultStudioSaveProfile("configured-work", { provider: "local-file", now: METADATA_AT });
    const profile: StudioSaveProfile = {
      ...base,
      lastManualSaveAt: MANUAL_AT,
      bindings: base.bindings.map((binding) => ({ ...binding, syncState: "synced", connectionRequired: false, lastSyncedAt: MANUAL_AT })),
    };
    const { container } = render(<StudioProjectSaveBadge profile={profile} locale="ko" />);
    expect(screen.getByText("프로젝트", { exact: true })).toBeTruthy();
    expect(container.textContent).not.toMatch(/저장됨|완료|안전|백업|실패|충돌/u);
    expect(container.querySelector(".text-success, .text-warning, .text-danger")).toBeNull();
  });

  it.each([
    ["error", "저장 오류 확인 필요"],
    ["conflict", "저장 충돌 확인 필요"],
  ] as const)("보고된 %s 상태에는 확인할 문제를 직접 표시한다", (syncState, label) => {
    const base = createDefaultStudioSaveProfile("attention-work", { provider: "local-file", now: METADATA_AT });
    const profile: StudioSaveProfile = { ...base, bindings: base.bindings.map((binding) => ({ ...binding, syncState })) };
    renderCard(profile);
    expect(screen.getByText(label, { exact: true })).toBeTruthy();
    expect(screen.getByRole("link", { name: "저장·백업" }).getAttribute("href")).toBe("/studio?view=storage&project=attention-work");
  });

  it("연결이 필요한 저장소는 중립 프로필과 구분하여 연결 필요를 표시한다", () => {
    const profile = createDefaultStudioSaveProfile("pending-work", { provider: "google-drive", now: METADATA_AT });
    render(<StudioProjectSaveBadge profile={profile} locale="ko" />);
    expect(screen.getByText("저장소 연결 필요", { exact: true })).toBeTruthy();
  });

  it("카드는 프로필 정보 갱신 시각을 보여 주며 완료된 정식 저장 시각으로 오인시키지 않는다", () => {
    const profile: StudioSaveProfile = {
      ...createDefaultStudioSaveProfile("metadata-only", { provider: "local-file", now: METADATA_AT }),
      lastManualSaveAt: MANUAL_AT,
    };
    renderCard(profile);
    const metadata = screen.getByText("저장 정보 업데이트", { exact: true }).parentElement;
    expect(metadata?.textContent).toContain(studioProjectLibraryDateLabel(METADATA_AT, "ko"));
    expect(metadata?.textContent).not.toContain(studioProjectLibraryDateLabel(MANUAL_AT, "ko"));
    expect(screen.queryByText("마지막 정식 저장", { exact: true })).toBeNull();
  });
});
