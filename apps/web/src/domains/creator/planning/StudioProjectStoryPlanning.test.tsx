// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { updateStudioProjectStory } from "../studio-project-feature-adapters";
import { STUDIO_PROJECT_SECTION_VIEWS } from "../studio-project-views";
import { STUDIO_FORBIDDEN_DEFAULT_UI_TERMS } from "../studio-product-ia";
import {
  STUDIO_STORY_PLANNING_VIEWS,
  StudioProjectStoryPlanning,
  type StudioProjectStoryPlanningView,
} from "./StudioProjectStoryPlanning";
import {
  EMPTY_STORY_BIBLE_NARRATIVE,
  upsertStoryCharacterRelation,
} from "./studio-character-profile";
import { loadFactConcordanceSideData } from "./studio-fact-concordance";
import { readStudioForeshadowLedger } from "./studio-foreshadow-ledger";
import {
  ensureStudioProjectPlanning,
  readStudioProjectPlanning,
  saveStudioEpisodePlan,
} from "./studio-planning-store";
import { MAIN_PLOTLINE_ID, type PlotlineCard } from "./studio-plotline-timeline";
import {
  DEFAULT_CONCORDANCE_EPISODE_AUTHOR_ID,
  normalizeStudioStoryPlanningView,
  reconcilePlotlineCardsWithPlans,
} from "./studio-story-planning-views";
import {
  createWorldLoreExamples,
  emptyWorldLore,
  upsertLoreEntry,
  withLoreEntryDefaults,
} from "./studio-world-lore";
import {
  readStudioWorldLore,
  saveStudioWorldLoreEntries,
} from "./studio-world-lore-store";

vi.mock("@/platform/use-api-resource", () => ({
  useApiResource: () => ({ data: null, loading: false, error: null }),
}));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function seedRichProject(projectId: string) {
  const initial = ensureStudioProjectPlanning(
    localStorage,
    projectId,
    "2026-11-20T00:00:00.000Z",
  );
  const firstPlan = initial.plans[0]!;
  saveStudioEpisodePlan(localStorage, projectId, {
    ...firstPlan,
    title: "비밀의 시작",
    logline: "서연이 침수 도서관 앞에서 「유리 탑」의 단서를 발견한다.",
    synopsis: "서연은 침수 도서관 문턱에서 오래된 편지를 줍는다.",
    turningPoints: ["편지 발견", "수수께끼 해독"],
    characterRefs: ["char-seoyeon"],
  });
  saveStudioEpisodePlan(localStorage, projectId, {
    ...firstPlan,
    id: `${projectId}:episode-plan-2`,
    episodeId: `${projectId}:episode-2`,
    episodeNumber: 2,
    revision: 1,
    title: "어둠의 추적",
    logline: "추격전이 시작된다.",
    synopsis: "서연이 골목으로 달아난다.",
    turningPoints: ["추격 시작"],
    characterRefs: ["char-seoyeon"],
  });

  const narrative = upsertStoryCharacterRelation(EMPTY_STORY_BIBLE_NARRATIVE, {
    id: "rel-1",
    fromCharacterId: "char-seoyeon",
    toCharacterId: "char-dohyun",
    kind: "friend",
    label: "소꿉친구",
    note: "어린 시절 약속을 공유한다",
  });
  updateStudioProjectStory(localStorage, projectId, {
    bible: {
      projectId,
      characters: [
        {
          id: "char-seoyeon",
          name: "서연",
          aliases: ["연이"],
          defaultCostumeId: null,
          defaultAppearanceId: null,
        },
        {
          id: "char-dohyun",
          name: "도현",
          aliases: [],
          defaultCostumeId: null,
          defaultAppearanceId: null,
        },
      ],
      locations: [{ id: "loc-library", name: "침수 도서관" }],
      facts: [
        {
          id: "fact-seal",
          label: "은인장 반지",
          characterIds: ["char-seoyeon"],
          locationId: "loc-library",
        },
      ],
    },
    states: [],
    transitions: [],
    narrative,
  });

  let lore = emptyWorldLore(projectId);
  lore = upsertLoreEntry(
    lore,
    withLoreEntryDefaults({
      id: "lore-place-1",
      kind: "place",
      name: "침수 도서관",
      aliases: ["물밑 서고"],
      summary: "도심 지하에 잠긴 옛 서고",
      details: "자정마다 수위가 낮아진다",
      eraLabel: "",
      timelineOrder: null,
      relatedEntryIds: ["lore-faction-1"],
      characterIds: ["char-seoyeon"],
      origin: "authored",
      status: "confirmed",
    }),
  );
  lore = upsertLoreEntry(
    lore,
    withLoreEntryDefaults({
      id: "lore-faction-1",
      kind: "faction",
      name: "등불지기 길드",
      aliases: [],
      summary: "도서관의 기록을 지키는 수호자들",
      details: "",
      eraLabel: "",
      timelineOrder: null,
      relatedEntryIds: ["lore-place-1"],
      characterIds: ["char-seoyeon"],
      origin: "authored",
      status: "confirmed",
    }),
  );
  lore = upsertLoreEntry(
    lore,
    withLoreEntryDefaults({
      id: "lore-event-1",
      kind: "event",
      name: "대침수",
      aliases: [],
      summary: "구도심이 물에 잠긴 날",
      details: "",
      eraLabel: "12년 전",
      timelineOrder: 1,
      relatedEntryIds: ["lore-place-1"],
      characterIds: [],
      origin: "authored",
      status: "confirmed",
    }),
  );
  saveStudioWorldLoreEntries(localStorage, projectId, lore.entries);
}

function renderPlanning(
  projectId: string,
  view: StudioProjectStoryPlanningView,
  options?: {
    readonly onViewChange?: (next: StudioProjectStoryPlanningView) => void;
    readonly currentUserId?: string;
  },
) {
  return render(
    <MemoryRouter initialEntries={[`/studio/p/${projectId}/story?view=${view}`]}>
      <StudioProjectStoryPlanning
        projectId={projectId}
        view={view}
        onViewChange={options?.onViewChange}
        currentUserId={options?.currentUserId}
      />
    </MemoryRouter>,
  );
}

describe("StudioProjectStoryPlanning 7대 뷰 라우팅 및 상단 스위처", () => {
  it("studio-project-views.ts 정본의 7개 기획 뷰 ID와 정확히 일치하고 알 수 없는 값은 episodes로 복귀한다", () => {
    expect(STUDIO_STORY_PLANNING_VIEWS).toEqual([
      "episodes",
      "characters",
      "world",
      "timeline",
      "relations",
      "foreshadow",
      "concordance",
    ]);
    for (const viewId of STUDIO_STORY_PLANNING_VIEWS) {
      expect(STUDIO_PROJECT_SECTION_VIEWS.story).toContain(viewId);
    }
    expect(normalizeStudioStoryPlanningView("unknown-view")).toBe("episodes");
    expect(normalizeStudioStoryPlanningView(null)).toBe("episodes");
  });

  it("S-02 결함 복구: world와 timeline 진입 시 캐릭터 시트로 떨어지지 않고 각 전용 보드를 마운트한다", async () => {
    const projectId = "proj-s02";
    seedRichProject(projectId);

    const worldRender = renderPlanning(projectId, "world");
    expect(await screen.findByRole("region", { name: "세계관 설정" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "캐릭터 시트" })).toBeNull();
    worldRender.unmount();

    renderPlanning(projectId, "timeline");
    expect(await screen.findByRole("region", { name: "플롯라인 타임라인" })).toBeTruthy();
    expect(await screen.findByRole("region", { name: "연표" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "캐릭터 시트" })).toBeNull();
  });

  it("상단 Starlight OKLCH 스위처로 7개 뷰를 모두 전환·마운트하고 44px 터치 타깃·2px 인셋 라벤더 기준선·금지 용어 0건을 지킨다", async () => {
    const projectId = "proj-all-7";
    seedRichProject(projectId);
    const onViewChange = vi.fn();

    const { container } = renderPlanning(projectId, "episodes", { onViewChange });

    const switcher = container.querySelector<HTMLElement>("[data-story-planning-switcher='true']");
    expect(switcher).not.toBeNull();
    expect(switcher?.className).toContain("bg-panel");
    expect(switcher?.className).toContain("border-line");
    expect(switcher?.className).not.toMatch(/bg-white|bg-slate-|text-white|#/);

    const tablist = screen.getByRole("tablist", { name: "스토리 기획 보드 전환" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(7);

    // 모든 탭이 44px 터치 타깃(min-h-11), keep-all, 금지 용어 0건을 준수한다.
    for (const tab of tabs) {
      expect(tab.className).toContain("min-h-11");
      expect(tab.className).toContain("[word-break:keep-all]");
      const lower = (tab.textContent ?? "").toLocaleLowerCase();
      for (const forbidden of STUDIO_FORBIDDEN_DEFAULT_UI_TERMS) {
        expect(lower).not.toContain(forbidden.toLocaleLowerCase());
      }
    }

    // 1. episodes (초기 활성)
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(
      tabs[0]?.querySelector("[data-story-planning-active-rail='true']")?.className,
    ).toContain("bg-accent");
    expect(
      tabs[0]?.querySelector("[data-story-planning-active-rail='true']")?.className,
    ).toContain("h-[2px]");
    expect(screen.getByRole("combobox", { name: "콘티·작화 대상 원고" })).toBeTruthy();

    // 2. characters
    fireEvent.click(screen.getByRole("tab", { name: /캐릭터/ }));
    expect(onViewChange).toHaveBeenLastCalledWith("characters");
    expect(await screen.findByRole("region", { name: "캐릭터 시트" })).toBeTruthy();

    // 3. world
    fireEvent.click(screen.getByRole("tab", { name: /세계관/ }));
    expect(onViewChange).toHaveBeenLastCalledWith("world");
    expect(await screen.findByRole("region", { name: "세계관 설정" })).toBeTruthy();

    // 4. timeline (StudioPlotlineTimeline + StudioLoreTimeline)
    fireEvent.click(screen.getByRole("tab", { name: /연표/ }));
    expect(onViewChange).toHaveBeenLastCalledWith("timeline");
    expect(await screen.findByRole("region", { name: "플롯라인 타임라인" })).toBeTruthy();
    expect(await screen.findByRole("region", { name: "연표" })).toBeTruthy();

    // 5. relations (StudioLoreGraph + 캐릭터 관계 요약)
    fireEvent.click(screen.getByRole("tab", { name: /관계도/ }));
    expect(onViewChange).toHaveBeenLastCalledWith("relations");
    expect(await screen.findByRole("region", { name: "설정 관계도" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "캐릭터 관계 요약" })).toBeTruthy();

    // 6. foreshadow (StudioForeshadowLedgerPanel)
    fireEvent.click(screen.getByRole("tab", { name: /복선 장부/ }));
    expect(onViewChange).toHaveBeenLastCalledWith("foreshadow");
    expect(await screen.findByRole("region", { name: "복선 장부" })).toBeTruthy();

    // 7. concordance (StudioFactConcordancePanel)
    fireEvent.click(screen.getByRole("tab", { name: /사실 색인/ }));
    expect(onViewChange).toHaveBeenLastCalledWith("concordance");
    expect(await screen.findByRole("heading", { name: "사실 색인" })).toBeTruthy();

    // 키보드 ArrowRight → 순환하여 episodes로 복귀
    const concordanceTab = screen.getByRole("tab", { name: /사실 색인/ });
    fireEvent.keyDown(concordanceTab, { key: "ArrowRight" });
    expect(onViewChange).toHaveBeenLastCalledWith("episodes");
    expect(screen.getByRole("tab", { name: /에피소드/ }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("4대 신규 마운트 보드의 프로젝트 스토리 상태 양방향 연결", () => {
  it("플롯라인 타임라인에서 카드 이동·템플릿 적용이 studio-planning-store turningPoints에 반영되고 회차 선택으로 이동한다", async () => {
    const projectId = "proj-timeline";
    seedRichProject(projectId);
    renderPlanning(projectId, "timeline");

    await screen.findByRole("region", { name: "플롯라인 타임라인" });

    // "편지 발견" 카드를 1화에서 2화로 이동
    fireEvent.click(screen.getByRole("button", { name: "편지 발견 다음 화로 이동" }));

    await waitFor(() => {
      const saved = readStudioProjectPlanning(localStorage, projectId);
      expect(saved?.plans[0]?.turningPoints).toEqual(["수수께끼 해독"]);
      expect(saved?.plans[1]?.turningPoints).toEqual(["추격 시작", "편지 발견"]);
    });

    // 구조 템플릿(3막 구조 8비트) 채우기도 turningPoints에 반영된다.
    fireEvent.click(screen.getByRole("button", { name: "템플릿으로 비트 채우기" }));
    await waitFor(() => {
      const saved = readStudioProjectPlanning(localStorage, projectId);
      const allPoints = (saved?.plans ?? []).flatMap((plan) => plan.turningPoints);
      expect(allPoints).toContain("설정");
      expect(allPoints).toContain("절정");
    });

    // 2화 열 머리글 클릭 시 에피소드 뷰로 전환된다.
    fireEvent.click(screen.getByRole("button", { name: "2화 어둠의 추적" }));
    expect(screen.getByRole("tab", { name: /에피소드/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("관계도 뷰는 빈 세계관에서 예시 채우기 런처를 제공하고, 채우기 즉시 StudioLoreGraph를 마운트·영속한다", async () => {
    const projectId = "proj-relations-empty";
    ensureStudioProjectPlanning(localStorage, projectId);
    renderPlanning(projectId, "relations");

    expect(
      await screen.findByRole("region", { name: "설정 관계도 시작 안내" }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "예시 세계관으로 관계도 채우기" }),
    );

    expect(await screen.findByRole("region", { name: "설정 관계도" })).toBeTruthy();
    expect(
      readStudioWorldLore(localStorage, projectId)?.entries.length,
    ).toBe(createWorldLoreExamples(projectId).entries.length);
  });

  it("복선 장부에서 새 복선 등록과 상태 전이가 studio-foreshadow-ledger에 영속된다", async () => {
    const projectId = "proj-foreshadow";
    seedRichProject(projectId);
    renderPlanning(projectId, "foreshadow");

    const section = await screen.findByRole("region", { name: "복선 장부" });
    fireEvent.click(within(section).getByText(/첫 복선 등록하기/));

    const form = within(section).getByRole("form", { name: "복선 등록" });
    fireEvent.change(within(form).getByLabelText("복선 이름"), {
      target: { value: "서연이 숨긴 열쇠" },
    });
    fireEvent.change(within(form).getByLabelText("메모"), {
      target: { value: "1화 도서관 문틈에 숨겨 둔 황동 열쇠" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "장부에 등록" }));

    await waitFor(() => {
      const saved = readStudioForeshadowLedger(localStorage, projectId);
      expect(saved?.seeds).toHaveLength(1);
      expect(saved?.seeds[0]?.title).toBe("서연이 숨긴 열쇠");
      expect(saved?.seeds[0]?.status).toBe("planted");
    });

    const card = within(section).getByRole("article", { name: "서연이 숨긴 열쇠" });
    fireEvent.change(within(card).getByLabelText("상태"), {
      target: { value: "paidOff" },
    });

    await waitFor(() => {
      const saved = readStudioForeshadowLedger(localStorage, projectId);
      expect(saved?.seeds[0]?.status).toBe("paidOff");
    });
  });

  it("사실 색인이 기획 본문·바이블·세계관을 역추출 대조하고 확인·원고 수정 기록을 영속한다", async () => {
    const projectId = "proj-concordance";
    seedRichProject(projectId);
    renderPlanning(projectId, "concordance");

    await screen.findByRole("heading", { name: "사실 색인" });

    // 정해졌고 쓰임(서연·침수 도서관), 정해진 적 없음(유리 탑), 정해졌는데 잊음(도현)을 모두 표시한다.
    expect(screen.getByRole("heading", { name: "서연" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "유리 탑" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "도현" })).toBeTruthy();

    const seoyeonCard = screen.getByRole("heading", { name: "서연" }).closest("article")!;
    fireEvent.change(within(seoyeonCard).getByLabelText("확인 메모"), {
      target: { value: "1~2화 본명 표기 일치" },
    });
    fireEvent.click(within(seoyeonCard).getByRole("button", { name: "확인 기록" }));

    await waitFor(() => {
      const saved = loadFactConcordanceSideData(projectId);
      expect(saved.checks).toHaveLength(1);
      expect(saved.checks[0]?.entryKey).toBe("char-seoyeon");
      expect(saved.checks[0]?.note).toBe("1~2화 본명 표기 일치");
    });

    fireEvent.change(within(seoyeonCard).getByLabelText("고친 원고 내용"), {
      target: { value: "서연은 침수 도서관 앞에서 오래된 편지를 발견한다." },
    });
    fireEvent.change(within(seoyeonCard).getByLabelText("수정 이유"), {
      target: { value: "장소 묘사 명확화" },
    });
    fireEvent.click(within(seoyeonCard).getByRole("button", { name: "원고 수정 기록" }));

    await waitFor(() => {
      const saved = loadFactConcordanceSideData(projectId);
      expect(saved.fixes).toHaveLength(1);
      expect(saved.fixes[0]?.target).toBe("manuscript");
      expect(saved.fixes[0]?.reason).toBe("장소 묘사 명확화");
    });
  });

  it("사실 색인에서 회차 작성자 본인이 currentUserId로 전달되면 자기 확인을 정직하게 거부한다", async () => {
    const projectId = "proj-concordance-self-check";
    seedRichProject(projectId);
    renderPlanning(projectId, "concordance", {
      currentUserId: DEFAULT_CONCORDANCE_EPISODE_AUTHOR_ID,
    });

    await screen.findByRole("heading", { name: "사실 색인" });
    const seoyeonCard = screen.getByRole("heading", { name: "서연" }).closest("article")!;
    fireEvent.click(within(seoyeonCard).getByRole("button", { name: "확인 기록" }));

    expect(await within(seoyeonCard).findByText(/스스로 확인할 수 없어요/)).toBeTruthy();
    expect(loadFactConcordanceSideData(projectId).checks).toHaveLength(0);
  });

  it("reconcilePlotlineCardsWithPlans가 비메인 아크 카드를 보존하면서 외부 turningPoints 변경을 동기화한다", () => {
    const initial = ensureStudioProjectPlanning(localStorage, "proj-reconcile");
    const plan = { ...initial.plans[0]!, turningPoints: ["새 전환점"] };
    const existing: readonly PlotlineCard[] = [
      {
        id: "tpl:three-act:setup:plotline-main",
        plotlineId: MAIN_PLOTLINE_ID,
        episodeId: plan.episodeId,
        title: "이전 전환점",
        summary: "안내",
        characterIds: [],
        locationId: null,
        order: 0,
        templateBeatKey: "setup",
      },
      {
        id: "arc-card-1",
        plotlineId: "plotline-char:c1",
        episodeId: plan.episodeId,
        title: "주인공 결심",
        summary: "아크 메모",
        characterIds: ["c1"],
        locationId: null,
        order: 0,
        templateBeatKey: null,
      },
    ];
    const next = reconcilePlotlineCardsWithPlans(existing, [plan]);
    expect(next.filter((card) => card.plotlineId === MAIN_PLOTLINE_ID).map((c) => c.title)).toEqual([
      "새 전환점",
    ]);
    expect(next.find((card) => card.id === "arc-card-1")?.title).toBe("주인공 결심");
  });

  it("episodes 탭 하단 점진 노출을 열면 Fresh Ideas 워크벤치가 지연 마운트되고 스토리 컷 시드 결과를 상태 배너로 피드백한다", async () => {
    const projectId = "proj-fresh-ideas-lazy";
    seedRichProject(projectId);
    renderPlanning(projectId, "episodes");

    const disclosure = screen.getByTestId(
      "story-planning-fresh-ideas-disclosure",
    ) as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-fresh-ideas-v2-workbench")).toBeNull();

    const summary = disclosure.querySelector("summary");
    expect(summary).not.toBeNull();
    expect(summary?.className).toContain("min-h-11");
    fireEvent.click(summary!);

    const workbench = await screen.findByTestId("studio-fresh-ideas-v2-workbench");
    expect(workbench).toBeTruthy();

    fireEvent.click(within(workbench).getByTestId("fresh-ideas-mode-mode-c-ecosystem"));
    fireEvent.click(within(workbench).getByTestId("fresh-ideas-export-story-seed-btn"));

    const banner = await screen.findByTestId("story-planning-fresh-ideas-seed-banner");
    expect(banner.textContent).toContain("스토리 컷 시드");
    expect(banner.textContent).toContain("회차 목표 초안");
  });
});
