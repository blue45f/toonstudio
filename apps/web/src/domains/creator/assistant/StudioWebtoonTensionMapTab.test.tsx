// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioAiStoryboardDirector } from "../ai/studio-ai-storyboard-director";
import { EXTRA_POSE_PRESETS, NATURAL_IDLE_POSES } from "../studio-pose-presets";

import { StudioWebtoonTensionMapTab } from "./StudioWebtoonTensionMapTab";
import { useTensionMapDraft } from "./use-tension-map-draft";
import { poseCandidatesFromPresets } from "./webtoon-cut-pose-suggestion";
import { TENSION_MAP_CONFIG } from "./webtoon-tension-map";
import { TENSION_MAP_SAMPLE_SCRIPT } from "./webtoon-tension-map-source";

import type { PageState } from "../studio-page-state";
import type { StudioWebtoonTensionMapTabProps } from "./StudioWebtoonTensionMapTab";
import type { StudioWebtoonAssistantPanel } from "./studio-webtoon-assistant-document";
import type { CutPoseCandidate } from "./webtoon-cut-pose-suggestion";

const CATALOG = poseCandidatesFromPresets(NATURAL_IDLE_POSES, EXTRA_POSE_PRESETS);
/** 렌더마다 새로 만들지 않는 안정된 로더 — 훅의 효과 의존성이다. */
const loadCatalog = async (): Promise<readonly CutPoseCandidate[]> => CATALOG;

const PANELS: readonly StudioWebtoonAssistantPanel[] = [
  { id: "f1", topY: 0, bottomY: 700, heightPx: 700, dialogueCount: 1 },
  { id: "f2", topY: 1100, bottomY: 1500, heightPx: 400, dialogueCount: 0 },
  { id: "f3", topY: 1700, bottomY: 2300, heightPx: 600, dialogueCount: 2 },
];

function page(id: string, extra: Partial<PageState> = {}): PageState {
  return { id, elements: [], bg: "paper", bgGrad: null, canvasH: 1200, ...extra };
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderTab(props: Partial<StudioWebtoonTensionMapTabProps> = {}) {
  const utils = render(<StudioWebtoonTensionMapTab panels={[]} loadPoseCatalog={loadCatalog} {...props} />);
  // 마운트 직후의 비동기 갱신을 마무리한다(포즈 카탈로그는 곡선이 그려질 때 처음 요청된다 — insertSampleScript 참고)
  await act(async () => {});
  return utils;
}

function chartPoints(): HTMLButtonElement[] {
  return within(screen.getByTestId("tension-curve"))
    .getAllByRole("button")
    .filter((button): button is HTMLButtonElement => button instanceof HTMLButtonElement);
}

function typeScript(value: string) {
  fireEvent.change(screen.getByLabelText(/콘티 대본 \(한 줄이 한 컷\)/), { target: { value } });
}

/** 예시 대본을 넣는다. 곡선이 그려지면 추천 패널이 마운트되며 포즈 카탈로그를 처음 요청하므로 그 비동기 로드까지 기다린다. */
async function insertSampleScript() {
  fireEvent.click(screen.getAllByRole("button", { name: "예시 대본 넣기" })[0]);
  await act(async () => {});
}

describe("StudioWebtoonTensionMapTab — source and honesty notices", () => {
  it("opens on the script source when the manuscript has no panels, and on the manuscript when it has", async () => {
    await renderTab();
    expect(screen.getByRole("button", { name: "콘티 대본" }).getAttribute("aria-pressed")).toBe("true");
    cleanup();
    await renderTab({ panels: PANELS });
    expect(screen.getByRole("button", { name: "현재 원고" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("labels the whole feature as a heuristic estimate, on screen, before any number is shown", async () => {
    await renderTab();
    expect(screen.getByText("휴리스틱 추정")).toBeTruthy();
    expect(
      screen.getByText(/계산식과 임계값은 이 저장소가 정한 휴리스틱이며 공식 가이드나 독자 실험으로 검증한 값이 아니에요/),
    ).toBeTruthy();
    expect(screen.getByText(/참고용으로만 쓰세요/)).toBeTruthy();
  });

  it("discloses the script's assumed heights and gaps with the real config numbers", async () => {
    await renderTab();
    const { referencePanelHeightPx, assumedGutterPx } = TENSION_MAP_CONFIG.plan;
    expect(
      screen.getByText(
        `대본에는 실제 높이·간격이 없어 컷 높이 비율 × ${referencePanelHeightPx}px, 컷 사이 여백 ${assumedGutterPx}px로 가정해 체류 시간을 계산해요(휴리스틱).`,
      ),
    ).toBeTruthy();
    expect(screen.getByText("대본은 이 기기 안에서만 분석하고 어디에도 보내지 않아요.")).toBeTruthy();
  });

  it("renders English when the language is English", async () => {
    useI18n.getState().setLang("en");
    await renderTab();
    expect(screen.getByText("Heuristic estimate")).toBeTruthy();
    expect(screen.getByText("Tension map — emotion & event curve")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Storyboard script" })).toBeTruthy();
  });
});

describe("StudioWebtoonTensionMapTab — script source states", () => {
  it("teaches the empty state and offers a sample only on explicit request", async () => {
    await renderTab();
    expect(screen.getByText("대본을 입력하면 곡선이 그려져요")).toBeTruthy();
    expect(screen.queryByTestId("tension-curve")).toBeNull();
    expect((screen.getByLabelText(/콘티 대본/) as HTMLTextAreaElement).value).toBe("");
    // 예시는 사용자가 누르기 전에는 입력란에 들어가지 않는다
    expect(screen.getAllByRole("button", { name: "예시 대본 넣기" }).length).toBeGreaterThan(0);
  });

  it("fills the sample on click, draws ten cuts and hides the sample button so typed text is never overwritten", async () => {
    await renderTab();
    fireEvent.click(screen.getAllByRole("button", { name: "예시 대본 넣기" })[0]);
    expect((screen.getByLabelText(/콘티 대본/) as HTMLTextAreaElement).value).toBe(TENSION_MAP_SAMPLE_SCRIPT);
    expect(chartPoints()).toHaveLength(10);
    expect(screen.queryByRole("button", { name: "예시 대본 넣기" })).toBeNull();
  });

  it("redraws as the script is edited and returns to the empty state when it is cleared", async () => {
    await renderTab();
    typeScript("조용한 교실.\n쾅! 문이 열린다.\n눈빛이 마주친다.");
    expect(chartPoints()).toHaveLength(3);
    typeScript("조용한 교실.");
    expect(chartPoints()).toHaveLength(1);
    typeScript("   ");
    expect(screen.queryByTestId("tension-curve")).toBeNull();
    expect(screen.getByText("대본을 입력하면 곡선이 그려져요")).toBeTruthy();
  });

  it("states the analysis cap when a script has more cuts than the limit", async () => {
    await renderTab();
    typeScript(Array.from({ length: 230 }, (_, index) => `장면 ${index + 1}`).join("\n"));
    expect(chartPoints()).toHaveLength(TENSION_MAP_CONFIG.limits.maxCuts);
    expect(
      screen.getByText(`컷이 ${TENSION_MAP_CONFIG.limits.maxCuts}개를 넘어 앞의 ${TENSION_MAP_CONFIG.limits.maxCuts}컷만 분석했어요.`),
    ).toBeTruthy();
  });

  it("shows a real error state instead of a blank screen when the analysis throws, and recovers on edit", async () => {
    const direct = vi.spyOn(StudioAiStoryboardDirector.prototype, "direct").mockImplementation(() => {
      throw new Error("boom");
    });
    await renderTab();
    typeScript("무엇이든");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("곡선을 계산하지 못했어요");
    expect(alert.textContent).toContain("대본이나 원고를 고치면 다시 계산해요");
    expect(screen.queryByTestId("tension-curve")).toBeNull();

    direct.mockRestore();
    typeScript("무엇이든 다시");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(chartPoints()).toHaveLength(1);
  });
});

describe("StudioWebtoonTensionMapTab — manuscript source states", () => {
  it("says so and offers the script instead when the manuscript has no panels", async () => {
    await renderTab({ panels: [] });
    fireEvent.click(screen.getByRole("button", { name: "현재 원고" }));
    expect(screen.getByText("현재 원고에서 컷(프레임)을 찾지 못했어요")).toBeTruthy();
    expect(screen.getByText("현재 원고에서 컷을 찾지 못함")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "콘티 대본으로 전환" }));
    expect(screen.getByRole("button", { name: "콘티 대본" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("analyses real panels by dwell time only and refuses to claim a climax", async () => {
    await renderTab({ panels: PANELS });
    expect(screen.getByText("실제 원고 컷 3개 분석")).toBeTruthy();
    expect(chartPoints()).toHaveLength(3);
    expect(screen.getByTestId("tension-summary").textContent).toContain("3컷");
    expect(screen.getByTestId("tension-summary").textContent).not.toContain("절정 후보:");
    // 같은 고지가 헤더 한 줄과 "계산 방법과 한계" 목록에 모두 있다
    expect(screen.getAllByText(/절정 후보는 표시하지 않아요/).length).toBeGreaterThanOrEqual(1);
  });

  it("asks for an emotion on a manuscript panel instead of suggesting from invented data", async () => {
    await renderTab({ panels: PANELS });
    expect(screen.getByTestId("cut-pose-need-emotion")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("감정"), { target: { value: "shock" } });
    expect(screen.getByTestId("cut-pose-suggestion-list")).toBeTruthy();
  });

  it("falls back to an empty state when no panel has anything to score", async () => {
    await renderTab({ panels: [{ id: "z", topY: 10, bottomY: 10, heightPx: 0, dialogueCount: 0 }] });
    expect(screen.getByText("계산할 근거가 있는 컷이 없어요")).toBeTruthy();
  });

  it("keeps a typed script when the artist switches sources and back", async () => {
    await renderTab({ panels: PANELS });
    fireEvent.click(screen.getByRole("button", { name: "콘티 대본" }));
    typeScript("초안 한 줄");
    fireEvent.click(screen.getByRole("button", { name: "현재 원고" }));
    fireEvent.click(screen.getByRole("button", { name: "콘티 대본" }));
    expect((screen.getByLabelText(/콘티 대본/) as HTMLTextAreaElement).value).toBe("초안 한 줄");
  });
});

describe("StudioWebtoonTensionMapTab — curve, selection and text alternatives", () => {
  async function renderSample() {
    const utils = await renderTab();
    fireEvent.click(screen.getAllByRole("button", { name: "예시 대본 넣기" })[0]);
    return utils;
  }

  it("selects the highest-tension cut by default and summarises the curve in text", async () => {
    await renderSample();
    const pressed = chartPoints().filter((point) => point.getAttribute("aria-pressed") === "true");
    expect(pressed.map((point) => point.getAttribute("data-tension-point"))).toEqual(["4"]);
    const summary = screen.getByTestId("tension-summary").textContent ?? "";
    expect(summary).toContain("10컷");
    expect(summary).toContain("최고 0.87(컷 5)");
    expect(summary).toContain("절정 후보: 컷 5, 7, 9");
    expect(summary).toContain("급함 후보: 컷 4–5, 8–9");
    expect(summary).toContain("늘어짐 후보: 컷 1–4");
    expect(screen.getByRole("group", { name: "컷별 긴장도 곡선" }).getAttribute("aria-describedby")).toBe(
      screen.getByTestId("tension-summary").id,
    );
  });

  it("shows the arithmetic behind the selected cut and follows a new selection", async () => {
    await renderSample();
    const detail = screen.getByTestId("tension-cut-detail");
    expect(detail.textContent).toContain("컷 5");
    expect(detail.textContent).toContain("0.87");
    expect(detail.textContent).toContain("충격");
    expect(detail.textContent).toContain("점수 0.85 × 비중 0.5");
    expect(detail.textContent).toContain("절정 후보");

    fireEvent.click(chartPoints()[6]);
    const next = screen.getByTestId("tension-cut-detail");
    expect(next.textContent).toContain("컷 7");
    expect(next.textContent).toContain("분노");
    expect(screen.getByRole("heading", { name: /컷 7의 추천 포즈/ })).toBeTruthy();
  });

  it("jumps to the first cut of a candidate segment from the segment list", async () => {
    await renderSample();
    fireEvent.click(screen.getByRole("button", { name: /늘어짐 후보.*컷 1–4/ }));
    const pressed = chartPoints().filter((point) => point.getAttribute("aria-pressed") === "true");
    expect(pressed.map((point) => point.getAttribute("data-tension-point"))).toEqual(["0"]);
    expect(screen.getByTestId("tension-cut-detail").textContent).toContain("늘어짐 후보");
  });

  /** 접이식을 사용자가 여는 실제 경로(summary 를 누름)로 연다 — `details.open = true` 는 이 경로를 건너뛴다. */
  function openDisclosure(testId: string): HTMLDetailsElement {
    const details = screen.getByTestId(testId);
    if (!(details instanceof HTMLDetailsElement)) throw new Error(`details 가 아니에요: ${testId}`);
    const summary = details.querySelector<HTMLElement>(":scope > summary");
    if (!summary) throw new Error(`summary 를 찾을 수 없어요: ${testId}`);
    expect(details.open).toBe(false);
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    return details;
  }

  it("offers the same numbers as a real table with a caption and row/column headers", async () => {
    await renderSample();
    expect(screen.getByTestId("tension-table-details").tagName).toBe("DETAILS");
    const details = openDisclosure("tension-table-details");
    expect(within(details).getByText("표로 보기 (곡선의 텍스트 대안)")).toBeTruthy();
    const table = within(details).getByRole("table", { name: /컷별 긴장도와 계산 근거/ });
    expect(within(table).getAllByRole("row")).toHaveLength(1 + 10);
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "컷", "내용", "감정", "샷 크기", "체류(초)", "긴장도", "후보",
    ]);
    const selectedRow = table.querySelector("tr[data-selected='true']");
    expect(within(selectedRow as HTMLElement).getByText("0.87")).toBeTruthy();
    expect(within(table).getAllByRole("rowheader")).toHaveLength(10);
  });

  it("lays out the method notes from the live config, marking only the CANVAS band as sourced", async () => {
    await renderSample();
    expect(within(screen.getByTestId("tension-method-notes")).getByText("계산 방법과 한계 (모두 휴리스틱)")).toBeTruthy();
    const notes = openDisclosure("tension-method-notes");
    expect(notes.textContent).toContain("이 저장소가 정한 값이에요");
    expect(notes.textContent).toContain("검증하지 않았고");
    const rows = within(notes).getAllByRole("row");
    const rowFor = (label: string) => rows.find((row) => row.textContent?.includes(label));
    expect(rowFor("급상승 예외")?.textContent).toContain("600px");
    expect(rowFor("급상승 예외")?.textContent).toContain("WEBTOON CANVAS 가이드");
    expect(rowFor("감정 비중")?.textContent).toContain("휴리스틱 (출처 없음)");
    expect(rowFor("표준 독자 스크롤 속도")?.textContent).toContain("350px/s");
    expect(rowFor("표준 독자 스크롤 속도")?.textContent).toContain("추정치 (출처 없음)");
  });

  it("gives both disclosures a 44px touch target and a hidden-from-readers arrow instead of the browser marker", async () => {
    await renderSample();
    for (const testId of ["tension-table-details", "tension-method-notes"]) {
      const summary = screen.getByTestId(testId).querySelector<HTMLElement>(":scope > summary");
      expect(summary?.className).toContain("min-h-11");
      // 마커를 지운 대신 화살표가 열림 상태를 보여 주고, 장식이라 스크린 리더는 읽지 않는다
      expect(summary?.className).toContain("list-none");
      expect(summary?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("makes each horizontally scrolling table a named region the keyboard can reach and scroll", async () => {
    await renderSample();
    const tableRegion = within(openDisclosure("tension-table-details")).getByRole("region", {
      name: "컷별 긴장도와 계산 근거",
    });
    const methodRegion = within(openDisclosure("tension-method-notes")).getByRole("region", {
      name: "계수와 임계값, 그리고 출처",
    });
    for (const region of [tableRegion, methodRegion]) {
      expect(region.tabIndex).toBe(0);
      expect(region.className).toContain("overflow-x-auto");
      // 포커스가 보여야 방향키로 스크롤하는 사용자가 어디에 있는지 안다
      expect(region.className).toContain("focus-visible:outline-accent");
      expect(within(region).getByRole("table")).toBeTruthy();
    }
    // 이름은 눈에 보이는 표 캡션에서 온다 — 번역 문구를 따로 두지 않는다
    expect(within(tableRegion).getByRole("table", { name: "컷별 긴장도와 계산 근거" })).toBeTruthy();
  });

  it("moves between points with the keyboard and selects with Enter's click", async () => {
    await renderSample();
    const points = chartPoints();
    act(() => {
      points[4].focus();
    });
    fireEvent.keyDown(points[4], { key: "ArrowRight" });
    expect(document.activeElement).toBe(points[5]);
    expect(points[5].getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(points[5]);
    expect(points[5].getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("tension-cut-detail").textContent).toContain("컷 6");
  });

  it("uses only themed colour tokens across the whole ready screen", async () => {
    const { container } = await renderSample();
    expect(container.innerHTML).not.toMatch(
      /\b(?:bg|text|border|ring|outline|fill|stroke)-(?:emerald|amber|rose|slate|zinc|gray|neutral|stone|sky|indigo|red|green|yellow|blue|violet)-\d/,
    );
    expect(container.innerHTML).not.toContain("dark:");
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe("StudioWebtoonTensionMapTab — the artist's input lives with the center when it hands in a draft", () => {
  it("draws from the draft it is given and reports edits through the draft instead of keeping its own copy", async () => {
    const onScriptChange = vi.fn();
    const onKindChange = vi.fn();
    await renderTab({
      draft: { kind: "script", script: TENSION_MAP_SAMPLE_SCRIPT, onKindChange, onScriptChange },
    });
    expect(chartPoints()).toHaveLength(10);

    typeScript("바뀐 대본");
    expect(onScriptChange).toHaveBeenCalledWith("바뀐 대본");
    // 제어되는 입력이라 센터가 값을 바꿔 주기 전에는 화면이 그대로다
    expect((screen.getByLabelText(/콘티 대본 \(한 줄이 한 컷\)/) as HTMLTextAreaElement).value).toBe(
      TENSION_MAP_SAMPLE_SCRIPT,
    );

    fireEvent.click(screen.getByRole("button", { name: "현재 원고" }));
    expect(onKindChange).toHaveBeenCalledWith("document");
  });

  /** 센터처럼 draft 를 들고 있고, 원고의 컷은 바깥에서 바뀔 수 있는 래퍼. */
  function CenterHarness(props: { readonly panels: typeof PANELS }) {
    const draft = useTensionMapDraft();
    return <StudioWebtoonTensionMapTab panels={props.panels} draft={draft} loadPoseCatalog={loadCatalog} />;
  }

  it("follows the manuscript while the artist has not chosen a source, and the artist's choice once made", async () => {
    const { rerender } = render(<CenterHarness panels={[]} />);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "콘티 대본" }).getAttribute("aria-pressed")).toBe("true");

    // 센터를 닫은 사이 원고에 컷이 생겼다 → 고르지 않았으니 원고로 열린다
    rerender(<CenterHarness panels={PANELS} />);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "현재 원고" }).getAttribute("aria-pressed")).toBe("true");

    // 작가가 대본을 고르면 그 뒤로는 원고가 바뀌어도 그 선택을 지킨다
    fireEvent.click(screen.getByRole("button", { name: "콘티 대본" }));
    rerender(<CenterHarness panels={[]} />);
    rerender(<CenterHarness panels={PANELS} />);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "콘티 대본" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("StudioWebtoonTensionMapTab — the pose catalog is requested only once a curve is drawn", () => {
  it("does not request it while the screen is empty, and requests it exactly once when the first curve appears", async () => {
    const load = vi.fn(loadCatalog);
    render(<StudioWebtoonTensionMapTab panels={[]} loadPoseCatalog={load} />);
    await act(async () => {});
    expect(load).not.toHaveBeenCalled();

    typeScript("   \n  ");
    await act(async () => {});
    expect(load).not.toHaveBeenCalled();

    await insertSampleScript();
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("cut-pose-suggestion-list")).toBeTruthy();

    // 곡선이 계속 그려지는 동안 컷을 옮기거나 대본을 고쳐도 다시 요청하지 않는다
    fireEvent.click(chartPoints()[6]);
    typeScript(`${TENSION_MAP_SAMPLE_SCRIPT}\n마지막 컷`);
    await act(async () => {});
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not request it for a manuscript with no panels either", async () => {
    const load = vi.fn(loadCatalog);
    render(<StudioWebtoonTensionMapTab panels={[]} loadPoseCatalog={load} />);
    fireEvent.click(screen.getByRole("button", { name: "현재 원고" }));
    await act(async () => {});
    expect(screen.getByText(/현재 원고에서 컷\(프레임\)을 찾지 못했어요/)).toBeTruthy();
    expect(load).not.toHaveBeenCalled();
  });
});

describe("StudioWebtoonTensionMapTab — pose catalog states inside the tab", () => {
  it("shows loading first, then the suggestions", async () => {
    let resolve!: (value: readonly CutPoseCandidate[]) => void;
    const pending = new Promise<readonly CutPoseCandidate[]>((accept) => {
      resolve = accept;
    });
    const slow = () => pending;
    render(<StudioWebtoonTensionMapTab panels={[]} loadPoseCatalog={slow} />);
    fireEvent.click(screen.getAllByRole("button", { name: "예시 대본 넣기" })[0]);
    expect(screen.getByText("포즈 목록을 불러오는 중…")).toBeTruthy();
    expect(chartPoints()).toHaveLength(10); // 곡선은 카탈로그를 기다리지 않는다
    await act(async () => {
      resolve(CATALOG);
    });
    expect(screen.queryByText("포즈 목록을 불러오는 중…")).toBeNull();
    expect(screen.getByTestId("cut-pose-suggestion-list")).toBeTruthy();
  });

  it("recovers from a failed catalog request with 다시 시도 while the curve stays usable", async () => {
    const flaky = vi
      .fn<() => Promise<readonly CutPoseCandidate[]>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(CATALOG);
    render(<StudioWebtoonTensionMapTab panels={[]} loadPoseCatalog={flaky} />);
    fireEvent.click(screen.getAllByRole("button", { name: "예시 대본 넣기" })[0]);
    await act(async () => {});
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("포즈 목록을 불러오지 못했어요");
    expect(chartPoints()).toHaveLength(10);
    fireEvent.click(within(alert).getByRole("button", { name: "다시 시도" }));
    await act(async () => {});
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("cut-pose-suggestion-list")).toBeTruthy();
    expect(flaky).toHaveBeenCalledTimes(2);
  });
});

describe("StudioWebtoonTensionMapTab — explicit apply and undo through the editor's page commit", () => {
  const PAGES: readonly PageState[] = [page("p1"), page("p2", { name: "표지 컷" }), page("p3")];

  function Harness(props: { readonly commits: PageState[][]; readonly refuse?: boolean }) {
    const [pages, setPages] = useState<readonly PageState[]>(PAGES);
    return (
      <StudioWebtoonTensionMapTab
        panels={[]}
        pages={pages}
        currentPageId="p2"
        loadPoseCatalog={loadCatalog}
        onCommitPages={(next) => {
          if (props.refuse) return false;
          props.commits.push(next);
          setPages(next);
          return true;
        }}
      />
    );
  }

  async function renderHarness(props: { commits: PageState[][]; refuse?: boolean }) {
    render(<Harness {...props} />);
    await insertSampleScript();
  }

  it("does not touch the document merely by showing, selecting or re-selecting cuts", async () => {
    const commits: PageState[][] = [];
    await renderHarness({ commits });
    fireEvent.click(chartPoints()[6]);
    fireEvent.click(chartPoints()[8]);
    fireEvent.change(screen.getByLabelText("감정"), { target: { value: "joy" } });
    expect(commits).toEqual([]);
    expect(screen.getByTestId("cut-pose-target").textContent).toContain("'표지 컷'");
  });

  it("applies exactly the chosen pose to the current page when its button is pressed", async () => {
    const commits: PageState[][] = [];
    await renderHarness({ commits });
    const firstCard = screen.getByTestId("cut-pose-suggestion-list").querySelector("li");
    const presetId = firstCard?.getAttribute("data-testid")?.replace("cut-pose-suggestion-", "");
    expect(presetId).toBeTruthy();

    fireEvent.click(within(firstCard as HTMLElement).getByRole("button", { name: /^'표지 컷'에 적용: / }));
    expect(commits).toHaveLength(1);
    expect(commits[0].map((entry) => entry.id)).toEqual(["p1", "p2", "p3"]);
    expect(commits[0][1]).toMatchObject({ id: "p2", posePresetId: presetId });
    expect(commits[0][0]).toBe(PAGES[0]);
    expect(PAGES[1]).not.toHaveProperty("posePresetId");
    expect(screen.getByTestId("cut-pose-notice").textContent).toContain("'표지 컷'에 포즈를 적용했어요");
  });

  it("undoes through the same commit path and leaves the page as it was", async () => {
    const commits: PageState[][] = [];
    await renderHarness({ commits });
    fireEvent.click(screen.getAllByRole("button", { name: /^'표지 컷'에 적용: / })[0]);
    fireEvent.click(screen.getByTestId("cut-pose-undo"));
    expect(commits).toHaveLength(2);
    expect(commits[1][1]).not.toHaveProperty("posePresetId");
    expect(commits[1][1]).toEqual(PAGES[1]);
    expect(screen.queryByTestId("cut-pose-undo")).toBeNull();
  });

  it("keeps the undo after the artist picks another cut on the curve, then restores through the same commit", async () => {
    const commits: PageState[][] = [];
    await renderHarness({ commits });
    // 기본 선택은 절정(컷 5, 놀람) — 거기서 적용한다
    fireEvent.click(screen.getAllByRole("button", { name: /^'표지 컷'에 적용: / })[0]);
    expect(commits).toHaveLength(1);

    // 곡선에서 컷 7(분노)을 고르면 추천은 새 컷 기준으로 다시 짜이지만 되돌리기는 사라지지 않는다
    fireEvent.click(chartPoints()[6]);
    expect((screen.getByLabelText("감정") as HTMLSelectElement).value).toBe("rage");
    expect(screen.getByText(/컷 7의 추천 포즈/)).toBeTruthy();
    expect(screen.getByTestId("cut-pose-notice").textContent).toContain("'표지 컷'에 포즈를 적용했어요");
    fireEvent.click(screen.getByTestId("cut-pose-undo"));

    expect(commits).toHaveLength(2);
    expect(commits[1][1]).toEqual(PAGES[1]);
    expect(commits[1][1]).not.toHaveProperty("posePresetId");
  });

  it("reports a refused commit and keeps the document untouched", async () => {
    const commits: PageState[][] = [];
    await renderHarness({ commits, refuse: true });
    fireEvent.click(screen.getAllByRole("button", { name: /^'표지 컷'에 적용: / })[0]);
    expect(screen.getByTestId("cut-pose-notice").getAttribute("role")).toBe("alert");
    expect(commits).toEqual([]);
  });

  it("shows suggestions but no apply button when the host passes no way to commit", async () => {
    await renderTab({ pages: PAGES, currentPageId: "p2" });
    await insertSampleScript();
    expect(screen.getByTestId("cut-pose-suggestion-list")).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: /에 적용/ })).toHaveLength(0);
    expect(screen.getByTestId("cut-pose-no-target")).toBeTruthy();
  });
});
