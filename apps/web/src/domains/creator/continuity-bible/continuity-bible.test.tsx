// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioCharacterSheetPanel } from "../planning/StudioCharacterSheetPanel";
import type { StudioStoryBibleNarrative } from "../planning/studio-character-profile";
import type { StudioStoryBible } from "../studio-story-bible";
import {
  addCharacterOutfit,
  addCharacterProp,
  addCharacterScar,
  createStarterContinuityBible,
  evaluateSeriesContinuity,
  formatContinuityChecksheetMarkdown,
  loadContinuityBible,
  saveContinuityBible,
  syncContinuityBibleCharacters,
  toggleContinuityCheckItem,
} from "./continuity-bible-model";
import { StudioContinuityBiblePanel } from "./StudioContinuityBiblePanel";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SAMPLE_BIBLE: StudioStoryBible = {
  projectId: "proj-cb-1",
  characters: [
    {
      id: "char-hajin",
      name: "서하진",
      aliases: ["하진"],
      defaultCostumeId: "동복 교복(네이비 블레이저 + 와인 넥타이)",
      defaultAppearanceId: null,
    },
    {
      id: "char-seoa",
      name: "윤서아",
      aliases: ["서아"],
      defaultCostumeId: "차콜 롱코트 + 검은 터틀넥",
      defaultAppearanceId: null,
    },
  ],
  locations: [],
  facts: [],
};

const EMPTY_NARRATIVE: StudioStoryBibleNarrative = {
  profiles: [],
  relations: [],
};

describe("continuity-bible-model — 장기 연재 작화 일관성 경고 및 체크시트 모델", () => {
  it("13화에서 12화 왼뺨 흉터 누락 체크(error) 경고를 감지하고 체크 시 해소한다", () => {
    const bible = createStarterContinuityBible("proj-cb-1", SAMPLE_BIBLE.characters);
    expect(bible.currentEpisodeNumber).toBe(13);

    const summary = evaluateSeriesContinuity(bible);
    const scarWarning = summary.allWarnings.find((w) => w.headlineKo.includes("12화 왼뺨 흉터 누락 체크"));
    expect(scarWarning).toBeDefined();
    expect(scarWarning?.severity).toBe("error");

    // 흉터 항목을 체크하면 해당 누락 경고가 사라지고 일치율이 올라간다.
    const checked = toggleContinuityCheckItem(bible, "char-hajin", scarWarning!.itemId);
    const nextSummary = evaluateSeriesContinuity(checked);
    expect(
      nextSummary.allWarnings.find((w) => w.headlineKo.includes("12화 왼뺨 흉터 누락 체크")),
    ).toBeUndefined();
    expect(nextSummary.overallScore).toBeGreaterThan(summary.overallScore);
  });

  it("화수별 복장 전환(19화 동복 → 20화 하복) 및 임시 상처 회복(17화 손목 붕대 종료)을 정확히 계산한다", () => {
    const base = createStarterContinuityBible("proj-cb-1", SAMPLE_BIBLE.characters);

    // 17화에서는 윤서아의 9~16화 임시 손목 붕대가 더 이상 경고로 뜨지 않는다.
    const ep17Summary = evaluateSeriesContinuity({ ...base, currentEpisodeNumber: 17 });
    const seoa17 = ep17Summary.characterEvaluations.find((ev) => ev.characterId === "char-seoa");
    expect(seoa17?.activeScars).toHaveLength(0);

    // 20화에서는 서하진의 복장이 동복 → 하복으로 바뀌므로 복장 전환 경고가 발생한다.
    const ep20Summary = evaluateSeriesContinuity({ ...base, currentEpisodeNumber: 20 });
    const outfitChangeWarn = ep20Summary.allWarnings.find((w) =>
      w.headlineKo.includes("20화 복장 전환 확인"),
    );
    expect(outfitChangeWarn).toBeDefined();
    expect(outfitChangeWarn?.severity).toBe("warn");
  });

  it("상처·소품·복장 추가, 신규 캐릭터 동기화, 마크다운 출력 및 localStorage 저장이 동작한다", () => {
    let state = createStarterContinuityBible("proj-cb-2", SAMPLE_BIBLE.characters);
    state = addCharacterScar(state, "char-hajin", {
      locationKo: "오른쪽 눈썹 흉터",
      sinceEpisode: 13,
      severity: "permanent",
      note: "13화 결투 추가 상처",
    });
    state = addCharacterProp(state, "char-hajin", {
      label: "검은 가죽 팔찌",
      sinceEpisode: 13,
      handPreference: "right",
      carriedByDefault: true,
    });
    state = addCharacterOutfit(state, "char-hajin", {
      label: "비 오는 날 노란 우비",
      activeFromEpisode: 13,
      isDefault: false,
      details: "13화 빗속 추격전 전용",
    });

    const synced = syncContinuityBibleCharacters(state, [
      ...SAMPLE_BIBLE.characters,
      {
        id: "char-third",
        name: "강도윤",
        aliases: [],
        defaultCostumeId: "검은 후드집업",
        defaultAppearanceId: null,
      },
    ]);
    expect(synced.characters).toHaveLength(3);

    const md = formatContinuityChecksheetMarkdown(evaluateSeriesContinuity(synced));
    expect(md).toContain("13화 작화 일관성 체크시트");
    expect(md).toContain("오른쪽 눈썹 흉터");
    expect(md).toContain("검은 가죽 팔찌");

    expect(saveContinuityBible(window.localStorage, synced)).toBe(true);
    const loaded = loadContinuityBible(window.localStorage, "proj-cb-2");
    expect(loaded?.characters).toHaveLength(3);
  });
});

describe("StudioContinuityBiblePanel 및 StudioCharacterSheetPanel 지연 연결", () => {
  it("StudioCharacterSheetPanel에서 지연 마운트되어 미니 참조 카드·경고 확인·상처 추가가 동작한다", async () => {
    render(
      <StudioCharacterSheetPanel
        bible={SAMPLE_BIBLE}
        narrative={EMPTY_NARRATIVE}
        onSaveProfile={vi.fn()}
        onSaveRelation={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("continuity-bible-panel")).toBeNull();
    fireEvent.click(screen.getByTestId("character-sheet-continuity-bible-toggle"));

    const panel = await screen.findByTestId("continuity-bible-panel");
    expect(within(panel).getByTestId("continuity-current-episode").textContent).toContain("13화");
    expect(within(panel).getByTestId("continuity-warnings-strip").textContent).toContain(
      "12화 왼뺨 흉터 누락 체크",
    );
    expect(within(panel).getByTestId("continuity-mini-card-char-hajin")).toBeTruthy();

    // 새 상처 추가 시 경고 스트립과 체크리스트에 즉시 반영
    fireEvent.change(within(panel).getByTestId("continuity-add-scar-location"), {
      target: { value: "목덜미 문양" },
    });
    fireEvent.click(within(panel).getByTestId("continuity-add-scar-submit"));
    expect(within(panel).getByTestId("continuity-warnings-strip").textContent).toContain(
      "13화 목덜미 문양 누락 체크",
    );

    // 화수 이동(+1화 -> 14화)
    fireEvent.click(within(panel).getByTestId("continuity-next-episode-btn"));
    expect(within(panel).getByTestId("continuity-current-episode").textContent).toContain("14화");
  });

  it("단독 렌더 시 체크시트 복사 버튼이 44px 이상 터치 타겟을 유지한다", async () => {
    render(<StudioContinuityBiblePanel projectId="proj-cb-solo" />);
    const copyBtn = screen.getByTestId("continuity-copy-checksheet-btn");
    expect(copyBtn.className).toContain("min-h-11");
    fireEvent.click(copyBtn);
    const status = await screen.findByTestId("continuity-bible-status");
    expect(status.textContent).toContain("체크시트");
  });
});
