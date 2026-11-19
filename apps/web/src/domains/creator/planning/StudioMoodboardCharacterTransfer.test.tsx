// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readStudioProjectDiagnosticSource } from "../studio-project-diagnostic-source-store";
import { updateStudioProjectWorkspaceState } from "../studio-project-workspace-store";

import { StudioProjectMoodboard } from "./StudioProjectMoodboard";
import { upsertStoryCharacterProfile } from "./studio-character-profile";

const character = { id: "yuri", name: "유리", aliases: [], defaultCostumeId: null, defaultAppearanceId: null };
const original = { characterId: character.id, background: "기존 배경", motivation: "귀환", signatureLines: ["기다려"], appearanceNotes: "안경", personality: "신중", speechStyle: "반말" };

function seed(projectId: string) {
  updateStudioProjectWorkspaceState(localStorage, projectId, current => ({
    ...current, story: { ...current.story, bible: { ...current.story.bible, characters: [character, { ...character, id: "other", name: "가온" }] },
      narrative: { relations: [], profiles: [original, { ...original, characterId: "other" }] } },
  }));
}
function mountPreview() {
  const view = render(<StudioProjectMoodboard projectId="A" />);
  const form = within(screen.getAllByRole("form", { name: "카드 더하기" })[0]!);
  fireEvent.change(form.getByLabelText("내용"), { target: { value: "비가 오면 안경을 닦는다." } });
  fireEvent.click(form.getByRole("button", { name: "카드 더하기" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /기획으로 보낼 카드로 고르기/ }));
  fireEvent.change(screen.getByRole("combobox", { name: "이 작품의 인물" }), { target: { value: "yuri" } });
  fireEvent.click(screen.getByRole("button", { name: "고른 카드로 인물 시트 미리 보기" }));
  return view;
}
function profiles(id: string) { return readStudioProjectDiagnosticSource(localStorage, id)!.story.narrative.profiles; }
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

describe("아이디어 보드의 인물 시트 반영", () => {
  it("미리 보기와 닫기는 쓰지 않고 선택한 인물에만 추가한 뒤 다시 연다", () => {
    seed("A"); seed("B");
    const view = mountPreview();
    expect(profiles("A")[0]).toEqual(original);
    fireEvent.click(screen.getByRole("button", { name: "미리 보기 닫기" }));
    expect(profiles("A")[0]).toEqual(original);
    fireEvent.click(screen.getByRole("button", { name: "고른 카드로 인물 시트 미리 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "인물 시트에 추가" }));
    expect(profiles("A")[0]).toEqual({ ...original, background: "기존 배경\n비가 오면 안경을 닦는다." });
    expect(profiles("A")[1]).toEqual({ ...original, characterId: "other" });
    expect(profiles("B")[0]).toEqual(original);
    view.unmount();
    render(<StudioProjectMoodboard projectId="A" />);
    fireEvent.click(screen.getByRole("checkbox", { name: /기획으로 보낼 카드로 고르기/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "이 작품의 인물" }), { target: { value: "yuri" } });
    fireEvent.click(screen.getByRole("button", { name: "고른 카드로 인물 시트 미리 보기" }));
    expect(screen.getByText("선택한 카드 내용이 이미 시트에 있어요.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "인물 시트에 추가" })).toBeNull();
  });

  it("다른 탭에서 갱신한 시트를 덮지 않고 다시 미리 본 뒤 저장할 수 있다", () => {
    seed("A"); mountPreview();
    updateStudioProjectWorkspaceState(localStorage, "A", current => ({
      ...current, story: { ...current.story, narrative: upsertStoryCharacterProfile(current.story.narrative, { ...original, personality: "용감" }) },
    }));
    fireEvent.click(screen.getByRole("button", { name: "인물 시트에 추가" }));
    expect(screen.getByRole("alert").textContent).toMatch(/시트가 바뀌/);
    expect(profiles("A")[0]).toEqual({ ...original, personality: "용감" });
    fireEvent.click(screen.getByRole("button", { name: "고른 카드로 인물 시트 미리 보기" }));
    const block = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    fireEvent.click(screen.getByRole("button", { name: "인물 시트에 추가" }));
    expect(screen.getByRole("alert").textContent).toMatch(/저장하지 못했/);
    block.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "인물 시트에 추가" }));
    expect(profiles("A")[0]).toEqual({ ...original, personality: "용감", background: "기존 배경\n비가 오면 안경을 닦는다." });
  });
});
