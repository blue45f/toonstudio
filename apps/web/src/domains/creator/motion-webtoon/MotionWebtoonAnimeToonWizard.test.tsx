// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MotionWebtoonAnimeToonWizard } from "./MotionWebtoonAnimeToonWizard";
import type { MotionEpisode } from "./motion-webtoon-model";
import { saveMotionEpisode } from "./motion-webtoon-storage";

function makeSource(id: string, titleKo: string, withCuts = true): MotionEpisode {
  return {
    id,
    titleKo,
    titleEn: titleKo,
    characters: [{ id: "char-1", nameKo: "주인공", nameEn: "Hero", presetId: "narrator" }],
    cuts: withCuts
      ? [
          {
            id: "cut-1",
            imageUrl: "https://example.com/1.png",
            altKo: "컷 1",
            altEn: "Cut 1",
            direction: { cameraMove: "static", durationSeconds: 6, intensity: 0.5 },
            transitionIn: "cut",
            bgm: { sceneMood: "daily", crossfadeSeconds: 2 },
            dialogues: [
              { id: "dlg-1", text: "조심해! 위험해!", characterId: "char-1", startOffsetSeconds: 0 },
            ],
          },
        ]
      : [],
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("MotionWebtoonAnimeToonWizard", () => {
  it("저장된 회차가 없으면 빈 상태를 정직하게 안내한다", () => {
    render(<MotionWebtoonAnimeToonWizard onOpenDraft={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /애니툰으로 만들기/ }));
    expect(screen.getByText(/아직 저장된 회차가 없어요/)).toBeTruthy();
  });

  it("선택 → 미리보기 → 자동 생성 → 편집기로 열기까지 동선이 이어진다", () => {
    saveMotionEpisode(makeSource("ep-src", "달빛 기사"));
    const onOpenDraft = vi.fn();
    render(<MotionWebtoonAnimeToonWizard onOpenDraft={onOpenDraft} />);
    fireEvent.click(screen.getByRole("button", { name: /애니툰으로 만들기/ }));

    // 1단계: 작품 선택
    expect(screen.getByText("달빛 기사")).toBeTruthy();
    expect(screen.getByText(/컷 1개 · 대사 1개/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "이 회차로 변환" }));

    // 2단계: 컷 미리보기
    expect(screen.getByAltText("컷 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /애니툰 자동 생성/ }));

    // 3단계: 결과 — 제목 제안 + 자막 자동 생성 요약
    const titleInput = screen.getByLabelText("애니툰 제목") as HTMLInputElement;
    expect(titleInput.value).toBe("달빛 기사 애니툰");
    expect(screen.getByText(/자막 1개가 자동 생성됐습니다/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "편집기에서 다듬기" }));
    expect(onOpenDraft).toHaveBeenCalledTimes(1);
    const draft = onOpenDraft.mock.calls[0]?.[0] as MotionEpisode;
    expect(draft.id).not.toBe("ep-src");
    expect(draft.titleKo).toBe("달빛 기사 애니툰");
    // 초안이 스토리지에 저장돼 다음 선택 목록에도 나타난다
    expect(window.localStorage.getItem(`toonstudio:motion-webtoon:episode:${draft.id}`)).toBeTruthy();
  });

  it("제목을 고치면 그 제목으로 저장·열기 된다", () => {
    saveMotionEpisode(makeSource("ep-src", "원본 회차"));
    const onOpenDraft = vi.fn();
    render(<MotionWebtoonAnimeToonWizard onOpenDraft={onOpenDraft} />);
    fireEvent.click(screen.getByRole("button", { name: /애니툰으로 만들기/ }));
    fireEvent.click(screen.getByRole("button", { name: "이 회차로 변환" }));
    fireEvent.click(screen.getByRole("button", { name: /애니툰 자동 생성/ }));
    fireEvent.change(screen.getByLabelText("애니툰 제목"), { target: { value: "내 제목" } });
    fireEvent.click(screen.getByRole("button", { name: "편집기에서 다듬기" }));
    const draft = onOpenDraft.mock.calls[0]?.[0] as MotionEpisode;
    expect(draft.titleKo).toBe("내 제목");
  });

  it("컷 없는 회차는 변환에 실패하고 미리보기에 머문다", () => {
    saveMotionEpisode(makeSource("ep-empty", "빈 회차", false));
    const onOpenDraft = vi.fn();
    render(<MotionWebtoonAnimeToonWizard onOpenDraft={onOpenDraft} />);
    fireEvent.click(screen.getByRole("button", { name: /애니툰으로 만들기/ }));
    fireEvent.click(screen.getByRole("button", { name: "이 회차로 변환" }));
    fireEvent.click(screen.getByRole("button", { name: /애니툰 자동 생성/ }));
    expect(screen.getByRole("alert").textContent).toContain("컷이 없어 변환할 수 없습니다");
    expect(onOpenDraft).not.toHaveBeenCalled();
  });

  it("저장에 실패하면 편집기로 열지 않고 실패를 알린다", () => {
    saveMotionEpisode(makeSource("ep-src", "달빛 기사"));
    const onOpenDraft = vi.fn();
    render(
      <MotionWebtoonAnimeToonWizard onOpenDraft={onOpenDraft} saveDraft={() => false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /애니툰으로 만들기/ }));
    fireEvent.click(screen.getByRole("button", { name: "이 회차로 변환" }));
    fireEvent.click(screen.getByRole("button", { name: /애니툰 자동 생성/ }));
    fireEvent.click(screen.getByRole("button", { name: "편집기에서 다듬기" }));
    expect(onOpenDraft).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("저장하지 못했습니다");
  });
});
