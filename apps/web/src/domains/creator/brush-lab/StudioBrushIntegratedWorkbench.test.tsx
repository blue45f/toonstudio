// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { StudioBrushIntegratedWorkbench } from "./StudioBrushIntegratedWorkbench";
import { createBrushStudioV6Program, type BrushStudioV6Program } from "./brush-studio-v6-engine";

const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("./brush-studio-saved-material-loader", () => ({ loadBrushStudioSavedMaterial: load }));
vi.mock("../MarketplaceBrushStudioBridge", () => ({ MarketplaceBrushStudioBridge: () => null }));
vi.mock("./StudioBrushV6Workbench", () => ({
  StudioBrushV6Workbench: ({ scope, initialProgram }: { scope: string; initialProgram?: BrushStudioV6Program }) =>
    <output data-testid="editor">{scope} · {initialProgram?.name ?? "stored-draft"}</output>,
}));
beforeEach(() => { localStorage.clear(); load.mockReset(); });
afterEach(cleanup);
const view = (scope: string) => <MemoryRouter><StudioBrushIntegratedWorkbench scope={scope} /></MemoryRouter>;

describe("saved material editor routing", () => {
  it("waits for the exact saved brush instead of mounting an autosaving default", async () => {
    let finish!: (value: { program: BrushStudioV6Program; persistent: boolean }) => void;
    load.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(view("brush:saved"));
    expect(screen.queryByTestId("editor")).toBeNull();
    expect(load).toHaveBeenCalledWith("saved");
    const program = { ...createBrushStudioV6Program(), name: "정확한 원본" };
    await act(async () => { finish({ program, persistent: true }); });
    expect(screen.getByTestId("editor").textContent).toContain("정확한 원본");
  });
  it("reports missing originals without substituting a recipe", async () => {
    load.mockRejectedValue(new Error("원본 없음"));
    render(view("brush:missing"));
    expect((await screen.findByRole("alert")).textContent).toContain("원본 없음");
    expect(screen.queryByTestId("editor")).toBeNull();
    expect(localStorage.length).toBe(0);
  });
  it("leaves existing draft validation to the guarded editor", () => {
    localStorage.setItem("toonstudio.brush-program-v6:brush%3Aexisting", "corrupt-original");
    render(view("brush:existing"));
    expect(load).not.toHaveBeenCalled();
    expect(screen.getByTestId("editor")).toBeTruthy();
    expect(localStorage.getItem("toonstudio.brush-program-v6:brush%3Aexisting")).toBe("corrupt-original");
  });
  it("ignores a late original after navigating to a different editor", async () => {
    let finish!: (value: { program: BrushStudioV6Program; persistent: boolean }) => void;
    load.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const opened = render(view("brush:first"));
    opened.rerender(view("draft"));
    await act(async () => { finish({ program: { ...createBrushStudioV6Program(), name: "오래된 원본" }, persistent: true }); });
    expect(screen.getByTestId("editor").textContent).toBe("draft · stored-draft");
  });
  it("preserves a newer draft that appeared while the library read was pending", async () => {
    let finish!: (value: { program: BrushStudioV6Program; persistent: boolean }) => void;
    load.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    render(view("brush:saved"));
    localStorage.setItem("toonstudio.brush-program-v6:brush%3Asaved", "new-draft");
    await act(async () => { finish({ program: createBrushStudioV6Program(), persistent: true }); });
    expect(screen.getByTestId("editor").textContent).toBe("brush:saved · stored-draft");
    expect(localStorage.getItem("toonstudio.brush-program-v6:brush%3Asaved")).toBe("new-draft");
  });
  it("기존 외부 안료의 원본은 사용자 이주 선택 전까지 편집기에 넘기지 않는다", async () => {
    const program = { ...createBrushStudioV6Program("mixbox-pigment-spray"), name: "이전 원본" };
    load.mockResolvedValue({ program, persistent: true, migration: { sourceSavedBrush: "original-source" } });
    render(view("brush:saved"));
    const migrate = await screen.findByRole("button", { name: "자체 안료로 가져오기" });
    expect(screen.queryByTestId("editor")).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(screen.getByRole("button", { name: "원본 파일 내려받기" })).toBeTruthy();
    fireEvent.click(migrate);
    expect(screen.getByTestId("editor").textContent).toContain("이전 원본");
    expect(screen.getAllByRole("status").some((status) => status.textContent?.includes("자체 잠재 안료"))).toBe(true);
  });

  it("이주 확인 중 생긴 새 초안을 이전 브러시로 덮어쓰지 않는다", async () => {
    load.mockResolvedValue({ program: createBrushStudioV6Program("mixbox-pigment-spray"), persistent: true,
      migration: { sourceSavedBrush: "original-source" } });
    render(view("brush:saved"));
    const migrate = await screen.findByRole("button", { name: "자체 안료로 가져오기" });
    localStorage.setItem("toonstudio.brush-program-v6:brush%3Asaved", "newer-draft");
    fireEvent.click(migrate);
    expect(screen.getByTestId("editor").textContent).toBe("brush:saved · stored-draft");
    expect(localStorage.getItem("toonstudio.brush-program-v6:brush%3Asaved")).toBe("newer-draft");
  });

  it("카탈로그에서 현재 선택된 제품 브러시 카드를 aria-current=true로 표시하고 다시 클릭하면 변경된 초안을 해당 레시피로 다시 초기화한다", async () => {
    const { StudioBrushProductCataloguePanel } = await import("./StudioBrushProductCataloguePanel");
    const { BRUSH_QUALITY_CATALOG } = await import("./brush-studio-v5-quality-catalog");
    const { resolveProductBrushV6RecipeId } = await import("./brush-studio-version-integration");
    const first = BRUSH_QUALITY_CATALOG.find((item) => resolveProductBrushV6RecipeId(item))!;
    const recipeId = resolveProductBrushV6RecipeId(first)!;
    render(
      <MemoryRouter initialEntries={[`/studio/assets/brushes/new?applyRecipe=1&productBrush=${first.id}&recipe=${recipeId}`]}>
        <StudioBrushProductCataloguePanel baseHref="/studio/assets/brushes/new" />
        <StudioBrushIntegratedWorkbench scope="new" />
      </MemoryRouter>,
    );
    const card = document.querySelector(`[data-studio-brush-product-target="${first.id}"]`) as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.getAttribute("aria-current")).toBe("true");
    localStorage.setItem("toonstudio.brush-program-v6:new", "modified-by-user");
    fireEvent.click(card);
    expect(localStorage.getItem("toonstudio.brush-program-v6:new")).not.toBe("modified-by-user");
    expect(localStorage.getItem("toonstudio.brush-program-v6:new")).toContain(recipeId);
  });
});
