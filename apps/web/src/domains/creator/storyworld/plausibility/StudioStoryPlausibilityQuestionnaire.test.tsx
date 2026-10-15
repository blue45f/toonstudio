// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StoryworldProject } from "../studio-storyworld-causality";
import { StudioStoryPlausibilityQuestionnaire } from "./StudioStoryPlausibilityQuestionnaire";
import { DOJIN, HAEUN, makeStory } from "./studio-story-plausibility-golden-fixtures";

const PROJECT: StoryworldProject = makeStory("qn", "질문지 이야기", {
  characters: [HAEUN, DOJIN],
  facts: [
    { id: "culprit", label: "범인은 도진이다", subjectId: "world", key: "culprit", initialValue: true },
    { id: "door", label: "문이 열렸다", subjectId: "world", key: "door", initialValue: false },
  ],
  scenes: [
    { id: "s1", title: "의뢰", order: 10, participantIds: ["haeun"] },
    { id: "s2", title: "추궁", order: 20, participantIds: ["haeun", "dojin"] },
    { id: "s3", title: "결말", order: 30, participantIds: ["haeun"] },
  ],
});

interface HarnessProps {
  readonly initial?: StoryworldProject;
  readonly readOnly?: boolean;
  readonly onApply?: (project: StoryworldProject, label: string) => void;
  readonly onClose?: () => void;
  readonly initialSceneId?: string | null;
}

function Harness({ initial = PROJECT, readOnly = false, onApply, onClose, initialSceneId = null }: HarnessProps) {
  const [project, setProject] = useState(initial);
  return (
    <StudioStoryPlausibilityQuestionnaire
      initialQuestion={null}
      initialSceneId={initialSceneId}
      onApply={(next, label) => { onApply?.(next, label); setProject(next); }}
      onClose={onClose ?? (() => undefined)}
      project={project}
      readOnly={readOnly}
    />
  );
}

function isChecked(element: HTMLElement): boolean {
  return element instanceof HTMLInputElement && element.checked;
}

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("기대한 요소가 없습니다.");
  return value;
}

const tab = (name: RegExp) => screen.getByRole("tab", { name });
const selectedTab = () => screen.getAllByRole("tab").find((item) => item.getAttribute("aria-selected") === "true");
const sceneButtons = () => within(screen.getByRole("navigation", { name: "장면 목록" })).getAllByRole("button");

afterEach(() => cleanup());

describe("개연성 질문지", () => {
  it("진행률과 장면 목록, 여섯 질문 단계를 보여 주고 첫 장면에서 시작한다", () => {
    render(<Harness />);
    expect(screen.getByText(/완료한 장면 0\/3 \(0%\)/u)).toBeTruthy();
    expect(screen.getByRole("meter", { name: "질문지 진행률 0%" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "장면 10. 의뢰" })).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    expect(selectedTab()?.textContent).toContain("1. 장면 성격");
    expect(screen.getByRole("heading", { name: "이 장면은 어떤 장면인가요?" })).toBeTruthy();
    expect(within(screen.getByRole("navigation", { name: "장면 목록" })).getAllByRole("button")).toHaveLength(3);
  });

  it("장면 성격을 고르고 ‘저장하고 다음’을 누르면 문서에 기록하고 다음 질문으로 간다", () => {
    const onApply = vi.fn<(project: StoryworldProject, label: string) => void>();
    render(<Harness onApply={onApply} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "인물이 중요한 선택을 하는 장면" }));
    expect(tab(/1\. 장면 성격/u).textContent).toContain("저장 안 됨");
    fireEvent.click(screen.getByRole("button", { name: /저장하고 다음/u }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const next = onApply.mock.calls[0]?.[0];
    expect(next?.scenes.find((scene) => scene.id === "s1")?.plausibility).toEqual({ roles: ["decision"], answers: { roles: "answered" } });
    expect(selectedTab()?.textContent).toContain("2. 동기");
    expect(tab(/1\. 장면 성격/u).textContent).toContain("답함");
    expect(screen.getByText("‘장면 성격’ 답을 저장했어요.")).toBeTruthy();
  });

  it("동기는 이유를 하나 이상 고르기 전에는 저장할 수 없고, ‘모르겠어요’는 점검 불가로 남긴다", () => {
    const onApply = vi.fn<(project: StoryworldProject, label: string) => void>();
    render(<Harness onApply={onApply} />);
    fireEvent.click(tab(/2\. 동기/u));
    const save = screen.getByRole("button", { name: /저장하고 다음/u });
    expect(save.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/한 명 이상 이유를 고르거나/u)).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: /하은은 왜 움직이나요/u }), { target: { value: "goal" } });
    expect(save.hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "모르겠어요" }));
    const next = onApply.mock.calls[0]?.[0];
    expect(next?.scenes[0]?.plausibility?.answers?.motive).toBe("unknown");
    expect(selectedTab()?.textContent).toContain("3. 원인");
  });

  it("동기에서 ‘앞선 사건’을 고르면 어떤 앞 장면인지 묻고, 앞 장면을 원인으로도 이어 준다", () => {
    const onApply = vi.fn<(project: StoryworldProject, label: string) => void>();
    render(<Harness initialSceneId="s3" onApply={onApply} />);
    fireEvent.click(tab(/2\. 동기/u));
    fireEvent.change(screen.getByRole("combobox", { name: /하은은 왜 움직이나요/u }), { target: { value: "event" } });
    fireEvent.change(screen.getByRole("combobox", { name: "어떤 앞 장면 때문인가요?" }), { target: { value: "s2" } });
    fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
    const scene = onApply.mock.calls[0]?.[0].scenes.find((item) => item.id === "s3");
    expect(scene?.plausibility?.motives).toEqual([{ characterId: "haeun", basis: "event", causeSceneId: "s2" }]);
    expect(scene?.dependsOnSceneIds).toEqual(["s2"]);
    expect(selectedTab()?.textContent).toContain("2. 동기");
  });

  it("건너뛰기는 점검 불가로 표시하고 다음으로 가며, 장면 건너뛰기는 남은 질문을 모두 건너뛴다", () => {
    const onApply = vi.fn<(project: StoryworldProject, label: string) => void>();
    render(<Harness onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
    expect(onApply.mock.calls[0]?.[0].scenes[0]?.plausibility?.answers).toEqual({ roles: "skipped" });
    fireEvent.click(screen.getByRole("button", { name: "이 장면 건너뛰기" }));
    expect(screen.getByRole("heading", { name: "장면 20. 추궁" })).toBeTruthy();
    expect(screen.getByText(/완료한 장면 1\/3 \(33%\)/u)).toBeTruthy();
    expect(must(sceneButtons()[0]).textContent).toContain("6/6");
  });

  it("질문 단계에서 ←/→/Home/End로 옮기고 장면 목록에서 ↑/↓로 옮긴다", () => {
    render(<Harness />);
    const first = tab(/1\. 장면 성격/u);
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(selectedTab()?.textContent).toContain("2. 동기");
    fireEvent.keyDown(must(selectedTab()), { key: "End" });
    expect(selectedTab()?.textContent).toContain("6. 결과");
    fireEvent.keyDown(must(selectedTab()), { key: "ArrowRight" });
    expect(selectedTab()?.textContent).toContain("6. 결과");
    fireEvent.keyDown(must(selectedTab()), { key: "Home" });
    expect(selectedTab()?.textContent).toContain("1. 장면 성격");
    const [firstScene, secondScene, thirdScene] = sceneButtons();
    if (!firstScene || !secondScene || !thirdScene) throw new Error("장면이 부족합니다.");
    firstScene.focus();
    fireEvent.keyDown(firstScene, { key: "ArrowDown" });
    expect(document.activeElement).toBe(secondScene);
    fireEvent.keyDown(secondScene, { key: "End" });
    expect(document.activeElement).toBe(thirdScene);
    fireEvent.keyDown(thirdScene, { key: "ArrowUp" });
    expect(document.activeElement).toBe(secondScene);
  });

  it("Ctrl+Enter로 저장하고 다음으로 간다", () => {
    const onApply = vi.fn<(project: StoryworldProject, label: string) => void>();
    render(<Harness onApply={onApply} />);
    const box = screen.getByRole("checkbox", { name: "과거를 보여 주는 회상 장면" });
    fireEvent.click(box);
    box.focus();
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(selectedTab()?.textContent).toContain("2. 동기");
  });

  it("저장하지 않은 입력은 장면을 옮겼다 돌아와도 남아 있다(임시 보관)", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("checkbox", { name: "문제가 풀리는 장면" }));
    fireEvent.click(must(sceneButtons()[1]));
    expect(screen.getByRole("heading", { name: "장면 20. 추궁" })).toBeTruthy();
    expect(isChecked(screen.getByRole("checkbox", { name: "문제가 풀리는 장면" }))).toBe(false);
    fireEvent.click(must(sceneButtons()[0]));
    expect(isChecked(screen.getByRole("checkbox", { name: "문제가 풀리는 장면" }))).toBe(true);
    expect(tab(/1\. 장면 성격/u).textContent).toContain("저장 안 됨");
  });

  it("원인: 앞 장면과 이미 성립해 있어야 하는 일을 고르면 기존 필드에 기록한다", () => {
    const onApply = vi.fn<(project: StoryworldProject, label: string) => void>();
    render(<Harness initialSceneId="s3" onApply={onApply} />);
    fireEvent.click(tab(/3\. 원인/u));
    fireEvent.click(screen.getByRole("checkbox", { name: "20. 추궁" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "문이 열렸다" }));
    fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
    const scene = onApply.mock.calls[0]?.[0].scenes.find((item) => item.id === "s3");
    expect(scene?.dependsOnSceneIds).toEqual(["s2"]);
    expect(scene?.preconditions).toEqual([{ factId: "door", comparator: "equals", value: true }]);
  });

  it("정보: 줄을 더하고 알게 된 경로를 정하면 인물의 처음 지식에 기록한다", () => {
    const onApply = vi.fn<(project: StoryworldProject, label: string) => void>();
    render(<Harness initialSceneId="s2" onApply={onApply} />);
    fireEvent.click(tab(/4\. 정보/u));
    fireEvent.click(screen.getByRole("button", { name: "줄 추가" }));
    fireEvent.change(screen.getByRole("combobox", { name: "어떻게 알았나요" }), { target: { value: "initial" } });
    fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
    const next = onApply.mock.calls[0]?.[0];
    expect(next?.characters.find((character) => character.id === "haeun")?.initialFactIds).toEqual(["culprit"]);
    expect(next?.scenes.find((scene) => scene.id === "s2")?.knowledgeUses).toEqual([{ characterId: "haeun", factId: "culprit" }]);
    fireEvent.click(screen.getByRole("button", { name: "이 줄 지우기" }));
    expect(screen.queryByRole("combobox", { name: "어떻게 알았나요" })).toBeNull();
  });

  it("우연·단서: 고르지 않으면 저장할 수 없고, 단서 장면을 골라야 ‘단서 있음’을 저장할 수 있다", () => {
    const onApply = vi.fn<(project: StoryworldProject, label: string) => void>();
    render(<Harness initialSceneId="s3" onApply={onApply} />);
    fireEvent.click(tab(/5\. 우연·단서/u));
    const save = screen.getByRole("button", { name: "임시 저장" });
    expect(save.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "우연이지만 앞에 단서가 있어요" }));
    expect(save.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("단서가 있는 앞 장면을 하나 이상 골라 주세요.")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "10. 의뢰" }));
    expect(save.hasAttribute("disabled")).toBe(false);
    fireEvent.click(save);
    const next = onApply.mock.calls[0]?.[0];
    expect(next?.setupContracts).toEqual([{ id: "clue:s3", label: "‘결말’의 단서" }]);
    expect(next?.scenes.find((scene) => scene.id === "s1")?.setupIds).toEqual(["clue:s3"]);
  });

  it("결과: 새로 성립하는 일과 독자에게 알려지는 일을 기록한다", () => {
    const onApply = vi.fn<(project: StoryworldProject, label: string) => void>();
    render(<Harness initialSceneId="s2" onApply={onApply} />);
    fireEvent.click(tab(/6\. 결과/u));
    const established = screen.getByRole("group", { name: "이 장면 뒤에 새로 성립하는 일" });
    fireEvent.click(within(established).getByRole("checkbox", { name: "문이 열렸다" }));
    const revealed = screen.getByRole("group", { name: "이 장면에서 독자에게 새로 알려지는 일" });
    fireEvent.click(within(revealed).getByRole("checkbox", { name: "범인은 도진이다" }));
    fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
    const scene = onApply.mock.calls[0]?.[0].scenes.find((item) => item.id === "s2");
    expect(scene?.effects).toEqual([{ factId: "door", op: "set", value: true }]);
    expect(scene?.reveals).toEqual([{ factId: "culprit", audiences: ["reader"] }]);
  });

  it("‘해당 없음’은 점검할 수 있는 답으로 기록한다", () => {
    const onApply = vi.fn<(project: StoryworldProject, label: string) => void>();
    render(<Harness onApply={onApply} />);
    fireEvent.click(tab(/3\. 원인/u));
    fireEvent.click(screen.getByRole("button", { name: "해당 없음" }));
    expect(onApply.mock.calls[0]?.[0].scenes[0]?.plausibility?.answers?.cause).toBe("not-applicable");
  });

  it("‘다음 안 끝난 장면으로’가 첫 미완료 장면으로 이동한다", () => {
    render(<Harness initialSceneId="s3" />);
    fireEvent.click(screen.getByRole("button", { name: "다음 안 끝난 장면으로" }));
    expect(screen.getByRole("heading", { name: "장면 10. 의뢰" })).toBeTruthy();
  });

  it("예시 이야기에서는 답을 저장하는 모든 버튼이 꺼져 있다", () => {
    const onApply = vi.fn<(project: StoryworldProject, label: string) => void>();
    render(<Harness onApply={onApply} readOnly />);
    expect(screen.getByText(/예시 이야기에서는 답을 저장하지 않아요/u)).toBeTruthy();
    for (const name of [/저장하고 다음/u, "임시 저장", "해당 없음", "모르겠어요", "건너뛰기", "이 장면 건너뛰기"]) {
      expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
    }
    expect(onApply).not.toHaveBeenCalled();
  });

  it("리포트로 돌아가기와 장면이 없을 때의 안내", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /리포트로 돌아가기/u }));
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
    render(<Harness initial={{ ...PROJECT, scenes: [] }} onClose={onClose} />);
    expect(screen.getByRole("heading", { name: "질문할 장면이 아직 없어요" })).toBeTruthy();
  });
});
