// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioEpisodeStageChipSlot } from "./StudioEpisodeStageChipSlot";

/** 지연 로딩 청크 변환이 병렬 테스트 부하에서 느려질 수 있어 기본 1초보다 넉넉히 기다린다. */
const LAZY_LOAD_TIMEOUT_MS = 15_000;

const SLOT_ID = "studio-episode-stage-chrome-slot";

const fixtures = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  /** 제작 허브 모듈 평가 횟수 — 맥락이 없을 때 이 모듈들이 로드되지 않았다는 증거다. */
  hubModuleEvaluations: 0,
  getProductionProject: undefined as undefined | ((id: string) => Promise<{ aggregate: object }>),
  currentStage: true,
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ data: fixtures.session }),
}));

vi.mock("../public/production-projects", () => {
  fixtures.hubModuleEvaluations += 1;
  return {
    getProductionProject: (id: string) => {
      if (!fixtures.getProductionProject) throw new Error("getProductionProject fixture missing");
      return fixtures.getProductionProject(id);
    },
  };
});

vi.mock("../public/episode-stage", () => {
  fixtures.hubModuleEvaluations += 1;
  return {
    episodeStageForEpisode: () => ({
      selection: {},
      states: [
        { id: "plan", label: { ko: "기획", en: "Plan" }, status: "done" },
        {
          id: "art",
          label: { ko: "작화", en: "Art" },
          status: fixtures.currentStage ? "current" : "todo",
        },
      ],
    }),
  };
});

function renderSlot(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/studio/doc${search}`]}>
      <div id={SLOT_ID} data-testid="episode-stage-target" />
      <StudioEpisodeStageChipSlot />
    </MemoryRouter>,
  );
}

const CONTEXT_SEARCH = "?productionProjectId=proj-1&episodeId=ep-7";

describe("StudioEpisodeStageChipSlot 지연 로딩 경계", () => {
  beforeEach(() => {
    fixtures.session = null;
    fixtures.currentStage = true;
    fixtures.getProductionProject = vi.fn(() => Promise.resolve({ aggregate: {} }));
  });

  afterEach(() => {
    cleanup();
  });

  // 아래 두 테스트는 같은 파일 안에서 연결 단위가 한 번도 로드되기 전에 실행돼야 한다
  // (모듈 레지스트리는 파일 안에서 유지되므로 순서를 바꾸면 증거가 사라진다).
  it("회차 맥락이 없으면 아무것도 그리지 않고 제작 허브 모듈을 로드하지 않는다", async () => {
    fixtures.session = { user: { id: "user-1" } };
    renderSlot("");

    await waitFor(() => {
      expect(screen.getByTestId("episode-stage-target").childElementCount).toBe(0);
    });
    expect(fixtures.hubModuleEvaluations).toBe(0);
    expect(fixtures.getProductionProject).not.toHaveBeenCalled();
  });

  it("맥락은 있어도 로그인 전이면 아무것도 그리지 않고 제작 허브 모듈을 로드하지 않는다", async () => {
    fixtures.session = null;
    renderSlot(CONTEXT_SEARCH);

    await waitFor(() => {
      expect(screen.getByTestId("episode-stage-target").childElementCount).toBe(0);
    });
    expect(fixtures.hubModuleEvaluations).toBe(0);
    expect(fixtures.getProductionProject).not.toHaveBeenCalled();
  });

  it("맥락과 세션이 모두 있으면 연결 단위를 지연 로딩해 현재 단계 칩을 헤더 자리에 그린다", async () => {
    fixtures.session = { user: { id: "user-1" } };
    renderSlot(CONTEXT_SEARCH);

    const chip = await screen.findByText(/작화 단계|Art stage/u, undefined, { timeout: LAZY_LOAD_TIMEOUT_MS });
    expect(screen.getByTestId("episode-stage-target").contains(chip)).toBe(true);
    expect(fixtures.getProductionProject).toHaveBeenCalledTimes(1);
    expect(fixtures.getProductionProject).toHaveBeenCalledWith("proj-1");
    expect(fixtures.hubModuleEvaluations).toBeGreaterThan(0);
  });

  it("현재 단계가 없는 회차는 칩을 그리지 않는다", async () => {
    fixtures.session = { user: { id: "user-1" } };
    fixtures.currentStage = false;
    renderSlot(CONTEXT_SEARCH);

    await waitFor(
      () => {
        expect(fixtures.getProductionProject).toHaveBeenCalledTimes(1);
      },
      { timeout: LAZY_LOAD_TIMEOUT_MS },
    );
    await waitFor(() => {
      expect(screen.getByTestId("episode-stage-target").childElementCount).toBe(0);
    });
  });

  it("aggregate 읽기에 실패하면 오류 문구 없이 칩만 생략한다", async () => {
    fixtures.session = { user: { id: "user-1" } };
    fixtures.getProductionProject = vi.fn(() => Promise.reject(new Error("network")));
    renderSlot(CONTEXT_SEARCH);

    await waitFor(
      () => {
        expect(fixtures.getProductionProject).toHaveBeenCalledTimes(1);
      },
      { timeout: LAZY_LOAD_TIMEOUT_MS },
    );
    await waitFor(() => {
      expect(screen.getByTestId("episode-stage-target").childElementCount).toBe(0);
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
