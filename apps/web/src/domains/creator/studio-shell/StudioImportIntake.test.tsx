// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioProject, readStudioProjectLibrary } from "../studio-project-library-store";
import { StudioImportIntake } from "./StudioImportIntake";

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ data: null, ready: true }),
}));

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioImportIntake open failure recovery", () => {
  it("preserves existing saved projects, disables repeat restore on the failed file, and exposes recovery open paths", async () => {
    const existing = createStudioProject(window.localStorage, {
      title: "보존할 기존 웹툰",
      kind: "webtoon",
      templateId: "webtoon-vertical",
    });

    const view = render(
      <MemoryRouter initialEntries={["/studio/import"]}>
        <StudioImportIntake locale="ko" />
      </MemoryRouter>,
    );

    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    const corruptPackage = new File(["not-a-valid-zip"], "broken-future.toonstudio", {
      type: "application/vnd.toonstudio.project+zip",
    });
    fireEvent.change(input, { target: { files: [corruptPackage] } });

    const restoreButton = view.getByRole("button", { name: /프로젝트 복원/u }) as HTMLButtonElement;
    expect(restoreButton.disabled).toBe(false);
    fireEvent.click(restoreButton);

    const alert = await waitFor(() => view.getByRole("alert"));
    expect(alert.textContent).toContain("기존에 저장된 내 작업과 원고는 변경되지 않았습니다");
    expect(restoreButton.disabled).toBe(true);
    expect(view.getByRole("button", { name: /다른 호환 파일 선택/u })).toBeTruthy();
    expect(view.getByRole("link", { name: /내 작업 열기/u }).getAttribute("href")).toBe("/studio");
    expect(view.getByRole("link", { name: /새 작품 시작/u }).getAttribute("href")).toBe("/studio/new");

    fireEvent.change(input, { target: { files: [] } });
    expect(view.getByRole("alert")).toBe(alert);
    expect(restoreButton.disabled).toBe(true);
    fireEvent.change(input, { target: { files: [new File(["original"], "scan.ora")] } });
    expect(view.queryByRole("alert")).toBeNull();
    expect((view.getByRole("button", { name: "편집기에서 가져오기" }) as HTMLButtonElement).disabled).toBe(false);

    const afterProjects = readStudioProjectLibrary(window.localStorage).projects;
    expect(afterProjects).toHaveLength(1);
    expect(afterProjects[0]?.id).toBe(existing.id);
    expect(afterProjects[0]?.title).toBe("보존할 기존 웹툰");
  });
});
