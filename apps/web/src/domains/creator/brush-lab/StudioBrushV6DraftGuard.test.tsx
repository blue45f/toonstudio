// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioBrushV6DraftGuard } from "./StudioBrushV6DraftGuard";
import { createBrushStudioV6Program, type BrushStudioV6Program } from "./brush-studio-v6-engine";
import { serializeBrushStudioV6Authoring } from "./brush-studio-v6-authoring-document";

const storageKey = "toonstudio.brush-program-v6:test";
function sourceDraft() {
  const program = { ...createBrushStudioV6Program("mixbox-pigment-spray"), licenseProfile: "noncommercial-full" as const };
  const source = JSON.parse(serializeBrushStudioV6Authoring(program));
  source.materialReceipt.runtime.bindings = source.materialReceipt.runtime.bindings.map((binding: { nodeIds: string[] }) =>
    binding.nodeIds.includes("pigment-mixbox") ? {
      providerId: "mixbox-js-v2", version: "2.0.0", license: "CC-BY-NC-4.0", rights: "noncommercial",
      execution: "native", nodeIds: ["pigment-mixbox"],
    } : binding);
  return source;
}
function AutosavingEditor({ program }: { readonly program: BrushStudioV6Program }) {
  useEffect(() => localStorage.setItem(storageKey, serializeBrushStudioV6Authoring(program)), [program]);
  return <output data-testid="restored-editor">{program.id}</output>;
}
const view = () => <StudioBrushV6DraftGuard scope="test">{(program) => <AutosavingEditor program={program} />}</StudioBrushV6DraftGuard>;
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("이전 Mixbox 초안의 명시적 자체 안료 이주", () => {
  it("사용자가 선택하기 전에는 자동 저장을 열지 않고 이주 전에 원문 백업을 확인한다", () => {
    const raw = JSON.stringify(sourceDraft(), null, 2);
    localStorage.setItem(storageKey, raw);
    render(view());
    expect(screen.queryByTestId("restored-editor")).toBeNull();
    expect(localStorage.getItem(storageKey)).toBe(raw);
    fireEvent.click(screen.getByRole("button", { name: "자체 안료로 가져오기" }));
    expect(screen.getByTestId("restored-editor").textContent).toBe("mixbox-pigment-spray");
    expect(localStorage.getItem(`${storageKey}:source-mixbox`)).toBe(raw);
    const current = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    expect(current.materialReceipt.runtime.bindings.some((binding: { providerId: string }) => binding.providerId === "mixbox-js-v2")).toBe(false);
  });

  it("백업에 실패하면 원문을 덮어쓰는 편집기를 열지 않는다", () => {
    const raw = JSON.stringify(sourceDraft());
    localStorage.setItem(storageKey, raw);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    render(view());
    fireEvent.click(screen.getByRole("button", { name: "자체 안료로 가져오기" }));
    expect(screen.queryByTestId("restored-editor")).toBeNull();
    expect(localStorage.getItem(storageKey)).toBe(raw);
    expect(screen.getAllByRole("alert").some((alert) => alert.textContent?.includes("quota"))).toBe(true);
  });

  it("불러온 뒤 다른 초안으로 변경되면 오래된 원본을 적용하지 않는다", () => {
    localStorage.setItem(storageKey, JSON.stringify(sourceDraft()));
    render(view());
    localStorage.setItem(storageKey, "newer-original");
    fireEvent.click(screen.getByRole("button", { name: "자체 안료로 가져오기" }));
    expect(screen.queryByTestId("restored-editor")).toBeNull();
    expect(localStorage.getItem(storageKey)).toBe("newer-original");
  });

  it("다른 제공자가 손상된 초안은 자체 안료 이주로 우회하지 않는다", () => {
    const source = sourceDraft();
    source.materialReceipt.runtime.bindings[0].version = "future";
    const raw = JSON.stringify(source);
    localStorage.setItem(storageKey, raw);
    render(view());
    expect(screen.queryByRole("button", { name: "자체 안료로 가져오기" })).toBeNull();
    expect(screen.queryByTestId("restored-editor")).toBeNull();
    expect(localStorage.getItem(storageKey)).toBe(raw);
  });

  it.each([false, true])("실행 기록 없는 이전 초안도 wrapper=%s 원문을 백업한 뒤에만 편집기를 연다", (wrapped) => {
    const base = createBrushStudioV6Program();
    const program = { ...base, slots: { ...base.slots, pigment: "pigment-mixbox" } };
    const source = { ...JSON.parse(serializeBrushStudioV6Authoring(program)), materialReceipt: null };
    const raw = JSON.stringify(wrapped ? { program: source } : source, null, 2);
    localStorage.setItem(storageKey, raw);
    render(view());
    expect(screen.queryByTestId("restored-editor")).toBeNull();
    expect(localStorage.getItem(storageKey)).toBe(raw);
    fireEvent.click(screen.getByRole("button", { name: "자체 안료로 가져오기" }));
    expect(screen.getByTestId("restored-editor").textContent).toBe(program.id);
    expect(localStorage.getItem(`${storageKey}:source-mixbox`)).toBe(raw);
    const current = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    expect(current.materialReceipt.runtime.bindings.some((binding: { providerId: string }) => binding.providerId === "toonstudio-latent-pigment-v1")).toBe(true);
    expect(current.slots).toEqual(program.slots);
    expect(current.tuning).toEqual(program.tuning);
  });
});
