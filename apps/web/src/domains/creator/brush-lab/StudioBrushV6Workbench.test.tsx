// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseBrushStudioV6Import } from "./brush-studio-v6-experiments";
import { serializeBrushStudioV6Authoring } from "./brush-studio-v6-authoring-document";
import { StudioBrushV6Workbench } from "./StudioBrushV6Workbench";
import { createBrushStudioV6Program, type BrushStudioV6Program } from "./brush-studio-v6-engine";

const { preview, save, downloadSource } = vi.hoisted(() => ({ preview: vi.fn(), save: vi.fn(), downloadSource: vi.fn() }));

vi.mock("./brush-studio-source-download", () => ({ downloadBrushStudioSource: downloadSource }));

vi.mock("./brush-studio-v6-preview", () => ({
  renderBrushStudioV6Preview: preview,
  attachBrushStudioV6LivePreview: () => ({ clear: vi.fn(), destroy: vi.fn() }),
}));

vi.mock("./brush-studio-v6-product-bridge", () => ({
  saveBrushStudioV6ProductBrush: save,
  brushStudioV6ProductBrushHref: (id: string) => `/studio?materialBrush=${id}`,
}));

vi.mock("./brush-studio-v6-engine", async (importOriginal) => ({
  ...await importOriginal<typeof import("./brush-studio-v6-engine")>(),
  detectBrushStudioV6Capabilities: () => ({
    webgpu: true, wasm: true, webgl2: true, sharedArrayBuffer: true,
    pointerRawUpdate: true, coalescedEvents: true, predictedEvents: true,
    pressure: true, tilt: true, twist: true, hover: true,
    maxTextureDimension2D: 8192, memoryBudgetMb: 1024,
  }),
}));

beforeEach(() => {
  localStorage.clear();
  preview.mockClear();
  save.mockReset();
  downloadSource.mockReset();
});
afterEach(cleanup);

const stored = (): BrushStudioV6Program => parseBrushStudioV6Import(localStorage.getItem("toonstudio.brush-program-v6:test")!);

describe("V6 brush experiments in the workbench", () => {
  it("starts with result-focused controls and reveals engine internals only on request", () => {
    render(<StudioBrushV6Workbench scope="test" />);
    expect(screen.getByRole("button", { name: "재료·질감" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "엔진 조합" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "전문가 설정" }));
    expect(screen.getByRole("button", { name: "엔진 조합" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "호환성·성능" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "기본 편집" }));
    expect(screen.queryByRole("button", { name: "엔진 조합" })).toBeNull();
  });
  it("offers one truthful output authority and explains preserved imported alternatives", () => {
    const original = createBrushStudioV6Program("oil-hair-mixer");
    localStorage.setItem("toonstudio.brush-program-v6:test", JSON.stringify({ ...original, slots: { ...original.slots, output: "output-raster-tiles" } }));
    render(<StudioBrushV6Workbench scope="test" />);
    fireEvent.click(screen.getByRole("button", { name: "전문가 설정" }));
    fireEvent.click(screen.getByRole("button", { name: "엔진 조합" }));
    const select = screen.getByLabelText("출력 권위") as HTMLSelectElement;
    expect(select.value).toBe("output-raster-tiles");
    expect([...select.options].filter((option) => !option.disabled).map((option) => option.value)).toEqual(["output-contact-canvas-svg"]);
    expect(screen.getByText(/가져온 다른 출력 선택은 설계 기록으로 보관하며 실제 출력은 이 공통 경로/u)).toBeTruthy();
    fireEvent.change(select, { target: { value: "output-contact-canvas-svg" } });
    expect(stored().slots.output).toBe("output-contact-canvas-svg");
  });

  it.each([
    ["impasto-knife", true, "강모 조합에서만 적용 · 현재 재료에서는 사용하지 않음"],
    ["oil-hair-mixer", false, "공통 재료 계산기에 네이티브 연결됨"],
  ] as const)("describes retained reservoir pickup according to the %s material", (recipe, inactive, status) => {
    const original = createBrushStudioV6Program(recipe);
    localStorage.setItem("toonstudio.brush-program-v6:test", JSON.stringify(original));
    render(<StudioBrushV6Workbench scope="test" />);
    fireEvent.click(screen.getByRole("button", { name: "전문가 설정" }));
    fireEvent.click(screen.getByRole("button", { name: "엔진 조합" }));
    const pickup = screen.getByLabelText("픽업") as HTMLSelectElement;
    expect(pickup.value).toBe("pickup-pigment-reservoir");
    const card = pickup.closest("div.rounded-xl") as HTMLElement;
    expect(within(card).getByText(status)).toBeTruthy();
    expect(within(card).getByText(/강모 조합에서만 CPU 안료 저장량 보충/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "재료·질감" }));
    expect((screen.getByRole("slider", { name: /안료 보충·혼합/u }) as HTMLInputElement).disabled).toBe(inactive);
    expect(stored().slots.pickup).toBe(original.slots.pickup);
    expect(stored().tuning.pickup).toBe(original.tuning.pickup);
  });

  it("disables pickup and secondary pigment for a no-pickup bristle graph", () => {
    localStorage.setItem("toonstudio.brush-program-v6:test", JSON.stringify(createBrushStudioV6Program("oil-hair-mixer")));
    render(<StudioBrushV6Workbench scope="test" />);
    fireEvent.click(screen.getByRole("button", { name: "전문가 설정" }));
    fireEvent.click(screen.getByRole("button", { name: "엔진 조합" }));
    fireEvent.change(screen.getByLabelText("픽업"), { target: { value: "pickup-none" } });
    fireEvent.click(screen.getByRole("button", { name: "재료·질감" }));
    expect((screen.getByRole("slider", { name: /안료 보충·혼합/u }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("혼합·패턴 색", { exact: false }) as HTMLInputElement).disabled).toBe(true);
    expect(stored().tuning.pickup).toBe(0.62);
  });

  it("disables the secondary color when the contact engine uses only primary pigment", () => {
    render(<StudioBrushV6Workbench scope="test" />);
    fireEvent.click(screen.getByRole("button", { name: "재료·질감" }));
    const input = screen.getByLabelText("혼합·패턴 색", { exact: false }) as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.getAttribute("aria-describedby")).toBe("brush-v6-secondary-inactive");
    expect(document.getElementById("brush-v6-secondary-inactive")?.textContent).toBe("현재 재료 조합에서 사용하지 않음");
  });

  it("disables the unimplemented finger-water policy and explains imported legacy values", () => {
    const program = createBrushStudioV6Program("mineral-bloom");
    localStorage.setItem("toonstudio.brush-program-v6:test", JSON.stringify({
      ...program, input: { ...program.input, touchPolicy: "pen-ink-finger-water" },
    }));
    render(<StudioBrushV6Workbench scope="test" />);
    fireEvent.click(screen.getByRole("button", { name: "입력·필압" }));
    const unsupported = screen.getByRole("option", { name: "손가락 물붓 · 미지원" }) as HTMLOptionElement;
    expect(unsupported.disabled).toBe(true);
    expect(screen.getByText(/손가락 물붓은 현재 미지원/u)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("터치 정책"), { target: { value: "touch-draw" } });
    expect(stored().input.touchPolicy).toBe("touch-draw");
  });

  it("pins a full reference, applies a controlled sample, restores it and undoes the restore", () => {
    render(<StudioBrushV6Workbench scope="test" />);
    fireEvent.click(screen.getByRole("button", { name: "비교·실험" }));
    fireEvent.click(screen.getByRole("button", { name: "현재를 기준으로 고정" }));
    const initial = stored();
    fireEvent.click(screen.getByRole("button", { name: "낮게 적용" }));
    const candidate = stored();
    expect(candidate.tuning.flow).toBeLessThan(initial.tuning.flow);
    expect(candidate.seed).toBe(initial.seed);
    expect(candidate.slots).toEqual(initial.slots);
    expect(screen.getByText("기준에서 바뀐 설정 1개")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "기준 설정 복원" }));
    expect(stored()).toEqual(initial);
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(stored()).toEqual(candidate);
    expect(preview.mock.calls.some(([, program]) => program.tuning.flow === candidate.tuning.flow)).toBe(true);
  });

  it("groups continuous slider events but keeps the next gesture separately undoable", () => {
    render(<StudioBrushV6Workbench scope="test" />);
    fireEvent.click(screen.getByRole("button", { name: "재료·질감" }));
    const slider = screen.getByRole("slider", { name: /도포 유량/u });
    const initial = stored().tuning.flow;
    fireEvent.change(slider, { target: { value: "0.2" } });
    fireEvent.change(slider, { target: { value: "0.3" } });
    fireEvent.pointerUp(slider);
    fireEvent.change(slider, { target: { value: "0.6" } });
    fireEvent.pointerUp(slider);
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(stored().tuning.flow).toBe(0.3);
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(stored().tuning.flow).toBe(initial);
    fireEvent.click(screen.getByRole("button", { name: "다시 실행" }));
    expect(stored().tuning.flow).toBe(0.3);
  });

  it("컬러 피커 드래그 시 primaryColor와 secondaryColor 변경을 단일 실행 취소 그룹으로 묶는다", () => {
    localStorage.setItem("toonstudio.brush-program-v6:test", JSON.stringify(createBrushStudioV6Program("mineral-bloom")));
    render(<StudioBrushV6Workbench scope="test" />);
    fireEvent.click(screen.getByRole("button", { name: "재료·질감" }));
    const initialPrimary = stored().tuning.primaryColor;
    const initialSecondary = stored().tuning.secondaryColor;
    const primaryInput = screen.getByLabelText("기본 색");
    const secondaryInput = screen.getByLabelText("혼합·패턴 색");

    fireEvent.change(primaryInput, { target: { value: "#112233" } });
    fireEvent.change(primaryInput, { target: { value: "#223344" } });
    fireEvent.change(primaryInput, { target: { value: "#334455" } });
    expect(stored().tuning.primaryColor).toBe("#334455");

    fireEvent.change(secondaryInput, { target: { value: "#aa1122" } });
    fireEvent.change(secondaryInput, { target: { value: "#bb2233" } });
    expect(stored().tuning.secondaryColor).toBe("#bb2233");

    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(stored().tuning.secondaryColor).toBe(initialSecondary);
    expect(stored().tuning.primaryColor).toBe("#334455");

    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(stored().tuning.primaryColor).toBe(initialPrimary);
  });

  it("only offers physically active experiment fields when changing materials", () => {
    localStorage.setItem("toonstudio.brush-program-v6:test", JSON.stringify(createBrushStudioV6Program("oil-hair-mixer")));
    render(<StudioBrushV6Workbench scope="test" />);
    fireEvent.click(screen.getByRole("button", { name: "비교·실험" }));
    const select = screen.getByLabelText("비교할 속성");
    expect([...select.querySelectorAll("option")].map((option) => option.value)).toContain("bristleStrands");
    expect([...select.querySelectorAll("option")].map((option) => option.value)).not.toContain("wetness");
    fireEvent.change(select, { target: { value: "bristleStrands" } });
    expect(screen.getByRole("img", { name: "강모 수 낮게 비교 획" })).toBeTruthy();
  });

  it("allows clearing and typing a precise number without resetting the brush mid-entry", () => {
    render(<StudioBrushV6Workbench scope="test" />);
    fireEvent.click(screen.getByRole("button", { name: "재료·질감" }));
    const numeric = screen.getByRole("spinbutton", { name: "도포 유량 직접 입력" });
    const before = stored().tuning.flow;
    fireEvent.change(numeric, { target: { value: "" } });
    fireEvent.change(numeric, { target: { value: "0" } });
    expect(stored().tuning.flow).toBe(before);
    fireEvent.change(numeric, { target: { value: "0.37" } });
    fireEvent.blur(numeric);
    expect(stored().tuning.flow).toBe(0.37);
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(stored().tuning.flow).toBe(before);
  });

  it("preserves native text undo and scopes brush keyboard undo to the workbench", () => {
    render(<StudioBrushV6Workbench scope="test" />);
    const name = screen.getByRole("textbox", { name: "브러시 이름" });
    const initial = stored().name;
    fireEvent.change(name, { target: { value: "새 질감" } });
    fireEvent.keyDown(name, { key: "z", metaKey: true });
    expect(stored().name).toBe("새 질감");
    const undo = screen.getByRole("button", { name: "실행 취소" });
    fireEvent.keyDown(undo, { key: "z", metaKey: true });
    expect(stored().name).toBe(initial);
    fireEvent.keyDown(undo, { key: "z", metaKey: true, shiftKey: true });
    expect(stored().name).toBe("새 질감");
  });

  it("offers the Studio link only after successful library save and retains edits on failure", async () => {
    save.mockRejectedValueOnce(new Error("저장소 연결 실패"));
    render(<StudioBrushV6Workbench scope="test" />);
    const before = stored();
    fireEvent.click(screen.getByRole("button", { name: "브러시로 저장" }));
    expect(await screen.findByText("브러시 저장 실패: 저장소 연결 실패")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "원고에서 사용하기" })).toBeNull();
    expect(stored()).toEqual(before);
    save.mockResolvedValueOnce({ id: "saved-physical-brush", name: "테스트 브러시" });
    fireEvent.click(screen.getByRole("button", { name: "브러시로 저장" }));
    expect((await screen.findByRole("link", { name: "원고에서 사용하기" })).getAttribute("href"))
      .toBe("/studio?materialBrush=saved-physical-brush");
    expect(save).toHaveBeenLastCalledWith(before);
  });

  it("does not publish an old save receipt after the recipe changes while SQLite is writing", async () => {
    let resolveSave!: (saved: { id: string; name: string }) => void;
    save.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve; }));
    render(<StudioBrushV6Workbench scope="test" />);
    const captured = stored();
    fireEvent.click(screen.getByRole("button", { name: "브러시로 저장" }));
    fireEvent.change(screen.getByRole("textbox", { name: "브러시 이름" }), {
      target: { value: "저장 중 새 브러시" },
    });
    fireEvent.click(screen.getByRole("button", { name: "재료·질감" }));
    fireEvent.change(screen.getByRole("slider", { name: /도포 유량/u }), { target: { value: "0.23" } });
    await act(async () => { resolveSave({ id: "old-recipe", name: captured.name }); });
    expect(save).toHaveBeenCalledWith(captured);
    expect(screen.queryByRole("link", { name: "원고에서 사용하기" })).toBeNull();
    expect(screen.queryByText(/라이브러리에 저장하고 다시 읽어 확인했습니다/u)).toBeNull();
    expect(stored()).toMatchObject({ name: "저장 중 새 브러시", tuning: { flow: 0.23 } });
    expect((screen.getByRole("button", { name: "브러시로 저장" }) as HTMLButtonElement).disabled).toBe(false);
    save.mockResolvedValueOnce({ id: "current-recipe", name: "저장 중 새 브러시" });
    fireEvent.click(screen.getByRole("button", { name: "브러시로 저장" }));
    expect((await screen.findByRole("link", { name: "원고에서 사용하기" })).getAttribute("href"))
      .toBe("/studio?materialBrush=current-recipe");
  });

  it.each(["button", "keyboard"])("invalidates an in-flight save when %s undo restores an earlier program", async (source) => {
    let resolveSave!: (saved: { id: string; name: string }) => void;
    save.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve; }));
    render(<StudioBrushV6Workbench scope="test" />);
    const initial = stored();
    fireEvent.change(screen.getByRole("textbox", { name: "브러시 이름" }), { target: { value: "저장 대상" } });
    fireEvent.click(screen.getByRole("button", { name: "브러시로 저장" }));
    const undo = screen.getByRole("button", { name: "실행 취소" });
    if (source === "button") fireEvent.click(undo);
    else fireEvent.keyDown(undo, { key: "z", metaKey: true });
    await act(async () => { resolveSave({ id: "undone-recipe", name: "저장 대상" }); });
    expect(stored()).toEqual(initial);
    expect(screen.queryByRole("link", { name: "원고에서 사용하기" })).toBeNull();
  });
  it("selects a physical recipe, exposes its real controls and blocks unrelated engines", () => {
    render(<StudioBrushV6Workbench scope="test" />);
    fireEvent.click(screen.getByRole("button", { name: /^중력 분사/u }));
    expect(stored().slots.carrier).toBe("carrier-cpu-ballistic-spray-v1");
    fireEvent.click(screen.getByRole("button", { name: "전문가 설정" }));
    fireEvent.click(screen.getByRole("button", { name: "엔진 조합" }));
    fireEvent.change(screen.getByRole("slider", { name: /중력 방향·강도/u }), { target: { value: "-0.5" } });
    expect(stored().tuning.gravity).toBe(-0.5);
    const pattern = screen.getByLabelText("패턴") as HTMLSelectElement;
    expect([...pattern.options].filter((option) => !option.disabled).map((option) => option.value)).toEqual(["pattern-none"]);
    fireEvent.click(screen.getByRole("button", { name: "물리" }));
    const bristle = screen.getByRole("button", { name: /Bristle Dynamics/u }) as HTMLButtonElement;
    expect(bristle.disabled).toBe(true);
  });

  it("이전 Mixbox 브러시에서 자체 안료의 실행 정보와 호환 어댑터를 표시한다", () => {
    localStorage.setItem(
      "toonstudio.brush-program-v6:test",
      // 이전 레시피 식별자와 다른 어댑터 설정은 유지하고 안료 실행 정보는 자체 엔진을 표시한다.
      serializeBrushStudioV6Authoring({ ...createBrushStudioV6Program("mixbox-oil-bristle"), licenseProfile: "noncommercial-full" }),
    );
    render(<StudioBrushV6Workbench scope="test" />);
    fireEvent.click(screen.getByRole("button", { name: "전문가 설정" }));
    fireEvent.click(screen.getByRole("button", { name: "호환성·성능" }));
    const plan = screen.getByRole("region", { name: "무폴백 브러시 엔진 바인딩" });
    expect(within(plan).getByText(/fallback none/u)).toBeTruthy();
    expect(within(plan).getByText("ToonStudio Latent Pigment")).toBeTruthy();
    expect(within(plan).queryByText("Mixbox")).toBeNull();
    expect(within(plan).queryByText("mixbox-js-v2@2.0.0")).toBeNull();
    expect(within(plan).getAllByText("명시적 호환 어댑터").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "재료·질감" }));
    expect(screen.getByRole("note").textContent).toContain("이전 Mixbox 브러시는 자체 잠재 안료로 혼색");
  });

  it("disables product save when a selected engine has no exact product path", () => {
    const base = createBrushStudioV6Program("clean-ink");
    localStorage.setItem(
      "toonstudio.brush-program-v6:test",
      JSON.stringify({ ...base, slots: { ...base.slots, pigment: "pigment-painter-lut" } }),
    );
    render(<StudioBrushV6Workbench scope="test" />);
    const button = screen.getByRole("button", { name: "브러시로 저장" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "전문가 설정" }));
    fireEvent.click(screen.getByRole("button", { name: "호환성·성능" }));
    expect(screen.getByRole("alert").textContent).toContain("Pigment Painter LUT");
  });

  it("접힌 진단을 열지 않아도 저장 차단 원인을 알리고 허용 레시피로 바꾸면 해제한다", () => {
    render(<StudioBrushV6Workbench scope="test" />);
    fireEvent.change(screen.getByRole("searchbox", { name: "브러시 레시피 검색" }), { target: { value: "mixbox-palette-knife" } });
    fireEvent.click(screen.getByRole("button", { name: /^자체 안료 팔레트 나이프/u }));
    const status = screen.getByRole("status");
    const reason = "Normal-mapped Tip 무폴백 실행 불가";
    expect(within(status).getByText(reason)).toBeTruthy();
    expect(status.textContent).toContain("자체 안료 팔레트 나이프 레시피를 불러왔습니다.");
    expect(status.closest("details")).toBeNull();
    const diagnostics = screen.getByText("진단·비교 정보").closest("details");
    expect(diagnostics?.open).toBe(false);
    const button = screen.getByRole("button", { name: "브러시로 저장" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(save).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^시작 레시피 \d+$/u }));
    fireEvent.change(screen.getByRole("searchbox", { name: "브러시 레시피 검색" }), { target: { value: "mixbox-pigment-spray" } });
    fireEvent.click(screen.getByRole("button", { name: /^자체 잠재 안료 스프레이/u }));
    expect(within(status).queryByText(reason)).toBeNull();
    expect(status.textContent).toContain("자체 잠재 안료 스프레이 레시피를 불러왔습니다.");
    expect(button.disabled).toBe(false);
    expect(diagnostics?.open).toBe(false);
  });

  it("preserves an unsupported execution-bound draft instead of autosaving defaults", () => {
    const document = JSON.parse(serializeBrushStudioV6Authoring(createBrushStudioV6Program()));
    document.materialReceipt.runtime.bindings[0].version = "unsupported-future";
    const raw = JSON.stringify(document);
    localStorage.setItem("toonstudio.brush-program-v6:test", raw);
    render(<StudioBrushV6Workbench scope="test" />);
    expect(screen.getByRole("alert").textContent).toContain("원본을 변경하지 않고 보존");
    expect(screen.queryByRole("button", { name: "브러시로 저장" })).toBeNull();
    expect(localStorage.getItem("toonstudio.brush-program-v6:test")).toBe(raw);
    expect(preview).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("restores zero flow and its receipt after closing and reopening the editor", () => {
    const view = render(<StudioBrushV6Workbench scope="test" />);
    fireEvent.click(screen.getByRole("button", { name: "재료·질감" }));
    fireEvent.change(screen.getByRole("slider", { name: /도포 유량/u }), { target: { value: "0" } });
    const before = stored();
    expect(before.tuning.flow).toBe(0);
    expect(JSON.parse(localStorage.getItem("toonstudio.brush-program-v6:test")!).materialReceipt.tuning.flow).toBe(0);
    view.unmount();
    render(<StudioBrushV6Workbench scope="test" />);
    expect(stored()).toEqual(before);
  });

  it("이전 Mixbox 실행 파일은 원문을 보존하고 명시적으로 선택한 뒤 자체 안료로 가져온다", async () => {
    const program = { ...createBrushStudioV6Program("mixbox-oil-bristle"), licenseProfile: "noncommercial-full" as const };
    const source = JSON.parse(serializeBrushStudioV6Authoring(program)) as {
      materialReceipt: { runtime: { bindings: readonly { readonly nodeIds: readonly string[] }[] } };
    };
    source.materialReceipt.runtime.bindings = source.materialReceipt.runtime.bindings.map((binding) =>
      binding.nodeIds.includes("pigment-mixbox") ? { ...binding,
        providerId: "mixbox-js-v2", version: "2.0.0", license: "CC-BY-NC-4.0", rights: "noncommercial",
        execution: "native", nodeIds: ["pigment-mixbox"],
      } : binding);
    const original = JSON.stringify(source);
    const view = render(<StudioBrushV6Workbench scope="test" />);
    const before = localStorage.getItem("toonstudio.brush-program-v6:test");
    await act(async () => {
      fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [{
        name: "original.brush.json", size: original.length, text: async () => original,
      }] } });
    });
    const migration = screen.getByRole("region", { name: "이전 안료 브러시 가져오기" });
    expect(localStorage.getItem("toonstudio.brush-program-v6:test")).toBe(before);
    expect(migration.textContent).toContain("색 결과가 달라질 수 있습니다");
    fireEvent.click(within(migration).getByRole("button", { name: "원본 파일 내려받기" }));
    expect(downloadSource).toHaveBeenCalledExactlyOnceWith(original, "original.brush.json");
    fireEvent.click(within(migration).getByRole("button", { name: "자체 안료로 가져오기" }));
    expect(stored().id).toBe("mixbox-oil-bristle");
    expect(stored().slots.pigment).toBe("pigment-mixbox");
    const current = JSON.parse(localStorage.getItem("toonstudio.brush-program-v6:test")!) as {
      materialReceipt: { runtime: { bindings: readonly { readonly providerId: string }[] } };
    };
    expect(current.materialReceipt.runtime.bindings.some((binding) => binding.providerId === "toonstudio-latent-pigment-v1")).toBe(true);
    expect(current.materialReceipt.runtime.bindings.some((binding) => binding.providerId === "mixbox-js-v2")).toBe(false);
    expect(screen.queryByRole("region", { name: "이전 안료 브러시 가져오기" })).toBeNull();
  });

  it("실행 기록 없는 Mixbox 설정 파일도 색 변화 안내와 원본 보관 뒤 명시적으로 가져온다", async () => {
    const base = createBrushStudioV6Program();
    const program = { ...base, slots: { ...base.slots, pigment: "pigment-mixbox" } };
    const original = JSON.stringify({ program }, null, 2);
    const view = render(<StudioBrushV6Workbench scope="test" />);
    const before = localStorage.getItem("toonstudio.brush-program-v6:test");
    await act(async () => {
      fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [{
        name: "settings.brush.json", size: original.length, text: async () => original,
      }] } });
    });
    const migration = screen.getByRole("region", { name: "이전 안료 브러시 가져오기" });
    expect(migration.textContent).toContain("색 결과가 달라질 수 있습니다");
    expect(localStorage.getItem("toonstudio.brush-program-v6:test")).toBe(before);
    fireEvent.click(within(migration).getByRole("button", { name: "원본 파일 내려받기" }));
    expect(downloadSource).toHaveBeenCalledExactlyOnceWith(original, "settings.brush.json");
    fireEvent.click(within(migration).getByRole("button", { name: "자체 안료로 가져오기" }));
    expect(stored()).toEqual(program);
    const current = JSON.parse(localStorage.getItem("toonstudio.brush-program-v6:test")!) as {
      materialReceipt: { runtime: { bindings: readonly { readonly providerId: string }[] } };
    };
    expect(current.materialReceipt.runtime.bindings.some((binding) => binding.providerId === "toonstudio-latent-pigment-v1")).toBe(true);
    expect(current.materialReceipt.runtime.bindings.some((binding) => binding.providerId === "mixbox-js-v2")).toBe(false);
  });

  it("ignores an imported file that resolves after a newer user edit", async () => {
    let resolveText!: (text: string) => void;
    const view = render(<StudioBrushV6Workbench scope="test" />);
    const file = { name: "old.brush.json", size: 123,
      text: () => new Promise<string>((resolve) => { resolveText = resolve; }) };
    const input = view.container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.change(screen.getByRole("textbox", { name: "브러시 이름" }), { target: { value: "새 작업 유지" } });
    await act(async () => { resolveText(serializeBrushStudioV6Authoring(createBrushStudioV6Program("mineral-bloom"))); });
    expect(stored().name).toBe("새 작업 유지");
    expect(stored().id).toBe("clean-ink");
  });

  it("does not overwrite the new scope when an old file load completes", async () => {
    let resolveText!: (text: string) => void;
    const view = render(<StudioBrushV6Workbench scope="test" />);
    fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [{
      name: "old.brush.json", size: 123, text: () => new Promise<string>((resolve) => { resolveText = resolve; }),
    }] } });
    view.rerender(<StudioBrushV6Workbench scope="another" />);
    const before = localStorage.getItem("toonstudio.brush-program-v6:another");
    await act(async () => { resolveText(serializeBrushStudioV6Authoring(createBrushStudioV6Program("mineral-bloom"))); });
    expect(localStorage.getItem("toonstudio.brush-program-v6:another")).toBe(before);
  });

  it("renders the live CSP 2x benchmark scorecard card with internalized engine badges", () => {
    render(<StudioBrushV6Workbench scope="test" />);
    expect(screen.getByText("클립스튜디오(CSP) 대비 2× 벤치마크")).toBeTruthy();
    expect(screen.getByText("2.0x 목표 달성")).toBeTruthy();
    expect(screen.getByText(/7채널 잠재 안료 \+ Kubelka-Munk/u)).toBeTruthy();

    const openCspDockBtn = screen.getByRole("button", {
      name: "클립스튜디오 5.1.5 통합 UI/UX 도크 열기 (6탭 전체)",
    });
    expect(openCspDockBtn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(openCspDockBtn);
    expect(
      screen.getByRole("heading", {
        name: /클립스튜디오 5\.1\.5 통합 UI\/UX 도크/,
      }),
    ).toBeTruthy();
  });

  it("슬라이더 드래그 중 수식키(Shift)를 떼어도 실행 취소 그룹이 분리되지 않고, 색상 피커 연속 변경도 하나의 실행 취소 단계로 묶인다", () => {
    render(<StudioBrushV6Workbench scope="test" />);
    fireEvent.click(screen.getByRole("button", { name: "재료·질감" }));
    const slider = screen.getByRole("slider", { name: /도포 유량/u });
    const initialFlow = stored().tuning.flow;
    fireEvent.change(slider, { target: { value: "0.25" } });
    fireEvent.keyUp(slider, { key: "Shift" });
    fireEvent.change(slider, { target: { value: "0.45" } });
    fireEvent.pointerUp(slider);
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(stored().tuning.flow).toBe(initialFlow);

    const primaryColor = screen.getByLabelText("기본 색") as HTMLInputElement;
    const initialColor = stored().tuning.primaryColor;
    fireEvent.change(primaryColor, { target: { value: "#112233" } });
    fireEvent.change(primaryColor, { target: { value: "#445566" } });
    fireEvent.pointerUp(primaryColor);
    expect(stored().tuning.primaryColor).toBe("#445566");
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(stored().tuning.primaryColor).toBe(initialColor);
  });

  it("동일 레시피를 다시 선택하면 변경된 슬라이더 값이 레시피 초기값으로 복원되고, 상단 WGSL 커널·스타일러스 이벤트가 실제 브러시 설정에 반영된다", () => {
    render(<StudioBrushV6Workbench scope="test" />);
    fireEvent.click(screen.getByRole("button", { name: "재료·질감" }));
    fireEvent.change(screen.getByRole("slider", { name: /도포 유량/u }), { target: { value: "0.19" } });
    expect(stored().tuning.flow).toBe(0.19);
    fireEvent.click(screen.getByRole("button", { name: /^시작 레시피/u }));
    fireEvent.click(screen.getByRole("button", { name: /클린 잉크/u }));
    expect(stored().tuning.flow).toBe(createBrushStudioV6Program("clean-ink").tuning.flow);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("toonspectrum:brush-lab-rea-preset", {
          detail: { kernelMode: "rebelle-wet-pigment", stylusCurve: "heavy-chisel-tilt" },
        }),
      );
    });
    expect(stored().slots.deposition).toBe("deposit-wet");
    expect(stored().slots.tip).toBe("tip-chisel-sdf");
    expect(stored().input.pressureGamma).toBe(1.45);
  });

});

