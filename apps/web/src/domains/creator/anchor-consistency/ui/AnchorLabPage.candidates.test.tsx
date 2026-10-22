// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { ANCHOR_CANDIDATE_LIMITS } from "../anchor-candidate-session";
import { ANCHOR_ANGLE_IDS } from "../anchor-capture-spec";
import { FIGURE_STYLE_A, FIGURE_STYLE_B, figureRaster, noiseRaster } from "../anchor-synthetic-raster";
import { fakePngFile } from "../anchor-test-kit";
import { AnchorLabPage } from "./AnchorLabPage";
import {
  confirmRights,
  createFakeDecoder,
  createFakeExport,
  fillIdentity,
  prepareFullSet,
  stubObjectUrls,
  tk,
  type FakeDecoder,
} from "./anchor-lab-test-kit";

let urls: ReturnType<typeof stubObjectUrls>;
let previousLanguage = "";

beforeEach(() => {
  previousLanguage = useI18n.getState().lang;
  useI18n.setState({ lang: "ko" });
  urls = stubObjectUrls();
});

afterEach(() => {
  cleanup();
  urls.restore();
  useI18n.setState({ lang: previousLanguage });
});

/**
 * 앵커 여섯 장(seed 1~6)은 스타일 A, 후보는 seed 11(스타일 A 비슷), 12(스타일 B 다름), 13(잡음).
 * seed 15 는 넓은 포즈에 윗옷 색만 조금 다르고, seed 16 은 스타일 A 선 포즈다. 앵커가 넓은 포즈(정면·좌측·우측)와 선 포즈
 * (좌 3/4·후면·우 3/4)를 번갈아 가져서 견줄 앵커에 따라 두 후보의 순위가 뒤집힌다.
 */
function renderPage(options: { readonly strict?: boolean } = {}): FakeDecoder {
  const decoder = createFakeDecoder();
  for (let seed = 1; seed <= 6; seed += 1) decoder.register(seed, figureRaster({ style: FIGURE_STYLE_A, pose: seed % 2 === 0 ? "stand" : "wide" }));
  decoder.register(11, figureRaster({ style: FIGURE_STYLE_A, noise: { amount: 4, seed: 3 } }));
  decoder.register(12, figureRaster({ style: FIGURE_STYLE_B, pose: "arms-up" }));
  decoder.register(13, noiseRaster(128, 192, 7));
  decoder.register(15, figureRaster({ style: { ...FIGURE_STYLE_A, top: [196, 44, 54] }, pose: "wide" }));
  decoder.register(16, figureRaster({ style: FIGURE_STYLE_A, pose: "stand" }));
  const page = <AnchorLabPage deps={{ candidates: decoder.deps, export: createFakeExport().deps }} />;
  render(options.strict ? <StrictMode>{page}</StrictMode> : page);
  return decoder;
}

/** 포커스가 있는 요소(후보 버튼)에 키를 누른다. */
const pressKey = (init: { key: string }): void => {
  fireEvent.keyDown(document.activeElement ?? document.body, init);
};
const candidateInput = (): HTMLInputElement => screen.getByLabelText(tk("candidates.inputLabel")) as HTMLInputElement;
const list = (): HTMLElement => screen.getByRole("list", { name: tk("candidates.list") });
const cards = (): HTMLButtonElement[] => within(list()).getAllByRole("button") as HTMLButtonElement[];
const orderOf = (): string[] => cards().map((card) => card.textContent?.match(/(similar|different|noise|bad)\.png/u)?.[0] ?? "");

/** 목록 카드를 보이는 순서대로 읽는다: 이름과 카드 배지의 참고 점수(없으면 null). */
const shownScores = (): Array<{ readonly name: string; readonly score: number | null }> =>
  cards().map((card) => {
    const match = /참고 (\d+)점/u.exec(card.textContent ?? "");
    return { name: card.querySelector("span[title]")?.getAttribute("title") ?? "", score: match?.[1] ? Number(match[1]) : null };
  });

async function addCandidates(files: File[]): Promise<void> {
  fireEvent.change(candidateInput(), { target: { files } });
  await waitFor(() => { expect(cards()).toHaveLength(files.length); });
}

const standard = (): File[] => [
  fakePngFile("different.png", 700, 1000, 12),
  fakePngFile("noise.png", 700, 1000, 13),
  fakePngFile("similar.png", 700, 1000, 11),
];

async function addScored(): Promise<void> {
  await prepareFullSet();
  await addCandidates(standard());
  await waitFor(() => { expect(screen.getAllByText(/^참고 \d+점/u)).toHaveLength(3); });
}

describe("후보 비교 — 준비 상태", () => {
  it("앵커와 권리 확인이 없으면 후보를 받지 않고 이유를 알린다", async () => {
    renderPage();
    expect(candidateInput().disabled).toBe(true);
    expect(screen.queryByText(tk("candidates.needAnchor"))).toBeNull();
    expect(screen.getAllByText(tk("rights.locked")).length).toBeGreaterThan(1);
    expect(screen.getByText(tk("candidates.empty"))).toBeTruthy();
    await fillIdentity();
    confirmRights();
    expect(candidateInput().disabled).toBe(true);
    expect(screen.getByText(tk("candidates.needAnchor"))).toBeTruthy();
  });

  it("앵커 세트가 있으면 후보를 받는다", async () => {
    renderPage();
    await prepareFullSet();
    expect(candidateInput().disabled).toBe(false);
  });
});

describe("후보 비교 — 점수와 정렬", () => {
  it("비슷한 후보가 위에 오도록 참고 점수 높은 순으로 정렬하고 구간을 글로 쓴다", async () => {
    renderPage();
    await addScored();
    expect(orderOf()[0]).toBe("similar.png");
    expect(orderOf()[2]).not.toBe("similar.png");
    expect(screen.getAllByText(/특징이 (가까운 편|중간쯤|먼 편)/u).length).toBeGreaterThanOrEqual(3);
  });

  it("정렬 기준을 바꾸면 순서가 바뀌고 점수 없는 후보는 맨 뒤에 둔다", async () => {
    renderPage();
    await prepareFullSet();
    await addCandidates([...standard(), new File([new Uint8Array(30)], "bad.png", { type: "image/png" })]);
    await waitFor(() => { expect(screen.getAllByText(/^참고 \d+점/u)).toHaveLength(3); });
    const sort = screen.getByLabelText(tk("candidates.sort.label")) as HTMLSelectElement;
    fireEvent.change(sort, { target: { value: "name" } });
    expect(orderOf()).toEqual(["bad.png", "different.png", "noise.png", "similar.png"]);
    fireEvent.change(sort, { target: { value: "input-order" } });
    expect(orderOf()).toEqual(["different.png", "noise.png", "similar.png", "bad.png"]);
    fireEvent.change(sort, { target: { value: "score-desc" } });
    expect(orderOf()[0]).toBe("similar.png");
    expect(orderOf()[3]).toBe("bad.png");
    fireEvent.change(sort, { target: { value: "score-asc" } });
    expect(orderOf()[0]).not.toBe("similar.png");
    expect(orderOf()[3]).toBe("bad.png");
    fireEvent.change(sort, { target: { value: "color" } });
    expect(orderOf()[0]).toBe("similar.png");
    expect(orderOf()[3]).toBe("bad.png");
  });

  it("점수 옆에 한계 안내와 구간 경계가 사람이 정한 값임을 항상 보여 준다", async () => {
    renderPage();
    await addScored();
    expect(screen.getByText(tk("score.disclaimer"))).toBeTruthy();
    expect(screen.getByText(tk("score.bandNote", { high: 75, medium: 55 }))).toBeTruthy();
    expect(screen.getByText(tk("feature.note"))).toBeTruthy();
    expect(screen.getByText(tk("diff.note"))).toBeTruthy();
  });
});

describe("후보 비교 — 개발 모드 효과 재실행", () => {
  it("StrictMode 에서도 앵커 읽기와 후보 분석이 취소되지 않고 끝난다", async () => {
    renderPage({ strict: true });
    await addScored();
    expect(screen.queryByText(tk("candidates.status.cancelled"))).toBeNull();
    expect(orderOf()[0]).toBe("similar.png");
  });
});

describe("후보 비교 — 키보드와 나란히 보기", () => {
  it("방향키로 후보를 옮기고 Home·End 로 처음과 끝에 간다. 고른 후보만 탭 정지점이다", async () => {
    renderPage();
    await addScored();
    const [first, second, third] = cards();
    expect(first?.getAttribute("aria-pressed")).toBe("true");
    expect(first?.tabIndex).toBe(0);
    expect(second?.tabIndex).toBe(-1);
    first?.focus();
    pressKey({ key: "ArrowDown" });
    expect(cards()[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(cards()[1]);
    pressKey({ key: "ArrowRight" });
    expect(document.activeElement).toBe(cards()[2]);
    pressKey({ key: "ArrowRight" });
    expect(document.activeElement).toBe(third);
    pressKey({ key: "Home" });
    expect(document.activeElement).toBe(cards()[0]);
    pressKey({ key: "ArrowUp" });
    expect(document.activeElement).toBe(cards()[0]);
    pressKey({ key: "End" });
    expect(document.activeElement).toBe(cards()[2]);
    pressKey({ key: "a" });
    expect(document.activeElement).toBe(cards()[2]);
  });

  it("이전·다음 버튼으로도 옮기고 끝에서는 비활성이 된다", async () => {
    renderPage();
    await addScored();
    const prev = screen.getByRole("button", { name: tk("compare.prev") }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: tk("compare.next") }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(screen.getByText(tk("compare.position", { index: 1, total: 3 }))).toBeTruthy();
    fireEvent.click(next);
    expect(screen.getByText(tk("compare.position", { index: 2, total: 3 }))).toBeTruthy();
    fireEvent.click(next);
    expect(next.disabled).toBe(true);
    fireEvent.click(prev);
    expect(screen.getByText(tk("compare.position", { index: 2, total: 3 }))).toBeTruthy();
  });

  it("고른 후보를 앵커와 나란히 보여 주고 점수·특징별 유사도·달라진 점을 보여 준다", async () => {
    renderPage();
    await addScored();
    const compare = screen.getByRole("region", { name: tk("compare.title") });
    expect(within(compare).getByRole("img", { name: tk("compare.candidateAlt", { name: "similar.png" }) })).toBeTruthy();
    expect(within(compare).getByText(tk("compare.candidate", { name: "similar.png" }))).toBeTruthy();
    expect(within(compare).getAllByRole("img").length).toBeGreaterThanOrEqual(2);
    expect(within(compare).getByText(tk("score.label"))).toBeTruthy();
    expect(within(compare).getByText(tk("feature.color"))).toBeTruthy();
    expect(within(compare).getByText(tk("feature.palette"))).toBeTruthy();
    expect(within(compare).getByText(tk("feature.structure"))).toBeTruthy();
    // 다른 스타일 후보를 고르면 달라진 점이 나온다.
    fireEvent.click(cards().find((card) => card.textContent?.includes("different.png")) as HTMLButtonElement);
    expect(within(compare).getByText(tk("compare.candidate", { name: "different.png" }))).toBeTruthy();
    expect(within(compare).getAllByText(/주요색|명도|채도|색상/u).length).toBeGreaterThan(0);
  });

  it("견줄 앵커를 직접 고르면 그 각도와 견준 결과를 보여 준다", async () => {
    renderPage();
    await addScored();
    const select = screen.getByLabelText(tk("candidates.anchorSelect.label")) as HTMLSelectElement;
    expect(select.value).toBe("best");
    fireEvent.change(select, { target: { value: "back" } });
    expect(select.value).toBe("back");
    const compare = screen.getByRole("region", { name: tk("compare.title") });
    expect(within(compare).getByText(tk("compare.anchor", { angle: tk("angle.back") }))).toBeTruthy();
    expect(within(compare).getByText(tk("score.chosenAnchor", { angle: tk("angle.back") }))).toBeTruthy();
    fireEvent.change(select, { target: { value: "best" } });
    expect(within(compare).getByText(/가장 비슷한 앵커: /u)).toBeTruthy();
  });

  it("견줄 앵커를 고르면 목록 카드의 점수와 순서가 그 앵커 기준으로 함께 바뀌고, 나란히 보기와 같은 숫자다", async () => {
    renderPage();
    await prepareFullSet();
    await addCandidates([fakePngFile("wide-shifted.png", 700, 1000, 15), fakePngFile("stand.png", 700, 1000, 16)]);
    await waitFor(() => { expect(screen.getAllByText(/^참고 \d+점/u)).toHaveLength(2); });
    const compare = screen.getByRole("region", { name: tk("compare.title") });
    const select = screen.getByLabelText(tk("candidates.anchorSelect.label")) as HTMLSelectElement;

    // 자동: 후보마다 가장 비슷한 앵커와의 점수라 선 포즈 후보(같은 스타일)가 위다. 목록 머리에 기준을 밝힌다.
    const automatic = shownScores();
    expect(automatic.map((entry) => entry.name)).toEqual(["stand.png", "wide-shifted.png"]);
    expect(screen.getByText(tk("score.chosenAnchor", { angle: tk("candidates.anchorSelect.best") }))).toBeTruthy();

    // 정면을 고르면 정렬과 카드 숫자가 모두 정면 기준이 된다: 넓은 후보가 위로 오고, 선 후보의 숫자는 자동일 때보다 낮아진다.
    fireEvent.change(select, { target: { value: "front" } });
    const front = shownScores();
    expect(front.map((entry) => entry.name)).toEqual(["wide-shifted.png", "stand.png"]);
    const scoreOf = (entries: typeof front, name: string): number => entries.find((entry) => entry.name === name)?.score ?? Number.NaN;
    expect(scoreOf(front, "stand.png")).toBeLessThan(scoreOf(automatic, "stand.png"));
    expect(scoreOf(front, "wide-shifted.png")).toBeGreaterThan(scoreOf(front, "stand.png"));
    const basis = screen.getAllByText(tk("score.chosenAnchor", { angle: tk("angle.front") }));
    expect(basis.some((node) => !compare.contains(node))).toBe(true);

    // 나란히 보기의 숫자도 카드와 같다(고른 후보가 바뀌어도).
    for (const entry of front) {
      fireEvent.click(cards().find((card) => card.querySelector("span[title]")?.getAttribute("title") === entry.name) as HTMLButtonElement);
      expect(within(compare).getByText(tk("score.value", { score: entry.score ?? -1 }))).toBeTruthy();
    }

    // 어떤 앵커를 골라도 카드 숫자는 목록 순서대로 내려가고(높은 순), 점수 낮은 순으로 바꾸면 올라간다.
    const sort = screen.getByLabelText(tk("candidates.sort.label")) as HTMLSelectElement;
    for (const angleId of ANCHOR_ANGLE_IDS) {
      fireEvent.change(select, { target: { value: angleId } });
      fireEvent.change(sort, { target: { value: "score-desc" } });
      const desc = shownScores().map((entry) => entry.score ?? Number.NaN);
      expect(desc).toEqual([...desc].sort((left, right) => right - left));
      fireEvent.change(sort, { target: { value: "score-asc" } });
      const asc = shownScores().map((entry) => entry.score ?? Number.NaN);
      expect(asc).toEqual([...asc].sort((left, right) => left - right));
    }

    // 자동으로 되돌리면 카드 숫자도 처음 값으로 돌아온다.
    fireEvent.change(sort, { target: { value: "score-desc" } });
    fireEvent.change(select, { target: { value: "best" } });
    expect(shownScores()).toEqual(automatic);
  });

  it("후보를 지우면 다음 후보가 선택된다", async () => {
    renderPage();
    await addScored();
    fireEvent.click(screen.getByRole("button", { name: tk("compare.remove") }));
    expect(cards()).toHaveLength(2);
    expect(cards()[0]?.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: tk("candidates.clear") }));
    expect(screen.queryByRole("list", { name: tk("candidates.list") })).toBeNull();
    expect(screen.getByText(tk("candidates.empty"))).toBeTruthy();
  });
});

describe("후보 비교 — 실패와 재시도", () => {
  it("읽지 못한 후보는 이유와 다음 행동을 알리고, 고쳐지면 다시 시도로 점수를 받는다", async () => {
    const decoder = renderPage();
    await prepareFullSet();
    await addCandidates([fakePngFile("retry.png", 700, 1000, 14)]);
    await waitFor(() => { expect(screen.getByText(tk("candidates.status.failed"))).toBeTruthy(); });
    const compare = screen.getByRole("region", { name: tk("compare.title") });
    expect(within(compare).getByRole("alert").textContent).toBe(tk("captureError.decodeFailed"));
    expect(screen.getByRole("button", { name: tk("candidates.retryFailed") })).toBeTruthy();
    decoder.register(14, figureRaster({ style: FIGURE_STYLE_A, pose: "side" }));
    fireEvent.click(within(compare).getByRole("button", { name: tk("compare.retry") }));
    await waitFor(() => { expect(screen.getAllByText(/^참고 \d+점/u)).toHaveLength(1); });
    expect(within(compare).queryByRole("alert")).toBeNull();
  });

  it("분석 중에 취소하면 남은 후보가 취소 상태가 되고 끝난 후보는 그대로이며, 다시 시도하면 모두 끝난다", async () => {
    const decoder = renderPage();
    await prepareFullSet();
    decoder.hang(12);
    fireEvent.change(candidateInput(), {
      target: { files: [fakePngFile("a-first.png", 700, 1000, 11), fakePngFile("b-hang.png", 700, 1000, 12), fakePngFile("c-last.png", 700, 1000, 13)] },
    });
    await waitFor(() => { expect(screen.getAllByText(/^참고 \d+점/u)).toHaveLength(1); });
    fireEvent.click(await screen.findByRole("button", { name: tk("candidates.cancel") }));
    await waitFor(() => { expect(screen.getAllByText(tk("candidates.status.cancelled"))).toHaveLength(2); });
    expect(screen.getAllByText(/^참고 \d+점/u)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: tk("candidates.cancel") })).toBeNull();
    decoder.release(12);
    fireEvent.click(screen.getByRole("button", { name: tk("candidates.retryFailed") }));
    await waitFor(() => { expect(screen.getAllByText(/^참고 \d+점/u)).toHaveLength(3); });
    expect(screen.queryByText(tk("candidates.status.cancelled"))).toBeNull();
  });

  it("후보는 최대 개수까지만 받고 넘친 장수를 알린다", async () => {
    renderPage();
    await prepareFullSet();
    const max = ANCHOR_CANDIDATE_LIMITS.maxCandidates;
    const files = Array.from({ length: max + 2 }, (_, index) => fakePngFile(`c-${index}.png`, 700, 1000, 11));
    fireEvent.change(candidateInput(), { target: { files } });
    await waitFor(() => { expect(cards()).toHaveLength(max); });
    expect(screen.getByText(tk("candidates.limitReached", { count: max, skipped: 2 }))).toBeTruthy();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  });
});
