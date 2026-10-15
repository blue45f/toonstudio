// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emptyPromoProject } from "./promo-model";
import { StudioPromoPage } from "./StudioPromoPage";

import type { PromoProject } from "./promo-model";

// 이 파일은 화면 연결(길이 선택·프리셋·문서 컷·로케일 출력)만 본다. 캔버스·음성·IndexedDB는 대신한다.
vi.mock("./promo-draft", async (original) => ({
  ...(await original<typeof import("./promo-draft")>()),
  usePromoDraft: () => ({ ready: true, status: "테스트 초안", dirty: false }),
}));
vi.mock("./PromoPreview", () => ({ PromoPreview: () => null }));
vi.mock("./PromoVoiceDirector", () => ({ PromoVoiceDirector: () => null }));

afterEach(cleanup);

const PNG = "data:image/png;base64,aGVsbG8=";
function projectFile(count: number, extra: Partial<PromoProject> = {}): File {
  const panels = Array.from({ length: count }, (_, index) => ({ id: `cut-${index}`, src: PNG, description: "", caption: `자막 ${index + 1}`, motion: "push-in", fit: "contain", weight: 1 }));
  return new File([JSON.stringify({ ...emptyPromoProject(), panels, ...extra })], "project.json", { type: "application/json" });
}
function cutBundleFile(count: number): File {
  const cuts = Array.from({ length: count }, (_, index) => ({
    id: `p0:f${index}`, pageId: "p0", pageIndex: 0, frameId: `f${index}`, order: index, image: PNG, dialogues: [{ id: `d${index}`, text: `대사 ${index + 1}` }],
  }));
  return new File([JSON.stringify({ kind: "toonstudio-document-cuts", version: 1, documentId: null, title: "", cuts })], "cuts.json", { type: "application/json" });
}

function renderPage() {
  render(<MemoryRouter><StudioPromoPage /></MemoryRouter>);
}
function secondsSelect(): HTMLSelectElement {
  const select = screen.getByLabelText("전체 길이");
  if (!(select instanceof HTMLSelectElement)) throw new Error("길이 선택이 아니에요.");
  return select;
}
async function importProject(file: File) {
  fireEvent.change(screen.getByLabelText("프로젝트 JSON 불러오기 (현재 구성 교체)"), { target: { files: [file] } });
  await screen.findByText(/프로젝트를 불러왔어요/u);
}
const optionTexts = (select: HTMLSelectElement) => within(select).getAllByRole("option").map((option) => option.textContent);

describe("길이 선택", () => {
  it("10/15/30/60초를 고르게 하고 10초에는 쇼츠 표시를 붙인다", () => {
    renderPage();
    expect(screen.getByText("10 / 15 / 30 / 60초")).toBeTruthy();
    expect(optionTexts(secondsSelect())).toEqual(["10초 · 틱톡·쇼츠", "15초", "30초", "60초"]);
    expect(secondsSelect().value).toBe("15");
    expect(screen.getByText("0 / 12컷")).toBeTruthy();
    expect(screen.getByText(/전체 길이에 마지막 2초 안내 카드가 포함돼요\. 컷은 최대 12개까지 담을 수 있어요\./u)).toBeTruthy();
  });

  it("10초로 바꾸면 컷 상한이 6개가 되고 본편 8초 + 엔딩 2초 규칙을 안내한다", () => {
    renderPage();
    fireEvent.change(secondsSelect(), { target: { value: "10" } });
    expect(secondsSelect().value).toBe("10");
    expect(screen.getByText("0 / 6컷")).toBeTruthy();
    expect(screen.getByText(/10초 쇼츠: 본편 8초 \+ 마지막 2초 안내 카드 · 컷은 최대 6개 · 컷마다 최소 0\.5초를 보장하고 1초 이상을 권장해요\./u)).toBeTruthy();
    expect(screen.getByText(/10초 길이로 바꿨어요\. 컷은 최대 6개예요/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: /10초 쇼츠 트레일러/u }).getAttribute("aria-describedby")).toBe("promo-short-preset-note");
    fireEvent.change(secondsSelect(), { target: { value: "30" } });
    expect(screen.getByText("0 / 12컷")).toBeTruthy();
  });

  it("컷이 7개 이상이면 10초를 고를 수 없고 이유를 알리며 컷은 그대로다", async () => {
    renderPage();
    await importProject(projectFile(7));
    expect(screen.getByText("7 / 12컷")).toBeTruthy();
    expect(optionTexts(secondsSelect())[0]).toBe("10초 · 틱톡·쇼츠 · 컷 6개까지");
    expect(within(secondsSelect()).getByRole("option", { name: /^10초/u }).hasAttribute("disabled")).toBe(true);
    const preset = screen.getByRole("button", { name: /10초 쇼츠 트레일러/u });
    expect(preset.hasAttribute("disabled")).toBe(true);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    fireEvent.change(secondsSelect(), { target: { value: "10" } });
    // 프리셋 옆 안내에 더해, 길이를 바꾸려 한 쪽에서도 같은 이유를 알린다.
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent).every((text) => text?.includes("컷은 지우지 않았어요"))).toBe(true);
    expect(secondsSelect().value).toBe("15");
    expect(screen.getByText("7 / 12컷")).toBeTruthy();
  });
});

describe("10초 쇼츠 트레일러 프리셋", () => {
  it("길이·비율·연출을 한 번에 맞추고 컷은 그대로 두며 실행 취소로 되돌린다", async () => {
    renderPage();
    await importProject(projectFile(3, { ratio: "16:9" }));
    fireEvent.click(screen.getByRole("button", { name: /10초 쇼츠 트레일러/u }));
    expect(secondsSelect().value).toBe("10");
    expect((screen.getByLabelText("화면 비율") as HTMLSelectElement).value).toBe("9:16");
    expect(screen.getByText("3 / 6컷")).toBeTruthy();
    expect(screen.getByText(/10초 쇼츠 프리셋을 적용했어요\. 길이 10초\(본편 8초 \+ 마지막 2초\), 세로 9:16, 하드 컷 전환으로 맞췄어요\./u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(secondsSelect().value).toBe("15");
    expect((screen.getByLabelText("화면 비율") as HTMLSelectElement).value).toBe("16:9");
    expect(screen.getByText("3 / 12컷")).toBeTruthy();
  });
});

describe("Studio 문서에서 컷 가져오기", () => {
  it("컷 카드 안에 붙어 있고, 적용하면 컷 목록이 바뀌며 실행 취소로 되돌릴 수 있다", async () => {
    renderPage();
    const section = screen.getByRole("region", { name: "Studio 문서에서 컷 가져오기" });
    expect(section.closest("[aria-labelledby='promo-cuts-title']")).toBeTruthy();
    fireEvent.change(within(section).getByLabelText("컷 묶음 JSON"), { target: { files: [cutBundleFile(2)] } });
    await within(section).findByRole("list", { name: "샷 초안 목록" });
    fireEvent.click(within(section).getByRole("button", { name: "선택한 컷 2개 적용" }));
    expect(screen.getByText("2 / 12컷")).toBeTruthy();
    expect(screen.getByText(/Studio 문서의 컷 2개를 읽기 순서대로 교체했어요/u)).toBeTruthy();
    expect(document.querySelectorAll(".promo-shot")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(screen.getByText("0 / 12컷")).toBeTruthy();
  });

  it("10초 프로젝트에서는 7컷 묶음 중 6컷만 기본 선택한다", async () => {
    renderPage();
    fireEvent.change(secondsSelect(), { target: { value: "10" } });
    const section = screen.getByRole("region", { name: "Studio 문서에서 컷 가져오기" });
    fireEvent.change(within(section).getByLabelText("컷 묶음 JSON"), { target: { files: [cutBundleFile(7)] } });
    await within(section).findByRole("list", { name: "샷 초안 목록" });
    expect(within(section).getByText("선택 6 / 최대 6컷 · 10초 영상은 컷을 6개까지 담아요.")).toBeTruthy();
    fireEvent.click(within(section).getByRole("button", { name: "선택한 컷 6개 적용" }));
    expect(screen.getByText("6 / 6컷")).toBeTruthy();
  });
});

describe("로케일별 자막 일괄 출력", () => {
  it("접혀 있는 동안에는 불러오지 않고, 펼치면 번역 초안 불러오기가 나타난다", async () => {
    renderPage();
    const summary = screen.getByText("로케일별 자막 일괄 출력 · 음성 미리듣기");
    const details = summary.closest("details");
    if (!details) throw new Error("details가 아니에요.");
    expect(details.open).toBe(false);
    expect(screen.queryByLabelText("번역 초안 JSON")).toBeNull();
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(await screen.findByLabelText("번역 초안 JSON")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "로케일별 자막 일괄 출력 · 음성 미리듣기" })).toBeTruthy();
    details.open = false;
    fireEvent(details, new Event("toggle"));
    await waitFor(() => expect(screen.queryByLabelText("번역 초안 JSON")).toBeNull());
  });
});
