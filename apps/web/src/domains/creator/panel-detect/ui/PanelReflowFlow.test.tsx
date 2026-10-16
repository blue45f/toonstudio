// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { detectPanels } from "../panel-detect-core";
import { createManualDetectResult } from "../panel-detect-edit";
import { FixtureImage, INK, WHITE } from "../panel-detect-fixtures";
import { tightenRectToContent } from "../panel-detect-tighten";
import { PanelDetectError, type PanelDetectRaster, type PanelDetectResult } from "../panel-detect-types";

import { PanelReflowFlow } from "./PanelReflowFlow";
import { createKit, mockBounds, renderWithEnv, sampleReady, samplePage, type Kit, type KitOverrides } from "./panel-ui-test-kit";

import type { PanelImportEnvironment } from "./panel-import-env";

type DetectOptions = Parameters<PanelImportEnvironment["detect"]>[1];

interface DetectCall {
  readonly options: DetectOptions;
  readonly resolve: (result: PanelDetectResult) => void;
  readonly reject: (error: unknown) => void;
}

const IMAGE = samplePage();

function detectSample(readingOrder: "webtoon" | "manga" | "comic" = "webtoon"): PanelDetectResult {
  return detectPanels(IMAGE.raster(), { readingOrder });
}

/** 시험이 직접 끝내는 감지 대역. 취소 신호가 오면 실제 Worker 처럼 취소 오류로 끝난다. */
function deferredDetect(): { readonly detect: PanelImportEnvironment["detect"]; readonly calls: DetectCall[] } {
  const calls: DetectCall[] = [];
  const detect: PanelImportEnvironment["detect"] = (_raster, options) => new Promise<PanelDetectResult>((resolve, reject) => {
    calls.push({ options, resolve, reject });
    options.signal?.addEventListener("abort", () => { reject(new PanelDetectError("cancelled")); }, { once: true });
  });
  return { detect, calls };
}

function renderFlow(overrides: KitOverrides = {}, image: FixtureImage = IMAGE): { readonly kit: Kit; readonly container: HTMLElement; readonly unmount: () => void } {
  const kit = createKit({ ...overrides, image });
  const { container, unmount } = renderWithEnv(<PanelReflowFlow ready={sampleReady(image)} previewUrl="blob:preview" />, kit.env);
  return { kit, container, unmount };
}

const reviewHeading = (): Promise<HTMLElement> => screen.findByRole("heading", { name: "2. 컷 확인과 고치기" });
const panelIds = (): string[] => [...document.querySelectorAll("[data-panel-id]")].map((element) => element.getAttribute("data-panel-id") ?? "");
const announcer = (): string => document.querySelector('[data-panel-announcer="true"]')?.textContent ?? "";
const button = (name: string | RegExp): HTMLElement => screen.getByRole("button", { name });

function firstOf<T>(items: readonly T[]): T {
  const first = items[0];
  if (first === undefined) throw new Error("찾는 요소가 하나도 없어요.");
  return first;
}

/** 컷 목록의 "N번 컷 …" 선택 단추. */
const listButtons = (): HTMLElement[] => screen.getAllByRole("button", { name: /^\d+번 컷 / });
/** 도구 모음의 같은 이름 단추와 구분되는, 컷 정보 칸의 단추. */
const inspectorButton = (name: string): HTMLElement => firstOf(screen.getAllByRole("button", { name }).filter((node) => node.getAttribute("aria-pressed") === null));

async function resolveNth(calls: readonly DetectCall[], index: number, result: PanelDetectResult): Promise<void> {
  await waitFor(() => expect(calls.length).toBeGreaterThan(index));
  await act(async () => { calls[index]?.resolve(result); });
}

beforeEach(() => { useI18n.getState().setLang("ko"); });
afterEach(() => {
  vi.restoreAllMocks();
  useI18n.getState().setLang("ko");
});

describe("컷 찾기 단계", () => {
  it("찾는 동안 진행 안내와 취소가 보이고, 끝나면 확인·수정 화면이 열린다", async () => {
    const { detect, calls } = deferredDetect();
    renderFlow({ detect });
    expect(screen.getByRole("heading", { name: "2. 컷 찾는 중" })).toBeTruthy();
    expect(screen.getByText("여백을 따라 컷 경계를 찾는 중이에요…")).toBeTruthy();
    expect(button("취소")).toBeTruthy();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.options).toMatchObject({ readingOrder: "webtoon", sensitivity: "normal" });
    await resolveNth(calls, 0, detectSample());
    await reviewHeading();
    expect(screen.getByText(/컷 3개/)).toBeTruthy();
    expect(screen.queryByText("여백을 따라 컷 경계를 찾는 중이에요…")).toBeNull();
  });

  it("취소하면 다시 시도하거나 직접 그릴 수 있고, 다시 시도하면 새로 찾는다", async () => {
    const { detect, calls } = deferredDetect();
    renderFlow({ detect });
    await waitFor(() => expect(calls).toHaveLength(1));
    fireEvent.click(button("취소"));
    expect(await screen.findByText(/컷 찾기를 취소했어요\. 다시 시도하거나 컷을 직접 그릴 수 있어요\./)).toBeTruthy();
    expect(button("컷 직접 그리기")).toBeTruthy();
    fireEvent.click(button("다시 시도"));
    await resolveNth(calls, 1, detectSample());
    await reviewHeading();
    expect(panelIds()).toHaveLength(3);
  });

  it("실패하면 이유를 보여 주고 다시 시도할 수 있다", async () => {
    const { detect, calls } = deferredDetect();
    renderFlow({ detect });
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => { calls[0]?.reject(new PanelDetectError("worker-failed")); });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("컷 찾기가 중간에 멈췄어요. 다시 시도해 주세요.");
    fireEvent.click(button("다시 시도"));
    await resolveNth(calls, 1, detectSample());
    await reviewHeading();
    expect(panelIds()).toHaveLength(3);
  });

  it("시간 초과와 Worker 없음도 각자의 안내를 보여 준다", async () => {
    const { detect, calls } = deferredDetect();
    renderFlow({ detect });
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => { calls[0]?.reject(new PanelDetectError("timeout")); });
    expect((await screen.findByRole("alert")).textContent).toContain("컷 찾기가 제한 시간을 넘겼어요");
    fireEvent.click(button("다시 시도"));
    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () => { calls[1]?.reject(new PanelDetectError("worker-unavailable")); });
    expect((await screen.findByRole("alert")).textContent).toContain("컷을 직접 그려 주세요");
  });

  it("실패해도 컷 직접 그리기로 같은 흐름을 이어갈 수 있다", async () => {
    mockBounds(IMAGE.width, IMAGE.height);
    const { detect, calls } = deferredDetect();
    renderFlow({ detect });
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => { calls[0]?.reject(new PanelDetectError("worker-unavailable")); });
    fireEvent.click(await screen.findByRole("button", { name: "컷 직접 그리기" }));
    await reviewHeading();
    expect(screen.getByText("컷이 없어요.")).toBeTruthy();
    expect((button(/다음: 세로 재배열 설정/) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("컷이 하나 이상 있어야 다음으로 갈 수 있어요.")).toBeTruthy();
    expect(screen.getByText(/아직 컷이 없어요\./)).toBeTruthy();

    fireEvent.click(button("새 컷 그리기"));
    const canvas = screen.getByRole("group", { name: "컷 편집 캔버스" });
    fireEvent.pointerDown(canvas, { button: 0, clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 180, clientY: 240, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    expect(panelIds()).toHaveLength(1);
    expect(announcer()).toBe("새 컷을 추가했어요.");
    expect((button(/다음: 세로 재배열 설정/) as HTMLButtonElement).disabled).toBe(false);
  });

  it("끌 수 없는 환경에서도 ‘전체를 한 컷으로’ 단추와 나누기로 첫 컷을 만들 수 있다", async () => {
    const { detect, calls } = deferredDetect();
    renderFlow({ detect });
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => { calls[0]?.reject(new PanelDetectError("worker-unavailable")); });
    fireEvent.click(await screen.findByRole("button", { name: "컷 직접 그리기" }));
    await reviewHeading();
    expect(screen.getByText(/‘전체를 한 컷으로’ 단추로 시작해 주세요/)).toBeTruthy();
    fireEvent.click(button("전체를 한 컷으로"));
    expect(panelIds()).toHaveLength(1);
    expect(document.querySelector("[data-panel-id]")?.getAttribute("aria-label")).toContain("위치 x 0, y 0, 크기 400×560 픽셀");
    expect(announcer()).toContain("이미지 전체를 한 컷으로 추가했어요");
    // 방금 만든 컷이 선택돼 있어 바로 숫자로 고치거나 선으로 나눌 수 있다.
    fireEvent.click(inspectorButton("가로선으로 나누기"));
    expect(panelIds()).toHaveLength(2);
    expect((button(/다음: 세로 재배열 설정/) as HTMLButtonElement).disabled).toBe(false);
  });

  it("컷을 하나도 못 찾으면 경고를 보여 주고 직접 그리기를 안내한다", async () => {
    const empty: PanelDetectResult = { ...createManualDetectResult(IMAGE.width, IMAGE.height, "webtoon"), warnings: ["no-panel-found"] };
    renderFlow({ detect: () => Promise.resolve(empty) });
    await reviewHeading();
    expect(screen.getByText("컷이 하나도 보이지 않아요. 컷을 직접 그려 주세요.")).toBeTruthy();
    expect(panelIds()).toHaveLength(0);
    expect((button(/다음: 세로 재배열 설정/) as HTMLButtonElement).disabled).toBe(true);
  });

  it("화면이 사라지면 진행 중이던 감지를 취소한다", async () => {
    const { detect, calls } = deferredDetect();
    const view = renderFlow({ detect });
    await waitFor(() => expect(calls).toHaveLength(1));
    const signal = calls[0]?.options.signal;
    expect(signal?.aborted).toBe(false);
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});

describe("컷 확인과 고치기 단계", () => {
  it("찾은 컷의 개수와 전체 신뢰도를 알려 주고, 컷 목록과 캔버스가 같은 순서로 나온다", async () => {
    renderFlow();
    await reviewHeading();
    const status = screen.getAllByRole("status").find((node) => node.textContent?.includes("컷 3개"));
    expect(status?.textContent).toMatch(/자동 감지 전체 신뢰도 (높음|보통|낮음)\(\d+%\)/u);
    expect(status?.textContent).not.toMatch(/신뢰도 신뢰도/u);
    const list = screen.getByRole("list", { name: "컷 목록 (읽기 순서)" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(panelIds()).toHaveLength(3);
  });

  it("삭제·되돌리기·다시하기가 이력과 낭독 안내를 함께 갱신한다", async () => {
    renderFlow();
    await reviewHeading();
    const before = panelIds();
    fireEvent.click(button("컷 2 삭제"));
    expect(panelIds()).toEqual([before[0], before[2]]);
    expect(announcer()).toBe("2번 컷을 삭제했어요.");
    expect(screen.getByText(/컷 2개/)).toBeTruthy();
    fireEvent.click(button("되돌리기"));
    expect(panelIds()).toEqual(before);
    expect(announcer()).toBe("되돌렸어요.");
    fireEvent.click(button("다시하기"));
    expect(panelIds()).toEqual([before[0], before[2]]);
    expect(announcer()).toBe("다시 적용했어요.");
  });

  it("Ctrl+Z / Ctrl+Shift+Z 단축키로도 되돌리고 다시 적용한다", async () => {
    renderFlow();
    await reviewHeading();
    const before = panelIds();
    fireEvent.click(button("컷 3 삭제"));
    const target = document.querySelector<HTMLElement>("[data-panel-id]");
    if (!target) throw new Error("캔버스의 컷을 찾지 못했어요.");
    fireEvent.keyDown(target, { key: "z", ctrlKey: true });
    expect(panelIds()).toEqual(before);
    fireEvent.keyDown(target, { key: "z", ctrlKey: true, shiftKey: true });
    expect(panelIds()).toHaveLength(2);
    fireEvent.keyDown(target, { key: "y", metaKey: true });
    expect(panelIds()).toHaveLength(2);
    fireEvent.keyDown(target, { key: "z", ctrlKey: true });
    expect(panelIds()).toEqual(before);
  });

  it("입력칸 안에서는 단축키가 입력칸의 되돌리기를 가로채지 않는다", async () => {
    renderFlow();
    await reviewHeading();
    fireEvent.click(button("컷 1 삭제"));
    fireEvent.click(firstOf(listButtons()));
    const input = await screen.findByRole("spinbutton", { name: /번 컷 X \(왼쪽\) \(픽셀\)/ });
    fireEvent.keyDown(input, { key: "z", ctrlKey: true });
    expect(panelIds()).toHaveLength(2);
  });

  it("순서 단추로 컷을 앞뒤로 옮긴다", async () => {
    renderFlow();
    await reviewHeading();
    const [a, b, c] = panelIds();
    fireEvent.click(button("1번 컷을 뒤로"));
    expect(panelIds()).toEqual([b, a, c]);
    expect(announcer()).toBe("1번 컷을 뒤로 옮겼어요.");
    fireEvent.click(button("3번 컷을 앞으로"));
    expect(panelIds()).toEqual([b, c, a]);
    expect((button("1번 컷을 앞으로") as HTMLButtonElement).disabled).toBe(true);
    expect((button("3번 컷을 뒤로") as HTMLButtonElement).disabled).toBe(true);
  });

  it("읽기 순서를 만화로 바꾸면 윗줄을 오른쪽부터 읽도록 컷이 다시 정렬된다", async () => {
    renderFlow();
    await reviewHeading();
    const [a, b, c] = panelIds();
    fireEvent.click(screen.getByRole("radio", { name: "만화 (우→좌, 위→아래)" }));
    expect(panelIds()).toEqual([b, a, c]);
    expect(announcer()).toBe("읽기 순서를 다시 정렬했어요.");
    fireEvent.click(screen.getByRole("radio", { name: "코믹 (좌→우, 위→아래)" }));
    expect(panelIds()).toEqual([a, b, c]);
  });

  it("체크한 컷을 합치면 하나의 컷이 되어 선택된다", async () => {
    renderFlow();
    await reviewHeading();
    const merge = button("체크한 컷 합치기") as HTMLButtonElement;
    expect(merge.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "컷 1 합치기에 포함" }));
    expect(merge.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "컷 2 합치기에 포함" }));
    expect(merge.disabled).toBe(false);
    fireEvent.click(merge);
    expect(panelIds()).toHaveLength(2);
    expect(announcer()).toBe("컷 2개를 하나로 합쳤어요.");
    expect(screen.getByText(/번 컷 정보/)).toBeTruthy();
  });

  it("컷을 고르면 숫자로 위치·크기를 고칠 수 있다", async () => {
    renderFlow();
    await reviewHeading();
    fireEvent.click(firstOf(listButtons()));
    expect(screen.getByText("1번 컷 정보")).toBeTruthy();
    const x = screen.getByRole("spinbutton", { name: "1번 컷 X (왼쪽) (픽셀)" }) as HTMLInputElement;
    fireEvent.change(x, { target: { value: "30" } });
    fireEvent.blur(x);
    const label = document.querySelector("[data-panel-id]")?.getAttribute("aria-label") ?? "";
    expect(label).toContain("위치 x 30");
    expect(announcer()).toBe("컷의 위치와 크기를 바꿨어요.");
    // 입력칸은 현재 컷의 값으로 다시 만들어진다.
    expect((screen.getByRole("spinbutton", { name: "1번 컷 X (왼쪽) (픽셀)" }) as HTMLInputElement).value).toBe("30");
  });

  it("받아들일 수 없는 숫자(최소 크기 미만·빈 칸)는 입력칸을 현재 컷의 값으로 되돌리고 기록을 쌓지 않는다", async () => {
    renderFlow();
    await reviewHeading();
    fireEvent.click(firstOf(listButtons()));
    const before = document.querySelector("[data-panel-id]")?.getAttribute("aria-label") ?? "";
    const widthInput = (): HTMLInputElement => screen.getByRole("spinbutton", { name: "1번 컷 너비 (픽셀)" }) as HTMLInputElement;
    const current = widthInput().value;

    fireEvent.change(widthInput(), { target: { value: "2" } });
    fireEvent.blur(widthInput());
    expect(widthInput().value).toBe(current);

    fireEvent.change(widthInput(), { target: { value: "" } });
    fireEvent.keyDown(widthInput(), { key: "Enter" });
    expect(widthInput().value).toBe(current);

    // 컷도 되돌리기 기록도 그대로다.
    expect(document.querySelector("[data-panel-id]")?.getAttribute("aria-label")).toBe(before);
    expect((button("되돌리기") as HTMLButtonElement).disabled).toBe(true);
    expect(announcer()).toBe("");
  });

  it("선택한 컷을 가운데 선으로 둘로 나눌 수 있다", async () => {
    renderFlow();
    await reviewHeading();
    fireEvent.click(firstOf(listButtons()));
    fireEvent.click(inspectorButton("가로선으로 나누기"));
    expect(panelIds()).toHaveLength(4);
    expect(announcer()).toBe("컷을 둘로 나눴어요.");
    fireEvent.click(button("되돌리기"));
    expect(panelIds()).toHaveLength(3);
    fireEvent.click(firstOf(listButtons()));
    fireEvent.click(inspectorButton("세로선으로 나누기"));
    expect(panelIds()).toHaveLength(4);
  });

  it("도구 선택·확대 배율이 상태로 표시된다", async () => {
    renderFlow();
    await reviewHeading();
    expect(button("선택·이동").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button("새 컷 그리기"));
    expect(button("새 컷 그리기").getAttribute("aria-pressed")).toBe("true");
    expect(button("선택·이동").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("이미지 위를 끌어 새 컷을 그려요.")).toBeTruthy();
    fireEvent.click(button("확대"));
    expect(screen.getByText("150%")).toBeTruthy();
    expect((button("축소") as HTMLButtonElement).disabled).toBe(false);
  });

  it("다시 찾는 동안에는 ‘컷 찾는 중’ 제목으로, 끝나면 새 확인 화면의 제목으로 포커스가 옮겨진다", async () => {
    const { detect, calls } = deferredDetect();
    renderFlow({ detect });
    await resolveNth(calls, 0, detectSample());
    const review = await reviewHeading();
    await waitFor(() => expect(document.activeElement).toBe(review));
    fireEvent.click(screen.getByRole("radio", { name: /넓은 여백만/ }));
    fireEvent.click(button("이 설정으로 다시 찾기"));
    // 다시 찾기 단추는 사라지므로 포커스는 진행 중 단계의 제목으로 가야 한다.
    const detecting = await screen.findByRole("heading", { name: "2. 컷 찾는 중" });
    expect(document.activeElement).toBe(detecting);
    await resolveNth(calls, 1, detectSample());
    const next = await reviewHeading();
    await waitFor(() => expect(document.activeElement).toBe(next));
  });

  it("고친 내용이 있으면 다시 찾기 전에 한 번 더 묻고, 설정을 바꿔 새로 찾는다", async () => {
    const { kit } = renderFlow();
    await reviewHeading();
    fireEvent.click(button("컷 1 삭제"));
    fireEvent.click(screen.getByRole("radio", { name: /넓은 여백만/ }));
    fireEvent.click(button("이 설정으로 다시 찾기"));
    expect(screen.getByText("고친 내용이 모두 사라져요. 계속할까요?")).toBeTruthy();
    fireEvent.click(button("취소"));
    expect(screen.queryByText("고친 내용이 모두 사라져요. 계속할까요?")).toBeNull();
    expect(panelIds()).toHaveLength(2);
    fireEvent.click(button("이 설정으로 다시 찾기"));
    fireEvent.click(button("다시 찾기"));
    await waitFor(() => expect(kit.detect).toHaveBeenCalledTimes(2));
    expect(kit.detect.mock.calls[1]?.[1]).toMatchObject({ sensitivity: "coarse", readingOrder: "webtoon" });
    await reviewHeading();
    await waitFor(() => expect(panelIds()).toHaveLength(3));
  });

  it("‘내용에 맞추기’는 늘려 놓은 컷을 그림 가장자리까지 다시 조인다", async () => {
    renderFlow();
    await reviewHeading();
    fireEvent.click(firstOf(listButtons()));
    const original = document.querySelector("[data-panel-id]")?.getAttribute("aria-label") ?? "";
    const where = (label: string): string => /위치 x \d+, y \d+, 크기 \d+×\d+ 픽셀/u.exec(label)?.[0] ?? "";
    // 오른쪽 여백(20px)을 포함하도록 너비를 늘린다. 맞추기는 컷 안에서 내용 가장자리까지 조이는 기능이라 늘려 놓은 쪽만 줄어든다.
    const width = screen.getByRole("spinbutton", { name: "1번 컷 너비 (픽셀)" });
    fireEvent.change(width, { target: { value: "200" } });
    fireEvent.blur(width);
    const widened = document.querySelector("[data-panel-id]")?.getAttribute("aria-label") ?? "";
    expect(where(widened)).not.toBe(where(original));
    fireEvent.click(button("내용에 맞추기"));
    await waitFor(() => expect(announcer()).toBe("컷을 내용에 맞췄어요."));
    expect(where(document.querySelector("[data-panel-id]")?.getAttribute("aria-label") ?? "")).toBe(where(original));
  });

  it("‘내용에 맞추기’를 기다리는 동안 컷을 옮기면 옛 위치가 아니라 옮긴 위치에서 맞추고, 옮긴 것을 덮어쓰지 않는다", async () => {
    const base = sampleReady(IMAGE);
    const pending: Array<() => void> = [];
    let reads = 0;
    // 첫 읽기(컷 감지)는 바로 끝내고, 이후 읽기(내용에 맞추기)는 시험이 풀어 줄 때까지 붙잡는다.
    const readRaster = (): Promise<PanelDetectRaster> => {
      const raster = IMAGE.raster();
      reads += 1;
      return reads === 1 ? Promise.resolve(raster) : new Promise<PanelDetectRaster>((resolve) => { pending.push(() => { resolve(raster); }); });
    };
    const kit = createKit({ image: IMAGE });
    renderWithEnv(<PanelReflowFlow ready={{ ...base, source: { ...base.source, readRaster } }} previewUrl="blob:preview" />, kit.env);
    await reviewHeading();
    fireEvent.click(firstOf(listButtons()));
    const numberInput = (name: string): HTMLInputElement => screen.getByRole("spinbutton", { name }) as HTMLInputElement;
    const edit = (name: string, value: string): void => { fireEvent.change(numberInput(name), { target: { value } }); fireEvent.blur(numberInput(name)); };
    const rectOf = (): { x: number; y: number; width: number; height: number } => {
      const match = /위치 x (\d+), y (\d+), 크기 (\d+)×(\d+) 픽셀/u.exec(document.querySelector("[data-panel-id]")?.getAttribute("aria-label") ?? "");
      if (!match) throw new Error("컷 이름표에서 위치와 크기를 읽지 못했어요.");
      return { x: Number(match[1]), y: Number(match[2]), width: Number(match[3]), height: Number(match[4]) };
    };

    // 오른쪽 여백(190~205)까지 컷을 늘린 뒤 맞추기를 누른다. 옆 컷의 그림(210~)은 건드리지 않는다.
    edit("1번 컷 너비 (픽셀)", "195");
    fireEvent.click(button("내용에 맞추기"));
    await waitFor(() => expect(pending).toHaveLength(1));
    // 맞추는 계산을 기다리는 사이에 사용자가 컷을 오른쪽으로 4px 옮긴다.
    edit("1번 컷 X (왼쪽) (픽셀)", "14");
    const moved = rectOf();
    expect(moved).toEqual({ x: 14, y: 10, width: 195, height: 220 });

    await act(async () => { pending[0]?.(); });
    await waitFor(() => expect(announcer()).toBe("컷을 내용에 맞췄어요."));
    const result = detectPanels(IMAGE.raster(), { readingOrder: "webtoon" });
    // 옛 위치(x=10)에서 맞춘 값으로 덮어쓰면 옮긴 위치가 사라진다. 옮긴 위치의 사각형을 내용에 맞춘 값이어야 한다.
    const expected = tightenRectToContent(IMAGE.raster(), result.gutter, moved);
    expect(expected).toEqual({ x: 14, y: 10, width: 176, height: 220 });
    expect(rectOf()).toEqual(expected);
  });

  it("‘내용에 맞추기’를 기다리는 동안 그 컷을 지우면 아무것도 되살리거나 바꾸지 않는다", async () => {
    const base = sampleReady(IMAGE);
    const pending: Array<() => void> = [];
    let reads = 0;
    const readRaster = (): Promise<PanelDetectRaster> => {
      const raster = IMAGE.raster();
      reads += 1;
      return reads === 1 ? Promise.resolve(raster) : new Promise<PanelDetectRaster>((resolve) => { pending.push(() => { resolve(raster); }); });
    };
    const kit = createKit({ image: IMAGE });
    renderWithEnv(<PanelReflowFlow ready={{ ...base, source: { ...base.source, readRaster } }} previewUrl="blob:preview" />, kit.env);
    await reviewHeading();
    fireEvent.click(firstOf(listButtons()));
    fireEvent.click(button("내용에 맞추기"));
    await waitFor(() => expect(pending).toHaveLength(1));
    fireEvent.click(button("컷 1 삭제"));
    expect(panelIds()).toHaveLength(2);
    await act(async () => { pending[0]?.(); });
    expect(panelIds()).toHaveLength(2);
    expect(announcer()).toBe("1번 컷을 삭제했어요.");
  });

  it("말풍선·효과음이 여백을 막은 컷은 경고와 분할 제안을 보여 주고, 제안을 눌러 둘로 나눌 수 있다", async () => {
    const page = new FixtureImage(1200, 1600, WHITE);
    page.art(40, 40, 1120, 700, { seed: 0 });
    page.art(40, 780, 1120, 780, { seed: 1 });
    page.fillRect(500, 745, 200, 30, INK);
    renderFlow({}, page);
    await reviewHeading();
    expect(panelIds()).toHaveLength(1);
    fireEvent.click(firstOf(listButtons()));
    expect(screen.getAllByText(/말풍선이나 효과음이 컷 사이를 가로막았을 수 있어요/).length).toBeGreaterThan(0);
    expect(screen.getByText("여기서 나뉘었을 수 있어요")).toBeTruthy();
    fireEvent.click(button("제안: 가로선(Y 760)에서 나누기"));
    expect(panelIds()).toHaveLength(2);
    expect(announcer()).toBe("컷을 둘로 나눴어요.");
    expect(screen.queryByText("여기서 나뉘었을 수 있어요")).toBeNull();
  });

  it("여백이 너무 얇아 합쳐진 컷은 경고와 낮춘 신뢰도를 보여 주고, 민감도를 '섬세'로 바꿔 다시 찾으면 둘로 나뉜다", async () => {
    const page = new FixtureImage(1200, 800, WHITE);
    page.art(40, 40, 560, 720, { seed: 0 });
    page.art(604, 40, 556, 720, { seed: 1 });
    const { kit } = renderFlow({}, page);
    await reviewHeading();
    expect(panelIds()).toHaveLength(1);
    expect(screen.getByText(/컷 1개 · 자동 감지 전체 신뢰도 (보통|낮음)\(\d+%\)/)).toBeTruthy();
    fireEvent.click(firstOf(listButtons()));
    expect(screen.getAllByText(/여러 컷이 한 컷으로 합쳐졌을 수 있어요/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("radio", { name: /섬세/ }));
    fireEvent.click(button("이 설정으로 다시 찾기"));
    await waitFor(() => expect(kit.detect).toHaveBeenCalledTimes(2));
    expect(kit.detect.mock.calls[1]?.[1]).toMatchObject({ sensitivity: "fine" });
    await reviewHeading();
    await waitFor(() => expect(panelIds()).toHaveLength(2));
    expect(screen.queryByText(/여러 컷이 한 컷으로 합쳐졌을 수 있어요/)).toBeNull();
  });

  it("컷이 없으면 다음 단계로 갈 수 없다", async () => {
    renderFlow();
    await reviewHeading();
    for (const label of ["컷 3 삭제", "컷 2 삭제", "컷 1 삭제"]) fireEvent.click(button(label));
    expect(panelIds()).toHaveLength(0);
    expect((button(/다음: 세로 재배열 설정/) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("컷이 하나 이상 있어야 다음으로 갈 수 있어요.")).toBeTruthy();
  });

  it("영문 화면에서는 제목과 안내가 영문이다", async () => {
    useI18n.getState().setLang("en");
    renderFlow();
    expect(await screen.findByRole("heading", { name: "2. Review and fix panels" })).toBeTruthy();
    expect(screen.getByText(/3 panel\(s\)/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete panel 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Next: vertical strip settings/ })).toBeTruthy();
  });
});
