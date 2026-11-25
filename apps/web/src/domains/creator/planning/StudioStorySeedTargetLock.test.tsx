// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTextAiStorySeedProvider, type StorySeedProvider } from "./studio-story-seed";
import {
  ensureStudioProjectPlanning,
  readStudioProjectPlanning,
  saveStudioEpisodePlan,
  studioPlanningStorageKey,
  writeStudioProjectPlanning,
} from "./studio-planning-store";
import { StudioProjectStoryPlanning } from "./StudioProjectStoryPlanning";
import { StudioStorySeedBuilder } from "./StudioStorySeedBuilder";

const textAi = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock("../studio-server-ai-client", () => ({ completeAutomaticFreeText: textAi.complete }));
vi.mock("@/platform/use-api-resource", () => ({
  useApiResource: () => ({ data: null, error: null, loading: false }),
}));

function pendingResponse<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error("응답 대기 상태를 만들지 못했습니다.");
  };
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

async function createLocalSeed() {
  fireEvent.click(screen.getByRole("button", { name: "판타지" }));
  fireEvent.click(screen.getByRole("button", { name: "씨앗 초안 만들기" }));
  await screen.findByRole("button", { name: "이 초안을 회차 기획에 넣기" });
}

function applySeed() {
  fireEvent.click(screen.getByRole("button", { name: "이 초안을 회차 기획에 넣기" }));
  const overwrite = screen.queryByRole("button", { name: "덮어쓰기" });
  if (overwrite) fireEvent.click(overwrite);
}

function saveInitialPlan(projectId: string, logline: string) {
  const plan = ensureStudioProjectPlanning(window.localStorage, projectId).plans[0];
  if (!plan) throw new Error("첫 회차가 없습니다.");
  saveStudioEpisodePlan(window.localStorage, projectId, { ...plan, logline });
  return plan.episodeId;
}

beforeEach(() => {
  window.localStorage.clear();
  textAi.complete.mockReset();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("스토리 씨앗 빌더 대상 회차 고정·원문 비교·부분 실행취소·요청 취소", () => {
  it("2화에서 AI 확장을 시작한 뒤 3화로 이동해도 2화에 고정 적용되고 원문 비교·부분 실행취소가 동작한다", async () => {
    const pending = pendingResponse<{ readonly ok: true; readonly content: string }>();
    const aiProvider: StorySeedProvider = createTextAiStorySeedProvider(() => pending.promise);

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

    pending.resolve({
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

  it("작품을 바꾸면 이전 작품의 늦은 응답이 새 작품에 남지 않는다", async () => {
    saveInitialPlan("seed-prev-project", "이전 작품 원문");
    saveInitialPlan("seed-next-project", "새 작품 원문");
    const pending = pendingResponse<{
      readonly ok: true;
      readonly data: { readonly content: string };
    }>();
    textAi.complete.mockReturnValue(pending.promise);
    const { rerender } = render(<StudioProjectStoryPlanning projectId="seed-prev-project" view="episodes" />);
    fireEvent.click(screen.getByRole("button", { name: "판타지" }));
    fireEvent.click(screen.getByTestId("story-seed-ai-expand-btn"));
    await waitFor(() => expect(textAi.complete).toHaveBeenCalledTimes(1));
    const signal: unknown = textAi.complete.mock.calls[0]?.[2];
    if (!(signal instanceof AbortSignal)) throw new Error("취소 신호가 전달되지 않았습니다.");

    rerender(<StudioProjectStoryPlanning projectId="seed-next-project" view="episodes" />);
    await act(async () => {
      pending.resolve({
        ok: true,
        data: { content: JSON.stringify({
          loglineCandidates: ["이전 작품 AI 제안 1", "이전 작품 AI 제안 2", "이전 작품 AI 제안 3"],
          goalDraft: "아무 초안도 새 작품에 붙지 않아야 한다.",
          synopsisDraft: "이전 작품에서 요청한 줄거리입니다.",
        }) },
      });
    });
    if (screen.queryByRole("button", { name: "이 초안을 회차 기획에 넣기" })) applySeed();

    expect(readStudioProjectPlanning(window.localStorage, "seed-next-project")?.plans[0]?.logline).toBe("새 작품 원문");
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole("button", { name: "이 초안을 회차 기획에 넣기" })).toBeNull();
    expect(screen.queryByTestId("story-seed-undo-btn")).toBeNull();
  });

  it("초안을 고정한 회차가 사라져도 다른 회차에 대신 저장하지 않는다", async () => {
    const projectId = "seed-deleted-episode";
    const firstEpisodeId = saveInitialPlan(projectId, "기존 1화 원문");
    const planning = readStudioProjectPlanning(window.localStorage, projectId);
    const first = planning?.plans[0];
    if (!planning || !first) throw new Error("첫 회차가 없습니다.");
    const secondEpisodeId = "removed-ep-2";
    saveStudioEpisodePlan(window.localStorage, projectId, {
      ...first, episodeId: secondEpisodeId, episodeNumber: 2, title: "2화 전용", logline: "기존 2화 원문",
    });
    render(<StudioProjectStoryPlanning projectId={projectId} view="episodes" />);
    fireEvent.click(screen.getAllByRole("button", { name: /2화/u })[0]!);
    await createLocalSeed();

    act(() => {
      const current = readStudioProjectPlanning(window.localStorage, projectId);
      if (!current) throw new Error("회차 기획을 읽지 못했습니다.");
      writeStudioProjectPlanning(window.localStorage, {
        ...current,
        season: { ...current.season, episodeOrder: [firstEpisodeId] },
        plans: current.plans.filter((plan) => plan.episodeId !== secondEpisodeId),
      }, window);
    });
    applySeed();

    expect(readStudioProjectPlanning(window.localStorage, projectId)?.plans.map(({ episodeId, logline }) => ({ episodeId, logline })))
      .toEqual([{ episodeId: firstEpisodeId, logline: "기존 1화 원문" }]);
    expect(screen.queryByTestId("story-seed-undo-btn")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("초안을 만든 회차");
  });

  it("씨앗 반영 뒤 편집한 제목과 로그라인은 되돌려도 유지한다", async () => {
    const projectId = "seed-undo-preserve-edits";
    saveInitialPlan(projectId, "직접 저장한 원문");
    const initial = readStudioProjectPlanning(window.localStorage, projectId)?.plans[0];
    if (!initial) throw new Error("회차 기획을 읽지 못했습니다.");
    render(<StudioProjectStoryPlanning projectId={projectId} view="episodes" />);
    await createLocalSeed();
    applySeed();
    const applied = readStudioProjectPlanning(window.localStorage, projectId)?.plans[0];
    if (!applied) throw new Error("씨앗을 저장하지 못했습니다.");
    expect(applied.synopsis).not.toBe(initial.synopsis);

    act(() => {
      saveStudioEpisodePlan(window.localStorage, projectId, {
        ...applied, title: "씨앗 반영 뒤 직접 고친 회차명", logline: "씨앗 반영 뒤 직접 고친 로그라인",
      }, window);
    });
    const edited = readStudioProjectPlanning(window.localStorage, projectId)?.plans[0];
    if (!edited) throw new Error("편집 내용을 저장하지 못했습니다.");
    fireEvent.click(screen.getByTestId("story-seed-undo-btn"));

    expect(readStudioProjectPlanning(window.localStorage, projectId)?.plans[0]).toMatchObject({
      title: edited.title,
      logline: edited.logline,
      revision: edited.revision + 1,
    });
    expect(readStudioProjectPlanning(window.localStorage, projectId)?.plans[0]?.synopsis).toBe(initial.synopsis);
  });

  it("씨앗 적용과 되돌리기 쓰기가 실패하면 기존 내용을 유지하고 다시 시도할 수 있다", async () => {
    const projectId = "seed-retry-storage";
    saveInitialPlan(projectId, "쓰기 전 원문");
    render(<StudioProjectStoryPlanning projectId={projectId} view="episodes" />);
    await createLocalSeed();

    const key = studioPlanningStorageKey(projectId);
    const rejectWrites = (run: () => void) => {
      const original = Storage.prototype.setItem;
      const mock = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
        this: Storage, storageKey: string, value: string,
      ) {
        if (this === window.localStorage && storageKey === key) {
          throw new DOMException("테스트 쓰기 거절", "QuotaExceededError");
        }
        original.call(this, storageKey, value);
      });
      try {
        run();
        expect(mock).toHaveBeenCalled();
      } finally {
        mock.mockRestore();
      }
    };

    rejectWrites(applySeed);
    expect(readStudioProjectPlanning(window.localStorage, projectId)?.plans[0]?.logline).toBe("쓰기 전 원문");
    expect(screen.queryByTestId("story-seed-undo-btn")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("저장하지 못했습니다");
    applySeed();
    const saved = window.localStorage.getItem(key);
    expect(saved).not.toContain("쓰기 전 원문");

    const undo = () => fireEvent.click(screen.getByTestId("story-seed-undo-btn"));
    rejectWrites(undo);
    expect(window.localStorage.getItem(key)).toBe(saved);
    expect(screen.getByRole("alert").textContent).toContain("저장하지 못했습니다");
    undo();
    expect(readStudioProjectPlanning(window.localStorage, projectId)?.plans[0]?.logline).toBe("쓰기 전 원문");
    expect(screen.queryByTestId("story-seed-undo-btn")).toBeNull();
  });


  it("초안이 준비된 뒤 같은 회차에 저장한 원문을 덮어쓰지 않는다", async () => {
    const projectId = "seed-stale-revision";
    ensureStudioProjectPlanning(window.localStorage, projectId);
    render(<StudioProjectStoryPlanning projectId={projectId} view="episodes" />);
    await createLocalSeed();

    act(() => {
      const latest = readStudioProjectPlanning(window.localStorage, projectId)?.plans[0];
      if (!latest) throw new Error("첫 회차가 없습니다.");
      saveStudioEpisodePlan(window.localStorage, projectId, { ...latest, logline: "생성 이후에 쓴 원문" }, window);
    });
    applySeed();

    expect(readStudioProjectPlanning(window.localStorage, projectId)?.plans[0]?.logline).toBe("생성 이후에 쓴 원문");
    expect(screen.queryByTestId("story-seed-undo-btn")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("초안을 만든 회차");
  });

  it("줄거리가 비어 있어도 다른 씨앗 적용 필드에 원문이 있으면 덮어쓰기 확인을 받는다", async () => {
    const projectId = "seed-opening-hook-confirmation";
    const plan = ensureStudioProjectPlanning(window.localStorage, projectId).plans[0];
    if (!plan) throw new Error("첫 회차가 없습니다.");
    saveStudioEpisodePlan(window.localStorage, projectId, { ...plan, openingHook: "직접 쓴 회차 도입부" });
    render(<StudioProjectStoryPlanning projectId={projectId} view="episodes" />);
    await createLocalSeed();

    fireEvent.click(screen.getByRole("button", { name: "이 초안을 회차 기획에 넣기" }));

    expect(readStudioProjectPlanning(window.localStorage, projectId)?.plans[0]?.openingHook).toBe("직접 쓴 회차 도입부");
    expect(screen.getByRole("button", { name: "덮어쓰기" })).toBeTruthy();
  });

});
