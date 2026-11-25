// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTextAiStorySeedProvider, type StorySeedProvider } from "./studio-story-seed";
import {
  ensureStudioProjectPlanning,
  readStudioProjectPlanning,
  saveStudioEpisodePlan,
} from "./studio-planning-store";
import { StudioProjectStoryPlanning } from "./StudioProjectStoryPlanning";
import { StudioStorySeedBuilder } from "./StudioStorySeedBuilder";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("스토리 씨앗 빌더 대상 회차 고정·원문 비교·부분 실행취소·요청 취소", () => {
  it("2화에서 AI 확장을 시작한 뒤 3화로 이동해도 2화에 고정 적용되고 원문 비교·부분 실행취소가 동작한다", async () => {
    let resolveAi: ((value: { readonly ok: true; readonly content: string }) => void) | null = null;
    const aiProvider: StorySeedProvider = createTextAiStorySeedProvider(
      () =>
        new Promise((resolve) => {
          resolveAi = resolve;
        }),
    );

    const appliedCalls: Array<{ readonly episodeId?: string; readonly logline: string }> = [];
    const undoCalls: string[] = [];

    const { rerender } = render(
      <StudioStorySeedBuilder
        targetEpisodeId="ep-2"
        targetEpisodeLabel="2화 · 빗속의 열쇠"
        targetHasContent={true}
        targetCurrentSnapshot={{
          logline: "기존 2화 로그라인: 서연이 7번 보관함을 연다.",
          synopsis: "기존 2화 줄거리: 비 오는 밤 보관소 복도에서 열쇠를 찾는다.",
        }}
        aiProvider={aiProvider}
        onApplySeed={(patch, _draft, lockedEpisodeId) => {
          appliedCalls.push({ episodeId: lockedEpisodeId, logline: patch.logline });
        }}
        onUndoAppliedSeed={(episodeId) => {
          undoCalls.push(episodeId);
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "스릴러" }));
    fireEvent.click(screen.getByTestId("story-seed-ai-expand-btn"));

    // 생성 진행 중 사용자가 3화로 이동한 상황을 시뮬레이션한다
    rerender(
      <StudioStorySeedBuilder
        targetEpisodeId="ep-3"
        targetEpisodeLabel="3화 · 사라진 필름"
        targetHasContent={true}
        targetCurrentSnapshot={{
          logline: "기존 3화 로그라인: 절대 덮어쓰면 안 되는 3화 내용",
        }}
        aiProvider={aiProvider}
        onApplySeed={(patch, _draft, lockedEpisodeId) => {
          appliedCalls.push({ episodeId: lockedEpisodeId, logline: patch.logline });
        }}
        onUndoAppliedSeed={(episodeId) => {
          undoCalls.push(episodeId);
        }}
      />,
    );

    expect(resolveAi).not.toBeNull();
    resolveAi!({
      ok: true,
      content: JSON.stringify({
        loglineCandidates: [
          "AI 제안 2화 로그라인: 열쇠를 꽂는 순간 잠겼던 기록이 깨어난다.",
          "AI 제안 2화 후보 2",
          "AI 제안 2화 후보 3",
        ],
        goalDraft: "보관함 안의 비밀 필름을 회수한다.",
        synopsisDraft: "서연이 빗속에서 7번 보관함을 열자 윤태오의 이름이 적힌 필름이 드러난다.",
      }),
    });

    await waitFor(() => {
      expect(screen.getByTestId("story-seed-target-lock-warning")).toBeTruthy();
    });

    // 대상 고정 안내와 기존 2화 원문 vs AI 제안 비교가 모두 표시된다
    expect(screen.getByTestId("story-seed-target-lock-warning").textContent).toContain("2화 · 빗속의 열쇠");
    const diffBox = screen.getByTestId("story-seed-original-vs-suggestion");
    expect(diffBox.textContent).toContain("기존 2화 로그라인: 서연이 7번 보관함을 연다.");
    expect(diffBox.textContent).toContain("AI 제안 2화 로그라인: 열쇠를 꽂는 순간 잠겼던 기록이 깨어난다.");

    // 덮어쓰기 확인 → 적용 시 3화가 아니라 고정된 2화(ep-2) ID로 적용된다
    fireEvent.click(screen.getByRole("button", { name: "이 초안을 회차 기획에 넣기" }));
    fireEvent.click(screen.getByRole("button", { name: "덮어쓰기" }));
    expect(appliedCalls).toEqual([
      {
        episodeId: "ep-2",
        logline: "AI 제안 2화 로그라인: 열쇠를 꽂는 순간 잠겼던 기록이 깨어난다.",
      },
    ]);

    // 방금 반영한 회차만 되돌리기 호출 시 ep-2만 복원한다
    fireEvent.click(screen.getByTestId("story-seed-undo-btn"));
    expect(undoCalls).toEqual(["ep-2"]);
  });

  it("AI 씨앗 확장 진행 중 취소 버튼을 누르면 AbortSignal이 중단되고 늦은 응답을 무시한다", async () => {
    let capturedSignal: AbortSignal | undefined;
    const aiProvider: StorySeedProvider = createTextAiStorySeedProvider(
      (_prompt, options) => {
        capturedSignal = options?.signal;
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      },
    );

    render(<StudioStorySeedBuilder aiProvider={aiProvider} onApplySeed={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "판타지" }));
    fireEvent.click(screen.getByTestId("story-seed-ai-expand-btn"));

    const cancelBtn = screen.getByTestId("story-seed-cancel-btn");
    fireEvent.click(cancelBtn);

    expect(capturedSignal?.aborted).toBe(true);
    expect(screen.queryByTestId("story-seed-cancel-btn")).toBeNull();
    expect(screen.getByText(/생성을 취소했어요/u)).toBeTruthy();
  });

  it("StudioProjectStoryPlanning에서 2화를 선택해 씨앗을 적용하면 1화를 덮어쓰지 않고 2화만 저장·복원한다", async () => {
    const projectId = "proj-seed-ep2";
    const initial = ensureStudioProjectPlanning(window.localStorage, projectId);
    const ep1 = initial.plans[0]!;
    saveStudioEpisodePlan(window.localStorage, projectId, {
      ...ep1,
      logline: "1화 원문 절대 보존",
      synopsis: "1화 시놉시스 보존",
    });
    const ep2 = initial.plans[1] ?? {
      ...ep1,
      episodeId: `${projectId}-ep-2`,
      episodeNumber: 2,
      title: "2화 · 빗속의 약속",
      revision: 0,
    };
    saveStudioEpisodePlan(window.localStorage, projectId, {
      ...ep2,
      logline: "2화 원래 로그라인",
      synopsis: "2화 원래 줄거리",
    });

    render(<StudioProjectStoryPlanning projectId={projectId} view="episodes" />);

    // 2화 탭/항목을 선택한다
    const ep2Buttons = screen.getAllByRole("button", { name: /2화/u });
    fireEvent.click(ep2Buttons[0]!);

    await waitFor(() => {
      expect(screen.getByTestId("story-seed-target-badge").textContent).toContain("2화");
    });

    fireEvent.click(screen.getByRole("button", { name: "판타지" }));
    fireEvent.click(screen.getByRole("button", { name: "씨앗 초안 만들기" }));
    await waitFor(() => {
      expect(screen.getByText("로그라인 후보 — 하나를 고르세요")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "이 초안을 회차 기획에 넣기" }));
    fireEvent.click(screen.getByRole("button", { name: "덮어쓰기" }));

    const afterApply = readStudioProjectPlanning(window.localStorage, projectId)!;
    expect(afterApply.plans[0]!.logline).toBe("1화 원문 절대 보존");
    expect(afterApply.plans[1]!.logline).not.toBe("2화 원래 로그라인");

    // 부분 실행취소로 2화만 원래 내용으로 되돌리고 1화는 유지된다
    fireEvent.click(screen.getByTestId("story-seed-undo-btn"));
    const afterUndo = readStudioProjectPlanning(window.localStorage, projectId)!;
    expect(afterUndo.plans[0]!.logline).toBe("1화 원문 절대 보존");
    expect(afterUndo.plans[1]!.logline).toBe("2화 원래 로그라인");
  });
});
