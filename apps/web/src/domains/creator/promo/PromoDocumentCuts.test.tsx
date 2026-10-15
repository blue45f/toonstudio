// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emptyPromoProject } from "./promo-model";
import { PromoDocumentCuts } from "./PromoDocumentCuts";

import type { PromoPanel, PromoProject, PromoSeconds } from "./promo-model";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const PNG = "data:image/png;base64,aGVsbG8=";
interface CutJson { id: string; pageId: string; pageIndex: number; frameId: string; order: number; image: string; dialogues: Array<{ id: string; text: string }> }
function cutJson(index: number, dialogues: CutJson["dialogues"] = []): CutJson {
  const pageIndex = Math.floor(index / 2);
  return { id: `p${pageIndex}:f${index}`, pageId: `p${pageIndex}`, pageIndex, frameId: `f${index}`, order: index, image: PNG, dialogues };
}
function bundleFile(cuts: unknown[], extra: Record<string, unknown> = {}, name = "bundle.json"): File {
  return new File([JSON.stringify({ kind: "toonstudio-document-cuts", version: 1, documentId: "work-1", title: "별빛 아래", cuts, ...extra })], name, { type: "application/json" });
}
/** 대사 둘, 대사 없음, 대사 하나, 기호뿐인 대사. */
function fourCuts(): CutJson[] {
  return [
    cutJson(0, [{ id: "a1", text: "어서 와" }, { id: "a2", text: "오랜만이야" }]),
    cutJson(1),
    cutJson(2, [{ id: "c1", text: "정말?" }]),
    cutJson(3, [{ id: "d1", text: "!!!" }]),
  ];
}

const panel = (id: string): PromoPanel => ({ id, src: PNG, description: "", caption: `기존 ${id}`, motion: "still", fit: "contain", weight: 1 });
function projectOf(count = 0, seconds: PromoSeconds = 15): PromoProject {
  return { ...emptyPromoProject(), seconds, panels: Array.from({ length: count }, (_, index) => panel(`old-${index}`)) };
}

function renderCuts(project: PromoProject = projectOf(), disabled = false) {
  const onApply = vi.fn<(panels: PromoPanel[], summary: string) => void>();
  const view = render(<PromoDocumentCuts project={project} disabled={disabled} onApply={onApply} />);
  return { onApply, ...view };
}
function fileInput(): HTMLInputElement {
  const input = screen.getByLabelText("컷 묶음 JSON");
  if (!(input instanceof HTMLInputElement)) throw new Error("파일 입력이 아니에요.");
  return input;
}
async function loadFile(file: File) {
  fireEvent.change(fileInput(), { target: { files: [file] } });
  await waitFor(() => expect(screen.queryByText("컷 묶음을 읽고 검사하는 중이에요…")).toBeNull());
}
// 순서를 바꾸면 같은 읽기 순서 번호에 다른 페이지의 컷이 오므로 페이지 번호는 가리지 않는다.
const cutGroup = (order: number) => screen.getByRole("group", { name: new RegExp(`^읽기 순서 ${order} · 페이지 \\d+$`, "u") });
const includeBox = (order: number) => within(cutGroup(order)).getByRole("checkbox", { name: "이 컷을 샷으로 사용" }) as HTMLInputElement;
const captionBox = (order: number) => within(cutGroup(order)).getByLabelText("영상 자막") as HTMLInputElement;
const applyButton = () => screen.getByRole("button", { name: /^선택한 컷 \d+개 적용$/u });

describe("처음 상태", () => {
  it("Studio 내보내기 메뉴에서 받은 파일을 고르라고 안내하고, 이미지에서 컷을 찾지 않는다고 밝힌다", () => {
    renderCuts();
    expect(screen.getByRole("region", { name: "Studio 문서에서 컷 가져오기" })).toBeTruthy();
    expect(screen.getByText(/「홍보 쇼츠용 컷 묶음」으로 저장한 JSON/u)).toBeTruthy();
    expect(screen.getByText(/이미지에서 컷을 찾아 주지는 않고, 문서에 그려 둔 프레임만 가져와요/u)).toBeTruthy();
    expect(fileInput().accept).toContain(".json");
    expect(screen.queryByRole("button", { name: /적용/u })).toBeNull();
  });
});

describe("컷 묶음 읽기", () => {
  it("컷을 읽기 순서대로 샷 초안으로 보여 주고 첫 말풍선을 기본 자막으로 쓴다", async () => {
    renderCuts();
    await loadFile(bundleFile(fourCuts()));
    expect(screen.getByText("bundle.json · 컷 4개 · 문서 읽기 순서 · 별빛 아래")).toBeTruthy();
    expect(screen.getByText("선택 4 / 최대 12컷 · 15초 영상은 컷을 12개까지 담아요.")).toBeTruthy();
    expect(screen.getByText(/컷 이미지에는 말풍선이 그려진 채로 들어 있어요/u)).toBeTruthy();
    const list = screen.getByRole("list", { name: "샷 초안 목록" });
    expect(within(list).getAllByRole("group")).toHaveLength(4);
    expect([1, 2, 3, 4].map((order) => captionBox(order).value)).toEqual(["어서 와", "", "정말?", ""]);
    expect(screen.getByAltText("컷 1 미리보기 (페이지 1)")).toBeTruthy();
    expect(screen.getByAltText("컷 3 미리보기 (페이지 2)")).toBeTruthy();
    expect(within(cutGroup(1)).getByText("문서 말풍선 2개")).toBeTruthy();
    expect(within(cutGroup(2)).getByText(/이 컷에는 자막으로 쓸 말풍선 텍스트가 없어요/u)).toBeTruthy();
    expect(within(cutGroup(4)).getByText(/이 컷에는 자막으로 쓸 말풍선 텍스트가 없어요/u)).toBeTruthy();
    expect(applyButton().textContent).toBe("선택한 컷 4개 적용");
    // 컷이 아직 없는 프로젝트는 교체가 기본이고 "뒤에 추가"는 고를 수 없다.
    expect((screen.getByRole("radio", { name: "현재 컷 교체" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "현재 컷 뒤에 추가" }) as HTMLInputElement).disabled).toBe(true);
  });

  it("컷마다 자막 후보를 고르거나 직접 고칠 수 있고, 직접 고치면 후보와 달라진 것으로 표시한다", async () => {
    renderCuts();
    await loadFile(bundleFile(fourCuts()));
    const select = within(cutGroup(1)).getByLabelText("자막 후보") as HTMLSelectElement;
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "말풍선 1 · 어서 와", "말풍선 2 · 오랜만이야", "모든 말풍선 이어 붙이기 · 어서 와 오랜만이야",
    ]);
    fireEvent.change(select, { target: { value: "promo:all" } });
    expect(captionBox(1).value).toBe("어서 와 오랜만이야");
    expect(select.value).toBe("promo:all");
    fireEvent.change(captionBox(1), { target: { value: "내가 쓴 자막" } });
    expect(within(select).getAllByRole("option")[0]?.textContent).toBe("직접 입력한 자막");
    expect(select.value).toBe("");
    fireEvent.change(select, { target: { value: "a2" } });
    expect(captionBox(1).value).toBe("오랜만이야");
    expect(within(select).queryByRole("option", { name: "직접 입력한 자막" })).toBeNull();
  });

  it("컷을 빼면 자막 입력이 잠기고 적용 개수가 줄어든다", async () => {
    const { onApply } = renderCuts();
    await loadFile(bundleFile(fourCuts()));
    fireEvent.click(includeBox(2));
    expect(captionBox(2).disabled).toBe(true);
    expect(screen.getByText("선택 3 / 최대 12컷 · 15초 영상은 컷을 12개까지 담아요.")).toBeTruthy();
    expect(applyButton().textContent).toBe("선택한 컷 3개 적용");
    fireEvent.click(applyButton());
    expect(onApply.mock.calls[0]?.[0].map((value) => value.caption)).toEqual(["어서 와", "정말?", ""]);
  });

  it("앞으로·뒤로 버튼으로 순서를 바꾸고 맨 앞·맨 뒤 컷은 더 못 옮긴다", async () => {
    const { onApply } = renderCuts();
    await loadFile(bundleFile(fourCuts()));
    expect((screen.getByRole("button", { name: "컷 1 앞으로 이동" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "컷 4 뒤로 이동" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "컷 2 앞으로 이동" }));
    expect([1, 2, 3, 4].map((order) => captionBox(order).value)).toEqual(["", "어서 와", "정말?", ""]);
    expect(screen.getByAltText("컷 2 미리보기 (페이지 1)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "컷 2 뒤로 이동" }));
    expect([1, 2, 3, 4].map((order) => captionBox(order).value)).toEqual(["", "정말?", "어서 와", ""]);
    fireEvent.click(applyButton());
    expect(onApply.mock.calls[0]?.[0].map((value) => value.caption)).toEqual(["", "정말?", "어서 와", ""]);
  });
});

describe("컷 수 상한", () => {
  const eight = () => Array.from({ length: 8 }, (_, index) => cutJson(index, [{ id: `d${index}`, text: `대사 ${index}` }]));

  it("10초 영상은 6컷까지만 기본 선택하고 상한에 닿으면 나머지 선택을 막는다", async () => {
    renderCuts(projectOf(0, 10));
    await loadFile(bundleFile(eight()));
    expect(screen.getByText("선택 6 / 최대 6컷 · 10초 영상은 컷을 6개까지 담아요.")).toBeTruthy();
    expect(includeBox(6).checked).toBe(true);
    expect(includeBox(7).checked).toBe(false);
    expect(includeBox(7).disabled).toBe(true);
    expect(within(cutGroup(7)).getByText("상한에 도달했어요. 다른 컷을 해제하면 선택할 수 있어요.")).toBeTruthy();
    fireEvent.click(includeBox(1));
    expect(includeBox(7).disabled).toBe(false);
    fireEvent.click(includeBox(7));
    expect(screen.getByText("선택 6 / 최대 6컷 · 10초 영상은 컷을 6개까지 담아요.")).toBeTruthy();
    expect(includeBox(8).disabled).toBe(true);
  });

  it("뒤에 추가는 남은 자리만큼만 선택하고, 교체로 바꾸면 전체 상한을 쓴다", async () => {
    const { onApply } = renderCuts(projectOf(5, 10));
    await loadFile(bundleFile(eight()));
    expect((screen.getByRole("radio", { name: "현재 컷 뒤에 추가" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("선택 1 / 최대 1컷 · 10초 영상은 컷을 6개까지 담아요.")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "현재 컷 교체" }));
    expect(screen.getByText("선택 1 / 최대 6컷 · 10초 영상은 컷을 6개까지 담아요.")).toBeTruthy();
    fireEvent.click(includeBox(2));
    fireEvent.click(includeBox(3));
    fireEvent.click(applyButton());
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]).toHaveLength(3);
    expect(onApply.mock.calls[0]?.[0].some((value) => value.id.startsWith("old-"))).toBe(false);
  });

  it("뒤에 추가하면 기존 컷을 그대로 두고 뒤에 붙인다", async () => {
    const { onApply } = renderCuts(projectOf(2));
    await loadFile(bundleFile(fourCuts()));
    fireEvent.click(applyButton());
    const [panels, summary] = onApply.mock.calls[0] ?? [];
    expect(panels?.map((value) => value.caption)).toEqual(["기존 old-0", "기존 old-1", "어서 와", "", "정말?", ""]);
    expect(summary).toContain("컷 4개를 읽기 순서대로 뒤에 추가했어요");
  });

  it("교체하면 기존 컷을 모두 새 컷으로 바꾼다", async () => {
    const { onApply } = renderCuts(projectOf(2));
    await loadFile(bundleFile(fourCuts()));
    fireEvent.click(screen.getByRole("radio", { name: "현재 컷 교체" }));
    fireEvent.click(applyButton());
    const [panels, summary] = onApply.mock.calls[0] ?? [];
    expect(panels).toHaveLength(4);
    expect(panels?.every((value) => value.src === PNG && value.id.length > 0)).toBe(true);
    expect(summary).toContain("컷 4개를 읽기 순서대로 교체했어요");
    expect(summary).toContain("실행 취소로 되돌릴 수 있어요");
  });
});

describe("적용", () => {
  it("적용하면 화면을 처음 상태로 돌려 같은 묶음이 두 번 들어가지 않게 한다", async () => {
    const { onApply } = renderCuts();
    await loadFile(bundleFile(fourCuts()));
    fireEvent.click(applyButton());
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("list", { name: "샷 초안 목록" })).toBeNull();
    expect(screen.getByText(/아직 불러온 컷 묶음이 없어요/u)).toBeTruthy();
  });

  it("고른 컷이 없으면 적용할 수 없다", async () => {
    renderCuts();
    await loadFile(bundleFile([cutJson(0, [{ id: "a", text: "하나" }])]));
    fireEvent.click(includeBox(1));
    expect(applyButton().hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("선택 0 / 최대 12컷 · 15초 영상은 컷을 12개까지 담아요.")).toBeTruthy();
  });

  it("자막이 120자를 넘으면 적용하지 않고 이유를 알린다", async () => {
    const { onApply } = renderCuts();
    await loadFile(bundleFile([cutJson(0, [{ id: "a", text: "하나" }])]));
    fireEvent.change(captionBox(1), { target: { value: "가".repeat(121) } });
    fireEvent.click(applyButton());
    expect(screen.getByRole("alert").textContent).toContain("자막이 120자를 넘어요");
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.change(captionBox(1), { target: { value: "짧게" } });
    fireEvent.click(applyButton());
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("취소하면 불러온 묶음을 버리고 처음 상태로 돌아간다", async () => {
    const { onApply } = renderCuts();
    await loadFile(bundleFile(fourCuts()));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText(/아직 불러온 컷 묶음이 없어요/u)).toBeTruthy();
  });

  it("바깥에서 잠그면 입력과 버튼이 모두 잠긴다", async () => {
    const view = render(<PromoDocumentCuts project={projectOf()} disabled={false} onApply={vi.fn()} />);
    await loadFile(bundleFile(fourCuts()));
    view.rerender(<PromoDocumentCuts project={projectOf()} disabled onApply={vi.fn()} />);
    expect(fileInput().disabled).toBe(true);
    expect(includeBox(1).disabled).toBe(true);
    expect(captionBox(1).disabled).toBe(true);
    expect(applyButton().hasAttribute("disabled")).toBe(true);
    expect((screen.getByRole("button", { name: "컷 2 앞으로 이동" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("읽기 실패와 빈 묶음", () => {
  it("컷이 없는 묶음은 안내하고 닫을 수 있다", async () => {
    renderCuts();
    await loadFile(bundleFile([]));
    expect(screen.getByText(/이 묶음에는 컷이 없어요/u)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /적용/u })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.getByText(/아직 불러온 컷 묶음이 없어요/u)).toBeTruthy();
  });

  it("JSON이 아니면 이유와 함께 다시 시도·다른 파일 선택을 주고, 다시 시도하면 같은 파일을 다시 읽는다", async () => {
    renderCuts();
    const bad = new File(["{ 이건 JSON이 아니에요"], "bad.json", { type: "application/json" });
    const read = vi.spyOn(bad, "text");
    const pick = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);
    await loadFile(bad);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("JSON으로 읽을 수 없는 파일이에요");
    fireEvent.click(within(alert).getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    fireEvent.click(await within(await screen.findByRole("alert")).findByRole("button", { name: "다른 파일 선택" }));
    expect(pick).toHaveBeenCalled();
  });

  it("컷 묶음이 아닌 파일과 빈 파일은 거절한다", async () => {
    renderCuts();
    await loadFile(new File([JSON.stringify({ kind: "toonstudio-translation-drafts", version: 1, drafts: [] })], "drafts.json"));
    expect((await screen.findByRole("alert")).textContent).toContain("ToonStudio 컷 묶음 파일이 아니에요");
    await loadFile(new File([], "empty.json"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("빈 파일이에요"));
    await loadFile(bundleFile([cutJson(0)], { version: 2 }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("지원하지 않는 컷 묶음 버전"));
  });

  it("원격 주소 이미지가 든 묶음은 거절하고 이전에 불러온 초안을 지운다", async () => {
    renderCuts();
    await loadFile(bundleFile(fourCuts()));
    expect(screen.getByRole("list", { name: "샷 초안 목록" })).toBeTruthy();
    await loadFile(bundleFile([{ ...cutJson(0), image: "https://example.com/cut.png" }]));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByRole("list", { name: "샷 초안 목록" })).toBeNull();
  });

  it("읽는 동안에는 입력이 잠기고 진행 안내가 보인다", async () => {
    renderCuts();
    fireEvent.change(fileInput(), { target: { files: [bundleFile(fourCuts())] } });
    expect(screen.getByText("컷 묶음을 읽고 검사하는 중이에요…")).toBeTruthy();
    expect(fileInput().disabled).toBe(true);
    expect(screen.getByRole("region", { name: "Studio 문서에서 컷 가져오기" }).getAttribute("aria-busy")).toBe("true");
    await waitFor(() => expect(screen.queryByText("컷 묶음을 읽고 검사하는 중이에요…")).toBeNull());
    expect(fileInput().disabled).toBe(false);
  });
});
