// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { readStudioZipArchive } from "../../studio-zip-reader";
import {
  CARD_BUNDLE_MANIFEST_PATH,
  CARD_BUNDLE_README_PATH,
  CardBundleError,
  buildCardNewsBundle,
  cardImagePath,
} from "../panel-card-export";
import { sliceCards, type CardSliceAnalysis } from "../panel-card-slice";
import { CardSliceError } from "../panel-card-slice-types";
import { FixtureImage, WHITE } from "../panel-detect-fixtures";
import { fakeCanvasWorld } from "../panel-detect-test-doubles";

import { PanelCardFlow } from "./PanelCardFlow";
import { createKit, renderWithEnv, sampleReady, sampleStrip, type Kit, type KitOverrides } from "./panel-ui-test-kit";

import type { PanelImportEnvironment } from "./panel-import-env";

const STRIP = sampleStrip();

function renderFlow(overrides: KitOverrides = {}, image: FixtureImage = STRIP): { readonly kit: Kit } {
  const kit = createKit({ ...overrides, image });
  renderWithEnv(<PanelCardFlow ready={sampleReady(image)} previewUrl="blob:preview" />, kit.env);
  return { kit };
}

const button = (name: string | RegExp): HTMLButtonElement => {
  const element = screen.getByRole("button", { name });
  if (!(element instanceof HTMLButtonElement)) throw new Error("단추가 아니에요.");
  return element;
};

const workspaceHeading = (): Promise<HTMLElement> => screen.findByRole("heading", { name: "2. 카드 미리보기와 조정" });
const cardCount = (): number => screen.getByRole("list", { name: "카드 목록" }).querySelectorAll(":scope > li").length;
/** 카드 수를 다시 나누는 작업이 끝날 때까지 기다린다. */
const settled = (): Promise<void> => waitFor(() => expect(screen.queryByText("카드를 다시 나누는 중…")).toBeNull());

function sliderOf(cutNumber: number): HTMLInputElement {
  const slider = screen.getByRole("slider", { name: `${cutNumber}번째 카드와 ${cutNumber + 1}번째 카드 사이 절단선` });
  if (!(slider instanceof HTMLInputElement)) throw new Error("슬라이더가 아니에요.");
  return slider;
}

const groupOf = (cutNumber: number): HTMLElement => screen.getByRole("group", { name: `${cutNumber}번째 카드와 ${cutNumber + 1}번째 카드 사이 절단선` });

interface SliceCall {
  readonly resolve: (analysis: CardSliceAnalysis) => void;
  readonly reject: (error: unknown) => void;
}

/** 시험이 직접 끝내는 카드 나누기 대역. 취소 신호가 오면 취소 오류로 끝난다. */
function deferredSlice(): { readonly sliceCards: PanelImportEnvironment["sliceCards"]; readonly calls: SliceCall[] } {
  const calls: SliceCall[] = [];
  const slice: PanelImportEnvironment["sliceCards"] = (_raster, _options, signal) => new Promise<CardSliceAnalysis>((resolve, reject) => {
    calls.push({ resolve, reject });
    signal.addEventListener("abort", () => { reject(new CardSliceError("cancelled")); }, { once: true });
  });
  return { sliceCards: slice, calls };
}

beforeEach(() => { useI18n.getState().setLang("ko"); });
afterEach(() => {
  vi.restoreAllMocks();
  useI18n.getState().setLang("ko");
});

describe("카드로 나눌 자리 찾기", () => {
  it("찾는 동안 카드 모양 스켈레톤과 취소가 보이고, 끝나면 카드 미리보기가 열린다", async () => {
    const { sliceCards: slice, calls } = deferredSlice();
    renderFlow({ sliceCards: slice });
    expect(screen.getByRole("heading", { name: "2. 카드로 나눌 자리를 찾는 중" })).toBeTruthy();
    expect(screen.getByText("여백이 있는 줄을 찾아 카드 자리를 계산하는 중이에요…")).toBeTruthy();
    expect(button("취소")).toBeTruthy();
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => { calls[0]?.resolve(sliceCards(STRIP.raster())); });
    await workspaceHeading();
    expect(screen.getByText("카드 4장 · 4:5 (1080×1350) · 원본 720×3000px")).toBeTruthy();
  });

  it("취소하면 다시 시도할 수 있다", async () => {
    const { sliceCards: slice, calls } = deferredSlice();
    renderFlow({ sliceCards: slice });
    await waitFor(() => expect(calls).toHaveLength(1));
    fireEvent.click(button("취소"));
    expect(await screen.findByText("카드 나누기를 취소했어요.")).toBeTruthy();
    fireEvent.click(button("다시 시도"));
    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () => { calls[1]?.resolve(sliceCards(STRIP.raster())); });
    await workspaceHeading();
  });

  it("실패하면 이유를 알려 주고 다시 시도할 수 있다", async () => {
    const { sliceCards: slice, calls } = deferredSlice();
    renderFlow({ sliceCards: slice });
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => { calls[0]?.reject(new CardSliceError("timeout")); });
    expect((await screen.findByRole("alert")).textContent).toContain("카드 나누기가 제한 시간을 넘겼어요");
    fireEvent.click(button("다시 시도"));
    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () => { calls[1]?.resolve(sliceCards(STRIP.raster())); });
    await workspaceHeading();
  });

  it("너무 좁은 이미지는 이유와 함께 거절한다", async () => {
    renderFlow({}, new FixtureImage(40, 400, WHITE));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("폭이 64px 이상인 이미지를 골라 주세요");
  });
});

describe("카드 미리보기와 조정", () => {
  it("카드마다 미리보기와 절단 품질이 보이고 마지막 카드 뒤에는 절단선이 없다", async () => {
    renderFlow();
    await workspaceHeading();
    expect(cardCount()).toBe(4);
    const previews = screen.getAllByRole("img", { name: /^카드 \d+ 미리보기 \(원본 \d+~\d+행\)$/ });
    expect(previews).toHaveLength(4);
    expect(screen.getAllByRole("group", { name: /사이 절단선$/ })).toHaveLength(3);
    for (const number of [1, 2, 3]) expect(groupOf(number).textContent).toContain("여백에서 잘라요");
    expect(screen.queryByRole("group", { name: "4번째 카드와 5번째 카드 사이 절단선" })).toBeNull();
    // 폭 720 → 1080 으로 키우므로 흐려질 수 있다는 안내가 보인다.
    expect(screen.getByText(/원고 폭이 1080px 보다 좁아 1\.5배로 키워요/)).toBeTruthy();
  });

  it("카드 수를 늘리고 줄이고 자동으로 되돌릴 수 있고, 범위 끝에서는 단추가 닫힌다", async () => {
    renderFlow();
    await workspaceHeading();
    const range = /가능한 범위 (\d+)~(\d+)장/u.exec(screen.getByText(/가능한 범위/).textContent ?? "");
    const min = Number(range?.[1]);
    const max = Number(range?.[2]);
    expect(min).toBeLessThanOrEqual(4);
    expect(max).toBeGreaterThan(4);
    for (let count = 4; count < max; count += 1) {
      fireEvent.click(button("카드 수 늘리기"));
      await waitFor(() => expect(cardCount()).toBe(count + 1));
      await settled();
    }
    expect(button("카드 수 늘리기").disabled).toBe(true);
    fireEvent.click(button("카드 수 줄이기"));
    await waitFor(() => expect(cardCount()).toBe(max - 1));
    await settled();
    fireEvent.click(button("자동으로 다시 나누기"));
    await waitFor(() => expect(cardCount()).toBe(4));
    await settled();
    expect(button("카드 수 늘리기").disabled).toBe(false);
  });

  it("다시 나누는 도중 취소하면 이전 카드가 그대로 남는다", async () => {
    renderFlow({
      replanCards: (_analysis, _count, signal) => new Promise<CardSliceAnalysis>((_resolve, reject) => {
        signal.addEventListener("abort", () => { reject(new CardSliceError("cancelled")); }, { once: true });
      }),
    });
    await workspaceHeading();
    fireEvent.click(button("카드 수 늘리기"));
    expect(await screen.findByText("카드를 다시 나누는 중…")).toBeTruthy();
    expect(button("카드 수 늘리기").disabled).toBe(true);
    fireEvent.click(button("취소"));
    expect(await screen.findByText("다시 나누기를 취소했어요. 이전 카드가 그대로예요.")).toBeTruthy();
    expect(cardCount()).toBe(4);
    expect(button("카드 수 늘리기").disabled).toBe(false);
  });

  it("절단선을 옮기면 '직접 옮김'이 표시되고, 내용을 가로지르면 경고와 함께 가까운 여백으로 붙일 수 있다", async () => {
    renderFlow();
    await workspaceHeading();
    const slider = sliderOf(1);
    const original = Number(slider.value);
    fireEvent.change(slider, { target: { value: slider.min } });
    expect(Number(sliderOf(1).value)).toBeLessThan(original);
    expect(groupOf(1).textContent).toContain("직접 옮김");
    expect(groupOf(1).textContent).toContain("그림·말풍선을 가로지를 수 있어요");
    expect(screen.getByText(/여백이 없어 내용을 가로지르는 자리가 있어요/)).toBeTruthy();

    fireEvent.click(within(groupOf(1)).getByRole("button", { name: "가까운 여백으로" }));
    expect(groupOf(1).textContent).toContain("여백에서 잘라요");
    expect(screen.queryByText(/여백이 없어 내용을 가로지르는 자리가 있어요/)).toBeNull();
  });

  it("±1·±10 행 단추로 절단선을 정밀하게 옮긴다", async () => {
    renderFlow();
    await workspaceHeading();
    const start = Number(sliderOf(2).value);
    fireEvent.click(within(groupOf(2)).getByRole("button", { name: "절단선을 1행 아래로" }));
    expect(Number(sliderOf(2).value)).toBe(start + 1);
    fireEvent.click(within(groupOf(2)).getByRole("button", { name: "절단선을 10행 위로" }));
    expect(Number(sliderOf(2).value)).toBe(start - 9);
    fireEvent.click(within(groupOf(2)).getByRole("button", { name: "절단선을 1행 위로" }));
    expect(Number(sliderOf(2).value)).toBe(start - 10);
  });

  it("카드 안 위치를 바꾸면 미리보기의 위치도 바뀐다", async () => {
    renderFlow();
    await workspaceHeading();
    const last = (): HTMLElement => {
      const element = document.querySelector<HTMLElement>('[data-card-slice="4"]');
      if (!element) throw new Error("마지막 카드 조각을 찾지 못했어요.");
      return element;
    };
    const centered = last().style.top;
    expect(parseFloat(centered)).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("radio", { name: "위쪽" }));
    expect(parseFloat(last().style.top)).toBe(0);
    fireEvent.click(screen.getByRole("radio", { name: "가운데" }));
    expect(last().style.top).toBe(centered);
  });

  it("영문 화면에서는 안내가 영문이다", async () => {
    useI18n.getState().setLang("en");
    renderFlow();
    expect(await screen.findByRole("heading", { name: "2. Preview and adjust cards" })).toBeTruthy();
    expect(screen.getByText("4 card(s) · 4:5 (1080×1350) · source 720×3000 px")).toBeTruthy();
    expect(screen.getByRole("button", { name: "More cards" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Export ZIP \(PNG\)/ })).toBeTruthy();
    expect(screen.getAllByRole("img", { name: /^Card \d preview \(source rows \d+–\d+\)$/ })).toHaveLength(4);
  });
});

describe("ZIP(PNG) 내보내기", () => {
  it("순서 있는 카드 PNG 와 안내·매니페스트가 든 ZIP 을 내려받고 다시 내려받을 수 있다", async () => {
    const { kit } = renderFlow();
    await workspaceHeading();
    fireEvent.click(button(/ZIP\(PNG\) 내보내기/));
    expect(await screen.findByText(/page-01-card-news\.zip \(4장\)을 내려받았어요\./)).toBeTruthy();
    expect(kit.downloads).toHaveLength(1);
    const [download] = kit.downloads;
    if (!download) throw new Error("내려받기 기록이 없어요.");
    expect(download.fileName).toBe("page-01-card-news.zip");

    const archive = await readStudioZipArchive(download.blob);
    expect(archive.entries.map((entry) => entry.path)).toEqual([
      CARD_BUNDLE_README_PATH,
      CARD_BUNDLE_MANIFEST_PATH,
      ...[0, 1, 2, 3].map((index) => cardImagePath(index, 4)),
    ]);
    const manifest: unknown = JSON.parse(new TextDecoder().decode(await archive.readEntry(CARD_BUNDLE_MANIFEST_PATH)));
    expect(JSON.stringify(manifest)).toContain("c".repeat(64));
    expect(JSON.stringify(manifest)).toContain("owned-or-licensed");
    expect(kit.world.surfaces).toHaveLength(4);
    expect(kit.world.surfaces.every((surface) => surface.width === 1080 && surface.height === 1350 && surface.disposed)).toBe(true);

    fireEvent.click(button("다시 내려받기"));
    expect(kit.downloads).toHaveLength(2);
    expect(kit.downloads[1]?.blob).toBe(download.blob);
  });

  it("만드는 동안 진행률과 취소가 보이고, 취소하면 내려받지 않는다", async () => {
    let abortNow: (() => void) | null = null;
    const { kit } = renderFlow({
      buildBundle: (input) => new Promise((_resolve, reject) => {
        input.onProgress?.(1, 4);
        abortNow = () => { reject(new CardBundleError("cancelled", "취소")); };
        input.signal?.addEventListener("abort", () => { abortNow?.(); }, { once: true });
      }),
    });
    await workspaceHeading();
    fireEvent.click(button(/ZIP\(PNG\) 내보내기/));
    expect(await screen.findByText("카드를 PNG 로 만들어 ZIP 에 담는 중…")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("5 / 8")).toBeTruthy());
    expect(screen.getByRole("progressbar", { name: "카드를 PNG 로 만들어 ZIP 에 담는 중…" })).toBeTruthy();
    expect(button(/ZIP\(PNG\) 내보내기/).disabled).toBe(true);
    fireEvent.click(button("취소"));
    expect(await screen.findByText("내보내기를 취소했어요. 카드 설정은 그대로예요.")).toBeTruthy();
    expect(kit.downloads).toHaveLength(0);
    expect(button(/ZIP\(PNG\) 내보내기/).disabled).toBe(false);
  });

  it("ZIP 을 만들지 못하면 이유를 알려 주고, 다시 시도하면 내려받는다", async () => {
    let attempts = 0;
    const { kit } = renderFlow({
      buildBundle: (input) => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new CardBundleError("archive-failed", "x"))
          : buildCardNewsBundle({ ...input, crc32ExecutionMode: "direct-bounded" });
      },
    });
    await workspaceHeading();
    fireEvent.click(button(/ZIP\(PNG\) 내보내기/));
    expect((await screen.findByRole("alert")).textContent).toContain("ZIP 파일을 만들지 못했어요");
    expect(kit.downloads).toHaveLength(0);
    fireEvent.click(button("다시 시도"));
    await waitFor(() => expect(kit.downloads).toHaveLength(1));
  });

  it("PNG 로 저장하지 못한 카드가 있으면 번호와 함께 알려 준다", async () => {
    const world = fakeCanvasWorld({ failEncodeAt: 2 });
    renderFlow({ canvasDeps: world.deps });
    await workspaceHeading();
    fireEvent.click(button(/ZIP\(PNG\) 내보내기/));
    expect((await screen.findByRole("alert")).textContent).toMatch(/3번째 이미지를 PNG 로 저장하지 못했어요/);
    expect(world.surfaces.every((surface) => surface.disposed)).toBe(true);
  });

  it("제목이 비면 내보낼 수 없다", async () => {
    renderFlow();
    await workspaceHeading();
    fireEvent.change(screen.getByRole("textbox", { name: "ZIP 파일 이름(제목)" }), { target: { value: "  " } });
    expect(button(/ZIP\(PNG\) 내보내기/).disabled).toBe(true);
  });
});
